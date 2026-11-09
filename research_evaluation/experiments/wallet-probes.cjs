const { Wallet } = require('ethers');
const fs = require('node:fs');
const base = 'http://127.0.0.1:3002/v1/ai/assistant';
const wallet = Wallet.createRandom();
const other = Wallet.createRandom();
const results = [];
async function request(path, body, token) {
  return fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: 'Bearer ' + token} : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
}
function record(name, result, expected) {
  results.push({name, observed: result.status, expected, pass: result.status === expected});
}
async function main() {
  const a = await request('/auth/challenge', {address: wallet.address, kind: 'metamask'});
  record('challenge', a, 200);
  const challenge = await a.json();
  const signed = {nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message)};
  const login = await request('/auth/login', signed);
  record('valid_ephemeral_signature', login, 200);
  const {token} = await login.json();
  record('replayed_challenge', await request('/auth/login', signed), 401);
  if (token) record('signed_non_member_proposal_access', await request('/conversations?proposalId=onchain-28', null, token), 403);
  const b = await (await request('/auth/challenge', {address: wallet.address, kind: 'metamask'})).json();
  record('wrong_signer', await request('/auth/login', {nonce: b.nonce, signature: await other.signMessage(b.message)}), 401);
  fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
}
main().catch(error => {console.error(error.name); process.exitCode = 1;});
