"""Offline finalization only: validates append-only resumption; never runs a model.

Run from the AI checkout using its Python environment after run_live_remaining.py exits.
No gold answers are changed. Incomplete collections fail closed before finalization.
"""
import collections
import csv
import datetime
import hashlib
import json
import math
from pathlib import Path
import runpy
import statistics
import subprocess
import sys

H = Path(__file__).resolve().parents[1]
AI = Path('E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server')
RAW = ['raw/responses.jsonl', 'raw/frozen_rag_responses.jsonl',
       'live_campaign/raw/responses.jsonl']

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def digest(data):
    return hashlib.sha256(data).hexdigest()

def save(name, value):
    (H / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf8')

def rows(path):
    return [json.loads(line) for line in path.read_text(encoding='utf8').splitlines()]

def key(row):
    return row['id'], row['model'], row['condition']

def table(items):
    text = '| Model | Condition | Records/planned | Proxy matches | Failed | Warnings | Median/p95 wall (s) |\n|---|---|---:|---:|---:|---:|---:|\n'
    for g in items:
        text += (f"| {g['model']} | {g['condition']} | {g['attempted_n']}/133 | "
                 f"{g['reference_match_proxy_n']}/{g['attempted_n']} | {g['failed_n']} | "
                 f"{g['warning_answer_n']} | {g['median_wall_s']:.3f}/{g['p95_wall_s']:.3f} |\n")
    return text

def csvout(name, records):
    with (H / name).open('w', encoding='utf8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)

def main():
    pointer = read(H / 'ACTIVE_RESUME.json')
    original_path = H / pointer['manifest']
    original = read(original_path)
    baseline = original_path.parent
    raw_versions = original['preserved_files']
    original_rows = []
    preservation = []
    for name in RAW:
        old = (baseline / name).read_bytes()
        now = (H / name).read_bytes()
        assert digest(old) == raw_versions[name]['sha256']
        assert len(old) == raw_versions[name]['bytes']
        assert now[:len(old)] == old, f'Original raw prefix changed: {name}'
        if name != RAW[-1]:
            assert now == old, f'Completed condition was modified: {name}'
        original_rows.extend(rows(baseline / name))
        preservation.append({'path': name, 'original_bytes': len(old),
                             'original_sha256': digest(old), 'prefix_unchanged': True,
                             'current_sha256': digest(now)})
    observations = [row for name in RAW for row in rows(H / name)]
    frozen = read(H.parent / 'research_evaluation/exploratory_frozen_v2/remaining_unexposed_questions.json')
    expected = {(q['id'], model, condition) for q in frozen
                for model in ('qwen3:0.6b', 'qwen3:4b-instruct')
                for condition in ('B1', 'B2', 'B3', 'B4', 'A1', 'A2', 'A12')}
    actual = {key(row) for row in observations}
    assert len(actual) == len(observations), 'Duplicate attempt keys'
    assert not actual - expected, 'Unexpected attempt keys'
    missing = sorted(expected - actual)
    original_keys = {key(row) for row in original_rows}
    historical_failed = {key(row) for row in original_rows
                         if row.get('status') == 'failed' or not row.get('answer')}
    assert len(original_rows) == 1239 and len(historical_failed) == 38
    assert actual - original_keys <= {key(row) for row in original['missing_keys']}
    integrity = {'recorded': len(actual), 'expected': len(expected), 'missing': len(missing),
                 'duplicate_keys': 0, 'unexpected_keys': 0, 'parse_errors': 0,
                 'historical_failures_preserved': len(historical_failed),
                 'new_recorded_attempts': len(actual - original_keys),
                 'original_prefixes': preservation}
    save('RESUME_INTEGRITY.json', integrity)
    if '--inspect' in sys.argv:
        print(json.dumps(integrity))
        return
    assert not missing and len(actual) == 1862, 'Collection incomplete; no final results published'
    completion = read(H / 'live_campaign/completion.json')
    assert completion['completed_records'] == completion['planned_records'] == 1330
    assert completion['source_files_unchanged'] is True
    for name in ('analyze.py', 'check_transport.py', 'report_live.py', 'figures.py'):
        subprocess.run([sys.executable, '-X', 'utf8', str(H / 'scripts' / name)],
                       cwd=AI, check=True)
    transport = read(H / 'transport_configuration_audit.json')
    assert transport['configuration_mismatches'] == 0, 'Frozen transport configuration mismatch'
    groups = read(H / 'aggregate_metrics.json')['groups']
    for g in groups:
        durations = sorted(row['wall_ms'] / 1000 for row in observations
                           if (row['model'], row['condition']) == (g['model'], g['condition']))
        g.update(p95_wall_s=durations[math.ceil(.95 * len(durations)) - 1],
                 min_wall_s=durations[0], max_wall_s=durations[-1],
                 mean_wall_s=statistics.mean(durations), missing_n=133-g['attempted_n'],
                 observed_wall_over_201s_n=sum(t>201 for t in durations) if g['condition'] in ('B3','B4','A1','A2','A12') else None,
                 classification='exploratory; automated reference match is not answer accuracy',
                 latency_policy='all recorded attempts including failures; nearest-rank p95')
    baselines = [g for g in groups if g['condition'] in ('B1', 'B2', 'B3', 'B4')]
    ablations = [g for g in groups if g['condition'] in ('B4', 'A1', 'A2', 'A12')]
    csvout('FINAL_EXPLORATORY_RESULTS.csv', baselines)
    csvout('FINAL_ABLATION_RESULTS.csv', ablations)
    failures = [r for r in observations if r.get('status') == 'failed' or not r.get('answer')]
    error_counts = collections.Counter((r.get('error') or 'No final answer without outer exception').split(':', 1)[0] for r in failures)
    new_failed = sum(key(r) not in historical_failed for r in failures)
    failure_rows = [{'id':r['id'], 'model':r['model'], 'condition':r['condition'],
                     'historical':key(r) in historical_failed, 'status':r.get('status'),
                     'error':r.get('error'), 'wall_ms':r['wall_ms'],
                     'raw_path':RAW[0] if r['condition']=='B1' else RAW[1] if r['condition']=='B2' else RAW[2]}
                    for r in failures]
    csvout('FAILED_RUNS.csv', failure_rows)
    # Empty missing-key file has a header only.
    (H / 'MISSING_RUNS.csv').write_text('id,model,condition\n', encoding='utf8')
    save('EXECUTION_STATUS_AUDIT.json', {**integrity, 'status':'COMPLETE',
                                      'failed_n':len(failures), 'new_failures':new_failed})
    summary = f'''# Benchmark completion report
**COMPLETE: exploratory collection and analysis. Confirmatory evaluation: NO-GO.**

All 1,862 expected attempt keys are present, unique and parseable: 133 frozen questions × two model regimes × seven conditions. Exactly 623 missing attempts were appended (4B B3:91, B4:133, A1/A2/A12:399); no completed or previously failed attempt was repeated. Original 1,239 records remain byte-for-byte intact. The 38 historical failures are retained; {new_failed} new failures were recorded ({len(failures)}/1,862 total). Failures are observations, not absent runs.

{table(baselines)}
{table(ablations)}
Tables show automated reference matches, NOT independently validated whole-answer accuracy. All 133 remain in each condition's denominator. Structural citation validity is separate from factual support; a zero-claim or uncited response can be structurally valid. The gate's own labels are not independent claim-support judgments. Whole-answer accuracy remains unestimated. Human annotations/adjudication:0. All 133 questions are exploratory-exposed.

B1=no retrieval; B2=frozen-document RAG; B3=single agent with the same22 permitted tools; B4=full AI graph/gates with archived chain replay; A1=deterministic helpers disabled; A2=M7 blocking disabled (legacy structural/currency gates retained); A12=both. A_SQL's separate26/26 scalar matches are a hand-coded oracle on applicable DB questions, not part of the1,862 model attempts or equivalent-tool general reasoning baseline.

Frozen digests/settings/SQL fingerprints/source hashes passed preflight and transport checks. Exact prompts/provider responses and tool calls remain in raw files. Every chat stage uses seed42,temperature0.6,context8192,prediction1536,top_p0.8,top_k20,repeat_penalty1.1; six-chat budget,200-second case deadline,concurrency2. Production planner defaults differ: these are normalized research variants. Frozen question and gold files were not edited. Archived chain responses are not new RPC measurements or live C4/C7 tests.

Four shared proposal scopes and few PDFs create dependence. Four proposal-type questions have source-access alignment limitations (DB-008/018/028/038); they were retained without relabeling. Fixed seed, phase/cache/hardware residency and failures confound generalization and latency attribution. Live `started_utc` is a legacy completion timestamp; `wall_ms` is the recorded monotonic duration. The configured200-second async deadline is not asserted to be an absolute observed wall-time bound: overruns beyond201seconds are separately counted and not trimmed. Their scheduling/infrastructure cause is not independently established. B2 generation timing excludes cached retrieval/setup; successful-response tokens are observed counts, missing token reports are unknown, not zero cost.

Reproduction: from the AI checkout, use its `.venv/Scripts/python.exe` and existing authorized private configuration; do not publish credentials. `scripts/run_live_remaining.py --prepare` validates frozen sources without chat generation. `scripts/run_live_remaining.py` appends only absent keys; recorded failures are not retried. `scripts/finalize_resume.py` performs offline integrity checks, analysis, figures and sealing. Never start two writers. The original authorized database/index snapshot is required for inference reproduction; archived raw records support offline reanalysis.

Evidence: RESUME_INTEGRITY.json; versions/resume_20261112T065626Z/RESUME_MANIFEST.json; live_campaign/configuration.json; live_campaign/preflight.json; live_campaign/completion.json; transport_configuration_audit.json; per_question_automatic_metrics.csv; paired_descriptive_comparisons.json; raw/current_workflow_diagnostic.json; raw/arithmetic_guard_replay.json; diagnostic_answer_review.csv; evidence/new_exposure_ledger.json. Original outputs, contradictions and failures remain unchanged.
'''
    (H / 'BENCHMARK_COMPLETION_REPORT.md').write_text(summary, encoding='utf8')
    (H / 'EXECUTION_STATUS.md').write_text(summary, encoding='utf8')
    with (H / 'FAILURE_ANALYSIS.md').open('a', encoding='utf8') as stream:
        stream.write(f'''\n## Final resumed collection
All1,862 records retained; hard failures {len(failures)}/1,862 =38 historical +{new_failed} new. Outer-error classes: {dict(error_counts)}. These classes describe observed exceptions, not proven provider root causes. Worker errors/warnings and bounded fallback answers remain separate in failure_taxonomy.json and per_question_automatic_metrics.csv; labels overlap. Exact failed keys/raw references:FAILED_RUNS.csv. No failed answer was excluded from proxy denominators.

Why plain RAG can exceed the full graph on this proxy: the frozen corpus is small and directly supplies numeric anchors, while the full graph adds planning, routing, synthesis and conservative gates. Four saved0.6B B4 diagnostic cases show unrequested planner expansion, task substitution, fallback placeholders and treating budget-line ordinals as monetary inputs. A separate controlled replay rejected a correct computed9,000 total absent literally in evidence; this demonstrates a gate limitation, not the cause of every benchmark miss. A2 disables M7 blocking only and retains the legacy currency guard, so its effect is incremental. See raw/current_workflow_diagnostic.json and raw/arithmetic_guard_replay.json. These purposive observations do not establish prevalence or a causal decomposition of final scores.

The proxy itself accepts pooled numeric anchors even with wrong field labels and can miss valid paraphrases. Eight purposive RAG answer reviews and four numeric-claim checks expose such errors; they are AI-assisted, not human-adjudicated or representative. Thus RAG's higher proxy count does not prove better semantic accuracy. Architecture-specific prompts, four unavailable field projections, timeout/call-budget losses and normalized planner decoding also limit the comparison. No production behavior, gold answers or experimental outputs were changed to improve results.
''')
    with (H / 'STATISTICAL_ANALYSIS.md').open('a', encoding='utf8') as stream:
        stream.write('''\n## Final collection and estimands
All14 model/condition cells contain133 observations, including failures. FINAL_EXPLORATORY_RESULTS.csv and FINAL_ABLATION_RESULTS.csv add nearest-rank p95,mean,min,max wall times using every recorded attempt. Four-scope cluster-bootstrap95% intervals and paired differences are in aggregate_metrics.json/paired_descriptive_comparisons.json (2,000 resamples,seed110911). Four clusters are too few for robust population inference; these are conditional descriptive intervals, not human accuracy uncertainty or proof of statistical significance. No independent-question binomial test is justified. Fixed-seed observations are not repeated stochastic trials. Proxy matches, abstention cues and automated gate labels are separate descriptive measures; no independently validated correctness/disclosure metric is claimed.
''')
    runpy.run_path(str(H / 'scripts/seal.py'), run_name='__main__')
    manifest = read(H / 'REPRODUCIBILITY_MANIFEST.json')
    manifest['resume_integrity'] = integrity
    # Include the base manifest as evidence, but exclude the final manifest itself.
    manifest['files']['REPRODUCIBILITY_MANIFEST.json'] = {
        'sha256':digest((H / 'REPRODUCIBILITY_MANIFEST.json').read_bytes()),
        'bytes':(H / 'REPRODUCIBILITY_MANIFEST.json').stat().st_size}
    manifest['files'].pop('FINAL_REPRODUCIBILITY_MANIFEST.json', None)
    save('FINAL_REPRODUCIBILITY_MANIFEST.json', manifest)
    for name, entry in manifest['files'].items():
        assert digest((H / name).read_bytes()) == entry['sha256'], name
    print(json.dumps({'complete':True, 'records':len(observations),
                      'historical_failures':38, 'new_failures':new_failed,
                      'manifest_files':len(manifest['files']), 'human_annotations':0}))

if __name__ == '__main__':
    main()
