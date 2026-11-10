"""Static environment/citation validation; no inference and no benchmark mutation."""
import asyncio
import hashlib
import inspect
import json
import re
import sys
from pathlib import Path

from app.business.agents import planning, synthesis
from app.business.agents.models import CitedSource, QuestionResult
from app.business.agents.quality import verify_citations
from app.business.rag.ollama_answers import ABSTENTION

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf8')

async def main():
    if (HERE / 'static_checks.json').exists():
        raise RuntimeError('Validation exists; preserve it and use a new version for changed observations.')
    version = json.loads((ROOT / 'workflow_fix_v1/implementation_version.json').read_text())
    modules = []
    for module in (planning, synthesis):
        path = Path(inspect.getfile(module)).resolve()
        key = 'app/business/agents/' + path.name
        modules.append({'module': module.__name__, 'loaded_path': str(path),
                        'sha256': sha(path), 'matches_fixed_version': sha(path) == version['after'][key]})
    assert all(m['matches_fixed_version'] for m in modules)
    sources = [{'source_id': 'D1', 'content': 'The fixture total is EUR 814.'}]
    cases = [
        ('known', 'EUR 814 [D1].', True),
        ('unknown_D', 'EUR 814 [D987].', False),
        ('mixed_known_unknown', 'EUR 814 [D1] [G987].', False),
        ('no_marker', 'EUR 814.', False),
        ('bare_id', 'EUR 814, source D1.', False),
        ('exact_abstention', ABSTENTION, True),
        ('ignored_namespace', 'EUR 814 [D1] [B987].', True),
        ('ignored_malformed_id', 'EUR 814 [D1] [D 987].', True),
    ]
    structural = []
    for name, answer, expected in cases:
        result = verify_citations(answer, sources)
        assert result['valid'] == expected
        structural.append({'case': name, 'answer': answer, 'observed': result,
            'expected_from_implementation': expected,
            'limitation': name.startswith('ignored_')})
    runtime = []
    worker = QuestionResult(question_id='q1', question='Explain the fixture total', agent='evidence',
        status='completed', answer='Retrieved supporting source material [D1]',
        citations=['D1'], cited_sources=[CitedSource(**s) for s in sources])
    for name, answer, expected in [cases[i] for i in (0, 1, 2, 3, 5)]:
        class Model:
            async def chat(self, *args, **kwargs):
                return answer, 0, {}
        result = await synthesis.synthesize(worker.question, [worker], Model(), 'injected-output-no-model')
        accepted = not result.errors
        # Exact abstention is structurally valid, but synthesis requires a source citation.
        expected_acceptance = name == 'known'
        assert accepted == expected_acceptance
        runtime.append({'case': name, 'accepted': accepted, 'errors': result.errors,
                        'expected_acceptance': expected_acceptance})
    save('citation_gate_probes.json', {'structural_cases': structural,
        'active_synthesis_cases': runtime, 'model_calls': 0,
        'interpretation': 'Unknown D/G IDs reject, including mixed valid/invalid IDs. Unsupported/malformed namespaces are ignored by the D/G regex when another valid ID is present. No semantic support guarantee.'})

    raw = {(r['id'], r['variant']): r for r in map(json.loads,
        (ROOT / 'exploratory_frozen_v2/responses.jsonl').read_text().splitlines())}
    classified = []
    for replay in map(json.loads, (ROOT / 'workflow_fix_v1/smoke_replay.jsonl').read_text().splitlines()):
        if 'synthesis' not in replay or replay['synthesis']['post']['accepted']:
            continue
        r = raw[replay['id'], replay['variant_of_saved_output']]
        text = [c for c in r['provider_calls'] if c['path'] == '/api/chat'][-1]['response']['message']['content']
        db = r['id'] == 'DB-016'
        classified.append({'id': r['id'], 'variant': r['variant'],
            'raw_reference': replay['source_raw_file'] + ':' + str(replay['source_raw_line']),
            'writer_text': text, 'writer_sha256': hashlib.sha256(text.encode()).hexdigest(),
            'bracketed_citation_count': len(re.findall(r'\[(?:D|G)\d+\]', text)),
            'bare_source_ids': re.findall(r'\b[DG]\d+\b', text),
            'returned_source_count': sum(len(w['cited_sources']) for w in r['worker_results']),
            'citation_failure': 'bare source IDs instead of required bracket syntax' if db else 'citations absent',
            'evidence_diagnosis': 'Requested SQL metadata absent from returned PDF evidence because of routing' if db else 'Returned passages support a bounded unknown or explicit absence; requested positive fact is not established',
            'model_diagnosis': 'Nonempty completed generation omitted required citation framing',
            'transport_failure': False,
            'review_status': 'AI-assisted source/trace classification; human adjudication pending'})
    assert len(classified) == 6 and all(r['bracketed_citation_count'] == 0 for r in classified)
    save('six_citation_failures.json', classified)
    reserved = ROOT / 'exploratory_frozen_v2/remaining_unexposed_questions.json'
    questions = json.loads(reserved.read_text())
    assert len(questions) == 133
    # Only previously exposed scope and facts are reused. No reserved ID is submitted.
    old_cases = json.loads((ROOT / 'benchmark_200/versions/claude_adjudicated_v3/confirmatory_questions.json').read_text())
    exposed = next(q for q in old_cases if q['id'] == 'DB-016')
    dev = [
        {'id': 'DEV-SQL-01', 'question': 'For a diagnostic display, read the selected proposal record and report its stored on-chain proposal identifier, with a source citation.'},
        {'id': 'DEV-MIX-01', 'question': 'Explain the workshop preparation and facilitation allocation in the attached PDF, then report the stored database vote tally for the selected proposal. Keep document plans separate from recorded votes.'},
    ]
    normalize = lambda text: re.sub(r'\W+', ' ', text.casefold()).strip()
    reserved_texts = {normalize(q['question']) for q in questions}
    assert not any(normalize(q['question']) in reserved_texts for q in dev)
    for q in dev:
        q.update(dao=exposed['dao'], proposal=exposed['proposal'], permission='member',
                 source_policy='Already exposed training scope and facts from DB-016/PDF-026/MS-026; development only')
    save('development_questions.json', dev)
    save('static_checks.json', {'passed': True, 'loaded_fixed_modules': modules,
        'interpreter': sys.executable, 'python': sys.version,
        'reserved_question_count': 133, 'reserved_sha256': sha(reserved),
        'development_exact_duplicates_of_reserved': 0,
        'semantic_independence': 'Not a new held-out cohort. Development wording reuses already exposed facts deliberately.',
        'structural_probe_count': len(structural), 'active_synthesis_probe_count': len(runtime),
        'known_runtime_limitations': ['Citation regex ignores unsupported/malformed IDs if a valid D/G ID is also present',
                                     'Reference/amount checks do not establish semantic support'],
        'scope': 'GO for development harness smoke only; not authorization or confirmatory benchmark validation'})
    print(json.dumps({'static_passed': True, 'citation_failures_classified': 6,
                      'reserved_questions': 133, 'development_questions': 2}))

if __name__ == '__main__':
    asyncio.run(main())
