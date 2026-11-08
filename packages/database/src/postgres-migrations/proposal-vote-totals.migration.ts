import { Kysely, sql } from "kysely";
import type { PostgresDatabaseSchema } from "../postgres-database-schema.js";

export async function up(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await sql`LOCK TABLE public.votes, public.proposals IN SHARE ROW EXCLUSIVE MODE`.execute(db);
  await sql`
    UPDATE public.proposals AS proposal
    SET total_votes = (
      SELECT count(*) FROM public.votes AS vote WHERE vote.proposal_id = proposal.id
    )
    WHERE proposal.total_votes IS NULL OR proposal.finalized_at IS NULL
  `.execute(db);
  await sql`ALTER TABLE public.proposals ALTER COLUMN total_votes SET DEFAULT 0`.execute(db);
  await sql`
    CREATE FUNCTION public.maintain_proposal_vote_total() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.proposal_id = NEW.proposal_id THEN
        RETURN NULL;
      END IF;
      IF TG_OP IN ('DELETE', 'UPDATE') THEN
        UPDATE public.proposals SET total_votes = total_votes - 1
        WHERE id = OLD.proposal_id AND finalized_at IS NULL;
      END IF;
      IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE public.proposals SET total_votes = total_votes + 1
        WHERE id = NEW.proposal_id AND finalized_at IS NULL;
      END IF;
      RETURN NULL;
    END;
    $$
  `.execute(db);
  await sql`
    CREATE TRIGGER maintain_proposal_vote_total
    AFTER INSERT OR DELETE OR UPDATE OF proposal_id ON public.votes
    FOR EACH ROW EXECUTE FUNCTION public.maintain_proposal_vote_total()
  `.execute(db);
}

export async function down(db: Kysely<PostgresDatabaseSchema>): Promise<void> {
  await sql`DROP TRIGGER maintain_proposal_vote_total ON public.votes`.execute(db);
  await sql`DROP FUNCTION public.maintain_proposal_vote_total()`.execute(db);
  await sql`ALTER TABLE public.proposals ALTER COLUMN total_votes DROP DEFAULT`.execute(db);
}
