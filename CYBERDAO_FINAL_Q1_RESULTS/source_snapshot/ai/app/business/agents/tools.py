"""LangChain structured tools backed by existing CyberGovAI use cases."""

from pathlib import Path

from langchain_core.tools import BaseTool, StructuredTool

from app.business.health import health_status
from app.business.mcp.chunk_tool import chunk_tool
from app.business.mcp.context import ExecutionContext
from app.business.mcp.dao_proposal_tools_impl import count_tool, list_tool, search_tool
from app.business.mcp.document_tools import documents_tool
from app.business.mcp.evidence_status_tool import evidence_status_tool
from app.business.mcp.evidence_tool import evidence_tool
from app.business.mcp.governance_tools_impl import comparison_tool, voting_facts_tool
from app.business.mcp.index_status_tool import index_status_tool
from app.business.mcp.proposal_read_tools import assignment_tool, proposal_tool
from app.business.mcp.time_window_tool import time_window_tool
from app.business.mcp.tool_helpers import require_operator
from app.business.rag.indexing import index_document as index_document_use_case
from .catalog import TOOL_NAMES
from .blockchain import BlockchainVerificationAgent
from .quality import split_questions as split_question_text, verify_citations as check_citations


def build_tools(context: ExecutionContext) -> dict[str, BaseTool]:
    async def health() -> dict:
        require_operator(context)
        return await health_status(context.pool)

    async def get_proposal(dao_id: str, proposal_id: str) -> dict:
        return _dump(await proposal_tool(context, dao_id, proposal_id))

    async def check_proposal_assignment(dao_id: str, proposal_id: str,
                                        wallet_address: str) -> dict:
        return _dump(await assignment_tool(context, dao_id, proposal_id, wallet_address))

    async def list_proposal_documents(dao_id: str, proposal_id: str) -> dict:
        return _dump(await documents_tool(context, dao_id, proposal_id))

    async def search_proposal_evidence(dao_id: str, proposal_id: str,
                                       question: str, top_k: int = 4) -> dict:
        return _dump(await evidence_tool(context, dao_id, proposal_id, question, top_k))

    async def get_proposal_time_window(dao_id: str, proposal_id: str) -> dict:
        return _dump(await time_window_tool(context, dao_id, proposal_id))

    async def get_document_index_status(dao_id: str, proposal_id: str,
                                        evidence_id: str) -> dict:
        return _dump(await index_status_tool(context, dao_id, proposal_id, evidence_id))

    async def get_proposal_document_chunk(dao_id: str, proposal_id: str,
                                          evidence_id: str, chunk_key: str) -> dict:
        return _dump(await chunk_tool(context, dao_id, proposal_id, evidence_id, chunk_key))

    async def get_proposal_evidence_status(dao_id: str, proposal_id: str) -> dict:
        return _dump(await evidence_status_tool(context, dao_id, proposal_id))

    async def count_dao_proposals(dao_id: str) -> dict:
        return {"dao_id": dao_id, "proposal_count": await count_tool(context, dao_id)}

    async def list_dao_proposals(dao_id: str, limit: int = 20) -> dict:
        return _dump(await list_tool(context, dao_id, limit))

    async def search_dao_proposals(dao_id: str, query: str, limit: int = 20) -> dict:
        return _dump(await search_tool(context, dao_id, query, limit))

    async def compare_dao_proposals(dao_id: str, proposal_a: str,
                                    proposal_b: str) -> dict:
        return _dump(await comparison_tool(context, dao_id, proposal_a, proposal_b))

    async def get_proposal_voting_facts(dao_id: str, proposal_id: str) -> dict:
        return _dump(await voting_facts_tool(context, dao_id, proposal_id))

    def split_questions(text: str) -> list[str]:
        return split_question_text(text)

    def verify_citations(answer: str, evidence: list[dict]) -> dict:
        return check_citations(answer, evidence)

    blockchain = BlockchainVerificationAgent(context)

    async def get_on_chain_proposal(dao_id: str, proposal_id: str) -> dict:
        """Read proposal facts from the configured contract at a pinned block."""
        result = await blockchain.snapshot(dao_id, proposal_id)
        return {k: result.get(k) for k in ('status', 'chain_id', 'contract', 'block_number', 'block_hash', 'proposal', 'errors')}

    async def get_on_chain_voting_status(dao_id: str, proposal_id: str) -> dict:
        result = await blockchain.snapshot(dao_id, proposal_id)
        return {k: result.get(k) for k in ('status', 'chain_id', 'block_number', 'voting_status', 'errors')}

    async def get_on_chain_vote_counts(dao_id: str, proposal_id: str) -> dict:
        result = await blockchain.snapshot(dao_id, proposal_id)
        return {k: result.get(k) for k in ('status', 'chain_id', 'block_number', 'vote_counts', 'errors')}

    async def get_on_chain_transactions(dao_id: str, proposal_id: str) -> dict:
        result = await blockchain.snapshot(dao_id, proposal_id)
        return {k: result.get(k) for k in ('status', 'chain_id', 'block_number', 'transactions', 'errors')}

    async def get_on_chain_governance_events(dao_id: str, proposal_id: str) -> dict:
        result = await blockchain.snapshot(dao_id, proposal_id)
        return {k: result.get(k) for k in ('status', 'chain_id', 'block_number', 'events', 'errors')}

    async def compare_on_chain_off_chain(dao_id: str, proposal_id: str) -> dict:
        return await blockchain.snapshot(dao_id, proposal_id)

    functions = (
        (health, "Check PostgreSQL and Ollama health."),
        (get_proposal, "Read one proposal within a DAO."),
        (check_proposal_assignment, "Check a diagnostic wallet assignment."),
        (list_proposal_documents, "List verified documents linked to a proposal."),
        (search_proposal_evidence, "Search verified indexed proposal evidence."),
        (get_proposal_time_window, "Read stored and derived proposal timing."),
        (get_document_index_status, "Read a linked document index status."),
        (get_proposal_document_chunk, "Read an authorized proposal document chunk."),
        (get_proposal_evidence_status, "Summarize linked proposal evidence status."),
        (count_dao_proposals, "Count proposals in one DAO."),
        (list_dao_proposals, "List proposals in one DAO."),
        (search_dao_proposals, "Search proposals in one DAO."),
        (compare_dao_proposals, "Compare two proposals in one DAO."),
        (get_proposal_voting_facts, "Read stored proposal voting facts."),
        (split_questions, "Split a request into ordered questions."),
        (verify_citations, "Verify answer citations against supplied evidence."),
        (get_on_chain_proposal, "Read on-chain proposal details."),
        (get_on_chain_voting_status, "Read live voting status."),
        (get_on_chain_vote_counts, "Read on-chain per-option vote counts."),
        (get_on_chain_transactions, "Read verified proposal transactions."),
        (get_on_chain_governance_events, "Read canonical proposal governance events."),
        (compare_on_chain_off_chain, "Compare proposal, votes and governance events with the configured blockchain."),
    )
    tools = {function.__name__: StructuredTool.from_function(
        func=function if not _is_async(function) else None,
        coroutine=function if _is_async(function) else None,
        name=function.__name__, description=description,
    ) for function, description in functions}
    if tuple(tools) != TOOL_NAMES:
        raise RuntimeError("Executable tool registry does not match TOOL_NAMES.")
    return tools


def _dump(value) -> dict:
    return value.model_dump(mode="json") if hasattr(value, "model_dump") else value


def _is_async(function) -> bool:
    import inspect
    return inspect.iscoroutinefunction(function)
