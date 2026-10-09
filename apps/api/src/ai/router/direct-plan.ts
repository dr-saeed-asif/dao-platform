import type { AgentContext } from '../agents/agent.types';
import type { ProposalListPlan, DaoStatisticsPlan, ProposalMembersPlan, ProposalTransactionsPlan, ProposalDetailsPlan, ProposalVotesPlan, MemberActivityPlan, ProposalTimelinePlan, ProposalEvidencePlan, EvidenceLookupPlan } from './query-router';
import { listProposalsInputSchema } from '../tools/offchain/proposal.tools';
import { getProposalMembersInputSchema } from '../tools/offchain/member.tools';
import { getProposalTransactionsInputSchema } from '../tools/onchain/transaction.tools';
import { getProposalDetailsInputSchema } from '../tools/offchain/proposal-details.tools';
import { getProposalVotesInputSchema } from '../tools/offchain/proposal-votes.tools';
import { getMemberActivityInputSchema } from '../tools/offchain/member-activity.tools';
import { getProposalTimelineInputSchema } from '../tools/onchain/timeline.tools';
import { getProposalEvidenceInputSchema, getEvidenceByIdInputSchema } from '../tools/onchain/provenance.tools';
import type { QueryUnderstanding } from './query-understanding.service';

type DirectPlan = ProposalListPlan | DaoStatisticsPlan | ProposalMembersPlan | ProposalTransactionsPlan | ProposalDetailsPlan | ProposalVotesPlan | MemberActivityPlan | ProposalTimelinePlan | ProposalEvidencePlan | EvidenceLookupPlan | { kind: 'workflow'; tool: null; input: Record<string, never>; answerMode: 'compliance'; understanding: QueryUnderstanding };

/** Match whole, supported questions only. Additional filters must reach the planner. */
export function directPlan(question: string, context?: Pick<AgentContext, 'localProposalId' | 'proposalId' | 'onChainProposalId'>): DirectPlan | undefined {
  const q = question.trim().replace(/[?.!]+$/, '').replace(/\s+/g, ' ').toLowerCase();
  if (/^(?:(?:give me|show|show me) (?:the )?dao statistics|how many (?:proposals|votes|members|artefacts|artifacts)(?:\s*,?\s*(?:and\s+)?(?:proposals|votes|members|artefacts|artifacts))*\s+(?:exist|are there|are in the dao)|what is the (?:proposal|vote|member|artefact|artifact) count)$/.test(q)) {
    return { kind: 'dao-statistics', tool: 'getDaoStatistics', input: { daoId: null }, answerMode: 'statistics' };
  }
  const list = q.match(/^(?:(?:how many|which) proposals (?:are|are there)|(?:show|list|show me) (?:the )?)\s*(active|upcoming|ended|cancelled|canceled|approved|finalized|finalised)(?: proposals)?(?: now)?$/)
    ?? q.match(/^(?:show|list|show me) (all) proposals$/);
  if (list) {
    const status = list[1] === 'all' ? null : list[1].toUpperCase().replace('CANCELED', 'CANCELLED').replace('FINALISED', 'FINALIZED');
    return { kind: 'proposal-list', tool: 'listProposals', input: listProposalsInputSchema.parse({ status }), answerMode: q.startsWith('how many') ? 'count' : 'list' };
  }
  const ref = '(?:#?\\d+|onchain-\\d+|[0-9a-f]{8}-[0-9a-f-]{27})';
  const scopedProposalId = context?.localProposalId ?? context?.proposalId;
  const quorum = q.match(new RegExp(`^(?:did|has) proposal (${ref}) (?:satisfy|meet|reach|pass) (?:the )?quorum$`))
    ?? q.match(new RegExp(`^(?:is|was) (?:the )?quorum (?:met|reached|satisfied) (?:for|on) proposal (${ref})$`));
  const compliance = q.match(new RegExp(`^(?:run|check|calculate|verify) (?:the )?(all six governance compliance checks|all compliance checks|compliance|quorum|voting window|member eligibility|evidence integrity|lifecycle transitions|vote uniqueness|gov-0[1-6]) (?:for|of|on) (?:proposal (${ref})|this proposal)$`))
    ?? (quorum ? ['', 'quorum', quorum[1]] : null);
  const complianceId = compliance?.[2]?.replace(/^#/, '') ?? scopedProposalId;
  if (compliance && complianceId && (!scopedProposalId || [scopedProposalId, context?.onChainProposalId].includes(complianceId))) {
    const rules = [
      ['quorum', 'calculateQuorum'], ['voting window', 'checkVotingWindow'],
      ['member eligibility', 'checkMemberEligibility'], ['evidence integrity', 'checkEvidenceIntegrity'],
      ['lifecycle transitions', 'checkLifecycleTransitions'], ['vote uniqueness', 'checkVoteUniqueness'],
    ];
    const requiredTools = rules.filter(([label], index) => compliance[1] === label || compliance[1] === `gov-0${index + 1}` || compliance[1].includes('compliance')).map(([, tool]) => tool);
    return { kind: 'workflow', tool: null, input: {}, answerMode: 'compliance', understanding: {
      intent: 'compliance-check', entities: [{ type: 'proposalId', value: scopedProposalId ?? complianceId, confidence: 1 }],
      filters: {}, requiredTools: ['getProposal', ...requiredTools], needsRag: false, needsSql: true,
      needsCompliance: true, needsProvenance: false, answerMode: 'compliance', isMultiTool: true,
      reasoning: 'Exact compliance request resolved using registered deterministic tools.',
    } };
  }
  const evidence = q.match(/^(?:validate|verify|resolve|inspect) evidence ([^\s]+)$/) ?? q.match(/^(?:what is|inspect) evidence ([^\s]+)$/);
  if (evidence) return { kind: 'evidence-lookup', tool: 'getEvidenceById', input: getEvidenceByIdInputSchema.parse({ evidenceId: evidence[1] }), answerMode: 'evidence-lookup' };
  const timeline = q.match(new RegExp(`^(?:show|list|what is|give me) (?:the )?(?:timeline|history|events?) (?:for|of) proposal (${ref})$`));
  if (timeline) return { kind: 'proposal-timeline', tool: 'getProposalTimeline', input: getProposalTimelineInputSchema.parse({ proposalId: timeline[1].replace(/^#/, '') }), answerMode: 'timeline' };
  const broadTimeline = q.match(new RegExp(`^(?:when|what|show|list|give me).*?(?:timeline|history|events?).*proposal (${ref})$`));
  if (broadTimeline) return { kind: 'proposal-timeline', tool: 'getProposalTimeline', input: getProposalTimelineInputSchema.parse({ proposalId: broadTimeline[1].replace(/^#/, '') }), answerMode: 'timeline' };
  if (scopedProposalId && /^(?:show|list|what is|give me) (?:the )?(?:timeline|history|events?)(?: for| of)? (?:this|the) proposal$/.test(q)) return { kind: 'proposal-timeline', tool: 'getProposalTimeline', input: getProposalTimelineInputSchema.parse({ proposalId: scopedProposalId }), answerMode: 'timeline' };
  const proposalEvidence = q.match(new RegExp(`^(?:show|list|what is|give me) (?:the )?(?:evidence|proof) (?:for|of) proposal (${ref})$`));
  if (proposalEvidence) return { kind: 'proposal-evidence', tool: 'getProposalEvidence', input: getProposalEvidenceInputSchema.parse({ proposalId: proposalEvidence[1].replace(/^#/, '') }), answerMode: 'evidence' };
  const broadEvidence = q.match(new RegExp(`^(?:what|show|list|give me|which) .*?(?:evidence|proof).*proposal (${ref})$`));
  if (broadEvidence) return { kind: 'proposal-evidence', tool: 'getProposalEvidence', input: getProposalEvidenceInputSchema.parse({ proposalId: broadEvidence[1].replace(/^#/, '') }), answerMode: 'evidence' };
  if (scopedProposalId && /^(?:what|show|list|give me|which) (?:the )?(?:evidence|proof)(?: supports)?(?: for| of)? (?:this|the) proposal$/.test(q)) return { kind: 'proposal-evidence', tool: 'getProposalEvidence', input: getProposalEvidenceInputSchema.parse({ proposalId: scopedProposalId }), answerMode: 'evidence' };
  const activity = q.match(new RegExp(`^(?:did|has) (0x[0-9a-f]{40}) (?:vote|voted|cast a vote) (?:on|for) proposal (${ref})$`));
  if (activity) return { kind: 'member-activity', tool: 'getMemberActivity', input: getMemberActivityInputSchema.parse({ memberAddress: activity[1], proposalId: activity[2].replace(/^#/, '') }), answerMode: 'activity' };
  const winner = q.match(new RegExp(`^(?:which option won|what option won|what was the winning option) (?:for|on) proposal (${ref})$`));
  if (winner) return { kind: 'proposal-votes', tool: 'getProposalVotes', input: getProposalVotesInputSchema.parse({ proposalId: winner[1].replace(/^#/, '') }), answerMode: 'winner' };
  if (scopedProposalId && /^(?:which option won|what option won|what was the winning option)$/.test(q)) return { kind: 'proposal-votes', tool: 'getProposalVotes', input: getProposalVotesInputSchema.parse({ proposalId: scopedProposalId }), answerMode: 'winner' };
  const votes = q.match(new RegExp(`^(?:how many votes (?:did|does) proposal (${ref}) (?:receive|get)|(?:what is|show) the votes? (?:for|on) proposal (${ref}))$`));
  if (votes) return { kind: 'proposal-votes', tool: 'getProposalVotes', input: getProposalVotesInputSchema.parse({ proposalId: (votes[1] ?? votes[2]).replace(/^#/, '') }), answerMode: 'votes' };
  if (scopedProposalId && /^(?:how many votes|what is the vote count|show the votes)$/.test(q)) return { kind: 'proposal-votes', tool: 'getProposalVotes', input: getProposalVotesInputSchema.parse({ proposalId: scopedProposalId }), answerMode: 'votes' };
  const details = q.match(new RegExp(`^(?:what is|show|describe|tell me about|show me the details for) proposal (${ref})$`));
  if (details) return { kind: 'proposal-details', tool: 'getProposal', input: getProposalDetailsInputSchema.parse({ proposalId: details[1].replace(/^#/, '') }), answerMode: 'details' };
  if (scopedProposalId && /^(?:what is|show|describe|tell me about) (?:this|the) proposal$/.test(q)) return { kind: 'proposal-details', tool: 'getProposal', input: getProposalDetailsInputSchema.parse({ proposalId: scopedProposalId }), answerMode: 'details' };
  const members = q.match(new RegExp(`^(?:how many (?:eligible |assigned )?(?:members|voters) does proposal (${ref}) have|(?:list|show) (?:the )?(?:members|voters) assigned to proposal (${ref})|who can vote on proposal (${ref})|what is the total voting power (?:of|for) proposal (${ref}))$`));
  const scopedMembers = /^(?:who can vote on this proposal|how many (?:eligible |assigned )?members does this proposal have|list members assigned to this proposal|what is the total voting power of (?:its|this proposal's) assigned members)$/.test(q);
  const proposalId = members?.slice(1).find(Boolean)?.replace(/^#/, '') ?? (scopedMembers ? context?.localProposalId ?? context?.proposalId : undefined);
  if (proposalId) return { kind: 'proposal-members', tool: 'getProposalMembers', input: getProposalMembersInputSchema.parse({ proposalId }), answerMode: 'members' };
  const transactions = q.match(new RegExp(`^(?:show|list) (?:all )?transactions (?:for|of) proposal (${ref})$`));
  if (transactions) return { kind: 'proposal-transactions', tool: 'getProposalTransactions', input: getProposalTransactionsInputSchema.parse({ proposalId: transactions[1].replace(/^#/, '') }), answerMode: 'transactions' };
  return undefined;
}
