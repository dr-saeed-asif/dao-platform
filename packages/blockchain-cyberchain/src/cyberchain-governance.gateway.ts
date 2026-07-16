import {
  GovernanceChainGateway,
  PrepareCreateProposalRequest,
  PreparedTransaction,
  ConfirmedChainTransaction,
  PublishedProposalTransaction,
  ConfirmedVote,
  ConfirmedFinalization,
  ChainTransactionRevertedError,
  GovernanceChainEvent,
} from "@dao-platform/application";
import { ProposalType } from "@dao-platform/domain";
import {
  SmartContractInterface,
  SignKeyECDSA,
  SignKeyMLDSA,
  TransactionReceipt,
  Web3RPCClient,
  privateKeyToAddress,
  toHex,
} from "@cyberchain/smart-contract-wrapper";
import { CYBER_DAO_GOVERNANCE_WRITE_ABI } from "./cyberchain-governance.abi.js";

export interface CyberChainGovernanceGatewayOptions {
  readonly rpcURL: string;
  readonly chainId: string;
  readonly contractAddress: string;
  readonly signing?: CyberChainSigningOptions;
}

export interface CyberChainSigningOptions {
  readonly signMode: "ec-dsa" | "ml-dsa";
  readonly ecdsaPrivateKey: string;
  readonly mldsaPublicKey: string;
  readonly mldsaSecretKey?: string;
  readonly mldsaLevel: 44 | 65 | 87;
}

export class CyberChainGovernanceGateway implements GovernanceChainGateway {
  private readonly contract: SmartContractInterface;

  constructor(private readonly options: CyberChainGovernanceGatewayOptions) {
    this.contract = new SmartContractInterface(
      options.contractAddress,
      CYBER_DAO_GOVERNANCE_WRITE_ABI,
      { rpcURL: options.rpcURL },
    );
  }

  async prepareCreateProposal(
    request: PrepareCreateProposalRequest,
  ): Promise<PreparedTransaction> {
    const metadataURI = metadataString(request.metadata, "metadataURI");
    const metadataHash = metadataString(request.metadata, "metadataHash");

    if (!/^0x[0-9a-fA-F]{64}$/.test(metadataHash)) {
      throw new Error("metadataHash must be a 32-byte 0x-prefixed hash.");
    }

    const transaction = this.contract.encodeMutableMethod("createProposal", [
      metadataURI,
      metadataHash,
      proposalTypeCode(request.type),
      request.optionLabels.length,
      toUnixSeconds(request.startsAt),
      toUnixSeconds(request.endsAt),
    ]);

    return {
      chainId: this.options.chainId,
      from: request.creatorAddress,
      to: String(transaction.to),
      data: toHex(transaction.data),
      value: BigInt(transaction.value ?? 0).toString(),
    };
  }

  async publishProposal(
    request: PrepareCreateProposalRequest,
  ): Promise<PublishedProposalTransaction> {
    const metadataURI = metadataString(request.metadata, "metadataURI");
    const metadataHash = metadataString(request.metadata, "metadataHash");
    const result = await this.contract.callMutableMethod(
      "createProposal",
      [
        metadataURI,
        metadataHash,
        proposalTypeCode(request.type),
        request.optionLabels.length,
        toUnixSeconds(request.startsAt),
        toUnixSeconds(request.endsAt),
      ],
      this.transactionOptions(),
    );
    const event = this.contract.findEvent(result.receipt, "ProposalCreated");
    return {
      ...confirmedTransaction(result.receipt),
      onChainProposalId: String(event.parameters[0]),
    };
  }

  async assignMembers(
    proposalId: string,
    members: readonly string[],
  ): Promise<ConfirmedChainTransaction> {
    const result = await this.contract.callMutableMethod(
      "assignMembers",
      [proposalId, [...members]],
      this.transactionOptions(),
    );
    return confirmedTransaction(result.receipt);
  }

  async unassignMember(
    proposalId: string,
    member: string,
  ): Promise<ConfirmedChainTransaction> {
    const result = await this.contract.callMutableMethod(
      "unassignMember",
      [proposalId, member],
      this.transactionOptions(),
    );
    return confirmedTransaction(result.receipt);
  }

  async prepareVote(
    proposalId: string,
    voterAddress: string,
    optionIndex: number,
  ): Promise<PreparedTransaction> {
    const transaction = this.contract.encodeMutableMethod("vote", [
      proposalId,
      optionIndex,
    ]);
    return {
      chainId: this.options.chainId,
      from: voterAddress,
      to: String(transaction.to),
      data: toHex(transaction.data),
      value: BigInt(transaction.value ?? 0).toString(),
    };
  }

  async getConfirmedVote(
    transactionHash: string,
  ): Promise<ConfirmedVote | null> {
    const receipt = await Web3RPCClient.getInstance().getTransactionReceipt(
      transactionHash,
      { rpcURL: this.options.rpcURL },
    );
    if (!receipt) return null;
    if (receipt.status !== 1n) throw new ChainTransactionRevertedError();
    const event = this.contract.findEvent(receipt, "VoteCast");
    if (!event) return null;
    return confirmedVote(receipt, event.parameters);
  }

  async findConfirmedVotes(fromBlock: bigint, toBlock: bigint) {
    const events = await this.contract.findEvents(fromBlock, toBlock);
    const hashes = new Set(
      events
        .filter((event) => event.name === "VoteCast")
        .map((event) => toHex(event.log.transactionHash)),
    );
    const votes: ConfirmedVote[] = [];
    for (const hash of hashes) {
      const vote = await this.getConfirmedVote(hash);
      if (vote) votes.push(vote);
    }
    return votes;
  }

  async findGovernanceEvents(fromBlock: bigint, toBlock: bigint) {
    const events = await this.contract.findEvents(fromBlock, toBlock);
    const receipts = new Map<string, TransactionReceipt>();
    const result: GovernanceChainEvent[] = [];
    for (const event of events) {
      const hash = toHex(event.log.transactionHash);
      let receipt = receipts.get(hash);
      if (!receipt) {
        const found = await Web3RPCClient.getInstance().getTransactionReceipt(hash, { rpcURL: this.options.rpcURL });
        if (!found || found.status !== 1n) continue;
        receipt = found;
        receipts.set(hash, found);
      }
      const base = { ...confirmedTransaction(receipt), logIndex: Number(event.log.logIndex) };
      const p = event.parameters;
      if (event.name === "ProposalCreated") result.push({ ...base, kind: "PROPOSAL_CREATED", onChainProposalId: String(p[0]), creatorAddress: String(p[1]).toLowerCase(), proposalType: Number(p[2]), metadataHash: toHex(p[3] as Uint8Array), metadataURI: String(p[4]), optionCount: Number(p[5]), startsAt: Number(p[6]), endsAt: Number(p[7]) });
      else if (event.name === "MemberAssigned") result.push({ ...base, kind: "MEMBER_ASSIGNED", onChainProposalId: String(p[0]), memberAddress: String(p[1]).toLowerCase() });
      else if (event.name === "MemberUnassigned") result.push({ ...base, kind: "MEMBER_UNASSIGNED", onChainProposalId: String(p[0]), memberAddress: String(p[1]).toLowerCase() });
      else if (event.name === "VoteCast") result.push({ ...base, kind: "VOTE_CAST", onChainProposalId: String(p[0]), voterAddress: String(p[1]).toLowerCase(), optionIndex: Number(p[2]) });
      else if (event.name === "ProposalCancelled") result.push({ ...base, kind: "PROPOSAL_CANCELLED", onChainProposalId: String(p[0]) });
      else if (event.name === "ProposalFinalized") result.push({ ...base, kind: "PROPOSAL_FINALIZED", onChainProposalId: String(p[0]), winningOption: Number(p[1]), tied: Boolean(p[2]), totalVotes: Number(p[3]) });
    }
    return result.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || a.logIndex - b.logIndex);
  }

  async latestBlockNumber(): Promise<bigint> {
    const block = await Web3RPCClient.getInstance().getBlockByNumber("latest", {
      rpcURL: this.options.rpcURL,
    });
    return block.number;
  }

  async cancelProposal(proposalId: string): Promise<ConfirmedChainTransaction> {
    const result = await this.contract.callMutableMethod(
      "cancelProposal",
      [proposalId],
      this.transactionOptions(),
    );
    return confirmedTransaction(result.receipt);
  }

  async finalizeProposal(proposalId: string): Promise<ConfirmedFinalization> {
    const result = await this.contract.callMutableMethod(
      "finalizeProposal",
      [proposalId],
      this.transactionOptions(),
    );
    const event = this.contract.findEvent(result.receipt, "ProposalFinalized");
    return {
      ...confirmedTransaction(result.receipt),
      winningOption: Number(event.parameters[1]),
      tied: Boolean(event.parameters[2]),
      totalVotes: Number(event.parameters[3]),
    };
  }

  private transactionOptions() {
    const signing = this.options.signing;
    if (!signing) {
      throw new Error("CyberChain administrator signing is not configured.");
    }
    const signKey: SignKeyECDSA | SignKeyMLDSA =
      signing.signMode === "ml-dsa"
        ? {
            type: "ml-dsa",
            spec: signing.mldsaLevel,
            publicKey: hexBytes(signing.mldsaPublicKey),
            secretKey: hexBytes(signing.mldsaSecretKey ?? ""),
          }
        : {
            type: "ec-dsa",
            key: hexBytes(signing.ecdsaPrivateKey),
          };
    return {
      signKey,
      complementaryAddress:
        signing.signMode === "ml-dsa"
          ? privateKeyToAddress({
              type: "ec-dsa",
              key: hexBytes(signing.ecdsaPrivateKey),
            })
          : privateKeyToAddress({
              type: "ml-dsa",
              spec: signing.mldsaLevel,
              publicKey: hexBytes(signing.mldsaPublicKey),
              secretKey: new Uint8Array(),
            }),
      chainId: this.options.chainId,
      isFeeMarket: true,
      receiptWaitTimeout: 120_000,
    };
  }
}

function confirmedVote(
  receipt: TransactionReceipt,
  parameters: readonly unknown[],
): ConfirmedVote {
  return {
    ...confirmedTransaction(receipt),
    onChainProposalId: String(parameters[0]),
    voterAddress: String(parameters[1]).toLowerCase(),
    optionIndex: Number(parameters[2]),
  };
}

function hexBytes(value: string): Buffer {
  return Buffer.from(value.replace(/^0x/i, ""), "hex");
}

function confirmedTransaction(
  receipt: TransactionReceipt,
): ConfirmedChainTransaction {
  return {
    transactionHash: toHex(receipt.transactionHash),
    blockNumber: receipt.blockNumber.toString(),
    blockHash: toHex(receipt.blockHash),
    gasUsed: receipt.gasUsed.toString(),
    status: "CONFIRMED",
  };
}

function metadataString(
  metadata: Readonly<Record<string, unknown>>,
  name: "metadataURI" | "metadataHash",
): string {
  const value = metadata[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Proposal metadata must include ${name}.`);
  }
  return value.trim();
}

function toUnixSeconds(value: Date): bigint {
  return BigInt(Math.floor(value.getTime() / 1_000));
}

function proposalTypeCode(type: ProposalType): number {
  const codes: Record<ProposalType, number> = {
    [ProposalType.Standard]: 0,
    [ProposalType.Treasury]: 1,
    [ProposalType.ParameterChange]: 2,
    [ProposalType.Membership]: 3,
    [ProposalType.Other]: 255,
  };
  return codes[type];
}
