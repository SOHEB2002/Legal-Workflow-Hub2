-- =====================================================================
-- Consultations early-close support
-- =====================================================================
-- Per consultations-rebuild-spec.md §3.2.2 (POST /early-close —
-- "match the cases early-close pattern (4 reasons + 'other' with
-- custom text)"). Adds two nullable columns to consultations so the
-- early-close endpoint can persist the chosen reason and (optionally)
-- a free-text other-reason.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS closure_reason       varchar(50);

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS closure_reason_other varchar(500);
