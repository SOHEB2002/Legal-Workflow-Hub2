import { z } from "zod";
import { pgTable, text, varchar, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ==================== Drizzle Tables ====================

export const users = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).default(""),
  phone: varchar("phone", { length: 50 }).default(""),
  role: varchar("role", { length: 50 }).notNull(),
  departmentId: varchar("department_id", { length: 255 }),
  isActive: boolean("is_active").default(true),
  canBeAssignedCases: boolean("can_be_assigned_cases").default(false),
  canBeAssignedConsultations: boolean("can_be_assigned_consultations").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clients = pgTable("clients", {
  id: varchar("id", { length: 255 }).primaryKey(),
  clientType: varchar("client_type", { length: 50 }).notNull(),
  individualName: varchar("individual_name", { length: 255 }),
  nationalId: varchar("national_id", { length: 50 }),
  phone: varchar("phone", { length: 50 }).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  commercialRegister: varchar("commercial_register", { length: 50 }),
  representativeName: varchar("representative_name", { length: 255 }),
  representativeTitle: varchar("representative_title", { length: 255 }),
  companyPhone: varchar("company_phone", { length: 50 }),
  email: varchar("email", { length: 255 }).default(""),
  address: text("address").default(""),
  notes: text("notes").default(""),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lawCases = pgTable("law_cases", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseNumber: varchar("case_number", { length: 50 }).notNull().unique(),
  clientId: varchar("client_id", { length: 255 }).default(""),
  caseType: varchar("case_type", { length: 50 }).notNull(),
  caseTypeOther: varchar("case_type_other", { length: 255 }).default(""),
  departmentOther: varchar("department_other", { length: 255 }).default(""),
  status: varchar("status", { length: 50 }).notNull(),
  currentStage: varchar("current_stage", { length: 50 }).notNull(),
  stageHistory: jsonb("stage_history").default([]),
  departmentId: varchar("department_id", { length: 255 }).notNull(),
  assignedLawyers: jsonb("assigned_lawyers").default([]),
  primaryLawyerId: varchar("primary_lawyer_id", { length: 255 }),
  responsibleLawyerId: varchar("responsible_lawyer_id", { length: 255 }),
  courtName: varchar("court_name", { length: 255 }).default(""),
  courtCaseNumber: varchar("court_case_number", { length: 100 }).default(""),
  najizNumber: varchar("najiz_number", { length: 100 }).default(""),
  judgeName: varchar("judge_name", { length: 255 }).default(""),
  circuitNumber: varchar("circuit_number", { length: 100 }).default(""),
  opponentName: varchar("opponent_name", { length: 255 }).default(""),
  opponentLawyer: varchar("opponent_lawyer", { length: 255 }).default(""),
  opponentPhone: varchar("opponent_phone", { length: 50 }).default(""),
  opponentNotes: text("opponent_notes").default(""),
  whatsappGroupLink: varchar("whatsapp_group_link", { length: 500 }).default(""),
  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }).default(""),
  reviewNotes: text("review_notes").default(""),
  reviewDecision: varchar("review_decision", { length: 50 }),
  reviewActionTaken: text("review_action_taken"),
  priority: varchar("priority", { length: 50 }).notNull().default("متوسط"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const consultations = pgTable("consultations", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationNumber: varchar("consultation_number", { length: 50 }).notNull().unique(),
  clientId: varchar("client_id", { length: 255 }).notNull(),
  consultationType: varchar("consultation_type", { length: 50 }).notNull(),
  deliveryType: varchar("delivery_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  departmentId: varchar("department_id", { length: 255 }).notNull(),
  assignedTo: varchar("assigned_to", { length: 255 }),
  questionSummary: text("question_summary").notNull(),
  response: text("response").default(""),
  convertedToCaseId: varchar("converted_to_case_id", { length: 255 }),
  whatsappGroupLink: varchar("whatsapp_group_link", { length: 500 }).default(""),
  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }).default(""),
  reviewNotes: text("review_notes").default(""),
  reviewDecision: varchar("review_decision", { length: 50 }),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const hearings = pgTable("hearings", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  hearingDate: varchar("hearing_date", { length: 50 }).notNull(),
  hearingTime: varchar("hearing_time", { length: 50 }).notNull(),
  courtName: varchar("court_name", { length: 100 }).notNull(),
  courtNameOther: varchar("court_name_other", { length: 255 }),
  courtRoom: varchar("court_room", { length: 100 }).default(""),
  status: varchar("status", { length: 50 }).notNull(),
  result: varchar("result", { length: 50 }),
  resultDetails: text("result_details").default(""),
  judgmentSide: varchar("judgment_side", { length: 50 }),
  judgmentFinal: boolean("judgment_final"),
  objectionFeasible: boolean("objection_feasible"),
  objectionDeadline: varchar("objection_deadline", { length: 50 }),
  objectionStatus: varchar("objection_status", { length: 50 }),
  nextHearingDate: varchar("next_hearing_date", { length: 50 }),
  nextHearingTime: varchar("next_hearing_time", { length: 50 }),
  responseRequired: boolean("response_required").default(false),
  hearingReport: text("hearing_report").default(""),
  recommendations: text("recommendations").default(""),
  nextSteps: text("next_steps").default(""),
  contactCompleted: boolean("contact_completed").default(false),
  reportCompleted: boolean("report_completed").default(false),
  adminTasksCreated: boolean("admin_tasks_created").default(false),
  opponentMemos: text("opponent_memos").default(""),
  hearingMinutes: text("hearing_minutes").default(""),
  reminderSent24h: boolean("reminder_sent_24h").default(false),
  reminderSent1h: boolean("reminder_sent_1h").default(false),
  googleCalendarEventId: varchar("google_calendar_event_id", { length: 255 }),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const fieldTasks = pgTable("field_tasks", {
  id: varchar("id", { length: 255 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").default(""),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  caseId: varchar("case_id", { length: 255 }),
  consultationId: varchar("consultation_id", { length: 255 }),
  assignedTo: varchar("assigned_to", { length: 255 }).notNull(),
  assignedBy: varchar("assigned_by", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  priority: varchar("priority", { length: 50 }).notNull().default("متوسط"),
  dueDate: varchar("due_date", { length: 50 }).notNull(),
  completedAt: timestamp("completed_at"),
  completionNotes: text("completion_notes").default(""),
  proofDescription: text("proof_description").default(""),
  proofFileLink: varchar("proof_file_link", { length: 500 }).default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contactLogs = pgTable("contact_logs", {
  id: varchar("id", { length: 255 }).primaryKey(),
  clientId: varchar("client_id", { length: 255 }).notNull(),
  contactType: varchar("contact_type", { length: 50 }).notNull(),
  contactDate: varchar("contact_date", { length: 50 }).notNull(),
  nextFollowUpDate: varchar("next_follow_up_date", { length: 50 }),
  followUpStatus: varchar("follow_up_status", { length: 50 }).notNull(),
  notes: text("notes").default(""),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 255 }).primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  priority: varchar("priority", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  senderId: varchar("sender_id", { length: 255 }).notNull(),
  senderName: varchar("sender_name", { length: 255 }).notNull(),
  recipientId: varchar("recipient_id", { length: 255 }).notNull(),
  recipientIds: jsonb("recipient_ids"),
  relatedType: varchar("related_type", { length: 50 }),
  relatedId: varchar("related_id", { length: 255 }),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  response: jsonb("response"),
  requiresResponse: boolean("requires_response").default(false),
  scheduledAt: timestamp("scheduled_at"),
  escalationLevel: integer("escalation_level").default(0),
  escalatedTo: varchar("escalated_to", { length: 255 }),
  autoEscalateAfterHours: integer("auto_escalate_after_hours").default(24),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const departments = pgTable("departments", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  headId: varchar("head_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// ==================== Drizzle Insert Schemas ====================

export const insertUserDbSchema = createInsertSchema(users).omit({ createdAt: true, updatedAt: true });
export const insertClientDbSchema = createInsertSchema(clients).omit({ createdAt: true, updatedAt: true });
export const insertCaseDbSchema = createInsertSchema(lawCases).omit({ createdAt: true, updatedAt: true });
export const insertConsultationDbSchema = createInsertSchema(consultations).omit({ createdAt: true, updatedAt: true });
export const insertHearingDbSchema = createInsertSchema(hearings).omit({ createdAt: true, updatedAt: true });
export const insertFieldTaskDbSchema = createInsertSchema(fieldTasks).omit({ createdAt: true, updatedAt: true });
export const insertContactLogDbSchema = createInsertSchema(contactLogs).omit({ createdAt: true, updatedAt: true });
export const insertNotificationDbSchema = createInsertSchema(notifications).omit({ createdAt: true, updatedAt: true });

// ==================== Select Types ====================

export type DbUser = typeof users.$inferSelect;
export type DbClient = typeof clients.$inferSelect;
export type DbLawCase = typeof lawCases.$inferSelect;
export type DbConsultation = typeof consultations.$inferSelect;
export type DbHearing = typeof hearings.$inferSelect;
export type DbFieldTask = typeof fieldTasks.$inferSelect;
export type DbContactLog = typeof contactLogs.$inferSelect;
export type DbNotification = typeof notifications.$inferSelect;
export type DbDepartment = typeof departments.$inferSelect;

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
  OTHER: "أخرى",
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

// ==================== جانب الحكم ====================
export const JudgmentSide = {
  FOR_US: "لصالحنا",
  AGAINST_US: "ضدنا",
} as const;

export type JudgmentSideValue = typeof JudgmentSide[keyof typeof JudgmentSide];

// ==================== حالة الاعتراض ====================
export const ObjectionStatus = {
  PENDING: "بانتظار_القرار",
  FILED: "تم_تقديم_الاعتراض",
  NOT_FILED: "لم_يتم_الاعتراض",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
} as const;

export type ObjectionStatusValue = typeof ObjectionStatus[keyof typeof ObjectionStatus];

// ==================== أنواع المهام التلقائية للجلسات ====================
export const HearingAutoTaskType = {
  PREPARE_NEXT_HEARING: "تحضير_الجلسة_القادمة",
  PREPARE_RESPONSE: "إعداد_الرد",
  FILE_OBJECTION: "تقديم_اعتراض",
  EXECUTE_JUDGMENT: "تنفيذ_الحكم",
  CONTACT_CLIENT: "التواصل_مع_العميل",
  REVIEW_JUDGMENT: "مراجعة_الحكم",
} as const;

export type HearingAutoTaskTypeValue = typeof HearingAutoTaskType[keyof typeof HearingAutoTaskType];

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
  caseTypeOther: string;
  departmentOther: string;
  status: CaseStatusValue;
  currentStage: CaseStageValue;
  stageHistory: CaseStageTransition[];
  departmentId: string;
  assignedLawyers: string[];
  primaryLawyerId: string | null;
  responsibleLawyerId: string | null;
  courtName: string;
  courtCaseNumber: string;
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
  judgmentSide: string | null;
  judgmentFinal: boolean | null;
  objectionFeasible: boolean | null;
  objectionDeadline: string | null;
  objectionStatus: string | null;
  nextHearingDate: string | null;
  nextHearingTime: string | null;
  responseRequired: boolean;
  hearingReport: string;
  recommendations: string;
  nextSteps: string;
  contactCompleted: boolean;
  reportCompleted: boolean;
  adminTasksCreated: boolean;
  opponentMemos: string;
  hearingMinutes: string;
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

// ==================== أنواع التواصل مع العملاء ====================
export const ContactType = {
  PHONE_CALL: "اتصال_هاتفي",
  WHATSAPP: "واتساب",
  EMAIL: "بريد_إلكتروني",
  IN_PERSON: "زيارة_شخصية",
  VIDEO_CALL: "اجتماع_مرئي",
  OTHER: "أخرى",
} as const;

export type ContactTypeValue = typeof ContactType[keyof typeof ContactType];

export const ContactTypeLabels: Record<ContactTypeValue, string> = {
  "اتصال_هاتفي": "اتصال هاتفي",
  "واتساب": "واتساب",
  "بريد_إلكتروني": "بريد إلكتروني",
  "زيارة_شخصية": "زيارة شخصية",
  "اجتماع_مرئي": "اجتماع مرئي",
  "أخرى": "أخرى",
};

// ==================== حالات المتابعة ====================
export const FollowUpStatus = {
  PENDING: "بانتظار_المتابعة",
  COMPLETED: "تمت_المتابعة",
  CANCELLED: "ملغية",
} as const;

export type FollowUpStatusValue = typeof FollowUpStatus[keyof typeof FollowUpStatus];

export const FollowUpStatusLabels: Record<FollowUpStatusValue, string> = {
  "بانتظار_المتابعة": "بانتظار المتابعة",
  "تمت_المتابعة": "تمت المتابعة",
  "ملغية": "ملغية",
};

// ==================== سجل التواصل ====================
export interface ContactLog {
  id: string;
  clientId: string;
  contactType: ContactTypeValue;
  contactDate: string;
  nextFollowUpDate: string | null;
  followUpStatus: FollowUpStatusValue;
  notes: string;
  createdBy: string;
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
  phone: z.string().optional().default(""),
  companyName: z.string().nullable().optional(),
  commercialRegister: z.string().nullable().optional(),
  representativeName: z.string().nullable().optional(),
  representativeTitle: z.string().nullable().optional(),
  companyPhone: z.string().nullable().optional(),
  email: z.string().email().optional().or(z.literal("")).default(""),
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export type InsertClient = z.infer<typeof insertClientSchema>;

export const insertCaseSchema = z.object({
  clientId: z.string().optional().nullable().default(""),
  caseType: z.enum(["عام", "تجاري", "عمالي", "إداري", "أخرى"]),
  caseTypeOther: z.string().optional().default(""),
  departmentId: z.string().optional(),
  departmentOther: z.string().optional().default(""),
  priority: z.enum(["عاجل", "عالي", "متوسط", "منخفض"]).default("متوسط"),
  courtName: z.string().optional().default(""),
  courtCaseNumber: z.string().optional().default(""),
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
  caseId: z.string().optional().default(""),
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

export const hearingResultSchema = z.object({
  result: z.enum(["تأجيل", "حكم", "صلح", "شطب", "أخرى"]),
  resultDetails: z.string().optional().default(""),
  judgmentSide: z.enum(["لصالحنا", "ضدنا"]).nullable().optional(),
  judgmentFinal: z.boolean().nullable().optional(),
  objectionFeasible: z.boolean().nullable().optional(),
  objectionDeadline: z.string().nullable().optional(),
  nextHearingDate: z.string().nullable().optional(),
  nextHearingTime: z.string().nullable().optional(),
  responseRequired: z.boolean().optional().default(false),
  userId: z.string().optional(),
});

export type HearingResultInput = z.infer<typeof hearingResultSchema>;

export const hearingReportSchema = z.object({
  hearingReport: z.string().min(1, "تقرير الجلسة مطلوب"),
  recommendations: z.string().optional().default(""),
  nextSteps: z.string().optional().default(""),
  contactCompleted: z.boolean().default(false),
});

export type HearingReportInput = z.infer<typeof hearingReportSchema>;

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

export function canSendNotifications(role: UserRoleType): boolean {
  return ["branch_manager", "department_head", "cases_review_head", "consultations_review_head"].includes(role);
}

export function canMoveToPreviousStage(role: UserRoleType): boolean {
  return role === "branch_manager";
}

export function canSendReminders(role: UserRoleType): boolean {
  return ["branch_manager", "admin_support", "department_head", "cases_review_head", "consultations_review_head"].includes(role);
}

// ==================== معايير المراجعة ====================
export const ReviewStandardType = {
  CONTRACT_REVIEW: "contract_review",
  LEGAL_CONSULTATION: "legal_consultation",
  SESSION_REPORT: "session_report",
  LEGAL_LETTER: "legal_letter",
} as const;

export type ReviewStandardTypeValue = typeof ReviewStandardType[keyof typeof ReviewStandardType];

export const ReviewStandardTypeLabels: Record<ReviewStandardTypeValue, string> = {
  contract_review: "مراجعة العقود",
  legal_consultation: "الاستشارات القانونية",
  session_report: "تقارير الجلسات",
  legal_letter: "الخطابات القانونية",
};

export interface ReviewCheckpoint {
  id: string;
  text: string;
  isRequired: boolean;
}

export interface ReviewCategory {
  id: string;
  name: string;
  checkpoints: ReviewCheckpoint[];
}

export interface ReviewStandard {
  id: string;
  title: string;
  type: ReviewStandardTypeValue;
  description: string;
  categories: ReviewCategory[];
  createdAt: string;
  updatedAt: string;
}

export const ReviewResultStatus = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ReviewResultStatusValue = typeof ReviewResultStatus[keyof typeof ReviewResultStatus];

export const ReviewResultStatusLabels: Record<ReviewResultStatusValue, string> = {
  draft: "مسودة",
  submitted: "مرسل",
  approved: "معتمد",
  rejected: "مرفوض",
};

export interface ReviewResult {
  id: string;
  standardId: string;
  caseId: string | null;
  consultationId: string | null;
  checkedItems: string[];
  categoryNotes: Record<string, string>;
  overallNotes: string;
  reviewerId: string;
  status: ReviewResultStatusValue;
  createdAt: string;
  updatedAt: string;
}

// ==================== نظام الإشعارات (Notifications) ====================

export const NotificationType = {
  // إشعارات سلسلة العمل
  STAGE_CHANGED: "stage_changed",
  CASE_ASSIGNED: "case_assigned",
  CONSULTATION_ASSIGNED: "consultation_assigned",
  SENT_TO_REVIEW: "sent_to_review",
  REVIEW_NOTES_ADDED: "review_notes_added",
  RETURNED_FOR_REVISION: "returned_for_revision",
  SUBMITTED_TO_COURT: "submitted_to_court",
  SENT_TO_CLIENT: "sent_to_client",
  
  // إشعارات SLA
  SLA_WARNING: "sla_warning",
  SLA_OVERDUE: "sla_overdue",
  SLA_CRITICAL: "sla_critical",
  
  // إشعارات الإرجاع
  FIRST_RETURN: "first_return",
  SECOND_RETURN: "second_return",
  THIRD_RETURN_WARNING: "third_return_warning",
  
  // إشعارات توازن العمل
  WORKLOAD_HIGH: "workload_high",
  WORKLOAD_CRITICAL: "workload_critical",
  REASSIGNMENT_SUGGESTION: "reassignment_suggestion",
  
  // إشعارات عامة
  TASK_REMINDER: "task_reminder",
  CASE_DELAY: "case_delay",
  CONSULTATION_DELAY: "consultation_delay",
  GENERAL_ALERT: "general_alert",
  DEADLINE_WARNING: "deadline_warning",
  ASSIGNMENT: "assignment",
  ESCALATION: "escalation",
  RESPONSE_REQUEST: "response_request",
  MANUAL_NOTIFICATION: "manual_notification",
  FIELD_TASK_ASSIGNED: "field_task_assigned",
} as const;

export type NotificationTypeValue = typeof NotificationType[keyof typeof NotificationType];

export const NotificationTypeLabels: Record<NotificationTypeValue, string> = {
  stage_changed: "تغيرت المرحلة",
  case_assigned: "تم تعيين قضية",
  consultation_assigned: "تم تعيين استشارة",
  sent_to_review: "أُرسل للمراجعة",
  review_notes_added: "أُضيفت ملاحظات المراجعة",
  returned_for_revision: "أُرجع للتعديل",
  submitted_to_court: "رُفع للمحكمة",
  sent_to_client: "أُرسل للعميل",
  sla_warning: "تحذير اقتراب الموعد",
  sla_overdue: "تأخر عن الموعد",
  sla_critical: "تأخر حرج",
  first_return: "إرجاع أول",
  second_return: "إرجاع ثاني",
  third_return_warning: "تحذير - إرجاع ثالث",
  workload_high: "حمل عمل مرتفع",
  workload_critical: "حمل عمل حرج",
  reassignment_suggestion: "اقتراح إعادة توزيع",
  task_reminder: "تذكير بمهمة",
  case_delay: "تأخر قضية",
  consultation_delay: "تأخر استشارة",
  general_alert: "تنبيه عام",
  deadline_warning: "تحذير موعد نهائي",
  assignment: "إسناد مهمة",
  escalation: "تصعيد",
  response_request: "طلب رد",
  manual_notification: "إشعار يدوي",
  field_task_assigned: "تم تكليف بمهمة ميدانية",
};

export const NotificationPriority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type NotificationPriorityValue = typeof NotificationPriority[keyof typeof NotificationPriority];

export const NotificationPriorityLabels: Record<NotificationPriorityValue, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};

export const NotificationStatus = {
  PENDING: "pending",
  SENT: "sent",
  READ: "read",
  RESPONDED: "responded",
  ESCALATED: "escalated",
  ARCHIVED: "archived",
} as const;

export type NotificationStatusValue = typeof NotificationStatus[keyof typeof NotificationStatus];

export const NotificationStatusLabels: Record<NotificationStatusValue, string> = {
  pending: "معلق",
  sent: "مرسل",
  read: "مقروء",
  responded: "تم الرد",
  escalated: "مصعّد",
  archived: "مؤرشف",
};

export const ResponseType = {
  COMPLETED: "completed",
  IN_PROGRESS: "in_progress",
  NEED_MORE_TIME: "need_more_time",
  NOTED: "noted",
} as const;

export type ResponseTypeValue = typeof ResponseType[keyof typeof ResponseType];

export const ResponseTypeLabels: Record<ResponseTypeValue, string> = {
  completed: "تم الإنجاز",
  in_progress: "جاري العمل",
  need_more_time: "أحتاج وقت إضافي",
  noted: "تم الاطلاع",
};

export interface NotificationResponse {
  type: ResponseTypeValue;
  message: string;
  respondedAt: string;
}

export interface Notification {
  id: string;
  type: NotificationTypeValue;
  priority: NotificationPriorityValue;
  status: NotificationStatusValue;
  title: string;
  message: string;
  senderId: string | null;
  senderName: string | null;
  isAutomatic: boolean;
  recipientId: string;
  recipientIds?: string[];
  relatedType: "case" | "consultation" | "task" | null;
  relatedId: string | null;
  relatedStage: string | null;
  workflowTriggerId: string | null;
  isRead: boolean;
  readAt: string | null;
  response: NotificationResponse | null;
  requiresResponse: boolean;
  scheduledAt: string | null;
  escalationLevel: number;
  escalatedTo: string | null;
  autoEscalateAfterHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  message: string;
  type: NotificationTypeValue;
  priority: NotificationPriorityValue;
}

export const DigestMode = {
  INSTANT: "instant",
  DAILY: "daily",
  WEEKLY: "weekly",
} as const;

export type DigestModeValue = typeof DigestMode[keyof typeof DigestMode];

export const DigestModeLabels: Record<DigestModeValue, string> = {
  instant: "فوري",
  daily: "ملخص يومي",
  weekly: "ملخص أسبوعي",
};

export interface UserNotificationPreferences {
  userId: string;
  enableSound: boolean;
  enableDesktop: boolean;
  digestMode: DigestModeValue;
  mutedTypes: NotificationTypeValue[];
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  notifyOnAssignment: boolean;
  notifyOnStageChange: boolean;
  notifyOnReviewNotes: boolean;
  notifyOnReturn: boolean;
  notifyOnSlaWarning: boolean;
}

export interface NotificationRuleConditions {
  stages?: string[];
  priorities?: string[];
  departments?: string[];
  returnCountMin?: number;
  slaPercentage?: number;
}

export interface NotificationRuleRecipients {
  assignedEmployee: boolean;
  departmentHead: boolean;
  branchManager: boolean;
  reviewCommittee: boolean;
  customUserIds: string[];
}

export interface NotificationRule {
  id: string;
  name: string;
  triggerEvent: NotificationTypeValue;
  conditions: NotificationRuleConditions;
  recipients: NotificationRuleRecipients;
  notificationPriority: NotificationPriorityValue;
  template: { title: string; message: string };
  isActive: boolean;
  autoEscalate: boolean;
  escalateAfterHours: number;
}

// ==================== Workflow System Enums ====================

export const ClientRole = {
  PLAINTIFF: "plaintiff",
  DEFENDANT: "defendant",
} as const;

export type ClientRoleValue = typeof ClientRole[keyof typeof ClientRole];

export const ClientRoleLabels: Record<ClientRoleValue, string> = {
  plaintiff: "مدعي",
  defendant: "مدعى عليه",
};

export const CasePriority = {
  URGENT: "urgent",
  NORMAL: "normal",
  LOW: "low",
} as const;

export type CasePriorityValue = typeof CasePriority[keyof typeof CasePriority];

export const CasePriorityLabels: Record<CasePriorityValue, string> = {
  urgent: "عاجل",
  normal: "عادي",
  low: "منخفض",
};

export const WorkflowCaseStage = {
  RECEIVED: "received",
  ASSIGNED_TO_DEPARTMENT: "assigned_to_department",
  COLLECTING_DOCUMENTS: "collecting_documents",
  UNDER_STUDY: "under_study",
  DRAFTING_LAWSUIT: "drafting_lawsuit",
  DRAFTING_RESPONSE: "drafting_response",
  IN_REVIEW: "in_review",
  REVIEW_NOTES_RECEIVED: "review_notes_received",
  PROCESSING_NOTES: "processing_notes",
  RETURNED_FOR_REVISION: "returned_for_revision",
  READY_TO_SUBMIT: "ready_to_submit",
  SUBMITTED_TO_COURT: "submitted_to_court",
} as const;

export type WorkflowCaseStageValue = typeof WorkflowCaseStage[keyof typeof WorkflowCaseStage];

export const WorkflowCaseStageLabels: Record<WorkflowCaseStageValue, string> = {
  received: "استلام من العميل",
  assigned_to_department: "محالة للقسم",
  collecting_documents: "استكمال المستندات",
  under_study: "دراسة القضية",
  drafting_lawsuit: "تحرير الدعوى",
  drafting_response: "كتابة المذكرة الجوابية",
  in_review: "لدى لجنة المراجعة",
  review_notes_received: "استلام ملاحظات المراجعة",
  processing_notes: "معالجة الملاحظات",
  returned_for_revision: "مُرجعة للتعديل",
  ready_to_submit: "جاهزة للرفع",
  submitted_to_court: "مرفوعة في المحكمة",
};

export const WorkflowCaseStagesOrder: WorkflowCaseStageValue[] = [
  "received",
  "assigned_to_department",
  "collecting_documents",
  "under_study",
  "drafting_lawsuit",
  "drafting_response",
  "in_review",
  "review_notes_received",
  "processing_notes",
  "returned_for_revision",
  "ready_to_submit",
  "submitted_to_court",
];

export const ConsultationStage = {
  RECEIVED: "received",
  ASSIGNED_TO_DEPARTMENT: "assigned_to_department",
  DRAFTING: "drafting",
  IN_REVIEW: "in_review",
  REVIEW_NOTES_RECEIVED: "review_notes_received",
  PROCESSING_NOTES: "processing_notes",
  RETURNED_FOR_REVISION: "returned_for_revision",
  READY_TO_SEND: "ready_to_send",
  SENT_TO_CLIENT: "sent_to_client",
} as const;

export type ConsultationStageValue = typeof ConsultationStage[keyof typeof ConsultationStage];

export const ConsultationStageLabels: Record<ConsultationStageValue, string> = {
  received: "استلام من العميل",
  assigned_to_department: "محالة للقسم",
  drafting: "تحرير الاستشارة",
  in_review: "لدى لجنة المراجعة",
  review_notes_received: "استلام ملاحظات المراجعة",
  processing_notes: "معالجة الملاحظات",
  returned_for_revision: "مُرجعة للتعديل",
  ready_to_send: "جاهزة للإرسال",
  sent_to_client: "مرسلة للعميل",
};

export const ConsultationStagesOrder: ConsultationStageValue[] = [
  "received",
  "assigned_to_department",
  "drafting",
  "in_review",
  "review_notes_received",
  "processing_notes",
  "returned_for_revision",
  "ready_to_send",
  "sent_to_client",
];

export const ReviewNoteAction = {
  FULLY_ACCEPTED: "fully_accepted",
  PARTIALLY_ACCEPTED: "partially_accepted",
  REJECTED: "rejected",
  RETURNED: "returned",
} as const;

export type ReviewNoteActionValue = typeof ReviewNoteAction[keyof typeof ReviewNoteAction];

export const ReviewNoteActionLabels: Record<ReviewNoteActionValue, string> = {
  fully_accepted: "الأخذ بها كلياً",
  partially_accepted: "الأخذ بها جزئياً",
  rejected: "عدم الأخذ بها",
  returned: "مرفوضة - تحتاج إعادة",
};

// ==================== Workflow Interfaces ====================

export interface StageSLA {
  stage: WorkflowCaseStageValue | ConsultationStageValue;
  maxDurationHours: number;
  warningBeforeHours: number;
}

export interface StageTransition {
  id: string;
  entityType: "case" | "consultation";
  entityId: string;
  fromStage: WorkflowCaseStageValue | ConsultationStageValue | null;
  toStage: WorkflowCaseStageValue | ConsultationStageValue;
  performedBy: string;
  performedByRole: string;
  notes: string;
  duration: number;
  isOverdue: boolean;
  createdAt: string;
}

export interface ReviewNote {
  id: string;
  entityType: "case" | "consultation";
  entityId: string;
  reviewerId: string;
  reviewerName: string;
  notes: string;
  action: ReviewNoteActionValue | null;
  actionJustification: string;
  acceptedItems: string[];
  rejectedItems: string[];
  returnCount: number;
  returnReason: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface EmployeeWorkload {
  id: string;
  name: string;
  department: string;
  activeCases: number;
  activeConsultations: number;
  inReviewItems: number;
  overdueItems: number;
  avgCompletionDays: number;
}

// ==================== Default SLA Settings ====================

export const DefaultSLASettings: StageSLA[] = [
  { stage: "received", maxDurationHours: 4, warningBeforeHours: 1 },
  { stage: "assigned_to_department", maxDurationHours: 4, warningBeforeHours: 1 },
  { stage: "collecting_documents", maxDurationHours: 48, warningBeforeHours: 8 },
  { stage: "under_study", maxDurationHours: 72, warningBeforeHours: 12 },
  { stage: "drafting_lawsuit", maxDurationHours: 48, warningBeforeHours: 8 },
  { stage: "drafting_response", maxDurationHours: 48, warningBeforeHours: 8 },
  { stage: "drafting", maxDurationHours: 48, warningBeforeHours: 8 },
  { stage: "in_review", maxDurationHours: 24, warningBeforeHours: 4 },
  { stage: "review_notes_received", maxDurationHours: 4, warningBeforeHours: 1 },
  { stage: "processing_notes", maxDurationHours: 24, warningBeforeHours: 4 },
  { stage: "returned_for_revision", maxDurationHours: 24, warningBeforeHours: 4 },
  { stage: "ready_to_submit", maxDurationHours: 4, warningBeforeHours: 1 },
  { stage: "ready_to_send", maxDurationHours: 4, warningBeforeHours: 1 },
];

// ==================== User Management System ====================

export const UserStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  ON_VACATION: "on_vacation",
  SUSPENDED: "suspended",
} as const;

export type UserStatusValue = typeof UserStatus[keyof typeof UserStatus];

export const UserStatusLabels: Record<UserStatusValue, string> = {
  active: "نشط",
  inactive: "غير نشط",
  on_vacation: "في إجازة",
  suspended: "موقوف",
};

export const DelegationType = {
  FULL: "full",
  PARTIAL: "partial",
} as const;

export type DelegationTypeValue = typeof DelegationType[keyof typeof DelegationType];

export const DelegationTypeLabels: Record<DelegationTypeValue, string> = {
  full: "كامل",
  partial: "جزئي",
};

export const VacationStatus = {
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type VacationStatusValue = typeof VacationStatus[keyof typeof VacationStatus];

export const VacationStatusLabels: Record<VacationStatusValue, string> = {
  scheduled: "مجدولة",
  active: "نشطة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

export interface UserVacation {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  reason: string;
  delegateTo: string | null;
  delegationType: DelegationTypeValue;
  autoReassign: boolean;
  status: VacationStatusValue;
  createdAt: string;
}

export interface Delegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  startDate: string;
  endDate: string;
  type: DelegationTypeValue;
  permissions: string[];
  reason: string;
  isActive: boolean;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  departmentId: string;
  leaderId: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserCustomPermission {
  id: string;
  userId: string;
  additionalPermissions: string[];
  restrictedPermissions: string[];
  reason: string;
  grantedBy: string;
  expiresAt: string | null;
  createdAt: string;
}

export const ActivityLogEntityType = {
  CASE: "case",
  CONSULTATION: "consultation",
  USER: "user",
  NOTIFICATION: "notification",
  SYSTEM: "system",
  TEAM: "team",
  DELEGATION: "delegation",
  VACATION: "vacation",
} as const;

export type ActivityLogEntityTypeValue = typeof ActivityLogEntityType[keyof typeof ActivityLogEntityType];

export interface UserActivityLog {
  id: string;
  userId: string;
  action: string;
  entityType: ActivityLogEntityTypeValue;
  entityId: string | null;
  details: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
}

export interface UserSession {
  id: string;
  userId: string;
  loginAt: string;
  logoutAt: string | null;
  duration: number | null;
  isActive: boolean;
}

export interface UserStats {
  activeCases: number;
  activeConsultations: number;
  completedThisMonth: number;
  avgCompletionDays: number;
  reviewAcceptanceRate: number;
  returnCount: number;
}

export interface ExtendedUser extends User {
  status: UserStatusValue;
  avatar: string | null;
  teamId: string | null;
  supervisorId: string | null;
  hireDate: string;
  lastLoginAt: string | null;
  currentVacation: UserVacation | null;
  activeDelegations: Delegation[];
  customPermissions: UserCustomPermission | null;
  stats: UserStats;
}

export const ActivityActions = {
  LOGIN: "login",
  LOGOUT: "logout",
  CREATE_CASE: "create_case",
  UPDATE_CASE: "update_case",
  DELETE_CASE: "delete_case",
  CHANGE_STAGE: "change_stage",
  SEND_TO_REVIEW: "send_to_review",
  ADD_REVIEW_NOTES: "add_review_notes",
  CREATE_CONSULTATION: "create_consultation",
  UPDATE_CONSULTATION: "update_consultation",
  DELETE_CONSULTATION: "delete_consultation",
  CREATE_USER: "create_user",
  UPDATE_USER: "update_user",
  DELETE_USER: "delete_user",
  CHANGE_PERMISSIONS: "change_permissions",
  SEND_NOTIFICATION: "send_notification",
  SCHEDULE_VACATION: "schedule_vacation",
  CREATE_DELEGATION: "create_delegation",
  CREATE_TEAM: "create_team",
  UPDATE_TEAM: "update_team",
  RESET_PASSWORD: "reset_password",
} as const;

export type ActivityActionValue = typeof ActivityActions[keyof typeof ActivityActions];

export const ActivityActionLabels: Record<ActivityActionValue, string> = {
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  create_case: "إنشاء قضية",
  update_case: "تعديل قضية",
  delete_case: "حذف قضية",
  change_stage: "تغيير مرحلة",
  send_to_review: "إرسال للمراجعة",
  add_review_notes: "إضافة ملاحظات",
  create_consultation: "إنشاء استشارة",
  update_consultation: "تعديل استشارة",
  delete_consultation: "حذف استشارة",
  create_user: "إنشاء مستخدم",
  update_user: "تعديل مستخدم",
  delete_user: "حذف مستخدم",
  change_permissions: "تغيير صلاحيات",
  send_notification: "إرسال إشعار",
  schedule_vacation: "جدولة إجازة",
  create_delegation: "إنشاء تفويض",
  create_team: "إنشاء فريق",
  update_team: "تعديل فريق",
  reset_password: "إعادة تعيين كلمة المرور",
};

export const PermissionsList = [
  "view_cases",
  "create_cases",
  "edit_cases",
  "delete_cases",
  "assign_cases",
  "view_consultations",
  "create_consultations",
  "edit_consultations",
  "delete_consultations",
  "assign_consultations",
  "view_clients",
  "create_clients",
  "edit_clients",
  "delete_clients",
  "view_users",
  "create_users",
  "edit_users",
  "delete_users",
  "manage_teams",
  "view_activity_log",
  "send_notifications",
  "send_reminders",
  "manage_notification_rules",
  "approve_reviews",
  "manage_workflow",
  "view_reports",
  "export_data",
  "manage_system_settings",
] as const;

export type PermissionType = typeof PermissionsList[number];

export const PermissionLabels: Record<PermissionType, string> = {
  view_cases: "عرض القضايا",
  create_cases: "إنشاء القضايا",
  edit_cases: "تعديل القضايا",
  delete_cases: "حذف القضايا",
  assign_cases: "إسناد القضايا",
  view_consultations: "عرض الاستشارات",
  create_consultations: "إنشاء الاستشارات",
  edit_consultations: "تعديل الاستشارات",
  delete_consultations: "حذف الاستشارات",
  assign_consultations: "إسناد الاستشارات",
  view_clients: "عرض العملاء",
  create_clients: "إنشاء العملاء",
  edit_clients: "تعديل العملاء",
  delete_clients: "حذف العملاء",
  view_users: "عرض المستخدمين",
  create_users: "إنشاء المستخدمين",
  edit_users: "تعديل المستخدمين",
  delete_users: "حذف المستخدمين",
  manage_teams: "إدارة الفرق",
  view_activity_log: "عرض سجل النشاط",
  send_notifications: "إرسال الإشعارات",
  send_reminders: "إرسال التذكيرات",
  manage_notification_rules: "إدارة قواعد الإشعارات",
  approve_reviews: "اعتماد المراجعات",
  manage_workflow: "إدارة سير العمل",
  view_reports: "عرض التقارير",
  export_data: "تصدير البيانات",
  manage_system_settings: "إدارة إعدادات النظام",
};

export const RolePermissions: Record<UserRoleType, PermissionType[]> = {
  branch_manager: [...PermissionsList],
  cases_review_head: [
    "view_cases", "edit_cases", "approve_reviews", "view_consultations",
    "view_clients", "view_users", "send_notifications", "send_reminders", "view_reports",
  ],
  consultations_review_head: [
    "view_consultations", "edit_consultations", "approve_reviews", "view_cases",
    "view_clients", "view_users", "send_notifications", "send_reminders", "view_reports",
  ],
  department_head: [
    "view_cases", "create_cases", "edit_cases", "assign_cases",
    "view_consultations", "create_consultations", "edit_consultations", "assign_consultations",
    "view_clients", "create_clients", "edit_clients",
    "view_users", "manage_teams", "send_notifications", "send_reminders", "view_reports",
  ],
  admin_support: [
    "view_cases", "create_cases",
    "view_consultations", "create_consultations",
    "view_clients", "create_clients",
    "send_notifications", "send_reminders",
  ],
  employee: [
    "view_cases", "edit_cases",
    "view_consultations", "edit_consultations",
    "view_clients",
  ],
  hr: [
    "view_users", "create_users", "edit_users",
    "view_activity_log", "view_reports",
  ],
};
