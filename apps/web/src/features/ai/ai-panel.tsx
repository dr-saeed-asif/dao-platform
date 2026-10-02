"use client";

import { useState, useEffect } from "react";
import { daoApi } from "@/lib/api/client";
import { CopyValueButton } from "@/components/copy-value-button";

type System = "llm-only" | "vector-rag";

interface AiPanelProps {
  proposals: Array<{ id: string; title: string }>;
}

export function AiPanel({ proposals }: AiPanelProps) {
  const [question, setQuestion] = useState("");
  const [system, setSystem] = useState<System>("vector-rag");
  const [proposalId, setProposalId] = useState<string | undefined>(undefined);
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    runId: string;
    system: System;
    answer: string;
    evidence: Array<{
      chunkEvidenceId: string;
      artefactEvidenceId: string;
      proposalId: string | null;
      filename: string | null;
      content: string;
      score: number;
      rank: number;
    }>;
    retrieval: Array<{
      chunkEvidenceId: string;
      score: number;
      rank: number;
    }>;
    latencyMs: number;
    retrievalLatencyMs?: number;
    generationLatencyMs?: number;
    error?: string;
  } | null>(null);
  const [health, setHealth] = useState<{
    status: string;
    ollama: { status: string; latencyMs?: number; model?: string; error?: string };
    postgres: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const h = await daoApi.aiHealth();
      setHealth(h);
    } catch {
      setHealth({ 
        status: "error", 
        ollama: { status: "unhealthy" },
        postgres: "error",
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await daoApi.aiQuery({
        question,
        proposalId,
        system,
        topK,
      });
      setResponse(res);
    } catch (error) {
      setResponse({
        runId: "",
        system,
        answer: "",
        evidence: [],
        retrieval: [],
        latencyMs: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px", marginTop: "24px" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 600 }}>AI Assistant</h2>

      <div style={{ display: "flex", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 500 }}>
            System
          </label>
          <select
            value={system}
            onChange={(e) => setSystem(e.target.value as System)}
            style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "4px" }}
          >
            <option value="llm-only">LLM Only</option>
            <option value="vector-rag">Vector RAG</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 500 }}>
            Proposal Scope (optional)
          </label>
          <select
            value={proposalId ?? ""}
            onChange={(e) => setProposalId(e.target.value || undefined)}
            style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "4px" }}
          >
            <option value="">All Proposals</option>
            {proposals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: "100px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 500 }}>
            Top K
          </label>
          <input
            type="number"
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            min={1}
            max={20}
            style={{ width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "4px" }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ marginBottom: "16px" }}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about the proposal documents..."
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "12px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontFamily: "inherit",
            fontSize: "14px",
            resize: "vertical",
            marginBottom: "12px",
          }}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          style={{
            padding: "10px 20px",
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading || !question.trim() ? "not-allowed" : "pointer",
            opacity: loading || !question.trim() ? 0.6 : 1,
          }}
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {health && (
        <div
          style={{
            display: "flex",
            gap: "16px",
            padding: "8px",
            backgroundColor: "#f9fafb",
            borderRadius: "4px",
            marginBottom: "16px",
            fontSize: "12px",
          }}
        >
          <span>Status: <strong>{health.status}</strong></span>
          <span>Ollama: <strong>{health.ollama.status}</strong></span>
          {health.ollama.latencyMs && <span>Ollama Latency: {health.ollama.latencyMs}ms</span>}
        </div>
      )}

      {response && (
        <div style={{ marginTop: "16px" }}>
          {response.error && (
            <div style={{ color: "#dc2626", padding: "12px", backgroundColor: "#fef2f2", borderRadius: "4px", marginBottom: "16px" }}>
              Error: {response.error}
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600 }}>Answer</h3>
            <div style={{ padding: "12px", backgroundColor: "#f9fafb", borderRadius: "4px", whiteSpace: "pre-wrap", fontSize: "14px" }}>
              {response.answer || "<empty>"}
            </div>
          </div>

          {response.evidence.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600 }}>Retrieved Sources</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {response.evidence.map((e) => (
                  <div
                    key={e.chunkEvidenceId}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "4px",
                      padding: "12px",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap", fontSize: "12px" }}>
                      <span><strong>Rank:</strong> {e.rank}</span>
                      <span><strong>Score:</strong> {e.score.toFixed(4)}</span>
                      <span><strong>Proposal:</strong> {e.proposalId ?? "N/A"}</span>
                      <span><strong>File:</strong> {e.filename ?? "N/A"}</span>
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                      <strong>Chunk Evidence ID:</strong>
                      <CopyValueButton value={e.chunkEvidenceId} />
                    </div>
                    <div style={{ marginBottom: "8px" }}>
                      <strong>Artefact Evidence ID:</strong>
                      <CopyValueButton value={e.artefactEvidenceId} />
                    </div>
                    <details style={{ fontSize: "13px" }}>
                      <summary style={{ cursor: "pointer", color: "#6b7280" }}>Show content</summary>
                      <pre style={{ marginTop: "8px", whiteSpace: "pre-wrap", backgroundColor: "#f3f4f6", padding: "8px", borderRadius: "4px", overflow: "auto", maxHeight: "200px" }}>
                        {e.content}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: "12px", color: "#6b7280" }}>
            <div>Run ID: <CopyValueButton value={response.runId} /></div>
            <div>System: {response.system}</div>
            <div>Total Latency: {response.latencyMs}ms</div>
            {response.retrievalLatencyMs !== undefined && (
              <div>Retrieval: {response.retrievalLatencyMs}ms</div>
            )}
            {response.generationLatencyMs !== undefined && (
              <div>Generation: {response.generationLatencyMs}ms</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}