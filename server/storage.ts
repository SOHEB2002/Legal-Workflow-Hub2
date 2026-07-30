import {
  type User, type LawCase, type Client, type Consultation, type Hearing,
  type FieldTask, type GeneralTaskEvent, type ContactLog, type Notification, type DepartmentInfo, type Memo,
  type SupportTicket,
  type CaseActivity, type InsertCaseActivity,
  type CaseNote, type InsertCaseNote,
  type CaseCommentRow, type InsertCaseComment,
  type LegalDeadline, type InsertLegalDeadline,
  type DelegationRecord, type InsertDelegation,
  type SavedFilter, type InsertSavedFilter, type UpdateSavedFilter,
  type AdminSupportTaskAssignment,
  type SidebarCounts, type SidebarSectionValue, type MyTaskItem, MyTaskKind, FieldTaskType, FieldTaskStatus, taskSpecialtyClass,
  AssignableAdminSupportTaskKind, resolveAdminSupportAssignee,
  type ConsultationStudy, type ConsultationDraft, type ConsultationReview,
  type ConsultationCommitteeDecision, type ConsultationNoteOutcome,
  type ConsultationActivity,
  type MemoReview, type MemoCommitteeDecision, type MemoNoteOutcome,
  type Contract, type ContractAttachment, type ContractActivity,
  type CaseAttachment, type HearingAttachment,
  CaseStatus, CaseStage, CaseClassification, ClosureReason, ConsultationStage, ConsultationStatus,
  ConsultationType, resolveConsultationType,
  ConsultationCategory, type ConsultationCategoryValue,
  ConsultationActivityType, MemoActivityType, MemoStage, type MemoActivity,
  ContractStage, ContractStatus, ContractActivityType,
  CollectionTaskTitlePrefix, ExecutionTaskTitlePrefix, findPrimaryJudgmentHearing,
  type NotificationLinkedContext,
  CaseStageLabels, type CaseStageValue,
  MemoStageLabels, type MemoStageValue,
  ConsultationStageLabels, type ConsultationStageValue,
  users, clients, lawCases, consultations, hearings, fieldTasks, contactLogs, notifications, departments, attachments, memos, supportTickets,
  caseActivityLog, caseNotes, caseComments, legalDeadlines, delegationsTable, savedFilters, userSectionViews,
  adminSupportTaskAssignments,
  consultationStudies, consultationDrafts, consultationReviews,
  consultationCommitteeDecisions, consultationNoteOutcomes,
  consultationActivityLog,
  contracts, contractAttachments, contractActivityLog,
  caseAttachments, hearingAttachments,
  memoActivityLog, generalTaskEvents,
  memoReviews, memoCommitteeDecisions, memoNoteOutcomes
} from "@shared/schema";
import { db } from "./db";
import type { ActingContext } from "./acting-context";
// MERGE NOTE (origin/main → branch): both sides independently added `ne` to
// this import — e1f6569 for the labor-committee department exclusions, and
// a8ecc40 for the opponent-response task's `ne(status, "مغلق")` guard. Same
// symbol, same intent, different position in the list; kept main's ordering so
// the line is textually identical on both sides. Both call sites survive.
import { eq, and, or, gt, ne, desc, asc, lte, gte, sql, inArray, isNull } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
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

// The five per-platform number columns a case can carry. Deliberately does NOT
// include caseNumber — that column is varchar(50) NOT NULL UNIQUE and must never
// receive a varchar(100) platform number (the 23505/22001 bug fixed in bbcdf33).
export type CaseNumberField =
  | "taradiNumber"
  | "mohrNumber"
  | "najizNumber"
  | "moeenNumber"
  | "courtCaseNumber";

// Lifecycle flags the reopen ROUTE decides and this layer merely writes. Typed
// concretely (not `unknown`) so drizzle's .set() keeps validating them.
export type ReopenLifecycleFlags = {
  isSettlementCase?: boolean;
  caseClassification?: string;
  clientRole?: string;
};

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
  getCasesByRole(role: string, userId: string, departmentId?: string): Promise<LawCase[]>;
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
  getConsultationsByRole(role: string, userId: string, departmentId?: string): Promise<Consultation[]>;
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
  getArchivedGeneralTasks(user: { id: string; role: string; departmentId: string | null }): Promise<FieldTask[]>;
  getFieldTasksByCase(caseId: string): Promise<FieldTask[]>;
  getFieldTaskById(id: string): Promise<FieldTask | undefined>;
  createFieldTask(data: Partial<FieldTask>, assignedBy: string): Promise<FieldTask>;
  updateFieldTask(id: string, data: Partial<FieldTask>): Promise<FieldTask | undefined>;
  deleteFieldTask(id: string): Promise<boolean>;
  // General (عام) task activity thread (sub-step 4.6)
  createGeneralTaskEvent(data: { fieldTaskId: string; actorId: string; actorName: string; eventType: string; body: string | null }): Promise<void>;
  getGeneralTaskEvents(fieldTaskId: string): Promise<GeneralTaskEvent[]>;

  // Contact Logs
  getAllContactLogs(): Promise<ContactLog[]>;
  getContactLogsByClient(clientId: string): Promise<ContactLog[]>;
  createContactLog(data: Partial<ContactLog>, createdBy: string): Promise<ContactLog>;
  updateContactLog(id: string, data: Partial<ContactLog>): Promise<ContactLog | undefined>;
  deleteContactLog(id: string): Promise<boolean>;

  // Notifications
  getAllNotifications(): Promise<Notification[]>;
  getRecentNotifications(limit: number): Promise<Notification[]>;
  getNotificationsByRecipient(recipientId: string, opts?: { limit?: number; offset?: number; unread?: boolean; requiresResponse?: boolean }): Promise<Notification[]>;
  enrichNotificationsWithContext(rows: Notification[]): Promise<Notification[]>;
  createNotification(data: Partial<Notification>): Promise<Notification>;
  updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined>;
  markAllNotificationsRead(recipientId: string): Promise<number>;
  getUnreadNotificationCount(recipientId: string): Promise<number>;
  deleteNotification(id: string): Promise<boolean>;

  // Departments
  getAllDepartments(): Promise<DepartmentInfo[]>;
  // Active users with role=department_head in the given department. Authoritative
  // dept-head source for PATH-2 dept-routing (departments.headId is only
  // partially seeded and can disagree). Returns 0/1/>1 for the caller to handle.
  getDepartmentHeads(departmentId: string): Promise<User[]>;
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

  // Support Tickets
  getAllSupportTickets(): Promise<SupportTicket[]>;
  getSupportTicketById(id: string): Promise<SupportTicket | undefined>;
  getSupportTicketsByUser(userId: string): Promise<SupportTicket[]>;
  createSupportTicket(data: Partial<SupportTicket> & Pick<SupportTicket, "ticketType" | "title" | "description" | "submittedBy">): Promise<SupportTicket>;
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
  getLegalDeadlineById(id: string): Promise<LegalDeadline | undefined>;
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

  // Admin_support fine-grained task routing (Phase 1). The central task_type →
  // assignee mapping. get returns every row (one per assigned type); set upserts
  // one row (assigneeUserId null clears it → the type becomes unassigned).
  getAdminSupportTaskAssignments(): Promise<AdminSupportTaskAssignment[]>;
  setAdminSupportTaskAssignment(taskType: string, assigneeUserId: string | null): Promise<AdminSupportTaskAssignment>;

  // Sidebar "new since last visit" counts. Counts items per section
  // visible to the user that were created/assigned after their
  // user_section_views.last_viewed_at for that section. If no row
  // exists for a section yet, that section returns 0 (avoids
  // overwhelming new users with the all-time backlog).
  getSidebarCounts(user: { id: string; role: string; departmentId: string | null }): Promise<SidebarCounts>;
  getMyTasks(user: { id: string; role: string; departmentId: string | null }, ctx?: ActingContext): Promise<MyTaskItem[]>;
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
  // pauseUntil is the OPTIONAL "YYYY-MM-DD" auto-lift date; omitted/empty means
  // an open-ended pause (the pre-feature behaviour). The four unpause methods
  // clear it unconditionally — see the note on their .set() blocks.
  pauseConsultation(id: string, input: { reason: string; performedBy: string; pauseUntil?: string | null }): Promise<Consultation | undefined>;
  unpauseConsultation(id: string, input: { notes?: string; performedBy: string }): Promise<Consultation | undefined>;
  // "مرحلة البداية" correction — flips isSettlementCase AND currentStage
  // together, plus stageHistory + an audit row, in one transaction.
  correctCaseStartingStage(id: string, input: { toSettlement: boolean; performedBy: string; performerName: string; notes: string }): Promise<LawCase | undefined>;
  pauseCase(id: string, input: { reason: string; performedBy: string; performerName: string; pauseUntil?: string | null }): Promise<LawCase | undefined>;
  unpauseCase(id: string, input: { notes?: string; performedBy: string; performerName: string }): Promise<LawCase | undefined>;
  pauseMemo(id: string, input: { reason: string; performedBy: string; pauseUntil?: string | null }): Promise<Memo | undefined>;
  unpauseMemo(id: string, input: { notes?: string; performedBy: string }): Promise<Memo | undefined>;
  getMemoActivities(memoId: string): Promise<MemoActivity[]>;
  // Phase-8 — await-completion / resume / skip across the 3 entities.
  awaitConsultationCompletion(id: string, input: { reason: string; performedBy: string }): Promise<Consultation | undefined>;
  resumeConsultationFromCompletion(id: string, input: { notes?: string; performedBy: string }): Promise<Consultation | undefined>;
  skipConsultationCompletion(id: string, input: { performedBy: string }): Promise<Consultation | undefined>;
  awaitCaseCompletion(id: string, input: { reason: string; performedBy: string; performerName: string }): Promise<LawCase | undefined>;
  resumeCaseFromCompletion(id: string, input: { notes?: string; performedBy: string; performerName: string; isValidStage: (stage: string) => boolean }): Promise<{ ok: true; lawCase: LawCase } | { ok: false; reason: "INVALID_SAVED_STAGE" | "NOT_FOUND" }>;
  // The THIRD exit from استكمال_البيانات (the other two being resume and the
  // normal forward advance): the client never supplied the data, so the case
  // closes. missingData is resolved by the ROUTE — see the priority chain there.
  closeCaseForNoResponse(id: string, input: { missingData: string; notes: string; performedBy: string; performerName: string }): Promise<LawCase | undefined>;
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
  // The memo-equivalent of the cases/consultations/contracts "close for no
  // response". Memos have no closure model, so their terminal state is a
  // CANCEL. missingData is resolved by the ROUTE (see the priority chain there).
  cancelMemoForNoResponse(
    id: string,
    input: { missingData: string; notes: string; performedBy: string },
  ): Promise<Memo | undefined>;

  // Return-to-committee from الأخذ_بالملاحظات → لجنة_المراجعة. One
  // transaction: stage update + activity-log row. Used by the
  // /return-to-committee endpoints across the three entities.
  returnCaseToCommittee(
    id: string,
    input: { notes: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined>;
  // Reasoned override: skip the review committee (إحالة_للجنة_المراجعة →
  // جاهزة_للرفع) with a MANDATORY reason. Same one-transaction shape as
  // returnCaseToCommittee: stage update + stage-history entry + activity-log row.
  skipCaseCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined>;
  // Reopen a CLOSED case (مقفلة) at a caller-chosen stage. Same one-transaction
  // shape as skipCaseCommittee: stage update + stage-history entry + activity-log
  // row. All lifecycle flags the reopen must flip are decided by the ROUTE and
  // passed in via `flags` — this method writes, it does not decide.
  reopenCase(
    id: string,
    input: {
      targetStage: string;
      notes: string;
      performedBy: string;
      performerName: string;
      numberField: { field: CaseNumberField; value: string } | null;
      flags: ReopenLifecycleFlags;
    },
  ): Promise<LawCase | undefined>;
  returnMemoToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Memo | undefined>;
  // Reasoned override: skip the memo review committee (لجنة_مراجعة →
  // جاهزة_للرفع) with a MANDATORY reason. Same one-transaction shape as
  // returnMemoToCommittee: stage update + memo_activity_log row. performerName
  // is the ACTING display name (may carry "نيابةً عن …"), which memo_activity_log
  // has no column for — it is stamped into the description + metadata instead.
  skipMemoCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Memo | undefined>;
  returnConsultationToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Consultation | undefined>;
  // Reasoned override: skip the review committee (لجنة_مراجعة → جاهزة_للإرسال)
  // with a MANDATORY reason. WRITTEN consultations only — the caller enforces
  // that (phone/procedural have no committee stage AND no READY stage). Same
  // one-transaction shape as returnConsultationToCommittee. performerName is the
  // ACTING display name (may carry "نيابةً عن …"); consultation_activity_log has
  // no column for it, so it is stamped into the description + metadata.
  skipConsultationCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Consultation | undefined>;

  // ==================== Contracts module ====================
  // Mirror of the consultation surface (createConsultation /
  // updateConsultationAndLog / record* / pause* / await* / skip*) for
  // the new العقود والمشاريع module. Intentionally narrower than
  // consultations — no delivery extensions, no convert-to-case, no
  // study/draft helper tables. Attachment methods land in commit 3.
  getAllContracts(): Promise<Contract[]>;
  getContractById(id: string): Promise<Contract | undefined>;
  createContract(data: Partial<Contract>, createdBy: string): Promise<Contract>;
  updateContract(id: string, data: Partial<Contract>): Promise<Contract | undefined>;
  updateContractAndLog(
    id: string,
    data: Partial<Contract>,
    activity: { activityType: string; description: string; metadata?: Record<string, any>; performedBy: string | null },
  ): Promise<Contract | undefined>;
  deleteContract(id: string): Promise<boolean>;
  pauseContract(id: string, input: { reason: string; performedBy: string; pauseUntil?: string | null }): Promise<Contract | undefined>;
  unpauseContract(id: string, input: { notes?: string; performedBy: string }): Promise<Contract | undefined>;
  awaitContractCompletion(id: string, input: { reason: string; performedBy: string }): Promise<Contract | undefined>;
  resumeContractFromCompletion(id: string, input: { notes?: string; performedBy: string }): Promise<Contract | undefined>;
  skipContractCompletion(id: string, input: { performedBy: string }): Promise<Contract | undefined>;
  recordContractInternalReview(input: {
    contractId: string;
    reviewerId: string;
    decision: string;
    notes: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<Contract>;
  recordContractCommitteeDecision(input: {
    contractId: string;
    decision: string;
    notes: string;
    decidedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<Contract>;
  recordContractNoteOutcome(input: {
    contractId: string;
    outcome: string;
    notes: string;
    recordedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<Contract>;
  returnContractToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Contract | undefined>;
  // Reasoned override: skip the review committee (لجنة_مراجعة → جاهزة_للإرسال)
  // with a MANDATORY reason. Contracts have a single stage flow (no phone/
  // procedural analogue) so — unlike skipConsultationCommittee — there is NO
  // type guard. Same one-transaction shape as returnContractToCommittee.
  // performerName is the ACTING display name (may carry "نيابةً عن …");
  // contract_activity_log has no column for it, so it is stamped into the
  // description + metadata.
  skipContractCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Contract | undefined>;
  // Same shape, different stage: مراجعة_داخلية → لجنة_مراجعة. CONTRACTS ONLY.
  skipContractInternalReview(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Contract | undefined>;
  createContractActivity(input: {
    contractId: string;
    activityType: string;
    description: string;
    metadata?: Record<string, any>;
    performedBy: string | null;
  }): Promise<ContractActivity>;
  getContractActivities(contractId: string): Promise<ContractActivity[]>;
  // Attachment methods. Designated-slot uploads delete the prior file
  // from disk + DB inside one transaction; the helper returns both the
  // new row and the displaced one (when any) so the route layer can
  // log "replaced" vs "added" deterministically.
  createContractAttachment(input: {
    contractId: string;
    slotKey: string | null;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    description: string | null;
    uploadedBy: string;
  }): Promise<{ attachment: ContractAttachment; replaced: ContractAttachment | null }>;
  getContractAttachments(contractId: string): Promise<ContractAttachment[]>;
  getContractAttachmentById(id: string): Promise<ContractAttachment | undefined>;
  getContractAttachmentBySlot(contractId: string, slotKey: string): Promise<ContractAttachment | undefined>;
  deleteContractAttachment(id: string): Promise<ContractAttachment | undefined>;

  // Judgment-deed (صك) and hearing-minutes (ضبط الجلسة) attachments. Same shape
  // as the contract methods above, minus the slot dimension: exactly ONE file
  // per parent (a plain unique index on the parent id enforces it), so the
  // "create" call is always a create-or-replace and always returns the
  // displaced row when there was one — the route layer needs it both to log
  // "replaced" vs "added" and to delete the displaced blob after commit.
  createCaseAttachment(input: {
    caseId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  }): Promise<{ attachment: CaseAttachment; replaced: CaseAttachment | null }>;
  getCaseAttachment(caseId: string): Promise<CaseAttachment | undefined>;
  getCaseAttachmentById(id: string): Promise<CaseAttachment | undefined>;
  deleteCaseAttachment(id: string): Promise<CaseAttachment | undefined>;

  createHearingAttachment(input: {
    hearingId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  }): Promise<{ attachment: HearingAttachment; replaced: HearingAttachment | null }>;
  getHearingAttachment(hearingId: string): Promise<HearingAttachment | undefined>;
  getHearingAttachmentById(id: string): Promise<HearingAttachment | undefined>;
  deleteHearingAttachment(id: string): Promise<HearingAttachment | undefined>;

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
    taskSpecialties: dbUser.taskSpecialties ?? null,
    mustChangePassword: dbUser.mustChangePassword ?? true,
    createdAt: toISOString(dbUser.createdAt),
    updatedAt: toISOString(dbUser.updatedAt),
  };
}

// Stage-based "current number" (product-owner design, 2026-07, revised).
//
// A case carries several reference numbers at once — each in its OWN column,
// none merged (no migration). The displayed "current number" is chosen on read
// in this PRIORITY order:
//
//   1) najizNumber present            → najizNumber   (court number wins outright)
//   2) else reached settlement AND a
//      settlement number present      → mohrNumber || taradiNumber
//   3) else                           → the stored caseNumber (base)
//
// PERSISTENCE (the revision): the settlement number must show from مداولة_الصلح
// onward through EVERY later pre-court stage (تحرير_صحيفة_الدعوى, مراجعة_داخلية,
// إحالة_للجنة_المراجعة, الأخذ_بالملاحظات, جاهزة_للرفع …) until a najizNumber
// exists — not only while the case literally sits at the settlement stage. The
// switch to the court number is triggered by najizNumber EXISTING, not by any
// specific stage.
//
// WHY "reached settlement" cannot be existence-only: mohrNumber / taradiNumber
// are NOT set only by the settlement prompt. Both also have registration write
// paths — PATCH /api/cases/:id/mohr (routes.ts:1978, status مقيدة_في_الموارد) and
// /taradi (:1913), plus inline edit in case-details-dialog. A labor case can be
// registered in MOHR (mohrNumber set) during دراسة/توجيه, BEFORE مداولة_الصلح.
// So "number exists" ≠ "settlement reached", and pure existence would wrongly
// show the settlement number during توجيه_العميل_بالتسوية / بانتظار_رفع_العميل_
// للتسوية, which the owner confirmed must show base.
//
// WHY a stage-NAME set cannot gate it either: the post-settlement stages
// (تحرير_صحيفة_الدعوى, مراجعة_داخلية, جاهزة_للرفع …) are the SAME values that sit
// BEFORE settlement in the commercial/general arrays. Membership can't tell a
// labor case PAST settlement from a commercial case still heading INTO it.
//
// SIGNAL USED: stageHistory. It records the case's actual PATH, so
// `history.some(stage === مداولة_الصلح)` means "this case genuinely entered
// settlement", disambiguating the shared stage values by the case's own journey,
// per department, with no DB lookup. The explicit SETTLEMENT_STAGES check covers
// the case that is AT a settlement stage right now (esp. commercial's
// قيد_التدقيق_في_تراضي, which precedes مداولة_الصلح, so history wouldn't contain
// it yet).
//
// Department is still inferred from WHICH NUMBER EXISTS — mohrNumber is written
// only by the labor flow (its endpoints reject non-عمالي cases), so
// `mohrNumber || taradiNumber` resolves labor → MOHR, commercial/general →
// تراضي; mohr FIRST so an L1-bug row carrying a stray taradiNumber still shows
// its MOHR number.
//
// NULL-SAFE: both non-base branches guard on a trimmed non-empty value and fall
// back to caseNumber (NOT NULL) — never blank. In-court cases created WITH a
// court number are unaffected: createCase stores courtCaseNumber AS caseNumber,
// so base already yields the court number (and najizNumber is empty for them).
const SETTLEMENT_STAGES = new Set(["قيد_التدقيق_في_تراضي", "مداولة_الصلح"]);

function reachedSettlement(dbCase: any): boolean {
  if (SETTLEMENT_STAGES.has(dbCase.currentStage)) return true;
  const history = Array.isArray(dbCase.stageHistory) ? dbCase.stageHistory : [];
  return history.some((h: any) => h && h.stage === "مداولة_الصلح");
}

function deriveCurrentCaseNumber(dbCase: any): string {
  const base = dbCase.caseNumber;
  // COURT NUMBER WINS (owner decision 2026-07). Existence-based, exactly like
  // the najiz rule below it: once a case has a court-issued number that IS the
  // case's number everywhere else, so no later platform number should mask it.
  // Mostly a no-op by construction — createCase stores a user-supplied
  // courtCaseNumber AS caseNumber, so base already yields it for cases created
  // in court. It changes the display only for cases that acquired the number
  // LATER, via the منظورة capture (routes.ts :2787) after a najiz/معين run.
  const court = (dbCase.courtCaseNumber || "").trim();
  if (court) return court;
  const najiz = (dbCase.najizNumber || "").trim();
  if (najiz) return najiz;
  const settlement = (dbCase.mohrNumber || dbCase.taradiNumber || "").trim();
  if (settlement && reachedSettlement(dbCase)) return settlement;
  return base;
}

// Map DB case to interface LawCase
function mapDbCase(dbCase: any): LawCase {
  return {
    id: dbCase.id,
    caseNumber: deriveCurrentCaseNumber(dbCase),
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
    judgmentDeedReceivedDate: dbCase.judgmentDeedReceivedDate || null,
    objectionWindowDays: dbCase.objectionWindowDays ?? null,
    executionRequestNumber: dbCase.executionRequestNumber || null,
    appealLawyerId: dbCase.appealLawyerId || null,
    litigatorId: dbCase.litigatorId || null,
    internalReviewerId: dbCase.internalReviewerId || null,
    moeenNumber: dbCase.moeenNumber || null,
    clientRole: dbCase.clientRole || null,
    closureReason: dbCase.closureReason || null,
    closureReasonOther: dbCase.closureReasonOther || null,
    isArchived: dbCase.isArchived ?? false,
    dataCompletionLastAckAt: toISOStringOrNull(dbCase.dataCompletionLastAckAt),
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
    pauseUntil: dbCase.pauseUntil ?? null,
    agencyIssuanceRequested: dbCase.agencyIssuanceRequested ?? false,
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

// The display name of a client, from a row that LEFT-joined the clients table
// (so every column may be null when there is no linked client). Mirrors the
// frontend's getClientName rule (clients-context: فرد → individualName, else
// companyName) so a client reads the same name in the tasks feed as everywhere
// else, with the other column as a fallback for rows whose type and filled name
// disagree. Returns "" when nothing is joined; callers map that to undefined.
function clientDisplayName(row: {
  clientType: string | null;
  clientIndividualName: string | null;
  clientCompanyName: string | null;
}): string {
  const preferred = row.clientType === "فرد" ? row.clientIndividualName : row.clientCompanyName;
  return (preferred || row.clientIndividualName || row.clientCompanyName || "").trim();
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
    title: dbCon.title ?? null,
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
    // Category falls back to "عادية" so consultations created before the column
    // existed (and never backfilled) still present a valid value to the UI.
    category: dbCon.category ?? "عادية",
    // @deprecated — feature removed; nothing writes this and no UI reads it.
    // Still mapped so historical rows round-trip unchanged through update paths
    // and the column keeps its stored value. See the schema.ts note.
    expectedDeliveryDate: toISOStringOrNull(dbCon.expectedDeliveryDate),
    // Falls back so rows created before the column existed still present
    // a valid value to the UI.
    source: dbCon.source ?? "عبر_المجموعة",
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
    pauseUntil: dbCon.pauseUntil ?? null,
    dataCompletionLastAckAt: toISOStringOrNull(dbCon.dataCompletionLastAckAt),
    // Committee-referral fields. All nullable so legacy rows
    // (pre-add-consultation-committee-fields migration) surface as null.
    internalReviewerId: dbCon.internalReviewerId ?? null,
    priority: dbCon.priority ?? null,
    priorityReason: dbCon.priorityReason ?? null,
    // Follow-up cycle. Defaults so rows that pre-date the migration (a
    // stale running server's view) still emit a valid count and the
    // FE's "in cycle" checks never see undefined.
    followUpCount: dbCon.followUpCount ?? 0,
    followUpStartedAt: toISOStringOrNull(dbCon.followUpStartedAt),
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

// ==================== Contract mappers + helpers ====================
// Mirror of mapDbConsultation / mapDbConsultationActivity. Kept inline
// rather than reused so the contract column set can drift independently
// (e.g. attachment slot fields) without splitting the consultation
// signature.
function mapDbContract(row: any): Contract {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    title: row.title,
    clientId: row.clientId,
    contractType: row.contractType,
    description: row.description ?? "",
    currentStage: row.currentStage ?? "استلام",
    status: row.status ?? "active",
    departmentId: row.departmentId,
    assignedTo: row.assignedTo ?? null,
    internalReviewerId: row.internalReviewerId ?? null,
    priority: row.priority ?? null,
    priorityReason: row.priorityReason ?? null,
    reviewNotes: row.reviewNotes ?? "",
    closureReason: row.closureReason ?? null,
    closureReasonOther: row.closureReasonOther ?? null,
    pauseReason: row.pauseReason ?? null,
    pausedBy: row.pausedBy ?? null,
    pausedAt: toISOStringOrNull(row.pausedAt),
    awaitingCompletion: row.awaitingCompletion ?? false,
    savedStage: row.savedStage ?? null,
    pauseUntil: row.pauseUntil ?? null,
    dataCompletionLastAckAt: toISOStringOrNull(row.dataCompletionLastAckAt),
    // Follow-up cycle — mirrors mapDbConsultation. The column is NOT NULL
    // default 0; `?? 0` keeps the mapper's shape identical to the
    // consultation side and safe for any row that predates the backfill.
    followUpCount: row.followUpCount ?? 0,
    followUpStartedAt: toISOStringOrNull(row.followUpStartedAt),
    createdBy: row.createdBy,
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
    closedAt: toISOStringOrNull(row.closedAt),
  };
}

function mapDbContractAttachment(row: any): ContractAttachment {
  return {
    id: row.id,
    contractId: row.contractId,
    slotKey: row.slotKey ?? null,
    fileName: row.fileName,
    filePath: row.filePath,
    fileSize: typeof row.fileSize === "number" ? row.fileSize : Number(row.fileSize ?? 0),
    mimeType: row.mimeType,
    description: row.description ?? null,
    uploadedBy: row.uploadedBy,
    uploadedAt: toISOString(row.uploadedAt),
  };
}

// fileSize is bigint(mode:"number") — the same defensive Number() coercion as
// mapDbContractAttachment, since some drivers hand bigints back as strings.
function mapDbCaseAttachment(row: any): CaseAttachment {
  return {
    id: row.id,
    caseId: row.caseId,
    fileName: row.fileName,
    filePath: row.filePath,
    fileSize: typeof row.fileSize === "number" ? row.fileSize : Number(row.fileSize ?? 0),
    mimeType: row.mimeType,
    uploadedBy: row.uploadedBy,
    uploadedAt: toISOString(row.uploadedAt),
  };
}

function mapDbHearingAttachment(row: any): HearingAttachment {
  return {
    id: row.id,
    hearingId: row.hearingId,
    fileName: row.fileName,
    filePath: row.filePath,
    fileSize: typeof row.fileSize === "number" ? row.fileSize : Number(row.fileSize ?? 0),
    mimeType: row.mimeType,
    uploadedBy: row.uploadedBy,
    uploadedAt: toISOString(row.uploadedAt),
  };
}

function mapDbContractActivity(row: any): ContractActivity {
  return {
    id: row.id,
    contractId: row.contractId,
    activityType: row.activityType,
    description: row.description ?? "",
    metadata: (row.metadata && typeof row.metadata === "object") ? row.metadata : {},
    performedBy: row.performedBy ?? null,
    performedAt: toISOString(row.performedAt),
  };
}

// Same scheme as generateConsultationNumber — short prefix + nanoid
// suffix. Collisions retried in createContract.
function generateContractNumber(): string {
  return `CT-${nanoid(6).toUpperCase()}`;
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
    memoRequired: dbHearing.memoRequired ?? false,
    opponentResponseRequired: dbHearing.opponentResponseRequired ?? false,
    hearingReport: dbHearing.hearingReport || "",
    recommendations: dbHearing.recommendations || "",
    nextSteps: dbHearing.nextSteps || "",
    contactCompleted: dbHearing.contactCompleted ?? false,
    reportCompleted: dbHearing.reportCompleted ?? false,
    sessionReportExported: dbHearing.sessionReportExported ?? false,
    agencyVerificationAckAt: toISOStringOrNull(dbHearing.agencyVerificationAckAt),
    agencyVerificationAnswer: dbHearing.agencyVerificationAnswer ?? null,
    adminTasksCreated: dbHearing.adminTasksCreated ?? false,
    opponentMemos: dbHearing.opponentMemos || "",
    hearingMinutes: dbHearing.hearingMinutes || "",
    isFlagged: dbHearing.isFlagged ?? false,
    flagReason: dbHearing.flagReason ?? null,
    flaggedBy: dbHearing.flaggedBy ?? null,
    flaggedAt: toISOStringOrNull(dbHearing.flaggedAt),
    cancellationReason: dbHearing.cancellationReason ?? null,
    attendingLawyerId: dbHearing.attendingLawyerId || null,
    reminderSent24h: dbHearing.reminderSent24h ?? false,
    reminderSent1h: dbHearing.reminderSent1h ?? false,
    googleCalendarEventId: dbHearing.googleCalendarEventId,
    notes: dbHearing.notes || "",
    createdAt: toISOString(dbHearing.createdAt),
    updatedAt: toISOString(dbHearing.updatedAt),
  };
}

// Weekend-aware lead date for the agency-verification reminder. The lead is
// "2 days before the hearing", but the Saudi weekend (Friday + Saturday) is
// skipped: if hearingDate − 2 calendar days lands on Friday/Saturday, step
// back to the working day before the weekend (Thursday). So a Sunday hearing
// surfaces from Thursday, not Friday/Saturday. All math is in UTC so it never
// drifts a day by local timezone. Working days = Sun–Thu; weekend = Fri(5)/Sat(6)
// by getUTCDay(). Returns the surface-start date as "YYYY-MM-DD".
function agencyVerificationLeadDate(hearingDate: string): string {
  const d = new Date(`${hearingDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 2);
  while (d.getUTCDay() === 5 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().split("T")[0];
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
    contractId: dbTask.contractId ?? null,
    clientId: dbTask.clientId ?? null,
    reviewNote: dbTask.reviewNote || "",
    originalRequesterId: dbTask.originalRequesterId ?? null,
    routedDepartmentId: dbTask.routedDepartmentId ?? null,
    workerId: dbTask.workerId ?? null,
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
    pauseUntil: dbMemo.pauseUntil ?? null,
    dataCompletionLastAckAt: toISOStringOrNull(dbMemo.dataCompletionLastAckAt),
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

  async getDepartmentHeads(departmentId: string): Promise<User[]> {
    // Authoritative source for PATH-2 dept-routing: users with the
    // department_head role in this department who are active. departments.headId
    // is only partially seeded (e.g. set for dept "1" but null for dept "2"
    // whose real head exists only via this users query) → never trust it here.
    const result = await db.select().from(users).where(
      and(
        eq(users.role, "department_head"),
        eq(users.departmentId, departmentId),
        eq(users.isActive, true),
      ),
    );
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
      taskSpecialties: data.taskSpecialties ?? null,
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

  async getCasesByRole(role: string, userId: string, departmentId?: string): Promise<LawCase[]> {
    if (["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"].includes(role)) {
      return this.getAllCases();
    }
    if ((role === "department_head" || role === "labor_review_head") && departmentId) {
      const result = await db.select().from(lawCases)
        .where(eq(lawCases.departmentId, departmentId))
        .orderBy(desc(lawCases.updatedAt));
      return result.map(mapDbCase);
    }
    if (role === "employee") {
      const result = await db.select().from(lawCases)
        .where(
          sql`(${lawCases.primaryLawyerId} = ${userId} OR ${lawCases.responsibleLawyerId} = ${userId} OR ${lawCases.assignedLawyers}::jsonb @> ${JSON.stringify([userId])}::jsonb)`
        )
        .orderBy(desc(lawCases.updatedAt));
      return result.map(mapDbCase);
    }
    return [];
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
      clientRole: data.clientRole ?? null,
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
    
    const { createdAt, updatedAt, closedAt, archivedAt, dataCompletionLastAckAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    if (closedAt !== undefined) {
      updateData.closedAt = closedAt ? new Date(closedAt) : null;
    }
    // data_completion_last_ack_at is a date-mode column — same idiom as
    // archivedAt below: convert the ISO string callers pass into a Date.
    if (dataCompletionLastAckAt !== undefined) {
      updateData.dataCompletionLastAckAt = dataCompletionLastAckAt ? new Date(dataCompletionLastAckAt) : null;
    }
    // archived_at is a date-mode column; mirror the closedAt idiom so the
    // ISO string callers pass (e.g. the auto-archive scheduler) becomes a
    // Date. Previously archivedAt was spread through as a raw string, which
    // made drizzle call `string.toISOString()` and throw — silently breaking
    // auto-archive inside the scheduler's try/catch.
    if (archivedAt !== undefined) {
      updateData.archivedAt = archivedAt ? new Date(archivedAt) : null;
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

    // حذف الإشعارات المرتبطة بالجلسات — batched IN (…) instead of one
    // DELETE per id (same rows removed; the length guard avoids an empty IN).
    if (hearingIds.length > 0) {
      await db.delete(notifications).where(and(eq(notifications.relatedType, "hearing"), inArray(notifications.relatedId, hearingIds)));
      await db.delete(attachments).where(and(eq(attachments.entityType, "hearing"), inArray(attachments.entityId, hearingIds)));
    }

    // حذف الإشعارات المرتبطة بالمذكرات — batched IN (…) as above.
    if (memoIds.length > 0) {
      await db.delete(notifications).where(and(eq(notifications.relatedType, "memo"), inArray(notifications.relatedId, memoIds)));
      await db.delete(attachments).where(and(eq(attachments.entityType, "memo"), inArray(attachments.entityId, memoIds)));
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

  async getConsultationsByRole(role: string, userId: string, departmentId?: string): Promise<Consultation[]> {
    if (["branch_manager", "admin_support", "consultations_review_head", "cases_review_head"].includes(role)) {
      return this.getAllConsultations();
    }
    if ((role === "department_head" || role === "labor_review_head") && departmentId) {
      const result = await db.select().from(consultations)
        .where(eq(consultations.departmentId, departmentId));
      return result.map(mapDbConsultation);
    }
    if (role === "employee") {
      const conditions = departmentId
        ? sql`(${consultations.departmentId} = ${departmentId} OR ${consultations.assignedTo} = ${userId})`
        : eq(consultations.assignedTo, userId);
      const result = await db.select().from(consultations).where(conditions);
      return result.map(mapDbConsultation);
    }
    return [];
  }

  async getConsultationById(id: string): Promise<Consultation | undefined> {
    const result = await db.select().from(consultations).where(eq(consultations.id, id));
    return result[0] ? mapDbConsultation(result[0]) : undefined;
  }

  async createConsultation(data: Partial<Consultation>, createdBy: string): Promise<Consultation> {
    const id = randomUUID();
    const now = new Date();

    // Category is a triage label only. Default to STANDARD when not supplied so
    // older clients keep working. It used to also compute expectedDeliveryDate
    // (createdAt + SLA days); that feature was REMOVED, so nothing is computed
    // from it any more and expectedDeliveryDate is left NULL on new rows.
    const incomingCategory = data.category as ConsultationCategoryValue | undefined;
    const category: ConsultationCategoryValue =
      incomingCategory && (Object.values(ConsultationCategory) as string[]).includes(incomingCategory)
        ? incomingCategory
        : ConsultationCategory.STANDARD;

    // Pre-rebuild this method conflated the two: it wrote the stage value
    // ("استلام") into the status column. Status now is a separate
    // lifecycle enum (active | converted | closed) per spec §3.1.2;
    // currentStage carries the workflow position. Keep them apart at the
    // insert site so the column defaults aren't the only line of defence.
    const baseConsultation = {
      id,
      // Optional — the column is nullable and pre-existing rows have none, so
      // an empty title is stored as NULL rather than "".
      title: data.title?.trim() ? data.title.trim() : null,
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
      // expectedDeliveryDate is deliberately NOT set — the feature was removed
      // and the column is nullable, so new rows simply leave it NULL.
      // Intake channel. Literal fallback mirrors mapDbConsultation's
      // "عادية" style; column default also guards manual inserts.
      source: data.source || "عبر_المجموعة",
      // Committee-referral fields. Optional at create — the committee
      // form is typically filled in later, just before the consultation
      // moves into لجنة_مراجعة. Pass-through any values the create
      // dialog supplies.
      internalReviewerId: data.internalReviewerId ?? null,
      priority:           data.priority ?? null,
      priorityReason:     data.priorityReason ?? null,
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
          });
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

    const { createdAt, updatedAt, closedAt, followUpStartedAt, expectedDeliveryDate, dataCompletionLastAckAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    // Date-mode timestamp columns: the interface types these as ISO strings,
    // but Drizzle expects Date. Convert here (mirrors closedAt) so callers
    // pass strings and never need a cast.
    if (closedAt !== undefined) {
      updateData.closedAt = closedAt ? new Date(closedAt) : null;
    }
    if (followUpStartedAt !== undefined) {
      updateData.followUpStartedAt = followUpStartedAt ? new Date(followUpStartedAt) : null;
    }
    if (expectedDeliveryDate !== undefined) {
      updateData.expectedDeliveryDate = expectedDeliveryDate ? new Date(expectedDeliveryDate) : null;
    }
    if (dataCompletionLastAckAt !== undefined) {
      updateData.dataCompletionLastAckAt = dataCompletionLastAckAt ? new Date(dataCompletionLastAckAt) : null;
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

      const { createdAt, updatedAt, closedAt, followUpStartedAt, expectedDeliveryDate, ...updateFields } = data;
      const now = new Date();
      const updateData: any = { ...updateFields, updatedAt: now };
      // Date-mode timestamp columns: interface types them as ISO strings,
      // Drizzle wants Date. Convert here (mirrors closedAt) so callers pass
      // strings and drop the cast (Phase-3 3C: followUpStartedAt +
      // expectedDeliveryDate, previously cast at the routes.ts call site).
      if (closedAt !== undefined) {
        updateData.closedAt = closedAt ? new Date(closedAt) : null;
      }
      if (followUpStartedAt !== undefined) {
        updateData.followUpStartedAt = followUpStartedAt ? new Date(followUpStartedAt) : null;
      }
      if (expectedDeliveryDate !== undefined) {
        updateData.expectedDeliveryDate = expectedDeliveryDate ? new Date(expectedDeliveryDate) : null;
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
      });

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
    input: { reason: string; performedBy: string; pauseUntil?: string | null },
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
        // Optional auto-lift date, already format- and past-validated by the
        // route (validatePauseUntil). Falsy/absent → null → open-ended pause,
        // which is the pre-feature behaviour.
        pauseUntil: input.pauseUntil || null,
        updatedAt: now,
      }).where(eq(consultations.id, id));
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.PAUSED,
        description: `تم تعليق الاستشارة — السبب: ${input.reason}`,
        metadata: { reason: input.reason },
        performedBy: input.performedBy,
        performedAt: now,
      });
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
      }).where(eq(consultations.id, id));
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.AWAIT_COMPLETION,
        description: `بانتظار استكمال المرفقات والبيانات — السبب: ${input.reason}`,
        metadata: { reason: input.reason, savedStage: fromStage },
        performedBy: input.performedBy,
        performedAt: now,
      });
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
      }).where(eq(consultations.id, id));
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
      });
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
      // Procedural workflow lands on IN_PROGRESS instead of STUDY — its
      // stage-3 token. WRITTEN and PHONE both use STUDY (دراسة).
      const resolvedType = resolveConsultationType(existing.consultationType);
      const targetStage = resolvedType === ConsultationType.PROCEDURAL
        ? ConsultationStage.IN_PROGRESS
        : ConsultationStage.STUDY;
      await tx.update(consultations).set({
        currentStage: targetStage,
        updatedAt: now,
      }).where(eq(consultations.id, id));
      const targetLabel = targetStage === ConsultationStage.IN_PROGRESS ? "جاري العمل" : "دراسة";
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.COMPLETION_SKIPPED,
        description: `تم تجاوز مرحلة الاستكمال والانتقال مباشرة إلى ${targetLabel}`,
        metadata: { targetStage },
        performedBy: input.performedBy,
        performedAt: now,
      });
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
        // ⚠ LOAD-BEARING. Without this a manual unpause leaves the auto-lift
        // date behind, and the NEXT pause silently inherits it — a pause set
        // today would lift on a date somebody chose weeks ago. Every one of the
        // four unpause methods clears it; so does the scheduler, which lifts an
        // expired pause by calling these same methods.
        pauseUntil: null,
        updatedAt: now,
      }).where(eq(consultations.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.UNPAUSED,
        description: notes ? `تم إلغاء التعليق — ${notes}` : "تم إلغاء التعليق",
        metadata: notes ? { notes } : {},
        performedBy: input.performedBy,
        performedAt: now,
      });
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
      memoRequired: data.memoRequired || false,
      opponentResponseRequired: data.opponentResponseRequired || false,
      hearingReport: "",
      recommendations: "",
      nextSteps: "",
      contactCompleted: false,
      reportCompleted: false,
      sessionReportExported: false,
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
    
    const { createdAt, updatedAt, agencyVerificationAckAt, flaggedAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    // agency_verification_ack_at is a date-mode column — convert the ISO
    // string callers pass into a Date (mirrors updateCase's idiom).
    if (agencyVerificationAckAt !== undefined) {
      updateData.agencyVerificationAckAt = agencyVerificationAckAt ? new Date(agencyVerificationAckAt) : null;
    }
    // flagged_at is date-mode too. Same idiom, and NOT optional: the Phase-4 S3
    // audit found that skipping this conversion for archivedAt made drizzle
    // throw on `value.toISOString()` inside a swallowed try/catch, silently
    // breaking auto-archive. One chokepoint, every caller covered.
    if (flaggedAt !== undefined) {
      updateData.flaggedAt = flaggedAt ? new Date(flaggedAt) : null;
    }
    await db.update(hearings).set(updateData).where(eq(hearings.id, id));

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

  // Sub-step 9 — the مهامي "منجزة" archive: CLOSED (مكتمل + ملغي) GENERAL (عام)
  // tasks only, scoped to what the viewer may see (mirrors the live-feed field-
  // task visibility). Fetched lazily (only when the user expands the archive
  // section), so it never rides on the 30s my-tasks poll.
  //   • branch_manager → firm-wide (all closed general tasks);
  //   • department_head → involved (assignee/worker/creator/requester) OR routed
  //     to their department OR on a case in their department (the routed-dept +
  //     parent-case clauses match the live feed's dept_head scope, so a task
  //     that flowed through the head — but where he is not the final assignee —
  //     still appears);
  //   • everyone else (incl. admin_support) → involved only (their own closed
  //     general tasks as requester, worker, creator, or final assignee).
  async getArchivedGeneralTasks(user: { id: string; role: string; departmentId: string | null }): Promise<FieldTask[]> {
    const all = await this.getAllFieldTasks();
    const closed = all.filter((t) =>
      t.taskType === FieldTaskType.GENERAL &&
      (t.status === FieldTaskStatus.COMPLETED || t.status === FieldTaskStatus.CANCELLED),
    );
    if (user.role === "branch_manager") return closed;
    const uid = user.id;
    const involved = (t: FieldTask) =>
      t.assignedTo === uid || t.workerId === uid || t.assignedBy === uid || t.originalRequesterId === uid;
    if (user.role === "department_head" && user.departmentId) {
      const dept = user.departmentId;
      const cases = await this.getAllCases();
      const deptCaseIds = new Set(cases.filter((c) => c.departmentId === dept).map((c) => c.id));
      return closed.filter((t) => involved(t) || t.routedDepartmentId === dept || (!!t.caseId && deptCaseIds.has(t.caseId)));
    }
    return closed.filter(involved);
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
      contractId: data.contractId || null,
      clientId: data.clientId || null,
      reviewNote: "",
      // originalRequesterId = the creator (= assignedBy at creation) for general
      // (عام) tasks only; the write-once return address. Other (auto/field) task
      // types leave it null. routedDepartmentId/workerId are set later by the
      // dept-route / complete transitions, never at plain creation.
      originalRequesterId: data.taskType === FieldTaskType.GENERAL ? assignedBy : (data.originalRequesterId ?? null),
      routedDepartmentId: data.routedDepartmentId ?? null,
      workerId: data.workerId ?? null,
      assignedTo: data.assignedTo || "",
      assignedBy,
      // Default = قيد_الانتظار (the person-direct path passes no status, so it is
      // byte-identical). The PATH-2 dept-route passes بانتظار_التوزيع to land the
      // task with the dept_head for distribution.
      status: data.status ?? "قيد_الانتظار",
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

  async createGeneralTaskEvent(data: { fieldTaskId: string; actorId: string; actorName: string; eventType: string; body: string | null }): Promise<void> {
    await db.insert(generalTaskEvents).values({
      id: randomUUID(),
      fieldTaskId: data.fieldTaskId,
      actorId: data.actorId,
      actorName: data.actorName,
      eventType: data.eventType,
      body: data.body,
      createdAt: new Date(),
    });
  }

  async getGeneralTaskEvents(fieldTaskId: string): Promise<GeneralTaskEvent[]> {
    // Ascending (oldest→newest) — read as a conversation. 200-row cap mirrors
    // getMemoActivities/getCaseActivities.
    const rows = await db.select().from(generalTaskEvents)
      .where(eq(generalTaskEvents.fieldTaskId, fieldTaskId))
      .orderBy(asc(generalTaskEvents.createdAt))
      .limit(200);
    return rows.map((row) => ({
      id: row.id,
      fieldTaskId: row.fieldTaskId,
      actorId: row.actorId ?? null,
      actorName: row.actorName ?? null,
      eventType: row.eventType,
      body: row.body ?? null,
      createdAt: toISOString(row.createdAt),
    }));
  }

  async updateFieldTask(id: string, data: Partial<FieldTask>): Promise<FieldTask | undefined> {
    const existing = await this.getFieldTaskById(id);
    if (!existing) return undefined;
    
    // D7: completedAt is authoritative SERVER-SIDE — never trust a client value.
    // `completedAt` is destructured out here (rest-sibling omit, so the spoofed
    // value never reaches the row) and (re)stamped only on the transition INTO
    // "مكتمل" (FieldTaskStatus.COMPLETED). An already-completed task keeps its
    // original stamp; other edits leave completedAt untouched.
    const { createdAt, updatedAt, completedAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    if (updateFields.status === "مكتمل" && existing.status !== "مكتمل") {
      updateData.completedAt = new Date();
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

  // ORDER BY createdAt DESC — newest first, at the SQL level.
  //
  // This had no ordering at all, so the row order was whatever the plan
  // happened to produce and could differ between two identical polls. That
  // became the hot path for EVERY user on every poll once notification reads
  // were scoped to the recipient, and it is a precondition for any future
  // LIMIT/pagination: "the first N" is meaningless without a defined order.
  //
  // ⚠ The sort is NOT index-only. notifications_created_at_idx is on
  // (created_at) alone and notifications_recipient_idx on (recipient_id) alone,
  // so Postgres filters on the recipient index and then sorts that subset —
  // cheap, because the subset is one user's rows, not the table. Making it
  // index-only would need a composite (recipient_id, created_at DESC), which is
  // additive DDL and belongs in a deliberate index batch, not here.
  //
  // PAGING IS OPTIONAL. With no opts the behaviour is unchanged — everything,
  // newest first — which is what the stats dashboard needs. The notifications
  // LIST passes a window. LIMIT/OFFSET are applied in SQL; fetching everything
  // and slicing in JS would defeat the entire point.
  // FILTERS ARE APPLIED IN THE `WHERE`, BEFORE THE LIMIT — that is the whole
  // point. Filtering a fetched page in JS would yield "30 rows of which 4
  // match", which is worse than no filtering at all: the page would look
  // almost empty while more matches sat one page behind.
  //
  // Exactly two predicates, matching the two TABS the client drives. The type
  // and priority filters stay client-side by decision; if they ever move, they
  // slot into the same conditions array.
  async getNotificationsByRecipient(
    recipientId: string,
    opts?: {
      limit?: number;
      offset?: number;
      /** الإشعارات غير المقروءة. */
      unread?: boolean;
      /** تحتاج رد — flagged as needing a reply and not yet answered. */
      requiresResponse?: boolean;
    },
  ): Promise<Notification[]> {
    const conditions = [eq(notifications.recipientId, recipientId)];
    if (opts?.unread) {
      conditions.push(eq(notifications.isRead, false));
    }
    if (opts?.requiresResponse) {
      // Both halves, mirroring the client's `requiresResponse && !response`.
      conditions.push(eq(notifications.requiresResponse, true));
      conditions.push(isNull(notifications.response));
    }

    const base = db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt));
    const result = opts?.limit !== undefined
      ? await base.limit(opts.limit).offset(opts.offset ?? 0)
      : await base;
    return result.map(mapDbNotification);
  }

  // Stamp "which matter is this about?" onto a PAGE of notifications.
  //
  // Shape copied from getMyTasks' identity pass (fa454d4): batched lookups over
  // the distinct ids the rows already carry, each returning a Map, then one
  // in-memory stamp. Never a per-row query.
  //
  // COST: at most FIVE queries for the whole page — one per relatedType present
  // — and a type contributes nothing when the page holds none of it. The cost
  // scales with the PAGE, never with the user's history, which is exactly why
  // this waited for the list to be bounded.
  //
  // A deleted entity simply has no Map entry, so the row comes back with no
  // linkedContext and the client renders nothing. relatedType "task" carries a
  // DELEGATION id, not a task id, so it is intentionally not resolvable.
  async enrichNotificationsWithContext(rows: Notification[]): Promise<Notification[]> {
    const idsOf = (t: string): string[] =>
      Array.from(new Set(
        rows.filter(n => n.relatedType === t && !!n.relatedId).map(n => n.relatedId as string),
      ));

    const caseIds = idsOf("case");
    const hearingIds = idsOf("hearing");
    const memoIds = idsOf("memo");
    const consultationIds = idsOf("consultation");
    const fieldTaskIds = idsOf("field_task");

    const byCase = new Map<string, NotificationLinkedContext>();
    const byHearing = new Map<string, NotificationLinkedContext>();
    const byMemo = new Map<string, NotificationLinkedContext>();
    const byConsultation = new Map<string, NotificationLinkedContext>();
    const byFieldTask = new Map<string, NotificationLinkedContext>();

    // Empty/whitespace collapses to undefined so the client renders only what
    // actually exists rather than stray separators.
    const clean = (v: string | null | undefined): string | undefined => v?.trim() || undefined;

    if (caseIds.length > 0) {
      const r = await db.select({
        id: lawCases.id, currentStage: lawCases.currentStage, opponentName: lawCases.opponentName,
        clientType: clients.clientType, clientIndividualName: clients.individualName,
        clientCompanyName: clients.companyName,
      }).from(lawCases).leftJoin(clients, eq(lawCases.clientId, clients.id))
        .where(inArray(lawCases.id, caseIds));
      for (const row of r) {
        byCase.set(row.id, {
          clientName: clean(clientDisplayName(row)),
          opponentName: clean(row.opponentName),
          stageLabel: CaseStageLabels[row.currentStage as CaseStageValue] || clean(row.currentStage),
        });
      }
    }

    if (hearingIds.length > 0) {
      const r = await db.select({
        id: hearings.id, hearingDate: hearings.hearingDate, courtName: hearings.courtName,
        opponentName: lawCases.opponentName,
        clientType: clients.clientType, clientIndividualName: clients.individualName,
        clientCompanyName: clients.companyName,
      }).from(hearings)
        .leftJoin(lawCases, eq(hearings.caseId, lawCases.id))
        .leftJoin(clients, eq(lawCases.clientId, clients.id))
        .where(inArray(hearings.id, hearingIds));
      for (const row of r) {
        byHearing.set(row.id, {
          clientName: clean(clientDisplayName(row)),
          opponentName: clean(row.opponentName),
          hearingDate: clean(row.hearingDate),
          courtName: clean(row.courtName),
        });
      }
    }

    if (memoIds.length > 0) {
      const r = await db.select({
        id: memos.id, currentStage: memos.currentStage, opponentName: lawCases.opponentName,
        clientType: clients.clientType, clientIndividualName: clients.individualName,
        clientCompanyName: clients.companyName,
      }).from(memos)
        .leftJoin(lawCases, eq(memos.caseId, lawCases.id))
        .leftJoin(clients, eq(lawCases.clientId, clients.id))
        .where(inArray(memos.id, memoIds));
      for (const row of r) {
        byMemo.set(row.id, {
          clientName: clean(clientDisplayName(row)),
          opponentName: clean(row.opponentName),
          // currentStage is nullable on memos (pre-Phase-9 rows have none).
          stageLabel: row.currentStage
            ? (MemoStageLabels[row.currentStage as MemoStageValue] || clean(row.currentStage))
            : undefined,
        });
      }
    }

    if (consultationIds.length > 0) {
      const r = await db.select({
        id: consultations.id, title: consultations.title, currentStage: consultations.currentStage,
        clientType: clients.clientType, clientIndividualName: clients.individualName,
        clientCompanyName: clients.companyName,
      }).from(consultations).leftJoin(clients, eq(consultations.clientId, clients.id))
        .where(inArray(consultations.id, consultationIds));
      for (const row of r) {
        byConsultation.set(row.id, {
          // title is NULLABLE — same fallback the entity-link-picker uses.
          primary: clean(row.title),
          clientName: clean(clientDisplayName(row)),
          stageLabel: ConsultationStageLabels[row.currentStage as ConsultationStageValue] || clean(row.currentStage),
          // No opponentName — consultations have no such column.
        });
      }
    }

    if (fieldTaskIds.length > 0) {
      // A field task links to AT MOST ONE of four entities, all optional. Four
      // left joins in ONE query beat four round trips; the first non-empty name
      // wins, in the same precedence the task-create form offers them.
      const linkedClient = alias(clients, "ft_linked_client");
      const r = await db.select({
        id: fieldTasks.id,
        caseNumber: lawCases.caseNumber,
        consultationTitle: consultations.title,
        consultationNumber: consultations.consultationNumber,
        contractNumber: contracts.contractNumber,
        clientType: linkedClient.clientType,
        clientIndividualName: linkedClient.individualName,
        clientCompanyName: linkedClient.companyName,
      }).from(fieldTasks)
        .leftJoin(lawCases, eq(fieldTasks.caseId, lawCases.id))
        .leftJoin(consultations, eq(fieldTasks.consultationId, consultations.id))
        .leftJoin(contracts, eq(fieldTasks.contractId, contracts.id))
        .leftJoin(linkedClient, eq(fieldTasks.clientId, linkedClient.id))
        .where(inArray(fieldTasks.id, fieldTaskIds));
      for (const row of r) {
        const name =
          clean(row.caseNumber)
          ?? clean(row.consultationTitle) ?? clean(row.consultationNumber)
          ?? clean(row.contractNumber)
          ?? clean(clientDisplayName(row));
        if (name) byFieldTask.set(row.id, { primary: name });
      }
    }

    const mapFor = (t: string | null): Map<string, NotificationLinkedContext> | null =>
      t === "case" ? byCase
      : t === "hearing" ? byHearing
      : t === "memo" ? byMemo
      : t === "consultation" ? byConsultation
      : t === "field_task" ? byFieldTask
      : null; // "task" carries a delegation id — nothing to resolve.

    return rows.map((n) => {
      const m = mapFor(n.relatedType);
      const ctx = m && n.relatedId ? m.get(n.relatedId) : undefined;
      // Drop an all-empty object so the client's `linkedContext &&` guard is
      // enough and it never renders an empty container.
      if (!ctx || Object.values(ctx).every(v => v === undefined)) return n;
      return { ...n, linkedContext: ctx };
    });
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

  async markAllNotificationsRead(recipientId: string): Promise<number> {
    // Single bulk UPDATE instead of one SELECT-UPDATE-SELECT round-trip per
    // unread row. Marks every still-unread notification for this recipient;
    // .returning() yields exactly the rows flipped, so the count matches the
    // old `unread.length`.
    const now = new Date();
    const updated = await db.update(notifications)
      .set({ isRead: true, readAt: now, status: "read", updatedAt: now })
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });
    return updated.length;
  }

  async getUnreadNotificationCount(recipientId: string): Promise<number> {
    // COUNT(*) instead of loading the whole notifications table to count one
    // recipient's unread rows. Mirrors the getSidebarCounts count idiom.
    const rows = await db.select({ c: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.isRead, false)));
    return rows[0]?.c ?? 0;
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

    const { createdAt, updatedAt, startedAt, completedAt, submittedAt, reviewedAt, dataCompletionLastAckAt, ...updateFields } = data;
    const updateData: any = { ...updateFields, updatedAt: new Date() };
    if (startedAt) updateData.startedAt = new Date(startedAt);
    if (completedAt) updateData.completedAt = new Date(completedAt);
    if (submittedAt) updateData.submittedAt = new Date(submittedAt);
    if (reviewedAt) updateData.reviewedAt = new Date(reviewedAt);
    if (dataCompletionLastAckAt !== undefined) {
      updateData.dataCompletionLastAckAt = dataCompletionLastAckAt ? new Date(dataCompletionLastAckAt) : null;
    }

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
    input: { reason: string; performedBy: string; pauseUntil?: string | null },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(memos).set({
        pauseReason: input.reason,
        pausedBy: input.performedBy,
        pausedAt: now,
        // Optional auto-lift date, already format- and past-validated by the
        // route (validatePauseUntil). Falsy/absent → null → open-ended pause,
        // which is the pre-feature behaviour.
        pauseUntil: input.pauseUntil || null,
        updatedAt: now,
      }).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.PAUSED,
        description: `تم تعليق المذكرة — السبب: ${input.reason}`,
        metadata: { reason: input.reason },
        performedBy: input.performedBy,
        performedAt: now,
      });
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
      }).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.AWAIT_COMPLETION,
        description: `بانتظار استكمال المرفقات والبيانات — السبب: ${input.reason}`,
        metadata: { reason: input.reason, savedStage: existing.status },
        performedBy: input.performedBy,
        performedAt: now,
      });
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
      }).where(eq(memos.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.RESUME_FROM_COMPLETION,
        description: notes ? `العودة من الاستكمال — ${notes}` : "العودة من الاستكمال",
        metadata: notes ? { notes } : {},
        performedBy: input.performedBy,
        performedAt: now,
      });
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
        // ⚠ LOAD-BEARING. Without this a manual unpause leaves the auto-lift
        // date behind, and the NEXT pause silently inherits it — a pause set
        // today would lift on a date somebody chose weeks ago. Every one of the
        // four unpause methods clears it; so does the scheduler, which lifts an
        // expired pause by calling these same methods.
        pauseUntil: null,
        updatedAt: now,
      }).where(eq(memos.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.UNPAUSED,
        description: notes ? `تم إلغاء تعليق المذكرة — ${notes}` : "تم إلغاء تعليق المذكرة",
        metadata: notes ? { notes } : {},
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  // Phase-8 — memo activity log readers. Mirrors getConsultationActivities.
  // TODO: replace with cursor pagination once frontend supports it.
  // 200-row cap prevents unbounded memory growth on long-lived entities.
  async getMemoActivities(memoId: string): Promise<MemoActivity[]> {
    const rows = await db.select().from(memoActivityLog)
      .where(eq(memoActivityLog.memoId, memoId))
      .orderBy(desc(memoActivityLog.performedAt))
      .limit(200);
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
      });

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
      }).returning();

      await tx.update(memos)
        .set({ currentStage: input.nextStage, updatedAt: now })
        .where(eq(memos.id, input.memoId));

      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: input.memoId,
        activityType: MemoActivityType.INTERNAL_REVIEW,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });

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
      }).returning();

      await tx.update(memos)
        .set({ currentStage: input.nextStage, updatedAt: now })
        .where(eq(memos.id, input.memoId));

      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: input.memoId,
        activityType: MemoActivityType.COMMITTEE_DECISION,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });

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
      }).returning();

      await tx.update(memos)
        .set({ currentStage: input.nextStage, updatedAt: now })
        .where(eq(memos.id, input.memoId));

      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: input.memoId,
        activityType: MemoActivityType.TAKE_NOTES_OUTCOME,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });

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
      }).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.CANCELLED,
        description: `تم إلغاء المذكرة — السبب: ${input.reason}`,
        metadata: { reason: input.reason },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  // Cancel a memo parked on the awaiting-completion latch because the client
  // never completed the file.
  //
  // ⚠ MEMOS HAVE NO CLOSURE MODEL — no closure_reason column, no "closed"
  // status. Their terminal state is CANCELLED (status ملغاة +
  // cancellation_reason), so this is the memo-equivalent of the CLOSE that
  // cases / consultations / contracts get, not a different feature.
  //
  // A separate method rather than a flag on cancelMemo so the ordinary
  // "لا يحتاج مذكرة" cancel keeps its exact current behaviour: this one also
  // clears the await latch and writes its own activity type.
  async cancelMemoForNoResponse(
    id: string,
    input: { missingData: string; notes: string; performedBy: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      // cancellation_reason is text() — no truncation needed, unlike the
      // varchar(500) closure_reason_other its siblings write to.
      const reason = [
        "عدم استكمال البيانات",
        input.missingData ? `الناقص: ${input.missingData}` : "",
        input.notes,
      ].filter(Boolean).join(" — ");
      await tx.update(memos).set({
        status: "ملغاة",
        cancellationReason: reason,
        // Cleared for the same reason as the cases twin: the memos-table
        // "بانتظار" badge is `awaitingCompletion && !isMemoPaused(memo)` with no
        // cancelled check, so leaving the latch set would brand a cancelled memo
        // as still-awaiting forever.
        awaitingCompletion: false,
        savedStage: null,
        updatedAt: now,
      }).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.CANCELLED_NO_RESPONSE,
        description: `تم إلغاء المذكرة لعدم استكمال البيانات — ${reason}`,
        metadata: { reason, missingData: input.missingData, notes: input.notes },
        performedBy: input.performedBy,
        performedAt: now,
      });
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
      }).where(eq(memos.id, id));
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
      });
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
  }

  // Reasoned override — "تجاوز لجنة المراجعة". Moves the memo straight from
  // لجنة_مراجعة to جاهزة_للرفع WITHOUT a committee decision, recording WHO did
  // it and WHY. Mirrors returnMemoToCommittee exactly: one transaction, stage
  // update + a memo_activity_log row.
  //
  // NO memo_committee_decisions row is inserted, by design: a SKIPPED memo has
  // no committee decision, and that table is the committee's decision record —
  // writing a synthetic row there would make an override look like a ruling.
  // The reason lives in the ACTIVITY LOG ONLY (no new column, no migration).
  //
  // memo_activity_log (unlike case_activity_log) has no userName column — the
  // timeline resolves performedBy client-side — so the acting display name is
  // stamped into the description and metadata, which is what makes a delegated
  // skip read "… (نيابةً عن …)".
  async skipMemoCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Memo | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(memos).where(eq(memos.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const truncated = input.reason.slice(0, 120);
      await tx.update(memos).set({
        currentStage: MemoStage.READY,
        updatedAt: now,
      }).where(eq(memos.id, id));
      await tx.insert(memoActivityLog).values({
        id: randomUUID(),
        memoId: id,
        activityType: MemoActivityType.COMMITTEE_SKIPPED,
        description: `تجاوز لجنة المراجعة بواسطة ${input.performerName} — ${truncated}`,
        metadata: {
          reason: input.reason,
          performerName: input.performerName,
          fromStage,
          toStage: MemoStage.READY,
        },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(memos).where(eq(memos.id, id));
      return updated ? mapDbMemo(updated) : undefined;
    });
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

  // The four Pick'd fields are the table's notNull-without-default columns;
  // the single caller (routes POST /api/support/tickets) guarantees them via
  // insertTicketSchema.parse + an explicit submittedBy.
  async createSupportTicket(data: Partial<SupportTicket> & Pick<SupportTicket, "ticketType" | "title" | "description" | "submittedBy">): Promise<SupportTicket> {
    const id = randomUUID();
    const ticketNumber = await this.getNextTicketNumber();
    const [ticket] = await db.insert(supportTickets).values({
      id,
      ticketNumber,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return ticket;
  }

  async updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const [ticket] = await db.update(supportTickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  }

  async deleteSupportTicket(id: string): Promise<boolean> {
    const result = await db.delete(supportTickets).where(eq(supportTickets.id, id)).returning();
    return result.length > 0;
  }

  async getNextTicketNumber(): Promise<string> {
    // Single aggregate instead of loading every ticket and reducing in JS.
    // SUBSTRING(... FROM '[0-9]+') extracts the leading digit run (mirrors
    // the old `.replace("TK-","")` + parseInt, including the skip of any
    // malformed number → NULL, which MAX ignores). COALESCE → 0 for the
    // empty-table case, so an empty table still yields TK-0001.
    const [row] = await db
      .select({
        maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${supportTickets.ticketNumber} FROM '[0-9]+') AS INTEGER)), 0)`,
      })
      .from(supportTickets);
    const maxNum = Number(row?.maxNum ?? 0);
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
    }).returning();
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

  // ==================== Admin_support task assignments (Phase 1) ====================
  async getAdminSupportTaskAssignments(): Promise<AdminSupportTaskAssignment[]> {
    return await db.select().from(adminSupportTaskAssignments);
  }

  // Upsert one task_type → assignee row (PK = task_type, so at most one row per
  // type). assigneeUserId null clears the assignment (type becomes unassigned).
  // updatedAt is date-mode; pass a Date, never a string.
  async setAdminSupportTaskAssignment(taskType: string, assigneeUserId: string | null): Promise<AdminSupportTaskAssignment> {
    const [row] = await db.insert(adminSupportTaskAssignments)
      .values({ taskType, assigneeUserId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: adminSupportTaskAssignments.taskType,
        set: { assigneeUserId, updatedAt: new Date() },
      })
      .returning();
    return row;
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

    const counts: SidebarCounts = { cases: 0, consultations: 0, contracts: 0, hearings: 0, memos: 0 };

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

    // ---- Contracts ----
    // Mirrors the consultations branch: admins (branch_manager,
    // admin_support, both review-committee chairs) see every contract;
    // department heads see only their own dept's contracts; everyone
    // else sees rows they're personally involved in (assigned lawyer,
    // internal reviewer, or creator).
    const contractsSince = lastViewed.get("contracts");
    if (contractsSince) {
      if (isAdmin) {
        counts.contracts = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(contracts)
            .where(gt(contracts.createdAt, contractsSince)),
        );
      } else if (isDeptHead) {
        if (userDept) {
          counts.contracts = await runCount(
            db.select({ c: sql<number>`count(*)::int` }).from(contracts)
              .where(and(
                gt(contracts.createdAt, contractsSince),
                eq(contracts.departmentId, userDept),
              )),
          );
        }
      } else {
        counts.contracts = await runCount(
          db.select({ c: sql<number>`count(*)::int` }).from(contracts)
            .where(and(
              gt(contracts.createdAt, contractsSince),
              or(
                eq(contracts.assignedTo, user.id),
                eq(contracts.internalReviewerId, user.id),
                eq(contracts.createdBy, user.id),
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

  // ==================== Unified Tasks (My Tasks feed) ====================
  // Per-user aggregation of everything that requires this user's action.
  // Mirrors getSidebarCounts' proven per-user SQL: ONE user-filtered select()
  // per resource (NOT load-all-then-filter). Visibility: a user sees the tasks
  // they own (identity/role); a department_head ALSO sees their department's
  // tasks (dept-scoped, tagged ownerScope:"team"). No delegation expansion yet
  // (increment 4). Read-only.
  // Per-identity task computation — the full per-user feed for ONE identity
  // (a real user, OR a delegator the delegate is standing in for). Role/dept are
  // taken from the passed identity, so running this for a delegator naturally
  // yields that delegator's role-derived items (dept_head → team/unassigned;
  // admin_support → collection/closing/data-completion). getMyTasks orchestrates
  // self + delegators on top of this.
  private async computeTasksForIdentity(
    user: { id: string; role: string; departmentId: string | null },
  ): Promise<Omit<MyTaskItem, "specialtyClass" | "onBehalfOfUserId">[]> {
    const uid = user.id;
    const isDeptHead = user.role === "department_head";
    const isAdminSupport = user.role === "admin_support";
    const isManager = user.role === "branch_manager" || user.role === "admin_support";
    const isCasesReviewHead = user.role === "cases_review_head";
    const isConsultationsReviewHead = user.role === "consultations_review_head";
    const isLaborReviewHead = user.role === "labor_review_head";
    const userDept = user.departmentId && user.departmentId.length > 0 ? user.departmentId : null;
    const deptHeadScoped = isDeptHead && !!userDept;
    // branch_manager = firm-wide supervisory view: the SAME team mechanism as
    // dept_head but UNSCOPED by department. teamScoped drives the shared "see
    // others' tasks (tagged ownerScope:team)" branches below; firmWideScoped
    // drops the departmentId filter so every department is included. Parity:
    // for a normal user both are false (self-only, byte-identical to before);
    // for a dept_head only deptHeadScoped is true (dept filter still applied).
    const firmWideScoped = user.role === "branch_manager";
    const teamScoped = deptHeadScoped || firmWideScoped;
    const today = new Date().toISOString().split("T")[0];
    // Built without specialtyClass; it's stamped uniformly on return via
    // taskSpecialtyClass so every item (esp. admin_support's) carries its class.
    const tasks: Omit<MyTaskItem, "specialtyClass" | "onBehalfOfUserId">[] = [];
    const scopeOf = (ownerId: string): "self" | "team" =>
      teamScoped && ownerId !== uid ? "team" : "self";
    // jsonb containment of THIS user in a case's assignedLawyers[] (mirrors getSidebarCounts).
    const assignedToMe = sql`${lawCases.assignedLawyers} @> ${JSON.stringify([uid])}::jsonb`;

    // Admin_support per-type routing: resolve the owner of the assignable
    // kinds ONCE (identity-independent). Each goes to its mapped
    // assignee IFF that user is still an active admin_support, else "" (unassigned
    // → the branch_manager's pool). Only loaded when the viewer could actually
    // receive/manage them (an assignee is admin_support; the pool is the
    // branch_manager) — a lawyer/dept_head never sees these, so no extra reads for
    // them. collection is resolved LIVE here too (Option C): its stored field_task
    // assigned_to is ignored for feed ownership, so mapping changes apply
    // immediately — true parity with consultation_closing / session_report_export.
    let consultationClosingOwner = "";
    let sessionReportExportOwner = "";
    let collectionOwner = "";
    let executionOwner = "";
    let agencyIssuanceOwner = "";
    let contractSendOwner = "";
    let dataCompletionCaseOwner = "";
    let dataCompletionConsultationOwner = "";
    let dataCompletionContractOwner = "";
    let dataCompletionMemoOwner = "";
    if (isAdminSupport || firmWideScoped) {
      const taskAssignments = await this.getAdminSupportTaskAssignments();
      const routingUsers = await this.getAllUsers();
      consultationClosingOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.CONSULTATION_CLOSING, taskAssignments, routingUsers);
      sessionReportExportOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.SESSION_REPORT_EXPORT, taskAssignments, routingUsers);
      collectionOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.COLLECTION, taskAssignments, routingUsers);
      executionOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.EXECUTION, taskAssignments, routingUsers);
      agencyIssuanceOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.AGENCY_ISSUANCE, taskAssignments, routingUsers);
      contractSendOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.CONTRACT_SEND, taskAssignments, routingUsers);
      // Data-completion is per work-type — case / consultation / contract fire
      // at their data-completion STAGE; memo fires on its awaiting-completion latch.
      dataCompletionCaseOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.DATA_COMPLETION_CASE, taskAssignments, routingUsers);
      dataCompletionConsultationOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.DATA_COMPLETION_CONSULTATION, taskAssignments, routingUsers);
      dataCompletionContractOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.DATA_COMPLETION_CONTRACT, taskAssignments, routingUsers);
      dataCompletionMemoOwner = resolveAdminSupportAssignee(
        AssignableAdminSupportTaskKind.DATA_COMPLETION_MEMO, taskAssignments, routingUsers);
    }

    // ---- 1. case_work — assigned lawyer at a lawyer-work stage ----
    // Conservative "lawyer must act" stage set (see report: exact set is a
    // refinement point). Excludes review/committee/platform/admin-owned stages.
    const LAWYER_WORK_STAGES = ["دراسة", "تحرير_صحيفة_الدعوى", "تحرير_مذكرة_جوابية", "تحرير_صيغة_التظلم", "الأخذ_بالملاحظات"];
    {
      const where = firmWideScoped
        ? and(inArray(lawCases.currentStage, LAWYER_WORK_STAGES),
            sql`${lawCases.primaryLawyerId} IS NOT NULL AND ${lawCases.primaryLawyerId} <> ''`)
        : deptHeadScoped
        ? and(eq(lawCases.departmentId, userDept!), inArray(lawCases.currentStage, LAWYER_WORK_STAGES),
            sql`${lawCases.primaryLawyerId} IS NOT NULL AND ${lawCases.primaryLawyerId} <> ''`)
        : and(inArray(lawCases.currentStage, LAWYER_WORK_STAGES),
            or(eq(lawCases.primaryLawyerId, uid), eq(lawCases.responsibleLawyerId, uid), assignedToMe));
      const rows = await db.select({
        id: lawCases.id, caseNumber: lawCases.caseNumber, stage: lawCases.currentStage,
        primaryLawyerId: lawCases.primaryLawyerId, responsibleLawyerId: lawCases.responsibleLawyerId,
      }).from(lawCases).where(where);
      for (const r of rows) {
        const ownerId = r.primaryLawyerId || r.responsibleLawyerId || "";
        tasks.push({
          id: `case_work:${r.id}`, kind: MyTaskKind.CASE_WORK,
          title: `العمل على القضية ${r.caseNumber} — ${r.stage}`,
          entityType: "case", entityId: r.id, caseId: r.id,
          ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: "draft",
        });
      }
    }

    // ---- 1b. settlement direction (D1) — labor case at توجيه_العميل_بالتسوية ----
    // The labor settlement stages were entirely TASK-SILENT: a case entered
    // settlement and sat there until someone stumbled onto it. (Two transitions
    // do fire NOTIFICATIONS — routes.ts:2040 fans out to every admin_support,
    // :1986 pings the dept head — but nothing persistent ever reached a worklist.)
    //
    // This is a STAGE-PRESENCE task, exactly like case_work above: it is computed
    // from currentStage, never stored, so advancing the case out of the stage
    // (→ بانتظار_رفع_العميل_للتسوية) makes it disappear on the next feed read. No
    // completion flag, no column, nothing to clean up.
    //
    // LABOR-ONLY BY CONSTRUCTION: توجيه_العميل_بالتسوية exists in exactly two
    // arrays — CaseStagesOrder (the master enumeration of every stage) and
    // UnderStudyLaborStages (schema.ts:1380). It is in no other department path,
    // so keying on the stage needs no department guard to stay labor-only.
    //
    // CANNOT DUPLICATE case_work: that block keys on LAWYER_WORK_STAGES, which does
    // not contain this stage, and a case has exactly one currentStage — so the two
    // blocks are mutually exclusive and safely share the `case_work:` id prefix.
    //
    // Kind REUSES CASE_WORK deliberately (no new MyTaskKind): the FE's
    // isCaseStageKind (my-tasks.tsx:72-75) routes case_work to the shared
    // CaseStagePanel — which IS the stage-advance UI that satisfies this task. A
    // new kind would land on the generic action modal instead and would need
    // KIND_META + action-mode wiring for no behavioural gain. Title and
    // actionHint are specialised here because the work is client CONTACT, not
    // drafting. Client/opponent enrichment is applied post-hoc to every task
    // carrying a caseId (see the tail of this method), so it comes for free.
    {
      const SETTLEMENT_DIRECTION_STAGE = "توجيه_العميل_بالتسوية";
      const where = firmWideScoped
        ? and(eq(lawCases.currentStage, SETTLEMENT_DIRECTION_STAGE),
            sql`${lawCases.primaryLawyerId} IS NOT NULL AND ${lawCases.primaryLawyerId} <> ''`)
        : deptHeadScoped
        ? and(eq(lawCases.departmentId, userDept!), eq(lawCases.currentStage, SETTLEMENT_DIRECTION_STAGE),
            sql`${lawCases.primaryLawyerId} IS NOT NULL AND ${lawCases.primaryLawyerId} <> ''`)
        : and(eq(lawCases.currentStage, SETTLEMENT_DIRECTION_STAGE),
            or(eq(lawCases.primaryLawyerId, uid), eq(lawCases.responsibleLawyerId, uid), assignedToMe));
      const rows = await db.select({
        id: lawCases.id, caseNumber: lawCases.caseNumber,
        primaryLawyerId: lawCases.primaryLawyerId, responsibleLawyerId: lawCases.responsibleLawyerId,
      }).from(lawCases).where(where);
      for (const r of rows) {
        const ownerId = r.primaryLawyerId || r.responsibleLawyerId || "";
        tasks.push({
          id: `case_work:${r.id}`, kind: MyTaskKind.CASE_WORK,
          title: `توجيه العميل بالتسوية — قضية ${r.caseNumber}`,
          entityType: "case", entityId: r.id, caseId: r.id,
          ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: "follow_up",
        });
      }
    }

    // ---- 1c. judgment-deed follow-up — case at محكوم_حكم_ابتدائي, صك not received ----
    // Closes the judgment-stage SILENCE: a case resting on محكوم_حكم_ابتدائي
    // emitted NO case-level task at all (that stage is not in LAWYER_WORK_STAGES),
    // so it was invisible to the lawyer and the dept head — only the derived
    // "بانتظار استلام الصك" badge showed it, and only to someone already reading
    // the cases list.
    //
    // STAGE-PRESENCE, exactly like case_work and the D1 settlement task: computed
    // from the case's own state, never stored. It shows while
    //   currentStage === محكوم_حكم_ابتدائي AND judgment_deed_received_date is empty
    // and DISAPPEARS on the next feed read the moment the صك receipt is recorded.
    // No scheduler, no completion flag, no clearing code — the same two terms the
    // badge derives from, so badge and task can never disagree.
    //
    // OWNER = المترافع, the lawyer who ATTENDED the judgment hearing
    // (hearings.attending_lawyer_id), NOT necessarily the assigned lawyer — he is
    // the one who was in court and can chase the deed. Falls back to
    // primaryLawyerId → responsibleLawyerId → "" when unset (old hearings, or a
    // session nobody was recorded for). The judgment hearing is located with the
    // SHARED findPrimaryJudgmentHearing, the same rule the صك endpoint and the
    // appeal-direction UI use.
    //
    // CANNOT DUPLICATE the two blocks above: محكوم_حكم_ابتدائي is in neither
    // LAWYER_WORK_STAGES nor توجيه_العميل_بالتسوية, and a case has exactly one
    // currentStage — the three blocks are mutually exclusive. The id prefix is
    // DISTINCT (`judgment_deed:`) so the FE can route its click-through to the
    // case-details dialog (where "تسجيل استلام الصك" lives) instead of the
    // stage-advance panel, which has nothing to offer at a terminal stage.
    // Kind REUSES CASE_WORK — no new MyTaskKind, no KIND_META wiring needed.
    {
      const PRIMARY_JUDGMENT_STAGE = "محكوم_حكم_ابتدائي";
      const deedMissing = sql`(${lawCases.judgmentDeedReceivedDate} IS NULL OR ${lawCases.judgmentDeedReceivedDate} = '')`;
      // The personal scope cannot be expressed in SQL here: the owner may be the
      // ATTENDING lawyer, who is on the hearing row, not the case. Candidates are
      // fetched by stage (+ dept for a head) and filtered by resolved owner below.
      const deedWhere = deptHeadScoped
        ? and(eq(lawCases.departmentId, userDept!), eq(lawCases.currentStage, PRIMARY_JUDGMENT_STAGE), deedMissing)
        : and(eq(lawCases.currentStage, PRIMARY_JUDGMENT_STAGE), deedMissing);
      const deedRows = await db.select({
        id: lawCases.id, caseNumber: lawCases.caseNumber,
        primaryLawyerId: lawCases.primaryLawyerId, responsibleLawyerId: lawCases.responsibleLawyerId,
      }).from(lawCases).where(deedWhere);
      if (deedRows.length > 0) {
        const deedCaseIds = deedRows.map((r) => r.id);
        const deedHearings = await db.select({
          id: hearings.id, caseId: hearings.caseId, result: hearings.result,
          judgmentFinal: hearings.judgmentFinal, hearingDate: hearings.hearingDate,
          attendingLawyerId: hearings.attendingLawyerId,
        }).from(hearings).where(inArray(hearings.caseId, deedCaseIds));
        const hearingsByCase = new Map<string, typeof deedHearings>();
        for (const h of deedHearings) {
          if (!h.caseId) continue;
          const list = hearingsByCase.get(h.caseId) || [];
          list.push(h);
          hearingsByCase.set(h.caseId, list);
        }
        for (const r of deedRows) {
          const judgmentHearing = findPrimaryJudgmentHearing(hearingsByCase.get(r.id) || []);
          const ownerId = judgmentHearing?.attendingLawyerId || r.primaryLawyerId || r.responsibleLawyerId || "";
          // Supervisors (branch_manager firm-wide, dept_head for their dept) see
          // every one; everyone else sees only the ones they own.
          if (!firmWideScoped && !deptHeadScoped && ownerId !== uid) continue;
          tasks.push({
            id: `judgment_deed:${r.id}`, kind: MyTaskKind.CASE_WORK,
            title: `تابع استلام صك الحكم — قضية ${r.caseNumber}`,
            entityType: "case", entityId: r.id, caseId: r.id,
            ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: "follow_up",
          });
        }
      }
    }

    // ---- 1d. objection-window lapsed — صك RECEIVED, window passed, no outcome ----
    // THE SILENT GAP: 1c covers محكوم_حكم_ابتدائي only while the صك is MISSING.
    // The moment the receipt is recorded, 1c stops — and the case then sits at
    // محكوم_حكم_ابتدائي with NOTHING watching it, forever. Worst for a لصالحنا
    // judgment: the objection window belongs to the OPPONENT, so there is no
    // لائحة اعتراضية of ours whose deadline the memo reminders would chase. The
    // window simply lapses in silence and the case leaves the radar.
    //
    // TRIGGER IS A DATE COMPARISON, NOT A STAGE — and it still needs no
    // scheduler, because BOTH terms live on the case row:
    //   receipt = judgment_deed_received_date, window = objection_window_days ?? 30
    // so "today > receipt + window" is computable at feed time, on every read.
    // A scheduler job would add a second source of truth for a value that is
    // already derivable — the D3 najiz reminder exists only because it needs a
    // CADENCE (every 3 days) and a stage-entry timestamp; this needs neither.
    //
    // The date filter is applied in JS rather than SQL: judgment_deed_received_date
    // is a varchar('YYYY-MM-DD'), the candidate set is tiny (cases parked on one
    // terminal stage), and JS keeps the arithmetic identical to the client's.
    //
    // MUTUALLY EXCLUSIVE WITH 1c by construction — 1c requires the deed date to be
    // EMPTY, this one requires it present. A case can never emit both.
    //
    // OWNER = the assigned lawyer (primary → responsible), not the attending
    // lawyer: recording the appeal outcome is a case-file decision, not a
    // courtroom observation. Supervisors see all, as everywhere else here.
    // CLEARS ITSELF when the outcome is recorded, because both actions move the
    // case OFF محكوم_حكم_ابتدائي (→ منظورة_استئناف or → محكوم_حكم_نهائي/مقفلة).
    {
      const PRIMARY_JUDGMENT_STAGE = "محكوم_حكم_ابتدائي";
      const deedPresent = sql`(${lawCases.judgmentDeedReceivedDate} IS NOT NULL AND ${lawCases.judgmentDeedReceivedDate} <> '')`;
      const lapsedWhere = firmWideScoped
        ? and(eq(lawCases.currentStage, PRIMARY_JUDGMENT_STAGE), deedPresent)
        : deptHeadScoped
        ? and(eq(lawCases.departmentId, userDept!), eq(lawCases.currentStage, PRIMARY_JUDGMENT_STAGE), deedPresent)
        : and(eq(lawCases.currentStage, PRIMARY_JUDGMENT_STAGE), deedPresent,
            or(eq(lawCases.primaryLawyerId, uid), eq(lawCases.responsibleLawyerId, uid), assignedToMe));
      const lapsedRows = await db.select({
        id: lawCases.id, caseNumber: lawCases.caseNumber,
        deedDate: lawCases.judgmentDeedReceivedDate, windowDays: lawCases.objectionWindowDays,
        primaryLawyerId: lawCases.primaryLawyerId, responsibleLawyerId: lawCases.responsibleLawyerId,
      }).from(lawCases).where(lapsedWhere);
      const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
      for (const r of lapsedRows) {
        const receiptMs = new Date(String(r.deedDate)).getTime();
        if (!Number.isFinite(receiptMs)) continue; // unparseable date → never nag
        // Default 30 mirrors the server + the صك dialog; 10 is القضاء المستعجل.
        const windowDays = r.windowDays ?? 30;
        const deadlineMs = receiptMs + windowDays * 24 * 60 * 60 * 1000;
        if (todayMs <= deadlineMs) continue; // still inside the window — silent by design
        const ownerId = r.primaryLawyerId || r.responsibleLawyerId || "";
        if (!firmWideScoped && !deptHeadScoped && ownerId !== uid) continue;
        tasks.push({
          id: `appeal_window:${r.id}`, kind: MyTaskKind.CASE_WORK,
          title: `انتهت مهلة الاعتراض — سجّل النتيجة — قضية ${r.caseNumber}`,
          entityType: "case", entityId: r.id, caseId: r.id,
          ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: "follow_up",
        });
      }
    }

    // ---- 1e. opponent-response follow-up — "مطلوب رد من الخصم" is on ----
    // The indicator had a BADGE and nothing else: a case waiting on the
    // opponent's reply reached no worklist, so the wait was only ever noticed by
    // someone already scrolling the hearings list.
    //
    // STAGE-PRESENCE against the hearings table rather than the case row: the
    // flag lives on the case's NEWEST hearing (the 8c615fe invariant). The task
    // therefore mirrors the badge's own rule — `.some(h => h.opponentResponseRequired)`
    // — so badge and task can never disagree.
    //
    // CLEARS ITSELF through all three existing clearing paths, with no extra
    // code: the explicit "تم استلام رد الخصم" action, recording a result on a
    // NEWER hearing, and every close path (cancelOpenCaseChildrenOnClose).
    // Closed / archived cases are excluded here too, belt-and-braces, so a case
    // whose flag somehow survived closure still cannot nag.
    //
    // OWNER = the assigned lawyer — the person who must decide whether the reply
    // needs a مذكرة جوابية (the action asks exactly that).
    {
      const flaggedHearings = await db.select({ caseId: hearings.caseId })
        .from(hearings)
        .where(eq(hearings.opponentResponseRequired, true));
      const flaggedCaseIds = Array.from(
        new Set(flaggedHearings.map((h) => h.caseId).filter((id): id is string => !!id)),
      );
      if (flaggedCaseIds.length > 0) {
        const oppWhere = firmWideScoped
          ? and(inArray(lawCases.id, flaggedCaseIds), ne(lawCases.status, "مغلق"), sql`${lawCases.isArchived} IS NOT TRUE`)
          : deptHeadScoped
          ? and(inArray(lawCases.id, flaggedCaseIds), eq(lawCases.departmentId, userDept!),
              ne(lawCases.status, "مغلق"), sql`${lawCases.isArchived} IS NOT TRUE`)
          : and(inArray(lawCases.id, flaggedCaseIds), ne(lawCases.status, "مغلق"), sql`${lawCases.isArchived} IS NOT TRUE`,
              or(eq(lawCases.primaryLawyerId, uid), eq(lawCases.responsibleLawyerId, uid), assignedToMe));
        const oppRows = await db.select({
          id: lawCases.id, caseNumber: lawCases.caseNumber,
          primaryLawyerId: lawCases.primaryLawyerId, responsibleLawyerId: lawCases.responsibleLawyerId,
        }).from(lawCases).where(oppWhere);
        for (const r of oppRows) {
          const ownerId = r.primaryLawyerId || r.responsibleLawyerId || "";
          if (!firmWideScoped && !deptHeadScoped && ownerId !== uid) continue;
          tasks.push({
            id: `opponent_response:${r.id}`, kind: MyTaskKind.CASE_WORK,
            title: `متابعة رد الخصم — قضية ${r.caseNumber}`,
            entityType: "case", entityId: r.id, caseId: r.id,
            ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: "follow_up",
          });
        }
      }
    }

    // ---- 2. case_unassigned — unassigned case in dept (dept_head assigns) ----
    if (teamScoped) {
      // Resolve each department's head so an unassigned case files UNDER that
      // head (ownerScope via scopeOf): for a dept_head viewer the head is
      // himself → "self" (byte-identical to before); for the firm-wide manager
      // it's the case-dept's head → "team". A department with NO active head
      // emits NO task — it stays dormant and reappears on that head's own
      // getMyTasks run once a head is assigned (single-head enforced in product).
      const heads = await db.select({ id: users.id, departmentId: users.departmentId })
        .from(users)
        .where(and(eq(users.role, "department_head"), eq(users.isActive, true)));
      const deptHeadByDept = new Map<string, string>();
      for (const h of heads) if (h.departmentId) deptHeadByDept.set(h.departmentId, h.id);
      const unassignedWhere = firmWideScoped
        ? and(
            sql`(${lawCases.primaryLawyerId} IS NULL OR ${lawCases.primaryLawyerId} = '')`,
            sql`${lawCases.currentStage} NOT IN ('مقفلة', 'مؤرشفة', 'مشطوبة')`,
          )
        : and(
            eq(lawCases.departmentId, userDept!),
            sql`(${lawCases.primaryLawyerId} IS NULL OR ${lawCases.primaryLawyerId} = '')`,
            sql`${lawCases.currentStage} NOT IN ('مقفلة', 'مؤرشفة', 'مشطوبة')`,
          );
      const rows = await db.select({ id: lawCases.id, caseNumber: lawCases.caseNumber, departmentId: lawCases.departmentId })
        .from(lawCases).where(unassignedWhere);
      for (const r of rows) {
        const deptHeadId = r.departmentId ? deptHeadByDept.get(r.departmentId) : undefined;
        if (!deptHeadId) continue; // no active head → dormant; surfaces when a head is assigned
        tasks.push({
          id: `case_unassigned:${r.id}`, kind: MyTaskKind.CASE_UNASSIGNED,
          title: `قضية غير مُسندة بحاجة لإسناد — ${r.caseNumber}`,
          entityType: "case", entityId: r.id, caseId: r.id,
          ownerId: deptHeadId, ownerScope: scopeOf(deptHeadId), dueDate: null, isOverdue: false, actionHint: "assign",
        });
      }
    }

    // ---- 3-5 + agency. Hearings (attend / unrecorded-overdue / report) ----
    // GUARDED (mirrors the data_completion / execution / agency blocks): a failure
    // here degrades to "no hearing tasks this run" and never throws out of
    // getMyTasks to empty the whole feed.
    try {
      const hActionable = sql`(${hearings.status} = 'قادمة' OR (${hearings.result} IS NOT NULL AND ${hearings.result} <> '' AND ${hearings.reportCompleted} = false))`;
      const where = firmWideScoped
        ? hActionable
        : deptHeadScoped
        ? and(eq(lawCases.departmentId, userDept!), hActionable)
        : and(eq(hearings.attendingLawyerId, uid), hActionable);
      // clients LEFT-joined for the agency-verification grouping key (the موكّل's
      // exact name = individualName for individuals, companyName otherwise).
      const rows = await db.select({
        id: hearings.id, caseId: hearings.caseId, date: hearings.hearingDate, status: hearings.status,
        result: hearings.result, reportCompleted: hearings.reportCompleted,
        attendingLawyerId: hearings.attendingLawyerId, caseNumber: lawCases.caseNumber,
        agencyVerificationAckAt: hearings.agencyVerificationAckAt,
        clientIndividualName: clients.individualName, clientCompanyName: clients.companyName,
      }).from(hearings).innerJoin(lawCases, eq(hearings.caseId, lawCases.id))
        .leftJoin(clients, eq(lawCases.clientId, clients.id)).where(where);
      // Agency-verification candidates are collected here and GROUPED after the
      // loop (same client + same lawyer + same pre-hearing window → ONE task);
      // every other hearing task stays per-hearing exactly as before.
      const verifyCandidates: { hearingId: string; caseId: string; caseNumber: string;
        date: string; ownerId: string; clientKey: string }[] = [];
      for (const r of rows) {
        const ownerId = r.attendingLawyerId || "";
        const ownerScope = scopeOf(ownerId);
        if (r.result && r.reportCompleted === false) {
          tasks.push({ id: `hearing_report:${r.id}`, kind: MyTaskKind.HEARING_REPORT,
            title: `كتابة تقرير الجلسة — قضية ${r.caseNumber}`, entityType: "hearing", entityId: r.id,
            caseId: r.caseId, ownerId, ownerScope, dueDate: r.date, isOverdue: false, actionHint: "record" });
        } else if (r.status === "قادمة") {
          if (r.date < today) {
            tasks.push({ id: `hearing_unrecorded:${r.id}`, kind: MyTaskKind.HEARING_UNRECORDED,
              title: `جلسة انقضت دون تسجيل نتيجتها — قضية ${r.caseNumber}`, entityType: "hearing", entityId: r.id,
              caseId: r.caseId, ownerId, ownerScope, dueDate: r.date, isOverdue: true, actionHint: "record" });
          } else {
            // Hearing-day actions (attend / record the result) surface ONLY from
            // the hearing's OWN day onward — never before. On the day → this attend
            // task; after the day still unrecorded → the hearing_unrecorded
            // (overdue) branch above keeps it showing until the result is recorded.
            // A FUTURE hearing (date > today) shows NOTHING here (the bug fix).
            if (r.date === today) {
              tasks.push({ id: `hearing_attend:${r.id}`, kind: MyTaskKind.HEARING_ATTEND,
                title: `حضور جلسة — قضية ${r.caseNumber} بتاريخ ${r.date}`, entityType: "hearing", entityId: r.id,
                caseId: r.caseId, ownerId, ownerScope, dueDate: r.date, isOverdue: false, actionHint: "attend" });
            }
            // Agency verification — surfaces once we reach the weekend-aware
            // "2 days before" lead (Fri/Sat skipped; Sunday hearing → Thursday),
            // and only until acknowledged ("تم") for this hearing. Collected now,
            // grouped below. INTENTIONALLY 2 days BEFORE the hearing — must NOT be
            // gated on today; this is the one pre-hearing item, left untouched.
            if (agencyVerificationLeadDate(r.date) <= today && !r.agencyVerificationAckAt) {
              verifyCandidates.push({ hearingId: r.id, caseId: r.caseId, caseNumber: r.caseNumber,
                date: r.date, ownerId, clientKey: (r.clientIndividualName || r.clientCompanyName || "").trim() });
            }
          }
        }
      }
      // GROUP the agency-verification candidates by EXACT client name + attending
      // lawyer. A client with several hearings in the same pre-hearing window under
      // one lawyer becomes ONE task listing all case numbers (one answer applies to
      // all via the group route). Empty client name is never grouped (keyed by the
      // hearing id → each stands alone). A group of 1 is byte-equivalent to the old
      // per-hearing task. The lawyer id (no spaces) is the LAST token → splitting
      // on the final space recovers (name, lawyer) uniquely → no key collision.
      const verifyGroups = new Map<string, typeof verifyCandidates>();
      for (const c of verifyCandidates) {
        const key = c.clientKey ? `${c.clientKey} ${c.ownerId}` : ` solo ${c.hearingId}`;
        const g = verifyGroups.get(key);
        if (g) g.push(c); else verifyGroups.set(key, [c]);
      }
      for (const g of Array.from(verifyGroups.values())) {
        const memberIds = g.map((m) => m.hearingId);
        const nums = g.map((m) => m.caseNumber);
        const ownerId = g[0].ownerId;
        const earliest = g.reduce((a, m) => (m.date < a ? m.date : a), g[0].date);
        tasks.push({
          id: `agency_verification:${[...memberIds].sort().join("_")}`, kind: MyTaskKind.AGENCY_VERIFICATION,
          title: nums.length > 1
            ? `التحقق من الوكالة قبل الجلسة — قضايا ${nums.join("، ")}`
            : `التحقق من الوكالة قبل الجلسة — قضية ${nums[0]}`,
          entityType: "hearing", entityId: g[0].hearingId, caseId: g[0].caseId,
          ownerId, ownerScope: scopeOf(ownerId), dueDate: earliest, isOverdue: false,
          actionHint: "verify", groupMemberIds: memberIds,
        });
      }
    } catch (e) {
      console.error("[getMyTasks] hearings block failed — skipping:", e);
    }

    // ---- 6. memo_pending — assigned memo not yet filed ----
    {
      // Stage-of-turn filter (mirrors case_work's LAWYER_WORK_STAGES): while a memo
      // sits at مراجعة_داخلية or لجنة_مراجعة it is the INTERNAL REVIEWER's / COMMITTEE
      // HEAD's turn — it must NOT surface as an action-less "memo_pending" task to
      // the assignee/author. It already surfaces to the correct person as an
      // ACTIONABLE review_pending task in block 7 (internalReviewerId at internal
      // review; cases_review_head at committee). Every other non-filed stage
      // (استلام / تحرير / الأخذ_بالملاحظات / جاهزة_للرفع) is genuinely the assignee's
      // turn and still surfaces. COALESCE keeps null-stage legacy memos surfacing
      // exactly as before (NULL NOT IN (…) would otherwise drop them).
      const mActionable = sql`COALESCE(${memos.currentStage}, '') NOT IN ('مرفوعة', 'مراجعة_داخلية', 'لجنة_مراجعة') AND ${memos.status} <> 'ملغاة'`;
      const where = firmWideScoped
        ? and(mActionable, sql`${memos.assignedTo} <> ''`)
        : deptHeadScoped
        ? and(eq(lawCases.departmentId, userDept!), mActionable, sql`${memos.assignedTo} <> ''`)
        : and(eq(memos.assignedTo, uid), mActionable);
      const rows = await db.select({
        id: memos.id, caseId: memos.caseId, title: memos.title, deadline: memos.deadline, assignedTo: memos.assignedTo,
      }).from(memos).innerJoin(lawCases, eq(memos.caseId, lawCases.id)).where(where);
      for (const r of rows) {
        tasks.push({ id: `memo_pending:${r.id}`, kind: MyTaskKind.MEMO_PENDING,
          title: `مذكرة بحاجة لإنجاز — ${r.title}`, entityType: "memo", entityId: r.id, caseId: r.caseId,
          ownerId: r.assignedTo, ownerScope: scopeOf(r.assignedTo),
          dueDate: r.deadline, isOverdue: !!r.deadline && r.deadline < today, actionHint: "draft" });
      }
    }

    // ---- 7. review_pending — internal-review (identity) + committee (role) ----
    // Internal review: the designated internalReviewerId on cases/contracts/memos.
    // TWO FIXES APPLIED HERE (see the batch report — the memo internal-review
    // task itself was NOT missing; it has always been emitted below):
    //
    // (A) LIFECYCLE FILTERS — these four queries matched on (reviewer, stage)
    //     ALONE, with no check that the entity is still alive. currentStage is
    //     NOT cleared when an entity is cancelled or closed, so a dead entity
    //     parked on مراجعة_داخلية kept emitting a review task to its reviewer
    //     FOREVER, with no way to clear it. This went live with the universal
    //     memo cancellation (147679c): cancelActiveCaseMemos sets
    //     status='ملغاة' and deliberately leaves currentStage untouched, so any
    //     memo cancelled while at internal review became a permanent phantom.
    //     Block 6 (memo_pending) already filters `status <> 'ملغاة'` and the
    //     consultation query below already filtered `status='active'` — the
    //     other three simply never got the same treatment. Now all four do.
    //
    // (B) SUPERVISORY SCOPING — these were the only feed blocks with none: they
    //     hardcoded `ownerId: uid, ownerScope: "self"`, so nobody above the
    //     reviewer could see that a review was sitting unactioned. The reviewer
    //     is now read from the ROW and supervisory rows are tagged
    //     ownerScope:"team", exactly as every other block does via scopeOf().
    //     For a plain user the where-clause is still `internalReviewerId = uid`
    //     — byte-identical behaviour.
    //
    //     ⚠ branch_manager ONLY — NOT department_head, deliberately. All FOUR
    //     internal-review decisions are locked to (designated reviewer |
    //     branch_manager): memos and contracts 403 with
    //     "فقط المراجع الداخلي المعين أو مدير الفرع…", consultations likewise,
    //     and the case equivalent is a stage transition whose allowedRoles are
    //     ["internal_reviewer", "branch_manager"]. department_head is authorized
    //     on NONE of them. Since the مهامي team section renders the SAME action
    //     button as the personal list, giving a dept_head visibility here would
    //     hand them a button that always 403s — breaking visibility ===
    //     authorization. So supervisory visibility stops at branch_manager,
    //     who can actually act.
    {
      // "a reviewer is actually designated" — the supervisory variants match on
      // this instead of a specific uid.
      const hasReviewer = (col: AnyPgColumn) => sql`${col} IS NOT NULL AND ${col} <> ''`;

      const caseReviewWhere = firmWideScoped
        ? and(hasReviewer(lawCases.internalReviewerId), inArray(lawCases.currentStage, ["مراجعة_داخلية", "مراجعة_داخلية_للتظلم"]),
            ne(lawCases.status, "مغلق"), sql`${lawCases.isArchived} IS NOT TRUE`)
        : and(eq(lawCases.internalReviewerId, uid), inArray(lawCases.currentStage, ["مراجعة_داخلية", "مراجعة_داخلية_للتظلم"]),
            ne(lawCases.status, "مغلق"), sql`${lawCases.isArchived} IS NOT TRUE`);
      const caseRows = await db.select({ id: lawCases.id, caseNumber: lawCases.caseNumber,
          reviewerId: lawCases.internalReviewerId })
        .from(lawCases).where(caseReviewWhere);
      for (const r of caseRows) tasks.push({ id: `review_pending:case:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
        title: `مراجعة داخلية بانتظارك — قضية ${r.caseNumber}`, entityType: "case", entityId: r.id, caseId: r.id,
        ownerId: r.reviewerId || uid, ownerScope: scopeOf(r.reviewerId || uid), dueDate: null, isOverdue: false, actionHint: "review" });

      const contractReviewWhere = firmWideScoped
        ? and(hasReviewer(contracts.internalReviewerId), eq(contracts.currentStage, "مراجعة_داخلية"), eq(contracts.status, "active"))
        : and(eq(contracts.internalReviewerId, uid), eq(contracts.currentStage, "مراجعة_داخلية"), eq(contracts.status, "active"));
      const contractRows = await db.select({ id: contracts.id, title: contracts.title,
          reviewerId: contracts.internalReviewerId })
        .from(contracts).where(contractReviewWhere);
      for (const r of contractRows) tasks.push({ id: `review_pending:contract:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
        title: `مراجعة داخلية بانتظارك — عقد ${r.title}`, entityType: "contract", entityId: r.id, caseId: null,
        ownerId: r.reviewerId || uid, ownerScope: scopeOf(r.reviewerId || uid), dueDate: null, isOverdue: false, actionHint: "review" });

      // Memos carry no departmentId — the dept-head scope joins the parent case,
      // the same way block 6 and the committee block below do.
      const memoReviewWhere = firmWideScoped
        ? and(hasReviewer(memos.internalReviewerId), eq(memos.currentStage, "مراجعة_داخلية"), ne(memos.status, "ملغاة"))
        : and(eq(memos.internalReviewerId, uid), eq(memos.currentStage, "مراجعة_داخلية"), ne(memos.status, "ملغاة"));
      const memoRows = await db.select({ id: memos.id, title: memos.title, caseId: memos.caseId,
          reviewerId: memos.internalReviewerId })
        .from(memos).innerJoin(lawCases, eq(memos.caseId, lawCases.id)).where(memoReviewWhere);
      for (const r of memoRows) tasks.push({ id: `review_pending:memo:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
        title: `مراجعة داخلية بانتظارك — مذكرة ${r.title}`, entityType: "memo", entityId: r.id, caseId: r.caseId,
        ownerId: r.reviewerId || uid, ownerScope: scopeOf(r.reviewerId || uid), dueDate: null, isOverdue: false, actionHint: "review" });

      // Consultations now carry a designated reviewer at internal review too
      // (mirrors cases) — surface to that reviewer.
      const consultReviewWhere = firmWideScoped
        ? and(hasReviewer(consultations.internalReviewerId), eq(consultations.status, "active"), eq(consultations.currentStage, "مراجعة_داخلية"))
        : and(eq(consultations.internalReviewerId, uid), eq(consultations.status, "active"), eq(consultations.currentStage, "مراجعة_داخلية"));
      const consultReviewRows = await db.select({ id: consultations.id, type: consultations.consultationType,
          consultationNumber: consultations.consultationNumber, reviewerId: consultations.internalReviewerId })
        .from(consultations).where(consultReviewWhere);
      for (const r of consultReviewRows) tasks.push({ id: `review_pending:consultation:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
        title: `مراجعة داخلية بانتظارك — استشارة ${r.consultationNumber} (${r.type})`, entityType: "consultation", entityId: r.id, caseId: null,
        ownerId: r.reviewerId || uid, ownerScope: scopeOf(r.reviewerId || uid), dueDate: null, isOverdue: false, actionHint: "review" });

      // Committee routing:
      //  • cases_review_head          → NON-labor cases + memos
      //  • consultations_review_head  → NON-labor consultations + contracts
      //  • labor_review_head          → ALL FOUR types whose department is عمالي
      // Labor entities go EXCLUSIVELY to the labor head, hence the ne(...) guards
      // on the two firm-wide heads. When no labor dept exists the guards are
      // undefined and drizzle's and(...) drops them (firm-wide heads unaffected).
      if (isCasesReviewHead || isConsultationsReviewHead || isLaborReviewHead) {
        const laborDeptId = (await this.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
        const caseNotLabor = laborDeptId ? ne(lawCases.departmentId, laborDeptId) : undefined;
        const consultNotLabor = laborDeptId ? ne(consultations.departmentId, laborDeptId) : undefined;
        const contractNotLabor = laborDeptId ? ne(contracts.departmentId, laborDeptId) : undefined;

        if (isCasesReviewHead) {
          const cc = await db.select({ id: lawCases.id, caseNumber: lawCases.caseNumber })
            .from(lawCases).where(and(eq(lawCases.currentStage, "إحالة_للجنة_المراجعة"), caseNotLabor));
          for (const r of cc) tasks.push({ id: `review_pending:committee_case:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — قضية ${r.caseNumber}`, entityType: "case", entityId: r.id, caseId: r.id,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
          // memos carry no departmentId — join the parent case for the exclusion.
          const mc = await db.select({ id: memos.id, title: memos.title, caseId: memos.caseId })
            .from(memos).innerJoin(lawCases, eq(memos.caseId, lawCases.id))
            .where(and(eq(memos.currentStage, "لجنة_مراجعة"), caseNotLabor));
          for (const r of mc) tasks.push({ id: `review_pending:committee_memo:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — مذكرة ${r.title}`, entityType: "memo", entityId: r.id, caseId: r.caseId,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
        }
        if (isConsultationsReviewHead) {
          const conc = await db.select({ id: consultations.id, type: consultations.consultationType,
            consultationNumber: consultations.consultationNumber })
            .from(consultations).where(and(eq(consultations.status, "active"), eq(consultations.currentStage, "لجنة_مراجعة"), consultNotLabor));
          for (const r of conc) tasks.push({ id: `review_pending:committee_consultation:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — استشارة ${r.consultationNumber} (${r.type})`, entityType: "consultation", entityId: r.id, caseId: null,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
          const ctc = await db.select({ id: contracts.id, title: contracts.title })
            .from(contracts).where(and(eq(contracts.currentStage, "لجنة_مراجعة"), contractNotLabor));
          for (const r of ctc) tasks.push({ id: `review_pending:committee_contract:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — عقد ${r.title}`, entityType: "contract", entityId: r.id, caseId: null,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
        }
        // NEW — labor committee head: same four queries, scoped to عمالي only
        // (guarded on laborDeptId so a missing dept means the labor head sees nothing here).
        if (isLaborReviewHead && laborDeptId) {
          const cc = await db.select({ id: lawCases.id, caseNumber: lawCases.caseNumber })
            .from(lawCases).where(and(eq(lawCases.currentStage, "إحالة_للجنة_المراجعة"), eq(lawCases.departmentId, laborDeptId)));
          for (const r of cc) tasks.push({ id: `review_pending:committee_case:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — قضية ${r.caseNumber}`, entityType: "case", entityId: r.id, caseId: r.id,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
          const mc = await db.select({ id: memos.id, title: memos.title, caseId: memos.caseId })
            .from(memos).innerJoin(lawCases, eq(memos.caseId, lawCases.id))
            .where(and(eq(memos.currentStage, "لجنة_مراجعة"), eq(lawCases.departmentId, laborDeptId)));
          for (const r of mc) tasks.push({ id: `review_pending:committee_memo:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — مذكرة ${r.title}`, entityType: "memo", entityId: r.id, caseId: r.caseId,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
          const conc = await db.select({ id: consultations.id, type: consultations.consultationType,
            consultationNumber: consultations.consultationNumber })
            .from(consultations).where(and(eq(consultations.status, "active"), eq(consultations.currentStage, "لجنة_مراجعة"), eq(consultations.departmentId, laborDeptId)));
          for (const r of conc) tasks.push({ id: `review_pending:committee_consultation:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — استشارة ${r.consultationNumber} (${r.type})`, entityType: "consultation", entityId: r.id, caseId: null,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
          const ctc = await db.select({ id: contracts.id, title: contracts.title })
            .from(contracts).where(and(eq(contracts.currentStage, "لجنة_مراجعة"), eq(contracts.departmentId, laborDeptId)));
          for (const r of ctc) tasks.push({ id: `review_pending:committee_contract:${r.id}`, kind: MyTaskKind.REVIEW_PENDING,
            title: `قرار لجنة المراجعة — عقد ${r.title}`, entityType: "contract", entityId: r.id, caseId: null,
            ownerId: uid, ownerScope: "self", dueDate: null, isOverdue: false, actionHint: "review" });
        }
      }
    }

    // ---- 8 + 10. Field tasks (collection vs generic) + the unassigned "" pool for managers ----
    {
      const ftActionable = sql`${fieldTasks.status} NOT IN ('مكتمل', 'ملغي')`;
      const cols = { id: fieldTasks.id, caseId: fieldTasks.caseId, title: fieldTasks.title,
        assignedTo: fieldTasks.assignedTo, dueDate: fieldTasks.dueDate, taskType: fieldTasks.taskType,
        status: fieldTasks.status, routedDepartmentId: fieldTasks.routedDepartmentId };
      const rows = firmWideScoped
        ? await db.select(cols).from(fieldTasks).where(ftActionable)
        : deptHeadScoped
        // LEFT join (was INNER) + an OR covering three head-visible sources:
        //  (1) assignedTo=uid — the head's own tasks (incl. PATH-2 tasks routed
        //      to them whose caseId is null/elsewhere);
        //  (2) lawCases.departmentId=userDept — team supervisory view (unchanged);
        //  (3) routedDepartmentId=userDept — tasks routed to THIS department,
        //      including HEAD-LESS ones (assignedTo="") created before a head
        //      existed: the moment this head is appointed they surface here for
        //      distribution, with no migration or re-assignment needed.
        ? await db.select(cols).from(fieldTasks).leftJoin(lawCases, eq(fieldTasks.caseId, lawCases.id))
            .where(and(ftActionable, or(
              eq(fieldTasks.assignedTo, uid),
              eq(lawCases.departmentId, userDept!),
              eq(fieldTasks.routedDepartmentId, userDept!),
            )))
        : await db.select(cols).from(fieldTasks).where(and(eq(fieldTasks.assignedTo, uid), ftActionable));
      // The firm-wide query already includes the unassigned "" tasks; only the
      // non-firm-wide managers (admin_support) need the separate pool query.
      const unassigned = isManager && !firmWideScoped
        ? await db.select(cols).from(fieldTasks).where(and(eq(fieldTasks.assignedTo, ""), ftActionable))
        : [];
      for (const r of [...rows, ...unassigned]) {
        // Collection (تحصيل) is emitted by the dedicated LIVE-resolve block below
        // (Option C parity): its owner comes from the mapping, not the stored
        // assigned_to, so it must NOT be emitted here (where ownerId would read the
        // stale stored value). Skip it; every other field task is byte-unchanged.
        // Agency-issuance (إصدار وكالة) is the same case: its owner is resolved LIVE
        // by the dedicated block below (via agencyIssuanceOwner, not the stored
        // assigned_to), so it must NOT be emitted here too or it would double-surface.
        if (r.title.startsWith("إعداد خطاب تحصيل") || r.title.startsWith("إصدار وكالة")) continue;
        const isCollection = r.title.startsWith("إعداد خطاب تحصيل");
        // Manually-created general tasks (taskType "عام") get their own kind so
        // the feed labels/routes them distinctly from auto/field tasks. Auto
        // field + collection tasks are never type "عام", so they are unaffected.
        const isGeneral = !isCollection && r.taskType === FieldTaskType.GENERAL;
        const ownerId = r.assignedTo || "";
        // General (عام) task kind + action depend on the lifecycle status so the
        // right actor sees the right step: distribute / approve (dept_head),
        // review (original requester), or do-the-work (assignee). Each transition
        // flips assignedTo to whoever must act next, so ownerId stays the viewer.
        // Collection/field tasks are unaffected (these consts are read only when
        // isGeneral). Conditional exprs (not reassignment) keep the union types.
        const generalKind =
          r.status === FieldTaskStatus.AWAITING_DISTRIBUTION ? MyTaskKind.GENERAL_TASK_DISTRIBUTE
          : r.status === FieldTaskStatus.AWAITING_APPROVAL ? MyTaskKind.GENERAL_TASK_APPROVE
          : r.status === FieldTaskStatus.AWAITING_REVIEW ? MyTaskKind.GENERAL_TASK_REVIEW
          : MyTaskKind.GENERAL_TASK;
        const generalHint =
          r.status === FieldTaskStatus.AWAITING_DISTRIBUTION ? "assign"
          : r.status === FieldTaskStatus.AWAITING_APPROVAL ? "approve"
          : r.status === FieldTaskStatus.AWAITING_REVIEW ? "review"
          : (ownerId ? "complete" : "assign");
        tasks.push({
          id: `${isCollection ? "collection" : isGeneral ? "general_task" : "field_task"}:${r.id}`,
          kind: isCollection ? MyTaskKind.COLLECTION : isGeneral ? generalKind : MyTaskKind.FIELD_TASK,
          title: r.title, entityType: "field_task", entityId: r.id, caseId: r.caseId ?? null,
          ownerId, ownerScope: scopeOf(ownerId),
          // Unassigned pool ("" assignee, surfaced to managers): the action is to
          // ASSIGN it (إسناد), not complete it — an unassigned task can't be
          // "completed". An assigned task keeps the complete (إكمال) action.
          // The بانتظار_* general states are waiting on a human (review/distribute/
          // approve), not late → never overdue regardless of dueDate.
          dueDate: r.dueDate || null,
          isOverdue: r.status !== FieldTaskStatus.AWAITING_REVIEW
            && r.status !== FieldTaskStatus.AWAITING_DISTRIBUTION
            && r.status !== FieldTaskStatus.AWAITING_APPROVAL
            && !!r.dueDate && r.dueDate < today,
          actionHint: isGeneral ? generalHint : (ownerId ? "complete" : "assign"),
          // Carried for the dept_head distribute modal (sub-step 6) — the routed
          // department's members are listed from this, independent of the
          // field-tasks context scope. Only meaningful for GENERAL_TASK_DISTRIBUTE.
          routedDepartmentId: r.routedDepartmentId ?? null,
        });
      }
    }

    // ---- 8b. Requester's view of a HEAD-LESS routed general task ----
    // A general task routed to a department that has no head sits in
    // بانتظار_التوزيع with assignedTo="" until a head is appointed. The owner
    // ("" ) queries above surface it to the branch_manager (firm-wide) and to
    // admin_support (the "" pool), and the dept-scoped query will surface it to
    // a head once one exists — but the REQUESTER who created it must also keep
    // sight of it. Emit it to them as an informational row (no action). Managers
    // already see it via the firm-wide / "" -pool queries, so skip them here to
    // avoid a duplicate row.
    if (!isManager) {
      const myRouted = await db.select({
        id: fieldTasks.id, caseId: fieldTasks.caseId, title: fieldTasks.title, dueDate: fieldTasks.dueDate,
        routedDepartmentId: fieldTasks.routedDepartmentId,
      }).from(fieldTasks).where(and(
        eq(fieldTasks.originalRequesterId, uid),
        eq(fieldTasks.assignedTo, ""),
        eq(fieldTasks.taskType, FieldTaskType.GENERAL),
        eq(fieldTasks.status, FieldTaskStatus.AWAITING_DISTRIBUTION),
        sql`${fieldTasks.routedDepartmentId} IS NOT NULL`,
      ));
      for (const r of myRouted) {
        tasks.push({
          id: `general_awaiting_dist:${r.id}`,
          kind: MyTaskKind.GENERAL_TASK_AWAITING_DISTRIBUTION,
          title: r.title, entityType: "field_task", entityId: r.id, caseId: r.caseId ?? null,
          ownerId: uid, ownerScope: "self",
          dueDate: r.dueDate || null, isOverdue: false, actionHint: "review",
          // Carried so the informational row can show "القسم: <dept>" — which
          // department the task is waiting on for distribution (sub-step 9).
          routedDepartmentId: r.routedDepartmentId ?? null,
        });
      }
    }

    // ---- 9. Legal deadlines (approaching/overdue) — owned via parent case ----
    {
      const where = firmWideScoped
        ? eq(legalDeadlines.status, "نشط")
        : deptHeadScoped
        ? and(eq(lawCases.departmentId, userDept!), eq(legalDeadlines.status, "نشط"))
        : and(eq(legalDeadlines.status, "نشط"),
            or(eq(lawCases.primaryLawyerId, uid), eq(lawCases.responsibleLawyerId, uid), assignedToMe));
      const rows = await db.select({
        id: legalDeadlines.id, caseId: legalDeadlines.caseId, title: legalDeadlines.title,
        deadlineDate: legalDeadlines.deadlineDate, caseNumber: lawCases.caseNumber,
        primaryLawyerId: lawCases.primaryLawyerId, responsibleLawyerId: lawCases.responsibleLawyerId,
      }).from(legalDeadlines).innerJoin(lawCases, eq(legalDeadlines.caseId, lawCases.id)).where(where);
      for (const r of rows) {
        const ownerId = r.primaryLawyerId || r.responsibleLawyerId || "";
        tasks.push({ id: `legal_deadline:${r.id}`, kind: MyTaskKind.LEGAL_DEADLINE,
          title: `موعد قانوني — ${r.title} (قضية ${r.caseNumber})`, entityType: "legal_deadline", entityId: r.id,
          caseId: r.caseId, ownerId, ownerScope: scopeOf(ownerId),
          dueDate: r.deadlineDate, isOverdue: r.deadlineDate < today, actionHint: "complete" });
      }
    }

    // ---- 11. Contact follow-ups (owner = createdBy) ----
    // clients LEFT-joined (the hearings-block idiom) so the row is identifiable:
    // the title is a fixed "متابعة تواصل مع عميل" with no name in it, and a contact
    // log is linked to a CLIENT directly (case_id is optional) — so the name is
    // resolved here from the log's own clientId rather than by the case-keyed
    // enrichment pass in getMyTasks, which would miss the case-less ones.
    {
      const rows = await db.select({
        id: contactLogs.id, caseId: contactLogs.caseId, nextFollowUpDate: contactLogs.nextFollowUpDate,
        clientType: clients.clientType, clientIndividualName: clients.individualName,
        clientCompanyName: clients.companyName,
      })
        .from(contactLogs)
        .leftJoin(clients, eq(contactLogs.clientId, clients.id))
        .where(and(
          eq(contactLogs.createdBy, uid),
          sql`COALESCE(${contactLogs.followUpRequired}, false) = true AND COALESCE(${contactLogs.followUpCompleted}, false) = false`,
        ));
      for (const r of rows) {
        const due = r.nextFollowUpDate || null;
        tasks.push({ id: `contact_followup:${r.id}`, kind: MyTaskKind.CONTACT_FOLLOWUP,
          title: "متابعة تواصل مع عميل", entityType: "contact_log", entityId: r.id, caseId: r.caseId ?? null,
          ownerId: uid, ownerScope: "self", dueDate: due, isOverdue: !!due && due < today, actionHint: "follow_up",
          clientName: clientDisplayName(r) || undefined });
      }
    }

    // ---- 12. Delegation approvals (dept_head of the delegator) ----
    if (teamScoped) {
      const pendingWhere = firmWideScoped
        ? and(sql`${delegationsTable.approvedBy} IS NULL`,
            eq(delegationsTable.status, "نشط"), gte(delegationsTable.endDate, today))
        : and(eq(users.departmentId, userDept!), sql`${delegationsTable.approvedBy} IS NULL`,
            eq(delegationsTable.status, "نشط"), gte(delegationsTable.endDate, today));
      // Enriched card (item 1): show WHO delegates to WHOM. The delegator name
      // comes from the existing users join (fromUserId); the delegate name needs
      // a second aliased users join on toUserId. pendingWhere still scopes on the
      // delegator's dept via the primary `users` join.
      const toUsers = alias(users, "deleg_to_users");
      const rows = await db.select({
        id: delegationsTable.id, fromUserId: delegationsTable.fromUserId, endDate: delegationsTable.endDate,
        fromName: users.name, toName: toUsers.name,
      })
        .from(delegationsTable).innerJoin(users, eq(delegationsTable.fromUserId, users.id))
        .innerJoin(toUsers, eq(delegationsTable.toUserId, toUsers.id))
        .where(pendingWhere);
      for (const r of rows) {
        tasks.push({ id: `delegation_approval:${r.id}`, kind: MyTaskKind.DELEGATION_APPROVAL,
          title: `طلب تفويض: ${r.fromName || r.fromUserId} ← ${r.toName || ""}`, entityType: "delegation", entityId: r.id, caseId: null,
          ownerId: uid, ownerScope: "self", dueDate: r.endDate, isOverdue: false, actionHint: "approve" });
      }
    }

    // ---- 13. Consultation closing — Phase-1 per-type routing ----
    // Goes to the mapped assignee (shown as their own task) and to the
    // branch_manager (team view; an unset/inactive assignee → ownerId "" → the
    // manager's unassigned pool). Emitted ONLY for the assignee or the
    // branch_manager — no more broadcast to every admin_support. (scopeOf returns
    // "self" for any non-team viewer, so a non-owner admin_support must be
    // excluded here, not merely scoped.)
    if (consultationClosingOwner === uid || firmWideScoped) {
      const rows = await db.select({ id: consultations.id, type: consultations.consultationType,
          consultationNumber: consultations.consultationNumber })
        .from(consultations).where(and(eq(consultations.status, "active"),
          inArray(consultations.currentStage, ["جاهزة_للإرسال", "منجزة"])));
      for (const r of rows) {
        const ownerId = consultationClosingOwner;
        tasks.push({ id: `consultation_closing:${r.id}`, kind: MyTaskKind.CONSULTATION_CLOSING,
          title: `استشارة ${r.consultationNumber} جاهزة للإغلاق (${r.type})`, entityType: "consultation", entityId: r.id, caseId: null,
          ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: "close" });
      }
    }

    // ---- 14. Data-completion (CASE work-type) — per-type LIVE routing ----
    // Surfaces while a case sits at استكمال_البيانات, suppressed for 2 days after
    // each "تم" acknowledge (data_completion_last_ack_at), then re-surfaces if
    // the case is STILL at that stage (the client may still owe data). The
    // 2-day window is computed in SQL against NOW(). Routed via the mapping
    // (dataCompletionCaseOwner) exactly like collection/consultation_closing/
    // session_report_export: emitted ONLY for the mapped assignee (own task) or
    // the branch_manager (team; unset/inactive → "" → the manager's unassigned
    // pool, where "إسناد" sets the type mapping going forward). The consultation
    // / contract / memo work-types get their own blocks in sub-steps 2/3.
    // Each data-completion block is isolated in try/catch: a failure here (e.g. a
    // missing column mid-migration) must degrade to "no tasks for THIS block",
    // never throw out of getMyTasks and empty the entire feed.
    if (dataCompletionCaseOwner === uid || firmWideScoped) {
      try {
        const rows = await db.select({ id: lawCases.id, caseNumber: lawCases.caseNumber })
          .from(lawCases).where(and(
            eq(lawCases.currentStage, "استكمال_البيانات"),
            sql`(${lawCases.dataCompletionLastAckAt} IS NULL OR ${lawCases.dataCompletionLastAckAt} < NOW() - INTERVAL '2 days')`,
          ));
        for (const r of rows) {
          const ownerId = dataCompletionCaseOwner;
          tasks.push({ id: `data_completion_case:${r.id}`, kind: MyTaskKind.DATA_COMPLETION_CASE,
            title: `استكمال المرفقات والبيانات — قضية ${r.caseNumber}`, entityType: "case", entityId: r.id, caseId: r.id,
            ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: ownerId ? "complete" : "assign" });
        }
      } catch (e) {
        console.error("[getMyTasks] data_completion_case block failed — skipping:", e);
      }
    }

    // ---- 14b. Data-completion (CONSULTATION work-type) — mirrors the case
    // block: surfaces while an active consultation sits at its data-completion
    // stage (استكمال_المرفقات_والبيانات), 2-day ack-suppression, routed via the
    // data_completion_consultation mapping (assignee → own task; unset → the
    // branch_manager's unassigned pool). status="active" filter added (sibling
    // consultation queries all scope to active; a closed one shouldn't remind).
    if (dataCompletionConsultationOwner === uid || firmWideScoped) {
      try {
        const rows = await db.select({ id: consultations.id, consultationNumber: consultations.consultationNumber })
          .from(consultations).where(and(
            eq(consultations.status, "active"),
            eq(consultations.currentStage, "استكمال_المرفقات_والبيانات"),
            sql`(${consultations.dataCompletionLastAckAt} IS NULL OR ${consultations.dataCompletionLastAckAt} < NOW() - INTERVAL '2 days')`,
          ));
        for (const r of rows) {
          const ownerId = dataCompletionConsultationOwner;
          tasks.push({ id: `data_completion_consultation:${r.id}`, kind: MyTaskKind.DATA_COMPLETION_CONSULTATION,
            title: `استكمال المرفقات والبيانات — استشارة ${r.consultationNumber}`, entityType: "consultation", entityId: r.id, caseId: null,
            ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: ownerId ? "complete" : "assign" });
        }
      } catch (e) {
        console.error("[getMyTasks] data_completion_consultation block failed — skipping:", e);
      }
    }

    // ---- 14c. Data-completion (CONTRACT work-type) — mirrors the case block:
    // active contract at its data-completion stage (استكمال_البيانات_والمرفقات),
    // 2-day ack-suppression, routed via the data_completion_contract mapping.
    if (dataCompletionContractOwner === uid || firmWideScoped) {
      try {
        const rows = await db.select({ id: contracts.id, contractNumber: contracts.contractNumber })
          .from(contracts).where(and(
            eq(contracts.status, "active"),
            eq(contracts.currentStage, "استكمال_البيانات_والمرفقات"),
            sql`(${contracts.dataCompletionLastAckAt} IS NULL OR ${contracts.dataCompletionLastAckAt} < NOW() - INTERVAL '2 days')`,
          ));
        for (const r of rows) {
          const ownerId = dataCompletionContractOwner;
          tasks.push({ id: `data_completion_contract:${r.id}`, kind: MyTaskKind.DATA_COMPLETION_CONTRACT,
            title: `استكمال المرفقات والبيانات — عقد ${r.contractNumber}`, entityType: "contract", entityId: r.id, caseId: null,
            ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: ownerId ? "complete" : "assign" });
        }
      } catch (e) {
        console.error("[getMyTasks] data_completion_contract block failed — skipping:", e);
      }
    }

    // ---- 14d. Data-completion (MEMO work-type) — button-triggered, NOT stage.
    // Memos have no data-completion stage; the "بانتظار استكمال البيانات" button
    // sets awaiting_completion=true, which is the gate here. 2-day ack-suppression
    // (data_completion_last_ack_at) mirrors the other three; the task fully clears
    // when the memo's resume-from-completion flips awaiting_completion off. Routed
    // via the data_completion_memo mapping (assignee → own task; unset → the
    // branch_manager's unassigned pool). Guarded like the sibling blocks.
    if (dataCompletionMemoOwner === uid || firmWideScoped) {
      try {
        const rows = await db.select({ id: memos.id, title: memos.title, caseId: memos.caseId })
          .from(memos).where(and(
            eq(memos.awaitingCompletion, true),
            sql`(${memos.dataCompletionLastAckAt} IS NULL OR ${memos.dataCompletionLastAckAt} < NOW() - INTERVAL '2 days')`,
          ));
        for (const r of rows) {
          const ownerId = dataCompletionMemoOwner;
          tasks.push({ id: `data_completion_memo:${r.id}`, kind: MyTaskKind.DATA_COMPLETION_MEMO,
            title: `استكمال المرفقات والبيانات — مذكرة: ${r.title}`, entityType: "memo", entityId: r.id, caseId: r.caseId ?? null,
            ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: ownerId ? "complete" : "assign" });
        }
      } catch (e) {
        console.error("[getMyTasks] data_completion_memo block failed — skipping:", e);
      }
    }

    // ---- 15. Session-report PDF export — Phase-1 per-type routing ----
    // Surfaces after the lawyer wrote the hearing report (reportCompleted) and it
    // hasn't been exported yet. Routed to the mapped assignee (own task) + the
    // branch_manager (team / unassigned "" pool when unset/inactive); emitted ONLY
    // for the assignee or the branch_manager — no broadcast. Litigation class
    // (hearing). Clears when sessionReportExported flips true.
    if (sessionReportExportOwner === uid || firmWideScoped) {
      const rows = await db.select({ id: hearings.id, caseId: hearings.caseId, caseNumber: lawCases.caseNumber })
        .from(hearings).innerJoin(lawCases, eq(hearings.caseId, lawCases.id))
        .where(and(eq(hearings.reportCompleted, true),
          sql`COALESCE(${hearings.sessionReportExported}, false) = false`));
      for (const r of rows) {
        const ownerId = sessionReportExportOwner;
        tasks.push({ id: `session_report_export:${r.id}`, kind: MyTaskKind.SESSION_REPORT_EXPORT,
          title: `تصدير تقرير الجلسة (PDF) — قضية ${r.caseNumber}`, entityType: "hearing", entityId: r.id,
          caseId: r.caseId, ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false, actionHint: "export" });
      }
    }

    // ---- 16. Collection (تحصيل) — Phase-1 per-type LIVE routing (Option C) ----
    // Collection tasks are stored field_tasks, but their OWNER is resolved LIVE
    // from the mapping (collectionOwner) — the stored assigned_to is IGNORED for
    // feed ownership — so changing/clearing the assignment applies immediately,
    // exactly like consultation_closing / session_report_export. Fetched
    // viewer-independently (all open collection tasks), then gated by the resolved
    // owner: emitted ONLY for the assignee (own task) or the branch_manager (team;
    // unset/inactive → "" → the unassigned pool). The creation notification is a
    // separate channel and is untouched. actionHint mirrors the old field-task
    // block (assigned → complete, unassigned → assign).
    if (collectionOwner === uid || firmWideScoped) {
      const rows = await db.select({ id: fieldTasks.id, caseId: fieldTasks.caseId,
        title: fieldTasks.title, dueDate: fieldTasks.dueDate })
        .from(fieldTasks).where(and(
          sql`${fieldTasks.status} NOT IN ('مكتمل', 'ملغي')`,
          sql`${fieldTasks.title} LIKE ${CollectionTaskTitlePrefix + "%"}`,
        ));
      for (const r of rows) {
        const ownerId = collectionOwner;
        tasks.push({ id: `collection:${r.id}`, kind: MyTaskKind.COLLECTION,
          title: r.title, entityType: "field_task", entityId: r.id, caseId: r.caseId ?? null,
          ownerId, ownerScope: scopeOf(ownerId),
          dueDate: r.dueDate || null, isOverdue: !!r.dueDate && r.dueDate < today,
          actionHint: ownerId ? "complete" : "assign" });
      }
    }

    // ---- 17. Execution (تنفيذ) — per-type LIVE routing, mirrors collection.
    // Stored field_tasks titled "رفع طلب تنفيذ …", created ONLY on a final
    // for-us judgment (alongside collection; NOT on a صلح). Owner resolved LIVE
    // via executionOwner (assignee → own task; unset → branch_manager pool).
    // Guarded so a failure here can't empty the whole feed.
    if (executionOwner === uid || firmWideScoped) {
      try {
        const rows = await db.select({ id: fieldTasks.id, caseId: fieldTasks.caseId,
          title: fieldTasks.title, dueDate: fieldTasks.dueDate })
          .from(fieldTasks).where(and(
            sql`${fieldTasks.status} NOT IN ('مكتمل', 'ملغي')`,
            sql`${fieldTasks.title} LIKE ${ExecutionTaskTitlePrefix + "%"}`,
          ));
        for (const r of rows) {
          const ownerId = executionOwner;
          tasks.push({ id: `execution:${r.id}`, kind: MyTaskKind.EXECUTION,
            title: r.title, entityType: "field_task", entityId: r.id, caseId: r.caseId ?? null,
            ownerId, ownerScope: scopeOf(ownerId),
            dueDate: r.dueDate || null, isOverdue: !!r.dueDate && r.dueDate < today,
            actionHint: ownerId ? "complete" : "assign" });
        }
      } catch (e) {
        console.error("[getMyTasks] execution block failed — skipping:", e);
      }
    }

    // ---- 18. Agency issuance (إصدار وكالة) — per-type LIVE routing, mirrors
    // execution/collection. Stored field_tasks titled "إصدار وكالة …", created
    // when the responsible lawyer answers "لا يوجد وكالة" on the pre-hearing verify
    // task (routes agency-verify). Owner resolved LIVE via agencyIssuanceOwner
    // (assignee → own task; unset → branch_manager pool). Guarded so a failure
    // here can't empty the whole feed.
    if (agencyIssuanceOwner === uid || firmWideScoped) {
      try {
        // lawCases + clients joined so the issuance tasks can be GROUPED by the
        // موكّل's exact name (mirrors the verify grouping) — one client = one
        // issuance task covering all his cases.
        const rows = await db.select({ id: fieldTasks.id, caseId: fieldTasks.caseId,
          dueDate: fieldTasks.dueDate, caseNumber: lawCases.caseNumber,
          clientIndividualName: clients.individualName, clientCompanyName: clients.companyName })
          .from(fieldTasks)
          .leftJoin(lawCases, eq(fieldTasks.caseId, lawCases.id))
          .leftJoin(clients, eq(lawCases.clientId, clients.id))
          .where(and(
            sql`${fieldTasks.status} NOT IN ('مكتمل', 'ملغي')`,
            sql`${fieldTasks.title} LIKE ${"إصدار وكالة%"}`,
          ));
        const ownerId = agencyIssuanceOwner;
        // GROUP issuance field_tasks by EXACT client name (the block's owner is
        // fixed, so the key is name only). Empty client name never groups (keyed by
        // field_task id → stands alone). A group of 1 == the old single task; one
        // "تم إصدار الوكالة" then satisfies every case in the group (group route).
        const issuanceGroups = new Map<string, typeof rows>();
        for (const r of rows) {
          const clientKey = (r.clientIndividualName || r.clientCompanyName || "").trim();
          const key = clientKey ? `c ${clientKey}` : `solo ${r.id}`;
          const g = issuanceGroups.get(key);
          if (g) g.push(r); else issuanceGroups.set(key, [r]);
        }
        for (const g of Array.from(issuanceGroups.values())) {
          const memberIds = g.map((m) => m.id);
          const nums = g.map((m) => m.caseNumber).filter((n): n is string => !!n);
          const earliest = g.reduce<string | null>((a, m) => {
            if (!m.dueDate) return a;
            return a && a < m.dueDate ? a : m.dueDate;
          }, null);
          tasks.push({
            id: `agency_issuance:${[...memberIds].sort().join("_")}`, kind: MyTaskKind.AGENCY_ISSUANCE,
            title: nums.length > 1
              ? `إصدار وكالة — قضايا رقم ${nums.join("، ")}`
              : `إصدار وكالة — قضية رقم ${nums[0] ?? ""}`,
            entityType: "field_task", entityId: g[0].id, caseId: g[0].caseId ?? null,
            ownerId, ownerScope: scopeOf(ownerId),
            dueDate: earliest, isOverdue: !!earliest && earliest < today,
            actionHint: ownerId ? "complete" : "assign",
            groupMemberIds: memberIds,
          });
        }
      } catch (e) {
        console.error("[getMyTasks] agency issuance block failed — skipping:", e);
      }
    }

    // ---- 19. Contract send (إرسال العقد) — per-type LIVE routing, mirrors
    // consultation_closing. Surfaces contracts sitting at the جاهزة_للإرسال stage
    // (committee-approved, awaiting send) to contractSendOwner (assignee → own
    // task; unset → the branch_manager pool). Completing it ("تم الإرسال") advances
    // the contract to مغلقة so it stops surfacing — no tracking flag needed.
    // Guarded so a failure here can't empty the whole feed.
    if (contractSendOwner === uid || firmWideScoped) {
      try {
        const rows = await db.select({ id: contracts.id, title: contracts.title })
          .from(contracts).where(and(
            eq(contracts.status, "active"),
            eq(contracts.currentStage, "جاهزة_للإرسال"),
          ));
        for (const r of rows) {
          const ownerId = contractSendOwner;
          tasks.push({ id: `contract_send:${r.id}`, kind: MyTaskKind.CONTRACT_SEND,
            title: `إرسال العقد — ${r.title}`, entityType: "contract", entityId: r.id, caseId: null,
            ownerId, ownerScope: scopeOf(ownerId), dueDate: null, isOverdue: false,
            actionHint: ownerId ? "complete" : "assign" });
        }
      } catch (e) {
        console.error("[getMyTasks] contract send block failed — skipping:", e);
      }
    }

    return tasks;
  }

  // Unified-tasks I4b — the per-user feed, now delegation-aware (read-only).
  // Computes the feed for the user themselves, then for each delegator they
  // currently act for (active approved window, resolved in req.actingContext),
  // tagging the delegator-derived items with onBehalfOfUserId. Scope is honored:
  // an all_cases delegator contributes all their items; a specific_cases
  // delegator only items whose caseId is in its specificCaseIds. Dedupe by the
  // stable task id (self / earlier wins → its onBehalfOfUserId stays). With no
  // delegations (or no ctx) the result is the user's own feed unchanged, each
  // item just carrying onBehalfOfUserId=null. NO write/permission gate touched.
  async getMyTasks(
    user: { id: string; role: string; departmentId: string | null },
    ctx?: ActingContext,
  ): Promise<MyTaskItem[]> {
    type Built = Omit<MyTaskItem, "specialtyClass">;
    const byId = new Map<string, Built>();

    // The user's own tasks first (so they win any dedupe; onBehalfOfUserId=null).
    for (const t of await this.computeTasksForIdentity(user)) {
      byId.set(t.id, { ...t, onBehalfOfUserId: null });
    }

    // Then each delegator the user currently stands in for.
    for (const d of ctx?.delegators ?? []) {
      const dTasks = await this.computeTasksForIdentity({
        id: d.userId,
        role: d.role,
        departmentId: d.departmentId,
      });
      for (const t of dTasks) {
        // specific_cases: only surface the delegator's tasks tied to a listed case.
        if (d.scope === "specific_cases" && !(t.caseId && d.specificCaseIds.includes(t.caseId))) {
          continue;
        }
        if (byId.has(t.id)) continue; // own / earlier delegator wins
        byId.set(t.id, { ...t, onBehalfOfUserId: d.userId });
      }
    }

    // Stamp the specialty class (ترافع/استشارات) + the matter identity on every item.
    // Identity enrichment is done HERE, once per request over the MERGED set, rather
    // than inside each of the ~10 emission blocks: the blocks have different join
    // shapes (several never touch law_cases at all) and every case-linked item
    // already carries caseId, so one batched lookup keyed by the distinct caseIds
    // covers them all uniformly — one extra query, never a per-row one.
    const merged = Array.from(byId.values());
    const caseIdentities = await this.getCaseIdentitiesForFeed(
      Array.from(new Set(merged.map((t) => t.caseId).filter((id): id is string => !!id))),
    );
    return merged.map((t) => {
      const identity = t.caseId ? caseIdentities.get(t.caseId) : undefined;
      return {
        ...t,
        specialtyClass: taskSpecialtyClass(t.entityType, t.caseId),
        caseNumber: t.caseNumber ?? identity?.caseNumber,
        // ?? (not ||) so a name an emission block already resolved from its own
        // link wins — the contact-follow-up client is the LOG's client, which is
        // not necessarily the client of the case the log happens to reference.
        clientName: t.clientName ?? identity?.clientName,
        opponentName: t.opponentName ?? identity?.opponentName,
      };
    });
  }

  // The display identity ("which matter is this?") of a set of cases, for the
  // tasks feed. ONE query — the lawCases + clients leftJoin idiom the hearings
  // block already uses — keyed by the caseIds the feed items carry. Empty/absent
  // columns collapse to undefined so the FE renders only what exists.
  private async getCaseIdentitiesForFeed(
    caseIds: string[],
  ): Promise<Map<string, { caseNumber: string; clientName?: string; opponentName?: string }>> {
    const byCaseId = new Map<string, { caseNumber: string; clientName?: string; opponentName?: string }>();
    if (caseIds.length === 0) return byCaseId; // inArray([]) is not a valid predicate
    const rows = await db.select({
      id: lawCases.id, caseNumber: lawCases.caseNumber, opponentName: lawCases.opponentName,
      clientType: clients.clientType, clientIndividualName: clients.individualName,
      clientCompanyName: clients.companyName,
    })
      .from(lawCases)
      .leftJoin(clients, eq(lawCases.clientId, clients.id))
      .where(inArray(lawCases.id, caseIds));
    for (const r of rows) {
      byCaseId.set(r.id, {
        caseNumber: r.caseNumber,
        clientName: clientDisplayName(r) || undefined,
        opponentName: r.opponentName?.trim() || undefined,
      });
    }
    return byCaseId;
  }

  async markSectionViewed(userId: string, section: SidebarSectionValue): Promise<void> {
    // Upsert: insert a row at NOW(); if one already exists for this
    // (user, section) pair, bump last_viewed_at to NOW(). This is what
    // clears the badge after a user opens the page.
    await db.insert(userSectionViews)
      .values({ userId, section, lastViewedAt: new Date() })
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
    }).returning();
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
    }).returning();
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
    }).returning();
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
      }).returning();

      await tx.update(consultations)
        .set({ currentStage: input.nextStage, updatedAt: now })
        .where(eq(consultations.id, input.consultationId));

      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        activityType: ConsultationActivityType.INTERNAL_REVIEW,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });

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
    }).returning();
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
      }).returning();

      await tx.update(consultations)
        .set({ currentStage: input.nextStage, updatedAt: now })
        .where(eq(consultations.id, input.consultationId));

      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        activityType: ConsultationActivityType.COMMITTEE_DECISION,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });

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
    }).returning();
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
      }).returning();

      await tx.update(consultations)
        .set({ currentStage: input.nextStage, updatedAt: now })
        .where(eq(consultations.id, input.consultationId));

      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: input.consultationId,
        activityType: ConsultationActivityType.TAKE_NOTES_OUTCOME,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });

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
      }).where(eq(consultations.id, id));
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
      });
      const [updated] = await tx.select().from(consultations).where(eq(consultations.id, id));
      return updated ? mapDbConsultation(updated) : undefined;
    });
  }

  // Reasoned override — "تجاوز لجنة المراجعة". Moves the consultation straight
  // from لجنة_مراجعة to جاهزة_للإرسال WITHOUT a committee decision, recording
  // WHO did it and WHY. Mirrors returnConsultationToCommittee exactly: one
  // transaction, stage update + a consultation_activity_log row.
  //
  // The WRITTEN-type guard lives in the ROUTE, not here — this method hard-codes
  // ConsultationStage.READY, which exists ONLY on the written stage array
  // (ConsultationStagesOrderPhone/Procedural end RECEIVED → … → COMPLETED →
  // CLOSED_FINAL and contain no READY). Calling this for a phone/procedural row
  // would strand it off its own path, which is exactly the cases-side in-court
  // bug fixed in 193649a. Do not call it without the route's type check.
  //
  // NO consultation_committee_decisions row is inserted, by design: a SKIPPED
  // consultation has no committee decision, and that table is the committee's
  // decision record — a synthetic row there would make an override look like a
  // ruling. The reason lives in the ACTIVITY LOG ONLY (no column, no migration).
  //
  // consultation_activity_log has no userName column (the timeline resolves
  // performedBy client-side), so the acting display name is stamped into the
  // description + metadata — what makes a delegated skip read "(نيابةً عن …)".
  async skipConsultationCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Consultation | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(consultations).where(eq(consultations.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const truncated = input.reason.slice(0, 120);
      await tx.update(consultations).set({
        currentStage: ConsultationStage.READY,
        updatedAt: now,
      }).where(eq(consultations.id, id));
      await tx.insert(consultationActivityLog).values({
        id: randomUUID(),
        consultationId: id,
        activityType: ConsultationActivityType.COMMITTEE_SKIPPED,
        description: `تجاوز لجنة المراجعة بواسطة ${input.performerName} — ${truncated}`,
        metadata: {
          reason: input.reason,
          performerName: input.performerName,
          fromStage,
          toStage: ConsultationStage.READY,
        },
        performedBy: input.performedBy,
        performedAt: now,
      });
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
    }).returning();
    return mapDbConsultationActivity(row);
  }

  // TODO: replace with cursor pagination once frontend supports it.
  // 200-row cap prevents unbounded memory growth on long-lived entities.
  async getConsultationActivities(consultationId: string): Promise<ConsultationActivity[]> {
    const rows = await db.select().from(consultationActivityLog)
      .where(eq(consultationActivityLog.consultationId, consultationId))
      .orderBy(desc(consultationActivityLog.performedAt))
      .limit(200);
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
      // COMPLETED is now a PHONE/PROCEDURAL-only stage (removed from the
      // WRITTEN flow — WRITTEN goes READY → CLOSED_FINAL directly). This
      // guard is therefore inert for WRITTEN but still blocks converting
      // a PHONE/PROCEDURAL consultation that's reached COMPLETED. Closed/
      // converted rows are already rejected by the status check above.
      if (existingCon.currentStage === ConsultationStage.COMPLETED) throw new Error("CONSULTATION_COMPLETED");
      // Follow-up cycle: blocking conversion while inside a cycle. The
      // original consultation is already done; cycles are post-closure
      // customer follow-ups, not new-case material. Cycle rows are
      // status='active' so they'd otherwise pass the active check above.
      if ((existingCon.followUpCount ?? 0) > 0) throw new Error("CONSULTATION_IN_FOLLOW_UP_CYCLE");

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
        clientRole: caseFields.clientRole ?? null,
        previousHearingsCount: caseFields.previousHearingsCount || 0,
        currentSituation: caseFields.currentSituation || existingCon.questionSummary || "",
        responseDeadline: caseFields.responseDeadline || null,
        convertedFromConsultationId: existingCon.id,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      };

      const inserted = await tx.insert(lawCases).values(newCaseRow).returning();
      if (!inserted.length) throw new Error("CASE_INSERT_FAILED");

      // 3. Update consultation to mark conversion (helper-table copies skipped per option ii)
      const updatedConRows = await tx.update(consultations)
        .set({
          status: "converted",
          convertedToCaseId: newCaseId,
          closedAt: now,
          updatedAt: now,
        })
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
        });
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
    }).returning();
    return activity;
  }

  // TODO: replace with cursor pagination once frontend supports it.
  // 200-row cap prevents unbounded memory growth on long-lived entities.
  async getCaseActivities(caseId: string): Promise<CaseActivity[]> {
    return await db.select().from(caseActivityLog)
      .where(eq(caseActivityLog.caseId, caseId))
      .orderBy(desc(caseActivityLog.createdAt))
      .limit(200);
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
      const existingHistory = Array.isArray(existing.stageHistory)
        ? existing.stageHistory
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
      }).where(eq(lawCases.id, id));
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
      });
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  // Reasoned override — "تجاوز لجنة المراجعة". Moves the case straight from the
  // committee stage to جاهزة_للرفع WITHOUT a committee decision, recording WHO
  // did it and WHY. Mirrors returnCaseToCommittee exactly: one transaction,
  // stage + stageHistory + a case_activity_log row.
  //
  // reviewDecision is deliberately left UNTOUCHED (null on a case that never had
  // a committee decision): a skipped case HAS no committee decision, and the only
  // consumer of reviewDecision is a display banner that renders for
  // "rejected"/"partial" (case-progress-bar.tsx) — so null simply means no banner.
  // The reason lives in the activity log ONLY (no new column, no migration).
  async skipCaseCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      // Fixed target, and it is unconditionally correct BECAUSE the endpoint guards
      // on caseClassification === قيد_الدراسة: جاهزة_للرفع is the under-study
      // post-committee stage. An in-court case (whose committee exit would be
      // منظورة) can never reach here, so no classification-aware target is needed.
      const targetStage = "جاهزة_للرفع";
      const existingHistory = Array.isArray(existing.stageHistory)
        ? existing.stageHistory
        : [];
      const stageHistory = [
        ...existingHistory,
        {
          stage: targetStage,
          timestamp: now.toISOString(),
          userId: input.performedBy,
          userName: input.performerName,
          notes: `تجاوز لجنة المراجعة — ${input.reason}`,
        },
      ];
      await tx.update(lawCases).set({
        currentStage: targetStage,
        stageHistory,
        updatedAt: now,
      }).where(eq(lawCases.id, id));
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "committee_skipped",
        title: "تجاوز لجنة المراجعة",
        details: input.reason.slice(0, 120),
        previousValue: fromStage,
        newValue: targetStage,
        createdAt: now,
      });
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  async reopenCase(
    id: string,
    input: {
      targetStage: string;
      notes: string;
      performedBy: string;
      performerName: string;
      numberField: { field: CaseNumberField; value: string } | null;
      flags: ReopenLifecycleFlags;
    },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const existingHistory = Array.isArray(existing.stageHistory)
        ? existing.stageHistory
        : [];
      const stageHistory = [
        ...existingHistory,
        {
          stage: input.targetStage,
          timestamp: now.toISOString(),
          userId: input.performedBy,
          userName: input.performerName,
          notes: input.notes
            ? `إعادة فتح القضية — ${input.notes}`
            : "إعادة فتح القضية",
        },
      ];
      // The closure metadata is CLEARED on the row (the case is no longer
      // closed) but PRESERVED in the activity row's details below, so the audit
      // trail keeps why/when it had been closed. stageHistory is append-only, so
      // the original مقفلة entry survives regardless.
      const clearedReason = existing.closureReason || "";
      const clearedClosedAt = existing.closedAt ? new Date(existing.closedAt).toISOString() : "";
      await tx.update(lawCases).set({
        currentStage: input.targetStage,
        // Matches createCase (status is a legacy parallel tracker, never synced
        // with currentStage; consumers only ever test it for "مغلق").
        status: CaseStatus.RECEIVED,
        closedAt: null,
        closureReason: null,
        closureReasonOther: null,
        // A closed case auto-archives after 6 months (scheduler
        // autoArchiveClosedCases) WITHOUT leaving مقفلة, so an archived case
        // reaches this method. Reopening while still flagged archived would
        // yield a live case filtered out of nearly every view.
        isArchived: false,
        archivedAt: null,
        archiveReason: null,
        stageHistory,
        // Dedicated column ONLY — never case_number. That column is
        // varchar(50) NOT NULL UNIQUE while every platform number is
        // varchar(100); writing one into it throws 23505/22001 (the bug fixed
        // in bbcdf33). The displayed number is derived, so no sync is needed.
        ...(input.numberField ? { [input.numberField.field]: input.numberField.value } : {}),
        // Lifecycle flags decided by the route (منظورة/منظورة_استئناف targets).
        ...input.flags,
        updatedAt: now,
      }).where(eq(lawCases.id, id));
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "case_reopened",
        title: "إعادة فتح القضية",
        details: [
          input.notes,
          clearedReason ? `سبب الإغلاق السابق: ${clearedReason}` : "",
          clearedClosedAt ? `تاريخ الإغلاق السابق: ${clearedClosedAt}` : "",
        ].filter(Boolean).join(" — ").slice(0, 500),
        previousValue: fromStage,
        newValue: input.targetStage,
        createdAt: now,
      });
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  // "مرحلة البداية" correction — flip an in-court case between the COURT and
  // SETTLEMENT openings, re-deriving every dependent field IN ONE TRANSACTION.
  //
  // 🔴 THE FLAG AND THE STAGE MOVE TOGETHER, ALWAYS. isSettlementCase selects
  // the stage array (getStagesForClassification returns InCourtSettlementStages
  // first, before memoRequired/clientRole), so writing one without the other
  // strands currentStage off its own path and collapses the progress bar to
  // index 0. Targets are chosen to be the first meaningful stage of the array
  // the case is moving ONTO:
  //   → SETTLEMENT: مداولة_الصلح — InCourtSettlementStages[1], the working stage
  //     (استلام is the shared intake entry; a case being corrected INTO صلح is
  //     already past intake, which is exactly what the create handler does when
  //     startingStage=مداولة_الصلح is chosen at registration).
  //   → COURT:      استلام — the FIRST entry of ALL THREE non-settlement in-court
  //     arrays (NoMemo / PlaintiffMemo / DefendantMemo), so the bar resolves
  //     whatever memoRequired/clientRole happen to be. A case corrected back to
  //     محكمة genuinely restarts its intake.
  async correctCaseStartingStage(
    id: string,
    input: {
      toSettlement: boolean;
      performedBy: string;
      performerName: string;
      notes: string;
    },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const targetStage = input.toSettlement ? "مداولة_الصلح" : CaseStage.RECEPTION;
      const fromLabel = existing.isSettlementCase ? "مداولة الصلح" : "محكمة";
      const toLabel = input.toSettlement ? "مداولة الصلح" : "محكمة";
      const existingHistory = Array.isArray(existing.stageHistory) ? existing.stageHistory : [];
      const historyNote = [
        `تصحيح مرحلة البداية: ${fromLabel} ← ${toLabel}`,
        input.notes,
      ].filter(Boolean).join(" — ");
      const stageHistory = [
        ...existingHistory,
        {
          stage: targetStage,
          timestamp: now.toISOString(),
          userId: input.performedBy,
          userName: input.performerName,
          notes: historyNote,
        },
      ];
      await tx.update(lawCases).set({
        isSettlementCase: input.toSettlement,
        currentStage: targetStage,
        stageHistory,
        updatedAt: now,
      }).where(eq(lawCases.id, id));
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "starting_stage_corrected",
        title: `تصحيح مرحلة البداية — ${fromLabel} ← ${toLabel}`,
        // BEFORE/AFTER on both axes, so the correction is auditable even though
        // isSettlementCase is a bare boolean with no history of its own.
        details: [
          `مرحلة البداية: ${fromLabel} ← ${toLabel}`,
          `المرحلة: ${fromStage} ← ${targetStage}`,
          input.notes,
        ].filter(Boolean).join(" — "),
        previousValue: fromStage,
        newValue: targetStage,
        createdAt: now,
      });
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
    });
  }

  // Phase-8 — pause / unpause on cases. Atomic update + case_activity_log
  // insert in one transaction. Cases status (workflow stage) is left
  // alone; pause is detected via paused_at IS NOT NULL.
  async pauseCase(
    id: string,
    input: { reason: string; performedBy: string; performerName: string; pauseUntil?: string | null },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(lawCases).set({
        pauseReason: input.reason,
        pausedBy: input.performedBy,
        pausedAt: now,
        // Optional auto-lift date, already format- and past-validated by the
        // route (validatePauseUntil). Falsy/absent → null → open-ended pause,
        // which is the pre-feature behaviour.
        pauseUntil: input.pauseUntil || null,
        updatedAt: now,
      }).where(eq(lawCases.id, id));
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "paused",
        title: "تعليق القضية",
        details: input.reason,
        createdAt: now,
      });
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
      const targetStage = CaseStage.DATA_COMPLETION;
      const existingHistory = Array.isArray(existing.stageHistory)
        ? existing.stageHistory
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
      }).where(eq(lawCases.id, id));
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
      });
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
      const existingHistory = Array.isArray(existing.stageHistory)
        ? existing.stageHistory
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
      }).where(eq(lawCases.id, id));
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
      });
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated
        ? { ok: true as const, lawCase: mapDbCase(updated) }
        : { ok: false, reason: "NOT_FOUND" } as const;
    });
  }

  // Close a case parked at استكمال_البيانات because the client never completed
  // the file. Deliberately a DEDICATED method rather than a generic updateCase
  // call: the closure, the flag clearing, the stageHistory append and the audit
  // row must land in ONE transaction, exactly like reopenCase (its mirror).
  //
  // input.missingData is the resolved "what was missing" text (see the route).
  // It goes into closure_reason_other TRUNCATED to the column's varchar(500);
  // the activity row below keeps the UNTRUNCATED text, so nothing is ever lost.
  //
  // awaiting_completion / saved_stage are CLEARED. Not cosmetic: the cases-table
  // "بانتظار" badge is `c.awaitingCompletion && !isCasePaused(c)` with NO closed
  // check (cases.tsx), so leaving the latch set would brand a closed case as
  // still-awaiting forever — the exact never-cleared-flag class of bug that the
  // "مطلوب رد من الخصم" indicator had (55fc32b).
  async closeCaseForNoResponse(
    id: string,
    input: { missingData: string; notes: string; performedBy: string; performerName: string },
  ): Promise<LawCase | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const existingHistory = Array.isArray(existing.stageHistory)
        ? existing.stageHistory
        : [];
      const historyNote = [
        "إغلاق لعدم استكمال البيانات",
        input.missingData ? `الناقص: ${input.missingData}` : "",
        input.notes,
      ].filter(Boolean).join(" — ");
      const stageHistory = [
        ...existingHistory,
        {
          stage: CaseStage.CLOSED,
          timestamp: now.toISOString(),
          userId: input.performedBy,
          userName: input.performerName,
          notes: historyNote,
        },
      ];
      await tx.update(lawCases).set({
        currentStage: CaseStage.CLOSED,
        // status is the legacy parallel tracker; consumers only ever test it for
        // "مغلق". The judgment-close audit found closes that skipped it, so it is
        // set explicitly here rather than left to a downstream PATCH.
        status: CaseStatus.CLOSED,
        closedAt: now,
        closureReason: ClosureReason.DATA_NOT_COMPLETED,
        closureReasonOther: input.missingData.slice(0, 500) || null,
        awaitingCompletion: false,
        savedStage: null,
        stageHistory,
        updatedAt: now,
      }).where(eq(lawCases.id, id));
      await tx.insert(caseActivityLog).values({
        id: nanoid(),
        caseId: id,
        userId: input.performedBy,
        userName: input.performerName,
        actionType: "closed_no_response",
        title: "إغلاق القضية لعدم استكمال البيانات",
        // UNTRUNCATED — this row is the durable record of what was missing.
        details: [
          input.missingData ? `البيانات الناقصة: ${input.missingData}` : "لم تُسجَّل البيانات الناقصة",
          input.notes,
        ].filter(Boolean).join(" — "),
        previousValue: fromStage,
        newValue: CaseStage.CLOSED,
        createdAt: now,
      });
      const [updated] = await tx.select().from(lawCases).where(eq(lawCases.id, id));
      return updated ? mapDbCase(updated) : undefined;
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
        // ⚠ LOAD-BEARING. Without this a manual unpause leaves the auto-lift
        // date behind, and the NEXT pause silently inherits it — a pause set
        // today would lift on a date somebody chose weeks ago. Every one of the
        // four unpause methods clears it; so does the scheduler, which lifts an
        // expired pause by calling these same methods.
        pauseUntil: null,
        updatedAt: now,
      }).where(eq(lawCases.id, id));
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
      });
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
    }).returning();
    return note;
  }

  async updateCaseNote(id: string, data: Partial<CaseNote>): Promise<CaseNote | undefined> {
    const [note] = await db.update(caseNotes)
      .set({ ...data, editedAt: new Date() })
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

  async getLegalDeadlineById(id: string): Promise<LegalDeadline | undefined> {
    const [deadline] = await db.select().from(legalDeadlines)
      .where(eq(legalDeadlines.id, id));
    return deadline;
  }

  async createLegalDeadline(data: InsertLegalDeadline): Promise<LegalDeadline> {
    const id = nanoid();
    const [deadline] = await db.insert(legalDeadlines).values({
      ...data,
      id,
      createdAt: new Date(),
    }).returning();
    return deadline;
  }

  async updateLegalDeadline(id: string, data: Partial<LegalDeadline>): Promise<LegalDeadline | undefined> {
    const [deadline] = await db.update(legalDeadlines)
      .set(data)
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
    }).returning();
    return delegation;
  }

  async updateDelegation(id: string, data: Partial<DelegationRecord>): Promise<DelegationRecord | undefined> {
    const [delegation] = await db.update(delegationsTable)
      .set(data)
      .where(eq(delegationsTable.id, id))
      .returning();
    return delegation;
  }

  async deleteDelegation(id: string): Promise<boolean> {
    const result = await db.delete(delegationsTable).where(eq(delegationsTable.id, id)).returning();
    return result.length > 0;
  }

  // ==================== Contracts module ====================
  // Atomically: insert contract + log "created" activity. Retries the
  // contract_number nanoid suffix on uniqueness collision (3 attempts)
  // — same scheme as createConsultation.
  async createContract(data: Partial<Contract>, createdBy: string): Promise<Contract> {
    const id = randomUUID();
    const now = new Date();

    const baseContract = {
      id,
      title: data.title || "",
      clientId: data.clientId || "",
      contractType: data.contractType || "مراجعة_عقد",
      description: data.description || "",
      currentStage: ContractStage.RECEIVED,
      status: ContractStatus.ACTIVE,
      departmentId: data.departmentId || "",
      assignedTo: data.assignedTo || null,
      internalReviewerId: null,
      priority: null,
      priorityReason: null,
      reviewNotes: "",
      closureReason: null,
      closureReasonOther: null,
      pauseReason: null,
      pausedBy: null,
      pausedAt: null,
      awaitingCompletion: false,
      savedStage: null,
      pauseUntil: null,
      // Explicit rather than relying on the column default, so the object
      // returned by mapDbContract(newContract) below (which reads this local
      // object, not a re-SELECT) carries the same shape as a fetched row.
      followUpCount: 0,
      followUpStartedAt: null,
      createdBy,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const contractNumber = generateContractNumber();
      const newContract = { ...baseContract, contractNumber };
      try {
        await db.transaction(async (tx) => {
          await tx.insert(contracts).values(newContract);
          await tx.insert(contractActivityLog).values({
            id: randomUUID(),
            contractId: id,
            activityType: ContractActivityType.CREATED,
            description: "تم إنشاء العقد",
            metadata: {},
            performedBy: createdBy,
            performedAt: now,
          });
        });
        return mapDbContract(newContract);
      } catch (err) {
        if (isUniqueViolationOn(err, "contract_number")) {
          continue;
        }
        throw err;
      }
    }
    throw new Error("DUPLICATE_CONTRACT_NUMBER");
  }

  async getAllContracts(): Promise<Contract[]> {
    const rows = await db.select().from(contracts).orderBy(desc(contracts.createdAt));
    return rows.map(mapDbContract);
  }

  async getContractById(id: string): Promise<Contract | undefined> {
    const rows = await db.select().from(contracts).where(eq(contracts.id, id));
    return rows[0] ? mapDbContract(rows[0]) : undefined;
  }

  async updateContract(id: string, data: Partial<Contract>): Promise<Contract | undefined> {
    const { createdAt, updatedAt, closedAt, dataCompletionLastAckAt, followUpStartedAt, ...rest } = data;
    const update: any = { ...rest, updatedAt: new Date() };
    if (closedAt !== undefined) update.closedAt = closedAt ? new Date(closedAt) : null;
    if (dataCompletionLastAckAt !== undefined) {
      update.dataCompletionLastAckAt = dataCompletionLastAckAt ? new Date(dataCompletionLastAckAt) : null;
    }
    // Date-mode column, ISO string on the interface — same conversion the
    // closedAt idiom does (Phase-3 3C / S3 archivedAt lesson: letting a raw
    // string reach a date-mode column throws inside drizzle).
    if (followUpStartedAt !== undefined) {
      update.followUpStartedAt = followUpStartedAt ? new Date(followUpStartedAt) : null;
    }
    await db.update(contracts).set(update).where(eq(contracts.id, id));
    return this.getContractById(id);
  }

  async updateContractAndLog(
    id: string,
    data: Partial<Contract>,
    activity: { activityType: string; description: string; metadata?: Record<string, any>; performedBy: string | null },
  ): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const { createdAt, updatedAt, closedAt, followUpStartedAt, ...rest } = data;
      const now = new Date();
      const update: any = { ...rest, updatedAt: now };
      if (closedAt !== undefined) update.closedAt = closedAt ? new Date(closedAt) : null;
      // Date-mode column — same conversion as closedAt. Mirrors the
      // followUpStartedAt handling in updateConsultationAndLog.
      if (followUpStartedAt !== undefined) {
        update.followUpStartedAt = followUpStartedAt ? new Date(followUpStartedAt) : null;
      }
      await tx.update(contracts).set(update).where(eq(contracts.id, id));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: activity.activityType,
        description: activity.description,
        metadata: activity.metadata ?? {},
        performedBy: activity.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  async deleteContract(id: string): Promise<boolean> {
    const result = await db.delete(contracts).where(eq(contracts.id, id)).returning();
    return result.length > 0;
  }

  async pauseContract(id: string, input: { reason: string; performedBy: string; pauseUntil?: string | null }): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(contracts).set({
        status: ContractStatus.PAUSED,
        pauseReason: input.reason,
        pausedBy: input.performedBy,
        pausedAt: now,
        // Optional auto-lift date, already format- and past-validated by the
        // route (validatePauseUntil). Falsy/absent → null → open-ended pause,
        // which is the pre-feature behaviour.
        pauseUntil: input.pauseUntil || null,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.PAUSED,
        description: `تم تعليق العقد — السبب: ${input.reason}`,
        metadata: { reason: input.reason },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  async unpauseContract(id: string, input: { notes?: string; performedBy: string }): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(contracts).set({
        status: ContractStatus.ACTIVE,
        pauseReason: null,
        pausedBy: null,
        pausedAt: null,
        // ⚠ LOAD-BEARING. Without this a manual unpause leaves the auto-lift
        // date behind, and the NEXT pause silently inherits it — a pause set
        // today would lift on a date somebody chose weeks ago. Every one of the
        // four unpause methods clears it; so does the scheduler, which lifts an
        // expired pause by calling these same methods.
        pauseUntil: null,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.UNPAUSED,
        description: notes ? `تم إلغاء التعليق — ${notes}` : "تم إلغاء التعليق",
        metadata: { notes: notes || undefined },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  async awaitContractCompletion(id: string, input: { reason: string; performedBy: string }): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      await tx.update(contracts).set({
        currentStage: ContractStage.RECEIVED_PENDING_COMPLETION,
        savedStage: fromStage,
        awaitingCompletion: true,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.AWAIT_COMPLETION,
        description: `بانتظار استكمال البيانات والمرفقات — السبب: ${input.reason}`,
        metadata: { reason: input.reason, savedStage: fromStage },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  async resumeContractFromCompletion(id: string, input: { notes?: string; performedBy: string }): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const targetStage = existing.savedStage || ContractStage.DRAFTING;
      await tx.update(contracts).set({
        currentStage: targetStage,
        savedStage: null,
        awaitingCompletion: false,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      const notes = (input.notes ?? "").trim();
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.RESUME_FROM_COMPLETION,
        description: notes
          ? `العودة من الاستكمال إلى ${targetStage} — ${notes}`
          : `العودة من الاستكمال إلى ${targetStage}`,
        metadata: { notes: notes || undefined, returnedToStage: targetStage },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  async skipContractCompletion(id: string, input: { performedBy: string }): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      // Single 8-stage flow regardless of contract type — skip lands
      // on DRAFTING, same as the consultation WRITTEN flow's STUDY.
      await tx.update(contracts).set({
        currentStage: ContractStage.DRAFTING,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.COMPLETION_SKIPPED,
        description: "تم تجاوز مرحلة الاستكمال والانتقال مباشرة إلى التحرير",
        metadata: { targetStage: ContractStage.DRAFTING },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  async recordContractInternalReview(input: {
    contractId: string;
    reviewerId: string;
    decision: string;
    notes: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<Contract> {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      await tx.update(contracts).set({
        currentStage: input.nextStage,
        reviewNotes: input.notes,
        updatedAt: now,
      }).where(eq(contracts.id, input.contractId));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: input.contractId,
        activityType: ContractActivityType.INTERNAL_REVIEW,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, input.contractId));
      return updated;
    });
    return mapDbContract(result);
  }

  async recordContractCommitteeDecision(input: {
    contractId: string;
    decision: string;
    notes: string;
    decidedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<Contract> {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      await tx.update(contracts).set({
        currentStage: input.nextStage,
        reviewNotes: input.notes,
        updatedAt: now,
      }).where(eq(contracts.id, input.contractId));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: input.contractId,
        activityType: ContractActivityType.COMMITTEE_DECISION,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, input.contractId));
      return updated;
    });
    return mapDbContract(result);
  }

  async recordContractNoteOutcome(input: {
    contractId: string;
    outcome: string;
    notes: string;
    recordedBy: string;
    nextStage: string;
    activity: { description: string; metadata?: Record<string, any>; performedBy: string | null };
  }): Promise<Contract> {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      await tx.update(contracts).set({
        currentStage: input.nextStage,
        updatedAt: now,
      }).where(eq(contracts.id, input.contractId));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: input.contractId,
        activityType: ContractActivityType.TAKE_NOTES_OUTCOME,
        description: input.activity.description,
        metadata: input.activity.metadata ?? {},
        performedBy: input.activity.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, input.contractId));
      return updated;
    });
    return mapDbContract(result);
  }

  async returnContractToCommittee(
    id: string,
    input: { notes: string; performedBy: string },
  ): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      await tx.update(contracts).set({
        currentStage: ContractStage.COMMITTEE,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.RETURNED_TO_COMMITTEE,
        description: `إعادة إلى لجنة المراجعة — ${input.notes}`,
        metadata: { notes: input.notes },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  // Reasoned override: skip the review committee straight to جاهزة_للإرسال with a
  // MANDATORY reason. Byte-for-byte the shape of skipConsultationCommittee minus
  // the WRITTEN-only concern (contracts have one stage flow). Records the actor
  // name + reason + from/to stages in contract_activity_log (no schema change —
  // activity_type is free text).
  async skipContractCommittee(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const truncated = input.reason.slice(0, 120);
      await tx.update(contracts).set({
        currentStage: ContractStage.READY,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.COMMITTEE_SKIPPED,
        description: `تجاوز لجنة المراجعة بواسطة ${input.performerName} — ${truncated}`,
        metadata: {
          reason: input.reason,
          performerName: input.performerName,
          fromStage,
          toStage: ContractStage.READY,
        },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  // Reasoned override — "تجاوز المراجعة الداخلية". Byte-for-byte the shape of
  // skipContractCommittee above; only the target stage and the activity type
  // differ. The target is COMMITTEE — the stage internal review would have
  // advanced to on a PASSED decision, and the next entry in ContractStagesOrder,
  // so the skipped contract lands exactly where a passing review would have put
  // it. (Same relationship skip-committee has to its own APPROVED target.)
  async skipContractInternalReview(
    id: string,
    input: { reason: string; performedBy: string; performerName: string },
  ): Promise<Contract | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(contracts).where(eq(contracts.id, id));
      if (!existing) return undefined;
      const now = new Date();
      const fromStage = existing.currentStage;
      const truncated = input.reason.slice(0, 120);
      await tx.update(contracts).set({
        currentStage: ContractStage.COMMITTEE,
        updatedAt: now,
      }).where(eq(contracts.id, id));
      await tx.insert(contractActivityLog).values({
        id: randomUUID(),
        contractId: id,
        activityType: ContractActivityType.INTERNAL_REVIEW_SKIPPED,
        description: `تجاوز المراجعة الداخلية بواسطة ${input.performerName} — ${truncated}`,
        metadata: {
          reason: input.reason,
          performerName: input.performerName,
          fromStage,
          toStage: ContractStage.COMMITTEE,
        },
        performedBy: input.performedBy,
        performedAt: now,
      });
      const [updated] = await tx.select().from(contracts).where(eq(contracts.id, id));
      return updated ? mapDbContract(updated) : undefined;
    });
  }

  async createContractActivity(input: {
    contractId: string;
    activityType: string;
    description: string;
    metadata?: Record<string, any>;
    performedBy: string | null;
  }): Promise<ContractActivity> {
    const id = randomUUID();
    const now = new Date();
    await db.insert(contractActivityLog).values({
      id,
      contractId: input.contractId,
      activityType: input.activityType,
      description: input.description,
      metadata: input.metadata ?? {},
      performedBy: input.performedBy,
      performedAt: now,
    });
    return {
      id,
      contractId: input.contractId,
      activityType: input.activityType,
      description: input.description,
      metadata: input.metadata ?? {},
      performedBy: input.performedBy,
      performedAt: now.toISOString(),
    };
  }

  async getContractActivities(contractId: string): Promise<ContractActivity[]> {
    const rows = await db.select().from(contractActivityLog)
      .where(eq(contractActivityLog.contractId, contractId))
      .orderBy(desc(contractActivityLog.performedAt));
    return rows.map(mapDbContractActivity);
  }

  // Designated-slot uploads atomically replace the prior file: delete
  // the old DB row in the same transaction, then return its
  // pre-deletion shape so the route layer can unlink the old file
  // from disk after the commit. Free attachments (slotKey === null)
  // skip the displacement step and just append.
  async createContractAttachment(input: {
    contractId: string;
    slotKey: string | null;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    description: string | null;
    uploadedBy: string;
  }): Promise<{ attachment: ContractAttachment; replaced: ContractAttachment | null }> {
    return await db.transaction(async (tx) => {
      let replaced: ContractAttachment | null = null;
      if (input.slotKey) {
        const existing = await tx.select().from(contractAttachments)
          .where(and(
            eq(contractAttachments.contractId, input.contractId),
            eq(contractAttachments.slotKey, input.slotKey),
          ));
        if (existing.length > 0) {
          replaced = mapDbContractAttachment(existing[0]);
          await tx.delete(contractAttachments).where(eq(contractAttachments.id, existing[0].id));
        }
      }
      const id = randomUUID();
      const now = new Date();
      await tx.insert(contractAttachments).values({
        id,
        contractId: input.contractId,
        slotKey: input.slotKey,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        description: input.description,
        uploadedBy: input.uploadedBy,
        uploadedAt: now,
      });
      const attachment: ContractAttachment = {
        id,
        contractId: input.contractId,
        slotKey: input.slotKey,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        description: input.description,
        uploadedBy: input.uploadedBy,
        uploadedAt: now.toISOString(),
      };
      return { attachment, replaced };
    });
  }

  async getContractAttachments(contractId: string): Promise<ContractAttachment[]> {
    const rows = await db.select().from(contractAttachments)
      .where(eq(contractAttachments.contractId, contractId))
      .orderBy(desc(contractAttachments.uploadedAt));
    return rows.map(mapDbContractAttachment);
  }

  async getContractAttachmentById(id: string): Promise<ContractAttachment | undefined> {
    const rows = await db.select().from(contractAttachments).where(eq(contractAttachments.id, id));
    return rows[0] ? mapDbContractAttachment(rows[0]) : undefined;
  }

  async getContractAttachmentBySlot(contractId: string, slotKey: string): Promise<ContractAttachment | undefined> {
    const rows = await db.select().from(contractAttachments)
      .where(and(
        eq(contractAttachments.contractId, contractId),
        eq(contractAttachments.slotKey, slotKey),
      ));
    return rows[0] ? mapDbContractAttachment(rows[0]) : undefined;
  }

  async deleteContractAttachment(id: string): Promise<ContractAttachment | undefined> {
    const rows = await db.select().from(contractAttachments).where(eq(contractAttachments.id, id));
    if (rows.length === 0) return undefined;
    await db.delete(contractAttachments).where(eq(contractAttachments.id, id));
    return mapDbContractAttachment(rows[0]);
  }

  // ==================== Case deed / hearing minutes attachments ====================
  // Both families mirror createContractAttachment's transaction shape verbatim:
  // select the existing row → capture it as `replaced` → delete it → insert the
  // new one, all inside ONE db.transaction. The delete-then-insert order is not
  // incidental: the unique index on the parent id would reject the insert if the
  // prior row were still there.

  async createCaseAttachment(input: {
    caseId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  }): Promise<{ attachment: CaseAttachment; replaced: CaseAttachment | null }> {
    return await db.transaction(async (tx) => {
      let replaced: CaseAttachment | null = null;
      const existing = await tx.select().from(caseAttachments)
        .where(eq(caseAttachments.caseId, input.caseId));
      if (existing.length > 0) {
        replaced = mapDbCaseAttachment(existing[0]);
        await tx.delete(caseAttachments).where(eq(caseAttachments.id, existing[0].id));
      }
      const id = randomUUID();
      const now = new Date();
      await tx.insert(caseAttachments).values({
        id,
        caseId: input.caseId,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedBy: input.uploadedBy,
        uploadedAt: now,
      });
      const attachment: CaseAttachment = {
        id,
        caseId: input.caseId,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedBy: input.uploadedBy,
        uploadedAt: now.toISOString(),
      };
      return { attachment, replaced };
    });
  }

  async getCaseAttachment(caseId: string): Promise<CaseAttachment | undefined> {
    const rows = await db.select().from(caseAttachments)
      .where(eq(caseAttachments.caseId, caseId));
    return rows[0] ? mapDbCaseAttachment(rows[0]) : undefined;
  }

  async getCaseAttachmentById(id: string): Promise<CaseAttachment | undefined> {
    const rows = await db.select().from(caseAttachments).where(eq(caseAttachments.id, id));
    return rows[0] ? mapDbCaseAttachment(rows[0]) : undefined;
  }

  async deleteCaseAttachment(id: string): Promise<CaseAttachment | undefined> {
    const rows = await db.select().from(caseAttachments).where(eq(caseAttachments.id, id));
    if (rows.length === 0) return undefined;
    await db.delete(caseAttachments).where(eq(caseAttachments.id, id));
    return mapDbCaseAttachment(rows[0]);
  }

  async createHearingAttachment(input: {
    hearingId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  }): Promise<{ attachment: HearingAttachment; replaced: HearingAttachment | null }> {
    return await db.transaction(async (tx) => {
      let replaced: HearingAttachment | null = null;
      const existing = await tx.select().from(hearingAttachments)
        .where(eq(hearingAttachments.hearingId, input.hearingId));
      if (existing.length > 0) {
        replaced = mapDbHearingAttachment(existing[0]);
        await tx.delete(hearingAttachments).where(eq(hearingAttachments.id, existing[0].id));
      }
      const id = randomUUID();
      const now = new Date();
      await tx.insert(hearingAttachments).values({
        id,
        hearingId: input.hearingId,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedBy: input.uploadedBy,
        uploadedAt: now,
      });
      const attachment: HearingAttachment = {
        id,
        hearingId: input.hearingId,
        fileName: input.fileName,
        filePath: input.filePath,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        uploadedBy: input.uploadedBy,
        uploadedAt: now.toISOString(),
      };
      return { attachment, replaced };
    });
  }

  async getHearingAttachment(hearingId: string): Promise<HearingAttachment | undefined> {
    const rows = await db.select().from(hearingAttachments)
      .where(eq(hearingAttachments.hearingId, hearingId));
    return rows[0] ? mapDbHearingAttachment(rows[0]) : undefined;
  }

  async getHearingAttachmentById(id: string): Promise<HearingAttachment | undefined> {
    const rows = await db.select().from(hearingAttachments).where(eq(hearingAttachments.id, id));
    return rows[0] ? mapDbHearingAttachment(rows[0]) : undefined;
  }

  async deleteHearingAttachment(id: string): Promise<HearingAttachment | undefined> {
    const rows = await db.select().from(hearingAttachments).where(eq(hearingAttachments.id, id));
    if (rows.length === 0) return undefined;
    await db.delete(hearingAttachments).where(eq(hearingAttachments.id, id));
    return mapDbHearingAttachment(rows[0]);
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
        // العقود والمشاريع — owns the contracts module by default. Brand-new
        // installs create it as id "5"; existing installs get the same row
        // via script/add-contracts-department.sql (idempotent insert by name).
        { id: "5", name: "العقود والمشاريع", headId: null },
      ];
      for (const dept of defaultDepartments) {
        await db.insert(departments).values({ ...dept, createdAt: new Date() });
      }
    } else {
      // Defensive rename — earlier versions of the seed used the
      // underscore-named "العقود_والمشاريع" (matched the design doc
      // verbatim). The canonical name is now space-separated. This
      // UPDATE folds any legacy row in place so its id (and every
      // user_section_views / user.department_id reference pointing
      // at it) stays valid. No-op when no legacy row exists.
      try {
        const legacyName = "العقود" + "_" + "والمشاريع";
        const legacy = existingDepartments.find((d) => d.name === legacyName);
        if (legacy) {
          await db.update(departments)
            .set({ name: "العقود والمشاريع" })
            .where(eq(departments.id, legacy.id));
          console.log(`[INIT] Renamed legacy contracts department '${legacyName}' → 'العقود والمشاريع' (id ${legacy.id})`);
          // Reflect the rename in our local snapshot so the existence
          // check below sees the new name and skips the insert branch.
          legacy.name = "العقود والمشاريع";
        }
      } catch (e) {
        console.warn("[INIT] Contracts dept rename skipped:", (e as any)?.message || e);
      }

      // Existing installs: ensure the contracts dept row exists too. Match
      // by name to avoid id collisions (some deployments hand-edited ids
      // away from the seed values). This is a no-op once the dept exists.
      const hasContractsDept = existingDepartments.some(
        (d) => d.name === "العقود والمشاريع",
      );
      if (!hasContractsDept) {
        // Pick the next free numeric id ≥ 5 so we don't collide with
        // anything already in the table.
        const nextId = (() => {
          const numericIds = existingDepartments
            .map((d) => Number(d.id))
            .filter((n) => Number.isFinite(n));
          const max = numericIds.length > 0 ? Math.max(...numericIds) : 4;
          return String(Math.max(5, max + 1));
        })();
        try {
          await db.insert(departments).values({
            id: nextId,
            name: "العقود والمشاريع",
            headId: null,
            createdAt: new Date(),
          });
          console.log(`[INIT] Inserted contracts department with id ${nextId}`);
        } catch (e) {
          // Race / unique-constraint — another startup beat us to it.
          console.warn("[INIT] Contracts dept insert skipped (likely already inserted by another worker)");
        }
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
        } catch {
          // Race fallback — outer `if (!existingUsernames.includes(...))`
          // already guards against duplicates; swallow if another worker
          // inserted the same row in between.
        }
      }
    }

  }
}

export const storage = new DatabaseStorage();
