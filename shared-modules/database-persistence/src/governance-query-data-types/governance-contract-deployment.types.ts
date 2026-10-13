export interface GetContractDeploymentResult {
  found: boolean;
  chainId: string;
  contractAddress: string;
  deploymentTransaction: string | null;
  deploymentBlockNumber: string | null;
  deploymentBlockHash: string | null;
  deploymentTimestamp: string | null;
  initialOwner: string | null;
  contractVersion: string | null;
  abiVersion: string | null;
  compilerVersion: string | null;
  bytecodeHash: string | null;
  metadata: Record<string, unknown>;
  asOf: string;
  evidenceIds: string[];
}
