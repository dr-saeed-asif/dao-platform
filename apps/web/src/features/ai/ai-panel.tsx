"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { daoApi } from "@/lib/api/client";
import type {
  AiBatchQueryResponse,
  AiQueryResponse,
  ResearchSystem,
} from "@/lib/api/types";
import { AnalysisResultModal } from "./analysis-result-modal";
import { extractChecks, type ResultModel } from "./analysis-result";
import { ResearchRuns } from "./research-runs";

const systems: Array<{
  value: ResearchSystem;
  label: string;
  description: string;
}> = [
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Combines proposal records with verified linked PDF evidence.",
  },
  {
    value: "vector-rag",
    label: "Vector RAG",
    description: "Answers using the selected proposal’s indexed PDF documents.",
  },
];

interface AiPanelProps {
  proposals: Array<{ id: string; title: string; onChainId: string | null }>;
  selectedProposalId?: string;
}

function logToolInspection(label: string, traces: NonNullable<AiBatchQueryResponse["toolTraces"]>, evidence: unknown[]) {
  console.groupCollapsed(`[CyberGovAI] ${label}: ${traces.length} tool call(s)`);
  console.table(traces.map((trace) => ({
    tool: trace.tool,
    searched: JSON.stringify(trace.arguments ?? {}),
    questions: (trace.question_ids ?? trace.questionIds ?? []).join(", "),
    success: trace.success,
    matchedSourceIds: (trace.source_ids ?? trace.sourceIds ?? []).join(", "),
    outcome: trace.outcome ?? trace.errorCode ?? "—",
  })));
  console.info("Source IDs returned by tools (LLM evidence)",
    [...new Set(traces.flatMap((trace) => trace.source_ids ?? trace.sourceIds ?? []))]);
  console.info("Evidence groups passed to answer generation", evidence.map((item) => {
    const row = item as { tool_call_id?: string; source_type?: string; data?: unknown };
    return { toolCallId: row.tool_call_id, sourceType: row.source_type,
      sourceIds: (traces.find((trace) => trace.tool_call_id === row.tool_call_id)?.source_ids ?? []).join(", "),
      returnedData: summarizeToolData(row.data) };
  }));
  console.groupEnd();
}

function summarizeToolData(value: unknown): unknown {
  const fields = new Set([
    "id", "dao_id", "proposal_id", "on_chain_id", "title", "purpose",
    "recorded_status", "starts_at", "ends_at", "time_window_state",
    "total_count", "total_votes", "vote_count", "voter_count",
    "option_index", "winning_option", "finalized_on_chain", "cancelled_on_chain",
    "proposal_state", "chain_id", "contract_address", "block_number",
    "transaction_hash", "block_hash", "observed_at", "source_id", "source_ids",
    "filename", "page_number", "chunk_key", "chunk_index", "score",
    "evidence_status", "linked_pdf_count", "voting_power_supported",
    "evidence", "proposals", "events", "votes", "details",
    "vote_record_count", "stored_vote_record_count_by_local_proposal_id",
    "proposal_record_total_votes", "distinct_voter_count",
    "known_distinct_voter_count", "voter_count_complete", "missing_voter_records",
    "missing_weight_records", "votes_by_option_index", "vote_count_by_option",
  ]);
  if (Array.isArray(value)) return value.slice(0, 20).map(summarizeToolData);
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(row)) {
    if (fields.has(key)) summary[key] = summarizeToolData(item);
    else if (["content", "description", "text", "chunk_text"].includes(key) && typeof item === "string")
      summary[key + "Chars"] = item.length;
  }
  return summary;
}

export function AiPanel({ proposals, selectedProposalId }: AiPanelProps) {
  const [tab, setTab] = useState<"assistant" | "evaluation">("assistant");
  const [question, setQuestion] = useState("");
  const [batchResponse, setBatchResponse] =
    useState<AiBatchQueryResponse | null>(null);
  const [response, setResponse] = useState<AiQueryResponse | null>(null);
  const [requestError, setRequestError] = useState("");
  const [system, setSystem] = useState<"hybrid" | "vector-rag">("hybrid");
  const [proposalId, setProposalId] = useState(selectedProposalId ?? "");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [completedAt, setCompletedAt] = useState("");

  useEffect(() => {
    if (selectedProposalId) {
      setProposalId(selectedProposalId);
      setBatchResponse(null);
      setResponse(null);
      setRequestError("");
      setModalOpen(false);
    }
  }, [selectedProposalId]);

  const description = systems.find(
    (item) => item.value === system,
  )?.description;
  const questions = question
    .split(/\r?\n+|(?<=\?)\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const invalidQuestion =
    questions.length > 10
      ? "Enter no more than 10 questions, separated by line breaks or question marks."
      : questions.some((item) => item.length > 200)
        ? "Each question must be 200 characters or fewer."
        : questions.some((item) => item.length < 3)
          ? "Each question must be at least 3 characters."
          : "";

  function clearResult() {
    setBatchResponse(null);
    setResponse(null);
    setRequestError("");
    setModalOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!proposalId || !questions.length || invalidQuestion) return;
    setLoading(true);
    setBatchResponse(null);
    setResponse(null);
    setRequestError("");
    setModalOpen(false);
    try {
      if (questions.length === 1) {
        console.info("[CyberGovAI] Sending single-question request", {
          endpoint: "POST /ai/query", system, questionCount: 1,
          proposalId, question: questions[0], questionCharacters: questions[0].length,
        });
        const result = await daoApi.aiQuery({
          question: questions[0], proposalId, system, topK: 5,
        });
        console.info("[CyberGovAI] Single-question response", {
          runId: result.runId, answerReturned: Boolean(result.answer?.trim()),
          evidenceCount: result.evidence?.length ?? 0,
          retrievalCount: result.retrieval?.length ?? 0,
          latencyMs: result.latencyMs, error: result.error ?? null,
        });
        if (result.toolTraces?.length) {
          logToolInspection("Single-query tool trace", result.toolTraces, result.evidence);
        } else {
          console.groupCollapsed("[CyberGovAI] Single-query retrieval sent to answer generation");
          console.info("Searched question", questions[0]);
          console.table(result.evidence.map((item) => ({
            sourceType: item.sourceType, sourceIds: [...(item.content?.matchAll(/\[([GCD]\d+)\]/g) ?? [])]
              .map((match) => match[1]).join(", "),
            evidenceId: item.evidenceId, filename: item.filename, score: item.score, rank: item.rank,
          })));
          console.groupEnd();
        }
        setResponse(result);
        setCompletedAt(new Date().toLocaleString());
        if (result.runId) setModalOpen(true);
      } else {
        console.info("[CyberGovAI] Sending batch request", {
          endpoint: "POST /ai/query/batch", system,
          proposalId, questions, questionCount: questions.length,
          questionCharacters: questions.map((item) => item.length),
        });
        const result = await daoApi.aiBatchQuery({
          proposalId, system, questions, topK: 5,
        });
        console.info("[CyberGovAI] Batch response", {
          batchId: result.batchId, status: result.status,
          questionCount: result.results?.length ?? 0,
          combinedAnswerReturned: Boolean(result.combinedAnswer?.trim()),
          evidenceCount: result.evidence?.length ?? 0,
          tools: (result.toolTraces ?? []).map((tool) => ({
            name: tool.tool, success: tool.success,
            sourceCount: tool.source_ids?.length ?? tool.sourceIds?.length ?? 0,
            outcome: tool.outcome ?? tool.errorCode ?? null,
          })),
          errors: result.errors?.length ?? 0,
          toolErrors: result.toolErrors?.length ?? 0,
          latencyMs: result.metrics?.latencyMs ?? null,
        });
        logToolInspection("Batch tool trace", result.toolTraces, result.combinedEvidence ?? result.evidence);
        setBatchResponse(result);
        setCompletedAt(new Date().toLocaleString());
        if (result.batchId) setModalOpen(true);
      }
    } catch (error) {
      console.error("[CyberGovAI] Request failed", {
        endpoint: questions.length === 1 ? "POST /ai/query" : "POST /ai/query/batch",
        system, questionCount: questions.length,
        message: error instanceof Error ? error.message : "Unknown request error",
      });
      setRequestError(
        error instanceof Error ? error.message : "Question could not be analyzed.",
      );
    } finally {
      setLoading(false);
    }
  }

  const singleModel: ResultModel | null = useMemo(() => {
    if (!response?.runId) return null;
    const selected = proposals.find((item) => item.id === proposalId);
    const status = response.error ? "Failed" : response.abstained ? "Abstained" : "Completed";
    return {
      runId: response.runId, question: question.trim(), system: response.system,
      proposalTitle: selected ? `${selected.title} - #${selected.onChainId ?? "draft"}` : "Analysis Result",
      proposalRef: selected ? `#${selected.onChainId ?? "draft"}` : "—", completedAt, status,
      statusTone: status === "Completed" ? "green" : status === "Failed" ? "red" : "amber",
      answer: response.answer, checks: extractChecks(response.claims, response.evidence),
      evidence: response.evidence, agentTrace: response.agentTrace, agentsUsed: response.agentsUsed,
      latencyMs: response.latencyMs, retrievalCount: response.retrieval.length,
      llmCalls: response.llmCalls, embeddingCalls: response.embeddingCalls, errors: response.errors,
    };
  }, [response, question, proposalId, proposals, completedAt]);

  const batchModel: ResultModel | null = useMemo(() => {
    if (!batchResponse) return null;
    const result = batchResponse.results[0];
    if (!result) return null;
    const citations = batchResponse.combinedCitations ?? result.citations;
    const answer = batchResponse.combinedAnswer ?? result.answer;
    const resultStatus = batchResponse.combinedStatus ?? result.status;
    const selected = proposals.find(
      (item) => item.id === batchResponse.scope.proposal_id,
    );
    const evidence: ResultModel["evidence"] = citations.map(
      (citation) => ({
        evidenceId: citation.source_id,
        chunkEvidenceId: citation.source_id,
        artefactEvidenceId: "",
        sourceType:
          citation.source_type === "PostgreSQL"
            ? "STRUCTURED_DB"
            : citation.source_type === "Blockchain"
              ? "ON_CHAIN_RPC"
              : "document",
        proposalId: batchResponse.scope.proposal_id,
        filename: citation.filename ?? null,
        content: [
          citation.filename,
          citation.page_number ? `page ${citation.page_number}` : null,
          citation.block_number != null
            ? `block ${citation.block_number}`
            : null,
          citation.transaction_hash,
        ]
          .filter(Boolean)
          .join(" · "),
      }),
    );
    const status =
      resultStatus === "completed"
        ? "Completed"
        : resultStatus === "failed"
          ? "Failed"
          : "Partial";
    return {
      runId: batchResponse.batchId,
      question: batchResponse.results
        .map((item, index) => `${index + 1}. ${item.question}`)
        .join("\n"),
      system: batchResponse.system,
      proposalTitle: selected
        ? `${selected.title} - #${selected.onChainId ?? "draft"}`
        : "Analysis Result",
      proposalRef: selected ? `#${selected.onChainId ?? "draft"}` : "—",
      completedAt,
      status,
      statusTone:
        status === "Completed"
          ? "green"
          : status === "Failed"
            ? "red"
            : "amber",
      answer,
      checks: [],
      evidence,
      latencyMs:
        batchResponse.metrics.latencyMs ?? result.metrics.totalLatencyMs ?? 0,
      retrievalCount: evidence.length,
      errors: (batchResponse.combinedErrors ?? result.errors).map(
        (error) => error.message ?? error.code ?? "Question failed.",
      ),
      batch: batchResponse,
    };
  }, [batchResponse, proposals, completedAt]);
  const activeModel = batchModel ?? singleModel;

  return (
    <section className="dashboard-card" style={{ padding: 24 }}>
      <div className="card-header">
        <div>
          <span className="eyebrow">CyberGovAI</span>
          <h2>CyberGovAI Assistant</h2>
        </div>
        <Link className="button button-secondary" href="/analysis">
          View Research Runs
        </Link>
      </div>
      <div
        role="tablist"
        aria-label="AI Assistant views"
        style={{ display: "flex", gap: 8, margin: "16px 0" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "assistant"}
          className="button button-secondary"
          onClick={() => setTab("assistant")}
        >
          Assistant
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "evaluation"}
          className="button button-secondary"
          onClick={() => setTab("evaluation")}
        >
          Evaluation
        </button>
      </div>
      {tab === "evaluation" ? (
        <ResearchRuns latestBatch={batchResponse} />
      ) : (
        <>
          <form onSubmit={submit} className="ai-form">
            <div className="form-grid">
              <label>
                Proposal scope
                <select
                  value={proposalId}
                  disabled={loading}
                  onChange={(event) => {
                    clearResult();
                    setProposalId(event.target.value);
                  }}
                >
                  <option value="">Select a proposal</option>
                  {proposals.map((proposal) => (
                    <option key={proposal.id} value={proposal.id}>
                      {proposal.title} · #{proposal.onChainId ?? "draft"}
                    </option>
                  ))}
                </select>
                <small>
                  Select a proposal to ask about its details and linked
                  documents.
                </small>
              </label>
              <label>
                Research System
                <select
                  value={system}
                  disabled={loading}
                  onChange={(event) => {
                    clearResult();
                    setSystem(event.target.value as "hybrid" | "vector-rag");
                  }}
                >
                  {systems.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <small>{description}</small>
              </label>
            </div>
            <label>
              Questions
              <textarea
                value={question}
                maxLength={200}
                onChange={(event) => {
                  clearResult();
                  setQuestion(event.target.value);
                }}
                placeholder="Type one question, or enter up to 10 questions on separate lines..."
                style={{ minHeight: 110 }}
              />
              <small>{question.length}/200 characters</small>
              {invalidQuestion && (
                <small role="alert" style={{ color: "var(--danger, #dc2626)" }}>
                  {invalidQuestion}
                </small>
              )}
            </label>
            <button
              className="button button-primary"
              disabled={
                loading || !proposalId || !questions.length || Boolean(invalidQuestion)
              }
            >
              {loading ? "Running…" : "Run Question"}
            </button>
          </form>
          {requestError && (
            <div className="alert alert-error" style={{ marginTop: 24 }}>
              {requestError}
            </div>
          )}
          {activeModel && !modalOpen && (
            <div
              style={{
                marginTop: 24,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setModalOpen(true)}
              >
                View result
              </button>
            </div>
          )}
          <AnalysisResultModal
            model={modalOpen ? activeModel : null}
            onClose={() => setModalOpen(false)}
          />
        </>
      )}
    </section>
  );
}
