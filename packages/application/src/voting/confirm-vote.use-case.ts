import { WalletAddress } from "@dao-platform/domain";
import { ChainTransactionRepository } from "../ports/chain-transaction-repository.js";
import { GovernanceChainGateway } from "../ports/governance-chain.gateway.js";
import { ProposalRepository } from "../ports/proposal-repository.js";
import { TransactionManager } from "../ports/transaction-manager.js";
import { VoteRepository } from "../ports/vote-repository.js";
import { ApplicationError } from "../shared/application.error.js";

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
    const confirmed = await this.chain.getConfirmedVote(transactionHash);
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
