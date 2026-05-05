-- =====================================================================
-- Phase-9.1 — memos.internal_reviewer_id
-- =====================================================================
-- Adds the designated peer-reviewer column to the memos table, mirroring
-- law_cases.internal_reviewer_id. Set when the assigned lawyer advances
-- a memo from "تحرير" → "مراجعة_داخلية" (the FE dialog forces a pick;
-- the server validates active + same-department + not admin_support /
-- branch_manager / self). The /internal-review endpoint locks the
-- decision (اعتماد / يوجد ملاحظات) to (this user) OR branch_manager.
--
-- Same shape as law_cases.internal_reviewer_id:
--   - varchar(255) so the value can be a UUID-string user id;
--   - nullable, since legacy memos and pre-INTERNAL_REVIEW rows have
--     no reviewer;
--   - no FK constraint to users(id) — matches the cases-side convention
--     and avoids cascade-delete surprises if a user is ever soft-removed.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

ALTER TABLE memos
  ADD COLUMN IF NOT EXISTS internal_reviewer_id varchar(255);
