"""Small deterministic helpers shared by future agent adapters."""

import re

from app.business.rag.ollama_answers import ABSTENTION


def split_questions(text: str) -> list[str]:
    questions = [part.strip() for part in re.split(r"(?<=\?)\s+|[\r\n]+", text)
                 if part.strip()]
    return questions or ([text.strip()] if text.strip() else [])


def verify_citations(answer: str, evidence: list[dict]) -> dict:
    cited = set(re.findall(r"\[((?:D|G)\d+)\]", answer))
    available = {item["source_id"] for item in evidence if item.get("source_id")}
    is_abstention = answer.strip() == ABSTENTION
    return {
        "valid": is_abstention or (bool(cited) and cited <= available),
        "cited": sorted(cited),
        "unknown": sorted(cited - available),
    }
