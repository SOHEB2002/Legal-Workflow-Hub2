import type { LawCase, Consultation, FieldTask, Hearing, Notification } from "@shared/schema";
import { NotificationType, NotificationPriority, FieldTaskStatus, ConsultationStatus } from "@shared/schema";

interface AutoNotificationContext {
  sendNotification: (notification: Omit<Notification, "id" | "createdAt" | "updatedAt" | "isRead" | "readAt" | "response" | "status" | "escalationLevel" | "escalatedTo">) => Promise<Notification> | void;
  checkAndEscalate: () => void;
  notifications: Notification[];
}

export function checkHearingReminders(
  hearings: Hearing[],
  cases: LawCase[],
  context: AutoNotificationContext,
  systemUserId: string
): void {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  hearings.forEach(hearing => {
    const hearingDate = new Date(hearing.hearingDate);
    const relatedCase = cases.find(c => c.id === hearing.caseId);
    
    if (hearingDate > now && hearingDate <= tomorrow && relatedCase?.responsibleLawyerId) {
      const existingNotification = context.notifications.find(
        n => n.relatedType === "case" && 
             n.relatedId === hearing.caseId && 
             n.type === NotificationType.DEADLINE_WARNING &&
             new Date(n.createdAt).toDateString() === now.toDateString()
      );

      if (!existingNotification) {
        context.sendNotification({
          type: NotificationType.DEADLINE_WARNING,
          priority: NotificationPriority.URGENT,
          title: "تذكير بموعد الجلسة",
          message: `تذكير: موعد الجلسة غداً في ${hearing.courtName}`,
          senderId: systemUserId,
          senderName: "النظام",
          recipientId: relatedCase.responsibleLawyerId,
          relatedType: "case",
          relatedId: hearing.caseId,
          requiresResponse: false,
          scheduledAt: null,
          autoEscalateAfterHours: 0,
          isAutomatic: true,
          relatedStage: null,
          workflowTriggerId: null,
        });
      }
    }
  });
}

export function checkOverdueTasks(
  tasks: FieldTask[],
  context: AutoNotificationContext,
  systemUserId: string
): void {
  const now = new Date();

  tasks.forEach(task => {
    if (task.status === FieldTaskStatus.PENDING || task.status === FieldTaskStatus.IN_PROGRESS) {
      const dueDate = new Date(task.dueDate);
      
      if (dueDate < now) {
        const existingNotification = context.notifications.find(
          n => n.relatedType === "task" && 
               n.relatedId === task.id && 
               n.type === NotificationType.TASK_REMINDER &&
               new Date(n.createdAt).toDateString() === now.toDateString()
        );

        if (!existingNotification) {
          context.sendNotification({
            type: NotificationType.TASK_REMINDER,
            priority: NotificationPriority.HIGH,
            title: "مهمة متأخرة",
            message: `المهمة "${task.title}" تجاوزت الموعد المحدد`,
            senderId: systemUserId,
            senderName: "النظام",
            recipientId: task.assignedTo,
            relatedType: "task",
            relatedId: task.id,
            requiresResponse: true,
            scheduledAt: null,
            autoEscalateAfterHours: 24,
            isAutomatic: true,
            relatedStage: null,
            workflowTriggerId: null,
          });
        }
      }
    }
  });
}

export function checkStaleCases(
  cases: LawCase[],
  context: AutoNotificationContext,
  systemUserId: string,
  staleDays: number = 7
): void {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

  cases.forEach(lawCase => {
    if ((lawCase.status as string) !== "مقفلة") {
      const lastUpdate = new Date(lawCase.updatedAt);
      
      if (lastUpdate < staleThreshold) {
        const lastWeekNotification = context.notifications.find(
          n => n.relatedType === "case" && 
               n.relatedId === lawCase.id && 
               n.type === NotificationType.CASE_DELAY &&
               new Date(n.createdAt) > staleThreshold
        );

        if (!lastWeekNotification && lawCase.responsibleLawyerId) {
          context.sendNotification({
            type: NotificationType.CASE_DELAY,
            priority: NotificationPriority.MEDIUM,
            title: "قضية متوقفة",
            message: `القضية رقم ${lawCase.caseNumber} لم يتم تحديثها منذ أكثر من ${staleDays} أيام`,
            senderId: systemUserId,
            senderName: "النظام",
            recipientId: lawCase.responsibleLawyerId,
            relatedType: "case",
            relatedId: lawCase.id,
            requiresResponse: true,
            scheduledAt: null,
            autoEscalateAfterHours: 48,
            isAutomatic: true,
            relatedStage: null,
            workflowTriggerId: null,
          });
        }
      }
    }
  });
}

export function checkStaleConsultations(
  consultations: Consultation[],
  context: AutoNotificationContext,
  systemUserId: string,
  staleDays: number = 5
): void {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

  consultations.forEach(consultation => {
    if (consultation.status !== ConsultationStatus.DELIVERED && consultation.status !== ConsultationStatus.CLOSED) {
      const lastUpdate = new Date(consultation.updatedAt);
      
      if (lastUpdate < staleThreshold) {
        const lastWeekNotification = context.notifications.find(
          n => n.relatedType === "consultation" && 
               n.relatedId === consultation.id && 
               n.type === NotificationType.CONSULTATION_DELAY &&
               new Date(n.createdAt) > staleThreshold
        );

        if (!lastWeekNotification && consultation.assignedTo) {
          context.sendNotification({
            type: NotificationType.CONSULTATION_DELAY,
            priority: NotificationPriority.MEDIUM,
            title: "استشارة متأخرة",
            message: `الاستشارة رقم ${consultation.consultationNumber} لم يتم تحديثها منذ أكثر من ${staleDays} أيام`,
            senderId: systemUserId,
            senderName: "النظام",
            recipientId: consultation.assignedTo,
            relatedType: "consultation",
            relatedId: consultation.id,
            requiresResponse: true,
            scheduledAt: null,
            autoEscalateAfterHours: 24,
            isAutomatic: true,
            relatedStage: null,
            workflowTriggerId: null,
          });
        }
      }
    }
  });
}

export function runAutoEscalation(context: AutoNotificationContext): void {
  context.checkAndEscalate();
}

export function sendScheduledNotifications(context: AutoNotificationContext): void {
  const now = new Date();
  
  context.notifications.forEach(notification => {
    if (notification.status === "pending" && notification.scheduledAt) {
      const scheduledTime = new Date(notification.scheduledAt);
      if (scheduledTime <= now) {
      }
    }
  });
}
