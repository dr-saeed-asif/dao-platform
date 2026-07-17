"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, daoApi } from "@/lib/api/client";
import type { Proposal, Vote } from "@/lib/api/types";
import { useWallet } from "@/features/wallet/wallet-provider";
import { CopyableHash } from "@/components/copy-value-button";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function VotingPanel({
  proposal,
  onVoteConfirmed,
}: {
  proposal: Proposal;
  onVoteConfirmed?(): void;
}) {
  const { address, connection, submit } = useWallet();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const load = useCallback(
    async () => setVotes(await daoApi.listVotes(proposal.id)),
    [proposal.id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const counts = useMemo(
    () =>
      proposal.options.map(
        (option) =>
          votes.filter((vote) => vote.optionIndex === option.index).length,
      ),
    [proposal.options, votes],
  );
  async function castVote() {
    if (!address)
      return setMessage("Connect the assigned member wallet first.");
    setBusy(true);
    setConfirmOpen(false);
    setTransactionHash(null);
    setMessage("Preparing your vote…");
    try {
      const prepared = await daoApi.prepareVote(proposal.id, selected, address);
      setMessage("Confirm the transaction in your wallet…");
      const hash = await submit(prepared);
      setTransactionHash(hash);
      setMessage(`Submitted ${hash.slice(0, 10)}… Waiting for confirmation.`);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await wait(3_000);
        try {
          await daoApi.confirmVote(proposal.id, hash, address);
          await load();
          onVoteConfirmed?.();
          setMessage("Your vote is confirmed and indexed.");
          return;
        } catch (error) {
          if (
            !(error instanceof ApiError) ||
            error.code !== "TRANSACTION_NOT_CONFIRMED"
          )
            throw error;
        }
      }
      setMessage(
        "The transaction is still pending. The background indexer will pick it up.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Voting failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workflow-card">
      <div className="card-title">
        <div>
          <span className="eyebrow">Ballot</span>
          <h3>Cast your vote</h3>
        </div>
        <span className="count">{votes.length}</span>
      </div>
      <div className="ballot-options">
        {proposal.options.map((option, index) => (
          <label
            className={selected === option.index ? "ballot selected" : "ballot"}
            key={option.index}
          >
            <input
              type="radio"
              name="vote"
              checked={selected === option.index}
              onChange={() => setSelected(option.index)}
            />
            <span>{option.label}</span>
            <strong>{counts[index]}</strong>
          </label>
        ))}
      </div>
      <button
        className="button button-accent full"
        disabled={busy || !proposal.onChainId}
        onClick={() =>
          address
            ? setConfirmOpen(true)
            : setMessage("Connect the assigned member wallet first.")
        }
      >
        {busy ? "Processing vote…" : "Sign & cast vote"}
      </button>
      <p className="hint">
        The member wallet signs directly. Private keys never reach the DAO API.
      </p>
      {message && <p className="form-message">{message}</p>}
      {transactionHash && (
        <div className="transaction-result">
          <span>Transaction</span>
          <CopyableHash value={transactionHash} />
        </div>
      )}
      {confirmOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setConfirmOpen(false)}
        >
          <div
            className="modal confirm-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">Confirm ballot</span>
                <h2>Review your vote</h2>
              </div>
              <button
                className="modal-close"
                onClick={() => setConfirmOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="confirmation-summary">
              <span>
                <small>Proposal</small>
                <strong>{proposal.title}</strong>
              </span>
              <span>
                <small>Selected option</small>
                <strong>
                  {
                    proposal.options.find((option) => option.index === selected)
                      ?.label
                  }
                </strong>
              </span>
              <span>
                <small>Connected wallet</small>
                <code>{address}</code>
              </span>
              <span>
                <small>Network</small>
                <strong>{connection?.networkName ?? "CyberChain"}</strong>
              </span>
            </div>
            <div className="modal-actions">
              <button
                className="button button-ghost"
                onClick={() => setConfirmOpen(false)}
              >
                Go back
              </button>
              <button
                className="button button-primary"
                onClick={() => void castVote()}
              >
                Confirm & sign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
