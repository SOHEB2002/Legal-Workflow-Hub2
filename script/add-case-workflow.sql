-- MANUAL ONLY. Apply to development and production before deploying code.
-- No data changes or backfill. Safe to repeat.
BEGIN;
ALTER TABLE public.law_cases
  ADD COLUMN IF NOT EXISTS case_workflow varchar(32);
ALTER TABLE public.law_cases
  ALTER COLUMN department_id DROP NOT NULL;
COMMIT;

-- Verify manually after applying:
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'law_cases'
  AND column_name IN ('department_id', 'case_workflow');
