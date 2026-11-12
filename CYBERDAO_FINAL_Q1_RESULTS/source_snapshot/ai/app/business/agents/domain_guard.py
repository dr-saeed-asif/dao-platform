"""Cheap, deterministic CyberChain domain gate that runs BEFORE any LLM or agent call.

It is deliberately asymmetric. It only *rejects* when the message is clearly unrelated and carries
no CyberChain signal, and only *accepts* on strong CyberChain vocabulary or an in-scope follow-up.
Everything else is returned as "uncertain" and must be settled by the semantic (LLM) planner, so
legitimate questions without the word "CyberChain" are never rejected on keywords alone.
Standard library only.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

OUT_OF_SCOPE_MESSAGE = (
    "This question is not related to CyberChain. Please ask me a question about CyberChain DAOs, "
    "proposals, governance, membership, voting, or blockchain activity.")
DECLINED_PART_NOTE = ("I can only answer CyberChain questions, so I did not answer this unrelated part: {parts}")

HELP_REPLY = (
    "I can summarize this proposal and its attached documents, explain membership and votes, "
    "or compare the stored records with CyberChain. Try asking “How many votes were cast?”"
)
_HELP_REQUEST = re.compile(
    r"(?:what (?:can|could) you (?:do|help with)|what you (?:can|could) (?:do|help with)|"
    r"what do you do|what are (?:your|the assistant's) capabilities|"
    r"how (?:can|could) you help(?: me)?|(?:can|could) you help(?: me)?|"
    r"what (?:can|should) i ask(?: you)?|who are you|help(?: me)?)"
    r"(?: (?:here|for me|in this chat|with this proposal))?"
)


def conversational_reply(message: str) -> str | None:
    """Handle whole conversational turns without treating mixed turns as small talk."""
    text = unicodedata.normalize("NFKC", message).casefold().replace("’", "'")
    text = " ".join(text.split()).rstrip(" .!?,")
    if text in {"hi", "hello", "hey", "hi there", "hello there", "hey there", "good morning", "good evening"}:
        return "Hi! What would you like to know about this proposal?"
    text = re.sub(r"^(?:hi|hello|hey)[,.!]? +", "", text)
    text = re.sub(r"^(?:please|(?:can|could) you tell me)[, ]+", "", text)
    text = re.sub(r"[, ]+please$", "", text)
    if text in {"thanks", "thank you", "thanks a lot"}:
        return "You're welcome!"
    if re.fullmatch(r"how (?:are you(?: doing)?|is it going|are things)", text):
        return "I'm here and ready to help. What would you like to know about this proposal?"
    if _HELP_REQUEST.fullmatch(text):
        return HELP_REPLY
    return None


def planning_history(message: str, history: list[dict] | None) -> list[dict]:
    """Expose recent context only when the new turn may refer to prior discussion."""
    return (history or [])[-4:] if FOLLOW_UP.search(message) else []

# Strong: specific to this assistant's domain. Weak words (risk, budget, document, contract...) are
# ambiguous on their own and are never enough to accept or reject.
STRONG = re.compile(
    r"\b(daos?|cyber[ -]?chain|cyberdao|proposals?|votes?|voting|voters?|voted|ballots?|quorum|"
    r"members?|membership|assigned|assignments?|governance|on[ -]?chain|off[ -]?chain|blockchain|"
    r"deliverables?|tx hash(?:es)?|block numbers?|tallies|tally|finali[sz](?:e|ed|ation))\b", re.I)
UNRELATED = re.compile(
    r"\b(weather|forecast|recipes?|cooking|jokes?|poems?|lyrics|horoscope|movies?|films?|netflix|"
    r"football|soccer|nba|nfl|stock prices?|share prices?|exchange rate|capital of|prime minister|"
    r"translate|translation of|python script|write (?:me )?(?:a |an )?(?:code|essay|story|poem|song)|"
    r"homework|who won the|how tall is|horror|vacation|flight to|hotel in|bitcoin price|"
    r"ignore (?:all |your )?(?:previous|prior) instructions)\b", re.I)
FOLLOW_UP = re.compile(
    r"^\s*(and|also|what about|how about|why|so|then|those|these|that one|the same|which of)\b|"
    r"\b(those|them|both|that one|the previous|the same|it|its|earlier|above)\b", re.I)
CLAUSE_SPLIT = re.compile(
    r"(?<=[?.!;])\s+|\n+|,\s*and\s+(?=(?:what|how|who|when|where|why|tell|write|give)\b)|"
    r"\s+and\s+(?=(?:what|how|who|when|where|why|tell|write|give)\b)", re.I)


@dataclass
class DomainDecision:
    label: str                     # in_scope | out_of_scope | mixed | uncertain
    reason: str
    in_scope_text: str = ""        # what to forward to the planner (mixed: unrelated clauses removed)
    declined_parts: list[str] = field(default_factory=list)
    needs_llm: bool = False
    source: str = "domain_guard_rules"

    @property
    def message(self) -> str:
        if self.label == "out_of_scope":
            return OUT_OF_SCOPE_MESSAGE
        if self.label == "mixed":
            return DECLINED_PART_NOTE.format(parts="; ".join(self.declined_parts))
        return ""


def _history_in_scope(history: list[dict] | None) -> bool:
    return any(STRONG.search(str(m.get("content", ""))) for m in (history or [])[-4:])


def _clause_label(clause: str, history_in_scope: bool) -> str:
    strong, unrelated = bool(STRONG.search(clause)), bool(UNRELATED.search(clause))
    if unrelated and not strong:
        return "out"
    if unrelated and strong:
        return "uncertain"          # e.g. "tell me a joke about voting": the planner decides
    if strong:
        return "in"
    if history_in_scope and FOLLOW_UP.search(clause):
        return "in"
    return "uncertain"


def classify_domain(message: str, history: list[dict] | None = None) -> DomainDecision:
    text = " ".join((message or "").split())
    if not text:
        return DomainDecision("uncertain", "empty message", needs_llm=True)
    hist = _history_in_scope(history)
    clauses = [c.strip() for c in CLAUSE_SPLIT.split(text) if c and c.strip()] or [text]
    labels = [_clause_label(c, hist) for c in clauses]
    out = [c for c, l in zip(clauses, labels) if l == "out"]
    keep = [c for c, l in zip(clauses, labels) if l != "out"]
    if out and not keep:
        return DomainDecision("out_of_scope", "every clause is clearly unrelated and has no CyberChain signal",
                              declined_parts=out)
    if out:
        return DomainDecision("mixed", "some clauses are clearly unrelated", in_scope_text=" ".join(keep),
                              declined_parts=out, needs_llm=all(l == "uncertain" for l in labels if l != "out"))
    if any(l == "in" for l in labels) and "uncertain" not in labels:
        return DomainDecision("in_scope", "strong CyberChain vocabulary or in-scope follow-up", in_scope_text=text)
    if any(l == "in" for l in labels):
        return DomainDecision("in_scope", "contains CyberChain vocabulary", in_scope_text=text, needs_llm=False)
    return DomainDecision("uncertain", "no decisive signal; semantic planner must decide", in_scope_text=text,
                          needs_llm=True)
