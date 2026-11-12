'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const local = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
const env = { ...process.env };
for (const key of ['CYBERCHAIN_RPC_URL','CYBERCHAIN_CHAIN_ID','GOVERNANCE_CONTRACT_ADDRESS','GOVERNANCE_DEPLOYMENT_BLOCK']) {
  env[key] ||= local[key];
}
env.C7_DATABASE_URL ||= local.POSTGRES_URL;
const child = spawnSync(process.execPath, [path.join(__dirname,'reconcile.cjs'), '--run', ...process.argv.slice(2)],
  { cwd: root, env, stdio: 'inherit' });
process.exitCode = child.status ?? 1;
