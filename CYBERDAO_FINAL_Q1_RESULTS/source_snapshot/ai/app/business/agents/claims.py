"""Deterministic verification of scoped numeric claims against cited evidence."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from typing import NamedTuple
from decimal import Decimal, InvalidOperation

CITE = re.compile(r"\[((?:D|G|B)\d+)\]")
NUM = re.compile(r"(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\w])|(?<![\w.])-?\d+(?:\.\d+)?(?![\w])")
MISSING = re.compile(r"\b(missing|not available|unavailable|unknown|not recorded|does not state|not stated|no data|not provided)\b", re.I)
VOTE_WORDS = re.compile(r"\bvotes?\b|\bballots?\b", re.I)
MEMBER_WORDS = re.compile(r"\bmembers?\b|\bassigned\b|\bassignments?\b", re.I)
VOTE_KEYS = {"votecount", "votes_cast", "total_votes", "totalvotes", "vote_count", "recorded_votes"}
MEMBER_KEYS = {"assignedmembercount", "assigned_members", "assigned_member_count", "member_count", "membercount"}
YEAR = re.compile(r"^(?:19|20)\d{2}$")


def _dec(raw: str) -> Decimal | None:
    try:
        return Decimal(raw.replace(",", ""))
    except InvalidOperation:
        return None


def numbers(text: str) -> set[Decimal]:
    return {d for d in (_dec(m) for m in NUM.findall(text or "")) if d is not None}


def claim_numbers(text: str) -> set[Decimal]:
    """Numbers to verify in a claim. A bare 4-digit 19xx/20xx is a year, unless it is an amount
    (comma-grouped or next to a currency marker), so EUR 2,000 / EUR 2000 are still checked."""
    out = set()
    for m in NUM.finditer(text or ""):
        raw = m.group(0)
        value = _dec(raw)
        if value is None:
            continue
        before = text[max(0, m.start() - 4):m.start()].lower()
        after = text[m.end():m.end() + 6].lower()
        is_amount = "," in raw or "eur" in before or "\u20ac" in before or "euro" in after
        if YEAR.match(raw) and not is_amount:
            continue
        out.add(value)
    return out


CLOSED_WORLD = re.compile(
    r"\b(?:no\s+(?:additional|other|further|remaining|more)|"
    r"(?:all|every)\s+(?:\w+\s+){0,5}(?:proposals?|expenses?|categories|records?|items?)\b|"
    r"only\s+\d|no\s+(?:expenses?|budget categories|proposals?)|(?:exhaustive|complete)\s+(?:list|inventory|coverage)|nothing\s+else)\b",
    re.I,
)
CURRENCY = r"EUR|USD|GBP|CAD|AUD|CHF|JPY|INR|\u20ac|\u00a3|\$"
UNIT = r"weeks?|days?|hours?|months?|years?|minutes?|seconds?|kg|g|mg|km|m|cm|mm|lit(?:er|re)s?|%|percent"
QUANTITY = re.compile(
    rf"(?:(?<!\w)(?P<prefix>{CURRENCY})\s*)?(?P<value>{NUM.pattern})"
    rf"\s*(?P<suffix>(?:{CURRENCY}|{UNIT})(?!\w))?", re.I,
)
FIELD = re.compile(r"[a-z][a-z0-9]*(?:[ -][a-z][a-z0-9]*){0,8}", re.I)
QUALIFIED = re.compile(
    r"\b(?:and|or|not|no|never|without|excluding|except|up to|at least|at most|"
    r"about|roughly|approximately|estimated|proposed|previous|actual|revised|per)\b", re.I,
)
UNIT_ALIASES = {"\u20ac": "eur", "\u00a3": "gbp", "percent": "%", "litre": "liter"}
GOVERNANCE_FIELDS = {
    **{key: "votes" for key in VOTE_KEYS},
    **{key: "members" for key in MEMBER_KEYS},
    "stored_total_votes": "votes",
    "votes": "votes", "recorded votes": "votes", "stored votes": "votes", "votes cast": "votes",
    "assigned members": "members", "members assigned": "members", "members": "members",
}


class Relation(NamedTuple):
    field: str
    value: Decimal
    unit: str
    span: str


def normalize_unit(raw: str) -> str:
    unit = raw.casefold()
    if unit in {"weeks", "days", "hours", "months", "years", "minutes", "seconds", "liters", "litres"}:
        unit = unit[:-1]
    return UNIT_ALIASES.get(unit, unit)


def normalize_field(raw: str) -> str:
    label = " ".join(raw.casefold().split())
    label = re.sub(r"^the ", "", label)
    if label in {"budget", "total budget"}:
        return "total budget"
    return GOVERNANCE_FIELDS.get(label, re.sub(r" budget$", "", label))


def relation(text: str) -> Relation | None:
    """Accept complete single-value rows and simple declarative sentences."""
    row = text.strip().strip("|").strip().removesuffix(".").strip()
    row = re.sub(r"^[-*\u2022]\s+", "", row)
    row = row.replace("**", "")
    count = re.fullmatch(
        r"(?:there (?:are|is) )?(\d+) (recorded votes?|stored votes?|votes?(?: cast)?|assigned members?|members? assigned|members?)",
        row, re.I,
    )
    if count:
        raw = count[2].casefold()
        label = "members" if "member" in raw else "votes"
        return Relation(label, Decimal(count[1]), "", text)
    matches = list(QUANTITY.finditer(row))
    if len(matches) != 1:
        return None
    match = matches[0]
    if row[match.end():].strip():
        return None
    before = row[:match.start()].strip()
    label = re.sub(r"(?:\s+(?:is|are|costs?|was|were)|\s*[:=|]|\s+[\u2013\u2014-])$", "", before, flags=re.I).strip()
    if not FIELD.fullmatch(label) or QUALIFIED.search(label):
        return None
    prefix = normalize_unit(match["prefix"] or "")
    suffix = normalize_unit(match["suffix"] or "")
    if prefix and suffix:
        return None
    if not (prefix or suffix or label != before):
        return None
    value = _dec(match["value"])
    return None if value is None else Relation(normalize_field(label), value, prefix or suffix, text)


def evidence_relations(content: object) -> list[Relation]:
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
        except ValueError:
            rows = re.split(r"[;\n]+", content)
            # A standalone total-budget heading followed by its amount is an
            # explicit two-line record. Generic adjacent PDF lines are not.
            pairs = [f"{row}\n{rows[i + 1]}" for i, row in enumerate(rows[:-1])
                     if row.strip().casefold() == "total budget"
                     and re.fullmatch(rf"(?:{CURRENCY})\s*[\d,.]+", rows[i + 1].strip(), re.I)]
            return [fact for row in rows + pairs if (fact := relation(row)) is not None]
    else:
        parsed = content
    if not isinstance(parsed, dict):
        return []
    facts = []
    budget = parsed.get("budget")
    if isinstance(budget, dict):
        for label, entry in budget.items():
            if not isinstance(entry, dict) or not FIELD.fullmatch(label) or QUALIFIED.search(label):
                continue
            amount, currency = entry.get("amount"), entry.get("currency")
            if (re.fullmatch(r"-?\d+(?:\.\d+)?", str(amount))
                    and isinstance(currency, str) and re.fullmatch(CURRENCY, currency, re.I)):
                facts.append(Relation(normalize_field(label), Decimal(str(amount)),
                                      normalize_unit(currency), json.dumps({label: entry})))
    records = [parsed]
    if isinstance(parsed.get("proposal"), dict):
        records.append(parsed["proposal"])
    for record in records:
        for key, value in record.items():
            label = GOVERNANCE_FIELDS.get(key.casefold())
            if label and re.fullmatch(r"-?\d+(?:\.\d+)?", str(value)):
                facts.append(Relation(label, Decimal(str(value)), "", json.dumps({key: value})))
    return facts


def known_facts(sources: list[dict]) -> dict[str, set[Decimal]]:
    """Non-null numeric values for vote/member keys in JSON sources. Zero is kept: it is known data."""
    facts: dict[str, set[Decimal]] = {"votes": set(), "members": set()}

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                key = str(k).lower()
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    if key in VOTE_KEYS:
                        facts["votes"].add(Decimal(str(v)))
                    elif key in MEMBER_KEYS:
                        facts["members"].add(Decimal(str(v)))
                elif key in ("vote_counts", "votes_by_option") and isinstance(v, (dict, list)):
                    vals = v.values() if isinstance(v, dict) else v
                    for x in vals:
                        if isinstance(x, (int, float)) and not isinstance(x, bool):
                            facts["votes"].add(Decimal(str(x)))
                walk(v)
        elif isinstance(node, list):
            for x in node:
                walk(x)
    for s in sources:
        content = s.get("content")
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except ValueError:
                continue
        walk(content)
    return facts


@dataclass
class Claim:
    text: str
    citations: list[str]
    status: str                    # supported | unsupported_number | uncited_factual | unknown_citation |
                                   # contradicts_known_value | unchecked_cited | non_factual
    detail: str | None = None
    evidence: list[dict[str, str]] = field(default_factory=list)
    absent: list[str] = field(default_factory=list)   # numbers not found in the cited sources


def split_claims(answer: str) -> list[str]:
    text = re.sub(r"([.!?])\s*((?:\[(?:D|G|B)\d+\]\s*)+)", lambda m: " " + m.group(2).strip() + m.group(1) + " ", answer or "")
    out = []
    for line in re.split(r"\n+", text):
        line = re.sub(r"^\s*(?:[-*\u2022]|\d+[.)])\s+", "", line).strip()
        for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z\[\"'])", line):
            if sent.strip():
                out.append(sent.strip())
    return out


def verify_claims(answer: str, sources: list[dict]) -> dict:
    by_id = {s["source_id"]: s for s in sources}
    src_numbers = {i: numbers(s["content"] if isinstance(s["content"], str) else json.dumps(s["content"], default=str))
                   for i, s in by_id.items()}
    relations = {i: evidence_relations(s["content"]) for i, s in by_id.items()}
    claims: list[Claim] = []
    for sent in split_claims(answer):
        cites = list(dict.fromkeys(CITE.findall(sent)))
        body = CITE.sub("", sent)
        atoms = claim_numbers(body)
        if body.strip().endswith("?"):
            claims.append(Claim(sent, cites, "non_factual", "question"))
            continue
        unknown = [c for c in cites if c not in by_id]
        if unknown:
            claims.append(Claim(sent, cites, "unknown_citation", f"cites unknown source {unknown[0]}"))
            continue
        status, detail, absent_vals = None, None, []
        spans: list[dict[str, str]] = []
        if CLOSED_WORLD.search(body):
            status, detail = "unchecked_cited", "Completeness is not established by retrieved evidence"
        if status is None and MISSING.search(body):
            facts = known_facts([by_id[c] for c in cites])
            for words, key in ((VOTE_WORDS, "votes"), (MEMBER_WORDS, "members")):
                if words.search(body) and facts[key]:
                    status = "contradicts_known_value"
                    detail = f"claims {key} are missing but sources contain {sorted(str(v) for v in facts[key])}"
        claimed = relation(body)
        if claimed is not None:
            atoms.add(claimed.value)
        if status is None and atoms:
            if not cites:
                status, detail = "uncited_factual", "numeric claim without a citation"
            else:
                pool = set().union(*(src_numbers[c] for c in cites))
                absent = sorted(str(a) for a in atoms if a not in pool)
                related = [(c, fact) for c in cites for fact in relations[c]
                           if claimed is not None and fact.field == claimed.field]
                values = {(fact.value, fact.unit) for _, fact in related}
                if len(values) > 1:
                    status, detail = "unchecked_cited", "Conflicting cited field values or units"
                elif related and claimed is not None and next(iter(values)) != (claimed.value, claimed.unit):
                    value, unit = next(iter(values))
                    if bool(unit) != bool(claimed.unit):
                        status, detail = "unchecked_cited", "Claim or evidence omits the required unit"
                    elif value != claimed.value and absent:
                        status, detail, absent_vals = "unsupported_number", f"numbers not in cited sources: {absent}", absent
                    else:
                        status, detail = "contradicts_known_value", f"Cited field {claimed.field!r} has a different value or unit"
                elif absent:
                    status, detail = "unsupported_number", f"numbers not in cited sources: {absent}"
                    absent_vals = absent
                elif related:
                    status = "supported"
                else:
                    status, detail = "unchecked_cited", "No unambiguous field, value and unit association in cited evidence"
                spans = [{"source_id": c, "span": fact.span} for c, fact in related]
        if status is None:
            status = "unchecked_cited" if cites else "non_factual"
        claims.append(Claim(sent, cites, status, detail, spans, absent_vals))
    counts: dict[str, int] = {}
    for c in claims:
        counts[c.status] = counts.get(c.status, 0) + 1
    bad = counts.get("unsupported_number", 0) + counts.get("uncited_factual", 0) + \
        counts.get("unknown_citation", 0) + counts.get("contradicts_known_value", 0)
    checkable = counts.get("supported", 0) + counts.get("unsupported_number", 0) + \
        counts.get("unknown_citation", 0) + counts.get("contradicts_known_value", 0)
    factual = checkable + counts.get("uncited_factual", 0) + counts.get("unchecked_cited", 0)
    return {"method": "automatic claim-level check (field, value, unit and citation); not entailment",
            "claims_total": len(claims), "claims_factual": factual, "counts": counts,
            "unsupported_claims": bad,
            "unsupported_rate_lower_bound": (bad / factual) if factual else None,
            "numeric_faithfulness": (counts.get("supported", 0) / checkable) if checkable else None,
            "valid": bad == 0, "claim_checks": [asdict(c) for c in claims], "flagged": [asdict(c) for c in claims if c.status in
                ("unsupported_number", "uncited_factual", "unknown_citation", "contradicts_known_value")]}


def blocking_flags(report: dict, small: int = 12) -> list[dict]:
    """Flags severe enough to withhold a generated section: unknown citations, contradictions of known
    values, and unsupported numbers above `small` (small integers are often spelled out in documents,
    so "4 weeks" vs "four-week" is not treated as a fabrication). Uncited numbers are reported, not blocking."""
    out = [c for c in report.get("claim_checks", [])
           if c["status"] == "unchecked_cited" and CLOSED_WORLD.search(CITE.sub("", c["text"]))]
    for f in report["flagged"]:
        if f["status"] in ("unknown_citation", "contradicts_known_value"):
            out.append(f)
        elif f["status"] == "unsupported_number" and any(abs(Decimal(v)) > small for v in f.get("absent", [])):
            out.append(f)
    return out
