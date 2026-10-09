export interface GetIndexerStatusQuery {
  indexerName: string;
}

export interface GetIndexerStatusResult {
  found: boolean;
  chainId: string;
  contractAddress: string;
  indexerName: string;
  indexerVersion: string;
  processedBlockNumber: string | null;
  processedBlockHash: string | null;
  checkpointTimestamp: string | null;
  observedAt: string;
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  evidenceIds: string[];
}