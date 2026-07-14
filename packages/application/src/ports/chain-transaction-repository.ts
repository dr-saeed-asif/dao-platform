import { ConfirmedChainTransaction } from "./governance-chain.gateway.js";

export interface RecordChainTransactionInput extends ConfirmedChainTransaction {
  readonly operation:
    "CREATE_PROPOSAL" | "ASSIGN_MEMBERS" | "UNASSIGN_MEMBER" | "CAST_VOTE";
  readonly proposalId: string;
  readonly walletAddress: string;
  readonly recordedAt: Date;
}

export interface ChainTransactionRepository {
  record(transaction: RecordChainTransactionInput): Promise<void>;
}
