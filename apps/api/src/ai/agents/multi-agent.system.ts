import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaClient } from '../ollama.client';
import { ToolRegistry, withTimeout } from './tool-registry';
import type {
  AgentClaim,
  AgentContext,
  AgentEvidence,
  AgentExecutionPlan,
  AgentResult,
  AgentTask,
  AgentTrace,
  MultiAgentResponse,
  ResearchSystem,
  VerificationItem,
  VerificationStatus,
} from './agent.types';

type AgentInput = Omit<AgentContext, 'topK'> & { topK?: number };

@Injectable()
export class MultiAgentSystem {
  private readonly maxSteps: number;
  private readonly maxLlmCalls: number;
  private readonly overallTimeout: number;

  constructor(
    private readonly tools: ToolRegistry,
    private readonly ollama: OllamaClient,
    config: ConfigService,
  ) {
    this.maxSteps = config.get<number>('MAX_AGENT_STEPS', 8);
    this.maxLlmCalls = config.get<number>('MAX_LLM_CALLS', 2);
    this.overallTimeout = config.get<number>('AGENT_REQUEST_TIMEOUT_MS', 120_000);
  }

  execute(input: AgentInput): Promise<MultiAgentResponse> {
    return withTimeout(this.run(input, 'multi-agent', true), this.overallTimeout, 'Multi-agent request');
  }

  executeHybrid(input: AgentInput, verified: boolean): Promise<MultiAgentResponse> {
    return withTimeout(this.run(input, verified ? 'hybrid-verified' : 'hybrid', verified), this.overallTimeout, 'Hybrid request');
  }

  private async run(input: AgentInput, system: ResearchSystem, verified: boolean): Promise<MultiAgentResponse> {
    const started = Date.now();
    const runId = randomUUID();
    const trace: AgentTrace[] = [];
    const errors: string[] = [];
    let llmCalls = 0;
    let embeddingCalls = 0;
    const context: AgentContext = {
      ...input,
      proposalId: input.localProposalId ?? input.proposalId,
      localProposalId: input.localProposalId ?? input.proposalId,
      topK: Math.max(1, Math.min(input.topK ?? 5, 20)),
    };

    if (context.scopeConflict) {
      trace.push({ agent: 'coordinator', action: 'scope-conflict', status: 'skipped', evidenceIds: [], latencyMs: 0 });
      return this.response(runId, system, verified, context.scopeConflict, [], [], [], trace, errors, started, 0, 0, false, 'UNSUPPORTED');
    }
    if (!context.localProposalId && /\b(?:this|the) proposal\b/i.test(context.question)) {
      trace.push({ agent: 'coordinator', action: 'proposal-scope-required', status: 'skipped', evidenceIds: [], latencyMs: 0 });
      return this.response(runId, system, verified, 'Select a proposal scope before asking about this proposal.', [], [], [], trace, errors, started, 0, 0, false, 'UNSUPPORTED');
    }

    const routeStart = Date.now();
    const plan = this.route(context);
    trace.push({ agent: 'coordinator', action: `route:${plan.intent}`, status: 'success', evidenceIds: [], latencyMs: Date.now() - routeStart });
    if (plan.tasks.length > this.maxSteps) throw new Error(`Execution plan exceeds MAX_AGENT_STEPS (${this.maxSteps})`);

    const settled = await Promise.allSettled(plan.tasks.map((task) => this.executeTask(task, context)));
    const results: AgentResult[] = [];
    for (let i = 0; i < settled.length; i++) {
      const item = settled[i]!;
      const task = plan.tasks[i]!;
      if (item.status === 'fulfilled') {
        results.push(item.value);
        trace.push(...item.value.toolCalls.map((call) => ({
          agent: item.value.agent,
          tool: call.tool,
          status: call.status ?? 'success' as const,
          evidenceIds: call.evidenceIds ?? [],
          latencyMs: call.latencyMs ?? item.value.latencyMs,
          error: call.error,
        })));
        if (item.value.agent === 'rag') embeddingCalls++;
      } else {
        const message = item.reason instanceof Error ? item.reason.message : String(item.reason);
        const failedCall = (item.reason as { toolCall?: { tool: string; latencyMs?: number } }).toolCall;
        errors.push(`${task.agent}: ${message}`);
        trace.push({ agent: task.agent, tool: failedCall?.tool, status: 'error', evidenceIds: [], latencyMs: failedCall?.latencyMs ?? 0, error: message });
        if (task.required) return this.abstain(runId, system, verified, trace, errors, started, llmCalls, embeddingCalls, results);
      }
    }

    const evidence = dedupe(results.flatMap((result) => result.evidence));
    const rag = results.find((result) => result.agent === 'rag');
    if (rag && ((rag.facts?.chunks as unknown[])?.length ?? 0) === 0) {
      if (system === 'multi-agent' && isOverviewQuestion(context.question) && results.some((result) => result.agent === 'sql')) {
        const overview = deterministicOverviewWithoutDocuments(context, results);
        const verification = this.verify(context, overview.claims, results, evidence);
        trace.push(verification.trace);
        return this.response(runId, system, true, overview.answer, results, evidence, overview.claims, trace, errors, started, llmCalls, embeddingCalls, false, verification.status, verification.items);
      }
      if (!results.some((result) => result.agent === 'sql')) return this.response(runId, system, verified, 'No indexed document evidence was found for this proposal.', results, evidence, [], trace, errors, started, llmCalls, embeddingCalls, true, 'UNSUPPORTED');
    }

    let answer = '';
    let claims: AgentClaim[] = [];
    const requiresSynthesis = system !== 'multi-agent' || plan.requiresSynthesis;
    if (requiresSynthesis) {
      try {
        const synthesis = await this.synthesize(context, results, evidence);
        llmCalls++;
        answer = synthesis.answer;
        claims = synthesis.claims;
        trace.push(synthesis.trace);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`synthesis: ${message}`);
        return this.abstain(runId, system, verified, trace, errors, started, llmCalls, embeddingCalls, results, evidence);
      }
    } else {
      ({ answer, claims } = deterministicAnswer(context, results));
    }

    if (!verified) return this.response(runId, system, false, answer, results, evidence, claims, trace, errors, started, llmCalls, embeddingCalls, !answer.trim(), 'SUPPORTED', [], 0, requiresSynthesis);

    let verification = this.verify(context, claims, results, evidence);
    trace.push(verification.trace);
    if (verification.status === 'UNSUPPORTED' && requiresSynthesis && llmCalls < this.maxLlmCalls) {
      try {
        const corrected = await this.synthesize(context, results, evidence, verification.items);
        llmCalls++;
        answer = corrected.answer;
        claims = corrected.claims;
        trace.push(corrected.trace);
        verification = this.verify(context, claims, results, evidence);
        verification.correctionRounds = 1;
        trace.push(verification.trace);
      } catch (error) {
        errors.push(`correction: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const abstained = !answer.trim() || verification.status === 'UNSUPPORTED';
    if (abstained) answer = 'Insufficient verified evidence to answer this question.';
    return this.response(runId, system, true, answer, results, evidence, claims, trace, errors, started, llmCalls, embeddingCalls, abstained, verification.status, verification.items, verification.correctionRounds, requiresSynthesis);
  }

  private route(context: AgentContext): AgentExecutionPlan {
    const q = context.question.toLowerCase();
    const complete = /complete governance analysis|full governance analysis/.test(q);
    const overview = complete || /summar(?:y|ize)|overview|information about (?:this|the) proposal|tell me about (?:this|the) proposal|what is (?:this|the) proposal about|what happened with (?:this|the) proposal/.test(q);
    const voteCount = /how many votes|vote count|number of votes/.test(q);
    const semantic = overview || /why|risks?|summar(?:y|ize)|explain (?:this|the) proposal|documents?|objectives?|budget/.test(q);
    const compliance = complete || /quorum|compliance|eligible|eligibility|voting window|before|after|duplicate|unique|integrity|lifecycle/.test(q);
    const provenance = complete || /blockchain evidence|transaction|proof|provenance|supporting evidence/.test(q);
    const temporal = /when did voting (?:end|start)|timeline|voting end|voting start/.test(q);
    const factual = voteCount || /\bvotes?\b|state|status|finalized|members?/.test(q);
    const usesSql = overview || factual || temporal || compliance || provenance;
    const tasks: AgentTask[] = [];

    if (usesSql) tasks.push({ id: 'sql', agent: 'sql', required: true, dependsOn: [] });
    if (semantic) tasks.push({ id: 'rag', agent: 'rag', required: true, dependsOn: [] });
    if (compliance) tasks.push({ id: 'compliance', agent: 'compliance', required: true, dependsOn: [] });
    if (provenance || context.datasetVersion) tasks.push({ id: 'provenance', agent: 'provenance', required: true, dependsOn: [] });

    let intent: AgentExecutionPlan['intent'] = 'unsupported';
    if (semantic && usesSql) intent = 'mixed';
    else if (semantic) intent = 'semantic';
    else if (compliance) intent = 'compliance';
    else if (provenance) intent = 'provenance';
    else if (temporal) intent = 'temporal';
    else if (factual) intent = 'factual';

    return {
      intent,
      tasks,
      requiresSynthesis: semantic || compliance || temporal || (factual && !voteCount && !provenance),
      reason: `Deterministic keyword route selected ${tasks.map((task) => task.agent).join(', ') || 'no agents'}.`,
    };
  }

  private async executeTask(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const calls: AgentResult['toolCalls'] = [];
    const evidence: AgentEvidence[] = [];
    const facts: Record<string, any> = {};
    const proposalId = context.localProposalId ?? context.proposalId ?? extractProposalId(context.question);
    const invoke = async (name: string, args: Record<string, unknown>) => {
      const value = await this.tools.invoke(task.agent, name, args);
      calls.push({ ...value.call, evidenceIds: findEvidenceIds(value.result) });
      return value.result as any;
    };

    if (task.agent === 'sql') {
      const q = context.question.toLowerCase();
      const overview = /summar(?:y|ize)|overview|information about (?:this|the) proposal|tell me about (?:this|the) proposal|what is (?:this|the) proposal about|what happened with (?:this|the) proposal/.test(q);
      facts.proposal = await invoke('getProposal', { proposalId });
      if (overview || /how many votes|vote count|number of votes|\bvotes?\b|quorum/.test(q)) facts.votes = await invoke('getProposalVotes', { proposalId });
      if (overview || /when did voting (?:end|start)|timeline|voting end|voting start|finalized/.test(q)) facts.timeline = await invoke('getProposalTimeline', { proposalId });
      addSqlEvidence(facts, proposalId, evidence);
    } else if (task.agent === 'rag') {
      const rows = await invoke('vectorSearch', { question: context.question, proposalId, topK: context.topK });
      facts.chunks = rows;
      for (const row of rows as any[]) {
        evidence.push({ evidenceId: row.artefactEvidenceId, sourceType: 'ARTEFACT', proposalId, data: { filename: row.filename, valid: true } });
        evidence.push({ evidenceId: row.chunkEvidenceId, sourceType: 'DOCUMENT_CHUNK', proposalId, content: row.content, score: row.score, data: { artefactEvidenceId: row.artefactEvidenceId, valid: true } });
      }
    } else if (task.agent === 'compliance') {
      const q = context.question.toLowerCase();
      const all = /compliance|complete governance analysis|full governance analysis/.test(q);
      if (/quorum/.test(q) || all) facts.quorum = await invoke('calculateQuorum', { proposalId, policyVersion: context.policyVersion });
      if (/window|before|after/.test(q) || all) facts.votingWindow = await invoke('checkVotingWindow', { proposalId, memberAddress: extractAddress(context.question) });
      if (/eligible|eligibility/.test(q) || all) facts.eligibility = await invoke('checkMemberEligibility', { proposalId, ...(extractAddress(context.question) ? { memberAddress: extractAddress(context.question) } : {}) });
      if (/integrity|evidence/.test(q) || all) facts.evidenceIntegrity = await invoke('checkEvidenceIntegrity', { proposalId });
      if (/lifecycle|transition|finalized/.test(q) || all) facts.lifecycle = await invoke('checkLifecycleTransitions', { proposalId });
      if (/duplicate|unique|replacement/.test(q) || all) facts.voteUniqueness = await invoke('checkVoteUniqueness', { proposalId });
      for (const value of Object.values(facts)) {
        if (!value?.ruleId) continue;
        evidence.push({ evidenceId: `compliance:${value.ruleId}:${proposalId}`, sourceType: 'COMPLIANCE', proposalId, data: { ...value, valid: value.result !== 'INDETERMINATE' } });
        addEventEvidence(value.evidenceIds, proposalId, evidence);
      }
    } else if (task.agent === 'provenance') {
      const base = await invoke('getProposalEvidence', { proposalId });
      const ids = (base.evidenceIds ?? []) as string[];
      const validated = await Promise.all(ids.map((id) => invoke('getEvidenceById', { evidenceId: id, datasetVersion: context.datasetVersion })));
      facts.evidence = validated;
      for (const item of validated) evidence.push({ evidenceId: item.evidenceId, sourceType: normalizeSourceType(item.sourceType), proposalId, data: item });
    }

    return { agent: task.agent, facts, evidence: dedupe(evidence), toolCalls: calls, latencyMs: Date.now() - start };
  }

  private async synthesize(context: AgentContext, results: AgentResult[], evidence: AgentEvidence[], corrections?: VerificationItem[]) {
    const start = Date.now();
    const payload = {
      question: context.question,
      proposalContext: {
        proposalId: context.proposalId,
        localProposalId: context.localProposalId,
        onChainProposalId: context.onChainProposalId,
        chainId: context.chainId,
        contractAddress: context.contractAddress,
        datasetVersion: context.datasetVersion,
      },
      validatedAgentOutputs: results.map((result) => ({ agent: result.agent, facts: result.facts })),
      evidence: evidence.map((item) => ({ evidenceId: item.evidenceId, sourceType: item.sourceType, content: item.content, data: item.data })),
      corrections,
    };
    const response = await this.ollama.chat([
      { role: 'system', content: 'Answer only from the supplied evidence. Combine structured/on-chain facts with document facts when both are present. Return JSON only: {"answer":"...","claims":[{"text":"...","type":"FACTUAL|NUMERIC|TEMPORAL|SEMANTIC|COMPLIANCE","evidenceIds":["..."]}]}. Semantic claims may cite DOCUMENT_CHUNK evidence. Vote counts must cite vote or structured vote-summary evidence. Finalization claims must cite ProposalFinalized or structured proposal evidence. Never invent evidence IDs.' },
      { role: 'user', content: JSON.stringify(payload) },
    ], { json: true, maxTokens: 768 });
    let structured: {answer:string;claims:AgentClaim[]};
    try { structured = parseSynthesis(response.content); }
    catch { structured = deterministicSynthesisFallback(context, results); }
    const parsed = augmentSynthesis(structured, context, results);
    parsed.claims = groundClaims(parsed.claims, evidence);
    return {
      ...parsed,
      trace: { agent: 'synthesis', action: corrections ? 'correction' : 'synthesize', status: 'success' as const, evidenceIds: parsed.claims.flatMap((claim) => claim.evidenceIds), latencyMs: Date.now() - start, model: this.ollama.getChatModel(), inputTokens: response.inputTokens, outputTokens: response.outputTokens },
    };
  }

  private verify(context: AgentContext, claims: AgentClaim[], results: AgentResult[], evidence: AgentEvidence[]) {
    const start = Date.now();
    const known = new Map(evidence.map((item) => [item.evidenceId, item]));
    const sqlFacts = results.find((result) => result.agent === 'sql')?.facts as any;
    const items: VerificationItem[] = claims.map((claim) => {
      const reasons: string[] = [];
      const resolved = claim.evidenceIds.map((id) => known.get(id)).filter(Boolean) as AgentEvidence[];
      if (!claim.evidenceIds.length || resolved.length !== claim.evidenceIds.length) reasons.push('One or more cited evidence IDs are missing.');
      if (context.localProposalId && resolved.some((item) => item.proposalId && item.proposalId !== context.localProposalId)) reasons.push('Evidence is outside the requested proposal scope.');
      if (resolved.some((item) => (item.data as any)?.valid === false)) reasons.push('One or more cited evidence records are invalid.');
      if (claim.type === 'NUMERIC' && sqlFacts?.votes?.count !== undefined) {
        const values: string[] = claim.text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
        if (!values.includes(String(sqlFacts.votes.count))) reasons.push('Numerical claim does not match the deterministic vote count.');
        if (!resolved.some((item) => item.sourceType === 'ON_CHAIN_EVENT' || item.evidenceId.startsWith('structured:votes:'))) reasons.push('Vote count lacks deterministic vote evidence.');
      }
      if (claim.type === 'SEMANTIC' && !resolved.some((item) => item.sourceType === 'DOCUMENT_CHUNK' || item.sourceType === 'ARTEFACT')) reasons.push('Semantic claim lacks document evidence.');
      if (claim.type === 'COMPLIANCE' && !resolved.some((item) => item.sourceType === 'COMPLIANCE')) reasons.push('Compliance claim lacks a deterministic compliance result.');
      const status: VerificationStatus = reasons.length === 0 ? 'SUPPORTED' : resolved.length ? 'PARTIALLY_SUPPORTED' : 'UNSUPPORTED';
      return { claim, status, reasons };
    });
    const status: VerificationStatus = items.length === 0 ? 'UNSUPPORTED' : items.some((item) => item.status === 'UNSUPPORTED') ? 'UNSUPPORTED' : items.some((item) => item.status === 'PARTIALLY_SUPPORTED') ? 'PARTIALLY_SUPPORTED' : 'SUPPORTED';
    return { status, items, correctionRounds: 0, trace: { agent: 'verification', action: 'verify-claims', status: 'success' as const, evidenceIds: claims.flatMap((claim) => claim.evidenceIds), latencyMs: Date.now() - start } };
  }

  private abstain(runId: string, system: ResearchSystem, verified: boolean, trace: AgentTrace[], errors: string[], started: number, llmCalls: number, embeddingCalls: number, results: AgentResult[] = [], evidence: AgentEvidence[] = []) {
    return this.response(runId, system, verified, 'Insufficient evidence to answer this question.', results, evidence, [], trace, errors, started, llmCalls, embeddingCalls, true, 'UNSUPPORTED');
  }

  private response(
    runId: string,
    system: ResearchSystem,
    verified: boolean,
    answer: string,
    results: AgentResult[],
    evidence: AgentEvidence[],
    claims: AgentClaim[],
    trace: AgentTrace[],
    errors: string[],
    started: number,
    llmCalls: number,
    embeddingCalls: number,
    abstained: boolean,
    status: VerificationStatus,
    verificationItems: VerificationItem[] = [],
    correctionRounds = 0,
    synthesized = false,
  ): MultiAgentResponse {
    return {
      runId,
      system,
      answer,
      agentsUsed: [...new Set(['coordinator', ...results.map((result) => result.agent), ...(synthesized ? ['synthesis'] : []), ...(verified && results.length ? ['verification'] : [])])],
      toolsUsed: [...new Set(results.flatMap((result) => result.toolCalls.map((call) => call.tool)))],
      evidence,
      retrieval: evidence.filter((item) => item.sourceType === 'DOCUMENT_CHUNK').map((item, index) => ({ chunkEvidenceId: item.evidenceId, score: item.score ?? 0, rank: index + 1 })),
      claims,
      ...(verified ? { verification: { status, claims: verificationItems, correctionRounds } } : {}),
      agentTrace: trace,
      abstained,
      latencyMs: Date.now() - started,
      llmCalls,
      embeddingCalls,
      errors,
    };
  }
}

function extractProposalId(question: string) {
  return question.match(/\bproposal\s+#?([a-z0-9-]+)\b/i)?.[1] ?? '';
}

function extractAddress(question: string) {
  return question.match(/0x[0-9a-f]{40}/i)?.[0]?.toLowerCase();
}

function addSqlEvidence(facts: Record<string, any>, proposalId: string, target: AgentEvidence[]) {
  if (facts.proposal) target.push({ evidenceId: `structured:proposal:${proposalId}`, sourceType: 'STRUCTURED_DB', proposalId, data: { ...facts.proposal, valid: true } });
  if (facts.votes) {
    target.push({ evidenceId: `structured:votes:${proposalId}`, sourceType: 'STRUCTURED_DB', proposalId, data: { count: facts.votes.count, totalVotingPower: facts.votes.totalVotingPower, valid: true } });
    addEventEvidence(facts.votes.evidenceIds, proposalId, target);
  }
  if (facts.timeline) addEventEvidence(facts.timeline.evidenceIds, proposalId, target);
}

function addEventEvidence(ids: unknown, proposalId: string, target: AgentEvidence[]) {
  if (!Array.isArray(ids)) return;
  for (const evidenceId of ids) if (typeof evidenceId === 'string') target.push({ evidenceId, sourceType: 'ON_CHAIN_EVENT', proposalId, data: { valid: true } });
}

function normalizeSourceType(sourceType: string) {
  if (sourceType === 'governance-event') return 'ON_CHAIN_EVENT';
  if (sourceType === 'artefact') return 'ARTEFACT';
  if (sourceType === 'chunk') return 'DOCUMENT_CHUNK';
  return sourceType.toUpperCase();
}

function dedupe(items: AgentEvidence[]) {
  return [...new Map(items.map((item) => [item.evidenceId, item])).values()];
}

function findEvidenceIds(value: unknown): string[] {
  const found: string[] = [];
  const visit = (item: unknown) => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, nested] of Object.entries(item as Record<string, unknown>)) {
      if ((key === 'evidenceId' || key === 'chunkEvidenceId' || key === 'artefactEvidenceId') && typeof nested === 'string') found.push(nested);
      else if (key === 'evidenceIds' && Array.isArray(nested)) found.push(...nested.filter((entry): entry is string => typeof entry === 'string'));
      else visit(nested);
    }
  };
  visit(value);
  return [...new Set(found)];
}

function deterministicAnswer(context: AgentContext, results: AgentResult[]) {
  const facts = results.find((result) => result.agent === 'sql')?.facts as any;
  const count = facts?.votes?.count;
  const id = context.onChainProposalId ?? context.localProposalId ?? extractProposalId(context.question);
  if (/blockchain evidence|transaction|proof|provenance/i.test(context.question) && count !== undefined) {
    const voteEvidenceIds = (facts.votes.evidenceIds ?? []) as string[];
    const answer = voteEvidenceIds.length
      ? `Proposal ${id} has ${voteEvidenceIds.length} on-chain VoteCast evidence record${voteEvidenceIds.length === 1 ? '' : 's'}: ${voteEvidenceIds.join(', ')}.`
      : `No on-chain VoteCast evidence was found for proposal ${id}.`;
    return { answer, claims: [{ text: answer, type: 'FACTUAL' as const, evidenceIds: [`structured:votes:${context.localProposalId ?? context.proposalId}`, ...voteEvidenceIds] }] };
  }
  const answer = count === undefined ? '' : `Proposal ${id} received ${count} vote${count === 1 ? '' : 's'}.`;
  const evidenceIds = count === undefined ? [] : [`structured:votes:${context.localProposalId ?? context.proposalId}`, ...(facts.votes.evidenceIds ?? [])];
  return { answer, claims: count === undefined ? [] : [{ text: answer, type: 'NUMERIC' as const, evidenceIds }] };
}

function deterministicOverviewWithoutDocuments(context: AgentContext, results: AgentResult[]) {
  const facts = results.find((result) => result.agent === 'sql')?.facts as any;
  const proposal = facts?.proposal;
  if (!proposal) return { answer: 'No indexed document evidence was found for this proposal.', claims: [] as AgentClaim[] };
  const id = context.onChainProposalId ?? proposal.on_chain_id ?? context.localProposalId;
  const members = Array.isArray(proposal.members) ? proposal.members.length : 0;
  const voteCount = facts.votes?.count ?? 0;
  const answer = `Proposal ${id}, "${proposal.title}", is ${proposal.status}. Voting runs from ${new Date(proposal.starts_at).toISOString()} to ${new Date(proposal.ends_at).toISOString()}, with ${members} currently eligible member${members === 1 ? '' : 's'} and ${voteCount} recorded vote${voteCount === 1 ? '' : 's'}.\n\nNo indexed document evidence was found for this proposal.`;
  return {answer,claims:[{text:answer.split('\n\n')[0]!,type:'FACTUAL' as const,evidenceIds:[`structured:proposal:${context.localProposalId}`]},{text:`Proposal ${id} has ${voteCount} recorded votes.`,type:'NUMERIC' as const,evidenceIds:[`structured:votes:${context.localProposalId}`,...(facts.votes?.evidenceIds??[])]}]};
}

function isOverviewQuestion(question:string){return /summar(?:y|ize)|overview|information about|tell me about|what is .*proposal about|what happened/i.test(question)}

function groundClaims(claims: AgentClaim[], evidence: AgentEvidence[]): AgentClaim[] {
  const known = new Set(evidence.map((item) => item.evidenceId));
  const byType = (sourceType: string) => evidence.filter((item) => item.sourceType === sourceType).map((item) => item.evidenceId);
  return claims.map((claim) => {
    const valid = claim.evidenceIds.filter((id) => known.has(id));
    if (valid.length) return { ...claim, evidenceIds: valid };
    let candidates: string[] = [];
    if (claim.type === 'SEMANTIC') candidates = byType('DOCUMENT_CHUNK');
    else if (claim.type === 'NUMERIC') candidates = evidence.filter((item) => item.evidenceId.startsWith('structured:votes:') || item.sourceType === 'ON_CHAIN_EVENT').map((item) => item.evidenceId);
    else if (claim.type === 'COMPLIANCE') candidates = byType('COMPLIANCE');
    else if (/status|finaliz|vote|member|date|start|end/i.test(claim.text)) candidates = [...byType('STRUCTURED_DB'), ...byType('ON_CHAIN_EVENT')];
    else candidates = [...byType('DOCUMENT_CHUNK'), ...byType('STRUCTURED_DB')];
    return { ...claim, evidenceIds: candidates.slice(0, 2) };
  });
}

function augmentSynthesis(parsed: { answer: string; claims: AgentClaim[] }, context: AgentContext, results: AgentResult[]) {
  const q = context.question.toLowerCase();
  const facts = results.find((result) => result.agent === 'sql')?.facts as any;
  if (/how many votes|vote count|number of votes/.test(q) && facts?.votes?.count !== undefined) {
    const id = context.onChainProposalId ?? facts.proposal?.on_chain_id ?? context.localProposalId;
    const answer = `Proposal ${id} received ${facts.votes.count} vote${facts.votes.count === 1 ? '' : 's'}.`;
    return { answer, claims: [{ text: answer, type: 'NUMERIC' as const, evidenceIds: [`structured:votes:${context.localProposalId}`, ...(facts.votes.evidenceIds ?? [])] }] };
  }
  if (!/overview|information about|tell me about|what is .*proposal about|what happened|summar/.test(q)) return parsed;
  if (!facts?.proposal) return parsed;
  const proposal = facts.proposal;
  const id = context.onChainProposalId ?? proposal.on_chain_id ?? context.localProposalId;
  const members = Array.isArray(proposal.members) ? proposal.members.length : 0;
  const voteText = facts.votes ? ` It has ${facts.votes.count} recorded vote${facts.votes.count === 1 ? '' : 's'}.` : '';
  const governance = `Proposal ${id}, "${proposal.title}", is ${proposal.status}. Voting runs from ${new Date(proposal.starts_at).toISOString()} to ${new Date(proposal.ends_at).toISOString()}, with ${members} currently eligible member${members === 1 ? '' : 's'}.${voteText}`;
  const claims: AgentClaim[] = [{ text: governance, type: 'FACTUAL', evidenceIds: [`structured:proposal:${context.localProposalId}`] }];
  if (facts.votes) claims.push({ text: `Proposal ${id} has ${facts.votes.count} recorded votes.`, type: 'NUMERIC', evidenceIds: [`structured:votes:${context.localProposalId}`, ...(facts.votes.evidenceIds ?? [])] });
  const documentClaims = parsed.claims.map((claim) => ({ ...claim, type: 'SEMANTIC' as const }));
  return { answer: `${governance}\n\n${parsed.answer}`.trim(), claims: [...claims, ...documentClaims] };
}

function parseSynthesis(content: string): { answer: string; claims: AgentClaim[] } {
  const clean = content.trim().replace(/^```json\s*/, '').replace(/```$/, '');
  const parsed = JSON.parse(clean) as any;
  const value = Array.isArray(parsed) ? parsed[0] : parsed;
  const answer = textValue(value?.answer) ?? textValue(value?.response) ?? textValue(value?.output) ?? textValue(value?.text) ?? textValue(value?.summary);
  if (!answer) throw new Error('Invalid structured synthesis output');
  const types = new Set(['FACTUAL', 'NUMERIC', 'TEMPORAL', 'SEMANTIC', 'COMPLIANCE']);
  const claims = (Array.isArray(value.claims) ? value.claims : []).flatMap((claim: any) => {
    if (typeof claim?.text !== 'string') return [];
    const type = types.has(claim.type) ? claim.type : 'SEMANTIC';
    const evidenceIds = Array.isArray(claim.evidenceIds) ? claim.evidenceIds.filter((id: unknown): id is string => typeof id === 'string') : [];
    return [{ text: claim.text, type, evidenceIds } as AgentClaim];
  });
  if (!claims.length) claims.push({ text: answer, type: 'SEMANTIC', evidenceIds: [] });
  return { answer, claims };
}

function textValue(value:unknown):string|undefined{if(typeof value==='string'&&value.trim())return value.trim();if(value&&typeof value==='object'){const item=value as Record<string,unknown>;return textValue(item.text)??textValue(item.content)??textValue(item.value)}return undefined}

function deterministicSynthesisFallback(context:AgentContext,results:AgentResult[]){
  const numeric=deterministicAnswer(context,results);if(numeric.answer)return numeric;
  if(isOverviewQuestion(context.question))return deterministicOverviewWithoutDocuments(context,results);
  const compliance=results.find(result=>result.agent==='compliance')?.facts as Record<string,any>|undefined;
  if(compliance){const values=Object.values(compliance).filter(value=>value?.ruleId);if(values.length){const claims=values.map(value=>({text:`${value.ruleId} result is ${value.result}.`,type:'COMPLIANCE' as const,evidenceIds:[`compliance:${value.ruleId}:${context.localProposalId}`]}));return {answer:claims.map(claim=>claim.text).join(' '),claims};}}
  return {answer:'The available evidence could not be converted into a reliable answer.',claims:[] as AgentClaim[]};
}
