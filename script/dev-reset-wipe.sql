-- ============================================================================
-- dev-reset-wipe.sql — DEV-ONLY wipe of the FIVE workflow entities
--   law_cases · hearings · memos · contracts · consultations
-- and every row that depends on them.
--
-- KEEPS (never touched): users, departments, clients,
--   admin_support_task_assignments, saved_filters, user_section_views,
--   support_tickets, delegations_table.
--
-- ⚠ PROPOSAL — NOT YET RUN. Review before executing.
--
-- Run from the Replit Shell against the DEV database ONLY:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/dev-reset-wipe.sql
--
-- SAFETY
--   • Hard guard: aborts unless current_database() = 'heliumdb'. PROD is
--     'neondb' and must NEVER be touched by this file.
--   • ONE transaction — any error rolls the whole thing back.
--   • EXPLICIT deletes in FK-safe order (every referencing row before the rows
--     it points at). It deliberately does NOT rely on ON DELETE CASCADE: half
--     the FKs in this schema are the COMMENTED kind that live only where
--     apply-fk-constraints.sql has been run, so cascade presence on dev is not
--     guaranteed (see the FK/dev-prod rule in CLAUDE.md). Cascade, where it
--     exists, simply makes some of these deletes no-ops.
--   • IDEMPOTENT: re-running deletes zero rows and succeeds.
--
-- Verify the target BEFORE running:  SELECT current_database();
-- ============================================================================

BEGIN;

-- ---- 0. DEV GUARD ----------------------------------------------------------
DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION
      'WIPE ABORTED: current_database() = %, expected dev ''heliumdb''. NEVER run on prod (neondb).',
      current_database();
  END IF;
END $$;

-- ---- 1. POLYMORPHIC LEAVES -------------------------------------------------
-- No FK to the five entities (entity_type/entity_id and related_type/related_id
-- are loose strings), so nothing forces their removal — but every row would
-- dangle after the wipe, and stale notifications keep lighting up the bell for
-- users we are KEEPING. Deleted wholesale.
-- NOTE: `attachments` rows are metadata only; the underlying files under
-- uploads/ are NOT removed by this script (see the report).
DELETE FROM notifications;
DELETE FROM attachments;

-- ---- 2. FIELD TASKS + their activity thread --------------------------------
-- general_task_events is a child of field_tasks (cascade FK, uncommented in
-- schema.ts) — deleted explicitly first anyway. This table is MISSING from the
-- older seed-e2e-tasks.sql / seed-preview-wipe.sql wipe blocks.
DELETE FROM general_task_events;
DELETE FROM field_tasks;

-- ---- 3. LEGAL DEADLINES (case children) ------------------------------------
DELETE FROM legal_deadlines;

-- ---- 4. MEMO CHAIN (children → parent) -------------------------------------
DELETE FROM memo_note_outcomes;
DELETE FROM memo_committee_decisions;
DELETE FROM memo_reviews;
DELETE FROM memo_activity_log;
DELETE FROM memos;

-- ---- 5. HEARINGS -----------------------------------------------------------
DELETE FROM hearings;

-- ---- 6. CONTRACT CHAIN (children → parent) ---------------------------------
DELETE FROM contract_activity_log;
DELETE FROM contract_attachments;
DELETE FROM contracts;

-- ---- 7. CASE CHAIN (children → parent) -------------------------------------
-- law_cases is deleted BEFORE consultations on purpose: law_cases carries
-- converted_from_consultation_id → consultations(id) ON DELETE SET NULL. Doing
-- consultations first would fire a pointless SET NULL pass over rows that are
-- about to be deleted anyway. (Either order is CORRECT; this one is cheaper.)
DELETE FROM case_comments;
DELETE FROM case_notes;
DELETE FROM case_activity_log;
DELETE FROM law_cases;

-- ---- 8. CONSULTATION CHAIN (children → parent) -----------------------------
DELETE FROM consultation_activity_log;
DELETE FROM consultation_delivery_extensions;
DELETE FROM consultation_note_outcomes;
DELETE FROM consultation_committee_decisions;
DELETE FROM consultation_reviews;
DELETE FROM consultation_drafts;
DELETE FROM consultation_studies;
DELETE FROM consultations;

-- ---- 9. CONTACT LOGS — DELETE (owner decision, 2026-07-27) -----------------
-- contact_logs is client-scoped history with a NULLABLE, UN-FK'd case_id. After
-- the wipe every non-null case_id dangles, and follow_up_required rows keep
-- emitting `contact_followup` tasks for cases that no longer exist.
-- DECIDED: delete them — they are test artifacts too, and seed-dev-2026-07.sql
-- regenerates a realistic set. Note this removes client ACTIVITY, not clients:
-- the `clients` rows themselves are untouched.
-- ONE-LINE SWITCH: to preserve client contact history instead, comment the
-- DELETE and uncomment the UPDATE below — it drops only the dangling case link.
DELETE FROM contact_logs;
-- UPDATE contact_logs SET case_id = NULL WHERE case_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- FINAL COUNTS — expect 0 for every WIPED row, unchanged for every KEPT row.
-- ============================================================================
SELECT 'law_cases'                      AS table_name, count(*) AS rows, 'WIPED' AS expect FROM law_cases
UNION ALL SELECT 'hearings',                      count(*), 'WIPED' FROM hearings
UNION ALL SELECT 'memos',                         count(*), 'WIPED' FROM memos
UNION ALL SELECT 'contracts',                     count(*), 'WIPED' FROM contracts
UNION ALL SELECT 'consultations',                 count(*), 'WIPED' FROM consultations
UNION ALL SELECT 'case_activity_log',             count(*), 'WIPED' FROM case_activity_log
UNION ALL SELECT 'case_notes',                    count(*), 'WIPED' FROM case_notes
UNION ALL SELECT 'case_comments',                 count(*), 'WIPED' FROM case_comments
UNION ALL SELECT 'memo_activity_log',             count(*), 'WIPED' FROM memo_activity_log
UNION ALL SELECT 'memo_reviews',                  count(*), 'WIPED' FROM memo_reviews
UNION ALL SELECT 'memo_committee_decisions',      count(*), 'WIPED' FROM memo_committee_decisions
UNION ALL SELECT 'memo_note_outcomes',            count(*), 'WIPED' FROM memo_note_outcomes
UNION ALL SELECT 'contract_activity_log',         count(*), 'WIPED' FROM contract_activity_log
UNION ALL SELECT 'contract_attachments',          count(*), 'WIPED' FROM contract_attachments
UNION ALL SELECT 'consultation_activity_log',     count(*), 'WIPED' FROM consultation_activity_log
UNION ALL SELECT 'consultation_studies',          count(*), 'WIPED' FROM consultation_studies
UNION ALL SELECT 'consultation_drafts',           count(*), 'WIPED' FROM consultation_drafts
UNION ALL SELECT 'consultation_reviews',          count(*), 'WIPED' FROM consultation_reviews
UNION ALL SELECT 'consultation_committee_decisions', count(*), 'WIPED' FROM consultation_committee_decisions
UNION ALL SELECT 'consultation_note_outcomes',    count(*), 'WIPED' FROM consultation_note_outcomes
UNION ALL SELECT 'consultation_delivery_extensions', count(*), 'WIPED' FROM consultation_delivery_extensions
UNION ALL SELECT 'field_tasks',                   count(*), 'WIPED' FROM field_tasks
UNION ALL SELECT 'general_task_events',           count(*), 'WIPED' FROM general_task_events
UNION ALL SELECT 'legal_deadlines',               count(*), 'WIPED' FROM legal_deadlines
UNION ALL SELECT 'notifications',                 count(*), 'WIPED' FROM notifications
UNION ALL SELECT 'attachments',                   count(*), 'WIPED' FROM attachments
UNION ALL SELECT 'contact_logs',                  count(*), 'WIPED' FROM contact_logs
UNION ALL SELECT '--- KEPT ---',                  NULL,     ''
UNION ALL SELECT 'users',                         count(*), 'KEPT'  FROM users
UNION ALL SELECT 'departments',                   count(*), 'KEPT'  FROM departments
UNION ALL SELECT 'clients',                       count(*), 'KEPT'  FROM clients
UNION ALL SELECT 'admin_support_task_assignments',count(*), 'KEPT'  FROM admin_support_task_assignments
UNION ALL SELECT 'delegations_table',             count(*), 'KEPT'  FROM delegations_table
UNION ALL SELECT 'saved_filters',                 count(*), 'KEPT'  FROM saved_filters
UNION ALL SELECT 'user_section_views',            count(*), 'KEPT'  FROM user_section_views
UNION ALL SELECT 'support_tickets',               count(*), 'KEPT'  FROM support_tickets;
