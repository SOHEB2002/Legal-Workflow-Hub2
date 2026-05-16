import { z } from "zod";
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, jsonb, integer, primaryKey, bigint, index, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
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
  mustChangePassword: boolean("must_change_password").default(true),
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
  caseType: varchar("case_type", { length: 255 }).notNull(),
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
  plaintiffName: varchar("plaintiff_name", { length: 255 }).default(""),
  opponentName: varchar("opponent_name", { length: 255 }).default(""),
  opponentLawyer: varchar("opponent_lawyer", { length: 255 }).default(""),
  opponentPhone: varchar("opponent_phone", { length: 50 }).default(""),
  opponentNotes: text("opponent_notes").default(""),
  whatsappGroupLink: varchar("whatsapp_group_link", { length: 500 }).default(""),
  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }).default(""),
  reviewNotes: text("review_notes").default(""),
  platformReviewNotes: text("platform_review_notes").default(""),
  platformReviewResubmitted: boolean("platform_review_resubmitted").default(false),
  reviewDecision: varchar("review_decision", { length: 50 }),
  reviewActionTaken: text("review_action_taken"),
  priority: varchar("priority", { length: 50 }).notNull().default("متوسط"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  lastHearingResult: varchar("last_hearing_result", { length: 50 }),
  lastHearingDate: varchar("last_hearing_date", { length: 50 }),
  nextHearingDate: varchar("next_hearing_date", { length: 50 }),
  activeMemoCount: integer("active_memo_count").default(0),
  caseClassification: varchar("case_classification", { length: 50 }).notNull().default("قيد_الدراسة"),
  previousHearingsCount: integer("previous_hearings_count").default(0),
  currentSituation: text("current_situation").default(""),
  responseDeadline: varchar("response_deadline", { length: 50 }),
  taradiStatus: varchar("taradi_status", { length: 50 }),
  taradiNumber: varchar("taradi_number", { length: 100 }),
  mohrStatus: varchar("mohr_status", { length: 50 }),
  mohrNumber: varchar("mohr_number", { length: 100 }),
  memoRequired: boolean("memo_required").default(false),
  amicableSettlementDirected: boolean("amicable_settlement_directed").default(false),
  adminCaseSubType: varchar("admin_case_sub_type", { length: 50 }),
  prescriptionDate: varchar("prescription_date", { length: 50 }),
  grievanceRequired: boolean("grievance_required").default(false),
  grievanceDate: varchar("grievance_date", { length: 50 }),
  grievanceResult: varchar("grievance_result", { length: 50 }),
  struckOffDate: varchar("struck_off_date", { length: 50 }),
  struckOffReopenDeadline: varchar("struck_off_reopen_deadline", { length: 50 }),
  appealLawyerId: varchar("appeal_lawyer_id", { length: 255 }),
  internalReviewerId: varchar("internal_reviewer_id", { length: 255 }),
  moeenNumber: varchar("moeen_number", { length: 100 }),
  clientRole: varchar("client_role", { length: 50 }),
  closureReason: varchar("closure_reason", { length: 255 }),
  closureReasonOther: varchar("closure_reason_other", { length: 500 }),
  isArchived: boolean("is_archived").default(false),
  archivedAt: timestamp("archived_at"),
  archivedBy: varchar("archived_by", { length: 255 }),
  archiveReason: varchar("archive_reason", { length: 50 }),
  autoArchiveDate: varchar("auto_archive_date", { length: 50 }),
  isSettlementCase: boolean("is_settlement_case").default(false),
  convertedFromConsultationId: varchar("converted_from_consultation_id", { length: 255 }),
  // Phase-8 — orthogonal pause + await-completion state. paused_at
  // non-null means the case is paused; awaiting_completion=true means
  // it's parked on a "missing data" detour with saved_stage holding
  // the stage value to restore on resume. status (workflow stage) is
  // intentionally NOT touched on pause — pause is detected via
  // paused_at IS NOT NULL. See script/add-workflow-pause-and-await-completion.sql.
  pauseReason:        text("pause_reason"),
  pausedBy:           varchar("paused_by", { length: 255 }),
  pausedAt:           timestamp("paused_at"),
  awaitingCompletion: boolean("awaiting_completion").notNull().default(false),
  savedStage:         varchar("saved_stage", { length: 50 }),
}, (t) => ({
  // Phase-2 deploy split — FK temporarily declared application-side only.
  // Apply via script/apply-fk-constraints.sql with statement_timeout
  // protection; the validating ADD CONSTRAINT was timing out the Replit
  // production deploy on tables with existing rows.
  // convertedFromConsultationFk: foreignKey({
  //   name: "law_cases_converted_from_consultation_id_fkey",
  //   columns: [t.convertedFromConsultationId],
  //   foreignColumns: [consultations.id],
  // }).onDelete("set null"),
}));

export const consultations = pgTable("consultations", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationNumber: varchar("consultation_number", { length: 50 }).notNull().unique(),
  clientId: varchar("client_id", { length: 255 }).notNull(),
  consultationType: varchar("consultation_type", { length: 255 }).notNull(),
  // @deprecated Phase-5 — the delivery-type concept (مكتوبة / شفهية) was
  // dropped from the UI. Existing rows retain their value and the column
  // stays for backwards compat with downstream readers; new inserts fall
  // back to the default "مكتوبة" the storage layer supplies. Don't surface
  // it in new UI; the early-close reason "answered_verbally" already
  // covers the verbal-delivery case.
  deliveryType: varchar("delivery_type", { length: 50 }).notNull().default("مكتوبة"),
  currentStage: varchar("current_stage", { length: 50 }).notNull().default("استلام"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  departmentId: varchar("department_id", { length: 255 }).notNull(),
  assignedTo: varchar("assigned_to", { length: 255 }),
  questionSummary: text("question_summary").notNull(),
  response: text("response").default(""),
  convertedToCaseId: varchar("converted_to_case_id", { length: 255 }),
  whatsappGroupLink: varchar("whatsapp_group_link", { length: 500 }).default(""),
  googleDriveFolderId: varchar("google_drive_folder_id", { length: 255 }).default(""),
  reviewNotes: text("review_notes").default(""),
  reviewDecision: varchar("review_decision", { length: 50 }),
  closureReason: varchar("closure_reason", { length: 50 }),
  closureReasonOther: varchar("closure_reason_other", { length: 500 }),
  // Phase-4 SLA columns. Category is set once at creation and drives the
  // expectedDeliveryDate (createdAt + SLA days). The DB default mirrors the
  // server fallback so manual inserts still get a valid category.
  // Migration: script/add-consultation-category-and-due-date.sql.
  category: varchar("category", { length: 50 }).notNull().default("عادية"),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  // Phase-8 — orthogonal pause + await-completion state. For
  // consultations the route layer also flips status="paused" / "active"
  // (ConsultationStatus has the new value); pause_at IS NOT NULL is
  // still the canonical paused indicator for the FE. saved_stage holds
  // the stage value to restore on resume from await_completion.
  // See script/add-workflow-pause-and-await-completion.sql.
  pauseReason:        text("pause_reason"),
  pausedBy:           varchar("paused_by", { length: 255 }),
  pausedAt:           timestamp("paused_at"),
  awaitingCompletion: boolean("awaiting_completion").notNull().default(false),
  savedStage:         varchar("saved_stage", { length: 50 }),
  // Committee-referral form fields (نموذج الإحالة للجنة المراجعة).
  // Mirrors lawCases.internalReviewerId / priority — set when the
  // assigned lawyer hands the file to the committee. priority_reason
  // is the optional free-text justification behind the chosen priority.
  // All three are nullable so existing rows surface as "not set".
  // See script/add-consultation-committee-fields.sql.
  internalReviewerId: varchar("internal_reviewer_id", { length: 255 }),
  priority:           varchar("priority", { length: 50 }),
  priorityReason:     text("priority_reason"),
});

export const consultationStudies = pgTable("consultation_studies", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationId: varchar("consultation_id", { length: 255 }).notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Phase-2 deploy split — see script/apply-fk-constraints.sql.
  // consultationFk: foreignKey({
  //   name: "consultation_studies_consultation_id_fkey",
  //   columns: [t.consultationId],
  //   foreignColumns: [consultations.id],
  // }).onDelete("cascade"),
  consultationIdx: index("consultation_studies_consultation_idx").on(t.consultationId),
}));

export const consultationDrafts = pgTable("consultation_drafts", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationId: varchar("consultation_id", { length: 255 }).notNull(),
  content: text("content").notNull().default(""),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Phase-2 deploy split — see script/apply-fk-constraints.sql.
  // consultationFk: foreignKey({
  //   name: "consultation_drafts_consultation_id_fkey",
  //   columns: [t.consultationId],
  //   foreignColumns: [consultations.id],
  // }).onDelete("cascade"),
  consultationIdx: index("consultation_drafts_consultation_idx").on(t.consultationId),
}));

export const consultationReviews = pgTable("consultation_reviews", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationId: varchar("consultation_id", { length: 255 }).notNull(),
  reviewerId: varchar("reviewer_id", { length: 255 }).notNull(),
  decision: varchar("decision", { length: 50 }).notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Phase-2 deploy split — see script/apply-fk-constraints.sql.
  // consultationFk: foreignKey({
  //   name: "consultation_reviews_consultation_id_fkey",
  //   columns: [t.consultationId],
  //   foreignColumns: [consultations.id],
  // }).onDelete("cascade"),
  consultationIdx: index("consultation_reviews_consultation_idx").on(t.consultationId),
}));

export const consultationCommitteeDecisions = pgTable("consultation_committee_decisions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationId: varchar("consultation_id", { length: 255 }).notNull(),
  decision: varchar("decision", { length: 50 }).notNull(),
  notes: text("notes").notNull().default(""),
  decidedBy: varchar("decided_by", { length: 255 }).notNull(),
  decidedAt: timestamp("decided_at").defaultNow(),
}, (t) => ({
  // Phase-2 deploy split — see script/apply-fk-constraints.sql.
  // consultationFk: foreignKey({
  //   name: "consultation_committee_decisions_consultation_id_fkey",
  //   columns: [t.consultationId],
  //   foreignColumns: [consultations.id],
  // }).onDelete("cascade"),
  consultationIdx: index("consultation_committee_decisions_consultation_idx").on(t.consultationId),
}));

export const consultationNoteOutcomes = pgTable("consultation_note_outcomes", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationId: varchar("consultation_id", { length: 255 }).notNull(),
  outcome: varchar("outcome", { length: 20 }).notNull(),
  notes: text("notes").notNull().default(""),
  recordedBy: varchar("recorded_by", { length: 255 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (t) => ({
  // Phase-2 deploy split — see script/apply-fk-constraints.sql.
  // consultationFk: foreignKey({
  //   name: "consultation_note_outcomes_consultation_id_fkey",
  //   columns: [t.consultationId],
  //   foreignColumns: [consultations.id],
  // }).onDelete("cascade"),
  consultationIdx: index("consultation_note_outcomes_consultation_idx").on(t.consultationId),
}));

// Phase-5 — audit log for expectedDeliveryDate extensions. Each row
// captures one extension (old → new) so the dialog can show a history
// list. The corresponding consultations.expectedDeliveryDate is updated
// in the same transaction as the insert (see storage.extendConsultationDelivery).
// Migration: script/add-consultation-delivery-extensions.sql.
export const consultationDeliveryExtensions = pgTable("consultation_delivery_extensions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationId: varchar("consultation_id", { length: 255 }).notNull(),
  oldExpectedDeliveryDate: timestamp("old_expected_delivery_date"),
  newExpectedDeliveryDate: timestamp("new_expected_delivery_date").notNull(),
  reason: text("reason").notNull().default(""),
  extendedBy: varchar("extended_by", { length: 255 }).notNull(),
  extendedAt: timestamp("extended_at").defaultNow(),
}, (t) => ({
  consultationFk: foreignKey({
    name: "consultation_delivery_extensions_consultation_id_fkey",
    columns: [t.consultationId],
    foreignColumns: [consultations.id],
  }).onDelete("cascade"),
  consultationIdx: index("consultation_delivery_extensions_consultation_idx").on(t.consultationId),
  extendedAtIdx: index("consultation_delivery_extensions_extended_at_idx").on(t.extendedAt),
}));

// Phase-6 — chronological activity log for consultations. One row per
// meaningful workflow event (created, assigned, stage transitions,
// reviews, committee decisions, take-notes outcomes, delivery
// extensions, conversion to case, early close, general notes). Inserts
// happen server-side only, in the SAME DB transaction as the underlying
// state change — see consultation handlers in routes.ts. Migration:
// script/add-consultation-activity-log.sql.
export const consultationActivityLog = pgTable("consultation_activity_log", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationId: varchar("consultation_id", { length: 255 }).notNull(),
  activityType: varchar("activity_type", { length: 50 }).notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").default({}),
  performedBy: varchar("performed_by", { length: 255 }),
  performedAt: timestamp("performed_at").defaultNow(),
}, (t) => ({
  consultationFk: foreignKey({
    name: "consultation_activity_log_consultation_id_fkey",
    columns: [t.consultationId],
    foreignColumns: [consultations.id],
  }).onDelete("cascade"),
  consultationIdx: index("consultation_activity_log_consultation_idx").on(t.consultationId),
  performedAtIdx: index("consultation_activity_log_performed_at_idx").on(t.performedAt),
}));

// ==================== Contracts module (العقود والمشاريع) ====================
// Standalone module that mirrors the WRITTEN consultation 8-stage flow.
// Distinct table + activity log so the contracts surface can evolve
// independently (e.g. file-attachment slots) without forking
// consultations. Migration: script/add-contracts-module.sql.
export const contracts = pgTable("contracts", {
  id:                 varchar("id", { length: 255 }).primaryKey(),
  contractNumber:     varchar("contract_number", { length: 50 }).notNull().unique(),
  title:              varchar("title", { length: 500 }).notNull(),
  clientId:           varchar("client_id", { length: 255 }).notNull(),
  // مراجعة_عقد / صياغة_عقد / مشروع — picks the attachment slots, not
  // the workflow (single 8-stage flow regardless of type).
  contractType:       varchar("contract_type", { length: 50 }).notNull(),
  description:        text("description").notNull().default(""),
  currentStage:       varchar("current_stage", { length: 50 }).notNull().default("استلام"),
  status:             varchar("status", { length: 20 }).notNull().default("active"),
  departmentId:       varchar("department_id", { length: 255 }).notNull(),
  assignedTo:         varchar("assigned_to", { length: 255 }),
  internalReviewerId: varchar("internal_reviewer_id", { length: 255 }),
  // Committee-form fields. priority uses the 2-value ContractPriority
  // enum (عاجلة / غير_عاجلة) — same vocabulary as consultations.
  priority:           varchar("priority", { length: 50 }),
  priorityReason:     text("priority_reason"),
  reviewNotes:        text("review_notes").default(""),
  closureReason:      varchar("closure_reason", { length: 50 }),
  closureReasonOther: varchar("closure_reason_other", { length: 500 }),
  // Pause + await-completion. Same shape as consultations / cases /
  // memos so the cross-cutting workflow handlers can stay generic.
  pauseReason:        text("pause_reason"),
  pausedBy:           varchar("paused_by", { length: 255 }),
  pausedAt:           timestamp("paused_at"),
  awaitingCompletion: boolean("awaiting_completion").notNull().default(false),
  savedStage:         varchar("saved_stage", { length: 50 }),
  createdBy:          varchar("created_by", { length: 255 }).notNull(),
  createdAt:          timestamp("created_at").defaultNow(),
  updatedAt:          timestamp("updated_at").defaultNow(),
  closedAt:           timestamp("closed_at"),
}, (t) => ({
  departmentIdx: index("contracts_department_idx").on(t.departmentId),
  assignedIdx:   index("contracts_assigned_idx").on(t.assignedTo),
  stageIdx:      index("contracts_stage_idx").on(t.currentStage),
  statusIdx:     index("contracts_status_idx").on(t.status),
}));

// File attachments. Designated slots (slot_key non-null) are
// single-file — re-upload replaces the existing row + deletes the old
// file from disk. Free attachments use slot_key=NULL and accumulate.
// The (contract_id, slot_key) unique constraint is partial (slot_key
// NOT NULL only) — added in the migration as a partial unique index;
// Drizzle's table-level constraints don't express partial uniqueness.
export const contractAttachments = pgTable("contract_attachments", {
  id:          varchar("id", { length: 255 }).primaryKey(),
  contractId:  varchar("contract_id", { length: 255 }).notNull(),
  slotKey:     varchar("slot_key", { length: 50 }),
  fileName:    varchar("file_name", { length: 500 }).notNull(),
  filePath:    varchar("file_path", { length: 1000 }).notNull(),
  fileSize:    bigint("file_size", { mode: "number" }).notNull(),
  mimeType:    varchar("mime_type", { length: 100 }).notNull(),
  description: text("description"),
  uploadedBy:  varchar("uploaded_by", { length: 255 }).notNull(),
  uploadedAt:  timestamp("uploaded_at").defaultNow(),
}, (t) => ({
  contractFk: foreignKey({
    name: "contract_attachments_contract_id_fkey",
    columns: [t.contractId],
    foreignColumns: [contracts.id],
  }).onDelete("cascade"),
  slotUniqueIdx: uniqueIndex("contract_attachments_slot_unique_idx")
    .on(t.contractId, t.slotKey)
    .where(sql`slot_key IS NOT NULL`),
  contractIdx:    index("contract_attachments_contract_idx").on(t.contractId),
  slotLookupIdx:  index("contract_attachments_slot_lookup_idx").on(t.contractId, t.slotKey),
}));

export const contractActivityLog = pgTable("contract_activity_log", {
  id:           varchar("id", { length: 255 }).primaryKey(),
  contractId:   varchar("contract_id", { length: 255 }).notNull(),
  activityType: varchar("activity_type", { length: 50 }).notNull(),
  description:  text("description").notNull(),
  metadata:     jsonb("metadata").default({}),
  performedBy:  varchar("performed_by", { length: 255 }),
  performedAt:  timestamp("performed_at").defaultNow(),
}, (t) => ({
  contractFk: foreignKey({
    name: "contract_activity_log_contract_id_fkey",
    columns: [t.contractId],
    foreignColumns: [contracts.id],
  }).onDelete("cascade"),
  contractIdx: index("contract_activity_log_contract_idx")
    .on(t.contractId, t.performedAt.desc()),
}));

export const hearings = pgTable("hearings", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  hearingDate: varchar("hearing_date", { length: 50 }).notNull(),
  hearingTime: varchar("hearing_time", { length: 50 }).notNull(),
  hearingType: varchar("hearing_type", { length: 50 }).default("محكمة"),
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
  memoRequired: boolean("memo_required").default(false),
  opponentResponseRequired: boolean("opponent_response_required").default(false),
  hearingReport: text("hearing_report").default(""),
  recommendations: text("recommendations").default(""),
  nextSteps: text("next_steps").default(""),
  contactCompleted: boolean("contact_completed").default(false),
  reportCompleted: boolean("report_completed").default(false),
  adminTasksCreated: boolean("admin_tasks_created").default(false),
  opponentMemos: text("opponent_memos").default(""),
  hearingMinutes: text("hearing_minutes").default(""),
  attendingLawyerId: varchar("attending_lawyer_id", { length: 255 }),
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
  communicationType: varchar("communication_type", { length: 50 }),
  duration: varchar("duration", { length: 50 }),
  followUpRequired: boolean("follow_up_required").default(false),
  followUpDate: varchar("follow_up_date", { length: 50 }),
  followUpNotes: text("follow_up_notes"),
  followUpCompleted: boolean("follow_up_completed").default(false),
  caseId: varchar("case_id", { length: 255 }),
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

export const attachments = pgTable("attachments", {
  id: varchar("id", { length: 255 }).primaryKey(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 60 }).default(""),
  fileSize: integer("file_size").default(0),
  uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const memos = pgTable("memos", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  hearingId: varchar("hearing_id", { length: 255 }),
  memoType: varchar("memo_type", { length: 50 }).notNull(),
  memoTypeOther: varchar("memo_type_other", { length: 255 }).default(""),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").default(""),
  status: varchar("status", { length: 50 }).notNull(),
  priority: varchar("priority", { length: 50 }).notNull().default("عالي"),
  assignedTo: varchar("assigned_to", { length: 255 }).notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  deadline: varchar("deadline", { length: 50 }).notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  submittedAt: timestamp("submitted_at"),
  content: text("content").default(""),
  fileLink: varchar("file_link", { length: 500 }).default(""),
  reviewNotes: text("review_notes").default(""),
  reviewerId: varchar("reviewer_id", { length: 255 }),
  reviewedAt: timestamp("reviewed_at"),
  returnCount: integer("return_count").default(0),
  isAutoGenerated: boolean("is_auto_generated").default(false),
  autoGenerateReason: varchar("auto_generate_reason", { length: 255 }).default(""),
  reminderSent3Days: boolean("reminder_sent_3_days").default(false),
  reminderSent1Day: boolean("reminder_sent_1_day").default(false),
  reminderSentOverdue: boolean("reminder_sent_overdue").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Phase-8 — orthogonal pause + await-completion state. status (memo
  // workflow state) is intentionally NOT touched on pause — pause is
  // detected via paused_at IS NOT NULL. saved_stage on memos stores
  // the memo status to restore on resume from await_completion.
  // See script/add-workflow-pause-and-await-completion.sql.
  pauseReason:        text("pause_reason"),
  pausedBy:           varchar("paused_by", { length: 255 }),
  pausedAt:           timestamp("paused_at"),
  awaitingCompletion: boolean("awaiting_completion").notNull().default(false),
  savedStage:         varchar("saved_stage", { length: 50 }),
  // Phase-9 — review-workflow stage column. Mirrors the consultations
  // currentStage axis but with memo-specific labels (جاهزة_للرفع /
  // مرفوعة instead of جاهزة_للإرسال / منجزة). Nullable because legacy
  // rows pre-Phase-9 don't have a stage; the backfill in
  // script/backfill-memo-stages.sql maps the old `status` enum to a
  // stage. The legacy `status` column above stays as-is — cancellation
  // ("ملغاة") lives there, not on currentStage.
  currentStage:       varchar("current_stage", { length: 50 }),
  // Phase-9.1 — designated peer reviewer for the مراجعة_داخلية stage.
  // Mirrors lawCases.internalReviewerId. Set when the assigned lawyer
  // advances DRAFTING → INTERNAL_REVIEW; cleared/overwritten on the
  // next round if the memo loops back via "يوجد ملاحظات". The
  // /internal-review endpoint locks the decision to (this user) OR
  // branch_manager. Migration: script/add-memo-internal-reviewer.sql.
  internalReviewerId: varchar("internal_reviewer_id", { length: 255 }),
  // Phase-9.2 — reason captured when a memo is cancelled via the
  // "لا يحتاج مذكرة" flow. Required at the FE; nullable here because
  // legacy cancellations didn't capture one. The actor + timestamp are
  // recorded in memo_activity_log alongside the reason.
  // Migration: script/add-memo-cancellation-reason.sql.
  cancellationReason: text("cancellation_reason"),
});

export const caseActivityLog = pgTable("case_activity_log", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  details: text("details"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: varchar("related_entity_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phase-8 — memo activity log (mirrors consultation_activity_log).
// One row per meaningful event on a memo. Inserts happen server-side in
// the same DB transaction as the underlying state change.
// Migration: script/add-memo-activity-log.sql.
export const memoActivityLog = pgTable("memo_activity_log", {
  id: varchar("id", { length: 255 }).primaryKey(),
  memoId: varchar("memo_id", { length: 255 }).notNull(),
  activityType: varchar("activity_type", { length: 50 }).notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").default({}),
  performedBy: varchar("performed_by", { length: 255 }),
  performedAt: timestamp("performed_at").defaultNow(),
}, (t) => ({
  memoFk: foreignKey({
    name: "memo_activity_log_memo_id_fkey",
    columns: [t.memoId],
    foreignColumns: [memos.id],
  }).onDelete("cascade"),
  memoIdx: index("memo_activity_log_memo_idx").on(t.memoId),
  performedAtIdx: index("memo_activity_log_performed_at_idx").on(t.performedAt),
}));

// Phase-9 — review-workflow helper tables. One row per peer-review
// decision, committee decision, and take-notes outcome on a memo.
// Mirrors the three consultation_* helper tables; values come from the
// shared InternalReviewDecision / CommitteeDecision / NoteOutcome enums
// (the Arabic tokens are identical across entities). Inserts happen
// server-side in the same DB transaction as the memo stage update and
// the activity log row — see storage.recordMemo*.
// Migration: script/add-memo-helper-tables.sql.
export const memoReviews = pgTable("memo_reviews", {
  id: varchar("id", { length: 255 }).primaryKey(),
  memoId: varchar("memo_id", { length: 255 }).notNull(),
  reviewerId: varchar("reviewer_id", { length: 255 }).notNull(),
  decision: varchar("decision", { length: 50 }).notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  memoFk: foreignKey({
    name: "memo_reviews_memo_id_fkey",
    columns: [t.memoId],
    foreignColumns: [memos.id],
  }).onDelete("cascade"),
  memoIdx: index("memo_reviews_memo_idx").on(t.memoId),
}));

export const memoCommitteeDecisions = pgTable("memo_committee_decisions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  memoId: varchar("memo_id", { length: 255 }).notNull(),
  decision: varchar("decision", { length: 50 }).notNull(),
  notes: text("notes").notNull().default(""),
  decidedBy: varchar("decided_by", { length: 255 }).notNull(),
  decidedAt: timestamp("decided_at").defaultNow(),
}, (t) => ({
  memoFk: foreignKey({
    name: "memo_committee_decisions_memo_id_fkey",
    columns: [t.memoId],
    foreignColumns: [memos.id],
  }).onDelete("cascade"),
  memoIdx: index("memo_committee_decisions_memo_idx").on(t.memoId),
}));

export const memoNoteOutcomes = pgTable("memo_note_outcomes", {
  id: varchar("id", { length: 255 }).primaryKey(),
  memoId: varchar("memo_id", { length: 255 }).notNull(),
  outcome: varchar("outcome", { length: 20 }).notNull(),
  notes: text("notes").notNull().default(""),
  recordedBy: varchar("recorded_by", { length: 255 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow(),
}, (t) => ({
  memoFk: foreignKey({
    name: "memo_note_outcomes_memo_id_fkey",
    columns: [t.memoId],
    foreignColumns: [memos.id],
  }).onDelete("cascade"),
  memoIdx: index("memo_note_outcomes_memo_idx").on(t.memoId),
}));

export const caseNotes = pgTable("case_notes", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false),
  isImportant: boolean("is_important").default(false),
  category: varchar("category", { length: 50 }).default("عام"),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const caseComments = pgTable("case_comments", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const legalDeadlines = pgTable("legal_deadlines", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  hearingId: varchar("hearing_id", { length: 255 }),
  deadlineType: varchar("deadline_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startDate: varchar("start_date", { length: 50 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  deadlineDate: varchar("deadline_date", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("نشط"),
  reminder7daysSent: boolean("reminder_7_days_sent").default(false),
  reminder3daysSent: boolean("reminder_3_days_sent").default(false),
  reminder1daySent: boolean("reminder_1_day_sent").default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const delegationsTable = pgTable("delegations_table", {
  id: varchar("id", { length: 255 }).primaryKey(),
  fromUserId: varchar("from_user_id", { length: 255 }).notNull(),
  toUserId: varchar("to_user_id", { length: 255 }).notNull(),
  reason: varchar("reason", { length: 50 }).notNull(),
  reasonDetails: text("reason_details"),
  startDate: varchar("start_date", { length: 50 }).notNull(),
  endDate: varchar("end_date", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("نشط"),
  scope: varchar("scope", { length: 50 }).notNull().default("all_cases"),
  specificCaseIds: jsonb("specific_case_ids"),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savedFilters = pgTable("saved_filters", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  filterConfig: jsonb("filter_config").notNull(),
  pageType: varchar("page_type", { length: 50 }).notNull().default("cases"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  userPageIdx: index("saved_filters_user_page_idx").on(t.userId, t.pageType),
}));

// Tracks the last time each user opened a given sidebar section
// (cases / consultations / hearings / memos). Drives the
// "new since last visit" badge counts in the sidebar. PK is
// (userId, section) so each user has at most one row per section.
// Migration: script/add-user-section-views.sql.
export const userSectionViews = pgTable("user_section_views", {
  userId: varchar("user_id", { length: 255 }).notNull(),
  section: varchar("section", { length: 50 }).notNull(),
  lastViewedAt: timestamp("last_viewed_at").notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ name: "user_section_views_pkey", columns: [t.userId, t.section] }),
  userIdx: index("user_section_views_user_idx").on(t.userId),
}));

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id", { length: 255 }).primaryKey(),
  ticketNumber: varchar("ticket_number", { length: 50 }).notNull().unique(),
  ticketType: varchar("ticket_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description").notNull(),
  relatedPage: varchar("related_page", { length: 255 }).default(""),
  screenshotUrl: text("screenshot_url").default(""),
  priority: varchar("priority", { length: 50 }).notNull().default("متوسط"),
  status: varchar("status", { length: 50 }).notNull().default("جديدة"),
  submittedBy: varchar("submitted_by", { length: 255 }).notNull(),
  assignedTo: varchar("assigned_to", { length: 255 }),
  comments: jsonb("comments").default([]),
  rating: integer("rating"),
  ratingComment: text("rating_comment").default(""),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
export const insertAttachmentDbSchema = createInsertSchema(attachments).omit({ createdAt: true });
export const insertMemoDbSchema = createInsertSchema(memos).omit({ createdAt: true, updatedAt: true });
export const insertCaseActivityLogDbSchema = createInsertSchema(caseActivityLog).omit({ createdAt: true });
export const insertCaseNoteDbSchema = createInsertSchema(caseNotes).omit({ createdAt: true });
export const insertCaseCommentDbSchema = createInsertSchema(caseComments).omit({ createdAt: true });
export const insertLegalDeadlineDbSchema = createInsertSchema(legalDeadlines).omit({ createdAt: true });
export const insertDelegationDbSchema = createInsertSchema(delegationsTable).omit({ createdAt: true });
export const insertConsultationStudyDbSchema = createInsertSchema(consultationStudies).omit({ createdAt: true });
export const insertConsultationDraftDbSchema = createInsertSchema(consultationDrafts).omit({ createdAt: true });
export const insertConsultationReviewDbSchema = createInsertSchema(consultationReviews).omit({ createdAt: true });
export const insertConsultationCommitteeDecisionDbSchema = createInsertSchema(consultationCommitteeDecisions).omit({ decidedAt: true });
export const insertConsultationNoteOutcomeDbSchema = createInsertSchema(consultationNoteOutcomes).omit({ recordedAt: true });
export const insertConsultationDeliveryExtensionDbSchema = createInsertSchema(consultationDeliveryExtensions).omit({ extendedAt: true });
export const insertConsultationActivityLogDbSchema = createInsertSchema(consultationActivityLog).omit({ performedAt: true });
// Phase-9 — memo review-workflow helper tables.
export const insertMemoReviewDbSchema = createInsertSchema(memoReviews).omit({ createdAt: true });
export const insertMemoCommitteeDecisionDbSchema = createInsertSchema(memoCommitteeDecisions).omit({ decidedAt: true });
export const insertMemoNoteOutcomeDbSchema = createInsertSchema(memoNoteOutcomes).omit({ recordedAt: true });
export const insertSavedFilterDbSchema = createInsertSchema(savedFilters).omit({ createdAt: true });
export const insertUserSectionViewDbSchema = createInsertSchema(userSectionViews).omit({ lastViewedAt: true });

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
export type DbAttachment = typeof attachments.$inferSelect;
export type DbMemo = typeof memos.$inferSelect;
export type DbCaseActivityLog = typeof caseActivityLog.$inferSelect;
export type DbCaseNote = typeof caseNotes.$inferSelect;
export type DbCaseComment = typeof caseComments.$inferSelect;
export type DbLegalDeadline = typeof legalDeadlines.$inferSelect;
export type DbDelegation = typeof delegationsTable.$inferSelect;
export type DbConsultationStudy = typeof consultationStudies.$inferSelect;
export type DbConsultationDraft = typeof consultationDrafts.$inferSelect;
export type DbConsultationReview = typeof consultationReviews.$inferSelect;
export type DbConsultationCommitteeDecision = typeof consultationCommitteeDecisions.$inferSelect;
export type DbConsultationNoteOutcome = typeof consultationNoteOutcomes.$inferSelect;
export type DbConsultationActivityLog = typeof consultationActivityLog.$inferSelect;
export type DbContract = typeof contracts.$inferSelect;
export type DbContractAttachment = typeof contractAttachments.$inferSelect;
export type DbContractActivityLog = typeof contractActivityLog.$inferSelect;
export type DbMemoReview = typeof memoReviews.$inferSelect;
export type DbMemoCommitteeDecision = typeof memoCommitteeDecisions.$inferSelect;
export type DbMemoNoteOutcome = typeof memoNoteOutcomes.$inferSelect;
export type DbSavedFilter = typeof savedFilters.$inferSelect;
export type DbUserSectionView = typeof userSectionViews.$inferSelect;

// ==================== الأدوار (Roles) ====================
export const UserRole = {
  BRANCH_MANAGER: "branch_manager",           // مدير الفرع
  CASES_REVIEW_HEAD: "cases_review_head",     // رئيس لجنة مراجعة القضايا
  CONSULTATIONS_REVIEW_HEAD: "consultations_review_head", // رئيس لجنة مراجعة الاستشارات
  DEPARTMENT_HEAD: "department_head",         // رئيس القسم
  ADMIN_SUPPORT: "admin_support",             // الدعم الإداري
  EMPLOYEE: "employee",                       // موظف قسم
  HR: "hr",                                   // موظف الموارد البشرية
  TECHNICAL_SUPPORT: "technical_support",      // دعم فني
  // Read-only role with global visibility — sees every module like
  // branch_manager but is blocked from any mutating endpoint by the
  // viewerWriteGuard middleware in server/index.ts. Used for
  // auditors / observers who need data access without modification.
  VIEWER: "viewer",                            // مشاهد
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
  technical_support: "دعم فني",
  viewer: "مشاهد",
};

// ==================== الأقسام (Departments) ====================
export const Department = {
  GENERAL: "عام",
  COMMERCIAL: "تجاري",
  LABOR: "عمالي",
  ADMINISTRATIVE: "إداري",
  // System-managed dept that owns the contracts module by default. The
  // contracts create form pre-selects this department; users can still
  // route a contract to any other department before saving.
  CONTRACTS_AND_PROJECTS: "العقود والمشاريع",
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

// ==================== تصنيف القضية ====================
export const CaseClassification = {
  UNDER_STUDY: "قيد_الدراسة",
  IN_COURT: "منظورة_بالمحكمة",
} as const;

export type CaseClassificationValue = typeof CaseClassification[keyof typeof CaseClassification];

export const CaseClassificationLabels: Record<CaseClassificationValue, string> = {
  "قيد_الدراسة": "قيد الدراسة",
  "منظورة_بالمحكمة": "منظورة بالمحكمة",
};

// ==================== حالات منصة تراضي (تجاري) ====================
export const TaradiStatus = {
  REGISTERED: "مقيدة_في_تراضي",
  RECONCILED: "تم_الصلح",
  NOT_RECONCILED: "لم_يتم_صلح",
} as const;

export type TaradiStatusValue = typeof TaradiStatus[keyof typeof TaradiStatus];

export const TaradiStatusLabels: Record<TaradiStatusValue, string> = {
  "مقيدة_في_تراضي": "مقيدة في تراضي",
  "تم_الصلح": "تم الصلح",
  "لم_يتم_صلح": "لم يتم صلح - جاهزة للتقييد في المحكمة",
};

// ==================== حالات وزارة الموارد البشرية (عمالي) ====================
export const MohrStatus = {
  REGISTERED: "مقيدة_في_الموارد",
  SETTLEMENT_DIRECTED: "توجيه_تسوية_ودية",
  SETTLEMENT_ENDED: "انتهت_التسوية",
} as const;

export type MohrStatusValue = typeof MohrStatus[keyof typeof MohrStatus];

export const MohrStatusLabels: Record<MohrStatusValue, string> = {
  "مقيدة_في_الموارد": "مقيدة في وزارة الموارد البشرية",
  "توجيه_تسوية_ودية": "تم توجيه العميل للتسوية الودية",
  "انتهت_التسوية": "انتهت التسوية الودية - جاهزة للرفع",
};

// ==================== أنواع القضايا الإدارية ====================
export const AdminCaseSubType = {
  GRIEVANCE: "تظلم",
  CASE: "قضية",
} as const;

export type AdminCaseSubTypeValue = typeof AdminCaseSubType[keyof typeof AdminCaseSubType];

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
  // Phase-8 — label-only rename (DB value "استكمال_البيانات" unchanged).
  // Same Arabic display label as the consultations-side new stage value
  // ConsultationStage.RECEIVED_PENDING_COMPLETION ("استكمال_المرفقات_والبيانات").
  "استكمال_البيانات": "استكمال المرفقات والبيانات",
  "دراسة": "دراسة",
  "تحرير_المذكرة": "تحرير المذكرة",
  "لجنة_المراجعة": "لجنة المراجعة",
  "تعديلات": "تعديلات",
  "جاهز_للرفع": "جاهز للرفع",
  "مرفوع": "مرفوع",
  "مغلق": "مغلق",
};

// ==================== مراحل القضية ====================
export const CaseStage = {
  RECEPTION: "استلام",
  PRESCRIPTION_DATE: "تحديد_تاريخ_التقادم",
  DATA_COMPLETION: "استكمال_البيانات",
  STUDY: "دراسة",
  SETTLEMENT_DIRECTION: "توجيه_العميل_بالتسوية",
  AWAITING_SETTLEMENT: "بانتظار_رفع_العميل_للتسوية",
  GRIEVANCE_DRAFTING: "تحرير_صيغة_التظلم",
  GRIEVANCE_INTERNAL_REVIEW: "مراجعة_داخلية_للتظلم",
  GRIEVANCE_SUBMITTED: "تقديم_التظلم",
  GRIEVANCE_AWAITING: "انتظار_رد_التظلم",
  DRAFTING: "تحرير_صحيفة_الدعوى",
  MEMO_DRAFTING: "تحرير_مذكرة_جوابية",
  INTERNAL_REVIEW: "مراجعة_داخلية",
  REVIEW_COMMITTEE: "إحالة_للجنة_المراجعة",
  TAKING_NOTES: "الأخذ_بالملاحظات",
  READY_TO_SUBMIT: "جاهزة_للرفع",
  TARADI_REGISTRATION: "رفع_بمنصة_تراضي",
  TARADI_REVIEW: "قيد_التدقيق_في_تراضي",
  CONCILIATION: "مداولة_الصلح",
  CONCILIATION_CLOSED: "أغلق_طلب_الصلح",
  NAJIZ_REGISTRATION: "الرفع_في_ناجز",
  NAJIZ_REVIEW: "قيد_التدقيق_في_ناجز",
  MOEEN_REGISTRATION: "الرفع_في_معين",
  MOEEN_REVIEW: "قيد_التدقيق_في_معين",
  UNDER_REVIEW: "منظورة",
  PRIMARY_JUDGMENT: "محكوم_حكم_ابتدائي",
  APPEAL_PENDING: "منظورة_استئناف",
  FINAL_JUDGMENT: "محكوم_حكم_نهائي",
  STRUCK_OFF: "مشطوبة",
  COLLECTION: "تحصيل",
  ARCHIVED: "مؤرشفة",
  CLOSED: "مقفلة",
} as const;

export type CaseStageValue = typeof CaseStage[keyof typeof CaseStage];

export const CaseStageLabels: Record<CaseStageValue, string> = {
  "استلام": "استلام",
  "تحديد_تاريخ_التقادم": "تحديد تاريخ التقادم",
  // Phase-8 — label-only rename (DB value unchanged); shared label with
  // the consultations-side equivalent stage.
  "استكمال_البيانات": "استكمال المرفقات والبيانات",
  "دراسة": "دراسة",
  "توجيه_العميل_بالتسوية": "توجيه العميل بالتسوية",
  "بانتظار_رفع_العميل_للتسوية": "بانتظار رفع العميل للتسوية",
  "تحرير_صيغة_التظلم": "تحرير صيغة التظلم",
  "مراجعة_داخلية_للتظلم": "مراجعة داخلية للتظلم",
  "تقديم_التظلم": "تقديم التظلم",
  "انتظار_رد_التظلم": "انتظار رد التظلم",
  "تحرير_صحيفة_الدعوى": "تحرير صحيفة الدعوى",
  "تحرير_مذكرة_جوابية": "تحرير مذكرة جوابية",
  "مراجعة_داخلية": "مراجعة داخلية",
  "إحالة_للجنة_المراجعة": "إحالة للجنة المراجعة",
  "الأخذ_بالملاحظات": "الأخذ بالملاحظات",
  "جاهزة_للرفع": "جاهزة للرفع",
  "رفع_بمنصة_تراضي": "رفع بمنصة تراضي",
  "قيد_التدقيق_في_تراضي": "قيد التدقيق في تراضي",
  "مداولة_الصلح": "مداولة الصلح",
  "أغلق_طلب_الصلح": "أغلق طلب الصلح",
  "الرفع_في_ناجز": "الرفع في ناجز",
  "قيد_التدقيق_في_ناجز": "قيد التدقيق في ناجز",
  "الرفع_في_معين": "الرفع في معين",
  "قيد_التدقيق_في_معين": "قيد التدقيق في معين",
  "منظورة": "منظورة",
  "محكوم_حكم_ابتدائي": "محكوم حكم ابتدائي",
  "منظورة_استئناف": "منظورة استئناف",
  "محكوم_حكم_نهائي": "محكوم حكم نهائي",
  "مشطوبة": "مشطوبة",
  "تحصيل": "تحصيل",
  "مؤرشفة": "مؤرشفة",
  "مقفلة": "مقفلة",
};

export const CaseStagesOrder: CaseStageValue[] = [
  "استلام",
  "تحديد_تاريخ_التقادم",
  "استكمال_البيانات",
  "دراسة",
  "توجيه_العميل_بالتسوية",
  "بانتظار_رفع_العميل_للتسوية",
  "تحرير_صيغة_التظلم",
  "مراجعة_داخلية_للتظلم",
  "تقديم_التظلم",
  "انتظار_رد_التظلم",
  "تحرير_صحيفة_الدعوى",
  "تحرير_مذكرة_جوابية",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "جاهزة_للرفع",
  "رفع_بمنصة_تراضي",
  "قيد_التدقيق_في_تراضي",
  "مداولة_الصلح",
  "أغلق_طلب_الصلح",
  "الرفع_في_ناجز",
  "قيد_التدقيق_في_ناجز",
  "الرفع_في_معين",
  "قيد_التدقيق_في_معين",
  "منظورة",
  "محكوم_حكم_ابتدائي",
  "منظورة_استئناف",
  "محكوم_حكم_نهائي",
  "مشطوبة",
  "تحصيل",
  "مؤرشفة",
  "مقفلة",
];

// ==================== مراحل القضية حسب التصنيف والقسم ====================

export const UnderStudyGeneralStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "دراسة",
  "تحرير_صحيفة_الدعوى",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "جاهزة_للرفع",
  "قيد_التدقيق_في_ناجز",
  "مداولة_الصلح",
  "أغلق_طلب_الصلح",
  "منظورة",
];

export const UnderStudyCommercialStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "دراسة",
  "تحرير_صحيفة_الدعوى",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "جاهزة_للرفع",
  "قيد_التدقيق_في_تراضي",
  "مداولة_الصلح",
  "أغلق_طلب_الصلح",
  "قيد_التدقيق_في_ناجز",
  "منظورة",
];

export const UnderStudyLaborStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "دراسة",
  "توجيه_العميل_بالتسوية",
  "بانتظار_رفع_العميل_للتسوية",
  "مداولة_الصلح",
  "أغلق_طلب_الصلح",
  "تحرير_صحيفة_الدعوى",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "قيد_التدقيق_في_ناجز",
  "منظورة",
];

export const UnderStudyAdminStages: CaseStageValue[] = [
  "استلام",
  "تحديد_تاريخ_التقادم",
  "استكمال_البيانات",
  "دراسة",
  "تحرير_صيغة_التظلم",
  "مراجعة_داخلية_للتظلم",
  "تقديم_التظلم",
  "انتظار_رد_التظلم",
  "تحرير_صحيفة_الدعوى",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "قيد_التدقيق_في_معين",
  "منظورة",
];

// In-court case paths. The firm is handling a case that's already filed in
// court. The path branches on whether the firm is drafting a response
// (defendant + memo), filing a pleading (plaintiff + memo), or just studying
// the case before the next hearing (no memo).
export const InCourtDefendantMemoStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "تحرير_مذكرة_جوابية",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "منظورة",
];

export const InCourtPlaintiffMemoStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "تحرير_صحيفة_الدعوى",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "منظورة",
];

export const InCourtNoMemoStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "دراسة",
  "منظورة",
];

export const InCourtSettlementStages: CaseStageValue[] = [
  "استلام",
  "مداولة_الصلح",
  "تحصيل",
];

export const PostTrialStages: CaseStageValue[] = [
  "منظورة",
  "محكوم_حكم_ابتدائي",
  "منظورة_استئناف",
  "محكوم_حكم_نهائي",
  "مشطوبة",
  "تحصيل",
  "مؤرشفة",
  "مقفلة",
];

// Stage selection is keyed on the case's DEPARTMENT (a stable FK to the
// departments table), not on caseType. caseType is a free-text user input
// that often holds a sub-type label like "بيع وتوريد" / "نزاع تجاري" and
// must not be used to route workflows. The four canonical department
// names ("عام" / "تجاري" / "عمالي" / "إداري") map 1:1 to the four
// UnderStudy stage arrays — callers should pass the resolved department
// name (e.g. via getDepartmentName(departmentId) on the client, or
// storage.getDepartmentById(departmentId)?.name on the server).
export function getStagesForClassification(
  classification: CaseClassificationValue,
  departmentName?: string,
  clientRole?: string,
  memoRequired?: boolean,
  isSettlementCase?: boolean,
): CaseStageValue[] {
  if (classification === "منظورة_بالمحكمة") {
    if (isSettlementCase) {
      return InCourtSettlementStages;
    }
    if (memoRequired) {
      return clientRole === "مدعى_عليه"
        ? InCourtDefendantMemoStages
        : InCourtPlaintiffMemoStages;
    }
    return InCourtNoMemoStages;
  }

  if (classification === "قيد_الدراسة") {
    switch (departmentName) {
      case "عام": return UnderStudyGeneralStages;
      case "تجاري": return UnderStudyCommercialStages;
      case "عمالي": return UnderStudyLaborStages;
      case "إداري": return UnderStudyAdminStages;
      default: return UnderStudyGeneralStages;
    }
  }

  return UnderStudyGeneralStages;
}

export function getStageLabel(stage: CaseStageValue): string {
  return CaseStageLabels[stage] || stage;
}

// ملاحظة: يمكن الانتقال من أي مرحلة إلى "مقفلة" بواسطة الدعم الإداري فقط (إغلاق مبكر) - يتم التحقق في routes.ts

// سجل انتقال المراحل
export interface CaseStageTransition {
  stage: CaseStageValue;
  timestamp: string;
  userId: string;
  userName: string;
  notes: string;
}

// ==================== أسباب الإغلاق ====================
export const ClosureReason = {
  CONTRACT_NOT_RENEWED: "عدم_تجديد_العقد",
  OPPONENT_PAID: "سداد_الخصم",
  CLIENT_WAIVER: "تنازل_العميل",
  JUDGMENT_AGAINST: "حكم_نهائي_ضدنا",
  PRIMARY_NO_APPEAL: "حكم_ابتدائي_بدون_اعتراض",
  STRUCK_OFF_EXPIRED: "شطب_بدون_إعادة_قيد",
  SETTLEMENT_FAILED: "لم_يتم_الصلح",
  OTHER: "أخرى",
} as const;

export type ClosureReasonValue = typeof ClosureReason[keyof typeof ClosureReason];

export const ClosureReasonLabels: Record<ClosureReasonValue, string> = {
  "عدم_تجديد_العقد": "عدم تجديد العقد",
  "سداد_الخصم": "سداد الخصم",
  "تنازل_العميل": "تنازل العميل",
  "حكم_نهائي_ضدنا": "حكم نهائي ضدنا",
  "حكم_ابتدائي_بدون_اعتراض": "حكم ابتدائي بدون اعتراض",
  "شطب_بدون_إعادة_قيد": "شطب بدون إعادة قيد",
  "لم_يتم_الصلح": "لم يتم الصلح",
  "أخرى": "أخرى",
};

// ==================== الأولوية ====================
export const Priority = {
  URGENT: "عاجل",
  HIGH: "عالي",
  MEDIUM: "متوسط",
  LOW: "منخفض",
} as const;

export type PriorityType = typeof Priority[keyof typeof Priority];

// Consultations use a separate 2-value priority enum (committee-form-only,
// per user feedback). Cases / memos keep the 4-value Priority enum above.
// Stored on consultations.priority (varchar 50) — same column, narrower
// vocabulary. Existing rows that had the legacy 4-value strings will read
// back as-is; the UI's resolveConsultationPriorityLabel collapses them to
// "—" so a stale value doesn't surface as an unrenderable badge.
export const ConsultationPriority = {
  URGENT:     "عاجلة",
  NOT_URGENT: "غير_عاجلة",
} as const;

export type ConsultationPriorityValue =
  typeof ConsultationPriority[keyof typeof ConsultationPriority];

export const ConsultationPriorityLabels: Record<ConsultationPriorityValue, string> = {
  "عاجلة":     "عاجلة",
  "غير_عاجلة": "غير عاجلة",
};

// ==================== قرارات المراجعة ====================
export const ReviewDecision = {
  APPROVED: "approved",
  REJECTED: "rejected",
  PARTIAL: "partial",
  NOTES_APPLIED: "تم_الأخذ_بالملاحظات",
  NOTES_PARTIAL: "تم_الأخذ_جزئياً",
  NOTES_NOT_APPLIED: "لم_يتم_الأخذ",
} as const;

export type ReviewDecisionType = typeof ReviewDecision[keyof typeof ReviewDecision];

export const ReviewDecisionLabels: Record<ReviewDecisionType, string> = {
  approved: "معتمد",
  rejected: "مرفوض",
  partial: "اعتماد جزئي",
  "تم_الأخذ_بالملاحظات": "تم الأخذ بالملاحظات",
  "تم_الأخذ_جزئياً": "تم الأخذ بالملاحظات جزئياً",
  "لم_يتم_الأخذ": "لم يتم الأخذ بالملاحظات",
};

// ==================== أنواع العملاء ====================
export const ClientType = {
  INDIVIDUAL: "فرد",
  COMPANY: "شركة",
  INSTITUTION: "مؤسسة",
  WAQF: "وقف",
  ASSOCIATION: "جمعية",
} as const;

export type ClientTypeValue = typeof ClientType[keyof typeof ClientType];

// ==================== Consultation Stage (rebuild per consultations-rebuild-spec.md §3.1.1) ====================
// Phase-8 — RECEIVED_PENDING_COMPLETION inserted at position 2 of the
// linear path (between RECEIVED and STUDY). Distinct value from the
// cases-side "استكمال_البيانات" (which is unchanged); both render with
// the same Arabic label "استكمال المرفقات والبيانات" — the value is an
// internal token, the label is what users see.
export const ConsultationStage = {
  RECEIVED:                    "استلام",
  RECEIVED_PENDING_COMPLETION: "استكمال_المرفقات_والبيانات",
  STUDY:                       "دراسة",
  DRAFTING:                    "تحرير",
  INTERNAL_REVIEW:             "مراجعة_داخلية",
  COMMITTEE:                   "لجنة_مراجعة",
  TAKING_NOTES:                "الأخذ_بالملاحظات",
  READY:                       "جاهزة_للإرسال",
  COMPLETED:                   "منجزة",
  // Phone/procedural-only — "in-progress" replaces دراسة on procedural
  // path; "مغلقة" is the explicit terminal stage on both new types
  // (مكتوبة has no مغلقة stage; closure is a status-flip via early-close).
  IN_PROGRESS:                 "جاري_العمل",
  CLOSED_FINAL:                "مغلقة",
} as const;

export type ConsultationStageValue = typeof ConsultationStage[keyof typeof ConsultationStage];

export const ConsultationStageLabels: Record<ConsultationStageValue, string> = {
  "استلام": "استلام",
  "استكمال_المرفقات_والبيانات": "استكمال المرفقات والبيانات",
  "دراسة": "دراسة",
  "تحرير": "تحرير",
  "مراجعة_داخلية": "مراجعة داخلية",
  "لجنة_مراجعة": "لجنة مراجعة",
  "الأخذ_بالملاحظات": "الأخذ بالملاحظات",
  "جاهزة_للإرسال": "جاهزة للإرسال",
  "منجزة": "منجزة",
  "جاري_العمل": "جاري العمل",
  "مغلقة": "مغلقة",
};

// Linear happy-path order for the WRITTEN (مكتوبة) workflow.
// Phase-8 — RECEIVED_PENDING_COMPLETION sits between RECEIVED and STUDY.
// On entering this stage the FE shows a "تجاوز" button alongside the
// normal advance, which jumps directly to STUDY without requiring any
// document upload (handled in the await-completion route layer).
export const ConsultationStagesOrder: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.STUDY,
  ConsultationStage.DRAFTING,
  ConsultationStage.INTERNAL_REVIEW,
  ConsultationStage.COMMITTEE,
  ConsultationStage.READY,
  ConsultationStage.COMPLETED,
];

// All WRITTEN consultation stages in canonical order, including the
// conditional TAKING_NOTES branch (entered only when committee returns
// يوجد_ملاحظات). Used for rollback validation; the linear-path Order
// excludes TAKING_NOTES. TAKING_NOTES branches off ONLY from COMMITTEE
// and always returns to READY after the outcome — it's not in the
// linear path on purpose.
export const ConsultationStagesAll: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.STUDY,
  ConsultationStage.DRAFTING,
  ConsultationStage.INTERNAL_REVIEW,
  ConsultationStage.COMMITTEE,
  ConsultationStage.TAKING_NOTES,
  ConsultationStage.READY,
  ConsultationStage.COMPLETED,
];

// PHONE (هاتفية) workflow — 5-stage simple flow. No internal review /
// committee / taking-notes branch. Terminal CLOSED_FINAL stage is its
// own value (distinct from WRITTEN, which has no closed-stage concept).
export const ConsultationStagesOrderPhone: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.STUDY,
  ConsultationStage.COMPLETED,
  ConsultationStage.CLOSED_FINAL,
];

// PROCEDURAL (إجرائية) workflow — same shape as phone but stage 3 is
// IN_PROGRESS ("جاري_العمل") instead of STUDY ("دراسة").
export const ConsultationStagesOrderProcedural: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.IN_PROGRESS,
  ConsultationStage.COMPLETED,
  ConsultationStage.CLOSED_FINAL,
];

// ==================== Consultation Type (workflow discriminator) ====================
// Picks the workflow flavor at creation time. Stored on the existing
// consultations.consultation_type column — historic rows that hold
// free-text values ("عام" / "تجاري" / etc.) still resolve via
// resolveConsultationType() which falls back to WRITTEN, so existing
// rows keep the full workflow without a backfill.
export const ConsultationType = {
  WRITTEN:    "مكتوبة",
  PHONE:      "هاتفية",
  PROCEDURAL: "إجرائية",
} as const;

export type ConsultationTypeValue = typeof ConsultationType[keyof typeof ConsultationType];

export const ConsultationTypeLabels: Record<ConsultationTypeValue, string> = {
  "مكتوبة":  "مكتوبة",
  "هاتفية":  "هاتفية",
  "إجرائية": "إجرائية",
};

// Maps any stored consultation_type value (including legacy free-text)
// to a canonical workflow type. Anything that isn't an explicit phone/
// procedural value resolves to WRITTEN — the original full workflow.
export function resolveConsultationType(raw: string | null | undefined): ConsultationTypeValue {
  if (raw === ConsultationType.PHONE) return ConsultationType.PHONE;
  if (raw === ConsultationType.PROCEDURAL) return ConsultationType.PROCEDURAL;
  return ConsultationType.WRITTEN;
}

// Returns the canonical stages list (forward order, includes conditional
// branches) for a given workflow type. Used by rollback validation and
// the stages-bar component so each type renders its own progress.
export function getConsultationStagesForType(
  type: ConsultationTypeValue,
): readonly ConsultationStageValue[] {
  if (type === ConsultationType.PHONE) return ConsultationStagesOrderPhone;
  if (type === ConsultationType.PROCEDURAL) return ConsultationStagesOrderProcedural;
  return ConsultationStagesAll;
}

// Remap currentStage when the consultation's workflow type changes. If
// the existing stage is already valid in the new type's stages list,
// keep it. Otherwise apply a small heuristic for stages that semantically
// "match" (intake stays intake, data-completion stays data-completion,
// study↔in-progress, terminal stages collapse to منجزة), and fall back
// to RECEIVED for anything unmapped — the canonical safe restart point.
export function remapConsultationStageForType(
  fromStage: ConsultationStageValue,
  toType: ConsultationTypeValue,
): ConsultationStageValue {
  const targetStages = getConsultationStagesForType(toType);
  if (targetStages.includes(fromStage)) return fromStage;

  // Heuristic mapping by semantic equivalence. Only applied when the
  // raw stage isn't already valid for the target type.
  const semanticMap: Partial<Record<ConsultationStageValue, ConsultationStageValue>> = {
    [ConsultationStage.RECEIVED]:                    ConsultationStage.RECEIVED,
    [ConsultationStage.RECEIVED_PENDING_COMPLETION]: ConsultationStage.RECEIVED_PENDING_COMPLETION,
    // WRITTEN's working/review stages → the new type's stage 3 (STUDY
    // for PHONE / IN_PROGRESS for PROCEDURAL). Pick whichever stage
    // 3 the target uses by reading targetStages directly.
    [ConsultationStage.STUDY]:                       targetStages[2] as ConsultationStageValue,
    [ConsultationStage.DRAFTING]:                    targetStages[2] as ConsultationStageValue,
    [ConsultationStage.INTERNAL_REVIEW]:             targetStages[2] as ConsultationStageValue,
    [ConsultationStage.COMMITTEE]:                   targetStages[2] as ConsultationStageValue,
    [ConsultationStage.TAKING_NOTES]:                targetStages[2] as ConsultationStageValue,
    [ConsultationStage.READY]:                       ConsultationStage.COMPLETED,
    [ConsultationStage.COMPLETED]:                   ConsultationStage.COMPLETED,
    [ConsultationStage.IN_PROGRESS]:                 targetStages[2] as ConsultationStageValue,
    [ConsultationStage.CLOSED_FINAL]:                ConsultationStage.COMPLETED,
  };

  const mapped = semanticMap[fromStage];
  if (mapped && targetStages.includes(mapped)) return mapped;
  return ConsultationStage.RECEIVED;
}

// ==================== Consultation Category (Phase 4 — SLA categories) ====================
// Category is set once at consultation creation (no manual override) and
// drives the expectedDeliveryDate via SLA_DAYS. Stored as plain varchar in
// the DB so a future category addition is a value change with no DDL.
export const ConsultationCategory = {
  QUICK:    "سريعة",
  STANDARD: "عادية",
  LONG:     "طويلة",
} as const;

export type ConsultationCategoryValue = typeof ConsultationCategory[keyof typeof ConsultationCategory];

// SLA days per category — used server-side on insert to compute
// expectedDeliveryDate = createdAt + SLA_DAYS[category].
export const ConsultationCategorySLADays: Record<ConsultationCategoryValue, number> = {
  "سريعة": 1,
  "عادية": 3,
  "طويلة": 14,
};

export const ConsultationCategoryLabels: Record<ConsultationCategoryValue, string> = {
  "سريعة": "سريعة (يوم)",
  "عادية": "عادية (3 أيام)",
  "طويلة": "طويلة (14 يوم)",
};

// ==================== Consultation Status (per consultations-rebuild-spec.md §3.1.2) ====================
// Phase-8 — PAUSED added as an orthogonal lifecycle value. The pause
// route flips status to "paused" and clears it back to "active" on
// unpause; pause_at IS NOT NULL is still the canonical paused indicator
// for the FE (consistent with cases / memos which don't carry a status
// value for pause).
export const ConsultationStatus = {
  ACTIVE:    "active",
  PAUSED:    "paused",
  CONVERTED: "converted",
  CLOSED:    "closed",
} as const;

export type ConsultationStatusValue = typeof ConsultationStatus[keyof typeof ConsultationStatus];

export const ConsultationStatusLabels: Record<ConsultationStatusValue, string> = {
  active:    "active",
  paused:    "معلّقة",
  converted: "converted",
  closed:    "closed",
};
// ==================== Consultation review/committee/outcome decision values ====================
// Per consultations-rebuild-spec.md §3.1.3 / §3.2.1. Used by the dedicated
// /internal-review, /committee-decision, /take-notes-outcome endpoints.

// Aligned with CommitteeDecision.APPROVED on the Arabic value "اعتماد"
// per the dev-feedback rename (Phase 4). The "تم_إعادة_التقديم"
// resubmitted decision was retired in the same pass — the dialog now
// has only two outcomes (اعتماد / يوجد_ملاحظات). Existing review rows
// stored with the old "تم" or "تم_إعادة_التقديم" string remain in the
// DB; the column is plain varchar so no migration is required.
export const InternalReviewDecision = {
  PASSED:      "اعتماد",
  NEEDS_NOTES: "يوجد_ملاحظات",
} as const;

export type InternalReviewDecisionValue = typeof InternalReviewDecision[keyof typeof InternalReviewDecision];

export const CommitteeDecision = {
  APPROVED:    "اعتماد",
  NEEDS_NOTES: "يوجد_ملاحظات",
} as const;

export type CommitteeDecisionValue = typeof CommitteeDecision[keyof typeof CommitteeDecision];

export const NoteOutcome = {
  DONE:     "تم",
  NOT_DONE: "لم_يتم",
  PARTIAL:  "جزئياً",
} as const;

export type NoteOutcomeValue = typeof NoteOutcome[keyof typeof NoteOutcome];


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
// NOTE: POSTPONEMENT/"تأجيل" was unified with NEW_SESSION/"موعد_جديد"; both
// outcomes schedule a next hearing, so they're now a single concept. Old
// DB rows may still carry "تأجيل" — left intact for read-back. Run
// script/backfill-hearing-result.ts to migrate them to "موعد_جديد".
export const HearingResult = {
  NEW_SESSION: "موعد_جديد",
  JUDGMENT: "حكم",
  SETTLEMENT: "صلح",
  SETTLEMENT_REACHED: "تم_الصلح",
  SETTLEMENT_FAILED: "لم_يتم_الصلح",
  // Settlement-only case: client never sent us the conciliation-session
  // link. Pauses the case (15-day clock) via the existing pauseCase
  // mechanism; auto-closed by scheduler if no new session is added.
  SETTLEMENT_LINK_MISSING: "لم_يصلنا_رابط_الصلح",
  DISMISSAL: "شطب",
  // Court ruling: lack of jurisdiction. Triggers a department transfer
  // on the linked case (same flow as the manual transfer button on
  // cases.tsx). The FE shows a department picker when this result is
  // chosen; the server applies the transfer and emits a
  // jurisdiction_transferred activity log entry.
  JURISDICTION_DECLINED: "عدم_الاختصاص",
  OTHER: "أخرى",
} as const;

export type HearingResultValue = typeof HearingResult[keyof typeof HearingResult];

export const HearingStatusLabels: Record<HearingStatusValue, string> = {
  "قادمة": "قادمة",
  "تمت": "تمت",
  "مؤجلة": "مؤجلة",
  "ملغية": "ملغية",
};

export const HearingResultLabels: Record<HearingResultValue, string> = {
  "موعد_جديد": "موعد جديد",
  "حكم": "حكم",
  "صلح": "صلح",
  "تم_الصلح": "تم الصلح",
  "لم_يتم_الصلح": "لم يتم الصلح",
  "لم_يصلنا_رابط_الصلح": "لم يصلنا رابط الصلح",
  "شطب": "شطب",
  "عدم_الاختصاص": "عدم الاختصاص",
  "أخرى": "أخرى",
};

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

export const ObjectionStatusLabels: Record<ObjectionStatusValue, string> = {
  "بانتظار_القرار": "بانتظار القرار",
  "تم_تقديم_الاعتراض": "تم تقديم الاعتراض",
  "لم_يتم_الاعتراض": "لم يتم الاعتراض",
  "مقبول": "مقبول",
  "مرفوض": "مرفوض",
};

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

export const HearingType = {
  COURT: "محكمة",
  TARADI: "تراضي",
  SETTLEMENT: "تسوية_ودية",
} as const;

export type HearingTypeValue = typeof HearingType[keyof typeof HearingType];

// ==================== أنواع المذكرات ====================
export const MemoType = {
  LAWSUIT_DRAFT: "تحرير_دعوى",
  RESPONSE: "مذكرة_جوابية",
  OBJECTION: "لائحة_اعتراضية",
  CASSATION: "لائحة_نقض",
  OTHER: "أخرى",
} as const;

export type MemoTypeValue = typeof MemoType[keyof typeof MemoType];

export const MemoTypeLabels: Record<MemoTypeValue, string> = {
  "تحرير_دعوى": "تحرير دعوى",
  "مذكرة_جوابية": "مذكرة جوابية",
  "لائحة_اعتراضية": "لائحة اعتراضية",
  "لائحة_نقض": "لائحة نقض",
  "أخرى": "أخرى",
};

// ==================== حالات المذكرة ====================
export const MemoStatus = {
  NOT_STARTED: "لم_تبدأ",
  DRAFTING: "قيد_التحرير",
  IN_REVIEW: "قيد_المراجعة",
  PENDING_APPROVAL: "بانتظار_الاعتماد",
  REVISION_REQUIRED: "تحتاج_تعديل",
  APPROVED: "معتمدة",
  SUBMITTED: "مرفوعة",
  CANCELLED: "ملغاة",
} as const;

export type MemoStatusValue = typeof MemoStatus[keyof typeof MemoStatus];

export const MemoStatusLabels: Record<MemoStatusValue, string> = {
  "لم_تبدأ": "لم تبدأ",
  "قيد_التحرير": "قيد التحرير",
  "قيد_المراجعة": "قيد المراجعة",
  "بانتظار_الاعتماد": "بانتظار الاعتماد",
  "تحتاج_تعديل": "تحتاج تعديل",
  "معتمدة": "معتمدة",
  "مرفوعة": "مرفوعة",
  "ملغاة": "ملغاة",
};

// ==================== Memo Stage (Phase-9 review workflow) ====================
// Mirrors the consultations 7+1-stage workflow but with memo-specific
// terminal labels: جاهزة_للرفع / مرفوعة (filing) instead of
// جاهزة_للإرسال / منجزة (delivery). TAKING_NOTES is conditional, only
// reached when committee returns "يوجد_ملاحظات".
//
// Stored on memos.current_stage (added in Phase-9). The legacy `status`
// column is retained for cancellation ("ملغاة") and back-compat reads;
// the new workflow operates on currentStage.
export const MemoStage = {
  RECEIVED:        "استلام",
  DRAFTING:        "تحرير",
  INTERNAL_REVIEW: "مراجعة_داخلية",
  COMMITTEE:       "لجنة_مراجعة",
  TAKING_NOTES:    "الأخذ_بالملاحظات",
  READY:           "جاهزة_للرفع",
  FILED:           "مرفوعة",
} as const;

export type MemoStageValue = typeof MemoStage[keyof typeof MemoStage];

export const MemoStageLabels: Record<MemoStageValue, string> = {
  "استلام":           "استلام",
  "تحرير":            "تحرير",
  "مراجعة_داخلية":    "مراجعة داخلية",
  "لجنة_مراجعة":      "لجنة مراجعة",
  "الأخذ_بالملاحظات": "الأخذ بالملاحظات",
  "جاهزة_للرفع":      "جاهزة للرفع",
  "مرفوعة":           "مرفوعة",
};

// Linear happy-path order (excludes TAKING_NOTES, which is conditional).
export const MemoStagesOrder: MemoStageValue[] = [
  MemoStage.RECEIVED,
  MemoStage.DRAFTING,
  MemoStage.INTERNAL_REVIEW,
  MemoStage.COMMITTEE,
  MemoStage.READY,
  MemoStage.FILED,
];

// All stages in canonical order, including the conditional TAKING_NOTES
// branch (entered only when committee returns يوجد_ملاحظات). Used for
// rollback validation and for the stages bar when the memo has been
// through TAKING_NOTES at least once.
export const MemoStagesAll: MemoStageValue[] = [
  MemoStage.RECEIVED,
  MemoStage.DRAFTING,
  MemoStage.INTERNAL_REVIEW,
  MemoStage.COMMITTEE,
  MemoStage.TAKING_NOTES,
  MemoStage.READY,
  MemoStage.FILED,
];

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
  mustChangePassword: boolean;
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
  plaintiffName: string;
  opponentName: string;
  opponentLawyer: string;
  opponentPhone: string;
  opponentNotes: string;
  whatsappGroupLink: string;
  googleDriveFolderId: string;
  reviewNotes: string;
  platformReviewNotes: string;
  platformReviewResubmitted: boolean;
  reviewDecision: ReviewDecisionType | null;
  reviewActionTaken: string | null;
  priority: PriorityType;
  lastHearingResult: string | null;
  lastHearingDate: string | null;
  nextHearingDate: string | null;
  nextHearingTime: string | null;
  activeMemoCount: number;
  caseClassification: CaseClassificationValue;
  previousHearingsCount: number;
  currentSituation: string;
  responseDeadline: string | null;
  taradiStatus: string | null;
  taradiNumber: string | null;
  mohrStatus: string | null;
  mohrNumber: string | null;
  memoRequired: boolean;
  amicableSettlementDirected: boolean;
  adminCaseSubType: string | null;
  prescriptionDate: string | null;
  najizNumber: string;
  grievanceRequired: boolean;
  grievanceDate: string | null;
  grievanceResult: string | null;
  struckOffDate: string | null;
  struckOffReopenDeadline: string | null;
  appealLawyerId: string | null;
  internalReviewerId: string | null;
  moeenNumber: string | null;
  clientRole: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
  autoArchiveDate: string | null;
  isSettlementCase: boolean;
  convertedFromConsultationId: string | null;
  closureReason: string | null;
  closureReasonOther: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  // Phase-8 — orthogonal pause + await-completion state. paused_at
  // non-null is the canonical "this case is paused" indicator; status
  // (workflow stage) is intentionally not touched.
  pauseReason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
  awaitingCompletion: boolean;
  savedStage: string | null;
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
  // Stored as plain varchar — holds the workflow discriminator
  // (ConsultationTypeValue: مكتوبة / هاتفية / إجرائية) for new rows, and
  // legacy free-text values ("عام" / "تجاري" / etc.) for pre-rollout
  // rows. Read via resolveConsultationType() which collapses anything
  // outside the new enum down to WRITTEN.
  consultationType: string;
  deliveryType: DeliveryTypeValue;
  currentStage: ConsultationStageValue;
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
  closureReason: string | null;
  closureReasonOther: string | null;
  category: ConsultationCategoryValue;
  expectedDeliveryDate: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  // Phase-8 — orthogonal pause + await-completion state. status also
  // flips to "paused" / back to "active" on the consultations side
  // (ConsultationStatus has the value); paused_at IS NOT NULL stays
  // the canonical FE indicator across all 3 entities.
  pauseReason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
  awaitingCompletion: boolean;
  savedStage: string | null;
  // Committee-referral fields. internalReviewerId is set/cleared by
  // department_head / admin_support / branch_manager (mirrors cases /
  // memos). priority + priorityReason are editable by anyone who can
  // edit the consultation. All three nullable so legacy rows render as
  // "not set". priority is intentionally untyped (string) at this
  // boundary so legacy rows that never had the column don't widen the
  // PriorityType union.
  internalReviewerId: string | null;
  priority: string | null;
  priorityReason: string | null;
}

// Per consultations-rebuild-spec.md §3.2.2 (early-close): "match the cases
// early-close pattern (4 reasons + 'other' with custom text)". The spec
// doesn't enumerate the 4 reasons so we pick four reasonable consultation-
// domain values; English keys/values keep this commit free of typed Arabic.
// Frontend can map keys to Arabic display labels in a later commit.
export const ConsultationClosureReason = {
  CLIENT_CANCELLED:    "client_cancelled",
  ANSWERED_VERBALLY:   "answered_verbally",
  DUPLICATE:           "duplicate",
  NO_LONGER_NEEDED:    "no_longer_needed",
  OTHER:               "other",
} as const;

export type ConsultationClosureReasonValue = typeof ConsultationClosureReason[keyof typeof ConsultationClosureReason];

// ==================== Consultation helper-row interfaces (rebuild §3.1.3) ====================
export interface ConsultationStudy {
  id: string;
  consultationId: string;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface ConsultationDraft {
  id: string;
  consultationId: string;
  content: string;
  createdBy: string;
  createdAt: string;
}

export interface ConsultationReview {
  id: string;
  consultationId: string;
  reviewerId: string;
  // values: اعتماد | يوجد_ملاحظات (Phase 4 trim — the resubmitted decision
  // was retired and the positive decision was renamed from "تم" to "اعتماد"
  // to match the committee outcome label).
  decision: string;
  notes: string;
  createdAt: string;
}

export interface ConsultationCommitteeDecision {
  id: string;
  consultationId: string;
  // values: اعتماد | يوجد_ملاحظات (per spec §3.1.3 / §3.2.1)
  decision: string;
  notes: string;
  decidedBy: string;
  decidedAt: string;
}

export interface ConsultationNoteOutcome {
  id: string;
  consultationId: string;
  // values: تم | لم_يتم | جزئياً (per spec §3.1.3 / §3.2.1)
  outcome: string;
  notes: string;
  recordedBy: string;
  recordedAt: string;
}

// Phase-5 — one row per expectedDeliveryDate extension. The dialog
// renders these as a collapsible history list. oldExpectedDeliveryDate
// is nullable so the very first extension on a row that never had a
// computed due date (legacy data) still records cleanly.
export interface ConsultationDeliveryExtension {
  id: string;
  consultationId: string;
  oldExpectedDeliveryDate: string | null;
  newExpectedDeliveryDate: string;
  reason: string;
  extendedBy: string;
  extendedAt: string;
}

// Phase-6 — activity-log entry mirroring the case_activity_log pattern.
// One row per meaningful event on a consultation. metadata carries the
// structured details specific to each activityType so the timeline
// can render rich descriptions without extra joins.
// Phase-8 additions: paused / unpaused / await_completion /
// resume_from_completion / completion_skipped. completion_skipped is
// consultations-only (the "تجاوز" button on the new
// RECEIVED_PENDING_COMPLETION stage); the other 4 also exist on cases
// and memos.
export const ConsultationActivityType = {
  CREATED:                "created",
  ASSIGNED:               "assigned",
  STAGE_ADVANCED:         "stage_advanced",
  STAGE_RETURNED:         "stage_returned",
  INTERNAL_REVIEW:        "internal_review",
  COMMITTEE_DECISION:     "committee_decision",
  TAKE_NOTES_OUTCOME:     "take_notes_outcome",
  RETURNED_TO_COMMITTEE:  "returned_to_committee",
  DELIVERY_EXTENDED:      "delivery_extended",
  CONVERTED_TO_CASE:      "converted_to_case",
  EARLY_CLOSED:           "early_closed",
  GENERAL_NOTE:           "general_note",
  PAUSED:                 "paused",
  UNPAUSED:               "unpaused",
  AWAIT_COMPLETION:       "await_completion",
  RESUME_FROM_COMPLETION: "resume_from_completion",
  COMPLETION_SKIPPED:     "completion_skipped",
  TYPE_CHANGED:           "consultation_type_changed",
} as const;

export type ConsultationActivityTypeValue =
  typeof ConsultationActivityType[keyof typeof ConsultationActivityType];

export const ConsultationActivityTypeLabels: Record<ConsultationActivityTypeValue, string> = {
  created:                  "إنشاء",
  assigned:                 "إسناد",
  stage_advanced:           "تقدم في المرحلة",
  stage_returned:           "إرجاع للمرحلة السابقة",
  internal_review:          "مراجعة داخلية",
  committee_decision:       "قرار اللجنة",
  take_notes_outcome:       "نتيجة الأخذ بالملاحظات",
  returned_to_committee:    "إعادة للجنة المراجعة",
  delivery_extended:        "تمديد تاريخ التسليم",
  converted_to_case:        "تحويل إلى قضية",
  early_closed:             "إغلاق مبكر",
  general_note:             "ملاحظة عامة",
  paused:                   "تعليق",
  unpaused:                 "إلغاء التعليق",
  await_completion:         "بانتظار استكمال المرفقات والبيانات",
  resume_from_completion:   "العودة من الاستكمال",
  completion_skipped:       "تجاوز مرحلة الاستكمال",
  consultation_type_changed: "تغيير نوع الاستشارة",
};

export interface ConsultationActivity {
  id: string;
  consultationId: string;
  activityType: string;
  description: string;
  metadata: Record<string, any>;
  performedBy: string | null;
  performedAt: string;
}

// ==================== Contracts module enums + interfaces ====================
// New module mirroring the WRITTEN consultation 8-stage flow. Stored
// values are Arabic tokens (matches consultations / cases convention)
// so the activity log stays human-readable without an extra label
// join. resolveContractType + remapContractStageForType behave the
// same as the consultation helpers — anything outside the enum reads
// back as the safest default (REVIEW for the type, RECEIVED for the
// stage).
export const ContractType = {
  REVIEW:  "مراجعة_عقد",
  DRAFT:   "صياغة_عقد",
  PROJECT: "مشروع",
} as const;

export type ContractTypeValue = typeof ContractType[keyof typeof ContractType];

export const ContractTypeLabels: Record<ContractTypeValue, string> = {
  "مراجعة_عقد": "مراجعة عقد",
  "صياغة_عقد":  "صياغة عقد",
  "مشروع":       "مشروع",
};

export function resolveContractType(raw: string | null | undefined): ContractTypeValue {
  if (raw === ContractType.DRAFT) return ContractType.DRAFT;
  if (raw === ContractType.PROJECT) return ContractType.PROJECT;
  return ContractType.REVIEW;
}

export const ContractStage = {
  RECEIVED:                    "استلام",
  RECEIVED_PENDING_COMPLETION: "استكمال_البيانات_والمرفقات",
  DRAFTING:                    "تحرير",
  INTERNAL_REVIEW:             "مراجعة_داخلية",
  COMMITTEE:                   "لجنة_مراجعة",
  TAKING_NOTES:                "الأخذ_بالملاحظات",
  READY:                       "جاهزة_للإرسال",
  CLOSED:                      "مغلقة",
} as const;

export type ContractStageValue = typeof ContractStage[keyof typeof ContractStage];

export const ContractStageLabels: Record<ContractStageValue, string> = {
  "استلام":                       "استلام",
  "استكمال_البيانات_والمرفقات":  "استكمال البيانات والمرفقات",
  "تحرير":                        "تحرير",
  "مراجعة_داخلية":               "مراجعة داخلية",
  "لجنة_مراجعة":                  "لجنة مراجعة",
  "الأخذ_بالملاحظات":             "الأخذ بالملاحظات",
  "جاهزة_للإرسال":                "جاهزة للإرسال",
  "مغلقة":                        "مغلقة",
};

// Linear forward order — excludes the conditional TAKING_NOTES branch
// (entered only when the committee returns يوجد_ملاحظات).
export const ContractStagesOrder: ContractStageValue[] = [
  ContractStage.RECEIVED,
  ContractStage.RECEIVED_PENDING_COMPLETION,
  ContractStage.DRAFTING,
  ContractStage.INTERNAL_REVIEW,
  ContractStage.COMMITTEE,
  ContractStage.READY,
  ContractStage.CLOSED,
];

// All stages including the conditional TAKING_NOTES branch — used by
// the rollback validator + the stages bar when the contract has
// already been through the notes loop.
export const ContractStagesAll: ContractStageValue[] = [
  ContractStage.RECEIVED,
  ContractStage.RECEIVED_PENDING_COMPLETION,
  ContractStage.DRAFTING,
  ContractStage.INTERNAL_REVIEW,
  ContractStage.COMMITTEE,
  ContractStage.TAKING_NOTES,
  ContractStage.READY,
  ContractStage.CLOSED,
];

export function getContractStagesForType(_type: ContractTypeValue): readonly ContractStageValue[] {
  // All three contract types share the same 8-stage flow today —
  // contractType drives the attachment slots, not the workflow. The
  // helper is kept type-aware so per-type stage divergence (if it
  // ever ships) is a one-place change.
  return ContractStagesAll;
}

export function remapContractStageForType(
  fromStage: ContractStageValue,
  toType: ContractTypeValue,
): ContractStageValue {
  // All types share the same stage list, so this is currently a no-op
  // unless `fromStage` somehow holds a value outside the enum (e.g. a
  // legacy row hand-edited to a consultation stage). Falls back to
  // RECEIVED on any unknown input — same safety net as the
  // consultation helper.
  const targetStages = getContractStagesForType(toType);
  if (targetStages.includes(fromStage)) return fromStage;
  return ContractStage.RECEIVED;
}

export const ContractStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  CLOSED: "closed",
} as const;

export type ContractStatusValue = typeof ContractStatus[keyof typeof ContractStatus];

// 2-value priority enum, matching the consultation ConsultationPriority
// shape. priority is set/changed only on the committee referral card.
export const ContractPriority = {
  URGENT:     "عاجلة",
  NOT_URGENT: "غير_عاجلة",
} as const;

export type ContractPriorityValue = typeof ContractPriority[keyof typeof ContractPriority];

export const ContractPriorityLabels: Record<ContractPriorityValue, string> = {
  "عاجلة":     "عاجلة",
  "غير_عاجلة": "غير عاجلة",
};

// Designated attachment slots. Each non-null slot is single-file —
// re-uploading replaces the existing row + deletes the old file from
// disk (enforced server-side via a partial unique index on
// (contract_id, slot_key) WHERE slot_key IS NOT NULL).
export const ContractAttachmentSlot = {
  CONTRACT_UNDER_REVIEW: "contract_under_review",
  REVIEW_STUDY:          "review_study",
  MOU:                   "mou",
  DRAFTED_CONTRACT:      "drafted_contract",
} as const;

export type ContractAttachmentSlotValue =
  typeof ContractAttachmentSlot[keyof typeof ContractAttachmentSlot];

export const ContractAttachmentSlotLabels: Record<ContractAttachmentSlotValue, string> = {
  contract_under_review: "العقد محل المراجعة",
  review_study:          "دراسة المراجعة",
  mou:                   "مذكرة تفاهم",
  drafted_contract:      "العقد المُصاغ",
};

// Per-type required slots, surfaced on the create dialog and enforced
// at advance-stage time. The validation table lives next to the enum
// so route + UI agree on the rules.
export interface ContractSlotRule {
  slotKey: ContractAttachmentSlotValue;
  label: string;
  // When set, the route handler rejects an advance/skip transition
  // FROM `requiredBeforeLeavingStage` until a row exists in this slot.
  // null means "optional, no transition gate".
  requiredBeforeLeavingStage: ContractStageValue | null;
}

export const ContractSlotsByType: Record<ContractTypeValue, ContractSlotRule[]> = {
  "مراجعة_عقد": [
    {
      slotKey: ContractAttachmentSlot.CONTRACT_UNDER_REVIEW,
      label: ContractAttachmentSlotLabels.contract_under_review,
      requiredBeforeLeavingStage: ContractStage.RECEIVED,
    },
    {
      slotKey: ContractAttachmentSlot.REVIEW_STUDY,
      label: ContractAttachmentSlotLabels.review_study,
      requiredBeforeLeavingStage: ContractStage.DRAFTING,
    },
  ],
  "صياغة_عقد": [
    {
      slotKey: ContractAttachmentSlot.MOU,
      label: ContractAttachmentSlotLabels.mou,
      requiredBeforeLeavingStage: null,
    },
    {
      slotKey: ContractAttachmentSlot.DRAFTED_CONTRACT,
      label: ContractAttachmentSlotLabels.drafted_contract,
      requiredBeforeLeavingStage: ContractStage.DRAFTING,
    },
  ],
  "مشروع": [],
};

export const ContractActivityType = {
  CREATED:                  "created",
  ASSIGNED:                 "assigned",
  STAGE_ADVANCED:           "stage_advanced",
  STAGE_RETURNED:           "stage_returned",
  INTERNAL_REVIEW:          "internal_review",
  COMMITTEE_DECISION:       "committee_decision",
  TAKE_NOTES_OUTCOME:       "take_notes_outcome",
  RETURNED_TO_COMMITTEE:    "returned_to_committee",
  EARLY_CLOSED:             "early_closed",
  GENERAL_NOTE:             "general_note",
  PAUSED:                   "paused",
  UNPAUSED:                 "unpaused",
  AWAIT_COMPLETION:         "await_completion",
  RESUME_FROM_COMPLETION:   "resume_from_completion",
  COMPLETION_SKIPPED:       "completion_skipped",
  TYPE_CHANGED:             "contract_type_changed",
  DEPARTMENT_TRANSFERRED:   "department_transferred",
  ATTACHMENT_ADDED:         "attachment_added",
  ATTACHMENT_REPLACED:      "attachment_replaced",
  ATTACHMENT_DELETED:       "attachment_deleted",
  // Inline-edit activities for the committee referral card. Without
  // these, changes to the persistent reviewer / priority / reason
  // via PATCH would be silent — the audit log would skip the very
  // edits that drive the committee form.
  REVIEWER_ASSIGNED:        "reviewer_assigned",
  PRIORITY_SET:             "priority_set",
} as const;

export type ContractActivityTypeValue =
  typeof ContractActivityType[keyof typeof ContractActivityType];

export const ContractActivityTypeLabels: Record<ContractActivityTypeValue, string> = {
  created:                "إنشاء",
  assigned:               "إسناد",
  stage_advanced:         "تقدم في المرحلة",
  stage_returned:         "إرجاع للمرحلة السابقة",
  internal_review:        "مراجعة داخلية",
  committee_decision:     "قرار اللجنة",
  take_notes_outcome:     "نتيجة الأخذ بالملاحظات",
  returned_to_committee:  "إعادة للجنة المراجعة",
  early_closed:           "إغلاق مبكر",
  general_note:           "ملاحظة عامة",
  paused:                 "تعليق",
  unpaused:               "إلغاء التعليق",
  await_completion:       "بانتظار استكمال البيانات والمرفقات",
  resume_from_completion: "العودة من الاستكمال",
  completion_skipped:     "تجاوز مرحلة الاستكمال",
  contract_type_changed:  "تغيير نوع العقد",
  department_transferred: "تحويل القسم",
  attachment_added:       "إضافة مرفق",
  attachment_replaced:    "استبدال مرفق",
  attachment_deleted:     "حذف مرفق",
  reviewer_assigned:      "تعيين مراجع داخلي",
  priority_set:           "تحديث الأولوية",
};

export interface Contract {
  id: string;
  contractNumber: string;
  title: string;
  clientId: string;
  contractType: string;
  description: string;
  currentStage: ContractStageValue;
  status: ContractStatusValue;
  departmentId: string;
  assignedTo: string | null;
  internalReviewerId: string | null;
  priority: string | null;
  priorityReason: string | null;
  reviewNotes: string;
  closureReason: string | null;
  closureReasonOther: string | null;
  pauseReason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
  awaitingCompletion: boolean;
  savedStage: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ContractAttachment {
  id: string;
  contractId: string;
  slotKey: string | null;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description: string | null;
  uploadedBy: string;
  uploadedAt: string;
  // Runtime-derived on the GET /api/contracts/:id/attachments
  // response (not stored). True for rows whose filePath is a legacy
  // local-disk path from before the Object-Storage migration — the
  // underlying file is gone and the UI surfaces a re-upload prompt
  // instead of preview/download buttons. New rows from the
  // Object-Storage path always report missing=false.
  missing?: boolean;
}

export interface ContractActivity {
  id: string;
  contractId: string;
  activityType: string;
  description: string;
  metadata: Record<string, any>;
  performedBy: string | null;
  performedAt: string;
}

// Phase-8 — memo activity log mirroring ConsultationActivityType.
// Phase-9 — extended with the review-workflow events (assigned, stage
// transitions, internal-review, committee-decision, take-notes-outcome)
// to match the consultations side. Stored as plain varchar so adding a
// new event kind is a value change, not a DDL change.
export const MemoActivityType = {
  CREATED:                "created",
  ASSIGNED:               "assigned",
  STAGE_ADVANCED:         "stage_advanced",
  STAGE_RETURNED:         "stage_returned",
  INTERNAL_REVIEW:        "internal_review",
  COMMITTEE_DECISION:     "committee_decision",
  TAKE_NOTES_OUTCOME:     "take_notes_outcome",
  RETURNED_TO_COMMITTEE:  "returned_to_committee",
  PAUSED:                 "paused",
  UNPAUSED:               "unpaused",
  AWAIT_COMPLETION:       "await_completion",
  RESUME_FROM_COMPLETION: "resume_from_completion",
  CANCELLED:              "cancelled",
} as const;

export type MemoActivityTypeValue =
  typeof MemoActivityType[keyof typeof MemoActivityType];

export const MemoActivityTypeLabels: Record<MemoActivityTypeValue, string> = {
  created:                "إنشاء",
  assigned:               "إسناد",
  stage_advanced:         "تقدم في المرحلة",
  stage_returned:         "إرجاع للمرحلة السابقة",
  internal_review:        "مراجعة داخلية",
  committee_decision:     "قرار اللجنة",
  take_notes_outcome:     "نتيجة الأخذ بالملاحظات",
  returned_to_committee:  "إعادة للجنة المراجعة",
  paused:                 "تعليق",
  unpaused:               "إلغاء التعليق",
  await_completion:       "بانتظار استكمال المرفقات والبيانات",
  resume_from_completion: "العودة من الاستكمال",
  cancelled:              "إلغاء المذكرة",
};

export interface MemoActivity {
  id: string;
  memoId: string;
  activityType: string;
  description: string;
  metadata: Record<string, any>;
  performedBy: string | null;
  performedAt: string;
}

// Phase-9 — review-workflow helper-row interfaces. Mirror the
// consultation_* counterparts. The decision/outcome columns hold the
// shared Arabic enum values (InternalReviewDecision / CommitteeDecision
// / NoteOutcome) — same tokens as on the consultations side.
export interface MemoReview {
  id: string;
  memoId: string;
  reviewerId: string;
  decision: string;
  notes: string;
  createdAt: string;
}

export interface MemoCommitteeDecision {
  id: string;
  memoId: string;
  decision: string;
  notes: string;
  decidedBy: string;
  decidedAt: string;
}

export interface MemoNoteOutcome {
  id: string;
  memoId: string;
  outcome: string;
  notes: string;
  recordedBy: string;
  recordedAt: string;
}

export interface Hearing {
  id: string;
  caseId: string;
  hearingDate: string;
  hearingTime: string;
  hearingType: string;
  courtName: string;
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
  memoRequired: boolean;
  opponentResponseRequired: boolean;
  hearingReport: string;
  recommendations: string;
  nextSteps: string;
  contactCompleted: boolean;
  reportCompleted: boolean;
  adminTasksCreated: boolean;
  opponentMemos: string;
  hearingMinutes: string;
  attendingLawyerId: string | null;
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

// ==================== المرفقات ====================
export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}

// ==================== المذكرات القانونية ====================
export interface Memo {
  id: string;
  caseId: string;
  hearingId: string | null;
  memoType: MemoTypeValue;
  memoTypeOther: string;
  title: string;
  description: string;
  status: MemoStatusValue;
  priority: string;
  assignedTo: string;
  createdBy: string;
  deadline: string;
  startedAt: string | null;
  completedAt: string | null;
  submittedAt: string | null;
  content: string;
  fileLink: string;
  reviewNotes: string;
  reviewerId: string | null;
  reviewedAt: string | null;
  returnCount: number;
  isAutoGenerated: boolean;
  autoGenerateReason: string;
  reminderSent3Days: boolean;
  reminderSent1Day: boolean;
  reminderSentOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  // Phase-8 — orthogonal pause + await-completion state. paused_at
  // non-null is the canonical "this memo is paused" indicator; status
  // (memo workflow state) is intentionally not touched. saved_stage
  // stores the memo status to restore on resume from await_completion.
  pauseReason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
  awaitingCompletion: boolean;
  savedStage: string | null;
  // Phase-9 — review-workflow stage. Null on legacy memos until the
  // backfill in script/backfill-memo-stages.sql runs. New memos start
  // at MemoStage.RECEIVED ("استلام").
  currentStage: MemoStageValue | null;
  // Phase-9.1 — designated peer reviewer for the مراجعة_داخلية stage.
  // Mirrors LawCase.internalReviewerId.
  internalReviewerId: string | null;
  // Phase-9.2 — reason captured at cancellation time. Null for legacy
  // pre-feature memos that were cancelled without a reason.
  cancellationReason: string | null;
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
  communicationType: string | null;
  duration: string | null;
  followUpRequired: boolean;
  followUpDate: string | null;
  followUpNotes: string | null;
  followUpCompleted: boolean;
  caseId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== Zod Schemas ====================

export const insertUserSchema = z.object({
  username: z.string().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"),
  password: z.string()
    .min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    .max(128, "كلمة المرور طويلة جداً"),
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
    "technical_support",
    "viewer",
  ]),
  departmentId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  canBeAssignedCases: z.boolean().default(false),
  canBeAssignedConsultations: z.boolean().default(false),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب").optional(),
  username: z.string().min(3, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل").optional(),
  email: z.string().email("البريد الإلكتروني غير صحيح").optional(),
  phone: z.string().optional(),
  role: z.enum([
    "branch_manager",
    "cases_review_head",
    "consultations_review_head",
    "department_head",
    "admin_support",
    "employee",
    "hr",
    "technical_support",
    "viewer",
  ]).optional(),
  departmentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل").max(128).optional(),
  mustChangePassword: z.boolean().optional(),
  canBeAssignedCases: z.boolean().optional(),
  canBeAssignedConsultations: z.boolean().optional(),
}).strict();

export type UpdateUser = z.infer<typeof updateUserSchema>;

export const insertClientSchema = z.object({
  clientType: z.enum(["فرد", "شركة", "مؤسسة", "وقف", "جمعية"]),
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
  caseType: z.string().min(1, "نوع القضية مطلوب"),
  caseTypeOther: z.string().optional().default(""),
  departmentId: z.string().optional(),
  departmentOther: z.string().optional().default(""),
  priority: z.enum(["عاجل", "عالي", "متوسط", "منخفض"]).default("متوسط"),
  courtName: z.string().optional().default(""),
  courtCaseNumber: z.string().optional().default(""),
  judgeName: z.string().optional().default(""),
  plaintiffName: z.string().optional().default(""),
  opponentName: z.string().optional().default(""),
  opponentLawyer: z.string().optional().default(""),
  opponentPhone: z.string().optional().default(""),
  opponentNotes: z.string().optional().default(""),
  whatsappGroupLink: z.string().optional().default(""),
  googleDriveFolderId: z.string().optional().default(""),
  caseClassification: z.enum(["قيد_الدراسة", "منظورة_بالمحكمة"]).default("قيد_الدراسة"),
  clientRole: z.string().nullable().optional(),
  previousHearingsCount: z.number().optional().default(0),
  currentSituation: z.string().optional().default(""),
  responseDeadline: z.string().nullable().optional(),
  adminCaseSubType: z.enum(["تظلم", "قضية"]).nullable().optional(),
  prescriptionDate: z.string().nullable().optional(),
  memoRequired: z.boolean().optional().default(false),
});

export type InsertCase = z.infer<typeof insertCaseSchema>;

export const insertConsultationSchema = z.object({
  clientId: z.string().min(1, "العميل مطلوب"),
  consultationType: z.string().min(1, "نوع الاستشارة مطلوب"),
  // @deprecated Phase-5 — deliveryType was retired from the UI. Kept
  // optional in the API schema so older clients still validate; the
  // server falls back to "مكتوبة" via the column default.
  deliveryType: z.enum(["مكتوبة", "شفهية"]).optional(),
  departmentId: z.string().optional(),
  questionSummary: z.string().min(1, "ملخص السؤال مطلوب"),
  whatsappGroupLink: z.string().optional().default(""),
  googleDriveFolderId: z.string().optional().default(""),
  // Phase-4 SLA category. Defaults to "عادية" (3-day SLA) so older clients
  // that don't send the field get the standard SLA. The server uses this
  // to compute expectedDeliveryDate at insert time.
  category: z.enum(["سريعة", "عادية", "طويلة"]).optional().default("عادية"),
  // Committee-referral fields are NOT accepted at create — per user
  // feedback (Phase-9.1) the committee form is the only place priority,
  // priority_reason, and internal_reviewer_id can be set/changed. PATCH
  // /api/consultations/:id continues to accept them with per-field
  // role gates.
});

export type InsertConsultation = z.infer<typeof insertConsultationSchema>;

// Body schema for POST /api/contracts. Committee fields (priority,
// priority_reason, internal_reviewer_id) are NOT accepted at create —
// same convention as consultations: PATCH is the only path that can
// set them, and only on the committee referral card.
export const insertContractSchema = z.object({
  clientId:       z.string().min(1, "العميل مطلوب"),
  // Title cap matches the DB column's varchar(500). Without it a
  // hand-rolled API call could send a 10k-char title and 500 the
  // insert when Postgres rejects the over-length value.
  title:          z.string().min(1, "العنوان مطلوب").max(500, "العنوان طويل جداً"),
  contractType:   z.enum([ContractType.REVIEW, ContractType.DRAFT, ContractType.PROJECT]),
  departmentId:   z.string().min(1, "القسم مطلوب"),
  description:    z.string().optional().default(""),
});

export type InsertContract = z.infer<typeof insertContractSchema>;

// Phase-5 — body for POST /api/consultations/:id/extend-delivery.
// newExpectedDeliveryDate must parse as a date; we keep it as a string in
// the wire format and let the route turn it into a Date. reason is
// required (free text) so the audit log carries enough context.
export const extendConsultationDeliverySchema = z.object({
  newExpectedDeliveryDate: z.string().min(1, "تاريخ التسليم الجديد مطلوب"),
  reason: z.string().min(1, "سبب التمديد مطلوب"),
});

export type ExtendConsultationDeliveryInput = z.infer<typeof extendConsultationDeliverySchema>;

export const insertHearingSchema = z.object({
  caseId: z.string().min(1, "القضية مطلوبة"),
  hearingDate: z.string().min(1, "تاريخ الجلسة مطلوب"),
  hearingTime: z.string().min(1, "وقت الجلسة مطلوب"),
  hearingType: z.string().optional().default("محكمة"),
  courtName: z.string().min(1, "يرجى إدخال اسم المحكمة"),
  courtNameOther: z.string().nullable().optional(),
  courtRoom: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  responseRequired: z.boolean().optional().default(false),
  attendingLawyerId: z.string().nullable().optional(),
});

export type InsertHearing = z.infer<typeof insertHearingSchema>;

export const hearingResultSchema = z.object({
  result: z.enum(["موعد_جديد", "حكم", "صلح", "تم_الصلح", "لم_يتم_الصلح", "لم_يصلنا_رابط_الصلح", "شطب", "عدم_الاختصاص", "أخرى"]),
  resultDetails: z.string().optional().default(""),
  // Jurisdiction-declined transfer payload. Required iff result===عدم_الاختصاص.
  // Applied server-side to the linked case (departmentId, stage reset, lawyers cleared).
  transferToDepartmentId: z.string().nullable().optional(),
  transferReason: z.string().optional(),
  // Judgment fields
  judgmentType: z.enum(["لصالحنا", "ضدنا", "جزئي"]).nullable().optional(),
  judgmentFinal: z.boolean().nullable().optional(),
  needsAppeal: z.boolean().nullable().optional(),
  // Legacy judgment fields (kept for compatibility)
  judgmentSide: z.enum(["لصالحنا", "ضدنا"]).nullable().optional(),
  objectionFeasible: z.boolean().nullable().optional(),
  objectionDeadline: z.string().nullable().optional(),
  // Session/postponement fields
  nextHearingDate: z.string().nullable().optional(),
  nextHearingTime: z.string().nullable().optional(),
  responseRequired: z.boolean().optional().default(false),
  // New session fields
  memoRequired: z.boolean().optional().default(false),
  opponentResponseRequired: z.boolean().optional().default(false),
  // Conciliation result
  conciliationResult: z.enum(["تم_الصلح", "لم_يتم_الصلح"]).nullable().optional(),
  // Settlement-only cases (isSettlementCase=true) need an explicit choice on
  // "لم يتم الصلح": "close" finalizes and closes the case, "continue" flips
  // isSettlementCase=false and routes the case onto the regular litigation
  // path. Non-settlement cases ignore this field.
  afterFailedSettlementChoice: z.enum(["close", "continue"]).nullable().optional(),
  userId: z.string().optional(),
  caseId: z.string().nullable().optional(),
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

export const insertAttachmentSchema = z.object({
  entityType: z.enum(["case", "consultation"]),
  entityId: z.string().min(1, "معرف العنصر مطلوب"),
  fileName: z.string().min(1, "اسم الملف مطلوب"),
  fileUrl: z.string().url("رابط الملف غير صحيح"),
  fileType: z.string().optional().default(""),
  fileSize: z.number().optional().default(0),
  uploadedBy: z.string().min(1, "معرف الرافع مطلوب"),
});

export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;

export const insertMemoSchema = z.object({
  caseId: z.string().min(1, "القضية مطلوبة"),
  hearingId: z.string().nullable().optional(),
  memoType: z.enum(["تحرير_دعوى", "مذكرة_جوابية", "لائحة_اعتراضية", "لائحة_نقض", "أخرى"]),
  memoTypeOther: z.string().optional().default(""),
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  priority: z.enum(["عاجل", "عالي", "متوسط", "منخفض"]).default("عالي"),
  assignedTo: z.string().min(1, "المحامي المكلف مطلوب"),
  deadline: z.string().min(1, "الموعد النهائي مطلوب"),
  content: z.string().optional().default(""),
  fileLink: z.string().optional().default(""),
});

export type InsertMemo = z.infer<typeof insertMemoSchema>;

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
  return ["branch_manager", "admin_support"].includes(role);
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
  return ["branch_manager", "department_head"].includes(role);
}

export function canAccessHR(role: UserRoleType): boolean {
  return ["branch_manager", "hr"].includes(role);
}

export function canCloseCases(role: UserRoleType): boolean {
  return ["branch_manager", "admin_support"].includes(role);
}

export function canAssignInDepartment(role: UserRoleType): boolean {
  return ["branch_manager", "department_head"].includes(role);
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

export function canViewAllMemos(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head", "admin_support"].includes(role);
}

export function canCreateMemos(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head", "department_head", "admin_support"].includes(role);
}

export function canReviewMemos(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head"].includes(role);
}

export function canChangeMemoStatus(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head"].includes(role);
}

export function canDeleteMemos(role: UserRoleType): boolean {
  return role === "branch_manager";
}

export function canAddHearings(role: UserRoleType): boolean {
  return ["branch_manager", "department_head", "employee", "admin_support"].includes(role);
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

  // إشعارات الجلسات
  HEARING_ADDED: "hearing_added",
  HEARING_RESULT_RECORDED: "hearing_result_recorded",
  HEARING_REMINDER_48H: "hearing_reminder_48h",
  HEARING_REMINDER_24H: "hearing_reminder_24h",
  HEARING_JUDGMENT: "hearing_judgment",

  // إشعارات المذكرات
  MEMO_CREATED: "memo_created",
  MEMO_DEADLINE_3DAYS: "memo_deadline_3_days",
  MEMO_DEADLINE_1DAY: "memo_deadline_1_day",
  MEMO_OVERDUE: "memo_overdue",
  MEMO_SENT_TO_REVIEW: "memo_sent_to_review",
  MEMO_APPROVED: "memo_approved",
  MEMO_RETURNED: "memo_returned",
  MEMO_SUBMITTED: "memo_submitted",

  // إشعارات الدعم الفني
  TICKET_CREATED: "ticket_created",
  TICKET_ASSIGNED: "ticket_assigned",
  TICKET_REPLY: "ticket_reply",
  TICKET_STATUS_CHANGED: "ticket_status_changed",
  TICKET_RESOLVED: "ticket_resolved",

  // إشعارات التقارير
  WEEKLY_REPORT: "weekly_report",
  MONTHLY_REPORT: "monthly_report",

  // إشعارات المواعيد النظامية
  LEGAL_DEADLINE_7DAYS: "legal_deadline_7_days",
  LEGAL_DEADLINE_3DAYS: "legal_deadline_3_days",
  LEGAL_DEADLINE_1DAY: "legal_deadline_1_day",
  LEGAL_DEADLINE_OVERDUE: "legal_deadline_overdue",

  // إشعارات التفويض
  DELEGATION_REQUESTED: "delegation_requested",
  DELEGATION_APPROVED: "delegation_approved",
  DELEGATION_EXPIRED: "delegation_expired",

  // متابعة التواصل
  CONTACT_FOLLOWUP_OVERDUE: "contact_followup_overdue",

  // تنبيه جلسة متأخرة
  HEARING_UPDATE_OVERDUE: "hearing_update_overdue",
  HEARING_REMINDER: "hearing_reminder",
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
  hearing_added: "تمت إضافة جلسة",
  hearing_result_recorded: "تم تسجيل نتيجة جلسة",
  hearing_reminder_48h: "تذكير جلسة - 48 ساعة",
  hearing_reminder_24h: "تذكير جلسة - 24 ساعة",
  hearing_judgment: "صدور حكم",
  memo_created: "تم إنشاء مذكرة",
  memo_deadline_3_days: "مذكرة - 3 أيام على الموعد",
  memo_deadline_1_day: "مذكرة - يوم واحد على الموعد",
  memo_overdue: "مذكرة متأخرة",
  memo_sent_to_review: "مذكرة للمراجعة",
  memo_approved: "مذكرة معتمدة",
  memo_returned: "مذكرة مُرجعة",
  memo_submitted: "مذكرة مرفوعة",
  ticket_created: "تذكرة دعم جديدة",
  ticket_assigned: "تم تعيين تذكرة",
  ticket_reply: "رد على تذكرة",
  ticket_status_changed: "تغيير حالة تذكرة",
  ticket_resolved: "تم حل تذكرة",
  weekly_report: "تقرير أسبوعي",
  monthly_report: "تقرير شهري",
  legal_deadline_7_days: "موعد نظامي - 7 أيام",
  legal_deadline_3_days: "موعد نظامي - 3 أيام",
  legal_deadline_1_day: "موعد نظامي - يوم واحد",
  legal_deadline_overdue: "موعد نظامي فائت",
  delegation_requested: "طلب تفويض",
  delegation_approved: "تم اعتماد التفويض",
  delegation_expired: "انتهاء التفويض",
  contact_followup_overdue: "متابعة تواصل متأخرة",
  hearing_update_overdue: "جلسة متأخرة التحديث",
  hearing_reminder: "تذكير بجلسة",
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
  recipientId: string;
  recipientIds?: string[];
  relatedType: "case" | "consultation" | "task" | "hearing" | "memo" | null;
  relatedId: string | null;
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

// ==================== تذاكر الدعم الفني ====================

export const TicketType = {
  BUG: "خلل_فني",
  FEATURE_REQUEST: "اقتراح_تطوير",
  QUESTION: "استفسار",
  UI_ISSUE: "مشكلة_واجهة",
  PERFORMANCE: "بطء_أداء",
  OTHER: "أخرى",
} as const;

export type TicketTypeValue = typeof TicketType[keyof typeof TicketType];

export const TicketTypeLabels: Record<TicketTypeValue, string> = {
  "خلل_فني": "خلل فني / مشكلة تقنية",
  "اقتراح_تطوير": "اقتراح تطوير / ميزة جديدة",
  "استفسار": "استفسار عن استخدام النظام",
  "مشكلة_واجهة": "مشكلة في الواجهة أو العرض",
  "بطء_أداء": "بطء في الأداء",
  "أخرى": "أخرى",
};

export const TicketStatus = {
  NEW: "جديدة",
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد_المعالجة",
  WAITING_RESPONSE: "بانتظار_رد_المستخدم",
  RESOLVED: "تم_الحل",
  CLOSED: "مغلقة",
} as const;

export type TicketStatusValue = typeof TicketStatus[keyof typeof TicketStatus];

export const TicketStatusLabels: Record<TicketStatusValue, string> = {
  "جديدة": "جديدة",
  "مفتوحة": "مفتوحة",
  "قيد_المعالجة": "قيد المعالجة",
  "بانتظار_رد_المستخدم": "بانتظار رد المستخدم",
  "تم_الحل": "تم الحل",
  "مغلقة": "مغلقة",
};

export interface TicketComment {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

export const insertTicketSchema = z.object({
  ticketType: z.enum(["خلل_فني", "اقتراح_تطوير", "استفسار", "مشكلة_واجهة", "بطء_أداء", "أخرى"]),
  title: z.string().min(5, "العنوان يجب أن يكون 5 أحرف على الأقل"),
  description: z.string().min(10, "الوصف يجب أن يكون 10 أحرف على الأقل"),
  relatedPage: z.string().optional().default(""),
  priority: z.enum(["عاجل", "عالي", "متوسط", "منخفض"]).default("متوسط"),
  screenshotUrl: z.string().optional().default(""),
});

export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

// ==================== Saved Filters ====================
export const insertSavedFilterSchema = z.object({
  name: z.string().min(1, "اسم الفلتر مطلوب").max(200),
  filterConfig: z.record(z.any()),
  pageType: z.string().max(50).default("cases"),
});

export const updateSavedFilterSchema = z.object({
  name: z.string().min(1, "اسم الفلتر مطلوب").max(200).optional(),
  filterConfig: z.record(z.any()).optional(),
});

export type InsertSavedFilter = z.infer<typeof insertSavedFilterSchema>;
export type UpdateSavedFilter = z.infer<typeof updateSavedFilterSchema>;
export type SavedFilter = typeof savedFilters.$inferSelect;

export const insertCaseActivitySchema = z.object({
  caseId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  actionType: z.string().min(1),
  title: z.string().min(1),
  details: z.string().optional(),
  previousValue: z.string().optional(),
  newValue: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
});

export type InsertCaseActivity = z.infer<typeof insertCaseActivitySchema>;
export type CaseActivity = typeof caseActivityLog.$inferSelect;

export const insertCaseNoteSchema = z.object({
  caseId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  content: z.string().min(1, "محتوى الملاحظة مطلوب"),
  isPinned: z.boolean().optional().default(false),
  isImportant: z.boolean().optional().default(false),
  category: z.enum(["عام", "ملاحظة_على_القاضي", "ملاحظة_على_الخصم", "ملاحظة_على_العميل", "استراتيجية", "تحذير"]).optional().default("عام"),
});

export type InsertCaseNote = z.infer<typeof insertCaseNoteSchema>;
export type CaseNote = typeof caseNotes.$inferSelect;

export const insertCaseCommentSchema = z.object({
  caseId: z.string().min(1),
  userId: z.string().min(1),
  userName: z.string().min(1),
  content: z.string().min(1, "محتوى التعليق مطلوب"),
});
export type InsertCaseComment = z.infer<typeof insertCaseCommentSchema>;
export type CaseCommentRow = typeof caseComments.$inferSelect;

export const insertLegalDeadlineSchema = z.object({
  caseId: z.string().min(1),
  hearingId: z.string().optional(),
  deadlineType: z.enum(["objection", "cassation", "response", "appeal", "execution", "custom"]),
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().min(1),
  durationDays: z.number().min(1),
  deadlineDate: z.string().min(1),
  status: z.string().optional().default("نشط"),
});

export type InsertLegalDeadline = z.infer<typeof insertLegalDeadlineSchema>;
export type LegalDeadline = typeof legalDeadlines.$inferSelect;

export const insertDelegationSchema = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  reason: z.enum(["إجازة", "مرض", "مهمة_خارجية", "تدريب", "أخرى"]),
  reasonDetails: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  scope: z.enum(["all_cases", "specific_cases"]).optional().default("all_cases"),
  specificCaseIds: z.array(z.string()).optional(),
});

export type InsertDelegation = z.infer<typeof insertDelegationSchema>;
export type DelegationRecord = typeof delegationsTable.$inferSelect;

export const DeadlineTypeLabels: Record<string, string> = {
  objection: "مهلة الاعتراض",
  cassation: "مهلة النقض",
  response: "مهلة الرد",
  appeal: "مهلة الاستئناف",
  execution: "مهلة التنفيذ",
  custom: "مهلة مخصصة",
};

export const DelegationReasonLabels: Record<string, string> = {
  "إجازة": "إجازة",
  "مرض": "مرض",
  "مهمة_خارجية": "مهمة خارجية",
  "تدريب": "تدريب",
  "أخرى": "أخرى",
};

export const CaseActivityActionLabels: Record<string, string> = {
  case_created: "إنشاء قضية",
  case_updated: "تعديل بيانات القضية",
  stage_changed: "تغيير مرحلة",
  case_assigned: "إسناد قضية",
  case_archived: "أرشفة قضية",
  hearing_added: "إضافة جلسة",
  hearing_result_recorded: "تسجيل نتيجة جلسة",
  hearing_closed: "إغلاق جلسة",
  memo_created: "إنشاء مذكرة",
  memo_submitted: "تقديم مذكرة",
  memo_approved: "اعتماد مذكرة",
  memo_returned: "إرجاع مذكرة",
  attachment_added: "إضافة مرفق",
  attachment_deleted: "حذف مرفق",
  note_added: "إضافة ملاحظة",
  note_edited: "تعديل ملاحظة",
  contact_log_added: "تسجيل تواصل",
  sent_to_review: "إحالة للمراجعة",
  returned_from_review: "إرجاع من المراجعة",
  approved_by_review: "اعتماد من المراجعة",
  // Phase-8 — pause + await-completion activity entries on cases.
  paused: "تعليق",
  unpaused: "إلغاء التعليق",
  await_completion: "بانتظار استكمال المرفقات والبيانات",
  resume_from_completion: "العودة من الاستكمال",
  // Department transfer. The manual button on cases.tsx and the
  // automatic عدم_الاختصاص hearing-result flow both emit one of these.
  department_transferred: "تحويل لقسم آخر",
  jurisdiction_transferred: "تحويل بسبب عدم الاختصاص",
};

export const CaseNoteCategoryLabels: Record<string, string> = {
  "عام": "عام",
  "ملاحظة_على_القاضي": "ملاحظة على القاضي",
  "ملاحظة_على_الخصم": "ملاحظة على الخصم",
  "ملاحظة_على_العميل": "ملاحظة على العميل",
  "استراتيجية": "استراتيجية",
  "تحذير": "تحذير",
};

export interface LawyerPerformance {
  userId: string;
  userName: string;
  departmentName: string;
  departmentId: string;
  activeCases: number;
  closedCases: number;
  closureRate: number;
  hearingsOnTime: number;
  totalHearings: number;
  hearingUpdateRate: number;
  avgMemoDays: number;
  overdueMemos: number;
  wonCases: number;
  lostCases: number;
  winRate: number;
  overallScore: number;
}

export interface SearchResult {
  type: "case" | "hearing" | "memo" | "client" | "consultation";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  icon: string;
}

export interface SmartDashboardData {
  greeting: string;
  todayHearings: any[];
  alerts: any[];
  overdueItems: any[];
  upcomingDeadlines: any[];
  performanceStats: any;
  comparison?: any;
}

export function canManageSupportTickets(role: string): boolean {
  return ["branch_manager", "cases_review_head", "technical_support"].includes(role);
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
  stage: WorkflowCaseStageValue;
  maxDurationHours: number;
  warningBeforeHours: number;
}

export interface StageTransition {
  id: string;
  entityType: "case" | "consultation";
  entityId: string;
  fromStage: WorkflowCaseStageValue | null;
  toStage: WorkflowCaseStageValue;
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
  { stage: "in_review", maxDurationHours: 24, warningBeforeHours: 4 },
  { stage: "review_notes_received", maxDurationHours: 4, warningBeforeHours: 1 },
  { stage: "processing_notes", maxDurationHours: 24, warningBeforeHours: 4 },
  { stage: "returned_for_revision", maxDurationHours: 24, warningBeforeHours: 4 },
  { stage: "ready_to_submit", maxDurationHours: 4, warningBeforeHours: 1 },
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
  HEARING: "hearing",
  MEMO: "memo",
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
  technical_support: [
    "view_cases",
    "view_consultations",
    "view_clients",
    "view_users",
  ],
  // Read-only across the board — only view_* permissions, no
  // create/edit/delete/assign. Server-side viewerWriteGuard
  // middleware is the actual enforcement; this list keeps the
  // permission registry honest and shapes any per-permission UI
  // gates that consult it.
  viewer: [
    "view_cases", "view_consultations", "view_clients", "view_users",
    "view_activity_log", "view_reports",
  ],
};

// ==================== Sidebar Sections ====================
// Sections that participate in the "new since last visit" sidebar
// badge counts. Stored verbatim in user_section_views.section.
export const SidebarSection = {
  CASES:         "cases",
  CONSULTATIONS: "consultations",
  CONTRACTS:     "contracts",
  HEARINGS:      "hearings",
  MEMOS:         "memos",
} as const;

export type SidebarSectionValue = typeof SidebarSection[keyof typeof SidebarSection];

export const SIDEBAR_SECTIONS: SidebarSectionValue[] = [
  "cases",
  "consultations",
  "contracts",
  "hearings",
  "memos",
];

export type SidebarCounts = Record<SidebarSectionValue, number>;
