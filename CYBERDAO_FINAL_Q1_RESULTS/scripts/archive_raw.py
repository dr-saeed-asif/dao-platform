"""Lossless raw-data packaging. Originals are preserved; restore never overwrites."""
import gzip,hashlib,json,shutil,sys
from pathlib import Path
H=Path(__file__).resolve().parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if '--restore' in sys.argv:
 for row in json.loads((H/'raw_archive_index.json').read_text()):
  dest=(H/row['raw_path']).resolve();dest.relative_to(H.resolve())
  if dest.exists():assert sha(dest)==row['raw_sha256'];continue
  dest.parent.mkdir(parents=True,exist_ok=True)
  with gzip.open(H/row['gzip_path'],'rb') as source,dest.open('xb') as output:shutil.copyfileobj(source,output)
  assert sha(dest)==row['raw_sha256']
 print('Restored lossless raw files; existing originals preserved')
else:
 rows=[];ignore=H/'.gitignore';rules=ignore.read_text(encoding='utf8') if ignore.exists() else ''
 for relative in ['raw/responses.jsonl','raw/frozen_rag_responses.jsonl','live_campaign/raw/responses.jsonl']:
  p=H/relative
  if not p.exists():continue
  dest=p.with_suffix(p.suffix+'.gz')
  with p.open('rb') as source,dest.open('wb') as out:
   with gzip.GzipFile(filename='',mode='wb',fileobj=out,mtime=0,compresslevel=6) as compressed:shutil.copyfileobj(source,compressed)
  original=sha(p)
  with gzip.open(dest,'rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==original
  rows.append({'raw_path':relative,'raw_sha256':original,'raw_bytes':p.stat().st_size,'gzip_path':relative+'.gz','gzip_sha256':sha(dest),'gzip_bytes':dest.stat().st_size,'byte_identical_roundtrip':True})
  if p.stat().st_size>20_000_000 and '\n'+relative+'\n' not in '\n'+rules:rules+='\n'+relative+'\n'
 ignore.write_text(rules,encoding='utf8');(H/'raw_archive_index.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf8');print('Archived raw files losslessly:',len(rows))
