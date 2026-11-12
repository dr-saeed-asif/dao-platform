"""JSON display helper for local RAG commands."""

import json


def dump(value) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, default=str))
