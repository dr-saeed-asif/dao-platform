"""Read-only blockchain agent. URL and credentials never become tool arguments."""
import asyncio
from urllib.parse import quote
import httpx
from app.model.config.settings import settings

class BlockchainVerificationAgent:
    name = 'BlockchainVerificationAgent'

    def __init__(self, context):
        self.context = context
        self._snapshots = {}
        self._lock = asyncio.Lock()

    async def snapshot(self, dao_id: str, proposal_id: str) -> dict:
        if not self.context.operator_verified:
            raise PermissionError('Operator authorization required for blockchain verification.')
        if not dao_id or not proposal_id or len(dao_id) > 120 or len(proposal_id) > 120:
            raise ValueError('Valid DAO and proposal scope required.')
        key = (dao_id, proposal_id)
        async with self._lock:
            if key not in self._snapshots:
                token = settings.dao_backend_token.get_secret_value() if settings.dao_backend_token else settings.rag_dev_token.get_secret_value()
                url = settings.dao_backend_url.rstrip('/') + '/v1/ai/internal/proposals/' + quote(proposal_id, safe='') + '/verification'
                async with httpx.AsyncClient(timeout=90, trust_env=False) as client:
                    response = await client.get(url, params={'dao_id': dao_id}, headers={'Authorization': 'Bearer ' + token})
                if response.status_code != 200:
                    raise RuntimeError(f'Blockchain backend access failed (HTTP {response.status_code}).')
                result = response.json()
                if result.get('dao_id') != dao_id or result.get('proposal_id') != proposal_id:
                    raise RuntimeError('Blockchain backend returned a different proposal scope.')
                self._snapshots[key] = result
            return self._snapshots[key]
