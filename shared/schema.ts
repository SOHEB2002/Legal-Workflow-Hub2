import { z } from "zod";
import { sql } from "drizzle-orm";
// `numeric` is NEW to this file — law_cases.violation_amount is the first
// monetary column in the schema. See its declaration for why numeric(12,2)
// rather than integer/real/varchar, and note it infers a STRING, not a number.
import { pgTable, text, varchar, boolean, timestamp, jsonb, integer, numeric, primaryKey, bigint, index, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
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
  // Task-routing specialty (ترافع / استشارات; see TaskSpecialty). Nullable
  // jsonb array — a user may hold several. Auto-created admin_support tasks
  // route to the matching active specialist. Purely additive (ADD COLUMN).
  taskSpecialties: jsonb("task_specialties").$type<TaskSpecialtyValue[]>(),
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
  // Judgment-lifecycle step 2 — the صك (written judgment) receipt.
  // The objection clock starts when the deed is RECEIVED, which happens days
  // after the session where the judgment was announced, so the deadline cannot
  // be computed at hearing-result time. Both columns are purely additive and
  // nullable (ADD COLUMN, applied manually — see the batch report).
  //   • judgment_deed_received_date: NULL = not yet received. That null IS the
  //     "بانتظار استلام الصك" indicator — it is derived, never stored as a flag.
  //   • objection_window_days: NULL = the 30-day default; 10 for القضاء المستعجل.
  judgmentDeedReceivedDate: varchar("judgment_deed_received_date", { length: 50 }),
  objectionWindowDays: integer("objection_window_days"),
  // رقم طلب التنفيذ — the execution-court request number, captured when the
  // EXECUTION post-judgment task is completed and editable afterwards like the
  // other platform numbers. Same shape as its siblings (najiz/taradi/mohr/moeen
  // /court are all varchar(100)). REFERENCE FIELD ONLY: it is deliberately NOT
  // part of deriveCurrentCaseNumber's priority chain — the displayed case number
  // stays court → najiz → settlement → base.
  executionRequestNumber: varchar("execution_request_number", { length: 100 }),
  // ============ لوحة تفاصيل المخالفة — the ADMIN (إداري) violation panel ============
  // Eight facts about the administrative violation the case is about. They live
  // on law_cases like every other department-scoped field (taradi_* commercial,
  // mohr_* labor, admin_case_sub_type / prescription_date / grievance_* already
  // admin): this is a 1:1 panel on the case, not a collection, so no new table.
  //
  // ⚠ APPLIED MANUALLY via script/add-admin-violation-fields.sql — db:push was
  // NOT run. Both DBs carry them already; the ALTERs ran BEFORE this code,
  // because drizzle builds an explicit column list from this declaration and a
  // missing column breaks EVERY read of law_cases, not just this panel.
  //
  // TYPES FOLLOW EXISTING PRECEDENT, none invented:
  //   • identifiers → varchar(100), the najiz/moeen/taradi/court/execution shape.
  //   • dates → varchar(50), the prescription_date / grievance_date /
  //     judgment_deed_received_date shape. This is literally what
  //     HijriDatePicker emits ("YYYY-MM-DD") and DualDateDisplay consumes, and
  //     it keeps these columns clear of drizzle's date-mode conversion — the one
  //     that silently broke auto-archive (Phase-4 S3) and 500'd checked_in_at.
  //     Because none of them is a timestamp, storage.updateCase needs no change.
  //   • violation_amount → numeric(12,2). 🔴 THE FIRST MONETARY COLUMN IN THIS
  //     SCHEMA — there was no precedent to follow (no decimal/numeric/money
  //     anywhere; contracts carry no value column; every integer here is a count
  //     or a duration). Chosen for exact decimal (money must never be a float)
  //     and because drizzle infers numeric as a STRING, which matches the
  //     string-typed LawCase interface and needs no conversion layer.
  //     ⚠ It arrives from the driver as a string like "1500.00", never a number.
  //
  // All eight are NULLABLE WITH NO DEFAULT — the precedent of every optional
  // column added since prescription_date. NULL means "not recorded yet", which
  // is the correct state for a panel filled in progressively.
  administrativeDecisionNumber: varchar("administrative_decision_number", { length: 100 }),
  administrativeDecisionDate: varchar("administrative_decision_date", { length: 50 }),
  // تاريخ العلم بالمخالفة — the INPUT to the prescription calculation. Recorded
  // here; nothing computes from it yet (that is the استلام flow's job).
  violationKnowledgeDate: varchar("violation_knowledge_date", { length: 50 }),
  ifaaNumber: varchar("ifaa_number", { length: 100 }),
  ifaaDate: varchar("ifaa_date", { length: 50 }),
  // 🔴 grievance_number, NOT objection_number (owner ruling): الاعتراض and
  // التظلم are THE SAME THING, so the number carries the same name as its own
  // date and result — grievance_date / grievance_result, both of which already
  // exist and are REUSED rather than twinned. Naming it for the other word
  // would rebuild the judgmentType/judgmentSide two-names-for-one-thing trap in
  // a single table. The UI label is «رقم الاعتراض».
  grievanceNumber: varchar("grievance_number", { length: 100 }),
  invoiceNumber: varchar("invoice_number", { length: 100 }),
  violationAmount: numeric("violation_amount", { precision: 12, scale: 2 }),
  // 🔴 رقم طلب التنفيذ الإداري — A DIFFERENT FIELD FROM executionRequestNumber
  // ABOVE, not a duplicate and not a rename. The first batch of this panel
  // REUSED that column and that was wrong:
  //   • execution_request_number belongs to the مهامي EXECUTION FIELD TASK. It
  //     is written by POST /api/field-tasks/:id/execution-request, which also
  //     COMPLETES that task, writes an execution_request_filed activity row and
  //     can auto-close the case. It is the execution COURT's request number.
  //   • admin_execution_request_number is a fact recorded on the violation
  //     panel. It has NO filing path, NO task, and NO side effects — an ordinary
  //     editable field.
  // Sharing one column meant the panel could silently overwrite a number the
  // execution task had filed, and vice versa. Two concepts, two columns.
  //
  // ⚠ APPLIED MANUALLY via script — db:push NOT run; both DBs already carry it.
  // varchar(100), the identifier shape shared by every number column here.
  adminExecutionRequestNumber: varchar("admin_execution_request_number", { length: 100 }),
  appealLawyerId: varchar("appeal_lawyer_id", { length: 255 }),
  // "المترافع" — the lawyer who APPEARS IN COURT for this case, when that is not
  // the responsible lawyer (a foreign or unlicensed lawyer cannot plead). Set in
  // the الإسناد dialog alongside internalReviewerId.
  //
  // OPTIONAL AND OVERRIDE-ONLY. NULL is the normal case and changes nothing: a
  // new hearing still defaults its attendingLawyerId to
  // primaryLawyerId || responsibleLawyerId, exactly as before. When SET it takes
  // first place in that chain for NEWLY CREATED hearings only — existing
  // hearings are never retroactively reassigned (use the hearings page's
  // "إعادة إسناد" action for those).
  //
  // ⚠ NOT appealLawyerId, which sits directly above and is declared, mapped and
  // NEVER read or written by anything. Reusing it was considered and rejected:
  // "محامي الاستئناف" is a different concept from "المترافع" (the appeal path
  // built in the judgment-lifecycle rebuild could legitimately claim that column
  // later), and a repurposed name is the two-names-for-one-thing trap this
  // codebase keeps paying for.
  //
  // ⚠ APPLIED MANUALLY (db:push NOT run) — ALTER both DBs BEFORE this code
  // serves traffic: drizzle selects declared columns explicitly, so a missing
  // column breaks EVERY read of law_cases, not just this feature.
  litigatorId: varchar("litigator_id", { length: 255 }),
  internalReviewerId: varchar("internal_reviewer_id", { length: 255 }),
  moeenNumber: varchar("moeen_number", { length: 100 }),
  clientRole: varchar("client_role", { length: 50 }),
  closureReason: varchar("closure_reason", { length: 255 }),
  closureReasonOther: varchar("closure_reason_other", { length: 500 }),
  isArchived: boolean("is_archived").default(false),
  // Unified-tasks: "تم" acknowledge timestamp for the admin_support
  // data-completion reminder (case at استكمال_البيانات). The reminder
  // re-surfaces 2 days after the last ack while still at that stage.
  // Purely additive (ADD COLUMN).
  dataCompletionLastAckAt: timestamp("data_completion_last_ack_at"),
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
  // OPTIONAL auto-lift date for the pause, "YYYY-MM-DD". NULL = open-ended,
  // which is today's behaviour and stays the default — an existing pause is
  // completely unaffected. varchar(50) is the struck_off_reopen_deadline idiom
  // and is deliberately NOT a timestamp: the scheduler compares it as a plain
  // string against todayStr, which keeps it clear of the drizzle date-mode
  // conversion that silently broke auto-archive (Phase-4 S3).
  // ⚠ MUST be cleared on EVERY unpause path, or a stale date survives into the
  // next pause and lifts it early. See scheduler.checkExpiredPauses.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — ALTER both DBs BEFORE this code
  // serves traffic: drizzle selects declared columns explicitly, so a missing
  // column breaks EVERY read of the table, not just the pause feature.
  pauseUntil:         varchar("pause_until", { length: 50 }),
  // Set true when the responsible lawyer answers "لا يوجد وكالة" on the
  // agency-verification task → drives + tracks the admin_support "إصدار وكالة"
  // task (generated in sub-step 2); cleared when the issuance is completed.
  // Purely additive (ADD COLUMN).
  agencyIssuanceRequested: boolean("agency_issuance_requested").notNull().default(false),
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
  // Phase-4 S1 — hot-path indexes on FK-like filter columns (mirrors the
  // contracts index idiom). Additive only; CREATE INDEX is non-destructive.
  departmentIdx:        index("law_cases_department_idx").on(t.departmentId),
  primaryLawyerIdx:     index("law_cases_primary_lawyer_idx").on(t.primaryLawyerId),
  responsibleLawyerIdx: index("law_cases_responsible_lawyer_idx").on(t.responsibleLawyerId),
  createdAtIdx:         index("law_cases_created_at_idx").on(t.createdAt),
  // Phase-7 P7-2 — the cases list (getAllCases + role branches) orders by
  // updatedAt; createdAt above stays for getSidebarCounts' createdAt range.
  updatedAtIdx:        index("law_cases_updated_at_idx").on(t.updatedAt),
  // Unified-tasks I3 — GIN index on the assignedLawyers jsonb for the
  // `assigned_lawyers @> [uid]` containment in getMyTasks (case_work /
  // legal_deadline member branches). Kept COMMENTED (like the Batch-M FKs) so
  // drizzle-push never manages it; applied out-of-band on BOTH dev + prod via
  // script/apply-tasks-gin-index.sql (CREATE INDEX CONCURRENTLY IF NOT EXISTS).
  // assignedLawyersGin: index("law_cases_assigned_lawyers_gin_idx")
  //   .using("gin", t.assignedLawyers),
  // Batch M FKs — applied via script/apply-fk-constraints.sql (NOT VALID +
  // VALIDATE); kept commented so Republish/drizzle-push never emits the
  // validating ADD CONSTRAINT that timed out the deploy:
  // clientFk: foreignKey({ name: "law_cases_client_id_fkey",
  //   columns: [t.clientId], foreignColumns: [clients.id] }).onDelete("restrict"),
  // departmentFk: foreignKey({ name: "law_cases_department_id_fkey",
  //   columns: [t.departmentId], foreignColumns: [departments.id] }).onDelete("restrict"),
  // primaryLawyerFk: foreignKey({ name: "law_cases_primary_lawyer_id_fkey",
  //   columns: [t.primaryLawyerId], foreignColumns: [users.id] }).onDelete("set null"),
  // responsibleLawyerFk: foreignKey({ name: "law_cases_responsible_lawyer_id_fkey",
  //   columns: [t.responsibleLawyerId], foreignColumns: [users.id] }).onDelete("set null"),
}));

export const consultations = pgTable("consultations", {
  id: varchar("id", { length: 255 }).primaryKey(),
  consultationNumber: varchar("consultation_number", { length: 50 }).notNull().unique(),
  // عنوان الاستشارة. Name + length copied from contracts.title, the existing
  // convention for an entity headline. NULLABLE here (contracts.title is
  // notNull) because every pre-existing consultation row has none — a NOT NULL
  // column would need a backfill, i.e. a migration beyond ADD COLUMN.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — see the ALTER in the commit message.
  title: varchar("title", { length: 500 }),
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
  // Triage label, set once at creation. The DB default mirrors the server
  // fallback so manual inserts still get a valid category.
  // Migration: script/add-consultation-category-and-due-date.sql.
  category: varchar("category", { length: 50 }).notNull().default("عادية"),
  // @deprecated — the expected-delivery-date feature (and its تمديد التسليم
  // extension flow) was REMOVED from the product. Nothing writes this column any
  // more and no UI reads it. The COLUMN IS DELIBERATELY LEFT IN PLACE, populated
  // on historical rows: dropping it would be a destructive migration, which this
  // codebase does not do (additive-only rule). The declaration must stay too —
  // drizzle builds an explicit column list, and the column still exists in both
  // DBs. Same treatment as `deliveryType` above. Do not surface it in new UI.
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  // How the consultation reached us — group chat vs. private DM. NOT NULL
  // + default so `drizzle-kit push` backfills existing rows in one DDL
  // (same pattern as `category`). See ConsultationSource enum.
  source: varchar("source", { length: 50 }).notNull().default("عبر_المجموعة"),
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
  // OPTIONAL auto-lift date for the pause, "YYYY-MM-DD". NULL = open-ended,
  // which is today's behaviour and stays the default — an existing pause is
  // completely unaffected. varchar(50) is the struck_off_reopen_deadline idiom
  // and is deliberately NOT a timestamp: the scheduler compares it as a plain
  // string against todayStr, which keeps it clear of the drizzle date-mode
  // conversion that silently broke auto-archive (Phase-4 S3).
  // ⚠ MUST be cleared on EVERY unpause path, or a stale date survives into the
  // next pause and lifts it early. See scheduler.checkExpiredPauses.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — ALTER both DBs BEFORE this code
  // serves traffic: drizzle selects declared columns explicitly, so a missing
  // column breaks EVERY read of the table, not just the pause feature.
  pauseUntil:         varchar("pause_until", { length: 50 }),
  // data-completion reminder ack (consultation at its استكمال_المرفقات_والبيانات
  // stage). Mirrors lawCases.dataCompletionLastAckAt — the unified-tasks feed
  // suppresses the data_completion_consultation task for 2 days after each ack.
  dataCompletionLastAckAt: timestamp("data_completion_last_ack_at"),
  // Committee-referral form fields (نموذج الإحالة للجنة المراجعة).
  // Mirrors lawCases.internalReviewerId / priority — set when the
  // assigned lawyer hands the file to the committee. priority_reason
  // is the optional free-text justification behind the chosen priority.
  // All three are nullable so existing rows surface as "not set".
  // See script/add-consultation-committee-fields.sql.
  internalReviewerId: varchar("internal_reviewer_id", { length: 255 }),
  priority:           varchar("priority", { length: 50 }),
  priorityReason:     text("priority_reason"),
  // Follow-up cycles ("استشارة تعقيبية"). When a closed consultation is
  // re-opened for a customer follow-up, the row stays the same — only
  // status/currentStage flip and followUpCount increments. A row with
  // followUpCount > 0 renders a 3-stage mini-flow instead of the full
  // type stages (see getStagesForConsultationCycle). NOT NULL + default
  // so drizzle-kit push backfills existing rows cleanly.
  followUpCount:     integer("follow_up_count").notNull().default(0),
  followUpStartedAt: timestamp("follow_up_started_at"),
}, (t) => ({
  // Phase-4 S1 — hot-path indexes (mirrors the contracts index idiom).
  departmentIdx: index("consultations_department_idx").on(t.departmentId),
  assignedIdx:   index("consultations_assigned_idx").on(t.assignedTo),
  createdAtIdx:  index("consultations_created_at_idx").on(t.createdAt),
  // Batch M FKs — applied via script/apply-fk-constraints.sql (commented;
  // see law_cases note). created_by is OMITTED (NOT NULL → SET NULL invalid).
  // departmentFk: foreignKey({ name: "consultations_department_id_fkey",
  //   columns: [t.departmentId], foreignColumns: [departments.id] }).onDelete("restrict"),
  // assignedToFk: foreignKey({ name: "consultations_assigned_to_fkey",
  //   columns: [t.assignedTo], foreignColumns: [users.id] }).onDelete("set null"),
}));

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

// @deprecated — audit log for expectedDeliveryDate extensions.
//
// The تمديد التسليم flow that wrote these rows was REMOVED along with the
// expected-delivery-date feature: the endpoints, the storage methods, the dialog
// and the history list are all gone. The TABLE IS DELIBERATELY LEFT IN PLACE
// with its historical rows — dropping it would be a destructive migration, which
// this codebase does not do (additive-only rule).
//
// The declaration stays because the table still exists in both DBs and Republish
// diffs live schema against live schema; removing it here would make the deploy
// propose a DROP TABLE. Nothing reads or writes it in application code any more.
// Migration that created it: script/add-consultation-delivery-extensions.sql.
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
  // OPTIONAL auto-lift date for the pause, "YYYY-MM-DD". NULL = open-ended,
  // which is today's behaviour and stays the default — an existing pause is
  // completely unaffected. varchar(50) is the struck_off_reopen_deadline idiom
  // and is deliberately NOT a timestamp: the scheduler compares it as a plain
  // string against todayStr, which keeps it clear of the drizzle date-mode
  // conversion that silently broke auto-archive (Phase-4 S3).
  // ⚠ MUST be cleared on EVERY unpause path, or a stale date survives into the
  // next pause and lifts it early. See scheduler.checkExpiredPauses.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — ALTER both DBs BEFORE this code
  // serves traffic: drizzle selects declared columns explicitly, so a missing
  // column breaks EVERY read of the table, not just the pause feature.
  pauseUntil:         varchar("pause_until", { length: 50 }),
  // data-completion reminder ack (contract at its استكمال_البيانات_والمرفقات
  // stage). Mirrors lawCases.dataCompletionLastAckAt — the unified-tasks feed
  // suppresses the data_completion_contract task for 2 days after each ack.
  dataCompletionLastAckAt: timestamp("data_completion_last_ack_at"),
  // Follow-up cycles ("استشارة تعقيبية" on a contract). Mirrors
  // consultations.followUpCount / followUpStartedAt EXACTLY: when a closed
  // contract is re-opened for a client follow-up question, the row stays the
  // same — only status/currentStage flip and followUpCount increments.
  // NOT NULL + default 0 so existing rows backfill cleanly.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — see the ALTER statements in the
  // commit message; both DBs must have these columns BEFORE this code serves
  // traffic, because drizzle selects declared columns explicitly.
  followUpCount:     integer("follow_up_count").notNull().default(0),
  followUpStartedAt: timestamp("follow_up_started_at"),
  createdBy:          varchar("created_by", { length: 255 }).notNull(),
  createdAt:          timestamp("created_at").defaultNow(),
  updatedAt:          timestamp("updated_at").defaultNow(),
  closedAt:           timestamp("closed_at"),
}, (t) => ({
  departmentIdx: index("contracts_department_idx").on(t.departmentId),
  assignedIdx:   index("contracts_assigned_idx").on(t.assignedTo),
  stageIdx:      index("contracts_stage_idx").on(t.currentStage),
  // Batch M FKs — applied via script/apply-fk-constraints.sql (commented; see law_cases note):
  // departmentFk: foreignKey({ name: "contracts_department_id_fkey",
  //   columns: [t.departmentId], foreignColumns: [departments.id] }).onDelete("restrict"),
  // assignedToFk: foreignKey({ name: "contracts_assigned_to_fkey",
  //   columns: [t.assignedTo], foreignColumns: [users.id] }).onDelete("set null"),
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
  // Done-state for the admin_support "export session report PDF" task — set
  // true once the report has been exported. Purely additive (ADD COLUMN).
  sessionReportExported: boolean("session_report_exported").default(false),
  // Done-state for the agency-verification reminder (verify the agency before
  // an upcoming hearing) — set when acknowledged; suppresses that hearing's
  // reminder. Purely additive (ADD COLUMN).
  agencyVerificationAckAt: timestamp("agency_verification_ack_at"),
  // The responsible lawyer's answer to the agency-verification task
  // (يوجد / لا يوجد). NULL until answered. "لا يوجد" is what sub-step 2 reads
  // (via law_cases.agency_issuance_requested) to generate the admin_support
  // "إصدار وكالة" task. Purely additive (ADD COLUMN).
  agencyVerificationAnswer: varchar("agency_verification_answer", { length: 20 }),
  adminTasksCreated: boolean("admin_tasks_created").default(false),
  opponentMemos: text("opponent_memos").default(""),
  hearingMinutes: text("hearing_minutes").default(""),
  // "جلسة مُعلَّمة" — a TEAM alert, not a personal mark: set by admin_support /
  // branch_manager, visible to everyone, tints the row red across the list.
  // The by/at pair mirrors the app-wide is_archived / archived_by / archived_at
  // trio on law_cases (the closest existing analogue, since we record an actor
  // and a time as well as the flag itself).
  // ⚠ APPLIED MANUALLY (db:push NOT run) — both DBs must have these columns
  // BEFORE this code serves traffic, because drizzle selects declared columns
  // explicitly, so a missing column breaks EVERY read of `hearings`.
  isFlagged:  boolean("is_flagged").notNull().default(false),
  flagReason: varchar("flag_reason", { length: 500 }),
  flaggedBy:  varchar("flagged_by", { length: 255 }),
  flaggedAt:  timestamp("flagged_at"),
  // سبب الإلغاء — captured when a hearing is cancelled (status → ملغية).
  // Name and shape mirror memos.cancellation_reason EXACTLY (the existing
  // precedent for "why was this cancelled"); nullable because cancellations
  // before this feature captured none.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — see the ALTER in the commit message.
  cancellationReason: varchar("cancellation_reason", { length: 500 }),
  // تحضير الجلسة — who confirmed they are ready for this session, and when.
  // NULL on every existing row and on every new hearing: a hearing nobody has
  // prepared is the normal starting state, so there is no backfill.
  //
  // 🔴 "LATE" IS DERIVED, NEVER STORED. A check-in later than
  // HearingCheckInLateCutoffMinutes before the session is late; the answer is
  // computed from checked_in_at against the hearing's own instant (see
  // isHearingCheckInLate). Storing a boolean would freeze today's threshold
  // into historical rows and silently misreport them if the cutoff ever moves.
  //
  // checked_in_by is varchar(255) with NO FK, matching every other user-id
  // column on this table (attending_lawyer_id, flagged_by) — hearings carries
  // exactly one FK, hearings_case_id_fkey, and adding another here would create
  // dev/prod drift under the Batch-M rule.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — script/add-hearing-checkin.sql. Both
  // DBs must have these columns BEFORE this code serves traffic: drizzle selects
  // declared columns explicitly, so a missing column breaks EVERY read of
  // `hearings`, not just the check-in feature.
  checkedInAt: timestamp("checked_in_at"),
  checkedInBy: varchar("checked_in_by", { length: 255 }),
  attendingLawyerId: varchar("attending_lawyer_id", { length: 255 }),
  reminderSent24h: boolean("reminder_sent_24h").default(false),
  reminderSent1h: boolean("reminder_sent_1h").default(false),
  googleCalendarEventId: varchar("google_calendar_event_id", { length: 255 }),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  caseIdx: index("hearings_case_idx").on(t.caseId),
  // Phase-7 P7-2 — getAllHearings/getHearingsByCase order by (hearingDate, hearingTime).
  hearingDateIdx: index("hearings_hearing_date_idx").on(t.hearingDate, t.hearingTime),
  // Unified-tasks I3 — per-user feed filters hearings by attendingLawyerId
  // (getMyTasks member branch). Additive.
  attendingLawyerIdx: index("hearings_attending_lawyer_idx").on(t.attendingLawyerId),
  // Batch M FK — applied via script/apply-fk-constraints.sql (commented; see law_cases note):
  // caseFk: foreignKey({ name: "hearings_case_id_fkey",
  //   columns: [t.caseId], foreignColumns: [lawCases.id] }).onDelete("cascade"),
}));

// ==================== مرفق الصك / ضبط الجلسة ====================
// The judgment deed (صك الحكم) on a case, and the minutes (ضبط الجلسة) on a
// hearing. Both MIRROR contract_attachments — the only real file-upload
// mechanism in this app. The row stores the Object-Storage KEY in file_path;
// never the bytes, and never a URL. Key shape: makeCaseDeedObjectKey /
// makeHearingMinutesObjectKey in server/routes.ts.
//
// ⚠ APPLIED MANUALLY — `db:push` / drizzle-kit NOT run. Both DBs (dev heliumdb
// AND prod neondb) must have these tables BEFORE this code serves traffic
// against them: drizzle builds an explicit column list from the declaration, so
// a missing table or a mismatched column name breaks EVERY read that touches
// it, not just the new feature. The exact DDL is in the commit message; run it
// on dev → confirm the app loads → run it on prod → deploy.
//
// ONE FILE PER PARENT, enforced in the DB by a PLAIN unique index on the parent
// id. contract_attachments needs a PARTIAL unique index (…WHERE slot_key IS NOT
// NULL) only because it holds two KINDS of row: designated slots, which are
// single-file, and free "additional" attachments, which use slot_key=NULL and
// accumulate without limit. Neither table below has slots or free attachments —
// exactly one صك per case and one ضبط per hearing — so the partial predicate
// would have nothing to exclude, and a plain UNIQUE is both correct and
// stricter. One index also suffices for BOTH jobs here: a unique b-tree on the
// parent id IS the lookup index, which is why there is no separate
// *_case_idx / *_hearing_idx (contract_attachments needs two only because its
// unique index is partial and two-column).
//
// FK IS ACTIVE (uncommented), matching contract_attachments_contract_id_fkey
// rather than the commented Batch-M style. The Batch-M FKs are commented for a
// reason that does not apply here: they were RETROFITTED onto large existing
// tables, where the validating ADD CONSTRAINT scanned every row and timed out
// the deploy (see the law_cases note). These are brand-new, EMPTY tables whose
// FK is created inline in the CREATE TABLE — zero rows to validate, nothing to
// time out, no orphan risk — exactly the contract_attachments situation. And
// because the DDL below is applied by hand to BOTH DBs, there is no dev/prod
// FK drift for Republish to turn into a DROP.
export const caseAttachments = pgTable("case_attachments", {
  id:         varchar("id", { length: 255 }).primaryKey(),
  caseId:     varchar("case_id", { length: 255 }).notNull(),
  fileName:   varchar("file_name", { length: 500 }).notNull(),
  filePath:   varchar("file_path", { length: 1000 }).notNull(),
  fileSize:   bigint("file_size", { mode: "number" }).notNull(),
  mimeType:   varchar("mime_type", { length: 100 }).notNull(),
  uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (t) => ({
  caseFk: foreignKey({
    name: "case_attachments_case_id_fkey",
    columns: [t.caseId],
    foreignColumns: [lawCases.id],
  }).onDelete("cascade"),
  caseUniqueIdx: uniqueIndex("case_attachments_case_unique_idx").on(t.caseId),
}));

export const hearingAttachments = pgTable("hearing_attachments", {
  id:         varchar("id", { length: 255 }).primaryKey(),
  hearingId:  varchar("hearing_id", { length: 255 }).notNull(),
  fileName:   varchar("file_name", { length: 500 }).notNull(),
  filePath:   varchar("file_path", { length: 1000 }).notNull(),
  fileSize:   bigint("file_size", { mode: "number" }).notNull(),
  mimeType:   varchar("mime_type", { length: 100 }).notNull(),
  uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (t) => ({
  hearingFk: foreignKey({
    name: "hearing_attachments_hearing_id_fkey",
    columns: [t.hearingId],
    foreignColumns: [hearings.id],
  }).onDelete("cascade"),
  hearingUniqueIdx: uniqueIndex("hearing_attachments_hearing_unique_idx").on(t.hearingId),
}));

// ==================== سجل الأحكام — THE JUDGMENT RECORD ====================
// One ROW PER RULING on a case, replacing the model where a case could hold only
// the ONE judgment its scalar columns had room for.
//
// 🔴 BATCH 1 IS INERT. Nothing reads or writes these two tables yet: no route, no
// gate, no badge, no scheduler job. The declarations exist so the DDL (applied by
// hand — script/add-judgment-tables.sql) has a drizzle counterpart, and so the
// read-only accessors in server/storage.ts have something to select from. Every
// existing judgment surface still reads law_cases + hearings exactly as before.
//
// WHY A TABLE AND NOT MORE COLUMNS. A case can carry up to THREE rulings:
//   1. the first-instance ruling                        (degree ابتدائي)
//   2. the appeal ruling — which may QUASH #1 and remand (degree استئنافي)
//   3. the new first-instance ruling after the remand    (degree ابتدائي again)
// law_cases.judgment_deed_received_date / objection_window_days are ONE slot, so
// ruling #3 would overwrite ruling #1's deed date and silently rewrite history.
//
// 🔴 THE REMAND CYCLE DOES NOT RECUR (owner, settled). At most one إعادة للدرجة
// الأولى, so at most three rulings. The model is NOT built for unbounded N — but
// it does not REFUSE it either: nothing here caps `sequence`, so a fourth row
// would insert cleanly if the firm ever meets one. Do not add a CHECK that
// forbids it.
//
// THE COURT CASE NUMBER IS NOT PER-CYCLE (owner, settled). A remand keeps the
// same court_case_number on law_cases; there is deliberately no number column
// here.
//
// ⚠ THE ARABIC TERM IS "إعادة للدرجة الأولى", NEVER "نقض" (owner ruling). نقض is
// SUPREME-COURT cassation and is already spent in this file on
// MemoType.CASSATION ("لائحة_نقض") and LegalDeadlineType.cassation
// ("مهلة النقض") — both STORED values with real rows behind them. This models the
// APPEAL court returning the case to first instance, which is a different act by
// a different court. Cassation itself remains out of scope entirely.
//
// DEGREE IS DERIVED FROM THE CASE PATH, NEVER ASKED — the model correction of
// 2026-07-27. It is STORED here (not recomputed on read) because the case moves
// on: a case that later goes to appeal would otherwise retroactively relabel its
// first-instance ruling as an appeal ruling. The stored value is the answer as of
// the moment the ruling was recorded, which is what a record means.
export const caseJudgments = pgTable("case_judgments", {
  id:     varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  // The session that ANNOUNCED the ruling. Nullable, and ON DELETE SET NULL: the
  // judgment is the record of the RULING, not of the session — deleting the
  // hearing row must not delete the firm's record that a judgment exists. Also
  // null for backfilled rows on cases whose judgment hearing cannot be located.
  hearingId: varchar("hearing_id", { length: 255 }),
  // 1, 2, 3 — the ruling's position in the case's own chain, and the ONLY
  // ordering key. Deliberately not created_at: the backfill stamps every row with
  // the same now(), and a later batch may record a ruling out of chronological
  // order (a صك arriving late). UNIQUE per case, so "judgment #1" is a fact and
  // not a guess.
  sequence: integer("sequence").notNull(),
  // ابتدائي | استئنافي — see JudgmentDegree.
  degree: varchar("degree", { length: 50 }).notNull(),
  // لصالحنا | ضدنا | جزئي, mirroring hearings.judgment_side. NULLABLE because a
  // backfilled row whose judgment hearing is missing has no recorded side, and a
  // quash ruling decides procedure rather than the merits.
  outcome: varchar("outcome", { length: 50 }),
  // Mirrors hearings.judgment_final: isFinal = appeal ruling || NOT objectionable.
  isFinal: boolean("is_final").notNull().default(false),
  // 🔴 STORED INTENT, NOT A DERIVED READ. "Did THIS ruling open an objection
  // window?" is decided once, when the ruling is recorded, from the answer the
  // lawyer gave then. Recomputing it later would let a policy change (or the
  // case's own movement) rewrite whether a window that has already expired ever
  // existed. false for every appeal ruling, and false for a quash — the quash's
  // own صك is not objectionable (owner, settled).
  opensWindow: boolean("opens_window").notNull().default(false),
  // The صك (written judgment) for THIS ruling, and its objection clock. Same
  // meaning as the law_cases scalars they mirror — null receipt date = not yet
  // received; null window = the 30-day default (10 for القضاء المستعجل).
  deedReceivedDate:    varchar("deed_received_date", { length: 50 }),
  objectionWindowDays: integer("objection_window_days"),
  objectionDeadline:   varchar("objection_deadline", { length: 50 }),
  // 🔴 THE QUASH MARKER. Set on the ruling that was QUASHED (never on the ruling
  // that did the quashing), pointing at the appeal judgment that superseded it.
  // A NULL superseded_at is the normal state and means "this ruling still stands".
  // Expressing the quash as a relationship rather than as a new outcome value is
  // deliberate: it needs no new Arabic vocabulary in the outcome column, and it
  // keeps "which ruling is live" answerable by one IS NULL test.
  supersededAt:           timestamp("superseded_at"),
  supersededByJudgmentId: varchar("superseded_by_judgment_id", { length: 255 }),
  // The actor. varchar with NO FK, matching every other user-id column on the
  // judgment/hearing surfaces (attending_lawyer_id, flagged_by, checked_in_by);
  // the backfill writes the established "system" sentinel, which names no user.
  recordedBy: varchar("recorded_by", { length: 255 }),
  createdAt:  timestamp("created_at").defaultNow(),
  updatedAt:  timestamp("updated_at").defaultNow(),
}, (t) => ({
  // FKs are ACTIVE (uncommented), like case_attachments / hearing_attachments and
  // unlike the Batch-M commented set. The Batch-M exemption exists because
  // retrofitting a validating constraint onto a POPULATED table scanned every row
  // and timed out the deploy; this table is created EMPTY by the DDL that also
  // creates the constraints inline, so there is nothing to validate, and because
  // the DDL is applied by hand to BOTH DBs there is no dev/prod drift for
  // Republish to turn into a DROP.
  caseFk: foreignKey({
    name: "case_judgments_case_id_fkey",
    columns: [t.caseId],
    foreignColumns: [lawCases.id],
  }).onDelete("cascade"),
  hearingFk: foreignKey({
    name: "case_judgments_hearing_id_fkey",
    columns: [t.hearingId],
    foreignColumns: [hearings.id],
  }).onDelete("set null"),
  supersededByFk: foreignKey({
    name: "case_judgments_superseded_by_fkey",
    columns: [t.supersededByJudgmentId],
    foreignColumns: [t.id],
  }).onDelete("set null"),
  // Doubles as the lookup index for "this case's judgments, in order" — the
  // access pattern of both read-only accessors.
  caseSequenceUniqueIdx: uniqueIndex("case_judgments_case_sequence_unique_idx")
    .on(t.caseId, t.sequence),
}));

// The صك (judgment deed) as a FILE, keyed on the RULING rather than on the case.
// Mirrors hearing_attachments column-for-column, including the plain unique index
// on the parent id (exactly one deed per ruling — no slots, no free attachments,
// so contract_attachments' PARTIAL unique index has nothing to exclude here).
//
// 🔴 case_attachments IS NOT TOUCHED, AND ITS UNIQUE INDEX IS NOT DROPPED. Two
// deed tables coexisting permanently is the ACCEPTED cost (owner, settled): the
// DROP is forbidden, so the one-deed-per-CASE table stays exactly as it is and
// keeps serving every existing surface unchanged. Batch 1 COPIES its rows here
// (never moves them), which is what makes this batch reversible by a code revert
// alone.
//
// ⚠ CONSEQUENCE FOR LATER BATCHES: after the copy, a case_attachments row and a
// judgment_attachments row point at the SAME Object-Storage key — one blob, two
// rows. Deleting one row must NOT delete the blob, or the other surface renders
// as missing. Whichever batch first wires up a DELETE here has to settle that.
export const judgmentAttachments = pgTable("judgment_attachments", {
  id:         varchar("id", { length: 255 }).primaryKey(),
  judgmentId: varchar("judgment_id", { length: 255 }).notNull(),
  fileName:   varchar("file_name", { length: 500 }).notNull(),
  filePath:   varchar("file_path", { length: 1000 }).notNull(),
  fileSize:   bigint("file_size", { mode: "number" }).notNull(),
  mimeType:   varchar("mime_type", { length: 100 }).notNull(),
  uploadedBy: varchar("uploaded_by", { length: 255 }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
}, (t) => ({
  judgmentFk: foreignKey({
    name: "judgment_attachments_judgment_id_fkey",
    columns: [t.judgmentId],
    foreignColumns: [caseJudgments.id],
  }).onDelete("cascade"),
  judgmentUniqueIdx: uniqueIndex("judgment_attachments_judgment_unique_idx").on(t.judgmentId),
}));

// 🔔 "تم الاطلاع" — a per-PERSON acknowledgement of a pre-hearing ring.
//
// One row per (hearing, user). It silences the ring FOR THAT PERSON ONLY and
// does NOT end the chain: later tiers still fire for everyone else, because the
// tiers are derived from the clock and this table is consulted only when
// deciding what to send to the acknowledging user.
//
// 🔴 IT IS NOT A CHECK-IN AND MUST NEVER BE READ AS ONE. "تحضير" writes
// hearings.checked_in_at; this writes here. Nothing outside the ring-state
// endpoint reads this table — not the hearings display, not the batch-2
// auto-flag sweep, not isHearingCheckInLate.
//
// ⚠ APPLIED MANUALLY (db:push NOT run) — script/add-hearing-ring-ack.sql. The FK
// is ACTIVE rather than commented: the Batch-M exemption exists because
// retrofitting a constraint onto a POPULATED table can time out a deploy, and
// this table was created empty, so there is no scan and no dev/prod drift.
export const hearingRingAcknowledgements = pgTable("hearing_ring_acknowledgements", {
  id:             varchar("id", { length: 255 }).primaryKey(),
  hearingId:      varchar("hearing_id", { length: 255 }).notNull(),
  userId:         varchar("user_id", { length: 255 }).notNull(),
  acknowledgedAt: timestamp("acknowledged_at").defaultNow(),
}, (t) => ({
  hearingFk: foreignKey({
    name: "hearing_ring_ack_hearing_id_fkey",
    columns: [t.hearingId],
    foreignColumns: [hearings.id],
  }).onDelete("cascade"),
  // Enforces one acknowledgement per person per hearing — which is what makes
  // the endpoint idempotent — and doubles as the lookup index.
  uniqueIdx: uniqueIndex("hearing_ring_ack_unique_idx").on(t.hearingId, t.userId),
}));

export const fieldTasks = pgTable("field_tasks", {
  id: varchar("id", { length: 255 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").default(""),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  caseId: varchar("case_id", { length: 255 }),
  consultationId: varchar("consultation_id", { length: 255 }),
  // Optional entity links for general (عام) tasks (additive, nullable) — a
  // general task may be linked to a contract or a client as well as / instead
  // of a case/consultation. Auto/field tasks leave these null.
  contractId: varchar("contract_id", { length: 255 }),
  clientId: varchar("client_id", { length: 255 }),
  // Review note attached when a general (عام) task is sent for / returned from
  // review (AWAITING_REVIEW lifecycle, wired in later sub-steps). Additive,
  // defaults to "" — auto/field tasks never set it.
  reviewNote: text("review_note").default(""),
  // General (عام) task two-path lifecycle (additive, all nullable — auto/field
  // tasks leave them null). originalRequesterId is the WRITE-ONCE return address
  // (set at creation, never updated) so the result always returns to the creator
  // regardless of reassignment churn; routedDepartmentId marks a dept-routed
  // (path-2) task and which dept (null = person-direct path-1); workerId records
  // who produced the CURRENT result (for send-back re-routing + "النتيجة من" display).
  originalRequesterId: varchar("original_requester_id", { length: 255 }),
  routedDepartmentId: varchar("routed_department_id", { length: 255 }),
  workerId: varchar("worker_id", { length: 255 }),
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
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  caseIdx: index("field_tasks_case_idx").on(t.caseId),
  // Unified-tasks I3 — per-user feed filters field tasks by assignee
  // (getMyTasks: assignedTo = uid, and the unassigned "" pool). Additive.
  assignedToIdx: index("field_tasks_assigned_to_idx").on(t.assignedTo),
  // Batch M FK — applied via script/apply-fk-constraints.sql (commented; see law_cases note):
  // caseFk: foreignKey({ name: "field_tasks_case_id_fkey",
  //   columns: [t.caseId], foreignColumns: [lawCases.id] }).onDelete("cascade"),
}));

// Sub-step 4.6 — general (عام) task activity thread (سجل الأخذ والعطا). One row
// per lifecycle event so the full back-and-forth survives: completionNotes /
// reviewNote OVERWRITE each cycle, this table ACCUMULATES. Keyed to the
// field_task; only general tasks ever write events. event_type is a free varchar
// (extensible) — path-2 توزيع/اعتماد add later with NO schema change. actor_name
// is denormalized (like case_activity_log.user_name) so the FE needs no lookup.
export const generalTaskEvents = pgTable("general_task_events", {
  id:          varchar("id", { length: 255 }).primaryKey(),
  fieldTaskId: varchar("field_task_id", { length: 255 }).notNull(),
  actorId:     varchar("actor_id", { length: 255 }),
  actorName:   varchar("actor_name", { length: 255 }),
  eventType:   varchar("event_type", { length: 50 }).notNull(),
  body:        text("body"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  taskIdx:    index("general_task_events_task_idx").on(t.fieldTaskId),
  createdIdx: index("general_task_events_created_at_idx").on(t.createdAt),
  // FK mirrors memo_activity_log (cascade) — uncommented here, created with the
  // table on dev via the Replit-Shell SQL (db:push is unavailable locally).
  taskFk: foreignKey({
    name: "general_task_events_field_task_id_fkey",
    columns: [t.fieldTaskId],
    foreignColumns: [fieldTasks.id],
  }).onDelete("cascade"),
}));

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
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  clientIdx: index("contact_logs_client_idx").on(t.clientId),
}));

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
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  recipientIdx: index("notifications_recipient_idx").on(t.recipientId),
  // Batch M FK — applied via script/apply-fk-constraints.sql (commented; see law_cases note):
  // recipientFk: foreignKey({ name: "notifications_recipient_id_fkey",
  //   columns: [t.recipientId], foreignColumns: [users.id] }).onDelete("cascade"),
  // Phase-7 P7-2 — getRecentNotifications(200) orders by createdAt DESC.
  createdAtIdx: index("notifications_created_at_idx").on(t.createdAt),
}));

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
}, (t) => ({
  // Phase-7 P7-2 — getAttachmentsByEntity filters (entityType, entityId) on
  // every detail-view open; table had zero indexes. Mirrors the
  // contract_attachments_slot_lookup_idx two-column idiom.
  entityIdx: index("attachments_entity_idx").on(t.entityType, t.entityId),
}));

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
  // OPTIONAL auto-lift date for the pause, "YYYY-MM-DD". NULL = open-ended,
  // which is today's behaviour and stays the default — an existing pause is
  // completely unaffected. varchar(50) is the struck_off_reopen_deadline idiom
  // and is deliberately NOT a timestamp: the scheduler compares it as a plain
  // string against todayStr, which keeps it clear of the drizzle date-mode
  // conversion that silently broke auto-archive (Phase-4 S3).
  // ⚠ MUST be cleared on EVERY unpause path, or a stale date survives into the
  // next pause and lifts it early. See scheduler.checkExpiredPauses.
  // ⚠ APPLIED MANUALLY (db:push NOT run) — ALTER both DBs BEFORE this code
  // serves traffic: drizzle selects declared columns explicitly, so a missing
  // column breaks EVERY read of the table, not just the pause feature.
  pauseUntil:         varchar("pause_until", { length: 50 }),
  // data-completion reminder ack (memo awaiting-completion latch). Mirrors
  // lawCases.dataCompletionLastAckAt — the feed suppresses the
  // data_completion_memo task for 2 days after each ack. The task is gated on
  // awaiting_completion=true (memos have no data-completion STAGE; the button
  // is the trigger), and clears when resume-from-completion flips the latch off.
  dataCompletionLastAckAt: timestamp("data_completion_last_ack_at"),
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
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  caseIdx: index("memos_case_idx").on(t.caseId),
  // Batch M FK — applied via script/apply-fk-constraints.sql (commented; see law_cases note):
  // caseFk: foreignKey({ name: "memos_case_id_fkey",
  //   columns: [t.caseId], foreignColumns: [lawCases.id] }).onDelete("cascade"),
  // Phase-7 P7-2 — getAllMemos orders by deadline.
  deadlineIdx: index("memos_deadline_idx").on(t.deadline),
  // Unified-tasks I3 — per-user feed filters memos by assignee (memo_pending)
  // and by designated reviewer (review_pending). Both additive.
  assignedToIdx: index("memos_assigned_to_idx").on(t.assignedTo),
  internalReviewerIdx: index("memos_internal_reviewer_idx").on(t.internalReviewerId),
}));

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
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  caseIdx: index("case_activity_log_case_idx").on(t.caseId),
}));

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
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  caseIdx: index("case_notes_case_idx").on(t.caseId),
  // Batch M FK — applied via script/apply-fk-constraints.sql (commented; see law_cases note):
  // caseFk: foreignKey({ name: "case_notes_case_id_fkey",
  //   columns: [t.caseId], foreignColumns: [lawCases.id] }).onDelete("cascade"),
}));

export const caseComments = pgTable("case_comments", {
  id: varchar("id", { length: 255 }).primaryKey(),
  caseId: varchar("case_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  caseIdx: index("case_comments_case_idx").on(t.caseId),
  // Batch M FK — applied via script/apply-fk-constraints.sql (commented; see law_cases note).
  // CASCADE here ALSO closes the deleteCase gap (it doesn't delete case_comments today):
  // caseFk: foreignKey({ name: "case_comments_case_id_fkey",
  //   columns: [t.caseId], foreignColumns: [lawCases.id] }).onDelete("cascade"),
}));

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
}, (t) => ({
  // Phase-4 S1 — hot-path index (mirrors the contracts index idiom).
  caseIdx: index("legal_deadlines_case_idx").on(t.caseId),
  // Batch M FK — applied via script/apply-fk-constraints.sql (commented; see law_cases note):
  // caseFk: foreignKey({ name: "legal_deadlines_case_id_fkey",
  //   columns: [t.caseId], foreignColumns: [lawCases.id] }).onDelete("cascade"),
}));

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
  // Set when a delegation is REJECTED (status "مرفوض") via /api/delegations/:id/reject.
  // Nullable/additive — pending/approved/cancelled/expired rows leave it null.
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  // Unified-tasks I4a — delegation enforcement resolver filters by the delegate
  // (toUserId) on every authed request (getActingContext). Additive btree index.
  toUserIdx: index("delegations_table_to_user_idx").on(t.toUserId),
  // Batch M FKs — applied via script/apply-fk-constraints.sql (commented; see law_cases note).
  // Both mirror deleteUser, which deletes a user's delegations on delete:
  // fromUserFk: foreignKey({ name: "delegations_table_from_user_id_fkey",
  //   columns: [t.fromUserId], foreignColumns: [users.id] }).onDelete("cascade"),
  // toUserFk: foreignKey({ name: "delegations_table_to_user_id_fkey",
  //   columns: [t.toUserId], foreignColumns: [users.id] }).onDelete("cascade"),
}));

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

// Admin_support fine-grained task routing (Phase 1). Central mapping: each
// assignable admin_support task type → exactly ONE owner. One row per task_type
// (the PK enforces single-owner-per-type at the DB level). assigneeUserId is
// NULLABLE: NULL = unassigned → the task falls to the manager's unassigned group
// (Phase-1 routing lands in a later sub-step). Additive table, created on
// dev+prod via script/add-admin-support-task-assignments.sql (db:push
// unavailable); this declaration exists so Drizzle can query it.
export const adminSupportTaskAssignments = pgTable("admin_support_task_assignments", {
  taskType: varchar("task_type", { length: 50 }).primaryKey(),
  assigneeUserId: varchar("assignee_user_id", { length: 255 }),
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
  LABOR_REVIEW_HEAD: "labor_review_head",     // رئيس لجنة مراجعة القسم العمالي
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
  labor_review_head: "رئيس لجنة مراجعة القسم العمالي",
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

// ==================== THE CASE STAGE-FILTER DOMAIN ====================
// The COMPLETE set of values a cases-page stage filter may offer, in workflow
// order. Both cases filters (the main المرحلة dropdown and the advanced panel)
// build their options from this and nothing else.
//
// 🔴 WHY THIS EXISTS RATHER THAN A PATH ARRAY OR A CURATED LIST. Both filters
// COMPARE getCaseDisplayStage(c), which folds lifecycle state into a stage:
//     pausedAt              → استكمال_البيانات
//     status closed / archived → مقفلة
//     otherwise             → currentStage  (ANY CaseStage value)
// so the domain the predicate can produce is exactly "every CaseStage value" —
// the two folded values are themselves CaseStage members. Building options from
// path arrays instead is what made مقفلة and مؤرشفة unfilterable: neither is in
// ANY path array, yet every closed case displays as مقفلة.
//
// TOTAL BY CONSTRUCTION, not by review: it starts from CaseStagesOrder (which
// today already IS the full enum, verified) and then APPENDS any enum member
// that array happens to omit. Add a stage to CaseStage and forget CaseStagesOrder
// and this still covers it, so the "dropdown offers a value the predicate or the
// persisted validator does not accept" bug cannot come back through drift.
export const CaseStageFilterDomain: CaseStageValue[] = (() => {
  const ordered = [...CaseStagesOrder];
  for (const stage of Object.values(CaseStage) as CaseStageValue[]) {
    if (!ordered.includes(stage)) ordered.push(stage);
  }
  return ordered;
})();

// ==================== مراحل القضية حسب التصنيف والقسم ====================

// 🔴 تحرير_صحيفة_الدعوى REMOVED — merged into دراسة, which is now the single
// study-and-drafting stage on this path. GENERAL + COMMERCIAL ONLY.
//
// NO RELABEL: دراسة keeps its stored value AND its displayed label «دراسة»,
// deliberately. دراسة is ONE stored value shared by five paths, so relabelling
// it here would rename it in Labor, Admin and InCourtNoMemo too.
//
// ⚠ تحرير_صحيفة_الدعوى IS NOT DELETED as a stage value — it survives in
// UnderStudyLaborStages, UnderStudyAdminStages and InCourtPlaintiffMemoStages,
// and every consumer keyed on it still works for those paths. This removes one
// stage from two arrays; it is not a stage deletion.
export const UnderStudyGeneralStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "دراسة",
  "مراجعة_داخلية",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "جاهزة_للرفع",
  "قيد_التدقيق_في_ناجز",
  "مداولة_الصلح",
  "أغلق_طلب_الصلح",
  "منظورة",
];

// تحرير_صحيفة_الدعوى removed — see the note on UnderStudyGeneralStages. Same
// merge, same reasoning; these are the only two arrays affected.
export const UnderStudyCommercialStages: CaseStageValue[] = [
  "استلام",
  "استكمال_البيانات",
  "دراسة",
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
  // 🔴 COMMITTEE HIDDEN FOR LABOR — see DepartmentsWithoutCommittee above.
  // Internal review now passes straight to جاهزة_للرفع on this path.
  //
  // ⚠ BOTH إحالة_للجنة_المراجعة AND الأخذ_بالملاحظات were removed, and the second
  // is NOT scope creep — it is required for the first to mean anything.
  // الأخذ_بالملاحظات has exactly ONE producer in ALLOWED_CASE_TRANSITIONS: the
  // edge إحالة_للجنة_المراجعة → الأخذ_بالملاحظات. It is the committee's
  // returned-with-notes output and nothing else can reach it. Left in this
  // array it would have become stagesOrder[indexOf(مراجعة_داخلية) + 1] — internal
  // review would have advanced into the committee's OWN return stage, which is
  // unreachable for labor and the opposite of the ruling.
  //
  // NEITHER value is deleted from CaseStage, from ALLOWED_CASE_TRANSITIONS, or
  // from any other department's path. Restoring = re-add these two lines.
  // جاهزة_للرفع was MISSING here (General/Commercial both carry it in this exact
  // slot). Its absence broke labor three ways: (1) the FE derives next-stage from
  // this array, so الأخذ_بالملاحظات aimed at قيد_التدقيق_في_ناجز — a transition the
  // server does not allow (its only exit is → جاهزة_للرفع) → every advance 400'd
  // and the case was STUCK; (2) after committee approval the case sits at
  // جاهزة_للرفع, which — being absent here — made the path resolver fall back to
  // the COMMERCIAL array, routing a labor case into تراضي instead of ناجز; and
  // (3) resume-from-completion rejected a labor case saved at جاهزة_للرفع as an
  // INVALID_SAVED_STAGE. Both server rules already existed (الأخذ_بالملاحظات →
  // جاهزة_للرفع → قيد_التدقيق_في_ناجز), so restoring the stage here is the whole fix.
  "جاهزة_للرفع",
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
  // Same missing-stage bug as the labor path above: without جاهزة_للرفع the FE
  // aimed الأخذ_بالملاحظات → قيد_التدقيق_في_معين, which the server does not allow
  // (only → جاهزة_للرفع), so an admin case returned with committee notes was
  // STUCK. The server rules جاهزة_للرفع → قيد_التدقيق_في_معين already existed.
  "جاهزة_للرفع",
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

// TERMINAL case stages — final outcomes with no further workflow of their own.
// NONE of these belongs to any array returned by getStagesForClassification:
// they are reachable from MANY stages (early close from anywhere, struck-off
// from منظورة/منظورة_استئناف, تحصيل from مداولة_الصلح or انتظار_رد_التظلم), so
// they have no fixed position in a linear path.
// (This comment used to say "تحصيل from مداولة_الصلح or a final judgment" — that
// described the PRE-b41553a model, where a final judgment auto-moved to تحصيل.
// A final judgment now RESTS at محكوم_حكم_نهائي and closes from there; the
// محكوم_حكم_نهائي → تحصيل edge has been removed from ALLOWED_CASE_TRANSITIONS.)
//
// Consumers:
//   • cases.tsx getCasePriorityGroup — pushes terminal rows to the bottom of
//     the cases table (was a local TERMINATED_STAGES copy; hoisted here).
//   • case-progress-bar.tsx — renders the terminal-badge state instead of
//     collapsing the bar onto استلام (indexOf → -1 → index 0).
//
// محكوم_حكم_ابتدائي is qualified at the cases.tsx call site: only terminal when
// no active memo (an open objection memo means the case is still alive).
//
// منظورة_استئناف is deliberately NOT here — an appeal-pending case is still
// LIVE, and the cases table sorts it as "waiting on external" (group 4). It is
// nonetheless off-path, so the progress bar extends this set by that one stage
// for DISPLAY purposes only; see TERMINAL_BAR_STAGES in case-progress-bar.tsx.
// ==================== UNIVERSAL (department-independent) CASE STAGES ====================
// Stages a case can display in NO MATTER which department or path it is on.
// Any department-scoped stage-filter option list must include these, or the
// scoping silently hides live rows.
//
// 🔴 THIS IS THE TRAP THE OLD DATA-DERIVED DROPDOWN EXISTED TO PAPER OVER.
// مقفلة is in no path array, yet getCaseDisplayStage returns it for EVERY closed
// or archived case — so a purely path-based option list makes closed cases
// unfilterable the moment a department is picked. Same for مؤرشفة, مشطوبة and
// the judgment stages. Scoping by path is right; scoping by path ALONE is not.
//
// MEMBERSHIP IS DERIVED, NOT HAND-LISTED, in three parts:
//   1. Every stage in NO path array — the terminal/judgment/platform-submission
//      stages that every path can fall out to (مقفلة، مؤرشفة، مشطوبة،
//      محكوم_حكم_ابتدائي، محكوم_حكم_نهائي، منظورة_استئناف، and the three
//      رفع_* stages, which are in CaseStagesOrder but no path).
//   2. The two values getCaseDisplayStage FOLDS TO regardless of path —
//      DATA_COMPLETION (paused) and CLOSED (closed/archived). CLOSED already
//      falls out of (1); DATA_COMPLETION does NOT, because
//      InCourtSettlementStages omits it — so a PAUSED in-court settlement case
//      would have been unfilterable. Caught by the coverage proof, not by eye.
//   3. تحصيل. It IS in a path array (InCourtSettlementStages) so (1) misses it,
//      but ALLOWED_CASE_TRANSITIONS reaches it from مداولة_الصلح (General,
//      Commercial, Labor) AND from انتظار_رد_التظلم (Admin) — i.e. from all four
//      under-study departments. Being in ONE path does not make it that path's.
export const UniversalCaseStages: CaseStageValue[] = (() => {
  const inSomePath = new Set<CaseStageValue>([
    ...UnderStudyGeneralStages,
    ...UnderStudyCommercialStages,
    ...UnderStudyLaborStages,
    ...UnderStudyAdminStages,
    ...InCourtDefendantMemoStages,
    ...InCourtPlaintiffMemoStages,
    ...InCourtNoMemoStages,
    ...InCourtSettlementStages,
  ]);
  const extras: CaseStageValue[] = [
    CaseStage.DATA_COMPLETION,
    CaseStage.CLOSED,
    CaseStage.COLLECTION,
  ];
  const members = new Set<CaseStageValue>(
    CaseStageFilterDomain.filter((s) => !inSomePath.has(s)),
  );
  for (const s of extras) members.add(s);
  // Ordered by the canonical domain so any list built from this still reads as
  // the workflow does.
  return CaseStageFilterDomain.filter((s) => members.has(s));
})();

export const TerminalCaseStages: ReadonlySet<CaseStageValue> = new Set<CaseStageValue>([
  "محكوم_حكم_نهائي",
  "محكوم_حكم_ابتدائي",
  "مشطوبة",
  "تحصيل",
  "مقفلة",
  "مؤرشفة",
]);

// ============ AT-OR-PAST-COURT — the case has been FILED (2026-08-11) ============
//
// "The suit is in front of a court, or already was." Hoisted here from a local
// `STAGES_AT_OR_PAST_COURT` inside the hearing-CREATE handler (server/routes.ts)
// so ONE rule now answers "is this case in court" for the server gate AND the
// client dialog — the same reason judgmentDirectionOf / weAreTheAppellant were
// hoisted: the UI must never offer a button the endpoint rejects.
//
// WHY IT EXISTS AT ALL — the production incident of 2026-08-09. Three cases at
// منظورة, each with a court number and scheduled sessions, were pushed back to
// أغلق_طلب_الصلح by a لم_يتم_الصلح result recorded on a STALE تراضي hearing that
// had been left open when the case advanced into court. The settlement branches
// of the hearing-result handler read no stage at all before writing one.
//
// 🔴 محكوم_حكم_ابتدائي IS A MEMBER HERE AND WAS NOT A MEMBER OF THE ORIGINAL.
// Its absence there never claimed a first-instance judgment is somehow pre-court
// — it was a CARVE-OUT local to hearing creation, where a court hearing on such
// a case means THE OPPONENT APPEALED and the case must still be promoted onward
// to منظورة_استئناف. That carve-out is now spelled out in code at that one call
// site (`isOpponentAppeal ||`), which is exactly what the comment there already
// said in prose, so the set itself can be honest. The settlement guard needs it
// to be: a تم_الصلح recorded on a case holding a first-instance judgment would
// otherwise still drag it to تحصيل — the worst landing of all, because تحصيل is
// sealed against manual closure at every tier including branch_manager.
//
// NOT the same set as TerminalCaseStages above, and they must not be merged:
// that one asks "is the WORK over" (منظورة is live, so it is absent there);
// this one asks "has the case ENTERED COURT" (منظورة is the canonical member).
export const StagesAtOrPastCourt: ReadonlySet<CaseStageValue> = new Set<CaseStageValue>([
  "منظورة",
  "محكوم_حكم_ابتدائي",
  "منظورة_استئناف",
  "محكوم_حكم_نهائي",
  "تحصيل",
  "مشطوبة",
  "مؤرشفة",
  "مقفلة",
]);

// Null-safe membership test. An unresolved stage (no linked case on the client,
// a row with an empty stage) answers FALSE — i.e. PERMISSIVE. That direction is
// deliberate and matches the server guard, which only rejects when it actually
// holds the case row: this predicate gates a REFUSAL, so "I don't know" must
// never manufacture one.
export function caseIsAtOrPastCourt(stage: string | null | undefined): boolean {
  return !!stage && StagesAtOrPastCourt.has(stage as CaseStageValue);
}

// Stage selection is keyed on the case's DEPARTMENT (a stable FK to the
// departments table), not on caseType. caseType is a free-text user input
// that often holds a sub-type label like "بيع وتوريد" / "نزاع تجاري" and
// must not be used to route workflows. The four canonical department
// names ("عام" / "تجاري" / "عمالي" / "إداري") map 1:1 to the four
// UnderStudy stage arrays — callers should pass the resolved department
// name (e.g. via getDepartmentName(departmentId) on the client, or
// storage.getDepartmentById(departmentId)?.name on the server).
// ============ "منتهية" — DERIVED, FILTER-ONLY (2026-07-28) ============
// A third option on the cases-page CLASSIFICATION FILTER, meaning "the legal
// work is over".
//
// ⚠ IT IS NOT A STORED CLASSIFICATION. CaseClassification still has exactly two
// members (قيد_الدراسة / منظورة_بالمحكمة); nothing is written, no column, no
// migration, and no workflow reads this. It is computed from currentStage (plus
// clientRole for the one conditional stage) at filter time only.
//
// ⚠ DELIBERATELY NOT TerminalCaseStages. That set answers a RENDERING question —
// "should the progress bar stop advancing?" — and the two definitions genuinely
// diverge on two stages:
//   • محكوم_حكم_ابتدائي IS terminal for the bar but is NOT concluded here: the
//     objection window may still be running, the صك may not have arrived, and
//     an appeal may follow. That is live legal work, and it is exactly the case
//     that most needs chasing — hiding it from the active list would bury it.
//   • أغلق_طلب_الصلح is NOT terminal for the bar (a plaintiff continues into
//     litigation from there) but IS concluded for a DEFENDANT.
// This mirrors the precedent already recorded for منظورة_استئناف, which the
// progress bar extends its own local set with while TerminalCaseStages omits it:
// a display set and a semantic set are allowed to differ, on purpose.
// DO NOT "unify" these two sets.
//
// EXECUTION AND COLLECTION ARE CONCLUDED, per the owner: they are enforcement,
// not legal work. Note there is NO execution STAGE in this system — execution is
// a post-judgment FIELD TASK (ExecutionTaskTitlePrefix) raised while the case
// rests at محكوم_حكم_نهائي, so classifying that stage as concluded already
// covers it.
const UnconditionallyConcludedStages: string[] = [
  "محكوم_حكم_نهائي",
  "تحصيل",
  "مقفلة",
  "مؤرشفة",
  "مشطوبة",
];

/**
 * Is the firm's legal work on this case over? DERIVED — never stored.
 *
 * أغلق_طلب_الصلح is the one CONDITIONAL stage: settlement failed, so the
 * OPPONENT must now file. When our client is the DEFENDANT the firm has nothing
 * pending → concluded. When our client is the PLAINTIFF the case continues into
 * litigation (تحرير_صحيفة_الدعوى → …) → active. So this depends on clientRole,
 * not on the stage alone.
 */
export function isCaseConcluded(
  lawCase: { currentStage?: string | null; clientRole?: string | null },
): boolean {
  const stage = String(lawCase.currentStage ?? "");
  if (UnconditionallyConcludedStages.includes(stage)) return true;
  if (stage === "أغلق_طلب_الصلح") return lawCase.clientRole === "مدعى_عليه";
  return false;
}

/** Filter-only sentinel. Never written to caseClassification. */
export const CONCLUDED_FILTER_VALUE = "منتهية";

// ============ "مرحلة البداية" CORRECTION (2026-07-28) ============
// An in-court case is sometimes REGISTERED WRONG — filed as محكمة when it is
// really a صلح, or the reverse. This is the day-one correction for that.
//
// 🔴 IT IS NOT A FIELD FLIP. isSettlementCase decides which array
// getStagesForClassification returns — InCourtSettlementStages
// [استلام, مداولة_الصلح, تحصيل] wins BEFORE memoRequired/clientRole are even
// consulted — so changing the flag without also moving currentStage onto the new
// array leaves the stage OFF ITS OWN PATH. indexOf returns -1 and the progress
// bar collapses onto استلام: the exact bug class fixed in 3fcd4e3 / c24308e,
// recreated from data instead of code.
//
// WHY THIS WINDOW. The stages are the cheap part; what cannot be undone is
// everything already recorded against the old shape. A RECORDED HEARING RESULT
// is the real "this case has started living" line — a judgment lives on a
// hearing, and InCourtSettlementStages has no judgment stages at all, so
// flipping a judged case to صلح orphans the judgment with no route to the
// post-judgment flow. Past منظورة is the same story one step earlier.
//
// Soft consequences are WARNED about in the dialog, not blocked: in-flight memos
// and an already-captured settlement number are recoverable by hand; a judgment
// is not.
export const StartingStageOption = {
  COURT:      "استلام",
  SETTLEMENT: "مداولة_الصلح",
} as const;

export type StartingStageOptionValue =
  typeof StartingStageOption[keyof typeof StartingStageOption];

// Stages that mean the case has moved past its opening — correcting the starting
// stage from here would rewrite history rather than fix a registration mistake.
const StartingStageLockedStages: string[] = [
  "منظورة",
  "منظورة_استئناف",
  "محكوم_حكم_ابتدائي",
  "محكوم_حكم_نهائي",
  "تحصيل",
  "مشطوبة",
  "مقفلة",
];

/**
 * May the starting stage still be corrected? Shared so the FE cannot offer an
 * edit the endpoint rejects. Returns a REASON string when blocked (rendered to
 * the user as the read-only explanation), or null when the correction is open.
 */
export function startingStageCorrectionBlockedReason(
  lawCase: {
    caseClassification?: string | null;
    currentStage?: string | null;
    status?: string | null;
    isArchived?: boolean | null;
    pausedAt?: string | null;
    awaitingCompletion?: boolean | null;
  },
  hasRecordedHearingResult: boolean,
): string | null {
  if (lawCase.caseClassification !== "منظورة_بالمحكمة") {
    return "مرحلة البداية تخص القضايا المنظورة بالمحكمة فقط";
  }
  if (lawCase.status === "مغلق" || lawCase.isArchived || lawCase.currentStage === "مقفلة") {
    return "لا يمكن تصحيح مرحلة البداية لقضية مغلقة أو مؤرشفة";
  }
  if (lawCase.pausedAt) return "القضية معلّقة — أزل التعليق أولاً";
  if (lawCase.awaitingCompletion) return "القضية بانتظار استكمال البيانات";
  if (hasRecordedHearingResult) {
    return "لا يمكن تصحيح مرحلة البداية بعد تسجيل نتيجة جلسة على القضية";
  }
  if (StartingStageLockedStages.includes(String(lawCase.currentStage ?? ""))) {
    return "تجاوزت القضية مرحلة البداية — التصحيح متاح فقط قبل نظر القضية أمام المحكمة";
  }
  return null;
}

/** The current starting-stage value implied by a case's stored state. */
export function currentStartingStage(lawCase: { isSettlementCase?: boolean | null }): StartingStageOptionValue {
  return lawCase.isSettlementCase ? StartingStageOption.SETTLEMENT : StartingStageOption.COURT;
}

// ==================== DEPARTMENTS WITHOUT A REVIEW COMMITTEE ====================
// Departments whose workflow SKIPS the review-committee stage entirely: internal
// review is sufficient and passes straight to the ready-to-file stage.
//
// 🔴 THIS IS A HIDE, NOT A DELETION, and restoring is ONE LINE — empty the array.
// Nothing is removed from any stage enum, any transition table, any endpoint, or
// any role. إحالة_للجنة_المراجعة / لجنة_مراجعة, the committee-decision routes,
// the الأخذ_بالملاحظات return path and labor_review_head all remain fully intact
// and fully functional for every department NOT listed here.
//
// Keyed on the department NAME, matching the six existing labor gates
// (`getAllDepartments().find(d => d.name === "عمالي")`) and getStagesForClassification's
// own switch. A NAME LIST rather than a boolean flag so a second department costs
// a value, not a code branch.
//
// ⚠ ONLY CASES CONSUME THIS TODAY. Consultations, contracts and memos are
// deferred to their own batches — it is declared here now so those batches
// consume this predicate instead of inventing a second mechanism. Their paths are
// department-BLIND (contracts and memos have a single flow; consultations branch
// on TYPE), and memos carry no departmentId at all, so each will need a
// per-record conditional resolving the department first — this predicate is the
// shared half of that, not the whole of it.
export const DepartmentsWithoutCommittee: readonly string[] = ["عمالي"];

export function departmentHasCommittee(departmentName?: string | null): boolean {
  // 🔴 FAIL DIRECTION IS DELIBERATE: an unknown, empty or UNRESOLVABLE department
  // KEEPS its committee. Only a name explicitly listed above loses it.
  //
  // The obvious `!!departmentName && !list.includes(name)` is WRONG here and was
  // the first draft: it returns false for null, so a contract whose department id
  // does not resolve to a name would have had its committee silently hidden —
  // stages removed from its path and internal review re-routed — on the strength
  // of a failed lookup. Hiding a stage must require a positive match, never the
  // absence of information.
  if (!departmentName) return true;
  return !DepartmentsWithoutCommittee.includes(departmentName);
}

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

// The platform/court number a case must carry to SIT on a given stage, keyed on
// the TARGET stage alone. Used by the reopen flow (POST /api/cases/:id/reopen +
// its dialog), where the "from" stage is always مقفلة and so every from-keyed
// rule is meaningless.
//
// Mirrors the server's own target-keyed gates in routes.ts, which are the
// authority — تراضي (:2420), مداولة_الصلح/labor (:2442), ناجز (:2453),
// معين (:2465) — with the labels/placeholders copied verbatim from the
// advance-flow prompt (platformFieldInfo, case-progress-bar.tsx) so the user
// sees identical wording in both flows.
//
// TWO DELIBERATE DIVERGENCES from the advance flow:
//   • منظورة requires courtCaseNumber UNCONDITIONALLY here. In the advance flow
//     that capture is FROM-keyed (ناجز/معين/أغلق_طلب_الصلح → منظورة, routes.ts
//     :2787), which can't apply to a reopen. Entering court without the court
//     number is exactly what the reopen feature exists to prevent.
//   • مداولة_الصلح stays LABOR-ONLY. Commercial/general capture their taradi
//     number on تراضي-entry and that value survives closure untouched, so
//     re-prompting for it would be asking for something the row already has.
//
// NOTE this deliberately does NOT replace platformFieldInfo — the live advance
// flow is left byte-identical; only the new reopen consumers use this.
export function stageNumberRequirement(
  stage: CaseStageValue,
  departmentName?: string,
): { field: "taradiNumber" | "mohrNumber" | "najizNumber" | "moeenNumber" | "courtCaseNumber"; label: string; placeholder: string } | null {
  switch (stage) {
    case "قيد_التدقيق_في_تراضي":
      return { field: "taradiNumber", label: "رقم الطلب في تراضي", placeholder: "أدخل رقم الطلب في منصة تراضي" };
    case "مداولة_الصلح":
      return departmentName === "عمالي"
        ? { field: "mohrNumber", label: "رقم الدعوى في التسوية الودية", placeholder: "أدخل رقم الدعوى في التسوية الودية" }
        : null;
    case "قيد_التدقيق_في_ناجز":
      return { field: "najizNumber", label: "رقم القيد في ناجز", placeholder: "أدخل رقم القيد في ناجز" };
    case "قيد_التدقيق_في_معين":
      return { field: "moeenNumber", label: "رقم القيد في معين", placeholder: "أدخل رقم القيد في معين" };
    case "منظورة":
      return { field: "courtCaseNumber", label: "رقم الدعوى في المحكمة", placeholder: "أدخل رقم الدعوى الصادر من المحكمة" };
    default:
      return null;
  }
}

// The stages a CLOSED case may be reopened at: its own resolved path, plus
// منظورة always. Option A (owner decision 2026-07): a defendant settlement case
// closed at مقفلة must be able to reopen INTO COURT when the opponent files —
// the very promise the close dialog makes — but منظورة is absent from
// InCourtSettlementStages, so the path alone can't express it. The endpoint
// clears isSettlementCase (and promotes classification) when منظورة is chosen,
// which is what makes the path re-resolve to an array that CONTAINS منظورة —
// without that the stage would land off-path and collapse the progress bar.
export function getReopenTargetStages(
  classification: CaseClassificationValue,
  departmentName?: string,
  clientRole?: string,
  memoRequired?: boolean,
  isSettlementCase?: boolean,
): CaseStageValue[] {
  const path = getStagesForClassification(classification, departmentName, clientRole, memoRequired, isSettlementCase);
  return path.indexOf("منظورة") >= 0 ? [...path] : [...path, "منظورة"];
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

// ==================== مستلم إشعارات/مهام القضية ====================
//
// THE canonical "which lawyer do we notify / assign this to" answer for a case:
// primaryLawyerId FIRST, then responsibleLawyerId.
//
// 🔴 THIS ORDER IS SETTLED — owner decision 2026-08-04, REVERSING the
// responsible-first order this helper shipped with the same day. It is now the
// ONE order for notifications, tasks, memos and reports alike. Two reasons, both
// concrete:
//   1. responsibleLawyerId has NO input anywhere in the UI. All three assignment
//      controls are labelled "المحامي المسؤول" and every one writes
//      primaryLawyerId; two of them (the reassign dialog and the مهامي
//      CASE_UNASSIGNED action) write primaryLawyerId and nothing else. So after a
//      reassignment responsibleLawyerId names the SUPERSEDED lawyer, and
//      preferring it would notify the person who was just replaced.
//   2. Memo assignment already resolves primary-then-responsible. A notification
//      resolved the other way would name a different person as owner of the very
//      memo it announces.
// Do NOT flip it back. If a later change wants a different order, it needs its
// own named helper and its own reason.
//
// law_cases carries FOUR assignment fields — primaryLawyerId, responsibleLawyerId,
// assignedLawyers (jsonb) and litigatorId — and different call sites picked
// different orders, so "the lawyer for this case" meant different people
// depending on which code you were standing in. This fixes ONE of those
// questions: RECIPIENT resolution for notifications and tasks. It is deliberately
// NOT a general "who owns this case" accessor.
//
// ⚠ IT DOES NOT REPLACE THE OTHER TWO ORDERS, WHICH ARE DELIBERATE:
//   • litigatorId || primaryLawyerId || responsibleLawyerId — sets a hearing's
//     attendingLawyerId at creation (POST /api/hearings). المترافع wins because
//     that field is about who APPEARS IN COURT, and canActOnHearing is keyed on
//     it. Documented at the call site; untouched.
//   • hearing.attendingLawyerId || <case lawyer> — the hearing reminders and the
//     صك task. A "لديك جلسة" message must reach whoever actually attends, which
//     the hearing row already records. Untouched.
//
// UNASSIGNED CASES RETURN "" — the system's unassigned sentinel (memos.assigned_to
// is NOT NULL). Callers keep whatever they already do with an empty recipient;
// this helper deliberately invents NO fallback (no dept-head, no branch manager).
export function caseNotificationRecipientId(
  lawCase:
    | { primaryLawyerId?: string | null; responsibleLawyerId?: string | null }
    | null
    | undefined,
): string {
  return lawCase?.primaryLawyerId || lawCase?.responsibleLawyerId || "";
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
  // Judgment-lifecycle step 1: the case closes because every post-judgment
  // action (collection letter, and execution request when there is one) is
  // DONE — the successful end of a final judgment, not an early/abnormal close.
  // Written ONLY by the automatic close in the field-tasks completion handler;
  // deliberately NOT offered in the manual early-close dialog, which is for
  // closing a case that still had work left.
  COLLECTION_COMPLETED: "تم_التحصيل",
  // The client never supplied the missing documents/data. Written ONLY by
  // POST /api/cases/:id/close-no-response, which is offered exclusively while
  // the case sits at استكمال_البيانات. Deliberately NOT offered in the manual
  // early-close dialog: that dialog is stage-agnostic, and this reason is only
  // meaningful on the data-completion stage (it is also the one closure whose
  // closureReasonOther is filled automatically rather than typed).
  //
  // NOT تنازل_العميل — a waiver is a decision the client made; non-response is
  // the absence of one, and the two must stay distinguishable in reporting.
  DATA_NOT_COMPLETED: "عدم_استكمال_البيانات",
  OTHER: "أخرى",
} as const;

// The settlement-link timeout close (server/scheduler.ts) writes this free-text
// sentence into closure_reason — the column is varchar(255) free text, and this
// value is deliberately NOT a ClosureReason enum member. Lifted here so
// resolveCaseOutcome can recognise it (it maps to تعذّر الصلح) and so the scheduler
// and the resolver can never drift on a hand-copied Arabic string.
export const SettlementLinkMissingClosureReason =
  "لم نُزود برابط جلسة الصلح، ومر 15 يوم دون تحديث من العميل";

export type ClosureReasonValue = typeof ClosureReason[keyof typeof ClosureReason];

export const ClosureReasonLabels: Record<ClosureReasonValue, string> = {
  "عدم_تجديد_العقد": "عدم تجديد العقد",
  "سداد_الخصم": "سداد الخصم",
  "تنازل_العميل": "تنازل العميل",
  "حكم_نهائي_ضدنا": "حكم نهائي ضدنا",
  "حكم_ابتدائي_بدون_اعتراض": "حكم ابتدائي بدون اعتراض",
  "شطب_بدون_إعادة_قيد": "شطب بدون إعادة قيد",
  "لم_يتم_الصلح": "لم يتم الصلح",
  "تم_التحصيل": "تم التحصيل",
  "عدم_استكمال_البيانات": "عدم استكمال البيانات",
  "أخرى": "أخرى",
};

// Post-judgment field tasks are identified by their TITLE PREFIX — there is no
// task-kind column on field_tasks, and both the مهامي feed queries
// (storage.getMyTasks) and the auto-close gate (routes.ts field-tasks PATCH)
// already keyed on these exact strings independently. Centralised here so the
// two can never drift: renaming a title in ONE place used to silently drop the
// task out of the feed. Both are matched as `title LIKE '<prefix>%'`.
// ==================== نتيجة الاعتراض (التظلم) — the admin grievance outcome ====================
// Owner ruling: exactly three values. Stored in law_cases.grievance_result,
// which is varchar(50) FREE TEXT and needs no migration to gain this set.
//
// ⚠ THE COLUMN MAY ALREADY HOLD ANYTHING. Nothing has ever validated it, so a
// legacy or hand-written value outside this set is possible. Every consumer must
// therefore tolerate an unknown value rather than assume membership — the panel
// keeps it visible and selectable instead of blanking it (see the Select), and
// GrievanceResultLabels is read with a `?? raw` fallback, never as a total map.
//
// 🔴 لم_يُردّ_عليه IS LOAD-BEARING — DO NOT RENAME OR REMOVE IT CASUALLY.
// It is the value that triggers the 120-DAY PRESCRIPTION RULE: an اعتراض that
// received no answer starts a different clock from one that was decided. The
// prescription calculation is being built in the استلام batch and will key on
// this exact stored string. Renaming it silently breaks that calculation for
// every case already carrying the old value, with no error anywhere — the same
// failure shape as the stage-value renames this codebase guards against.
export const GrievanceResult = {
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
  // 🔴 the 120-day trigger — see the warning above.
  NO_RESPONSE: "لم_يُردّ_عليه",
} as const;

export type GrievanceResultValue = typeof GrievanceResult[keyof typeof GrievanceResult];

export const GrievanceResultLabels: Record<GrievanceResultValue, string> = {
  "مقبول": "مقبول",
  "مرفوض": "مرفوض",
  "لم_يُردّ_عليه": "لم يُردّ عليه",
};

// The three values as a plain array, for the endpoint's membership check and the
// panel's Select options. Derived from the const so a fourth value is ONE edit.
export const GrievanceResultValues: readonly GrievanceResultValue[] =
  Object.values(GrievanceResult) as GrievanceResultValue[];

export const CollectionTaskTitlePrefix = "إعداد خطاب تحصيل";
export const ExecutionTaskTitlePrefix = "رفع طلب تنفيذ";

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
  // 🔴 THE MERGED STAGE. دراسة and تحرير were two consecutive stages on the
  // WRITTEN path and are now ONE, labelled «الدراسة والتحرير». دراسة is the
  // value that SURVIVES — the merge is a relabel plus the removal of تحرير
  // from the path arrays, so no consultation had to change stage except the
  // two migrated rows. Stage values are free text (varchar 50), so this
  // needed no migration of its own.
  "دراسة": "الدراسة والتحرير",
  // تحرير is GONE from the WRITTEN path but its LABEL stays, deliberately:
  // consultation_activity_log rows and metadata.toStage/fromStage still carry
  // the value, and this map is what renders them. Deleting the entry would
  // break the type (Record over every ConsultationStageValue) and would make
  // historical timeline rows render a raw token.
  "تحرير": "تحرير",
  "مراجعة_داخلية": "مراجعة داخلية",
  "لجنة_مراجعة": "لجنة مراجعة",
  "الأخذ_بالملاحظات": "الأخذ بالملاحظات",
  "جاهزة_للإرسال": "جاهزة للإرسال",
  "منجزة": "جاهزة للإغلاق",
  "جاري_العمل": "جاري العمل",
  "مغلقة": "مغلقة",
};

// Linear happy-path order for the WRITTEN (مكتوبة) workflow.
// Phase-8 — RECEIVED_PENDING_COMPLETION sits between RECEIVED and STUDY.
// On entering this stage the FE shows a "تجاوز" button alongside the
// normal advance, which jumps directly to STUDY without requiring any
// document upload (handled in the await-completion route layer).
// NOTE: WRITTEN's terminal is CLOSED_FINAL ("مغلقة"). The old COMPLETED
// ("منجزة" → relabeled "جاهزة للإغلاق") stage was removed from the
// WRITTEN flow — written consultations now go READY → CLOSED_FINAL
// directly. COMPLETED remains a real stage only for PHONE/PROCEDURAL.
// 🔴 DRAFTING (تحرير) REMOVED — merged into STUDY, which is now rendered
// «الدراسة والتحرير». WRITTEN ONLY: the PHONE and PROCEDURAL arrays below never
// contained DRAFTING and are untouched. The STUDY→DRAFTING and
// DRAFTING→INTERNAL_REVIEW edges collapse into one STUDY→INTERNAL_REVIEW edge,
// and the internal-review REJECT loop now returns to STUDY.
// ⚠ STUDY stays at INDEX 2, which remapConsultationStageForType depends on
// (it reads targetStages[2] as "the target type's working stage").
export const ConsultationStagesOrder: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.STUDY,
  ConsultationStage.INTERNAL_REVIEW,
  ConsultationStage.COMMITTEE,
  ConsultationStage.READY,
  ConsultationStage.CLOSED_FINAL,
];

// All WRITTEN consultation stages in canonical order, including the
// conditional TAKING_NOTES branch (entered only when committee returns
// يوجد_ملاحظات). Used for rollback validation; the linear-path Order
// excludes TAKING_NOTES. TAKING_NOTES branches off ONLY from COMMITTEE
// and always returns to READY after the outcome — it's not in the
// linear path on purpose.
// DRAFTING removed here too — see the note on ConsultationStagesOrder. This is
// the list getConsultationStagesForType returns for WRITTEN, so it is what
// rollback validation, the stage bar and remapConsultationStageForType resolve
// against. STUDY remains at index 2.
export const ConsultationStagesAll: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.STUDY,
  ConsultationStage.INTERNAL_REVIEW,
  ConsultationStage.COMMITTEE,
  ConsultationStage.TAKING_NOTES,
  ConsultationStage.READY,
  ConsultationStage.CLOSED_FINAL,
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

// ==================== Follow-up cycle ("استشارة تعقيبية") ====================
// A closed consultation can be re-opened into a short 3-stage mini-flow
// on the SAME record (followUpCount bumps, status flips to active,
// currentStage resets to RECEIVED). Stage tokens are reused from the
// main enum — no new labels. PHONE/PROCEDURAL share the same cycle
// shape; WRITTEN substitutes READY for COMPLETED at stage 2.
export const ConsultationCycleStagesWritten: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.READY,
  ConsultationStage.CLOSED_FINAL,
];
export const ConsultationCycleStagesPhone: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.COMPLETED,
  ConsultationStage.CLOSED_FINAL,
];
export const ConsultationCycleStagesProcedural: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.COMPLETED,
  ConsultationStage.CLOSED_FINAL,
];

// True while the consultation is actively inside a follow-up cycle.
// Status-gated so a CLOSED-with-followUpCount>0 row (cycle finished)
// reports false — gating callers (transition validation, action buttons)
// use this to decide whether to apply cycle rules.
export function isInFollowUpCycle(
  c: { followUpCount?: number | null; status?: string | null } | null | undefined,
): boolean {
  if (!c) return false;
  return (c.followUpCount ?? 0) > 0 && c.status === "active";
}

// Stages list for the stage-bar / rollback validator. Returns the cycle
// 3-stage list whenever followUpCount > 0 (status-agnostic — a closed
// cycle still renders the cycle bar with CLOSED_FINAL highlighted, not
// the original 8-stage path). Falls back to the type's full stages list.
export function getStagesForConsultationCycle(
  c: { followUpCount?: number | null; consultationType?: string | null } | null | undefined,
): readonly ConsultationStageValue[] {
  if (!c || (c.followUpCount ?? 0) <= 0) {
    return getConsultationStagesForType(resolveConsultationType(c?.consultationType));
  }
  const type = resolveConsultationType(c.consultationType);
  if (type === ConsultationType.PHONE) return ConsultationCycleStagesPhone;
  if (type === ConsultationType.PROCEDURAL) return ConsultationCycleStagesProcedural;
  return ConsultationCycleStagesWritten;
}

// Stages a CLOSED consultation may be re-opened at (POST /:id/reopen).
// Same reasoning as getContractReopenTargetStages — see its comment for why
// this derives from the CYCLE-aware resolver rather than the raw type list, and
// why no forced escape-hatch stage is offered. CLOSED_FINAL is excluded.
// 🔴 THE CONSULTATION COMMITTEE HIDE — twin of contractStagesForDepartment.
// A per-record FILTER over whatever list the caller already resolved, so the
// type-resolved and cycle-aware callers filter identically without duplicating
// either resolver.
//
// NO-OP FOR MOST CONSULTATIONS, by construction rather than by guard:
//   • PHONE and PROCEDURAL paths contain no committee at all (the committee is
//     WRITTEN-only), so a labor phone/procedural consultation is untouched.
//   • ConsultationCycleStages{Written,Phone,Procedural} are 3-stage lists with
//     no committee either, so a follow-up cycle is untouched — the filter cannot
//     disturb the cycle records that stranded before.
// Only the WRITTEN path for a committee-less department actually changes.
//
// ⚠ TAKING_NOTES REMOVED ALONGSIDE, third entity running on the same proven
// fact: its ONLY producer is the edge COMMITTEE → TAKING_NOTES, so with no
// committee it is unreachable.
//
// Nothing is deleted — both stages stay in ConsultationStage, in the transition
// tables and in every list for departments that HAVE a committee.
export function consultationStagesForDepartment(
  departmentName: string | null | undefined,
  base: readonly ConsultationStageValue[],
): ConsultationStageValue[] {
  if (departmentHasCommittee(departmentName)) return [...base];
  return base.filter(
    (s) => s !== ConsultationStage.COMMITTEE && s !== ConsultationStage.TAKING_NOTES,
  );
}

export function getConsultationReopenTargetStages(
  c: { followUpCount?: number | null; consultationType?: string | null } | null | undefined,
): ConsultationStageValue[] {
  return getStagesForConsultationCycle(c).filter((s) => s !== ConsultationStage.CLOSED_FINAL);
}

// ============ Pre-entry skip of the data-completion stage ============
// The stage a "تجاوز استكمال المرفقات والبيانات" lands on, or NULL when the
// record has no data-completion stage to skip.
//
// 🔴 THIS IS A PRE-ENTRY SKIP, pressed AT استلام to jump PAST the
// data-completion stage — the direct mirror of the cases-side
// POST /api/cases/:id/skip-data-completion. It is NOT the removed
// /skip-completion, which fired from INSIDE the stage and wrote the same
// target as the ordinary advance (a relabelled advance, not a skip).
//
// 🔴 DERIVED FROM getStagesForConsultationCycle, NOT from the type list —
// the same reason getConsultationReopenTargetStages is. That resolver is
// STATUS-AGNOSTIC: once followUpCount > 0 a record resolves against the
// 3-stage cycle list forever, and ConsultationCycleStages* contain NO
// RECEIVED_PENDING_COMPLETION. A follow-up cycle therefore has nothing to
// skip and returns null, instead of landing currentStage off its own
// resolved path — the data-shaped bar collapse fixed in 3fcd4e3.
//
// The per-type target falls OUT of the resolved list rather than being
// re-derived: the resolver already calls resolveConsultationType, so there
// is exactly ONE type derivation in the system and the target can never
// disagree with the rendered stage bar. Written/phone → دراسة, procedural
// → جاري_العمل, purely because that is what sits after the stage in each
// type's own list.
//
// Client AND server both call this, so the confirmation dialog can never
// preview a stage the endpoint would not write.
export function consultationSkipDataCompletionTarget(
  c: { followUpCount?: number | null; consultationType?: string | null } | null | undefined,
): ConsultationStageValue | null {
  const stages = getStagesForConsultationCycle(c);
  const idx = stages.indexOf(ConsultationStage.RECEIVED_PENDING_COMPLETION);
  if (idx < 0) return null;
  return stages[idx + 1] ?? null;
}

// Remap currentStage when the consultation's workflow type changes. If
// the existing stage is already valid in the new type's stages list,
// keep it. Otherwise apply a small heuristic for stages that semantically
// "match" (intake stays intake, data-completion stays data-completion,
// study↔in-progress, terminal stages collapse to the target's
// pre-closure / terminal stage), and fall back to RECEIVED for anything
// unmapped — the canonical safe restart point.
//
// Terminal model: WRITTEN's terminal is CLOSED_FINAL (no COMPLETED in
// its list anymore); PHONE/PROCEDURAL keep COMPLETED → CLOSED_FINAL.
// targetPreClose is COMPLETED when the target type still has it
// (PHONE/PROCEDURAL) and CLOSED_FINAL otherwise (WRITTEN), so a
// "done/ready-to-close" source stage lands on the right place per type.
export function remapConsultationStageForType(
  fromStage: ConsultationStageValue,
  toType: ConsultationTypeValue,
  // The consultation's department NAME. Optional and defaulting to today's
  // behaviour (a committee-having department), so existing callers are
  // unaffected.
  //
  // 🔴 WHY IT MATTERS. Every exit of this function is membership-guarded against
  // targetStages, so an UNFILTERED list can return COMMITTEE via the
  // `return fromStage` arm — landing a committee-less department's consultation
  // on a stage its own path no longer has. That is reachable, not theoretical:
  // the flat transition table still permits INTERNAL_REVIEW → COMMITTEE by
  // direct API for any department. Filtering the target list here means the
  // membership guards do the work and such a row is remapped ONTO its path
  // (semanticMap sends COMMITTEE to targetStages[2]) instead of being stranded.
  departmentName?: string | null,
): ConsultationStageValue {
  const targetStages = consultationStagesForDepartment(
    departmentName,
    getConsultationStagesForType(toType),
  );
  if (targetStages.includes(fromStage)) return fromStage;

  const targetTerminal = targetStages[targetStages.length - 1] as ConsultationStageValue;
  const targetPreClose = targetStages.includes(ConsultationStage.COMPLETED)
    ? ConsultationStage.COMPLETED
    : targetTerminal;

  // Heuristic mapping by semantic equivalence. Only applied when the
  // raw stage isn't already valid for the target type.
  const semanticMap: Partial<Record<ConsultationStageValue, ConsultationStageValue>> = {
    [ConsultationStage.RECEIVED]:                    ConsultationStage.RECEIVED,
    [ConsultationStage.RECEIVED_PENDING_COMPLETION]: ConsultationStage.RECEIVED_PENDING_COMPLETION,
    // WRITTEN's working/review stages → the new type's stage 3 (STUDY
    // for PHONE / IN_PROGRESS for PROCEDURAL). Pick whichever stage
    // 3 the target uses by reading targetStages directly.
    [ConsultationStage.STUDY]:                       targetStages[2] as ConsultationStageValue,
    // 🔴 KEPT DELIBERATELY even though تحرير no longer exists on the WRITTEN
    // path. It is the landing rule for a RESIDUAL تحرير row — one that predates
    // the merge, or whose migration was missed — if its type is ever changed.
    // Without it such a row would fall through to the استلام fallback and lose
    // its position; with it, it lands on the target type's working stage.
    // Harmless when no such row exists, load-bearing the day one does.
    [ConsultationStage.DRAFTING]:                    targetStages[2] as ConsultationStageValue,
    [ConsultationStage.INTERNAL_REVIEW]:             targetStages[2] as ConsultationStageValue,
    [ConsultationStage.COMMITTEE]:                   targetStages[2] as ConsultationStageValue,
    [ConsultationStage.TAKING_NOTES]:                targetStages[2] as ConsultationStageValue,
    // "Ready to deliver" / "done" / closed → the target's pre-closure
    // stage (COMPLETED for PHONE/PROCEDURAL) or its terminal
    // (CLOSED_FINAL for WRITTEN, which no longer has COMPLETED).
    [ConsultationStage.READY]:                       targetPreClose,
    [ConsultationStage.COMPLETED]:                   targetPreClose,
    [ConsultationStage.IN_PROGRESS]:                 targetStages[2] as ConsultationStageValue,
    [ConsultationStage.CLOSED_FINAL]:                targetTerminal,
  };

  const mapped = semanticMap[fromStage];
  if (mapped && targetStages.includes(mapped)) return mapped;
  return ConsultationStage.RECEIVED;
}

// ==================== Consultation Category ====================
// A TRIAGE label — how big a job the consultation looks like. Set once at
// creation (no manual override) and stored as plain varchar so a future
// category addition is a value change with no DDL.
//
// ⚠ It no longer computes ANYTHING. Until the expected-delivery-date feature was
// removed, this drove expectedDeliveryDate via a SLA_DAYS map (1 / 3 / 14) and
// the labels read "سريعة (يوم)" / "عادية (3 أيام)" / "طويلة (14 يوم)". Those
// day-counts were dropped WITH the feature: nothing computes or enforces a
// delivery window any more, so a label promising one would be a lie. Do NOT
// re-add day-counts to these labels without re-adding something that enforces
// them. ConsultationCategorySLADays was deleted outright — it had no other
// consumer.
export const ConsultationCategory = {
  QUICK:    "سريعة",
  STANDARD: "عادية",
  LONG:     "طويلة",
} as const;

export type ConsultationCategoryValue = typeof ConsultationCategory[keyof typeof ConsultationCategory];

export const ConsultationCategoryLabels: Record<ConsultationCategoryValue, string> = {
  "سريعة": "سريعة",
  "عادية": "عادية",
  "طويلة": "طويلة",
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
// ==================== Consultation Source (how the consultation reached us) ====================
// Set at creation. Stored on consultations.source (varchar 50). Underscore
// tokens as the stored value, spaced Arabic as the display label — same
// convention as ConsultationStage.
export const ConsultationSource = {
  GROUP:   "عبر_المجموعة",
  PRIVATE: "على_الخاص",
} as const;

export type ConsultationSourceValue = typeof ConsultationSource[keyof typeof ConsultationSource];

export const ConsultationSourceLabels: Record<ConsultationSourceValue, string> = {
  "عبر_المجموعة": "عبر المجموعة",
  "على_الخاص":   "على الخاص",
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
  AWAITING_REVIEW: "بانتظار_الاطلاع",
  // General (عام) task path-2 (dept-routed) lifecycle states (additive):
  AWAITING_DISTRIBUTION: "بانتظار_التوزيع", // sitting with the dept_head to hand to a member
  AWAITING_APPROVAL: "بانتظار_الاعتماد",     // member's result awaiting the dept_head's approval
} as const;

export type FieldTaskStatusValue = typeof FieldTaskStatus[keyof typeof FieldTaskStatus];

export const FieldTaskStatusLabels: Record<FieldTaskStatusValue, string> = {
  "قيد_الانتظار": "قيد الانتظار",
  "قيد_التنفيذ": "قيد التنفيذ",
  "مكتمل": "مكتمل",
  "ملغي": "ملغي",
  "بانتظار_الاطلاع": "بانتظار الاطلاع",
  "بانتظار_التوزيع": "بانتظار الإسناد",
  "بانتظار_الاعتماد": "بانتظار الاعتماد",
};

// ==================== أنواع المهام الميدانية ====================
export const FieldTaskType = {
  FIELD_REVIEW: "مراجعة_ميدانية",
  DOCUMENT_DELIVERY: "تسليم_مستندات",
  CLIENT_VISIT: "زيارة_عميل",
  COURT_FOLLOW_UP: "متابعة_محكمة",
  OTHER: "أخرى",
  GENERAL: "عام",
} as const;

export type FieldTaskTypeValue = typeof FieldTaskType[keyof typeof FieldTaskType];

export const FieldTaskTypeLabels: Record<FieldTaskTypeValue, string> = {
  "مراجعة_ميدانية": "مراجعة ميدانية",
  "تسليم_مستندات": "تسليم مستندات",
  "زيارة_عميل": "زيارة عميل",
  "متابعة_محكمة": "متابعة محكمة",
  "أخرى": "أخرى",
  "عام": "مهمة عامة",
};

// ==================== أحداث المهام العامة (general-task activity thread) ====================
// Extensible event types for the general (عام) task الأخذ والعطا thread. Path-2
// (sub-step 7/8) adds DISTRIBUTED "توزيع" / APPROVED "اعتماد" here with no schema
// change (event_type is a free varchar on the row).
export const GeneralTaskEventType = {
  DISTRIBUTED:        "توزيع",      // dept_head handed a dept-routed task to a member (sub-step 6)
  RESULT_SUBMITTED:   "إنجاز",      // worker submitted a result
  RETURNED_WITH_NOTE: "ملاحظة",     // requester OR dept_head sent it back with a note
  REVIEWED_CLOSED:    "تم_الاطلاع", // requester closed it (no text)
  APPROVED:           "اعتماد",     // dept_head approved a member's result → on to the requester (sub-step 8)
} as const;

export type GeneralTaskEventTypeValue = typeof GeneralTaskEventType[keyof typeof GeneralTaskEventType];

export const GeneralTaskEventTypeLabels: Record<GeneralTaskEventTypeValue, string> = {
  // Key (the stored event_type value) stays "توزيع"; the DISPLAYED label is "إسناد".
  "توزيع": "إسناد",
  "إنجاز": "إنجاز",
  "ملاحظة": "ملاحظة",
  "تم_الاطلاع": "تم الاطلاع",
  "اعتماد": "اعتماد",
};

// ==================== تخصص المهام (Task-routing specialty) ====================
// Primary work-class buckets used to route auto-created admin_support tasks to
// the right specialist (the 4 admin_support staff have different specialties).
// Stored as a jsonb string array on the user (users.taskSpecialties) so a user
// can hold MULTIPLE classes (e.g. both ترافع and استشارات). Sub-classes can be
// added under a primary class later by extending this enum — no schema change,
// since the column is just a string array.
export const TaskSpecialty = {
  LITIGATION: "ترافع",
  CONSULTATIONS: "استشارات",
} as const;

export type TaskSpecialtyValue = typeof TaskSpecialty[keyof typeof TaskSpecialty];

export const TaskSpecialtyLabels: Record<TaskSpecialtyValue, string> = {
  "ترافع": "ترافع",
  "استشارات": "استشارات",
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

// Display labels, mirroring HearingStatusLabels / HearingResultLabels. Two of the
// three values are already presentable, but تسوية_ودية carries the enum's
// underscore and must never reach a user that way — which is the whole reason a
// map exists rather than printing the raw value.
export const HearingTypeLabels: Record<HearingTypeValue, string> = {
  "محكمة": "محكمة",
  "تراضي": "تراضي",
  "تسوية_ودية": "تسوية ودية",
};

// A hearing that produces NO court ضبط, so the minutes requirement must not
// apply to it (owner decision 2026-08-04). جلسات الصلح والتسوية are conducted on
// the settlement platforms, not by a court, and issue no minutes document.
//
// KEYED ON hearing_type, the authoritative PER-HEARING column — not on the case's
// stage, not on isSettlementCase, and not on caseType:
//   • the case moves on while the hearing record stays, so a stage-derived test
//     would misread a past settlement hearing on a now-court case;
//   • isSettlementCase is case-level, and a settlement case can later hold real
//     court hearings;
//   • caseType is free text, and trusting it is a DOCUMENTED BUG in this codebase
//     (the L5 labor fix replaced exactly that test with a department lookup).
// hearing_type is already load-bearing server-side — POST /api/hearings branches
// on it to choose between the مداولة_الصلح transition and the court promotion —
// so this reuses an existing decision rather than inventing a parallel one.
//
// ⚠ معين IS NOT EXCLUDED (owner answer 2026-08-04): معين hearings DO produce a
// ضبط. They carry hearingType "محكمة" — the معين stages are deliberately absent
// from the create-form's settlement-stage list — so they stay required by
// construction, with no term needed here. Do not add them.
//
// SHARED, and it must stay shared: the minutes rule has THREE separate
// implementations (the client predicate behind badge/badge/filter, the my-tasks
// SQL emission, and the hearing close gate). This lives in shared/schema.ts
// rather than client/lib so the server halves can import it too — a client-only
// helper would have left two of the five surfaces to drift.
export function hearingProducesNoMinutes(h: { hearingType?: string | null }): boolean {
  return h.hearingType === HearingType.TARADI || h.hearingType === HearingType.SETTLEMENT;
}

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
  "قيد_المراجعة": "تحت المراجعة",
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

// 🔴 THE MEMO COMMITTEE HIDE — fourth and last entity, same shape as the
// contracts and consultations helpers.
//
// ⚠ MEMOS HAVE NO departmentId COLUMN. The department resolves through
// memos.caseId → the PARENT CASE's departmentId, so every caller must resolve
// the parent first. That is why this takes a NAME like its siblings rather than
// a record: the two-hop lookup belongs to the caller, which knows whether it has
// the parent case in hand.
//
// A memo whose parent case does NOT resolve (deleted or missing) yields a null
// name, and departmentHasCommittee returns TRUE for null — so an unresolvable
// parent KEEPS the committee. Hiding a stage must never follow from a failed
// lookup (the 8ab56e3 fix).
//
// TAKING_NOTES removed alongside, on the same proven fact as the other three:
// its ONLY producer is the edge COMMITTEE → TAKING_NOTES.
export function memoStagesForDepartment(
  departmentName: string | null | undefined,
  base: readonly MemoStageValue[],
): MemoStageValue[] {
  if (departmentHasCommittee(departmentName)) return [...base];
  return base.filter(
    (s) => s !== MemoStage.COMMITTEE && s !== MemoStage.TAKING_NOTES,
  );
}

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
  taskSpecialties: TaskSpecialtyValue[] | null;
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
  // Judgment-lifecycle step 2. null receipt date = "بانتظار استلام الصك";
  // null window = the 30-day default. See the columns' comment above.
  judgmentDeedReceivedDate: string | null;
  objectionWindowDays: number | null;
  executionRequestNumber: string | null;
  // لوحة تفاصيل المخالفة (إداري). See the column block for the type reasoning.
  administrativeDecisionNumber: string | null;
  administrativeDecisionDate: string | null;
  violationKnowledgeDate: string | null;
  ifaaNumber: string | null;
  ifaaDate: string | null;
  // «رقم الاعتراض» in the UI; named for التظلم because they are the same thing
  // and its date/result are grievanceDate / grievanceResult.
  grievanceNumber: string | null;
  invoiceNumber: string | null;
  // 🔴 STRING, not number — numeric(12,2) is inferred by drizzle as a string
  // (e.g. "1500.00") to preserve exact decimal precision, and the driver returns
  // it that way. Typing this `number` would compile and then be wrong at runtime.
  violationAmount: string | null;
  // 🔴 NOT executionRequestNumber. See the column comment: that one belongs to
  // the مهامي execution task and carries side effects; this one is a plain
  // panel field. Never conflate them.
  adminExecutionRequestNumber: string | null;
  appealLawyerId: string | null;
  // "المترافع" — optional court-appearance override. See the column comment.
  litigatorId: string | null;
  internalReviewerId: string | null;
  moeenNumber: string | null;
  clientRole: string | null;
  isArchived: boolean;
  dataCompletionLastAckAt: string | null;
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
  // "YYYY-MM-DD" or null (open-ended pause). See the column comment.
  pauseUntil: string | null;
  agencyIssuanceRequested: boolean;
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
  // عنوان الاستشارة. Nullable — rows created before the column existed have
  // none, so every display site must fall back (the list shows "—").
  title: string | null;
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
  // How the consultation reached us (ConsultationSourceValue). NOT NULL +
  // DB default so legacy rows surface as "عبر_المجموعة" after the backfill.
  source: ConsultationSourceValue;
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
  // "YYYY-MM-DD" or null (open-ended pause). See the column comment.
  pauseUntil: string | null;
  dataCompletionLastAckAt: string | null;
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
  // Follow-up cycle counter. 0 for fresh consultations; bumped each time
  // a closed consultation is re-opened via /start-follow-up. Renders the
  // 3-stage cycle bar and the "تعقيبية #N" header badge.
  followUpCount: number;
  followUpStartedAt: string | null;
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
  // The client never supplied the missing documents/data. Written ONLY by
  // POST /api/consultations/:id/close-no-response, which is offered exclusively
  // while the consultation sits at استكمال_المرفقات_والبيانات — deliberately NOT
  // offered in the manual early-close picker, which is stage-agnostic.
  //
  // ENGLISH value to match this enum's own convention (see the header note) —
  // the CASES twin is ClosureReason.DATA_NOT_COMPLETED = "عدم_استكمال_البيانات",
  // Arabic, because the cases enum is Arabic throughout. Same concept, each in
  // its own vocabulary; the Arabic label lives in the FE label map either way.
  // No migration: closure_reason is a plain varchar.
  DATA_NOT_COMPLETED:  "data_not_completed",
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
  // The consultation moved to another department. Mirrors the cases-side
  // department_transferred actionType and ContractActivityType's own member.
  // Type-only: activity_type is free text, so no migration.
  DEPARTMENT_TRANSFERRED: "department_transferred",
  STAGE_ADVANCED:         "stage_advanced",
  STAGE_RETURNED:         "stage_returned",
  INTERNAL_REVIEW:        "internal_review",
  COMMITTEE_DECISION:     "committee_decision",
  TAKE_NOTES_OUTCOME:     "take_notes_outcome",
  RETURNED_TO_COMMITTEE:  "returned_to_committee",
  // Reasoned override — the consultation was moved from لجنة_مراجعة straight to
  // جاهزة_للإرسال WITHOUT a committee decision. WRITTEN-only (phone/procedural
  // workflows have no committee stage). Mirrors the cases-side actionType and
  // MemoActivityType.COMMITTEE_SKIPPED. Type-only: activity_type is free text,
  // so no migration.
  COMMITTEE_SKIPPED:      "committee_skipped",
  DELIVERY_EXTENDED:      "delivery_extended",
  CONVERTED_TO_CASE:      "converted_to_case",
  EARLY_CLOSED:           "early_closed",
  // Closed because the client never completed the file. Distinct from
  // EARLY_CLOSED so the timeline (and any future report) can tell a
  // non-responsive client apart from a deliberate early closure.
  // Type-only — activity_type is free text, so no migration.
  CLOSED_NO_RESPONSE:     "closed_no_response",
  // Re-opened at a caller-chosen stage to RESUME the original work. Distinct
  // from FOLLOW_UP_STARTED, which is a different act: that begins a NEW,
  // smaller piece of work in a 3-stage cycle. See the route comment.
  REOPENED:               "reopened",
  GENERAL_NOTE:           "general_note",
  PAUSED:                 "paused",
  UNPAUSED:               "unpaused",
  AWAIT_COMPLETION:       "await_completion",
  RESUME_FROM_COMPLETION: "resume_from_completion",
  COMPLETION_SKIPPED:     "completion_skipped",
  TYPE_CHANGED:           "consultation_type_changed",
  FOLLOW_UP_STARTED:      "follow_up_started",
  // Record-level correction via "تعديل البيانات" (client / question / source).
  // Deliberately distinct from TYPE_CHANGED and DEPARTMENT-transfer entries:
  // those are workflow events, this is a data fix. Type-only — activity_type is
  // free text, so no migration.
  DETAILS_EDITED:         "details_edited",
} as const;

export type ConsultationActivityTypeValue =
  typeof ConsultationActivityType[keyof typeof ConsultationActivityType];

export const ConsultationActivityTypeLabels: Record<ConsultationActivityTypeValue, string> = {
  closed_no_response:       "إغلاق لعدم استكمال البيانات",
  reopened:                 "إعادة فتح",
  created:                  "إنشاء",
  assigned:                 "إسناد",
  department_transferred:   "تحويل لقسم آخر",
  stage_advanced:           "تقدم في المرحلة",
  stage_returned:           "إرجاع للمرحلة السابقة",
  internal_review:          "مراجعة داخلية",
  committee_decision:       "قرار اللجنة",
  take_notes_outcome:       "نتيجة الأخذ بالملاحظات",
  returned_to_committee:    "إعادة للجنة المراجعة",
  committee_skipped:        "تجاوز لجنة المراجعة",
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
  details_edited:           "تعديل البيانات",
  follow_up_started:        "بدء استشارة تعقيبية",
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
  "استكمال_البيانات_والمرفقات":  "استكمال المرفقات والبيانات",
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

// ============ Contract follow-up cycle ("استشارة تعقيبية") ============
// A closed contract can be re-opened on the SAME record for a client
// follow-up question (followUpCount bumps, status flips to active,
// currentStage resets to RECEIVED). Direct mirror of the consultations
// follow-up cycle — see ConsultationCycleStages* / isInFollowUpCycle /
// getStagesForConsultationCycle above.
//
// A follow-up is just "answer the question and close again" — it must NOT
// re-run the full flow through تحرير / مراجعة داخلية / لجنة المراجعة. So a
// cycle collapses to a 3-stage mini-flow, exactly as consultations do.
//
// Consultations pick their cycle shape by consultationType (WRITTEN
// substitutes READY for COMPLETED at stage 2). Contracts have a SINGLE
// type-agnostic flow (getContractStagesForType ignores its argument by
// design), so there is nothing to choose from: ONE fixed cycle list.
// Stage tokens are reused from the main enum — no new labels, no new
// column, no migration.
export const ContractCycleStages: ContractStageValue[] = [
  ContractStage.RECEIVED,
  ContractStage.READY,
  ContractStage.CLOSED,
];

// True while the contract is actively inside a follow-up cycle. Status-gated
// exactly like isInFollowUpCycle, so a CLOSED row carrying followUpCount > 0
// (a finished cycle) reports false — gating callers (transition validation,
// advance/return targets) use this to decide whether cycle rules apply.
export function isContractInFollowUpCycle(
  c: { followUpCount?: number | null; status?: string | null } | null | undefined,
): boolean {
  if (!c) return false;
  return (c.followUpCount ?? 0) > 0 && c.status === "active";
}

// Stages list for the stage bar / rollback validator. Mirrors
// getStagesForConsultationCycle including its STATUS-AGNOSTIC condition:
// whenever followUpCount > 0 the cycle list wins, so a re-closed cycle still
// renders the 3-stage bar with مغلقة highlighted rather than snapping back to
// the original 8-stage path. Falls back to the full contract stages list.
export function getStagesForContractCycle(
  c: { followUpCount?: number | null } | null | undefined,
): readonly ContractStageValue[] {
  if (!c || (c.followUpCount ?? 0) <= 0) return ContractStagesAll;
  return ContractCycleStages;
}

// Stages a CLOSED contract may be re-opened at (POST /:id/reopen).
//
// 🔴 DERIVED FROM getStagesForContractCycle, NOT from ContractStagesAll. That
// helper is STATUS-AGNOSTIC: once followUpCount > 0 it returns the 3-stage cycle
// list forever, closed or not. So a contract that has been through a follow-up
// resolves its stage bar against the CYCLE list — and re-opening it at, say,
// تحرير would put currentStage OFF its own resolved path, which is exactly the
// data-shaped version of the progress-bar collapse fixed in 3fcd4e3. Offering
// only what the record will actually resolve to makes that unreachable.
//
// CLOSED is excluded — re-opening INTO the terminal stage is a no-op.
//
// NO ESCAPE-HATCH STAGE. The cases version force-offers منظورة because that
// stage is absent from InCourtSettlementStages yet re-opening into court is the
// entire promise the defendant close makes. Contracts have no analogue: every
// stage a contract can meaningfully resume at is already on its resolved list.
// 🔴 THE CONTRACT COMMITTEE HIDE. Contracts have a SINGLE type-agnostic path
// shared by every department (unlike cases, which have a labor-specific array),
// so the hide cannot be an array edit — it is a per-record FILTER applied to
// whatever list the caller already resolved.
//
// Takes the base list rather than re-deriving it, so the cycle-aware callers
// (getStagesForContractCycle) and the plain ones both filter the SAME way and
// the cycle logic is not duplicated. A cycle list contains no committee stage
// anyway, so filtering it is a harmless no-op.
//
// ⚠ TAKING_NOTES IS REMOVED ALONGSIDE COMMITTEE, exactly as on cases and for the
// same proven reason: its ONLY producer in ALLOWED_CONTRACT_TRANSITIONS is the
// edge COMMITTEE → TAKING_NOTES. With no committee it is unreachable, and
// leaving it in a path list would offer a stage nothing can enter.
//
// Nothing is deleted: both stages remain in ContractStage, in
// ALLOWED_CONTRACT_TRANSITIONS and in every list for departments that DO have a
// committee. Restoring = empty DepartmentsWithoutCommittee.
export function contractStagesForDepartment(
  departmentName: string | null | undefined,
  base: readonly ContractStageValue[],
): ContractStageValue[] {
  if (departmentHasCommittee(departmentName)) return [...base];
  return base.filter(
    (s) => s !== ContractStage.COMMITTEE && s !== ContractStage.TAKING_NOTES,
  );
}

export function getContractReopenTargetStages(
  c: { followUpCount?: number | null } | null | undefined,
): ContractStageValue[] {
  return getStagesForContractCycle(c).filter((s) => s !== ContractStage.CLOSED);
}

// The stage a "تجاوز استكمال المرفقات والبيانات" lands on, or NULL when the
// contract has no data-completion stage to skip. Direct twin of
// consultationSkipDataCompletionTarget — see its comment for the full
// reasoning; only the two entity-specific facts differ:
//
//   1. Contracts have a SINGLE type-agnostic flow, so there is exactly ONE
//      target (تحرير / DRAFTING) and no per-type branching to resolve.
//   2. Contracts DO have a follow-up cycle, and it matters here just as much
//      as it does for consultations: ContractCycleStages is
//      [RECEIVED, READY, CLOSED] — RECEIVED_PENDING_COMPLETION is ABSENT — so
//      a contract inside a follow-up has nothing to skip and returns null.
//      getStagesForContractCycle is status-agnostic, so this holds for a
//      re-closed cycle too.
export function contractSkipDataCompletionTarget(
  c: { followUpCount?: number | null } | null | undefined,
): ContractStageValue | null {
  const stages = getStagesForContractCycle(c);
  const idx = stages.indexOf(ContractStage.RECEIVED_PENDING_COMPLETION);
  if (idx < 0) return null;
  return stages[idx + 1] ?? null;
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
  //
  // ⚠ CURRENTLY null ON EVERY RULE, BY OWNER POLICY — no attachment gates a
  // contract stage transition. The field is retained so a slot can be re-armed
  // as a one-line data change; do not set one without the owner. See the note
  // above ContractSlotsByType.
  requiredBeforeLeavingStage: ContractStageValue | null;
}

// 🔴 NO ATTACHMENT GATES A STAGE TRANSITION ON CONTRACTS. Owner decision — every
// requiredBeforeLeavingStage in this table is null, on every type, permanently.
//
// ⚠ THIS RULE HAS NOT BEEN OVERTURNED — but it is CONTRACTS-SPECIFIC, and there
// is now a deliberate, owner-approved exception ELSEWHERE. Do not read the case
// judgment-deed (صك) gate or the hearing-minutes (ضبط) gate added 2026-08-03 as
// a precedent for re-arming anything here.
//   • A CONTRACT attachment is the FIRM'S OWN WORK PRODUCT. Its absence means
//     "we haven't finished yet", which is what the stage itself already says —
//     so gating on it only builds a wall in front of our own people, and moving
//     the wall one stage later just moved where they hit it (see below).
//   • A JUDGMENT DEED and a HEARING'S MINUTES are documents ISSUED BY THE COURT.
//     Their absence is an externally-caused FACT about the record, not a measure
//     of our progress, and the owner's concern is a case reaching the end of its
//     life with nobody having ever seen its ruling. Different thing, different
//     answer.
// Those gates are enforced in server/routes.ts on the case-stage and hearing-close
// routes, keyed on caseReachedJudgmentStage (above). checkRequiredSlotsForTransition
// and every requiredBeforeLeavingStage in this table are deliberately UNTOUCHED by
// them and stay a permanent no-op by data.
//
// The rules used to be:
//   مراجعة_عقد  العقد محل المراجعة  → blocked leaving استلام   (cleared 8f106b2)
//   مراجعة_عقد  دراسة المراجعة      → blocked leaving تحرير     (cleared here)
//   صياغة_عقد   مذكرة تفاهم         → never gated
//   صياغة_عقد   العقد المُصاغ        → blocked leaving تحرير     (cleared here)
//   مشروع       (no slots at all)
//
// 8f106b2 cleared only the first and reasoned that a create-time gate plus a
// transition gate is not "optional" but "deferred mandatory". That reasoning was
// right and INCOMPLETE: the remaining two both fired on the SAME EDGE —
// تحرير → مراجعة داخلية, the very next transition — so the wall simply moved one
// stage later and the owner hit it there. Clearing them piecemeal reproduces the
// problem each time; the policy is what changed, so all of them go.
//
// ⚠ WHAT STAYS, deliberately — this removes ENFORCEMENT, not information:
//   • every slot is still declared here, so the المرفقات tab still renders its
//     per-type slot cards in order;
//   • the per-slot "لم يتم رفع الملف بعد" and "هذا المرفق مفقود" indicators still
//     show, so a missing file is still visible at a glance;
//   • upload / replace / delete semantics and permissions are untouched.
// The team is told what is missing; they are no longer stopped by it.
//
// The requiredBeforeLeavingStage FIELD and checkRequiredSlotsForTransition are
// kept rather than deleted: the mechanism is sound and data-driven, so re-arming
// one slot is a one-line change here if the owner ever wants it back. With every
// rule null the validator is a permanent no-op — it filters on
// `r.requiredBeforeLeavingStage === fromStage`, and fromStage is always a
// non-null stage string, so nothing can ever match.
export const ContractSlotsByType: Record<ContractTypeValue, ContractSlotRule[]> = {
  "مراجعة_عقد": [
    {
      slotKey: ContractAttachmentSlot.CONTRACT_UNDER_REVIEW,
      label: ContractAttachmentSlotLabels.contract_under_review,
      requiredBeforeLeavingStage: null,
    },
    {
      slotKey: ContractAttachmentSlot.REVIEW_STUDY,
      label: ContractAttachmentSlotLabels.review_study,
      requiredBeforeLeavingStage: null,
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
      requiredBeforeLeavingStage: null,
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
  // Reasoned override — the contract was moved from لجنة_مراجعة straight to
  // جاهزة_للإرسال WITHOUT a committee decision (entity 4 of 4). Mirrors
  // ConsultationActivityType.COMMITTEE_SKIPPED + MemoActivityType.COMMITTEE_SKIPPED.
  // Contracts have a single stage flow (no phone/procedural analogue) → no type
  // guard. Type-only: activity_type is free text → no migration.
  COMMITTEE_SKIPPED:        "committee_skipped",
  // Reasoned override — "تجاوز المراجعة الداخلية". CONTRACTS ONLY (owner scope);
  // the other three entities have no such action. Distinct from
  // COMMITTEE_SKIPPED because it bypasses a DIFFERENT stage answering to a
  // DIFFERENT authority — see the route comment for why its actor set is
  // narrower. Type-only; activity_type is free text, so no migration.
  INTERNAL_REVIEW_SKIPPED:  "internal_review_skipped",
  EARLY_CLOSED:             "early_closed",
  // Closed because the client never completed the file — see the consultations
  // twin. Type-only; activity_type is free text, so no migration.
  CLOSED_NO_RESPONSE:       "closed_no_response",
  // See the consultations twin — resume the original work, as opposed to
  // FOLLOW_UP_STARTED which begins a new 3-stage cycle.
  REOPENED:                 "reopened",
  GENERAL_NOTE:             "general_note",
  PAUSED:                   "paused",
  UNPAUSED:                 "unpaused",
  AWAIT_COMPLETION:         "await_completion",
  RESUME_FROM_COMPLETION:   "resume_from_completion",
  COMPLETION_SKIPPED:       "completion_skipped",
  TYPE_CHANGED:             "contract_type_changed",
  DEPARTMENT_TRANSFERRED:   "department_transferred",
  // Record-level correction via "تعديل البيانات" (title / client / description).
  // Distinct from TYPE_CHANGED and DEPARTMENT_TRANSFERRED, which are workflow
  // events. Type-only — activity_type is free text, so no migration.
  DETAILS_EDITED:           "details_edited",
  ATTACHMENT_ADDED:         "attachment_added",
  ATTACHMENT_REPLACED:      "attachment_replaced",
  ATTACHMENT_DELETED:       "attachment_deleted",
  // Inline-edit activities for the committee referral card. Without
  // these, changes to the persistent reviewer / priority / reason
  // via PATCH would be silent — the audit log would skip the very
  // edits that drive the committee form.
  REVIEWER_ASSIGNED:        "reviewer_assigned",
  PRIORITY_SET:             "priority_set",
  SENT:                     "contract_sent",
  // A closed contract was re-opened for a client follow-up question
  // ("استشارة تعقيبية"). Same token as ConsultationActivityType.FOLLOW_UP_STARTED
  // — the two logs are separate tables, so reusing the value keeps the two
  // mechanisms readable side by side. Type-only: activity_type is free text
  // → no migration for THIS constant (the two contract COLUMNS do need one).
  FOLLOW_UP_STARTED:        "follow_up_started",
} as const;

export type ContractActivityTypeValue =
  typeof ContractActivityType[keyof typeof ContractActivityType];

export const ContractActivityTypeLabels: Record<ContractActivityTypeValue, string> = {
  closed_no_response:      "إغلاق لعدم استكمال البيانات",
  internal_review_skipped: "تجاوز المراجعة الداخلية",
  reopened:                "إعادة فتح",
  created:                "إنشاء",
  assigned:               "إسناد",
  stage_advanced:         "تقدم في المرحلة",
  stage_returned:         "إرجاع للمرحلة السابقة",
  internal_review:        "مراجعة داخلية",
  committee_decision:     "قرار اللجنة",
  take_notes_outcome:     "نتيجة الأخذ بالملاحظات",
  returned_to_committee:  "إعادة للجنة المراجعة",
  committee_skipped:      "تجاوز لجنة المراجعة",
  early_closed:           "إغلاق مبكر",
  general_note:           "ملاحظة عامة",
  paused:                 "تعليق",
  unpaused:               "إلغاء التعليق",
  await_completion:       "بانتظار استكمال المرفقات والبيانات",
  resume_from_completion: "العودة من الاستكمال",
  completion_skipped:     "تجاوز مرحلة الاستكمال",
  contract_type_changed:  "تغيير نوع العقد",
  details_edited:         "تعديل البيانات",
  department_transferred: "تحويل القسم",
  attachment_added:       "إضافة مرفق",
  attachment_replaced:    "استبدال مرفق",
  attachment_deleted:     "حذف مرفق",
  reviewer_assigned:      "تعيين مراجع داخلي",
  priority_set:           "تحديث الأولوية",
  contract_sent:          "إرسال العقد",
  follow_up_started:      "بدء استشارة تعقيبية",
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
  // "YYYY-MM-DD" or null (open-ended pause). See the column comment.
  pauseUntil: string | null;
  dataCompletionLastAckAt: string | null;
  // Follow-up cycle counters — mirror Consultation.followUpCount /
  // followUpStartedAt. followUpCount is NOT NULL default 0 in the column, so
  // it is a plain number here (never null), same as the consultation side.
  followUpCount: number;
  followUpStartedAt: string | null;
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

// The judgment deed (صك) on a case. Mirrors ContractAttachment minus the two
// contract-only fields: no slotKey (there is exactly ONE deed per case, so
// there is nothing to key a slot on) and no description (not in scope — the
// deed's metadata lives on the case: judgmentDeedReceivedDate +
// objectionWindowDays). `missing` follows the ContractAttachment convention
// exactly: runtime-derived on the GET response, never stored.
export interface CaseAttachment {
  id: string;
  caseId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  missing?: boolean;
}

// The minutes (ضبط الجلسة) on a hearing. Same shape as CaseAttachment, keyed
// on the hearing. NOT related to hearings.hearing_minutes — that is an unused
// TEXT column declared by an agent batch in Feb 2026 and never wired to
// anything; it would hold pasted transcript text, not a file. Left untouched.
export interface HearingAttachment {
  id: string;
  hearingId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  missing?: boolean;
}

// ==================== درجة الحكم ====================
// The DEGREE of a ruling — which court issued it. 🔴 NOT its finality: the
// opposite of ابتدائي is استئنافي, while نهائي ("can this still be objected to")
// is a SEPARATE property, carried by isFinal. Conflating the two is the exact
// false opposition the 2026-07-27 model correction removed from the judgment
// dialog; do not reintroduce a "نهائي" member here.
export const JudgmentDegree = {
  FIRST_INSTANCE: "ابتدائي",
  APPEAL:         "استئنافي",
} as const;

export type JudgmentDegreeValue = typeof JudgmentDegree[keyof typeof JudgmentDegree];

// One ruling on a case. See the caseJudgments table for the full model note.
// Timestamps are ISO strings here and Date in the column, per the app-wide
// convention — the conversion lives in the storage mapper.
export interface CaseJudgment {
  id: string;
  caseId: string;
  hearingId: string | null;
  sequence: number;
  degree: string;
  outcome: string | null;
  isFinal: boolean;
  opensWindow: boolean;
  deedReceivedDate: string | null;
  objectionWindowDays: number | null;
  objectionDeadline: string | null;
  supersededAt: string | null;
  supersededByJudgmentId: string | null;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// The صك on a ruling. Same shape as CaseAttachment, keyed on the judgment.
// `missing` follows the ContractAttachment convention: runtime-derived on a GET
// response, never stored. No response uses it yet — batch 1 is inert.
export interface JudgmentAttachment {
  id: string;
  judgmentId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
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
  // Reasoned override — the memo was moved from لجنة_مراجعة straight to
  // جاهزة_للرفع WITHOUT a committee decision. Mirrors the cases-side
  // case_activity_log actionType "committee_skipped". Type-only addition:
  // activity_type is a free-text column, so no migration.
  COMMITTEE_SKIPPED:      "committee_skipped",
  PAUSED:                 "paused",
  UNPAUSED:               "unpaused",
  AWAIT_COMPLETION:       "await_completion",
  RESUME_FROM_COMPLETION: "resume_from_completion",
  CANCELLED:              "cancelled",
  // Cancelled because the client never completed the file. Memos have NO
  // closure model at all — no closure_reason column, no "closed" status — so
  // the memo-equivalent of the cases/consultations/contracts CLOSE is a
  // CANCEL (status ملغاة + cancellation_reason). Distinct from CANCELLED so a
  // non-responsive client is distinguishable from an ordinary "لا يحتاج مذكرة".
  // Type-only — activity_type is free text, so no migration.
  CANCELLED_NO_RESPONSE:  "cancelled_no_response",
} as const;

export type MemoActivityTypeValue =
  typeof MemoActivityType[keyof typeof MemoActivityType];

export const MemoActivityTypeLabels: Record<MemoActivityTypeValue, string> = {
  cancelled_no_response:  "إلغاء لعدم استكمال البيانات",
  created:                "إنشاء",
  assigned:               "إسناد",
  stage_advanced:         "تقدم في المرحلة",
  stage_returned:         "إرجاع للمرحلة السابقة",
  internal_review:        "مراجعة داخلية",
  committee_decision:     "قرار اللجنة",
  take_notes_outcome:     "نتيجة الأخذ بالملاحظات",
  returned_to_committee:  "إعادة للجنة المراجعة",
  committee_skipped:      "تجاوز لجنة المراجعة",
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
  sessionReportExported: boolean;
  agencyVerificationAckAt: string | null;
  agencyVerificationAnswer: string | null;
  adminTasksCreated: boolean;
  opponentMemos: string;
  hearingMinutes: string;
  // "جلسة مُعلَّمة" — team-wide attention flag. flagReason is REQUIRED whenever
  // isFlagged is true (enforced server-side); unflagging clears all three.
  isFlagged: boolean;
  flagReason: string | null;
  flaggedBy: string | null;
  flaggedAt: string | null;
  // سبب الإلغاء — required whenever a hearing is cancelled (enforced server-side).
  cancellationReason: string | null;
  // تحضير الجلسة — ISO instant of the check-in and the user who made it. Both
  // null until someone prepares the session. "Late" is DERIVED from checkedInAt
  // (see isHearingCheckInLate), never stored.
  checkedInAt: string | null;
  checkedInBy: string | null;
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
  contractId: string | null;
  clientId: string | null;
  reviewNote: string;
  originalRequesterId: string | null;
  routedDepartmentId: string | null;
  workerId: string | null;
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

// One general-task thread event (read shape). eventType is a plain string for
// read-extensibility (mirrors MemoActivity.activityType) — future event types
// never break this. actorName is denormalized for display.
export interface GeneralTaskEvent {
  id: string;
  fieldTaskId: string;
  actorId: string | null;
  actorName: string | null;
  eventType: string;
  body: string | null;
  createdAt: string;
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
  // "YYYY-MM-DD" or null (open-ended pause). See the column comment.
  pauseUntil: string | null;
  dataCompletionLastAckAt: string | null;
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
    "labor_review_head",
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
    "labor_review_head",
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
  taskSpecialties: z.array(z.enum(["ترافع", "استشارات"])).nullable().optional(),
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
  // 🔴 WAS MISSING, and z.object STRIPS what it does not declare. The create
  // dialog has rendered a "مطلوب تظلم" checkbox for the إداري department all
  // along, but the key never survived this parse — so even once the page sends
  // it and storage.createCase writes it, omitting the declaration here would
  // have discarded it silently one layer earlier. Declared in the shape of its
  // peer memoRequired directly above (boolean column, boolean create-form
  // checkbox) and identically to the grievanceRequired line updateCaseSchema
  // already carries, so create and edit now validate the field the same way.
  //
  // NOT a schema/table change: grievance_required has existed on law_cases
  // since the admin path was built (boolean, default false). This declares an
  // EXISTING column to an EXISTING validator. No migration.
  grievanceRequired: z.boolean().optional().default(false),
});

export type InsertCase = z.infer<typeof insertCaseSchema>;

export const insertConsultationSchema = z.object({
  clientId: z.string().min(1, "العميل مطلوب"),
  // عنوان الاستشارة — OPTIONAL (the column is nullable; pre-existing rows have
  // none). Must be declared: this schema is a strict z.object (no
  // .passthrough()), so an undeclared key would be silently STRIPPED and the
  // title would never reach the insert.
  title: z.string().optional(),
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
  // Optional + default to match the category/deliveryType convention so
  // older / mobile clients that omit it still validate.
  source: z.enum(["عبر_المجموعة", "على_الخاص"]).optional().default("عبر_المجموعة"),
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
  // Legacy judgment field (kept for compatibility). WIDENED to three values:
  // the request key is behaviourally irrelevant (both server reads coalesce
  // `judgmentType || judgmentSide`), and the hearings.judgment_side COLUMN this
  // ends up in has stored "جزئي" since partial judgments became recordable —
  // so the 2-value enum was a contract this schema itself violated on write.
  // Now the declared contract matches what the column actually holds, and the
  // stats that read the column count all three (see routes.ts / scheduler.ts).
  judgmentSide: z.enum(["لصالحنا", "ضدنا", "جزئي"]).nullable().optional(),
  objectionFeasible: z.boolean().nullable().optional(),
  objectionDeadline: z.string().nullable().optional(),
  // إعادة للدرجة الأولى — does the APPEAL ruling send the case back to first
  // instance? Asked only for an appeal ruling (the case is at منظورة_استئناف);
  // meaningless and ignored for a first-instance one.
  //
  // 🔴 A BOOLEAN, NEVER A STAGE. The resulting stage is computed SERVER-SIDE from
  // this answer via appealRulingTargetStage. A stage taken from a request body is
  // exactly how case 4870079661 was stranded off its own path, and this field is
  // shaped so that mistake is not available: the client says WHETHER the court
  // remanded, never WHERE the case should land.
  remandToFirstInstance: z.boolean().nullable().optional(),
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

// PATCH /api/hearings/:id/result-details — phase 2, SAFE-FIELD result correction.
// The ONLY two hearing fields a recorded result exposes that drive NO cascade:
//   • resultDetails   — free text, read by nobody but the display
//   • objectionDeadline — judgment only, and historical record ONLY: the objection
//     clock now runs from the صك RECEIPT date (routes.ts documents this column is
//     "no longer authoritative for anything")
// Deliberately NOT .passthrough(): every other field on a recorded hearing drives a
// side-effect cascade, and the handler REJECTS them by name rather than letting zod
// silently strip them — a silent strip would look like a successful edit that did
// nothing. The rejected list lives in the handler so the 400 can name the field.
export const hearingResultDetailsSchema = z.object({
  resultDetails: z.string().optional(),
  objectionDeadline: z.string().nullable().optional(),
});

export const insertFieldTaskSchema = z.object({
  title: z.string().min(1, "عنوان المهمة مطلوب"),
  description: z.string().optional().default(""),
  taskType: z.enum(["مراجعة_ميدانية", "تسليم_مستندات", "زيارة_عميل", "متابعة_محكمة", "أخرى", "عام"]),
  caseId: z.string().nullable().optional(),
  consultationId: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
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
  return ["branch_manager", "cases_review_head", "labor_review_head"].includes(role);
}

export function canReviewConsultations(role: UserRoleType): boolean {
  return ["branch_manager", "consultations_review_head", "labor_review_head"].includes(role);
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
  return ["branch_manager", "admin_support"].includes(role);
}

export function canSendNotifications(role: UserRoleType): boolean {
  return ["branch_manager", "department_head", "cases_review_head", "consultations_review_head", "labor_review_head"].includes(role);
}

export function canMoveToPreviousStage(role: UserRoleType): boolean {
  return role === "branch_manager";
}

export function canSendReminders(role: UserRoleType): boolean {
  return ["branch_manager", "admin_support", "department_head", "cases_review_head", "consultations_review_head", "labor_review_head"].includes(role);
}

export function canViewAllMemos(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head", "admin_support"].includes(role);
}

export function canCreateMemos(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head", "department_head", "admin_support"].includes(role);
}

export function canReviewMemos(role: UserRoleType): boolean {
  return ["branch_manager", "cases_review_head", "labor_review_head"].includes(role);
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
  // Sibling of the two above, added when the "new record in your department"
  // notice moved server-side: contracts had no notification at all, and reusing
  // GENERAL_ALERT would have made them unfilterable alongside their twins.
  CONTRACT_ASSIGNED: "contract_assigned",
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
  DELEGATION_REJECTED: "delegation_rejected",
  DELEGATION_EXPIRED: "delegation_expired",

  // متابعة التواصل
  CONTACT_FOLLOWUP_OVERDUE: "contact_followup_overdue",

  // تنبيه جلسة متأخرة
  HEARING_UPDATE_OVERDUE: "hearing_update_overdue",
  HEARING_REMINDER: "hearing_reminder",

  // ⏸️ سجل معلّق منذ مدة — the ONE-TIME notice sent when a record crosses
  // PausedTaskMinDays still paused.
  //
  // 🔴 A DEDICATED TYPE IS WHAT MAKES "ONCE" ENFORCEABLE, and that is the only
  // reason it is not general_alert like its scheduler siblings. The fire-once
  // check asks the notifications table whether this notice already exists; with
  // a shared type it would have to match on the TITLE, and every other
  // general_alert about the same record (the auto-lift notice, hearing alerts)
  // would collide with it. Type + related_id + created_at makes the check
  // purely structural. See checkLongPauses in server/scheduler.ts.
  PAUSE_AGING: "pause_aging",
} as const;

export type NotificationTypeValue = typeof NotificationType[keyof typeof NotificationType];

export const NotificationTypeLabels: Record<NotificationTypeValue, string> = {
  stage_changed: "تغيرت المرحلة",
  case_assigned: "تم تعيين قضية",
  consultation_assigned: "تم تعيين استشارة",
  contract_assigned: "تم تعيين عقد",
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
  delegation_rejected: "تم رفض التفويض",
  delegation_expired: "انتهاء التفويض",
  contact_followup_overdue: "متابعة تواصل متأخرة",
  hearing_update_overdue: "جلسة متأخرة التحديث",
  hearing_reminder: "تذكير بجلسة",
  pause_aging: "سجل معلّق منذ مدة",
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
  // "text_reply" is the sentinel written when the user sends a free-text reply
  // without picking a structured status (respond-dialog.tsx). Kept off the
  // ResponseType const so ResponseTypeLabels stays exhaustive over the 4 real statuses.
  type: ResponseTypeValue | "text_reply";
  message: string;
  respondedAt: string;
  responderId?: string;     // written by respondToNotification (notifications-context.tsx)
  responderName?: string;
}

// "Which matter is this about?" for a notification that carries a relatedType +
// relatedId. DISPLAY-ONLY and SERVER-ENRICHED — never persisted, never sent by
// a client, and absent whenever the link is missing or the linked row has been
// deleted, so a consumer renders it only when it exists.
//
// The data is LIVE, not a snapshot: a three-month-old notification shows the
// entity's stage TODAY, not the stage it was at when the notification was
// written. That is intended — the reader wants to know where the matter stands
// now, not to archaeologise.
export interface NotificationLinkedContext {
  /** Headline identifier where the entity has one of its own: the consultation
   *  TITLE, or the resolved entity name for a field task. Cases/hearings/memos
   *  lead with the client instead, so they leave this unset. */
  primary?: string;
  clientName?: string;
  /** Absent for consultations — they have no opponent column. */
  opponentName?: string;
  /** Current stage of the case / consultation / memo, already localised. */
  stageLabel?: string;
  /** Hearings only. */
  hearingDate?: string;
  courtName?: string;
}

export interface Notification {
  id: string;
  type: NotificationTypeValue;
  priority: NotificationPriorityValue;
  status: NotificationStatusValue;
  title: string;
  message: string;
  // NOT NULL columns (sender_id / sender_name). createNotification coalesces
  // any missing value to "" (storage.ts), and the read mapping passes the
  // column through, so on read these are always a (possibly empty) string —
  // never null. Aligned to reality from the prior `string | null` drift.
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientIds?: string[];
  // "contract" added in batch 4 so contract reminders can carry a typed link
  // like every sibling. Until then contracts were the ONLY notifiable entity
  // with no member here, which is why the pause notice and the create notice
  // both send relatedType:null with a bare relatedId. Those two producers still
  // do — they are correct as written and were deliberately left alone; setting
  // their relatedType is a follow-up, not part of this change.
  relatedType: "case" | "consultation" | "contract" | "task" | "field_task" | "hearing" | "memo" | null;
  relatedId: string | null;
  /** Optional = additive. Stamped only on the PAGED list read; absent on every
   *  other path, so nothing that does not ask for it is affected. */
  linkedContext?: NotificationLinkedContext;
  isRead: boolean;
  // TODO(Phase 6 dead-code): vestigial — no DB column backs this; the only
  // reader (getWorkflowNotifications) is exposed but never called. Optional
  // here so the client's existing references type-check. Remove or restore
  // (add is_automatic column + storage mapping) during the dead-code sweep.
  isAutomatic?: boolean;
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

// ==================== 2D' V1 — tolerant request-body schemas ====================
// Validation-hardening pass over the Tier-1 unvalidated routes. Two usage
// patterns in routes.ts:
//   Pattern B (parse-and-use): simple handlers destructure the parsed result.
//   Pattern A (safeParse gate): complex handlers validate then keep using
//     req.body untouched, so unknown/extra fields flow through unchanged.
// All schemas are TOLERANT: .passthrough() (extras allowed, never .strict()),
// every field optional unless the handler already requires it, string types
// kept wide (no enum narrowing) so legacy values and FE spreads keep working.

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string().min(1, "كلمة المرور الجديدة مطلوبة"),
}).passthrough();

// Route checks the emergency secret BEFORE this schema runs (security
// ordering); the schema only covers the remaining field.
export const emergencyResetSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
}).passthrough();

export const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(1, "كلمة المرور الجديدة مطلوبة"),
}).passthrough();

// DELETE /api/users/:id body. Keys are `case_/consultation_/department_/
// fieldTask_${id}`, values are a user id or "" (= leave unassigned).
export const deleteUserSchema = z.object({
  reassignments: z.record(z.string()).optional().default({}),
}).passthrough();

export const insertNotificationSchema = z.object({
  type: z.string().min(1, "نوع الإشعار مطلوب"),
  title: z.string().min(1, "عنوان الإشعار مطلوب"),
  message: z.string().min(1, "نص الإشعار مطلوب"),
  recipientId: z.string().min(1, "المستلم مطلوب"),
  priority: z.string().optional(),
  status: z.string().optional(),
  senderId: z.string().nullable().optional(),
  senderName: z.string().nullable().optional(),
  relatedType: z.string().nullable().optional(),
  relatedId: z.string().nullable().optional(),
  isRead: z.boolean().optional(),
  readAt: z.string().nullable().optional(),
  response: z.object({}).passthrough().nullable().optional(),
  requiresResponse: z.boolean().optional(),
  scheduledAt: z.string().nullable().optional(),
  escalationLevel: z.number().optional(),
  escalatedTo: z.string().nullable().optional(),
}).passthrough();

// Phase 5 A1/H2 — tightened to the owner-mutable allowlist. title/message/
// priority (never sent on PATCH by any FE caller) and the identity/routing
// danger set are intentionally absent; the route also hard-allowlists these
// same fields before writing, so unknown body keys never reach storage.
export const updateNotificationSchema = z.object({
  isRead: z.boolean().optional(),
  readAt: z.string().nullable().optional(),
  status: z.string().optional(),
  response: z.object({}).passthrough().nullable().optional(),
  escalationLevel: z.number().optional(),
  escalatedTo: z.string().nullable().optional(),
});

// POST /api/delegations body — fromUserId is injected from req.user by the
// route, so the request schema omits it.
export const insertDelegationBodySchema = insertDelegationSchema
  .omit({ fromUserId: true })
  .passthrough();

export const updateDelegationSchema = z.object({
  toUserId: z.string().min(1).optional(),
  reason: z.string().optional(),
  reasonDetails: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
  scope: z.string().optional(),
  specificCaseIds: z.array(z.string()).nullable().optional(),
}).passthrough();

export const convertConsultationToCaseSchema = z.object({
  targetCaseStage: z.string().min(1, "targetCaseStage مطلوب"),
  caseDepartmentId: z.string().min(1, "caseDepartmentId مطلوب"),
}).passthrough();

// ---- 2D' V2 — shared workflow body-shape schemas (approved decision c) ----
// The ~45 per-resource workflow handlers reduce to 5 request-body shapes.
// Sharing the SCHEMA is not the declined 2E handler dedup: handlers stay
// per-resource; only the trivially identical body shape is shared. All
// fields optional — each handler enforces its own requiredness with its
// existing Arabic 400s (zero behavior change); these gates reject type
// garbage only.

export const workflowTargetStageSchema = z.object({
  targetStage: z.string().optional(),
}).passthrough();

export const workflowDecisionSchema = z.object({
  decision: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export const workflowOutcomeSchema = z.object({
  outcome: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export const workflowReasonSchema = z.object({
  reason: z.string().optional(),
  otherText: z.string().optional(),
}).passthrough();

export const workflowNotesSchema = z.object({
  notes: z.string().optional(),
}).passthrough();

// Pause body for all four entities. Same tolerant shape as its neighbours:
// every field optional, the handlers keep their own requiredness checks (reason
// is still mandatory there) and their own Arabic 400s. pauseUntil is nullable so
// an explicit null clears it, and undefined/absent means "open-ended" — which is
// exactly the pre-feature behaviour, so an old client that sends only { reason }
// keeps working unchanged.
// Body for POST /api/consultations/:id/reopen and /api/contracts/:id/reopen.
// Tolerant like its neighbours; the handlers enforce requiredness. No number
// fields — unlike the CASES reopen, these two carry no platform numbers.
// POST /api/cases/:id/correct-starting-stage. Tolerant gate; the handler
// enforces the boolean and the correction window.
export const correctStartingStageSchema = z.object({
  toSettlement: z.boolean().optional(),
  notes: z.string().optional(),
}).passthrough();

export const reopenEntitySchema = z.object({
  targetStage: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export const workflowPauseSchema = z.object({
  reason: z.string().optional(),
  pauseUntil: z.string().nullable().optional(),
}).passthrough();

// Today as "YYYY-MM-DD". The repo idiom (checkStruckOffExpiry) inlined once so
// the four pause routes and the scheduler compare against the SAME string.
export function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

// Shared "YYYY-MM-DD" validator for the pause auto-lift date. Lives here so the
// four routes and the FE cannot drift on the format or on the past-date rule.
// Returns an Arabic error string, or null when the value is acceptable.
// Absent/empty is ALWAYS acceptable — the date is optional by design.
export function validatePauseUntil(raw: unknown, todayStr: string): string | null {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "صيغة تاريخ انتهاء التعليق غير صحيحة";
  }
  // Reject an impossible calendar date (2026-02-31 passes the regex).
  const parsed = new Date(`${value}T00:00:00Z`);
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return "تاريخ انتهاء التعليق غير صالح";
  }
  // Lexicographic compare is correct for zero-padded ISO dates, and is the same
  // comparison checkStruckOffExpiry uses. Same-day is ALLOWED: the scheduler's
  // `pauseUntil >= todayStr` skip means it lifts tomorrow morning, not instantly.
  if (value < todayStr) {
    return "تاريخ انتهاء التعليق يجب ألا يكون في الماضي";
  }
  return null;
}

// Sub-step 4 — general (عام) task requester-review body. decision is
// "تم_الاطلاع" (close) or "ملاحظة" (send back); reviewNote required only for the
// send-back (enforced in the handler, not here — tolerant gate per 2D').
export const generalTaskReviewSchema = z.object({
  decision: z.string().optional(),
  reviewNote: z.string().optional(),
}).passthrough();

// Sub-step 6 — dept_head distributes a بانتظار_التوزيع dept-routed general task
// to a member (assignedTo = the chosen member or himself). Tolerant gate;
// the handler enforces the real rules (active + routed-dept membership).
export const generalTaskDistributeSchema = z.object({
  assignedTo: z.string().optional(),
}).passthrough();

// Sub-step 8 — dept_head approves (اعتماد) or returns-with-note (ملاحظة) a
// member's result on a بانتظار_الاعتماد dept-routed general task. Tolerant gate;
// the handler enforces the decision values + required note.
export const generalTaskApproveSchema = z.object({
  decision: z.string().optional(),
  reviewNote: z.string().optional(),
}).passthrough();

// ---- 2D' V2a — cases/consultations non-workflow Tier-2 bodies ----

export const updateCaseTaradiSchema = z.object({
  status: z.string().optional(),
  taradiNumber: z.string().optional(),
}).passthrough();

export const updateCaseMohrSchema = z.object({
  status: z.string().optional(),
  mohrNumber: z.string().optional(),
}).passthrough();

// assignedTo mirrors Consultation.assignedTo: string | null.
export const assignConsultationSchema = z.object({
  assignedTo: z.string().nullable().optional(),
  // The assign dialog's القسم control now TRANSFERS the consultation instead of
  // merely filtering the lawyer list. Optional and tolerant: a body without it
  // assigns exactly as before.
  departmentId: z.string().optional(),
}).passthrough();

export const startConsultationFollowUpSchema = z.object({
  question: z.string().optional(),
}).passthrough();

// POST /api/contracts/:id/start-follow-up. Byte-for-byte the same tolerant
// Pattern-A gate as the consultation schema above — type check only; the
// handler keeps its own Arabic 400 for the empty-question case.
export const startContractFollowUpSchema = z.object({
  question: z.string().optional(),
}).passthrough();

// POST /api/cases/:id/reopen. Tolerant gate (Pattern A): type check only — the
// handler keeps its own Arabic 400s for "targetStage missing / not on the path"
// and "required number missing", so behaviour is decided there, not here.
// targetStage is NOT enum-narrowed (2D' rule: stage values stay z.string();
// membership is validated against the case's own resolved path in the handler).
// The five number fields mirror their columns — all varchar, all nullable.
// Judgment-lifecycle step 2. The default objection window in days when the case
// carries no explicit objectionWindowDays. 10 is the القضاء المستعجل value the
// user picks in the dialog; nothing else is enumerated because the field is a
// free integer by design.
export const DefaultObjectionWindowDays = 30;

// POST /api/cases/:id/judgment-deed — recording (or correcting) the صك receipt.
// Tolerant gate (Pattern A): type check only; the handler keeps its own Arabic
// 400s for the missing/invalid date and the out-of-range window.
// ==================== JUDGMENT DIRECTION (shared server + client) ====================
// The primary judgment a case is currently sitting on: its most recent hearing
// whose result is حكم and which is NOT final. Lives here — not in routes.ts —
// because BOTH sides need the identical rule: the server enforces the
// appeal-outcome branch on it, the cases UI renders the branch from it. A second
// copy would drift and let the UI offer a button the server rejects.
//
// Generic over the row shape so the server can pass DB rows and the client can
// pass its Hearing interface without either importing the other's type.
// ==================== CALENDAR DAY (firm timezone) ====================
//
// 🔴 THE BUG THIS REPLACES. Date columns that hold a bare "YYYY-MM-DD" (hearings
// .hearing_date, struck_off_date, …) were being compared like this:
//     const hd = new Date(value); hd.setHours(0, 0, 0, 0);
// new Date("2026-07-28") parses as UTC MIDNIGHT, and setHours then reinterprets
// that instant in SERVER-LOCAL time — so the two steps use different calendars.
// On a UTC server (Replit's default) with users in Riyadh (UTC+3), between 00:00
// and 03:00 Riyadh the server's local day is still YESTERDAY. Any "is this today"
// or "is this in the future" test was therefore wrong by one day for three hours
// every night.
//
// THE FIX: never parse the stored string. HijriDatePicker writes it from LOCAL
// Gregorian parts (`${getFullYear()}-${mm}-${dd}` — Hijri is display-only), so the
// stored value IS a calendar day, and the only correct comparison is against
// today's calendar day in the SAME calendar. en-CA formats as ISO YYYY-MM-DD, and
// timeZone pins it to the firm's day rather than the host's. Plain string
// comparison then works for both equality and ordering (YYYY-MM-DD sorts
// lexicographically), and no timezone can shift it.
export const FirmTimeZone = "Asia/Riyadh";

/** Today's calendar day in the firm's timezone, as "YYYY-MM-DD". */
export function firmToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FirmTimeZone }).format(new Date());
}

/** True when a stored "YYYY-MM-DD" is the firm's TODAY. Never parses the value. */
export function isFirmToday(day: string | null | undefined): boolean {
  const d = String(day || "").trim();
  return !!d && d === firmToday();
}

/** True when a stored "YYYY-MM-DD" is strictly AFTER the firm's today. */
export function isFirmFuture(day: string | null | undefined): boolean {
  const d = String(day || "").trim();
  return !!d && d > firmToday();
}

// The offset Asia/Riyadh was running at a given instant, in milliseconds.
// Derived from Intl rather than hard-coded to +03:00 so this stays correct if
// the zone's rules ever change — the same reason firmToday goes through Intl
// instead of adding three hours by hand.
function firmZoneOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FirmTimeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  // hour12:false renders midnight as "24" in some engines — normalise it.
  const wallClockAsUtc = Date.UTC(
    part("year"), part("month") - 1, part("day"),
    part("hour") % 24, part("minute"), part("second"),
  );
  return wallClockAsUtc - utcMs;
}

// 🔴 THE BUG THIS REPLACES — the date+time counterpart of the date-only fix
// above, and the same two-calendar mistake. server/scheduler.ts did:
//     const d = new Date("2026-07-28"); d.setHours(10, 30);
// new Date("YYYY-MM-DD") is UTC MIDNIGHT, and setHours then writes the hours in
// SERVER-LOCAL time. On Replit's UTC host that yields 10:30 UTC = 13:30 Riyadh,
// so every hearing reminder and every 8/24/48h late-hearing escalation fired
// three hours off. hearings.hearing_time is a bare wall-clock "HH:mm" written by
// an <input type="time"> — it means the firm's clock, so it must be resolved in
// the firm's zone, never the host's.
//
// STRICT BY DESIGN: returns null when EITHER part is missing or malformed, so a
// caller has to decide what a data anomaly means rather than silently inheriting
// a default. (The old code was inconsistent about exactly this — an empty time
// became 09:00 while an unparseable time became 00:00.) Accepts "H:mm" and
// "HH:mm"; nothing validates the stored format.
/** A stored "YYYY-MM-DD" + "HH:mm" resolved to the instant it names in the firm's timezone. */
export function firmDateTimeToInstant(
  day: string | null | undefined,
  time: string | null | undefined,
): Date | null {
  const dayMatch = String(day || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dayMatch) return null;
  const timeMatch = String(time || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;

  const [year, month, dayOfMonth] = [Number(dayMatch[1]), Number(dayMatch[2]), Number(dayMatch[3])];
  const [hours, minutes] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) return null;
  if (hours > 23 || minutes > 59) return null;

  // Read the wall-clock as if it were UTC, then subtract the zone's offset at
  // that instant. Re-checked once: on a DST boundary the offset at the guessed
  // instant can differ from the offset at the real one. Riyadh has no DST, so
  // the second pass is a no-op there — it is here so the helper is correct for
  // FirmTimeZone's value, not for today's value of it.
  const wallClockAsUtc = Date.UTC(year, month - 1, dayOfMonth, hours, minutes);
  const firstPass = wallClockAsUtc - firmZoneOffsetMs(wallClockAsUtc);
  const secondPassOffset = firmZoneOffsetMs(firstPass);
  const instant = wallClockAsUtc - secondPassOffset;
  return isNaN(instant) ? null : new Date(instant);
}

// ⏱️ تحضير الجلسة — how close to the session a check-in stops counting as
// on-time. Mirrors the escalation tier at which support staff start being rung
// in the later batches: from this point the session is being chased, so a
// check-in made afterwards is "حضر متأخراً بعد التصعيد".
export const HearingCheckInLateCutoffMinutes = 6;

// 🔔 THE ESCALATION TIERS. Each is the SAME hearing instant with a different
// lead, which is what makes accumulation free: at T-5 all four windows are open
// at once, so all four tiers ring simultaneously with NOTHING tracking which of
// them "already fired". A later tier can never silence an earlier one because
// there is no state for it to silence.
export const HearingRingTier = {
  ATTENDING: "attending",
  DEPARTMENT: "department",
  ADMIN_SUPPORT: "admin_support",
  BRANCH_MANAGER: "branch_manager",
} as const;

export type HearingRingTierValue = typeof HearingRingTier[keyof typeof HearingRingTier];

export const HearingRingTierLeadMinutes: Record<HearingRingTierValue, number> = {
  attending: 10,
  department: 8,
  admin_support: 6,
  branch_manager: 5,
};

// The WIDEST window — the earliest any tier can start. Used to select candidate
// hearings before per-tier leads are applied; it is by definition the maximum of
// the map above.
export const HearingRingLeadMinutes = 10;

/**
 * One ring candidate as the client receives it — the DERIVATION SOURCE.
 *
 * 🔴 THE CLIENT MUST BE ABLE TO ANSWER "should I be ringing, and for which
 * hearing" FROM THIS ALONE, with no memory of any pushed event. That is why the
 * two window edges are sent as resolved ISO INSTANTS rather than left implicit:
 * the client compares them to its own clock, so it needs no server round-trip to
 * start at the right second or to stop at the hearing time.
 */
export interface HearingRingItem {
  hearingId: string;
  caseId: string | null;
  caseNumber: string;
  /** "HH:mm" as stored — for display only, never re-parsed by the client. */
  hearingTime: string;
  courtName: string;
  /**
   * WHY this user is ringing. When a user qualifies for several tiers (the
   * branch manager who is also the attending lawyer, say) the server sends the
   * one with the LONGEST lead — the tier that actually decides when they start
   * ringing, and the most truthful answer to "why am I being alerted".
   */
  tier: HearingRingTierValue;
  /** Window opens — hearing instant minus THIS TIER's lead. */
  ringFromIso: string;
  /** Window closes — the hearing's own instant. */
  hearingAtIso: string;
  /**
   * Carried so the client can evaluate canCheckInHearing without fetching the
   * hearing and its parent case: the modal must render تحضير only to those the
   * server would accept, never a button that 403s.
   */
  attendingLawyerId: string | null;
  caseDepartmentId: string | null;
}

/**
 * Is this ring window open at `nowMs`? The ONE rule, shared by the endpoint that
 * selects candidates, the scheduler that pushes, and the client that rings — so
 * the three can never disagree about when a hearing is "ringing".
 *
 * Half-open [ringFrom, hearingAt): the ring stops of its own accord at the
 * hearing's moment, which is exactly when the batch-2 auto-flag takes over.
 */
/**
 * Which ring tier does this user occupy for this hearing, if any?
 *
 * Returns the tier with the LONGEST lead among those that apply, or null when
 * the user is in none. ONE implementation, shared by the ring-state endpoint
 * (which answers for the requesting user) and the scheduler (which resolves the
 * whole recipient set), so the two can never disagree about who rings.
 *
 * 🔴 viewer AND hr ARE EXCLUDED FROM THE DEPARTMENT TIER (owner-approved).
 * `viewer` is blocked from every mutation by viewerWriteGuard, so it could not
 * even acknowledge the ring it was given — an undismissable modal by
 * construction. `hr` has no role in a court session. Both are pure noise, and
 * they are excluded from the DEPARTMENT tier only: neither can reach the other
 * three, which are keyed on being the attending lawyer or holding a specific
 * role.
 */
export function resolveHearingRingTier(
  user: { id: string; role: string; departmentId?: string | null } | null | undefined,
  hearing: { attendingLawyerId?: string | null; caseDepartmentId?: string | null },
): HearingRingTierValue | null {
  if (!user) return null;
  const tiers: HearingRingTierValue[] = [];
  if (hearing.attendingLawyerId && hearing.attendingLawyerId === user.id) {
    tiers.push(HearingRingTier.ATTENDING);
  }
  // 🔴 !!user.departmentId is mandatory, per the standing rule: without it a
  // user with a null department matches every case with a null department.
  if (
    user.role !== "viewer" && user.role !== "hr"
    && !!user.departmentId
    && !!hearing.caseDepartmentId
    && user.departmentId === hearing.caseDepartmentId
  ) {
    tiers.push(HearingRingTier.DEPARTMENT);
  }
  if (user.role === "admin_support") tiers.push(HearingRingTier.ADMIN_SUPPORT);
  if (user.role === "branch_manager") tiers.push(HearingRingTier.BRANCH_MANAGER);
  if (tiers.length === 0) return null;
  return tiers.reduce((best, t) =>
    HearingRingTierLeadMinutes[t] > HearingRingTierLeadMinutes[best] ? t : best);
}

export function isRingWindowOpen(
  item: { ringFromIso: string; hearingAtIso: string },
  nowMs: number,
): boolean {
  const from = new Date(item.ringFromIso).getTime();
  const until = new Date(item.hearingAtIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(until)) return false;
  return nowMs >= from && nowMs < until;
}

/**
 * Was this check-in LATE? Derived, never stored — see the checkedInAt column.
 *
 * 🔴 USES firmDateTimeToInstant DIRECTLY, and that is deliberate. The scheduler's
 * parseHearingDateTime wrapper substitutes 09:00 for a malformed hearing_time,
 * which is right for a coarse daily reminder and WRONG here: it would silently
 * classify against a session time that does not exist. hearing_time is a bare
 * varchar with no format validation, so malformed values are reachable.
 *
 * Returns FALSE — not late — when the check-in or the hearing time cannot be
 * resolved. The fail direction is chosen: "late" is a mild accusation attached
 * to a named person, so an unparseable time must never manufacture one. The
 * check-in itself is still recorded and displayed; only the late badge is
 * withheld.
 */
export function isHearingCheckInLate(
  hearing: { hearingDate?: string | null; hearingTime?: string | null; checkedInAt?: string | null } | null | undefined,
): boolean {
  const checkedInAt = String(hearing?.checkedInAt || "").trim();
  if (!checkedInAt) return false;
  const checkedInMs = new Date(checkedInAt).getTime();
  if (!Number.isFinite(checkedInMs)) return false;
  const hearingInstant = firmDateTimeToInstant(hearing?.hearingDate, hearing?.hearingTime);
  if (!hearingInstant) return false;
  const cutoffMs = hearingInstant.getTime() - HearingCheckInLateCutoffMinutes * 60 * 1000;
  return checkedInMs > cutoffMs;
}

// 🔴 RE-KEYED IN BATCH 4 TO THE CURRENT JUDGMENT'S HEARING.
//
// THE BUG IT FIXES: the date scan below picks the latest NON-FINAL حكم hearing,
// which silently assumes a case has ONE judgment. After a quash-and-remand it
// returns the hearing of the ruling that was QUASHED — a judgment that no longer
// stands — and every caller then reasons about the wrong ruling.
//
// When the caller knows the case's CURRENT judgment (case_judgments, highest
// sequence) it passes that judgment's hearing_id and gets that exact hearing.
//
// ⚠ hearing_id IS NULLABLE, and the fallback is deliberate rather than an
// oversight. Two shapes reach it:
//   • a judgment recorded WITHOUT a session in our system — POST /appeal-ruling
//     writes hearingId null, which is every affirmation and every quash;
//   • a hearing row that has since been deleted, so the id resolves to nothing.
// Both fall back to the ORIGINAL date scan, which is byte-identical to the
// pre-batch-4 behaviour — so a caller can never end up worse off than it was, and
// a caller that passes nothing at all is completely unaffected.
export function findPrimaryJudgmentHearing<
  T extends {
    id?: string;
    result?: string | null;
    judgmentFinal?: boolean | null;
    hearingDate?: string | null;
  },
>(hearings: T[], currentJudgmentHearingId?: string | null): T | null {
  if (currentJudgmentHearingId) {
    const exact = (hearings || []).find((h) => h && h.id === currentJudgmentHearingId);
    // Returned WITHOUT the result/finality filter: the judgment record already
    // asserts this hearing produced the ruling the case is living under, so
    // re-testing the hearing's own columns could only ever second-guess it.
    if (exact) return exact;
  }
  const candidates = (hearings || [])
    .filter((h) => h && h.result === "حكم" && !h.judgmentFinal)
    .sort((a, b) => String(b.hearingDate || "").localeCompare(String(a.hearingDate || "")));
  return candidates[0] || null;
}

// The case's most recent judgment hearing REGARDLESS of finality — the DISPLAY
// counterpart of findPrimaryJudgmentHearing.
//
// Why a sibling and not a flag on the existing one: the two answer different
// questions and must not drift. findPrimaryJudgmentHearing deliberately filters
// `!judgmentFinal` because every LOGIC path that uses it (the صك receipt, the
// appeal-direction branch) is about a PENDING first-instance ruling, so a final
// judgment must not satisfy it. Showing "which way did the ruling go?" needs the
// opposite: whatever ruling the case is actually sitting on, primary or final.
export function findLatestJudgmentHearing<
  T extends { result?: string | null; hearingDate?: string | null },
>(hearings: T[]): T | null {
  const candidates = (hearings || [])
    .filter((h) => h && h.result === "حكم")
    .sort((a, b) => String(b.hearingDate || "").localeCompare(String(a.hearingDate || "")));
  return candidates[0] || null;
}

// Who would appeal a primary judgment:
//   لصالحنا      → we won at first instance, so the OPPONENT may appeal.
//   ضدنا / جزئي  → we are the appellant; filing the لائحة اعتراضية IS our appeal.
//   null         → no primary-judgment hearing found, direction UNKNOWN.
export function judgmentDirectionOf(
  hearing: { judgmentSide?: string | null } | null | undefined,
): "لصالحنا" | "ضدنا" | "جزئي" | null {
  const side = String(hearing?.judgmentSide || "").trim();
  return side === "لصالحنا" || side === "ضدنا" || side === "جزئي" ? side : null;
}

// True when WE are the party who would appeal — i.e. the "الخصم استأنف" action
// is nonsense and must be neither offered nor accepted.
export function weAreTheAppellant(direction: string | null): boolean {
  return direction === "ضدنا" || direction === "جزئي";
}

// ==================== CASE OUTCOME (النتيجة) ====================
//
// WHAT THE CASE ACTUALLY ENDED IN — deliberately DISTINCT from closureReason,
// which only says how it was closed administratively. "تم التحصيل" tells you the
// money came in; it does not tell you whether that followed a judgment in our
// favour or a settlement. This resolver answers the second question.
//
// Everything is DERIVED from data that already exists — no new column. The
// signals, in the priority order they are evaluated:
//   JUDGMENT            a judgment hearing exists (result === "حكم") with a
//                       readable judgmentSide. Reuses findLatestJudgmentHearing +
//                       judgmentDirectionOf — the same pair the stage badge uses,
//                       never a second implementation.
//   SETTLEMENT_SUCCESS  the case reached تحصيل having passed through مداولة_الصلح,
//                       OR taradiStatus === تم_الصلح. Reaching تحصيل AFTER a
//                       judgment cannot land here — JUDGMENT is evaluated first.
//   SETTLEMENT_FAILED   closureReason === لم_يتم_الصلح, or a CLOSED case whose
//                       history passed through أغلق_طلب_الصلح. The closed check is
//                       load-bearing: a case that failed settlement and went on to
//                       litigate is still running, and failure was a step, not its
//                       ending.
//   STRUCK_OFF          currentStage === مشطوبة, or closureReason ===
//                       شطب_بدون_إعادة_قيد.
//   ADMINISTRATIVE      closed on تنازل_العميل / عدم_تجديد_العقد / سداد_الخصم —
//                       no substantive result; the closure reason IS the outcome.
//   NONE                nothing recorded. Reported plainly, never invented.
//
// mohrStatus is deliberately NOT a signal: it is display-only (3 read sites, all
// mapping), it can drift out of step with currentStage, and انتهت_التسوية does not
// say whether the settlement SUCCEEDED or collapsed.
export const CaseOutcomeKind = {
  JUDGMENT: "judgment",
  SETTLEMENT_SUCCESS: "settlement_success",
  SETTLEMENT_FAILED: "settlement_failed",
  STRUCK_OFF: "struck_off",
  ADMINISTRATIVE: "administrative",
  NONE: "none",
} as const;
export type CaseOutcomeKindValue = typeof CaseOutcomeKind[keyof typeof CaseOutcomeKind];

export type CaseOutcomeTone = "success" | "warning" | "danger" | "neutral";

export interface CaseOutcome {
  kind: CaseOutcomeKindValue;
  /** SHORT badge label — the RESULT only, no degree, no finality, no parentheses.
      null when there is no substantive outcome and the CLOSURE REASON should be
      shown instead (see caseClosureBadgeSuffix). */
  label: string | null;
  tone: CaseOutcomeTone;
}

type OutcomeCaseInput = {
  currentStage?: string | null;
  stageHistory?: Array<{ stage?: string | null } | null> | null;
  closureReason?: string | null;
  closureReasonOther?: string | null;
  taradiStatus?: string | null;
};
type OutcomeHearingInput = {
  result?: string | null;
  judgmentSide?: string | null;
  judgmentFinal?: boolean | null;
  hearingDate?: string | null;
};

function stageWasReached(c: OutcomeCaseInput, stage: string): boolean {
  if (c.currentStage === stage) return true;
  return Array.isArray(c.stageHistory)
    && c.stageHistory.some((entry) => entry?.stage === stage);
}

// ==================== THE صك (JUDGMENT DEED) SCOPE TEST ====================
// "This case reached A JUDGMENT STAGE" — the single scope test for every
// judgment-deed gate (a case with a judgment may not advance past it, nor close,
// until the court's صك is on file). Hoisted here so the client and the server
// share ONE rule and the UI can never offer an action the endpoint rejects.
//
// 🔴 WIDENED 2026-08-04 FROM FIRST-INSTANCE ONLY, AND RENAMED because the old name
// (caseReachedJudgmentStage) became a lie the moment it covered three stages.
// It used to test محكوم_حكم_ابتدائي alone, on the reasoning that a صك only exists
// where an objection window does. THE OWNER HAS CORRECTED THAT PREMISE: a صك is
// issued for EVERY ruling, including non-objectionable first-instance rulings and
// appeal rulings. Coupling the deed to the objection window was an incomplete
// model.
// Production proved how badly: 8 of 8 cases at محكوم_حكم_نهائي had NEVER passed
// through محكوم_حكم_ابتدائي, so every single final-judgment case fell outside the
// old test — no badge, no gate, and no way to attach a deed at all.
// The path they take: منظورة + a ruling the lawyer marks NOT objectionable →
// isFinal → straight to محكوم_حكم_نهائي in ONE stage write (routes.ts, the
// judgment branch). محكوم_حكم_ابتدائي is never written and never enters history.
//
// WHY stageHistory AND NOT currentStage: the gates fire at different stages than
// the one the judgment was recorded on — the close gates at محكوم_حكم_نهائي, and
// later still on a case that went to appeal and came back
// (محكوم_حكم_ابتدائي → منظورة_استئناف → محكوم_حكم_نهائي). History is the only term
// that survives those moves.
//
// 🔴 SCOPE GUARANTEE — this CANNOT capture a non-judgment case, and the proof is
// structural rather than a promise: these three stages are written by exactly FOUR
// code paths (moveCaseFromPrimaryJudgment, the isFinal judgment branch, the
// hearing-creation appeal carve-out, and the objection-memo hook) and EVERY ONE of
// them means a ruling exists. No settlement, strike-off, no-client-response or
// archival path can write any of them. So settlement (مداولة_الصلح / تحصيل /
// أغلق_طلب_الصلح), strike-off (مشطوبة) and no-response (استكمال_البيانات) closures
// return false here and are untouched — by construction, not by an exclusion list
// that could drift.
//
// ⚠ ONE KNOWN FALSE NEGATIVE, unchanged by the widening: a case whose
// stage_history was never populated (the pre-2026-07-28 seed never wrote it — the
// same gap that broke deriveCurrentCaseNumber and the terminal progress bar) reads
// false even if it genuinely held a judgment. Data-shaped, not logic-shaped.
//
// Same shape as the deriveCurrentCaseNumber "reachedSettlement" precedent, which
// also asks stageHistory whether a stage was ever visited.
export function caseReachedJudgmentStage(c: {
  currentStage?: string | null;
  stageHistory?: Array<{ stage?: string | null } | null> | null;
}): boolean {
  return stageWasReached(c, CaseStage.PRIMARY_JUDGMENT)
    || stageWasReached(c, CaseStage.APPEAL_PENDING)
    || stageWasReached(c, CaseStage.FINAL_JUDGMENT);
}

// 🔴 BATCH 4 — `currentJudgmentOutcome` NAMES THE LATEST RULING, NOT THE FIRST.
// findLatestJudgmentHearing scans HEARINGS by date, which cannot see a ruling
// recorded without a session (POST /appeal-ruling writes no hearing) and cannot
// tell a standing ruling from a quashed one. On a remanded case it therefore
// reports the outcome of a judgment that no longer stands. When the caller knows
// the case's current judgment it passes that row's `outcome` and this uses it.
// Omitted → the original hearing scan, unchanged, so every caller that does not
// have it behaves exactly as before.
export function resolveCaseOutcome(
  lawCase: OutcomeCaseInput,
  hearings: OutcomeHearingInput[],
  currentJudgmentOutcome?: string | null,
): CaseOutcome {
  const stage = String(lawCase.currentStage || "");
  const reason = String(lawCase.closureReason || "").trim();
  const isClosed = stage === "مقفلة";

  // 1. JUDGMENT — the ruling is the result. DEGREE AND FINALITY ARE DELIBERATELY
  // NOT REPORTED: once a case is over, "ابتدائي / استئنافي / نهائي" is procedural
  // detail nobody reading a closed file needs, and spelling it out produced
  // unusable Arabic ("صدر بها حكم ابتدائي (نهائي) لصالحنا"). The direction is the
  // whole answer. The OPEN judgment stage badges still name the stage the case is
  // in — a different question, deliberately untouched.
  // The judgment record wins when it is available. judgmentDirectionOf is still
  // the ONE rule that validates a direction string, so a row carrying an
  // unexpected value (or a quash, whose outcome is deliberately NULL) falls
  // through to the hearing scan rather than printing something unreadable.
  const direction = judgmentDirectionOf({ judgmentSide: currentJudgmentOutcome })
    ?? judgmentDirectionOf(findLatestJudgmentHearing(hearings || []));
  if (direction) {
    return {
      kind: CaseOutcomeKind.JUDGMENT,
      label: `حكم ${direction}`,
      tone: direction === "لصالحنا" ? "success" : direction === "جزئي" ? "warning" : "danger",
    };
  }

  // 2. SETTLEMENT SUCCESS — collection reached through the conciliation track.
  const reachedCollection = stageWasReached(lawCase, "تحصيل");
  const wentThroughConciliation = stageWasReached(lawCase, "مداولة_الصلح");
  if ((reachedCollection && wentThroughConciliation) || lawCase.taradiStatus === "تم_الصلح") {
    return { kind: CaseOutcomeKind.SETTLEMENT_SUCCESS, label: "صلح", tone: "success" };
  }

  // 3. SETTLEMENT FAILED — an ENDING only; mid-case failure is just a step.
  // The SETTLEMENT-LINK TIMEOUT belongs here: the scheduler closes a settlement-only
  // case after 15 days when the client never sent the conciliation-session link, and
  // its closureReason is a free-text SENTENCE, not an enum member. Substantively the
  // settlement never happened, so it reads "تعذّر الصلح" like any other failed
  // settlement — and, just as important, matching it here is what keeps that whole
  // sentence off the badge. The full text stays in the سبب الإغلاق detail block.
  if (reason === ClosureReason.SETTLEMENT_FAILED
    || reason === SettlementLinkMissingClosureReason
    || (isClosed && stageWasReached(lawCase, "أغلق_طلب_الصلح"))) {
    return { kind: CaseOutcomeKind.SETTLEMENT_FAILED, label: "تعذّر الصلح", tone: "warning" };
  }

  // 4. STRUCK OFF — covers the scheduler's post-deadline close, whose
  // closureReason IS the enum member شطب_بدون_إعادة_قيد.
  if (stage === "مشطوبة" || reason === ClosureReason.STRUCK_OFF_EXPIRED) {
    return { kind: CaseOutcomeKind.STRUCK_OFF, label: "شطب", tone: "danger" };
  }

  // 5. ADMINISTRATIVE — no substantive result; the closure REASON is the whole
  // story, so the label is null and the badge composer falls back to it.
  const administrativeReasons: string[] = [
    ClosureReason.CLIENT_WAIVER,
    ClosureReason.CONTRACT_NOT_RENEWED,
    ClosureReason.OPPONENT_PAID,
    // The client never completed the file. Administrative like its neighbours:
    // no substantive legal result was ever reached, so the reason IS the story
    // and the badge composer falls back to the "عدم استكمال البيانات" label.
    // Without this entry it would drop to arm 6 (NONE) and show no badge at all.
    ClosureReason.DATA_NOT_COMPLETED,
  ];
  if (isClosed && administrativeReasons.includes(reason)) {
    return { kind: CaseOutcomeKind.ADMINISTRATIVE, label: null, tone: "neutral" };
  }

  // 6. NONE — nothing substantive. Never invent an outcome.
  return { kind: CaseOutcomeKind.NONE, label: null, tone: "neutral" };
}

// Keeps the badge glanceable: closureReasonOther is varchar(500).
const CLOSURE_BADGE_MAX_CHARS = 40;

// THE ONE COMPOSER for the مقفلة badge suffix: the substantive OUTCOME when the
// case has one, otherwise the CLOSURE REASON — never both, never neither-labelled.
// Returns null when there is nothing to say, so the badge stays a bare
// "القضية مقفلة" with no dangling dash (older rows recorded no reason at all).
//
// ⚠ تم_التحصيل CAN NEVER REACH THIS BADGE. Collection is an ordinary procedural
// step, not an outcome — a collected win reads "القضية مقفلة — حكم لصالحنا". It is
// unreachable by construction, not by a filter: a case closed on تم_التحصيل got
// there through a judgment or a settlement, so branch 1 or 2 returns a label first
// and the closure-reason fallback below is never consulted. The one path that could
// close on تم_التحصيل with NEITHER — the grievance track انتظار_رد_التظلم → تحصيل —
// is caught by the explicit guard below.
export function caseClosureBadgeSuffix(
  lawCase: OutcomeCaseInput,
  hearings: OutcomeHearingInput[],
  // Batch 4 — passed straight through to resolveCaseOutcome so the closed-case
  // badge names the LATEST ruling. Optional for the same reason it is there.
  currentJudgmentOutcome?: string | null,
): { text: string; tone: CaseOutcomeTone } | null {
  const outcome = resolveCaseOutcome(lawCase, hearings, currentJudgmentOutcome);
  if (outcome.label) return { text: outcome.label, tone: outcome.tone };

  const raw = String(lawCase.closureReason || "").trim();
  if (!raw) return null;
  // Belt-and-braces for the grievance track, which collects without ever holding a
  // judgment or passing through مداولة_الصلح: تم_التحصيل must not surface here.
  if (raw === ClosureReason.COLLECTION_COMPLETED) return null;

  const resolved = raw === ClosureReason.OTHER
    ? ((String(lawCase.closureReasonOther || "").trim()) || ClosureReasonLabels[ClosureReason.OTHER])
    : (ClosureReasonLabels[raw as ClosureReasonValue] ?? raw);
  if (!resolved) return null;
  const text = resolved.length > CLOSURE_BADGE_MAX_CHARS
    ? `${resolved.slice(0, CLOSURE_BADGE_MAX_CHARS - 1)}…`
    : resolved;
  return { text, tone: outcome.tone };
}

// POST /api/cases/:id/opponent-response — "تم استلام رد الخصم". Tolerant gate;
// the handler requires needsOurResponse to be an explicit boolean.
export const opponentResponseSchema = z.object({
  needsOurResponse: z.boolean().optional(),
}).passthrough();

// POST /api/cases/:id/appeal-outcome — the two manual routes out of
// محكوم_حكم_ابتدائي. Tolerant gate; the handler enumerates the valid outcomes.
export const appealOutcomeSchema = z.object({
  outcome: z.string().optional(),
}).passthrough();

export const recordJudgmentDeedSchema = z.object({
  judgmentDeedReceivedDate: z.string().optional(),
  objectionWindowDays: z.union([z.number(), z.string()]).nullable().optional(),
}).passthrough();

// ==================== لوحة تفاصيل المخالفة — the admin violation panel ====================
// PATCH /api/cases/:id/violation-details. Tolerant per the validation-patterns
// rule: all-optional, .passthrough(), the handler keeps its own Arabic 400s.
//
// EVERY FIELD IS NULLABLE, and that is a feature rather than laxity: clearing a
// wrongly-entered decision number has to be expressible, and "" from an emptied
// input is normalised to null by the handler.
//
// 🔴 THE AMOUNT IS THE ONE FIELD WITH REAL VALIDATION, because it is the only
// one whose column can REJECT the value. violation_amount is numeric(12,2): a
// non-numeric string raises 22P02 and an over-large one 22003, both of which
// surface as an opaque 500 rather than a usable Arabic error. The pattern below
// is enforced BEFORE the write so the user is told what is wrong.
//   • optional sign, 1-10 integer digits, optional 1-2 decimal places
//   • 10 integer digits is the numeric(12,2) ceiling (12 total − 2 scale),
//     i.e. up to 9,999,999,999.99 — far beyond any administrative fine.
// Every other field is free text bounded by its varchar length, exactly like
// najiz_number and its siblings, and is truncated rather than rejected.
export const ViolationAmountPattern = /^-?\d{1,10}(\.\d{1,2})?$/;

export const updateViolationDetailsSchema = z.object({
  administrativeDecisionNumber: z.string().nullable().optional(),
  administrativeDecisionDate: z.string().nullable().optional(),
  violationKnowledgeDate: z.string().nullable().optional(),
  ifaaNumber: z.string().nullable().optional(),
  ifaaDate: z.string().nullable().optional(),
  grievanceNumber: z.string().nullable().optional(),
  grievanceDate: z.string().nullable().optional(),
  // Kept as a plain string here, NOT z.enum(GrievanceResultValues). The handler
  // does the membership check so it can return the house-style Arabic 400 with
  // the allowed values named; a zod enum failure yields a raw issue array. Same
  // reason every workflow schema in this file is tolerant and lets the handler
  // own its refusals (the validation-patterns rule).
  grievanceResult: z.string().nullable().optional(),
  // 🔴 executionRequestNumber is DELIBERATELY ABSENT. It belongs to the مهامي
  // execution field task and is written only by that route and the pre-existing
  // inline edit. The panel's «رقم طلب التنفيذ» is adminExecutionRequestNumber.
  adminExecutionRequestNumber: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  violationAmount: z.string().nullable().optional(),
}).passthrough();

// POST /api/cases/:id/appeal-ruling — the APPEAL COURT'S ruling on a case at
// منظورة_استئناف.
//
// ⚠ A SIBLING OF appealOutcomeSchema, NOT a widening of it. /appeal-outcome
// answers "what happened during OUR objection window on the first-instance
// ruling" (we appealed / the opponent appealed / nobody did) and runs at
// محكوم_حكم_ابتدائي. This one answers "what did the appeal court DECIDE" and runs
// one stage later. Overloading the first would have put two unrelated questions
// behind one `outcome` string whose legal values depend on the case's stage.
//
// Tolerant per the validation-patterns rule: all-optional, .passthrough(), with
// the handler keeping its own Arabic 400s so behaviour is unchanged for every
// shape the gate admits.
export const appealRulingSchema = z.object({
  outcome: z.string().optional(),
  // The appeal ruling's own صك, optional at recording time — the deed usually
  // arrives days later and is then filed through POST /judgment-deed exactly as
  // for a first-instance ruling.
  judgmentDeedReceivedDate: z.string().optional(),
  objectionWindowDays: z.union([z.number(), z.string()]).nullable().optional(),
  notes: z.string().optional(),
}).passthrough();

export const reopenCaseSchema = z.object({
  targetStage: z.string().optional(),
  notes: z.string().optional(),
  taradiNumber: z.string().optional(),
  mohrNumber: z.string().optional(),
  najizNumber: z.string().optional(),
  moeenNumber: z.string().optional(),
  courtCaseNumber: z.string().optional(),
}).passthrough();

// ---- 2D' V2b — contracts/memos/misc Tier-2 bodies ----
// Same gate-only philosophy as V2a: all fields optional, handlers keep
// their own requiredness checks; nullability mirrors entity interfaces.

// assignedTo mirrors Contract.assignedTo: string | null.
export const assignContractSchema = z.object({
  assignedTo: z.string().nullable().optional(),
}).passthrough();

// Contracts advance-stage carries stage-entry extras the handler reads
// (notes / internalReviewerId / priority / priorityReason).
export const advanceContractStageSchema = z.object({
  targetStage: z.string().optional(),
  notes: z.string().optional(),
  internalReviewerId: z.string().optional(),
  priority: z.string().optional(),
  priorityReason: z.string().optional(),
}).passthrough();

// Memos advance-stage carries an optional internalReviewerId extra.
export const advanceMemoStageSchema = z.object({
  targetStage: z.string().optional(),
  internalReviewerId: z.string().optional(),
}).passthrough();

// One body schema serves POST and PATCH /api/contact-logs — both are
// gate-only and all-optional; nullability mirrors the ContactLog interface.
export const contactLogBodySchema = z.object({
  clientId: z.string().optional(),
  contactType: z.string().optional(),
  contactDate: z.string().optional(),
  nextFollowUpDate: z.string().nullable().optional(),
  followUpStatus: z.string().optional(),
  notes: z.string().optional(),
  communicationType: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().nullable().optional(),
  followUpNotes: z.string().nullable().optional(),
  followUpCompleted: z.boolean().optional(),
  caseId: z.string().nullable().optional(),
  createdBy: z.string().optional(),
}).passthrough();

// Nullability mirrors the FieldTask interface.
export const updateFieldTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  taskType: z.string().optional(),
  caseId: z.string().nullable().optional(),
  consultationId: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  assignedTo: z.string().optional(),
  assignedBy: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  dueDate: z.string().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  completionNotes: z.string().optional(),
  proofDescription: z.string().optional(),
  proofFileLink: z.string().optional(),
  reviewNote: z.string().optional(),
}).passthrough();

// Mirrors the legal_deadlines columns (status is the only field the FE
// PATCHes today; the rest typed for completeness).
export const updateLegalDeadlineSchema = z.object({
  caseId: z.string().optional(),
  hearingId: z.string().nullable().optional(),
  deadlineType: z.string().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().optional(),
  durationDays: z.number().optional(),
  deadlineDate: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

// Ticket sub-ops — status/priority stay wide strings (no enum narrowing);
// assignedTo mirrors the nullable supportTickets.assigned_to column.
export const updateTicketStatusSchema = z.object({
  status: z.string().optional(),
}).passthrough();

export const assignTicketSchema = z.object({
  assignedTo: z.string().nullable().optional(),
}).passthrough();

export const updateTicketPrioritySchema = z.object({
  priority: z.string().optional(),
}).passthrough();

// ---- 2D' V3 — Tier-3 bodies (comments/notes/preferences) ----
// Same gate-only philosophy; handlers keep their own requiredness checks.

// FE also sends userId/userName/userRole (ignored server-side) → passthrough.
export const ticketCommentSchema = z.object({
  message: z.string().optional(),
  isInternal: z.boolean().optional(),
}).passthrough();

export const ticketRateSchema = z.object({
  rating: z.number().optional(),
  ratingComment: z.string().optional(),
}).passthrough();

export const caseCommentSchema = z.object({
  content: z.string().optional(),
}).passthrough();

// POST /api/cases/:id/notes — handler spreads ...req.body into the note,
// then overrides content/caseId/userId/userName. FE sends content +
// category + isImportant; mirror the caseNotes columns (editedAt is
// set server-side as a Date — intentionally NOT in the schema).
export const createCaseNoteSchema = z.object({
  content: z.string().optional(),
  category: z.string().optional(),
  isPinned: z.boolean().optional(),
  isImportant: z.boolean().optional(),
}).passthrough();

// PATCH /api/case-notes/:id — FE sends { content } or { isPinned }.
export const updateCaseNoteSchema = z.object({
  content: z.string().optional(),
  category: z.string().optional(),
  isPinned: z.boolean().optional(),
  isImportant: z.boolean().optional(),
}).passthrough();

export const markSectionViewedSchema = z.object({
  section: z.string().optional(),
}).passthrough();

// Pattern-A gate for PATCH /api/cases/:id — all-optional typed subset of
// LawCase columns plus the transient workflow fields the handler reads
// (transferReason, stageChangeNotes, judgmentType/judgmentFinal/needsAppeal).
// Nullability mirrors the LawCase interface.
export const updateCaseSchema = z.object({
  caseNumber: z.string().optional(),
  clientId: z.string().optional(),
  caseType: z.string().optional(),
  caseTypeOther: z.string().optional(),
  departmentOther: z.string().optional(),
  status: z.string().optional(),
  currentStage: z.string().optional(),
  departmentId: z.string().optional(),
  assignedLawyers: z.array(z.string()).optional(),
  primaryLawyerId: z.string().nullable().optional(),
  responsibleLawyerId: z.string().nullable().optional(),
  internalReviewerId: z.string().nullable().optional(),
  appealLawyerId: z.string().nullable().optional(),
  litigatorId: z.string().nullable().optional(),
  // Nullability mirrors the LawCase interface (both nullable).
  judgmentDeedReceivedDate: z.string().nullable().optional(),
  objectionWindowDays: z.number().nullable().optional(),
  executionRequestNumber: z.string().nullable().optional(),
  // لوحة تفاصيل المخالفة. DECLARED HERE OR SILENTLY LOST — z.object strips every
  // key it does not declare, and the generic PATCH gate safeParses the body.
  // That is exactly how grievanceRequired was dropped for months. Nullability
  // mirrors the LawCase interface (all eight nullable).
  administrativeDecisionNumber: z.string().nullable().optional(),
  administrativeDecisionDate: z.string().nullable().optional(),
  violationKnowledgeDate: z.string().nullable().optional(),
  ifaaNumber: z.string().nullable().optional(),
  ifaaDate: z.string().nullable().optional(),
  grievanceNumber: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  // STRING, matching the interface and the numeric column's inferred type.
  violationAmount: z.string().nullable().optional(),
  adminExecutionRequestNumber: z.string().nullable().optional(),
  courtName: z.string().optional(),
  courtCaseNumber: z.string().optional(),
  judgeName: z.string().optional(),
  circuitNumber: z.string().optional(),
  plaintiffName: z.string().optional(),
  opponentName: z.string().optional(),
  opponentLawyer: z.string().optional(),
  opponentPhone: z.string().optional(),
  opponentNotes: z.string().optional(),
  whatsappGroupLink: z.string().optional(),
  googleDriveFolderId: z.string().optional(),
  priority: z.string().optional(),
  caseClassification: z.string().optional(),
  clientRole: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
  isSettlementCase: z.boolean().optional(),
  memoRequired: z.boolean().optional(),
  grievanceRequired: z.boolean().optional(),
  platformReviewResubmitted: z.boolean().optional(),
  nextHearingDate: z.string().nullable().optional(),
  nextHearingTime: z.string().nullable().optional(),
  responseDeadline: z.string().nullable().optional(),
  prescriptionDate: z.string().nullable().optional(),
  grievanceDate: z.string().nullable().optional(),
  grievanceResult: z.string().nullable().optional(),
  taradiNumber: z.string().nullable().optional(),
  mohrNumber: z.string().nullable().optional(),
  najizNumber: z.string().optional(),
  moeenNumber: z.string().nullable().optional(),
  closureReason: z.string().nullable().optional(),
  closureReasonOther: z.string().nullable().optional(),
  reviewNotes: z.string().optional(),
  reviewDecision: z.string().nullable().optional(),
  currentSituation: z.string().optional(),
  transferReason: z.string().optional(),
  stageChangeNotes: z.string().optional(),
  judgmentType: z.string().optional(),
  judgmentFinal: z.boolean().optional(),
  needsAppeal: z.boolean().optional(),
}).passthrough();

// Pattern-A gate for PATCH /api/consultations/:id.
export const updateConsultationSchema = z.object({
  clientId: z.string().optional(),
  // Nullable: the edit dialog clears the title by sending null, not "".
  title: z.string().nullable().optional(),
  consultationType: z.string().optional(),
  deliveryType: z.string().optional(),
  currentStage: z.string().optional(),
  status: z.string().optional(),
  departmentId: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
  questionSummary: z.string().optional(),
  response: z.string().optional(),
  whatsappGroupLink: z.string().optional(),
  googleDriveFolderId: z.string().optional(),
  reviewNotes: z.string().optional(),
  reviewDecision: z.string().nullable().optional(),
  closureReason: z.string().nullable().optional(),
  closureReasonOther: z.string().nullable().optional(),
  category: z.string().optional(),
  expectedDeliveryDate: z.string().nullable().optional(),
  source: z.string().optional(),
  internalReviewerId: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  priorityReason: z.string().nullable().optional(),
  followUpStartedAt: z.string().nullable().optional(),
  transferReason: z.string().optional(),
}).passthrough();

// Pattern-A gate for PATCH /api/contracts/:id.
export const updateContractSchema = z.object({
  title: z.string().optional(),
  clientId: z.string().optional(),
  contractType: z.string().optional(),
  description: z.string().optional(),
  currentStage: z.string().optional(),
  status: z.string().optional(),
  departmentId: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
  internalReviewerId: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  priorityReason: z.string().nullable().optional(),
  reviewNotes: z.string().optional(),
  closureReason: z.string().nullable().optional(),
  closureReasonOther: z.string().nullable().optional(),
  transferReason: z.string().optional(),
}).passthrough();

// Pattern-A gate for PATCH /api/hearings/:id.
export const updateHearingSchema = z.object({
  caseId: z.string().optional(),
  hearingDate: z.string().optional(),
  hearingTime: z.string().optional(),
  hearingType: z.string().optional(),
  courtName: z.string().optional(),
  courtNameOther: z.string().nullable().optional(),
  courtRoom: z.string().optional(),
  status: z.string().optional(),
  result: z.string().nullable().optional(),
  resultDetails: z.string().optional(),
  judgmentSide: z.string().nullable().optional(),
  judgmentFinal: z.boolean().nullable().optional(),
  objectionFeasible: z.boolean().nullable().optional(),
  objectionDeadline: z.string().nullable().optional(),
  objectionStatus: z.string().nullable().optional(),
  nextHearingDate: z.string().nullable().optional(),
  nextHearingTime: z.string().nullable().optional(),
  responseRequired: z.boolean().optional(),
  memoRequired: z.boolean().optional(),
  opponentResponseRequired: z.boolean().optional(),
  hearingReport: z.string().optional(),
  recommendations: z.string().optional(),
  nextSteps: z.string().optional(),
  contactCompleted: z.boolean().optional(),
  reportCompleted: z.boolean().optional(),
  adminTasksCreated: z.boolean().optional(),
  opponentMemos: z.string().optional(),
  hearingMinutes: z.string().optional(),
  attendingLawyerId: z.string().nullable().optional(),
  notes: z.string().optional(),
}).passthrough();

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
  labor_review_head: [
    "view_cases", "edit_cases", "view_consultations", "edit_consultations", "approve_reviews",
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

// ==================== Unified Tasks (My Tasks feed) ====================
// A single typed item in the per-user "my tasks" aggregation (GET /api/my-tasks).
// Each item points at a source entity so the FE can deep-link, and carries the
// responsible owner + scope so a dept_head's view can split "my" vs "team".
export const MyTaskKind = {
  CASE_WORK: "case_work",                 // assigned lawyer must act at a lawyer-work stage
  // The consultation twin of CASE_WORK. NET-NEW: until this kind existed the
  // feed had NO work item for consultations at all — consultations.assignedTo
  // appeared in exactly three places, once as an UNASSIGNED test (the
  // consultation_unassigned block, which goes to the department head and stops
  // the moment someone is assigned) and twice inside the two aging backstops
  // (paused ≥3d, data-completion ≥3d), both of which render a disabled button.
  // So an assigned consultation was invisible to its assignee at EVERY stage of
  // its life, including دراسة / تحرير / الأخذ_بالملاحظات, where the assignee is
  // unambiguously the only person who can act.
  CONSULTATION_WORK: "consultation_work",
  // "the صك arrived and its FILE is still not on the case." A DISTINCT step from
  // chasing the receipt (the judgment_deed item, which reuses CASE_WORK): that one
  // ends when the DATE is recorded, and this one begins there. Its own kind rather
  // than a third CASE_WORK title because it is the only feed item whose completion
  // UNBLOCKS a server gate — isJudgmentDeedMissing refuses both the case close and
  // the advance out of the judgment stage until the file exists — so it needs to be
  // filterable and countable on its own.
  JUDGMENT_DEED_ATTACH: "judgment_deed_attach",
  CASE_UNASSIGNED: "case_unassigned",     // unassigned case in dept (dept_head assigns)
  // Siblings of the above for the other two assignable record types. Separate
  // kinds rather than one shared "unassigned" kind because each routes to its
  // OWN assign endpoint and needs its own Arabic verb — CASE_UNASSIGNED's
  // "إسناد القضية لمحامٍ" and its lawyer/department toggle are case-specific.
  CONSULTATION_UNASSIGNED: "consultation_unassigned",
  CONTRACT_UNASSIGNED: "contract_unassigned",
  HEARING_ATTEND: "hearing_attend",       // upcoming hearing to attend
  HEARING_UNRECORDED: "hearing_unrecorded", // hearing date passed, result not recorded
  HEARING_REPORT: "hearing_report",       // result recorded, report not completed
  HEARING_MINUTES: "hearing_minutes",     // result recorded, ضبط الجلسة file not attached
  MEMO_PENDING: "memo_pending",           // assigned memo not yet filed
  REVIEW_PENDING: "review_pending",       // internal/committee review awaiting this reviewer
  COLLECTION: "collection",               // collection (تحصيل) field task, incl. unassigned ""
  EXECUTION: "execution",                 // execution (تنفيذ) field task — رفع طلب تنفيذ after a final for-us judgment; incl. unassigned ""
  LEGAL_DEADLINE: "legal_deadline",       // approaching/overdue legal deadline
  FIELD_TASK: "field_task",               // assigned field task
  GENERAL_TASK: "general_task",           // manually-created general (عام) task — the assignee's do-the-work step, incl. unassigned ""
  GENERAL_TASK_REVIEW: "general_task_review",         // general task result awaiting the ORIGINAL requester's review (تم الاطلاع / send-back)
  GENERAL_TASK_DISTRIBUTE: "general_task_distribute", // dept-routed general task awaiting the dept_head distributing it to a member
  GENERAL_TASK_AWAITING_DISTRIBUTION: "general_task_awaiting_distribution", // requester's informational view of a dept-routed task still awaiting distribution (esp. head-less dept, assignedTo="")
  GENERAL_TASK_APPROVE: "general_task_approve",       // dept member's result awaiting the dept_head's approval before it returns to the requester
  CONTACT_FOLLOWUP: "contact_followup",   // contact follow-up due
  DELEGATION_APPROVAL: "delegation_approval", // pending delegation approval (dept_head)
  CONSULTATION_CLOSING: "consultation_closing", // consultation ready to close (admin_support)
  // Data-completion is routed per WORK TYPE — one assignee per entity kind.
  // case/consultation/contract fire at their data-completion STAGE; memo fires
  // on its awaiting-completion latch. (Sub-step 1: only _CASE generates; the
  // other three are assignable-but-dormant until sub-steps 2/3 add generation.)
  DATA_COMPLETION_CASE: "data_completion_case",                 // case at data-completion stage (admin_support)
  DATA_COMPLETION_CONSULTATION: "data_completion_consultation", // consultation at data-completion stage (dormant until sub-step 2)
  DATA_COMPLETION_CONTRACT: "data_completion_contract",         // contract at data-completion stage (dormant until sub-step 3)
  DATA_COMPLETION_MEMO: "data_completion_memo",                 // memo awaiting completion (dormant until sub-step 3)
  AGENCY_VERIFICATION: "agency_verification", // lawyer verifies agency before a near hearing (يوجد/لا يوجد)
  AGENCY_ISSUANCE: "agency_issuance", // admin_support issues the agency (إصدار وكالة) after a "لا يوجد" answer; incl. unassigned ""
  SESSION_REPORT_EXPORT: "session_report_export", // export session-report PDF (admin_support)
  CONTRACT_SEND: "contract_send", // admin_support sends an approved contract (إرسال العقد) at جاهزة_للإرسال → مغلقة; incl. unassigned ""
  // A record that has now sat PAUSED for ≥ PausedTaskMinDays. Deliberately ONE
  // kind for all four entity types (entityType distinguishes them) rather than
  // four: the row says the same thing about each, and KIND_META is an
  // exhaustive Record<MyTaskKindValue, …>, so four kinds would be four FE
  // entries carrying identical copy.
  PAUSED_AGING: "paused_aging",
  // A record that has sat at its data-completion step for
  // ≥ DataCompletionEscalationDays. ESCALATION ONLY — the day-0 task
  // (DATA_COMPLETION_*) stays with admin_support, ack-suppression and all; this
  // is a SECOND, separate row that goes to the ASSIGNEE once the wait drags.
  // A distinct kind is required, not cosmetic: reusing DATA_COMPLETION_* would
  // hand the assignee that kind's "تأكيد التواصل" action, whose ack writes
  // data_completion_last_ack_at and would silently suppress ADMIN SUPPORT's
  // task for two days. One kind for all four types; entityType tells them apart.
  DATA_COMPLETION_ESCALATED: "data_completion_escalated",
} as const;

export type MyTaskKindValue = typeof MyTaskKind[keyof typeof MyTaskKind];

// ⏸️ How long a pause must run before it becomes a thing to look at. Shared by
// the مهامي block that RAISES the task and the scheduler job that sends the
// one-time notice, so the two can never disagree about when a pause is "long".
export const PausedTaskMinDays = 3;

// ⏳ THE AGE ARM of the overdue rule (owner ruling). Roughly half the مهامي feed
// carries dueDate:null, so an overdue signal keyed on dates alone is blind to it.
// A task with NO dueDate is overdue once it has sat this long WITHOUT MOVEMENT.
//
// 🔴 THIS IS AN ELAPSED DURATION IN DAYS, NOT A COUNT OF CALENDAR DAYS, and the
// distinction is load-bearing rather than pedantic. This codebase has a
// documented date-boundary bug class — a UTC "today" once blocked hearing
// recording every morning between 00:00 and 03:00 Riyadh — so anything
// day-SHAPED must resolve through Asia/Riyadh. Instant arithmetic has no
// timezone at all and therefore no boundary to get wrong, which is why the
// threshold is consumed as `days × 86400000` against two instants and never
// compared to a date string. Same reasoning as PausedTaskMinDays directly above.
//
// The value is the owner's, and it is DELIBERATELY SHORT: at 2 days almost
// everything in scope flags, which is the intent — the firm wants movement, not
// a grace period. Every kind it applies to is one whose clock the FIRM controls;
// kinds waiting on a court or a counterparty are excluded at their emission
// sites, each with the reason recorded there.
export const AgeOverdueDays = 2;

// ⏳ How long a record may sit at its data-completion step before the wait
// ESCALATES from admin_support to the assignee. Deliberately its own constant
// rather than reusing PausedTaskMinDays: the two thresholds happen to coincide
// today but answer different questions, and tuning one must not move the other.
export const DataCompletionEscalationDays = 3;

// عدد الأيام بالعربية — the Arabic rendering of "N days". Shared by every
// elapsed-time task title and notification so the same duration is never worded
// two ways. (Named pausedDaysLabel when the pause task introduced it; renamed
// when the data-completion escalation became its second caller — one formatter,
// not two near-identical ones.)
//
// 🔴 THE DAY COUNT IS AN ELAPSED DURATION, NOT A CALENDAR-DAY DIFFERENCE, and
// that is deliberate given this codebase's date-boundary bug class. A calendar
// difference would have to ask "what day is it in Asia/Riyadh?" and would be
// off by one for every pause read near midnight. Whole 24-hour periods since
// the pause INSTANT need no timezone at all — the caller computes them in the
// same SQL query that decides visibility, so the number shown and the rule that
// showed it are evaluated at one NOW() and cannot disagree.
//
// Only TWO grammatical cases exist here, and that is a consequence of the
// 3-day threshold rather than an oversight: nothing below 3 ever reaches this
// function, so the singular (يوم) and dual (يومان) forms are unreachable.
// Arabic takes the broken plural for 3–10 (أيام) and the accusative singular
// from 11 up (يوماً).
export function elapsedDaysLabel(days: number): string {
  return days >= 11 ? `${days} يوماً` : `${days} أيام`;
}

export type MyTaskEntityType =
  | "case" | "consultation" | "contract" | "memo"
  | "hearing" | "field_task" | "legal_deadline" | "contact_log" | "delegation";

export type MyTaskActionHint =
  | "review" | "attend" | "draft" | "assign" | "export" | "approve"
  | "record" | "complete" | "follow_up" | "verify" | "close";

// "self" = the current user is the owner; "team" = a department member's task
// surfaced to their department_head (supervisory view).
export type MyTaskOwnerScope = "self" | "team";

export interface MyTaskItem {
  id: string;                  // stable, unique within the feed (kind:entityId)
  kind: MyTaskKindValue;       // the task type
  title: string;               // Arabic, human-readable
  entityType: MyTaskEntityType;// source entity type (for deep-linking)
  entityId: string;            // source entity id
  caseId: string | null;       // parent case id when relevant (cross-entity context)
  ownerId: string;             // responsible user id ("" when unassigned)
  ownerScope: MyTaskOwnerScope;
  dueDate: string | null;      // relevant/due date if any
  isOverdue: boolean;          // server-computed where a backend signal exists
  actionHint: MyTaskActionHint;// what the user does
  // Specialty class (ترافع / استشارات) of the task. The organizing principle
  // for admin_support: EVERY admin_support task falls under one class so it
  // routes to the right specialist and nothing is unclassified. null only for
  // entities outside the two-class domain (contracts, delegations) or a
  // field task with no entity link (see taskSpecialtyClass).
  specialtyClass: TaskSpecialtyValue | null;
  // When this task is surfaced to a DELEGATE because they act on behalf of a
  // delegator (active approved delegation), this is the delegator's user id so
  // the FE can render "بالنيابة عن (name)". null = the user's own task.
  onBehalfOfUserId: string | null;
  // For dept-routed general (عام) tasks only (GENERAL_TASK_DISTRIBUTE): the
  // department the task was routed to, so the distribute modal can list that
  // department's members WITHOUT depending on the field-tasks context (a
  // head-less task that just got a head stays assignedTo="" → outside that
  // context's scope). Undefined for every other feed kind.
  routedDepartmentId?: string | null;
  // ---- Matter identity (DISPLAY ONLY) ----
  // "Which case is this?" — the feed's titles carry only the case NUMBER, which
  // users can't map to a matter without searching the cases page. These three are
  // stamped by a single batched enrichment pass in getMyTasks (one query keyed by
  // the distinct caseIds already on the items), NOT stored on any entity and NOT
  // part of any title. Present on every task that carries a caseId; clientName is
  // additionally resolved for contact follow-ups from the contact log's own
  // clientId. All optional — absent for tasks with no case/client link (contracts,
  // delegations, free-standing general tasks) and when the column is empty.
  caseNumber?: string;
  clientName?: string;
  opponentName?: string;
  // ---- The RECORD's department (FILTER KEY, not display) ----
  // 🔴 THE RECORD'S DEPARTMENT, NEVER THE OWNER'S. Deriving it client-side from
  // the owner was considered and is wrong twice over: admin_support carries no
  // departmentId at all, and the unassigned pool has no owner to read one from —
  // so both would drop out of a department filter entirely. It is therefore
  // stamped SERVER-side from the record itself, in the same enrichment pass as
  // the matter identity above.
  //
  // Resolution per entity: case / memo / hearing / legal_deadline and any
  // case-linked field task or contact log → law_cases.department_id (reached via
  // the caseId every one of them already carries); consultation →
  // consultations.department_id; contract → contracts.department_id.
  //
  // null is a REAL, REACHABLE value, not an error: delegations and case-less
  // general tasks belong to no department. The filter gives them an explicit
  // "بدون قسم" option so they stay selectable rather than vanishing.
  departmentId?: string | null;
  // GROUPED agency tasks only (agency_verification / agency_issuance): the
  // underlying entity ids a single completion must act on — hearing ids for
  // verify, field_task ids for issuance. Same-client (exact name) + same-lawyer
  // + same pre-hearing window collapse into ONE task. Always carries ≥1 id (a
  // group of 1 = one element), so the completion path is uniform. Undefined for
  // every other kind.
  groupMemberIds?: string[];
}

// Classify a task into its specialty domain (ترافع litigation / استشارات
// consultations). Rule: anything tied to a case / hearing / memo / legal
// deadline (litigation workflow) → ترافع; anything tied to a consultation →
// استشارات. field_task / contact_log are classified by their case link
// (case-linked → ترافع; consultation-linked or entity-less → null until a
// consultationId is carried). Contracts/delegations are outside the two-class
// admin_support domain → null. Shared by the auto-task router and the feed.
export function taskSpecialtyClass(entityType: MyTaskEntityType, caseId: string | null): TaskSpecialtyValue | null {
  switch (entityType) {
    case "consultation":
      return TaskSpecialty.CONSULTATIONS;
    case "case":
    case "hearing":
    case "memo":
    case "legal_deadline":
      return TaskSpecialty.LITIGATION;
    case "field_task":
    case "contact_log":
      return caseId ? TaskSpecialty.LITIGATION : null;
    default: // contract, delegation
      return null;
  }
}

// ==================== Admin_support fine-grained task routing ====================
// Task kinds that route to a specific owner via the admin_support_task_assignments
// table (one row per task_type). Each kind's specialty class is derived by the
// FEED via taskSpecialtyClass on the kind's source entity, so the feed's class
// labels/filters stay unchanged:
//   collection             → field_task w/ caseId → ترافع (LITIGATION)
//   consultation_closing   → consultation         → استشارات (CONSULTATIONS)
//   session_report_export  → hearing               → ترافع (LITIGATION)
//   data_completion_*      → per WORK TYPE, one assignee per entity kind:
//     _case         → case at data-completion stage          → ترافع (LITIGATION)
//     _consultation → consultation at data-completion stage   → استشارات (CONSULTATIONS)
//     _contract     → contract at data-completion stage       → (no class)
//     _memo         → memo awaiting-completion latch          → ترافع (LITIGATION)
export const AssignableAdminSupportTaskKind = {
  COLLECTION: MyTaskKind.COLLECTION,
  CONSULTATION_CLOSING: MyTaskKind.CONSULTATION_CLOSING,
  SESSION_REPORT_EXPORT: MyTaskKind.SESSION_REPORT_EXPORT,
  DATA_COMPLETION_CASE: MyTaskKind.DATA_COMPLETION_CASE,
  DATA_COMPLETION_CONSULTATION: MyTaskKind.DATA_COMPLETION_CONSULTATION,
  DATA_COMPLETION_CONTRACT: MyTaskKind.DATA_COMPLETION_CONTRACT,
  DATA_COMPLETION_MEMO: MyTaskKind.DATA_COMPLETION_MEMO,
  EXECUTION: MyTaskKind.EXECUTION,
  AGENCY_ISSUANCE: MyTaskKind.AGENCY_ISSUANCE,
  CONTRACT_SEND: MyTaskKind.CONTRACT_SEND,
} as const;

export type AssignableAdminSupportTaskKindValue =
  typeof AssignableAdminSupportTaskKind[keyof typeof AssignableAdminSupportTaskKind];

export const AssignableAdminSupportTaskLabels: Record<AssignableAdminSupportTaskKindValue, string> = {
  [AssignableAdminSupportTaskKind.COLLECTION]: "التحصيل",
  [AssignableAdminSupportTaskKind.CONSULTATION_CLOSING]: "إغلاق الاستشارات",
  [AssignableAdminSupportTaskKind.SESSION_REPORT_EXPORT]: "تصدير تقارير الجلسات",
  [AssignableAdminSupportTaskKind.DATA_COMPLETION_CASE]: "استكمال المرفقات والبيانات — القضايا",
  [AssignableAdminSupportTaskKind.DATA_COMPLETION_CONSULTATION]: "استكمال المرفقات والبيانات — الاستشارات",
  [AssignableAdminSupportTaskKind.DATA_COMPLETION_CONTRACT]: "استكمال المرفقات والبيانات — العقود",
  [AssignableAdminSupportTaskKind.DATA_COMPLETION_MEMO]: "استكمال المرفقات والبيانات — المذكرات",
  [AssignableAdminSupportTaskKind.EXECUTION]: "التنفيذ",
  [AssignableAdminSupportTaskKind.AGENCY_ISSUANCE]: "إصدار الوكالة",
  [AssignableAdminSupportTaskKind.CONTRACT_SEND]: "إرسال العقد",
};

// Single specialty class per kind, for the settings-screen hint only (NOT
// routing — routing derives class per-task via taskSpecialtyClass). Each
// data_completion work-type now maps to its own entity's class; contract has
// no class in the two-class domain → omitted (settings screen shows no hint).
export const AssignableAdminSupportTaskClass: Partial<Record<AssignableAdminSupportTaskKindValue, TaskSpecialtyValue>> = {
  [AssignableAdminSupportTaskKind.COLLECTION]: TaskSpecialty.LITIGATION,
  [AssignableAdminSupportTaskKind.CONSULTATION_CLOSING]: TaskSpecialty.CONSULTATIONS,
  [AssignableAdminSupportTaskKind.SESSION_REPORT_EXPORT]: TaskSpecialty.LITIGATION,
  [AssignableAdminSupportTaskKind.DATA_COMPLETION_CASE]: TaskSpecialty.LITIGATION,
  [AssignableAdminSupportTaskKind.DATA_COMPLETION_CONSULTATION]: TaskSpecialty.CONSULTATIONS,
  // DATA_COMPLETION_CONTRACT + CONTRACT_SEND omitted — contracts are outside the
  // two-class domain (no specialty hint on those settings rows).
  [AssignableAdminSupportTaskKind.DATA_COMPLETION_MEMO]: TaskSpecialty.LITIGATION,
  [AssignableAdminSupportTaskKind.EXECUTION]: TaskSpecialty.LITIGATION,
  [AssignableAdminSupportTaskKind.AGENCY_ISSUANCE]: TaskSpecialty.LITIGATION,
};

// Select type for the mapping table (declared with the table above).
export type AdminSupportTaskAssignment = typeof adminSupportTaskAssignments.$inferSelect;

// Tolerant PUT-body gate for the assignment settings screen (validation-patterns
// discipline: passthrough, all-optional, handler does the semantic checks).
// assigneeUserId: a user id, null to clear (unassign), or omitted (→ null). The
// task type comes from the URL param, validated against AssignableAdminSupportTaskKind.
export const setAdminSupportTaskAssignmentSchema = z.object({
  assigneeUserId: z.string().nullable().optional(),
}).passthrough();

// Resolve the owner of an assignable admin_support task type from the mapping:
// returns the saved assignee IFF it is still an ACTIVE admin_support user, else
// "" (the unassigned sentinel → the task falls to the manager's unassigned
// group). Pure/structural so it's shared by collection creation-time routing
// (server/routes) and the computed feed (server/storage).
export function resolveAdminSupportAssignee(
  taskType: AssignableAdminSupportTaskKindValue,
  assignments: Array<{ taskType: string; assigneeUserId: string | null }>,
  users: Array<{ id: string; role: string; isActive: boolean }>,
): string {
  const assigneeId = assignments.find((a) => a.taskType === taskType)?.assigneeUserId ?? null;
  if (!assigneeId) return "";
  const u = users.find((x) => x.id === assigneeId);
  return u && u.role === "admin_support" && u.isActive ? assigneeId : "";
}
