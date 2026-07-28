// Shared case-stage helper. Extracted from cases.tsx so both the cases page and
// the shared <CaseStagePanel> compute "has this case looped back from review?"
// identically (drives the progress bar's hasReturnedFromReview hint). Pure;
// no behavior change from the original cases.tsx definition.
const REVIEW_LOOP_STAGES = new Set([
  "مراجعة_داخلية",
  "مراجعة_داخلية_للتظلم",
]);
const DRAFTING_LOOP_STAGES = new Set([
  "تحرير_صحيفة_الدعوى",
  "تحرير_مذكرة_جوابية",
  "تحرير_صيغة_التظلم",
]);

// Canonical "is this case paused?" check — paused_at IS NOT NULL is the indicator
// (status/stage are deliberately NOT touched on pause; see schema.ts Phase-8 note).
// Shared, unchanged, by the cases page (table + row actions) and the case-details
// dialog's paused banner, which now live in different files.
export function isCasePaused(c: { pausedAt?: string | null }): boolean {
  return !!c.pausedAt;
}

// Applied to the STAGE badge in every list table.
//
// 🔴 WHY THIS IS NEEDED AND flex-wrap IS NOT ENOUGH — the lesson from getting
// this wrong once (7e48109 widened the cases column and wrapped the container,
// and concluded consultations "already wraps"; it does not, in practice):
//   flex-wrap creates break opportunities BETWEEN flex items. It does nothing
//   INSIDE one. Badge is `whitespace-nowrap` by design (ui/badge.tsx), so a
//   SINGLE badge whose own text is wider than the column cannot shrink and
//   cannot break — it overflows no matter how the container is configured, and
//   no column width short of the full label fixes it.
// The longest stage labels are 26 characters — "استكمال المرفقات والبيانات" on
// BOTH cases and consultations, "بانتظار رفع العميل للتسوية" on cases — which
// exceeds any sane column share once TableCell's p-4 is subtracted.
//
// So the stage badge (and only the stage badge) is allowed to wrap its text.
// The short status pills — معلّقة / بانتظار / تعقيبية #1 / رد خصم — stay nowrap;
// they fit, and wrapping them would look ragged.
//
// Chosen over SHORTENING the label in the table: a table-only short name would
// be a SECOND vocabulary for one stage — the filter dropdown, the stage bar and
// the details dialog all show the full label — and this codebase has been bitten
// repeatedly by one user-visible string having two forms. The label is the label.
export const STAGE_BADGE_WRAP_CLASS = "whitespace-normal break-words leading-tight text-center";

// Tooltip text for the "معلّقة" row badge, shared by all four pausable entities
// (cases / consultations / contracts / memos) so the auto-lift date is surfaced
// identically everywhere. A `title` attribute takes a plain string, so this
// cannot use the DualDateDisplay component the banners use.
//
// pauseUntil is nullable by design — an open-ended pause is still the default —
// and this degrades to exactly the previous text when it is absent.
export function pauseBadgeTooltip(entity: {
  pauseReason?: string | null;
  pauseUntil?: string | null;
}, fallback = "معلّقة"): string {
  const reason = String(entity.pauseReason ?? "").trim() || fallback;
  const until = String(entity.pauseUntil ?? "").trim();
  return until ? `${reason} — ينتهي التعليق تلقائياً في ${until}` : reason;
}

export function caseHasReturnedFromReview(c: {
  currentStage: string;
  stageHistory?: any[] | null;
  hasReturnedFromReview?: boolean;
}): boolean {
  if (!DRAFTING_LOOP_STAGES.has(c.currentStage)) return false;
  if (c.hasReturnedFromReview) return true;
  if (!Array.isArray(c.stageHistory)) return false;
  return c.stageHistory.some((t) => REVIEW_LOOP_STAGES.has(t?.stage));
}
