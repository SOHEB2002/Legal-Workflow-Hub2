import { createContext, useContext, useState, useEffect, useCallback } from "react";
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

const NOTIFICATIONS_STORAGE_KEY = "lawfirm_notifications";
const TEMPLATES_STORAGE_KEY = "lawfirm_notification_templates";
const PREFERENCES_STORAGE_KEY = "lawfirm_notification_preferences";
const RULES_STORAGE_KEY = "lawfirm_notification_rules";

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
  sendNotification: (notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo">) => Notification;
  sendBulkNotification: (recipientIds: string[], notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">) => Notification[];
  scheduleNotification: (notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "escalationLevel" | "escalatedTo">, scheduledAt: string) => Notification;
  sendToTeam: (departmentId: string, userIds: string[], notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">) => Notification[];
  markAsRead: (id: string) => void;
  markAllAsRead: (userId: string) => void;
  deleteNotification: (id: string) => void;
  archiveOldNotifications: (daysOld: number) => void;
  getUnreadCount: (userId: string) => number;
  getMyNotifications: (userId: string, filters?: NotificationFilters) => Notification[];
  respondToNotification: (id: string, responseType: ResponseTypeValue, message: string) => void;
  getNotificationResponses: (senderId: string) => Notification[];
  checkAndEscalate: () => void;
  escalateNotification: (id: string, escalateToUserId: string) => void;
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

function getStoredNotifications(): Notification[] {
  const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

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
  const [notifications, setNotifications] = useState<Notification[]>(() => getStoredNotifications());
  const [templates, setTemplates] = useState<NotificationTemplate[]>(() => getStoredTemplates());
  const [preferences, setPreferences] = useState<Record<string, UserNotificationPreferences>>(() => getStoredPreferences());
  const [rules, setRules] = useState<NotificationRule[]>(() => getStoredRules());
  const [hasNewNotifications, setHasNewNotifications] = useState(false);

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  const sendNotification = useCallback((
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo">
  ): Notification => {
    const now = new Date().toISOString();
    const newNotification: Notification = {
      ...notificationData,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: notificationData.scheduledAt ? NotificationStatus.PENDING : NotificationStatus.SENT,
      isRead: false,
      readAt: null,
      response: null,
      escalationLevel: 0,
      escalatedTo: null,
      createdAt: now,
      updatedAt: now,
    };
    setNotifications(prev => [newNotification, ...prev]);
    setHasNewNotifications(true);
    return newNotification;
  }, []);

  const sendBulkNotification = useCallback((
    recipientIds: string[],
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">
  ): Notification[] => {
    const now = new Date().toISOString();
    const newNotifications: Notification[] = recipientIds.map(recipientId => ({
      ...notificationData,
      recipientId,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: NotificationStatus.SENT as NotificationStatusValue,
      isRead: false,
      readAt: null,
      response: null,
      escalationLevel: 0,
      escalatedTo: null,
      createdAt: now,
      updatedAt: now,
    }));
    setNotifications(prev => [...newNotifications, ...prev]);
    setHasNewNotifications(true);
    return newNotifications;
  }, []);

  const scheduleNotification = useCallback((
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "escalationLevel" | "escalatedTo">,
    scheduledAt: string
  ): Notification => {
    const now = new Date().toISOString();
    const newNotification: Notification = {
      ...notificationData,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: NotificationStatus.PENDING,
      scheduledAt,
      isRead: false,
      readAt: null,
      response: null,
      escalationLevel: 0,
      escalatedTo: null,
      createdAt: now,
      updatedAt: now,
    };
    setNotifications(prev => [newNotification, ...prev]);
    return newNotification;
  }, []);

  const sendToTeam = useCallback((
    _departmentId: string,
    userIds: string[],
    notificationData: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo" | "recipientId">
  ): Notification[] => {
    return sendBulkNotification(userIds, notificationData);
  }, [sendBulkNotification]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString(), status: NotificationStatus.READ as NotificationStatusValue, updatedAt: new Date().toISOString() } : n
    ));
  }, []);

  const markAllAsRead = useCallback((userId: string) => {
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => 
      n.recipientId === userId && !n.isRead 
        ? { ...n, isRead: true, readAt: now, status: NotificationStatus.READ as NotificationStatusValue, updatedAt: now } 
        : n
    ));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const archiveOldNotifications = useCallback((daysOld: number) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffStr = cutoffDate.toISOString();
    
    setNotifications(prev => prev.map(n => 
      n.createdAt < cutoffStr && n.status !== NotificationStatus.ARCHIVED
        ? { ...n, status: NotificationStatus.ARCHIVED as NotificationStatusValue, updatedAt: new Date().toISOString() }
        : n
    ));
  }, []);

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

  const respondToNotification = useCallback((id: string, responseType: ResponseTypeValue, message: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? {
        ...n,
        response: { type: responseType, message, respondedAt: new Date().toISOString() },
        status: NotificationStatus.RESPONDED as NotificationStatusValue,
        updatedAt: new Date().toISOString()
      } : n
    ));
  }, []);

  const getNotificationResponses = useCallback((senderId: string): Notification[] => {
    return notifications.filter(n => n.senderId === senderId && n.response !== null);
  }, [notifications]);

  const checkAndEscalate = useCallback(() => {
    const now = new Date();
    setNotifications(prev => prev.map(n => {
      if (n.status === NotificationStatus.SENT && !n.isRead && n.autoEscalateAfterHours > 0) {
        const createdAt = new Date(n.createdAt);
        const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursDiff >= n.autoEscalateAfterHours) {
          return {
            ...n,
            status: NotificationStatus.ESCALATED as NotificationStatusValue,
            escalationLevel: n.escalationLevel + 1,
            updatedAt: now.toISOString()
          };
        }
      }
      return n;
    }));
  }, []);

  const escalateNotification = useCallback((id: string, escalateToUserId: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? {
        ...n,
        status: NotificationStatus.ESCALATED as NotificationStatusValue,
        escalatedTo: escalateToUserId,
        escalationLevel: n.escalationLevel + 1,
        updatedAt: new Date().toISOString()
      } : n
    ));
  }, []);

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
      case NotificationType.REVIEW_NOTES:
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
      
      const now = new Date().toISOString();
      const newNotifications: Notification[] = filteredRecipients.map(recipientId => ({
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: event.type,
        priority: rule.notificationPriority,
        status: NotificationStatus.SENT as NotificationStatusValue,
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
        createdAt: now,
        updatedAt: now,
      }));
      
      setNotifications(prev => [...newNotifications, ...prev]);
      setHasNewNotifications(true);
    });
  }, [rules, shouldNotifyUser]);

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
