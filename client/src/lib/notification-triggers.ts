import { apiRequest } from "@/lib/queryClient";
import { NotificationType, NotificationPriority, NotificationStatus } from "@shared/schema";
import type { NotificationTypeValue, NotificationPriorityValue, User } from "@shared/schema";

function getCurrentUser(): { id: string; name: string; role: string } | null {
  const stored = localStorage.getItem("lawfirm_user");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

let cachedUsers: User[] | null = null;
let cacheTimestamp = 0;
// 30s was causing ~1,900 /api/users calls/week across all workflow trigger actions.
// 5 minutes is plenty — the users list changes infrequently.
const CACHE_TTL = 300000;

async function getUsers(): Promise<User[]> {
  const now = Date.now();
  if (cachedUsers && now - cacheTimestamp < CACHE_TTL) {
    return cachedUsers;
  }
  try {
    const res = await apiRequest("GET", "/api/users");
    cachedUsers = await res.json();
    cacheTimestamp = now;
    return cachedUsers!;
  } catch (err) {
    console.error("Failed to fetch users for notifications:", err);
  }
  return cachedUsers || [];
}

function findUsersByRole(users: User[], role: string): User[] {
  return users.filter(u => u.role === role && u.isActive);
}

// 🔴 findDepartmentHead WAS DELETED WITH ITS TWO CALLERS — do not reinstate it.
// It resolved the head with `.find`, so a department with two active heads
// notified exactly one of them, and it compared departmentId with no
// `!!u.departmentId` guard, so a user with a NULL department matched every
// record with a NULL department. Both bugs are fixed by the SERVER-side
// resolveNotificationRecipients (server/notification-recipients.ts), which is
// where "who is this department's head" is now answered — once, for every
// producer. Anything needing that lookup belongs on the server.

async function sendNotificationDirect(
  recipientId: string,
  type: NotificationTypeValue,
  priority: NotificationPriorityValue,
  title: string,
  message: string,
  // Widened to the four entity types the triggers actually reference. It was
  // narrower than Notification.relatedType for no reason other than that no
  // caller had needed the others yet.
  relatedType: "case" | "consultation" | "contract" | "memo" | "field_task",
  relatedId: string,
  senderId?: string,
  senderName?: string,
) {
  const currentUser = getCurrentUser();
  try {
    await apiRequest("POST", "/api/notifications", {
      type,
      priority,
      status: NotificationStatus.SENT,
      title,
      message,
      senderId: senderId || currentUser?.id || "system",
      senderName: senderName || currentUser?.name || "النظام",
      recipientId,
      relatedType,
      relatedId,
      isRead: false,
      readAt: null,
      response: null,
      requiresResponse: false,
      scheduledAt: null,
      escalationLevel: 0,
      escalatedTo: null,
      autoEscalateAfterHours: 24,
    });
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}

// notifyCaseAdded / notifyConsultationAdded WERE DELETED. Both now fire from
// their server create routes (POST /api/cases, POST /api/consultations, plus a
// new one at POST /api/contracts) via notifyDepartmentHeadOfNewRecord in
// server/routes.ts. From the browser the failure was swallowed twice — inside
// sendNotificationDirect and again by the caller's `.catch(() => {})` — so a
// department head could silently never be told. Do not re-add a client copy.

export async function notifyCaseAssigned(caseId: string, caseNumber: string, lawyerId: string) {
  await sendNotificationDirect(
    lawyerId,
    NotificationType.CASE_ASSIGNED,
    NotificationPriority.HIGH,
    "تم إسناد قضية لك",
    `تم إسناد القضية رقم ${caseNumber} إليك. يرجى البدء بالعمل عليها`,
    "case",
    caseId,
  );
}

export async function notifyCaseSentToReview(caseId: string, caseNumber: string) {
  const users = await getUsers();
  const reviewHeads = findUsersByRole(users, "cases_review_head");
  for (const head of reviewHeads) {
    await sendNotificationDirect(
      head.id,
      NotificationType.SENT_TO_REVIEW,
      NotificationPriority.HIGH,
      "قضية جديدة للمراجعة",
      `تم إحالة القضية رقم ${caseNumber} للجنة المراجعة`,
      "case",
      caseId,
    );
  }
}

export async function notifyCaseReturnedForRevision(caseId: string, caseNumber: string, responsibleLawyerId: string | null, notes: string) {
  if (!responsibleLawyerId) return;
  await sendNotificationDirect(
    responsibleLawyerId,
    NotificationType.RETURNED_FOR_REVISION,
    NotificationPriority.URGENT,
    "تم إرجاع القضية للتعديلات",
    `تم إرجاع القضية رقم ${caseNumber} للتعديلات. الملاحظات: ${notes}`,
    "case",
    caseId,
  );
}

export async function notifyConsultationAssigned(consultationId: string, consultationNumber: string, assignedTo: string) {
  await sendNotificationDirect(
    assignedTo,
    NotificationType.CONSULTATION_ASSIGNED,
    NotificationPriority.HIGH,
    "تم إسناد استشارة لك",
    `تم إسناد الاستشارة رقم ${consultationNumber} إليك. يرجى البدء بالعمل عليها`,
    "consultation",
    consultationId,
  );
}

export async function notifyConsultationSentToReview(consultationId: string, consultationNumber: string) {
  const users = await getUsers();
  const reviewHeads = findUsersByRole(users, "consultations_review_head");
  for (const head of reviewHeads) {
    await sendNotificationDirect(
      head.id,
      NotificationType.SENT_TO_REVIEW,
      NotificationPriority.HIGH,
      "استشارة جديدة للمراجعة",
      `تم إحالة الاستشارة رقم ${consultationNumber} للجنة المراجعة`,
      "consultation",
      consultationId,
    );
  }
}

export async function notifyConsultationReturnedForRevision(consultationId: string, consultationNumber: string, assignedTo: string | null, notes: string) {
  if (!assignedTo) return;
  await sendNotificationDirect(
    assignedTo,
    NotificationType.RETURNED_FOR_REVISION,
    NotificationPriority.URGENT,
    "تم إرجاع الاستشارة للتعديلات",
    `تم إرجاع الاستشارة رقم ${consultationNumber} للتعديلات. الملاحظات: ${notes}`,
    "consultation",
    consultationId,
  );
}

export async function notifyFieldTaskAssigned(taskId: string, taskTitle: string, assignedTo: string) {
  await sendNotificationDirect(
    assignedTo,
    NotificationType.FIELD_TASK_ASSIGNED,
    NotificationPriority.HIGH,
    "مهمة ميدانية جديدة",
    `تم تكليفك بمهمة ميدانية جديدة: ${taskTitle}`,
    "field_task",
    taskId,
  );
}

export async function sendCaseReminder(
  caseId: string,
  caseNumber: string,
  recipientId: string,
  reminderType: string,
  message: string,
) {
  await sendNotificationDirect(
    recipientId,
    NotificationType.TASK_REMINDER,
    NotificationPriority.HIGH,
    `تذكير: ${reminderType} - قضية ${caseNumber}`,
    message,
    "case",
    caseId,
  );
}

export async function sendConsultationReminder(
  consultationId: string,
  consultationNumber: string,
  recipientId: string,
  reminderType: string,
  message: string,
) {
  await sendNotificationDirect(
    recipientId,
    NotificationType.TASK_REMINDER,
    NotificationPriority.HIGH,
    `تذكير: ${reminderType} - استشارة ${consultationNumber}`,
    message,
    "consultation",
    consultationId,
  );
}

export async function requestCaseTransfer(
  caseId: string,
  caseNumber: string,
  fromDepartmentName: string,
  toDepartmentId: string,
  toDepartmentName: string,
  reason: string,
) {
  const users = await getUsers();
  const currentUser = getCurrentUser();
  const recipients = [
    ...findUsersByRole(users, "branch_manager"),
    ...findUsersByRole(users, "cases_review_head"),
  ];
  for (const recipient of recipients) {
    try {
      await apiRequest("POST", "/api/notifications", {
        type: NotificationType.GENERAL_ALERT,
        priority: NotificationPriority.HIGH,
        status: NotificationStatus.SENT,
        title: `طلب تحويل قضية ${caseNumber} إلى ${toDepartmentName}`,
        message: `طلب تحويل القضية رقم ${caseNumber} من ${fromDepartmentName} إلى ${toDepartmentName}.\nالسبب: ${reason}\nمقدم الطلب: ${currentUser?.name || "غير معروف"}\n[DEPT_ID:${toDepartmentId}]`,
        senderId: currentUser?.id || "system",
        senderName: currentUser?.name || "النظام",
        recipientId: recipient.id,
        relatedType: "case",
        relatedId: caseId,
        isRead: false,
        readAt: null,
        response: null,
        requiresResponse: true,
        scheduledAt: null,
        escalationLevel: 0,
        escalatedTo: null,
        autoEscalateAfterHours: 24,
      });
    } catch (err) {
      console.error("Failed to send transfer request:", err);
    }
  }
}

export async function requestConsultationTransfer(
  consultationId: string,
  consultationNumber: string,
  fromDepartmentName: string,
  toDepartmentId: string,
  toDepartmentName: string,
  reason: string,
) {
  const users = await getUsers();
  const currentUser = getCurrentUser();
  const recipients = [
    ...findUsersByRole(users, "branch_manager"),
    ...findUsersByRole(users, "consultations_review_head"),
  ];
  for (const recipient of recipients) {
    try {
      await apiRequest("POST", "/api/notifications", {
        type: NotificationType.GENERAL_ALERT,
        priority: NotificationPriority.HIGH,
        status: NotificationStatus.SENT,
        title: `طلب تحويل استشارة ${consultationNumber} إلى ${toDepartmentName}`,
        message: `طلب تحويل الاستشارة رقم ${consultationNumber} من ${fromDepartmentName} إلى ${toDepartmentName}.\nالسبب: ${reason}\nمقدم الطلب: ${currentUser?.name || "غير معروف"}\n[DEPT_ID:${toDepartmentId}]`,
        senderId: currentUser?.id || "system",
        senderName: currentUser?.name || "النظام",
        recipientId: recipient.id,
        relatedType: "consultation",
        relatedId: consultationId,
        isRead: false,
        readAt: null,
        response: null,
        requiresResponse: true,
        scheduledAt: null,
        escalationLevel: 0,
        escalatedTo: null,
        autoEscalateAfterHours: 24,
      });
    } catch (err) {
      console.error("Failed to send consultation transfer request:", err);
    }
  }
}
