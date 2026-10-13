import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  checkPostgresConnection,
  createPostgresDatabase,
  migratePostgresToLatest,
  PostgresDatabase,
} from '@dao-platform/database';

@Injectable()
export class PostgresService implements OnApplicationShutdown, OnModuleInit {
  readonly database: PostgresDatabase;
  private initialization: Promise<void> | undefined;

  constructor(config: ConfigService) {
    this.database = createPostgresDatabase(config.getOrThrow<string>('POSTGRES_URL'));
  }

  async checkConnection(): Promise<void> {
    await checkPostgresConnection(this.database);
  }

  async initialize(): Promise<void> {
    this.initialization ??= migratePostgresToLatest(this.database);
    await this.initialization;
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.destroy();
  }
}
