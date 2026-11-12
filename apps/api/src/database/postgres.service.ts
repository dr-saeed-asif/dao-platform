import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  checkPostgresConnection,
  createPostgresDatabase,
  PostgresDatabase,
} from '@dao-platform/database';

@Injectable()
export class PostgresService implements OnApplicationShutdown, OnModuleInit {
  readonly database: PostgresDatabase;
  private initialization: Promise<void> | undefined;

  constructor(config: ConfigService) {
    this.database = createPostgresDatabase(
      config.getOrThrow<string>('POSTGRES_URL'),
    );
  }

  async checkConnection(): Promise<void> {
    await checkPostgresConnection(this.database);
  }

  async initialize(): Promise<void> {
    // Schema changes run out of process with the migration owner's credentials.
    this.initialization ??= this.database
      .selectFrom('proposals')
      .select('id')
      .limit(0)
      .execute()
      .then(() => undefined);
    await this.initialization;
  }

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.destroy();
  }
}
