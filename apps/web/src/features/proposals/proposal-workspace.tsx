"use client";

import { useEffect, useState } from "react";
import type { Artefact, Proposal } from "@/lib/api/types";
import { daoApi } from "@/lib/api/client";
import { useWallet } from "@/features/wallet/wallet-provider";
import { MemberManager } from "@/features/members/member-manager";
import { VotingPanel } from "@/features/voting/voting-panel";
import type { ChainTransaction } from "@/lib/api/types";
import { CopyableHash } from "@/components/copy-value-button";

const date = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function ProposalWorkspace({
  proposal,
  onChanged,
  canAdmin = false,
}: {
  proposal: Proposal;
  onChanged(): void;
  canAdmin?: boolean;
}) {
  const { address } = useWallet();
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
        <MemberManager proposal={proposal} readOnly={!canAdmin} />
        <VotingPanel proposal={proposal} onVoteConfirmed={onChanged} />
      </div>
      <section className="dashboard-card audit-card">
        <div className="card-header"><div><h2>Documents</h2><p>Verified proposal evidence linked to the on-chain creation event.</p></div><span className="info-chip">{artefacts.length} files</span></div>
        <div className="table-wrap"><table><thead><tr><th>File</th><th>Type / size</th><th>Hash</th><th>Verification</th><th>Evidence ID</th></tr></thead><tbody>
          {artefacts.map((artefact) => <tr key={artefact.evidence_id}><td><a href={`/api/v1/artefacts/${encodeURIComponent(artefact.evidence_id)}/download`} target="_blank" rel="noreferrer">{artefact.filename}</a></td><td>{artefact.media_type} · {(Number(artefact.byte_size) / 1024).toFixed(1)} KB</td><td><CopyableHash value={artefact.computed_hash ?? ""} display={`${artefact.computed_hash?.slice(0,12)}…`} /></td><td>{artefact.verification_status} / {artefact.lifecycle_state}</td><td><CopyableHash value={artefact.evidence_id} display={`${artefact.evidence_id.slice(0,20)}…`} /></td></tr>)}
          {!artefacts.length && <tr><td colSpan={5}>No documents linked.</td></tr>}
        </tbody></table></div>
      </section>
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
    </section>
  );
}
