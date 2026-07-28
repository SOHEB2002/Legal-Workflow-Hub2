-- =====================================================================
-- Pause auto-lift date — pause_until on all four pausable entities
-- =====================================================================
-- Adds ONE optional column to each of the four entities that already carry
-- the Phase-8 pause primitive (see add-workflow-pause-and-await-completion.sql,
-- which added pause_reason / paused_by / paused_at; contracts got theirs in
-- add-contracts-module.sql).
--
--   pause_until — OPTIONAL "YYYY-MM-DD" date on which the pause lifts by
--                 itself. NULL means an open-ended pause, which is both the
--                 default and the pre-feature behaviour, so EVERY existing
--                 paused row keeps behaving exactly as it does today.
--
-- Design notes:
--   - varchar(50), not date/timestamp. This is the struck_off_reopen_deadline
--     idiom: the scheduler (checkExpiredPauses) compares it as a plain
--     lexicographic string against today's "YYYY-MM-DD", which is correct for
--     zero-padded ISO dates and keeps the column clear of the drizzle
--     date-mode conversion that silently broke auto-archive (Phase-4 S3).
--   - Nullable with no default → additive, leaves every existing row unchanged.
--   - Cleared by all four storage.unpause* methods, so a manual unpause can
--     never leak a stale date into the next pause.
--
-- ⚠ ORDER IS NOT OPTIONAL. Drizzle builds an explicit column list from the
--   table declaration in shared/schema.ts, so from the moment pause_until is
--   declared EVERY read of these four tables selects it. Run this on dev →
--   confirm the app loads → run it on prod → deploy. db:push was NOT run.
--
-- Apply to BOTH dev and prod (per replit.md / CLAUDE.md).
-- Idempotent — safe to re-run.
-- =====================================================================

ALTER TABLE law_cases     ADD COLUMN IF NOT EXISTS pause_until varchar(50);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS pause_until varchar(50);
ALTER TABLE contracts     ADD COLUMN IF NOT EXISTS pause_until varchar(50);
ALTER TABLE memos         ADD COLUMN IF NOT EXISTS pause_until varchar(50);

-- Verification — expect 4 rows, all varchar(50), all is_nullable = YES:
--   SELECT table_name, data_type, character_maximum_length, is_nullable
--     FROM information_schema.columns
--    WHERE column_name = 'pause_until'
--    ORDER BY table_name;
