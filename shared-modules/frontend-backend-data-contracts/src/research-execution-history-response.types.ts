import type { AiQueryResponse } from './governance-question-analysis-request-and-response.types';

export interface ResearchRunSummary {runId:string;createdAt:string;proposalId:string|null;onChainProposalId:string|null;system:string;question:string;verificationStatus:string|null;abstained:boolean;evidenceCount:number;retrievalCount:number;supportedClaims:number;unsupportedClaims:number;latencyMs:number;tokens:number;status:string;error:string|null;answer:string;agentsUsed:string[]}

export interface ResearchRunDetail extends ResearchRunSummary {models:{chat:string|null;embedding:string|null;embeddingDimension:number|null};datasetVersion:string|null;policyVersion:string|null;evidence:AiQueryResponse['evidence'];evidenceIds:string[];retrieval:unknown[];claims:unknown[];verification:unknown;toolsUsed:string[];agentTrace:AiQueryResponse['agentTrace'];errors:string[]}
