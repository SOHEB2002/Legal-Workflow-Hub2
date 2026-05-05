-- =====================================================================
-- Phase-9.2 — memos.cancellation_reason
-- =====================================================================
-- Adds the reason captured at cancellation time. The "لا يحتاج مذكرة"
-- button on the memos page now opens an AlertDialog requiring a reason
-- before it cancels the memo; the dedicated POST /api/memos/:id/cancel
-- endpoint persists the reason here AND writes a memo_activity_log
-- entry (activity_type='cancelled') with metadata.reason so the
-- timeline surfaces who/when alongside the reason.
--
--   - text, nullable: legacy memos cancelled before this column existed
--     surface as null (the FE banner falls back to "no reason" — no
--     backfill possible since the data wasn't captured).
--   - No FK / index needed (read only via the row itself, not by joins).
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

ALTER TABLE memos
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
