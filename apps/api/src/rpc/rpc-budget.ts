import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { PostgresDatabase } from '@dao-platform/database';
import { RpcFault } from './rpc-policy';

export async function consumeRpcBudget(
  db: PostgresDatabase,
  wallet: string | undefined,
  reads: number,
  writes: number,
) {
  const actor = createHash('sha256')
    .update(wallet ?? 'anonymous')
    .digest('hex');
  const limits: [string, string, number, number][] = [];
  if (reads)
    limits.push(
      [actor, 'read', reads, wallet ? 240 : 120],
      ['global', 'read', reads, 1000],
    );
  if (writes)
    limits.push(
      [actor, 'submit', writes, 10],
      ['global', 'submit', writes, 100],
    );
  try {
    await db.transaction().execute(async (tx) => {
      await sql`DELETE FROM public.rpc_rate_limits WHERE window_start < now() - interval '2 minutes'`.execute(
        tx,
      );
      for (const [key, kind, cost, limit] of limits) {
        if (cost > limit)
          throw new RpcFault(429, -32005, 'RPC rate limit exceeded.');
        const result =
          await sql`INSERT INTO public.rpc_rate_limits(actor, kind, window_start, used)
          VALUES (${key}, ${kind}, date_trunc('minute', now()), ${cost})
          ON CONFLICT (actor, kind, window_start) DO UPDATE
          SET used = public.rpc_rate_limits.used + EXCLUDED.used
          WHERE public.rpc_rate_limits.used + EXCLUDED.used <= ${limit} RETURNING used`.execute(
            tx,
          );
        if (!result.rows.length)
          throw new RpcFault(429, -32005, 'RPC rate limit exceeded.');
      }
    });
  } catch (error) {
    if (error instanceof RpcFault) throw error;
    throw new RpcFault(503, -32000, 'RPC rate control is unavailable.');
  }
}
