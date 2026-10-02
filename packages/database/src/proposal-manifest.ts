import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { PostgresDatabaseSchema } from './postgres-database-schema.js';

export const PROPOSAL_MANIFEST_SCHEMA = 'cybergovai-proposal-manifest/v1';
export function sha256(bytes: Buffer | string): string {
  return `0x${createHash('sha256').update(bytes).digest('hex')}`;
}
export function canonicalSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  const result = JSON.stringify(value);
  if (result === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Unsupported canonical JSON value.');
  return result;
}

/** Only links documents committed by the canonical ProposalCreated manifest. */
export async function linkProposalManifest(db: Kysely<PostgresDatabaseSchema>, proposalId: string, requestedIds?: string[]): Promise<void> {
  const proposal = await db.selectFrom('proposals').selectAll().where('id', '=', proposalId).executeTakeFirstOrThrow();
  if (!proposal.on_chain_id || !proposal.creation_evidence_id) throw new Error('ProposalCreated has not been indexed.');
  const event = await db.selectFrom('governance_events').selectAll()
    .where('evidence_id', '=', proposal.creation_evidence_id).where('chain_id', '=', proposal.chain_id)
    .where('contract_address', '=', proposal.contract_address).where('proposal_id', '=', proposal.on_chain_id)
    .where('event_name', '=', 'ProposalCreated').where('canonical', '=', true).executeTakeFirstOrThrow();
  const args = event.event_args as Record<string, unknown>;
  const uri = String(args.metadataURI ?? '');
  const prefix = 'data:application/json;base64,';
  if (!uri.startsWith(prefix)) {
    if (requestedIds?.length) throw new Error('Proposal has no canonical document manifest.');
    return;
  }
  const bytes = Buffer.from(uri.slice(prefix.length), 'base64');
  if (sha256(bytes) !== String(args.metadataHash).toLowerCase() || uri !== proposal.metadata_uri || sha256(bytes) !== proposal.metadata_hash) throw new Error('Proposal manifest hash does not match ProposalCreated.');
  const manifest = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  if (manifest.schemaVersion !== PROPOSAL_MANIFEST_SCHEMA) {
    if (requestedIds?.length) throw new Error('Unsupported proposal manifest.');
    return;
  }
  if (canonicalSerialize(manifest) !== bytes.toString('utf8') || !Array.isArray(manifest.artefacts)) throw new Error('Proposal manifest is not canonical.');
  const types: Record<string, string> = { '0': 'STANDARD', '1': 'TREASURY', '2': 'PARAMETER_CHANGE', '3': 'MEMBERSHIP', '255': 'OTHER' };
  if (Date.parse(String(manifest.startsAt)) !== Number(args.startsAt) * 1000 || Date.parse(String(manifest.endsAt)) !== Number(args.endsAt) * 1000 || !Array.isArray(manifest.options) || manifest.options.length !== Number(args.optionCount) || manifest.proposalType !== types[String(args.proposalType)]) throw new Error('Manifest voting parameters do not match ProposalCreated.');
  const entries = manifest.artefacts as Record<string, unknown>[];
  if (requestedIds?.some(id => !entries.some(entry => entry.evidenceId === id))) throw new Error('Document is not committed by the proposal manifest.');
  for (const entry of entries) {
    const evidenceId = String(entry.evidenceId);
    const artefact = await db.selectFrom('artefacts').selectAll().where('evidence_id', '=', evidenceId).executeTakeFirst();
    // Recovered remote proposals can refer to documents not staged on this node.
    if (!artefact) {
      if (requestedIds?.includes(evidenceId)) throw new Error(`Artefact not found: ${evidenceId}`);
      continue;
    }
    if (artefact.verification_status !== 'VERIFIED' || artefact.computed_hash !== entry.contentHash || artefact.expected_hash !== entry.contentHash || artefact.hash_algorithm !== entry.hashAlgorithm || Number(artefact.byte_size) !== entry.size || artefact.filename !== entry.filename || artefact.media_type !== entry.mediaType || artefact.uri !== entry.uri) throw new Error(`Manifest document metadata mismatch: ${evidenceId}`);
    await db.insertInto('proposal_artefacts').values({ proposal_id: proposalId, evidence_id: evidenceId, creation_evidence_id: event.evidence_id })
      .onConflict(c => c.columns(['proposal_id', 'evidence_id']).doNothing()).execute();
    await db.updateTable('artefacts').set({ lifecycle_state: 'LINKED' }).where('evidence_id', '=', evidenceId).execute();
    await db.insertInto('provenance_edges').values({ from_evidence_id: event.evidence_id, to_evidence_id: evidenceId, relation_type: 'PROPOSAL_HAS_ARTEFACT', metadata: JSON.stringify({ localProposalId: proposalId }), dataset_version_id: null })
      .onConflict(c => c.doNothing()).execute();
  }
}
