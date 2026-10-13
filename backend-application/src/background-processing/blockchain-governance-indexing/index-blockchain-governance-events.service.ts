import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncGovernanceUseCase } from '@dao-platform/application';

@Injectable()
export class VotingIndexerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly syncGovernance: SyncGovernanceUseCase,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('VOTE_INDEXER_ENABLED', true)) return;
    const interval = this.config.get<number>(
      'VOTE_INDEXER_INTERVAL_MS',
      30_000,
    );
    this.timer = setInterval(() => void this.synchronize(), interval);
    this.timer.unref();
    void this.synchronize();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async synchronize(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.syncGovernance.execute(false);
    } catch (error) {
      console.error('Governance indexer synchronization failed.', error);
    } finally {
      this.running = false;
    }
  }
}
