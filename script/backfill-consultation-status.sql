-- =====================================================================
-- Consultations status backfill — repair commit-1-era write conflation
-- =====================================================================
-- Pre-fix, server/storage.ts createConsultation wrote the stage value
-- ("استلام", etc.) into the consultations.status column instead of the
-- separate ConsultationStatus enum. After commit 15 the insert site is
-- correct; this script repairs rows already persisted with the wrong
-- value so their status badges render correctly (anything not in
-- ('active','converted','closed') was rendering as "—").
--
-- All such rows are by definition still "active" — converted rows have
-- status='converted' set explicitly inside the convert-to-case
-- transaction, and closed rows have status='closed' set explicitly by
-- /early-close. So the safe coercion is simply: anything not already in
-- the canonical enum becomes 'active'.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run; subsequent runs match zero rows.
-- =====================================================================

UPDATE consultations
   SET status = 'active'
 WHERE status NOT IN ('active', 'converted', 'closed');
