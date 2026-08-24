-- =====================================================================
-- Deed receipt dates that are NOT zero-padded ISO — read-only diagnostic
-- =====================================================================
-- 🔴 WHY THIS EXISTS. The صك tasks compare the stored receipt date to the
-- firm's today with a STRING comparison, which is the calendar comparison ONLY
-- for a zero-padded "YYYY-MM-DD". For anything else it silently inverts:
--
--     '2026-5-21'  > '2026-08-24'  →  TRUE   (at index 5, '5' > '0')
--     '21/05/2026' > '2026-08-24'  →  TRUE
--
-- so a deed received in MAY read as "not yet arrived": the follow-up task
-- «تابع استلام صك الحكم» fires for a صك received and attached months ago, and
-- the attach task goes silent for it. That is exactly the production symptom
-- 83f7a01 caused.
--
-- The code no longer depends on this being clean — a value that is not
-- ISO-shaped now falls back to "arrived", which is what the pre-83f7a01 code
-- did — but such a row can never be judged correctly against today, so a
-- genuinely FUTURE malformed date will show the attach task early. Cleaning
-- them is what restores full correctness.
--
-- Run on BOTH databases. Read-only until you uncomment section 3.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1) THE MIRROR — law_cases.judgment_deed_received_date.
--    This is the column BOTH مهامي tasks read. Any row here is one the
--    tasks could not judge. Expect ZERO on a clean database.
-- ─────────────────────────────────────────────────────────────────────
SELECT
  id,
  case_number,
  current_stage,
  judgment_deed_received_date AS raw_value,
  length(judgment_deed_received_date) AS len,
  CASE
    WHEN btrim(judgment_deed_received_date) ~ '^[0-9]{4}-[0-9]{1}-[0-9]{1,2}$'
      OR btrim(judgment_deed_received_date) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{1}$'
                                            THEN 'unpadded month/day'
    WHEN judgment_deed_received_date <> btrim(judgment_deed_received_date)
                                            THEN 'leading/trailing whitespace'
    WHEN btrim(judgment_deed_received_date) ~ '^[0-9]{1,2}/'
                                            THEN 'slash format'
    WHEN length(btrim(judgment_deed_received_date)) > 10
                                            THEN 'full timestamp, not a day'
    ELSE 'other'
  END AS problem
FROM law_cases
WHERE judgment_deed_received_date IS NOT NULL
  AND btrim(judgment_deed_received_date) <> ''
  AND btrim(judgment_deed_received_date) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
ORDER BY case_number;

-- ─────────────────────────────────────────────────────────────────────
-- 2) THE SOURCE OF TRUTH — case_judgments.deed_received_date.
--    Same test on the judgment rows the mirror is refreshed from. A row here
--    ALSO affects the objection-memo scheduler sweep
--    (getJudgmentsAwaitingObjectionMemo compares `deed_received_date <= today`),
--    whose failure direction is the opposite and quieter: a malformed value
--    fails that test, so the لائحة اعتراضية is simply never raised for it.
-- ─────────────────────────────────────────────────────────────────────
SELECT
  j.id            AS judgment_id,
  c.case_number,
  j.deed_received_date AS raw_value,
  j.objection_deadline,
  j.superseded_at
FROM case_judgments j
LEFT JOIN law_cases c ON c.id = j.case_id
WHERE j.deed_received_date IS NOT NULL
  AND btrim(j.deed_received_date) <> ''
  AND btrim(j.deed_received_date) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
ORDER BY c.case_number;

-- ─────────────────────────────────────────────────────────────────────
-- 2b) MIRROR vs JUDGMENT DISAGREEMENT — the other thing that makes the
--     follow-up fire for an attached deed, and it is NOT a format problem.
--     The tasks read the MIRROR; the attachment hangs off the JUDGMENT. If the
--     mirror is empty while the current judgment has a date, the follow-up
--     fires correctly by its own rule and wrongly by the owner's eye.
--     Expect ZERO — the mirror is refreshed in the same transaction as the
--     judgment write, so any row here means something wrote past that service.
-- ─────────────────────────────────────────────────────────────────────
SELECT c.case_number,
       c.judgment_deed_received_date AS mirror,
       j.deed_received_date          AS judgment,
       (SELECT COUNT(*) FROM judgment_attachments a WHERE a.judgment_id = j.id) AS files
FROM law_cases c
JOIN LATERAL (
  SELECT * FROM case_judgments j2
  WHERE j2.case_id = c.id
  ORDER BY j2.sequence DESC
  LIMIT 1
) j ON TRUE
WHERE COALESCE(btrim(c.judgment_deed_received_date), '')
   <> COALESCE(btrim(j.deed_received_date), '')
ORDER BY c.case_number;

-- ─────────────────────────────────────────────────────────────────────
-- 3) THE REPAIR — ONLY for the unpadded-month/day shape, which is the one
--    case that can be normalised without guessing. Run section 1 first and
--    confirm every row it returns is of that shape.
--
--    ⚠ DO NOT extend this to the slash format: '05/06/2026' is ambiguous
--    (May 6th or June 5th) and no query can decide. Fix those by hand.
--
--    to_date/​to_char round-trips the value through a real date, which both
--    pads it and validates it. Commented out — uncomment deliberately.
-- ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- UPDATE law_cases
-- SET judgment_deed_received_date =
--       to_char(to_date(btrim(judgment_deed_received_date), 'YYYY-MM-DD'), 'YYYY-MM-DD')
-- WHERE judgment_deed_received_date IS NOT NULL
--   AND btrim(judgment_deed_received_date) <> ''
--   AND btrim(judgment_deed_received_date) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
--   AND btrim(judgment_deed_received_date) ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$';
--
-- UPDATE case_judgments
-- SET deed_received_date =
--       to_char(to_date(btrim(deed_received_date), 'YYYY-MM-DD'), 'YYYY-MM-DD')
-- WHERE deed_received_date IS NOT NULL
--   AND btrim(deed_received_date) <> ''
--   AND btrim(deed_received_date) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
--   AND btrim(deed_received_date) ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$';
-- -- re-run section 1 and 2 here; both must return zero rows
-- COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- 4) VERIFY — after any repair. Both must return 0.
-- ─────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS malformed_mirror FROM law_cases
WHERE judgment_deed_received_date IS NOT NULL
  AND btrim(judgment_deed_received_date) <> ''
  AND btrim(judgment_deed_received_date) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

SELECT COUNT(*) AS malformed_judgment FROM case_judgments
WHERE deed_received_date IS NOT NULL
  AND btrim(deed_received_date) <> ''
  AND btrim(deed_received_date) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
