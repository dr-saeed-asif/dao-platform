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
  deleteAssistantConversation,
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
  const [questions, setQuestions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [planPreview, setPlanPreview] = useState<{
    clarification: string;
    questions: string[];
  } | null>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [results, setResults] = useState<AssistantResult[]>([]);
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
    setPlanPreview(null);
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
  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, results]);
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
      setPlanPreview(null);
      setStatus("");
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
      setPlanPreview(null);
      setStatus("");
      await refresh();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  async function removeConversation(item: Conversation) {
    const name = item.title || "Untitled conversation";
    if (
      !address ||
      busy ||
      !window.confirm(`Permanently delete “${name}” and its messages?`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await deleteAssistantConversation(
        `/conversations/${encodeURIComponent(item.id)}?${query}`,
        address,
      );
      if (conversation === item.id) {
        setConversation(undefined);
        setMessages([]);
        setResults([]);
        setPlanPreview(null);
        setStatus("");
      }
      await refresh();
    } catch (value) {
      setError(explain(value));
    } finally {
      setBusy(false);
    }
  }
  async function removeAllConversations() {
    const count = conversations.length;
    if (
      !address ||
      busy ||
      count === 0 ||
      !window.confirm(
        `Permanently delete all ${count} conversations for this proposal, including their messages and history?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await deleteAssistantConversation(`/conversations?${query}`, address);
      setConversations([]);
      setConversation(undefined);
      setMessages([]);
      setResults([]);
      setPlanPreview(null);
      setStatus("");
    } catch (value) {
      setError(explain(value));
    } finally {
      setBusy(false);
    }
  }
  function collectQuestions() {
    const submitted = [...questions, ...splitQuestionDraft(draft)];
    if (submitted.length > 20)
      throw new Error(
        "You can submit up to 20 questions. Remove a question before adding more.",
      );
    if (submitted.some((q) => q.length > 4000))
      throw new Error("Each question must be 4,000 characters or fewer.");
    if (submitted.join("").length > 40000)
      throw new Error("The question batch must be 40,000 characters or fewer.");
    return submitted;
  }
  function addDraft() {
    try {
      setQuestions(collectQuestions());
      setDraft("");
      setError("");
      draftInput.current?.focus();
    } catch (exc) {
      setError((exc as Error).message);
    }
  }
  async function submitQuestions(submitted: string[]) {
    if (!address || busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setPlanPreview(null);
    setBusy(true);
    setError("");
    setStatus("Analyzing questions");
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
          if (event.event === "question_plan") {
            if (data.needs_clarification) {
              const clarification = String(
                data.clarification ?? "Please clarify your request.",
              );
              const previewQuestions = Array.isArray(data.questions)
                ? data.questions.filter(
                    (question): question is string =>
                      typeof question === "string",
                  )
                : [];
              setPlanPreview({
                clarification,
                questions: previewQuestions,
              });
              setResults([]);
              setMessages((old) => [
                ...old,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: "Review the suggested questions below before continuing.",
                  metadata: {},
                },
              ]);
              setStatus("Clarification needed");
            } else {
              const planned = Array.isArray(data.questions)
                ? data.questions.filter(
                    (question): question is string =>
                      typeof question === "string",
                  )
                : submitted;
              setResults(
                planned.map((question, index) => ({
                  question_id: `q${index + 1}`,
                  question,
                  agent: "",
                  status: "processing",
                  citations: [],
                  cited_sources: [],
                  errors: [],
                })),
              );
              setStatus(`Running ${planned.length} questions`);
            }
          }
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
          if (event.event === "question_error" && event.question_id) {
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
            setStatus(
              data.status === "needs_clarification"
                ? "Clarification needed"
                : (event.status ?? String(data.status ?? "Completed")),
            );
          }
        },
      );
      setQuestions([]);
      setDraft("");
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
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!address || busy) return;
    let submitted: string[];
    try {
      submitted = collectQuestions();
    } catch (exc) {
      return setError((exc as Error).message);
    }
    if (!submitted.length) return setError("Enter at least one question.");
    await submitQuestions(submitted);
  }
  function confirmPlanPreview() {
    if (!planPreview) return;
    const submitted = planPreview.questions
      .map((question) => question.trim())
      .filter(Boolean);
    if (!submitted.length) {
      setError("Add or edit at least one question before asking AI.");
      return;
    }
    if (
      submitted.length > 20 ||
      submitted.some((question) => question.length > 4000) ||
      submitted.join("").length > 40000
    ) {
      setError(
        "Keep the preview within 20 questions, 4,000 characters per question, and 40,000 characters total.",
      );
      return;
    }
    setQuestions([]);
    setDraft("");
    void submitQuestions(submitted);
  }
  return (
    <section
      className="dashboard-card proposal-assistant"
      aria-label="Proposal AI Assistant"
    >
      <header className="assistant-main-header">
        <div className="assistant-branding">
          <div className="assistant-avatar" aria-hidden="true">
            ✦
          </div>
          <div className="assistant-main-heading">
            <h2>Proposal assistant</h2>
            <p>Ask about this proposal with cited answers.</p>
          </div>
        </div>
        <div className="assistant-toolbar-context">
          <span className="assistant-proposal-icon" aria-hidden="true">
            ▤
          </span>
          <span>
            <strong>{title}</strong>
            <small>Current proposal</small>
          </span>
        </div>
        <div className="assistant-toolbar-actions">
          <button
            className="assistant-tool-button"
            disabled={busy}
            onClick={() => {
              if (!address) return;
              void assistantJson<ProposalDocuments>(
                `/proposals/${encodeURIComponent(proposalId)}/documents`,
                address,
              )
                .then(setDocuments)
                .catch((e) => setError(explain(e)));
            }}
          >
            <span aria-hidden="true">▧</span> Evidence
          </button>
          <button
            className="assistant-tool-button"
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
            <span aria-hidden="true">⌁</span>
            {verifying ? "Checking…" : "On-chain check"}
          </button>
          <details className="assistant-overflow-menu">
            <summary aria-label="More assistant actions">
              <span className="assistant-dropdown-chevron" aria-hidden="true" />
            </summary>
            <div className="assistant-overflow-content">
              <strong>Export metrics</strong>
              {(["json", "csv"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
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
                  Download {format.toUpperCase()}
                </button>
              ))}
            </div>
          </details>
        </div>
      </header>
      {!ready ? (
        <div className="assistant-unavailable" role="status">
          <span className="assistant-loading-dot" aria-hidden="true" />
          {busy
            ? "Preparing assistant…"
            : error
              ? "Assistant is unavailable. Use Retry below to reconnect."
              : "Open the assistant from your active DAO session."}
        </div>
      ) : (
        <div className="assistant-workspace">
          <aside
            className="assistant-conversation-sidebar"
            aria-label="Saved conversations"
          >
            <div className="assistant-sidebar-heading">
              <h3>Conversations</h3>
              <div className="assistant-sidebar-actions">
                <button
                  className="button button-secondary assistant-new-chat"
                  disabled={busy}
                  onClick={() => void create()}
                >
                  <span aria-hidden="true">＋</span> New chat
                </button>
                <button
                  className="assistant-delete-all"
                  type="button"
                  disabled={busy || conversations.length === 0}
                  onClick={() => void removeAllConversations()}
                >
                  Delete all
                </button>
              </div>
            </div>
            <div className="assistant-conversation-list">
              {conversations.map((item) => (
                <div className="assistant-conversation-row" key={item.id}>
                  <button
                    type="button"
                    className={`assistant-conversation-item${conversation === item.id ? " is-active" : ""}`}
                    disabled={busy}
                    onClick={() => void open(item.id)}
                  >
                    <span
                      className="assistant-conversation-icon"
                      aria-hidden="true"
                    >
                      ◌
                    </span>
                    <span className="assistant-conversation-copy">
                      <strong>{item.title ?? "Untitled conversation"}</strong>
                      <small>
                        {new Date(item.updated_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </small>
                    </span>
                  </button>
                  <button
                    className="assistant-conversation-delete"
                    type="button"
                    aria-label={`Permanently delete ${item.title ?? "Untitled conversation"}`}
                    title="Delete conversation"
                    disabled={busy}
                    onClick={() => void removeConversation(item)}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4.5 6h11M8 6V4.5h4V6m-6.5 0 .7 10h7.6l.7-10M8.5 9v4.5M11.5 9v4.5" />
                    </svg>
                  </button>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="assistant-conversation-empty">
                  Your proposal conversations will appear here.
                </p>
              )}
            </div>
            <div className="assistant-sidebar-scope">
              <span className="assistant-scope-dot" aria-hidden="true" />
              <span>
                <strong>Proposal scope</strong>
                <small>{daoId ?? "Verified by server"}</small>
              </span>
            </div>
          </aside>

          <div className="assistant-chat-column">
            {(verification || documents !== undefined) && (
              <div className="assistant-resource-panels">
                {verification && <BlockchainPanel report={verification} />}
                {documents !== undefined && (
                  <details className="assistant-evidence-panel" open>
                    <summary>Available proposal documents</summary>
                    {!documents.linked_artefacts.length && (
                      <p>
                        No documents are linked to this proposal. AI can still
                        use available proposal records.
                      </p>
                    )}
                    {documents.linked_artefacts.map((document) => (
                      <article key={document.evidence_id}>
                        <strong>{document.filename}</strong>
                        <p>
                          {document.verification_status} ·{" "}
                          {document.lifecycle_state} ·{" "}
                          {documents.indexed_documents.some(
                            (index) =>
                              index.artefact_evidence_id ===
                              document.evidence_id,
                          )
                            ? "Indexed for AI"
                            : "Not indexed for AI"}
                        </p>
                        <small>Evidence ID: {document.evidence_id}</small>
                      </article>
                    ))}
                  </details>
                )}
              </div>
            )}

            <div
              ref={transcript}
              className="assistant-transcript"
              aria-label="Conversation messages"
            >
              {messages.length === 0 && results.length === 0 && !busy && (
                <div className="assistant-empty-state">
                  <div className="assistant-empty-icon" aria-hidden="true">
                    ✦
                  </div>
                  <h3>What would you like to understand?</h3>
                  <p>
                    Ask about the proposal’s goals, evidence, risks, or
                    governance details.
                  </p>
                </div>
              )}
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`assistant-message assistant-message-${message.role}`}
                >
                  {message.role !== "user" && (
                    <span
                      className="assistant-message-avatar"
                      aria-hidden="true"
                    >
                      ✦
                    </span>
                  )}
                  <div className="assistant-message-body">
                    {message.role !== "user" && (
                      <strong>Proposal assistant</strong>
                    )}
                    {message.metadata.results ? (
                      <Answers results={message.metadata.results} />
                    ) : (
                      <p className="assistant-text">{message.content}</p>
                    )}
                  </div>
                </article>
              ))}
              {results.length > 0 && (
                <div className="assistant-message assistant-message-assistant">
                  <span className="assistant-message-avatar" aria-hidden="true">
                    {busy &&
                    results.some((result) => result.status === "processing") ? (
                      <span className="assistant-spinner" />
                    ) : (
                      "✦"
                    )}
                  </span>
                  <div className="assistant-message-body">
                    <strong>Proposal assistant</strong>
                    <Answers results={results} />
                  </div>
                </div>
              )}
              <div
                className="assistant-live-status"
                role="status"
                aria-live="polite"
              >
                {busy ? "" : status.replaceAll("_", " ")}
              </div>
            </div>

            <form
              className="ai-form assistant-composer"
              onSubmit={(event) => void send(event)}
            >
              {planPreview && (
                <section
                  className="question-plan-preview"
                  aria-label="Review planned questions"
                >
                  <div className="question-plan-preview-heading">
                    <strong>Review the questions before continuing</strong>
                    <p>{planPreview.clarification}</p>
                  </div>
                  {planPreview.questions.length ? (
                    <div className="question-plan-preview-list">
                      {planPreview.questions.map((question, index) => (
                        <label key={index}>
                          <span>Question {index + 1}</span>
                          <textarea
                            aria-label={`Edit planned question ${index + 1}`}
                            rows={2}
                            maxLength={4000}
                            disabled={busy}
                            value={question}
                            onChange={(event) =>
                              setPlanPreview((current) =>
                                current
                                  ? {
                                      ...current,
                                      questions: current.questions.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? event.target.value
                                            : item,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="question-plan-preview-empty">
                      The assistant could not safely split this request. Add a clearer question in the box below.
                    </p>
                  )}
                  <div className="question-plan-preview-actions">
                    {planPreview.questions.length > 0 && (
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={busy}
                        onClick={confirmPlanPreview}
                      >
                        Confirm and ask AI
                      </button>
                    )}
                    <button
                      type="button"
                      className="assistant-text-action"
                      disabled={busy}
                      onClick={() => {
                        setQuestions(planPreview.questions);
                        setDraft("");
                        setPlanPreview(null);
                        draftInput.current?.focus();
                      }}
                    >
                      Edit in composer
                    </button>
                    <button
                      type="button"
                      className="assistant-text-action"
                      disabled={busy}
                      onClick={() => setPlanPreview(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                </section>
              )}
              {questions.length > 0 && (
                <ol
                  className="question-chip-list"
                  aria-label="Questions to send"
                >
                  {questions.map((question, index) => (
                    <li key={index}>
                      <strong>Q{index + 1}</strong>
                      <span>{question}</span>
                      <button
                        type="button"
                        className="back-link"
                        disabled={busy}
                        aria-label={`Edit question ${index + 1}`}
                        onClick={() => {
                          if (draft.trim())
                            return setError(
                              "Add or clear the current text before editing a queued question.",
                            );
                          setDraft(question);
                          setQuestions((old) =>
                            old.filter((_, itemIndex) => itemIndex !== index),
                          );
                          draftInput.current?.focus();
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="back-link"
                        disabled={busy}
                        aria-label={`Remove question ${index + 1}`}
                        onClick={() =>
                          setQuestions((old) =>
                            old.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="assistant-composer-row">
                <label className="assistant-composer-input">
                  <span className="sr-only">Question text</span>
                  <textarea
                    ref={draftInput}
                    aria-label="Question text"
                    aria-describedby="question-composer-help"
                    value={draft}
                    maxLength={40000}
                    rows={2}
                    disabled={busy}
                    placeholder="Ask about this proposal…"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        (event.ctrlKey || event.metaKey) &&
                        event.key === "Enter" &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        addDraft();
                      }
                    }}
                  />
                </label>
                <button
                  className="button button-primary assistant-send-button"
                  aria-label={busy ? "AI response in progress" : undefined}
                  disabled={busy || (!draft.trim() && questions.length === 0)}
                >
                  {busy ? (
                    <span className="assistant-spinner" aria-hidden="true" />
                  ) : (
                    <>
                      <span aria-hidden="true">➤</span>Ask AI
                    </>
                  )}
                </button>
              </div>
              <div className="assistant-composer-footer">
                <p id="question-composer-help">
                  {questions.length} queued · Ctrl+Enter adds a question · paste
                  one question per line · max 20
                </p>
                <div
                  className="assistant-suggestions"
                  aria-label="Suggested questions"
                >
                  {[
                    "What are the proposal’s goals?",
                    "What evidence supports it?",
                  ].map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      disabled={busy}
                      onClick={() => {
                        setDraft(suggestion);
                        draftInput.current?.focus();
                      }}
                    >
                      {suggestion}
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
                <div className="assistant-composer-secondary">
                  {draft.trim() && (
                    <button
                      type="button"
                      className="assistant-text-action"
                      disabled={busy || questions.length >= 20}
                      onClick={addDraft}
                    >
                      Add to queue
                    </button>
                  )}
                  {busy && (
                    <button
                      type="button"
                      className="assistant-text-action"
                      onClick={() => abort.current?.abort()}
                    >
                      Stop response
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
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
            {r.status !== "processing" && (
              <span className="info-chip">
                {r.status === "completed" && !r.citations?.length
                  ? "Insufficient evidence"
                  : r.status}{" "}
                {r.agent && `· ${r.agent}`}
              </span>
            )}
          </div>
          {r.status !== "processing" && (
            <p className="assistant-text">
              {r.status === "failed"
                ? "No verified answer is available for this question."
                : (r.answer ?? "No supported answer was returned.")}
            </p>
          )}
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

export function splitQuestionDraft(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const cleaned = line.trim().replace(/^(?:[-*\u2022]\s+|\d+[.)]\s+)/, "");
      return cleaned.replace(/^["\u201c]([\s\S]*)["\u201d]$/, "$1").trim();
    })
    .filter(Boolean);
}
