"""Publication vector figures from calculated measurements only."""
import json,sys
from pathlib import Path
H=Path(__file__).resolve().parents[1];sys.path.insert(0,str(H/'.plot_deps'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams.update({'font.size':9,'svg.fonttype':'none','pdf.fonttype':42})
all_groups=json.loads((H/'aggregate_metrics.json').read_text())['groups'];groups=[g for g in all_groups if g['condition'] in ('B1','B2','B3','B4')];panel=json.loads((H/'raw/claim_challenge_final_panel.json').read_text())
fig,axes=plt.subplots(1,2,figsize=(8.5,3.3));labels=[g['model'].replace('qwen3:','')+' '+g['condition'] for g in groups]
axes[0].bar(labels,[g['reference_match_proxy_n']/g['attempted_n'] for g in groups],color=['#336699' if g['condition']=='B1' else '#cc7733' for g in groups]);axes[0].set_ylim(0,1);axes[0].set_ylabel('Automatic reference-match fraction');axes[0].set_title('Exploratory proxy; not answer accuracy')
axes[1].bar(labels,[g['median_wall_s'] for g in groups],color='#446655');axes[1].set_ylabel('Median observed generation wall (s)');axes[1].set_title('Retrieval/setup excluded for frozen B2')
for ax in axes:ax.tick_params(axis='x',rotation=45);ax.spines[['top','right']].set_visible(False)
fig.tight_layout()
for ext in ['svg','pdf','png']:fig.savefig(H/f'figures/exploratory_baselines.{ext}',dpi=160)
plt.close(fig)
fig,ax=plt.subplots(figsize=(6.8,3.2));matrix=panel['matrix'];labels=list(matrix);bottom=[0]*len(labels)
for name,color in [('accept','#338866'),('reject','#bb5555'),('abstain','#bbaa77')]:
 vals=[matrix[k][name] for k in labels];ax.barh(labels,vals,left=bottom,label=name,color=color);bottom=[x+y for x,y in zip(bottom,vals)]
ax.set_xlabel('Provisional challenge cases');ax.set_title('M7: 24 source-valid cases; no human adjudication');ax.legend(frameon=False,ncol=3);ax.spines[['top','right']].set_visible(False);fig.tight_layout()
for ext in ['svg','pdf','png']:fig.savefig(H/f'figures/claim_gate_outcomes.{ext}',dpi=160)
plt.close(fig)
(H/'figure_versions.json').write_text(json.dumps({'matplotlib':matplotlib.__version__,'formats':['SVG','PDF','PNG'],'fonts':'SVG text retained; PDF TrueType'},indent=2))
print('Saved two publication figures in SVG, PDF and PNG')
