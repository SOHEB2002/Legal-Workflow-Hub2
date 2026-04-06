import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type {
  Notification,
  NotificationTemplate,
  UserNotificationPreferences,
  NotificationTypeValue,
  NotificationPriorityValue,
  NotificationStatusValue,
  ResponseTypeValue,
  DigestModeValue,
  NotificationRule,
  NotificationRuleConditions,
  NotificationRuleRecipients,
} from "@shared/schema";
import { NotificationType, NotificationPriority, NotificationStatus, DigestMode } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./auth-context";

const TEMPLATES_STORAGE_KEY = "lawfirm_notification_templates";
const PREFERENCES_STORAGE_KEY = "lawfirm_notification_preferences";
const RULES_STORAGE_KEY = "lawfirm_notification_rules";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lawfirm_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

export interface WorkflowNotificationEvent {
  type: NotificationTypeValue;
  entityType: "case" | "consultation";
  entityId: string;
  entityName?: string;
  stage?: string;
  previousStage?: string;
  assignedTo?: string;
  returnCount?: number;
  returnReason?: string;
  slaPercentage?: number;
  timeRemaining?: string;
  overdueTime?: string;
  employeeId?: string;
  employeeName?: string;
  count?: number;
  additionalData?: Record<string, unknown>;
}

const defaultNotificationRules: NotificationRule[] = [
  {
    id: "rule_1",
    name: "إشعار تعيين قضية",
    triggerEvent: NotificationType.CASE_ASSIGNED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "تم تعيين قضية جديدة", message: "تم تعيينك على القضية: {entityName}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_2",
    name: "إشعار تعيين استشارة",
    triggerEvent: NotificationType.CONSULTATION_ASSIGNED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "تم تعيين استشارة جديدة", message: "تم تعيينك على الاستشارة: {entityName}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_3",
    name: "تحذير SLA",
    triggerEvent: NotificationType.SLA_WARNING,
    conditions: { slaPercentage: 80 },
    recipients: { assignedEmployee: true, departmentHead: true, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.HIGH,
    template: { title: "تحذير: اقتراب الموعد", message: "متبقي {timeRemaining} على انتهاء مدة المرحلة للقضية: {entityName}" },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 4,
  },
  {
    id: "rule_4",
    name: "تأخر SLA",
    triggerEvent: NotificationType.SLA_OVERDUE,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: true, branchManager: true, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.URGENT,
    template: { title: "تأخر عن الموعد النهائي", message: "تأخرت القضية {entityName} عن الموعد بـ {overdueTime}" },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 2,
  },
  {
    id: "rule_5",
    name: "إرجاع للتعديل",
    triggerEvent: NotificationType.RETURNED_FOR_REVISION,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.HIGH,
    template: { title: "تم إرجاع العمل للتعديل", message: "تم إرجاع {entityType}: {entityName}. السبب: {returnReason}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_6",
    name: "إرجاع ثالث - تحذير",
    triggerEvent: NotificationType.THIRD_RETURN_WARNING,
    conditions: { returnCountMin: 3 },
    recipients: { assignedEmployee: true, departmentHead: true, branchManager: true, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.URGENT,
    template: { title: "إرجاع للمرة الثالثة - تحذير", message: "تم إرجاع {entityName} للمرة الثالثة. يرجى المراجعة." },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 1,
  },
  {
    id: "rule_7",
    name: "حمل عمل مرتفع",
    triggerEvent: NotificationType.WORKLOAD_HIGH,
    conditions: {},
    recipients: { assignedEmployee: false, departmentHead: true, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "حمل عمل مرتفع", message: "الموظف {employeeName} لديه {count} قضية نشطة" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_8",
    name: "حمل عمل حرج",
    triggerEvent: NotificationType.WORKLOAD_CRITICAL,
    conditions: {},
    recipients: { assignedEmployee: false, departmentHead: true, branchManager: true, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.URGENT,
    template: { title: "حمل عمل حرج - يتطلب تدخل فوري", message: "الموظف {employeeName} لديه {count} قضية نشطة - يجب إعادة التوزيع" },
    isActive: true,
    autoEscalate: true,
    escalateAfterHours: 2,
  },
  {
    id: "rule_9",
    name: "تغيير المرحلة",
    triggerEvent: NotificationType.STAGE_CHANGED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.LOW,
    template: { title: "تغيرت المرحلة", message: "تم نقل {entityName} إلى مرحلة: {stage}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_10",
    name: "إرسال للمراجعة",
    triggerEvent: NotificationType.SENT_TO_REVIEW,
    conditions: {},
    recipients: { assignedEmployee: false, departmentHead: false, branchManager: false, reviewCommittee: true, customUserIds: [] },
    notificationPriority: NotificationPriority.MEDIUM,
    template: { title: "تم استلام عمل للمراجعة", message: "تم استلام {entityType}: {entityName} للمراجعة" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
  {
    id: "rule_11",
    name: "تكليف مهمة ميدانية",
    triggerEvent: NotificationType.FIELD_TASK_ASSIGNED,
    conditions: {},
    recipients: { assignedEmployee: true, departmentHead: false, branchManager: false, reviewCommittee: false, customUserIds: [] },
    notificationPriority: NotificationPriority.HIGH,
    template: { title: "مهمة ميدانية جديدة", message: "تم تكليفك بمهمة ميدانية جديدة: {entityName}" },
    isActive: true,
    autoEscalate: false,
    escalateAfterHours: 24,
  },
];

interface NotificationFilters {
  type?: NotificationTypeValue;
  priority?: NotificationPriorityValue;
  status?: NotificationStatusValue;
  senderId?: string;
  dateFrom?: string;
  dateTo?: string;
  isRead?: boolean;
  requiresResponse?: boolean;
}

interface NotificationsContextType {
  notifications: Notification[];
  templates: NotificationTemplate[];
  preferences: Record<string, UserNotificationPreferences>;
  rules: NotificationRule[];
  isLoading: boolean;
  refetchNotifications: () => Promise<void>;
  sendNotification: (notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo">) => Promise<Notification>;
  sendBulkNotification: (recipientIds: string[], notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">) => Promise<Notification[]>;
  scheduleNotification: (notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "escalationLevel" | "escalatedTo">, scheduledAt: string) => Promise<Notification>;
  sendToTeam: (departmentId: string, userIds: string[], notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">) => Promise<Notification[]>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  archiveOldNotifications: (daysOld: number) => void;
  getUnreadCount: (userId: string) => number;
  getMyNotifications: (userId: string, filters?: NotificationFilters) => Notification[];
  respondToNotification: (id: string, responseType: ResponseTypeValue | string, message: string) => Promise<void>;
  getNotificationResponses: (senderId: string) => Notification[];
  checkAndEscalate: () => void;
  escalateNotification: (id: string, escalateToUserId: string) => Promise<void>;
  getEscalatedNotifications: (userId: string) => Notification[];
  getUserPreferences: (userId: string) => UserNotificationPreferences;
  updateUserPreferences: (userId: string, prefs: Partial<UserNotificationPreferences>) => void;
  getTemplates: () => NotificationTemplate[];
  addTemplate: (template: Omit<NotificationTemplate, "id">) => NotificationTemplate;
  updateTemplate: (id: string, template: Partial<NotificationTemplate>) => void;
  deleteTemplate: (id: string) => void;
  getUrgentCount: (userId: string) => number;
  hasNewNotifications: boolean;
  setHasNewNotifications: (value: boolean) => void;
  triggerWorkflowNotification: (event: WorkflowNotificationEvent, recipientIds: string[]) => void;
  getNotificationRules: () => NotificationRule[];
  updateNotificationRule: (id: string, rule: Partial<NotificationRule>) => void;
  toggleRuleActive: (id: string) => void;
  addNotificationRule: (rule: Omit<NotificationRule, "id">) => NotificationRule;
  deleteNotificationRule: (id: string) => void;
  getWorkflowNotifications: (entityId: string) => Notification[];
  getNotificationStats: () => { total: number; unread: number; urgent: number; byType: Record<string, number> };
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const defaultTemplates: NotificationTemplate[] = [
  {
    id: "1",
    name: "تنبيه تأخر",
    title: "تنبيه تأخر في الإنجاز",
    message: "يرجى الإسراع في إنجاز {caseName}",
    type: NotificationType.CASE_DELAY,
    priority: NotificationPriority.HIGH,
  },
  {
    id: "2",
    name: "تذكير موعد جلسة",
    title: "تذكير بموعد الجلسة",
    message: "تذكير: موعد الجلسة {deadline}",
    type: NotificationType.DEADLINE_WARNING,
    priority: NotificationPriority.URGENT,
  },
  {
    id: "3",
    name: "مطلوب تحديث حالة",
    title: "مطلوب تحديث حالة القضية",
    message: "مطلوب: تحديث حالة القضية رقم {consultationNumber}",
    type: NotificationType.RESPONSE_REQUEST,
    priority: NotificationPriority.MEDIUM,
  },
  {
    id: "4",
    name: "مراجعة عاجلة",
    title: "مراجعة مستند عاجلة",
    message: "عاجل: مراجعة مستند قبل {deadline}",
    type: NotificationType.DEADLINE_WARNING,
    priority: NotificationPriority.URGENT,
  },
  {
    id: "5",
    name: "إسناد مهمة جديدة",
    title: "تم إسناد مهمة جديدة",
    message: "تم إسناد مهمة جديدة إليك: {caseName}",
    type: NotificationType.ASSIGNMENT,
    priority: NotificationPriority.MEDIUM,
  },
];

function getStoredTemplates(): NotificationTemplate[] {
  const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
  return stored ? JSON.parse(stored) : defaultTemplates;
}

function getStoredPreferences(): Record<string, UserNotificationPreferences> {
  const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

function getStoredRules(): NotificationRule[] {
  const stored = localStorage.getItem(RULES_STORAGE_KEY);
  return stored ? JSON.parse(stored) : defaultNotificationRules;
}

const defaultPreferences: UserNotificationPreferences = {
  userId: "",
  enableSound: true,
  enableDesktop: true,
  digestMode: DigestMode.INSTANT,
  mutedTypes: [],
  quietHoursStart: null,
  quietHoursEnd: null,
  notifyOnAssignment: true,
  notifyOnStageChange: true,
  notifyOnReviewNotes: true,
  notifyOnReturn: true,
  notifyOnSlaWarning: true,
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>(() => getStoredTemplates());
  const [preferences, setPreferences] = useState<Record<string, UserNotificationPreferences>>(() => getStoredPreferences());
  const [rules, setRules] = useState<NotificationRule[]>(() => getStoredRules());
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCountRef = useRef<number>(0);

  const fetchNotifications = useCallback(async () => {
    const authToken = localStorage.getItem("lawfirm_token");
    if (!authToken) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/notifications", {
        credentials: "include",
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const prevCount = prevCountRef.current;
        setNotifications(data);
        if (prevCount > 0 && data.length > prevCount) {
          setHasNewNotifications(true);
        }
        prevCountRef.current = data.length;
      }
    } catch (err) {
      // fetch notifications failed silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refetchNotifications = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    prevCountRef.current = 0;
    if (user) {
      fetchNotifications();

      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      pollingRef.current = setInterval(() => {
        fetchNotifications();
      }, 15000);
    } else {
      setNotifications([]);
      setIsLoading(false);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [user, fetchNotifications]);

  useEffect(() => {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  const sendNotification = useCallback(async (
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo">
  ): Promise<Notification> => {
    const res = await apiRequest("POST", "/api/notifications", {
      ...notificationData,
      status: notificationData.scheduledAt ? NotificationStatus.PENDING : NotificationStatus.SENT,
      isRead: false,
      readAt: null,
      response: null,
      escalationLevel: 0,
      escalatedTo: null,
    });
    const newNotification = await res.json();
    await refetchNotifications();
    setHasNewNotifications(true);
    return newNotification;
  }, [refetchNotifications]);

  const sendBulkNotification = useCallback(async (
    recipientIds: string[],
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">
  ): Promise<Notification[]> => {
    const promises = recipientIds.map(async (recipientId) => {
      try {
        const res = await apiRequest("POST", "/api/notifications", {
          ...notificationData,
          recipientId,
          status: NotificationStatus.SENT,
          isRead: false,
          readAt: null,
          response: null,
          escalationLevel: 0,
          escalatedTo: null,
        });
        return await res.json();
      } catch (err) {
        // send notification failed silently
        return null;
      }
    });
    const results = (await Promise.all(promises)).filter(Boolean) as Notification[];
    await refetchNotifications();
    setHasNewNotifications(true);
    return results;
  }, [refetchNotifications]);

  const scheduleNotification = useCallback(async (
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "escalationLevel" | "escalatedTo">,
    scheduledAt: string
  ): Promise<Notification> => {
    const res = await apiRequest("POST", "/api/notifications", {
      ...notificationData,
      status: NotificationStatus.PENDING,
      scheduledAt,
      isRead: false,
      readAt: null,
      response: null,
      escalationLevel: 0,
      escalatedTo: null,
    });
    const newNotification = await res.json();
    await refetchNotifications();
    return newNotification;
  }, [refetchNotifications]);

  const sendToTeam = useCallback(async (
    _departmentId: string,
    userIds: string[],
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">
  ): Promise<Notification[]> => {
    return sendBulkNotification(userIds, notificationData);
  }, [sendBulkNotification]);

  const markAsRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    try {
      await apiRequest("PATCH", `/api/notifications/${id}`, {
        isRead: true,
        readAt: now,
        status: NotificationStatus.READ,
      });
      await refetchNotifications();
    } catch (err) {
      // mark as read failed silently
    }
  }, [refetchNotifications]);

  const markAllAsRead = useCallback(async (_userId: string) => {
    try {
      await apiRequest("POST", "/api/notifications/mark-all-read", {});
      await refetchNotifications();
    } catch (err) {
      // mark all as read failed silently
    }
  }, [refetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/notifications/${id}`);
      await refetchNotifications();
    } catch (err) {
      // delete notification failed silently
    }
  }, [refetchNotifications]);

  const archiveOldNotifications = useCallback((daysOld: number) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffStr = cutoffDate.toISOString();
    
    const toArchive = notifications.filter(
      n => n.createdAt < cutoffStr && n.status !== NotificationStatus.ARCHIVED
    );
    toArchive.forEach(n => {
      apiRequest("PATCH", `/api/notifications/${n.id}`, {
        status: NotificationStatus.ARCHIVED,
      }).catch(() => {});
    });
    refetchNotifications();
  }, [notifications, refetchNotifications]);

  const getUnreadCount = useCallback((userId: string): number => {
    return notifications.filter(n => n.recipientId === userId && !n.isRead && n.status !== NotificationStatus.ARCHIVED).length;
  }, [notifications]);

  const getUrgentCount = useCallback((userId: string): number => {
    return notifications.filter(n => 
      n.recipientId === userId && 
      !n.isRead && 
      n.priority === NotificationPriority.URGENT &&
      n.status !== NotificationStatus.ARCHIVED
    ).length;
  }, [notifications]);

  const getMyNotifications = useCallback((userId: string, filters?: NotificationFilters): Notification[] => {
    let result = notifications.filter(n => n.recipientId === userId || n.escalatedTo === userId);
    
    if (filters) {
      if (filters.type) result = result.filter(n => n.type === filters.type);
      if (filters.priority) result = result.filter(n => n.priority === filters.priority);
      if (filters.status) result = result.filter(n => n.status === filters.status);
      if (filters.senderId) result = result.filter(n => n.senderId === filters.senderId);
      if (filters.dateFrom) result = result.filter(n => n.createdAt >= filters.dateFrom!);
      if (filters.dateTo) result = result.filter(n => n.createdAt <= filters.dateTo!);
      if (filters.isRead !== undefined) result = result.filter(n => n.isRead === filters.isRead);
      if (filters.requiresResponse !== undefined) result = result.filter(n => n.requiresResponse === filters.requiresResponse);
    }
    
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications]);

  const respondToNotification = useCallback(async (id: string, responseType: ResponseTypeValue | string, message: string) => {
    try {
      const notification = notifications.find(n => n.id === id);
      await apiRequest("PATCH", `/api/notifications/${id}`, {
        response: {
          type: responseType,
          message,
          respondedAt: new Date().toISOString(),
          responderId: user?.id || "",
          responderName: user?.name || "",
        },
        status: NotificationStatus.RESPONDED,
      });

      if (notification && notification.title?.includes("طلب تحويل") && notification.relatedId) {
        const isCase = notification.title.includes("قضية");
        const toDeptMatch = notification.title.match(/إلى (.+)$/);
        const toDeptName = toDeptMatch ? toDeptMatch[1] : "";
        const deptIdMatch = notification.message?.match(/\[DEPT_ID:(.+?)\]/);
        const toDeptId = deptIdMatch ? deptIdMatch[1] : "";
        const entityName = isCase ? "القضية" : "الاستشارة";
        const relatedType = isCase ? "case" : "consultation";
        
        if (responseType === "approve") {
          if (!toDeptId) {
            throw new Error("تعذّر تحديد القسم المستهدف للتحويل - يرجى المحاولة مجدداً");
          }
          const endpoint = isCase ? `/api/cases/${notification.relatedId}` : `/api/consultations/${notification.relatedId}`;
          await apiRequest("PATCH", endpoint, { departmentId: toDeptId });
        }

        const senderId = notification.senderId;
        if (senderId) {
          const isApproval = responseType === "approve";
          try {
            await apiRequest("POST", "/api/notifications", {
              type: NotificationType.GENERAL_ALERT,
              priority: NotificationPriority.MEDIUM,
              status: NotificationStatus.SENT,
              title: isApproval ? `تمت الموافقة على طلب التحويل` : `تم رفض طلب التحويل`,
              message: isApproval
                ? `تمت الموافقة على طلب تحويل ${entityName} إلى ${toDeptName}. ${message ? "ملاحظة: " + message : ""}`
                : `تم رفض طلب تحويل ${entityName} إلى ${toDeptName}. ${message ? "السبب: " + message : ""}`,
              senderId: user?.id || "system",
              senderName: user?.name || "النظام",
              recipientId: senderId,
              relatedType,
              relatedId: notification.relatedId,
              isRead: false,
              readAt: null,
              response: null,
              requiresResponse: false,
              scheduledAt: null,
              escalationLevel: 0,
              escalatedTo: null,
              autoEscalateAfterHours: 0,
            });
          } catch {}
        }
      } else if (notification && notification.senderId && notification.senderId !== user?.id) {
        try {
          const responseLabel = responseType === "approve" ? "موافقة" 
            : responseType === "reject" ? "رفض"
            : responseType === "in_progress" ? "قيد التنفيذ"
            : "رد";
          await apiRequest("POST", "/api/notifications", {
            type: NotificationType.GENERAL_ALERT,
            priority: NotificationPriority.MEDIUM,
            status: NotificationStatus.SENT,
            title: `رد على إشعارك: ${notification.title || ""}`,
            message: `قام ${user?.name || "مستخدم"} بالرد (${responseLabel}) على إشعارك "${notification.title || ""}". ${message ? "الرد: " + message : ""}`,
            senderId: user?.id || "system",
            senderName: user?.name || "النظام",
            recipientId: notification.senderId,
            relatedType: notification.relatedType || null,
            relatedId: notification.relatedId || null,
            isRead: false,
            readAt: null,
            response: null,
            requiresResponse: false,
            scheduledAt: null,
            escalationLevel: 0,
            escalatedTo: null,
            autoEscalateAfterHours: 0,
          });
        } catch {}
      }

      await refetchNotifications();
    } catch (err) {
      // respond to notification failed silently
    }
  }, [refetchNotifications, user, notifications]);

  const getNotificationResponses = useCallback((senderId: string): Notification[] => {
    return notifications.filter(n => n.senderId === senderId && n.response !== null);
  }, [notifications]);

  const checkAndEscalate = useCallback(() => {
    const now = new Date();
    const toEscalate = notifications.filter(n => {
      if (n.status === NotificationStatus.SENT && !n.isRead && n.autoEscalateAfterHours > 0) {
        const createdAt = new Date(n.createdAt);
        const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        return hoursDiff >= n.autoEscalateAfterHours;
      }
      return false;
    });
    toEscalate.forEach(n => {
      apiRequest("PATCH", `/api/notifications/${n.id}`, {
        status: NotificationStatus.ESCALATED,
        escalationLevel: n.escalationLevel + 1,
      }).catch(() => {});
    });
    if (toEscalate.length > 0) {
      refetchNotifications();
    }
  }, [notifications, refetchNotifications]);

  const escalateNotification = useCallback(async (id: string, escalateToUserId: string) => {
    const notification = notifications.find(n => n.id === id);
    try {
      await apiRequest("PATCH", `/api/notifications/${id}`, {
        status: NotificationStatus.ESCALATED,
        escalatedTo: escalateToUserId,
        escalationLevel: (notification?.escalationLevel || 0) + 1,
      });
      await refetchNotifications();
    } catch (err) {
      // escalate notification failed silently
    }
  }, [notifications, refetchNotifications]);

  const getEscalatedNotifications = useCallback((userId: string): Notification[] => {
    return notifications.filter(n => 
      (n.recipientId === userId || n.escalatedTo === userId) && 
      n.status === NotificationStatus.ESCALATED
    );
  }, [notifications]);

  const getUserPreferences = useCallback((userId: string): UserNotificationPreferences => {
    return preferences[userId] || { ...defaultPreferences, userId };
  }, [preferences]);

  const updateUserPreferences = useCallback((userId: string, prefs: Partial<UserNotificationPreferences>) => {
    setPreferences(prev => ({
      ...prev,
      [userId]: { ...prev[userId] || { ...defaultPreferences, userId }, ...prefs, userId }
    }));
  }, []);

  const getTemplates = useCallback((): NotificationTemplate[] => {
    return templates;
  }, [templates]);

  const addTemplate = useCallback((templateData: Omit<NotificationTemplate, "id">): NotificationTemplate => {
    const newTemplate: NotificationTemplate = {
      ...templateData,
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  }, []);

  const updateTemplate = useCallback((id: string, templateData: Partial<NotificationTemplate>) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...templateData } : t));
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  const shouldNotifyUser = useCallback((userId: string, eventType: NotificationTypeValue): boolean => {
    const userPrefs = preferences[userId] || defaultPreferences;
    
    switch (eventType) {
      case NotificationType.CASE_ASSIGNED:
      case NotificationType.CONSULTATION_ASSIGNED:
        return userPrefs.notifyOnAssignment !== false;
      case NotificationType.STAGE_CHANGED:
        return userPrefs.notifyOnStageChange !== false;
      case NotificationType.SENT_TO_REVIEW:
      case NotificationType.REVIEW_NOTES_ADDED:
        return userPrefs.notifyOnReviewNotes !== false;
      case NotificationType.RETURNED_FOR_REVISION:
      case NotificationType.THIRD_RETURN_WARNING:
        return userPrefs.notifyOnReturn !== false;
      case NotificationType.SLA_WARNING:
      case NotificationType.SLA_OVERDUE:
        return userPrefs.notifyOnSlaWarning !== false;
      default:
        return true;
    }
  }, [preferences]);

  const triggerWorkflowNotification = useCallback((
    event: WorkflowNotificationEvent,
    recipientIds: string[]
  ) => {
    const matchingRules = rules.filter(r => r.isActive && r.triggerEvent === event.type);
    
    matchingRules.forEach(rule => {
      let title = rule.template.title;
      let message = rule.template.message;
      
      const replacements: Record<string, string> = {
        "{entityName}": event.entityName || "",
        "{entityType}": event.entityType === "case" ? "قضية" : "استشارة",
        "{stage}": event.stage || "",
        "{previousStage}": event.previousStage || "",
        "{returnReason}": event.returnReason || "",
        "{timeRemaining}": event.timeRemaining || "",
        "{overdueTime}": event.overdueTime || "",
        "{employeeName}": event.employeeName || "",
        "{count}": String(event.count || 0),
      };
      
      Object.entries(replacements).forEach(([key, value]) => {
        title = title.replace(key, value);
        message = message.replace(key, value);
      });
      
      const filteredRecipients = recipientIds.filter(id => shouldNotifyUser(id, event.type));
      
      if (filteredRecipients.length === 0) return;
      
      const postPromises = filteredRecipients.map(recipientId =>
        apiRequest("POST", "/api/notifications", {
          type: event.type,
          priority: rule.notificationPriority,
          status: NotificationStatus.SENT,
          title,
          message,
          senderId: null,
          senderName: null,
          isAutomatic: true,
          recipientId,
          relatedType: event.entityType,
          relatedId: event.entityId,
          relatedStage: event.stage || null,
          workflowTriggerId: `trigger_${Date.now()}`,
          isRead: false,
          readAt: null,
          response: null,
          requiresResponse: false,
          scheduledAt: null,
          escalationLevel: 0,
          escalatedTo: null,
          autoEscalateAfterHours: rule.autoEscalate ? rule.escalateAfterHours : 0,
        }).catch(() => {})
      );
      
      Promise.all(postPromises).then(() => {
        refetchNotifications();
        setHasNewNotifications(true);
      });
    });
  }, [rules, shouldNotifyUser, refetchNotifications]);

  const getNotificationRules = useCallback((): NotificationRule[] => {
    return rules;
  }, [rules]);

  const updateNotificationRule = useCallback((id: string, ruleData: Partial<NotificationRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...ruleData } : r));
  }, []);

  const toggleRuleActive = useCallback((id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  }, []);

  const addNotificationRule = useCallback((ruleData: Omit<NotificationRule, "id">): NotificationRule => {
    const newRule: NotificationRule = {
      ...ruleData,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setRules(prev => [...prev, newRule]);
    return newRule;
  }, []);

  const deleteNotificationRule = useCallback((id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  }, []);

  const getWorkflowNotifications = useCallback((entityId: string): Notification[] => {
    return notifications.filter(n => n.relatedId === entityId && n.isAutomatic);
  }, [notifications]);

  const getNotificationStats = useCallback(() => {
    const total = notifications.length;
    const unread = notifications.filter(n => !n.isRead).length;
    const urgent = notifications.filter(n => n.priority === NotificationPriority.URGENT && !n.isRead).length;
    const byType: Record<string, number> = {};
    notifications.forEach(n => {
      byType[n.type] = (byType[n.type] || 0) + 1;
    });
    return { total, unread, urgent, byType };
  }, [notifications]);

  return (
    <NotificationsContext.Provider value={{
      notifications,
      templates,
      preferences,
      rules,
      isLoading,
      refetchNotifications,
      sendNotification,
      sendBulkNotification,
      scheduleNotification,
      sendToTeam,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      archiveOldNotifications,
      getUnreadCount,
      getMyNotifications,
      respondToNotification,
      getNotificationResponses,
      checkAndEscalate,
      escalateNotification,
      getEscalatedNotifications,
      getUserPreferences,
      updateUserPreferences,
      getTemplates,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      getUrgentCount,
      hasNewNotifications,
      setHasNewNotifications,
      triggerWorkflowNotification,
      getNotificationRules,
      updateNotificationRule,
      toggleRuleActive,
      addNotificationRule,
      deleteNotificationRule,
      getWorkflowNotifications,
      getNotificationStats,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
