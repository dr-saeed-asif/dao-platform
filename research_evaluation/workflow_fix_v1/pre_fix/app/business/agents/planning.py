"""Supervisor dispatch for validated LLM plans, with legacy direct-call routing."""

import re

from .models import AgentName, PlannedQuestion, QuestionPlanItem
from .quality import split_questions
from .routing import resolve_agents

DEPENDENCY_MARKERS = re.compile(
    r"\b(based on (?:that|the previous)|previous answer|above|former|latter|"
    r"using that|from that result|then compare)\b", re.IGNORECASE)
INTENT_AGENT: dict[str, AgentName] = {
    "research": "research",
    "proposal": "proposal",
    "proposal_count": "research",
    "voting": "governance",
    "evidence": "evidence",
    "blockchain": "blockchain",
    "analysis": "analysis",
}


def plan_questions(value: str | list[str],
                   question_plan: list[QuestionPlanItem] | None = None) -> list[PlannedQuestion]:
    raw = split_questions(value) if isinstance(value, str) else [q.strip() for q in value if q.strip()]
    if question_plan is not None and len(raw) != len(question_plan):
        raise ValueError("Question plan must match the submitted questions.")

    plans = []
    for index, question in enumerate(raw, 1):
        if question_plan is None:
            agent = classify_intent(question)
            dependency = [f"q{index - 1}"] if index > 1 and DEPENDENCY_MARKERS.search(question) else []
        else:
            item = question_plan[index - 1]
            if item.question != question:
                raise ValueError("Question plan must preserve submitted question order and wording.")
            if any(number < 1 or number >= index for number in item.depends_on):
                raise ValueError("Question dependencies must refer to earlier questions.")
            agent = INTENT_AGENT[item.intent]
            dependency = [f"q{number}" for number in item.depends_on]
        # A validated semantic plan is authoritative: the server only checks that the proposed specialists
        # are legal for the intent. Regex selection (select_agents) is the legacy path for unplanned input.
        dropped: list[str] = []
        if question_plan is not None:
            agents, dropped = resolve_agents(item.intent, list(item.agents))
        else:
            agents = select_agents(question, agent)
        plans.append(PlannedQuestion(question_id=f"q{index}", order=index,
                                     question=question, agent=agent,
                                     depends_on=dependency,
                                     agents=agents, dropped_agents=dropped))
    return plans


def classify_intent(question: str) -> AgentName:
    text = " ".join(question.lower().split())
    if re.search(r"\b(blockchain|on[ -]?chain|rpc|transactions?|tx hashes?|block numbers?|contracts?|ledger|discrepanc(?:y|ies)|mismatch(?:es)?|verify.*chain)\b", text):
        return "blockchain"
    if re.search(r"\b(list|show|find|search|compare|how many|number of|count|total)\b.*\bproposals?\b", text):
        return "research"
    if re.search(r"\b(risks?|benefits?|conclusions?|missing|decision|recommend(?:ation)?s?|implications?)\b", text):
        return "analysis"
    has_proposal_fact = bool(re.search(r"\b(title|purpose|description|proposal|start|end|status)\b", text))
    has_evidence_request = bool(re.search(r"\b(pdf|document|attachment|evidence|source|citation|requirement|deadline|chunk|supporting|budget|eur|euros?|costs?|allocation|expenses?)\b|€", text))
    if has_evidence_request and has_proposal_fact:
        return "analysis"
    if has_evidence_request:
        return "evidence"
    if re.search(r"\b(votes?|voting|assigned|assignment|quorum|governance)\b", text):
        return "governance"
    if re.search(r"\b(summar(?:y|ize|ise)|overview|risks?|benefits?|recommend(?:ation)?s?|implications?)\b", text):
        return "analysis"
    if has_proposal_fact:
        return "proposal"
    return "analysis"


def select_agents(question: str, primary: AgentName) -> list[AgentName]:
    """Select source specialists independently of how many questions were asked.

    These are trusted server rules; planner suggestions never grant tool access.
    A comparison remains one task, with several workers supplying its inputs.
    """
    text = " ".join(question.lower().split())
    if primary == "research" and not re.search(r"\b(and|compare|against)\b", text):
        return ["research"]
    if primary == "analysis" and re.search(r"\b(risks?|benefits?|conclusions?|missing|decision|recommend(?:ation)?s?|implications?)\b", text):
        return ["analysis"]
    agents = []
    if re.search(r"\b(pdf|document|attachment|evidence|budget|eur|euros?|costs?|allocation|expenses?)\b|€", text):
        agents.append("evidence")
    if re.search(r"\b(blockchain|on[ -]?chain|chain records?|rpc|transactions?|contracts?|ledger|discrepanc(?:y|ies)|mismatch(?:es)?)\b", text):
        agents.append("blockchain")
    if re.search(r"\b(database|stored|indexed|off[ -]?chain|vote count|assigned)\b", text) and re.search(r"\b(votes?|members?|assignments?|voting)\b", text):
        agents.append("governance")
    elif re.search(r"\b(votes?|members?|assignments?|voting|quorum)\b", text) and "blockchain" not in agents:
        agents.append("governance")
    if re.search(r"\b(list|search|find|count|how many|number of|compare)\b.*\bproposals\b|\bproposal count\b", text):
        agents.append("research")
    # A PDF's own proposal/budget description does not need a database worker.
    if re.search(r"\b(title|purpose|status|start|end)\b", text) and (
        not agents or re.search(r"\b(database|stored|compare|match|against)\b|proposal['’]s (?:purpose|status)|(?:purpose|status) of (?:this|the|selected) proposal", text)
    ):
        agents.append("proposal")
    if "evidence" in agents and re.search(r"\bproposal\b", text) and re.search(r"\b(compare|match|against|difference)\b", text):
        agents.append("proposal")
    if re.search(r"\bsummari[sz]e|\bsummerize", text) and re.search(r"\b(?:this|the selected) proposal\b", text):
        agents.append("proposal")
    return list(dict.fromkeys(agents)) or [primary]


def proposal_search_query(question: str) -> str:
    """Extract the topic, rather than sending an entire command to ILIKE."""
    match = re.search(r"\b(?:about|regarding|related to|concerning)\s+(.+)", question, re.I)
    if match:
        return match[1].strip(' .?!"“”')
    match = re.search(r"\b(?:find|search(?: this DAO for)?|show)\s+(.+?)\s+proposals?\b", question, re.I)
    return match[1].strip(' .?!"“”') if match else question.strip(' .?!"“”')
