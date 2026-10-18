"use client";

/** Operator-only local AI showcase; uses an authenticated server-side proxy. */
import { useState } from "react";
import type { FormEvent } from "react";

type System = "hybrid" | "vector-rag";
type Evidence = {
  source_id?: string;
  source?: string;
  filename?: string;
  page_number?: number;
  chunk_index?: number;
  score?: number;
  content?: unknown;
};
type Result = {
  answer?: string;
  runId?: string;
  system?: string;
  latencyMs?: number;
  retrievalLatencyMs?: number;
  generationLatencyMs?: number;
  embeddingLatencyMs?: number;
  evidence?: Evidence[];
  documents?: { filename?: string; sha256?: string }[];
  retrieval?: { method?: string; profile_id?: string };
  note?: string;
};

const proposals = [
  {
    label: "Security audit",
    daoId: "cyber-security-dao",
    proposalId: "620bc74c-dde0-4532-9c4c-11e31b91983f",
    sample: "What does the security audit proposal request, and what are the expected deliverables?",
  },
  {
    label: "Governance voting upgrade",
    daoId: "cyber-governance-dao",
    proposalId: "d29a8227-da76-4a40-80a8-33300e1c4f04",
    sample: "Summarize the proposal and explain the evidence in its attached PDF.",
  },
] as const;

const field = { width: "100%", padding: "11px 12px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 14, color: "#0f172a", background: "white" } as const;

export default function AiDemoPage() {
  const [selected, setSelected] = useState(0);
  const [password, setPassword] = useState("");
  const [system, setSystem] = useState<System>("hybrid");
  const [question, setQuestion] = useState<string>(proposals[0].sample);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    const current = proposals[selected];
    try {
      const response = await fetch("/api/ai-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          password,
          daoId: current.daoId,
          proposalId: current.proposalId,
          question,
          system,
          topK: 4,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data
          ? (data as { error: unknown }).error : "Request failed.";
        throw new Error(typeof message === "string" ? message : "Request failed.");
      }
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected request error.");
    } finally {
      setBusy(false);
    }
  }

  function selectProposal(value: number) {
    setSelected(value);
    setQuestion(proposals[value].sample);
    setResult(null);
    setError("");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px 18px", color: "#0f172a" }}>
      <div style={{ maxWidth: 930, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#475569", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>CYBERDAO · LOCAL AI RESEARCH DEMO</div>
            <h1 style={{ fontSize: 30, fontWeight: 750, margin: "6px 0" }}>Governance + PDF Assistant</h1>
            <p style={{ color: "#475569", margin: "8px 0 20px" }}>Live FastAPI · Ollama · PostgreSQL pgvector · linked proposal evidence</p>
          </div>
          <a href="/" style={{ fontSize: 14, color: "#2563eb" }}>← CyberDAO home</a>
        </div>

        <div style={{ borderLeft: "4px solid #b45309", background: "#fffbeb", padding: 14, borderRadius: 6, marginBottom: 20, fontSize: 13 }}>
          Operator-only localhost demo. This is <strong>not</strong> CyberChain wallet authentication. Do not publish this page or forward private PDF results to other users.
        </div>

        <form onSubmit={ask} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 22, display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="demo-password" style={{ fontWeight: 650, fontSize: 14 }}>Local demo password</label>
            <input id="demo-password" type="password" autoComplete="off" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password printed by setup script" style={field} />
            <span style={{ fontSize: 12, color: "#64748b" }}>Held in this tab only; not saved to browser storage. The Python RAG token stays server-side.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="proposal" style={{ fontWeight: 650, fontSize: 14 }}>Verified DAO proposal</label>
              <select id="proposal" value={selected} onChange={e => selectProposal(Number(e.target.value))} style={field}>
                {proposals.map((p, i) => <option key={p.proposalId} value={i}>{p.label}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="mode" style={{ fontWeight: 650, fontSize: 14 }}>Retrieval mode</label>
              <select id="mode" value={system} onChange={e => setSystem(e.target.value as System)} style={field}>
                <option value="hybrid">Hybrid · proposal + PDF</option>
                <option value="vector-rag">Vector RAG · linked PDF only</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="question" style={{ fontWeight: 650, fontSize: 14 }}>Question</label>
            <textarea id="question" required minLength={3} maxLength={2000} rows={4} value={question} onChange={e => setQuestion(e.target.value)} style={{ ...field, resize: "vertical", lineHeight: 1.5 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>{proposals[selected].daoId} · on-chain-linked PDF evidence</div>
            <button type="submit" disabled={busy || !password || question.trim().length < 3} style={{ padding: "11px 24px", borderRadius: 9, border: 0, background: busy ? "#94a3b8" : "#1d4ed8", color: "white", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
              {busy ? "Asking Ollama… (may take 30s)" : "Ask CyberDAO AI →"}
            </button>
          </div>
        </form>

        {error && <section role="alert" style={{ marginTop: 20, padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#991b1b" }}>{error}</section>}

        {result && (
          <section aria-live="polite" style={{ marginTop: 20, display: "grid", gap: 16 }}>
            <div style={{ border: "1px solid #e2e8f0", background: "white", borderRadius: 14, padding: 22 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Answer</h2>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 15 }}>{result.answer || "No answer returned."}</div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[ ["Total", result.latencyMs], ["Retrieval", result.retrievalLatencyMs], ["Generation", result.generationLatencyMs], ["Embedding", result.embeddingLatencyMs] ].map(([label, ms]) => (
                <div key={String(label)} style={{ flex: "1 1 125px", border: "1px solid #e2e8f0", background: "white", borderRadius: 10, padding: 14 }}>
                  <div style={{ color: "#64748b", fontSize: 12 }}>{label} latency</div>
                  <div style={{ fontWeight: 750, fontSize: 19 }}>{typeof ms === "number" ? `${(ms / 1000).toFixed(2)} s` : "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ border: "1px solid #e2e8f0", background: "white", borderRadius: 14, padding: 22 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Evidence · {result.evidence?.length ?? 0} sources</h2>
              {result.evidence?.map((ev, i) => (
                <div key={`${ev.source_id ?? i}-${i}`} style={{ borderTop: "1px solid #e2e8f0", padding: "14px 0" }}>
                  <div style={{ fontWeight: 700 }}>[{ev.source_id ?? `source-${i + 1}`}] {ev.filename ?? "DAO governance record"}</div>
                  <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>
                    {ev.source === "governance-db" ? "PostgreSQL governance record" : `Linked PDF · page ${ev.page_number ?? "?"}`}
                    {typeof ev.score === "number" ? ` · cosine score ${ev.score.toFixed(3)}` : ""}
                  </div>
                  {ev.source === "governance-db" && ev.content !== null && typeof ev.content === "object" && (
                    <p style={{ color: "#334155", fontSize: 13, marginBottom: 0 }}>
                      {String((ev.content as { title?: string }).title ?? "Proposal metadata")}
                    </p>
                  )}
                </div>
              ))}
              <p style={{ color: "#64748b", fontSize: 12, marginTop: 10 }}>Citation labels identify retrieved sources; individual claims are not automatically verified.</p>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", wordBreak: "break-word" }}>Run ID: {result.runId ?? "unknown"} · Mode: {result.system ?? system}</div>
          </section>
        )}
      </div>
    </main>
  );
}
