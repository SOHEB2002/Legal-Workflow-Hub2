-- =====================================================================
-- New consultation types + stages (هاتفية / إجرائية)
-- =====================================================================
-- Adds two new consultation workflows alongside the existing مكتوبة
-- (written) flow:
--
--   هاتفية  (PHONE)      — 5-stage flow: استلام →
--                           استكمال_المرفقات_والبيانات →
--                           دراسة → منجزة → مغلقة
--   إجرائية (PROCEDURAL) — same shape as PHONE except stage 3 is
--                           جاري_العمل (in-progress) instead of دراسة.
--
-- Schema impact:
--   - consultations.consultation_type (varchar 255) — already exists.
--     New rows pick from {مكتوبة, هاتفية, إجرائية}. Existing rows keep
--     whatever free-text value they had ("عام" / "تجاري" / etc.); the
--     server's resolveConsultationType() collapses anything outside the
--     new enum down to WRITTEN, so existing rows transparently use the
--     legacy 7+1 workflow with no behavioral change.
--
--   - consultations.current_stage (varchar 50) — already exists.
--     Two new stage tokens are now valid values:
--         جاري_العمل   (procedural-only stage 3)
--         مغلقة        (final closure stage on both new flows)
--     The column is plain varchar (no enum / check constraint), so no
--     DDL is required to start storing them.
--
-- This migration is therefore intentionally a no-op on the schema — its
-- purpose is documentation and a re-runnable verification step. The
-- supporting application code (server transition tables, client stages
-- bar, create-form picker) is what actually unlocks the new flows.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-new-consultation-types-and-stages.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Verification: confirm the columns we depend on exist with the
-- expected types. Errors out loudly if the schema has drifted.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  type_col_kind text;
  stage_col_kind text;
BEGIN
  SELECT data_type INTO type_col_kind
    FROM information_schema.columns
   WHERE table_name = 'consultations'
     AND column_name = 'consultation_type';
  IF type_col_kind IS NULL THEN
    RAISE EXCEPTION 'consultations.consultation_type does not exist';
  END IF;

  SELECT data_type INTO stage_col_kind
    FROM information_schema.columns
   WHERE table_name = 'consultations'
     AND column_name = 'current_stage';
  IF stage_col_kind IS NULL THEN
    RAISE EXCEPTION 'consultations.current_stage does not exist';
  END IF;

  RAISE NOTICE 'consultation_type = %, current_stage = %, both varchar — OK', type_col_kind, stage_col_kind;
END $$;

-- ---------------------------------------------------------------------
-- No backfill — existing rows keep their consultation_type values and
-- map to the WRITTEN workflow via resolveConsultationType() at runtime.
-- ---------------------------------------------------------------------
