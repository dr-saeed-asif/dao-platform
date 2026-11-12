"""Public route composition for the FastAPI application."""

from fastapi import APIRouter

from . import health, legacy, rag

router = APIRouter()
router.include_router(health.router)
router.include_router(rag.router)
router.include_router(legacy.router)
