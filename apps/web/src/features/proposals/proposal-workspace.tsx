"use client";

import { useState } from "react";
import type { Proposal } from "@/lib/api/types";
import { daoApi } from "@/lib/api/client";
import { useWallet } from "@/features/wallet/wallet-provider";
import { MemberManager } from "@/features/members/member-manager";
import { VotingPanel } from "@/features/voting/voting-panel";

const date = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function ProposalWorkspace({
  proposal,
  onChanged,
}: {
  proposal: Proposal;
  onChanged(): void;
}) {
  const { address } = useWallet();
  const [message, setMessage] = useState<string | null>(null);
  async function publish() {
    if (!address) return setMessage("Connect the administrator wallet first.");
    try {
      setMessage("Publishing on CyberChain…");
      await daoApi.publishProposal(proposal.id, address);
      setMessage("Proposal confirmed on-chain.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publishing failed.");
    }
  }
  return (
    <section className="workspace">
      <div className="proposal-detail">
        <div className="detail-top">
          <div>
            <span
              className={`status status-${proposal.onChainId ? "chain" : "draft"}`}
            >
              {proposal.onChainId ? `On-chain #${proposal.onChainId}` : "Draft"}
            </span>
            <h2>{proposal.title}</h2>
            <p>{proposal.purpose}</p>
          </div>
          {!proposal.onChainId && (
            <button
              className="button button-primary"
              onClick={() => void publish()}
            >
              Publish on-chain
            </button>
          )}
        </div>
        <p className="description">{proposal.description}</p>
        <div className="facts">
          <div>
            <span>Voting opens</span>
            <strong>{date(proposal.startsAt)}</strong>
          </div>
          <div>
            <span>Voting closes</span>
            <strong>{date(proposal.endsAt)}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>{proposal.type.replaceAll("_", " ")}</strong>
          </div>
        </div>
        {message && <p className="form-message">{message}</p>}
      </div>
      <div className="workflow-grid">
        <MemberManager proposal={proposal} />
        <VotingPanel proposal={proposal} />
      </div>
    </section>
  );
}
