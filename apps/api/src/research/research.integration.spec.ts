import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { Proposal, ProposalStatus, ProposalType } from '@dao-platform/domain';
import { GovernanceChainEvent, GovernanceChainGateway, SyncGovernanceUseCase } from '@dao-platform/application';
import { PostgresAssignmentRepository, PostgresChainTransactionRepository, PostgresGovernanceEventRepository, PostgresOperationalDatabase, PostgresProposalRepository, PostgresSyncStateRepository, PostgresVoteRepository, sha256 } from '@dao-platform/database';
import { configureApp } from '../configure-app';
import { PostgresService } from '../database/postgres.service';
import { LocalArtefactStorage } from './local-artefact.storage';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { CreateProposalDto } from '../proposals/create-proposal.dto';
import { validate } from 'class-validator';

const describePostgres = process.env.POSTGRES_URL ? describe : describe.skip;
describePostgres('Document and dataset PostgreSQL integration', () => {
  let app: NestFastifyApplication;
  let postgres: PostgresService;
  let service: ResearchService;
  let directory: string;
  const suffix = `${Date.now()}${process.pid}`;
  const chainId = '1212';
  const contractAddress = '0x51b43885899bd0301c2beea89addc9d876145d21';
  const creator = `0x${'ab'.repeat(20)}`;
  const proposalId = `document-${suffix}`;
  const evidenceIds: string[] = [];
  const eventIds: string[] = [];
  const datasetIds: string[] = [];
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dao-documents-'));
    const module = await Test.createTestingModule({ controllers: [ResearchController], providers: [ResearchService, LocalArtefactStorage, PostgresService, { provide: ConfigService, useValue: new ConfigService({ POSTGRES_URL: process.env.POSTGRES_URL, ARTEFACT_STORAGE_DIR: directory }) }] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configureApp(app);
    await app.register(multipart, { limits: { files: 10, fileSize: 10_485_760 } });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    postgres = module.get(PostgresService);
    service = module.get(ResearchService);
  });
  afterAll(async () => {
    if (postgres) {
      const db = postgres.database;
      await db.deleteFrom('provenance_edges').where('from_evidence_id', 'in', eventIds.length ? eventIds : ['unused']).execute();
      await db.deleteFrom('chain_transactions').where('proposal_id', 'in', [proposalId, `${proposalId}-reuse`]).execute();
      await db.deleteFrom('proposals').where('id', 'in', [proposalId, `${proposalId}-reuse`]).execute();
      if (eventIds.length) await db.deleteFrom('governance_events').where('evidence_id', 'in', eventIds).execute();
      if (evidenceIds.length) await db.deleteFrom('artefacts').where('evidence_id', 'in', evidenceIds).execute();
      if (datasetIds.length) await db.deleteFrom('dataset_versions').where('id', 'in', datasetIds).execute();
      await db.deleteFrom('indexer_checkpoints').where('indexer_version', '=', `documents-${suffix}`).execute();
    }
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('stages PDF/TXT/MD/JSON, hashes canonical manifest, indexes wallet proposal, and links only committed documents', async () => {
    const files = [
      { filename: 'proposal.pdf', mediaType: 'application/pdf', bytes: Buffer.from(`%PDF-1.4\n${suffix}\n%%EOF`) },
      { filename: 'proposal.txt', mediaType: 'text/plain', bytes: Buffer.from(`Text ${suffix}`) },
      { filename: 'proposal.md', mediaType: 'application/octet-stream', bytes: Buffer.from(`# Markdown ${suffix}`) },
      { filename: 'proposal.json', mediaType: 'application/json', bytes: Buffer.from(JSON.stringify({ suffix })) },
    ];
    const boundary = 'dao-document-boundary';
    const payload = Buffer.concat(files.flatMap(file => [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.filename}"\r\nContent-Type: ${file.mediaType}\r\n\r\n`), file.bytes, Buffer.from('\r\n')]).concat(Buffer.from(`--${boundary}--\r\n`)));
    const upload = await app.inject({ method: 'POST', url: '/v1/artefacts/stage', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    expect(upload.statusCode).toBe(201);
    const staged = upload.json().items;
    evidenceIds.push(...staged.map((row: { evidence_id: string }) => row.evidence_id));
    expect(staged.map((row: { computed_hash: string }) => row.computed_hash)).toEqual(files.map(file => sha256(file.bytes)));
    const rows = await postgres.database.selectFrom('artefacts').selectAll().where('evidence_id', 'in', evidenceIds).execute();
    expect(rows.every(row => row.content === null && Boolean(row.storage_key))).toBe(true);
    const restaged = await service.stage([{ ...files[0], filename: 'renamed.pdf' }]);
    expect(restaged[0].filename).toBe('proposal.pdf');
    const manifestInput = { daoId: 'test', title: 'Documents', purpose: 'Evidence', description: 'Canonical evidence', proposalType: ProposalType.Standard, options: ['Approve', 'Reject'], startsAt: '2026-10-02T00:00:00.000Z', endsAt: '2026-10-03T00:00:00.000Z', evidenceIds };
    const first = await service.createManifest(manifestInput);
    const second = await service.createManifest({ ...manifestInput, evidenceIds: [...evidenceIds].reverse() });
    expect(first.metadataHash).toBe(second.metadataHash);
    expect(first.metadataHash).toBe(sha256(first.canonicalJson));
    const draftInput = Object.assign(new CreateProposalDto(), { daoId: 'test', title: 'Documents', purpose: 'Evidence', description: 'Canonical evidence', type: ProposalType.Standard, optionLabels: ['Approve', 'Reject'], startsAt: manifestInput.startsAt, endsAt: manifestInput.endsAt, metadataURI: first.metadataURI, metadataHash: first.metadataHash });
    expect(first.metadataURI.length).toBeGreaterThan(2048);
    expect(await validate(draftInput)).toEqual([]);
    await expect(service.validateProposalManifest(draftInput)).resolves.toBeUndefined();
    await expect(service.validateProposalManifest({ ...draftInput, title: 'Different title' })).rejects.toThrow('does not match');
    const operational = new PostgresOperationalDatabase(postgres.database);
    const proposals = new PostgresProposalRepository(operational, chainId, contractAddress);
    const proposal = Proposal.rehydrate({ id: proposalId, daoId: 'test', creatorAddress: creator, title: 'Documents', purpose: 'Evidence', description: 'Canonical evidence', type: ProposalType.Standard, optionLabels: ['Approve', 'Reject'], startsAt: new Date(manifestInput.startsAt), endsAt: new Date(manifestInput.endsAt), metadata: { metadataURI: first.metadataURI, metadataHash: first.metadataHash }, status: ProposalStatus.Draft, onChainId: null, createdAt: new Date(), updatedAt: new Date() });
    await operational.runInTransaction(() => proposals.insert(proposal, { idempotencyKey: proposalId }));
    const hash = `0x${suffix.padStart(64, '0')}`;
    const event: GovernanceChainEvent = { kind: 'PROPOSAL_CREATED', evidenceId: `event:${chainId}:${contractAddress}:${hash}:0`, chainId, contractAddress, eventName: 'ProposalCreated', transactionHash: hash, transactionIndex: 0, logIndex: 0, blockNumber: '16000000', blockHash: hash, blockTimestamp: '1790899200', transactionSender: creator, ingestionTimestamp: new Date().toISOString(), gasUsed: '21000', status: 'CONFIRMED', onChainProposalId: suffix, creatorAddress: creator, proposalType: 0, metadataHash: first.metadataHash, metadataURI: first.metadataURI, optionCount: 2, startsAt: Date.parse(manifestInput.startsAt) / 1000, endsAt: Date.parse(manifestInput.endsAt) / 1000, eventArgs: { proposalId: suffix, creator, metadataURI: first.metadataURI, metadataHash: first.metadataHash, startsAt: String(Date.parse(manifestInput.startsAt) / 1000), endsAt: String(Date.parse(manifestInput.endsAt) / 1000), optionCount: '2', proposalType: '0' } };
    eventIds.push(event.evidenceId);
    const chain = { latestBlockNumber: async () => 16000000n, findGovernanceEvents: async () => [event] } as unknown as GovernanceChainGateway;
    const state = new PostgresSyncStateRepository(operational, chainId, contractAddress, `documents-${suffix}`);
    const sync = new SyncGovernanceUseCase(proposals, new PostgresAssignmentRepository(operational), new PostgresVoteRepository(operational), new PostgresChainTransactionRepository(operational, chainId, contractAddress), state, chain, new PostgresGovernanceEventRepository(postgres.database), operational, 16000000n, 100n);
    await sync.execute();
    expect((await proposals.findById(proposalId))?.onChainId).toBe(suffix);
    expect((await service.listProposalArtefacts(proposalId)).map(row => row.evidence_id).sort()).toEqual([...evidenceIds].sort());
    await sync.execute(true);
    await service.link(proposalId, evidenceIds);
    expect((await postgres.database.selectFrom('provenance_edges').selectAll().where('from_evidence_id', '=', event.evidenceId).execute()).length).toBe(4);
    const reusedOnChainId = (BigInt(suffix) + 1n).toString();
    const reusedHash = `0x${reusedOnChainId.padStart(64, '0')}`;
    const reusedEvidenceId = `event:${chainId}:${contractAddress}:${reusedHash}:0`;
    eventIds.push(reusedEvidenceId);
    await new PostgresGovernanceEventRepository(postgres.database).saveGovernanceEvent({ ...event, evidenceId: reusedEvidenceId, transactionHash: reusedHash, eventArgs: { ...event.eventArgs, proposalId: reusedOnChainId } });
    const reused = Proposal.rehydrate({ id: `${proposalId}-reuse`, daoId: 'test', creatorAddress: creator, title: 'Documents', purpose: 'Evidence', description: 'Canonical evidence', type: ProposalType.Standard, optionLabels: ['Approve', 'Reject'], startsAt: new Date(manifestInput.startsAt), endsAt: new Date(manifestInput.endsAt), metadata: { metadataURI: first.metadataURI, metadataHash: first.metadataHash }, status: ProposalStatus.Active, onChainId: reusedOnChainId, createdAt: new Date(), updatedAt: new Date() });
    await operational.runInTransaction(() => proposals.insert(reused, { idempotencyKey: reused.id }));
    expect((await service.listProposalArtefacts(reused.id)).length).toBe(4);
    expect((await service.listProposalArtefacts(proposalId)).length).toBe(4);
    const unrelated = await service.stage([{ filename: 'extra.txt', mediaType: 'text/plain', bytes: Buffer.from(`extra ${suffix}`) }]);
    evidenceIds.push(unrelated[0].evidence_id);
    await expect(service.link(proposalId, [unrelated[0].evidence_id])).rejects.toThrow('not committed');
    const download = await app.inject({ method: 'GET', url: `/v1/artefacts/${encodeURIComponent(staged[0].evidence_id)}/download` });
    expect(download.rawPayload).toEqual(files[0].bytes);
    await postgres.database.deleteFrom('indexer_checkpoints').where('indexer_version', '=', `documents-${suffix}`).execute();
  });

  it('rejects invalid file content and detects tampered disk storage', async () => {
    await expect(service.stage([{ filename: 'bad.json', mediaType: 'application/json', bytes: Buffer.from('{bad') }])).rejects.toThrow('valid JSON');
    await expect(service.stage([{ filename: 'bad.pdf', mediaType: 'application/pdf', bytes: Buffer.from('not a PDF') }])).rejects.toThrow('valid PDF');
    await expect(service.stage([{ filename: 'bad.txt', mediaType: 'text/plain', bytes: Buffer.from([0xff]) }])).rejects.toThrow('UTF-8');
    const row = await postgres.database.selectFrom('artefacts').selectAll().where('evidence_id', '=', evidenceIds[0]).executeTakeFirstOrThrow();
    await writeFile(join(directory, row.storage_key!), 'tampered');
    await expect(service.download(row.evidence_id)).rejects.toThrow('hash mismatch');
    expect((await service.getArtefact(row.evidence_id)).verification_status).toBe('FAILED');
  });

  it('validates dataset creation, lists/gets versions, and freezes immutably', async () => {
    const invalid = await app.inject({ method: 'POST', url: '/v1/datasets', payload: { version: 'bad' } });
    expect(invalid.statusCode).toBe(400);
    const create = await app.inject({ method: 'POST', url: '/v1/datasets', payload: { version: `documents-${suffix}`, chainId, contractAddress, startBlock: '10' } });
    expect(create.statusCode).toBe(201);
    const dataset = create.json();
    datasetIds.push(dataset.id);
    expect((await app.inject({ method: 'GET', url: `/v1/datasets/${dataset.id}` })).json().status).toBe('OPEN');
    expect((await app.inject({ method: 'GET', url: '/v1/datasets' })).json().some((row: { id: string }) => row.id === dataset.id)).toBe(true);
    const invalidFreeze = await app.inject({ method: 'POST', url: `/v1/datasets/${dataset.id}/freeze`, payload: { endBlock: '9', endBlockHash: `0x${'ab'.repeat(32)}` } });
    expect(invalidFreeze.statusCode).toBe(400);
    const freeze = { endBlock: '20', endBlockHash: `0x${'ab'.repeat(32)}` };
    const response = await app.inject({ method: 'POST', url: `/v1/datasets/${dataset.id}/freeze`, payload: freeze });
    expect(response.json().status).toBe('FROZEN');
    expect((await app.inject({ method: 'POST', url: `/v1/datasets/${dataset.id}/freeze`, payload: freeze })).json().frozen_at).toBe(response.json().frozen_at);
    expect((await app.inject({ method: 'POST', url: `/v1/datasets/${dataset.id}/freeze`, payload: { ...freeze, endBlock: '21' } })).statusCode).toBe(409);
  });
});
