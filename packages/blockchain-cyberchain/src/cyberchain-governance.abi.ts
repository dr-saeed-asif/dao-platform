import type { ABILike } from "@cyberchain/smart-contract-wrapper";

/** ABI subset used to prepare proposal creation transactions. */
export const CYBER_DAO_GOVERNANCE_WRITE_ABI: ABILike = [
  {
    type: "event",
    name: "VoteCast",
    anonymous: false,
    inputs: [
      { indexed: true, name: "proposalId", type: "uint256" },
      { indexed: true, name: "voter", type: "address" },
      { indexed: true, name: "optionIndex", type: "uint16" },
    ],
  },
  {
    type: "event",
    name: "ProposalCreated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "proposalId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: true, name: "proposalType", type: "uint8" },
      { indexed: false, name: "metadataHash", type: "bytes32" },
      { indexed: false, name: "metadataURI", type: "string" },
      { indexed: false, name: "optionCount", type: "uint16" },
      { indexed: false, name: "startsAt", type: "uint64" },
      { indexed: false, name: "endsAt", type: "uint64" },
    ],
  },
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
  {
    type: "function",
    name: "assignMembers",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "members", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unassignMember",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "member", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "vote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "optionIndex", type: "uint16" },
    ],
    outputs: [],
  },
];
