import type { AiBatchQueryResponse } from "@/lib/api/types";

export function BatchAnswerCards({ batch }: { batch: AiBatchQueryResponse }) {
  if (batch.combinedAnswer !== undefined) {
    const citations = batch.combinedCitations ?? [];
    const evidence = batch.combinedEvidence ?? [];
    const errors = batch.combinedErrors ?? [];
    return (
      <section className="result-section batch-answer-list" aria-label="Combined answer">
        <h3>Answer · {batch.results.length} questions</h3>
        <article className="batch-answer-card">
          <p className="batch-answer-text" style={{ whiteSpace: "pre-line" }}>{batch.combinedAnswer || "No answer was returned."}</p>
          {citations.length > 0 && <div className="batch-citations" aria-label="Answer citations"><strong>Sources</strong>
            {citations.map((citation) => <span className="batch-citation" key={citation.source_id}>
              [{citation.source_id}] {citation.source_type}{citation.filename ? ` · ${citation.filename}` : ""}
              {citation.page_number ? ` · page ${citation.page_number}` : ""}{citation.block_number != null ? ` · block ${citation.block_number}` : ""}
            </span>)}
          </div>}
          {evidence.length > 0 && <details className="batch-evidence-details"><summary>View evidence ({evidence.length} source groups)</summary>
            <div className="batch-evidence-list">{evidence.map((source, index) => <pre key={source.tool_call_id ?? index}>{JSON.stringify(source.data, null, 2)}</pre>)}</div>
          </details>}
          {errors.length > 0 && <div className="alert alert-error batch-question-error">{errors.map((error, index) => <span key={index}>{error.message ?? error.code ?? "Analysis was partially unavailable."}</span>)}</div>}
        </article>
      </section>
    );
  }
  return (
    <section className="result-section batch-answer-list" aria-label="Batch answers">
      <h3>{batch.results.length === 1 ? "Answer" : "Batch Answers"}</h3>
      {batch.results.map((item, index) => (
        <article className="batch-answer-card" key={item.questionId}>
          <div className="batch-answer-heading">
            {batch.results.length > 1 && <strong>Question {index + 1}</strong>}
            <span className={`result-status result-status-${item.status === "completed" ? "green" : item.status === "failed" ? "red" : "amber"}`}>
              {item.status}
            </span>
          </div>
          <p className="batch-question-text">{item.question}</p>
          <p className="batch-answer-text">{item.answer || "No answer was returned."}</p>
          {item.citations.length > 0 && (
            <div className="batch-citations" aria-label={`Citations for question ${index + 1}`}>
              <strong>Sources</strong>
              {item.citations.map((citation) => (
                <span className="batch-citation" key={`${item.questionId}-${citation.source_id}`}>
                  [{citation.source_id}] {citation.source_type}
                  {citation.filename ? ` · ${citation.filename}` : ""}
                  {citation.page_number ? ` · page ${citation.page_number}` : ""}
                  {citation.block_number != null ? ` · block ${citation.block_number}` : ""}
                </span>
              ))}
            </div>
          )}
          {item.evidence.length > 0 && (
            <details className="batch-evidence-details">
              <summary>View evidence ({item.evidence.length} source groups)</summary>
              <div className="batch-evidence-list">
                {item.evidence.map((source, sourceIndex) => (
                  <pre key={`${source.tool_call_id ?? sourceIndex}`}>
                    {JSON.stringify(source.data, null, 2)}
                  </pre>
                ))}
              </div>
            </details>
          )}
          {item.errors.length > 0 && (
            <div className="alert alert-error batch-question-error">
              {item.errors.map((error, errorIndex) => (
                <span key={errorIndex}>{error.message ?? error.code ?? error.type ?? "Question failed."}</span>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
