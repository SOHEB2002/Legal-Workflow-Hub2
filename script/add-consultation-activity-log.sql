-- =====================================================================
-- Consultation activity log (Phase-6)
-- =====================================================================
-- Mirrors the case_activity_log pattern from the cases module. One row
-- per meaningful event on a consultation. Inserts happen server-side
-- only, in the SAME DB transaction as the underlying state change
-- (see consultation workflow handlers in server/routes.ts +
-- server/storage.ts) so the log can never drift from the consultation
-- it tracks.
--
-- Schema notes:
--   - consultation_id is FK to consultations(id) ON DELETE CASCADE so
--     the log goes away with the consultation.
--   - activity_type is plain varchar (not a Postgres enum) so adding a
--     new event kind is a value change, not a DDL change. Allowed
--     values are enumerated in shared/schema.ts (ConsultationActivityType).
--   - description carries the Arabic human-readable summary the
--     timeline renders directly.
--   - metadata is jsonb (default '{}') so each activity_type can carry
--     structured details specific to it without altering the schema.
--   - performed_by is nullable because backfill rows for legacy
--     consultations whose creator id was lost still need to insert.
--   - performed_at defaults to NOW() so manual inserts from a SQL
--     console don't need to provide it.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS consultation_activity_log (
  id              varchar(255) PRIMARY KEY,
  consultation_id varchar(255) NOT NULL
                  REFERENCES consultations(id) ON DELETE CASCADE,
  activity_type   varchar(50)  NOT NULL,
  description     text         NOT NULL,
  metadata        jsonb        DEFAULT '{}'::jsonb,
  performed_by    varchar(255),
  performed_at    timestamp    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consultation_activity_log_consultation_idx
  ON consultation_activity_log (consultation_id);

CREATE INDEX IF NOT EXISTS consultation_activity_log_performed_at_idx
  ON consultation_activity_log (performed_at);

-- ---------------------------------------------------------------------
-- Backfill: ensure every existing consultation has at least one
-- "created" activity row, using its createdAt + createdBy. Idempotent
-- via NOT EXISTS — re-running this script never inserts a duplicate.
--
-- We use gen_random_uuid()::text for the new ids so the insert works
-- on a fresh database without depending on application-level id
-- generation. The pgcrypto extension is enabled by default on Replit
-- Postgres; if it isn't, run: CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- ---------------------------------------------------------------------
INSERT INTO consultation_activity_log (
  id, consultation_id, activity_type, description, metadata, performed_by, performed_at
)
SELECT
  gen_random_uuid()::text,
  c.id,
  'created',
  'تم إنشاء الاستشارة',
  '{}'::jsonb,
  c.created_by,
  COALESCE(c.created_at, NOW())
FROM consultations c
WHERE NOT EXISTS (
  SELECT 1
  FROM consultation_activity_log a
  WHERE a.consultation_id = c.id
);
