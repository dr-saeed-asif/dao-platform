"""Safe answer extraction and bounded chat retry policy."""

import re

CHAT_TOKEN_BUDGETS = (1536, 3072)
ABSTENTION = "The available evidence does not establish that."


class OllamaGenerationError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


def visible_answer(payload: dict) -> str:
    message = _message(payload)
    cleaned = _visible_content(message)
    _validate_complete(cleaned, message, payload)
    return _remove_footer(cleaned)


def _message(payload: dict) -> dict:
    message = payload.get("message")
    if isinstance(message, dict): return message
    raise OllamaGenerationError("Ollama response has no assistant message.")

def _visible_content(message: dict) -> str:
    content = message.get("content")
    if not isinstance(content, str):
        raise OllamaGenerationError("Ollama assistant content is missing or invalid.")
    return re.sub(r"<think>.*?</think>", "", content, flags=re.S | re.I).strip()


def _validate_complete(cleaned: str, message: dict, payload: dict) -> None:
    reason, tokens = payload.get("done_reason"), payload.get("eval_count")
    if re.search(r"</?think>", cleaned, flags=re.I):
        raise OllamaGenerationError("Ollama returned unseparated/incomplete model thinking.",
                                    retryable=(reason == "length"))
    if not cleaned:
        raise OllamaGenerationError(f"Ollama returned no visible answer (done_reason={reason!r}, "
            f"output_tokens={tokens!r}, thinking_present={bool(message.get('thinking'))}).",
            retryable=(reason == "length"))
    if reason == "length":
        raise OllamaGenerationError(f"Ollama reached the generation limit (output_tokens={tokens!r}); "
                                    "refusing to return a potentially incomplete answer.", retryable=True)

def _remove_footer(answer: str) -> str:
    suffix = "\n\n" + ABSTENTION
    cited = answer.endswith(suffix) and re.search(r"\[(?:D|G)\d+\]", answer[:-len(suffix)])
    return answer[:-len(suffix)].strip() if cited else answer
