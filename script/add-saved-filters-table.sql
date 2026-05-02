-- Saved Filters table
-- Apply to BOTH dev and prod databases (they are separate per replit.md).
-- Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS saved_filters (
  id            VARCHAR(255)  PRIMARY KEY,
  user_id       VARCHAR(255)  NOT NULL,
  name          VARCHAR(200)  NOT NULL,
  filter_config JSONB         NOT NULL,
  page_type     VARCHAR(50)   NOT NULL DEFAULT 'cases',
  created_at    TIMESTAMP     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_filters_user_page_idx
  ON saved_filters (user_id, page_type);
