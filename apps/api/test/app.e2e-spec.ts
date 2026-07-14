import { rm } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import type {
  CreateProposalResult,
  ListProposalsResult,
  ProposalView,
} from '@dao-platform/application';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import type { HealthResponse } from './../src/health/health.controller';

describe('DAO API (e2e)', () => {
  let app: NestFastifyApplication;
  const databaseFile = process.env.DATABASE_URL!.slice('file:'.length);
  const adminAddress = '0xb8163f7d6d404f67a400743b90f7952d2d137b8e';

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([
      rm(databaseFile, { force: true }),
      rm(`${databaseFile}-shm`, { force: true }),
      rm(`${databaseFile}-wal`, { force: true }),
    ]);
  });

  it('GET /v1/health', async () => {
    await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as HealthResponse;
        expect(body.status).toBe('ok');
        expect(body.service).toBe('dao-platform-api');
      });
  });

  it('creates, lists, and retrieves a proposal', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/proposals')
      .set('idempotency-key', 'postman-workflow-1')
      .set('x-wallet-address', adminAddress)
      .send({
        daoId: 'cyber-dao',
        title: 'Fund a security audit',
        purpose: 'Improve DAO contract safety',
        description:
          'Approve funding for an independent audit of the DAO contracts.',
        type: 'TREASURY',
        optionLabels: ['Approve', 'Reject', 'Abstain'],
        startsAt: '2027-01-01T00:00:00.000Z',
        endsAt: '2027-01-08T00:00:00.000Z',
        metadataURI: 'ipfs://bafy-test-proposal',
        metadataHash:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })
      .expect(201);

    const createdBody = created.body as CreateProposalResult;
    expect(createdBody.proposal.status).toBe('DRAFT');
    expect(createdBody.transaction.chainId).toBe('1212');
    expect(createdBody.transaction.data).toMatch(/^0x/);

    const id = createdBody.proposal.id;
    const list = await request(app.getHttpServer())
      .get('/v1/proposals')
      .expect(200);
    const listBody = list.body as ListProposalsResult;
    expect(listBody.items).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get(`/v1/proposals/${id}`)
      .expect(200);
    const detailBody = detail.body as ProposalView;
    expect(detailBody.title).toBe('Fund a security audit');
    expect(detailBody.options).toHaveLength(3);
  });
});
