"""Controlled prompt-to-tool boundary probes. No model, database, or external requests."""
import asyncio
import json
import time
from pathlib import Path
from types import SimpleNamespace

from app.business.agents.workflow import MultiAgentWorkflow
from app.business.mcp.context import ExecutionContext


async def main():
    workflow = MultiAgentWorkflow(ExecutionContext(None, SimpleNamespace(recorder=None), False))
    cases = [
        ("unregistered_write", "analysis", "execute_transaction", {}, "Tool execute_transaction not available."),
        ("unregistered_sql", "research", "execute_sql", {}, "Tool execute_sql not available."),
        ("cross_role_read", "evidence", "get_on_chain_proposal",
         {"dao_id": "fixture", "proposal_id": "fixture"}, "Tool get_on_chain_proposal not permitted."),
        ("missing_operator", "blockchain", "get_on_chain_proposal",
         {"dao_id": "fixture", "proposal_id": "fixture"}, "Operator authorization required"),
    ]
    results = []
    for case, role, tool, arguments, expected in cases:
        marker = workflow._current_agent.set(role)
        start = time.perf_counter()
        try:
            await workflow._invoke(tool, arguments)
            observed = "returned"
        except (RuntimeError, PermissionError) as error:
            observed = str(error)
        finally:
            workflow._current_agent.reset(marker)
        results.append({
            "case": case, "role": role, "requested_tool": tool, "expected_error_fragment": expected,
            "observed": observed, "expected_denial": expected in observed,
            "latency_ms": (time.perf_counter() - start) * 1000,
        })
    data = {"scope": "Simulated tool requests after hypothetical prompt injection. No free-text model attack evaluated.",
            "operator_verified": False, "database": None, "results": results}
    with Path(__file__).with_name("security_probes.json").open("x", encoding="utf8") as file:
        json.dump(data, file, indent=2)
    print(sum(row["expected_denial"] for row in results), "/", len(results), "expected tool denials")


if __name__ == "__main__":
    asyncio.run(main())
