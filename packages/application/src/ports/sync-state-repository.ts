export interface SyncStateRepository {
  getLastProcessedBlock(indexerName: string): Promise<bigint | null>;
  setLastProcessedBlock(
    indexerName: string,
    blockNumber: bigint,
  ): Promise<void>;
}
