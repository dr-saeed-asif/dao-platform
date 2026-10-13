import { PreparedTransaction } from "../../dependency-interfaces/governance-blockchain-gateway.interface.js";
import { ProposalView } from "../governance-proposal.view.js";

export interface CreateProposalResult {
  readonly proposal: ProposalView;
  readonly transaction: PreparedTransaction;
}
