-- =====================================================================
-- Contracts & Projects department seed (العقود والمشاريع)
-- =====================================================================
-- Adds the system department that owns the contracts module by default.
-- The contracts create form pre-selects this department; users can still
-- route a contract to any other department before saving (or transfer
-- it later via the standard PATCH-with-departmentId flow that mirrors
-- cases).
--
-- Idempotent — handles three states:
--   (a) row exists with the new "العقود والمشاريع" name → no-op
--   (b) row exists with the legacy "العقود_والمشاريع" name (older
--       installs that ran an earlier version of this script) →
--       UPDATE renames it to the new name in place, preserving the id
--       (so any user_section_views / user.department_id rows pointing
--       at it stay valid).
--   (c) no row → INSERT with the next free numeric id ≥ 5.
--
-- Apply to BOTH dev and prod (per replit.md). Safe to re-run.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-contracts-department.sql
-- =====================================================================

DO $$
DECLARE
  next_id text;
  max_numeric_id int;
BEGIN
  -- Step (b): fold any legacy underscore-named row into the new name
  -- BEFORE the existence check below. Idempotent — UPDATE 0 rows is
  -- a fine outcome on systems that already have the space-named row
  -- (or have no contracts dept at all).
  UPDATE departments
     SET name = 'العقود والمشاريع'
   WHERE name = 'العقود_والمشاريع';

  IF NOT EXISTS (SELECT 1 FROM departments WHERE name = 'العقود والمشاريع') THEN
    -- Pick the next free numeric id ≥ 5 so we don't collide with
    -- whatever ids already live in the table. Cast handles any
    -- non-numeric ids gracefully (those rows just don't contribute).
    SELECT COALESCE(MAX(id::int), 4) INTO max_numeric_id
      FROM departments
     WHERE id ~ '^[0-9]+$';

    next_id := GREATEST(5, max_numeric_id + 1)::text;

    INSERT INTO departments (id, name, head_id, created_at)
    VALUES (next_id, 'العقود والمشاريع', NULL, now());

    RAISE NOTICE 'Inserted contracts department with id %', next_id;
  ELSE
    RAISE NOTICE 'Contracts department already exists — skipped';
  END IF;
END $$;
