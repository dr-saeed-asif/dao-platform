"""Read stored vote records scoped through their authoritative proposal row."""

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def proposal_vote_facts(pool: AsyncConnectionPool, dao_id: str,
                              proposal_id: str) -> dict:
    query = """SELECT v.option_index, COUNT(v.id) AS vote_count,
        (SELECT COUNT(*) FROM public.proposal_assignments AS a
         WHERE a.proposal_id = p.id AND a.assigned IS TRUE) AS stored_assigned_members
        FROM public.proposals AS p LEFT JOIN public.votes AS v
        ON v.proposal_id = p.id
        WHERE p.id = %s AND p.dao_id = %s
        GROUP BY p.id, v.option_index ORDER BY v.option_index"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor(row_factory=dict_row) as cursor:
            await cursor.execute(query, (proposal_id, dao_id))
            rows = await cursor.fetchall()
    facts = _summarize(rows)
    if rows and rows[0].get("stored_assigned_members") is not None:
        facts["stored_assigned_members"] = rows[0]["stored_assigned_members"]
        facts["assignment_source"] = "public.proposal_assignments; assigned IS TRUE"
    return facts


def _summarize(rows: list[dict]) -> dict:
    choices = [{"option_index": row["option_index"], "vote_count": row["vote_count"]}
        for row in rows if row["option_index"] is not None]
    return {"stored_total_votes": sum(row["vote_count"] for row in rows),
            "stored_votes_by_option_index": choices}
