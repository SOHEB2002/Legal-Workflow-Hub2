import {
  type User, type LawCase, type Client, type Consultation, type Hearing,
  type FieldTask, type ContactLog, type Notification, type DepartmentInfo, type Attachment, type Memo,
  type SupportTicket,
  type CaseActivity, type InsertCaseActivity,
  type CaseNote, type InsertCaseNote,
  type CaseCommentRow, type InsertCaseComment,
  type LegalDeadline, type InsertLegalDeadline,
  type DelegationRecord, type InsertDelegation,
  type SavedFilter, type InsertSavedFilter, type UpdateSavedFilter,
  type SidebarCounts, type SidebarSectionValue, SIDEBAR_SECTIONS,
  type ConsultationStudy, type ConsultationDraft, type ConsultationReview,
  type ConsultationCommitteeDecision, type ConsultationNoteOutcome,
  type ConsultationDeliveryExtension, type ConsultationActivity,
  type MemoReview, type MemoCommitteeDecision, type MemoNoteOutcome,
  CaseStatus, CaseStage, CaseClassification, ConsultationStage, ConsultationStatus,
  ConsultationCategory, ConsultationCategorySLADays, type ConsultationCategoryValue,
  ConsultationActivityType, MemoActivityType, MemoStage, type MemoActivity,
  users, clients, lawCases, consultations, hearings, fieldTasks, contactLogs, notifications, departments, attachments, memos, supportTickets,
  caseActivityLog, caseNotes, caseComments, legalDeadlines, delegationsTable, savedFilters, userSectionViews,
  consultationStudies, consultationDrafts, consultationReviews,
  consultationCommitteeDecisions, consultationNoteOutcomes,
  consultationDeliveryExtensions, consultationActivityLog,
  memoActivityLog,
  memoReviews, memoCommitteeDecisions, memoNoteOutcomes
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gt, desc, asc, lte, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";
import { hashPassword } from "./auth";

// Detect a Postgres unique-constraint violation (SQLSTATE 23505) on a
// specific column. node-postgres surfaces these on the error object as
// `code === "23505"` plus a `constraint` name (e.g. "law_cases_case_number_unique")
// and a `detail` line ("Key (case_number)=(...) already exists."). Either
// signal is enough to confirm the column.
function isUniqueViolationOn(err: unknown, columnName: string): boolean {
  const e = err as any;
  if (!e || e.code !== "23505") return false;
  const constraint = String(e.constraint || "");
  const detail = String(e.detail || "");
  return constraint.includes(columnName) || detail.includes(`(${columnName})`);
}

function generateCaseNumber(): string {
  return `C-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
}

function generateConsultationNumber(): string {
  return `CON-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getActiveUsers(): Promise<User[]>;
  createUser(data: Partial<User>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Cases
  getAllCases(): Promise<LawCase[]>;
  getCaseById(id: string): Promise<LawCase | undefined>;
  createCase(data: Partial<LawCase>, createdBy: string): Promise<LawCase>;
  updateCase(id: string, data: Partial<LawCase>): Promise<LawCase | undefined>;
  deleteCase(id: string): Promise<boolean>;

  // Clients
  getAllClients(): Promise<Client[]>;
  getClientById(id: string): Promise<Client | undefined>;
  createClient(data: Partial<Client>, createdBy: string): Promise<Client>;
  updateClient(id: string, data: Partial<Client>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;

  // Consultations
  getAllConsultations(): Promise<Consultation[]>;
  getConsultationById(id: string): Promise<Consultation | undefined>;
  createConsultation(data: Partial<Consultation>, createdBy: string): Promise<Consultation>;
  updateConsultation(id: string, data: Partial<Consultation>): Promise<Consultation | undefined>;
  deleteConsultation(id: string): Promise<boolean>;

  // Hearings
  getAllHearings(): Promise<Hearing[]>;
  getHearingsByCase(caseId: string): Promise<Hearing[]>;
  getHearingById(id: string): Promise<Hearing | undefined>;
  createHearing(data: Partial<Hearing>): Promise<Hearing>;
  updateHearing(id: string, data: Partial<Hearing>): Promise<Hearing | undefined>;
  deleteHearing(id: string): Promise<boolean>;

  // Field Tasks
  getAllFieldTasks(): Promise<FieldTask[]>;
  getFieldTasksByCase(caseId: string): Promise<FieldTask[]>;
  getFieldTaskById(id: string): Promise<FieldTask | undefined>;
  createFieldTask(data: Partial<FieldTask>, assignedBy: string): Promise<FieldTask>;
  updateFieldTask(id: string, data: Partial<FieldTask>): Promise<FieldTask | undefined>;
  deleteFieldTask(id: string): Promise<boolean>;

  // Contact Logs
  getAllContactLogs(): Promise<ContactLog[]>;
  getContactLogsByClient(clientId: string): Promise<ContactLog[]>;
  createContactLog(data: Partial<ContactLog>, createdBy: string): Promise<ContactLog>;
  updateContactLog(id: string, data: Partial<ContactLog>): Promise<ContactLog | undefined>;
  deleteContactLog(id: string): Promise<boolean>;

  // Notifications
  getAllNotifications(): Promise<Notification[]>;
  getRecentNotifications(limit: number): Promise<Notification[]>;
  getNotificationsByRecipient(recipientId: string): Promise<Notification[]>;
  createNotification(data: Partial<Notification>): Promise<Notification>;
  updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined>;
  deleteNotification(id: string): Promise<boolean>;

  // Departments
  getAllDepartments(): Promise<DepartmentInfo[]>;
  getDepartmentById(id: string): Promise<DepartmentInfo | undefined>;
  updateDepartment(id: string, data: Partial<DepartmentInfo>): Promise<DepartmentInfo | undefined>;

  // Memos
  getAllMemos(): Promise<Memo[]>;
  getMemoById(id: string): Promise<Memo | undefined>;
  getMemosByCase(caseId: string): Promise<Memo[]>;
  getMemosByHearing(hearingId: string): Promise<Memo[]>;
  createMemo(data: Partial<Memo>): Promise<Memo>;
  updateMemo(id: string, data: Partial<Memo>): Promise<Memo | undefined>;
  deleteMemo(id: string): Promise<boolean>;

  // Attachments
  getAttachmentsByEntity(entityType: string, entityId: string): Promise<Attachment[]>;
  createAttachment(data: Partial<Attachment>): Promise<Attachment>;
  deleteAttachment(id: string): Promise<boolean>;

  // Support Tickets
  getAllSupportTickets(): Promise<SupportTicket[]>;
  getSupportTicketById(id: string): Promise<SupportTicket | undefined>;
  getSupportTicketsByUser(userId: string): Promise<SupportTicket[]>;
  createSupportTicket(data: Partial<SupportTicket>): Promise<SupportTicket>;
  updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined>;
  deleteSupportTicket(id: string): Promise<boolean>;
  getNextTicketNumber(): Promise<string>;

  // Case Activity Log
  logCaseActivity(data: InsertCaseActivity): Promise<CaseActivity>;
  getCaseActivities(caseId: string): Promise<CaseActivity[]>;

  // Case Notes
  getCaseNotes(caseId: string): Promise<CaseNote[]>;
  createCaseNote(data: InsertCaseNote): Promise<CaseNote>;
  updateCaseNote(id: string, data: Partial<CaseNote>): Promise<CaseNote | undefined>;
  deleteCaseNote(id: string): Promise<boolean>;

  // Case Comments
  getCommentsByCaseId(caseId: string): Promise<CaseCommentRow[]>;
  createCaseComment(data: InsertCaseComment): Promise<CaseCommentRow>;

  // Legal Deadlines
  getAllLegalDeadlines(): Promise<LegalDeadline[]>;
  getLegalDeadlinesByCase(caseId: string): Promise<LegalDeadline[]>;
  createLegalDeadline(data: InsertLegalDeadline): Promise<LegalDeadline>;
  updateLegalDeadline(id: string, data: Partial<LegalDeadline>): Promise<LegalDeadline | undefined>;
  deleteLegalDeadline(id: string): Promise<boolean>;

  // Delegations
  getDelegation(id: string): Promise<DelegationRecord | undefined>;
  getAllDelegations(): Promise<DelegationRecord[]>;
  getActiveDelegationsForUser(userId: string): Promise<DelegationRecord[]>;
  createDelegation(data: InsertDelegation): Promise<DelegationRecord>;
  updateDelegation(id: string, data: Partial<DelegationRecord>): Promise<DelegationRecord | undefined>;
  deleteDelegation(id: string): Promise<boolean>;

  // Saved Filters
  getSavedFiltersByUser(userId: string, pageType: string): Promise<SavedFilter[]>;
  getSavedFilterById(id: string): Promise<SavedFilter | undefined>;
  createSavedFilter(userId: string, data: InsertSavedFilter): Promise<SavedFilter>;
  updateSavedFilter(id: string, data: UpdateSavedFilter): Promise<SavedFilter | undefined>;
  deleteSavedFilter(id: string): Promise<boolean>;

  // Sidebar "new since last visit" counts. Counts items per section
  // visible to the user that were created/assigned after their
  // user_section_views.last_viewed_at for that section. If no row
  // exists for a section yet, that section returns 0 (avoids
  // overwhelming new users with the all-time backlog).
  getSidebarCounts(user: { id: string; role: string; departmentId: string | null }): Promise<SidebarCounts>;
  markSectionViewed(userId: string, section: SidebarSectionValue): Promise<void>;

  // Convert consultation to case (rebuild §3.2.3) — single DB transaction.
  convertConsultationToCase(
    consultationId: string,
    caseFields: Partial<LawCase>,
    actorId: string,
    activityCtx?: { targetCaseStage?: string },
  ): Promise<{ case: LawCase; consultation: Consultation }>;

  // Consultation helper tables (rebuild §3.1.3)
  createConsultationStudy(data: { consultationId: string; notes: string; createdBy: string }): Promise<ConsultationStudy>;
  getConsultationStudies(consultationId: string): Promise<ConsultationStudy[]>;
  createConsultationDraft(data: { consultationId: string; content: string; createdBy: string }): Promise<ConsultationDraft>;
  getConsultationDrafts(consultationId: string): Promise<ConsultationDraft[]>;
  createConsultationReview(data: { consultationId: string; reviewerId: string; decision: string; notes: string }): Promise<ConsultationReview>;
  getConsultationReviews(consultationId: string): Promise<ConsultationReview[]>;
  getLatestConsultationReview(consultationId: string): Promise<ConsultationReview | undefined>;
  createConsultationCommitteeDecision(data: { consultationId: string; decision: string; notes: string; decidedBy: string }): Promise<ConsultationCommitteeDecision>;
  getConsultationCommitteeDecisions(consultationId: string): Promise<ConsultationCommitteeDecision[]>;
  createConsultationNoteOutcome(data: { consultationId: string; outcome: string; notes: string; recordedBy: string }): Promise<ConsultationNoteOutcome>;
  getConsultationNoteOutcomes(consultationId: string): Promise<ConsultationNoteOutcome[]>;
  // Phase-5: extend the consultation's expectedDeliveryDate. Insert + update
  // run inside one transaction so the audit row and the consultation row
  // can never get out of sync.
  extendConsultationDelivery(
    consultationId: string,
    data: { newExpectedDeliveryDate: Date; reason: string },
    extendedBy: string,
    activity?: { description: string; metadata?: Record<string, any> },
  ): Promise<{ extension: ConsultationDeliveryExtension; consultation: Consultation }>;
  getConsultationDeliveryExtensions(consultationId: string): Promise<ConsultationDeliveryExtension[]>;

  // Phase-6 — consultation activity log. Inserts always run inside the
  // SAME DB transaction as the underlying state change (see workflow
  // handlers in routes.ts) so the log can never get out of sync with
  // the consultation row. The bare insert helper exists for ad-hoc
  // logging where transactional bundling isn't required.
  createConsultationActivity(input: {
    consultationId: string;
    activityType: string;
    description: string;
    metadata?: Record<string, any>;
    performedBy: string | null;
  }): Promise<ConsultationActivity>;
  getConsultationActivities(consultationId: string): Promise<ConsultationActivity[]>;
  // Atomic update + log. Used by assign / advance-stage / return-stage /
  // early-close so the activity row and the consultation update commit
  // together.
  updateConsultationAndLog(
    id: string,
    data: Partial<Consultation>,
    activity: { activityType: string; description: string; metadata?: Record<string, any>; performedBy: string | null },
  ): Promise<Consultation | undefined>;
  // Phase-8 — pause / unpause + activity log writers across the 3 entities.
  pauseConsultation(id: string, input: { reason: string; performedBy: string }): Promise<Consultation | undefined>;
  unpauseConsultation(id: string, input: { notes?: string; performedBy: string }): Promise<Consultation | undefined>;
  pauseCase(id: string, input: { reason: string; performedBy: string; performerName: string }): Promise<LawCase | undefined>;
  unpauseCase(id: string, input: { notes?: string; performedBy: string; performerName: string }): Promise<LawCase | undefined>;
  pauseMemo(id: string, input: { reason: string; performedBy: string }): Promise<Memo | undefined>;
  unpauseMemo(id: string, input: { notes?: string; performedBy: string }): Promise<Memo | undefined>;
  getMemoActivities(memoId: string): Promise<MemoActivity[]>;
  // Phase-8 — await-completion / resume / skip across the 3 entities.
  awaitConsultationCompletion(id: string, input: { reason: string; performedBy: string }): Promise<Consultation | undefined>;
  resumeConsultationFromCompletion(id: string, input: { notes?: string; performedBy: string }): Promise<Consultation | undefined>;
  skipConsultationCompletion(id: string, input: { performedBy: string }): Promise<Consultation | undefined>;
  awaitCaseCompletion(id: string, input: { reason: string; performedBy: string; performerName: string }): Promise<LawCase | undefined>;
  resumeCaseFromCompletion(id: string, input: { notes?: string; performedBy: string; performerName: string; isValidStage: (stage: string) => boolean }): Promise<{ ok: true; lawCase: LawCase } | { ok: false; reason: "INVALID_SAVED_STAGE" | "NOT_FOUND" }>;
  awaitMemoCompletion(id: string, input: { reason: string; performedBy: string }): Promise<Memo | undefined>;
  resumeMemoFromCompletion(id: string, input: { notes?: string; performedBy: string }): Promise<Memo | undefined>;
  // Atomic helper-row + stage update + log for the three workflow
  // endpoints whose route used to issue two separate storage calls.
  recordConsultationInternalReview(input: {
    consultationId: string;
    reviewerId: string;
    decision: string;
    notes: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ review: ConsultationReview; consultation: Consultation }>;
  recordConsultationCommitteeDecision(input: {
    consultationId: string;
    decision: string;
    notes: string;
    decidedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ decision: ConsultationCommitteeDecision; consultation: Consultation }>;
  recordConsultationNoteOutcome(input: {
    consultationId: string;
    outcome: string;
    notes: string;
    recordedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ outcome: ConsultationNoteOutcome; consultation: Consultation }>;

  // Phase-9 — memo workflow helpers. Mirror the consultation versions:
  // updateMemoAndLog is the atomic update + activity log path used by
  // advance-stage / return-stage; the three record* helpers each insert
  // a helper-table row, update memos.current_stage, and write an
  // activity log entry inside one DB transaction.
  updateMemoAndLog(
    id: string,
    data: Partial<Memo>,
    activity: { activityType: string; description: string; metadata?: Record<string, any>; performedBy: string | null },
  ): Promise<Memo | undefined>;
  recordMemoInternalReview(input: {
    memoId: string;
    reviewerId: string;
    decision: string;
    notes: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ review: MemoReview; memo: Memo }>;
  recordMemoCommitteeDecision(input: {
    memoId: string;
    decision: string;
    notes: string;
    decidedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ decision: MemoCommitteeDecision; memo: Memo }>;
  recordMemoNoteOutcome(input: {
    memoId: string;
    outcome: string;
    notes: string;
    recordedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ outcome: MemoNoteOutcome; memo: Memo }>;
  getMemoReviews(memoId: string): Promise<MemoReview[]>;
  getMemoCommitteeDecisions(memoId: string): Promise<MemoCommitteeDecision[]>;
  getMemoNoteOutcomes(memoId: string): Promise<MemoNoteOutcome[]>;
  // Phase-9.2 — atomic cancellation. Sets status='ملغاة', writes the
  // reason to memos.cancellation_reason, and inserts a memo_activity_log
  // entry in the same transaction.
  cancelMemo(
    id: string,
    input: { reason: string; performedBy: string },
  ): Promise<Memo | undefined>;

  // Return-to-committee from الأخذ_بالملاحظات → لجنة_المراجعة. One
  // transaction: stage update + activity-log row. Used by the
  // /return-to-committee endpoints across the three entities.
  returnCaseToCommittee(
    id: string,
    input: { notes: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined>;
  returnMemoToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Memo | undefined>;
  returnConsultationToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Consultation | undefined>;

  // Initialization
  initializeDefaultData(): Promise<void>;
}

// Helper to convert DB timestamps to ISO strings
function toISOString(date: Date | null | undefined): string {
  if (!date) return new Date().toISOString();
  return date.toISOString();
}

function toISOStringOrNull(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}

// Map DB user to interface User
function mapDbUser(dbUser: any): User {
  return {
    id: dbUser.id,
    username: dbUser.username,
    password: dbUser.password,
    name: dbUser.name,
    email: dbUser.email || "",
    phone: dbUser.phone || "",
    role: dbUser.role,
    departmentId: dbUser.departmentId,
    isActive: dbUser.isActive ?? true,
    canBeAssignedCases: dbUser.canBeAssignedCases ?? false,
    canBeAssignedConsultations: dbUser.canBeAssignedConsultations ?? false,
    mustChangePassword: dbUser.mustChangePassword ?? true,
    createdAt: toISOString(dbUser.createdAt),
    updatedAt: toISOString(dbUser.updatedAt),
  };
}

// Map DB case to interface LawCase
function mapDbCase(dbCase: any): LawCase {
  return {
    id: dbCase.id,
    caseNumber: dbCase.courtCaseNumber || dbCase.caseNumber,
    clientId: dbCase.clientId || "",
    caseType: dbCase.caseType,
    caseTypeOther: dbCase.caseTypeOther || "",
    departmentOther: dbCase.departmentOther || "",
    status: dbCase.status,
    currentStage: dbCase.currentStage,
    stageHistory: dbCase.stageHistory || [],
    departmentId: dbCase.departmentId,
    assignedLawyers: dbCase.assignedLawyers || [],
    primaryLawyerId: dbCase.primaryLawyerId,
    responsibleLawyerId: dbCase.responsibleLawyerId,
    courtName: dbCase.courtName || "",
    courtCaseNumber: dbCase.courtCaseNumber || "",
    judgeName: dbCase.judgeName || "",
    circuitNumber: dbCase.circuitNumber || "",
    plaintiffName: dbCase.plaintiffName || "",
    opponentName: dbCase.opponentName || "",
    opponentLawyer: dbCase.opponentLawyer || "",
    opponentPhone: dbCase.opponentPhone || "",
    opponentNotes: dbCase.opponentNotes || "",
    whatsappGroupLink: dbCase.whatsappGroupLink || "",
    googleDriveFolderId: dbCase.googleDriveFolderId || "",
    reviewNotes: dbCase.reviewNotes || "",
    platformReviewNotes: dbCase.platformReviewNotes || "",
    platformReviewResubmitted: dbCase.platformReviewResubmitted ?? false,
    reviewDecision: dbCase.reviewDecision,
    reviewActionTaken: dbCase.reviewActionTaken,
    priority: dbCase.priority || "متوسط",
    najizNumber: dbCase.najizNumber || "",
    lastHearingResult: dbCase.lastHearingResult || null,
    lastHearingDate: dbCase.lastHearingDate || null,
    nextHearingDate: dbCase.nextHearingDate || null,
    nextHearingTime: dbCase.nextHearingTime || null,
    activeMemoCount: dbCase.activeMemoCount ?? 0,
    caseClassification: dbCase.caseClassification || "قيد_الدراسة",
    previousHearingsCount: dbCase.previousHearingsCount ?? 0,
    currentSituation: dbCase.currentSituation || "",
    responseDeadline: dbCase.responseDeadline || null,
    taradiStatus: dbCase.taradiStatus || null,
    taradiNumber: dbCase.taradiNumber || null,
    mohrStatus: dbCase.mohrStatus || null,
    mohrNumber: dbCase.mohrNumber || null,
    memoRequired: dbCase.memoRequired ?? false,
    amicableSettlementDirected: dbCase.amicableSettlementDirected ?? false,
    adminCaseSubType: dbCase.adminCaseSubType || null,
    prescriptionDate: dbCase.prescriptionDate || null,
    grievanceRequired: dbCase.grievanceRequired ?? false,
    grievanceDate: dbCase.grievanceDate || null,
    grievanceResult: dbCase.grievanceResult || null,
    struckOffDate: dbCase.struckOffDate || null,
    struckOffReopenDeadline: dbCase.struckOffReopenDeadline || null,
    appealLawyerId: dbCase.appealLawyerId || null,
    internalReviewerId: dbCase.internalReviewerId || null,
    moeenNumber: dbCase.moeenNumber || null,
    clientRole: dbCase.clientRole || null,
    closureReason: dbCase.closureReason || null,
    closureReasonOther: dbCase.closureReasonOther || null,
    isArchived: dbCase.isArchived ?? false,
    archivedAt: toISOStringOrNull(dbCase.archivedAt),
    archivedBy: dbCase.archivedBy || null,
    archiveReason: dbCase.archiveReason || null,
    autoArchiveDate: dbCase.autoArchiveDate || null,
    isSettlementCase: dbCase.isSettlementCase ?? false,
    convertedFromConsultationId: dbCase.convertedFromConsultationId || null,
    createdBy: dbCase.createdBy,
    createdAt: toISOString(dbCase.createdAt),
    updatedAt: toISOString(dbCase.updatedAt),
    closedAt: toISOStringOrNull(dbCase.closedAt),
    // Phase-8 — pause + await-completion. All nullable / boolean-default
    // so legacy rows surface as "not paused, not awaiting".
    pauseReason: dbCase.pauseReason ?? null,
    pausedBy: dbCase.pausedBy ?? null,
    pausedAt: toISOStringOrNull(dbCase.pausedAt),
    awaitingCompletion: dbCase.awaitingCompletion ?? false,
    savedStage: dbCase.savedStage ?? null,
  };
}

// Map DB client to interface Client
function mapDbClient(dbClient: any): Client {
  return {
    id: dbClient.id,
    clientType: dbClient.clientType,
    individualName: dbClient.individualName,
    nationalId: dbClient.nationalId,
    phone: dbClient.phone,
    companyName: dbClient.companyName,
    commercialRegister: dbClient.commercialRegister,
    representativeName: dbClient.representativeName,
    representativeTitle: dbClient.representativeTitle,
    companyPhone: dbClient.companyPhone,
    email: dbClient.email || "",
    address: dbClient.address || "",
    notes: dbClient.notes || "",
    createdBy: dbClient.createdBy,
    createdAt: toISOString(dbClient.createdAt),
    updatedAt: toISOString(dbClient.updatedAt),
  };
}

// Map DB consultation to interface Consultation.
//
// Every key in the Consultation interface MUST be present in the returned
// object — JSON.stringify drops keys whose value is undefined, so a row
// where Drizzle hands us undefined for a column (e.g. because the running
// server's compiled schema lacks the column declaration) would silently
// vanish from the API response and the client would render "—" for
// stage/status badges with no error to point at.
//
// To make that failure mode loud rather than silent: every nullable
// field below uses `?? null` (NOT `|| null` — we want to preserve "" for
// text fields that legitimately store empty strings) so the key is
// always emitted. The two not-null columns (currentStage, status) get
// explicit fallbacks too as defense in depth even though the table
// declares them NOT NULL with defaults.
function mapDbConsultation(dbCon: any): Consultation {
  return {
    id: dbCon.id,
    consultationNumber: dbCon.consultationNumber,
    clientId: dbCon.clientId,
    consultationType: dbCon.consultationType,
    deliveryType: dbCon.deliveryType,
    currentStage: dbCon.currentStage ?? "استلام",
    status: dbCon.status ?? "active",
    closureReason: dbCon.closureReason ?? null,
    closureReasonOther: dbCon.closureReasonOther ?? null,
    departmentId: dbCon.departmentId,
    assignedTo: dbCon.assignedTo ?? null,
    questionSummary: dbCon.questionSummary,
    response: dbCon.response ?? "",
    convertedToCaseId: dbCon.convertedToCaseId ?? null,
    whatsappGroupLink: dbCon.whatsappGroupLink ?? "",
    googleDriveFolderId: dbCon.googleDriveFolderId ?? "",
    reviewNotes: dbCon.reviewNotes ?? "",
    reviewDecision: dbCon.reviewDecision ?? null,
    // Phase-4 SLA columns. Category falls back to "عادية" so consultations
    // created before the column existed (and never backfilled) still
    // present a valid value to the UI; expectedDeliveryDate stays null
    // when the row predates the migration.
    category: dbCon.category ?? "عادية",
    expectedDeliveryDate: toISOStringOrNull(dbCon.expectedDeliveryDate),
    createdBy: dbCon.createdBy,
    createdAt: toISOString(dbCon.createdAt),
    updatedAt: toISOString(dbCon.updatedAt),
    closedAt: toISOStringOrNull(dbCon.closedAt),
    // Phase-8 — pause + await-completion. All nullable / boolean-default
    // so legacy rows surface as "not paused, not awaiting".
    pauseReason: dbCon.pauseReason ?? null,
    pausedBy: dbCon.pausedBy ?? null,
    pausedAt: toISOStringOrNull(dbCon.pausedAt),
    awaitingCompletion: dbCon.awaitingCompletion ?? false,
    savedStage: dbCon.savedStage ?? null,
  };
}

// Map DB consultation_activity_log row to ConsultationActivity (Phase-6).
function mapDbConsultationActivity(row: any): ConsultationActivity {
  return {
    id: row.id,
    consultationId: row.consultationId,
    activityType: row.activityType,
    description: row.description ?? "",
    metadata: (row.metadata && typeof row.metadata === "object") ? row.metadata : {},
    performedBy: row.performedBy ?? null,
    performedAt: toISOString(row.performedAt),
  };
}

// Map DB hearing to interface Hearing
function mapDbHearing(dbHearing: any): Hearing {
  return {
    id: dbHearing.id,
    caseId: dbHearing.caseId,
    hearingDate: dbHearing.hearingDate,
    hearingTime: dbHearing.hearingTime,
    hearingType: dbHearing.hearingType || "محكمة",
    courtName: dbHearing.courtName,
    courtNameOther: dbHearing.courtNameOther,
    courtRoom: dbHearing.courtRoom || "",
    status: dbHearing.status,
    result: dbHearing.result,
    resultDetails: dbHearing.resultDetails || "",
    judgmentSide: dbHearing.judgmentSide || null,
    judgmentFinal: dbHearing.judgmentFinal ?? null,
    objectionFeasible: dbHearing.objectionFeasible ?? null,
    objectionDeadline: dbHearing.objectionDeadline || null,
    objectionStatus: dbHearing.objectionStatus || null,
    nextHearingDate: dbHearing.nextHearingDate || null,
    nextHearingTime: dbHearing.nextHearingTime || null,
    responseRequired: dbHearing.responseRequired ?? false,
    memoRequired: (dbHearing as any).memoRequired ?? false,
    opponentResponseRequired: (dbHearing as any).opponentResponseRequired ?? false,
    hearingReport: dbHearing.hearingReport || "",
    recommendations: dbHearing.recommendations || "",
    nextSteps: dbHearing.nextSteps || "",
    contactCompleted: dbHearing.contactCompleted ?? false,
    reportCompleted: dbHearing.reportCompleted ?? false,
    adminTasksCreated: dbHearing.adminTasksCreated ?? false,
    opponentMemos: dbHearing.opponentMemos || "",
    hearingMinutes: dbHearing.hearingMinutes || "",
    attendingLawyerId: dbHearing.attendingLawyerId || null,
    reminderSent24h: dbHearing.reminderSent24h ?? false,
    reminderSent1h: dbHearing.reminderSent1h ?? false,
    googleCalendarEventId: dbHearing.googleCalendarEventId,
    notes: dbHearing.notes || "",
    createdAt: toISOString(dbHearing.createdAt),
    updatedAt: toISOString(dbHearing.updatedAt),
  };
}

// Map DB field task to interface FieldTask
function mapDbFieldTask(dbTask: any): FieldTask {
  return {
    id: dbTask.id,
    title: dbTask.title,
    description: dbTask.description || "",
    taskType: dbTask.taskType,
    caseId: dbTask.caseId,
    consultationId: dbTask.consultationId,
    assignedTo: dbTask.assignedTo,
    assignedBy: dbTask.assignedBy,
    status: dbTask.status,
    priority: dbTask.priority || "متوسط",
    dueDate: dbTask.dueDate,
    completedAt: toISOStringOrNull(dbTask.completedAt),
    completionNotes: dbTask.completionNotes || "",
    proofDescription: dbTask.proofDescription || "",
    proofFileLink: dbTask.proofFileLink || "",
    createdAt: toISOString(dbTask.createdAt),
    updatedAt: toISOString(dbTask.updatedAt),
  };
}

// Map DB contact log to interface ContactLog
function mapDbContactLog(dbLog: any): ContactLog {
  return {
    id: dbLog.id,
    clientId: dbLog.clientId,
    contactType: dbLog.contactType,
    contactDate: dbLog.contactDate,
    nextFollowUpDate: dbLog.nextFollowUpDate,
    followUpStatus: dbLog.followUpStatus,
    notes: dbLog.notes || "",
    communicationType: dbLog.communicationType || null,
    duration: dbLog.duration || null,
    followUpRequired: dbLog.followUpRequired ?? false,
    followUpDate: dbLog.followUpDate || null,
    followUpNotes: dbLog.followUpNotes || null,
    followUpCompleted: dbLog.followUpCompleted ?? false,
    caseId: dbLog.caseId || null,
    createdBy: dbLog.createdBy,
    createdAt: toISOString(dbLog.createdAt),
    updatedAt: toISOString(dbLog.updatedAt),
  };
}

// Map DB notification to interface Notification
function mapDbNotification(dbNotif: any): Notification {
  return {
    id: dbNotif.id,
    type: dbNotif.type,
    priority: dbNotif.priority,
    status: dbNotif.status,
    title: dbNotif.title,
    message: dbNotif.message,
    senderId: dbNotif.senderId,
    senderName: dbNotif.senderName,
    recipientId: dbNotif.recipientId,
    recipientIds: dbNotif.recipientIds,
    relatedType: dbNotif.relatedType,
    relatedId: dbNotif.relatedId,
    isRead: dbNotif.isRead ?? false,
    readAt: toISOStringOrNull(dbNotif.readAt),
    response: dbNotif.response,
    requiresResponse: dbNotif.requiresResponse ?? false,
    scheduledAt: toISOStringOrNull(dbNotif.scheduledAt),
    escalationLevel: dbNotif.escalationLevel ?? 0,
    escalatedTo: dbNotif.escalatedTo,
    autoEscalateAfterHours: dbNotif.autoEscalateAfterHours ?? 24,
    createdAt: toISOString(dbNotif.createdAt),
    updatedAt: toISOString(dbNotif.updatedAt),
  };
}

// Map DB memo to interface Memo
function mapDbMemo(dbMemo: any): Memo {
  return {
    id: dbMemo.id,
    caseId: dbMemo.caseId,
    hearingId: dbMemo.hearingId || null,
    memoType: dbMemo.memoType,
    memoTypeOther: dbMemo.memoTypeOther || "",
    title: dbMemo.title,
    description: dbMemo.description || "",
    status: dbMemo.status,
    priority: dbMemo.priority || "عالي",
    assignedTo: dbMemo.assignedTo,
    createdBy: dbMemo.createdBy,
    deadline: dbMemo.deadline,
    startedAt: toISOStringOrNull(dbMemo.startedAt),
    completedAt: toISOStringOrNull(dbMemo.completedAt),
    submittedAt: toISOStringOrNull(dbMemo.submittedAt),
    content: dbMemo.content || "",
    fileLink: dbMemo.fileLink || "",
    reviewNotes: dbMemo.reviewNotes || "",
    reviewerId: dbMemo.reviewerId || null,
    reviewedAt: toISOStringOrNull(dbMemo.reviewedAt),
    returnCount: dbMemo.returnCount ?? 0,
    isAutoGenerated: dbMemo.isAutoGenerated ?? false,
    autoGenerateReason: dbMemo.autoGenerateReason || "",
    reminderSent3Days: dbMemo.reminderSent3Days ?? false,
    reminderSent1Day: dbMemo.reminderSent1Day ?? false,
    reminderSentOverdue: dbMemo.reminderSentOverdue ?? false,
    createdAt: toISOString(dbMemo.createdAt),
    updatedAt: toISOString(dbMemo.updatedAt),
    // Phase-8 — pause + await-completion. All nullable / boolean-default
    // so legacy rows surface as "not paused, not awaiting".
    pauseReason: dbMemo.pauseReason ?? null,
    pausedBy: dbMemo.pausedBy ?? null,
    pausedAt: toISOStringOrNull(dbMemo.pausedAt),
    awaitingCompletion: dbMemo.awaitingCompletion ?? false,
    savedStage: dbMemo.savedStage ?? null,
    // Phase-9 — review-workflow stage. Legacy rows pre-backfill surface
    // as null; the FE treats null as "no stage yet" (legacy status flow).
    currentStage: dbMemo.currentStage ?? null,
    // Phase-9.1 — designated peer reviewer (set on DRAFTING→INTERNAL_REVIEW).
    internalReviewerId: dbMemo.internalReviewerId ?? null,
    // Phase-9.2 — reason captured on cancellation.
    cancellationReason: dbMemo.cancellationReason ?? null,
  };
}

// Map DB department to interface DepartmentInfo
function mapDbDepartment(dbDept: any): DepartmentInfo {
  return {
    id: dbDept.id,
    name: dbDept.name,
    headId: dbDept.headId,
    createdAt: toISOString(dbDept.createdAt),
  };
}

export class DatabaseStorage implements IStorage {

  // ==================== Users ====================
  
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] ? mapDbUser(result[0]) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0] ? mapDbUser(result[0]) : undefined;
  }

  async getAllUsers(): Promise<User[]> {
    const result = await db.select().from(users);
    return result.map(mapDbUser);
  }

  async getActiveUsers(): Promise<User[]> {
    const result = await db.select().from(users).where(eq(users.isActive, true));
    return result.map(mapDbUser);
  }

  async createUser(data: Partial<User>): Promise<User> {
    const id = data.id || randomUUID();
    const now = new Date();
    const newUser = {
      id,
      username: data.username || "",
      password: data.password || "",
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "employee",
      departmentId: data.departmentId || null,
      isActive: data.isActive ?? true,
      canBeAssignedCases: data.canBeAssignedCases ?? false,
      canBeAssignedConsultations: data.canBeAssignedConsultations ?? false,
      mustChangePassword: data.mustChangePassword ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(users).values(newUser);
    return mapDbUser(newUser);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const existing = await this.getUser(id);
    if (!existing) return undefined;
    
    const { createdAt, updatedAt, ...updateFields } = data;
    await db.update(users).set({
      ...updateFields,
      updatedAt: new Date(),
    }).where(eq(users.id, id));
    
    return this.getUser(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    await db.delete(notifications).where(eq(notifications.recipientId, id));
    await db.delete(notifications).where(eq(notifications.senderId, id));
    await db.delete(delegationsTable).where(eq(delegationsTable.fromUserId, id));
    await db.delete(delegationsTable).where(eq(delegationsTable.toUserId, id));
    await db.delete(supportTickets).where(eq(supportTickets.submittedBy, id));
    await db.delete(supportTickets).where(eq(supportTickets.assignedTo, id));
    await db.delete(fieldTasks).where(eq(fieldTasks.assignedTo, id));
    await db.delete(memos).where(eq(memos.assignedTo, id));
    await db.delete(caseActivityLog).where(eq(caseActivityLog.userId, id));
    await db.execute(sql`UPDATE departments SET head_id = NULL WHERE head_id = ${id}`);
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Cases ====================

  async getAllCases(): Promise<LawCase[]> {
    const result = await db.select().from(lawCases).orderBy(desc(lawCases.updatedAt));
    return result.map(mapDbCase);
  }

  async getCaseById(id: string): Promise<LawCase | undefined> {
    const result = await db.select().from(lawCases).where(eq(lawCases.id, id));
    return result[0] ? mapDbCase(result[0]) : undefined;
  }

  async createCase(data: Partial<LawCase>, createdBy: string): Promise<LawCase> {
    const id = randomUUID();
    const now = new Date();
    // When the user supplies a court case number we use it verbatim — no
    // retry, because regenerating the user's input would silently change
    // it. Auto-generated numbers (nanoid suffix) collide rarely; retry up
    // to 3 times before surfacing a clear error.
    const userSupplied = !!data.courtCaseNumber;
    const baseCase = {
      id,
      clientId: data.clientId || "",
      caseType: data.caseType || "",
      caseTypeOther: data.caseTypeOther || "",
      departmentOther: data.departmentOther || "",
      status: CaseStatus.RECEIVED,
      currentStage: CaseStage.RECEPTION,
      stageHistory: [],
      departmentId: data.departmentId || "",
      assignedLawyers: [],
      primaryLawyerId: data.primaryLawyerId || null,
      responsibleLawyerId: data.responsibleLawyerId || null,
      courtName: data.courtName || "",
      courtCaseNumber: data.courtCaseNumber || "",
      judgeName: data.judgeName || "",
      circuitNumber: data.circuitNumber || "",
      plaintiffName: data.plaintiffName || "",
      opponentName: data.opponentName || "",
      opponentLawyer: data.opponentLawyer || "",
      opponentPhone: data.opponentPhone || "",
      opponentNotes: data.opponentNotes || "",
      whatsappGroupLink: data.whatsappGroupLink || "",
      googleDriveFolderId: data.googleDriveFolderId || "",
      reviewNotes: "",
      reviewDecision: null,
      reviewActionTaken: null,
      priority: data.priority || "متوسط",
      caseClassification: data.caseClassification || CaseClassification.UNDER_STUDY,
      clientRole: (data as any).clientRole ?? null,
      previousHearingsCount: data.previousHearingsCount || 0,
      currentSituation: data.currentSituation || "",
      responseDeadline: data.responseDeadline || null,
      createdBy,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };

    const maxAttempts = userSupplied ? 1 : 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const caseNumber = userSupplied ? data.courtCaseNumber! : generateCaseNumber();
      const newCase = { ...baseCase, caseNumber };
      try {
        if (attempt === 0) {
          console.log("[clientRole][storage:createCase] inserting case with clientRole:", {
            incoming: (data as any).clientRole,
            incomingType: typeof (data as any).clientRole,
            incomingLength: typeof (data as any).clientRole === "string" ? (data as any).clientRole.length : null,
            finalValue: newCase.clientRole,
            caseClassification: newCase.caseClassification,
          });
        }
        await db.insert(lawCases).values(newCase);
        return mapDbCase(newCase);
      } catch (err) {
        lastErr = err;
        if (isUniqueViolationOn(err, "case_number")) {
          if (userSupplied) {
            throw new Error("CASE_NUMBER_EXISTS");
          }
          console.warn("[storage:createCase] case_number collision on attempt", attempt + 1, "of", maxAttempts);
          continue;
        }
        throw err;
      }
    }
    console.error("[storage:createCase] exhausted retries — auto-generated case_number kept colliding", lastErr);
    throw new Error("DUPLICATE_CASE_NUMBER");
  }

  async updateCase(id: string, data: Partial<LawCase>): Promise<LawCase | undefined> {
    const existing = await this.getCaseById(id);
    if (!existing) return undefined;
    
    const { createdAt, updatedAt, closedAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    if (closedAt !== undefined) {
      updateData.closedAt = closedAt ? new Date(closedAt) : null;
    }
    if (updateData.courtCaseNumber && updateData.courtCaseNumber.trim()) {
      updateData.caseNumber = updateData.courtCaseNumber.trim();
    }

    await db.update(lawCases).set(updateData).where(eq(lawCases.id, id));
    return this.getCaseById(id);
  }

  async deleteCase(id: string): Promise<boolean> {
    // جلب معرّفات الجلسات والمذكرات المرتبطة بالقضية
    const relatedHearings = await db.select({ id: hearings.id }).from(hearings).where(eq(hearings.caseId, id));
    const relatedMemos = await db.select({ id: memos.id }).from(memos).where(eq(memos.caseId, id));
    const hearingIds = relatedHearings.map(h => h.id);
    const memoIds = relatedMemos.map(m => m.id);

    // حذف الإشعارات المرتبطة بالجلسات
    if (hearingIds.length > 0) {
      for (const hid of hearingIds) {
        await db.delete(notifications).where(and(eq(notifications.relatedType, "hearing"), eq(notifications.relatedId, hid)));
        await db.delete(attachments).where(and(eq(attachments.entityType, "hearing"), eq(attachments.entityId, hid)));
      }
    }

    // حذف الإشعارات المرتبطة بالمذكرات
    if (memoIds.length > 0) {
      for (const mid of memoIds) {
        await db.delete(notifications).where(and(eq(notifications.relatedType, "memo"), eq(notifications.relatedId, mid)));
        await db.delete(attachments).where(and(eq(attachments.entityType, "memo"), eq(attachments.entityId, mid)));
      }
    }

    // حذف الجلسات والمذكرات والسجلات المرتبطة
    await db.delete(hearings).where(eq(hearings.caseId, id));
    await db.delete(memos).where(eq(memos.caseId, id));
    await db.delete(caseActivityLog).where(eq(caseActivityLog.caseId, id));
    await db.delete(caseNotes).where(eq(caseNotes.caseId, id));
    await db.delete(legalDeadlines).where(eq(legalDeadlines.caseId, id));
    await db.delete(attachments).where(and(eq(attachments.entityType, "case"), eq(attachments.entityId, id)));
    await db.delete(fieldTasks).where(eq(fieldTasks.caseId, id));
    await db.delete(notifications).where(and(eq(notifications.relatedType, "case"), eq(notifications.relatedId, id)));
    const result = await db.delete(lawCases).where(eq(lawCases.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Clients ====================

  async getAllClients(): Promise<Client[]> {
    const result = await db.select().from(clients);
    return result.map(mapDbClient);
  }

  async getClientById(id: string): Promise<Client | undefined> {
    const result = await db.select().from(clients).where(eq(clients.id, id));
    return result[0] ? mapDbClient(result[0]) : undefined;
  }

  async createClient(data: Partial<Client>, createdBy: string): Promise<Client> {
    const id = randomUUID();
    const now = new Date();
    
    const newClient = {
      id,
      clientType: data.clientType || "فرد",
      individualName: data.individualName || null,
      nationalId: data.nationalId || null,
      phone: data.phone || "",
      companyName: data.companyName || null,
      commercialRegister: data.commercialRegister || null,
      representativeName: data.representativeName || null,
      representativeTitle: data.representativeTitle || null,
      companyPhone: data.companyPhone || null,
      email: data.email || "",
      address: data.address || "",
      notes: data.notes || "",
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
    
    await db.insert(clients).values(newClient);
    return mapDbClient(newClient);
  }

  async updateClient(id: string, data: Partial<Client>): Promise<Client | undefined> {
    const existing = await this.getClientById(id);
    if (!existing) return undefined;
    
    const { createdAt, updatedAt, ...updateFields } = data;
    await db.update(clients).set({
      ...updateFields,
      updatedAt: new Date(),
    }).where(eq(clients.id, id));
    
    return this.getClientById(id);
  }

  async deleteClient(id: string): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Consultations ====================

  async getAllConsultations(): Promise<Consultation[]> {
    const result = await db.select().from(consultations);
    return result.map(mapDbConsultation);
  }

  async getConsultationById(id: string): Promise<Consultation | undefined> {
    const result = await db.select().from(consultations).where(eq(consultations.id, id));
    return result[0] ? mapDbConsultation(result[0]) : undefined;
  }

  async createConsultation(data: Partial<Consultation>, createdBy: string): Promise<Consultation> {
    const id = randomUUID();
    const now = new Date();

    // Phase-4: category drives the SLA. Default to STANDARD (3 days) when
    // not supplied so older clients keep working. expectedDeliveryDate is
    // computed once at creation — there's no manual override (per spec).
    const incomingCategory = (data as any).category as ConsultationCategoryValue | undefined;
    const category: ConsultationCategoryValue =
      incomingCategory && (Object.values(ConsultationCategory) as string[]).includes(incomingCategory)
        ? incomingCategory
        : ConsultationCategory.STANDARD;
    const slaDays = ConsultationCategorySLADays[category];
    const expectedDeliveryDate = new Date(now.getTime() + slaDays * 24 * 60 * 60 * 1000);

    // Pre-rebuild this method conflated the two: it wrote the stage value
    // ("استلام") into the status column. Status now is a separate
    // lifecycle enum (active | converted | closed) per spec §3.1.2;
    // currentStage carries the workflow position. Keep them apart at the
    // insert site so the column defaults aren't the only line of defence.
    const baseConsultation = {
      id,
      clientId: data.clientId || "",
      consultationType: data.consultationType || "عام",
      deliveryType: data.deliveryType || "مكتوبة",
      currentStage: ConsultationStage.RECEIVED,
      status: ConsultationStatus.ACTIVE,
      departmentId: data.departmentId || "",
      assignedTo: data.assignedTo || null,
      questionSummary: data.questionSummary || "",
      response: data.response || "",
      convertedToCaseId: null,
      whatsappGroupLink: data.whatsappGroupLink || "",
      googleDriveFolderId: data.googleDriveFolderId || "",
      reviewNotes: "",
      reviewDecision: null,
      category,
      expectedDeliveryDate,
      createdBy,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };

    // Phase-6: insert the consultation row and the "created" activity row
    // in a single transaction so the activity log can never get out of
    // sync with the actual state. consultationNumber is auto-generated and
    // can collide on its 6-char nanoid suffix — retry up to 3 times before
    // surfacing a clear error to the caller.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const consultationNumber = generateConsultationNumber();
      const newConsultation = { ...baseConsultation, consultationNumber };
      try {
        await db.transaction(async (tx) => {
          await tx.insert(consultations).values(newConsultation);
          await tx.insert(consultationActivityLog).values({
            id: randomUUID(),
            consultationId: id,
            activityType: ConsultationActivityType.CREATED,
            description: "تم إنشاء الاستشارة",
            metadata: {},
            performedBy: createdBy,
            performedAt: now,
          } as any);
        });
        return mapDbConsultation(newConsultation);
      } catch (err) {
        lastErr = err;
        if (isUniqueViolationOn(err, "consultation_number")) {
          console.warn("[storage:createConsultation] consultation_number collision on attempt", attempt + 1, "of 3");
          continue;
        }
        throw err;
      }
    }
    console.error("[storage:createConsultation] exhausted retries — consultation_number kept colliding", lastErr);
    throw new Error("DUPLICATE_CONSULTATION_NUMBER");
  }

  async updateConsultation(id: string, data: Partial<Consultation>): Promise<Consultation | undefined> {
    const existing = await this.getConsultationById(id);
    if (!existing) return undefined;

    const { createdAt, updatedAt, closedAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    if (closedAt !== undefined) {
      updateData.closedAt = closedAt ? new Date(closedAt) : null;
    }
    await db.update(consultations).set(updateData).where(eq(consultations.id, id));

    return this.getConsultationById(id);
  }

  // Phase-6 — atomic update + activity log. Used by workflow handlers
  // (assign, advance-stage, return-stage, early-close) where the spec
  // requires the activity row to be inserted in the same DB transaction
  // as the consultation update. Returns undefined when the row is gone.
  async updateConsultationAndLog(
    id: string,
    data: Partial<Consultation>,
    activity: { activityType: string; description: string; metadata?: Record<string, any>; performedBy: string | null },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;

      const { createdAt, updatedAt, closedAt, ...updateFields } = data;
      const now = new Date();
      const updateData: any = { ...updateFields, updatedAt: now };
      if (closedAt !== undefined) {
        updateData.closedAt = closedAt ? new Date(closedAt) : null;
      }
      await tx.update(consultations).set(updateData).where(eq(consultations.id, id));

      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: activity.activityType,
        description: activity.description,
        metadata: activity.metadata ?? {},
        performedBy: activity.performedBy,
        performedAt: now,
      } as any);

      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  // Phase-8 — pause / unpause. Atomic update + activity log insert in a
  // single transaction so the consultation row and its log entry can never
  // drift. Uses the dedicated path (not updateConsultationAndLog) because
  // pausedAt is a Date column that needs explicit conversion. The route
  // layer enforces the active/paused gate before calling — these helpers
  // assume the caller already checked.
  async pauseConsultation(
    id: string,
    input: { reason: string; performedBy: string },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(consultations).set({
        status: ConsultationStatus.PAUSED,
        pauseReason: input.reason,
        pausedBy: input.performedBy,
        pausedAt: now,
        updatedAt: now,
      } as any).where(eq(consultations.id, id));
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.PAUSED,
        description: `تم تعليق الاستشارة — السبب: ${input.reason}`,
        metadata: { reason: input.reason },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  // Phase-8 — await-completion / resume-from-completion / skip-completion.
  // Awaiting-completion is an orthogonal "park here, missing data" detour:
  // saves the current stage, switches to RECEIVED_PENDING_COMPLETION, and
  // sets awaiting_completion=true. Resume restores the saved stage. Skip
  // is the explicit "no upload needed, jump to STUDY" action available
  // only from RECEIVED_PENDING_COMPLETION when NOT in awaiting mode (the
  // two paths don't conflict because awaiting=true rows are never
  // advanced via the normal mechanism).
  async awaitConsultationCompletion(
    id: string,
    input: { reason: string; performedBy: string },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      await tx.update(consultations).set({
        currentStage: ConsultationStage.RECEIVED_PENDING_COMPLETION,
        savedStage: fromStage,
        awaitingCompletion: true,
        updatedAt: now,
      } as any).where(eq(consultations.id, id));
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.AWAIT_COMPLETION,
        description: `بانتظار استكمال المرفقات والبيانات — السبب: ${input.reason}`,
        metadata: { reason: input.reason, savedStage: fromStage },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  async resumeConsultationFromCompletion(
    id: string,
    input: { notes?: string; performedBy: string },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;
      const now = new Date();
      // Fall back to STUDY if saved_stage was never recorded (legacy /
      // hand-edited rows). The route layer already enforces awaiting=true
      // before calling, so saved_stage really should be set, but defending
      // here keeps the transaction from corrupting state on edge data.
      const targetStage = existing.savedStage || ConsultationStage.STUDY;
      await tx.update(consultations).set({
        currentStage: targetStage,
        savedStage: null,
        awaitingCompletion: false,
        updatedAt: now,
      } as any).where(eq(consultations.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.RESUME_FROM_COMPLETION,
        description: notes
          ? `العودة من الاستكمال إلى ${targetStage} — ${notes}`
          : `العودة من الاستكمال إلى ${targetStage}`,
        metadata: { notes: notes || undefined, returnedToStage: targetStage },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  async skipConsultationCompletion(
    id: string,
    input: { performedBy: string },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(consultations).set({
        currentStage: ConsultationStage.STUDY,
        updatedAt: now,
      } as any).where(eq(consultations.id, id));
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.COMPLETION_SKIPPED,
        description: "تم تجاوز مرحلة الاستكمال والانتقال مباشرة إلى دراسة",
        metadata: {},
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  async unpauseConsultation(
    id: string,
    input: { notes?: string; performedBy: string },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(consultations).set({
        status: ConsultationStatus.ACTIVE,
        pauseReason: null,
        pausedBy: null,
        pausedAt: null,
        updatedAt: now,
      } as any).where(eq(consultations.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.UNPAUSED,
        description: notes ? `تم إلغاء التعليق — ${notes}` : "تم إلغاء التعليق",
        metadata: notes ? { notes } : {},
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  async deleteConsultation(id: string): Promise<boolean> {
    await db.delete(attachments).where(and(eq(attachments.entityType, "consultation"), eq(attachments.entityId, id)));
    await db.delete(fieldTasks).where(eq(fieldTasks.consultationId, id));
    await db.delete(notifications).where(and(eq(notifications.relatedType, "consultation"), eq(notifications.relatedId, id)));
    // Phase-6: activity-log rows. The SQL FK is ON DELETE CASCADE so this
    // is belt-and-braces — keeps behavior consistent if the FK is dropped.
    await db.delete(consultationActivityLog).where(eq(consultationActivityLog.consultationId, id));
    const result = await db.delete(consultations).where(eq(consultations.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Hearings ====================

  async getAllHearings(): Promise<Hearing[]> {
    const result = await db.select().from(hearings)
      .orderBy(asc(hearings.hearingDate), asc(hearings.hearingTime));
    return result.map(mapDbHearing);
  }

  async getHearingsByCase(caseId: string): Promise<Hearing[]> {
    const result = await db.select().from(hearings)
      .where(eq(hearings.caseId, caseId))
      .orderBy(asc(hearings.hearingDate), asc(hearings.hearingTime));
    return result.map(mapDbHearing);
  }

  async getHearingById(id: string): Promise<Hearing | undefined> {
    const result = await db.select().from(hearings).where(eq(hearings.id, id));
    return result[0] ? mapDbHearing(result[0]) : undefined;
  }

  async createHearing(data: Partial<Hearing>): Promise<Hearing> {
    const id = randomUUID();
    const now = new Date();
    
    const newHearing = {
      id,
      caseId: data.caseId || "",
      hearingDate: data.hearingDate || "",
      hearingTime: data.hearingTime || "",
      hearingType: data.hearingType || "محكمة",
      courtName: data.courtName || "المحكمة العامة",
      courtNameOther: data.courtNameOther || null,
      courtRoom: data.courtRoom || "",
      status: data.status || "قادمة",
      result: data.result || null,
      resultDetails: data.resultDetails || "",
      judgmentSide: null,
      judgmentFinal: null,
      objectionFeasible: null,
      objectionDeadline: null,
      objectionStatus: null,
      nextHearingDate: null,
      nextHearingTime: null,
      responseRequired: data.responseRequired || false,
      memoRequired: (data as any).memoRequired || false,
      opponentResponseRequired: (data as any).opponentResponseRequired || false,
      hearingReport: "",
      recommendations: "",
      nextSteps: "",
      contactCompleted: false,
      reportCompleted: false,
      adminTasksCreated: false,
      opponentMemos: "",
      hearingMinutes: "",
      reminderSent24h: false,
      reminderSent1h: false,
      attendingLawyerId: data.attendingLawyerId || null,
      googleCalendarEventId: null,
      notes: data.notes || "",
      createdAt: now,
      updatedAt: now,
    };
    
    await db.insert(hearings).values(newHearing);
    return mapDbHearing(newHearing);
  }

  async updateHearing(id: string, data: Partial<Hearing>): Promise<Hearing | undefined> {
    const existing = await this.getHearingById(id);
    if (!existing) return undefined;
    
    const { createdAt, updatedAt, ...updateFields } = data;
    await db.update(hearings).set({
      ...updateFields,
      updatedAt: new Date(),
    }).where(eq(hearings.id, id));
    
    return this.getHearingById(id);
  }

  async deleteHearing(id: string): Promise<boolean> {
    const result = await db.delete(hearings).where(eq(hearings.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Field Tasks ====================

  async getAllFieldTasks(): Promise<FieldTask[]> {
    const result = await db.select().from(fieldTasks);
    return result.map(mapDbFieldTask);
  }

  async getFieldTasksByCase(caseId: string): Promise<FieldTask[]> {
    const result = await db.select().from(fieldTasks).where(eq(fieldTasks.caseId, caseId));
    return result.map(mapDbFieldTask);
  }

  async getFieldTaskById(id: string): Promise<FieldTask | undefined> {
    const result = await db.select().from(fieldTasks).where(eq(fieldTasks.id, id));
    return result[0] ? mapDbFieldTask(result[0]) : undefined;
  }

  async createFieldTask(data: Partial<FieldTask>, assignedBy: string): Promise<FieldTask> {
    const id = randomUUID();
    const now = new Date();
    
    const newTask = {
      id,
      title: data.title || "",
      description: data.description || "",
      taskType: data.taskType || "أخرى",
      caseId: data.caseId || null,
      consultationId: data.consultationId || null,
      assignedTo: data.assignedTo || "",
      assignedBy,
      status: "قيد_الانتظار",
      priority: data.priority || "متوسط",
      dueDate: data.dueDate || "",
      completedAt: null,
      completionNotes: "",
      proofDescription: "",
      proofFileLink: "",
      createdAt: now,
      updatedAt: now,
    };
    
    await db.insert(fieldTasks).values(newTask);
    return mapDbFieldTask(newTask);
  }

  async updateFieldTask(id: string, data: Partial<FieldTask>): Promise<FieldTask | undefined> {
    const existing = await this.getFieldTaskById(id);
    if (!existing) return undefined;
    
    const { createdAt, updatedAt, completedAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    if (completedAt) {
      updateData.completedAt = new Date(completedAt);
    }
    await db.update(fieldTasks).set(updateData).where(eq(fieldTasks.id, id));
    
    return this.getFieldTaskById(id);
  }

  async deleteFieldTask(id: string): Promise<boolean> {
    const result = await db.delete(fieldTasks).where(eq(fieldTasks.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Contact Logs ====================

  async getAllContactLogs(): Promise<ContactLog[]> {
    const result = await db.select().from(contactLogs);
    return result.map(mapDbContactLog);
  }

  async getContactLogsByClient(clientId: string): Promise<ContactLog[]> {
    const result = await db.select().from(contactLogs).where(eq(contactLogs.clientId, clientId));
    return result.map(mapDbContactLog);
  }

  async createContactLog(data: Partial<ContactLog>, createdBy: string): Promise<ContactLog> {
    const id = randomUUID();
    const now = new Date();
    
    const newLog = {
      id,
      clientId: data.clientId || "",
      contactType: data.contactType || "اتصال_هاتفي",
      contactDate: data.contactDate || new Date().toISOString().split('T')[0],
      nextFollowUpDate: data.nextFollowUpDate || null,
      followUpStatus: data.followUpStatus || "بانتظار_المتابعة",
      notes: data.notes || "",
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
    
    await db.insert(contactLogs).values(newLog);
    return mapDbContactLog(newLog);
  }

  async updateContactLog(id: string, data: Partial<ContactLog>): Promise<ContactLog | undefined> {
    const existing = await db.select().from(contactLogs).where(eq(contactLogs.id, id));
    if (!existing[0]) return undefined;
    
    const { createdAt, updatedAt, ...updateFields } = data;
    await db.update(contactLogs).set({
      ...updateFields,
      updatedAt: new Date(),
    }).where(eq(contactLogs.id, id));
    
    const updated = await db.select().from(contactLogs).where(eq(contactLogs.id, id));
    return updated[0] ? mapDbContactLog(updated[0]) : undefined;
  }

  async deleteContactLog(id: string): Promise<boolean> {
    const result = await db.delete(contactLogs).where(eq(contactLogs.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Notifications ====================

  async getAllNotifications(): Promise<Notification[]> {
    const result = await db.select().from(notifications);
    return result.map(mapDbNotification);
  }

  async getRecentNotifications(limit: number): Promise<Notification[]> {
    const result = await db.select().from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return result.map(mapDbNotification);
  }

  async getNotificationsByRecipient(recipientId: string): Promise<Notification[]> {
    const result = await db.select().from(notifications).where(eq(notifications.recipientId, recipientId));
    return result.map(mapDbNotification);
  }

  async createNotification(data: Partial<Notification>): Promise<Notification> {
    const id = randomUUID();
    const now = new Date();
    
    const newNotification = {
      id,
      type: data.type || "general_alert",
      priority: data.priority || "medium",
      status: data.status || "pending",
      title: data.title || "",
      message: data.message || "",
      senderId: data.senderId || "",
      senderName: data.senderName || "",
      recipientId: data.recipientId || "",
      recipientIds: data.recipientIds || null,
      relatedType: data.relatedType || null,
      relatedId: data.relatedId || null,
      isRead: false,
      readAt: null,
      response: data.response || null,
      requiresResponse: data.requiresResponse ?? false,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      escalationLevel: 0,
      escalatedTo: null,
      autoEscalateAfterHours: data.autoEscalateAfterHours ?? 24,
      createdAt: now,
      updatedAt: now,
    };
    
    await db.insert(notifications).values(newNotification);
    return mapDbNotification(newNotification);
  }

  async getNotificationById(id: string): Promise<Notification | undefined> {
    const result = await db.select().from(notifications).where(eq(notifications.id, id));
    return result[0] ? mapDbNotification(result[0]) : undefined;
  }

  async updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined> {
    const existing = await db.select().from(notifications).where(eq(notifications.id, id));
    if (!existing[0]) return undefined;
    
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.readAt) {
      updateData.readAt = new Date(data.readAt);
    }
    
    await db.update(notifications).set(updateData).where(eq(notifications.id, id));
    
    const updated = await db.select().from(notifications).where(eq(notifications.id, id));
    return updated[0] ? mapDbNotification(updated[0]) : undefined;
  }

  async deleteNotification(id: string): Promise<boolean> {
    const result = await db.delete(notifications).where(eq(notifications.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Departments ====================

  async getAllDepartments(): Promise<DepartmentInfo[]> {
    const result = await db.select().from(departments);
    return result.map(mapDbDepartment);
  }

  async getDepartmentById(id: string): Promise<DepartmentInfo | undefined> {
    const result = await db.select().from(departments).where(eq(departments.id, id));
    return result[0] ? mapDbDepartment(result[0]) : undefined;
  }

  async updateDepartment(id: string, data: Partial<DepartmentInfo>): Promise<DepartmentInfo | undefined> {
    if ("headId" in data) {
      const newHeadId = data.headId ?? null;
      if (newHeadId === null) {
        await db.execute(sql`UPDATE departments SET head_id = NULL WHERE id = ${id}`);
      } else {
        await db.execute(sql`UPDATE departments SET head_id = ${newHeadId} WHERE id = ${id}`);
      }
    }
    if ("name" in data && data.name) {
      await db.execute(sql`UPDATE departments SET name = ${data.name} WHERE id = ${id}`);
    }
    return this.getDepartmentById(id);
  }

  // ==================== Memos ====================

  async getAllMemos(): Promise<Memo[]> {
    const result = await db.select().from(memos).orderBy(memos.deadline);
    return result.map(mapDbMemo);
  }

  async getMemoById(id: string): Promise<Memo | undefined> {
    const result = await db.select().from(memos).where(eq(memos.id, id));
    return result[0] ? mapDbMemo(result[0]) : undefined;
  }

  async getMemosByCase(caseId: string): Promise<Memo[]> {
    const result = await db.select().from(memos).where(eq(memos.caseId, caseId));
    return result.map(mapDbMemo);
  }

  async getMemosByHearing(hearingId: string): Promise<Memo[]> {
    const result = await db.select().from(memos).where(eq(memos.hearingId, hearingId));
    return result.map(mapDbMemo);
  }

  async createMemo(data: Partial<Memo>): Promise<Memo> {
    const id = data.id || randomUUID();
    const now = new Date();

    const newMemo = {
      id,
      caseId: data.caseId || "",
      hearingId: data.hearingId || null,
      memoType: data.memoType || "أخرى",
      memoTypeOther: data.memoTypeOther || "",
      title: data.title || "",
      description: data.description || "",
      status: data.status || "لم_تبدأ",
      priority: data.priority || "عالي",
      assignedTo: data.assignedTo || "",
      createdBy: data.createdBy || "",
      deadline: data.deadline || "",
      startedAt: null,
      completedAt: null,
      submittedAt: null,
      content: data.content || "",
      fileLink: data.fileLink || "",
      reviewNotes: "",
      reviewerId: null,
      reviewedAt: null,
      returnCount: 0,
      isAutoGenerated: data.isAutoGenerated ?? false,
      autoGenerateReason: data.autoGenerateReason || "",
      reminderSent3Days: false,
      reminderSent1Day: false,
      reminderSentOverdue: false,
      createdAt: now,
      updatedAt: now,
      // Phase-9 — new memos enter the review workflow at RECEIVED.
      // Legacy (status-only) callers are unaffected; the column is
      // nullable in the DB so this default just means "use the new flow".
      currentStage: data.currentStage || "استلام",
    };

    await db.insert(memos).values(newMemo);
    return mapDbMemo(newMemo);
  }

  async updateMemo(id: string, data: Partial<Memo>): Promise<Memo | undefined> {
    const existing = await this.getMemoById(id);
    if (!existing) return undefined;

    const { createdAt, updatedAt, startedAt, completedAt, submittedAt, reviewedAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    if (startedAt) updateData.startedAt = new Date(startedAt);
    if (completedAt) updateData.completedAt = new Date(completedAt);
    if (submittedAt) updateData.submittedAt = new Date(submittedAt);
    if (reviewedAt) updateData.reviewedAt = new Date(reviewedAt);

    await db.update(memos).set(updateData).where(eq(memos.id, id));
    return this.getMemoById(id);
  }

  async deleteMemo(id: string): Promise<boolean> {
    // Phase-8 — clear activity log rows first. The SQL FK is ON DELETE
    // CASCADE so this is belt-and-braces; keeps behavior consistent if
    // the FK is dropped.
    await db.delete(memoActivityLog).where(eq(memoActivityLog.memoId, id));
    const result = await db.delete(memos).where(eq(memos.id, id)).returning();
    return result.length > 0;
  }

  // Phase-8 — pause / unpause on memos. Atomic update + memo_activity_log
  // insert in one transaction. Memo status is left alone (it's workflow
  // state, not lifecycle); pause is detected via paused_at IS NOT NULL.
  async pauseMemo(
    id: string,
    input: { reason: string; performedBy: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(memos).set({
        pauseReason: input.reason,
        pausedBy: input.performedBy,
        pausedAt: now,
        updatedAt: now,
      } as any).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.PAUSED,
        description: `تم تعليق المذكرة — السبب: ${input.reason}`,
        metadata: { reason: input.reason },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  // Phase-8 — await-completion / resume on memos. Memos don't have a
  // dedicated "pending completion" status (they have no stage flow);
  // instead awaiting_completion=true is purely a flag and saved_stage
  // captures the memo's status as a snapshot for symmetry. The memo's
  // workflow status is intentionally NOT changed by these endpoints.
  async awaitMemoCompletion(
    id: string,
    input: { reason: string; performedBy: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(memos).set({
        awaitingCompletion: true,
        savedStage: existing.status,
        updatedAt: now,
      } as any).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.AWAIT_COMPLETION,
        description: `بانتظار استكمال المرفقات والبيانات — السبب: ${input.reason}`,
        metadata: { reason: input.reason, savedStage: existing.status },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  async resumeMemoFromCompletion(
    id: string,
    input: { notes?: string; performedBy: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(memos).set({
        awaitingCompletion: false,
        savedStage: null,
        updatedAt: now,
      } as any).where(eq(memos.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.RESUME_FROM_COMPLETION,
        description: notes ? `العودة من الاستكمال — ${notes}` : "العودة من الاستكمال",
        metadata: notes ? { notes } : {},
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  async unpauseMemo(
    id: string,
    input: { notes?: string; performedBy: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(memos).set({
        pauseReason: null,
        pausedBy: null,
        pausedAt: null,
        updatedAt: now,
      } as any).where(eq(memos.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.UNPAUSED,
        description: notes ? `تم إلغاء تعليق المذكرة — ${notes}` : "تم إلغاء تعليق المذكرة",
        metadata: notes ? { notes } : {},
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  // Phase-8 — memo activity log readers. Mirrors getConsultationActivities.
  async getMemoActivities(memoId: string): Promise<MemoActivity[]> {
    const rows = await db.select().from(memoActivityLog)
      .where(eq(memoActivityLog.memoId, memoId))
      .orderBy(asc(memoActivityLog.performedAt));
    return rows.map((row) => ({
      id: row.id,
      memoId: row.memoId,
      activityType: row.activityType,
      description: row.description,
      metadata: (row.metadata as Record<string, any>) ?? {},
      performedBy: row.performedBy ?? null,
      performedAt: toISOString(row.performedAt),
    }));
  }

  // ==================== Memo workflow helpers (Phase-9) ====================
  // Mirror the consultation versions. Each helper that mutates a memo
  // also writes a memo_activity_log row inside the same transaction so
  // the log can never drift from the row.

  async updateMemoAndLog(
    id: string,
    data: Partial<Memo>,
    activity: { activityType: string; description: string; metadata?: Record<string, any>; performedBy: string | null },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;

      // Strip server-managed timestamp fields; date fields are coerced
      // explicitly for the columns that are real timestamp types.
      const { createdAt, updatedAt, startedAt, completedAt, submittedAt, reviewedAt, pausedAt, ...updateFields } = data;
      const now = new Date();
      const updateData: any = { ...updateFields, updatedAt: now };
      if (startedAt) updateData.startedAt = new Date(startedAt);
      if (completedAt) updateData.completedAt = new Date(completedAt);
      if (submittedAt) updateData.submittedAt = new Date(submittedAt);
      if (reviewedAt) updateData.reviewedAt = new Date(reviewedAt);
      if (pausedAt !== undefined) updateData.pausedAt = pausedAt ? new Date(pausedAt) : null;

      await tx.update(memos).set(updateData).where(eq(memos.id, id));

      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: activity.activityType,
        description: activity.description,
        metadata: activity.metadata ?? {},
        performedBy: activity.performedBy,
        performedAt: now,
      } as any);

      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  async recordMemoInternalReview(input: {
    memoId: string;
    reviewerId: string;
    decision: string;
    notes: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ review: MemoReview; memo: Memo }> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [reviewRow] = await tx.insert(memoReviews).values({
        id: randomUUID(),
        memoId: input.memoId,
        reviewerId: input.reviewerId,
        decision: input.decision,
        notes: input.notes,
        createdAt: now,
      } as any).returning();

      await tx.update(memos)
        .set({ currentStage: input.nextStage, updatedAt: now } as any)
        .where(eq(memos.id, input.memoId));

      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: input.memoId,
        activityType: MemoActivityType.INTERNAL_REVIEW,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      } as any);

      const [updatedMemo] = await tx.select().from(memos).where(eq(memos.id, input.memoId));
      if (!updatedMemo) throw new Error("MEMO_NOT_FOUND");

      return {
        review: {
          id: reviewRow.id,
          memoId: reviewRow.memoId,
          reviewerId: reviewRow.reviewerId,
          decision: reviewRow.decision,
          notes: reviewRow.notes ?? "",
          createdAt: toISOString(reviewRow.createdAt),
        },
        memo: mapDbMemo(updatedMemo),
      };
    });
  }

  async recordMemoCommitteeDecision(input: {
    memoId: string;
    decision: string;
    notes: string;
    decidedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ decision: MemoCommitteeDecision; memo: Memo }> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [decisionRow] = await tx.insert(memoCommitteeDecisions).values({
        id: randomUUID(),
        memoId: input.memoId,
        decision: input.decision,
        notes: input.notes,
        decidedBy: input.decidedBy,
        decidedAt: now,
      } as any).returning();

      await tx.update(memos)
        .set({ currentStage: input.nextStage, updatedAt: now } as any)
        .where(eq(memos.id, input.memoId));

      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: input.memoId,
        activityType: MemoActivityType.COMMITTEE_DECISION,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      } as any);

      const [updatedMemo] = await tx.select().from(memos).where(eq(memos.id, input.memoId));
      if (!updatedMemo) throw new Error("MEMO_NOT_FOUND");

      return {
        decision: {
          id: decisionRow.id,
          memoId: decisionRow.memoId,
          decision: decisionRow.decision,
          notes: decisionRow.notes ?? "",
          decidedBy: decisionRow.decidedBy,
          decidedAt: toISOString(decisionRow.decidedAt),
        },
        memo: mapDbMemo(updatedMemo),
      };
    });
  }

  async recordMemoNoteOutcome(input: {
    memoId: string;
    outcome: string;
    notes: string;
    recordedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ outcome: MemoNoteOutcome; memo: Memo }> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [outcomeRow] = await tx.insert(memoNoteOutcomes).values({
        id: randomUUID(),
        memoId: input.memoId,
        outcome: input.outcome,
        notes: input.notes,
        recordedBy: input.recordedBy,
        recordedAt: now,
      } as any).returning();

      await tx.update(memos)
        .set({ currentStage: input.nextStage, updatedAt: now } as any)
        .where(eq(memos.id, input.memoId));

      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: input.memoId,
        activityType: MemoActivityType.TAKE_NOTES_OUTCOME,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      } as any);

      const [updatedMemo] = await tx.select().from(memos).where(eq(memos.id, input.memoId));
      if (!updatedMemo) throw new Error("MEMO_NOT_FOUND");

      return {
        outcome: {
          id: outcomeRow.id,
          memoId: outcomeRow.memoId,
          outcome: outcomeRow.outcome,
          notes: outcomeRow.notes ?? "",
          recordedBy: outcomeRow.recordedBy,
          recordedAt: toISOString(outcomeRow.recordedAt),
        },
        memo: mapDbMemo(updatedMemo),
      };
    });
  }

  async getMemoReviews(memoId: string): Promise<MemoReview[]> {
    const rows = await db.select().from(memoReviews)
      .where(eq(memoReviews.memoId, memoId))
      .orderBy(asc(memoReviews.createdAt));
    return rows.map(r => ({
      id: r.id,
      memoId: r.memoId,
      reviewerId: r.reviewerId,
      decision: r.decision,
      notes: r.notes ?? "",
      createdAt: toISOString(r.createdAt),
    }));
  }

  async getMemoCommitteeDecisions(memoId: string): Promise<MemoCommitteeDecision[]> {
    const rows = await db.select().from(memoCommitteeDecisions)
      .where(eq(memoCommitteeDecisions.memoId, memoId))
      .orderBy(asc(memoCommitteeDecisions.decidedAt));
    return rows.map(r => ({
      id: r.id,
      memoId: r.memoId,
      decision: r.decision,
      notes: r.notes ?? "",
      decidedBy: r.decidedBy,
      decidedAt: toISOString(r.decidedAt),
    }));
  }

  async getMemoNoteOutcomes(memoId: string): Promise<MemoNoteOutcome[]> {
    const rows = await db.select().from(memoNoteOutcomes)
      .where(eq(memoNoteOutcomes.memoId, memoId))
      .orderBy(asc(memoNoteOutcomes.recordedAt));
    return rows.map(r => ({
      id: r.id,
      memoId: r.memoId,
      outcome: r.outcome,
      notes: r.notes ?? "",
      recordedBy: r.recordedBy,
      recordedAt: toISOString(r.recordedAt),
    }));
  }

  // Phase-9.2 — atomic cancel. Mirrors pauseMemo's shape: update the
  // memo row, then insert the memo_activity_log entry in the same
  // transaction so the timeline can never drift from the row.
  async cancelMemo(
    id: string,
    input: { reason: string; performedBy: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(memos).set({
        status: "ملغاة",
        cancellationReason: input.reason,
        updatedAt: now,
      } as any).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.CANCELLED,
        description: `تم إلغاء المذكرة — السبب: ${input.reason}`,
        metadata: { reason: input.reason },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  async returnMemoToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const truncated = input.notes ? input.notes.slice(0, 120) : "";
      await tx.update(memos).set({
        currentStage: MemoStage.COMMITTEE,
        updatedAt: now,
      } as any).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.RETURNED_TO_COMMITTEE,
        description: truncated
          ? `إعادة للجنة المراجعة — ${truncated}`
          : "إعادة للجنة المراجعة",
        metadata: { notes: input.notes },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  // ==================== Attachments ====================

  async getAttachmentsByEntity(entityType: string, entityId: string): Promise<Attachment[]> {
    const result = await db.select().from(attachments)
      .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)));
    return result
      .map(a => ({
        id: a.id,
        entityType: a.entityType,
        entityId: a.entityId,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType || "",
        fileSize: a.fileSize || 0,
        uploadedBy: a.uploadedBy,
        createdAt: toISOString(a.createdAt),
      }));
  }

  async createAttachment(data: Partial<Attachment>): Promise<Attachment> {
    const id = data.id || randomUUID();
    const result = await db.insert(attachments).values({
      id,
      entityType: data.entityType!,
      entityId: data.entityId!,
      fileName: data.fileName!,
      fileUrl: data.fileUrl!,
      fileType: data.fileType || "",
      fileSize: data.fileSize || 0,
      uploadedBy: data.uploadedBy!,
    }).returning();
    const a = result[0];
    return {
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileType: a.fileType || "",
      fileSize: a.fileSize || 0,
      uploadedBy: a.uploadedBy,
      createdAt: toISOString(a.createdAt),
    };
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const result = await db.delete(attachments).where(eq(attachments.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Support Tickets ====================

  async getAllSupportTickets(): Promise<SupportTicket[]> {
    return await db.select().from(supportTickets).orderBy(supportTickets.createdAt);
  }

  async getSupportTicketById(id: string): Promise<SupportTicket | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return ticket;
  }

  async getSupportTicketsByUser(userId: string): Promise<SupportTicket[]> {
    return await db.select().from(supportTickets).where(eq(supportTickets.submittedBy, userId)).orderBy(supportTickets.createdAt);
  }

  async createSupportTicket(data: Partial<SupportTicket>): Promise<SupportTicket> {
    const id = randomUUID();
    const ticketNumber = await this.getNextTicketNumber();
    const [ticket] = await db.insert(supportTickets).values({
      id,
      ticketNumber,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return ticket;
  }

  async updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const [ticket] = await db.update(supportTickets)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  }

  async deleteSupportTicket(id: string): Promise<boolean> {
    const result = await db.delete(supportTickets).where(eq(supportTickets.id, id)).returning();
    return result.length > 0;
  }

  async getNextTicketNumber(): Promise<string> {
    const allTickets = await db.select().from(supportTickets);
    const maxNum = allTickets.reduce((max, t) => {
      const num = parseInt(t.ticketNumber.replace("TK-", ""), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    return `TK-${String(maxNum + 1).padStart(4, "0")}`;
  }

  // ==================== Saved Filters ====================

  async getSavedFiltersByUser(userId: string, pageType: string): Promise<SavedFilter[]> {
    return await db.select().from(savedFilters)
      .where(and(eq(savedFilters.userId, userId), eq(savedFilters.pageType, pageType)))
      .orderBy(desc(savedFilters.createdAt));
  }

  async getSavedFilterById(id: string): Promise<SavedFilter | undefined> {
    const [row] = await db.select().from(savedFilters).where(eq(savedFilters.id, id));
    return row;
  }

  async createSavedFilter(userId: string, data: InsertSavedFilter): Promise<SavedFilter> {
    const id = randomUUID();
    const [row] = await db.insert(savedFilters).values({
      id,
      userId,
      name: data.name,
      filterConfig: data.filterConfig,
      pageType: data.pageType || "cases",
      createdAt: new Date(),
    } as any).returning();
    return row;
  }

  async updateSavedFilter(id: string, data: UpdateSavedFilter): Promise<SavedFilter | undefined> {
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.filterConfig !== undefined) updates.filterConfig = data.filterConfig;
    const [row] = await db.update(savedFilters)
      .set(updates)
      .where(eq(savedFilters.id, id))
      .returning();
    return row;
  }

  async deleteSavedFilter(id: string): Promise<boolean> {
    const result = await db.delete(savedFilters).where(eq(savedFilters.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Sidebar Section Views ====================
  // Counts items "new since last visit" for each of the four
  // badge-bearing sections (cases / consultations / hearings / memos),
  // filtered by the role-based visibility rules. If the user has no
  // user_section_views row for a section yet, that section returns 0
  // — see DESIGN NOTE in the spec ("don't overwhelm new users with
  // all-time backlog"). All counts are integers (a user-facing badge
  // can't show fractions).
  async getSidebarCounts(user: { id: string; role: string; departmentId: string | null }): Promise<SidebarCounts> {
    // Three role buckets per the sidebar spec:
    //   admin  → counts everything in the system
    //   dept   → counts only items inside the user's own department
    //   member → counts only items the user is assigned to / involved in
    // branch_manager + admin_support are the explicit "all" bucket;
    // the two review-committee heads are bundled in because they
    // already see every case/consultation per canViewCase. hr and
    // technical_support fall into the member bucket — they aren't
    // assigned to legal items so their badges naturally come out as 0.
    const ADMIN_ROLES = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"];
    const isAdmin = ADMIN_ROLES.includes(user.role);
    const isDeptHead = user.role === "department_head";
    // For dept_head with no department on file we count nothing rather
    // than fall back to `= ''` — an empty-string match would leak any
    // legacy rows that have a blank department_id.
    const userDept = user.departmentId && user.departmentId.length > 0 ? user.departmentId : null;

    const viewRows = await db.select().from(userSectionViews)
      .where(eq(userSectionViews.userId, user.id));
    const lastViewed = new Map<string, Date>();
    for (const r of viewRows) {
      if (r.lastViewedAt) lastViewed.set(r.section, r.lastViewedAt as Date);
    }

    const counts: SidebarCounts = { cases: 0, consultations: 0, hearings: 0, memos: 0 };

    const runCount = async (query: Promise<Array<{ c: any }>>): Promise<number> => {
      const rows = await query;
      const raw = rows[0]?.c;
      return typeof raw === "number" ? raw : Number(raw ?? 0);
    };

    // ---- Cases ----
    const casesSince = lastViewed.get("cases");
    if (casesSince) {
      if (isAdmin) {
        counts.cases = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(lawCases)
            .where(gt(lawCases.createdAt, casesSince)),
        );
      } else if (isDeptHead) {
        if (userDept) {
          counts.cases = await runCount(
            db.select({ c: sql<number>`count(*)::int` }).from(lawCases)
              .where(and(
                gt(lawCases.createdAt, casesSince),
                eq(lawCases.departmentId, userDept),
              )),
          );
        }
      } else {
        counts.cases = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(lawCases)
            .where(and(
              gt(lawCases.createdAt, casesSince),
              or(
                eq(lawCases.primaryLawyerId, user.id),
                eq(lawCases.responsibleLawyerId, user.id),
                eq(lawCases.internalReviewerId, user.id),
                sql`${lawCases.assignedLawyers} @> ${JSON.stringify([user.id])}::jsonb`,
              ),
            )),
        );
      }
    }

    // ---- Consultations ----
    const consultationsSince = lastViewed.get("consultations");
    if (consultationsSince) {
      if (isAdmin) {
        counts.consultations = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(consultations)
            .where(gt(consultations.createdAt, consultationsSince)),
        );
      } else if (isDeptHead) {
        if (userDept) {
          counts.consultations = await runCount(
            db.select({ c: sql<number>`count(*)::int` }).from(consultations)
              .where(and(
                gt(consultations.createdAt, consultationsSince),
                eq(consultations.departmentId, userDept),
              )),
          );
        }
      } else {
        counts.consultations = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(consultations)
            .where(and(
              gt(consultations.createdAt, consultationsSince),
              or(
                eq(consultations.assignedTo, user.id),
                eq(consultations.createdBy, user.id),
              ),
            )),
        );
      }
    }

    // ---- Hearings ----
    // Hearings don't carry a department on the row itself — for
    // dept_head visibility we look through to the parent case's
    // department. Lawyers see hearings where they are the
    // attendingLawyerId.
    const hearingsSince = lastViewed.get("hearings");
    if (hearingsSince) {
      if (isAdmin) {
        counts.hearings = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(hearings)
            .where(gt(hearings.createdAt, hearingsSince)),
        );
      } else if (isDeptHead) {
        if (userDept) {
          counts.hearings = await runCount(
            db.select({ c: sql<number>`count(*)::int` }).from(hearings)
              .innerJoin(lawCases, eq(hearings.caseId, lawCases.id))
              .where(and(
                gt(hearings.createdAt, hearingsSince),
                eq(lawCases.departmentId, userDept),
              )),
          );
        }
      } else {
        counts.hearings = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(hearings)
            .where(and(
              gt(hearings.createdAt, hearingsSince),
              eq(hearings.attendingLawyerId, user.id),
            )),
        );
      }
    }

    // ---- Memos ----
    const memosSince = lastViewed.get("memos");
    if (memosSince) {
      if (isAdmin) {
        counts.memos = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(memos)
            .where(gt(memos.createdAt, memosSince)),
        );
      } else if (isDeptHead) {
        if (userDept) {
          counts.memos = await runCount(
            db.select({ c: sql<number>`count(*)::int` }).from(memos)
              .innerJoin(lawCases, eq(memos.caseId, lawCases.id))
              .where(and(
                gt(memos.createdAt, memosSince),
                eq(lawCases.departmentId, userDept),
              )),
          );
        }
      } else {
        counts.memos = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(memos)
            .where(and(
              gt(memos.createdAt, memosSince),
              or(
                eq(memos.assignedTo, user.id),
                eq(memos.internalReviewerId, user.id),
                eq(memos.createdBy, user.id),
              ),
            )),
        );
      }
    }

    return counts;
  }

  async markSectionViewed(userId: string, section: SidebarSectionValue): Promise<void> {
    // Upsert: insert a row at NOW(); if one already exists for this
    // (user, section) pair, bump last_viewed_at to NOW(). This is what
    // clears the badge after a user opens the page.
    await db.insert(userSectionViews)
      .values({ userId, section, lastViewedAt: new Date() } as any)
      .onConflictDoUpdate({
        target: [userSectionViews.userId, userSectionViews.section],
        set: { lastViewedAt: new Date() },
      });
  }

  // ==================== Consultation Studies / Drafts / Reviews / Committee / Notes ====================

  async createConsultationStudy(data: { consultationId: string; notes: string; createdBy: string }): Promise<ConsultationStudy> {
    const id = randomUUID();
    const [row] = await db.insert(consultationStudies).values({
      id,
      consultationId: data.consultationId,
      notes: data.notes,
      createdBy: data.createdBy,
      createdAt: new Date(),
    } as any).returning();
    return {
      id: row.id,
      consultationId: row.consultationId,
      notes: row.notes ?? "",
      createdBy: row.createdBy,
      createdAt: toISOString(row.createdAt),
    };
  }

  async getConsultationStudies(consultationId: string): Promise<ConsultationStudy[]> {
    const rows = await db.select().from(consultationStudies)
      .where(eq(consultationStudies.consultationId, consultationId))
      .orderBy(asc(consultationStudies.createdAt));
    return rows.map(r => ({
      id: r.id,
      consultationId: r.consultationId,
      notes: r.notes ?? "",
      createdBy: r.createdBy,
      createdAt: toISOString(r.createdAt),
    }));
  }

  async createConsultationDraft(data: { consultationId: string; content: string; createdBy: string }): Promise<ConsultationDraft> {
    const id = randomUUID();
    const [row] = await db.insert(consultationDrafts).values({
      id,
      consultationId: data.consultationId,
      content: data.content,
      createdBy: data.createdBy,
      createdAt: new Date(),
    } as any).returning();
    return {
      id: row.id,
      consultationId: row.consultationId,
      content: row.content ?? "",
      createdBy: row.createdBy,
      createdAt: toISOString(row.createdAt),
    };
  }

  async getConsultationDrafts(consultationId: string): Promise<ConsultationDraft[]> {
    const rows = await db.select().from(consultationDrafts)
      .where(eq(consultationDrafts.consultationId, consultationId))
      .orderBy(asc(consultationDrafts.createdAt));
    return rows.map(r => ({
      id: r.id,
      consultationId: r.consultationId,
      content: r.content ?? "",
      createdBy: r.createdBy,
      createdAt: toISOString(r.createdAt),
    }));
  }

  async createConsultationReview(data: { consultationId: string; reviewerId: string; decision: string; notes: string }): Promise<ConsultationReview> {
    const id = randomUUID();
    const [row] = await db.insert(consultationReviews).values({
      id,
      consultationId: data.consultationId,
      reviewerId: data.reviewerId,
      decision: data.decision,
      notes: data.notes,
      createdAt: new Date(),
    } as any).returning();
    return {
      id: row.id,
      consultationId: row.consultationId,
      reviewerId: row.reviewerId,
      decision: row.decision,
      notes: row.notes ?? "",
      createdAt: toISOString(row.createdAt),
    };
  }

  // Phase-6 — atomic internal-review record. Replaces the previously
  // sequential pair (createConsultationReview + updateConsultation) so the
  // review row, the consultation stage update, and the activity log are
  // all part of one transaction. Used by POST /internal-review.
  async recordConsultationInternalReview(input: {
    consultationId: string;
    reviewerId: string;
    decision: string;
    notes: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ review: ConsultationReview; consultation: Consultation }> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const reviewId = randomUUID();
      const [reviewRow] = await tx.insert(consultationReviews).values({
        id: reviewId,
        consultationId: input.consultationId,
        reviewerId: input.reviewerId,
        decision: input.decision,
        notes: input.notes,
        createdAt: now,
      } as any).returning();

      await tx.update(consultations)
        .set({ currentStage: input.nextStage, updatedAt: now } as any)
        .where(eq(consultations.id, input.consultationId));

      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        activityType: ConsultationActivityType.INTERNAL_REVIEW,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      } as any);

      const [updatedCon] = await tx.select().from(consultations).where(eq(consultations.id, input.consultationId));
      if (!updatedCon) throw new Error("CONSULTATION_NOT_FOUND");

      return {
        review: {
          id: reviewRow.id,
          consultationId: reviewRow.consultationId,
          reviewerId: reviewRow.reviewerId,
          decision: reviewRow.decision,
          notes: reviewRow.notes ?? "",
          createdAt: toISOString(reviewRow.createdAt),
        },
        consultation: mapDbConsultation(updatedCon),
      };
    });
  }

  async getConsultationReviews(consultationId: string): Promise<ConsultationReview[]> {
    const rows = await db.select().from(consultationReviews)
      .where(eq(consultationReviews.consultationId, consultationId))
      .orderBy(asc(consultationReviews.createdAt));
    return rows.map(r => ({
      id: r.id,
      consultationId: r.consultationId,
      reviewerId: r.reviewerId,
      decision: r.decision,
      notes: r.notes ?? "",
      createdAt: toISOString(r.createdAt),
    }));
  }

  async getLatestConsultationReview(consultationId: string): Promise<ConsultationReview | undefined> {
    const [row] = await db.select().from(consultationReviews)
      .where(eq(consultationReviews.consultationId, consultationId))
      .orderBy(desc(consultationReviews.createdAt))
      .limit(1);
    if (!row) return undefined;
    return {
      id: row.id,
      consultationId: row.consultationId,
      reviewerId: row.reviewerId,
      decision: row.decision,
      notes: row.notes ?? "",
      createdAt: toISOString(row.createdAt),
    };
  }

  async createConsultationCommitteeDecision(data: { consultationId: string; decision: string; notes: string; decidedBy: string }): Promise<ConsultationCommitteeDecision> {
    const id = randomUUID();
    const [row] = await db.insert(consultationCommitteeDecisions).values({
      id,
      consultationId: data.consultationId,
      decision: data.decision,
      notes: data.notes,
      decidedBy: data.decidedBy,
      decidedAt: new Date(),
    } as any).returning();
    return {
      id: row.id,
      consultationId: row.consultationId,
      decision: row.decision,
      notes: row.notes ?? "",
      decidedBy: row.decidedBy,
      decidedAt: toISOString(row.decidedAt),
    };
  }

  // Phase-6 — atomic committee-decision record. Replaces the previously
  // sequential pair so the decision row, the consultation stage update,
  // and the activity log are all part of one transaction.
  async recordConsultationCommitteeDecision(input: {
    consultationId: string;
    decision: string;
    notes: string;
    decidedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ decision: ConsultationCommitteeDecision; consultation: Consultation }> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [decisionRow] = await tx.insert(consultationCommitteeDecisions).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        decision: input.decision,
        notes: input.notes,
        decidedBy: input.decidedBy,
        decidedAt: now,
      } as any).returning();

      await tx.update(consultations)
        .set({ currentStage: input.nextStage, updatedAt: now } as any)
        .where(eq(consultations.id, input.consultationId));

      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        activityType: ConsultationActivityType.COMMITTEE_DECISION,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      } as any);

      const [updatedCon] = await tx.select().from(consultations).where(eq(consultations.id, input.consultationId));
      if (!updatedCon) throw new Error("CONSULTATION_NOT_FOUND");

      return {
        decision: {
          id: decisionRow.id,
          consultationId: decisionRow.consultationId,
          decision: decisionRow.decision,
          notes: decisionRow.notes ?? "",
          decidedBy: decisionRow.decidedBy,
          decidedAt: toISOString(decisionRow.decidedAt),
        },
        consultation: mapDbConsultation(updatedCon),
      };
    });
  }

  async getConsultationCommitteeDecisions(consultationId: string): Promise<ConsultationCommitteeDecision[]> {
    const rows = await db.select().from(consultationCommitteeDecisions)
      .where(eq(consultationCommitteeDecisions.consultationId, consultationId))
      .orderBy(asc(consultationCommitteeDecisions.decidedAt));
    return rows.map(r => ({
      id: r.id,
      consultationId: r.consultationId,
      decision: r.decision,
      notes: r.notes ?? "",
      decidedBy: r.decidedBy,
      decidedAt: toISOString(r.decidedAt),
    }));
  }

  async createConsultationNoteOutcome(data: { consultationId: string; outcome: string; notes: string; recordedBy: string }): Promise<ConsultationNoteOutcome> {
    const id = randomUUID();
    const [row] = await db.insert(consultationNoteOutcomes).values({
      id,
      consultationId: data.consultationId,
      outcome: data.outcome,
      notes: data.notes,
      recordedBy: data.recordedBy,
      recordedAt: new Date(),
    } as any).returning();
    return {
      id: row.id,
      consultationId: row.consultationId,
      outcome: row.outcome,
      notes: row.notes ?? "",
      recordedBy: row.recordedBy,
      recordedAt: toISOString(row.recordedAt),
    };
  }

  // Phase-6 — atomic take-notes-outcome record. Per spec §3.2.1 ALL
  // outcomes (DONE | NOT_DONE | PARTIAL) advance to READY, so the next
  // stage is always READY. Outcome row, consultation stage update, and
  // activity log are all part of one transaction.
  async recordConsultationNoteOutcome(input: {
    consultationId: string;
    outcome: string;
    notes: string;
    recordedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<{ outcome: ConsultationNoteOutcome; consultation: Consultation }> {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [outcomeRow] = await tx.insert(consultationNoteOutcomes).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        outcome: input.outcome,
        notes: input.notes,
        recordedBy: input.recordedBy,
        recordedAt: now,
      } as any).returning();

      await tx.update(consultations)
        .set({ currentStage: input.nextStage, updatedAt: now } as any)
        .where(eq(consultations.id, input.consultationId));

      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        activityType: ConsultationActivityType.TAKE_NOTES_OUTCOME,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      } as any);

      const [updatedCon] = await tx.select().from(consultations).where(eq(consultations.id, input.consultationId));
      if (!updatedCon) throw new Error("CONSULTATION_NOT_FOUND");

      return {
        outcome: {
          id: outcomeRow.id,
          consultationId: outcomeRow.consultationId,
          outcome: outcomeRow.outcome,
          notes: outcomeRow.notes ?? "",
          recordedBy: outcomeRow.recordedBy,
          recordedAt: toISOString(outcomeRow.recordedAt),
        },
        consultation: mapDbConsultation(updatedCon),
      };
    });
  }

  async returnConsultationToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const truncated = input.notes ? input.notes.slice(0, 120) : "";
      await tx.update(consultations).set({
        currentStage: ConsultationStage.COMMITTEE,
        updatedAt: now,
      } as any).where(eq(consultations.id, id));
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.RETURNED_TO_COMMITTEE,
        description: truncated
          ? `إعادة للجنة المراجعة — ${truncated}`
          : "إعادة للجنة المراجعة",
        metadata: { notes: input.notes },
        performedBy: input.performedBy,
        performedAt: now,
      } as any);
      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  async getConsultationNoteOutcomes(consultationId: string): Promise<ConsultationNoteOutcome[]> {
    const rows = await db.select().from(consultationNoteOutcomes)
      .where(eq(consultationNoteOutcomes.consultationId, consultationId))
      .orderBy(asc(consultationNoteOutcomes.recordedAt));
    return rows.map(r => ({
      id: r.id,
      consultationId: r.consultationId,
      outcome: r.outcome,
      notes: r.notes ?? "",
      recordedBy: r.recordedBy,
      recordedAt: toISOString(r.recordedAt),
    }));
  }

  // ==================== Delivery-date extension (Phase-5) ====================

  // Inserts the audit row and updates consultations.expectedDeliveryDate
  // in one transaction. Sentinel errors mirror the convert-to-case method
  // so the route handler can map them to specific 4xx codes:
  //   CONSULTATION_NOT_FOUND, CONSULTATION_NOT_ACTIVE,
  //   EXTENSION_NOT_FORWARD (new date is not strictly after the old one).
  async extendConsultationDelivery(
    consultationId: string,
    data: { newExpectedDeliveryDate: Date; reason: string },
    extendedBy: string,
    activity?: { description: string; metadata?: Record<string, any> },
  ): Promise<{ extension: ConsultationDeliveryExtension; consultation: Consultation }> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, consultationId));
      if (!existing) throw new Error("CONSULTATION_NOT_FOUND");
      if (existing.status !== "active") throw new Error("CONSULTATION_NOT_ACTIVE");

      const oldDate = existing.expectedDeliveryDate ?? null;
      // "Extension" means moving the date forward. Reject same/earlier
      // values so the audit log carries meaningful events; the route
      // surfaces this as a 400.
      if (oldDate && data.newExpectedDeliveryDate.getTime() <= new Date(oldDate).getTime()) {
        throw new Error("EXTENSION_NOT_FORWARD");
      }

      const now = new Date();
      const extensionId = randomUUID();
      const extensionRow = {
        id: extensionId,
        consultationId,
        oldExpectedDeliveryDate: oldDate,
        newExpectedDeliveryDate: data.newExpectedDeliveryDate,
        reason: data.reason,
        extendedBy,
        extendedAt: now,
      };
      await tx.insert(consultationDeliveryExtensions).values(extensionRow as any);

      const updated = await tx.update(consultations)
        .set({
          expectedDeliveryDate: data.newExpectedDeliveryDate,
          updatedAt: now,
        } as any)
        .where(eq(consultations.id, consultationId))
        .returning();
      if (!updated.length) throw new Error("CONSULTATION_UPDATE_FAILED");

      // Phase-6 — log the extension as part of the same transaction.
      if (activity) {
        await tx.insert(consultationActivityLog).values({
          id: randomUUID(),
          consultationId,
          activityType: ConsultationActivityType.DELIVERY_EXTENDED,
          description: activity.description,
          metadata: activity.metadata ?? {},
          performedBy: extendedBy,
          performedAt: now,
        } as any);
      }

      return {
        extension: {
          id: extensionRow.id,
          consultationId: extensionRow.consultationId,
          oldExpectedDeliveryDate: oldDate ? toISOString(oldDate) : null,
          newExpectedDeliveryDate: toISOString(extensionRow.newExpectedDeliveryDate),
          reason: extensionRow.reason,
          extendedBy: extensionRow.extendedBy,
          extendedAt: toISOString(extensionRow.extendedAt),
        },
        consultation: mapDbConsultation(updated[0]),
      };
    });
  }

  async getConsultationDeliveryExtensions(consultationId: string): Promise<ConsultationDeliveryExtension[]> {
    const rows = await db.select().from(consultationDeliveryExtensions)
      .where(eq(consultationDeliveryExtensions.consultationId, consultationId))
      .orderBy(asc(consultationDeliveryExtensions.extendedAt));
    return rows.map(r => ({
      id: r.id,
      consultationId: r.consultationId,
      oldExpectedDeliveryDate: r.oldExpectedDeliveryDate ? toISOString(r.oldExpectedDeliveryDate) : null,
      newExpectedDeliveryDate: toISOString(r.newExpectedDeliveryDate),
      reason: r.reason ?? "",
      extendedBy: r.extendedBy,
      extendedAt: toISOString(r.extendedAt),
    }));
  }

  // ==================== Consultation Activity Log (Phase-6) ====================

  async createConsultationActivity(input: {
    consultationId: string;
    activityType: string;
    description: string;
    metadata?: Record<string, any>;
    performedBy: string | null;
  }): Promise<ConsultationActivity> {
    const id = randomUUID();
    const [row] = await db.insert(consultationActivityLog).values({
      id,
      consultationId: input.consultationId,
      activityType: input.activityType,
      description: input.description,
      metadata: input.metadata ?? {},
      performedBy: input.performedBy,
      performedAt: new Date(),
    } as any).returning();
    return mapDbConsultationActivity(row);
  }

  async getConsultationActivities(consultationId: string): Promise<ConsultationActivity[]> {
    const rows = await db.select().from(consultationActivityLog)
      .where(eq(consultationActivityLog.consultationId, consultationId))
      .orderBy(desc(consultationActivityLog.performedAt));
    return rows.map(mapDbConsultationActivity);
  }

  // ==================== Convert consultation to case (rebuild §3.2.3) ====================

  // Single DB transaction. Helper-table copies (§3.2.3 steps 3-5) are
  // intentionally skipped per option (ii) of the Phase 2 plan: cases-side
  // study/draft/review tables don't exist and won't be created. The case
  // gets a back-pointer via convertedFromConsultationId; the UI reaches
  // the consultation's history through that link.
  //
  // Throws sentinel Error names on validation failure inside the txn so
  // the route handler can map them to specific 4xx codes:
  //   CONSULTATION_NOT_FOUND, CONSULTATION_NOT_ACTIVE, CONSULTATION_COMPLETED,
  //   CASE_NUMBER_EXISTS (user-supplied courtCaseNumber collides),
  //   DUPLICATE_CASE_NUMBER (auto-generated suffix collided 3× in a row).
  async convertConsultationToCase(
    consultationId: string,
    caseFields: Partial<LawCase>,
    actorId: string,
    activityCtx?: { targetCaseStage?: string },
  ): Promise<{ case: LawCase; consultation: Consultation }> {
    const userSupplied = !!caseFields.courtCaseNumber;
    const maxAttempts = userSupplied ? 1 : 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.convertConsultationToCaseOnce(consultationId, caseFields, actorId, activityCtx);
      } catch (err) {
        lastErr = err;
        if (isUniqueViolationOn(err, "case_number")) {
          if (userSupplied) {
            throw new Error("CASE_NUMBER_EXISTS");
          }
          console.warn("[storage:convertConsultationToCase] case_number collision on attempt", attempt + 1, "of", maxAttempts);
          continue;
        }
        throw err;
      }
    }
    console.error("[storage:convertConsultationToCase] exhausted retries — auto-generated case_number kept colliding", lastErr);
    throw new Error("DUPLICATE_CASE_NUMBER");
  }

  private async convertConsultationToCaseOnce(
    consultationId: string,
    caseFields: Partial<LawCase>,
    actorId: string,
    activityCtx?: { targetCaseStage?: string },
  ): Promise<{ case: LawCase; consultation: Consultation }> {
    return await db.transaction(async (tx) => {
      // 1. Read consultation inside the transaction (re-validate for race-safety)
      const [existingCon] = await tx.select().from(consultations).where(eq(consultations.id, consultationId));
      if (!existingCon) throw new Error("CONSULTATION_NOT_FOUND");
      if (existingCon.status !== "active") throw new Error("CONSULTATION_NOT_ACTIVE");
      if (existingCon.currentStage === ConsultationStage.COMPLETED) throw new Error("CONSULTATION_COMPLETED");

      // 2. Build and insert the new case row
      const newCaseId = randomUUID();
      const caseNumber = caseFields.courtCaseNumber
        ? caseFields.courtCaseNumber
        : generateCaseNumber();
      const now = new Date();

      const newCaseRow = {
        id: newCaseId,
        caseNumber,
        clientId: caseFields.clientId || existingCon.clientId,
        caseType: caseFields.caseType || existingCon.consultationType,
        caseTypeOther: caseFields.caseTypeOther || "",
        departmentOther: caseFields.departmentOther || "",
        status: CaseStatus.RECEIVED,
        currentStage: caseFields.currentStage || CaseStage.RECEPTION,
        stageHistory: [],
        departmentId: caseFields.departmentId || existingCon.departmentId,
        assignedLawyers: [],
        primaryLawyerId: caseFields.primaryLawyerId || null,
        responsibleLawyerId: caseFields.responsibleLawyerId || null,
        courtName: caseFields.courtName || "",
        courtCaseNumber: caseFields.courtCaseNumber || "",
        judgeName: caseFields.judgeName || "",
        circuitNumber: caseFields.circuitNumber || "",
        plaintiffName: caseFields.plaintiffName || "",
        opponentName: caseFields.opponentName || "",
        opponentLawyer: caseFields.opponentLawyer || "",
        opponentPhone: caseFields.opponentPhone || "",
        opponentNotes: caseFields.opponentNotes || "",
        whatsappGroupLink: caseFields.whatsappGroupLink || existingCon.whatsappGroupLink || "",
        googleDriveFolderId: caseFields.googleDriveFolderId || existingCon.googleDriveFolderId || "",
        reviewNotes: "",
        reviewDecision: null,
        reviewActionTaken: null,
        priority: caseFields.priority || "متوسط",
        caseClassification: caseFields.caseClassification || CaseClassification.UNDER_STUDY,
        clientRole: (caseFields as any).clientRole ?? null,
        previousHearingsCount: caseFields.previousHearingsCount || 0,
        currentSituation: caseFields.currentSituation || existingCon.questionSummary || "",
        responseDeadline: caseFields.responseDeadline || null,
        convertedFromConsultationId: existingCon.id,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      };

      const inserted = await tx.insert(lawCases).values(newCaseRow as any).returning();
      if (!inserted.length) throw new Error("CASE_INSERT_FAILED");

      // 3. Update consultation to mark conversion (helper-table copies skipped per option ii)
      const updatedConRows = await tx.update(consultations)
        .set({
          status: "converted",
          convertedToCaseId: newCaseId,
          closedAt: now,
          updatedAt: now,
        } as any)
        .where(eq(consultations.id, consultationId))
        .returning();
      if (!updatedConRows.length) throw new Error("CONSULTATION_UPDATE_FAILED");

      // Phase-6 — log the conversion as part of the same transaction.
      // Description uses the case number computed above so the timeline
      // can render it without an extra lookup.
      if (activityCtx) {
        await tx.insert(consultationActivityLog).values({
          id: randomUUID(),
          consultationId,
          activityType: ConsultationActivityType.CONVERTED_TO_CASE,
          description: `تم تحويل الاستشارة إلى قضية رقم ${caseNumber}`,
          metadata: {
            newCaseId,
            newCaseNumber: caseNumber,
            targetCaseStage: activityCtx.targetCaseStage ?? null,
          },
          performedBy: actorId,
          performedAt: now,
        } as any);
      }

      return {
        case: mapDbCase(newCaseRow),
        consultation: mapDbConsultation(updatedConRows[0]),
      };
    });
  }

  // ==================== Case Activity Log ====================

  async logCaseActivity(data: InsertCaseActivity): Promise<CaseActivity> {
    const id = nanoid();
    const [activity] = await db.insert(caseActivityLog).values({
      ...data,
      id,
      createdAt: new Date(),
    } as any).returning();
    return activity;
  }

  async getCaseActivities(caseId: string): Promise<CaseActivity[]> {
    return await db.select().from(caseActivityLog)
      .where(eq(caseActivityLog.caseId, caseId))
      .orderBy(desc(caseActivityLog.createdAt));
  }

  async returnCaseToCommittee(
    id: string,
    input: { notes: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const targetStage = "إحالة_للجنة_المراجعة";
      const existingHistory = Array.isArray((existing as any).stageHistory)
        ? (existing as any).stageHistory
        : [];
      const stageHistory = [
        ...existingHistory,
        {
          stage: targetStage,
          timestamp: now.toISOString(),
          userId: input.performedBy,
          userName: input.performerName,
          notes: input.notes
            ? `إعادة للجنة المراجعة — ${input.notes}`
            : "إعادة للجنة المراجعة",
        },
      ];
      await tx.update(lawCases).set({
        currentStage: targetStage,
        stageHistory,
        updatedAt: now,
      } as any).where(eq(lawCases.id, id));
      const truncated = input.notes ? input.notes.slice(0, 120) : "";
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "returned_to_committee",
        title: "إعادة للجنة المراجعة",
        details: truncated || null,
        previousValue: fromStage,
        newValue: targetStage,
        createdAt: now,
      } as any);
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  // Phase-8 — pause / unpause on cases. Atomic update + case_activity_log
  // insert in one transaction. Cases status (workflow stage) is left
  // alone; pause is detected via paused_at IS NOT NULL.
  async pauseCase(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(lawCases).set({
        pauseReason: input.reason,
        pausedBy: input.performedBy,
        pausedAt: now,
        updatedAt: now,
      } as any).where(eq(lawCases.id, id));
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "paused",
        title: "تعليق القضية",
        details: input.reason,
        createdAt: now,
      } as any);
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  // Phase-8 — await-completion / resume on cases. Mirrors the
  // consultations pattern but writes case_activity_log + appends to
  // stageHistory (the case-side audit trail). Cases already have
  // "استكمال_البيانات" as a regular forward stage; await-completion
  // routes the case INTO that stage from any other stage, with
  // saved_stage holding the value to restore on resume.
  async awaitCaseCompletion(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const targetStage = "استكمال_البيانات";
      const existingHistory = Array.isArray((existing as any).stageHistory)
        ? (existing as any).stageHistory
        : [];
      const stageHistory = [
        ...existingHistory,
        {
          stage: targetStage,
          timestamp: now.toISOString(),
          userId: input.performedBy,
          userName: input.performerName,
          notes: `بانتظار استكمال المرفقات والبيانات — ${input.reason}`,
        },
      ];
      await tx.update(lawCases).set({
        currentStage: targetStage,
        savedStage: fromStage,
        awaitingCompletion: true,
        stageHistory,
        updatedAt: now,
      } as any).where(eq(lawCases.id, id));
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "await_completion",
        title: "بانتظار استكمال المرفقات والبيانات",
        details: input.reason,
        previousValue: fromStage,
        newValue: targetStage,
        createdAt: now,
      } as any);
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  async resumeCaseFromCompletion(
    id: string,
    input: {
      notes?: string;
      performedBy: string;
      performerName: string;
      // Stage-list validator the route hands in. Cases have 5 stage
      // paths depending on caseType + classification, so the caller
      // resolves the right list and we just check membership.
      isValidStage: (stage: string) => boolean;
    },
  ): Promise<{ ok: true; lawCase: LawCase } | { ok: false; reason: "INVALID_SAVED_STAGE" | "NOT_FOUND" }> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return { ok: false, reason: "NOT_FOUND" } as const;
      const targetStage = existing.savedStage;
      if (!targetStage || !input.isValidStage(targetStage)) {
        return { ok: false, reason: "INVALID_SAVED_STAGE" } as const;
      }
      const now = new Date();
      const existingHistory = Array.isArray((existing as any).stageHistory)
        ? (existing as any).stageHistory
        : [];
      const stageHistory = [
        ...existingHistory,
        {
          stage: targetStage,
          timestamp: now.toISOString(),
          userId: input.performedBy,
          userName: input.performerName,
          notes: input.notes?.trim() || "العودة من الاستكمال",
        },
      ];
      await tx.update(lawCases).set({
        currentStage: targetStage,
        savedStage: null,
        awaitingCompletion: false,
        stageHistory,
        updatedAt: now,
      } as any).where(eq(lawCases.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "resume_from_completion",
        title: `العودة من الاستكمال إلى ${targetStage}`,
        details: notes || null,
        previousValue: "استكمال_البيانات",
        newValue: targetStage,
        createdAt: now,
      } as any);
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated
        ? { ok: true as const, lawCase: mapDbCase(updated) }
        : { ok: false, reason: "NOT_FOUND" } as const;
    });
  }

  async unpauseCase(
    id: string,
    input: { notes?: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(lawCases).set({
        pauseReason: null,
        pausedBy: null,
        pausedAt: null,
        updatedAt: now,
      } as any).where(eq(lawCases.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "unpaused",
        title: "إلغاء تعليق القضية",
        details: notes || null,
        createdAt: now,
      } as any);
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  // ==================== Case Notes ====================

  async getCaseNoteById(id: string): Promise<CaseNote | undefined> {
    const result = await db.select().from(caseNotes).where(eq(caseNotes.id, id));
    return result[0];
  }

  async getCaseNotes(caseId: string): Promise<CaseNote[]> {
    return await db.select().from(caseNotes)
      .where(eq(caseNotes.caseId, caseId))
      .orderBy(desc(caseNotes.isPinned), desc(caseNotes.createdAt));
  }

  async createCaseNote(data: InsertCaseNote): Promise<CaseNote> {
    const id = nanoid();
    const [note] = await db.insert(caseNotes).values({
      ...data,
      id,
      createdAt: new Date(),
    } as any).returning();
    return note;
  }

  async updateCaseNote(id: string, data: Partial<CaseNote>): Promise<CaseNote | undefined> {
    const [note] = await db.update(caseNotes)
      .set({ ...data, editedAt: new Date() } as any)
      .where(eq(caseNotes.id, id))
      .returning();
    return note;
  }

  async deleteCaseNote(id: string): Promise<boolean> {
    const result = await db.delete(caseNotes).where(eq(caseNotes.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Case Comments ====================

  async getCommentsByCaseId(caseId: string): Promise<CaseCommentRow[]> {
    return await db.select().from(caseComments)
      .where(eq(caseComments.caseId, caseId))
      .orderBy(caseComments.createdAt);
  }

  async createCaseComment(data: InsertCaseComment): Promise<CaseCommentRow> {
    const [comment] = await db.insert(caseComments).values({
      ...data,
      id: nanoid(),
      createdAt: new Date(),
    }).returning();
    return comment;
  }

  // ==================== Legal Deadlines ====================

  async getAllLegalDeadlines(): Promise<LegalDeadline[]> {
    return await db.select().from(legalDeadlines)
      .orderBy(legalDeadlines.deadlineDate);
  }

  async getLegalDeadlinesByCase(caseId: string): Promise<LegalDeadline[]> {
    return await db.select().from(legalDeadlines)
      .where(eq(legalDeadlines.caseId, caseId))
      .orderBy(legalDeadlines.deadlineDate);
  }

  async createLegalDeadline(data: InsertLegalDeadline): Promise<LegalDeadline> {
    const id = nanoid();
    const [deadline] = await db.insert(legalDeadlines).values({
      ...data,
      id,
      createdAt: new Date(),
    } as any).returning();
    return deadline;
  }

  async updateLegalDeadline(id: string, data: Partial<LegalDeadline>): Promise<LegalDeadline | undefined> {
    const [deadline] = await db.update(legalDeadlines)
      .set(data as any)
      .where(eq(legalDeadlines.id, id))
      .returning();
    return deadline;
  }

  async deleteLegalDeadline(id: string): Promise<boolean> {
    const result = await db.delete(legalDeadlines).where(eq(legalDeadlines.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Delegations ====================

  async getDelegation(id: string): Promise<DelegationRecord | undefined> {
    const [delegation] = await db.select().from(delegationsTable)
      .where(eq(delegationsTable.id, id));
    return delegation;
  }

  async getAllDelegations(): Promise<DelegationRecord[]> {
    return await db.select().from(delegationsTable)
      .orderBy(desc(delegationsTable.createdAt));
  }

  async getActiveDelegationsForUser(userId: string): Promise<DelegationRecord[]> {
    const today = new Date().toISOString().split("T")[0];
    return await db.select().from(delegationsTable)
      .where(
        and(
          eq(delegationsTable.toUserId, userId),
          eq(delegationsTable.status, "نشط"),
          lte(delegationsTable.startDate, today),
          gte(delegationsTable.endDate, today)
        )
      );
  }

  async createDelegation(data: InsertDelegation): Promise<DelegationRecord> {
    const id = nanoid();
    const [delegation] = await db.insert(delegationsTable).values({
      ...data,
      id,
      createdAt: new Date(),
    } as any).returning();
    return delegation;
  }

  async updateDelegation(id: string, data: Partial<DelegationRecord>): Promise<DelegationRecord | undefined> {
    const [delegation] = await db.update(delegationsTable)
      .set(data as any)
      .where(eq(delegationsTable.id, id))
      .returning();
    return delegation;
  }

  async deleteDelegation(id: string): Promise<boolean> {
    const result = await db.delete(delegationsTable).where(eq(delegationsTable.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Initialize Default Data ====================

  async initializeDefaultData(): Promise<void> {
    const existingUsers = await db.select().from(users);

    console.log(`[INIT] Found ${existingUsers.length} existing users`);

    // Ensure departments exist
    const existingDepartments = await db.select().from(departments);
    if (existingDepartments.length === 0) {
      const defaultDepartments = [
        { id: "1", name: "عام", headId: "4" },
        { id: "2", name: "تجاري", headId: null },
        { id: "3", name: "عمالي", headId: null },
        { id: "4", name: "إداري", headId: null },
      ];
      for (const dept of defaultDepartments) {
        await db.insert(departments).values({ ...dept, createdAt: new Date() });
      }
    }

    if (existingUsers.length > 0) {
      console.log("[INIT] Users already exist, skipping initialization to preserve user data.");
      const assignableRoles = ["employee", "department_head", "branch_manager"];
      const usersToFix = existingUsers.filter(
        u => assignableRoles.includes(u.role) && u.isActive && (!u.canBeAssignedCases || !u.canBeAssignedConsultations)
      );
      if (usersToFix.length > 0) {
        for (const u of usersToFix) {
          await db.update(users).set({
            canBeAssignedCases: true,
            canBeAssignedConsultations: true,
          }).where(eq(users.id, u.id));
        }
        console.log(`[INIT] Fixed assignment flags for ${usersToFix.length} users: ${usersToFix.map(u => u.name).join(", ")}`);
      }
      return;
    }

    console.log("First run detected: creating default users...");
    const defaultPassword = await hashPassword("123456");
    const existingUsernames = existingUsers.map(u => u.username);
    const allDefaultUsers = [
        { 
          id: "1", 
          username: "manager", 
          password: defaultPassword, 
          name: "مدير الفرع", 
          email: "manager@lawfirm.com",
          phone: "0501234567",
          role: "branch_manager",
          departmentId: null,
          isActive: true,
          canBeAssignedCases: true,
          canBeAssignedConsultations: true,
          mustChangePassword: true,
        },
        { 
          id: "4", 
          username: "omar", 
          password: defaultPassword, 
          name: "المحامي عمر - رئيس القسم العام", 
          email: "omar@lawfirm.com",
          phone: "0504234567",
          role: "department_head",
          departmentId: "1",
          isActive: true,
          canBeAssignedCases: true,
          canBeAssignedConsultations: true,
          mustChangePassword: true,
        },
        { 
          id: "6", 
          username: "support", 
          password: defaultPassword, 
          name: "الدعم الإداري", 
          email: "support@lawfirm.com",
          phone: "0506234567",
          role: "admin_support",
          departmentId: null,
          isActive: true,
          canBeAssignedCases: false,
          canBeAssignedConsultations: false,
          mustChangePassword: true,
        },
        { 
          id: "2", 
          username: "cases_head", 
          password: defaultPassword, 
          name: "رئيس لجنة مراجعة القضايا", 
          email: "cases@lawfirm.com",
          phone: "0502234567",
          role: "cases_review_head",
          departmentId: null,
          isActive: true,
          canBeAssignedCases: false,
          canBeAssignedConsultations: false,
          mustChangePassword: true,
        },
        { 
          id: "3", 
          username: "consult_head", 
          password: defaultPassword, 
          name: "رئيس لجنة مراجعة الاستشارات", 
          email: "consult@lawfirm.com",
          phone: "0503234567",
          role: "consultations_review_head",
          departmentId: null,
          isActive: true,
          canBeAssignedCases: false,
          canBeAssignedConsultations: false,
          mustChangePassword: true,
        },
        { 
          id: "5", 
          username: "muhannad", 
          password: defaultPassword, 
          name: "المحامي مهند - رئيس القسم التجاري", 
          email: "muhannad@lawfirm.com",
          phone: "0505234567",
          role: "department_head",
          departmentId: "2",
          isActive: true,
          canBeAssignedCases: true,
          canBeAssignedConsultations: true,
          mustChangePassword: true,
        },
        { 
          id: "7", 
          username: "lawyer1", 
          password: defaultPassword, 
          name: "أحمد محمد - محامي", 
          email: "ahmed@lawfirm.com",
          phone: "0507234567",
          role: "employee",
          departmentId: "1",
          isActive: true,
          canBeAssignedCases: true,
          canBeAssignedConsultations: true,
          mustChangePassword: true,
        },
        { 
          id: "8", 
          username: "hr", 
          password: defaultPassword, 
          name: "الموارد البشرية", 
          email: "hr@lawfirm.com",
          phone: "0508234567",
          role: "hr",
          departmentId: null,
          isActive: true,
          canBeAssignedCases: false,
          canBeAssignedConsultations: false,
          mustChangePassword: true,
        },
        { 
          id: "9", 
          username: "techsupport", 
          password: defaultPassword, 
          name: "الدعم الفني", 
          email: "tech@lawfirm.com",
          phone: "0509234567",
          role: "technical_support",
          departmentId: null,
          isActive: true,
          canBeAssignedCases: false,
          canBeAssignedConsultations: false,
          mustChangePassword: true,
        },
    ];
    
    for (const user of allDefaultUsers) {
      if (!existingUsernames.includes(user.username)) {
        try {
          await db.insert(users).values({
            ...user,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`Added missing user: ${user.username}`);
        } catch (e) {
          console.log(`User ${user.username} already exists, skipping`);
        }
      }
    }

  }
}

export const storage = new DatabaseStorage();
