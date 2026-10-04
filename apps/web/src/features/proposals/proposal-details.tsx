"use client";

import { useEffect, useState } from "react";
import type {
  Artefact,
  ChainTransaction,
  Proposal,
} from "@/lib/api/types";
import { daoApi } from "@/lib/api/client";
import { useWallet } from "@/features/wallet/wallet-provider";
import { MemberManager } from "@/features/members/member-manager";
import { VotingPanel } from "@/features/voting/voting-panel";
import { CopyableHash } from "@/components/copy-value-button";

const date = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

type DetailsTab = "overview" | "voting" | "members" | "documents" | "history";

const tabs: { id: DetailsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "voting", label: "Voting" },
  { id: "members", label: "Members" },
  { id: "documents", label: "Documents" },
  { id: "history", label: "History" },
];

export function ProposalDetails({
  proposal,
  status,
  votesCount,
  onChanged,
  canAdmin = false,
  onBack,
}: {
  proposal: Proposal;
  status: string;
  votesCount: number;
  onChanged(): void;
  canAdmin?: boolean;
  onBack(): void;
}) {
  const { address } = useWallet();
  const [tab, setTab] = useState<DetailsTab>("overview");
  const [message, setMessage] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<ChainTransaction[]>([]);
  const [artefacts, setArtefacts] = useState<Artefact[]>([]);
  const [votingEnded, setVotingEnded] = useState(false);
  const finalized =
    proposal.status === "CLOSED" || proposal.status === "EXECUTED";

  useEffect(() => {
    const update = () =>
      setVotingEnded(Date.now() >= Date.parse(proposal.endsAt));
    update();
    const timer = window.setInterval(update, 15_000);
    return () => window.clearInterval(timer);
  }, [proposal.endsAt]);

  useEffect(() => {
    setTab("overview");
    setMessage(null);
    void daoApi.listTransactions(proposal.id).then(setTransactions);
    void daoApi.listArtefacts(proposal.id).then(setArtefacts);
  }, [proposal.id]);

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

  async function manage(action: "cancel" | "finalize") {
    if (!address) return setMessage("Connect the administrator wallet first.");
    if (!window.confirm(`Confirm ${action} for “${proposal.title}”?`)) return;
    try {
      setMessage(
        `${action === "cancel" ? "Cancelling" : "Finalizing"} proposal on CyberChain…`,
      );
      if (action === "cancel")
        await daoApi.cancelProposal(proposal.id, address);
      else await daoApi.finalizeProposal(proposal.id, address);
      setMessage(
        `Proposal ${action === "cancel" ? "cancelled" : "finalized"}.`,
      );
      onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : `Could not ${action} proposal.`,
      );
    }
  }

  return (
    <div className="view-stack">
      <section className="proposal-detail">
        <button className="back-link" onClick={onBack}>
          ← Back to proposals
        </button>
        <div className="detail-top">
          <div>
            <span
              className={`governance-status status-${status.toLowerCase().replaceAll(" ", "-")}`}
            >
              {status}
            </span>{" "}
            <span
              className={`status status-${proposal.onChainId ? "chain" : "draft"}`}
            >
              {proposal.onChainId
                ? `On-chain #${proposal.onChainId}`
                : "Draft"}
            </span>
            <h2>{proposal.title}</h2>
            <p>{proposal.purpose}</p>
          </div>
          <div className="proposal-actions">
            {!proposal.onChainId && canAdmin && (
              <button
                className="button button-primary"
                onClick={() => void publish()}
              >
                Publish on-chain
              </button>
            )}
            {proposal.onChainId &&
              canAdmin &&
              proposal.status !== "CANCELLED" &&
              !finalized && (
                <>
                  <button
                    className="button button-danger"
                    onClick={() => void manage("cancel")}
                  >
                    Cancel
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!votingEnded}
                    title={
                      votingEnded
                        ? "Finalize and record the on-chain result"
                        : `Voting ends ${date(proposal.endsAt)}`
                    }
                    onClick={() => void manage("finalize")}
                  >
                    {votingEnded ? "Finalize result" : "Voting still active"}
                  </button>
                </>
              )}
          </div>
        </div>
        <div className="facts facts-five">
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
          <div>
            <span>Proposal ID</span>
            <strong>#{proposal.onChainId ?? "draft"}</strong>
          </div>
          <div>
            <span>Creator</span>
            <CopyableHash
              value={proposal.creatorAddress}
              display={`${proposal.creatorAddress.slice(0, 10)}…${proposal.creatorAddress.slice(-4)}`}
            />
          </div>
        </div>
        {message && <p className="form-message">{message}</p>}
      </section>

      <div className="details-tabs" role="tablist" aria-label="Proposal sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "details-tab active" : "details-tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === "voting" && (
              <span className="details-tab-count">{votesCount}</span>
            )}
            {item.id === "documents" && (
              <span className="details-tab-count">{artefacts.length}</span>
            )}
            {item.id === "history" && (
              <span className="details-tab-count">{transactions.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <section className="dashboard-card padded">
          <h2>About this proposal</h2>
          <p className="description">{proposal.description}</p>
          <div className="facts">
            <div>
              <span>Options</span>
              <strong>
                {proposal.options.map((option) => option.label).join(" · ")}
              </strong>
            </div>
            <div>
              <span>DAO</span>
              <strong>{proposal.daoId}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{date(proposal.createdAt)}</strong>
            </div>
          </div>
        </section>
      )}

      {tab === "voting" && (
        <VotingPanel proposal={proposal} onVoteConfirmed={onChanged} />
      )}

      {tab === "members" && (
        <MemberManager proposal={proposal} readOnly={!canAdmin} />
      )}

      {tab === "documents" && (
        <section className="dashboard-card audit-card">
          <div className="card-header">
            <div>
              <h2>Documents</h2>
              <p>
                Verified proposal evidence linked to the on-chain creation
                event.
              </p>
            </div>
            <span className="info-chip">{artefacts.length} files</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type / size</th>
                  <th>Hash</th>
                  <th>Verification</th>
                  <th>Evidence ID</th>
                </tr>
              </thead>
              <tbody>
                {artefacts.map((artefact) => (
                  <tr key={artefact.evidence_id}>
                    <td>
                      <a
                        href={`/api/v1/artefacts/${encodeURIComponent(artefact.evidence_id)}/download`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {artefact.filename}
                      </a>
                    </td>
                    <td>
                      {artefact.media_type} ·{" "}
                      {(Number(artefact.byte_size) / 1024).toFixed(1)} KB
                    </td>
                    <td>
                      <CopyableHash
                        value={artefact.computed_hash ?? ""}
                        display={`${artefact.computed_hash?.slice(0, 12)}…`}
                      />
                    </td>
                    <td>
                      {artefact.verification_status} /{" "}
                      {artefact.lifecycle_state}
                    </td>
                    <td>
                      <CopyableHash
                        value={artefact.evidence_id}
                        display={`${artefact.evidence_id.slice(0, 20)}…`}
                      />
                    </td>
                  </tr>
                ))}
                {!artefacts.length && (
                  <tr>
                    <td colSpan={5}>No documents linked.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "history" && (
        <section className="dashboard-card audit-card">
          <div className="card-header">
            <div>
              <h2>Proposal audit history</h2>
              <p>Confirmed transactions recorded by the local chain index.</p>
            </div>
            <span className="info-chip">{transactions.length} events</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Wallet</th>
                  <th>Block</th>
                  <th>Gas used</th>
                  <th>Transaction</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.transactionHash}>
                    <td>
                      <strong>
                        {transaction.operation.replaceAll("_", " ")}
                      </strong>
                    </td>
                    <td>
                      <code>
                        {transaction.walletAddress.slice(0, 8)}…
                        {transaction.walletAddress.slice(-5)}
                      </code>
                    </td>
                    <td>{transaction.blockNumber}</td>
                    <td>{transaction.gasUsed}</td>
                    <td>
                      <CopyableHash
                        value={transaction.transactionHash}
                        display={`${transaction.transactionHash.slice(0, 10)}…`}
                      />
                    </td>
                    <td>{date(transaction.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
