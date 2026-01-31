import { useMemo, useState } from "react";
import { format, isWithinInterval, addDays, startOfDay, endOfDay, startOfMonth, isToday } from "date-fns";
import { ar } from "date-fns/locale";
import { useLocation } from "wouter";
import {
  Briefcase,
  Clock,
  CheckCircle,
  FileText,
  AlertTriangle,
  Calendar,
  MessageSquare,
  Settings,
  UserPlus,
  Phone,
  Plus,
  Users,
  CalendarPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCardWidget, ListWidget, QuickActionsWidget, widgetIcons, widgetVariants } from "@/components/dashboard-widgets";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useHearings } from "@/lib/hearings-context";
import { useClients } from "@/lib/clients-context";
import { useFieldTasks } from "@/lib/field-tasks-context";
import { useAuth } from "@/lib/auth-context";
import { useDashboard } from "@/lib/dashboard-context";
import { CaseStatus, CaseStatusLabels, CaseStageLabels } from "@shared/schema";

export default function DashboardPage() {
  const { cases, getActiveCases, getReviewCases, getReadyCases } = useCases();
  const { consultations, getActiveConsultations, getReviewConsultations } = useConsultations();
  const { hearings, getUpcomingHearings } = useHearings();
  const { clients, getClientName } = useClients();
  const { fieldTasks } = useFieldTasks();
  const { user } = useAuth();
  const { widgets } = useDashboard();
  const [, setLocation] = useLocation();

  const caseStats = useMemo(() => {
    const activeCases = getActiveCases();
    const reviewCases = getReviewCases();
    const readyCases = getReadyCases();
    const closedCases = cases.filter((c) => c.status === CaseStatus.CLOSED);
    return {
      active: activeCases.length,
      review: reviewCases.length,
      ready: readyCases.length,
      closed: closedCases.length,
    };
  }, [cases, getActiveCases, getReviewCases, getReadyCases]);

  const consultationStats = useMemo(() => {
    const active = getActiveConsultations();
    const review = getReviewConsultations();
    return { active: active.length, review: review.length };
  }, [getActiveConsultations, getReviewConsultations]);

  const todayHearings = useMemo(() => {
    const today = new Date();
    return hearings.filter(h => isToday(new Date(h.hearingDate)));
  }, [hearings]);

  const newClientsThisMonth = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    return clients.filter(c => new Date(c.createdAt) >= monthStart).length;
  }, [clients]);

  const pendingFieldTasks = useMemo(() => {
    return fieldTasks.filter(t => t.status === "قيد_الانتظار" || t.status === "قيد_التنفيذ");
  }, [fieldTasks]);

  const overdueTasks = useMemo(() => {
    const today = new Date();
    return fieldTasks.filter(t => {
      if (t.status === "مكتمل" || t.status === "ملغي") return false;
      if (t.dueDate && new Date(t.dueDate) < today) return true;
      return false;
    });
  }, [fieldTasks]);

  const upcomingHearings = useMemo(() => {
    return getUpcomingHearings().slice(0, 5);
  }, [getUpcomingHearings]);

  const recentCases = useMemo(() => {
    return [...cases]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [cases]);

  const isUrgent = (date: string) => {
    const hearingDate = new Date(date);
    const today = new Date();
    return isWithinInterval(hearingDate, { start: today, end: addDays(today, 3) });
  };

  const getWidgetValue = (widgetId: string): number => {
    switch (widgetId) {
      case "active_cases": return caseStats.active;
      case "pending_review": return caseStats.review + consultationStats.review;
      case "today_hearings": return todayHearings.length;
      case "overdue_tasks": return overdueTasks.length;
      case "active_consultations": return consultationStats.active;
      case "new_clients_month": return newClientsThisMonth;
      case "pending_client_contact": return 0;
      case "ready_cases": return caseStats.ready;
      default: return 0;
    }
  };

  const quickActions = [
    { label: "قضية جديدة", icon: Briefcase, onClick: () => setLocation("/cases"), variant: "default" as const },
    { label: "استشارة جديدة", icon: MessageSquare, onClick: () => setLocation("/consultations"), variant: "outline" as const },
    { label: "إضافة عميل", icon: Users, onClick: () => setLocation("/clients"), variant: "outline" as const },
    { label: "إضافة جلسة", icon: CalendarPlus, onClick: () => setLocation("/hearings"), variant: "outline" as const },
  ];

  const visibleWidgets = widgets.filter(w => w.isVisible).sort((a, b) => a.position - b.position);
  const statWidgets = visibleWidgets.filter(w => w.type === "stat_card");
  const listWidgets = visibleWidgets.filter(w => w.type === "list" || w.type === "actions");

  const renderListWidget = (widgetId: string) => {
    switch (widgetId) {
      case "recent_cases":
        return (
          <ListWidget
            title="آخر القضايا"
            icon={FileText}
            items={recentCases.map(c => ({
              id: c.id,
              title: c.caseNumber,
              subtitle: `${getClientName(c.clientId)} - ${c.caseType}`,
              badge: CaseStageLabels[c.currentStage] || c.currentStage,
            }))}
            emptyMessage="لا توجد قضايا"
            onViewAll={() => setLocation("/cases")}
          />
        );
      case "upcoming_hearings_list":
        return (
          <ListWidget
            title="الجلسات القادمة"
            icon={Calendar}
            items={upcomingHearings.map(h => {
              const caseData = cases.find(c => c.id === h.caseId);
              return {
                id: h.id,
                title: getClientName(caseData?.clientId || ""),
                subtitle: `${h.courtName} - ${h.hearingTime}`,
                badge: format(new Date(h.hearingDate), "d MMM", { locale: ar }),
                urgent: isUrgent(h.hearingDate),
              };
            })}
            emptyMessage="لا توجد جلسات قادمة"
            onViewAll={() => setLocation("/hearings")}
          />
        );
      case "pending_field_tasks":
        return (
          <ListWidget
            title="المهام الميدانية المعلقة"
            icon={AlertTriangle}
            items={pendingFieldTasks.slice(0, 5).map(task => ({
              id: task.id,
              title: task.taskType,
              subtitle: task.description?.substring(0, 50) || "",
              badge: task.status,
              badgeVariant: task.status === "قيد_الانتظار" ? "secondary" as const : "default" as const,
            }))}
            emptyMessage="لا توجد مهام معلقة"
            onViewAll={() => setLocation("/field-tasks")}
          />
        );
      case "quick_actions":
        return <QuickActionsWidget actions={quickActions} />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            مرحباً، {user?.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            هذه نظرة عامة على حالة شركة عون
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setLocation("/dashboard-settings")}
          data-testid="button-customize-dashboard"
        >
          <Settings className="w-4 h-4 ml-2" />
          تخصيص
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statWidgets.map(widget => {
          const Icon = widgetIcons[widget.id] || Briefcase;
          const variant = widgetVariants[widget.id] || "default";
          const isAlert = widget.id === "today_hearings" || widget.id === "overdue_tasks";
          
          return (
            <StatCardWidget
              key={widget.id}
              title={widget.title}
              value={getWidgetValue(widget.id)}
              icon={Icon}
              variant={variant}
              alert={isAlert}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {listWidgets.map(widget => (
          <div key={widget.id} data-testid={`widget-${widget.id}`}>
            {renderListWidget(widget.id)}
          </div>
        ))}
      </div>
    </div>
  );
}
