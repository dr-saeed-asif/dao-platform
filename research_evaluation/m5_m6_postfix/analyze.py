"""Consolidate the preserved pre-fix and separately executed post-fix fixtures."""
from datetime import datetime, timezone
import csv
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OLD=HERE.parent/"m5_m6"
AI=Path(r"E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server")


def read(p):
    return json.loads(p.read_text(encoding="utf-8-sig"))


def rows(p):
    return [json.loads(x) for x in p.read_text(encoding="utf-8-sig").splitlines()]


def save(p,text):
    with p.open("x",encoding="utf-8") as f:f.write(text)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    before5={r["test_id"]:r for r in csv.DictReader((OLD/"m5/M5_DOCUMENT_TAMPER_RESULTS.csv").open(encoding="utf8",newline=""))}
    post5=rows(HERE/"m5/python-raw.jsonl")
    before6={r["test_id"]:r for r in csv.DictReader((OLD/"m6/M6_RPC_FAULT_RESULTS.csv").open(encoding="utf8",newline=""))}
    post6=rows(HERE/"m6/raw.jsonl")
    if {r["id"] for r in post5}!=set(before5) or len(post5)!=15 or len(post6)!=16:
        raise ValueError("Unexpected rerun denominator")
    cleanup=read(HERE/"m5/cleanup-result.json")
    supplement=read(HERE/"m5/supplemental-checks.json")
    table=[]
    invalid_detected=valid_admitted=0
    for r in post5:
        effective="accept" if r["actual_admission"]=="accept" and r["indexing_occurred"] else "reject"
        if r["id"]=="stale-chunks":
            effective="accept" if r["stale_chunks_retrievable"] else "reject"
        invalid_detected+=r["expected"]=="reject" and effective=="reject"
        valid_admitted+=r["expected"]=="accept" and effective=="accept"
        table.append({"experiment":"M5","test_id":r["id"],"expected":r["expected"],
          "pre_fix":before5[r["id"]]["effective_admission"],"post_fix":effective,
          "correct":effective==r["expected"],"post_nest_admission":r["actual_admission"],
          "post_indexing":r["indexing_occurred"],"remaining_chunks":r.get("remaining_stale_chunks"),
          "duration_ms":r["duration_ms"]+r.get("python_duration_ms",0),
          "reason":r.get("stale_read_error") or r.get("index_error") or r.get("error")})
    for r in post6:
        table.append({"experiment":"M6","test_id":r["id"],"expected":r["expected"],
          "pre_fix":before6[r["id"]]["observed_classification"],"post_fix":r["observed"],
          "correct":r["correct"],"post_nest_admission":None,"post_indexing":None,"remaining_chunks":None,
          "duration_ms":r["duration_ms"],"reason":"Freshness is observationally indistinguishable" if not r["correct"] else json.dumps(r["errors"])})
    with (HERE/"M5_M6_POST_FIX_RESULTS.csv").open("x",encoding="utf8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(table[0]));w.writeheader();w.writerows(table)
    report="""# Failure analysis

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
"""
    save(HERE/"M5_M6_FAILURE_ANALYSIS.md",report)
    correct6=sum(r["correct"] for r in post6)
    t=read(HERE/"c7-tests.json")
    assert t["numPassedTests"]==56 and t["numFailedTests"]==0
    result=f"""# Post-fix scientific results

| Measure | Pre-fix | Post-fix |
|---|---:|---:|
| M5 invalid cases rejected from indexed evidence | 11/12 | {invalid_detected}/12 |
| M5 valid controls admitted | 3/3 | {valid_admitted}/3 |
| Stale chunk available before status invalidation | 1/1 | {int(cleanup['before_status_invalidation_stale_chunk_retrievable'])}/1 |
| Active stale chunk SQL rows deleted | 0/1 | {int(cleanup['deletion_observed'])}/1 |
| Scoped retrieval blocked after FAILED status | 1/1 | {int(cleanup['after_status_invalidation_proposal_read_blocked'])}/1 |
| M6 classification matches | 15/16 | {correct6}/16 |

All 15 M5 cases and 16 M6 service cases were retained with their original expectations. The pre/post CSV has 31 rows. M6's separate PostgreSQL interruption/resume/duplicate/omission fixture was also rerun, with four recorded observations. Its missing-event case still advances a cursor labelled scan_progress. These observations are excluded from the 16-case service classification denominator.

NestJS stage/link decisions remain 5/15 accepted, including the malformed PDF. Python rejects that malformed PDF before indexing. The corrected security result is the indexed-evidence gate and revocation behavior. The remaining staging distinction is explicitly reported rather than hidden in a combined score. Unlinked standalone indexing remains available to the operator workflow, while hash lookup of a known revoked governance artefact is blocked.

## Measured cleanup and retrieval

The stale-chunks fixture could not retrieve its previous content after replacement. Its active chunk count was zero after the read-triggered cleanup. The index metadata survived with status FAILED. A second deletion attempt returned {supplement['idempotent_cleanup_second_delete_count']}. The standalone lookup control succeeded, and lookup of the known revoked hash was blocked. These checks used real isolated PostgreSQL and synthetic PDF fixtures. Embedding vectors and ProposalCreated anchor rows were synthetic. There was no independent human adjudication or live chain anchoring in this suite.

## Test commands and results

- AI virtual environment: `python -m unittest discover -s tests` passed **276 tests**. The five new focused regressions include replaced bytes, missing storage configuration, revoked/FAILED status, valid bytes and standalone revocation.
- DAO: `node node_modules/jest/bin/jest.js --config apps/api/package.json --runInBand blockchain-verification.spec.ts --json --outputFile=research_evaluation/m5_m6_postfix/c7-tests.json` passed **56 tests**.
- AI compileall passed for the affected governance and cleanup modules. Git diff whitespace checks passed.
- Ruff, mypy and Pyright were unavailable. No clean lint/type-analysis result is claimed.
- The initial full Python run had five fixture-boundary failures after the integrity check was added. Adapter-only tests were updated to explicitly mock byte validation. The dedicated real-file and SQL regressions preserve the security assertions. Both earlier and final logs are retained.

## M6 and manuscript implications

The coherently stale scenario still returns verified because its inputs are identical to the control. This means agreement within the supplied provider view. Independent freshness, chain integrity and finality remain outside the evidence. No independent RPC comparison was possible.

For RQ2 and the document-admission contribution, the follow-up supports current-byte revalidation and disposal of derived active chunks in the tested replacement/revocation case. Report logical blocking and SQL-row deletion separately. The measured 12/12 result is a selected development-fixture outcome and supports no population-wide detection guarantee. Preserve 11/12 and 0/1 as the historical pre-fix measurements. Blockchain reconciliation claims must continue to disclose the single-provider trust boundary and silent-omission limitation.

## Execution and retention

The rerun used m5_document_integrity_postfix in the dedicated loopback PostgreSQL 16 container. Scripts copied the original fixture construction and changed only isolated database/output paths and the instrumentation needed to measure the new rejection outcome. Byte fixtures were copied exactly. Source snapshots and hashes identify all corrections. Production data and deployed contracts were untouched. Cleanup removes disposable derived text/vector rows and retains identity and audit metadata. Retention of database backups and WAL follows the operator's existing policy.
"""
    save(HERE/"M5_M6_POST_FIX_REPORT.md",result)
    ai_files=[
      "app/business/governance/current_evidence.py","app/business/governance/proposal_scope.py",
      "app/business/governance/document_chunk.py","app/business/governance/document_status.py",
      "app/business/rag/store.py","app/model/database/index_invalidation.py",
      "app/model/database/document_chunk.py","app/model/database/proposal_chunks.py",
      "app/model/database/proposal_artefacts.py","app/model/database/chunks.py",
      "tests/test_m5_current_evidence.py","tests/mcp_adapter_fakes.py",
      "tests/test_governance_proposal_scope.py","tests/test_governance_document_chunk.py",
      "tests/test_governance_document_status.py"]
    snapshots=HERE/"source-snapshot"
    for name in ai_files:
        target=snapshots/"ai"/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes((AI/name).read_bytes())
    dao_test="apps/api/src/ai/__tests__/blockchain-verification.spec.ts"
    target=snapshots/"dao"/dao_test;target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes((ROOT/dao_test).read_bytes())
    (HERE/"ai-changes.patch").write_bytes(subprocess.check_output(["git","diff","HEAD","--",*ai_files],cwd=AI))
    old_manifest=read(OLD/"M5_M6_REPRODUCIBILITY_MANIFEST.json")
    old_verified=0
    for file,expected in old_manifest["files"].items():
        if file.startswith("research_evaluation/m5_m6/"):
            assert sha(ROOT/file)==expected,file
            old_verified+=1
    config={
        "generated_utc":datetime.now(timezone.utc).isoformat(),
        "repositories":{label:{"commit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=repo,text=True).strip(),
                              "working_tree":subprocess.check_output(["git","status","--porcelain=v1"],cwd=repo,text=True)}
                        for label,repo in [("dao",ROOT),("ai",AI)]},
        "source_uncommitted":True,"production_data_changed":False,"chain_transactions":0,
        "independent_rpc_comparison":False,"gold_labels":"Original synthetic developer fixtures unchanged",
        "original_historical_hashes_checked":old_verified,
        "m5":{"n":15,"invalid_rejected":invalid_detected,"invalid_n":12,"valid_admitted":valid_admitted,"valid_n":3,
              "sql_chunk_deletion_n":int(cleanup["deletion_observed"]),"sql_chunk_deletion_denominator":1},
        "m6":{"n":16,"classification_matches":correct6,"freshness_limitation_unresolved":True},
        "tests":{"python_passed":276,"c7_passed":56},
        "runtime":{"node":subprocess.check_output(["node","--version"],text=True).strip(),"python":sys.version,
                   "psycopg":version("psycopg"),"pypdf":version("pypdf")},
        "database":"Dedicated PostgreSQL container, m5_document_integrity_postfix",
        "fixture_anchor":"Synthetic chain 1212 ProposalCreated records, no live pin measurement",
        "measurement_evolution":"The main M5 rerun preceded the additional standalone lookup guard and status-endpoint checks. Those changes did not alter the evaluated scope/cleanup path. Dedicated regression and SQL supplemental checks evaluated the final guards.",
    }
    manifest_files=[p for p in HERE.rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    hashes={p.relative_to(ROOT).as_posix():sha(p) for p in manifest_files}
    hashes.update({"ai/"+name:sha(AI/name) for name in ai_files})
    hashes[dao_test]=sha(ROOT/dao_test)
    hashes["research_evaluation/m5_m6/M5_M6_REPRODUCIBILITY_MANIFEST.json"]=sha(OLD/"M5_M6_REPRODUCIBILITY_MANIFEST.json")
    config["files"]=hashes
    save(HERE/"M5_M6_REPRODUCIBILITY_MANIFEST.json",json.dumps(config,indent=2)+"\n")
    print(json.dumps({"m5":f"{invalid_detected}/12","valid":f"{valid_admitted}/3","m6":f"{correct6}/16",
                      "historical_hashes_checked":old_verified,"manifest_files":len(hashes)}))


if __name__=="__main__":
    main()
