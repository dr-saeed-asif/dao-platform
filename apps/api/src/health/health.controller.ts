import { Controller, Get } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';

export interface HealthResponse {
  status: 'ok';
  service: 'dao-platform-api';
  timestamp: string;
  postgres: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly postgresService: PostgresService) {}
  @Get()
  async check(): Promise<HealthResponse> {
    await this.postgresService.checkConnection();
    return {
      status: 'ok',
      service: 'dao-platform-api',
      timestamp: new Date().toISOString(),
      postgres: 'ok',
    };
  }
}
