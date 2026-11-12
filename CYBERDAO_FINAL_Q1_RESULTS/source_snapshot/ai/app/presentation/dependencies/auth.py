"""Operator-token authentication dependency."""

import secrets

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.model.config.settings import settings

bearer = HTTPBearer(auto_error=False)


def require_local_token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    expected = settings.rag_dev_token.get_secret_value()
    if not credentials or not secrets.compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=401, detail="Local development token required.")
