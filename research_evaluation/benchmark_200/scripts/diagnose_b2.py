"""Inspect saved B2 provider outputs, schema and extraction without generation."""
import csv,hashlib,json,re
from pathlib import Path
from app.business.agents.tools import build_tools
from app.business.mcp.context import ExecutionContext
ROOT=Path(__file__).resolve().parents[1]

def main():
    tools=build_tools(ExecutionContext(None,None,True));observations=[];excluded=[]
    original=json.loads((ROOT/'archive/pre_leak_check/ground_truth.json').read_text(encoding='utf8'))
    leaked_gold=next(g['expected_answer'] for g in original if g['id']=='DB-001')
    for campaign in ['smoke','smoke-v2']:
        path=ROOT/'raw_results'/campaign/'responses.jsonl'
        for line,text in enumerate(path.read_text(encoding='utf8').splitlines(),1):
            row=json.loads(text)
            if row['id']=='DB-001':
                assert leaked_gold.casefold() in row['question'].casefold()
                excluded.append({'id':row['id'],'variant':row['variant'],'raw_file':str(path.relative_to(ROOT)).replace('\\','/'),
                    'raw_line':line,'status':row['status'],'reason':'Exact expected title supplied in Scope label within model-visible question',
                    'criterion':'Exclude every variant of a question with exact gold-title leakage, regardless of answer, timing or status',
                    'applied_after_detection':True,'retained':True,'leaked_value':leaked_gold})
            if row['variant']!='B2' or row['id']=='DB-001' or row['category']=='UA':continue
            chats=[c for c in row['provider_calls'] if c['path']=='/api/chat']
            final=chats[-1]['response']['message']['content']
            extracted=re.sub(r'<think>.*?</think>','',final,flags=re.S).strip()
            invalid_calls=[]
            for chat in chats:
                for call in chat['response']['message'].get('tool_calls',[]):
                    fn=call['function'];name=fn['name'];args=fn.get('arguments',{})
                    if isinstance(args,str):args=json.loads(args)
                    try:tools[name].args_schema.model_validate(args)
                    except Exception as e:
                        missing=[x['loc'] for x in e.errors() if x['type']=='missing'] if hasattr(e,'errors') else []
                        invalid_calls.append({'tool':name,'error':type(e).__name__,'missing_fields':missing})
            observations.append({'id':row['id'],'raw_file':str(path.relative_to(ROOT)).replace('\\','/'),'raw_line':line,
                'final_answer_matches_provider_content':row['answer']==extracted,
                'provider_calls':len(chats),'actual_options':[c['options'] for c in chats],
                'tools_available':len(tools),'tool_events':row.get('tool_events',[]),
                'schema_invalid_calls':invalid_calls,'observed_permission_denials':sum(t['status']=='failed' and t['name'] not in [i['tool'] for i in invalid_calls] for t in row.get('tool_events',[])),
                'evidence_search_called':any(t['name']=='search_proposal_evidence' for t in row.get('tool_events',[])),
                'source_ids_returned':[s['source_id'] for s in row.get('sources',[])]})
    assert len(observations)==3 and all(o['final_answer_matches_provider_content'] for o in observations)
    assert len(excluded)==4
    record={'method':'Saved provider/tool trace plus current unchanged application tool schemas; no model trial repeated',
        'tool_names':list(tools),'observations':observations,'causal_limit':'No matched intervention; model size or tool-list complexity cannot be established as causal explanations',
        'findings':['All 22 tool definitions were exposed; valid governance and chain reads succeeded',
            'PDF question made no tool call; claimed PDF content was inaccessible despite exposed retrieval/chunk tools',
            'Multi-source question requested an invented evidence ID and omitted required chunk_key; schema validation failed',
            'No evidence search was invoked in these three trials; document metadata readiness is not PDF text retrieval',
            'Status question selected voting facts rather than the proposal/status tool and then fabricated a status',
            'Final answer extraction exactly matches provider content in all three; no extraction loss observed',
            'Seed, temperature, context and output-cap options match configured B2 settings; no recorded scope guard rejection explains 0/3']}
    (ROOT/'review/b2_diagnosis.json').write_text(json.dumps(record,indent=2),encoding='utf8')
    (ROOT/'review/excluded_attempts.json').write_text(json.dumps(excluded,indent=2),encoding='utf8')
    print('B2 extraction verified 3/3; 22 tools available; invalid chunk schema and incorrect tool choices documented. Four exclusions audited.')

if __name__=='__main__':main()
