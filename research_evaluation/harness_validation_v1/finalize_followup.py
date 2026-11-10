"""Separate candidate follow-up from the original eight diagnostic observations."""
import hashlib
import json
from pathlib import Path

from app.business.agents.quality import verify_citations

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf8')

def archive(path, name):
    dest = HERE / name
    if not dest.exists():
        dest.write_bytes(path.read_bytes())
    return dest

def main():
    child = HERE / 'candidate_v3_smoke'
    post = [json.loads(s) for s in (child / 'responses.jsonl').read_text().splitlines()]
    assert len(post) == 1 and post[0]['variant'] == 'B2'
    row = post[0]
    original = json.loads((HERE / 'config.json').read_text())
    current = json.loads((child / 'config.json').read_text())
    invariants = {k: original[k] == current[k] for k in (
        'model', 'model_digest', 'embedding_model', 'embedding_digest', 'options_all_chat_stages',
        'table_fingerprints', 'source_bundle_sha256', 'max_chat_requests_per_case', 'case_deadline_seconds')}
    assert all(invariants.values())
    assert sha(child / 'chain_snapshot.json') == sha(HERE / 'chain_snapshot.json')
    assert sha(child / 'single_agent.py') == sha(HERE / 'single_agent_candidate_v3.py')
    chats = [c for c in row['provider_calls'] if c['path'] == '/api/chat']
    assert all(c['request']['options'] == original['options_all_chat_stages'] and
               c['request']['model'] == original['model'] for c in chats)
    parity = json.loads((HERE / 'live_comparison_preflight.json').read_text())
    assert parity['identical_backend_results'] and parity['wrong_DAO_backend_denied']
    checked = verify_citations(row.get('answer') or '', row.get('sources', []))
    followup = {'classification': 'One affected development retest, not added to the balanced eight-case table',
        'raw_reference': 'candidate_v3_smoke/responses.jsonl:1',
        'pre_reference': 'responses.jsonl:8', 'status': row['status'],
        'wall_ms': row['wall_ms'], 'chat_calls': len(chats),
        'input_tokens': sum(c.get('response', {}).get('prompt_eval_count', 0) for c in chats),
        'output_tokens': sum(c.get('response', {}).get('eval_count', 0) for c in chats),
        'tool_failures': [{'name': e['name'], 'error': e.get('reply', {}).get('error')}
                          for e in row.get('tool_events', []) if e['status'] == 'failed'],
        'reference_check': checked, 'unchanged_conditions': invariants,
        'chain_replay_identical': True, 'whole_answer_accuracy': 'Not independently scored',
        'human_reviewed': False, 'original_failure_removed': False,
        'interpretation': 'Structured chunk_not_found feedback is now preserved. A final answer was produced, but the requested PDF allocation was still not retrieved. Completion is not correctness.',
        'setup_launch_failures_before_this_retest': 1, 'setup_failure_model_calls': 0}
    save('candidate_v3_validation.json', followup)
    decisions = {'development_smoke': 'GO completed', 'larger_exploratory': 'NO-GO until new cohort evidence freeze and prospective scoring/repetition protocol',
        'confirmatory': 'NO-GO: human adjudication and confirmatory evidence-freeze gates unmet',
        'real_model_observations': 9, 'original_balanced_diagnostic_observations': 8,
        'separate_affected_retests': 1, 'original_model_observations_excluded': 0,
        'total_setup_launch_failures': 3, 'setup_failures_model_calls': 0,
        'remaining_unexposed_candidates': 133, 'candidate_scope_preflight_passed': True,
        'candidate_error_transparency_tests_passed': 2, 'earlier_candidate_scope_fixture_tests_passed': 5,
        'comprehensive_tool_permission_audit': False}
    save('READINESS_DECISION.json', decisions)
    protocol = json.loads((HERE / 'EXPLORATORY_PROTOCOL.json').read_text())
    save('EXPLORATORY_PROTOCOL_AFTER_CANDIDATE.json', {**protocol,
        'baseline_candidate': 'single_agent_candidate_v3.py',
        'baseline_candidate_sha256': sha(HERE / 'single_agent_candidate_v3.py'),
        'observed_same_DAO_comparison_parity': True, 'observed_structured_error_transparency': True,
        'required_before_larger_run': ['Freeze eligible cohort ground-truth evidence and full configuration in a new version',
            'Prospectively declare whole-answer and exhaustive claim-support rubrics and reviewer status',
            'Declare repeated runs/seed handling and proposal/question dependence for uncertainty estimation',
            'Retain every attempted output, including failures and fallback text'],
        'confirmatory_extra_gate': 'Independent human adjudication pending; this exploratory preparation does not satisfy it'})
    archive(HERE / 'BENCHMARK_READINESS.md', 'READINESS_BEFORE_CANDIDATE_FOLLOWUP.md')
    report = f'''# Benchmark readiness: NO-GO for a larger campaign

**GO completed:** bounded development diagnostics. **NO-GO confirmatory:** independent human adjudication and cohort evidence-freeze gates are unmet. **NO-GO larger exploratory:** freeze the new cohort/evidence and prospectively declare scoring and repeated-run handling first. No full campaign was started.

## Environment and configurations actually validated

The real in-process execution loaded the fixed planning and synthesis modules at their workflow_fix_v1 hashes. This does not establish deployment of the HTTP AI server. Nine model observations were retained: eight B1–B4 diagnostic observations over two development questions, plus one separately versioned affected B2 retest. The 133 reserved questions were not submitted and their manifest hash is unchanged. Development prompts reuse already exposed training facts; they are not held-out accuracy questions.

The effective model was qwen3:4b-instruct, digest `{original['model_digest']}`, on Ollama {original['infrastructure']['ollama']['version']}. All {20 + len(chats)} chat requests used identical normalized decoding: temperature 0, seed 42, context 8192, output cap 1536, top_p 0.8, top_k 20 and repeat_penalty 1.1. Each observation had the same six-chat/200-second cap. Effective provider model settings take precedence over caller-model trace labels. Architecture-specific prompts, tool definitions and actual call counts differ and are recorded, not claimed identical. The model digest remained unchanged after execution. These 4B results must remain separate from the earlier 0.6B pilot.

One exported read-only PostgreSQL snapshot per execution includes the indexed PDF corpus. The corrected verifier captured chain evidence with that SQL snapshot. All tool-equipped variants used identical captured-chain replay. The affected retest verified identical full-public-table fingerprints, chain bytes and production-source bundle before proceeding. This is genuine model/SQL execution with chain replay, not live RPC on every tool call. It does not reconstruct historical SQL-at-chain-block state or freeze all remaining benchmark gold evidence. Snapshot transactions expire; resumption requires matching fingerprints and configuration.

## Citation findings and gate behavior

All six previously rejected outputs lacked bracketed references. Two named bare D1/D2 and lacked the requested SQL evidence after misrouting; four bounded-unknown answers supplied no citations despite relevant passages. These were nonempty completed model generations, not HTTP failures. Absence of a positive fact in a bounded-unknown item is expected, whereas missing SQL evidence in DB-016 is a routing/coverage failure. Categories overlap.

Eight structural probes and five active-synthesis checks matched implementation behavior. Unknown D/G IDs reject, including mixed known/unknown IDs. Exact abstention is structurally valid but synthesis still requires cited evidence. Unsupported `[B987]` and malformed `[D 987]` can be silently ignored alongside a valid `[D1]`; the new offline strict metric flags them. The reference gate is not a semantic entailment check. Both original B4 budget-relation failures remain preserved. An injected exceptional exit confirmed that the B3 ablation restores active gates afterward.

## Baseline fairness diagnosis and correction

The initial smoke B2 used the same 22 tool schemas/functions and context as the workflow, but further auditing found two adapter differences: comparison IDs were limited to the selected development proposal, and failed business results became exception-name-only replies. In the failed original B2 mixed-source trial, four chunk requests failed before the six-turn limit; exact business error bodies were not retained. It cannot be attributed solely to model failure. The original failed response remains in the eight-observation diagnostic table, with no score-based exclusion.

Candidate v3, versioned separately, removes the comparison-only restriction while retaining DAO/direct-proposal guards, and preserves structured business errors. Five scope/evidence fixture checks and two new error-transparency checks passed. Actual read-only preflight then confirmed a real same-DAO two-proposal comparison is permitted by both candidate and full research worker with identical backend results; a wrong-DAO request was rejected. This is one observed positive/negative pair, not comprehensive permission verification or wallet-membership authentication.

Only the error-feedback-affected B2 development pair was retested. Its status was `{row['status']}`, with {len(chats)} chat calls and {row['wall_ms']/1000:.2f} s wall time. Structured `chunk_not_found` feedback was preserved. The model subsequently obtained voting facts and produced a final response, but still did not retrieve the requested PDF allocation. No whole-answer correctness or improvement claim follows. This retest is not substituted into or pooled with the original eight-case table.

## Actual denominators and limitations

The original development matrix has 8 attempts: 7 reported completed and 1 failed. One completed B4 observation used fallback text. All 20 original chat requests returned HTTP 200. Citation-ID validity is scored separately from factual support. The separate candidate observation brings retained model observations to 9, with zero excluded. Three setup launches failed before any chat call (Windows loop, relative-path hashing, and a one-case preflight indexing bug); their scripts/errors/configurations remain archived, separately from model-trial denominators.

See smoke_metrics.csv and observation_metrics.json for the original matrix, and candidate_v3_validation.json for the separate follow-up. There are no independent human whole-answer or exhaustive claim-support scores. No confidence interval, significance test, operating-cost estimate or architectural-superiority claim is justified by this two-question purposive smoke. Host/cache load was uncontrolled.

For the SQL development question, B3 and B4 had identical normalized planner request hashes but different planner outputs despite temperature 0 and seed 42. The other paired request produced identical outputs. The cause is unresolved; fixed seeds do not establish bitwise determinism here. A larger protocol must declare repetitions and handle proposal/question dependence before uncertainty analysis.

## Remaining gates and reproducibility

- Freeze the eligible cohort, source/gold snapshots and complete run configuration in a new campaign version. Existing development snapshots do not satisfy all remaining benchmark evidence requirements.
- Predeclare whole-answer scoring, exhaustive atomic claim support, structural/strict citation checks, abstention/error categories and reviewer independence. Human adjudication remains pending for confirmatory findings.
- Declare repeated runs and dependence-aware uncertainty analysis. Keep prompts, effective/requested model labels, evidence access, tool errors, failures and fallback text in the raw records.
- Treat the candidate's observed scope/error parity as targeted evidence, not an exhaustive authorization audit. HTTP deployment, wallet eligibility and all tool edge cases remain outside this execution.

The prepared exploratory protocol is EXPLORATORY_PROTOCOL_AFTER_CANDIDATE.json. No automatic full-campaign path is enabled. No production workflow, benchmark gold or prior response was changed in this harness-validation task.

Run scripts from the AI repository using its .venv interpreter and that repository on PYTHONPATH. validate.py performs version-guarded static checks; run_smoke.py checkpoints development attempts and refuses changed configuration; analyze.py derives the initial diagnostic matrix. Candidate source, tests, live comparison probe and the separate candidate_v3_smoke runner are retained. finalize_followup.py builds this updated account without inference. Completed directories must not be reused with changed sources. Configs record model/source hashes, tool schemas and evidence fingerprints. Requests/responses are privacy-redacted; original normalized request hashes are retained and no authorization headers or .env files are exported.

Primary artifacts: static_checks.json, six_citation_failures.json, citation_gate_probes.json, tool_schemas.json, preflight.json, config.json, protocol_audit.json, paired_planner_requests.json, post_run_environment.json, hardware.json, dependencies.json, live_comparison_preflight.json, READINESS_DECISION.json and provenance.json.
'''
    (HERE / 'BENCHMARK_READINESS.md').write_text(report, encoding='utf8')
    save('protocol_audit_after_candidate.json', {'prior_audit_sha256': sha(HERE / 'protocol_audit.json'),
        'candidate_comparison_scope_parity': 'Observed positive/negative backend test passed',
        'candidate_tool_error_transparency': 'Observed structured chunk_not_found after static checks',
        'post_fix_trial_kept_separate': True, 'real_model_observations_total': 9,
        'fixed_seed_bitwise_determinism': 'Not established; one identical planner request pair differed',
        'decision': decisions})
    with (HERE / 'failure_taxonomy_after_candidate.csv').open('w', encoding='utf8') as out:
        out.write('finding,count,unit,interpretation\n')
        out.write('Bare citation IDs with missing SQL evidence,2,prior outputs,Formatting and routing/evidence failure overlap\n')
        out.write('Absent citations in bounded unknown replies,4,prior outputs,Model citation-instruction noncompliance\n')
        out.write('Opaque failed tool replies,4,failed chunk calls in original B2 mixed trial,Original bodies unavailable; candidate corrected\n')
        out.write('Original B2 tool-loop failure,1,development trial,Retained; not attributed solely to model\n')
        out.write('B4 synthesis fallback,1,development trial,Completed status is not answer success\n')
        out.write('Different outputs for identical planner requests,1,of two paired development requests,Cause unresolved; do not infer population rate\n')
        out.write('Setup failures before inference,3,launches,Separate from nine model-observation denominators\n')
    updates = {
        ROOT / 'SPRINGER_EXPERIMENTAL_RESULTS.md': ('SPRINGER_BEFORE_CANDIDATE_FOLLOWUP.md', '''# Latest harness readiness decision

Nine real-model development observations are preserved: the original eight B1–B4 diagnostics and one separately versioned affected B2 retest. All 26 chat requests used the same effective model/decoding settings. The original matrix retains its failed B2 trial and B4 fallback. Candidate baseline scope/error corrections passed targeted fixture tests and actual same-DAO comparison preflight. The post-candidate trial produced a final response but still omitted the requested PDF allocation; no accuracy gain is claimed. The 133 reserved candidate records remain unchanged.

Larger evaluation remains NO-GO pending cohort evidence freeze and prospective scoring/repetition protocol; confirmatory execution additionally requires appropriate independent human adjudication. Citation-marker blind spots and both original B4 semantic-support failures remain findings. One identical planner request pair produced different outputs despite fixed settings, so deterministic replay is not established.

[Current readiness report](harness_validation_v1/BENCHMARK_READINESS.md) · [Separate post-candidate measurement](harness_validation_v1/candidate_v3_validation.json) · [Updated failure taxonomy](harness_validation_v1/failure_taxonomy_after_candidate.csv)

---

## Preserved pre-candidate development account

'''),
        ROOT / 'springer/EVIDENCE_TO_CLAIMS.md': ('CLAIMS_BEFORE_CANDIDATE_FOLLOWUP.md', '''# Latest baseline follow-up evidence

| Claim | Current evidence |
|---|---|
| Effective chat settings were matched | All 26 recorded requests across nine development observations. Prompts and call counts remain architecture-specific. |
| Candidate B2 comparison-scope parity | One actual same-DAO positive comparison and wrong-DAO negative probe passed; all 22 tool schemas match. Comprehensive permissions remain unverified. |
| Candidate preserves failed-tool feedback | Structured chunk_not_found observed in the separate affected retest; original opaque-error failure remains preserved. |
| Whole-answer correctness improved | Unmeasured. Candidate completion still omitted requested PDF content; no independent human scoring. |
| Fixed seed guarantees reproducible model strings | Unsupported here. One identical planner request pair produced different outputs. |
| Full campaign is ready | NO-GO. Cohort freeze/scoring/repetition design pending; human adjudication additionally required for confirmatory claims. All 133 reserved candidates remain untouched. |

[Current readiness and limits](../harness_validation_v1/BENCHMARK_READINESS.md)

---

## Preserved pre-candidate mapping

''')}
    for path, (name, prefix) in updates.items():
        prior = archive(path, name)
        path.write_text(prefix + prior.read_text(encoding='utf8'), encoding='utf8')
    verified = 0
    for folder in ('exploratory_frozen_v1', 'exploratory_frozen_v2', 'failure_diagnosis', 'workflow_fix_v1'):
        base = ROOT / folder
        for name, expected in json.loads((base / 'provenance.json').read_text()).items():
            assert sha(base / name) == expected
            verified += 1
    save('final_preservation_check.json', {'prior_artifact_hashes_verified': verified, 'mismatches': 0,
        'original_matrix_kept': 8, 'separate_affected_retests': 1,
        'reserved_questions': 133, 'original_failures_removed': 0})
    save('provenance.json', {str(p.relative_to(HERE)): sha(p) for p in sorted(HERE.rglob('*'))
        if p.is_file() and p.name != 'provenance.json' and '__pycache__' not in p.parts})
    print(json.dumps({'model_observations': 9, 'chat_requests': 20 + len(chats),
        'prior_artifacts_preserved': verified, 'larger_campaign': 'NO-GO'}))

if __name__ == '__main__':
    main()
