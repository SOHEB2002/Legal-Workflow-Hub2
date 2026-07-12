-- ============================================================================
-- seed-preview-cleanup.sql — removes EXACTLY the rows seed-preview-tasks.sql
-- created (every id LIKE 'T\_%'). Manager (id='1') and departments untouched.
--
-- DEV ONLY. Run from the Replit Shell:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/seed-preview-cleanup.sql
--
-- Use this to re-seed without a full wipe: cleanup -> seed. (A full reset is
-- seed-preview-wipe.sql -> seed.) Same hard guard; one transaction; FK-safe
-- order (children before parents); touches ONLY 'T_'-prefixed rows.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION
      'CLEANUP ABORTED: current_database() = %, expected dev ''heliumdb''. NEVER run on prod (neondb).',
      current_database();
  END IF;
END $$;

DELETE FROM delegations_table WHERE id LIKE 'T\_%';
DELETE FROM contact_logs      WHERE id LIKE 'T\_%';
DELETE FROM legal_deadlines   WHERE id LIKE 'T\_%';
DELETE FROM field_tasks       WHERE id LIKE 'T\_%';
DELETE FROM memos             WHERE id LIKE 'T\_%';
DELETE FROM hearings          WHERE id LIKE 'T\_%';
DELETE FROM consultations     WHERE id LIKE 'T\_%';
DELETE FROM contracts         WHERE id LIKE 'T\_%';
DELETE FROM law_cases         WHERE id LIKE 'T\_%';
DELETE FROM users             WHERE id LIKE 'T\_%';
DELETE FROM clients           WHERE id LIKE 'T\_%';

COMMIT;

-- Verify zero T_ rows remain, e.g.:
--   SELECT count(*) FROM users WHERE id LIKE 'T\_%';   -- expect 0
