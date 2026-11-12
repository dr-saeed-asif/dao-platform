# Failure analysis

The preserved M5 effective-evidence miss was **stale-chunks**. Bytes were replaced after successful indexing, synchronization rejected the mismatch, and the proposal chunk endpoint still returned the prior READY chunk. The chunk reader and proposal scope relied on stored VERIFIED/LINKED metadata without rechecking current bytes. Download later marked the artefact FAILED, which blocked scoped retrieval, but it did not invalidate derived AI indexes or delete their chunk/vector rows. Original physical cleanup measured 0/1.

The corrupt PDF was an additional early-stage weakness. NestJS accepted its superficial header/EOF shape, but Python parsing rejected it, so it was not the one effective false acceptance. The existing parser remains the deep-format gate. The direct standalone upload path is an operator indexing namespace and still admits unlinked synthetic PDFs. Known governance artefacts are now checked on standalone hash lookup as well, preventing that path from bypassing revocation.

The M6 miss was **stale-coherent-provider**. Its RPC response sequence was identical to the healthy fixture. The oracle labelled that view stale without supplying an independent head, trusted observation time or distinct freshness signal to the verifier. A deterministic verifier cannot assign different outcomes to identical inputs. This finding is a trust/observability limitation. No technically justified production change can infer an absent freshness reference. A regression preserves this boundary instead of disguising it as a fixed fault.

The reproduction test for stale scope failed before the correction because the index lookup was reached despite replaced file bytes. Its post-fix result excludes the file and invokes derived-index cleanup. The historical raw experiment and failed harness attempts remain separate.

## Correction and audit retention

Python now validates the authoritative status, configured trusted path, file size and byte hash before a proposal index or chunk can supply current evidence. Missing trusted storage configuration excludes the document without deleting valid indexes. A detected integrity failure, explicit FAILED status or ORPHANED lifecycle invalidates the matching derived indexes. The operation locks index rows, marks them FAILED and deletes their chunk/vector rows in one transaction. It retains the source files, hashes, manifests, document identities, profiles and index metadata. Existing C5 AI-owned-data permissions suffice. It does not write public governance tables or require a privileged AI connection.

Proposal chunk/search SQL also filters to READY indexes. Standalone hash lookup rechecks known governance artefacts. Repeated cleanup is idempotent. Cleanup is on access, so no background deletion guarantee is claimed. SQL-row deletion does not imply secure erasure from PostgreSQL MVCC snapshots, WAL or backups.

Current byte access requires DAO_ARTEFACT_STORAGE_DIR to point at the trusted artefact store. Missing files or unavailable configuration fail closed. A file can change after a completed check; arbitrary concurrent filesystem mutation remains an integrity observation window. Tests for metadata/profile/MCP adapters explicitly mock the new integrity boundary, while dedicated regressions and PostgreSQL fixtures exercise real files and cleanup.

## Files changed

AI production files include governance/current_evidence.py, governance/proposal_scope.py, governance/document_chunk.py, governance/document_status.py, rag/store.py, and database/index_invalidation.py, proposal_artefacts.py, document_chunk.py, proposal_chunks.py and chunks.py. Exact paths, versions, patches and snapshots are in the new manifest. Test changes add five focused integrity/revocation tests, adapt existing scope/MCP fixture boundaries and add one C7 freshness-observability regression. The C7 production verifier remains unchanged by this follow-up.

The frozen M5 and M6 cases were rerun in a new isolated PostgreSQL database and new result directories. No historical metric or golden answer was changed.
