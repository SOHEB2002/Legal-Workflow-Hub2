import { z } from "zod";

// ==================== الأدوار (Roles) ====================
export const UserRole = {
  BRANCH_MANAGER: "branch_manager",           // مدير الفرع
  CASES_REVIEW_HEAD: "cases_review_head",     // رئيس لجنة مراجعة القضايا
  CONSULTATIONS_REVIEW_HEAD: "consultations_review_head", // رئيس لجنة مراجعة الاستشارات
  DEPARTMENT_HEAD: "department_head",         // رئيس القسم
  ADMIN_SUPPORT: "admin_support",             // الدعم الإداري
  EMPLOYEE: "employee",                       // موظف قسم
  HR: "hr",                                   // موظف الموارد البشرية
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

export const UserRoleLabels: Record<UserRoleType, string> = {
  branch_manager: "مدير الفرع",
  cases_review_head: "رئيس لجنة مراجعة القضايا",
  consultations_review_head: "رئيس لجنة مراجعة الاستشارات",
  department_head: "رئيس القسم",
  admin_support: "الدعم الإداري",
  employee: "موظف",
  hr: "الموارد البشرية",
};

// ==================== الأقسام (Departments) ====================
export const Department = {
  GENERAL: "عام",
  COMMERCIAL: "تجاري",
  LABOR: "عمالي",
  ADMINISTRATIVE: "إداري",
} as const;

export type DepartmentType = typeof Department[keyof typeof Department];

// ==================== أنواع القضايا ====================
export const CaseType = {
  GENERAL: "عام",
  COMMERCIAL: "تجاري",
  LABOR: "عمالي",
  ADMINISTRATIVE: "إداري",
} as const;

export type CaseTypeValue = typeof CaseType[keyof typeof CaseType];

// ==================== حالات القضايا ====================
export const CaseStatus = {
  RECEIVED: "استلام",
  DATA_COMPLETION: "استكمال_البيانات",
  STUDY: "دراسة",
  DRAFTING: "تحرير_المذكرة",
  REVIEW_COMMITTEE: "لجنة_المراجعة",
  AMENDMENTS: "تعديلات",
  READY_TO_SUBMIT: "جاهز_للرفع",
  SUBMITTED: "مرفوع",
  CLOSED: "مغلق",
} as const;

export type CaseStatusValue = typeof CaseStatus[keyof typeof CaseStatus];

export const CaseStatusLabels: Record<CaseStatusValue, string> = {
  "استلام": "استلام",
  "استكمال_البيانات": "استكمال البيانات",
  "دراسة": "دراسة",
  "تحرير_المذكرة": "تحرير المذكرة",
  "لجنة_المراجعة": "لجنة المراجعة",
  "تعديلات": "تعديلات",
  "جاهز_للرفع": "جاهز للرفع",
  "مرفوع": "مرفوع",
  "مغلق": "مغلق",
};

// ==================== مراحل القضية (7 مراحل للشريط) ====================
export const CaseStage = {
  RECEIVED: "استلام",
  DATA_COMPLETION: "استكمال_البيانات",
  STUDY: "دراسة",
  DRAFTING: "تحرير_المذكرة",
  REVIEW_COMMITTEE: "إحالة_للجنة_المراجعة",
  AMENDMENTS: "الأخذ_بالملاحظات",
  SUBMITTED: "رفع_للدائرة",
} as const;

export type CaseStageValue = typeof CaseStage[keyof typeof CaseStage];

export const CaseStageLabels: Record<CaseStageValue, string> = {
  "استلام": "استلام",
  "استكمال_البيانات": "استكمال البيانات",
  "دراسة": "دراسة",
  "تحرير_المذكرة": "تحرير المذكرة",
  "إحالة_للجنة_المراجعة": "إحالة للجنة المراجعة",
  "الأخذ_بالملاحظات": "الأخذ بالملاحظات",
  "رفع_للدائرة": "رفع للدائرة",
};

export const CaseStagesOrder: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "دراسة",
  "تحرير_المذكرة",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "رفع_للدائرة",
];

// سجل انتقال المراحل
export interface CaseStageTransition {
  stage: CaseStageValue;
  timestamp: string;
  userId: string;
  userName: string;
  notes: string;
}

// ==================== الأولوية ====================
export const Priority = {
  URGENT: "عاجل",
  HIGH: "عالي",
  MEDIUM: "متوسط",
  LOW: "منخفض",
} as const;

export type PriorityType = typeof Priority[keyof typeof Priority];

// ==================== قرارات المراجعة ====================
export const ReviewDecision = {
  APPROVED: "approved",
  REJECTED: "rejected",
  PARTIAL: "partial",
} as const;

export type ReviewDecisionType = typeof ReviewDecision[keyof typeof ReviewDecision];

export const ReviewDecisionLabels: Record<ReviewDecisionType, string> = {
  approved: "معتمد",
  rejected: "مرفوض",
  partial: "اعتماد جزئي",
};

// ==================== أنواع العملاء ====================
export const ClientType = {
  INDIVIDUAL: "فرد",
  COMPANY: "شركة",
} as const;

export type ClientTypeValue = typeof ClientType[keyof typeof ClientType];

// ==================== حالات الاستشارات ====================
export const ConsultationStatus = {
  RECEIVED: "استلام",
  STUDY: "دراسة",
  PREPARING_RESPONSE: "إعداد_الرد",
  REVIEW_COMMITTEE: "لجنة_المراجعة",
  AMENDMENTS: "تعديلات",
  READY: "جاهز",
  DELIVERED: "مسلّم",
  CLOSED: "مغلق",
} as const;

export type ConsultationStatusValue = typeof ConsultationStatus[keyof typeof ConsultationStatus];

export const ConsultationStatusLabels: Record<ConsultationStatusValue, string> = {
  "استلام": "استلام",
  "دراسة": "دراسة",
  "إعداد_الرد": "إعداد الرد",
  "لجنة_المراجعة": "لجنة المراجعة",
  "تعديلات": "تعديلات",
  "جاهز": "جاهز",
  "مسلّم": "مسلّم",
  "مغلق": "مغلق",
};

// ==================== نوع تسليم الاستشارة ====================
export const DeliveryType = {
  WRITTEN: "مكتوبة",
  VERBAL: "شفهية",
} as const;

export type DeliveryTypeValue = typeof DeliveryType[keyof typeof DeliveryType];

// ==================== حالات الجلسات ====================
export const HearingStatus = {
  UPCOMING: "قادمة",
  COMPLETED: "تمت",
  POSTPONED: "مؤجلة",
  CANCELLED: "ملغية",
} as const;

export type HearingStatusValue = typeof HearingStatus[keyof typeof HearingStatus];

// ==================== نتائج الجلسات ====================
export const HearingResult = {
  POSTPONEMENT: "تأجيل",
  JUDGMENT: "حكم",
  SETTLEMENT: "صلح",
  DISMISSAL: "شطب",
  OTHER: "أخرى",
} as const;

export type HearingResultValue = typeof HearingResult[keyof typeof HearingResult];

// ==================== حالات المهام الميدانية ====================
export const FieldTaskStatus = {
  PENDING: "قيد_الانتظار",
  IN_PROGRESS: "قيد_التنفيذ",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
} as const;

export type FieldTaskStatusValue = typeof FieldTaskStatus[keyof typeof FieldTaskStatus];

export const FieldTaskStatusLabels: Record<FieldTaskStatusValue, string> = {
  "قيد_الانتظار": "قيد الانتظار",
  "قيد_التنفيذ": "قيد التنفيذ",
  "مكتمل": "مكتمل",
  "ملغي": "ملغي",
};

// ==================== أنواع المهام الميدانية ====================
export const FieldTaskType = {
  FIELD_REVIEW: "مراجعة_ميدانية",
  DOCUMENT_DELIVERY: "تسليم_مستندات",
  CLIENT_VISIT: "زيارة_عميل",
  COURT_FOLLOW_UP: "متابعة_محكمة",
  OTHER: "أخرى",
} as const;

export type FieldTaskTypeValue = typeof FieldTaskType[keyof typeof FieldTaskType];

export const FieldTaskTypeLabels: Record<FieldTaskTypeValue, string> = {
  "مراجعة_ميدانية": "مراجعة ميدانية",
  "تسليم_مستندات": "تسليم مستندات",
  "زيارة_عميل": "زيارة عميل",
  "متابعة_محكمة": "متابعة محكمة",
  "أخرى": "أخرى",
};

// ==================== أنواع المحاكم ====================
export const CourtType = {
  GENERAL: "المحكمة العامة",
  COMMERCIAL: "المحكمة التجارية",
  LABOR: "المحكمة العمالية",
  ADMINISTRATIVE: "المحكمة الإدارية",
  CRIMINAL: "المحكمة الجزائية",
  OTHER: "أخرى",
} as const;

export type CourtTypeValue = typeof CourtType[keyof typeof CourtType];

// ==================== أنواع المستندات ====================
export const DocumentType = {
  ID: "هوية",
  POWER_OF_ATTORNEY: "وكالة",
  CONTRACT: "عقد",
  MEMO: "مذكرة",
  JUDGMENT: "حكم",
  OTHER: "مستند_آخر",
} as const;

export type DocumentTypeValue = typeof DocumentType[keyof typeof DocumentType];

// ==================== Interfaces ====================

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  role: UserRoleType;
  departmentId: string | null;
  isActive: boolean;
  canBeAssignedCases: boolean;
  canBeAssignedConsultations: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  clientType: ClientTypeValue;
  individualName: string | null;
  nationalId: string | null;
  phone: string;
  companyName: string | null;
  commercialRegister: string | null;
  representativeName: string | null;
  representativeTitle: string | null;
  companyPhone: string | null;
  email: string;
  address: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LawCase {
  id: string;
  caseNumber: string;
  clientId: string;
  caseType: CaseTypeValue;
  status: CaseStatusValue;
  currentStage: CaseStageValue;
  stageHistory: CaseStageTransition[];
  departmentId: string;
  assignedLawyers: string[];
  primaryLawyerId: string | null;
  responsibleLawyerId: string | null;
  courtName: string;
  courtCaseNumber: string;
  najizNumber: string;
  judgeName: string;
  circuitNumber: string;
  opponentName: string;
  opponentLawyer: string;
  opponentPhone: string;
  opponentNotes: string;
  whatsappGroupLink: string;
  googleDriveFolderId: string;
  reviewNotes: string;
  reviewDecision: ReviewDecisionType | null;
  reviewActionTaken: string | null;
  priority: PriorityType;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface CaseComment {
  id: string;
  caseId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface Consultation {
  id: string;
  consultationNumber: string;
  clientId: string;
  consultationType: CaseTypeValue;
  deliveryType: DeliveryTypeValue;
  status: ConsultationStatusValue;
  departmentId: string;
  assignedTo: string | null;
  questionSummary: string;
  response: string;
  convertedToCaseId: string | null;
  whatsappGroupLink: string;
  googleDriveFolderId: string;
  reviewNotes: string;
  reviewDecision: ReviewDecisionType | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface Hearing {
  id: string;
  caseId: string;
  hearingDate: string;
  hearingTime: string;
  courtName: CourtTypeValue;
  courtNameOther: string | null;
  courtRoom: string;
  status: HearingStatusValue;
  result: HearingResultValue | null;
  resultDetails: string;
  reminderSent24h: boolean;
  reminderSent1h: boolean;
  googleCalendarEventId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  entityType: "case" | "consultation" | "client";
  entityId: string;
  documentType: DocumentTypeValue;
  fileName: string;
  googleDriveFileId: string;
  googleDriveLink: string;
  uploadedBy: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete" | "status_change" | "assign" | "review";
  actionBy: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  fieldChanged: string | null;
  notes: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: "hearing_reminder" | "assignment" | "review_needed" | "review_result";
  title: string;
  message: string;
  link: string;
  isRead: boolean;
  sentVia: string[];
  createdAt: string;
}

export interface DepartmentInfo {
  id: string;
  name: DepartmentType;
  headId: string | null;
  createdAt: string;
}

export interface FieldTask {
  id: string;
  title: string;
  description: string;
  taskType: FieldTaskTypeValue;
  caseId: string | null;
  consultationId: string | null;
  assignedTo: string;
  assignedBy: string;
  status: FieldTaskStatusValue;
  priority: PriorityType;
  dueDate: string;
  completedAt: string | null;
  completionNotes: string;
  proofDescription: string;
  proofFileLink: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== Zod Schemas ====================

export const insertUserSchema = z.object({
  username: z.string().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
  password: z.string().min(4, "كلمة المرور يجب أن تكون 4 أحرف على الأقل"),
  name: z.string().min(2, "الاسم مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صحيح").optional().default(""),
  phone: z.string().optional().default(""),
  role: z.enum([
    "branch_manager",
    "cases_review_head",
    "consultations_review_head",
    "department_head",
    "admin_support",
    "employee",
    "hr",
  ]),
  departmentId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  canBeAssignedCases: z.boolean().default(false),
  canBeAssignedConsultations: z.boolean().default(false),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

export const insertClientSchema = z.object({
  clientType: z.enum(["فرد", "شركة"]),
  individualName: z.string().nullable().optional(),
  nationalId: z.string().nullable().optional(),
  phone: z.string().min(1, "رقم الهاتف مطلوب"),
  companyName: z.string().nullable().optional(),
  commercialRegister: z.string().nullable().optional(),
  representativeName: z.string().nullable().optional(),
  representativeTitle: z.string().nullable().optional(),
  companyPhone: z.string().nullable().optional(),
  email: z.string().email().optional().default(""),
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export type InsertClient = z.infer<typeof insertClientSchema>;

export const insertCaseSchema = z.object({
  clientId: z.string().min(1, "العميل مطلوب"),
  caseType: z.enum(["عام", "تجاري", "عمالي", "إداري"]),
  departmentId: z.string().optional(),
  priority: z.enum(["عاجل", "عالي", "متوسط", "منخفض"]).default("متوسط"),
  courtName: z.string().optional().default(""),
  courtCaseNumber: z.string().optional().default(""),
  najizNumber: z.string().optional().default(""),
  judgeName: z.string().optional().default(""),
  opponentName: z.string().optional().default(""),
  opponentLawyer: z.string().optional().default(""),
  opponentPhone: z.string().optional().default(""),
  opponentNotes: z.string().optional().default(""),
  whatsappGroupLink: z.string().optional().default(""),
  googleDriveFolderId: z.string().optional().default(""),
});

export type InsertCase = z.infer<typeof insertCaseSchema>;

export const insertConsultationSchema = z.object({
  clientId: z.string().min(1, "العميل مطلوب"),
  consultationType: z.enum(["عام", "تجاري", "عمالي", "إداري"]),
  deliveryType: z.enum(["مكتوبة", "شفهية"]),
  departmentId: z.string().optional(),
  questionSummary: z.string().min(1, "ملخص السؤال مطلوب"),
  whatsappGroupLink: z.string().optional().default(""),
  googleDriveFolderId: z.string().optional().default(""),
});

export type InsertConsultation = z.infer<typeof insertConsultationSchema>;

export const insertHearingSchema = z.object({
  caseId: z.string().min(1, "القضية مطلوبة"),
  hearingDate: z.string().min(1, "تاريخ الجلسة مطلوب"),
  hearingTime: z.string().min(1, "وقت الجلسة مطلوب"),
  courtName: z.enum([
    "المحكمة العامة",
    "المحكمة التجارية",
    "المحكمة العمالية",
    "المحكمة الإدارية",
    "المحكمة الجزائية",
    "أخرى",
  ]),
  courtNameOther: z.string().nullable().optional(),
  courtRoom: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export type InsertHearing = z.infer<typeof insertHearingSchema>;

export const insertFieldTaskSchema = z.object({
  title: z.string().min(1, "عنوان المهمة مطلوب"),
  description: z.string().optional().default(""),
  taskType: z.enum(["مراجعة_ميدانية", "تسليم_مستندات", "زيارة_عميل", "متابعة_محكمة", "أخرى"]),
  caseId: z.string().nullable().optional(),
  consultationId: z.string().nullable().optional(),
  assignedTo: z.string().min(1, "الموظف المكلف مطلوب"),
  priority: z.enum(["عاجل", "عالي", "متوسط", "منخفض"]).default("متوسط"),
  dueDate: z.string().min(1, "تاريخ الاستحقاق مطلوب"),
});

export type InsertFieldTask = z.infer<typeof insertFieldTaskSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ==================== Permission Helpers ====================

export function canManageAllCases(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head"].includes(role);
}

export function canManageAllConsultations(role: UserRoleType): boolean {
  return ["branch_manager", "consultations_review_head"].includes(role);
}

export function canManageDepartment(role: UserRoleType): boolean {
  return ["branch_manager", "department_head"].includes(role);
}

export function canAddCasesAndConsultations(role: UserRoleType): boolean {
  return ["branch_manager", "admin_support"].includes(role);
}

export function canReviewCases(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head"].includes(role);
}

export function canReviewConsultations(role: UserRoleType): boolean {
  return ["branch_manager", "consultations_review_head"].includes(role);
}

export function canManageUsers(role: UserRoleType): boolean {
  return role === "branch_manager";
}

export function canAccessHR(role: UserRoleType): boolean {
  return ["branch_manager", "hr"].includes(role);
}

export function canCloseCases(role: UserRoleType): boolean {
  return ["branch_manager", "admin_support"].includes(role);
}

export function canAssignFieldTasks(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head", "consultations_review_head", "department_head"].includes(role);
}

export function canMoveToPreviousStage(role: UserRoleType): boolean {
  return role === "branch_manager";
}
