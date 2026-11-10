"""Actual read-only same-DAO comparison parity. No model, gold or transactions."""
import asyncio
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

from psycopg_pool import AsyncConnectionPool
from app.business.agents.tools import build_tools
from app.business.agents.workflow import MultiAgentWorkflow
from app.business.mcp.context import ExecutionContext
from app.business.rag.service import RagService
from app.model.config.settings import settings

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import single_agent
import single_agent_candidate_v3 as candidate
spec = importlib.util.spec_from_file_location('compare_frozen_helpers', HERE.parent / 'exploratory_frozen_v2/run.py')
helpers = importlib.util.module_from_spec(spec); spec.loader.exec_module(helpers)

async def main():
    output = HERE / 'live_comparison_preflight.json'
    if output.exists():
        raise RuntimeError('Completed parity probe exists; do not repeat it.')
    pool = AsyncConnectionPool(settings.postgres_url, kwargs={
        'options': '-c default_transaction_read_only=on', 'autocommit': True}, open=False)
    await pool.open(wait=True, timeout=10)
    try:
        async with pool.connection() as exporter:
            async with exporter.transaction():
                await exporter.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
                snapshot = (await (await exporter.execute('SELECT pg_export_snapshot()')).fetchone())[0]
                row = await (await exporter.execute('SELECT dao_id FROM public.proposals GROUP BY dao_id HAVING count(*) >= 2 ORDER BY dao_id LIMIT 1')).fetchone()
                assert row, 'No real same-DAO pair available'
                ids = await (await exporter.execute('SELECT id FROM public.proposals WHERE dao_id = %s ORDER BY id LIMIT 2', (row[0],))).fetchall()
                case = {'dao': row[0], 'proposal': str(ids[0][0])}
                args = {'dao_id': row[0], 'proposal_a': str(ids[0][0]), 'proposal_b': str(ids[1][0])}
                candidate.check_scope(case, args)
                old_denied = False
                try:
                    single_agent.check_scope(case, args)
                except PermissionError:
                    old_denied = True
                assert old_denied
                rag = RagService(helpers.FrozenPool(pool, snapshot)); rag.recorder = helpers.LocalRecorder()
                context = ExecutionContext(rag.pool, rag, True)
                tools, graph = build_tools(context), MultiAgentWorkflow(context, concurrency=1)
                value = await tools['compare_dao_proposals'].ainvoke(args)
                token = graph._current_agent.set('research')
                try:
                    worker_value = await graph._invoke('compare_dao_proposals', args)
                finally:
                    graph._current_agent.reset(token)
                assert value.get('success') and value == worker_value['result']
                wrong = await tools['compare_dao_proposals'].ainvoke({**args, 'dao_id': '__invalid_development_DAO__'})
                assert wrong.get('success') is False
                result = {'mode': 'Actual SQL/tool execution with a shared read-only snapshot; zero inference',
                    'old_B2_scope_rejected_permitted_comparison': old_denied,
                    'candidate_scope_accepts_comparison': True,
                    'full_research_worker_accepts_comparison': True,
                    'identical_backend_results': True,
                    'comparison_result_sha256': hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest(),
                    'wrong_DAO_backend_denied': True, 'wrong_DAO_error': wrong.get('error', {}).get('code'),
                    'distinct_proposals': len({a[0] for a in ids}), 'candidate_sha256': hashlib.sha256((HERE / 'single_agent_candidate_v3.py').read_bytes()).hexdigest(),
                    'limit': 'One observed positive/negative comparison pair, not comprehensive permission verification',
                    'operator_context': True, 'member_wallet_authentication_tested': False,
                    'private_or_member_rows_exported': False}
                output.write_text(json.dumps(result, indent=2) + '\n')
                print(json.dumps({'live_comparison_parity_passed': True, 'model_calls': 0}))
    finally:
        await pool.close()

if __name__ == '__main__':
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop if sys.platform == 'win32' else None)
