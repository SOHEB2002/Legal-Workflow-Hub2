import { Check } from "lucide-react";
import {
  ConsultationStage,
  ConsultationStageLabels,
  ConsultationStagesAll,
  ConsultationStagesOrder,
  ConsultationStagesOrderPhone,
  ConsultationStagesOrderProcedural,
  ConsultationType,
  getStagesForConsultationCycle,
  resolveConsultationType,
  type ConsultationStageValue,
} from "@shared/schema";

interface ConsultationStagesBarProps {
  currentStage: ConsultationStageValue;
  // Workflow discriminator — picks the stage list to render. Defaults to
  // WRITTEN when omitted so existing callers (and rows with legacy
  // free-text consultation_type values) keep the full 7+1 bar.
  consultationType?: string | null;
  // True when this consultation has already gone through the
  // الأخذ_بالملاحظات branch (committee returned يوجد_ملاحظات previously).
  // The page can't infer this from currentStage once the consultation has
  // moved on to جاهزة_للإرسال / منجزة, so callers compute it from server
  // data (committee-decision history) and pass it in. Ignored for the
  // simple PHONE / PROCEDURAL flows (which have no taking-notes branch).
  hasTakingNotesHistory?: boolean;
  // When > 0, the consultation is (or was last) in a follow-up cycle —
  // render the 3-stage cycle bar instead of the full type stages.
  // Status-agnostic on purpose: a closed cycle still shows the cycle bar
  // with CLOSED_FINAL highlighted, not the original 8-stage path.
  followUpCount?: number | null;
}

export function ConsultationStagesBar({
  currentStage,
  consultationType,
  hasTakingNotesHistory = false,
  followUpCount,
}: ConsultationStagesBarProps) {
  const resolved = resolveConsultationType(consultationType);
  const stages: ConsultationStageValue[] = (() => {
    if ((followUpCount ?? 0) > 0) {
      return [...getStagesForConsultationCycle({ consultationType, followUpCount })];
    }
    if (resolved === ConsultationType.PHONE) return [...ConsultationStagesOrderPhone];
    if (resolved === ConsultationType.PROCEDURAL) return [...ConsultationStagesOrderProcedural];
    const showTakingNotes =
      currentStage === ConsultationStage.TAKING_NOTES || hasTakingNotesHistory;
    return showTakingNotes ? [...ConsultationStagesAll] : [...ConsultationStagesOrder];
  })();

  const rawIndex = stages.indexOf(currentStage);
  const currentIndex = rawIndex >= 0 ? rawIndex : 0;

  const getStageStatus = (stageIndex: number) => {
    if (stageIndex < currentIndex) return "completed";
    if (stageIndex === currentIndex) return "current";
    return "upcoming";
  };

  return (
    <div
      className="flex items-center justify-between gap-2 overflow-x-auto pb-2"
      dir="rtl"
      data-testid="consultation-stages-bar"
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
                data-testid={`consultation-stage-indicator-${index}`}
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
                {ConsultationStageLabels[stage] || stage}
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
  );
}
