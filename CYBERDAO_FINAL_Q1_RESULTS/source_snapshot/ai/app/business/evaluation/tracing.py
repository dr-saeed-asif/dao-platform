"""Content-free execution metadata. Never records model reasoning or prompts."""
from contextvars import ContextVar
from datetime import datetime, timezone
from time import perf_counter
from uuid import uuid4

LLM_OBSERVER = ContextVar('llm_observer', default=None)

def utc_now():
    return datetime.now(timezone.utc).isoformat()

def measured_sum(values):
    values = list(values)
    return sum(values) if values and all(value is not None for value in values) else None

class ExecutionTrace:
    def __init__(self, question_id, callback=None):
        self.question_id = question_id
        self.spans = []
        self.started_at = utc_now()
        self.started = perf_counter()
        self.callback = callback
        self.route = None
        self.blockchain = None

    def begin(self, kind, name, agent, **fields):
        row = dict(span_id=str(uuid4()), question_id=self.question_id, kind=kind,
                   name=name, agent=agent, started_at=utc_now(), status='processing', **fields)
        self.spans.append(row)
        self.emit(row)
        return row, perf_counter()

    def end(self, handle, status='completed', **fields):
        row, started = handle
        row.update(completed_at=utc_now(), latency_ms=(perf_counter()-started)*1000,
                   status=status, **fields)
        self.emit(row)

    def emit(self, row):
        if self.callback:
            self.callback(dict(row))

    def llm(self, row):
        row = dict(row, span_id=str(uuid4()), question_id=self.question_id,
                   kind='llm', agent=self.route or 'analysis')
        self.spans.append(row)
        self.emit(row)

    def result(self):
        llms = [s for s in self.spans if s['kind']=='llm']
        tools = [s for s in self.spans if s['kind']=='tool']
        agents = [s for s in self.spans if s['kind']=='agent']
        retrieval = [s for s in tools if s.get('retrieval_ms') is not None]
        return dict(started_at=self.started_at, completed_at=utc_now(),
            latency_ms=(perf_counter()-self.started)*1000,
            agents=list(dict.fromkeys(s['agent'] for s in self.spans if s['kind'] in ('agent','routing'))),
            routing_decisions=[s for s in self.spans if s['kind']=='routing'],
            tools=[s['name'] for s in tools], models=list(dict.fromkeys(s['model'] for s in llms if s.get('model'))),
            input_tokens=measured_sum(s.get('input_tokens') for s in llms) if llms else 0,
            output_tokens=measured_sum(s.get('output_tokens') for s in llms) if llms else 0,
            embedding_tokens=measured_sum(s.get('embedding_tokens') for s in retrieval) if retrieval else 0,
            llm_ms=sum(s.get('latency_ms',0) for s in llms),
            tool_ms=sum(s.get('latency_ms',0) for s in tools),
            agent_ms=sum(s.get('latency_ms',0) for s in agents),
            retrieval_ms=sum(s['retrieval_ms'] for s in retrieval),
            retries=sum(1 for s in agents if s.get('attempt',1)>1) + sum(1 for s in llms if s.get('attempt',1)>1) + sum(s['kind']=='retry' for s in self.spans),
            tool_successes=sum(s['status']=='completed' for s in tools), tool_calls=len(tools),
            errors=[{'name':s['name'], 'error_type':s.get('error_type')} for s in self.spans if s['status']=='failed'],
            trace=[dict(s) for s in self.spans])

def run_metrics(results, total_ms, started_at=None, completed_at=None):
    executions=[r.execution if hasattr(r,'execution') else r.get('execution',{}) for r in results]
    return dict(total_ms=total_ms, started_at=started_at, completed_at=completed_at,
        input_tokens=measured_sum(e.get('input_tokens') for e in executions),
        output_tokens=measured_sum(e.get('output_tokens') for e in executions),
        embedding_tokens=measured_sum(e.get('embedding_tokens') for e in executions),
        agents=list(dict.fromkeys(a for e in executions for a in e.get('agents',[]))),
        models=list(dict.fromkeys(a for e in executions for a in e.get('models',[]))),
        tool_calls=sum(e.get('tool_calls',0) for e in executions),
        tool_successes=sum(e.get('tool_successes',0) for e in executions),
        retries=sum(e.get('retries',0) for e in executions),
        llm_ms=sum(e.get('llm_ms',0) for e in executions),
        retrieval_ms=sum(e.get('retrieval_ms',0) for e in executions),
        tool_ms=sum(e.get('tool_ms',0) for e in executions))
