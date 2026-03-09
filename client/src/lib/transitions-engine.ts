import type { CaseStageValue, ConsultationStatusValue, UserRoleType, CaseStageTransition } from "@shared/schema";
import { CaseStage, CaseStagesOrder, ConsultationStatus, UserRole } from "@shared/schema";

export interface TransitionRule {
  from: string;
  to: string;
  allowedRoles: UserRoleType[];
  requiresAssignment?: boolean;
  autoActions?: AutoAction[];
  label: string;
}

export interface AutoAction {
  type: "assign_to_department_head" | "assign_to_review_committee" | "assign_to_lawyer" | "close" | "notify";
  target?: string;
}

export interface TransitionValidation {
  allowed: boolean;
  reason?: string;
  rule?: TransitionRule;
}

export interface StageInfo {
  stage: string;
  label: string;
  description: string;
  responsibleRoles: UserRoleType[];
}

const CASE_TRANSITIONS: TransitionRule[] = [
  {
    from: CaseStage.RECEIVED,
    to: CaseStage.DATA_COMPLETION,
    allowedRoles: [UserRole.ADMIN_SUPPORT, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    autoActions: [{ type: "assign_to_department_head" }],
    label: "قبول القضية وإسناد لرئيس القسم",
  },
  {
    from: CaseStage.DATA_COMPLETION,
    to: CaseStage.STUDY,
    allowedRoles: [UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    autoActions: [{ type: "assign_to_lawyer" }],
    label: "إسناد للمحامي المختص",
  },
  {
    from: CaseStage.STUDY,
    to: CaseStage.DRAFTING,
    allowedRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    label: "إتمام الدراسة وبدء تحرير المذكرة",
  },
  {
    from: CaseStage.DRAFTING,
    to: CaseStage.REVIEW_COMMITTEE,
    allowedRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    autoActions: [{ type: "assign_to_review_committee" }],
    label: "إحالة للجنة المراجعة",
  },
  {
    from: CaseStage.REVIEW_COMMITTEE,
    to: CaseStage.SUBMITTED,
    allowedRoles: [UserRole.CASES_REVIEW_HEAD, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    autoActions: [{ type: "notify" }],
    label: "اعتماد ورفع للدائرة",
  },
  {
    from: CaseStage.REVIEW_COMMITTEE,
    to: CaseStage.AMENDMENTS,
    allowedRoles: [UserRole.CASES_REVIEW_HEAD, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    autoActions: [{ type: "notify" }],
    label: "إرجاع بملاحظات",
  },
  {
    from: CaseStage.AMENDMENTS,
    to: CaseStage.REVIEW_COMMITTEE,
    allowedRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    label: "إعادة الإحالة للجنة المراجعة بعد التعديلات",
  },
  {
    from: CaseStage.SUBMITTED,
    to: CaseStage.CLOSED,
    allowedRoles: [UserRole.ADMIN_SUPPORT, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    autoActions: [{ type: "close" }],
    label: "إقفال القضية",
  },
];

const CASE_BACKWARD_TRANSITIONS: TransitionRule[] = [
  {
    from: CaseStage.DATA_COMPLETION,
    to: CaseStage.RECEIVED,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع للاستلام",
  },
  {
    from: CaseStage.STUDY,
    to: CaseStage.DATA_COMPLETION,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع لاستكمال البيانات",
  },
  {
    from: CaseStage.DRAFTING,
    to: CaseStage.STUDY,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع للدراسة",
  },
  {
    from: CaseStage.REVIEW_COMMITTEE,
    to: CaseStage.DRAFTING,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.CASES_REVIEW_HEAD, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع لتحرير المذكرة",
  },
  {
    from: CaseStage.AMENDMENTS,
    to: CaseStage.DRAFTING,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع لتحرير المذكرة",
  },
  {
    from: CaseStage.SUBMITTED,
    to: CaseStage.AMENDMENTS,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع للملاحظات",
  },
];

const CONSULTATION_TRANSITIONS: TransitionRule[] = [
  {
    from: ConsultationStatus.RECEIVED,
    to: ConsultationStatus.STUDY,
    allowedRoles: [UserRole.ADMIN_SUPPORT, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    autoActions: [{ type: "assign_to_department_head" }],
    label: "قبول الاستشارة وإسناد لرئيس القسم",
  },
  {
    from: ConsultationStatus.STUDY,
    to: ConsultationStatus.PREPARING_RESPONSE,
    allowedRoles: [UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    autoActions: [{ type: "assign_to_lawyer" }],
    label: "تحديد الموظف وإسناد المهمة",
  },
  {
    from: ConsultationStatus.PREPARING_RESPONSE,
    to: ConsultationStatus.REVIEW_COMMITTEE,
    allowedRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    autoActions: [{ type: "assign_to_review_committee" }],
    label: "إرسال للمراجعة",
  },
  {
    from: ConsultationStatus.REVIEW_COMMITTEE,
    to: ConsultationStatus.READY,
    allowedRoles: [UserRole.CONSULTATIONS_REVIEW_HEAD, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    autoActions: [{ type: "notify" }],
    label: "اعتماد الاستشارة",
  },
  {
    from: ConsultationStatus.REVIEW_COMMITTEE,
    to: ConsultationStatus.AMENDMENTS,
    allowedRoles: [UserRole.CONSULTATIONS_REVIEW_HEAD, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    autoActions: [{ type: "notify" }],
    label: "إرجاع بملاحظات",
  },
  {
    from: ConsultationStatus.AMENDMENTS,
    to: ConsultationStatus.REVIEW_COMMITTEE,
    allowedRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    requiresAssignment: true,
    label: "إعادة الإرسال للمراجعة بعد التعديلات",
  },
  {
    from: ConsultationStatus.READY,
    to: ConsultationStatus.DELIVERED,
    allowedRoles: [UserRole.ADMIN_SUPPORT, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    label: "تسليم الاستشارة",
  },
  {
    from: ConsultationStatus.DELIVERED,
    to: ConsultationStatus.CLOSED,
    allowedRoles: [UserRole.ADMIN_SUPPORT, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
    autoActions: [{ type: "close" }],
    label: "إقفال الاستشارة",
  },
];

const CONSULTATION_BACKWARD_TRANSITIONS: TransitionRule[] = [
  {
    from: ConsultationStatus.STUDY,
    to: ConsultationStatus.RECEIVED,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع للاستلام",
  },
  {
    from: ConsultationStatus.PREPARING_RESPONSE,
    to: ConsultationStatus.STUDY,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع للدراسة",
  },
  {
    from: ConsultationStatus.REVIEW_COMMITTEE,
    to: ConsultationStatus.PREPARING_RESPONSE,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.CONSULTATIONS_REVIEW_HEAD, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع لإعداد الرد",
  },
  {
    from: ConsultationStatus.READY,
    to: ConsultationStatus.AMENDMENTS,
    allowedRoles: [UserRole.BRANCH_MANAGER, UserRole.DEPARTMENT_HEAD],
    label: "إرجاع للتعديلات",
  },
];

const CASE_STAGE_INFO: StageInfo[] = [
  {
    stage: CaseStage.RECEIVED,
    label: "استلام",
    description: "تقييم إداري أولي للقضية",
    responsibleRoles: [UserRole.ADMIN_SUPPORT, UserRole.BRANCH_MANAGER],
  },
  {
    stage: CaseStage.DATA_COMPLETION,
    label: "استكمال البيانات",
    description: "رئيس القسم يراجع البيانات ويُسند للمحامي",
    responsibleRoles: [UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
  },
  {
    stage: CaseStage.STUDY,
    label: "دراسة",
    description: "المحامي يدرس القضية ويستكمل البيانات",
    responsibleRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD],
  },
  {
    stage: CaseStage.DRAFTING,
    label: "تحرير المذكرة",
    description: "المحامي يحرر المذكرة ويجهزها للمراجعة",
    responsibleRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD],
  },
  {
    stage: CaseStage.REVIEW_COMMITTEE,
    label: "إحالة للجنة المراجعة",
    description: "لجنة المراجعة تقيّم المذكرة وتصدر قرارها",
    responsibleRoles: [UserRole.CASES_REVIEW_HEAD, UserRole.BRANCH_MANAGER],
  },
  {
    stage: CaseStage.AMENDMENTS,
    label: "الأخذ بالملاحظات",
    description: "المحامي يعدّل بناءً على ملاحظات اللجنة",
    responsibleRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD],
  },
  {
    stage: CaseStage.SUBMITTED,
    label: "تم الرفع للدائرة",
    description: "القضية معتمدة ومرفوعة للدائرة القضائية",
    responsibleRoles: [UserRole.ADMIN_SUPPORT, UserRole.BRANCH_MANAGER],
  },
  {
    stage: CaseStage.CLOSED,
    label: "مقفلة",
    description: "القضية مقفلة نهائياً",
    responsibleRoles: [UserRole.BRANCH_MANAGER],
  },
];

const CONSULTATION_STAGE_INFO: StageInfo[] = [
  {
    stage: ConsultationStatus.RECEIVED,
    label: "استلام",
    description: "تقييم إداري أولي للاستشارة",
    responsibleRoles: [UserRole.ADMIN_SUPPORT, UserRole.BRANCH_MANAGER],
  },
  {
    stage: ConsultationStatus.STUDY,
    label: "دراسة",
    description: "رئيس القسم يحدد الموظف ويُسند المهمة",
    responsibleRoles: [UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
  },
  {
    stage: ConsultationStatus.PREPARING_RESPONSE,
    label: "إعداد الرد",
    description: "الموظف يعمل على إعداد الرد",
    responsibleRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD],
  },
  {
    stage: ConsultationStatus.REVIEW_COMMITTEE,
    label: "لجنة المراجعة",
    description: "لجنة مراجعة الاستشارات تقيّم الرد",
    responsibleRoles: [UserRole.CONSULTATIONS_REVIEW_HEAD, UserRole.BRANCH_MANAGER],
  },
  {
    stage: ConsultationStatus.AMENDMENTS,
    label: "تعديلات",
    description: "الموظف يعدّل بناءً على ملاحظات اللجنة",
    responsibleRoles: [UserRole.EMPLOYEE, UserRole.DEPARTMENT_HEAD],
  },
  {
    stage: ConsultationStatus.READY,
    label: "جاهز",
    description: "الاستشارة معتمدة وجاهزة للتسليم",
    responsibleRoles: [UserRole.ADMIN_SUPPORT, UserRole.DEPARTMENT_HEAD, UserRole.BRANCH_MANAGER],
  },
  {
    stage: ConsultationStatus.DELIVERED,
    label: "مسلّم",
    description: "تم تسليم الاستشارة للعميل",
    responsibleRoles: [UserRole.ADMIN_SUPPORT, UserRole.BRANCH_MANAGER],
  },
  {
    stage: ConsultationStatus.CLOSED,
    label: "مغلق",
    description: "الاستشارة مقفلة نهائياً",
    responsibleRoles: [UserRole.BRANCH_MANAGER],
  },
];

function isUserAssignedToCase(userId: string, caseData: any): boolean {
  if (!caseData || !userId) return false;
  if (caseData.primaryLawyerId === userId || caseData.responsibleLawyerId === userId) return true;
  if (Array.isArray(caseData.assignedLawyers) && caseData.assignedLawyers.includes(userId)) return true;
  return false;
}

function checkRoleOrAssignment(rule: TransitionRule, userRole: UserRoleType, userId?: string, caseData?: any): boolean {
  if (rule.allowedRoles.includes(userRole)) return true;
  if (rule.requiresAssignment && userId && caseData && isUserAssignedToCase(userId, caseData)) return true;
  return false;
}

export function validateCaseTransition(
  currentStage: CaseStageValue,
  targetStage: CaseStageValue,
  userRole: UserRoleType,
  _userDepartmentId?: string | null,
  _caseDepartmentId?: string | null,
  userId?: string,
  caseData?: any,
): TransitionValidation {
  const normalizedCurrent = normalizeCaseStage(currentStage);

  if (normalizedCurrent === targetStage) {
    return { allowed: false, reason: "القضية في نفس المرحلة المطلوبة" };
  }

  const allRules = [...CASE_TRANSITIONS, ...CASE_BACKWARD_TRANSITIONS];
  const rule = allRules.find(r => r.from === normalizedCurrent && r.to === targetStage);

  if (!rule) {
    return { allowed: false, reason: "لا يمكن الانتقال من هذه المرحلة إلى المرحلة المطلوبة" };
  }

  if (!checkRoleOrAssignment(rule, userRole, userId, caseData)) {
    return { allowed: false, reason: "ليس لديك صلاحية لتنفيذ هذا الانتقال" };
  }

  return { allowed: true, rule };
}

export function validateCaseForward(
  currentStage: CaseStageValue,
  userRole: UserRoleType,
  userId?: string,
  caseData?: any,
): TransitionValidation {
  const normalizedCurrent = normalizeCaseStage(currentStage);
  const currentIndex = CaseStagesOrder.indexOf(normalizedCurrent);

  if (currentIndex === -1 || currentIndex >= CaseStagesOrder.length - 1) {
    return { allowed: false, reason: "لا يمكن التقدم من هذه المرحلة" };
  }

  const nextStage = CaseStagesOrder[currentIndex + 1];
  const rule = CASE_TRANSITIONS.find(r => r.from === normalizedCurrent && r.to === nextStage);

  if (!rule) {
    return { allowed: false, reason: "لا توجد قاعدة انتقال للمرحلة التالية" };
  }

  if (!checkRoleOrAssignment(rule, userRole, userId, caseData)) {
    return { allowed: false, reason: "ليس لديك صلاحية لنقل القضية للمرحلة التالية" };
  }

  return { allowed: true, rule };
}

export function validateCaseBackward(
  currentStage: CaseStageValue,
  userRole: UserRoleType,
  userId?: string,
  caseData?: any,
): TransitionValidation {
  const normalizedCurrent = normalizeCaseStage(currentStage);
  const currentIndex = CaseStagesOrder.indexOf(normalizedCurrent);

  if (currentIndex <= 0) {
    return { allowed: false, reason: "لا يمكن الرجوع من هذه المرحلة" };
  }

  const prevStage = CaseStagesOrder[currentIndex - 1];
  const rule = CASE_BACKWARD_TRANSITIONS.find(r => r.from === normalizedCurrent && r.to === prevStage);

  if (!rule) {
    return { allowed: false, reason: "لا توجد قاعدة رجوع لهذه المرحلة" };
  }

  if (!checkRoleOrAssignment(rule, userRole, userId, caseData)) {
    return { allowed: false, reason: "ليس لديك صلاحية لإرجاع القضية للمرحلة السابقة" };
  }

  return { allowed: true, rule };
}

export function validateConsultationTransition(
  currentStatus: ConsultationStatusValue,
  targetStatus: ConsultationStatusValue,
  userRole: UserRoleType,
  userId?: string,
  consultationData?: any,
): TransitionValidation {
  if (currentStatus === targetStatus) {
    return { allowed: false, reason: "الاستشارة في نفس الحالة المطلوبة" };
  }

  const allRules = [...CONSULTATION_TRANSITIONS, ...CONSULTATION_BACKWARD_TRANSITIONS];
  const rule = allRules.find(r => r.from === currentStatus && r.to === targetStatus);

  if (!rule) {
    return { allowed: false, reason: "لا يمكن الانتقال من هذه الحالة إلى الحالة المطلوبة" };
  }

  if (rule.allowedRoles.includes(userRole)) {
    return { allowed: true, rule };
  }

  if (rule.requiresAssignment && userId && consultationData) {
    if (consultationData.assignedTo === userId) {
      return { allowed: true, rule };
    }
  }

  return { allowed: false, reason: "ليس لديك صلاحية لتنفيذ هذا الانتقال" };
}

export function getAvailableCaseTransitions(
  currentStage: CaseStageValue,
  userRole: UserRoleType,
  userId?: string,
  caseData?: any,
): TransitionRule[] {
  const normalizedCurrent = normalizeCaseStage(currentStage);
  const allRules = [...CASE_TRANSITIONS, ...CASE_BACKWARD_TRANSITIONS];
  return allRules.filter(r => r.from === normalizedCurrent && checkRoleOrAssignment(r, userRole, userId, caseData));
}

export function getAvailableConsultationTransitions(
  currentStatus: ConsultationStatusValue,
  userRole: UserRoleType,
): TransitionRule[] {
  const allRules = [...CONSULTATION_TRANSITIONS, ...CONSULTATION_BACKWARD_TRANSITIONS];
  return allRules.filter(r => r.from === currentStatus && r.allowedRoles.includes(userRole));
}

export function getCaseStageInfo(stage: CaseStageValue): StageInfo | undefined {
  const normalized = normalizeCaseStage(stage);
  return CASE_STAGE_INFO.find(s => s.stage === normalized);
}

export function getConsultationStageInfo(status: ConsultationStatusValue): StageInfo | undefined {
  return CONSULTATION_STAGE_INFO.find(s => s.stage === status);
}

export function isUserResponsibleForCaseStage(
  stage: CaseStageValue,
  userRole: UserRoleType,
): boolean {
  const info = getCaseStageInfo(stage);
  return info ? info.responsibleRoles.includes(userRole) : false;
}

export function isUserResponsibleForConsultationStage(
  status: ConsultationStatusValue,
  userRole: UserRoleType,
): boolean {
  const info = getConsultationStageInfo(status);
  return info ? info.responsibleRoles.includes(userRole) : false;
}

export function createStageTransitionRecord(
  stage: string,
  userId: string,
  userName: string,
  notes: string = "",
): CaseStageTransition {
  return {
    stage: stage as CaseStageValue,
    timestamp: new Date().toISOString(),
    userId,
    userName,
    notes,
  };
}

const legacyCaseStageMap: Record<string, CaseStageValue> = {
  "رفع_للدائرة": "تم_الرفع_للدائرة" as CaseStageValue,
};

export function normalizeCaseStage(stage: CaseStageValue): CaseStageValue {
  return (legacyCaseStageMap[stage] || stage) as CaseStageValue;
}

export function canUserAdvanceCaseStage(
  currentStage: CaseStageValue,
  userRole: UserRoleType,
  isAssignedLawyer: boolean = false,
  isDepartmentHead: boolean = false,
): boolean {
  const normalizedCurrent = normalizeCaseStage(currentStage);

  const forwardRules = CASE_TRANSITIONS.filter(r => r.from === normalizedCurrent);
  if (forwardRules.length === 0) return false;

  for (const rule of forwardRules) {
    if (rule.allowedRoles.includes(userRole)) return true;
  }

  if (isAssignedLawyer && [CaseStage.STUDY, CaseStage.DRAFTING, CaseStage.AMENDMENTS].includes(normalizedCurrent as any)) {
    return true;
  }

  if (isDepartmentHead && [CaseStage.DATA_COMPLETION, CaseStage.STUDY, CaseStage.DRAFTING, CaseStage.AMENDMENTS].includes(normalizedCurrent as any)) {
    return true;
  }

  return false;
}

export function canUserAdvanceConsultation(
  currentStatus: ConsultationStatusValue,
  userRole: UserRoleType,
  isAssignedEmployee: boolean = false,
): boolean {
  const forwardRules = CONSULTATION_TRANSITIONS.filter(r => r.from === currentStatus);
  if (forwardRules.length === 0) return false;

  for (const rule of forwardRules) {
    if (rule.allowedRoles.includes(userRole)) return true;
  }

  if (isAssignedEmployee && [ConsultationStatus.PREPARING_RESPONSE, ConsultationStatus.AMENDMENTS].includes(currentStatus as any)) {
    return true;
  }

  return false;
}

export function getReviewDecisionTransitions(
  entityType: "case" | "consultation",
  userRole: UserRoleType,
): { approve: TransitionRule | undefined; reject: TransitionRule | undefined } {
  if (entityType === "case") {
    const reviewStage = CaseStage.REVIEW_COMMITTEE;
    const rules = CASE_TRANSITIONS.filter(r => r.from === reviewStage && r.allowedRoles.includes(userRole));
    return {
      approve: rules.find(r => r.to === CaseStage.SUBMITTED),
      reject: rules.find(r => r.to === CaseStage.AMENDMENTS),
    };
  } else {
    const reviewStatus = ConsultationStatus.REVIEW_COMMITTEE;
    const rules = CONSULTATION_TRANSITIONS.filter(r => r.from === reviewStatus && r.allowedRoles.includes(userRole));
    return {
      approve: rules.find(r => r.to === ConsultationStatus.READY),
      reject: rules.find(r => r.to === ConsultationStatus.AMENDMENTS),
    };
  }
}

export function getReturnCount(stageHistory: CaseStageTransition[], returnStage: string): number {
  return stageHistory.filter(h => h.stage === returnStage).length;
}

export function shouldEscalateToManager(stageHistory: CaseStageTransition[]): boolean {
  const returnCount = getReturnCount(stageHistory, CaseStage.AMENDMENTS);
  return returnCount >= 3;
}

export { CASE_TRANSITIONS, CASE_BACKWARD_TRANSITIONS, CONSULTATION_TRANSITIONS, CONSULTATION_BACKWARD_TRANSITIONS, CASE_STAGE_INFO, CONSULTATION_STAGE_INFO };
