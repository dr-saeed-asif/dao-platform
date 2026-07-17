"use client";

import { useMemo, useState } from "react";
import { Interface, type LogDescription, type TransactionDescription } from "ethers";
import type { Proposal } from "@/lib/api/types";
import { CopyValueButton } from "@/components/copy-value-button";

const GOVERNANCE_ABI = [
  "function createProposal(string metadataURI, bytes32 metadataHash, uint8 proposalType, uint16 optionCount, uint64 startsAt, uint64 endsAt)",
  "function assignMembers(uint256 proposalId, address[] members)",
  "function unassignMember(uint256 proposalId, address member)",
  "function vote(uint256 proposalId, uint16 optionIndex)",
  "function cancelProposal(uint256 proposalId)",
  "function finalizeProposal(uint256 proposalId)",
  "event ProposalCreated(uint256 indexed proposalId, address indexed creator, uint8 indexed proposalType, bytes32 metadataHash, string metadataURI, uint16 optionCount, uint64 startsAt, uint64 endsAt)",
  "event MemberAssigned(uint256 indexed proposalId, address indexed member)",
  "event MemberUnassigned(uint256 indexed proposalId, address indexed member)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, uint16 indexed optionIndex)",
  "event ProposalCancelled(uint256 indexed proposalId)",
  "event ProposalFinalized(uint256 indexed proposalId, uint16 indexed winningOption, bool tied, uint32 totalVotes)",
] as const;

const typeNames: Record<string, string> = { "0": "STANDARD", "1": "TREASURY", "2": "PARAMETER_CHANGE", "3": "MEMBERSHIP", "255": "OTHER" };

interface RpcTransaction { hash: string; from: string; to: string | null; input?: string; data?: string; value: string; blockNumber: string | null; gas: string; chainId?: string }
interface RpcReceipt { status: string; blockNumber: string; blockHash: string; gasUsed: string; contractAddress: string | null; logs: Array<{ address: string; data: string; topics: string[] }> }
interface DecodedResult { transaction?: RpcTransaction; receipt?: RpcReceipt | null; call: TransactionDescription; events: LogDescription[] }

export function TransactionDecoder({ proposals }: { proposals: Proposal[] }) {
  const abi = useMemo(() => new Interface(GOVERNANCE_ABI), []);
  const [transactionHash, setTransactionHash] = useState("");
  const [rawData, setRawData] = useState("");
  const [result, setResult] = useState<DecodedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function decode(data: string, extras: Partial<DecodedResult> = {}) {
    const normalized = data.trim();
    if (!/^0x[0-9a-fA-F]+$/.test(normalized)) throw new Error("Enter valid hexadecimal calldata beginning with 0x.");
    const call = abi.parseTransaction({ data: normalized });
    if (!call) throw new Error("This data does not match a CyberDAOGovernance ABI function.");
    setResult({ call, events: extras.events ?? [], ...extras });
    setError(null);
  }

  function decodeRaw() {
    try { decode(rawData); } catch (value) { setResult(null); setError(messageOf(value)); }
  }

  async function decodeHash() {
    const hash = transactionHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) { setError("Enter a valid 32-byte transaction hash."); return; }
    setLoading(true);
    setError(null);
    try {
      const transaction = await rpc<RpcTransaction | null>("eth_getTransactionByHash", [hash]);
      if (!transaction) throw new Error("Transaction was not found on the configured CyberChain RPC.");
      const [receipt, chainId] = await Promise.all([
        rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash]),
        rpc<string>("eth_chainId", []),
      ]);
      transaction.chainId ??= chainId;
      const events = (receipt?.logs ?? []).flatMap((log) => {
        try { const parsed = abi.parseLog({ data: log.data, topics: log.topics }); return parsed ? [parsed] : []; } catch { return []; }
      });
      const transactionData = transaction.input ?? transaction.data;
      if (!transactionData) throw new Error("The RPC transaction does not contain calldata.");
      setRawData(transactionData);
      decode(transactionData, { transaction, receipt, events });
    } catch (value) { setResult(null); setError(messageOf(value)); } finally { setLoading(false); }
  }

  const proposal = result ? proposals.find((item) => item.onChainId === proposalIdOf(result.call)) : undefined;

  return (
    <div className="decoder-layout">
      <section className="dashboard-card padded decoder-intro">
        <div><span className="eyebrow">ABI inspector</span><h2>Decode governance activity</h2><p>CyberChain calldata is ABI-encoded, not encrypted. Paste a transaction hash for its confirmed status and events, or paste raw calldata to inspect only the called function and parameters.</p></div>
        <div className="decoder-input-grid">
          <label>Transaction hash<input value={transactionHash} onChange={(event) => setTransactionHash(event.target.value)} placeholder="0x... (64 hexadecimal characters)" spellCheck={false} /><small>Best option: includes receipt status, block, gas and logs.</small></label>
          <button className="button button-primary" disabled={loading} onClick={() => void decodeHash()}>{loading ? "Reading CyberChain..." : "Decode transaction"}</button>
          <label className="decoder-raw-field">Raw transaction data (calldata)<textarea value={rawData} onChange={(event) => setRawData(event.target.value)} placeholder="0x9ff898b4..." spellCheck={false} /><small>Raw data alone has no sender, receipt status, block or gas receipt.</small></label>
          <button className="button button-secondary" onClick={decodeRaw}>Decode raw data</button>
        </div>
        {error && <div className="alert alert-error"><strong>Could not decode</strong><span>{error}</span></div>}
      </section>
      {result ? <DecodedDetails result={result} proposal={proposal} /> : <section className="dashboard-card padded decoder-empty"><strong>No decoded transaction yet</strong><p>Try a vote, proposal creation, member assignment, cancellation or finalization transaction.</p></section>}
      <section className="dashboard-card padded"><span className="eyebrow">Reference</span><h2>CyberDAOGovernance ABI used by this decoder</h2><p className="decoder-help">The first 4 calldata bytes select a function; the remaining 32-byte words contain its ABI-encoded arguments.</p><pre className="abi-code"><code>{GOVERNANCE_ABI.join("\n")}</code></pre></section>
    </div>
  );
}

function DecodedDetails({ result, proposal }: { result: DecodedResult; proposal?: Proposal }) {
  const status = !result.transaction ? "Not available from raw data" : !result.receipt ? "PENDING" : result.receipt.status === "0x1" ? "SUCCESS" : "REVERTED";
  const fields = result.call.fragment.inputs.map((input, index) => ({ name: input.name || `argument${index}`, type: input.type, value: describeValue(input.name, result.call.args[index], proposal) }));
  const fragmentJson = JSON.stringify(JSON.parse(result.call.fragment.format("json")), null, 2);
  return <>
    <section className="dashboard-card padded"><div className="decoder-result-head"><div><span className="eyebrow">Decoded call</span><h2>{result.call.name}</h2></div><span className={`decoder-status ${status === "SUCCESS" ? "success" : status === "REVERTED" ? "failed" : "pending"}`}>{status}</span></div><div className="decoder-facts"><Fact label="ABI function name" value={result.call.name} /><Fact label="Function selector" value={result.call.selector} mono /><Fact label="Solidity signature" value={result.call.fragment.format("sighash")} mono /><Fact label="Local proposal" value={proposal ? `${proposal.title} (#${proposal.onChainId})` : "No matching indexed proposal"} />{result.transaction && <><Fact label="From" value={result.transaction.from} mono /><Fact label="To contract" value={result.transaction.to ?? "Contract deployment"} mono /><Fact label="Transaction hash" value={result.transaction.hash} mono copy /><Fact label="Chain ID" value={fromHex(result.transaction.chainId)} /><Fact label="Block number" value={result.receipt ? fromHex(result.receipt.blockNumber) : "Pending"} /><Fact label="Gas used" value={result.receipt ? fromHex(result.receipt.gasUsed) : "Pending"} /></>}</div></section>
    <section className="dashboard-card padded"><h2>Decoded parameters</h2><div className="decoded-parameters">{fields.map((field) => <div key={field.name}><span>{field.name} <small>{field.type}</small></span><strong>{field.value}</strong></div>)}</div>{proposal && <p className="decoder-help">Matched against the locally indexed proposal, so option labels and proposal title are shown where available.</p>}</section>
    <section className="dashboard-card padded"><h2>Emitted governance events</h2>{result.transaction && !result.receipt ? <p className="decoder-help">The transaction is pending; events do not exist until it is mined.</p> : result.events.length ? <div className="decoder-events">{result.events.map((event, eventIndex) => <div key={`${event.name}-${eventIndex}`}><strong>{event.name}</strong>{event.fragment.inputs.map((input, index) => <p key={`${input.name}-${index}`}><span>{input.name}</span><code>{describeValue(input.name, event.args[index], proposal)}</code></p>)}</div>)}</div> : <p className="decoder-help">{result.transaction ? "No supported governance events were found in this receipt." : "Events cannot be recovered from calldata alone. Use the transaction hash."}</p>}</section>
    <section className="dashboard-card padded"><h2>ABI fragment for this function</h2><pre className="abi-code"><code>{fragmentJson}</code></pre></section>
  </>;
}

function Fact({ label, value, mono = false, copy = false }: { label: string; value: string; mono?: boolean; copy?: boolean }) { return <div><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong>{copy && <CopyValueButton value={value} />}</div>; }
function proposalIdOf(call: TransactionDescription) {
  const index = call.fragment.inputs.findIndex((input) => input.name === "proposalId");
  return index < 0 ? undefined : String(call.args[index]);
}
function describeValue(name: string, value: unknown, proposal?: Proposal): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  const rendered = typeof value === "bigint" ? value.toString() : String(value);
  if (name === "proposalType") return `${rendered} (${typeNames[rendered] ?? "UNKNOWN"})`;
  if (name === "optionIndex") { const label = proposal?.options.find((option) => String(option.index) === rendered)?.label; return label ? `${rendered} (${label})` : rendered; }
  if (name === "startsAt" || name === "endsAt") return `${rendered} (${new Date(Number(rendered) * 1000).toLocaleString()})`;
  return rendered;
}
function fromHex(value?: string | null) { if (!value) return "Not provided by RPC"; try { return BigInt(value).toString(); } catch { return value; } }
async function rpc<T>(method: string, params: unknown[]): Promise<T> { const response = await fetch("/api/cyberchain/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, params }) }); const payload = await response.json() as { result?: T; error?: { message?: string } }; if (!response.ok || payload.error) throw new Error(payload.error?.message ?? "CyberChain RPC request failed."); return payload.result as T; }
function messageOf(value: unknown) { return value instanceof Error ? value.message : "Unable to decode transaction."; }
