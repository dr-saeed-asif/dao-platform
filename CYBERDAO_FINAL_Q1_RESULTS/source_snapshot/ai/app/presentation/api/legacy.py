"""Authenticated frontend-compatible AI router."""

from fastapi import APIRouter, Depends

from app.presentation.dependencies.auth import require_local_token
from .compatibility import legacy_query

router = APIRouter(prefix="/v1/ai", tags=["Operator AI compatibility"],
                   dependencies=[Depends(require_local_token)])
router.add_api_route("/query", legacy_query, methods=["POST"])
