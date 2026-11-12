import { Kysely, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await sql`CREATE TABLE public.rpc_rate_limits (
    actor text NOT NULL, kind text NOT NULL, window_start timestamptz NOT NULL,
    used integer NOT NULL CHECK (used >= 0), PRIMARY KEY (actor, kind, window_start)
  )`.execute(db);
  await sql`CREATE INDEX rpc_rate_limits_expiry ON public.rpc_rate_limits(window_start)`.execute(
    db,
  );
  await sql`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cyberdao_dao_runtime') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.rpc_rate_limits TO cyberdao_dao_runtime;
    END IF;
  END $$`.execute(db);
}

export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await sql`DROP TABLE public.rpc_rate_limits`.execute(db);
}
