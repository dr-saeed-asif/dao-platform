"""Seal the corrected version and document tests without inference or score changes."""
import csv
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DAO = ROOT.parent
AI = DAO.parent / 'api-ai-server1/api-ai-server'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf8')

def main():
    files = ['app/business/agents/planning.py', 'app/business/agents/synthesis.py',
             'tests/test_question_planner.py', 'tests/test_agent_failure_regressions.py']
    for name in files:
        destination = HERE / 'post_fix' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes((AI / name).read_bytes())
    patch = subprocess.check_output(['git', '-C', str(AI), 'diff', '--', *files], text=True)
    # New untracked regression file is versioned in post_fix, outside git diff.
    (HERE / 'implementation.patch').write_text(patch, encoding='utf8')
    save('implementation_version.json', {
        'version': 'workflow_fix_v1',
        'AI_base_commit': subprocess.check_output(['git', '-C', str(AI), 'rev-parse', 'HEAD'], text=True).strip(),
        'before': {str(p.relative_to(HERE / 'pre_fix')): sha(p) for p in (HERE / 'pre_fix').rglob('*') if p.is_file()},
        'after': {name: sha(AI / name) for name in files},
        'production_scope': 'AI routing source-coverage floor and single-task synthesis framing only',
        'deployment': 'Source and isolated tests only. Running server reload not performed or verified.',
        'new_test_in_patch': False,
        'new_test_location': 'post_fix/tests/test_agent_failure_regressions.py',
        'historical_baseline_entry_script_unchanged': sha(ROOT / 'benchmark_200/scripts/run.py') ==
            json.loads((ROOT / 'exploratory_frozen_v2/config.json').read_text())['baseline_sha256'],
    })
    logs = [('guard_edge_case_regressions.txt', 12), ('test_agent_synthesis.py.txt', 10),
            ('test_agent_routing_requirements.py.txt', 9), ('planner_contract_post_fix.txt', 15),
            ('test_agent_workflow.py.txt', 12), ('tool_permission_regressions.txt', 3)]
    results = []
    for name, expected in logs:
        text = (HERE / name).read_text(encoding='utf8')
        assert re.search(rf'Ran {expected} tests? ', text) and text.rstrip().endswith('OK'), name
        results.append({'log': name, 'tests': expected, 'result': 'pass'})
    save('targeted_tests.json', {'final_distinct_tests': sum(r['tests'] for r in results),
        'results': results, 'pre_fix_failure_entries': 5, 'pre_fix_test_methods': 11,
        'initial_related_suite_failure': 'One legacy planner assertion required governance alone for an explicitly PDF-sourced question. Original test and failed log retained; revised assertion requires evidence plus governance.',
        'rerun_scope': 'New regression suite rerun after added status-comparison edge case; only planner suite rerun after updating its obsolete contract assertion.'})

    provider = json.loads((ROOT / 'failure_diagnosis/provider_options.json').read_text())
    counts = Counter((r['variant'], r['model'], json.dumps(r['options'], sort_keys=True)) for r in provider)
    config = json.loads((ROOT / 'exploratory_frozen_v2/config.json').read_text())
    # Importing this static catalog performs no tool execution.
    from app.business.agents.catalog import TOOL_NAMES, AGENT_TOOLS
    save('baseline_configuration_audit.json', {
        'basis': 'Observed historical selected-response calls and static tool catalog; not new model measurements',
        'model': config['model'], 'model_digest': config['model_digests'][config['model']],
        'embedding_model': config['embedding_model'],
        'observed_option_groups': [{'variant': v, 'model': m, 'options': json.loads(o), 'calls': n}
                                   for (v, m, o), n in sorted(counts.items())],
        'tools_B1': [], 'registered_tools_B2': list(TOOL_NAMES),
        'full_workflow_role_tools': AGENT_TOOLS,
        'source_replay_sha256': config['frozen_chain_sha256'],
        'historical_source_manifest': '../exploratory_frozen_v2/config.json',
        'prompt_and_response_provenance': ['../exploratory_frozen_v1/responses.jsonl', '../exploratory_frozen_v2/responses.jsonl'],
        'shared_scope_and_evidence': True, 'decoding_fully_matched': False,
        'prompt_protocols_matched': False, 'inference_opportunities_matched': False,
        'causal_architecture_comparison_validated': False,
        'full_benchmark_gate': 'BLOCKED: component tests pass, but matched new-campaign settings and end-to-end live harness preflight remain pending. Human adjudication pending for confirmatory claims.',
        'baseline_definitions': {'B1': 'LLM without retrieval', 'B2': 'One agent with all 22 permitted tools and scope guards',
            'B3': 'Full workflow with citation/currency/numeric blocking gates disabled in research process',
            'B4': 'Full workflow with those gates active'},
    })
    # Recheck final-version routing only after the status-comparison edge-case guard.
    # Do not repeat the synthesis replays or any inference.
    from app.business.agents.question_planner import QuestionPlan
    from app.business.agents.planning import plan_questions
    raw = [json.loads(s) for s in (ROOT / 'exploratory_frozen_v2/responses.jsonl').read_text().splitlines()]
    original = {(r['id'], r['variant']): r for r in raw}
    routing = []
    for replay in map(json.loads, (HERE / 'smoke_replay.jsonl').read_text().splitlines()):
        if 'routing' not in replay:
            continue
        row = original[replay['id'], replay['variant_of_saved_output']]
        call = next(c for c in row['provider_calls'] if c['path'] == '/api/chat')
        plan = QuestionPlan.model_validate_json(call['response']['message']['content'])
        resolved = plan_questions([q.question for q in plan.questions], plan.questions)
        agents = {a for q in resolved for a in q.agents}
        covered = set(replay['routing']['required_source_roles']) <= agents
        assert covered
        routing.append({'id': row['id'], 'variant': row['variant'], 'agents': sorted(agents), 'required_sources_covered': covered})
    save('final_guard_routing_check.json', {'code_sha256': sha(AI / files[0]), 'observations': routing,
                                          'model_calls': 0, 'tool_calls': 0})

    rows = [
        ('Harness pool protocol', 16, 'excluded initial attempts', 'Already fixed in frozen_v2; original records retained'),
        ('Harness recorder dataclass', 2, 'excluded initial attempts', 'Already fixed in frozen_v2; original records retained'),
        ('Required source coverage', 8, '16 usable full-workflow observations', 'Floor covers 8/8 affected saved plans; extra planner-selected roles can remain'),
        ('Synthesis header contract', 8, '16 usable full-workflow observations', '2/8 replay outputs accepted; 6/8 still blocked by citation requirements'),
        ('Contradicted B4 budget relations', 2, 'claims in one saved B4 answer', 'Unchanged documented semantic-validation limitation'),
        ('Contradicted B3 budget relations', 2, 'claims in one saved B3 answer', 'Unchanged; verification disabled in that variant'),
    ]
    with (HERE / 'failure_taxonomy_update.csv').open('w', newline='', encoding='utf8') as output:
        writer = csv.writer(output)
        writer.writerow(['class', 'pre_fix_count', 'denominator_or_unit', 'current_status'])
        writer.writerows(rows)

    updates = {
        ROOT / 'SPRINGER_EXPERIMENTAL_RESULTS.md': ('SPRINGER_BEFORE_WORKFLOW_FIX.md', '''# Workflow correction and component smoke evidence

The evaluation-adapter pool/recorder defects remain distinct from two verified application defects: missing explicitly requested source coverage in legal-looking semantic plans, and rejection of headerless single-task synthesis. The corrected source version adds a bounded source-coverage floor and accepts single-task bodies before applying the unchanged reference/currency checks. Multi-task coverage, wrong headers and duplicate headers still fail closed.

The final targeted set passed 61 tests. Fourteen affected saved observations were replayed without inference or SQL/RPC calls: required-source coverage changed from 0/8 to 8/8, and synthesis accepted 2/8 previously headerless outputs. Six remain blocked by citation requirements. These are component smoke results, not new model answer-accuracy observations. Original scores, all raw answers, ground truth and the two B4 semantic-support failures remain unchanged.

The original B1–B4 campaign has shared source evidence but unequal decoding, prompts and inference opportunities. The full benchmark remains gated on a matched new configuration and live end-to-end harness validation. Human adjudication remains pending. Corrected code is archived with before/after hashes and a patch; running-service deployment is unverified.

[Versioned fix and limitations](workflow_fix_v1/WORKFLOW_FIX_RESULTS.md) · [Smoke records](workflow_fix_v1/smoke_replay.jsonl) · [Baseline audit](workflow_fix_v1/baseline_configuration_audit.json)

---

## Preserved pre-correction report

'''),
        ROOT / 'springer/EVIDENCE_TO_CLAIMS.md': ('CLAIMS_BEFORE_WORKFLOW_FIX.md', '''# Workflow-fix evidence update

| Claim | Current status |
|---|---|
| Explicit requested sources cannot be silently omitted in the tested plans | Supported in 8/8 affected saved-plan checks, using a bounded source-coverage floor. This is not general routing accuracy. |
| A headerless single-task answer need not be discarded for format alone | Supported in regression/replay tests. Two of eight saved outputs pass unchanged citation/currency checks; six remain rejected. |
| Corrected workflow improves whole-answer accuracy | Unmeasured. No new model or end-to-end evaluation was performed. |
| Citation gates establish factual support | Unsupported. Both saved B4 budget-label contradictions remain evidence of the semantic gap. |
| B1–B4 constitute a matched causal comparison | Unsupported. Recorded settings, prompts and call opportunities differ. |
| Full benchmark is ready to run | Pending matched configuration, live harness preflight and appropriate adjudication. |

[Versioned correction](../workflow_fix_v1/WORKFLOW_FIX_RESULTS.md) · [Updated taxonomy](../workflow_fix_v1/failure_taxonomy_update.csv)

---

## Preserved preceding claim mapping

''')}
    for path, (name, prefix) in updates.items():
        archive = HERE / name
        if not archive.exists():
            archive.write_bytes(path.read_bytes())
        path.write_text(prefix + archive.read_text(encoding='utf8'), encoding='utf8')

    preserved = []
    for folder in ['exploratory_frozen_v1', 'exploratory_frozen_v2', 'failure_diagnosis']:
        base = ROOT / folder
        for name, expected in json.loads((base / 'provenance.json').read_text()).items():
            assert sha(base / name) == expected, (folder, name)
            preserved.append(folder + '/' + name)
    save('preservation_check.json', {'verified_files': len(preserved), 'mismatches': 0,
        'files': preserved, 'prior_reports_byte_preserved': True,
        'original_scores_ground_truth_raw_outputs_modified': False})
    save('provenance.json', {str(p.relative_to(HERE)): sha(p) for p in sorted(HERE.rglob('*'))
                             if p.is_file() and p.name != 'provenance.json' and '__pycache__' not in p.parts})
    print(json.dumps({'targeted_tests': 61, 'preserved_file_hashes': len(preserved), 'new_model_runs': 0}))


if __name__ == '__main__':
    main()
