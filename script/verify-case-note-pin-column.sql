-- =====================================================================
-- Batch 23 — the pinned case note. VERIFICATION, not a migration.
-- =====================================================================
-- 🔴 READ THIS BEFORE LOOKING FOR A PENDING ALTER: THERE IS NONE.
--
-- The pinned note is stored in `case_notes.is_pinned`, a column that ALREADY
-- EXISTS on both databases. It was declared in shared/schema.ts on 2026-02-14
-- (commit 89b8277) and has been live ever since — this batch adds behaviour on
-- top of an existing column, it does not add a column.
--
-- WHY THAT IS CERTAIN WITHOUT QUERYING: drizzle builds an EXPLICIT column list
-- from the table declaration, so `storage.getCaseNotes` — which does
-- `db.select().from(caseNotes)` and then `ORDER BY is_pinned DESC` — names
-- is_pinned in the SQL it emits on every single notes read. If the column were
-- missing on a database, the notes tab would 500 there, for every case, today.
-- It does not, on either.
--
-- This file exists because CLAUDE.md's own rule is to re-verify against
-- information_schema rather than trust a note in a file. Run the SELECT.
--
-- Run on BOTH: dev (heliumdb) and prod (neondb).
-- =====================================================================

-- 1) VERIFY. Expect exactly one row: is_pinned | boolean | YES | false
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'case_notes'
  AND column_name = 'is_pinned';

-- 2) OPTIONAL BELT-AND-BRACES. Idempotent, and a NO-OP on both databases as of
--    2026-08-24. Included only so the owner has the exact statement on hand if
--    the SELECT above ever comes back empty on some future database.
--    Harmless to run; it cannot alter an existing column.
ALTER TABLE case_notes ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

-- 3) OPTIONAL, READ-ONLY — how much legacy multi-pin data exists.
--    The notes tab has carried an UNGATED pin toggle with NO uniqueness rule
--    since 2026-02-14, so a case may hold several flagged notes. Batch 23 needs
--    NO backfill for this: the read picks the newest flagged note (the shared
--    pickPinnedCaseNote), so such a case already renders exactly one, and the
--    first use of the new pin action clears the others permanently.
--    This is here to size the situation, not to fix it.
SELECT case_id, COUNT(*) AS pinned_count
FROM case_notes
WHERE is_pinned = true
GROUP BY case_id
HAVING COUNT(*) > 1
ORDER BY pinned_count DESC;
