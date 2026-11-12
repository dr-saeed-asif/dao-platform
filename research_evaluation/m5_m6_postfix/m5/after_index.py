import asyncio
import json
import selectors
import subprocess
from pathlib import Path
from urllib.parse import quote
from index_cases import OUT
from psycopg_pool import AsyncConnectionPool
from app.business.governance.document_chunk import proposal_document_chunk

async def main():
    docker=lambda *args:subprocess.check_output(["docker",*args],text=True).strip()
    name="cyberdao-recovery-m4-01"
    port=docker("port",name,"5432/tcp").split(":")[-1]
    password=docker("exec",name,"printenv","POSTGRES_PASSWORD")
    url=f"postgres://postgres:{quote(password,safe='')}@127.0.0.1:{port}/m5_document_integrity_postfix"
    rows=[json.loads(x) for x in (OUT/"python-raw.jsonl").read_text().splitlines()]
    stale=next(x for x in rows if x["id"]=="stale-chunks")
    async with AsyncConnectionPool(url,open=False) as pool:
        await pool.open()
        async with pool.connection() as conn:
            cur=await conn.execute("""SELECT c.chunk_key FROM ai.indexed_chunks c
                JOIN ai.document_indexes i ON i.id=c.document_index_id
                JOIN ai.documents d ON d.id=i.document_id WHERE d.sha256=%s""",
                (stale["original_hash"].removeprefix("0x"),))
            chunks=await cur.fetchall()
        try:
            await proposal_document_chunk(pool,"m5-dao",stale["proposal_id"],stale["document_identifier"],(chunks[0][0] if chunks else "previous-chunk-deleted"))
            blocked=False
            reason=None
        except Exception as e:
            blocked=True
            reason=type(e).__name__
        (OUT/"cleanup-result.json").write_text(json.dumps({
            "before_status_invalidation_stale_chunk_retrievable":stale["stale_chunks_retrievable"],
            "after_status_invalidation_proposal_read_blocked":blocked,
            "exception":reason,"physical_stale_chunks_remaining":len(chunks),
            "deletion_observed":len(chunks)==0,
        },indent=2))
        print("Stale retrieval blocked after status invalidation:",blocked,"chunks remaining",len(chunks))

if __name__=="__main__":
    asyncio.run(main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
