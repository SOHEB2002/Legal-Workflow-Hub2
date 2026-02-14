import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  AlertTriangle,
  Clock,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/workflow-context";
import { useDepartments } from "@/lib/departments-context";
import { WorkloadCard } from "@/components/workflow/workload-card";
import {
  WorkflowCaseStageLabels,
  ConsultationStageLabels,
} from "@shared/schema";

export default function WorkloadDashboard() {
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const {
    getWorkloadOverview,
    getDepartmentWorkload,
    getBottleneckReport,
  } = useWorkflow();

  const { departments } = useDepartments();

  const workloads = departmentFilter === "all"
    ? getWorkloadOverview()
    : getDepartmentWorkload(departmentFilter);

  const bottlenecks = getBottleneckReport();

  const overloadedEmployees = workloads.filter(w => (w.activeCases + w.activeConsultations) > 15);
  const overdueCount = workloads.reduce((sum, w) => sum + w.overdueItems, 0);
  const totalItems = workloads.reduce((sum, w) => sum + w.activeCases + w.activeConsultations, 0);
  const avgLoad = workloads.length > 0 ? Math.round(totalItems / workloads.length) : 0;

  const getStageName = (stage: string) => {
    return WorkflowCaseStageLabels[stage as keyof typeof WorkflowCaseStageLabels] 
      || ConsultationStageLabels[stage as keyof typeof ConsultationStageLabels]
      || stage;
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">لوحة أعباء العمل</h1>
          <p className="text-muted-foreground">مراقبة وتوزيع أعباء العمل على الموظفين</p>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              إجمالي الموظفين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-total-employees">{workloads.length}</p>
            <p className="text-xs text-muted-foreground">موظف نشط</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              متوسط الحمل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" data-testid="text-avg-load">{avgLoad}</p>
            <p className="text-xs text-muted-foreground">عنصر لكل موظف</p>
          </CardContent>
        </Card>

        <Card className={overloadedEmployees.length > 0 ? "border-red-300 dark:border-red-700" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className={cn("h-4 w-4", overloadedEmployees.length > 0 ? "text-red-500" : "text-yellow-500")} />
              حمل زائد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-3xl font-bold", overloadedEmployees.length > 0 && "text-red-500")} data-testid="text-overloaded">
              {overloadedEmployees.length}
            </p>
            <p className="text-xs text-muted-foreground">موظف بحمل زائد</p>
          </CardContent>
        </Card>

        <Card className={overdueCount > 0 ? "border-orange-300 dark:border-orange-700" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className={cn("h-4 w-4", overdueCount > 0 ? "text-orange-500" : "text-green-500")} />
              عناصر متأخرة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-3xl font-bold", overdueCount > 0 && "text-orange-500")} data-testid="text-overdue">
              {overdueCount}
            </p>
            <p className="text-xs text-muted-foreground">تجاوزت المواعيد</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="workloads">
        <TabsList>
          <TabsTrigger value="workloads" className="gap-2" data-testid="tab-workloads">
            <Users className="h-4 w-4" />
            أعباء الموظفين
          </TabsTrigger>
          <TabsTrigger value="bottlenecks" className="gap-2" data-testid="tab-bottlenecks">
            <AlertTriangle className="h-4 w-4" />
            نقاط الاختناق
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workloads" className="mt-4">
          {workloads.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">لا توجد بيانات أعباء عمل متاحة</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workloads.map((workload) => (
                <WorkloadCard key={workload.id} workload={workload} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bottlenecks" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {bottlenecks.slice(0, 6).map((bottleneck) => (
              <Card key={bottleneck.stage} data-testid={`card-bottleneck-${bottleneck.stage}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{getStageName(bottleneck.stage)}</CardTitle>
                    <Badge variant={bottleneck.overdueCount > 5 ? "destructive" : "secondary"}>
                      {bottleneck.overdueCount} متأخر
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">متوسط وقت المرحلة</span>
                    <span className="font-medium">{Math.round(bottleneck.avgDuration)} ساعة</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">عناصر متأخرة</span>
                    <span className="font-medium">{bottleneck.overdueCount}</span>
                  </div>
                  <Progress
                    value={(bottleneck.overdueCount / 10) * 100}
                    className="h-2"
                  />
                  {bottleneck.overdueCount > 5 && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      تراكم ملحوظ في هذه المرحلة
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
