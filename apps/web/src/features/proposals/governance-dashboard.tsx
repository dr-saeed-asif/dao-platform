"use client";

import { useCallback, useEffect, useState } from "react";
import { daoApi } from "@/lib/api/client";
import type { Proposal } from "@/lib/api/types";
import { CreateProposalForm } from "./create-proposal-form";
import { ProposalWorkspace } from "./proposal-workspace";

export function GovernanceDashboard() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await daoApi.listProposals();
      setProposals(result.items);
      setSelectedId((current) => current ?? result.items[0]?.id ?? null);
      setError(null);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Could not load proposals.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = proposals.find((proposal) => proposal.id === selectedId);
  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow light">Governance, made legible</span>
          <h1>
            Decide together.
            <br />
            <em>Record forever.</em>
          </h1>
          <p>
            Create proposals, define eligible voters, and cast verifiable votes
            on CyberChain.
          </p>
        </div>
        <div className="hero-stat">
          <strong>{proposals.length}</strong>
          <span>Governance proposals</span>
          <small>Indexed locally for fast reads</small>
        </div>
      </section>
      <div className="page-grid">
        <aside id="proposals" className="proposal-sidebar">
          <div className="sidebar-heading">
            <div>
              <span className="eyebrow">Governance</span>
              <h2>Proposals</h2>
            </div>
            <button className="icon-button" onClick={() => void load()}>
              ↻
            </button>
          </div>
          {error && <p className="form-message">{error}</p>}
          <div className="proposal-list">
            {proposals.map((proposal) => (
              <button
                key={proposal.id}
                className={
                  selectedId === proposal.id
                    ? "proposal-item active"
                    : "proposal-item"
                }
                onClick={() => setSelectedId(proposal.id)}
              >
                <span className="proposal-index">
                  {proposal.onChainId ? `#${proposal.onChainId}` : "Draft"}
                </span>
                <strong>{proposal.title}</strong>
                <small>{proposal.type.replaceAll("_", " ")}</small>
              </button>
            ))}
            {!proposals.length && !error && (
              <p className="empty">No proposals yet.</p>
            )}
          </div>
        </aside>
        <div className="content-column">
          {selected ? (
            <ProposalWorkspace
              proposal={selected}
              onChanged={() => void load()}
            />
          ) : (
            <div className="panel empty-state">
              <h2>Your governance workspace is ready.</h2>
              <p>Create the first proposal to begin.</p>
            </div>
          )}
          <CreateProposalForm onCreated={() => void load()} />
        </div>
      </div>
    </>
  );
}
