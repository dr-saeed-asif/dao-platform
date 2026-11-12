"""Select one compatible embedding profile for linked proposal documents."""

from collections import defaultdict

from .evidence import normalized_sha256, verified_pdf_record


def candidate_hashes(artefacts: list[dict]) -> tuple[dict[str, list[dict]], list[dict]]:
    candidates: dict[str, list[dict]] = defaultdict(list)
    excluded = []
    for item in artefacts:
        valid, reason = verified_pdf_record(item)
        if valid:
            candidates[normalized_sha256(item["computed_hash"])].append(item)
        else:
            excluded.append({"evidence_id": item["evidence_id"], "reason": reason})
    return candidates, excluded


def profiles_by_document(rows: list[tuple]) -> dict[str, dict[str, tuple]]:
    profiles: dict[str, dict[str, tuple]] = defaultdict(dict)
    for index_id, profile, digest, filename, completed_at in rows:
        profiles[profile].setdefault(digest, (index_id, profile, digest, filename, completed_at))
    return profiles


def select_profile(profiles: dict[str, dict[str, tuple]], requested: str | None) -> str | None:
    if requested is not None or not profiles:
        return requested
    return max(profiles, key=lambda key: (len(profiles[key]),
        max(str(row[4]) for row in profiles[key].values()), key))
