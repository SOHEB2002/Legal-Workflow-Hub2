-- =====================================================================
-- Rename READY stage: جاهزة_للتسليم → جاهزة_للإرسال
-- =====================================================================
-- Aligns the stored stage value with the new naming used in
-- ConsultationStage.READY and ContractStage.READY (shared/schema.ts).
-- The display label changes too (جاهزة للتسليم → جاهزة للإرسال) but
-- that's a TypeScript-side change only — the DB stores the underscored
-- value.
--
-- Scope:
--   - consultations.current_stage
--   - consultations.saved_stage
--   - contracts.current_stage
--   - contracts.saved_stage
--
-- Activity-log tables (consultation_activity_log, contract_activity_log)
-- are NOT touched. Their description / metadata columns hold freeform
-- text and historical snapshots — leaving them as written preserves
-- "what the system said at the time."
--
-- NOTE: This is a destructive UPDATE (modifies existing rows). The
-- additive-only rule in replit.md is being explicitly overridden for
-- this rename per direct authorization — see PR/commit body.
--
-- Apply to BOTH dev and prod (they are separate per replit.md).
-- Wrapped in BEGIN/COMMIT so a partial failure leaves the DB unchanged.
-- Idempotent — safe to re-run; the UPDATE will simply touch 0 rows
-- once all old values have been migrated.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/rename-ready-stage-to-send.sql
-- =====================================================================

BEGIN;

UPDATE consultations
SET    current_stage = 'جاهزة_للإرسال'
WHERE  current_stage = 'جاهزة_للتسليم';

UPDATE consultations
SET    saved_stage = 'جاهزة_للإرسال'
WHERE  saved_stage = 'جاهزة_للتسليم';

UPDATE contracts
SET    current_stage = 'جاهزة_للإرسال'
WHERE  current_stage = 'جاهزة_للتسليم';

UPDATE contracts
SET    saved_stage = 'جاهزة_للإرسال'
WHERE  saved_stage = 'جاهزة_للتسليم';

COMMIT;

-- Verification (run after commit to confirm zero rows left on old value):
--   SELECT 'consultations.current_stage' AS col, COUNT(*) FROM consultations WHERE current_stage = 'جاهزة_للتسليم'
--   UNION ALL
--   SELECT 'consultations.saved_stage',          COUNT(*) FROM consultations WHERE saved_stage   = 'جاهزة_للتسليم'
--   UNION ALL
--   SELECT 'contracts.current_stage',            COUNT(*) FROM contracts     WHERE current_stage = 'جاهزة_للتسليم'
--   UNION ALL
--   SELECT 'contracts.saved_stage',              COUNT(*) FROM contracts     WHERE saved_stage   = 'جاهزة_للتسليم';
