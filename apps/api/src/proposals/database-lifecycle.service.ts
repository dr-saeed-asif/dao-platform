import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PostgresOperationalDatabase } from '@dao-platform/database';
import { OPERATIONAL_DATABASE } from './proposals.tokens';

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(
    @Inject(OPERATIONAL_DATABASE)
    private readonly database: PostgresOperationalDatabase,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.destroy();
  }
}
