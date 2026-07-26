-- =====================================================================
-- Follow-up cycle ("استشارة تعقيبية") fields on contracts
-- =====================================================================
-- Adds the two columns the contract follow-up mechanism needs. Direct
-- mirror of consultations.follow_up_count / follow_up_started_at — a
-- closed contract is re-opened on the SAME row (status flips back to
-- active, current_stage resets to استلام, follow_up_count increments).
--
--   follow_up_count        integer NOT NULL DEFAULT 0
--                          — how many follow-up rounds this contract has
--                            been through. NOT NULL with a default so
--                            existing rows backfill to 0 in the same
--                            statement (Postgres 11+ does this without a
--                            table rewrite). Mirrors
--                            consultations.follow_up_count exactly.
--
--   follow_up_started_at   timestamp
--                          — when the CURRENT round was opened. Nullable:
--                            NULL means the contract has never been
--                            re-opened. Mirrors
--                            consultations.follow_up_started_at.
--
-- ⚠ ORDER IS NOT OPTIONAL. Drizzle builds an explicit column list from the
-- table declaration in shared/schema.ts, so from the moment these columns
-- are declared, EVERY read of `contracts` selects them. Run this script on
-- a database BEFORE the new code serves traffic against it, or all contract
-- reads break — not just the follow-up feature.
--
--   1. run on DEV  →  2. confirm the app loads  →  3. run on PROD  →  4. deploy
--
-- Apply to BOTH dev and prod (per replit.md / CLAUDE.md).
-- Idempotent — safe to re-run.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-contract-follow-up-fields.sql
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'contracts' AND column_name = 'follow_up_count'
  ) THEN
    ALTER TABLE contracts
      ADD COLUMN follow_up_count integer NOT NULL DEFAULT 0;
    RAISE NOTICE 'contracts.follow_up_count added';
  ELSE
    RAISE NOTICE 'contracts.follow_up_count already exists — skipped';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'contracts' AND column_name = 'follow_up_started_at'
  ) THEN
    ALTER TABLE contracts
      ADD COLUMN follow_up_started_at timestamp;
    RAISE NOTICE 'contracts.follow_up_started_at added';
  ELSE
    RAISE NOTICE 'contracts.follow_up_started_at already exists — skipped';
  END IF;
END $$;
