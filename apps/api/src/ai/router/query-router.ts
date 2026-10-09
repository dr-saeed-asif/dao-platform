import { directPlan } from './direct-plan';
import type { AgentContext } from '../agents/agent.types';
import { Injectable } from '@nestjs/common';
import Joi from 'joi';
import { OllamaClient } from '../ollama.client';
import { ToolRegistry } from '../tools/tool-registry';
import { QueryUnderstandingService, type QueryUnderstanding, type QueryUnderstandingInput } from './query-understanding.service';
import {
  listProposalsInputSchema,
  type ListProposalsInput,
} from '../tools/offchain/proposal.tools';
import {
  getDaoStatisticsInputSchema,
  type GetDaoStatisticsInput,
} from '../tools/offchain/statistics.tools';
import {
  getProposalMembersInputSchema,
  type GetProposalMembersInput,
} from '../tools/offchain/member.tools';
import {
  getProposalTransactionsInputSchema,
  type GetProposalTransactionsInput,
} from '../tools/onchain/transaction.tools';
import {
  getContractDeploymentInputSchema,
  type GetContractDeploymentInput,
} from '../tools/onchain/deployment.tools';
import { getProposalDetailsInputSchema, type GetProposalDetailsInput } from '../tools/offchain/proposal-details.tools';
import { getProposalVotesInputSchema, type GetProposalVotesInput } from '../tools/offchain/proposal-votes.tools';
import { getMemberActivityInputSchema, type GetMemberActivityInput } from '../tools/offchain/member-activity.tools';
import { getProposalTimelineInputSchema, type GetProposalTimelineInput } from '../tools/onchain/timeline.tools';
import { getProposalEvidenceInputSchema, getEvidenceByIdInputSchema, type GetProposalEvidenceInput, type GetEvidenceByIdInput } from '../tools/onchain/provenance.tools';
import { getIndexerStatusInputSchema, type GetIndexerStatusInput, verifyAgainstRpcInputSchema, type VerifyAgainstRpcInput } from '../tools/onchain/transaction.tools';

export interface ProposalListPlan {
  tool: 'listProposals' | null;
  input: ListProposalsInput;
  answerMode: 'count' | 'list';
  kind: 'proposal-list';
}

export interface DaoStatisticsPlan {
  tool: 'getDaoStatistics' | null;
  input: GetDaoStatisticsInput;
  answerMode: 'statistics';
  kind: 'dao-statistics';
}

export interface ProposalMembersPlan {
  tool: 'getProposalMembers' | null;
  input: GetProposalMembersInput;
  answerMode: 'members';
  kind: 'proposal-members';
}

export interface ProposalTransactionsPlan {
  tool: 'getProposalTransactions' | null;
  input: GetProposalTransactionsInput;
  answerMode: 'transactions';
  kind: 'proposal-transactions';
}

export interface ContractDeploymentPlan {
  tool: 'getContractDeployment' | null;
  input: GetContractDeploymentInput;
  answerMode: 'deployment';
  kind: 'contract-deployment';
}

export interface IndexerStatusPlan {
  tool: 'getIndexerStatus' | null;
  input: GetIndexerStatusInput;
  answerMode: 'indexer-status';
  kind: 'indexer-status';
}

export interface VerifyAgainstRpcPlan {
  tool: 'verifyAgainstRpc' | null;
  input: VerifyAgainstRpcInput;
  answerMode: 'verify-rpc';
  kind: 'verify-rpc';
}

export interface ProposalDetailsPlan { tool: 'getProposal' | null; input: GetProposalDetailsInput; answerMode: 'details'; kind: 'proposal-details'; }
export interface ProposalVotesPlan { tool: 'getProposalVotes' | null; input: GetProposalVotesInput; answerMode: 'votes' | 'winner'; kind: 'proposal-votes'; }
export interface MemberActivityPlan { tool: 'getMemberActivity' | null; input: GetMemberActivityInput; answerMode: 'activity'; kind: 'member-activity'; }
export interface ProposalTimelinePlan { tool: 'getProposalTimeline' | null; input: GetProposalTimelineInput; answerMode: 'timeline'; kind: 'proposal-timeline'; }
export interface ProposalEvidencePlan { tool: 'getProposalEvidence' | null; input: GetProposalEvidenceInput; answerMode: 'evidence'; kind: 'proposal-evidence'; }
export interface EvidenceLookupPlan { tool: 'getEvidenceById' | null; input: GetEvidenceByIdInput; answerMode: 'evidence-lookup'; kind: 'evidence-lookup'; }

const planSchema = Joi.object<ProposalListPlan>({
  tool: Joi.string().valid('listProposals').allow(null).required(),
  input: Joi.object().required(),
  answerMode: Joi.string().valid('count', 'list').required(),
  kind: Joi.string().valid('proposal-list').optional(),
}).unknown(false);

const statsPlanSchema = Joi.object<DaoStatisticsPlan>({
  tool: Joi.string().valid('getDaoStatistics').allow(null).required(),
  input: Joi.object().required(),
  answerMode: Joi.string().valid('statistics').required(),
  kind: Joi.string().valid('dao-statistics').optional(),
}).unknown(false);

const membersPlanSchema = Joi.object<ProposalMembersPlan>({
  tool: Joi.string().valid('getProposalMembers').allow(null).required(),
  input: Joi.object().required(),
  answerMode: Joi.string().valid('members').required(),
  kind: Joi.string().valid('proposal-members').optional(),
}).unknown(false);

const transactionsPlanSchema = Joi.object<ProposalTransactionsPlan>({
  tool: Joi.string().valid('getProposalTransactions').allow(null).required(),
  input: Joi.object().required(),
  answerMode: Joi.string().valid('transactions').required(),
  kind: Joi.string().valid('proposal-transactions').optional(),
}).unknown(false);

const deploymentPlanSchema = Joi.object<ContractDeploymentPlan>({
  tool: Joi.string().valid('getContractDeployment').allow(null).required(),
  input: Joi.object().length(0).required(),
  answerMode: Joi.string().valid('deployment').required(),
  kind: Joi.string().valid('contract-deployment').optional(),
}).unknown(false);

const indexerStatusPlanSchema = Joi.object<IndexerStatusPlan>({
  tool: Joi.string().valid('getIndexerStatus').allow(null).required(),
  input: Joi.object().required(),
  answerMode: Joi.string().valid('indexer-status').required(),
  kind: Joi.string().valid('indexer-status').optional(),
}).unknown(false);

const verifyAgainstRpcPlanSchema = Joi.object<VerifyAgainstRpcPlan>({
  tool: Joi.string().valid('verifyAgainstRpc').allow(null).required(),
  input: Joi.object().required(),
  answerMode: Joi.string().valid('verify-rpc').required(),
  kind: Joi.string().valid('verify-rpc').optional(),
}).unknown(false);

/** Only plural/list questions enter this workflow; single-proposal routes stay intact. */
export function isProposalListQuestion(question: string): boolean {
  return (
    /\bproposals\b|\bproposal\s+(?:count|list|listing)\b/i.test(question) &&
    !/\bproposal\s+#?\d+\b|\bthis proposal\b/i.test(question)
  );
}

export function isDaoStatisticsQuestion(question: string): boolean {
  if (directPlan(question)?.kind === 'dao-statistics') return true;
  if (/\b(?:proposal\s+#?(?:\d+|onchain-\d+)|this proposal|its assigned members)\b/i.test(question)) return false;
  // Only match pure DAO-wide statistics questions without status/date filters
  if (/\bdao\s+statistics?\b/i.test(question)) return true;
  if (/^(how many|what is the count of)\s+(proposals|votes|members|artefacts|artifacts)\b/i.test(question) && 
      !/\b(active|upcoming|ended|cancelled|finalized)\b/i.test(question)) return true;
  if (/\b(proposal|vote|member|artefact|artifact)\s+count\b/i.test(question) &&
      !/\b(active|upcoming|ended|cancelled|finalized)\b/i.test(question)) return true;
  if (/\bdao\b/i.test(question) && /\b(statistics|totals|overview|summary)\b/i.test(question)) return true;
  return false;
}

export function isProposalDetailsQuestion(question: string): boolean {
  return /\b(?:what is|show|describe|tell me about|details? for)\s+(?:proposal\s+#?[a-z0-9-]+|this proposal|the proposal)\b/i.test(question);
}

export function isProposalVotesQuestion(question: string): boolean {
  return /\b(?:which option won|winning option|votes? (?:for|on|received by)|how many votes|vote count|number of votes)\b/i.test(question) && (/\bproposal\s+#?[a-z0-9-]+/i.test(question) || /\b(?:this|the) proposal\b/i.test(question));
}

export function isMemberActivityQuestion(question: string): boolean {
  return /\b(?:did|has)\s+0x[0-9a-f]{40}\s+(?:vote|voted|cast)\b/i.test(question) && /\bproposal\s+#?[a-z0-9-]+/i.test(question);
}

export function isProposalTimelineQuestion(question: string): boolean {
  return /\b(?:timeline|history|events?|lifecycle transitions?)\b/i.test(question) && /\bproposal\b/i.test(question);
}

export function isProposalEvidenceQuestion(question: string): boolean {
  return /\b(?:evidence|proof|supporting records?)\b/i.test(question) && /\bproposal\b/i.test(question);
}

export function isEvidenceByIdQuestion(question: string): boolean {
  return /\b(?:validate|verify|resolve|inspect|what is)\b.*\bevidence\b/i.test(question) || /\b(?:event|artefact|artifact|chunk):[^\s]+/i.test(question);
}

export function isProposalMembersQuestion(question: string): boolean {
  const q = question.toLowerCase();
  if (/\b(?:were|was|historical|at the time|when .*vot|before|after)\b/i.test(q)) return false;
  if (/^what is the total voting power of its assigned members[?]?$/i.test(q)) return true;
  if (directPlan(question, { localProposalId: 'selected' })?.kind === 'proposal-members') return true;
  // Match questions about members assigned to a specific proposal
  if (/\b(members?|voters?)\b/i.test(q) && /\bproposal\s+#?\w+/i.test(question)) return true;
  if (/\b(assigned|eligible)\s+(members?|voters?)\b/i.test(q) && /\bproposal\b/i.test(q)) return true;
  if (/\bwho\s+can\s+vote\s+on\s+proposal\b/i.test(q)) return true;
  if (/\b(total\s+)?voting\s+power\b/i.test(q) && /\bproposal\b/i.test(q)) return true;
  if (/\bhow\s+many\s+(members?|voters?)\b/i.test(q) && /\bproposal\b/i.test(q)) return true;
  if (/\blist\s+(members?|voters?)\b/i.test(q) && /\bproposal\b/i.test(q)) return true;
  return false;
}

export function isProposalTransactionsQuestion(question: string): boolean {
  const q = question.toLowerCase();
  if (/\btransaction\b|\bvote\s+tx\b|\bcreate\s+tx\b/i.test(q) && /\bproposal\s+#?\w+/i.test(question)) return true;
  if (/\b(which|what)\s+transaction\s+(created|finalized|cast)\b/i.test(q)) return true;
  if (/\bshow\s+(all\s+)?transactions?\b/i.test(q) && /\bproposal\b/i.test(q)) return true;
  if (/\btransactions?\s+(for|of|related\s+to)\s+proposal\b/i.test(q)) return true;
  return false;
}

export function isContractDeploymentQuestion(question: string): boolean {
  const q = question.toLowerCase();
  if (/\bwhich contract\b/i.test(q)) return true;
  if (/\bcontract\b/i.test(q) && (/\bemitted\b|\bproduced\b|\bidentity\b|\bdeployed\b|\baddress\b|\bversion\b/i.test(q))) return true;
  if (/\bwhat chain\b/i.test(q) && /\b(contract|governance)\b/i.test(q)) return true;
  if (/\bgovernance contract\b/i.test(q) && (/\baddress\b|\bchain\b|\bdeployed\b|\bidentity\b/i.test(q))) return true;
  if (/\bshow (the )?contract deployment\b/i.test(q)) return true;
  if (/\bdeployment (identity|transaction|info)\b/i.test(q)) return true;
  return false;
}

export function isIndexerStatusQuestion(question: string): boolean {
  const q = question.toLowerCase();
  if (/\bindexer\b/i.test(q) && (/\bstatus\b|\bcheckpoint\b|\bprocessed\b|\bhow far\b|\bprogress\b/i.test(q))) return true;
  if (/\bindexer\b/i.test(q) && /\b(governance|events?|votes?|proposals?)\b/i.test(q)) return true;
  if (/\bsync\b/i.test(q) && (/\bstatus\b|\bprogress\b/i.test(q))) return true;
  return false;
}

export function isVerifyAgainstRpcQuestion(question: string): boolean {
  const q = question.toLowerCase();
  if (/\bverify\b/i.test(q) && (/\bagainst\b|\bcheck\b|\bmatch\b|\bvalidate\b|\bconfirm\b/i).test(q) && /\b(rpc|blockchain|chain|on-chain)\b/i.test(q)) return true;
  if (/\bcheck.*evidence.*against.*rpc\b/i.test(q)) return true;
  if (/\bdoes.*indexed.*event.*match.*blockchain\b/i.test(q)) return true;
  if (/\bverify.*event.*directly.*on.*(cyberchain|rpc|blockchain)\b/i.test(q)) return true;
  return false;
}

export function parseModelJson(content: string): unknown {
  return JSON.parse(
    content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  ) as unknown;
}

@Injectable()
export class QueryRouter {
  constructor(
    private readonly ollama: OllamaClient,
    private readonly tools: ToolRegistry,
    private readonly understanding?: QueryUnderstandingService,
  ) {}

  async plan(question: string, signal: AbortSignal, context?: AgentContext, onModelCall: () => void = () => {}, allowModel = true) {
    signal.throwIfAborted();
    if (/^(?:hello|hi|hey|salaam|salam|assalam(?:u| o) alaikum)[\s!.?]*$/i.test(question.trim())) {
      return { plan: { kind: 'greeting' as const, tool: null, input: {}, answerMode: 'none' }, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
    }
    const compliance = directPlan(question, context);
    if (compliance?.kind === 'workflow') {
      return { plan: compliance, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
    }
    // Deterministic plans are an explicit offline fallback, never a gate on natural language.
    if (!allowModel || !this.understanding) {
      const direct = directPlan(question, context);
      if (direct) return { plan: direct, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
      throw new Error('Natural-language routing requires an available LLM call budget.');
    }
    onModelCall();
    const understandingInput: QueryUnderstandingInput = { question, context, signal };
    let understanding: QueryUnderstanding;
    try {
      understanding = await this.understanding.understand(understandingInput);
    } catch (error) {
      // Keep exact, validated queries usable during a provider outage. These
      // plans still execute database tools; they never supply canned answers.
      signal.throwIfAborted();
      const direct = directPlan(question, context);
      if (direct) return { plan: direct, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
      throw error;
    }
    const selectedProposal = context?.localProposalId ?? context?.proposalId;
    const extractedProposal = understanding.entities.find(entity => entity.type === 'proposalId')?.value;
    if (selectedProposal && extractedProposal && ![selectedProposal, context?.onChainProposalId].includes(extractedProposal)) {
      throw new Error('The question refers to a different proposal than the selected scope.');
    }

    if (understanding.intent === 'unsupported' || understanding.intent === 'greeting') {
      if (understanding.intent === 'unsupported') {
        const direct = directPlan(question, context);
        if (direct) return { plan: direct, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
      }
      return { plan: { kind: understanding.intent, tool: null, input: {}, answerMode: 'none' }, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
    }

    const plan = understanding.intent === 'overview' || understanding.intent === 'compliance-check' || understanding.isMultiTool
      ? { kind: 'workflow' as const, tool: null, input: {}, answerMode: 'details', understanding }
      : this.buildPlanFromUnderstanding(understanding, context);
    if (!plan) {
      return { plan: { kind: 'unsupported' as const, tool: null, input: {}, answerMode: 'details' }, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
    }

    return { plan, response: { content: '', latencyMs: 0, inputTokens: 0, outputTokens: 0, model: undefined as string | undefined } };
  }

  private buildPlanFromUnderstanding(understanding: QueryUnderstanding, context?: AgentContext) {
    const { intent, entities, filters, requiredTools, answerMode } = understanding;

    const getEntity = (type: string) => entities.find(e => e.type === type)?.value;
    const proposalId = context?.localProposalId ?? context?.proposalId ?? getEntity('proposalId');

    switch (intent) {
      case 'proposal-list': {
        const tool = this.tools.list('sql').find(t => t.name === 'listProposals');
        if (!tool) throw new Error('listProposals is not registered.');
        const status = getEntity('status');
        const from = filters.from;
        const to = filters.to;
        const limit = filters.limit ?? 20;
        const offset = filters.offset ?? 0;
        return { kind: 'proposal-list' as const, tool: 'listProposals', input: { status, from, to, limit, offset }, answerMode: answerMode === 'count' ? 'count' as const : 'list' as const };
      }

      case 'dao-statistics': {
        const tool = this.tools.list('sql').find(t => t.name === 'getDaoStatistics');
        if (!tool) throw new Error('getDaoStatistics is not registered.');
        return { kind: 'dao-statistics' as const, tool: 'getDaoStatistics', input: { daoId: context?.daoId ?? null }, answerMode: 'statistics' as const };
      }

      case 'proposal-members': {
        const tool = this.tools.list('sql').find(t => t.name === 'getProposalMembers');
        if (!tool) throw new Error('getProposalMembers is not registered.');
        if (!proposalId) return { kind: 'proposal-members' as const, tool: null, input: { proposalId: '' }, answerMode: 'members' };
        return { kind: 'proposal-members' as const, tool: 'getProposalMembers', input: { proposalId }, answerMode: 'members' as const };
      }

      case 'proposal-transactions': {
        const tool = this.tools.list('sql').find(t => t.name === 'getProposalTransactions');
        if (!tool) throw new Error('getProposalTransactions is not registered.');
        if (!proposalId) return { kind: 'proposal-transactions' as const, tool: null, input: { proposalId: '', operation: null, limit: 20, offset: 0 }, answerMode: 'transactions' };
        const operation = getEntity('operation') as 'CREATE' | 'FINALIZE' | 'CAST_VOTE' | null;
        const limit = filters.limit ?? 20;
        const offset = filters.offset ?? 0;
        return { kind: 'proposal-transactions' as const, tool: 'getProposalTransactions', input: { proposalId, operation, limit, offset }, answerMode: 'transactions' as const };
      }

      case 'proposal-details': {
        const tool = this.tools.list('sql').find(t => t.name === 'getProposal');
        if (!tool) throw new Error('getProposal is not registered.');
        if (!proposalId) return { kind: 'proposal-details' as const, tool: null, input: { proposalId: '' }, answerMode: 'details' };
        return { kind: 'proposal-details' as const, tool: 'getProposal', input: { proposalId }, answerMode: 'details' as const };
      }

      case 'proposal-votes': {
        const tool = this.tools.list('sql').find(t => t.name === 'getProposalVotes');
        if (!tool) throw new Error('getProposalVotes is not registered.');
        if (!proposalId) return { kind: 'proposal-votes' as const, tool: null, input: { proposalId: '' }, answerMode: 'votes' };
        return { kind: 'proposal-votes' as const, tool: 'getProposalVotes', input: { proposalId }, answerMode: answerMode === 'winner' ? 'winner' as const : 'votes' as const };
      }

      case 'member-activity': {
        const tool = this.tools.list('sql').find(t => t.name === 'getMemberActivity');
        if (!tool) throw new Error('getMemberActivity is not registered.');
        if (!proposalId) return { kind: 'member-activity' as const, tool: null, input: { proposalId: '', memberAddress: '' }, answerMode: 'activity' };
        const memberAddress = getEntity('memberAddress') ?? '';
        return { kind: 'member-activity' as const, tool: 'getMemberActivity', input: { proposalId, memberAddress }, answerMode: 'activity' as const };
      }

      case 'proposal-timeline': {
        const tool = this.tools.list('sql').find(t => t.name === 'getProposalTimeline');
        if (!tool) throw new Error('getProposalTimeline is not registered.');
        if (!proposalId) return { kind: 'proposal-timeline' as const, tool: null, input: { proposalId: '', daoId: context?.daoId ?? null }, answerMode: 'timeline' };
        return { kind: 'proposal-timeline' as const, tool: 'getProposalTimeline', input: { proposalId }, answerMode: 'timeline' as const };
      }

      case 'proposal-evidence': {
        const tool = this.tools.list('provenance').find(t => t.name === 'getProposalEvidence');
        if (!tool) throw new Error('getProposalEvidence is not registered.');
        if (!proposalId) return { kind: 'proposal-evidence' as const, tool: null, input: { proposalId: '', daoId: context?.daoId ?? null }, answerMode: 'evidence' };
        return { kind: 'proposal-evidence' as const, tool: 'getProposalEvidence', input: { proposalId }, answerMode: 'evidence' as const };
      }

      case 'evidence-lookup': {
        const tool = this.tools.list('provenance').find(t => t.name === 'getEvidenceById');
        if (!tool) throw new Error('getEvidenceById is not registered.');
        const evidenceId = getEntity('evidenceId') ?? '';
        return { kind: 'evidence-lookup' as const, tool: 'getEvidenceById', input: { evidenceId, datasetVersion: context?.datasetVersion }, answerMode: 'evidence-lookup' as const };
      }

      case 'contract-deployment': {
        const tool = this.tools.list('provenance').find(t => t.name === 'getContractDeployment');
        if (!tool) throw new Error('getContractDeployment is not registered.');
        return { kind: 'contract-deployment' as const, tool: 'getContractDeployment', input: {}, answerMode: 'deployment' as const };
      }

      case 'indexer-status': {
        const tool = this.tools.list('provenance').find(t => t.name === 'getIndexerStatus');
        if (!tool) throw new Error('getIndexerStatus is not registered.');
        const indexerName = getEntity('indexerName') ?? 'governance-events';
        return { kind: 'indexer-status' as const, tool: 'getIndexerStatus', input: { indexerName }, answerMode: 'indexer-status' as const };
      }

      case 'verify-rpc': {
        const tool = this.tools.list('provenance').find(t => t.name === 'verifyAgainstRpc');
        if (!tool) throw new Error('verifyAgainstRpc is not registered.');
        const evidenceId = getEntity('evidenceId') ?? '';
        return { kind: 'verify-rpc' as const, tool: 'verifyAgainstRpc', input: { evidenceId }, answerMode: 'verify-rpc' as const };
      }

      default:
        return null;
    }
  }
}
