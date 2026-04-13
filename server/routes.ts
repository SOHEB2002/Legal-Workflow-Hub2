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
  CaseClassification,
  CaseStage,
  CaseStagesOrder,
  getStagesForClassification,
  type CaseTypeValue,
  canCreateMemos,
  canReviewMemos,
  canChangeMemoStatus,
  canDeleteMemos,
  insertTicketSchema,
  canManageSupportTickets,
  insertLegalDeadlineSchema,
} from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth, requireRole, generateToken, verifyTokenForRefresh, validatePassword, hashPassword, comparePassword, generateCsrfToken } from "./auth";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendToUser, broadcastToAdmins } from "./websocket";

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
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

function canModifyCase(user: { id: string; role: string; departmentId: string | null }, caseData: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"];
  if (adminRoles.includes(user.role)) return true;
  if (user.role === "department_head" && caseData.departmentId === user.departmentId) return true;
  if (caseData.primaryLawyerId === user.id || caseData.responsibleLawyerId === user.id) return true;
  if (Array.isArray(caseData.assignedLawyers) && caseData.assignedLawyers.includes(user.id)) return true;
  if (caseData.internalReviewerId && caseData.internalReviewerId === user.id) return true;
  return false;
}

function canViewCase(user: { id: string; role: string; departmentId: string | null }, caseData: any): boolean {
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"];
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
  const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"];
  if (adminRoles.includes(user.role)) return true;
  if (user.role === "department_head" && consultation.departmentId === user.departmentId) return true;
  if (consultation.assignedTo === user.id || consultation.createdBy === user.id) return true;
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

// ==================== Server-Side Stage Transition Validation ====================

interface StageTransitionRule {
  from: string;
  to: string;
  allowedRoles: string[];
}

const ALLOWED_CASE_TRANSITIONS: StageTransitionRule[] = [
  // ==================== COMMON TRANSITIONS ====================
  { from: "استلام", to: "استكمال_البيانات", allowedRoles: ["department_head", "branch_manager"] },
  { from: "استكمال_البيانات", to: "دراسة", allowedRoles: ["department_head", "assigned_lawyer", "branch_manager"] },
  { from: "دراسة", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "تحرير_صحيفة_الدعوى", to: "مراجعة_داخلية", allowedRoles: ["assigned_lawyer"] },
  { from: "مراجعة_داخلية", to: "إحالة_للجنة_المراجعة", allowedRoles: ["internal_reviewer", "department_head", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "جاهزة_للرفع", allowedRoles: ["cases_review_head", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "الأخذ_بالملاحظات", allowedRoles: ["cases_review_head", "branch_manager"] },
  { from: "الأخذ_بالملاحظات", to: "جاهزة_للرفع", allowedRoles: ["assigned_lawyer"] },
  { from: "مراجعة_داخلية", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["internal_reviewer", "department_head", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["cases_review_head", "branch_manager"] },

  // Skip data completion
  { from: "استلام", to: "دراسة", allowedRoles: ["department_head", "branch_manager", "assigned_lawyer"] },

  // ==================== GENERAL PATH (after ready_to_submit) ====================
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_ناجز", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_ناجز", to: "مداولة_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_ناجز", to: "منظورة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "أغلق_طلب_الصلح", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "منظورة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "قيد_التدقيق_في_ناجز", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "مداولة_الصلح", to: "تحصيل", allowedRoles: ["admin_support", "department_head", "branch_manager"] },

  // ==================== COMMERCIAL PATH (taradi then najiz) ====================
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_تراضي", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_تراضي", to: "مداولة_الصلح", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },

  // ==================== LABOR PATH (settlement before drafting) ====================
  { from: "دراسة", to: "توجيه_العميل_بالتسوية", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "توجيه_العميل_بالتسوية", to: "بانتظار_رفع_العميل_للتسوية", allowedRoles: ["department_head", "assigned_lawyer"] },
  { from: "بانتظار_رفع_العميل_للتسوية", to: "مداولة_الصلح", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "أغلق_طلب_الصلح", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer"] },

  // ==================== ADMIN PATH (prescription date + grievance) ====================
  { from: "استلام", to: "تحديد_تاريخ_التقادم", allowedRoles: ["department_head", "assigned_lawyer", "branch_manager"] },
  { from: "تحديد_تاريخ_التقادم", to: "استكمال_البيانات", allowedRoles: ["department_head", "assigned_lawyer", "branch_manager"] },
  { from: "دراسة", to: "تحرير_صيغة_التظلم", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "تحرير_صيغة_التظلم", to: "مراجعة_داخلية_للتظلم", allowedRoles: ["assigned_lawyer"] },
  { from: "مراجعة_داخلية_للتظلم", to: "تقديم_التظلم", allowedRoles: ["internal_reviewer", "department_head", "branch_manager"] },
  { from: "مراجعة_داخلية_للتظلم", to: "تحرير_صيغة_التظلم", allowedRoles: ["internal_reviewer", "department_head", "branch_manager"] },
  { from: "تقديم_التظلم", to: "انتظار_رد_التظلم", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "انتظار_رد_التظلم", to: "تحصيل", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "انتظار_رد_التظلم", to: "تحرير_صحيفة_الدعوى", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "جاهزة_للرفع", to: "قيد_التدقيق_في_معين", allowedRoles: ["assigned_lawyer", "department_head", "branch_manager"] },
  { from: "قيد_التدقيق_في_معين", to: "منظورة", allowedRoles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },

  // ==================== EXISTING CASE PATH (memo before study) ====================
  { from: "استكمال_البيانات", to: "تحرير_مذكرة_جوابية", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "تحرير_مذكرة_جوابية", to: "مراجعة_داخلية", allowedRoles: ["assigned_lawyer"] },
  { from: "الأخذ_بالملاحظات", to: "تحرير_مذكرة_جوابية", allowedRoles: ["assigned_lawyer"] },
  { from: "الأخذ_بالملاحظات", to: "دراسة", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "استكمال_البيانات", to: "دراسة", allowedRoles: ["assigned_lawyer", "department_head"] },

  // ==================== POST-TRIAL TRANSITIONS ====================
  { from: "منظورة", to: "محكوم_حكم_ابتدائي", allowedRoles: ["assigned_lawyer"] },
  { from: "منظورة", to: "محكوم_حكم_نهائي", allowedRoles: ["assigned_lawyer"] },
  { from: "منظورة", to: "مشطوبة", allowedRoles: ["assigned_lawyer"] },

  { from: "محكوم_حكم_ابتدائي", to: "منظورة_استئناف", allowedRoles: ["assigned_lawyer", "department_head"] },
  { from: "محكوم_حكم_ابتدائي", to: "مقفلة", allowedRoles: ["department_head", "branch_manager"] },

  { from: "منظورة_استئناف", to: "محكوم_حكم_نهائي", allowedRoles: ["assigned_lawyer"] },
  { from: "منظورة_استئناف", to: "مشطوبة", allowedRoles: ["assigned_lawyer"] },

  { from: "محكوم_حكم_نهائي", to: "تحصيل", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "محكوم_حكم_نهائي", to: "مقفلة", allowedRoles: ["department_head", "branch_manager"] },

  { from: "تحصيل", to: "مقفلة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },

  { from: "مشطوبة", to: "منظورة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "مشطوبة", to: "منظورة_استئناف", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "مشطوبة", to: "مقفلة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
];

const ALLOWED_CONSULTATION_TRANSITIONS: StageTransitionRule[] = [
  // Forward transitions
  { from: "استلام", to: "دراسة", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "دراسة", to: "إعداد_الرد", allowedRoles: ["department_head", "branch_manager", "assigned_lawyer"] },
  { from: "إعداد_الرد", to: "لجنة_المراجعة", allowedRoles: ["employee", "department_head", "branch_manager", "assigned_lawyer"] },
  { from: "لجنة_المراجعة", to: "جاهز", allowedRoles: ["consultations_review_head", "department_head", "branch_manager"] },
  { from: "لجنة_المراجعة", to: "تعديلات", allowedRoles: ["consultations_review_head", "department_head", "branch_manager"] },
  { from: "تعديلات", to: "لجنة_المراجعة", allowedRoles: ["employee", "department_head", "branch_manager", "assigned_lawyer"] },
  { from: "جاهز", to: "مسلّم", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "مسلّم", to: "مغلق", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  // Backward transitions
  { from: "دراسة", to: "استلام", allowedRoles: ["branch_manager", "department_head"] },
  { from: "إعداد_الرد", to: "دراسة", allowedRoles: ["branch_manager", "department_head"] },
  { from: "لجنة_المراجعة", to: "إعداد_الرد", allowedRoles: ["branch_manager", "consultations_review_head", "department_head"] },
  { from: "جاهز", to: "تعديلات", allowedRoles: ["branch_manager", "department_head"] },
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
  entityType: "case" | "consultation",
  user?: { id: string },
  entityData?: any
): { allowed: boolean; reason?: string } {
  if (currentStage === targetStage) {
    return { allowed: false, reason: "العنصر في نفس المرحلة المطلوبة" };
  }

  // Early closure: admin_support can move any stage to مقفلة
  if (entityType === "case" && targetStage === "مقفلة" && userRole === "admin_support") {
    return { allowed: true };
  }

  const isInternalReviewer =
    entityType === "case" && !!user && !!entityData && entityData.internalReviewerId === user.id;

  // Internal review stages are locked: only the designated internal reviewer,
  // the department head, or the branch manager can transition out of them.
  if (
    entityType === "case" &&
    (currentStage === "مراجعة_داخلية" || currentStage === "مراجعة_داخلية_للتظلم")
  ) {
    const isHeadOrManager = userRole === "department_head" || userRole === "branch_manager";
    if (!isInternalReviewer && !isHeadOrManager) {
      return {
        allowed: false,
        reason: "فقط المراجع الداخلي المعين أو رئيس القسم يمكنهم التصرف في مرحلة المراجعة الداخلية",
      };
    }
  }

  const effectiveRoles = [userRole];
  if (entityType === "case" && user && entityData && isAssignedLawyer(user, entityData)) {
    effectiveRoles.push("assigned_lawyer");
  }
  if (isInternalReviewer) {
    effectiveRoles.push("internal_reviewer");
  }

  // Rollback logic for cases
  if (entityType === "case" && entityData) {
    const classification = entityData.caseClassification as string;
    const caseType = entityData.caseType as CaseTypeValue;
    const stages = getStagesForClassification(classification as any, caseType);
    const currentIdx = stages.indexOf(currentStage as any);
    const targetIdx = stages.indexOf(targetStage as any);

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

  // Forward transitions: check ALLOWED_CASE_TRANSITIONS or ALLOWED_CONSULTATION_TRANSITIONS
  const rules = entityType === "case" ? ALLOWED_CASE_TRANSITIONS : ALLOWED_CONSULTATION_TRANSITIONS;
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
): string {
  let score = 0;

  if (classification === "قضية_مقيدة") score += 30;
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

      const token = generateToken(user.id, user.role, user.departmentId);
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
      const newToken = generateToken(user.id, user.role, user.departmentId);
      const csrfToken = generateCsrfToken(user.id);
      res.json({ token: newToken, csrfToken });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تجديد الجلسة" });
    }
  });

  app.post("/api/auth/change-password", passwordChangeLimiter, requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
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
      await storage.updateUser(user.id, { password: hashed, mustChangePassword: false } as any);
      const newToken = generateToken(user.id, user.role, user.departmentId);
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
      await storage.updateUser(user.id, { password: hashed, mustChangePassword: true } as any);
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
      await storage.updateUser(userId, { password: hashed } as any);
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

      const updated = await storage.updateUser(String(req.params.id), validatedData as any);
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

  app.get("/api/users/:id/dependencies", requireAuth, requireRole("branch_manager", "admin_support"), async (req, res) => {
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
      ).map(c => ({ id: c.id, title: c.title, caseNumber: c.caseNumber, type: "case" as const }));

      const allConsultations = await storage.getAllConsultations();
      const assignedConsultations = allConsultations.filter(c => c.assignedTo === userId)
        .map(c => ({ id: c.id, title: c.title, type: "consultation" as const }));

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

  app.delete("/api/users/:id", requireAuth, requireRole("branch_manager", "admin_support"), async (req, res) => {
    try {
      const userId = String(req.params.id);
      const currentUser = (req as any).user;

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
              message: `القضية "${c.title || c.caseNumber}" أصبحت بدون محامي مسند بعد حذف المستخدم "${targetUser.name}"`,
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
              message: `الاستشارة "${c.title}" أصبحت بدون محامي مسند بعد حذف المستخدم "${targetUser.name}"`,
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
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "يجب تسجيل الدخول" });
      }

      const allCases = await storage.getAllCases();
      const { role, id: userId, departmentId } = user;

      // Strip stageHistory from list responses — it can be 20-50 entries per case
      // and is only needed in the case detail view (GET /api/cases/:id).
      const stripForList = (cases: any[]) =>
        cases.map(({ stageHistory: _sh, ...c }) => c);

      if (["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"].includes(role)) {
        return res.json(stripForList(allCases));
      }

      if (role === "department_head") {
        const filtered = allCases.filter((c: any) => c.departmentId === departmentId);
        return res.json(stripForList(filtered));
      }

      if (role === "employee") {
        const filtered = allCases.filter((c: any) =>
          (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(userId)) ||
          c.primaryLawyerId === userId ||
          c.responsibleLawyerId === userId
        );
        return res.json(stripForList(filtered));
      }

      return res.status(403).json({ error: "ليس لديك صلاحية لعرض القضايا" });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضايا" });
    }
  });

  app.get("/api/cases/:id", requireAuth, async (req, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const user = (req as any).user;
      if (!canViewCase(user, caseItem)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه القضية" });
      }
      res.json(caseItem);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضية" });
    }
  });

  app.post("/api/cases", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!["branch_manager", "admin_support"].includes(user.role)) {
        return res.status(403).json({ error: "إنشاء القضايا متاح فقط لمدير الفرع والدعم الإداري" });
      }
      const validatedData = insertCaseSchema.parse(req.body);
      const createdBy = req.body.createdBy || "unknown";
      const newCase = await storage.createCase(validatedData as any, createdBy);

      const autoCreated: any[] = [];
      const classification = validatedData.caseClassification || "قضية_جديدة";

      const smartPriority = calculateSmartPriority(
        validatedData.caseType || "",
        classification,
        !!(validatedData as any).memoRequired,
        (req.body.nextHearingDate as string | null) || null,
        validatedData.priority || "متوسط",
        validatedData.responseDeadline || null
      );
      if (smartPriority !== newCase.priority) {
        await storage.updateCase(newCase.id, { priority: smartPriority } as any);
        (newCase as any).priority = smartPriority;
      }

      // Auto-create memo for existing cases where client is defendant
      const isDefendant = classification === CaseClassification.CASE_EXISTING && req.body.clientRole === "مدعى_عليه";
      if (isDefendant) {
        const deadlineStr = validatedData.responseDeadline || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const casePriority = validatedData.priority || "متوسط";
        try {
          const memo = await storage.createMemo({
            caseId: newCase.id,
            memoType: MemoType.RESPONSE,
            title: `مذكرة جوابية - ${newCase.caseNumber}`,
            description: `مذكرة جوابية تلقائية لقضية مدعى عليه - ${newCase.caseNumber}`,
            priority: casePriority,
            assignedTo: newCase.primaryLawyerId || createdBy,
            createdBy: "system",
            deadline: deadlineStr,
            isAutoGenerated: true,
            autoGenerateReason: "قضية_مدعى_عليه",
            status: MemoStatus.NOT_STARTED,
          });
          autoCreated.push({ type: "response_memo", id: memo.id });
          await storage.updateCase(newCase.id, { activeMemoCount: 1 } as any);
        } catch (e) {
          console.error("Error auto-creating defendant memo:", e);
        }

        if (req.body.nextHearingDate && req.body.nextHearingDate.trim()) {
          try {
            const hearing = await storage.createHearing({
              caseId: newCase.id,
              hearingDate: req.body.nextHearingDate,
              hearingTime: req.body.nextHearingTime || "09:00",
              courtName: (validatedData.courtName || "المحكمة العامة") as any,
              status: "قادمة",
            });
            autoCreated.push({ type: "hearing", id: hearing.id });
            await storage.updateCase(newCase.id, { nextHearingDate: req.body.nextHearingDate } as any);
          } catch (e) {
            console.error("Error auto-creating defendant hearing:", e);
          }
        }

        try {
          await storage.createNotification({
            type: "case_assigned" as any,
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

      if (!isDefendant && req.body.nextHearingDate && req.body.nextHearingDate.trim()) {
        try {
          const hearing = await storage.createHearing({
            caseId: newCase.id,
            hearingDate: req.body.nextHearingDate,
            hearingTime: req.body.nextHearingTime || "09:00",
            courtName: (validatedData.courtName || "المحكمة العامة") as any,
            status: "قادمة",
          });
          autoCreated.push({ type: "hearing", id: hearing.id });
          await storage.updateCase(newCase.id, { nextHearingDate: req.body.nextHearingDate } as any);
        } catch (e) {
          console.error("Error auto-creating hearing for non-defendant case:", e);
        }
      }

      if (req.body.memoRequired && !isDefendant) {
        try {
          const memoDeadline = req.body.responseDeadline || validatedData.responseDeadline || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const memoTitle = `مذكرة — قضية رقم ${newCase.caseNumber}`;
          const memo = await storage.createMemo({
            caseId: newCase.id,
            memoType: MemoType.RESPONSE,
            title: memoTitle,
            description: memoTitle,
            priority: validatedData.priority || "متوسط",
            assignedTo: newCase.primaryLawyerId || createdBy,
            createdBy: "system",
            deadline: memoDeadline,
            isAutoGenerated: true,
            autoGenerateReason: "مطلوب_مذكرة_عند_الإنشاء",
            status: MemoStatus.NOT_STARTED,
          });
          autoCreated.push({ type: "memo_required", id: memo.id });
          const activeCount = await getActiveMemoCount(newCase.id);
          await storage.updateCase(newCase.id, { activeMemoCount: activeCount } as any);
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
      console.error("Error creating case:", error);
      res.status(500).json({ error: "حدث خطأ في إنشاء القضية" });
    }
  });

  app.patch("/api/cases/:id/taradi", requireAuth, async (req, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = (req as any).user;
      if (!canModifyCase(user, caseItem)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      if (caseItem.caseClassification !== CaseClassification.CASE_NEW || caseItem.caseType !== "تجاري") {
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
            type: "stage_changed" as any,
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

  app.patch("/api/cases/:id/mohr", requireAuth, async (req, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = (req as any).user;
      if (!canModifyCase(user, caseItem)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      if (caseItem.caseClassification !== CaseClassification.CASE_NEW || caseItem.caseType !== "عمالي") {
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
            type: "stage_changed" as any,
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

  app.post("/api/cases/:id/direct-settlement", requireAuth, async (req, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = (req as any).user;
      if (!canModifyCase(user, caseItem)) return res.status(403).json({ error: "لا تملك صلاحية لهذا الإجراء" });
      if (caseItem.caseClassification !== CaseClassification.CASE_NEW || caseItem.caseType !== "عمالي") {
        return res.status(400).json({ error: "هذا الإجراء متاح فقط للقضايا العمالية الجديدة" });
      }
      
      await storage.updateCase(caseItem.id, { 
        amicableSettlementDirected: true,
        mohrStatus: "توجيه_تسوية_ودية",
      } as any);
      
      const allUsers = await storage.getAllUsers();
      const adminSupports = allUsers.filter((u: any) => u.role === "admin_support" && u.isActive);
      for (const admin of adminSupports) {
        await storage.createNotification({
          type: "task_reminder" as any,
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

  app.post("/api/cases/:id/skip-data-completion", requireAuth, async (req, res) => {
    const caseId = String(req.params.id);
    try {
      const caseItem = await storage.getCaseById(caseId);
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = (req as any).user;

      const authorized =
        user.role === "branch_manager" ||
        user.role === "cases_review_head" ||
        isAssignedLawyer(user, caseItem);
      if (!authorized) {
        return res.status(403).json({ error: "لا تملك صلاحية تجاوز مرحلة استكمال البيانات" });
      }

      if (caseItem.currentStage !== "استلام") {
        return res.status(400).json({ error: "تجاوز مرحلة استكمال البيانات متاح فقط من مرحلة الاستلام" });
      }

      const { notes } = req.body;
      const skipNote = (notes && typeof notes === "string" && notes.trim()) || "تم تجاوز مرحلة استكمال البيانات - الدعوى مكتملة";
      const now = new Date().toISOString();
      const existingHistory = Array.isArray((caseItem as any).stageHistory) ? (caseItem as any).stageHistory : [];
      const stageHistory = [
        ...existingHistory,
        { stage: "استكمال_البيانات", timestamp: now, userId: user.id, userName: user.name, notes: "تجاوز تلقائي" },
        { stage: "دراسة", timestamp: now, userId: user.id, userName: user.name, notes: skipNote },
      ];

      // Step 1: update the case (the only critical operation)
      let updated;
      try {
        updated = await storage.updateCase(caseItem.id, { currentStage: "دراسة", stageHistory } as any);
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
          title: "تجاوز مرحلة استكمال البيانات والانتقال مباشرةً للدراسة",
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

  app.post("/api/cases/:id/court-register", requireAuth, async (req, res) => {
    try {
      const caseItem = await storage.getCaseById(String(req.params.id));
      if (!caseItem) return res.status(404).json({ error: "القضية غير موجودة" });
      const user = (req as any).user;
      if (!canEditCaseData(user)) return res.status(403).json({ error: "لا تملك صلاحية تقييد القضية في المحكمة" });
      if (caseItem.caseClassification !== CaseClassification.CASE_NEW) {
        return res.status(400).json({ error: "القضية مقيدة في المحكمة بالفعل" });
      }
      // Prerequisite: commercial cases must have taradiStatus === "لم_يتم_صلح" and a taradi number
      if (caseItem.caseType === "تجاري" && (caseItem as any).taradiStatus !== "لم_يتم_صلح") {
        return res.status(400).json({ error: "يجب إتمام مرحلة تراضي (عدم الصلح) قبل تقييد القضية التجارية في المحكمة" });
      }
      if (caseItem.caseType === "تجاري" && !(caseItem as any).taradiNumber) {
        return res.status(400).json({ error: "يجب إدخال رقم الطلب في منصة تراضي قبل تقييد القضية في المحكمة" });
      }
      // Prerequisite: labor cases must have mohrStatus === "انتهت_التسوية"
      if (caseItem.caseType === "عمالي" && (caseItem as any).mohrStatus !== "انتهت_التسوية") {
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
        caseClassification: CaseClassification.CASE_EXISTING,
        currentStage: CaseStage.UNDER_REVIEW,
        courtCaseNumber: courtCaseNumber.trim().substring(0, 100),
        najizNumber: najizNumber.trim().substring(0, 100),
      } as any);
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

  app.patch("/api/cases/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getCaseById(String(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const user = (req as any).user;

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
      const effectiveDataFields = isCourtAcceptTransition
        ? caseDataFields.filter((f) => f !== "courtCaseNumber")
        : caseDataFields;
      const hasDataFields = Object.keys(req.body).some((k) => effectiveDataFields.includes(k));

      if (hasDataFields && !canEditCaseData(user)) {
        return res.status(403).json({ error: "تعديل بيانات القضية متاح فقط لمدير الفرع والدعم الإداري" });
      }

      // Guard departmentId changes – use explicit presence check to catch null/empty string too
      if ("departmentId" in req.body && req.body.departmentId !== existing.departmentId) {
        if (!canEditCaseData(user)) {
          // department_head may only set their own department, and only when req.body.departmentId is their dept
          if (user.role !== "department_head" || req.body.departmentId !== user.departmentId) {
            return res.status(403).json({ error: "لا تملك صلاحية تغيير قسم هذه القضية" });
          }
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

      // Validate stage transition if changing stage
      if (req.body.currentStage && req.body.currentStage !== existing.currentStage) {
        // Use merged case data for validation when classification also changes simultaneously.
        // IMPORTANT: caseType on the row holds the case sub-type (e.g. "بيع وتوريد"),
        // NOT the department label — but validateStageTransition's rollback logic
        // calls getStagesForClassification(classification, caseType) to pick the
        // path array. Override caseType on the merged copy with the resolved
        // department name so commercial/admin/general paths are selected correctly.
        const mergedCase: any = { ...existing, ...req.body };
        try {
          const dept = (existing as any).departmentId
            ? await storage.getDepartmentById((existing as any).departmentId)
            : null;
          if (dept?.name) {
            mergedCase.caseType = dept.name;
          }
        } catch (e) {
          console.error("[PATCH cases] failed to resolve department for path routing", e);
        }
        const stageCheck = validateStageTransition(existing.currentStage, req.body.currentStage, user.role, "case", user, mergedCase);
        if (!stageCheck.allowed) {
          return res.status(400).json({ error: stageCheck.reason });
        }
        // === EARLY CLOSURE VALIDATION ===
        if (req.body.currentStage === "مقفلة" && user.role === "admin_support") {
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
        if (targetStage === "قيد_التدقيق_في_تراضي") {
          const taradi = req.body.taradiNumber || (existing as any).taradiNumber;
          if (!taradi) return res.status(400).json({ error: "يجب إدخال رقم الطلب في تراضي" });
        }
        if (targetStage === "قيد_التدقيق_في_ناجز") {
          const najiz = req.body.najizNumber || (existing as any).najizNumber;
          if (!najiz) return res.status(400).json({ error: "يجب إدخال رقم القيد في ناجز" });
        }
        if (targetStage === "قيد_التدقيق_في_معين") {
          const moeen = req.body.moeenNumber || (existing as any).moeenNumber;
          if (!moeen) return res.status(400).json({ error: "يجب إدخال رقم القيد في معين" });
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

        // Before تقديم_التظلم: require grievanceDate
        if (targetStage === "تقديم_التظلم") {
          const gDate = req.body.grievanceDate || (existing as any).grievanceDate;
          if (!gDate) return res.status(400).json({ error: "يجب تحديد تاريخ التظلم" });
        }

        // From تحديد_تاريخ_التقادم to next: require prescriptionDate
        if (existing.currentStage === "تحديد_تاريخ_التقادم") {
          const pDate = req.body.prescriptionDate || (existing as any).prescriptionDate;
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
      const isDeptTransfer =
        "departmentId" in req.body &&
        req.body.departmentId &&
        req.body.departmentId !== existing.departmentId &&
        !req.body.primaryLawyerId &&
        !req.body.assignedLawyers;

      if (isDeptTransfer) {
        const currentStageIndex = CaseStagesOrder.indexOf(existing.currentStage as any);
        const reviewStageIndex = CaseStagesOrder.indexOf(CaseStage.REVIEW_COMMITTEE as any);
        if (currentStageIndex >= reviewStageIndex) {
          return res.status(400).json({ error: "لا يمكن تحويل القضية في هذه المرحلة - القضية في مرحلة متقدمة من المراجعة" });
        }

        req.body.primaryLawyerId = null;
        req.body.responsibleLawyerId = null;
        req.body.assignedLawyers = [];
        // Also unassign the lawyer from pending hearings and active memos
        const caseId = String(req.params.id);
        try {
          const caseHearings = await storage.getHearingsByCase(caseId);
          for (const h of caseHearings) {
            if (h.status === "قادمة") {
              await storage.updateHearing(h.id, { attendingLawyerId: null } as any);
            }
          }
          const caseMemos = await storage.getMemosByCase(caseId);
          for (const m of caseMemos) {
            if (["لم_تبدأ", "قيد_التحرير", "تحتاج_تعديل"].includes(m.status)) {
              await storage.updateMemo(m.id, { assignedTo: null } as any);
            }
          }
        } catch (e) {
          console.error("Error clearing assignments on department transfer:", e);
        }
      }

      // When moving to an internal-review stage, require an internalReviewerId
      // (either newly provided in req.body or already set on the existing case
      // from a previous round of the review loop) and validate it.
      if (
        (req.body.currentStage === "مراجعة_داخلية" || req.body.currentStage === "مراجعة_داخلية_للتظلم") &&
        existing.currentStage !== req.body.currentStage
      ) {
        const reviewerId: string | undefined =
          req.body.internalReviewerId || (existing as any).internalReviewerId;
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
          // Ensure it's persisted even on loop-back re-entries
          req.body.internalReviewerId = reviewerId;
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
      if (user && existing) {
        try {
          if (isDeptTransfer) {
            await storage.logCaseActivity({
              caseId: String(req.params.id),
              userId: user.id,
              userName: user.name || user.id,
              actionType: "case_updated",
              title: `تم تحويل القضية من قسم إلى آخر`,
              previousValue: existing.departmentId || "",
              newValue: req.body.departmentId,
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

      // Notify the selected internal reviewer when transitioning into either
      // مراجعة_داخلية or مراجعة_داخلية_للتظلم (covers both the initial assignment
      // and re-entries after the lawyer revises following reviewer notes).
      if (
        updated &&
        (req.body.currentStage === "مراجعة_داخلية" || req.body.currentStage === "مراجعة_داخلية_للتظلم") &&
        existing.currentStage !== req.body.currentStage &&
        req.body.internalReviewerId
      ) {
        try {
          await storage.createNotification({
            type: "case_assigned" as any,
            priority: "high",
            status: "pending",
            title: "إسناد مراجعة داخلية",
            message: `تم إسنادك لمراجعة القضية رقم ${updated.caseNumber} مراجعة داخلية`,
            senderId: user.id,
            senderName: user.name || user.id,
            recipientId: req.body.internalReviewerId,
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
              type: "case_assigned" as any,
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
              await storage.updateMemo(m.id, { assignedTo: newLawyerId } as any);
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
              await storage.updateMemo(m.id, { status: "ملغاة" } as any);
            }
          }
          // Cancel pending/in-progress field tasks
          const caseFieldTasks = await storage.getFieldTasksByCase(caseId);
          for (const t of caseFieldTasks) {
            if (t.status === "قيد_التنفيذ" || t.status === "قيد_الانتظار") {
              await storage.updateFieldTask(t.id, { status: "ملغي" } as any);
            }
          }
          // Recalculate activeMemoCount after cancelling memos
          const finalActiveCount = await getActiveMemoCount(caseId);
          await storage.updateCase(caseId, { activeMemoCount: finalActiveCount } as any);
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
      const updated = await storage.updateClient(String(req.params.id), validatedData as any);
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

  app.get("/api/consultations", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "يجب تسجيل الدخول" });
      }

      const allConsultations = await storage.getAllConsultations();
      const { role, id: userId, departmentId } = user;

      if (["branch_manager", "admin_support", "consultations_review_head", "cases_review_head"].includes(role)) {
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

  app.get("/api/consultations/:id", requireAuth, async (req, res) => {
    try {
      const consultation = await storage.getConsultationById(String(req.params.id));
      if (!consultation) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      const user = (req as any).user;
      if (!canModifyConsultation(user, consultation)) {
        return res.status(403).json({ error: "لا تملك صلاحية لعرض هذه الاستشارة" });
      }
      res.json(consultation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الاستشارة" });
    }
  });

  app.post("/api/consultations", requireAuth, async (req, res) => {
    try {
      const validatedData = insertConsultationSchema.parse(req.body);
      const createdBy = req.body.createdBy || "unknown";
      const newConsultation = await storage.createConsultation(validatedData, createdBy);
      res.status(201).json(newConsultation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء الاستشارة" });
    }
  });

  app.patch("/api/consultations/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
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

      const updated = await storage.updateConsultation(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
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

  app.post("/api/hearings", requireAuth, async (req, res) => {
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
      const user = (req as any).user;
      const createdMemos: any[] = [];

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
                await storage.updateCase(caseForStage.id, {
                  currentStage: "مداولة_الصلح",
                  stageHistory: [
                    ...stageHistory,
                    { stage: "مداولة_الصلح", timestamp: new Date().toISOString(), userId: user?.id || "system", userName: user?.name || "النظام", notes: "انتقال تلقائي عند إنشاء جلسة صلح" },
                  ],
                } as any);
              }
            } else if (hearingType === "محكمة") {
              const courtFromStages = ["أغلق_طلب_الصلح", "قيد_التدقيق_في_ناجز", "قيد_التدقيق_في_معين"];
              if (courtFromStages.includes(currentStage)) {
                const stageHistory = Array.isArray(caseForStage.stageHistory) ? caseForStage.stageHistory : [];
                await storage.updateCase(caseForStage.id, {
                  currentStage: "منظورة",
                  stageHistory: [
                    ...stageHistory,
                    { stage: "منظورة", timestamp: new Date().toISOString(), userId: user?.id || "system", userName: user?.name || "النظام", notes: "انتقال تلقائي عند إنشاء جلسة محكمة" },
                  ],
                } as any);
              }
            }
          }
        } catch (e) {
          console.error("Error auto-transitioning stage on hearing create:", e);
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
              await storage.updateCase(linkedCase.id, { priority: smartPriority } as any);
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
          const memoAssignee = relatedCase?.primaryLawyerId || relatedCase?.responsibleLawyerId || user?.id || "1";
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
          await storage.updateCase(validatedData.caseId, { activeMemoCount: activeCount } as any);
        } catch (e) {
          console.error("Error creating auto memo for hearing:", e);
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

  app.patch("/api/hearings/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
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
            await storage.updateCase(relatedCase.id, { priority: smartPriority } as any);
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

  app.post("/api/hearings/:id/result", requireAuth, async (req, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (hearing.status !== HearingStatus.UPCOMING) {
        return res.status(400).json({ error: "لا يمكن تسجيل نتيجة لجلسة غير قادمة" });
      }

      const data = hearingResultSchema.parse(req.body);

      const effectiveCaseId = hearing.caseId || (data.caseId && data.caseId !== "none" ? data.caseId : null);

      if (!hearing.caseId && effectiveCaseId) {
        await storage.updateHearing(hearingId, { caseId: effectiveCaseId });
        hearing.caseId = effectiveCaseId;
      }

      const updateData: any = {
        result: data.result,
        resultDetails: data.resultDetails || "",
        status: (data.result === HearingResult.POSTPONEMENT || data.result === HearingResult.NEW_SESSION)
          ? HearingStatus.POSTPONED : HearingStatus.COMPLETED,
      };

      // Judgment hearing data
      if (data.result === HearingResult.JUDGMENT) {
        updateData.judgmentSide = data.judgmentType || data.judgmentSide || null;
        updateData.judgmentFinal = data.judgmentFinal ?? null;
        updateData.objectionFeasible = data.objectionFeasible ?? null;
        updateData.objectionDeadline = data.objectionDeadline || null;
      }

      // Postponement / new session data
      if (data.result === HearingResult.POSTPONEMENT || data.result === HearingResult.NEW_SESSION) {
        updateData.nextHearingDate = data.nextHearingDate || null;
        updateData.nextHearingTime = data.nextHearingTime || null;
        updateData.responseRequired = data.responseRequired ?? false;
      }

      const updatedHearing = await storage.updateHearing(hearingId, updateData);

      const reqUser = (req as any).user;
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

        // ==================== PATH A: NEW SESSION (موعد_جديد) ====================
        if (data.result === HearingResult.NEW_SESSION) {
          // Case stays at current stage
          if (data.nextHearingDate) {
            caseUpdate.nextHearingDate = data.nextHearingDate;
          }
          await storage.updateCase(effectiveCaseId, caseUpdate);

          // Auto-create next hearing
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
              notes: `موعد جديد من جلسة ${hearing.hearingDate}`,
            } as any);
            createdTasks.push({ type: "new_hearing", id: newHearing.id, description: "تم إنشاء جلسة جديدة تلقائياً" });
          }

          // Auto-create memo if memoRequired
          if (data.memoRequired && existingCase.primaryLawyerId) {
            const memo = await storage.createMemo({
              caseId: effectiveCaseId,
              hearingId: hearingId,
              memoType: MemoType.RESPONSE,
              title: `مذكرة — قضية رقم ${existingCase.caseNumber}`,
              description: `مذكرة مطلوبة بناءً على نتيجة الجلسة بتاريخ ${hearing.hearingDate}`,
              priority: "عالي",
              assignedTo: existingCase.primaryLawyerId,
              createdBy: "system",
              deadline: data.nextHearingDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              status: "لم_تبدأ",
              isAutoGenerated: true,
              autoGenerateReason: "موعد_جديد_مع_مذكرة",
            });
            createdMemos.push({ type: "response_memo", id: memo.id, description: "مذكرة تلقائية" });
            const activeCount = await getActiveMemoCount(effectiveCaseId);
            await storage.updateCase(effectiveCaseId, { activeMemoCount: activeCount } as any);
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
              } as any, reqUser.id);
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
              } as any);
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
              } as any);
            }
          } else {
            // === PRIMARY (ابتدائي) JUDGMENTS ===
            caseUpdate.currentStage = "محكوم_حكم_ابتدائي";

            if (judgmentType === "لصالحنا") {
              // Case 4: primary + for us → wait for opponent appeal
              await storage.updateCase(effectiveCaseId, caseUpdate);
            } else if (judgmentType === "ضدنا") {
              if (needsAppeal) {
                // Case 5: primary + against us + needs appeal → flag for appeal
                await storage.updateCase(effectiveCaseId, caseUpdate);
                await storage.logCaseActivity({
                  caseId: effectiveCaseId,
                  userId: reqUser.id,
                  userName: reqUser.name || reqUser.id,
                  actionType: "case_updated",
                  title: "القضية تحتاج اعتراض (استئناف)",
                });
              } else {
                // Case 6: primary + against us + no appeal → close
                await storage.updateCase(effectiveCaseId, caseUpdate);
                const stageHistory = Array.isArray(existingCase.stageHistory) ? existingCase.stageHistory : [];
                await storage.updateCase(effectiveCaseId, {
                  currentStage: "مقفلة",
                  closureReason: "حكم_ابتدائي_بدون_اعتراض",
                  closedAt: new Date().toISOString(),
                  stageHistory: [
                    ...stageHistory,
                    { stage: "محكوم_حكم_ابتدائي", timestamp: new Date().toISOString(), userId: reqUser.id, userName: reqUser.name || reqUser.id, notes: "حكم ابتدائي ضدنا" },
                    { stage: "مقفلة", timestamp: new Date().toISOString(), userId: "system", userName: "النظام", notes: "إغلاق تلقائي — حكم ابتدائي ضدنا بدون اعتراض" },
                  ],
                } as any);
              }
            } else if (judgmentType === "جزئي") {
              if (needsAppeal) {
                // Case 7: primary + partial + needs appeal → flag for appeal
                await storage.updateCase(effectiveCaseId, caseUpdate);
                await storage.logCaseActivity({
                  caseId: effectiveCaseId,
                  userId: reqUser.id,
                  userName: reqUser.name || reqUser.id,
                  actionType: "case_updated",
                  title: "القضية تحتاج اعتراض (استئناف) — حكم جزئي",
                });
              } else {
                // Case 8: primary + partial + no appeal → wait for opponent
                await storage.updateCase(effectiveCaseId, caseUpdate);
              }
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
          } as any, reqUser.id);
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
              type: "stage_changed" as any,
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
          } as any, reqUser.id);
          createdTasks.push({ type: "collection_task", id: collectionTask.id, description: "مهمة إعداد خطاب تحصيل" });

          caseUpdate.currentStage = "تحصيل";
          await storage.updateCase(effectiveCaseId, caseUpdate);
        }

        // ==================== CONCILIATION: SETTLEMENT FAILED (لم_يتم_الصلح) ====================
        else if (data.result === HearingResult.SETTLEMENT_FAILED || (data.result === HearingResult.SETTLEMENT && data.conciliationResult === "لم_يتم_الصلح")) {
          caseUpdate.currentStage = "أغلق_طلب_الصلح";
          await storage.updateCase(effectiveCaseId, caseUpdate);
        }

        // ==================== POSTPONEMENT (تأجيل) ====================
        else if (data.result === HearingResult.POSTPONEMENT) {
          if (data.nextHearingDate) {
            caseUpdate.nextHearingDate = data.nextHearingDate;
          }
          await storage.updateCase(effectiveCaseId, caseUpdate);

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
              notes: `جلسة مؤجلة من ${hearing.hearingDate}`,
            } as any);
            createdTasks.push({ type: "new_hearing", id: newHearing.id, description: "تم إنشاء جلسة جديدة تلقائياً" });

            if (data.responseRequired) {
              const dueDate = data.nextHearingDate;
              const postponeAssignee = hearing.attendingLawyerId || existingCase.primaryLawyerId || existingCase.responsibleLawyerId || reqUser.id;
              const task = await storage.createFieldTask({
                title: `إعداد رد للجلسة القادمة - ${existingCase.caseNumber}`,
                description: `مطلوب إعداد رد قبل الجلسة القادمة بتاريخ ${data.nextHearingDate}`,
                taskType: "متابعة_محكمة",
                caseId: effectiveCaseId,
                assignedTo: postponeAssignee,
                priority: "عالي",
                dueDate,
              } as any, reqUser.id);
              createdTasks.push({ type: "prepare_response", id: task.id, description: "مهمة إعداد الرد" });

              const deadlineDate = new Date(data.nextHearingDate);
              deadlineDate.setDate(deadlineDate.getDate() - 3);
              const memoAssignee = existingCase.primaryLawyerId || existingCase.responsibleLawyerId || data.userId || "1";
              const memo = await storage.createMemo({
                caseId: effectiveCaseId,
                hearingId: hearingId,
                memoType: MemoType.RESPONSE,
                title: `مذكرة جوابية - جلسة ${data.nextHearingDate}`,
                description: `مذكرة جوابية مطلوبة قبل الجلسة القادمة بتاريخ ${data.nextHearingDate}`,
                priority: "عالي",
                assignedTo: memoAssignee,
                createdBy: "system",
                deadline: deadlineDate.toISOString().split("T")[0],
                isAutoGenerated: true,
                autoGenerateReason: "تأجيل_مع_رد",
              });
              createdMemos.push({ type: "response_memo", id: memo.id, description: "مذكرة جوابية تلقائية" });

              const activeCount = await getActiveMemoCount(effectiveCaseId);
              await storage.updateCase(effectiveCaseId, { activeMemoCount: activeCount } as any);
            }
          }
        }

        // ==================== OTHER / DEFAULT ====================
        else {
          await storage.updateCase(effectiveCaseId, caseUpdate);
        }
      }

      if (createdTasks.length > 0) {
        await storage.updateHearing(hearingId, { adminTasksCreated: true } as any);
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

  app.post("/api/hearings/:id/report", requireAuth, async (req, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
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
      } as any);

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error submitting hearing report:", error);
      res.status(500).json({ error: "حدث خطأ في حفظ تقرير الجلسة" });
    }
  });

  app.post("/api/hearings/:id/close", requireAuth, async (req, res) => {
    try {
      const hearingId = String(req.params.id);
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (!hearing.reportCompleted) {
        return res.status(400).json({ error: "يجب كتابة التقرير أولاً قبل إغلاق الجلسة" });
      }
      if (!hearing.contactCompleted) {
        return res.status(400).json({ error: "يجب تأكيد الاتصال بالعميل قبل إغلاق الجلسة" });
      }

      const updated = await storage.updateHearing(hearingId, {
        status: HearingStatus.COMPLETED,
      } as any);

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

  app.post("/api/contact-logs", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
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

  app.get("/api/memos", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const allMemos = await storage.getAllMemos();
      res.json(allMemos);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المذكرات" });
    }
  });

  app.get("/api/memos/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
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

  app.get("/api/memos/case/:caseId", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const caseMemos = await storage.getMemosByCase(String(req.params.caseId));
      res.json(caseMemos);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب مذكرات القضية" });
    }
  });

  app.get("/api/memos/hearing/:hearingId", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const hearingMemos = await storage.getMemosByHearing(String(req.params.hearingId));
      res.json(hearingMemos);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب مذكرات الجلسة" });
    }
  });

  app.post("/api/memos", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      if (!canCreateMemos(user.role)) {
        return res.status(403).json({ error: "ليس لديك صلاحية لإنشاء المذكرات" });
      }

      const validatedData = insertMemoSchema.parse(req.body);

      // Block memos for closed/archived cases; also resolve assignedTo from case
      let resolvedAssignedTo = validatedData.assignedTo || "";
      if (validatedData.caseId) {
        const relatedCase = await storage.getCaseById(validatedData.caseId);
        if (relatedCase && (relatedCase.currentStage === "مقفلة" || relatedCase.isArchived)) {
          return res.status(400).json({ error: "لا يمكن إضافة مذكرات لقضية مغلقة أو مؤرشفة" });
        }
        if (relatedCase && (!resolvedAssignedTo || user.role === "admin_support")) {
          resolvedAssignedTo =
            relatedCase.primaryLawyerId ||
            relatedCase.responsibleLawyerId ||
            user.id;
        }
      }
      if (!resolvedAssignedTo) resolvedAssignedTo = user.id;

      // Validate assignedTo user is active
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
        await storage.updateCase(memo.caseId, { activeMemoCount: activeCount } as any);
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
    status: z.enum(["لم_تبدأ", "قيد_التحرير", "قيد_المراجعة", "تحتاج_تعديل", "معتمدة", "مرفوعة", "ملغاة"]).optional(),
    reviewNotes: z.string().optional(),
    reviewerId: z.string().optional(),
  });

  app.patch("/api/memos/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
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
        if (memo.status !== MemoStatus.IN_REVIEW) {
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
        await storage.updateCase(memo.caseId, { activeMemoCount: activeCount } as any);
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

  app.delete("/api/memos/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      const user = (req as any).user;
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
        await storage.updateCase(memo.caseId, { activeMemoCount: activeCount } as any);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف المذكرة" });
    }
  });

  // ==================== Notifications ====================

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const adminRoles = ["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"];
      // Admin roles previously fetched the entire notifications table with getAllNotifications(),
      // which grows unboundedly (scheduler + workflow actions create many rows). The default
      // is now the 200 most recent. Pass ?all=true only when the full history is needed
      // (e.g., the notification management dashboard).
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

  app.patch("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const adminRoles = ["branch_manager", "admin_support"];
      if (!adminRoles.includes(user.role)) {
        const existing = await (storage as any).getNotificationById(String(req.params.id));
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

  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).user;
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

  app.get("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  app.get("/api/support/tickets/open-count", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  app.post("/api/support/tickets", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  app.patch("/api/support/tickets/:id/status", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  app.patch("/api/support/tickets/:id/assign", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  app.patch("/api/support/tickets/:id/priority", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  app.post("/api/support/tickets/:id/comment", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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
      const comments = Array.isArray(ticket.comments) ? [...(ticket.comments as any[])] : [];
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

  app.post("/api/support/tickets/:id/rate", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  app.delete("/api/support/tickets/:id", requireAuth, async (req, res) => {
    try {
      const reqUser = (req as any).user;
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

  // ==================== Lawyer Performance Stats ====================

  app.get("/api/stats/lawyer-performance", requireAuth, requireRole("branch_manager", "cases_review_head", "consultations_review_head", "department_head", "admin_support"), async (req: AuthRequest, res) => {
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
      if (!isAssignedLawyer(user, caseItem)) {
        return res.status(403).json({ error: "إضافة التعليقات متاحة فقط للمحامين المسندة إليهم القضية" });
      }
      const { content } = req.body;
      if (!content || !String(content).trim()) {
        return res.status(400).json({ error: "محتوى التعليق مطلوب" });
      }
      const comment = await storage.createCaseComment({
        caseId: String(req.params.id),
        userId: user.id,
        userName: user.name,
        content: String(content).trim(),
      });
      res.status(201).json(comment);
    } catch (error) {
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
      if (!isAssignedLawyer(user, caseItem) && !canModifyCase(user, caseItem)) {
        return res.status(403).json({ error: "إضافة الملاحظات متاحة فقط لمن له علاقة بالقضية" });
      }
      const { content } = req.body;
      if (!content || !String(content).trim()) {
        return res.status(400).json({ error: "محتوى الملاحظة مطلوب" });
      }
      const note = await storage.createCaseNote({
        ...req.body,
        content: String(content).trim().substring(0, 5000),
        caseId: String(req.params.id),
        userId: user.id,
        userName: user.name,
      });
      await storage.logCaseActivity({
        caseId: String(req.params.id),
        userId: user.id,
        userName: user.name,
        actionType: "note_added",
        title: "تمت إضافة ملاحظة داخلية",
      });
      res.json(note);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إضافة الملاحظة" });
    }
  });

  app.patch("/api/case-notes/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const adminRoles = ["branch_manager", "admin_support", "department_head", "cases_review_head"];
      const existing = await (storage as any).getCaseNoteById(String(req.params.id));
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
      const existing = await (storage as any).getCaseNoteById(String(req.params.id));
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

  app.get("/api/stats/court-analytics", requireAuth, requireRole("branch_manager", "cases_review_head", "consultations_review_head"), async (req: AuthRequest, res) => {
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

    const activeCases = userCases.filter(c => (c.currentStage as string) !== "مقفلة" && (c.currentStage as string) !== "مغلق" && !(c as any).isArchived);
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
