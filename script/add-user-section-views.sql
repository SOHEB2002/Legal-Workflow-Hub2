-- User section views table
-- Tracks the last time each user opened each sidebar section
-- (cases / consultations / hearings / memos). Used to drive the
-- "new since last visit" badge counts in the sidebar.
--
-- Apply to BOTH dev and prod databases (they are separate per replit.md).
-- Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS user_section_views (
  user_id          VARCHAR(255) NOT NULL,
  section          VARCHAR(50)  NOT NULL,
  last_viewed_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, section)
);

CREATE INDEX IF NOT EXISTS user_section_views_user_idx
  ON user_section_views (user_id);
