"""Health route."""

from fastapi import APIRouter, Depends

from app.presentation.dependencies.health import get_health_status

router = APIRouter()


@router.get("/health")
async def health(result: dict = Depends(get_health_status)):
    return result
