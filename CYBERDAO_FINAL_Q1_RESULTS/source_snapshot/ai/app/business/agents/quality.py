"""Small deterministic helpers shared by future agent adapters."""

import re

from app.business.rag.ollama_answers import ABSTENTION


def split_questions(text: str) -> list[str]:
    questions = [part.strip() for part in re.split(r"(?<=\?)\s+|[\r\n]+", text)
                 if part.strip()]
    return questions or ([text.strip()] if text.strip() else [])


def verify_citations(answer: str, evidence: list[dict]) -> dict:
    cited = set(re.findall(r"\[((?:D|G)\d+)\]", answer))
    # A valid reference must not hide another malformed or unsupported marker.
    # Ignore ordinary bracketed prose/numbers, but validate citation-like tokens.
    malformed = {token for token in re.findall(r"\[([^\]\n]*)\]", answer)
                 if re.search(r"\b[A-Za-z]\s*\d+\b", token)
                 and not re.fullmatch(r"[DG]\d+", token)}
    available = {item["source_id"] for item in evidence if item.get("source_id")}
    is_abstention = answer.strip() == ABSTENTION
    return {
        "valid": not malformed and (is_abstention or (bool(cited) and cited <= available)),
        "cited": sorted(cited),
        "unknown": sorted(cited - available),
        "malformed": sorted(malformed),
    }
