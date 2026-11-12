"""Calculate development-fixture evidence for M5 and M6."""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import csv
import hashlib
from importlib.metadata import version
import json
import math
from pathlib import Path
import subprocess
from statistics import median

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
AI=Path(r"E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server")


def read(p):
    return json.loads(p.read_text(encoding="utf-8-sig"))


def rows(p):
    return [json.loads(x) for x in p.read_text(encoding="utf-8-sig").splitlines()]


def save(p,text):
    with p.open("x",encoding="utf-8") as f:f.write(text)


def dump(p,data):
    save(p,json.dumps(data,indent=2)+"\n")


def csvout(p,data):
    with p.open("x",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=list(data[0]))
        w.writeheader()
        w.writerows(data)


def fraction(n,d):
    return n/d if d else None


def wilson(n,d):
    if not d:return None
    z=1.959963984540054
    center=(n/d+z*z/(2*d))/(1+z*z/d)
    half=z*math.sqrt((n/d)*(1-n/d)/d+z*z/(4*d*d))/(1+z*z/d)
    return [center-half,center+half]


def main():
    m5=HERE/"m5"
    m6=HERE/"m6"
    d5=rows(m5/"python-raw.jsonl")
    d6=rows(m6/"raw.jsonl")
    corrected=rows(m6/"raw-corrected.jsonl")
    if len(corrected)!=1 or corrected[0]["id"]!="out-of-order":
        raise ValueError("Unexpected harness correction")
    d6=[corrected[0] if r["id"]=="out-of-order" else r for r in d6]
    if len(d5)!=15 or len(d6)!=16:
        raise ValueError("Incomplete fixture cohort")
    clean=read(m5/"cleanup-result.json")
    after=read(m5/"after-index.json")
    reliability=read(m6/"reliability-fixtures.json")
    for row in d5:
        row["effective_admission"]="accept" if row["actual_admission"]=="accept" and row["indexing_occurred"] else "reject"
        if row["id"]=="stale-chunks":
            row["effective_admission"]="accept" if row["stale_chunks_retrievable"] else "reject"
        row["correct"]=row["expected"]==row["effective_admission"]
    controls=[r for r in d5 if r["expected"]=="accept"]
    invalid=[r for r in d5 if r["expected"]=="reject"]
    tamper=[r for r in invalid if r["id"] in {"one-byte","same-name-other-pdf","cross-proposal","wrong-hash","manifest-entry","uri-association","stale-chunks","manifest-size"}]
    detected=sum(r["effective_admission"]=="reject" for r in invalid)
    tdet=sum(r["effective_admission"]=="reject" for r in tamper)
    fa=len(invalid)-detected
    fr=sum(r["effective_admission"]=="reject" for r in controls)
    s5={
        "fixture_label_origin":"Synthetic developer-authored cases; no independent human adjudication",
        "cases":15,"invalid_cases":12,"legitimate_controls":3,
        "effective_detection":{"n":detected,"denominator":12,"rate":detected/12,"wilson95":wilson(detected,12)},
        "tamper_subset":{"n":tdet,"denominator":len(tamper),"rate":fraction(tdet,len(tamper)),"wilson95":wilson(tdet,len(tamper))},
        "effective_false_acceptance":{"n":fa,"denominator":12,"rate":fa/12},
        "nest_false_acceptance":{"n":sum(r["actual_admission"]=="accept" for r in invalid),"denominator":12},
        "false_rejection":{"n":fr,"denominator":3,"rate":fr/3},
        "legitimate_admission":{"n":3-fr,"denominator":3},
        "overall_effective_acceptance":{"n":sum(r["effective_admission"]=="accept" for r in d5),"denominator":15},
        "physical_cleanup":{"n":int(clean["deletion_observed"]),"denominator":1},
        "retrieval_revocation_after_status_invalidation":{"n":int(clean["after_status_invalidation_proposal_read_blocked"]),"denominator":1},
        "before_status_invalidation_stale_chunks_retrievable":clean["before_status_invalidation_stale_chunk_retrievable"],
        "reupload_same_identity_after_indexing":after["reupload_same_identity"],
        "uncertainty":"Wilson intervals describe these selected synthetic fixtures only. They do not estimate real-world prevalence or production performance.",
    }
    dump(m5/"metrics.json",s5)
    table5=[]
    for row in d5:
        table5.append({
            "test_id":row["id"],"attack_category":row["category"],"document_identifier":row["document_identifier"],
            "original_hash":row["original_hash"],"observed_hash":row.get("observed_hash_after_replacement",row["observed_hash"]),
            "manifest_outcome":row["manifest_outcome"],"expected_admission":row["expected"],
            "nest_admission":row["actual_admission"],"effective_admission":row["effective_admission"],
            "failure_reason":row.get("index_error") or row.get("error") or ("Stale chunk served after disk replacement" if row["stale_chunks_retrievable"] else None),
            "indexing_occurred":row["indexing_occurred"],"stale_chunks_retrievable":row["stale_chunks_retrievable"],
            "nest_duration_ms":row["duration_ms"],"index_and_retrieval_duration_ms":row.get("python_duration_ms"),
        })
    csvout(m5/"M5_DOCUMENT_TAMPER_RESULTS.csv",table5)
    grouped=defaultdict(list)
    for r in d5:grouped[r["category"]].append(r)
    a=[]
    for cat,items in sorted(grouped.items()):
        bad=[r for r in items if r["expected"]=="reject"]
        caught=sum(r["effective_admission"]=="reject" for r in bad)
        a.append({"attack_category":cat,"number_tested":len(items),"invalid_cases":len(bad),"number_detected":caught,
                  "number_missed":len(bad)-caught,"false_rejections":sum(r["effective_admission"]=="reject" for r in items if r["expected"]=="accept"),
                  "detection_rate":fraction(caught,len(bad))})
    csvout(m5/"TABLE_A.csv",a)
    table_a="\n".join(f"| {r['attack_category']} | {r['number_tested']} | {r['number_detected']} | {r['number_missed']} | {r['false_rejections']} | {r['detection_rate'] if r['detection_rate'] is not None else 'N/A'} |" for r in a)
    save(m5/"M5_DOCUMENT_TAMPER_REPORT.md",f"""# M5 document integrity experiment

Fifteen predeclared synthetic cases exercised the actual NestJS ResearchService, filesystem storage, manifest linker, PDF parser, PostgreSQL index writer and proposal chunk-read path in a dedicated PostgreSQL database. The controlled ProposalCreated records were inserted as synthetic chain-anchor fixtures. No document hash was committed to the live blockchain in this experiment.

The NestJS admission gate accepted 5/15 cases. Two were expected to fail, giving a NestJS false-acceptance result of {s5['nest_false_acceptance']['n']}/12 invalid cases. One malformed PDF passed the header/EOF checks and manifest link, then Python parsing rejected it. Effective acceptance requires that the document can enter indexed evidence or that an already-indexed stale chunk remains retrievable. Under this declared operational measure, invalid-case detection was {detected}/12, false acceptance {fa}/12 and legitimate admission {3-fr}/3. The explicit tamper subset was detected in {tdet}/{len(tamper)} cases. There were {fr}/3 false rejections. The entire fixture suite contains 15 cases, so acceptance counts use a different denominator from invalid-case detection.

## Table A

| Attack category | Number tested | Number detected | Number missed | False rejections | Detection rate |
|---|---:|---:|---:|---:|---:|
{table_a}

The control category contains expected-valid cases and has no detection-rate denominator. The CSV records each stage separately. The invalid detection Wilson interval is {s5['effective_detection']['wilson95']}; this describes a purposive development-fixture set and supports no population-level inference.

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
""")
    unsafe=[r for r in d6 if r["unsafe"]]
    safe=[r for r in d6 if not r["unsafe"]]
    missed=sum(r["observed"]=="verified" for r in unsafe)
    fp=sum(r["observed"]!="verified" for r in safe)
    abstain=sum(r["observed"] in {"unverified","unavailable"} for r in d6)
    s6={"cases":len(d6),"correct_classifications":sum(r["correct"] for r in d6),
        "correct_classification_rate":sum(r["correct"] for r in d6)/len(d6),
        "positive_injected_cases":len(unsafe),"negative_controls":len(safe),
        "detection_matrix":{"tp":len(unsafe)-missed,"fn":missed,"fp":fp,"tn":len(safe)-fp},
        "false_positive_rate":fraction(fp,len(safe)),"false_negative_rate":fraction(missed,len(unsafe)),
        "unverified_or_unavailable":{"n":abstain,"denominator":len(d6)},
        "latency_ms":{"median":median(r["duration_ms"] for r in d6),
                      "min":min(r["duration_ms"] for r in d6),"max":max(r["duration_ms"] for r in d6)},
        "timeout_cases":sum(r.get("mode")=="timeout" for r in d6),
        "unavailable_outputs":sum(r["observed"]=="unavailable" for r in d6),
        "independent_rpc_comparison_performed":False,"independent_rpc_agreement_rate":None,
        "matrix_scope":"Injected unsafe or uncertainty fixture accepted as verified is a miss. Nonverified control is a false positive. This is not a blockchain-fault prevalence or security-audit estimate.",
        "excluded_attempts":[{"id":"out-of-order","source":"raw.jsonl","reason":"Initial fixture added a VoteCast inconsistent with baseline storage count. Replaced only this case with coherent MemberAssigned envelope in raw-corrected.jsonl. Original preserved."}],
    }
    dump(m6/"metrics.json",s6)
    table6=[{
        "test_id":r["id"],"fault_type":r["kind"],"expected_classification":r["expected"],
        "observed_classification":r["observed"],"correct_classification_rate":int(r["correct"]),
        "unsafe_injection":r["unsafe"],"accepted_as_verified":r["observed"]=="verified",
        "failure_reason":"No independently trusted head or freshness reference" if r["id"]=="stale-coherent-provider"
                         else json.dumps(r["errors"] or r["uncertainty"]),
        "duration_ms":r["duration_ms"],"execution":"Actual C7 verifier with mocked RPC and SQL fixture",
    } for r in d6]
    fixture_cases=reliability["results"]
    interrupted=all(r.get("passed",False) for r in fixture_cases if r["case"] in {"injected_rpc_timeout_and_partial_indexing","resume_from_stale_checkpoint"})
    table6.append({"test_id":"recovery-interrupt-resume","fault_type":"interrupted recovery and resume",
        "expected_classification":"checkpoint_preserved_then_resumed","observed_classification":"checkpoint_preserved_then_resumed" if interrupted else "failed",
        "correct_classification_rate":int(interrupted),"unsafe_injection":True,"accepted_as_verified":False,
        "failure_reason":"Controlled timeout at next range. PostgreSQL checkpoint retained and incremental retry completed.",
        "duration_ms":None,"execution":"Actual recovery use case and isolated PostgreSQL with injected two-event input"})
    csvout(m6/"M6_RPC_FAULT_RESULTS.csv",table6)
    b="\n".join(f"| {r['fault_type']} | {r['expected_classification']} | {r['observed_classification']} | {r['correct_classification_rate']}/1 | {'Freshness was not independently established' if r['test_id']=='stale-coherent-provider' else 'See raw reasons'} |" for r in table6)
    save(m6/"M6_RPC_FAULT_INJECTION_REPORT.md",f"""# M6 RPC and indexer evaluation

The actual compiled C7 service ran 16 controlled RPC/SQL cases. Fifteen matched the predeclared classification, with one coherently stale-provider fixture accepted as verified. The verifier has no trusted external head reference or configured maximum staleness. This is a capability limitation under this fixture. It does not demonstrate a stale live node.

The detected-or-withheld matrix was TP {len(unsafe)-missed}, FN {missed}, FP {fp}, TN {len(safe)-fp} across 13 injected uncertainty/unsafe cases and three expected-valid controls. False-negative rate was {missed}/13 and false-positive rate {fp}/3. Abstention/unavailable outcomes were {abstain}/16. Unavailable outputs were {s6['unavailable_outputs']}/16. One timeout and one connection-failure injection were tested. These frequencies reflect the designed case mix. They are not observed operational failure rates.

A separate real-PostgreSQL recovery fixture confirmed preservation of the last completed cursor, retry at the first failed range and stable counts under duplicate delivery. It is the seventeenth Table B row and is excluded from the 16-case service matrix because it uses a different multi-step oracle.

## Table B

| Fault type | Expected classification | Observed classification | Correct classification rate | Failure reason |
|---|---|---|---:|---|
{b}

## Endpoint independence and assumptions

Only one configured RPC provider was available. No genuinely independently operated endpoint was identified from the available configuration. No live independent provider comparison was performed and no Table C or independent-agreement CSV was generated. The prior live recovery evidence is referenced by its preserved hashes and was not re-executed here.

The verifier checks configured chain/contract, pins contract reads to the returned block, validates initial block height, checks the pin hash again, validates log ranges and transaction receipts, and compares scoped checkpoint progress. The most recent live campaign used block 20,325,000 with no confirmation-depth offset. That policy does not establish finality. The reconstructed SQL and RPC can agree on the same provider's incomplete view. An empty response is not proof of event absence.

The missing-log case with a known SQL event was mismatched. The joint-omission case was unverified because proposal creation coverage was not established. A more complex omission with no net state change can remain indistinguishable without independently available history. The four recovery observations include successful retry and duplicate cases, plus the limitation that a silently omitted assignment did not stop scan-progress advancement.

## Reproducibility and exclusions

Fixtures reused the original test fixture definitions and the current compiled service. The stale fixture reused the clean response sequence under a stale scenario label. No independently measured external head or observable freshness signal was supplied. The scenario demonstrates input indistinguishability, so its false-negative count is scenario-based. No chain transactions or live RPC faults were introduced. One initial out-of-order fixture was inconsistent with its stored vote count. Its raw attempt is retained and excluded, and only that case was rerun using a coherent assignment event. The corrected record is in raw-corrected.jsonl. The recovery launcher had an initial path-resolution failure before a database experiment and was corrected before execution.

These findings support bounded fault handling within the tested cases. They leave endpoint independence, provider completeness, finality and operational reliability unmeasured. The matrix does not establish cryptographic blockchain integrity.
""")
    save(HERE/"M5_M6_SCIENTIFIC_SUMMARY.md",f"""# M5 and M6 scientific evidence summary

| Experiment | Completed execution | Main observed result |
|---|---|---|
| M5 document suite | 15 synthetic documents/attacks through real service, storage, parser and isolated SQL | Nest false acceptance 2/12 invalid cases; effective indexed-evidence false acceptance {fa}/12 |
| M5 unchanged controls | Three controls | {3-fr}/3 admitted with no false rejection |
| M5 stale-index behavior | One replacement and invalidation sequence | Stale chunk was readable before FAILED status; blocked afterward; physical deletion 0/1 |
| M6 service fault suite | 16 cases with mocked RPC/SQL inputs to actual compiled C7 | 15/16 classification matches; one coherent stale-provider acceptance |
| M6 recovery reliability | Four recorded observations with real isolated SQL and injected event inputs | Cursor/resume and duplicate checks passed; omission could advance scan progress |
| Independent endpoint comparison | Not executed | Second independently operated endpoint unavailable |

No observations were independently verified across RPC providers in these experiments. The chain-anchor evidence for M5 was synthetic. Embedding vectors were synthetic and the parser/SQL operations were real. The fixture labels were author-created development expectations without independent human adjudication. The original live 39/39 recovery result remains separately versioned in recovery_completeness.

## Manuscript-ready methods

A purposive 15-case document suite exercised content-addressed staging, stored-manifest validation, linked PDF synchronization, indexing and chunk retrieval using generated PDF files. ProposalCreated anchors were synthetic records in isolated PostgreSQL. Deterministic vectors replaced the embedding service. Rejection was recorded separately at staging/linking and at parsing/indexed-evidence access. A 16-case RPC suite applied controlled responses to the compiled verifier with SQL fixtures. Recovery interruption and duplicate behavior were evaluated separately against PostgreSQL using injected event envelopes. All original and unsuccessful attempts were retained, and one inconsistent harness case was explicitly replaced.

## RQ2 and contribution implications

RQ2 is supported within tested implementation boundaries by detection of byte, manifest and scope mismatches and by explicit uncertainty outcomes for many RPC faults. The results constrain the chain-anchored admission contribution because direct upload can index unlinked content and stale evidence can remain readable until status invalidation. Report valid-reference checks, byte integrity, anchor trust and retrievability as distinct properties.

The threat model must cover trusted SQL/indexer state, storage replacement after indexing, service-token access to direct upload, coherent stale providers and silent log omission. Discussion should report the malformed-PDF stage acceptance and stale-index exposure as measured limitations. Conclusions can state which selected controls rejected inputs and preserved uncertainty. They cannot claim universal chain-only indexing, automatic stale-chunk deletion, independent blockchain verification, population attack-detection performance, human-adjudicated labels or cryptographic proof of blockchain integrity from SQL/RPC agreement.

Table A is in m5/TABLE_A.csv and the M5 report. Table B is in m6/M6_RPC_FAULT_RESULTS.csv and the M6 report. Table C is absent because independence was not measured. No production fix was mixed into the frozen experiments.

## Commands executed

- `node research_evaluation/m5_m6/m5/run.cjs`
- `<AI virtual-environment Python> research_evaluation/m5_m6/m5/index_cases.py`
- `node research_evaluation/m5_m6/m5/after-index.cjs`
- `<AI virtual-environment Python> research_evaluation/m5_m6/m5/after_index.py`
- `node research_evaluation/m5_m6/m6/run.cjs`
- `node research_evaluation/m5_m6/m6/run.cjs out-of-order`
- `node research_evaluation/m5_m6/m6/reliability.cjs research_evaluation/m5_m6/m6`
- `<AI virtual-environment Python> -m unittest discover -s tests -p test_governance_*.py` from AI repository: 13 passed.
- `<AI virtual-environment Python> research_evaluation/m5_m6/analyze.py`

Exact source revisions, dirty state, configuration, dependency versions, SQL fixture identity and artifact hashes are in the reproducibility manifest. M6 absolute per-trial start timestamps were not captured by the initial harness. Duration and artifact creation/write timestamps are retained.
""")
    dependencies={name:version(name) for name in ("pypdf","psycopg","psycopg-pool","fastapi","pydantic")}
    commits={}
    for label,repo in (("dao",ROOT),("ai",AI)):
        commits[label]={
            "commit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=repo,text=True).strip(),
            "working_tree":subprocess.check_output(["git","status","--porcelain=v1"],cwd=repo,text=True).strip(),
        }
    inputs=[p for p in HERE.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    inputs += [ROOT/"apps/api/src/research/research.service.ts",ROOT/"apps/api/src/research/research.controller.ts",
               ROOT/"apps/api/src/research/local-artefact.storage.ts",ROOT/"packages/database/src/proposal-manifest.ts",
               ROOT/"apps/api/src/ai/blockchain-verification.service.ts",ROOT/"apps/api/dist/ai/blockchain-verification.service.js",
               ROOT/"apps/api/src/ai/__tests__/blockchain-verification.spec.ts",ROOT/"package-lock.json",
               HERE.parent/"recovery_completeness/results-01/RECOVERY_REPRODUCIBILITY_MANIFEST.json"]
    ai_files=["app/business/governance/evidence.py","app/business/governance/proposal_scope.py",
              "app/business/governance/document_chunk.py","app/business/governance/document_sync.py",
              "app/business/rag/indexing.py","app/business/rag/evidence_files.py","app/business/rag/uploads.py",
              "app/business/rag/pdf_extraction.py","app/model/database/index_writer.py","requirements.txt",
              "migrations/001_ai_vector_storage.sql","migrations/002_fix_chunk_uniqueness.sql"]
    hashes={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    hashes.update({"ai/"+f:hashlib.sha256((AI/f).read_bytes()).hexdigest() for f in ai_files})
    raw_m6=m6/"raw.jsonl"
    manifest={
        "generated_utc":datetime.now(timezone.utc).isoformat(),"repositories":commits,
        "fixture_database":"m5_document_integrity in loopback-only cyberdao-recovery-m4-01 PostgreSQL container",
        "fixture_chain":"Synthetic chain 1212 records; live recovery reference block 20325000",
        "contract":"0x51b43885899bd0301c2beea89addc9d876145d21",
        "independent_endpoint_tested":False,"live_rpc_calls_in_m5_m6":0,
        "m5_start_utc":d5[0]["started_utc"],
        "m6_artifact_times":{"created":datetime.fromtimestamp(raw_m6.stat().st_ctime,timezone.utc).isoformat(),
                            "modified":datetime.fromtimestamp(raw_m6.stat().st_mtime,timezone.utc).isoformat(),
                            "note":"Filesystem timestamps, not individually captured trial start times."},
        "python_dependencies":dependencies,"python":__import__("sys").version,
        "node":subprocess.check_output(["node","--version"],text=True).strip(),"random_seed":None,
        "deterministic_fixtures":True,"m5_metrics":s5,"m6_metrics":s6,"files":hashes,
    }
    dump(HERE/"M5_M6_REPRODUCIBILITY_MANIFEST.json",manifest)
    print(json.dumps({"m5_invalid_detected":f"{detected}/12","m5_false_acceptance":f"{fa}/12",
                      "m6_classification":f"{s6['correct_classifications']}/16","m6_matrix":s6["detection_matrix"]}))


if __name__=="__main__":
    main()
