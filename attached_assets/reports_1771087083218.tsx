import { useMemo, useState } from "react";
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, isWithinInterval, subMonths } from "date-fns";
import { ar } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { formatDateShortArabic, formatMonthYearArabic } from "@/lib/date-utils";
import {
  Briefcase,
  MessageSquare,
  Users,
  Calendar,
  Download,
  FileBarChart,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Scale,
  FileDown,
  Activity,
  Target,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useHearings } from "@/lib/hearings-context";
import { useAuth } from "@/lib/auth-context";
import {
  CaseStageLabels,
  CaseStageValue,
  ConsultationStatusLabels,
  ConsultationStatusValue,
  UserRoleLabels,
} from "@shared/schema";

function downloadCSV(data: Record<string, string | number>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function downloadExport(url: string, filename: string) {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("lawfirm_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const csrfToken = localStorage.getItem("lawfirm_csrf_token");
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const res = await fetch(url, {
    headers,
  });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const CHART_COLORS = [
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#8b5cf6",
  "#0891b2",
  "#d97706",
  "#dc2626",
  "#059669",
];

function SmartDashboardSection() {
  const { data, isLoading } = useQuery<{
    greeting: string;
    todayHearings: any[];
    alerts: { type: string; priority: string; message: string; url: string; relatedId: string }[];
    upcomingDeadlines: { title: string; deadlineDate: string; daysLeft: number; caseId: string }[];
    performanceStats: {
      activeCases: number;
      closedThisMonth: number;
      totalCases: number;
      overdueMemos: number;
      todayHearingsCount: number;
      upcomingDeadlinesCount: number;
      unreadNotifications: number;
    };
    comparison?: { newCasesChange: number; closedChange: number };
  }>({
    queryKey: ["/api/dashboard/smart"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stats = data.performanceStats;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold" data-testid="text-smart-greeting">{data.greeting}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">القضايا النشطة</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-smart-active-cases">{stats.activeCases}</div>
            <p className="text-xs text-muted-foreground">من إجمالي {stats.totalCases}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">المغلقة هذا الشهر</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-smart-closed-month">
              {stats.closedThisMonth}
            </div>
            {data.comparison && data.comparison.newCasesChange !== 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                <TrendingUp className="h-3 w-3" />
                {data.comparison.newCasesChange > 0 ? "+" : ""}{data.comparison.newCasesChange}% عن الشهر الماضي
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">المذكرات المتأخرة</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.overdueMemos > 0 ? "text-destructive" : ""}`} data-testid="text-smart-overdue-memos">
              {stats.overdueMemos}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">جلسات اليوم</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-smart-today-hearings">{stats.todayHearingsCount}</div>
          </CardContent>
        </Card>
      </div>

      {data.upcomingDeadlines && data.upcomingDeadlines.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Clock className="h-4 w-4" />
              مواعيد نهائية قريبة
            </CardTitle>
            <Badge variant="secondary">{data.upcomingDeadlines.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.upcomingDeadlines.slice(0, 5).map((deadline, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 flex-wrap py-1" data-testid={`row-deadline-${idx}`}>
                  <span className="text-sm font-medium">{deadline.title}</span>
                  <Badge variant={deadline.daysLeft <= 2 ? "destructive" : "secondary"}>
                    {deadline.daysLeft === 1 ? "غداً" : `${deadline.daysLeft} أيام`}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.alerts && data.alerts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              تنبيهات
            </CardTitle>
            <Badge variant="destructive">{data.alerts.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.alerts.slice(0, 5).map((alert, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap py-1 text-sm" data-testid={`row-alert-${idx}`}>
                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CourtAnalyticsSection() {
  const { data, isLoading } = useQuery<{
    byCourtType: Record<string, number>;
    byResult: Record<string, { won: number; lost: number; partial: number }>;
    avgDuration: Record<string, number>;
  }>({
    queryKey: ["/api/stats/court-analytics"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) return null;

  const courtTypeEntries = Object.entries(data.byCourtType).sort((a, b) => b[1] - a[1]);
  const maxCourtCount = courtTypeEntries.length > 0 ? Math.max(...courtTypeEntries.map(([, v]) => v)) : 1;

  const resultEntries = Object.entries(data.byResult);
  const durationEntries = Object.entries(data.avgDuration);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Scale className="h-4 w-4" />
            القضايا حسب نوع المحكمة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {courtTypeEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا توجد بيانات</p>
          ) : (
            <div className="space-y-3">
              {courtTypeEntries.map(([court, count], idx) => (
                <div key={court} className="space-y-1" data-testid={`court-type-${idx}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">{court}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                  <Progress value={(count / maxCourtCount) * 100} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Target className="h-4 w-4" />
            نتائج الأحكام حسب نوع القضية
          </CardTitle>
        </CardHeader>
        <CardContent>
          {resultEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا توجد أحكام مسجلة</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نوع القضية</TableHead>
                    <TableHead className="text-right">لصالحنا</TableHead>
                    <TableHead className="text-right">ضدنا</TableHead>
                    <TableHead className="text-right">جزئي</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultEntries.map(([caseType, stats]) => {
                    const total = stats.won + stats.lost + stats.partial;
                    return (
                      <TableRow key={caseType} data-testid={`row-result-${caseType}`}>
                        <TableCell className="font-medium">{caseType}</TableCell>
                        <TableCell>
                          <span className="text-green-600 dark:text-green-400 font-medium">{stats.won}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-destructive font-medium">{stats.lost}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">{stats.partial}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{total}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Activity className="h-4 w-4" />
            متوسط مدة القضايا حسب النوع (بالأيام)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {durationEntries.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا توجد بيانات كافية</p>
          ) : (
            <div className="space-y-3">
              {durationEntries.map(([caseType, days], idx) => (
                <div key={caseType} className="flex items-center justify-between gap-3 flex-wrap py-1" data-testid={`duration-${idx}`}>
                  <span className="text-sm font-medium">{caseType}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${days > 90 ? "text-destructive" : days > 30 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
                      {days} يوم
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExportSection() {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportCases = async () => {
    setExporting("cases");
    try {
      await downloadExport("/api/export/cases", `cases-export-${Date.now()}.csv`);
    } finally {
      setExporting(null);
    }
  };

  const handleExportHearings = async () => {
    setExporting("hearings");
    try {
      await downloadExport("/api/export/hearings", `hearings-export-${Date.now()}.csv`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportCases}
        disabled={exporting === "cases"}
        data-testid="button-export-all-cases"
      >
        <FileDown className="h-4 w-4 ml-1" />
        {exporting === "cases" ? "جاري التصدير..." : "تصدير القضايا"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportHearings}
        disabled={exporting === "hearings"}
        data-testid="button-export-all-hearings"
      >
        <FileDown className="h-4 w-4 ml-1" />
        {exporting === "hearings" ? "جاري التصدير..." : "تصدير الجلسات"}
      </Button>
    </div>
  );
}

function CasesSummarySection() {
  const { cases } = useCases();

  const stageData = useMemo(() => {
    const stageCounts: Record<string, number> = {};
    Object.values(CaseStageLabels).forEach(label => { stageCounts[label] = 0; });
    cases.forEach(c => {
      const label = CaseStageLabels[c.currentStage as CaseStageValue] || c.currentStage;
      stageCounts[label] = (stageCounts[label] || 0) + 1;
    });
    return Object.entries(stageCounts).map(([name, count]) => ({ name, count }));
  }, [cases]);

  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      months[key] = 0;
    }
    cases.forEach(c => {
      try {
        const date = parseISO(c.createdAt);
        const key = format(date, "yyyy-MM");
        if (key in months) months[key]++;
      } catch {}
    });
    return Object.entries(months).map(([key, count]) => {
      try {
        const d = parseISO(key + "-01");
        return { name: format(d, "MMM yyyy", { locale: ar }), count };
      } catch {
        return { name: key, count };
      }
    });
  }, [cases]);

  const overdueCases = useMemo(() => {
    return cases.filter(c => {
      if (c.currentStage === "مقفلة" || c.currentStage === "تم_الرفع_للدائرة") return false;
      try {
        const created = parseISO(c.createdAt);
        return differenceInDays(new Date(), created) > 30;
      } catch { return false; }
    });
  }, [cases]);

  const handleExportStages = () => {
    downloadCSV(stageData.map(d => ({ "المرحلة": d.name, "العدد": d.count })), "تقرير_مراحل_القضايا");
  };

  const handleExportMonthly = () => {
    downloadCSV(monthlyData.map(d => ({ "الشهر": d.name, "العدد": d.count })), "تقرير_القضايا_الشهري");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي القضايا</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-cases">{cases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">القضايا المتأخرة (SLA)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="text-overdue-cases">{overdueCases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">القضايا المقفلة</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-closed-cases">
              {cases.filter(c => c.currentStage === "مقفلة").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">عدد القضايا لكل مرحلة</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportStages} data-testid="button-export-cases-stages">
            <Download className="h-4 w-4 ml-1" />
            تصدير CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المرحلة</TableHead>
                <TableHead className="text-right">العدد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stageData.map((item) => (
                <TableRow key={item.name} data-testid={`row-case-stage-${item.name}`}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.count}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">القضايا لكل شهر</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportMonthly} data-testid="button-export-cases-monthly">
            <Download className="h-4 w-4 ml-1" />
            تصدير CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ direction: "rtl", textAlign: "right" }}
                  formatter={(value: number) => [value, "عدد القضايا"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">الرسم البياني - القضايا حسب المرحلة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip
                  contentStyle={{ direction: "rtl", textAlign: "right" }}
                  formatter={(value: number) => [value, "العدد"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {stageData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConsultationsSummarySection() {
  const { consultations } = useConsultations();

  const stageData = useMemo(() => {
    const stageCounts: Record<string, number> = {};
    Object.entries(ConsultationStatusLabels).forEach(([_key, label]) => { stageCounts[label] = 0; });
    consultations.forEach(c => {
      const label = ConsultationStatusLabels[c.status as ConsultationStatusValue] || c.status;
      stageCounts[label] = (stageCounts[label] || 0) + 1;
    });
    return Object.entries(stageCounts).map(([name, count]) => ({ name, count }));
  }, [consultations]);

  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months[format(d, "yyyy-MM")] = 0;
    }
    consultations.forEach(c => {
      try {
        const date = parseISO(c.createdAt);
        const key = format(date, "yyyy-MM");
        if (key in months) months[key]++;
      } catch {}
    });
    return Object.entries(months).map(([key, count]) => {
      try {
        const d = parseISO(key + "-01");
        return { name: format(d, "MMM yyyy", { locale: ar }), count };
      } catch { return { name: key, count }; }
    });
  }, [consultations]);

  const overdueConsultations = useMemo(() => {
    return consultations.filter(c => {
      if (c.status === "مسلّم" || c.status === "مغلق") return false;
      try {
        const created = parseISO(c.createdAt);
        return differenceInDays(new Date(), created) > 14;
      } catch { return false; }
    });
  }, [consultations]);

  const handleExportStages = () => {
    downloadCSV(stageData.map(d => ({ "المرحلة": d.name, "العدد": d.count })), "تقرير_مراحل_الاستشارات");
  };

  const handleExportMonthly = () => {
    downloadCSV(monthlyData.map(d => ({ "الشهر": d.name, "العدد": d.count })), "تقرير_الاستشارات_الشهري");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الاستشارات</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-consultations">{consultations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">الاستشارات المتأخرة</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="text-overdue-consultations">{overdueConsultations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">المرسلة للعميل</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-sent-consultations">
              {consultations.filter(c => c.status === "مسلّم" || c.status === "مغلق").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">عدد الاستشارات لكل مرحلة</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportStages} data-testid="button-export-consultations-stages">
            <Download className="h-4 w-4 ml-1" />
            تصدير CSV
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المرحلة</TableHead>
                <TableHead className="text-right">العدد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stageData.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.count}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">الاستشارات لكل شهر</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportMonthly} data-testid="button-export-consultations-monthly">
            <Download className="h-4 w-4 ml-1" />
            تصدير CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ direction: "rtl", textAlign: "right" }}
                  formatter={(value: number) => [value, "عدد الاستشارات"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الرسم البياني - الاستشارات حسب المرحلة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip
                  contentStyle={{ direction: "rtl", textAlign: "right" }}
                  formatter={(value: number) => [value, "العدد"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {stageData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeePerformanceSection() {
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { users } = useAuth();

  const performanceData = useMemo(() => {
    if (!users || users.length === 0) return [];

    const currentMonth = new Date();
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    return users
      .filter(u => u.isActive && u.role !== "branch_manager")
      .map(user => {
        const userCases = cases.filter(c =>
          c.assignedLawyers?.includes(user.id) ||
          c.primaryLawyerId === user.id ||
          c.responsibleLawyerId === user.id
        );

        const completedCases = userCases.filter(c => c.currentStage === "مقفلة" || c.currentStage === "تم_الرفع_للدائرة");

        const thisMonthCases = userCases.filter(c => {
          try {
            const date = parseISO(c.createdAt);
            return isWithinInterval(date, { start: monthStart, end: monthEnd });
          } catch { return false; }
        });

        const avgDays = completedCases.length > 0
          ? Math.round(completedCases.reduce((sum, c) => {
              try {
                const created = parseISO(c.createdAt);
                const closed = c.closedAt ? parseISO(c.closedAt) : new Date();
                return sum + differenceInDays(closed, created);
              } catch { return sum; }
            }, 0) / completedCases.length)
          : 0;

        const userConsultations = consultations.filter(c => c.assignedTo === user.id);

        return {
          id: user.id,
          name: user.name,
          role: UserRoleLabels[user.role] || user.role,
          totalCases: userCases.length,
          completedCases: completedCases.length,
          thisMonthCases: thisMonthCases.length,
          avgDays,
          totalConsultations: userConsultations.length,
        };
      })
      .filter(u => u.totalCases > 0 || u.totalConsultations > 0)
      .sort((a, b) => (b.totalCases + b.totalConsultations) - (a.totalCases + a.totalConsultations));
  }, [cases, consultations, users]);

  const handleExport = () => {
    downloadCSV(
      performanceData.map(d => ({
        "الموظف": d.name,
        "الدور": d.role,
        "عدد القضايا": d.totalCases,
        "المنجزة": d.completedCases,
        "هذا الشهر": d.thisMonthCases,
        "متوسط أيام الإنجاز": d.avgDays,
        "عدد الاستشارات": d.totalConsultations,
      })),
      "تقرير_أداء_الموظفين"
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">أداء الموظفين</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-employees">
          <Download className="h-4 w-4 ml-1" />
          تصدير CSV
        </Button>
      </CardHeader>
      <CardContent>
        {performanceData.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">لا توجد بيانات أداء متاحة</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">الدور</TableHead>
                  <TableHead className="text-right">عدد القضايا</TableHead>
                  <TableHead className="text-right">المنجزة</TableHead>
                  <TableHead className="text-right">هذا الشهر</TableHead>
                  <TableHead className="text-right">متوسط أيام الإنجاز</TableHead>
                  <TableHead className="text-right">الاستشارات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performanceData.map((emp) => (
                  <TableRow key={emp.id} data-testid={`row-employee-${emp.id}`}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{emp.role}</Badge>
                    </TableCell>
                    <TableCell>{emp.totalCases}</TableCell>
                    <TableCell>
                      <span className="text-green-600 dark:text-green-400 font-medium">{emp.completedCases}</span>
                    </TableCell>
                    <TableCell>{emp.thisMonthCases}</TableCell>
                    <TableCell>
                      {emp.avgDays > 0 ? (
                        <span className={emp.avgDays > 30 ? "text-destructive font-medium" : ""}>{emp.avgDays} يوم</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{emp.totalConsultations}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HearingsReportSection() {
  const { hearings } = useHearings();
  const { cases } = useCases();

  const upcomingHearings = useMemo(() => {
    const now = new Date();
    return hearings
      .filter(h => {
        try {
          const hearingDate = parseISO(h.hearingDate);
          return hearingDate >= now && h.status !== "تمت" && h.status !== "ملغية";
        } catch { return false; }
      })
      .sort((a, b) => {
        try {
          return parseISO(a.hearingDate).getTime() - parseISO(b.hearingDate).getTime();
        } catch { return 0; }
      })
      .slice(0, 20);
  }, [hearings]);

  const getCaseName = (caseId: string) => {
    const c = cases.find(cs => cs.id === caseId);
    return c ? `${c.caseNumber} - ${c.opponentName || ""}` : caseId;
  };

  const handleExport = () => {
    downloadCSV(
      upcomingHearings.map(h => ({
        "القضية": getCaseName(h.caseId),
        "التاريخ": formatDateShortArabic(h.hearingDate),
        "الوقت": h.hearingTime || "-",
        "المحكمة": h.courtName || "-",
        "القاعة": h.courtRoom || "-",
        "الحالة": h.status,
      })),
      "تقرير_الجلسات_القادمة"
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">الجلسات القادمة</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-hearings">
          <Download className="h-4 w-4 ml-1" />
          تصدير CSV
        </Button>
      </CardHeader>
      <CardContent>
        {upcomingHearings.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">لا توجد جلسات قادمة</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">القضية</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الوقت</TableHead>
                  <TableHead className="text-right">المحكمة</TableHead>
                  <TableHead className="text-right">القاعة</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingHearings.map((hearing) => (
                  <TableRow key={hearing.id} data-testid={`row-hearing-${hearing.id}`}>
                    <TableCell className="font-medium">{getCaseName(hearing.caseId)}</TableCell>
                    <TableCell>
                      {formatDateShortArabic(hearing.hearingDate)}
                    </TableCell>
                    <TableCell>{hearing.hearingTime || "-"}</TableCell>
                    <TableCell>{hearing.courtName || "-"}</TableCell>
                    <TableCell>{hearing.courtRoom || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{hearing.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("cases");

  const allowedRoles = ["branch_manager", "cases_review_head", "consultations_review_head"];
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
            <p className="text-muted-foreground text-center">ليس لديك صلاحية الوصول إلى صفحة التقارير</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FileBarChart className="h-6 w-6 text-accent" />
          <h1 className="text-2xl font-bold" data-testid="text-reports-title">التقارير</h1>
        </div>
        <ExportSection />
      </div>

      <SmartDashboardSection />

      <CourtAnalyticsSection />

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="cases" data-testid="tab-reports-cases">
            <Briefcase className="h-4 w-4 ml-1" />
            القضايا
          </TabsTrigger>
          <TabsTrigger value="consultations" data-testid="tab-reports-consultations">
            <MessageSquare className="h-4 w-4 ml-1" />
            الاستشارات
          </TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-reports-employees">
            <Users className="h-4 w-4 ml-1" />
            الموظفين
          </TabsTrigger>
          <TabsTrigger value="hearings" data-testid="tab-reports-hearings">
            <Calendar className="h-4 w-4 ml-1" />
            الجلسات
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="mt-6">
          <CasesSummarySection />
        </TabsContent>

        <TabsContent value="consultations" className="mt-6">
          <ConsultationsSummarySection />
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <EmployeePerformanceSection />
        </TabsContent>

        <TabsContent value="hearings" className="mt-6">
          <HearingsReportSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
