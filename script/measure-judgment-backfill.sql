-- =====================================================================
-- سجل الأحكام — MEASURE FIRST. Read-only. Run this BEFORE anything else.
-- =====================================================================
-- Nothing here writes. It answers "how big is the backfill, and is the data
-- shaped the way the backfill assumes" — run it on the target DB (dev first,
-- then prod) and read the STOP CHECKS before applying add-judgment-tables.sql
-- or backfill-judgments.sql.
--
-- Run with:
--   psql "$DATABASE_URL" -f script/measure-judgment-backfill.sql
--
-- THE POPULATION is exactly the SQL twin of caseReachedJudgmentStage()
-- (shared/schema.ts): current_stage OR stage_history contains any of
-- محكوم_حكم_ابتدائي / منظورة_استئناف / محكوم_حكم_نهائي. It is a POSITIVE test —
-- settlement, strike-off and no-response closures cannot satisfy it, so they are
-- excluded by construction rather than by an exclusion list that could drift.
--
-- ⚠ THE KNOWN FALSE NEGATIVE (unchanged, data-shaped not logic-shaped): a case
-- whose stage_history was never populated — the pre-2026-07-28 seed never wrote
-- it — reads false even if it genuinely held a judgment. Query 4 counts them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Query 1 — THE HEADLINE NUMBERS.
-- ---------------------------------------------------------------------
-- Read: total = how many case_judgments rows the backfill will insert.
-- degree_appeal + degree_first_instance must sum to total.
WITH flagged AS (
  SELECT
    c.id,
    (c.current_stage = 'محكوم_حكم_ابتدائي'
      OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)) AS reached_primary,
    (c.current_stage = 'منظورة_استئناف'
      OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false))    AS reached_appeal,
    (c.current_stage = 'محكوم_حكم_نهائي'
      OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false))   AS reached_final,
    c.judgment_deed_received_date,
    c.objection_window_days
  FROM law_cases c
),
population AS (
  SELECT f.*,
         -- 🔴 THE DEGREE RULE. An APPEAL ruling exists only when the case both
         -- entered منظورة_استئناف AND left it for محكوم_حكم_نهائي — the single
         -- edge out of the appeal stage. A case still SITTING at منظورة_استئناف
         -- has only its FIRST-INSTANCE ruling on record, so testing
         -- reached_appeal alone would mislabel it. Never derived from
         -- current_stage: a case at محكوم_حكم_نهائي can have arrived from either
         -- منظورة (a ruling marked not objectionable) or منظورة_استئناف.
         (f.reached_appeal AND f.reached_final) AS is_appeal_ruling
  FROM flagged f
  WHERE f.reached_primary OR f.reached_appeal OR f.reached_final
)
SELECT
  count(*)                                                        AS total_cases_to_backfill,
  count(*) FILTER (WHERE is_appeal_ruling)                        AS degree_appeal,
  count(*) FILTER (WHERE NOT is_appeal_ruling)                    AS degree_first_instance,
  count(*) FILTER (WHERE judgment_deed_received_date IS NOT NULL
                     AND judgment_deed_received_date <> '')       AS with_deed_receipt_date,
  count(*) FILTER (WHERE objection_window_days IS NOT NULL)       AS with_custom_window,
  count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM case_attachments a WHERE a.case_id = population.id))
                                                                  AS with_deed_file,
  count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM hearings h WHERE h.case_id = population.id AND h.result = 'حكم'))
                                                                  AS without_judgment_hearing
FROM population;

-- ---------------------------------------------------------------------
-- Query 2 — STOP CHECK: deed files that would be LEFT BEHIND by the copy.
-- ---------------------------------------------------------------------
-- Every case_attachments row is copied against its case's judgment #1. A case
-- holding a deed file but NOT in the population has no judgment #1, so its file
-- would silently not be copied. EXPECT 0.
SELECT count(*) AS deed_files_with_no_judgment_row
FROM case_attachments a
JOIN law_cases c ON c.id = a.case_id
WHERE NOT (
  c.current_stage IN ('محكوم_حكم_ابتدائي', 'منظورة_استئناف', 'محكوم_حكم_نهائي')
  OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)
  OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false)
  OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false)
);

-- ---------------------------------------------------------------------
-- Query 3 — STOP CHECK: more than one deed file per case.
-- ---------------------------------------------------------------------
-- case_attachments carries a PLAIN unique index on case_id, so this is
-- structurally impossible. A non-zero answer means the index is missing on this
-- database and the schema has drifted. EXPECT 0 rows.
SELECT case_id, count(*) AS deed_rows
FROM case_attachments
GROUP BY case_id
HAVING count(*) > 1;

-- ---------------------------------------------------------------------
-- Query 4 — HOW MANY DEGREES ARE A GUESS.
-- ---------------------------------------------------------------------
-- A case in the population whose stage_history is empty/absent can only be read
-- through current_stage, so its degree is inferred, not derived. These are the
-- rows the backfill labels ابتدائي by default — the overwhelmingly common path
-- (production showed 8 of 8 final-judgment cases arriving straight from منظورة).
-- Not a stop on its own; the number is what the owner is agreeing to.
SELECT
  count(*)                                                     AS in_population_no_stage_history,
  count(*) FILTER (WHERE current_stage = 'محكوم_حكم_نهائي')     AS of_which_at_final_judgment
FROM law_cases c
WHERE c.current_stage IN ('محكوم_حكم_ابتدائي', 'منظورة_استئناف', 'محكوم_حكم_نهائي')
  AND COALESCE(jsonb_array_length(
        CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END
      ), 0) = 0;

-- ---------------------------------------------------------------------
-- Query 5 — STOP CHECK: ordering ambiguity (a case that RETURNED to منظورة
-- after the appeal stage).
-- ---------------------------------------------------------------------
-- The degree rule reads the stage SET, not the order, which is exact only while
-- منظورة_استئناف has no path back to منظورة. It has none today
-- (ALLOWED_CASE_TRANSITIONS: its only outbound edges are محكوم_حكم_نهائي and
-- مشطوبة), but POST /api/cases/:id/reopen can drop a CLOSED case back onto
-- منظورة, which would put a first-instance ruling after an appeal one. Any such
-- case must be labelled by hand. EXPECT 0.
WITH entries AS (
  SELECT c.id, el.ord, el.val->>'stage' AS stage
  FROM law_cases c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.stage_history) = 'array' THEN c.stage_history ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS el(val, ord)
),
positions AS (
  SELECT id,
         max(ord) FILTER (WHERE stage = 'منظورة')         AS last_under_review,
         max(ord) FILTER (WHERE stage = 'منظورة_استئناف')  AS last_appeal
  FROM entries GROUP BY id
)
SELECT count(*) AS cases_back_at_under_review_after_appeal
FROM positions
WHERE last_appeal IS NOT NULL
  AND last_under_review IS NOT NULL
  AND last_under_review > last_appeal;

-- ---------------------------------------------------------------------
-- Query 6 — STOP CHECK: the tables must be EMPTY before the backfill.
-- ---------------------------------------------------------------------
-- Run this only AFTER add-judgment-tables.sql. The backfill is idempotent (it
-- skips cases that already have a row), but a non-zero count here means it has
-- already run on this database — confirm that before running it again.
-- EXPECT 0 and 0 on a first run.
SELECT
  (SELECT count(*) FROM case_judgments)        AS existing_judgment_rows,
  (SELECT count(*) FROM judgment_attachments)  AS existing_judgment_attachment_rows;

-- ---------------------------------------------------------------------
-- Query 7 — the population, listed. Eyeball before applying anything.
-- ---------------------------------------------------------------------
SELECT
  c.case_number,
  c.current_stage,
  CASE WHEN (c.current_stage = 'منظورة_استئناف'
              OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false))
            AND (c.current_stage = 'محكوم_حكم_نهائي'
              OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false))
       THEN 'استئنافي' ELSE 'ابتدائي' END                       AS degree_it_would_get,
  h.judgment_side                                               AS outcome_it_would_get,
  h.judgment_final,
  h.objection_feasible,
  c.judgment_deed_received_date,
  c.objection_window_days,
  (a.id IS NOT NULL)                                            AS has_deed_file
FROM law_cases c
LEFT JOIN LATERAL (
  SELECT h2.judgment_side, h2.judgment_final, h2.objection_feasible
  FROM hearings h2
  WHERE h2.case_id = c.id AND h2.result = 'حكم'
  ORDER BY h2.hearing_date DESC, h2.created_at DESC
  LIMIT 1
) h ON true
LEFT JOIN case_attachments a ON a.case_id = c.id
WHERE c.current_stage IN ('محكوم_حكم_ابتدائي', 'منظورة_استئناف', 'محكوم_حكم_نهائي')
   OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_ابتدائي"}]'::jsonb, false)
   OR COALESCE(c.stage_history @> '[{"stage":"منظورة_استئناف"}]'::jsonb, false)
   OR COALESCE(c.stage_history @> '[{"stage":"محكوم_حكم_نهائي"}]'::jsonb, false)
ORDER BY c.case_number;
