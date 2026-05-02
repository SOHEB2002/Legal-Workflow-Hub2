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
  type ConsultationStudy, type ConsultationDraft, type ConsultationReview,
  type ConsultationCommitteeDecision, type ConsultationNoteOutcome,
  CaseStatus, CaseStage, CaseClassification,
  users, clients, lawCases, consultations, hearings, fieldTasks, contactLogs, notifications, departments, attachments, memos, supportTickets,
  caseActivityLog, caseNotes, caseComments, legalDeadlines, delegationsTable, savedFilters,
  consultationStudies, consultationDrafts, consultationReviews,
  consultationCommitteeDecisions, consultationNoteOutcomes
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, lte, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";
import { hashPassword } from "./auth";

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

// Map DB consultation to interface Consultation
function mapDbConsultation(dbCon: any): Consultation {
  return {
    id: dbCon.id,
    consultationNumber: dbCon.consultationNumber,
    clientId: dbCon.clientId,
    consultationType: dbCon.consultationType,
    deliveryType: dbCon.deliveryType,
    currentStage: dbCon.currentStage,
    status: dbCon.status,
    departmentId: dbCon.departmentId,
    assignedTo: dbCon.assignedTo,
    questionSummary: dbCon.questionSummary,
    response: dbCon.response || "",
    convertedToCaseId: dbCon.convertedToCaseId,
    whatsappGroupLink: dbCon.whatsappGroupLink || "",
    googleDriveFolderId: dbCon.googleDriveFolderId || "",
    reviewNotes: dbCon.reviewNotes || "",
    reviewDecision: dbCon.reviewDecision,
    createdBy: dbCon.createdBy,
    createdAt: toISOString(dbCon.createdAt),
    updatedAt: toISOString(dbCon.updatedAt),
    closedAt: toISOStringOrNull(dbCon.closedAt),
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
    const caseNumber = data.courtCaseNumber ? data.courtCaseNumber : `C-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
    const now = new Date();
    
    const newCase = {
      id,
      caseNumber,
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

    console.log("[clientRole][storage:createCase] inserting case with clientRole:", {
      incoming: (data as any).clientRole,
      incomingType: typeof (data as any).clientRole,
      incomingLength: typeof (data as any).clientRole === "string" ? (data as any).clientRole.length : null,
      finalValue: newCase.clientRole,
      caseClassification: newCase.caseClassification,
    });
    await db.insert(lawCases).values(newCase);
    return mapDbCase(newCase);
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
    const consultationNumber = `CON-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
    const now = new Date();
    
    const newConsultation = {
      id,
      consultationNumber,
      clientId: data.clientId || "",
      consultationType: data.consultationType || "عام",
      deliveryType: data.deliveryType || "مكتوبة",
      status: "استلام",
      departmentId: data.departmentId || "",
      assignedTo: data.assignedTo || null,
      questionSummary: data.questionSummary || "",
      response: data.response || "",
      convertedToCaseId: null,
      whatsappGroupLink: data.whatsappGroupLink || "",
      googleDriveFolderId: data.googleDriveFolderId || "",
      reviewNotes: "",
      reviewDecision: null,
      createdBy,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    
    await db.insert(consultations).values(newConsultation);
    return mapDbConsultation(newConsultation);
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

  async deleteConsultation(id: string): Promise<boolean> {
    await db.delete(attachments).where(and(eq(attachments.entityType, "consultation"), eq(attachments.entityId, id)));
    await db.delete(fieldTasks).where(eq(fieldTasks.consultationId, id));
    await db.delete(notifications).where(and(eq(notifications.relatedType, "consultation"), eq(notifications.relatedId, id)));
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
    const result = await db.delete(memos).where(eq(memos.id, id)).returning();
    return result.length > 0;
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
