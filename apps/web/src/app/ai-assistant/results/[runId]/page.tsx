"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AnalysisResultView,
  CopyAnswerButton,
  ExportMenu,
  extractChecks,
  type ResultModel,
} from "@/features/ai/analysis-result";
import { daoApi } from "@/lib/api/client";
import type { ResearchRunDetail } from "@/lib/api/types";

function toModel(detail: ResearchRunDetail): ResultModel {
  const claims = (detail.claims ?? []).filter(
    (
      claim,
    ): claim is { text: string; type: string; evidenceIds: string[] } =>
      Boolean(claim) &&
      typeof (claim as { text?: unknown }).text === "string" &&
      Array.isArray((claim as { evidenceIds?: unknown }).evidenceIds),
  );
  const ref = detail.onChainProposalId ?? detail.proposalId ?? "—";
  const status = detail.error
    ? "Failed"
    : detail.abstained
      ? "Abstained"
      : "Completed";
  return {
    runId: detail.runId,
    question: detail.question,
    system: detail.system,
    proposalTitle: `Proposal #${ref}`,
    proposalRef: `#${ref}`,
    completedAt: new Date(detail.createdAt).toLocaleString(),
    status,
    statusTone: status === "Completed" ? "green" : status === "Failed" ? "red" : "amber",
    answer: detail.answer,
    checks: extractChecks(claims, detail.evidence),
    evidence: detail.evidence,
    agentTrace: detail.agentTrace,
    agentsUsed: detail.agentsUsed,
    latencyMs: detail.latencyMs,
    retrievalCount: detail.retrievalCount,
    errors: detail.errors,
  };
}

export default function AnalysisReportPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const [detail, setDetail] = useState<ResearchRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    daoApi
      .getResearchRun(runId)
      .then((result) => {
        if (active) {
          setDetail(result);
          setError(null);
        }
      })
      .catch((value: unknown) => {
        if (active)
          setError(
            value instanceof Error ? value.message : "Unable to load this report.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runId]);

  const model = useMemo(() => (detail ? toModel(detail) : null), [detail]);

  return (
    <main className="dashboard-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CyberGovAI</span>
          <h1>Analysis Report</h1>
          <p>Complete evidence, technical trace, and detailed analysis.</p>
        </div>
        <Link className="button button-secondary" href="/">
          Back to AI Assistant
        </Link>
      </div>
      {loading && <p>Loading report…</p>}
      {error && (
        <div className="alert alert-error">
          <strong>Could not load report</strong>
          <span>{error}</span>
        </div>
      )}
      {model && (
        <section className="dashboard-card padded">
          <div className="result-report-head">
            <div>
              <span className="eyebrow">Analysis Result</span>
              <h2>{model.proposalTitle}</h2>
              <p>
                Chat {detail?.models.chat ?? "—"} · Embedding{" "}
                {detail?.models.embedding ?? "—"}
                {detail?.models.embeddingDimension
                  ? ` (${detail.models.embeddingDimension})`
                  : ""}
              </p>
            </div>
            <div className="result-modal-actions">
              <CopyAnswerButton answer={model.answer} />
              <ExportMenu model={model} />
            </div>
          </div>
          <AnalysisResultView model={model} />
        </section>
      )}
    </main>
  );
}
