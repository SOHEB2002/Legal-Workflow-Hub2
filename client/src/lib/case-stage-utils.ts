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
