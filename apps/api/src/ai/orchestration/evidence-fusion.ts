import type { AgentClaim, AgentEvidence } from '../agents/agent.types';
import type { ListProposalsOutput } from '../tools/offchain/proposal.tools';
import type { GetDaoStatisticsOutput } from '../tools/offchain/statistics.tools';
import type { GetProposalMembersOutput } from '../tools/offchain/member.tools';
import type { GetProposalTransactionsOutput } from '../tools/onchain/transaction.tools';
import type { GetContractDeploymentOutput } from '../tools/onchain/deployment.tools';
import type { GetIndexerStatusOutput } from '../tools/onchain/transaction.tools';
import type { VerifyAgainstRpcOutput } from '../tools/onchain/transaction.tools';
import type { GetProposalDetailsOutput } from '../tools/offchain/proposal-details.tools';
import type { GetProposalVotesOutput } from '../tools/offchain/proposal-votes.tools';
import type { GetMemberActivityOutput } from '../tools/offchain/member-activity.tools';
import type { GetProposalTimelineOutput } from '../tools/onchain/timeline.tools';
import type { GetProposalEvidenceOutput, GetEvidenceByIdOutput } from '../tools/onchain/provenance.tools';
import type { ComplianceResult } from '../tools/compliance/compliance.tools';

export interface AnswerStatement {
  id: string;
  claim: AgentClaim;
}

export function fuseComplianceResult(result: ComplianceResult, proposalId: string) {
  const evidenceId = `compliance:${result.ruleId}:${proposalId}`;
  const evidence: AgentEvidence[] = [{
    evidenceId,
    sourceType: 'COMPLIANCE',
    proposalId,
    data: { ...result, valid: result.result !== 'INDETERMINATE' },
  }];
  const reason = result.reason ? ` ${result.reason}.` : '';
  const comparison = typeof result.explanationData?.comparison === 'string'
    ? ` Threshold comparison: ${result.explanationData.comparison}.` : '';
  const checked = result.inputs?.votesChecked ?? result.inputs?.votersChecked;
  const voteCount = typeof checked === 'number' ? ` Checked ${checked} recorded vote${checked === 1 ? '' : 's'}.` : '';
  const invalid = result.explanationData?.invalidEvidenceIds;
  const invalidCount = Array.isArray(invalid) ? ` ${invalid.length} evidence record${invalid.length === 1 ? '' : 's'} failed this rule.` : '';
  const statements: AnswerStatement[] = [{
    id: result.ruleId,
    claim: {
      text: `${result.ruleId} result is ${result.result}.${reason}${comparison}${voteCount}${invalidCount}`,
      type: 'COMPLIANCE',
      evidenceIds: [evidenceId],
    },
  }];
  return { evidence, statements };
}

export function fuseProposalTimeline(result: GetProposalTimelineOutput, runId: string) {
  const snapshotId = `onchain:proposal-timeline:${result.proposalId}:${runId}`;
  const evidence: AgentEvidence[] = [{ evidenceId: snapshotId, sourceType: 'ON_CHAIN_EVENT', proposalId: result.proposalId, data: { valid: result.found, sourceTool: 'getProposalTimeline', count: result.events.length } }];
  evidence.push(...result.events.map((event) => ({ evidenceId: event.evidenceId, sourceType: 'ON_CHAIN_EVENT' as const, proposalId: result.proposalId, data: { ...event, valid: true } })));
  const text = !result.found ? `Proposal ${result.proposalId} was not found in the configured governance deployment.` : `Proposal ${result.onChainProposalId ?? result.proposalId} has ${result.events.length} canonical governance event${result.events.length === 1 ? '' : 's'} in timeline order.`;
  const statements: AnswerStatement[] = [{ id: 'timeline-count', claim: { text, type: 'NUMERIC', evidenceIds: [snapshotId] } }, ...result.events.map((event, index) => ({ id: `event-${index}`, claim: { text: `${event.eventName} at block ${event.blockNumber}, transaction ${event.transactionHash}, log ${event.logIndex}, sender ${event.transactionSender}.`, type: 'FACTUAL' as const, evidenceIds: [event.evidenceId] } }))];
  return { evidence, statements };
}

export function fuseProposalEvidence(result: GetProposalEvidenceOutput, runId: string) {
  const snapshotId = `provenance:proposal:${result.proposalId}:${runId}`;
  const evidence: AgentEvidence[] = [{ evidenceId: snapshotId, sourceType: 'STRUCTURED_DB', proposalId: result.proposalId, data: { ...result, valid: result.found } }];
  evidence.push(...result.evidenceIds.map((evidenceId) => ({ evidenceId, sourceType: evidenceId.startsWith('event:') ? 'ON_CHAIN_EVENT' as const : 'ARTEFACT' as const, proposalId: result.proposalId, data: { valid: true, sourceTool: 'getProposalEvidence' } })));
  const text = !result.found ? `Proposal ${result.proposalId} was not found in the configured governance deployment.` : `Proposal ${result.onChainProposalId ?? result.proposalId} has ${result.evidenceIds.length} stored canonical event and linked artefact evidence record${result.evidenceIds.length === 1 ? '' : 's'}.`;
  return { evidence, statements: [{ id: 'evidence-count', claim: { text, type: 'NUMERIC' as const, evidenceIds: [snapshotId] } }, ...result.evidenceIds.map((evidenceId, index) => ({ id: `evidence-${index}`, claim: { text: evidenceId, type: 'FACTUAL' as const, evidenceIds: [evidenceId] } }))] };
}

export function fuseEvidenceLookup(result: GetEvidenceByIdOutput, runId: string) {
  const snapshotId = `provenance:evidence:${runId}`;
  const evidence: AgentEvidence[] = [{ evidenceId: snapshotId, sourceType: result.sourceType === 'governance-event' ? 'ON_CHAIN_EVENT' : 'STRUCTURED_DB', proposalId: result.proposalId, data: { ...result, valid: result.valid } }];
  if (result.evidenceId !== snapshotId) evidence.push({ evidenceId: result.evidenceId, sourceType: result.sourceType === 'governance-event' ? 'ON_CHAIN_EVENT' : result.sourceType === 'artefact' ? 'ARTEFACT' : result.sourceType === 'document-chunk' ? 'DOCUMENT_CHUNK' : 'STRUCTURED_DB', proposalId: result.proposalId, data: { ...result, valid: result.valid } });
  const text = `${result.evidenceId} is ${result.valid ? 'valid' : 'invalid'} (${result.sourceType}).${result.warnings.length ? ` Warnings: ${result.warnings.join(' ')}` : ''}`;
  return { evidence, statements: [{ id: 'lookup', claim: { text, type: 'FACTUAL' as const, evidenceIds: [snapshotId] } }] };
}

export function fuseProposalDetails(result: GetProposalDetailsOutput, runId: string) {
  const snapshotId = `structured:proposal:${result.proposalId}:${runId}`;
  const evidence: AgentEvidence[] = [{ evidenceId: snapshotId, sourceType: 'STRUCTURED_DB', proposalId: result.proposalId, data: { ...result, valid: result.found } }];
  evidence.push(...result.evidenceIds.map((evidenceId) => ({ evidenceId, sourceType: 'ON_CHAIN_EVENT' as const, proposalId: result.proposalId, data: { valid: true, sourceTool: 'getProposal' } })));
  if (!result.found) return { evidence, statements: [{ id: 'not-found', claim: { text: `Proposal ${result.proposalId} was not found in the configured governance deployment.`, type: 'FACTUAL' as const, evidenceIds: [snapshotId] } }] };
  const statements: AnswerStatement[] = [
    { id: 'details', claim: { text: `Proposal ${result.onChainProposalId ?? result.proposalId}, "${result.title}", is ${result.status}. It was created by ${result.creator}, with voting from ${result.startsAt} to ${result.endsAt}. It has ${result.memberCount} assigned member${result.memberCount === 1 ? '' : 's'} and ${result.voteCount} recorded vote${result.voteCount === 1 ? '' : 's'}.`, type: 'FACTUAL', evidenceIds: [snapshotId] } },
    { id: 'options', claim: { text: `Voting options: ${result.options.map((option) => `${option.optionIndex}: ${option.label}`).join(', ')}.`, type: 'FACTUAL', evidenceIds: [snapshotId] } },
  ];
  return { evidence, statements };
}

export function fuseProposalVotes(result: GetProposalVotesOutput, runId: string, mode: 'votes' | 'winner') {
  const snapshotId = `structured:proposal-votes:${result.proposalId}:${runId}`;
  const evidence: AgentEvidence[] = [{ evidenceId: snapshotId, sourceType: 'STRUCTURED_DB', proposalId: result.proposalId, data: { ...result, valid: result.found } }];
  evidence.push(...result.evidenceIds.map((evidenceId) => ({ evidenceId, sourceType: 'ON_CHAIN_EVENT' as const, proposalId: result.proposalId, data: { valid: true, sourceTool: 'getProposalVotes' } })));
  if (!result.found) return { evidence, statements: [{ id: 'not-found', claim: { text: `Proposal ${result.proposalId} was not found in the configured governance deployment.`, type: 'FACTUAL' as const, evidenceIds: [snapshotId] } }] };
  const winner = result.winningOption ? `Winning option is ${result.winningOption.optionLabel ?? result.winningOption.optionIndex} with ${result.winningOption.totalVotingPower} voting power.` : result.tied ? 'The vote is tied; there is no single winning option.' : 'No option has recorded votes.';
  const statements: AnswerStatement[] = mode === 'winner'
    ? [{ id: 'winner', claim: { text: winner, type: 'FACTUAL' as const, evidenceIds: [snapshotId] } }]
    : [{ id: 'count', claim: { text: `Proposal ${result.onChainProposalId ?? result.proposalId} received ${result.count} vote${result.count === 1 ? '' : 's'} with total voting power ${result.totalVotingPower}.`, type: 'NUMERIC' as const, evidenceIds: [snapshotId] } }, ...result.optionTotals.map((option) => ({ id: `option-${option.optionIndex}`, claim: { text: `Option ${option.optionLabel ?? option.optionIndex} received ${option.voteCount} vote${option.voteCount === 1 ? '' : 's'} and ${option.totalVotingPower} voting power.`, type: 'NUMERIC' as const, evidenceIds: [snapshotId] } }))];
  return { evidence, statements };
}

export function fuseMemberActivity(result: GetMemberActivityOutput, runId: string) {
  const snapshotId = `structured:member-activity:${result.proposalId}:${result.memberAddress}:${runId}`;
  const evidence: AgentEvidence[] = [{ evidenceId: snapshotId, sourceType: 'STRUCTURED_DB', proposalId: result.proposalId, data: { ...result, valid: result.found } }];
  evidence.push(...result.evidenceIds.map((evidenceId) => ({ evidenceId, sourceType: 'ON_CHAIN_EVENT' as const, proposalId: result.proposalId, data: { valid: true, sourceTool: 'getMemberActivity' } })));
  const text = !result.found ? `Proposal ${result.proposalId} was not found in the configured governance deployment.` : `Member ${result.memberAddress} ${result.hasVoted ? 'has voted' : 'has not voted'} on proposal ${result.onChainProposalId ?? result.proposalId}.${result.assignment ? ` The member is assigned with voting weight ${result.assignment.votingWeight}.` : ' The member is not currently assigned.'}`;
  return { evidence, statements: [{ id: 'activity', claim: { text, type: 'FACTUAL' as const, evidenceIds: [snapshotId] } }] };
}

export function fuseProposalList(
  result: ListProposalsOutput,
  runId: string,
  mode: 'count' | 'list',
) {
  // This ID identifies the actual query result included in this run, not a stored event.
  const snapshotId = `structured:listProposals:${runId}`;
  const evidence: AgentEvidence[] = [
    {
      evidenceId: snapshotId,
      sourceType: 'STRUCTURED_DB',
      data: {
        valid: true,
        sourceTool: 'listProposals',
        kind: 'query-result',
        count: result.count,
        query: result.query,
      },
    },
    ...result.proposals.map((proposal) => ({
      evidenceId: `structured:proposal:${proposal.proposalId}`,
      sourceType: 'STRUCTURED_DB',
      proposalId: proposal.proposalId,
      data: { ...proposal, valid: true },
    })),
  ];
  const status = result.query.status
    ? `${result.query.status.toLowerCase()} `
    : '';
  const bounds =
    result.query.from || result.query.to
      ? ` with voting starts from ${result.query.from ?? 'any earlier date'} through ${result.query.to ?? 'any later date'}`
      : '';
  const scope = result.query.daoId
    ? ` in DAO ${JSON.stringify(result.query.daoId)}`
    : ' in the configured governance deployment';
  const total = `${result.count} ${status}proposal${result.count === 1 ? '' : 's'} match${result.count === 1 ? 'es' : ''}${scope}${bounds} as of ${result.query.asOf}.`;
  const statements: AnswerStatement[] = [
    {
      id: 'total',
      claim: { text: total, type: 'NUMERIC', evidenceIds: [snapshotId] },
    },
  ];
  if (mode === 'list') {
    for (const [index, proposal] of result.proposals.entries()) {
      statements.push({
        id: `row-${index}`,
        claim: {
          text: `${JSON.stringify(proposal.title)} — proposal ${proposal.onChainProposalId ?? proposal.proposalId} (local ID: ${proposal.proposalId}), ${proposal.status.toLowerCase()}. Creator: ${proposal.creator}. Voting: ${proposal.startsAt} to ${proposal.endsAt}. Eligible members: ${proposal.memberCount}; recorded votes: ${proposal.voteCount}.`,
          type: 'FACTUAL' as const,
          evidenceIds: [`structured:proposal:${proposal.proposalId}`],
        },
      });
    }
    if (result.count > result.proposals.length || result.query.offset > 0) {
      const first = result.proposals.length ? result.query.offset + 1 : 0;
      const last = result.proposals.length
        ? result.query.offset + result.proposals.length
        : 0;
      statements.push({
        id: 'page',
        claim: {
          text: result.proposals.length
            ? `Showing matches ${first}–${last} of ${result.count}.`
            : `No rows are present on this page (offset ${result.query.offset}); the total matching count is ${result.count}.`,
          type: 'FACTUAL' as const,
          evidenceIds: [snapshotId],
        },
      });
    }
  }
  return { evidence, statements };
}

export function fuseDaoStatistics(
  result: GetDaoStatisticsOutput,
  runId: string,
) {
  const snapshotId = `structured:dao-statistics:${runId}`;
  const evidence: AgentEvidence[] = [
    {
      evidenceId: snapshotId,
      sourceType: 'STRUCTURED_DB',
      data: {
        valid: true,
        sourceTool: 'getDaoStatistics',
        kind: 'aggregate-result',
        proposalCount: result.proposalCount,
        voteCount: result.voteCount,
        memberCount: result.memberCount,
        artefactCount: result.artefactCount,
        asOf: result.asOf,
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        daoId: result.daoId,
      },
    },
  ];
  evidence.push(...result.evidenceIds.map((evidenceId) => ({ evidenceId, sourceType: 'STRUCTURED_DB' as const, data: { valid: true, sourceTool: 'getDaoStatistics' } })));
  const scope = ' in the configured governance deployment';
  const statements: AnswerStatement[] = [
    {
      id: 'proposal-count',
      claim: {
        text: `${result.proposalCount} proposal${result.proposalCount === 1 ? '' : 's'}${scope} as of ${result.asOf}.`,
        type: 'NUMERIC',
        evidenceIds: [snapshotId],
      },
    },
    {
      id: 'vote-count',
      claim: {
        text: `${result.voteCount} vote${result.voteCount === 1 ? '' : 's'} recorded${scope} as of ${result.asOf}.`,
        type: 'NUMERIC',
        evidenceIds: [snapshotId],
      },
    },
    {
      id: 'member-count',
      claim: {
        text: `${result.memberCount} distinct member${result.memberCount === 1 ? '' : 's'} assigned${scope} as of ${result.asOf}.`,
        type: 'NUMERIC',
        evidenceIds: [snapshotId],
      },
    },
    {
      id: 'artefact-count',
      claim: {
        text: `${result.artefactCount} artefact${result.artefactCount === 1 ? '' : 's'} linked${scope} as of ${result.asOf}.`,
        type: 'NUMERIC',
        evidenceIds: [snapshotId],
      },
    },
  ];
  return { evidence, statements };
}

export function fuseProposalMembers(
  result: GetProposalMembersOutput,
  runId: string,
) {
  const snapshotId = `structured:proposal-members:${runId}`;
  const evidence: AgentEvidence[] = [
    {
      evidenceId: snapshotId,
      sourceType: 'STRUCTURED_DB',
      data: {
        valid: true,
        sourceTool: 'getProposalMembers',
        kind: 'query-result',
        proposalId: result.proposalId,
        onChainProposalId: result.onChainProposalId,
        count: result.count,
        totalVotingPower: result.totalVotingPower,
        members: result.members,
        asOf: result.asOf,
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        daoId: result.daoId,
      },
    },
  ];
  evidence.push(...result.evidenceIds.map((evidenceId) => ({ evidenceId, sourceType: 'ON_CHAIN_EVENT' as const, proposalId: result.proposalId, data: { valid: true, sourceTool: 'getProposalMembers' } })));
  const scope = ' in the configured governance deployment';
  const onChainId = result.onChainProposalId
    ? ` (on-chain ID: ${result.onChainProposalId})`
    : '';
  const statements: AnswerStatement[] = [
    {
      id: 'total-count',
      claim: {
        text: `Proposal ${result.proposalId}${onChainId} has ${result.count} assigned member${result.count === 1 ? '' : 's'} with total voting power ${result.totalVotingPower}${scope} as of ${result.asOf}.`,
        type: 'NUMERIC',
        evidenceIds: [snapshotId],
      },
    },
    ...result.members.map((member, index) => ({
      id: `member-${index}`,
      claim: {
        text: `Member ${member.address} has voting power ${member.votingPower}.`,
        type: 'FACTUAL' as const,
        evidenceIds: [snapshotId],
      },
    })),
  ];
  return { evidence, statements };
}

export function fuseProposalTransactions(
  result: GetProposalTransactionsOutput,
  runId: string,
) {
  const snapshotId = `structured:proposal-transactions:${runId}`;
  const evidence: AgentEvidence[] = [
    {
      evidenceId: snapshotId,
      sourceType: 'STRUCTURED_DB',
      data: {
        valid: true,
        sourceTool: 'getProposalTransactions',
        kind: 'query-result',
        proposalId: result.proposalId,
        onChainProposalId: result.onChainProposalId,
        count: result.count,
        transactions: result.transactions,
        asOf: result.asOf,
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        daoId: result.daoId,
      },
    },
  ];
  const scope = result.daoId
    ? ` in DAO ${JSON.stringify(result.daoId)}`
    : ' in the configured governance deployment';
  const onChainId = result.onChainProposalId
    ? ` (on-chain ID: ${result.onChainProposalId})`
    : '';
  const statements: AnswerStatement[] = [
    {
      id: 'total-count',
      claim: {
        text: `Proposal ${result.proposalId}${onChainId} has ${result.count} transaction${result.count === 1 ? '' : 's'}${scope} as of ${result.asOf}.`,
        type: 'NUMERIC',
        evidenceIds: [snapshotId],
      },
    },
    ...result.transactions.map((tx, index) => ({
      id: `tx-${index}`,
      claim: {
        text: `Transaction ${tx.hash} with operation ${tx.operation}, sender ${tx.sender}, block ${tx.blockNumber}, status ${tx.status}, gas ${tx.gasUsed}.`,
        type: 'FACTUAL' as const,
        evidenceIds: [snapshotId],
      },
    })),
  ];
  return { evidence, statements };
}

export function fuseContractDeployment(
  result: GetContractDeploymentOutput,
) {
  if (!result.found || result.evidenceIds.length === 0) {
    return { evidence: [], statements: [] };
  }
  const snapshotId = `deployment:${result.chainId}:${result.contractAddress}`;
  const evidence: AgentEvidence[] = [
    {
      evidenceId: snapshotId,
      sourceType: 'STRUCTURED_DB',
      data: {
        valid: true,
        sourceTool: 'getContractDeployment',
        kind: 'query-result',
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        deploymentTransaction: result.deploymentTransaction,
        deploymentBlockNumber: result.deploymentBlockNumber,
        deploymentBlockHash: result.deploymentBlockHash,
        deploymentTimestamp: result.deploymentTimestamp,
        initialOwner: result.initialOwner,
        contractVersion: result.contractVersion,
        abiVersion: result.abiVersion,
        compilerVersion: result.compilerVersion,
        bytecodeHash: result.bytecodeHash,
        metadata: result.metadata,
        asOf: result.asOf,
      },
    },
  ];
  const scope = ' in the configured governance deployment';
  const statements: AnswerStatement[] = [
    {
      id: 'chain-id',
      claim: {
        text: `Governance contract is deployed on chain ${result.chainId}.`,
        type: 'FACTUAL' as const,
        evidenceIds: [snapshotId],
      },
    },
    {
      id: 'contract-address',
      claim: {
        text: `Governance contract address is ${result.contractAddress}.`,
        type: 'FACTUAL' as const,
        evidenceIds: [snapshotId],
      },
    },
    ...(result.deploymentTransaction
      ? [{
          id: 'deployment-tx',
          claim: {
            text: `Contract was deployed by transaction ${result.deploymentTransaction} at block ${result.deploymentBlockNumber} (${result.deploymentTimestamp}).`,
            type: 'FACTUAL' as const,
            evidenceIds: [snapshotId],
          },
        }]
      : []),
    ...(result.contractVersion
      ? [{
          id: 'contract-version',
          claim: {
            text: `Contract version is ${result.contractVersion}.`,
            type: 'FACTUAL' as const,
            evidenceIds: [snapshotId],
          },
        }]
      : []),
    ...(result.compilerVersion
      ? [{
          id: 'compiler-version',
          claim: {
            text: `Compiled with ${result.compilerVersion}.`,
            type: 'FACTUAL' as const,
            evidenceIds: [snapshotId],
          },
        }]
      : []),
    ...(result.bytecodeHash
      ? [{
          id: 'bytecode-hash',
          claim: {
            text: `Bytecode hash is ${result.bytecodeHash}.`,
            type: 'FACTUAL' as const,
            evidenceIds: [snapshotId],
          },
        }]
      : []),
  ];
  return { evidence, statements };
}

export function fuseIndexerStatus(
  result: GetIndexerStatusOutput,
  runId: string,
) {
  if (!result.found || result.evidenceIds.length === 0) {
    return { evidence: [], statements: [] };
  }
  const snapshotId = result.evidenceIds[0];
  const evidence: AgentEvidence[] = [
    {
      evidenceId: snapshotId,
      sourceType: 'STRUCTURED_DB',
      data: {
        valid: true,
        sourceTool: 'getIndexerStatus',
        kind: 'query-result',
        chainId: result.chainId,
        contractAddress: result.contractAddress,
        indexerName: result.indexerName,
        indexerVersion: result.indexerVersion,
        processedBlockNumber: result.processedBlockNumber,
        processedBlockHash: result.processedBlockHash,
        checkpointTimestamp: result.checkpointTimestamp,
        observedAt: result.observedAt,
        freshness: result.freshness,
        asOf: result.observedAt,
      },
    },
  ];
  const scope = ' in the configured governance deployment';
  const freshnessText =
    result.freshness === 'FRESH'
      ? 'fresh'
      : result.freshness === 'STALE'
        ? 'stale'
        : 'unknown';
  const blockInfo = result.processedBlockNumber
    ? `at block ${result.processedBlockNumber}${result.processedBlockHash ? ` (${result.processedBlockHash})` : ''}`
    : 'no blocks processed';
  const statements: AnswerStatement[] = [
    {
      id: 'indexer-name',
      claim: {
        text: `Indexer "${result.indexerName}" (version ${result.indexerVersion}) is running${scope}.`,
        type: 'FACTUAL' as const,
        evidenceIds: [snapshotId],
      },
    },
    {
      id: 'processed-block',
      claim: {
        text: `The indexer has processed ${blockInfo} as of ${result.checkpointTimestamp ?? result.observedAt}.`,
        type: 'FACTUAL' as const,
        evidenceIds: [snapshotId],
      },
    },
    {
      id: 'freshness',
      claim: {
        text: `Indexer freshness is ${freshnessText}.`,
        type: 'FACTUAL' as const,
        evidenceIds: [snapshotId],
      },
    },
  ];
  return { evidence, statements };
}

export function fuseVerifyAgainstRpc(
  result: VerifyAgainstRpcOutput,
  runId: string,
) {
  const snapshotId = `verify-rpc:${result.evidenceId}:${runId}`;
  const evidence: AgentEvidence[] = [
    {
      evidenceId: snapshotId,
      sourceType: 'ON_CHAIN_EVENT',
      proposalId: (result.indexed.eventArgs?.proposalId as string) ?? null,
      data: {
        valid: result.rpcVerified,
        sourceTool: 'verifyAgainstRpc',
        kind: 'verification-result',
        ...result,
      },
    },
  ];
  const matches = Object.entries(result.matches)
    .filter(([, match]) => match)
    .map(([key]) => key)
    .join(', ');
  const diffs = result.differences.length > 0 ? result.differences.join('; ') : 'none';
  const text = result.rpcVerified
    ? `Event ${result.evidenceId} verified on-chain. All fields match: ${matches}.`
    : `Event ${result.evidenceId} failed RPC verification. Differences: ${diffs}.`;
  const statements: AnswerStatement[] = [
    {
      id: 'verification-result',
      claim: {
        text,
        type: result.rpcVerified ? ('FACTUAL' as const) : ('FACTUAL' as const),
        evidenceIds: [snapshotId],
      },
    },
    ...(result.differences.length > 0
      ? [
          {
            id: 'differences',
            claim: {
              text: `Detailed differences: ${diffs}`,
              type: 'FACTUAL' as const,
              evidenceIds: [snapshotId],
            },
          },
        ]
      : []),
    ...(result.warnings.length > 0
      ? [
          {
            id: 'warnings',
            claim: {
              text: `Warnings: ${result.warnings.join('; ')}`,
              type: 'FACTUAL' as const,
              evidenceIds: [snapshotId],
            },
          },
        ]
      : []),
  ];
  return { evidence, statements };
}
