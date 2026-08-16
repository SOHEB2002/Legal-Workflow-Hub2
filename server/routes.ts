// ExpressResponse is aliased because the bare name `Response` resolves to the
// DOM fetch Response in this file's lib set — streamAttachmentToResponse needs
// the Express one (headersSent / writableEnded / pipe target).
import type { Express, Request, Response as ExpressResponse } from "express";
import { type Server } from "http";
import { storage, type CaseNumberField, type ReopenLifecycleFlags } from "./storage";
import {
  loginSchema,
  insertUserSchema,
  updateUserSchema,
  insertClientSchema,
  insertCaseSchema,
  insertConsultationSchema,
  insertHearingSchema,
  insertFieldTaskSchema,
  generalTaskReviewSchema,
  generalTaskDistributeSchema,
  generalTaskApproveSchema,
  FieldTaskStatus,
  FieldTaskType,
  GeneralTaskEventType,
  type FieldTask,
  type Hearing,
  insertMemoSchema,
  hearingResultSchema,
  hearingReportSchema,
  hearingResultDetailsSchema,
  isFirmToday,
  isFirmFuture,
  HearingStatus,
  HearingResult,
  MemoStatus,
  MemoType,
  MemoStage,
  MemoStageLabels,
  MemoStagesAll,
  MemoActivityType,
  CaseClassification,
  CaseStage,
  ConsultationStage,
  ConsultationStageLabels,
  ConsultationType,
  ConsultationTypeLabels,
  resolveConsultationType,
  getConsultationStagesForType,
  remapConsultationStageForType,
  isInFollowUpCycle,
  getStagesForConsultationCycle,
  isContractInFollowUpCycle,
  getStagesForContractCycle,
  getContractReopenTargetStages,
  getConsultationReopenTargetStages,
  consultationSkipDataCompletionTarget,
  contractSkipDataCompletionTarget,
  reopenEntitySchema,
  correctStartingStageSchema,
  startingStageCorrectionBlockedReason,
  ContractStage,
  ContractStagesAll,
  ContractStageLabels,
  ContractStatus,
  ContractType,
  ContractTypeLabels,
  ContractActivityType,
  ContractAttachmentSlot,
  ContractAttachmentSlotLabels,
  ContractSlotsByType,
  resolveContractType,
  remapContractStageForType,
  insertContractSchema,
  InternalReviewDecision,
  CommitteeDecision,
  ReviewDecision,
  NoteOutcome,
  ConsultationClosureReason,
  ClosureReason,
  firmToday,
  firmDateTimeToInstant,
  HearingRingTierLeadMinutes,
  resolveHearingRingTier,
  type HearingRingItem,
  NotificationType,
  type NotificationTypeValue,
  type NotificationPriorityValue,
  caseNotificationRecipientId,
  ConsultationActivityType,
  getStagesForClassification,
  CollectionTaskTitlePrefix,
  ExecutionTaskTitlePrefix,
  getReopenTargetStages,
  stageNumberRequirement,
  reopenCaseSchema,
  recordJudgmentDeedSchema,
  appealOutcomeSchema,
  opponentResponseSchema,
  appealRulingSchema,
  // findPrimaryJudgmentHearing is no longer imported here. Its ONE use in this
  // file was /judgment-deed re-deriving objectionability from the judgment
  // hearing's columns; batch 4 reads opens_window and outcome off the judgment row
  // instead, so the hearing is not consulted. It remains in shared/schema.ts with
  // three live callers (my-tasks 1c, and the two appeal-outcome UI sites).
  caseReachedJudgmentStage,
  hearingProducesNoMinutes,
  // judgmentDirectionOf / weAreTheAppellant are no longer imported here: with
  // the aa1e5c3 direction restriction removed, the SERVER no longer constrains
  // the appeal outcome by judgment direction. Both remain exported from
  // shared/schema.ts and are still used by the FE, which uses the direction to
  // decide which buttons to LEAD with — a presentation choice now, not a gate.
  canAddCasesAndConsultations,
  canSendNotifications,
  canCreateMemos,
  canReviewMemos,
  canChangeMemoStatus,
  canDeleteMemos,
  insertTicketSchema,
  canManageSupportTickets,
  insertLegalDeadlineSchema,
  insertSavedFilterSchema,
  updateSavedFilterSchema,
  changePasswordSchema,
  emergencyResetSchema,
  resetUserPasswordSchema,
  deleteUserSchema,
  insertNotificationSchema,
  updateNotificationSchema,
  insertDelegationBodySchema,
  updateDelegationSchema,
  convertConsultationToCaseSchema,
  updateCaseSchema,
  workflowReasonSchema,
  workflowNotesSchema,
  workflowPauseSchema,
  validatePauseUntil,
  todayDateString,
  updateCaseTaradiSchema,
  updateCaseMohrSchema,
  workflowTargetStageSchema,
  workflowDecisionSchema,
  workflowOutcomeSchema,
  assignConsultationSchema,
  startConsultationFollowUpSchema,
  startContractFollowUpSchema,
  updateConsultationSchema,
  assignContractSchema,
  advanceContractStageSchema,
  advanceMemoStageSchema,
  contactLogBodySchema,
  updateFieldTaskSchema,
  canAssignFieldTasks,
  updateLegalDeadlineSchema,
  updateTicketStatusSchema,
  assignTicketSchema,
  updateTicketPrioritySchema,
  ticketCommentSchema,
  ticketRateSchema,
  caseCommentSchema,
  createCaseNoteSchema,
  updateCaseNoteSchema,
  markSectionViewedSchema,
  updateContractSchema,
  updateHearingSchema,
  canManageUsers,
  AssignableAdminSupportTaskKind,
  resolveAdminSupportAssignee,
  setAdminSupportTaskAssignmentSchema,
  SIDEBAR_SECTIONS,
  StagesAtOrPastCourt,
  caseIsAtOrPastCourt,
  CaseStageLabels,
  type SidebarSectionValue,
  type UserRoleType,
  type PriorityType,
  type CaseClassificationValue,
  type CaseStageValue,
  type CaseStageTransition,
  type ConsultationStageValue,
  type ContractStageValue,
  type MemoStageValue,
  type LawCase,
  type TicketComment,
  type ConsultationTypeValue,
  type ContractTypeValue,
  type Notification,
} from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
// سجل الأحكام — THE SINGLE WRITER of the judgment rows and of the two law_cases
// mirror scalars. Nothing in this file may write judgmentDeedReceivedDate /
// objectionWindowDays directly; see the module header for why.
import {
  stripJudgmentMirrorFields,
  judgmentDegreeForStage,
  currentJudgmentFor,
  recordJudgment,
  recordDeedReceipt,
  appealRulingPayload,
  appealRulingTargetStage,
  appendStageHistory,
  AppealRulingOutcome,
  type AppealRulingOutcomeValue,
} from "./judgment-record";
import { requireAuth, requireRole, requireRealRole, generateToken, verifyTokenForRefresh, validatePassword, hashPassword, comparePassword, generateCsrfToken } from "./auth";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendToUser, broadcastToAdmins } from "./websocket";
import { invalidateUserCache } from "./index";
import {
  type ActingContext,
  actingIdentitiesFor,
  actorDisplayName,
  hasEffectiveRole,
  effectiveDeptHeadDepts,
  effectiveIdsFor,
  effectiveRolesFor,
} from "./acting-context";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { resolveNotificationRecipients } from "./notification-recipients";

// Attachments live in Replit Object Storage — the previous
// ./uploads/contracts/<id>/<file> layout was on the container's
// ephemeral disk, and every Autoscale restart / scale event /
// republish wiped the lot while leaving the DB rows pointing
// at vanished paths. The client constructor itself doesn't talk to
// the bucket; getBucket() runs lazily on first request, so this is
// safe even if REPLIT_OBJECT_STORAGE_BUCKET_ID isn't wired up at
// module load (the request handler surfaces a 500 with the actual
// error message in that case).
//
// ONE client for ALL attachment entities (contracts, case judgment deeds,
// hearing minutes). There is a single bucket — the per-entity separation is
// the key PREFIX, not the client — so a second instance would add a second
// lazy bucket handshake for nothing. Renamed from contractObjectStore when
// the deed/minutes surfaces were added; no behavioural change.
const attachmentObjectStore = new ObjectStorageClient();

// Object-Storage key prefixes, one per attachment-bearing entity. The prefix
// is also the bucket "folder", so keys are self-describing:
//   contracts/<contractId>/<uuid>.pdf
//   cases/<caseId>/<uuid>.pdf          — the judgment deed (صك), per CASE
//   hearings/<hearingId>/<uuid>.pdf    — the minutes (ضبط الجلسة)
//   judgments/<judgmentId>/<uuid>.pdf  — the صك, per RULING (سجل الأحكام)
//
// 🔴 THE FOURTH PREFIX IS REGISTERED IN BATCH 1 ON PURPOSE, BEFORE ANYTHING CAN
// WRITE A KEY THAT USES IT. isAttachmentObjectKey FAILS CLOSED (see its note
// below): an unrecognised prefix reads as "legacy dead disk path", so a key
// written before the prefix was known would appear to upload fine and then
// render as missing, 410 on download, and orphan its blob on delete — all
// while typechecking cleanly. Registering the prefix first makes that
// sequence impossible.
//
// Adding it is INERT for the other three: the verdict can only change for a
// path that STARTS WITH "judgments/", and no contract, case or hearing row can
// hold one — each of those file_path values is written by exactly one builder
// (makeContractObjectKey / makeCaseDeedObjectKey / makeHearingMinutesObjectKey),
// and the legacy rows are "./uploads/contracts/…" / "uploads/contracts/…".
// There is no key builder for this prefix yet, because batch 1 has no writer.
const OBJECT_KEY_PREFIXES = {
  contract: "contracts/",
  case:     "cases/",
  hearing:  "hearings/",
  judgment: "judgments/",
} as const;

const ALL_OBJECT_KEY_PREFIXES: readonly string[] = Object.values(OBJECT_KEY_PREFIXES);

// Single source of truth for "is this row pointing at a fresh
// Object-Storage upload or a legacy disk path?". New rows store the
// object key (see the prefixes above) in filePath; pre-migration
// CONTRACT rows still hold the disk path ("./uploads/contracts/..." or
// "uploads/contracts/...") whose underlying file is gone. The download
// handlers return 410 for legacy paths and the list responses flag them
// as missing.
//
// 🔴 WHY THIS IS THE RISKIEST FUNCTION IN THE ATTACHMENT FEATURE, and why
// widening it is nevertheless SAFE FOR CONTRACTS:
//   • Fail direction. An UNRECOGNISED prefix returns false, which every call
//     site reads as "legacy dead disk path". If a cases/ or hearings/ key were
//     not recognised, uploads would appear to succeed and then every file would
//     render as missing, download would 410, and delete would silently orphan
//     the blob — while typechecking cleanly and passing any test that only
//     asserts a 201 on upload. Hence one shared function, never a per-entity copy.
//   • Contract behaviour is BYTE-IDENTICAL after the widening. A contract row's
//     filePath is written by exactly one code path (makeContractObjectKey), so
//     it is either "contracts/…" (true before and after) or a legacy
//     "uploads/contracts/…" / "./uploads/contracts/…" (false before and after —
//     neither starts with "cases/" or "hearings/", so no legacy path can be
//     newly promoted to "real"). Adding prefixes can only ever change the
//     verdict for a path that STARTS with one of the new prefixes, and no
//     contract row can.
function isAttachmentObjectKey(filePath: string): boolean {
  return typeof filePath === "string"
    && ALL_OBJECT_KEY_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

// ONE key builder, three thin wrappers — so the extension sanitisation and the
// randomUUID basename are shared by construction rather than copy-pasted per
// entity (a divergent sanitiser would be exactly the kind of silent drift the
// note above warns about). The regex strips everything outside [A-Za-z0-9.]
// from the extension; the basename never derives from user input.
function makeObjectKey(prefix: string, parentId: string, originalName: string): string {
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "");
  return `${prefix}${parentId}/${randomUUID()}${ext}`;
}

function makeContractObjectKey(contractId: string, originalName: string): string {
  return makeObjectKey(OBJECT_KEY_PREFIXES.contract, contractId, originalName);
}

function makeCaseDeedObjectKey(caseId: string, originalName: string): string {
  return makeObjectKey(OBJECT_KEY_PREFIXES.case, caseId, originalName);
}

function makeHearingMinutesObjectKey(hearingId: string, originalName: string): string {
  return makeObjectKey(OBJECT_KEY_PREFIXES.hearing, hearingId, originalName);
}

// The صك keyed on the RULING (سجل الأحكام). A FOURTH THIN WRAPPER, deliberately
// here beside its siblings rather than in server/judgment-record.ts: the note
// above is explicit that there is ONE key builder and that a per-entity copy is
// how the extension sanitiser silently drifts. The prefix it uses was registered
// in batch 1, before any writer existed, so this first write cannot be the moment
// an unrecognised prefix is discovered.
function makeJudgmentDeedObjectKey(judgmentId: string, originalName: string): string {
  return makeObjectKey(OBJECT_KEY_PREFIXES.judgment, judgmentId, originalName);
}

// Streams an attachment blob from Object Storage to the response. Extracted
// verbatim from the contracts download handler so all three surfaces share ONE
// implementation of the error translation, which is subtle: SDK stream errors
// arrive on the readable as StreamRequestError, and we can only switch to a
// JSON envelope while NO bytes have gone out — once the body has started, all
// we can do is end the response and let the client see a short read. The
// caller sets the Content-* headers before calling; this owns the body.
function streamAttachmentToResponse(
  store: ObjectStorageClient,
  att: { id: string; filePath: string },
  res: ExpressResponse,
  ctx: string,
): void {
  const stream = store.downloadAsStream(att.filePath);
  stream.on("error", (err: any) => {
    const requestError = typeof err?.getRequestError === "function" ? err.getRequestError() : null;
    const statusCode = requestError?.statusCode;
    console.error(`[${ctx}] object storage stream failed:`, {
      attachmentId: att.id,
      key: att.filePath,
      status: statusCode,
      message: err?.message,
    });
    if (!res.headersSent) {
      const status = statusCode === 404 ? 410 : 500;
      res.status(status).json({
        error: status === 410
          ? "الملف مفقود — يرجى إعادة الرفع من جديد"
          : `فشل تحميل الملف من التخزين السحابي: ${err?.message || "خطأ غير معروف"}`,
      });
    } else {
      res.end();
    }
  });
  // Client disconnected mid-download — tear the upstream stream down so we
  // don't keep paging bytes from Object Storage for a dead socket.
  res.on("close", () => {
    if (!res.writableEnded) stream.destroy();
  });
  stream.pipe(res);
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRoleType;
    name: string;
    departmentId: string | null;
  };
}

// Item-5 Phase 1 — stamp the actor's display name with "(نيابةً عن X)" when a
// write happens under an active delegation that applies to this case. Thin
// wrappers over the storage writes so each call site is a clean swap; the
// resolution (0/1/>1 applicable delegators for the caseId) lives in
// actorDisplayName. Non-delegated writes are byte-identical.
async function logCaseActivityActing(
  req: AuthRequest,
  data: Parameters<typeof storage.logCaseActivity>[0],
) {
  return storage.logCaseActivity({
    ...data,
    userName: actorDisplayName(req.actingContext, data.caseId, data.userName),
  });
}

// General-task thread events. Only case-LINKED tasks are stamped: a standalone
// general task (caseId=null) must NOT falsely inherit an all_cases delegation
// (it would tag the delegate's OWN unrelated task as "نيابةً عن"). caseId-linked
// general tasks stamp like any other case activity.
async function createGeneralTaskEventActing(
  req: AuthRequest,
  caseId: string | null,
  data: Parameters<typeof storage.createGeneralTaskEvent>[0],
) {
  return storage.createGeneralTaskEvent({
    ...data,
    actorName: caseId ? actorDisplayName(req.actingContext, caseId, data.actorName ?? "") : data.actorName,
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "محاولات كثيرة. حاول بعد 15 دقيقة" },
  standardHeaders: true,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
});

// POST /api/notifications. Shape follows the three limiters above (named
// rateLimit, Arabic message, standardHeaders) rather than a new pattern.
//
// SIZED FOR A LEGITIMATE BULK SEND. The send dialog's "قسم كامل" and
// "عدة موظفين" modes fan out to ONE POST PER RECIPIENT
// (sendBulkNotification in notifications-context), so a single firm-wide send
// in a ~40-person firm is ~40 requests in a few seconds. 150 per 5 minutes
// leaves room for three such sends plus the workflow notifications the same
// user's actions generate in that window, while capping sustained abuse at an
// average of 30/min. The global apiLimiter (100/min, applied to /api/ at the
// top of registerRoutes) still applies on top of this.
// ⚠ KEYED BY USER, not by IP — the one deliberate departure from the limiters
// above, and it is required here rather than stylistic. express-rate-limit keys
// on req.ip by default, and this firm works from one office behind one NAT, so
// an IP-keyed budget would be shared by everyone: one person's bulk send would
// rate-limit their colleagues. The limiter is therefore mounted AFTER
// requireAuth so req.user is populated. (The global apiLimiter has the same
// IP-keyed property, but it is a blunt 100/min ceiling rather than a per-action
// budget, so it is left alone.)
const notificationSendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 150,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? "anonymous",
  message: { error: "تم إرسال عدد كبير من الإشعارات. حاول بعد قليل" },
  standardHeaders: true,
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "محاولات كثيرة لتغيير كلمة المرور. حاول بعد 15 دقيقة" },
  standardHeaders: true,
});

function sanitizeUser(user: any) {
  const { password, ...safe } = user;
  return safe;
}

// "viewer" is intentionally folded into every can*/admin-role gate
// below. These functions guard BOTH read and write paths in the
// route handlers, and viewer needs global read access. The
// viewerWriteGuard middleware in server/index.ts rejects every
// non-GET request from a viewer before the handler runs, so
// granting "admin-like" pass-throughs here can never enable a
// mutation — the write path is unreachable.
// 4c-1 (cases) — the per-identity ORIGINAL logic, evaluated for the acting user
// and (with an active delegation) each delegator they stand in for. With no ctx
// the identity set is exactly [self], so each gate is byte-identical to before.
// Scope honored: actingIdentitiesFor filters specific_cases by the case's id.
type CaseActorIdentity = { id: string; role: string; departmentId: string | null };
function caseActorIdentities(user: CaseActorIdentity, caseData: any, ctx?: ActingContext): CaseActorIdentity[] {
  if (!ctx) return [user];
  return actingIdentitiesFor(ctx, caseData?.id ?? null).map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }));
}

function canModifyCaseIdentity(u: CaseActorIdentity, caseData: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head", "viewer"];
  if (adminRoles.includes(u.role)) return true;
  if (u.role === "labor_review_head") return !!u.departmentId && caseData.departmentId === u.departmentId;
  // !!u.departmentId — a department_head whose own departmentId is null/"" must
  // not match a row whose departmentId is also empty (legacy / "أخرى" rows).
  // Mirrors the guard canActOnMohrSettlement (:345) and the skip-committee gates
  // already carry. Same fix applied to the consultation + contract twins below.
  if (u.role === "department_head" && !!u.departmentId && caseData.departmentId === u.departmentId) return true;
  if (caseData.primaryLawyerId === u.id || caseData.responsibleLawyerId === u.id) return true;
  if (Array.isArray(caseData.assignedLawyers) && caseData.assignedLawyers.includes(u.id)) return true;
  if (caseData.internalReviewerId && caseData.internalReviewerId === u.id) return true;
  return false;
}
function canModifyCase(user: CaseActorIdentity, caseData: any, ctx?: ActingContext): boolean {
  return caseActorIdentities(user, caseData, ctx).some((u) => canModifyCaseIdentity(u, caseData));
}

function canViewCaseIdentity(u: CaseActorIdentity, caseData: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head", "viewer"];
  if (adminRoles.includes(u.role)) return true;
  if (u.role === "labor_review_head") return !!u.departmentId && caseData.departmentId === u.departmentId;
  if (u.role === "department_head") return !!u.departmentId && caseData.departmentId === u.departmentId;
  if (u.role === "employee") {
    return caseData.primaryLawyerId === u.id ||
      caseData.responsibleLawyerId === u.id ||
      (Array.isArray(caseData.assignedLawyers) && caseData.assignedLawyers.includes(u.id)) ||
      caseData.internalReviewerId === u.id;
  }
  return false;
}
function canViewCase(user: CaseActorIdentity, caseData: any, ctx?: ActingContext): boolean {
  return caseActorIdentities(user, caseData, ctx).some((u) => canViewCaseIdentity(u, caseData));
}

function canEditCaseData(user: CaseActorIdentity, caseData?: any, ctx?: ActingContext): boolean {
  return caseActorIdentities(user, caseData, ctx).some((u) => ["branch_manager", "admin_support"].includes(u.role));
}

// C3 — MOHR (labor amicable-settlement) ACTION gate.
//
// The MOHR endpoints previously used canModifyCase, which is the broad
// "may this actor touch this case at all" gate: its flat adminRoles list
// (:262) passes branch_manager, admin_support, cases_review_head,
// consultations_review_head and viewer UNCONDITIONALLY — with no department
// scoping — plus the case's internalReviewerId. A consultations_review_head
// could therefore drive a labor case's entire MOHR settlement, and so could an
// internal reviewer with no settlement role whatsoever.
//
// Narrowed here to the settlement actors (owner decision, 2026-07):
//   branch_manager | department_head OF THE CASE'S OWN DEPARTMENT | assigned lawyer
// Same shape as POST /api/cases/:id/skip-committee (see its identity block) —
// this is the established per-case actor-set idiom in this file.
//
// ⚠ DIVERGES FROM THE SETTLEMENT STAGE-TRANSITION TABLE, DELIBERATELY.
// ALLOWED_CASE_TRANSITIONS also grants admin_support the two middle settlement
// edges (توجيه_العميل_بالتسوية → بانتظار_رفع_العميل_للتسوية at :464 and
// بانتظار_رفع_العميل_للتسوية → مداولة_الصلح at :465), and POST /direct-settlement
// notifies EVERY active admin_support to go direct the client. Under this gate
// admin_support can still MOVE the case across those stages and still receives
// that notification, but can no longer RECORD the MOHR status itself. That
// asymmetry is the owner's explicit call; it was flagged before applying. To
// reverse, add `|| u.role === "admin_support"` to the predicate below and to the
// FE mirror in case-details-dialog.tsx — nothing else needs to change.
//
// DELEGATION-AWARE via caseActorIdentities → actingIdentitiesFor(ctx, case.id),
// which honours specific_cases scope. With no delegation the identity set is
// exactly [self], so this is a plain self-check.
function canActOnMohrSettlement(user: CaseActorIdentity, caseData: any, ctx?: ActingContext): boolean {
  return caseActorIdentities(user, caseData, ctx).some((u) =>
    u.role === "branch_manager"
    || (u.role === "department_head" && !!u.departmentId && u.departmentId === caseData.departmentId)
    || isAssignedLawyer({ id: u.id }, caseData));
}

// Judgment-deed (صك) FILE attachment gate: branch_manager | admin_support |
// department_head scoped to the case's OWN department | assigned lawyer.
// Delegation-aware through the same caseActorIdentities expansion.
//
// ⚠ A NEW SIBLING HELPER, deliberately NOT `canActOnMohrSettlement || admin_support`
// and deliberately NOT an edit to that helper. canActOnMohrSettlement is this
// exact set MINUS admin_support, and that exclusion is the owner's explicit,
// documented call (see the note above it). It is SHARED by the MOHR settlement
// actions, POST /api/cases/:id/reopen — where admin_support "can CLOSE a case
// but not reopen one" — and POST /api/cases/:id/appeal-outcome. Adding
// admin_support there to serve this feature would silently widen all three.
// This follows the tiered-widening precedent: build a new helper, leave the
// existing one untouched, nobody loses or gains access anywhere else.
//
// NOTE the deliberate asymmetry with the deed RECEIPT DATE endpoint
// (POST /api/cases/:id/judgment-deed), which keeps canActOnMohrSettlement and
// so still excludes admin_support. Recording the date starts the objection
// clock and creates/re-dates the لائحة اعتراضية memo — a legal act. Filing the
// PDF that arrived from the court is clerical, and admin_support is who
// receives and files it. Same shape as the existing MOHR/stage asymmetry.
function canAttachCaseJudgmentDeed(user: CaseActorIdentity, caseData: any, ctx?: ActingContext): boolean {
  return caseActorIdentities(user, caseData, ctx).some((u) =>
    u.role === "branch_manager"
    || u.role === "admin_support"
    // !!u.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
    || (u.role === "department_head" && !!u.departmentId && u.departmentId === caseData.departmentId)
    || isAssignedLawyer({ id: u.id }, caseData));
}

// 4c-3 (consultations) — per-identity original logic (mirror of cases). No
// caseId on consultations, so only self + all_cases delegators apply
// (specific_cases is case-only). No ctx → [self] → byte-identical.
function canModifyConsultationIdentity(u: CaseActorIdentity, consultation: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head", "viewer"];
  if (adminRoles.includes(u.role)) return true;
  if (u.role === "labor_review_head") return !!u.departmentId && consultation.departmentId === u.departmentId;
  // !!u.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
  if (u.role === "department_head" && !!u.departmentId && consultation.departmentId === u.departmentId) return true;
  if (consultation.assignedTo === u.id || consultation.createdBy === u.id) return true;
  return false;
}
function canModifyConsultation(user: CaseActorIdentity, consultation: any, ctx?: ActingContext): boolean {
  const identities = ctx
    ? actingIdentitiesFor(ctx, null).map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
    : [user];
  return identities.some((u) => canModifyConsultationIdentity(u, consultation));
}

// 4c-5 (memos) — per-identity act-as for the memo workflow state endpoints
// (pause / unpause / await-completion / resume-from-completion /
// return-to-committee / cancel), which all share the same inline access gate:
//   branch_manager || admin_support [|| cases_review_head] ||
//   (department_head whose dept === the PARENT case's dept) || the memo assignee.
// Memos carry no departmentId, so department_head is scoped against the PARENT
// case's department; specific_cases delegations reach a memo via its parent
// caseId (actingIdentitiesFor(ctx, memo.caseId)) — unlike consultations/
// contracts, which have no case id and so are reached only by all_cases. The
// admin-role list is passed per call site (cancel additionally allows
// cases_review_head). With no ctx the identity set is exactly [self] and the
// parent case is fetched only when a department_head identity is present — so
// this is byte-identical to the original inline gate for non-delegated users.
// Four-eyes is NOT routed through here: the INTERNAL_REVIEW lock (in
// validateStageTransition) and the dedicated /internal-review reviewer guard
// stay HUMAN. The dedicated committee/take-notes role gates are left un-expanded
// (deferred with the requireRole role-gate pass).
// ==================== BATCH 1.5b — THE OWNER CHECK, WARN-ONLY ====================
// 🔴 THIS BLOCK REFUSES NOTHING. It observes and logs; every request proceeds
// exactly as before, with the same status, the same body and the same writes.
//
// WHY IT EXISTS. Five endpoints gate on canModifyCase(parentCase) — the broad
// "may this actor touch this case at all" rule, which passes branch_manager,
// admin_support, cases_review_head, consultations_review_head and viewer
// firm-wide, plus the case's own lawyers. Every viewer of a case-scoped task
// list passes it by construction, which is precisely why they can see the list.
// So today the case's assigned lawyer can complete an admin_support COLLECTION
// task, and that fires maybeCloseCaseAfterPostJudgmentTasks — which can
// auto-close the case.
//
// WHY WARN-ONLY AND NOT A REFUSAL. field_tasks records who a task is ASSIGNED
// to (assigned_to / assigned_by / worker_id) but NEVER WHO COMPLETED IT, so the
// 52 completed rows in production cannot answer whether anyone acts on tasks
// that are not theirs. The owner believes nobody does. Believes is not knows,
// and a refusal shipped on a belief breaks a live workflow silently. This
// commit MEASURES for a period; the refusal is a later, informed commit.
//
// 🔴 OWNERSHIP IS NOT "assigned_to". For COLLECTION, EXECUTION and AGENCY
// ISSUANCE the feed IGNORES the stored assigned_to and resolves the owner LIVE
// from the admin_support task-type mapping (storage.ts blocks 16/17/18, the
// "Option C" parity note), so that a mapping change applies immediately. A
// predicate reading assigned_to alone would warn on EVERY legitimate
// admin_support completion and bury the signal it exists to surface. The
// resolver below reproduces the feed's rule per kind — see resolveFieldTaskOwnerIds.
type TaskOwnerWarnInput = {
  endpoint: string;
  taskId: string;
  taskType: string;
  rightfulOwnerIds: string[];
  caseId: string | null;
  assignedTo: string | null;
};

// ONE implementation, five call sites. Delegation-aware in the same shape the
// identity-tight gates already use (the general-task /review gate on
// originalRequesterId): the acting set is every identity the caller currently
// stands for, scoped to this task's parent case, or [self] with no context.
//
// TOTAL BY CONSTRUCTION — the whole body is inside a try/catch that only logs,
// so a fault in the observation can never affect the request it is observing.
function warnIfNotTaskOwner(req: AuthRequest, input: TaskOwnerWarnInput): void {
  try {
    const user = req.user!;
    if (!user) return;
    const actingIds = req.actingContext
      ? actingIdentitiesFor(req.actingContext, input.caseId).map((i) => i.userId)
      : [user.id];
    const owners = input.rightfulOwnerIds.filter((id) => !!id);
    // No resolvable owner (unmapped type, or an unassigned "" pool task) → nobody
    // is the rightful actor, so this is reportable too. It is a DIFFERENT finding
    // from "the wrong person acted" and the empty assignedTo in the line says so.
    const isOwner = owners.some((id) => actingIds.includes(id));
    if (isOwner) return;
    // Single-line structured JSON so a Replit log grep returns parseable records.
    console.warn("[task-owner-check] NOT_OWNER " + JSON.stringify({
      endpoint: input.endpoint,
      taskId: input.taskId,
      taskType: input.taskType,
      actingUserId: user.id,
      actingUserRole: user.role,
      assignedTo: input.assignedTo ?? "",
      caseId: input.caseId ?? "",
      // Not in the requested shape, but free here and the difference between a
      // report you can act on and one you cannot: WHO the feed would have shown
      // this task to, and whether a delegation was in play.
      rightfulOwnerIds: owners,
      actingAs: actingIds.filter((id) => id !== user.id),
    }));
  } catch (e) {
    console.error("[task-owner-check] observation failed (request unaffected):", e);
  }
}

// The feed's own ownership rule for a stored field_task row, reproduced.
//   • COLLECTION  (title "إعداد خطاب تحصيل…") → the LIVE mapping only.
//   • AGENCY ISSUANCE (title "إصدار وكالة…")  → the LIVE mapping only.
//     Both are SKIPPED by feed block 8 and emitted solely by their own
//     live-routed blocks, so the mapped user is the one and only rightful actor.
//   • EXECUTION (title "رفع طلب تنفيذ…") → the mapping OR the stored assignee.
//     Deliberately BOTH: block 8 does NOT skip the execution prefix, so an
//     execution row surfaces TWICE — as a field_task to its stored assignee and
//     as an execution task to the mapped owner, under two different feed ids.
//     Two feed paths present it, so either actor reached it legitimately and
//     warning on one of them would be a false positive. (That double-emission is
//     pre-existing and is NOT touched here.)
//   • everything else (generic field tasks, general عام tasks) → assigned_to.
// The mapping costs two reads, so it is loaded ONLY for the three live-routed
// prefixes; a plain field task resolves with no extra query at all.
async function resolveFieldTaskOwnerIds(
  task: { title: string; assignedTo: string; taskType: string },
): Promise<{ ownerIds: string[]; taskType: string }> {
  const isCollection = task.title.startsWith(CollectionTaskTitlePrefix);
  const isExecution = task.title.startsWith(ExecutionTaskTitlePrefix);
  // No named constant exists for this prefix — feed blocks 8 and 18 both match
  // the literal, so matching it here keeps all three in step.
  const isAgencyIssuance = task.title.startsWith("إصدار وكالة");
  if (!isCollection && !isExecution && !isAgencyIssuance) {
    return {
      ownerIds: [task.assignedTo || ""],
      taskType: task.taskType === FieldTaskType.GENERAL ? "general" : "field_task",
    };
  }
  const assignments = await storage.getAdminSupportTaskAssignments();
  const users = await storage.getAllUsers();
  const mapped = resolveAdminSupportAssignee(
    isCollection ? AssignableAdminSupportTaskKind.COLLECTION
      : isExecution ? AssignableAdminSupportTaskKind.EXECUTION
      : AssignableAdminSupportTaskKind.AGENCY_ISSUANCE,
    assignments,
    users,
  );
  return {
    ownerIds: isExecution ? [mapped, task.assignedTo || ""] : [mapped],
    taskType: isCollection ? "collection" : isExecution ? "execution" : "agency_issuance",
  };
}

// A legal deadline's authority is ENTIRELY its parent case's — the table has no
// assignee, no creator column and no department of its own. So this is just
// canModifyCase(parent), with the parent resolved and BOTH unresolvable states
// answering false: a falsy caseId (unreachable — the column is notNull and the
// insert schema is .min(1)) and a case that will not load (an orphan surviving
// on a DB without the CASCADE FK). The old inline gate treated both as PASS.
// Extracted rather than written twice because PATCH and DELETE must agree; two
// copies of a fail-closed rule is how one of them later stops being one.
async function canModifyDeadlineParentCase(
  user: CaseActorIdentity,
  deadline: { caseId: string | null },
  ctx: ActingContext | undefined,
): Promise<boolean> {
  if (!deadline.caseId) return false;
  const parentCase = await storage.getCaseById(deadline.caseId);
  if (!parentCase) return false;
  return canModifyCase(user, parentCase, ctx);
}

async function canActOnMemo(
  user: CaseActorIdentity,
  memo: any,
  ctx: ActingContext | undefined,
  adminRoles: string[],
): Promise<boolean> {
  const identities = ctx
    ? actingIdentitiesFor(ctx, memo.caseId ?? null).map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
    : [user];
  // Admin roles + the memo assignee don't depend on the parent case.
  if (identities.some((u) => adminRoles.includes(u.role) || (!!memo.assignedTo && memo.assignedTo === u.id))) {
    return true;
  }
  // department_head is scoped to the parent case's department. Fetch the parent
  // case only when there is a department_head identity to evaluate (matches the
  // original gate, which fetched it only for a department_head actor).
  const deptHeads = identities.filter((u) => u.role === "department_head");
  if (deptHeads.length === 0) return false;
  const parentCase = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
  if (!parentCase) return false;
  // !!u.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
  return deptHeads.some((u) => !!u.departmentId && parentCase.departmentId === u.departmentId);
}

// 4c-5 (memos) — per-identity predicate for the memo /activities READ gate
// (richer than the modify gate: admin incl. cases_review_head, the memo
// assignee, the parent case's lawyers, and the parent case's dept_head). The
// parent case is always loaded by that endpoint, so it's passed in. Mirrors the
// consultation/contract /activities gates, which already read req.actingContext
// via canModify*. No ctx → [self] → byte-identical.
function canViewMemoActivitiesIdentity(u: CaseActorIdentity, memo: any, parentCase: any): boolean {
  if (["branch_manager", "admin_support", "cases_review_head"].includes(u.role)) return true;
  if (memo.assignedTo === u.id) return true;
  if (!!parentCase && (
    parentCase.primaryLawyerId === u.id ||
    parentCase.responsibleLawyerId === u.id ||
    (Array.isArray(parentCase.assignedLawyers) && parentCase.assignedLawyers.includes(u.id))
  )) return true;
  if (u.role === "department_head" && !!u.departmentId && !!parentCase && parentCase.departmentId === u.departmentId) return true;
  return false;
}

// May this actor send a notification ABOUT this entity?
//
// The non-admin half of the POST /api/notifications gate. Every live workflow
// trigger (lib/notification-triggers.ts) carries relatedType + relatedId —
// sendNotificationDirect makes both REQUIRED — so this re-derives authority
// over the named row instead of trusting any claim in the body.
//
// The bar is canModify* on the entity, PLUS its creator. The creator clause is
// load-bearing, not a courtesy: a freshly created case has assignedLawyers: []
// and null lawyer fields (storage.createCase), so an `employee` who opens a case
// in their own department is NOT yet an assigned lawyer on it and would fail
// canModifyCase — which would break notifyCaseAdded, the dept-head heads-up,
// the moment the gate landed. createdBy is server-derived at creation
// (POST /api/cases), so it is not forgeable. Consultations already admit their
// creator inside canModifyConsultationIdentity, so they need no special case.
//
// Unresolvable or absent link → false → the caller falls back to the role
// branch. "task" carries a DELEGATION id, not a task id, so it is never
// resolvable here.
async function canReferenceRelatedEntity(
  user: CaseActorIdentity,
  relatedType: string | null,
  relatedId: string | null,
  ctx?: ActingContext,
): Promise<boolean> {
  if (!relatedType || !relatedId) return false;

  const onCase = async (caseId: string | null | undefined): Promise<boolean> => {
    if (!caseId) return false;
    const c = await storage.getCaseById(caseId);
    return !!c && (canModifyCase(user, c, ctx) || c.createdBy === user.id);
  };
  const onConsultation = async (id: string | null | undefined): Promise<boolean> => {
    if (!id) return false;
    const c = await storage.getConsultationById(id);
    return !!c && canModifyConsultation(user, c, ctx);
  };
  // 🔴 THE ONE PERMISSION LINE THE OWNER APPROVED FOR THIS BATCH.
  //
  // MODELLED ON onConsultation, deliberately, and not on onCase. Contracts are
  // the exact structural analogue of consultations here: a single top-level
  // entity that carries its OWN departmentId column and has its own
  // canModifyContract helper — so the authority test is one call, identical in
  // shape. onCase additionally accepts `c.createdBy === user.id`, which is a
  // case-specific carve-out (a case's creator may reference it before a lawyer
  // is assigned); canModifyContract ALREADY admits the creator internally, so
  // copying that arm would have been redundant, not merely wider.
  //
  // WHAT THIS WIDENS, EXACTLY: relatedType "contract" previously hit the
  // `default: return false` arm, so referencing a contract in a notification was
  // available ONLY to the five canSendNotifications roles. It is now ALSO
  // available to whoever canModifyContract already admits — admin_support, the
  // own-department department_head, the contract's assignee, its creator, and
  // its internal reviewer. admin_support is the one that matters: it is in
  // canSendReminders but NOT in canSendNotifications, so without this arm an
  // admin_support contract reminder 403s.
  //
  // IT GRANTS NOTHING ELSE. This helper is consulted at exactly one place — the
  // send gate on POST /api/notifications (and the reminders endpoint, which
  // reuses that same gate). Its return value only ever decides whether a
  // notification row may NAME this contract. It confers no read of the
  // contract, no write, no stage transition, no workflow action; every one of
  // those keeps its own gate, untouched. And it can only widen for users
  // canModifyContract ALREADY returns true for — it introduces no new predicate.
  const onContract = async (id: string | null | undefined): Promise<boolean> => {
    if (!id) return false;
    const c = await storage.getContractById(id);
    return !!c && canModifyContract(user, c, ctx);
  };

  switch (relatedType) {
    case "case":
      return onCase(relatedId);
    case "consultation":
      return onConsultation(relatedId);
    case "contract":
      return onContract(relatedId);
    case "hearing": {
      const h = await storage.getHearingById(relatedId);
      return !!h && onCase(h.caseId);
    }
    case "memo": {
      const m = await storage.getMemoById(relatedId);
      return !!m && onCase(m.caseId);
    }
    case "field_task": {
      const t = await storage.getFieldTaskById(relatedId);
      if (!t) return false;
      // A field task's own participants may notify about it even when it hangs
      // off no case/consultation (contract- or client-linked, or free-standing).
      if (t.assignedTo === user.id || t.assignedBy === user.id) return true;
      return (await onCase(t.caseId)) || (await onConsultation(t.consultationId));
    }
    default:
      return false;
  }
}

function canActOnHearingIdentity(
  u: CaseActorIdentity,
  hearing: any,
  parentCase: { departmentId?: string | null } | null,
): boolean {
  // 🔴 department_head IS ADMITTED HERE — OWNER REVERSAL, 2026-08-05.
  //
  // Phase 5 B/M4 REMOVED department_head from this helper, reasoning that the FE
  // never surfaced a hearing action to a dept_head so the grant was "UI-dead and
  // only reachable via direct API". THE OWNER HAS REVERSED THAT DECISION: a
  // department head is meant to have the FULL hearing action set on their own
  // department's cases — recording results, the report, client contact,
  // cancelling, flagging, the ضبط file, and the opponent-response flag. The
  // frontend mirrors are widened to match, so the grant is no longer UI-dead.
  // DO NOT RE-REMOVE IT to "restore the Phase 5 mirror" — that mirror is exactly
  // what changed. See CLAUDE.md, "📎 ATTACHMENTS" / hearing permissions.
  //
  // viewer is kept per the codebase's viewer-in-can*-helpers convention; it is
  // inert — viewerWriteGuard 403s every viewer write before any handler runs.
  if (["branch_manager", "admin_support", "viewer"].includes(u.role)) return true;
  if (hearing.attendingLawyerId && hearing.attendingLawyerId === u.id) return true;
  // Hearings carry NO departmentId of their own, so the scope is resolved through
  // the PARENT CASE — the getCaseById(hearing.caseId) precedent already used by
  // canEditHearingRecord, the my-tasks scoping and the judgment promotion.
  //
  // 🔴 THE !!u.departmentId GUARD IS MANDATORY. Without it a dept_head whose own
  // departmentId is null/"" would match every case whose departmentId is also
  // empty — legacy rows, "أخرى" assignments, half-configured accounts. This is
  // the single most repeated permission bug in this codebase.
  if (
    u.role === "department_head"
    && !!u.departmentId
    && !!parentCase?.departmentId
    && u.departmentId === parentCase.departmentId
  ) return true;
  return false;
}
// ✅ تحضير الجلسة — WHO MAY CONFIRM A SESSION IS PREPARED.
//
// 🔴 A SEPARATE, NARROWER HELPER — canActOnHearing IS DELIBERATELY NOT REUSED
// AND NOT MODIFIED. That helper admits `admin_support` and `viewer` on top of
// this set, and it gates result recording, the hearing report, the ضبط file and
// the opponent-response flag. CLAUDE.md carries an explicit owner instruction
// not to re-narrow it ("DO NOT RE-REMOVE department_head … that mirror is
// exactly what changed"), so touching it to fit this feature is forbidden in
// both directions.
//
// THE SET (owner decision): the hearing's ATTENDING LAWYER, the parent case's
// OWN-DEPARTMENT department_head, and branch_manager. `admin_support` is
// EXCLUDED on purpose — in the later ringing batches they are an escalation
// AUDIENCE who may acknowledge ("تم الاطلاع") but may not end the chain by
// declaring the session prepared. `viewer` is excluded too; it would be inert
// anyway (viewerWriteGuard 403s every viewer write before any handler runs),
// but leaving it out keeps this list readable as the real actor set.
//
// Same async/lazy shape as canActOnHearing: the two in-memory actor classes
// settle without a read, so the parent case is fetched ONLY when a
// department_head is asking. Callers holding the case pass it and skip the read.
//
// 🔴 THE !!u.departmentId GUARD IS MANDATORY — without it a head whose own
// department is null matches every case whose department is also null.
function canCheckInHearingIdentity(
  u: CaseActorIdentity,
  hearing: any,
  parentCase: { departmentId?: string | null } | null,
): boolean {
  if (u.role === "branch_manager") return true;
  if (hearing.attendingLawyerId && hearing.attendingLawyerId === u.id) return true;
  if (
    u.role === "department_head"
    && !!u.departmentId
    && !!parentCase?.departmentId
    && u.departmentId === parentCase.departmentId
  ) return true;
  return false;
}

async function canCheckInHearing(
  user: CaseActorIdentity,
  hearing: any,
  ctx?: ActingContext,
  parentCase?: { departmentId?: string | null } | null,
): Promise<boolean> {
  const identities: CaseActorIdentity[] = ctx
    ? actingIdentitiesFor(ctx, hearing.caseId ?? null)
        .map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
    : [user];
  if (identities.some((u) => canCheckInHearingIdentity(u, hearing, null))) return true;
  if (!identities.some((u) => u.role === "department_head")) return false;
  const resolved = parentCase !== undefined
    ? parentCase
    : (hearing.caseId ? await storage.getCaseById(hearing.caseId) : null);
  if (!resolved) return false;
  return identities.some((u) => canCheckInHearingIdentity(u, hearing, resolved));
}

// Delegation-aware wrapper — mirrors the canModifyCase idiom (identity fn +
// actingIdentitiesFor expansion) so a delegate standing in for the attending
// lawyer can act on the hearing, exactly like every other case action. Keyed on
// the hearing's parent case id so specific_cases delegations scope correctly;
// non-case scoping is impossible here (a hearing always has a caseId). With no
// ctx the identity set is exactly [self] → byte-identical to the old check, so
// NON-delegated allow/deny is unchanged. The distinct attending-lawyer semantics
// are preserved per-identity (we do NOT fold into canModifyCase, which grants a
// broader role set and would loosen the gate for non-delegated users too).
// ⚠ ASYNC AS OF 2026-08-05 — every call site must `await`. It became async because
// the department_head grant needs the PARENT CASE's departmentId and a hearing
// carries none.
//
// THE PARENT CASE IS FETCHED LAZILY, and that is deliberate: the three existing
// actor classes (branch_manager / admin_support / attending lawyer) are settled by
// the in-memory fast path and NEVER trigger a read, so this costs an extra query
// ONLY when a department_head is the one asking. Callers that already hold the
// case can pass it as `parentCase` and skip the read entirely.
async function canActOnHearing(
  user: CaseActorIdentity,
  hearing: any,
  ctx?: ActingContext,
  parentCase?: { departmentId?: string | null } | null,
): Promise<boolean> {
  const identities: CaseActorIdentity[] = ctx
    ? actingIdentitiesFor(ctx, hearing.caseId ?? null)
        .map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
    : [user];
  // Fast path — no DB touch. Covers every pre-existing actor unchanged.
  if (identities.some((u) => canActOnHearingIdentity(u, hearing, null))) return true;
  // Only a department_head can still qualify, and only via the parent case.
  if (!identities.some((u) => u.role === "department_head" && !!u.departmentId)) return false;
  const resolved = parentCase ?? (hearing.caseId ? await storage.getCaseById(hearing.caseId) : null);
  if (!resolved) return false;
  return identities.some((u) => canActOnHearingIdentity(u, hearing, resolved));
}

// ==================== HEARING RECORD EDITING (owner-approved 2026-07-28) ====================
//
// Gate for CORRECTING an already-recorded hearing — the report (phase 1) and the
// no-cascade result fields (phase 2). Deliberately DIFFERENT from canActOnHearing,
// which governs RECORDING and admits only the ATTENDING lawyer with no department
// logic at all:
//   branch_manager | admin_support                          → any time, any case
//   department_head of the PARENT CASE's department         → only on the hearing's own day
//   assigned lawyer of the PARENT CASE (isAssignedLawyer,   → only on the hearing's own day
//     so all four case assignment fields)
//
// This is the parent-case join the permissions batch deferred for hearings (they
// carry no departmentId of their own). Built HERE and used by these two endpoints
// ONLY — the six canActOnHearing endpoints (result / report-exported / cancel /
// close / agency-verify) are deliberately untouched in this commit.
//
// THE WINDOW is measured on the HEARING'S OWN DATE, not the recording date, and in
// the FIRM's calendar day (isFirmToday) — see the FirmTimeZone comment in
// shared/schema.ts for the timezone bug this avoids. Enforced SERVER-SIDE because a
// client check reads the user's own clock.
//
// Delegation-aware through actingIdentitiesFor, keyed on the parent case id so
// specific_cases delegations scope correctly.
type HearingEditGate = { allowed: true } | { allowed: false; status: 403; error: string };

async function canEditHearingRecord(
  user: CaseActorIdentity,
  hearing: any,
  ctx?: ActingContext,
): Promise<HearingEditGate> {
  const identities: CaseActorIdentity[] = ctx
    ? actingIdentitiesFor(ctx, hearing?.caseId ?? null).map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
    : [user];

  // Admin tier — unconditional, no parent-case fetch needed.
  if (identities.some((u) => u.role === "branch_manager" || u.role === "admin_support")) {
    return { allowed: true };
  }

  const parentCase = hearing?.caseId ? await storage.getCaseById(hearing.caseId) : null;
  if (!parentCase) {
    return { allowed: false, status: 403, error: "لا تملك صلاحية تعديل هذه الجلسة" };
  }

  const isScopedActor = identities.some((u) =>
    (u.role === "department_head"
      && !!u.departmentId
      && !!parentCase.departmentId
      && parentCase.departmentId === u.departmentId)
    || isAssignedLawyer({ id: u.id }, parentCase));
  if (!isScopedActor) {
    return { allowed: false, status: 403, error: "لا تملك صلاحية تعديل هذه الجلسة" };
  }

  if (!isFirmToday(hearing?.hearingDate)) {
    return {
      allowed: false,
      status: 403,
      error: "انتهت مهلة التعديل — التعديل متاح يوم الجلسة فقط. لتصحيح نتيجة خاطئة يُلغى موعد الجلسة وتُسجَّل جلسة جديدة",
    };
  }
  return { allowed: true };
}

async function validateAssignedUsersActive(userIds: string[]): Promise<{ valid: boolean; inactiveUsers: string[] }> {
  const inactiveUsers: string[] = [];
  for (const id of userIds) {
    if (!id) continue;
    const user = await storage.getUser(id);
    if (!user || !user.isActive) {
      inactiveUsers.push(id);
    }
  }
  return { valid: inactiveUsers.length === 0, inactiveUsers };
}

// Settlement-link-missing pause: the exact pause_reason text written by
// the hearing-result handler and matched (exact equality) by the
// auto-unpause hook in POST /api/hearings and the scheduler auto-close.
const SETTLEMENT_LINK_MISSING_PAUSE_REASON = "بانتظار رابط جلسة الصلح من العميل";

// ==================== Server-Side Stage Transition Validation ====================

interface StageTransitionRule {
  from: string;
  to: string;
  allowedRoles: string[];
}

const ALLOWED_CASE_TRANSITIONS: StageTransitionRule[] = [
  // ==================== COMMON TRANSITIONS ====================
  { from: "استلام", to: "استكمال_البيانات", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "استكمال_البيانات", to: "دراسة", allowedRoles: ["department_head", "assigned_lawyer", "branch_manager"] },
  { from: "دراسة", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "تحرير_صحيفة_الدعوى", to: "مراجعة_داخلية", allowedRoles: ["assigned_lawyer", "department_head"] },
  // 🔴 THE GENERAL/COMMERCIAL MERGE. تحرير_صحيفة_الدعوى was removed from
  // UnderStudyGeneralStages + UnderStudyCommercialStages, so on those two paths
  // دراسة is now adjacent to مراجعة_داخلية in both directions. These two edges
  // are ADDED; NOTHING is removed — the three تحرير_صحيفة_الدعوى edges above and
  // below are still required by Labor, Admin and InCourtPlaintiffMemo, which
  // keep the stage.
  //
  // ⚠ THE TABLE IS FLAT AND PATH-BLIND, so these edges are technically
  // traversable by Labor/Admin too (skipping their drafting stage via direct
  // API). Owner-accepted: no UI offers it — every FE target is derived from the
  // case's OWN resolved path (resolveSendBackStage, the array-driven nextStage)
  // — and this is the table's existing documented property, not a new one. The
  // fix for that class is making validateStageTransition path-aware, which is
  // the DEFERRED guard batch and stays deferred.
  { from: "دراسة", to: "مراجعة_داخلية", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "مراجعة_داخلية", to: "دراسة", allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: "مراجعة_داخلية", to: "إحالة_للجنة_المراجعة", allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "جاهزة_للرفع", allowedRoles: ["cases_review_head", "labor_review_head", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "الأخذ_بالملاحظات", allowedRoles: ["cases_review_head", "labor_review_head", "branch_manager"] },
  { from: "الأخذ_بالملاحظات", to: "جاهزة_للرفع", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "مراجعة_داخلية", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["cases_review_head", "labor_review_head", "branch_manager"] },

  // Skip data completion
  { from: "استلام", to: "دراسة", allowedRoles: ["department_head", "branch_manager", "assigned_lawyer"] },

  // ==================== GENERAL PATH (after ready_to_submit) ====================
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_ناجز", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_ناجز", to: "مداولة_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_ناجز", to: "منظورة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "أغلق_طلب_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "منظورة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "قيد_التدقيق_في_ناجز", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "قيد_التدقيق_في_معين", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "تحصيل", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "مقفلة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },

  // ==================== COMMERCIAL PATH (taradi then najiz) ====================
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_تراضي", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_تراضي", to: "مداولة_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },

  // ==================== LABOR PATH (settlement before drafting) ====================
  { from: "دراسة", to: "توجيه_العميل_بالتسوية", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Settlement-edge actor model (labor-only stages — neither appears in any other
  // department's path). Both edges now carry the SAME set the settlement-OUTCOME
  // edges already use (مداولة_الصلح → أغلق/تحصيل/مقفلة below): assigned_lawyer +
  // admin_support + department_head (+ branch_manager, global on every defined
  // edge). Previously the two were mirror-image inconsistent — the lawyer could
  // enter the settlement track and decide its outcome but NOT move it across the
  // middle step (the FE enabled the button for him → guaranteed 403), while
  // admin_support could do the middle step but not the one before it.
  { from: "توجيه_العميل_بالتسوية", to: "بانتظار_رفع_العميل_للتسوية", allowedRoles: ["assigned_lawyer", "admin_support", "department_head"] },
  { from: "بانتظار_رفع_العميل_للتسوية", to: "مداولة_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer", "department_head"] },

  // ==================== ADMIN PATH (prescription date + grievance) ====================
  { from: "استلام", to: "تحديد_تاريخ_التقادم", allowedRoles: ["department_head", "assigned_lawyer", "branch_manager"] },
  { from: "تحديد_تاريخ_التقادم", to: "استكمال_البيانات", allowedRoles: ["department_head", "assigned_lawyer", "branch_manager"] },
  { from: "دراسة", to: "تحرير_صيغة_التظلم", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "تحرير_صيغة_التظلم", to: "مراجعة_داخلية_للتظلم", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "مراجعة_داخلية_للتظلم", to: "تقديم_التظلم", allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: "مراجعة_داخلية_للتظلم", to: "تحرير_صيغة_التظلم", allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: "تقديم_التظلم", to: "انتظار_رد_التظلم", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "انتظار_رد_التظلم", to: "تحصيل", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "انتظار_رد_التظلم", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_معين", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_معين", to: "منظورة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },

  // ==================== IN-COURT PATH: defendant + memo ====================
  // استلام → استكمال_البيانات is shared with the common section.
  { from: "استلام", to: "تحرير_مذكرة_جوابية", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "استكمال_البيانات", to: "تحرير_مذكرة_جوابية", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "تحرير_مذكرة_جوابية", to: "مراجعة_داخلية", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "مراجعة_داخلية", to: "تحرير_مذكرة_جوابية", allowedRoles: ["internal_reviewer", "branch_manager"] },

  // ==================== IN-COURT PATH: plaintiff + memo ====================
  // Drafting the lawsuit pleading after the case is already filed. The
  // common drafting transitions (تحرير_صحيفة_الدعوى → مراجعة_داخلية, etc.)
  // are reused from the general section above.
  { from: "استلام", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "استكمال_البيانات", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer", "department_head"] },

  // ==================== IN-COURT PATH: no memo (study only) ====================
  { from: "استكمال_البيانات", to: "دراسة", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "دراسة", to: "منظورة", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },

  // Dynamic bridge: if a memo is added after the case has already reached
  // دراسة on the no-memo path, the progress bar needs to route دراسة → the
  // appropriate drafting stage. (دراسة → تحرير_صحيفة_الدعوى is already in
  // the common section for UNDER_STUDY cases and is reused here.)
  { from: "دراسة", to: "تحرير_مذكرة_جوابية", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },

  // ==================== IN-COURT TERMINAL ====================
  // After review (with or without notes) an in-court case goes straight to
  // منظورة — it's already filed, so there's no ناجز/تراضي step and no
  // جاهزة_للرفع gate.
  { from: "إحالة_للجنة_المراجعة", to: "منظورة", allowedRoles: ["cases_review_head", "labor_review_head", "branch_manager", "department_head"] },
  { from: "الأخذ_بالملاحظات", to: "منظورة", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },

  // ==================== POST-TRIAL TRANSITIONS ====================
  { from: "منظورة", to: "محكوم_حكم_ابتدائي", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "منظورة", to: "محكوم_حكم_نهائي", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "منظورة", to: "مشطوبة", allowedRoles: ["assigned_lawyer", "department_head"] },

  { from: "محكوم_حكم_ابتدائي", to: "منظورة_استئناف", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "محكوم_حكم_ابتدائي", to: "مقفلة", allowedRoles: ["department_head", "branch_manager"] },

  { from: "منظورة_استئناف", to: "محكوم_حكم_نهائي", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "منظورة_استئناف", to: "مشطوبة", allowedRoles: ["assigned_lawyer", "department_head"] },
  // THE REMAND EDGE (إعادة للدرجة الأولى). The appeal court set aside the ruling below and
  // sent the case back to first instance, so it returns to منظورة DIRECTLY
  // (owner-settled) to await a NEW first-instance ruling. Before this, منظورة_استئناف
  // had no path back and a quashed case had nowhere to go.
  //
  // 🔴 ROLES ARE assigned_lawyer + department_head ONLY — deliberately NOT the
  // مشطوبة → منظورة set, which also admits admin_support. Reinstating a struck-off
  // case is a CLERICAL act (the registrar restored it); recording that a court
  // quashed a judgment is a LEGAL one. Same reasoning that keeps admin_support out
  // of the MOHR, reopen, appeal-outcome and صك-receipt gates.
  { from: "منظورة_استئناف", to: "منظورة", allowedRoles: ["assigned_lawyer", "department_head"] },

  // محكوم_حكم_نهائي → تحصيل is DELIBERATELY ABSENT (removed). A final judgment
  // RESTS at محكوم_حكم_نهائي (b41553a): the collection / execution field tasks are
  // created there, and completing them closes the case DIRECTLY to مقفلة with
  // تم_التحصيل via maybeCloseCaseAfterPostJudgmentTasks. It must not detour through
  // تحصيل, which belongs exclusively to the SETTLEMENT (مداولة_الصلح → تحصيل) and
  // GRIEVANCE (انتظار_رد_التظلم → تحصيل) routes — the only two edges that create the
  // collection task on entry.
  //
  // The edge was API-ONLY: no UI path ever offered it (محكوم_حكم_نهائي is in
  // TerminalCaseStages, so the stage bar suppresses the advance button, and both
  // تحصيل writers in the client are gated on currentStage === مداولة_الصلح). Taking
  // it by hand-rolled PATCH moved a JUDGMENT case onto the settlement route's stage
  // and — because 5ea9c23 deliberately does not create a second collection task on
  // this edge — a case whose tasks were already resolved landed somewhere its only
  // exits are the event-driven auto-close (which would not re-fire) and the
  // zero-outstanding-task escape. Removing the rule seals it for EVERY role
  // including branch_manager: the `if (!rule)` denial runs BEFORE the
  // branch_manager bypass.
  { from: "محكوم_حكم_نهائي", to: "مقفلة", allowedRoles: ["department_head", "branch_manager"] },

  // تحصيل → مقفلة is DELIBERATELY ABSENT. A case at تحصيل closes AUTOMATICALLY
  // when its collection/execution tasks are resolved
  // (maybeCloseCaseAfterPostJudgmentTasks); a manual close would bypass that and
  // leave those tasks dangling. Removing the rule seals the generic transition path
  // for EVERY role including branch_manager, because the `if (!rule)` denial above
  // returns BEFORE the branch_manager bypass. The early-close shortcut is excluded
  // separately, and the single escape for a case with NO outstanding task is the
  // dedicated guard in PATCH /api/cases/:id. Do not re-add this edge.

  { from: "مشطوبة", to: "منظورة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "مشطوبة", to: "منظورة_استئناف", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "مشطوبة", to: "مقفلة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
];

// Consultations canonical 7+1 stage workflow per consultations-rebuild-spec.md
// §3.2.1. Forward transitions only — backward transitions are handled via the
// rollback block in validateStageTransition (matches case-side semantics:
// dept_head/branch_manager can rollback to any prior stage; assigned_lawyer
// can rollback one step). The committee/review/notes-outcome transitions
// have additional endpoint-level checks (e.g. internal-review enforces
// "actor must be the active cycle's reviewer") in their dedicated routes.
//
// Stage values come from the ConsultationStage enum (no Arabic literals
// in this file; the enum lives in shared/schema.ts).
const ALLOWED_CONSULTATION_TRANSITIONS: StageTransitionRule[] = [
  // Linear happy-path. Phase-8 — RECEIVED_PENDING_COMPLETION inserted at
  // position 2 of the linear path. Direct RECEIVED → STUDY is removed;
  // the canonical flow is RECEIVED → PENDING_COMPLETION → STUDY.
  //
  // The "تجاوز استكمال المرفقات والبيانات" button is deliberately NOT an edge
  // here: it is a PRE-ENTRY skip served by /skip-data-completion, which
  // bypasses this table entirely (the skip-committee precedent), so the
  // override stays unreachable through /advance-stage.
  { from: ConsultationStage.RECEIVED,                    to: ConsultationStage.RECEIVED_PENDING_COMPLETION, allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: ConsultationStage.RECEIVED_PENDING_COMPLETION, to: ConsultationStage.STUDY,                       allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  // 🔴 THE MERGE (WRITTEN only). دراسة and تحرير are one stage now, rendered
  // «الدراسة والتحرير», with دراسة as the stored value. The two edges
  // STUDY→DRAFTING and DRAFTING→INTERNAL_REVIEW collapse into this single one.
  // No DRAFTING edge remains, so the stage is unreachable via /advance-stage.
  { from: ConsultationStage.STUDY,           to: ConsultationStage.INTERNAL_REVIEW,   allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Internal-review outcomes (enforced finely by the internal-review endpoint;
  // table stays permissive for assigned_lawyer + dept_head + branch_manager).
  // ⚠ THE REJECT LOOP now returns to STUDY, the merged stage — it used to point
  // at DRAFTING. Its twin is the handler that actually writes the stage
  // (POST /:id/internal-review); BOTH had to move or rejection would write a
  // value this table no longer permits.
  { from: ConsultationStage.INTERNAL_REVIEW, to: ConsultationStage.STUDY,             allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: ConsultationStage.INTERNAL_REVIEW, to: ConsultationStage.COMMITTEE,         allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Committee decisions
  { from: ConsultationStage.COMMITTEE,       to: ConsultationStage.READY,             allowedRoles: ["consultations_review_head", "branch_manager"] },
  { from: ConsultationStage.COMMITTEE,       to: ConsultationStage.TAKING_NOTES,      allowedRoles: ["consultations_review_head", "branch_manager"] },
  // Take-notes outcome (any of تم | لم_يتم | جزئياً all advance to READY)
  { from: ConsultationStage.TAKING_NOTES,    to: ConsultationStage.READY,             allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Final closure — WRITTEN goes READY → CLOSED_FINAL directly (the old
  // intermediate COMPLETED "جاهزة للإغلاق" stage was removed from the
  // WRITTEN flow). Admin-gated to match the PHONE/PROCEDURAL
  // COMPLETED → CLOSED_FINAL closure pattern. The /advance-stage route
  // flips status='closed' + closedAt when CLOSED_FINAL is reached.
  { from: ConsultationStage.READY,           to: ConsultationStage.CLOSED_FINAL,      allowedRoles: ["admin_support", "branch_manager"] },
];

// Phone (هاتفية) workflow — 5-stage simple flow. Same structure as the
// procedural workflow; only the stage-3 token differs (STUDY vs IN_PROGRESS).
// 1→2 is the assign action (only branch_manager / dept_head); 2→3 is the
// generic advance (assigned_lawyer included so the lawyer can move it
// forward themselves once they pick it up). 4→5 is the explicit final
// closure (admin_support / branch_manager only).
const ALLOWED_CONSULTATION_TRANSITIONS_PHONE: StageTransitionRule[] = [
  { from: ConsultationStage.RECEIVED,                    to: ConsultationStage.RECEIVED_PENDING_COMPLETION, allowedRoles: ["department_head", "branch_manager"] },
  { from: ConsultationStage.RECEIVED_PENDING_COMPLETION, to: ConsultationStage.STUDY,                       allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: ConsultationStage.STUDY,                       to: ConsultationStage.COMPLETED,                   allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: ConsultationStage.COMPLETED,                   to: ConsultationStage.CLOSED_FINAL,                allowedRoles: ["admin_support", "branch_manager"] },
];

// Procedural (إجرائية) workflow — same shape as PHONE except stage 3 is
// IN_PROGRESS ("جاري_العمل") instead of STUDY ("دراسة").
const ALLOWED_CONSULTATION_TRANSITIONS_PROCEDURAL: StageTransitionRule[] = [
  { from: ConsultationStage.RECEIVED,                    to: ConsultationStage.RECEIVED_PENDING_COMPLETION, allowedRoles: ["department_head", "branch_manager"] },
  { from: ConsultationStage.RECEIVED_PENDING_COMPLETION, to: ConsultationStage.IN_PROGRESS,                 allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: ConsultationStage.IN_PROGRESS,                 to: ConsultationStage.COMPLETED,                   allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: ConsultationStage.COMPLETED,                   to: ConsultationStage.CLOSED_FINAL,                allowedRoles: ["admin_support", "branch_manager"] },
];

function getConsultationTransitionsForType(type: string): StageTransitionRule[] {
  const resolved = resolveConsultationType(type);
  if (resolved === ConsultationType.PHONE) return ALLOWED_CONSULTATION_TRANSITIONS_PHONE;
  if (resolved === ConsultationType.PROCEDURAL) return ALLOWED_CONSULTATION_TRANSITIONS_PROCEDURAL;
  return ALLOWED_CONSULTATION_TRANSITIONS;
}

// Follow-up cycle transitions ("استشارة تعقيبية"). 2 rules per type —
// RECEIVED → working stage (assigned/dept/branch), working → CLOSED_FINAL
// (admin-gated, matching the main-flow closure pattern). /advance-stage
// already flips status='closed' on CLOSED_FINAL — no extra branch needed.
const ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_WRITTEN: StageTransitionRule[] = [
  { from: ConsultationStage.RECEIVED, to: ConsultationStage.READY,        allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: ConsultationStage.READY,    to: ConsultationStage.CLOSED_FINAL, allowedRoles: ["admin_support", "branch_manager"] },
];
const ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_PHONE: StageTransitionRule[] = [
  { from: ConsultationStage.RECEIVED,  to: ConsultationStage.COMPLETED,    allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: ConsultationStage.COMPLETED, to: ConsultationStage.CLOSED_FINAL, allowedRoles: ["admin_support", "branch_manager"] },
];
// PROCEDURAL shares the PHONE cycle shape (RECEIVED → COMPLETED → CLOSED_FINAL).
const ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_PROCEDURAL = ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_PHONE;

function getConsultationCycleTransitionsForType(type: string): StageTransitionRule[] {
  const resolved = resolveConsultationType(type);
  if (resolved === ConsultationType.PHONE) return ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_PHONE;
  if (resolved === ConsultationType.PROCEDURAL) return ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_PROCEDURAL;
  return ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_WRITTEN;
}

// Contracts (العقود والمشاريع) — single 8-stage flow regardless of
// contract type. Mirrors the WRITTEN consultation workflow: assign
// from RECEIVED, optional data-completion stage with skip, drafting,
// internal-review approve/has-notes loop, committee-decision loop
// with conditional TAKING_NOTES, then READY → CLOSED. Committee chair
// is consultations_review_head (per spec). Closure stage transition
// (READY → CLOSED) is restricted to admin_support / branch_manager.
const ALLOWED_CONTRACT_TRANSITIONS: StageTransitionRule[] = [
  // Intake → data-completion. Per spec: dept_head + branch_manager +
  // admin_support + assigned. The assigned_lawyer was missing from
  // earlier revisions, blocking employees from advancing files
  // routed to them — fixed.
  { from: ContractStage.RECEIVED,                    to: ContractStage.RECEIVED_PENDING_COMPLETION, allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  // Data-completion → drafting. (تحرير is also where the PRE-ENTRY
  // /skip-data-completion lands, but that endpoint bypasses this table —
  // it starts from استلام, not from here.)
  { from: ContractStage.RECEIVED_PENDING_COMPLETION, to: ContractStage.DRAFTING,                    allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  // Drafting → internal review.
  { from: ContractStage.DRAFTING,                    to: ContractStage.INTERNAL_REVIEW,             allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Internal-review outcomes — locked to the DESIGNATED reviewer
  // (synthetic role "internal_reviewer", set when
  // entityData.internalReviewerId === user.id) plus dept_head and
  // branch_manager. Earlier revisions used "assigned_lawyer" here,
  // which let the assigned employee approve their own file —
  // fixed.
  { from: ContractStage.INTERNAL_REVIEW,             to: ContractStage.DRAFTING,                    allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: ContractStage.INTERNAL_REVIEW,             to: ContractStage.COMMITTEE,                   allowedRoles: ["internal_reviewer", "branch_manager"] },
  // Committee decisions — chair = consultations_review_head.
  // department_head is INTENTIONALLY NOT in this set: heads don't
  // override committee decisions. Their override channel is the
  // backward-rollback path (returns the file to a prior stage),
  // not a forward approve/reject.
  { from: ContractStage.COMMITTEE,                   to: ContractStage.READY,                       allowedRoles: ["consultations_review_head", "branch_manager"] },
  { from: ContractStage.COMMITTEE,                   to: ContractStage.TAKING_NOTES,                allowedRoles: ["consultations_review_head", "branch_manager"] },
  // Take-notes outcomes (تم | لم_يتم | جزئياً) all advance to READY.
  { from: ContractStage.TAKING_NOTES,                to: ContractStage.READY,                       allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Final closure — admin_support / branch_manager only.
  // department_head intentionally excluded per spec.
  { from: ContractStage.READY,                       to: ContractStage.CLOSED,                      allowedRoles: ["admin_support", "branch_manager"] },
];

function getContractTransitionsForType(_type: string): StageTransitionRule[] {
  // All three contract types share the same 8-stage flow today; the
  // helper exists so attachment-slot rules (per-type) can swap in a
  // type-specific table later without touching the validators.
  return ALLOWED_CONTRACT_TRANSITIONS;
}

// Follow-up cycle transitions ("استشارة تعقيبية" on a contract). Mirrors
// ALLOWED_CONSULTATION_CYCLE_TRANSITIONS_WRITTEN: 2 forward steps —
// RECEIVED → READY (the work: answer the question), READY → CLOSED
// (admin-gated, matching the main-flow closure edge). The cycle deliberately
// contains NO تحرير / مراجعة_داخلية / لجنة_مراجعة edges: a follow-up is
// answer-and-close, not a re-run of the full contract flow.
//
// /advance-stage already flips status='closed' + closedAt whenever CLOSED is
// reached (the `reachedClosed` branch), so the cycle's final step re-closes
// the contract with no extra branch — same as the consultations comment.
//
// Roles copied verbatim from the WRITTEN consultation cycle, and they happen
// to match the contract's own main-flow gates: the closure edge READY →
// CLOSED is admin_support/branch_manager in ALLOWED_CONTRACT_TRANSITIONS too.
const ALLOWED_CONTRACT_CYCLE_TRANSITIONS: StageTransitionRule[] = [
  { from: ContractStage.RECEIVED, to: ContractStage.READY,  allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: ContractStage.READY,    to: ContractStage.CLOSED, allowedRoles: ["admin_support", "branch_manager"] },
];

// Type-keyed for shape-parity with getContractTransitionsForType /
// getConsultationCycleTransitionsForType, though contracts have one flow.
function getContractCycleTransitionsForType(_type: string): StageTransitionRule[] {
  return ALLOWED_CONTRACT_CYCLE_TRANSITIONS;
}

// 4c-4 (contracts) — per-identity original logic (mirror of cases/consultations).
// consultations_review_head IS admin-class here (contracts committee chair);
// cases_review_head is intentionally EXCLUDED (they can still match via
// assigned/creator/internal-reviewer identity). No caseId on contracts → only
// self + all_cases delegators apply. No ctx → [self] → byte-identical.
function canModifyContractIdentity(u: CaseActorIdentity, contract: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "consultations_review_head", "viewer"];
  if (adminRoles.includes(u.role)) return true;
  // !!u.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
  if (u.role === "department_head" && !!u.departmentId && contract.departmentId === u.departmentId) return true;
  if (contract.assignedTo === u.id || contract.createdBy === u.id) return true;
  if (contract.internalReviewerId === u.id) return true;
  return false;
}
function canModifyContract(
  user: CaseActorIdentity,
  contract: any,
  ctx?: ActingContext,
): boolean {
  const identities = ctx
    ? actingIdentitiesFor(ctx, null).map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
    : [user];
  return identities.some((u) => canModifyContractIdentity(u, contract));
}

// Memos canonical 6+1 stage workflow (Phase-9). Mirrors consultations
// but with memo-specific terminal labels (جاهزة_للرفع / مرفوعة) and no
// STUDY / RECEIVED_PENDING_COMPLETION stages — memos go straight from
// RECEIVED to DRAFTING. The committee-chair role is cases_review_head
// (memos belong to cases), not consultations_review_head.
//
// Forward transitions only — backward transitions are handled via the
// memo rollback block in validateStageTransition (matches the
// consultations rollback semantics: dept_head/branch_manager can
// rollback to any prior stage; assigned_lawyer can rollback one step).
const ALLOWED_MEMO_TRANSITIONS: StageTransitionRule[] = [
  // Reception
  { from: MemoStage.RECEIVED,        to: MemoStage.DRAFTING,        allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  // Drafting → peer review
  { from: MemoStage.DRAFTING,        to: MemoStage.INTERNAL_REVIEW, allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Internal-review outcomes (the dedicated endpoint enforces decision-vs-actor).
  { from: MemoStage.INTERNAL_REVIEW, to: MemoStage.DRAFTING,        allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: MemoStage.INTERNAL_REVIEW, to: MemoStage.COMMITTEE,       allowedRoles: ["internal_reviewer", "branch_manager"] },
  // Committee decisions (cases_review_head is the committee chair for memos).
  { from: MemoStage.COMMITTEE,       to: MemoStage.READY,           allowedRoles: ["cases_review_head", "labor_review_head", "branch_manager"] },
  { from: MemoStage.COMMITTEE,       to: MemoStage.TAKING_NOTES,    allowedRoles: ["cases_review_head", "labor_review_head", "branch_manager"] },
  // Take-notes outcome (any of تم | لم_يتم | جزئياً all advance to READY)
  { from: MemoStage.TAKING_NOTES,    to: MemoStage.READY,           allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Filing
  { from: MemoStage.READY,           to: MemoStage.FILED,           allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
];

function isAssignedLawyer(user: { id: string }, entityData: any): boolean {
  if (entityData.primaryLawyerId === user.id || entityData.responsibleLawyerId === user.id) return true;
  if (entityData.assignedTo === user.id) return true;
  if (Array.isArray(entityData.assignedLawyers) && entityData.assignedLawyers.includes(user.id)) return true;
  return false;
}

// ==================== WIDENED AUTHORITY MODEL (owner-approved 2026-07-27) ====================
//
// THE MODEL
//   branch_manager   → everything
//   department_head  → the SAME abilities, scoped to their OWN department
//   employee         → the SAME abilities, scoped to items ASSIGNED to them
//
// ⚠ PURELY ADDITIVE. entityActorTier is always OR-ed onto a gate's EXISTING role
// list — it never replaces one — so admin_support / cases_review_head /
// consultations_review_head / labor_review_head keep every grant they hold today
// and no current actor loses access. The only NARROWINGS in this batch are the two
// the owner explicitly asked for (assignment + department transfer); each is done
// at its own call site, not here.
//
// ⚠ DELIBERATELY NOT BUILT BY RELAXING canModifyCase (audit finding R7). That
// helper's flat adminRoles list passes cases_review_head, consultations_review_head
// and viewer UNCONDITIONALLY with no department scope, so widening it would widen
// those three firm-wide as a side effect. This is a separate, tighter helper.
//
// CARVE-OUTS — enforced by the CALLER picking the tier, not by this helper:
//   • DELETE                    — branch_manager only; never calls this.
//   • ASSIGNMENT / REASSIGNMENT — DEPARTMENT tier (see canActAtDepartmentTier).
//   • DEPARTMENT TRANSFER       — DEPARTMENT tier.
//   • INTERNAL REVIEW           — the four-eyes locks in validateStageTransition and
//                                 the dedicated /internal-review endpoints stay
//                                 HUMAN-only and are NOT routed through here.
//   • COMMITTEE DECISIONS       — untouched; skip-committee remains the reasoned,
//                                 logged override for bm | own-dept head | assignee.
//
// "ASSIGNED TO ME" always resolves through isAssignedLawyer — never hand-rolled.
// Cases carry FOUR assignment fields (primaryLawyerId / responsibleLawyerId /
// assignedLawyers[]); memos / consultations / contracts carry assignedTo.
//
// createdBy IS NOT AN ASSIGNMENT (deliberate, and the one place this helper is
// narrower than canModifyConsultation / canModifyContract, which do honour it):
//   1. the model says "items ASSIGNED to them" — creating is not being assigned;
//   2. cases and memos never honoured createdBy, consultations and contracts do —
//      one rule across four entities is the whole point of a shared helper;
//   3. admin_support creates most consultations and contracts, so treating
//      createdBy as an assignment would hand them permanent assignee-tier authority
//      over every record they ever opened — even after it is reassigned and
//      transferred to another department. That is a firm-wide grant hiding inside a
//      tier whose entire premise is that it is scoped.
// Nothing is lost: canModifyConsultation / canModifyContract still honour createdBy
// and this helper is OR-ed onto them, so creators keep exactly what they have today.
//
// DELEGATION: resolved through actingIdentitiesFor like every sibling gate, so a
// delegate inherits the delegator's tier. scopeCaseId honours specific_cases
// delegations — cases pass their own id, memos their parent case id, consultations
// and contracts pass null (no case id ⇒ all_cases delegations only).
type EntityTier = "manager" | "department" | "assignee";

const ENTITY_TIER_RANK: Record<EntityTier, number> = { manager: 3, department: 2, assignee: 1 };

// Highest tier the actor holds on this entity, or null for none.
// departmentId is passed EXPLICITLY rather than read off the entity because memos
// carry no department of their own — their callers resolve the PARENT CASE's.
function entityActorTier(
  user: CaseActorIdentity,
  entity: any,
  departmentId: string | null | undefined,
  ctx?: ActingContext,
  scopeCaseId?: string | null,
): EntityTier | null {
  const identities: CaseActorIdentity[] = ctx
    ? actingIdentitiesFor(ctx, scopeCaseId ?? null).map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
    : [user];
  let best: EntityTier | null = null;
  let bestRank = 0;
  for (const u of identities) {
    let tier: EntityTier | null = null;
    if (u.role === "branch_manager") {
      tier = "manager";
    } else if (
      u.role === "department_head"
      && !!u.departmentId
      && !!departmentId
      && departmentId === u.departmentId
    ) {
      tier = "department";
    } else if (!!entity && isAssignedLawyer({ id: u.id }, entity)) {
      // Reached by ANY role that happens to be assigned — including a
      // department_head of a DIFFERENT department, who correctly drops to the
      // assignee tier rather than the department one.
      tier = "assignee";
    }
    if (tier && ENTITY_TIER_RANK[tier] > bestRank) {
      best = tier;
      bestRank = ENTITY_TIER_RANK[tier];
    }
  }
  return best;
}

// Any tier — the default for widened workflow actions.
function canActOnEntityTiered(
  user: CaseActorIdentity,
  entity: any,
  departmentId: string | null | undefined,
  ctx?: ActingContext,
  scopeCaseId?: string | null,
): boolean {
  return entityActorTier(user, entity, departmentId, ctx, scopeCaseId) !== null;
}

// DEPARTMENT tier and above — the carve-out set: assignment / reassignment and
// department transfer. Excludes the assignee on purpose (self-reassignment is a
// privilege-escalation loop: assign it to yourself, then hold assignee-tier
// authority over it).
function canActAtDepartmentTier(
  user: CaseActorIdentity,
  entity: any,
  departmentId: string | null | undefined,
  ctx?: ActingContext,
  scopeCaseId?: string | null,
): boolean {
  const tier = entityActorTier(user, entity, departmentId, ctx, scopeCaseId);
  return tier === "manager" || tier === "department";
}

// CREATE-SCOPE (owner-approved follow-up) — department_head and employee may now
// OPEN a record on any of the four entities, but ONLY into their OWN department.
// branch_manager / admin_support (and any review head a module grants creation to)
// stay global and are passed straight through.
//
// FORCED **and** REJECTED — deliberately both, split on whether the client was
// explicit about the department:
//   • departmentId ABSENT or empty  → FORCED to the actor's own department. The FE
//     locks the selector for these two roles, so an omitted value is the normal
//     request shape, not an attempt to cross departments. Forcing here means a
//     client that simply doesn't send the field still lands correctly.
//   • departmentId PRESENT and DIFFERENT → REJECTED with a clean 400. Silently
//     rewriting an explicit, differing value would hide a real frontend bug and
//     would leave the activity log disagreeing with what the user believed they
//     submitted. A cross-department attempt should be visible, not absorbed.
// A department_head / employee with NO department of their own is rejected outright
// rather than being allowed to create an unscoped record.
//
// MEMOS DO NOT USE THIS — they carry no departmentId; their scope is the PARENT
// CASE's department, enforced at the memo create route through entityActorTier.
type CreateScopeResult =
  | { ok: true; departmentId: string | null }
  | { ok: false; error: string };

function scopedCreateDepartmentId(
  user: { role: string; departmentId: string | null },
  bodyDepartmentId: unknown,
): CreateScopeResult {
  const requested = typeof bodyDepartmentId === "string" ? bodyDepartmentId.trim() : "";
  if (user.role !== "department_head" && user.role !== "employee") {
    return { ok: true, departmentId: requested || null };
  }
  if (!user.departmentId) {
    return { ok: false, error: "لا يمكن الإنشاء: لم يتم تعيين قسم لحسابك" };
  }
  if (requested && requested !== user.departmentId) {
    return { ok: false, error: "يمكنك الإنشاء في قسمك فقط" };
  }
  return { ok: true, departmentId: user.departmentId };
}

// Final-closure edges — the terminal step that ends a file's life. Owner-adopted
// carve-out: DEPARTMENT tier and above, so the widened ASSIGNEE tier is excluded.
// Early-close is deliberately NOT here: it stays open to the assignee (it demands a
// mandatory reason and is fully audited — the lawyer's legitimate path). Only these
// terminal edges tighten. Each of these edges ALSO excluded the assigned lawyer in
// its own transition table before the widening, so this restores that exactly.
function isFinalClosureEdge(entityType: string, currentStage: string, targetStage: string): boolean {
  if (entityType === "case") {
    // تحصيل is NOT listed: its edge is removed from the table outright, so this
    // predicate is unreachable for it. The two judgment closures keep the a1e3456
    // treatment — department tier and above, assignee excluded.
    return targetStage === "مقفلة" && (
      currentStage === "محكوم_حكم_ابتدائي"
      || currentStage === "محكوم_حكم_نهائي"
    );
  }
  if (entityType === "consultation") return targetStage === ConsultationStage.CLOSED_FINAL;
  if (entityType === "contract") return targetStage === ContractStage.CLOSED;
  return false;
}

// Committee-decision edges — the ONE class of forward transition the widened
// department/assignee tiers may NOT traverse (carve-out 3). Leaving the committee
// stage is a chair's ruling; the sanctioned override for everyone else is
// POST /:id/skip-committee, which bypasses validateStageTransition entirely and
// records a mandatory reason. Keyed on the FROM stage, so every exit edge is
// covered (approve, add-notes, and the send-back-to-drafting variants).
function isCommitteeDecisionEdge(entityType: string, currentStage: string): boolean {
  if (entityType === "case") return currentStage === "إحالة_للجنة_المراجعة";
  if (entityType === "memo") return currentStage === MemoStage.COMMITTEE;
  if (entityType === "consultation") return currentStage === ConsultationStage.COMMITTEE;
  if (entityType === "contract") return currentStage === ContractStage.COMMITTEE;
  return false;
}


function validateStageTransition(
  currentStage: string,
  targetStage: string,
  userRole: string,
  entityType: "case" | "consultation" | "memo" | "contract",
  user?: { id: string; departmentId?: string | null },
  entityData?: any,
  ctx?: ActingContext,
): { allowed: boolean; reason?: string } {
  if (currentStage === targetStage) {
    return { allowed: false, reason: "العنصر في نفس المرحلة المطلوبة" };
  }

  // 4c-0 delegation-aware GRANT checks. When ctx carries active delegations
  // these expand to the delegator(s) the actor stands in for (role + dept +
  // identity); with no delegation (no ctx, or empty delegators) they resolve to
  // EXACTLY the actor's own role/id/dept, so every decision below is
  // byte-identical to before. The INTERNAL_REVIEW locks (four-eyes) deliberately
  // do NOT use these — they keep comparing the HUMAN actor (see below).
  // specific_cases scope keys on the entity's case id (the case itself, or a
  // memo's parent case); consultations/contracts have no case id → all_cases only.
  const scopeCaseId: string | null =
    entityType === "case" ? (entityData?.id ?? null)
    : entityType === "memo" ? (entityData?.caseId ?? null)
    : null;
  const grantRoles = (...roles: string[]): boolean =>
    ctx ? hasEffectiveRole(ctx, scopeCaseId, ...roles) : roles.includes(userRole);
  const grantDeptHeadDept = (deptId: string | null | undefined): boolean =>
    !!deptId && (ctx
      ? effectiveDeptHeadDepts(ctx, scopeCaseId).has(deptId)
      : (userRole === "department_head" && !!user?.departmentId && user.departmentId === deptId));
  const grantAssignedLawyer = (): boolean => {
    if (!entityData) return false;
    if (!ctx) return !!user && isAssignedLawyer(user, entityData);
    return Array.from(effectiveIdsFor(ctx, scopeCaseId)).some((id) => isAssignedLawyer({ id }, entityData));
  };
  const grantInternalReviewer = (): boolean => {
    if (!(entityType === "case" || entityType === "memo" || entityType === "contract")) return false;
    if (!entityData?.internalReviewerId) return false;
    if (!ctx) return !!user && entityData.internalReviewerId === user.id;
    return effectiveIdsFor(ctx, scopeCaseId).has(entityData.internalReviewerId);
  };

  // Early closure: branch_manager / admin_support / department_head (own
  // dept) / assigned lawyer can move a case from any stage to مقفلة.
  // Mirrors the consultations-side canEarlyClose gate. The closure reason
  // is required for all four roles (validated separately in the PATCH
  // handler).
  //
  // ⚠ EXCEPT FROM تحصيل — sealed for EVERY role, branch_manager included. A case at
  // تحصيل closes automatically when its collection/execution tasks resolve
  // (maybeCloseCaseAfterPostJudgmentTasks); an early-close from there would bypass
  // that and orphan those tasks. This exclusion is LOAD-BEARING: the three role
  // checks below `return { allowed: true }` before any fall-through, so the old
  // trailing comment claiming "تحصيل … don't depend on the early-close shortcut"
  // was simply wrong — this shortcut WAS the way a manual close from تحصيل
  // succeeded. The only remaining way out of تحصيل by hand is the zero-outstanding-
  // task guard in PATCH /api/cases/:id, which bypasses this function entirely.
  if (entityType === "case" && targetStage === "مقفلة" && currentStage !== "تحصيل") {
    if (grantRoles("branch_manager", "admin_support")) {
      return { allowed: true };
    }
    if (entityData && grantDeptHeadDept(entityData.departmentId)) {
      return { allowed: true };
    }
    if (grantAssignedLawyer()) {
      return { allowed: true };
    }
    // Fall through to ALLOWED_CASE_TRANSITIONS for stage-specific rules
    // (e.g. مشطوبة / post-judgment closures have their own edges).
  }

  // Designated-reviewer synthetic role — HUMAN ONLY. This feeds the
  // INTERNAL_REVIEW LOCKS (four-eyes), which must compare the real human actor
  // and stay unchanged by delegation in 4c-0. (The effectiveRoles GRANT below
  // uses grantInternalReviewer(), the delegation-aware variant.)
  const isInternalReviewerHuman =
    (entityType === "case" || entityType === "memo" || entityType === "contract")
    && !!user && !!entityData && entityData.internalReviewerId === user.id;

  // WIDENED MODEL (owner-approved 2026-07-27) — an own-department department_head
  // may act at internal review, because branch_manager can and a head is
  // "branch_manager scoped to their own department".
  // ⚠ FOUR-EYES IS PRESERVED (carve-out 2): they must NOT be the assigned lawyer of
  // the entity under review, so the reviewer can still never be the author.
  // HUMAN-ONLY like the rest of this block — deliberately NOT delegation-expanded,
  // so a delegation can never manufacture a second pair of eyes.
  // (memos carry no departmentId of their own; their callers thread the PARENT
  // CASE's onto entityData before calling — see POST /api/memos/:id/advance-stage.)
  const isOwnDeptHeadNonAuthorHuman =
    userRole === "department_head"
    && !!user
    && !!user.departmentId
    && !!entityData
    && !!entityData.departmentId
    && entityData.departmentId === user.departmentId
    && !isAssignedLawyer({ id: user.id }, entityData);

  // Internal review stages are locked: only the designated internal reviewer
  // or the branch manager can transition out of them. HUMAN-ONLY (four-eyes) —
  // intentionally NOT delegation-expanded.
  if (
    entityType === "case" &&
    (currentStage === "مراجعة_داخلية" || currentStage === "مراجعة_داخلية_للتظلم")
  ) {
    if (!isInternalReviewerHuman && !isOwnDeptHeadNonAuthorHuman && userRole !== "branch_manager") {
      return {
        allowed: false,
        reason: "فقط المراجع الداخلي المعين أو رئيس القسم أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية",
      };
    }
  }

  // Memo INTERNAL_REVIEW lock — same semantics as cases. Prevents users
  // bypassing the dedicated /internal-review endpoint by calling
  // /advance-stage or /return-stage from المراجعة_داخلية. The dedicated
  // endpoint already enforces this; this is belt-and-braces for the
  // generic stage-transition routes.
  if (entityType === "memo" && currentStage === "مراجعة_داخلية") {
    if (!isInternalReviewerHuman && !isOwnDeptHeadNonAuthorHuman && userRole !== "branch_manager") {
      return {
        allowed: false,
        reason: "فقط المراجع الداخلي المعين أو رئيس القسم أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية",
      };
    }
  }

  // Contract INTERNAL_REVIEW lock — mirror cases/memos. The dedicated
  // /internal-review endpoint also enforces this, but the generic
  // /advance-stage and /return-stage routes need the same gate so a
  // non-reviewer employee can't approve their own draft by calling the
  // generic endpoint directly.
  if (entityType === "contract" && currentStage === ContractStage.INTERNAL_REVIEW) {
    if (!isInternalReviewerHuman && !isOwnDeptHeadNonAuthorHuman && userRole !== "branch_manager") {
      return {
        allowed: false,
        reason: "فقط المراجع الداخلي المعين أو رئيس القسم أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية",
      };
    }
  }

  // GRANT side (delegation-aware): the actor's effective roles for this entity,
  // plus the assigned_lawyer / internal_reviewer synthetic roles if any
  // effective identity holds them. With no delegation this is exactly
  // [userRole] (+ the actor's own synthetic roles) — byte-identical.
  const effectiveRoles = ctx ? Array.from(effectiveRolesFor(ctx, scopeCaseId)) : [userRole];
  if (grantAssignedLawyer()) {
    effectiveRoles.push("assigned_lawyer");
  }
  if (grantInternalReviewer()) {
    effectiveRoles.push("internal_reviewer");
  }

  // ==================== THE CASE'S RESOLVED PATH — COMPUTED ONCE ====================
  // HOISTED VERBATIM out of the rollback block immediately below, where these
  // three values used to be declared. Pure refactor: same inputs, same call, same
  // order, and there is not a single statement between this declaration and the
  // block that consumed it — so nothing can mutate entityData, currentStage or
  // targetStage in between, and getStagesForClassification is a pure lookup over
  // module-level arrays. The rollback block still gates on
  // `entityType === "case" && entityData`, so it reads exactly the values it
  // computed for itself before.
  //
  // WHY HOIST AT ALL: the resolved path is the only thing in this function that
  // knows a stage belongs to a DIFFERENT case shape, and it was reachable only in
  // the rollback direction. Making it function-scope puts it in scope at the
  // forward matcher further down. NOTHING READS IT THERE YET — that is a separate,
  // separately-approved batch. This commit changes no outcome.
  //
  // 🔴 STAGE SELECTION ROUTES ON THE CASE'S DEPARTMENT, never on caseType, which is
  // free-text user input ("بيع وتوريد" …). Callers stash the resolved name on
  // entityData.departmentName before invoking this function — see PATCH
  // /api/cases/:id. When it is absent, getStagesForClassification silently falls
  // back to the GENERAL array, which is why that stash matters.
  //
  // 🔴 AND THE CALLER MUST KEEP PASSING THE POST-UPDATE SHAPE. PATCH builds
  // `mergedCase = { ...existing, ...req.body }` precisely so a request that also
  // changes caseClassification / memoRequired / clientRole / isSettlementCase
  // resolves against what the case is BECOMING, not what it was. That is
  // load-bearing, not incidental: the "لم يتم الصلح — استكمال الإجراءات" control
  // (case-progress-bar.tsx, the handleSettlementDecision call for أغلق_طلب_الصلح)
  // sends `{ isSettlementCase: false, caseClassification: "قيد_الدراسة" }` in the
  // SAME request as the stage move. Resolved against `existing` the case would
  // still look like a settlement case and land on the 3-stage settlement path;
  // resolved against the merge it correctly lands on an under-study path that
  // contains both endpoints. Never "simplify" that call site to pass `existing`.
  const casePath: CaseStageValue[] | null =
    (entityType === "case" && entityData)
      ? getStagesForClassification(
          entityData.caseClassification as CaseClassificationValue,
          (entityData.departmentName as string | undefined) ?? undefined,
          entityData.clientRole as string | undefined,
          !!entityData.memoRequired,
          !!entityData.isSettlementCase,
        )
      : null;
  const caseCurrentIdx = casePath ? casePath.indexOf(currentStage as CaseStageValue) : -1;
  const caseTargetIdx = casePath ? casePath.indexOf(targetStage as CaseStageValue) : -1;

  // Rollback logic for cases
  if (entityType === "case" && entityData) {
    if (caseCurrentIdx >= 0 && caseTargetIdx >= 0 && caseTargetIdx < caseCurrentIdx) {
      // This is a rollback
      const isLawyer = effectiveRoles.includes("assigned_lawyer");
      // Phase 5 B/M4 — dept_head rollback is scoped to their OWN department
      // (mirrors the contract rollback idiom below); branch_manager stays
      // global. The FE already only surfaces other-dept cases to
      // branch_manager (canViewCase scopes dept_head to own dept), so this
      // enforces server-side what the UI already constrains.
      const isBranchManager = grantRoles("branch_manager");
      const isOwnDeptHead = grantDeptHeadDept(entityData.departmentId);

      if (isBranchManager || isOwnDeptHead) {
        return { allowed: true }; // can go back to ANY previous stage
      }
      if (grantInternalReviewer() && caseTargetIdx === caseCurrentIdx - 1) {
        return { allowed: true }; // reviewer can send back one stage (to drafting)
      }
      if (isLawyer && caseTargetIdx === caseCurrentIdx - 1) {
        return { allowed: true }; // can only go back ONE stage
      }
      if (isLawyer && caseTargetIdx < caseCurrentIdx - 1) {
        return { allowed: false, reason: "المحامي يمكنه الرجوع مرحلة واحدة فقط" };
      }
      return { allowed: false, reason: "ليس لديك صلاحية للرجوع في المراحل" };
    }
  }

  // Consultation rollback (per consultations-rebuild-spec.md §3.2.1):
  //   department_head / branch_manager can return to any prior stage;
  //   assigned_lawyer can return one step.
  // The stages list is type-aware: WRITTEN keeps the 7+1 path (incl.
  // conditional TAKING_NOTES); PHONE / PROCEDURAL use their own 5-stage
  // lists. Anything not in the resolved list still uses WRITTEN — see
  // resolveConsultationType for the legacy-value fallback.
  if (entityType === "consultation" && entityData) {
    // Cycle-aware: a follow-up cycle uses its own 3-stage list for
    // rollback validation (1-step-back rule still applies, just on the
    // shorter list). isInFollowUpCycle includes the active-status check;
    // outside a cycle we fall back to the type's full stages list.
    const stages = (isInFollowUpCycle(entityData)
      ? getStagesForConsultationCycle(entityData)
      : getConsultationStagesForType(resolveConsultationType(entityData.consultationType))
    ) as readonly string[];
    const currentIdx = stages.indexOf(currentStage);
    const targetIdx = stages.indexOf(targetStage);
    if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) {
      const isLawyer = effectiveRoles.includes("assigned_lawyer");
      // Phase 5 B/M4 — dept_head scoped to own dept (mirrors contract rollback);
      // branch_manager global. consultation entityData carries departmentId.
      const isBranchManager = grantRoles("branch_manager");
      const isOwnDeptHead = grantDeptHeadDept(entityData.departmentId);
      if (isBranchManager || isOwnDeptHead) return { allowed: true };
      if (isLawyer && targetIdx === currentIdx - 1) return { allowed: true };
      if (isLawyer && targetIdx < currentIdx - 1) {
        return { allowed: false, reason: "المحامي يمكنه الرجوع مرحلة واحدة فقط" };
      }
      return { allowed: false, reason: "ليس لديك صلاحية للرجوع في المراحل" };
    }
  }

  // Memo rollback — same semantics as consultations. MemoStagesAll includes
  // the conditional TAKING_NOTES stage in canonical order.
  if (entityType === "memo" && entityData) {
    const stages = MemoStagesAll as readonly string[];
    const currentIdx = stages.indexOf(currentStage);
    const targetIdx = stages.indexOf(targetStage);
    if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) {
      const isLawyer = effectiveRoles.includes("assigned_lawyer");
      // Phase 5 B/M4 — dept_head scoped to the parent case's dept (threaded
      // onto entityData.departmentId by the memo handlers, since memos carry
      // no departmentId); branch_manager global. Mirrors contract rollback.
      const isBranchManager = grantRoles("branch_manager");
      const isOwnDeptHead = grantDeptHeadDept(entityData.departmentId);
      if (isBranchManager || isOwnDeptHead) return { allowed: true };
      if (isLawyer && targetIdx === currentIdx - 1) return { allowed: true };
      if (isLawyer && targetIdx < currentIdx - 1) {
        return { allowed: false, reason: "المحامي يمكنه الرجوع مرحلة واحدة فقط" };
      }
      return { allowed: false, reason: "ليس لديك صلاحية للرجوع في المراحل" };
    }
  }

  // Contract rollback — same single-step semantics as the other
  // entities, plus a tighter dept_head dept-scope. department_head
  // can only roll back contracts in their OWN department;
  // branch_manager remains global. Earlier revisions had no
  // dept-scope check, which let a dept_head from any dept call
  // /return-stage on any contract just by knowing its id.
  if (entityType === "contract" && entityData) {
    // Cycle-aware, mirroring the consultation rollback block below: a
    // follow-up cycle rolls back inside its own 3-stage list (the 1-step-back
    // rule still applies, just on the shorter list). isContractInFollowUpCycle
    // includes the active-status check; outside a cycle we keep ContractStagesAll.
    const stages = (isContractInFollowUpCycle(entityData)
      ? getStagesForContractCycle(entityData)
      : ContractStagesAll
    ) as readonly string[];
    const currentIdx = stages.indexOf(currentStage);
    const targetIdx = stages.indexOf(targetStage);
    if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) {
      const isLawyer = effectiveRoles.includes("assigned_lawyer");
      const isBranchManager = grantRoles("branch_manager");
      const isOwnDeptHead = grantDeptHeadDept(entityData.departmentId);
      if (isBranchManager || isOwnDeptHead) return { allowed: true };
      if (isLawyer && targetIdx === currentIdx - 1) return { allowed: true };
      if (isLawyer && targetIdx < currentIdx - 1) {
        return { allowed: false, reason: "المحامي يمكنه الرجوع مرحلة واحدة فقط" };
      }
      return { allowed: false, reason: "ليس لديك صلاحية للرجوع في المراحل" };
    }
  }

  // Forward transitions: route to the entity-specific table.
  // Consultation table is selected per workflow type — WRITTEN keeps
  // the existing 7+1 table; PHONE / PROCEDURAL use their own 5-stage
  // tables (RECEIVED → PENDING_COMPLETION → STUDY|IN_PROGRESS →
  // COMPLETED → CLOSED_FINAL).
  const rules =
    entityType === "case"
      ? ALLOWED_CASE_TRANSITIONS
      : entityType === "memo"
        ? ALLOWED_MEMO_TRANSITIONS
        : entityType === "contract"
          ? (isContractInFollowUpCycle(entityData)
              ? getContractCycleTransitionsForType(entityData?.contractType)
              : getContractTransitionsForType(entityData?.contractType))
          : (isInFollowUpCycle(entityData)
              ? getConsultationCycleTransitionsForType(entityData?.consultationType)
              : getConsultationTransitionsForType(entityData?.consultationType));
  const rule = rules.find(r => r.from === currentStage && r.to === targetStage);

  if (!rule) {
    return { allowed: false, reason: `لا يمكن الانتقال من "${currentStage}" إلى "${targetStage}"` };
  }

  // branch_manager is global on every DEFINED forward transition, for ALL
  // entity types. This mirrors the rollback blocks above (each short-circuits
  // `isBranchManager → allowed` per entity) and the system-wide intent that
  // the branch manager can drive any case/consultation/contract/memo through
  // its workflow. A rule must still EXIST (checked above), so the manager can
  // only traverse legal edges — not jump arbitrarily.
  //
  // Behavioral no-op today for consultation/contract/memo (every rule in their
  // tables already lists branch_manager); it was load-bearing only for cases,
  // whose older table omitted branch_manager on ~14 lawyer-work edges (e.g.
  // تحرير_صحيفة_الدعوى → مراجعة_داخلية) and 400'd a non-assignee manager. Kept
  // universal so a future rule that forgets branch_manager can't silently
  // re-block it on any resource.
  //
  // Four-eyes is NOT affected: the self-review guards live in dedicated
  // endpoints (consultation /internal-review's identity check
  // `isAssignedLawyer` blocks even a branch_manager assignee; contract/memo
  // require the designated `internal_reviewer` identity) — a different code
  // path from this forward matcher — and the INTERNAL_REVIEW locks above
  // (which already exempt branch_manager by design) still govern exits FROM
  // review. branch_manager being allowed on internal-review *outcome* edges is
  // pre-existing and intentional in every table.
  if (grantRoles("branch_manager")) {
    return { allowed: true };
  }

  // WIDENED MODEL (owner-approved 2026-07-27) — the department/assignee tiers get
  // the SAME traversal branch_manager has above, because "same abilities, scoped"
  // is exactly what the model says. Placed AFTER the `rule` lookup, so like the
  // branch_manager bypass it can only traverse edges that already EXIST in the
  // table — never an arbitrary jump. This replaces what would otherwise be ~20
  // separate role-list edits across the four transition tables (102 rules).
  //
  // TWO THINGS IT CANNOT DO, by construction:
  //   • COMMITTEE DECISIONS (carve-out 3) — isCommitteeDecisionEdge keys on the FROM
  //     stage, so no exit edge out of the committee stage is bypassable. The
  //     sanctioned override stays POST /:id/skip-committee, which bypasses this
  //     function entirely and records a mandatory reason.
  //   • INTERNAL REVIEW (carve-out 2) — the four-eyes locks run far above this point
  //     and RETURN EARLY, so an actor who fails them never reaches here. The
  //     assignee can therefore never approve their own draft, and the own-dept head
  //     admitted up there is admitted only when they are NOT the author.
  //
  // Delegation-aware through the same grant* helpers the rest of this function uses
  // (grantDeptHeadDept honours effectiveDeptHeadDepts; grantAssignedLawyer honours
  // effectiveIdsFor), so a delegate inherits the delegator's traversal.
  //   • FINAL CLOSURE (owner-adopted carve-out) — the department tier keeps these
  //     terminal edges, the ASSIGNEE tier does not. Early-close is unaffected: it
  //     runs through the early-close shortcut far above, not through this matcher.
  if (!isCommitteeDecisionEdge(entityType, currentStage)) {
    if (grantDeptHeadDept(entityData?.departmentId)) {
      return { allowed: true };
    }
    if (!isFinalClosureEdge(entityType, currentStage, targetStage) && grantAssignedLawyer()) {
      return { allowed: true };
    }
  }

  if (!effectiveRoles.some(role => rule.allowedRoles.includes(role))) {
    // Diagnostic: a transition reached the forward role-match and was denied.
    // The branch_manager bypass above ALREADY returns allowed for a real
    // branch_manager, so if this logs userRole:"branch_manager" the running
    // process predates that bypass (stale server) — otherwise it prints the
    // actual JWT role doing the action (e.g. admin_support), which is the true
    // reason a non-branch_manager modify-capable user is blocked here.
    console.warn("[validateStageTransition] forward transition denied", {
      entityType,
      userRole,
      from: currentStage,
      to: targetStage,
      effectiveRoles,
      allowedRoles: rule.allowedRoles,
    });
    return { allowed: false, reason: "ليس لديك صلاحية لتنفيذ هذا الانتقال" };
  }

  return { allowed: true };
}

async function getActiveMemoCount(caseId: string): Promise<number> {
  const memos = await storage.getMemosByCase(caseId);
  return memos.filter(m => !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status)).length;
}

// The memo statuses that mean "still open work" — not yet approved, filed or
// cancelled. Lifted out of the close-cleanup so the judgment path cancels by the
// SAME definition instead of a second copy of the list.
const ACTIVE_MEMO_STATUSES = ["لم_تبدأ", "قيد_التحرير", "قيد_المراجعة", "تحتاج_تعديل"];

// Cancel a case's still-open memos. ONE implementation, two callers:
//   • cancelOpenCaseChildrenOnClose — no exclusions; a closed case keeps nothing.
//   • the HEARING-RESULT path — excluding MemoType.OBJECTION, because pleadings
//     are over once the session has happened but the لائحة اعتراضية is the
//     opposite: it is the work a ruling CREATES. It must survive if it already
//     exists, and the صك receipt must still be able to create one AFTER the
//     judgment.
// Returns the count so callers can log it. Does NOT recompute activeMemoCount —
// each caller owns that (the close path already reconciles it at the end).
//
// `reason` routes the write through storage.cancelMemo instead of a bare status
// update, which is what makes the cancellation EXPLAINED rather than silent: it
// stamps memos.cancellation_reason on the row AND inserts the memo_activity_log
// "cancelled" entry, in one transaction — the same mechanism the manual
// "لا يحتاج مذكرة" flow uses, so the memo-detail cancellation banner
// ("سبب الإلغاء: …", memos.tsx) renders these automatic cancellations too.
// Callers with no reason (the close paths) keep the previous bare-status write.
async function cancelActiveCaseMemos(
  caseId: string,
  opts: { excludeTypes?: string[]; reason?: string; performedBy?: string } = {},
): Promise<number> {
  const exclude = new Set(opts.excludeTypes || []);
  const memos = await storage.getMemosByCase(caseId);
  let cancelled = 0;
  for (const m of memos) {
    if (!ACTIVE_MEMO_STATUSES.includes(m.status)) continue;
    if (exclude.has(String(m.memoType))) continue;
    if (opts.reason) {
      await storage.cancelMemo(m.id, {
        reason: opts.reason,
        performedBy: opts.performedBy || "system",
      });
    } else {
      await storage.updateMemo(m.id, { status: "ملغاة" });
    }
    cancelled++;
  }
  return cancelled;
}

// Cancel a closing case's still-open children. Extracted VERBATIM from the
// PATCH /api/cases/:id close block (which now calls this) so EVERY path that
// closes a case applies identical cleanup. The judgment-close path used to skip
// this entirely — it writes through storage directly and never passes through
// PATCH — leaving cancelled cases with live upcoming hearings, open memos and
// pending field tasks that kept emitting scheduler reminders.
//
// Best-effort by design: a cleanup failure must never fail the close itself,
// which is why the caller's own try/catch shape is preserved inside.
// 📣 "A new record landed in your department" — told to the department HEAD(S),
// from the server, at create time.
//
// WHY THIS MOVED OFF THE CLIENT. It used to be a browser POST to
// /api/notifications (notifyCaseAdded / notifyConsultationAdded), and its
// failure was swallowed TWICE: once inside sendNotificationDirect's own catch
// and again by a `.catch(() => {})` at the call site. So a head could silently
// never be told, and nobody — user or log — would ever know. Worse, it could
// not fire at all for a record created by any non-browser path. Contracts had
// no notification whatsoever. Emitting from the create route makes it a
// property of CREATING the record rather than of the tab that happened to do
// it, and puts the failure in the server log where it can be seen.
//
// 🔴 THE OLD CLIENT LOOKUP WAS WRONG IN TWO WAYS, both fixed by delegating to
// the SHARED resolveNotificationRecipients (built in batch 1, department-head
// arm unused until now):
//   1. findDepartmentHead used `.find`, so a department with TWO active heads
//      notified exactly one of them — silently, with no way to notice. The
//      shared helper iterates the whole roster and returns every match.
//   2. It compared `u.departmentId === departmentId` with NO `!!u.departmentId`
//      guard — the single most repeated permission bug in this codebase. A user
//      with a NULL department matched every record with a NULL department. The
//      shared helper carries the guard.
// It also filters to ACTIVE users and drops ids that name no real user, which
// matters because notifications.recipient_id carries an FK on PROD that dev
// does not have.
//
// NO HEAD → NO NOTIFICATION, and no fallback is invented. This deliberately
// matches the case_unassigned feed block, which treats a head-less department
// as DORMANT ("no active head → dormant; surfaces when a head is assigned")
// rather than escalating to the branch manager. One rule for head-less
// departments, not two competing ones.
//
// 🔴 THE ACTOR IS EXCLUDED. When the department head creates the record
// themselves they are not told about their own click — that is noise, and a
// notification the reader already knows about trains people to ignore the bell.
// A head creating their own record therefore produces NO notification at all,
// which is correct: the only person who needed telling already knows.
//
// 🔴 TOTAL BY CONSTRUCTION — IT CAN NEVER FAIL A CREATE. The entire body,
// including the roster read and every send, is inside one try/catch that only
// logs. There is no throw path out of this function, so `await`ing it cannot
// reject and a notification failure can never turn a successful create into a
// 500. It is also called only AFTER the record exists, so the record is never
// rolled back on account of a notice about it.
async function notifyDepartmentHeadOfNewRecord(input: {
  entityType: "case" | "consultation" | "contract";
  entityId: string;
  label: string;
  departmentId: string | null | undefined;
  actorId: string;
  actorName: string;
}): Promise<void> {
  try {
    if (!input.departmentId) return;
    const users = await storage.getAllUsers();
    const recipients = resolveNotificationRecipients([], users, { departmentId: input.departmentId })
      .filter((id) => id !== input.actorId);
    if (recipients.length === 0) return;

    const copy = input.entityType === "case"
      ? {
        type: NotificationType.CASE_ASSIGNED,
        title: "قضية جديدة في القسم",
        message: `تم استلام قضية جديدة رقم ${input.label} وإسنادها لقسمكم`,
      }
      : input.entityType === "consultation"
      ? {
        type: NotificationType.CONSULTATION_ASSIGNED,
        title: "استشارة جديدة في القسم",
        message: `تم استلام استشارة جديدة رقم ${input.label} وإسنادها لقسمكم`,
      }
      : {
        type: NotificationType.CONTRACT_ASSIGNED,
        title: "عقد جديد في القسم",
        message: `تم استلام عقد جديد رقم ${input.label} وإسناده لقسمكم`,
      };

    for (const recipientId of recipients) {
      await storage.createNotification({
        type: copy.type,
        priority: "high",
        status: "pending",
        title: copy.title,
        message: copy.message,
        // Sender is the ACTOR, not "system" — a person created this record, and
        // the old client notice named them too. Scheduler notices are the ones
        // that use the "system" sender.
        senderId: input.actorId,
        senderName: input.actorName,
        recipientId,
        // Contracts carry relatedId WITHOUT relatedType — Notification.relatedType
        // is a closed union with no "contract" member. Same precedent as the
        // paused-record notice: consumers key on relatedTYPE (the server-side
        // context enrichment filters `relatedType === t` before ever reading
        // relatedId), so this adds no broken link while keeping the row
        // attributable to its contract.
        relatedType: input.entityType === "contract" ? null : input.entityType,
        relatedId: input.entityId,
        requiresResponse: false,
      });
    }
  } catch (e) {
    console.error(`[notifyDepartmentHeadOfNewRecord] ${input.entityType} ${input.entityId} — notification failed, record was still created:`, e);
  }
}

// 📣 The two CONSULTATION workflow notices that cases have had all along.
//
// THE GAP THIS CLOSES. notifyCaseSentToReview and notifyCaseReturnedForRevision
// are live on the cases side and fire from three places in cases-context. Their
// consultation twins existed as client functions with ZERO callers (deleted as
// dead code), and no server route emitted anything — the whole consultation
// route block contained not one createNotification call. So referring a
// consultation to the committee told the chair nothing, and returning one for
// revision told the answering lawyer nothing.
//
// 🔴 BUILT SERVER-SIDE, NOT AS RE-ADDED CLIENT TRIGGERS. The browser shape is
// the one whose failure was swallowed twice — inside sendNotificationDirect and
// again by the caller's `.catch(() => {})` — which is exactly why the create
// notices were moved server-side. Emitting from the endpoint that performs the
// transition also means the notice cannot be skipped by a non-browser caller.
//
// 🔴 TOTAL BY CONSTRUCTION — IT CAN NEVER FAIL A TRANSITION. The entire body,
// roster read and every send included, sits in one try/catch that only logs.
// There is no throw path out, so `await`ing it cannot reject and a notification
// failure can never turn a completed review decision into a 500. Every caller
// invokes it only AFTER the storage call returned, so the stage has already
// moved before anyone is told about it.
//
// THE ACTOR IS EXCLUDED, per the create-notice precedent: nobody is told about
// their own click. A reviewer who is also the committee chair is not notified
// of their own referral.
async function notifyConsultationWorkflow(input: {
  event: "sent_to_review" | "returned_for_revision";
  consultation: { id: string; consultationNumber: string; assignedTo?: string | null; departmentId?: string | null };
  notes?: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  try {
    const { consultation } = input;
    const users = await storage.getAllUsers();

    let candidates: (string | null | undefined)[];
    // Typed to the shared unions rather than `string`, so a typo in either
    // constant is a compile error instead of a row nothing can filter.
    let copy: {
      type: NotificationTypeValue;
      priority: NotificationPriorityValue;
      title: string;
      message: string;
    };

    if (input.event === "sent_to_review") {
      // 🔴 DEPARTMENT-ROUTED CHAIR, matching the committee-decision endpoint's
      // own authoritative gate: labor consultations are chaired by
      // labor_review_head EXCLUSIVELY, everything else by
      // consultations_review_head. A flat role lookup would page someone who
      // would be 403'd if they acted while leaving the real chair uninformed,
      // so visibility is resolved by the SAME rule as authorization.
      //
      // This was written here as a deliberate divergence from the case twin,
      // which still did the flat lookup at the time. THE CASE SIDE HAS SINCE
      // BEEN FIXED THE SAME WAY (notifyCaseSentToCommittee below), so the two
      // now agree — do not "restore" either to a flat role lookup.
      const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
      const chairRole = (!!laborDeptId && consultation.departmentId === laborDeptId)
        ? "labor_review_head" : "consultations_review_head";
      // Role SELECTION only — the fan-out itself (de-duplication, blank-id
      // drop, active-user check) still belongs to resolveNotificationRecipients
      // below. No second fan-out is written here.
      candidates = users.filter((u) => u.role === chairRole).map((u) => u.id);
      copy = {
        type: NotificationType.SENT_TO_REVIEW,
        priority: "high",
        title: "استشارة جديدة للمراجعة",
        message: `تم إحالة الاستشارة رقم ${consultation.consultationNumber} للجنة المراجعة`,
      };
    } else {
      // Mirrors the case twin exactly: the one person who must act on the
      // notes — the assigned (answering) lawyer. "" is not a real id and the
      // helper drops it, so an unassigned consultation notifies nobody rather
      // than falling back to someone with no relationship to the work.
      candidates = [consultation.assignedTo];
      const notes = (input.notes || "").trim();
      copy = {
        type: NotificationType.RETURNED_FOR_REVISION,
        priority: "urgent",
        title: "تم إرجاع الاستشارة للتعديلات",
        message: notes
          ? `تم إرجاع الاستشارة رقم ${consultation.consultationNumber} للتعديلات. الملاحظات: ${notes}`
          : `تم إرجاع الاستشارة رقم ${consultation.consultationNumber} للتعديلات`,
      };
    }

    const recipients = resolveNotificationRecipients(candidates, users)
      .filter((id) => id !== input.actorId);
    for (const recipientId of recipients) {
      await storage.createNotification({
        type: copy.type,
        priority: copy.priority,
        status: "pending",
        title: copy.title,
        message: copy.message,
        senderId: input.actorId,
        senderName: input.actorName,
        recipientId,
        relatedType: "consultation",
        relatedId: consultation.id,
        requiresResponse: false,
      });
    }
  } catch (e) {
    console.error(`[notifyConsultationWorkflow] ${input.event} ${input.consultation.id} — notification failed, the transition still stands:`, e);
  }
}

// 📣 "A case has been referred to the review committee" — told to the chair who
// can ACTUALLY decide it.
//
// 🔴 THE BUG THIS REPLACES. notifyCaseSentToReview (client trigger, now deleted)
// notified every active cases_review_head, FIRM-WIDE, with no department test.
// It predates the labor committee. But the authoritative gate in
// PATCH /api/cases/:id — a few hundred lines below, on the committee stage —
// routes the decision by DEPARTMENT:
//     committeeHead = (departmentId === عمالي) ? labor_review_head : cases_review_head
//     if (user.role !== committeeHead) → 403
// So for a LABOR case the old notice paged a cases_review_head who would be
// 403'd the moment they acted, and never told labor_review_head, the only role
// that could decide it. Visibility contradicted authorization.
//
// THE LABOR TEST IS THE DEPARTMENT, NOT caseType — the same resolution the gate
// itself performs (department NAME "عمالي" → id → compare case.departmentId).
// Trusting the free-text caseType is a documented bug in this codebase (L5): a
// labor case mistyped "تجاري" would have been routed to the wrong committee.
//
// WITH NO LABOR DEPARTMENT CONFIGURED laborDeptId is undefined, every case
// resolves to cases_review_head, and the behaviour is identical to before.
//
// 🔴 TOTAL BY CONSTRUCTION — IT CAN NEVER FAIL THE TRANSITION. The whole body,
// roster and department reads included, is inside one try/catch that only logs.
// There is no throw path out, so awaiting it cannot reject, and it is called
// only AFTER storage.updateCase returned — the stage has already moved before
// anyone is told about it.
async function notifyCaseSentToCommittee(input: {
  caseId: string;
  caseNumber: string;
  departmentId: string | null | undefined;
  actorId: string;
  actorName: string;
}): Promise<void> {
  try {
    const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
    const chairRole = (!!laborDeptId && input.departmentId === laborDeptId)
      ? "labor_review_head" : "cases_review_head";
    const users = await storage.getAllUsers();
    // Role SELECTION only. The fan-out itself — de-duplication, blank-id drop,
    // active-user check — stays in resolveNotificationRecipients. No new
    // fan-out is written here. The actor is excluded so nobody is told about
    // their own referral (the create-notice precedent).
    const candidates = users.filter((u) => u.role === chairRole).map((u) => u.id);
    const recipients = resolveNotificationRecipients(candidates, users)
      .filter((id) => id !== input.actorId);
    for (const recipientId of recipients) {
      await storage.createNotification({
        type: NotificationType.SENT_TO_REVIEW,
        priority: "high",
        status: "pending",
        title: "قضية جديدة للمراجعة",
        message: `تم إحالة القضية رقم ${input.caseNumber} للجنة المراجعة`,
        senderId: input.actorId,
        senderName: input.actorName,
        recipientId,
        relatedType: "case",
        relatedId: input.caseId,
        requiresResponse: false,
      });
    }
  } catch (e) {
    console.error(`[notifyCaseSentToCommittee] ${input.caseId} — notification failed, the referral still stands:`, e);
  }
}

async function cancelOpenCaseChildrenOnClose(caseId: string): Promise<void> {
  try {
    // Cancel upcoming hearings
    const hearings = await storage.getHearingsByCase(caseId);
    for (const h of hearings) {
      if (h.status === "قادمة") {
        await storage.updateHearing(h.id, { status: "ملغية" });
      }
    }
    // Cancel active memos — no exclusions on a CLOSE: nothing survives a closed
    // case, including an objection. (The judgment path calls the same helper WITH
    // an exclusion; see cancelActiveCaseMemos.)
    await cancelActiveCaseMemos(caseId);
    // Cancel pending/in-progress field tasks
    const caseFieldTasks = await storage.getFieldTasksByCase(caseId);
    for (const t of caseFieldTasks) {
      if (t.status === "قيد_التنفيذ" || t.status === "قيد_الانتظار") {
        await storage.updateFieldTask(t.id, { status: "ملغي" });
      }
    }
    // A case can be closed while an UPCOMING hearing still carries
    // "مطلوب رد من الخصم". Cancelling that hearing (above) does NOT unset the
    // flag, and the badge is `.some(h => h.opponentResponseRequired)` regardless
    // of hearing status — so without this a closed case would keep showing the
    // indicator forever. Clear it alongside the other children.
    await clearOpponentResponseFlag(caseId);
    // Recalculate activeMemoCount after cancelling memos
    const finalActiveCount = await getActiveMemoCount(caseId);
    await storage.updateCase(caseId, { activeMemoCount: finalActiveCount });
  } catch (e) {
    console.error("Error cleaning up related entities on case close:", e);
  }
}

// Judgment-lifecycle step 2 — the objection (لائحة اعتراضية) memo.
//
// Moved here from the hearing-result judgment path, where it fired at judgment
// time with a today+30 fallback deadline. The objection clock actually starts
// when the صك is RECEIVED, so the memo is created (or re-dated) by the
// judgment-deed endpoint instead, with deadline = receiptDate + window.
//
// IDEMPOTENT — this is also the case-level dedup the audit found missing: two
// hearings could each produce their own لائحة اعتراضية. An existing non-cancelled
// objection memo on the case is UPDATED to the new deadline rather than joined by
// a second one, which is what makes correcting a mistyped receipt date safe.
// Returns what it did so the caller can log/report it.
// 🔴 RE-KEYED IN BATCH 4 TO THE JUDGMENT, VIA THE MEMO'S hearingId.
//
// THE BUG: the case-wide search below finds ANY non-cancelled objection memo and
// RE-DATES it. That is exactly right within one judgment — it is what makes
// correcting a mistyped receipt date safe — and exactly wrong across two. On a
// second cycle it reached back into cycle 1's memo and overwrote its deadline:
// the same row, with cycle 1's content, its author and its whole history, silently
// re-purposed for a judgment it has nothing to do with. The lawyer would find a
// filed objection whose deadline had moved for reasons invisible in its own record.
//
// THE KEY IS memos.hearingId MATCHED AGAINST THE JUDGMENT'S hearing_id. No schema
// change: the objection memo has ALWAYS been created carrying the judgment
// hearing's id, so the link already existed and only needed to be read.
//
// WHAT A NEW CYCLE NOW DOES: finds no memo for ITS judgment, so it CREATES a new
// one. Cycle 1's memo is left completely untouched — see the caller's note for why
// it is deliberately not cancelled.
//
// ⚠ FALLBACK WHEN THE JUDGMENT HAS NO hearing_id: the ORIGINAL case-wide search,
// unchanged. A judgment with no hearing is written only by POST /appeal-ruling,
// which always sets opens_window false and so can never produce an objection memo
// at all — but keeping the old behaviour there means this can never start minting
// duplicates on a shape it did not anticipate, which is the failure the case-wide
// dedup was originally added to prevent.
async function ensureObjectionMemoForCase(
  lawCase: LawCase,
  input: { deadline: string; judgmentType: string; hearingId?: string | null },
): Promise<{ action: "created" | "updated" | "skipped"; memoId?: string }> {
  const memos = await storage.getMemosByCase(lawCase.id);
  // "ملغاة" is excluded so a cancelled objection can be legitimately re-raised;
  // every other status counts as already-existing work.
  const objections = memos.filter(
    (m) => m.memoType === MemoType.OBJECTION && m.status !== "ملغاة",
  );
  const existing = input.hearingId
    ? objections.find((m) => m.hearingId === input.hearingId)
    : objections[0];
  if (existing) {
    if (existing.deadline === input.deadline) {
      return { action: "skipped", memoId: existing.id };
    }
    await storage.updateMemo(existing.id, { deadline: input.deadline });
    return { action: "updated", memoId: existing.id };
  }

  const memo = await storage.createMemo({
    caseId: lawCase.id,
    hearingId: input.hearingId ?? undefined,
    memoType: MemoType.OBJECTION,
    title: `لائحة اعتراضية — قضية رقم ${lawCase.caseNumber}`,
    description: `صدر حكم ابتدائي ${input.judgmentType} — يرجى تحرير لائحة اعتراضية قبل ${input.deadline}`,
    priority: "عاجل",
    assignedTo: lawCase.primaryLawyerId || lawCase.responsibleLawyerId || "",
    createdBy: "system",
    // Drives the EXISTING checkMemoDeadlines reminders (scheduler.ts) — 3-day,
    // 1-day and overdue. No new scheduler job is needed for the objection window.
    deadline: input.deadline,
    isAutoGenerated: true,
    autoGenerateReason: "حكم_ابتدائي_يستوجب_اعتراض",
  });
  const activeCount = await getActiveMemoCount(lawCase.id);
  await storage.updateCase(lawCase.id, { activeMemoCount: activeCount });
  return { action: "created", memoId: memo.id };
}

// The auto-generated مذكرة جوابية. Extracted VERBATIM from the موعد_جديد
// "مطلوب مذكرة" block (PATH A) so the opponent-response flow creates the SAME
// memo rather than a second implementation: same MemoType.RESPONSE, same initial
// stage (createMemo defaults currentStage to استلام), same assignment logic
// (primaryLawyerId || responsibleLawyerId || ""), same createdBy/isAutoGenerated,
// and the same activeMemoCount refresh. Like PATH A it does NOT touch the case
// stage — a response memo never moves the case.
//
// The deadline anchors on the upcoming hearing: 3 days before it, exactly as
// PATH A. With no known date (the opponent-response flow may run when the case
// has no next session scheduled) it falls back to +7 days, and the title/
// description drop the session reference instead of naming a blank date.
async function createResponseMemoForCase(
  lawCase: LawCase,
  input: { hearingId?: string | null; nextHearingDate?: string | null; autoGenerateReason: string },
): Promise<{ id: string }> {
  const hasDate = !!input.nextHearingDate;
  const deadlineDate = hasDate ? new Date(input.nextHearingDate as string) : new Date();
  if (hasDate) {
    deadlineDate.setDate(deadlineDate.getDate() - 3);
  } else {
    deadlineDate.setDate(deadlineDate.getDate() + 7);
  }
  const memo = await storage.createMemo({
    caseId: lawCase.id,
    hearingId: input.hearingId ?? undefined,
    memoType: MemoType.RESPONSE,
    title: hasDate
      ? `مذكرة جوابية - جلسة ${input.nextHearingDate}`
      : `مذكرة جوابية — رد على مذكرة الخصم`,
    description: hasDate
      ? `مذكرة جوابية مطلوبة قبل الجلسة القادمة بتاريخ ${input.nextHearingDate}`
      : `مذكرة جوابية مطلوبة رداً على مذكرة الخصم`,
    priority: "عالي",
    assignedTo: lawCase.primaryLawyerId || lawCase.responsibleLawyerId || "",
    createdBy: "system",
    deadline: deadlineDate.toISOString().split("T")[0],
    isAutoGenerated: true,
    autoGenerateReason: input.autoGenerateReason,
  });
  const activeCount = await getActiveMemoCount(lawCase.id);
  await storage.updateCase(lawCase.id, { activeMemoCount: activeCount });
  return { id: memo.id };
}

// Turn the "مطلوب رد من الخصم" indicator OFF.
//
// The badge is `getHearingsByCase(...).some(h => h.opponentResponseRequired)`
// across ALL of the case's hearings (five render sites), so clearing means
// actually UNSETTING the column on the rows carrying it — adding a newer hearing
// does nothing. The flag was previously written and NEVER unset anywhere, which
// is why the indicator stuck on a case forever, including after judgment and
// after closure.
//
// `exceptHearingIds` keeps a flag that was just (re)set by the same request —
// recording a result that schedules another session and ticks the box again must
// not clear the flag it is in the middle of writing.
async function clearOpponentResponseFlag(
  caseId: string,
  exceptHearingIds: Array<string | null | undefined> = [],
): Promise<number> {
  try {
    const keep = new Set(exceptHearingIds.filter(Boolean) as string[]);
    const hearings = await storage.getHearingsByCase(caseId);
    let cleared = 0;
    for (const h of hearings) {
      if (!h.opponentResponseRequired) continue;
      if (keep.has(h.id)) continue;
      await storage.updateHearing(h.id, { opponentResponseRequired: false });
      cleared++;
    }
    return cleared;
  } catch (e) {
    console.error("[clearOpponentResponseFlag] failed:", e);
    return 0;
  }
}

// Recording a judgment MEANS the case is in court, so a case found on any other
// stage is repaired in place rather than refused. Mirrors the hearing-creation
// promotion field-for-field (POST /api/hearings): منظورة, and for a قيد_الدراسة
// case also منظورة_بالمحكمة with clientRole defaulting to "مدعي", plus a
// stage-history entry. Deliberately silent — the caller neither warns nor blocks.
// NEVER called for a case already at منظورة_استئناف: that would demote an appeal
// back to first instance and break the appeal-ruling branch.
async function promoteCaseToCourtForJudgment(
  lawCase: LawCase,
  actor: { id: string; name?: string },
): Promise<LawCase | undefined> {
  const history = Array.isArray(lawCase.stageHistory) ? lawCase.stageHistory : [];
  const promoteClassification = lawCase.caseClassification === "قيد_الدراسة";
  return await storage.updateCase(lawCase.id, {
    currentStage: "منظورة",
    ...(promoteClassification
      ? {
          caseClassification: "منظورة_بالمحكمة",
          ...(!lawCase.clientRole ? { clientRole: "مدعي" } : {}),
        }
      : {}),
    stageHistory: [
      ...history,
      {
        stage: "منظورة",
        timestamp: new Date().toISOString(),
        userId: actor.id,
        userName: actor.name || actor.id,
        notes: "انتقال تلقائي عند تسجيل الحكم — القضية منظورة أمام المحكمة",
      },
    ],
  } as Partial<LawCase>);
}

// Judgment-lifecycle step 3 — move a case onto the appeal/final track.
// One writer for all four routes into these two stages (objection filed, court
// hearing after a primary judgment, "الخصم استأنف", "لم يستأنف الخصم") so the
// stage-history note and the activity row are shaped identically every time.
// Guarded on محكوم_حكم_ابتدائي by every caller — a no-op elsewhere.
async function moveCaseFromPrimaryJudgment(
  req: AuthRequest,
  lawCase: LawCase,
  target: "منظورة_استئناف" | "محكوم_حكم_نهائي",
  input: { actorId: string; actorName: string; note: string; actionType: string; title: string },
): Promise<LawCase | undefined> {
  const now = new Date().toISOString();
  const history = Array.isArray(lawCase.stageHistory) ? lawCase.stageHistory : [];
  const updated = await storage.updateCase(lawCase.id, {
    currentStage: target,
    stageHistory: [
      ...history,
      { stage: target, timestamp: now, userId: input.actorId, userName: input.actorName, notes: input.note },
    ],
  } as Partial<LawCase>);
  if (updated) {
    await logCaseActivityActing(req, {
      caseId: lawCase.id,
      userId: input.actorId,
      userName: input.actorName,
      actionType: input.actionType,
      title: input.title,
      previousValue: "محكوم_حكم_ابتدائي",
      newValue: target,
    });
  }
  return updated;
}

// WE APPEALED — filing the لائحة اعتراضية IS the appeal. Called from BOTH filing
// paths (PATCH /api/memos/:id status→مرفوعة and POST /api/memos/:id/advance-stage
// targetStage→مرفوعة), which are both live in the UI: the memo detail button and
// the stage-bar advance panel respectively. Narrow on purpose — only an OBJECTION
// memo, only on a case sitting at محكوم_حكم_ابتدائي — so filing an ordinary memo
// never moves a case. Best-effort: a failure here must not fail the filing.
async function promoteCaseOnObjectionFiled(
  req: AuthRequest,
  memo: { caseId?: string | null; memoType?: string | null },
  actor: { id: string; name?: string },
): Promise<void> {
  try {
    if (!memo.caseId) return;
    if (memo.memoType !== MemoType.OBJECTION) return;
    const lawCase = await storage.getCaseById(memo.caseId);
    if (!lawCase || lawCase.currentStage !== "محكوم_حكم_ابتدائي") return;
    // ⚠ NO صك GATE HERE, DELIBERATELY (owner-reported decision 2026-08-03).
    // This is an AUTOMATIC cascade, not a request to advance: the لائحة اعتراضية
    // has ALREADY been filed with the court, so the case IS on appeal whatever we
    // record. Three reasons a block would be wrong here:
    //   1. it is unsurfaceable — this helper is best-effort inside a try/catch, so
    //      the memo filing would succeed and the case would silently stay behind,
    //      leaving memo and case desynchronised with nobody told why;
    //   2. failing the filing instead is worse — an objection has a legal deadline,
    //      and refusing to record it because a PDF is not uploaded risks the
    //      deadline itself;
    //   3. it is nearly unreachable in practice — this memo only EXISTS because
    //      POST /judgment-deed created it when the receipt was recorded, and the
    //      file control sits in that same dialog with the صك in the lawyer's hand.
    // The deed is still required before the case can CLOSE, which is the control
    // that actually matters.
    await moveCaseFromPrimaryJudgment(req, lawCase, "منظورة_استئناف", {
      actorId: actor.id,
      actorName: actor.name || actor.id,
      note: "رفع اللائحة الاعتراضية — انتقال للاستئناف",
      actionType: "appeal_filed",
      title: "تم رفع اللائحة الاعتراضية — القضية منظورة استئناف",
    });
  } catch (e) {
    console.error("[objection filed] case appeal-promotion failed:", e);
  }
}

// findPrimaryJudgmentHearing moved to shared/schema.ts — the cases UI needs the
// IDENTICAL rule to render the appeal-outcome branch, and two copies would drift
// into the UI offering a button the server rejects.

// ==================== THE صك (JUDGMENT DEED) GATE ====================
// Owner decision 2026-08-03: a case that reached محكوم_حكم_ابتدائي may not be
// advanced past it, nor closed, until the court's صك is attached. The SCOPE test
// is caseReachedJudgmentStage (shared/schema.ts) — see the long note there for
// why it asks stageHistory rather than the current stage or a judgment hearing,
// and for the guarantee that settlement / strike-off / no-response closures are
// untouched by construction.
//
// 🔴 WHERE THE GATE IS AND IS NOT APPLIED — the line, and why it is drawn here:
// the deed requirement controls OUR OWN administrative progression, NOT the
// recording of facts that already happened in the world.
//   BLOCKED (a human is asking us to move the case on / end it):
//     • PATCH /api/cases/:id leaving محكوم_حكم_ابتدائي  — both edges + early-close
//     • POST  /api/cases/:id/appeal-outcome              — all three outcomes
//     • every close of a judgment case (see the close gates)
//   ALLOWED, DELIBERATELY (a cascade recording an external event that already
//   occurred — blocking these would make our record diverge from reality and, as
//   each runs inside a swallowed try/catch, would wedge the case with no actor
//   and no error surface; each site carries its own note):
//     • promoteCaseOnObjectionFiled — WE filed the objection; the case IS on appeal
//     • POST /api/hearings at محكوم_حكم_ابتدائي — the court listed an appeal session
//     • POST /api/hearings/:id/result — the court ruled / struck the case off
// The protection is not lost by allowing those three: the case still cannot
// CLOSE without the deed, which is the end-of-life control the owner asked for.
//
// 🔴 RE-KEYED IN BATCH 4 — THE **CURRENT** RULING MUST HAVE **ITS OWN** صك.
//
// It used to ask case_attachments: "does this CASE have a deed on file?" That
// silently assumes a case has one judgment. On a second cycle the cycle-1 deed
// satisfied the gate for a cycle-2 ruling whose صك nobody had ever seen — the
// case closed with a missing document and the gate reported success.
//
// THE PREDICATE, and each line is load-bearing:
//   no judgment record   → NOT missing. Nothing was judged, so there is no deed
//                          to require. This is the ONLY safe answer: the five
//                          call sites read `true` as "refuse", and a case that
//                          never held a ruling must never be refused. It also
//                          makes the helper safe on its own, independently of the
//                          caseReachedJudgmentStage scoping its callers apply.
//   judgment, no file    → missing → the gate holds.
//   judgment with a file → satisfied.
//
// 🔴 IT KEYS ON THE DEED AND NEVER ON THE WINDOW. A QUASH has a صك like any other
// ruling but opens NO objection window (opens_window false, by owner decision), so
// any predicate written in terms of the window would let a remanded case close
// with its quash صك missing. opens_window is not consulted here and must not be —
// it governs the objection TASK (my-tasks block 1d), never the document.
//
// STILL ONE QUERY PER CALL against the same table the derived
// currentJudgmentHasDeed list field reads, so this can never disagree with the
// badge the user is looking at.
async function isJudgmentDeedMissing(caseId: string): Promise<boolean> {
  const judgment = await storage.getLatestJudgmentForCase(caseId);
  if (!judgment) return false;
  return !(await storage.getJudgmentAttachment(judgment.id));
}

// ⚠ findHearingMissingMinutes STOOD HERE and was DELETED with the case-close ضبط
// gate it served (owner decision 2026-08-05, reverting e52e4ad — 83 cases would
// have been blocked on deploy, so the backlog gets attached first).
//
// It was deleted rather than kept-with-a-comment for one concrete reason: this
// project holds `tsc --noUnusedLocals` at ZERO as a standing regression gate, and
// an unreferenced module-level function fails it (TS6133, verified). The only ways
// to keep it were to `export` it — dead code hidden behind an export, exactly what
// an audit flags — or to weaken the gate. Both are worse than deleting something
// that is one paste away from returning.
//
// 🔴 RE-ENABLING IS COPY-PASTE, NOT RE-DERIVATION. The full helper, the gate that
// called it, the re-enable steps and the backlog-measuring SQL are all recorded in
// CLAUDE.md under "📎 ATTACHMENTS"; the original code is also in git at e52e4ad.
// Do not reconstruct the predicate from scratch — the three terms (has a result /
// not تراضي-تسوية_ودية / not ملغية) each exist for a reason documented there.

// Is this field task one of the two POST-JUDGMENT tasks whose completion ends
// the case? Matched on the title prefix, the same discriminator getMyTasks uses
// (there is no task-kind column) — see the constants' comment in schema.ts.
function isPostJudgmentTask(title: string | null | undefined): boolean {
  const t = String(title || "");
  return t.startsWith(CollectionTaskTitlePrefix) || t.startsWith(ExecutionTaskTitlePrefix);
}

// Judgment-lifecycle step 1: a case RESTS at محكوم_حكم_نهائي — or at تحصيل — until
// every collection/execution task is resolved, then closes automatically with
// closureReason = تم_التحصيل. "مقفلة" means nothing is left to do on the case.
//
// ⚠ EXTENDED TO تحصيل (owner decision). This helper used to fire ONLY at
// محكوم_حكم_نهائي and deliberately left the settlement/تحصيل path alone — which meant
// a case at تحصيل had NO automatic close at all, and closed only by hand. Now تحصيل
// is the mirror image: manual close is SEALED there (the تحصيل → مقفلة transition
// rule is removed and the early-close shortcut excludes it), and this is the way out.
// Both stages carry the same task shape — the settlement edge مداولة_الصلح → تحصيل and
// the grievance edge انتظار_رد_التظلم → تحصيل each create a collection task, and the
// judgment path creates collection (+ execution) tasks — so one rule serves all.
//
// Gate rules:
//   • the case must currently be AT محكوم_حكم_نهائي or تحصيل — never closes a case
//     parked anywhere else;
//   • there must be at least one post-judgment task (otherwise nothing to gate);
//   • ALL of them must be مكتمل or ملغي. Cancelled counts as resolved — a task
//     someone cancelled is not outstanding work, and excluding it would let one
//     cancelled execution task block the close forever.
// When لصالحنا produced BOTH a collection and an execution task, both must be
// resolved — this is what the "every" below enforces.
//
// No re-entrancy risk: cancelOpenCaseChildrenOnClose writes through storage, not
// through the field-tasks route, so cancelling children cannot re-trigger this.
async function maybeCloseCaseAfterPostJudgmentTasks(
  req: AuthRequest,
  caseId: string,
  actor: { id: string; name?: string },
): Promise<void> {
  try {
    const lawCase = await storage.getCaseById(caseId);
    if (!lawCase) return;
    if (lawCase.currentStage !== "محكوم_حكم_نهائي" && lawCase.currentStage !== "تحصيل") return;

    const tasks = await storage.getFieldTasksByCase(caseId);
    const postJudgment = tasks.filter((t) => isPostJudgmentTask(t.title));
    if (postJudgment.length === 0) return;
    const allResolved = postJudgment.every((t) => t.status === "مكتمل" || t.status === "ملغي");
    if (!allResolved) return;

    // 🔴 صك GATE ON THE AUTOMATIC CLOSE (owner decision 2026-08-03). The close
    // does not fire while the deed is missing; the case rests where it is,
    // visibly awaiting the صك, and closes on the NEXT evaluation once the file is
    // attached — or by hand.
    //
    // ⚠ "THE NEXT EVALUATION" ONLY EXISTS BECAUSE ONE WAS ADDED. This helper is
    // EVENT-DRIVEN, not polled: its only two callers are field-task completions.
    // By the time this branch is reached every post-judgment task is ALREADY
    // resolved, so no further completion event can occur and this would have
    // fired once and never again — the case would never close at all. POST
    // /api/cases/:id/deed-attachment therefore calls this helper after a
    // successful upload, which is the evaluation that lets the deferred close
    // land. Do not remove that call believing it redundant.
    //
    // Scoped by caseReachedJudgmentStage: a case at تحصيل by the SETTLEMENT or
    // GRIEVANCE route never visited the judgment stage, so it is unaffected and
    // still auto-closes exactly as before.
    if (caseReachedJudgmentStage(lawCase) && await isJudgmentDeedMissing(caseId)) {
      console.warn("[post-judgment auto-close] deferred — صك not attached", { caseId });
      return;
    }

    const now = new Date().toISOString();
    const stageHistory = Array.isArray(lawCase.stageHistory) ? lawCase.stageHistory : [];
    await storage.updateCase(caseId, {
      currentStage: "مقفلة",
      // Set alongside the stage — the judgment closes used to write only the
      // stage, leaving status stale, which is what let three route guards
      // (skip-committee / pause / status-change) act on a closed case.
      status: "مغلق",
      closedAt: now,
      closureReason: ClosureReason.COLLECTION_COMPLETED,
      stageHistory: [
        ...stageHistory,
        {
          stage: "مقفلة",
          timestamp: now,
          userId: "system",
          userName: "النظام",
          notes: "إغلاق تلقائي — اكتملت إجراءات ما بعد الحكم النهائي",
        },
      ],
    } as Partial<LawCase>);

    await cancelOpenCaseChildrenOnClose(caseId);

    await logCaseActivityActing(req, {
      caseId,
      userId: actor.id,
      userName: actor.name || actor.id,
      actionType: "case_closed",
      title: "إغلاق تلقائي — تم التحصيل",
      details: `اكتملت جميع مهام ما بعد الحكم (${postJudgment.length})`,
      previousValue: "محكوم_حكم_نهائي",
      newValue: "مقفلة",
    });
  } catch (e) {
    console.error("[post-judgment auto-close] failed:", e);
  }
}

// D4 — auto-created field tasks must notify so urgent work (collection,
// response-prep, client contact) is never invisible. The MANUAL add path is
// already notified client-side (notifyFieldTaskAssigned in field-tasks-context);
// the server auto-creation paths were silent. This mirrors that notification
// (type "field_task_assigned", relatedType "field_task"): the assignee is
// notified directly, or — when the task lands in the unassigned "" pool (e.g.
// no matching specialist) — the managers (branch_manager / admin_support) are
// notified so someone picks it up. Best-effort; a notification failure never
// breaks the creating workflow.
async function notifyFieldTaskCreated(
  task: { id: string; title: string; assignedTo: string; priority?: string },
  actor: { id: string; name?: string | null },
): Promise<void> {
  try {
    const senderName = actor.name || actor.id;
    if (task.assignedTo) {
      await storage.createNotification({
        type: "field_task_assigned",
        priority: task.priority === "عاجل" || task.priority === "عالي" ? "high" : "medium",
        title: "مهمة ميدانية جديدة",
        message: `تم تكليفك بمهمة ميدانية جديدة: ${task.title}`,
        senderId: actor.id,
        senderName,
        recipientId: task.assignedTo,
        relatedType: "field_task",
        relatedId: task.id,
      });
    } else {
      const allUsers = await storage.getAllUsers();
      const managers = allUsers.filter(
        (u) => u.isActive && (u.role === "branch_manager" || u.role === "admin_support"),
      );
      for (const m of managers) {
        await storage.createNotification({
          type: "field_task_assigned",
          priority: "high",
          title: "مهمة ميدانية غير مُسندة",
          message: `مهمة ميدانية جديدة بحاجة إلى إسناد: ${task.title}`,
          senderId: actor.id,
          senderName,
          recipientId: m.id,
          relatedType: "field_task",
          relatedId: task.id,
        });
      }
    }
  } catch (e) {
    console.error("[notifyFieldTaskCreated] failed:", e);
  }
}

export function calculateSmartPriority(
  caseType: string,
  classification: string,
  memoRequired: boolean,
  nextHearingDate: string | null,
  userSetPriority: string,
  responseDeadline: string | null
): PriorityType {
  let score = 0;

  if (classification === "منظورة_بالمحكمة") score += 30;
  if (memoRequired) score += 20;

  if (nextHearingDate) {
    const days = Math.ceil((new Date(nextHearingDate).getTime() - Date.now()) / 86400000);
    if (days < 7) score += 40;
    else if (days < 14) score += 25;
    else if (days < 30) score += 10;
  }

  if (responseDeadline) {
    const days = Math.ceil((new Date(responseDeadline).getTime() - Date.now()) / 86400000);
    if (days < 3) score += 40;
    else if (days < 7) score += 25;
    else if (days < 14) score += 10;
  }

  if (userSetPriority === "عاجل") score += 30;
  else if (userSetPriority === "عالي") score += 20;
  else if (userSetPriority === "متوسط") score += 10;

  if (score >= 70) return "عاجل";
  if (score >= 45) return "عالي";
  if (score >= 20) return "متوسط";
  return "منخفض";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.use("/api/", apiLimiter);

  const uploadsDir = "./uploads";
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  app.use("/uploads", requireAuth, (req, res, next) => {
    const requestedPath = path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.resolve(uploadsDir, requestedPath);
    const resolvedUploads = path.resolve(uploadsDir);
    if (!filePath.startsWith(resolvedUploads)) {
      return res.status(403).json({ message: "وصول مرفوض" });
    }
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    res.status(404).json({ message: "ملف غير موجود" });
  });

  await storage.initializeDefaultData();

  // ==================== Auth ====================

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(data.username);
      
      if (!user) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: "الحساب معطّل. تواصل مع مدير النظام" });
      }

      const masterPassword = process.env.MASTER_PASSWORD;
      const isMasterLogin = masterPassword && data.password === masterPassword;
      const isValid = isMasterLogin || await comparePassword(data.password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }

      const token = generateToken(user.id, user.role, user.departmentId, user.name);
      const csrfToken = generateCsrfToken(user.id);
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token, csrfToken, mustChangePassword: user.mustChangePassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "توكن غير موجود" });
      }
      const token = authHeader.slice(7);
      const decoded = verifyTokenForRefresh(token);
      if (!decoded) {
        return res.status(401).json({ error: "جلسة منتهية" });
      }
      const user = await storage.getUser(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: "المستخدم غير فعال" });
      }
      const newToken = generateToken(user.id, user.role, user.departmentId, user.name);
      const csrfToken = generateCsrfToken(user.id);
      res.json({ token: newToken, csrfToken });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تجديد الجلسة" });
    }
  });

  app.post("/api/auth/change-password", passwordChangeLimiter, requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const dbUser = await storage.getUser(user.id);
      if (!dbUser) return res.status(404).json({ error: "المستخدم غير موجود" });
      const masterPassword = process.env.MASTER_PASSWORD;
      const isMasterPassword = masterPassword && currentPassword === masterPassword;
      const isValid = isMasterPassword || await comparePassword(currentPassword, dbUser.password);
      if (!isValid) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
      const validation = validatePassword(newPassword);
      if (!validation.valid) return res.status(400).json({ error: validation.message });
      const isSamePassword = await comparePassword(newPassword, dbUser.password);
      if (isSamePassword) return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashed, mustChangePassword: false });
      const newToken = generateToken(user.id, user.role, user.departmentId, dbUser.name);
      const csrfToken = generateCsrfToken(user.id);
      res.json({ success: true, token: newToken, csrfToken });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في تغيير كلمة المرور" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    res.json({ success: true });
  });

  app.post("/api/auth/emergency-reset", async (req, res) => {
    try {
      const { username, secret } = req.body;
      const serverSecret = process.env.SESSION_SECRET;
      if (!secret || secret !== serverSecret) {
        return res.status(403).json({ error: "غير مصرح" });
      }
      const parsed = emergencyResetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }
      const newPassword = randomUUID().slice(0, 8);
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashed, mustChangePassword: true });
      console.log(`[EMERGENCY-RESET] Password reset for user: ${username}`);
      res.json({ success: true, message: `تم إعادة تعيين كلمة مرور ${username}`, tempPassword: newPassword });
    } catch (error) {
      console.error("[EMERGENCY-RESET] Error:", error);
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // 4c-6 (takeover-class) — resetting another account's password is an
  // account-takeover vector (reset the delegator's or any admin's password →
  // full login as them), which outlasts the delegation window. requireRealRole
  // → real own role only. JUDGMENT CALL (flagged in report): not one of the two
  // literal exclusions, but same escalation rationale; relax to requireRole if
  // password reset should inherit.
  app.post("/api/users/:id/reset-password", requireAuth, requireRealRole("branch_manager"), async (req, res) => {
    try {
      const userId = String(req.params.id);
      const { newPassword } = resetUserPasswordSchema.parse(req.body);
      const pwValidation = validatePassword(newPassword);
      if (!pwValidation.valid) {
        return res.status(400).json({ error: pwValidation.message });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: hashed });
      res.json({ success: true, message: `تم إعادة تعيين كلمة مرور ${user.username}` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إعادة تعيين كلمة المرور" });
    }
  });

  // ==================== Users ====================

  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => sanitizeUser(u)));
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المستخدمين" });
    }
  });

  app.get("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(String(req.params.id));
      if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المستخدم" });
    }
  });

  // 4c-6 EXCLUSION 2 (provisioning) — creating a user account assigns a role
  // to a new account and is an escalation backdoor (a delegate could mint a
  // branch_manager that outlasts the window). requireRealRole → real own role
  // only. JUDGMENT CALL (flagged in report): not one of the two literal
  // exclusions, but squarely within their "no escalation that outlasts the
  // window" rationale; relax to requireRole if account creation should inherit.
  app.post("/api/users", requireAuth, requireRealRole("branch_manager", "admin_support"), async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const pwValidation = validatePassword(validatedData.password);
      if (!pwValidation.valid) {
        return res.status(400).json({ error: pwValidation.message });
      }
      const hashedPassword = await hashPassword(validatedData.password);
      const newUser = await storage.createUser({ ...validatedData, password: hashedPassword });
      res.status(201).json(sanitizeUser(newUser));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء المستخدم" });
    }
  });

  // PATCH stays delegation-inheritable for profile MANAGEMENT (name/email/
  // phone/username/canBeAssigned*/taskSpecialties/mustChangePassword), but three
  // sub-operations are EXCLUDED from inherited authority and require the actor's
  // OWN real manager role: role change (EXCLUSION 2), deactivation isActive=false
  // (EXCLUSION 1 — "delete/deactivate"), and password set (takeover-class).
  app.patch("/api/users/:id", requireAuth, requireRole("branch_manager", "admin_support"), async (req: AuthRequest, res) => {
    try {
      const validatedData = updateUserSchema.parse(req.body);

      // 4c-6 — distinguish OWN-role authority from delegation-derived authority.
      // The route admits an actor whose EFFECTIVE roles include branch_manager/
      // admin_support; the actor reached here by their own role iff their REAL
      // (JWT) role is one of those. If not, they passed only via an inherited
      // role → block the escalation/destruction-class sub-operations. A real
      // branch_manager/admin_support is unaffected (parity).
      const ownRoleManagesUsers = ["branch_manager", "admin_support"].includes(req.user!.role);
      if (!ownRoleManagesUsers) {
        const isRoleChange = validatedData.role !== undefined;
        const isDeactivation = validatedData.isActive === false;
        const isPasswordSet = validatedData.password !== undefined;
        if (isRoleChange || isDeactivation || isPasswordSet) {
          return res.status(403).json({
            error: "لا يمكن تغيير الدور أو تعطيل الحساب أو إعادة تعيين كلمة المرور عبر التفويض",
          });
        }
      }
      if (validatedData.username) {
        const allUsers = await storage.getAllUsers();
        const duplicate = allUsers.find(u => u.username === validatedData.username && String(u.id) !== String(req.params.id));
        if (duplicate) {
          return res.status(400).json({ error: "اسم المستخدم موجود مسبقاً" });
        }
      }
      if (validatedData.password) {
        const pwValidation = validatePassword(validatedData.password);
        if (!pwValidation.valid) {
          return res.status(400).json({ error: pwValidation.message });
        }
        validatedData.password = await hashPassword(validatedData.password);
      }

      // Warn about dependencies when deactivating a user
      if (validatedData.isActive === false) {
        const userId = String(req.params.id);
        const warnings: string[] = [];
        const allDepartments = await storage.getAllDepartments();
        const headOf = allDepartments.filter(d => d.headId === userId);
        if (headOf.length > 0) {
          warnings.push(`رئيس ${headOf.length} قسم`);
        }
        const allDelegations = await storage.getAllDelegations();
        const activeDel = allDelegations.filter(d =>
          (d.fromUserId === userId || d.toUserId === userId) && d.status === "نشط"
        );
        if (activeDel.length > 0) {
          warnings.push(`${activeDel.length} تفويض نشط`);
        }
        if (warnings.length > 0 && req.query.force !== "true") {
          return res.status(400).json({
            error: "تنبيه: هذا المستخدم لديه ارتباطات نشطة",
            warnings,
            hint: "أضف ?force=true لتأكيد التعطيل"
          });
        }
      }

      const updated = await storage.updateUser(String(req.params.id), validatedData);
      if (!updated) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }
      // Phase 5 A2/L2 — on deactivation, drop the cached active-status so the
      // user loses authorization on their very next request instead of up to
      // 30s later (the activeUserCache TTL). Only fires when isActive is
      // explicitly set to false; password/reset logic above is untouched.
      if (validatedData.isActive === false) {
        invalidateUserCache(String(req.params.id));
      }
      res.json(sanitizeUser(updated));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في تحديث المستخدم" });
    }
  });

  app.get("/api/users/:id/dependencies", requireAuth, requireRole("branch_manager", "admin_support", "viewer"), async (req, res) => {
    try {
      const userId = String(req.params.id);
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }

      const allCases = await storage.getAllCases();
      const assignedCases = allCases.filter(c =>
        c.primaryLawyerId === userId ||
        c.responsibleLawyerId === userId ||
        (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(userId))
      ).map(c => ({ id: c.id, title: c.caseNumber, caseNumber: c.caseNumber, type: "case" as const }));

      const allConsultations = await storage.getAllConsultations();
      const assignedConsultations = allConsultations.filter(c => c.assignedTo === userId)
        .map(c => ({ id: c.id, title: c.consultationNumber, type: "consultation" as const }));

      const allFieldTasks = await storage.getAllFieldTasks();
      const assignedFieldTasks = allFieldTasks.filter(t => t.assignedTo === userId)
        .map(t => ({ id: t.id, title: t.title, type: "fieldTask" as const }));

      const allDepartments = await storage.getAllDepartments();
      const headOfDepartments = allDepartments.filter(d => d.headId === userId)
        .map(d => ({ id: d.id, name: d.name, type: "department" as const }));

      res.json({
        cases: assignedCases,
        consultations: assignedConsultations,
        fieldTasks: assignedFieldTasks,
        departments: headOfDepartments,
        hasDependencies: assignedCases.length > 0 || assignedConsultations.length > 0 || assignedFieldTasks.length > 0 || headOfDepartments.length > 0,
      });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب البيانات المرتبطة" });
    }
  });

  // 4c-6 EXCLUSION 1 — user-account DELETE is NOT delegation-inheritable.
  // requireRealRole → only a real branch_manager/admin_support (own role)
  // can delete a user; a delegate with an inherited admin role is blocked
  // (account destruction would outlast the delegation window and could orphan
  // the delegation itself). The self-delete guard below stays (real id).
  app.delete("/api/users/:id", requireAuth, requireRealRole("branch_manager", "admin_support"), async (req: AuthRequest, res) => {
    try {
      const userId = String(req.params.id);
      const currentUser = req.user!;

      if (currentUser.id === userId) {
        return res.status(400).json({ error: "لا يمكنك حذف حسابك الحالي" });
      }

      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }

      const { reassignments } = deleteUserSchema.parse(req.body ?? {});
      const allUsers = await storage.getAllUsers();
      const activeUserIds = new Set(allUsers.filter(u => u.isActive && u.id !== userId).map(u => u.id));
      const branchManagers = allUsers.filter(u => u.role === "branch_manager");

      const validReassignments: Record<string, string> = {};
      for (const [key, val] of Object.entries(reassignments)) {
        if (val && typeof val === "string" && activeUserIds.has(val)) {
          validReassignments[key] = val;
        }
      }

      const allCases = await storage.getAllCases();
      const assignedCases = allCases.filter(c =>
        c.primaryLawyerId === userId ||
        c.responsibleLawyerId === userId ||
        (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(userId))
      );

      for (const c of assignedCases) {
        const newAssignee = validReassignments[`case_${c.id}`];
        const updates: any = {};
        if (c.primaryLawyerId === userId) updates.primaryLawyerId = newAssignee || null;
        // CLEAR the legacy column rather than re-pointing it: primaryLawyerId is
        // the single canonical field, and the line above already routes the work
        // to the replacement. Leaving the departing user here would keep granting
        // them case access through the responsibleLawyerId permission clause.
        if (c.responsibleLawyerId === userId) updates.responsibleLawyerId = null;
        if (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(userId)) {
          const filtered = c.assignedLawyers.filter((l: string) => l !== userId);
          if (newAssignee && !filtered.includes(newAssignee)) {
            filtered.push(newAssignee);
          }
          updates.assignedLawyers = filtered;
        }
        await storage.updateCase(c.id, updates);
        if (!newAssignee) {
          for (const mgr of branchManagers) {
            await storage.createNotification({
              type: "general_alert",
              priority: "high",
              title: "قضية تحتاج إسناد",
              message: `القضية "${c.caseNumber}" أصبحت بدون محامي مسند بعد حذف المستخدم "${targetUser.name}"`,
              senderId: currentUser.id,
              senderName: currentUser.name,
              recipientId: mgr.id,
              relatedType: "case",
              relatedId: c.id,
            });
          }
        }
      }

      const allConsultations = await storage.getAllConsultations();
      const assignedConsultations = allConsultations.filter(c => c.assignedTo === userId);
      for (const c of assignedConsultations) {
        const newAssignee = validReassignments[`consultation_${c.id}`];
        await storage.updateConsultation(c.id, { assignedTo: newAssignee || null });
        if (!newAssignee) {
          for (const mgr of branchManagers) {
            await storage.createNotification({
              type: "general_alert",
              priority: "high",
              title: "استشارة تحتاج إسناد",
              message: `الاستشارة "${c.consultationNumber}" أصبحت بدون محامي مسند بعد حذف المستخدم "${targetUser.name}"`,
              senderId: currentUser.id,
              senderName: currentUser.name,
              recipientId: mgr.id,
              relatedType: "consultation",
              relatedId: c.id,
            });
          }
        }
      }

      const allFieldTasks = await storage.getAllFieldTasks();
      const assignedFieldTasks = allFieldTasks.filter(t => t.assignedTo === userId);
      for (const t of assignedFieldTasks) {
        const newAssignee = validReassignments[`fieldTask_${t.id}`];
        if (newAssignee) {
          await storage.updateFieldTask(t.id, { assignedTo: newAssignee });
        } else {
          for (const mgr of branchManagers) {
            await storage.createNotification({
              type: "general_alert",
              priority: "high",
              title: "مهمة ميدانية تحتاج إسناد",
              message: `المهمة "${t.title}" أصبحت بدون مسؤول بعد حذف المستخدم "${targetUser.name}"`,
              senderId: currentUser.id,
              senderName: currentUser.name,
              recipientId: mgr.id,
              relatedType: "field_task",
              relatedId: t.id,
            });
          }
        }
      }

      const allDepartments = await storage.getAllDepartments();
      const headOfDepts = allDepartments.filter(d => d.headId === userId);
      for (const d of headOfDepts) {
        const newHead = validReassignments[`department_${d.id}`];
        await storage.updateDepartment(d.id, { headId: newHead || null });
        if (!newHead) {
          for (const mgr of branchManagers) {
            await storage.createNotification({
              type: "general_alert",
              priority: "urgent",
              title: "قسم بدون رئيس",
              message: `القسم "${d.name}" أصبح بدون رئيس بعد حذف المستخدم "${targetUser.name}"`,
              senderId: currentUser.id,
              senderName: currentUser.name,
              recipientId: mgr.id,
            });
          }
        }
      }

      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "حدث خطأ في حذف المستخدم" });
    }
  });

  // ==================== Cases ====================

  app.get("/api/cases", requireAuth, async (req, res) => {
    try {
      const allCases = await storage.getAllCases();
      // ONE extra query for the whole response, not one per case — the
      // hasReturnedFromReview enrichment idiom, extended. Returns the set of
      // case ids that have a صك file so the map below can stamp a derived
      // boolean; nothing about the attachment itself travels to the list.
      const deedAttached = await storage.getCaseIdsWithDeedAttachment();
      // Batch 3 — one more set, one more query, same idiom. Feeds the
      // hasJudgmentRecord stamp below.
      const casesWithJudgment = await storage.getCaseIdsWithJudgment();
      // Batch 4 — the CURRENT ruling's hearing, direction and deed state. Two more
      // queries for the whole response; the client cannot derive any of the three.
      const judgmentSummaries = await storage.getCurrentJudgmentSummaries();
      // Strip stageHistory from list responses — it can be 20-50 entries
      // per case and is only needed in the case detail view (GET
      // /api/cases/:id). Replace it with a derived boolean the cases-table
      // badge needs ("has this case bounced through internal review?")
      // so the table doesn't have to ship the whole history just to
      // render a tiny indicator pill.
      const stripped = allCases.map(({ stageHistory, ...c }) => ({
        ...c,
        hasReturnedFromReview:
          Array.isArray(stageHistory) &&
          stageHistory.some((t: any) =>
            t?.stage === "مراجعة_داخلية" || t?.stage === "مراجعة_داخلية_للتظلم"
          ),
        // DERIVED, never stored. There is no has_deed_attachment column and no
        // clearing code: the badge that reads this goes away the instant a file
        // row exists, and comes back the instant it is deleted, because the
        // value is recomputed from case_attachments on every list read. Present
        // ONLY on this list response — it is not on the LawCase interface, so
        // it can never reach an insert or update path.
        hasDeedAttachment: deedAttached.has(c.id),
        // DERIVED, never stored — "does this case have a ruling on record?".
        // Batch 3's replacement for the `currentStage === محكوم_حكم_ابتدائي` term
        // the two صك badges used to key on, which was wrong in both directions: a
        // منظورة ruling marked NOT objectionable goes straight to محكوم_حكم_نهائي
        // and never visits that stage (8 of 8 in production), while a case merely
        // parked on it might have no ruling at all. Same rule the server's own deed
        // gate has asked since batch 2, so badge and endpoint agree by construction.
        // Not on the LawCase interface, so it can never reach an insert or update.
        hasJudgmentRecord: casesWithJudgment.has(c.id),
        // Batch 4 — three DERIVED facts about the case's CURRENT ruling, none of
        // them stored and none on the LawCase interface.
        //   • currentJudgmentHearingId — re-keys findPrimaryJudgmentHearing so the
        //     appeal-outcome UI reasons about the ruling that STANDS, not the one
        //     a remand quashed. Null when the ruling had no session in our system.
        //   • currentJudgmentOutcome — lets the closed-case badge name the LATEST
        //     ruling. Null for a quash, which decides procedure, not merits.
        //   • currentJudgmentHasDeed — asks judgment_attachments, i.e. does THIS
        //     ruling have its own صك. 🔴 This is what the client close-gate mirror
        //     and both صك badges now read INSTEAD of hasDeedAttachment: the
        //     case-keyed answer says "yes" for a cycle-2 ruling whose deed nobody
        //     has seen, which would show a green case while the server refuses to
        //     close it — the invisible hold the badges exist to prevent.
        currentJudgmentHearingId: judgmentSummaries.get(c.id)?.hearingId ?? null,
        currentJudgmentOutcome: judgmentSummaries.get(c.id)?.outcome ?? null,
        currentJudgmentHasDeed: judgmentSummaries.get(c.id)?.hasDeed ?? false,
        // DERIVED, never stored, and computed HERE because this is the last point
        // at which stageHistory still exists — the destructure above strips it.
        // Uses the SHARED caseReachedJudgmentStage so the client's صك gates
        // (canEarlyCloseCase, the appeal-outcome buttons, the late-attach
        // affordance) apply byte-for-byte the same rule the server enforces, on a
        // list that cannot evaluate it itself. No extra query: history is in hand.
        // Renamed with the helper — it now covers all three judgment stages, so
        // "primary" would have been wrong on the wire as well as in the code.
        reachedJudgmentStage: caseReachedJudgmentStage({ currentStage: c.currentStage, stageHistory }),
      }));
      res.json(stripped);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضايا" });
    }
  });

  // 🔴 READ GATE = requireAuth ONLY (owner rule 2026-08-04: any employee may read
  // any case). This was the LAST read on cases or hearings still narrower than the
  // firm-wide list that leads to it, and the mismatch was doing real damage rather
  // than protecting anything:
  //   • GET /api/cases (:2764) is requireAuth + getAllCases() with NO scoping, so
  //     every authenticated user ALREADY holds every case row, and the case-details
  //     dialog renders from that list with no client gate. Nothing was withheld.
  //   • This route is called by the dialog ONLY to graft the full stageHistory that
  //     the list strips (case-details-dialog.tsx:284), and its failure is SWALLOWED.
  //     So the canViewCase 403 never blocked anyone from opening a case — it just
  //     made سجل المراحل render EMPTY, with no error, for an out-of-department
  //     department_head or an unassigned employee. A silent partial failure on data
  //     the same user could already see in full.
  // Removed: the canViewCase check and its 403. Nothing else in the handler changed.
  //
  // ⚠ canViewCase ITSELF IS NOT DEAD and is deliberately left in place — it still
  // gates four other call sites, TWO OF WHICH ARE WRITES:
  //     GET  /api/field-tasks/case/:caseId          (:12718, read)
  //     GET  /api/field-tasks/:id      parent fallback (:12745, read)
  //     POST /api/cases/:id/comments                (:14666, WRITE)
  //     POST /api/cases/:id/notes                   (:14711, WRITE)
  // Those are untouched by this commit.
  //
  // 🔴 NOTE FOR THE سجل الأحكام BATCH 2 (no routes exist yet — batch 1 is inert).
  // Express matches in REGISTRATION ORDER and a `:param` is a catch-all for one
  // segment, so EVERY literal path must be registered BEFORE its `:id` sibling of
  // the same method and segment count. This cost a full debugging round on
  // /api/hearings/ring-state, which was registered after /api/hearings/:id and was
  // therefore captured with id="ring-state" and 404'd — silently, because the
  // polled query just returned empty and no error surfaced anywhere in the UI.
  //   • /api/cases/:id/judgments — SAFE at any position: three segments after
  //     /api, so it cannot be captured by this two-segment route.
  //   • a future /api/judgments/<literal> — MUST precede /api/judgments/:id.
  // After adding any literal route, re-run the whole-file shadowing sweep
  // (compare every literal path against every earlier same-method :param route of
  // matching segment count); the last sweep found no shadowed route among 209.
  app.get("/api/cases/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json(caseItem);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضية" });
    }
  });

  app.post("/api/cases", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      // CREATE-SCOPE — department_head AND employee may open a case, but only into
      // THEIR OWN department; branch_manager / admin_support stay global.
      // scopedCreateDepartmentId forces an omitted department and rejects an
      // explicitly different one (see its comment for the forced-vs-rejected split).
      if (!["branch_manager", "admin_support", "department_head", "employee"].includes(user.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإنشاء القضايا" });
      }
      const caseScope = scopedCreateDepartmentId(user, req.body?.departmentId);
      if (!caseScope.ok) {
        return res.status(400).json({ error: caseScope.error });
      }
      // Write the resolved department back BEFORE parsing so the created row and the
      // validated payload agree.
      req.body.departmentId = caseScope.departmentId;
      const validatedData = insertCaseSchema.parse(req.body);
      // Carry clientRole forward explicitly — earlier the field wasn't in the
      // schema, so parse() stripped it and the case was inserted with null.
      validatedData.clientRole = validatedData.clientRole ?? req.body.clientRole ?? null;
      // Phase 5 A2/L3 — createdBy is the actor; derive from req.user, never the
      // body (was req.body.createdBy, client-forgeable). The FE already sends
      // its own user.id here, so the stored value is unchanged.
      const createdBy = user.id;
      const newCase = await storage.createCase(validatedData as Partial<LawCase>, createdBy);

      // IN_COURT cases may begin at مداولة_الصلح instead of the default استلام.
      const requestedStartingStage = typeof req.body.startingStage === "string"
        ? req.body.startingStage
        : null;
      if (
        requestedStartingStage === "مداولة_الصلح" &&
        validatedData.caseClassification === CaseClassification.IN_COURT
      ) {
        const nowIso = new Date().toISOString();
        const stageHistory: CaseStageTransition[] = [
          { stage: "استلام", timestamp: nowIso, userId: createdBy, userName: createdBy, notes: "استلام القضية" },
          { stage: "مداولة_الصلح", timestamp: nowIso, userId: createdBy, userName: createdBy, notes: "بدء القضية من مرحلة مداولة الصلح" },
        ];
        const updated = await storage.updateCase(newCase.id, {
          currentStage: "مداولة_الصلح",
          stageHistory,
          isSettlementCase: true,
        });
        if (updated) {
          Object.assign(newCase, updated);
        }
      }

      const autoCreated: any[] = [];
      const classification = validatedData.caseClassification || "قيد_الدراسة";

      const smartPriority = calculateSmartPriority(
        validatedData.caseType || "",
        classification,
        !!validatedData.memoRequired,
        (req.body.nextHearingDate as string | null) || null,
        validatedData.priority || "متوسط",
        validatedData.responseDeadline || null
      );
      if (smartPriority !== newCase.priority) {
        await storage.updateCase(newCase.id, { priority: smartPriority });
        newCase.priority = smartPriority;
      }

      // A case that STARTS at مداولة_الصلح is a settlement attempt: no memos are
      // written at that stage, so NEITHER auto-memo below may fire for it. The
      // memo isn't lost — it is created when the settlement FAILS and litigation
      // resumes (the مداولة_الصلح → أغلق_طلب_الصلح transition in PATCH
      // /api/cases/:id), which is the moment the جوابية is actually needed.
      // Read off newCase, which the settlement block above has already updated.
      const startsInSettlement = newCase.currentStage === "مداولة_الصلح" || !!newCase.isSettlementCase;

      // Auto-create memo for existing cases where client is defendant
      const isDefendant = classification === CaseClassification.IN_COURT
        && req.body.clientRole === "مدعى_عليه"
        && !startsInSettlement;
      let autoHearingId: string | null = null;
      if (isDefendant) {
        const deadlineStr = validatedData.responseDeadline || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const casePriority = validatedData.priority || "متوسط";

        if (req.body.nextHearingDate && String(req.body.nextHearingDate).trim()) {
          try {
            const hearing = await storage.createHearing({
              caseId: newCase.id,
              hearingDate: req.body.nextHearingDate,
              hearingTime: req.body.nextHearingTime || "10:00",
              hearingType: "محكمة",
              courtName: (validatedData.courtName || ""),
              status: "قادمة",
            });
            autoHearingId = hearing.id;
            autoCreated.push({ type: "hearing", id: hearing.id, hearing });
            await storage.updateCase(newCase.id, { nextHearingDate: req.body.nextHearingDate });
            newCase.nextHearingDate = req.body.nextHearingDate;
          } catch (e) {
            console.error("[POST /api/cases] Error auto-creating defendant hearing:", e);
          }
        }

        try {
          const memo = await storage.createMemo({
            caseId: newCase.id,
            hearingId: autoHearingId,
            memoType: MemoType.RESPONSE,
            title: `مذكرة جوابية - ${newCase.caseNumber}`,
            description: `مذكرة جوابية تلقائية لقضية مدعى عليه - ${newCase.caseNumber}`,
            priority: casePriority,
            assignedTo: newCase.primaryLawyerId || newCase.responsibleLawyerId || "",
            createdBy: "system",
            deadline: deadlineStr,
            isAutoGenerated: true,
            autoGenerateReason: "قضية_مدعى_عليه",
            status: MemoStatus.NOT_STARTED,
          });
          autoCreated.push({ type: "response_memo", id: memo.id });
          await storage.updateCase(newCase.id, { activeMemoCount: 1 });
        } catch (e) {
          console.error("Error auto-creating defendant memo:", e);
        }

        try {
          await storage.createNotification({
            type: "case_assigned",
            priority: "urgent",
            status: "pending",
            title: "قضية جديدة - مدعى عليه",
            message: `وردت قضية جديدة نحن فيها مدعى عليهم - ${newCase.caseNumber} - المهلة: ${validatedData.responseDeadline || "15 يوم"}`,
            senderId: "system",
            senderName: "النظام",
            recipientId: createdBy,
            requiresResponse: false,
            relatedType: "case",
            relatedId: newCase.id,
          });
        } catch (e) {
          console.error("Error creating defendant notification:", e);
        }
      }

      // Auto-create hearing for IN_COURT plaintiff cases (non-defendant path)
      if (
        !isDefendant &&
        classification === CaseClassification.IN_COURT &&
        req.body.nextHearingDate &&
        String(req.body.nextHearingDate).trim()
      ) {
        try {
          const hearing = await storage.createHearing({
            caseId: newCase.id,
            hearingDate: req.body.nextHearingDate,
            hearingTime: req.body.nextHearingTime || "10:00",
            hearingType: "محكمة",
            courtName: (validatedData.courtName || ""),
            status: "قادمة",
          });
          autoHearingId = hearing.id;
          autoCreated.push({ type: "hearing", id: hearing.id, hearing });
          await storage.updateCase(newCase.id, { nextHearingDate: req.body.nextHearingDate });
          newCase.nextHearingDate = req.body.nextHearingDate;
        } catch (e) {
          console.error("[POST /api/cases] Error auto-creating hearing:", e);
        }
      }

      // !startsInSettlement is REQUIRED here, not just belt-and-braces: isDefendant
      // is now false for a settlement-start case, so without this guard a
      // defendant case created at مداولة_الصلح with "مطلوب مذكرة" ticked would fall
      // through to THIS block and get the very memo we just suppressed above.
      if (req.body.memoRequired && !isDefendant && !startsInSettlement) {
        try {
          const memoDeadline = req.body.responseDeadline || validatedData.responseDeadline || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const memoTitle = `مذكرة — قضية رقم ${newCase.caseNumber}`;
          const memo = await storage.createMemo({
            caseId: newCase.id,
            hearingId: autoHearingId,
            memoType: MemoType.RESPONSE,
            title: memoTitle,
            description: memoTitle,
            priority: validatedData.priority || "متوسط",
            assignedTo: newCase.primaryLawyerId || newCase.responsibleLawyerId || "",
            createdBy: "system",
            deadline: memoDeadline,
            isAutoGenerated: true,
            autoGenerateReason: "مطلوب_مذكرة_عند_الإنشاء",
            status: MemoStatus.NOT_STARTED,
          });
          autoCreated.push({ type: "memo_required", id: memo.id });
          const activeCount = await getActiveMemoCount(newCase.id);
          await storage.updateCase(newCase.id, { activeMemoCount: activeCount });
        } catch (e) {
          console.error("Error creating memoRequired memo:", e);
        }
      }

      try {
        await logCaseActivityActing(req, {
          caseId: newCase.id,
          userId: createdBy,
          userName: createdBy,
          actionType: "case_created",
          title: `تم إنشاء القضية ${newCase.caseNumber}`,
        });
      } catch (e) {}

      // Total by construction — see the helper. Awaiting it cannot reject, so
      // the 201 below is never at risk from a notification failure.
      await notifyDepartmentHeadOfNewRecord({
        entityType: "case",
        entityId: newCase.id,
        label: newCase.caseNumber,
        departmentId: newCase.departmentId,
        actorId: createdBy,
        actorName: user.name || createdBy,
      });

      res.status(201).json({ ...newCase, autoCreated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      // Storage-layer sentinels for case_number unique-constraint failures.
      // DUPLICATE_CASE_NUMBER means the auto-generated nanoid suffix kept
      // colliding across all retries — extremely rare. CASE_NUMBER_EXISTS
      // means the user-supplied courtCaseNumber matches an existing one.
      const msg = (error as any)?.message || "";
      if (msg === "DUPLICATE_CASE_NUMBER") {
        return res.status(400).json({ error: "تعذّر توليد رقم قضية فريد، يرجى المحاولة مرة أخرى" });
      }
      if (msg === "CASE_NUMBER_EXISTS") {
        return res.status(400).json({ error: "رقم القضية المُدخل مستخدم مسبقاً، يرجى استخدام رقم آخر" });
      }
      // Dump full error to server logs.
      console.error("[POST /api/cases] FAILED. clientRole=", req.body.clientRole, "caseClassification=", req.body.caseClassification);
      console.error("[POST /api/cases] error name:", (error as any)?.name);
      console.error("[POST /api/cases] error message:", (error as any)?.message);
      console.error("[POST /api/cases] error code:", (error as any)?.code);
      console.error("[POST /api/cases] error stack:", (error as any)?.stack);
      console.error("[POST /api/cases] full error object:", error);
      // Temporarily surface the error to the client so the cause is visible in
      // the browser Network tab without needing Replit log access. Remove the
      // `debug` field once the bug is identified.
      res.status(500).json({
        error: "حدث خطأ في إنشاء القضية",
        debug: {
          name: (error as any)?.name,
          message: (error as any)?.message,
          code: (error as any)?.code,
          stack: typeof (error as any)?.stack === "string" ? (error as any).stack.split("\n").slice(0, 6).join("\n") : null,
        },
      });
    }
  });

  app.patch("/api/cases/:id/taradi", requireAuth, async (req: AuthRequest, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = req.user!;
      if (!canModifyCase(user, caseItem, req.actingContext)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      // Gate by DEPARTMENT (not the free-text caseType): the settlement panel
      // follows the case's department so a labor-dept case mistyped "تجاري"
      // can't open the commercial تراضي flow (and vice-versa).
      const taradiDept = caseItem.departmentId ? await storage.getDepartmentById(caseItem.departmentId) : null;
      if (caseItem.caseClassification !== CaseClassification.UNDER_STUDY || taradiDept?.name !== "تجاري") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط للقضايا التجارية الجديدة" });
      }
      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = updateCaseTaradiSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const validStatuses = ["مقيدة_في_تراضي", "تم_الصلح", "لم_يتم_صلح"];
      const { status, taradiNumber } = req.body;
      if (!status || !validStatuses.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
      
      if (!taradiNumber || typeof taradiNumber !== "string" || !taradiNumber.trim()) {
        return res.status(400).json({ error: "يرجى إدخال رقم الطلب في منصة تراضي" });
      }
      const updateData: any = { taradiStatus: status, taradiNumber: taradiNumber.trim().substring(0, 100) };
      
      const updated = await storage.updateCase(caseItem.id, updateData);
      
      if (status === "لم_يتم_صلح") {
        const deptUsers = await storage.getAllUsers();
        const deptHead = deptUsers.find((u: any) => u.departmentId === caseItem.departmentId && u.role === "department_head" && u.isActive);
        const recipients = deptHead ? [deptHead.id] : ["1"];
        for (const recipientId of recipients) {
          await storage.createNotification({
            type: "stage_changed",
            priority: "high",
            status: "pending",
            title: "مطلوب تقييد القضية في المحكمة",
            message: `القضية ${caseItem.caseNumber} - لم يتم الصلح في تراضي. يرجى تقييدها في المحكمة المختصة.`,
            senderId: user.id,
            senderName: user.name,
            recipientId,
            requiresResponse: true,
            relatedType: "case",
            relatedId: caseItem.id,
          });
        }
      }
      
      await logCaseActivityActing(req, {
        caseId: caseItem.id,
        userId: user.id,
        userName: user.name,
        actionType: "stage_changed",
        title: status === "مقيدة_في_تراضي" ? "تم التقييد في منصة تراضي" : status === "تم_الصلح" ? "تم الصلح عبر تراضي" : "لم يتم الصلح في تراضي",
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating taradi status:", error);
      res.status(500).json({ error: "حدث خطأ في تحديث حالة تراضي" });
    }
  });

  app.patch("/api/cases/:id/mohr", requireAuth, async (req: AuthRequest, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = req.user!;
      if (!canModifyCase(user, caseItem, req.actingContext)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      // Gate by DEPARTMENT (not the free-text caseType): the MOHR settlement
      // panel follows the case's department (عمالي), matching how the whole
      // stage track is routed. See schema getStagesForClassification.
      const mohrDept = caseItem.departmentId ? await storage.getDepartmentById(caseItem.departmentId) : null;
      if (caseItem.caseClassification !== CaseClassification.UNDER_STUDY || mohrDept?.name !== "عمالي") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط للقضايا العمالية الجديدة" });
      }
      // C3 — settlement-actor gate. Runs AFTER the labor/classification 400 above
      // so a non-labor case still reports "wrong kind of case", not "no permission".
      if (!canActOnMohrSettlement(user, caseItem, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإجراءات التسوية الودية في هذه القضية" });
      }
      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = updateCaseMohrSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const validStatuses = ["مقيدة_في_الموارد", "توجيه_تسوية_ودية", "انتهت_التسوية"];
      const { status, mohrNumber } = req.body;
      if (!status || !validStatuses.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
      
      const updateData: any = { mohrStatus: status };
      if (mohrNumber && typeof mohrNumber === "string") updateData.mohrNumber = mohrNumber.substring(0, 100);
      
      const updated = await storage.updateCase(caseItem.id, updateData);
      
      if (status === "انتهت_التسوية") {
        const deptUsers = await storage.getAllUsers();
        const deptHead = deptUsers.find((u: any) => u.departmentId === caseItem.departmentId && u.role === "department_head" && u.isActive);
        const recipients = deptHead ? [deptHead.id] : ["1"];
        for (const recipientId of recipients) {
          await storage.createNotification({
            type: "stage_changed",
            priority: "high",
            status: "pending",
            title: "مطلوب استكمال دراسة القضية ورفعها للمحكمة",
            message: `القضية ${caseItem.caseNumber} - انتهت مرحلة التسوية الودية. يرجى استكمال دراستها ورفعها في المحكمة المختصة.`,
            senderId: user.id,
            senderName: user.name,
            recipientId,
            requiresResponse: true,
            relatedType: "case",
            relatedId: caseItem.id,
          });
        }
      }
      
      await logCaseActivityActing(req, {
        caseId: caseItem.id,
        userId: user.id,
        userName: user.name,
        actionType: "stage_changed",
        title: status === "مقيدة_في_الموارد" ? "تم التقييد في وزارة الموارد البشرية" : status === "توجيه_تسوية_ودية" ? "تم توجيه العميل للتسوية الودية" : "انتهت مرحلة التسوية الودية",
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating MOHR status:", error);
      res.status(500).json({ error: "حدث خطأ في تحديث حالة الموارد البشرية" });
    }
  });

  app.post("/api/cases/:id/direct-settlement", requireAuth, async (req: AuthRequest, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = req.user!;
      if (!canModifyCase(user, caseItem, req.actingContext)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      // Gate by DEPARTMENT (not the free-text caseType) — mirrors /mohr.
      const settlementDept = caseItem.departmentId ? await storage.getDepartmentById(caseItem.departmentId) : null;
      if (caseItem.caseClassification !== CaseClassification.UNDER_STUDY || settlementDept?.name !== "عمالي") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط للقضايا العمالية الجديدة" });
      }
      // C3 — settlement-actor gate; same rule and ordering as PATCH /mohr above.
      if (!canActOnMohrSettlement(user, caseItem, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإجراءات التسوية الودية في هذه القضية" });
      }

      await storage.updateCase(caseItem.id, {
        amicableSettlementDirected: true,
        mohrStatus: "توجيه_تسوية_ودية",
      });
      
      const allUsers = await storage.getAllUsers();
      const adminSupports = allUsers.filter((u: any) => u.role === "admin_support" && u.isActive);
      for (const admin of adminSupports) {
        await storage.createNotification({
          type: "task_reminder",
          priority: "high",
          status: "pending",
          title: "توجيه عميل لرفع التسوية الودية",
          message: `القضية ${caseItem.caseNumber} - يرجى توجيه العميل برفع القضية في إدارة التسوية الودية بوزارة الموارد البشرية.`,
          senderId: user.id,
          senderName: user.name,
          recipientId: admin.id,
          requiresResponse: false,
          relatedType: "case",
          relatedId: caseItem.id,
        });
      }
      
      await logCaseActivityActing(req, {
        caseId: caseItem.id,
        userId: user.id,
        userName: user.name,
        actionType: "stage_changed",
        title: "تم توجيه العميل لرفع القضية في التسوية الودية",
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error directing settlement:", error);
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  app.post("/api/cases/:id/skip-data-completion", requireAuth, async (req: AuthRequest, res) => {
    const caseId = String(req.params.id);
    try {
      const caseItem = await storage.getCaseById(caseId);
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = req.user!;

      // Role gate: branch_manager + admin_support + department_head
      // (own dept) + assigned_lawyer (primary / responsible / in
      // assignedLawyers — see isAssignedLawyer). Mirrors the client
      // gate on the "تجاوز" button in case-progress-bar.tsx so the
      // button visibility and the server check never drift.
      const isOwnDeptHead =
        user.role === "department_head"
        && !!user.departmentId
        && caseItem.departmentId === user.departmentId;
      const authorized =
        user.role === "branch_manager"
        || user.role === "admin_support"
        || isOwnDeptHead
        || isAssignedLawyer(user, caseItem);
      if (!authorized) {
        return res.status(403).json({ error: "لا تملك صلاحية تجاوز مرحلة استكمال المرفقات والبيانات" });
      }

      if (caseItem.currentStage !== "استلام") {
        return res.status(400).json({ error: "تجاوز مرحلة استكمال المرفقات والبيانات متاح فقط من مرحلة الاستلام" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { notes } = req.body;
      const skipNote = (notes && typeof notes === "string" && notes.trim()) || "تم تجاوز مرحلة استكمال المرفقات والبيانات - الدعوى مكتملة";
      const now = new Date().toISOString();
      const existingHistory = Array.isArray(caseItem.stageHistory) ? caseItem.stageHistory : [];

      // Skip target depends on the path the case is on. UNDER_STUDY cases
      // always go to دراسة. IN_COURT cases branch on clientRole and
      // memoRequired: defendant + memo → تحرير_مذكرة_جوابية, plaintiff +
      // memo → تحرير_صحيفة_الدعوى, no memo → دراسة.
      const isInCourt = caseItem.caseClassification === "منظورة_بالمحكمة";
      const clientRole = caseItem.clientRole as string | undefined;
      const memoRequired = !!caseItem.memoRequired;
      let skipTarget: CaseStageValue = "دراسة";
      if (isInCourt && memoRequired) {
        skipTarget = clientRole === "مدعى_عليه"
          ? "تحرير_مذكرة_جوابية"
          : "تحرير_صحيفة_الدعوى";
      }

      const skipActorName = actorDisplayName(req.actingContext, caseItem.id, user.name);
      const stageHistory: CaseStageTransition[] = [
        ...existingHistory,
        { stage: "استكمال_البيانات", timestamp: now, userId: user.id, userName: skipActorName, notes: "تجاوز تلقائي" },
        { stage: skipTarget, timestamp: now, userId: user.id, userName: skipActorName, notes: skipNote },
      ];

      // Step 1: update the case (the only critical operation)
      let updated;
      try {
        updated = await storage.updateCase(caseItem.id, { currentStage: skipTarget, stageHistory });
      } catch (err: any) {
        console.error("[skip-data-completion] updateCase FAILED", {
          caseId,
          message: err?.message,
          stack: err?.stack,
        });
        return res.status(500).json({ error: "فشل تحديث القضية", detail: err?.message });
      }

      if (!updated) {
        console.error("[skip-data-completion] updateCase returned undefined", { caseId });
        return res.status(500).json({ error: "فشل تحديث القضية" });
      }

      // Step 2: best-effort activity log — must not fail the request
      try {
        await logCaseActivityActing(req, {
          caseId: caseItem.id,
          userId: user.id,
          userName: user.name,
          actionType: "stage_changed",
          title: `تجاوز مرحلة استكمال المرفقات والبيانات والانتقال مباشرةً إلى ${skipTarget.replace(/_/g, " ")}`,
        });
      } catch (err: any) {
        console.error("[skip-data-completion] logCaseActivity FAILED (non-fatal)", {
          caseId,
          message: err?.message,
          stack: err?.stack,
        });
      }

      console.log("[skip-data-completion] success", {
        caseId,
        newStage: updated.currentStage,
        userId: user.id,
        role: user.role,
      });
      return res.status(200).json(updated);
    } catch (error: any) {
      console.error("[skip-data-completion] unexpected error", {
        caseId,
        message: error?.message,
        stack: error?.stack,
      });
      return res.status(500).json({ error: "حدث خطأ في تجاوز المرحلة", detail: error?.message });
    }
  });

  app.patch("/api/cases/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getCaseById(String(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const user = req.user!;

      // 2D'-V1b Pattern-A gate: validate types only, then keep using
      // req.body untouched (the handler mutates it downstream).
      const bodyCheck = updateCaseSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      // 🔴 THE SECOND WRITER OF THE JUDGMENT MIRROR, CLOSED. Exactly the same
      // shape as the C3 MOHR back door directly below: updateCaseSchema ADMITS
      // judgmentDeedReceivedDate and objectionWindowDays, and this handler spreads
      // the whole body into storage.updateCase (:4696) — so any caller could set a
      // صك receipt date, and with it the objection clock, with no stage check, no
      // judgment record and no activity row.
      //
      // Those two columns are a MIRROR of the current judgment's deed fields and
      // must have exactly ONE writer (server/judgment-record.ts). Stripped rather
      // than 400'd because this is the app's busiest write path and several
      // dialogs re-send whole case objects; see stripJudgmentMirrorFields for why.
      //
      // ZERO BEHAVIOUR CHANGE: the only client that sends these fields posts them
      // to /api/cases/:id/judgment-deed (cases.tsx, the صك dialog), never here.
      const droppedMirrorFields = stripJudgmentMirrorFields(req.body);
      if (droppedMirrorFields.length > 0) {
        console.warn("[cases PATCH] ignored judgment-mirror fields — use POST /judgment-deed", {
          caseId: req.params?.id,
          fields: droppedMirrorFields,
        });
      }

      // C3 — close the MOHR back door. mohrStatus is NOT in caseDataFields below,
      // so it used to skip canEditCaseData and fall through to the generic
      // canModifyCase check — no department gate, no classification gate, no value
      // whitelist. That let anyone who could touch ANY case stamp an arbitrary
      // mohrStatus on it (including a commercial or in-court case) and bypass the
      // narrowed gate on PATCH /mohr entirely. All mohrStatus writes now go through
      // the two gated settlement endpoints.
      //
      // mohrNumber is deliberately NOT blocked: it is a reference number captured
      // as part of the مداولة_الصلح stage transition (case-progress-bar.tsx's
      // platformFieldInfo prompt, validated at the targetStage check further down)
      // and is peer to taradiNumber / najizNumber, which are editable here too.
      // Blocking it would break the settlement-number feature.
      if (Object.prototype.hasOwnProperty.call(req.body, "mohrStatus")) {
        return res.status(400).json({ error: "تحديث حالة التسوية الودية يتم عبر إجراءات التسوية الودية فقط" });
      }

      const caseDataFields = ["clientId", "plaintiffName", "caseType", "caseTypeOther", "departmentOther",
        "courtName", "courtCaseNumber", "judgeName", "circuitNumber", "opponentName", "opponentLawyer", "opponentPhone", "opponentNotes",
        "caseClassification", "previousHearingsCount", "currentSituation", "responseDeadline", "adminCaseSubType", "prescriptionDate", "priority"];

      // When the case is being accepted out of قيد_التدقيق_في_ناجز /
      // قيد_التدقيق_في_معين, courtCaseNumber is supplied as part of the
      // stage-transition payload (not a free-form data edit), so it must not
      // trigger the canEditCaseData gate. The assigned lawyer is allowed to
      // record the court-issued number in that flow.
      const isCourtAcceptTransition =
        (existing.currentStage === "قيد_التدقيق_في_ناجز" ||
          existing.currentStage === "قيد_التدقيق_في_معين") &&
        typeof req.body.currentStage === "string" &&
        req.body.currentStage !== existing.currentStage;
      // Settlement-only cases that pick "استكمال إجراءاتها" on لم يتم الصلح
      // ride caseClassification + isSettlementCase as part of the same PATCH
      // that flips currentStage مداولة_الصلح → أغلق_طلب_الصلح. The flip moves
      // the case from InCourtSettlementStages onto the regular UnderStudy
      // path so the progress bar resolves correctly. Treat caseClassification
      // here as a stage-transition payload rather than a free-form data edit
      // so the assigned lawyer can submit it without canEditCaseData.
      const isSettlementContinueTransition =
        existing.currentStage === "مداولة_الصلح" &&
        existing.isSettlementCase === true &&
        req.body.currentStage === "أغلق_طلب_الصلح" &&
        req.body.isSettlementCase === false &&
        req.body.caseClassification === "قيد_الدراسة";
      let effectiveDataFields = caseDataFields;
      if (isCourtAcceptTransition) {
        effectiveDataFields = effectiveDataFields.filter((f) => f !== "courtCaseNumber");
      }
      if (isSettlementContinueTransition) {
        effectiveDataFields = effectiveDataFields.filter((f) => f !== "caseClassification");
      }
      const hasDataFields = Object.keys(req.body).some((k) => effectiveDataFields.includes(k));

      // WIDENED MODEL — case DATA editing was branch_manager | admin_support only
      // (canEditCaseData). Own-dept department_head and the assigned lawyer may now
      // correct the record too; canEditCaseData is kept and OR-ed so no existing
      // actor loses access.
      if (
        hasDataFields
        && !canEditCaseData(user, existing, req.actingContext)
        && !canActOnEntityTiered(user, existing, existing.departmentId, req.actingContext, existing.id ?? null)
      ) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل بيانات هذه القضية" });
      }

      // CARVE-OUT 4 — ASSIGNMENT / REASSIGNMENT is DEPARTMENT tier and above.
      // ⚠ Checked here, INDEPENDENTLY of the isAssignmentOp branch below, and
      // BEFORE it. isAssignmentOp requires !hasDataFields, so now that the data gate
      // above admits the assignee, an assignee could otherwise smuggle a
      // reassignment through by sending primaryLawyerId ALONGSIDE a data field —
      // isAssignmentOp would be false and the assignment would ride the data gate.
      // This guard fires on the presence of ANY assignment field, whatever else is
      // in the body.
      //
      // This also CLOSES THE PRE-EXISTING HOLE the audit found: an assignment op by
      // a non-dept_head used to fall through to canModifyCase, which grants the
      // assigned lawyer — so an assigned lawyer could reassign their own case via
      // the API (the UI merely hid it). Self-assignment is a privilege-escalation
      // loop: assign it to yourself, then hold assignee-tier authority over it.
      //
      // Scoped on the TARGET department (body ?? current), so a head cannot assign a
      // case INTO or OUT OF a department they do not run. Pure "drop the assignee"
      // narrowing — admin_support and the review heads could assign before and still
      // can, because neither is the actor this carve-out is aimed at.
      const touchesAssignment =
        req.body.primaryLawyerId !== undefined
        || req.body.responsibleLawyerId !== undefined
        || req.body.assignedLawyers !== undefined;
      if (touchesAssignment) {
        const assignTargetDeptId = ("departmentId" in req.body ? req.body.departmentId : existing.departmentId);
        const adminAssignRoles = ["admin_support", "cases_review_head", "consultations_review_head"];
        const assignRoles = req.actingContext
          ? actingIdentitiesFor(req.actingContext, existing.id ?? null).map((i) => i.role)
          : [user.role];
        const assignAllowed =
          canActAtDepartmentTier(user, existing, assignTargetDeptId, req.actingContext, existing.id ?? null)
          || assignRoles.some((r) => adminAssignRoles.includes(r));
        if (!assignAllowed) {
          return res.status(403).json({ error: "يمكنك فقط إسناد قضايا قسمك" });
        }
      }

      // Guard departmentId changes – use explicit presence check to catch null/empty string too.
      // Transfer-to-another-department is allowed for: branch_manager,
      // admin_support, department_head of the case's CURRENT department
      // (shipping a case OUT of their dept), and the assigned lawyer
      // (primaryLawyerId / responsibleLawyerId / assignedLawyers). The
      // previous version of this gate only let canEditCaseData roles
      // through plus a department_head branch that misread the target dept
      // as the actor's gate, which silently 403'd assigned lawyers.
      if ("departmentId" in req.body && req.body.departmentId !== existing.departmentId) {
        // 4c-1: evaluate the original transfer rule per acting identity (self +
        // delegators). No ctx → [self] → byte-identical.
        const transferIdentities = req.actingContext
          ? actingIdentitiesFor(req.actingContext, existing.id ?? null)
          : [{ userId: user.id, role: user.role, departmentId: user.departmentId }];
        // CARVE-OUT 5 — DEPARTMENT TRANSFER is DEPARTMENT tier and above. The three
        // assigned-lawyer clauses that used to sit here are REMOVED: transfer is
        // destructive (it resets currentStage to استلام and clears the assignment,
        // the internal reviewer and the priority), so it is not an action the
        // assignee should be able to take on themselves. admin_support is KEPT —
        // routing files between departments is intake work and the owner's carve-out
        // named only the assignee.
        const transferAllowed = transferIdentities.some((i) =>
          i.role === "branch_manager" || i.role === "admin_support" ||
          (i.role === "department_head" && !!i.departmentId && existing.departmentId === i.departmentId));
        if (!transferAllowed) {
          return res.status(403).json({ error: "لا تملك صلاحية تغيير قسم هذه القضية" });
        }
      }

      // The old `isAssignmentOp && actsAsDeptHead` dept-scope branch that used to sit
      // here is GONE — the touchesAssignment guard above now authorises every
      // assignment write (and does it on the same TARGET department, for ANY body
      // shape, not just an assignment-only one). What remains is the generic
      // modify gate for everything that is neither a data edit nor an assignment.
      if (!hasDataFields && !canModifyCase(user, existing, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه القضية" });
      }

      // Flags set inside the stage-transition block below; acted on after
      // storage.updateCase succeeds. Declared at the outer scope so the
      // post-update side-effects can see them.
      let shouldCreateCollectionTask = false;
      let shouldCreateSettlementFailedMemo = false;

      // Validate stage transition if changing stage
      if (req.body.currentStage && req.body.currentStage !== existing.currentStage) {
        // Use merged case data for validation when classification also changes simultaneously.
        // Stash the resolved department name on the merged copy under
        // `departmentName` so validateStageTransition's path resolution —
        // which calls getStagesForClassification(classification, departmentName)
        // — picks the right commercial/labor/admin/general stage array. The
        // case's own caseType field is free-text user input ("بيع وتوريد"
        // etc.) and is NOT used for routing.
        //
        // 🔴 THE MERGE IS LOAD-BEARING — do NOT pass `existing` here. A request may
        // change caseClassification / memoRequired / clientRole / isSettlementCase
        // in the SAME body as the stage move, and the path must resolve against
        // what the case is BECOMING. The "لم يتم الصلح — استكمال الإجراءات" control
        // sends `{ isSettlementCase: false, caseClassification: "قيد_الدراسة" }`
        // together with its move to أغلق_طلب_الصلح; against `existing` it would
        // still resolve to the 3-stage settlement path, which contains neither
        // endpoint. Full reasoning at the casePath declaration in
        // validateStageTransition.
        const mergedCase: any = { ...existing, ...req.body };
        try {
          const dept = existing.departmentId
            ? await storage.getDepartmentById(existing.departmentId)
            : null;
          if (dept?.name) {
            mergedCase.departmentName = dept.name;
          }
        } catch (e) {
          console.error("[PATCH cases] failed to resolve department for path routing", e);
        }
        // ============ صك SEAL — CLOSING A CASE THAT REACHED JUDGMENT ============
        // Owner decision 2026-08-03. Broader than the stage seal below, which only
        // covers a case still sitting AT محكوم_حكم_ابتدائي: this one follows the
        // case forward, so a judgment case closing from محكوم_حكم_نهائي — or from
        // منظورة_استئناف after appeal-and-back — is caught too. Placed before both
        // the تحصيل block and validateStageTransition so it covers the ordinary
        // edges AND the early-close shortcut in one guard, for every role.
        //
        // 🔴 SCOPE IS THE WHOLE POINT: caseReachedJudgmentStage reads
        // stageHistory, so a case closed by SETTLEMENT, STRIKE-OFF or
        // NO-CLIENT-RESPONSE — none of which ever visit the judgment stage —
        // returns false and closes exactly as it does today. Getting this wrong
        // would break legitimate closures, so it is a positive test for "this case
        // had a judgment", never an exclusion list.
        if (
          req.body.currentStage === "مقفلة"
          && existing.currentStage !== "مقفلة"
          && caseReachedJudgmentStage(existing)
          && await isJudgmentDeedMissing(existing.id)
        ) {
          return res.status(400).json({
            error: "يجب إرفاق صك الحكم قبل إغلاق قضية صدر فيها حكم",
          });
        }

        // ⚠ A ضبط GATE STOOD HERE AND WAS REVERTED (owner decision 2026-08-05,
        // reverting e52e4ad). It refused a case close while any resulted court
        // hearing was missing its minutes. It worked, but a backlog measurement
        // returned 83 cases that would have been blocked the moment it deployed,
        // so the firm chose to attach the backlog FIRST and enable the gate after.
        // The ضبط is therefore VISIBLE-BUT-OPTIONAL for now: the badges, the
        // hearings filter, the my-tasks item and the workflow step all still fire.
        // 🔴 THIS IS INTENDED TO COME BACK. The full predicate, the re-enable steps
        // and the SQL that measures the remaining backlog are recorded in CLAUDE.md
        // under "📎 ATTACHMENTS" — do not re-derive them, and do not treat the
        // absence of a gate here as a decision that minutes are optional forever.
        // ============ صك SEAL — LEAVING ANY JUDGMENT STAGE ============
        // Placed BEFORE validateStageTransition so it covers every way this PATCH
        // can move the case off a judgment stage in one place: the table edges
        // (ابتدائي → استئناف, استئناف → نهائي, استئناف → مشطوبة, and the two
        // → مقفلة edges) AND the early-close shortcut, which bypasses the
        // transition table entirely for four roles. Sealed for EVERY role,
        // branch_manager included — the deed is a fact about the file, not a
        // permission.
        //
        // 🔴 WIDENED 2026-08-04 from محكوم_حكم_ابتدائي alone to all THREE judgment
        // stages, matching caseReachedJudgmentStage. Keyed on the CURRENT stage
        // rather than the history helper on purpose: this gate is about the move
        // being made right now, and a case sitting on a judgment stage is exactly
        // the one whose exit we mean to hold. The close gate above is the one that
        // needs history, because it fires on cases that have already moved.
        //
        // SCOPE UNCHANGED IN SPIRIT: a case that never reached judgment is not on
        // any of these stages, so settlement, strike-off and no-response movements
        // are byte-for-byte unaffected.
        const JUDGMENT_STAGES_REQUIRING_DEED: string[] = [
          "محكوم_حكم_ابتدائي",
          "منظورة_استئناف",
          "محكوم_حكم_نهائي",
        ];
        if (
          JUDGMENT_STAGES_REQUIRING_DEED.includes(existing.currentStage)
          && req.body.currentStage
          && req.body.currentStage !== existing.currentStage
          && await isJudgmentDeedMissing(existing.id)
        ) {
          return res.status(400).json({
            error: "يجب إرفاق صك الحكم قبل نقل القضية من مرحلة الحكم",
          });
        }

        // ==================== تحصيل SEAL + ZERO-TASK ESCAPE ====================
        // A case at تحصيل closes AUTOMATICALLY when its collection/execution tasks
        // are resolved (maybeCloseCaseAfterPostJudgmentTasks). Manual close from
        // تحصيل is therefore sealed: the تحصيل → مقفلة rule is removed from the
        // transition table and the early-close shortcut excludes تحصيل, so
        // validateStageTransition denies this move for EVERY role, branch_manager
        // included.
        //
        // The ONE escape, and the reason this guard is here rather than in
        // validateStageTransition (which is synchronous and cannot read field
        // tasks): a case at تحصيل with NO OUTSTANDING collection/execution task has
        // nothing left to collect, so the automatic mechanism has nothing to fire
        // on. Two populations reach that state —
        //   • legacy cases already sitting at تحصيل from before this change, and
        //     grievance-path cases that entered before the collection task was
        //     added to انتظار_رد_التظلم → تحصيل (they carry no task at all);
        //   • cases whose tasks are ALL resolved but whose auto-close did not land
        //     (the helper swallows its own errors) — here a manual close is simply
        //     a retry of what should already have happened.
        // Both are allowed, at DEPARTMENT tier and above, matching the other
        // final-closure edges. Deliberately bypasses validateStageTransition — the
        // same precedent skip-committee and reopen set.
        //
        // This can never bypass the automatic mechanism: while ANY collection or
        // execution task is still outstanding the close is refused outright, for
        // every role and every tier.
        let tahseelManualCloseAllowed = false;
        if (existing.currentStage === "تحصيل" && req.body.currentStage === "مقفلة") {
          const tahseelTasks = await storage.getFieldTasksByCase(existing.id);
          const outstanding = tahseelTasks.filter(
            (t) => isPostJudgmentTask(t.title) && t.status !== "مكتمل" && t.status !== "ملغي",
          );
          if (outstanding.length > 0) {
            return res.status(400).json({
              error: "لا يمكن إغلاق القضية يدويًا من مرحلة التحصيل — تُغلق تلقائيًا عند إنجاز مهام التحصيل المرتبطة بها",
            });
          }
          if (!canActAtDepartmentTier(user, existing, existing.departmentId, req.actingContext, existing.id ?? null)) {
            return res.status(403).json({ error: "إغلاق قضية في مرحلة التحصيل متاح لرئيس القسم ومدير الفرع فقط" });
          }
          tahseelManualCloseAllowed = true;
        }

        // 4c-1: cases are act-as enabled — canModifyCase above and this
        // transition check both consult the acting context. (Four-eyes: the
        // INTERNAL_REVIEW lock inside stays human-only.)
        if (!tahseelManualCloseAllowed) {
          const stageCheck = validateStageTransition(existing.currentStage, req.body.currentStage, user.role, "case", user, mergedCase, req.actingContext);
          if (!stageCheck.allowed) {
            return res.status(400).json({ error: stageCheck.reason });
          }
        }
        // Committee decision is department-routed: a case at إحالة_للجنة_المراجعة
        // is chaired by labor_review_head if عمالي, else cases_review_head. Only
        // constrains the two review-head roles; branch_manager / department_head
        // keep their table-granted authority.
        if (existing.currentStage === "إحالة_للجنة_المراجعة" &&
            (user.role === "cases_review_head" || user.role === "labor_review_head")) {
          const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
          const committeeHead = (!!laborDeptId && existing.departmentId === laborDeptId)
            ? "labor_review_head" : "cases_review_head";
          if (user.role !== committeeHead) {
            return res.status(403).json({ error: "ليس لديك صلاحية لقرار لجنة المراجعة على هذه القضية" });
          }
        }
        // === EARLY CLOSURE VALIDATION ===
        // Closing a case from a non-terminal stage now requires a reason
        // for any role allowed by validateStageTransition's early-close
        // shortcut (branch_manager / admin_support / dept_head own dept /
        // assigned lawyer). Closures that flow through the normal stage
        // rules (e.g. تحصيل/مشطوبة/post-judgment) come from a terminal
        // stage and don't need a reason.
        const isEarlyCloseStage =
          req.body.currentStage === "مقفلة" &&
          existing.currentStage !== "تحصيل" &&
          existing.currentStage !== "مشطوبة" &&
          existing.currentStage !== "محكوم_حكم_ابتدائي" &&
          existing.currentStage !== "محكوم_حكم_نهائي";
        if (isEarlyCloseStage) {
          if (!req.body.closureReason) {
            return res.status(400).json({ error: "يجب تحديد سبب الإغلاق" });
          }
          if (req.body.closureReason === "أخرى" && (!req.body.closureReasonOther || !req.body.closureReasonOther.trim())) {
            return res.status(400).json({ error: "يجب توضيح سبب الإغلاق عند اختيار 'أخرى'" });
          }
        }

        // === FIELD VALIDATION BEFORE SPECIFIC STAGES ===
        const targetStage = req.body.currentStage;

        // Before دراسة: require opponentName, caseType, departmentId, primaryLawyerId
        if (targetStage === "دراسة") {
          const merged = { ...existing, ...req.body };
          if (!merged.opponentName) return res.status(400).json({ error: "يجب إدخال اسم الخصم قبل الانتقال لمرحلة الدراسة" });
          if (!merged.caseType) return res.status(400).json({ error: "يجب تحديد نوع القضية قبل الانتقال لمرحلة الدراسة" });
          if (!merged.departmentId) return res.status(400).json({ error: "يجب تحديد القسم قبل الانتقال لمرحلة الدراسة" });
          if (!merged.primaryLawyerId) return res.status(400).json({ error: "يجب تعيين محامي رئيسي قبل الانتقال لمرحلة الدراسة" });
        }

        // Entering the platform-review stages now happens directly from
        // جاهزة_للرفع; the lawyer must supply the matching platform number.
        // The taradi number IS the case number at that platform, so on
        // entry we also replace caseNumber with it. Same for labor mohr.
        if (targetStage === "قيد_التدقيق_في_تراضي") {
          const taradi = req.body.taradiNumber || existing.taradiNumber;
          if (!taradi) return res.status(400).json({ error: "يجب إدخال رقم الطلب في تراضي" });
          req.body.caseNumber = String(taradi).trim();
        }
        // LABOR settlement: entering مداولة_الصلح requires the amicable-settlement
        // case number (mohrNumber). Mirrors the تراضي gate above — same shape, same
        // mandatory 400 — so the FE gate at case-progress-bar.tsx and this server
        // rule agree exactly (visibility == enforceability).
        //
        // Gated by DEPARTMENT, not the free-text caseType (same idiom as /mohr at
        // :1969 and /direct-settlement at :2030): مداولة_الصلح is shared by labor,
        // commercial, general and the in-court settlement path, and ONLY labor
        // carries a MOHR number — commercial/general captured theirs on تراضي-entry.
        // Without this department check the rule would 400 every non-labor case
        // entering settlement.
        //
        // NOTE: unlike the تراضي branch above, this deliberately does NOT write
        // req.body.caseNumber. The displayed number is now DERIVED per-stage in
        // storage.ts (deriveCurrentCaseNumber), so the stored caseNumber is left
        // untouched and the number switches back correctly if the case leaves and
        // re-enters settlement.
        if (targetStage === "مداولة_الصلح") {
          const settlementDept = existing.departmentId
            ? await storage.getDepartmentById(existing.departmentId)
            : null;
          if (settlementDept?.name === "عمالي") {
            const mohr = req.body.mohrNumber || existing.mohrNumber;
            if (!mohr || !String(mohr).trim()) {
              return res.status(400).json({ error: "يجب إدخال رقم الدعوى في التسوية الودية" });
            }
          }
        }
        if (targetStage === "قيد_التدقيق_في_ناجز") {
          const najiz = req.body.najizNumber || existing.najizNumber;
          if (!najiz) return res.status(400).json({ error: "يجب إدخال رقم القيد في ناجز" });
          // General-dept audit (2026-06-14) — General enters najiz from
          // جاهزة_للرفع (its FIRST platform stage), so the najiz number becomes
          // the displayed case number while in najiz (mirrors Commercial's
          // caseNumber := taradi on تراضي-entry). Commercial enters najiz from
          // أغلق_طلب_الصلح and keeps its settlement number — left untouched.
          if (existing.currentStage === "جاهزة_للرفع") {
            req.body.caseNumber = String(najiz).trim();
          }
        }
        if (targetStage === "قيد_التدقيق_في_معين") {
          const moeen = req.body.moeenNumber || existing.moeenNumber;
          if (!moeen) return res.status(400).json({ error: "يجب إدخال رقم القيد في معين" });
        }
        // General-dept audit (2026-06-14) — General moves najiz → settlement
        // (مداولة_الصلح) directly; the case enters the تراضي/settlement platform
        // here, so capture the settlement number and surface it as the displayed
        // case number (mirrors Commercial's caseNumber := taradi on تراضي-entry).
        // Reuses the taradiNumber field — the settlement IS the تراضي stage.
        // General-only: Commercial's najiz goes to منظورة, Labor's settlement
        // comes from بانتظار_رفع_العميل_للتسوية (handled by the mohr block below).
        if (existing.currentStage === "قيد_التدقيق_في_ناجز" && targetStage === "مداولة_الصلح") {
          const settlementNumber = req.body.taradiNumber || existing.taradiNumber;
          if (!settlementNumber) return res.status(400).json({ error: "يجب إدخال رقم الصلح في منصة تراضي" });
          req.body.caseNumber = String(settlementNumber).trim();
        }

        // Auto-promote classification from قيد_الدراسة → منظورة_بالمحكمة only
        // once the case actually reaches trial. Pre-trial review and
        // conciliation stages (قيد_التدقيق_*, مداولة_الصلح, أغلق_طلب_الصلح)
        // keep the case as قيد_الدراسة.
        const IN_COURT_STAGES = new Set([
          "منظورة",
          "منظورة_استئناف",
        ]);
        if (
          IN_COURT_STAGES.has(targetStage) &&
          existing.caseClassification === "قيد_الدراسة"
        ) {
          req.body.caseClassification = "منظورة_بالمحكمة";
          // For قيد_الدراسة the firm is always the plaintiff — persist that as
          // an explicit clientRole so post-promotion UI (صفة badge, etc.)
          // doesn't lose the role once classification flips.
          if (!existing.clientRole && !req.body.clientRole) {
            req.body.clientRole = "مدعي";
          }
        }
        // Labor settlement: the caseNumber := mohrNumber sync that used to live
        // here is REMOVED — it was the cause of a 500 on every labor advance into
        // مداولة_الصلح once 7a1b77d started supplying a mohrNumber.
        //
        // It wrote `req.body.caseNumber = mohrNumber`, and updateCase spreads that
        // straight into the UPDATE. But the destination is NARROWER and CONSTRAINED
        // than the source:
        //     case_number  varchar(50)  NOT NULL UNIQUE
        //     mohr_number  varchar(100)
        // so the write threw 23505 (unique_violation) when the settlement number
        // collided with any other case's number, or 22001 (string_data_right_
        // truncation) past 50 chars. Either propagated out of updateCase — which has
        // no try/catch — to the PATCH catch-all, surfacing as
        // 500 "حدث خطأ في تحديث القضية".
        //
        // It was LATENT before 7a1b77d only because nothing ever sent a mohrNumber
        // on this transition (there was no prompt), so `if (mohr && ...)` was false.
        // Adding the prompt made it fire on every labor settlement advance.
        //
        // The sync is now REDUNDANT as well as harmful: deriveCurrentCaseNumber
        // (storage.ts) already returns mohrNumber as the displayed number while the
        // case sits at مداولة_الصلح. Dropping the write also keeps the stored
        // case_number pristine, which is what lets the displayed number switch BACK
        // when the case leaves settlement. No stored data is modified or destroyed —
        // this only stops future overwrites.

        // Accepting out of a najiz/moeen review stage INTO COURT (منظورة): the
        // lawyer must enter the court-issued case number, which then replaces
        // caseNumber. (تراضي doesn't require this — the taradi number itself is
        // the platform's case number.)
        // General-dept audit (2026-06-14) — gate on the DESTINATION being
        // منظورة, not merely on leaving najiz. Commercial najiz→منظورة and
        // Admin معين→منظورة still require it; General's najiz→مداولة_الصلح
        // (conciliation, still pre-trial) must NOT — the case isn't in court
        // yet. (Also stops a rollback out of najiz from wrongly demanding it.)
        if (
          ((existing.currentStage === "قيد_التدقيق_في_ناجز" ||
            existing.currentStage === "قيد_التدقيق_في_معين") &&
            targetStage === "منظورة") ||
          // General-dept audit (2026-06-14) — General reaches court via
          // أغلق_طلب_الصلح → منظورة (its court-entry); capture the court case
          // number here the same way Commercial captures it on najiz → منظورة.
          // General-only: this from→to pair is not used by any other path.
          (existing.currentStage === "أغلق_طلب_الصلح" && targetStage === "منظورة")
        ) {
          const courtCaseNumber = typeof req.body.courtCaseNumber === "string"
            ? req.body.courtCaseNumber.trim()
            : "";
          if (!courtCaseNumber) {
            return res.status(400).json({ error: "يرجى إدخال رقم الدعوى في المحكمة" });
          }
        }

        // Clear platform-review state when leaving any platform-review stage —
        // acceptance means the platform has no remaining notes and no pending
        // resubmission flag.
        if (
          (existing.currentStage === "قيد_التدقيق_في_تراضي" ||
            existing.currentStage === "قيد_التدقيق_في_ناجز" ||
            existing.currentStage === "قيد_التدقيق_في_معين") &&
          targetStage !== existing.currentStage
        ) {
          req.body.platformReviewNotes = "";
          req.body.platformReviewResubmitted = false;
        }

        // (caseNumber replacement now happens on ENTRY into the platform
        // review stage above — see the targetStage === "قيد_التدقيق_في_تراضي"
        // / labor settlement blocks. ناجز/معين acceptance still flows through
        // storage.updateCase:595 which syncs caseNumber := courtCaseNumber.)

        // Before تقديم_التظلم: require grievanceDate
        if (targetStage === "تقديم_التظلم") {
          const gDate = req.body.grievanceDate || existing.grievanceDate;
          if (!gDate) return res.status(400).json({ error: "يجب تحديد تاريخ التظلم" });
        }

        // From تحديد_تاريخ_التقادم to next: require prescriptionDate
        if (existing.currentStage === "تحديد_تاريخ_التقادم") {
          const pDate = req.body.prescriptionDate || existing.prescriptionDate;
          if (!pDate) return res.status(400).json({ error: "يجب تحديد تاريخ التقادم" });
        }

        // When الأخذ_بالملاحظات to جاهزة_للرفع: require reviewDecision describing
        // how the lawyer addressed the committee notes (one of three values).
        if (existing.currentStage === "الأخذ_بالملاحظات" && targetStage === "جاهزة_للرفع") {
          const allowedDecisions = ["تم_الأخذ_بالملاحظات", "تم_الأخذ_جزئياً", "لم_يتم_الأخذ"];
          if (!req.body.reviewDecision || !allowedDecisions.includes(req.body.reviewDecision)) {
            return res.status(400).json({
              error: "يجب تحديد كيفية الأخذ بملاحظات اللجنة (تم/جزئياً/لم يتم)",
            });
          }
        }

        // === JUDGMENT RESULT HANDLING ===
        if (targetStage === "محكوم_حكم_ابتدائي" || targetStage === "محكوم_حكم_نهائي") {
          if (!req.body.judgmentType || !["لصالحنا", "ضدنا", "جزئي"].includes(req.body.judgmentType)) {
            return res.status(400).json({ error: "يجب تحديد نوع الحكم (لصالحنا / ضدنا / جزئي)" });
          }
          if (req.body.judgmentFinal === undefined || typeof req.body.judgmentFinal !== "boolean") {
            return res.status(400).json({ error: "يجب تحديد ما إذا كان الحكم نهائياً أم ابتدائياً" });
          }
          // For ابتدائي + جزئي: require needsAppeal
          if (targetStage === "محكوم_حكم_ابتدائي" && req.body.judgmentType === "جزئي") {
            if (req.body.needsAppeal === undefined || typeof req.body.needsAppeal !== "boolean") {
              return res.status(400).json({ error: "يجب تحديد ما إذا كانت القضية بحاجة لاعتراض (استئناف)" });
            }
          }
        }

        // === REVIEW COMMITTEE DECISION ENFORCEMENT ===
        if (existing.currentStage === CaseStage.REVIEW_COMMITTEE) {
          if (targetStage === CaseStage.READY_TO_SUBMIT) {
            if (req.body.reviewDecision !== "approved") {
              return res.status(400).json({ error: "يجب اعتماد القضية من اللجنة قبل الانتقال" });
            }
            req.body.reviewDecision = "approved";
          } else if (targetStage === CaseStage.TAKING_NOTES) {
            if (req.body.reviewDecision !== "rejected" && req.body.reviewDecision !== "partial") {
              return res.status(400).json({ error: "يجب تحديد سبب الإرجاع وإضافة ملاحظات اللجنة" });
            }
            if (!req.body.reviewNotes || typeof req.body.reviewNotes !== "string" || !req.body.reviewNotes.trim()) {
              return res.status(400).json({ error: "يجب تحديد سبب الإرجاع وإضافة ملاحظات اللجنة" });
            }
            req.body.reviewNotes = req.body.reviewNotes.trim();
          }
        }
      }

      // Validate assigned users are active
      const usersToCheck: string[] = [];
      if (req.body.primaryLawyerId) usersToCheck.push(req.body.primaryLawyerId);
      if (req.body.responsibleLawyerId) usersToCheck.push(req.body.responsibleLawyerId);
      if (Array.isArray(req.body.assignedLawyers)) usersToCheck.push(...req.body.assignedLawyers);
      if (usersToCheck.length > 0) {
        const check = await validateAssignedUsersActive(usersToCheck);
        if (!check.valid) {
          return res.status(400).json({ error: "لا يمكن إسناد العمل لمستخدم معطّل", inactiveUsers: check.inactiveUsers });
        }
      }

      // ── LAWYER CONSISTENCY ────────────────────────────────────────────────
      // 🔴 REASSIGNING A CASE MUST REVOKE THE PREVIOUS LAWYER'S ACCESS.
      // This block used to ADD the new primary to assignedLawyers and never
      // remove anyone, so the reassign dialog (which sends primaryLawyerId alone)
      // left the case reading `assignedLawyers: [oldLawyer, newLawyer]`. Since
      // every case permission check is an OR across primaryLawyerId /
      // responsibleLawyerId / assignedLawyers, the replaced lawyer kept FULL
      // modify access — and their مهامي rows — indefinitely.
      const primaryLawyerChanging =
        req.body.primaryLawyerId !== undefined
        && (req.body.primaryLawyerId || null) !== (existing.primaryLawyerId || null);
      const supersededLawyerId = primaryLawyerChanging ? (existing.primaryLawyerId || "") : "";

      // An explicit assignedLawyers in the body is the caller's own COMPLETE
      // answer and is honoured verbatim — the edit and assign dialogs both send
      // one, so they already replace the array wholesale.
      const callerSentAssignedLawyers = Array.isArray(req.body.assignedLawyers);
      let finalAssignedLawyers: string[] = callerSentAssignedLawyers
        ? req.body.assignedLawyers
        : (Array.isArray(existing.assignedLawyers) ? existing.assignedLawyers : []);

      // Prune EXACTLY the superseded lawyer — never the whole array — so a case
      // with several genuinely assigned lawyers keeps every other one.
      if (supersededLawyerId && !callerSentAssignedLawyers) {
        const pruned = finalAssignedLawyers.filter((l: string) => l !== supersededLawyerId);
        if (pruned.length !== finalAssignedLawyers.length) {
          finalAssignedLawyers = pruned;
          req.body.assignedLawyers = pruned;
        }
      }

      // Respect an EXPLICIT null (unassigning the case). The old `||` fallback
      // read through a null body value to the existing lawyer, which would have
      // re-added the very lawyer just pruned — and, before this change, re-added
      // a lawyer the caller was trying to clear.
      const finalPrimaryLawyer = req.body.primaryLawyerId !== undefined
        ? req.body.primaryLawyerId
        : existing.primaryLawyerId;
      if (finalPrimaryLawyer && !finalAssignedLawyers.includes(finalPrimaryLawyer)) {
        req.body.assignedLawyers = [...finalAssignedLawyers, finalPrimaryLawyer];
      }

      // The legacy responsibleLawyerId column carries its own permission clause.
      // Once the primary changes it can only be naming the superseded lawyer
      // (nothing writes it any more — batch 3 commit 1), so clear it. Guarded on
      // the caller not having sent the field, so an explicit value still wins.
      if (primaryLawyerChanging && req.body.responsibleLawyerId === undefined) {
        req.body.responsibleLawyerId = null;
      }

      // When a case is transferred to a new department without a simultaneous
      // lawyer assignment, clear the old lawyer so the new department can re-assign.
      // Stage restriction was lifted: transfer is now allowed from any stage.
      // The case's currentStage is reset to "استلام" (the new department's
      // path starts fresh). Caller may pass `transferReason` for the activity log.
      const isDeptTransfer =
        "departmentId" in req.body &&
        req.body.departmentId &&
        req.body.departmentId !== existing.departmentId &&
        // "no simultaneous lawyer assignment" must consider BOTH fields: a body
        // that moved the case AND set responsibleLawyerId was previously treated
        // as a bare transfer, so the clear-out below wiped the lawyer the same
        // request had just assigned.
        !req.body.primaryLawyerId &&
        !req.body.responsibleLawyerId &&
        !req.body.assignedLawyers;

      // Capture pre-transfer values BEFORE we mutate req.body so the activity
      // log gets the right "from" snapshot.
      const transferFromStage = existing.currentStage;
      const transferFromDeptId = existing.departmentId;
      const transferFromInternalReviewerId = existing.internalReviewerId || null;
      const transferReason = typeof req.body.transferReason === "string"
        ? req.body.transferReason.trim()
        : "";

      if (isDeptTransfer) {
        req.body.primaryLawyerId = null;
        req.body.responsibleLawyerId = null;
        req.body.assignedLawyers = [];
        // The intake-set internal reviewer is scoped to the source
        // department's roster — they aren't a valid reviewer for the
        // destination dept. Clear it; the new dept head re-assigns at intake.
        req.body.internalReviewerId = null;
        // Reset to استلام so the new department starts the case fresh in
        // its own stage path. The downstream stageHistory update (line ~1982)
        // picks this up and writes a stage_changed entry alongside the
        // department_transferred entry.
        if (req.body.currentStage === undefined) {
          req.body.currentStage = CaseStage.RECEPTION;
        }
        // Also unassign the lawyer from pending hearings and active memos
        const caseId = String(req.params.id);
        try {
          const caseHearings = await storage.getHearingsByCase(caseId);
          for (const h of caseHearings) {
            if (h.status === "قادمة") {
              await storage.updateHearing(h.id, { attendingLawyerId: null });
            }
          }
          const caseMemos = await storage.getMemosByCase(caseId);
          for (const m of caseMemos) {
            if (["لم_تبدأ", "قيد_التحرير", "تحتاج_تعديل"].includes(m.status)) {
              // "" is the system's unassigned sentinel (memos.assigned_to is
              // NOT NULL; auto-memos write `primaryLawyerId || responsibleLawyerId || ""`).
              // The memo mirrors its case: unassigned at transfer, then the
              // primaryLawyerId-change cascade below re-points it when the new
              // department assigns a lawyer.
              await storage.updateMemo(m.id, { assignedTo: "" });
            }
          }
        } catch (e) {
          console.error("Error clearing assignments on department transfer:", e);
        }
      }

      // When moving to an internal-review stage, require an internalReviewerId
      // (either newly provided in req.body or already set on the existing case
      // from intake / a previous round of the review loop) and validate it.
      //
      // Per-review override semantics: if the case already has a persistent
      // intake-set reviewer, a different reviewer in req.body is treated as a
      // single-round override — used for the notification routing on this
      // PATCH but NOT written back to cases.internal_reviewer_id, so the
      // permanent assignment survives. If no persistent reviewer is set yet
      // (legacy rows pre-intake-assignment), the chosen one is persisted to
      // bootstrap the field.
      let activeReviewerForNotification: string | null = null;
      if (
        (req.body.currentStage === "مراجعة_داخلية" || req.body.currentStage === "مراجعة_داخلية_للتظلم") &&
        existing.currentStage !== req.body.currentStage
      ) {
        const persistedReviewer: string | undefined =
          existing.internalReviewerId || undefined;
        const overrideReviewer: string | undefined =
          (typeof req.body.internalReviewerId === "string" && req.body.internalReviewerId)
            ? req.body.internalReviewerId
            : undefined;
        const reviewerId: string | undefined = overrideReviewer || persistedReviewer;
        if (!reviewerId || typeof reviewerId !== "string") {
          return res.status(400).json({ error: "يجب اختيار المراجع الداخلي قبل الانتقال للمرحلة" });
        }
        try {
          const reviewer = await storage.getUser(reviewerId);
          if (!reviewer || !reviewer.isActive) {
            return res.status(400).json({ error: "المراجع الداخلي المختار غير صالح" });
          }
          if (reviewer.role === "admin_support") {
            return res.status(400).json({ error: "لا يمكن اختيار الدعم الإداري كمراجع داخلي" });
          }
          const targetDeptId = req.body.departmentId || existing.departmentId;
          if (targetDeptId && reviewer.departmentId !== targetDeptId) {
            return res.status(400).json({ error: "المراجع الداخلي يجب أن يكون من نفس قسم القضية" });
          }
          if (persistedReviewer) {
            // Permanent reviewer is the source of truth — never let a
            // per-review override mutate it.
            delete req.body.internalReviewerId;
          } else {
            // Bootstrap the persistent slot from the chosen reviewer.
            req.body.internalReviewerId = reviewerId;
          }
          activeReviewerForNotification = reviewerId;
        } catch (e) {
          console.error("[PATCH cases] reviewer validation failed", e);
        }
      }

      // Update stageHistory when stage changes
      if (req.body.currentStage && req.body.currentStage !== existing.currentStage) {
        const existingHistory = Array.isArray(existing.stageHistory) ? existing.stageHistory : [];
        req.body.stageHistory = [
          ...existingHistory,
          {
            stage: req.body.currentStage,
            timestamp: new Date().toISOString(),
            userId: user.id,
            userName: actorDisplayName(req.actingContext, String(req.params.id), user.name || user.id),
            notes: req.body.stageChangeNotes || "",
          },
        ];
        // Set closedAt when transitioning to مقفلة
        if (req.body.currentStage === "مقفلة") {
          req.body.closedAt = new Date().toISOString();
        }

        // Entering تحصيل auto-creates the admin collection-letter field task. The
        // task itself is created AFTER storage.updateCase succeeds so we don't leave
        // orphan tasks on a failed transition.
        //
        // ⚠ NOW COVERS BOTH ENTRY EDGES, not just settlement. تحصيل can no longer be
        // closed by hand — it closes when its collection task resolves — so an entry
        // edge that created NO task would strand the case. انتظار_رد_التظلم → تحصيل
        // (the grievance path) created none and was exactly that dead end; it is
        // included here now. The third entry edge, محكوم_حكم_نهائي → تحصيل, is NOT
        // listed: those cases already carry the collection/execution tasks the
        // judgment recording created, and adding a second collection task would make
        // the auto-close wait on duplicated work.
        shouldCreateCollectionTask =
          req.body.currentStage === "تحصيل" && (
            existing.currentStage === "مداولة_الصلح"
            || existing.currentStage === "انتظار_رد_التظلم"
          );

        // Settlement FAILED → litigation resumes (مداولة_الصلح → أغلق_طلب_الصلح):
        // create the defendant جوابية memo that POST /api/cases deliberately did
        // NOT create while the case sat in settlement. This is the moment the
        // memo is actually needed, and it is the ONLY exit from مداولة_الصلح that
        // gets one — تحصيل (settlement reached) and مقفلة (closed) must not.
        // Classification/clientRole are read off `existing`, i.e. the case AS IT
        // ENTERS the transition: the "استكمال إجراءاتها" path re-classifies the
        // case to قيد_الدراسة in this SAME body, so reading the post-update value
        // would miss exactly the cohort we suppressed at creation.
        // The task itself is created AFTER updateCase succeeds (collection-task
        // idiom) so a failed transition leaves no orphan memo.
        shouldCreateSettlementFailedMemo =
          existing.currentStage === "مداولة_الصلح" &&
          req.body.currentStage === "أغلق_طلب_الصلح" &&
          existing.caseClassification === CaseClassification.IN_COURT &&
          existing.clientRole === "مدعى_عليه";

        // Struck-off reopen: clear struckOff fields when reopening
        if (existing.currentStage === "مشطوبة" && (req.body.currentStage === "منظورة" || req.body.currentStage === "منظورة_استئناف")) {
          req.body.struckOffDate = null;
          req.body.struckOffReopenDeadline = null;
          try {
            await logCaseActivityActing(req, {
              caseId: String(req.params.id),
              userId: user.id,
              userName: user.name || user.id,
              actionType: "stage_changed",
              title: "تم إعادة قيد القضية",
            });
          } catch (e) {}
        }
      }

      const updated = await storage.updateCase(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }

      // Referral to the review committee. Tested as a genuine TRANSITION INTO
      // the stage (was not there, is now), so re-saving a case already parked at
      // إحالة_للجنة_المراجعة does not re-page the chair. Placed here, after
      // updateCase returned, alongside the handler's other post-update side
      // effects — and in the SAME handler as the committee authority gate above,
      // so who-is-told and who-may-decide are computed from one rule.
      if (existing.currentStage !== "إحالة_للجنة_المراجعة"
        && updated.currentStage === "إحالة_للجنة_المراجعة") {
        await notifyCaseSentToCommittee({
          caseId: updated.id,
          caseNumber: updated.caseNumber,
          departmentId: updated.departmentId,
          actorId: user.id,
          actorName: user.name,
        });
      }

      // Side effect for مداولة_الصلح → تحصيل: create the admin collection task.
      if (shouldCreateCollectionTask) {
        try {
          const allUsers = await storage.getAllUsers();
          // Collection (تحصيل) → the per-type assignee from the admin_support
          // task-routing mapping; "" (unassigned pool) if unset or inactive.
          const assignments = await storage.getAdminSupportTaskAssignments();
          const assignee = resolveAdminSupportAssignee(AssignableAdminSupportTaskKind.COLLECTION, assignments, allUsers);
          const collectionTask = await storage.createFieldTask(
            {
              title: `${CollectionTaskTitlePrefix} — قضية رقم ${updated.caseNumber}`,
              // Entry-edge-specific wording: the settlement path and the grievance
              // path both land on تحصيل but for different reasons.
              description: existing.currentStage === "انتظار_رد_التظلم"
                ? `تم قبول التظلم — يرجى إعداد خطاب التحصيل`
                : `تم الصلح في مداولة الصلح — يرجى إعداد خطاب التحصيل`,
              taskType: "متابعة_محكمة",
              caseId: updated.id,
              assignedTo: assignee,
              priority: "عاجل",
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
            },
            user.id,
          );
          await notifyFieldTaskCreated(collectionTask, user); // D4
        } catch (e) {
          console.error("Failed to auto-create collection task on conciliation settlement:", e);
        }
      }

      // Side effect for مداولة_الصلح → أغلق_طلب_الصلح on a defendant case: the
      // جوابية memo, in the SAME shape POST /api/cases would have created
      // (autoGenerateReason "قضية_مدعى_عليه"), now that litigation has resumed.
      if (shouldCreateSettlementFailedMemo) {
        try {
          // DUPLICATE GUARD — create only when the case has NO memo at all (any
          // status). Two things this protects:
          //  1. a case that did NOT start in settlement already got its memo at
          //     creation, and can still pass through مداولة_الصلح → أغلق_طلب_الصلح;
          //  2. a memo that someone deliberately cancelled via "لا يحتاج مذكرة"
          //     (status ملغاة) must NOT be resurrected here.
          // The suppressed cohort is precisely the one with zero memos.
          const caseMemos = await storage.getMemosByCase(updated.id);
          if (caseMemos.length === 0) {
            const deadlineStr = updated.responseDeadline
              || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const memo = await storage.createMemo({
              caseId: updated.id,
              hearingId: null,
              memoType: MemoType.RESPONSE,
              title: `مذكرة جوابية - ${updated.caseNumber}`,
              description: `مذكرة جوابية تلقائية لقضية مدعى عليه بعد تعذّر الصلح - ${updated.caseNumber}`,
              priority: updated.priority || "متوسط",
              // Unassigned sentinel is "" — memos.assigned_to is NOT NULL.
              assignedTo: updated.primaryLawyerId || updated.responsibleLawyerId || "",
              createdBy: "system",
              deadline: deadlineStr,
              isAutoGenerated: true,
              autoGenerateReason: "قضية_مدعى_عليه",
              status: MemoStatus.NOT_STARTED,
            });
            const activeCount = await getActiveMemoCount(updated.id);
            await storage.updateCase(updated.id, { activeMemoCount: activeCount });
            console.log("[settlement-failed] auto-created defendant memo", { caseId: updated.id, memoId: memo.id });
          }
        } catch (e) {
          console.error("Failed to auto-create defendant memo on settlement failure:", e);
        }
      }

      if (user && existing) {
        try {
          if (isDeptTransfer) {
            await logCaseActivityActing(req, {
              caseId: String(req.params.id),
              userId: user.id,
              userName: user.name || user.id,
              actionType: "department_transferred",
              title: `تم تحويل القضية من قسم إلى آخر`,
              previousValue: transferFromDeptId || "",
              newValue: req.body.departmentId,
              details: JSON.stringify({
                fromDeptId: transferFromDeptId || null,
                toDeptId: req.body.departmentId,
                reason: transferReason || null,
                fromStage: transferFromStage,
                previousInternalReviewerId: transferFromInternalReviewerId,
              }),
            });
          } else if (req.body.currentStage && req.body.currentStage !== existing.currentStage) {
            await logCaseActivityActing(req, {
              caseId: String(req.params.id),
              userId: user.id,
              userName: user.name || user.id,
              actionType: "stage_changed",
              title: `تم تغيير المرحلة من ${existing.currentStage} إلى ${req.body.currentStage}`,
              previousValue: existing.currentStage,
              newValue: req.body.currentStage,
            });
            // Settlement-only cases (isSettlementCase=true on InCourtSettlementStages)
            // hit a fork at مداولة_الصلح on "لم يتم الصلح": close the case, or
            // convert to the regular litigation path. Surface the choice as a
            // dedicated activity so the timeline shows the user's decision and
            // not just a generic stage_changed entry.
            if (
              existing.currentStage === "مداولة_الصلح" &&
              existing.isSettlementCase
            ) {
              if (req.body.currentStage === "مقفلة") {
                await logCaseActivityActing(req, {
                  caseId: String(req.params.id),
                  userId: user.id,
                  userName: user.name || user.id,
                  actionType: "settlement_failed_closed",
                  title: "لم يتم الصلح — تم إغلاق القضية نهائياً",
                });
              } else if (
                req.body.currentStage === "أغلق_طلب_الصلح" &&
                req.body.isSettlementCase === false
              ) {
                const prevClassification = existing.caseClassification || "منظورة_بالمحكمة";
                const newClassification = req.body.caseClassification || prevClassification;
                await logCaseActivityActing(req, {
                  caseId: String(req.params.id),
                  userId: user.id,
                  userName: user.name || user.id,
                  actionType: "settlement_failed_continued",
                  title: "لم يتم الصلح — تحويل القضية لمسار التقاضي العادي",
                  previousValue: prevClassification,
                  newValue: newClassification,
                  details: JSON.stringify({
                    stageFrom: "مداولة_الصلح",
                    stageTo: "أغلق_طلب_الصلح",
                    classificationFrom: prevClassification,
                    classificationTo: newClassification,
                  }),
                });
              }
            }
          } else {
            await logCaseActivityActing(req, {
              caseId: String(req.params.id),
              userId: user.id,
              userName: user.name || user.id,
              actionType: "case_updated",
              title: "تم تحديث بيانات القضية",
            });
          }
        } catch (e) {}
      }

      // Notify the active internal reviewer when transitioning into either
      // مراجعة_داخلية or مراجعة_داخلية_للتظلم (covers both the initial assignment
      // and re-entries after the lawyer revises following reviewer notes).
      // Use activeReviewerForNotification — that's the one set above (override
      // for this round if provided, otherwise the persisted intake reviewer).
      if (
        updated &&
        (req.body.currentStage === "مراجعة_داخلية" || req.body.currentStage === "مراجعة_داخلية_للتظلم") &&
        existing.currentStage !== req.body.currentStage &&
        activeReviewerForNotification
      ) {
        try {
          await storage.createNotification({
            type: "case_assigned",
            priority: "high",
            status: "pending",
            title: "إسناد مراجعة داخلية",
            message: `تم إسنادك لمراجعة القضية رقم ${updated.caseNumber} مراجعة داخلية`,
            senderId: user.id,
            senderName: user.name || user.id,
            recipientId: activeReviewerForNotification,
            requiresResponse: false,
            relatedType: "case",
            relatedId: String(req.params.id),
          });
        } catch (e) {
          console.error("[PATCH cases] internal reviewer notification failed", e);
        }
      }

      // Notify the new department head when a transfer lands
      if (isDeptTransfer && updated) {
        try {
          const allUsers = await storage.getAllUsers();
          const newDeptHead = allUsers.find((u: any) =>
            u.role === "department_head" && u.departmentId === req.body.departmentId && u.isActive
          );
          const notifyRecipient = newDeptHead || allUsers.find((u: any) =>
            u.role === "branch_manager" && u.isActive
          );
          if (notifyRecipient) {
            await storage.createNotification({
              type: "case_assigned",
              priority: "high",
              status: "pending",
              title: "تم تحويل قضية لقسمك",
              message: `تم تحويل القضية ${existing.caseNumber} إلى قسمك. يرجى إسناد محامٍ مسؤول لها.`,
              senderId: user.id,
              senderName: user.name || user.id,
              recipientId: notifyRecipient.id,
              requiresResponse: false,
              relatedType: "case",
              relatedId: String(req.params.id),
            });
          }
        } catch (e) {
          console.error("Error sending transfer notification:", e);
        }
      }

      // Cascade lawyer assignment to pending hearings and active memos.
      // Phase 5 B/L4 — the cascade now keys off the EFFECTIVE lawyer
      // (primaryLawyerId || responsibleLawyerId || "", the canonical
      // resolution) instead of primaryLawyerId alone, so assigning a case by
      // responsibleLawyerId only (no primary) also re-points its memos/hearings.
      // For the primary-set path this is byte-identical to the old behavior
      // (primary takes precedence); it only ADDS firing for the
      // responsibleLawyerId-is-effective case. Fires only when the effective
      // lawyer actually changes to a non-empty value.
      const newPrimaryLawyerId = req.body.primaryLawyerId !== undefined ? req.body.primaryLawyerId : existing.primaryLawyerId;
      const newResponsibleLawyerId = req.body.responsibleLawyerId !== undefined ? req.body.responsibleLawyerId : existing.responsibleLawyerId;
      const oldEffectiveLawyerId = existing.primaryLawyerId || existing.responsibleLawyerId || "";
      const newEffectiveLawyerId = newPrimaryLawyerId || newResponsibleLawyerId || "";
      if (newEffectiveLawyerId && newEffectiveLawyerId !== oldEffectiveLawyerId) {
        const caseId = String(req.params.id);
        const newLawyerId = newEffectiveLawyerId;
        try {
          const caseHearings = await storage.getHearingsByCase(caseId);
          for (const h of caseHearings) {
            if (h.status === "قادمة") {
              await storage.updateHearing(h.id, { attendingLawyerId: newLawyerId });
            }
          }
          const caseMemos = await storage.getMemosByCase(caseId);
          for (const m of caseMemos) {
            if (["لم_تبدأ", "قيد_التحرير", "تحتاج_تعديل"].includes(m.status)) {
              await storage.updateMemo(m.id, { assignedTo: newLawyerId });
            }
          }
        } catch (e) {
          console.error("Error cascading lawyer assignment:", e);
        }
      }

      // Handle related entities when case is closed/archived. The body moved to
      // cancelOpenCaseChildrenOnClose (verbatim) so the judgment-close path
      // applies the identical cleanup instead of leaving orphans behind.
      if (req.body.currentStage === "مقفلة" && existing.currentStage !== "مقفلة") {
        await cancelOpenCaseChildrenOnClose(String(req.params.id));
      }

      res.json(updated);
    } catch (error) {
      console.error("[PATCH /api/cases/:id] Unhandled error:", error);
      res.status(500).json({ error: "حدث خطأ في تحديث القضية" });
    }
  });

  app.delete("/api/cases/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      const deleted = await storage.deleteCase(String(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف القضية" });
    }
  });

  // ==================== Clients ====================

  app.get("/api/clients", requireAuth, async (req, res) => {
    try {
      const clients = await storage.getAllClients();
      res.json(clients);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب العملاء" });
    }
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClientById(String(req.params.id));
      if (!client) {
        return res.status(404).json({ error: "العميل غير موجود" });
      }
      res.json(client);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب العميل" });
    }
  });

  app.post("/api/clients", requireAuth, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertClientSchema.parse(req.body);
      // Phase 5 A2/L3 — createdBy is the actor; derive from req.user, never the
      // body. The FE already sends user.id, so the stored value is unchanged.
      const createdBy = req.user!.id;
      const newClient = await storage.createClient(validatedData, createdBy);
      res.status(201).json(newClient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء العميل" });
    }
  });

  app.patch("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const partialClientSchema = insertClientSchema.partial();
      const validatedData = partialClientSchema.parse(req.body);
      const updated = await storage.updateClient(String(req.params.id), validatedData);
      if (!updated) {
        return res.status(404).json({ error: "العميل غير موجود" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في تحديث العميل" });
    }
  });

  app.delete("/api/clients/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      await storage.deleteClient(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف العميل" });
    }
  });

  // ==================== Consultations ====================

  app.get("/api/consultations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) {
        return res.status(401).json({ error: "يجب تسجيل الدخول" });
      }

      const allConsultations = await storage.getAllConsultations();
      const { role } = user;

      // 🔴 THE LIST NO LONGER NARROWS BY DEPARTMENT (2026-07-28).
      //
      // It used to return only own-department rows to department_head, and
      // own-department-or-assigned rows to employee. That made "كل الأقسام" a
      // LIE for those two roles: the filter read "all departments" while the
      // server had already cut the rows, so a dept head saw one department and
      // could not tell why.
      //
      // ⚠ CONSULTATIONS WAS THE ONLY ENTITY DOING THIS. Verified against all
      // four siblings — GET /api/cases, /api/contracts, /api/memos and
      // /api/hearings ALL return every row and let the client filter. There was
      // no comment or spec justifying the divergence; it was inconsistency, not
      // design.
      //
      // The model (owner-confirmed): the LIST returns everything the user may
      // SEE, and the filter is the user's own choice. SEEING another
      // department's consultation is not ACTING on it — every mutating endpoint
      // is separately gated (canModifyConsultation, the tiered helper, the
      // per-action carve-outs), and none of that is touched here.
      //
      // VIEW ALLOWLIST is still enforced, so this widens WHO SEES ALL ROWS, not
      // who sees consultations at all: hr / technical_support keep their 403.
      //
      // labor_review_head ADDED — it was missing and therefore 403'd on the
      // list, even though canModifyConsultationIdentity already lets it act on
      // its own department's consultations. A role that can modify a record it
      // cannot load is a plain bug; it arrived with the e1f6569 labor-committee
      // work that was merged in from main.
      const CONSULTATION_VIEWER_ROLES = [
        "branch_manager",
        "admin_support",
        "consultations_review_head",
        "cases_review_head",
        "labor_review_head",
        "viewer",
        "department_head",
        "employee",
      ];
      if (!CONSULTATION_VIEWER_ROLES.includes(role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لعرض الاستشارات" });
      }
      return res.json(allConsultations);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الاستشارات" });
    }
  });

  app.get("/api/consultations/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      const user = req.user!;
      if (!canModifyConsultation(user, consultation, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه الاستشارة" });
      }
      res.json(consultation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الاستشارة" });
    }
  });

  app.post("/api/consultations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      // SECURITY (audit R8) — this route was requireAuth-ONLY: any authenticated
      // user could create a consultation with a hand-rolled POST. The UI has
      // always gated the "استشارة جديدة" button on
      // permissions.canAddCasesAndConsultations, so the server now enforces the
      // SAME shared predicate the FE reads (branch_manager | admin_support)
      // rather than an inline copy — the two can no longer drift apart.
      // POST /api/cases enforces the identical set (inline, :2149).
      // department_head is deliberately NOT added: widening creation rights is
      // permissions work, not a security fix.
      // CREATE-SCOPE — department_head AND employee may open a consultation, but only
      // into THEIR OWN department; canAddCasesAndConsultations (branch_manager |
      // admin_support) stays global. Same forced-vs-rejected split as POST /api/cases.
      if (
        !canAddCasesAndConsultations(reqUser.role)
        && !["department_head", "employee"].includes(reqUser.role)
      ) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإنشاء الاستشارات" });
      }
      const consultScope = scopedCreateDepartmentId(reqUser, req.body?.departmentId);
      if (!consultScope.ok) {
        return res.status(400).json({ error: consultScope.error });
      }
      req.body.departmentId = consultScope.departmentId;
      const validatedData = insertConsultationSchema.parse(req.body);
      // Phase-6: prefer the authenticated user id over the body-provided
      // createdBy so the activity log's performedBy is always the real
      // actor. Fall back for legacy clients that still pass it explicitly.
      const createdBy = reqUser?.id || req.body.createdBy || "unknown";
      const newConsultation = await storage.createConsultation(validatedData, createdBy);
      await notifyDepartmentHeadOfNewRecord({
        entityType: "consultation",
        entityId: newConsultation.id,
        label: newConsultation.consultationNumber,
        departmentId: newConsultation.departmentId,
        actorId: createdBy,
        actorName: reqUser.name || createdBy,
      });
      res.status(201).json(newConsultation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      const msg = (error as any)?.message || "";
      if (msg === "DUPLICATE_CONSULTATION_NUMBER") {
        return res.status(400).json({ error: "تعذّر توليد رقم استشارة فريد، يرجى المحاولة مرة أخرى" });
      }
      console.error("[POST /api/consultations] error:", error);
      res.status(500).json({ error: "حدث خطأ في إنشاء الاستشارة" });
    }
  });

  app.patch("/api/consultations/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const existing = await storage.getConsultationById(String(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      if (!canModifyConsultation(user, existing, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه الاستشارة" });
      }

      // 2D'-V1b Pattern-A gate: validate types only, then keep using
      // req.body untouched (the handler mutates it downstream).
      const bodyCheck = updateConsultationSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      // Validate stage transition if changing status
      if (req.body.status && req.body.status !== existing.status) {
        // 4c-3: consultations act-as enabled — canModifyConsultation above and
        // this transition check both consult the acting context. Four-eyes: the
        // /internal-review author-exclusion + designated-reviewer checks stay human.
        const stageCheck = validateStageTransition(existing.status, req.body.status, user.role, "consultation", user, existing, req.actingContext);
        if (!stageCheck.allowed) {
          return res.status(400).json({ error: stageCheck.reason });
        }
      }

      // Validate assignedTo user is active if being changed
      if (req.body.assignedTo) {
        const { valid } = await validateAssignedUsersActive([req.body.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "المستخدم المسند إليه غير نشط أو غير موجود" });
        }
      }

      // Internal reviewer assignment mirrors cases / memos: gated to
      // department_head (own dept — already enforced by canModifyConsultation),
      // admin_support, branch_manager. Assigned-lawyer / creator can pass
      // canModifyConsultation but cannot pick the reviewer; we silently
      // strip the field for them rather than 403'ing the whole request,
      // matching the consultationType handling below. Validate the
      // referenced user is active when actually setting (null is allowed —
      // it's the "unassign" case).
      if (req.body.internalReviewerId !== undefined) {
        const allowedReviewerSetters = ["branch_manager", "admin_support", "department_head"];
        if (!allowedReviewerSetters.includes(user.role)) {
          delete req.body.internalReviewerId;
        } else if (req.body.internalReviewerId) {
          const { valid } = await validateAssignedUsersActive([req.body.internalReviewerId]);
          if (!valid) {
            return res.status(400).json({ error: "المراجع الداخلي المختار غير نشط أو غير موجود" });
          }
        }
      }

      // Consultation-type change is a workflow-impacting edit — restricted
      // to branch_manager / admin_support / department_head (own dept,
      // already enforced by canModifyConsultation above), validated to
      // the 3-value enum, and always paired with a stage remap +
      // dedicated activity-log entry. Assigned-lawyer / creator can pass
      // canModifyConsultation but are NOT allowed to change the type;
      // we strip the field for them rather than 403 the whole request,
      // since the rest of the body may be a legitimate edit.
      let typeChange: { from: string; to: string; fromStage: string; toStage: string; remapped: boolean } | null = null;
      if (
        req.body.consultationType !== undefined
        && req.body.consultationType !== existing.consultationType
      ) {
        const newType = String(req.body.consultationType);
        const validTypes = Object.values(ConsultationType) as string[];
        const allowedRoles = ["branch_manager", "admin_support", "department_head"];
        if (!allowedRoles.includes(user.role)) {
          // Drop the field silently for unauthorised actors so they can
          // still edit other fields they're allowed to touch.
          delete req.body.consultationType;
        } else if (!validTypes.includes(newType)) {
          return res.status(400).json({ error: "نوع الاستشارة غير صحيح" });
        } else {
          const remapped = remapConsultationStageForType(
            existing.currentStage,
            newType as ConsultationTypeValue,
          );
          typeChange = {
            from: existing.consultationType,
            to: newType,
            fromStage: existing.currentStage,
            toStage: remapped,
            remapped: remapped !== existing.currentStage,
          };
          // Always persist currentStage explicitly — even when the value
          // is unchanged this keeps the transactional update + activity
          // log self-contained and avoids relying on a separate write.
          req.body.currentStage = remapped;
        }
      }

      // "تعديل البيانات" — record-level correction. Detect changes to the
      // CORRECTABLE fields only (client / question / source): the inline
      // committee editors (priority, priorityReason, internalReviewerId) come
      // through this same PATCH and already have their own entries, so logging
      // every PATCH would double-log them. typeChange keeps its dedicated entry
      // and wins when both happen in one request — it is the more significant
      // event and carries the stage remap.
      // Explicit per-field comparison rather than a keyof-indexed loop: it needs
      // no cast to index `existing`, and the three fields are the whole list.
      const changedDetailFields: string[] = [];
      if (req.body.clientId !== undefined && req.body.clientId !== existing.clientId) {
        changedDetailFields.push("العميل");
      }
      if (req.body.title !== undefined && (req.body.title ?? null) !== existing.title) {
        changedDetailFields.push("العنوان");
      }
      if (req.body.questionSummary !== undefined && req.body.questionSummary !== existing.questionSummary) {
        changedDetailFields.push("ملخص السؤال");
      }
      if (req.body.category !== undefined && req.body.category !== existing.category) {
        changedDetailFields.push("تصنيف المدة");
      }
      if (req.body.source !== undefined && req.body.source !== existing.source) {
        changedDetailFields.push("مصدر الاستشارة");
      }

      let updated;
      if (typeChange) {
        const fromTypeLabel = (ConsultationTypeLabels as Record<string, string>)[typeChange.from] || typeChange.from;
        const toTypeLabel = (ConsultationTypeLabels as Record<string, string>)[typeChange.to] || typeChange.to;
        const fromStageLabel = (ConsultationStageLabels as Record<string, string>)[typeChange.fromStage] || typeChange.fromStage;
        const toStageLabel = (ConsultationStageLabels as Record<string, string>)[typeChange.toStage] || typeChange.toStage;
        const description = typeChange.remapped
          ? `تغيير النوع من ${fromTypeLabel} إلى ${toTypeLabel} — أُعيد ضبط المرحلة من ${fromStageLabel} إلى ${toStageLabel}`
          : `تغيير النوع من ${fromTypeLabel} إلى ${toTypeLabel}`;
        updated = await storage.updateConsultationAndLog(
          String(req.params.id),
          req.body,
          {
            activityType: ConsultationActivityType.TYPE_CHANGED,
            description,
            metadata: {
              from: typeChange.from,
              to: typeChange.to,
              fromStage: typeChange.fromStage,
              toStage: typeChange.toStage,
              stageRemapped: typeChange.remapped,
            },
            performedBy: user.id,
          },
        );
      } else if (changedDetailFields.length > 0) {
        updated = await storage.updateConsultationAndLog(
          String(req.params.id),
          req.body,
          {
            activityType: ConsultationActivityType.DETAILS_EDITED,
            description: `تعديل البيانات — ${changedDetailFields.join("، ")}`,
            metadata: { fields: changedDetailFields },
            performedBy: user.id,
          },
        );
      } else {
        updated = await storage.updateConsultation(String(req.params.id), req.body);
      }
      if (!updated) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      console.error("[PATCH /api/consultations/:id] error:", error);
      res.status(500).json({ error: "حدث خطأ في تحديث الاستشارة" });
    }
  });

  app.delete("/api/consultations/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      await storage.deleteConsultation(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الاستشارة" });
    }
  });

  // ==================== Consultation workflow endpoints (rebuild §3.2.2) ====================

  // POST /api/consultations/:id/assign
  // Body: { assignedTo, notes? }. Sets assignedTo. Stage is NOT
  // auto-advanced — keeping assignment and stage transitions as
  // independent actions. The assigned lawyer (or dept_head / admin /
  // branch_manager) drives the stage forward via /advance-stage when
  // they're ready. Allowed roles: WRITTEN — admin_support,
  // department_head, branch_manager; PHONE / PROCEDURAL —
  // department_head, branch_manager only.
  app.post("/api/consultations/:id/assign", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = assignConsultationSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { assignedTo } = req.body || {};
      if (!assignedTo || typeof assignedTo !== "string") {
        return res.status(400).json({ error: "assignedTo مطلوب" });
      }

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      // 🔴 PART 4 — admin_support now assigns EVERY consultation type, in every
      // department (owner ruling). The list used to branch on the resolved type,
      // admitting admin_support for مكتوبة only and 403-ing them on هاتفية and
      // إجرائية — the single genuine gap in "admin_support assigns everything";
      // they already pass every other assignment gate in the app (cases, memos,
      // contracts, field tasks). The type branch is gone, so ONE list serves both
      // paths. department_head and branch_manager are unchanged and no other role
      // gains anything: the set is a strict superset of the old one by exactly
      // admin_support-on-non-written.
      const allowedRoles = ["admin_support", "department_head", "branch_manager"];
      if (!allowedRoles.includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإسناد الاستشارات" });
      }
      // Phase 8 F4 — dept-head scope, mirroring contracts /assign: a
      // dept_head may only assign consultations in their OWN department.
      if (
        reqUser.role === "department_head"
        && consultation.departmentId !== reqUser.departmentId
      ) {
        return res.status(403).json({ error: "رئيس القسم يمكنه إسناد استشارات قسمه فقط" });
      }

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      const { valid } = await validateAssignedUsersActive([assignedTo]);
      if (!valid) return res.status(400).json({ error: "المستخدم المسند إليه غير نشط أو غير موجود" });

      const lawyer = await storage.getUser(assignedTo);
      const lawyerName = lawyer?.name || assignedTo;

      // 🔴 PART 1 — THE القسم CONTROL NOW TRANSFERS, instead of only filtering the
      // lawyer list. The dialog has always shown a department picker; it was
      // never sent, so choosing another department moved nobody and the
      // consultation stayed put while the assignee changed — landing (say) a
      // Labor consultation on a Commercial lawyer. That was the reported bug.
      //
      // OPTIONAL AND BACKWARD-COMPATIBLE: a body without departmentId assigns
      // exactly as before, so every other caller of this endpoint is unaffected.
      const requestedDeptId = typeof req.body?.departmentId === "string" ? req.body.departmentId.trim() : "";
      const isTransfer = !!requestedDeptId && requestedDeptId !== consultation.departmentId;
      if (requestedDeptId) {
        const targetDept = await storage.getDepartmentById(requestedDeptId);
        if (!targetDept) return res.status(400).json({ error: "القسم المحدد غير موجود" });
      }

      // 🔴 WHAT MOVES WITH THE DEPARTMENT — deliberately NOT the case path's
      // full reset, which would destroy work here:
      //   • currentStage — NOT reset. The case transfer sends a case back to
      //     استلام so the new department starts fresh, but a case transfer is a
      //     BARE move; this is a move WITH an assignment, and a consultation
      //     already at تحرير or لجنة_مراجعة would lose every stage it had earned.
      //   • assignedTo — obviously NOT cleared: this same request sets it. The
      //     case path only clears lawyers because isDeptTransfer is defined to
      //     EXCLUDE a simultaneous assignment (routes.ts, "a body that moved the
      //     case AND set responsibleLawyerId was previously treated as a bare
      //     transfer, so the clear-out below wiped the lawyer the same request
      //     had just assigned").
      //   • internalReviewerId — CLEARED, and this one DOES carry over from the
      //     case path, for the reason recorded there: the reviewer was chosen
      //     from the SOURCE department's roster and is not a valid reviewer for
      //     the destination. Leaving them would also hand a reviewer from the old
      //     department live authority over a record that is no longer theirs,
      //     which is the cross-department leak this whole change exists to close.
      //     It loses a designation, not work product; the new department's head
      //     re-picks one.
      //
      // ⚠ NO REASON IS RECORDED, unlike the case transfer, because this dialog
      // has no reason field and adding a mandatory one is a product decision.
      // The activity row still names both departments and the actor.
      //
      // 🔴 THE CASE-SIDE COLLISION HAZARD DOES NOT EXIST HERE, and not by luck:
      // there is no isDeptTransfer flow on this endpoint and none in the
      // consultation PATCH either, so nothing rewrites the body behind us. Both
      // fields go into ONE updateConsultationAndLog call — a single UPDATE — so
      // there is no second write that could clobber the first.
      const updateFields: Record<string, unknown> = { assignedTo };
      if (isTransfer) {
        updateFields.departmentId = requestedDeptId;
        updateFields.internalReviewerId = null;
      }

      const updated = await storage.updateConsultationAndLog(consultation.id, updateFields, {
        activityType: ConsultationActivityType.ASSIGNED,
        description: `تم إسناد الاستشارة لـ ${lawyerName}`,
        metadata: { assignedTo, lawyerName },
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل تحديث الاستشارة" });

      // The transfer gets its OWN activity row, in addition to the assignment
      // one, so the timeline reads as the two distinct facts it is. Written
      // after the update succeeded, and non-fatal — a logging failure must never
      // undo an assignment that already landed.
      if (isTransfer) {
        try {
          const fromName = (await storage.getDepartmentById(consultation.departmentId))?.name || consultation.departmentId;
          const toName = (await storage.getDepartmentById(requestedDeptId))?.name || requestedDeptId;
          await storage.createConsultationActivity({
            consultationId: consultation.id,
            activityType: ConsultationActivityType.DEPARTMENT_TRANSFERRED,
            description: `تم تحويل الاستشارة من ${fromName} إلى ${toName}`,
            metadata: { fromDepartmentId: consultation.departmentId, toDepartmentId: requestedDeptId, fromName, toName },
            performedBy: reqUser.id,
          });
        } catch (e) {
          console.error("[consultations/assign] transfer activity log failed:", e);
        }
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/advance-stage
  // Body: { targetStage }. Generic forward via validateStageTransition.
  // Used for transitions where no dedicated endpoint applies. The dedicated
  // endpoints (internal-review, committee-decision, take-notes-outcome) are
  // preferred where they apply because they also record helper-table rows.
  app.post("/api/consultations/:id/advance-stage", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowTargetStageSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const targetStage = String(req.body?.targetStage || "");
      if (!targetStage) return res.status(400).json({ error: "targetStage مطلوب" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      const check = validateStageTransition(
        consultation.currentStage,
        targetStage,
        reqUser.role,
        "consultation",
        reqUser,
        consultation,
        // 4c-3: consultations act-as enabled. Four-eyes stays human in the
        // dedicated /internal-review + committee endpoints (not here).
        req.actingContext,
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });

      const fromLabel = ConsultationStageLabels[consultation.currentStage] || consultation.currentStage;
      const toLabel = (ConsultationStageLabels as Record<string, string>)[targetStage] || targetStage;
      // All three types reach CLOSED_FINAL via /advance-stage now:
      // WRITTEN via READY → CLOSED_FINAL (Issue-3 fix), PHONE/PROCEDURAL
      // via COMPLETED → CLOSED_FINAL, and any type via its follow-up
      // cycle's terminal step. Flip status='closed' + stamp closedAt
      // here so the row drops out of "active" lists uniformly.
      const reachedFinalClosure = targetStage === ConsultationStage.CLOSED_FINAL;
      const stageUpdate: any = { currentStage: targetStage };
      if (reachedFinalClosure) {
        stageUpdate.status = "closed";
        stageUpdate.closedAt = new Date();
      }

      // Entering internal review requires a designated reviewer — mirrors the
      // case flow (PATCH /api/cases/:id, "موعد للمرحلة"): use the one already on
      // the consultation if set, else the one chosen now (req.body), and
      // persist it so the internal-review action is gated to that reviewer
      // below. Four-eyes: the reviewer can't be the assigned (answering) lawyer.
      if (targetStage === ConsultationStage.INTERNAL_REVIEW) {
        const overrideReviewer =
          (typeof req.body?.internalReviewerId === "string" && req.body.internalReviewerId)
            ? req.body.internalReviewerId
            : undefined;
        const reviewerId = overrideReviewer || consultation.internalReviewerId || undefined;
        if (!reviewerId) {
          return res.status(400).json({ error: "يجب اختيار المراجع الداخلي قبل الانتقال للمرحلة" });
        }
        const reviewer = await storage.getUser(reviewerId);
        if (!reviewer || !reviewer.isActive) {
          return res.status(400).json({ error: "المراجع الداخلي المختار غير صالح" });
        }
        if (reviewer.role === "admin_support") {
          return res.status(400).json({ error: "لا يمكن اختيار الدعم الإداري كمراجع داخلي" });
        }
        if (reviewer.departmentId !== consultation.departmentId) {
          return res.status(400).json({ error: "المراجع الداخلي يجب أن يكون من نفس قسم الاستشارة" });
        }
        if (reviewerId === consultation.assignedTo) {
          return res.status(400).json({ error: "لا يمكن أن يكون المراجع الداخلي هو المحامي المسند إليه للاستشارة" });
        }
        // Persist (bootstrap or re-designate) so the internal-review gate works.
        stageUpdate.internalReviewerId = reviewerId;
      }

      const updated = await storage.updateConsultationAndLog(
        consultation.id,
        stageUpdate,
        {
          activityType: ConsultationActivityType.STAGE_ADVANCED,
          description: `انتقال من ${fromLabel} إلى ${toLabel}`,
          metadata: { fromStage: consultation.currentStage, toStage: targetStage, ...(reachedFinalClosure ? { closedViaFinalStage: true } : {}) },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل تحديث الاستشارة" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/return-stage
  // Body: { targetStage }. Generic backward — validateStageTransition's
  // rollback block enforces: dept_head/branch_manager can return to any
  // prior stage, assigned_lawyer can return one step.
  app.post("/api/consultations/:id/return-stage", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowTargetStageSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const targetStage = String(req.body?.targetStage || "");
      if (!targetStage) return res.status(400).json({ error: "targetStage مطلوب" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      const check = validateStageTransition(
        consultation.currentStage,
        targetStage,
        reqUser.role,
        "consultation",
        reqUser,
        consultation,
        // 4c-3: consultations act-as enabled. Four-eyes stays human in the
        // dedicated /internal-review + committee endpoints (not here).
        req.actingContext,
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });

      const fromLabel = ConsultationStageLabels[consultation.currentStage] || consultation.currentStage;
      const toLabel = (ConsultationStageLabels as Record<string, string>)[targetStage] || targetStage;
      const updated = await storage.updateConsultationAndLog(
        consultation.id,
        { currentStage: targetStage as ConsultationStageValue },
        {
          activityType: ConsultationActivityType.STAGE_RETURNED,
          description: `إرجاع من ${fromLabel} إلى ${toLabel}`,
          metadata: { fromStage: consultation.currentStage, toStage: targetStage },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل تحديث الاستشارة" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/internal-review
  // Body: { decision, notes }. Inserts a consultation_reviews row, then
  // routes the stage:
  //   PASSED      -> COMMITTEE
  //   NEEDS_NOTES -> DRAFTING
  //   RESUBMITTED -> DRAFTING
  // Allowed roles: assigned_lawyer (synthetic) + employee, department_head,
  // cases_review_head, consultations_review_head, branch_manager. The strict
  // "actor must be the active review cycle's reviewer" check is deferred —
  // the codebase has no active-reviewer tracking column yet. TODO: tighten
  // once that tracking lands (likely a small column add on consultations).
  app.post("/api/consultations/:id/internal-review", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowDecisionSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const notes = String(req.body?.notes || "");
      const valid = (Object.values(InternalReviewDecision) as string[]).includes(decision);
      if (!valid) return res.status(400).json({ error: "قرار المراجعة غير صحيح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      if (consultation.currentStage !== ConsultationStage.INTERNAL_REVIEW) {
        return res.status(400).json({ error: "الاستشارة ليست في مرحلة المراجعة الداخلية" });
      }

      // Four-eyes (Phase 5 B/M1) — the assigned (answering) lawyer can never
      // clear their own consultation's internal review. Kept as belt-and-braces
      // (the reviewer designation below already excludes the assignee).
      if (isAssignedLawyer(reqUser, consultation)) {
        return res.status(403).json({ error: "لا يمكن للمحامي المسند إليه اعتماد المراجعة الداخلية لاستشارته؛ يجب أن يقوم بها مراجع آخر" });
      }
      // Mirror cases (validateStageTransition INTERNAL_REVIEW lock): only the
      // DESIGNATED internal reviewer or branch_manager may act. internalReviewerId
      // is now required when entering this stage (see /advance-stage), so a
      // normally-routed consultation always has one; a legacy row with no
      // reviewer stays actionable by branch_manager (who can also re-route it).
      const isDesignatedReviewer =
        !!consultation.internalReviewerId && consultation.internalReviewerId === reqUser.id;
      // WIDENED MODEL — an own-department department_head may also record the
      // decision, because branch_manager can and a head is "branch_manager scoped to
      // their department". FOUR-EYES HOLDS (carve-out 2): the assignee check above
      // already returned 403, so a head who is themselves the answering lawyer never
      // reaches this line. HUMAN role only — not delegation-expanded, so a delegation
      // can never manufacture the second pair of eyes.
      const isOwnDeptHeadReviewer =
        reqUser.role === "department_head"
        && !!reqUser.departmentId
        && !!consultation.departmentId
        && consultation.departmentId === reqUser.departmentId;
      if (!isDesignatedReviewer && !isOwnDeptHeadReviewer && reqUser.role !== "branch_manager") {
        return res.status(403).json({ error: "فقط المراجع الداخلي المعيَّن أو رئيس القسم أو مدير الفرع يمكنه اعتماد المراجعة الداخلية لهذه الاستشارة" });
      }

      // Rejection returns the consultation to the merged «الدراسة والتحرير»
      // stage (stored value: دراسة). Twin of the INTERNAL_REVIEW→STUDY edge in
      // ALLOWED_CONSULTATION_TRANSITIONS — keep the two in step.
      const nextStage = decision === InternalReviewDecision.PASSED
        ? ConsultationStage.COMMITTEE
        : ConsultationStage.STUDY;

      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `مراجعة داخلية: ${decision} — ${truncatedNotes}`
        : `مراجعة داخلية: ${decision}`;

      const result = await storage.recordConsultationInternalReview({
        consultationId: consultation.id,
        reviewerId: reqUser.id,
        decision,
        notes,
        nextStage,
        activity: {
          description,
          metadata: { decision, notes, reviewerId: reqUser.id },
          performedBy: reqUser.id,
        },
      });
      // AFTER the transition — recordConsultationInternalReview has returned, so
      // the stage has already moved. PASSED sent it to the committee (tell the
      // chair); NEEDS_NOTES sent it back to drafting (tell the answering
      // lawyer). Mirrors the two case events, which fire from the equivalent
      // internal-review decision.
      await notifyConsultationWorkflow({
        event: decision === InternalReviewDecision.PASSED ? "sent_to_review" : "returned_for_revision",
        consultation,
        notes,
        actorId: reqUser.id,
        actorName: reqUser.name,
      });
      res.json({ review: result.review, consultation: result.consultation });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/committee-decision
  // Body: { decision, notes }. Inserts a consultation_committee_decisions
  // row, then routes the stage:
  //   APPROVED    -> READY
  //   NEEDS_NOTES -> TAKING_NOTES
  // Allowed roles: consultations_review_head, branch_manager.
  app.post("/api/consultations/:id/committee-decision", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 4c-7: committee decisions INHERIT. A delegate inheriting the committee
      // chair role (consultations_review_head) or branch_manager may decide.
      // Scope is null — consultations carry no caseId, so only all_cases
      // delegations apply. No delegation → exactly the own-role check (parity).
      const ctx = req.actingContext;
      const ownRoleDecides = ["consultations_review_head", "labor_review_head", "branch_manager"].includes(reqUser.role);
      if (!ownRoleDecides && !(ctx && hasEffectiveRole(ctx, null, "consultations_review_head", "labor_review_head", "branch_manager"))) {
        return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowDecisionSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const notes = String(req.body?.notes || "");
      const valid = (Object.values(CommitteeDecision) as string[]).includes(decision);
      if (!valid) return res.status(400).json({ error: "قرار اللجنة غير صحيح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      if (consultation.currentStage !== ConsultationStage.COMMITTEE) {
        return res.status(400).json({ error: "الاستشارة ليست في مرحلة لجنة المراجعة" });
      }

      // Labor consultations are chaired by labor_review_head EXCLUSIVELY; all
      // others by consultations_review_head. branch_manager always. This is the
      // authoritative department gate (the fast-deny above only avoids a wasted load).
      {
        const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
        const committeeHead = (!!laborDeptId && consultation.departmentId === laborDeptId)
          ? "labor_review_head" : "consultations_review_head";
        const headDecides = [committeeHead, "branch_manager"].includes(reqUser.role);
        if (!headDecides && !(ctx && hasEffectiveRole(ctx, null, committeeHead, "branch_manager"))) {
          return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
        }
      }

      // FOUR-EYES (HUMAN-only; delegation-derived authority only): a delegate
      // standing in for the review head may NOT decide a committee on a
      // consultation they (REAL id) authored / are the assigned lawyer of.
      // Gated on !ownRoleDecides so a real review head is byte-identical
      // (this endpoint has no own-role author-exclusion today). Real human id.
      if (!ownRoleDecides && isAssignedLawyer(reqUser, consultation)) {
        return res.status(403).json({ error: "لا يمكنك اعتماد قرار اللجنة على عمل أنت محرّره" });
      }

      const nextStage = decision === CommitteeDecision.APPROVED
        ? ConsultationStage.READY
        : ConsultationStage.TAKING_NOTES;

      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `قرار اللجنة: ${decision} — ${truncatedNotes}`
        : `قرار اللجنة: ${decision}`;

      const result = await storage.recordConsultationCommitteeDecision({
        consultationId: consultation.id,
        decision,
        notes,
        decidedBy: reqUser.id,
        nextStage,
        activity: {
          description,
          metadata: { decision, notes, decidedBy: reqUser.id },
          performedBy: reqUser.id,
        },
      });
      // AFTER the transition. Only the NEEDS_NOTES branch notifies: it returns
      // the consultation to الأخذ_بالملاحظات for the answering lawyer to act on,
      // which is the second of the two case-side "returned for revision"
      // triggers (cases fire it from the committee's taking-notes return too).
      // APPROVED is deliberately silent — the case side has no notice for it
      // either, and the consultation_closing task already surfaces the result.
      if (decision === CommitteeDecision.NEEDS_NOTES) {
        await notifyConsultationWorkflow({
          event: "returned_for_revision",
          consultation,
          notes,
          actorId: reqUser.id,
          actorName: reqUser.name,
        });
      }
      res.json({ decision: result.decision, consultation: result.consultation });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/skip-committee
  // Body: { reason }. REASONED OVERRIDE — "تجاوز لجنة المراجعة". Moves the
  // consultation from لجنة_مراجعة straight to جاهزة_للإرسال with NO committee
  // decision, recording who did it and why in consultation_activity_log (reason
  // is MANDATORY). Entity 3 of 4 — mirrors the cases (76eea3c/193649a) and memo
  // (acd9c93) skips.
  //
  // Deliberately bypasses validateStageTransition — the same precedent the
  // committee-decision path above already sets (compute the target stage and
  // call storage directly). No transition-table entry is added, so this override
  // cannot be reached through POST /api/consultations/:id/advance-stage.
  //
  // ORIGIN is the committee stage ONLY (never مراجعة_داخلية), so the four-eyes
  // internal-review lock is untouched.
  //
  // WRITTEN-ONLY — this guard is REQUIRED here, unlike memos (which have one
  // unconditional stage array). It is the direct analogue of the cases-side
  // قيد_الدراسة guard (193649a):
  //   * only ALLOWED_CONSULTATION_TRANSITIONS (written) contains a COMMITTEE
  //     rule; ALLOWED_CONSULTATION_TRANSITIONS_PHONE/_PROCEDURAL have none, so
  //     those types cannot REACH the committee stage through /advance-stage; and
  //   * the target, ConsultationStage.READY (جاهزة_للإرسال), does not exist on
  //     ConsultationStagesOrderPhone/Procedural at all (they run RECEIVED →
  //     PENDING_COMPLETION → STUDY|IN_PROGRESS → COMPLETED → CLOSED_FINAL).
  // So the currentStage check ALONE is not a safe guard: any phone/procedural
  // row that is somehow parked at لجنة_مراجعة — raw seed/SQL that bypassed the
  // state machine (the cases T-1010 precedent), or a type change made before the
  // remap at ~3228 existed — would be moved to a stage that is OFF ITS OWN PATH
  // and stranded. resolveConsultationType is used (not a raw === compare) so
  // legacy free-text types resolve to WRITTEN exactly as the workflow engine
  // resolves them — the guard can never disagree with the transition table.
  //
  // AUTHORIZED ROLES (owner decision, 2026-07): branch_manager + department_head
  // (of the consultation's OWN department — consultations carry departmentId
  // directly, unlike memos) + the assigned lawyer. This is INTENTIONALLY BROADER
  // than the committee-DECISION role set (consultations_review_head +
  // branch_manager, above). Skipping the committee is an owner-approved
  // override, not a committee decision, so it answers to a different, wider
  // authority. Do NOT "harmonise" this set with the committee chairs — the
  // divergence is the point.
  //
  // FOUR-EYES DOES NOT APPLY HERE, by design. The committee-decision endpoint's
  // four-eyes check stops a DELEGATE approving work they authored; here the
  // assigned lawyer — i.e. the author — is an EXPLICITLY authorized actor, so
  // such a check would contradict the approved permission model. The mandatory
  // reason + the audit row are the control instead.
  app.post("/api/consultations/:id/skip-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب تجاوز اللجنة مطلوب" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }
      // Stricter than committee-decision (which checks status only): a paused or
      // awaiting-completion consultation must not be advanced. Matches the
      // cases/memo skip endpoints, which both guard this pair.
      if (consultation.pausedAt || consultation.awaitingCompletion) {
        return res.status(400).json({ error: "الاستشارة في حالة لا تسمح بتجاوز اللجنة" });
      }
      if (consultation.currentStage !== ConsultationStage.COMMITTEE) {
        return res.status(400).json({ error: "الاستشارة ليست في مرحلة لجنة المراجعة" });
      }
      // WRITTEN-only — see the block comment above. Defense-in-depth: the stage
      // check above should already exclude these types, but a stranded row must
      // not be movable to a stage its own workflow does not contain.
      if (resolveConsultationType(consultation.consultationType) !== ConsultationType.WRITTEN) {
        return res.status(400).json({ error: "تجاوز اللجنة متاح للاستشارات المكتوبة فقط" });
      }

      // Delegation-aware: evaluate the rule against every acting identity (self +
      // any delegator this user currently stands in for). Scope is null —
      // consultations carry no caseId, so only all_cases delegations apply
      // (same as the committee-decision endpoint above). With no delegation this
      // resolves to exactly the actor → byte-identical to a plain self-check.
      const identities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, null).map((i) => ({
            id: i.userId, role: i.role, departmentId: i.departmentId,
          }))
        : [{ id: reqUser.id, role: reqUser.role, departmentId: reqUser.departmentId }];
      const allowed = identities.some((u) =>
        u.role === "branch_manager"
        || (u.role === "department_head" && !!u.departmentId && consultation.departmentId === u.departmentId)
        || isAssignedLawyer({ id: u.id }, consultation));
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتجاوز لجنة المراجعة" });
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, null, performer?.name || reqUser.id);
      const updated = await storage.skipConsultationCommittee(consultation.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل تجاوز لجنة المراجعة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/skip-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/consultations/:id/take-notes-outcome
  // Body: { outcome, notes }. Inserts a consultation_note_outcomes row.
  // Per spec §3.2.1, ALL outcomes (DONE | NOT_DONE | PARTIAL) advance to
  // READY — the outcome distinction is for record only, not for routing.
  // Allowed roles: assigned_lawyer (synthetic), department_head, branch_manager.
  app.post("/api/consultations/:id/take-notes-outcome", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowOutcomeSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const outcome = String(req.body?.outcome || "");
      const notes = String(req.body?.notes || "");
      const valid = (Object.values(NoteOutcome) as string[]).includes(outcome);
      if (!valid) return res.status(400).json({ error: "نتيجة غير صحيحة" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      if (consultation.currentStage !== ConsultationStage.TAKING_NOTES) {
        return res.status(400).json({ error: "الاستشارة ليست في مرحلة الأخذ بالملاحظات" });
      }

      // 4c-7: take-notes-outcome INHERITS. The assigned lawyer applies the
      // committee's notes and records the outcome — their OWN follow-up work,
      // NOT a review — so a delegate inheriting the assigned-lawyer identity OR a
      // dept_head/branch_manager role may record it. No author/self exclusion
      // (not a review). Scope null. No delegation → own identity+role (parity).
      const ctx = req.actingContext;
      const isLawyer = ctx
        ? Array.from(effectiveIdsFor(ctx, null)).some((id) => isAssignedLawyer({ id }, consultation))
        : isAssignedLawyer(reqUser, consultation);
      const isHead = ctx
        ? hasEffectiveRole(ctx, null, "department_head", "branch_manager")
        : ["department_head", "branch_manager"].includes(reqUser.role);
      if (!isLawyer && !isHead) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتسجيل النتيجة" });
      }

      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `نتيجة الأخذ بالملاحظات: ${outcome} — ${truncatedNotes}`
        : `نتيجة الأخذ بالملاحظات: ${outcome}`;

      const result = await storage.recordConsultationNoteOutcome({
        consultationId: consultation.id,
        outcome,
        notes,
        recordedBy: reqUser.id,
        nextStage: ConsultationStage.READY,
        activity: {
          description,
          metadata: { outcome, notes },
          performedBy: reqUser.id,
        },
      });
      res.json({ outcome: result.outcome, consultation: result.consultation });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/return-to-committee
  // Body: { notes }. Notes are required — the committee needs to know
  // what was applied / why the lawyer is bouncing it back. Sends the
  // consultation from الأخذ_بالملاحظات back to لجنة_مراجعة. Allowed
  // roles: assigned_lawyer (synthetic), admin_support, department_head,
  // branch_manager — same gate as take-notes-outcome plus admin_support.
  app.post("/api/consultations/:id/return-to-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = String(req.body?.notes ?? "").trim();
      if (!notes) return res.status(400).json({ error: "الملاحظات مطلوبة" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }
      if (consultation.currentStage !== ConsultationStage.TAKING_NOTES) {
        return res.status(400).json({ error: "الاستشارة ليست في مرحلة الأخذ بالملاحظات" });
      }

      // Phase 8 F9 — dept-head scoped to own dept (mirrors cases
      // /return-to-committee, which likewise allows admin_support).
      const isLawyer = isAssignedLawyer(reqUser, consultation);
      const isOwnDeptHead =
        reqUser.role === "department_head"
        && !!reqUser.departmentId
        && consultation.departmentId === reqUser.departmentId;
      const allowed =
        reqUser.role === "branch_manager"
        || reqUser.role === "admin_support"
        || isOwnDeptHead
        || isLawyer;
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإعادة الاستشارة للجنة" });
      }

      const updated = await storage.returnConsultationToCommittee(consultation.id, {
        notes,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل إعادة الاستشارة للجنة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/return-to-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/consultations/:id/early-close
  // Body: { reason, otherText? }. Sets status='closed', closedAt=now(),
  // persists closure_reason (and closure_reason_other when reason='other').
  // Validation matches the cases early-close pattern: reason required, and
  // otherText required iff reason === 'other'.
  // Allowed roles: WRITTEN keeps the legacy wider gate (assigned_lawyer +
  // admin_support / department_head / branch_manager, per spec §3.2.4);
  // PHONE / PROCEDURAL narrow to admin_support / branch_manager only
  // per the new-types common-features list.
  app.post("/api/consultations/:id/early-close", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      const resolvedType = resolveConsultationType(consultation.consultationType);
      const isLawyer = isAssignedLawyer(reqUser, consultation);
      let permitted: boolean;
      if (resolvedType === ConsultationType.WRITTEN) {
        // Phase 8 F6 — dept-head scoped to own dept (mirrors contracts
        // /early-close), with the both-sides non-null guard so a null-dept
        // head can't match a null-dept consultation.
        permitted =
          ["admin_support", "branch_manager"].includes(reqUser.role) ||
          (reqUser.role === "department_head"
            && !!reqUser.departmentId
            && !!consultation.departmentId
            && consultation.departmentId === reqUser.departmentId) ||
          isLawyer;
      } else {
        permitted = ["admin_support", "branch_manager"].includes(reqUser.role);
      }
      if (!permitted) {
        return res.status(403).json({ error: "ليس لديك صلاحية للإغلاق المبكر" });
      }

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason || "");
      const otherText = String(req.body?.otherText || "");
      if (!reason) return res.status(400).json({ error: "سبب الإغلاق مطلوب" });
      const validReasons = Object.values(ConsultationClosureReason) as string[];
      if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: "سبب الإغلاق غير صحيح" });
      }
      if (reason === ConsultationClosureReason.OTHER && !otherText.trim()) {
        return res.status(400).json({ error: "يجب توضيح سبب الإغلاق عند اختيار 'أخرى'" });
      }

      const reasonLabel = reason;
      const description = otherText.trim()
        ? `إغلاق مبكر: ${reasonLabel} — ${otherText.trim().slice(0, 120)}`
        : `إغلاق مبكر: ${reasonLabel}`;

      const updated = await storage.updateConsultationAndLog(
        consultation.id,
        {
          status: "closed",
          closureReason: reason,
          closureReasonOther: otherText.trim() || null,
          closedAt: new Date().toISOString(),
        },
        {
          activityType: ConsultationActivityType.EARLY_CLOSED,
          description,
          metadata: { reason, closureReasonOther: otherText.trim() || null, notes: otherText.trim() || "" },
          performedBy: reqUser.id,
        },
      );

      if (!updated) return res.status(500).json({ error: "فشل إغلاق الاستشارة" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/close-no-response
  // Body: { notes? }. The consultations twin of the cases endpoint — closes a
  // consultation parked at استكمال_المرفقات_والبيانات because the client never
  // supplied the missing documents/data, recording WHAT WAS MISSING.
  //
  // Simpler resolver than the cases side: consultation_activity_log has a
  // metadata JSONB column, so awaitConsultationCompletion stores the reason
  // STRUCTURALLY as metadata.reason. No prefix-stripping, no stageHistory
  // fallback — consultations have no stageHistory at all.
  //
  // ROLES: this entity's OWN early-close tier, not the cases one — WRITTEN keeps
  // the wider gate (admin_support | branch_manager | own-dept department_head |
  // assigned lawyer), PHONE / PROCEDURAL narrow to admin_support | branch_manager.
  app.post("/api/consultations/:id/close-no-response", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      // Early-close gate, copied from /early-close verbatim.
      const resolvedType = resolveConsultationType(consultation.consultationType);
      const isLawyer = isAssignedLawyer(reqUser, consultation);
      const permitted = resolvedType === ConsultationType.WRITTEN
        ? (["admin_support", "branch_manager"].includes(reqUser.role) ||
           (reqUser.role === "department_head"
             && !!reqUser.departmentId
             && !!consultation.departmentId
             && consultation.departmentId === reqUser.departmentId) ||
           isLawyer)
        : ["admin_support", "branch_manager"].includes(reqUser.role);
      if (!permitted) return res.status(403).json({ error: "ليس لديك صلاحية للإغلاق" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }
      if (consultation.currentStage !== ConsultationStage.RECEIVED_PENDING_COMPLETION) {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط لاستشارة في مرحلة استكمال المرفقات والبيانات" });
      }
      if (consultation.pausedAt) {
        return res.status(400).json({ error: "الاستشارة معلّقة — أزل التعليق أولاً" });
      }

      // Latest await_completion row's metadata.reason. Isolated try/catch so an
      // audit-trail read can never block a legitimate workflow action.
      let missingData = "";
      try {
        const activities = await storage.getConsultationActivities(consultation.id);
        // Already ordered performedAt DESC — the first match IS the latest.
        const latestAwait = activities.find((a) => a.activityType === ConsultationActivityType.AWAIT_COMPLETION);
        missingData = String(latestAwait?.metadata?.reason ?? "").trim();
      } catch (e) {
        console.error("[consultations/close-no-response] activity lookup failed:", e);
      }

      const notes = String(req.body?.notes ?? "").trim();
      const description = [
        "إغلاق لعدم استكمال البيانات",
        missingData ? `الناقص: ${missingData}` : "",
        notes,
      ].filter(Boolean).join(" — ");

      const updated = await storage.updateConsultationAndLog(
        consultation.id,
        {
          status: "closed",
          closureReason: ConsultationClosureReason.DATA_NOT_COMPLETED,
          // varchar(500) — same truncation as the cases twin.
          closureReasonOther: missingData.slice(0, 500) || null,
          closedAt: new Date().toISOString(),
          // Cleared for the same reason as the cases twin: the consultations
          // "بانتظار" badge has no closed check, so the latch would stick.
          awaitingCompletion: false,
          savedStage: null,
        },
        {
          activityType: ConsultationActivityType.CLOSED_NO_RESPONSE,
          description,
          metadata: { reason: ConsultationClosureReason.DATA_NOT_COMPLETED, missingData, notes },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل إغلاق الاستشارة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/close-no-response] error:", error);
      res.status(500).json({ error: error.message || "فشل إغلاق الاستشارة" });
    }
  });

  // POST /api/consultations/:id/reopen
  // Body: { targetStage, notes? }. Re-opens a CLOSED consultation at a
  // caller-chosen stage. Mirrors POST /api/cases/:id/reopen, minus the number
  // prompt — consultations carry no platform numbers.
  //
  // ⚠ REOPEN vs START-FOLLOW-UP — they are NOT duplicates, and both must exist:
  //   /start-follow-up  the matter genuinely FINISHED and the client came back
  //                     with a NEW question. followUpCount bumps and the record
  //                     switches PERMANENTLY to the 3-stage cycle
  //                     (getStagesForConsultationCycle is status-agnostic), which
  //                     deliberately skips دراسة / تحرير / مراجعة / لجنة. Answer
  //                     and close again.
  //   /reopen           the CLOSURE ITSELF was wrong or premature. Resume the
  //                     ORIGINAL work at the stage it should be at, on the full
  //                     path, with no cycle counter touched.
  // The close-for-no-response flow is the clearest case for reopen: a client who
  // finally sends the missing documents should go back to where the work stopped,
  // not into an answer-and-close cycle.
  //
  // TARGET STAGES: getConsultationReopenTargetStages — the record's OWN resolved
  // path (cycle-aware), minus CLOSED_FINAL. No forced escape-hatch stage; see
  // that helper's comment for why the cases منظورة carve-out has no analogue here.
  //
  // ROLE GATE: this entity's own CLOSE tier (canEarlyClose), evaluated against a
  // closed row. Whoever can close can re-open. NOTE this INCLUDES admin_support,
  // deliberately diverging from the cases reopen, which excludes it by a specific
  // owner decision about CASES; the owner's instruction here was "each entity's
  // own close tier".
  //
  // NO CANCELLED-CHILDREN WARNING — unlike cases. Consultations have no hearings,
  // memos or field tasks, and their close paths cancel nothing; the helper rows
  // (studies / drafts / reviews / committee decisions) are immutable history, not
  // cancellable children. There is nothing to warn about, so nothing is claimed.
  app.post("/api/consultations/:id/reopen", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = reopenEntitySchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      if (consultation.status !== "closed") {
        return res.status(400).json({ error: "يمكن إعادة الفتح فقط لاستشارة مغلقة" });
      }

      // Close tier, evaluated on the closed row. canEarlyClose itself requires
      // status "active", so the role half is restated here rather than reused.
      const resolvedType = resolveConsultationType(consultation.consultationType);
      const isLawyer = isAssignedLawyer(reqUser, consultation);
      const permitted = resolvedType === ConsultationType.WRITTEN
        ? (["admin_support", "branch_manager"].includes(reqUser.role) ||
           (reqUser.role === "department_head"
             && !!reqUser.departmentId
             && !!consultation.departmentId
             && consultation.departmentId === reqUser.departmentId) ||
           isLawyer)
        : ["admin_support", "branch_manager"].includes(reqUser.role);
      if (!permitted) return res.status(403).json({ error: "ليس لديك صلاحية لإعادة فتح الاستشارة" });

      const targetStage = String(req.body?.targetStage ?? "").trim();
      if (!targetStage) {
        return res.status(400).json({ error: "يجب اختيار المرحلة التي ستُفتح عندها الاستشارة" });
      }
      const allowedTargets = getConsultationReopenTargetStages(consultation) as string[];
      if (!allowedTargets.includes(targetStage)) {
        return res.status(400).json({ error: "المرحلة المختارة ليست ضمن مسار هذه الاستشارة" });
      }

      const notes = String(req.body?.notes ?? "").trim();
      const stageLabel = (ConsultationStageLabels as Record<string, string>)[targetStage] || targetStage;
      const clearedReason = consultation.closureReason || "";
      const updated = await storage.updateConsultationAndLog(
        consultation.id,
        {
          status: "active",
          currentStage: targetStage as ConsultationStageValue,
          // Closure metadata cleared on the row but PRESERVED in the activity
          // row below, so the audit trail keeps why it had been closed.
          closedAt: null,
          closureReason: null,
          closureReasonOther: null,
          // Defensive cleanup, mirroring /start-follow-up: a consultation closed
          // while paused or awaiting completion must not come back still latched.
          pausedAt: null,
          pausedBy: null,
          pauseReason: null,
          pauseUntil: null,
          awaitingCompletion: false,
          savedStage: null,
        },
        {
          activityType: ConsultationActivityType.REOPENED,
          description: [
            `إعادة فتح الاستشارة عند مرحلة ${stageLabel}`,
            clearedReason ? `سبب الإغلاق السابق: ${clearedReason}` : "",
            notes,
          ].filter(Boolean).join(" — "),
          metadata: {
            targetStage,
            previousClosureReason: clearedReason || null,
            previousClosedAt: consultation.closedAt || null,
            notes,
          },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل إعادة فتح الاستشارة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/reopen] error:", error);
      res.status(500).json({ error: error.message || "فشل إعادة فتح الاستشارة" });
    }
  });

  // POST /api/consultations/:id/start-follow-up
  // Re-opens a closed consultation into a follow-up cycle ("استشارة
  // تعقيبية"). Same row: status flips back to active, currentStage
  // resets to RECEIVED, followUpCount increments, followUpStartedAt is
  // stamped, and the previous closure metadata (closedAt /
  // closureReason*) plus stale pause/await fields are cleared so the
  // row doesn't carry forward into the new cycle. The activity log preserves
  // the full history. (The expectedDeliveryDate/SLA recompute that used to run
  // here went with the removal of that feature — there is no delivery window to
  // refresh any more.)
  // Permission: admin_support / branch_manager.
  app.post("/api/consultations/:id/start-follow-up", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      // WIDENED MODEL — was admin_support | branch_manager only. Own-dept
      // department_head and the assigned lawyer may now open a follow-up cycle,
      // which also RESOLVES the divergence the audit flagged: the CONTRACTS twin
      // (/api/contracts/:id/start-follow-up) already used exactly this wider set,
      // and the two modules had no reason to differ. Gate moved below the fetch so
      // it can be scoped to the consultation.
      if (
        !["admin_support", "branch_manager"].includes(reqUser.role)
        && !canActOnEntityTiered(reqUser, consultation, consultation.departmentId, req.actingContext, null)
      ) {
        return res.status(403).json({ error: "ليس لديك صلاحية لبدء استشارة تعقيبية" });
      }

      if (consultation.status !== "closed") {
        return res.status(400).json({ error: "يمكن بدء التعقيبية فقط من استشارة مقفلة" });
      }

      // The cycle question is the customer's new follow-up inquiry. Stored
      // in the activity-log metadata only (no new column) — the UI reads
      // the latest FOLLOW_UP_STARTED entry to surface it during the cycle.
      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = startConsultationFollowUpSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const question = String(req.body?.question ?? "").trim();
      if (!question) {
        return res.status(400).json({ error: "السؤال مطلوب لبدء استشارة تعقيبية" });
      }

      const nextCount = (consultation.followUpCount ?? 0) + 1;
      // The SLA-window recompute that used to live here is GONE with the
      // expected-delivery-date feature. A follow-up cycle no longer refreshes
      // any delivery date — there is none to refresh.

      const updated = await storage.updateConsultationAndLog(
        consultation.id,
        {
          status: "active",
          currentStage: ConsultationStage.RECEIVED,
          followUpCount: nextCount,
          followUpStartedAt: new Date().toISOString(),
          // Clear previous closure metadata — it described the prior
          // lifecycle, not the new cycle.
          closedAt: null,
          closureReason: null,
          closureReasonOther: null,
          // Defensive cleanup (R10) — clear any stale pause/await state
          // the row might carry from before its original closure so the
          // new cycle starts cleanly.
          pausedAt: null,
          pausedBy: null,
          pauseReason: null,
          awaitingCompletion: false,
          savedStage: null,
        },
        {
          activityType: ConsultationActivityType.FOLLOW_UP_STARTED,
          // Description carries a truncated preview so the timeline reads
          // naturally without expanding; the full question lives in
          // metadata.followUpQuestion and is surfaced in the detail dialog.
          description: `بدء استشارة تعقيبية #${nextCount}: ${question.slice(0, 80)}${question.length > 80 ? "..." : ""}`,
          metadata: {
            followUpCount: nextCount,
            followUpQuestion: question,
          },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل بدء التعقيبية" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/consultations/:id/convert-to-case
  // Body: { targetCaseStage, caseDepartmentId, ...any other case fields }.
  // Per spec §3.2.3: single DB transaction. Steps 3-5 (helper-table copies)
  // are skipped per option (ii) of the Phase 2 plan — the new case carries
  // convertedFromConsultationId and the consultation row is preserved with
  // status='converted' so the UI can navigate back for history.
  // Allowed roles: admin_support, department_head, branch_manager.
  app.post("/api/consultations/:id/convert-to-case", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // Pre-validate (storage re-checks inside the transaction for race-safety).
      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      // WIDENED MODEL — the assigned lawyer may now convert their own consultation
      // into a case; the role list is kept and OR-ed so admin_support / dept_head /
      // branch_manager are unchanged. Moved below the fetch so the tier can be
      // scoped to the consultation. (The dept_head own-department check further
      // down still applies and is what scopes the head.)
      if (
        !["admin_support", "department_head", "branch_manager"].includes(reqUser.role)
        && !canActOnEntityTiered(reqUser, consultation, consultation.departmentId, req.actingContext, null)
      ) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتحويل الاستشارة لقضية" });
      }
      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }
      // Phase 5 B/M4 — department_head can only convert consultations in their
      // OWN department; branch_manager / admin_support stay global. The FE only
      // surfaces own-dept consultations to a dept_head (canModifyConsultation
      // scopes them), so legitimate use is unaffected.
      if (reqUser.role === "department_head" && consultation.departmentId !== reqUser.departmentId) {
        return res.status(403).json({ error: "لا يمكنك تحويل استشارة من قسم آخر" });
      }
      // COMPLETED is PHONE/PROCEDURAL-only now (WRITTEN no longer passes
      // through it — it closes READY → CLOSED_FINAL). Guard is inert for
      // WRITTEN; still blocks PHONE/PROCEDURAL at COMPLETED. Storage
      // re-checks this inside the transaction for race-safety.
      if (consultation.currentStage === ConsultationStage.COMPLETED) {
        return res.status(400).json({ error: "لا يمكن تحويل استشارة منجزة" });
      }
      // Follow-up cycle: don't allow converting a cycle to a case. The
      // original consultation is already done; cycles are post-closure
      // customer follow-ups, not new-case material. Storage re-checks
      // this inside the transaction.
      if ((consultation.followUpCount ?? 0) > 0) {
        return res.status(400).json({ error: "لا يمكن تحويل استشارة تعقيبية لقضية" });
      }

      // 2D'-V1b Pattern-A gate: validate types only; the manual checks
      // below stay (zero handler-logic change), the gate adds type safety
      // for the ...rest spread into case creation.
      const bodyCheck = convertConsultationToCaseSchema.safeParse(req.body ?? {});
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const { targetCaseStage, caseDepartmentId, ...rest } = req.body || {};
      if (!targetCaseStage || typeof targetCaseStage !== "string") {
        return res.status(400).json({ error: "targetCaseStage مطلوب" });
      }
      if (!caseDepartmentId || typeof caseDepartmentId !== "string") {
        return res.status(400).json({ error: "caseDepartmentId مطلوب" });
      }

      // If a primaryLawyerId / responsibleLawyerId / assigned lawyer is being
      // copied through, validate it's an active user — same check the case
      // PATCH endpoint applies.
      const lawyerIds = [rest.primaryLawyerId, rest.responsibleLawyerId].filter(
        (v: any): v is string => typeof v === "string" && v.length > 0,
      );
      if (lawyerIds.length > 0) {
        const { valid } = await validateAssignedUsersActive(lawyerIds);
        if (!valid) return res.status(400).json({ error: "أحد المحامين المختارين غير نشط أو غير موجود" });
      }

      const caseFields = {
        ...rest,
        currentStage: targetCaseStage,
        departmentId: caseDepartmentId,
      };

      try {
        // The case number is generated inside the storage transaction;
        // the activity row is written there with the canonical description
        // using that number.
        const result = await storage.convertConsultationToCase(
          consultation.id,
          caseFields,
          reqUser.id,
          { targetCaseStage },
        );
        res.status(201).json(result);
      } catch (e: any) {
        const msg = e?.message || "";
        if (msg === "CONSULTATION_NOT_FOUND") return res.status(404).json({ error: "الاستشارة غير موجودة" });
        if (msg === "CONSULTATION_NOT_ACTIVE") return res.status(400).json({ error: "الاستشارة ليست نشطة" });
        if (msg === "CONSULTATION_COMPLETED") return res.status(400).json({ error: "لا يمكن تحويل استشارة منجزة" });
        if (msg === "CONSULTATION_IN_FOLLOW_UP_CYCLE") return res.status(400).json({ error: "لا يمكن تحويل استشارة تعقيبية لقضية" });
        if (msg === "DUPLICATE_CASE_NUMBER") {
          return res.status(400).json({ error: "تعذّر توليد رقم قضية فريد، يرجى المحاولة مرة أخرى" });
        }
        if (msg === "CASE_NUMBER_EXISTS") {
          return res.status(400).json({ error: "رقم القضية المُدخل مستخدم مسبقاً، يرجى استخدام رقم آخر" });
        }
        if (msg === "CASE_INSERT_FAILED" || msg === "CONSULTATION_UPDATE_FAILED") {
          // Transaction rolled back — neither row persisted.
          return res.status(500).json({ error: "فشل التحويل، تم التراجع عن جميع التغييرات" });
        }
        throw e;
      }
    } catch (error: any) {
      console.error("[convert-to-case] error:", error);
      res.status(500).json({ error: error.message || "فشل تحويل الاستشارة" });
    }
  });

  // GET /api/consultations/:id/activities (Phase-6)
  // Returns the chronological activity log for a consultation, newest
  // first. Visibility piggybacks on canModifyConsultation — anyone
  // allowed to view the consultation can read its log. Inserts happen
  // server-side only inside the workflow handlers, so this endpoint is
  // read-only.
  app.get("/api/consultations/:id/activities", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });
      if (!canModifyConsultation(reqUser, consultation, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه الاستشارة" });
      }

      const rows = await storage.getConsultationActivities(consultation.id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // ==================== Phase-8: Pause / Unpause (consultations + cases + memos) ====================
  // Allowed roles for pause + unpause across all 3 entities:
  //   - branch_manager       (always)
  //   - admin_support        (always)
  //   - department_head      (only when entity is in own department)
  //   - assigned lawyer      (only when entity.assignedTo / primary /
  //                           responsible / assignedLawyers === user.id)

  // POST /api/consultations/:id/pause
  // Body: { reason }. Sets status="paused", fills pause_* columns,
  // inserts a "paused" activity-log row in the same DB transaction.
  app.post("/api/consultations/:id/pause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      // Permission gate (narrower than canModifyConsultation — no
      // cases_review_head / consultations_review_head per spec).
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        // !!reqUser.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
        (reqUser.role === "department_head" && !!reqUser.departmentId && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتعليق هذه الاستشارة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "لا يمكن تعليق استشارة ليست نشطة" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowPauseSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب التعليق مطلوب" });
      // OPTIONAL auto-lift date. Absent → open-ended, exactly as before.
      const pauseUntil = String(req.body?.pauseUntil ?? "").trim();
      const pauseUntilError = validatePauseUntil(pauseUntil, todayDateString());
      if (pauseUntilError) return res.status(400).json({ error: pauseUntilError });

      const updated = await storage.pauseConsultation(consultation.id, {
        reason,
        performedBy: reqUser.id,
        pauseUntil,
      });
      if (!updated) return res.status(500).json({ error: "فشل تعليق الاستشارة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/pause] error:", error);
      res.status(500).json({ error: error.message || "فشل تعليق الاستشارة" });
    }
  });

  // POST /api/consultations/:id/unpause
  // Body: { notes? }. Clears pause_* columns and flips status back to
  // "active". Stage stays where it was. Notes are optional and recorded
  // on the activity-log entry when present.
  app.post("/api/consultations/:id/unpause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && !!reqUser.departmentId && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء تعليق هذه الاستشارة" });

      if (consultation.status !== "paused") {
        return res.status(400).json({ error: "هذه الاستشارة ليست معلّقة" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const updated = await storage.unpauseConsultation(consultation.id, {
        notes,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل إلغاء التعليق" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/unpause] error:", error);
      res.status(500).json({ error: error.message || "فشل إلغاء التعليق" });
    }
  });

  // POST /api/cases/:id/return-to-committee
  // Body: { notes }. Required notes — sends case from الأخذ_بالملاحظات
  // back to إحالة_للجنة_المراجعة. Allowed: assigned_lawyer +
  // admin_support + department_head (own dept) + branch_manager.
  // "تم" acknowledge for the data-completion reminder — stamps
  // data_completion_last_ack_at=now so the unified-tasks feed suppresses the
  // case's data_completion task for 2 days, then re-surfaces it if the case is
  // still at استكمال_البيانات. Gated by canModifyCase (delegation-aware) —
  // covers admin_support / branch_manager / dept_head(own dept) / the assignee.
  app.post("/api/cases/:id/ack-data-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
      if (!canModifyCase(user, lawCase, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      // Batch 1.5b — OBSERVE ONLY. Purely LIVE-mapped: feed block 14 emits this
      // task to dataCompletionCaseOwner (or the branch_manager pool when unset),
      // and the case row carries no assignee for it, so the mapping is the whole
      // rule — no stored-assignee arm to OR in, unlike execution. The ack writes
      // data_completion_last_ack_at, which SUPPRESSES admin_support's own task for
      // two days, so the wrong actor here silences the right one.
      {
        const assignments = await storage.getAdminSupportTaskAssignments();
        const users = await storage.getAllUsers();
        warnIfNotTaskOwner(req, {
          endpoint: "POST /api/cases/:id/ack-data-completion",
          taskId: lawCase.id,
          taskType: "data_completion_case",
          rightfulOwnerIds: [resolveAdminSupportAssignee(
            AssignableAdminSupportTaskKind.DATA_COMPLETION_CASE, assignments, users)],
          caseId: lawCase.id,
          assignedTo: null,
        });
      }
      const updated = await storage.updateCase(String(req.params.id), { dataCompletionLastAckAt: new Date().toISOString() });
      res.json(updated);
    } catch (error) {
      console.error("Error acknowledging data completion:", error);
      res.status(500).json({ error: "حدث خطأ في تأكيد التواصل" });
    }
  });

  // "تم" acknowledge for the CONSULTATION data-completion reminder — mirrors the
  // case route above (stamps data_completion_last_ack_at=now so the feed
  // suppresses the data_completion_consultation task for 2 days, then
  // re-surfaces if the consultation is still at استكمال_المرفقات_والبيانات).
  app.post("/api/consultations/:id/ack-data-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });
      if (!canModifyConsultation(user, consultation, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      const updated = await storage.updateConsultation(String(req.params.id), { dataCompletionLastAckAt: new Date().toISOString() });
      res.json(updated);
    } catch (error) {
      console.error("Error acknowledging consultation data completion:", error);
      res.status(500).json({ error: "حدث خطأ في تأكيد التواصل" });
    }
  });

  // "تم" acknowledge for the CONTRACT data-completion reminder — mirrors the
  // case route above (stamps data_completion_last_ack_at=now so the feed
  // suppresses the data_completion_contract task for 2 days, then re-surfaces
  // if the contract is still at استكمال_البيانات_والمرفقات).
  app.post("/api/contracts/:id/ack-data-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!canModifyContract(user, contract, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      const updated = await storage.updateContract(String(req.params.id), { dataCompletionLastAckAt: new Date().toISOString() });
      res.json(updated);
    } catch (error) {
      console.error("Error acknowledging contract data completion:", error);
      res.status(500).json({ error: "حدث خطأ في تأكيد التواصل" });
    }
  });

  // "تم" acknowledge for the MEMO data-completion reminder. Unlike the other
  // three work-types (stage-gated), the memo task is gated on the memo's
  // awaiting_completion latch (set by the "بانتظار استكمال البيانات" button);
  // this stamps data_completion_last_ack_at=now to suppress the reminder for 2
  // days. The task fully clears when the memo's resume-from-completion flips
  // awaiting_completion off. Same actor set as the other memo state changes.
  app.post("/api/memos/:id/ack-data-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });
      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support"]);
      if (!allowed) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      const updated = await storage.updateMemo(String(req.params.id), { dataCompletionLastAckAt: new Date().toISOString() });
      res.json(updated);
    } catch (error) {
      console.error("Error acknowledging memo data completion:", error);
      res.status(500).json({ error: "حدث خطأ في تأكيد التواصل" });
    }
  });

  // Complete an EXECUTION (تنفيذ) task by recording رقم طلب التنفيذ. The number is
  // MANDATORY (400 below) and is now written to law_cases.execution_request_number
  // as well as the activity log — it used to live ONLY in the log + the task's
  // completionNotes, so it could not be displayed on the case or corrected later.
  // Gated like the field-task PATCH: the assignee, OR anyone who can modify the
  // parent case (admin_support / branch_manager / dept_head(own) / the case's
  // lawyer). Delegation actorDisplayName stamping applies if acting-as.
  app.post("/api/field-tasks/:id/execution-request", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const task = await storage.getFieldTaskById(String(req.params.id));
      if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });
      if (!task.caseId) return res.status(400).json({ error: "المهمة غير مرتبطة بقضية" });
      const parentCase = await storage.getCaseById(task.caseId);
      const canModifyParent = !!parentCase && canModifyCase(user, parentCase, req.actingContext);
      if (task.assignedTo !== user.id && !canModifyParent) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      // Batch 1.5b — OBSERVE ONLY. Same resolver as the field-task PATCH, so
      // the execution "mapping OR stored assignee" rule cannot drift between
      // the two routes that can complete an execution task.
      {
        const ownership = await resolveFieldTaskOwnerIds(task);
        warnIfNotTaskOwner(req, {
          endpoint: "POST /api/field-tasks/:id/execution-request",
          taskId: task.id,
          taskType: ownership.taskType,
          rightfulOwnerIds: ownership.ownerIds,
          caseId: task.caseId ?? null,
          assignedTo: task.assignedTo,
        });
      }
      const executionRequestNumber = String(req.body?.executionRequestNumber ?? "").trim();
      if (!executionRequestNumber) {
        return res.status(400).json({ error: "رقم طلب التنفيذ مطلوب" });
      }
      const actorName = actorDisplayName(req.actingContext, task.caseId, user.name || user.id);
      await logCaseActivityActing(req, {
        caseId: task.caseId,
        userId: user.id,
        userName: user.name || user.id,
        actionType: "execution_request_filed",
        title: `تم رفع طلب تنفيذ رقم ${executionRequestNumber} بواسطة ${actorName}`,
        details: `رقم طلب التنفيذ: ${executionRequestNumber}`,
      });
      // Persist on the CASE so it survives, displays beside the other platform
      // numbers, and stays correctable. Dedicated column only — never
      // case_number (varchar(50) NOT NULL UNIQUE), and deliberately NOT part of
      // deriveCurrentCaseNumber: this is a reference field, not the case's number.
      await storage.updateCase(task.caseId, {
        executionRequestNumber: executionRequestNumber.substring(0, 100),
      } as Partial<LawCase>);
      const updated = await storage.updateFieldTask(String(req.params.id), {
        status: FieldTaskStatus.COMPLETED,
        completionNotes: `رقم طلب التنفيذ: ${executionRequestNumber}`,
      });

      // BUGFIX (found while adding the number): this endpoint completes the
      // EXECUTION task by writing through storage directly, so it BYPASSED the
      // post-judgment auto-close hook — which lives in PATCH /api/field-tasks/:id.
      // A case whose collection task was completed via the PATCH route and whose
      // execution task was completed HERE therefore never closed, even with both
      // tasks done. Same call, same guards (no-ops unless the case is at
      // محكوم_حكم_نهائي and every post-judgment task is resolved).
      await maybeCloseCaseAfterPostJudgmentTasks(req, task.caseId, user);

      res.json(updated);
    } catch (error) {
      console.error("Error filing execution request:", error);
      res.status(500).json({ error: "حدث خطأ في تسجيل طلب التنفيذ" });
    }
  });

  // Complete an AGENCY_ISSUANCE (إصدار وكالة) GROUP task (sub-step 3) with a simple
  // confirm. One "تم إصدار الوكالة" satisfies EVERY case in the group (same موكّل →
  // one الوكالة covers all his cases): for each grouped field_task it records a
  // case-activity-log event (traceability, mirrors how execution logs its number),
  // marks the field_task complete, and CLEARS that case's agencyIssuanceRequested
  // latch so a future pre-hearing "لا يوجد" can re-fire. A group of 1 is the normal
  // single case. Each field_task is gated like the field-task PATCH: the assignee,
  // OR anyone who can modify its parent case — every member is gated before any
  // write. Delegation actorDisplayName stamping applies if acting-as.
  app.post("/api/field-tasks/agency-issuance-group", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const body = req.body ?? {};
      const fieldTaskIds: string[] = Array.isArray(body.fieldTaskIds)
        ? Array.from(new Set((body.fieldTaskIds as unknown[]).map((x) => String(x)).filter(Boolean)))
        : [];
      if (fieldTaskIds.length === 0) {
        return res.status(400).json({ error: "لم يتم تحديد أي مهمة" });
      }
      // Load + gate ALL members first (the group is built from the caller's own
      // routed tasks) — a failure on any means an invalid request, never a partial.
      const members: { task: FieldTask; caseId: string }[] = [];
      for (const tid of fieldTaskIds) {
        const task = await storage.getFieldTaskById(tid);
        if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });
        if (!task.caseId) return res.status(400).json({ error: "المهمة غير مرتبطة بقضية" });
        const parentCase = await storage.getCaseById(task.caseId);
        const canModifyParent = !!parentCase && canModifyCase(user, parentCase, req.actingContext);
        if (task.assignedTo !== user.id && !canModifyParent) {
          return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
        }
        members.push({ task, caseId: task.caseId });
      }
      // Batch 1.5b — OBSERVE ONLY, once the whole group has passed its gate.
      // PER MEMBER, not once for the group: the group is keyed on the موكّل, so
      // its members can span cases, and a per-group line would hide which task
      // was acted on. In practice all members share one mapped owner, so a
      // wrong actor produces one line per member — that is the honest count of
      // rows they touched, not duplication.
      for (const { task } of members) {
        const ownership = await resolveFieldTaskOwnerIds(task);
        warnIfNotTaskOwner(req, {
          endpoint: "POST /api/field-tasks/agency-issuance-group",
          taskId: task.id,
          taskType: ownership.taskType,
          rightfulOwnerIds: ownership.ownerIds,
          caseId: task.caseId ?? null,
          assignedTo: task.assignedTo,
        });
      }
      // One confirm satisfies all: log + complete + clear the latch per member.
      for (const { task, caseId } of members) {
        const actorName = actorDisplayName(req.actingContext, caseId, user.name || user.id);
        await logCaseActivityActing(req, {
          caseId,
          userId: user.id,
          userName: user.name || user.id,
          actionType: "agency_issued",
          title: `تم إصدار وكالة بواسطة ${actorName}`,
          details: `تم إصدار الوكالة للقضية`,
        });
        await storage.updateFieldTask(task.id, {
          status: FieldTaskStatus.COMPLETED,
          completionNotes: `تم إصدار الوكالة`,
        });
        // Clear the latch so a future pre-hearing "لا يوجد" can request a new issuance.
        await storage.updateCase(caseId, { agencyIssuanceRequested: false });
      }
      res.json({ success: true, count: members.length });
    } catch (error) {
      console.error("Error completing agency issuance (group):", error);
      res.status(500).json({ error: "حدث خطأ في تسجيل إصدار الوكالة" });
    }
  });

  app.post("/api/cases/:id/return-to-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = String(req.body?.notes ?? "").trim();
      if (!notes) return res.status(400).json({ error: "الملاحظات مطلوبة" });

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      if (lawCase.currentStage !== "الأخذ_بالملاحظات") {
        return res.status(400).json({ error: "القضية ليست في مرحلة الأخذ بالملاحظات" });
      }
      if (lawCase.pausedAt || lawCase.awaitingCompletion) {
        return res.status(400).json({ error: "القضية في حالة لا تسمح بإعادتها للجنة" });
      }

      const isLawyer = isAssignedLawyer(reqUser, lawCase);
      const isOwnDeptHead =
        reqUser.role === "department_head"
        && !!reqUser.departmentId
        && lawCase.departmentId === reqUser.departmentId;
      const allowed =
        reqUser.role === "branch_manager"
        || reqUser.role === "admin_support"
        || isOwnDeptHead
        || isLawyer;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإعادة القضية للجنة" });

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.returnCaseToCommittee(lawCase.id, {
        notes,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل إعادة القضية للجنة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/return-to-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // ==================== POST /api/cases/:id/committee-decision ====================
  // Body: { decision, notes }. THE COMMITTEE DECISION, decided SERVER-SIDE.
  //
  // 🔴 WHY THIS EXISTS. Cases were the only one of the four entities with no
  // committee-decision endpoint: the decision was issued by the BROWSER, in
  // approveCase (client/src/lib/cases-context.tsx), which hard-coded
  // CaseStage.READY_TO_SUBMIT for every case and PATCHed it. جاهزة_للرفع means
  // "ready to FILE" and exists only on the four UNDER-STUDY paths — an in-court
  // case is already filed, and its post-committee stage is منظورة. PATCH accepted
  // it because ALLOWED_CASE_TRANSITIONS is a flat from→to table with no
  // classification awareness, and BOTH edges out of the committee stage exist in
  // it (:984 → جاهزة_للرفع, :1063 → منظورة), so the server had no basis to prefer
  // one. Production case 4870079661 — an in-court مدعى_عليه case — was walked
  // تحرير_مذكرة_جوابية → مراجعة_داخلية → إحالة_للجنة_المراجعة → جاهزة_للرفع on
  // 2026-08-05 and stranded there: جاهزة_للرفع is on none of its path's arrays, so
  // its progress bar collapsed onto استلام and its only outbound edges led to
  // filing-platform reviews it had no business entering.
  //
  // MODELLED ON THE CONTRACTS ENDPOINT (/api/contracts/:id/committee-decision),
  // deliberately, not on consultations or memos: those two record the decision in
  // a dedicated committee_decisions TABLE, and cases have none. Contracts prove
  // the pattern works without one — decision into the entity's own review columns
  // plus the activity log. No new table, no DDL.
  //
  // WHAT IT DOES NOT WRITE: law_cases.status (owner decision). All three sibling
  // endpoints leave their status column alone, and law_cases.status has no value
  // meaning "filed" that anything in the system actually produces.
  app.post("/api/cases/:id/committee-decision", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // FAST-DENY on the actor's own role, then the AUTHORITATIVE department-routed
      // check after the case is loaded — the two-stage shape every sibling endpoint
      // uses. This mirrors the gate inside PATCH /api/cases/:id (the committee
      // block just after its validateStageTransition call); that gate STAYS, because
      // the الأخذ_بالملاحظات arm of the committee — rejectCase — still goes through
      // PATCH and must keep being governed by it.
      const ctx = req.actingContext;
      const ownRoleDecides = ["cases_review_head", "labor_review_head", "branch_manager"].includes(reqUser.role);
      if (!ownRoleDecides && !(ctx && hasEffectiveRole(ctx, String(req.params.id), "cases_review_head", "labor_review_head", "branch_manager"))) {
        return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
      }

      const bodyCheck = workflowDecisionSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const notes = String(req.body?.notes || "").trim();
      const valid = (Object.values(CommitteeDecision) as string[]).includes(decision);
      if (!valid) return res.status(400).json({ error: "قرار اللجنة غير صحيح" });
      // Preserves the rule PATCH /api/cases/:id already enforces on this edge:
      // a return to الأخذ_بالملاحظات must carry the committee's notes, because the
      // notes ARE the work the lawyer is being sent back to do. اعتماد leaves them
      // optional. Same asymmetry as the contracts endpoint.
      if (decision === CommitteeDecision.NEEDS_NOTES && !notes) {
        return res.status(400).json({ error: "يجب تحديد سبب الإرجاع وإضافة ملاحظات اللجنة" });
      }

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      if (lawCase.currentStage !== "إحالة_للجنة_المراجعة") {
        return res.status(400).json({ error: "القضية ليست في مرحلة لجنة المراجعة" });
      }
      // A SETTLEMENT case has no committee, so it has no committee decision either.
      // Its path is InCourtSettlementStages — [استلام, مداولة_الصلح, تحصيل] — which
      // contains neither إحالة_للجنة_المراجعة nor منظورة. The stage guard above does
      // NOT catch this: it tests the case's ACTUAL current_stage, not its path, and
      // a settlement case can be written to the committee stage through the flat
      // transition table (it is not reachable from the ordinary UI, which refuses an
      // off-path move, but it is reachable by direct PATCH). Without this term the
      // APPROVED branch would send it to منظورة — off its own three-stage path — and
      // strand it exactly the way case 4870079661 was stranded on جاهزة_للرفع.
      //
      // 🔴 SCOPED TO IN-COURT ON PURPOSE, and the classification term is NOT
      // redundant. getStagesForClassification consults isSettlementCase ONLY inside
      // the منظورة_بالمحكمة branch; a قيد_الدراسة case carrying the flag resolves to
      // an ordinary UNDER-STUDY array, which does have a committee stage and whose
      // post-committee target genuinely IS جاهزة_للرفع. Refusing that shape would be
      // a behaviour change, not a fix — so it is deliberately still accepted.
      if (lawCase.caseClassification === CaseClassification.IN_COURT && lawCase.isSettlementCase) {
        return res.status(400).json({
          error: "قضية الصلح لا تمر بلجنة المراجعة — مسارها: استلام ← مداولة الصلح ← تحصيل. تُسجَّل النتيجة من مرحلة مداولة الصلح (تم الصلح / لم يتم الصلح)، لا من اللجنة.",
        });
      }
      if (lawCase.pausedAt || lawCase.awaitingCompletion) {
        return res.status(400).json({ error: "القضية في حالة لا تسمح بقرار اللجنة" });
      }
      if (lawCase.status === "مغلق" || lawCase.isArchived) {
        return res.status(400).json({ error: "لا يمكن اتخاذ قرار اللجنة في قضية مغلقة أو مؤرشفة" });
      }

      // AUTHORITATIVE department-routed chair, reproducing PATCH /api/cases/:id's
      // committee block: a case in عمالي is chaired by labor_review_head
      // EXCLUSIVELY, everything else by cases_review_head. branch_manager always.
      {
        const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
        const committeeHead = (!!laborDeptId && lawCase.departmentId === laborDeptId)
          ? "labor_review_head" : "cases_review_head";
        const headDecides = [committeeHead, "branch_manager"].includes(reqUser.role);
        if (!headDecides && !(ctx && hasEffectiveRole(ctx, lawCase.id, committeeHead, "branch_manager"))) {
          return res.status(403).json({ error: "ليس لديك صلاحية لقرار لجنة المراجعة على هذه القضية" });
        }
      }

      // 🔴 THE TARGET STAGE — the whole point of this endpoint.
      //
      // NEEDS_NOTES → الأخذ_بالملاحظات on every path (it is present in all four
      // under-study arrays AND both in-court memo arrays).
      //
      // APPROVED → keyed on caseClassification ALONE. Measured across all eight
      // path arrays, the stage following الأخذ_بالملاحظات is:
      //     UnderStudy General / Commercial / Labor / Admin → جاهزة_للرفع
      //     InCourt Defendant / Plaintiff                   → منظورة
      // Department and clientRole do not change the answer — both in-court memo
      // paths converge on منظورة, so a null or wrong clientRole (which
      // getStagesForClassification silently reads as "plaintiff") cannot affect it.
      //
      // ⚠ DELIBERATELY NOT DERIVED FROM THE RESOLVED PATH. The obvious derivation
      // — stages[indexOf("الأخذ_بالملاحظات") + 1] — has a silent failure mode: when
      // الأخذ_بالملاحظات is absent, indexOf returns -1 and stages[0] is استلام, a
      // DEFINED value, so an `undefined` fallback never fires and the committee
      // would send the case back to reception. That is not hypothetical: removing
      // the review stages from the in-court arrays is an approved future batch.
      // The ternary is exact, needs no department lookup, and cannot drift.
      //
      // ⚠ And NOT index+1 on the committee stage itself: the LINEAR successor of
      // إحالة_للجنة_المراجعة is الأخذ_بالملاحظات in every array — the REJECTION
      // target, not the approval one.
      const isApproved = decision === CommitteeDecision.APPROVED;
      const targetStage: CaseStageValue = isApproved
        ? (lawCase.caseClassification === CaseClassification.IN_COURT ? "منظورة" : "جاهزة_للرفع")
        : "الأخذ_بالملاحظات";

      // Mapped onto the stored review vocabulary, which is a DIFFERENT enum from the
      // wire one: CommitteeDecision is Arabic (اعتماد / يوجد_ملاحظات), reviewDecision
      // is the English ReviewDecision set the FE and PATCH already use.
      const reviewDecision = isApproved ? ReviewDecision.APPROVED : ReviewDecision.REJECTED;

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const noteSuffix = notes ? ` — ${notes}` : "";
      const historyNote = isApproved
        ? `اعتماد اللجنة${noteSuffix}`
        : `إرجاع من اللجنة للأخذ بالملاحظات${noteSuffix}`;

      const updated = await storage.recordCaseCommitteeDecision(lawCase.id, {
        targetStage,
        reviewDecision,
        reviewNotes: notes,
        // 🔴 APPENDS through the shared helper, and CARRIES THE COMMITTEE'S NOTE.
        // PATCH /api/cases/:id OVERWRITES req.body.stageHistory with an entry whose
        // notes are `stageChangeNotes || ""`, so the "اعتماد اللجنة - {notes}" text
        // approveCase composes today is silently discarded and the committee's
        // reasoning never reaches the history. This endpoint is the reason that
        // stops being true.
        stageHistory: appendStageHistory(
          lawCase, targetStage, { id: reqUser.id, name: performerName }, historyNote,
        ) as CaseStageTransition[],
        activityTitle: `تم تغيير المرحلة من ${lawCase.currentStage} إلى ${targetStage}`,
        activityDetails: historyNote,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل تسجيل قرار اللجنة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/committee-decision] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/skip-committee
  // Body: { reason }. REASONED OVERRIDE — "تجاوز لجنة المراجعة". Moves the case
  // from إحالة_للجنة_المراجعة straight to جاهزة_للرفع with NO committee decision,
  // recording who did it and why in case_activity_log (reason is MANDATORY).
  //
  // Deliberately bypasses validateStageTransition — the same precedent the
  // committee-decision paths already set (they compute the target stage and call
  // storage directly). No transition-table entry is added, so this override
  // cannot be reached through the generic stage-advance route.
  //
  // AUTHORIZED ROLES (owner decision, 2026-07): branch_manager + department_head
  // (of the case's own department) + the assigned lawyer. This is INTENTIONALLY
  // BROADER than the committee-DECISION role set (cases_review_head +
  // branch_manager, routes.ts ALLOWED_CASE_TRANSITIONS) — and broader still than
  // the contracts committee, which deliberately excludes department_head
  // ("heads don't override committee decisions"). Skipping the committee is an
  // OWNER-approved override, not a committee decision, so it answers to a
  // different, wider authority. Do NOT "harmonise" this set with the committee
  // chairs — the divergence is the point.
  //
  // FOUR-EYES DOES NOT APPLY HERE, by design. The committee-decision endpoints
  // guard against a DELEGATE standing in for the review head approving work they
  // themselves authored. Here the assigned lawyer — i.e. the author — is an
  // EXPLICITLY authorized actor, so a "can't act on your own work" check would
  // contradict the approved permission model. The mandatory reason + the audit
  // row are the control, not four-eyes.
  app.post("/api/cases/:id/skip-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب تجاوز اللجنة مطلوب" });

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      if (lawCase.currentStage !== "إحالة_للجنة_المراجعة") {
        return res.status(400).json({ error: "القضية ليست في مرحلة لجنة المراجعة" });
      }
      // UNDER-STUDY ONLY. The review committee belongs to the قيد_الدراسة workflow
      // (drafted → internal review → committee → جاهزة_للرفع). A منظورة_بالمحكمة case
      // is already filed: what goes to committee for it is the MEMO (its own entity,
      // with its own lifecycle and its own /committee-decision endpoint), never the
      // case.
      //
      // ⚠ AN IN-COURT CASE CAN NONETHELESS REACH THIS STAGE, and this comment used to
      // deny it — it said the only known occurrence was corrupt seed data
      // (T-1010/T-1011, raw INSERTs that bypassed the state machine). That was wrong.
      // InCourtDefendantMemoStages and InCourtPlaintiffMemoStages BOTH contain
      // مراجعة_داخلية and إحالة_للجنة_المراجعة, so moveToNextStage walks an in-court
      // case in through the ordinary UI. Production case 4870079661 (in-court,
      // مدعى_عليه) did exactly that on 2026-08-05.
      //
      // THE REFUSAL BELOW STAYS ANYWAY, for a different reason than the old one: the
      // SKIP has a fixed جاهزة_للرفع target, which is the under-study post-committee
      // stage and wrong for an in-court case. The committee DECISION endpoint
      // (POST /api/cases/:id/committee-decision) is the path that handles both — it
      // computes the target from caseClassification and routes an in-court case to
      // منظورة. So an in-court case at this stage is not stuck; it just cannot skip.
      if (lawCase.caseClassification !== CaseClassification.UNDER_STUDY) {
        return res.status(400).json({ error: "لا يمكن تجاوز اللجنة لقضية منظورة بالمحكمة" });
      }
      if (lawCase.pausedAt || lawCase.awaitingCompletion) {
        return res.status(400).json({ error: "القضية في حالة لا تسمح بتجاوز اللجنة" });
      }
      if (lawCase.status === "مغلق" || lawCase.isArchived) {
        return res.status(400).json({ error: "لا يمكن تجاوز اللجنة في قضية مغلقة أو مؤرشفة" });
      }

      // Delegation-aware: evaluate the rule against every acting identity (self +
      // any delegator this user currently stands in for, scoped to this case).
      // With no delegation this resolves to exactly the actor → byte-identical to
      // a plain self-check.
      const identities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, lawCase.id).map((i) => ({
            id: i.userId, role: i.role, departmentId: i.departmentId,
          }))
        : [{ id: reqUser.id, role: reqUser.role, departmentId: reqUser.departmentId }];
      const allowed = identities.some((u) =>
        u.role === "branch_manager"
        || (u.role === "department_head" && !!u.departmentId && u.departmentId === lawCase.departmentId)
        || isAssignedLawyer({ id: u.id }, lawCase));
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتجاوز لجنة المراجعة" });
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.skipCaseCommittee(lawCase.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل تجاوز لجنة المراجعة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/skip-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/opponent-response
  // Body: { needsOurResponse: boolean }.
  // CLEARING PATH 1 — the explicit "تم استلام رد الخصم" action, available while
  // the "مطلوب رد من الخصم" indicator is on. Recording the response:
  //   • ALWAYS unsets the flag on every hearing of the case that carries it —
  //     the badge is `.some(...)` across all of them, so only unsetting the rows
  //     actually clears it (adding a newer hearing does nothing);
  //   • when needsOurResponse is true, creates the SAME auto مذكرة جوابية the
  //     موعد_جديد "مطلوب مذكرة" flow creates, via the shared
  //     createResponseMemoForCase — one implementation, not two.
  //
  // AUTHORIZED ROLES: canActOnMohrSettlement — branch_manager | department_head
  // of the case's own department | assigned lawyer, delegation-aware.
  // admin_support excluded, consistent with the MOHR / reopen / صك / appeal actions.
  app.post("/api/cases/:id/opponent-response", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = opponentResponseSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      // Required, explicit boolean — same tri-state discipline as the
      // objectionability question: an unanswered question must be impossible.
      if (typeof req.body?.needsOurResponse !== "boolean") {
        return res.status(400).json({ error: "يجب تحديد ما إذا كنا بحاجة للرد على مذكرة الخصم" });
      }
      const needsOurResponse: boolean = req.body.needsOurResponse;

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      const hearings = await storage.getHearingsByCase(lawCase.id);
      const flagged = hearings.filter((h) => h.opponentResponseRequired);
      if (flagged.length === 0) {
        return res.status(400).json({ error: "لا يوجد رد مطلوب من الخصم على هذه القضية" });
      }
      // 🔴 GATE ALIGNED TO canActOnHearing (owner decision 2026-08-04). It was
      // canActOnMohrSettlement, which meant SETTING and CLEARING this flag answered
      // to DIFFERENT role sets — a user could set a flag they were not allowed to
      // clear. That asymmetry is exactly how the set-and-never-cleared bug class
      // starts, so both ends now use the hearing-level gate, matching every other
      // hearing action and matching the result route that sets the flag.
      //
      // Checked against the FLAGGED hearings, not the case: this route is
      // case-scoped but the flag is a HEARING column. `.some` rather than `.every`
      // because clearing is deliberately BLANKET (clearOpponentResponseFlag unsets
      // every carrying row) — requiring authority over all of them would let one
      // unrelated hearing block a legitimate clear, and the badge itself is
      // `.some(...)` across the case.
      // A LOOP, not `.some()` — canActOnHearing is async as of 2026-08-05 and a
      // sync `.some` would have tested truthy Promises and admitted everyone.
      // `lawCase` is already loaded here, so it is passed as parentCase and the
      // department_head branch costs NO extra query on this route.
      let mayClearOpponentResponse = false;
      for (const h of flagged) {
        if (await canActOnHearing(reqUser, h, req.actingContext, lawCase)) {
          mayClearOpponentResponse = true;
          break;
        }
      }
      if (!mayClearOpponentResponse) {
        return res.status(403).json({ error: "ليس لديك صلاحية لهذا الإجراء" });
      }

      const cleared = await clearOpponentResponseFlag(lawCase.id);

      let createdMemoId: string | null = null;
      if (needsOurResponse) {
        // Anchor the deadline on the case's upcoming session when there is one —
        // same rule as the موعد_جديد flow (3 days before), else +7 days.
        const memo = await createResponseMemoForCase(lawCase, {
          hearingId: hearings.find((h) => h.status === "قادمة")?.id ?? null,
          nextHearingDate: lawCase.nextHearingDate ?? null,
          autoGenerateReason: "رد_على_مذكرة_الخصم",
        });
        createdMemoId = memo.id;
      }

      await logCaseActivityActing(req, {
        caseId: lawCase.id,
        userId: reqUser.id,
        userName: reqUser.name || reqUser.id,
        actionType: "opponent_response_received",
        title: needsOurResponse
          ? "تم استلام رد الخصم — أُنشئت مذكرة جوابية"
          : "تم استلام رد الخصم — لا حاجة للرد",
        details: JSON.stringify({ clearedHearings: cleared, memoId: createdMemoId }),
      });

      const updated = await storage.getCaseById(lawCase.id);
      res.json({ case: updated, clearedHearings: cleared, memoId: createdMemoId });
    } catch (error: any) {
      console.error("[cases/opponent-response] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/appeal-outcome
  // Body: { outcome: "we_appealed" | "opponent_appealed" | "no_appeal" }.
  // Judgment-lifecycle step 3 — the THREE MANUAL routes out of محكوم_حكم_ابتدائي:
  //   • we_appealed       → منظورة_استئناف ("تم الاستئناف"). ADDED 2026-07-28.
  //   • opponent_appealed → منظورة_استئناف ("الخصم استأنف"). Another trigger for
  //     the same outcome is creating a COURT hearing at this stage, handled in
  //     POST /api/hearings; all are valid and land on the same stage.
  //   • no_appeal        → محكوم_حكم_نهائي ("لم يستأنف — الحكم نهائي").
  //     DELIBERATELY MANUAL, never automatic: only the lawyer knows the window
  //     truly lapsed with no filing. Under step 1 محكوم_حكم_نهائي is a RESTING
  //     stage, so the case waits there rather than auto-closing.
  //
  // ⚠ we_appealed COEXISTS WITH THE MEMO HOOK, it does not replace it. FILING
  // the لائحة اعتراضية still promotes the case on its own
  // (promoteCaseOnObjectionFiled) — that memo↔case link is untouched. The button
  // is the manual equivalent for an appeal filed OUTSIDE the system, or ahead of
  // the memo being marked مرفوعة.
  //   • SAME END STATE — both call moveCaseFromPrimaryJudgment(…,
  //     "منظورة_استئناف", …); only the activity actionType/title differ
  //     (appeal_filed vs we_appealed), so the timeline records which route ran.
  //   • THEY CANNOT DOUBLE-FIRE — both are guarded on
  //     currentStage === "محكوم_حكم_ابتدائي". Whichever runs first moves the
  //     stage; the second then no-ops (the memo hook returns early, this
  //     endpoint 400s "متاح فقط لقضية عليها حكم ابتدائي").
  //   • The UI WARNS (does not block) when no non-cancelled لائحة اعتراضية
  //     exists on the case — recording an appeal with no objection memo is a
  //     plausible data-entry slip, but a legitimate one when the filing happened
  //     off-system.
  //
  // ⚠ THE aa1e5c3 DIRECTION RESTRICTION ON opponent_appealed IS REMOVED
  // (owner decision 2026-07-28). It rejected "الخصم استأنف" whenever the primary
  // judgment went against us, on the reasoning that WE would be the appellant.
  // That is wrong on a PARTIAL judgment — the opponent may appeal a partial win
  // — and the owner confirms it happens on a straight ضدنا too. Both sides can
  // appeal the same ruling, so direction no longer gates this at all.
  //
  // AUTHORIZED ROLES: canActOnMohrSettlement — branch_manager | department_head
  // of the case's own department | assigned lawyer, delegation-aware.
  // admin_support excluded, consistent with the MOHR / reopen / صك actions.
  app.post("/api/cases/:id/appeal-outcome", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = appealOutcomeSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const outcome = String(req.body?.outcome ?? "").trim();
      if (outcome !== "we_appealed" && outcome !== "opponent_appealed" && outcome !== "no_appeal") {
        return res.status(400).json({ error: "يجب تحديد نتيجة مهلة الاعتراض" });
      }

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
      if (lawCase.currentStage !== "محكوم_حكم_ابتدائي") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط لقضية عليها حكم ابتدائي" });
      }
      if (!canActOnMohrSettlement(reqUser, lawCase, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لهذا الإجراء" });
      }

      // صك SEAL. All three outcomes leave محكوم_حكم_ابتدائي, so all three are
      // gated — including no_appeal, which ends the objection window and makes the
      // ruling final. Recording that the deadline lapsed on a صك we never received
      // is precisely the state the owner is preventing. The stage check above
      // already guarantees we only reach here from the judgment stage.
      if (await isJudgmentDeedMissing(lawCase.id)) {
        return res.status(400).json({
          error: "يجب إرفاق صك الحكم قبل تسجيل نتيجة مهلة الاعتراض",
        });
      }

      // NO DIRECTION CHECK. The aa1e5c3 rejection of opponent_appealed for a
      // ضدنا/جزئي judgment is gone — see the header comment. Either side can
      // appeal any ruling, so the judgment direction constrains nothing here; it
      // now only shapes which buttons the UI leads with.

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);

      const updated = outcome === "we_appealed"
        ? await moveCaseFromPrimaryJudgment(req, lawCase, "منظورة_استئناف", {
            actorId: reqUser.id,
            actorName: performerName,
            note: "تم رفع الاستئناف من طرفنا",
            // Distinct from the memo hook's "appeal_filed" so the timeline shows
            // WHICH route promoted the case — the لائحة اعتراضية being filed, or
            // this manual record.
            actionType: "we_appealed",
            title: "تم الاستئناف — القضية منظورة استئناف",
          })
        : outcome === "opponent_appealed"
        ? await moveCaseFromPrimaryJudgment(req, lawCase, "منظورة_استئناف", {
            actorId: reqUser.id,
            actorName: performerName,
            note: "الخصم استأنف الحكم الابتدائي",
            actionType: "opponent_appealed",
            title: "الخصم استأنف — القضية منظورة استئناف",
          })
        : await moveCaseFromPrimaryJudgment(req, lawCase, "محكوم_حكم_نهائي", {
            actorId: reqUser.id,
            actorName: performerName,
            note: "انتهت مهلة الاعتراض دون استئناف — الحكم نهائي",
            actionType: "judgment_became_final",
            title: "لم يستأنف الخصم — أصبح الحكم نهائياً",
          });

      if (!updated) return res.status(500).json({ error: "فشل تحديث حالة القضية" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/appeal-outcome] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // GET /api/cases/:id/judgments — سجل الأحكام, the case's ruling chain.
  //
  // Returns `{ judgments: [ …CaseJudgment, hasDeed ] }` oldest-first by `sequence`.
  // This is the FIRST caller of storage.getJudgmentsByCase, which has existed
  // unused since batch 1.
  //
  // 🔴 READ GATE = requireAuth ONLY, matching the owner's dated decision (2026-08-04)
  // that every employee may read any case, any صك and any ضبط — and matching the
  // read this sits behind: GET /api/cases is requireAuth + getAllCases() with NO
  // scoping, so every authenticated user already holds every case row. Anything
  // narrower here would repeat the mistake the deed-attachment GET and the
  // minutes-attachment GET were both corrected for: a gate narrower than the list
  // that leads to it, producing a silently empty panel rather than a refusal.
  // viewer reaches this and nothing more — viewerWriteGuard 403s every non-GET.
  //
  // hasDeed asks judgment_attachments — THIS ruling's own صك — never
  // case_attachments, which holds one row per CASE and would report an older
  // cycle's file as satisfying a newer ruling. Same rule batch 4 established for
  // currentJudgmentHasDeed; one batched query for the whole chain.
  //
  // ROUTE ORDER: four segments after /api, so /api/cases/:id (three) cannot
  // capture it — the shadowing note above GET /api/cases/:id already cleared this
  // exact path by name. Safe at any position.
  app.get("/api/cases/:id/judgments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      const judgments = await storage.getJudgmentsByCase(lawCase.id);
      const withDeed = await storage.getJudgmentIdsWithAttachment(judgments.map((j) => j.id));
      res.json({
        judgments: judgments.map((j) => ({ ...j, hasDeed: withDeed.has(j.id) })),
      });
    } catch (error: any) {
      console.error("[cases/judgments GET] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ في جلب سجل الأحكام" });
    }
  });

  // GET /api/judgments/:judgmentId/deed-attachment           — metadata
  // GET /api/judgments/:judgmentId/deed-attachment/download  — the file
  //
  // THE READ PATH FOR ONE RULING'S صك. judgment_attachments already holds a
  // SEPARATE file per ruling (judgments/<judgmentId>/<uuid>) and the سجل الأحكام
  // panel already prints "الصك مرفق" per ruling — but nothing could serve a
  // SPECIFIC ruling's deed, so a superseded ruling's صك had no download path at
  // all. The case-level route cannot stand in for one: it reads
  // case_attachments, which holds ONE row per CASE, so it always answers with
  // the CURRENT cycle's file — exactly the substitution batch 4 forbade when it
  // made hasDeed ask judgment_attachments instead.
  //
  // 🔴 READ GATE = requireAuth ONLY (owner decision 2026-08-04: every employee
  // may read any case, any صك and any ضبط). The same rule and the same reasoning
  // as GET /api/cases/:id/deed-attachment and GET /api/cases/:id/judgments
  // directly above — and it must be the same, because this serves the panel that
  // route feeds. Anything narrower would repeat the mistake both of those were
  // corrected for: a gate narrower than the read that leads to it, producing a
  // control that silently shows nothing rather than a refusal. viewer reaches
  // these and nothing more — viewerWriteGuard 403s every non-GET before any
  // handler runs.
  //
  // ⚠ NO WRITE ROUTE IS ADDED. judgment_attachments is still written ONLY by the
  // case-level POST/DELETE dual-write, which owns the reference-counted blob
  // delete (one Object-Storage key can be named by a row in each table). A
  // second writer here would break that accounting.
  //
  // ⚠ ONE DELIBERATE ASYMMETRY between the two routes, and it is the endpoint
  // contract rather than an oversight: the METADATA route answers
  // `{ attachment: null }` for a ruling with no file, while the DOWNLOAD route
  // 404s. `{attachment: …|null}` is the shape both sibling GETs return and the
  // shape SingleAttachmentControl documents and parses; making it 404 instead
  // would push a normal, expected state through the component's catch, which
  // renders the SAME empty box it renders for a genuine read failure — the
  // indistinguishable-silent-failure class this codebase keeps paying for.
  // There is nothing to stream for a missing file, so download says so out loud.
  //
  // ROUTE ORDER — the documented trap. Express matches in REGISTRATION ORDER and
  // a :param is a catch-all for one segment, so a literal path registered AFTER
  // its :id sibling is captured and 404s SILENTLY (the /api/hearings/ring-state
  // debugging round). Findings for this commit: these are the FIRST
  // /api/judgments routes in the file — there is no /api/judgments/:id to be
  // captured by — and there is no /api/:param route anywhere, so no earlier
  // route of matching segment count can capture either path. Safe at this
  // position, beside the سجل الأحكام read they serve.
  // 🔴 A FUTURE /api/judgments/:id MUST BE REGISTERED AFTER THESE TWO.
  // The whole-file sweep (every literal path against every earlier same-method
  // :param route of matching segment count) was re-run: no shadowed route.
  app.get("/api/judgments/:judgmentId/deed-attachment", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const att = await storage.getJudgmentAttachment(String(req.params.judgmentId));
      // `missing` mirrors the contracts convention: runtime-derived on the
      // response, never stored — the same line the case-deed and
      // hearing-minutes GETs return, so the shared control renders identically
      // on all four surfaces.
      res.json({ attachment: att ? { ...att, missing: !isAttachmentObjectKey(att.filePath) } : null });
    } catch (error: any) {
      console.error("[judgments/deed-attachment GET] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Same gate and same reasoning as the metadata route above; the two must agree
  // or the control fetches a file it cannot then open. Streams via the SHARED
  // streamAttachmentToResponse — the one implementation of the subtle
  // stream-error translation (a JSON envelope only while no bytes have gone
  // out), reused verbatim from the case-deed download rather than re-written.
  app.get("/api/judgments/:judgmentId/deed-attachment/download", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const att = await storage.getJudgmentAttachment(String(req.params.judgmentId));
      if (!att) return res.status(404).json({ error: "لا يوجد صك مرفق على هذا الحكم" });
      if (!isAttachmentObjectKey(att.filePath)) {
        return res.status(410).json({ error: "الملف مفقود — يرجى إعادة الرفع من جديد" });
      }
      const safeAscii = att.fileName.replace(/[^\x20-\x7E]/g, "_");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      );
      res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
      if (att.fileSize) res.setHeader("Content-Length", String(att.fileSize));
      streamAttachmentToResponse(attachmentObjectStore, att, res, "judgments/deed-attachment download");
    } catch (error: any) {
      console.error("[judgments/deed-attachment download] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/cases/:id/appeal-ruling
  // Body: { outcome: "affirmed" | "remanded_first_instance", judgmentDeedReceivedDate?,
  //         objectionWindowDays?, notes? }.
  //
  // THE APPEAL COURT'S RULING on a case sitting at منظورة_استئناف.
  //
  // 🔴 KEPT, NOT SUPERSEDED, now that batch 5.3 records a remand from the
  // hearing-result dialog. This endpoint exists for an appeal ruling reached with
  // NO SESSION RECORDED IN OUR SYSTEM — which is why it writes hearingId: null and
  // why findPrimaryJudgmentHearing carries a fallback for exactly that shape. The
  // two doors split cleanly: the hearing path when a session exists, this when it
  // does not. They share appealRulingTargetStage so they cannot disagree about
  // where a remanded case lands.
  //
  // ⚠ ONE DELIBERATE DIVERGENCE: this endpoint writes outcome NULL on a remand
  // (no session was observed, so no side is known), while the hearing path KEEPS
  // the outcome the lawyer recorded at the session. Same event, two knowledge
  // states, two honest answers.
  //
  // 🔴 A SIBLING OF /appeal-outcome, NOT AN OVERLOAD OF IT — the two answer
  // different questions at different stages and must not merge:
  //   • /appeal-outcome runs at محكوم_حكم_ابتدائي and records what happened during
  //     OUR OBJECTION WINDOW (we appealed / the opponent appealed / nobody did).
  //     Its outcomes are about who filed, not about who won.
  //   • THIS runs at منظورة_استئناف and records what the appeal court DECIDED.
  // Folding them together would have put two unrelated vocabularies behind one
  // `outcome` field whose legal values depend on the case's current stage — and
  // the stage guard on each is what keeps them from double-firing.
  //
  // TWO OUTCOMES:
  //   affirmed                — the ruling below stands. New judgment row (degree
  //                             استئنافي, outcome inherited from the ruling it
  //                             upheld), case → محكوم_حكم_نهائي on the EXISTING
  //                             transition edge.
  //   remanded_first_instance — إعادة للدرجة الأولى. The ruling below ceases to
  //                             stand and the case goes back to first instance:
  //                             the prior judgment is stamped superseded, a new
  //                             appeal-degree row is written with outcome NULL,
  //                             and the case → منظورة on the edge added in batch 2.
  //
  // 🔴 NOT CALLED نقض, and that is a correctness point. نقض is SUPREME-COURT
  // cassation, already spent in this codebase on MemoType.CASSATION ("لائحة_نقض")
  // and LegalDeadlineType.cassation ("مهلة النقض") — both stored values with real
  // rows. This is the APPEAL court sending the case back to first instance, which
  // is why the target is منظورة. "إعادة للدرجة الأولى" says exactly that and
  // competes with nothing.
  //
  // NEITHER OUTCOME OPENS AN OBJECTION WINDOW (owner-settled): an appeal ruling
  // is final by nature and the remand ruling's own صك is not objectionable.
  // Cassation is out of scope.
  //
  // ⚠ THE REMAND DOES NOT RECUR. At most one per case, so at most three rulings.
  // Nothing here enforces that cap — the model does not refuse a fourth, it
  // simply is not built for one.
  //
  // AUTHORIZED ROLES: canActOnMohrSettlement — branch_manager | department_head of
  // the case's own department | assigned lawyer, delegation-aware. admin_support
  // EXCLUDED, matching the appeal-outcome / صك-receipt / reopen / MOHR gates: a
  // court's ruling is a legal act, not a clerical one. This is also exactly why
  // the new منظورة_استئناف → منظورة transition does NOT copy the مشطوبة → منظورة
  // role set, which admits admin_support.
  app.post("/api/cases/:id/appeal-ruling", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = appealRulingSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const outcome = String(req.body?.outcome ?? "").trim();
      if (
        outcome !== AppealRulingOutcome.AFFIRMED &&
        outcome !== AppealRulingOutcome.REMANDED_FIRST_INSTANCE
      ) {
        return res.status(400).json({ error: "يجب تحديد نتيجة حكم الاستئناف (تأييد / إعادة للدرجة الأولى)" });
      }
      const rulingOutcome = outcome as AppealRulingOutcomeValue;

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
      if (lawCase.currentStage !== "منظورة_استئناف") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط لقضية منظورة استئنافاً" });
      }
      if (!canActOnMohrSettlement(reqUser, lawCase, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتسجيل حكم الاستئناف" });
      }

      // The ruling being reviewed. Its presence is REQUIRED: an appeal ruling that
      // supersedes nothing is not something this endpoint can represent, and on a
      // quash there would be no row to stamp superseded.
      const priorJudgment = await currentJudgmentFor(lawCase.id);
      if (!priorJudgment) {
        return res.status(400).json({ error: "لا يوجد حكم سابق مسجَّل على هذه القضية" });
      }

      // Optional deed fields — validated with the SAME rules as /judgment-deed so
      // the two entry points cannot disagree about what a valid window is.
      const rawReceived = String(req.body?.judgmentDeedReceivedDate ?? "").trim();
      if (rawReceived && isNaN(new Date(rawReceived).getTime())) {
        return res.status(400).json({ error: "تاريخ استلام الصك غير صالح" });
      }
      const rawWindow = req.body?.objectionWindowDays;
      let windowDays: number | null = null;
      if (rawWindow !== undefined && rawWindow !== null && String(rawWindow).trim() !== "") {
        const parsed = Number(rawWindow);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
          return res.status(400).json({ error: "مهلة الاعتراض يجب أن تكون عدد أيام صحيح بين 1 و 365" });
        }
        windowDays = parsed;
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const isRemand = rulingOutcome === AppealRulingOutcome.REMANDED_FIRST_INSTANCE;
      const payload = appealRulingPayload(rulingOutcome, priorJudgment);

      // WRITE 1 — the new judgment row, and (on a quash) the superseded stamp on
      // the prior one, both inside the service's single transaction along with the
      // mirror refresh. Ordered BEFORE the stage move on purpose: if this throws,
      // the case stays at منظورة_استئناف and the action can simply be retried,
      // whereas a moved case with no judgment row would be a silent gap.
      const { judgment } = await recordJudgment({
        caseId: lawCase.id,
        // No hearing: this endpoint exists precisely for an appeal ruling reached
        // without a session recorded in the system. When a session IS recorded,
        // the hearing-result handler creates the row instead.
        hearingId: null,
        degree: payload.degree,
        outcome: payload.outcome,
        isFinal: payload.isFinal,
        opensWindow: payload.opensWindow,
        recordedBy: reqUser.id,
        supersedesJudgmentId: isRemand ? priorJudgment.id : null,
      });

      // WRITE 2 — the ruling's own صك, when it was supplied. Routed through the
      // same single writer as /judgment-deed, so the mirror lands correctly
      // whichever door the date came through.
      let deedDeadline: string | null = null;
      if (rawReceived) {
        const receipt = await recordDeedReceipt({
          judgmentId: judgment.id,
          receivedDate: rawReceived,
          objectionWindowDays: windowDays,
        });
        deedDeadline = receipt.deadline;
      }

      // WRITE 3 — the stage. affirmed → محكوم_حكم_نهائي (existing edge);
      // remanded_first_instance → منظورة (the edge added in batch 2). The transition
      // table is not consulted here, matching every sibling judgment-lifecycle
      // action (moveCaseFromPrimaryJudgment, skip-committee, reopen): those edges
      // exist so the GENERIC advance route can offer them, and this endpoint is
      // the authorised path with its own gate.
      const targetStage = appealRulingTargetStage(rulingOutcome);
      const note = String(req.body?.notes ?? "").trim() || (isRemand
        ? "حكم الاستئناف — إعادة الدعوى للدرجة الأولى"
        : "تأييد الحكم — أصبح الحكم نهائياً");
      const updated = await storage.updateCase(lawCase.id, {
        currentStage: targetStage,
        stageHistory: appendStageHistory(
          lawCase, targetStage, { id: reqUser.id, name: performerName }, note,
        ),
      } as Partial<LawCase>);
      if (!updated) return res.status(500).json({ error: "فشل تحديث حالة القضية" });

      // WRITE 4 — the activity row. Records WHICH ruling superseded which, so the
      // timeline explains a case that went back to منظورة after an appeal rather
      // than appearing to have jumped backwards on its own.
      await logCaseActivityActing(req, {
        caseId: lawCase.id,
        userId: reqUser.id,
        userName: performerName,
        actionType: isRemand ? "appeal_ruling_remanded" : "appeal_ruling_affirmed",
        title: isRemand
          ? "حكم الاستئناف — إعادة الدعوى للدرجة الأولى"
          : "حكم الاستئناف — تأييد الحكم، أصبح نهائياً",
        previousValue: "منظورة_استئناف",
        newValue: targetStage,
        details: JSON.stringify({
          outcome: rulingOutcome,
          judgmentId: judgment.id,
          judgmentSequence: judgment.sequence,
          supersededJudgmentId: isRemand ? priorJudgment.id : null,
          deedReceivedDate: rawReceived || null,
          objectionDeadline: deedDeadline,
        }),
      });

      res.json({ case: updated, judgment, supersededJudgmentId: isRemand ? priorJudgment.id : null });
    } catch (error: any) {
      console.error("[cases/appeal-ruling] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/judgment-deed
  // Body: { judgmentDeedReceivedDate, objectionWindowDays? }.
  // Judgment-lifecycle step 2 — records (or corrects) the date the صك was
  // received on a case at محكوم_حكم_ابتدائي, and derives the objection deadline
  // from it: deadline = receiptDate + (objectionWindowDays ?? 30).
  //
  // Recording the receipt is what clears the derived "بانتظار استلام الصك"
  // indicator on the cases list — the indicator is `stage === محكوم_حكم_ابتدائي
  // AND judgmentDeedReceivedDate empty`, so writing the date clears it with no
  // clearing code anywhere.
  //
  // If the primary judgment was objectionable (ضدنا|جزئي with the lawyer's
  // objectionFeasible assessment on the hearing) the لائحة اعتراضية memo is
  // created HERE with the computed deadline, which then drives the existing
  // checkMemoDeadlines reminders. Re-posting with a corrected date RE-DATES the
  // same memo instead of creating a second one (ensureObjectionMemoForCase).
  //
  // AUTHORIZED ROLES: canActOnMohrSettlement — branch_manager | department_head
  // of the case's own department | assigned lawyer, delegation-aware. Same set
  // the MOHR and reopen actions use; admin_support excluded, consistent with those.
  app.post("/api/cases/:id/judgment-deed", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = recordJudgmentDeedSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      // 🔴 THE GATE IS NOW THE JUDGMENT RECORD, NOT THE STAGE (batch 2).
      // It was `currentStage === "محكوم_حكم_ابتدائي"`, which asked the wrong
      // question in both directions:
      //   • TOO NARROW — a صك is issued for EVERY ruling. A منظورة ruling marked
      //     NOT objectionable goes straight to محكوم_حكم_نهائي and never visits
      //     the first-instance stage, so its deed could not be recorded at all;
      //     that is the 8-of-8 production population. An APPEAL ruling has a صك
      //     too, and the case is at محكوم_حكم_نهائي by then.
      //   • TOO WIDE in a different sense — it accepted any case parked on that
      //     stage even with no ruling on record to attach the receipt to.
      // The new question is exactly the right one: does this case HAVE a current
      // ruling awaiting (or holding) its صك?
      //
      // ⚠ EXISTENCE, NOT EMPTINESS. Deliberately not "…and its deed date is
      // empty": this endpoint also CORRECTS a receipt date (the dialog's "تعديل"
      // button), and re-dating recomputes the objection deadline and re-dates the
      // لائحة اعتراضية memo. Gating on emptiness would make the correction path
      // 400 — the exact behaviour the memo re-dating exists to support.
      const judgment = await currentJudgmentFor(lawCase.id);
      if (!judgment) {
        return res.status(400).json({ error: "لا يوجد حكم مسجَّل على هذه القضية لتسجيل استلام صكه" });
      }
      if (!canActOnMohrSettlement(reqUser, lawCase, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتسجيل استلام الصك" });
      }

      const receivedDate = String(req.body?.judgmentDeedReceivedDate ?? "").trim();
      if (!receivedDate) {
        return res.status(400).json({ error: "يجب إدخال تاريخ استلام الصك" });
      }
      const receivedAt = new Date(receivedDate);
      if (isNaN(receivedAt.getTime())) {
        return res.status(400).json({ error: "تاريخ استلام الصك غير صالح" });
      }

      // NULL window = the 30-day default. An explicit value is stored so the
      // القضاء المستعجل 10-day window survives a later edit of the date.
      const rawWindow = req.body?.objectionWindowDays;
      let windowDays: number | null = null;
      if (rawWindow !== undefined && rawWindow !== null && String(rawWindow).trim() !== "") {
        const parsed = Number(rawWindow);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
          return res.status(400).json({ error: "مهلة الاعتراض يجب أن تكون عدد أيام صحيح بين 1 و 365" });
        }
        windowDays = parsed;
      }
      // 🔴 ROUTED THROUGH THE SINGLE WRITER (batch 2). This used to compute the
      // deadline inline and call storage.updateCase with the two mirror columns.
      // recordDeedReceipt writes the JUDGMENT row's deed fields and refreshes the
      // law_cases mirror in ONE transaction, so the scalars can never describe a
      // ruling the judgment record disagrees with. The deadline arithmetic moved
      // to the service unchanged — same computation, one implementation.
      const { deadline: deadlineStr, effectiveWindow } = await recordDeedReceipt({
        judgmentId: judgment.id,
        receivedDate,
        objectionWindowDays: windowDays,
      });

      // Re-read so the response carries the refreshed mirror. The service wrote
      // law_cases inside its transaction; this row is that write's result.
      const updated = await storage.getCaseById(lawCase.id);
      if (!updated) return res.status(500).json({ error: "فشل تسجيل استلام الصك" });

      // 🔴 BATCH 4 — READ FROM THE JUDGMENT ROW, NOT FROM A HEARING SCAN.
      // This used to call findPrimaryJudgmentHearing and re-derive the answer from
      // that hearing's judgment_side + objection_feasible columns. Two reasons it
      // moved, and the second is the important one:
      //   • the scan picks the latest NON-FINAL حكم hearing, which on a remanded
      //     case is the hearing of the QUASHED ruling — so the receipt for ruling
      //     #3 was judged against ruling #1's objectionability;
      //   • opens_window is STORED INTENT, decided when the ruling was recorded
      //     from the answer the lawyer gave THEN. Re-deriving it lets a later edit
      //     of the hearing change whether a window that has already run existed.
      // The judgment row carries both facts about the ruling this receipt belongs
      // to, so the hearing is no longer consulted here at all.
      //
      // ⚠ THE QUASH IS EXCLUDED BY opens_window, not by a stage or type test: an
      // appeal ruling never opens a window, so no لائحة اعتراضية is ever raised for
      // one — while its صك is still required by the close gate, which keys on the
      // document and never on the window.
      const judgmentType = String(judgment.outcome || "");
      const objectionDue =
        judgment.opensWindow &&
        (judgmentType === "ضدنا" || judgmentType === "جزئي");

      let memoOutcome: { action: string; memoId?: string } = { action: "not_applicable" };
      if (objectionDue) {
        // 🔴 KEYED TO THIS RULING. The memo is found (and re-dated) only if it
        // belongs to THIS judgment's hearing; a previous cycle's objection memo is
        // never touched, and a new cycle gets a memo of its own.
        //
        // THE OLD MEMO IS DELIBERATELY NOT CANCELLED — see the report. In short: a
        // filed لائحة اعتراضية is a real document with a real filing history, and
        // the quash that superseded its judgment does not un-file it. Cancelling
        // would also fight the existing lifecycle, which already cancels a case's
        // open memos when any hearing result is recorded (with the objection
        // deliberately excluded, because a ruling CREATES that work rather than
        // spending it). Deciding an old objection is spent is a lawyer's call.
        memoOutcome = await ensureObjectionMemoForCase(updated, {
          deadline: deadlineStr,
          judgmentType,
          hearingId: judgment.hearingId,
        });
      }

      await logCaseActivityActing(req, {
        caseId: lawCase.id,
        userId: reqUser.id,
        userName: reqUser.name || reqUser.id,
        actionType: "judgment_deed_received",
        title: "تسجيل استلام الصك",
        details: JSON.stringify({
          receivedDate,
          objectionWindowDays: effectiveWindow,
          objectionDeadline: objectionDue ? deadlineStr : null,
          objectionMemo: memoOutcome,
        }),
      });

      res.json({ ...updated, objectionDeadline: objectionDue ? deadlineStr : null, objectionMemo: memoOutcome });
    } catch (error: any) {
      console.error("[cases/judgment-deed] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/reopen
  // Body: { targetStage, notes?, <the one number field the target needs>? }.
  // Reopens a CLOSED case (مقفلة) at a caller-chosen stage. This is the "PART B"
  // referenced by the defendant settlement-failure close (:8442, :8462), widened
  // by owner decision (2026-07) from "settlement-failed cases" to ANY closed case.
  //
  // Deliberately bypasses validateStageTransition — the same precedent
  // skip-committee sets above. NO from:"مقفلة" edge is added to
  // ALLOWED_CASE_TRANSITIONS, so مقفلة stays terminal for the generic
  // stage-advance route and this endpoint is the only way out of it.
  //
  // AUTHORIZED ROLES: branch_manager + department_head (of the case's own
  // department) + the assigned lawyer — i.e. canActOnMohrSettlement verbatim.
  // admin_support is EXCLUDED by owner decision, which makes this INTENTIONALLY
  // NARROWER than the early-CLOSE gate (cases.tsx canEarlyCloseCase includes
  // admin_support): admin support can close a case but not bring it back.
  //
  // TARGET STAGES: the case's own resolved path PLUS منظورة always (option A).
  // منظورة is absent from InCourtSettlementStages, yet reopening into court is
  // the entire promise the defendant close makes to the user ("يمكن إعادة فتحها
  // لاحقاً عند رفع الخصم للدعوى"), so it is offered unconditionally and the
  // lifecycle flags below make the path re-resolve to an array that contains it.
  app.post("/api/cases/:id/reopen", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = reopenCaseSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      if (lawCase.currentStage !== "مقفلة") {
        return res.status(400).json({ error: "يمكن إعادة الفتح فقط لقضية مقفلة" });
      }

      // AUTHORIZED ROLES: canActOnMohrSettlement — branch_manager | own-dept
      // department_head | assigned lawyer. (a1e3456 briefly narrowed this to the
      // department tier; REVERTED — the narrowing was never requested. Reopen sits
      // with the other five canActOnMohrSettlement case actions, unchanged.)
      if (!canActOnMohrSettlement(reqUser, lawCase, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإعادة فتح القضية" });
      }

      // PATH RESOLUTION SAFETY — refuse rather than guess. getStagesForClassification
      // SILENTLY falls back to UnderStudyGeneralStages when the department name
      // isn't one of the four canonical labels, which would offer a labor case the
      // General (ناجز) path. Resolve the name server-side (the /taradi idiom) and
      // reject when it can't be resolved for an under-study case.
      const department = lawCase.departmentId
        ? await storage.getDepartmentById(lawCase.departmentId)
        : null;
      const departmentName = department?.name;
      const CANONICAL_DEPARTMENTS = ["عام", "تجاري", "عمالي", "إداري"];
      if (
        lawCase.caseClassification === CaseClassification.UNDER_STUDY &&
        (!departmentName || !CANONICAL_DEPARTMENTS.includes(departmentName))
      ) {
        return res.status(400).json({ error: "تعذّر تحديد مسار القضية — حدّد القسم أولاً" });
      }

      const targetStage = String(req.body?.targetStage ?? "").trim();
      if (!targetStage) {
        return res.status(400).json({ error: "يجب اختيار المرحلة التي ستُفتح عندها القضية" });
      }
      const allowedTargets = getReopenTargetStages(
        (lawCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue,
        departmentName,
        lawCase.clientRole || undefined,
        !!lawCase.memoRequired,
        !!lawCase.isSettlementCase,
      );
      if (!allowedTargets.includes(targetStage as CaseStageValue)) {
        return res.status(400).json({ error: "المرحلة المختارة ليست ضمن مسار هذه القضية" });
      }

      // Required number for the TARGET stage. Prompt/enforce only when the stage
      // needs one AND the row doesn't already carry it — a commercial case
      // reopening at مداولة_الصلح still has the taradiNumber it captured on
      // تراضي-entry (closure clears nothing), so it must not be re-demanded.
      const requirement = stageNumberRequirement(targetStage as CaseStageValue, departmentName);
      let numberField: { field: CaseNumberField; value: string } | null = null;
      if (requirement) {
        const supplied = typeof (req.body as Record<string, unknown>)[requirement.field] === "string"
          ? String((req.body as Record<string, unknown>)[requirement.field]).trim()
          : "";
        const stored = String((lawCase as unknown as Record<string, unknown>)[requirement.field] ?? "").trim();
        if (!supplied && !stored) {
          // Same Arabic strings the advance flow already 400s with, so the two
          // paths are indistinguishable to the user.
          const MISSING_NUMBER_ERRORS: Record<string, string> = {
            taradiNumber: "يجب إدخال رقم الطلب في تراضي",
            mohrNumber: "يجب إدخال رقم الدعوى في التسوية الودية",
            najizNumber: "يجب إدخال رقم القيد في ناجز",
            moeenNumber: "يجب إدخال رقم القيد في معين",
            courtCaseNumber: "يرجى إدخال رقم الدعوى في المحكمة",
          };
          return res.status(400).json({ error: MISSING_NUMBER_ERRORS[requirement.field] || "يجب إدخال الرقم المطلوب" });
        }
        // Write only when the user actually supplied something — never blank out
        // a stored number with an empty submission.
        if (supplied) numberField = { field: requirement.field, value: supplied.substring(0, 100) };
      }

      // LIFECYCLE FLAGS (owner decision 1). Reopening INTO COURT must leave the
      // case in a state where getStagesForClassification resolves to an array
      // that CONTAINS the target — otherwise the stage lands off-path and the
      // progress bar collapses onto استلام (the class of bug fixed in 3fcd4e3).
      //   • isSettlementCase=false — with it true the resolver returns
      //     InCourtSettlementStages BEFORE consulting memoRequired/clientRole,
      //     and that array has no منظورة. Same idiom as the "استكمال إجراءاتها"
      //     branch (case-progress-bar.tsx).
      //   • classification + clientRole — mirrors the auto-promotion the PATCH
      //     handler already performs for these targets (routes.ts :2481-2500):
      //     منظورة is also the last stage of every قيد_الدراسة array, so without
      //     this a case would sit in court still classified قيد_الدراسة.
      const flags: ReopenLifecycleFlags = {};
      if (targetStage === "منظورة" || targetStage === "منظورة_استئناف") {
        flags.isSettlementCase = false;
        if (lawCase.caseClassification === CaseClassification.UNDER_STUDY) {
          flags.caseClassification = CaseClassification.IN_COURT;
          if (!lawCase.clientRole) flags.clientRole = "مدعي";
        }
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.reopenCase(lawCase.id, {
        targetStage,
        notes: String(req.body?.notes ?? "").trim(),
        performedBy: reqUser.id,
        performerName,
        numberField,
        flags,
      });
      if (!updated) return res.status(500).json({ error: "فشل إعادة فتح القضية" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/reopen] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/close-no-response
  // Body: { notes? }. Closes a case parked at استكمال_البيانات because the client
  // never supplied the missing documents/data, recording WHAT WAS MISSING in the
  // closure. Owner-requested ("أرشفة لعدم التجاوب").
  //
  // ⚠ DELIBERATELY NOT the generic PATCH early-close (:3304). That path cannot
  // resolve the missing-data text — it never reads stageHistory or the activity
  // log — and would need the client to send text the SERVER already holds.
  //
  // CLOSE ONLY — isArchived is NOT set (owner decision). The case stays visible
  // in the list as an ordinary closed case and autoArchiveClosedCases archives it
  // 6 months later like every other closure. Archiving here would only skip that
  // grace period and drop the case out of hearing/memo auto-creation immediately.
  //
  // GATED ON THE STAGE, NOT ON awaitingCompletion. A case reaches
  // استكمال_البيانات two ways, and only ONE sets the latch:
  //   Path A — the ordinary استلام → استكمال_البيانات advance. awaitingCompletion
  //            stays FALSE; the missing-data text is the MANDATORY stage note
  //            (case-progress-bar.tsx isReceptionToDataCompletion) and lands in
  //            stageHistory only. This is the COMMON path.
  //   Path B — POST /await-completion. Latch true, saved_stage set, reason in
  //            case_activity_log AND stageHistory.
  // Gating on the latch would hide the button from every Path-A case.
  //
  // ROLES: the CLOSE tier — branch_manager | admin_support | own-dept
  // department_head | assigned lawyer. Inlined verbatim from the sibling
  // /await-completion and /pause routes on this same stage (and mirroring
  // canEarlyCloseCase on the FE) rather than reusing canActOnMohrSettlement,
  // which EXCLUDES admin_support — and admin support is precisely the role
  // chasing the client for the documents. Wider than /reopen, on purpose.
  app.post("/api/cases/:id/close-no-response", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D' Pattern-A gate: type check only; the handler's own checks stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      const isAssigned =
        lawCase.primaryLawyerId === reqUser.id ||
        lawCase.responsibleLawyerId === reqUser.id ||
        (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(reqUser.id));
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        // !!reqUser.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
        (reqUser.role === "department_head" && !!reqUser.departmentId && lawCase.departmentId === reqUser.departmentId) ||
        isAssigned;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإغلاق هذه القضية" });

      if (lawCase.currentStage !== CaseStage.DATA_COMPLETION) {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط لقضية في مرحلة استكمال المرفقات والبيانات" });
      }
      if (lawCase.status === "مغلق" || lawCase.isArchived) {
        return res.status(400).json({ error: "القضية مغلقة أو مؤرشفة بالفعل" });
      }
      if (lawCase.pausedAt) {
        return res.status(400).json({ error: "القضية معلّقة — أزل التعليق أولاً" });
      }

      // RESOLVE WHAT WAS MISSING. There is no dedicated column for it anywhere
      // (case_activity_log has no metadata JSONB, unlike its consultation /
      // contract / memo siblings), so the text is recovered in priority order:
      //   1. the latest await_completion activity row's details  — Path B, exact.
      //   2. the LAST stageHistory entry for استكمال_البيانات    — Paths A and B.
      //   3. ""                                                  — never guess.
      // Step 2 covers step 1's cases too, but the activity row is preferred: it
      // holds the reason verbatim, while the history note carries a prefix.
      let missingData = "";
      try {
        const activities = await storage.getCaseActivities(lawCase.id);
        // getCaseActivities is already ordered createdAt DESC, so the first
        // match IS the latest — no re-sort needed.
        const latestAwait = activities.find((a) => a.actionType === "await_completion");
        missingData = String(latestAwait?.details ?? "").trim();
      } catch (e) {
        // Degrade to the stageHistory fallback rather than failing the close —
        // never block a legitimate workflow action on an audit-trail read.
        console.error("[cases/close-no-response] activity lookup failed, falling back to stageHistory:", e);
      }
      if (!missingData) {
        const history = Array.isArray(lawCase.stageHistory) ? lawCase.stageHistory : [];
        const lastEntry = [...history].reverse().find((h) => h?.stage === CaseStage.DATA_COMPLETION);
        // Strip the prefix awaitCaseCompletion writes, so Path B via this branch
        // yields the same bare text Path A does.
        const AWAIT_HISTORY_PREFIX = "بانتظار استكمال المرفقات والبيانات — ";
        const raw = String(lastEntry?.notes ?? "").trim();
        missingData = raw.startsWith(AWAIT_HISTORY_PREFIX)
          ? raw.slice(AWAIT_HISTORY_PREFIX.length).trim()
          : raw;
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.closeCaseForNoResponse(lawCase.id, {
        missingData,
        notes: String(req.body?.notes ?? "").trim(),
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل إغلاق القضية" });

      // Same cleanup every other close path performs — hearings, memos, field
      // tasks and the opponent-response flag. Skipping it is what left orphans
      // on judgment-closed cases before b41553a.
      await cancelOpenCaseChildrenOnClose(lawCase.id);

      res.json(updated);
    } catch (error: any) {
      console.error("[cases/close-no-response] error:", error);
      res.status(500).json({ error: error.message || "فشل إغلاق القضية" });
    }
  });

  // POST /api/cases/:id/correct-starting-stage
  // Body: { toSettlement: boolean, notes? }. Corrects a MIS-REGISTERED in-court
  // case between the محكمة and مداولة الصلح openings.
  //
  // This exists because the two axes must move TOGETHER — see
  // storage.correctCaseStartingStage for why writing isSettlementCase alone
  // strands currentStage off its resolved array. It is NOT reachable through the
  // generic PATCH, which would do exactly that.
  //
  // The window is the SHARED startingStageCorrectionBlockedReason, so the FE
  // renders the field read-only with the same sentence this endpoint would 400
  // with — visibility == authorization, and the user is told WHY.
  //
  // ROLES: canActOnMohrSettlement — branch_manager | own-dept department_head |
  // assigned lawyer, delegation-aware. Same tier as the other case-shape
  // corrections (reopen, صك, MOHR).
  app.post("/api/cases/:id/correct-starting-stage", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = correctStartingStageSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      if (typeof req.body?.toSettlement !== "boolean") {
        return res.status(400).json({ error: "يجب تحديد مرحلة البداية" });
      }
      const toSettlement = req.body.toSettlement as boolean;

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
      if (!canActOnMohrSettlement(reqUser, lawCase, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتعديل بيانات القضية" });
      }

      // A RECORDED RESULT is the "this case has started living" test — a
      // judgment lives on a hearing, and the settlement path has no judgment
      // stages, so a judged case can never be flipped.
      const caseHearings = await storage.getHearingsByCase(lawCase.id);
      const hasRecordedResult = caseHearings.some((h) => !!h.result);
      const blocked = startingStageCorrectionBlockedReason(lawCase, hasRecordedResult);
      if (blocked) return res.status(400).json({ error: blocked });

      if (!!lawCase.isSettlementCase === toSettlement) {
        return res.status(400).json({ error: "مرحلة البداية لم تتغيّر" });
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.correctCaseStartingStage(lawCase.id, {
        toSettlement,
        performedBy: reqUser.id,
        performerName,
        notes: String(req.body?.notes ?? "").trim(),
      });
      if (!updated) return res.status(500).json({ error: "فشل تصحيح مرحلة البداية" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/correct-starting-stage] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/pause
  // Body: { reason }. Sets pause_* columns; status (workflow stage) is
  // intentionally left alone — pause is detected via paused_at IS NOT
  // NULL on cases. Inserts a "paused" case_activity_log row.
  app.post("/api/cases/:id/pause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      // Cases "assigned lawyer" = primary OR responsible OR member of
      // assignedLawyers array.
      const isAssignedLawyer =
        lawCase.primaryLawyerId === reqUser.id ||
        lawCase.responsibleLawyerId === reqUser.id ||
        (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(reqUser.id));
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        // !!reqUser.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
        (reqUser.role === "department_head" && !!reqUser.departmentId && lawCase.departmentId === reqUser.departmentId) ||
        isAssignedLawyer;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتعليق هذه القضية" });

      if (lawCase.pausedAt) {
        return res.status(400).json({ error: "هذه القضية معلّقة بالفعل" });
      }
      if (lawCase.status === "مغلق" || lawCase.isArchived) {
        return res.status(400).json({ error: "لا يمكن تعليق قضية مغلقة أو مؤرشفة" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowPauseSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب التعليق مطلوب" });
      // OPTIONAL auto-lift date. Absent → open-ended, exactly as before.
      const pauseUntil = String(req.body?.pauseUntil ?? "").trim();
      const pauseUntilError = validatePauseUntil(pauseUntil, todayDateString());
      if (pauseUntilError) return res.status(400).json({ error: pauseUntilError });

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.pauseCase(lawCase.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
        pauseUntil,
      });
      if (!updated) return res.status(500).json({ error: "فشل تعليق القضية" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/pause] error:", error);
      res.status(500).json({ error: error.message || "فشل تعليق القضية" });
    }
  });

  // POST /api/cases/:id/unpause
  // Body: { notes? }. Clears pause_* columns. Stage untouched.
  app.post("/api/cases/:id/unpause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      const isAssignedLawyer =
        lawCase.primaryLawyerId === reqUser.id ||
        lawCase.responsibleLawyerId === reqUser.id ||
        (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(reqUser.id));
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && !!reqUser.departmentId && lawCase.departmentId === reqUser.departmentId) ||
        isAssignedLawyer;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء تعليق هذه القضية" });

      if (!lawCase.pausedAt) {
        return res.status(400).json({ error: "هذه القضية ليست معلّقة" });
      }

      // 2D'-V2a Pattern-A gate: type check only.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.unpauseCase(lawCase.id, {
        notes,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل إلغاء التعليق" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/unpause] error:", error);
      res.status(500).json({ error: error.message || "فشل إلغاء التعليق" });
    }
  });

  // POST /api/memos/:id/pause
  // Body: { reason }. Sets pause_* columns on the memo. Memo status
  // (workflow state) is left alone; pause is detected via paused_at IS
  // NOT NULL. department_head check uses the parent case's departmentId
  // because memos don't carry departmentId directly.
  app.post("/api/memos/:id/pause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      // 4c-5: per-identity act-as. No delegation → exactly the actor's own
      // branch_manager/admin_support/own-dept-head/assignee check.
      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support"]);
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتعليق هذه المذكرة" });

      if (memo.pausedAt) {
        return res.status(400).json({ error: "هذه المذكرة معلّقة بالفعل" });
      }
      // Pausing a memo in a terminal status doesn't make sense — once
      // approved/submitted/cancelled there's nothing to halt.
      const TERMINAL_MEMO_STATUSES = new Set(["معتمدة", "مرفوعة", "ملغاة"]);
      if (TERMINAL_MEMO_STATUSES.has(memo.status)) {
        return res.status(400).json({ error: "لا يمكن تعليق مذكرة في حالة نهائية" });
      }

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowPauseSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب التعليق مطلوب" });
      // OPTIONAL auto-lift date. Absent → open-ended, exactly as before.
      const pauseUntil = String(req.body?.pauseUntil ?? "").trim();
      const pauseUntilError = validatePauseUntil(pauseUntil, todayDateString());
      if (pauseUntilError) return res.status(400).json({ error: pauseUntilError });

      const updated = await storage.pauseMemo(memo.id, {
        reason,
        performedBy: reqUser.id,
        pauseUntil,
      });
      if (!updated) return res.status(500).json({ error: "فشل تعليق المذكرة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/pause] error:", error);
      res.status(500).json({ error: error.message || "فشل تعليق المذكرة" });
    }
  });

  // POST /api/memos/:id/unpause
  // Body: { notes? }. Clears pause_* columns.
  app.post("/api/memos/:id/unpause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      // 4c-5: per-identity act-as (see /pause).
      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support"]);
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء تعليق هذه المذكرة" });

      if (!memo.pausedAt) {
        return res.status(400).json({ error: "هذه المذكرة ليست معلّقة" });
      }

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const updated = await storage.unpauseMemo(memo.id, {
        notes,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل إلغاء التعليق" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/unpause] error:", error);
      res.status(500).json({ error: error.message || "فشل إلغاء التعليق" });
    }
  });

  // GET /api/memos/:id/activities
  // Returns the chronological activity log for a memo. Visibility gate
  // mirrors the memo edit gate (assignee / case primary / dept head /
  // any role with canChangeMemoStatus or canReviewMemos).
  app.get("/api/memos/:id/activities", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      // Visibility — anyone who can act on the memo can read its log.
      // 4c-5: per-identity act-as, mirroring the consultation/contract
      // /activities gates (which read req.actingContext via canModify*).
      // specific_cases delegations reach the memo via its parent caseId.
      // No delegation → exactly the actor's own assignee/case-lawyer/
      // own-dept-head/admin check.
      const parentCase = await storage.getCaseById(memo.caseId);
      const viewerIdentities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, memo.caseId ?? null).map((i) => ({ id: i.userId, role: i.role, departmentId: i.departmentId }))
        : [reqUser];
      if (!viewerIdentities.some((u) => canViewMemoActivitiesIdentity(u, memo, parentCase))) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه المذكرة" });
      }

      const rows = await storage.getMemoActivities(memo.id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // ==================== Phase-8: Await-completion / Resume / Skip ====================
  // Same permission gate as pause/unpause (branch_manager, admin_support,
  // department_head own dept, assigned lawyer). The await endpoint parks
  // the entity on a "missing data" detour: saves current_stage, sets
  // current_stage to the entity's pending-completion stage value, flips
  // awaiting_completion=true. Resume restores saved_stage. Skip is the
  // explicit "no upload needed, jump to STUDY" action available ONLY
  // from PENDING_COMPLETION when NOT in awaiting mode (consultations
  // only — cases use the existing /skip-data-completion route).

  // POST /api/consultations/:id/await-completion
  // Body: { reason }. Sets saved_stage = current_stage, current_stage =
  // RECEIVED_PENDING_COMPLETION, awaiting_completion = true.
  app.post("/api/consultations/:id/await-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && !!reqUser.departmentId && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة الاستشارة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }
      if (consultation.awaitingCompletion) {
        return res.status(400).json({ error: "الاستشارة بالفعل بانتظار استكمال المرفقات والبيانات" });
      }
      // Tautology guard: parking on the same stage you're already in is
      // a no-op and would corrupt saved_stage on resume.
      if (consultation.currentStage === ConsultationStage.RECEIVED_PENDING_COMPLETION) {
        return res.status(400).json({ error: "الاستشارة بالفعل في مرحلة الاستكمال" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });

      const updated = await storage.awaitConsultationCompletion(consultation.id, {
        reason,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/await-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/consultations/:id/resume-from-completion
  // Body: { notes? }. Restores current_stage = saved_stage, clears
  // saved_stage, awaiting_completion = false.
  app.post("/api/consultations/:id/resume-from-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && !!reqUser.departmentId && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة الاستشارة" });

      if (!consultation.awaitingCompletion) {
        return res.status(400).json({ error: "الاستشارة ليست بانتظار استكمال المرفقات والبيانات" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const updated = await storage.resumeConsultationFromCompletion(consultation.id, {
        notes,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/resume-from-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/consultations/:id/skip-data-completion
  //
  // The PRE-ENTRY skip — the direct mirror of the cases-side
  // POST /api/cases/:id/skip-data-completion. Pressed AT استلام, it jumps
  // PAST the data-completion stage so the stage is never entered. Same guard
  // shape and same Arabic refusal as the cases handler.
  //
  // Not to be confused with the /skip-completion it replaces: that one fired
  // from INSIDE the stage and wrote the same target as the ordinary advance,
  // so it was a relabelled advance rather than a skip.
  //
  // Gate: branch_manager | admin_support | own-dept department_head |
  // the assignee — identical to the cases skip and to the pause-family
  // handlers on this entity. The !!departmentId guard is mandatory (a head
  // with a null department must not match every null-department record).
  app.post("/api/consultations/:id/skip-data-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && !!reqUser.departmentId && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "لا تملك صلاحية تجاوز مرحلة استكمال المرفقات والبيانات" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }
      if (consultation.currentStage !== ConsultationStage.RECEIVED) {
        return res.status(400).json({ error: "تجاوز مرحلة استكمال المرفقات والبيانات متاح فقط من مرحلة الاستلام" });
      }
      // Unreachable through the UI — /await-completion moves the record to
      // PENDING_COMPLETION, so an awaiting row is never at RECEIVED. Guarded
      // anyway: on corrupt data, refusing beats advancing a parked record.
      if (consultation.awaitingCompletion) {
        return res.status(400).json({ error: "الاستشارة بانتظار استكمال المرفقات والبيانات" });
      }

      // 🔴 THE FOLLOW-UP-CYCLE REFUSAL. ConsultationCycleStages* are 3-stage
      // lists with NO data-completion stage, so a تعقيبية record has nothing
      // to skip. The shared helper returns null for exactly that case — the
      // check is the helper's own result, not a separate followUpCount test,
      // so the refusal and the target can never drift apart.
      const targetStage = consultationSkipDataCompletionTarget(consultation);
      if (!targetStage) {
        return res.status(400).json({ error: "لا توجد مرحلة استكمال في هذا المسار لتجاوزها" });
      }

      // Pattern-A gate: type check only; the handler checks above stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

      const updated = await storage.skipConsultationDataCompletion(consultation.id, {
        targetStage,
        notes,
        performedBy: reqUser.id,
        // Consultations carry no caseId, so the delegation scope is null —
        // same call shape as skipContractCommittee.
        performerName: actorDisplayName(req.actingContext, null, reqUser.name || reqUser.id),
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/skip-data-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // ==================== Contracts module (العقود والمشاريع) ====================
  // Mirrors the WRITTEN consultation surface: list / get / create / patch /
  // delete + advance / return / internal-review / committee-decision /
  // take-notes-outcome / return-to-committee / early-close / pause /
  // unpause / await-completion / resume / skip / activities. Attachment
  // endpoints land in commit 3.

  app.get("/api/contracts", requireAuth, async (_req, res) => {
    try {
      const rows = await storage.getAllContracts();
      res.json(rows);
    } catch (error: any) {
      console.error("[GET /api/contracts] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contracts/:id", requireAuth, async (req, res) => {
    try {
      const row = await storage.getContractById(String(req.params.id));
      if (!row) return res.status(404).json({ error: "العقد غير موجود" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // CREATE-SCOPE — branch_manager / admin_support stay global. employee is now
      // ADMITTED (it was excluded), and department_head — which this route granted
      // FIRM-WIDE, the gap flagged after 571e5e2 — is now SCOPED like every other
      // create: both roles may open a contract only in THEIR OWN department.
      // Same forced-vs-rejected split as the cases / consultations twins.
      const allowedCreators = ["branch_manager", "admin_support", "department_head", "employee"];
      if (!allowedCreators.includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإنشاء عقود" });
      }
      const contractScope = scopedCreateDepartmentId(reqUser, req.body?.departmentId);
      if (!contractScope.ok) {
        return res.status(400).json({ error: contractScope.error });
      }
      req.body.departmentId = contractScope.departmentId;
      const validated = insertContractSchema.parse(req.body);
      const createdBy = reqUser?.id || "unknown";
      const created = await storage.createContract(validated, createdBy);
      // NEW for contracts — this record type had no create notification at all.
      await notifyDepartmentHeadOfNewRecord({
        entityType: "contract",
        entityId: created.id,
        label: created.contractNumber,
        departmentId: created.departmentId,
        actorId: createdBy,
        actorName: reqUser.name || createdBy,
      });
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      const msg = (error as any)?.message || "";
      if (msg === "DUPLICATE_CONTRACT_NUMBER") {
        return res.status(400).json({ error: "تعذّر توليد رقم عقد فريد، يرجى المحاولة مرة أخرى" });
      }
      console.error("[POST /api/contracts] error:", error);
      res.status(500).json({ error: "حدث خطأ في إنشاء العقد" });
    }
  });

  // Generic PATCH — handles assignedTo, internalReviewerId, contractType
  // (with stage remap + activity log), priority, priorityReason, title,
  // description, departmentId. Same per-field role gates as consultations.
  app.patch("/api/contracts/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const existing = await storage.getContractById(String(req.params.id));
      if (!existing) return res.status(404).json({ error: "العقد غير موجود" });
      if (!canModifyContract(user, existing, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذا العقد" });
      }

      // 2D'-V1b Pattern-A gate: validate types only, then keep using
      // req.body untouched (the handler mutates it downstream).
      const bodyCheck = updateContractSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      // Validate assignedTo user is active when set non-null.
      if (req.body.assignedTo) {
        const { valid } = await validateAssignedUsersActive([req.body.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "المستخدم المسند إليه غير نشط أو غير موجود" });
        }
      }

      // internalReviewerId — gated to admin_support / dept_head (own dept,
      // already covered by canModifyContract) / branch_manager.
      if (req.body.internalReviewerId !== undefined) {
        const allowedReviewerSetters = ["branch_manager", "admin_support", "department_head"];
        if (!allowedReviewerSetters.includes(user.role)) {
          delete req.body.internalReviewerId;
        } else if (req.body.internalReviewerId) {
          const { valid } = await validateAssignedUsersActive([req.body.internalReviewerId]);
          if (!valid) {
            return res.status(400).json({ error: "المراجع الداخلي المختار غير نشط أو غير موجود" });
          }
        }
      }

      // Department transfer — same shape as the cases-side transfer:
      // when departmentId changes, clear assignedTo + internalReviewerId
      // (both are scoped to the source dept's roster) and reset
      // currentStage to RECEIVED so the new dept starts the file
      // fresh on its own intake. Writes a dedicated department_transferred
      // activity entry inside the same transaction as the row update.
      let deptTransfer: {
        fromDeptId: string;
        toDeptId: string;
        fromStage: string;
        reason: string;
        previousAssignedTo: string | null;
        previousInternalReviewerId: string | null;
        previousPriority: string | null;
        previousPriorityReason: string | null;
      } | null = null;
      if (
        req.body.departmentId !== undefined
        && req.body.departmentId
        && req.body.departmentId !== existing.departmentId
      ) {
        // Same role gate as cases — admin-class or own-dept dept_head.
        // canModifyContract above already covers this, but we check
        // explicitly so the transfer error message is clearer than a
        // generic 403.
        const allowedTransferRoles = ["branch_manager", "admin_support", "department_head"];
        if (!allowedTransferRoles.includes(user.role)) {
          return res.status(403).json({ error: "ليس لديك صلاحية لتحويل العقد لقسم آخر" });
        }
        const reason = typeof req.body.transferReason === "string" ? req.body.transferReason.trim() : "";
        deptTransfer = {
          fromDeptId: existing.departmentId,
          toDeptId: req.body.departmentId,
          fromStage: existing.currentStage,
          reason,
          // Capture pre-mutation snapshots BEFORE the body is rewritten
          // below — the activity log entry needs to record what the
          // contract looked like in the source dept so the audit trail
          // shows the dropped assignment + reviewer + priority.
          previousAssignedTo: existing.assignedTo ?? null,
          previousInternalReviewerId: existing.internalReviewerId ?? null,
          previousPriority: existing.priority ?? null,
          previousPriorityReason: existing.priorityReason ?? null,
        };
        // Reset assignment + reviewer + stage so the receiving dept
        // starts the file fresh. Mirrors cases.
        req.body.assignedTo = null;
        req.body.internalReviewerId = null;
        req.body.currentStage = ContractStage.RECEIVED;
        // Clear committee fields too — they're scoped to the originating
        // dept's review cycle and don't carry to the new dept.
        if (req.body.priority === undefined) req.body.priority = null;
        if (req.body.priorityReason === undefined) req.body.priorityReason = null;
      }

      // contractType change — same shape as consultation type change:
      // restricted to branch_manager / admin_support / department_head;
      // remaps currentStage if invalid in the new type's stages list;
      // writes a dedicated activity-log entry inside one transaction.
      let typeChange: { from: string; to: string; fromStage: string; toStage: string; remapped: boolean } | null = null;
      if (
        req.body.contractType !== undefined
        && req.body.contractType !== existing.contractType
      ) {
        const newType = String(req.body.contractType);
        const validTypes = Object.values(ContractType) as string[];
        const allowedRoles = ["branch_manager", "admin_support", "department_head"];
        if (!allowedRoles.includes(user.role)) {
          delete req.body.contractType;
        } else if (!validTypes.includes(newType)) {
          return res.status(400).json({ error: "نوع العقد غير صحيح" });
        } else {
          const remapped = remapContractStageForType(
            existing.currentStage,
            newType as ContractTypeValue,
          );
          typeChange = {
            from: existing.contractType,
            to: newType,
            fromStage: existing.currentStage,
            toStage: remapped,
            remapped: remapped !== existing.currentStage,
          };
          req.body.currentStage = remapped;
        }
      }

      let updated;
      if (deptTransfer) {
        // Department transfer takes precedence over a same-PATCH type
        // change because the activity-log entry is the more important
        // breadcrumb (the type change is logged by the post-write
        // helper below if both happen — see metadata.alsoChangedType).
        const fromDeptName = await storage.getDepartmentById(deptTransfer.fromDeptId).then((d) => d?.name || deptTransfer.fromDeptId).catch(() => deptTransfer.fromDeptId);
        const toDeptName = await storage.getDepartmentById(deptTransfer.toDeptId).then((d) => d?.name || deptTransfer.toDeptId).catch(() => deptTransfer.toDeptId);
        const description = deptTransfer.reason
          ? `تحويل من قسم "${fromDeptName}" إلى قسم "${toDeptName}" — ${deptTransfer.reason}`
          : `تحويل من قسم "${fromDeptName}" إلى قسم "${toDeptName}"`;
        updated = await storage.updateContractAndLog(
          String(req.params.id),
          req.body,
          {
            activityType: ContractActivityType.DEPARTMENT_TRANSFERRED,
            description,
            metadata: {
              fromDeptId: deptTransfer.fromDeptId,
              toDeptId: deptTransfer.toDeptId,
              fromStage: deptTransfer.fromStage,
              reason: deptTransfer.reason || null,
              alsoChangedType: !!typeChange,
              previousAssignedTo: deptTransfer.previousAssignedTo,
              previousInternalReviewerId: deptTransfer.previousInternalReviewerId,
              previousPriority: deptTransfer.previousPriority,
              previousPriorityReason: deptTransfer.previousPriorityReason,
            },
            performedBy: user.id,
          },
        );
      } else if (typeChange) {
        const fromTypeLabel = (ContractTypeLabels as Record<string, string>)[typeChange.from] || typeChange.from;
        const toTypeLabel = (ContractTypeLabels as Record<string, string>)[typeChange.to] || typeChange.to;
        const fromStageLabel = (ContractStageLabels as Record<string, string>)[typeChange.fromStage] || typeChange.fromStage;
        const toStageLabel = (ContractStageLabels as Record<string, string>)[typeChange.toStage] || typeChange.toStage;
        const description = typeChange.remapped
          ? `تغيير النوع من ${fromTypeLabel} إلى ${toTypeLabel} — أُعيد ضبط المرحلة من ${fromStageLabel} إلى ${toStageLabel}`
          : `تغيير النوع من ${fromTypeLabel} إلى ${toTypeLabel}`;
        updated = await storage.updateContractAndLog(
          String(req.params.id),
          req.body,
          {
            activityType: ContractActivityType.TYPE_CHANGED,
            description,
            metadata: {
              from: typeChange.from,
              to: typeChange.to,
              fromStage: typeChange.fromStage,
              toStage: typeChange.toStage,
              stageRemapped: typeChange.remapped,
            },
            performedBy: user.id,
          },
        );
      } else {
        // Inline-edit activity logging. The committee referral card
        // posts PATCH-only changes for internalReviewerId / priority /
        // priorityReason / assignedTo, and earlier revisions wrote
        // those silently — the audit trail had a gap. Detect each
        // semantic change and route the write through
        // updateContractAndLog with the matching activity type. If
        // multiple semantic fields change in one PATCH (rare) we
        // pick the highest-priority (assignedTo > reviewer > priority)
        // for the log entry; the others ride along on the same write.
        const reviewerChanged =
          req.body.internalReviewerId !== undefined
          && req.body.internalReviewerId !== existing.internalReviewerId;
        const priorityChanged =
          (req.body.priority !== undefined && req.body.priority !== existing.priority)
          || (req.body.priorityReason !== undefined && req.body.priorityReason !== existing.priorityReason);
        const assignedToChanged =
          req.body.assignedTo !== undefined
          && req.body.assignedTo !== existing.assignedTo;

        if (assignedToChanged) {
          const newAssigneeId = req.body.assignedTo;
          const lawyer = newAssigneeId ? await storage.getUser(newAssigneeId) : null;
          const description = newAssigneeId
            ? `تعديل الإسناد إلى ${lawyer?.name || newAssigneeId}`
            : "إلغاء إسناد العقد";
          updated = await storage.updateContractAndLog(String(req.params.id), req.body, {
            activityType: ContractActivityType.ASSIGNED,
            description,
            metadata: {
              assignedTo: newAssigneeId || null,
              previousAssignedTo: existing.assignedTo ?? null,
              viaPatch: true,
            },
            performedBy: user.id,
          });
        } else if (reviewerChanged) {
          const newReviewerId = req.body.internalReviewerId;
          const reviewer = newReviewerId ? await storage.getUser(newReviewerId) : null;
          const description = newReviewerId
            ? `تعيين المراجع الداخلي: ${reviewer?.name || newReviewerId}`
            : "إلغاء تعيين المراجع الداخلي";
          updated = await storage.updateContractAndLog(String(req.params.id), req.body, {
            activityType: ContractActivityType.REVIEWER_ASSIGNED,
            description,
            metadata: {
              internalReviewerId: newReviewerId || null,
              previousInternalReviewerId: existing.internalReviewerId ?? null,
            },
            performedBy: user.id,
          });
        } else if (priorityChanged) {
          const newPriority = req.body.priority ?? existing.priority;
          const newReason = req.body.priorityReason ?? existing.priorityReason;
          const description = newPriority
            ? `تحديث الأولوية إلى "${newPriority}"${newReason ? ` — ${String(newReason).slice(0, 80)}` : ""}`
            : "إلغاء الأولوية";
          updated = await storage.updateContractAndLog(String(req.params.id), req.body, {
            activityType: ContractActivityType.PRIORITY_SET,
            description,
            metadata: {
              priority: newPriority || null,
              priorityReason: newReason || null,
              previousPriority: existing.priority ?? null,
              previousPriorityReason: existing.priorityReason ?? null,
            },
            performedBy: user.id,
          });
        } else {
          // "تعديل البيانات" — record-level correction (title / client /
          // description). These used to fall through to a SILENT write ("no
          // semantic change worth logging"), which is no longer true now that
          // there is a UI dedicated to changing them: correcting the client on
          // a contract is exactly the kind of edit an audit trail must show.
          // Last in the chain on purpose — assignee / reviewer / priority are
          // workflow events and keep their more specific entries.
          // Explicit per-field comparison — no cast needed to index `existing`.
          const changedDetailFields: string[] = [];
          if (req.body.title !== undefined && req.body.title !== existing.title) {
            changedDetailFields.push("العنوان");
          }
          if (req.body.clientId !== undefined && req.body.clientId !== existing.clientId) {
            changedDetailFields.push("العميل");
          }
          if (req.body.description !== undefined && req.body.description !== existing.description) {
            changedDetailFields.push("الوصف");
          }
          if (changedDetailFields.length > 0) {
            updated = await storage.updateContractAndLog(String(req.params.id), req.body, {
              activityType: ContractActivityType.DETAILS_EDITED,
              description: `تعديل البيانات — ${changedDetailFields.join("، ")}`,
              metadata: { fields: changedDetailFields },
              performedBy: user.id,
            });
          } else {
            // Genuinely nothing semantic changed — silent write is correct.
            updated = await storage.updateContract(String(req.params.id), req.body);
          }
        }
      }
      if (!updated) return res.status(404).json({ error: "العقد غير موجود" });
      res.json(updated);
    } catch (error: any) {
      console.error("[PATCH /api/contracts/:id] error:", error);
      res.status(500).json({ error: "حدث خطأ في تحديث العقد" });
    }
  });

  app.delete("/api/contracts/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      const id = String(req.params.id);
      // The contract_attachments / contract_activity_log tables both
      // CASCADE on contracts.id, so deleting the contract row removes
      // their DB rows automatically. The attachment FILES on disk
      // don't follow the FK cascade, though, so we read them BEFORE
      // the delete and unlink afterward. Best-effort: failure to
      // unlink is logged but doesn't fail the request — the DB is
      // already in the right state.
      const attachments = await storage.getContractAttachments(id);
      const ok = await storage.deleteContract(id);
      if (!ok) return res.status(404).json({ error: "العقد غير موجود" });
      // Drop each blob from Object Storage. The DB FK cascade has
      // already removed the contract_attachments rows; this cleanup
      // is best-effort — orphans in the bucket only cost storage,
      // not correctness. Legacy disk-path rows (pre-migration) have
      // nothing left to delete and are skipped.
      for (const att of attachments) {
        if (att.filePath && isAttachmentObjectKey(att.filePath)) {
          attachmentObjectStore.delete(att.filePath, { ignoreNotFound: true }).catch((e) => {
            console.warn(`[contracts/delete] failed to delete object ${att.filePath}:`, e?.message || e);
          });
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/contracts/:id/assign — sets assignedTo and writes an
  // assigned activity entry. Stage is NOT auto-advanced: a contract
  // at RECEIVED stays at RECEIVED after assignment so the assigned
  // lawyer (or dept_head / admin / branch_manager) can choose between
  // moving to PENDING_COMPLETION (normal flow) or skipping straight
  // to DRAFTING via the تجاوز button. Allowed: admin_support,
  // department_head, branch_manager.
  app.post("/api/contracts/:id/assign", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      if (!["admin_support", "department_head", "branch_manager"].includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإسناد العقود" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = assignContractSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { assignedTo } = req.body || {};
      if (!assignedTo || typeof assignedTo !== "string") {
        return res.status(400).json({ error: "assignedTo مطلوب" });
      }
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      // Department-head scope check: a dept_head may only assign on
      // contracts in their OWN department. branch_manager and
      // admin_support are global.
      if (
        reqUser.role === "department_head"
        && contract.departmentId !== reqUser.departmentId
      ) {
        return res.status(403).json({ error: "رئيس القسم يمكنه إسناد عقود قسمه فقط" });
      }
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      const { valid } = await validateAssignedUsersActive([assignedTo]);
      if (!valid) return res.status(400).json({ error: "المستخدم المسند إليه غير نشط أو غير موجود" });
      const lawyer = await storage.getUser(assignedTo);
      const lawyerName = lawyer?.name || assignedTo;
      const updated = await storage.updateContractAndLog(contract.id, { assignedTo }, {
        activityType: ContractActivityType.ASSIGNED,
        description: `تم إسناد العقد لـ ${lawyerName}`,
        metadata: { assignedTo, lawyerName },
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل تحديث العقد" });
      res.json(updated);
    } catch (error: any) {
      console.error("[contracts/assign] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/advance-stage", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = advanceContractStageSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const targetStage = String(req.body?.targetStage || "");
      if (!targetStage) return res.status(400).json({ error: "targetStage مطلوب" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      const check = validateStageTransition(
        contract.currentStage,
        targetStage,
        reqUser.role,
        "contract",
        reqUser,
        contract,
        // 4c-4: contracts act-as enabled. Four-eyes stays human in the
        // INTERNAL_REVIEW lock + the dedicated /internal-review reviewer guard.
        req.actingContext,
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });
      // Slot-validation gate per ContractSlotsByType.
      // ⚠ CURRENTLY A NO-OP by owner policy — every requiredBeforeLeavingStage in
      // that table is null, so no attachment blocks a contract transition. Kept
      // wired so re-arming a slot is a one-line data change in schema.ts rather
      // than re-plumbing the route. See the note above ContractSlotsByType.
      const slotCheckErr = await checkRequiredSlotsForTransition(
        contract,
        contract.currentStage,
      );
      if (slotCheckErr) return res.status(400).json({ error: slotCheckErr });

      // Stage-entry context. The FE captures these on the advance
      // dialog when the destination requires them; the server
      // re-validates so a hand-rolled API call can't bypass the
      // requirement.
      const rawNotes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
      const rawReviewerId = typeof req.body?.internalReviewerId === "string" ? req.body.internalReviewerId : "";
      const rawPriority = typeof req.body?.priority === "string" ? req.body.priority : "";
      const rawPriorityReason = typeof req.body?.priorityReason === "string" ? req.body.priorityReason.trim() : "";

      // RECEIVED → PENDING_COMPLETION: notes are required (the lawyer
      // needs to know what data is missing). Mirrors the cases-side
      // requirement.
      if (
        contract.currentStage === ContractStage.RECEIVED
        && targetStage === ContractStage.RECEIVED_PENDING_COMPLETION
        && !rawNotes
      ) {
        return res.status(400).json({
          error: "الملاحظات مطلوبة عند النقل إلى استكمال البيانات والمرفقات",
        });
      }

      // → INTERNAL_REVIEW: a designated reviewer must be set on the
      // row. Validates the user is active and not admin_support
      // (administrative role, not a reviewer). The persistence rule
      // mirrors cases: a permanent intake-set reviewer is the source
      // of truth and a body-provided reviewer is treated as a
      // single-round override (used for the locked-stage check on
      // this transition + activity log) but does NOT mutate
      // internal_reviewer_id. The persistent slot is only bootstrapped
      // when the contract had no reviewer yet — otherwise re-routing
      // a round to a substitute reviewer would silently overwrite
      // the original assignment. Contracts can bounce back from
      // committee for multiple rounds, so this matters here too.
      let reviewerToPersist: string | null = null;
      if (targetStage === ContractStage.INTERNAL_REVIEW) {
        const reviewerId = rawReviewerId || contract.internalReviewerId || "";
        if (!reviewerId) {
          return res.status(400).json({ error: "يجب اختيار المراجع الداخلي قبل الانتقال للمرحلة" });
        }
        const reviewer = await storage.getUser(reviewerId);
        if (!reviewer || !reviewer.isActive) {
          return res.status(400).json({ error: "المراجع الداخلي المختار غير صالح" });
        }
        if (reviewer.role === "admin_support") {
          return res.status(400).json({ error: "لا يمكن اختيار الدعم الإداري كمراجع داخلي" });
        }
        // Bootstrap-only persistence: only write to internal_reviewer_id
        // if the contract didn't have a reviewer yet. A body-provided
        // override on a contract that already has a persistent
        // reviewer is intentionally NOT persisted (single-round
        // override semantic).
        if (!contract.internalReviewerId) {
          reviewerToPersist = reviewerId;
        }
      }

      // → COMMITTEE: priority is required. Reason is optional. If the
      // contract already has a priority, we still allow overwriting
      // when the body provides one. Validates the priority value
      // against the 2-option enum.
      let priorityToPersist: string | null = null;
      let priorityReasonToPersist: string | null | undefined = undefined;
      if (targetStage === ContractStage.COMMITTEE) {
        const incoming = rawPriority || contract.priority || "";
        if (!incoming) {
          return res.status(400).json({ error: "يجب تحديد الأولوية قبل الإحالة للجنة" });
        }
        const validPriorities = ["عاجلة", "غير_عاجلة"];
        if (!validPriorities.includes(incoming)) {
          return res.status(400).json({ error: "قيمة الأولوية غير صحيحة" });
        }
        priorityToPersist = incoming;
        // Reason: only persist when explicitly provided. Empty body
        // value clears the prior reason; missing body value leaves
        // the existing one alone.
        if (req.body?.priorityReason !== undefined) {
          priorityReasonToPersist = rawPriorityReason || null;
        }
      }

      const fromLabel = ContractStageLabels[contract.currentStage] || contract.currentStage;
      const toLabel = (ContractStageLabels as Record<string, string>)[targetStage] || targetStage;
      const reachedClosed = targetStage === ContractStage.CLOSED;
      const updateData: any = { currentStage: targetStage };
      if (reachedClosed) {
        updateData.status = "closed";
        updateData.closedAt = new Date();
      }
      if (reviewerToPersist) updateData.internalReviewerId = reviewerToPersist;
      if (priorityToPersist) updateData.priority = priorityToPersist;
      if (priorityReasonToPersist !== undefined) updateData.priorityReason = priorityReasonToPersist;

      const description = rawNotes
        ? `انتقال من ${fromLabel} إلى ${toLabel} — ${rawNotes.slice(0, 120)}`
        : `انتقال من ${fromLabel} إلى ${toLabel}`;
      const updated = await storage.updateContractAndLog(contract.id, updateData, {
        activityType: ContractActivityType.STAGE_ADVANCED,
        description,
        metadata: {
          fromStage: contract.currentStage,
          toStage: targetStage,
          ...(rawNotes ? { notes: rawNotes } : {}),
          ...(reviewerToPersist ? { internalReviewerId: reviewerToPersist } : {}),
          ...(priorityToPersist ? { priority: priorityToPersist } : {}),
          ...(priorityReasonToPersist !== undefined ? { priorityReason: priorityReasonToPersist } : {}),
          ...(reachedClosed ? { closedViaFinalStage: true } : {}),
        },
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل تحديث العقد" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/return-stage", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowTargetStageSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const targetStage = String(req.body?.targetStage || "");
      if (!targetStage) return res.status(400).json({ error: "targetStage مطلوب" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      const check = validateStageTransition(
        contract.currentStage,
        targetStage,
        reqUser.role,
        "contract",
        reqUser,
        contract,
        // 4c-4: contracts act-as enabled. Four-eyes stays human in the
        // INTERNAL_REVIEW lock + the dedicated /internal-review reviewer guard.
        req.actingContext,
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });
      const fromLabel = ContractStageLabels[contract.currentStage] || contract.currentStage;
      const toLabel = (ContractStageLabels as Record<string, string>)[targetStage] || targetStage;
      const updated = await storage.updateContractAndLog(
        contract.id,
        { currentStage: targetStage as ContractStageValue },
        {
          activityType: ContractActivityType.STAGE_RETURNED,
          description: `إرجاع من ${fromLabel} إلى ${toLabel}`,
          metadata: { fromStage: contract.currentStage, toStage: targetStage },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل تحديث العقد" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/internal-review", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowDecisionSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const notes = String(req.body?.notes || "").trim();
      const valid = (Object.values(InternalReviewDecision) as string[]).includes(decision);
      if (!valid) return res.status(400).json({ error: "قرار المراجعة غير صحيح" });
      // NEEDS_NOTES requires notes — they're the actionable feedback
      // the lawyer needs to address. PASSED leaves notes optional.
      if (decision === InternalReviewDecision.NEEDS_NOTES && !notes) {
        return res.status(400).json({ error: "الملاحظات مطلوبة عند اختيار يوجد ملاحظات" });
      }
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      if (contract.currentStage !== ContractStage.INTERNAL_REVIEW) {
        return res.status(400).json({ error: "العقد ليس في مرحلة المراجعة الداخلية" });
      }
      // Locked: only the designated internal reviewer or branch_manager
      // can act. Same shape as the cases internal-review gate.
      const isReviewer = contract.internalReviewerId === reqUser.id;
      // WIDENED MODEL — own-department department_head may act too (see the
      // consultations twin). FOUR-EYES (carve-out 2) is enforced HERE rather than by
      // an earlier guard, because this endpoint has no assignee pre-check: a head who
      // is the contract's own assignedTo is excluded, so the reviewer can never be
      // the author. HUMAN role only — not delegation-expanded.
      // This also RESOLVES the FE/server mismatch the audit found: contracts.tsx
      // canDoInternalReview already showed this button to an own-dept head, and the
      // server used to 403 them.
      const isOwnDeptHeadReviewer =
        reqUser.role === "department_head"
        && !!reqUser.departmentId
        && !!contract.departmentId
        && contract.departmentId === reqUser.departmentId
        && !isAssignedLawyer(reqUser, contract);
      if (!isReviewer && !isOwnDeptHeadReviewer && reqUser.role !== "branch_manager") {
        return res.status(403).json({ error: "فقط المراجع الداخلي المعين أو رئيس القسم أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية" });
      }
      const nextStage = decision === InternalReviewDecision.PASSED
        ? ContractStage.COMMITTEE
        : ContractStage.DRAFTING;
      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `مراجعة داخلية: ${decision} — ${truncatedNotes}`
        : `مراجعة داخلية: ${decision}`;
      const updated = await storage.recordContractInternalReview({
        contractId: contract.id,
        reviewerId: reqUser.id,
        decision,
        notes,
        nextStage,
        activity: { description, metadata: { decision, notes, reviewerId: reqUser.id }, performedBy: reqUser.id },
      });
      res.json({ contract: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/committee-decision", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // Committee chair = consultations_review_head per spec.
      // 4c-7: committee decisions INHERIT (scope null — contracts carry no
      // caseId → all_cases delegations only). No delegation → own-role (parity).
      const ctx = req.actingContext;
      const ownRoleDecides = ["consultations_review_head", "labor_review_head", "branch_manager"].includes(reqUser.role);
      if (!ownRoleDecides && !(ctx && hasEffectiveRole(ctx, null, "consultations_review_head", "labor_review_head", "branch_manager"))) {
        return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowDecisionSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const notes = String(req.body?.notes || "").trim();
      const valid = (Object.values(CommitteeDecision) as string[]).includes(decision);
      if (!valid) return res.status(400).json({ error: "قرار اللجنة غير صحيح" });
      // NEEDS_NOTES requires notes — same rule as the internal-review
      // endpoint. APPROVED leaves notes optional.
      if (decision === CommitteeDecision.NEEDS_NOTES && !notes) {
        return res.status(400).json({ error: "الملاحظات مطلوبة عند اختيار يوجد ملاحظات" });
      }
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      if (contract.currentStage !== ContractStage.COMMITTEE) {
        return res.status(400).json({ error: "العقد ليس في مرحلة لجنة المراجعة" });
      }
      // Labor contracts → labor_review_head EXCLUSIVELY; others → consultations_review_head.
      {
        const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
        const committeeHead = (!!laborDeptId && contract.departmentId === laborDeptId)
          ? "labor_review_head" : "consultations_review_head";
        const headDecides = [committeeHead, "branch_manager"].includes(reqUser.role);
        if (!headDecides && !(ctx && hasEffectiveRole(ctx, null, committeeHead, "branch_manager"))) {
          return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
        }
      }
      // FOUR-EYES (HUMAN-only; delegation-derived authority only): a delegate
      // standing in for the review head may NOT decide a committee on a contract
      // they (REAL id) authored / are the assigned lawyer of. Real review head
      // unaffected (parity). Real human id.
      if (!ownRoleDecides && isAssignedLawyer(reqUser, contract)) {
        return res.status(403).json({ error: "لا يمكنك اعتماد قرار اللجنة على عمل أنت محرّره" });
      }
      const nextStage = decision === CommitteeDecision.APPROVED
        ? ContractStage.READY
        : ContractStage.TAKING_NOTES;
      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `قرار اللجنة: ${decision} — ${truncatedNotes}`
        : `قرار اللجنة: ${decision}`;
      const updated = await storage.recordContractCommitteeDecision({
        contractId: contract.id,
        decision,
        notes,
        decidedBy: reqUser.id,
        nextStage,
        activity: { description, metadata: { decision, notes, decidedBy: reqUser.id }, performedBy: reqUser.id },
      });
      res.json({ contract: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/contracts/:id/skip-committee
  // Body: { reason }. REASONED OVERRIDE — "تجاوز لجنة المراجعة". Moves the
  // contract from لجنة_مراجعة straight to جاهزة_للإرسال with NO committee
  // decision, recording who did it and why in contract_activity_log (reason is
  // MANDATORY). Entity 4 of 4 — mirrors cases (76eea3c/193649a), memos (acd9c93)
  // and consultations (8917b72). Post-committee target VERIFIED against the
  // committee-decision APPROVED path above (ContractStage.READY).
  //
  // Deliberately bypasses validateStageTransition — the same precedent the
  // committee-decision path above already sets. No transition-table entry is
  // added, so this override cannot be reached through /advance-stage.
  //
  // ORIGIN is the committee stage ONLY (never مراجعة_داخلية), so the four-eyes
  // internal-review lock is untouched.
  //
  // NO TYPE GUARD — unlike consultations (WRITTEN-only). Contracts have a single
  // stage flow (ContractStagesOrder: RECEIVED → … → COMMITTEE → READY → CLOSED);
  // جاهزة_للإرسال is on that one path, so a currentStage === COMMITTEE check is a
  // sufficient guard. This matches memos (one unconditional stage array).
  //
  // AUTHORIZED ROLES (owner decision, 2026-07): branch_manager + department_head
  // (of the contract's OWN department — contracts carry departmentId directly) +
  // the assigned lawyer. This is INTENTIONALLY BROADER than the committee-DECISION
  // role set (consultations_review_head + branch_manager, above). Skipping the
  // committee is an owner-approved override, not a committee decision, so it
  // answers to a different, wider authority. Do NOT "harmonise" this set with the
  // committee chair — the divergence is the point.
  //
  // FOUR-EYES DOES NOT APPLY HERE, by design: the assigned lawyer (the author) is
  // an EXPLICITLY authorized actor, so an author-exclusion would contradict the
  // approved permission model. The mandatory reason + the audit row are the control.
  app.post("/api/contracts/:id/skip-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // Type-check-only gate; the handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب تجاوز اللجنة مطلوب" });

      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });

      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      // Stricter than committee-decision (which checks status only): a paused or
      // awaiting-completion contract must not be advanced. Matches the
      // cases/memo/consultation skip endpoints, which all guard this pair.
      if (contract.pausedAt || contract.awaitingCompletion) {
        return res.status(400).json({ error: "العقد في حالة لا تسمح بتجاوز اللجنة" });
      }
      if (contract.currentStage !== ContractStage.COMMITTEE) {
        return res.status(400).json({ error: "العقد ليس في مرحلة لجنة المراجعة" });
      }

      // Delegation-aware: evaluate the rule against every acting identity (self +
      // any delegator this user currently stands in for). Scope is null —
      // contracts carry no caseId, so only all_cases delegations apply (same as
      // the committee-decision endpoint above). With no delegation this resolves
      // to exactly the actor → byte-identical to a plain self-check.
      const identities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, null).map((i) => ({
            id: i.userId, role: i.role, departmentId: i.departmentId,
          }))
        : [{ id: reqUser.id, role: reqUser.role, departmentId: reqUser.departmentId }];
      const allowed = identities.some((u) =>
        u.role === "branch_manager"
        || (u.role === "department_head" && !!u.departmentId && contract.departmentId === u.departmentId)
        || isAssignedLawyer({ id: u.id }, contract));
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتجاوز لجنة المراجعة" });
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, null, performer?.name || reqUser.id);
      const updated = await storage.skipContractCommittee(contract.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل تجاوز لجنة المراجعة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[contracts/skip-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/contracts/:id/skip-internal-review
  // Body: { reason }. REASONED OVERRIDE — "تجاوز المراجعة الداخلية". Moves the
  // contract from مراجعة_داخلية straight to لجنة_مراجعة with NO internal-review
  // decision, recording who did it and why in contract_activity_log (reason is
  // MANDATORY). Same shape as /skip-committee above.
  //
  // TARGET = COMMITTEE — the stage a PASSED internal review advances to
  // (:7485), and the next entry in ContractStagesOrder. The skipped contract
  // lands exactly where a passing review would have put it, mirroring how
  // skip-committee lands on the committee's own APPROVED target.
  //
  // CONTRACTS ONLY, per owner scope. The other three entities are untouched.
  //
  // AUTHORIZED ROLES — IDENTICAL TO /skip-committee: branch_manager +
  // department_head (of the contract's OWN department) + the assigned lawyer,
  // delegation-aware. Only the stage differs.
  //
  // ⚠ OWNER OVERRIDE (supersedes the narrower gate this shipped with in 4970876).
  // It first EXCLUDED the assignee — and a head who was themself the assignee —
  // arguing that since this override originates AT مراجعة_داخلية (unlike
  // skip-committee, which was deliberately scoped away from it), letting the
  // drafter DELETE the review of their own draft reaches the same end state as
  // letting them approve it. The owner has aligned this with the skip-committee
  // precedent instead: a reasoned override answers to the same wider authority as
  // its sibling, and the MANDATORY REASON + the activity row are the control.
  // Do not re-narrow this without the owner — the divergence was considered and
  // explicitly rejected.
  //
  // The internal-review DECISION endpoint (:7439) is UNTOUCHED and still enforces
  // four-eyes: only the designated reviewer, an own-dept head who is NOT the
  // assignee, or branch_manager may record a decision. Skipping the stage and
  // deciding it remain different acts with different gates.
  //
  // Deliberately bypasses validateStageTransition — the precedent skip-committee
  // and reopen already set. No transition-table entry is added, so this override
  // is unreachable via /advance-stage.
  app.post("/api/contracts/:id/skip-internal-review", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // Type-check-only gate; the handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب تجاوز المراجعة الداخلية مطلوب" });

      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });

      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      if (contract.pausedAt || contract.awaitingCompletion) {
        return res.status(400).json({ error: "العقد في حالة لا تسمح بتجاوز المراجعة الداخلية" });
      }
      if (contract.currentStage !== ContractStage.INTERNAL_REVIEW) {
        return res.status(400).json({ error: "العقد ليس في مرحلة المراجعة الداخلية" });
      }

      // Delegation-aware, copied verbatim from /skip-committee: evaluate the rule
      // against every acting identity (self + any delegator this user currently
      // stands in for). Scope is null — contracts carry no caseId, so only
      // all_cases delegations apply. With no delegation this resolves to exactly
      // the actor → byte-identical to a plain self-check.
      const identities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, null).map((i) => ({
            id: i.userId, role: i.role, departmentId: i.departmentId,
          }))
        : [{ id: reqUser.id, role: reqUser.role, departmentId: reqUser.departmentId }];
      const allowed = identities.some((u) =>
        u.role === "branch_manager"
        || (u.role === "department_head" && !!u.departmentId && contract.departmentId === u.departmentId)
        || isAssignedLawyer({ id: u.id }, contract));
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتجاوز المراجعة الداخلية" });
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, null, performer?.name || reqUser.id);
      const updated = await storage.skipContractInternalReview(contract.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل تجاوز المراجعة الداخلية" });
      res.json(updated);
    } catch (error: any) {
      console.error("[contracts/skip-internal-review] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  app.post("/api/contracts/:id/take-notes-outcome", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowOutcomeSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const outcome = String(req.body?.outcome || "");
      const notes = String(req.body?.notes || "");
      const valid = (Object.values(NoteOutcome) as string[]).includes(outcome);
      if (!valid) return res.status(400).json({ error: "نتيجة غير صحيحة" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      if (contract.currentStage !== ContractStage.TAKING_NOTES) {
        return res.status(400).json({ error: "العقد ليس في مرحلة الأخذ بالملاحظات" });
      }
      // 4c-7: take-notes-outcome INHERITS (lawyer's own follow-up work applying
      // committee notes, NOT a review → no author/self exclusion). Scope null.
      // No delegation → own identity+role only (parity).
      const ctx = req.actingContext;
      const isLawyer = ctx
        ? Array.from(effectiveIdsFor(ctx, null)).some((id) => isAssignedLawyer({ id }, contract))
        : isAssignedLawyer(reqUser, contract);
      const isHead = ctx
        ? hasEffectiveRole(ctx, null, "department_head", "branch_manager")
        : ["department_head", "branch_manager"].includes(reqUser.role);
      if (!isLawyer && !isHead) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتسجيل النتيجة" });
      }
      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `نتيجة الأخذ بالملاحظات: ${outcome} — ${truncatedNotes}`
        : `نتيجة الأخذ بالملاحظات: ${outcome}`;
      const updated = await storage.recordContractNoteOutcome({
        contractId: contract.id,
        outcome,
        notes,
        recordedBy: reqUser.id,
        nextStage: ContractStage.READY,
        activity: { description, metadata: { outcome, notes }, performedBy: reqUser.id },
      });
      res.json({ contract: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/return-to-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = String(req.body?.notes ?? "").trim();
      if (!notes) return res.status(400).json({ error: "الملاحظات مطلوبة" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      if (contract.currentStage !== ContractStage.TAKING_NOTES) {
        return res.status(400).json({ error: "العقد ليس في مرحلة الأخذ بالملاحظات" });
      }
      // Per spec: assigned + dept_head (own dept) + branch_manager.
      // admin_support is intentionally NOT in this set — bouncing a
      // file back to committee is a workflow action, not an admin one.
      const isLawyer = isAssignedLawyer(reqUser, contract);
      const isOwnDeptHead =
        reqUser.role === "department_head"
        && !!reqUser.departmentId
        && contract.departmentId === reqUser.departmentId;
      const isBranchManager = reqUser.role === "branch_manager";
      if (!isLawyer && !isOwnDeptHead && !isBranchManager) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإعادة العقد للجنة" });
      }
      const updated = await storage.returnContractToCommittee(contract.id, { notes, performedBy: reqUser.id });
      if (!updated) return res.status(500).json({ error: "فشل إعادة العقد للجنة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[contracts/return-to-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  app.post("/api/contracts/:id/early-close", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      // Per spec: branch_manager + admin_support (global), department_head
      // (own dept only), and the assigned lawyer may early-close. Mirrors
      // the cases-side early-close gate (routes.ts validateStageTransition)
      // and canEarlyCloseCase on the FE. The dept-scope check requires both
      // sides to carry a non-empty departmentId so a dept_head with a null
      // department can't match a legacy/"أخرى" contract that is also null.
      const isAssigned = !!contract.assignedTo && contract.assignedTo === reqUser.id;
      const allowed =
        ["admin_support", "branch_manager"].includes(reqUser.role) ||
        (reqUser.role === "department_head"
          && !!reqUser.departmentId
          && !!contract.departmentId
          && contract.departmentId === reqUser.departmentId) ||
        isAssigned;
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية للإغلاق المبكر" });
      }
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ error: "سبب الإغلاق مطلوب" });
      // currentStage must move to CLOSED so status + stage stay in
      // sync (the table badge, the stages bar progress, and the
      // pendingReview filters all read currentStage; leaving it on
      // the pre-close stage would create a "closed-but-still-at-تحرير"
      // ghost row).
      const updated = await storage.updateContractAndLog(contract.id, {
        status: "closed",
        currentStage: ContractStage.CLOSED,
        closedAt: new Date().toISOString(),
        closureReason: reason,
      }, {
        activityType: ContractActivityType.EARLY_CLOSED,
        description: `إغلاق مبكر — السبب: ${reason}`,
        metadata: { reason, fromStage: contract.currentStage },
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل الإغلاق المبكر" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/contracts/:id/close-no-response
  // Body: { notes? }. The contracts twin — closes a contract parked at
  // استكمال_البيانات_والمرفقات because the client never supplied the data.
  //
  // Reason resolution is the STRUCTURED one (contract_activity_log has a
  // metadata JSONB), same as consultations.
  //
  // TWO CONTRACT-SPECIFIC POINTS:
  //   • closure_reason on contracts is FREE TEXT — there is no contract closure
  //     enum at all (/early-close takes whatever the user types). So this writes
  //     the shared Arabic ClosureReason.DATA_NOT_COMPLETED value, which keeps the
  //     stored token greppable and identical to the cases side. It is 22 chars,
  //     well inside the varchar(50) column.
  //   • currentStage MUST move to CLOSED, mirroring /early-close: status and
  //     stage are read independently (table badge, stage bar, pendingReview
  //     filters), so leaving the stage behind creates a closed-but-still-at-
  //     استكمال ghost row.
  app.post("/api/contracts/:id/close-no-response", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });

      // Early-close gate, copied from /early-close verbatim.
      const isAssigned = !!contract.assignedTo && contract.assignedTo === reqUser.id;
      const allowed =
        ["admin_support", "branch_manager"].includes(reqUser.role) ||
        (reqUser.role === "department_head"
          && !!reqUser.departmentId
          && !!contract.departmentId
          && contract.departmentId === reqUser.departmentId) ||
        isAssigned;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية للإغلاق" });

      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      if (contract.currentStage !== ContractStage.RECEIVED_PENDING_COMPLETION) {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط لعقد في مرحلة استكمال البيانات والمرفقات" });
      }
      if (contract.pausedAt) {
        return res.status(400).json({ error: "العقد معلّق — أزل التعليق أولاً" });
      }

      let missingData = "";
      try {
        const activities = await storage.getContractActivities(contract.id);
        // Already ordered performedAt DESC — the first match IS the latest.
        const latestAwait = activities.find((a) => a.activityType === ContractActivityType.AWAIT_COMPLETION);
        missingData = String(latestAwait?.metadata?.reason ?? "").trim();
      } catch (e) {
        console.error("[contracts/close-no-response] activity lookup failed:", e);
      }

      const notes = String(req.body?.notes ?? "").trim();
      const description = [
        "إغلاق لعدم استكمال البيانات",
        missingData ? `الناقص: ${missingData}` : "",
        notes,
      ].filter(Boolean).join(" — ");

      const updated = await storage.updateContractAndLog(
        contract.id,
        {
          status: "closed",
          currentStage: ContractStage.CLOSED,
          closedAt: new Date().toISOString(),
          closureReason: ClosureReason.DATA_NOT_COMPLETED,
          closureReasonOther: missingData.slice(0, 500) || null,
          awaitingCompletion: false,
          savedStage: null,
        },
        {
          activityType: ContractActivityType.CLOSED_NO_RESPONSE,
          description,
          metadata: { reason: ClosureReason.DATA_NOT_COMPLETED, missingData, notes, fromStage: contract.currentStage },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل إغلاق العقد" });
      res.json(updated);
    } catch (error: any) {
      console.error("[contracts/close-no-response] error:", error);
      res.status(500).json({ error: error.message || "فشل إغلاق العقد" });
    }
  });

  // POST /api/contracts/:id/reopen
  // Body: { targetStage, notes? }. The contracts twin of the consultations
  // reopen above — see that comment for the full reopen-vs-start-follow-up
  // distinction, the target-stage derivation and the no-children note. Contracts
  // likewise carry no platform numbers, so there is no number prompt.
  //
  // ROLE GATE: this entity's own close tier — the /early-close set verbatim
  // (admin_support | branch_manager | own-dept department_head | assignee), with
  // the status check inverted to "closed".
  //
  // NO CANCELLED-CHILDREN WARNING: contracts have no hearings / memos / field
  // tasks, and /early-close cancels nothing. Attachments and the activity log
  // survive a close untouched and need no restoring.
  app.post("/api/contracts/:id/reopen", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = reopenEntitySchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });

      if (contract.status !== "closed") {
        return res.status(400).json({ error: "يمكن إعادة الفتح فقط لعقد مغلق" });
      }

      const isAssigned = !!contract.assignedTo && contract.assignedTo === reqUser.id;
      const allowed =
        ["admin_support", "branch_manager"].includes(reqUser.role) ||
        (reqUser.role === "department_head"
          && !!reqUser.departmentId
          && !!contract.departmentId
          && contract.departmentId === reqUser.departmentId) ||
        isAssigned;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإعادة فتح العقد" });

      const targetStage = String(req.body?.targetStage ?? "").trim();
      if (!targetStage) {
        return res.status(400).json({ error: "يجب اختيار المرحلة التي سيُفتح عندها العقد" });
      }
      const allowedTargets = getContractReopenTargetStages(contract) as string[];
      if (!allowedTargets.includes(targetStage)) {
        return res.status(400).json({ error: "المرحلة المختارة ليست ضمن مسار هذا العقد" });
      }

      const notes = String(req.body?.notes ?? "").trim();
      const stageLabel = (ContractStageLabels as Record<string, string>)[targetStage] || targetStage;
      const clearedReason = contract.closureReason || "";
      const updated = await storage.updateContractAndLog(
        contract.id,
        {
          status: "active",
          currentStage: targetStage as ContractStageValue,
          closedAt: null,
          closureReason: null,
          closureReasonOther: null,
          pausedAt: null,
          pausedBy: null,
          pauseReason: null,
          pauseUntil: null,
          awaitingCompletion: false,
          savedStage: null,
        },
        {
          activityType: ContractActivityType.REOPENED,
          description: [
            `إعادة فتح العقد عند مرحلة ${stageLabel}`,
            clearedReason ? `سبب الإغلاق السابق: ${clearedReason}` : "",
            notes,
          ].filter(Boolean).join(" — "),
          metadata: {
            targetStage,
            previousClosureReason: clearedReason || null,
            previousClosedAt: contract.closedAt || null,
            notes,
          },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل إعادة فتح العقد" });
      res.json(updated);
    } catch (error: any) {
      console.error("[contracts/reopen] error:", error);
      res.status(500).json({ error: error.message || "فشل إعادة فتح العقد" });
    }
  });

  // POST /api/contracts/:id/start-follow-up
  // Re-opens a CLOSED contract into a follow-up cycle ("استشارة تعقيبية"),
  // mirroring POST /api/consultations/:id/start-follow-up field-for-field.
  // Same row: status flips back to active, currentStage resets to RECEIVED,
  // followUpCount increments, followUpStartedAt is stamped, and the previous
  // closure metadata (closedAt / closureReason*) plus stale pause/await
  // fields are cleared so the row doesn't carry the old cycle forward. The
  // activity log preserves the full history — the closure entry stays put and
  // the follow-up entry is appended.
  //
  // TWO DELIBERATE DIVERGENCES from the consultation handler, both forced by
  // what contracts actually have:
  //   1. NO expectedDeliveryDate recompute — contracts have no SLA column
  //      (no expectedDeliveryDate / category on the contracts table), so
  //      there is no SLA window to refresh.
  //   2. Role gate follows the CONTRACTS convention, not the consultations
  //      one — see the comment on the gate below.
  app.post("/api/contracts/:id/start-follow-up", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });

      // Role gate — CONTRACTS convention (the early-close / pause-like set),
      // NOT the consultations one. The consultation endpoint is admin-only
      // (admin_support | branch_manager) because on that module closing is
      // itself an admin-only step, so re-opening matches its closer. On
      // contracts, closing is NOT admin-only: /early-close is open to
      // branch_manager | admin_support | own-dept department_head | the
      // assigned lawyer. Importing the narrower consultations gate would mean
      // an own-dept head or the assigned lawyer could CLOSE a contract but
      // not re-open the one they just closed. Gate restated verbatim from
      // /early-close above, including its non-empty-departmentId guard so a
      // null-dept head can't match a null-dept contract.
      const isAssigned = !!contract.assignedTo && contract.assignedTo === reqUser.id;
      const allowed =
        ["admin_support", "branch_manager"].includes(reqUser.role) ||
        (reqUser.role === "department_head"
          && !!reqUser.departmentId
          && !!contract.departmentId
          && contract.departmentId === reqUser.departmentId) ||
        isAssigned;
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لبدء استشارة تعقيبية" });
      }

      if (contract.status !== "closed") {
        return res.status(400).json({ error: "يمكن بدء التعقيبية فقط من عقد مغلق" });
      }

      // The cycle question is the client's new follow-up inquiry. Stored in
      // the activity-log metadata only (no new column) — the UI reads the
      // latest FOLLOW_UP_STARTED entry to surface it during the cycle.
      // Pattern-A gate: type check only; the handler check below stays.
      const bodyCheck = startContractFollowUpSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const question = String(req.body?.question ?? "").trim();
      if (!question) {
        return res.status(400).json({ error: "السؤال مطلوب لبدء استشارة تعقيبية" });
      }

      const nextCount = (contract.followUpCount ?? 0) + 1;

      const updated = await storage.updateContractAndLog(
        contract.id,
        {
          status: ContractStatus.ACTIVE,
          currentStage: ContractStage.RECEIVED,
          followUpCount: nextCount,
          followUpStartedAt: new Date().toISOString(),
          // Clear previous closure metadata — it described the prior
          // lifecycle, not the new cycle.
          closedAt: null,
          closureReason: null,
          closureReasonOther: null,
          // Defensive cleanup — clear any stale pause/await state the row
          // might carry from before its original closure so the new cycle
          // starts cleanly. Same list as the consultation handler.
          pausedAt: null,
          pausedBy: null,
          pauseReason: null,
          awaitingCompletion: false,
          savedStage: null,
        },
        {
          activityType: ContractActivityType.FOLLOW_UP_STARTED,
          // Description carries a truncated preview so the timeline reads
          // naturally without expanding; the full question lives in
          // metadata.followUpQuestion and is surfaced in the detail dialog.
          description: `بدء استشارة تعقيبية #${nextCount}: ${question.slice(0, 80)}${question.length > 80 ? "..." : ""}`,
          metadata: {
            followUpCount: nextCount,
            followUpQuestion: question,
            fromStage: contract.currentStage,
          },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل بدء التعقيبية" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Contract send (إرسال العقد) completion — the admin_support person confirms
  // "تم الإرسال" on the جاهزة_للإرسال sender task. Auto-advances the contract to
  // مغلقة (the terminal stage — sending IS the end) via updateContractAndLog, and
  // records "تم إرسال العقد بواسطة <name>" to the activity log (delegation
  // actorDisplayName stamping; contracts have no caseId so all_cases delegators
  // stamp). Gated to admin_support / branch_manager — mirrors the READY→CLOSED
  // stage-transition rule (contract-send is mapping-routed, no per-instance
  // assignee). Guards on status active + currentStage جاهزة_للإرسال.
  app.post("/api/contracts/:id/mark-sent", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      // WIDENED MODEL — was admin_support | branch_manager. Own-dept department_head
      // and the assigned lawyer may now confirm the send. Gate moved below the fetch
      // so it can be scoped to the contract. (This endpoint currently has NO frontend
      // caller — see the report — so the widening is forward-looking, not a live
      // behaviour change.)
      if (
        !["admin_support", "branch_manager"].includes(reqUser.role)
        && !canActOnEntityTiered(reqUser, contract, contract.departmentId, req.actingContext, null)
      ) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإرسال العقد" });
      }
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      if (contract.currentStage !== ContractStage.READY) {
        return res.status(400).json({ error: "العقد ليس في مرحلة جاهزة للإرسال" });
      }
      const actorName = actorDisplayName(req.actingContext, null, reqUser.name || reqUser.id);
      const updated = await storage.updateContractAndLog(contract.id, {
        status: "closed",
        currentStage: ContractStage.CLOSED,
        closedAt: new Date().toISOString(),
      }, {
        activityType: ContractActivityType.SENT,
        description: `تم إرسال العقد بواسطة ${actorName}`,
        metadata: { fromStage: contract.currentStage },
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل إرسال العقد" });
      res.json(updated);
    } catch (error) {
      console.error("Error marking contract sent:", error);
      res.status(500).json({ error: "حدث خطأ في إرسال العقد" });
    }
  });

  // Pause / unpause / await-completion / resume / skip-data-completion —
  // same gate across all five (branch_manager / admin_support /
  // department_head own dept / assigned lawyer) and same payload shape
  // as the consultation handlers.
  const allowContractPauseLike = (reqUser: any, contract: any): boolean =>
    reqUser.role === "branch_manager"
    || reqUser.role === "admin_support"
    || (reqUser.role === "department_head" && !!reqUser.departmentId && contract.departmentId === reqUser.departmentId)
    || contract.assignedTo === reqUser.id;

  app.post("/api/contracts/:id/pause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!allowContractPauseLike(reqUser, contract)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتعليق العقد" });
      }
      if (contract.status !== "active") {
        return res.status(400).json({ error: "العقد ليس نشطاً" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowPauseSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });
      // OPTIONAL auto-lift date. Absent → open-ended, exactly as before.
      const pauseUntil = String(req.body?.pauseUntil ?? "").trim();
      const pauseUntilError = validatePauseUntil(pauseUntil, todayDateString());
      if (pauseUntilError) return res.status(400).json({ error: pauseUntilError });
      const updated = await storage.pauseContract(contract.id, { reason, performedBy: reqUser.id, pauseUntil });
      if (!updated) return res.status(500).json({ error: "فشل التعليق" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/unpause", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!allowContractPauseLike(reqUser, contract)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء التعليق" });
      }
      if (contract.status !== "paused") {
        return res.status(400).json({ error: "العقد ليس معلّقاً" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const updated = await storage.unpauseContract(contract.id, { notes, performedBy: reqUser.id });
      if (!updated) return res.status(500).json({ error: "فشل إلغاء التعليق" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/await-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!allowContractPauseLike(reqUser, contract)) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
      if (contract.status !== "active") return res.status(400).json({ error: "العقد ليس نشطاً" });
      if (contract.awaitingCompletion) {
        return res.status(400).json({ error: "العقد بالفعل بانتظار الاستكمال" });
      }
      if (contract.currentStage === ContractStage.RECEIVED_PENDING_COMPLETION) {
        return res.status(400).json({ error: "العقد بالفعل في مرحلة الاستكمال" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });
      const updated = await storage.awaitContractCompletion(contract.id, { reason, performedBy: reqUser.id });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/resume-from-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!allowContractPauseLike(reqUser, contract)) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
      if (!contract.awaitingCompletion) {
        return res.status(400).json({ error: "العقد ليس بانتظار الاستكمال" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const updated = await storage.resumeContractFromCompletion(contract.id, { notes, performedBy: reqUser.id });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/contracts/:id/skip-data-completion
  //
  // The PRE-ENTRY skip — twin of the consultations handler above and of the
  // cases original. Pressed AT استلام to jump PAST the data-completion stage.
  // Contracts have a single flow, so there is one target (تحرير), but it is
  // still resolved through the shared helper because that helper is what
  // refuses a follow-up cycle.
  app.post("/api/contracts/:id/skip-data-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!allowContractPauseLike(reqUser, contract)) {
        return res.status(403).json({ error: "لا تملك صلاحية تجاوز مرحلة استكمال المرفقات والبيانات" });
      }
      if (contract.status !== "active") return res.status(400).json({ error: "العقد ليس نشطاً" });
      if (contract.currentStage !== ContractStage.RECEIVED) {
        return res.status(400).json({ error: "تجاوز مرحلة استكمال المرفقات والبيانات متاح فقط من مرحلة الاستلام" });
      }
      // Same defensive guard as the consultations twin — unreachable via the
      // UI because /await-completion moves the stage off RECEIVED.
      if (contract.awaitingCompletion) {
        return res.status(400).json({ error: "العقد بانتظار استكمال المرفقات والبيانات" });
      }

      // 🔴 THE FOLLOW-UP-CYCLE REFUSAL — contracts have one too.
      // ContractCycleStages is [RECEIVED, READY, CLOSED]: no data-completion
      // stage, so a تعقيبية contract has nothing to skip and the helper
      // returns null.
      const targetStage = contractSkipDataCompletionTarget(contract);
      if (!targetStage) {
        return res.status(400).json({ error: "لا توجد مرحلة استكمال في هذا المسار لتجاوزها" });
      }

      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

      const updated = await storage.skipContractDataCompletion(contract.id, {
        targetStage,
        notes,
        performedBy: reqUser.id,
        performerName: actorDisplayName(req.actingContext, null, reqUser.name || reqUser.id),
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[contracts/skip-data-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  app.get("/api/contracts/:id/activities", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!canModifyContract(reqUser, contract, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية عرض هذا العقد" });
      }
      const activities = await storage.getContractActivities(contract.id);
      res.json(activities);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Contract attachments ====================
  // Multer writes the multipart payload to ./uploads (50MB cap), the
  // handler then hands the temp file off to the SDK's
  // uploadFromFilename, then unlinks it. Keeps per-upload heap
  // bounded — 5 concurrent 50MB uploads were ~500MB on the old
  // memoryStorage path.
  function unlinkContractTemp(filePath: string | undefined, ctx: string) {
    if (!filePath) return;
    fs.unlink(filePath, (err) => {
      if (err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[${ctx}] temp file cleanup failed:`, {
          filePath,
          error: err.message,
        });
      }
    });
  }

  const contractUpload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, "");
        cb(null, `${Date.now()}-${randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/jpeg",
        "image/png",
      ];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  // Per-stage required-slot validator. Looks up
  // ContractSlotsByType[contract.contractType] and rejects the
  // transition if any rule whose `requiredBeforeLeavingStage` matches
  // the current stage is missing its row in contract_attachments.
  // Returns an Arabic error string when something's missing, or null
  // when the gate passes (or there are no rules for this type/stage).
  //
  // ⚠ CURRENTLY UNREACHABLE-BY-DATA, not dead code. Owner policy is that NO
  // attachment gates a contract stage transition, so every
  // requiredBeforeLeavingStage in the table is null. `gating` therefore always
  // comes back empty and this returns null immediately: the filter compares
  // `r.requiredBeforeLeavingStage === fromStage`, and fromStage is always a
  // non-null stage string (contracts.current_stage is NOT NULL with a default),
  // so a null rule can never match it.
  //
  // Deliberately KEPT rather than deleted, unlike the truly-dead paths this
  // audit removed (court-register, the localStorage delegation dialog): those
  // could never succeed, whereas this mechanism works and is disarmed only by
  // its data. Re-arming one slot stays a one-line change in schema.ts.
  async function checkRequiredSlotsForTransition(
    contract: any,
    fromStage: string,
  ): Promise<string | null> {
    const resolved = resolveContractType(contract.contractType);
    const rules = ContractSlotsByType[resolved] || [];
    const gating = rules.filter((r: any) => r.requiredBeforeLeavingStage === fromStage);
    if (gating.length === 0) return null;
    for (const rule of gating) {
      const existing = await storage.getContractAttachmentBySlot(contract.id, rule.slotKey);
      if (!existing) {
        const slotLabel = ContractAttachmentSlotLabels[rule.slotKey] || rule.slotKey;
        const stageLabel = (ContractStageLabels as Record<string, string>)[fromStage] || fromStage;
        return `لا يمكن مغادرة مرحلة "${stageLabel}" قبل رفع المرفق "${slotLabel}"`;
      }
    }
    return null;
  }

  // POST /api/contracts/:id/attachments — multipart upload. Body
  // fields: file (required), slotKey (optional — null for "additional"),
  // description (optional). Validates contractId + slotKey, hands off
  // to storage.createContractAttachment which atomically replaces the
  // prior file in the same slot when present. The displaced file is
  // unlinked from disk after the DB transaction commits so a crashed
  // upload can't orphan the new row.
  app.post(
    "/api/contracts/:id/attachments",
    requireAuth,
    (req, res, next) => contractUpload.single("file")(req, res, (err) => {
      if (!err) return next();
      // Always log: silent multer failures (path traversal in dest cb,
      // disk full, fs perms) were impossible to debug without this.
      console.error("[contracts/attachments POST] multer error:", {
        code: (err as any)?.code,
        message: (err as any)?.message,
        field: (err as any)?.field,
        contractId: req.params?.id,
      });
      // If multer started writing the body to disk before failing
      // (e.g. LIMIT_FILE_SIZE trips midway), the partial temp file is
      // sitting in ./uploads — unlink it so we don't leak the disk.
      unlinkContractTemp((req as any).file?.path, "contracts/attachments POST (multer error)");
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "حجم الملف يتجاوز الحد المسموح (50MB)" });
      }
      return res.status(400).json({ error: "فشل تحميل الملف" });
    }),
    async (req: AuthRequest, res) => {
      // diskStorage → file.path is the temp file on disk; file.buffer
      // does not exist. Capture path up front so the finally block
      // can unlink regardless of which early-return we hit.
      const file = (req as any).file as
        | { originalname: string; path: string; filename: string; size: number; mimetype: string }
        | undefined;
      const tempPath = file?.path;
      try {
        const reqUser = req.user;
        if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
        const contract = await storage.getContractById(String(req.params.id));
        if (!contract) {
          return res.status(404).json({ error: "العقد غير موجود" });
        }
        if (!canModifyContract(reqUser, contract, req.actingContext)) {
          return res.status(403).json({ error: "لا تملك صلاحية رفع مرفقات لهذا العقد" });
        }
        if (!file) {
          // No file = fileFilter rejected the mimetype (silently — multer
          // skips rejected files instead of erroring). Log the rejected
          // mimetype so we can tell "they forgot to attach a file" from
          // "they uploaded a .heic / .zip".
          console.error("[contracts/attachments POST] no file in request", {
            contractId: req.params?.id,
            multipartFields: Object.keys(req.body || {}),
          });
          return res.status(400).json({ error: "الملف مطلوب أو نوعه غير مسموح" });
        }
        // Multer reads the multipart `filename` field as latin1 by
        // default (busboy default for header parsing), so any
        // non-ASCII original-filename bytes round-trip into mojibake
        // ("اÙØ¹Ù‚د..."). Re-decode the latin1-as-bytes back into
        // UTF-8 here, BEFORE we persist the row, so the DB / API
        // response / Content-Disposition all carry the real Arabic
        // string. Safe for ASCII-only names. Note: only the display
        // name (file.originalname) is corrected — file.filename /
        // file.path are already ASCII-only (UUID + sanitized ext).
        try {
          file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
        } catch {
          // Defensive — Buffer.from never throws on a string input,
          // but if some Node version surprises us, fall through with
          // the raw value rather than 500ing the upload.
        }
        const rawSlot = typeof req.body?.slotKey === "string" ? req.body.slotKey.trim() : "";
        const description = typeof req.body?.description === "string" ? req.body.description : null;
        let slotKey: string | null = null;
        if (rawSlot && rawSlot !== "null" && rawSlot !== "additional") {
          const validSlots = Object.values(ContractAttachmentSlot) as string[];
          if (!validSlots.includes(rawSlot)) {
            return res.status(400).json({ error: "خانة المرفق غير صحيحة" });
          }
          // Slot must be allowed for this contract type (per ContractSlotsByType).
          const resolved = resolveContractType(contract.contractType);
          const allowedSlotsForType = (ContractSlotsByType[resolved] || []).map((r: any) => r.slotKey);
          if (!allowedSlotsForType.includes(rawSlot)) {
            return res.status(400).json({ error: "هذه الخانة غير متاحة لنوع العقد الحالي" });
          }
          // "العقد محل المراجعة" is immutable once a REAL file lives
          // there. We only block the replace if the existing row is a
          // fresh Object-Storage upload — legacy disk-path rows whose
          // underlying file vanished with the last ephemeral redeploy
          // are stubs we WANT users to overwrite (no other recovery
          // path). Other slots (review_study, drafted_contract, mou)
          // still replace freely regardless.
          if (rawSlot === ContractAttachmentSlot.CONTRACT_UNDER_REVIEW) {
            const existing = await storage.getContractAttachmentBySlot(contract.id, rawSlot);
            if (existing && isAttachmentObjectKey(existing.filePath)) {
              return res.status(409).json({
                error: "العقد محل المراجعة لا يمكن استبداله بعد رفعه. احذفه أولاً إذا كان لديك الصلاحية.",
              });
            }
          }
          slotKey = rawSlot;
        }

        // Upload to Object Storage BEFORE inserting the DB row so a
        // failed upload doesn't leave an orphan row pointing at
        // nothing. If the bucket is unreachable (env not configured,
        // network blip), surface a 500 with the SDK error so support
        // sees the real cause.
        const objectKey = makeContractObjectKey(contract.id, file.originalname);
        // Stream from the on-disk temp file straight to the bucket.
        // uploadFromFilename uses @google-cloud/storage's resumable
        // upload internally, so the bytes never sit in Node's heap —
        // unlike the previous uploadFromBytes(file.buffer) call.
        const uploadResult = await attachmentObjectStore.uploadFromFilename(objectKey, file.path);
        if (!uploadResult.ok) {
          console.error("[contracts/attachments POST] object storage upload failed:", {
            objectKey,
            error: uploadResult.error,
          });
          return res.status(500).json({
            error: `فشل رفع الملف إلى التخزين السحابي: ${uploadResult.error?.message || "خطأ غير معروف"}`,
          });
        }

        const { attachment, replaced } = await storage.createContractAttachment({
          contractId: contract.id,
          slotKey,
          fileName: file.originalname,
          filePath: objectKey,
          fileSize: file.size,
          mimeType: file.mimetype,
          description,
          uploadedBy: reqUser.id,
        });

        // Delete the displaced blob from Object Storage after the DB
        // transaction commits — only if the prior row was itself an
        // Object-Storage upload. Legacy disk paths point at nothing
        // (the file vanished on the redeploy that triggered this whole
        // migration), so there's nothing to clean up. Best-effort —
        // a failed delete just leaves a billable orphan, not a
        // correctness issue.
        if (replaced && replaced.filePath && replaced.filePath !== attachment.filePath) {
          if (isAttachmentObjectKey(replaced.filePath)) {
            attachmentObjectStore.delete(replaced.filePath, { ignoreNotFound: true }).catch((e) => {
              console.error("[contracts/attachments POST] failed to delete replaced object:", {
                key: replaced.filePath,
                error: e,
              });
            });
          }
        }

        // Activity log entry — replaced vs added paths differ in
        // copy + metadata so the timeline is unambiguous.
        const slotLabel = slotKey ? ((ContractAttachmentSlotLabels as Record<string, string>)[slotKey] || slotKey) : "مرفقات إضافية";
        if (replaced) {
          await storage.createContractActivity({
            contractId: contract.id,
            activityType: ContractActivityType.ATTACHMENT_REPLACED,
            description: `استبدال ملف "${slotLabel}" — ${replaced.fileName} ← ${file.originalname}`,
            metadata: { slotKey, oldFileName: replaced.fileName, newFileName: file.originalname },
            performedBy: reqUser.id,
          });
        } else {
          await storage.createContractActivity({
            contractId: contract.id,
            activityType: ContractActivityType.ATTACHMENT_ADDED,
            description: slotKey
              ? `إضافة ملف "${slotLabel}" — ${file.originalname}`
              : `إضافة مرفق إضافي — ${file.originalname}`,
            metadata: { slotKey, fileName: file.originalname },
            performedBy: reqUser.id,
          });
        }
        res.status(201).json({ attachment, replaced });
      } catch (error: any) {
        // Temp file is unlinked by the finally block below. If the
        // SDK upload already succeeded but the DB insert failed we'll
        // have a billable orphan in Object Storage; rare enough that
        // a periodic GC sweep is the right place to handle it.
        console.error("[contracts/attachments POST] error:", error);
        res.status(500).json({ error: error.message || "فشل رفع المرفق" });
      } finally {
        // Every code path (success, validation reject, upload fail,
        // unexpected throw) flows through here. ENOENT is swallowed
        // so the second cleanup after a multer-level failure is a
        // no-op.
        unlinkContractTemp(tempPath, "contracts/attachments POST");
      }
    },
  );

  app.get("/api/contracts/:id/attachments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!canModifyContract(reqUser, contract, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية عرض هذا العقد" });
      }
      const all = await storage.getContractAttachments(contract.id);
      // Group by slot vs additional so the FE doesn't have to bucket.
      // Each row gets a `missing` flag derived from the filePath shape:
      // legacy disk paths reference files that were wiped by the last
      // ephemeral redeploy. The client renders a "missing — please
      // re-upload" badge for these and disables preview/download.
      const slots: Record<string, any> = {};
      const additional: any[] = [];
      for (const a of all) {
        const enriched = { ...a, missing: !isAttachmentObjectKey(a.filePath) };
        if (a.slotKey) slots[a.slotKey] = enriched;
        else additional.push(enriched);
      }
      res.json({ slots, additional });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contracts/:id/attachments/:attachmentId/download", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!canModifyContract(reqUser, contract, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية تحميل هذا الملف" });
      }
      const att = await storage.getContractAttachmentById(String(req.params.attachmentId));
      if (!att || att.contractId !== contract.id) {
        return res.status(404).json({ error: "المرفق غير موجود" });
      }
      // Legacy disk-path rows from before the Object-Storage migration:
      // the underlying file is gone from the ephemeral container and
      // is not recoverable. Return 410 Gone with the recovery copy the
      // UI knows how to render (re-upload affordance) — don't bother
      // hitting Object Storage with a key that was never there.
      if (!isAttachmentObjectKey(att.filePath)) {
        return res.status(410).json({
          error: "الملف مفقود — يرجى إعادة الرفع من جديد",
        });
      }
      // RFC 5987 filename* for the Arabic original name; ASCII fallback
      // for older clients.
      const safeAscii = att.fileName.replace(/[^\x20-\x7E]/g, "_");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      );
      res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
      if (att.fileSize) {
        res.setHeader("Content-Length", String(att.fileSize));
      }
      // Stream from Object Storage straight to the client. Body + error
      // translation moved verbatim into streamAttachmentToResponse so the
      // contract, deed and minutes downloads share one implementation.
      streamAttachmentToResponse(attachmentObjectStore, att, res, "contracts download");
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/contracts/:id/attachments/:attachmentId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      const att = await storage.getContractAttachmentById(String(req.params.attachmentId));
      if (!att || att.contractId !== contract.id) {
        return res.status(404).json({ error: "المرفق غير موجود" });
      }
      // Per spec: uploader / dept_head (own dept) / branch_manager / admin_support.
      // EXCEPTION: contract_under_review is the immutable source
      // document — only branch_manager + admin_support can delete it
      // (for mis-upload recovery). Assigned lawyers and dept_heads can
      // delete every OTHER attachment, but not this slot.
      const isContractUnderReview = att.slotKey === ContractAttachmentSlot.CONTRACT_UNDER_REVIEW;
      const allowed = isContractUnderReview
        ? (reqUser.role === "branch_manager" || reqUser.role === "admin_support")
        : (
            att.uploadedBy === reqUser.id
            || reqUser.role === "branch_manager"
            || reqUser.role === "admin_support"
            || (reqUser.role === "department_head" && !!reqUser.departmentId && contract.departmentId === reqUser.departmentId)
          );
      if (!allowed) {
        return res.status(403).json({
          error: isContractUnderReview
            ? "حذف العقد محل المراجعة مسموح فقط لمدير الفرع والدعم الإداري"
            : "ليس لديك صلاحية لحذف هذا المرفق",
        });
      }
      const deleted = await storage.deleteContractAttachment(att.id);
      if (!deleted) return res.status(404).json({ error: "المرفق غير موجود" });
      // Drop the blob from Object Storage after the DB row is gone.
      // Legacy disk-path rows (pre-migration) reference files that
      // were already wiped by the redeploy that prompted this whole
      // change — no-op for those. ignoreNotFound:true so a missing
      // object doesn't fail the response after the row is already
      // deleted; best-effort either way.
      if (deleted.filePath && isAttachmentObjectKey(deleted.filePath)) {
        attachmentObjectStore.delete(deleted.filePath, { ignoreNotFound: true }).catch((e) => {
          console.error("[contracts/attachments DELETE] failed to delete object:", {
            key: deleted.filePath,
            error: e,
          });
        });
      }
      await storage.createContractActivity({
        contractId: contract.id,
        activityType: ContractActivityType.ATTACHMENT_DELETED,
        description: `حذف مرفق — ${deleted.fileName}`,
        metadata: { slotKey: deleted.slotKey, fileName: deleted.fileName },
        performedBy: reqUser.id,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[contracts/attachments DELETE] error:", error);
      res.status(500).json({ error: error.message || "فشل حذف المرفق" });
    }
  });

  // ==================== Judgment deed (صك) — case attachment ====================
  // Four routes mirroring the contract attachment block above: upload, get,
  // download, delete. Same multer instance (contractUpload — 50MB cap, same
  // MIME allowlist, same disk-staging), same Object-Storage-BEFORE-DB ordering,
  // same temp-file unlink in `finally`, same latin1→UTF-8 filename repair, same
  // RFC-5987 Content-Disposition, same stream-error translation.
  //
  // ONE deed per case: there is no slotKey and no "additional" list. A
  // re-upload REPLACES, enforced by the unique index on case_attachments.case_id
  // and executed in storage.createCaseAttachment's single transaction.
  //
  // The deed FILE and the deed RECEIPT DATE are separate, on purpose. The date
  // (POST /api/cases/:id/judgment-deed) starts the objection clock and
  // creates/re-dates the لائحة اعتراضية memo. These routes only carry the PDF.
  // NOTHING here is stage-gated and nothing blocks a transition — batch 1 is
  // storage + routes + UI only.

  app.post(
    "/api/cases/:id/deed-attachment",
    requireAuth,
    (req, res, next) => contractUpload.single("file")(req, res, (err) => {
      if (!err) return next();
      console.error("[cases/deed-attachment POST] multer error:", {
        code: (err as any)?.code,
        message: (err as any)?.message,
        field: (err as any)?.field,
        caseId: req.params?.id,
      });
      unlinkContractTemp((req as any).file?.path, "cases/deed-attachment POST (multer error)");
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "حجم الملف يتجاوز الحد المسموح (50MB)" });
      }
      return res.status(400).json({ error: "فشل تحميل الملف" });
    }),
    async (req: AuthRequest, res) => {
      const file = (req as any).file as
        | { originalname: string; path: string; filename: string; size: number; mimetype: string }
        | undefined;
      const tempPath = file?.path;
      try {
        const reqUser = req.user;
        if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
        const lawCase = await storage.getCaseById(String(req.params.id));
        if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
        if (!canAttachCaseJudgmentDeed(reqUser, lawCase, req.actingContext)) {
          return res.status(403).json({ error: "ليس لديك صلاحية لإرفاق صك الحكم" });
        }
        if (!file) {
          // No file = fileFilter rejected the mimetype (multer skips rejected
          // files silently instead of erroring). Log the attempt so we can tell
          // "forgot to attach" from "uploaded a .heic".
          console.error("[cases/deed-attachment POST] no file in request", {
            caseId: req.params?.id,
            multipartFields: Object.keys(req.body || {}),
          });
          return res.status(400).json({ error: "الملف مطلوب أو نوعه غير مسموح" });
        }
        // Multer parses the multipart filename as latin1 (busboy default), so
        // Arabic names round-trip into mojibake. Re-decode BEFORE persisting.
        try {
          file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
        } catch {
          // Defensive only — Buffer.from never throws on a string input.
        }

        // 🔴 THE DEED NOW BELONGS TO A RULING (batch 2). A case can carry up to
        // three rulings, each with its OWN صك, so "the case's deed" is no longer a
        // well-formed idea — this file is the deed of whichever ruling is current.
        //
        // The key follows the owner: judgments/<judgmentId>/… when a judgment
        // record exists. That is the whole point of the prefix scheme (the prefix
        // IS the bucket folder, so keys are self-describing), and a صك belonging
        // to ruling #2 must not live under a key claiming to be THE case's deed.
        //
        // FALLBACK, not an error: a case with NO judgment row keeps the old
        // cases/<caseId>/… key and the old single-row behaviour. Batch 1 backfilled
        // every case that reached a judgment stage, so this is an edge (a case
        // whose stage_history was never populated and so fell outside the
        // population) — and refusing the upload there would strand a real deed
        // rather than file it.
        const currentJudgment = await currentJudgmentFor(lawCase.id);
        // Object Storage FIRST, DB row second, so a failed upload cannot leave
        // a row pointing at nothing.
        const objectKey = currentJudgment
          ? makeJudgmentDeedObjectKey(currentJudgment.id, file.originalname)
          : makeCaseDeedObjectKey(lawCase.id, file.originalname);
        const uploadResult = await attachmentObjectStore.uploadFromFilename(objectKey, file.path);
        if (!uploadResult.ok) {
          console.error("[cases/deed-attachment POST] object storage upload failed:", {
            objectKey,
            error: uploadResult.error,
          });
          return res.status(500).json({
            error: `فشل رفع الملف إلى التخزين السحابي: ${uploadResult.error?.message || "خطأ غير معروف"}`,
          });
        }

        // 🔴 DUAL-WRITE, ONE BLOB — and the case_attachments row is deliberately
        // KEPT, not replaced. Batch 2 writes the judgment-keyed row that batch 3
        // will read from, while every reader that exists TODAY —
        // isJudgmentDeedMissing (the close gate, both advance gates, the
        // appeal-outcome gate and the ضدنا auto-close), getCaseIdsWithDeedAttachment
        // (the hasDeedAttachment list flag behind two badges) and the deed
        // GET/download routes — still reads case_attachments and still works
        // unchanged. Dropping the old row here would have re-keyed all of them in a
        // batch whose whole premise is that it re-keys none.
        //
        // Both rows carry the SAME filePath: one upload, one blob, two references.
        // That is exactly the shape batch 1's copy produced, so backfilled and
        // newly-uploaded deeds are indistinguishable downstream — which is what
        // makes batch 3's cutover a reader change and nothing more.
        const { attachment, replaced } = await storage.createCaseAttachment({
          caseId: lawCase.id,
          fileName: file.originalname,
          filePath: objectKey,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedBy: reqUser.id,
        });

        let judgmentReplaced: { filePath: string } | null = null;
        if (currentJudgment) {
          const judgmentWrite = await storage.createJudgmentAttachment({
            judgmentId: currentJudgment.id,
            fileName: file.originalname,
            filePath: objectKey,
            fileSize: file.size,
            mimeType: file.mimetype,
            uploadedBy: reqUser.id,
          });
          judgmentReplaced = judgmentWrite.replaced;
        }

        // Drop the displaced blob AFTER the transaction commits. Best-effort:
        // a failed delete leaves a billable orphan, not a correctness problem.
        //
        // 🔴 REFERENCE-COUNTED NOW. A displaced key may still be referenced by the
        // OTHER table — most obviously for a backfilled case, where both rows point
        // at the same copied key, so replacing one row leaves the other pointing at
        // a blob this used to delete outright. countAttachmentRowsWithPath asks
        // BOTH tables; only a key nobody references any more is removed.
        const displacedPaths = Array.from(new Set(
          [replaced?.filePath, judgmentReplaced?.filePath]
            .filter((p): p is string => !!p && p !== attachment.filePath),
        ));
        for (const displaced of displacedPaths) {
          if (!isAttachmentObjectKey(displaced)) continue;
          const stillReferenced = await storage.countAttachmentRowsWithPath(displaced);
          if (stillReferenced > 0) continue;
          attachmentObjectStore.delete(displaced, { ignoreNotFound: true }).catch((e) => {
            console.error("[cases/deed-attachment POST] failed to delete replaced object:", {
              key: displaced,
              error: e,
            });
          });
        }

        await logCaseActivityActing(req, {
          caseId: lawCase.id,
          userId: reqUser.id,
          userName: reqUser.name || reqUser.id,
          actionType: replaced ? "judgment_deed_file_replaced" : "judgment_deed_file_attached",
          title: replaced
            ? `استبدال ملف صك الحكم — ${replaced.fileName} ← ${file.originalname}`
            : `إرفاق ملف صك الحكم — ${file.originalname}`,
          details: JSON.stringify({
            fileName: file.originalname,
            oldFileName: replaced?.fileName ?? null,
            fileSize: file.size,
          }),
        });

        // 🔴 THE DEFERRED-CLOSE RE-EVALUATION. Load-bearing, not redundant.
        // maybeCloseCaseAfterPostJudgmentTasks is EVENT-DRIVEN — its only other
        // callers are field-task completions — and it now declines to close while
        // the صك is missing. A case whose collection/execution tasks were ALL
        // resolved before the deed arrived has no further completion event coming,
        // so without this call the deferred close would never fire and the case
        // would sit at محكوم_حكم_نهائي forever. Attaching the deed IS the event.
        // Self-gating and best-effort exactly like every other caller: it no-ops
        // unless the case is on the right stage with all post-judgment tasks
        // resolved, and it swallows its own errors, so it can never fail an
        // upload that already succeeded.
        await maybeCloseCaseAfterPostJudgmentTasks(req, lawCase.id, reqUser);

        res.status(201).json({ attachment, replaced });
      } catch (error: any) {
        console.error("[cases/deed-attachment POST] error:", error);
        res.status(500).json({ error: error.message || "فشل رفع المرفق" });
      } finally {
        unlinkContractTemp(tempPath, "cases/deed-attachment POST");
      }
    },
  );

  // Returns { attachment } — null when nothing is attached yet.
  //
  // 🔴 READ GATE = requireAuth ONLY (owner decision 2026-08-04: every employee may
  // read any case, any صك and any ضبط). This MATCHES the case read rather than
  // inventing a rule: GET /api/cases is `requireAuth` + getAllCases() with NO
  // scoping of any kind, so every authenticated user already receives every case
  // row. canModifyCase here was strictly NARROWER than the list that leads to it —
  // it excluded a department_head of another department, an unassigned employee and
  // every non-admin role — which is why a صك could be invisible on a case the same
  // user could already open and read.
  //
  // ⚠ THE WRITE GATE ABOVE IS UNCHANGED — POST/DELETE still canAttachCaseJudgmentDeed.
  // Widening the read does not widen anything else; viewer reaches this route and
  // nothing more, because viewerWriteGuard (server/index.ts:108) 403s every non-GET
  // from a viewer before any handler runs.
  app.get("/api/cases/:id/deed-attachment", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
      const att = await storage.getCaseAttachment(lawCase.id);
      // `missing` mirrors the contracts convention: runtime-derived, never
      // stored. Always false for these rows in practice (there is no legacy
      // disk-path era for this table), but the field keeps the client's
      // rendering logic identical across all three attachment surfaces.
      res.json({ attachment: att ? { ...att, missing: !isAttachmentObjectKey(att.filePath) } : null });
    } catch (error: any) {
      console.error("[cases/deed-attachment GET] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // requireAuth ONLY — same owner decision and same reasoning as the metadata
  // route above; the two must agree or the control fetches a file it cannot then
  // open. Write routes untouched.
  app.get("/api/cases/:id/deed-attachment/download", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
      const att = await storage.getCaseAttachment(lawCase.id);
      if (!att) return res.status(404).json({ error: "المرفق غير موجود" });
      if (!isAttachmentObjectKey(att.filePath)) {
        return res.status(410).json({ error: "الملف مفقود — يرجى إعادة الرفع من جديد" });
      }
      const safeAscii = att.fileName.replace(/[^\x20-\x7E]/g, "_");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      );
      res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
      if (att.fileSize) res.setHeader("Content-Length", String(att.fileSize));
      streamAttachmentToResponse(attachmentObjectStore, att, res, "cases/deed-attachment download");
    } catch (error: any) {
      console.error("[cases/deed-attachment download] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/cases/:id/deed-attachment", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });
      // Same gate as upload — whoever may attach the deed may replace or remove it.
      if (!canAttachCaseJudgmentDeed(reqUser, lawCase, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لحذف صك الحكم" });
      }
      const att = await storage.getCaseAttachment(lawCase.id);
      if (!att) return res.status(404).json({ error: "المرفق غير موجود" });
      const deleted = await storage.deleteCaseAttachment(att.id);
      if (!deleted) return res.status(404).json({ error: "المرفق غير موجود" });

      // The dual-write's other half. Removing "the صك" must remove BOTH rows or
      // the judgment record keeps claiming a deed the user just deleted. Only the
      // CURRENT ruling's row is touched — an older ruling's صك is a different
      // document and is not what this button removed.
      const currentJudgment = await currentJudgmentFor(lawCase.id);
      let judgmentDeletedPath: string | null = null;
      if (currentJudgment) {
        const judgmentAtt = await storage.getJudgmentAttachment(currentJudgment.id);
        if (judgmentAtt) {
          const removed = await storage.deleteJudgmentAttachment(judgmentAtt.id);
          judgmentDeletedPath = removed?.filePath ?? null;
        }
      }

      // 🔴 THE BLOB IS REFERENCE-COUNTED, NOT DELETED WITH ITS ROW. After batch 1's
      // copy — and after every batch-2 upload — ONE Object-Storage key is
      // referenced by a row in EACH table. Deleting the blob alongside the first
      // row would leave the surviving row pointing at nothing: the file would
      // render as missing and download would 410, with no way to tell it apart
      // from a genuine upload failure. So each distinct key is removed only once
      // NO row in EITHER table still names it.
      const deletedPaths = Array.from(new Set(
        [deleted.filePath, judgmentDeletedPath].filter((p): p is string => !!p),
      ));
      for (const filePath of deletedPaths) {
        if (!isAttachmentObjectKey(filePath)) continue;
        const stillReferenced = await storage.countAttachmentRowsWithPath(filePath);
        if (stillReferenced > 0) {
          console.warn("[cases/deed-attachment DELETE] blob kept — still referenced", {
            key: filePath,
            remainingRows: stillReferenced,
          });
          continue;
        }
        attachmentObjectStore.delete(filePath, { ignoreNotFound: true }).catch((e) => {
          console.error("[cases/deed-attachment DELETE] failed to delete object:", {
            key: filePath,
            error: e,
          });
        });
      }
      await logCaseActivityActing(req, {
        caseId: lawCase.id,
        userId: reqUser.id,
        userName: reqUser.name || reqUser.id,
        actionType: "judgment_deed_file_deleted",
        title: `حذف ملف صك الحكم — ${deleted.fileName}`,
        details: JSON.stringify({ fileName: deleted.fileName }),
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[cases/deed-attachment DELETE] error:", error);
      res.status(500).json({ error: error.message || "فشل حذف المرفق" });
    }
  });

  // ==================== Hearing minutes (ضبط الجلسة) — hearing attachment ====================
  // Same four routes, same mechanics. Gate is canActOnHearing AS-IS on all four
  // (attending lawyer / branch_manager / admin_support, delegation-aware).
  //
  // ⚠ DELIBERATELY NOT department-scoped. Hearings carry no departmentId, so
  // scoping a department_head would mean resolving the department through the
  // parent case — the known-large open item that kept hearings out of the
  // 2026-07-28 tiered permissions widening. Out of scope here by instruction;
  // these routes therefore use the SAME actor set as every other hearing
  // action (result, report, close, cancel), which is the consistent choice.
  //
  // ⚠ NOT related to hearings.hearing_minutes — an unused TEXT column from a
  // Feb-2026 agent batch that would hold pasted transcript text, not a file.
  // Left untouched.
  //
  // Hearings have NO activity log of their own; these routes log to the PARENT
  // CASE's timeline with relatedEntityType "hearing", exactly as the existing
  // hearing cancel / flag / report-edit routes already do. No new log table.

  app.post(
    "/api/hearings/:id/minutes-attachment",
    requireAuth,
    (req, res, next) => contractUpload.single("file")(req, res, (err) => {
      if (!err) return next();
      console.error("[hearings/minutes-attachment POST] multer error:", {
        code: (err as any)?.code,
        message: (err as any)?.message,
        field: (err as any)?.field,
        hearingId: req.params?.id,
      });
      unlinkContractTemp((req as any).file?.path, "hearings/minutes-attachment POST (multer error)");
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "حجم الملف يتجاوز الحد المسموح (50MB)" });
      }
      return res.status(400).json({ error: "فشل تحميل الملف" });
    }),
    async (req: AuthRequest, res) => {
      const file = (req as any).file as
        | { originalname: string; path: string; filename: string; size: number; mimetype: string }
        | undefined;
      const tempPath = file?.path;
      try {
        const reqUser = req.user;
        if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
        const hearing = await storage.getHearingById(String(req.params.id));
        if (!hearing) return res.status(404).json({ error: "الجلسة غير موجودة" });
        if (!await canActOnHearing(reqUser, hearing, req.actingContext)) {
          return res.status(403).json({ error: "ليس لديك صلاحية لإرفاق ضبط الجلسة" });
        }
        if (!file) {
          console.error("[hearings/minutes-attachment POST] no file in request", {
            hearingId: req.params?.id,
            multipartFields: Object.keys(req.body || {}),
          });
          return res.status(400).json({ error: "الملف مطلوب أو نوعه غير مسموح" });
        }
        try {
          file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
        } catch {
          // Defensive only.
        }

        const objectKey = makeHearingMinutesObjectKey(hearing.id, file.originalname);
        const uploadResult = await attachmentObjectStore.uploadFromFilename(objectKey, file.path);
        if (!uploadResult.ok) {
          console.error("[hearings/minutes-attachment POST] object storage upload failed:", {
            objectKey,
            error: uploadResult.error,
          });
          return res.status(500).json({
            error: `فشل رفع الملف إلى التخزين السحابي: ${uploadResult.error?.message || "خطأ غير معروف"}`,
          });
        }

        const { attachment, replaced } = await storage.createHearingAttachment({
          hearingId: hearing.id,
          fileName: file.originalname,
          filePath: objectKey,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedBy: reqUser.id,
        });

        if (replaced && replaced.filePath && replaced.filePath !== attachment.filePath) {
          if (isAttachmentObjectKey(replaced.filePath)) {
            attachmentObjectStore.delete(replaced.filePath, { ignoreNotFound: true }).catch((e) => {
              console.error("[hearings/minutes-attachment POST] failed to delete replaced object:", {
                key: replaced.filePath,
                error: e,
              });
            });
          }
        }

        // Parent-case timeline — the same choice the cancel and flag endpoints
        // make, with the same relatedEntity pair. Wrapped so a logging failure
        // never fails an upload that already succeeded.
        if (hearing.caseId) {
          try {
            await logCaseActivityActing(req, {
              caseId: hearing.caseId,
              userId: reqUser.id,
              userName: reqUser.name || reqUser.id,
              actionType: replaced ? "hearing_minutes_replaced" : "hearing_minutes_attached",
              title: replaced
                ? `استبدال ملف ضبط الجلسة — ${replaced.fileName} ← ${file.originalname}`
                : `إرفاق ملف ضبط الجلسة — ${file.originalname}`,
              relatedEntityType: "hearing",
              relatedEntityId: hearing.id,
            });
          } catch (e) {
            console.error("[hearings/minutes-attachment POST] logCaseActivity failed", e);
          }
        }

        res.status(201).json({ attachment, replaced });
      } catch (error: any) {
        console.error("[hearings/minutes-attachment POST] error:", error);
        res.status(500).json({ error: error.message || "فشل رفع المرفق" });
      } finally {
        unlinkContractTemp(tempPath, "hearings/minutes-attachment POST");
      }
    },
  );

  app.get("/api/hearings/:id/minutes-attachment", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const hearing = await storage.getHearingById(String(req.params.id));
      if (!hearing) return res.status(404).json({ error: "الجلسة غير موجودة" });
      // 🔴 READ GATE = requireAuth ONLY (owner decision 2026-08-04). This now
      // MATCHES the hearing read exactly: GET /api/hearings is requireAuth +
      // getAllHearings() with no scoping, and GET /api/hearings/:id has no gate at
      // all — so any authenticated user already receives every hearing row.
      // The parent-case canModifyCase resolution added a commit earlier is REMOVED
      // as no longer needed: it was the widest gate available at the time, but it
      // was still narrower than the hearing read it sits behind, and the owner has
      // now settled the rule firm-wide. One fewer query per call, too.
      //
      // ⚠ WRITE ROUTES UNCHANGED — POST and DELETE still canActOnHearing.
      const att = await storage.getHearingAttachment(hearing.id);
      res.json({ attachment: att ? { ...att, missing: !isAttachmentObjectKey(att.filePath) } : null });
    } catch (error: any) {
      console.error("[hearings/minutes-attachment GET] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/hearings/:id/minutes-attachment/download", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const hearing = await storage.getHearingById(String(req.params.id));
      if (!hearing) return res.status(404).json({ error: "الجلسة غير موجودة" });
      // 🔴 READ GATE = requireAuth ONLY (owner decision 2026-08-04), matching the
      // metadata route above and the hearing read itself. Supersedes the
      // parent-case canModifyCase resolution from the previous commit — see that
      // route's note. The orphan-hearing fallback goes with it: with no scoping
      // there is nothing left to scope, so a hearing with no caseId behaves like
      // any other.
      //
      // ⚠ WRITE ROUTES UNCHANGED — POST and DELETE still canActOnHearing.
      const att = await storage.getHearingAttachment(hearing.id);
      if (!att) return res.status(404).json({ error: "المرفق غير موجود" });
      if (!isAttachmentObjectKey(att.filePath)) {
        return res.status(410).json({ error: "الملف مفقود — يرجى إعادة الرفع من جديد" });
      }
      const safeAscii = att.fileName.replace(/[^\x20-\x7E]/g, "_");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      );
      res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
      if (att.fileSize) res.setHeader("Content-Length", String(att.fileSize));
      streamAttachmentToResponse(attachmentObjectStore, att, res, "hearings/minutes-attachment download");
    } catch (error: any) {
      console.error("[hearings/minutes-attachment download] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/hearings/:id/minutes-attachment", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const hearing = await storage.getHearingById(String(req.params.id));
      if (!hearing) return res.status(404).json({ error: "الجلسة غير موجودة" });
      if (!await canActOnHearing(reqUser, hearing, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لحذف ضبط الجلسة" });
      }
      const att = await storage.getHearingAttachment(hearing.id);
      if (!att) return res.status(404).json({ error: "المرفق غير موجود" });
      const deleted = await storage.deleteHearingAttachment(att.id);
      if (!deleted) return res.status(404).json({ error: "المرفق غير موجود" });
      if (deleted.filePath && isAttachmentObjectKey(deleted.filePath)) {
        attachmentObjectStore.delete(deleted.filePath, { ignoreNotFound: true }).catch((e) => {
          console.error("[hearings/minutes-attachment DELETE] failed to delete object:", {
            key: deleted.filePath,
            error: e,
          });
        });
      }
      if (hearing.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: hearing.caseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            actionType: "hearing_minutes_deleted",
            title: `حذف ملف ضبط الجلسة — ${deleted.fileName}`,
            relatedEntityType: "hearing",
            relatedEntityId: hearing.id,
          });
        } catch (e) {
          console.error("[hearings/minutes-attachment DELETE] logCaseActivity failed", e);
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[hearings/minutes-attachment DELETE] error:", error);
      res.status(500).json({ error: error.message || "فشل حذف المرفق" });
    }
  });

  // POST /api/cases/:id/await-completion
  // Body: { reason }. Routes the case INTO "استكمال_البيانات" from any
  // other stage, recording the leaving stage in saved_stage for resume.
  app.post("/api/cases/:id/await-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      const isAssigned =
        lawCase.primaryLawyerId === reqUser.id ||
        lawCase.responsibleLawyerId === reqUser.id ||
        (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(reqUser.id));
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && !!reqUser.departmentId && lawCase.departmentId === reqUser.departmentId) ||
        isAssigned;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة القضية" });

      if (lawCase.pausedAt) {
        return res.status(400).json({ error: "القضية معلّقة — أزل التعليق أولاً" });
      }
      if (lawCase.status === "مغلق" || lawCase.isArchived) {
        return res.status(400).json({ error: "لا يمكن تغيير حالة قضية مغلقة أو مؤرشفة" });
      }
      if (lawCase.awaitingCompletion) {
        return res.status(400).json({ error: "القضية بالفعل بانتظار استكمال المرفقات والبيانات" });
      }
      if (lawCase.currentStage === "استكمال_البيانات") {
        return res.status(400).json({ error: "القضية بالفعل في مرحلة الاستكمال" });
      }

      // 2D'-V2a Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const updated = await storage.awaitCaseCompletion(lawCase.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[cases/await-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/cases/:id/resume-from-completion
  // Body: { notes? }. Restores saved_stage. Validates that saved_stage
  // is still in the case's classification-specific stage list (cases
  // have 5 paths depending on caseType + classification — the path can
  // change if an admin edits caseType/classification/clientRole/memoRequired
  // mid-await; we reject the resume in that case so the user explicitly
  // picks a target via the normal stage-edit UI).
  app.post("/api/cases/:id/resume-from-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const lawCase = await storage.getCaseById(String(req.params.id));
      if (!lawCase) return res.status(404).json({ error: "القضية غير موجودة" });

      const isAssigned =
        lawCase.primaryLawyerId === reqUser.id ||
        lawCase.responsibleLawyerId === reqUser.id ||
        (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(reqUser.id));
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && !!reqUser.departmentId && lawCase.departmentId === reqUser.departmentId) ||
        isAssigned;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة القضية" });

      if (!lawCase.awaitingCompletion) {
        return res.status(400).json({ error: "القضية ليست بانتظار استكمال المرفقات والبيانات" });
      }

      // Resolve the department name from departmentId — caseType is
      // free-text and must not drive workflow routing.
      const dept = lawCase.departmentId
        ? await storage.getDepartmentById(lawCase.departmentId)
        : null;
      const validStages = new Set(getStagesForClassification(
        lawCase.caseClassification,
        dept?.name,
        lawCase.clientRole ?? undefined,
        !!lawCase.memoRequired,
        !!lawCase.isSettlementCase,
      ) as string[]);

      // 2D'-V2a Pattern-A gate: type check only.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, lawCase.id, performer?.name || reqUser.id);
      const result = await storage.resumeCaseFromCompletion(lawCase.id, {
        notes,
        performedBy: reqUser.id,
        performerName,
        isValidStage: (s) => validStages.has(s),
      });
      if (!result.ok) {
        if (result.reason === "INVALID_SAVED_STAGE") {
          return res.status(400).json({
            error: "المرحلة المحفوظة لا تتوافق مع نوع/تصنيف القضية الحالي. اختر المرحلة يدوياً عبر تعديل المرحلة.",
          });
        }
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json(result.lawCase);
    } catch (error: any) {
      console.error("[cases/resume-from-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/memos/:id/await-completion
  // Body: { reason }. Memos don't have a dedicated pending-completion
  // status; we just flag awaiting_completion=true (saved_stage stores
  // the memo status as a snapshot). Memo workflow status is unchanged.
  app.post("/api/memos/:id/await-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      // 4c-5: per-identity act-as (see /pause).
      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support"]);
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة المذكرة" });

      if (memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة معلّقة — أزل التعليق أولاً" });
      }
      if (memo.awaitingCompletion) {
        return res.status(400).json({ error: "المذكرة بالفعل بانتظار استكمال المرفقات والبيانات" });
      }
      const TERMINAL_MEMO_STATUSES = new Set(["معتمدة", "مرفوعة", "ملغاة"]);
      if (TERMINAL_MEMO_STATUSES.has(memo.status)) {
        return res.status(400).json({ error: "لا يمكن تغيير حالة مذكرة منتهية" });
      }

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });

      const updated = await storage.awaitMemoCompletion(memo.id, {
        reason,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/await-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/memos/:id/resume-from-completion
  // Body: { notes? }. Clears awaiting_completion + saved_stage. Memo
  // status is untouched (it was untouched on entry too).
  app.post("/api/memos/:id/resume-from-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      // 4c-5: per-identity act-as (see /pause).
      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support"]);
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة المذكرة" });

      if (!memo.awaitingCompletion) {
        return res.status(400).json({ error: "المذكرة ليست بانتظار استكمال المرفقات والبيانات" });
      }

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const updated = await storage.resumeMemoFromCompletion(memo.id, {
        notes,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/resume-from-completion] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // ==================== Memo review workflow (Phase-9) ====================
  // Mirrors POST /api/consultations/:id/{advance-stage,return-stage,
  // internal-review,committee-decision,take-notes-outcome}. Memos use
  // cases_review_head as the committee chair (memos belong to cases).

  // Body: { targetStage }. Generic forward via validateStageTransition.
  app.post("/api/memos/:id/advance-stage", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = advanceMemoStageSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const targetStage = String(req.body?.targetStage || "");
      if (!targetStage) return res.status(400).json({ error: "targetStage مطلوب" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.awaitingCompletion) {
        return res.status(400).json({ error: "المذكرة بانتظار استكمال المرفقات والبيانات" });
      }
      if (memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة معلّقة" });
      }
      if (!memo.currentStage) {
        return res.status(400).json({ error: "المذكرة لم تدخل في مسار المراجعة بعد" });
      }

      // Phase 5 B/M4 — memos carry no departmentId; resolve the parent case's
      // department and thread it onto entityData so the rollback dept-scope
      // (department_head → own dept only) works, mirroring the case/contract
      // idiom. Harmless for forward transitions (departmentId unused there).
      const memoParentCase = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
      const check = validateStageTransition(
        memo.currentStage,
        targetStage,
        reqUser.role,
        "memo",
        reqUser,
        { ...memo, departmentId: memoParentCase?.departmentId ?? null },
        // 4c-5: memos act-as enabled. entityData carries memo.caseId, so
        // scopeCaseId = the memo's PARENT case id — specific_cases delegations
        // reach a memo via its parent case. Four-eyes stays human (INTERNAL_REVIEW
        // lock + the dedicated /internal-review reviewer guard).
        req.actingContext,
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });
      // Same department routing as the dedicated committee endpoint — this
      // generic path can also reach لجنة_مراجعة → READY/TAKING_NOTES via the table.
      if (memo.currentStage === MemoStage.COMMITTEE &&
          (reqUser.role === "cases_review_head" || reqUser.role === "labor_review_head")) {
        const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
        const committeeHead = (!!laborDeptId && memoParentCase?.departmentId === laborDeptId)
          ? "labor_review_head" : "cases_review_head";
        if (reqUser.role !== committeeHead) {
          return res.status(403).json({ error: "ليس لديك صلاحية لقرار لجنة المراجعة على هذه المذكرة" });
        }
      }

      // Phase-9.1 — DRAFTING → INTERNAL_REVIEW requires a designated
      // peer reviewer. Same rules as the cases-side (server/routes.ts
      // ~1925): take from body, fall back to existing on the memo for
      // loop-back rounds, validate active + not admin_support + same
      // dept as the parent case.
      const updateFields: any = { currentStage: targetStage };
      const activityMetadata: Record<string, any> = { fromStage: memo.currentStage, toStage: targetStage };
      if (
        memo.currentStage === MemoStage.DRAFTING
        && targetStage === MemoStage.INTERNAL_REVIEW
      ) {
        const reviewerId: string | undefined =
          (typeof req.body?.internalReviewerId === "string" && req.body.internalReviewerId)
          || (memo.internalReviewerId ?? undefined);
        if (!reviewerId) {
          return res.status(400).json({ error: "يجب اختيار المراجع الداخلي قبل الانتقال للمرحلة" });
        }
        const reviewer = await storage.getUser(reviewerId);
        if (!reviewer || !reviewer.isActive) {
          return res.status(400).json({ error: "المراجع الداخلي المختار غير صالح" });
        }
        if (reviewer.role === "admin_support" || reviewer.role === "branch_manager") {
          return res.status(400).json({ error: "لا يمكن اختيار هذا الدور كمراجع داخلي" });
        }
        const parentCase = await storage.getCaseById(memo.caseId);
        if (parentCase && parentCase.departmentId && reviewer.departmentId !== parentCase.departmentId) {
          return res.status(400).json({ error: "المراجع الداخلي يجب أن يكون من نفس قسم القضية" });
        }
        if (reviewer.id === reqUser.id) {
          return res.status(400).json({ error: "لا يمكن اختيار نفسك كمراجع داخلي" });
        }
        updateFields.internalReviewerId = reviewerId;
        activityMetadata.reviewerId = reviewerId;
        activityMetadata.reviewerName = reviewer.name;
      }

      const fromLabel = MemoStageLabels[memo.currentStage] || memo.currentStage;
      const toLabel = (MemoStageLabels as Record<string, string>)[targetStage] || targetStage;
      const description = activityMetadata.reviewerName
        ? `انتقال من ${fromLabel} إلى ${toLabel} — المراجع: ${activityMetadata.reviewerName}`
        : `انتقال من ${fromLabel} إلى ${toLabel}`;
      const updated = await storage.updateMemoAndLog(
        memo.id,
        updateFields,
        {
          activityType: MemoActivityType.STAGE_ADVANCED,
          description,
          metadata: activityMetadata,
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل تحديث المذكرة" });

      // WE APPEALED — the stage-bar route to filing. Same hook as the status
      // route (PATCH /api/memos/:id), since both are live in the UI.
      if (targetStage === MemoStage.FILED) {
        await promoteCaseOnObjectionFiled(req, memo, reqUser);
      }

      res.json(updated);
    } catch (error: any) {
      console.error("[memos/advance-stage] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // Body: { targetStage }. Generic backward — validateStageTransition's
  // memo rollback block enforces: dept_head/branch_manager → any prior
  // stage, assigned_lawyer → one step back.
  app.post("/api/memos/:id/return-stage", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowTargetStageSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const targetStage = String(req.body?.targetStage || "");
      if (!targetStage) return res.status(400).json({ error: "targetStage مطلوب" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.awaitingCompletion) {
        return res.status(400).json({ error: "المذكرة بانتظار استكمال المرفقات والبيانات" });
      }
      if (memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة معلّقة" });
      }
      if (!memo.currentStage) {
        return res.status(400).json({ error: "المذكرة لم تدخل في مسار المراجعة بعد" });
      }

      // Phase 5 B/M4 — memos carry no departmentId; resolve the parent case's
      // department and thread it onto entityData so the rollback dept-scope
      // (department_head → own dept only) works, mirroring the case/contract
      // idiom. Harmless for forward transitions (departmentId unused there).
      const memoParentCase = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
      const check = validateStageTransition(
        memo.currentStage,
        targetStage,
        reqUser.role,
        "memo",
        reqUser,
        { ...memo, departmentId: memoParentCase?.departmentId ?? null },
        // 4c-5: memos act-as enabled. entityData carries memo.caseId, so
        // scopeCaseId = the memo's PARENT case id — specific_cases delegations
        // reach a memo via its parent case. Four-eyes stays human (INTERNAL_REVIEW
        // lock + the dedicated /internal-review reviewer guard).
        req.actingContext,
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });

      const fromLabel = MemoStageLabels[memo.currentStage] || memo.currentStage;
      const toLabel = (MemoStageLabels as Record<string, string>)[targetStage] || targetStage;
      const updated = await storage.updateMemoAndLog(
        memo.id,
        { currentStage: targetStage as MemoStageValue },
        {
          activityType: MemoActivityType.STAGE_RETURNED,
          description: `إرجاع من ${fromLabel} إلى ${toLabel}`,
          metadata: { fromStage: memo.currentStage, toStage: targetStage },
          performedBy: reqUser.id,
        },
      );
      if (!updated) return res.status(500).json({ error: "فشل تحديث المذكرة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/return-stage] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // Body: { decision, notes }. Inserts a memo_reviews row, then routes
  // the stage:
  //   PASSED      -> COMMITTEE
  //   NEEDS_NOTES -> DRAFTING
  // Allowed roles: assigned_lawyer (synthetic) + employee, department_head,
  // cases_review_head, branch_manager.
  app.post("/api/memos/:id/internal-review", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowDecisionSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const notes = String(req.body?.notes || "");
      const valid = (Object.values(InternalReviewDecision) as string[]).includes(decision);
      if (!valid) return res.status(400).json({ error: "قرار المراجعة غير صحيح" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.awaitingCompletion || memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة في حالة لا تسمح بالمراجعة" });
      }
      if (memo.currentStage !== MemoStage.INTERNAL_REVIEW) {
        return res.status(400).json({ error: "المذكرة ليست في مرحلة المراجعة الداخلية" });
      }

      // Phase-9.1 — actor lock. Only the designated peer reviewer or
      // the branch_manager can record the decision. This is stricter
      // than the consultations-side internal-review (which is permissive
      // pending the active_reviewer_id TODO).
      const isAssignedReviewer =
        !!memo.internalReviewerId && memo.internalReviewerId === reqUser.id;
      const isBranchManager = reqUser.role === "branch_manager";
      // WIDENED MODEL — own-department department_head may act too (see the
      // consultations/contracts twins). Memos carry no departmentId, so the scope is
      // resolved through the PARENT CASE, the memo module's standard rule.
      // FOUR-EYES (carve-out 2): a head who is the memo's own assignee is excluded,
      // so the reviewer can never be the author. HUMAN role only.
      const memoReviewParentCase = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
      const isOwnDeptHeadReviewer =
        reqUser.role === "department_head"
        && !!reqUser.departmentId
        && !!memoReviewParentCase?.departmentId
        && memoReviewParentCase.departmentId === reqUser.departmentId
        && !isAssignedLawyer(reqUser, memo);
      if (!isAssignedReviewer && !isBranchManager && !isOwnDeptHeadReviewer) {
        return res.status(403).json({
          error: "فقط المراجع الداخلي المعين أو رئيس القسم أو مدير الفرع يمكنهم تسجيل قرار المراجعة الداخلية",
        });
      }

      const nextStage = decision === InternalReviewDecision.PASSED
        ? MemoStage.COMMITTEE
        : MemoStage.DRAFTING;

      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `مراجعة داخلية: ${decision} — ${truncatedNotes}`
        : `مراجعة داخلية: ${decision}`;

      const result = await storage.recordMemoInternalReview({
        memoId: memo.id,
        reviewerId: reqUser.id,
        decision,
        notes,
        nextStage,
        activity: {
          description,
          metadata: {
            decision,
            notes,
            reviewerId: reqUser.id,
            reviewerName: reqUser.name,
          },
          performedBy: reqUser.id,
        },
      });
      res.json({ review: result.review, memo: result.memo });
    } catch (error: any) {
      console.error("[memos/internal-review] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // Body: { decision, notes }. Inserts a memo_committee_decisions row,
  // then routes the stage:
  //   APPROVED    -> READY
  //   NEEDS_NOTES -> TAKING_NOTES
  // Allowed roles: cases_review_head, branch_manager (committee chair
  // for memos is the cases-side review head).
  app.post("/api/memos/:id/committee-decision", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 4c-7: committee decisions INHERIT. Memos scope by their PARENT caseId
      // (specific_cases delegations reach a memo via its parent case), so the
      // authoritative grant runs after the memo is loaded. This fast-deny keeps
      // the pre-fetch 403 byte-identical for non-delegated users; a user with an
      // active delegation defers to the scoped check below.
      const ctx = req.actingContext;
      const ownRoleDecides = ["cases_review_head", "labor_review_head", "branch_manager"].includes(reqUser.role);
      if (!ownRoleDecides && (!ctx || ctx.delegators.length === 0)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
      }

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowDecisionSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const notes = String(req.body?.notes || "");
      const valid = (Object.values(CommitteeDecision) as string[]).includes(decision);
      if (!valid) return res.status(400).json({ error: "قرار اللجنة غير صحيح" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.awaitingCompletion || memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة في حالة لا تسمح بالقرار" });
      }
      if (memo.currentStage !== MemoStage.COMMITTEE) {
        return res.status(400).json({ error: "المذكرة ليست في مرحلة لجنة المراجعة" });
      }

      // 4c-7: scoped committee grant — a delegate inheriting cases_review_head/
      // branch_manager for this memo's PARENT case may decide. Non-delegated
      // users already resolved at the fast-deny above (this is a no-op for them).
      // Labor memos (parent case in عمالي) → labor_review_head EXCLUSIVELY; all
      // others → cases_review_head. branch_manager always. Memos have no
      // departmentId, so resolve it through the PARENT case.
      {
        const laborDeptId = (await storage.getAllDepartments()).find((d) => d.name === "عمالي")?.id;
        const parentCaseForDept = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
        const committeeHead = (!!laborDeptId && parentCaseForDept?.departmentId === laborDeptId)
          ? "labor_review_head" : "cases_review_head";
        const headDecides = [committeeHead, "branch_manager"].includes(reqUser.role);
        if (!headDecides && !(ctx && hasEffectiveRole(ctx, memo.caseId, committeeHead, "branch_manager"))) {
          return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
        }
      }
      // FOUR-EYES (HUMAN-only; delegation-derived authority only): a delegate
      // standing in for the review head may NOT decide a committee on a memo
      // they (REAL id) authored / are the assigned lawyer of. Real review head
      // unaffected (parity). Real human id.
      if (!ownRoleDecides && isAssignedLawyer(reqUser, memo)) {
        return res.status(403).json({ error: "لا يمكنك اعتماد قرار اللجنة على مذكرة أنت محرّرها" });
      }

      const nextStage = decision === CommitteeDecision.APPROVED
        ? MemoStage.READY
        : MemoStage.TAKING_NOTES;

      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `قرار اللجنة: ${decision} — ${truncatedNotes}`
        : `قرار اللجنة: ${decision}`;

      const result = await storage.recordMemoCommitteeDecision({
        memoId: memo.id,
        decision,
        notes,
        decidedBy: reqUser.id,
        nextStage,
        activity: {
          description,
          metadata: { decision, notes, decidedBy: reqUser.id },
          performedBy: reqUser.id,
        },
      });
      res.json({ decision: result.decision, memo: result.memo });
    } catch (error: any) {
      console.error("[memos/committee-decision] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // Body: { outcome, notes }. Inserts a memo_note_outcomes row. ALL
  // outcomes (DONE | NOT_DONE | PARTIAL) advance to READY — the outcome
  // is recorded for audit only, not used for routing. Allowed roles:
  // assigned_lawyer (synthetic), department_head, branch_manager.
  app.post("/api/memos/:id/take-notes-outcome", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowOutcomeSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const outcome = String(req.body?.outcome || "");
      const notes = String(req.body?.notes || "");
      const valid = (Object.values(NoteOutcome) as string[]).includes(outcome);
      if (!valid) return res.status(400).json({ error: "نتيجة غير صحيحة" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.awaitingCompletion || memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة في حالة لا تسمح بتسجيل النتيجة" });
      }
      if (memo.currentStage !== MemoStage.TAKING_NOTES) {
        return res.status(400).json({ error: "المذكرة ليست في مرحلة الأخذ بالملاحظات" });
      }

      // 4c-7: take-notes-outcome INHERITS (lawyer's own follow-up work applying
      // committee notes, NOT a review → no author/self exclusion). Scope = the
      // memo's PARENT caseId. No delegation → own identity+role only (parity).
      const ctx = req.actingContext;
      const isLawyer = ctx
        ? Array.from(effectiveIdsFor(ctx, memo.caseId)).some((id) => isAssignedLawyer({ id }, memo))
        : (!!memo.assignedTo && memo.assignedTo === reqUser.id);
      const isHead = ctx
        ? hasEffectiveRole(ctx, memo.caseId, "department_head", "branch_manager")
        : ["department_head", "branch_manager"].includes(reqUser.role);
      if (!isLawyer && !isHead) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتسجيل النتيجة" });
      }

      const truncatedNotes = notes ? notes.slice(0, 120) : "";
      const description = truncatedNotes
        ? `نتيجة الأخذ بالملاحظات: ${outcome} — ${truncatedNotes}`
        : `نتيجة الأخذ بالملاحظات: ${outcome}`;

      const result = await storage.recordMemoNoteOutcome({
        memoId: memo.id,
        outcome,
        notes,
        recordedBy: reqUser.id,
        nextStage: MemoStage.READY,
        activity: {
          description,
          metadata: { outcome, notes },
          performedBy: reqUser.id,
        },
      });
      res.json({ outcome: result.outcome, memo: result.memo });
    } catch (error: any) {
      console.error("[memos/take-notes-outcome] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/memos/:id/return-to-committee
  // Body: { notes }. Required notes — sends memo from الأخذ_بالملاحظات
  // back to لجنة_مراجعة. Allowed: assigned_lawyer + admin_support +
  // department_head (own dept via parent case) + branch_manager.
  app.post("/api/memos/:id/return-to-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const notes = String(req.body?.notes ?? "").trim();
      if (!notes) return res.status(400).json({ error: "الملاحظات مطلوبة" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.awaitingCompletion || memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة في حالة لا تسمح بإعادتها للجنة" });
      }
      if (memo.currentStage !== MemoStage.TAKING_NOTES) {
        return res.status(400).json({ error: "المذكرة ليست في مرحلة الأخذ بالملاحظات" });
      }

      // 4c-5: per-identity act-as (see /pause).
      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support"]);
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإعادة المذكرة للجنة" });
      }

      const updated = await storage.returnMemoToCommittee(memo.id, {
        notes,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل إعادة المذكرة للجنة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/return-to-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/memos/:id/skip-committee
  // Body: { reason }. REASONED OVERRIDE — "تجاوز لجنة المراجعة". Moves the memo
  // from لجنة_مراجعة straight to جاهزة_للرفع with NO committee decision,
  // recording who did it and why in memo_activity_log (reason is MANDATORY).
  // Entity 2 of 4 — mirrors POST /api/cases/:id/skip-committee verbatim.
  //
  // Deliberately bypasses validateStageTransition — the same precedent the
  // committee-decision path above already sets (compute the target stage and
  // call storage directly). No transition-table entry is added, so this override
  // cannot be reached through POST /api/memos/:id/advance-stage.
  //
  // ORIGIN is the committee stage ONLY (never مراجعة_داخلية), so the four-eyes
  // internal-review lock (the designated-peer-reviewer guard on
  // /internal-review) is untouched.
  //
  // TARGET is unconditionally MemoStage.READY: memos — unlike cases — have ONE
  // stage array (MemoStagesOrder/MemoStagesAll, schema.ts). memoType does NOT
  // branch the path, and there is no memo analogue of caseClassification, so the
  // in-court hazard that forced the cases-side قيد_الدراسة guard (commit 193649a)
  // has no counterpart here. READY is the memo's only post-committee stage
  // (committee APPROVED → READY above), and the currentStage === COMMITTEE guard
  // below also excludes legacy null-stage memos. No extra guard is needed.
  //
  // AUTHORIZED ROLES (owner decision, 2026-07): branch_manager + department_head
  // (of the memo's PARENT CASE's department — memos carry no departmentId) + the
  // assigned lawyer (memo assignee OR a lawyer on the parent case). This is
  // INTENTIONALLY BROADER than the committee-DECISION role set for memos
  // (cases_review_head + branch_manager, above). Skipping the committee is an
  // owner-approved override, not a committee decision, so it answers to a
  // different, wider authority. Do NOT "harmonise" this set with the committee
  // chairs — the divergence is the point.
  //
  // FOUR-EYES DOES NOT APPLY HERE, by design. The committee-decision endpoint's
  // four-eyes check stops a DELEGATE approving a memo they authored; here the
  // assigned lawyer — i.e. the author — is an EXPLICITLY authorized actor, so
  // such a check would contradict the approved permission model. The mandatory
  // reason + the audit row are the control instead.
  app.post("/api/memos/:id/skip-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب تجاوز اللجنة مطلوب" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.awaitingCompletion || memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة في حالة لا تسمح بتجاوز اللجنة" });
      }
      if (memo.currentStage !== MemoStage.COMMITTEE) {
        return res.status(400).json({ error: "المذكرة ليست في مرحلة لجنة المراجعة" });
      }
      // A cancelled memo can still sit at the committee stage: /cancel sets
      // status only and leaves current_stage alone. Mirrors the /cancel guard.
      if (memo.status === "ملغاة") {
        return res.status(400).json({ error: "لا يمكن تجاوز اللجنة في مذكرة ملغاة" });
      }

      // Delegation-aware: evaluate the rule against every acting identity (self +
      // any delegator this user currently stands in for, scoped to the memo's
      // PARENT case — specific_cases delegations reach a memo via its case).
      // With no delegation this resolves to exactly the actor → byte-identical to
      // a plain self-check.
      const identities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, memo.caseId ?? null).map((i) => ({
            id: i.userId, role: i.role, departmentId: i.departmentId,
          }))
        : [{ id: reqUser.id, role: reqUser.role, departmentId: reqUser.departmentId }];
      // department_head is scoped through the parent case (canActOnMemo idiom);
      // the parent case also carries the lawyer fields isAssignedLawyer reads.
      const parentCase = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
      const allowed = identities.some((u) =>
        u.role === "branch_manager"
        || (u.role === "department_head" && !!u.departmentId && !!parentCase && parentCase.departmentId === u.departmentId)
        || isAssignedLawyer({ id: u.id }, memo)
        || (!!parentCase && isAssignedLawyer({ id: u.id }, parentCase)));
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتجاوز لجنة المراجعة" });
      }

      const performer = await storage.getUser(reqUser.id);
      const performerName = actorDisplayName(req.actingContext, memo.caseId ?? null, performer?.name || reqUser.id);
      const updated = await storage.skipMemoCommittee(memo.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
      });
      if (!updated) return res.status(500).json({ error: "فشل تجاوز لجنة المراجعة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/skip-committee] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/memos/:id/cancel
  // Body: { reason }. Cancels the memo (sets status='ملغاة') with a
  // required reason. Mirrors the pause/await dialog pattern: reason is
  // captured on the row AND in memo_activity_log so the timeline
  // surfaces who/when. Used by the FE "لا يحتاج مذكرة" flow on the
  // memos page; the legacy PATCH-based cancel still works for direct
  // edits but doesn't populate cancellationReason.
  // Allowed roles: assigned_lawyer + admin_support + department_head
  // (own dept via parent case) + branch_manager + cases_review_head.
  app.post("/api/memos/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      if (memo.status === "ملغاة") {
        return res.status(400).json({ error: "المذكرة ملغاة بالفعل" });
      }
      if (memo.status === "معتمدة" || memo.status === "مرفوعة") {
        return res.status(400).json({ error: "لا يمكن إلغاء مذكرة معتمدة أو مرفوعة" });
      }

      // 4c-5: per-identity act-as (see /pause). cancel additionally allows
      // cases_review_head (the memo committee chair).
      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support", "cases_review_head"]);
      if (!allowed) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء المذكرة" });
      }

      const updated = await storage.cancelMemo(memo.id, {
        reason,
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل إلغاء المذكرة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/cancel] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // POST /api/memos/:id/cancel-no-response
  // Body: { notes? }. The memos twin of the cases/consultations/contracts
  // "close for no response".
  //
  // ⚠ THREE MEMO-SPECIFIC DIVERGENCES, all forced by what memos actually are:
  //   1. NO STAGE GATE. Memos have no data-completion stage — the schema note on
  //      memos.dataCompletionLastAckAt says so explicitly ("memos have no
  //      data-completion STAGE; the button is the trigger"). So
  //      awaiting_completion = true IS the state, and it is the gate. This is
  //      the one entity where the latch is the correct thing to key on.
  //   2. IT CANCELS, IT DOES NOT CLOSE. Memos have no closure model at all — no
  //      closure_reason / closure_reason_other columns, no "closed" status.
  //      Their terminal state is ملغاة + cancellation_reason, so the missing-data
  //      text goes there instead. Same concept, the only shape memos have.
  //   3. ROLE GATE is canActOnMemo with the CANCEL role set (which adds
  //      cases_review_head, the memo committee chair) — this entity's own
  //      terminal-action tier, delegation-aware like every other memo endpoint.
  app.post("/api/memos/:id/cancel-no-response", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const bodyCheck = workflowNotesSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) return res.status(404).json({ error: "المذكرة غير موجودة" });

      const allowed = await canActOnMemo(reqUser, memo, req.actingContext, ["branch_manager", "admin_support", "cases_review_head"]);
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء المذكرة" });

      if (!memo.awaitingCompletion) {
        return res.status(400).json({ error: "هذه المذكرة ليست بانتظار استكمال المرفقات والبيانات" });
      }
      // Same terminal-status refusals the ordinary /cancel enforces.
      if (memo.status === "ملغاة") {
        return res.status(400).json({ error: "المذكرة ملغاة بالفعل" });
      }
      if (memo.status === "معتمدة" || memo.status === "مرفوعة") {
        return res.status(400).json({ error: "لا يمكن إلغاء مذكرة معتمدة أو مرفوعة" });
      }
      if (memo.pausedAt) {
        return res.status(400).json({ error: "المذكرة معلّقة — أزل التعليق أولاً" });
      }

      let missingData = "";
      try {
        const activities = await storage.getMemoActivities(memo.id);
        // Already ordered performedAt DESC — the first match IS the latest.
        const latestAwait = activities.find((a) => a.activityType === MemoActivityType.AWAIT_COMPLETION);
        missingData = String(latestAwait?.metadata?.reason ?? "").trim();
      } catch (e) {
        console.error("[memos/cancel-no-response] activity lookup failed:", e);
      }

      const updated = await storage.cancelMemoForNoResponse(memo.id, {
        missingData,
        notes: String(req.body?.notes ?? "").trim(),
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل إلغاء المذكرة" });
      res.json(updated);
    } catch (error: any) {
      console.error("[memos/cancel-no-response] error:", error);
      res.status(500).json({ error: error.message || "فشل إلغاء المذكرة" });
    }
  });

  // ==================== Hearings ====================

  app.get("/api/hearings", requireAuth, async (req, res) => {
    try {
      const hearings = await storage.getAllHearings();
      // Same enrichment shape as GET /api/cases: ONE extra query, a Set, one
      // in-memory stamp. DERIVED, never stored — no has_minutes column, no
      // clearing code. This list is loaded app-wide by hearings-context and is
      // already what the cases page's "رد خصم" badge reads, so the case-level
      // "missing minutes" indicator rides along on THIS query and costs the
      // cases page no request of its own.
      const minutesAttached = await storage.getHearingIdsWithMinutesAttachment();
      res.json(hearings.map((h) => ({ ...h, hasMinutesAttachment: minutesAttached.has(h.id) })));
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الجلسات" });
    }
  });

  // 🔔 GET /api/hearings/ring-state — THE DERIVATION SOURCE for the pre-hearing
  // ring. Polled every 30s by every logged-in user.
  //
  // 🔴 REGISTERED IMMEDIATELY BEFORE /api/hearings/:id, AND THAT POSITION IS
  // LOAD-BEARING — DO NOT MOVE IT BELOW. Express matches in registration order,
  // so `/api/hearings/:id` is a catch-all for any single segment under
  // /api/hearings: registered first, it captures "ring-state" as an :id, looks
  // up a hearing by that literal string, finds none and returns 404 "الجلسة غير
  // موجودة". That is exactly how this shipped in 62acf7c, and the failure is
  // SILENT — the client's polled query just 404s every 30s, `data` stays [],
  // and the ring never fires with nothing in the UI to indicate why.
  // Any future /api/hearings/<literal> route must go above :id too.
  //
  // WHY ITS OWN ENDPOINT rather than riding on /api/my-tasks: my-tasks is
  // already the app's busiest query (computeTasksForIdentity runs ~20 blocks and
  // dozens of reads), and its response is an array of MyTaskItem — a ring is not
  // a task, so it would have needed either a bogus MyTaskKind or a change to the
  // response envelope that ripples through the whole feed UI. Tying a safety
  // alert's latency to that computation is also backwards. This endpoint is one
  // narrow indexed read returning at most a handful of rows.
  //
  // 🔴 IT RETURNS RESOLVED INSTANTS, NOT A BOOLEAN. The client decides whether
  // to ring by comparing them to its own clock, which is what lets it start and
  // stop between polls, and what makes the ring derivable from data alone with
  // no memory of any pushed event.
  //
  // ALL FOUR TIERS. The candidate query is no longer narrowed to the attending
  // lawyer — every logged-in user asks the same question and
  // resolveHearingRingTier decides which tier (if any) they occupy, and
  // therefore which lead applies to them.
  app.get("/api/hearings/ring-state", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const rows = await storage.getRingCandidateHearingsForDate(firmToday());
      // Acknowledged hearings drop out for THIS USER ONLY — one narrow keyed
      // read, and the sole consumer of the acknowledgement table.
      const acknowledged = rows.length > 0
        ? await storage.getAcknowledgedHearingIds(user.id, rows.map((r) => r.id))
        : new Set<string>();
      const items: HearingRingItem[] = [];
      for (const r of rows) {
        if (acknowledged.has(r.id)) continue;
        const tier = resolveHearingRingTier(user, {
          attendingLawyerId: r.attendingLawyerId,
          caseDepartmentId: r.caseDepartmentId,
        });
        if (!tier) continue;
        // 🔴 firmDateTimeToInstant DIRECTLY, never parseHearingDateTime — that
        // wrapper substitutes 09:00 for a malformed hearing_time and would open
        // a ring window at a moment the session never had. Unparseable → skip;
        // a ring is an interruption and must never fire on a guess.
        const hearingAt = firmDateTimeToInstant(r.hearingDate, r.hearingTime);
        if (!hearingAt) continue;
        const leadMs = HearingRingTierLeadMinutes[tier] * 60 * 1000;
        items.push({
          hearingId: r.id,
          caseId: r.caseId ?? null,
          caseNumber: r.caseNumber || "",
          hearingTime: r.hearingTime || "",
          courtName: r.courtName || "",
          tier,
          ringFromIso: new Date(hearingAt.getTime() - leadMs).toISOString(),
          hearingAtIso: hearingAt.toISOString(),
          attendingLawyerId: r.attendingLawyerId ?? null,
          caseDepartmentId: r.caseDepartmentId ?? null,
        });
      }
      res.json(items);
    } catch (error) {
      console.error("[GET /api/hearings/ring-state] error:", error);
      res.status(500).json({ error: "حدث خطأ في جلب حالة التنبيه" });
    }
  });

  // 🔔 POST /api/hearings/:id/acknowledge — "تم الاطلاع".
  //
  // Silences the ring FOR THE CALLER ONLY. It does NOT end the chain: later
  // tiers still fire for everyone else, and the hearing is still unprepared.
  //
  // 🔴 DELIBERATELY UNGATED BEYOND requireAuth. Anyone the ring reaches may
  // dismiss their own noise — that is the entire point of this action, and it is
  // why a department member or an admin_support user (neither of whom may press
  // تحضير) is not left with an undismissable modal. Acknowledging a hearing you
  // were never ringing for writes a harmless row nobody reads.
  //
  // ⚠ THIS IS NOT A CHECK-IN. It never touches hearings.checked_in_at, so the
  // hearing still shows as unprepared, still auto-flags at its moment, and is
  // never counted as a late check-in.
  //
  // NOTE the registration position — ABOVE /api/hearings/:id. Express matches in
  // order and :id is a catch-all for one segment, so a literal route registered
  // below it is captured as an id and 404s silently. That cost a full debugging
  // round on ring-state; every /api/hearings/<literal> route goes here.
  app.post("/api/hearings/:id/acknowledge", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      // Idempotent in the database via the unique (hearing_id, user_id) index —
      // a double press or two racing tabs insert once.
      await storage.acknowledgeHearingRing(hearingId, req.user!.id);
      // Silence this user's OTHER TABS immediately. The 30s ring-state poll is
      // the guarantee; this is the accelerator, and it is addressed to the
      // acknowledging user alone — nobody else's ring is affected.
      sendToUser(req.user!.id, { type: "hearing:ring-ack", payload: { hearingId } });
      res.json({ acknowledged: true });
    } catch (error) {
      console.error("[POST /api/hearings/:id/acknowledge] error:", error);
      res.status(500).json({ error: "حدث خطأ في تسجيل الاطلاع" });
    }
  });

  app.get("/api/hearings/:id", requireAuth, async (req, res) => {
    try {
      const hearing = await storage.getHearingById(String(req.params.id));
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      res.json(hearing);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الجلسة" });
    }
  });

  app.post("/api/hearings", requireAuth, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertHearingSchema.parse(req.body);
      if (validatedData.caseId && validatedData.caseId !== "none") {
        const relatedCase = await storage.getCaseById(validatedData.caseId);
        if (relatedCase) {
          // Phase 5 A2/M3 — creating a hearing auto-advances the parent case's
          // stage, so it must be gated to someone who can modify that case
          // (was requireAuth-only: any user could drive another dept's case
          // forward). Hearings are always added from a case the user has open,
          // so legitimate creation passes.
          if (!canModifyCase(req.user!, relatedCase, req.actingContext)) {
            return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
          }
          if (relatedCase.currentStage === "مقفلة" || relatedCase.isArchived) {
            return res.status(400).json({ error: "لا يمكن إضافة جلسات لقضية مغلقة أو مؤرشفة" });
          }
          if (!validatedData.attendingLawyerId) {
            // "المترافع" wins when set — the case's designated court-appearance
            // lawyer, for when the responsible lawyer cannot plead. NULL (the
            // normal case) falls through to the original chain unchanged, so
            // every existing case behaves exactly as before.
            //
            // This one line is the whole permission story too: canActOnHearing
            // is keyed on attendingLawyerId, so making the litigator the
            // attending lawyer AT CREATION grants them the full hearing action
            // set (record result, write report, close) with NO gate change.
            validatedData.attendingLawyerId =
              relatedCase.litigatorId || relatedCase.primaryLawyerId || relatedCase.responsibleLawyerId || null;
          }
        }
      }
      const newHearing = await storage.createHearing(validatedData);
      const user = req.user!;
      const createdMemos: any[] = [];

      // Auto-unpause: adding any new session to a case that was paused
      // for a missing settlement link clears the pause (and resets state
      // so the scheduler won't auto-close it). Exact string equality —
      // we control the pause text. Never block hearing creation on this.
      if (validatedData.caseId && validatedData.caseId !== "none") {
        try {
          const linkedCase = await storage.getCaseById(validatedData.caseId);
          if (
            linkedCase &&
            linkedCase.pausedAt &&
            linkedCase.pauseReason === SETTLEMENT_LINK_MISSING_PAUSE_REASON
          ) {
            await storage.unpauseCase(validatedData.caseId, {
              performedBy: "system",
              performerName: "النظام",
              notes: "إلغاء تعليق تلقائي — تمت إضافة جلسة جديدة",
            });
          }
        } catch (e) {
          console.error("[POST hearings] auto-unpause (settlement link) failed", e);
        }
      }

      // Auto-stage transition based on hearing type
      if (validatedData.caseId && validatedData.caseId !== "none") {
        try {
          const caseForStage = await storage.getCaseById(validatedData.caseId);
          if (caseForStage && !caseForStage.isArchived && caseForStage.currentStage !== "مقفلة") {
            const hearingType = validatedData.hearingType || "محكمة";
            const currentStage = caseForStage.currentStage as string;

            if (hearingType === "تراضي" || hearingType === "تسوية_ودية") {
              const conciliationFromStages = ["قيد_التدقيق_في_ناجز", "قيد_التدقيق_في_تراضي", "أغلق_طلب_الصلح"];
              if (conciliationFromStages.includes(currentStage)) {
                const stageHistory = Array.isArray(caseForStage.stageHistory) ? caseForStage.stageHistory : [];
                // مداولة_الصلح is still pre-trial, so classification stays قيد_الدراسة.
                await storage.updateCase(caseForStage.id, {
                  currentStage: "مداولة_الصلح",
                  stageHistory: [
                    ...stageHistory,
                    { stage: "مداولة_الصلح", timestamp: new Date().toISOString(), userId: user?.id || "system", userName: user?.name || "النظام", notes: "انتقال تلقائي عند إنشاء جلسة صلح" },
                  ],
                });
              }
            } else if (hearingType === "محكمة") {
              // A COURT hearing means the case HAS entered court, so it is
              // promoted at that moment rather than left to be discovered later
              // (owner decision 2026-07-26). WIDENED from four source stages —
              // أغلق_طلب_الصلح + the three قيد_التدقيق_* — to every pre-court
              // stage. The narrow list is what produced the wrong-path bug: a
              // case that failed settlement dropped to أغلق_طلب_الصلح as
              // قيد_الدراسة, still carried an OLD settlement-era hearing (so this
              // block never ran for it), and then reached a JUDGMENT while still
              // classified قيد_الدراسة — after which getStagesForClassification
              // resolved the UNDER-STUDY array and the progress bar rendered the
              // labor/general litigation path instead of the in-court one.
              //
              // NOT promoted from stages already AT or PAST منظورة. The rule is
              // "a court hearing means the case is in court" — for those stages
              // that is ALREADY true, and writing منظورة would REGRESS them:
              // adding a follow-up hearing to a case at محكوم_حكم_نهائي would
              // silently erase the judgment. For that group we still repair a
              // STALE CLASSIFICATION (exactly the cohort the bug above created)
              // without touching the stage or the history.
              // CARVE-OUT (appeal path): a court hearing scheduled on a case at
              // محكوم_حكم_ابتدائي means THE OPPONENT APPEALED — a primary judgment
              // was issued and the court is sitting again. Promote to
              // منظورة_استئناف (NOT منظورة, which would read as a fresh first-
              // instance trial). This is one of the two opponent-appeal triggers;
              // the other is the explicit "الخصم استأنف" button.
              //
              // محكوم_حكم_نهائي and everything after stay PROTECTED below: a final
              // judgment is not appealable in-app, and writing any earlier stage
              // over it would erase the judgment.
              //
              // THE SET MOVED to shared/schema.ts as StagesAtOrPastCourt so the
              // settlement guard on POST /api/hearings/:id/result and the client
              // result dialog share this one rule instead of copying it. It now
              // CONTAINS محكوم_حكم_ابتدائي, which the local copy omitted — so the
              // opponent-appeal carve-out described just above, which used to be
              // expressed implicitly by leaving that stage out of the set, is
              // written explicitly as `isOpponentAppeal ||` on the branch below.
              // Behaviour is identical: محكوم_حكم_ابتدائي reaches the promotion
              // through the new disjunct, every other stage answers exactly as
              // the local set did.
              // ⚠ NO صك GATE ON THIS PROMOTION, DELIBERATELY (2026-08-03). The
              // court has LISTED AN APPEAL SESSION — an external fact that has
              // already happened. Refusing to promote would leave the case
              // recorded as still at first instance while a hearing sits on it,
              // and the refusal would have to either fail the hearing creation (so
              // the session cannot be diarised at all) or be swallowed here with
              // no actor and no error surface. Both are worse than a case that is
              // truthfully on appeal owing a document. The close gate still holds.
              const isOpponentAppeal = currentStage === "محكوم_حكم_ابتدائي";
              const courtTargetStage = isOpponentAppeal ? "منظورة_استئناف" : "منظورة";
              const promoteClassification = caseForStage.caseClassification === "قيد_الدراسة";
              const classificationFields = promoteClassification
                ? {
                    caseClassification: "منظورة_بالمحكمة",
                    // For قيد_الدراسة the firm is always the plaintiff — persist it
                    // so the post-promotion UI keeps the role. Same default as the
                    // PATCH promotion.
                    ...(!caseForStage.clientRole ? { clientRole: "مدعي" } : {}),
                  }
                : {};
              if (isOpponentAppeal || !StagesAtOrPastCourt.has(currentStage as CaseStageValue)) {
                const stageHistory = Array.isArray(caseForStage.stageHistory) ? caseForStage.stageHistory : [];
                await storage.updateCase(caseForStage.id, {
                  currentStage: courtTargetStage,
                  ...classificationFields,
                  stageHistory: [
                    ...stageHistory,
                    {
                      stage: courtTargetStage,
                      timestamp: new Date().toISOString(),
                      userId: user?.id || "system",
                      userName: user?.name || "النظام",
                      notes: isOpponentAppeal
                        ? "انتقال تلقائي — جلسة محكمة بعد حكم ابتدائي (استئناف الخصم)"
                        : "انتقال تلقائي عند إنشاء جلسة محكمة",
                    },
                  ],
                });
              } else if (promoteClassification) {
                // Already in/past court but mis-classified — fix the label only.
                await storage.updateCase(caseForStage.id, classificationFields);
              }
            }
          }
        } catch (e) {
          // NO LONGER SWALLOWED. This used to be `console.error(...)` and fall
          // through, so a failed promotion left the hearing created on a case
          // stuck in the wrong stage/classification — invisible until the wrong
          // stage path showed up weeks later. The stage write IS the point of
          // creating a court hearing, so if it fails the whole request fails:
          // roll the hearing back and surface a 500 rather than persist the
          // half-done state. A rollback failure is logged loudly and still 500s
          // (the hearing then exists but the case is unpromoted — the old
          // behaviour, now at least visible in the logs).
          console.error(
            "[POST hearings] auto-stage FAILED — rolling back hearing",
            { hearingId: newHearing.id, caseId: validatedData.caseId, hearingType: validatedData.hearingType },
            e,
          );
          try {
            await storage.deleteHearing(newHearing.id);
          } catch (rollbackErr) {
            console.error(
              "[POST hearings] ROLLBACK FAILED — hearing persists on an unpromoted case",
              { hearingId: newHearing.id, caseId: validatedData.caseId },
              rollbackErr,
            );
          }
          return res.status(500).json({ error: "تعذّر تحديث مرحلة القضية — لم يتم إنشاء الجلسة، يرجى المحاولة مرة أخرى" });
        }
      }

      if (validatedData.caseId && validatedData.caseId !== "none") {
        try {
          const linkedCase = await storage.getCaseById(validatedData.caseId);
          if (linkedCase && !linkedCase.isArchived) {
            const smartPriority = calculateSmartPriority(
              linkedCase.caseType,
              linkedCase.caseClassification,
              linkedCase.memoRequired,
              validatedData.hearingDate,
              linkedCase.priority,
              linkedCase.responseDeadline
            );
            if (smartPriority !== linkedCase.priority) {
              await storage.updateCase(linkedCase.id, { priority: smartPriority });
            }
          }
        } catch (e) {
          console.error("Error recalculating priority on hearing create:", e);
        }
      }

      if (user && validatedData.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: validatedData.caseId,
            userId: user.id,
            userName: user.name || user.id,
            actionType: "hearing_added",
            title: `تمت إضافة جلسة بتاريخ ${validatedData.hearingDate}`,
            relatedEntityType: "hearing",
            relatedEntityId: newHearing.id,
          });
        } catch (e) {}
      }

      if (validatedData.responseRequired && validatedData.caseId && validatedData.caseId !== "none") {
        try {
          const deadlineDate = new Date(validatedData.hearingDate);
          deadlineDate.setDate(deadlineDate.getDate() - 3);
          const relatedCase = await storage.getCaseById(validatedData.caseId);
          const memoAssignee = relatedCase?.primaryLawyerId || relatedCase?.responsibleLawyerId || "";
          const memo = await storage.createMemo({
            caseId: validatedData.caseId,
            hearingId: newHearing.id,
            memoType: MemoType.RESPONSE,
            title: `مذكرة جوابية - جلسة ${validatedData.hearingDate}`,
            description: `مذكرة جوابية مطلوبة قبل الجلسة بتاريخ ${validatedData.hearingDate}`,
            priority: "عالي",
            assignedTo: memoAssignee,
            createdBy: user?.id || "system",
            deadline: deadlineDate.toISOString().split("T")[0],
            isAutoGenerated: true,
            autoGenerateReason: "جلسة_مع_رد_مطلوب",
          });
          createdMemos.push({ type: "response_memo", id: memo.id, description: "مذكرة جوابية تلقائية" });

          const activeCount = await getActiveMemoCount(validatedData.caseId);
          await storage.updateCase(validatedData.caseId, { activeMemoCount: activeCount });
        } catch (e) {
          console.error("Error creating auto memo for hearing:", e);
        }
      }

      // Deferred-memo pickup: when a previous hearing was closed with
      // memoRequired=true but no nextHearingDate at the time, the memo
      // creation was deferred. Now that a new hearing exists for the same
      // case, create the pending memo(s) and link them to the new hearing.
      if (validatedData.caseId && validatedData.caseId !== "none") {
        try {
          const relatedCase = await storage.getCaseById(validatedData.caseId);
          if (relatedCase) {
            const caseHearings = await storage.getHearingsByCase(validatedData.caseId);
            const pendingMemoHearings = caseHearings.filter(
              (h: any) => h.id !== newHearing.id && h.memoRequired === true && !!h.result,
            );
            if (pendingMemoHearings.length > 0) {
              const deadlineDate = new Date(validatedData.hearingDate);
              deadlineDate.setDate(deadlineDate.getDate() - 3);
              const memoAssignee = relatedCase.primaryLawyerId || relatedCase.responsibleLawyerId || "";
              for (const pendingH of pendingMemoHearings) {
                const memo = await storage.createMemo({
                  caseId: validatedData.caseId,
                  hearingId: newHearing.id,
                  memoType: MemoType.RESPONSE,
                  title: `مذكرة جوابية - جلسة ${validatedData.hearingDate}`,
                  description: `مذكرة جوابية مؤجلة من جلسة ${pendingH.hearingDate} — تم ربطها بالجلسة القادمة بتاريخ ${validatedData.hearingDate}`,
                  priority: "عالي",
                  assignedTo: memoAssignee,
                  createdBy: user?.id || "system",
                  deadline: deadlineDate.toISOString().split("T")[0],
                  isAutoGenerated: true,
                  autoGenerateReason: "موعد_جديد_مع_رد_مؤجل",
                });
                createdMemos.push({ type: "deferred_response_memo", id: memo.id, description: "مذكرة جوابية مؤجلة" });
                // Clear the flag on the originating hearing — handled.
                await storage.updateHearing(pendingH.id, { memoRequired: false });
              }
              const activeCount = await getActiveMemoCount(validatedData.caseId);
              await storage.updateCase(validatedData.caseId, { activeMemoCount: activeCount });
            }
          }
        } catch (e) {
          console.error("Error creating deferred memo for hearing:", e);
        }
      }

      res.status(201).json({ ...newHearing, createdMemos });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء الجلسة" });
    }
  });

  app.patch("/api/hearings/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const existing = await storage.getHearingById(String(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      const relatedCase = await storage.getCaseById(existing.caseId);
      if (relatedCase && !canModifyCase(user, relatedCase, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه الجلسة" });
      }

      // 2D'-V1b Pattern-A gate: validate types only, then keep using
      // req.body untouched.
      const bodyCheck = updateHearingSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      // Prevent closing hearing without a result - must use POST /api/hearings/:id/result instead
      if (req.body.status === HearingStatus.COMPLETED && existing.status !== HearingStatus.COMPLETED) {
        if (!existing.result) {
          return res.status(400).json({ error: "لا يمكن إغلاق الجلسة بدون تسجيل نتيجة. استخدم تسجيل نتيجة الجلسة أولاً" });
        }
      }

      const updated = await storage.updateHearing(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }

      if (relatedCase && !relatedCase.isArchived && req.body.hearingDate) {
        try {
          const smartPriority = calculateSmartPriority(
            relatedCase.caseType,
            relatedCase.caseClassification,
            relatedCase.memoRequired,
            req.body.hearingDate,
            relatedCase.priority,
            relatedCase.responseDeadline
          );
          if (smartPriority !== relatedCase.priority) {
            await storage.updateCase(relatedCase.id, { priority: smartPriority });
          }
        } catch (e) {
          console.error("Error recalculating priority on hearing update:", e);
        }
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الجلسة" });
    }
  });

  app.delete("/api/hearings/:id", requireAuth, requireRole("branch_manager", "admin_support"), async (req, res) => {
    try {
      await storage.deleteHearing(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الجلسة" });
    }
  });

  // POST /api/hearings/:id/cancel — cancel a hearing WITH a mandatory reason.
  //
  // Replaces the old client-side `PATCH /api/hearings/:id { status: "ملغية" }`,
  // which fired with no confirmation and captured nothing: a cancelled session
  // showed a bare "ملغية" badge and the reason lived only in someone's memory.
  // The generic PATCH still accepts a status change (other callers rely on it) —
  // this endpoint is what the UI uses, so the reason is always captured.
  //
  // Role gate: the SAME set the cancel button has always used —
  // attending lawyer | branch_manager | admin_support (canActOnHearing),
  // delegation-aware. Deliberately NOT narrowed to the flag endpoint's two
  // roles: cancelling your own session is normal lawyer work, whereas flagging
  // is supervisory.
  app.post("/api/hearings/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!await canActOnHearing(reqUser, hearing, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية إلغاء هذه الجلسة" });
      }
      if (hearing.status === HearingStatus.CANCELLED) {
        return res.status(400).json({ error: "الجلسة ملغاة بالفعل" });
      }

      const bodyCheck = workflowReasonSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) {
        return res.status(400).json({ error: "سبب الإلغاء مطلوب" });
      }
      // varchar(500) — refuse rather than let Postgres throw a 22001.
      if (reason.length > 500) {
        return res.status(400).json({ error: "سبب الإلغاء طويل جداً (الحد ٥٠٠ حرف)" });
      }

      const updated = await storage.updateHearing(hearingId, {
        status: HearingStatus.CANCELLED,
        cancellationReason: reason,
      });
      if (!updated) {
        return res.status(500).json({ error: "فشل إلغاء الجلسة" });
      }

      // Hearings have no activity log of their own — the parent case's timeline
      // is where this belongs (same choice the flag endpoint makes).
      if (hearing.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: hearing.caseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            actionType: "hearing_cancelled",
            title: `تم إلغاء الجلسة — ${reason}`,
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        } catch (e) {
          console.error("[hearings/cancel] logCaseActivity failed", e);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error cancelling hearing:", error);
      res.status(500).json({ error: "حدث خطأ في إلغاء الجلسة" });
    }
  });

  // POST /api/hearings/:id/flag — "جلسة مُعلَّمة", a TEAM attention flag.
  // Body: { flagged: boolean, reason?: string }.
  //
  // Role gate: admin_support + branch_manager ONLY, via the same requireRole
  // middleware the DELETE above uses — deliberately NOT the broader
  // canActOnHearing (which also admits the attending lawyer). The flag is a
  // supervisory mark ON the lawyer's session, so the lawyer is not an author.
  // The frontend renders the button under the identical two-role condition, so
  // visibility === authorization.
  //
  // Visible to EVERYONE: no read gate anywhere — the flag rides on the hearing
  // row that every /api/hearings consumer already receives.
  //
  // Toggle semantics: flagged=false CLEARS reason/by/at as well, so an
  // unflagged hearing can never surface a stale reason.
  app.post("/api/hearings/:id/flag", requireAuth, requireRole("branch_manager", "admin_support"), async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }

      // Tolerant gate (validation-patterns): type-check only, handler keeps its
      // own Arabic 400s. `reason` rides in via the shared workflow shape.
      const bodyCheck = workflowReasonSchema.extend({
        flagged: z.boolean().optional(),
      }).safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }

      const flagged = req.body?.flagged !== false; // default true → flag
      const reason = String(req.body?.reason ?? "").trim();

      if (flagged && !reason) {
        return res.status(400).json({ error: "سبب التعليم مطلوب" });
      }
      // varchar(500) — refuse rather than let Postgres throw a 22001.
      if (reason.length > 500) {
        return res.status(400).json({ error: "سبب التعليم طويل جداً (الحد ٥٠٠ حرف)" });
      }

      const updated = await storage.updateHearing(hearingId, flagged
        ? {
            isFlagged: true,
            flagReason: reason,
            flaggedBy: reqUser.id,
            flaggedAt: new Date().toISOString(),
          }
        : {
            isFlagged: false,
            flagReason: null,
            flaggedBy: null,
            flaggedAt: null,
          });
      if (!updated) {
        return res.status(500).json({ error: "فشل تحديث حالة تعليم الجلسة" });
      }

      // Audit trail on the parent case's timeline — the hearing has no activity
      // log of its own, and case_activity_log.action_type is free text (no
      // migration for a new kind).
      if (hearing.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: hearing.caseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            actionType: flagged ? "hearing_flagged" : "hearing_unflagged",
            title: flagged ? `تم تعليم الجلسة للانتباه — ${reason}` : "تم إلغاء تعليم الجلسة",
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        } catch (e) {
          console.error("[hearings/flag] logCaseActivity failed", e);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error toggling hearing flag:", error);
      res.status(500).json({ error: "حدث خطأ في تعليم الجلسة" });
    }
  });

  // POST /api/hearings/:id/opponent-response-required   Body: { required: boolean }
  //
  // Mark (or unmark) "مطلوب رد من الخصم" on a hearing AFTER the fact. The opponent
  // sometimes responds late, and until now the flag could only be set while
  // recording the result — PATCH /api/hearings/:id/result-details explicitly
  // REFUSES it via CASCADE_FIELDS, so there was no sanctioned post-hoc path.
  //
  // 🔴 SETTING AND CLEARING ARE THE SAME ENDPOINT, ON PURPOSE. This flag is the
  // codebase's documented set-and-never-cleared bug (55fc32b → 54cf108: a stored
  // boolean written with no way to unset it, so the badge stuck on a case forever).
  // The rule that came out of that is: every new way to SET it ships with a
  // matching way to CLEAR it. Here they are literally one control — the UI toggle
  // posts `required: false` to turn it off.
  //
  // EXPLICIT BOOLEAN, never an implicit flip: a stale client cannot invert state it
  // did not see. Same tri-state discipline as the objectionability question.
  //
  // WRITES THE EXISTING COLUMN — no second flag. So the three established clearing
  // paths still find and clear whatever this sets: the case-close sweep
  // (cancelOpenCaseChildrenOnClose → clearOpponentResponseFlag), the newer-hearing
  // sweep at the end of result recording, and the explicit
  // POST /api/cases/:id/opponent-response action.
  //
  // GATE: canActOnHearing — the same gate that sets this flag today via the result
  // route, and the gate on every other hearing-level action.
  app.post("/api/hearings/:id/opponent-response-required", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!await canActOnHearing(reqUser, hearing, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }

      // Tolerant gate (validation-patterns): type-check only; the handler keeps its
      // own Arabic 400 below.
      const bodyCheck = z.object({ required: z.boolean().optional() })
        .passthrough().safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      if (typeof req.body?.required !== "boolean") {
        return res.status(400).json({ error: "يجب تحديد ما إذا كان مطلوباً رد من الخصم" });
      }
      const required: boolean = req.body.required;

      const updated = await storage.updateHearing(hearingId, {
        opponentResponseRequired: required,
      });
      if (!updated) {
        return res.status(500).json({ error: "فشل تحديث حالة رد الخصم" });
      }

      // Audit trail on the PARENT CASE's timeline — hearings have no activity log
      // of their own, and case_activity_log.action_type is free text (no
      // migration). Mirrors hearing_flagged / hearing_cancelled exactly. Logging
      // BOTH directions matters here: the clear side is already audited by the
      // case-level action, so an unlogged set would be the one opponent-response
      // event with no trace.
      if (hearing.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: hearing.caseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            actionType: required ? "opponent_response_required_set" : "opponent_response_required_cleared",
            title: required
              ? `تم تعليم الجلسة: مطلوب رد من الخصم — جلسة ${hearing.hearingDate}`
              : `تم إلغاء "مطلوب رد من الخصم" — جلسة ${hearing.hearingDate}`,
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        } catch (e) {
          console.error("[hearings/opponent-response-required] logCaseActivity failed", e);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("[hearings/opponent-response-required] error:", error);
      res.status(500).json({ error: error.message || "حدث خطأ" });
    }
  });

  // ==================== Hearing Workflow ====================

  app.post("/api/hearings/:id/result", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!await canActOnHearing(req.user!, hearing, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }
      // TIMEZONE FIX — was `new Date(hearingDate)` (UTC) + setHours (server-local),
      // two different calendars, which on a UTC server made 00:00–03:00 Riyadh read
      // as YESTERDAY and so REFUSED a result on the hearing's own day for three
      // hours every morning. isFirmFuture compares calendar days as strings in the
      // firm's timezone; no parse, nothing to shift.
      if (isFirmFuture(hearing.hearingDate)) {
        return res.status(400).json({ error: "لا يمكن تسجيل نتيجة الجلسة قبل موعدها" });
      }
      if (hearing.status !== HearingStatus.UPCOMING) {
        return res.status(400).json({ error: "لا يمكن تسجيل نتيجة لجلسة غير قادمة" });
      }

      const data = hearingResultSchema.parse(req.body);

      // Jurisdiction-declined: court ruling that this case belongs to a
      // different department. Requires the FE to pass the target dept.
      if (data.result === HearingResult.JURISDICTION_DECLINED) {
        if (!data.transferToDepartmentId) {
          return res.status(400).json({ error: "يجب اختيار القسم المحوّل إليه عند تسجيل عدم الاختصاص" });
        }
      }

      // Settlement hearings (parent case is a settlement-only case
      // currently parked on مداولة_الصلح) only ever produce one of
      // three outcomes: موعد_جديد (postpone), تم_الصلح (advance to
      // تحصيل) or لم_يتم_الصلح (close / continue dialog). Any of the
      // judgment / dismissal / jurisdiction results is meaningless
      // here — the court hasn't ruled, it's mediating. The FE filters
      // these out, this guard catches direct API calls and stale
      // dialog state. Keep this check before we mutate anything.
      const settlementProbeCaseId = hearing.caseId
        || (data.caseId && data.caseId !== "none" ? data.caseId : null);
      const settlementProbeCase = settlementProbeCaseId
        ? await storage.getCaseById(settlementProbeCaseId)
        : null;
      const isSettlementHearing =
        !!settlementProbeCase?.isSettlementCase
        && settlementProbeCase?.currentStage === "مداولة_الصلح";
      if (isSettlementHearing) {
        const allowedSettlementResults: string[] = [
          HearingResult.NEW_SESSION,
          HearingResult.SETTLEMENT_REACHED,
          HearingResult.SETTLEMENT_FAILED,
          HearingResult.SETTLEMENT_LINK_MISSING,
        ];
        if (!allowedSettlementResults.includes(data.result)) {
          return res.status(400).json({
            error: "هذه جلسة صلح — النتائج المتاحة: موعد جديد، تم الصلح، أو لم يتم الصلح",
          });
        }
      }

      // ==================== 🔴 A SETTLEMENT RESULT CANNOT REACH A COURT-FILED CASE ====================
      // THE 2026-08-09 PRODUCTION INCIDENT. Three cases at منظورة — filed, with
      // court numbers and scheduled sessions — were pushed BACK to أغلق_طلب_الصلح
      // within 22 seconds of each other, by لم_يتم_الصلح results recorded on stale
      // تراضي hearings that had been left open when the cases advanced into court.
      // Nothing in the settlement branches read the case's stage before writing
      // one; the guard directly above is no help because it runs the OTHER way
      // round (it restricts which RESULTS a settlement-stage case may take, so a
      // case at منظورة simply fails its `مداولة_الصلح` test and sails past).
      //
      // 🔴 REJECT — DO NOT SILENTLY REPAIR, and note this is the opposite of what
      // the JUDGMENT path does a few lines below. That asymmetry is the whole
      // point. A judgment is PROOF the case is in court, so there the case row is
      // the stale fact and promoting it forward is right. Here the relationship
      // inverts: the case row is the RELIABLE fact (court number, live sessions)
      // and the settlement result is the stale one, recorded against a hearing
      // that events overtook. There is nothing to repair — the request asserts
      // something that cannot be true. Silently dropping just the stage change
      // would be worse than either: the user would believe they recorded it.
      //
      // COVERS تم_الصلح AS WELL AS لم_يتم_الصلح, and تم_الصلح is the more dangerous
      // of the two: it routes to تحصيل, which is sealed against manual closure at
      // EVERY tier including branch_manager, so a case dragged there would be
      // permanently stuck. It is also offered on ordinary محكمة hearings by the
      // result dialog, which لم_يتم_الصلح is not.
      //
      // PRE-COURT STAGES STAY PERMISSIVE (owner decision). قيد_التدقيق_في_ناجز,
      // قيد_التدقيق_في_تراضي, مداولة_الصلح and the rest are untouched — a
      // settlement concluding there is the designed flow, not a regression. The
      // gate is StagesAtOrPastCourt and nothing else.
      //
      // The three inputs mirror the branch conditions further down EXACTLY, so
      // this refuses precisely what would have moved the stage and no more: a
      // bare صلح carrying no conciliationResult falls through to the default
      // branch, which writes no stage, and is therefore left alone.
      const isStageMovingSettlementResult =
        data.result === HearingResult.SETTLEMENT_REACHED
        || data.result === HearingResult.SETTLEMENT_FAILED
        || (data.result === HearingResult.SETTLEMENT
          && (data.conciliationResult === "تم_الصلح" || data.conciliationResult === "لم_يتم_الصلح"));
      if (
        isStageMovingSettlementResult
        && settlementProbeCase
        && caseIsAtOrPastCourt(settlementProbeCase.currentStage)
      ) {
        const stageLabel = CaseStageLabels[settlementProbeCase.currentStage as CaseStageValue]
          || settlementProbeCase.currentStage;
        // Names the sanctioned alternative on purpose: the user in the incident
        // had no other way to clear a stale صلح hearing off their list, and a
        // refusal that leaves them stuck invites them to find another route to
        // the same damage. Cancelling is reachable by exactly this actor —
        // POST /api/hearings/:id/cancel is gated on canActOnHearing, the same
        // predicate that admitted them to this handler.
        return res.status(400).json({
          error: `لا يمكن تسجيل نتيجة صلح على قضية بلغت مرحلة "${stageLabel}" — القضية مرفوعة في المحكمة. إذا كانت هذه جلسة صلح قديمة تجاوزتها القضية، فألغِ الجلسة بدلاً من تسجيل نتيجتها.`,
        });
      }

      // ==================== 🔴 …AND THE CASE MUST HAVE A SETTLEMENT TRACK AT ALL ====================
      // ADDITIVE to the at-or-past-court guard above, not a replacement — both run.
      // That one asks "has this case already gone PAST settlement"; this one asks
      // "does this case have a settlement stage in the first place". A case can
      // fail the second while passing the first, and that gap is what produced the
      // 16 production rows sitting at تحصيل on InCourtNoMemoStages.
      //
      // THE HOLE IT CLOSES. caseIsAtOrPastCourt("دراسة") is FALSE, so an in-court
      // case parked on a PRE-court stage sailed through — and the SETTLEMENT_REACHED
      // branch further down reads no classification and no path before writing
      // تحصيل. A تراضي/تسوية_ودية hearing can be created on such a case (hearing
      // creation only auto-promotes to مداولة_الصلح from قيد_التدقيق_في_ناجز /
      // قيد_التدقيق_في_تراضي / أغلق_طلب_الصلح, and simply leaves every other stage
      // alone), so the session exists and "تم الصلح" was one click away.
      //
      // 🔴 WHICH PATHS ARE NEWLY REFUSED — measured, not assumed:
      //     HAVE مداولة_الصلح (unchanged): USGeneral, USCommercial, USLabor,
      //                                    InCourtSettlement
      //     LACK it (newly refused):       USAdmin, InCourtDefendant,
      //                                    InCourtPlaintiff, InCourtNoMemo
      // ⚠ USAdmin IS IN THE SECOND GROUP. The admin path runs
      // تحرير_صيغة_التظلم → … → انتظار_رد_التظلم → تحصيل and has NO مداولة_الصلح, so
      // an admin case has no settlement-hearing flow to protect. Its collection
      // route is the GRIEVANCE edge انتظار_رد_التظلم → تحصيل, which is a PATCH
      // transition and never reaches this handler — so that flow is untouched.
      //
      // Resolved with getStagesForClassification on the same five arguments used
      // everywhere else. departmentName is load-bearing here and not decorative:
      // it is the ONLY thing separating USAdmin (no settlement) from the other
      // three under-study paths (settlement), so an unresolved department would
      // silently fall back to General and wrongly permit.
      if (isStageMovingSettlementResult && settlementProbeCase) {
        const settlementDept = settlementProbeCase.departmentId
          ? await storage.getDepartmentById(settlementProbeCase.departmentId)
          : null;
        const settlementCasePath = getStagesForClassification(
          settlementProbeCase.caseClassification as CaseClassificationValue,
          settlementDept?.name,
          settlementProbeCase.clientRole ?? undefined,
          !!settlementProbeCase.memoRequired,
          !!settlementProbeCase.isSettlementCase,
        );
        if (!settlementCasePath.includes("مداولة_الصلح")) {
          return res.status(400).json({
            error: "لا يمكن تسجيل نتيجة صلح على هذه القضية — مسارها لا يتضمّن مرحلة مداولة الصلح أصلاً. إذا كان الصلح وارداً فعلاً، صحّح تصنيف القضية أو مسارها أولاً؛ وإذا كانت هذه جلسة صلح أُنشئت بالخطأ، فألغِ الجلسة بدلاً من تسجيل نتيجتها.",
          });
        }
      }

      // ==================== JUDGMENT MODEL (validated BEFORE any mutation) ====================
      // THE DEGREE IS DERIVED FROM THE CASE PATH, never asked. The opposite of
      // ابتدائي is استئنافي — NOT نهائي, which is a separate concept (can the
      // ruling still be objected to). So:
      //   case at منظورة          → the ruling is ابتدائي (first instance)
      //   case at منظورة_استئناف   → the ruling is استئنافي, final by nature
      // This replaces the "درجة الحكم: ابتدائي أم نهائي" question, which posed a
      // false opposition and asked the user for something the case already knows.
      //
      // The ONLY judgment question besides the outcome is OBJECTIONABILITY, and
      // only for a first-instance ruling: some first-instance rulings cannot be
      // objected to at all (القضاء المستعجل). An appeal ruling is never asked.
      //
      // FINALITY IS COMPUTED:
      //   isFinal = isAppealRuling || objectionable === false
      // and drives the resulting stage:
      //   منظورة + objectionable      → محكوم_حكم_ابتدائي  (صك / objection / appeal path)
      //   منظورة + NOT objectionable  → محكوم_حكم_نهائي     (final at once, no window)
      //   منظورة_استئناف + any ruling → محكوم_حكم_نهائي
      const judgmentType = data.judgmentType || data.judgmentSide || null;
      let judgmentIsAppealRuling = false;
      let judgmentDerivedFinal = false;
      // إعادة للدرجة الأولى — the appeal court returned the case to first instance.
      // Derived here beside the rest of the judgment model so PATH B branches on
      // already-validated values and cannot reach a different conclusion.
      let judgmentRemands = false;
      if (data.result === HearingResult.JUDGMENT) {
        if (!judgmentType) {
          return res.status(400).json({ error: "يجب تحديد نوع الحكم (لصالحنا / ضدنا / جزئي)" });
        }
        // A hearing with no linked case is a real error — there is nothing to
        // record the judgment against.
        if (!settlementProbeCase) {
          return res.status(400).json({ error: "لا يمكن تسجيل حكم لجلسة غير مرتبطة بقضية" });
        }
        // SILENT PROMOTION, NOT A BLOCK (owner decision). The blocking guard that
        // stood here is removed: the owner already placed the guard at HEARING
        // CREATION (c5e930e — creating a court hearing promotes the case), and a
        // second block at judgment time rejected legitimate work on cases whose
        // hearings predate that change.
        //
        // Recording a judgment MEANS the case is in court, so a case found on any
        // other stage is repaired rather than refused: promoted exactly the way
        // hearing creation promotes it (منظورة + قيد_الدراسة → منظورة_بالمحكمة with
        // clientRole defaulting to مدعي, plus a stage-history entry). No error, no
        // message. This runs BEFORE the degree is derived, so a promoted case
        // correctly reads as ابتدائي — it is at منظورة by the time we look.
        //
        // A case already at منظورة_استئناف is left ALONE so the appeal-ruling
        // branch still fires for it.
        let judgmentCase = settlementProbeCase;
        if (
          judgmentCase.currentStage !== "منظورة" &&
          judgmentCase.currentStage !== "منظورة_استئناف"
        ) {
          const promoted = await promoteCaseToCourtForJudgment(judgmentCase, req.user!);
          if (promoted) judgmentCase = promoted;
        }
        judgmentIsAppealRuling = judgmentCase.currentStage === "منظورة_استئناف";
        if (!judgmentIsAppealRuling) {
          // Explicit boolean required — an unanswered question is what used to
          // park a case at محكوم_حكم_ابتدائي with no deadline and no way forward.
          if (typeof data.objectionFeasible !== "boolean") {
            return res.status(400).json({ error: "يجب تحديد ما إذا كان الحكم قابلاً للاعتراض" });
          }
        }
        judgmentDerivedFinal = judgmentIsAppealRuling || data.objectionFeasible === false;
        // 🔴 THE REMAND IS GATED ON THE CASE, NOT ON THE REQUEST. `judgmentIsAppealRuling`
        // is read from the case's own stage a few lines above, so a first-instance
        // ruling cannot remand even if the field is sent — the client omits it, and
        // a hand-rolled request that includes it is ignored rather than obeyed.
        // A remand off a first-instance ruling is not a thing a court does, and
        // honouring it would write منظورة over a case that is already there.
        judgmentRemands = judgmentIsAppealRuling && data.remandToFirstInstance === true;
      }

      const effectiveCaseId = hearing.caseId || (data.caseId && data.caseId !== "none" ? data.caseId : null);

      if (!hearing.caseId && effectiveCaseId) {
        await storage.updateHearing(hearingId, { caseId: effectiveCaseId });
        hearing.caseId = effectiveCaseId;
      }

      const updateData: any = {
        result: data.result,
        resultDetails: data.resultDetails || "",
        status: (data.result === HearingResult.NEW_SESSION)
          ? HearingStatus.POSTPONED : HearingStatus.COMPLETED,
      };

      // Judgment hearing data
      if (data.result === HearingResult.JUDGMENT) {
        updateData.judgmentSide = judgmentType;
        // judgment_final now records the DERIVED finality, not a user answer, so
        // every existing reader (the isFinal branches, the hearings detail badge,
        // stats) keeps working unchanged while nobody is asked the question.
        updateData.judgmentFinal = judgmentDerivedFinal;
        // Meaningless for an appeal ruling — stored null rather than a stray false.
        updateData.objectionFeasible = judgmentIsAppealRuling ? null : data.objectionFeasible;
        updateData.objectionDeadline = data.objectionDeadline || null;
      }

      // "مطلوب رد من الخصم" LIVES ON THE NEWEST HEARING OF THE CASE — the newly
      // created next session when there is one, otherwise the hearing whose
      // result was just recorded. Never blocks: ticking the box without a next
      // date is allowed and still records the flag.
      //
      // Whichever row ends up holding it is spared by the end-of-handler sweep;
      // everything older is unset. Recording a result on a hearing NEWER than the
      // flagged one therefore clears it, which is the intended lifecycle.
      //
      // (The original bug: the flag was written onto the just-CLOSED hearing even
      // when a next session existed, and the sweep — correctly — cleared that
      // stale row. With no next session that was the only row, so the flag was
      // written and immediately wiped, leaving zero rows in the DB.)
      let opponentFlagHearingId: string | null = null;

      // New-session data. memoRequired is the canonical "this hearing still
      // needs an auto-memo generated" flag. Coalesce responseRequired into it
      // so the deferred-memo trigger works whether the client sends one or
      // the other. Cleared to false later if the memo gets created right now.
      if (data.result === HearingResult.NEW_SESSION) {
        updateData.nextHearingDate = data.nextHearingDate || null;
        updateData.nextHearingTime = data.nextHearingTime || null;
        updateData.responseRequired = data.responseRequired ?? false;
        updateData.memoRequired = !!(data.memoRequired || data.responseRequired);
        // No next session will be created → THIS hearing is the newest one, so it
        // carries the flag. With a date, the new hearing below carries it instead
        // and this row is deliberately left for the sweep to clean.
        if (!data.nextHearingDate) {
          updateData.opponentResponseRequired = data.opponentResponseRequired ?? false;
          if (data.opponentResponseRequired === true) {
            opponentFlagHearingId = hearingId;
          }
        }
      }

      const updatedHearing = await storage.updateHearing(hearingId, updateData);

      const reqUser = req.user!;
      if (reqUser && effectiveCaseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: effectiveCaseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            actionType: "hearing_result_recorded",
            title: `تم تسجيل نتيجة الجلسة: ${data.result}`,
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        } catch (e) {}
      }

      const createdTasks: any[] = [];
      const createdMemos: any[] = [];
      let existingCase = effectiveCaseId ? await storage.getCaseById(effectiveCaseId) : null;
      // isAppealStage was replaced by judgmentIsAppealRuling, derived up front
      // (before any mutation) from the same case row so the judgment guard and
      // the branch below can never disagree about the degree.

      // ==================== UNIVERSAL: PRIOR MEMOS ARE SPENT ====================
      // RECORDING ANY HEARING RESULT cancels the case's still-open memos — not
      // just a judgment. The session HAPPENED, so a memo prepared for it has
      // served its purpose whatever the court did: postponed, ruled, struck off,
      // declined jurisdiction, settled or not. Leaving them open is what kept a
      // stale "مذكرة جارية" lit on the cases list.
      //
      // HOISTED out of PATH B (it used to live inside the judgment branch) so
      // there is still exactly ONE implementation — cancelActiveCaseMemos — now
      // reached by every result instead of one. PATH B no longer cancels anything
      // itself, so there is no double-cancellation: a judgment passes through
      // here once, and by the time the branch runs the memos are already ملغاة and
      // outside ACTIVE_MEMO_STATUSES. (The ضدنا-final close further down calls
      // cancelOpenCaseChildrenOnClose, which cancels again with no exclusion —
      // also a no-op on already-cancelled rows, and correct for the objection,
      // which a closed case does not keep.)
      //
      // OBJECTION IS EXCLUDED, ALWAYS — for every result, not just judgments. The
      // لائحة اعتراضية is not a pleading a session ends; it is the work a ruling
      // CREATES. An existing one must survive, and the صك-receipt flow must still
      // be able to create one AFTER the judgment (ensureObjectionMemoForCase).
      //
      // ORDERING IS LOAD-BEARING — this runs BEFORE the result branches, so:
      //   • موعد_جديد + مطلوب مذكرة: the new مذكرة جوابية is created AFTER this
      //     (PATH A, createResponseMemoForCase) and can never be cancelled by its
      //     own request. createResponseMemoForCase recomputes activeMemoCount
      //     itself, so it also lands on top of the count written here.
      //   • judgment: before the collection/execution field tasks (which this
      //     does not touch anyway) and before the stage write.
      //   • عدم_الاختصاص: before PATH H's early return, so a case leaving for
      //     another department does not carry open memos with it.
      let cancelledPriorMemos = 0;
      if (effectiveCaseId && existingCase) {
        const isJudgmentResult = data.result === HearingResult.JUDGMENT;
        // Distinct wording per cause — both land on memos.cancellation_reason and
        // in memo_activity_log, so the memo's own cancellation banner says WHY.
        const cancelReason = isJudgmentResult
          ? "أُلغيت تلقائياً بسبب صدور حكم في القضية"
          : "أُلغيت تلقائياً بسبب تسجيل نتيجة جلسة جديدة";
        cancelledPriorMemos = await cancelActiveCaseMemos(effectiveCaseId, {
          excludeTypes: [MemoType.OBJECTION],
          reason: cancelReason,
          performedBy: reqUser.id,
        });
        if (cancelledPriorMemos > 0) {
          const postCancelActiveCount = await getActiveMemoCount(effectiveCaseId);
          await storage.updateCase(effectiveCaseId, { activeMemoCount: postCancelActiveCount });
          await logCaseActivityActing(req, {
            caseId: effectiveCaseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            // Kept distinct so the case timeline still reads differently for the
            // two causes; both are free-text action types, no migration.
            actionType: isJudgmentResult
              ? "memos_cancelled_on_judgment"
              : "memos_cancelled_on_hearing_result",
            title: isJudgmentResult
              ? `إلغاء ${cancelledPriorMemos} مذكرة بعد صدور الحكم`
              : `إلغاء ${cancelledPriorMemos} مذكرة بعد تسجيل نتيجة الجلسة`,
            details: `${cancelReason} — اللائحة الاعتراضية مستثناة`,
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        }
      }

      if (effectiveCaseId && existingCase) {
        const caseUpdate: any = {
          lastHearingResult: data.result,
          lastHearingDate: hearing.hearingDate,
        };

        // ==================== 🔴 EVERY STAGE MOVE FROM HERE IS RECORDED ====================
        // storage.updateCase does NOT append stage history — it destructures the
        // date columns, spreads the rest into .set() and returns, so a stageHistory
        // entry exists only if the CALLER supplies one. PATCH /api/cases/:id does
        // that unconditionally on any stage change; this handler did it in only 2
        // of its 8 stage-writing branches, so مشطوبة, تحصيل, محكوم_حكم_ابتدائي, the
        // عدم_الاختصاص reset and every settlement landing were written to
        // current_stage and left NO trace. The audit trail lied: the 2026-08-09
        // incident cases showed a stage_history ending at قيد_التدقيق_في_ناجز /
        // منظورة while sitting on أغلق_طلب_الصلح.
        //
        // That is not merely cosmetic — caseReachedJudgmentStage (both صك gates),
        // deriveCurrentCaseNumber (which number the case displays) and the terminal
        // progress bar all read stage_history, and were all being told a case had
        // never been where it had in fact been.
        //
        // NOT A THIRD COPY OF THE APPEND LOGIC. appendStageHistory already exists
        // and is exported from server/judgment-record.ts (imported above, used by
        // the appeal-ruling route); the only thing added here is a closure binding
        // the two arguments that are constant for this request, so each branch
        // reads as one line naming its stage and its reason.
        //
        // BASE ROW: existingCase, read once at the top of the handler. Nothing
        // between that read and these branches writes stage_history — the memo
        // sweep above touches activeMemoCount only — so it is a valid base for
        // every branch. The two branches that already appended keep chaining the
        // way they did (the ضدنا close builds on the judgment entry it just made,
        // so the record reads "final judgment, THEN closed" rather than losing one).
        //
        // ACTOR: actorDisplayName, matching PATCH /api/cases/:id, the canonical
        // stage-history writer. It returns the plain name unchanged when no
        // delegation applies, so non-delegated writes are byte-identical to what
        // the two existing branches produced; a delegated one now carries the
        // "(نيابةً عن …)" suffix here too instead of hiding the delegation.
        const historyBaseCase = existingCase;
        const historyActor = {
          id: reqUser.id,
          name: actorDisplayName(req.actingContext, effectiveCaseId, reqUser.name || reqUser.id),
        };
        const stageHistoryFor = (stage: CaseStageValue, notes: string) =>
          appendStageHistory(historyBaseCase, stage, historyActor, notes);

        // ==================== PATH H: JURISDICTION DECLINED (عدم_الاختصاص) ====================
        // Court ruled it lacks jurisdiction → case moves to the target
        // department. Reset stage to استلام, clear lawyers, keep
        // classification (still IN_COURT). Log a dedicated
        // jurisdiction_transferred activity with the source/target dept
        // ids and the hearing id, then short-circuit — no other PATH
        // applies.
        if (data.result === HearingResult.JURISDICTION_DECLINED) {
          const fromDeptId = existingCase.departmentId || null;
          const toDeptId = data.transferToDepartmentId!;
          // The intake-set internal reviewer belongs to the source dept's
          // roster; clear it on jurisdiction transfer so the new dept head
          // can re-assign someone valid at intake.
          const previousInternalReviewerId = existingCase.internalReviewerId || null;
          await storage.updateCase(effectiveCaseId, {
            ...caseUpdate,
            departmentId: toDeptId,
            currentStage: CaseStage.RECEPTION,
            stageHistory: stageHistoryFor(CaseStage.RECEPTION, "عدم الاختصاص — إعادة القضية لمرحلة الاستلام في القسم المحوّل إليه"),
            primaryLawyerId: null,
            responsibleLawyerId: null,
            assignedLawyers: [],
            internalReviewerId: null,
          });
          if (reqUser) {
            try {
              await logCaseActivityActing(req, {
                caseId: effectiveCaseId,
                userId: reqUser.id,
                userName: reqUser.name || reqUser.id,
                actionType: "jurisdiction_transferred",
                title: "تحويل بسبب عدم الاختصاص",
                previousValue: fromDeptId || "",
                newValue: toDeptId,
                details: JSON.stringify({
                  fromDeptId,
                  toDeptId,
                  hearingId,
                  reason: data.transferReason || null,
                  previousInternalReviewerId,
                }),
                relatedEntityType: "hearing",
                relatedEntityId: hearingId,
              });
            } catch (e) {
              console.error("[hearing-result/jurisdiction] logCaseActivity failed", e);
            }
          }
          return res.json({ hearing: updatedHearing, createdTasks: [], createdMemos: [] });
        }

        // ==================== PATH A: NEW SESSION (موعد_جديد) ====================
        // Unified handler for what used to be two outcomes (تأجيل + موعد_جديد).
        // Case stays at current stage; we schedule the next hearing and, if the
        // lawyer ticked "needs response", create both a field task to prep the
        // response and an auto-memo. responseRequired (legacy field) and
        // memoRequired (new field) are treated as the same signal.
        if (data.result === HearingResult.NEW_SESSION) {
          if (data.nextHearingDate) {
            caseUpdate.nextHearingDate = data.nextHearingDate;
          }
          await storage.updateCase(effectiveCaseId, caseUpdate);

          // Also mirrored onto the outer-scope variable so the clearing sweep at
          // the end of the handler can spare the hearing it just created.
          let newSessionHearingId: string | null = null;
          if (data.nextHearingDate) {
            const newHearing = await storage.createHearing({
              caseId: effectiveCaseId,
              hearingDate: data.nextHearingDate,
              hearingTime: data.nextHearingTime || hearing.hearingTime,
              courtName: hearing.courtName,
              courtNameOther: hearing.courtNameOther,
              courtRoom: hearing.courtRoom,
              status: HearingStatus.UPCOMING,
              attendingLawyerId: hearing.attendingLawyerId,
              // The flag's carrier whenever a next session exists — this row is
              // the one the end-of-handler sweep spares (opponentFlagHearingId),
              // so it survives and is what lights the "مطلوب رد من الخصم" badge.
              opponentResponseRequired: data.opponentResponseRequired || false,
              notes: `موعد جديد من جلسة ${hearing.hearingDate}`,
            });
            newSessionHearingId = newHearing.id;
            // The new session is now the newest hearing, so it is the flag's
            // carrier and the row the sweep must spare.
            opponentFlagHearingId = newHearing.id;
            createdTasks.push({ type: "new_hearing", id: newHearing.id, description: "تم إنشاء جلسة جديدة تلقائياً" });
          }

          const needsResponse = !!(data.responseRequired || data.memoRequired);
          if (needsResponse && data.nextHearingDate) {
            const responseAssignee = hearing.attendingLawyerId || existingCase.primaryLawyerId || existingCase.responsibleLawyerId || reqUser.id;
            const task = await storage.createFieldTask({
              title: `إعداد رد للجلسة القادمة - ${existingCase.caseNumber}`,
              description: `مطلوب إعداد رد قبل الجلسة القادمة بتاريخ ${data.nextHearingDate}`,
              taskType: "متابعة_محكمة",
              caseId: effectiveCaseId,
              assignedTo: responseAssignee,
              priority: "عالي",
              dueDate: data.nextHearingDate,
            }, reqUser.id);
            await notifyFieldTaskCreated(task, reqUser); // D4
            createdTasks.push({ type: "prepare_response", id: task.id, description: "مهمة إعداد الرد" });

            // Body moved to createResponseMemoForCase (verbatim) so the
            // opponent-response flow creates the identical memo instead of a
            // second implementation.
            const memo = await createResponseMemoForCase(existingCase, {
              hearingId: newSessionHearingId || hearingId,
              nextHearingDate: data.nextHearingDate,
              autoGenerateReason: "موعد_جديد_مع_رد",
            });
            createdMemos.push({ type: "response_memo", id: memo.id, description: "مذكرة جوابية تلقائية" });

            // Memo has been created — clear the deferred flag so adding a
            // future hearing doesn't trigger the deferred-memo path again.
            await storage.updateHearing(hearingId, { memoRequired: false });
          }
        }

        // ==================== PATH B: JUDGMENT (حكم) ====================
        else if (data.result === HearingResult.JUDGMENT) {
          // Everything about the judgment MODEL — outcome present, case on a
          // court stage, objectionability answered, degree derived, finality
          // computed — was validated up front, BEFORE the hearing was mutated.
          // Here we only branch on the already-derived finality.
          //   isFinal true  → استئنافي ruling, OR a first-instance ruling that is
          //                   not objectionable → محكوم_حكم_نهائي.
          //   isFinal false → objectionable first-instance ruling →
          //                   محكوم_حكم_ابتدائي, which opens the صك / objection /
          //                   appeal path.
          const isFinal = judgmentDerivedFinal;

          // ==================== سجل الأحكام — THE JUDGMENT ROW (batch 2) ====================
          // 🔴 THE HOOK POINT. This is the one place in the codebase where a
          // genuine ruling comes into existence from a session, and it sits at the
          // TOP of PATH B — before either stage branch — so both a first-instance
          // and an appeal ruling are recorded by one call rather than by two
          // copies that could drift.
          //
          // It fires ONLY on a genuine judgment, on three independent counts:
          //   1. PATH B is `data.result === HearingResult.JUDGMENT`, so no other
          //      hearing result reaches here.
          //   2. Everything the row needs was VALIDATED BEFORE ANY MUTATION at the
          //      top of the handler — outcome present, the case on a court stage
          //      (promoted if not), objectionability answered for a first-instance
          //      ruling. A request that would have produced a half-formed judgment
          //      has already 400'd.
          //   3. RE-SAVE IS A NO-OP. recordJudgment is idempotent on hearingId: a
          //      judgment already referencing this hearing is returned untouched
          //      and nothing is written. This matters because the hearing REPORT
          //      and result DETAILS are editable after recording — re-saving a
          //      hearing whose result is already حكم must not mint a second ruling
          //      or reset the deed mirror. (Changing the result TYPE was
          //      deliberately never built; the sanctioned path for a wrong type is
          //      to cancel the hearing and record a new one, which produces a new
          //      hearing id and therefore correctly a new ruling.)
          //
          // The three properties come from the values already derived up front, so
          // the row and the stage decision cannot disagree:
          //   degree      — from the case's stage at judgment time (منظورة_استئناف
          //                 → استئنافي, else ابتدائي), via the shared helper.
          //   isFinal     — judgmentDerivedFinal, the same value written to
          //                 hearings.judgment_final.
          //   opensWindow — a first-instance ruling the lawyer marked objectionable.
          //                 An appeal ruling never opens a window.
          //
          // 🔴 NOTHING READS THIS ROW YET. The stage branches below are unchanged
          // and still decide everything; this is a parallel record being built up
          // for batch 3. Its one visible effect is the mirror refresh inside the
          // service's transaction, which clears the case's صك scalars because the
          // NEW ruling has no deed yet — see the report.
          const judgmentDegree = judgmentDegreeForStage(
            judgmentIsAppealRuling ? "منظورة_استئناف" : existingCase.currentStage,
          );
          // 🔴 RESOLVED BEFORE recordJudgment, and the ORDER IS THE POINT.
          // currentJudgmentFor returns the HIGHEST sequence; the moment the new row
          // is inserted that is the new row itself, so asking afterwards would have
          // the remand supersede ITSELF. Only fetched when remanding — an ordinary
          // ruling costs no extra query.
          //
          // ⚠ NO PRIOR RULING IS NOT AN ERROR HERE, and this deliberately diverges
          // from POST /appeal-ruling, which 400s in that case. That endpoint has
          // nothing else to go on; this one is recording a session that HAPPENED,
          // and the handler's standing principle is to repair or proceed rather
          // than refuse a fact (the same reason the blocking guard at judgment time
          // was replaced by silent promotion). A case reaching منظورة_استئناف with
          // no ruling on record is a data gap, and refusing to record the appeal
          // ruling would neither close the gap nor let the court's decision be
          // filed. The remand still records; only the stamp is skipped.
          const supersededJudgment = judgmentRemands
            ? await currentJudgmentFor(effectiveCaseId)
            : undefined;
          await recordJudgment({
            caseId: effectiveCaseId,
            hearingId,
            degree: judgmentDegree,
            // 🔴 THE OUTCOME IS KEPT ON A REMAND (owner decision). This is where
            // the hearing path is deliberately RICHER than POST /appeal-ruling,
            // which writes outcome NULL on a quash because it treats a remand as
            // purely procedural. Recorded from a session we attended, both facts
            // are known — which way the appeal court went AND that it sent the
            // case back — so both are stored.
            //
            // ⚠ THIS IS WHY appealRulingPayload IS NOT REUSED HERE. Three of its
            // four outputs (degree, isFinal, opensWindow) are already computed
            // identically by the derivation above; the fourth is the outcome, and
            // it returns null for exactly this case. Calling it and then
            // overwriting that one field would be a reuse that hides an override.
            // appealRulingTargetStage IS reused, below, where it fits exactly.
            outcome: judgmentType,
            isFinal: judgmentDerivedFinal,
            opensWindow: !judgmentIsAppealRuling && data.objectionFeasible === true,
            recordedBy: reqUser.id,
            // The remand marker: superseded_at + superseded_by_judgment_id land on
            // the ruling that WAS returned, pointing at this one. No new column —
            // "did this ruling remand?" is that reverse pointer, exactly the model
            // POST /appeal-ruling already established.
            //
            // Re-saving is safe: recordJudgment is idempotent on hearingId, so a
            // second save returns the existing row and re-stamps nothing.
            supersedesJudgmentId: supersededJudgment?.id ?? null,
          });

          // PLEADINGS ARE OVER once a ruling issues — the case's still-open memos
          // were already cancelled by the UNIVERSAL block above (hoisted out of
          // here so EVERY hearing result does it, not only a judgment), with the
          // OBJECTION excluded and the "صدور حكم" wording on the reason. Nothing
          // to do here; see that block for the ordering guarantees.

          if (judgmentRemands) {
            // === إعادة للدرجة الأولى — THE CASE GOES BACK, IT DOES NOT END ===
            //
            // Placed BEFORE the isFinal arm and not inside it, because a remand is
            // isFinal TRUE (an appeal ruling is final by nature — that is what
            // judgmentDerivedFinal forces) while being the one final ruling that
            // does not finish the case. Reading `isFinal` as "the case is over" is
            // exactly the conflation this arm exists to break. The first-instance
            // arm below is unreachable from here and untouched: judgmentRemands
            // requires judgmentIsAppealRuling.
            //
            // 🔴 THE STAGE IS COMPUTED SERVER-SIDE, from the answer, via the SHARED
            // appealRulingTargetStage — the same function POST /appeal-ruling uses,
            // so the two doors into a remand cannot land a case on different
            // stages. The request body carries a BOOLEAN and never a stage.
            const remandStage = appealRulingTargetStage(AppealRulingOutcome.REMANDED_FIRST_INSTANCE);
            caseUpdate.currentStage = remandStage;
            // 🔴 CLEAR isSettlementCase (owner decision). getStagesForClassification
            // consults this flag FIRST for an in-court case and returns the
            // three-stage InCourtSettlementStages — [استلام, مداولة_الصلح, تحصيل] —
            // which does not contain منظورة. Writing منظورة while the flag stands
            // lands the case OFF ITS OWN RESOLVED PATH, the data-shaped version of
            // the bug that stranded case 4870079661. The owner's reasoning is that
            // the flag is stale by definition here: a case that genuinely settled
            // never reaches منظورة at all, let alone an appeal. Same precedent as
            // POST /api/cases/:id/reopen, which clears it when منظورة is chosen.
            caseUpdate.isSettlementCase = false;
            caseUpdate.stageHistory = stageHistoryFor(
              remandStage,
              `حكم استئنافي ${judgmentType} — إعادة الدعوى للدرجة الأولى`,
            );
            await storage.updateCase(effectiveCaseId, caseUpdate);

            // NO COLLECTION OR EXECUTION TASK, for any outcome — including لصالحنا.
            // Both tasks exist to enforce a judgment, and a remanded case has none
            // to enforce: it is going back for a NEW first-instance ruling. This is
            // not a preference, it is a hazard avoided — completing a collection
            // task fires maybeCloseCaseAfterPostJudgmentTasks, which would close a
            // LIVE case sitting at منظورة with تم_التحصيل. POST /appeal-ruling
            // likewise creates no task on a remand.
            //
            // AND NO AUTO-CLOSE ON ضدنا. The ضدنا arm below closes the case on the
            // stated reasoning that "a FINAL judgment AGAINST US leaves nothing to
            // do: no collection, no execution, and — because it is final — no
            // objection and no appeal." Every one of those premises is false under
            // a remand: the case has been returned for reconsideration, so there is
            // a great deal to do. ضدنا + إعادة is a live case, not a closed one.
            //
            // NO OBJECTION MEMO either, and nothing was needed to prevent one:
            // opensWindow is false for every appeal ruling, and the memo is created
            // by the صك-receipt flow off that flag. The case's prior pleadings were
            // already cancelled by the UNIVERSAL block above with the لائحة
            // اعتراضية excluded — correct here, since a filed objection is a real
            // document that a remand does not un-file (batch 4's decision).
            await logCaseActivityActing(req, {
              caseId: effectiveCaseId,
              userId: reqUser.id,
              userName: reqUser.name || reqUser.id,
              actionType: "appeal_ruling_remanded",
              title: `حكم الاستئناف — إعادة الدعوى للدرجة الأولى (${judgmentType})`,
              previousValue: "منظورة_استئناف",
              newValue: remandStage,
              details: JSON.stringify({
                outcome: judgmentType,
                supersededJudgmentId: supersededJudgment?.id ?? null,
                hearingId,
              }),
              relatedEntityType: "hearing",
              relatedEntityId: hearingId,
            });
          } else if (isFinal) {
            // === FINAL JUDGMENTS — the case RESTS at محكوم_حكم_نهائي ===
            // Judgment-lifecycle step 1 (owner decision). Previously this block
            // wrote محكوم_حكم_نهائي and then IMMEDIATELY overwrote it in a second,
            // non-atomic updateCase — with تحصيل for لصالحنا/جزئي, or with مقفلة
            // for ضدنا — so the case never actually rested on the judgment stage
            // and a failure between the two writes stranded it. Both auto-moves
            // are REMOVED: the stage is now written ONCE, with its stage-history
            // entry, and the case stays there.
            //   • لصالحنا/جزئي → REST here. The post-judgment tasks below drive
            //     the close (maybeCloseCaseAfterPostJudgmentTasks) once collection
            //     — and execution, when both exist — are complete.
            //   • ضدنا → REST here only momentarily: a FINAL judgment against us
            //     leaves nothing to do, so it AUTO-CLOSES immediately below.
            // تحصيل remains a STAGE for the SETTLEMENT path only (مداولة_الصلح →
            // تحصيل); judgments no longer route through it.
            //
            // NOTE the two writes here are NOT the old non-atomic auto-move: the
            // judgment stage is written and PERSISTS for لصالحنا/جزئي, and for
            // ضدنا the second write is a genuine, separately-recorded closure with
            // its own history entry — not a stage the case never occupied.
            // Converted onto the shared appendStageHistory closure — same entry
            // this branch always wrote (it was one of the only two that did),
            // just no longer hand-rolled. Identical output for a non-delegated
            // actor; see the actor note where stageHistoryFor is defined.
            caseUpdate.currentStage = "محكوم_حكم_نهائي";
            caseUpdate.stageHistory = stageHistoryFor("محكوم_حكم_نهائي", `حكم نهائي ${judgmentType}`);
            await storage.updateCase(effectiveCaseId, caseUpdate);

            if (judgmentType === "لصالحنا" || judgmentType === "جزئي") {
              // Auto-create collection task → per-type assignee ("" if unset/inactive)
              const allUsers = await storage.getAllUsers();
              const assignments = await storage.getAdminSupportTaskAssignments();
              const collectionAssignee = resolveAdminSupportAssignee(AssignableAdminSupportTaskKind.COLLECTION, assignments, allUsers);
              const collectionTask = await storage.createFieldTask({
                title: `${CollectionTaskTitlePrefix} — قضية رقم ${existingCase.caseNumber}`,
                description: `صدر حكم نهائي ${judgmentType} - يرجى إعداد خطاب تحصيل`,
                taskType: "متابعة_محكمة",
                caseId: effectiveCaseId,
                assignedTo: collectionAssignee,
                priority: "عاجل",
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              }, reqUser.id);
              await notifyFieldTaskCreated(collectionTask, reqUser); // D4
              createdTasks.push({ type: "collection_task", id: collectionTask.id, description: "مهمة إعداد خطاب تحصيل" });

              // Execution fires ONLY for a final FOR-US judgment (لصالحنا), NOT
              // جزئي — ALONGSIDE the collection task above. Same live routing via
              // the execution mapping key (assignee → own task; unset → the
              // branch_manager's unassigned pool). Collection is left unchanged.
              if (judgmentType === "لصالحنا") {
                const executionAssignee = resolveAdminSupportAssignee(AssignableAdminSupportTaskKind.EXECUTION, assignments, allUsers);
                const executionTask = await storage.createFieldTask({
                  title: `${ExecutionTaskTitlePrefix} — قضية رقم ${existingCase.caseNumber}`,
                  description: `صدر حكم نهائي لصالحنا - يرجى رفع طلب تنفيذ في محكمة التنفيذ`,
                  taskType: "متابعة_محكمة",
                  caseId: effectiveCaseId,
                  assignedTo: executionAssignee,
                  priority: "عاجل",
                  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                }, reqUser.id);
                await notifyFieldTaskCreated(executionTask, reqUser); // D4
                createdTasks.push({ type: "execution_task", id: executionTask.id, description: "مهمة رفع طلب تنفيذ" });
              }
              // NO stage move here. The case rests at محكوم_حكم_نهائي and is
              // closed by maybeCloseCaseAfterPostJudgmentTasks once these task(s)
              // are resolved — both of them when لصالحنا created two.
            } else if (judgmentType === "ضدنا") {
              // A FINAL judgment AGAINST US leaves nothing to do: no collection,
              // no execution, and — because it is final — no objection and no
              // appeal. So it AUTO-CLOSES (owner decision 2026-07-27), partially
              // restoring what b41553a removed but ONLY for this one outcome.
              //
              // SCOPE: `isFinal` here means an appeal ruling OR a first-instance
              // ruling the lawyer marked NOT objectionable. A ضدنا judgment that
              // IS objectionable never reaches this branch — it takes the
              // محكوم_حكم_ابتدائي path below and rests there awaiting the صك and a
              // possible objection.
              //
              // The stage history keeps BOTH entries — the judgment written above
              // and this closure — so the record reads truthfully as "final
              // judgment against us, then closed", not as a case that teleported
              // to مقفلة.
              // 🔴 صك GATE ON THIS AUTOMATIC CLOSE (owner decision 2026-08-03).
              // The judgment stage was already written above and PERSISTS; only
              // the closure is deferred. The case rests at محكوم_حكم_نهائي
              // awaiting its صك and closes by hand once the file is attached.
              //
              // ⚠ NOTE THE ASYMMETRY WITH THE POST-JUDGMENT AUTO-CLOSE: a ضدنا
              // final judgment creates NO collection or execution task, so there
              // is no task-completion event and the deed-attachment re-evaluation
              // (which routes through maybeCloseCaseAfterPostJudgmentTasks, and
              // that helper requires at least one post-judgment task) does NOT
              // pick this one up. Closing it is therefore a MANUAL step, which is
              // acceptable precisely because the case is not hidden: it rests on a
              // stage that is visible in the list and carries the
              // "بانتظار إرفاق الصك" badge added in this commit.
              //
              // 🔴 NO SCOPE TEST HERE, AND THAT IS THE FIX — it used to call
              // caseReachedJudgmentStage(existingCase) and that was WRONG, not
              // merely redundant. existingCase is read at the top of the handler
              // (:11594), BEFORE this branch writes محكوم_حكم_نهائي, so for a
              // first-instance ruling marked NOT objectionable — a case still at
              // منظورة with no judgment stage anywhere in its history — the test
              // returned FALSE and the case auto-closed with no deed. That is
              // precisely the 8-of-8 production population this batch is fixing,
              // so the widened helper alone would NOT have covered it.
              // Reaching this branch already means a judgment was just recorded
              // (result === حكم, isFinal, ضدنا), so scope is true by construction
              // and asking a stale copy of the row could only ever get it wrong.
              if (await isJudgmentDeedMissing(effectiveCaseId)) {
                console.warn("[hearing-result] ضدنا auto-close deferred — صك not attached", {
                  caseId: effectiveCaseId,
                });
              } else {
              const closedAtIso = new Date().toISOString();
              const closingHistory = Array.isArray(caseUpdate.stageHistory)
                ? caseUpdate.stageHistory
                : [];
              await storage.updateCase(effectiveCaseId, {
                currentStage: "مقفلة",
                // Set alongside the stage — the judgment closes used to write only
                // the stage, which left three route guards testing `status` able to
                // act on a closed case.
                status: "مغلق",
                closedAt: closedAtIso,
                closureReason: ClosureReason.JUDGMENT_AGAINST,
                stageHistory: [
                  ...closingHistory,
                  {
                    stage: "مقفلة",
                    timestamp: closedAtIso,
                    userId: "system",
                    userName: "النظام",
                    notes: "إغلاق تلقائي — حكم نهائي ضدنا",
                  },
                ],
              } as Partial<LawCase>);
              // Same cleanup every other close path runs — otherwise the closed
              // case keeps live hearings/memos/tasks emitting reminders.
              await cancelOpenCaseChildrenOnClose(effectiveCaseId);
              await logCaseActivityActing(req, {
                caseId: effectiveCaseId,
                userId: reqUser.id,
                userName: reqUser.name || reqUser.id,
                actionType: "case_closed",
                title: "إغلاق تلقائي — حكم نهائي ضدنا",
                previousValue: "محكوم_حكم_نهائي",
                newValue: "مقفلة",
              });
              } // end صك gate on the ضدنا auto-close
            }
          } else {
            // === PRIMARY (ابتدائي) JUDGMENTS ===
            // A primary judgment is NOT terminal — it can still be objected
            // to (لائحة اعتراضية) or escalated to appeal. Closure depends on
            // finality, not on which side won/lost: stay at محكوم_حكم_ابتدائي
            // for every judgmentType. The previous version closed the case
            // on (ضدنا + !needsAppeal), which broke the standard flow where
            // the lawyer plans to file an objection and supplies an
            // objectionDeadline.
            caseUpdate.currentStage = "محكوم_حكم_ابتدائي";
            caseUpdate.stageHistory = stageHistoryFor("محكوم_حكم_ابتدائي", `حكم ابتدائي ${judgmentType}`);
            await storage.updateCase(effectiveCaseId, caseUpdate);

            // THE OBJECTION MEMO IS NO LONGER CREATED HERE (step 2, owner
            // decision). It used to fire on (ضدنا|جزئي) + objectionIntended with
            // a today+30 deadline fallback — which is simply the wrong clock: the
            // objection window runs from the day the صك (written judgment) is
            // RECEIVED, which is days after this session. The memo is now created
            // by POST /api/cases/:id/judgment-deed (ensureObjectionMemoForCase)
            // with the real deadline = receiptDate + window.
            //
            // What still happens at judgment time is only the ASSESSMENT: the
            // lawyer's objectionFeasible checkbox is persisted onto the hearing
            // (:8271 above) and is the signal the receipt handler reads back.
            // The hearing's objection_deadline column is left alone as the
            // historical record of what was estimated at the session; it is no
            // longer authoritative for anything.
          }
        }

        // ==================== PATH C: STRUCK OFF (شطب) ====================
        else if (data.result === HearingResult.DISMISSAL) {
          const todayStr = new Date().toISOString().split("T")[0];
          const reopenDeadline = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          caseUpdate.currentStage = "مشطوبة";
          caseUpdate.struckOffDate = todayStr;
          caseUpdate.struckOffReopenDeadline = reopenDeadline;
          caseUpdate.stageHistory = stageHistoryFor("مشطوبة", `شطب الدعوى — الموعد النهائي لإعادة القيد: ${reopenDeadline}`);
          await storage.updateCase(effectiveCaseId, caseUpdate);

          await logCaseActivityActing(req, {
            caseId: effectiveCaseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            actionType: "stage_changed",
            title: `تم شطب القضية — الموعد النهائي لإعادة القيد: ${reopenDeadline}`,
          });

          // Notify department_head and primaryLawyerId
          const allUsers = await storage.getAllUsers();
          const notifyIds: string[] = [];
          if (existingCase.primaryLawyerId) notifyIds.push(existingCase.primaryLawyerId);
          const deptHead = allUsers.find((u: any) => u.departmentId === existingCase!.departmentId && u.role === "department_head" && u.isActive);
          if (deptHead) notifyIds.push(deptHead.id);

          for (const rid of Array.from(new Set(notifyIds))) {
            await storage.createNotification({
              type: "stage_changed",
              priority: "urgent",
              status: "pending",
              title: "تم شطب قضية",
              message: `تم شطب القضية رقم ${existingCase.caseNumber}. الموعد النهائي لإعادة القيد: ${reopenDeadline}. يرجى اتخاذ الإجراء المناسب.`,
              senderId: reqUser.id,
              senderName: reqUser.name || reqUser.id,
              recipientId: rid,
              relatedType: "case",
              relatedId: effectiveCaseId,
              requiresResponse: true,
            });
          }
        }

        // ==================== CONCILIATION: SETTLEMENT REACHED (تم_الصلح) ====================
        else if (data.result === HearingResult.SETTLEMENT_REACHED || (data.result === HearingResult.SETTLEMENT && data.conciliationResult === "تم_الصلح")) {
          // Auto-create collection task → per-type assignee ("" if unset/inactive)
          const allUsers = await storage.getAllUsers();
          const assignments = await storage.getAdminSupportTaskAssignments();
          const collectionAssignee = resolveAdminSupportAssignee(AssignableAdminSupportTaskKind.COLLECTION, assignments, allUsers);
          const collectionTask = await storage.createFieldTask({
            title: `${CollectionTaskTitlePrefix} — قضية رقم ${existingCase.caseNumber}`,
            description: `تم الصلح - يرجى إعداد خطاب تحصيل`,
            taskType: "متابعة_محكمة",
            caseId: effectiveCaseId,
            assignedTo: collectionAssignee,
            priority: "عاجل",
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          }, reqUser.id);
          await notifyFieldTaskCreated(collectionTask, reqUser); // D4
          createdTasks.push({ type: "collection_task", id: collectionTask.id, description: "مهمة إعداد خطاب تحصيل" });

          caseUpdate.currentStage = "تحصيل";
          caseUpdate.stageHistory = stageHistoryFor("تحصيل", "تم الصلح — انتقال لمرحلة التحصيل");
          await storage.updateCase(effectiveCaseId, caseUpdate);
        }

        // ==================== CONCILIATION: SETTLEMENT FAILED (لم_يتم_الصلح) ====================
        else if (data.result === HearingResult.SETTLEMENT_FAILED || (data.result === HearingResult.SETTLEMENT && data.conciliationResult === "لم_يتم_الصلح")) {
          // Settlement-only cases (started directly at مداولة_الصلح with
          // isSettlementCase=true) sit on InCourtSettlementStages, which
          // doesn't include أغلق_طلب_الصلح. The frontend must surface a
          // choice — close the case or convert it to the regular litigation
          // path — and forward the answer in afterFailedSettlementChoice.
          // Non-settlement cases ignore the param and follow the normal
          // path back to أغلق_طلب_الصلح.
          const choice = String(data.afterFailedSettlementChoice || "").toLowerCase();

          // DEFENDANT settlement failure — closes automatically, NO choice offered.
          //
          // Product decision (owner, final): when our client is the مدعى عليه a
          // failed settlement is not a fork in the road. The OPPONENT is the party
          // who files in court, and they may file late or never, so there is nothing
          // for us to "continue" into — the case simply closes and waits. The FE
          // therefore renders no إغلاق-نهائي/استكمال choice for defendants, and this
          // branch runs BEFORE the choice dispatch so the answer does not depend on
          // a radio that was never shown (a stale or hand-crafted
          // afterFailedSettlementChoice cannot route a defendant into litigation).
          //
          // Reuses the SAME close the "إغلاق القضية نهائياً" branch below performs —
          // same three fields, same settlement_failed_closed activity type — so the
          // defendant close is identical in shape, just automatic. The one addition
          // is closureReason: PART B's reopen guard keys on it to find cases that
          // closed because settlement failed. (The manual "إغلاق نهائي" branch below
          // deliberately still sets none.)
          //
          // SCOPED TO isSettlementCase ON PURPOSE. An IN_COURT defendant case that is
          // NOT settlement-only can also pass through مداولة_الصلح, and for that
          // cohort the existing design is correct and must not change: it moves to
          // أغلق_طلب_الصلح and PATCH /api/cases/:id auto-creates the جوابية memo
          // (shouldCreateSettlementFailedMemo). Closing those would break that path
          // and orphan the memo logic.
          const isDefendantSettlement =
            !!existingCase.isSettlementCase && existingCase.clientRole === "مدعى_عليه";

          if (isDefendantSettlement) {
            caseUpdate.currentStage = "مقفلة";
            caseUpdate.status = "مغلق";
            caseUpdate.closedAt = new Date().toISOString();
            caseUpdate.closureReason = ClosureReason.SETTLEMENT_FAILED;
            // taradiNumber / mohrNumber / taradiStatus / mohrStatus / clientRole
            // are all left untouched — the settlement record must survive for
            // history and for the PART B reopen. stageHistory is now APPENDED to
            // (it used to be listed here as "left untouched", which was true and
            // was the defect: the close became invisible to the record the reopen
            // and the progress bar both read).
            caseUpdate.stageHistory = stageHistoryFor("مقفلة", "لم يتم الصلح — إغلاق تلقائي (مدعى عليه) بانتظار رفع الخصم للدعوى");
            await storage.updateCase(effectiveCaseId, caseUpdate);
            await logCaseActivityActing(req, {
              caseId: effectiveCaseId,
              userId: reqUser.id,
              userName: reqUser.name || reqUser.id,
              actionType: "settlement_failed_closed",
              title: "لم يتم الصلح — أُغلقت القضية (مدعى عليه) بانتظار رفع الخصم للدعوى في المحكمة",
            });
          } else if (existingCase.isSettlementCase && choice === "close") {
            caseUpdate.currentStage = "مقفلة";
            caseUpdate.status = "مغلق";
            caseUpdate.closedAt = new Date().toISOString();
            caseUpdate.stageHistory = stageHistoryFor("مقفلة", "لم يتم الصلح — إغلاق القضية نهائياً");
            await storage.updateCase(effectiveCaseId, caseUpdate);
            await logCaseActivityActing(req, {
              caseId: effectiveCaseId,
              userId: reqUser.id,
              userName: reqUser.name || reqUser.id,
              actionType: "settlement_failed_closed",
              title: "لم يتم الصلح — تم إغلاق القضية نهائياً",
            });
          } else if (existingCase.isSettlementCase && choice === "continue") {
            // PLAINTIFF ONLY by construction — a defendant is intercepted by the
            // isDefendantSettlement branch above and never reaches here, so this
            // needs no role check of its own.
            //
            // Move the case off InCourtSettlementStages onto the regular
            // UnderStudy path so the progress bar resolves correctly. The
            // current stage أغلق_طلب_الصلح exists in the UnderStudy general
            // / commercial / labor arrays, and the resolver will pick the
            // right one from the case's department.
            const prevClassification = existingCase.caseClassification || "منظورة_بالمحكمة";
            caseUpdate.currentStage = "أغلق_طلب_الصلح";
            caseUpdate.isSettlementCase = false;
            caseUpdate.caseClassification = "قيد_الدراسة";
            caseUpdate.stageHistory = stageHistoryFor("أغلق_طلب_الصلح", "لم يتم الصلح — تحويل القضية لمسار التقاضي العادي");
            await storage.updateCase(effectiveCaseId, caseUpdate);
            await logCaseActivityActing(req, {
              caseId: effectiveCaseId,
              userId: reqUser.id,
              userName: reqUser.name || reqUser.id,
              actionType: "settlement_failed_continued",
              title: "لم يتم الصلح — تحويل القضية لمسار التقاضي العادي",
              previousValue: prevClassification,
              newValue: "قيد_الدراسة",
              details: JSON.stringify({
                stageFrom: "مداولة_الصلح",
                stageTo: "أغلق_طلب_الصلح",
                classificationFrom: prevClassification,
                classificationTo: "قيد_الدراسة",
              }),
            });
          } else {
            if (existingCase.isSettlementCase) {
              console.warn("[hearing-result] settlement-only case at لم_يتم_الصلح missing afterFailedSettlementChoice; defaulting to close", {
                caseId: effectiveCaseId,
              });
              caseUpdate.currentStage = "مقفلة";
              caseUpdate.status = "مغلق";
              caseUpdate.closedAt = new Date().toISOString();
              caseUpdate.stageHistory = stageHistoryFor("مقفلة", "لم يتم الصلح — إغلاق تلقائي (لم يُحدَّد إجراء ما بعد فشل الصلح)");
              await storage.updateCase(effectiveCaseId, caseUpdate);
              await logCaseActivityActing(req, {
                caseId: effectiveCaseId,
                userId: reqUser.id,
                userName: reqUser.name || reqUser.id,
                actionType: "settlement_failed_closed",
                title: "لم يتم الصلح — تم إغلاق القضية نهائياً (تلقائي)",
              });
            } else {
              // 🔴 THE INCIDENT BRANCH. This is the one that moved the three
              // production cases, and it was the most silent of the eleven stage
              // writes in this handler: no history entry AND no activity row —
              // the only branch here with neither. It is now guarded upstream
              // (a court-filed case never reaches it) and recorded when it does.
              caseUpdate.currentStage = "أغلق_طلب_الصلح";
              caseUpdate.stageHistory = stageHistoryFor("أغلق_طلب_الصلح", "لم يتم الصلح — العودة لمسار التقاضي");
              await storage.updateCase(effectiveCaseId, caseUpdate);
            }
          }
        }

        // ==================== CONCILIATION: SETTLEMENT LINK MISSING (لم_يصلنا_رابط_الصلح) ====================
        // Client never sent the conciliation-session link. Case STAYS on
        // مداولة_الصلح; we just pause it via the existing pause mechanism.
        // storage.pauseCase has no "already paused" guard (that lives in
        // the /pause route, which we bypass here), so calling it
        // unconditionally resets pausedAt → now and overwrites
        // pauseReason on repeat — implementing the "reset 15-day clock"
        // requirement — and writes the paused case_activity_log row in
        // the same transaction. The scheduler auto-closes after 15 days;
        // POST /api/hearings auto-unpauses when a new session is added.
        else if (data.result === HearingResult.SETTLEMENT_LINK_MISSING) {
          await storage.updateCase(effectiveCaseId, caseUpdate);
          try {
            await storage.pauseCase(effectiveCaseId, {
              reason: SETTLEMENT_LINK_MISSING_PAUSE_REASON,
              performedBy: reqUser.id,
              performerName: actorDisplayName(req.actingContext, effectiveCaseId, reqUser.name || reqUser.id),
            });
            await logCaseActivityActing(req, {
              caseId: effectiveCaseId,
              userId: reqUser.id,
              userName: reqUser.name || reqUser.id,
              actionType: "settlement_link_missing",
              title: "تم تعليق القضية تلقائياً بانتظار رابط جلسة الصلح",
            });
          } catch (e) {
            console.error("[hearing-result/settlement-link-missing] pause failed", e);
          }
        }

        // ==================== OTHER / DEFAULT ====================
        else {
          await storage.updateCase(effectiveCaseId, caseUpdate);
        }
      }

      if (createdTasks.length > 0) {
        await storage.updateHearing(hearingId, { adminTasksCreated: true });
      }

      // CLEARING PATH 2 — the session happened, so "مطلوب رد من الخصم" is settled
      // either way and the indicator goes off. Applies to EVERY result (judgment,
      // struck-off, settlement, jurisdiction, new session), which is what stops a
      // judged or closed case carrying the badge forever.
      //
      // Runs LAST, after the new hearing has been created and after this hearing's
      // flag was written. Spares exactly ONE row — opponentFlagHearingId, the
      // NEWEST hearing of the case: the newly created next session when there is
      // one, otherwise the hearing just recorded (when the box was ticked without
      // a next date). Everything older is unset.
      let clearedOpponentResponse = 0;
      if (effectiveCaseId) {
        clearedOpponentResponse = await clearOpponentResponseFlag(
          effectiveCaseId,
          [opponentFlagHearingId],
        );
      }

      // Re-read AFTER the sweep so the response carries the post-clear flag: the
      // client upserts this row straight into its cache, and a stale `true` would
      // leave the badge lit until the background refetch. The count is returned
      // so the client can invalidate the whole hearings query when OTHER rows of
      // the case were cleared too (the badge is `.some(...)` across all of them).
      const finalHearing = clearedOpponentResponse > 0
        ? ((await storage.getHearingById(hearingId)) || updatedHearing)
        : updatedHearing;

      // cancelledMemos is returned for the same reason clearedOpponentResponse is:
      // the cancelled rows are NOT in this response, and the cases-list badge is
      // derived from the client's memos cache — without an immediate invalidation
      // "مذكرة جارية" would linger until the background refetch.
      res.json({
        hearing: finalHearing,
        createdTasks,
        createdMemos,
        clearedOpponentResponse,
        cancelledMemos: cancelledPriorMemos,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error submitting hearing result:", error);
      res.status(500).json({ error: "حدث خطأ في تسجيل نتيجة الجلسة" });
    }
  });

  app.post("/api/hearings/:id/report", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!hearing.result) {
        return res.status(400).json({ error: "يجب تسجيل نتيجة الجلسة أولاً" });
      }

      // PHASE 1 — REPORT EDITING. This endpoint was ALREADY idempotent (no
      // re-record latch, no side effects, five plain column writes), so editing
      // needed no new endpoint — only the right gate on the right half.
      //
      // TWO GATES, split on whether this is the FIRST write or a CORRECTION, so no
      // existing capability is narrowed:
      //   • first submission (reportCompleted falsy) → canActOnHearing, EXACTLY as
      //     before. The attending lawyer keeps writing the report as they do today.
      //   • correction (reportCompleted already true) → canEditHearingRecord, the
      //     owner's three-tier rule with the hearing-day window for the two scoped
      //     tiers. NOT OR-ed with canActOnHearing: an attending lawyer who is not on
      //     the parent case must not get an unbounded edit right.
      const isReportEdit = !!hearing.reportCompleted;
      if (isReportEdit) {
        const gate = await canEditHearingRecord(req.user!, hearing, req.actingContext);
        if (!gate.allowed) {
          return res.status(gate.status).json({ error: gate.error });
        }
      } else if (!await canActOnHearing(req.user!, hearing, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }

      const data = hearingReportSchema.parse(req.body);

      const updated = await storage.updateHearing(hearingId, {
        hearingReport: data.hearingReport,
        recommendations: data.recommendations || "",
        nextSteps: data.nextSteps || "",
        contactCompleted: data.contactCompleted,
        reportCompleted: true,
      });

      // AUDIT — before/after into the case activity log. action_type is free text
      // (the committee_skipped / jurisdiction_transferred precedent), so this needs
      // no migration and no new column.
      const reportActor = req.user!;
      if (isReportEdit && hearing.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: hearing.caseId,
            userId: reportActor.id,
            userName: reportActor.name || reportActor.id,
            actionType: "hearing_report_edited",
            title: "تم تعديل تقرير الجلسة",
            details: JSON.stringify({
              hearingId,
              hearingDate: hearing.hearingDate,
              before: {
                hearingReport: hearing.hearingReport || "",
                recommendations: hearing.recommendations || "",
                nextSteps: hearing.nextSteps || "",
                contactCompleted: !!hearing.contactCompleted,
              },
              after: {
                hearingReport: data.hearingReport,
                recommendations: data.recommendations || "",
                nextSteps: data.nextSteps || "",
                contactCompleted: data.contactCompleted,
              },
            }),
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        } catch (e) {
          console.error("[hearing-report/edit] logCaseActivity failed", e);
        }
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error submitting hearing report:", error);
      res.status(500).json({ error: "حدث خطأ في حفظ تقرير الجلسة" });
    }
  });

  // ==================== PHASE 2 — SAFE-FIELD RESULT CORRECTION ====================
  // Corrects the two fields on a RECORDED result that drive no side effect.
  //
  // ⚠ THIS IS NOT "EDIT THE RESULT". Changing the result TYPE is deliberately NOT
  // built (owner decision): recording a result runs a cascade — stage writes,
  // field tasks, memo cancellations, a next hearing, notifications — much of which
  // cannot be cleanly undone (a completed collection task may already have
  // auto-closed the case; the لواحق memos were cancelled because the session
  // HAPPENED; sent notifications cannot be unsent). The answer for a genuinely
  // wrong result stays: CANCEL the hearing and record a new one.
  //
  // The re-record latch on POST /:id/result (`status !== قادمة`) is UNTOUCHED — it
  // is what stops that cascade running twice, and nothing here weakens it.
  app.patch("/api/hearings/:id/result-details", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!hearing.result) {
        return res.status(400).json({ error: "لا توجد نتيجة مسجلة لتعديلها" });
      }

      // Every field that DRIVES the cascade. Rejected BY NAME rather than stripped:
      // a silent strip would report success while changing nothing, which is how a
      // user ends up believing a wrong judgment was corrected.
      const CASCADE_FIELDS = [
        "result",
        "judgmentSide",
        "judgmentType",
        "judgmentFinal",
        "objectionFeasible",
        "nextHearingDate",
        "nextHearingTime",
        "responseRequired",
        "memoRequired",
        "opponentResponseRequired",
        "transferToDepartmentId",
        "afterFailedSettlementChoice",
        "conciliationResult",
        "caseId",
        "status",
      ];
      const offending = CASCADE_FIELDS.filter((f) =>
        Object.prototype.hasOwnProperty.call(req.body ?? {}, f));
      if (offending.length > 0) {
        return res.status(400).json({
          error: `لا يمكن تعديل هذه الحقول بعد تسجيل النتيجة: ${offending.join("، ")} — لتصحيح نتيجة خاطئة يُلغى موعد الجلسة وتُسجَّل جلسة جديدة`,
        });
      }

      const gate = await canEditHearingRecord(req.user!, hearing, req.actingContext);
      if (!gate.allowed) {
        return res.status(gate.status).json({ error: gate.error });
      }

      const data = hearingResultDetailsSchema.parse(req.body);

      // objectionDeadline is a JUDGMENT field. Sending it on any other result is a
      // client bug, so it is refused rather than ignored.
      if (data.objectionDeadline !== undefined && hearing.result !== HearingResult.JUDGMENT) {
        return res.status(400).json({ error: "مهلة الاعتراض تخص جلسات الحكم فقط" });
      }

      const patch: Record<string, unknown> = {};
      if (data.resultDetails !== undefined) patch.resultDetails = data.resultDetails;
      if (data.objectionDeadline !== undefined) patch.objectionDeadline = data.objectionDeadline || null;
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "لا يوجد ما يتم تعديله" });
      }

      const updated = await storage.updateHearing(hearingId, patch);

      const actor = req.user!;
      if (hearing.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: hearing.caseId,
            userId: actor.id,
            userName: actor.name || actor.id,
            actionType: "hearing_result_details_edited",
            title: "تم تعديل تفاصيل نتيجة الجلسة",
            details: JSON.stringify({
              hearingId,
              hearingDate: hearing.hearingDate,
              result: hearing.result,
              before: {
                resultDetails: hearing.resultDetails || "",
                objectionDeadline: hearing.objectionDeadline || null,
              },
              after: {
                resultDetails: data.resultDetails !== undefined
                  ? data.resultDetails : (hearing.resultDetails || ""),
                objectionDeadline: data.objectionDeadline !== undefined
                  ? (data.objectionDeadline || null) : (hearing.objectionDeadline || null),
              },
            }),
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        } catch (e) {
          console.error("[hearing-result-details/edit] logCaseActivity failed", e);
        }
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error editing hearing result details:", error);
      res.status(500).json({ error: "حدث خطأ في تعديل تفاصيل النتيجة" });
    }
  });

  // Mark the session report as exported — clears the admin_support
  // SESSION_REPORT_EXPORT task. This is the done-state toggle only; actual PDF
  // generation is a separate concern (see report). Allowed for the same actors
  // as the other hearing actions (attending lawyer / admin_support / branch_manager).
  app.post("/api/hearings/:id/mark-report-exported", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!await canActOnHearing(req.user!, hearing, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }
      if (!hearing.reportCompleted) {
        return res.status(400).json({ error: "يجب إكمال تقرير الجلسة أولاً" });
      }
      const updated = await storage.updateHearing(hearingId, { sessionReportExported: true });
      res.json(updated);
    } catch (error) {
      console.error("Error marking session report exported:", error);
      res.status(500).json({ error: "حدث خطأ في تحديث حالة تصدير التقرير" });
    }
  });

  // Agency-verification GROUP answer (sub-step 3) — the responsible lawyer answers
  // the weekend-aware "two days before hearing" verify task with يوجد / لا يوجد for
  // a WHOLE group at once. Same موكّل (exact client name) + same lawyer + same
  // pre-hearing window collapse into ONE task; a group of 1 is the normal single
  // case. The one answer applies to EVERY hearing in the group: either answer ends
  // each hearing's verify task (stamps agency_verification_ack_at=now + records the
  // answer). "لا يوجد" additionally generates, ONCE PER CASE, the admin_support
  // "إصدار وكالة" issuance task (idempotent on the case flag). Same actors as the
  // other hearing actions (attending lawyer / admin_support / branch_manager via
  // canActOnHearing) — every hearing in the group is gated before any write.
  app.post("/api/hearings/agency-verify-group", requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body ?? {};
      const answer = typeof body.answer === "string" ? body.answer : "";
      if (answer !== "يوجد" && answer !== "لا يوجد") {
        return res.status(400).json({ error: "قيمة الإجابة غير صحيحة" });
      }
      const hearingIds: string[] = Array.isArray(body.hearingIds)
        ? Array.from(new Set((body.hearingIds as unknown[]).map((x) => String(x)).filter(Boolean)))
        : [];
      if (hearingIds.length === 0) {
        return res.status(400).json({ error: "لم يتم تحديد أي جلسة" });
      }
      // Load + gate ALL hearings first: the group is only ever built from the
      // caller's own owned hearings, so a failure on any one means an invalid
      // request (404/403) — never a partial write.
      const loadedHearings: Hearing[] = [];
      for (const hid of hearingIds) {
        const hearing = await storage.getHearingById(hid);
        if (!hearing) return res.status(404).json({ error: "الجلسة غير موجودة" });
        if (!await canActOnHearing(req.user!, hearing, req.actingContext)) {
          return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
        }
        loadedHearings.push(hearing);
      }
      // Apply the answer to every hearing in the group (latch + recorded answer).
      const nowIso = new Date().toISOString();
      for (const hearing of loadedHearings) {
        await storage.updateHearing(hearing.id, {
          agencyVerificationAckAt: nowIso,
          agencyVerificationAnswer: answer,
        });
      }
      // "لا يوجد" → generate the admin_support issuance task ONCE PER CASE in the
      // group (a case can appear via >1 hearing → dedupe by caseId). Idempotent on
      // the FALSE→TRUE case-flag transition; create-first / latch-after so a
      // generation failure leaves the flag false to retry (logged, never a silent
      // stuck state, and never fails the answer already saved above). All cases in a
      // group share the same mapping, so the assignee is resolved once.
      if (answer === "لا يوجد") {
        const caseIds = Array.from(new Set(loadedHearings.map((h) => h.caseId).filter((c): c is string => !!c)));
        if (caseIds.length > 0) {
          const allUsers = await storage.getAllUsers();
          const assignments = await storage.getAdminSupportTaskAssignments();
          const issuanceAssignee = resolveAdminSupportAssignee(AssignableAdminSupportTaskKind.AGENCY_ISSUANCE, assignments, allUsers);
          const hearingByCase = new Map(loadedHearings.map((h) => [h.caseId, h]));
          for (const caseId of caseIds) {
            try {
              const parentCase = await storage.getCaseById(caseId);
              if (!parentCase || parentCase.agencyIssuanceRequested) continue;
              const hearing = hearingByCase.get(caseId);
              const issuanceTask = await storage.createFieldTask({
                title: `إصدار وكالة — قضية رقم ${parentCase.caseNumber}`,
                description: `لا توجد وكالة سارية على القضية قبل الجلسة - يرجى إصدار وكالة`,
                taskType: "متابعة_محكمة",
                caseId,
                assignedTo: issuanceAssignee,
                priority: "عاجل",
                dueDate: hearing?.hearingDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              }, req.user!.id);
              await notifyFieldTaskCreated(issuanceTask, req.user!);
              await storage.updateCase(caseId, { agencyIssuanceRequested: true });
            } catch (genErr) {
              console.error("Error generating agency issuance task for case", caseId, genErr);
            }
          }
        }
      }
      res.json({ success: true, count: loadedHearings.length });
    } catch (error) {
      console.error("Error answering agency verification (group):", error);
      res.status(500).json({ error: "حدث خطأ في تسجيل إجابة التحقق من الوكالة" });
    }
  });

  // ⚠ THIS ROUTE HAS NO UI, DELIBERATELY. Do not add a button back, and do not
  // delete it as dead code.
  //
  // The "إغلاق الجلسة" workflow step was REMOVED (owner decision 2026-08-04). It
  // wrote exactly one field — status → تمت — with no activity row, no notification
  // and no case cascade, and it was already unreachable for most hearings:
  // recording a result sets the status directly (موعد_جديد → مؤجلة, every other
  // result → تمت), and the button only rendered while status !== تمت. So it
  // governed POSTPONED hearings alone.
  //
  // ⚠ THE ضبط REQUIREMENT IT USED TO ENFORCE IS CURRENTLY ENFORCED BY NOTHING.
  // It moved to a case-close gate, which was then REVERTED the next day (owner
  // decision 2026-08-05: 83 cases would have been blocked on deploy, so the
  // backlog gets attached first). The ضبط is visible-but-optional for now — every
  // badge, filter, my-tasks item and workflow step still fires. The re-enable
  // steps live in CLAUDE.md under "📎 ATTACHMENTS". Restoring a button HERE is
  // not the way to bring enforcement back.
  //
  // WHY THE ROUTE STAYS: it is the ONLY writer of تمت for a postponed hearing, and
  // two live readers key on that status —
  //   routes.ts (lawyer performance stats)  filter(h => h.status === "تمت")
  //   scheduler.ts (weekly report)          same, over the last 7 days
  // Keeping it costs nothing, preserves the API path, and leaves those stats
  // reachable if a close affordance is ever wanted again.
  // POST /api/hearings/:id/check-in — "تحضير الجلسة".
  //
  // Records that a responsible actor has confirmed the session is prepared, with
  // WHO and WHEN. Body is empty — there is nothing to supply; the actor and the
  // instant are both derived server-side, so nothing here is client-forgeable.
  //
  // Gate is canCheckInHearing, NOT canActOnHearing — see that helper for why
  // admin_support is excluded and why the wider helper must not be reshaped.
  //
  // 🔴 SECOND CHECK-IN IS A NO-OP, NOT AN OVERWRITE AND NOT AN ERROR. The record
  // answers "who prepared this session first", and the first answer is the true
  // one — overwriting would let a later actor erase the original preparer (and,
  // once the later batches derive lateness, silently turn an on-time check-in
  // into a late one). A 400 was rejected because two people pressing تحضير
  // moments apart is NORMAL, not a mistake, and the second person should see
  // success: the session IS prepared. Returns the existing row unchanged with
  // alreadyCheckedIn: true so the client can stay quiet about it.
  app.post("/api/hearings/:id/check-in", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!await canCheckInHearing(req.user!, hearing, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية تحضير هذه الجلسة" });
      }

      // WRONG-STATE GUARDS. Deliberately only two, and both are about the
      // session no longer being ahead of us:
      //  • ملغية — a cancelled session will not be held, so preparing it is
      //    meaningless and the record would be misleading on the hearing.
      //  • a recorded RESULT — the session already happened. Recording
      //    preparation afterwards would be back-dating; the result itself is
      //    the evidence it was attended.
      // NOT guarded: مؤجلة (a postponed hearing keeps its own future date and is
      // legitimately prepared again), and hearing TYPE — تراضي / تسوية_ودية get
      // check-in like any other session (owner decision), unlike the ضبط rules
      // which exempt them because those sessions issue no minutes.
      if (hearing.status === HearingStatus.CANCELLED) {
        return res.status(400).json({ error: "لا يمكن تحضير جلسة ملغية" });
      }
      if (String(hearing.result || "").trim()) {
        return res.status(400).json({ error: "لا يمكن تحضير جلسة سُجّلت نتيجتها" });
      }

      if (hearing.checkedInAt) {
        return res.json({ hearing, alreadyCheckedIn: true });
      }

      const reqUser = req.user!;
      const updated = await storage.updateHearing(hearingId, {
        checkedInAt: new Date().toISOString(),
        checkedInBy: reqUser.id,
      });
      if (!updated) {
        return res.status(500).json({ error: "فشل تسجيل تحضير الجلسة" });
      }

      // 🔴 THE AUDIT ROW MUST NOT BE ABLE TO FAIL THE CHECK-IN. Isolated in its
      // own try/catch that only logs — same guarantee as the create notices and
      // the flag endpoint's own logging block. The check-in is already durable
      // by this point; losing its timeline entry is a strictly smaller failure
      // than refusing a preparation the user has made.
      //
      // Hearings have NO activity log of their own, so this writes to the PARENT
      // CASE's timeline guarded on hearing.caseId — the same precedent the ضبط
      // routes and the flag endpoint use. case_activity_log.action_type is free
      // text, so "hearing_checked_in" needs no migration.
      if (hearing.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: hearing.caseId,
            userId: reqUser.id,
            userName: reqUser.name || reqUser.id,
            actionType: "hearing_checked_in",
            title: `تم تحضير الجلسة بتاريخ ${hearing.hearingDate}`,
            relatedEntityType: "hearing",
            relatedEntityId: hearingId,
          });
        } catch (e) {
          console.error("[hearings/check-in] logCaseActivity failed", e);
        }
      }

      // 🔔 Stop the ring — the ACCELERATOR half. The authoritative half is the
      // data: checked_in_at is now set, so this hearing stops matching
      // /api/hearings/ring-state and every client's next poll ends the ring on
      // its own within 30s. This push just makes it immediate.
      //
      // sendToUser reaches ALL of that user's tabs (the registry is a Set per
      // user), so three tabs stop together. Best-effort by design: it is a
      // fire-and-forget in-memory fan-out with no failure mode worth failing a
      // durable check-in over, which is why it sits after the response is
      // already assured and is not awaited into the error path.
      // 🔴 THE ACTOR GETS IT TOO, AND THAT WAS THE BUG. This pushed to the
      // attending lawyer ALONE, but canCheckInHearing admits the attending
      // lawyer, the own-department department_head AND branch_manager — so
      // whenever anyone OTHER than the attending lawyer prepared a session,
      // the person who just clicked received nothing and kept ringing for up to
      // 30s while their toast said success. They pressed again, the endpoint
      // returned alreadyCheckedIn, and it said success again.
      //
      // 🔴 PURELY ADDITIVE — the attending lawyer STILL receives it when someone
      // else checks in for them; nobody's delivery was narrowed. The Set
      // de-duplicates the ordinary case where the actor IS the attending lawyer,
      // so that person gets one event rather than two.
      const ringStopRecipients = new Set<string>();
      if (hearing.attendingLawyerId) ringStopRecipients.add(hearing.attendingLawyerId);
      ringStopRecipients.add(reqUser.id);

      // 🔔 TIERS 2-4 — the case's department, every admin_support, every
      // branch_manager. They used to wait out their 30s poll, which is the same
      // complaint one tier down: a department member ringing for a session that
      // was prepared twenty seconds ago.
      //
      // 🔴 THE SAME TWO FUNCTIONS THE SCHEDULER AND THE ENDPOINT ALREADY USE —
      // storage.getRingRecipientCandidates for the roster and
      // resolveHearingRingTier for the membership test. NOT a second fan-out:
      // if the rule that decides who RINGS could ever diverge from the rule that
      // decides who STOPS, they eventually would, and someone would be left
      // ringing for a hearing that is already prepared. One rule, three callers.
      //
      // ⚠ NO WINDOW CHECK HERE, and that is deliberate rather than an omission.
      // The scheduler filters by isRingWindowOpen because it decides when a ring
      // STARTS; a stop has no such moment. Testing the window would (a) lose a
      // race against anyone whose tier opens between this query and the push, and
      // (b) buy nothing — checked_in_at is already set, so a recipient who was
      // not ringing re-derives an unchanged empty ring. The event is
      // content-free, so a spurious one costs exactly one invalidation.
      //
      // ⚠ THE TIER SCOPES ARE UNTOUCHED. admin_support and branch_manager remain
      // firm-wide by owner ruling — they are the cross-department safety net and
      // neither reliably carries a departmentId — so resolveHearingRingTier
      // admits them here exactly as it does in the ring itself. Nobody is
      // narrowed and nobody is widened.
      //
      // 🔴 TOTALLY FAIL-SAFE. The whole block sits in its own try/catch that only
      // logs, mirroring the activity-log guarantee directly above: the check-in
      // is already durable by this point, and a roster read that throws — or a
      // parent case that will not resolve — must never turn a preparation the
      // user has made into an error. The 30s poll remains the authoritative
      // stop, so the worst outcome of a failure here is the behaviour that
      // shipped before this commit.
      try {
        const parentCase = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
        const caseDepartmentId = parentCase?.departmentId ?? null;
        // Scoped to the ONE department that could tier-match, never getAllUsers;
        // an empty list still returns admin_support + branch_manager, which is
        // correct for a case whose department cannot be resolved.
        const candidates = await storage.getRingRecipientCandidates(
          caseDepartmentId ? [caseDepartmentId] : [],
        );
        for (const u of candidates) {
          const tier = resolveHearingRingTier(u, {
            attendingLawyerId: hearing.attendingLawyerId,
            caseDepartmentId,
          });
          if (tier) ringStopRecipients.add(u.id);
        }
      } catch (e) {
        console.error("[hearings/check-in] ring-stop tier fan-out failed — falling back to the poll", e);
      }

      for (const uid of Array.from(ringStopRecipients)) {
        sendToUser(uid, { type: "hearing:ring-stop", payload: { hearingId } });
      }

      res.json({ hearing: updated, alreadyCheckedIn: false });
    } catch (error) {
      console.error("[POST /api/hearings/:id/check-in] error:", error);
      res.status(500).json({ error: "حدث خطأ في تحضير الجلسة" });
    }
  });

  app.post("/api/hearings/:id/close", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!await canActOnHearing(req.user!, hearing, req.actingContext)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }
      if (!hearing.reportCompleted) {
        return res.status(400).json({ error: "يجب كتابة التقرير أولاً قبل إغلاق الجلسة" });
      }
      if (!hearing.contactCompleted) {
        return res.status(400).json({ error: "يجب تأكيد الاتصال بالعميل قبل إغلاق الجلسة" });
      }
      // The third condition, beside the two above (owner decision 2026-08-03): the
      // court's ضبط must be on file before the session is closed off.
      //
      // ⚠ NARROWER IN PRACTICE THAN IT LOOKS, and worth knowing before reading a
      // bug report about it: recording a result ALREADY sets status to تمت for
      // every result except موعد_جديد, which sets مؤجلة (routes.ts ~11400). So a
      // hearing that ruled / settled / was struck off is already "closed" by
      // status and never reaches this route — this gate effectively governs
      // POSTPONED hearings, the ones a human still closes by hand.
      // جلسات الصلح والتسوية issue no ضبط, so they are exempt (owner decision
      // 2026-08-04) — same shared predicate the badges, the filter and the
      // my-tasks emission use, so a settlement hearing that shows no "مطلوب
      // إرفاق ضبط الجلسة" badge is never blocked here either.
      if (!hearingProducesNoMinutes(hearing) && !(await storage.getHearingAttachment(hearingId))) {
        return res.status(400).json({ error: "يجب إرفاق ضبط الجلسة قبل إغلاق الجلسة" });
      }

      const updated = await storage.updateHearing(hearingId, {
        status: HearingStatus.COMPLETED,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error closing hearing:", error);
      res.status(500).json({ error: "حدث خطأ في إغلاق الجلسة" });
    }
  });

  // ==================== Field Tasks ====================

  app.get("/api/field-tasks", requireAuth, async (req: AuthRequest, res) => {
    try {
      // D5 (data-leak fix) — scope server-side so a browser never receives
      // field tasks (client names, case numbers) it isn't entitled to. Before
      // this, every task shipped to every browser and was filtered only
      // client-side. Scope mirrors the per-user task predicates:
      //   • branch_manager / admin_support (canAssignFieldTasks) → all tasks
      //     (the management view; includes the unassigned "" pool);
      //   • department_head → tasks on cases in their department (field tasks
      //     carry no departmentId, so this resolves via the parent case) + own
      //     + created;
      //   • everyone else → only tasks assigned TO them or created BY them.
      // The field-tasks page re-applies its own (canManage || own || createdBy)
      // filter, so the page itself stays unchanged for every role.
      const user = req.user!;
      const all = await storage.getAllFieldTasks();
      let scoped = all;
      if (canAssignFieldTasks(user.role)) {
        scoped = all;
      } else if (user.role === "department_head" && user.departmentId) {
        const cases = await storage.getAllCases();
        const deptCaseIds = new Set(
          cases.filter((c) => c.departmentId === user.departmentId).map((c) => c.id),
        );
        scoped = all.filter(
          (t) =>
            t.assignedTo === user.id ||
            t.assignedBy === user.id ||
            (!!t.caseId && deptCaseIds.has(t.caseId)),
        );
      } else {
        scoped = all.filter((t) => t.assignedTo === user.id || t.assignedBy === user.id);
      }
      res.json(scoped);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المهام الميدانية" });
    }
  });

  // Sub-step 9 — مهامي "منجزة" archive: closed (مكتمل + ملغي) GENERAL (عام)
  // tasks, scoped in storage to the viewer's feed visibility. Lazy — the FE only
  // calls this when the archive section is expanded, so it never bloats the 30s
  // my-tasks poll. Path has 2 segments after field-tasks (archive is a literal),
  // and is registered BEFORE /api/field-tasks/:id so :id never captures it.
  app.get("/api/field-tasks/archive", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const archived = await storage.getArchivedGeneralTasks({
        id: user.id, role: user.role, departmentId: user.departmentId,
      });
      res.json(archived);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المهام المنجزة" });
    }
  });

  // ITEM 1 — case-scoped field tasks: ALL field tasks on a case, gated by CASE
  // ACCESS (canViewCase, delegation-aware via req.actingContext — 4c-1). Whoever
  // can VIEW the case sees the case's complete task picture (the assigned lawyer
  // sees every task on their case, dept_head sees their dept's cases, managers
  // see all). This does NOT reopen D5: access is per-caseId, so a user still
  // can't reach tasks on cases they can't see. The general /api/field-tasks list
  // stays per-user scoped. (Path has 2 segments after field-tasks, so it never
  // collides with /api/field-tasks/:id.)
  app.get("/api/field-tasks/case/:caseId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const caseId = String(req.params.caseId);
      const parentCase = await storage.getCaseById(caseId);
      if (!parentCase) return res.status(404).json({ error: "القضية غير موجودة" });
      if (!canViewCase(user, parentCase, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض مهام هذه القضية" });
      }
      const tasks = await storage.getFieldTasksByCase(caseId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب مهام القضية" });
    }
  });

  app.get("/api/field-tasks/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const task = await storage.getFieldTaskById(String(req.params.id));
      if (!task) {
        return res.status(404).json({ error: "المهمة غير موجودة" });
      }
      // ITEM 2 — access check (was requireAuth-only, any user could fetch any
      // task by UUID). Allowed: the assignee, the creator, a manager
      // (canAssignFieldTasks), or anyone who can access the task's parent
      // case/consultation (delegation-aware). Mirrors the PATCH gate.
      let allowed =
        task.assignedTo === user.id ||
        task.assignedBy === user.id ||
        canAssignFieldTasks(user.role);
      if (!allowed && task.caseId) {
        const parentCase = await storage.getCaseById(task.caseId);
        allowed = !!parentCase && canViewCase(user, parentCase, req.actingContext);
      }
      if (!allowed && task.consultationId) {
        const parentConsultation = await storage.getConsultationById(task.consultationId);
        allowed = !!parentConsultation && canModifyConsultation(user, parentConsultation, req.actingContext);
      }
      if (!allowed) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه المهمة" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المهمة" });
    }
  });

  app.post("/api/field-tasks", requireAuth, async (req: AuthRequest, res) => {
    try {
      // PATH-2 (sub-step 5, FINAL rules) — dept-routed general (عام) task. A
      // non-empty routedDepartmentId marks "assign to a whole DEPARTMENT"
      // instead of a person; person-direct creation never sends it, so that path
      // (below) stays byte-identical. ANY role may dept-route (no role gate).
      const rawRoutedDept = typeof req.body?.routedDepartmentId === "string"
        ? req.body.routedDepartmentId.trim() : "";
      if (rawRoutedDept) {
        // Must be a real department. This also enforces "no dept-assign to
        // admin_support" — admin_support is not a department row, so its id (or
        // any bogus id) is rejected here.
        const dept = await storage.getDepartmentById(rawRoutedDept);
        if (!dept) {
          return res.status(400).json({ error: "القسم غير موجود" });
        }
        // Resolve the dept head. Authoritative source = the users query, NOT
        // departments.headId. Rules: exactly 1 → assign to that head; >1 → block
        // (data anomaly; never guess); 0 (head-less) → DO NOT block — create the
        // task routed + unassigned (assignedTo="") so it WAITS in بانتظار_التوزيع
        // until a head is appointed (then the dept-scoped feed surfaces it).
        const heads = await storage.getDepartmentHeads(rawRoutedDept);
        if (heads.length > 1) {
          return res.status(400).json({ error: "القسم له أكثر من رئيس قسم — يتعذّر تحديد المستلم" });
        }
        const head = heads.length === 1 ? heads[0] : null;
        // The shared insert schema requires a non-empty assignedTo; pass a
        // placeholder (the creator) to validate the rest of the body, then set
        // the REAL assignee below (head.id, or "" when head-less).
        const deptTaskData = insertFieldTaskSchema.parse({ ...req.body, assignedTo: head ? head.id : req.user!.id });
        if (deptTaskData.taskType !== FieldTaskType.GENERAL) {
          return res.status(400).json({ error: "الإسناد إلى قسم متاح للمهام العامة فقط" });
        }
        const deptTask = await storage.createFieldTask({
          ...deptTaskData,
          assignedTo: head ? head.id : "",
          routedDepartmentId: rawRoutedDept,
          status: FieldTaskStatus.AWAITING_DISTRIBUTION,
        }, req.user!.id);
        return res.status(201).json(deptTask);
      }

      const validatedData = insertFieldTaskSchema.parse(req.body);

      // Validate assignedTo user is active
      if (validatedData.assignedTo) {
        const { valid } = await validateAssignedUsersActive([validatedData.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "الموظف المكلف غير نشط أو غير موجود" });
        }
      }

      // Phase 5 A2/L3 — assignedBy is the actor (who assigned the task); derive
      // from req.user, never the body. The FE already sends user.id, so the
      // stored value is unchanged.
      const assignedBy = req.user!.id;
      const newTask = await storage.createFieldTask(validatedData, assignedBy);
      res.status(201).json(newTask);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء المهمة" });
    }
  });

  app.patch("/api/field-tasks/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Validate assignedTo user is active if being changed
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = updateFieldTaskSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      // Phase 5 A2/M2 — was requireAuth-only (any user could mutate any task).
      // Permitted editors: the assignee (who legitimately starts/completes/
      // cancels their own task — they may not be on the parent case, so the
      // assignee check must come first), OR anyone who can modify the task's
      // parent case/consultation (overseers + admins via canModify*). A random
      // unrelated user now gets 403.
      const user = req.user!;
      const existingTask = await storage.getFieldTaskById(String(req.params.id));
      if (!existingTask) return res.status(404).json({ error: "المهمة غير موجودة" });
      let canModifyParent = false;
      if (existingTask.caseId) {
        const parentCase = await storage.getCaseById(existingTask.caseId);
        canModifyParent = !!parentCase && canModifyCase(user, parentCase, req.actingContext);
      } else if (existingTask.consultationId) {
        const parentConsultation = await storage.getConsultationById(existingTask.consultationId);
        canModifyParent = !!parentConsultation && canModifyConsultation(user, parentConsultation, req.actingContext);
      }
      // Flag 1 — a manager (branch_manager / admin_support) may ASSIGN an
      // UNASSIGNED ("" assignee) task even when it has no parent case/
      // consultation (the parentless unassigned pool surfaced in مهامي, e.g.
      // ft_7). Narrow: only when the task is currently unassigned AND this PATCH
      // sets a non-empty assignee. Delegation-aware via actingIdentitiesFor
      // (mirrors the cases-transfer manager check), so an all_cases delegate
      // standing in for a manager qualifies too.
      const managerIdentities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, existingTask.caseId ?? null)
        : [{ userId: user.id, role: user.role, departmentId: user.departmentId }];
      const actsAsManager = managerIdentities.some((i) => i.role === "branch_manager" || i.role === "admin_support");
      const isUnassignedAssign =
        existingTask.assignedTo === "" &&
        typeof req.body.assignedTo === "string" && req.body.assignedTo.length > 0 &&
        actsAsManager;
      if (existingTask.assignedTo !== user.id && !canModifyParent && !isUnassignedAssign) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      // Batch 1.5b — OBSERVE ONLY, after the gate has already passed. Nothing
      // below this line is conditional on it. Deliberately NOT applied to the
      // assign arm (isUnassignedAssign): handing out an unassigned task is a
      // manager action by design, not someone acting on another's task.
      if (!isUnassignedAssign) {
        const ownership = await resolveFieldTaskOwnerIds(existingTask);
        warnIfNotTaskOwner(req, {
          endpoint: "PATCH /api/field-tasks/:id",
          taskId: existingTask.id,
          taskType: ownership.taskType,
          rightfulOwnerIds: ownership.ownerIds,
          caseId: existingTask.caseId ?? null,
          assignedTo: existingTask.assignedTo,
        });
      }
      if (req.body.assignedTo) {
        const { valid } = await validateAssignedUsersActive([req.body.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "الموظف المكلف غير نشط أو غير موجود" });
        }
      }

      // Sub-step 4 + 7 — general (عام) complete-with-result, PATH-AWARE. A
      // finished general task does NOT close directly; where it goes depends on
      // how it was routed:
      //   PATH-2 (routedDepartmentId set) — the member's result goes UP to the
      //     dept_head of the routed department for approval (بانتظار_الاعتماد,
      //     assignedTo = head, workerId = worker). If the worker IS that head
      //     (distributed to himself in sub-step 6), his own approval is skipped
      //     and the result goes straight to the requester like path-1.
      //   PATH-1 (routedDepartmentId null) — unchanged sub-step-4 behavior: back
      //     to the ORIGINAL requester for review (بانتظار_الاطلاع, assignedTo →
      //     originalRequesterId, workerId = worker). EXCEPTION: a self-assigned
      //     task (worker IS requester) has nothing to review → closes (مكتمل).
      // Guarded on taskType === عام, so non-general field/auto/collection tasks
      // keep their exact current complete→مكتمل behavior.
      let updatePayload: Partial<FieldTask> = req.body;
      const isGeneralComplete =
        existingTask.taskType === FieldTaskType.GENERAL &&
        req.body.status === FieldTaskStatus.COMPLETED &&
        existingTask.status !== FieldTaskStatus.COMPLETED;
      if (isGeneralComplete) {
        const worker = user.id;
        // Robust to a missing return address: fall back to assignedBy (the
        // creator), exactly like the /review endpoint's legacy fallback, so the
        // self-assign skip compares worker === (originalRequesterId ?? assignedBy)
        // — never a raw null (a null requester must NEVER make a non-self task
        // close without review). Also HEAL the row by persisting the resolved
        // requester so a legacy/edge null can't recur on this task.
        const requester = existingTask.originalRequesterId || existingTask.assignedBy;
        const heal = existingTask.originalRequesterId ? {} : { originalRequesterId: requester };
        // Sub-step 7 — resolve the path-2 approver. Same authoritative source as
        // creation/distribute (the users query, never departments.headId). The
        // approval branch is taken ONLY for exactly one head who is not the
        // worker; a head-less (0) or multi-head (>1, a data anomaly the creation
        // gate normally blocks) department must NOT strand the task → fall
        // through to the path-1 requester routing so it can't get stuck.
        let approvalHeadId: string | null = null;
        if (existingTask.routedDepartmentId) {
          const heads = await storage.getDepartmentHeads(existingTask.routedDepartmentId);
          const workerIsHead = heads.some((h) => h.id === worker);
          if (!workerIsHead) {
            if (heads.length === 1) {
              approvalHeadId = heads[0].id;
            } else {
              console.error(`[field-tasks PATCH] dept-routed complete: routed department ${existingTask.routedDepartmentId} has ${heads.length} heads — routing task ${existingTask.id} to the requester instead of approval`);
            }
          }
          // workerIsHead → skip his own approval: fall through to requester.
        }
        updatePayload = approvalHeadId
          ? { ...req.body, ...heal, status: FieldTaskStatus.AWAITING_APPROVAL, assignedTo: approvalHeadId, workerId: worker }
          : worker === requester
          ? { ...req.body, ...heal, workerId: worker } // self-assigned → close normally
          : { ...req.body, ...heal, status: FieldTaskStatus.AWAITING_REVIEW, assignedTo: requester, workerId: worker };
      }

      const updated = await storage.updateFieldTask(String(req.params.id), updatePayload);
      if (!updated) {
        return res.status(404).json({ error: "المهمة غير موجودة" });
      }

      // Sub-step 4.6 — thread event: the worker submitted a result (إنجاز). Fires
      // for BOTH the return-to-review path and the self-assign→مكتمل path (any
      // general complete-with-result). Best-effort: never fail the completion.
      if (isGeneralComplete) {
        try {
          await createGeneralTaskEventActing(req, updated.caseId, {
            fieldTaskId: updated.id, actorId: user.id, actorName: user.name || user.id,
            eventType: GeneralTaskEventType.RESULT_SUBMITTED, body: updated.completionNotes || "",
          });
        } catch (e) {
          console.error("[field-tasks PATCH] general-task event write failed:", e);
        }
      }

      // D2 (action-hub write-back foundation) — completing a field task leaves
      // evidence on the linked case's activity log, so e.g. finishing a
      // collection letter is visible on the case. Fires only on the transition
      // INTO "مكتمل" (FieldTaskStatus.COMPLETED) and only for case-linked tasks.
      // completedAt itself is stamped server-side in storage.updateFieldTask
      // (D7). Best-effort: a logging failure must not fail the completion.
      // Task-type-specific write-backs (mark a hearing report exported, advance
      // a stage, collection→execution, the consultation-linked activity log)
      // are deferred to the action-hub UI increment — see report.
      if (existingTask.status !== "مكتمل" && updated.status === "مكتمل" && updated.caseId) {
        try {
          await logCaseActivityActing(req, {
            caseId: updated.caseId,
            userId: user.id,
            userName: user.name || user.id,
            actionType: "field_task_completed",
            title: `اكتملت مهمة ميدانية: ${updated.title}`,
          });
        } catch (e) {
          console.error("[field-tasks PATCH] case activity write-back failed:", e);
        }

        // Judgment-lifecycle step 1 — the FIRST of the write-backs the comment
        // above deferred. Completing a post-judgment task (collection letter /
        // execution request) on a case resting at محكوم_حكم_نهائي closes the case
        // once EVERY such task is resolved. Self-gating: the helper no-ops unless
        // the case is on that exact stage and post-judgment tasks exist, so an
        // ordinary field task — or a collection task on the SETTLEMENT path,
        // whose stage is تحصيل — never triggers it. Best-effort inside.
        await maybeCloseCaseAfterPostJudgmentTasks(req, updated.caseId, user);
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث المهمة" });
    }
  });

  // Sub-step 4 — PATH-1 requester review of a returned general (عام) task.
  // A worker's completed result lands in بانتظار_الاطلاع assigned to the ORIGINAL
  // requester (see the PATCH general-complete branch above). Only that requester
  // — or a delegate acting on their behalf — may act. Two decisions:
  //   • تم_الاطلاع (close) → مكتمل (terminal; completedAt stamped in storage).
  //   • ملاحظة (send back) → قيد_الانتظار back to the worker (workerId), reviewNote
  //     = the note (required). Mirrors the consultation/memo review endpoints.
  app.post("/api/field-tasks/:id/review", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const bodyCheck = generalTaskReviewSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const reviewNote = String(req.body?.reviewNote || "");

      const task = await storage.getFieldTaskById(String(req.params.id));
      if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });
      if (task.taskType !== FieldTaskType.GENERAL) {
        return res.status(400).json({ error: "هذا الإجراء خاص بالمهام العامة فقط" });
      }
      if (task.status !== FieldTaskStatus.AWAITING_REVIEW) {
        return res.status(400).json({ error: "المهمة ليست بانتظار الاطلاع" });
      }
      // Only the ORIGINAL requester (or a delegate standing in for them) may
      // review. originalRequesterId is the write-once return address; a legacy
      // general task created before it existed falls back to assignedBy.
      const requester = task.originalRequesterId || task.assignedBy;
      const actingIds = req.actingContext
        ? actingIdentitiesFor(req.actingContext, task.caseId ?? null).map((i) => i.userId)
        : [user.id];
      if (!actingIds.includes(requester)) {
        return res.status(403).json({ error: "لا تملك صلاحية مراجعة هذه المهمة" });
      }

      if (decision === "تم_الاطلاع") {
        // Close — completedAt is stamped in storage.updateFieldTask on the
        // transition into مكتمل.
        const updated = await storage.updateFieldTask(task.id, { status: FieldTaskStatus.COMPLETED });
        // Mirror the PATCH→مكتمل case-activity write-back: a case-linked general
        // task leaves "اكتملت مهمة ميدانية" evidence on its case when the requester
        // closes it. Best-effort (caseId-guarded) — a logging failure must not
        // fail the close. caseId-less general tasks just close silently.
        if (updated?.caseId) {
          try {
            await logCaseActivityActing(req, {
              caseId: updated.caseId,
              userId: user.id,
              userName: user.name || user.id,
              actionType: "field_task_completed",
              title: `اكتملت مهمة ميدانية: ${updated.title}`,
            });
          } catch (e) {
            console.error("[field-tasks review] case activity write-back failed:", e);
          }
        }
        // Sub-step 4.6 — thread event: requester closed (تم الاطلاع), no text.
        try {
          await createGeneralTaskEventActing(req, task.caseId, {
            fieldTaskId: task.id, actorId: user.id, actorName: user.name || user.id,
            eventType: GeneralTaskEventType.REVIEWED_CLOSED, body: null,
          });
        } catch (e) {
          console.error("[field-tasks review] general-task event write failed:", e);
        }
        return res.json(updated);
      }
      if (decision === "ملاحظة") {
        if (!reviewNote.trim()) {
          return res.status(400).json({ error: "الملاحظة مطلوبة عند الإعادة" });
        }
        // Send back to the worker who produced the result (workerId), not to the
        // requester; the note rides along in reviewNote.
        const updated = await storage.updateFieldTask(task.id, {
          status: FieldTaskStatus.PENDING,
          assignedTo: task.workerId || task.assignedTo,
          reviewNote,
        });
        // Sub-step 4.6 — thread event: requester sent it back with a note (ملاحظة).
        try {
          await createGeneralTaskEventActing(req, task.caseId, {
            fieldTaskId: task.id, actorId: user.id, actorName: user.name || user.id,
            eventType: GeneralTaskEventType.RETURNED_WITH_NOTE, body: reviewNote,
          });
        } catch (e) {
          console.error("[field-tasks review] general-task event write failed:", e);
        }
        return res.json(updated);
      }
      return res.status(400).json({ error: "قرار المراجعة غير صحيح" });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في مراجعة المهمة" });
    }
  });

  // Sub-step 6 — dept_head DISTRIBUTES a dept-routed general (عام) task that is
  // sitting in بانتظار_التوزيع to a member of the routed department (or himself).
  // The task then moves to that member as a normal do-the-work GENERAL_TASK in
  // قيد_الانتظار, with routedDepartmentId intact (so the result later routes back
  // through the head for approval — sub-step 7). workerId stays null until the
  // member completes. Access: a dept_head of the routed department, a delegate
  // acting for such a head, or a branch_manager.
  app.post("/api/field-tasks/:id/distribute", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const bodyCheck = generalTaskDistributeSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const assignTo = String(req.body?.assignedTo || "").trim();
      if (!assignTo) {
        return res.status(400).json({ error: "اختر المسند إليه" });
      }

      const task = await storage.getFieldTaskById(String(req.params.id));
      if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });
      if (task.taskType !== FieldTaskType.GENERAL) {
        return res.status(400).json({ error: "هذا الإجراء خاص بالمهام العامة فقط" });
      }
      if (!task.routedDepartmentId) {
        return res.status(400).json({ error: "هذه المهمة ليست موجَّهة إلى قسم" });
      }
      if (task.status !== FieldTaskStatus.AWAITING_DISTRIBUTION) {
        return res.status(400).json({ error: "المهمة ليست بانتظار الإسناد" });
      }

      // Access gate — delegation-aware. A branch_manager (firm-wide), or a
      // dept_head of the ROUTED department (the delegator's own dept travels with
      // the inherited dept_head role via effectiveDeptHeadDepts). With no acting
      // context the helpers resolve to exactly the actor's own role/dept.
      const ctx = req.actingContext;
      const scopeCaseId = task.caseId ?? null;
      const isManager = ctx
        ? hasEffectiveRole(ctx, scopeCaseId, "branch_manager")
        : user.role === "branch_manager";
      const isRoutedHead = ctx
        ? effectiveDeptHeadDepts(ctx, scopeCaseId).has(task.routedDepartmentId)
        // !!user.departmentId — routedDepartmentId is nullable, so an unrouted task
        // must not be claimable by a department_head with no department of their own.
        : (user.role === "department_head" && !!user.departmentId && user.departmentId === task.routedDepartmentId);
      if (!isManager && !isRoutedHead) {
        return res.status(403).json({ error: "لا تملك صلاحية إسناد هذه المهمة" });
      }

      // The chosen assignee must be an ACTIVE user who is either a member of the
      // routed department OR the actor himself (the "distribute to myself" edge —
      // a head whose own departmentId is the routed dept already qualifies via
      // the first clause; the id clause also covers a manager picking himself).
      const assignee = await storage.getUser(assignTo);
      if (!assignee || !assignee.isActive) {
        return res.status(400).json({ error: "الموظف المكلف غير نشط أو غير موجود" });
      }
      if (assignee.departmentId !== task.routedDepartmentId && assignee.id !== user.id) {
        return res.status(400).json({ error: "يجب اختيار عضو من القسم الموجَّهة إليه المهمة" });
      }

      // Hand the task to the member: assignedTo = chosen member, status =
      // قيد_الانتظار. routedDepartmentId + workerId(null) untouched (partial set).
      const updated = await storage.updateFieldTask(task.id, {
        assignedTo: assignTo,
        status: FieldTaskStatus.PENDING,
      });

      // Thread event: DISTRIBUTED — actor = the distributing head; body notes the
      // member it went to (best-effort; a logging failure must not fail the op).
      try {
        await createGeneralTaskEventActing(req, task.caseId, {
          fieldTaskId: task.id, actorId: user.id, actorName: user.name || user.id,
          eventType: GeneralTaskEventType.DISTRIBUTED,
          body: `إلى: ${assignee.name || assignee.id}`,
        });
      } catch (e) {
        console.error("[field-tasks distribute] general-task event write failed:", e);
      }
      return res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إسناد المهمة" });
    }
  });

  // Sub-step 8 — dept_head APPROVES or RETURNS a member's result on a
  // dept-routed general (عام) task sitting in بانتظار_الاعتماد (put there by the
  // sub-step-7 complete routing). Mirrors /review and /distribute. Two decisions:
  //   • اعتماد (approve, DEFAULT, no text) → بانتظار_الاطلاع assigned to the
  //     ORIGINAL requester; workerId unchanged. The existing requester-review
  //     (GENERAL_TASK_REVIEW) flow takes over. Writes an APPROVED (اعتماد) event.
  //   • ملاحظة (send back, note REQUIRED) → قيد_الانتظار back to the member who
  //     produced it (workerId), reviewNote = the note. The member fixes and
  //     re-completes, which sub-step 7 routes back to بانتظار_الاعتماد for
  //     approval AGAIN (the loop is automatic). Writes a RETURNED_WITH_NOTE
  //     (ملاحظة) event — same type as the requester's send-back; the actor name
  //     distinguishes who returned it.
  // Access gate: a dept_head of the task's routedDepartmentId (delegation-aware),
  // or a branch_manager — identical to /distribute.
  app.post("/api/field-tasks/:id/approve", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const bodyCheck = generalTaskApproveSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const decision = String(req.body?.decision || "");
      const reviewNote = String(req.body?.reviewNote || "");

      const task = await storage.getFieldTaskById(String(req.params.id));
      if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });
      if (task.taskType !== FieldTaskType.GENERAL) {
        return res.status(400).json({ error: "هذا الإجراء خاص بالمهام العامة فقط" });
      }
      if (!task.routedDepartmentId) {
        return res.status(400).json({ error: "هذه المهمة ليست موجَّهة إلى قسم" });
      }
      if (task.status !== FieldTaskStatus.AWAITING_APPROVAL) {
        return res.status(400).json({ error: "المهمة ليست بانتظار الاعتماد" });
      }

      // Access gate — delegation-aware, identical to /distribute: a branch_manager
      // (firm-wide) or a dept_head of the ROUTED department (own dept travels
      // with the inherited head role via effectiveDeptHeadDepts). No acting
      // context → the actor's own role/dept.
      const ctx = req.actingContext;
      const scopeCaseId = task.caseId ?? null;
      const isManager = ctx
        ? hasEffectiveRole(ctx, scopeCaseId, "branch_manager")
        : user.role === "branch_manager";
      const isRoutedHead = ctx
        ? effectiveDeptHeadDepts(ctx, scopeCaseId).has(task.routedDepartmentId)
        // !!user.departmentId — routedDepartmentId is nullable, so an unrouted task
        // must not be claimable by a department_head with no department of their own.
        : (user.role === "department_head" && !!user.departmentId && user.departmentId === task.routedDepartmentId);
      if (!isManager && !isRoutedHead) {
        return res.status(403).json({ error: "لا تملك صلاحية اعتماد هذه المهمة" });
      }

      if (decision === "اعتماد") {
        // Approve → to the ORIGINAL requester for their review. Fall back to
        // assignedBy for a legacy null requester (same idiom as /review + the
        // PATCH complete branch) so assignedTo can never land on null. workerId
        // is intentionally NOT touched — it still points at the member.
        const requester = task.originalRequesterId || task.assignedBy;
        const updated = await storage.updateFieldTask(task.id, {
          status: FieldTaskStatus.AWAITING_REVIEW,
          assignedTo: requester,
        });
        try {
          await createGeneralTaskEventActing(req, task.caseId, {
            fieldTaskId: task.id, actorId: user.id, actorName: user.name || user.id,
            eventType: GeneralTaskEventType.APPROVED, body: null,
          });
        } catch (e) {
          console.error("[field-tasks approve] general-task event write failed:", e);
        }
        return res.json(updated);
      }
      if (decision === "ملاحظة") {
        if (!reviewNote.trim()) {
          return res.status(400).json({ error: "الملاحظة مطلوبة عند الإرجاع" });
        }
        // Send back to the member who produced the result (workerId), mirroring
        // the requester's /review send-back exactly.
        const updated = await storage.updateFieldTask(task.id, {
          status: FieldTaskStatus.PENDING,
          assignedTo: task.workerId || task.assignedTo,
          reviewNote,
        });
        try {
          await createGeneralTaskEventActing(req, task.caseId, {
            fieldTaskId: task.id, actorId: user.id, actorName: user.name || user.id,
            eventType: GeneralTaskEventType.RETURNED_WITH_NOTE, body: reviewNote,
          });
        } catch (e) {
          console.error("[field-tasks approve] general-task event write failed:", e);
        }
        return res.json(updated);
      }
      return res.status(400).json({ error: "قرار الاعتماد غير صحيح" });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في اعتماد المهمة" });
    }
  });

  // Sub-step 4.6b — general (عام) task activity thread (read). Ordered ascending
  // (oldest→newest) by storage.getGeneralTaskEvents. Anyone INVOLVED may read:
  // the assignee, the original requester, the worker who produced the current
  // result, the creator (assignedBy), a manager (canAssignFieldTasks), or anyone
  // who can modify the linked case/consultation. Delegation-aware via
  // actingIdentitiesFor (a delegate standing in for an involved user qualifies),
  // mirroring the GET /api/memos/:id/activities viewer gate.
  // EXTENSION POINT (path-2): also allow the routed dept_head
  // (task.routedDepartmentId) once dept routing exists (sub-step 6+).
  app.get("/api/field-tasks/:id/events", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const task = await storage.getFieldTaskById(String(req.params.id));
      if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });

      const identities = req.actingContext
        ? actingIdentitiesFor(req.actingContext, task.caseId ?? null)
        : [{ userId: user.id, role: user.role, departmentId: user.departmentId }];
      const ids = new Set(identities.map((i) => i.userId));
      const involved =
        ids.has(task.assignedTo) ||
        (!!task.originalRequesterId && ids.has(task.originalRequesterId)) ||
        (!!task.workerId && ids.has(task.workerId)) ||
        ids.has(task.assignedBy);
      // Mirror the PATCH manager check (direct role compare — ActingIdentity.role
      // is a plain string): branch_manager / admin_support are canAssignFieldTasks.
      const isManager = identities.some((i) => i.role === "branch_manager" || i.role === "admin_support");

      let canModifyParent = false;
      if (task.caseId) {
        const parentCase = await storage.getCaseById(task.caseId);
        canModifyParent = !!parentCase && canModifyCase(user, parentCase, req.actingContext);
      } else if (task.consultationId) {
        const parentConsultation = await storage.getConsultationById(task.consultationId);
        canModifyParent = !!parentConsultation && canModifyConsultation(user, parentConsultation, req.actingContext);
      }

      if (!involved && !isManager && !canModifyParent) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض سجل هذه المهمة" });
      }

      const events = await storage.getGeneralTaskEvents(task.id);
      // Denormalized actorName → the FE needs no user lookup.
      res.json(events.map((e) => ({
        id: e.id, actorName: e.actorName, eventType: e.eventType, body: e.body, createdAt: e.createdAt,
      })));
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب سجل المهمة" });
    }
  });

  app.delete("/api/field-tasks/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      await storage.deleteFieldTask(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف المهمة" });
    }
  });

  // ==================== Contact Logs ====================

  app.get("/api/contact-logs", requireAuth, async (req, res) => {
    try {
      const logs = await storage.getAllContactLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب سجلات التواصل" });
    }
  });

  app.get("/api/contact-logs/client/:clientId", requireAuth, async (req, res) => {
    try {
      const logs = await storage.getContactLogsByClient(String(req.params.clientId));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب سجلات التواصل" });
    }
  });

  app.post("/api/contact-logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const createdBy = user.id;
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = contactLogBodySchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const newLog = await storage.createContactLog(req.body, createdBy);
      res.status(201).json(newLog);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء سجل التواصل" });
    }
  });

  // 🔴 WAS requireAuth AND NOTHING ELSE — a full IDOR. The handler spread the
  // body straight into updateContactLog, so ANY authenticated non-viewer could
  // rewrite ANY contact log in the firm: the client it names, its dates, its
  // notes, its follow-up state. Found during the المهام-tab investigation; not
  // caused by it, and reachable today with no tab and no UI.
  //
  // THE PREDICATE IS ASSEMBLED FROM SHAPES THAT ALREADY EXIST HERE, not invented:
  //   1. the CREATOR — contact_logs has no assignee; `created_by` is the only
  //      ownership column it has, and it is exactly what مهامي already treats as
  //      ownership (getMyTasks block 11 filters `eq(contactLogs.createdBy, uid)`,
  //      commented "owner = createdBy"). The مهامي "إنهاء متابعة العميل" action
  //      PATCHes this route, so arm 1 alone keeps that whole path working.
  //   2. a MANAGER via canAssignFieldTasks (branch_manager | admin_support) —
  //      the file's established management pair, reused rather than re-listed.
  //      admin_support is in it because client contact IS their work; DELETE
  //      stays branch_manager-only above, so this does not widen deletion.
  //   3. anyone who can modify the LINKED CASE — the same `canModifyCase(parent)`
  //      arm the field-task and legal-deadline gates use. case_id is NULLABLE on
  //      this table (unlike legal_deadlines), so this arm is conditional by
  //      necessity, and it FAILS CLOSED: a case-less log falls through to arms
  //      1-2 rather than skipping the check (the exact bug fixed below).
  //
  // ⚠️ ONE LIVE PATH NARROWS, and it is called out in the batch report rather
  // than hidden: clients.tsx renders a follow-up-complete button with NO client
  // gate for every contact of any client the user opens, so a non-creator,
  // non-manager acting on a CASE-LESS log now gets a 403 where they used to
  // succeed. That is the IDOR, seen from the UI side. If it turns out to be a
  // used workflow, the fix is to widen arm 3 — not to reopen the route.
  app.patch("/api/contact-logs/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = contactLogBodySchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const user = req.user!;
      const existingLog = await storage.getContactLogById(String(req.params.id));
      if (!existingLog) return res.status(404).json({ error: "سجل التواصل غير موجود" });
      let mayEditLog =
        existingLog.createdBy === user.id || canAssignFieldTasks(user.role);
      if (!mayEditLog && existingLog.caseId) {
        const parentCase = await storage.getCaseById(existingLog.caseId);
        mayEditLog = !!parentCase && canModifyCase(user, parentCase, req.actingContext);
      }
      if (!mayEditLog) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      const updated = await storage.updateContactLog(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "سجل التواصل غير موجود" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث سجل التواصل" });
    }
  });

  app.delete("/api/contact-logs/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      await storage.deleteContactLog(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف سجل التواصل" });
    }
  });

  // ==================== Memos (المذكرات القانونية) ====================

  app.get("/api/memos", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const allMemos = await storage.getAllMemos();
      res.json(allMemos);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المذكرات" });
    }
  });

  app.get("/api/memos/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) {
        return res.status(404).json({ error: "المذكرة غير موجودة" });
      }
      res.json(memo);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المذكرة" });
    }
  });

  app.get("/api/memos/case/:caseId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const caseMemos = await storage.getMemosByCase(String(req.params.caseId));
      res.json(caseMemos);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب مذكرات القضية" });
    }
  });

  app.get("/api/memos/hearing/:hearingId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const hearingMemos = await storage.getMemosByHearing(String(req.params.hearingId));
      res.json(hearingMemos);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب مذكرات الجلسة" });
    }
  });

  app.post("/api/memos", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const validatedData = insertMemoSchema.parse(req.body);

      // Memo assignment rule: ALWAYS resolve from the case. The memo lawyer
      // is the case's primary (or responsible) lawyer — never the creator,
      // so admin_support creating a memo doesn't get auto-assigned. If the
      // case has no lawyer, leave it empty.
      let resolvedAssignedTo = "";
      const relatedCase = validatedData.caseId ? await storage.getCaseById(validatedData.caseId) : null;

      // CREATE-SCOPE — memos carry NO departmentId, so scopedCreateDepartmentId does
      // not apply: a memo's department IS its parent case's, and its "assigned to me"
      // is the parent case's assignment. Both scoped tiers therefore resolve against
      // the PARENT CASE via entityActorTier.
      //   • department_head — was granted FIRM-WIDE by canCreateMemos, so a head
      //     could raise a memo on ANOTHER department's case. Now removed from the
      //     global set and admitted only through the tier check, i.e. own-dept only.
      //   • employee — admitted when assigned to the parent case.
      //   • branch_manager / cases_review_head / admin_support — unchanged, global.
      // A memo with NO parent case keeps the original canCreateMemos rule verbatim
      // (including department_head): there is nothing to scope against, and this
      // is not a real workflow — memos.case_id is NOT NULL.
      const canCreateThisMemo = relatedCase
        ? (
            (canCreateMemos(user.role) && user.role !== "department_head")
            || canActOnEntityTiered(
              user, relatedCase, relatedCase.departmentId, req.actingContext, relatedCase.id ?? null)
          )
        : canCreateMemos(user.role);
      if (!canCreateThisMemo) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإنشاء المذكرات" });
      }

      if (validatedData.caseId) {
        if (relatedCase && (relatedCase.currentStage === "مقفلة" || relatedCase.isArchived)) {
          return res.status(400).json({ error: "لا يمكن إضافة مذكرات لقضية مغلقة أو مؤرشفة" });
        }
        if (relatedCase) {
          resolvedAssignedTo =
            relatedCase.primaryLawyerId ||
            relatedCase.responsibleLawyerId ||
            "";
        }
      } else if (validatedData.assignedTo && validatedData.assignedTo !== user.id) {
        // No caseId context — honour an explicit client-supplied assignee as
        // long as it isn't the creator (admin_support shouldn't auto-assign
        // themselves).
        resolvedAssignedTo = validatedData.assignedTo;
      }

      // Validate assignedTo user is active (only when we have one).
      if (resolvedAssignedTo) {
        const { valid } = await validateAssignedUsersActive([resolvedAssignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "المحامي المكلف غير نشط أو غير موجود" });
        }
      }

      const memo = await storage.createMemo({
        ...validatedData,
        assignedTo: resolvedAssignedTo,
        createdBy: user.id,
      });

      if (memo.caseId) {
        const activeCount = await getActiveMemoCount(memo.caseId);
        const caseUpdate: any = { activeMemoCount: activeCount };

        // Dynamic IN_COURT path adjustment: adding a memo to an IN_COURT
        // case at an early stage flips memoRequired on so the progress bar
        // switches to the memo/drafting variant. Once the case has passed
        // drafting (منظورة or later post-trial stages), we leave it alone.
        const relatedCase = await storage.getCaseById(memo.caseId);
        if (
          relatedCase &&
          relatedCase.caseClassification === "منظورة_بالمحكمة"
        ) {
          const EARLY_STAGES = new Set([
            "استلام",
            "استكمال_البيانات",
            "دراسة",
          ]);
          const atEarlyStage = EARLY_STAGES.has(relatedCase.currentStage);

          if (atEarlyStage) {
            if (!relatedCase.memoRequired) {
              caseUpdate.memoRequired = true;
            }
            // Seed clientRole from the memo type when the case doesn't have
            // one yet: RESPONSE ("مذكرة_جوابية") → defendant, LAWSUIT_DRAFT
            // ("تحرير_دعوى") → plaintiff. Don't override an existing role.
            if (!relatedCase.clientRole) {
              if (memo.memoType === "مذكرة_جوابية") {
                caseUpdate.clientRole = "مدعى_عليه";
              } else if (memo.memoType === "تحرير_دعوى") {
                caseUpdate.clientRole = "مدعي";
              }
            }
          }
        }

        await storage.updateCase(memo.caseId, caseUpdate);
      }

      res.status(201).json(memo);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating memo:", error);
      res.status(500).json({ error: "حدث خطأ في إنشاء المذكرة" });
    }
  });

  const updateMemoSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(["عاجل", "عالي", "متوسط", "منخفض"]).optional(),
    assignedTo: z.string().optional(),
    deadline: z.string().optional(),
    content: z.string().optional(),
    fileLink: z.string().optional(),
    status: z.enum(["لم_تبدأ", "قيد_التحرير", "قيد_المراجعة", "بانتظار_الاعتماد", "تحتاج_تعديل", "معتمدة", "مرفوعة", "ملغاة"]).optional(),
    reviewNotes: z.string().optional(),
    reviewerId: z.string().optional(),
  });

  app.patch("/api/memos/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) {
        return res.status(404).json({ error: "المذكرة غير موجودة" });
      }

      const validated = updateMemoSchema.parse(req.body);
      const updateData: any = { ...validated };

      // Check if user can change memo status
      const isAssignedToMemo = memo.assignedTo === user.id;
      const relatedCase = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
      const isAssignedToCase = relatedCase && (relatedCase.primaryLawyerId === user.id || relatedCase.responsibleLawyerId === user.id);
      // !!user.departmentId — see canModifyCaseIdentity; a null/"" dept must never match.
      const isDeptHeadForCase = user.role === "department_head" && !!user.departmentId && relatedCase && relatedCase.departmentId === user.departmentId;
      const canChangeStatus = canReviewMemos(user.role) || canChangeMemoStatus(user.role) || isAssignedToMemo || isAssignedToCase || isDeptHeadForCase;

      if (updateData.status && !canChangeStatus) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة المذكرة" });
      }

      // SECURITY (audit R8) — the NON-status fields were completely UNGATED.
      // Only `status` was ever checked above, so title / description / priority /
      // assignedTo / deadline / content / fileLink / reviewNotes / reviewerId were
      // writable by ANY authenticated non-viewer on ANY memo in the firm (a live
      // IDOR; only the viewerWriteGuard in server/index.ts stopped viewers).
      //
      // Gated with canActOnMemo — the memo module's central authority helper —
      // rather than a new hand-rolled rule. It already does the two things this
      // route needs and gets wrong when hand-rolled: it resolves department_head
      // through the PARENT CASE (memos carry no departmentId of their own) and it
      // guards memo.assignedTo's "" unassigned sentinel (assigned_to is NOT NULL).
      //
      // ADMIN SET = the widest existing memo-action set — POST /api/memos/:id/cancel's
      // ["branch_manager","admin_support","cases_review_head"] — PLUS labor_review_head
      // so BOTH committee chairs match. A memo's committee is chaired by
      // cases_review_head, or by labor_review_head for a labor-department memo
      // (ALLOWED_MEMO_TRANSITIONS + the dept-routing guard in /advance-stage), and the
      // update schema exposes the committee's own reviewNotes / reviewerId fields.
      // Without labor_review_head the labor chair could APPROVE a labor memo through
      // the status gate above (canReviewMemos includes it) but not annotate it.
      //
      // Parent-case lawyers who are NOT the memo assignee are deliberately NOT
      // admitted: canActOnMemo excludes them, and memos.tsx canCancelMemo documents
      // that exclusion as a deliberate fix (the old gate showed them a button the
      // server 403'd). The status gate above keeps its own, wider rule untouched.
      //
      // Evaluated on the ZOD-VALIDATED keys only, before the handler adds its own
      // server-side fields (startedAt / completedAt / submittedAt / reviewerId below),
      // so those never trip this gate.
      const nonStatusFields = Object.keys(updateData).filter((k) => k !== "status");
      if (nonStatusFields.length > 0) {
        const canEditMemoFields = await canActOnMemo(user, memo, req.actingContext, [
          "branch_manager",
          "admin_support",
          "cases_review_head",
          "labor_review_head",
        ]);
        if (!canEditMemoFields) {
          return res.status(403).json({ error: "ليس لديك صلاحية لتعديل هذه المذكرة" });
        }
      }

      // CARVE-OUT 4 — REASSIGNMENT is DEPARTMENT tier and above, so it needs a
      // check of its own on top of the field gate above. That gate admits the memo
      // ASSIGNEE, which for assignedTo would be the same privilege-escalation loop
      // the cases side has: the assignee hands the memo to themselves (or away) and
      // keeps assignee-tier authority over it. Scoped through the PARENT CASE's
      // department, the memo module's standard dept resolution. admin_support and
      // cases_review_head keep the grant they already had via the field gate.
      if (updateData.assignedTo !== undefined) {
        const reassignParentCase = memo.caseId ? await storage.getCaseById(memo.caseId) : null;
        const reassignAdminRoles = ["admin_support", "cases_review_head", "labor_review_head"];
        const reassignRoles = req.actingContext
          ? actingIdentitiesFor(req.actingContext, memo.caseId ?? null).map((i) => i.role)
          : [user.role];
        const reassignAllowed =
          canActAtDepartmentTier(
            user, memo, reassignParentCase?.departmentId ?? null, req.actingContext, memo.caseId ?? null)
          || reassignRoles.some((r) => reassignAdminRoles.includes(r));
        if (!reassignAllowed) {
          return res.status(403).json({ error: "ليس لديك صلاحية لإسناد هذه المذكرة" });
        }
      }

      // Validate assignedTo user is active if being changed
      if (updateData.assignedTo) {
        const { valid } = await validateAssignedUsersActive([updateData.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "المحامي المكلف غير نشط أو غير موجود" });
        }
      }

      // Validate memo status transitions
      if (updateData.status === MemoStatus.APPROVED || updateData.status === MemoStatus.REVISION_REQUIRED) {
        if (!canReviewMemos(user.role)) {
          return res.status(403).json({ error: "ليس لديك صلاحية لمراجعة المذكرات" });
        }
        if (
          memo.status !== MemoStatus.IN_REVIEW &&
          memo.status !== MemoStatus.PENDING_APPROVAL
        ) {
          return res.status(400).json({ error: "لا يمكن اعتماد أو إرجاع المذكرة إلا بعد تقديمها للمراجعة" });
        }
      }
      if (updateData.status === MemoStatus.SUBMITTED) {
        if (memo.status !== MemoStatus.APPROVED) {
          return res.status(400).json({ error: "لا يمكن رفع المذكرة إلا بعد اعتمادها" });
        }
      }
      // Allow cancellation (no memo needed) for active memos
      if (updateData.status === MemoStatus.CANCELLED) {
        if (["معتمدة", "مرفوعة", "ملغاة"].includes(memo.status)) {
          return res.status(400).json({ error: "لا يمكن إلغاء مذكرة معتمدة أو مرفوعة" });
        }
      }

      if (updateData.status) {
        const now = new Date().toISOString();
        if (updateData.status === MemoStatus.DRAFTING && !memo.startedAt) {
          updateData.startedAt = now;
        }
        if (updateData.status === MemoStatus.IN_REVIEW) {
          updateData.completedAt = now;
        }
        if (updateData.status === MemoStatus.SUBMITTED) {
          updateData.submittedAt = now;
        }
        if (updateData.status === MemoStatus.REVISION_REQUIRED) {
          updateData.returnCount = (memo.returnCount || 0) + 1;
        }
        if (updateData.status === MemoStatus.APPROVED) {
          updateData.reviewerId = user.id;
          updateData.reviewedAt = now;
        }
      }

      const updated = await storage.updateMemo(String(req.params.id), updateData);

      if (memo.caseId) {
        const activeCount = await getActiveMemoCount(memo.caseId);
        const caseUpdate: any = { activeMemoCount: activeCount };

        // "لا يحتاج مذكرة" flow: on memo cancellation, if the related case
        // is IN_COURT and still at the memo/drafting/review stages, fast-
        // forward it to منظورة and flip memoRequired off so the progress
        // bar reverts to the no-memo variant. Cases past الأخذ_بالملاحظات
        // or already at منظورة/post-trial are left alone (path locked).
        if (
          updateData.status === MemoStatus.CANCELLED &&
          relatedCase &&
          relatedCase.caseClassification === "منظورة_بالمحكمة"
        ) {
          const FAST_FORWARD_STAGES = new Set([
            "استلام",
            "استكمال_البيانات",
            "تحرير_مذكرة_جوابية",
            "تحرير_صحيفة_الدعوى",
            "مراجعة_داخلية",
          ]);
          if (FAST_FORWARD_STAGES.has(relatedCase.currentStage)) {
            caseUpdate.memoRequired = false;
            caseUpdate.currentStage = "منظورة";
            const history = Array.isArray(relatedCase.stageHistory)
              ? relatedCase.stageHistory
              : [];
            caseUpdate.stageHistory = [
              ...history,
              {
                stage: "منظورة",
                timestamp: new Date().toISOString(),
                userId: user.id,
                userName: user.name || user.id,
                notes: "تم إلغاء المذكرة - لا يحتاج مذكرة",
              },
            ];
          } else if (
            relatedCase.currentStage !== "منظورة" &&
            relatedCase.currentStage !== "منظورة_استئناف" &&
            relatedCase.memoRequired
          ) {
            // Past drafting but not yet at trial: just flip the flag off.
            caseUpdate.memoRequired = false;
          }
        }

        await storage.updateCase(memo.caseId, caseUpdate);
      }

      // WE APPEALED — filing the objection memo moves the case to منظورة_استئناف.
      // Runs after the case write above so the stage it sets is not overwritten.
      if (updateData.status === MemoStatus.SUBMITTED) {
        await promoteCaseOnObjectionFiled(req, memo, user);
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating memo:", error);
      res.status(500).json({ error: "حدث خطأ في تحديث المذكرة" });
    }
  });

  app.delete("/api/memos/:id", requireAuth, requireRole("branch_manager"), async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      if (!canDeleteMemos(user.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لحذف المذكرات" });
      }

      const memo = await storage.getMemoById(String(req.params.id));
      if (!memo) {
        return res.status(404).json({ error: "المذكرة غير موجودة" });
      }

      await storage.deleteMemo(String(req.params.id));

      if (memo.caseId) {
        const activeCount = await getActiveMemoCount(memo.caseId);
        const caseUpdate: any = { activeMemoCount: activeCount };

        // Dynamic IN_COURT path adjustment: when the last memo on an IN_COURT
        // case is removed and the case is still at an early stage, flip
        // memoRequired back off so the progress bar returns to the no-memo
        // variant (study only). Once the case has passed drafting (منظورة
        // or post-trial), the classification is locked in.
        const relatedCase = await storage.getCaseById(memo.caseId);
        if (
          relatedCase &&
          relatedCase.caseClassification === "منظورة_بالمحكمة" &&
          relatedCase.memoRequired
        ) {
          const EARLY_STAGES = new Set([
            "استلام",
            "استكمال_البيانات",
            "دراسة",
            // Also allow flipping off while the lawyer is actively in a
            // memo/drafting stage — they may have created the memo by
            // mistake and want to delete it and revert to study-only.
            "تحرير_مذكرة_جوابية",
            "تحرير_صحيفة_الدعوى",
          ]);
          const allMemos = await storage.getMemosByCase(memo.caseId);
          const anyRemaining = allMemos.some((m: any) => m.id !== memo.id);
          if (!anyRemaining && EARLY_STAGES.has(relatedCase.currentStage)) {
            caseUpdate.memoRequired = false;
          }
        }

        await storage.updateCase(memo.caseId, caseUpdate);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف المذكرة" });
    }
  });

  // ==================== Notifications ====================

  app.get("/api/notifications", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      // EVERY role reads ONLY its own notifications — no role branch, no ?all=true.
      //
      // This route used to hand a FIRM-WIDE list to five roles (branch_manager,
      // admin_support, cases_review_head, consultations_review_head, viewer): the
      // 200 most recent, or the ENTIRE table when the caller passed ?all=true.
      // Every field came with it, including the Arabic message body and any
      // `response` text another user had written, so five roles could read every
      // user's mail. The scope was never documented as deliberate anywhere.
      //
      // The client already filtered to `recipientId === userId` everywhere it
      // displayed notifications (getMyNotifications / getUnreadCount /
      // getUrgentCount in notifications-context), so the extra rows were fetched
      // and then discarded — except on the stats dashboard, which is rescoped in
      // the same batch.
      //
      // This also FIXES an admin-facing bug: the 200-row firm-wide cap was applied
      // BEFORE the client's own-recipient filter, so on a busy firm an admin's own
      // notifications could fall outside the newest 200 and silently vanish from
      // both the bell badge and the notifications page. Own-only has no such window.
      //
      // ⚠ storage.getAllNotifications() is deliberately LEFT IN PLACE: four
      // scheduler jobs (checkUnupdatedHearings, checkUpcomingHearingReminders,
      // checkLegalDeadlines, checkContactFollowUps) call it for their
      // notificationExists dedup. It is no longer reachable over HTTP.
      // OPTIONAL PAGING. No ?limit → everything, exactly as before: the stats
      // dashboard aggregates over a user's whole history and must not silently
      // become "the last N". The list passes a window and grows it with
      // "load more". The response stays a bare ARRAY — no envelope — so the
      // client contract is unchanged; "is there more?" is answered by whether a
      // FULL page came back, which needs no total.
      const rawLimit = Number(req.query.limit);
      const rawOffset = Number(req.query.offset);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : undefined;
      const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

      // OPTIONAL TAB FILTERS — ?unread=true and ?requiresResponse=true, the two
      // tabs on the notifications page. Applied in SQL before the LIMIT so a
      // filtered page holds a full page of MATCHING rows.
      //
      // STRICTLY OPT-IN, NOT PARSED LOOSELY: only the exact string "true"
      // enables a filter. Anything else — "false", "1", "yes", a typo, an array
      // from a repeated param — is IGNORED and the filter stays off. Chosen over
      // rejecting with a 400 because these are additive narrowing flags on a
      // read: the safe failure is to return MORE than asked (the unfiltered
      // list the caller already had a right to), never to 400 a list the user
      // can legitimately see. Same posture as limit/offset above, which clamp
      // rather than reject.
      const unread = req.query.unread === "true";
      const requiresResponse = req.query.requiresResponse === "true";
      const hasFilter = unread || requiresResponse;

      // No limit AND no filter → the exact call that was made before, so the
      // unbounded dashboard read is byte-identical.
      const notificationList = await storage.getNotificationsByRecipient(
        user.id,
        limit === undefined && !hasFilter
          ? undefined
          : { ...(limit === undefined ? {} : { limit, offset }), unread, requiresResponse },
      );
      // ENTITY CONTEXT is stamped only on the PAGED read.
      //
      // It costs at most five batched queries for the page — one per
      // relatedType present — so it scales with the page, never with history.
      // The UNBOUNDED read (no ?limit) is the stats dashboard, which aggregates
      // counts and timings and uses none of these fields; enriching there would
      // be up to five extra queries over the caller's entire history to produce
      // data nothing reads. Skipping it is both cheaper and the honest scope.
      res.json(limit === undefined
        ? notificationList
        : await storage.enrichNotificationsWithContext(notificationList));
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الإشعارات" });
    }
  });

  // The caller's OWN unread count, straight from SQL.
  //
  // Exists because the bell badge counted unread by filtering the client-side
  // array. Once that array is capped by paging, the filter can only see the
  // loaded window and the badge silently undercounts — the one number in the
  // product a user is entitled to trust. storage.getUnreadNotificationCount is
  // a COUNT(*) that was already written (it backed the dashboard aggregate);
  // this simply exposes it. Always scoped to req.user — no id parameter, so
  // there is nothing to enumerate.
  app.get("/api/notifications/unread-count", requireAuth, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب عدد الإشعارات" });
    }
  });

  // Phase 5 A1/H2 — the only fields a notification's owner (or an admin) may
  // mutate via PATCH. Mirrors updateNotificationSchema; deliberately excludes
  // the identity/routing/content danger set.
  const NOTIFICATION_UPDATE_ALLOWLIST = [
    "isRead", "readAt", "status", "response", "escalationLevel", "escalatedTo",
  ] as const satisfies readonly (keyof Notification)[];

  app.post("/api/notifications", requireAuth, notificationSendLimiter, async (req: AuthRequest, res) => {
    try {
      const parsed = insertNotificationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const user = req.user!;

      // WHO MAY SEND. The route was requireAuth-only: any authenticated user
      // could send anything to anyone. canSendNotifications named five roles
      // but was only ever called on the CLIENT, so it hid a button and gated
      // nothing.
      //
      // Two ways to pass, and the second is what keeps the workflow working:
      //   1. A role that may COMPOSE FREELY — canSendNotifications. These roles
      //      can message any user with or without a link; that is the product
      //      intent of the "إرسال إشعار" dialog.
      //   2. Anyone else, but ONLY about an entity they are authorised on. Every
      //      one of the ten live triggers in lib/notification-triggers.ts routes
      //      through sendNotificationDirect, whose signature makes relatedType
      //      and relatedId REQUIRED — so all of them carry a link, and the
      //      server re-derives authority over that real row.
      //
      // ⚠ This deliberately does NOT try to tell "workflow" from
      // "human-composed". The request body cannot distinguish them and any flag
      // that claimed to would be client-forgeable. Branch 2 asks a question the
      // server can VERIFY instead: do you have rights on the entity you named?
      // Forging it means naming an entity you genuinely act on — which is the
      // permitted case, so there is nothing to forge.
      const relatedType = typeof req.body?.relatedType === "string" ? req.body.relatedType : null;
      const relatedId = typeof req.body?.relatedId === "string" ? req.body.relatedId : null;
      const maySend =
        canSendNotifications(user.role)
        || await canReferenceRelatedEntity(user, relatedType, relatedId, req.actingContext);
      if (!maySend) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإرسال الإشعارات" });
      }

      // Phase 5 A1/H1 — sender identity is ALWAYS derived server-side, never
      // trusted from the body (anti-impersonation). The sole exception is an
      // explicit senderId:null, the contract for automatic/system
      // notifications (event-rule triggers), which stay sender-less. Any
      // non-null body senderId/senderName is ignored and overwritten with the
      // authenticated user — closing the spoofing hole while keeping every
      // legitimate FE send byte-identical (the FE already sends the current
      // user's own id/name, or null for system notifications).
      const isSystemNotification = req.body.senderId === null;
      const notificationPayload = {
        ...req.body,
        senderId: isSystemNotification ? null : user.id,
        senderName: isSystemNotification ? null : user.name,
      };
      const newNotification = await storage.createNotification(notificationPayload);
      // Real-time push to the ADDRESSEE ONLY.
      //
      // This used to also call broadcastToAdmins(wsEvent) unconditionally, which
      // pushed the FULL payload — title, message, sender, recipientId, relatedId —
      // to every branch_manager / admin_support / cases_review_head /
      // consultations_review_head / labor_review_head socket no matter who the
      // notification was addressed to. notifications.recipient_id is a scalar
      // NOT NULL column and fan-out is done by inserting one row per person, so
      // there is no "announcement" semantic here: those admins were receiving
      // another user's mail, and notifications-context prepends whatever arrives
      // straight into the viewer's own list.
      //
      // ⚠ The firm-wide admin READ is deliberate and is NOT changed: GET
      // /api/notifications still returns the 200 most recent (or all, with
      // ?all=true) to the admin roles. What an admin loses is only the LIVE push
      // of other people's notifications — that list now fills on its next fetch,
      // exactly like every scheduler-generated notification already did (those
      // never went through this route and so were never pushed at all).
      //
      // The two role lists also disagreed, which made the leak worse than the
      // read it mirrored: broadcastToAdmins includes labor_review_head, who is
      // NOT in this endpoint's admin read set and therefore received content a
      // refresh would immediately remove from their list.
      if (newNotification.recipientId) {
        sendToUser(newNotification.recipientId, { type: "notification:new", payload: newNotification });
      }
      res.status(201).json(newNotification);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء الإشعار" });
    }
  });

  // 🔔 REMINDERS — ONE request in, one notification per RESOLVED recipient out.
  //
  // WHY THIS ENDPOINT EXISTS AT ALL. A reminder now goes to the assignee AND
  // that record's department head. The browser cannot do that fan-out:
  //   1. It has no correct department-head lookup any more. The client's
  //      findDepartmentHead was DELETED in the previous batch precisely because
  //      it used `.find` (one head when a department has two) and compared
  //      departmentId with no !!guard. The only correct resolver —
  //      resolveNotificationRecipients — is server-side.
  //   2. Two recipients from the browser means TWO POSTs to /api/notifications,
  //      which is two hits on notificationSendLimiter (150 per 5 min per USER)
  //      for one user action, halving the effective ceiling. One request here
  //      costs ONE hit no matter how many people are notified.
  //   3. De-duplication has to happen where the recipient list is built. Doing
  //      it on the client would be a FOURTH copy of a fan-out that already
  //      exists once, correctly, on the server.
  // This continues the direction of the previous batch, which moved the create
  // notifications server-side for exactly these reasons.
  //
  // 🔴 THE AUTHORITY GATE IS COPIED FROM POST /api/notifications, VERBATIM AND
  // DELIBERATELY: canSendNotifications(role) OR canReferenceRelatedEntity(...).
  // Reminders reached the server through that endpoint until now, so reusing
  // the identical test means NOBODY gains or loses the ability to send one.
  // Adding canSendReminders as an extra AND would have NARROWED it (an assigned
  // lawyer can send today), and narrowing is as much a permission change as
  // widening. canSendReminders stays where it has always been — the FRONTEND
  // gate on who is offered the button.
  const sendReminderSchema = z.object({
    entityType: z.enum(["case", "consultation", "contract", "memo"]),
    entityId: z.string().min(1),
    reminderType: z.string().min(1),
    message: z.string().min(1),
    // Cases offer a manual recipient picker; the other three do not. When set it
    // REPLACES the assignee — it never replaces the department head.
    recipientId: z.string().nullable().optional(),
  }).passthrough();

  app.post("/api/reminders", requireAuth, notificationSendLimiter, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const parsed = sendReminderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const { entityType, entityId, reminderType, message, recipientId } = parsed.data;

      // Resolve the record ONCE into the three things a reminder needs: what to
      // call it, who owns it, and which department's head to copy.
      let label = "";
      let assigneeId = "";
      let departmentId: string | null = null;
      let noun = "";
      if (entityType === "case") {
        const c = await storage.getCaseById(entityId);
        if (!c) return res.status(404).json({ error: "القضية غير موجودة" });
        label = c.caseNumber; noun = "قضية";
        assigneeId = caseNotificationRecipientId(c);
        departmentId = c.departmentId ?? null;
      } else if (entityType === "consultation") {
        const c = await storage.getConsultationById(entityId);
        if (!c) return res.status(404).json({ error: "الاستشارة غير موجودة" });
        label = c.consultationNumber; noun = "استشارة";
        assigneeId = c.assignedTo || "";
        departmentId = c.departmentId ?? null;
      } else if (entityType === "contract") {
        const c = await storage.getContractById(entityId);
        if (!c) return res.status(404).json({ error: "العقد غير موجود" });
        label = c.contractNumber; noun = "عقد";
        assigneeId = c.assignedTo || "";
        departmentId = c.departmentId ?? null;
      } else {
        const m = await storage.getMemoById(entityId);
        if (!m) return res.status(404).json({ error: "المذكرة غير موجودة" });
        label = m.title; noun = "مذكرة";
        // assigned_to is NOT NULL on memos but carries "" as the unassigned
        // sentinel, so the same normalisation as its nullable siblings applies.
        assigneeId = m.assignedTo || "";
        // 🔴 MEMOS CARRY NO departmentId — the head resolves through the PARENT
        // CASE, the same hop the memo feed blocks and the memo permission gates
        // already make. A memo whose case is missing simply yields no head.
        const parentCase = m.caseId ? await storage.getCaseById(m.caseId) : null;
        departmentId = parentCase?.departmentId ?? null;
      }

      const maySend = canSendNotifications(user.role)
        || await canReferenceRelatedEntity(user, entityType, entityId, req.actingContext);
      if (!maySend) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإرسال الإشعارات" });
      }

      // 🔴 THE DE-DUPLICATION. resolveNotificationRecipients returns a Set-backed
      // list, so when the department head IS the assignee (or the manually
      // picked recipient) they appear ONCE, not twice — which is the whole
      // reason the fan-out belongs here and not in two client POSTs. It also
      // drops blank ids and anyone who is not a real ACTIVE user.
      //
      // NO ASSIGNEE → the candidate list contributes nothing and only the head
      // is notified. NO HEAD → only the assignee. NEITHER → zero recipients, and
      // the endpoint says so with a 400 rather than reporting a phantom success:
      // this is a user action with a visible outcome, unlike the DORMANT rule
      // used for background tasks, where silence is correct because nobody is
      // waiting on a toast.
      const users = await storage.getAllUsers();
      const recipients = resolveNotificationRecipients(
        [recipientId || assigneeId],
        users,
        { departmentId },
      );
      if (recipients.length === 0) {
        return res.status(400).json({ error: "لا يوجد مستلم للتذكير — لم يُسنَد السجل ولا يوجد رئيس قسم نشط" });
      }

      for (const rid of recipients) {
        const created = await storage.createNotification({
          type: NotificationType.TASK_REMINDER,
          priority: "high",
          status: "pending",
          title: `تذكير: ${reminderType} - ${noun} ${label}`,
          message,
          senderId: user.id,
          senderName: user.name,
          recipientId: rid,
          relatedType: entityType,
          relatedId: entityId,
          requiresResponse: false,
        });
        if (created.recipientId) {
          sendToUser(created.recipientId, { type: "notification:new", payload: created });
        }
      }
      res.status(201).json({ sent: recipients.length });
    } catch (error) {
      console.error("[POST /api/reminders] error:", error);
      res.status(500).json({ error: "حدث خطأ في إرسال التذكير" });
    }
  });

  app.patch("/api/notifications/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const adminRoles = ["branch_manager", "admin_support"];
      if (!adminRoles.includes(user.role)) {
        const existing = await storage.getNotificationById(String(req.params.id));
        if (!existing) return res.status(404).json({ error: "الإشعار غير موجود" });
        if (existing.recipientId !== user.id) {
          return res.status(403).json({ error: "لا تملك صلاحية تعديل هذا الإشعار" });
        }
      }
      // 2D'-V1b Pattern-A gate: validate types only, then keep using
      // req.body untouched. Field allowlisting deferred to Phase 5
      // (see phase5-auth-backlog).
      const bodyCheck = updateNotificationSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      // Phase 5 A1/H2 — field allowlist. ONLY owner-mutable workflow fields may
      // be written; the danger set (recipientId / senderId / senderName /
      // title / message / relatedId / relatedType) is NEVER accepted from the
      // body — no re-pointing, no identity/content forgery — for EVERY role,
      // including the admins that skip the ownership check above. Pass the
      // allowlisted object, never raw req.body.
      const allowlisted: Partial<Notification> = {};
      for (const key of NOTIFICATION_UPDATE_ALLOWLIST) {
        if (req.body[key] !== undefined) allowlisted[key] = req.body[key];
      }
      const updated = await storage.updateNotification(String(req.params.id), allowlisted);
      if (!updated) {
        return res.status(404).json({ error: "الإشعار غير موجود" });
      }
      // Push update to the notification recipient
      const wsEvent = { type: "notification:updated", payload: updated };
      if (updated.recipientId) {
        sendToUser(updated.recipientId, wsEvent);
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الإشعار" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      const notifId = String(req.params.id);
      await storage.deleteNotification(notifId);
      // Notify admins about deletion
      broadcastToAdmins({ type: "notification:deleted", payload: { id: notifId } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الإشعار" });
    }
  });

  app.post("/api/notifications/mark-all-read", requireAuth, async (req: AuthRequest, res) => {
    try {
      const authUser = req.user!;
      if (!authUser || !authUser.id) {
        return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
      }
      const userId = authUser.id;
      const count = await storage.markAllNotificationsRead(userId);
      // Push mark-all-read event to the user's other tabs
      sendToUser(userId, { type: "notification:all-read" });
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الإشعارات" });
    }
  });

  // ==================== Departments ====================

  app.get("/api/departments", requireAuth, async (req, res) => {
    try {
      const departments = await storage.getAllDepartments();
      res.json(departments);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الأقسام" });
    }
  });

  app.get("/api/departments/:id", requireAuth, async (req, res) => {
    try {
      const department = await storage.getDepartmentById(String(req.params.id));
      if (!department) {
        return res.status(404).json({ error: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القسم" });
    }
  });

  // ==================== Attachments ====================
  // The URL-bookmark attachments feature (POST /api/attachments,
  // GET /api/attachments/:entityType/:entityId, DELETE /api/attachments/:id)
  // was REMOVED — it stored pasted external links (a Drive URL typed into the
  // case المرفقات tab), never files, and the firm did not use it. Removing it
  // also closed three live holes: the GET had requireAuth and NOTHING else
  // (any authenticated user, including a viewer, could enumerate any case's or
  // consultation's attachment list by id), the POST had no authority check at
  // all and took `uploadedBy` from the request body (spoofable), and fileUrl
  // was only validated by zod's .url(), which accepts javascript:/data: — then
  // handed straight to window.open with no scheme allowlist.
  //
  // The `attachments` TABLE IS DELIBERATELY KEPT with its rows (additive-only
  // rule — no migration). The cascade-cleanup deletes in storage.deleteCase and
  // storage.deleteConsultation still reference it and must stay; they use
  // db.delete(attachments) directly, not the removed storage methods.
  // Real file upload lives on contracts (contract_attachments + Object Storage).

  // ==================== Support Tickets ====================

  app.get("/api/support/tickets", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      let tickets;
      if (canManageSupportTickets(reqUser.role)) {
        tickets = await storage.getAllSupportTickets();
      } else {
        tickets = await storage.getSupportTicketsByUser(reqUser.id);
      }
      res.json(tickets);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/support/tickets/open-count", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      let tickets;
      if (canManageSupportTickets(reqUser.role)) {
        tickets = await storage.getAllSupportTickets();
      } else {
        tickets = await storage.getSupportTicketsByUser(reqUser.id);
      }
      const openCount = tickets.filter(t => !["مغلقة", "تم_الحل"].includes(t.status)).length;
      res.json({ count: openCount });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/support/tickets/:id", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getSupportTicketById(String(req.params.id));
      if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/support/tickets", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const data = insertTicketSchema.parse(req.body);
      const ticket = await storage.createSupportTicket({
        ...data,
        submittedBy: reqUser.id,
        status: "جديدة",
      });
      res.json(ticket);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/support/tickets/:id/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!canManageSupportTickets(reqUser.role)) {
        return res.status(403).json({ error: "غير مصرح بتغيير الحالة" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = updateTicketStatusSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { status } = req.body;
      const updates: any = { status };
      if (status === "تم_الحل") updates.resolvedAt = new Date();
      if (status === "مغلقة") updates.closedAt = new Date();
      const ticket = await storage.updateSupportTicket(String(req.params.id), updates);
      if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/support/tickets/:id/assign", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!canManageSupportTickets(reqUser.role)) {
        return res.status(403).json({ error: "غير مصرح بتعيين التذكرة" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = assignTicketSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { assignedTo } = req.body;
      if (assignedTo) {
        const check = await validateAssignedUsersActive([assignedTo]);
        if (!check.valid) {
          return res.status(400).json({ error: "لا يمكن تعيين التذكرة لمستخدم معطّل" });
        }
      }
      const ticket = await storage.updateSupportTicket(String(req.params.id), { assignedTo, status: "مفتوحة" });
      if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/support/tickets/:id/priority", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!canManageSupportTickets(reqUser.role)) {
        return res.status(403).json({ error: "غير مصرح بتغيير الأولوية" });
      }
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = updateTicketPrioritySchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { priority } = req.body;
      const ticket = await storage.updateSupportTicket(String(req.params.id), { priority });
      if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/support/tickets/:id/comment", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      const ticket = await storage.getSupportTicketById(String(req.params.id));
      if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });

      const dbUser = await storage.getUser(reqUser.id);
      const userName = dbUser?.name || "مستخدم";
      const userRole = reqUser.role;

      // 2D'-V3 Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = ticketCommentSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { message, isInternal } = req.body;
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "نص التعليق مطلوب" });
      }
      const sanitizedMessage = message.trim().substring(0, 2000);
      const comments = Array.isArray(ticket.comments) ? [...(ticket.comments as TicketComment[])] : [];
      comments.push({
        id: randomUUID(),
        userId: reqUser.id,
        userName,
        userRole,
        message: sanitizedMessage,
        isInternal: isInternal || false,
        createdAt: new Date().toISOString(),
      });
      const updated = await storage.updateSupportTicket(String(req.params.id), { comments });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/support/tickets/:id/rate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      const existingTicket = await storage.getSupportTicketById(String(req.params.id));
      if (!existingTicket) return res.status(404).json({ error: "التذكرة غير موجودة" });
      if (existingTicket.submittedBy !== reqUser.id) {
        return res.status(403).json({ error: "لا يمكنك تقييم تذاكر الآخرين" });
      }
      // 2D'-V3 Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = ticketRateSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { rating, ratingComment } = req.body;
      if (typeof rating !== "number" || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
      }
      const ticket = await storage.updateSupportTicket(String(req.params.id), { rating, ratingComment: ratingComment || "" });
      if (!ticket) return res.status(404).json({ error: "التذكرة غير موجودة" });
      res.json(ticket);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/support/tickets/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser || reqUser.role !== "branch_manager") {
        return res.status(403).json({ error: "غير مصرح بالحذف" });
      }
      const success = await storage.deleteSupportTicket(String(req.params.id));
      if (!success) return res.status(404).json({ error: "التذكرة غير موجودة" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Saved Filters ====================

  app.get("/api/saved-filters", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const pageType = String(req.query.pageType || "cases");
      const rows = await storage.getSavedFiltersByUser(reqUser.id, pageType);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/saved-filters", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const data = insertSavedFilterSchema.parse(req.body);
      const row = await storage.createSavedFilter(reqUser.id, data);
      res.json(row);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/saved-filters/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const existing = await storage.getSavedFilterById(String(req.params.id));
      if (!existing) return res.status(404).json({ error: "الفلتر غير موجود" });
      if (existing.userId !== reqUser.id) {
        return res.status(403).json({ error: "غير مصرح بتعديل هذا الفلتر" });
      }
      const data = updateSavedFilterSchema.parse(req.body);
      const row = await storage.updateSavedFilter(String(req.params.id), data);
      res.json(row);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/saved-filters/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const existing = await storage.getSavedFilterById(String(req.params.id));
      if (!existing) return res.status(404).json({ error: "الفلتر غير موجود" });
      if (existing.userId !== reqUser.id) {
        return res.status(403).json({ error: "غير مصرح بحذف هذا الفلتر" });
      }
      const success = await storage.deleteSavedFilter(String(req.params.id));
      if (!success) return res.status(404).json({ error: "الفلتر غير موجود" });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Admin_support task-routing assignments (Phase 1) ====================
  // Manager-only firm-wide config: which admin_support user owns each assignable
  // task type (collection / consultation_closing / session_report_export). Reads
  // and writes the mapping table ONLY — does NOT affect task routing yet (a later
  // sub-step wires routing to this table). Gated with canManageUsers server-side,
  // so a non-manager hitting these directly gets 403 (not just a hidden nav item).
  app.get("/api/admin-support-task-assignments", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!canManageUsers(req.user!.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية للوصول إلى إسناد مهام الدعم الإداري" });
      }
      const rows = await storage.getAdminSupportTaskAssignments();
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin-support-task-assignments/:taskType", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!canManageUsers(req.user!.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتعديل إسناد مهام الدعم الإداري" });
      }
      const taskType = String(req.params.taskType);
      const assignableTypes = Object.values(AssignableAdminSupportTaskKind) as string[];
      if (!assignableTypes.includes(taskType)) {
        return res.status(400).json({ error: "نوع المهمة غير صالح" });
      }
      const parsed = setAdminSupportTaskAssignmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "بيانات الإسناد غير صالحة" });
      }
      const assigneeUserId = parsed.data.assigneeUserId ?? null;
      // A provided assignee must be an ACTIVE admin_support user; null clears it.
      if (assigneeUserId) {
        const target = await storage.getUser(assigneeUserId);
        if (!target || target.role !== "admin_support" || !target.isActive) {
          return res.status(400).json({ error: "يجب اختيار موظف دعم إداري نشط" });
        }
      }
      const row = await storage.setAdminSupportTaskAssignment(taskType, assigneeUserId);
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Sidebar Counts ====================

  app.get("/api/sidebar-counts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const counts = await storage.getSidebarCounts({
        id: reqUser.id,
        role: reqUser.role,
        departmentId: reqUser.departmentId ?? null,
      });
      res.json(counts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Unified Tasks feed — everything requiring THIS user's action across the
  // system (cases/hearings/memos/reviews/collection/deadlines/field-tasks/
  // delegations/consultations). Per-user SQL aggregation (see storage.getMyTasks);
  // a department_head also sees their department's tasks tagged ownerScope:"team".
  app.get("/api/my-tasks", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const myTasks = await storage.getMyTasks(
        {
          id: reqUser.id,
          role: reqUser.role,
          departmentId: reqUser.departmentId ?? null,
        },
        req.actingContext,
      );
      res.json(myTasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sidebar-counts/mark-viewed", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      // 2D'-V3 Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = markSectionViewedSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const section = String(req.body?.section ?? "");
      if (!SIDEBAR_SECTIONS.includes(section as SidebarSectionValue)) {
        return res.status(400).json({ error: "قسم غير صالح" });
      }
      await storage.markSectionViewed(reqUser.id, section as SidebarSectionValue);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Lawyer Performance Stats ====================

  app.get("/api/stats/lawyer-performance", requireAuth, requireRole("branch_manager", "cases_review_head", "consultations_review_head", "department_head", "admin_support", "viewer"), async (req: AuthRequest, res) => {
    try {
    const user = req.user!;
    let departmentFilter = req.query.departmentId as string | undefined;
    const period = req.query.period as string || "all";

    if (user.role === "employee" || user.role === "department_head") {
      departmentFilter = user.departmentId || undefined;
    }

    const allCases = await storage.getAllCases();
    const allHearings = await storage.getAllHearings();
    const allMemos = await storage.getAllMemos();
    const allUsers = await storage.getAllUsers();
    const depts = await storage.getAllDepartments();

    const now = new Date();
    let periodStart = new Date(0);
    if (period === "this_month") { periodStart = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (period === "last_month") { periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); }
    else if (period === "last_3_months") { periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); }
    else if (period === "this_year") { periodStart = new Date(now.getFullYear(), 0, 1); }

    const lawyers = allUsers.filter(u =>
      (u.role === "employee" || u.role === "department_head") &&
      u.isActive &&
      (!departmentFilter || u.departmentId === departmentFilter)
    );

    const results = lawyers.map(lawyer => {
      // BOTH assignment fields, primary first. This filter read responsibleLawyerId
      // ALONE, and responsibleLawyerId has no input anywhere in the UI — the
      // reassign dialog and the مهامي assignment both write primaryLawyerId only.
      // So a lawyer assigned through either of them counted ZERO cases here: no
      // active, no closed, no hearings, an empty performance row.
      const lawyerCases = allCases.filter(
        c => c.primaryLawyerId === lawyer.id || c.responsibleLawyerId === lawyer.id,
      );
      const activeCases = lawyerCases.filter(c => (c.currentStage as string) !== "مقفلة" && (c.currentStage as string) !== "مغلق");
      const closedCases = lawyerCases.filter(c =>
        ((c.currentStage as string) === "مقفلة" || (c.currentStage as string) === "مغلق") &&
        new Date(c.updatedAt) >= periodStart
      );

      const caseIds = lawyerCases.map(c => c.id);
      const lawyerHearings = allHearings.filter(h => caseIds.includes(h.caseId));
      const completedHearings = lawyerHearings.filter(h => h.status === "تمت");

      const hearingsOnTime = completedHearings.filter(h => {
        if (!h.updatedAt || !h.hearingDate) return false;
        const hearingDate = new Date(h.hearingDate);
        const updateDate = new Date(h.updatedAt);
        return (updateDate.getTime() - hearingDate.getTime()) < 8 * 60 * 60 * 1000;
      }).length;

      const lawyerMemos = allMemos.filter(m => m.assignedTo === lawyer.id);
      const completedMemos = lawyerMemos.filter(m => m.completedAt);
      const avgMemoDays = completedMemos.length > 0
        ? completedMemos.reduce((sum, m) => {
            const created = new Date(m.createdAt);
            const completed = new Date(m.completedAt!);
            return sum + (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / completedMemos.length
        : 0;
      const overdueMemos = lawyerMemos.filter(m =>
        !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status) &&
        m.deadline && new Date(m.deadline) < now
      ).length;

      // judgment_side holds THREE values (لصالحنا / ضدنا / جزئي) — partial
      // judgments became recordable and are written here like the others.
      // Counting only two used to make جزئي vanish: it was neither won nor lost
      // AND absent from the denominator, so a lawyer whose judgments were all
      // partial showed totalJudgments = 0 and a 0% win rate. Partial is now its
      // own reported bucket and is IN the denominator, so the rate is a share of
      // all judgments rather than of an arbitrary subset.
      const judgmentHearings = lawyerHearings.filter(h => h.result === "حكم");
      const wonCases = judgmentHearings.filter(h => h.judgmentSide === "لصالحنا").length;
      const lostCases = judgmentHearings.filter(h => h.judgmentSide === "ضدنا").length;
      const partialCases = judgmentHearings.filter(h => h.judgmentSide === "جزئي").length;
      const totalJudgments = wonCases + lostCases + partialCases;
      const winRate = totalJudgments > 0 ? (wonCases / totalJudgments) * 100 : 0;

      const totalCases = activeCases.length + closedCases.length;
      const closureRate = totalCases > 0 ? (closedCases.length / totalCases) * 100 : 0;
      const hearingUpdateRate = completedHearings.length > 0 ? (hearingsOnTime / completedHearings.length) * 100 : 0;

      const normalizedClosure = Math.min(closureRate, 100) / 100;
      const normalizedHearing = Math.min(hearingUpdateRate, 100) / 100;
      const normalizedMemo = avgMemoDays > 0 ? Math.max(0, 1 - (avgMemoDays / 30)) : 0.5;
      const normalizedWin = Math.min(winRate, 100) / 100;
      const overallScore = (normalizedClosure * 0.3 + normalizedHearing * 0.25 + normalizedMemo * 0.25 + normalizedWin * 0.2) * 5;

      const dept = depts.find(d => d.id === lawyer.departmentId);

      return {
        userId: lawyer.id,
        userName: lawyer.name,
        departmentName: dept?.name || "غير محدد",
        departmentId: lawyer.departmentId || "",
        activeCases: activeCases.length,
        closedCases: closedCases.length,
        closureRate: Math.round(closureRate * 10) / 10,
        hearingsOnTime,
        totalHearings: completedHearings.length,
        hearingUpdateRate: Math.round(hearingUpdateRate * 10) / 10,
        avgMemoDays: Math.round(avgMemoDays * 10) / 10,
        overdueMemos,
        wonCases,
        lostCases,
        // Surfaced so a partial judgment is visible in the payload rather than
        // silently absorbed into the denominator. Additive: existing consumers
        // (kpis.tsx reads winRate only) are unaffected.
        partialCases,
        winRate: Math.round(winRate * 10) / 10,
        overallScore: Math.round(overallScore * 10) / 10,
      };
    });

    res.json(results);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب إحصائيات الأداء" });
    }
  });

  // ==================== Case Activity Log ====================

  app.get("/api/cases/:id/activity", requireAuth, async (req: AuthRequest, res) => {
    try {
      const logs = await storage.getCaseActivities(String(req.params.id));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب سجل النشاط" });
    }
  });

  // ==================== Case Comments ====================

  app.get("/api/cases/:id/comments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const comments = await storage.getCommentsByCaseId(String(req.params.id));
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب التعليقات" });
    }
  });

  app.post("/api/cases/:id/comments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      // Anyone who can view the case can comment on it — admins, the
      // dept_head of the case's department, and any assigned lawyer
      // (primary / responsible / in assignedLawyers / internal reviewer).
      // Previously this was gated to assigned-lawyer only, which made
      // the "إضافة" button silently 403 for branch_managers / admin_support
      // / dept_heads opening a case detail dialog.
      if (!canViewCase(user, caseItem, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لإضافة تعليق على هذه القضية" });
      }
      // 2D'-V3 Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = caseCommentSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { content } = req.body;
      if (!content || !String(content).trim()) {
        return res.status(400).json({ error: "محتوى التعليق مطلوب" });
      }
      const comment = await storage.createCaseComment({
        caseId: String(req.params.id),
        userId: user.id,
        userName: user.name || user.id,
        content: String(content).trim(),
      });
      res.status(201).json(comment);
    } catch (error) {
      console.error("[POST /api/cases/:id/comments] failed", error);
      res.status(500).json({ error: "حدث خطأ في إضافة التعليق" });
    }
  });

  // ==================== Case Notes ====================

  app.get("/api/cases/:id/notes", requireAuth, async (req: AuthRequest, res) => {
    try {
      const notes = await storage.getCaseNotes(String(req.params.id));
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الملاحظات" });
    }
  });

  app.post("/api/cases/:id/notes", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      // Match the case-comments POST gate: anyone who can VIEW the case
      // can drop an internal note. The previous rule (assigned-lawyer
      // OR modify) silently 403'd dept_heads viewing a case outside
      // their dept and any read-only viewer who tried to leave a note.
      if (!canViewCase(user, caseItem, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لإضافة ملاحظة على هذه القضية" });
      }
      // 2D'-V3 Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = createCaseNoteSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const { content } = req.body;
      if (!content || !String(content).trim()) {
        return res.status(400).json({ error: "محتوى الملاحظة مطلوب" });
      }
      // user.name is populated from the JWT — but pre-existing tokens
      // issued before the JWT-name fix carry no name, in which case
      // requireAuth fills it with user.id as a sentinel. Either way we
      // get a non-null string here, so the NOT-NULL user_name column
      // accepts the row.
      const userName = user.name || user.id;
      const note = await storage.createCaseNote({
        ...req.body,
        content: String(content).trim().substring(0, 5000),
        caseId: String(req.params.id),
        userId: user.id,
        userName,
      });
      await logCaseActivityActing(req, {
        caseId: String(req.params.id),
        userId: user.id,
        userName,
        actionType: "note_added",
        title: "تمت إضافة ملاحظة داخلية",
      });
      res.json(note);
    } catch (error) {
      // Surface the real cause in server logs — silent 500s here have
      // burned us before. The client still gets a sanitized message.
      console.error("[POST /api/cases/:id/notes] failed", error);
      res.status(500).json({ error: "حدث خطأ في إضافة الملاحظة" });
    }
  });

  app.patch("/api/case-notes/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const adminRoles = ["branch_manager", "admin_support", "department_head", "cases_review_head"];
      const existing = await storage.getCaseNoteById(String(req.params.id));
      if (!existing) return res.status(404).json({ message: "ملاحظة غير موجودة" });
      if (!adminRoles.includes(user.role) && existing.userId !== user.id) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه الملاحظة" });
      }
      // 2D'-V3 Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = updateCaseNoteSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      const note = await storage.updateCaseNote(String(req.params.id), { ...req.body, editedAt: new Date() });
      if (!note) return res.status(404).json({ message: "ملاحظة غير موجودة" });
      res.json(note);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الملاحظة" });
    }
  });

  app.delete("/api/case-notes/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const adminRoles = ["branch_manager", "admin_support"];
      const existing = await storage.getCaseNoteById(String(req.params.id));
      if (!existing) return res.status(404).json({ message: "ملاحظة غير موجودة" });
      if (!adminRoles.includes(user.role) && existing.userId !== user.id) {
        return res.status(403).json({ error: "لا تملك صلاحية حذف هذه الملاحظة" });
      }
      await storage.deleteCaseNote(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الملاحظة" });
    }
  });

  // ==================== Legal Deadlines ====================

  app.get("/api/legal-deadlines", requireAuth, async (req: AuthRequest, res) => {
    try {
      const caseId = req.query.caseId as string;
      if (caseId) {
        const deadlines = await storage.getLegalDeadlinesByCase(caseId);
        res.json(deadlines);
      } else {
        const deadlines = await storage.getAllLegalDeadlines();
        res.json(deadlines);
      }
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المواعيد النظامية" });
    }
  });

  app.post("/api/legal-deadlines", requireAuth, async (req: AuthRequest, res) => {
    try {
      const validated = insertLegalDeadlineSchema.parse(req.body);
      // Phase 5 A2/M2 — a deadline may only be attached to a case the user can
      // modify (was requireAuth-only: any user could attach a deadline to any
      // case). The FE only ever POSTs from the case-detail view of a case the
      // user already has open, so every legitimate caller passes.
      const user = req.user!;
      if (validated.caseId) {
        const targetCase = await storage.getCaseById(validated.caseId);
        if (targetCase && !canModifyCase(user, targetCase, req.actingContext)) {
          return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
        }
      }
      const deadline = await storage.createLegalDeadline(validated);
      if (validated.caseId) {
        const user = req.user!;
        await logCaseActivityActing(req, {
          caseId: validated.caseId,
          userId: user.id,
          userName: user.name,
          actionType: "case_updated",
          title: `تم إضافة موعد نظامي: ${validated.title}`,
        });
      }
      res.json(deadline);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إضافة الموعد النظامي" });
    }
  });

  app.patch("/api/legal-deadlines/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      // 2D'-V2b Pattern-A gate: type check only; handler checks below stay.
      const bodyCheck = updateLegalDeadlineSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      // Phase 5 A2/M2 — only someone who can modify the parent case may edit
      // its deadlines (was requireAuth-only IDOR).
      //
      // 🔴 THE GATE USED TO BE SKIPPABLE TWO WAYS, and both are closed here. It
      // read `if (caseId) { if (targetCase && !canModifyCase(…)) 403 }`, so a
      // falsy caseId skipped it entirely and a case that failed to load skipped
      // it too — an unresolvable parent silently became "allowed". Both now FAIL
      // CLOSED via resolveDeadlineParentCase.
      //
      // WHAT THOSE TWO STATES ACTUALLY ARE (checked, not assumed):
      //   • caseId falsy — UNREACHABLE through any live route. The column is
      //     `notNull()` (schema.ts:1330) AND insertLegalDeadlineSchema types it
      //     `z.string().min(1)` (schema.ts:5291), so the create route 400s on a
      //     missing or empty value before storage sees it, and the DB would
      //     reject NULL regardless. LegalDeadline is $inferSelect, so `caseId` is
      //     `string` — TypeScript never thought it could be null either. There is
      //     no such thing as a case-less legal deadline and nobody legitimately
      //     edits one; only a raw SQL insert of "" could manufacture it.
      //   • targetCase falsy — an ORPHAN: the parent case was deleted. Batch M's
      //     legal_deadlines_case_id_fkey is ON DELETE CASCADE, so this cannot
      //     survive on a database that has the FK — but the FK is one of the
      //     commented declarations that live only where apply-fk-constraints.sql
      //     has been run, so a dev DB reset since the last run CAN hold orphans.
      // Neither is a capability. Refusing both is the only honest answer: there
      // is no case against which to evaluate authority, so authority is absent.
      const existingDeadline = await storage.getLegalDeadlineById(String(req.params.id));
      if (!existingDeadline) return res.status(404).json({ message: "موعد غير موجود" });
      const user = req.user!;
      if (!await canModifyDeadlineParentCase(user, existingDeadline, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      // Batch 1.5b — OBSERVE ONLY. legal_deadlines has NO assignee column of any
      // kind, so ownership is entirely the parent case's: feed block 9 sets
      // ownerId = primaryLawyerId || responsibleLawyerId || "", which IS
      // caseNotificationRecipientId — the canonical resolution, used via the
      // shared helper rather than re-writing the chain. assignedTo is reported as
      // "" because the row genuinely has none; rightfulOwnerIds carries the lawyer.
      // The parent case is re-read here rather than threaded out of the gate: this
      // route is low-traffic, and the alternative is reshaping a gate that must
      // stay a pure boolean. DELETE is deliberately NOT observed — deleting a
      // deadline is not "completing someone's task".
      {
        const parentCase = existingDeadline.caseId
          ? await storage.getCaseById(existingDeadline.caseId)
          : null;
        warnIfNotTaskOwner(req, {
          endpoint: "PATCH /api/legal-deadlines/:id",
          taskId: existingDeadline.id,
          taskType: "legal_deadline",
          rightfulOwnerIds: [caseNotificationRecipientId(parentCase)],
          caseId: existingDeadline.caseId ?? null,
          assignedTo: null,
        });
      }
      const deadline = await storage.updateLegalDeadline(String(req.params.id), req.body);
      if (!deadline) return res.status(404).json({ message: "موعد غير موجود" });
      res.json(deadline);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الموعد النظامي" });
    }
  });

  app.delete("/api/legal-deadlines/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Phase 5 A2/M2 — only someone who can modify the parent case may delete
      // its deadlines (was requireAuth-only IDOR; deletes also previously
      // returned success even for a non-existent id).
      // Same two skippable holes as the PATCH above, closed the same way and for
      // the same reasons — see that comment for what each state actually is.
      const existingDeadline = await storage.getLegalDeadlineById(String(req.params.id));
      if (!existingDeadline) return res.status(404).json({ message: "موعد غير موجود" });
      const user = req.user!;
      if (!await canModifyDeadlineParentCase(user, existingDeadline, req.actingContext)) {
        return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      }
      await storage.deleteLegalDeadline(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الموعد النظامي" });
    }
  });

  // ==================== Delegations ====================

  // Item 4 — the /delegations page is now open to EVERY authenticated user (the
  // sidebar link is no longer manager-only), so this list is role-scoped
  // server-side: managers/approvers (branch_manager / department_head /
  // admin_support) see all delegations; everyone else sees ONLY the ones they
  // are a party to (delegator or delegate). Prevents leaking other people's
  // delegations to a regular user who can now reach the page.
  app.get("/api/delegations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const all = await storage.getAllDelegations();
      const canSeeAll = ["branch_manager", "department_head", "admin_support"].includes(user.role);
      const delegations = canSeeAll
        ? all
        : all.filter((d) => d.fromUserId === user.id || d.toUserId === user.id);
      res.json(delegations);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب التفويضات" });
    }
  });

  // 4d — read-only: the active delegations where the CURRENT user is the
  // delegate. This reuses req.actingContext — the SAME canonical set the
  // server resolves for act-as (active + approved + in-window + the delegator
  // still active) — and enriches each with the delegator's display name so the
  // FE can show an "acting on behalf of" banner. Empty list = the user holds no
  // inherited authority (the banner renders nothing). Display/info only — it
  // grants nothing; the authority itself is resolved per-request server-side.
  app.get("/api/delegations/acting-as", requireAuth, async (req: AuthRequest, res) => {
    try {
      const ctx = req.actingContext;
      if (!ctx || ctx.delegators.length === 0) {
        return res.json({ delegators: [] });
      }
      const delegators = await Promise.all(
        ctx.delegators.map(async (d) => {
          const u = await storage.getUser(d.userId);
          return { userId: d.userId, name: u?.name ?? d.userId };
        }),
      );
      res.json({ delegators });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب التفويضات النشطة" });
    }
  });

  // المستخدمون transparency badges — every CURRENTLY-VALID delegation
  // (status نشط + approved + today within start–end) as lean {fromUserId,
  // toUserId} pairs, readable by EVERY authenticated user so the users page can
  // show "who is currently acting for whom". Deliberately public and minimal:
  // no reason/details/dates exposed; the FE maps the two ids to names from the
  // already-loaded users list (no N+1). Same validity predicate as the act-as
  // resolver (getActingContext): نشط + approvedBy set + in-window. startDate/
  // endDate are varchar "YYYY-MM-DD" → direct lexical comparison is correct.
  // Registered BEFORE /:id (a literal) so the :id capture never swallows it.
  app.get("/api/delegations/active", requireAuth, async (_req: AuthRequest, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const all = await storage.getAllDelegations();
      const active = all
        .filter((d) =>
          d.status === "نشط" &&
          d.approvedBy != null &&
          d.startDate <= today &&
          d.endDate >= today,
        )
        .map((d) => ({ fromUserId: d.fromUserId, toUserId: d.toUserId }));
      res.json(active);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب التفويضات النشطة" });
    }
  });

  // Item 2 — single delegation (for the approval modal's details block). Gate
  // mirrors the list scope: a party (delegator/delegate) or a manager/approver
  // may read it. Registered AFTER /acting-as (a literal) so the :id capture
  // never swallows that path.
  app.get("/api/delegations/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const delegation = await storage.getDelegation(String(req.params.id));
      if (!delegation) return res.status(404).json({ error: "تفويض غير موجود" });
      const canSeeAll = ["branch_manager", "department_head", "admin_support"].includes(user.role);
      const isParty = delegation.fromUserId === user.id || delegation.toUserId === user.id;
      if (!canSeeAll && !isParty) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذا التفويض" });
      }
      res.json(delegation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب التفويض" });
    }
  });

  app.post("/api/delegations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const parsed = insertDelegationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const delegation = await storage.createDelegation({
        ...req.body,
        fromUserId: user.id,
      });
      const allUsers = await storage.getAllUsers();
      const deptHead = allUsers.find(u => u.departmentId === user.departmentId && u.role === "department_head");
      if (deptHead) {
        await storage.createNotification({
          type: "delegation_requested",
          title: "طلب تفويض جديد",
          message: `${user.name} يطلب تفويض قضاياه إلى محامي آخر من ${req.body.startDate} إلى ${req.body.endDate}`,
          priority: "high",
          status: "pending",
          senderId: user.id,
          senderName: user.name,
          recipientId: deptHead.id,
          relatedType: "task",
          relatedId: delegation.id,
          requiresResponse: true,
        });
      }
      res.json(delegation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء التفويض" });
    }
  });

  app.patch("/api/delegations/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const adminRoles = ["branch_manager", "admin_support", "department_head"];
      const existing = await storage.getDelegation(String(req.params.id));
      if (!existing) return res.status(404).json({ message: "تفويض غير موجود" });
      if (!adminRoles.includes(user.role) && existing.fromUserId !== user.id) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذا التفويض" });
      }
      // 2D'-V1b Pattern-A gate: validate types only, then keep using
      // req.body untouched.
      const bodyCheck = updateDelegationSchema.safeParse(req.body);
      if (!bodyCheck.success) {
        return res.status(400).json({ error: bodyCheck.error.errors });
      }
      // Phase 5 A2/H3 — status may ONLY be set to "ملغي" (cancel) via PATCH.
      // Activation ("نشط") and every other status value flow EXCLUSIVELY
      // through the role-gated /api/delegations/:id/approve route — this closes
      // the self-activation bypass where a delegation's own creator PATCHed
      // status:"نشط" to approve their own delegation. The sole legitimate FE
      // PATCH (delegations.tsx cancel) sends status:"ملغي", so it still passes.
      if (req.body.status !== undefined && req.body.status !== "ملغي") {
        return res.status(403).json({ error: "لا يمكن تفعيل التفويض عبر هذا المسار؛ الاعتماد يتم عبر مسار الاعتماد المخصص فقط" });
      }
      // approvedBy/approvedAt are stamped only by the /approve route, never
      // from the request body (destructure-omit, mirrors sanitizeUser).
      const { approvedBy, approvedAt, ...delegationUpdate } = req.body;
      const delegation = await storage.updateDelegation(String(req.params.id), delegationUpdate);
      if (!delegation) return res.status(404).json({ message: "تفويض غير موجود" });
      res.json(delegation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث التفويض" });
    }
  });

  app.post("/api/delegations/:id/approve", requireAuth, requireRole("branch_manager", "department_head", "admin_support"), async (req: AuthRequest, res) => {
    try {
      const user = req.user!;

      // Check the delegation exists first and validate users are active
      const existingDelegation = await storage.getDelegation(String(req.params.id));
      if (!existingDelegation) return res.status(404).json({ message: "تفويض غير موجود" });

      // 4c-6 guardrail (privilege self-cycle, real id) — nobody may approve a
      // delegation they are personally a party to. Compares the REAL human id,
      // so an inherited approve role (now that requireRole is delegation-aware)
      // cannot be used to self-approve one's own incoming/outgoing delegation
      // (which would let a delegate activate/perpetuate their own act-as). Also
      // closes the long-standing self-approval hole for real approvers.
      if (existingDelegation.fromUserId === user.id || existingDelegation.toUserId === user.id) {
        return res.status(403).json({ error: "لا يمكنك اعتماد تفويض أنت طرف فيه" });
      }

      // Validate both fromUser and toUser are active before approving
      const { valid } = await validateAssignedUsersActive([existingDelegation.fromUserId, existingDelegation.toUserId]);
      if (!valid) {
        return res.status(400).json({ error: "لا يمكن اعتماد التفويض: أحد المستخدمين غير نشط" });
      }

      const delegation = await storage.updateDelegation(String(req.params.id), {
        status: "نشط",
        approvedBy: user.id,
        approvedAt: new Date(),
      });
      if (!delegation) return res.status(404).json({ message: "تفويض غير موجود" });
      const toUser = await storage.getUser(delegation.toUserId);
      const fromUser = await storage.getUser(delegation.fromUserId);
      if (toUser && fromUser) {
        await storage.createNotification({
          type: "delegation_approved",
          title: "تم اعتماد التفويض",
          message: `تم تفويضك على قضايا ${fromUser.name} من ${delegation.startDate} إلى ${delegation.endDate}`,
          priority: "high",
          status: "pending",
          senderId: user.id,
          senderName: user.name,
          recipientId: toUser.id,
        });
        await storage.createNotification({
          type: "delegation_approved",
          title: "تم اعتماد التفويض",
          message: `تمت الموافقة على تفويض قضاياك إلى ${toUser.name}`,
          priority: "medium",
          status: "pending",
          senderId: user.id,
          senderName: user.name,
          recipientId: fromUser.id,
        });
      }
      res.json(delegation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في اعتماد التفويض" });
    }
  });

  // Item 2 — REJECT a pending delegation. Same gate + guardrails as /approve
  // (branch_manager / department_head / admin_support, never a party). Requires
  // a rejection reason. Sets status "مرفوض" + stores the reason, and notifies
  // BOTH parties (delegator + delegate), mirroring the approval notifications.
  app.post("/api/delegations/:id/reject", requireAuth, requireRole("branch_manager", "department_head", "admin_support"), async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!reason) {
        return res.status(400).json({ error: "سبب الرفض مطلوب" });
      }
      const existingDelegation = await storage.getDelegation(String(req.params.id));
      if (!existingDelegation) return res.status(404).json({ message: "تفويض غير موجود" });
      // Same self-cycle guardrail as /approve — nobody may reject a delegation
      // they are personally a party to (real human id).
      if (existingDelegation.fromUserId === user.id || existingDelegation.toUserId === user.id) {
        return res.status(403).json({ error: "لا يمكنك رفض تفويض أنت طرف فيه" });
      }
      const delegation = await storage.updateDelegation(String(req.params.id), {
        status: "مرفوض",
        rejectionReason: reason,
      });
      if (!delegation) return res.status(404).json({ message: "تفويض غير موجود" });
      const toUser = await storage.getUser(delegation.toUserId);
      const fromUser = await storage.getUser(delegation.fromUserId);
      if (toUser && fromUser) {
        await storage.createNotification({
          type: "delegation_rejected",
          title: "تم رفض التفويض",
          message: `تم رفض تفويض قضايا ${fromUser.name} إليك. السبب: ${reason}`,
          priority: "high",
          status: "pending",
          senderId: user.id,
          senderName: user.name,
          recipientId: toUser.id,
        });
        await storage.createNotification({
          type: "delegation_rejected",
          title: "تم رفض التفويض",
          message: `تم رفض طلب تفويض قضاياك إلى ${toUser.name}. السبب: ${reason}`,
          priority: "high",
          status: "pending",
          senderId: user.id,
          senderName: user.name,
          recipientId: fromUser.id,
        });
      }
      res.json(delegation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في رفض التفويض" });
    }
  });

  // ==================== Smart Search ====================

  app.get("/api/search", requireAuth, async (req: AuthRequest, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    const type = req.query.type as string;
    if (q.length < 2) return res.json({ results: [] });
    const user = req.user!;
    const results: any[] = [];

    if (!type || type === "cases") {
      let cases = await storage.getAllCases();
      if (user.role === "employee") {
        // primary first, responsible as fallback. The department clause masked
        // this for most users, but an employee searching a case in ANOTHER
        // department that is assigned to them by primaryLawyerId found nothing.
        cases = cases.filter(c =>
          c.primaryLawyerId === user.id
          || c.responsibleLawyerId === user.id
          || c.departmentId === user.departmentId);
      } else if (user.role === "department_head") {
        cases = cases.filter(c => c.departmentId === user.departmentId);
      }
      cases.filter(c =>
        c.caseNumber?.toLowerCase().includes(q) ||
        c.opponentName?.toLowerCase().includes(q) ||
        c.courtName?.toLowerCase().includes(q) ||
        c.courtCaseNumber?.toLowerCase().includes(q)
      ).slice(0, 10).forEach(c => results.push({
        type: "case", id: c.id, title: `قضية ${c.caseNumber}`, subtitle: `${c.opponentName || ""} - ${c.courtName || ""}`, url: `/cases/${c.id}`, icon: "Scale",
      }));
    }

    if (!type || type === "hearings") {
      const hearingsList = await storage.getAllHearings();
      hearingsList.filter(h =>
        h.courtName?.toLowerCase().includes(q) ||
        h.notes?.toLowerCase().includes(q) ||
        h.resultDetails?.toLowerCase().includes(q)
      ).slice(0, 10).forEach(h => results.push({
        type: "hearing", id: h.id, title: `جلسة ${h.hearingDate}`, subtitle: `${h.courtName || ""} - ${h.status}`, url: `/hearings`, icon: "Gavel",
      }));
    }

    if (!type || type === "memos") {
      const memosList = await storage.getAllMemos();
      memosList.filter(m =>
        m.title?.toLowerCase().includes(q)
      ).slice(0, 10).forEach(m => results.push({
        type: "memo", id: m.id, title: m.title, subtitle: `${m.status} - ${m.deadline}`, url: `/cases/${m.caseId}`, icon: "FileText",
      }));
    }

    if (!type || type === "clients") {
      const clientsList = await storage.getAllClients();
      clientsList.filter(c =>
        c.individualName?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.nationalId?.includes(q)
      ).slice(0, 10).forEach(c => results.push({
        type: "client", id: c.id, title: c.individualName || c.companyName || "", subtitle: `${c.phone || ""}`, url: `/clients`, icon: "User",
      }));
    }

    if (!type || type === "consultations") {
      const consultationsList = await storage.getAllConsultations();
      consultationsList.filter(c =>
        c.consultationNumber?.toLowerCase().includes(q) ||
        c.questionSummary?.toLowerCase().includes(q)
      ).slice(0, 10).forEach(c => results.push({
        type: "consultation", id: c.id, title: `استشارة ${c.consultationNumber}`, subtitle: c.status, url: `/consultations`, icon: "MessageSquare",
      }));
    }

    res.json({ results });
  });

  // ==================== Court Analytics ====================

  app.get("/api/stats/court-analytics", requireAuth, requireRole("branch_manager", "cases_review_head", "consultations_review_head", "viewer"), async (req: AuthRequest, res) => {
    const cases = await storage.getAllCases();
    const hearingsList = await storage.getAllHearings();

    const byCourtType: Record<string, number> = {};
    hearingsList.forEach(h => {
      const court = h.courtName || "غير محدد";
      byCourtType[court] = (byCourtType[court] || 0) + 1;
    });

    const byResult: Record<string, { won: number; lost: number; partial: number }> = {};
    hearingsList.filter(h => h.result === "حكم").forEach(h => {
      const caseInfo = cases.find(c => c.id === h.caseId);
      const caseType = caseInfo?.caseType || "غير محدد";
      if (!byResult[caseType]) byResult[caseType] = { won: 0, lost: 0, partial: 0 };
      if (h.judgmentSide === "لصالحنا") byResult[caseType].won++;
      else if (h.judgmentSide === "ضدنا") byResult[caseType].lost++;
      else byResult[caseType].partial++;
    });

    const avgDuration: Record<string, number[]> = {};
    cases.filter(c => (c.currentStage as string) === "مقفلة" || (c.currentStage as string) === "مغلق").forEach(c => {
      const cType = c.caseType || "غير محدد";
      const duration = (new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (!avgDuration[cType]) avgDuration[cType] = [];
      avgDuration[cType].push(duration);
    });

    const avgDurationResult: Record<string, number> = {};
    Object.entries(avgDuration).forEach(([cType, durations]) => {
      avgDurationResult[cType] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    });

    res.json({ byCourtType, byResult, avgDuration: avgDurationResult });
  });

  // ==================== Smart Dashboard ====================

  app.get("/api/dashboard/smart", requireAuth, async (req: AuthRequest, res) => {
    const user = req.user!;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const hour = now.getHours();
    const greeting = hour < 12 ? `صباح الخير ${user.name}` : `مساء الخير ${user.name}`;

    const allCases = await storage.getAllCases();
    const allHearings = await storage.getAllHearings();
    const allMemos = await storage.getAllMemos();

    let userCases = allCases;
    if (user.role === "employee") {
      // primary first, responsible as fallback — see the performance-report note.
      userCases = allCases.filter(
        c => c.primaryLawyerId === user.id || c.responsibleLawyerId === user.id,
      );
    } else if (user.role === "department_head") {
      userCases = allCases.filter(c => c.departmentId === user.departmentId);
    }

    const caseIds = userCases.map(c => c.id);

    const todayHearings = allHearings.filter(h => h.hearingDate === todayStr && caseIds.includes(h.caseId));

    const alerts: any[] = [];

    allHearings.filter(h => {
      if (h.status !== "قادمة") return false;
      if (!caseIds.includes(h.caseId)) return false;
      const hDate = new Date(h.hearingDate);
      return hDate < now;
    }).forEach(h => {
      const caseInfo = userCases.find(c => c.id === h.caseId);
      alerts.push({
        type: "overdue_hearing",
        priority: "urgent",
        message: `جلسة بتاريخ ${h.hearingDate} لم تُحدَّث (${caseInfo?.caseNumber || ""})`,
        url: `/hearings`,
        relatedId: h.id,
      });
    });

    const userMemos = user.role === "employee"
      ? allMemos.filter(m => m.assignedTo === user.id)
      : allMemos.filter(m => caseIds.includes(m.caseId));
    userMemos.filter(m =>
      !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status) &&
      m.deadline && new Date(m.deadline) < now
    ).forEach(m => {
      alerts.push({
        type: "overdue_memo",
        priority: "high",
        message: `مذكرة "${m.title}" متأخرة عن الموعد`,
        url: `/cases/${m.caseId}`,
        relatedId: m.id,
      });
    });

    let deadlines = await storage.getAllLegalDeadlines();
    deadlines = deadlines.filter(d => d.status === "نشط" && caseIds.includes(d.caseId));
    const upcomingDeadlines = deadlines.filter(d => {
      const dDate = new Date(d.deadlineDate);
      const daysLeft = (dDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return daysLeft > 0 && daysLeft <= 7;
    }).map(d => {
      const dDate = new Date(d.deadlineDate);
      const daysLeft = Math.ceil((dDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...d, daysLeft };
    });

    const unreadNotifications = await storage.getUnreadNotificationCount(user.id);

    const activeCases = userCases.filter(c => (c.currentStage as string) !== "مقفلة" && (c.currentStage as string) !== "مغلق" && !c.isArchived);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const closedThisMonth = userCases.filter(c =>
      ((c.currentStage as string) === "مقفلة" || (c.currentStage as string) === "مغلق") &&
      new Date(c.updatedAt) >= thisMonth
    );

    const performanceStats = {
      activeCases: activeCases.length,
      closedThisMonth: closedThisMonth.length,
      totalCases: userCases.length,
      overdueMemos: userMemos.filter(m => !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status) && m.deadline && new Date(m.deadline) < now).length,
      todayHearingsCount: todayHearings.length,
      upcomingDeadlinesCount: upcomingDeadlines.length,
      unreadNotifications,
    };

    let comparison;
    if (user.role === "branch_manager" || user.role === "cases_review_head") {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const newThisMonth = allCases.filter(c => new Date(c.createdAt) >= thisMonth).length;
      const newLastMonth = allCases.filter(c => new Date(c.createdAt) >= lastMonth && new Date(c.createdAt) <= lastMonthEnd).length;
      comparison = {
        newCasesChange: newLastMonth > 0 ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100) : 0,
        closedChange: 0,
      };
    }

    res.json({
      greeting,
      todayHearings,
      alerts: alerts.sort((a, b) => (a.priority === "urgent" ? -1 : 1)),
      overdueItems: alerts,
      upcomingDeadlines,
      performanceStats,
      comparison,
    });
  });

  // ==================== Export ====================

  function generateCSV(data: any[], headers: string[], keys: string[]): string {
    const header = headers.join(",");
    const rows = data.map(item =>
      keys.map(key => {
        const val = item[key] || "";
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",")
    );
    return [header, ...rows].join("\n");
  }

  app.get("/api/export/cases", requireAuth, async (req: AuthRequest, res) => {
    const user = req.user!;
    if (!["branch_manager", "cases_review_head", "department_head"].includes(user.role)) {
      return res.status(403).json({ message: "غير مصرح" });
    }
    let cases = await storage.getAllCases();
    const { departmentId, status, dateFrom, dateTo } = req.query;
    if (departmentId) cases = cases.filter(c => c.departmentId === String(departmentId));
    if (status) cases = cases.filter(c => c.currentStage === String(status));
    if (dateFrom) cases = cases.filter(c => new Date(c.createdAt) >= new Date(String(dateFrom)));
    if (dateTo) cases = cases.filter(c => new Date(c.createdAt) <= new Date(String(dateTo)));

    const allUsers = await storage.getAllUsers();
    const depts = await storage.getAllDepartments();

    const exportData = cases.map(c => ({
      caseNumber: c.caseNumber,
      caseType: c.caseType,
      opponentName: c.opponentName,
      courtName: c.courtName,
      currentStage: c.currentStage,
      lawyer: allUsers.find(u => u.id === c.responsibleLawyerId)?.name || "",
      department: depts.find(d => d.id === c.departmentId)?.name || "",
      createdAt: c.createdAt,
      priority: c.priority,
    }));

    const csv = generateCSV(exportData,
      ["رقم القضية", "نوع القضية", "الخصم", "المحكمة", "المرحلة", "المحامي", "القسم", "تاريخ الإنشاء", "الأولوية"],
      ["caseNumber", "caseType", "opponentName", "courtName", "currentStage", "lawyer", "department", "createdAt", "priority"]
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=cases-${Date.now()}.csv`);
    res.send("\uFEFF" + csv);
  });

  app.get("/api/export/hearings", requireAuth, async (req: AuthRequest, res) => {
    const user = req.user!;
    if (!["branch_manager", "cases_review_head", "department_head"].includes(user.role)) {
      return res.status(403).json({ message: "غير مصرح" });
    }
    const hearingsList = await storage.getAllHearings();
    const exportData = hearingsList.map(h => ({
      hearingDate: h.hearingDate, hearingTime: h.hearingTime, courtName: h.courtName, status: h.status, result: h.result || "", resultDetails: h.resultDetails || "",
    }));
    const csv = generateCSV(exportData, ["التاريخ", "الوقت", "المحكمة", "الحالة", "النتيجة", "تفاصيل النتيجة"], ["hearingDate", "hearingTime", "courtName", "status", "result", "resultDetails"]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=hearings-${Date.now()}.csv`);
    res.send("\uFEFF" + csv);
  });

  return httpServer;
}
