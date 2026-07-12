-- Admin_support fine-grained task routing (Phase 1) — central mapping table.
-- Apply to BOTH dev and prod databases (they are separate per replit.md).
-- Additive, idempotent (IF NOT EXISTS): safe to re-run. Contains NO DROP.
--
-- One row per assignable admin_support task type; task_type is the PRIMARY KEY,
-- so each type maps to exactly ONE assignee (single-owner-per-type enforced by
-- the DB). assignee_user_id is NULLABLE: NULL = unassigned (the task falls to
-- the manager's unassigned group). Seeded task_type values (Phase 1):
--   'collection', 'consultation_closing', 'session_report_export'
CREATE TABLE IF NOT EXISTS admin_support_task_assignments (
  task_type        VARCHAR(50)   PRIMARY KEY,
  assignee_user_id VARCHAR(255),
  updated_at       TIMESTAMP     DEFAULT NOW()
);
