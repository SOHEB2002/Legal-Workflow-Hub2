-- =====================================================================
-- سجل الأحكام — BACKFILL. Run AFTER script/add-judgment-tables.sql.
-- =====================================================================
-- 🔴 RUN script/measure-judgment-backfill.sql FIRST and read its STOP CHECKS.
-- Queries 2, 3, 5 and 6 must all come back 0. Query 4's number is what you are
-- agreeing to: those are the cases whose degree is inferred from current_stage
-- because they have no stage_history.
--
-- TWO STEPS:
--   STEP 1 — one case_judgments row per case that reached a judgment stage.
--   STEP 2 — COPY every case_attachments row into judgment_attachments against
--            that case's judgment #1.
--
-- 🔴 STEP 2 COPIES, IT NEVER MOVES. case_attachments keeps every row and every
-- existing surface keeps working, so rolling this feature back is a code revert
-- with no data to unwind. The consequence is that after the copy ONE
-- Object-Storage blob is referenced by TWO rows — the file_path is copied
-- verbatim, so both point at the same "cases/<caseId>/<uuid>" key. Whichever
-- later batch first wires up a DELETE on judgment_attachments must not delete the
-- blob, or the case_attachments surface renders as missing.
--
-- Both steps are IDEMPOTENT (each skips what it has already inserted) and both
-- are wrapped in ONE transaction: either the whole backfill lands or none of it
-- does, so a failure never leaves judgments without their deeds.
--
-- gen_random_uuid() is core Postgres since 13 (no pgcrypto needed) and matches
-- the randomUUID() the app writes for these ids. If a database predates 13,
-- swap it for md5(random()::text || clock_timestamp()::text)::varchar.
--
-- Apply to BOTH dev (heliumdb) and prod (neondb).
--
-- Run with:
--   psql "$DATABASE_URL" -f script/backfill-judgments.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1 — one judgment row per case that reached a judgment stage.
-- ---------------------------------------------------------------------
-- POPULATION: the SQL twin of caseReachedJudgmentStage() — current_stage OR
-- stage_history contains any of the three judgment stages. A POSITIVE test, so
-- settlement / strike-off / no-response closures cannot be captured.
--
-- 🔴 THE DEGREE IS DERIVED FROM stage_history, NEVER FROM current_stage. A case
-- at محكوم_حكم_نهائي may have arrived from منظورة (a ruling the lawyer marked NOT
-- objectionable, which goes straight to final in one stage write) OR from
-- منظورة_استئناف. Only the history separates them.
--
-- THE RULE — an APPEAL ruling exists only when the case both ENTERED
-- منظورة_استئناف and LEFT it for محكوم_حكم_نهائي, the single edge out of the
-- appeal stage. Testing "reached منظورة_استئناف" ALONE would be wrong: a case
-- still SITTING at منظورة_استئناف has an appeal pending and only its
-- FIRST-INSTANCE ruling on record.
--
-- The rule reads the stage SET rather than their order, which is exact only
-- while منظورة_استئناف has no path back to منظورة. It has none in
-- ALLOWED_CASE_TRANSITIONS today (outbound: محكوم_حكم_نهائي and مشطوبة only), and
-- measure query 5 verifies no reopened case has manufactured one.
INSERT INTO case_judgments (
  id, case_id, hearing_id, sequence, degree, outcome, is_final, opens_window,
  deed_received_date, objection_window_days, objection_deadline,
  superseded_at, superseded_by_judgment_id, recorded_by, created_at, updated_at
)
SELECT
  gen_random_uuid()::varchar,
  p.id,
  p.hearing_id,
  1,
  p.degree,
  -- لصالحنا | ضدنا | جزئي, straight from the hearing. NULL when no judgment
  -- hearing can be located — the ruling is known to exist (the case reached a
  -- judgment stage) but its side was never recorded.
  p.judgment_side,
  -- Finality: the hearing's own derived answer when there is one. Otherwise an
  -- appeal ruling is final by nature, and a case resting at محكوم_حكم_نهائي is
  -- final by definition.
  COALESCE(p.judgment_final, p.degree = 'استئنافي' OR p.reached_final),
  -- 🔴 opens_window — STORED INTENT. An appeal ruling never opens a window. For a
  -- first-instance ruling, use the lawyer's recorded answer; when that predates
  -- the tri-state question and is NULL, infer it from whether the case ever sat
  -- at محكوم_حكم_ابتدائي, which per the model happens ONLY for an objectionable
  -- first-instance ruling.
  (p.degree = 'ابتدائي' AND COALESCE(p.objection_feasible, p.reached_primary)),
  -- THE MIRROR, filled from the scalars it will mirror. Same meaning, same
  -- values — this row and law_cases start in agreement.
  p.judgment_deed_received_date,
  p.objection_window_days,
  p.objection_deadline,
  -- No quash can exist in data that predates the quash model.
  NULL,
  NULL,
  'system',
  now(),
  now()
FROM (
  SELECT
    c.id,
    c.judgment_deed_received_date,
    c.objection_window_days,
    h.id                 AS hearing_id,
    h.judgment_side,
    h.judgment_final,
    h.objection_feasible,
    h.objection_deadline,
    (c.current_stage = 'محكوم_حكم_ابتدائي'
      OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)) AS reached_primary,
    (c.current_stage = 'محكوم_حكم_نهائي'
      OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false))   AS reached_final,
    CASE
      WHEN (c.current_stage = 'منظورة_استئناف'
             OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false))
       AND (c.current_stage = 'محكوم_حكم_نهائي'
             OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false))
      THEN 'استئنافي'
      ELSE 'ابتدائي'
    END AS degree
  FROM law_cases c
  -- The case's most recent judgment hearing — the SQL twin of
  -- findLatestJudgmentHearing (result = 'حكم', newest hearing_date first,
  -- regardless of finality). created_at breaks the tie the JS sort leaves open
  -- when two hearings share a date.
  LEFT JOIN LATERAL (
    SELECT h2.id, h2.judgment_side, h2.judgment_final, h2.objection_feasible, h2.objection_deadline
    FROM hearings h2
    WHERE h2.case_id = c.id AND h2.result = 'حكم'
    ORDER BY h2.hearing_date DESC, h2.created_at DESC
    LIMIT 1
  ) h ON true
  WHERE c.current_stage IN ('محكوم_حكم_ابتدائي', 'منظورة_استئناف', 'محكوم_حكم_نهائي')
     OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)
     OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false)
     OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false)
) p
-- Idempotency: a case that already has any judgment row is skipped whole.
WHERE NOT EXISTS (SELECT 1 FROM case_judgments j WHERE j.case_id = p.id);

-- ---------------------------------------------------------------------
-- STEP 2 — COPY the deed files onto judgment #1.
-- ---------------------------------------------------------------------
-- file_path is copied VERBATIM, so the new row points at the same
-- "cases/<caseId>/<uuid>" Object-Storage key. That key is already recognised by
-- isAttachmentObjectKey (the "cases/" prefix), so a copied row reads as a real
-- file and not as a legacy disk path — no re-upload, no 410.
--
-- uploaded_by / uploaded_at are carried across unchanged: the copy must not
-- rewrite who filed the deed or when.
--
-- A case_attachments row whose case has no judgment #1 is NOT copied — the JOIN
-- drops it. Measure query 2 counts those and must be 0.
INSERT INTO judgment_attachments (
  id, judgment_id, file_name, file_path, file_size, mime_type, uploaded_by, uploaded_at
)
SELECT
  gen_random_uuid()::varchar,
  j.id,
  a.file_name,
  a.file_path,
  a.file_size,
  a.mime_type,
  a.uploaded_by,
  a.uploaded_at
FROM case_attachments a
JOIN case_judgments j ON j.case_id = a.case_id AND j.sequence = 1
WHERE NOT EXISTS (
  SELECT 1 FROM judgment_attachments ja WHERE ja.judgment_id = j.id
);

COMMIT;

-- =====================================================================
-- Verification — run after COMMIT, on EACH database.
-- =====================================================================
-- Row counts. judgments must equal measure query 1's total_cases_to_backfill,
-- and attachments must equal its with_deed_file.
-- SELECT (SELECT count(*) FROM case_judgments)       AS judgments,
--        (SELECT count(*) FROM judgment_attachments) AS deed_files;
--
-- Degree split — compare against measure query 1.
-- SELECT degree, count(*) FROM case_judgments GROUP BY degree;
--
-- The mirror agrees with the scalars it mirrors. EXPECT 0 rows.
-- SELECT j.case_id
--   FROM case_judgments j JOIN law_cases c ON c.id = j.case_id
--  WHERE j.sequence = 1
--    AND (j.deed_received_date IS DISTINCT FROM c.judgment_deed_received_date
--      OR j.objection_window_days IS DISTINCT FROM c.objection_window_days);
--
-- Every copied file still points at a recognised object key. EXPECT 0 rows.
-- SELECT id, file_path FROM judgment_attachments
--  WHERE file_path NOT LIKE 'contracts/%' AND file_path NOT LIKE 'cases/%'
--    AND file_path NOT LIKE 'hearings/%'  AND file_path NOT LIKE 'judgments/%';
--
-- Nothing was moved: the source table is untouched.
-- SELECT count(*) AS case_attachments_still_present FROM case_attachments;
--
-- ROLLBACK (only if the whole feature is reverted — the code revert alone is
-- enough to make these tables invisible again):
--   DELETE FROM judgment_attachments;  -- blobs stay; case_attachments still owns them
--   DELETE FROM case_judgments;
