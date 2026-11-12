import asyncio
import json
import selectors
from index_cases import OUT, FixtureVectors
from after_index import subprocess, quote
from psycopg_pool import AsyncConnectionPool
from app.business.rag.store import RagStore
from app.model.database.index_invalidation import invalidate_document_indexes

async def main():
    docker=lambda *args:subprocess.check_output(["docker",*args],text=True).strip()
    name="cyberdao-recovery-m4-01"
    port=docker("port",name,"5432/tcp").split(":")[-1]
    password=docker("exec",name,"printenv","POSTGRES_PASSWORD")
    url=f"postgres://postgres:{quote(password,safe='')}@127.0.0.1:{port}/m5_document_integrity_postfix"
    raw=[json.loads(x) for x in (OUT/"python-raw.jsonl").read_text().splitlines()]
    valid=next(x for x in raw if x["id"]=="valid")
    stale=next(x for x in raw if x["id"]=="stale-chunks")
    async with AsyncConnectionPool(url,open=False) as pool:
        await pool.open()
        store=RagStore(pool,FixtureVectors())
        good=await store.ready_index(valid["original_hash"])
        try:
            await store.ready_index(stale["original_hash"])
            blocked=False
        except ValueError:
            blocked=True
        again=await invalidate_document_indexes(pool,stale["original_hash"],"Repeated fixture invalidation")
        async with pool.connection() as conn:
            c=await conn.execute("""SELECT i.status, (SELECT count(*) FROM ai.indexed_chunks c WHERE c.document_index_id=i.id)
                FROM ai.document_indexes i JOIN ai.documents d ON d.id=i.document_id WHERE d.sha256=%s""",
                (stale["original_hash"].removeprefix("0x"),))
            audit=await c.fetchall()
        result={"legitimate_standalone_lookup_succeeded":bool(good),"revoked_standalone_lookup_blocked":blocked,
                "idempotent_cleanup_second_delete_count":again,"retained_index_audit_rows":audit}
        assert good and blocked and again==0 and audit==[("FAILED",0)]
        (OUT/"supplemental-checks.json").write_text(json.dumps(result,indent=2))
        print("Standalone and idempotent cleanup checks passed")
if __name__=="__main__":
    asyncio.run(main(),loop_factory=lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
