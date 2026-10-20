import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresService } from '../database/postgres.service';

const logger = new Logger('StartupHealth');
const timeout = () => AbortSignal.timeout(5_000);

export async function logStartupHealth(
  config: ConfigService,
  postgres: PostgresService,
  port: number,
): Promise<void> {
  logger.log(`NestJS API: UP (http://localhost:${port}/v1/health)`);
  await logPostgres(postgres);
  await logPython(config);
  await logChain(config);
}

async function logPostgres(postgres: PostgresService): Promise<void> {
  try {
    await postgres.checkConnection();
    logger.log('PostgreSQL: UP');
  } catch (error) {
    logger.error(`PostgreSQL: DOWN (${errorName(error)})`);
  }
}

async function logPython(config: ConfigService): Promise<void> {
  const origin = config.get<string>('AI_SERVER_URL');
  if (!origin) return logger.warn('Python AI server: NOT CONFIGURED (AI_SERVER_URL)');
  try {
    const response = await fetch(new URL('/health', origin), { signal: timeout() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const health = await response.json() as {
      status?: string; postgres?: string; ollama?: { status?: string };
    };
    const line = `Python AI server: UP (${health.status ?? 'unknown'}); PostgreSQL: ${health.postgres ?? 'unknown'}; Ollama: ${health.ollama?.status ?? 'unknown'}`;
    if (health.status === 'ok') logger.log(line);
    else logger.warn(line);
  } catch (error) {
    logger.error(`Python AI server: DOWN (${errorName(error)})`);
  }
}

async function logChain(config: ConfigService): Promise<void> {
  const rpc = config.get<string>('CYBERCHAIN_RPC_URL');
  if (!rpc) return logger.warn('CyberChain RPC: NOT CONFIGURED');
  try {
    const response = await fetch(rpc, {
      method: 'POST', signal: timeout(),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    });
    const result = await response.json() as { result?: string; error?: unknown };
    if (!response.ok || result.error || !result.result) throw new Error('RPC request failed');
    const actual = BigInt(result.result).toString();
    const expected = config.get<string>('CYBERCHAIN_CHAIN_ID');
    logger.log(`CyberChain RPC: UP (chain ${actual}${expected && actual !== expected ? `; expected ${expected}` : ''})`);
    if (expected && actual !== expected) logger.warn('CyberChain RPC chain ID does not match CYBERCHAIN_CHAIN_ID');
  } catch (error) {
    logger.error(`CyberChain RPC: DOWN (${errorName(error)})`);
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}
