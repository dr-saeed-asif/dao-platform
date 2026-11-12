"""Bounded Ollama chat requests with safe retry handling."""

from time import perf_counter
from app.business.evaluation.tracing import LLM_OBSERVER, utc_now

import httpx

from app.model.config.settings import settings
from .ollama_answers import CHAT_TOKEN_BUDGETS, OllamaGenerationError, visible_answer
from .ollama_prompt import SYSTEM_PROMPT


async def chat_completion(client, question: str, evidence: str,
                          model: str | None = None, system_prompt: str = SYSTEM_PROMPT) -> tuple[str, float, dict]:
    user = f"EVIDENCE:\n{evidence}\n\nQUESTION:\n{question}\n\n/no_think"
    started = perf_counter()
    async with httpx.AsyncClient(timeout=client.timeout, trust_env=False) as http:
        for attempt, budget in enumerate(CHAT_TOKEN_BUDGETS, 1):
            attempt_started, timestamp = perf_counter(), utc_now()
            payload = {}
            error = None
            retry = False
            try:
                response = await http.post(f"{client.base}/api/chat", json=_payload(user, budget, model, system_prompt))
                response.raise_for_status()
                payload = response.json()
                answer = visible_answer(payload)
            except OllamaGenerationError as exc:
                error = type(exc).__name__
                if not exc.retryable or attempt == len(CHAT_TOKEN_BUDGETS):
                    raise OllamaGenerationError(f"{exc} Generation attempts: {attempt}; last token budget: {budget}.") from exc
                retry = True
            except BaseException as exc:
                error = type(exc).__name__
                raise
            finally:
                observer = LLM_OBSERVER.get()
                if observer:
                    observer(dict(name='ollama.chat', model=payload.get('model') or model or settings.ollama_chat_model,
                        attempt=attempt, started_at=timestamp, completed_at=utc_now(),
                        latency_ms=(perf_counter()-attempt_started)*1000,
                        input_tokens=payload.get('prompt_eval_count'), output_tokens=payload.get('eval_count'),
                        status='failed' if error else 'completed', error_type=error))
            if retry:
                continue
            tokens = {"input_tokens": payload.get("prompt_eval_count"),
                      "output_tokens": payload.get("eval_count"), "generation_attempts": attempt}
            return answer, round((perf_counter() - started) * 1000, 1), tokens
    raise OllamaGenerationError("Ollama did not return an answer.")


def _payload(user: str, budget: int, model: str | None = None, system_prompt: str = SYSTEM_PROMPT) -> dict:
    return {"model": model or settings.ollama_chat_model, "stream": False, "think": False,
        "messages": [{"role": "system", "content": system_prompt},
                     {"role": "user", "content": user}],
        "options": {"temperature": 0.6, "top_p": 0.8, "top_k": 20,
            "repeat_penalty": 1.1, "seed": 42, "num_predict": budget, "num_ctx": 8192}}
