import type { GovernanceEventEnvelope, GovernanceEventName } from "@dao-platform/application";
import type { BlockData, SmartContractEvent, TransactionReceipt } from "@cyberchain/smart-contract-wrapper";

const argumentNames = {
  ProposalCreated: ["proposalId", "creator", "proposalType", "metadataHash", "metadataURI", "optionCount", "startsAt", "endsAt"],
  MemberAssigned: ["proposalId", "member"],
  MemberUnassigned: ["proposalId", "member"],
  VoteCast: ["proposalId", "voter", "optionIndex"],
  ProposalCancelled: ["proposalId"],
  ProposalFinalized: ["proposalId", "winningOption", "tied", "totalVotes"],
} as const;

export function isGovernanceEventName(name: string): name is GovernanceEventName {
  return Object.hasOwn(argumentNames, name);
}

export function normalizeEventHex(value: string | Uint8Array, bytes?: number): string {
  const hex = typeof value === "string"
    ? value.toLowerCase()
    : `0x${Buffer.from(value).toString("hex")}`;
  if (!/^0x(?:[0-9a-f]{2})*$/.test(hex) || (bytes !== undefined && hex.length !== 2 + bytes * 2)) {
    throw new Error("Invalid blockchain address/hash/data.");
  }
  return hex;
}

export function eventEvidenceId(chainId: string, address: string, hash: string, logIndex: number): string {
  if (BigInt(chainId) < 0n || !Number.isSafeInteger(logIndex) || logIndex < 0) {
    throw new Error("Invalid event identity coordinates.");
  }
  return `event:${BigInt(chainId)}:${normalizeEventHex(address, 20)}:${normalizeEventHex(hash, 32)}:${logIndex}`;
}

function index(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid event index.");
  return result;
}

export function createGovernanceEventEnvelope(
  event: SmartContractEvent,
  receipt: TransactionReceipt,
  block: BlockData,
  chainId: string,
  configuredAddress: string,
  ingestionTimestamp: string,
): GovernanceEventEnvelope {
  if (!isGovernanceEventName(event.name)) throw new Error("Unsupported governance event.");
  const log = event.log;
  const contractAddress = normalizeEventHex(log.address, 20);
  if (contractAddress !== normalizeEventHex(configuredAddress, 20)) {
    throw new Error("Governance event emitter does not match configured contract.");
  }
  const transactionHash = normalizeEventHex(log.transactionHash, 32);
  const blockHash = normalizeEventHex(log.blockHash, 32);
  if (log.removed || transactionHash !== normalizeEventHex(receipt.transactionHash, 32) ||
      blockHash !== normalizeEventHex(receipt.blockHash, 32) ||
      blockHash !== normalizeEventHex(block.hash, 32) ||
      log.blockNumber !== receipt.blockNumber || log.blockNumber !== block.number) {
    throw new Error("Governance event/receipt/block provenance mismatch.");
  }
  const names = argumentNames[event.name];
  if (event.parameters.length !== names.length) throw new Error("Incomplete governance event arguments.");
  const eventArgs: Record<string, string | boolean> = {};
  names.forEach((name, position) => {
    const value = event.parameters[position];
    if (name === "creator" || name === "member" || name === "voter") {
      eventArgs[name] = normalizeEventHex(String(value), 20);
    } else if (name === "metadataHash") {
      eventArgs[name] = normalizeEventHex(value as string | Uint8Array, 32);
    } else if (name === "tied") {
      if (typeof value !== "boolean") throw new Error("Invalid tied argument.");
      eventArgs[name] = value;
    } else if (name === "metadataURI") {
      eventArgs[name] = String(value);
    } else {
      eventArgs[name] = BigInt(String(value)).toString();
    }
  });
  const logIndex = index(log.logIndex);
  return {
    evidenceId: eventEvidenceId(chainId, contractAddress, transactionHash, logIndex),
    chainId: BigInt(chainId).toString(), contractAddress, eventName: event.name,
    transactionHash, logIndex, blockNumber: log.blockNumber.toString(), blockHash,
    blockTimestamp: block.timestamp.toString(), ingestionTimestamp, eventArgs,
    ...(log.transactionIndex != null ? { transactionIndex: index(log.transactionIndex) } : {}),
    ...(receipt.from != null ? { transactionSender: normalizeEventHex(receipt.from, 20) } : {}),
    rawTopics: log.topics.map((topic) => normalizeEventHex(topic, 32)),
    rawData: normalizeEventHex(log.data),
  };
}
