-- =====================================================================
-- Committee referral form fields on consultations
-- =====================================================================
-- Adds the three columns the "نموذج الإحالة للجنة المراجعة" needs to
-- render. All three are nullable so existing rows surface as
-- "not set" without a backfill.
--
--   internal_reviewer_id  varchar(255)  — the المراجع picked by
--                                         department_head / admin_support
--                                         / branch_manager. Mirrors
--                                         lawCases.internal_reviewer_id;
--                                         no FK constraint to match the
--                                         rest of this schema (assigned_to,
--                                         created_by also reference users
--                                         without an FK).
--
--   priority              varchar(50)   — الأولوية: عاجل / عالي /
--                                         متوسط / منخفض. NULL means the
--                                         committee form hasn't been
--                                         filled in yet. Editable by
--                                         anyone who can edit the
--                                         consultation.
--
--   priority_reason       text          — سبب الأولوية: optional free-text
--                                         justification behind the chosen
--                                         level. Cleared automatically
--                                         when priority is cleared by the
--                                         UI / PATCH layer.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-consultation-committee-fields.sql
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'consultations' AND column_name = 'internal_reviewer_id'
  ) THEN
    ALTER TABLE consultations
      ADD COLUMN internal_reviewer_id varchar(255);
    RAISE NOTICE 'consultations.internal_reviewer_id added';
  ELSE
    RAISE NOTICE 'consultations.internal_reviewer_id already exists — skipped';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'consultations' AND column_name = 'priority'
  ) THEN
    ALTER TABLE consultations
      ADD COLUMN priority varchar(50);
    RAISE NOTICE 'consultations.priority added';
  ELSE
    RAISE NOTICE 'consultations.priority already exists — skipped';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'consultations' AND column_name = 'priority_reason'
  ) THEN
    ALTER TABLE consultations
      ADD COLUMN priority_reason text;
    RAISE NOTICE 'consultations.priority_reason added';
  ELSE
    RAISE NOTICE 'consultations.priority_reason already exists — skipped';
  END IF;
END $$;
