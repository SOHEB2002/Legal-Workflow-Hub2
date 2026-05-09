-- Phase 2 — manually-applied FK constraints.
--
-- Background: the validating "ADD CONSTRAINT ... FOREIGN KEY" form scans
-- every existing row to verify referential integrity, which was timing
-- out the Replit production deploy on these consultation_* tables.
-- Drizzle-kit push only runs Phase-1 (additive columns, indexes,
-- contracts unique swap) because the FK declarations were temporarily
-- commented out in shared/schema.ts.
--
-- This script restores the FK constraints in two steps per table:
--   1. ADD CONSTRAINT ... NOT VALID    -- instant; metadata-only, no row scan
--   2. VALIDATE CONSTRAINT ...         -- row scan, but takes only an
--                                         ACCESS SHARE lock so writes are
--                                         not blocked
--
-- Run from the Replit Shell against the production DB:
--   psql "$DATABASE_URL" -f script/apply-fk-constraints.sql
--
-- Each block is wrapped in its own transaction with a 5-minute
-- statement_timeout so a single slow VALIDATE cannot wedge the deploy.
-- Re-running the script is safe — every step is guarded with IF NOT
-- EXISTS / a NOT VALID probe.

\set ON_ERROR_STOP on

-- =============================================================
-- 1. law_cases.converted_from_consultation_id  -> consultations.id
-- =============================================================
BEGIN;
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'law_cases_converted_from_consultation_id_fkey'
  ) THEN
    ALTER TABLE law_cases
      ADD CONSTRAINT law_cases_converted_from_consultation_id_fkey
      FOREIGN KEY (converted_from_consultation_id)
      REFERENCES consultations(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END$$;

ALTER TABLE law_cases
  VALIDATE CONSTRAINT law_cases_converted_from_consultation_id_fkey;
COMMIT;

-- =============================================================
-- 2. consultation_studies.consultation_id  -> consultations.id
-- =============================================================
BEGIN;
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_studies_consultation_id_fkey'
  ) THEN
    ALTER TABLE consultation_studies
      ADD CONSTRAINT consultation_studies_consultation_id_fkey
      FOREIGN KEY (consultation_id)
      REFERENCES consultations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END$$;

ALTER TABLE consultation_studies
  VALIDATE CONSTRAINT consultation_studies_consultation_id_fkey;
COMMIT;

-- =============================================================
-- 3. consultation_drafts.consultation_id  -> consultations.id
-- =============================================================
BEGIN;
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_drafts_consultation_id_fkey'
  ) THEN
    ALTER TABLE consultation_drafts
      ADD CONSTRAINT consultation_drafts_consultation_id_fkey
      FOREIGN KEY (consultation_id)
      REFERENCES consultations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END$$;

ALTER TABLE consultation_drafts
  VALIDATE CONSTRAINT consultation_drafts_consultation_id_fkey;
COMMIT;

-- =============================================================
-- 4. consultation_reviews.consultation_id  -> consultations.id
-- =============================================================
BEGIN;
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_reviews_consultation_id_fkey'
  ) THEN
    ALTER TABLE consultation_reviews
      ADD CONSTRAINT consultation_reviews_consultation_id_fkey
      FOREIGN KEY (consultation_id)
      REFERENCES consultations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END$$;

ALTER TABLE consultation_reviews
  VALIDATE CONSTRAINT consultation_reviews_consultation_id_fkey;
COMMIT;

-- =============================================================
-- 5. consultation_committee_decisions.consultation_id  -> consultations.id
-- =============================================================
BEGIN;
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_committee_decisions_consultation_id_fkey'
  ) THEN
    ALTER TABLE consultation_committee_decisions
      ADD CONSTRAINT consultation_committee_decisions_consultation_id_fkey
      FOREIGN KEY (consultation_id)
      REFERENCES consultations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END$$;

ALTER TABLE consultation_committee_decisions
  VALIDATE CONSTRAINT consultation_committee_decisions_consultation_id_fkey;
COMMIT;

-- =============================================================
-- 6. consultation_note_outcomes.consultation_id  -> consultations.id
-- =============================================================
BEGIN;
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_note_outcomes_consultation_id_fkey'
  ) THEN
    ALTER TABLE consultation_note_outcomes
      ADD CONSTRAINT consultation_note_outcomes_consultation_id_fkey
      FOREIGN KEY (consultation_id)
      REFERENCES consultations(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END$$;

ALTER TABLE consultation_note_outcomes
  VALIDATE CONSTRAINT consultation_note_outcomes_consultation_id_fkey;
COMMIT;

-- =============================================================
-- Verification — list the six FKs (run after the script completes).
-- =============================================================
SELECT conname, convalidated
FROM pg_constraint
WHERE conname IN (
  'law_cases_converted_from_consultation_id_fkey',
  'consultation_studies_consultation_id_fkey',
  'consultation_drafts_consultation_id_fkey',
  'consultation_reviews_consultation_id_fkey',
  'consultation_committee_decisions_consultation_id_fkey',
  'consultation_note_outcomes_consultation_id_fkey'
)
ORDER BY conname;
