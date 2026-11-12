"""Run actual PDF parsing, SQL indexing and proposal chunk reads with synthetic vectors."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import selectors
from time import perf_counter
from unittest.mock import AsyncMock, patch

AI = Path(r"E:/DAO/cyber-chain-work/api-ai-server1/api-ai-server")
OUT = Path(__file__).resolve().parent
os.environ["RAG_DEV_TOKEN"] = "isolated-m5-fixture-token-00000000"
sys.path.insert(0,str(AI))
from psycopg_pool import AsyncConnectionPool
from app.business.rag.indexing import index_document
from app.business.governance.document_sync import sync_record
from app.business.governance.document_chunk import proposal_document_chunk
from app.business.rag.uploads import index_upload


class FixtureVectors:
    async def digest(self):
        return "m5-fixture-embedding"
    async def embed(self, texts):
        return [[1.0] + [0.0]*1023 for _ in texts], 0.0, 0


async def main():
    docker=lambda *args:subprocess.check_output(["docker",*args],text=True).strip()
    name="cyberdao-recovery-m4-01"
    password=docker("exec",name,"printenv","POSTGRES_PASSWORD")
    port=docker("port",name,"5432/tcp").split(":")[-1]
    from urllib.parse import quote
    url=f"postgresql://postgres:{quote(password,safe='')}@127.0.0.1:{port}/m5_document_integrity"
    async with AsyncConnectionPool(url,open=False) as pool:
        await pool.open()
        for migration in ("001_ai_vector_storage.sql","002_fix_chunk_uniqueness.sql"):
            async with pool.connection() as conn:
                await conn.execute((AI/"migrations"/migration).read_text())
        snapshot=json.loads((OUT/"sql-fixture.local.json").read_text())
        artifacts={a["evidence_id"]:a for a in snapshot["artefacts"]}
        raw=[json.loads(line) for line in (OUT/"nest-raw.jsonl").read_text().splitlines()]
        ollama=FixtureVectors()
        async def indexer(path):
            return await index_document(pool,ollama,path)
        data=[]
        with patch("app.business.governance.proposal_scope.Ollama.digest",new=AsyncMock(return_value="m5-fixture-embedding")):
            for row in raw:
                started=perf_counter()
                record=dict(row)
                record["embedding_mode"]="synthetic deterministic vectors, real PDF parser and SQL writer"
                record["indexing_occurred"]=False
                record["stale_chunks_retrievable"]=None
                record["index_error"]=None
                if row["actual_admission"]=="accept":
                    artifact=artifacts[row["document_identifier"]]
                    try:
                        result=await sync_record(indexer,OUT/"storage",artifact)
                        record["indexing_occurred"]=True
                        record["index_status"]=result["status"]
                        async with pool.connection() as conn:
                            cur=await conn.execute("""SELECT c.chunk_key FROM ai.indexed_chunks c
                                JOIN ai.document_indexes i ON i.id=c.document_index_id
                                JOIN ai.documents d ON d.id=i.document_id WHERE d.sha256=%s ORDER BY c.id LIMIT 1""",
                                (artifact["computed_hash"].removeprefix("0x"),))
                            chunk=(await cur.fetchone())[0]
                        if row["id"]=="stale-chunks":
                            path=OUT/"storage"/artifact["storage_key"]
                            path.write_bytes((OUT/"fixtures/other.pdf").read_bytes())
                            record["observed_hash_after_replacement"]="0x"+hashlib.sha256(path.read_bytes()).hexdigest()
                            try:
                                await sync_record(indexer,OUT/"storage",artifact)
                                record["reindex_tamper_rejected"]=False
                            except ValueError:
                                record["reindex_tamper_rejected"]=True
                            got=await proposal_document_chunk(pool,"m5-dao",row["proposal_id"],artifact["evidence_id"],chunk)
                            record["stale_chunks_retrievable"]=bool(got["content"])
                            record["cleanup_succeeded"]=False
                        if row["id"]=="reupload":
                            again=await sync_record(indexer,OUT/"storage",artifact)
                            record["reupload_index_status"]=again["status"]
                        if row["id"]=="duplicate":
                            again=await sync_record(indexer,OUT/"storage",artifact)
                            record["duplicate_index_status"]=again["status"]
                    except Exception as exc:
                        record["index_error"]=str(exc)
                        record["index_error_type"]=type(exc).__name__
                data.append(record)
                with (OUT/"python-raw.jsonl").open("a",encoding="utf-8") as f:f.write(json.dumps(record)+"\n")
            # Alternate authenticated upload component has no proposal-link check.
            work=OUT/"upload-work"
            work.mkdir()
            os.chdir(work)
            class Store:
                async def index(self,path):
                    return await indexer(path)
            result=await index_upload((OUT/"fixtures/other.pdf").read_bytes(),Store())
            (OUT/"alternate-upload.json").write_text(json.dumps({
                "component":"index_upload","input":"Unlinked synthetic other.pdf","outcome":result,
                "scope":"Actual use-case invocation with real SQL and synthetic vectors. HTTP authentication was outside this component test.",
                "chain_manifest_required":False,
            },indent=2))
        async with pool.connection() as conn:
            q=await conn.execute("SELECT count(*) FROM ai.indexed_chunks")
            total=(await q.fetchone())[0]
        print("M5 parsing/indexing cases",len(data),"stored chunks",total)


if __name__=="__main__":
    asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
