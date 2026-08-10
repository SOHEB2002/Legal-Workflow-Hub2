-- =====================================================================
-- BATCH 4 — WHICH CASES BECOME UNCLOSABLE? Read-only. RUN BEFORE DEPLOY.
-- =====================================================================
-- The ضبط gate blocked 83 cases on deploy and was reverted the same day. This
-- script exists so that cannot happen again: it computes the batch-4 close gate
-- against live data and lists, BY CASE NUMBER, every case it would refuse.
--
-- Run on PROD (neondb) and on dev (heliumdb):
--   psql "$DATABASE_URL" -f script/measure-deed-gate-batch4.sql
--
-- WHAT CHANGED. The gate used to ask case_attachments — "does this CASE have a
-- deed on file?". It now asks whether the case's CURRENT ruling (case_judgments,
-- highest sequence) has ITS OWN deed in judgment_attachments. Identical answer
-- for a case with one ruling; different only where a case has more than one, or
-- where the two tables disagree.
--
-- 🔴 THE GATE KEYS ON THE DEED, NEVER ON THE WINDOW. A quash has a صك like any
-- other ruling but opens no objection window, so opens_window appears in the
-- report below only as INFORMATION — it is not a term of the predicate.
--
-- NO JUDGMENT RECORD → NOT GATED. Nothing was judged, so there is no deed to
-- require; query 2 confirms none of those are captured.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Query 1 — 🔴 THE HEADLINE. The four populations, one row.
-- ---------------------------------------------------------------------
-- newly_blocked is THE number to read. If it is not 0, read query 3 before
-- deploying and decide case by case.
WITH scoped AS (
  SELECT
    c.id, c.case_number, c.current_stage,
    (c.current_stage IN ('محكوم_حكم_ابتدائي','منظورة_استئناف','محكوم_حكم_نهائي')
      OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)
      OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false)
      OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false)
    ) AS reached_judgment,
    -- OLD predicate: any deed row on the case.
    EXISTS (SELECT 1 FROM case_attachments a WHERE a.case_id = c.id) AS case_has_deed,
    -- NEW predicate: the CURRENT ruling has its own deed.
    cur.judgment_id,
    (cur.judgment_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM judgment_attachments ja WHERE ja.judgment_id = cur.judgment_id
     )) AS current_judgment_has_deed
  FROM law_cases c
  LEFT JOIN LATERAL (
    SELECT j.id AS judgment_id
    FROM case_judgments j
    WHERE j.case_id = c.id
    ORDER BY j.sequence DESC
    LIMIT 1
  ) cur ON true
  -- The close gate only fires on a case being closed, so a case already at مقفلة
  -- can never meet it.
  WHERE c.current_stage <> 'مقفلة'
),
verdict AS (
  SELECT *,
    (reached_judgment AND NOT case_has_deed)                                   AS blocked_before,
    (reached_judgment AND judgment_id IS NOT NULL AND NOT current_judgment_has_deed) AS blocked_after
  FROM scoped
)
SELECT
  count(*) FILTER (WHERE reached_judgment)                          AS cases_in_gate_scope,
  count(*) FILTER (WHERE blocked_before)                            AS blocked_before,
  count(*) FILTER (WHERE blocked_after)                             AS blocked_after,
  count(*) FILTER (WHERE blocked_after AND NOT blocked_before)      AS newly_blocked,
  count(*) FILTER (WHERE blocked_before AND NOT blocked_after)      AS newly_unblocked
FROM verdict;

-- ---------------------------------------------------------------------
-- Query 2 — SAFETY CHECK: cases the gate must NOT capture.
-- ---------------------------------------------------------------------
-- A case that reached a judgment stage but has NO judgment record. The new
-- predicate returns "not missing" for these, so they close freely. EXPECT 0 —
-- batch 1 backfilled exactly this population — and if it is not 0, those cases
-- are ALSO the ones whose صك nothing will ever chase.
SELECT count(*) AS reached_judgment_but_no_judgment_row
FROM law_cases c
WHERE c.current_stage <> 'مقفلة'
  AND (c.current_stage IN ('محكوم_حكم_ابتدائي','منظورة_استئناف','محكوم_حكم_نهائي')
    OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)
    OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false)
    OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false))
  AND NOT EXISTS (SELECT 1 FROM case_judgments j WHERE j.case_id = c.id);

-- ---------------------------------------------------------------------
-- Query 3 — 🔴 EVERY CASE THE NEW GATE WOULD REFUSE, BY CASE NUMBER.
-- ---------------------------------------------------------------------
-- `change` tells you which are NEW. Fix a "newly blocked" row by attaching that
-- ruling's صك through the case dialog — the file-only control accepts it at any
-- stage since batch 2.
WITH cur AS (
  SELECT DISTINCT ON (j.case_id)
         j.case_id, j.id AS judgment_id, j.sequence, j.degree, j.outcome, j.opens_window,
         j.deed_received_date
  FROM case_judgments j
  ORDER BY j.case_id, j.sequence DESC
)
SELECT
  c.case_number,
  c.current_stage,
  cur.sequence      AS current_ruling_no,
  cur.degree,
  cur.outcome,
  cur.opens_window  AS opens_window_INFO_ONLY,
  cur.deed_received_date,
  EXISTS (SELECT 1 FROM case_attachments a WHERE a.case_id = c.id) AS case_had_a_deed_file,
  CASE WHEN EXISTS (SELECT 1 FROM case_attachments a WHERE a.case_id = c.id)
       THEN 'NEWLY BLOCKED — the case has a deed, but not for THIS ruling'
       ELSE 'already blocked before batch 4'
  END AS change
FROM law_cases c
JOIN cur ON cur.case_id = c.id
WHERE c.current_stage <> 'مقفلة'
  AND (c.current_stage IN ('محكوم_حكم_ابتدائي','منظورة_استئناف','محكوم_حكم_نهائي')
    OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)
    OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false)
    OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false))
  AND NOT EXISTS (SELECT 1 FROM judgment_attachments ja WHERE ja.judgment_id = cur.judgment_id)
ORDER BY case_had_a_deed_file DESC, c.case_number;

-- ---------------------------------------------------------------------
-- Query 4 — THE ADVANCE GATE. Same predicate, different trigger.
-- ---------------------------------------------------------------------
-- The advance gate refuses to move a case OFF a judgment stage while the deed is
-- missing. It keys on the CURRENT stage rather than history, so it is a subset of
-- query 3 — listed separately because these cases are stuck in a more visible
-- way: the stage bar's next-stage button will refuse.
WITH cur AS (
  SELECT DISTINCT ON (j.case_id) j.case_id, j.id AS judgment_id, j.sequence
  FROM case_judgments j ORDER BY j.case_id, j.sequence DESC
)
SELECT c.case_number, c.current_stage, cur.sequence AS current_ruling_no
FROM law_cases c
JOIN cur ON cur.case_id = c.id
WHERE c.current_stage IN ('محكوم_حكم_ابتدائي','منظورة_استئناف','محكوم_حكم_نهائي')
  AND NOT EXISTS (SELECT 1 FROM judgment_attachments ja WHERE ja.judgment_id = cur.judgment_id)
ORDER BY c.case_number;

-- ---------------------------------------------------------------------
-- Query 5 — TABLE DRIFT: the two deed tables disagreeing.
-- ---------------------------------------------------------------------
-- Batch 2 dual-writes, so every deed uploaded since then exists in BOTH tables
-- pointing at ONE blob, and batch 1 copied the historical rows. A row here means
-- one of those two mechanisms did not run for that case — worth knowing before
-- the gate starts trusting judgment_attachments alone. EXPECT 0 rows.
SELECT c.case_number, c.current_stage,
       (SELECT count(*) FROM case_attachments a WHERE a.case_id = c.id)      AS case_deed_rows,
       (SELECT count(*) FROM judgment_attachments ja
          JOIN case_judgments j ON j.id = ja.judgment_id
         WHERE j.case_id = c.id)                                            AS judgment_deed_rows
FROM law_cases c
WHERE EXISTS (SELECT 1 FROM case_attachments a WHERE a.case_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM judgment_attachments ja
                    JOIN case_judgments j ON j.id = ja.judgment_id
                   WHERE j.case_id = c.id)
ORDER BY c.case_number;
