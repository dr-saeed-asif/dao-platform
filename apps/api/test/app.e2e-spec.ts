import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import type { HealthResponse } from './../src/health/health.controller';

describe('Health endpoint (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/v1/health (GET)', async () => {
    return request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as HealthResponse;

        expect(body.status).toBe('ok');
        expect(body.service).toBe('dao-platform-api');
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      });
  });
});
