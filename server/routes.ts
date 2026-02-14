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
  canCreateMemos,
  canReviewMemos,
  canDeleteMemos,
  insertTicketSchema,
  canManageSupportTickets,
} from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { requireAuth, requireRole, generateToken, verifyTokenForRefresh, validatePassword, hashPassword, comparePassword, generateCsrfToken } from "./auth";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import fs from "fs";

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
  return false;
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
  // Forward transitions
  { from: "استلام", to: "استكمال_البيانات", allowedRoles: ["admin_support", "branch_manager"] },
  { from: "استكمال_البيانات", to: "دراسة", allowedRoles: ["department_head", "branch_manager"] },
  { from: "دراسة", to: "تحرير_المذكرة", allowedRoles: ["employee", "department_head", "branch_manager"] },
  { from: "تحرير_المذكرة", to: "إحالة_للجنة_المراجعة", allowedRoles: ["employee", "department_head", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "تم_الرفع_للدائرة", allowedRoles: ["cases_review_head", "branch_manager"] },
  { from: "إحالة_للجنة_المراجعة", to: "الأخذ_بالملاحظات", allowedRoles: ["cases_review_head", "branch_manager"] },
  { from: "الأخذ_بالملاحظات", to: "إحالة_للجنة_المراجعة", allowedRoles: ["employee", "department_head", "branch_manager"] },
  { from: "تم_الرفع_للدائرة", to: "مقفلة", allowedRoles: ["admin_support", "branch_manager"] },
  // Backward transitions
  { from: "استكمال_البيانات", to: "استلام", allowedRoles: ["branch_manager"] },
  { from: "دراسة", to: "استكمال_البيانات", allowedRoles: ["branch_manager"] },
  { from: "تحرير_المذكرة", to: "دراسة", allowedRoles: ["branch_manager", "department_head"] },
  { from: "إحالة_للجنة_المراجعة", to: "تحرير_المذكرة", allowedRoles: ["branch_manager", "cases_review_head"] },
  { from: "الأخذ_بالملاحظات", to: "تحرير_المذكرة", allowedRoles: ["branch_manager"] },
  { from: "تم_الرفع_للدائرة", to: "الأخذ_بالملاحظات", allowedRoles: ["branch_manager"] },
];

const ALLOWED_CONSULTATION_TRANSITIONS: StageTransitionRule[] = [
  // Forward transitions
  { from: "استلام", to: "دراسة", allowedRoles: ["admin_support", "branch_manager"] },
  { from: "دراسة", to: "إعداد_الرد", allowedRoles: ["department_head", "branch_manager"] },
  { from: "إعداد_الرد", to: "لجنة_المراجعة", allowedRoles: ["employee", "department_head", "branch_manager"] },
  { from: "لجنة_المراجعة", to: "جاهز", allowedRoles: ["consultations_review_head", "branch_manager"] },
  { from: "لجنة_المراجعة", to: "تعديلات", allowedRoles: ["consultations_review_head", "branch_manager"] },
  { from: "تعديلات", to: "لجنة_المراجعة", allowedRoles: ["employee", "department_head", "branch_manager"] },
  { from: "جاهز", to: "مسلّم", allowedRoles: ["admin_support", "department_head", "branch_manager"] },
  { from: "مسلّم", to: "مغلق", allowedRoles: ["admin_support", "branch_manager"] },
  // Backward transitions
  { from: "دراسة", to: "استلام", allowedRoles: ["branch_manager"] },
  { from: "إعداد_الرد", to: "دراسة", allowedRoles: ["branch_manager", "department_head"] },
  { from: "لجنة_المراجعة", to: "إعداد_الرد", allowedRoles: ["branch_manager", "consultations_review_head"] },
  { from: "جاهز", to: "تعديلات", allowedRoles: ["branch_manager"] },
];

// Legacy stage name mapping
const LEGACY_CASE_STAGE_MAP: Record<string, string> = {
  "رفع_للدائرة": "تم_الرفع_للدائرة",
};

function validateStageTransition(
  currentStage: string,
  targetStage: string,
  userRole: string,
  entityType: "case" | "consultation"
): { allowed: boolean; reason?: string } {
  const normalizedCurrent = entityType === "case"
    ? (LEGACY_CASE_STAGE_MAP[currentStage] || currentStage)
    : currentStage;

  if (normalizedCurrent === targetStage) {
    return { allowed: false, reason: "العنصر في نفس المرحلة المطلوبة" };
  }

  const rules = entityType === "case" ? ALLOWED_CASE_TRANSITIONS : ALLOWED_CONSULTATION_TRANSITIONS;
  const rule = rules.find(r => r.from === normalizedCurrent && r.to === targetStage);

  if (!rule) {
    return { allowed: false, reason: `لا يمكن الانتقال من "${normalizedCurrent}" إلى "${targetStage}"` };
  }

  if (!rule.allowedRoles.includes(userRole)) {
    return { allowed: false, reason: "ليس لديك صلاحية لتنفيذ هذا الانتقال" };
  }

  return { allowed: true };
}

async function getActiveMemoCount(caseId: string): Promise<number> {
  const memos = await storage.getMemosByCase(caseId);
  return memos.filter(m => !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status)).length;
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

      const isValid = await comparePassword(data.password, user.password);
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
      const isValid = await comparePassword(currentPassword, dbUser.password);
      if (!isValid) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
      const validation = validatePassword(newPassword);
      if (!validation.valid) return res.status(400).json({ error: validation.message });
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashed, mustChangePassword: false } as any);
      const newToken = generateToken(user.id, user.role, user.departmentId);
      const csrfToken = generateCsrfToken(user.id);
      res.json({ success: true, token: newToken, csrfToken });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تغيير كلمة المرور" });
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

      const dependencies: string[] = [];
      const allCases = await storage.getAllCases();
      const assignedCases = allCases.filter(c =>
        c.primaryLawyerId === userId ||
        c.responsibleLawyerId === userId ||
        (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(userId))
      );
      if (assignedCases.length > 0) {
        dependencies.push(`${assignedCases.length} قضية مسندة`);
      }

      const allConsultations = await storage.getAllConsultations();
      const assignedConsultations = allConsultations.filter(c => c.assignedTo === userId);
      if (assignedConsultations.length > 0) {
        dependencies.push(`${assignedConsultations.length} استشارة مسندة`);
      }

      const allMemos = await storage.getAllMemos();
      const activeMemos = allMemos.filter(m =>
        m.assignedTo === userId && !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status)
      );
      if (activeMemos.length > 0) {
        dependencies.push(`${activeMemos.length} مذكرة نشطة`);
      }

      // Check if user is a department head
      const allDepartments = await storage.getAllDepartments();
      const headOfDepartments = allDepartments.filter(d => d.headId === userId);
      if (headOfDepartments.length > 0) {
        dependencies.push(`رئيس ${headOfDepartments.length} قسم`);
      }

      // Check active delegations
      const allDelegations = await storage.getAllDelegations();
      const activeDelegations = allDelegations.filter(d =>
        (d.fromUserId === userId || d.toUserId === userId) && d.status === "نشط"
      );
      if (activeDelegations.length > 0) {
        dependencies.push(`${activeDelegations.length} تفويض نشط`);
      }

      // Check open support tickets
      const allTickets = await storage.getAllSupportTickets();
      const openTickets = allTickets.filter(t =>
        t.assignedTo === userId && t.status !== "مغلقة"
      );
      if (openTickets.length > 0) {
        dependencies.push(`${openTickets.length} تذكرة دعم مفتوحة`);
      }

      // Check dependencies before deletion
      if (dependencies.length > 0) {
        if (req.query.force === "true" && currentUser.role === "branch_manager") {
          await storage.updateUser(userId, { isActive: false } as any);
          return res.json({ success: true, message: "تم تعطيل الحساب بدلاً من الحذف بسبب وجود بيانات مرتبطة" });
        }
        return res.status(400).json({
          error: "لا يمكن حذف المستخدم لوجود بيانات مرتبطة",
          dependencies,
          hint: "يمكنك إضافة ?force=true لتعطيل الحساب بدلاً من الحذف"
        });
      }

      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
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

      if (["branch_manager", "admin_support", "cases_review_head", "consultations_review_head"].includes(role)) {
        return res.json(allCases);
      }

      if (role === "department_head") {
        const filtered = allCases.filter((c: any) => c.departmentId === departmentId);
        return res.json(filtered);
      }

      if (role === "employee") {
        const filtered = allCases.filter((c: any) =>
          (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(userId)) ||
          c.primaryLawyerId === userId ||
          c.responsibleLawyerId === userId
        );
        return res.json(filtered);
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
      res.json(caseItem);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضية" });
    }
  });

  app.post("/api/cases", requireAuth, async (req, res) => {
    try {
      const validatedData = insertCaseSchema.parse(req.body);
      const createdBy = req.body.createdBy || "unknown";
      const newCase = await storage.createCase(validatedData as any, createdBy);

      const autoCreated: any[] = [];
      const classification = validatedData.caseClassification || "مدعي_قضية_جديدة";

      if (classification === CaseClassification.DEFENDANT) {
        const deadlineStr = validatedData.responseDeadline || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        try {
          const memo = await storage.createMemo({
            caseId: newCase.id,
            memoType: MemoType.RESPONSE,
            title: `مذكرة جوابية - ${newCase.caseNumber}`,
            description: `مذكرة جوابية تلقائية لقضية مدعى عليه - ${newCase.caseNumber}`,
            priority: "عاجل",
            assignedTo: createdBy,
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

        if (req.body.nextHearingDate && req.body.nextHearingDate.trim() && req.body.nextHearingTime && req.body.nextHearingTime.trim()) {
          try {
            const hearing = await storage.createHearing({
              caseId: newCase.id,
              hearingDate: req.body.nextHearingDate,
              hearingTime: req.body.nextHearingTime,
              courtName: (validatedData.courtName || "المحكمة العامة") as any,
              status: "قادمة",
            });
            autoCreated.push({ type: "hearing", id: hearing.id });
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
      res.status(500).json({ error: "حدث خطأ في إنشاء القضية" });
    }
  });

  app.patch("/api/cases/:id", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getCaseById(String(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const user = (req as any).user;

      // Validate stage transition if changing stage
      if (req.body.currentStage && req.body.currentStage !== existing.currentStage) {
        const stageCheck = validateStageTransition(existing.currentStage, req.body.currentStage, user.role, "case");
        if (!stageCheck.allowed) {
          return res.status(400).json({ error: stageCheck.reason });
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

      const updated = await storage.updateCase(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      if (user && existing) {
        try {
          if (req.body.currentStage && req.body.currentStage !== existing.currentStage) {
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
        } catch (e) {
          console.error("Error cleaning up related entities on case close:", e);
        }
      }
      res.json(updated);
    } catch (error) {
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
      const updated = await storage.updateClient(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "العميل غير موجود" });
      }
      res.json(updated);
    } catch (error) {
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
        const filtered = allConsultations.filter((c: any) => c.assignedTo === userId);
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
      const existing = await storage.getConsultationById(String(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      const user = (req as any).user;

      // Validate stage transition if changing status
      if (req.body.status && req.body.status !== existing.status) {
        const stageCheck = validateStageTransition(existing.status, req.body.status, user.role, "consultation");
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
      const newHearing = await storage.createHearing(validatedData);
      const user = (req as any).user;
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
      res.status(201).json(newHearing);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء الجلسة" });
    }
  });

  app.patch("/api/hearings/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateHearing(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الجلسة" });
    }
  });

  app.delete("/api/hearings/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
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
        status: data.result === HearingResult.POSTPONEMENT ? HearingStatus.POSTPONED : HearingStatus.COMPLETED,
      };

      if (data.result === HearingResult.JUDGMENT) {
        updateData.judgmentSide = data.judgmentSide || null;
        updateData.judgmentFinal = data.judgmentFinal ?? null;
        updateData.objectionFeasible = data.objectionFeasible ?? null;
        updateData.objectionDeadline = data.objectionDeadline || null;
        if (!data.judgmentFinal && data.judgmentSide === "ضدنا" && data.objectionFeasible) {
          updateData.objectionStatus = "بانتظار_القرار";
        }
      }

      if (data.result === HearingResult.POSTPONEMENT) {
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

      if (effectiveCaseId) {
        const caseUpdate: any = {
          lastHearingResult: data.result,
          lastHearingDate: hearing.hearingDate,
        };
        if (data.result === HearingResult.POSTPONEMENT && data.nextHearingDate) {
          caseUpdate.nextHearingDate = data.nextHearingDate;
        }
        await storage.updateCase(effectiveCaseId, caseUpdate);
      }

      if (data.result === HearingResult.POSTPONEMENT && data.nextHearingDate) {
        const newHearing = await storage.createHearing({
          caseId: effectiveCaseId,
          hearingDate: data.nextHearingDate,
          hearingTime: data.nextHearingTime || hearing.hearingTime,
          courtName: hearing.courtName,
          courtNameOther: hearing.courtNameOther,
          courtRoom: hearing.courtRoom,
          status: HearingStatus.UPCOMING,
          notes: `جلسة مؤجلة من ${hearing.hearingDate}`,
        } as any);
        createdTasks.push({ type: "new_hearing", id: newHearing.id, description: "تم إنشاء جلسة جديدة تلقائياً" });

        if (data.responseRequired && effectiveCaseId) {
          const dueDate = data.nextHearingDate;
          const task = await storage.createFieldTask({
            title: `إعداد رد للجلسة القادمة - ${effectiveCaseId}`,
            description: `مطلوب إعداد رد قبل الجلسة القادمة بتاريخ ${data.nextHearingDate}`,
            taskType: "متابعة_محكمة",
            caseId: effectiveCaseId,
            assignedTo: data.userId || "admin",
            priority: "عالي",
            dueDate,
          } as any, "system");
          createdTasks.push({ type: "prepare_response", id: task.id, description: "مهمة إعداد الرد" });

          const deadlineDate = new Date(data.nextHearingDate);
          deadlineDate.setDate(deadlineDate.getDate() - 3);
          const relatedCase = effectiveCaseId ? await storage.getCaseById(effectiveCaseId) : null;
          const memoAssignee = relatedCase?.primaryLawyerId || relatedCase?.responsibleLawyerId || data.userId || "1";
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

      if (data.result === HearingResult.JUDGMENT && effectiveCaseId) {
        const contactTask = await storage.createFieldTask({
          title: `إبلاغ العميل بنتيجة الحكم - ${effectiveCaseId}`,
          description: `صدر حكم ${data.judgmentSide || ""} - يرجى إبلاغ العميل بالتفاصيل`,
          taskType: "زيارة_عميل",
          caseId: effectiveCaseId,
          assignedTo: data.userId || "admin",
          priority: "عاجل",
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        } as any, "system");
        createdTasks.push({ type: "contact_client", id: contactTask.id, description: "مهمة إبلاغ العميل" });

        if (!data.judgmentFinal && data.judgmentSide === "ضدنا" && data.objectionFeasible) {
          const objectionTask = await storage.createFieldTask({
            title: `تقديم اعتراض على الحكم - ${effectiveCaseId}`,
            description: `مهلة الاعتراض: ${data.objectionDeadline || "غير محددة"}`,
            taskType: "متابعة_محكمة",
            caseId: effectiveCaseId,
            assignedTo: data.userId || "admin",
            priority: "عاجل",
            dueDate: data.objectionDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          } as any, "system");
          createdTasks.push({ type: "file_objection", id: objectionTask.id, description: "مهمة تقديم اعتراض" });

          const objDeadline = data.objectionDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          const objCase = effectiveCaseId ? await storage.getCaseById(effectiveCaseId) : null;
          const objAssignee = objCase?.primaryLawyerId || objCase?.responsibleLawyerId || data.userId || "1";
          const memo = await storage.createMemo({
            caseId: effectiveCaseId,
            hearingId: hearingId,
            memoType: MemoType.OBJECTION,
            title: `لائحة اعتراضية - حكم ${hearing.hearingDate}`,
            description: `لائحة اعتراضية على الحكم الصادر بتاريخ ${hearing.hearingDate}. مهلة الاعتراض: ${objDeadline}`,
            priority: "عاجل",
            assignedTo: objAssignee,
            createdBy: "system",
            deadline: objDeadline,
            isAutoGenerated: true,
            autoGenerateReason: "حكم_ضدنا_قابل_للاعتراض",
          });
          createdMemos.push({ type: "objection_memo", id: memo.id, description: "لائحة اعتراضية تلقائية" });

          const activeCount = await getActiveMemoCount(effectiveCaseId);
          await storage.updateCase(effectiveCaseId, { activeMemoCount: activeCount } as any);
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
      const createdBy = req.body.createdBy || "unknown";
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
      // Validate assignedTo user is active
      if (validatedData.assignedTo) {
        const { valid, inactiveUsers } = await validateAssignedUsersActive([validatedData.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "المحامي المكلف غير نشط أو غير موجود" });
        }
      }
      const memo = await storage.createMemo({
        ...validatedData,
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
      // Validate assignedTo user is active if being changed
      if (updateData.assignedTo) {
        const { valid } = await validateAssignedUsersActive([updateData.assignedTo]);
        if (!valid) {
          return res.status(400).json({ error: "المحامي المكلف غير نشط أو غير موجود" });
        }
      }

      if (updateData.status === MemoStatus.APPROVED || updateData.status === MemoStatus.REVISION_REQUIRED) {
        if (!canReviewMemos(user.role)) {
          return res.status(403).json({ error: "ليس لديك صلاحية لمراجعة المذكرات" });
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
      const notifications = await storage.getAllNotifications();
      res.json(notifications);
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
      res.status(201).json(newNotification);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء الإشعار" });
    }
  });

  app.patch("/api/notifications/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateNotification(String(req.params.id), req.body);
      if (!updated) {
        return res.status(404).json({ error: "الإشعار غير موجود" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الإشعار" });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, requireRole("branch_manager"), async (req, res) => {
    try {
      await storage.deleteNotification(String(req.params.id));
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
      const comments = Array.isArray(ticket.comments) ? [...(ticket.comments as any[])] : [];
      comments.push({
        id: randomUUID(),
        userId: reqUser.id,
        userName,
        userRole,
        message,
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
      const { rating, ratingComment } = req.body;
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

  app.get("/api/stats/lawyer-performance", requireAuth, async (req: AuthRequest, res) => {
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
  });

  // ==================== Case Activity Log ====================

  app.get("/api/cases/:id/activity", requireAuth, async (req: AuthRequest, res) => {
    const activities = await storage.getCaseActivities(String(req.params.id));
    res.json(activities);
  });

  // ==================== Case Notes ====================

  app.get("/api/cases/:id/notes", requireAuth, async (req: AuthRequest, res) => {
    const notes = await storage.getCaseNotes(String(req.params.id));
    res.json(notes);
  });

  app.post("/api/cases/:id/notes", requireAuth, async (req: AuthRequest, res) => {
    const user = req.user!;
    const note = await storage.createCaseNote({
      ...req.body,
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
  });

  app.patch("/api/case-notes/:id", requireAuth, async (req: AuthRequest, res) => {
    const note = await storage.updateCaseNote(String(req.params.id), { ...req.body, editedAt: new Date() });
    if (!note) return res.status(404).json({ message: "ملاحظة غير موجودة" });
    res.json(note);
  });

  app.delete("/api/case-notes/:id", requireAuth, async (req: AuthRequest, res) => {
    await storage.deleteCaseNote(String(req.params.id));
    res.json({ success: true });
  });

  // ==================== Legal Deadlines ====================

  app.get("/api/legal-deadlines", requireAuth, async (req: AuthRequest, res) => {
    const caseId = req.query.caseId as string;
    if (caseId) {
      const deadlines = await storage.getLegalDeadlinesByCase(caseId);
      res.json(deadlines);
    } else {
      const deadlines = await storage.getAllLegalDeadlines();
      res.json(deadlines);
    }
  });

  app.post("/api/legal-deadlines", requireAuth, async (req: AuthRequest, res) => {
    const deadline = await storage.createLegalDeadline(req.body);
    if (req.body.caseId) {
      const user = req.user!;
      await storage.logCaseActivity({
        caseId: req.body.caseId,
        userId: user.id,
        userName: user.name,
        actionType: "case_updated",
        title: `تم إضافة موعد نظامي: ${req.body.title}`,
      });
    }
    res.json(deadline);
  });

  app.patch("/api/legal-deadlines/:id", requireAuth, async (req: AuthRequest, res) => {
    const deadline = await storage.updateLegalDeadline(String(req.params.id), req.body);
    if (!deadline) return res.status(404).json({ message: "موعد غير موجود" });
    res.json(deadline);
  });

  app.delete("/api/legal-deadlines/:id", requireAuth, async (req: AuthRequest, res) => {
    await storage.deleteLegalDeadline(String(req.params.id));
    res.json({ success: true });
  });

  // ==================== Delegations ====================

  app.get("/api/delegations", requireAuth, async (req: AuthRequest, res) => {
    const delegations = await storage.getAllDelegations();
    res.json(delegations);
  });

  app.post("/api/delegations", requireAuth, async (req: AuthRequest, res) => {
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
  });

  app.patch("/api/delegations/:id", requireAuth, async (req: AuthRequest, res) => {
    const delegation = await storage.updateDelegation(String(req.params.id), req.body);
    if (!delegation) return res.status(404).json({ message: "تفويض غير موجود" });
    res.json(delegation);
  });

  app.post("/api/delegations/:id/approve", requireAuth, async (req: AuthRequest, res) => {
    const user = req.user!;
    // Check the delegation exists first and validate users are active
    const existingDelegation = await storage.getDelegation(String(req.params.id));
    if (!existingDelegation) return res.status(404).json({ message: "تفويض غير موجود" });

    // Validate both fromUser and toUser are active before approving
    const { valid, inactiveUsers } = await validateAssignedUsersActive([existingDelegation.fromUserId, existingDelegation.toUserId]);
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

  app.get("/api/stats/court-analytics", requireAuth, async (req: AuthRequest, res) => {
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
