import {
  HearingType, hearingProducesNoMinutes, hearingTypeWorkflowError,
  StagesAtOrPastCourt, type HearingTypeValue, type LawCase,
} from "@shared/schema";

export class HearingTypeError extends Error {}

export type HearingActor = { id: string; name?: string | null };

// Pure planning: storage writes this patch and the hearing in one transaction.
export function hearingCaseStagePatch(
  lawCase: LawCase,
  hearingType: HearingTypeValue,
  departmentName: string | undefined,
  actor?: HearingActor,
): Partial<Pick<LawCase, "currentStage" | "stageHistory" | "caseClassification" | "clientRole">> {
  if (lawCase.isArchived || lawCase.currentStage === "مقفلة") {
    throw new HearingTypeError("لا يمكن إضافة جلسة أو تغيير نوعها لقضية مغلقة أو مؤرشفة");
  }
  const compatibilityError = hearingTypeWorkflowError(lawCase, hearingType, departmentName);
  if (compatibilityError) throw new HearingTypeError(compatibilityError);
  const patch: ReturnType<typeof hearingCaseStagePatch> = {};
  let target = lawCase.currentStage;
  if (hearingProducesNoMinutes({ hearingType })) {
    target = "مداولة_الصلح";
  } else if (hearingType === HearingType.COURT) {
    // Preserve the existing appeal trigger and never erase a later judgment.
    if (lawCase.currentStage === "محكوم_حكم_ابتدائي") target = "منظورة_استئناف";
    else if (!StagesAtOrPastCourt.has(lawCase.currentStage)) target = "منظورة";
    if (lawCase.caseClassification === "قيد_الدراسة") {
      patch.caseClassification = "منظورة_بالمحكمة";
      if (!lawCase.clientRole) patch.clientRole = "مدعي";
    }
  }
  if (target !== lawCase.currentStage) {
    patch.currentStage = target;
    patch.stageHistory = [
      ...(Array.isArray(lawCase.stageHistory) ? lawCase.stageHistory : []),
      {
        stage: target,
        timestamp: new Date().toISOString(),
        userId: actor?.id || "system",
        userName: actor?.name || "النظام",
        notes: target === "منظورة_استئناف"
          ? "انتقال تلقائي — جلسة محكمة بعد حكم ابتدائي (استئناف الخصم)"
          : "مزامنة مرحلة القضية مع نوع الجلسة",
      },
    ];
  }
  return patch;
}
