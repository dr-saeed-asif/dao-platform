"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { daoApi } from "@/lib/api/client";
import type { AiQueryResponse, ResearchSystem } from "@/lib/api/types";
import { AnalysisResultModal } from "./analysis-result-modal";
import { extractChecks, type ResultModel } from "./analysis-result";

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
  const [modalOpen,setModalOpen]=useState(false);
  const [completedAt,setCompletedAt]=useState("");
  useEffect(()=>{if(selectedProposalId)setProposalId(selectedProposalId)},[selectedProposalId]);
  const description=systems.find(item=>item.value===system)?.description;
  async function submit(event:React.FormEvent){event.preventDefault();if(!question.trim()||!proposalId)return;setLoading(true);setResponse(null);setModalOpen(false);try{const result=await daoApi.aiQuery({question:question.trim(),proposalId,system,topK:5});setResponse(result);setCompletedAt(new Date().toLocaleString());if(result.runId)setModalOpen(true)}catch(error){setResponse({runId:"",system,answer:"",evidence:[],retrieval:[],latencyMs:0,error:error instanceof Error?error.message:"Unknown error"})}finally{setLoading(false)}}
  const model:ResultModel|null=useMemo(()=>{
    if(!response?.runId)return null;
    const selected=proposals.find(item=>item.id===proposalId);
    const status=response.error?"Failed":response.abstained?"Abstained":"Completed";
    return {
      runId:response.runId,
      question:question.trim(),
      system,
      proposalTitle:selected?`${selected.title} - #${selected.onChainId??"draft"}`:"Analysis Result",
      proposalRef:selected?`#${selected.onChainId??"draft"}`:"—",
      completedAt,
      status,
      statusTone:status==="Completed"?"green":status==="Failed"?"red":"amber",
      answer:response.answer,
      checks:extractChecks(response.claims,response.evidence),
      evidence:response.evidence,
      agentTrace:response.agentTrace,
      agentsUsed:response.agentsUsed,
      latencyMs:response.latencyMs,
      retrievalCount:response.retrieval.length,
      llmCalls:response.llmCalls,
      embeddingCalls:response.embeddingCalls,
      errors:response.errors,
    };
  },[response,question,system,proposalId,proposals,completedAt]);
  return <section className="dashboard-card" style={{padding:24}}>
    <div className="card-header"><div><span className="eyebrow">CyberGovAI</span><h2>CyberGovAI Assistant</h2></div><Link className="button button-secondary" href="/analysis">View Research Runs</Link></div>
    <form onSubmit={submit} className="ai-form">
      <div className="form-grid">
        <label>Proposal<select value={proposalId} onChange={e=>setProposalId(e.target.value)} required><option value="">Select proposal</option>{proposals.map(p=><option key={p.id} value={p.id}>{p.title} · #{p.onChainId??"draft"}</option>)}</select></label>
        <label>Research System<select value={system} onChange={e=>setSystem(e.target.value as ResearchSystem)}>{systems.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><small>{description}</small></label>
      </div>
      <label>Question<textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about this proposal, voting, documents, evidence or compliance..." style={{minHeight:110}} /></label>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"10px 0 16px"}}>{suggestions.map(item=><button type="button" className="table-action" key={item} onClick={()=>setQuestion(item)}>{item}</button>)}</div>
      <button className="button button-primary" disabled={loading||!question.trim()||!proposalId}>{loading?"Running analysis…":"Run Analysis"}</button>
    </form>
    {response?.error&&<div className="alert alert-error" style={{marginTop:24}}>{response.error}</div>}
    {model&&!modalOpen&&<div style={{marginTop:24,display:"flex",justifyContent:"flex-end"}}><button type="button" className="button button-secondary" onClick={()=>setModalOpen(true)}>View result</button></div>}
    <AnalysisResultModal model={modalOpen?model:null} onClose={()=>setModalOpen(false)} />
  </section>
}
