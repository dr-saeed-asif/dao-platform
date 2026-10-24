"use client";
import { CopyableHash } from "@/components/copy-value-button";
import {
  assistantJson,
  type AssistantResult,
  type BlockchainVerification,
  type ExecutionMetrics,
} from "@/lib/api/assistant";

function ms(value?: number) {
  return value == null ? "Not reported" : `${value.toFixed(1)} ms`;
}
function count(value?: number | null) {
  return value == null ? "Not reported" : String(value);
}
function shown(value: unknown) {
  return value == null
    ? "Not recorded"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
export function ExecutionDetails({ result }: { result: AssistantResult }) {
  const e = result.execution;
  if (!e) return null;
  const spans = e.trace ?? [];
  const agents = e.agents ?? [...new Set(spans.map((s) => s.agent))];
  const tools =
    e.tools ?? spans.filter((s) => s.kind === "tool").map((s) => s.name);
  const models = e.models ?? [
    ...new Set(spans.map((s) => s.model).filter(Boolean)),
  ];
  return (
    <details className="execution-details">
      <summary>Execution Details</summary>
      <dl className="execution-facts">
        <div>
          <dt>Agents executed</dt>
          <dd>{agents.join(", ") || "None yet"}</dd>
        </div>
        <div>
          <dt>Tools called</dt>
          <dd>{tools.join(", ") || "None"}</dd>
        </div>
        <div>
          <dt>LLM models</dt>
          <dd>{models.join(", ") || "No LLM call recorded"}</dd>
        </div>
        <div>
          <dt>Input / output tokens</dt>
          <dd>
            {count(e.input_tokens)} / {count(e.output_tokens)}
          </dd>
        </div>
        <div>
          <dt>Embedding tokens</dt>
          <dd>{count(e.embedding_tokens)}</dd>
        </div>
        <div>
          <dt>Total / agent latency</dt>
          <dd>
            {ms(e.latency_ms)} / {ms(e.agent_ms)}
          </dd>
        </div>
        <div>
          <dt>Tools / retrieval / LLM latency</dt>
          <dd>
            {ms(e.tool_ms)} / {ms(e.retrieval_ms)} / {ms(e.llm_ms)}
          </dd>
        </div>
        <div>
          <dt>Retries</dt>
          <dd>{count(e.retries)}</dd>
        </div>
        <div>
          <dt>Tools succeeded / called</dt>
          <dd>
            {count(e.tool_successes)} / {count(e.tool_calls)}
          </dd>
        </div>
        <div>
          <dt>Citations</dt>
          <dd>{result.citations.join(", ") || "None"}</dd>
        </div>
      </dl>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Agent / operation</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {spans.map((span) => (
              <tr key={span.span_id}>
                <td>{span.kind}</td>
                <td>
                  {span.agent} / {span.name}
                  {span.selected_agent && ` → ${span.selected_agent}`}
                  {span.model && ` · ${span.model}`}
                  {span.attempt && ` · attempt ${span.attempt}`}
                </td>
                <td>{new Date(span.started_at).toLocaleTimeString()}</td>
                <td>{ms(span.latency_ms)}</td>
                <td>
                  {span.status}
                  {span.error_type && ` (${span.error_type})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>
        Measured execution metadata. Missing token counts are not estimated.
        Parallel stage durations may overlap.
      </small>
    </details>
  );
}
export function BlockchainPanel({
  report,
}: {
  report: BlockchainVerification;
}) {
  return (
    <details className="blockchain-verification" open>
      <summary>On-Chain Verification · {report.status}</summary>
      <p>{report.scope}</p>
      <div className="facts">
        <div>
          <span>Chain / proposal</span>
          <strong>
            {report.chain_id} / {report.on_chain_id ?? "Not published"}
          </strong>
        </div>
        <div>
          <span>Snapshot block</span>
          <strong>{report.block_number ?? "Unavailable"}</strong>
        </div>
        <div>
          <span>Voting status</span>
          <strong>{report.voting_status ?? "Unverified"}</strong>
        </div>
      </div>
      <p>
        Contract:{" "}
        <CopyableHash
          value={report.contract}
          display={`${report.contract.slice(0, 12)}...${report.contract.slice(-6)}`}
        />
      </p>
      {report.block_hash && (
        <p>
          Block hash:{" "}
          <CopyableHash
            value={report.block_hash}
            display={`${report.block_hash.slice(0, 18)}...`}
          />
        </p>
      )}
      <p>Observed: {new Date(report.observed_at).toLocaleString()}</p>
      {report.vote_counts && (
        <p>
          On-chain votes by option:{" "}
          {report.vote_counts.map((v, i) => `Option ${i}: ${v}`).join(" · ")}
        </p>
      )}
      {report.errors.map((error, i) => (
        <p className="form-message" key={i}>
          {error}
        </p>
      ))}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Comparison</th>
              <th>Database</th>
              <th>Blockchain</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {report.comparisons.map((c, i) => (
              <tr key={i}>
                <td>{c.field}</td>
                <td>
                  <details>
                    <summary>Inspect</summary>
                    <pre>{shown(c.database)}</pre>
                  </details>
                </td>
                <td>
                  <details>
                    <summary>Inspect</summary>
                    <pre>{shown(c.blockchain)}</pre>
                  </details>
                </td>
                <td>
                  {c.status}
                  {c.reason && ` · ${c.reason}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Governance events ({report.events.length})</summary>
        {report.events.map((event, i) => (
          <p key={i}>
            {String(event.name)} · block {String(event.block_number)} ·{" "}
            {String(event.status)}
            <br />
            <code>{String(event.transaction_hash)}</code>
          </p>
        ))}
      </details>
      <details>
        <summary>Transactions ({report.transactions.length})</summary>
        {report.transactions.map((tx, i) => (
          <p key={i}>
            <code>{String(tx.hash)}</code>
            <br />
            Block {String(tx.block_number ?? "Unavailable")} ·{" "}
            {String(tx.status)}
          </p>
        ))}
      </details>
    </details>
  );
}

export async function exportExecutionMetrics(
  proposalId: string,
  address: string,
  format: "csv" | "json",
) {
  const runs = await assistantJson<
    Array<{
      run_id: string;
      status: string;
      started_at: string;
      metrics: ExecutionMetrics;
      results: AssistantResult[];
    }>
  >(`/runs?proposalId=${encodeURIComponent(proposalId)}`, address);
  const fields = [
    "run_id",
    "status",
    "question_id",
    "agent",
    "model",
    "input_tokens",
    "output_tokens",
    "embedding_tokens",
    "latency_ms",
    "tool_ms",
    "retrieval_ms",
    "llm_ms",
    "tool_calls",
    "tool_successes",
    "retries",
    "blockchain_status",
  ];
  const rows = runs.flatMap((run) =>
    run.results.map((r) => ({
      run_id: run.run_id,
      status: r.status,
      question_id: r.question_id,
      agent: r.agent,
      model: r.execution?.models?.join(";"),
      ...r.execution,
      blockchain_status: r.blockchain_verification?.status,
    })),
  );
  const cell = (value: unknown) =>
    `"${String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const content =
    format === "json"
      ? JSON.stringify(runs, null, 2)
      : [
          fields.join(","),
          ...rows.map((row) =>
            fields
              .map((field) => cell((row as Record<string, unknown>)[field]))
              .join(","),
          ),
        ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], {
      type: format === "json" ? "application/json" : "text/csv",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `execution-metrics.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
