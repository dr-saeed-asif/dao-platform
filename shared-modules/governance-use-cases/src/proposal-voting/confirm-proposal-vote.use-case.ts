import { WalletAddress } from "@dao-platform/domain";
import { ChainTransactionRepository } from "../dependency-interfaces/blockchain-transaction-repository.interface.js";
import {
  ChainTransactionRevertedError,
  GovernanceChainGateway,
} from "../dependency-interfaces/governance-blockchain-gateway.interface.js";
import { ProposalRepository } from "../dependency-interfaces/governance-proposal-repository.interface.js";
import { TransactionManager } from "../dependency-interfaces/database-transaction-manager.interface.js";
import { VoteRepository } from "../dependency-interfaces/proposal-vote-repository.interface.js";
import { ApplicationError } from "../use-case-errors/governance-use-case.error.js";

export class ConfirmVoteUseCase {
  constructor(
    private readonly proposals: ProposalRepository,
    private readonly votes: VoteRepository,
    private readonly transactions: ChainTransactionRepository,
    private readonly chain: GovernanceChainGateway,
    private readonly transactionManager: TransactionManager,
  ) {}

  async execute(
    localProposalId: string,
    voter: string,
    transactionHash: string,
  ) {
    const voterAddress = WalletAddress.create(voter).value;
    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
      throw new ApplicationError(
        "INVALID_TRANSACTION_HASH",
        "Invalid transaction hash.",
      );
    }
    const proposal = await this.proposals.findById(localProposalId);
    if (!proposal?.onChainId) {
      throw new ApplicationError(
        "PROPOSAL_NOT_PUBLISHED",
        "Proposal is not published on-chain.",
      );
    }
    let confirmed;
    try {
      confirmed = await this.chain.getConfirmedVote(transactionHash);
    } catch (error) {
      if (error instanceof ChainTransactionRevertedError) {
        throw new ApplicationError(
          "TRANSACTION_REVERTED",
          "Vote transaction was mined but reverted. Verify proposal timing, member assignment, and whether this wallet already voted.",
        );
      }
      throw error;
    }
    if (!confirmed) {
      throw new ApplicationError(
        "TRANSACTION_NOT_CONFIRMED",
        "Vote transaction is not confirmed.",
      );
    }
    if (
      confirmed.onChainProposalId !== proposal.onChainId ||
      confirmed.voterAddress !== voterAddress
    ) {
      throw new ApplicationError(
        "VOTE_TRANSACTION_MISMATCH",
        "Vote event does not match the proposal and wallet.",
      );
    }
    const now = new Date();
    await this.transactionManager.runInTransaction(async () => {
      await this.votes.upsert({
        proposalId: proposal.id,
        ...confirmed,
        confirmedAt: now,
      });
      await this.transactions.record({
        ...confirmed,
        operation: "CAST_VOTE",
        proposalId: proposal.id,
        walletAddress: voterAddress,
        recordedAt: now,
      });
    });
    return confirmed;
  }
}
