"""PostgreSQL pool creation and connectivity probe."""

import psycopg
from psycopg_pool import AsyncConnectionPool, PoolTimeout
from .runtime_security import verify_runtime_role


def create_pool(database_url: str, *, enforce_runtime_role: bool = False) -> AsyncConnectionPool:
    return AsyncConnectionPool(conninfo=database_url, min_size=1, max_size=4,
                               timeout=3, open=False,
                               configure=verify_runtime_role if enforce_runtime_role else None)


async def check_postgres(pool: AsyncConnectionPool) -> bool:
    try:
        async with pool.connection(timeout=3) as conn:
            await conn.execute("SELECT 1")
        return True
    except (psycopg.Error, PoolTimeout):
        return False
