-- =====================================================================
-- "تم الاطلاع" — per-person acknowledgement of a pre-hearing ring
-- =====================================================================
-- ONE new table. Nothing existing is touched and there is no backfill: a
-- hearing nobody has acknowledged simply has no rows here, which is the normal
-- state for every hearing that has ever existed.
--
-- Purpose: the pre-hearing ring escalates through four tiers, and most people it
-- reaches (a department member, an admin_support user) may NOT press "تحضير" —
-- that is restricted to the attending lawyer, the own-department head and the
-- branch manager. Without a per-person acknowledgement those users would face a
-- deliberately non-dismissable modal with no action they are allowed to take.
-- This is the row that lets them silence their OWN ring without ending the chain
-- for anybody else.
--
-- Design notes:
--   - One row per (hearing, user); the UNIQUE index enforces it and is what
--     makes POST /api/hearings/:id/acknowledge idempotent — a double press, or
--     two tabs racing, insert once and the second is a no-op.
--   - user_id is varchar(255) with NO FK, matching every other user-id column in
--     this schema (hearings.attending_lawyer_id, hearings.flagged_by,
--     hearings.checked_in_by). Only the hearing side is constrained.
--   - The hearing FK is ACTIVE, not commented. The Batch-M rule keeps FK
--     declarations commented because retrofitting one onto a POPULATED table can
--     time out a Republish; this table is created EMPTY, so there is no
--     validation scan and no dev/prod drift for Republish to resolve with a
--     DROP. Same precedent as hearing_attachments / case_attachments.
--   - ON DELETE CASCADE: deleting a hearing takes its acknowledgements with it.
--     They have no meaning without it.
--
-- 🔴 THIS IS NOT A CHECK-IN. "تحضير" writes hearings.checked_in_at and ends the
--   ring for EVERYONE; this ends it for one person. Nothing outside the
--   ring-state endpoint reads this table — not the hearings display, not the
--   unprepared-hearing auto-flag, not the late-check-in derivation.
--
-- ⚠ ORDER IS NOT OPTIONAL. Drizzle builds an explicit column list from the table
--   declaration in shared/schema.ts, so from the moment this table is declared
--   every read of it selects these columns by name. Run this on dev → confirm
--   the app loads → run it on prod → deploy. db:push was NOT run.
--
-- Apply to BOTH dev (heliumdb) and prod (neondb), per replit.md / CLAUDE.md.
-- Idempotent — safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS hearing_ring_acknowledgements (
  id              varchar(255) PRIMARY KEY,
  hearing_id      varchar(255) NOT NULL,
  user_id         varchar(255) NOT NULL,
  acknowledged_at timestamp DEFAULT now()
);

-- FK guarded so a re-run does not error on an existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hearing_ring_ack_hearing_id_fkey') THEN
    ALTER TABLE hearing_ring_acknowledgements
      ADD CONSTRAINT hearing_ring_ack_hearing_id_fkey
      FOREIGN KEY (hearing_id) REFERENCES hearings(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS hearing_ring_ack_unique_idx
  ON hearing_ring_acknowledgements (hearing_id, user_id);

-- Verification — expect four columns, one FK and one unique index:
--   SELECT column_name, data_type, character_maximum_length, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'hearing_ring_acknowledgements'
--    ORDER BY ordinal_position;
--
--   SELECT conname, contype FROM pg_constraint
--    WHERE conrelid = 'hearing_ring_acknowledgements'::regclass;
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'hearing_ring_acknowledgements';
