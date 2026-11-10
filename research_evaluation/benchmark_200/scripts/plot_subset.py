"""Plot eligible subset observations and quality flags, separately from smoke."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
summary=json.loads((ROOT/'metrics/subset_summary.json').read_text(encoding='utf8'))
rows=json.loads((ROOT/'metrics/subset_scores.json').read_text(encoding='utf8'))
plt.rcParams.update({'font.size':9,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False})
fig,(a,b)=plt.subplots(1,2,figsize=(7.8,3.1),layout='constrained')
labels=list(summary)
a.bar([i-.16 for i in range(4)],[summary[v]['requested_count_proxy_hits'] for v in labels],width=.3,color='#396a93',label='Count present')
a.bar([i+.16 for i in range(4)],[summary[v]['mixed_certainty_flags'] for v in labels],width=.3,color='#b56b38',label='Mixed certainty')
a.set(xticks=range(4),xticklabels=labels,ylim=(0,10),yticks=[0,2,4,6,8],ylabel='Questions (8 per variant)',title='Numeric matches and wording flags')
a.legend(frameon=False,fontsize=8)
for i,v in enumerate(labels):
    g=[r for r in rows if r['variant']==v]
    b.scatter([i+(j-3.5)*.035 for j in range(len(g))],[r['wall_ms']/1000 for r in g],s=17,color='#396a93')
b.set(xticks=range(4),xticklabels=labels,ylabel='Answer wall time (s)',title='All 32 observed attempts')
b.grid(axis='y',alpha=.2)
fig.suptitle('Source-checked diagnostic subset; no independent semantic validation',fontsize=10)
fig.savefig(ROOT/'figures/source_counts_subset.svg',bbox_inches='tight')
fig.savefig(ROOT/'figures/source_counts_subset.png',dpi=300,bbox_inches='tight')
plt.close(fig)
