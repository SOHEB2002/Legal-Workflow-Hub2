-- =====================================================================
-- Phase-8 — Pause + Await-Completion columns (consultations + cases + memos)
-- =====================================================================
-- Adds two orthogonal workflow state primitives to all three workflow
-- entities. Both are opt-in flags layered on top of the entity's existing
-- status/stage; neither replaces an existing column.
--
--   PAUSE       — pause_reason / paused_by / paused_at
--                 A user-visible "halt" set by branch_manager / admin_support
--                 / department_head (own dept) / assigned lawyer. While
--                 paused_at IS NOT NULL the entity is considered paused;
--                 unpause clears all three columns. Stage stays put.
--
--   AWAIT       — awaiting_completion / saved_stage
--                 An escape hatch from the current stage when the work
--                 can't continue without missing data. saved_stage holds
--                 the stage value to restore on resume. Cleared when the
--                 user clicks "تم الاستكمال".
--
-- Design notes:
--   - For CONSULTATIONS, the route layer also flips status to "paused"
--     (a new value added to ConsultationStatus). status returns to
--     "active" on unpause. For CASES and MEMOS, status is workflow-state
--     (not lifecycle), so we leave it alone — pause is detected purely
--     via paused_at IS NOT NULL. This avoids polluting CaseStatus /
--     MemoStatus enums with a value that has nothing to do with their
--     workflow semantics and breaking exhaustive switches downstream.
--   - paused_by / saved_stage are plain varchar(255)/varchar(50) without
--     FK constraints, matching the rest of this schema (e.g. created_by,
--     assigned_to on the same tables — no FK to users either).
--   - All new columns are nullable / have safe defaults, so this
--     migration leaves every existing row unchanged.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- consultations
-- ---------------------------------------------------------------------
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS pause_reason         text,
  ADD COLUMN IF NOT EXISTS paused_by            varchar(255),
  ADD COLUMN IF NOT EXISTS paused_at            timestamp,
  ADD COLUMN IF NOT EXISTS awaiting_completion  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saved_stage          varchar(50);

-- ---------------------------------------------------------------------
-- law_cases
-- ---------------------------------------------------------------------
ALTER TABLE law_cases
  ADD COLUMN IF NOT EXISTS pause_reason         text,
  ADD COLUMN IF NOT EXISTS paused_by            varchar(255),
  ADD COLUMN IF NOT EXISTS paused_at            timestamp,
  ADD COLUMN IF NOT EXISTS awaiting_completion  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saved_stage          varchar(50);

-- ---------------------------------------------------------------------
-- memos
-- ---------------------------------------------------------------------
ALTER TABLE memos
  ADD COLUMN IF NOT EXISTS pause_reason         text,
  ADD COLUMN IF NOT EXISTS paused_by            varchar(255),
  ADD COLUMN IF NOT EXISTS paused_at            timestamp,
  ADD COLUMN IF NOT EXISTS awaiting_completion  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saved_stage          varchar(50);
