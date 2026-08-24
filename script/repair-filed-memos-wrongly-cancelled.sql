-- =====================================================================
-- REPAIR — filed memos that the bulk-cancel paths wrongly cancelled
-- =====================================================================
-- 🔴 DO NOT RUN BLIND. Run section 1 first and read the output. Sections 2-4
-- are the repair; section 5 verifies. Safe to run twice (see IDEMPOTENCE).
-- Run on dev (heliumdb) FIRST, confirm, then prod (neondb).
--
-- THE DEFECT. Three bulk paths cancelled a case's "still open" memos by testing
-- memos.status against ['لم_تبدأ','قيد_التحرير','قيد_المراجعة','تحتاج_تعديل'].
-- memos.status FREEZES AT CREATION — the workflow lives on current_stage — so a
-- memo FILED with the court sits at current_stage='مرفوعة' while still carrying
-- status='لم_تبدأ', which is in that list. It got cancelled. The three paths:
--   • the hearing-result path            (routes.ts, cancelActiveCaseMemos WITH a reason)
--   • the case-close cleanup             (routes.ts, cancelActiveCaseMemos with NO reason)
--   • two scheduler auto-close jobs      (checkStruckOffExpiry, checkSettlementLinkMissingTimeout)
-- All three now use the shared isActiveMemo. This script repairs the rows they
-- already made.
--
-- 🔴 HOW A BUG-CANCELLATION IS TOLD FROM A DELIBERATE ONE — this is what makes
-- the repair safe, and it is not a guess:
--   • The two MANUAL cancel endpoints both REQUIRE a non-empty reason (400 when
--     blank) and both have refused filed memos since batch 11 (isMemoFiled).
--     So a filed+cancelled row with NULL/blank cancellation_reason CANNOT have
--     come from a human — only the bare-status bulk writes leave it empty.
--   • The hearing-result bulk path writes one of exactly TWO fixed strings.
--   • ANY OTHER reason text was typed by a person. Those rows are LEFT ALONE,
--     including 'عدم استكمال البيانات …' from /cancel-no-response.
-- The WHERE clause below is shared by all four sections. Do not loosen it.
--
-- 🔴 WHY status BECOMES 'مرفوعة' AND NOT THE ORIGINAL VALUE. The original is
-- NOT RECOVERABLE: cancelMemo's activity-log metadata records only the reason,
-- and the bare-update paths write no activity row at all. 'مرفوعة' is the
-- honest value rather than a guess — the memo IS filed, so this makes status
-- AGREE with current_stage instead of restoring the frozen 'لم_تبدأ' lie. It is
-- also exactly what the Phase-9 backfill wrote for legacy filed rows, and
-- isMemoFiled reads that arm, so every reader now agrees the memo is filed.
--
-- WHAT THIS REPAIR RESTORES:
--   ✅ the memo stops reading as cancelled everywhere (list, detail, my-tasks)
--   ✅ the «سبب الإلغاء: …» banner on the memo detail disappears
--   ✅ status and current_stage stop contradicting each other
--
-- WHAT IT CANNOT RESTORE — read this before running:
--   ❌ THE ORIGINAL status VALUE. Unrecoverable, as above. Everything is set to
--      'مرفوعة'. For the overwhelming majority the original was 'لم_تبدأ'
--      (createMemo's default, frozen), so little real information is lost — but
--      it IS a rewrite, not a rollback.
--   ❌ THE memo_activity_log 'cancelled' ROW. Left in place DELIBERATELY: it is
--      audit history and deleting it would erase the record that this happened.
--      Section 4 appends a corrective entry instead, so the timeline reads
--      "cancelled … then reversed" rather than silently losing the cancellation.
--      Rows cancelled by the bare-status paths never had an activity row at all.
--   ❌ ANYTHING DOWNSTREAM A USER DID WHILE THE MEMO READ AS CANCELLED. If the
--      cancellation caused someone to create a REPLACEMENT memo, that duplicate
--      still exists and this script neither finds nor removes it. Worth a look
--      after running section 1.
--
-- WHAT NEEDS NO REPAIR, verified rather than assumed:
--   • law_cases.active_memo_count — UNAFFECTED. getActiveMemoCount counts
--     isActiveMemo = (not cancelled AND not filed). A filed memo is excluded
--     BOTH before and after this repair, so the stored count does not move.
--   • hearings, field tasks, notifications — memo cancellation touches none of
--     them (cancelMemo's transaction writes only the memo row + its activity
--     row; no caller notifies on memo cancel).
--
-- IDEMPOTENCE: section 2 sets status='مرفوعة', so the WHERE (status='ملغاة')
-- stops matching and a second run updates 0 rows. Section 4 is guarded by
-- NOT EXISTS on its own marker. Nothing here deletes.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 1) PREVIEW — run this ALONE first. Read-only.
--    Every row listed is one this repair will change.
-- ─────────────────────────────────────────────────────────────────────
SELECT
  m.id,
  m.case_id,
  c.case_number,
  m.memo_type,
  m.title,
  m.current_stage,
  m.status,
  COALESCE(m.cancellation_reason, $$(فارغ — إلغاء صامت من مسار إغلاق أو من المجدول)$$)
    AS cancellation_reason,
  m.updated_at
FROM memos m
LEFT JOIN law_cases c ON c.id = m.case_id
WHERE m.current_stage = $$مرفوعة$$
  AND m.status = $$ملغاة$$
  AND (
        m.cancellation_reason IS NULL
     OR btrim(m.cancellation_reason) = ''
     OR m.cancellation_reason = $$أُلغيت تلقائياً بسبب صدور حكم في القضية$$
     OR m.cancellation_reason = $$أُلغيت تلقائياً بسبب تسجيل نتيجة جلسة جديدة$$
  )
ORDER BY c.case_number, m.updated_at;


-- ─────────────────────────────────────────────────────────────────────
-- 1b) CONTEXT — the rows this repair DELIBERATELY LEAVES ALONE.
--     Filed + cancelled, but carrying a human-written reason. If anything
--     here looks like it was also the bug, STOP and report it rather than
--     widening the WHERE above.
-- ─────────────────────────────────────────────────────────────────────
SELECT m.id, c.case_number, m.title, m.cancellation_reason, m.updated_at
FROM memos m
LEFT JOIN law_cases c ON c.id = m.case_id
WHERE m.current_stage = $$مرفوعة$$
  AND m.status = $$ملغاة$$
  AND m.cancellation_reason IS NOT NULL
  AND btrim(m.cancellation_reason) <> ''
  AND m.cancellation_reason <> $$أُلغيت تلقائياً بسبب صدور حكم في القضية$$
  AND m.cancellation_reason <> $$أُلغيت تلقائياً بسبب تسجيل نتيجة جلسة جديدة$$
ORDER BY m.updated_at;


-- ─────────────────────────────────────────────────────────────────────
-- 2) THE REPAIR. Run inside a transaction so section 3's count can be
--    checked before committing.
-- ─────────────────────────────────────────────────────────────────────
BEGIN;

UPDATE memos m
SET status = $$مرفوعة$$,
    -- Cleared too: the memo-detail «سبب الإلغاء: …» banner renders off this
    -- column, so leaving it would caption an un-cancelled memo with why it was
    -- cancelled. The reason is preserved in memo_activity_log where it belongs.
    cancellation_reason = NULL,
    updated_at = NOW()
WHERE m.current_stage = $$مرفوعة$$
  AND m.status = $$ملغاة$$
  AND (
        m.cancellation_reason IS NULL
     OR btrim(m.cancellation_reason) = ''
     OR m.cancellation_reason = $$أُلغيت تلقائياً بسبب صدور حكم في القضية$$
     OR m.cancellation_reason = $$أُلغيت تلقائياً بسبب تسجيل نتيجة جلسة جديدة$$
  );

-- 3) Expect this count to equal the row count section 1 printed.
--    If it does not, ROLLBACK and investigate before committing.


-- ─────────────────────────────────────────────────────────────────────
-- 4) THE CORRECTIVE AUDIT ROW — so the timeline explains the reversal
--    instead of the cancellation just vanishing.
--    activity_type is free text (varchar 50, no enum, no CHECK) — no migration.
--    Guarded by NOT EXISTS on its own type, so a second run inserts nothing.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO memo_activity_log (id, memo_id, activity_type, description, metadata, performed_by, performed_at)
SELECT
  gen_random_uuid()::text,
  m.id,
  'cancellation_reversed',
  $$تم التراجع عن إلغاء المذكرة — كانت مرفوعة وأُلغيت تلقائياً بالخطأ$$,
  jsonb_build_object('repair', 'filed-memos-wrongly-cancelled', 'restoredStatus', $$مرفوعة$$),
  'system',
  NOW()
FROM memos m
WHERE m.current_stage = $$مرفوعة$$
  AND m.status = $$مرفوعة$$
  AND EXISTS (
    SELECT 1 FROM memo_activity_log l
    WHERE l.memo_id = m.id AND l.activity_type IN ('cancelled', 'cancelled_no_response')
  )
  AND NOT EXISTS (
    SELECT 1 FROM memo_activity_log l
    WHERE l.memo_id = m.id AND l.activity_type = 'cancellation_reversed'
  );

-- Review, then:
COMMIT;
-- ROLLBACK;   -- ← use this instead if section 3's count looked wrong


-- ─────────────────────────────────────────────────────────────────────
-- 5) VERIFICATION — after COMMIT.
--    (a) must return ZERO rows: no filed memo is auto-cancelled any more.
--    (b) shows what was repaired.
-- ─────────────────────────────────────────────────────────────────────
-- (a)
SELECT COUNT(*) AS still_wrongly_cancelled
FROM memos
WHERE current_stage = $$مرفوعة$$
  AND status = $$ملغاة$$
  AND (
        cancellation_reason IS NULL
     OR btrim(cancellation_reason) = ''
     OR cancellation_reason = $$أُلغيت تلقائياً بسبب صدور حكم في القضية$$
     OR cancellation_reason = $$أُلغيت تلقائياً بسبب تسجيل نتيجة جلسة جديدة$$
  );

-- (b)
SELECT m.id, c.case_number, m.title, m.status, m.current_stage, m.cancellation_reason
FROM memos m
LEFT JOIN law_cases c ON c.id = m.case_id
JOIN memo_activity_log l ON l.memo_id = m.id AND l.activity_type = 'cancellation_reversed'
ORDER BY c.case_number;

-- (c) RESIDUAL — filed+cancelled rows that SURVIVE this repair on purpose,
--     because a human typed their cancellation reason (section 1b). This is
--     NOT expected to be zero, and it is not a failure: the repair reverses the
--     BUG, not somebody's decision. Listed so the count is known rather than
--     discovered later. If the owner judges any of these to have been the bug
--     too, they are a separate, named decision — not a widening of section 2.
SELECT COUNT(*) AS deliberate_filed_cancellations_left_alone
FROM memos
WHERE current_stage = $$مرفوعة$$
  AND status = $$ملغاة$$
  AND cancellation_reason IS NOT NULL
  AND btrim(cancellation_reason) <> ''
  AND cancellation_reason <> $$أُلغيت تلقائياً بسبب صدور حكم في القضية$$
  AND cancellation_reason <> $$أُلغيت تلقائياً بسبب تسجيل نتيجة جلسة جديدة$$;
