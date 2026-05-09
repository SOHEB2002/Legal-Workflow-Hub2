-- =====================================================================
-- Contracts & Projects department seed (العقود_والمشاريع)
-- =====================================================================
-- Adds the system department that owns the contracts module by default.
-- The contracts create form pre-selects this department; users can still
-- route a contract to any other department before saving (or transfer
-- it later via the standard PATCH-with-departmentId flow that mirrors
-- cases).
--
-- Idempotent — looks up by name, only inserts when absent. Safe to
-- re-run on dev + prod.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-contracts-department.sql
-- =====================================================================

DO $$
DECLARE
  next_id text;
  max_numeric_id int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM departments WHERE name = 'العقود_والمشاريع') THEN
    -- Pick the next free numeric id ≥ 5 so we don't collide with
    -- whatever ids already live in the table. Cast handles any
    -- non-numeric ids gracefully (those rows just don't contribute).
    SELECT COALESCE(MAX(id::int), 4) INTO max_numeric_id
      FROM departments
     WHERE id ~ '^[0-9]+$';

    next_id := GREATEST(5, max_numeric_id + 1)::text;

    INSERT INTO departments (id, name, head_id, created_at)
    VALUES (next_id, 'العقود_والمشاريع', NULL, now());

    RAISE NOTICE 'Inserted contracts department with id %', next_id;
  ELSE
    RAISE NOTICE 'Contracts department already exists — skipped';
  END IF;
END $$;
