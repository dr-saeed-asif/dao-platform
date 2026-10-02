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
  const { address, submit: submitTransaction } = useWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [options, setOptions] = useState(["Approve", "Reject", "Abstain"]);
  const [files, setFiles] = useState<File[]>([]);
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
    if (files.length > 10 || files.some(file => !/\.(pdf|txt|md|json)$/i.test(file.name) || file.size === 0 || file.size > 10_485_760)) {
      return setMessage("Attach up to 10 non-empty PDF, TXT, MD, or JSON files, at most 10 MB each.");
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
    setBusy(true);
    setMessage(null);
    let evidenceIds: string[] = [];
    let published = false;
    try {
      if (files.length) {
        setMessage(`Staging ${files.length} document${files.length === 1 ? "" : "s"}…`);
        const staged = await daoApi.stageArtefacts(files);
        evidenceIds = staged.items.map((item) => item.evidence_id);
      }
      const cleanOptions = options.map((value) => value.trim()).filter(Boolean);
      const metadata = await daoApi.createManifest({
        daoId:String(data.get("daoId")), title:String(data.get("title")), purpose:String(data.get("purpose")), description:String(data.get("description")),
        proposalType:String(data.get("type")), options:cleanOptions, startsAt, endsAt, evidenceIds,
      });
      setMessage("Creating proposal draft…");
      const created = await daoApi.createProposal(
        {
          daoId: String(data.get("daoId")),
          title: String(data.get("title")),
          purpose: String(data.get("purpose")),
          description: String(data.get("description")),
          type: String(data.get("type")),
          optionLabels: cleanOptions,
          startsAt,
          endsAt,
          metadataURI: metadata.metadataURI,
          metadataHash: metadata.metadataHash,
        },
        address,
      );
      if (evidenceIds.length) await daoApi.setArtefactState(evidenceIds, "PENDING_CHAIN");
      setMessage("Confirm proposal creation in your wallet…");
      const transactionHash = await submitTransaction(created.transaction);
      published = true;
      setMessage(`Waiting for ProposalCreated and indexing ${transactionHash}…`);
      let indexed = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        await daoApi.syncGovernance(address);
        const proposal = await daoApi.getProposal(created.proposal.id);
        if (proposal.onChainId) { indexed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 2_000));
      }
      if (!indexed) throw new Error(`Transaction ${transactionHash} submitted; creation is awaiting indexing. Documents remain pending.`);
      if (evidenceIds.length) {
        setMessage("Verifying and linking proposal documents…");
        await daoApi.linkArtefacts(created.proposal.id, evidenceIds);
      }
      if (members.length) {
        setMessage(
          `Assigning ${members.length} voting member${members.length === 1 ? "" : "s"} on-chain…`,
        );
        await daoApi.assignMembers(created.proposal.id, members, address);
      }
      form.reset();
      setOptions(["Approve", "Reject", "Abstain"]);
      setFiles([]);
      setMessage(
        "Proposal published and voting members assigned successfully.",
      );
      onCreated();
    } catch (error) {
      if (evidenceIds.length && !published) await daoApi.setArtefactState(evidenceIds, "FAILED").catch(() => undefined);
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
        <fieldset
          className="wide proposal-builder-group"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); setFiles((current) => [...current, ...Array.from(event.dataTransfer.files)]); }}
        >
          <legend>Proposal documents</legend>
          <p>Drop PDF, TXT, Markdown, or JSON files here, or browse. Up to 10 files.</p>
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.md,.json,application/pdf,text/plain,text/markdown,application/json"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <div className="builder-list">
            {files.map((file, index) => (
              <div className="builder-row" key={`${file.name}-${file.lastModified}`}>
                <span>{index + 1}</span><strong>{file.name}</strong><small>{file.type || "unknown"} · {(file.size / 1024).toFixed(1)} KB</small>
                <button type="button" className="builder-remove" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
              </div>
            ))}
          </div>
        </fieldset>
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
