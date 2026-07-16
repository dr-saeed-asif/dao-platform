"use client";

import { FormEvent, useState } from "react";
import { daoApi } from "@/lib/api/client";
import { useWallet } from "@/features/wallet/wallet-provider";

interface Props {
  onCreated(): void;
}
const localDate = (minutes: number) => {
  const date = new Date(Date.now() + minutes * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export function CreateProposalForm({ onCreated }: Props) {
  const { address } = useWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [options, setOptions] = useState(["Approve", "Reject", "Abstain"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return setMessage("Connect the administrator wallet first.");
    const form = event.currentTarget;
    const data = new FormData(form);
    const members = String(data.get("members"))
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const invalidMember = members.find(
      (value) => !/^0x[0-9a-fA-F]{40}$/.test(value),
    );
    if (invalidMember) {
      return setMessage(`Invalid member wallet address: ${invalidMember}`);
    }
    if (
      new Set(members.map((value) => value.toLowerCase())).size !==
      members.length
    ) {
      return setMessage("Each initial member wallet must be unique.");
    }
    if (options.filter((value) => value.trim()).length < 2) {
      return setMessage("Add at least two non-empty voting options.");
    }
    const startDate = new Date(String(data.get("startsAt")));
    const endDate = new Date(String(data.get("endsAt")));
    if (startDate.getTime() <= Date.now() + 60_000) {
      return setMessage(
        "Voting must start at least one minute in the future. Choose a new start time.",
      );
    }
    if (endDate.getTime() <= startDate.getTime()) {
      return setMessage("Voting end time must be later than its start time.");
    }
    const startsAt = startDate.toISOString();
    const endsAt = endDate.toISOString();
    const proposalDocument = {
      schema: "cyberdao.proposal.v1",
      daoId: String(data.get("daoId")),
      title: String(data.get("title")),
      purpose: String(data.get("purpose")),
      description: String(data.get("description")),
      type: String(data.get("type")),
      options: options.map((value) => value.trim()).filter(Boolean),
      startsAt,
      endsAt,
    };
    setBusy(true);
    setMessage(null);
    try {
      const metadata = await createOnChainMetadata(proposalDocument);
      setMessage("Creating proposal draft…");
      const created = await daoApi.createProposal(
        {
          daoId: String(data.get("daoId")),
          title: String(data.get("title")),
          purpose: String(data.get("purpose")),
          description: String(data.get("description")),
          type: String(data.get("type")),
          optionLabels: options.map((value) => value.trim()).filter(Boolean),
          startsAt,
          endsAt,
          metadataURI: metadata.uri,
          metadataHash: metadata.hash,
        },
        address,
      );
      setMessage("Publishing proposal on CyberChain…");
      await daoApi.publishProposal(created.proposal.id, address);
      if (members.length) {
        setMessage(
          `Assigning ${members.length} voting member${members.length === 1 ? "" : "s"} on-chain…`,
        );
        await daoApi.assignMembers(created.proposal.id, members, address);
      }
      form.reset();
      setOptions(["Approve", "Reject", "Abstain"]);
      setMessage(
        "Proposal published and voting members assigned successfully.",
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
        <span className="step-badge">Guided setup</span>
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
            min={localDate(1)}
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
        <fieldset className="wide proposal-builder-group">
          <legend>Voting options</legend>
          <p>Add between 2 and 10 choices members can select on-chain.</p>
          <div className="builder-list">
            {options.map((option, index) => (
              <div className="builder-row" key={index}>
                <span>{index + 1}</span>
                <input
                  aria-label={`Voting option ${index + 1}`}
                  value={option}
                  minLength={1}
                  required
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((value, itemIndex) =>
                        itemIndex === index ? event.target.value : value,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="builder-remove"
                  disabled={options.length <= 2}
                  onClick={() =>
                    setOptions((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={options.length >= 10}
            onClick={() => setOptions((current) => [...current, ""])}
          >
            Add voting option
          </button>
        </fieldset>
        <label className="wide">
          Initial voting members
          <textarea name="members" placeholder={"0x1234…\n0xabcd…"} />
          <small>
            Enter wallet addresses separated by a new line, space, or comma.
            They are assigned on-chain immediately after publishing.
          </small>
        </label>
        <div className="wide metadata-notice">
          <strong>Verifiable proposal metadata</strong>
          <p>
            The complete proposal document is encoded into its on-chain metadata
            URI and protected by a SHA-256 hash. Voting assignments and ballots
            are recorded as separate contract events.
          </p>
        </div>
        <div className="wide form-actions">
          <button className="button button-primary" disabled={busy}>
            {busy ? "Publishing workflow…" : "Create, publish & assign members"}
          </button>
          {message && <p className="form-message">{message}</p>}
        </div>
      </form>
    </section>
  );
}

async function createOnChainMetadata(document: Record<string, unknown>) {
  const json = JSON.stringify(document);
  const bytes = new TextEncoder().encode(json);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = `0x${Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return {
    hash,
    uri: `data:application/json;base64,${btoa(binary)}`,
  };
}
