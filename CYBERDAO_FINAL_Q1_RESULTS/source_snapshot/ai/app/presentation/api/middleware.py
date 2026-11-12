"""Request ID, duration headers, and request logging."""

import logging
from time import perf_counter
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse

from .errors import user_error

logger = logging.getLogger("api-ai-server")


async def measure_request(request: Request, call_next):
    request_id = str(uuid4())
    request.state.request_id = request_id
    started = perf_counter()
    status_code = 500
    try:
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as exc:
            error = user_error(exc)
            status_code = error.status_code
            response = JSONResponse({"detail": error.detail}, status_code=status_code)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Server-Duration-Ms"] = f"{(perf_counter() - started) * 1000:.2f}"
        return response
    finally:
        logger.info("request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
                    request_id, request.method, request.url.path, status_code,
                    (perf_counter() - started) * 1000)
