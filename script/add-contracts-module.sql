-- =====================================================================
-- Contracts module (العقود والمشاريع) — schema bootstrap
-- =====================================================================
-- Three new tables + a partial unique index on contract_attachments to
-- enforce single-file-per-designated-slot. All `IF NOT EXISTS` guarded
-- so the script is idempotent and safe to re-run on dev + prod.
--
--   contracts                 — main row, mirror of consultations columns
--                               plus a contract_type discriminator.
--   contract_attachments      — file metadata. Designated slots
--                               (slot_key non-null) are single-file via
--                               the partial unique index below;
--                               additional attachments use slot_key=NULL
--                               and accumulate.
--   contract_activity_log     — same shape as consultation_activity_log.
--
-- Apply to BOTH dev and prod (per replit.md). Idempotent.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/add-contracts-module.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS contracts (
  id                   varchar(255) PRIMARY KEY,
  contract_number      varchar(50)  NOT NULL UNIQUE,
  title                varchar(500) NOT NULL,
  client_id            varchar(255) NOT NULL,
  contract_type        varchar(50)  NOT NULL,
  description          text NOT NULL DEFAULT '',
  current_stage        varchar(50)  NOT NULL DEFAULT 'استلام',
  status               varchar(20)  NOT NULL DEFAULT 'active',
  department_id        varchar(255) NOT NULL,
  assigned_to          varchar(255),
  internal_reviewer_id varchar(255),
  priority             varchar(50),
  priority_reason      text,
  review_notes         text DEFAULT '',
  closure_reason       varchar(50),
  closure_reason_other varchar(500),
  pause_reason         text,
  paused_by            varchar(255),
  paused_at            timestamp,
  awaiting_completion  boolean NOT NULL DEFAULT false,
  saved_stage          varchar(50),
  created_by           varchar(255) NOT NULL,
  created_at           timestamp DEFAULT now(),
  updated_at           timestamp DEFAULT now(),
  closed_at            timestamp
);

CREATE TABLE IF NOT EXISTS contract_attachments (
  id           varchar(255) PRIMARY KEY,
  contract_id  varchar(255) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  slot_key     varchar(50),
  file_name    varchar(500) NOT NULL,
  file_path    varchar(1000) NOT NULL,
  file_size    bigint NOT NULL,
  mime_type    varchar(100) NOT NULL,
  description  text,
  uploaded_by  varchar(255) NOT NULL,
  uploaded_at  timestamp DEFAULT now()
);

-- Single-file-per-slot for designated slots only. Additional attachments
-- (slot_key IS NULL) accumulate freely and are excluded from the index.
CREATE UNIQUE INDEX IF NOT EXISTS contract_attachments_slot_unique_idx
  ON contract_attachments (contract_id, slot_key)
  WHERE slot_key IS NOT NULL;

-- Helpful read indexes — list-by-contract and slot-lookup are the
-- common access paths from the UI.
CREATE INDEX IF NOT EXISTS contract_attachments_contract_idx
  ON contract_attachments (contract_id);
CREATE INDEX IF NOT EXISTS contract_attachments_slot_lookup_idx
  ON contract_attachments (contract_id, slot_key);

CREATE TABLE IF NOT EXISTS contract_activity_log (
  id            varchar(255) PRIMARY KEY,
  contract_id   varchar(255) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  activity_type varchar(50)  NOT NULL,
  description   text NOT NULL,
  metadata      jsonb DEFAULT '{}'::jsonb,
  performed_by  varchar(255),
  performed_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_activity_log_contract_idx
  ON contract_activity_log (contract_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS contracts_department_idx ON contracts (department_id);
CREATE INDEX IF NOT EXISTS contracts_assigned_idx   ON contracts (assigned_to);
CREATE INDEX IF NOT EXISTS contracts_stage_idx      ON contracts (current_stage);
CREATE INDEX IF NOT EXISTS contracts_status_idx     ON contracts (status);
