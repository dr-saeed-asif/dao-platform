import { PreparedTransaction } from "../../ports/governance-chain.gateway.js";
import { ProposalView } from "../proposal.view.js";

export interface CreateProposalResult {
  readonly proposal: ProposalView;
  readonly transaction: PreparedTransaction;
}
