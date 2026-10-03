export type AgentName = 'coordinator'|'sql'|'rag'|'compliance'|'provenance'|'synthesis'|'verification';
export type ClaimType = 'FACTUAL'|'NUMERIC'|'TEMPORAL'|'SEMANTIC'|'COMPLIANCE';
export type VerificationStatus = 'SUPPORTED'|'PARTIALLY_SUPPORTED'|'UNSUPPORTED';
export type ResearchSystem = 'hybrid'|'hybrid-verified'|'multi-agent';

export interface AgentContext {
  question:string;
  proposalId?:string;
  localProposalId?:string;
  onChainProposalId?:string;
  chainId?:string;
  contractAddress?:string;
  datasetVersion?:string;
  policyVersion?:string;
  topK:number;
  scopeConflict?:string;
}
export interface AgentTask { id:string; agent:AgentName; required:boolean; dependsOn:string[] }
export interface AgentToolCall { tool:string; arguments:Record<string,unknown>; startedAt:string; evidenceIds?:string[]; latencyMs?:number; status?:'success'|'error'; error?:string }
export interface AgentEvidence { evidenceId:string; sourceType:string; proposalId?:string|null; content?:string; score?:number; data?:unknown }
export interface AgentResult { agent:AgentName; facts?:Record<string,unknown>; evidence:AgentEvidence[]; toolCalls:AgentToolCall[]; latencyMs:number; error?:AgentError }
export interface AgentExecutionPlan { intent:'factual'|'temporal'|'semantic'|'compliance'|'provenance'|'mixed'|'unsupported'; tasks:AgentTask[]; requiresSynthesis:boolean; reason:string }
export interface AgentTrace { agent:AgentName|string; action?:string; tool?:string; status:'success'|'error'|'skipped'; evidenceIds:string[]; latencyMs:number; model?:string; inputTokens?:number; outputTokens?:number; error?:string }
export interface AgentError { code:string; message:string; retryable:boolean }
export interface AgentClaim { text:string; type:ClaimType; evidenceIds:string[] }
export interface VerificationItem { claim:AgentClaim; status:VerificationStatus; reasons:string[] }
export interface MultiAgentResponse {
  runId:string; system:ResearchSystem; answer:string; agentsUsed:string[]; toolsUsed:string[];
  evidence:AgentEvidence[]; retrieval:Array<{chunkEvidenceId:string;score:number;rank:number}>;
  claims:AgentClaim[]; verification?:{status:VerificationStatus;claims:VerificationItem[];correctionRounds:number};
  agentTrace:AgentTrace[]; abstained:boolean; latencyMs:number; llmCalls:number; embeddingCalls:number; errors:string[];
}

export interface Agent { readonly name:AgentName; execute(task:AgentTask, context:AgentContext):Promise<AgentResult> }
