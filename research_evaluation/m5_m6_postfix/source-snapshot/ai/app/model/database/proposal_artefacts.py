"""Read-only DAO artefact-link query; no indexing data is written here."""

from psycopg_pool import AsyncConnectionPool


async def linked_artefacts(pool: AsyncConnectionPool, dao_id: str,
                           proposal_id: str) -> list[dict]:
    if not dao_id or not proposal_id:
        raise ValueError("dao_id and proposal_id are required.")
    query = """SELECT a.id, a.evidence_id, a.filename, a.storage_key,
        a.computed_hash, a.expected_hash, a.hash_algorithm, a.verification_status,
        a.lifecycle_state, a.media_type, a.byte_size
        FROM public.proposals AS p
        JOIN public.proposal_artefacts AS pa ON pa.proposal_id = p.id
        JOIN public.artefacts AS a ON a.evidence_id = pa.evidence_id
        WHERE p.id = %s AND p.dao_id = %s ORDER BY a.id"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (proposal_id, dao_id))
            rows = await cur.fetchall()
    fields = ("artefact_id", "evidence_id", "filename", "storage_key", "computed_hash",
              "expected_hash", "hash_algorithm", "verification_status",
              "lifecycle_state", "media_type", "byte_size")
    return [dict(zip(fields, row, strict=True)) for row in rows]


async def artefacts_for_hash(pool: AsyncConnectionPool, digest: str) -> list[dict]:
    query = """SELECT id, evidence_id, filename, storage_key, computed_hash, expected_hash,
        hash_algorithm, verification_status, lifecycle_state, media_type, byte_size
        FROM public.artefacts WHERE lower(computed_hash)=ANY(%s::text[])"""
    async with pool.connection(timeout=5) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, ([digest, "0x" + digest, "sha256:" + digest],))
            rows = await cur.fetchall()
    fields = ("artefact_id", "evidence_id", "filename", "storage_key", "computed_hash",
              "expected_hash", "hash_algorithm", "verification_status",
              "lifecycle_state", "media_type", "byte_size")
    return [dict(zip(fields, row, strict=True)) for row in rows]
