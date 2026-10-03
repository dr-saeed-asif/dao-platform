"use client";

import { useEffect, useMemo, useState } from "react";
import { daoApi } from "@/lib/api/client";
import type { Proposal, ResearchRunDetail, ResearchRunSummary } from "@/lib/api/types";

const names:Record<string,string>={hybrid:"Hybrid","hybrid-verified":"Hybrid + Verifier","multi-agent":"Multi-Agent Hybrid + Verifier"};

export function ResearchRuns(){
  const [runs,setRuns]=useState<ResearchRunSummary[]>([]),[proposals,setProposals]=useState<Proposal[]>([]),[detail,setDetail]=useState<ResearchRunDetail|null>(null),[selected,setSelected]=useState<string[]>([]),[loading,setLoading]=useState(true),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false);
  const [filters,setFilters]=useState({proposalId:"",system:"",verificationStatus:"",from:"",to:"",search:""});
  const query=useMemo(()=>{const value=new URLSearchParams();Object.entries(filters).forEach(([key,item])=>{if(item)value.set(key,key==="from"?`${item}T00:00:00.000Z`:key==="to"?`${item}T23:59:59.999Z`:item)});return value.toString()},[filters]);
  useEffect(()=>setPage(1),[query]);
  useEffect(()=>{let active=true;setLoading(true);const pageQuery=[query,`page=${page}`,"limit=50"].filter(Boolean).join("&");Promise.all([daoApi.listResearchRuns(pageQuery),daoApi.listProposals()]).then(([history,proposalList])=>{if(active){setRuns(history.items);setHasMore(history.hasMore);setProposals(proposalList.items)}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[query,page]);
  async function open(runId:string){setDetail(await daoApi.getResearchRun(runId))}
  const compared=runs.filter(run=>selected.includes(run.runId));
  return <>
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
      <div className="table-wrap"><table><thead><tr><th></th><th>Date</th><th>Run ID</th><th>Proposal</th><th>System</th><th>Question</th><th>Verification</th><th>Abstained</th><th>Evidence</th><th>Latency</th><th>Tokens</th><th>Status</th></tr></thead><tbody>{runs.map(run=><tr key={run.runId} onClick={()=>void open(run.runId)} style={{cursor:"pointer"}}><td onClick={event=>event.stopPropagation()}><input aria-label={`Compare ${run.runId}`} type="checkbox" checked={selected.includes(run.runId)} onChange={e=>setSelected(e.target.checked?[...selected,run.runId]:selected.filter(id=>id!==run.runId))}/></td><td>{new Date(run.createdAt).toLocaleString()}</td><td className="mono">{run.runId.slice(0,8)}</td><td>#{run.onChainProposalId??run.proposalId??"—"}</td><td>{names[run.system]??run.system}</td><td>{run.question}</td><td>{run.verificationStatus??"Not verified"}</td><td>{run.abstained?"Yes":"No"}</td><td>{run.evidenceCount}</td><td>{run.latencyMs}ms</td><td>{run.tokens}</td><td>{run.status}</td></tr>)}</tbody></table></div>
      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:8,marginTop:12}}><button className="button button-secondary" disabled={page===1} onClick={()=>setPage(value=>Math.max(1,value-1))}>Previous</button><span>Page {page}</span><button className="button button-secondary" disabled={!hasMore} onClick={()=>setPage(value=>value+1)}>Next</button></div>
      {loading&&<p>Loading research runs…</p>}{!loading&&!runs.length&&<p>No research runs match these filters.</p>}
    </section>
    {compared.length>1&&<RunComparison runs={compared}/>} 
    {detail&&<ResearchRunDetailView run={detail} onClose={()=>setDetail(null)}/>} 
  </>
}

function RunComparison({runs}:{runs:ResearchRunSummary[]}){return <section className="dashboard-card" style={{padding:20,marginTop:20}}><h2>Run Comparison</h2><div className="table-wrap"><table><thead><tr><th>System</th><th>Answer</th><th>Verified?</th><th>Abstained?</th><th>Evidence</th><th>Retrieval</th><th>Supported</th><th>Unsupported</th><th>Latency</th><th>Tokens</th><th>Agents</th></tr></thead><tbody>{runs.map(run=><tr key={run.runId}><td>{names[run.system]??run.system}</td><td>{run.answer}</td><td>{run.verificationStatus??"Not verified"}</td><td>{run.abstained?"Yes":"No"}</td><td>{run.evidenceCount}</td><td>{run.retrievalCount}</td><td>{run.supportedClaims}</td><td>{run.unsupportedClaims}</td><td>{run.latencyMs}ms</td><td>{run.tokens}</td><td>{run.agentsUsed.join(", ")||"—"}</td></tr>)}</tbody></table></div></section>}

function ResearchRunDetailView({run,onClose}:{run:ResearchRunDetail;onClose():void}){return <div role="dialog" aria-modal="true" style={{position:"fixed",inset:0,background:"rgba(15,23,42,.45)",zIndex:50,display:"flex",justifyContent:"flex-end"}} onClick={onClose}><aside style={{width:"min(720px,95vw)",height:"100%",overflow:"auto",background:"white",padding:24}} onClick={e=>e.stopPropagation()}><button className="table-action" onClick={onClose}>Close</button><h2>Research Run Detail</h2><Detail label="Run ID" value={run.runId}/><Detail label="Question" value={run.question}/><Detail label="Answer" value={run.answer}/><Detail label="Proposal" value={`#${run.onChainProposalId??run.proposalId??"—"}`}/><Detail label="System" value={names[run.system]??run.system}/><Detail label="Models" value={`${run.models.chat??"—"} · ${run.models.embedding??"—"} (${run.models.embeddingDimension??"—"})`}/><Detail label="Dataset / Policy" value={`${run.datasetVersion??"—"} / ${run.policyVersion??"—"}`}/><Detail label="Latency / Tokens" value={`${run.latencyMs}ms / ${run.tokens}`}/>{[["Evidence",run.evidence],["Retrieved chunks",run.retrieval],["Claims",run.claims],["Verification",run.verification],["Agents used",run.agentsUsed],["Tools used",run.toolsUsed],["Agent trace",run.agentTrace],["Errors",run.errors]].map(([label,value])=><details key={String(label)}><summary>{String(label)}</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(value,null,2)}</pre></details>)}</aside></div>}
function Detail({label,value}:{label:string;value:string}){return <p><strong>{label}:</strong> {value}</p>}
