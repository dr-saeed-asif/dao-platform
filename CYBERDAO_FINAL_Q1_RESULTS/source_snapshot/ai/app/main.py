"""Compatibility entrypoint for existing ASGI commands."""

from app.presentation.main import app, create_app
from app.business.health import check_ollama
from app.model.database.pool import check_postgres

__all__ = ["app", "create_app", "check_ollama", "check_postgres"]
