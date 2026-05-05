-- =====================================================================
-- Phase-8 — memo activity log
-- =====================================================================
-- Mirrors the consultation_activity_log table (Phase-6) for memos. One
-- row per meaningful event on a memo (created, paused, unpaused,
-- await_completion, resume_from_completion). Inserts happen server-side
-- only, in the same DB transaction as the underlying state change.
--
-- Schema notes:
--   - memo_id is FK to memos(id) ON DELETE CASCADE so the log goes away
--     with the memo.
--   - activity_type is plain varchar (not a Postgres enum) so adding a
--     new event kind is a value change, not a DDL change. Allowed
--     values are enumerated in shared/schema.ts (MemoActivityType).
--   - description carries the Arabic human-readable summary the
--     timeline renders directly.
--   - metadata is jsonb (default '{}') so each activity_type can carry
--     structured details specific to it without altering the schema.
--   - performed_by is nullable so backfill rows for legacy memos whose
--     creator id was lost still insert.
--   - performed_at defaults to NOW() so manual inserts from a SQL
--     console don't need to provide it.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS memo_activity_log (
  id              varchar(255) PRIMARY KEY,
  memo_id         varchar(255) NOT NULL
                  REFERENCES memos(id) ON DELETE CASCADE,
  activity_type   varchar(50)  NOT NULL,
  description     text         NOT NULL,
  metadata        jsonb        DEFAULT '{}'::jsonb,
  performed_by    varchar(255),
  performed_at    timestamp    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memo_activity_log_memo_idx
  ON memo_activity_log (memo_id);

CREATE INDEX IF NOT EXISTS memo_activity_log_performed_at_idx
  ON memo_activity_log (performed_at);

-- ---------------------------------------------------------------------
-- Backfill: ensure every existing memo has at least one "created"
-- activity row, using its createdAt + createdBy. Idempotent via
-- NOT EXISTS — re-running this script never inserts a duplicate.
-- ---------------------------------------------------------------------
INSERT INTO memo_activity_log (
  id, memo_id, activity_type, description, metadata, performed_by, performed_at
)
SELECT
  gen_random_uuid()::text,
  m.id,
  'created',
  'تم إنشاء المذكرة',
  '{}'::jsonb,
  m.created_by,
  COALESCE(m.created_at, NOW())
FROM memos m
WHERE NOT EXISTS (
  SELECT 1
  FROM memo_activity_log a
  WHERE a.memo_id = m.id
);
