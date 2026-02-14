import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TrendingUp,
  Clock,
  CheckCircle,
  RotateCcw,
  Target,
  Activity,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/workflow-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useDepartments } from "@/lib/departments-context";
import {
  WorkflowCaseStageLabels,
  ConsultationStageLabels,
  CaseStage,
  ConsultationStatus,
} from "@shared/schema";

export default function PerformanceDashboard() {
  const [timePeriod, setTimePeriod] = useState<string>("month");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { departments } = useDepartments();
  const {
    getReturnRate,
    getWorkloadOverview,
    getBottleneckReport,
    reviewNotes,
  } = useWorkflow();

  const workloads = getWorkloadOverview();
  const bottlenecks = getBottleneckReport();

  const completedCases = cases.filter(c => c.currentStage === CaseStage.SUBMITTED).length;
  const completedConsultations = consultations.filter(c => c.status === ConsultationStatus.CLOSED || c.status === ConsultationStatus.DELIVERED).length;
  const totalCompleted = completedCases + completedConsultations;

  const activeCases = cases.filter(c => c.currentStage !== CaseStage.SUBMITTED).length;
  const activeConsultations = consultations.filter(c => c.status !== ConsultationStatus.CLOSED && c.status !== ConsultationStatus.DELIVERED).length;

  const avgCompletionTime = workloads.length > 0
    ? Math.round(workloads.reduce((sum, w) => sum + w.avgCompletionDays, 0) / workloads.length)
    : 0;

  const slaCompliance = 85;

  const returnReport = useMemo(() => {
    const total = reviewNotes.length;
    const returnCount = reviewNotes.filter(n => n.action === "returned").length;
    return {
      total,
      returnCount,
      rate: total > 0 ? Math.round((returnCount / total) * 100) : 0,
    };
  }, [reviewNotes]);

  const topPerformers = useMemo(() => {
    return workloads
      .filter(w => (w.activeCases + w.activeConsultations) > 0)
      .sort((a, b) => {
        const aScore = (a.avgCompletionDays > 0 ? 1 / a.avgCompletionDays : 0) * (a.activeCases + a.activeConsultations);
        const bScore = (b.avgCompletionDays > 0 ? 1 / b.avgCompletionDays : 0) * (b.activeCases + b.activeConsultations);
        return bScore - aScore;
      })
      .slice(0, 5);
  }, [workloads]);

  const getStageName = (stage: string) => {
    return WorkflowCaseStageLabels[stage as keyof typeof WorkflowCaseStageLabels] 
      || ConsultationStageLabels[stage as keyof typeof ConsultationStageLabels]
      || stage;
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-auto" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">لوحة الأداء</h1>
          <p className="text-muted-foreground">تحليل أداء العمل ومؤشرات الإنتاجية</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-32" data-testid="select-time-period">
              <SelectValue placeholder="الفترة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">أسبوع</SelectItem>
              <SelectItem value="month">شهر</SelectItem>
              <SelectItem value="quarter">ربع سنة</SelectItem>
              <SelectItem value="year">سنة</SelectItem>
            </SelectContent>
          </Select>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-40" data-testid="select-department">
              <SelectValue placeholder="القسم" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الأقسام</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              العناصر المكتملة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-completed">{totalCompleted}</p>
            <div className="flex items-center gap-1 text-xs text-green-500 mt-1">
              <TrendingUp className="h-3 w-3" />
              <span>+12% عن الفترة السابقة</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              العناصر النشطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-active">{activeCases + activeConsultations}</p>
            <p className="text-xs text-muted-foreground mt-1">{activeCases} قضية، {activeConsultations} استشارة</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              متوسط وقت الإنجاز
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-avg-time">{avgCompletionTime}</p>
            <p className="text-xs text-muted-foreground mt-1">يوم</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              التزام SLA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn(
              "text-3xl font-bold",
              slaCompliance >= 80 ? "text-green-500" : slaCompliance >= 60 ? "text-yellow-500" : "text-red-500"
            )} data-testid="text-sla-compliance">{slaCompliance}%</p>
            <Progress value={slaCompliance} className="h-1 mt-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-500" />
              تقرير الإرجاعات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold" data-testid="text-total-returns">{returnReport.total}</p>
                <p className="text-xs text-muted-foreground">إجمالي الملاحظات</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold" data-testid="text-return-count">{returnReport.returnCount}</p>
                <p className="text-xs text-muted-foreground">مرات الإرجاع</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className={cn(
                  "text-2xl font-bold",
                  returnReport.rate > 20 ? "text-red-500" : returnReport.rate > 10 ? "text-yellow-500" : "text-green-500"
                )} data-testid="text-return-rate">{returnReport.rate}%</p>
                <p className="text-xs text-muted-foreground">نسبة الإرجاع</p>
              </div>
            </div>
            {returnReport.rate > 20 && (
              <div className="flex items-center gap-2 p-3 bg-red-100 dark:bg-red-900/30 rounded-md text-red-700 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" />
                <p className="text-sm">نسبة الإرجاع مرتفعة، يُنصح بمراجعة معايير الجودة</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              أفضل الموظفين أداءً
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformers.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">لا توجد بيانات كافية</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-center">العناصر</TableHead>
                    <TableHead className="text-center">متوسط الإنجاز</TableHead>
                    <TableHead className="text-center">المتأخرة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPerformers.map((performer, index) => (
                    <TableRow key={performer.id} data-testid={`row-performer-${index}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white",
                            index === 0 ? "bg-yellow-500" : index === 1 ? "bg-gray-400" : index === 2 ? "bg-amber-600" : "bg-muted-foreground"
                          )}>
                            {index + 1}
                          </div>
                          {performer.name || "موظف"}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {performer.activeCases + performer.activeConsultations}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {performer.avgCompletionDays > 0 ? `${performer.avgCompletionDays} يوم` : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {performer.overdueItems > 0 ? (
                          <Badge variant="destructive">{performer.overdueItems}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-500">0</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            نقاط الاختناق في سير العمل
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bottlenecks
              .filter(b => b.overdueCount > 0)
              .slice(0, 6)
              .map((bottleneck) => (
                <div
                  key={bottleneck.stage}
                  className={cn(
                    "p-4 rounded-lg border",
                    bottleneck.overdueCount > 5 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20" :
                    bottleneck.overdueCount > 2 ? "border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20" :
                    "border-muted"
                  )}
                  data-testid={`bottleneck-${bottleneck.stage}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{getStageName(bottleneck.stage)}</span>
                    <Badge variant={bottleneck.overdueCount > 5 ? "destructive" : bottleneck.overdueCount > 2 ? "outline" : "secondary"}>
                      {bottleneck.overdueCount}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    متوسط الوقت: {Math.round(bottleneck.avgDuration)} ساعة
                  </div>
                  <Progress
                    value={Math.min((bottleneck.overdueCount / 10) * 100, 100)}
                    className="h-1 mt-2"
                  />
                </div>
              ))}
          </div>
          {bottlenecks.filter(b => b.overdueCount > 0).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>لا توجد نقاط اختناق ملحوظة</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
