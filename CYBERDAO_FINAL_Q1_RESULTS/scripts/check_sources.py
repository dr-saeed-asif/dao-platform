"""Compare actual captured source fields; absent fields are unchecked, not divergent."""
import datetime,json
from pathlib import Path
H=Path(__file__).resolve().parents[1];R=H.parent/'research_evaluation'
def norm(x):
 if x is None:return None
 value=str(x)
 try:return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).isoformat()
 except ValueError:return value
old=json.loads((R/'benchmark_200/evidence/snapshot.json').read_text());live=json.loads((H/'evidence/source_records.json').read_text());checks=[]
fields={'id':'id','dao_id':'daoId','title':'title','status':'status','on_chain_id':'onChainId','chain_id':'chainId','starts_at':'startsAt','ends_at':'endsAt','total_votes':'totalVotes'}
for scope,row in old['database'].items():
 current=live[scope]['get_proposal']['data'];facts=live[scope]['get_proposal_voting_facts']['data']['facts']
 for key,target in fields.items():checks.append({'scope':scope,'field':key,'old':row.get(key),'captured':current.get(target),'equal':norm(row.get(key))==norm(current[target]) if target in current else None})
 for key,target in [('indexed_votes','stored_total_votes'),('assigned','stored_assigned_members')]:checks.append({'scope':scope,'field':key,'old':row.get(key),'captured':facts.get(target),'equal':str(row.get(key))==str(facts[target]) if target in facts else None})
 previous=len(row['dao_proposals']) if isinstance(row['dao_proposals'],list) else row['dao_proposals'];checks.append({'scope':scope,'field':'dao_proposals','equal':previous==live[scope]['count_dao_proposals']['proposal_count']})
result={'scope':'Original archive versus captured read-only SQL preflight; not a post-outage live check','checked_fields':sum(x['equal'] is not None for x in checks),'matching_fields':sum(x['equal'] is True for x in checks),'differing_fields':sum(x['equal'] is False for x in checks),'unavailable_fields':sum(x['equal'] is None for x in checks),'other_unchecked_fields':['proposal_type and all fields outside the captured tool projection'],'human_adjudication':False,'checks':checks}
(H/'evidence/snapshot_drift_checks.json').write_text(json.dumps(result,indent=2,default=str)+'\n',encoding='utf8');print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
