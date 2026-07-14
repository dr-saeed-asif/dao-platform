import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

process.env.DATABASE_URL = `file:${resolve(
  tmpdir(),
  `dao-api-e2e-${process.pid}-${Date.now()}.db`,
)}`;
process.env.NODE_ENV = 'test';
process.env.DEV_AUTH_BYPASS_ENABLED = 'true';
process.env.DAO_ADMIN_ADDRESS = '0xb8163f7d6d404f67a400743b90f7952d2d137b8e';
process.env.CYBERCHAIN_RPC_URL = 'http://localhost:8545';
process.env.CYBERCHAIN_CHAIN_ID = '1212';
process.env.GOVERNANCE_CONTRACT_ADDRESS =
  '0x51b43885899bd0301c2beea89addc9d876145d21';
