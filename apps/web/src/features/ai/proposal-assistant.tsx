"use client";
import { useEffect, useRef, useState } from "react";
import {
  ExecutionDetails,
  BlockchainPanel,
  exportExecutionMetrics,
} from "./execution-details";
import { useWallet } from "@/features/wallet/wallet-provider";
import {
  assistantJson,
  signInAssistant,
  streamAssistant,
  type AssistantResult,
  type Conversation,
  type Message,
  type ProposalDocuments,
  type BlockchainVerification,
  type ExecutionSpan,
} from "@/lib/api/assistant";

export function ProposalAssistant({
  proposalId,
  daoId,
  title,
}: {
  proposalId: string;
  daoId?: string;
  title: string;
}) {
  const { address, connection } = useWallet();
  const walletKind = connection?.kind;
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [questions, setQuestions] = useState([""]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [results, setResults] = useState<AssistantResult[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [verification, setVerification] = useState<BlockchainVerification>();
  const [verifying, setVerifying] = useState(false);
  const [documents, setDocuments] = useState<ProposalDocuments>();
  const abort = useRef<AbortController | null>(null);
  const query = `proposalId=${encodeURIComponent(proposalId)}`;
  useEffect(() => {
    setReady(false);
    setConversation(undefined);
    setMessages([]);
    setResults([]);
    setError("");
    setStatus("");
    setDocuments(undefined);
    setVerification(undefined);
    setConversations([]);
    let active = true;
    if (address && walletKind) {
      setBusy(true);
      void signInAssistant(address, walletKind)
        .then(() =>
          assistantJson<Conversation[]>(`/conversations?${query}`, address),
        )
        .then((saved) => {
          if (active) {
            setConversations(saved);
            setReady(true);
          }
        })
        .catch((value) => {
          if (active) setError(explain(value));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    } else setBusy(false);
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [proposalId, address, walletKind, query]);
  async function refresh() {
    if (address)
      setConversations(
        await assistantJson<Conversation[]>(`/conversations?${query}`, address),
      );
  }
  async function login() {
    if (!address) return setError("Connect your wallet first.");
    setBusy(true);
    setError("");
    try {
      await signInAssistant(address, walletKind);
      await refresh();
      setReady(true);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    if (!address) return;
    setBusy(true);
    setError("");
    try {
      await assistantJson(`/conversations/${id}?${query}`, address);
      const saved = await assistantJson<Message[]>(
        `/conversations/${id}/messages?${query}`,
        address,
      );
      setMessages(saved);
      setConversation(id);
      setResults([]);
      setStatus("");
      setProgress({});
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!address) return;
    setBusy(true);
    setError("");
    try {
      const saved = await assistantJson<Conversation>(
        "/conversations",
        address,
        { proposalId, title: `AI · ${title}`.slice(0, 200) },
      );
      setConversation(saved.id);
      setMessages([]);
      setResults([]);
      setStatus("");
      setProgress({});
      await refresh();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!address || busy) return;
    const submitted = questions.map((q) => q.trim()).filter(Boolean);
    if (!submitted.length) return setError("Enter at least one question.");
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setStatus("Processing");
    setProgress({});
    if (results.length)
      setMessages((old) => [
        ...old,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          metadata: { results },
        },
      ]);
    setMessages((old) => [
      ...old,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: submitted.join("\n"),
        metadata: {},
      },
    ]);
    setResults(
      submitted.map((question, i) => ({
        question_id: `q${i + 1}`,
        question,
        agent: "",
        status: "processing",
        citations: [],
        cited_sources: [],
        errors: [],
      })),
    );
    try {
      await streamAssistant(
        address,
        {
          proposalId,
          question: submitted,
          conversation_id: conversation,
          title: `AI · ${title}`.slice(0, 200),
        },
        controller.signal,
        (event) => {
          if (event.conversation_id) setConversation(event.conversation_id);
          const data = event.data ?? {};
          if (event.event === "execution_update" && event.question_id) {
            setResults((old) =>
              old.map((r) => {
                if (r.question_id !== event.question_id) return r;
                const row = data as unknown as ExecutionSpan;
                const trace = [
                  ...(r.execution?.trace ?? []).filter(
                    (s) => s.span_id !== row.span_id,
                  ),
                  row,
                ];
                return { ...r, execution: { ...r.execution, trace } };
              }),
            );
          }
          if (event.event === "question_start" && event.question_id)
            setProgress((old) => ({
              ...old,
              [event.question_id!]: `${data.agent ?? "Agent"} processing`,
            }));
          if (event.event === "question_error" && event.question_id) {
            setProgress((old) => ({ ...old, [event.question_id!]: "Failed" }));
            setResults((old) =>
              old.map((r) =>
                r.question_id === event.question_id
                  ? {
                      ...r,
                      status: "failed",
                      errors: [String(data.error ?? "Question failed.")],
                    }
                  : r,
              ),
            );
          }
          if (event.event === "question_complete" && event.question_id) {
            setProgress((old) => ({
              ...old,
              [event.question_id!]: "Completed",
            }));
            setResults((old) =>
              old.map((r) =>
                r.question_id === event.question_id
                  ? ({ ...r, ...data, status: "completed" } as AssistantResult)
                  : r,
              ),
            );
          }
          if (event.event === "run_complete") {
            if (event.results) setResults(event.results);
            setStatus(event.status ?? String(data.status ?? "Completed"));
          }
        },
      );
      setQuestions([""]);
      await refresh();
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Request stopped. Reopen the conversation to check saved results."
          : explain(e),
      );
      setStatus("Failed");
      setResults((old) =>
        old.map((r) =>
          r.status === "processing"
            ? { ...r, status: "failed", errors: ["Request did not complete."] }
            : r,
        ),
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  return (
    <section
      className="dashboard-card padded proposal-assistant"
      aria-label="Proposal AI Assistant"
    >
      <div className="card-header">
        <div>
          <h2>Proposal AI Assistant</h2>
          <p>
            {title} · {daoId ?? "DAO scope verified by server"}
          </p>
        </div>
        <span className="info-chip">LangGraph</span>
      </div>
      {!ready ? (
        <p role="status">
          {busy
            ? "Preparing assistant..."
            : error
              ? "Assistant is unavailable."
              : "Open the assistant from your active DAO session."}
        </p>
      ) : (
        <>
          <div className="assistant-toolbar">
            <label>
              Saved conversations
              <select
                aria-label="Saved conversations"
                value={conversation ?? ""}
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) void open(e.target.value);
                }}
              >
                <option value="">Select conversation</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title ?? c.id} ·{" "}
                    {new Date(c.updated_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => void create()}
            >
              New conversation
            </button>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => {
                if (address)
                  void assistantJson<ProposalDocuments>(
                    `/proposals/${encodeURIComponent(proposalId)}/documents`,
                    address,
                  )
                    .then(setDocuments)
                    .catch((e) => setError(explain(e)));
              }}
            >
              Proposal evidence
            </button>
          </div>
          <div className="assistant-toolbar">
            <button
              className="button button-secondary"
              disabled={verifying || busy}
              onClick={() => {
                if (!address) return;
                setVerifying(true);
                setError("");
                void assistantJson<BlockchainVerification>(
                  `/proposals/${encodeURIComponent(proposalId)}/verification`,
                  address,
                )
                  .then(setVerification)
                  .catch((e) => setError(explain(e)))
                  .finally(() => setVerifying(false));
              }}
            >
              {verifying ? "Verifying blockchain..." : "On-Chain Verification"}
            </button>
            {(["json", "csv"] as const).map((format) => (
              <button
                key={format}
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  if (address)
                    void exportExecutionMetrics(
                      proposalId,
                      address,
                      format,
                    ).catch((e) => setError(explain(e)));
                }}
              >
                Export metrics ({format.toUpperCase()})
              </button>
            ))}
          </div>
          {verification && <BlockchainPanel report={verification} />}
          {documents !== undefined && (
            <details open>
              <summary>Available proposal documents</summary>
              {!documents.linked_artefacts.length && (
                <p>
                  No documents are linked to this proposal. AI can still use
                  available proposal records.
                </p>
              )}
              {documents.linked_artefacts.map((document) => (
                <article key={document.evidence_id}>
                  <strong>{document.filename}</strong>
                  <p>
                    {document.verification_status} · {document.lifecycle_state}{" "}
                    ·{" "}
                    {documents.indexed_documents.some(
                      (index) =>
                        index.artefact_evidence_id === document.evidence_id,
                    )
                      ? "Indexed for AI"
                      : "Not indexed for AI"}
                  </p>
                  <small>Evidence ID: {document.evidence_id}</small>
                </article>
              ))}
            </details>
          )}
          <div
            className="assistant-transcript"
            aria-label="Conversation messages"
          >
            {messages.map((m) => (
              <article key={m.id}>
                <strong>{m.role === "user" ? "You" : "Assistant"}</strong>
                {m.metadata.results ? (
                  <Answers results={m.metadata.results} />
                ) : (
                  <p className="assistant-text">{m.content}</p>
                )}
              </article>
            ))}
            <Answers results={results} />
          </div>
          <p role="status" aria-live="polite">
            {status.replaceAll("_", " ")}
            {busy && Object.keys(progress).length > 0
              ? ` · ${Object.entries(progress)
                  .map(([q, s]) => `${q}: ${s}`)
                  .join(" · ")}`
              : ""}
          </p>
          <form className="ai-form" onSubmit={(e) => void send(e)}>
            <p>
              Ask a question or add up to 20 questions. Related questions use
              the same conversation context.
            </p>
            {questions.map((q, i) => (
              <label key={i}>
                Question {i + 1}
                <textarea
                  aria-label={`Question ${i + 1}`}
                  value={q}
                  maxLength={4000}
                  rows={2}
                  disabled={busy}
                  onChange={(e) =>
                    setQuestions((old) =>
                      old.map((value, index) =>
                        index === i ? e.target.value : value,
                      ),
                    )
                  }
                />
                {questions.length > 1 && (
                  <button
                    type="button"
                    className="back-link"
                    disabled={busy}
                    onClick={() =>
                      setQuestions((old) =>
                        old.filter((_, index) => index !== i),
                      )
                    }
                  >
                    Remove question {i + 1}
                  </button>
                )}
              </label>
            ))}
            <div className="batch-question-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || questions.length >= 20}
                onClick={() => setQuestions((old) => [...old, ""])}
              >
                Add question
              </button>
              <button className="button button-primary" disabled={busy}>
                {busy ? "Processing…" : "Ask AI"}
              </button>
              {busy && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => abort.current?.abort()}
                >
                  Stop
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {error && (
        <div role="alert" className="form-message">
          {error}
          <button
            className="back-link"
            disabled={busy || !address}
            onClick={() => void login()}
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
function explain(e: unknown) {
  return e instanceof Error
    ? e.message
    : "AI request failed. Please try again.";
}
function agentError(value: string) {
  if (/model.*(not found|unavailable)|404.*ollama|ollama.*404/i.test(value))
    return "The configured Ollama model is unavailable. Ask an administrator to install or select it.";
  if (/timed?\s*out|timeout|exceeded.*time/i.test(value))
    return "AI processing timed out. Try fewer questions or retry later.";
  if (/citation verification/i.test(value))
    return "This answer could not be verified against the available proposal evidence.";
  return value;
}
function Answers({ results }: { results: AssistantResult[] }) {
  return (
    <>
      {results.map((r) => (
        <article
          className="batch-answer-card"
          key={r.question_id}
          data-question-id={r.question_id}
        >
          <div className="batch-answer-heading">
            <h3>{r.question}</h3>
            <span className="info-chip">
              {r.status === "completed" && !r.citations?.length
                ? "Insufficient evidence"
                : r.status}{" "}
              {r.agent && `· ${r.agent}`}
            </span>
          </div>
          <p className="assistant-text">
            {r.status === "failed"
              ? "No verified answer is available for this question."
              : (r.answer ??
                (r.status === "processing"
                  ? "Waiting for agent results…"
                  : "No supported answer was returned."))}
          </p>
          {r.errors?.map((error, i) => (
            <p className="form-message" key={i}>
              {agentError(error)}
            </p>
          ))}
          {r.citations?.length > 0 && (
            <p>Sources: {r.citations.map((c) => `[${c}]`).join(" ")}</p>
          )}
          <ExecutionDetails result={r} />
          {r.blockchain_verification && (
            <BlockchainPanel report={r.blockchain_verification} />
          )}
          {r.cited_sources?.map((source, i) => (
            <details key={`${source.source_id}-${i}`}>
              <summary>
                [{source.source_id}]{" "}
                {String(
                  source.metadata.filename ??
                    source.metadata.title ??
                    source.metadata.source ??
                    "Supporting evidence",
                )}
                {source.metadata.page_number
                  ? ` · Page ${source.metadata.page_number}`
                  : ""}
              </summary>
              <p className="assistant-text">
                {typeof source.content === "string"
                  ? source.content
                  : JSON.stringify(source.content, null, 2)}
              </p>
              <pre>{JSON.stringify(source.metadata, null, 2)}</pre>
            </details>
          ))}
        </article>
      ))}
    </>
  );
}
