-- =====================================================================
-- Phase-9 — backfill memos.current_stage from legacy memos.status
-- =====================================================================
-- Maps the old MemoStatus enum to the new MemoStage enum for existing
-- rows. Run AFTER script/add-memo-helper-tables.sql (which adds the
-- current_stage column).
--
-- Mapping (per Phase-9 spec):
--   لم_تبدأ           → استلام             (RECEIVED)
--   قيد_التحرير       → تحرير              (DRAFTING)
--   قيد_المراجعة      → مراجعة_داخلية      (INTERNAL_REVIEW)*
--   بانتظار_الاعتماد  → لجنة_مراجعة        (COMMITTEE)
--   تحتاج_تعديل       → تحرير              (DRAFTING — loops back)
--   معتمدة            → جاهزة_للرفع        (READY)
--   مرفوعة            → مرفوعة             (FILED — terminal, same value)
--   ملغاة             → (current_stage stays NULL)
--
-- * The legacy status "قيد_المراجعة" was ambiguous — it covered both
--   peer review and committee review. We default it to مراجعة_داخلية
--   (the more common starting case for peer review). Memos that are
--   actually already in committee can be moved manually by the user
--   via the existing return-stage / advance-stage controls. The
--   server-side validateStageTransition gate enforces who is allowed
--   to do that.
--
-- ملغاة (cancelled) memos intentionally leave current_stage NULL.
-- Cancellation is an orthogonal lifecycle, not a workflow stage —
-- consistent with Phase-8's pause/await modeling.
--
-- The WHERE clause filters on `current_stage IS NULL` so re-running
-- the script is a no-op once it has populated the column. Memos
-- created post-Phase-9 (which start at "استلام") are also untouched.
--
-- Apply to BOTH dev and prod (per replit.md).
-- Idempotent — safe to re-run.
-- =====================================================================

-- لم_تبدأ → استلام
UPDATE memos
   SET current_stage = 'استلام'
 WHERE current_stage IS NULL
   AND status = 'لم_تبدأ';

-- قيد_التحرير → تحرير
UPDATE memos
   SET current_stage = 'تحرير'
 WHERE current_stage IS NULL
   AND status = 'قيد_التحرير';

-- قيد_المراجعة → مراجعة_داخلية (default; user can advance manually
-- if the memo is actually in committee already)
UPDATE memos
   SET current_stage = 'مراجعة_داخلية'
 WHERE current_stage IS NULL
   AND status = 'قيد_المراجعة';

-- بانتظار_الاعتماد → لجنة_مراجعة
UPDATE memos
   SET current_stage = 'لجنة_مراجعة'
 WHERE current_stage IS NULL
   AND status = 'بانتظار_الاعتماد';

-- تحتاج_تعديل → تحرير (drafting loop)
UPDATE memos
   SET current_stage = 'تحرير'
 WHERE current_stage IS NULL
   AND status = 'تحتاج_تعديل';

-- معتمدة → جاهزة_للرفع
UPDATE memos
   SET current_stage = 'جاهزة_للرفع'
 WHERE current_stage IS NULL
   AND status = 'معتمدة';

-- مرفوعة → مرفوعة (terminal)
UPDATE memos
   SET current_stage = 'مرفوعة'
 WHERE current_stage IS NULL
   AND status = 'مرفوعة';

-- ملغاة memos intentionally left with current_stage = NULL.
-- No UPDATE for "ملغاة".
