import { ChainTransactionRepository } from "../../dependency-interfaces/blockchain-transaction-repository.interface.js";

export class ListTransactionsUseCase {
  constructor(private readonly transactions: ChainTransactionRepository) {}
  execute(proposalId: string) {
    return this.transactions.listForProposal(proposalId);
  }
}
