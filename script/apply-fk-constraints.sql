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

-- #############################################################
-- BATCH M — the 17 bare-varchar relationship FKs (audit 2026-06-14).
-- Prod orphan pre-scan returned ALL ZEROS (18/18: no real orphans,
-- no '' sentinels) so VALIDATE is clean. Same two-step NOT VALID +
-- VALIDATE pattern, per-block txn + 5-min statement_timeout, idempotent.
-- ON DELETE mirrors storage.deleteCase / deleteUser (CASCADE), the
-- unassign model (SET NULL), or parent-protection (RESTRICT).
-- consultations.created_by is INTENTIONALLY OMITTED (NOT NULL column →
-- SET NULL invalid; left unconstrained — decision 2026-06-14).
-- #############################################################

-- ===== CASCADE — case children -> law_cases (mirror deleteCase) =====

-- 7. memos.case_id -> law_cases.id  (CASCADE)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memos_case_id_fkey') THEN
    ALTER TABLE memos
      ADD CONSTRAINT memos_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES law_cases(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE memos VALIDATE CONSTRAINT memos_case_id_fkey;
COMMIT;

-- 8. hearings.case_id -> law_cases.id  (CASCADE)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hearings_case_id_fkey') THEN
    ALTER TABLE hearings
      ADD CONSTRAINT hearings_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES law_cases(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE hearings VALIDATE CONSTRAINT hearings_case_id_fkey;
COMMIT;

-- 9. case_notes.case_id -> law_cases.id  (CASCADE)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_notes_case_id_fkey') THEN
    ALTER TABLE case_notes
      ADD CONSTRAINT case_notes_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES law_cases(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE case_notes VALIDATE CONSTRAINT case_notes_case_id_fkey;
COMMIT;

-- 10. case_comments.case_id -> law_cases.id  (CASCADE)
--     NOTE: deleteCase does NOT delete case_comments today (known gap);
--     this FK now cleans them at the DB level on case delete. No conflict.
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_comments_case_id_fkey') THEN
    ALTER TABLE case_comments
      ADD CONSTRAINT case_comments_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES law_cases(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE case_comments VALIDATE CONSTRAINT case_comments_case_id_fkey;
COMMIT;

-- 11. legal_deadlines.case_id -> law_cases.id  (CASCADE)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'legal_deadlines_case_id_fkey') THEN
    ALTER TABLE legal_deadlines
      ADD CONSTRAINT legal_deadlines_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES law_cases(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE legal_deadlines VALIDATE CONSTRAINT legal_deadlines_case_id_fkey;
COMMIT;

-- 12. field_tasks.case_id -> law_cases.id  (CASCADE; column is nullable)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_tasks_case_id_fkey') THEN
    ALTER TABLE field_tasks
      ADD CONSTRAINT field_tasks_case_id_fkey
      FOREIGN KEY (case_id) REFERENCES law_cases(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE field_tasks VALIDATE CONSTRAINT field_tasks_case_id_fkey;
COMMIT;

-- ===== CASCADE — user children -> users (mirror deleteUser) =====

-- 13. notifications.recipient_id -> users.id  (CASCADE)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_recipient_id_fkey') THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_recipient_id_fkey
      FOREIGN KEY (recipient_id) REFERENCES users(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE notifications VALIDATE CONSTRAINT notifications_recipient_id_fkey;
COMMIT;

-- 14. delegations_table.from_user_id -> users.id  (CASCADE)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delegations_table_from_user_id_fkey') THEN
    ALTER TABLE delegations_table
      ADD CONSTRAINT delegations_table_from_user_id_fkey
      FOREIGN KEY (from_user_id) REFERENCES users(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE delegations_table VALIDATE CONSTRAINT delegations_table_from_user_id_fkey;
COMMIT;

-- 15. delegations_table.to_user_id -> users.id  (CASCADE)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delegations_table_to_user_id_fkey') THEN
    ALTER TABLE delegations_table
      ADD CONSTRAINT delegations_table_to_user_id_fkey
      FOREIGN KEY (to_user_id) REFERENCES users(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END$$;
ALTER TABLE delegations_table VALIDATE CONSTRAINT delegations_table_to_user_id_fkey;
COMMIT;

-- ===== SET NULL — assignment fields -> users (unassign; columns nullable) =====

-- 16. law_cases.primary_lawyer_id -> users.id  (SET NULL)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'law_cases_primary_lawyer_id_fkey') THEN
    ALTER TABLE law_cases
      ADD CONSTRAINT law_cases_primary_lawyer_id_fkey
      FOREIGN KEY (primary_lawyer_id) REFERENCES users(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END$$;
ALTER TABLE law_cases VALIDATE CONSTRAINT law_cases_primary_lawyer_id_fkey;
COMMIT;

-- 17. law_cases.responsible_lawyer_id -> users.id  (SET NULL)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'law_cases_responsible_lawyer_id_fkey') THEN
    ALTER TABLE law_cases
      ADD CONSTRAINT law_cases_responsible_lawyer_id_fkey
      FOREIGN KEY (responsible_lawyer_id) REFERENCES users(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END$$;
ALTER TABLE law_cases VALIDATE CONSTRAINT law_cases_responsible_lawyer_id_fkey;
COMMIT;

-- 18. consultations.assigned_to -> users.id  (SET NULL)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_assigned_to_fkey') THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES users(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END$$;
ALTER TABLE consultations VALIDATE CONSTRAINT consultations_assigned_to_fkey;
COMMIT;

-- 19. contracts.assigned_to -> users.id  (SET NULL)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_assigned_to_fkey') THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_assigned_to_fkey
      FOREIGN KEY (assigned_to) REFERENCES users(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END$$;
ALTER TABLE contracts VALIDATE CONSTRAINT contracts_assigned_to_fkey;
COMMIT;

-- ===== RESTRICT — protect parents (clients / departments) =====

-- 20. law_cases.client_id -> clients.id  (RESTRICT)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'law_cases_client_id_fkey') THEN
    ALTER TABLE law_cases
      ADD CONSTRAINT law_cases_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END$$;
ALTER TABLE law_cases VALIDATE CONSTRAINT law_cases_client_id_fkey;
COMMIT;

-- 21. law_cases.department_id -> departments.id  (RESTRICT)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'law_cases_department_id_fkey') THEN
    ALTER TABLE law_cases
      ADD CONSTRAINT law_cases_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES departments(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END$$;
ALTER TABLE law_cases VALIDATE CONSTRAINT law_cases_department_id_fkey;
COMMIT;

-- 22. consultations.department_id -> departments.id  (RESTRICT)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_department_id_fkey') THEN
    ALTER TABLE consultations
      ADD CONSTRAINT consultations_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES departments(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END$$;
ALTER TABLE consultations VALIDATE CONSTRAINT consultations_department_id_fkey;
COMMIT;

-- 23. contracts.department_id -> departments.id  (RESTRICT)
BEGIN;
SET LOCAL statement_timeout = '5min';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_department_id_fkey') THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES departments(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END$$;
ALTER TABLE contracts VALIDATE CONSTRAINT contracts_department_id_fkey;
COMMIT;

-- =============================================================
-- Verification — list ALL FKs (6 original + 17 Batch M = 23).
-- convalidated = t means the row scan passed. Run after the script.
-- =============================================================
SELECT conname, convalidated
FROM pg_constraint
WHERE conname IN (
  -- original 6 (Phase 2)
  'law_cases_converted_from_consultation_id_fkey',
  'consultation_studies_consultation_id_fkey',
  'consultation_drafts_consultation_id_fkey',
  'consultation_reviews_consultation_id_fkey',
  'consultation_committee_decisions_consultation_id_fkey',
  'consultation_note_outcomes_consultation_id_fkey',
  -- Batch M 17
  'memos_case_id_fkey',
  'hearings_case_id_fkey',
  'case_notes_case_id_fkey',
  'case_comments_case_id_fkey',
  'legal_deadlines_case_id_fkey',
  'field_tasks_case_id_fkey',
  'notifications_recipient_id_fkey',
  'delegations_table_from_user_id_fkey',
  'delegations_table_to_user_id_fkey',
  'law_cases_primary_lawyer_id_fkey',
  'law_cases_responsible_lawyer_id_fkey',
  'consultations_assigned_to_fkey',
  'contracts_assigned_to_fkey',
  'law_cases_client_id_fkey',
  'law_cases_department_id_fkey',
  'consultations_department_id_fkey',
  'contracts_department_id_fkey'
)
ORDER BY conname;
