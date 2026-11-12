"""Canonical FastAPI application factory."""

import logging

from fastapi import FastAPI

from app.presentation.api.errors import exception_handlers
from app.presentation.api.middleware import measure_request
from app.presentation.api.routes import router
from app.presentation.lifecycle import lifespan

logging.basicConfig(level=logging.INFO)


def create_app() -> FastAPI:
    app = FastAPI(title="CyberDAO AI Server", version="0.1.0",
                  lifespan=lifespan, exception_handlers=exception_handlers())
    app.middleware("http")(measure_request)
    app.include_router(router)
    return app


app = create_app()
