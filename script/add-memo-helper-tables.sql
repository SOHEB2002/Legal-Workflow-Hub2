-- =====================================================================
-- Phase-9 — memo review-workflow helper tables + current_stage column
-- =====================================================================
-- Adds the schema-side scaffolding for the new memo review workflow,
-- mirroring the consultations-side helpers (Phase-6). After running
-- this script, run script/backfill-memo-stages.sql to populate
-- memos.current_stage from the legacy `status` column for existing
-- rows.
--
-- What this migration does:
--   1. Adds memos.current_stage (nullable varchar(50)). Legacy `status`
--      is intentionally left intact — cancellation ("ملغاة") lives
--      there, not on current_stage. New code operates on current_stage.
--   2. Creates memo_reviews / memo_committee_decisions /
--      memo_note_outcomes — one row per peer-review decision, committee
--      decision, and take-notes outcome.
--   3. Adds indexes on the memo_id FK columns so the timeline reads
--      stay cheap as the helper tables grow.
--
-- Schema notes (mirror consultations conventions):
--   - memo_id is FK to memos(id) ON DELETE CASCADE so helper rows go
--     away with the memo (consistent with memo_activity_log).
--   - decision / outcome are plain varchar (not Postgres enums) so
--     adding a new value is a code change, not a DDL change. Allowed
--     values come from InternalReviewDecision / CommitteeDecision /
--     NoteOutcome in shared/schema.ts.
--   - notes default to empty string so server-side inserts don't need
--     to supply one when the user leaves the textarea blank.
--   - Timestamps default to NOW() so manual inserts from a SQL console
--     don't need to provide them.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. memos.current_stage column
-- ---------------------------------------------------------------------
ALTER TABLE memos
  ADD COLUMN IF NOT EXISTS current_stage varchar(50);

-- ---------------------------------------------------------------------
-- 2a. memo_reviews — peer-review decisions (مراجعة داخلية)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memo_reviews (
  id           varchar(255) PRIMARY KEY,
  memo_id      varchar(255) NOT NULL
               REFERENCES memos(id) ON DELETE CASCADE,
  reviewer_id  varchar(255) NOT NULL,
  decision     varchar(50)  NOT NULL,
  notes        text         NOT NULL DEFAULT '',
  created_at   timestamp    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memo_reviews_memo_idx
  ON memo_reviews (memo_id);

-- ---------------------------------------------------------------------
-- 2b. memo_committee_decisions — committee outcomes (لجنة المراجعة)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memo_committee_decisions (
  id           varchar(255) PRIMARY KEY,
  memo_id      varchar(255) NOT NULL
               REFERENCES memos(id) ON DELETE CASCADE,
  decision     varchar(50)  NOT NULL,
  notes        text         NOT NULL DEFAULT '',
  decided_by   varchar(255) NOT NULL,
  decided_at   timestamp    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memo_committee_decisions_memo_idx
  ON memo_committee_decisions (memo_id);

-- ---------------------------------------------------------------------
-- 2c. memo_note_outcomes — take-notes outcomes (الأخذ بالملاحظات)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memo_note_outcomes (
  id           varchar(255) PRIMARY KEY,
  memo_id      varchar(255) NOT NULL
               REFERENCES memos(id) ON DELETE CASCADE,
  outcome      varchar(20)  NOT NULL,
  notes        text         NOT NULL DEFAULT '',
  recorded_by  varchar(255) NOT NULL,
  recorded_at  timestamp    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memo_note_outcomes_memo_idx
  ON memo_note_outcomes (memo_id);
