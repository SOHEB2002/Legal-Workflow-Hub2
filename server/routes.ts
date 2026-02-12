import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  loginSchema, 
  insertUserSchema, 
  insertClientSchema, 
  insertCaseSchema, 
  insertConsultationSchema, 
  insertHearingSchema, 
  insertFieldTaskSchema,
  insertAttachmentSchema,
  hearingResultSchema,
  hearingReportSchema,
  HearingStatus,
  HearingResult,
} from "@shared/schema";
import { z } from "zod";
import { comparePassword, hashPassword, generateToken } from "./auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Initialize default data on startup
  await storage.initializeDefaultData();

  // ==================== Auth ====================

  app.post("/api/auth/login", async (req, res) => {
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
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, token });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ==================== Users ====================

  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(u => {
        const { password, ...rest } = u;
        return rest;
      }));
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المستخدمين" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المستخدم" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const hashedPassword = await hashPassword(validatedData.password);
      const newUser = await storage.createUser({ ...validatedData, password: hashedPassword });
      const { password, ...userWithoutPassword } = newUser;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء المستخدم" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const updated = await storage.updateUser(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "المستخدم غير موجود" });
      }
      const { password, ...userWithoutPassword } = updated;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث المستخدم" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف المستخدم" });
    }
  });

  // ==================== Cases ====================

  app.get("/api/cases", async (req, res) => {
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

  app.get("/api/cases/:id", async (req, res) => {
    try {
      const caseItem = await storage.getCaseById(req.params.id);
      if (!caseItem) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json(caseItem);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القضية" });
    }
  });

  app.post("/api/cases", async (req, res) => {
    try {
      const validatedData = insertCaseSchema.parse(req.body);
      const createdBy = req.body.createdBy || "unknown";
      const newCase = await storage.createCase(validatedData, createdBy);
      res.status(201).json(newCase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء القضية" });
    }
  });

  app.patch("/api/cases/:id", async (req, res) => {
    try {
      const updated = await storage.updateCase(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث القضية" });
    }
  });

  app.delete("/api/cases/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCase(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف القضية" });
    }
  });

  // ==================== Clients ====================

  app.get("/api/clients", async (req, res) => {
    try {
      const clients = await storage.getAllClients();
      res.json(clients);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب العملاء" });
    }
  });

  app.get("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.getClientById(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "العميل غير موجود" });
      }
      res.json(client);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب العميل" });
    }
  });

  app.post("/api/clients", async (req, res) => {
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

  app.patch("/api/clients/:id", async (req, res) => {
    try {
      const updated = await storage.updateClient(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "العميل غير موجود" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث العميل" });
    }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    try {
      await storage.deleteClient(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف العميل" });
    }
  });

  // ==================== Consultations ====================

  app.get("/api/consultations", async (req, res) => {
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

  app.get("/api/consultations/:id", async (req, res) => {
    try {
      const consultation = await storage.getConsultationById(req.params.id);
      if (!consultation) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      res.json(consultation);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الاستشارة" });
    }
  });

  app.post("/api/consultations", async (req, res) => {
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

  app.patch("/api/consultations/:id", async (req, res) => {
    try {
      const updated = await storage.updateConsultation(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "الاستشارة غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الاستشارة" });
    }
  });

  app.delete("/api/consultations/:id", async (req, res) => {
    try {
      await storage.deleteConsultation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الاستشارة" });
    }
  });

  // ==================== Hearings ====================

  app.get("/api/hearings", async (req, res) => {
    try {
      const hearings = await storage.getAllHearings();
      res.json(hearings);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الجلسات" });
    }
  });

  app.get("/api/hearings/:id", async (req, res) => {
    try {
      const hearing = await storage.getHearingById(req.params.id);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      res.json(hearing);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الجلسة" });
    }
  });

  app.post("/api/hearings", async (req, res) => {
    try {
      const validatedData = insertHearingSchema.parse(req.body);
      const newHearing = await storage.createHearing(validatedData);
      res.status(201).json(newHearing);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "حدث خطأ في إنشاء الجلسة" });
    }
  });

  app.patch("/api/hearings/:id", async (req, res) => {
    try {
      const updated = await storage.updateHearing(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الجلسة" });
    }
  });

  app.delete("/api/hearings/:id", async (req, res) => {
    try {
      await storage.deleteHearing(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الجلسة" });
    }
  });

  // ==================== Hearing Workflow ====================

  app.post("/api/hearings/:id/result", async (req, res) => {
    try {
      const hearingId = req.params.id;
      const hearing = await storage.getHearingById(hearingId);
      if (!hearing) {
        return res.status(404).json({ error: "الجلسة غير موجودة" });
      }
      if (hearing.status !== HearingStatus.UPCOMING) {
        return res.status(400).json({ error: "لا يمكن تسجيل نتيجة لجلسة غير قادمة" });
      }

      const data = hearingResultSchema.parse(req.body);
      
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

      const createdTasks: any[] = [];

      if (data.result === HearingResult.POSTPONEMENT && data.nextHearingDate) {
        const newHearing = await storage.createHearing({
          caseId: hearing.caseId,
          hearingDate: data.nextHearingDate,
          hearingTime: data.nextHearingTime || hearing.hearingTime,
          courtName: hearing.courtName,
          courtNameOther: hearing.courtNameOther,
          courtRoom: hearing.courtRoom,
          status: HearingStatus.UPCOMING,
          notes: `جلسة مؤجلة من ${hearing.hearingDate}`,
        } as any);
        createdTasks.push({ type: "new_hearing", id: newHearing.id, description: "تم إنشاء جلسة جديدة تلقائياً" });

        if (data.responseRequired) {
          const dueDate = data.nextHearingDate;
          const task = await storage.createFieldTask({
            title: `إعداد رد للجلسة القادمة - ${hearing.caseId}`,
            description: `مطلوب إعداد رد قبل الجلسة القادمة بتاريخ ${data.nextHearingDate}`,
            taskType: "متابعة_محكمة",
            caseId: hearing.caseId,
            assignedTo: data.userId || "admin",
            priority: "عالي",
            dueDate,
          } as any, "system");
          createdTasks.push({ type: "prepare_response", id: task.id, description: "مهمة إعداد الرد" });
        }
      }

      if (data.result === HearingResult.JUDGMENT) {
        const contactTask = await storage.createFieldTask({
          title: `إبلاغ العميل بنتيجة الحكم - ${hearing.caseId}`,
          description: `صدر حكم ${data.judgmentSide || ""} - يرجى إبلاغ العميل بالتفاصيل`,
          taskType: "زيارة_عميل",
          caseId: hearing.caseId,
          assignedTo: data.userId || "admin",
          priority: "عاجل",
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        } as any, "system");
        createdTasks.push({ type: "contact_client", id: contactTask.id, description: "مهمة إبلاغ العميل" });

        if (!data.judgmentFinal && data.judgmentSide === "ضدنا" && data.objectionFeasible) {
          const objectionTask = await storage.createFieldTask({
            title: `تقديم اعتراض على الحكم - ${hearing.caseId}`,
            description: `مهلة الاعتراض: ${data.objectionDeadline || "غير محددة"}`,
            taskType: "متابعة_محكمة",
            caseId: hearing.caseId,
            assignedTo: data.userId || "admin",
            priority: "عاجل",
            dueDate: data.objectionDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          } as any, "system");
          createdTasks.push({ type: "file_objection", id: objectionTask.id, description: "مهمة تقديم اعتراض" });
        }
      }

      if (createdTasks.length > 0) {
        await storage.updateHearing(hearingId, { adminTasksCreated: true } as any);
      }

      res.json({ hearing: updatedHearing, createdTasks });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error submitting hearing result:", error);
      res.status(500).json({ error: "حدث خطأ في تسجيل نتيجة الجلسة" });
    }
  });

  app.post("/api/hearings/:id/report", async (req, res) => {
    try {
      const hearingId = req.params.id;
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

  app.post("/api/hearings/:id/close", async (req, res) => {
    try {
      const hearingId = req.params.id;
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

  app.get("/api/field-tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllFieldTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المهام الميدانية" });
    }
  });

  app.get("/api/field-tasks/:id", async (req, res) => {
    try {
      const task = await storage.getFieldTaskById(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "المهمة غير موجودة" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المهمة" });
    }
  });

  app.post("/api/field-tasks", async (req, res) => {
    try {
      const validatedData = insertFieldTaskSchema.parse(req.body);
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

  app.patch("/api/field-tasks/:id", async (req, res) => {
    try {
      const updated = await storage.updateFieldTask(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "المهمة غير موجودة" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث المهمة" });
    }
  });

  app.delete("/api/field-tasks/:id", async (req, res) => {
    try {
      await storage.deleteFieldTask(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف المهمة" });
    }
  });

  // ==================== Contact Logs ====================

  app.get("/api/contact-logs", async (req, res) => {
    try {
      const logs = await storage.getAllContactLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب سجلات التواصل" });
    }
  });

  app.get("/api/contact-logs/client/:clientId", async (req, res) => {
    try {
      const logs = await storage.getContactLogsByClient(req.params.clientId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب سجلات التواصل" });
    }
  });

  app.post("/api/contact-logs", async (req, res) => {
    try {
      const createdBy = req.body.createdBy || "unknown";
      const newLog = await storage.createContactLog(req.body, createdBy);
      res.status(201).json(newLog);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء سجل التواصل" });
    }
  });

  app.patch("/api/contact-logs/:id", async (req, res) => {
    try {
      const updated = await storage.updateContactLog(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "سجل التواصل غير موجود" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث سجل التواصل" });
    }
  });

  app.delete("/api/contact-logs/:id", async (req, res) => {
    try {
      await storage.deleteContactLog(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف سجل التواصل" });
    }
  });

  // ==================== Notifications ====================

  app.get("/api/notifications", async (req, res) => {
    try {
      const notifications = await storage.getAllNotifications();
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الإشعارات" });
    }
  });

  app.get("/api/notifications/user/:userId", async (req, res) => {
    try {
      const notifications = await storage.getNotificationsByRecipient(req.params.userId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الإشعارات" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const newNotification = await storage.createNotification(req.body);
      res.status(201).json(newNotification);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في إنشاء الإشعار" });
    }
  });

  app.patch("/api/notifications/:id", async (req, res) => {
    try {
      const updated = await storage.updateNotification(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "الإشعار غير موجود" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في تحديث الإشعار" });
    }
  });

  app.delete("/api/notifications/:id", async (req, res) => {
    try {
      await storage.deleteNotification(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف الإشعار" });
    }
  });

  app.post("/api/notifications/mark-all-read", async (req, res) => {
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

  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getAllDepartments();
      res.json(departments);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب الأقسام" });
    }
  });

  app.get("/api/departments/:id", async (req, res) => {
    try {
      const department = await storage.getDepartmentById(req.params.id);
      if (!department) {
        return res.status(404).json({ error: "القسم غير موجود" });
      }
      res.json(department);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب القسم" });
    }
  });

  // ==================== Attachments ====================

  app.post("/api/attachments", async (req, res) => {
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

  app.get("/api/attachments/:entityType/:entityId", async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const list = await storage.getAttachmentsByEntity(entityType, entityId);
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في جلب المرفقات" });
    }
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteAttachment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "المرفق غير موجود" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "حدث خطأ في حذف المرفق" });
    }
  });

  return httpServer;
}
