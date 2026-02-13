import { apiRequest } from "@/lib/queryClient";
import { NotificationType, NotificationPriority, NotificationStatus } from "@shared/schema";
import type { NotificationTypeValue, NotificationPriorityValue, User } from "@shared/schema";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lawfirm_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

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
const CACHE_TTL = 30000;

async function getUsers(): Promise<User[]> {
  const now = Date.now();
  if (cachedUsers && now - cacheTimestamp < CACHE_TTL) {
    return cachedUsers;
  }
  try {
    const res = await fetch("/api/users", { headers: getAuthHeaders() });
    if (res.ok) {
      cachedUsers = await res.json();
      cacheTimestamp = now;
      return cachedUsers!;
    }
  } catch (err) {
    console.error("Failed to fetch users for notifications:", err);
  }
  return cachedUsers || [];
}

function findUsersByRole(users: User[], role: string): User[] {
  return users.filter(u => u.role === role && u.isActive);
}

function findDepartmentHead(users: User[], departmentId: string): User | undefined {
  return users.find(u => u.role === "department_head" && u.departmentId === departmentId && u.isActive);
}

async function sendNotificationDirect(
  recipientId: string,
  type: NotificationTypeValue,
  priority: NotificationPriorityValue,
  title: string,
  message: string,
  relatedType: "case" | "consultation" | "field_task",
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

export async function notifyCaseAdded(caseId: string, caseNumber: string, departmentId: string) {
  const users = await getUsers();
  const deptHead = findDepartmentHead(users, departmentId);
  if (deptHead) {
    await sendNotificationDirect(
      deptHead.id,
      NotificationType.CASE_ASSIGNED,
      NotificationPriority.HIGH,
      "قضية جديدة في القسم",
      `تم استلام قضية جديدة رقم ${caseNumber} وإسنادها لقسمكم`,
      "case",
      caseId,
    );
  }
}

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

export async function notifyConsultationAdded(consultationId: string, consultationNumber: string, departmentId: string) {
  const users = await getUsers();
  const deptHead = findDepartmentHead(users, departmentId);
  if (deptHead) {
    await sendNotificationDirect(
      deptHead.id,
      NotificationType.CONSULTATION_ASSIGNED,
      NotificationPriority.HIGH,
      "استشارة جديدة في القسم",
      `تم استلام استشارة جديدة رقم ${consultationNumber} وإسنادها لقسمكم`,
      "consultation",
      consultationId,
    );
  }
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
