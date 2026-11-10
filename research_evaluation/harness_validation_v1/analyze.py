"""Offline protocol audit and descriptive smoke metrics. No gold or inference."""
import csv
import hashlib
import importlib.metadata
import json
import re
import statistics
from pathlib import Path

from app.business.agents.quality import verify_citations

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2, default=str) + '\n', encoding='utf8')

def main():
    config = json.loads((HERE / 'config.json').read_text())
    static = json.loads((HERE / 'static_checks.json').read_text())
    raw = [json.loads(line) for line in (HERE / 'responses.jsonl').read_text().splitlines()]
    assert len(raw) == len({(r['id'], r['variant']) for r in raw}) == 8
    assert sha(HERE / 'run_smoke.py') == config['runner_sha256']
    assert sha(HERE / 'single_agent.py') == config['single_agent_sha256']
    assert sha(ROOT / 'exploratory_frozen_v2/remaining_unexposed_questions.json') == static['reserved_sha256']
    calls = [c for r in raw for c in r['provider_calls'] if c['path'] == '/api/chat']
    assert all(c['request']['model'] == config['model'] and c['request']['options'] == config['options_all_chat_stages'] for c in calls)
    assert all(sum(c['path'] == '/api/chat' for c in r['provider_calls']) <= 6 for r in raw)
    scored = []
    for line, row in enumerate(raw, 1):
        answer = row.get('answer') or ''
        sources = row.get('sources', [])
        structural = verify_citations(answer, sources)
        candidates = [m for m in re.findall(r'\[([^\]\n]{1,40})\]', answer)
                      if re.fullmatch(r'\s*[A-Za-z]\s*\d+\s*', m)]
        malformed = [m for m in candidates if not re.fullmatch(r'[DG]\d+', m)]
        chat = [c for c in row['provider_calls'] if c['path'] == '/api/chat']
        inputs = [c.get('response', {}).get('prompt_eval_count') for c in chat]
        outputs = [c.get('response', {}).get('eval_count') for c in chat]
        scored.append({'id': row['id'], 'variant': row['variant'], 'raw_line': line,
            'reported_status': row['status'], 'wall_ms': row['wall_ms'],
            'answer_present': bool(answer), 'recognized_citations': structural['cited'],
            'unknown_recognized_ids': structural['unknown'], 'runtime_reference_predicate': structural['valid'],
            'malformed_or_unsupported_markers': malformed,
            'offline_strict_reference_valid': bool(structural['cited']) and structural['valid'] and not malformed,
            'synthesis_fallback': row.get('output_origin') == 'fallback_or_mixed',
            'provider_chat_calls': len(chat), 'provider_HTTP_errors': sum(c.get('http', 0) != 200 for c in chat),
            'input_tokens': sum(x for x in inputs if x is not None),
            'output_tokens': sum(x for x in outputs if x is not None),
            'calls_missing_token_counts': sum(a is None or b is None for a, b in zip(inputs, outputs)),
            'error': row.get('error'), 'whole_answer_correctness': 'not independently scored',
            'claim_support': 'not independently scored'})
    save('observation_metrics.json', scored)
    summary = []
    for variant in ('B1', 'B2', 'B3', 'B4'):
        rows = [r for r in scored if r['variant'] == variant]
        cited = [r for r in rows if r['recognized_citations']]
        summary.append({'variant': variant, 'attempts': len(rows),
            'reported_completed': sum(r['reported_status'] == 'completed' for r in rows),
            'failed_status': sum(r['reported_status'] != 'completed' for r in rows),
            'fallback_answers': sum(r['synthesis_fallback'] for r in rows),
            'answers_with_citations': len(cited),
            'strict_valid_cited_answers': sum(r['offline_strict_reference_valid'] for r in cited),
            'median_wall_ms': statistics.median(r['wall_ms'] for r in rows),
            'min_wall_ms': min(r['wall_ms'] for r in rows), 'max_wall_ms': max(r['wall_ms'] for r in rows),
            'chat_calls': sum(r['provider_chat_calls'] for r in rows),
            'chat_HTTP_errors': sum(r['provider_HTTP_errors'] for r in rows),
            'input_tokens': sum(r['input_tokens'] for r in rows),
            'output_tokens': sum(r['output_tokens'] for r in rows),
            'calls_missing_usage': sum(r['calls_missing_token_counts'] for r in rows)})
    save('smoke_metrics.json', summary)
    with (HERE / 'smoke_metrics.csv').open('w', newline='', encoding='utf8') as output:
        writer = csv.DictWriter(output, fieldnames=list(summary[0]))
        writer.writeheader(); writer.writerows(summary)
    # Verify the research ablation restores real gates, including exceptional exits.
    import importlib.util
    spec = importlib.util.spec_from_file_location('audit_baseline', ROOT / 'benchmark_200/scripts/run.py')
    baseline = importlib.util.module_from_spec(spec); spec.loader.exec_module(baseline)
    import app.business.agents.synthesis as syn
    original = syn.verify_citations
    inside = None
    try:
        with baseline.ablation(True):
            inside = syn.verify_citations('False [D987]', [{'source_id': 'D1'}])['valid']
            raise RuntimeError('Injected exceptional exit, no inference')
    except RuntimeError:
        pass
    assert inside is True and syn.verify_citations is original
    assert not syn.verify_citations('False [D987]', [{'source_id': 'D1'}])['valid']
    save('ablation_restoration.json', {'B3_unknown_id_passes_by_design': inside,
        'function_identity_restored_after_exception': True, 'unknown_id_rejected_after_restoration': True,
        'scope': 'Separate deterministic harness test, not extra model observations'})
    save('protocol_audit.json', {'observations': 8, 'questions': 2, 'variants': 4,
        'all_effective_chat_models_equal': True, 'all_effective_chat_options_equal': True,
        'shared_six_chat_budget': True, 'all_attempts_retained': True,
        'provider_chat_calls': len(calls), 'same_SQL_snapshot_within_smoke': True,
        'chain_capture_sha256': sha(HERE / 'chain_snapshot.json'),
        'tool_schema_equality': True, 'registered_tools': 22,
        'B2_scope_limit': 'B2 additionally constrains comparison proposal_a/proposal_b to the selected development proposal. Full research workers can compare other proposals in the DAO; generic comparison-policy equivalence remains unvalidated.',
        'prompts_identical': False, 'prompt_reason': 'Architecture-specific planner, writer and single-agent prompts; full sanitized requests preserved.',
        'answer_quality_requirement_for_harness_acceptance': 'None; wrong answers/fallbacks remain measurements.',
        'new_model_regime': 'Do not pool this 4b-instruct smoke with the 0.6b pilot.',
        'reserved_questions_consumed': 0, 'reserved_count': 133, 'human_reviewed': 0,
        'setup_launch_failures': 2, 'setup_failures_had_chat_calls': 0,
        'broader_baseline_equivalence': 'pending generic comparison-scope validation'})
    candidate_log = (HERE / 'candidate_static_tests.txt').read_text()
    assert 'Ran 5 tests ' in candidate_log and candidate_log.rstrip().endswith('OK')
    save('candidate_baseline_status.json', {'file': 'single_agent_candidate_v2.py',
        'sha256': sha(HERE / 'single_agent_candidate_v2.py'),
        'change': 'Removes selected-proposal-only restriction for comparison_a/comparison_b; unchanged backend validates DAO ownership',
        'actual_parameter_names': ['proposal_a', 'proposal_b'],
        'static_tests_passed': 5, 'real_model_runs_with_candidate': 0,
        'required_before_larger_run': 'Positive same-DAO multi-proposal backend preflight and affected development smoke',
        'production_code_changed': False})
    save('dependencies.json', {d.metadata['Name']: d.version for d in sorted(
        importlib.metadata.distributions(), key=lambda d: d.metadata['Name'].lower())})
    save('EXPLORATORY_PROTOCOL.json', {'status': 'prepared, not approved for larger execution',
        'classification': 'Exploratory AI-assisted evidence review; human adjudication pending',
        'model': config['model'], 'model_digest': config['model_digest'],
        'generation_options': config['options_all_chat_stages'],
        'required_before_larger_run': ['Validate generic B2 comparison-scope equivalence',
            'Freeze new cohort evidence and settings into a separate version',
            'Predeclare whole-answer and exhaustive claim-support rubrics; retain failures',
            'Separate AI-assisted ratings from independent human review',
            'Declare proposal/question dependencies before computing uncertainty or paired tests'],
        'automatic_full_campaign_enabled': False, 'reserved_candidate_manifest_sha256': static['reserved_sha256']})
    table = '\n'.join('| {variant} | {attempts} | {reported_completed} | {fallback_answers} | {answers_with_citations} | {strict_valid_cited_answers} | {median:.2f} | {input_tokens}/{output_tokens} |'.format(
        **r, median=r['median_wall_ms']/1000) for r in summary)
    report = f'''# Benchmark readiness: NO-GO for confirmatory or larger comparison

## Actual execution environment

The research interpreter loaded planning.py and synthesis.py from the AI repository with hashes exactly matching workflow_fix_v1. The smoke ran the actual source workflow in-process, not the HTTP AI deployment. Running-server deployment remains unverified. Source bundle, interpreter, dependencies, hardware and model digests are saved.

Eight real-model observations were executed on two development questions, two per B1–B4. No reserved question ID was submitted, and the 133-question file hash is unchanged. Development wording reuses already exposed training facts; this is intentionally not a held-out accuracy cohort. Two pre-generation setup launches failed (Windows event loop and a relative-path hashing bug). Both are retained separately, with zero chat calls. The corrected runner uses a Windows SelectorEventLoop. No original experiment or gold file was changed.

The effective model was `{config['model']}`, digest `{config['model_digest']}`, on Ollama {config['infrastructure']['ollama']['version']}. All {len(calls)} recorded chat calls used the same options, with a common six-chat and 200-second cap. This model differs from the previous 0.6B pilot, so these observations cannot estimate the effect of the workflow fix. Architecture-specific prompts and actual inference counts differ by design. All sanitized requests, schema constraints, tool calls and provider outputs are retained in responses.jsonl. Request hashes refer to pre-redaction normalized bytes; credentials/authorization headers are never recorded.

## Citation findings

All six previously rejected outputs have no bracketed source references. Two DB-016 outputs name bare D1/D2 and lack SQL metadata evidence after misrouting. Four bounded-unknown outputs contain no source markers despite returned PDF passages supporting absence/unknown responses. They are completed model generations with citation-instruction noncompliance, not empty output or network failures. Missing positive facts in the bounded-unknown items are expected unknowns, not established retrieval faults. These diagnoses overlap and do not imply six identical causes.

Eight structural probes and five active-synthesis probes behaved as implemented. Unknown D/G IDs reject, including a mix of known and unknown IDs. Exact abstention is structurally allowed but the synthesis stage still requires a cited source. **Blind spot:** an unsupported `[B987]` or malformed `[D 987]` can be ignored when a valid `[D1]` is present. The offline strict metric separately flags such markers. Structural validity is not factual support. The two original B4 budget-relation failures remain unchanged. A separate injected-exception test confirmed the B3 ablation restores the active gate afterward.

## Development smoke measurements

| Variant | Attempts | Status completed | Fallbacks | Answers with recognized IDs | Strict-valid among cited answers | Median wall s | Input/output tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
{table}

Status completed does not mean the answer is correct or useful. Reference validity does not mean claim support. B1 has no retrieval, so source-reference comparisons have different applicability. There are two purposive observations per variant, no human correctness/claim ratings and no population confidence intervals or significance claims. Token totals include observed chat calls; embedding preflight is separate. Latency is local descriptive wall time under uncontrolled host/cache conditions. No API/operating cost was measured. Failure/usage details and exact source-line references are in observation_metrics.json.

## Equivalent-tool baseline and evidence

B2 uses the same 22 build_tools definitions and schemas, ExecutionContext, read-only pool, evidence extraction and canonical citation registry as the full workflow. Three backend families (proposal, voting facts and document retrieval) passed real preflight. B2 is model-directed with no specialist planning and no forced tool choice or answer fallback. B3 preserves the previous research ablation, disabling reference, currency and numeric blocking gates. B4 retains them. Tool scope/auth checks are unchanged in production.

The corpus was frozen within one exported PostgreSQL MVCC snapshot, including indexed PDF content. A fresh corrected-verifier capture used that SQL snapshot; all tool-equipped variants could replay identical scoped chain evidence. This is actual SQL and actual model generation with captured-chain replay, not live RPC on each model call. Historical SQL-at-chain-block alignment is still unproven. Snapshot IDs expire after execution; resuming requires identical fingerprints/configuration and stored chain bytes. This does not freeze the adjudicated answers for all 133 remaining candidates.

Generic tool-policy equivalence is **not yet established**: B2 restricts comparison proposal_a/proposal_b to the development proposal, whereas full research workers can compare multiple proposals within the DAO. Tool-name/schema parity alone does not prove identical permissions. No development question requested cross-proposal comparison. A separate candidate_v2 removes this comparison-only restriction while retaining DAO and direct-proposal scope checks; its five fixture tests pass. Backend comparison still reads each proposal with DAO ownership validation. The candidate was not substituted into any saved run. Positive same-DAO multi-proposal backend preflight and affected live development validation remain pending. Prompts remain architecture-specific and the final policy/rubric needs prospective declaration before a broader comparison.

## Decision and exact gates

- **GO completed:** bounded development smoke and descriptive protocol diagnostics. Actual mistakes and fallbacks are retained, with no score-based exclusions.
- **NO-GO larger exploratory comparison:** first reconcile/validate generic B2 comparison-scope access, freeze a new cohort/evidence configuration, and predeclare uniform scoring including strict citation syntax versus factual support. EXPLORATORY_PROTOCOL.json prepares this regime without executing it.
- **NO-GO confirmatory campaign:** additionally obtain appropriate independent human adjudication. Current independent human count is zero. The 133 reserved candidates remain untouched. New cohort evidence must be aligned/frozen and evidence/claim annotations completed. No automatic full-campaign path is enabled here.

Known application limitations (uncited generations, irrelevant-source routing, semantic citation errors and malformed-namespace blindness) are findings, not reasons to remove observations. These data support harness/environment diagnostics and measured failure examples, not multi-agent superiority or a human-validated benchmark.

## Reproduction

From the AI repository use its .venv/Scripts/python.exe, with that directory on PYTHONPATH, to run validate.py, then run_smoke.py, then analyze.py under this artifact directory. Validation is exclusive-version guarded. The runner checkpoints every attempted development pair and skips completed attempts, including failures. Config/source/model/fingerprint mismatches abort resumption. Do not rerun the completed version to obtain better answers; copy scripts into a new version for changed conditions. Chain capture needs the configured read-only database/RPC environment and existing DAO build. No private .env files are included. See tool_schemas.json, config.json, static_checks.json, preflight.json, protocol_audit.json and provenance.json.
'''
    (HERE / 'BENCHMARK_READINESS.md').write_text(report, encoding='utf8')
    updates = {
        ROOT / 'SPRINGER_EXPERIMENTAL_RESULTS.md': ('SPRINGER_BEFORE_HARNESS_VALIDATION.md', '''# Matched-decoding development harness evidence

A new development-only B1–B4 smoke executed eight observations on two questions over already exposed facts. All chat requests used matched effective model/decoding settings, a shared request cap and a shared read-only evidence snapshot. Exact settings, source hashes, prompts, failures and provider outputs are recorded. This qwen3:4b-instruct regime remains separate from the prior 0.6B experiments. The 133 reserved questions were not submitted.

The six prior citation rejections were classified as two bare-ID/routing-evidence failures and four absent-citation bounded-unknown generations. New gate probes confirm rejection of unknown D/G IDs but expose ignored unsupported/malformed markers alongside valid IDs. The semantic budget-support failures remain preserved. Generic B2 cross-proposal comparison-scope equivalence remains unresolved despite equality of all 22 tool schemas. Both larger exploratory and confirmatory campaigns remain NO-GO pending their declared gates, including human adjudication for confirmatory claims.

[Readiness and actual measurements](harness_validation_v1/BENCHMARK_READINESS.md) · [Raw smoke records](harness_validation_v1/responses.jsonl) · [Protocol audit](harness_validation_v1/protocol_audit.json)

---

## Preserved preceding report

'''),
        ROOT / 'springer/EVIDENCE_TO_CLAIMS.md': ('CLAIMS_BEFORE_HARNESS_VALIDATION.md', '''# Harness validation evidence update

| Claim | Evidence status |
|---|---|
| Corrected source was used for development execution | Supported by loaded-module hashes and recorded source bundle. HTTP service deployment remains unverified. |
| Effective generation settings were matched | Supported for all recorded chat requests in the new eight-observation development smoke. Prompts and actual inference counts differ by architecture. |
| Single-agent tool permissions are fully equivalent | Pending generic comparison-scope reconciliation. All 22 schemas/functions match, but B2 comparison parameters are more restricted. |
| Citation gates reject every invalid-looking source marker | Unsupported. Known D/G IDs are checked; unsupported/malformed namespaces may be ignored alongside valid IDs. |
| Valid references imply supported claims | Unsupported; the original two B4 budget-relation failures remain preserved. |
| Whole-answer accuracy improved after the fix | Unmeasured. Different model regime, two development questions, and no independent human scores. |
| Confirmatory benchmark is ready | NO-GO. Human adjudication and cohort evidence freeze remain unmet. All 133 reserved candidate records remain unchanged. |

[Readiness report](../harness_validation_v1/BENCHMARK_READINESS.md)

---

## Preserved preceding mapping

''')}
    for path, (name, prefix) in updates.items():
        archive = HERE / name
        if not archive.exists():
            archive.write_bytes(path.read_bytes())
        path.write_text(prefix + archive.read_text(encoding='utf8'), encoding='utf8')
    verified = 0
    for folder in ('exploratory_frozen_v1', 'exploratory_frozen_v2', 'failure_diagnosis', 'workflow_fix_v1'):
        base = ROOT / folder
        for name, expected in json.loads((base / 'provenance.json').read_text()).items():
            assert sha(base / name) == expected, (folder, name)
            verified += 1
    save('preservation_check.json', {'prior_artifacts_verified': verified, 'mismatches': 0,
        'reserved_count': 133, 'reserved_sha256': static['reserved_sha256'], 'model_attempts': 8,
        'model_attempts_excluded': 0, 'setup_failures_separately_retained': 2})
    save('provenance.json', {str(p.relative_to(HERE)): sha(p) for p in sorted(HERE.rglob('*'))
        if p.is_file() and p.name != 'provenance.json' and '__pycache__' not in p.parts})
    print(json.dumps({'real_model_observations': 8, 'chat_calls': len(calls),
        'prior_artifacts_preserved': verified, 'larger_campaign': 'NO-GO'}))

if __name__ == '__main__':
    main()
