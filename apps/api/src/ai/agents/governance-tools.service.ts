import { Injectable, OnModuleInit } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import { VectorSearchService } from '../vector-search.service';
import { ToolRegistry, requireString } from './tool-registry';

const schema=(required:string[]=[])=>({type:'object',required,additionalProperties:false});
const agents={sql:['sql'] as const,rag:['rag'] as const,compliance:['compliance'] as const,provenance:['provenance'] as const};

@Injectable()
export class GovernanceToolsService implements OnModuleInit {
  constructor(private readonly postgres:PostgresService,private readonly vector:VectorSearchService,private readonly registry:ToolRegistry){}
  private get db(){return this.postgres.database;}
  onModuleInit(){
    this.add('getProposal','Get one operational proposal.',agents.sql,['proposalId'],(x)=>this.getProposal(String(x.proposalId)));
    this.add('getProposalVotes','Get proposal votes and exact count.',agents.sql,['proposalId'],(x)=>this.getVotes(String(x.proposalId)));
    this.add('getProposalTimeline','Get canonical governance events for a proposal.',agents.sql,['proposalId'],(x)=>this.getTimeline(String(x.proposalId)));
    this.add('getMemberActivity','Get one member voting and assignment activity.',agents.sql,['proposalId','memberAddress'],(x)=>this.getMemberActivity(String(x.proposalId),String(x.memberAddress).toLowerCase()));
    this.add('calculateQuorum','Calculate quorum from stored policy and votes.',agents.compliance,['proposalId'],(x)=>this.calculateQuorum(String(x.proposalId),x.policyVersion?String(x.policyVersion):undefined));
    this.add('checkVotingWindow','Check vote timestamps against proposal window.',agents.compliance,['proposalId'],(x)=>this.checkVotingWindow(String(x.proposalId),x.memberAddress?String(x.memberAddress).toLowerCase():undefined));
    this.add('checkMemberEligibility','Check assignment state for one member or all recorded voters.',agents.compliance,['proposalId'],(x)=>this.checkEligibility(String(x.proposalId),x.memberAddress?String(x.memberAddress).toLowerCase():undefined));
    this.add('checkEvidenceIntegrity','Check linked artefact hashes and verification state.',agents.compliance,['proposalId'],(x)=>this.checkEvidenceIntegrity(String(x.proposalId)));
    this.add('checkLifecycleTransitions','Check canonical governance lifecycle event order.',agents.compliance,['proposalId'],(x)=>this.checkLifecycle(String(x.proposalId)));
    this.add('checkVoteUniqueness','Check the one-vote-per-member projection.',agents.compliance,['proposalId'],(x)=>this.checkVoteUniqueness(String(x.proposalId)));
    this.add('getProposalArtefacts','Get linked artefact evidence.',agents.provenance,['proposalId'],(x)=>this.getArtefacts(String(x.proposalId)));
    this.add('getProposalEvidence','Get all canonical event and artefact evidence IDs.',agents.provenance,['proposalId'],(x)=>this.getProposalEvidence(String(x.proposalId)));
    this.add('vectorSearch','Retrieve existing pgvector chunks.',agents.rag,['question'],(x)=>this.vector.search(String(x.question),{proposalId:x.proposalId?String(x.proposalId):undefined,topK:Number(x.topK??5)}));
    this.add('getEvidenceById','Resolve and validate a stored evidence record.',agents.provenance,['evidenceId'],(x)=>this.getEvidence(String(x.evidenceId),x.datasetVersion?String(x.datasetVersion):undefined));
  }
  private add(name:string,description:string,allowedAgents:readonly any[],required:string[],execute:(input:Record<string,unknown>)=>Promise<unknown>){
    this.registry.register({name,description,inputSchema:schema(required),outputSchema:{type:'object'},allowedAgents:[...allowedAgents],timeoutMs:10_000,readOnly:true,validate(input){for(const key of required)requireString(input,key);},execute});
  }
  private proposalFilter(query:any,id:string){return /^\d+$/.test(id)?query.where((eb:any)=>eb.or([eb('proposals.id','=',id),eb('proposals.on_chain_id','=',id)])):query.where('proposals.id','=',id);}
  private async getProposal(id:string){
    const proposal=await this.proposalFilter(this.db.selectFrom('proposals').selectAll(),id).executeTakeFirst();
    if(!proposal)return undefined;
    const [members,options]=await Promise.all([
      this.db.selectFrom('proposal_assignments').selectAll().where('proposal_id','=',proposal.id).where('assigned','=',true).orderBy('member_address').execute(),
      this.db.selectFrom('proposal_options').selectAll().where('proposal_id','=',proposal.id).orderBy('option_index').execute(),
    ]);
    return {...proposal,members,options};
  }
  private async getVotes(id:string){
    const proposal=await this.getProposal(id); if(!proposal)return {proposal:null,votes:[],count:0,evidenceIds:[]};
    const votes=await this.db.selectFrom('votes').selectAll().where('proposal_id','=',proposal.id).orderBy('created_at').execute();
    return {proposal,votes,count:votes.length,totalVotingPower:votes.reduce((n,v)=>n+v.voting_weight,0),evidenceIds:votes.map(v=>v.evidence_id)};
  }
  private async getTimeline(id:string){
    const proposal=await this.getProposal(id); if(!proposal)return {proposal:null,events:[],evidenceIds:[]};
    const events=proposal.on_chain_id?await this.db.selectFrom('governance_events').selectAll().where('proposal_id','=',proposal.on_chain_id).where('canonical','=',true).orderBy('block_number').orderBy('log_index').execute():[];
    return {proposal,events,evidenceIds:events.map(e=>e.evidence_id)};
  }
  private async getMemberActivity(id:string,member:string){const proposal=await this.getProposal(id);if(!proposal)return {proposal:null}; const [assignment,votes]=await Promise.all([this.db.selectFrom('proposal_assignments').selectAll().where('proposal_id','=',proposal.id).where('member_address','=',member).executeTakeFirst(),this.db.selectFrom('votes').selectAll().where('proposal_id','=',proposal.id).where('voter_address','=',member).execute()]);return {proposal,assignment,votes,evidenceIds:[assignment?.latest_evidence_id,...votes.map(v=>v.evidence_id)].filter(Boolean)};}
  private async policy(version?:string){let q=this.db.selectFrom('research_policies').selectAll();if(version)q=q.where('policy_version','=',version);return q.orderBy('created_at','desc').executeTakeFirst();}
  private async calculateQuorum(id:string,version?:string){
    const [{proposal,votes,count,totalVotingPower},policy]=await Promise.all([this.getVotes(id),this.policy(version)]); const evidenceIds=votes.map((v:any)=>v.evidence_id);
    if(!proposal)return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'Proposal not found',evidenceIds};
    if(!policy)return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'No research policy found',inputs:{voteCount:count,totalVotingPower},policyVersion:version??null,evidenceIds};
    const value=typeof policy.quorum_policy==='string'?JSON.parse(policy.quorum_policy):policy.quorum_policy as any;
    const required=Number(value.requiredVotes??value.minimumVotes??value.threshold??NaN);
    if(!Number.isFinite(required))return {ruleId:'GOV-01',result:'INDETERMINATE',reason:'Policy has no deterministic vote threshold',inputs:{voteCount:count,totalVotingPower},policyVersion:policy.policy_version,evidenceIds};
    const votingPower=totalVotingPower??0;
    return {ruleId:'GOV-01',result:votingPower>=required?'PASS':'FAIL',inputs:{voteCount:count,totalVotingPower:votingPower,requiredVotes:required},policyVersion:policy.policy_version,evidenceIds,explanationData:{comparison:`${votingPower} >= ${required}`}};
  }
  private async checkVotingWindow(id:string,member?:string){const {proposal,votes}=await this.getVotes(id);if(!proposal)return {ruleId:'GOV-02',result:'INDETERMINATE',evidenceIds:[]};const selected=member?votes.filter((v:any)=>v.voter_address===member):votes;const invalid=selected.filter((v:any)=>v.block_timestamp<proposal.starts_at||v.block_timestamp>proposal.ends_at);return {ruleId:'GOV-02',result:invalid.length?'FAIL':'PASS',inputs:{startsAt:proposal.starts_at,endsAt:proposal.ends_at,votesChecked:selected.length},evidenceIds:selected.map((v:any)=>v.evidence_id),explanationData:{invalidEvidenceIds:invalid.map((v:any)=>v.evidence_id)}};}
  private async checkEligibility(id:string,member?:string){
    if(member){const activity=await this.getMemberActivity(id,member) as any;const valid=Boolean(activity.assignment?.assigned);return {ruleId:'GOV-03',result:activity.proposal?(valid?'PASS':'FAIL'):'INDETERMINATE',inputs:{memberAddress:member,assigned:activity.assignment?.assigned??false},evidenceIds:activity.evidenceIds??[]};}
    const {proposal,votes}=await this.getVotes(id);if(!proposal)return {ruleId:'GOV-03',result:'INDETERMINATE',reason:'Proposal not found',evidenceIds:[]};
    const eligible=new Set(proposal.members.map((item:any)=>item.member_address));const ineligible=votes.filter((vote:any)=>!eligible.has(vote.voter_address));
    return {ruleId:'GOV-03',result:ineligible.length?'FAIL':'PASS',inputs:{votersChecked:votes.length,eligibleMembers:eligible.size},evidenceIds:votes.map((vote:any)=>vote.evidence_id),explanationData:{ineligibleVoters:ineligible.map((vote:any)=>vote.voter_address)}};
  }
  private async checkEvidenceIntegrity(id:string){const artefacts=await this.getArtefacts(id);const invalid=artefacts.filter(a=>a.verification_status!=='VERIFIED'||!a.computed_hash||!a.hash_algorithm);return {ruleId:'GOV-04',result:artefacts.length?(invalid.length?'FAIL':'PASS'):'INDETERMINATE',inputs:{artefactCount:artefacts.length},evidenceIds:artefacts.map(a=>a.evidence_id),explanationData:{invalidEvidenceIds:invalid.map(a=>a.evidence_id)}};}
  private async checkLifecycle(id:string){const timeline=await this.getTimeline(id);const names=timeline.events.map(e=>e.event_name);const created=names.indexOf('ProposalCreated'),terminal=Math.max(names.indexOf('ProposalCancelled'),names.indexOf('ProposalFinalized'));const valid=created===0&&(terminal<0||terminal===names.length-1)&&!(names.includes('ProposalCancelled')&&names.includes('ProposalFinalized'));return {ruleId:'GOV-05',result:names.length?(valid?'PASS':'FAIL'):'INDETERMINATE',inputs:{events:names},evidenceIds:timeline.evidenceIds};}
  private async checkVoteUniqueness(id:string){const {proposal,votes}=await this.getVotes(id);if(!proposal)return {ruleId:'GOV-06',result:'INDETERMINATE',evidenceIds:[]};const seen=new Set<string>(),duplicates:string[]=[];for(const vote of votes){if(seen.has(vote.voter_address))duplicates.push(vote.voter_address);seen.add(vote.voter_address);}return {ruleId:'GOV-06',result:duplicates.length?'FAIL':'PASS',inputs:{voteCount:votes.length,uniqueVoters:seen.size},evidenceIds:votes.map(v=>v.evidence_id),explanationData:{duplicateVoters:duplicates}};}
  private async getArtefacts(id:string){const proposal=await this.getProposal(id);if(!proposal)return [];return this.db.selectFrom('artefacts').innerJoin('proposal_artefacts','proposal_artefacts.evidence_id','artefacts.evidence_id').select(['artefacts.evidence_id','artefacts.proposal_id','artefacts.source_type','artefacts.uri','artefacts.computed_hash','artefacts.hash_algorithm','artefacts.verification_status','artefacts.filename','artefacts.dataset_version_id','artefacts.lifecycle_state']).where('proposal_artefacts.proposal_id','=',proposal.id).execute();}
  private async getProposalEvidence(id:string){const [timeline,artefacts]=await Promise.all([this.getTimeline(id),this.getArtefacts(id)]);return {events:timeline.events,artefacts,evidenceIds:[...timeline.evidenceIds,...artefacts.map(a=>a.evidence_id)]};}
  private async getEvidence(id:string,datasetVersion?:string){
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
