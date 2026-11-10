"""Map 21 accepted snapshot-only items to fresh SQL and pinned chain evidence."""
import hashlib,json,re
from pathlib import Path
V=Path(__file__).resolve().parents[1];ROOT=V.parents[1]

def main():
    audit=json.loads((ROOT/'review/independent_audit/independent_adjudication.json').read_text(encoding='utf8'))
    questions={x['id']:x for x in json.loads((ROOT/'questions.json').read_text(encoding='utf8'))}
    gold={x['id']:x for x in json.loads((ROOT/'ground_truth.json').read_text(encoding='utf8'))}
    saved=json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))
    live=json.loads((V/'evidence/live_database_recheck.json').read_text(encoding='utf8'))
    chain={x['label']:x for x in json.loads((V/'evidence/pinned_chain_recheck.json').read_text(encoding='utf8'))['results']}
    results=[]
    for item in audit:
        if item['decision']!='ACCEPT' or not item['verification_gap']:continue
        q=questions[item['id']];label=q['scope_label'];db=live['current_observations'][label];c=chain[label];target=q['semantic_target'];g=gold[item['id']]
        same=live_match=False;observations={}
        if q['category']=='DB':
            field=target[-1];observations={'field':field,'live_value':db[field],'snapshot_value':saved['database'][label][field]}
            same=str(db[field])==str(saved['database'][label][field]);live_match=str(db[field])==g['expected_answer']
            if field=='chain_id':live_match=live_match and str(db[field])==c.get('network_chain_id')
        elif q['category']=='MS':
            assert target[2:4]==['chain_id','chain_id']
            observations={'database_chain_id':db['chain_id'],'current_network_chain_id':c.get('network_chain_id')}
            same=str(db['chain_id'])==str(saved['database'][label]['chain_id'])
            live_match=str(db['chain_id'])==c.get('network_chain_id')==str(saved['blockchain'][label]['chain_id'])
        elif q['category']=='CX':
            assert target[-1]=='document_dao_mismatch'
            text=' '.join(saved['documents'][label]['pages'])
            observations={'pdf_dao_id':'cyber-demo-dao','live_database_dao_id':db['dao_id']}
            same=db['dao_id']==saved['database'][label]['dao_id']
            live_match='cyber-demo-dao' in text and f'PDF cyber-demo-dao; database {db["dao_id"]}; these identifiers differ.'==g['expected_answer']
        else:raise RuntimeError('Unexpected accepted snapshot-only category')
        pinned=c.get('block_hash_matches') is True and c.get('chain_id_matches') is True and all(c.get('field_matches',{}).values())
        results.append({'id':item['id'],'source_recheck_passed':bool(same and live_match and pinned),
            'live_database_matches_snapshot':same,'pinned_chain_identity_verified':pinned,'observations':observations,
            'chain_block':c['block'],'sql_checked_utc':live['checked_utc'],
            'historical_sql_at_chain_block_verified':False,
            'scope_limit':'Current SQL agrees with saved SQL projection; chain fields/hash checked at saved block. No historical SQL checkpoint reconstruction.',
            'review_status':'Existing Claude independent-LLM ACCEPT; this fresh source check is not human adjudication'})
    assert len(results)==21
    (V/'evidence/snapshot_only_21_recheck.json').write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf8')
    print('Accepted snapshot-only checks:',sum(r['source_recheck_passed'] for r in results),'/',len(results))

if __name__=='__main__':main()
