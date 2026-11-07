"use client";
import { useState } from "react";
import { ProposalAssistant } from "./proposal-assistant";
export function AiPanel({
  proposals,
  selectedProposalId,
}: {
  proposals: Array<{ id: string; title: string; daoId?: string }>;
  selectedProposalId?: string;
}) {
  const [id, setId] = useState(selectedProposalId ?? proposals[0]?.id ?? "");
  const proposal = proposals.find((p) => p.id === id);
  return (
    <div className="view-stack">
      <section className="dashboard-card ai-proposal-context">
        <div className="ai-proposal-summary">
          <div className="ai-selected-proposal">
            <span className="eyebrow">SELECTED PROPOSAL</span>
            <strong>{proposal?.title ?? "Choose a proposal"}</strong>
            <small>
              {proposal?.daoId ?? "Proposal scope is verified by the server"}
            </small>
          </div>
        </div>
        <label className="ai-proposal-picker">
          Change proposal
          <select
            aria-label="AI proposal"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            {proposals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      </section>
      {proposal ? (
        <ProposalAssistant
          key={proposal.id}
          proposalId={proposal.id}
          daoId={proposal.daoId}
          title={proposal.title}
        />
      ) : (
        <p>Select an existing proposal to ask AI.</p>
      )}
    </div>
  );
}
