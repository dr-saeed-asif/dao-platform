"""Build readiness and immutable provenance from actual audit/check outputs."""
import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
V=Path(__file__).resolve().parents[1];ROOT=V.parents[1]

def main():
    read=lambda p:json.loads(p.read_text(encoding='utf8'))
    s=read(V/'readiness_counts.json');d=read(V/'evidence/diversity_inventory.json');pdf=read(V/'evidence/additional_pdf_verification.json')
    auth=read(V/'evidence/authorization_reconciliation.json');old=read(ROOT/'evidence/snapshot.json')
    unique_pdf={x['sha256'] for p in d['proposals'] for x in p['documents'].get('indexed_documents',[])}
    old_daos={r['dao_id'] for r in old['database'].values()};new_daos={p['dao_id'] for p in d['proposals']}-old_daos
    text=f'''# Claude-adjudicated benchmark readiness — v3

This is a new version derived from the supplied independent Claude audit. Original questions, gold, snapshots and all 52 prior experiment attempts remain unchanged. No new model experiment was run. Claude is an independent **LLM reviewer**, not an independent human reviewer. Its verification-tier labels are retained as supplied and do not certify human adjudication.

| Readiness measure | Count |
|---|---:|
| Audit records (originals and proposed replacements) | {s['audited_records']} |
| Claude ACCEPT pool | {s['accepted_pool']} |
| REVISE decisions with item-specific revisions | 15 |
| Revisions awaiting new adjudication | 14 |
| Original title item superseded by already-accepted DB-R021 | 1 |
| Claude REJECT records, excluded | 56 |
| Accepted items exposed in saved experiments/pilots, excluded | 14 |
| All audit records marked exposed (includes nonaccepted UA-001) | 15 |
| Accepted snapshot-only items before new checks | 21 |
| New live SQL / pinned-chain source checks passed | {s['snapshot_only_source_rechecked']} |
| New source-check failures | {s['snapshot_only_recheck_failures']} |
| Unexposed accepted content-eligible items under LLM-review policy | {s['confirmatory_content_eligible_under_LLM_review_policy']} |
| Human-validated items | 0 |
| Current shortfall to 200 content-eligible items | {s['shortfall_to_200_currently_eligible']} |
| New model runs | 0 |

**The full 200-question experiment is not ready and was not started.** The 141 count is conditional content eligibility after the known exposure filter and source checks; it is not permission to start a 200-item study or a claim of independent human validation. Accepted category counts are {json.dumps(s['confirmatory_eligible_categories'],sort_keys=True)}. There is no accepted unauthorized-access question cohort. Do not pad category counts with rejected pseudo-replicates. The missing-wallet route remains one exposed shared security check.

## Reviewer decisions and revisions

`decision_registry.json` retains every original reviewer decision, issue, reference, exposure flag and the provided audit digest. `accepted_questions.json` / `accepted_gold.json` contain only the 155 ACCEPT items. `confirmatory_questions.json` / `confirmatory_gold.json` exclude all 14 exposed accepted items. Gold is separate from model inputs. No REVISE or REJECT original is silently admitted.

`revisions_pending.json` addresses all 15 flagged records individually. DB-021 is retired in favor of the exact, separately ACCEPTed DB-R021. DB-031 is proposed as a database voting-window calculation, avoiding the title inferable from its DAO identifier. PDF-039 now names the personal-information risk row. All ten awkward multi-source items now ask for three explicit, source-attributed answers: PDF amount, stored proposal identifier and pinned contract option count. UA-001 uses the valid request schema and an observed error-body expectation, with upstream invocation count left unknown. UN-R010 now asks what outcome the PDF states, with source attribution. The 14 new revisions are pending adjudication and outside the accepted pool. Human-dependent semantic decisions remain pending; none is labelled human-validated.

## Snapshot-only recheck

The 21 accepted C-tier records were mapped individually in `evidence/snapshot_only_21_recheck.json`. Fresh read-only SQL agrees with the captured relevant fields. The requested `check_database.py` additionally found zero differences across all 13 captured fields in each of four selected scopes. `verify_chain.cjs` performed direct eth_call at saved blocks 20255936, 20255938, 20255939 and 20255941. All four block hashes, current network chain IDs and 40 proposal fields agree with the preserved observations.

Network identity uses current eth_chainId plus matching historical block hashes. **Current SQL agreement is not proof of historical SQL state at a blockchain block.** No temporal database/index checkpoint reconstruction was available. The original C-tier provenance is preserved, with a new source-check record rather than a fabricated upgrade to human verification. Historical SQL-at-block claims remain unverified for these 21 questions. A later experiment must explicitly freeze/replay SQL and document-index evidence across variants or demonstrate snapshot stability; the existing live-read harness is not a transactionally frozen historical database.

## HTTP 400 versus 401 reconciled

The same selected proposal and question were submitted with the two request shapes. Using the invalid plural `questions` key returned **HTTP {auth[0].get('status')}** with DTO-validation errors, including an absent required `question` array. Using the valid singular `question` array without wallet credentials returned **HTTP {auth[1].get('status')}** with `{{"message":"Sign in with your wallet to use AI.","error":"Unauthorized","statusCode":401}}`. A valid body with an invalid public test token also returned **HTTP {auth[2].get('status')}**. Bodies and exact safe request shapes are saved in `evidence/authorization_reconciliation.json`.

Thus malformed-request validation and missing-wallet authentication are different branches; the old 400 was not a failed authorization bypass. The original contradictory setup record remains untouched. The observed 401 error bodies contain no governance payload, but three probes do not establish general non-disclosure. No valid token, private key or member record was exported. Upstream model invocation was not independently instrumented, so no zero-invocation security claim is inferred from status alone. No production fix was required.

## Real additional diversity available

Read-only discovery found **{len(d['proposals'])} proposal records across {len(set(p['dao_id'] for p in d['proposals']))} DAO identifiers**: {d['new_proposal_count']} proposals and {len(new_daos)} DAO identifiers outside the earlier four-proposal pool. These are genuine stored records; they are not assumed independent organizations or proof of corresponding on-chain deployment. Their document listings were obtained through the existing scoped verified-document reader.

There are {len(unique_pdf)} distinct indexed PDF hashes, five beyond the two original benchmark PDFs. One additional original PDF was found in the existing upload store, hash-verified against its indexed SHA-256, successfully extracted, and preserved under `evidence/additional_documents/` when no sensitive pattern was found. Four other indexed originals were not available locally, so their extracted index entries alone are not admitted as independently verified PDF sources. See `evidence/additional_pdf_verification.json`. None of the new sources was used to manufacture questions or accepted gold in this turn. Additional chain checks, content/privacy and exposure review, and independent question/gold validation are required before inclusion. New-to-this-benchmark does not guarantee unseen by the deployed assistant.

## Remaining validation gates

1. Re-adjudicate the 14 new revisions and resolve any human-dependent semantics or category decisions. Keep all rejected items and known exposures excluded.
2. Obtain enough genuinely new, independently source-grounded and review-approved questions to reach the intended 200-item/category design. The current count is 141, not 200; revised approvals may reduce the shortfall but cannot justify duplicate gateway cases.
3. Validate additional source populations and document originals, audit exposure, and predeclare scoring and clustered uncertainty. Four previously used demo sources do not support broad population claims merely through new wording.
4. Freeze the chosen database, RAG index and chain evidence consistently across B1–B4. If historical alignment is claimed, provide temporal SQL/index checkpoint evidence. Decide and document whether independent LLM review is sufficient or independent human adjudication is required for the final manuscript claims.

All requested live checks completed without access errors. There were zero new generation trials, zero production modifications and zero blockchain transactions. This version is a reproducible readiness artifact, not final experimental results.
'''
    (V/'BENCHMARK_READINESS.md').write_text(text,encoding='utf8')
    dependencies=[ROOT/'questions.json',ROOT/'ground_truth.json',ROOT/'evidence/snapshot.json',ROOT/'review/proposed_benchmark_v2.json',
        ROOT/'review/proposed_gold_v2.json',ROOT/'review/independent_audit/independent_adjudication.json',
        ROOT/'review/independent_audit/audit.py',ROOT/'scripts/verify_chain.cjs',ROOT/'scripts/check_database.py',ROOT/'scripts/capture.py']
    manifest={'version':'claude_adjudicated_v3','sealed_utc':datetime.now(timezone.utc).isoformat(),
        'reviewer':'user-provided independent Claude LLM audit; not human',
        'outside_version_dependencies':{str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in dependencies},
        'files':{str(p.relative_to(V)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(V.rglob('*')) if p.is_file() and p.name!='provenance.json' and '__pycache__' not in p.parts}}
    (V/'provenance.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
    print('Readiness report and version provenance saved; full-200 execution remains blocked.')

if __name__=='__main__':main()
