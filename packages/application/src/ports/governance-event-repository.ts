import type {
  GovernanceEventEnvelope,
  GovernanceEventName,
} from "./governance-chain.gateway.js";

export interface StoredGovernanceEvent extends GovernanceEventEnvelope {
  readonly transactionIndex: number;
  readonly blockHash: string;
  readonly transactionSender: string;
  readonly canonical: boolean;
}

export interface ListGovernanceEventsQuery {
  readonly chainId?: string;
  readonly contractAddress?: string;
  readonly proposalId?: string;
  readonly eventName?: GovernanceEventName;
  readonly canonical?: boolean;
  readonly fromBlock?: string;
  readonly toBlock?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface GovernanceEventRepository {
  saveGovernanceEvent(event: GovernanceEventEnvelope): Promise<void>;
  findGovernanceEventByEvidenceId(
    evidenceId: string,
  ): Promise<StoredGovernanceEvent | null>;
  listGovernanceEvents(
    query: ListGovernanceEventsQuery,
  ): Promise<readonly StoredGovernanceEvent[]>;
  eventExists(evidenceId: string): Promise<boolean>;
}
