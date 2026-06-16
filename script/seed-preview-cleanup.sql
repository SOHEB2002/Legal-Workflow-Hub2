-- ============================================================================
-- seed-preview-cleanup.sql — removes EXACTLY the rows seed-preview-tasks.sql
-- created (every id LIKE 'SEED\_%'), returning dev to a clean state.
--
-- DEV ONLY. Run from the Replit Shell against the DEV database:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/seed-preview-cleanup.sql
--
-- Same hard guard as the seed (aborts unless current_database() = 'heliumdb').
-- One transaction. Deletes in FK-safe order (children before parents). Touches
-- ONLY 'SEED_'-prefixed rows — no real data is affected.
-- ============================================================================

BEGIN;

-- ---- HARD DEV-ONLY GUARD -----------------------------------------------------
DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION
      'CLEANUP ABORTED: current_database() = %, expected dev ''heliumdb''. NEVER run on prod (neondb).',
      current_database();
  END IF;
END $$;

-- Children / referencing rows first, then parents.
DELETE FROM delegations_table WHERE id LIKE 'SEED\_%';
DELETE FROM contact_logs      WHERE id LIKE 'SEED\_%';
DELETE FROM legal_deadlines   WHERE id LIKE 'SEED\_%';
DELETE FROM field_tasks       WHERE id LIKE 'SEED\_%';
DELETE FROM memos             WHERE id LIKE 'SEED\_%';
DELETE FROM hearings          WHERE id LIKE 'SEED\_%';
DELETE FROM consultations     WHERE id LIKE 'SEED\_%';
DELETE FROM contracts         WHERE id LIKE 'SEED\_%';
DELETE FROM law_cases         WHERE id LIKE 'SEED\_%';
DELETE FROM users             WHERE id LIKE 'SEED\_%';
DELETE FROM clients           WHERE id LIKE 'SEED\_%';

COMMIT;

-- Verify zero SEED rows remain, e.g.:
--   SELECT count(*) FROM users WHERE id LIKE 'SEED\_%';   -- expect 0
