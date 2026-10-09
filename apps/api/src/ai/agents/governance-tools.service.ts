import { Injectable, OnModuleInit } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import { VectorSearchService } from '../vector-search.service';
import { ProposalQueryService } from '../../proposals/proposal-query.service';
import { ToolRegistry, requireString } from './tool-registry';

export interface ComplianceResult {
  ruleId: 'GOV-01' | 'GOV-02' | 'GOV-03' | 'GOV-04' | 'GOV-05' | 'GOV-06';
  result: 'PASS' | 'FAIL' | 'INDETERMINATE';
  reason?: string;
  inputs?: Record<string, unknown>;
  policyVersion?: string | null;
  evidenceIds: string[];
  explanationData?: Record<string, unknown>;
}

const schema=(required:string[]=[])=>({type:'object',required,additionalProperties:false});
const agents={sql:['sql'] as const,rag:['rag'] as const,compliance:['compliance'] as const,provenance:['provenance'] as const};

@Injectable()
export class GovernanceToolsService implements OnModuleInit {
  constructor(private readonly postgres:PostgresService,private readonly vector:VectorSearchService,private readonly registry:ToolRegistry,private readonly proposalQueries:ProposalQueryService){}
  private get db(){return this.postgres.database;}
  onModuleInit(){
    this.add('getProposalTimeline','Get canonical governance events for a proposal.',agents.sql,['proposalId'],(x)=>this.getTimeline(String(x.proposalId)));
    this.add('getProposalArtefacts','Get linked artefact evidence.',agents.provenance,['proposalId'],(x)=>this.getArtefacts(String(x.proposalId)));
    this.add('getProposalEvidence','Get all canonical event and artefact evidence IDs.',agents.provenance,['proposalId'],(x)=>this.getProposalEvidence(String(x.proposalId)));
    this.add('vectorSearch','Retrieve existing pgvector chunks.',agents.rag,['question'],(x)=>this.vector.search(String(x.question),{proposalId:x.proposalId?String(x.proposalId):undefined,topK:Number(x.topK??5)}));
    this.add('getEvidenceById','Resolve and validate a stored evidence record.',agents.provenance,['evidenceId'],(x)=>this.getEvidence(String(x.evidenceId),x.datasetVersion?String(x.datasetVersion):undefined));
  }
  private add(name:string,description:string,allowedAgents:readonly any[],required:string[],execute:(input:Record<string,unknown>)=>Promise<unknown>){
    if (this.registry.has(name)) return;
    this.registry.register({name,description,inputSchema:schema(required),outputSchema:{type:'object'},allowedAgents:[...allowedAgents],timeoutMs:10_000,readOnly:true,validate(input){for(const key of required)requireString(input,key);},execute});
  }
  private async getProposal(id:string,daoId?:string){
    const resolved = await this.proposalQueries.resolveProposal(id, daoId ?? null);
    if (!resolved) return undefined;
    const proposal=await this.db.selectFrom('proposals').selectAll().where('id', '=', resolved.id).executeTakeFirst();
    if(!proposal||daoId&&proposal.dao_id!==daoId)return undefined;
    const [members,options]=await Promise.all([
      this.db.selectFrom('proposal_assignments').selectAll().where('proposal_id','=',proposal.id).where('assigned','=',true).orderBy('member_address').execute(),
      this.db.selectFrom('proposal_options').selectAll().where('proposal_id','=',proposal.id).orderBy('option_index').execute(),
    ]);
    return {...proposal,members,options};
  }
  private async getVotes(id:string,daoId?:string){
    const proposal=await this.getProposal(id,daoId); if(!proposal)return {proposal:null,votes:[],count:0,evidenceIds:[]};
    const votes = await this.db.selectFrom('votes')
      .innerJoin('governance_events', 'governance_events.evidence_id', 'votes.evidence_id')
      .selectAll('votes')
      .where('votes.proposal_id', '=', proposal.id)
      .where('governance_events.chain_id', '=', proposal.chain_id)
      .where('governance_events.contract_address', '=', proposal.contract_address)
      .where('governance_events.proposal_id', '=', proposal.on_chain_id)
      .where('governance_events.event_name', '=', 'VoteCast')
      .where('governance_events.canonical', '=', true)
      .orderBy('governance_events.block_number')
      .orderBy('governance_events.transaction_index')
      .orderBy('governance_events.log_index')
      .execute();
    return {proposal,votes,count:votes.length,totalVotingPower:votes.reduce((n,v)=>n+v.voting_weight,0),evidenceIds:votes.map(v=>v.evidence_id)};
  }
  private async getTimeline(id:string,daoId?:string){
    const proposal=await this.getProposal(id,daoId); if(!proposal)return {proposal:null,events:[],evidenceIds:[]};
    const timeline = await this.proposalQueries.getProposalTimeline({ proposalId: proposal.id, daoId: daoId ?? null });
    const events = timeline.events.map(event => ({
      event_name: event.eventName, event_args: event.eventArgs, evidence_id: event.evidenceId,
    }));
    return {proposal,events,evidenceIds:events.map(e=>e.evidence_id)};
  }
  private async getMemberActivity(id:string,member:string,daoId?:string){const proposal=await this.getProposal(id,daoId);if(!proposal)return {proposal:null}; const [assignment,votes]=await Promise.all([this.db.selectFrom('proposal_assignments').selectAll().where('proposal_id','=',proposal.id).where('member_address','=',member).executeTakeFirst(),this.db.selectFrom('votes').selectAll().where('proposal_id','=',proposal.id).where('voter_address','=',member).execute()]);return {proposal,assignment,votes,evidenceIds:[assignment?.latest_evidence_id,...votes.map(v=>v.evidence_id)].filter((value):value is string=>Boolean(value))};}
  private async policy(version?:string){let q=this.db.selectFrom('research_policies').selectAll();if(version)q=q.where('policy_version','=',version);return q.orderBy('created_at','desc').executeTakeFirst();}
  async calculateQuorum(id:string,version?:string,daoId?:string):Promise<ComplianceResult>{
    const [{proposal,votes,count,totalVotingPower},policy]=await Promise.all([this.getVotes(id,daoId),this.policy(version)]); const evidenceIds=votes.map((v:any)=>v.evidence_id);
    if(!proposal)return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'Proposal not found',evidenceIds};
    if(!policy)return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'No research policy found',inputs:{voteCount:count,totalVotingPower},policyVersion:version??null,evidenceIds};
    let value:any;
    try{value=typeof policy.quorum_policy==='string'?JSON.parse(policy.quorum_policy):policy.quorum_policy;}catch{return {ruleId:'GOV-01' as const,result:'INDETERMINATE' as const,reason:'Policy quorum configuration is invalid',policyVersion:policy.policy_version,evidenceIds};}
    if(!value||typeof value!=='object'||Array.isArray(value))return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'Policy quorum configuration is invalid',policyVersion:policy.policy_version,evidenceIds};
    const rawThresholds = [value.requiredVotingPower ?? value.minimumVotingPower, value.requiredVotes ?? value.minimumVotes].filter(v => v !== undefined);
    if (rawThresholds.some(v => (typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '' || !Number.isFinite(Number(v)) || Number(v) < 0)) {
      return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'Policy quorum threshold must be a non-negative number',policyVersion:policy.policy_version,evidenceIds};
    }
    const requiredVotingPower=Number(value.requiredVotingPower??value.minimumVotingPower??NaN),requiredVoteCount=Number(value.requiredVotes??value.minimumVotes??NaN);
    const usesVotingPower=Number.isFinite(requiredVotingPower),required=usesVotingPower?requiredVotingPower:requiredVoteCount,actual=usesVotingPower?(totalVotingPower??0):count;
    if(!Number.isFinite(required))return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'Policy has no deterministic vote-count or voting-power threshold',inputs:{voteCount:count,totalVotingPower},policyVersion:policy.policy_version,evidenceIds};
    return {ruleId:'GOV-01',result:actual>=required?'PASS':'FAIL',inputs:{voteCount:count,totalVotingPower:totalVotingPower??0,thresholdType:usesVotingPower?'votingPower':'voteCount',required},policyVersion:policy.policy_version,evidenceIds,explanationData:{comparison:`${actual} >= ${required}`}};
  }
  async checkVotingWindow(id:string,member?:string,daoId?:string):Promise<ComplianceResult>{const {proposal,votes}=await this.getVotes(id,daoId);if(!proposal)return {ruleId:'GOV-02',result:'INDETERMINATE',reason:'Proposal not found',evidenceIds:[]};const selected=member?votes.filter((v:any)=>v.voter_address===member):votes;if(member&&!selected.length)return {ruleId:'GOV-02',result:'INDETERMINATE',reason:'No recorded vote exists for the requested member',inputs:{memberAddress:member,votesChecked:0},evidenceIds:[]};const invalid=selected.filter((v:any)=>v.block_timestamp<proposal.starts_at||v.block_timestamp>proposal.ends_at);return {ruleId:'GOV-02',result:invalid.length?'FAIL':'PASS',inputs:{startsAt:proposal.starts_at,endsAt:proposal.ends_at,votesChecked:selected.length},evidenceIds:selected.map((v:any)=>v.evidence_id),explanationData:{invalidEvidenceIds:invalid.map((v:any)=>v.evidence_id)}};}
  async checkMemberEligibility(id:string,member?:string,daoId?:string):Promise<ComplianceResult>{
    const timeline=await this.getTimeline(id,daoId);if(!timeline.proposal)return {ruleId:'GOV-03',result:'INDETERMINATE',reason:'Proposal not found',evidenceIds:[]};
    if (!timeline.events.length) return {ruleId:'GOV-03',result:'INDETERMINATE',reason:'No canonical lifecycle events exist',evidenceIds:[]};
    const assigned=new Set<string>(),ineligible:string[]=[];let votesChecked=0;
    for(const event of timeline.events){const args=event.event_args as Record<string,unknown>;const address=String(args.member??args.voter??'').toLowerCase();if(event.event_name==='MemberAssigned'&&address)assigned.add(address);else if(event.event_name==='MemberUnassigned'&&address)assigned.delete(address);else if(event.event_name==='VoteCast'&&address&&(!member||address===member)){votesChecked++;if(!assigned.has(address))ineligible.push(address);}}
    if(member&&!votesChecked)return {ruleId:'GOV-03',result:'INDETERMINATE',reason:'No canonical vote exists for the requested member',inputs:{memberAddress:member,votesChecked},evidenceIds:timeline.evidenceIds};
    return {ruleId:'GOV-03',result:ineligible.length?'FAIL':'PASS',inputs:{...(member?{memberAddress:member}:{}),votersChecked:votesChecked},evidenceIds:timeline.evidenceIds,explanationData:{ineligibleVoters:[...new Set(ineligible)]}};
  }
  async checkEvidenceIntegrity(id:string,daoId?:string):Promise<ComplianceResult>{const artefacts=await this.getArtefacts(id,daoId);const invalid=artefacts.filter(a=>a.verification_status!=='VERIFIED'||a.lifecycle_state!=='LINKED'||!a.expected_hash||a.expected_hash!==a.computed_hash||!a.hash_algorithm);return {ruleId:'GOV-04',result:artefacts.length?(invalid.length?'FAIL':'PASS'):'INDETERMINATE',reason:artefacts.length?undefined:'No linked artefact evidence exists',inputs:{artefactCount:artefacts.length},evidenceIds:artefacts.map(a=>a.evidence_id),explanationData:{invalidEvidenceIds:invalid.map(a=>a.evidence_id)}};}
  async checkLifecycleTransitions(id:string,daoId?:string):Promise<ComplianceResult>{const timeline=await this.getTimeline(id,daoId);const names=timeline.events.map(e=>e.event_name);const allowed=new Set(['ProposalCreated','MemberAssigned','MemberUnassigned','VoteCast','ProposalCancelled','ProposalFinalized']);const terminalIndexes=names.flatMap((name,index)=>name==='ProposalCancelled'||name==='ProposalFinalized'?[index]:[]);const valid=names[0]==='ProposalCreated'&&names.filter(name=>name==='ProposalCreated').length===1&&terminalIndexes.length<=1&&(terminalIndexes.length===0||terminalIndexes[0]===names.length-1)&&names.every(name=>allowed.has(name));return {ruleId:'GOV-05',result:names.length?(valid?'PASS':'FAIL'):'INDETERMINATE',reason:names.length?undefined:'No canonical lifecycle events exist',inputs:{events:names},evidenceIds:timeline.evidenceIds};}
  async checkVoteUniqueness(id:string,daoId?:string):Promise<ComplianceResult>{const timeline=await this.getTimeline(id,daoId);if(!timeline.proposal)return {ruleId:'GOV-06',result:'INDETERMINATE',reason:'Proposal not found',evidenceIds:[]};const events=timeline.events.filter(event=>event.event_name==='VoteCast');const voters=events.map(event=>String((event.event_args as Record<string,unknown>).voter??'').toLowerCase()).filter(Boolean);const seen=new Set<string>(),duplicates:string[]=[];for(const voter of voters){if(seen.has(voter))duplicates.push(voter);seen.add(voter);}return {ruleId:'GOV-06',result:duplicates.length?'FAIL':'PASS',inputs:{voteEventCount:events.length,uniqueVoters:seen.size},evidenceIds:events.map(event=>event.evidence_id),explanationData:{duplicateVoters:[...new Set(duplicates)]}};}
  private async getArtefacts(id:string,daoId?:string){const proposal=await this.getProposal(id,daoId);if(!proposal)return [];return this.db.selectFrom('artefacts').innerJoin('proposal_artefacts','proposal_artefacts.evidence_id','artefacts.evidence_id').select(['artefacts.evidence_id','artefacts.proposal_id','artefacts.source_type','artefacts.uri','artefacts.expected_hash','artefacts.computed_hash','artefacts.hash_algorithm','artefacts.verification_status','artefacts.filename','artefacts.dataset_version_id','artefacts.lifecycle_state']).where('proposal_artefacts.proposal_id','=',proposal.id).execute();}
  private async getProposalEvidence(id:string){const [timeline,artefacts]=await Promise.all([this.getTimeline(id),this.getArtefacts(id)]);return {events:timeline.events,artefacts,evidenceIds:[...timeline.evidenceIds,...artefacts.map(a=>a.evidence_id)]};}
  private async getEvidence(id:string,datasetVersion?:string){
    if(id.startsWith('deployment:')) {
      const evidence = await this.proposalQueries.resolveDeploymentEvidence(id);
      return datasetVersion ? {...evidence,valid:false,warnings:[...evidence.warnings,'Deployment evidence is not pinned to the requested dataset.']} : evidence;
    }
    if(id.startsWith('structured:proposal:')) {
      const evidence = await this.proposalQueries.resolveEvidence(id);
      return datasetVersion ? {...evidence,valid:false,warnings:[...evidence.warnings,'Operational proposal evidence is not pinned to the requested dataset.']} : evidence;
    }
    const event=await this.db.selectFrom('governance_events').selectAll().where('evidence_id','=',id).executeTakeFirst();
    if(event){const warnings:string[]=[];if(!event.canonical)warnings.push('Non-canonical event');if(!/^0x[0-9a-f]{40}$/.test(event.contract_address))warnings.push('Invalid contract address');if(!/^0x[0-9a-f]{64}$/.test(event.transaction_hash)||!/^0x[0-9a-f]{64}$/.test(event.block_hash))warnings.push('Invalid transaction or block hash');if(datasetVersion&&String(event.dataset_version_id)!==datasetVersion)warnings.push('Dataset scope mismatch');return {evidenceId:id,valid:warnings.length===0,sourceType:'governance-event',proposalId:event.proposal_id,lineage:{chainId:event.chain_id,contractAddress:event.contract_address,transactionHash:event.transaction_hash,blockNumber:event.block_number,blockHash:event.block_hash,transactionIndex:event.transaction_index,logIndex:event.log_index},relatedEvidence:[],warnings};}
    const artefact=await this.db.selectFrom('artefacts').selectAll().where('evidence_id','=',id).executeTakeFirst();
    if(artefact){const edges=await this.db.selectFrom('provenance_edges').selectAll().where((eb)=>eb.or([eb('from_evidence_id','=',id),eb('to_evidence_id','=',id)])).execute();const valid=artefact.verification_status==='VERIFIED'&&artefact.lifecycle_state==='LINKED'&&(!datasetVersion||String(artefact.dataset_version_id)===datasetVersion);return {evidenceId:id,valid,sourceType:'artefact',proposalId:artefact.proposal_id,lineage:{hashAlgorithm:artefact.hash_algorithm,computedHash:artefact.computed_hash,verificationStatus:artefact.verification_status,lifecycleState:artefact.lifecycle_state},relatedEvidence:edges.flatMap(e=>[e.from_evidence_id,e.to_evidence_id]).filter(x=>x!==id),warnings:valid?[]:['Artefact is not verified, linked, or in the requested dataset']};}
    const chunk=await this.db.selectFrom('document_chunks').innerJoin('artefacts','artefacts.id','document_chunks.artefact_id').select(['document_chunks.artefact_id','document_chunks.chunk_index','document_chunks.proposal_id','artefacts.evidence_id as artefactEvidenceId','artefacts.verification_status','artefacts.lifecycle_state','artefacts.dataset_version_id']).where('document_chunks.evidence_id','=',id).executeTakeFirst();
    if(!chunk)return {evidenceId:id,valid:false,sourceType:'unknown',proposalId:null,lineage:null,relatedEvidence:[],warnings:['Evidence does not exist']};
    const valid=chunk.verification_status==='VERIFIED'&&chunk.lifecycle_state==='LINKED'&&(!datasetVersion||String(chunk.dataset_version_id)===datasetVersion);
    return {evidenceId:id,valid,sourceType:'chunk',proposalId:chunk.proposal_id,lineage:{artefactId:chunk.artefact_id,chunkIndex:chunk.chunk_index},relatedEvidence:[chunk.artefactEvidenceId],warnings:valid?[]:['Parent artefact is not verified, linked, or in the requested dataset']};
  }
}
