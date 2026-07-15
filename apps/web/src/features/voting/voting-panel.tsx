"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, daoApi } from "@/lib/api/client";
import type { Proposal, Vote } from "@/lib/api/types";
import { submitPreparedTransaction } from "@/lib/wallet/injected-wallet";
import { useWallet } from "@/features/wallet/wallet-provider";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function VotingPanel({ proposal }: { proposal: Proposal }) {
  const { address } = useWallet();
  const [votes, setVotes] = useState<Vote[]>([]);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    setMessage("Preparing your vote…");
    try {
      const prepared = await daoApi.prepareVote(proposal.id, selected, address);
      setMessage("Confirm the transaction in your wallet…");
      const hash = await submitPreparedTransaction(prepared);
      setMessage(`Submitted ${hash.slice(0, 10)}… Waiting for confirmation.`);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await wait(3_000);
        try {
          await daoApi.confirmVote(proposal.id, hash, address);
          await load();
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
        onClick={() => void castVote()}
      >
        {busy ? "Processing vote…" : "Sign & cast vote"}
      </button>
      <p className="hint">
        The member wallet signs directly. Private keys never reach the DAO API.
      </p>
      {message && <p className="form-message">{message}</p>}
    </div>
  );
}
