import { Check } from "lucide-react";
import {
  ContractStage,
  ContractStageLabels,
  ContractStagesAll,
  ContractStagesOrder,
  getStagesForContractCycle,
  contractStagesForDepartment,
  type ContractStageValue,
} from "@shared/schema";

interface ContractStagesBarProps {
  currentStage: ContractStageValue;
  // True when this contract has gone through الأخذ_بالملاحظات previously
  // (committee returned يوجد_ملاحظات). Same toggle as ConsultationStagesBar
  // — once we're past TAKING_NOTES, the page can't infer from currentStage
  // alone whether it ever happened, so callers compute it from the
  // committee-decision history and pass it in.
  hasTakingNotesHistory?: boolean;
  // When > 0, the contract is (or was last) in a follow-up cycle — render the
  // 3-stage cycle bar instead of the full contract flow. Status-agnostic on
  // purpose, mirroring ConsultationStagesBar: a re-closed cycle still shows
  // the cycle bar with مغلقة highlighted, not the original 8-stage path.
  followUpCount?: number | null;
  // The contract's department NAME. Departments in DepartmentsWithoutCommittee
  // render a path with no committee stage. Passed in rather than looked up here
  // so this component stays pure and free of context — the page already has
  // getDepartmentName and the full record at the call site.
  // Omitted → treated as having a committee, i.e. today's behaviour.
  departmentName?: string | null;
}

export function ContractStagesBar({
  currentStage,
  hasTakingNotesHistory = false,
  followUpCount,
  departmentName,
}: ContractStagesBarProps) {
  const stages: ContractStageValue[] = (() => {
    // Checked FIRST, exactly like ConsultationStagesBar — the cycle list wins
    // over the taking-notes toggle (a cycle never visits التحرير/اللجنة).
    if ((followUpCount ?? 0) > 0) {
      return [...getStagesForContractCycle({ followUpCount })];
    }
    const showTakingNotes =
      currentStage === ContractStage.TAKING_NOTES || hasTakingNotesHistory;
    const base = showTakingNotes ? ContractStagesAll : ContractStagesOrder;
    // Committee hide — a no-op for every department that has one.
    return contractStagesForDepartment(departmentName, base);
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
      className="flex items-center justify-between gap-2 overflow-x-auto min-w-0 pb-2"
      dir="rtl"
      data-testid="contract-stages-bar"
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
                data-testid={`contract-stage-indicator-${index}`}
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
                {ContractStageLabels[stage] || stage}
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
