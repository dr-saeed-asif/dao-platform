import {
  GovernanceChainGateway,
  PrepareCreateProposalRequest,
  PreparedTransaction,
} from "@dao-platform/application";
import { ProposalType } from "@dao-platform/domain";
import {
  SmartContractInterface,
  toHex,
} from "@cyberchain/smart-contract-wrapper";
import { CYBER_DAO_GOVERNANCE_WRITE_ABI } from "./cyberchain-governance.abi.js";

export interface CyberChainGovernanceGatewayOptions {
  readonly rpcURL: string;
  readonly chainId: string;
  readonly contractAddress: string;
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
