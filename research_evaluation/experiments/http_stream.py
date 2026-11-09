"""Measure real HTTP/SSE transport on the isolated evaluation port."""
import json
import time
from pathlib import Path
from uuid import uuid4

import httpx
from app.model.config.settings import settings

ROOT = Path(__file__).resolve().parents[1]
scope = {"dao_id": "cyber-dao-321", "proposal_id": "e3b14215-bd47-420a-ae5a-a50d15cf0255"}
question = "What is the exact title of the selected proposal?"


def main():
    headers = {"Authorization": "Bearer " + settings.rag_dev_token.get_secret_value(),
               "X-DAO-User": "research-eval-" + uuid4().hex}
    with httpx.Client(base_url="http://127.0.0.1:8101", headers=headers, timeout=120, trust_env=False) as client, (
        ROOT / "raw_results/http-stream.jsonl"
    ).open("x", encoding="utf8") as file:
        for repeat in range(1, 4):
            cid = client.post("/rag/conversations", json=scope).raise_for_status().json()["id"]
            row = {"repeat": repeat, "case": "DB1", "route": "/rag/agents/ask/stream",
                   "chat_model": "qwen3:0.6b", "first_section_ms": None, "final_event_ms": None}
            start = time.perf_counter()
            elapsed = lambda: (time.perf_counter() - start) * 1000
            try:
                with client.stream("POST", row["route"], json={**scope, "conversation_id": cid, "question": question}) as response:
                    row.update(http_status=response.status_code, headers_ms=elapsed())
                    response.raise_for_status()
                    event = ""
                    for line in response.iter_lines():
                        if line.startswith("event: "):
                            event = line[7:]
                        if event == "answer_section" and line.startswith("data: ") and row["first_section_ms"] is None:
                            row["first_section_ms"] = elapsed()
                        if event == "run_complete" and line.startswith("data: "):
                            data = json.loads(line[6:])
                            final = data.get("final_response") or {}
                            row.update(final_event_ms=elapsed(), status=data.get("status"), answer=final.get("answer"),
                                       citations=final.get("citations"), final_model=final.get("model_used"))
                row["eof_ms"] = elapsed()
                if row["final_event_ms"] is None:
                    row["error"] = "NoTerminalEvent"
            except Exception as exc:
                row.update(error=type(exc).__name__, eof_ms=elapsed())
            finally:
                row["cleanup_status"] = client.delete(f"/rag/conversations/{cid}").status_code
            file.write(json.dumps(row) + "\n")
            file.flush()
            print(json.dumps(row), flush=True)


if __name__ == "__main__":
    main()
