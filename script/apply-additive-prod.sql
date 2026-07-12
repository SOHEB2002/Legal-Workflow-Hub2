-- ============================================================================
-- apply-additive-prod.sql — IDEMPOTENT, ADDITIVE-ONLY schema sync.
--
-- Applies exactly the 16 columns + 2 tables this branch (feature/consultations-
-- audit) added that PRODUCTION (neondb) may still lack — the same additive
-- changes made on dev this session. Column names/types taken VERBATIM from
-- shared/schema.ts.
--
-- SAFE BY CONSTRUCTION: every statement is ADD COLUMN IF NOT EXISTS /
-- CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / a guarded ADD
-- CONSTRAINT. It contains NO DROP, NO ALTER TYPE, NO SET NOT NULL on an existing
-- column, NO DELETE, NO data change. Re-runnable; a no-op on any DB that already
-- has these (so running it against dev/heliumdb changes nothing).
--
-- One transaction (ON_ERROR_STOP + BEGIN/COMMIT → all-or-nothing).
--
-- RECOMMENDED ORDER:
--   1. DRY-RUN on dev (guaranteed no-op — proves the SQL parses/runs cleanly):
--        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f script/apply-additive-prod.sql
--   2. Then PRODUCTION, with the PROD (neondb) connection string:
--        psql "<PROD_NEONDB_URL>" -v ON_ERROR_STOP=1 -f script/apply-additive-prod.sql
--
-- This does NOT manage foreign keys on EXISTING tables — those stay owned by
-- script/apply-fk-constraints.sql (run that on BOTH dev + prod separately so a
-- future Republish diff shows ZERO DROP). The only FK here is for the brand-new
-- general_task_events table (safe: empty table, no orphans possible).
-- ============================================================================

BEGIN;

-- ---- users -----------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS task_specialties jsonb;

-- ---- law_cases -------------------------------------------------------------
-- agency_issuance_requested is NOT NULL but carries DEFAULT false → existing
-- rows backfill to false automatically (safe on a populated table).
ALTER TABLE law_cases
  ADD COLUMN IF NOT EXISTS data_completion_last_ack_at timestamp,
  ADD COLUMN IF NOT EXISTS agency_issuance_requested boolean NOT NULL DEFAULT false;

-- ---- consultations ---------------------------------------------------------
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS data_completion_last_ack_at timestamp;

-- ---- contracts -------------------------------------------------------------
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS data_completion_last_ack_at timestamp;

-- ---- hearings --------------------------------------------------------------
ALTER TABLE hearings
  ADD COLUMN IF NOT EXISTS session_report_exported boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agency_verification_ack_at timestamp,
  ADD COLUMN IF NOT EXISTS agency_verification_answer varchar(20);

-- ---- field_tasks -----------------------------------------------------------
ALTER TABLE field_tasks
  ADD COLUMN IF NOT EXISTS contract_id varchar(255),
  ADD COLUMN IF NOT EXISTS client_id varchar(255),
  ADD COLUMN IF NOT EXISTS review_note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS original_requester_id varchar(255),
  ADD COLUMN IF NOT EXISTS routed_department_id varchar(255),
  ADD COLUMN IF NOT EXISTS worker_id varchar(255);

-- ---- memos -----------------------------------------------------------------
ALTER TABLE memos
  ADD COLUMN IF NOT EXISTS data_completion_last_ack_at timestamp;

-- ---- delegations_table -----------------------------------------------------
ALTER TABLE delegations_table
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ---- NEW TABLE: general_task_events (general-task «الأخذ والعطا» thread) ----
CREATE TABLE IF NOT EXISTS general_task_events (
  id            varchar(255) PRIMARY KEY,
  field_task_id varchar(255) NOT NULL,
  actor_id      varchar(255),
  actor_name    varchar(255),
  event_type    varchar(50) NOT NULL,
  body          text,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS general_task_events_task_idx       ON general_task_events (field_task_id);
CREATE INDEX IF NOT EXISTS general_task_events_created_at_idx ON general_task_events (created_at);
-- FK → field_tasks(id) ON DELETE CASCADE. Guarded so it is added once, whether
-- the table was just created here or already existed without it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'general_task_events_field_task_id_fkey') THEN
    ALTER TABLE general_task_events
      ADD CONSTRAINT general_task_events_field_task_id_fkey
      FOREIGN KEY (field_task_id) REFERENCES field_tasks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---- NEW TABLE: admin_support_task_assignments (manager's assignee mappings) -
-- Created EMPTY; the manager sets the assignments through the settings screen.
CREATE TABLE IF NOT EXISTS admin_support_task_assignments (
  task_type        varchar(50) PRIMARY KEY,
  assignee_user_id varchar(255),
  updated_at       timestamp DEFAULT now()
);

COMMIT;

-- ============================================================================
-- Verify (optional) — expect all 16 rows + both regclass values non-null:
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE (table_name, column_name) IN (
--      ('users','task_specialties'),
--      ('law_cases','data_completion_last_ack_at'), ('law_cases','agency_issuance_requested'),
--      ('consultations','data_completion_last_ack_at'),
--      ('contracts','data_completion_last_ack_at'),
--      ('hearings','session_report_exported'), ('hearings','agency_verification_ack_at'), ('hearings','agency_verification_answer'),
--      ('field_tasks','contract_id'), ('field_tasks','client_id'), ('field_tasks','review_note'),
--      ('field_tasks','original_requester_id'), ('field_tasks','routed_department_id'), ('field_tasks','worker_id'),
--      ('memos','data_completion_last_ack_at'),
--      ('delegations_table','rejection_reason'))
--    ORDER BY table_name, column_name;
--   SELECT to_regclass('public.general_task_events') AS gte,
--          to_regclass('public.admin_support_task_assignments') AS asta;
-- ============================================================================
