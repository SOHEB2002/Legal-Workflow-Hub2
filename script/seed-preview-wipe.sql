-- ============================================================================
-- seed-preview-wipe.sql — DEV-ONLY full wipe of all business data + all users
-- EXCEPT the branch_manager (id='1', username='manager'). Keeps `departments`.
--
-- Run from the Replit Shell against the DEV database ONLY:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/seed-preview-wipe.sql
--
-- SAFETY: hard guard aborts unless current_database() = 'heliumdb' (prod is
-- neondb). One transaction — any error rolls everything back. Deletes in
-- FK-safe order (every referencing row before the rows it points at), so the
-- final `users` delete can't trip a foreign key. Verify first:
--     SELECT current_database();
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION
      'WIPE ABORTED: current_database() = %, expected dev ''heliumdb''. NEVER run on prod (neondb).',
      current_database();
  END IF;
END $$;

-- Independent / leaf tables first (nothing references them).
DELETE FROM support_tickets;
DELETE FROM saved_filters;
DELETE FROM user_section_views;
DELETE FROM notifications;
DELETE FROM attachments;

-- Case/consultation/contract/memo/hearing chains (children before parents).
DELETE FROM field_tasks;
DELETE FROM contact_logs;
DELETE FROM legal_deadlines;

DELETE FROM memo_note_outcomes;
DELETE FROM memo_committee_decisions;
DELETE FROM memo_reviews;
DELETE FROM memo_activity_log;
DELETE FROM memos;

DELETE FROM hearings;

DELETE FROM contract_activity_log;
DELETE FROM contract_attachments;
DELETE FROM contracts;

DELETE FROM consultation_activity_log;
DELETE FROM consultation_delivery_extensions;
DELETE FROM consultation_note_outcomes;
DELETE FROM consultation_committee_decisions;
DELETE FROM consultation_reviews;
DELETE FROM consultation_drafts;
DELETE FROM consultation_studies;
DELETE FROM consultations;

DELETE FROM case_comments;
DELETE FROM case_notes;
DELETE FROM case_activity_log;
DELETE FROM law_cases;

DELETE FROM clients;

DELETE FROM delegations_table;

-- Finally, every user except the branch_manager (id='1'). All the above is
-- already gone, so no FK to users remains.
DELETE FROM users WHERE id <> '1';

COMMIT;

-- Verify: exactly one user (the manager) and zero business rows remain.
--   SELECT (SELECT count(*) FROM users) AS users,           -- expect 1
--          (SELECT count(*) FROM law_cases) AS cases,       -- expect 0
--          (SELECT count(*) FROM clients) AS clients,       -- expect 0
--          (SELECT count(*) FROM departments) AS departments; -- unchanged (kept)
--   SELECT id, username, name FROM users;                    -- expect 1 / manager / مدير الفرع
