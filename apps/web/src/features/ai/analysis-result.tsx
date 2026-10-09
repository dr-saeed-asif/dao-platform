"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CopyValueButton } from "@/components/copy-value-button";
import type { AiQueryResponse } from "@/lib/api/types";

export type CheckResult = "PASS" | "FAIL" | "INDETERMINATE";

export interface ComplianceCheck {
  ruleId: string;
  title: string;
  result: CheckResult;
  reason?: string;
  evidenceIds: string[];
  inputs?: Record<string, unknown>;
}

export type EvidenceItem = AiQueryResponse["evidence"][number] & {
  data?: {
    ruleId?: string;
    result?: string;
    reason?: string;
    inputs?: Record<string, unknown>;
    explanationData?: Record<string, unknown>;
    evidenceIds?: string[];
  };
};

export interface ResultModel {
  runId: string;
  question: string;
  system: string;
  proposalTitle: string;
  proposalRef: string;
  completedAt: string;
  status: "Completed" | "Failed" | "Abstained";
  statusTone: "green" | "red" | "amber";
  answer: string;
  checks: ComplianceCheck[];
  evidence: EvidenceItem[];
  agentTrace?: AiQueryResponse["agentTrace"];
  agentsUsed?: string[];
  latencyMs: number;
  retrievalCount: number;
  llmCalls?: number;
  embeddingCalls?: number;
  errors?: string[];
}

const RULE_TITLES: Record<string, string> = {
  "GOV-01": "Quorum requirement",
  "GOV-02": "Voting window",
  "GOV-03": "Member eligibility",
  "GOV-04": "Evidence integrity",
  "GOV-05": "Lifecycle transitions",
  "GOV-06": "Vote uniqueness",
};

const SYSTEM_LABELS: Record<string, string> = {
  hybrid: "Hybrid",
  "hybrid-verified": "Hybrid + Verifier",
  "multi-agent": "Multi-Agent Hybrid + Verifier",
  "llm-only": "LLM Only",
  "vector-rag": "Vector RAG",
};

export function systemLabel(system: string): string {
  return SYSTEM_LABELS[system] ?? system;
}

function parseCheckResult(value: unknown): CheckResult | null {
  const text = String(value ?? "").toUpperCase();
  if (text === "PASS") return "PASS";
  if (text === "FAIL") return "FAIL";
  if (text === "INDETERMINATE") return "INDETERMINATE";
  return null;
}

export function extractChecks(
  claims: Array<{ text: string; type: string; evidenceIds: string[] }> | undefined,
  evidence: EvidenceItem[] | undefined,
): ComplianceCheck[] {
  const byRule = new Map<string, ComplianceCheck>();
  for (const claim of claims ?? []) {
    if (claim.type !== "COMPLIANCE") continue;
    const match = /^(GOV-\d+)\s+result\s+is\s+(PASS|FAIL|INDETERMINATE)\.?/i.exec(
      claim.text.trim(),
    );
    if (!match) continue;
    const ruleId = match[1].toUpperCase();
    const result = parseCheckResult(match[2]) ?? "INDETERMINATE";
    byRule.set(ruleId, {
      ruleId,
      title: RULE_TITLES[ruleId] ?? ruleId,
      result,
      evidenceIds: [...claim.evidenceIds],
    });
  }
  for (const item of evidence ?? []) {
    const ref = item.evidenceId ?? "";
    if (!ref.startsWith("compliance:")) continue;
    const ruleId = ref.split(":")[1]?.toUpperCase();
    if (!ruleId) continue;
    const data = item.data ?? {};
    const result = parseCheckResult(data.result) ?? byRule.get(ruleId)?.result ?? "INDETERMINATE";
    const existing = byRule.get(ruleId);
    const merged = new Set([
      ...(existing?.evidenceIds ?? []),
      ...((data.evidenceIds ?? []) as string[]),
      ref,
    ]);
    byRule.set(ruleId, {
      ruleId,
      title: RULE_TITLES[ruleId] ?? ruleId,
      result,
      reason:
        typeof data.reason === "string" && data.reason
          ? data.reason
          : existing?.reason,
      evidenceIds: [...merged],
      inputs: (data.inputs as Record<string, unknown> | undefined) ?? existing?.inputs,
    });
  }
  return [...byRule.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

export type EvidenceGroup = "Database" | "Blockchain" | "Documents" | "Compliance";

export function groupAnalysisEvidence(
  items: EvidenceItem[],
): Record<EvidenceGroup, EvidenceItem[]> {
  const groups: Record<EvidenceGroup, EvidenceItem[]> = {
    Database: [],
    Blockchain: [],
    Documents: [],
    Compliance: [],
  };
  for (const item of items) {
    const type =
      item.sourceType ?? (item.chunkEvidenceId ? "DOCUMENT_CHUNK" : "");
    if (type === "STRUCTURED_DB") groups.Database.push(item);
    else if (
      type === "ON_CHAIN_EVENT" ||
      item.evidenceId?.startsWith("event:")
    )
      groups.Blockchain.push(item);
    else if (type === "COMPLIANCE" || item.evidenceId?.startsWith("compliance:"))
      groups.Compliance.push(item);
    else groups.Documents.push(item);
  }
  return groups;
}

export function defaultFinding(check: ComplianceCheck): string {
  if (check.reason) return check.reason;
  if (check.result === "PASS") return "Requirement satisfied.";
  if (check.result === "FAIL") return "Requirement not satisfied.";
  return "Insufficient evidence for full verification.";
}

function verdictFor(checks: ComplianceCheck[]): {
  label: string;
  tone: "green" | "red" | "amber" | "neutral";
  blurb: string;
} {
  const pass = checks.filter((check) => check.result === "PASS").length;
  const ind = checks.filter((check) => check.result === "INDETERMINATE").length;
  const fail = checks.filter((check) => check.result === "FAIL").length;
  if (!checks.length)
    return {
      label: "No checks evaluated",
      tone: "neutral",
      blurb: "This run did not produce governance checks.",
    };
  if (fail > 0)
    return {
      label: "Needs Attention",
      tone: "red",
      blurb: `${fail} check${fail === 1 ? "" : "s"} failed out of ${checks.length} evaluated.`,
    };
  if (ind > 0)
    return {
      label: "Mostly Compliant",
      tone: "green",
      blurb: `The proposal meets most governance requirements, with ${ind} area${ind === 1 ? "" : "s"} requiring further verification.`,
    };
  return {
    label: "Fully Compliant",
    tone: "green",
    blurb: `All ${pass} governance check${pass === 1 ? "" : "s"} passed.`,
  };
}

function resultTone(result: CheckResult): "green" | "red" | "amber" {
  if (result === "PASS") return "green";
  if (result === "FAIL") return "red";
  return "amber";
}

function resultWord(result: CheckResult): string {
  if (result === "PASS") return "Pass";
  if (result === "FAIL") return "Fail";
  return "Indeterminate";
}

function formatInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

function FormattedAnswer({ answer }: { answer: string }) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    blocks.push(<p key={`paragraph-${blocks.length}`}>{formatInline(text)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => (
      <li key={index}>{formatInline(item)}</li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`list-${blocks.length}`}>{items}</ol>
      ) : (
        <ul key={`list-${blocks.length}`}>{items}</ul>
      ),
    );
    list = null;
  };

  for (const rawLine of answer.trim().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<h4 key={`heading-${blocks.length}`}>{formatInline(heading[2])}</h4>);
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (list && list.ordered !== isOrdered) flushList();
      list ??= { ordered: isOrdered, items: [] };
      list.items.push((ordered ?? unordered)![1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return <div className="result-answer">{blocks}</div>;
}

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function checksToCsv(checks: ComplianceCheck[]): string {
  const rows = [["Check", "Result", "Finding", "EvidenceIds"]];
  for (const check of checks) {
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    rows.push(
      [
        check.ruleId,
        check.result,
        defaultFinding(check),
        check.evidenceIds.join("; "),
      ].map(cell),
    );
  }
  return rows.map((row) => row.join(",")).join("\n");
}

export function CopyAnswerButton({ answer }: { answer: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(answer);
    } catch {
      const input = document.createElement("textarea");
      input.value = answer;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }
  return (
    <button type="button" className="result-action" onClick={() => void copy()}>
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span> {copied ? "Copied" : "Copy Answer"}
    </button>
  );
}

export function ExportMenu({ model }: { model: ResultModel }) {
  const [open, setOpen] = useState(false);
  const base = `analysis-${model.runId.slice(0, 8) || "run"}`;
  return (
    <span className="result-export">
      <button
        type="button"
        className="result-action"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⇩</span> Export ▾
      </button>
      {open && (
        <span role="menu" className="result-export-menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              download(`${base}.json`, "application/json", JSON.stringify(model, null, 2));
              setOpen(false);
            }}
          >
            Download JSON
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              download(`${base}-checks.csv`, "text/csv", checksToCsv(model.checks));
              setOpen(false);
            }}
          >
            Download checks CSV
          </button>
        </span>
      )}
    </span>
  );
}

export function OpenFullReportButton({ runId }: { runId: string }) {
  return (
    <button
      type="button"
      className="btn-create"
      disabled={!runId}
      title={runId ? "Open the full report in a new tab" : "No run available"}
      onClick={() => {
        if (runId) window.open(`/ai-assistant/results/${encodeURIComponent(runId)}`, "_blank", "noopener");
      }}
    >
      <span aria-hidden="true">↗</span> Open Full Report
    </button>
  );
}

type ResultTab = "summary" | "compliance" | "evidence" | "trace";

const resultTabs: Array<{ id: ResultTab; label: string; icon: string }> = [
  { id: "summary", label: "Summary", icon: "▤" },
  { id: "compliance", label: "Compliance", icon: "⦿" },
  { id: "evidence", label: "Evidence", icon: "▦" },
  { id: "trace", label: "Technical Trace", icon: "≡" },
];

export function AnalysisResultView({ model }: { model: ResultModel }) {
  const [tab, setTab] = useState<ResultTab>("summary");
  const [expanded, setExpanded] = useState<string | null>(null);
  const grouped = useMemo(() => groupAnalysisEvidence(model.evidence), [model.evidence]);
  const verdict = verdictFor(model.checks);
  const pass = model.checks.filter((check) => check.result === "PASS").length;
  const ind = model.checks.filter((check) => check.result === "INDETERMINATE").length;
  const fail = model.checks.filter((check) => check.result === "FAIL").length;
  const total = model.checks.length || 1;
  const pct = (count: number) => `${Math.round((count / total) * 100)}%`;
  const sourceEntries: Array<{ group: EvidenceGroup; icon: string; count: number }> = [
    { group: "Database", icon: "▤", count: grouped.Database.length },
    { group: "Blockchain", icon: "◇", count: grouped.Blockchain.length },
    { group: "Documents", icon: "▦", count: grouped.Documents.length },
    { group: "Compliance", icon: "✓", count: grouped.Compliance.length },
  ].filter((source): source is { group: EvidenceGroup; icon: string; count: number } => source.count > 0);
  return (
    <div>
      <section className="result-meta">
        <div className="result-meta-item">
          <span>Question</span>
          <strong>{model.question}</strong>
        </div>
        <div className="result-meta-item">
          <span>Research System</span>
          <strong className="result-system">{systemLabel(model.system)}</strong>
        </div>
        <div className="result-meta-item">
          <span>Completed</span>
          <strong>{model.completedAt}</strong>
          <small className="mono">Run ID: {model.runId || "—"}</small>
        </div>
        <div className="result-meta-item">
          <span>Status</span>
          <strong className={`result-status result-status-${model.statusTone}`}>
            {model.statusTone === "green" ? "◉" : "◎"} {model.status}
          </strong>
        </div>
      </section>

      <div className="result-tabs" role="tablist" aria-label="Result sections">
        {resultTabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "result-tab active" : "result-tab"}
            onClick={() => setTab(item.id)}
          >
            <i aria-hidden="true">{item.icon}</i> {item.label}
          </button>
        ))}
      </div>

      {tab === "summary" && model.checks.length > 0 && (
        <>
          <div className="result-summary-grid">
            <section className={`verdict-card verdict-${verdict.tone}`}>
              <span className="verdict-icon" aria-hidden="true">
                {verdict.tone === "green" ? "✓" : verdict.tone === "red" ? "!" : "•"}
              </span>
              <div>
                <span>Overall Verdict</span>
                <strong>{verdict.label}</strong>
                <p>{verdict.blurb}</p>
              </div>
            </section>
            <section className="counter-card counter-green">
              <strong>{pass}</strong>
              <span>Passed</span>
              <small>{pct(pass)}</small>
            </section>
            <section className="counter-card counter-amber">
              <strong>{ind}</strong>
              <span>Indeterminate</span>
              <small>{pct(ind)}</small>
            </section>
            <section className="counter-card counter-red">
              <strong>{fail}</strong>
              <span>Failed</span>
              <small>{pct(fail)}</small>
            </section>
          </div>
        </>
      )}

      {tab === "summary" && model.answer.trim() && (
        <section className="result-section result-answer-section">
          <h3>Analysis Summary</h3>
          <FormattedAnswer answer={model.answer} />
        </section>
      )}

      {model.checks.length > 0 && (
        <>
          <section className="result-section">
            <div className="result-section-head">
              <h3>Governance Checks</h3>
              <span>{model.checks.length} checks evaluated</span>
            </div>
            <div className="check-grid">
              {model.checks.map((check) => (
                  <article key={check.ruleId} className="check-card">
                    <strong>{check.ruleId}</strong>
                    <span className={`check-pill check-${resultTone(check.result)}`}>
                      {resultTone(check.result) === "green" ? "◉" : "◎"} {resultWord(check.result)}
                    </span>
                    <p>{check.title}. {defaultFinding(check)}</p>
                    <button
                      type="button"
                      className="text-button"
                      aria-expanded={expanded === check.ruleId}
                      onClick={() =>
                        setExpanded((current) => (current === check.ruleId ? null : check.ruleId))
                      }
                    >
                      {expanded === check.ruleId ? "Hide details ↑" : "View details →"}
                    </button>
                    {expanded === check.ruleId && (
                      <div className="check-detail">
                        {check.inputs && Object.keys(check.inputs).length > 0 && (
                          <dl>
                            {Object.entries(check.inputs).map(([key, value]) => (
                              <div key={key}>
                                <dt>{key}</dt>
                                <dd className="mono">{String(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {check.evidenceIds.length > 0 && (
                          <div className="check-evidence">
                            <span>Evidence</span>
                            {check.evidenceIds.map((id) => (
                              <CopyValueButton key={id} value={id} label={`Copy ${id}`} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

          <div className={sourceEntries.length ? "result-columns" : "result-columns result-columns-single"}>
              <section className="result-section">
                <h3>Key Findings</h3>
                <ul className="finding-list">
                  {model.checks.map((check) => (
                    <li key={check.ruleId} className={`finding-${resultTone(check.result)}`}>
                      <strong>{check.ruleId}:</strong> {defaultFinding(check)}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}

      {sourceEntries.length > 0 && (
        <section className="result-section">
          <h3>Sources Used</h3>
          <button
            type="button"
            className="sources-inline-button"
            onClick={() => setTab("evidence")}
          >
{sourceEntries.map((source, index) => (
              <span key={index} >
                <strong>{source.group}</strong> <b>{source.count}</b>
                {index < sourceEntries.length - 1 && ", "}
              </span>
            ))}
          </button>
        </section>
      )}

      {tab === "compliance" && (
        <section className="result-section">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Result</th>
                  <th>Finding</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {model.checks.map((check) => (
                  <tr key={check.ruleId}>
                    <td>
                      <strong>{check.ruleId}</strong>
                      <small>{check.title}</small>
                    </td>
                    <td>
                      <span className={`check-pill check-${resultTone(check.result)}`}>
                        {resultWord(check.result)}
                      </span>
                    </td>
                    <td>{defaultFinding(check)}</td>
                    <td>
                      {check.evidenceIds.length ? (
                        <button type="button" className="text-button" onClick={() => setTab("evidence")}>
                          {check.evidenceIds.length} reference{check.evidenceIds.length === 1 ? "" : "s"} →
                        </button>
                      ) : (
                        <small>—</small>
                      )}
                    </td>
                  </tr>
                ))}
                {!model.checks.length && (
                  <tr>
                    <td colSpan={4}>No governance checks were produced for this run.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "evidence" && (
        <section className="result-section">
          {(Object.keys(grouped) as EvidenceGroup[]).map((group) => (
            <div key={group} className="evidence-group">
              <h4>
                {group} <span className="details-tab-count">{grouped[group].length}</span>
              </h4>
              {grouped[group].length ? (
                <ul className="evidence-list">
                  {grouped[group].map((item, index) => {
                    const id =
                      item.evidenceId ?? item.chunkEvidenceId ?? item.artefactEvidenceId ?? `${group}-${index}`;
                    const downloadId = item.artefactEvidenceId ?? (item.evidenceId?.startsWith("artefact:") ? item.evidenceId : undefined);
                    return (
                      <li key={id} className="evidence-row">
                        <div>
                          <strong>{item.filename ?? id}</strong>
                          {(item.content || typeof item.score === "number") && (
                            <small>
                              {item.content ? `${item.content.slice(0, 160)}${item.content.length > 160 ? "…" : ""}` : ""}
                              {typeof item.score === "number" ? ` · score ${item.score.toFixed(3)}` : ""}
                            </small>
                          )}
                        </div>
                        <div className="evidence-actions">
                          <CopyValueButton value={id} label={`Copy ${id}`} />
                          {downloadId && (
                            <a
                              className="wallet-view-link"
                              href={`/api/v1/artefacts/${encodeURIComponent(downloadId)}/download`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View ↗
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty">No {group.toLowerCase()} evidence.</p>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === "trace" && (
        <section className="result-section">
          <div className="trace-meta">
            <span>
              Latency <strong>{model.latencyMs}ms</strong>
            </span>
            <span>
              Retrieved chunks <strong>{model.retrievalCount}</strong>
            </span>
            {typeof model.llmCalls === "number" && (
              <span>
                LLM calls <strong>{model.llmCalls}</strong>
              </span>
            )}
            {typeof model.embeddingCalls === "number" && (
              <span>
                Embedding calls <strong>{model.embeddingCalls}</strong>
              </span>
            )}
            {model.agentsUsed?.length ? (
              <span>
                Agents <strong>{model.agentsUsed.join(" → ")}</strong>
              </span>
            ) : null}
          </div>
          <details>
            <summary>Analysis path ({model.agentTrace?.length ?? 0} steps)</summary>
            <ol className="trace-list">
              {model.agentTrace?.map((item, index) => (
                <li key={index}>
                  {item.agent}
                  {item.tool ? ` → ${item.tool}` : ""}
                  {item.action ? ` (${item.action})` : ""} · {item.status} · {item.latencyMs}ms ·{" "}
                  {item.evidenceIds.length} evidence
                  {item.error ? ` · error: ${item.error}` : ""}
                </li>
              ))}
              {!model.agentTrace?.length && <li>No agent trace recorded.</li>}
            </ol>
          </details>
          {model.errors?.length ? (
            <div className="alert alert-error">
              <strong>Run errors</strong>
              <ul>
                {model.errors.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
