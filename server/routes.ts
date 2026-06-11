import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  loginSchema,
  insertUserSchema,
  updateUserSchema,
  insertClientSchema,
  insertCaseSchema,
  insertConsultationSchema,
  extendConsultationDeliverySchema,
  insertHearingSchema,
  insertFieldTaskSchema,
  insertAttachmentSchema,
  insertMemoSchema,
  hearingResultSchema,
  hearingReportSchema,
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
  CaseStagesOrder,
  ConsultationStage,
  ConsultationStagesAll,
  ConsultationStageLabels,
  ConsultationType,
  ConsultationTypeLabels,
  resolveConsultationType,
  getConsultationStagesForType,
  remapConsultationStageForType,
  isInFollowUpCycle,
  getStagesForConsultationCycle,
  ConsultationCategorySLADays,
  ConsultationCategory,
  ContractStage,
  ContractStagesAll,
  ContractStageLabels,
  ContractType,
  ContractTypeLabels,
  ContractActivityType,
  ContractStatus,
  ContractAttachmentSlot,
  ContractAttachmentSlotLabels,
  ContractSlotsByType,
  resolveContractType,
  getContractStagesForType,
  remapContractStageForType,
  insertContractSchema,
  InternalReviewDecision,
  CommitteeDecision,
  NoteOutcome,
  ConsultationClosureReason,
  ConsultationActivityType,
  getStagesForClassification,
  canCreateMemos,
  canReviewMemos,
  canChangeMemoStatus,
  canDeleteMemos,
  insertTicketSchema,
  canManageSupportTickets,
  insertLegalDeadlineSchema,
  insertSavedFilterSchema,
  updateSavedFilterSchema,
  SIDEBAR_SECTIONS,
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
} from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth, requireRole, generateToken, verifyTokenForRefresh, validatePassword, hashPassword, comparePassword, generateCsrfToken } from "./auth";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendToUser, broadcastToAdmins } from "./websocket";
import { Client as ObjectStorageClient } from "@replit/object-storage";

// Contract attachments live in Replit Object Storage now — the
// previous ./uploads/contracts/<id>/<file> layout was on the
// container's ephemeral disk, and every Autoscale restart / scale
// event / republish wiped the lot while leaving the DB rows pointing
// at vanished paths. The client constructor itself doesn't talk to
// the bucket; getBucket() runs lazily on first request, so this is
// safe even if REPLIT_OBJECT_STORAGE_BUCKET_ID isn't wired up at
// module load (the request handler surfaces a 500 with the actual
// error message in that case).
const contractObjectStore = new ObjectStorageClient();

const CONTRACT_OBJECT_KEY_PREFIX = "contracts/";

// Single source of truth for "is this row pointing at a fresh
// Object-Storage upload or a legacy disk path?". New rows store the
// object key ("contracts/<contractId>/<uuid>.pdf") in filePath;
// pre-migration rows still hold the disk path
// ("./uploads/contracts/..." or "uploads/contracts/...") whose
// underlying file is gone. The download handler returns 410 for
// legacy paths and the list response flags them as missing.
function isContractObjectKey(filePath: string): boolean {
  return typeof filePath === "string" && filePath.startsWith(CONTRACT_OBJECT_KEY_PREFIX);
}

function makeContractObjectKey(contractId: string, originalName: string): string {
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "");
  return `${CONTRACT_OBJECT_KEY_PREFIX}${contractId}/${randomUUID()}${ext}`;
}

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRoleType;
    name: string;
    departmentId: string | null;
  };
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
function canModifyCase(user: { id: string; role: string; departmentId: string | null }, caseData: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head", "viewer"];
  if (adminRoles.includes(user.role)) return true;
  if (user.role === "department_head" && caseData.departmentId === user.departmentId) return true;
  if (caseData.primaryLawyerId === user.id || caseData.responsibleLawyerId === user.id) return true;
  if (Array.isArray(caseData.assignedLawyers) && caseData.assignedLawyers.includes(user.id)) return true;
  if (caseData.internalReviewerId && caseData.internalReviewerId === user.id) return true;
  return false;
}

function canViewCase(user: { id: string; role: string; departmentId: string | null }, caseData: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head", "viewer"];
  if (adminRoles.includes(user.role)) return true;
  if (user.role === "department_head") return caseData.departmentId === user.departmentId;
  if (user.role === "employee") {
    return caseData.primaryLawyerId === user.id ||
      caseData.responsibleLawyerId === user.id ||
      (Array.isArray(caseData.assignedLawyers) && caseData.assignedLawyers.includes(user.id)) ||
      caseData.internalReviewerId === user.id;
  }
  return false;
}

function canEditCaseData(user: { id: string; role: string; departmentId: string | null }): boolean {
  return ["branch_manager", "admin_support"].includes(user.role);
}

function canModifyConsultation(user: { id: string; role: string; departmentId: string | null }, consultation: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head", "viewer"];
  if (adminRoles.includes(user.role)) return true;
  if (user.role === "department_head" && consultation.departmentId === user.departmentId) return true;
  if (consultation.assignedTo === user.id || consultation.createdBy === user.id) return true;
  return false;
}

function canActOnHearing(user: { id: string; role: string }, hearing: any): boolean {
  if (["branch_manager", "admin_support", "department_head", "viewer"].includes(user.role)) return true;
  if (hearing.attendingLawyerId && hearing.attendingLawyerId === user.id) return true;
  return false;
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
  { from: "مراجعة_داخلية", to: "إحالة_للجنة_المراجعة", allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "جاهزة_للرفع", allowedRoles: ["cases_review_head", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "الأخذ_بالملاحظات", allowedRoles: ["cases_review_head", "branch_manager"] },
  { from: "الأخذ_بالملاحظات", to: "جاهزة_للرفع", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "مراجعة_داخلية", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["internal_reviewer", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["cases_review_head", "branch_manager"] },

  // Skip data completion
  { from: "استلام", to: "دراسة", allowedRoles: ["department_head", "branch_manager", "assigned_lawyer"] },

  // ==================== GENERAL PATH (after ready_to_submit) ====================
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_ناجز", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_ناجز", to: "مداولة_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_ناجز", to: "منظورة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "أغلق_طلب_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "منظورة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "قيد_التدقيق_في_ناجز", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "قيد_التدقيق_في_معين", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "تحصيل", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "مقفلة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },

  // ==================== COMMERCIAL PATH (taradi then najiz) ====================
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_تراضي", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_تراضي", to: "مداولة_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },

  // ==================== LABOR PATH (settlement before drafting) ====================
  { from: "دراسة", to: "توجيه_العميل_بالتسوية", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "توجيه_العميل_بالتسوية", to: "بانتظار_رفع_العميل_للتسوية", allowedRoles: ["department_head", "assigned_lawyer"] },
  { from: "بانتظار_رفع_العميل_للتسوية", to: "مداولة_الصلح", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
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
  { from: "إحالة_للجنة_المراجعة", to: "منظورة", allowedRoles: ["cases_review_head", "branch_manager", "department_head"] },
  { from: "الأخذ_بالملاحظات", to: "منظورة", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },

  // ==================== POST-TRIAL TRANSITIONS ====================
  { from: "منظورة", to: "محكوم_حكم_ابتدائي", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "منظورة", to: "محكوم_حكم_نهائي", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "منظورة", to: "مشطوبة", allowedRoles: ["assigned_lawyer", "department_head"] },

  { from: "محكوم_حكم_ابتدائي", to: "منظورة_استئناف", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "محكوم_حكم_ابتدائي", to: "مقفلة", allowedRoles: ["department_head", "branch_manager"] },

  { from: "منظورة_استئناف", to: "محكوم_حكم_نهائي", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "منظورة_استئناف", to: "مشطوبة", allowedRoles: ["assigned_lawyer", "department_head"] },

  { from: "محكوم_حكم_نهائي", to: "تحصيل", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "محكوم_حكم_نهائي", to: "مقفلة", allowedRoles: ["department_head", "branch_manager"] },

  { from: "تحصيل", to: "مقفلة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },

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
  // the canonical flow is RECEIVED → PENDING_COMPLETION → STUDY. The
  // skip button on PENDING_COMPLETION is a separate /skip-completion
  // endpoint (logs completion_skipped instead of stage_advanced) but
  // still lands on STUDY — same target, different log entry.
  { from: ConsultationStage.RECEIVED,                    to: ConsultationStage.RECEIVED_PENDING_COMPLETION, allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: ConsultationStage.RECEIVED_PENDING_COMPLETION, to: ConsultationStage.STUDY,                       allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: ConsultationStage.STUDY,           to: ConsultationStage.DRAFTING,          allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: ConsultationStage.DRAFTING,        to: ConsultationStage.INTERNAL_REVIEW,   allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // Internal-review outcomes (enforced finely by the internal-review endpoint;
  // table stays permissive for assigned_lawyer + dept_head + branch_manager).
  { from: ConsultationStage.INTERNAL_REVIEW, to: ConsultationStage.DRAFTING,          allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
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
  // Data-completion → drafting (also reachable via /skip-completion
  // which uses the same allowed-roles set).
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

function canModifyContract(
  user: { id: string; role: string; departmentId: string | null },
  contract: any,
): boolean {
  // consultations_review_head IS admin-class here because they're the
  // committee chair for contracts. cases_review_head is intentionally
  // EXCLUDED — they chair the cases committee, which has nothing to
  // do with the contracts module. They can still see a contract if
  // they're personally on it (assigned / creator / internal reviewer).
  const adminRoles = ["branch_manager", "admin_support", "consultations_review_head", "viewer"];
  if (adminRoles.includes(user.role)) return true;
  if (user.role === "department_head" && contract.departmentId === user.departmentId) return true;
  if (contract.assignedTo === user.id || contract.createdBy === user.id) return true;
  if (contract.internalReviewerId === user.id) return true;
  return false;
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
  { from: MemoStage.COMMITTEE,       to: MemoStage.READY,           allowedRoles: ["cases_review_head", "branch_manager"] },
  { from: MemoStage.COMMITTEE,       to: MemoStage.TAKING_NOTES,    allowedRoles: ["cases_review_head", "branch_manager"] },
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

function validateStageTransition(
  currentStage: string,
  targetStage: string,
  userRole: string,
  entityType: "case" | "consultation" | "memo" | "contract",
  user?: { id: string; departmentId?: string | null },
  entityData?: any
): { allowed: boolean; reason?: string } {
  if (currentStage === targetStage) {
    return { allowed: false, reason: "العنصر في نفس المرحلة المطلوبة" };
  }

  // Early closure: branch_manager / admin_support / department_head (own
  // dept) / assigned lawyer can move a case from any stage to مقفلة.
  // Mirrors the consultations-side canEarlyClose gate. The closure reason
  // is required for all four roles (validated separately in the PATCH
  // handler).
  if (entityType === "case" && targetStage === "مقفلة") {
    if (userRole === "branch_manager" || userRole === "admin_support") {
      return { allowed: true };
    }
    if (
      userRole === "department_head" &&
      entityData &&
      !!user?.departmentId &&
      entityData.departmentId === user.departmentId
    ) {
      return { allowed: true };
    }
    if (user && entityData && isAssignedLawyer(user, entityData)) {
      return { allowed: true };
    }
    // Fall through to ALLOWED_CASE_TRANSITIONS for stage-specific rules
    // (e.g. تحصيل/مشطوبة/post-judgment closures don't depend on the
    // early-close shortcut).
  }

  // Designated-reviewer synthetic role. Recognized for cases / memos /
  // contracts (consultations have no internal_reviewer column; their
  // INTERNAL_REVIEW stage exit is gated through a dedicated endpoint).
  // Picked up by both the locked-stage check below and the effectiveRoles
  // expansion that feeds the per-transition allowed-roles match.
  const isInternalReviewer =
    (entityType === "case" || entityType === "memo" || entityType === "contract")
    && !!user && !!entityData && entityData.internalReviewerId === user.id;

  // Internal review stages are locked: only the designated internal reviewer
  // or the branch manager can transition out of them.
  if (
    entityType === "case" &&
    (currentStage === "مراجعة_داخلية" || currentStage === "مراجعة_داخلية_للتظلم")
  ) {
    if (!isInternalReviewer && userRole !== "branch_manager") {
      return {
        allowed: false,
        reason: "فقط المراجع الداخلي المعين أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية",
      };
    }
  }

  // Memo INTERNAL_REVIEW lock — same semantics as cases. Prevents users
  // bypassing the dedicated /internal-review endpoint by calling
  // /advance-stage or /return-stage from المراجعة_داخلية. The dedicated
  // endpoint already enforces this; this is belt-and-braces for the
  // generic stage-transition routes.
  if (entityType === "memo" && currentStage === "مراجعة_داخلية") {
    if (!isInternalReviewer && userRole !== "branch_manager") {
      return {
        allowed: false,
        reason: "فقط المراجع الداخلي المعين أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية",
      };
    }
  }

  // Contract INTERNAL_REVIEW lock — mirror cases/memos. The dedicated
  // /internal-review endpoint also enforces this, but the generic
  // /advance-stage and /return-stage routes need the same gate so a
  // non-reviewer employee can't approve their own draft by calling the
  // generic endpoint directly.
  if (entityType === "contract" && currentStage === ContractStage.INTERNAL_REVIEW) {
    if (!isInternalReviewer && userRole !== "branch_manager") {
      return {
        allowed: false,
        reason: "فقط المراجع الداخلي المعين أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية",
      };
    }
  }

  const effectiveRoles = [userRole];
  if (user && entityData && isAssignedLawyer(user, entityData)) {
    effectiveRoles.push("assigned_lawyer");
  }
  if (isInternalReviewer) {
    effectiveRoles.push("internal_reviewer");
  }

  // Rollback logic for cases
  if (entityType === "case" && entityData) {
    const classification = entityData.caseClassification as string;
    // Stage selection routes on the case's DEPARTMENT, not on caseType
    // (which is free-text user input). Callers stash the resolved
    // department name on entityData.departmentName before invoking this
    // function — see the PATCH /api/cases/:id handler.
    const departmentName = (entityData.departmentName as string | undefined) ?? undefined;
    const clientRole = entityData.clientRole as string | undefined;
    const memoRequired = !!entityData.memoRequired;
    const isSettlementCase = !!entityData.isSettlementCase;
    const stages = getStagesForClassification(classification as CaseClassificationValue, departmentName, clientRole, memoRequired, isSettlementCase);
    const currentIdx = stages.indexOf(currentStage as CaseStageValue);
    const targetIdx = stages.indexOf(targetStage as CaseStageValue);

    if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) {
      // This is a rollback
      const isLawyer = effectiveRoles.includes("assigned_lawyer");
      const isHeadOrManager = effectiveRoles.includes("department_head") || effectiveRoles.includes("branch_manager");

      if (isHeadOrManager) {
        return { allowed: true }; // can go back to ANY previous stage
      }
      if (isInternalReviewer && targetIdx === currentIdx - 1) {
        return { allowed: true }; // reviewer can send back one stage (to drafting)
      }
      if (isLawyer && targetIdx === currentIdx - 1) {
        return { allowed: true }; // can only go back ONE stage
      }
      if (isLawyer && targetIdx < currentIdx - 1) {
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
      const isHeadOrManager = effectiveRoles.includes("department_head") || effectiveRoles.includes("branch_manager");
      if (isHeadOrManager) return { allowed: true };
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
      const isHeadOrManager = effectiveRoles.includes("department_head") || effectiveRoles.includes("branch_manager");
      if (isHeadOrManager) return { allowed: true };
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
    const stages = ContractStagesAll as readonly string[];
    const currentIdx = stages.indexOf(currentStage);
    const targetIdx = stages.indexOf(targetStage);
    if (currentIdx >= 0 && targetIdx >= 0 && targetIdx < currentIdx) {
      const isLawyer = effectiveRoles.includes("assigned_lawyer");
      const isBranchManager = userRole === "branch_manager";
      const isOwnDeptHead =
        userRole === "department_head"
        && !!user?.departmentId
        && entityData.departmentId === user.departmentId;
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
          ? getContractTransitionsForType(entityData?.contractType)
          : (isInFollowUpCycle(entityData)
              ? getConsultationCycleTransitionsForType(entityData?.consultationType)
              : getConsultationTransitionsForType(entityData?.consultationType));
  const rule = rules.find(r => r.from === currentStage && r.to === targetStage);

  if (!rule) {
    return { allowed: false, reason: `لا يمكن الانتقال من "${currentStage}" إلى "${targetStage}"` };
  }

  if (!effectiveRoles.some(role => rule.allowedRoles.includes(role))) {
    return { allowed: false, reason: "ليس لديك صلاحية لتنفيذ هذا الانتقال" };
  }

  return { allowed: true };
}

async function getActiveMemoCount(caseId: string): Promise<number> {
  const memos = await storage.getMemosByCase(caseId);
  return memos.filter(m => !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status)).length;
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

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
        const safeName = `${Date.now()}-${randomUUID()}${ext}`;
        cb(null, safeName);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/gif", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
      cb(null, allowed.includes(file.mimetype));
    }
  });

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
      const { currentPassword, newPassword } = req.body;
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
      if (!username) {
        return res.status(400).json({ error: "اسم المستخدم مطلوب" });
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

  app.post("/api/users/:id/reset-password", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      const userId = String(req.params.id);
      const { newPassword } = req.body;
      if (!newPassword) {
        return res.status(400).json({ error: "كلمة المرور الجديدة مطلوبة" });
      }
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

  app.post("/api/users", requireAuth, requireRole("branch_manager", "admin_support"), async (req, res) => {
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

  app.patch("/api/users/:id", requireAuth, requireRole("branch_manager", "admin_support"), async (req, res) => {
    try {
      const validatedData = updateUserSchema.parse(req.body);
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

  app.delete("/api/users/:id", requireAuth, requireRole("branch_manager", "admin_support"), async (req: AuthRequest, res) => {
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

      const reassignments = req.body?.reassignments || {};
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
        if (c.responsibleLawyerId === userId) updates.responsibleLawyerId = newAssignee || null;
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
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "حدث خطأ في حذف المستخدم" });
    }
  });

  // ==================== Cases ====================

  app.get("/api/cases", requireAuth, async (req, res) => {
    try {
      const allCases = await storage.getAllCases();
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
      }));
      res.json(stripped);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضايا" });
    }
  });

  app.get("/api/cases/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const user = req.user!;
      if (!canViewCase(user, caseItem)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه القضية" });
      }
      res.json(caseItem);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضية" });
    }
  });

  app.post("/api/cases", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!["branch_manager", "admin_support"].includes(user.role)) {
        return res.status(403).json({ error: "إنشاء القضايا متاح فقط لمدير الفرع والدعم الإداري" });
      }
      const validatedData = insertCaseSchema.parse(req.body);
      // Carry clientRole forward explicitly — earlier the field wasn't in the
      // schema, so parse() stripped it and the case was inserted with null.
      validatedData.clientRole = validatedData.clientRole ?? req.body.clientRole ?? null;
      const createdBy = req.body.createdBy || "unknown";
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

      // Auto-create memo for existing cases where client is defendant
      const isDefendant = classification === CaseClassification.IN_COURT && req.body.clientRole === "مدعى_عليه";
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

      if (req.body.memoRequired && !isDefendant) {
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
        await storage.logCaseActivity({
          caseId: newCase.id,
          userId: createdBy,
          userName: createdBy,
          actionType: "case_created",
          title: `تم إنشاء القضية ${newCase.caseNumber}`,
        });
      } catch (e) {}

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
      if (!canModifyCase(user, caseItem)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      if (caseItem.caseClassification !== CaseClassification.UNDER_STUDY || caseItem.caseType !== "تجاري") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط للقضايا التجارية الجديدة" });
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
      
      await storage.logCaseActivity({
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
      if (!canModifyCase(user, caseItem)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      if (caseItem.caseClassification !== CaseClassification.UNDER_STUDY || caseItem.caseType !== "عمالي") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط للقضايا العمالية الجديدة" });
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
      
      await storage.logCaseActivity({
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
      if (!canModifyCase(user, caseItem)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      if (caseItem.caseClassification !== CaseClassification.UNDER_STUDY || caseItem.caseType !== "عمالي") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط للقضايا العمالية الجديدة" });
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
      
      await storage.logCaseActivity({
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

      const stageHistory: CaseStageTransition[] = [
        ...existingHistory,
        { stage: "استكمال_البيانات", timestamp: now, userId: user.id, userName: user.name, notes: "تجاوز تلقائي" },
        { stage: skipTarget, timestamp: now, userId: user.id, userName: user.name, notes: skipNote },
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
        await storage.logCaseActivity({
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

  app.post("/api/cases/:id/court-register", requireAuth, async (req: AuthRequest, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = req.user!;
      if (!canEditCaseData(user)) return res.status(403).json({ error: "لا تملك صلاحية تقييد القضية في المحكمة" });
      if (caseItem.caseClassification !== CaseClassification.UNDER_STUDY) {
        return res.status(400).json({ error: "القضية مقيدة في المحكمة بالفعل" });
      }
      // Prerequisite: commercial cases must have taradiStatus === "لم_يتم_صلح" and a taradi number
      if (caseItem.caseType === "تجاري" && caseItem.taradiStatus !== "لم_يتم_صلح") {
        return res.status(400).json({ error: "يجب إتمام مرحلة تراضي (عدم الصلح) قبل تقييد القضية التجارية في المحكمة" });
      }
      if (caseItem.caseType === "تجاري" && !caseItem.taradiNumber) {
        return res.status(400).json({ error: "يجب إدخال رقم الطلب في منصة تراضي قبل تقييد القضية في المحكمة" });
      }
      // Prerequisite: labor cases must have mohrStatus === "انتهت_التسوية"
      if (caseItem.caseType === "عمالي" && caseItem.mohrStatus !== "انتهت_التسوية") {
        return res.status(400).json({ error: "يجب إتمام مرحلة وزارة الموارد البشرية (انتهاء التسوية) قبل تقييد القضية العمالية في المحكمة" });
      }
      const { courtCaseNumber, najizNumber } = req.body;
      if (!courtCaseNumber || typeof courtCaseNumber !== "string" || !courtCaseNumber.trim()) {
        return res.status(400).json({ error: "يرجى إدخال رقم القضية في المحكمة" });
      }
      if (!najizNumber || typeof najizNumber !== "string" || !najizNumber.trim()) {
        return res.status(400).json({ error: "يرجى إدخال رقم القيد في ناجز" });
      }
      const updated = await storage.updateCase(caseItem.id, {
        caseClassification: CaseClassification.IN_COURT,
        currentStage: CaseStage.UNDER_REVIEW,
        courtCaseNumber: courtCaseNumber.trim().substring(0, 100),
        najizNumber: najizNumber.trim().substring(0, 100),
        // قيد_الدراسة cases store clientRole as null because the firm is
        // implicitly the plaintiff. On promotion to IN_COURT we must persist
        // that as an explicit "مدعي" — otherwise the row ends up IN_COURT
        // with null clientRole and the UI loses the role.
        ...(!caseItem.clientRole ? { clientRole: "مدعي" } : {}),
      });
      await storage.logCaseActivity({
        caseId: caseItem.id,
        userId: user.id,
        userName: user.name,
        actionType: "stage_changed",
        title: `تم تقييد القضية في المحكمة - رقم القضية: ${courtCaseNumber.trim()} - رقم ناجز: ${najizNumber.trim()}`,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error registering court case:", error);
      res.status(500).json({ error: "حدث خطأ في تقييد القضية في المحكمة" });
    }
  });

  app.patch("/api/cases/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const existing = await storage.getCaseById(String(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const user = req.user!;

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

      if (hasDataFields && !canEditCaseData(user)) {
        return res.status(403).json({ error: "تعديل بيانات القضية متاح فقط لمدير الفرع والدعم الإداري" });
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
        const isBranchOrAdmin = user.role === "branch_manager" || user.role === "admin_support";
        const isOwnDeptHead =
          user.role === "department_head" && existing.departmentId === user.departmentId;
        const isAssignedLawyer =
          existing.primaryLawyerId === user.id ||
          existing.responsibleLawyerId === user.id ||
          (Array.isArray(existing.assignedLawyers) && existing.assignedLawyers.includes(user.id));
        if (!isBranchOrAdmin && !isOwnDeptHead && !isAssignedLawyer) {
          return res.status(403).json({ error: "لا تملك صلاحية تغيير قسم هذه القضية" });
        }
      }

      // Check if this is an assignment operation (primaryLawyerId / assignedLawyers)
      const isAssignmentOp = !hasDataFields && (req.body.primaryLawyerId || req.body.assignedLawyers !== undefined);

      if (isAssignmentOp && user.role === "department_head") {
        // Determine effective target department after this operation
        const targetDeptId = ("departmentId" in req.body ? req.body.departmentId : existing.departmentId);
        // Block if target dept is missing or does not match the department head's own department
        if (!targetDeptId || targetDeptId !== user.departmentId) {
          return res.status(403).json({ error: "يمكنك فقط إسناد قضايا قسمك" });
        }
      } else if (!hasDataFields && !canModifyCase(user, existing)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه القضية" });
      }

      // Flag set inside the stage-transition block below; acted on after
      // storage.updateCase succeeds. Declared at the outer scope so the
      // post-update side-effect can see it.
      let shouldCreateCollectionTask = false;

      // Validate stage transition if changing stage
      if (req.body.currentStage && req.body.currentStage !== existing.currentStage) {
        // Use merged case data for validation when classification also changes simultaneously.
        // Stash the resolved department name on the merged copy under
        // `departmentName` so validateStageTransition's rollback path —
        // which calls getStagesForClassification(classification, departmentName)
        // — picks the right commercial/labor/admin/general stage array. The
        // case's own caseType field is free-text user input ("بيع وتوريد"
        // etc.) and is NOT used for routing.
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
        const stageCheck = validateStageTransition(existing.currentStage, req.body.currentStage, user.role, "case", user, mergedCase);
        if (!stageCheck.allowed) {
          return res.status(400).json({ error: stageCheck.reason });
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
        if (targetStage === "قيد_التدقيق_في_ناجز") {
          const najiz = req.body.najizNumber || existing.najizNumber;
          if (!najiz) return res.status(400).json({ error: "يجب إدخال رقم القيد في ناجز" });
        }
        if (targetStage === "قيد_التدقيق_في_معين") {
          const moeen = req.body.moeenNumber || existing.moeenNumber;
          if (!moeen) return res.status(400).json({ error: "يجب إدخال رقم القيد في معين" });
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
        // Labor settlement: the moment a mohrNumber is supplied (or already
        // exists) and the case is leaving the settlement-prep stages, sync
        // caseNumber := mohrNumber.
        if (
          (targetStage === "بانتظار_رفع_العميل_للتسوية" ||
            targetStage === "مداولة_الصلح" ||
            targetStage === "أغلق_طلب_الصلح") &&
          existing.currentStage !== targetStage
        ) {
          const mohr = req.body.mohrNumber || existing.mohrNumber;
          if (mohr && String(mohr).trim()) {
            req.body.caseNumber = String(mohr).trim();
          }
        }

        // Accepting out of a najiz/moeen review stage: the lawyer must enter
        // the court-issued case number, which then replaces caseNumber.
        // (تراضي doesn't require this — the taradi number itself is the
        // platform's case number.)
        if (
          (existing.currentStage === "قيد_التدقيق_في_ناجز" ||
            existing.currentStage === "قيد_التدقيق_في_معين") &&
          targetStage !== existing.currentStage
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

      // Ensure lawyer consistency: primaryLawyerId must be in assignedLawyers
      const finalAssignedLawyers = req.body.assignedLawyers || existing.assignedLawyers || [];
      const finalPrimaryLawyer = req.body.primaryLawyerId || existing.primaryLawyerId;
      if (finalPrimaryLawyer && Array.isArray(finalAssignedLawyers) && !finalAssignedLawyers.includes(finalPrimaryLawyer)) {
        req.body.assignedLawyers = [...finalAssignedLawyers, finalPrimaryLawyer];
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
        !req.body.primaryLawyerId &&
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
              await storage.updateMemo(m.id, { assignedTo: null } as any);  // FIXME(2D-defer): null -> memos.assigned_to is NOT NULL; this write throws (caught/swallowed below) so dept-transfer unassign silently no-ops. Needs schema migration (drop NOT NULL) or different unassign logic — not a type fix.
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
            userName: user.name || user.id,
            notes: req.body.stageChangeNotes || "",
          },
        ];
        // Set closedAt when transitioning to مقفلة
        if (req.body.currentStage === "مقفلة") {
          req.body.closedAt = new Date().toISOString();
        }

        // Conciliation outcome: when moving مداولة_الصلح → تحصيل, auto-create
        // a field task for admin_support to draft the collection letter. The
        // task itself is created AFTER storage.updateCase succeeds so we
        // don't leave orphan tasks on a failed transition.
        shouldCreateCollectionTask =
          existing.currentStage === "مداولة_الصلح" && req.body.currentStage === "تحصيل";

        // Struck-off reopen: clear struckOff fields when reopening
        if (existing.currentStage === "مشطوبة" && (req.body.currentStage === "منظورة" || req.body.currentStage === "منظورة_استئناف")) {
          req.body.struckOffDate = null;
          req.body.struckOffReopenDeadline = null;
          try {
            await storage.logCaseActivity({
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

      // Side effect for مداولة_الصلح → تحصيل: create the admin collection task.
      if (shouldCreateCollectionTask) {
        try {
          const allUsers = await storage.getAllUsers();
          const adminSupport = allUsers.find(
            (u: any) => u.role === "admin_support" && u.isActive,
          );
          const assignee = adminSupport?.id || user.id;
          await storage.createFieldTask(
            {
              title: `إعداد خطاب تحصيل — قضية رقم ${updated.caseNumber}`,
              description: `تم الصلح في مداولة الصلح — يرجى إعداد خطاب التحصيل`,
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
        } catch (e) {
          console.error("Failed to auto-create collection task on conciliation settlement:", e);
        }
      }

      if (user && existing) {
        try {
          if (isDeptTransfer) {
            await storage.logCaseActivity({
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
            await storage.logCaseActivity({
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
                await storage.logCaseActivity({
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
                await storage.logCaseActivity({
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
            await storage.logCaseActivity({
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

      // Cascade lawyer assignment to pending hearings and active memos
      if (req.body.primaryLawyerId && req.body.primaryLawyerId !== existing.primaryLawyerId) {
        const caseId = String(req.params.id);
        const newLawyerId = req.body.primaryLawyerId;
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

      // Handle related entities when case is closed/archived
      if (req.body.currentStage === "مقفلة" && existing.currentStage !== "مقفلة") {
        const caseId = String(req.params.id);
        try {
          // Cancel upcoming hearings
          const hearings = await storage.getHearingsByCase(caseId);
          for (const h of hearings) {
            if (h.status === "قادمة") {
              await storage.updateHearing(h.id, { status: "ملغية" });
            }
          }
          // Cancel active memos (not yet approved/submitted)
          const memos = await storage.getMemosByCase(caseId);
          for (const m of memos) {
            if (["لم_تبدأ", "قيد_التحرير", "قيد_المراجعة", "تحتاج_تعديل"].includes(m.status)) {
              await storage.updateMemo(m.id, { status: "ملغاة" });
            }
          }
          // Cancel pending/in-progress field tasks
          const caseFieldTasks = await storage.getFieldTasksByCase(caseId);
          for (const t of caseFieldTasks) {
            if (t.status === "قيد_التنفيذ" || t.status === "قيد_الانتظار") {
              await storage.updateFieldTask(t.id, { status: "ملغي" });
            }
          }
          // Recalculate activeMemoCount after cancelling memos
          const finalActiveCount = await getActiveMemoCount(caseId);
          await storage.updateCase(caseId, { activeMemoCount: finalActiveCount });
        } catch (e) {
          console.error("Error cleaning up related entities on case close:", e);
        }
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

  app.post("/api/clients", requireAuth, async (req, res) => {
    try {
      const validatedData = insertClientSchema.parse(req.body);
      const createdBy = req.body.createdBy || "unknown";
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
      const { role, id: userId, departmentId } = user;

      if (["branch_manager", "admin_support", "consultations_review_head", "cases_review_head", "viewer"].includes(role)) {
        return res.json(allConsultations);
      }

      if (role === "department_head") {
        const filtered = allConsultations.filter((c: any) => c.departmentId === departmentId);
        return res.json(filtered);
      }

      if (role === "employee") {
        const filtered = allConsultations.filter((c: any) =>
          c.departmentId === departmentId ||
          c.assignedTo === userId
        );
        return res.json(filtered);
      }

      return res.status(403).json({ error: "ليس لديك صلاحية لعرض الاستشارات" });
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
      if (!canModifyConsultation(user, consultation)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه الاستشارة" });
      }
      res.json(consultation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الاستشارة" });
    }
  });

  app.post("/api/consultations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertConsultationSchema.parse(req.body);
      const reqUser = req.user!;
      // Phase-6: prefer the authenticated user id over the body-provided
      // createdBy so the activity log's performedBy is always the real
      // actor. Fall back for legacy clients that still pass it explicitly.
      const createdBy = reqUser?.id || req.body.createdBy || "unknown";
      const newConsultation = await storage.createConsultation(validatedData, createdBy);
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
      if (!canModifyConsultation(user, existing)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه الاستشارة" });
      }

      // Validate stage transition if changing status
      if (req.body.status && req.body.status !== existing.status) {
        const stageCheck = validateStageTransition(existing.status, req.body.status, user.role, "consultation", user, existing);
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

      const { assignedTo } = req.body || {};
      if (!assignedTo || typeof assignedTo !== "string") {
        return res.status(400).json({ error: "assignedTo مطلوب" });
      }

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      const resolvedType = resolveConsultationType(consultation.consultationType);
      const allowedRoles = resolvedType === ConsultationType.WRITTEN
        ? ["admin_support", "department_head", "branch_manager"]
        : ["department_head", "branch_manager"];
      if (!allowedRoles.includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإسناد الاستشارات" });
      }

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      const { valid } = await validateAssignedUsersActive([assignedTo]);
      if (!valid) return res.status(400).json({ error: "المستخدم المسند إليه غير نشط أو غير موجود" });

      const lawyer = await storage.getUser(assignedTo);
      const lawyerName = lawyer?.name || assignedTo;

      const updated = await storage.updateConsultationAndLog(consultation.id, { assignedTo }, {
        activityType: ConsultationActivityType.ASSIGNED,
        description: `تم إسناد الاستشارة لـ ${lawyerName}`,
        metadata: { assignedTo, lawyerName },
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل تحديث الاستشارة" });
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

      const baseAllowed = ["employee", "department_head", "cases_review_head", "consultations_review_head", "branch_manager"];
      const isLawyer = isAssignedLawyer(reqUser, consultation);
      if (!baseAllowed.includes(reqUser.role) && !isLawyer) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتقديم المراجعة الداخلية" });
      }

      const nextStage = decision === InternalReviewDecision.PASSED
        ? ConsultationStage.COMMITTEE
        : ConsultationStage.DRAFTING;

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

      if (!["consultations_review_head", "branch_manager"].includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
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
      res.json({ decision: result.decision, consultation: result.consultation });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

      const isLawyer = isAssignedLawyer(reqUser, consultation);
      const isHead = ["department_head", "branch_manager"].includes(reqUser.role);
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

      const isLawyer = isAssignedLawyer(reqUser, consultation);
      const allowedRoles = ["admin_support", "department_head", "branch_manager"];
      if (!isLawyer && !allowedRoles.includes(reqUser.role)) {
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
        const adminLike = ["admin_support", "department_head", "branch_manager"];
        permitted = adminLike.includes(reqUser.role) || isLawyer;
      } else {
        permitted = ["admin_support", "branch_manager"].includes(reqUser.role);
      }
      if (!permitted) {
        return res.status(403).json({ error: "ليس لديك صلاحية للإغلاق المبكر" });
      }

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
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

  // POST /api/consultations/:id/start-follow-up
  // Re-opens a closed consultation into a follow-up cycle ("استشارة
  // تعقيبية"). Same row: status flips back to active, currentStage
  // resets to RECEIVED, followUpCount increments, followUpStartedAt is
  // stamped, and the previous closure metadata (closedAt /
  // closureReason*) plus stale pause/await fields are cleared so the
  // row doesn't carry forward into the new cycle. expectedDeliveryDate
  // is recomputed as now + SLA_DAYS[category] so the cycle gets a
  // fresh SLA window. The activity log preserves the full history.
  // Permission: admin_support / branch_manager.
  app.post("/api/consultations/:id/start-follow-up", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      if (!["admin_support", "branch_manager"].includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لبدء استشارة تعقيبية" });
      }

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });
      if (consultation.status !== "closed") {
        return res.status(400).json({ error: "يمكن بدء التعقيبية فقط من استشارة مقفلة" });
      }

      // The cycle question is the customer's new follow-up inquiry. Stored
      // in the activity-log metadata only (no new column) — the UI reads
      // the latest FOLLOW_UP_STARTED entry to surface it during the cycle.
      const question = String(req.body?.question ?? "").trim();
      if (!question) {
        return res.status(400).json({ error: "السؤال مطلوب لبدء استشارة تعقيبية" });
      }

      const nextCount = (consultation.followUpCount ?? 0) + 1;
      // Recompute SLA window for the new cycle. Falls back to STANDARD
      // (3 days) when the row's category is legacy/unrecognised — same
      // safe fallback used at creation in storage.createConsultation.
      const category = (Object.values(ConsultationCategory) as string[])
        .includes(consultation.category as string)
        ? (consultation.category as keyof typeof ConsultationCategorySLADays)
        : ConsultationCategory.STANDARD;
      const slaDays = ConsultationCategorySLADays[category];
      const newExpectedDeliveryDate = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000);

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
          // Fresh SLA window for the cycle (R6).
          expectedDeliveryDate: newExpectedDeliveryDate.toISOString(),
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
            expectedDeliveryDate: newExpectedDeliveryDate.toISOString(),
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

      if (!["admin_support", "department_head", "branch_manager"].includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتحويل الاستشارة لقضية" });
      }

      // Pre-validate (storage re-checks inside the transaction for race-safety).
      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });
      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
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

  // POST /api/consultations/:id/extend-delivery
  // Body: { newExpectedDeliveryDate: ISO string, reason: string }.
  // Inserts an audit row in consultation_delivery_extensions and updates
  // consultations.expectedDeliveryDate in a single DB transaction.
  // Allowed roles (Phase-5): department_head (own dept), branch_manager.
  app.post("/api/consultations/:id/extend-delivery", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      // Role gate. branch_manager is global; department_head is scoped to
      // their own department, mirroring assign / early-close.
      if (reqUser.role === "branch_manager") {
        // ok
      } else if (reqUser.role === "department_head" && consultation.departmentId === reqUser.departmentId) {
        // ok
      } else {
        return res.status(403).json({ error: "ليس لديك صلاحية لتمديد التسليم" });
      }

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }

      const parsed = extendConsultationDeliverySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }

      const newDate = new Date(parsed.data.newExpectedDeliveryDate);
      if (Number.isNaN(newDate.getTime())) {
        return res.status(400).json({ error: "تاريخ التسليم الجديد غير صحيح" });
      }

      try {
        const reasonTrimmed = parsed.data.reason.trim();
        const oldDateIso = consultation.expectedDeliveryDate || null;
        const newDateIso = newDate.toISOString();
        const fmtDate = (iso: string | null) => iso ? iso.slice(0, 10) : "—";
        const description = `تم تمديد تاريخ التسليم من ${fmtDate(oldDateIso)} إلى ${fmtDate(newDateIso)} — ${reasonTrimmed}`;

        const result = await storage.extendConsultationDelivery(
          consultation.id,
          { newExpectedDeliveryDate: newDate, reason: reasonTrimmed },
          reqUser.id,
          {
            description,
            metadata: { oldDate: oldDateIso, newDate: newDateIso, reason: reasonTrimmed },
          },
        );
        res.status(201).json(result);
      } catch (e: any) {
        const msg = e?.message || "";
        if (msg === "CONSULTATION_NOT_FOUND") return res.status(404).json({ error: "الاستشارة غير موجودة" });
        if (msg === "CONSULTATION_NOT_ACTIVE") return res.status(400).json({ error: "الاستشارة ليست نشطة" });
        if (msg === "EXTENSION_NOT_FORWARD") {
          return res.status(400).json({ error: "تاريخ التسليم الجديد يجب أن يكون بعد التاريخ الحالي" });
        }
        if (msg === "CONSULTATION_UPDATE_FAILED") {
          return res.status(500).json({ error: "فشل تمديد التسليم، تم التراجع عن جميع التغييرات" });
        }
        throw e;
      }
    } catch (error: any) {
      console.error("[extend-delivery] error:", error);
      res.status(500).json({ error: error.message || "فشل تمديد التسليم" });
    }
  });

  // GET /api/consultations/:id/delivery-extensions
  // Returns the chronological list of expectedDeliveryDate extensions
  // for a consultation. Auth/visibility piggybacks off canModifyConsultation
  // — anyone allowed to view the consultation can see its history.
  app.get("/api/consultations/:id/delivery-extensions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });
      if (!canModifyConsultation(reqUser, consultation)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه الاستشارة" });
      }

      const rows = await storage.getConsultationDeliveryExtensions(consultation.id);
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "حدث خطأ" });
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
      if (!canModifyConsultation(reqUser, consultation)) {
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
        (reqUser.role === "department_head" && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتعليق هذه الاستشارة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "لا يمكن تعليق استشارة ليست نشطة" });
      }

      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب التعليق مطلوب" });

      const updated = await storage.pauseConsultation(consultation.id, {
        reason,
        performedBy: reqUser.id,
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
        (reqUser.role === "department_head" && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء تعليق هذه الاستشارة" });

      if (consultation.status !== "paused") {
        return res.status(400).json({ error: "هذه الاستشارة ليست معلّقة" });
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
  app.post("/api/cases/:id/return-to-committee", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

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
        && lawCase.departmentId === reqUser.departmentId;
      const allowed =
        reqUser.role === "branch_manager"
        || reqUser.role === "admin_support"
        || isOwnDeptHead
        || isLawyer;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإعادة القضية للجنة" });

      const performer = await storage.getUser(reqUser.id);
      const performerName = performer?.name || reqUser.id;
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
        (reqUser.role === "department_head" && lawCase.departmentId === reqUser.departmentId) ||
        isAssignedLawyer;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتعليق هذه القضية" });

      if (lawCase.pausedAt) {
        return res.status(400).json({ error: "هذه القضية معلّقة بالفعل" });
      }
      if (lawCase.status === "مغلق" || lawCase.isArchived) {
        return res.status(400).json({ error: "لا يمكن تعليق قضية مغلقة أو مؤرشفة" });
      }

      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب التعليق مطلوب" });

      const performer = await storage.getUser(reqUser.id);
      const performerName = performer?.name || reqUser.id;
      const updated = await storage.pauseCase(lawCase.id, {
        reason,
        performedBy: reqUser.id,
        performerName,
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
        (reqUser.role === "department_head" && lawCase.departmentId === reqUser.departmentId) ||
        isAssignedLawyer;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء تعليق هذه القضية" });

      if (!lawCase.pausedAt) {
        return res.status(400).json({ error: "هذه القضية ليست معلّقة" });
      }

      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const performer = await storage.getUser(reqUser.id);
      const performerName = performer?.name || reqUser.id;
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

      // Department-scope check needs the parent case for dept_head.
      const parentCase = reqUser.role === "department_head"
        ? await storage.getCaseById(memo.caseId)
        : null;
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && parentCase && parentCase.departmentId === reqUser.departmentId) ||
        memo.assignedTo === reqUser.id;
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

      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "سبب التعليق مطلوب" });

      const updated = await storage.pauseMemo(memo.id, {
        reason,
        performedBy: reqUser.id,
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

      const parentCase = reqUser.role === "department_head"
        ? await storage.getCaseById(memo.caseId)
        : null;
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && parentCase && parentCase.departmentId === reqUser.departmentId) ||
        memo.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لإلغاء تعليق هذه المذكرة" });

      if (!memo.pausedAt) {
        return res.status(400).json({ error: "هذه المذكرة ليست معلّقة" });
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
      const parentCase = await storage.getCaseById(memo.caseId);
      const isAssigned = memo.assignedTo === reqUser.id;
      const isCaseLawyer = !!parentCase && (
        parentCase.primaryLawyerId === reqUser.id ||
        parentCase.responsibleLawyerId === reqUser.id ||
        (Array.isArray(parentCase.assignedLawyers) && parentCase.assignedLawyers.includes(reqUser.id))
      );
      const isDeptHead = reqUser.role === "department_head"
        && !!parentCase && parentCase.departmentId === reqUser.departmentId;
      const isAdmin = ["branch_manager", "admin_support", "cases_review_head"].includes(reqUser.role);
      if (!(isAssigned || isCaseLawyer || isDeptHead || isAdmin)) {
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
        (reqUser.role === "department_head" && consultation.departmentId === reqUser.departmentId) ||
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
        (reqUser.role === "department_head" && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة الاستشارة" });

      if (!consultation.awaitingCompletion) {
        return res.status(400).json({ error: "الاستشارة ليست بانتظار استكمال المرفقات والبيانات" });
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

  // POST /api/consultations/:id/skip-completion
  // The "تجاوز" button on the RECEIVED_PENDING_COMPLETION stage. Same
  // target as the normal advance to STUDY but logged as
  // completion_skipped. Available only when NOT in await-completion
  // mode — awaiting=true rows must use /resume-from-completion instead.
  app.post("/api/consultations/:id/skip-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });

      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) return res.status(404).json({ error: "الاستشارة غير موجودة" });

      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && consultation.departmentId === reqUser.departmentId) ||
        consultation.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتجاوز هذه المرحلة" });

      if (consultation.status !== "active") {
        return res.status(400).json({ error: "الاستشارة ليست نشطة" });
      }
      if (consultation.currentStage !== ConsultationStage.RECEIVED_PENDING_COMPLETION) {
        return res.status(400).json({ error: "تجاوز الاستكمال متاح فقط من مرحلة الاستكمال" });
      }
      if (consultation.awaitingCompletion) {
        return res.status(400).json({ error: "استخدم العودة من الاستكمال بدلاً من التجاوز" });
      }

      const updated = await storage.skipConsultationCompletion(consultation.id, {
        performedBy: reqUser.id,
      });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      console.error("[consultations/skip-completion] error:", error);
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
      // Per spec: only branch_manager / admin_support / department_head
      // can create contracts. Employees / lawyers / review committee
      // chairs are NOT allowed to open new files. Server is the source
      // of truth — the UI hides the button but a hand-rolled POST would
      // bypass that gate.
      const allowedCreators = ["branch_manager", "admin_support", "department_head"];
      if (!allowedCreators.includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإنشاء عقود" });
      }
      const validated = insertContractSchema.parse(req.body);
      const createdBy = reqUser?.id || "unknown";
      const created = await storage.createContract(validated, createdBy);
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
      if (!canModifyContract(user, existing)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذا العقد" });
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
        const fromStageLabel = (ContractStageLabels as Record<string, string>)[deptTransfer.fromStage] || deptTransfer.fromStage;
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
          // No semantic change worth logging (e.g. a title-only edit).
          // Silent write is the right outcome here.
          updated = await storage.updateContract(String(req.params.id), req.body);
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
        if (att.filePath && isContractObjectKey(att.filePath)) {
          contractObjectStore.delete(att.filePath, { ignoreNotFound: true }).catch((e) => {
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
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });
      // Slot-validation gate per ContractSlotsByType. Required slots
      // are checked at the moment the contract LEAVES their gating
      // stage — e.g. مراجعة_عقد cannot leave RECEIVED without an
      // uploaded "العقد محل المراجعة", and cannot leave DRAFTING
      // without "دراسة المراجعة". Slots whose
      // requiredBeforeLeavingStage doesn't match the from-stage are
      // ignored for this transition.
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
      if (!isReviewer && reqUser.role !== "branch_manager") {
        return res.status(403).json({ error: "فقط المراجع الداخلي المعين أو مدير الفرع يمكنهم التصرف في مرحلة المراجعة الداخلية" });
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
      if (!["consultations_review_head", "branch_manager"].includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
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

  app.post("/api/contracts/:id/take-notes-outcome", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
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
      const isLawyer = isAssignedLawyer(reqUser, contract);
      const isHead = ["department_head", "branch_manager"].includes(reqUser.role);
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

  // Pause / unpause / await-completion / resume / skip-completion —
  // same gate across all four (branch_manager / admin_support /
  // department_head own dept / assigned lawyer) and same payload shape
  // as the consultation handlers.
  const allowContractPauseLike = (reqUser: any, contract: any): boolean =>
    reqUser.role === "branch_manager"
    || reqUser.role === "admin_support"
    || (reqUser.role === "department_head" && contract.departmentId === reqUser.departmentId)
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
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });
      const updated = await storage.pauseContract(contract.id, { reason, performedBy: reqUser.id });
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
      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const updated = await storage.resumeContractFromCompletion(contract.id, { notes, performedBy: reqUser.id });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/contracts/:id/skip-completion", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!allowContractPauseLike(reqUser, contract)) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
      if (contract.status !== "active") return res.status(400).json({ error: "العقد ليس نشطاً" });
      if (contract.currentStage !== ContractStage.RECEIVED_PENDING_COMPLETION) {
        return res.status(400).json({ error: "تجاوز الاستكمال متاح فقط من مرحلة الاستكمال" });
      }
      if (contract.awaitingCompletion) {
        return res.status(400).json({ error: "استخدم العودة من الاستكمال بدلاً من التجاوز" });
      }
      // Skip respects the same slot rules as a normal advance from
      // PENDING_COMPLETION — e.g. مراجعة_عقد still needs the intake
      // file (contract_under_review) on the row. The skip lands on
      // DRAFTING just like advance from PENDING_COMPLETION; we use
      // the from-stage RECEIVED_PENDING_COMPLETION here, which has
      // no required slots itself, but the RECEIVED slot rule applies
      // because it requires the file before LEAVING RECEIVED — which
      // already happened to reach this stage. So the gate effectively
      // covers the RECEIVED→PENDING transition, not the skip itself.
      // We keep the call for symmetry / future-proofing.
      const slotCheckErr = await checkRequiredSlotsForTransition(
        contract,
        contract.currentStage,
      );
      if (slotCheckErr) return res.status(400).json({ error: slotCheckErr });
      const updated = await storage.skipContractCompletion(contract.id, { performedBy: reqUser.id });
      if (!updated) return res.status(500).json({ error: "فشل الإجراء" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contracts/:id/activities", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
      const contract = await storage.getContractById(String(req.params.id));
      if (!contract) return res.status(404).json({ error: "العقد غير موجود" });
      if (!canModifyContract(reqUser, contract)) {
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
        if (!canModifyContract(reqUser, contract)) {
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
            if (existing && isContractObjectKey(existing.filePath)) {
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
        const uploadResult = await contractObjectStore.uploadFromFilename(objectKey, file.path);
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
          if (isContractObjectKey(replaced.filePath)) {
            contractObjectStore.delete(replaced.filePath, { ignoreNotFound: true }).catch((e) => {
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
      if (!canModifyContract(reqUser, contract)) {
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
        const enriched = { ...a, missing: !isContractObjectKey(a.filePath) };
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
      if (!canModifyContract(reqUser, contract)) {
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
      if (!isContractObjectKey(att.filePath)) {
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
      // Stream from Object Storage straight to the client. Errors are
      // emitted on the readable as StreamRequestError; we translate
      // them to a JSON error iff no bytes (and therefore no headers)
      // have gone out yet, otherwise we just end the response — once
      // the body has started we can't switch to a JSON envelope.
      const stream = contractObjectStore.downloadAsStream(att.filePath);
      stream.on("error", (err: any) => {
        const requestError = typeof err?.getRequestError === "function" ? err.getRequestError() : null;
        const statusCode = requestError?.statusCode;
        console.error("[contracts download] object storage stream failed:", {
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
          // Headers already flushed (some bytes shipped) — best we can
          // do is terminate the response so the client sees a short read.
          res.end();
        }
      });
      // If the client disconnects mid-download, tear the upstream
      // stream down so we don't keep paging bytes from Object Storage
      // for a dead socket.
      res.on("close", () => {
        if (!res.writableEnded) stream.destroy();
      });
      stream.pipe(res);
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
            || (reqUser.role === "department_head" && contract.departmentId === reqUser.departmentId)
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
      if (deleted.filePath && isContractObjectKey(deleted.filePath)) {
        contractObjectStore.delete(deleted.filePath, { ignoreNotFound: true }).catch((e) => {
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
        (reqUser.role === "department_head" && lawCase.departmentId === reqUser.departmentId) ||
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

      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) return res.status(400).json({ error: "السبب مطلوب" });

      const performer = await storage.getUser(reqUser.id);
      const performerName = performer?.name || reqUser.id;
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
        (reqUser.role === "department_head" && lawCase.departmentId === reqUser.departmentId) ||
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

      const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
      const performer = await storage.getUser(reqUser.id);
      const performerName = performer?.name || reqUser.id;
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

      const parentCase = reqUser.role === "department_head"
        ? await storage.getCaseById(memo.caseId)
        : null;
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && parentCase && parentCase.departmentId === reqUser.departmentId) ||
        memo.assignedTo === reqUser.id;
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

      const parentCase = reqUser.role === "department_head"
        ? await storage.getCaseById(memo.caseId)
        : null;
      const allowed =
        reqUser.role === "branch_manager" ||
        reqUser.role === "admin_support" ||
        (reqUser.role === "department_head" && parentCase && parentCase.departmentId === reqUser.departmentId) ||
        memo.assignedTo === reqUser.id;
      if (!allowed) return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة المذكرة" });

      if (!memo.awaitingCompletion) {
        return res.status(400).json({ error: "المذكرة ليست بانتظار استكمال المرفقات والبيانات" });
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

      const check = validateStageTransition(
        memo.currentStage,
        targetStage,
        reqUser.role,
        "memo",
        reqUser,
        memo,
      );
      if (!check.allowed) return res.status(400).json({ error: check.reason });

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

      const check = validateStageTransition(
        memo.currentStage,
        targetStage,
        reqUser.role,
        "memo",
        reqUser,
        memo,
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
      if (!isAssignedReviewer && !isBranchManager) {
        return res.status(403).json({
          error: "فقط المراجع الداخلي المعين أو مدير الفرع يمكنهم تسجيل قرار المراجعة الداخلية",
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

      if (!["cases_review_head", "branch_manager"].includes(reqUser.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لقرار اللجنة" });
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

      const isLawyer = !!memo.assignedTo && memo.assignedTo === reqUser.id;
      const isHead = ["department_head", "branch_manager"].includes(reqUser.role);
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

      const parentCase = reqUser.role === "department_head" && memo.caseId
        ? await storage.getCaseById(memo.caseId)
        : null;
      const isOwnDeptHead =
        reqUser.role === "department_head"
        && !!parentCase
        && parentCase.departmentId === reqUser.departmentId;
      const isAssigned = !!memo.assignedTo && memo.assignedTo === reqUser.id;
      const allowed =
        reqUser.role === "branch_manager"
        || reqUser.role === "admin_support"
        || isOwnDeptHead
        || isAssigned;
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

      const parentCase = reqUser.role === "department_head" && memo.caseId
        ? await storage.getCaseById(memo.caseId)
        : null;
      const isOwnDeptHead =
        reqUser.role === "department_head"
        && !!parentCase
        && parentCase.departmentId === reqUser.departmentId;
      const isAssigned = !!memo.assignedTo && memo.assignedTo === reqUser.id;
      const allowed =
        reqUser.role === "branch_manager"
        || reqUser.role === "cases_review_head"
        || reqUser.role === "admin_support"
        || isOwnDeptHead
        || isAssigned;
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

  // ==================== Hearings ====================

  app.get("/api/hearings", requireAuth, async (req, res) => {
    try {
      const hearings = await storage.getAllHearings();
      res.json(hearings);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الجلسات" });
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
          if (relatedCase.currentStage === "مقفلة" || relatedCase.isArchived) {
            return res.status(400).json({ error: "لا يمكن إضافة جلسات لقضية مغلقة أو مؤرشفة" });
          }
          if (!validatedData.attendingLawyerId) {
            validatedData.attendingLawyerId = relatedCase.primaryLawyerId || relatedCase.responsibleLawyerId || null;
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
              const courtFromStages = [
                "أغلق_طلب_الصلح",
                "قيد_التدقيق_في_ناجز",
                "قيد_التدقيق_في_معين",
                "قيد_التدقيق_في_تراضي",
              ];
              if (courtFromStages.includes(currentStage)) {
                const stageHistory = Array.isArray(caseForStage.stageHistory) ? caseForStage.stageHistory : [];
                const promoteClassification = caseForStage.caseClassification === "قيد_الدراسة";
                await storage.updateCase(caseForStage.id, {
                  currentStage: "منظورة",
                  ...(promoteClassification ? {
                    caseClassification: "منظورة_بالمحكمة",
                    ...(!caseForStage.clientRole ? { clientRole: "مدعي" } : {}),
                  } : {}),
                  stageHistory: [
                    ...stageHistory,
                    { stage: "منظورة", timestamp: new Date().toISOString(), userId: user?.id || "system", userName: user?.name || "النظام", notes: "انتقال تلقائي عند إنشاء جلسة محكمة" },
                  ],
                });
              }
            }
          }
        } catch (e) {
          console.error("[POST hearings] auto-stage failed", e);
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
          await storage.logCaseActivity({
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
      if (relatedCase && !canModifyCase(user, relatedCase)) {
        return res.status(403).json({ error: "لا تملك صلاحية تعديل هذه الجلسة" });
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

  // ==================== Hearing Workflow ====================

  app.post("/api/hearings/:id/result", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!canActOnHearing(req.user!, hearing)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }
      if (hearing.hearingDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const hd = new Date(hearing.hearingDate);
        hd.setHours(0, 0, 0, 0);
        if (hd.getTime() > today.getTime()) {
          return res.status(400).json({ error: "لا يمكن تسجيل نتيجة الجلسة قبل موعدها" });
        }
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
        updateData.judgmentSide = data.judgmentType || data.judgmentSide || null;
        updateData.judgmentFinal = data.judgmentFinal ?? null;
        updateData.objectionFeasible = data.objectionFeasible ?? null;
        updateData.objectionDeadline = data.objectionDeadline || null;
      }

      // New-session data. memoRequired is the canonical "this hearing still
      // needs an auto-memo generated" flag. Coalesce responseRequired into it
      // so the deferred-memo trigger works whether the client sends one or
      // the other. Cleared to false later if the memo gets created right now.
      if (data.result === HearingResult.NEW_SESSION) {
        updateData.nextHearingDate = data.nextHearingDate || null;
        updateData.nextHearingTime = data.nextHearingTime || null;
        updateData.responseRequired = data.responseRequired ?? false;
        updateData.memoRequired = !!(data.memoRequired || data.responseRequired);
        updateData.opponentResponseRequired = data.opponentResponseRequired ?? false;
      }

      const updatedHearing = await storage.updateHearing(hearingId, updateData);

      const reqUser = req.user!;
      if (reqUser && effectiveCaseId) {
        try {
          await storage.logCaseActivity({
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
      const isAppealStage = existingCase?.currentStage === "منظورة_استئناف";

      if (effectiveCaseId && existingCase) {
        const caseUpdate: any = {
          lastHearingResult: data.result,
          lastHearingDate: hearing.hearingDate,
        };

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
            primaryLawyerId: null,
            responsibleLawyerId: null,
            assignedLawyers: [],
            internalReviewerId: null,
          });
          if (reqUser) {
            try {
              await storage.logCaseActivity({
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
              opponentResponseRequired: data.opponentResponseRequired || false,
              notes: `موعد جديد من جلسة ${hearing.hearingDate}`,
            });
            newSessionHearingId = newHearing.id;
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
            createdTasks.push({ type: "prepare_response", id: task.id, description: "مهمة إعداد الرد" });

            const deadlineDate = new Date(data.nextHearingDate);
            deadlineDate.setDate(deadlineDate.getDate() - 3);
            const memoAssignee = existingCase.primaryLawyerId || existingCase.responsibleLawyerId || "";
            const memo = await storage.createMemo({
              caseId: effectiveCaseId,
              hearingId: newSessionHearingId || hearingId,
              memoType: MemoType.RESPONSE,
              title: `مذكرة جوابية - جلسة ${data.nextHearingDate}`,
              description: `مذكرة جوابية مطلوبة قبل الجلسة القادمة بتاريخ ${data.nextHearingDate}`,
              priority: "عالي",
              assignedTo: memoAssignee,
              createdBy: "system",
              deadline: deadlineDate.toISOString().split("T")[0],
              isAutoGenerated: true,
              autoGenerateReason: "موعد_جديد_مع_رد",
            });
            createdMemos.push({ type: "response_memo", id: memo.id, description: "مذكرة جوابية تلقائية" });

            // Memo has been created — clear the deferred flag so adding a
            // future hearing doesn't trigger the deferred-memo path again.
            await storage.updateHearing(hearingId, { memoRequired: false });

            const activeCount = await getActiveMemoCount(effectiveCaseId);
            await storage.updateCase(effectiveCaseId, { activeMemoCount: activeCount });
          }
        }

        // ==================== PATH B: JUDGMENT (حكم) ====================
        else if (data.result === HearingResult.JUDGMENT) {
          const judgmentType = data.judgmentType || data.judgmentSide || null;
          // For appeal hearings, judgment is always final
          const isFinal = isAppealStage ? true : (data.judgmentFinal ?? false);
          const needsAppeal = data.needsAppeal ?? false;

          // Validate required fields
          if (!judgmentType) {
            return res.status(400).json({ error: "يجب تحديد نوع الحكم (لصالحنا / ضدنا / جزئي)" });
          }

          const lawyerAssignee = hearing.attendingLawyerId || existingCase.primaryLawyerId || existingCase.responsibleLawyerId || reqUser.id;

          if (isFinal) {
            // === FINAL JUDGMENTS ===
            if (judgmentType === "لصالحنا" || judgmentType === "جزئي") {
              // Cases 1 & 3: final + for us or partial → collection
              caseUpdate.currentStage = "محكوم_حكم_نهائي";
              await storage.updateCase(effectiveCaseId, caseUpdate);

              // Auto-create collection task
              const allUsers = await storage.getAllUsers();
              const adminSupport = allUsers.find((u: any) => u.role === "admin_support" && u.isActive);
              const collectionTask = await storage.createFieldTask({
                title: `إعداد خطاب تحصيل — قضية رقم ${existingCase.caseNumber}`,
                description: `صدر حكم نهائي ${judgmentType} - يرجى إعداد خطاب تحصيل`,
                taskType: "متابعة_محكمة",
                caseId: effectiveCaseId,
                assignedTo: adminSupport?.id || reqUser.id,
                priority: "عاجل",
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              }, reqUser.id);
              createdTasks.push({ type: "collection_task", id: collectionTask.id, description: "مهمة إعداد خطاب تحصيل" });

              // Transition to collection
              const stageHistory = Array.isArray(existingCase.stageHistory) ? existingCase.stageHistory : [];
              await storage.updateCase(effectiveCaseId, {
                currentStage: "تحصيل",
                stageHistory: [
                  ...stageHistory,
                  { stage: "محكوم_حكم_نهائي", timestamp: new Date().toISOString(), userId: reqUser.id, userName: reqUser.name || reqUser.id, notes: `حكم نهائي ${judgmentType}` },
                  { stage: "تحصيل", timestamp: new Date().toISOString(), userId: "system", userName: "النظام", notes: "انتقال تلقائي بعد حكم نهائي" },
                ],
              });
            } else if (judgmentType === "ضدنا") {
              // Case 2: final + against us → close
              caseUpdate.currentStage = "محكوم_حكم_نهائي";
              await storage.updateCase(effectiveCaseId, caseUpdate);

              const stageHistory = Array.isArray(existingCase.stageHistory) ? existingCase.stageHistory : [];
              await storage.updateCase(effectiveCaseId, {
                currentStage: "مقفلة",
                closureReason: "حكم_نهائي_ضدنا",
                closedAt: new Date().toISOString(),
                stageHistory: [
                  ...stageHistory,
                  { stage: "محكوم_حكم_نهائي", timestamp: new Date().toISOString(), userId: reqUser.id, userName: reqUser.name || reqUser.id, notes: "حكم نهائي ضدنا" },
                  { stage: "مقفلة", timestamp: new Date().toISOString(), userId: "system", userName: "النظام", notes: "إغلاق تلقائي — حكم نهائي ضدنا" },
                ],
              });
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
            await storage.updateCase(effectiveCaseId, caseUpdate);

            // If we lost (ضدنا) or got a partial judgment (جزئي), the lawyer
            // signals that an objection is on the table by passing
            // objectionFeasible=true, an objectionDeadline, or
            // needsAppeal=true. Auto-create the لائحة_اعتراضية memo so the
            // drafting work is on the timeline immediately, with the
            // recorded deadline (or +30 days as a fallback when only the
            // intent flag is set).
            const objectionIntended =
              data.objectionFeasible === true ||
              !!data.objectionDeadline ||
              needsAppeal === true;
            if ((judgmentType === "ضدنا" || judgmentType === "جزئي") && objectionIntended) {
              const memoAssignee =
                existingCase.primaryLawyerId ||
                existingCase.responsibleLawyerId ||
                lawyerAssignee;
              const objectionDeadlineStr =
                (typeof data.objectionDeadline === "string" && data.objectionDeadline)
                  ? data.objectionDeadline
                  : (() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 30);
                      return d.toISOString().split("T")[0];
                    })();
              const memo = await storage.createMemo({
                caseId: effectiveCaseId,
                hearingId,
                memoType: MemoType.OBJECTION,
                title: `لائحة اعتراضية — قضية رقم ${existingCase.caseNumber}`,
                description: `صدر حكم ابتدائي ${judgmentType} — يرجى تحرير لائحة اعتراضية قبل ${objectionDeadlineStr}`,
                priority: "عاجل",
                assignedTo: memoAssignee,
                createdBy: "system",
                deadline: objectionDeadlineStr,
                isAutoGenerated: true,
                autoGenerateReason: "حكم_ابتدائي_يستوجب_اعتراض",
              });
              createdMemos.push({ type: "objection_memo", id: memo.id, description: "لائحة اعتراضية تلقائية" });

              // Keep activeMemoCount fresh — mirrors PATH A's pattern.
              const activeCount = await getActiveMemoCount(effectiveCaseId);
              await storage.updateCase(effectiveCaseId, { activeMemoCount: activeCount });

              await storage.logCaseActivity({
                caseId: effectiveCaseId,
                userId: reqUser.id,
                userName: reqUser.name || reqUser.id,
                actionType: "case_updated",
                title: "تم إنشاء لائحة اعتراضية تلقائياً",
                details: JSON.stringify({
                  memoId: memo.id,
                  judgmentType,
                  deadline: objectionDeadlineStr,
                }),
              });
            }
          }

          // Always create client contact task for judgments
          const contactTask = await storage.createFieldTask({
            title: `إبلاغ العميل بنتيجة الحكم — قضية رقم ${existingCase.caseNumber}`,
            description: `صدر حكم ${judgmentType || ""} (${isFinal ? "نهائي" : "ابتدائي"}) - يرجى إبلاغ العميل بالتفاصيل`,
            taskType: "زيارة_عميل",
            caseId: effectiveCaseId,
            assignedTo: lawyerAssignee,
            priority: "عاجل",
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          }, reqUser.id);
          createdTasks.push({ type: "contact_client", id: contactTask.id, description: "مهمة إبلاغ العميل" });
        }

        // ==================== PATH C: STRUCK OFF (شطب) ====================
        else if (data.result === HearingResult.DISMISSAL) {
          const todayStr = new Date().toISOString().split("T")[0];
          const reopenDeadline = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          caseUpdate.currentStage = "مشطوبة";
          caseUpdate.struckOffDate = todayStr;
          caseUpdate.struckOffReopenDeadline = reopenDeadline;
          await storage.updateCase(effectiveCaseId, caseUpdate);

          await storage.logCaseActivity({
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
          // Auto-create collection task
          const allUsers = await storage.getAllUsers();
          const adminSupport = allUsers.find((u: any) => u.role === "admin_support" && u.isActive);
          const collectionTask = await storage.createFieldTask({
            title: `إعداد خطاب تحصيل — قضية رقم ${existingCase.caseNumber}`,
            description: `تم الصلح - يرجى إعداد خطاب تحصيل`,
            taskType: "متابعة_محكمة",
            caseId: effectiveCaseId,
            assignedTo: adminSupport?.id || reqUser.id,
            priority: "عاجل",
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          }, reqUser.id);
          createdTasks.push({ type: "collection_task", id: collectionTask.id, description: "مهمة إعداد خطاب تحصيل" });

          caseUpdate.currentStage = "تحصيل";
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
          if (existingCase.isSettlementCase && choice === "close") {
            caseUpdate.currentStage = "مقفلة";
            caseUpdate.status = "مغلق";
            caseUpdate.closedAt = new Date().toISOString();
            await storage.updateCase(effectiveCaseId, caseUpdate);
            await storage.logCaseActivity({
              caseId: effectiveCaseId,
              userId: reqUser.id,
              userName: reqUser.name || reqUser.id,
              actionType: "settlement_failed_closed",
              title: "لم يتم الصلح — تم إغلاق القضية نهائياً",
            });
          } else if (existingCase.isSettlementCase && choice === "continue") {
            // Move the case off InCourtSettlementStages onto the regular
            // UnderStudy path so the progress bar resolves correctly. The
            // current stage أغلق_طلب_الصلح exists in the UnderStudy general
            // / commercial / labor arrays, and the resolver will pick the
            // right one from the case's department.
            const prevClassification = existingCase.caseClassification || "منظورة_بالمحكمة";
            caseUpdate.currentStage = "أغلق_طلب_الصلح";
            caseUpdate.isSettlementCase = false;
            caseUpdate.caseClassification = "قيد_الدراسة";
            await storage.updateCase(effectiveCaseId, caseUpdate);
            await storage.logCaseActivity({
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
              await storage.updateCase(effectiveCaseId, caseUpdate);
              await storage.logCaseActivity({
                caseId: effectiveCaseId,
                userId: reqUser.id,
                userName: reqUser.name || reqUser.id,
                actionType: "settlement_failed_closed",
                title: "لم يتم الصلح — تم إغلاق القضية نهائياً (تلقائي)",
              });
            } else {
              caseUpdate.currentStage = "أغلق_طلب_الصلح";
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
              performerName: reqUser.name || reqUser.id,
            });
            await storage.logCaseActivity({
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

      res.json({ hearing: updatedHearing, createdTasks, createdMemos });
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
      if (!canActOnHearing(req.user!, hearing)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }
      if (!hearing.result) {
        return res.status(400).json({ error: "يجب تسجيل نتيجة الجلسة أولاً" });
      }

      const data = hearingReportSchema.parse(req.body);
      
      const updated = await storage.updateHearing(hearingId, {
        hearingReport: data.hearingReport,
        recommendations: data.recommendations || "",
        nextSteps: data.nextSteps || "",
        contactCompleted: data.contactCompleted,
        reportCompleted: true,
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error submitting hearing report:", error);
      res.status(500).json({ error: "حدث خطأ في حفظ تقرير الجلسة" });
    }
  });

  app.post("/api/hearings/:id/close", requireAuth, async (req: AuthRequest, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!canActOnHearing(req.user!, hearing)) {
        return res.status(403).json({ error: "ليس لديك صلاحية تنفيذ هذا الإجراء" });
      }
      if (!hearing.reportCompleted) {
        return res.status(400).json({ error: "يجب كتابة التقرير أولاً قبل إغلاق الجلسة" });
      }
      if (!hearing.contactCompleted) {
        return res.status(400).json({ error: "يجب تأكيد الاتصال بالعميل قبل إغلاق الجلسة" });
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

  app.get("/api/field-tasks", requireAuth, async (req, res) => {
    try {
      const tasks = await storage.getAllFieldTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المهام الميدانية" });
    }
  });

  app.get("/api/field-tasks/:id", requireAuth, async (req, res) => {
    try {
      const task = await storage.getFieldTaskById(String(req.params.id));
      if (!task) {
        return res.status(404).json({ error: "المهمة غير موجودة" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المهمة" });
    }
  });

  app.post("/api/field-tasks", requireAuth, async (req, res) => {
    try {
      const validatedData = insertFieldTaskSchema.parse(req.body);

      // Validate assignedTo user is active
      if (validatedData.assignedTo) {
        const { valid } = await validateAssignedUsersActive([validatedData.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "الموظف المكلف غير نشط أو غير موجود" });
        }
      }

      const assignedBy = req.body.assignedBy || "unknown";
      const newTask = await storage.createFieldTask(validatedData, assignedBy);
      res.status(201).json(newTask);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء المهمة" });
    }
  });

  app.patch("/api/field-tasks/:id", requireAuth, async (req, res) => {
    try {
      // Validate assignedTo user is active if being changed
      if (req.body.assignedTo) {
        const { valid } = await validateAssignedUsersActive([req.body.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "الموظف المكلف غير نشط أو غير موجود" });
        }
      }

      const updated = await storage.updateFieldTask(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "المهمة غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث المهمة" });
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
      const newLog = await storage.createContactLog(req.body, createdBy);
      res.status(201).json(newLog);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء سجل التواصل" });
    }
  });

  app.patch("/api/contact-logs/:id", requireAuth, async (req, res) => {
    try {
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
      if (!canCreateMemos(user.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإنشاء المذكرات" });
      }

      const validatedData = insertMemoSchema.parse(req.body);

      // Memo assignment rule: ALWAYS resolve from the case. The memo lawyer
      // is the case's primary (or responsible) lawyer — never the creator,
      // so admin_support creating a memo doesn't get auto-assigned. If the
      // case has no lawyer, leave it empty.
      let resolvedAssignedTo = "";
      if (validatedData.caseId) {
        const relatedCase = await storage.getCaseById(validatedData.caseId);
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
      const isDeptHeadForCase = user.role === "department_head" && relatedCase && relatedCase.departmentId === user.departmentId;
      const canChangeStatus = canReviewMemos(user.role) || canChangeMemoStatus(user.role) || isAssignedToMemo || isAssignedToCase || isDeptHeadForCase;

      if (updateData.status && !canChangeStatus) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتغيير حالة المذكرة" });
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
      const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head", "viewer"];
      // Admin roles previously fetched the entire notifications table with getAllNotifications(),
      // which grows unboundedly (scheduler + workflow actions create many rows). The default
      // is now the 200 most recent. Pass ?all=true only when the full history is needed
      // (e.g., the notification management dashboard). Viewer reads the
      // same global list as branch_manager but cannot mark/dismiss.
      const notificationList = adminRoles.includes(user.role)
        ? req.query.all === "true"
          ? await storage.getAllNotifications()
          : await storage.getRecentNotifications(200)
        : await storage.getNotificationsByRecipient(user.id);
      res.json(notificationList);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الإشعارات" });
    }
  });

  app.get("/api/notifications/user/:userId", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotificationsByRecipient(String(req.params.userId));
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الإشعارات" });
    }
  });

  app.post("/api/notifications", requireAuth, async (req, res) => {
    try {
      const newNotification = await storage.createNotification(req.body);
      // Real-time push to recipient + admins
      const wsEvent = { type: "notification:new", payload: newNotification };
      if (newNotification.recipientId) {
        sendToUser(newNotification.recipientId, wsEvent);
      }
      broadcastToAdmins(wsEvent);
      res.status(201).json(newNotification);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء الإشعار" });
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
      const updated = await storage.updateNotification(String(req.params.id), req.body);
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
      const allNotifications = await storage.getNotificationsByRecipient(userId);
      const unread = allNotifications.filter(n => !n.isRead);
      const now = new Date().toISOString();
      await Promise.all(
        unread.map(n =>
          storage.updateNotification(n.id, {
            isRead: true,
            readAt: now,
            status: "read",
          })
        )
      );
      // Push mark-all-read event to the user's other tabs
      sendToUser(userId, { type: "notification:all-read" });
      res.json({ success: true, count: unread.length });
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

  app.post("/api/attachments", requireAuth, async (req, res) => {
    try {
      const data = insertAttachmentSchema.parse(req.body);
      const attachment = await storage.createAttachment(data);
      res.status(201).json(attachment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إضافة المرفق" });
    }
  });

  app.get("/api/attachments/:entityType/:entityId", requireAuth, async (req, res) => {
    try {
      const entityType = String(req.params.entityType);
      const entityId = String(req.params.entityId);
      const list = await storage.getAttachmentsByEntity(entityType, entityId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المرفقات" });
    }
  });

  app.delete("/api/attachments/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      const deleted = await storage.deleteAttachment(String(req.params.id));
      if (!deleted) {
        return res.status(404).json({ error: "المرفق غير موجود" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف المرفق" });
    }
  });

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

  app.post("/api/sidebar-counts/mark-viewed", requireAuth, async (req: AuthRequest, res) => {
    try {
      const reqUser = req.user!;
      if (!reqUser) return res.status(401).json({ error: "غير مصرح" });
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
      const lawyerCases = allCases.filter(c => c.responsibleLawyerId === lawyer.id);
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

      const judgmentHearings = lawyerHearings.filter(h => h.result === "حكم");
      const wonCases = judgmentHearings.filter(h => h.judgmentSide === "لصالحنا").length;
      const lostCases = judgmentHearings.filter(h => h.judgmentSide === "ضدنا").length;
      const totalJudgments = wonCases + lostCases;
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
      if (!canViewCase(user, caseItem)) {
        return res.status(403).json({ error: "لا تملك صلاحية لإضافة تعليق على هذه القضية" });
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
      if (!canViewCase(user, caseItem)) {
        return res.status(403).json({ error: "لا تملك صلاحية لإضافة ملاحظة على هذه القضية" });
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
      await storage.logCaseActivity({
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
      const deadline = await storage.createLegalDeadline(validated);
      if (validated.caseId) {
        const user = req.user!;
        await storage.logCaseActivity({
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
      const deadline = await storage.updateLegalDeadline(String(req.params.id), req.body);
      if (!deadline) return res.status(404).json({ message: "موعد غير موجود" });
      res.json(deadline);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الموعد النظامي" });
    }
  });

  app.delete("/api/legal-deadlines/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.deleteLegalDeadline(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الموعد النظامي" });
    }
  });

  // ==================== Delegations ====================

  app.get("/api/delegations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const delegations = await storage.getAllDelegations();
      res.json(delegations);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب التفويضات" });
    }
  });

  app.post("/api/delegations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
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
      const delegation = await storage.updateDelegation(String(req.params.id), req.body);
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
        cases = cases.filter(c => c.responsibleLawyerId === user.id || c.departmentId === user.departmentId);
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
    const allNotifications = await storage.getAllNotifications();

    let userCases = allCases;
    if (user.role === "employee") {
      userCases = allCases.filter(c => c.responsibleLawyerId === user.id);
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

    const unreadNotifications = allNotifications.filter(n => n.recipientId === user.id && !n.isRead).length;

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
      hearingDate: h.hearingDate, hearingTime: h.hearingTime, courtName: h.courtName, courtRoom: h.courtRoom, status: h.status, result: h.result || "", resultDetails: h.resultDetails || "",
    }));
    const csv = generateCSV(exportData, ["التاريخ", "الوقت", "المحكمة", "القاعة", "الحالة", "النتيجة", "تفاصيل النتيجة"], ["hearingDate", "hearingTime", "courtName", "courtRoom", "status", "result", "resultDetails"]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=hearings-${Date.now()}.csv`);
    res.send("\uFEFF" + csv);
  });

  // ==================== File Upload/Download ====================

  app.post("/api/attachments/upload", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ message: "لم يتم رفع ملف" });
    const user = req.user!;
    const attachment = await storage.createAttachment({
      entityType: req.body.entityType || "case",
      entityId: req.body.entityId,
      fileName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: user.id,
    });
    if (req.body.entityType === "case" && req.body.entityId) {
      await storage.logCaseActivity({
        caseId: req.body.entityId,
        userId: user.id,
        userName: user.name,
        actionType: "attachment_added",
        title: `تم إرفاق ملف: ${req.file.originalname}`,
        relatedEntityType: "attachment",
        relatedEntityId: attachment.id,
      });
    }
    res.json(attachment);
  });

  app.get("/api/attachments/:id/download", requireAuth, async (req: AuthRequest, res) => {
    const filePath = path.join(uploadsDir, String(req.params.id));
    if (fs.existsSync(filePath)) {
      return res.download(filePath);
    }
    res.status(404).json({ message: "ملف غير موجود" });
  });

  return httpServer;
}
