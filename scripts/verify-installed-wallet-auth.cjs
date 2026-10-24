const fs=require('node:fs'),path=require('node:path');
const {Common}=require('@ethereumjs/common'),{Address}=require('@ethereumjs/util');
const tx=require('@cyberchain/tx'),utils=require('@cyberchain/smart-contract-wrapper'),algorithms=require('@noble/post-quantum/ml-dsa');
// Pure signing functions from the installed extension; generated test keys only.
const assets=path.join(process.argv[2],'assets');
const source=fs.readFileSync(path.join(assets,fs.readdirSync(assets).find(n=>/^SignView-.*\.js$/.test(n))),'utf8');
const start=source.indexOf('const cf=BigInt(6e6);'),end=source.indexOf('function lf(',start);
if(start<0||end<start)throw new Error('Unsupported installed extension source');
const sign=new Function('Ze','af','wt','it','Vt','Ps','Is',source.slice(start,end)+';return uf;')(Common,tx,Address,Buffer,v=>v.replace(/^0x/,''),utils.privateKeyToAddress,'0x'+'00'.repeat(20));
async function post(route,data){const response=await fetch('http://127.0.0.1:3000/v1/ai/assistant/auth/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error('HTTP '+response.status+': '+result.message);return result;}
(async()=>{for(const level of [44,65,87]){const pair=algorithms['ml_dsa'+level].keygen(new Uint8Array(32).fill(7)),ec={type:'ec-dsa',key:new Uint8Array(32).fill(8)},ml={type:'ml-dsa',spec:level,publicKey:pair.publicKey,secretKey:pair.secretKey};const address=utils.privateKeysToAddress(ec,ml);const wallet={ec:{privateKey:Buffer.from(ec.key).toString('hex')},ml:{level,publicKey:Buffer.from(pair.publicKey).toString('hex'),privateKey:Buffer.from(pair.secretKey).toString('hex')}};for(const algorithm of ['ec','ml']){const challenge=await post('challenge',{address,kind:'cyberchain'});const raw=sign(wallet,algorithm,{...challenge.transaction,data:'0x'+challenge.transaction.data});const session=await post('login',{nonce:challenge.nonce,signedTransaction:'0x'+raw});if(session.address!==address)throw new Error('Wrong recovered wallet');console.log('Installed Wallet 1.0.0 '+algorithm+' / ML-DSA-'+level+': PASS');}}})().catch(e=>{console.error(e.message);process.exitCode=1});
