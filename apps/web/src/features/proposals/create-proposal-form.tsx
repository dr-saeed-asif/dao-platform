"use client";

import { useRef, useState } from "react";
import { daoApi } from "@/lib/api/client";
import {
  browserTimeZone,
  formatLocalDateTime,
  futureLocalDateTimeInput,
  localDateTimeInputToUtc,
} from "@/lib/date-time";
import { useWallet } from "@/features/wallet/wallet-provider";

interface Props {
  onCreated(): void;
  onCancel?(): void;
  canAdmin?: boolean;
}

const steps = [
  "Basic Info",
  "Documents",
  "Voting Setup",
  "Members",
  "Review & Publish",
] as const;

const fileSig = (list: File[]) =>
  list.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");

const parseMembers = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

export function CreateProposalWizard({
  onCreated,
  onCancel,
  canAdmin = true,
}: Props) {
  const { address } = useWallet();

  // Step state
  const [step, setStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  // Form state (controlled; same fields as the previous single-page form)
  const [daoId, setDaoId] = useState("cyber-dao");
  const [proposalType, setProposalType] = useState("STANDARD");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [startsAtInput, setStartsAtInput] = useState(() => futureLocalDateTimeInput(10));
  const [endsAtInput, setEndsAtInput] = useState(() => futureLocalDateTimeInput(70));
  const [options, setOptions] = useState(["Approve", "Reject", "Abstain"]);
  const [membersText, setMembersText] = useState("");

  // Background document indexing (non-blocking)
  const [stagingStatus, setStagingStatus] = useState<
    "idle" | "working" | "ready" | "failed"
  >("idle");
  const [stagingNote, setStagingNote] = useState<string | null>(null);
  const [stagedIds, setStagedIds] = useState<string[]>([]);
  const [stagedSig, setStagedSig] = useState("");
  const stagingRun = useRef(0);

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishDone, setPublishDone] = useState(false);

  function setFileList(next: File[]) {
    setFiles(next);
    // Previously staged evidence no longer matches; re-stage in background.
    setStagedIds([]);
    setStagedSig("");
    setStagingStatus("idle");
    setStagingNote(null);
  }

  async function stageInBackground(list: File[]) {
    if (!list.length) {
      setStagedIds([]);
      setStagedSig("");
      setStagingStatus("idle");
      setStagingNote(null);
      return;
    }
    const run = ++stagingRun.current;
    const sig = fileSig(list);
    setStagingStatus("working");
    setStagingNote(
      `Indexing ${list.length} document${list.length === 1 ? "" : "s"} in the background… you can continue.`,
    );
    try {
      const staged = await daoApi.stageArtefacts(list);
      if (stagingRun.current !== run) return;
      setStagedIds(staged.items.map((item) => item.evidence_id));
      setStagedSig(sig);
      setStagingStatus("ready");
      setStagingNote(
        `${staged.items.length} document${staged.items.length === 1 ? "" : "s"} indexed and ready.`,
      );
    } catch (error) {
      if (stagingRun.current !== run) return;
      setStagingStatus("failed");
      setStagedIds([]);
      setStagedSig("");
      setStagingNote(
        error instanceof Error
          ? `Background indexing failed: ${error.message}. It will retry at publish time.`
          : "Background indexing failed. It will retry at publish time.",
      );
    }
  }

  function validateStep(target: number): string | null {
    if (target === 0) {
      if (!daoId.trim()) return "DAO ID is required.";
      if (title.trim().length < 3)
        return "Title must be at least 3 characters.";
      if (purpose.trim().length < 3)
        return "Purpose must be at least 3 characters.";
      if (description.trim().length < 10)
        return "Description must be at least 10 characters.";
      return null;
    }
    if (target === 1) {
      if (files.length > 10)
        return "Attach up to 10 files.";
      const bad = files.find(
        (file) =>
          !/\.(pdf|txt|md|json)$/i.test(file.name) ||
          file.size === 0 ||
          file.size > 10_485_760,
      );
      if (bad)
        return "Attach up to 10 non-empty PDF, TXT, MD, or JSON files, at most 10 MB each.";
      return null;
    }
    if (target === 2) {
      if (options.map((value) => value.trim()).filter(Boolean).length < 2)
        return "Add at least two non-empty voting options.";
      if (options.length > 10) return "Add at most 10 voting options.";
      const startDate = new Date(startsAtInput);
      const endDate = new Date(endsAtInput);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
        return "Choose valid voting start and end times.";
      if (startDate.getTime() <= Date.now() + 60_000)
        return "Voting must start at least one minute in the future. Choose a new start time.";
      if (endDate.getTime() <= startDate.getTime())
        return "Voting end time must be later than its start time.";
      return null;
    }
    if (target === 3) {
      const members = parseMembers(membersText);
      const invalidMember = members.find(
        (value) => !/^0x[0-9a-fA-F]{40}$/.test(value),
      );
      if (invalidMember)
        return `Invalid member wallet address: ${invalidMember}`;
      if (
        new Set(members.map((value) => value.toLowerCase())).size !==
        members.length
      )
        return "Each initial member wallet must be unique.";
      return null;
    }
    return null;
  }

  function goNext() {
    const problem = validateStep(step);
    if (problem) return setStepError(problem);
    setStepError(null);
    // Kick off background PDF indexing when leaving the Documents step.
    if (step === 1 && files.length && stagingStatus === "idle") {
      void stageInBackground(files);
    }
    const next = Math.min(step + 1, steps.length - 1);
    setStep(next);
    setMaxVisited((current) => Math.max(current, next));
  }

  function goTo(target: number) {
    if (target <= maxVisited) {
      setStepError(null);
      setStep(target);
    }
  }

  async function publish() {
    if (!address) {
      setPublishError("Connect the administrator wallet first.");
      return;
    }
    for (let index = 0; index < 4; index += 1) {
      const problem = validateStep(index);
      if (problem) {
        setStep(index);
        setStepError(problem);
        return;
      }
    }
    const members = parseMembers(membersText);
    const cleanOptions = options.map((value) => value.trim()).filter(Boolean);
    const startsAt = localDateTimeInputToUtc(startsAtInput);
    const endsAt = localDateTimeInputToUtc(endsAtInput);

    setPublishing(true);
    setPublishError(null);
    setProgress(null);
    let evidenceIds: string[] = [];
    let published = false;
    try {
      // Reuse background-indexed documents when they are still current.
      if (files.length) {
        if (
          stagingStatus === "ready" &&
          stagedSig === fileSig(files) &&
          stagedIds.length
        ) {
          evidenceIds = stagedIds;
        } else {
          setProgress(
            `Staging ${files.length} document${files.length === 1 ? "" : "s"}…`,
          );
          const staged = await daoApi.stageArtefacts(files);
          evidenceIds = staged.items.map((item) => item.evidence_id);
        }
      }
      setProgress("Creating proposal metadata…");
      const metadata = await daoApi.createManifest({
        daoId,
        title,
        purpose,
        description,
        proposalType,
        options: cleanOptions,
        startsAt,
        endsAt,
        evidenceIds,
      });
      setProgress("Creating proposal draft…");
      const created = await daoApi.createProposal(
        {
          daoId,
          title,
          purpose,
          description,
          type: proposalType,
          optionLabels: cleanOptions,
          startsAt,
          endsAt,
          metadataURI: metadata.metadataURI,
          metadataHash: metadata.metadataHash,
        },
        address,
      );
      if (evidenceIds.length)
        await daoApi.setArtefactState(evidenceIds, "PENDING_CHAIN");
      setProgress("Publishing proposal on CyberChain…");
      const publication = await daoApi.publishProposal(created.proposal.id, address);
      published = true;
      setProgress(
        `Waiting for ProposalCreated and indexing ${publication.transactionHash}…`,
      );
      let indexed = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        await daoApi.syncGovernance(address);
        const proposal = await daoApi.getProposal(created.proposal.id);
        if (proposal.onChainId) {
          indexed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!indexed)
        throw new Error(
          `Transaction ${publication.transactionHash} confirmed; creation is awaiting indexing. Documents remain pending.`,
        );
      if (evidenceIds.length) {
        setProgress("Verifying and linking proposal documents…");
        await daoApi.linkArtefacts(created.proposal.id, evidenceIds);
      }
      if (members.length) {
        setProgress(
          `Assigning ${members.length} voting member${members.length === 1 ? "" : "s"} on-chain…`,
        );
        await daoApi.assignMembers(created.proposal.id, members, address);
      }
      setProgress(null);
      setPublishDone(true);
      onCreated();
    } catch (error) {
      if (evidenceIds.length && !published)
        await daoApi
          .setArtefactState(evidenceIds, "FAILED")
          .catch(() => undefined);
      setPublishError(
        error instanceof Error ? error.message : "Creation failed.",
      );
    } finally {
      setPublishing(false);
    }
  }

  function resetWizard() {
    setStep(0);
    setMaxVisited(0);
    setStepError(null);
    setDaoId("cyber-dao");
    setProposalType("STANDARD");
    setTitle("");
    setPurpose("");
    setDescription("");
    setFileList([]);
    setStartsAtInput(futureLocalDateTimeInput(10));
    setEndsAtInput(futureLocalDateTimeInput(70));
    setOptions(["Approve", "Reject", "Abstain"]);
    setMembersText("");
    setPublishError(null);
    setProgress(null);
    setPublishDone(false);
  }

  if (publishDone) {
    return (
      <section className="panel create-panel">
        <div className="wizard-success">
          <span className="wizard-success-icon">✓</span>
          <span className="eyebrow">Published</span>
          <h2>Proposal published successfully</h2>
          <p>
            The proposal is confirmed on-chain and voting members have been
            assigned. It now appears in the proposals list.
          </p>
          <div className="wizard-actions">
            <button className="button button-secondary" onClick={onCreated}>
              Back to proposals
            </button>
            <button className="button button-primary" onClick={resetWizard}>
              Create another
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel create-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Administrator</span>
          <h2>Create a proposal</h2>
        </div>
        {onCancel ? (
          <button
            type="button"
            className="btn-create wizard-back"
            onClick={onCancel}
            disabled={publishing}
          >
            ← Back to proposals
          </button>
        ) : (
          <span className="step-badge">
            Step {step + 1} of {steps.length}
          </span>
        )}
      </div>

      <div className="wizard-steps-row">
        <ol className="wizard-steps">
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className={
                  index === step
                    ? "wizard-step current"
                    : index < step || index <= maxVisited
                      ? "wizard-step visited"
                      : "wizard-step"
                }
                onClick={() => goTo(index)}
                disabled={index > maxVisited}
              >
                <span className="wizard-step-num">{index + 1}</span> {label}
              </button>
            </li>
          ))}
        </ol>
        <span className="step-badge wizard-step-counter">
          Step {step + 1} of {steps.length}
        </span>
      </div>

      {!canAdmin && (
        <p className="metadata-notice">
          <strong>Administrator only.</strong> Connect the administrator wallet
          to publish. You can still preview each step.
        </p>
      )}

      {step === 0 && (
        <div className="form-grid">
          <label>
            DAO ID
            <input
              value={daoId}
              onChange={(event) => setDaoId(event.target.value)}
              required
            />
          </label>
          <label>
            Proposal type
            <select
              value={proposalType}
              onChange={(event) => setProposalType(event.target.value)}
            >
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
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Fund a security audit"
              minLength={3}
              required
            />
          </label>
          <label className="wide">
            Purpose
            <input
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Why this decision matters"
              minLength={3}
              required
            />
          </label>
          <label className="wide">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Give members enough context to vote…"
              minLength={10}
              required
            />
          </label>
        </div>
      )}

      {step === 1 && (
        <div>
          <fieldset
            className="proposal-builder-group"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setFileList([
                ...files,
                ...Array.from(event.dataTransfer.files),
              ]);
            }}
          >
            <legend>Proposal documents</legend>
            <p>
              Drop PDF, TXT, Markdown, or JSON files here, or browse. Up to 10
              files. Indexing runs in the background and will not block you.
            </p>
            <input
              type="file"
              multiple
              accept=".pdf,.txt,.md,.json,application/pdf,text/plain,text/markdown,application/json"
              onChange={(event) =>
                setFileList(Array.from(event.target.files ?? []))
              }
            />
            <div className="builder-list">
              {files.map((file, index) => (
                <div
                  className="builder-row"
                  key={`${file.name}-${file.lastModified}`}
                >
                  <span>{index + 1}</span>
                  <strong>{file.name}</strong>
                  <small>
                    {file.type || "unknown"} · {(file.size / 1024).toFixed(1)}{" "}
                    KB
                  </small>
                  <button
                    type="button"
                    className="builder-remove"
                    onClick={() =>
                      setFileList(files.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
          {stagingNote && (
            <p
              className={
                stagingStatus === "failed"
                  ? "form-message text-danger"
                  : "form-message"
              }
            >
              {stagingStatus === "working" ? "⏳ " : ""}
              {stagingNote}
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="form-grid">
          <label>
            Voting starts ({browserTimeZone()})
            <input
              type="datetime-local"
              value={startsAtInput}
              min={futureLocalDateTimeInput(1)}
              onChange={(event) => setStartsAtInput(event.target.value)}
              required
            />
          </label>
          <label>
            Voting ends ({browserTimeZone()})
            <input
              type="datetime-local"
              value={endsAtInput}
              onChange={(event) => setEndsAtInput(event.target.value)}
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
        </div>
      )}

      {step === 3 && (
        <div className="form-grid">
          <label className="wide">
            Initial voting members
            <textarea
              value={membersText}
              onChange={(event) => setMembersText(event.target.value)}
              placeholder={"0x1234…\n0xabcd…"}
            />
            <small>
              Enter wallet addresses separated by a new line, space, or comma.
              They are assigned on-chain immediately after publishing.
              {parseMembers(membersText).length > 0 &&
                ` (${parseMembers(membersText).length} address${parseMembers(membersText).length === 1 ? "" : "es"} detected)`}
            </small>
          </label>
          <div className="wide metadata-notice">
            <strong>Member assignment</strong>
            <p>
              Members are assigned on-chain right after the proposal is
              published, before voting starts.
            </p>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div className="wizard-review">
            <div>
              <span>Title</span>
              <strong>{title || "—"}</strong>
            </div>
            <div>
              <span>Type / DAO</span>
              <strong>
                {proposalType} · {daoId}
              </strong>
            </div>
            <div>
              <span>Voting period</span>
              <strong>
                {formatLocalDateTime(startsAtInput)} → {formatLocalDateTime(endsAtInput)}
              </strong>
              <small>
                Stored as {localDateTimeInputToUtc(startsAtInput)} → {localDateTimeInputToUtc(endsAtInput)} UTC
              </small>
            </div>
            <div>
              <span>Options</span>
              <strong>
                {options
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </strong>
            </div>
            <div>
              <span>Members</span>
              <strong>
                {parseMembers(membersText).length
                  ? `${parseMembers(membersText).length} address${parseMembers(membersText).length === 1 ? "" : "es"}`
                  : "None"}
              </strong>
            </div>
            <div>
              <span>Documents</span>
              <strong>
                {files.length
                  ? `${files.length} file${files.length === 1 ? "" : "s"} (${stagingStatus === "ready" ? "indexed" : stagingStatus === "working" ? "indexing…" : "will index at publish"})`
                  : "None"}
              </strong>
            </div>
          </div>
          <div className="metadata-notice">
            <strong>Verifiable proposal metadata</strong>
            <p>
              The complete proposal document is encoded into its on-chain
              metadata URI and protected by a SHA-256 hash. The blockchain
              transaction must complete before success is shown.
            </p>
          </div>
          {progress && <p className="form-message">⏳ {progress}</p>}
          {publishError && (
            <p className="form-message text-danger">{publishError}</p>
          )}
        </div>
      )}

      {stepError && (
        <p className="form-message text-danger">{stepError}</p>
      )}

      <div className="wizard-actions">
        {onCancel && (
          <button
            type="button"
            className="button button-ghost"
            onClick={onCancel}
            disabled={publishing}
          >
            Cancel
          </button>
        )}
        {step > 0 && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setStepError(null);
              setStep(step - 1);
            }}
            disabled={publishing}
          >
            Back
          </button>
        )}
        {step < steps.length - 1 && (
          <button
            type="button"
            className="button button-primary"
            onClick={goNext}
            disabled={publishing}
          >
            Continue
          </button>
        )}
        {step === steps.length - 1 && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => void publish()}
            disabled={publishing || !canAdmin}
            title={
              canAdmin
                ? "Publish on-chain"
                : "Connect the administrator wallet to publish"
            }
          >
            {publishing ? "Publishing…" : "Create, publish & assign members"}
          </button>
        )}
      </div>
    </section>
  );
}
