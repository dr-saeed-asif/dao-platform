"""Publication SVG/300-dpi PNG from saved, eligible smoke observations."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
summary=json.loads((ROOT/'metrics/summary.json').read_text(encoding='utf8'))
rows=json.loads((ROOT/'metrics/run_scores.json').read_text(encoding='utf8'))
plt.rcParams.update({'font.size':9,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False})
fig,(a,b)=plt.subplots(1,2,figsize=(7.4,2.9),layout='constrained')
labels=list(summary)
a.bar(labels,[summary[v]['proxy_hits'] for v in labels],color='#396a93')
a.set(ylim=(0,3.5),yticks=[0,1,2,3],ylabel='Questions matching lexical proxy',title='Requested-fact coverage (n = 3)')
for i,v in enumerate(labels):a.text(i,summary[v]['proxy_hits']+.1,f"{summary[v]['proxy_hits']}/3",ha='center')
for i,v in enumerate(labels):
    group=[r for r in rows if r['variant']==v and r['eligible'] and r['lexical_requested_fact_proxy'] is not None]
    b.scatter([i+(j-1)*.09 for j in range(len(group))],[r['wall_ms']/1000 for r in group],color='#396a93',s=25)
b.set(xticks=range(4),xticklabels=labels,ylabel='Answer wall time (s)',title='Individual eligible smoke attempts')
b.grid(axis='y',alpha=.2)
fig.suptitle('Development smoke test — one demo proposal; no population inference',fontsize=10)
fig.savefig(ROOT/'figures/smoke_coverage.svg',bbox_inches='tight')
fig.savefig(ROOT/'figures/smoke_coverage.png',dpi=300,bbox_inches='tight')
plt.close(fig)
