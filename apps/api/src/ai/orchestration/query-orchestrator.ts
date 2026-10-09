import { requestSignal, analysisTimeoutMs } from '../request-budget';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AgentContext,
  AgentTrace,
  MultiAgentResponse,
  ResearchSystem,
} from '../agents/agent.types';
import { OllamaClient } from '../ollama.client';
import { QueryRouter, isDaoStatisticsQuestion, isProposalMembersQuestion, isContractDeploymentQuestion, isIndexerStatusQuestion, isVerifyAgainstRpcQuestion } from '../router/query-router';
import { SynthesisService } from '../synthesis/synthesis.service';
import { ToolRegistry } from '../tools/tool-registry';
import type { ListProposalsOutput } from '../tools/offchain/proposal.tools';
import type { GetDaoStatisticsOutput } from '../tools/offchain/statistics.tools';
import type { GetProposalMembersOutput } from '../tools/offchain/member.tools';
import type { GetProposalTransactionsOutput } from '../tools/onchain/transaction.tools';
import type { GetContractDeploymentOutput } from '../tools/onchain/deployment.tools';
import type { GetIndexerStatusOutput } from '../tools/onchain/transaction.tools';
import type { VerifyAgainstRpcOutput } from '../tools/onchain/transaction.tools';
import { fuseProposalList, fuseDaoStatistics, fuseProposalMembers, fuseProposalTransactions, fuseContractDeployment, fuseIndexerStatus, fuseVerifyAgainstRpc, fuseProposalDetails, fuseProposalVotes, fuseMemberActivity, fuseProposalTimeline, fuseProposalEvidence, fuseEvidenceLookup } from './evidence-fusion';

type PlannedQuery = Awaited<ReturnType<QueryRouter['plan']>>;

@Injectable()
export class QueryOrchestrator {
  constructor(
    private readonly router: QueryRouter,
    private readonly tools: ToolRegistry,
    private readonly synthesis: SynthesisService,
    private readonly ollama: OllamaClient,
    private readonly config: ConfigService,
  ) {}

  async routeQuestion(context: AgentContext, system: ResearchSystem, verified: boolean, onModelCall: () => void = () => {}) {
    const started = Date.now();
    let modelCalls = 0;
    const prepared = await this.router.plan(context.question, requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config)), context,
      () => { modelCalls++; onModelCall(); }, this.config.get<number>('MAX_LLM_CALLS', 2) > 0);
    if (prepared.plan.kind === 'workflow') return { understanding: prepared.plan.understanding, modelCalls };
    let response: MultiAgentResponse;
    switch (prepared.plan.kind) {
      case 'dao-statistics': response = await this.daoStatistics(context, system, verified, prepared); break;
      case 'proposal-list': response = await this.proposalList(context, system, verified, prepared); break;
      case 'proposal-members': response = await this.proposalMembers(context, system, verified, prepared); break;
      case 'proposal-transactions': response = await this.proposalTransactions(context, system, verified, prepared); break;
      case 'contract-deployment': response = await this.contractDeployment(context, system, verified, prepared); break;
      case 'indexer-status': response = await this.indexerStatus(context, system, verified, prepared); break;
      case 'verify-rpc': response = await this.verifyAgainstRpc(context, system, verified, prepared); break;
      default: response = await this.structuredProposalQuery(context, system, verified, prepared);
    }
    response.llmCalls += modelCalls;
    response.latencyMs = Date.now() - started;
    return { response, modelCalls };
  }

  async structuredProposalQuery(context: AgentContext, system: ResearchSystem, verified: boolean, prepared?: PlannedQuery): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(), system, answer: '', agentsUsed: ['coordinator'], toolsUsed: [], evidence: [], retrieval: [], claims: [],
      agentTrace: [], abstained: true, latencyMs: 0, llmCalls: 0, embeddingCalls: 0, errors: [],
      ...(verified ? { verification: { status: 'UNSUPPORTED' as const, claims: [], correctionRounds: 0 } } : {}),
    };
    try {
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const planned = prepared ?? await this.router.plan(context.question, signal, context, () => { output.llmCalls++; }, false);
      if (planned.plan.kind === 'greeting') {
        output.answer = 'Hello! I can help with DAO proposals, votes, governance compliance, and blockchain evidence. What would you like to check?';
        output.abstained = false;
        output.agentTrace.push({ agent: 'coordinator', action: 'plan:greeting', status: 'success', evidenceIds: [], latencyMs: 0 });
        return output;
      }
      if (planned.plan.kind === 'unsupported') {
        output.answer = 'The available governance tools cannot answer this question or its requested filters. Ask about stored proposals, votes, members, documents, or blockchain evidence.';
        output.agentTrace.push({ agent: 'coordinator', action: 'plan:unsupported', status: 'skipped', evidenceIds: [], latencyMs: 0 });
        return output;
      }
      if (!['proposal-details', 'proposal-votes', 'member-activity', 'proposal-timeline', 'proposal-evidence', 'evidence-lookup'].includes(planned.plan.kind)) {
        output.answer = 'Please specify a supported proposal, vote, member activity, timeline, or evidence question.';
        return output;
      }
      const plan = planned.plan;
      if (!plan.tool) { output.answer = 'Please specify the proposal, evidence, or member details to query.'; return output; }
      const agent = plan.kind === 'proposal-evidence' || plan.kind === 'evidence-lookup' ? 'provenance' : 'sql';
      const { result, call } = await this.tools.invoke(agent, plan.tool, plan.input, { requestId: output.runId, daoId: context.daoId, signal });
      output.toolsUsed.push(plan.tool);
      output.agentsUsed.push(agent);
      output.agentTrace.push({ agent: 'coordinator', action: `plan:${plan.kind}`, status: 'success', evidenceIds: [], latencyMs: planned.response.latencyMs });
      output.agentTrace.push({ agent, tool: call.tool, status: 'success', evidenceIds: call.evidenceIds ?? [], latencyMs: call.latencyMs ?? 0 });
      const fused = plan.kind === 'proposal-details'
        ? fuseProposalDetails(result as any, output.runId)
        : plan.kind === 'proposal-votes'
          ? fuseProposalVotes(result as any, output.runId, plan.answerMode as 'votes' | 'winner')
          : plan.kind === 'member-activity'
            ? fuseMemberActivity(result as any, output.runId)
            : plan.kind === 'proposal-timeline'
              ? fuseProposalTimeline(result as any, output.runId)
              : plan.kind === 'proposal-evidence'
                ? fuseProposalEvidence(result as any, output.runId)
                : fuseEvidenceLookup(result as any, output.runId);
      output.evidence = fused.evidence;
      output.claims = fused.statements.map((statement) => statement.claim);
      output.answer = output.claims.map((claim, index) => `${index ? '- ' : ''}${claim.text} [${claim.evidenceIds.join(', ')}]`).join('\n\n');
      output.abstained = false;
      output.agentsUsed.push('synthesis');
      output.agentTrace.push({ agent: 'synthesis', action: `synthesize:${plan.kind}`, status: 'success', evidenceIds: output.claims.flatMap((claim) => claim.evidenceIds), latencyMs: 0 });
      if (verified) {
        output.verification = { status: 'SUPPORTED', correctionRounds: 0, claims: output.claims.map((claim) => ({ claim, status: 'SUPPORTED', reasons: [] })) };
        output.agentsUsed.push('verification');
      }
      return output;
    } catch {
      output.errors.push('structured-proposal-query execution failed or returned invalid output.');
      output.answer = 'Unable to produce a verified proposal answer. Check the database availability or rephrase the question.';
      return output;
    } finally { output.latencyMs = Date.now() - started; }
  }

  async proposalList(
    context: AgentContext,
    system: ResearchSystem,
    verified: boolean,
    prepared?: PlannedQuery,
  ): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(),
      system,
      answer: '',
      agentsUsed: [],
      toolsUsed: [],
      evidence: [],
      retrieval: [],
      claims: [],
      agentTrace: [],
      abstained: true,
      latencyMs: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      errors: [],
      ...(verified
        ? {
            verification: {
              status: 'UNSUPPORTED' as const,
              claims: [],
              correctionRounds: 0,
            },
          }
        : {}),
    };
    let stage: 'coordinator' | 'sql' | 'synthesis' = 'coordinator';
    let stageStart = started;
    try {
      if (context.datasetVersion) {
        output.answer =
          'Proposal listings currently use live operational data. Remove the dataset version to query the current listing.';
        return output;
      }
      if (
        this.config.get<number>('MAX_AGENT_STEPS', 8) < 1
      ) {
        output.answer =
          'This workflow needs one tool execution. The configured execution budget is too small.';
        return output;
      }
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const { plan, response: planning } = prepared ?? await this.router.plan(
        context.question,
        signal,
        context,
        () => { output.llmCalls++; },
        this.config.get<number>('MAX_LLM_CALLS', 2) > 0,
      );
      if (plan.kind === 'dao-statistics') {
        // This shouldn't happen in proposalList, but handle it gracefully
        output.answer = 'Unexpected DAO statistics plan in proposal-list workflow.';
        return output;
      }
      if (plan.kind === 'proposal-members') {
        output.answer = 'Unexpected proposal-members plan in proposal-list workflow.';
        return output;
      }
      output.agentTrace.push({
        agent: 'coordinator',
        action: 'plan:listProposals',
        status: 'success',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        model: planning.model,
        inputTokens: planning.inputTokens,
        outputTokens: planning.outputTokens,
      });
      if (!plan.tool) {
        output.answer =
          'Please ask for a proposal count or list with one status and optional voting-start dates, limit, or offset. Dates need an explicit timezone; document summaries and other filters are not supported by this tool yet.';
        return output;
      }
      signal.throwIfAborted();
      stage = 'sql';
      stageStart = Date.now();
      const { result, call } = await this.tools.invoke(
        'sql',
        'listProposals',
        plan.input,
        { requestId: output.runId, daoId: context.daoId, signal },
      );
      output.toolsUsed.push('listProposals');
      output.agentTrace.push({
        agent: 'sql',
        tool: call.tool,
        status: 'success',
        evidenceIds: call.evidenceIds ?? [],
        latencyMs: call.latencyMs ?? 0,
      });
      const fused = fuseProposalList(
        result as ListProposalsOutput,
        output.runId,
        plan.answerMode as 'count' | 'list',
      );
      output.evidence = fused.evidence;
      stage = 'synthesis';
      stageStart = Date.now();
      signal.throwIfAborted();
      const generated = await this.synthesis.proposalList(
        context.question,
        fused.statements,
        signal,
      );
      output.answer = generated.answer;
      output.claims = generated.claims;
      output.abstained = false;
      const evidenceIds = generated.claims.flatMap(
        (claim) => claim.evidenceIds,
      );
      output.agentTrace.push({
        agent: 'synthesis',
        action: 'synthesize:listProposals',
        status: 'success',
        evidenceIds,
        latencyMs: Date.now() - stageStart,
        inputTokens: generated.response.inputTokens,
        outputTokens: generated.response.outputTokens,
      });
      if (verified) {
        output.verification = {
          status: 'SUPPORTED',
          correctionRounds: 0,
          claims: generated.claims.map((claim) => ({
            claim,
            status: 'SUPPORTED',
            reasons: [],
          })),
        };
        output.agentTrace.push({
          agent: 'verification',
          action: 'verify-tool-statements',
          status: 'success',
          evidenceIds,
          latencyMs: 0,
        });
      }
      return output;
    } catch {
      // Tool/model output and connection details must not leak into telemetry.
      const trace: AgentTrace = {
        agent: stage,
        status: 'error',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        ...(stage === 'sql'
          ? { tool: 'listProposals' }
          : { action: 'listProposals' }),
      };
      output.agentTrace.push(trace);
      output.errors.push(
        `${stage}: proposal-list execution failed or returned invalid output.`,
      );
      output.answer =
        'Unable to produce a verified proposal-list answer. Check the LLM and database availability, or rephrase with a single status and explicit filters.';
      return output;
    } finally {
      output.latencyMs = Date.now() - started;
      output.agentsUsed = [
        ...new Set(output.agentTrace.map((trace) => trace.agent)),
      ];
    }
  }

  async daoStatistics(
    context: AgentContext,
    system: ResearchSystem,
    verified: boolean,
    prepared?: PlannedQuery,
  ): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(),
      system,
      answer: '',
      agentsUsed: [],
      toolsUsed: [],
      evidence: [],
      retrieval: [],
      claims: [],
      agentTrace: [],
      abstained: true,
      latencyMs: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      errors: [],
      ...(verified
        ? {
            verification: {
              status: 'UNSUPPORTED' as const,
              claims: [],
              correctionRounds: 0,
            },
          }
        : {}),
    };
    let stage: 'coordinator' | 'sql' | 'synthesis' = 'coordinator';
    let stageStart = started;
    try {
      if (context.datasetVersion) {
        output.answer =
          'DAO statistics currently use live operational data. Remove the dataset version to query the current listing.';
        return output;
      }
      if (
        this.config.get<number>('MAX_AGENT_STEPS', 8) < 1
      ) {
        output.answer =
          'This workflow needs one tool execution. The configured execution budget is too small.';
        return output;
      }
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const { plan, response: planning } = prepared ?? await this.router.plan(
        context.question,
        signal,
        context,
        () => { output.llmCalls++; },
        this.config.get<number>('MAX_LLM_CALLS', 2) > 0,
      );
      output.agentTrace.push({
        agent: 'coordinator',
        action: 'plan:daoStatistics',
        status: 'success',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        model: planning.model,
        inputTokens: planning.inputTokens,
        outputTokens: planning.outputTokens,
      });
      if (!plan.tool) {
        output.answer =
          'Please ask for DAO-wide statistics (total proposals, votes, members, artefacts).';
        return output;
      }
      signal.throwIfAborted();
      stage = 'sql';
      stageStart = Date.now();
      const { result, call } = await this.tools.invoke(
        'sql',
        'getDaoStatistics',
        plan.input,
        { requestId: output.runId, daoId: context.daoId, signal },
      );
      output.toolsUsed.push('getDaoStatistics');
      output.agentTrace.push({
        agent: 'sql',
        tool: call.tool,
        status: 'success',
        evidenceIds: call.evidenceIds ?? [],
        latencyMs: call.latencyMs ?? 0,
      });
      const fused = fuseDaoStatistics(
        result as GetDaoStatisticsOutput,
        output.runId,
      );
      output.evidence = fused.evidence;
      stage = 'synthesis';
      stageStart = Date.now();
      signal.throwIfAborted();
      const generated = await this.synthesis.daoStatistics(
        context.question,
        fused.statements,
        signal,
      );
      output.answer = generated.answer;
      output.claims = generated.claims;
      output.abstained = false;
      const evidenceIds = generated.claims.flatMap(
        (claim) => claim.evidenceIds,
      );
      output.agentTrace.push({
        agent: 'synthesis',
        action: 'synthesize:daoStatistics',
        status: 'success',
        evidenceIds,
        latencyMs: Date.now() - stageStart,
        inputTokens: generated.response.inputTokens,
        outputTokens: generated.response.outputTokens,
      });
      if (verified) {
        output.verification = {
          status: 'SUPPORTED',
          correctionRounds: 0,
          claims: generated.claims.map((claim) => ({
            claim,
            status: 'SUPPORTED',
            reasons: [],
          })),
        };
        output.agentTrace.push({
          agent: 'verification',
          action: 'verify-tool-statements',
          status: 'success',
          evidenceIds,
          latencyMs: 0,
        });
      }
      return output;
    } catch {
      const trace: AgentTrace = {
        agent: stage,
        status: 'error',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        ...(stage === 'sql'
          ? { tool: 'getDaoStatistics' }
          : { action: 'daoStatistics' }),
      };
      output.agentTrace.push(trace);
      output.errors.push(
        `${stage}: dao-statistics execution failed or returned invalid output.`,
      );
      output.answer =
        'Unable to produce a verified DAO statistics answer. Check the LLM and database availability.';
      return output;
    } finally {
      output.latencyMs = Date.now() - started;
      output.agentsUsed = [
        ...new Set(output.agentTrace.map((trace) => trace.agent)),
      ];
    }
  }

  async proposalMembers(
    context: AgentContext,
    system: ResearchSystem,
    verified: boolean,
    prepared?: PlannedQuery,
  ): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(),
      system,
      answer: '',
      agentsUsed: [],
      toolsUsed: [],
      evidence: [],
      retrieval: [],
      claims: [],
      agentTrace: [],
      abstained: true,
      latencyMs: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      errors: [],
      ...(verified
        ? {
            verification: {
              status: 'UNSUPPORTED' as const,
              claims: [],
              correctionRounds: 0,
            },
          }
        : {}),
    };
    let stage: 'coordinator' | 'sql' | 'synthesis' = 'coordinator';
    let stageStart = started;
    try {
      if (context.datasetVersion) {
        output.answer =
          'Proposal membership currently uses live operational data. Remove the dataset version to query the current listing.';
        return output;
      }
      if (
        this.config.get<number>('MAX_AGENT_STEPS', 8) < 1
      ) {
        output.answer =
          'This workflow needs one tool execution. The configured execution budget is too small.';
        return output;
      }
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const { plan, response: planning } = prepared ?? await this.router.plan(
        context.question,
        signal,
        context,
        () => { output.llmCalls++; },
        this.config.get<number>('MAX_LLM_CALLS', 2) > 0,
      );
      if (plan.kind !== 'proposal-members') {
        output.answer = 'Unexpected plan kind in proposal-members workflow.';
        return output;
      }
      output.agentTrace.push({
        agent: 'coordinator',
        action: 'plan:proposalMembers',
        status: 'success',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        model: planning.model,
        inputTokens: planning.inputTokens,
        outputTokens: planning.outputTokens,
      });
      if (!plan.tool) {
        output.answer =
          'Please specify a proposal (local ID or on-chain ID) to query its members.';
        return output;
      }
      signal.throwIfAborted();
      stage = 'sql';
      stageStart = Date.now();
      const { result, call } = await this.tools.invoke(
        'sql',
        'getProposalMembers',
        plan.input,
        { requestId: output.runId, daoId: context.daoId, signal },
      );
      output.toolsUsed.push('getProposalMembers');
      output.agentTrace.push({
        agent: 'sql',
        tool: call.tool,
        status: 'success',
        evidenceIds: call.evidenceIds ?? [],
        latencyMs: call.latencyMs ?? 0,
      });
      const fused = fuseProposalMembers(
        result as GetProposalMembersOutput,
        output.runId,
      );
      output.evidence = fused.evidence;
      stage = 'synthesis';
      stageStart = Date.now();
      signal.throwIfAborted();
      const generated = await this.synthesis.proposalMembers(
        context.question,
        fused.statements,
        signal,
      );
      output.answer = generated.answer;
      output.claims = generated.claims;
      output.abstained = false;
      const evidenceIds = generated.claims.flatMap(
        (claim) => claim.evidenceIds,
      );
      output.agentTrace.push({
        agent: 'synthesis',
        action: 'synthesize:proposalMembers',
        status: 'success',
        evidenceIds,
        latencyMs: Date.now() - stageStart,
        inputTokens: generated.response.inputTokens,
        outputTokens: generated.response.outputTokens,
      });
      if (verified) {
        output.verification = {
          status: 'SUPPORTED',
          correctionRounds: 0,
          claims: generated.claims.map((claim) => ({
            claim,
            status: 'SUPPORTED',
            reasons: [],
          })),
        };
        output.agentTrace.push({
          agent: 'verification',
          action: 'verify-tool-statements',
          status: 'success',
          evidenceIds,
          latencyMs: 0,
        });
      }
      return output;
    } catch {
      const trace: AgentTrace = {
        agent: stage,
        status: 'error',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        ...(stage === 'sql'
          ? { tool: 'getProposalMembers' }
          : { action: 'proposalMembers' }),
      };
      output.agentTrace.push(trace);
      output.errors.push(
        `${stage}: proposal-members execution failed or returned invalid output.`,
      );
      output.answer =
        'Unable to produce a verified proposal membership answer. Check the LLM and database availability, or specify a valid proposal.';
      return output;
    } finally {
      output.latencyMs = Date.now() - started;
      output.agentsUsed = [
        ...new Set(output.agentTrace.map((trace) => trace.agent)),
      ];
    }
  }

  async proposalTransactions(
    context: AgentContext,
    system: ResearchSystem,
    verified: boolean,
    prepared?: PlannedQuery,
  ): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(),
      system,
      answer: '',
      agentsUsed: [],
      toolsUsed: [],
      evidence: [],
      retrieval: [],
      claims: [],
      agentTrace: [],
      abstained: true,
      latencyMs: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      errors: [],
      ...(verified
        ? {
            verification: {
              status: 'UNSUPPORTED' as const,
              claims: [],
              correctionRounds: 0,
            },
          }
        : {}),
    };
    let stage: 'coordinator' | 'sql' | 'synthesis' = 'coordinator';
    let stageStart = started;
    try {
      if (context.datasetVersion) {
        output.answer =
          'Proposal transactions currently use live operational data. Remove the dataset version to query the current listing.';
        return output;
      }
      if (
        this.config.get<number>('MAX_AGENT_STEPS', 8) < 1
      ) {
        output.answer =
          'This workflow needs one tool execution. The configured execution budget is too small.';
        return output;
      }
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const { plan, response: planning } = prepared ?? await this.router.plan(
        context.question,
        signal,
        context,
        () => { output.llmCalls++; },
        this.config.get<number>('MAX_LLM_CALLS', 2) > 0,
      );
      if (plan.kind !== 'proposal-transactions') {
        output.answer = 'Unexpected plan kind in proposal-transactions workflow.';
        return output;
      }
      output.agentTrace.push({
        agent: 'coordinator',
        action: 'plan:proposalTransactions',
        status: 'success',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        model: planning.model,
        inputTokens: planning.inputTokens,
        outputTokens: planning.outputTokens,
      });
      if (!plan.tool) {
        output.answer =
          'Please specify a proposal to query its transactions.';
        return output;
      }
      signal.throwIfAborted();
      stage = 'sql';
      stageStart = Date.now();
      const { result, call } = await this.tools.invoke(
        'sql',
        'getProposalTransactions',
        plan.input,
        { requestId: output.runId, daoId: context.daoId, signal },
      );
      output.toolsUsed.push('getProposalTransactions');
      output.agentTrace.push({
        agent: 'sql',
        tool: call.tool,
        status: 'success',
        evidenceIds: call.evidenceIds ?? [],
        latencyMs: call.latencyMs ?? 0,
      });
      // Intent-aware transaction filtering based on question keywords
      const question = context.question.toLowerCase();
      let filteredResult = result as any;
      if (/\bcreated\b/.test(question) && filteredResult?.transactions) {
        filteredResult = {
          ...filteredResult,
          transactions: filteredResult.transactions.filter(
            (tx: any) => tx.operation === 'CREATE_PROPOSAL',
          ),
          count: filteredResult.transactions.filter(
            (tx: any) => tx.operation === 'CREATE_PROPOSAL',
          ).length,
        };
      } else if (/\bfinalized\b/.test(question) && filteredResult?.transactions) {
        filteredResult = {
          ...filteredResult,
          transactions: filteredResult.transactions.filter(
            (tx: any) => tx.operation === 'FINALIZE_PROPOSAL',
          ),
          count: filteredResult.transactions.filter(
            (tx: any) => tx.operation === 'FINALIZE_PROPOSAL',
          ).length,
        };
      } else if (/\bvote\b/.test(question) && filteredResult?.transactions) {
        filteredResult = {
          ...filteredResult,
          transactions: filteredResult.transactions.filter(
            (tx: any) => tx.operation === 'CAST_VOTE',
          ),
          count: filteredResult.transactions.filter(
            (tx: any) => tx.operation === 'CAST_VOTE',
          ).length,
        };
      }

      const fused = fuseProposalTransactions(
        filteredResult as any,
        output.runId,
      );
      output.evidence = fused.evidence;
      stage = 'synthesis';
      stageStart = Date.now();
      signal.throwIfAborted();
      const generated = await this.synthesis.proposalTransactions(
        context.question,
        fused.statements,
        signal,
      );
      output.answer = generated.answer;
      output.claims = generated.claims;
      output.abstained = false;
      const evidenceIds = generated.claims.flatMap(
        (claim) => claim.evidenceIds,
      );
      output.agentTrace.push({
        agent: 'synthesis',
        action: 'synthesize:proposalTransactions',
        status: 'success',
        evidenceIds,
        latencyMs: Date.now() - stageStart,
        inputTokens: generated.response.inputTokens,
        outputTokens: generated.response.outputTokens,
      });
      if (verified) {
        output.verification = {
          status: 'SUPPORTED',
          correctionRounds: 0,
          claims: generated.claims.map((claim) => ({
            claim,
            status: 'SUPPORTED',
            reasons: [],
          })),
        };
        output.agentTrace.push({
          agent: 'verification',
          action: 'verify-tool-statements',
          status: 'success',
          evidenceIds,
          latencyMs: 0,
        });
      }
      return output;
    } catch {
      const trace: AgentTrace = {
        agent: stage,
        status: 'error',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        ...(stage === 'sql'
          ? { tool: 'getProposalTransactions' }
          : { action: 'proposalTransactions' }),
      };
      output.agentTrace.push(trace);
      output.errors.push(
        `${stage}: proposal-transactions execution failed or returned invalid output.`,
      );
      output.answer =
        'Unable to produce a verified proposal transactions answer. Check the LLM and database availability, or specify a valid proposal.';
      return output;
    } finally {
      output.latencyMs = Date.now() - started;
      output.agentsUsed = [
        ...new Set(output.agentTrace.map((trace) => trace.agent)),
      ];
    }
  }

  async contractDeployment(
    context: AgentContext,
    system: ResearchSystem,
    verified: boolean,
    prepared?: PlannedQuery,
  ): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(),
      system,
      answer: '',
      agentsUsed: [],
      toolsUsed: [],
      evidence: [],
      retrieval: [],
      claims: [],
      agentTrace: [],
      abstained: true,
      latencyMs: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      errors: [],
      ...(verified
        ? {
            verification: {
              status: 'UNSUPPORTED' as const,
              claims: [],
              correctionRounds: 0,
            },
          }
        : {}),
    };
    let stage: 'coordinator' | 'provenance' | 'synthesis' = 'coordinator';
    let stageStart = started;
    try {
      if (context.datasetVersion) {
        output.answer =
          'Contract deployment currently uses live operational data. Remove the dataset version to query the current listing.';
        return output;
      }
      if (this.config.get<number>('MAX_AGENT_STEPS', 8) < 1) {
        output.answer =
          'This workflow needs one tool execution. The configured execution budget is too small.';
        return output;
      }
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const { plan, response: planning } = prepared ?? await this.router.plan(
        context.question,
        signal,
        context,
        () => { output.llmCalls++; },
        this.config.get<number>('MAX_LLM_CALLS', 2) > 0,
      );
      if (plan.kind !== 'contract-deployment') {
        output.answer = 'Unexpected plan kind in contract-deployment workflow.';
        return output;
      }
      output.agentTrace.push({
        agent: 'coordinator',
        action: 'plan:contractDeployment',
        status: 'success',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        inputTokens: planning.inputTokens,
        outputTokens: planning.outputTokens,
      });
      if (!plan.tool) {
        output.answer =
          'Unable to determine contract deployment query.';
        return output;
      }
      signal.throwIfAborted();
      stage = 'provenance';
      stageStart = Date.now();
      const { result, call } = await this.tools.invoke(
        'provenance',
        'getContractDeployment',
        plan.input,
        { requestId: output.runId, daoId: context.daoId, signal },
      );
      output.toolsUsed.push('getContractDeployment');
      output.agentTrace.push({
        agent: 'provenance',
        tool: call.tool,
        status: 'success',
        evidenceIds: call.evidenceIds ?? [],
        latencyMs: call.latencyMs ?? 0,
      });
      const deployment = result as GetContractDeploymentOutput;
      if (!deployment.found) {
        output.answer =
          'No contract deployment record was found for the configured chain and governance contract.';
        return output;
      }
      const fused = fuseContractDeployment(deployment);
      output.evidence = fused.evidence;
      stage = 'synthesis';
      stageStart = Date.now();
      signal.throwIfAborted();
      const generated = await this.synthesis.contractDeployment(
        context.question,
        fused.statements,
        signal,
      );
      output.answer = generated.answer;
      output.claims = generated.claims;
      output.abstained = false;
      const evidenceIds = generated.claims.flatMap(
        (claim) => claim.evidenceIds,
      );
      output.agentTrace.push({
        agent: 'synthesis',
        action: 'synthesize:contractDeployment',
        status: 'success',
        evidenceIds,
        latencyMs: Date.now() - stageStart,
        inputTokens: generated.response.inputTokens,
        outputTokens: generated.response.outputTokens,
      });
      if (verified) {
        output.verification = {
          status: 'SUPPORTED',
          correctionRounds: 0,
          claims: generated.claims.map((claim) => ({
            claim,
            status: 'SUPPORTED',
            reasons: [],
          })),
        };
        output.agentTrace.push({
          agent: 'verification',
          action: 'verify-tool-statements',
          status: 'success',
          evidenceIds,
          latencyMs: 0,
        });
      }
      return output;
    } catch {
      const trace: AgentTrace = {
        agent: stage,
        status: 'error',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        ...(stage === 'provenance'
          ? { tool: 'getContractDeployment' }
          : { action: 'contractDeployment' }),
      };
      output.agentTrace.push(trace);
      output.errors.push(
        `${stage}: contract-deployment execution failed or returned invalid output.`,
      );
      output.answer =
        'Unable to produce a verified contract deployment answer. Check the LLM and database availability.';
      return output;
    } finally {
      output.latencyMs = Date.now() - started;
      output.agentsUsed = [
        ...new Set(output.agentTrace.map((trace) => trace.agent)),
      ];
    }
  }

  async indexerStatus(
    context: AgentContext,
    system: ResearchSystem,
    verified: boolean,
    prepared?: PlannedQuery,
  ): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(),
      system,
      answer: '',
      agentsUsed: [],
      toolsUsed: [],
      evidence: [],
      retrieval: [],
      claims: [],
      agentTrace: [],
      abstained: true,
      latencyMs: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      errors: [],
      ...(verified
        ? {
            verification: {
              status: 'UNSUPPORTED' as const,
              claims: [],
              correctionRounds: 0,
            },
          }
        : {}),
    };
    let stage: 'coordinator' | 'provenance' | 'synthesis' = 'coordinator';
    let stageStart = started;
    try {
      if (context.datasetVersion) {
        output.answer =
          'Indexer status currently uses live operational data. Remove the dataset version to query the current listing.';
        return output;
      }
      if (this.config.get<number>('MAX_AGENT_STEPS', 8) < 1) {
        output.answer =
          'This workflow needs one tool execution. The configured execution budget is too small.';
        return output;
      }
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const { plan, response: planning } = prepared ?? await this.router.plan(
        context.question,
        signal,
        context,
        () => { output.llmCalls++; },
        this.config.get<number>('MAX_LLM_CALLS', 2) > 0,
      );
      if (plan.kind !== 'indexer-status') {
        output.answer = 'Unexpected plan kind in indexer-status workflow.';
        return output;
      }
      output.agentTrace.push({
        agent: 'coordinator',
        action: 'plan:indexerStatus',
        status: 'success',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        inputTokens: planning.inputTokens,
        outputTokens: planning.outputTokens,
      });
      if (!plan.tool) {
        output.answer =
          'Unable to determine indexer status query.';
        return output;
      }
      signal.throwIfAborted();
      stage = 'provenance';
      stageStart = Date.now();
      const { result, call } = await this.tools.invoke(
        'provenance',
        'getIndexerStatus',
        plan.input,
        { requestId: output.runId, daoId: context.daoId, signal },
      );
      output.toolsUsed.push('getIndexerStatus');
      output.agentTrace.push({
        agent: 'provenance',
        tool: call.tool,
        status: 'success',
        evidenceIds: call.evidenceIds ?? [],
        latencyMs: call.latencyMs ?? 0,
      });
      const indexer = result as GetIndexerStatusOutput;
      if (!indexer.found) {
        output.answer =
          `No indexer checkpoint found for ${indexer.indexerName} in the configured governance deployment.`;
        return output;
      }
      const fused = fuseIndexerStatus(indexer, output.runId);
      output.evidence = fused.evidence;
      stage = 'synthesis';
      stageStart = Date.now();
      signal.throwIfAborted();
      const generated = await this.synthesis.indexerStatus(
        context.question,
        fused.statements,
        signal,
      );
      output.answer = generated.answer;
      output.claims = generated.claims;
      output.abstained = false;
      const evidenceIds = generated.claims.flatMap(
        (claim) => claim.evidenceIds,
      );
      output.agentTrace.push({
        agent: 'synthesis',
        action: 'synthesize:indexerStatus',
        status: 'success',
        evidenceIds,
        latencyMs: Date.now() - stageStart,
        inputTokens: generated.response.inputTokens,
        outputTokens: generated.response.outputTokens,
      });
      if (verified) {
        output.verification = {
          status: 'SUPPORTED',
          correctionRounds: 0,
          claims: generated.claims.map((claim) => ({
            claim,
            status: 'SUPPORTED',
            reasons: [],
          })),
        };
        output.agentTrace.push({
          agent: 'verification',
          action: 'verify-tool-statements',
          status: 'success',
          evidenceIds,
          latencyMs: 0,
        });
      }
      return output;
    } catch {
      const trace: AgentTrace = {
        agent: stage,
        status: 'error',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        ...(stage === 'provenance'
          ? { tool: 'getIndexerStatus' }
          : { action: 'indexerStatus' }),
      };
      output.agentTrace.push(trace);
      output.errors.push(
        `${stage}: indexer-status execution failed or returned invalid output.`,
      );
      output.answer =
        'Unable to produce a verified indexer status answer. Check the LLM and database availability.';
      return output;
    } finally {
      output.latencyMs = Date.now() - started;
      output.agentsUsed = [
        ...new Set(output.agentTrace.map((trace) => trace.agent)),
      ];
    }
  }

  async verifyAgainstRpc(
    context: AgentContext,
    system: ResearchSystem,
    verified: boolean,
    prepared?: PlannedQuery,
  ): Promise<MultiAgentResponse> {
    const started = Date.now();
    const output: MultiAgentResponse = {
      runId: randomUUID(),
      system,
      answer: '',
      agentsUsed: [],
      toolsUsed: [],
      evidence: [],
      retrieval: [],
      claims: [],
      agentTrace: [],
      abstained: true,
      latencyMs: 0,
      llmCalls: 0,
      embeddingCalls: 0,
      errors: [],
      ...(verified
        ? {
            verification: {
              status: 'UNSUPPORTED' as const,
              claims: [],
              correctionRounds: 0,
            },
          }
        : {}),
    };
    let stage: 'coordinator' | 'provenance' | 'synthesis' = 'coordinator';
    let stageStart = started;
    try {
      if (context.datasetVersion) {
        output.answer =
          'RPC verification currently uses live operational data. Remove the dataset version to query the current listing.';
        return output;
      }
      if (this.config.get<number>('MAX_AGENT_STEPS', 8) < 1) {
        output.answer =
          'This workflow needs one tool execution. The configured execution budget is too small.';
        return output;
      }
      const signal = requestSignal() ?? AbortSignal.timeout(analysisTimeoutMs(this.config));
      const { plan, response: planning } = prepared ?? await this.router.plan(
        context.question,
        signal,
        context,
        () => { output.llmCalls++; },
        this.config.get<number>('MAX_LLM_CALLS', 2) > 0,
      );
      if (plan.kind !== 'verify-rpc') {
        output.answer = 'Unexpected plan kind in verify-rpc workflow.';
        return output;
      }
      output.agentTrace.push({
        agent: 'coordinator',
        action: 'plan:verifyAgainstRpc',
        status: 'success',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        inputTokens: planning.inputTokens,
        outputTokens: planning.outputTokens,
      });
      if (!plan.tool) {
        output.answer =
          'Please specify an event evidence ID to verify against RPC.';
        return output;
      }
      signal.throwIfAborted();
      stage = 'provenance';
      stageStart = Date.now();
      const { result, call } = await this.tools.invoke(
        'provenance',
        'verifyAgainstRpc',
        plan.input,
        { requestId: output.runId, daoId: context.daoId, signal },
      );
      output.toolsUsed.push('verifyAgainstRpc');
      output.agentTrace.push({
        agent: 'provenance',
        tool: call.tool,
        status: 'success',
        evidenceIds: call.evidenceIds ?? [],
        latencyMs: call.latencyMs ?? 0,
      });
      const rpcResult = result as VerifyAgainstRpcOutput;
      if (!rpcResult.rpcVerified && rpcResult.differences.length > 0) {
        output.answer =
          `RPC verification failed: ${rpcResult.differences.join('; ')}`;
        output.evidence = [];
        output.claims = [
          {
            text: `Event ${rpcResult.evidenceId} did not match on-chain data: ${rpcResult.differences.join('; ')}`,
            type: 'FACTUAL' as const,
            evidenceIds: [rpcResult.evidenceId],
          },
        ];
        output.abstained = false;
        return output;
      }
      const fused = fuseVerifyAgainstRpc(rpcResult, output.runId);
      output.evidence = fused.evidence;
      stage = 'synthesis';
      stageStart = Date.now();
      signal.throwIfAborted();
      const generated = await this.synthesis.verifyAgainstRpc(
        context.question,
        fused.statements,
        signal,
      );
      output.answer = generated.answer;
      output.claims = generated.claims;
      output.abstained = false;
      const evidenceIds = generated.claims.flatMap(
        (claim) => claim.evidenceIds,
      );
      output.agentTrace.push({
        agent: 'synthesis',
        action: 'synthesize:verifyAgainstRpc',
        status: 'success',
        evidenceIds,
        latencyMs: Date.now() - stageStart,
        inputTokens: generated.response.inputTokens,
        outputTokens: generated.response.outputTokens,
      });
      if (verified) {
        output.verification = {
          status: 'SUPPORTED',
          correctionRounds: 0,
          claims: generated.claims.map((claim) => ({
            claim,
            status: 'SUPPORTED',
            reasons: [],
          })),
        };
        output.agentTrace.push({
          agent: 'verification',
          action: 'verify-tool-statements',
          status: 'success',
          evidenceIds,
          latencyMs: 0,
        });
      }
      return output;
    } catch {
      const trace: AgentTrace = {
        agent: stage,
        status: 'error',
        evidenceIds: [],
        latencyMs: Date.now() - stageStart,
        ...(stage === 'provenance'
          ? { tool: 'verifyAgainstRpc' }
          : { action: 'verifyAgainstRpc' }),
      };
      output.agentTrace.push(trace);
      output.errors.push(
        `${stage}: verify-rpc execution failed or returned invalid output.`,
      );
      output.answer =
        'Unable to produce a verified RPC verification answer. Check the LLM and database availability.';
      return output;
    } finally {
      output.latencyMs = Date.now() - started;
      output.agentsUsed = [
        ...new Set(output.agentTrace.map((trace) => trace.agent)),
      ];
    }
  }
}
