"""Verify actual additional upload bytes; never construct missing originals."""
import hashlib,json,re,shutil
from pathlib import Path
from pypdf import PdfReader
V=Path(__file__).resolve().parents[1];ROOT=V.parents[1]

def main():
    inventory=json.loads((V/'evidence/diversity_inventory.json').read_text(encoding='utf8'))
    known={x['sha256'] for x in json.loads((ROOT/'evidence/snapshot.json').read_text(encoding='utf8'))['documents'].values()}
    index={d['sha256']:d['filename'] for p in inventory['proposals'] for d in p['documents'].get('indexed_documents',[])}
    out=[]
    for sha,name in index.items():
        if sha in known:continue
        path=Path('data/rag_uploads')/(sha+'.pdf')
        row={'sha256':sha,'indexed_filename':name,'original_bytes_available':path.exists(),
             'admission_status':'Not included in benchmark; requires independent question/gold and exposure review'}
        if path.exists():
            data=path.read_bytes();row['file_hash_matches']=hashlib.sha256(data).hexdigest()==sha
            reader=PdfReader(path);pages=[p.extract_text() or '' for p in reader.pages];text='\n'.join(pages)
            row['pages']=len(pages);row['extracted_text_characters']=len(text)
            sensitive=bool(re.search(r'\b0x[0-9a-fA-F]{40}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{20,}',text))
            row['sensitive_pattern_found']=sensitive
            if row['file_hash_matches'] and not sensitive:
                folder=V/'evidence/additional_documents';folder.mkdir(exist_ok=True)
                shutil.copyfile(path,folder/(sha+'.pdf'))
                (folder/(sha+'.text.json')).write_text(json.dumps({'source_sha256':sha,'indexed_filename':name,'pages':pages},indent=2,ensure_ascii=False),encoding='utf8')
                row['saved_source']='evidence/additional_documents/'+sha+'.pdf'
                row['scope']='Additional genuine stored PDF bytes; contents are proposal statements, not proof of completed events; privacy and independent content review pending'
        out.append(row)
    (V/'evidence/additional_pdf_verification.json').write_text(json.dumps(out,indent=2),encoding='utf8')
    print('Additional indexed PDFs:',len(out),'available verified originals:',sum(r.get('file_hash_matches',False) for r in out))

if __name__=='__main__':main()
