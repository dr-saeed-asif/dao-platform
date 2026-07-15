import { ChainTransactionRepository } from "../../ports/chain-transaction-repository.js";

export class ListTransactionsUseCase {
  constructor(private readonly transactions: ChainTransactionRepository) {}
  execute(proposalId: string) {
    return this.transactions.listForProposal(proposalId);
  }
}
