"use client";

import { FormEvent, useState } from "react";
import { daoApi } from "@/lib/api/client";
import { useWallet } from "@/features/wallet/wallet-provider";

interface Props {
  onCreated(): void;
}
const hash = `0x${"a".repeat(64)}`;
const localDate = (minutes: number) => {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export function CreateProposalForm({ onCreated }: Props) {
  const { address } = useWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return setMessage("Connect the administrator wallet first.");
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      await daoApi.createProposal(
        {
          daoId: String(data.get("daoId")),
          title: String(data.get("title")),
          purpose: String(data.get("purpose")),
          description: String(data.get("description")),
          type: String(data.get("type")),
          optionLabels: String(data.get("options"))
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
          startsAt: new Date(String(data.get("startsAt"))).toISOString(),
          endsAt: new Date(String(data.get("endsAt"))).toISOString(),
          metadataURI: String(data.get("metadataURI")),
          metadataHash: String(data.get("metadataHash")),
        },
        address,
      );
      event.currentTarget.reset();
      setMessage(
        "Draft created. Select it below to publish and assign members.",
      );
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Creation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="create" className="panel create-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Administrator</span>
          <h2>Create a proposal</h2>
        </div>
        <span className="step-badge">Step 1</span>
      </div>
      <form onSubmit={submit} className="form-grid">
        <label>
          DAO ID
          <input name="daoId" defaultValue="cyber-dao" required />
        </label>
        <label>
          Proposal type
          <select name="type" defaultValue="STANDARD">
            <option>STANDARD</option>
            <option>TREASURY</option>
            <option>PARAMETER_CHANGE</option>
            <option>MEMBERSHIP</option>
            <option>OTHER</option>
          </select>
        </label>
        <label className="wide">
          Title
          <input
            name="title"
            placeholder="Fund a security audit"
            minLength={3}
            required
          />
        </label>
        <label className="wide">
          Purpose
          <input
            name="purpose"
            placeholder="Why this decision matters"
            minLength={3}
            required
          />
        </label>
        <label className="wide">
          Description
          <textarea
            name="description"
            placeholder="Give members enough context to vote…"
            minLength={10}
            required
          />
        </label>
        <label>
          Voting starts
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={localDate(10)}
            required
          />
        </label>
        <label>
          Voting ends
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={localDate(70)}
            required
          />
        </label>
        <label>
          Options, one per line
          <textarea
            name="options"
            defaultValue={"Approve\nReject\nAbstain"}
            required
          />
        </label>
        <label>
          Metadata URI
          <input
            name="metadataURI"
            defaultValue="ipfs://replace-with-real-cid"
            required
          />
        </label>
        <label className="wide">
          Metadata hash
          <input
            name="metadataHash"
            defaultValue={hash}
            pattern="0x[0-9a-fA-F]{64}"
            required
          />
        </label>
        <div className="wide form-actions">
          <button className="button button-primary" disabled={busy}>
            {busy ? "Creating…" : "Create draft"}
          </button>
          {message && <p className="form-message">{message}</p>}
        </div>
      </form>
    </section>
  );
}
