import cron from "node-cron";
import { storage } from "./storage";
import { calculateSmartPriority } from "./routes";

export function startScheduler() {
  console.log("Scheduler started - automated hearing/memo/deadline/delegation checks active");

  cron.schedule("0 * * * *", async () => {
    console.log("Running hourly hearing checks...");
    await checkUnupdatedHearings();
    await checkUpcomingHearingReminders();
  });

  cron.schedule("0 */6 * * *", async () => {
    console.log("Running memo deadline checks...");
    await checkMemoDeadlines();
  });

  cron.schedule("0 8 * * *", async () => {
    console.log("Running daily legal deadline checks...");
    await checkLegalDeadlines();
    await checkDelegationExpiry();
    await checkContactFollowUps();
    await recalculateCasePriorities();
    await checkStruckOffExpiry();
  });

  cron.schedule("0 7 * * 0", async () => {
    console.log("Running weekly report generation...");
    await generateWeeklyReport();
  });

  cron.schedule("0 7 1 * *", async () => {
    console.log("Running monthly report generation...");
    await generateMonthlyReport();
  });

  cron.schedule("0 2 * * *", async () => {
    console.log("Running auto-archive check...");
    await autoArchiveClosedCases();
  });
}

function parseHearingDateTime(dateStr: string, timeStr: string | null): Date | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    if (timeStr) {
      const timeParts = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (timeParts) {
        date.setHours(parseInt(timeParts[1]), parseInt(timeParts[2]));
      }
    } else {
      date.setHours(9, 0, 0, 0);
    }
    return date;
  } catch {
    return null;
  }
}

// Synchronous helper — accepts a pre-fetched array so callers can batch
// the getAllNotifications() call once per scheduler function instead of
// once per loop iteration (was causing hundreds of full-table scans).
function notificationExists(
  cached: any[],
  relatedId: string,
  titlePattern: string,
  recipientId?: string
): boolean {
  return cached.some(
    (n) =>
      n.relatedId === relatedId &&
      n.title.includes(titlePattern) &&
      (!recipientId || n.recipientId === recipientId)
  );
}

async function checkUnupdatedHearings() {
  try {
    // Pre-fetch shared data ONCE — prevents N+1 inside the loop
    const [allHearings, allUsers, allNotifications] = await Promise.all([
      storage.getAllHearings(),
      storage.getAllUsers(),
      storage.getAllNotifications(),
    ]);
    const now = new Date();

    for (const hearing of allHearings) {
      if (hearing.status !== "قادمة") continue;

      const hearingDateTime = parseHearingDateTime(hearing.hearingDate, hearing.hearingTime);
      if (!hearingDateTime) continue;

      const hoursSinceHearing = (now.getTime() - hearingDateTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceHearing >= 8) {
        if (!notificationExists(allNotifications, hearing.id, "جلسة لم تُحدَّث نتيجتها")) {
          await sendUnupdatedHearingAlert(hearing, allUsers, allNotifications);
        }
      }

      if (hoursSinceHearing >= 24) {
        if (!notificationExists(allNotifications, hearing.id, "جلسة متأخرة التحديث 24 ساعة")) {
          await sendEscalatedHearingAlert(hearing, allUsers);
        }
      }

      if (hoursSinceHearing >= 48) {
        if (!notificationExists(allNotifications, hearing.id, "جلسة متأخرة 48 ساعة")) {
          await sendFinalEscalationAlert(hearing, allUsers);
        }
      }
    }
  } catch (error) {
    console.error("Error checking unupdated hearings:", error);
  }
}

async function sendUnupdatedHearingAlert(hearing: any, allUsers: any[], allNotifications: any[]) {
  const caseInfo = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
  const caseLabel = caseInfo ? caseInfo.caseNumber : "غير محددة";

  const recipientIds: string[] = [];

  if (caseInfo?.responsibleLawyerId) {
    recipientIds.push(caseInfo.responsibleLawyerId);

    const lawyer = allUsers.find((u: any) => u.id === caseInfo.responsibleLawyerId);
    if (lawyer?.departmentId) {
      const deptHead = allUsers.find(
        (u: any) => u.departmentId === lawyer.departmentId && u.role === "department_head"
      );
      if (deptHead) recipientIds.push(deptHead.id);
    }
  }

  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter(
    (u) => u.role === "branch_manager" || u.role === "admin_support"
  );
  admins.forEach((a) => recipientIds.push(a.id));

  const uniqueRecipients = Array.from(new Set(recipientIds));
  for (const recipientId of uniqueRecipients) {
    await storage.createNotification({
      type: "hearing_update_overdue",
      title: "تنبيه عاجل: جلسة لم تُحدَّث نتيجتها",
      message: `الجلسة المتعلقة بالقضية رقم ${caseLabel} بتاريخ ${hearing.hearingDate} مضى عليها أكثر من 8 ساعات ولم يتم تحديث حالتها أو تسجيل نتيجتها. يرجى تحديث حالة الجلسة فوراً.`,
      priority: "urgent",
      status: "pending",
      senderId: "system",
      senderName: "النظام التلقائي",
      recipientId,
      relatedType: "hearing",
      relatedId: hearing.id,
      requiresResponse: true,
      autoEscalateAfterHours: 16,
    });
  }
}

async function sendEscalatedHearingAlert(hearing: any, allUsers: any[]) {
  const caseInfo = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
  const caseLabel = caseInfo ? caseInfo.caseNumber : "غير محددة";

  const branchManager = allUsers.find((u: any) => u.role === "branch_manager");

  if (branchManager) {
    await storage.createNotification({
      type: "hearing_update_overdue",
      title: "تصعيد: جلسة متأخرة التحديث 24 ساعة",
      message: `تصعيد: الجلسة المتعلقة بالقضية رقم ${caseLabel} مضى عليها 24 ساعة بدون تحديث. يرجى المتابعة مع المترافع.`,
      priority: "urgent",
      status: "pending",
      senderId: "system",
      senderName: "النظام التلقائي",
      recipientId: branchManager.id,
      relatedType: "hearing",
      relatedId: hearing.id,
      requiresResponse: true,
    });
  }
}

async function sendFinalEscalationAlert(hearing: any, allUsers: any[]) {
  const caseInfo = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
  const caseLabel = caseInfo ? caseInfo.caseNumber : "غير محددة";

  const topManagement = allUsers.filter(
    (u: any) => u.role === "branch_manager" || u.role === "cases_review_head"
  );

  for (const manager of topManagement) {
    await storage.createNotification({
      type: "hearing_update_overdue",
      title: "تصعيد نهائي: جلسة متأخرة 48 ساعة",
      message: `تصعيد نهائي: الجلسة المتعلقة بالقضية رقم ${caseLabel} لم تُحدَّث منذ 48 ساعة. هذا يؤثر على سير القضية ويتطلب تدخل إداري فوري.`,
      priority: "urgent",
      status: "pending",
      senderId: "system",
      senderName: "النظام التلقائي",
      recipientId: manager.id,
      relatedType: "hearing",
      relatedId: hearing.id,
      requiresResponse: true,
    });
  }
}

async function checkUpcomingHearingReminders() {
  try {
    // Pre-fetch once — prevents getCaseById N+1 and getAllNotifications N+1
    const [allHearings, allCases, allNotifications] = await Promise.all([
      storage.getAllHearings(),
      storage.getAllCases(),
      storage.getAllNotifications(),
    ]);
    const caseMap = new Map(allCases.map((c: any) => [c.id, c]));
    const now = new Date();

    for (const hearing of allHearings) {
      if (hearing.status !== "قادمة") continue;

      const hearingDateTime = parseHearingDateTime(hearing.hearingDate, hearing.hearingTime);
      if (!hearingDateTime) continue;

      const hoursUntilHearing = (hearingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilHearing > 0 && hoursUntilHearing <= 48 && !hearing.reminderSent24h) {
        const caseInfo = hearing.caseId ? caseMap.get(hearing.caseId) : null;
        const recipientId = caseInfo?.responsibleLawyerId;
        if (!recipientId) continue;
        const caseLabel = caseInfo ? caseInfo.caseNumber : "";

        const alreadySent48h = notificationExists(allNotifications, hearing.id, "تذكير: جلسة بعد", recipientId);

        if (hoursUntilHearing > 24 && !alreadySent48h) {
          await storage.createNotification({
            type: "hearing_reminder",
            title: "تذكير: جلسة بعد يومين",
            message: `تذكير: لديك جلسة في القضية رقم ${caseLabel} بتاريخ ${hearing.hearingDate} الساعة ${hearing.hearingTime || "غير محدد"}.`,
            priority: "high",
            status: "pending",
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId,
            relatedType: "hearing",
            relatedId: hearing.id,
          });
        }

        if (hoursUntilHearing <= 24) {
          await storage.createNotification({
            type: "hearing_reminder",
            title: "تذكير عاجل: جلسة غداً",
            message: `تذكير عاجل: لديك جلسة غداً في القضية رقم ${caseLabel} الساعة ${hearing.hearingTime || "غير محدد"}. تأكد من جاهزية جميع المستندات.`,
            priority: "urgent",
            status: "pending",
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId,
            relatedType: "hearing",
            relatedId: hearing.id,
          });
          await storage.updateHearing(hearing.id, { reminderSent24h: true } as any);
        }
      }
    }
  } catch (error) {
    console.error("Error checking hearing reminders:", error);
  }
}

async function checkMemoDeadlines() {
  try {
    const allMemos = await storage.getAllMemos();
    const now = new Date();

    for (const memo of allMemos) {
      if (["معتمدة", "مرفوعة", "ملغاة"].includes(memo.status)) continue;
      if (!memo.deadline) continue;

      const deadline = new Date(memo.deadline);
      if (isNaN(deadline.getTime())) continue;

      const daysUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      const recipientId = memo.assignedTo || memo.createdBy;
      if (!recipientId) continue;

      if (daysUntilDeadline > 2 && daysUntilDeadline <= 3 && !memo.reminderSent3Days) {
        await storage.createNotification({
          type: "task_reminder",
          title: "تنبيه: موعد تسليم مذكرة بعد 3 أيام",
          message: `المذكرة "${memo.title}" موعد تسليمها بعد 3 أيام (${memo.deadline}). يرجى الإسراع في إنجازها.`,
          priority: "high",
          status: "pending",
          senderId: "system",
          senderName: "النظام التلقائي",
          recipientId,
          relatedType: "memo",
          relatedId: memo.id,
        });
        await storage.updateMemo(memo.id, { reminderSent3Days: true } as any);
      }

      if (daysUntilDeadline > 0 && daysUntilDeadline <= 1 && !memo.reminderSent1Day) {
        await storage.createNotification({
          type: "task_reminder",
          title: "عاجل: موعد تسليم مذكرة غداً",
          message: `المذكرة "${memo.title}" موعد تسليمها غداً. يرجى إنهاؤها وتسليمها فوراً.`,
          priority: "urgent",
          status: "pending",
          senderId: "system",
          senderName: "النظام التلقائي",
          recipientId,
          relatedType: "memo",
          relatedId: memo.id,
        });
        await storage.updateMemo(memo.id, { reminderSent1Day: true } as any);
      }

      if (daysUntilDeadline < 0 && !memo.reminderSentOverdue) {
        const daysOverdue = Math.abs(Math.floor(daysUntilDeadline));
        await storage.createNotification({
          type: "task_reminder",
          title: `مذكرة متأخرة ${daysOverdue} يوم`,
          message: `المذكرة "${memo.title}" متأخرة عن موعد التسليم بـ ${daysOverdue} يوم. يرجى المتابعة فوراً.`,
          priority: "urgent",
          status: "pending",
          senderId: "system",
          senderName: "النظام التلقائي",
          recipientId,
          relatedType: "memo",
          relatedId: memo.id,
        });
        await storage.updateMemo(memo.id, { reminderSentOverdue: true } as any);
      }
    }
  } catch (error) {
    console.error("Error checking memo deadlines:", error);
  }
}

async function checkLegalDeadlines() {
  try {
    // Pre-fetch once — was calling getCaseById + getAllUsers per deadline item
    const [deadlines, allCases, allUsers, allNotifications] = await Promise.all([
      storage.getAllLegalDeadlines(),
      storage.getAllCases(),
      storage.getAllUsers(),
      storage.getAllNotifications(),
    ]);
    const caseMap = new Map(allCases.map((c: any) => [c.id, c]));
    const now = new Date();

    for (const deadline of deadlines) {
      if (deadline.status !== "نشط") continue;

      const deadlineDate = new Date(deadline.deadlineDate);
      if (isNaN(deadlineDate.getTime())) continue;

      const daysLeft = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      const caseInfo = deadline.caseId ? caseMap.get(deadline.caseId) : null;
      const recipientId = caseInfo?.responsibleLawyerId;
      if (!recipientId) continue;

      if (daysLeft > 6 && daysLeft <= 7) {
        if (!notificationExists(allNotifications, deadline.id, "موعد نظامي بعد 7 أيام", recipientId)) {
          await storage.createNotification({
            type: "legal_deadline_7_days",
            title: "تنبيه: موعد نظامي بعد 7 أيام",
            message: `الموعد النظامي "${deadline.title}" للقضية ${caseInfo?.caseNumber || ""} ينتهي بعد 7 أيام (${deadline.deadlineDate}).`,
            priority: "high",
            status: "pending",
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId,
            relatedType: "case",
            relatedId: deadline.caseId,
          });
        }
      }

      if (daysLeft > 2 && daysLeft <= 3) {
        if (!notificationExists(allNotifications, deadline.id, "موعد نظامي بعد 3 أيام", recipientId)) {
          await storage.createNotification({
            type: "legal_deadline_3_days",
            title: "عاجل: موعد نظامي بعد 3 أيام",
            message: `الموعد النظامي "${deadline.title}" للقضية ${caseInfo?.caseNumber || ""} ينتهي بعد 3 أيام (${deadline.deadlineDate}).`,
            priority: "urgent",
            status: "pending",
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId,
            relatedType: "case",
            relatedId: deadline.caseId,
          });
        }
      }

      if (daysLeft > 0 && daysLeft <= 1) {
        if (!notificationExists(allNotifications, deadline.id, "موعد نظامي غداً", recipientId)) {
          await storage.createNotification({
            type: "legal_deadline_1_day",
            title: "عاجل جداً: موعد نظامي غداً",
            message: `الموعد النظامي "${deadline.title}" للقضية ${caseInfo?.caseNumber || ""} ينتهي غداً!`,
            priority: "urgent",
            status: "pending",
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId,
            relatedType: "case",
            relatedId: deadline.caseId,
            requiresResponse: true,
          });
        }
      }

      if (daysLeft < 0) {
        if (!notificationExists(allNotifications, deadline.id, "موعد نظامي فائت", recipientId)) {
          await storage.updateLegalDeadline(deadline.id, { status: "فائت" });

          const recipients = [recipientId];
          if (caseInfo?.departmentId) {
            const deptHead = allUsers.find((u: any) => u.departmentId === caseInfo.departmentId && u.role === "department_head");
            if (deptHead) recipients.push(deptHead.id);
          }
          const branchManager = allUsers.find((u: any) => u.role === "branch_manager");
          if (branchManager) recipients.push(branchManager.id);

          for (const rid of Array.from(new Set(recipients))) {
            await storage.createNotification({
              type: "legal_deadline_overdue",
              title: "تنبيه خطير: موعد نظامي فائت",
              message: `الموعد النظامي "${deadline.title}" للقضية ${caseInfo?.caseNumber || ""} قد فات! يرجى اتخاذ إجراء فوري.`,
              priority: "urgent",
              status: "pending",
              senderId: "system",
              senderName: "النظام التلقائي",
              recipientId: rid,
              relatedType: "case",
              relatedId: deadline.caseId,
              requiresResponse: true,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error checking legal deadlines:", error);
  }
}

async function checkDelegationExpiry() {
  try {
    const delegations = await storage.getAllDelegations();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    for (const delegation of delegations) {
      if (delegation.status !== "نشط") continue;

      if (delegation.endDate && delegation.endDate < todayStr) {
        await storage.updateDelegation(delegation.id, { status: "منتهي" });

        const fromUser = await storage.getUser(delegation.fromUserId);
        const toUser = await storage.getUser(delegation.toUserId);

        if (fromUser) {
          await storage.createNotification({
            type: "delegation_expired",
            title: "انتهاء تفويض",
            message: `انتهت صلاحية تفويض قضاياك إلى ${toUser?.name || "محامي آخر"}. تم إرجاع جميع القضايا إليك.`,
            priority: "medium",
            status: "pending",
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId: fromUser.id,
          });
        }

        if (toUser) {
          await storage.createNotification({
            type: "delegation_expired",
            title: "انتهاء تفويض",
            message: `انتهت صلاحية تفويض قضايا ${fromUser?.name || "محامي آخر"} إليك.`,
            priority: "medium",
            status: "pending",
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId: toUser.id,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error checking delegation expiry:", error);
  }
}

async function checkContactFollowUps() {
  try {
    // Pre-fetch all data at once — was calling getContactLogsByClient() per client (N+1)
    const [allClients, allContactLogs, allNotifications] = await Promise.all([
      storage.getAllClients(),
      storage.getAllContactLogs(),
      storage.getAllNotifications(),
    ]);
    const clientMap = new Map(allClients.map((c: any) => [c.id, c]));
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    for (const log of allContactLogs) {
      if (!log.nextFollowUpDate || (log.followUpStatus as string) === "تمت_المتابعة") continue;
      if (log.nextFollowUpDate >= todayStr) continue;

      const client = clientMap.get(log.clientId);
      if (!notificationExists(allNotifications, log.id, "متابعة تواصل متأخرة", log.createdBy)) {
        await storage.createNotification({
          type: "contact_followup_overdue",
          title: "متابعة تواصل متأخرة",
          message: `متابعة العميل ${client?.individualName || client?.companyName || ""} متأخرة عن الموعد (${log.nextFollowUpDate}). يرجى المتابعة.`,
          priority: "high",
          status: "pending",
          senderId: "system",
          senderName: "النظام التلقائي",
          recipientId: log.createdBy,
          relatedType: "case" as any,
          relatedId: log.clientId,
        });
      }
    }
  } catch (error) {
    console.error("Error checking contact follow-ups:", error);
  }
}

async function generateWeeklyReport() {
  try {
    const allCases = await storage.getAllCases();
    const allHearings = await storage.getAllHearings();
    const allMemos = await storage.getAllMemos();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const newCases = allCases.filter(c => new Date(c.createdAt) >= weekAgo).length;
    const closedCases = allCases.filter(c => 
      (c.currentStage as string) === "مقفلة" && 
      new Date(c.updatedAt) >= weekAgo
    ).length;
    const completedHearings = allHearings.filter(h => h.status === "تمت" && h.updatedAt && new Date(h.updatedAt) >= weekAgo).length;
    const overdueMemos = allMemos.filter(m => 
      !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status) && 
      m.deadline && new Date(m.deadline) < now
    ).length;

    const allUsers = await storage.getAllUsers();
    const managers = allUsers.filter(u => 
      u.role === "branch_manager" || u.role === "cases_review_head" || u.role === "department_head"
    );

    for (const manager of managers) {
      await storage.createNotification({
        type: "weekly_report",
        title: "التقرير الأسبوعي",
        message: `ملخص الأسبوع: ${newCases} قضية جديدة، ${closedCases} قضية مغلقة، ${completedHearings} جلسة منجزة، ${overdueMemos} مذكرة متأخرة.`,
        priority: "low",
        status: "pending",
        senderId: "system",
        senderName: "النظام التلقائي",
        recipientId: manager.id,
      });
    }
  } catch (error) {
    console.error("Error generating weekly report:", error);
  }
}

async function generateMonthlyReport() {
  try {
    const allCases = await storage.getAllCases();
    const allHearings = await storage.getAllHearings();
    const now = new Date();
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const newCases = allCases.filter(c => new Date(c.createdAt) >= monthAgo).length;
    const closedCases = allCases.filter(c => 
      (c.currentStage as string) === "مقفلة" && 
      new Date(c.updatedAt) >= monthAgo
    ).length;
    const totalActive = allCases.filter(c => (c.currentStage as string) !== "مقفلة" && !c.isArchived).length;

    const judgments = allHearings.filter(h => h.result === "حكم" && h.updatedAt && new Date(h.updatedAt) >= monthAgo);
    const won = judgments.filter(h => h.judgmentSide === "لصالحنا").length;
    const lost = judgments.filter(h => h.judgmentSide === "ضدنا").length;

    const allUsers = await storage.getAllUsers();
    const managers = allUsers.filter(u => u.role === "branch_manager" || u.role === "cases_review_head");

    for (const manager of managers) {
      await storage.createNotification({
        type: "monthly_report",
        title: "التقرير الشهري",
        message: `ملخص الشهر: ${newCases} قضية جديدة، ${closedCases} مغلقة، ${totalActive} نشطة حالياً. الأحكام: ${won} لصالحنا، ${lost} ضدنا.`,
        priority: "low",
        status: "pending",
        senderId: "system",
        senderName: "النظام التلقائي",
        recipientId: manager.id,
      });
    }
  } catch (error) {
    console.error("Error generating monthly report:", error);
  }
}

async function autoArchiveClosedCases() {
  try {
    const allCases = await storage.getAllCases();
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    for (const caseItem of allCases) {
      if (caseItem.isArchived) continue;
      if ((caseItem.currentStage as string) !== "مقفلة") continue;

      const closedDate = new Date(caseItem.updatedAt);
      if (closedDate <= sixMonthsAgo) {
        await storage.updateCase(caseItem.id, {
          isArchived: true,
          archivedAt: now.toISOString(),
          archiveReason: "أرشفة تلقائية - مضى 6 أشهر على الإغلاق",
        } as any);
      }
    }
  } catch (error) {
    console.error("Error auto-archiving cases:", error);
  }
}

async function checkStruckOffExpiry() {
  try {
    console.log("Checking struck-off cases for auto-closure...");
    const allCases = await storage.getAllCases();
    const todayStr = new Date().toISOString().split("T")[0];
    let closed = 0;

    for (const caseItem of allCases) {
      if ((caseItem.currentStage as string) !== "مشطوبة") continue;
      const deadline = (caseItem as any).struckOffReopenDeadline;
      if (!deadline || deadline >= todayStr) continue;

      // Auto-close: deadline passed
      const stageHistory = Array.isArray((caseItem as any).stageHistory) ? (caseItem as any).stageHistory : [];
      await storage.updateCase(caseItem.id, {
        currentStage: "مقفلة",
        closureReason: "شطب_بدون_إعادة_قيد",
        closedAt: new Date().toISOString(),
        stageHistory: [
          ...stageHistory,
          { stage: "مقفلة", timestamp: new Date().toISOString(), userId: "system", userName: "النظام", notes: "إغلاق تلقائي — انتهاء مهلة إعادة القيد بعد الشطب" },
        ],
      } as any);

      // Cancel pending hearings, memos, field tasks
      try {
        const hearings = await storage.getHearingsByCase(caseItem.id);
        for (const h of hearings) {
          if (h.status === "قادمة") {
            await storage.updateHearing(h.id, { status: "ملغية" });
          }
        }
        const memos = await storage.getMemosByCase(caseItem.id);
        for (const m of memos) {
          if (["لم_تبدأ", "قيد_التحرير", "قيد_المراجعة", "تحتاج_تعديل"].includes(m.status)) {
            await storage.updateMemo(m.id, { status: "ملغاة" } as any);
          }
        }
        const tasks = await storage.getFieldTasksByCase(caseItem.id);
        for (const t of tasks) {
          if (t.status === "قيد_التنفيذ" || t.status === "قيد_الانتظار") {
            await storage.updateFieldTask(t.id, { status: "ملغي" } as any);
          }
        }
      } catch (e) {
        console.error(`Error cleaning up entities for struck-off case ${caseItem.id}:`, e);
      }

      // Notify department_head and primaryLawyerId
      try {
        const allUsers = await storage.getAllUsers();
        const notifyIds: string[] = [];
        if (caseItem.primaryLawyerId) notifyIds.push(caseItem.primaryLawyerId);
        const deptHead = allUsers.find((u: any) => u.departmentId === caseItem.departmentId && u.role === "department_head" && u.isActive);
        if (deptHead) notifyIds.push(deptHead.id);

        for (const rid of Array.from(new Set(notifyIds))) {
          await storage.createNotification({
            type: "stage_changed" as any,
            priority: "high",
            status: "pending",
            title: "إغلاق تلقائي — شطب بدون إعادة قيد",
            message: `تم إغلاق القضية رقم ${caseItem.caseNumber} تلقائياً لانتهاء مهلة إعادة القيد بعد الشطب (${deadline}).`,
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId: rid,
            relatedType: "case",
            relatedId: caseItem.id,
          });
        }
      } catch (e) {
        console.error(`Error notifying for struck-off closure ${caseItem.id}:`, e);
      }

      closed++;
    }
    if (closed > 0) {
      console.log(`Struck-off auto-closure: ${closed} cases closed.`);
    }
  } catch (error) {
    console.error("Error checking struck-off expiry:", error);
  }
}

async function recalculateCasePriorities() {
  try {
    console.log("Recalculating smart priorities for all active cases...");
    const allCases = await storage.getAllCases();
    let updated = 0;
    for (const c of allCases) {
      if (c.isArchived || c.currentStage === "مقفلة") continue;
      const smartPriority = calculateSmartPriority(
        c.caseType,
        c.caseClassification,
        c.memoRequired,
        c.nextHearingDate,
        c.priority,
        c.responseDeadline
      );
      if (smartPriority !== c.priority) {
        await storage.updateCase(c.id, { priority: smartPriority } as any);
        updated++;
      }
    }
    console.log(`Priority recalculation complete: ${updated} cases updated.`);
  } catch (error) {
    console.error("Error recalculating case priorities:", error);
  }
}
