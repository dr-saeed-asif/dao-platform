import { Proposal, ProposalStatus, ProposalType } from "@dao-platform/domain";
import { AssignmentRepository } from "../ports/assignment-repository.js";
import { ChainTransactionRepository, RecordChainTransactionInput } from "../ports/chain-transaction-repository.js";
import { GovernanceChainEvent, GovernanceChainGateway } from "../ports/governance-chain.gateway.js";
import { ProposalRepository } from "../ports/proposal-repository.js";
import { SyncStateRepository } from "../ports/sync-state-repository.js";
import { TransactionManager } from "../ports/transaction-manager.js";
import { VoteRepository } from "../ports/vote-repository.js";

const INDEXER = "governance-full";
export interface SyncCounts { proposals: number; assignments: number; unassignments: number; votes: number; cancellations: number; finalizations: number }

export class SyncGovernanceUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly assignments: AssignmentRepository,
    private readonly votes: VoteRepository,
    private readonly transactions: ChainTransactionRepository,
    private readonly state: SyncStateRepository,
    private readonly chain: GovernanceChainGateway,
    private readonly transactionManager: TransactionManager,
    private readonly deploymentBlock: bigint,
    private readonly maxBlockRange: bigint,
  ) {}

  async execute(full = false) {
    const latest = await this.chain.latestBlockNumber();
    const cursor = full ? null : await this.state.getLastProcessedBlock(INDEXER);
    const fromBlock = cursor === null ? this.deploymentBlock : cursor + 1n;
    const counts: SyncCounts = { proposals: 0, assignments: 0, unassignments: 0, votes: 0, cancellations: 0, finalizations: 0 };
    let batches = 0;
    for (let start = fromBlock; start <= latest; start += this.maxBlockRange) {
      const end = min(start + this.maxBlockRange - 1n, latest);
      const events = await this.chain.findGovernanceEvents(start, end);
      for (const event of events) await this.apply(event, counts);
      await this.state.setLastProcessedBlock(INDEXER, end);
      batches += 1;
    }
    return { mode: full ? "FULL" : "INCREMENTAL", fromBlock: fromBlock.toString(), toBlock: latest.toString(), batches, indexed: counts };
  }

  private async apply(event: GovernanceChainEvent, counts: SyncCounts) {
    if (event.kind === "PROPOSAL_CREATED") {
      let proposal = await this.proposals.findByOnChainId(event.onChainProposalId);
      if (!proposal) {
        const document = decodeMetadata(event.metadataURI);
        const optionLabels = stringArray(document.options, event.optionCount);
        const now = new Date();
        proposal = Proposal.rehydrate({
          id: `onchain-${event.onChainProposalId}`,
          daoId: text(document.daoId, "recovered-dao"),
          creatorAddress: event.creatorAddress,
          title: text(document.title, `On-chain proposal #${event.onChainProposalId}`),
          purpose: text(document.purpose, "Recovered on-chain governance proposal"),
          description: text(document.description, "Recovered from CyberChain governance events."),
          type: proposalType(event.proposalType, document.type),
          optionLabels,
          startsAt: new Date(event.startsAt * 1000),
          endsAt: new Date(event.endsAt * 1000),
          metadata: { ...document, metadataURI: event.metadataURI, metadataHash: event.metadataHash, recoveredFromChain: true },
          status: ProposalStatus.Active,
          onChainId: event.onChainProposalId,
          createdAt: now,
          updatedAt: now,
        });
        await this.transactionManager.runInTransaction(async () => {
          await this.proposals.insert(proposal!, { idempotencyKey: `onchain-${event.onChainProposalId}` });
          await this.record(event, proposal!.id, "CREATE_PROPOSAL", event.creatorAddress);
        });
        counts.proposals += 1;
      }
      return;
    }

    const proposal = await this.proposals.findByOnChainId(event.onChainProposalId);
    if (!proposal) return;
    const now = new Date();
    await this.transactionManager.runInTransaction(async () => {
      if (event.kind === "MEMBER_ASSIGNED") {
        await this.assignments.addMany([{ proposalId: proposal.id, walletAddress: event.memberAddress, transactionHash: event.transactionHash, assignedAt: now }]);
        await this.record(event, proposal.id, "ASSIGN_MEMBERS", event.memberAddress);
        counts.assignments += 1;
      } else if (event.kind === "MEMBER_UNASSIGNED") {
        await this.assignments.remove(proposal.id, event.memberAddress);
        await this.record(event, proposal.id, "UNASSIGN_MEMBER", event.memberAddress);
        counts.unassignments += 1;
      } else if (event.kind === "VOTE_CAST") {
        await this.votes.upsert({ proposalId: proposal.id, onChainProposalId: event.onChainProposalId, voterAddress: event.voterAddress, optionIndex: event.optionIndex, transactionHash: event.transactionHash, blockNumber: event.blockNumber, blockHash: event.blockHash, gasUsed: event.gasUsed, confirmedAt: now });
        await this.record(event, proposal.id, "CAST_VOTE", event.voterAddress);
        counts.votes += 1;
      } else if (event.kind === "PROPOSAL_CANCELLED") {
        await this.proposals.updateStatus(proposal.id, ProposalStatus.Cancelled, now);
        await this.record(event, proposal.id, "CANCEL_PROPOSAL", proposal.creatorAddress.value);
        counts.cancellations += 1;
      } else if (event.kind === "PROPOSAL_FINALIZED") {
        await this.proposals.updateStatus(proposal.id, ProposalStatus.Closed, now);
        await this.record(event, proposal.id, "FINALIZE_PROPOSAL", proposal.creatorAddress.value);
        counts.finalizations += 1;
      }
    });
  }

  private record(event: GovernanceChainEvent, proposalId: string, operation: RecordChainTransactionInput["operation"], walletAddress: string) {
    return this.transactions.record({ transactionHash: event.transactionHash, blockNumber: event.blockNumber, blockHash: event.blockHash, gasUsed: event.gasUsed, status: "CONFIRMED", operation, proposalId, walletAddress, recordedAt: new Date() });
  }
}

function decodeMetadata(uri: string): Record<string, unknown> {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) return {};
  try { const value = JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8")); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; }
}
function text(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function stringArray(value: unknown, count: number) { const items = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; return items.length === count ? items : Array.from({ length: count }, (_, index) => `Option ${index + 1}`); }
function proposalType(code: number, metadataType: unknown): ProposalType { const values: Record<number, ProposalType> = { 0: ProposalType.Standard, 1: ProposalType.Treasury, 2: ProposalType.ParameterChange, 3: ProposalType.Membership, 255: ProposalType.Other }; return values[code] ?? (Object.values(ProposalType).includes(metadataType as ProposalType) ? metadataType as ProposalType : ProposalType.Other); }
function min(a: bigint, b: bigint) { return a < b ? a : b; }
