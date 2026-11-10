"""Affected application smoke replay. No model, SQL or RPC calls; no gold loaded."""
import asyncio
import hashlib
import importlib.util
import json
import time
from pathlib import Path

from app.business.agents.models import QuestionResult
from app.business.agents.planning import plan_questions
from app.business.agents.question_planner import QuestionPlan
from app.business.agents.quality import verify_citations
from app.business.agents.synthesis import synthesize, supported_amounts

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def load_pre(name):
    path = HERE / 'pre_fix' / 'app' / 'business' / 'agents' / (name + '.py')
    spec = importlib.util.spec_from_file_location('app.business.agents._pre_fix_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def main():
    destination = HERE / 'smoke_replay.jsonl'
    if destination.exists():
        raise RuntimeError('Completed replay exists; preserve it. Use a new version for a new run.')
    taxonomy = json.loads((ROOT / 'failure_diagnosis/full_workflow_taxonomy.json').read_text())
    rows = [json.loads(line) for line in (ROOT / 'exploratory_frozen_v2/responses.jsonl').read_text().splitlines()]
    selected = {(r['id'], r['variant']): r for r in rows}
    pre_plan, pre_synthesis = load_pre('planning'), load_pre('synthesis')
    records = []
    for diagnosis in taxonomy:
        if not (diagnosis['routing_or_source_coverage_failure'] or diagnosis['TASK_header_format_failure']):
            continue
        row = selected[diagnosis['id'], diagnosis['variant']]
        result = {'id': row['id'], 'variant_of_saved_output': row['variant'],
                  'mode': 'Recorded provider-output replay; zero inference/tool execution',
                  'source_raw_file': diagnosis['raw_file'], 'source_raw_line': diagnosis['raw_line'],
                  'historical_response_unchanged': True}
        calls = [c for c in row['provider_calls'] if c['path'] == '/api/chat']
        if diagnosis['routing_or_source_coverage_failure']:
            parsed = QuestionPlan.model_validate_json(calls[0]['response']['message']['content'])
            questions = [q.question for q in parsed.questions]
            before = pre_plan.plan_questions(questions, parsed.questions)
            after = plan_questions(questions, parsed.questions)
            required = {'proposal'} if row['id'].startswith('DB-') else {'evidence', 'governance', 'blockchain'}
            result['routing'] = {'required_source_roles': sorted(required),
                'pre_agents': [p.agents for p in before], 'post_agents': [p.agents for p in after],
                'pre_coverage': required <= {a for p in before for a in p.agents},
                'post_coverage': required <= {a for p in after for a in p.agents}}
            assert result['routing']['post_coverage']
        if diagnosis['TASK_header_format_failure']:
            text = calls[-1]['response']['message']['content']
            workers = [QuestionResult.model_validate(w) for w in row['worker_results']]
            class Replay:
                async def chat(self, *args, **kwargs):
                    return text, 0, {}
            observations = {}
            for label, function in [('pre', pre_synthesis.synthesize), ('post', synthesize)]:
                started = time.perf_counter()
                composed = await function(row['question'], workers, Replay(), 'recorded-output-no-model')
                observations[label] = {'accepted': not composed.errors, 'answer': composed.answer,
                    'errors': composed.errors, 'local_replay_ms': (time.perf_counter() - started) * 1000}
            # These replay cases use an active gate for both labels, including saved B3 output.
            fallback = pre_synthesis.combined_response(row['question'], workers)
            checked = verify_citations(text, [s.model_dump() for s in fallback.cited_sources])
            gates_allow = bool(checked['valid'] and checked['cited']) and supported_amounts(
                text, fallback.cited_sources, row['question'])
            result['synthesis'] = {'recorded_writer_sha256': hashlib.sha256(text.encode()).hexdigest(),
                'gate': 'Active reference/currency checks in both replay versions; not a B3/B4 experiment',
                'reference_and_currency_permit_acceptance': gates_allow, **observations}
            assert observations['post']['accepted'] == gates_allow
        records.append(result)
    with destination.open('x', encoding='utf8') as output:
        for row in records:
            output.write(json.dumps(row, ensure_ascii=False) + '\n')
    summary = {'replayed_observations': len(records),
        'routing_cases': sum('routing' in r for r in records),
        'pre_source_coverage': sum(r.get('routing', {}).get('pre_coverage', False) for r in records),
        'post_source_coverage': sum(r.get('routing', {}).get('post_coverage', False) for r in records),
        'synthesis_cases': sum('synthesis' in r for r in records),
        'pre_synthesis_accepted': sum(r.get('synthesis', {}).get('pre', {}).get('accepted', False) for r in records),
        'post_synthesis_accepted': sum(r.get('synthesis', {}).get('post', {}).get('accepted', False) for r in records),
        'new_model_runs': 0, 'database_or_RPC_calls': 0,
        'gold_loaded': False, 'human_adjudicated': False,
        'scope': 'Component smoke replay only. No claim of improved end-to-end answer accuracy.'}
    (HERE / 'smoke_summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    asyncio.run(main())
