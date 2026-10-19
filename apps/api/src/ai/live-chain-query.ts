import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PostgresService } from '../database/postgres.service';
import type { AgentClaim, AgentContext, AgentTrace } from './agents/agent.types';
import type { AiQueryRequest, AiQueryResponse } from './ai.dto';
import { ToolRegistry } from './tools/tool-registry';
import type { LiveChainInput, LiveChainOutput } from './tools/onchain/live-chain.tools';

export function asksLiveChain(question: string): boolean {
  return /\b(?:block[ -]?chain|blockchiain|blockchian|on[ -]?chain|cyberchain|rpc)\b/i.test(question);
}

type LiveAnswer = AiQueryResponse & {
  toolsUsed: string[]; agentsUsed: string[]; agentTrace: AgentTrace[];
  claims: AgentClaim[]; abstained: boolean; errors: string[]; llmCalls: number; embeddingCalls: number;
};

@Injectable()
export class LiveChainQuery {
  constructor(private readonly tools: ToolRegistry, private readonly postgres: PostgresService) {}

  async answer(request: AiQueryRequest, context: AgentContext): Promise<LiveAnswer> {
    const started = Date.now();
    const response: LiveAnswer = {
      runId: randomUUID(), system: request.system, answer: '', evidence: [], retrieval: [], latencyMs: 0,
      toolsUsed: [], agentsUsed: ['provenance'], agentTrace: [], claims: [], abstained: true,
      errors: [], llmCalls: 0, embeddingCalls: 0,
    };
    try {
      if (context.scopeConflict) { response.answer = context.scopeConflict; return response; }
      if (request.datasetVersion || request.policyVersion) {
        response.answer = 'Live CyberChain queries read current chain state. Remove dataset/policy version filters to continue.';
        return response;
      }
      const question = request.question;
      const countQuestion = /\b(?:how many|number of|count|total)\s+(?:[a-z]+\s+)?proposals\b|\bproposal count\b/i.test(question);
      const explicitId = question.match(/\bproposal\s+#?(\d+)\b/i)?.[1];
      const transactionHash = question.match(/\b0x[0-9a-f]{64}\b/i)?.[0];
      const global = countQuestion || /\b(?:what (?:do )?we have|contract overview|all proposals)\b/i.test(question);
      const proposalId = global ? undefined : context.onChainProposalId ?? explicitId;
      if (!global && context.localProposalId && !proposalId && !transactionHash) {
        response.answer = 'This selected proposal has no on-chain ID. It cannot be read from CyberChain until it is published.';
        return response;
      }
      const input: LiveChainInput = {
        ...(proposalId ? { onChainProposalId: proposalId } : {}),
        ...(transactionHash ? { transactionHash } : {}),
        includeEvents: /\b(?:events?|records?|transactions?|timeline|history|what (?:do )?we have)\b/i.test(question),
        ...(global && !countQuestion ? { includeProposals: true } : {}),
      };
      if (/\b(?:member|wallet|voter|vot(?:e|ed|ing)|assigned)\b/i.test(question)) {
        const address = question.match(/\b0x[0-9a-f]{40}\b/i)?.[0];
        if (address) input.memberAddress = address;
      }
      const { result, call } = await this.tools.invoke('provenance', 'fetchLiveCyberChain', input);
      const live = result as LiveChainOutput;
      if (proposalId && ((context.chainId && BigInt(context.chainId).toString() !== live.chainId) ||
          (context.contractAddress && context.contractAddress.toLowerCase() !== live.contractAddress.toLowerCase())))
        throw new Error('The selected proposal belongs to a different chain or governance contract.');
      response.toolsUsed = ['fetchLiveCyberChain'];
      response.agentTrace.push({ agent: 'provenance', ...call, status: 'success', evidenceIds: live.evidenceIds, latencyMs: call.latencyMs ?? 0 });
      const snapshotId = live.evidenceIds[0];
      response.evidence = [{ chunkEvidenceId: snapshotId, artefactEvidenceId: '', filename: null, proposalId: proposalId ? context.localProposalId ?? null : null,
        content: `[C1] Fresh CyberChain RPC snapshot\n${JSON.stringify(live)}`, score: 1, rank: 1,
        evidenceId: snapshotId, sourceType: 'ON_CHAIN_RPC', data: live },
        ...live.events.slice(0, 50).map((event, index) => ({ chunkEvidenceId: event.evidenceId, artefactEvidenceId: '',
          proposalId: context.localProposalId ?? null, filename: null, content: JSON.stringify(event), score: 1, rank: index + 2,
          evidenceId: event.evidenceId, sourceType: 'ON_CHAIN_EVENT', data: event }))];
      const lines = [`Fresh CyberChain RPC read at block ${live.blockNumber} (${live.blockTimestamp}). [C1]`,
        `Chain ${live.chainId}; governance contract ${live.contractAddress}.`];
      if (countQuestion || !live.proposal) {
        lines.push(`The contract contains ${live.proposalCount} on-chain proposals across its DAOs (drafts are excluded). [C1]`);
        if (countQuestion && /\b(?:active|pending|closed|cancelled|finalized|this dao|selected dao)\b/i.test(question))
          lines.push('This is the whole-contract total; a filtered status or DAO count has not been computed.');
      }
      if (live.proposals) {
        lines.push(`Latest ${live.proposals.length} of ${live.proposalCount} on-chain proposals (by proposal ID): [C1]`,
          ...live.proposals.map(p => `#${p.id}: ${p.state}; ${p.voteCount} votes; ${p.assignedMemberCount} assigned members. [C1]`));
      }
      if (live.proposal) {
        const p = live.proposal;
        lines.push(`Proposal #${p.id}: ${p.state}; ${p.voteCount} vote${p.voteCount === 1 ? '' : 's'}; ${p.assignedMemberCount} currently assigned members. [C1]`,
          `Voting: ${p.startsAt} to ${p.endsAt}. Finalized: ${p.finalized ? 'yes' : 'no'}. [C1]`,
          `Votes by option index: ${p.optionVotes.map((votes, index) => `${index}: ${votes}`).join(', ')}. [C1]`);
        if (p.finalized) lines.push(p.tied ? 'The finalized result is tied. [C1]' : `Winning option index: ${p.winningOption}. [C1]`);
      }
      if (live.member) lines.push(`Wallet ${live.member.address}: currently assigned ${live.member.assigned ? 'yes' : 'no'}; has voted ${live.member.hasVoted ? 'yes' : 'no'}. [C1]`);
      if (live.receipt) lines.push(`Transaction ${live.receipt.transactionHash}: ${live.receipt.status}, mined at block ${live.receipt.blockNumber}. [C1]`);
      if (live.eventCoverage) {
        const coverage = live.eventCoverage;
        lines.push(`Found ${live.events.length} matching governance events in blocks ${coverage.fromBlock}–${coverage.toBlock}. ${coverage.completeHistory ? 'This covers the configured deployment history.' : 'This is a recent block window, not a complete historical event list.'} [C1]`);
      }
      if (live.events.length) {
        lines.push(...live.events.slice(-10).map(e => `${e.name}${e.args.proposalId ? ` for proposal #${e.args.proposalId}` : ''}: transaction ${e.transactionHash}, block ${e.blockNumber}. [C1]`));
        if (live.events.length > 10) lines.push('Showing the latest 10 matching events; the snapshot evidence contains the fetched records.');
      }
      if (/\b(?:cross[ -]?check|verif(?:y|ication)|compare|check against|match)\b/i.test(question) && live.proposal && context.localProposalId) {
        try {
          const comparison = await this.compareStored(context.localProposalId, live);
          lines.push(comparison.text);
          if (comparison.checks) {
            const evidenceId = `structured:live-comparison:${response.runId}`;
            response.evidence.push({ chunkEvidenceId: evidenceId, artefactEvidenceId: '', filename: null,
              proposalId: context.localProposalId, content: `[DB1] Stored records compared with [C1]\n${JSON.stringify(comparison.checks)}`,
              score: 1, rank: response.evidence.length + 1,
              evidenceId, sourceType: 'STRUCTURED_DB', data: comparison.checks });
          }
        } catch {
          lines.push('Fresh chain facts are available above, but the database comparison could not be completed. No match is claimed.');
        }
      }
      lines.push(`Snapshot block hash: ${live.blockHash}. Fetched at ${live.fetchedAt}.`);
      response.answer = lines.join('\n\n');
      response.claims = [{ text: `Live governance snapshot at CyberChain block ${live.blockNumber}.`, type: 'FACTUAL', evidenceIds: live.evidenceIds }];
      response.abstained = false;
    } catch (error) {
      // Never answer an explicit live request using indexed data after a failed RPC read.
      response.answer = 'Could not complete the fresh CyberChain check. No cached blockchain answer was substituted. Please retry.';
      const message = error instanceof Error ? error.message : 'Live CyberChain query failed.';
      response.errors.push(message);
      response.agentTrace.push({ agent: 'provenance', tool: 'fetchLiveCyberChain', status: 'error', evidenceIds: [], latencyMs: Date.now() - started, error: message });
      response.evidence = [];
      response.claims = [];
    } finally { response.latencyMs = Date.now() - started; }
    return response;
  }

  private async compareStored(localId: string, live: LiveChainOutput): Promise<{text: string; checks?: string[][]}> {
    const db = this.postgres.database;
    const [proposal, votes, members] = await Promise.all([
      db.selectFrom('proposals').select(['metadata_hash', 'starts_at', 'ends_at']).where('id', '=', localId).executeTakeFirst(),
      db.selectFrom('votes').select(eb => eb.fn.countAll<string>().as('total')).where('proposal_id', '=', localId).executeTakeFirstOrThrow(),
      db.selectFrom('proposal_assignments').select(eb => eb.fn.countAll<string>().as('total')).where('proposal_id', '=', localId).where('assigned', '=', true).executeTakeFirstOrThrow(),
    ]);
    if (!proposal) return { text: 'No local proposal record was available for comparison; the facts above come from fresh RPC only.' };
    const p = live.proposal!;
    const checks = [
      ['vote records', String(votes.total), String(p.voteCount)],
      ['assigned members', String(members.total), String(p.assignedMemberCount)],
      ['voting start', new Date(proposal.starts_at).toISOString(), p.startsAt],
      ['voting end', new Date(proposal.ends_at).toISOString(), p.endsAt],
      ...(proposal.metadata_hash ? [['metadata hash', proposal.metadata_hash.toLowerCase(), p.metadataHash.toLowerCase()]] : []),
    ];
    return { checks, text: 'Database cross-check (the database can lag the chain): ' + checks.map(([name, stored, chain]) =>
      `${name}: ${stored === chain ? 'MATCH' : 'DIFFERENT'} (stored ${stored}; live ${chain})`).join('; ') + '. [C1][DB1]' };
  }
}
