import cron from "node-cron";
import { storage } from "./storage";

export function startScheduler() {
  console.log("Scheduler started - automated hearing/memo checks active");

  cron.schedule("0 * * * *", async () => {
    console.log("Running hourly hearing checks...");
    await checkUnupdatedHearings();
    await checkUpcomingHearingReminders();
  });

  cron.schedule("0 */6 * * *", async () => {
    console.log("Running memo deadline checks...");
    await checkMemoDeadlines();
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

async function hasExistingNotification(
  relatedId: string,
  titlePattern: string,
  recipientId?: string
): Promise<boolean> {
  const allNotifications = await storage.getAllNotifications();
  return allNotifications.some(
    (n) =>
      n.relatedId === relatedId &&
      n.title.includes(titlePattern) &&
      (!recipientId || n.recipientId === recipientId)
  );
}

async function checkUnupdatedHearings() {
  try {
    const allHearings = await storage.getAllHearings();
    const now = new Date();

    for (const hearing of allHearings) {
      if (hearing.status !== "قادمة") continue;

      const hearingDateTime = parseHearingDateTime(hearing.hearingDate, hearing.hearingTime);
      if (!hearingDateTime) continue;

      const hoursSinceHearing = (now.getTime() - hearingDateTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceHearing >= 8) {
        const alreadySent8h = await hasExistingNotification(hearing.id, "جلسة لم تُحدَّث نتيجتها");
        if (!alreadySent8h) {
          await sendUnupdatedHearingAlert(hearing);
        }
      }

      if (hoursSinceHearing >= 24) {
        const alreadySent24h = await hasExistingNotification(hearing.id, "جلسة متأخرة التحديث 24 ساعة");
        if (!alreadySent24h) {
          await sendEscalatedHearingAlert(hearing);
        }
      }

      if (hoursSinceHearing >= 48) {
        const alreadySent48h = await hasExistingNotification(hearing.id, "جلسة متأخرة 48 ساعة");
        if (!alreadySent48h) {
          await sendFinalEscalationAlert(hearing);
        }
      }
    }
  } catch (error) {
    console.error("Error checking unupdated hearings:", error);
  }
}

async function sendUnupdatedHearingAlert(hearing: any) {
  const caseInfo = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
  const caseLabel = caseInfo ? caseInfo.caseNumber : "غير محددة";

  const recipientIds: string[] = [];

  if (caseInfo?.responsibleLawyerId) {
    recipientIds.push(caseInfo.responsibleLawyerId);

    const lawyer = await storage.getUser(caseInfo.responsibleLawyerId);
    if (lawyer?.departmentId) {
      const allUsers = await storage.getAllUsers();
      const deptHead = allUsers.find(
        (u) => u.departmentId === lawyer.departmentId && u.role === "department_head"
      );
      if (deptHead) recipientIds.push(deptHead.id);
    }
  }

  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter(
    (u) => u.role === "branch_manager" || u.role === "admin_support"
  );
  admins.forEach((a) => recipientIds.push(a.id));

  const uniqueRecipients = [...new Set(recipientIds)];
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

async function sendEscalatedHearingAlert(hearing: any) {
  const caseInfo = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
  const caseLabel = caseInfo ? caseInfo.caseNumber : "غير محددة";

  const allUsers = await storage.getAllUsers();
  const branchManager = allUsers.find((u) => u.role === "branch_manager");

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

async function sendFinalEscalationAlert(hearing: any) {
  const caseInfo = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
  const caseLabel = caseInfo ? caseInfo.caseNumber : "غير محددة";

  const allUsers = await storage.getAllUsers();
  const topManagement = allUsers.filter(
    (u) => u.role === "branch_manager" || u.role === "cases_review_head"
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
    const allHearings = await storage.getAllHearings();
    const now = new Date();

    for (const hearing of allHearings) {
      if (hearing.status !== "قادمة") continue;

      const hearingDateTime = parseHearingDateTime(hearing.hearingDate, hearing.hearingTime);
      if (!hearingDateTime) continue;

      const hoursUntilHearing = (hearingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilHearing > 0 && hoursUntilHearing <= 48 && !hearing.reminderSent24h) {
        const caseInfo = hearing.caseId ? await storage.getCaseById(hearing.caseId) : null;
        const recipientId = caseInfo?.responsibleLawyerId;
        if (!recipientId) continue;
        const caseLabel = caseInfo ? caseInfo.caseNumber : "";

        const alreadySent48h = await hasExistingNotification(hearing.id, "تذكير: جلسة بعد", recipientId);

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
