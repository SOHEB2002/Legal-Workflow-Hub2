-- =====================================================================
-- Batch 24 — bind a case note to a specific HEARING
-- =====================================================================
-- 🔴 THIS ONE IS A REAL MIGRATION, UNLIKE BATCH 23'S. Run it BEFORE the code
-- that declares the column reaches a database.
--
-- ⚠ ORDER IS NOT OPTIONAL — the standing rule in CLAUDE.md. Drizzle builds an
-- EXPLICIT column list from the table declaration, so the moment hearing_id is
-- declared in shared/schema.ts, EVERY read of case_notes selects it. A missing
-- column does not break "the new feature" — it breaks the notes tab entirely,
-- for every case, with a 500.
--
--   1. run this on DEV (heliumdb)
--   2. confirm the app still loads and the notes tab renders
--   3. run this on PROD (neondb)
--   4. deploy
--
-- ONE optional column. NULL is the normal state and means "not bound", so there
-- is NO backfill and no existing row changes meaning.
--
-- WHY A HEARING ID AND NOT A BOOLEAN. The owner ruled the note binds to a
-- SPECIFIC session and STAYS there after that session passes. A boolean would
-- force every reader to recompute "which hearing", and the answer would silently
-- move to the next session the moment this one was held — the opposite of the
-- ruling. So the target is stored, not derived.
--
-- WHY NOT REUSE case_notes.is_important. Checked first, per instruction, and it
-- is NOT free on two independent grounds:
--   • it is LIVE — the add-note form has a toggle that writes it, and the note
--     card renders a yellow border plus an AlertTriangle icon from it;
--   • it is a BOOLEAN, so it could not hold a hearing id even if unused.
-- is_pinned (batch 23) is likewise untouched: a note may be pinned only,
-- hearing-bound only, both, or neither. Two columns, two independent actions.
--
-- TYPE: varchar(255) matches hearings.id exactly (varchar(255) PRIMARY KEY),
-- the same way case_notes.case_id matches law_cases.id.
--
-- NO FOREIGN KEY, deliberately — the repo's commented-FK convention (FKs live
-- only on prod via apply-fk-constraints.sql and are invisible to db:push, so
-- adding one here would create the dev/prod drift that makes Republish propose a
-- DROP). A deleted hearing is handled in application code instead: the
-- DELETE /api/hearings/:id cascade nulls every binding pointing at it.
-- =====================================================================

ALTER TABLE case_notes ADD COLUMN IF NOT EXISTS hearing_id varchar(255);

-- OPTIONAL, and not required for correctness. The only query that filters on
-- this column is the one-note-per-hearing clear inside bindCaseNoteToHearing,
-- which runs once per flag action against a small table. Add it only if
-- case_notes ever grows enough for that to matter.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS case_notes_hearing_idx
--   ON case_notes (hearing_id) WHERE hearing_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- VERIFY — run on BOTH databases after the ALTER.
-- Expect exactly one row: hearing_id | character varying | 255 | YES
-- ─────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'case_notes'
  AND column_name = 'hearing_id';

-- Sanity: nothing is bound yet, so this must return 0 on a fresh apply.
SELECT COUNT(*) AS bound_notes FROM case_notes WHERE hearing_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- INVARIANT CHECK — run any time. Must always return ZERO rows.
-- "One note per hearing" is enforced by a transaction in
-- storage.bindCaseNoteToHearing (clear every other note carrying this
-- hearing_id, then set it here). This is how you confirm it is holding.
--
-- ⚠ It is per-HEARING, not per-case: two notes bound to two DIFFERENT hearings
-- of the same case is a legitimate state and will NOT appear here.
-- ─────────────────────────────────────────────────────────────────────
SELECT hearing_id, COUNT(*) AS notes_bound
FROM case_notes
WHERE hearing_id IS NOT NULL
GROUP BY hearing_id
HAVING COUNT(*) > 1;

-- ─────────────────────────────────────────────────────────────────────
-- ORPHAN CHECK — bindings pointing at a hearing that no longer exists.
-- Should be ZERO: the hearing-delete route clears them. A non-zero result
-- means a hearing was removed by some path that bypasses that route (a manual
-- DELETE, say) — harmless in the UI (nothing matches, so nothing renders), but
-- worth clearing with the UPDATE below.
-- ─────────────────────────────────────────────────────────────────────
SELECT n.id, n.case_id, n.hearing_id
FROM case_notes n
LEFT JOIN hearings h ON h.id = n.hearing_id
WHERE n.hearing_id IS NOT NULL AND h.id IS NULL;

-- UPDATE case_notes SET hearing_id = NULL
-- WHERE hearing_id IS NOT NULL
--   AND hearing_id NOT IN (SELECT id FROM hearings);
