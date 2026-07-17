import { GovernanceChainGateway } from "../ports/governance-chain.gateway.js";
import { GovernanceReadModelReset } from "../ports/governance-read-model-reset.js";
import { SyncStateRepository } from "../ports/sync-state-repository.js";

const GOVERNANCE_INDEXER = "governance-full";
const LEGACY_VOTE_INDEXER = "governance-votes";

export class ClearGovernanceDataUseCase {
  constructor(
    private readonly readModel: GovernanceReadModelReset,
    private readonly state: SyncStateRepository,
    private readonly chain: GovernanceChainGateway,
  ) {}

  async execute() {
    // Hold incremental indexers at the current chain head. A subsequent
    // full reindex deliberately ignores these cursors and replays history.
    const latestBlock = await this.chain.latestBlockNumber();
    await this.readModel.clearGovernanceData();
    await this.state.setLastProcessedBlock(GOVERNANCE_INDEXER, latestBlock);
    await this.state.setLastProcessedBlock(LEGACY_VOTE_INDEXER, latestBlock);
    return {
      cleared: true,
      blockchainChanged: false,
      incrementalCursor: latestBlock.toString(),
    };
  }
}
