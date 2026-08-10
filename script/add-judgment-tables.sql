-- =====================================================================
-- سجل الأحكام — the judgment record: case_judgments + judgment_attachments
-- =====================================================================
-- TWO NEW TABLES. Nothing existing is altered, nothing is dropped, and there is
-- no data change in this file — the backfill is a SEPARATE script
-- (script/backfill-judgments.sql), run after this one.
--
-- 🔴 RUN script/measure-judgment-backfill.sql FIRST. It is read-only and tells
-- you how many rows the backfill will create and whether the data is shaped the
-- way it assumes.
--
-- 🔴 case_attachments IS NOT TOUCHED. Its unique index on case_id is NOT
-- dropped — the DROP is forbidden. The one-deed-per-CASE table stays exactly as
-- it is and keeps serving every existing surface; judgment_attachments is a NEW
-- table keyed on the RULING, and the backfill COPIES rows into it rather than
-- moving them. Two deed tables coexisting permanently is the accepted cost.
--
-- WHY: a case can carry up to THREE rulings (first instance → appeal, which may
-- quash and remand → the new first-instance ruling). law_cases has ONE slot for
-- a deed date and one for an objection window, so the third ruling would
-- overwrite the first's and rewrite history. The quash cycle does NOT recur:
-- at most one quash, so at most three rulings — but nothing here CAPS the
-- sequence, so a fourth would insert cleanly. Do not add a CHECK forbidding it.
-- The court case number is NOT per-cycle; a remand keeps law_cases.court_case_number.
--
-- Design notes:
--   - sequence is the ONLY ordering key (1, 2, 3 within a case) and is UNIQUE
--     per case, so "judgment #1" is a fact rather than a guess. Deliberately not
--     created_at: the backfill stamps every row with the same now().
--   - degree is ابتدائي | استئنافي — the COURT, not the finality. نهائي is a
--     separate property and lives in is_final.
--   - opens_window is STORED INTENT, decided once when the ruling is recorded.
--     Recomputing it later would let the case's own movement rewrite whether an
--     already-expired objection window ever existed.
--   - superseded_at + superseded_by_judgment_id are the QUASH MARKER, set on the
--     ruling that WAS quashed, pointing at the appeal ruling that quashed it. A
--     NULL superseded_at means "this ruling still stands".
--   - recorded_by is varchar(255) with NO FK, matching every other user-id
--     column on these surfaces (attending_lawyer_id, flagged_by, checked_in_by);
--     the backfill writes the established 'system' sentinel, which names no user.
--   - FKs are ACTIVE, not commented. The Batch-M rule keeps FK declarations
--     commented because retrofitting one onto a POPULATED table can time out a
--     Republish; both tables here are created EMPTY with their constraints
--     inline, so there is no validation scan and no dev/prod drift for Republish
--     to resolve with a DROP. Same precedent as case_attachments /
--     hearing_attachments / hearing_ring_acknowledgements.
--   - hearing_id is ON DELETE SET NULL, not CASCADE: the judgment records the
--     RULING, not the session, so deleting a hearing must not delete the firm's
--     record that a judgment exists.
--
-- ⚠ ORDER IS NOT OPTIONAL. Drizzle builds an explicit column list from the
--   declarations in shared/schema.ts, so from the moment those exist every read
--   of these tables selects these columns BY NAME. Run this on dev → confirm the
--   app loads → run it on prod → deploy. db:push / drizzle-kit were NOT run.
--
-- Apply to BOTH dev (heliumdb) and prod (neondb), per replit.md / CLAUDE.md.
-- Idempotent — safe to re-run.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-judgment-tables.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS case_judgments (
  id                          varchar(255) PRIMARY KEY,
  case_id                     varchar(255) NOT NULL,
  hearing_id                  varchar(255),
  sequence                    integer NOT NULL,
  degree                      varchar(50) NOT NULL,
  outcome                     varchar(50),
  is_final                    boolean NOT NULL DEFAULT false,
  opens_window                boolean NOT NULL DEFAULT false,
  deed_received_date          varchar(50),
  objection_window_days       integer,
  objection_deadline          varchar(50),
  superseded_at               timestamp,
  superseded_by_judgment_id   varchar(255),
  recorded_by                 varchar(255),
  created_at                  timestamp DEFAULT now(),
  updated_at                  timestamp DEFAULT now()
);

-- FKs guarded so a re-run does not error on an existing constraint. The names
-- match the drizzle declarations in shared/schema.ts byte-for-byte.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_judgments_case_id_fkey') THEN
    ALTER TABLE case_judgments
      ADD CONSTRAINT case_judgments_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES law_cases(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_judgments_hearing_id_fkey') THEN
    ALTER TABLE case_judgments
      ADD CONSTRAINT case_judgments_hearing_id_fkey
      FOREIGN KEY (hearing_id) REFERENCES hearings(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_judgments_superseded_by_fkey') THEN
    ALTER TABLE case_judgments
      ADD CONSTRAINT case_judgments_superseded_by_fkey
      FOREIGN KEY (superseded_by_judgment_id) REFERENCES case_judgments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- One ruling per (case, position in the chain). This unique b-tree IS the
-- lookup index for both read accessors ("this case's judgments, in order" and
-- "the highest sequence"), so no separate case index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS case_judgments_case_sequence_unique_idx
  ON case_judgments (case_id, sequence);

CREATE TABLE IF NOT EXISTS judgment_attachments (
  id           varchar(255) PRIMARY KEY,
  judgment_id  varchar(255) NOT NULL,
  file_name    varchar(500) NOT NULL,
  file_path    varchar(1000) NOT NULL,
  file_size    bigint NOT NULL,
  mime_type    varchar(100) NOT NULL,
  uploaded_by  varchar(255) NOT NULL,
  uploaded_at  timestamp DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'judgment_attachments_judgment_id_fkey') THEN
    ALTER TABLE judgment_attachments
      ADD CONSTRAINT judgment_attachments_judgment_id_fkey
      FOREIGN KEY (judgment_id) REFERENCES case_judgments(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Exactly one صك per ruling. Plain UNIQUE, not the PARTIAL index
-- contract_attachments uses: that one needs `WHERE slot_key IS NOT NULL` only
-- because it mixes single-file slots with unlimited free attachments. This table
-- has neither, so a plain UNIQUE is correct, stricter, and doubles as the lookup
-- index.
CREATE UNIQUE INDEX IF NOT EXISTS judgment_attachments_judgment_unique_idx
  ON judgment_attachments (judgment_id);

-- =====================================================================
-- Verification — run after applying, on EACH database.
-- Expect 16 + 8 = 24 column rows, 4 FK constraints, 2 unique indexes
-- (plus the 2 primary-key indexes).
-- =====================================================================
-- SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
--   FROM information_schema.columns
--  WHERE table_name IN ('case_judgments', 'judgment_attachments')
--  ORDER BY table_name, ordinal_position;
--
-- SELECT conname, contype, convalidated FROM pg_constraint
--  WHERE conrelid IN ('case_judgments'::regclass, 'judgment_attachments'::regclass);
--
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE tablename IN ('case_judgments', 'judgment_attachments');
