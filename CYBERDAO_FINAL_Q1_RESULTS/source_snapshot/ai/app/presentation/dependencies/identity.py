"""Verify one-use, request-bound wallet delegations issued by the DAO API."""

import base64
import hashlib
import json
import re
import time
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from fastapi import Depends, HTTPException, Request
from psycopg import Error as DatabaseError

from app.model.config.settings import settings
from .services import get_database_pool


@dataclass(frozen=True)
class WalletIdentity:
    owner: str
    dao_id: str
    proposal_id: str

    def require_scope(self, dao_id: str, proposal_id: str | None) -> None:
        if (dao_id, proposal_id) != (self.dao_id, self.proposal_id):
            raise HTTPException(403, 'Request exceeds authorized proposal scope.')


async def consume_nonce(pool, nonce: str, expires: int) -> bool:
    try:
        async with pool.connection(timeout=5) as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("DELETE FROM ai.identity_nonces WHERE expires_at < now() - interval '5 minutes'")
                await cursor.execute('''INSERT INTO ai.identity_nonces (nonce, expires_at)
                    VALUES (%s, to_timestamp(%s)) ON CONFLICT DO NOTHING RETURNING nonce''', (nonce, expires))
                return await cursor.fetchone() is not None
    except (DatabaseError, TimeoutError) as exc:
        raise HTTPException(503, 'Wallet identity verification unavailable.') from exc


def identity_key() -> Ed25519PublicKey:
    key = settings.dao_identity_verify_key or ''
    if not re.fullmatch(r'[0-9a-fA-F]{64}', key):
        raise HTTPException(503, 'Wallet identity verification unavailable.')
    return Ed25519PublicKey.from_public_bytes(bytes.fromhex(key))


async def require_wallet_identity(request: Request, pool=Depends(get_database_pool),
                                  key: Ed25519PublicKey = Depends(identity_key)) -> WalletIdentity:
    values = request.headers.getlist('x-dao-identity')
    invalid = HTTPException(401, 'A valid DAO wallet assertion is required.')
    if len(values) != 1 or not re.fullmatch(r'[A-Za-z0-9_-]{1,4096}\.[0-9a-f]{128}', values[0]):
        raise invalid
    payload, signature = values[0].split('.')
    try:
        key.verify(bytes.fromhex(signature), b'cyberdao-ai-identity-v1.' + payload.encode())
    except InvalidSignature as exc:
        raise invalid from exc
    try:
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        owner, dao_id, proposal_id = (claims[k] for k in ('sub', 'dao', 'proposal'))
        nonce, issued, expires = (claims[k] for k in ('jti', 'iat', 'exp'))
        now = int(time.time())
        if (claims['aud'] != 'cyberdao-ai' or not re.fullmatch(r'0x[0-9a-f]{40}', owner)
                or not all(isinstance(v, str) and 1 <= len(v) <= 120 for v in (dao_id, proposal_id))
                or not re.fullmatch(r'[0-9a-f]{32}', nonce) or type(issued) is not int or type(expires) is not int
                or not 0 < expires - issued <= 30 or issued > now + 5 or expires <= now):
            raise ValueError('invalid claims')
    except (ValueError, TypeError, KeyError) as exc:
        raise invalid from exc
    target = request.scope.get('raw_path', b'')
    query = request.scope['query_string']
    if query:
        target += b'?' + query
    if (claims.get('method') != request.method or claims.get('target') != target.decode('ascii', errors='replace')
            or claims.get('body') != hashlib.sha256(await request.body()).hexdigest()):
        raise invalid
    if not await consume_nonce(pool, nonce, expires):
        raise invalid
    return WalletIdentity(owner, dao_id, proposal_id)
