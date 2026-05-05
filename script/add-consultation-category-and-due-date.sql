-- =====================================================================
-- Consultations SLA category + expected delivery date
-- =====================================================================
-- Phase-4 (dev-feedback). Adds two columns to consultations so the
-- create endpoint can persist the user-chosen SLA category and the
-- auto-computed expectedDeliveryDate (= createdAt + SLA days):
--
--   - category               varchar(50) NOT NULL DEFAULT 'عادية'
--                            One of: سريعة (1-day SLA), عادية (3-day),
--                            طويلة (14-day). Stored as plain text so a
--                            future category addition is a value change
--                            with no DDL.
--   - expected_delivery_date timestamp NULL
--                            Computed once at insert time; nullable so
--                            historical rows (and any manual inserts
--                            that skipped the API) don't fail the NOT
--                            NULL constraint we couldn't backfill.
--
-- Existing rows are backfilled with category='عادية' and
-- expected_delivery_date = created_at + 3 days, matching the standard
-- SLA. The backfill is gated on category being NULL / empty so re-runs
-- don't overwrite a category set after this script first ran.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS category varchar(50) NOT NULL DEFAULT 'عادية';

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS expected_delivery_date timestamp;

-- Backfill: any pre-existing row that hasn't been touched since the
-- column add gets the standard SLA. We compare against '' as well as
-- NULL because some PG drivers materialise the default as an empty
-- string when the column is added on a non-empty table.
UPDATE consultations
   SET category = 'عادية'
 WHERE category IS NULL OR category = '';

UPDATE consultations
   SET expected_delivery_date = created_at + INTERVAL '3 days'
 WHERE expected_delivery_date IS NULL
   AND created_at IS NOT NULL;
