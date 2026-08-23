-- ============================================================================
-- BATCH 15 — DATA REPAIR: in-court cases stranded on a long-variant stage
-- ============================================================================
-- CONTEXT. getStagesForClassification used to give an in-court case one of two
-- 7-stage paths when memoRequired was set (InCourtDefendantMemoStages /
-- InCourtPlaintiffMemoStages). Batch 15 collapsed that branch: a non-settlement
-- in-court case now ALWAYS resolves to InCourtNoMemoStages —
--     [استلام · استكمال_البيانات · دراسة · منظورة]
-- The cases below sit on a stage that only ever existed on the deleted long
-- variants, so after the code change their current_stage is not on their own
-- path. Owner ruling: they all move to منظورة, the short path's terminal stage.
-- Their memos are untouched and continue in their own lifecycle; the
-- «مذكرة جارية» badge (cases.tsx, priority group 3) keeps that work visible.
--
-- NO DDL. Two UPDATEs, both idempotent. Run against ONE database at a time.
--
-- ⚠ RUN ORDER: apply the code change first (or at the same deploy). Running this
-- against the OLD code is harmless but pointless — those cases are on-path there.
--
-- ⚠ DELIBERATELY NOT TOUCHED: the 13 in-court cases with memo_required = true
-- that sit on a TERMINAL stage (محكوم_حكم_ابتدائي / محكوم_حكم_نهائي / مشطوبة /
-- مقفلة). Those stages are in NO path array today either, so the progress bar
-- already renders them through its terminal-badge branch; the code change does
-- not alter that. See the batch report.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. PREVIEW — run this first. These are exactly the rows UPDATE (2) will touch.
-- ---------------------------------------------------------------------------
SELECT id,
       case_number,
       department_id,
       current_stage,
       client_role,
       memo_required,
       is_settlement_case,
       jsonb_array_length(COALESCE(stage_history, '[]'::jsonb)) AS history_rows
FROM law_cases
WHERE case_classification = $$منظورة_بالمحكمة$$
  AND current_stage IN (
    $$تحرير_مذكرة_جوابية$$,
    $$تحرير_صحيفة_الدعوى$$,
    $$مراجعة_داخلية$$,
    $$إحالة_للجنة_المراجعة$$,
    $$الأخذ_بالملاحظات$$
  )
ORDER BY department_id, current_stage, case_number;

-- Expected at time of measurement (2026-08-23): FOUR rows —
--   dept 3  مراجعة_داخلية       4773052694, 4870049891
--   dept 3  تحرير_مذكرة_جوابية  4870096234
--   dept 4  تحرير_صحيفة_الدعوى  1447160462
-- If the preview returns anything else, STOP and report before running (2).
--
-- 🔴 WHY FIVE STAGES AND NOT THE THREE MEASURED: مراجعة_داخلية,
-- إحالة_للجنة_المراجعة and الأخذ_بالملاحظات are ordinary UNDER-STUDY stages — it is
-- the `case_classification = منظورة_بالمحكمة` term that makes them long-variant-only
-- here. All five are included so a case that moves between measuring and running
-- is still caught. The preview is the authority on what will actually change.


-- ---------------------------------------------------------------------------
-- 2. THE REPAIR
-- ---------------------------------------------------------------------------
-- IDEMPOTENT: after the first run current_stage is منظورة, which is not in the IN
-- list, so a second run matches zero rows and appends no second history entry.
--
-- The stage_history entry mirrors the shape the app itself writes — see the memo
-- cancellation fast-forward in server/routes.ts (grep «تم إلغاء المذكرة - لا يحتاج
-- مذكرة»), which performs this exact move: the same five keys, ISO-8601 timestamp,
-- and 'system' as the actor, which is the established sentinel for a non-user
-- write in this codebase (flagged_by, senderId). stage_history is jsonb, so `||`
-- is a native append and no string building is involved; COALESCE covers the
-- nullable column.
UPDATE law_cases
SET current_stage = $$منظورة$$,
    stage_history = COALESCE(stage_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'stage',     $$منظورة$$,
        'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'userId',    'system',
        'userName',  $$تصحيح إداري$$,
        'notes',     $$تصحيح مسار: القضية منظورة بالمحكمة وتسير على المسار القصير — نُقلت إلى منظورة. المذكرات مستمرة في دورتها المستقلة.$$
      )
    ),
    updated_at = NOW()
WHERE case_classification = $$منظورة_بالمحكمة$$
  AND current_stage IN (
    $$تحرير_مذكرة_جوابية$$,
    $$تحرير_صحيفة_الدعوى$$,
    $$مراجعة_داخلية$$,
    $$إحالة_للجنة_المراجعة$$,
    $$الأخذ_بالملاحظات$$
  );


-- ---------------------------------------------------------------------------
-- 3. SEPARATE, OWNER-APPROVED: case 4772115193 has memo_required = true and ZERO
--    memos. Clearing the flag is now cosmetic (it no longer selects a path) but
--    it stops the case claiming memo work that does not exist.
--    The `AND NOT EXISTS` makes it both idempotent and self-verifying: if a memo
--    is ever created for that case, this becomes a no-op instead of lying.
-- ---------------------------------------------------------------------------
UPDATE law_cases c
SET memo_required = false,
    updated_at = NOW()
WHERE c.case_number = '4772115193'
  AND c.memo_required IS TRUE
  AND NOT EXISTS (SELECT 1 FROM memos m WHERE m.case_id = c.id);


-- ---------------------------------------------------------------------------
-- 4. VERIFICATION — run after (2) and (3).
-- ---------------------------------------------------------------------------
-- (a) Must return ZERO rows: no in-court case is left on a long-variant stage.
SELECT id, case_number, current_stage
FROM law_cases
WHERE case_classification = $$منظورة_بالمحكمة$$
  AND current_stage IN (
    $$تحرير_مذكرة_جوابية$$,
    $$تحرير_صحيفة_الدعوى$$,
    $$مراجعة_داخلية$$,
    $$إحالة_للجنة_المراجعة$$,
    $$الأخذ_بالملاحظات$$
  );

-- (b) The four repaired rows, with their newest history entry.
SELECT case_number,
       current_stage,
       memo_required,
       stage_history -> (jsonb_array_length(stage_history) - 1) AS last_history_entry
FROM law_cases
WHERE case_number IN ('4773052694', '4870049891', '4870096234', '1447160462')
ORDER BY case_number;

-- (c) The flag clear.
SELECT c.case_number,
       c.memo_required,
       (SELECT COUNT(*) FROM memos m WHERE m.case_id = c.id) AS memo_count
FROM law_cases c
WHERE c.case_number = '4772115193';

-- (d) Sanity: every remaining in-court non-settlement case is on the short path
--     or on a terminal stage. Anything else listed here is a case the repair did
--     not cover and wants a look.
SELECT current_stage, COUNT(*) AS n
FROM law_cases
WHERE case_classification = $$منظورة_بالمحكمة$$
  AND is_settlement_case IS NOT TRUE
  AND current_stage NOT IN (
    $$استلام$$, $$استكمال_البيانات$$, $$دراسة$$, $$منظورة$$,
    $$محكوم_حكم_ابتدائي$$, $$محكوم_حكم_نهائي$$, $$منظورة_استئناف$$,
    $$مشطوبة$$, $$مقفلة$$, $$مؤرشفة$$
  )
GROUP BY current_stage
ORDER BY n DESC;
