# M5 document integrity experiment

Fifteen predeclared synthetic cases exercised the actual NestJS ResearchService, filesystem storage, manifest linker, PDF parser, PostgreSQL index writer and proposal chunk-read path in a dedicated PostgreSQL database. The controlled ProposalCreated records were inserted as synthetic chain-anchor fixtures. No document hash was committed to the live blockchain in this experiment.

The NestJS admission gate accepted 5/15 cases. Two were expected to fail, giving a NestJS false-acceptance result of 2/12 invalid cases. One malformed PDF passed the header/EOF checks and manifest link, then Python parsing rejected it. Effective acceptance requires that the document can enter indexed evidence or that an already-indexed stale chunk remains retrievable. Under this declared operational measure, invalid-case detection was 11/12, false acceptance 1/12 and legitimate admission 3/3. The explicit tamper subset was detected in 7/8 cases. There were 0/3 false rejections. The entire fixture suite contains 15 cases, so acceptance counts use a different denominator from invalid-case detection.

## Table A

| Attack category | Number tested | Number detected | Number missed | False rejections | Detection rate |
|---|---:|---:|---:|---:|---:|
| availability | 1 | 1 | 0 | 0 | 1.0 |
| control | 3 | 0 | 0 | 0 | N/A |
| format | 1 | 1 | 0 | 0 | 1.0 |
| hash | 1 | 1 | 0 | 0 | 1.0 |
| manifest | 3 | 3 | 0 | 0 | 1.0 |
| media | 1 | 1 | 0 | 0 | 1.0 |
| scope | 1 | 1 | 0 | 0 | 1.0 |
| size | 1 | 1 | 0 | 0 | 1.0 |
| tamper | 3 | 2 | 1 | 0 | 0.6666666666666666 |

The control category contains expected-valid cases and has no detection-rate denominator. The CSV records each stage separately. The invalid detection Wilson interval is [0.646120088858883, 0.9851349055950829]; this describes a purposive development-fixture set and supports no population-level inference.

## Trust and admission policy

Staging validates size, extension/media agreement and a shallow content check, then uses content-addressed storage. Download recomputes expected/computed hashes and marks mismatches FAILED. Manifest linking checks a canonical inline manifest against the stored ProposalCreated evidence, including document hash, URI, media, filename, algorithm and size. It trusts SQL canonical-event flags and the indexer. Python synchronization checks linked/verified status, trusted storage path, byte size and actual file hash before parsing and indexing.

The unlinked direct PDF-upload use case successfully indexed a synthetic file into the AI document store. This component requires no chain manifest. Its HTTP authentication and endpoint access restrictions were outside this test. The observation disproves a universal claim that every AI index is admitted only through chain linkage. It does not establish unauthorized disclosure through the HTTP route.

## Stale index and cleanup

The replacement-byte check rejected reindexing of the altered file. Nevertheless the proposal chunk-read path still served the old indexed text while the artefact retained VERIFIED status. After the actual NestJS download operation detected the byte mismatch and set FAILED, the proposal read was blocked. Physical stale chunk deletion succeeded in 0/1 cases: one chunk remained. Retrieval revocation after status invalidation succeeded in 1/1 cases. These two measures must be reported separately.

Reupload after indexing retained the content-addressed evidence identity. Repeated indexing returned ALREADY_INDEXED for unchanged content and preserved its chunk identity. Both duplicate and reupload controls passed.

## Execution and limitations

The PDF parser, filesystem and SQL adapters ran against real synthetic PDF bytes and real isolated PostgreSQL roles inherited from the test container. Embeddings were deterministic synthetic 1,024-dimensional vectors. No production model or independent human labeler was used. Manifest and chain evidence were fixtures, so this experiment establishes implementation behavior under the supplied anchor records. It does not establish live anchoring or chain integrity.

No production security policy was changed during the frozen evaluation. Two initial Python launcher failures occurred before measurements: missing fixture configuration and an incompatible Windows async loop. The final launcher uses a dedicated fixture token and SelectorEventLoop. Their failures are documented in execution metadata. The M5 failures remain recorded.

Sources include dataset.json, nest-raw.jsonl, python-raw.jsonl, alternate-upload.json, after-index.json, cleanup-result.json, metrics.json and M5_DOCUMENT_TAMPER_RESULTS.csv.

Per-case NestJS admission latency was measured. The Python indexing harness did not persist its per-case duration, so that CSV column remains empty. M6 service latencies are measured fixture execution times.
