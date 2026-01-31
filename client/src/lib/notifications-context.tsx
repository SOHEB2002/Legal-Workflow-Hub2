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
} from "@shared/schema";
import { NotificationType, NotificationPriority, NotificationStatus, DigestMode } from "@shared/schema";

const NOTIFICATIONS_STORAGE_KEY = "lawfirm_notifications";
const TEMPLATES_STORAGE_KEY = "lawfirm_notification_templates";
const PREFERENCES_STORAGE_KEY = "lawfirm_notification_preferences";

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

const defaultPreferences: UserNotificationPreferences = {
  userId: "",
  enableSound: true,
  enableDesktop: true,
  digestMode: DigestMode.INSTANT,
  mutedTypes: [],
  quietHoursStart: null,
  quietHoursEnd: null,
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(() => getStoredNotifications());
  const [templates, setTemplates] = useState<NotificationTemplate[]>(() => getStoredTemplates());
  const [preferences, setPreferences] = useState<Record<string, UserNotificationPreferences>>(() => getStoredPreferences());
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

  return (
    <NotificationsContext.Provider value={{
      notifications,
      templates,
      preferences,
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
