-- =====================================================================
-- Case judgment-deed (صك) + hearing-minutes (ضبط الجلسة) attachment tables
-- =====================================================================
-- Two new tables mirroring contract_attachments (see
-- script/add-contracts-module.sql), which is the app's only real
-- file-upload mechanism. The row stores the Replit Object Storage KEY in
-- file_path — never the bytes, never a URL.
--
--   case_attachments     — exactly ONE صك per case.
--   hearing_attachments  — exactly ONE ضبط per hearing.
--
-- ONE FILE PER PARENT is enforced by a PLAIN unique index on the parent id.
-- contract_attachments needs a PARTIAL unique index (…WHERE slot_key IS NOT
-- NULL) only because it holds two kinds of row — designated slots
-- (single-file) and free "additional" attachments (slot_key NULL, unbounded).
-- Neither table here has slots or free attachments, so the partial predicate
-- would have nothing to exclude and a plain UNIQUE is correct and stricter.
-- That unique b-tree also IS the lookup index, so no separate read index is
-- needed (contract_attachments needs two only because its unique index is
-- partial and two-column).
--
-- ⚠ APPLY TO BOTH DEV (heliumdb) AND PROD (neondb) BEFORE the code that
-- declares these tables serves traffic against that DB. Drizzle builds an
-- explicit column list from the table declaration, so a missing table or a
-- mismatched column name breaks EVERY read that touches it — not just the new
-- feature. Order: dev → confirm the app loads → prod → deploy.
--
-- FKs are created INLINE and named EXPLICITLY so the constraint name matches
-- the drizzle declaration in shared/schema.ts byte-for-byte. These are new,
-- EMPTY tables, so the constraint validates instantly — this is the
-- contract_attachments situation, not the Batch-M retrofit situation that
-- required NOT VALID + VALIDATE (see the law_cases note in shared/schema.ts).
--
-- Idempotent (IF NOT EXISTS throughout) and safe to re-run.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-attachment-tables.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS case_attachments (
  id           varchar(255) PRIMARY KEY,
  case_id      varchar(255) NOT NULL
                 CONSTRAINT case_attachments_case_id_fkey
                 REFERENCES law_cases(id) ON DELETE CASCADE,
  file_name    varchar(500) NOT NULL,
  file_path    varchar(1000) NOT NULL,
  file_size    bigint NOT NULL,
  mime_type    varchar(100) NOT NULL,
  uploaded_by  varchar(255) NOT NULL,
  uploaded_at  timestamp DEFAULT now()
);

-- Exactly one judgment deed per case.
CREATE UNIQUE INDEX IF NOT EXISTS case_attachments_case_unique_idx
  ON case_attachments (case_id);

CREATE TABLE IF NOT EXISTS hearing_attachments (
  id           varchar(255) PRIMARY KEY,
  hearing_id   varchar(255) NOT NULL
                 CONSTRAINT hearing_attachments_hearing_id_fkey
                 REFERENCES hearings(id) ON DELETE CASCADE,
  file_name    varchar(500) NOT NULL,
  file_path    varchar(1000) NOT NULL,
  file_size    bigint NOT NULL,
  mime_type    varchar(100) NOT NULL,
  uploaded_by  varchar(255) NOT NULL,
  uploaded_at  timestamp DEFAULT now()
);

-- Exactly one ضبط per hearing.
CREATE UNIQUE INDEX IF NOT EXISTS hearing_attachments_hearing_unique_idx
  ON hearing_attachments (hearing_id);

-- =====================================================================
-- Verification — run after applying, on EACH database. Expect 16 rows
-- (8 columns per table) with the types exactly as declared above, and
-- 2 unique indexes + 2 FK constraints.
-- =====================================================================
-- SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('case_attachments','hearing_attachments')
-- ORDER BY table_name, ordinal_position;
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename IN ('case_attachments','hearing_attachments');
--
-- SELECT conname, contype, convalidated FROM pg_constraint
-- WHERE conrelid IN ('case_attachments'::regclass, 'hearing_attachments'::regclass);
