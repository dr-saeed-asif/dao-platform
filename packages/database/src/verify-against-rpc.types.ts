export interface VerifyAgainstRpcInput {
  evidenceId: string;
}

export interface VerifyAgainstRpcOutput {
  rpcVerified: boolean;
  evidenceId: string;
  indexed: {
    chainId: string;
    contractAddress: string;
    transactionHash: string;
    blockNumber: string;
    blockHash: string;
    transactionIndex: number | null;
    logIndex: number;
    eventName: string;
    eventArgs: Record<string, string | boolean>;
    transactionSender: string | null;
  };
  rpc: {
    chainId: string | null;
    contractAddress: string | null;
    transactionHash: string | null;
    blockNumber: string | null;
    blockHash: string | null;
    transactionIndex: number | null;
    logIndex: number | null;
    eventName: string | null;
    eventArgs: Record<string, string | boolean> | null;
    transactionSender: string | null;
    receiptStatus: number | null;
    gasUsed: string | null;
  };
  matches: {
    chainId: boolean;
    contractAddress: boolean;
    transactionHash: boolean;
    blockNumber: boolean;
    blockHash: boolean;
    transactionIndex: boolean;
    logIndex: boolean;
    eventName: boolean;
    eventArgs: boolean;
    transactionSender: boolean;
  };
  differences: string[];
  warnings: string[];
  evidenceIds: string[];
}