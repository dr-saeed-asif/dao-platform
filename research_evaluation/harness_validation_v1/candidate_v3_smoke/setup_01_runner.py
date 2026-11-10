"""Versioned matched-decoding development smoke. Never loads benchmark gold."""
import asyncio
import hashlib
import importlib.util
import inspect
import json
import logging
import os
import platform
import random
import subprocess
import sys
import time
from pathlib import Path
from unittest.mock import patch

import httpx
from langchain_core.utils.function_calling import convert_to_openai_tool
from psycopg_pool import AsyncConnectionPool
from app.business.agents import planning, synthesis
from app.business.agents.blockchain import BlockchainVerificationAgent
from app.business.agents.tools import build_tools
from app.business.agents.workflow import MultiAgentWorkflow
from app.business.mcp.context import ExecutionContext
from app.business.rag.service import RagService
from app.model.config.settings import settings

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DAO = ROOT.parent
sys.path.insert(0, str(HERE))
import single_agent

spec = importlib.util.spec_from_file_location('frozen_helpers', ROOT / 'exploratory_frozen_v2/run.py')
helpers = importlib.util.module_from_spec(spec); spec.loader.exec_module(helpers)
baseline = helpers.baseline
OPTIONS = {'seed': 42, 'temperature': 0, 'num_ctx': 8192, 'num_predict': 1536,
           'top_p': 0.8, 'top_k': 20, 'repeat_penalty': 1.1}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(name, value):
    (HERE / name).write_text(json.dumps(baseline.clean(value), indent=2, default=str) + '\n', encoding='utf8')

async def main():
    checks = json.loads((HERE / 'static_checks.json').read_text())
    assert checks['passed']
    for module in (planning, synthesis):
        recorded = next(r for r in checks['loaded_fixed_modules'] if r['module'] == module.__name__)
        assert sha(Path(inspect.getfile(module))) == recorded['sha256']
    reserved = ROOT / 'exploratory_frozen_v2/remaining_unexposed_questions.json'
    assert sha(reserved) == checks['reserved_sha256']
    cases = json.loads((HERE / 'development_questions.json').read_text())
    assert len(cases) == 1 and all(c['id'].startswith('DEV-') for c in cases)
    async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
        tags = (await client.get(settings.ollama_base_url + '/api/tags')).raise_for_status().json()
        version = (await client.get(settings.ollama_base_url + '/api/version')).raise_for_status().json()
    models = {m['name']: m['digest'] for m in tags['models']}
    assert settings.ollama_chat_model in models
    pool = AsyncConnectionPool(settings.postgres_url, kwargs={
        'options': '-c default_transaction_read_only=on', 'autocommit': True}, min_size=1, max_size=8, open=False)
    await pool.open(wait=True, timeout=10)
    try:
        async with pool.connection() as exporter:
            async with exporter.transaction():
                await exporter.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                snapshot = (await (await exporter.execute('SELECT pg_export_snapshot()')).fetchone())[0]
                fingerprints = await helpers.fingerprints(exporter)
                original_config = json.loads((HERE.parent / 'config.json').read_text())
                assert fingerprints == original_config['table_fingerprints'], 'Source state changed; affected replay cannot proceed'
                assert sha(HERE / 'chain_snapshot.json') == sha(HERE.parent / 'chain_snapshot.json')
                bundle = {p.as_posix(): sha(p) for base in (
                    'app/business/agents', 'app/business/rag', 'app/business/mcp')
                    for p in Path(base).rglob('*.py')}
                config = {'classification': 'Development smoke with real model and read-only SQL; chain evidence replay',
                    'questions_sha256': sha(HERE / 'development_questions.json'),
                    'runner_sha256': sha(Path(__file__)), 'single_agent_sha256': sha(HERE / 'single_agent.py'),
                    'model': settings.ollama_chat_model, 'model_digest': models[settings.ollama_chat_model],
                    'embedding_model': settings.ollama_embed_model, 'embedding_digest': models[settings.ollama_embed_model],
                    'options_all_chat_stages': OPTIONS, 'max_chat_requests_per_case': 6,
                    'case_deadline_seconds': 200, 'concurrency': 1, 'order_seed': 73,
                    'table_fingerprints': fingerprints, 'source_bundle_sha256': bundle,
                    'verifier_source_sha256': sha(DAO / 'apps/api/src/ai/blockchain-verification.service.ts'),
                    'verifier_compiled_sha256': sha(DAO / 'apps/api/dist/ai/blockchain-verification.service.js'),
                    'capture_helper_sha256': sha(ROOT / 'exploratory_frozen_v2/capture_chain.cjs'),
                    'infrastructure': {'platform': platform.platform(), 'machine': platform.machine(),
                        'python': platform.python_version(), 'ollama': version},
                    'normalization': 'Research-process HTTP interceptor normalizes model and decoding only; production files unchanged',
                    'prompts': 'Architecture-specific production planner/synthesis and declared single-agent prompt; exact sanitized requests retained',
                    'tool_access': 'B2 uses same build_tools/context as full workflow, all 22 names; same evidence extraction and canonical citation registry',
                    'evidence': 'One shared exported read-only SQL snapshot and captured corrected-verifier chain replay',
                    'human_adjudication': 'pending', 'confirmatory': False,
                    'scoring_policy': 'No whole-answer accuracy claim. Structural syntax checks, transport failures and descriptive resources only; any source-fact checks reported separately.',
                    'reserved_questions_sha256': checks['reserved_sha256']}
                path = HERE / 'config.json'
                if path.exists():
                    assert json.loads(path.read_text()) == config, 'Resume configuration mismatch'
                else:
                    save('config.json', config)
                chain_path = HERE / 'chain_snapshot.json'
                if not chain_path.exists():
                    process = await asyncio.to_thread(subprocess.run, ['node', str(ROOT / 'exploratory_frozen_v2/capture_chain.cjs'),
                        snapshot, str(chain_path)], cwd=DAO, capture_output=True, text=True)
                    save('capture_process.json', {'exit_code': process.returncode,
                        'stdout': process.stdout, 'stderr': process.stderr})
                    assert process.returncode == 0, 'Fresh chain capture blocked'
                chain = json.loads(chain_path.read_text())
                async def replay(self, dao_id, proposal_id):
                    if not self.context.operator_verified:
                        raise PermissionError('Operator required')
                    for record in chain:
                        if record['dao_id'] == dao_id and record['proposal_id'] == proposal_id:
                            return record
                    raise PermissionError('Frozen scope unavailable')
                rag = RagService(helpers.FrozenPool(pool, snapshot)); rag.recorder = helpers.LocalRecorder()
                context = ExecutionContext(rag.pool, rag, True)
                tools, graph = build_tools(context), MultiAgentWorkflow(context, concurrency=1)
                schemas = {name: convert_to_openai_tool(tool) for name, tool in tools.items()}
                assert len(schemas) == 22
                assert schemas == {name: convert_to_openai_tool(tool) for name, tool in graph.tools.items()}
                save('tool_schemas.json', schemas)
                probes = []
                for name, args in [('get_proposal', {'dao_id': cases[0]['dao'], 'proposal_id': cases[0]['proposal']}),
                    ('get_proposal_voting_facts', {'dao_id': cases[0]['dao'], 'proposal_id': cases[0]['proposal']}),
                    ('search_proposal_evidence', {'dao_id': cases[0]['dao'], 'proposal_id': cases[0]['proposal'],
                                                'question': cases[1]['question'], 'top_k': 4})]:
                    result = await tools[name].ainvoke(args)
                    assert result.get('success'), 'Read-only tool preflight failed: ' + name
                    probes.append({'name': name, 'result': result})
                # Check scope and evidence extraction before any chat request.
                try:
                    single_agent.check_scope(cases[0], {'dao_id': 'outside-development-scope'})
                except PermissionError:
                    denied = True
                else:
                    denied = False
                assert denied
                registry = synthesis.CitationRegistry()
                from_evidence = single_agent.evidence_rows(probes[-1]['name'], probes[-1]['result'], registry)
                assert from_evidence
                # Positive comparison-scope parity using actual same-DAO records, when available.
                peers = await (await exporter.execute('SELECT id FROM public.proposals WHERE dao_id = %s ORDER BY id LIMIT 2', (cases[0]['dao'],))).fetchall()
                comparison = {'same_dao_records_available': len(peers), 'positive_test_completed': False}
                if len(peers) == 2:
                    args = {'dao_id': cases[0]['dao'], 'proposal_a': str(peers[0][0]), 'proposal_b': str(peers[1][0])}
                    single_agent.check_scope(cases[0], args)
                    a = await tools['compare_dao_proposals'].ainvoke(args)
                    b = await graph.tools['compare_dao_proposals'].ainvoke(args)
                    assert a.get('success') and a == b
                    comparison.update(positive_test_completed=True, identical_results=True)
                save('comparison_scope_preflight.json', comparison)
                save('preflight.json', {'passed': True, 'equivalent_tool_schemas': True, 'registered_tools': 22,
                    'out_of_scope_B2_denied_before_execution': denied, 'read_only_tools': probes,
                    'B2_evidence_source_ids': [s['source_id'] for s in from_evidence],
                    'shared_chain_sha256': sha(chain_path), 'SQL_read_only': True,
                    'embedding_preflight_is_real': True, 'chat_calls': 0})
                original_send = httpx.AsyncClient.send
                observed = []
                async def measured_send(client, request, *args, **kwargs):
                    if request.url.path not in ('/api/chat', '/api/embed', '/api/embeddings'):
                        return await original_send(client, request, *args, **kwargs)
                    payload = json.loads(request.content)
                    if request.url.path == '/api/chat':
                        if sum(c['path'] == '/api/chat' for c in observed) >= 6:
                            raise RuntimeError('Shared six-chat request budget exhausted')
                        payload.update(model=config['model'], options=dict(OPTIONS), think=False, stream=False)
                        request = httpx.Request(request.method, request.url, headers=request.headers,
                            content=json.dumps(payload).encode(), extensions=request.extensions)
                        # Content length must describe the normalized JSON, not the old payload.
                        request.headers['content-length'] = str(len(request.content))
                    started = time.perf_counter()
                    record = {'path': request.url.path, 'request_sha256': hashlib.sha256(request.content).hexdigest(),
                              'request': payload}
                    observed.append(record)
                    try:
                        response = await original_send(client, request, *args, **kwargs)
                        record.update(http=response.status_code, response=response.json())
                        return response
                    except Exception as exc:
                        record['error'] = type(exc).__name__
                        raise
                    finally:
                        record['ms'] = (time.perf_counter() - started) * 1000
                raw = HERE / 'responses.jsonl'
                completed = set()
                if raw.exists():
                    completed = {(r['id'], r['variant']) for r in map(json.loads, raw.read_text().splitlines())}
                randomizer = random.Random(73)
                with patch.object(BlockchainVerificationAgent, 'snapshot', replay), patch.object(httpx.AsyncClient, 'send', measured_send), raw.open('a', encoding='utf8') as output:
                    for case in cases:
                        variants = ['B2']  # Only the tool-error-transparency-affected development pair
                        for variant in variants:
                            if (case['id'], variant) in completed:
                                continue
                            observed.clear(); rag.recorder.records.clear(); started = time.perf_counter()
                            try:
                                async with asyncio.timeout(200):
                                    result = await single_agent.run(case, context, variant == 'B2') if variant in ('B1', 'B2') else await baseline.run_case(case, variant, context)
                                error = None
                            except Exception as exc:
                                result = {'answer': None, 'status': 'failed', 'sources': [], 'output_origin': 'no_final_answer'}
                                error = type(exc).__name__ + ': ' + str(exc)[:120]
                            row = {'id': case['id'], 'variant': variant, 'question': case['question'],
                                'wall_ms': (time.perf_counter() - started) * 1000, 'error': error,
                                **result, 'provider_calls': list(observed), 'tool_metrics': list(rag.recorder.records)}
                            output.write(json.dumps(baseline.clean(row), default=str, ensure_ascii=False) + '\n')
                            output.flush(); os.fsync(output.fileno())
                            print(case['id'], variant, result['status'], round(row['wall_ms']), flush=True)
                assert sha(reserved) == checks['reserved_sha256']
                save('completion.json', {'records': 1, 'reserved_count': 133, 'reserved_file_unchanged': True,
                    'chat_options_equal': all(c['request']['options'] == OPTIONS for c in observed if c['path'] == '/api/chat'),
                    'note': 'Whole-run per-call checks performed by separate analysis; this last-call check is not the aggregate audit.'})
    finally:
        await pool.close()

if __name__ == '__main__':
    logging.basicConfig(level=logging.ERROR)
    try:
        asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop if sys.platform == 'win32' else None)
    except Exception as exc:
        number = len(list(HERE.glob('execution_blocker*.json'))) + 1
        save(f'execution_blocker_{number:02d}.json', {'error_type': type(exc).__name__, 'message': str(exc)[:180],
                                      'scope': 'Preserve completed attempts; do not change eligibility or raw responses.'})
        raise
