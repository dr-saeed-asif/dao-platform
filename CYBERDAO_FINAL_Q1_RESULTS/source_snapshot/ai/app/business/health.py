"""Health-check orchestration."""

from datetime import datetime, timezone

from app.model.database.pool import check_postgres
from app.model.ollama_health import check_ollama


async def health_status(pool) -> dict:
    postgres_ok = await check_postgres(pool)
    ollama = await check_ollama()
    return {
        "status": "ok" if postgres_ok and ollama["status"] == "healthy" else "degraded",
        "postgres": "ok" if postgres_ok else "error",
        "ollama": ollama,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
