"""Persistence and read operations for conversations and agent runs."""

import json
from datetime import datetime
from uuid import UUID

from .agent_observability import persist_agent_metrics
from app.model.entities.conversation import AgentQuestionResult, AgentRun, Conversation, Message


async def create_conversation(pool, dao_id: str, proposal_id: str | None,
                              title: str | None = None, owner_id: str = "operator") -> Conversation:
    query = """INSERT INTO ai.conversations (dao_id, proposal_id, title, owner_id)
               VALUES (%s, %s, %s, %s) RETURNING id, dao_id, proposal_id, title, created_at, updated_at"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (dao_id, proposal_id, title, owner_id))
            row = await cur.fetchone()
    return _row_to_conversation(row)


async def get_conversation(pool, conversation_id: UUID, owner_id: str = "operator") -> Conversation | None:
    query = """SELECT id, dao_id, proposal_id, title, created_at, updated_at
               FROM ai.conversations WHERE id = %s AND owner_id = %s"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (str(conversation_id), owner_id))
            row = await cur.fetchone()
    return _row_to_conversation(row) if row else None


async def delete_conversation(pool, conversation_id: UUID, owner_id: str = "operator") -> bool:
    """Permanently delete an owner's conversation and its cascaded history."""
    query = """DELETE FROM ai.conversations WHERE id = %s AND owner_id = %s RETURNING id"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (str(conversation_id), owner_id))
            return await cur.fetchone() is not None


async def delete_conversations(pool, dao_id: str, proposal_id: str, owner_id: str = "operator") -> int:
    """Permanently delete all conversations and history in one proposal scope."""
    query = """DELETE FROM ai.conversations
               WHERE dao_id = %s AND proposal_id = %s AND owner_id = %s
               RETURNING id"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (dao_id, proposal_id, owner_id))
            return len(await cur.fetchall())


async def list_conversations(pool, dao_id: str, limit: int = 20, owner_id: str = "operator", proposal_id: str | None = None) -> list[Conversation]:
    query = """SELECT id, dao_id, proposal_id, title, created_at, updated_at
               FROM ai.conversations WHERE dao_id = %s AND owner_id = %s AND (%s::text IS NULL OR proposal_id = %s) ORDER BY updated_at DESC LIMIT %s"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (dao_id, owner_id, proposal_id, proposal_id, min(max(limit, 1), 100)))
            rows = await cur.fetchall()
    return [_row_to_conversation(row) for row in rows]


async def update_conversation_timestamp(pool, conversation_id: UUID) -> None:
    query = """UPDATE ai.conversations SET updated_at = NOW() WHERE id = %s"""
    async with pool.connection(timeout=5) as conn:
        await conn.execute(query, (str(conversation_id),))


async def create_message(pool, conversation_id: UUID, role: str, content: str,
                         question_ids: list[str] | None = None,
                         metadata: dict | None = None) -> Message:
    query = """INSERT INTO ai.messages (conversation_id, role, content, question_ids, metadata)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING id, conversation_id, role, content, question_ids, metadata, created_at"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (
                str(conversation_id), role, content,
                question_ids or [], json.dumps(metadata or {})
            ))
            row = await cur.fetchone()
    return _row_to_message(row)


async def get_messages(pool, conversation_id: UUID, limit: int = 50) -> list[Message]:
    query = """SELECT id, conversation_id, role, content, question_ids, metadata, created_at
               FROM (SELECT * FROM ai.messages WHERE conversation_id = %s ORDER BY created_at DESC LIMIT %s) recent ORDER BY created_at ASC"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (str(conversation_id), limit))
            rows = await cur.fetchall()
    return [_row_to_message(row) for row in rows]


async def create_agent_run(pool, conversation_id: UUID, message_id: UUID,
                           questions: list[dict]) -> AgentRun:
    query = """INSERT INTO ai.agent_runs (conversation_id, message_id, status, questions)
               VALUES (%s, %s, 'running', %s)
               RETURNING id, conversation_id, message_id, status, questions, results,
                         total_ms, tool_calls, error, started_at, completed_at"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (str(conversation_id), str(message_id), json.dumps(questions)))
            row = await cur.fetchone()
    return _row_to_agent_run(row)


async def complete_agent_run(pool, run_id: UUID, status: str, results: list[dict],
                             total_ms: float, tool_calls: int, error: str | None = None) -> AgentRun:
    query = """UPDATE ai.agent_runs
               SET status = %s, results = %s, total_ms = %s, tool_calls = %s,
                   error = %s, completed_at = NOW()
               WHERE id = %s
               RETURNING id, conversation_id, message_id, status, questions, results,
                         total_ms, tool_calls, error, started_at, completed_at"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (status, json.dumps(results), total_ms, tool_calls, error, str(run_id)))
            row = await cur.fetchone()
        await persist_agent_metrics(conn, run_id, status, results, total_ms)
    return _row_to_agent_run(row)


async def create_question_results(pool, run_id: UUID, results: list[dict]) -> list[AgentQuestionResult]:
    if not results:
        return []
    query = """INSERT INTO ai.agent_question_results
        (agent_run_id, question_id, question, agent, status, answer, citations,
         evidence, errors, attempts, tool_calls, model_used,
         retrieval_ms, generation_ms, total_ms, input_tokens, output_tokens, embedding_tokens)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, agent_run_id, question_id, question, agent, status, answer,
                  citations, evidence, errors, attempts, tool_calls, model_used,
                  retrieval_ms, generation_ms, total_ms, input_tokens, output_tokens, embedding_tokens, created_at"""
    created = []
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            for r in results:
                await cur.execute(query, (
                    str(run_id),
                    r["question_id"],
                    r["question"],
                    r["agent"],
                    r["status"],
                    r.get("answer"),
                    r.get("citations", []),
                    json.dumps(r.get("cited_sources", [])),
                    r.get("errors", []),
                    r.get("attempts", 0),
                    r.get("tool_calls", 0),
                    r.get("model_used"),
                    r.get("retrieval_ms", 0),
                    r.get("generation_ms", 0),
                    r.get("total_ms", 0),
                    r.get("input_tokens"),
                    r.get("output_tokens"),
                    r.get("embedding_tokens"),
                ))
                row = await cur.fetchone()
                created.append(_row_to_question_result(row))
                await cur.execute('UPDATE ai.agent_question_results SET execution=%s, blockchain_verification=%s WHERE id=%s',
                    (json.dumps(r.get('execution',{})), json.dumps(r.get('blockchain_verification')) if r.get('blockchain_verification') else None, str(row[0])))
    return created


async def get_agent_run(pool, run_id: UUID) -> AgentRun | None:
    query = """SELECT id, conversation_id, message_id, status, questions, results,
                      total_ms, tool_calls, error, started_at, completed_at
               FROM ai.agent_runs WHERE id = %s"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (str(run_id),))
            row = await cur.fetchone()
    return _row_to_agent_run(row) if row else None


async def get_question_results(pool, run_id: UUID) -> list[AgentQuestionResult]:
    query = """SELECT id, agent_run_id, question_id, question, agent, status, answer,
                      citations, evidence, errors, attempts, tool_calls, model_used,
                      retrieval_ms, generation_ms, total_ms, input_tokens, output_tokens, embedding_tokens, created_at
               FROM ai.agent_question_results WHERE agent_run_id = %s ORDER BY created_at"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (str(run_id),))
            rows = await cur.fetchall()
    return [_row_to_question_result(row) for row in rows]


def _to_uuid(val):
    if isinstance(val, UUID):
        return val
    if isinstance(val, str):
        return UUID(val)
    if hasattr(val, 'bytes'):  # psycopg UUID type
        return UUID(bytes=val.bytes)
    return UUID(str(val))


def _row_to_conversation(row) -> Conversation:
    return Conversation(
        id=_to_uuid(row[0]), dao_id=row[1], proposal_id=row[2], title=row[3],
        created_at=row[4], updated_at=row[5]
    )


def _row_to_message(row) -> Message:
    return Message(
        id=_to_uuid(row[0]), conversation_id=_to_uuid(row[1]), role=row[2], content=row[3],
        question_ids=row[4] if isinstance(row[4], list) else [],
        metadata=row[5] if isinstance(row[5], dict) else {},
        created_at=row[6]
    )


def _row_to_agent_run(row) -> AgentRun:
    return AgentRun(
        id=_to_uuid(row[0]), conversation_id=_to_uuid(row[1]),
        message_id=_to_uuid(row[2]) if row[2] else None,
        status=row[3],
        questions=row[4] if isinstance(row[4], list) else [],
        results=row[5] if isinstance(row[5], list) else [],
        total_ms=row[6], tool_calls=row[7], error=row[8],
        started_at=row[9], completed_at=row[10]
    )


def _row_to_question_result(row) -> AgentQuestionResult:
    return AgentQuestionResult(
        id=_to_uuid(row[0]), agent_run_id=_to_uuid(row[1]), question_id=row[2],
        question=row[3], agent=row[4], status=row[5], answer=row[6],
        citations=row[7] if isinstance(row[7], list) else [],
        evidence=row[8] if isinstance(row[8], list) else [],
        errors=row[9] if isinstance(row[9], list) else [],
        attempts=row[10], tool_calls=row[11], model_used=row[12],
        retrieval_ms=row[13], generation_ms=row[14], total_ms=row[15],
        input_tokens=row[16], output_tokens=row[17], embedding_tokens=row[18],
        created_at=row[19]
    )
