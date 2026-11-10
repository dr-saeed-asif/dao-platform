"""Inspect availability of row-history mechanisms, with read-only catalog queries."""
import asyncio
import json
import platform
from pathlib import Path
from psycopg_pool import AsyncConnectionPool
from app.model.config.settings import settings

async def main():
    async with AsyncConnectionPool(settings.postgres_url, kwargs={"options":"-c default_transaction_read_only=on","autocommit":True}, open=False) as pool:
        async with pool.connection() as conn:
            tables=await (await conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ~* '(audit|history|migration|checkpoint|sync)' ORDER BY table_name")).fetchall()
            triggers=await (await conn.execute("SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='proposal_assignments' AND NOT t.tgisinternal")).fetchall()
            audit=(await (await conn.execute("SELECT current_setting('pgaudit.log',true)")).fetchone())[0]
    result={"available_relevant_table_names":[x[0] for x in tables],"assignment_custom_triggers":[x[0] for x in triggers],
            "pgaudit_configured":bool(audit),"scope":"Catalog availability only; no reconstructed historical row versions or HTTP request trace", "writes":0}
    with Path(__file__).with_name("database_history_availability.json").open("x",encoding="utf8") as f:json.dump(result,f,indent=2)
    print('Assignment history catalog inspection saved.')

if __name__=='__main__':asyncio.run(main(),loop_factory=asyncio.SelectorEventLoop if platform.system()=='Windows' else asyncio.new_event_loop)
