"""Translate service failures to the established HTTP error contract."""

import httpx
import logging
import traceback
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.business.rag.compatibility import UnsupportedAiRequest
from app.business.rag.ollama_answers import OllamaGenerationError

logger = logging.getLogger(__name__)


def user_error(exc: Exception) -> HTTPException:
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    if isinstance(exc, UnsupportedAiRequest):
        return HTTPException(status_code=501, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, OllamaGenerationError):
        return HTTPException(status_code=502, detail="Incomplete Ollama answer; inspect server logs.")
    if isinstance(exc, httpx.HTTPError):
        return HTTPException(status_code=502, detail="Ollama request failed.")
    # Log full traceback for unexpected errors
    logger.error("Unexpected AI error: %s", exc, exc_info=True)
    return HTTPException(status_code=500, detail="Unexpected AI error; inspect server logs.")


async def handle_service_error(request: Request, exc: Exception) -> JSONResponse:
    error = user_error(exc)
    return JSONResponse({"detail": error.detail}, status_code=error.status_code)


def exception_handlers():
    return {
        ValueError: handle_service_error,
        OllamaGenerationError: handle_service_error,
        httpx.HTTPError: handle_service_error,
        UnsupportedAiRequest: handle_service_error,
        Exception: handle_service_error,
    }
