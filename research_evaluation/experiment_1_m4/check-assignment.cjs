'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Web3RPCClient } = require('@cyberchain/smart-contract-wrapper');
const root = path.resolve(__dirname, '../..');
const run = path.resolve(process.argv[2]);
const read = file => JSON.parse(fs.readFileSync(path.join(run, file), 'utf8'));
const config = read('preflight.json');
const sql = read('sql_evidence.local.json');
const proposal = sql.proposals.find(p => String(p.on_chain_id) === '32');
const row = fs.readFileSync(path.join(run, 'responses.jsonl'), 'utf8').trim().split('\n')
  .map(JSON.parse).find(r => r.proposal_id === proposal.id);
const report = row.report;
const active = sql.assignments.filter(a => a.proposal_id === proposal.id && a.assigned);
const state = new Set();
const events = report.events.filter(e => ['MemberAssigned','MemberUnassigned'].includes(e.name))
  .sort((a,b) => Number(a.block_number)-Number(b.block_number) || Number(a.log_index)-Number(b.log_index));
for (const e of events) {
  const member = e.args.member.toLowerCase();
  if (e.name === 'MemberAssigned') state.add(member);
  else state.delete(member);
}
const extra = active.filter(a => !state.has(a.member_address.toLowerCase()));
const members = new Set(active.map(a => a.member_address.toLowerCase()));
const checked = {
  utc: new Date().toISOString(), proposal_id: proposal.id, on_chain_id: '32',
  pinned_block: report.block_number, pinned_hash: report.block_hash,
  sql_active_rows: active.length, sql_active_distinct: members.size,
  contract_assigned_count: report.proposal.assignedMemberCount,
  reconstructed_count: state.size,
  assigned_events: events.filter(e => e.name === 'MemberAssigned').length,
  unassigned_events: events.filter(e => e.name === 'MemberUnassigned').length,
  creation_event_present: report.events.some(e => e.name === 'ProposalCreated'),
  scan_coverage_status: report.comparisons.find(c => c.field === 'governance_events.count')?.status ?? 'unverified',
  sql_only_assignments: extra.length,
  chain_only_assignments: [...state].filter(m => !members.has(m)).length,
  extra_rows: [],
};
async function main() {
  const env = require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
  const rpcURL = process.env.CYBERCHAIN_RPC_URL || env.CYBERCHAIN_RPC_URL;
  const rpc = (method, params) => Web3RPCClient.getInstance().rpcRequest(method, params, { rpcURL, timeout: 15000 });
  for (const row of extra) {
    const item = { latest_evidence_present: row.latest_evidence_id != null, transaction_reference_present: Boolean(row.transaction_hash) };
    if (row.transaction_hash) {
      const receipt = await rpc('eth_getTransactionReceipt', [row.transaction_hash]);
      item.receipt_found = Boolean(receipt);
      if (receipt?.blockNumber) {
        const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
        item.receipt_status = receipt.status;
        item.receipt_block = BigInt(receipt.blockNumber).toString();
        item.receipt_canonical_at_provider = Boolean(receipt.blockHash && block?.hash === receipt.blockHash);
        item.receipt_targets_governance_contract = receipt.to?.toLowerCase() === config.contract.toLowerCase();
        item.receipt_log_count = Array.isArray(receipt.logs) ? receipt.logs.length : null;
      }
    }
    checked.extra_rows.push(item);
  }
  fs.writeFileSync(path.join(run, 'assignment_followup.json'), JSON.stringify(checked,null,2), { flag:'wx' });
  console.log(JSON.stringify(checked));
}
main().catch(e => { console.error('Assignment follow-up failed:', e.name); process.exitCode=1; });
