import { GovernanceChainGateway } from "../ports/governance-chain.gateway.js";
import { ChainTransactionRepository } from "../ports/chain-transaction-repository.js";
import { ProposalRepository } from "../ports/proposal-repository.js";
import { SyncStateRepository } from "../ports/sync-state-repository.js";
import { VoteRepository } from "../ports/vote-repository.js";
import { TransactionManager } from "../ports/transaction-manager.js";

const INDEXER = "governance-votes";

export class SyncVotesUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
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
    const cursor = full
      ? null
      : await this.state.getLastProcessedBlock(INDEXER);
    const fromBlock = cursor === null ? this.deploymentBlock : cursor + 1n;
    if (fromBlock > latest)
      return {
        fromBlock: fromBlock.toString(),
        toBlock: latest.toString(),
        indexed: 0,
      };
    let indexed = 0;
    let batches = 0;
    for (
      let batchStart = fromBlock;
      batchStart <= latest;
      batchStart += this.maxBlockRange
    ) {
      const batchEnd = minBigInt(batchStart + this.maxBlockRange - 1n, latest);
      const events = await this.chain.findConfirmedVotes(batchStart, batchEnd);
      for (const event of events) {
        const proposal = await this.proposals.findByOnChainId(
          event.onChainProposalId,
        );
        if (!proposal) continue;
        const confirmedAt = new Date();
        await this.transactionManager.runInTransaction(async () => {
          await this.votes.upsert({
            proposalId: proposal.id,
            ...event,
            confirmedAt,
          });
          await this.transactions.record({
            ...event,
            operation: "CAST_VOTE",
            proposalId: proposal.id,
            walletAddress: event.voterAddress,
            recordedAt: confirmedAt,
          });
        });
        indexed += 1;
      }
      // Persist every successful batch so a later RPC failure resumes here.
      await this.state.setLastProcessedBlock(INDEXER, batchEnd);
      batches += 1;
    }
    return {
      fromBlock: fromBlock.toString(),
      toBlock: latest.toString(),
      indexed,
      batches,
    };
  }
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}
