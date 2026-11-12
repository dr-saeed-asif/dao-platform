"""Durable measured metrics using the existing agent/evaluation tables."""
import json
from uuid import UUID, uuid5
from app.business.evaluation.tracing import run_metrics

async def evaluation_row(conn, run_id, system, dao_id, proposal_id, metrics, results,
                         status, *, parent_id=None, question_id=None, experiment_id=None,
                         configuration=None):
    traces = [span for result in results for span in result.get('execution',{}).get('trace',[])]
    sources = sorted({source for r in results for source in r.get('citations',[])})
    models = metrics.get('models',[])
    await conn.execute('''INSERT INTO ai.evaluation_runs
        (run_id, system_type, system_version, selected_model, dao_id, proposal_id,
         retrieval_ms, generation_ms, total_ms, input_tokens, output_tokens, embedding_tokens,
         tool_calls, source_ids, citation_count, completion_status, execution_metrics,
         execution_trace, question_results, parent_run_id, question_id, experiment_id, configuration)
        VALUES (%s,%s,'2',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (run_id) DO UPDATE SET execution_metrics=EXCLUDED.execution_metrics,
          execution_trace=EXCLUDED.execution_trace, question_results=EXCLUDED.question_results,
          completion_status=EXCLUDED.completion_status''',
        (str(run_id), system, ', '.join(models) if models else 'none', dao_id, proposal_id,
         metrics.get('retrieval_ms',0), metrics.get('llm_ms',0), metrics.get('total_ms',0),
         metrics.get('input_tokens'), metrics.get('output_tokens'), metrics.get('embedding_tokens'),
         metrics.get('tool_calls',0), sources, len(sources),
         'completed' if status=='completed' else 'failed', json.dumps(metrics), json.dumps(traces),
         json.dumps(results), str(parent_id) if parent_id else None, question_id,
         str(experiment_id) if experiment_id else None, json.dumps(configuration or {})))

async def persist_agent_metrics(conn, run_id, status, results, total_ms):
    metrics = run_metrics(results, total_ms)
    traces = [span for r in results for span in r.get('execution',{}).get('trace',[])]
    await conn.execute('UPDATE ai.agent_runs SET execution_metrics=%s, execution_trace=%s WHERE id=%s',
                       (json.dumps(metrics), json.dumps(traces), str(run_id)))
    async with conn.cursor() as cur:
        await cur.execute('''SELECT c.dao_id, c.proposal_id FROM ai.agent_runs r
            JOIN ai.conversations c ON c.id=r.conversation_id WHERE r.id=%s''', (str(run_id),))
        scope = await cur.fetchone()
    if scope:
        await evaluation_row(conn, run_id, 'multi_agent_rag_blockchain', scope[0], scope[1], metrics, results, status)
        for r in results:
            e = r.get('execution',{})
            await evaluation_row(conn, uuid5(UUID(str(run_id)), r['question_id']), 'agent_question', scope[0], scope[1],
                {**e, 'total_ms':r.get('total_ms',0)}, [r], r['status'],
                parent_id=run_id, question_id=r['question_id'])

async def executions(pool, owner, dao_id, proposal_id, run_id=None, limit=100):
    query = '''SELECT r.id, r.status, r.started_at, r.completed_at, r.execution_metrics,
                      r.execution_trace, r.results, c.dao_id, c.proposal_id, c.id
        FROM ai.agent_runs r JOIN ai.conversations c ON c.id=r.conversation_id
        WHERE c.owner_id=%s AND c.dao_id=%s AND c.proposal_id=%s
        AND (%s::uuid IS NULL OR r.id=%s::uuid) ORDER BY r.started_at DESC LIMIT %s'''
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (owner, dao_id, proposal_id, str(run_id) if run_id else None, str(run_id) if run_id else None, limit))
            rows = await cur.fetchall()
    return [dict(run_id=str(row[0]), status=row[1], started_at=row[2].isoformat(),
                 completed_at=row[3].isoformat() if row[3] else None,
                 metrics=row[4], trace=row[5], results=row[6], dao_id=row[7],
                 proposal_id=row[8], conversation_id=str(row[9])) for row in rows]
