import { apiRequest } from "@/lib/queryClient";
import { NotificationType, NotificationPriority, NotificationStatus } from "@shared/schema";
import type { NotificationTypeValue, NotificationPriorityValue } from "@shared/schema";

function getCurrentUser(): { id: string; name: string; role: string } | null {
  const stored = localStorage.getItem("lawfirm_user");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// 🔴 getUsers, its 5-minute cache (cachedUsers / cacheTimestamp / CACHE_TTL) and
// findUsersByRole WERE DELETED WITH requestCaseTransfer, their last caller.
// Every remaining trigger in this file addresses a recipient the CALLER already
// knows, so nothing here needs the roster any more; the server-side fan-outs
// that replaced these (resolveNotificationRecipients) read it from the database
// instead. Restoring a client-side roster fetch here would also restore the
// ~1,900 /api/users calls a week the cache existed to suppress.
// See the findDepartmentHead note directly below — same lesson, same file.

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

// 🔴 notifyCaseSentToReview WAS DELETED — do not re-add a client copy. It
// notified every active cases_review_head FIRM-WIDE, which was wrong for LABOR
// cases: those are chaired by labor_review_head, so the notice paged someone who
// would be 403'd if they acted and never reached the only role that could
// decide. The referral notice now fires from PATCH /api/cases/:id
// (notifyCaseSentToCommittee), in the SAME handler as the committee authority
// gate, so who-is-told and who-may-decide come from one rule and cannot drift.
// The browser copy also carried the double-swallowed failure — its own catch
// plus the caller's `.catch(() => {})`.

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

// ⚠️ notifyConsultationSentToReview / notifyConsultationReturnedForRevision were
// REMOVED here as dead code — zero callers anywhere in client/, server/,
// shared/ or script/, and none since before this session.
//
// 🔴 BUT DELETING THEM DID NOT CLOSE A GAP, IT EXPOSED ONE. Their CASE
// equivalents directly above (notifyCaseSentToReview /
// notifyCaseReturnedForRevision) are LIVE and called from three places in
// cases-context, and there is NO server-side substitute for either consultation
// event — the consultation route block contains no createNotification call at
// all. So today: referring a consultation to the review committee tells the
// consultations_review_head NOTHING, and returning one for revision tells the
// assigned lawyer NOTHING, while both case equivalents notify.
//
// That asymmetry is REPORTED, NOT BUILT — the owner decides whether
// consultations should have it. If the answer is yes, it belongs SERVER-side in
// the consultation review/return endpoints, not as a re-added client trigger:
// the browser copy is exactly the shape whose silent double-swallowed failure
// caused the create notices to be moved server-side.

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

// 🔔 THE REMINDER TRIGGERS — ONE request each, fanned out SERVER-side.
//
// These used to build a title and POST a single notification to a single
// recipient. A reminder now reaches the assignee AND the record's department
// head, and the browser cannot resolve that head: the client's own lookup was
// deleted for being wrong (`.find` returned one head when a department has two,
// and it compared departmentId with no !!guard). POST /api/reminders resolves
// the record, the assignee, the head, de-duplicates, and writes the rows.
//
// 🔴 DELIBERATELY NOT ROUTED THROUGH sendNotificationDirect. That helper
// swallows its own errors, which is right for a fire-and-forget side effect but
// wrong here: every caller shows a "تم إرسال التذكير" / "فشل إرسال التذكير"
// toast, so the rejection has to reach them. apiRequest throws; the callers
// already have try/catch around it.
//
// The TITLE is built server-side now, so the four entity types can never word it
// differently — which is why these take no caller-supplied title.
export type ReminderEntityType = "case" | "consultation" | "contract" | "memo";

async function sendReminder(
  entityType: ReminderEntityType,
  entityId: string,
  reminderType: string,
  message: string,
  recipientId?: string,
) {
  await apiRequest("POST", "/api/reminders", {
    entityType,
    entityId,
    reminderType,
    message,
    // Cases offer a manual recipient picker; when set it replaces the ASSIGNEE
    // as a candidate. It never replaces the department head.
    recipientId: recipientId || null,
  });
}

export async function sendCaseReminder(
  caseId: string,
  recipientId: string,
  reminderType: string,
  message: string,
) {
  await sendReminder("case", caseId, reminderType, message, recipientId);
}

export async function sendConsultationReminder(
  consultationId: string,
  reminderType: string,
  message: string,
) {
  await sendReminder("consultation", consultationId, reminderType, message);
}

// NEW — contracts and memos had no reminder at all. No manual recipient picker
// on either: that control exists ONLY on cases, and the asymmetry is deliberate
// (see the dialogs). Recipients are the assignee + the department head, resolved
// server-side — for a MEMO that means hopping through memos.caseId to the parent
// case, since memos carry no departmentId of their own.
export async function sendContractReminder(
  contractId: string,
  reminderType: string,
  message: string,
) {
  await sendReminder("contract", contractId, reminderType, message);
}

export async function sendMemoReminder(
  memoId: string,
  reminderType: string,
  message: string,
) {
  await sendReminder("memo", memoId, reminderType, message);
}
