// New isolated reproduction. Actual gateway/use-case source, fake receipt and in-memory ports.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'packages/blockchain-cyberchain/src/cyberchain-governance.gateway.ts');
const javascript = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const local = new Module(source, module);
local.paths = module.paths;
const compiledDirectory = path.dirname(require.resolve('@dao-platform/blockchain-cyberchain'));
const sourceRequire = name => name.startsWith('./')
  ? require(path.join(compiledDirectory, name)) : local.require(name);
new Function('require', 'exports', javascript)(sourceRequire, local.exports);
const {AssignMembersUseCase} = require('@dao-platform/application');
const {CyberChainGovernanceGateway} = local.exports;
const gateway = Object.create(CyberChainGovernanceGateway.prototype);
const receipt = {
  status: 0n, transactionHash: Uint8Array.from({length:32},()=>51),
  blockNumber:19347983n, blockHash:Uint8Array.from({length:32},()=>68), gasUsed:100n,
};
gateway.contract = {callMutableMethod: async () => ({receipt})};
gateway.transactionOptions = () => ({});
const added = [], recorded = [];
const usecase = new AssignMembersUseCase(
  {findById: async()=>({daoId:'fixture',onChainId:'32'})},
  {addMany:async rows=>added.push(...rows)},
  {record:async row=>recorded.push(row)},
  {assertCanCreateProposal:async()=>{}}, gateway,
  {runInTransaction:async callback=>callback()},
  {now:()=>new Date('2026-10-18T15:47:07.682Z')},
);
async function main(){
  await usecase.execute('fixture','0x'+'11'.repeat(20),['0x'+'22'.repeat(20)]);
  const result={
    fixture_receipt_status:'0x0',actual_gateway_result_status:recorded[0]?.status,
    in_memory_assignment_rows:added.length,recorded_operation:recorded[0]?.operation,
    reverted_receipt_rejected:added.length===0,external_requests:0,production_database_writes:0,
    source_sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
    method:'Actual source gateway and existing built AssignMembersUseCase with injected failed receipt and in-memory repositories',
    attribution_limit:'Confirms an executable write mechanism. Historical request/import identity requires audit logs.',
  };
  fs.writeFileSync(path.join(__dirname,'assignment_path_reproduction.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('Failed receipt classified',result.actual_gateway_result_status,'in-memory assignment rows',added.length);
}
main().catch(error=>{console.error(error.name,error.message);process.exitCode=1;});
