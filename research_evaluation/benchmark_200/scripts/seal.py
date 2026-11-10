"""Seal new benchmark artifacts without modifying the earlier evaluation."""
import hashlib,json
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
target=ROOT/'provenance.json'
files={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()
       for p in sorted(ROOT.rglob('*')) if p.is_file() and p!=target and '__pycache__' not in p.parts}
target.write_text(json.dumps({'sealed_utc':datetime.now(timezone.utc).isoformat(),'algorithm':'SHA-256',
    'scope':'Exact file bytes; integrity only, not independent scientific attestation','files':files},indent=2),encoding='utf8')
print('Sealed',len(files),'benchmark artifacts.')
