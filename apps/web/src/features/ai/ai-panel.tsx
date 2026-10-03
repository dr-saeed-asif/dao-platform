"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CopyValueButton } from "@/components/copy-value-button";
import { daoApi } from "@/lib/api/client";
import type { AiQueryResponse, ResearchSystem } from "@/lib/api/types";

const systems: Array<{value:ResearchSystem;label:string;description:string}> = [
  {value:"hybrid",label:"Hybrid",description:"Combines structured DAO data, blockchain evidence and proposal-document retrieval."},
  {value:"hybrid-verified",label:"Hybrid + Verifier",description:"Hybrid retrieval with claim-level verification and abstention."},
  {value:"multi-agent",label:"Multi-Agent Hybrid + Verifier",description:"Specialized agents coordinate retrieval, compliance, provenance, synthesis and verification."},
];
const suggestions=["Summarize this proposal","How many votes did it receive?","What risks are mentioned in the documents?","Did it satisfy quorum?","Were all voters eligible?","Show the blockchain evidence","Give me a complete governance analysis"];

interface AiPanelProps {proposals:Array<{id:string;title:string;onChainId:string|null}>;selectedProposalId?:string}

export function AiPanel({proposals,selectedProposalId}:AiPanelProps){
  const [question,setQuestion]=useState("");
  const [system,setSystem]=useState<ResearchSystem>("hybrid");
  const [proposalId,setProposalId]=useState(selectedProposalId??"");
  const [loading,setLoading]=useState(false);
  const [response,setResponse]=useState<AiQueryResponse|null>(null);
  useEffect(()=>{if(selectedProposalId)setProposalId(selectedProposalId)},[selectedProposalId]);
  const description=systems.find(item=>item.value===system)?.description;
  const grouped=useMemo(()=>groupSources(response?.evidence??[]),[response]);
  async function submit(event:React.FormEvent){event.preventDefault();if(!question.trim()||!proposalId)return;setLoading(true);setResponse(null);try{setResponse(await daoApi.aiQuery({question:question.trim(),proposalId,system,topK:5}))}catch(error){setResponse({runId:"",system,answer:"",evidence:[],retrieval:[],latencyMs:0,error:error instanceof Error?error.message:"Unknown error"})}finally{setLoading(false)}}
  const verified=system!=="hybrid";
  return <section className="dashboard-card" style={{padding:24}}>
    <div className="card-header"><div><span className="eyebrow">CyberGovAI</span><h2>CyberGovAI Assistant</h2></div><Link className="button button-secondary" href="/analysis">View Research Runs</Link></div>
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>Proposal<select value={proposalId} onChange={e=>setProposalId(e.target.value)} required><option value="">Select proposal</option>{proposals.map(p=><option key={p.id} value={p.id}>{p.title} · #{p.onChainId??"draft"}</option>)}</select></label>
        <label>Research System<select value={system} onChange={e=>setSystem(e.target.value as ResearchSystem)}>{systems.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><small>{description}</small></label>
      </div>
      <label>Question<textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about this proposal, voting, documents, evidence or compliance..." style={{minHeight:110}} /></label>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"10px 0 16px"}}>{suggestions.map(item=><button type="button" className="table-action" key={item} onClick={()=>setQuestion(item)}>{item}</button>)}</div>
      <button className="button button-primary" disabled={loading||!question.trim()||!proposalId}>{loading?"Running analysis…":"Run Analysis"}</button>
    </form>
    {response&&<div style={{marginTop:24}}>
      {response.error&&<div className="alert alert-error">{response.error}</div>}
      <ResultSection title="ANSWER"><div style={{whiteSpace:"pre-wrap"}}>{response.answer||"No answer returned."}</div></ResultSection>
      {verified&&<ResultSection title="VERIFICATION"><strong>{verificationLabel(response.verification?.status,response.abstained)}</strong></ResultSection>}
      <ResultSection title="SOURCES">{Object.entries(grouped).filter(([,items])=>items.length).map(([group,items])=><div key={group} style={{marginBottom:12}}><strong>{group}</strong><ul>{items.map((item,index)=><li key={item.evidenceId??item.chunkEvidenceId??index}><CopyValueButton value={item.evidenceId??item.chunkEvidenceId??item.artefactEvidenceId??""}/>{item.filename?` ${item.filename}`:""}</li>)}</ul></div>)}{!response.evidence.length&&<span>No evidence returned.</span>}</ResultSection>
      {verified&&<ResultSection title="CLAIMS">{response.claims?.length?<ul>{response.claims.map((claim,index)=><li key={index}>{claim.text} — <strong>{response.verification?.claims[index]?.status??"UNVERIFIED"}</strong></li>)}</ul>:<span>No claims produced.</span>}</ResultSection>}
      <details><summary style={{cursor:"pointer",fontWeight:700}}>ANALYSIS PATH</summary><ol>{response.agentTrace?.map((item,index)=><li key={index}>{item.agent}{item.tool?` → ${item.tool}`:""} · {item.status} · {item.latencyMs}ms · {item.evidenceIds.length} evidence</li>)}</ol>{response.system==="multi-agent"&&<p><strong>Agents:</strong> {response.agentsUsed?.join(" → ")||"None"}</p>}</details>
      <p style={{fontSize:12,color:"#6b7280"}}>Run <CopyValueButton value={response.runId}/> · {response.latencyMs}ms</p>
    </div>}
  </section>
}

function ResultSection({title,children}:{title:string;children:React.ReactNode}){return <div style={{borderTop:"1px solid #e5e7eb",padding:"16px 0"}}><h3 style={{fontSize:13,letterSpacing:1}}>{title}</h3>{children}</div>}
function verificationLabel(status?:string,abstained?:boolean){if(abstained||status==="UNSUPPORTED")return "Insufficient Evidence";if(status==="PARTIALLY_SUPPORTED")return "Partially Verified";return status==="SUPPORTED"?"Verified":"Pending"}
function groupSources(items:AiQueryResponse["evidence"]){const groups:Record<string,AiQueryResponse["evidence"]>={Database:[],Blockchain:[],Documents:[],Compliance:[]};for(const item of items){const type=item.sourceType??(item.chunkEvidenceId?"DOCUMENT_CHUNK":"");if(type==="STRUCTURED_DB")groups.Database.push(item);else if(type==="ON_CHAIN_EVENT"||item.evidenceId?.startsWith("event:"))groups.Blockchain.push(item);else if(type==="COMPLIANCE"||item.evidenceId?.startsWith("compliance:"))groups.Compliance.push(item);else groups.Documents.push(item)}return groups}
