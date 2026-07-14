import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { SqliteDatabase } from '@dao-platform/database';
import { SQLITE_DATABASE } from './proposals.tokens';

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(
    @Inject(SQLITE_DATABASE) private readonly database: SqliteDatabase,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.destroy();
  }
}
