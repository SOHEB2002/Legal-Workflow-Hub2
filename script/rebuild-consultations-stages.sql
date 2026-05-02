-- =====================================================================
-- Consultations Module Rebuild — destructive migration
-- =====================================================================
-- Per consultations-rebuild-spec.md, Phase 3 commit 1.
-- Apply to BOTH dev and prod (they are separate per replit.md).
--
-- DESTRUCTIVE: clears all existing consultations and their child rows.
-- Authorized by spec Hard Fact #1: no production data exists for
-- consultations. Existing rows are test data.
--
-- Wrapped in BEGIN/COMMIT — atomic; partial failure leaves DB unchanged.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Pre-clean by-convention references to consultations.
--    The Drizzle schema declares no references() calls so DB-level FKs
--    likely don't exist, but cleaning these first is safe in either
--    case and protects future runs if FKs get added.
-- ---------------------------------------------------------------------

-- Field tasks attached to a consultation
DELETE FROM field_tasks   WHERE consultation_id IS NOT NULL;

-- Polymorphic attachments on a consultation
DELETE FROM attachments   WHERE entity_type = 'consultation';

-- Polymorphic notifications related to a consultation
DELETE FROM notifications WHERE related_type = 'consultation';

-- ---------------------------------------------------------------------
-- 2. Clear consultations themselves.
-- ---------------------------------------------------------------------

DELETE FROM consultations;

-- ---------------------------------------------------------------------
-- 3. Restructure consultations.
--    - Rename existing `status` column to `current_stage`. Keeps the
--      varchar(50) length and adds default 'استلام'.
--    - Add a fresh `status` column for active|converted|closed.
-- ---------------------------------------------------------------------

ALTER TABLE consultations RENAME COLUMN status TO current_stage;
ALTER TABLE consultations ALTER COLUMN current_stage SET DEFAULT 'استلام';
ALTER TABLE consultations ALTER COLUMN current_stage SET NOT NULL;

ALTER TABLE consultations
  ADD COLUMN status varchar(20) NOT NULL DEFAULT 'active';

-- ---------------------------------------------------------------------
-- 4. Add reverse FK on cases (convert-to-case lineage).
--    Nullable. ON DELETE SET NULL keeps the case if its source
--    consultation is ever deleted.
-- ---------------------------------------------------------------------

ALTER TABLE law_cases
  ADD COLUMN IF NOT EXISTS converted_from_consultation_id varchar(255) NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS — wrap in DO block for idempotency.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'law_cases_converted_from_consultation_id_fkey'
  ) THEN
    ALTER TABLE law_cases
      ADD CONSTRAINT law_cases_converted_from_consultation_id_fkey
      FOREIGN KEY (converted_from_consultation_id)
      REFERENCES consultations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. Helper tables for the rebuilt workflow.
--    Each has FK with ON DELETE CASCADE.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consultation_studies (
  id              varchar(255) PRIMARY KEY,
  consultation_id varchar(255) NOT NULL
                  REFERENCES consultations(id) ON DELETE CASCADE,
  notes           text         NOT NULL DEFAULT '',
  created_by      varchar(255) NOT NULL,
  created_at      timestamp    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consultation_studies_consultation_idx
  ON consultation_studies (consultation_id);

CREATE TABLE IF NOT EXISTS consultation_drafts (
  id              varchar(255) PRIMARY KEY,
  consultation_id varchar(255) NOT NULL
                  REFERENCES consultations(id) ON DELETE CASCADE,
  content         text         NOT NULL DEFAULT '',
  created_by      varchar(255) NOT NULL,
  created_at      timestamp    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consultation_drafts_consultation_idx
  ON consultation_drafts (consultation_id);

CREATE TABLE IF NOT EXISTS consultation_reviews (
  id              varchar(255) PRIMARY KEY,
  consultation_id varchar(255) NOT NULL
                  REFERENCES consultations(id) ON DELETE CASCADE,
  reviewer_id     varchar(255) NOT NULL,
  decision        varchar(50)  NOT NULL,  -- تم | يوجد_ملاحظات | تم_إعادة_التقديم
  notes           text         NOT NULL DEFAULT '',
  created_at      timestamp    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consultation_reviews_consultation_idx
  ON consultation_reviews (consultation_id);

CREATE TABLE IF NOT EXISTS consultation_committee_decisions (
  id              varchar(255) PRIMARY KEY,
  consultation_id varchar(255) NOT NULL
                  REFERENCES consultations(id) ON DELETE CASCADE,
  decision        varchar(50)  NOT NULL,  -- اعتماد | يوجد_ملاحظات
  notes           text         NOT NULL DEFAULT '',
  decided_by      varchar(255) NOT NULL,
  decided_at      timestamp    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consultation_committee_decisions_consultation_idx
  ON consultation_committee_decisions (consultation_id);

CREATE TABLE IF NOT EXISTS consultation_note_outcomes (
  id              varchar(255) PRIMARY KEY,
  consultation_id varchar(255) NOT NULL
                  REFERENCES consultations(id) ON DELETE CASCADE,
  outcome         varchar(20)  NOT NULL,  -- تم | لم_يتم | جزئياً
  notes           text         NOT NULL DEFAULT '',
  recorded_by     varchar(255) NOT NULL,
  recorded_at     timestamp    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consultation_note_outcomes_consultation_idx
  ON consultation_note_outcomes (consultation_id);

COMMIT;
