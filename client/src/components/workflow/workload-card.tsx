import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Briefcase, FileText, Clock, AlertTriangle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeWorkload } from "@shared/schema";

interface WorkloadCardProps {
  workload: EmployeeWorkload;
  compact?: boolean;
}

export function WorkloadCard({ workload, compact = false }: WorkloadCardProps) {
  const totalItems = workload.activeCases + workload.activeConsultations;
  
  const getLoadLevel = () => {
    if (totalItems > 15) return "high";
    if (totalItems >= 10) return "medium";
    return "normal";
  };
  
  const loadLevel = getLoadLevel();
  
  const getLoadConfig = () => {
    switch (loadLevel) {
      case "high":
        return {
          color: "text-red-500",
          bg: "bg-red-500",
          label: "حمل زائد",
          percentage: 100,
        };
      case "medium":
        return {
          color: "text-yellow-500",
          bg: "bg-yellow-500",
          label: "حمل مرتفع",
          percentage: (totalItems / 15) * 100,
        };
      default:
        return {
          color: "text-green-500",
          bg: "bg-green-500",
          label: "حمل طبيعي",
          percentage: (totalItems / 10) * 100,
        };
    }
  };
  
  const config = getLoadConfig();

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors hover-elevate",
              loadLevel === "high" && "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20",
              loadLevel === "medium" && "border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20",
              loadLevel === "normal" && "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
            )}
            data-testid={`workload-card-compact-${workload.id}`}
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium truncate max-w-[100px]">
              {workload.name || "موظف"}
            </span>
            <Badge variant="outline" className={cn("text-xs", config.color)}>
              {totalItems}
            </Badge>
            {workload.overdueItems > 0 && (
              <Badge variant="destructive" className="text-xs">
                {workload.overdueItems} متأخر
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{workload.name || "موظف"}</p>
            <p className="text-xs">{workload.department || "قسم"}</p>
            <div className="text-xs space-y-0.5">
              <p>القضايا: {workload.activeCases}</p>
              <p>الاستشارات: {workload.activeConsultations}</p>
              <p>قيد المراجعة: {workload.inReviewItems}</p>
              <p className="text-red-400">متأخرة: {workload.overdueItems}</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Card className="overflow-hidden" data-testid={`workload-card-${workload.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            {workload.name || "موظف"}
          </CardTitle>
          <Badge
            variant="outline"
            className={cn("text-xs", config.color)}
          >
            {config.label}
          </Badge>
        </div>
        {workload.department && (
          <p className="text-xs text-muted-foreground">{workload.department}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
            <Briefcase className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">القضايا</p>
              <p className="text-lg font-bold">{workload.activeCases}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">الاستشارات</p>
              <p className="text-lg font-bold">{workload.activeConsultations}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>قيد المراجعة: {workload.inReviewItems}</span>
          </div>
          {workload.overdueItems > 0 && (
            <div className="flex items-center gap-1 text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>متأخرة: {workload.overdueItems}</span>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">مستوى الحمل</span>
            <span className={config.color}>{totalItems} / 15</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", config.bg)}
              style={{ width: `${Math.min(config.percentage, 100)}%` }}
            />
          </div>
        </div>

        {workload.avgCompletionDays > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            متوسط وقت الإنجاز: {workload.avgCompletionDays} يوم
          </p>
        )}
      </CardContent>
    </Card>
  );
}
