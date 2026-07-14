import type { ABILike } from "@cyberchain/smart-contract-wrapper";

/** ABI subset used to prepare proposal creation transactions. */
export const CYBER_DAO_GOVERNANCE_WRITE_ABI: ABILike = [
  {
    type: "function",
    name: "createProposal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "metadataURI", type: "string" },
      { name: "metadataHash", type: "bytes32" },
      { name: "proposalType", type: "uint8" },
      { name: "optionCount", type: "uint16" },
      { name: "startsAt", type: "uint64" },
      { name: "endsAt", type: "uint64" },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
];
