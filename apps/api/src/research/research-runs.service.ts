import { checkRequestBudget, remainingRequestMs } from '../ai/request-budget';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'kysely';
import { PostgresService } from '../database/postgres.service';
import type { AgentContext, MultiAgentResponse, ResearchSystem } from '../ai/agents/agent.types';
import { resolveAiProviderConfig, type AiProviderConfig } from '../ai/ai-provider.config';

type StoredSystem = ResearchSystem|'llm-only'|'vector-rag';
type RunOutput = {runId:string;system:StoredSystem;answer:string;latencyMs:number;evidence?:any[];retrieval?:Array<{chunkEvidenceId:string;score:number;rank:number}>;claims?:MultiAgentResponse['claims'];verification?:MultiAgentResponse['verification'];agentsUsed?:string[];toolsUsed?:string[];agentTrace?:MultiAgentResponse['agentTrace'];abstained?:boolean;errors?:string[];inputTokens?:number;outputTokens?:number;error?:string};
export interface RunFilters {proposalId?:string;system?:string;verificationStatus?:string;from?:string;to?:string;search?:string;page?:number;limit?:number}

@Injectable()
export class ResearchRunsService {
  private readonly ai: AiProviderConfig;
  constructor(private readonly postgres:PostgresService,config:ConfigService){this.ai=resolveAiProviderConfig(config);}
  private get db(){return this.postgres.database;}

  async record(request:{question:string;proposalId?:string;topK?:number;datasetVersion?:string;policyVersion?:string},context:AgentContext|undefined,output:RunOutput,error?:string){
    const evidenceIds=[...new Set((output.evidence??[]).flatMap((item:any)=>[item.evidenceId,item.chunkEvidenceId,item.artefactEvidenceId].filter(Boolean)))];
    const verificationStatus=output.verification?.status;
    const inputTokens=output.inputTokens??sumTraceTokens(output.agentTrace,'inputTokens');
    const outputTokens=output.outputTokens??sumTraceTokens(output.agentTrace,'outputTokens');
    const configuration={provider:this.ai.provider,proposalId:context?.localProposalId??request.proposalId,onChainProposalId:context?.onChainProposalId,chainId:context?.chainId,contractAddress:context?.contractAddress,topK:request.topK??5,datasetVersion:request.datasetVersion,policyVersion:request.policyVersion,verificationStatus,evidenceIds,agentsUsed:output.agentsUsed??[],toolsUsed:output.toolsUsed??[],agentTrace:output.agentTrace??[],abstained:output.abstained??false,errors:output.errors??(error?[error]:[])};
    try{
      checkRequestBudget();
      await this.db.transaction().execute(async tx=>{
        checkRequestBudget();
        await sql`SELECT set_config('statement_timeout', ${String(Math.max(1, Math.min(750, remainingRequestMs())))}, true)`.execute(tx);
        const run=await tx.insertInto('experiment_runs').values({run_id:output.runId,system:output.system,dataset_version_id:null,policy_id:null,git_commit:'dev',chat_model:`${this.ai.provider}:${this.ai.chatModel}`,embedding_model:this.ai.embeddingIdentity,embedding_dimension:this.ai.embeddingDimension,seed:BigInt(0),configuration:JSON.stringify(configuration),started_at:new Date(Date.now()-output.latencyMs),completed_at:new Date(),status:error||output.error?'ERROR':'COMPLETED'}).returning('id').executeTakeFirstOrThrow();
        const question=await tx.insertInto('questions').values({question_id:`q_${output.runId}`,proposal_id:context?.onChainProposalId&&/^\d+$/.test(context.onChainProposalId)?BigInt(context.onChainProposalId):null,category:'ai-query',question:request.question,canonical_answer:output.answer,required_evidence_ids:JSON.stringify(evidenceIds),answerable:!(output.abstained??false),dataset_version_id:null,metadata:JSON.stringify({proposalId:context?.localProposalId,onChainProposalId:context?.onChainProposalId,system:output.system})}).returning('id').executeTakeFirstOrThrow();
        const answer=await tx.insertInto('answers').values({experiment_run_id:run.id,question_id:question.id,answer_text:output.answer,latency_ms:BigInt(output.latencyMs),input_tokens:inputTokens===undefined?null:BigInt(inputTokens),output_tokens:outputTokens===undefined?null:BigInt(outputTokens),error:error??output.error??null,raw_output:JSON.stringify(output)}).returning('id').executeTakeFirstOrThrow();
        checkRequestBudget();
        const claims=(output.claims??[]).map((claim,index)=>{
          const verified=output.verification?.claims[index];
          return {answer_id:answer.id,claim_index:index,claim_text:claim.text,evidence_ids:JSON.stringify(claim.evidenceIds),support_status:verified?.status??null,verification_details:verified?JSON.stringify(verified):null};
        });
        if(claims.length) await tx.insertInto('claims').values(claims).execute();
        checkRequestBudget();
        const retrieval=(output.retrieval??[]).map((item,index)=>({experiment_run_id:run.id,question_id:question.id,rank:item.rank??index+1,evidence_id:item.chunkEvidenceId,retrieval_method:'vector',score:item.score,metadata:JSON.stringify({})}));
        if(retrieval.length) await tx.insertInto('retrieval_results').values(retrieval).onConflict(oc=>oc.columns(['experiment_run_id','question_id','retrieval_method','rank']).doNothing()).execute();
        checkRequestBudget();
      });
    }catch(recordError){console.error('Failed to record AI run:',recordError);}
  }

  async list(filters:RunFilters={}){
    const page=Math.max(1,filters.page??1),limit=Math.max(1,Math.min(filters.limit??50,200));
    let query=this.baseQuery();
    if(filters.system)query=query.where('experiment_runs.system','=',filters.system);
    if(filters.verificationStatus)query=query.where(sql<boolean>`experiment_runs.configuration ->> 'verificationStatus' = ${filters.verificationStatus}`);
    if(filters.proposalId)query=query.where(sql<boolean>`(experiment_runs.configuration ->> 'proposalId' = ${filters.proposalId} OR experiment_runs.configuration ->> 'onChainProposalId' = ${filters.proposalId})`);
    if(filters.from)query=query.where('experiment_runs.created_at','>=',new Date(filters.from));
    if(filters.to)query=query.where('experiment_runs.created_at','<=',new Date(filters.to));
    if(filters.search)query=query.where(sql<boolean>`questions.question ILIKE ${`%${filters.search}%`}`);
    const rows=await query.orderBy('experiment_runs.created_at','desc').limit(limit).offset((page-1)*limit).execute();
    return {items:rows.map(row=>summary(row)),page,limit,hasMore:rows.length===limit};
  }

  async detail(runId:string){
    const row=await this.baseQuery().where('experiment_runs.run_id','=',runId).executeTakeFirst();
    if(!row)throw new NotFoundException('Research run not found.');
    const [claims,retrieval]=await Promise.all([
      this.db.selectFrom('claims').innerJoin('answers','answers.id','claims.answer_id').innerJoin('experiment_runs','experiment_runs.id','answers.experiment_run_id').selectAll('claims').where('experiment_runs.run_id','=',runId).orderBy('claims.claim_index').execute(),
      this.db.selectFrom('retrieval_results').innerJoin('experiment_runs','experiment_runs.id','retrieval_results.experiment_run_id').selectAll('retrieval_results').where('experiment_runs.run_id','=',runId).orderBy('retrieval_results.rank').execute(),
    ]);
    const config=json(row.configuration),raw=json(row.raw_output);
    return {...summary(row),answer:row.answer_text??'',models:{chat:row.chat_model,embedding:row.embedding_model,embeddingDimension:row.embedding_dimension},datasetVersion:config.datasetVersion??null,policyVersion:config.policyVersion??null,evidence:raw.evidence??[],evidenceIds:config.evidenceIds??[],retrieval,claims,verification:raw.verification??null,agentsUsed:config.agentsUsed??[],toolsUsed:config.toolsUsed??[],agentTrace:config.agentTrace??[],errors:config.errors??[],rawOutput:raw};
  }

  async export(filters:RunFilters,format:'csv'|'json'){
    const items:any[]=[];let page=1,hasMore=true;
    while(hasMore){const batch=await this.list({...filters,page,limit:200});items.push(...batch.items);hasMore=batch.hasMore;page++;}
    const details=await Promise.all(items.map(item=>this.detail(item.runId)));
    if(format==='json')return {contentType:'application/json',filename:'cybergovai-research-runs.json',body:JSON.stringify(details,null,2)};
    const headers=['runId','timestamp','proposalId','question','system','verificationStatus','abstained','evidenceCount','retrievalCount','supportedClaims','unsupportedClaims','latencyMs','tokens','chatModel','embeddingModel','datasetVersion','policyVersion','error'];
    const lines=[headers.join(','),...details.map(item=>{const row=exportRow(item) as Record<string,unknown>;return headers.map(key=>csv(row[key])).join(',');})];
    return {contentType:'text/csv; charset=utf-8',filename:'cybergovai-research-runs.csv',body:lines.join('\n')};
  }

  private baseQuery(){return this.db.selectFrom('experiment_runs').innerJoin('answers','answers.experiment_run_id','experiment_runs.id').innerJoin('questions','questions.id','answers.question_id').select(['experiment_runs.run_id','experiment_runs.system','experiment_runs.configuration','experiment_runs.status','experiment_runs.created_at','experiment_runs.chat_model','experiment_runs.embedding_model','experiment_runs.embedding_dimension','questions.question','questions.proposal_id','answers.answer_text','answers.raw_output','answers.latency_ms','answers.input_tokens','answers.output_tokens','answers.error']);}
}

function json(value:unknown):Record<string,any>{if(!value)return {};if(typeof value==='string'){try{return JSON.parse(value)}catch{return {};}}return value as Record<string,any>}
function sumTraceTokens(trace:MultiAgentResponse['agentTrace']|undefined,key:'inputTokens'|'outputTokens'){if(!trace)return undefined;const values=trace.map(item=>item[key]).filter((value):value is number=>typeof value==='number');return values.length?values.reduce((sum,value)=>sum+value,0):undefined}
function summary(row:any){const config=json(row.configuration),raw=json(row.raw_output);const claims=raw.claims??[];const verified=raw.verification?.claims??[];return {runId:row.run_id,createdAt:row.created_at,proposalId:config.proposalId??null,onChainProposalId:config.onChainProposalId??row.proposal_id??null,system:row.system,question:row.question,verificationStatus:config.verificationStatus??null,abstained:Boolean(config.abstained),evidenceCount:(config.evidenceIds??[]).length,retrievalCount:(raw.retrieval??[]).length,supportedClaims:verified.filter((item:any)=>item.status==='SUPPORTED').length,unsupportedClaims:verified.filter((item:any)=>item.status==='UNSUPPORTED').length,latencyMs:Number(row.latency_ms??0),tokens:Number(row.input_tokens??0)+Number(row.output_tokens??0),status:row.status,error:row.error??null,answer:row.answer_text??'',agentsUsed:config.agentsUsed??[]};}
function exportRow(item:any){return {runId:item.runId,timestamp:item.createdAt,proposalId:item.proposalId,question:item.question,system:item.system,verificationStatus:item.verificationStatus,abstained:item.abstained,evidenceCount:item.evidenceCount,retrievalCount:item.retrievalCount,supportedClaims:item.supportedClaims,unsupportedClaims:item.unsupportedClaims,latencyMs:item.latencyMs,tokens:item.tokens,chatModel:item.models.chat,embeddingModel:item.models.embedding,datasetVersion:item.datasetVersion,policyVersion:item.policyVersion,error:item.error};}
function csv(value:unknown){const text=value==null?'':String(value);return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
