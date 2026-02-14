import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths, startOfYear, endOfYear } from "date-fns";
import { formatMonthYearArabic } from "@/lib/date-utils";
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
  Trophy,
  Medal,
  Award,
  Filter,
  Star,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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

function StarRating({ score }: { score: number }) {
  const fullStars = Math.floor(score);
  const hasHalf = score - fullStars >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < fullStars ? "text-yellow-500 fill-yellow-500" : i === fullStars && hasHalf ? "text-yellow-500 fill-yellow-500/50" : "text-muted-foreground"}`} />
      ))}
      <span className="text-sm mr-1">{score.toFixed(1)}</span>
    </div>
  );
}

type PeriodType = "this_month" | "last_month" | "this_year" | "all_time";

const periodLabels: Record<PeriodType, string> = {
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  this_year: "هذه السنة",
  all_time: "كل الأوقات",
};

export default function KPIsPage() {
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { hearings } = useHearings();
  const { clients } = useClients();
  const { fieldTasks } = useFieldTasks();
  const { users } = useAuth();
  const { departments } = useDepartments();
  
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("this_month");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");

  const { data: lawyerPerformance = [], isLoading: loadingPerformance } = useQuery<any[]>({
    queryKey: ['/api/stats/lawyer-performance', selectedPeriod, selectedDepartment],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedPeriod !== "all_time") params.set("period", selectedPeriod === "this_month" ? "this_month" : selectedPeriod === "last_month" ? "last_month" : selectedPeriod === "this_year" ? "this_year" : "all");
      if (selectedDepartment && selectedDepartment !== "all") params.set("departmentId", selectedDepartment);
      const res = await fetch(`/api/stats/lawyer-performance?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("lawfirm_token")}` }
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    }
  });

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

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground">{index + 1}</span>;
    }
  };

  const topPerformers = lawyerPerformance.slice(0, 3);

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            مؤشرات الأداء الرئيسية
          </h1>
          <p className="text-muted-foreground">
            تحليل شامل لأداء مكتب المحاماة - {formatMonthYearArabic(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as PeriodType)}>
            <SelectTrigger className="w-40" data-testid="select-period">
              <SelectValue placeholder="اختر الفترة" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(periodLabels).map(([value, label]) => (
                <SelectItem key={value} value={value} data-testid={`period-${value}`}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger className="w-40" data-testid="select-department">
              <SelectValue placeholder="اختر القسم" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="department-all">جميع الأقسام</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id} data-testid={`department-${dept.id}`}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {loadingPerformance ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : topPerformers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              أفضل 3 محامين
            </CardTitle>
            <CardDescription>المحامون الأعلى تقييماً - {periodLabels[selectedPeriod]}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topPerformers.map((lawyer: any, index: number) => (
                <div key={lawyer.lawyerId} className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg" data-testid={`top-performer-${lawyer.lawyerId}`}>
                  <div className="flex-shrink-0">
                    {getRankIcon(index)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{lawyer.lawyerName}</div>
                    <div className="text-xs text-muted-foreground">{lawyer.departmentName}</div>
                    <div className="mt-1">
                      <StarRating score={lawyer.overallScore ?? 0} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            أداء المحامين
          </CardTitle>
          <CardDescription>تفاصيل أداء المحامين - {periodLabels[selectedPeriod]}</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingPerformance ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : lawyerPerformance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا يوجد محامين لعرض أدائهم
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-16">الترتيب</TableHead>
                    <TableHead className="text-right">المحامي</TableHead>
                    <TableHead className="text-right">القسم</TableHead>
                    <TableHead className="text-center">القضايا النشطة</TableHead>
                    <TableHead className="text-center">المغلقة</TableHead>
                    <TableHead className="text-center">معدل الإغلاق</TableHead>
                    <TableHead className="text-center">تحديث الجلسات</TableHead>
                    <TableHead className="text-center">مذكرات متأخرة</TableHead>
                    <TableHead className="text-center">نسبة الكسب</TableHead>
                    <TableHead className="text-center">التقييم</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lawyerPerformance.map((lawyer: any, index: number) => (
                    <TableRow key={lawyer.lawyerId} data-testid={`employee-row-${lawyer.lawyerId}`}>
                      <TableCell className="text-center">
                        {getRankIcon(index)}
                      </TableCell>
                      <TableCell className="font-medium">{lawyer.lawyerName}</TableCell>
                      <TableCell className="text-muted-foreground">{lawyer.departmentName}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">{lawyer.activeCases ?? 0}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{lawyer.closedCases ?? 0}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Progress value={lawyer.closureRate ?? 0} className="w-16 h-2" />
                          <span className="text-sm">{lawyer.closureRate ?? 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-medium ${(lawyer.hearingUpdateRate ?? 0) >= 80 ? "text-green-600" : (lawyer.hearingUpdateRate ?? 0) >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                          {lawyer.hearingUpdateRate ?? 0}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm font-medium ${(lawyer.overdueMemos ?? 0) > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {lawyer.overdueMemos ?? 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">{lawyer.winRate ?? 0}%</span>
                      </TableCell>
                      <TableCell>
                        <StarRating score={lawyer.overallScore ?? 0} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
