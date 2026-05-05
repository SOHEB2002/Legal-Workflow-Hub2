-- =====================================================================
-- Consultations expectedDeliveryDate extension audit log
-- =====================================================================
-- Phase-5. Adds a helper table that records each forward push of a
-- consultation's expectedDeliveryDate. The dialog renders these as a
-- collapsible history list (old → new, reason, who, when). The
-- corresponding consultations.expectedDeliveryDate update happens in
-- the same DB transaction as the insert (see
-- storage.extendConsultationDelivery), so the audit row and the row
-- it audits cannot drift.
--
-- Schema notes:
--   - old_expected_delivery_date is nullable so the very first
--     extension on a row that never had a computed due date (legacy
--     data, pre-Phase-4) still records cleanly.
--   - reason is NOT NULL with default '' so the column is always
--     readable, but the route validates a non-empty reason.
--   - extended_at defaults to NOW() so manual inserts (e.g. from a
--     SQL console) don't need to provide it.
--
-- IMPORTANT: This migration does NOT drop consultations.delivery_type.
-- That column is retained for backwards compatibility — the deliveryType
-- field is marked @deprecated in shared/schema.ts but historical rows
-- and downstream readers still need to read it.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS consultation_delivery_extensions (
  id                          varchar(255) PRIMARY KEY,
  consultation_id             varchar(255) NOT NULL
                              REFERENCES consultations(id) ON DELETE CASCADE,
  old_expected_delivery_date  timestamp,
  new_expected_delivery_date  timestamp    NOT NULL,
  reason                      text         NOT NULL DEFAULT '',
  extended_by                 varchar(255) NOT NULL,
  extended_at                 timestamp    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consultation_delivery_extensions_consultation_idx
  ON consultation_delivery_extensions (consultation_id);

CREATE INDEX IF NOT EXISTS consultation_delivery_extensions_extended_at_idx
  ON consultation_delivery_extensions (extended_at);
