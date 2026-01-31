import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, differenceInDays } from "date-fns";
import { ar } from "date-fns/locale";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Clock, 
  CheckCircle, 
  Users, 
  Briefcase,
  MessageSquare,
  Calendar,
  BarChart3,
  PieChart,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useHearings } from "@/lib/hearings-context";
import { useClients } from "@/lib/clients-context";
import { useFieldTasks } from "@/lib/field-tasks-context";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { CaseStatus, CaseStageLabels, ConsultationStatus } from "@shared/schema";

interface KPICardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

function KPICard({ title, value, description, icon, trend, trendValue, variant = "default" }: KPICardProps) {
  const variantStyles = {
    default: "border-border",
    success: "border-green-500/50",
    warning: "border-yellow-500/50",
    danger: "border-red-500/50",
  };

  return (
    <Card className={`${variantStyles[variant]}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && trendValue && (
          <div className="flex items-center gap-1 mt-2">
            {trend === "up" ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : trend === "down" ? (
              <TrendingDown className="h-4 w-4 text-red-500" />
            ) : (
              <Activity className="h-4 w-4 text-gray-500" />
            )}
            <span className={`text-xs ${trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-gray-500"}`}>
              {trendValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ProgressCardProps {
  title: string;
  value: number;
  max: number;
  description: string;
  icon: React.ReactNode;
}

function ProgressCard({ title, value, max, description, icon }: ProgressCardProps) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xl font-bold">{value}</span>
          <span className="text-muted-foreground text-sm">من {max}</span>
        </div>
        <Progress value={percentage} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function KPIsPage() {
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { hearings } = useHearings();
  const { clients } = useClients();
  const { fieldTasks } = useFieldTasks();
  const { users } = useAuth();
  const { departments } = useDepartments();

  const currentMonth = useMemo(() => {
    const now = new Date();
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
    };
  }, []);

  const caseStats = useMemo(() => {
    const closedCases = cases.filter(c => c.status === CaseStatus.CLOSED);
    const activeCases = cases.filter(c => c.status !== CaseStatus.CLOSED);
    const thisMonthCases = cases.filter(c => {
      try {
        const createdDate = parseISO(c.createdAt);
        return isWithinInterval(createdDate, currentMonth);
      } catch {
        return false;
      }
    });

    const casesByStage = cases.reduce((acc, c) => {
      acc[c.currentStage] = (acc[c.currentStage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const casesByDepartment = cases.reduce((acc, c) => {
      const dept = departments.find(d => d.id === c.departmentId);
      const deptName = dept?.name || "غير محدد";
      acc[deptName] = (acc[deptName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: cases.length,
      active: activeCases.length,
      closed: closedCases.length,
      thisMonth: thisMonthCases.length,
      byStage: casesByStage,
      byDepartment: casesByDepartment,
      closureRate: cases.length > 0 ? Math.round((closedCases.length / cases.length) * 100) : 0,
    };
  }, [cases, departments, currentMonth]);

  const consultationStats = useMemo(() => {
    const closedConsultations = consultations.filter(c => c.status === ConsultationStatus.CLOSED);
    const activeConsultations = consultations.filter(c => c.status !== ConsultationStatus.CLOSED);
    const thisMonthConsultations = consultations.filter(c => {
      try {
        const createdDate = parseISO(c.createdAt);
        return isWithinInterval(createdDate, currentMonth);
      } catch {
        return false;
      }
    });

    return {
      total: consultations.length,
      active: activeConsultations.length,
      closed: closedConsultations.length,
      thisMonth: thisMonthConsultations.length,
      closureRate: consultations.length > 0 ? Math.round((closedConsultations.length / consultations.length) * 100) : 0,
    };
  }, [consultations, currentMonth]);

  const hearingStats = useMemo(() => {
    const now = new Date();
    const upcoming = hearings.filter(h => {
      try {
        const hearingDate = parseISO(h.hearingDate);
        return hearingDate >= now;
      } catch {
        return false;
      }
    });
    const thisMonthHearings = hearings.filter(h => {
      try {
        const hearingDate = parseISO(h.hearingDate);
        return isWithinInterval(hearingDate, currentMonth);
      } catch {
        return false;
      }
    });

    return {
      total: hearings.length,
      upcoming: upcoming.length,
      thisMonth: thisMonthHearings.length,
    };
  }, [hearings, currentMonth]);

  const clientStats = useMemo(() => {
    const thisMonthClients = clients.filter(c => {
      try {
        const createdDate = parseISO(c.createdAt);
        return isWithinInterval(createdDate, currentMonth);
      } catch {
        return false;
      }
    });

    const individualClients = clients.filter(c => c.clientType === "فرد");
    const companyClients = clients.filter(c => c.clientType === "شركة");

    return {
      total: clients.length,
      thisMonth: thisMonthClients.length,
      individuals: individualClients.length,
      companies: companyClients.length,
    };
  }, [clients, currentMonth]);

  const taskStats = useMemo(() => {
    const completedTasks = fieldTasks.filter(t => t.status === "مكتمل");
    const pendingTasks = fieldTasks.filter(t => t.status === "قيد_الانتظار" || t.status === "قيد_التنفيذ");
    const overdueTasks = fieldTasks.filter(t => {
      if (t.status === "مكتمل" || t.status === "ملغي") return false;
      try {
        const dueDate = parseISO(t.dueDate);
        return dueDate < new Date();
      } catch {
        return false;
      }
    });

    return {
      total: fieldTasks.length,
      completed: completedTasks.length,
      pending: pendingTasks.length,
      overdue: overdueTasks.length,
      completionRate: fieldTasks.length > 0 ? Math.round((completedTasks.length / fieldTasks.length) * 100) : 0,
    };
  }, [fieldTasks]);

  const employeeStats = useMemo(() => {
    const lawyers = users.filter(u => u.role === "department_head" || u.role === "employee");
    
    return {
      total: users.length,
      lawyers: lawyers.length,
    };
  }, [users]);

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            مؤشرات الأداء الرئيسية
          </h1>
          <p className="text-muted-foreground">
            تحليل شامل لأداء مكتب المحاماة - {format(new Date(), "MMMM yyyy", { locale: ar })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="إجمالي القضايا"
          value={caseStats.total}
          description={`${caseStats.thisMonth} قضية هذا الشهر`}
          icon={<Briefcase className="h-5 w-5" />}
          trend={caseStats.thisMonth > 0 ? "up" : "neutral"}
          trendValue={`+${caseStats.thisMonth} جديدة`}
        />
        <KPICard
          title="القضايا الجارية"
          value={caseStats.active}
          description={`${caseStats.closureRate}% معدل الإغلاق`}
          icon={<Activity className="h-5 w-5" />}
          variant={caseStats.active > 10 ? "warning" : "default"}
        />
        <KPICard
          title="الاستشارات"
          value={consultationStats.total}
          description={`${consultationStats.active} استشارة نشطة`}
          icon={<MessageSquare className="h-5 w-5" />}
          trend={consultationStats.thisMonth > 0 ? "up" : "neutral"}
          trendValue={`+${consultationStats.thisMonth} هذا الشهر`}
        />
        <KPICard
          title="العملاء"
          value={clientStats.total}
          description={`${clientStats.individuals} أفراد، ${clientStats.companies} شركات`}
          icon={<Users className="h-5 w-5" />}
          trend={clientStats.thisMonth > 0 ? "up" : "neutral"}
          trendValue={`+${clientStats.thisMonth} جديد`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              توزيع القضايا حسب المرحلة
            </CardTitle>
            <CardDescription>تحليل مراحل القضايا الحالية</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(caseStats.byStage).map(([stage, count]) => {
                const percentage = caseStats.total > 0 ? Math.round((count / caseStats.total) * 100) : 0;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <div className="w-28 text-sm">{CaseStageLabels[stage as keyof typeof CaseStageLabels] || stage}</div>
                    <Progress value={percentage} className="flex-1 h-2" />
                    <div className="w-12 text-sm text-muted-foreground">{count} ({percentage}%)</div>
                  </div>
                );
              })}
              {Object.keys(caseStats.byStage).length === 0 && (
                <p className="text-muted-foreground text-center py-4">لا توجد قضايا</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              توزيع القضايا حسب القسم
            </CardTitle>
            <CardDescription>تحليل توزيع القضايا على الأقسام</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(caseStats.byDepartment).map(([dept, count]) => {
                const percentage = caseStats.total > 0 ? Math.round((count / caseStats.total) * 100) : 0;
                return (
                  <div key={dept} className="flex items-center gap-3">
                    <div className="w-28 text-sm">{dept}</div>
                    <Progress value={percentage} className="flex-1 h-2" />
                    <div className="w-12 text-sm text-muted-foreground">{count} ({percentage}%)</div>
                  </div>
                );
              })}
              {Object.keys(caseStats.byDepartment).length === 0 && (
                <p className="text-muted-foreground text-center py-4">لا توجد قضايا</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ProgressCard
          title="إنجاز المهام الميدانية"
          value={taskStats.completed}
          max={taskStats.total}
          description={`${taskStats.completionRate}% معدل الإنجاز`}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
        />
        <KPICard
          title="المهام المتأخرة"
          value={taskStats.overdue}
          description={`${taskStats.pending} مهمة قيد التنفيذ`}
          icon={<Clock className="h-5 w-5" />}
          variant={taskStats.overdue > 0 ? "danger" : "success"}
        />
        <KPICard
          title="الجلسات القادمة"
          value={hearingStats.upcoming}
          description={`${hearingStats.thisMonth} جلسة هذا الشهر`}
          icon={<Calendar className="h-5 w-5" />}
        />
        <KPICard
          title="فريق العمل"
          value={employeeStats.total}
          description={`${employeeStats.lawyers} محامي`}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            ملخص الأداء
          </CardTitle>
          <CardDescription>نظرة عامة على أداء المكتب</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">{caseStats.closureRate}%</div>
              <div className="text-sm text-muted-foreground mt-1">معدل إغلاق القضايا</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">{consultationStats.closureRate}%</div>
              <div className="text-sm text-muted-foreground mt-1">معدل إغلاق الاستشارات</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">{taskStats.completionRate}%</div>
              <div className="text-sm text-muted-foreground mt-1">معدل إنجاز المهام</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
