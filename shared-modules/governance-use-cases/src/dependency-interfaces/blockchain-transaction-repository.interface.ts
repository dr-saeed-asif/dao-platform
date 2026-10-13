import { ConfirmedChainTransaction } from "./governance-blockchain-gateway.interface.js";

export interface RecordChainTransactionInput extends ConfirmedChainTransaction {
  readonly operation:
    | "CREATE_PROPOSAL"
    | "ASSIGN_MEMBERS"
    | "UNASSIGN_MEMBER"
    | "CAST_VOTE"
    | "CANCEL_PROPOSAL"
    | "FINALIZE_PROPOSAL";
  readonly proposalId: string;
  readonly walletAddress: string;
  readonly recordedAt: Date;
}

export interface ChainTransactionRepository {
  record(transaction: RecordChainTransactionInput): Promise<void>;
  listForProposal(
    proposalId: string,
  ): Promise<readonly RecordChainTransactionInput[]>;
}
