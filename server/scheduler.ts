import cron from "node-cron";
import { storage } from "./storage";
import { calculateSmartPriority, recomputePrescriptionForCase } from "./routes";
import { SettlementLinkMissingClosureReason, firmDateTimeToInstant, caseNotificationRecipientId,
  NotificationType, elapsedDaysLabel, firmToday,
  HearingRingLeadMinutes, isRingWindowOpen, resolveHearingRingTier,
  HearingRingTier, HearingRingTierLeadMinutes,
  addDaysToDateString, prescriptionClockStopped, prescriptionArrivedTimeBarred,
  FieldTaskType } from "@shared/schema";
import { sendToUsers } from "./websocket";
import { resolveNotificationRecipients, type NotificationRecipientUser } from "./notification-recipients";
import type { LongPausedRecord } from "./storage";

export function startScheduler() {
  console.log("Scheduler started - automated hearing/memo/deadline/delegation checks active");

  cron.schedule("0 * * * *", async () => {
    await checkUnupdatedHearings();
    await checkUpcomingHearingReminders();
  });

  cron.schedule("0 */6 * * *", async () => {
    await checkMemoDeadlines();
  });

  // 🚩 Every 5 minutes — the finest cadence in this scheduler, and deliberately
  // NOT per-minute. A flag is an after-the-fact accountability mark, not a
  // real-time alert: worst case it appears 5 minutes after the session's moment,
  // which nobody is watching a clock for. (The 10/8/6/5-minute RINGING chain in
  // the later batches is what genuinely needs per-minute evaluation; this does
  // not, and buying that precision here would multiply the tick count fivefold
  // for no gain.)
  //
  // AFFORDABLE AT THIS CADENCE ONLY BECAUSE THE QUERY IS NARROW: one indexed
  // read of a single calendar day, five columns, four conditions in SQL. It does
  // NOT call getAllHearings / getAllCases / getAllNotifications. On a quiet day
  // it returns zero rows and the job exits immediately.
  cron.schedule("*/5 * * * *", async () => {
    await checkUnpreparedHearings();
  });

  // 🔔 Per-minute — the only job in this scheduler at that cadence, and it earns
  // it: a 10-minute ring window needs sub-poll responsiveness at its edges.
  // Affordable ONLY because the query is one indexed read of a single calendar
  // day returning a handful of rows, and because the push carries no payload.
  // Losing ticks is not a correctness problem — the client's 30s derivation is
  // the mechanism; see checkHearingRingWindow.
  cron.schedule("* * * * *", async () => {
    await checkHearingRingWindow();
  });

  cron.schedule("0 8 * * *", async () => {
    // FIRST in the run, by instruction: it recomputes prescription_date across
    // the admin cases before anything else reads it, so a missed write path
    // cannot leave a stale deadline for the rest of the morning's jobs.
    await checkPrescriptionDeadlines();
    await checkLegalDeadlines();
    await checkDelegationExpiry();
    await checkContactFollowUps();
    await recalculateCasePriorities();
    await checkStruckOffExpiry();
    // BEFORE checkSettlementLinkMissingTimeout on purpose: a pause that lifts
    // today must be gone before the 15-day settlement-link scan looks at the
    // same rows, so one tick can never both lift and close a case.
    await checkExpiredPauses();
    // AFTER the lift, on purpose: a pause whose date arrived today is already
    // gone by now, so a record on its way back to work can never be told it is
    // "still paused" on the same morning it resumed.
    await checkLongPauses();
    await checkSettlementLinkMissingTimeout();
    await checkNajizReviewReminders();
  });

  cron.schedule("0 7 * * 0", async () => {
    await generateWeeklyReport();
  });

  cron.schedule("0 7 1 * *", async () => {
    await generateMonthlyReport();
  });

  cron.schedule("0 2 * * *", async () => {
    await autoArchiveClosedCases();
  });
}

// The wall-clock this scheduler assumes when a hearing's own time is unusable.
// PRESERVED from the previous implementation rather than changed: returning null
// instead would SKIP the hearing, silently suppressing its reminder and its
// 8/24/48h escalation — the coverage loss would land on exactly the rows whose
// data is already broken. 09:00 is also the safer of the two values the old code
// produced, since a later assumed time makes an escalation fire later, never
// early.
const FALLBACK_HEARING_TIME = "09:00";

// The reason written on an auto-flagged session. A CONSTANT, not an inline
// literal: it is the only way to recognise this job's flags apart from a human's
// afterwards, and it must stay byte-identical across the write and any future
// reader (a "clear the auto-flags" tool, a report, batch 3's ring copy).
const UNPREPARED_FLAG_REASON = "لم يقم أحد بالتحضير للجلسة";

// Resolve a hearing's date + time to a real instant IN THE FIRM'S TIMEZONE.
//
// 🔴 Was: `new Date(dateStr)` (UTC midnight) followed by `date.setHours(...)`
// (SERVER-local) — two different calendars in two lines, so on the UTC
// production host every reminder and every escalation was off by the Riyadh
// offset. firmDateTimeToInstant does it in one calendar; see its comment in
// shared/schema.ts. Thresholds, recipients, dedup and titles are untouched.
//
// It also unifies a silent inconsistency: an EMPTY time used to become 09:00,
// but an UNPARSEABLE one fell through with no setHours call at all and became
// 00:00. Both now take the same documented fallback, and — unlike before — the
// fallback is logged instead of being invisible.
function parseHearingDateTime(dateStr: string, timeStr: string | null): Date | null {
  const exact = firmDateTimeToInstant(dateStr, timeStr);
  if (exact) return exact;

  // Distinguish a bad DATE (nothing to salvage — behaves as before: skipped)
  // from a bad TIME (recoverable via the documented fallback).
  const fallback = firmDateTimeToInstant(dateStr, FALLBACK_HEARING_TIME);
  if (!fallback) return null;
  console.warn(
    `[scheduler] hearing_time is missing or malformed (${JSON.stringify(timeStr)}) ` +
    `for hearing date ${dateStr} — assuming ${FALLBACK_HEARING_TIME} Asia/Riyadh.`,
  );
  return fallback;
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

  // The person who ATTENDS is the person to chase about an un-updated hearing.
  // Was caseInfo.responsibleLawyerId unconditionally, which sent "لديك جلسة"-style
  // alerts to the wrong lawyer as soon as a case designated a المترافع. The
  // hearing's own attendingLawyerId already carries the answer (it is set at
  // creation from litigatorId → primary → responsible), so read it first and keep
  // the case lawyer as the fallback for legacy rows with no attending lawyer.
  //
  // ⚠ THE ATTENDANCE RULE IS UNCHANGED — attendingLawyerId still wins outright.
  // Only the FALLBACK half is widened: it read responsibleLawyerId ALONE, a field
  // with no UI input that is no longer written at all, so a legacy hearing with no
  // attending lawyer on a primary-only case resolved to nobody.
  const hearingOwnerId = hearing.attendingLawyerId || caseNotificationRecipientId(caseInfo);
  if (hearingOwnerId) {
    recipientIds.push(hearingOwnerId);

    const lawyer = allUsers.find((u: any) => u.id === hearingOwnerId);
    if (lawyer?.departmentId) {
      // !!u.departmentId — a null/"" dept must never match; u.isActive mirrors
      // checkStruckOffExpiry's lookup, so a deactivated head stops being paged.
      const deptHead = allUsers.find(
        (u: any) => !!u.departmentId && u.departmentId === lawyer.departmentId && u.role === "department_head" && u.isActive
      );
      if (deptHead) recipientIds.push(deptHead.id);
    }
  }

  // Reuse the allUsers list passed in by checkUnupdatedHearings (which
  // pre-fetched it once to avoid N+1). The previous `const allUsers =
  // await storage.getAllUsers()` here both shadowed the parameter (a
  // no-op since the value was the same) and triggered an esbuild
  // "already been declared" error that broke `npm run dev` boot.
  const admins = allUsers.filter(
    (u: any) => u.role === "branch_manager" || u.role === "admin_support"
  );
  admins.forEach((a: any) => recipientIds.push(a.id));

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
        // Same correction as sendUnupdatedHearingAlert: these messages say
        // "لديك جلسة" — they must reach whoever actually attends. attendingLawyerId
        // already resolves المترافع → primary → responsible at hearing creation;
        // the case's assigned lawyer stays the fallback for legacy rows.
        //
        // ⚠ ATTENDANCE RULE UNCHANGED — attendingLawyerId still wins. Only the
        // FALLBACK is widened. It read responsibleLawyerId alone and then
        // `continue`d, so a legacy hearing with no attending lawyer on a
        // primary-only case emitted NO 48h and NO 24h reminder, silently.
        const recipientId = hearing.attendingLawyerId || caseNotificationRecipientId(caseInfo);
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
      // 🔴 THE SILENT-DEADLINE BUG. This read responsibleLawyerId ALONE and
      // `continue`d when it was empty — so a case assigned through the reassign
      // dialog or مهامي (both write primaryLawyerId only) received NO 7-day,
      // 3-day or overdue legal-deadline warning at all, silently. Primary first,
      // responsible as fallback.
      // Now byte-equivalent to the shared helper, so use it rather than keeping a
      // second copy of the chain.
      const recipientId = caseNotificationRecipientId(caseInfo);
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
            // !!u.departmentId — a null/"" dept must never match; u.isActive mirrors
            // checkStruckOffExpiry's lookup, so a deactivated head stops being paged.
            const deptHead = allUsers.find((u: any) => !!u.departmentId && u.departmentId === caseInfo.departmentId && u.role === "department_head" && u.isActive);
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
    // judgment_side holds three values; counting only two dropped every partial
    // judgment out of the monthly report entirely. Reported as its own figure.
    const won = judgments.filter(h => h.judgmentSide === "لصالحنا").length;
    const lost = judgments.filter(h => h.judgmentSide === "ضدنا").length;
    const partial = judgments.filter(h => h.judgmentSide === "جزئي").length;

    const allUsers = await storage.getAllUsers();
    const managers = allUsers.filter(u => u.role === "branch_manager" || u.role === "cases_review_head");

    for (const manager of managers) {
      await storage.createNotification({
        type: "monthly_report",
        title: "التقرير الشهري",
        message: `ملخص الشهر: ${newCases} قضية جديدة، ${closedCases} مغلقة، ${totalActive} نشطة حالياً. الأحكام: ${won} لصالحنا، ${lost} ضدنا، ${partial} جزئي.`,
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
        });
      }
    }
  } catch (error) {
    console.error("Error auto-archiving cases:", error);
  }
}

// Recurring PLATFORM-review reminder: while a case sits at one of the three
// "قيد_التدقيق_في_*" stages — ناجز, تراضي or معين — remind the responsible lawyer
// to verify the request status on that platform. The first reminder fires 3 days
// after the case entered the stage, then recurs every 3 days. Once the lawyer
// confirms the request was accepted — i.e. advances the case out of the stage —
// any still-open reminders are auto-cancelled so they stop recurring.
//
// The function name still says Najiz because ناجز was the only stage it covered
// when it was written; renaming it would touch the cron registration and the
// error string for no behavioural gain, so the docs carry the correction instead.
// ==================== التقادم — SWEEP, WARN, LAPSE, CANCEL ====================
// Daily 08:00. Three jobs in one pass over the admin cases, in a FIXED ORDER:
// recompute first (so nothing downstream reads a stale date), then warn, then
// escalate, then cancel.
//
// 🔴 EVERY DATE COMPARISON IS A STRING COMPARISON. prescription_date and
// firmToday() are both "YYYY-MM-DD", which sorts lexicographically, so `<` and
// `>=` ARE the calendar comparison. Nothing here parses a date-only string —
// that is the 60a4d79 UTC-midnight class, and it is also the defect in
// checkLegalDeadlines' own daysLeft (`new Date(deadline.deadlineDate)`), which
// this job deliberately does not copy. The T-3 boundary is computed by
// addDaysToDateString, the same integer-in/integer-out helper the rule uses.
const PRESCRIPTION_WARNING_TITLE = "تنبيه: قرب انتهاء مدة التقادم";
const PRESCRIPTION_LAPSED_TITLE = "عاجل: انتهت مدة التقادم";

async function checkPrescriptionDeadlines() {
  try {
    const [allCases, allTasks, allNotifications, allUsers] = await Promise.all([
      storage.getAllCases(),
      storage.getAllFieldTasks(),
      storage.getAllNotifications(),
      storage.getAllUsers(),
    ]);

    // Admin cases only — the rule is administrative. A case with no track has no
    // clock (computePrescriptionDate returns no-rule), but it is still swept so
    // that a stale date left by an earlier track choice gets cleared.
    // Typed callback, NOT (c: any) — getAllCases returns LawCase[], and widening
    // it here would have forced a cast at the recompute call below.
    const adminCases = allCases.filter((c) => {
      const sub = String(c.adminCaseSubType || "").trim();
      return sub === "تظلم" || sub === "قضية" || !!String(c.prescriptionDate || "").trim();
    });

    // ---- 1. THE SAFETY-NET SWEEP, FIRST ----
    // 🔴 RESTRICTED TO ROWS WHERE prescription_date IS EMPTY (batch 3b). It used
    // to recompute EVERY non-stopped admin case every morning, which would have
    // erased every hand-typed deadline overnight and silently defeated the
    // manual-value feature the routes now protect. Its job is now "FILL IN WHAT
    // WAS NEVER COMPUTED", not "re-derive everything".
    //
    // That is still a real backstop: the failure it exists to catch is a case
    // that acquired its inputs through a path with no recompute hook and so has
    // NO date at all. A case that already carries one is either correct (a route
    // computed it) or deliberate (a lawyer typed it), and this job can no longer
    // tell those apart — which is precisely why it must not touch either.
    //
    // Still skips stopped clocks inside recomputePrescriptionForCase (R3 — frozen
    // at filing), so a filed case is never written regardless.
    let recomputed = 0;
    for (const c of adminCases) {
      if (String(c.prescriptionDate || "").trim()) continue;
      try {
        if (await recomputePrescriptionForCase(c)) recomputed++;
      } catch (e) {
        console.error("[prescription] recompute failed for case", c.id, e);
      }
    }
    if (recomputed > 0) {
      console.log(`[prescription] nightly sweep updated ${recomputed} case(s)`);
    }

    // Re-read after the sweep: the warning must evaluate the dates it just wrote,
    // not the ones it replaced.
    const refreshed = recomputed > 0 ? await storage.getAllCases() : allCases;
    const byId = new Map(refreshed.map((c: any) => [c.id, c]));

    const today = firmToday();
    const warnBoundary = addDaysToDateString(today, 3);

    // Open warning tasks by case, found by TYPE — never by title prefix.
    const openWarningByCase = new Map<string, any[]>();
    for (const t of allTasks) {
      if (!t.caseId) continue;
      if (t.taskType !== FieldTaskType.PRESCRIPTION_WARNING) continue;
      if (t.status !== "قيد_الانتظار" && t.status !== "قيد_التنفيذ") continue;
      const arr = openWarningByCase.get(t.caseId) ?? [];
      arr.push(t);
      openWarningByCase.set(t.caseId, arr);
    }

    for (const stale of adminCases) {
      const caseItem: any = byId.get(stale.id) ?? stale;
      const open = openWarningByCase.get(caseItem.id) ?? [];

      // ---- 4. CANCEL ON FILING ----
      // The clock stopped, so the warning is answered. Cancel any open task and
      // send NOTHING — the لawyer already knows they filed. Same shape as
      // checkNajizReviewReminders' auto-cancel arm.
      if (prescriptionClockStopped(caseItem)) {
        for (const t of open) {
          await storage.updateFieldTask(t.id, { status: "ملغي" });
        }
        continue;
      }

      const deadline = String(caseItem.prescriptionDate || "").trim();
      if (!deadline) continue;

      // ---- 5. ARRIVED ALREADY TIME-BARRED → SILENT (batch 3b) ----
      // 🔴 The firm receives violations whose prescription date is already past
      // on the day they are entered. NOBODY AT THE FIRM LOST ANYTHING, so these
      // get no T-3 notification, no warning task and no lapse escalation. An
      // alert here would be an accusation about something that happened before
      // the file arrived, and a page full of those is how a real lapse gets
      // ignored.
      //
      // Placed BEFORE both the lapse arm and the T-3 arm, because such a case
      // satisfies the lapse test by construction (its deadline is in the past)
      // and would otherwise escalate to three people the morning it is opened.
      // The panel applies the SAME shared predicate, so the label and the silence
      // can never disagree.
      if (prescriptionArrivedTimeBarred(caseItem)) continue;

      const recipientId = caseNotificationRecipientId(caseItem);

      // ---- 3. LAPSE — ESCALATE ----
      // The warning task stays OPEN on purpose: the work (file, or explain why
      // not) is still outstanding, and cancelling it would erase the only thing
      // on anyone's list about a case that just lost its deadline.
      if (deadline < today) {
        if (!notificationExists(allNotifications, caseItem.id, PRESCRIPTION_LAPSED_TITLE)) {
          // 🔴 resolveNotificationRecipients, NOT `.find` — checkLegalDeadlines
          // resolves its department head with `.find` (scheduler.ts, the overdue
          // arm), which notifies exactly ONE head of a two-head department and is
          // the bug the notification batch fixed everywhere else. This helper
          // de-dupes, drops blanks, filters to ACTIVE users and appends EVERY
          // active head of the department.
          const managers = allUsers
            .filter((u: any) => u.role === "branch_manager" && u.isActive)
            .map((u: any) => u.id);
          const recipients = resolveNotificationRecipients(
            [recipientId, ...managers],
            allUsers as NotificationRecipientUser[],
            { departmentId: caseItem.departmentId },
          );
          for (const rid of recipients) {
            await storage.createNotification({
              type: NotificationType.GENERAL_ALERT,
              title: PRESCRIPTION_LAPSED_TITLE,
              message: `انتهت مدة التقادم للقضية رقم ${caseItem.caseNumber} بتاريخ ${deadline} ولم يتم الرفع بعد. يرجى المراجعة العاجلة.`,
              priority: "urgent",
              status: "pending",
              senderId: "system",
              senderName: "النظام التلقائي",
              recipientId: rid,
              relatedType: "case",
              relatedId: caseItem.id,
              requiresResponse: true,
            });
          }
        }
        continue;
      }

      // ---- 2. T-3 WARNING ----
      // Inclusive window rather than an exact-day equality: an exact match would
      // miss the warning entirely if the job did not run that morning (an outage,
      // a deploy), and this is the one alert in the system that must not be
      // missed. The notification dedupe makes re-entry harmless.
      if (!warnBoundary || deadline > warnBoundary) continue;
      if (!recipientId) continue; // no lawyer to warn — nothing to send

      if (!notificationExists(allNotifications, caseItem.id, PRESCRIPTION_WARNING_TITLE, recipientId)) {
        await storage.createNotification({
          type: NotificationType.GENERAL_ALERT,
          title: PRESCRIPTION_WARNING_TITLE,
          message: `تنتهي مدة التقادم للقضية رقم ${caseItem.caseNumber} بتاريخ ${deadline}. يرجى إتمام الرفع قبل هذا التاريخ.`,
          priority: "urgent",
          status: "pending",
          senderId: "system",
          senderName: "النظام التلقائي",
          recipientId,
          relatedType: "case",
          relatedId: caseItem.id,
          requiresResponse: true,
        });
      }

      // ONE task per case, found by taskType. `open` was built before this loop,
      // so a task created on an earlier tick is seen here and not duplicated.
      if (open.length === 0) {
        await storage.createFieldTask(
          {
            title: `${PRESCRIPTION_WARNING_TITLE} — قضية رقم ${caseItem.caseNumber}`,
            description: `تنتهي مدة التقادم بتاريخ ${deadline}. يجب إتمام الرفع قبل هذا التاريخ، وإلا سقطت الدعوى.`,
            taskType: FieldTaskType.PRESCRIPTION_WARNING,
            caseId: caseItem.id,
            assignedTo: recipientId,
            priority: "عاجل",
            dueDate: deadline,
          },
          "system",
        );
      }
    }
  } catch (error) {
    console.error("Error checking prescription deadlines:", error);
  }
}

async function checkNajizReviewReminders() {
  try {
    const allCases = await storage.getAllCases();
    const allTasks = await storage.getAllFieldTasks();
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    // 🔴 THE THREE PLATFORM-REVIEW STAGES, not just ناجز. تراضي and معين had no
    // reminder of any kind: a case parked at either sat there with nothing
    // watching it, exactly as ناجز did before this job existed.
    //
    // The stage → platform-name map drives BOTH the title and the description, so
    // a reminder always names the platform the lawyer has to go and check.
    const REVIEW_STAGE_PLATFORMS: Record<string, string> = {
      "قيد_التدقيق_في_ناجز": "ناجز",
      "قيد_التدقيق_في_تراضي": "تراضي",
      "قيد_التدقيق_في_معين": "معين",
    };
    // 🔴 THE TITLE KEY IS NOW THE PLATFORM-AGNOSTIC PREFIX, and it has to be.
    // It used to be the full "التأكد من حالة الطلب في ناجز", which is how this
    // job recognises its OWN previous reminders — there is no dedicated taskType.
    // Emitting a تراضي reminder while still matching on the ناجز string would have
    // broken the job in both directions at once: the 3-day recurrence guard would
    // never find the previous reminder, so it would create a NEW ONE EVERY DAY,
    // and the auto-cancel arm would never see them, so they would keep recurring
    // after the case left the stage. A reminder that never cancels is worse than
    // no reminder.
    //
    // The prefix is a strict prefix of the old string, so it still matches every
    // ناجز reminder already sitting in production — no backfill, no orphans.
    const TITLE_KEY = "التأكد من حالة الطلب في";

    // Group existing najiz reminders by case (title-matched — there is no
    // dedicated taskType for them) for O(1) lookup.
    const remindersByCase = new Map<string, typeof allTasks>();
    for (const t of allTasks) {
      if (t.caseId && t.title.includes(TITLE_KEY)) {
        const arr = remindersByCase.get(t.caseId) ?? [];
        arr.push(t);
        remindersByCase.set(t.caseId, arr);
      }
    }

    for (const caseItem of allCases) {
      const reminders = remindersByCase.get(caseItem.id) ?? [];

      // Set membership instead of one literal. The `else if` arm below — which
      // cancels still-open reminders once the case LEAVES the stage — keys off
      // this same condition, so widening it here widens the cancel automatically
      // and the two halves cannot drift.
      const reviewPlatform = REVIEW_STAGE_PLATFORMS[String(caseItem.currentStage ?? "")];
      if (reviewPlatform) {
        const assignee = caseNotificationRecipientId(caseItem);
        if (!assignee) continue; // no responsible lawyer to remind

        // When did the case enter this stage? Use the LAST matching stageHistory
        // entry (a case can re-enter via أغلق_طلب_الصلح → قيد_التدقيق_في_ناجز);
        // fall back to updatedAt only if history is missing.
        const history = Array.isArray(caseItem.stageHistory) ? caseItem.stageHistory : [];
        const entry = [...history].reverse().find((h) => h.stage === caseItem.currentStage);
        const enteredMs = entry ? new Date(entry.timestamp).getTime() : new Date(caseItem.updatedAt).getTime();

        const lastReminderMs = reminders.length
          ? Math.max(...reminders.map((t) => new Date(t.createdAt).getTime()))
          : 0;

        // First reminder ≥3 days after entering; then every ≥3 days.
        const dueForReminder =
          now - enteredMs >= 3 * DAY &&
          (lastReminderMs === 0 || now - lastReminderMs >= 3 * DAY);

        if (dueForReminder) {
          await storage.createFieldTask(
            {
              // Both strings name the platform from the stage. The title keeps the
              // TITLE_KEY prefix byte-for-byte, which is what makes the recurrence
              // guard and the auto-cancel find this row again.
              title: `${TITLE_KEY} ${reviewPlatform} — قضية رقم ${caseItem.caseNumber}`,
              description: `يرجى التأكد من حالة القيد/الطلب في منصة ${reviewPlatform}. يتكرّر هذا التذكير كل 3 أيام حتى يتم تحديث حالة القضية.`,
              taskType: "متابعة_محكمة",
              caseId: caseItem.id,
              assignedTo: assignee,
              priority: "عالي",
              dueDate: new Date(now + 3 * DAY).toISOString().split("T")[0],
            },
            "system",
          );
        }
      } else if (reminders.length) {
        // Case left platform review (request accepted → advanced on, or closed):
        // cancel any still-open reminders so they stop recurring. This arm is the
        // exact negation of the `if` above, so widening that condition widened
        // this one too and all three stages are covered.
        //
        // ⚠ IT FIRES ONLY WHEN THE CASE IS AT NO REVIEW STAGE AT ALL. A case
        // moving DIRECTLY from one review stage to another keeps the first
        // platform's reminders open, and — because TITLE_KEY is now shared across
        // the three — they also count toward the 3-day recurrence guard, so the
        // new platform's first reminder can be delayed by up to 3 days. Accepted:
        // ALLOWED_CASE_TRANSITIONS has no review→review edge (each is reached from
        // أغلق_طلب_الصلح or مداولة_الصلح), so the path always passes through a
        // non-review stage where this arm cancels. It is recorded because a future
        // edge would make it reachable.
        for (const t of reminders) {
          if (t.status === "قيد_الانتظار" || t.status === "قيد_التنفيذ") {
            await storage.updateFieldTask(t.id, { status: "ملغي" });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error checking najiz review reminders:", error);
  }
}

// Auto-lift pauses whose optional end date has passed, across all four
// pausable entities (cases / consultations / contracts / memos).
//
// SHAPE mirrors checkStruckOffExpiry: pause_until is a "YYYY-MM-DD" varchar, so
// the expiry test is the same lexicographic string compare against today
// (`deadline >= todayStr → skip`). Zero-padded ISO dates compare correctly as
// strings, and staying out of Date arithmetic keeps this clear of the drizzle
// date-mode conversion that silently broke auto-archive (Phase-4 S3).
//
// GUARDS mirror checkSettlementLinkMissingTimeout: skip anything already
// closed/archived, and skip rows whose pause is owned by that job.
//
// ⚠ It lifts by calling the SAME storage.unpause* methods the manual buttons
// call, not by hand-writing the columns — so the pause_* clearing (including
// pause_until itself) and the unpaused activity-log row stay in one place and
// can never drift from the manual path.
async function checkExpiredPauses() {
  const todayStr = new Date().toISOString().split("T")[0];
  // The settlement-link pause is owned by checkSettlementLinkMissingTimeout,
  // which CLOSES the case after 15 days. It never sets pause_until, so this is
  // belt-and-braces — but if anyone ever sets one by hand, two jobs racing the
  // same row would be a genuinely nasty bug. Exact string equality; we control
  // the text (it is the same constant the hearing-result handler writes).
  const SETTLEMENT_LINK_PAUSE = "بانتظار رابط جلسة الصلح من العميل";

  // Shared per-row test. A row qualifies only if it is actually paused AND
  // carries a date AND that date is strictly before today (so a pause ending
  // "today" survives the day and lifts tomorrow morning — the same-day
  // semantics validatePauseUntil documents).
  const isExpired = (row: { pausedAt?: string | null; pauseUntil?: string | null; pauseReason?: string | null }): boolean => {
    if (!row.pausedAt) return false;
    const until = String(row.pauseUntil ?? "").trim();
    if (!until) return false;
    if (until >= todayStr) return false;
    if (row.pauseReason === SETTLEMENT_LINK_PAUSE) return false;
    return true;
  };

  const UNPAUSE_NOTE = "إلغاء تعليق تلقائي — انتهاء مدة التعليق";
  let lifted = 0;

  // Recipient roster for the auto-lift notices, fetched ONCE for the whole
  // sweep. Isolated in its own try/catch and defaulted to []: TELLING someone is
  // secondary to LIFTING, so a users-table failure must degrade to "lifted, but
  // nobody was told" — never block the sweep that is this job's actual purpose.
  // resolveNotificationRecipients returns [] for an empty roster, which makes
  // every send below a silent no-op with no further guarding needed.
  let roster: NotificationRecipientUser[] = [];
  try {
    roster = await storage.getAllUsers();
  } catch (error) {
    console.error("Error loading users for expired-pause notifications:", error);
  }

  // ONE notification per lifted record, to the assignee AND whoever paused it,
  // de-duplicated when they are the same person (the common case).
  //
  // 🔴 THE WORDING IS PAST TENSE ON PURPOSE. By the time anyone reads this the
  // record is ALREADY ACTIVE — the pause was lifted moments earlier, in the same
  // loop iteration. Copy that urges the reader to act ("the pause is about to
  // expire") would describe a state that no longer exists and invite them to
  // hunt for a pause that is gone. This is a statement of fact, matching the
  // tone of UNPAUSE_NOTE, which is what the activity log already records.
  //
  // 🔴 ISOLATED PER ROW, and that is not redundant with the four outer
  // try/catch blocks: those isolate the four ENTITIES from each other, so an
  // uncaught throw here would still abandon every REMAINING row of the entity
  // being processed — lifting case #3 and then silently skipping cases #4..#n.
  // Same shape as checkStruckOffExpiry's own notify-block try/catch.
  const notifyLift = async (input: {
    title: string;
    message: string;
    candidates: (string | null | undefined)[];
    relatedType: "case" | "consultation" | "memo" | null;
    relatedId: string | null;
  }) => {
    try {
      for (const recipientId of resolveNotificationRecipients(input.candidates, roster)) {
        await storage.createNotification({
          type: "general_alert",
          priority: "medium",
          status: "pending",
          title: input.title,
          message: input.message,
          senderId: "system",
          senderName: "النظام التلقائي",
          recipientId,
          relatedType: input.relatedType,
          relatedId: input.relatedId,
          // Information, not a request — nothing is being asked of the reader.
          requiresResponse: false,
        });
      }
    } catch (error) {
      console.error("Error sending expired-pause notification:", error);
    }
  };

  // Each entity is isolated in its own try/catch: one entity failing (a missing
  // column mid-deploy, a bad row) must not stop the other three from lifting.
  try {
    const allCases = await storage.getAllCases();
    for (const c of allCases) {
      if (c.isArchived) continue;
      if ((c.currentStage as string) === "مقفلة") continue;
      if ((c as { status?: string }).status === "مغلق") continue;
      if (!isExpired(c)) continue;
      // Captured BEFORE the lift — unpauseCase clears pause_until, so reading it
      // afterwards would always yield null.
      const pauseUntilValue = String(c.pauseUntil ?? "").trim();
      const unpaused = await storage.unpauseCase(c.id, {
        performedBy: "system",
        performerName: "النظام",
        notes: UNPAUSE_NOTE,
      });
      lifted++;
      // Only on a CONFIRMED lift. unpauseCase returns undefined when the row
      // vanished between the read and the write; announcing a lift that did not
      // happen would be worse than staying quiet.
      if (unpaused) {
        await notifyLift({
          title: "تم إلغاء تعليق القضية تلقائياً",
          message: `تم إلغاء تعليق القضية رقم ${c.caseNumber} تلقائياً — انتهت مدة التعليق بتاريخ ${pauseUntilValue}، وعادت القضية إلى العمل.`,
          candidates: [caseNotificationRecipientId(c), c.pausedBy],
          relatedType: "case",
          relatedId: c.id,
        });
      }
    }
  } catch (error) {
    console.error("Error lifting expired case pauses:", error);
  }

  try {
    const allConsultations = await storage.getAllConsultations();
    for (const c of allConsultations) {
      // Consultations are the one entity whose pause ALSO flips status to
      // "paused"; unpauseConsultation flips it back to "active". Guard on that
      // status rather than on pausedAt alone so a row left inconsistent by hand
      // isn't dragged back to active.
      if (c.status !== "paused") continue;
      if (!isExpired(c)) continue;
      const pauseUntilValue = String(c.pauseUntil ?? "").trim();
      const unpaused = await storage.unpauseConsultation(c.id, {
        performedBy: "system",
        notes: UNPAUSE_NOTE,
      });
      lifted++;
      if (unpaused) {
        await notifyLift({
          title: "تم إلغاء تعليق الاستشارة تلقائياً",
          message: `تم إلغاء تعليق الاستشارة رقم ${c.consultationNumber} تلقائياً — انتهت مدة التعليق بتاريخ ${pauseUntilValue}، وعادت الاستشارة إلى العمل.`,
          candidates: [c.assignedTo, c.pausedBy],
          relatedType: "consultation",
          relatedId: c.id,
        });
      }
    }
  } catch (error) {
    console.error("Error lifting expired consultation pauses:", error);
  }

  try {
    const allContracts = await storage.getAllContracts();
    for (const c of allContracts) {
      // Same status-flip model as consultations.
      if (c.status !== "paused") continue;
      if (!isExpired(c)) continue;
      const pauseUntilValue = String(c.pauseUntil ?? "").trim();
      const unpaused = await storage.unpauseContract(c.id, {
        performedBy: "system",
        notes: UNPAUSE_NOTE,
      });
      lifted++;
      if (unpaused) {
        // 🔴 relatedType/relatedId are NULL for contracts, deliberately.
        // Notification.relatedType (shared/schema.ts) is a closed union that does
        // NOT include "contract", so this notification cannot carry a typed link
        // and the reader gets no click-through. Widening that union is a real
        // change with server-gate consequences (canReferenceRelatedEntity has no
        // contract arm either) and is scoped to the reminder batch — NOT smuggled
        // in here. The contract NUMBER is therefore carried in the message text
        // so the record is still identifiable by search. Sending link-less is
        // the established fallback: checkDelegationExpiry does the same.
        await notifyLift({
          title: "تم إلغاء تعليق العقد تلقائياً",
          message: `تم إلغاء تعليق العقد رقم ${c.contractNumber} تلقائياً — انتهت مدة التعليق بتاريخ ${pauseUntilValue}، وعاد العقد إلى العمل.`,
          candidates: [c.assignedTo, c.pausedBy],
          relatedType: null,
          relatedId: null,
        });
      }
    }
  } catch (error) {
    console.error("Error lifting expired contract pauses:", error);
  }

  try {
    const allMemos = await storage.getAllMemos();
    for (const m of allMemos) {
      // Memos leave status alone on pause (it is workflow state), so pausedAt
      // is the only indicator — but a memo that reached a terminal status while
      // paused should not be revived.
      if (m.status === "ملغاة" || m.status === "مرفوعة" || m.status === "معتمدة") continue;
      if (!isExpired(m)) continue;
      const pauseUntilValue = String(m.pauseUntil ?? "").trim();
      const unpaused = await storage.unpauseMemo(m.id, {
        performedBy: "system",
        notes: UNPAUSE_NOTE,
      });
      lifted++;
      if (unpaused) {
        await notifyLift({
          title: "تم إلغاء تعليق المذكرة تلقائياً",
          message: `تم إلغاء تعليق المذكرة "${m.title}" تلقائياً — انتهت مدة التعليق بتاريخ ${pauseUntilValue}، وعادت المذكرة إلى العمل.`,
          candidates: [m.assignedTo, m.pausedBy],
          relatedType: "memo",
          relatedId: m.id,
        });
      }
    }
  } catch (error) {
    console.error("Error lifting expired memo pauses:", error);
  }

  if (lifted > 0) {
    console.log(`Expired-pause auto-lift: ${lifted} entities resumed.`);
  }
}

// ⏸️ ONE notice, the first time a record has been paused for
// PausedTaskMinDays. Never repeated for that pause.
//
// WHY THIS IS ITS OWN JOB AND NOT PART OF checkExpiredPauses. That function has
// one contract — LIFT pauses whose date has arrived — and its four try/catch
// blocks are built around the lift. The two jobs also disagree about which rows
// they care about: checkExpiredPauses looks only at rows carrying a pause_until
// that has passed, while this one is about pauses that are still very much in
// force, including every OPEN-ENDED pause (pause_until NULL), which that
// function skips entirely. Folding this in would have quietly inherited that
// skip and missed exactly the pauses most likely to drift.
//
// 🔴 REGISTERED AFTER checkExpiredPauses in the same daily tick, deliberately —
// same reasoning as checkExpiredPauses running before
// checkSettlementLinkMissingTimeout. A pause that expires today is lifted
// first, so a record on its way out never gets a "still paused" notice on the
// same morning it resumed.
async function checkLongPauses() {
  try {
    const records = await storage.getLongPausedRecords();
    if (records.length === 0) return;

    // Roster isolated and defaulted to []: telling someone is secondary to the
    // rest of the sweep, and resolveNotificationRecipients returns [] for an
    // empty roster, so a users-table failure degrades to "no notices this run".
    let roster: NotificationRecipientUser[] = [];
    try {
      roster = await storage.getAllUsers();
    } catch (error) {
      console.error("Error loading users for long-pause notifications:", error);
    }

    // 🔴 THE FIRE-ONCE GUARANTEE, and why it is not notificationExists.
    // notificationExists dedups on relatedId + a TITLE SUBSTRING. That is not
    // safe enough here for two independent reasons:
    //   1. Rewording the title would make every already-notified record fire
    //      AGAIN — permanently, because nothing ever deletes notifications, so
    //      the duplicates would pile up in every recipient's list forever.
    //   2. Contracts cannot carry a typed relatedType (the union has no
    //      "contract" member), so a title-only match across null relatedIds
    //      would let one contract's notice suppress another's.
    // Instead the check is purely structural: a dedicated notification TYPE
    // plus related_id, with created_at deciding the window. No text at all
    // takes part, so the copy below can be rewritten freely.
    //
    // created_at >= the CURRENT pause's start is what scopes it to this pause
    // EPISODE: a record that was paused, notified, resumed, and paused again
    // months later has an older notification but a NEWER paused_at, so it
    // correctly notifies again — while a second run on the same pause finds a
    // notification created after that pause began and stays silent.
    const seen = await storage.getNotificationKeysByTypeAndRelatedIds(
      NotificationType.PAUSE_AGING,
      records.map((r) => r.id),
    );
    const sentAtFor = new Map<string, string>();
    for (const s of seen) {
      if (!s.relatedId || !s.createdAt) continue;
      const key = `${s.relatedId}|${s.recipientId}`;
      // Keep the NEWEST — an older row must not mask a later re-notification.
      const prev = sentAtFor.get(key);
      if (!prev || s.createdAt > prev) sentAtFor.set(key, s.createdAt);
    }

    let sent = 0;
    for (const rec of records) {
      // Per-record isolation: one bad row must not abandon the rest of the
      // sweep. Mirrors the notifyLift block in checkExpiredPauses.
      try {
        const copy = longPauseCopy(rec);
        for (const recipientId of resolveNotificationRecipients([rec.assigneeId, rec.pausedBy], roster)) {
          const alreadySent = sentAtFor.get(`${rec.id}|${recipientId}`);
          // No pausedAt (impossible for a row this query returned, but the
          // column is nullable) → treat any prior notice as covering it.
          if (alreadySent && (!rec.pausedAt || alreadySent >= rec.pausedAt)) continue;
          await storage.createNotification({
            type: NotificationType.PAUSE_AGING,
            priority: "medium",
            status: "pending",
            title: copy.title,
            message: copy.message,
            senderId: "system",
            senderName: "النظام التلقائي",
            recipientId,
            // 🔴 CONTRACTS CARRY relatedId WITHOUT relatedType, on purpose.
            // Notification.relatedType is a closed union with no "contract"
            // member, so the typed link is impossible (the auto-lift notice hit
            // the same wall). But related_id is a plain varchar and the click-
            // through, the server-side context enrichment and the FE all key on
            // relatedTYPE — enrichNotificationsWithContext filters
            // `relatedType === t` before it ever reads relatedId — so setting it
            // adds no link and breaks nothing, while giving the fire-once check
            // above a real key for contracts instead of a null one. This is a
            // deliberate, narrow divergence from the auto-lift notice, which
            // nulled both because it needed no dedup.
            relatedType: rec.entityType === "contract" ? null : rec.entityType,
            relatedId: rec.id,
            // Information, not a request.
            requiresResponse: false,
          });
          sent++;
        }
      } catch (error) {
        console.error("Error sending long-pause notification:", error);
      }
    }

    if (sent > 0) {
      console.log(`Long-pause notices: ${sent} sent.`);
    }
  } catch (error) {
    console.error("Error in checkLongPauses:", error);
  }
}

// 🔴 PRESENT TENSE, unlike the auto-lift notice in checkExpiredPauses. That one
// reports something that FINISHED ("تم إلغاء تعليق… وعادت إلى العمل"); this one
// reports a state that is STILL TRUE as the reader reads it — the record is
// paused right now and stays paused until somebody acts. Hence "معلّقة منذ"
// rather than "كانت معلّقة", and a closing line that points at a decision
// rather than announcing one.
function longPauseCopy(rec: LongPausedRecord): { title: string; message: string } {
  const days = elapsedDaysLabel(rec.pausedDays);
  switch (rec.entityType) {
    case "case":
      return {
        title: `قضية معلّقة منذ ${days}`,
        message: `القضية رقم ${rec.label} معلّقة منذ ${days} ولا تزال معلّقة. يرجى مراجعة سبب التعليق وإلغاؤه أو تحديد موعد لانتهائه.`,
      };
    case "consultation":
      return {
        title: `استشارة معلّقة منذ ${days}`,
        message: `الاستشارة رقم ${rec.label} معلّقة منذ ${days} ولا تزال معلّقة. يرجى مراجعة سبب التعليق وإلغاؤه أو تحديد موعد لانتهائه.`,
      };
    case "contract":
      return {
        title: `عقد معلّق منذ ${days}`,
        message: `العقد رقم ${rec.label} معلّق منذ ${days} ولا يزال معلّقاً. يرجى مراجعة سبب التعليق وإلغاؤه أو تحديد موعد لانتهائه.`,
      };
    case "memo":
      return {
        title: `مذكرة معلّقة منذ ${days}`,
        message: `المذكرة "${rec.label}" معلّقة منذ ${days} ولا تزال معلّقة. يرجى مراجعة سبب التعليق وإلغاؤه أو تحديد موعد لانتهائه.`,
      };
  }
}

// 🔔 THE PRE-HEARING RING PUSH — tier 1 (the attending lawyer), T-10 → T.
//
// 🔴 THIS IS AN ACCELERATOR, NOT THE MECHANISM. The ring is DERIVED on the
// client from the 30s /api/hearings/ring-state poll. This job only pushes a
// content-free nudge so the client re-derives sooner than its next poll. If this
// job never runs — a restart, a crashed tick, a deploy spanning the whole
// window — every affected client STILL RINGS within 30 seconds, because the poll
// is what decides. That is the whole reason the derivation was built first.
//
// It therefore keeps NO state: no watermark, no sent-flag, no dedup. It re-pushes
// every minute for as long as the window is open, which is self-healing — a tab
// that connected late, or reconnected after a socket drop, is nudged on the next
// tick instead of waiting for its poll.
//
// FIRST TIME THIS SCHEDULER HAS PUSHED OVER THE SOCKET. The import is a clean
// new edge: server/websocket.ts imports only `ws`, `http` and ./auth, so it
// depends on nothing that depends on the scheduler — no cycle.
async function checkHearingRingWindow() {
  try {
    const rows = await storage.getRingCandidateHearingsForDate(firmToday());
    if (rows.length === 0) return;

    const nowMs = Date.now();

    // Resolve each candidate's instant ONCE, dropping the ones that cannot ring
    // at all, before touching the users table.
    const live = rows.flatMap((r) => {
      // 🔴 firmDateTimeToInstant DIRECTLY, never parseHearingDateTime — the
      // wrapper substitutes 09:00 for a malformed hearing_time and would ring at
      // a moment the session never had. Unparseable → skip; a ring is an
      // interruption and must never fire on a guess.
      const hearingAt = firmDateTimeToInstant(r.hearingDate, r.hearingTime);
      if (!hearingAt) return [];
      // The WIDEST tier window — if even the earliest tier has not opened, no
      // tier has, and this hearing needs no user lookup at all.
      const anyTierOpen = isRingWindowOpen({
        ringFromIso: new Date(hearingAt.getTime() - HearingRingLeadMinutes * 60 * 1000).toISOString(),
        hearingAtIso: hearingAt.toISOString(),
      }, nowMs);
      return anyTierOpen ? [{ row: r, hearingAt }] : [];
    });
    if (live.length === 0) return;

    // ONE narrow users read for the whole tick, scoped to the departments that
    // actually have a live hearing — never getAllUsers().
    const departmentIds = Array.from(new Set(
      live.map((l) => l.row.caseDepartmentId).filter((d): d is string => !!d),
    ));
    const candidates = await storage.getRingRecipientCandidates(departmentIds);

    const recipients = new Set<string>();
    for (const { row, hearingAt } of live) {
      for (const u of candidates) {
        // ONE shared tier rule with the endpoint, so the push and the derivation
        // can never disagree about who rings.
        const tier = resolveHearingRingTier(u, {
          attendingLawyerId: row.attendingLawyerId,
          caseDepartmentId: row.caseDepartmentId,
        });
        if (!tier) continue;
        const leadMs = HearingRingTierLeadMinutes[tier] * 60 * 1000;
        // 🔴 EACH TIER IS THE SAME INSTANT WITH ITS OWN LEAD. At T-5 all four
        // windows are open simultaneously, so all four tiers resolve true on
        // this same pass — accumulation with NO state tracking which tier has
        // "already fired".
        const open = isRingWindowOpen({
          ringFromIso: new Date(hearingAt.getTime() - leadMs).toISOString(),
          hearingAtIso: hearingAt.toISOString(),
        }, nowMs);
        if (open) recipients.add(u.id);
      }
      // The attending lawyer is resolved from the hearing itself: they may not
      // be in the candidate set (a lawyer in another department, or one whose
      // role is neither admin_support nor branch_manager and whose department
      // differs from the case's).
      if (row.attendingLawyerId) {
        const leadMs = HearingRingTierLeadMinutes[HearingRingTier.ATTENDING] * 60 * 1000;
        const open = isRingWindowOpen({
          ringFromIso: new Date(hearingAt.getTime() - leadMs).toISOString(),
          hearingAtIso: hearingAt.toISOString(),
        }, nowMs);
        if (open) recipients.add(row.attendingLawyerId);
      }
    }

    if (recipients.size === 0) return;
    // Content-free: the client re-reads ring-state rather than trusting a
    // payload, so a push can never disagree with the derivation.
    sendToUsers(Array.from(recipients), { type: "hearing:ring" });
  } catch (error) {
    console.error("Error in checkHearingRingWindow:", error);
  }
}

// 🚩 "لم يقم أحد بالتحضير للجلسة" — flag a session whose moment arrived with
// nobody having prepared it.
//
// WHY THE ROUTE IS NOT USED. POST /api/hearings/:id/flag is
// requireAuth + requireRole("branch_manager","admin_support"); a scheduler tick
// has no request, no session and no role, so it cannot pass either middleware.
// The write goes through storage.updateHearing directly — the same thing this
// scheduler already does for other hearing writes (reminderSent24h) — and the
// activity row through storage.logCaseActivity, which takes plain data and
// needs no `req` (unlike the route's logCaseActivityActing wrapper).
//
// flaggedBy is the literal "system": flagged_by carries NO foreign key
// (script/apply-fk-constraints.sql declares exactly one FK on `hearings`,
// hearings_case_id_fkey on case_id), and "system" is the established actor
// sentinel across this codebase (createdBy / userId / performedBy / senderId).
//
// 🔴 THE FOUR-CONDITION QUERY IS THE WHOLE DESIGN — see
// getUnpreparedHearingsForDate. `is_flagged IS NOT TRUE` is doing double duty:
// it is BOTH the never-overwrite-a-human guard (a manually flagged hearing is
// never re-flagged, so a person's reason can never be destroyed) AND the
// fire-once guard (once this job flags a hearing it stops matching, so a later
// tick cannot flag it twice). No watermark, no sent-flag column, no dedup table.
//
// ⚠ RESTART CATCH-UP IS FREE, BY CONSTRUCTION. The query asks "which of TODAY's
// hearings are past their moment, unprepared and unflagged" — it does not ask
// "which crossed their moment since the last tick". So a hearing whose time
// passed during an outage is still matched by the next tick that runs, for the
// REST OF THAT CALENDAR DAY. Only an outage spanning midnight loses one, and a
// flag is not time-critical enough to justify a watermark for that.
async function checkUnpreparedHearings() {
  try {
    const today = firmToday();
    const candidates = await storage.getUnpreparedHearingsForDate(today);
    if (candidates.length === 0) return;

    const nowMs = Date.now();
    let flagged = 0;

    for (const h of candidates) {
      // Per-hearing isolation — one bad row must never abandon the rest of the
      // sweep. Same shape as the notify blocks in checkExpiredPauses.
      try {
        // 🔴 firmDateTimeToInstant DIRECTLY, not parseHearingDateTime. The
        // wrapper substitutes 09:00 for a malformed hearing_time, which is right
        // for a coarse daily reminder and WRONG here: it would declare "nobody
        // prepared" at a moment the session never had. hearing_time is a bare
        // varchar with no format validation, so malformed values are reachable.
        //
        // UNPARSEABLE → SKIP, never flag. A flag is an accusation that lands on
        // a named session in front of the whole team; a broken time value must
        // not manufacture one. The hearing simply keeps its normal appearance.
        const instant = firmDateTimeToInstant(h.hearingDate, h.hearingTime);
        if (!instant) continue;
        // Not yet due — the session is still ahead, so nothing to report.
        if (nowMs < instant.getTime()) continue;

        const updated = await storage.updateHearing(h.id, {
          isFlagged: true,
          flagReason: UNPREPARED_FLAG_REASON,
          flaggedBy: "system",
          flaggedAt: new Date().toISOString(),
        });
        if (!updated) continue;
        flagged++;

        // Mirrors the manual route's audit row. Isolated in its own try/catch:
        // the flag is already durable by this point, and losing a timeline entry
        // is a strictly smaller failure than aborting the sweep over it.
        // Hearings have no activity log of their own, so this writes to the
        // PARENT CASE's timeline. action_type is free text — no migration.
        if (h.caseId) {
          try {
            await storage.logCaseActivity({
              caseId: h.caseId,
              userId: "system",
              userName: "النظام",
              actionType: "hearing_flagged",
              title: `تم تعليم الجلسة للانتباه — ${UNPREPARED_FLAG_REASON}`,
              details: `الجلسة بتاريخ ${h.hearingDate}${h.courtName ? ` (${h.courtName})` : ""}`,
              relatedEntityType: "hearing",
              relatedEntityId: h.id,
            });
          } catch (e) {
            console.error("[checkUnpreparedHearings] logCaseActivity failed", e);
          }
        }
      } catch (error) {
        console.error(`Error auto-flagging unprepared hearing ${h.id}:`, error);
      }
    }

    if (flagged > 0) {
      console.log(`Unprepared-hearing auto-flag: ${flagged} hearing(s) flagged.`);
    }
  } catch (error) {
    console.error("Error in checkUnpreparedHearings:", error);
  }
}

async function checkStruckOffExpiry() {
  try {
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
        // primary first, responsible as fallback — a responsible-only case used to
        // notify the department head alone, never the lawyer actually on it.
        const struckOffLawyerId = caseItem.primaryLawyerId || caseItem.responsibleLawyerId;
        if (struckOffLawyerId) notifyIds.push(struckOffLawyerId);
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

// Auto-close cases paused for a missing settlement link after 15 calendar
// days with no new session. Mirrors checkStruckOffExpiry's cleanup, but
// SILENT — no notifications, per the owner's directive. Match key is the
// exact pause_reason text written by the hearing-result handler.
const SETTLEMENT_LINK_MISSING_PAUSE_REASON = "بانتظار رابط جلسة الصلح من العميل";
// Lifted to shared/schema.ts so resolveCaseOutcome can recognise this exact
// sentence and map the timeout close to "تعذّر الصلح" on the closed-case badge.
// Aliased rather than inlined so every existing use site below stays untouched.
const SETTLEMENT_LINK_MISSING_CLOSURE_REASON = SettlementLinkMissingClosureReason;

async function checkSettlementLinkMissingTimeout() {
  try {
    const allCases = await storage.getAllCases();
    const now = new Date();
    const cutoff = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    let closed = 0;

    for (const caseItem of allCases) {
      if (caseItem.isArchived) continue;
      if ((caseItem.currentStage as string) === "مقفلة") continue;
      if ((caseItem as any).status === "مغلق") continue;
      if (!caseItem.pausedAt) continue;
      if (caseItem.pauseReason !== SETTLEMENT_LINK_MISSING_PAUSE_REASON) continue;

      const pausedAt = new Date(caseItem.pausedAt);
      if (isNaN(pausedAt.getTime()) || pausedAt.getTime() >= cutoff.getTime()) continue;

      const stageHistory = Array.isArray((caseItem as any).stageHistory) ? (caseItem as any).stageHistory : [];
      await storage.updateCase(caseItem.id, {
        currentStage: "مقفلة",
        status: "مغلق",
        closureReason: SETTLEMENT_LINK_MISSING_CLOSURE_REASON,
        closedAt: new Date().toISOString(),
        stageHistory: [
          ...stageHistory,
          { stage: "مقفلة", timestamp: new Date().toISOString(), userId: "system", userName: "النظام", notes: "إغلاق تلقائي — مر 15 يوم دون رابط جلسة الصلح" },
        ],
      } as any);

      // Cancel pending hearings, memos, field tasks (copied from checkStruckOffExpiry)
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
        console.error(`Error cleaning up entities for settlement-link-missing case ${caseItem.id}:`, e);
      }

      // SILENT — no notifications, per owner directive.
      console.log(`Settlement-link-missing auto-closure: case ${caseItem.id} closed.`);
      closed++;
    }
    if (closed > 0) {
      console.log(`Settlement-link-missing auto-closure: ${closed} cases closed.`);
    }
  } catch (error) {
    console.error("Error checking settlement-link-missing timeout:", error);
  }
}

async function recalculateCasePriorities() {
  try {
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
  } catch (error) {
    console.error("Error recalculating case priorities:", error);
  }
}
