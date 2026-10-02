import { basename, extname } from 'node:path';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { canonicalSerialize, linkProposalManifest, PROPOSAL_MANIFEST_SCHEMA, sha256 } from '@dao-platform/database';
import { PostgresService } from '../database/postgres.service';
import { LocalArtefactStorage } from './local-artefact.storage';
import { CreateDatasetDto, ManifestDto } from './research.dto';
import type { CreateProposalDto } from '../proposals/create-proposal.dto';

export interface StagedFile { filename: string; mediaType: string; bytes: Buffer }
const mediaTypes: Record<string, string> = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json' };

@Injectable()
export class ResearchService {
  private readonly maxSize: number;
  private readonly maxFiles: number;
  constructor(private readonly postgres: PostgresService, config: ConfigService, private readonly storage: LocalArtefactStorage) {
    this.maxSize = config.get<number>('ARTEFACT_MAX_FILE_SIZE', 10_485_760);
    this.maxFiles = config.get<number>('ARTEFACT_MAX_FILES', 10);
  }
  private get db() { return this.postgres.database; }

  async stage(files: StagedFile[]) {
    if (!files.length || files.length > this.maxFiles) throw new BadRequestException(`Upload 1-${this.maxFiles} files.`);
    // Validate the entire batch before creating any metadata or writing files.
    const prepared = files.map(file => {
      if (!file.bytes.length || file.bytes.length > this.maxSize) throw new BadRequestException(`${file.filename} is empty or exceeds the file-size limit.`);
      const extension = extname(file.filename).toLowerCase();
      const mediaType = mediaTypes[extension];
      if (!mediaType || ![mediaType, 'application/octet-stream', ...(extension === '.md' ? ['text/plain', 'text/x-markdown'] : [])].includes(file.mediaType)) throw new BadRequestException(`Unsupported file type: ${file.filename}.`);
      validateContent(mediaType, file.bytes, file.filename);
      const filename = sanitizeFilename(file.filename);
      const hash = sha256(file.bytes);
      const digest = hash.slice(2);
      return { ...file, filename, mediaType, hash, evidenceId: `artefact:sha256:${digest}`, storageKey: `${digest.slice(0, 2)}/${digest}` };
    });
    for (const file of prepared) await this.storage.put(file.storageKey, file.bytes);
    await this.db.transaction().execute(async tx => {
      for (const file of prepared) await tx.insertInto('artefacts').values({
        evidence_id: file.evidenceId, proposal_id: null, local_proposal_id: null,
        source_type: 'PROPOSAL_DOCUMENT', uri: `/v1/artefacts/${encodeURIComponent(file.evidenceId)}/download`,
        expected_hash: file.hash, computed_hash: file.hash, hash_algorithm: 'SHA-256',
        verification_status: 'VERIFIED', lifecycle_state: 'STAGED', title: file.filename,
        filename: file.filename, media_type: file.mediaType, byte_size: String(file.bytes.length), storage_key: file.storageKey,
        content: null, metadata: '{}', dataset_version_id: null,
      }).onConflict(c => c.column('evidence_id').doNothing()).execute();
    });
    return Promise.all(prepared.map(file => this.getArtefact(file.evidenceId)));
  }

  async getArtefact(id: string) {
    const row = await this.db.selectFrom('artefacts').selectAll().where('evidence_id', '=', id).executeTakeFirst();
    if (!row) throw new NotFoundException('Artefact not found.');
    const { storage_key: _storage, ...publicRow } = row;
    return publicRow;
  }
  async download(id: string) {
    const row = await this.db.selectFrom('artefacts').selectAll().where('evidence_id', '=', id).executeTakeFirst();
    if (!row?.storage_key) throw new NotFoundException('Artefact file not found.');
    const bytes = await this.storage.get(row.storage_key);
    if (sha256(bytes) !== row.computed_hash || sha256(bytes) !== row.expected_hash) {
      await this.db.updateTable('artefacts').set({ verification_status: 'FAILED' }).where('evidence_id', '=', id).execute();
      throw new ConflictException('Stored document hash mismatch.');
    }
    return { bytes, filename: row.filename ?? 'document', mediaType: row.media_type ?? 'application/octet-stream' };
  }
  async listProposalArtefacts(proposalId: string) {
    const rows = await this.db.selectFrom('artefacts').innerJoin('proposal_artefacts', 'proposal_artefacts.evidence_id', 'artefacts.evidence_id')
      .selectAll('artefacts').where('proposal_artefacts.proposal_id', '=', proposalId).orderBy('artefacts.created_at').execute();
    return rows.map(({ storage_key: _storage, ...row }) => row);
  }
  async createManifest(input: ManifestDto) {
    if (new Date(input.endsAt) <= new Date(input.startsAt)) throw new BadRequestException('Voting end must follow start.');
    if (input.options.some(x => !x.trim())) throw new BadRequestException('Options must not be empty.');
    const ids = [...new Set(input.evidenceIds)].sort();
    const artefacts = ids.length ? await this.db.selectFrom('artefacts').selectAll().where('evidence_id', 'in', ids).orderBy('evidence_id').execute() : [];
    if (artefacts.length !== ids.length) throw new BadRequestException('One or more artefacts do not exist.');
    for (const artefact of artefacts) await this.download(artefact.evidence_id);
    const manifest = {
      schemaVersion: PROPOSAL_MANIFEST_SCHEMA, daoId: input.daoId.trim(), title: input.title.trim(), purpose: input.purpose.trim(),
      description: input.description.trim(), proposalType: input.proposalType, options: input.options.map(x => x.trim()),
      startsAt: new Date(input.startsAt).toISOString(), endsAt: new Date(input.endsAt).toISOString(),
      artefacts: artefacts.map(a => ({ evidenceId: a.evidence_id, filename: a.filename, mediaType: a.media_type, size: Number(a.byte_size), hashAlgorithm: a.hash_algorithm, contentHash: a.computed_hash, uri: a.uri })),
    };
    const canonicalJson = canonicalSerialize(manifest);
    return { manifest, canonicalJson, metadataURI: `data:application/json;base64,${Buffer.from(canonicalJson).toString('base64')}`, metadataHash: sha256(canonicalJson), hashAlgorithm: 'SHA-256' };
  }
  async setLifecycle(evidenceIds: string[], lifecycleState: 'PENDING_CHAIN' | 'FAILED' | 'ORPHANED') {
    if (!evidenceIds.length || !['PENDING_CHAIN', 'FAILED', 'ORPHANED'].includes(lifecycleState)) throw new BadRequestException('Invalid artefact state request.');
    await this.db.transaction().execute(async tx => {
      const found = await tx.selectFrom('artefacts').select('evidence_id').where('evidence_id', 'in', evidenceIds).execute();
      if (found.length !== new Set(evidenceIds).size) throw new NotFoundException('Artefact not found.');
      await tx.updateTable('artefacts').set({ lifecycle_state: lifecycleState }).where('evidence_id', 'in', evidenceIds).where('lifecycle_state', '!=', 'LINKED').execute();
    });
    return Promise.all(evidenceIds.map(id => this.getArtefact(id)));
  }
  async validateProposalManifest(input: CreateProposalDto): Promise<void> {
    const prefix = 'data:application/json;base64,';
    if (!input.metadataURI.startsWith(prefix)) return;
    const bytes = Buffer.from(input.metadataURI.slice(prefix.length), 'base64');
    if (sha256(bytes) !== input.metadataHash.toLowerCase()) throw new BadRequestException('Proposal metadata hash mismatch.');
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(bytes.toString('utf8')); }
    catch { throw new BadRequestException('Invalid proposal manifest JSON.'); }
    if (!manifest || manifest.schemaVersion !== PROPOSAL_MANIFEST_SCHEMA) return;
    if (!Array.isArray(manifest.artefacts)) throw new BadRequestException('Invalid proposal artefacts.');
    const evidenceIds = manifest.artefacts.map((entry: { evidenceId?: string }) => entry?.evidenceId);
    if (evidenceIds.some(id => typeof id !== 'string')) throw new BadRequestException('Invalid manifest evidence IDs.');
    const expected = await this.createManifest({ daoId: input.daoId, title: input.title, purpose: input.purpose, description: input.description, proposalType: input.type, options: input.optionLabels, startsAt: input.startsAt, endsAt: input.endsAt, evidenceIds: evidenceIds as string[] });
    if (expected.canonicalJson !== bytes.toString('utf8')) throw new BadRequestException('Canonical manifest does not match the proposal draft.');
  }
  async link(proposalId: string, evidenceIds: string[], expectedOnChainProposalId?: string, expectedCreationEvidenceId?: string) {
    const proposal = await this.db.selectFrom('proposals').selectAll().where('id', '=', proposalId).executeTakeFirst();
    if (!proposal) throw new NotFoundException('Proposal not found.');
    if ((expectedOnChainProposalId && expectedOnChainProposalId !== proposal.on_chain_id) || (expectedCreationEvidenceId && expectedCreationEvidenceId !== proposal.creation_evidence_id)) throw new BadRequestException('Proposal creation evidence mismatch.');
    for (const id of evidenceIds) await this.download(id);
    try { await this.db.transaction().execute(tx => linkProposalManifest(tx, proposalId, evidenceIds)); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Unable to link artefacts.'); }
    return this.listProposalArtefacts(proposalId);
  }

  async createDataset(input: CreateDatasetDto) {
    const existing = await this.db.selectFrom('dataset_versions').select('id').where('version', '=', input.version.trim()).executeTakeFirst();
    if (existing) throw new ConflictException('Dataset version already exists.');
    return this.db.insertInto('dataset_versions').values({ version: input.version.trim(), description: input.description ?? '', chain_id: input.chainId, contract_address: input.contractAddress.toLowerCase(), start_block: input.startBlock, end_block: null, end_block_hash: null, policy_version: input.policyVersion ?? null, status: 'OPEN', frozen_at: null, metadata: JSON.stringify(input.metadata ?? {}) }).returningAll().executeTakeFirstOrThrow();
  }
  listDatasets() { return this.db.selectFrom('dataset_versions').selectAll().orderBy('created_at', 'desc').execute(); }
  async getDataset(id: string) {
    if (!/^[1-9][0-9]*$/.test(id)) throw new BadRequestException('Invalid dataset ID.');
    const row = await this.db.selectFrom('dataset_versions').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw new NotFoundException('Dataset not found.');
    return row;
  }
  async freezeDataset(id: string, endBlock: string, endBlockHash: string) {
    await this.getDataset(id);
    return this.db.transaction().execute(async tx => {
      const dataset = await tx.selectFrom('dataset_versions').selectAll().where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      if (dataset.start_block === null || BigInt(endBlock) < BigInt(dataset.start_block)) throw new BadRequestException('End block must not precede start block.');
      if (dataset.status === 'FROZEN') {
        if (dataset.end_block !== endBlock || dataset.end_block_hash !== endBlockHash.toLowerCase()) throw new ConflictException('Frozen dataset version is immutable.');
        return dataset;
      }
      return tx.updateTable('dataset_versions').set({ status: 'FROZEN', end_block: endBlock, end_block_hash: endBlockHash.toLowerCase(), frozen_at: new Date() }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  }
}

export function sanitizeFilename(value: string) {
  const clean = basename(value.replace(/\\/g, '/')).normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 180);
  if (!clean) throw new BadRequestException('Invalid filename.');
  return clean;
}
function validateContent(mediaType: string, bytes: Buffer, filename: string): void {
  if (mediaType === 'application/pdf') {
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-' || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new BadRequestException(`${filename} is not a valid PDF.`);
    return;
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new BadRequestException(`${filename} must be UTF-8 text.`); }
  if (bytes.includes(0)) throw new BadRequestException(`${filename} is not a text document.`);
  if (mediaType === 'application/json') {
    try { JSON.parse(text); } catch { throw new BadRequestException(`${filename} is not valid JSON.`); }
  }
}
