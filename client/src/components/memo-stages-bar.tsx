import { Check, Ban } from "lucide-react";
import {
  MemoStage,
  MemoStageLabels,
  MemoStagesAll,
  MemoStagesOrder,
  memoStagesForDepartment,
  type MemoStageValue,
} from "@shared/schema";

interface MemoStagesBarProps {
  currentStage: MemoStageValue;
  // True when this memo has already gone through the الأخذ_بالملاحظات
  // branch (committee returned يوجد_ملاحظات previously). The page can't
  // infer this from currentStage once the memo has moved on to
  // جاهزة_للرفع / مرفوعة, so callers compute it from server data
  // (committee-decision history) and pass it in.
  hasTakingNotesHistory?: boolean;
  // The PARENT CASE's department name, for the committee hide. Memos carry no
  // departmentId, so the caller does the memo → case → department hop; this
  // component has no data access of its own. Omitted → committee kept, i.e.
  // today's behaviour.
  departmentName?: string | null;
  // 🔴 THE MEMO IS CANCELLED (status === "ملغاة"). Batch 10 — this component had
  // NO cancellation input at all, so all 120 cancelled memos in production
  // rendered a live-looking bar with a highlighted "current" stage, directly
  // contradicting the ملغاة badge sitting beside it in the same dialog.
  //
  // OWNER RULING: DIMMED, NOT HIDDEN. The stage a memo stopped at is useful
  // information — it says how far the work got before it was cancelled — so the
  // bar stays and reads as history instead of as live work.
  //
  // Cancellation is orthogonal to the stage by design («ملغاة حالة لا مرحلة»), so
  // it arrives as its own prop rather than as a stage value. Omitted → false →
  // byte-identical to the pre-batch rendering.
  cancelled?: boolean;
}

export function MemoStagesBar({
  currentStage,
  hasTakingNotesHistory = false,
  departmentName,
  cancelled = false,
}: MemoStagesBarProps) {
  const showTakingNotes =
    currentStage === MemoStage.TAKING_NOTES || hasTakingNotesHistory;
  const baseStages: readonly MemoStageValue[] = showTakingNotes
    ? MemoStagesAll
    : MemoStagesOrder;
  const stages: MemoStageValue[] = memoStagesForDepartment(departmentName, baseStages);

  const rawIndex = stages.indexOf(currentStage);
  const currentIndex = rawIndex >= 0 ? rawIndex : 0;

  const getStageStatus = (stageIndex: number) => {
    if (stageIndex < currentIndex) return "completed";
    if (stageIndex === currentIndex) return "current";
    return "upcoming";
  };

  return (
    <div className="space-y-2" data-testid="memo-stages-bar-wrap">
    {/* The cancellation line sits ABOVE the bar, not inside it: the bar's own
        vocabulary is stages, and ملغاة is not one. Stating it in words is what
        stops the dimming from reading as "loading" or "disabled". */}
    {cancelled && (
      <div
        className="flex items-center gap-1.5 text-xs font-semibold text-destructive"
        data-testid="memo-stages-bar-cancelled"
      >
        <Ban className="w-3.5 h-3.5" />
        <span>مذكرة ملغاة — توقفت عند هذه المرحلة</span>
      </div>
    )}
    <div
      className={`flex items-center justify-between gap-2 overflow-x-auto min-w-0 pb-2 ${
        // 🔴 DIMMED, NOT HIDDEN (owner ruling). grayscale drains the green
        // "completed" ticks and the accent "current" ring of their meaning-carrying
        // colour in ONE rule, without editing any of the per-stage classes below —
        // so the stage logic stays exactly as it is for a live memo, and there is
        // no second styling path to keep in sync. opacity does the rest.
        cancelled ? "opacity-50 grayscale" : ""
      }`}
      dir="rtl"
      aria-disabled={cancelled || undefined}
      data-testid="memo-stages-bar"
    >
      {stages.map((stage, index) => {
        const status = getStageStatus(index);
        return (
          <div key={stage} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  status === "completed"
                    ? "bg-green-500 text-white"
                    : status === "current"
                    ? "bg-accent text-accent-foreground ring-4 ring-accent/30"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`memo-stage-indicator-${index}`}
              >
                {status === "completed" ? <Check className="w-5 h-5" /> : index + 1}
              </div>
              <span
                className={`mt-2 text-xs text-center break-words max-w-[72px] leading-tight ${
                  status === "current"
                    ? "font-bold text-accent"
                    : status === "completed"
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
                }`}
              >
                {MemoStageLabels[stage] || stage}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div
                className={`h-1 flex-1 mx-1 rounded ${
                  index < currentIndex ? "bg-green-500" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}
