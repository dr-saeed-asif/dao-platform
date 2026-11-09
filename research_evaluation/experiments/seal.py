"""Record final artifact SHA-256 values. Run after report and figure generation."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / "audit/provenance.json"
files = {str(p.relative_to(root)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest()
         for p in sorted(root.rglob("*")) if p.is_file() and p != target and "__pycache__" not in p.parts}
target.write_text(json.dumps({"sealed_utc": datetime.now(timezone.utc).isoformat(), "algorithm": "SHA-256",
    "scope": "Final artifact bytes; integrity manifest is not an independent attestation of measurement validity",
    "launch_versions": "Original run manifests retain launch-time script hashes; see REPRODUCE.md for subsequent harness additions",
    "files": files}, indent=2), encoding="utf8")
print(f"Recorded hashes for {len(files)} artifacts.")
