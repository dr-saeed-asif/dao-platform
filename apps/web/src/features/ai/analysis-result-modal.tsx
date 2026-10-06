"use client";

import { useEffect } from "react";
import {
  AnalysisResultView,
  CopyAnswerButton,
  ExportMenu,
  OpenFullReportButton,
  type ResultModel,
} from "./analysis-result";

export function AnalysisResultModal({
  model,
  onClose,
}: {
  model: ResultModel | null;
  onClose(): void;
}) {
  useEffect(() => {
    if (!model) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [model, onClose]);

  if (!model) return null;

  return (
    <div
      className="modal-backdrop result-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="result-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Analysis result"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="result-modal-head">
          <div className="result-modal-title">
            <span className="result-doc-icon" aria-hidden="true">▤</span>
            <div>
              <span className="eyebrow">Analysis Result</span>
              <h2>{model.proposalTitle}</h2>
              <p>Detailed governance analysis result using CyberGovAI.</p>
            </div>
          </div>
          <div className="result-modal-actions">
            <CopyAnswerButton answer={model.answer} />
            <ExportMenu model={model} />
            <OpenFullReportButton runId={model.runId} />
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Close result"
            >
              ×
            </button>
          </div>
        </header>
        <div className="result-modal-body">
          <AnalysisResultView model={model} />
          <div className="result-foot">
            <div>
              <strong>Want more details?</strong>
              <p>
                You can open the full report page to view complete evidence,
                technical trace, and detailed analysis.
              </p>
            </div>
            <OpenFullReportButton runId={model.runId} />
          </div>
        </div>
      </div>
    </div>
  );
}
