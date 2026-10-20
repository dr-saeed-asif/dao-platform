"use client";

import { useEffect, useMemo, useState } from "react";
import { daoApi } from "@/lib/api/client";
import type { AiBatchQueryResponse, Proposal, ResearchRunDetail, ResearchRunSummary } from "@/lib/api/types";

const names:Record<string,string>={hybrid:"Hybrid","hybrid-verified":"Hybrid + Verifier","multi-agent":"Multi-Agent Hybrid + Verifier"};

export function ResearchRuns({ latestBatch }: { latestBatch?: AiBatchQueryResponse | null } = {}){
  const [runs,setRuns]=useState<ResearchRunSummary[]>([]),[proposals,setProposals]=useState<Proposal[]>([]),[detail,setDetail]=useState<ResearchRunDetail|null>(null),[selected,setSelected]=useState<string[]>([]),[loading,setLoading]=useState(true),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false);
  const [filters,setFilters]=useState({proposalId:"",system:"",verificationStatus:"",from:"",to:"",search:""});
  const query=useMemo(()=>{const value=new URLSearchParams();Object.entries(filters).forEach(([key,item])=>{if(item)value.set(key,key==="from"?`${item}T00:00:00.000Z`:key==="to"?`${item}T23:59:59.999Z`:item)});return value.toString()},[filters]);
  useEffect(()=>setPage(1),[query]);
  useEffect(()=>{let active=true;setLoading(true);const pageQuery=[query,`page=${page}`,"limit=50"].filter(Boolean).join("&");Promise.all([daoApi.listResearchRuns(pageQuery),daoApi.listProposals()]).then(([history,proposalList])=>{if(active){setRuns(history.items);setHasMore(history.hasMore);setProposals(proposalList.items)}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[query,page]);
  async function open(runId:string){setDetail(await daoApi.getResearchRun(runId))}
  const compared=runs.filter(run=>selected.includes(run.runId));
  return <>
    {latestBatch && <LatestBatchEvaluation batch={latestBatch}/>}
    <section className="dashboard-card" style={{padding:20}}>
      <div className="form-grid">
        <label>Proposal<select value={filters.proposalId} onChange={e=>setFilters({...filters,proposalId:e.target.value})}><option value="">All proposals</option>{proposals.map(p=><option key={p.id} value={p.id}>{p.title} · #{p.onChainId??"draft"}</option>)}</select></label>
        <label>System<select value={filters.system} onChange={e=>setFilters({...filters,system:e.target.value})}><option value="">All systems</option>{Object.entries(names).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Verification<select value={filters.verificationStatus} onChange={e=>setFilters({...filters,verificationStatus:e.target.value})}><option value="">All statuses</option><option>SUPPORTED</option><option>PARTIALLY_SUPPORTED</option><option>UNSUPPORTED</option></select></label>
        <label>Question search<input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/></label>
        <label>From<input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></label>
        <label>To<input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></label>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginBottom:12}}><a className="button button-secondary" href={daoApi.researchRunsExportUrl(query,"csv")}>Export CSV</a><a className="button button-secondary" href={daoApi.researchRunsExportUrl(query,"json")}>Export JSON</a></div>
      <div className="table-wrap"><table><thead><tr><th></th><th>Date</th><th>Run ID</th><th>Proposal</th><th>System</th><th>Question</th><th>Verification</th><th>Abstained</th><th>Evidence</th><th>Latency</th><th>Tokens</th><th>Status</th></tr></thead><tbody>{runs.map(run=><tr key={run.runId} onClick={()=>void open(run.runId)} style={{cursor:"pointer"}}><td onClick={event=>event.stopPropagation()}><input aria-label={`Compare ${run.runId}`} type="checkbox" checked={selected.includes(run.runId)} onChange={e=>setSelected(e.target.checked?[...selected,run.runId]:selected.filter(id=>id!==run.runId))}/></td><td>{new Date(run.createdAt).toLocaleString()}</td><td className="mono">{run.runId.slice(0,8)}</td><td>#{run.onChainProposalId??run.proposalId??"—"}</td><td>{names[run.system]??run.system}</td><td>{run.question}</td><td>{run.verificationStatus??"Not verified"}</td><td>{run.abstained?"Yes":"No"}</td><td>{run.evidenceCount}</td><td>{run.latencyMs}ms</td><td>{run.tokens??"Unavailable"}</td><td>{run.status}</td></tr>)}</tbody></table></div>
      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:8,marginTop:12}}><button className="button button-secondary" disabled={page===1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Previous</button><span>Page {page}</span><button className="button button-secondary" disabled={!hasMore} onClick={()=>setPage(value=>value+1)}>Next</button></div>
      {loading&&<p>Loading research runs…</p>}{!loading&&!runs.length&&<p>No research runs match these filters.</p>}
    </section>
    {compared.length>1&&<RunComparison runs={compared}/>} 
    {detail&&<ResearchRunDetailView run={detail} onClose={()=>setDetail(null)}/>} 
  </>
}

function LatestBatchEvaluation({batch}:{batch:AiBatchQueryResponse}){
  const m=batch.metrics,wall=typeof m.toolWallMs==="number"&&m.toolWallMs>0?m.toolWallMs:undefined;
  const calls=m.toolCalls??[];
  return <section className="dashboard-card batch-evaluation" style={{padding:20,marginBottom:20}}>
    <div className="card-header"><div><span className="eyebrow">Latest Batch</span><h2>Evaluation Metrics</h2></div><span className={`result-status result-status-${batch.status==="completed"?"green":batch.status==="failed"?"red":"amber"}`}>{batch.status}</span></div>
    <p className="mono">Batch ID: {batch.batchId}</p>
    <div className="table-wrap"><table><thead><tr><th>Batch metric</th><th>Value</th><th>Batch metric</th><th>Value</th></tr></thead><tbody>
      <tr><td>System / model</td><td>{batch.system} · {m.model??"Unavailable"}</td><td>Embedding model / profile</td><td>{m.embeddingModel??"Unavailable"} · {m.embeddingProfile??"Unavailable"}</td></tr>
      <tr><td>Total end to end</td><td>{ms(m.latencyMs)}</td><td>Parallel tool wall time</td><td>{ms(m.toolWallMs)}</td></tr>
      <tr><td>PostgreSQL duration sum</td><td>{ms(m.postgresLatencyMs)}</td><td>Blockchain RPC duration sum</td><td>{ms(m.blockchainRpcLatencyMs)}</td></tr>
      <tr><td>PDF/vector duration sum</td><td>{ms(m.pdfVectorLatencyMs)}</td><td>Embedding / LLM duration</td><td>{ms(m.embeddingLatencyMs)} / {ms(m.generationLatencyMs)}</td></tr>
      <tr><td>Tokens input / output / total</td><td>{m.inputTokens??"Unavailable"} / {m.outputTokens??"Unavailable"} / {m.totalTokens??"Unavailable"}</td><td>Tools / questions</td><td>{m.toolInvocationCount??calls.length} / {batch.results.length}</td></tr>
      <tr><td>Source combination</td><td>{m.sourceCombination??"No sources"}</td><td>Output tokens / second</td><td>{typeof m.outputTokensPerSecond==="number"?m.outputTokensPerSecond:"Unavailable"}</td></tr>
    </tbody></table></div>
    <h3>Parallel execution timeline</h3>
    <div className="table-wrap"><table><thead><tr><th>Tool</th><th>Source</th><th>Timeline</th><th>Latency</th><th>Outcome</th></tr></thead><tbody>
      {calls.map((call,index)=>{const start=typeof call.start_offset_ms==="number"?call.start_offset_ms:undefined,duration=call.duration_ms??0;const hasTimeline=wall!==undefined&&start!==undefined;const left=hasTimeline?Math.min(100,start!/wall!*100):0;const width=hasTimeline?Math.min(100-left,duration/wall!*100):0;return <tr key={`${call.tool??"tool"}-${index}`}><td>{call.tool??"Unavailable"}</td><td>{source(call.tool)}</td><td><div className="batch-timeline-track" title={!hasTimeline?"Timeline unavailable":`Starts at ${start}ms; lasts ${duration}ms`}>{hasTimeline&&<span style={{left:`${left}%`,width:`${width}%`}}/>}</div><small>{!hasTimeline?"Timeline unavailable":`${start}ms → ${duration}ms`}</small></td><td>{ms(call.duration_ms)}</td><td>{call.outcome??call.error_code??"Unavailable"}</td></tr>})}
      {!calls.length&&<tr><td colSpan={5}>No tool timing data was returned.</td></tr>}
    </tbody></table></div>
    <h3>Per-question metrics</h3><div className="table-wrap"><table><thead><tr><th>#</th><th>Question</th><th>Status</th><th>PostgreSQL</th><th>Blockchain</th><th>PDF/vector</th><th>LLM</th><th>Total</th><th>Tokens</th><th>Tools / citations</th></tr></thead><tbody>
      {batch.results.map((row,index)=><tr key={row.questionId}><td>{index+1}</td><td>{row.question}</td><td>{row.status}</td><td>{ms(row.metrics.postgresLatencyMs)}</td><td>{ms(row.metrics.blockchainRpcLatencyMs)}</td><td>{ms(row.metrics.pdfVectorLatencyMs)}</td><td>{ms(row.metrics.generationLatencyMs)}</td><td>{ms(row.metrics.totalLatencyMs)}</td><td>{row.metrics.totalTokens??"Unavailable"}</td><td>{row.metrics.toolInvocationCount??"—"} / {row.metrics.citationCount??"—"}</td></tr>)}
    </tbody></table></div>
    {(batch.errors.length>0||batch.toolErrors.length>0)&&<div className="alert alert-error"><strong>Errors and partial failures</strong>{[...batch.errors,...batch.toolErrors].map((error,index)=><p key={index}>{error.questionId?`${error.questionId}: `:""}{error.message??error.code??"Operation failed."}</p>)}</div>}
  </section>
}
function ms(value:number|null|undefined){return typeof value==="number"?`${value.toFixed(1)}ms`:"Unavailable"}
function source(tool?:string){if(!tool)return"Unavailable";if(tool.startsWith("get_proposal_onchain"))return"Blockchain";if(tool==="search_verified_pdf_evidence")return"PDF/vector";if(["get_proposal_db","get_dao_proposals_db","get_proposal_votes_db"].includes(tool))return"PostgreSQL";return"Other"}

function RunComparison({runs}:{runs:ResearchRunSummary[]}){return <section className="dashboard-card" style={{padding:20,marginTop:20}}><h2>Run Comparison</h2><div className="table-wrap"><table><thead><tr><th>System</th><th>Answer</th><th>Verified?</th><th>Abstained?</th><th>Evidence</th><th>Retrieval</th><th>Supported</th><th>Unsupported</th><th>Latency</th><th>Tokens</th><th>Agents</th></tr></thead><tbody>{runs.map(run=><tr key={run.runId}><td>{names[run.system]??run.system}</td><td>{run.answer}</td><td>{run.verificationStatus??"Not verified"}</td><td>{run.abstained?"Yes":"No"}</td><td>{run.evidenceCount}</td><td>{run.retrievalCount}</td><td>{run.supportedClaims}</td><td>{run.unsupportedClaims}</td><td>{run.latencyMs}ms</td><td>{run.tokens??"Unavailable"}</td><td>{run.agentsUsed.join(", ")||"—"}</td></tr>)}</tbody></table></div></section>}

function ResearchRunDetailView({run,onClose}:{run:ResearchRunDetail;onClose():void}){
  const trace=run.agentTrace??[];
  const retrieval=metric(run.rawOutput?.retrievalLatencyMs),generation=metric(run.rawOutput?.generationLatencyMs),embedding=metric(run.rawOutput?.embeddingLatencyMs);
  const throughput=run.outputTokens!==undefined&&generation!==undefined&&generation>0?run.outputTokens/(generation/1000):undefined;
  const stages:[string,number|undefined][]=[["On-chain RPC",undefined],["PostgreSQL",undefined],["PDF / vector retrieval",retrieval],["Embedding",embedding],["LLM generation",generation],["End to end",run.latencyMs]];
  return <div role="dialog" aria-modal="true" style={{position:"fixed",inset:0,background:"rgba(15,23,42,.45)",zIndex:50,display:"flex",justifyContent:"flex-end"}} onClick={onClose}><aside style={{width:"min(720px,95vw)",height:"100%",overflow:"auto",background:"white",padding:24}} onClick={e=>e.stopPropagation()}><button className="table-action" onClick={onClose}>Close</button><h2>Research Run Detail</h2><Detail label="Run ID" value={run.runId}/><Detail label="Question" value={run.question}/><Detail label="Answer" value={run.answer}/><Detail label="Proposal" value={`#${run.onChainProposalId??run.proposalId??"—"}`}/><Detail label="System" value={names[run.system]??run.system}/><Detail label="Models" value={`${run.models.chat??"Unavailable"} · ${run.models.embedding??"Unavailable"} (${run.models.embeddingDimension??"Unavailable"})`}/><Detail label="Tokens (input / output / total)" value={`${run.inputTokens??"Unavailable"} / ${run.outputTokens??"Unavailable"} / ${run.tokens??"Unavailable"}`}/><Detail label="Output tokens / second" value={throughput===undefined?"Unavailable":throughput.toFixed(2)}/><h3>Execution metrics</h3><div className="table-wrap"><table><thead><tr><th>Stage</th><th>Latency</th></tr></thead><tbody>{stages.map(([name,ms])=><tr key={name}><td>{name}</td><td>{ms===undefined?"Unavailable":`${ms}ms`}</td></tr>)}</tbody></table></div><h3>Execution timeline and tool metrics</h3><div className="table-wrap"><table><thead><tr><th>#</th><th>Agent / tool</th><th>Source</th><th>Latency</th><th>Status</th></tr></thead><tbody>{trace.map((item,index)=><tr key={`${item.tool??item.action??item.agent}-${index}`}><td>{index+1}</td><td>{item.tool??item.action??item.agent}</td><td>{item.agent}</td><td>{typeof item.latencyMs==="number"?`${item.latencyMs}ms`:"Unavailable"}</td><td>{item.status}</td></tr>)}</tbody></table></div><Detail label="Dataset / Policy" value={`${run.datasetVersion??"—"} / ${run.policyVersion??"—"}`}/>{[["Evidence",run.evidence],["Retrieved chunks",run.retrieval],["Claims",run.claims],["Verification",run.verification],["Errors",run.errors]].map(([label,value])=><details key={String(label)}><summary>{String(label)}</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(value,null,2)}</pre></details>)}</aside></div>
}
function Detail({label,value}:{label:string;value:string}){return <p><strong>{label}:</strong> {value}</p>}
function metric(value:unknown):number|undefined{return typeof value==="number"&&Number.isFinite(value)?value:undefined}
