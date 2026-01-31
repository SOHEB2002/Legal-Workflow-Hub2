import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SLAIndicatorProps {
  timeRemaining: {
    hours: number;
    isOverdue: boolean;
    percentage: number;
  };
  maxHours?: number;
  compact?: boolean;
  showProgress?: boolean;
}

export function SLAIndicator({
  timeRemaining,
  maxHours = 24,
  compact = false,
  showProgress = true,
}: SLAIndicatorProps) {
  const { hours, isOverdue, percentage } = timeRemaining;
  const absHours = Math.abs(hours);

  const getStatus = () => {
    if (isOverdue) return "overdue";
    if (percentage >= 80) return "warning";
    return "ontime";
  };

  const status = getStatus();

  const getColors = () => {
    switch (status) {
      case "overdue":
        return {
          text: "text-red-600 dark:text-red-400",
          bg: "bg-red-100 dark:bg-red-900/30",
          progress: "bg-red-500",
          icon: AlertTriangle,
        };
      case "warning":
        return {
          text: "text-yellow-600 dark:text-yellow-400",
          bg: "bg-yellow-100 dark:bg-yellow-900/30",
          progress: "bg-yellow-500",
          icon: Clock,
        };
      default:
        return {
          text: "text-green-600 dark:text-green-400",
          bg: "bg-green-100 dark:bg-green-900/30",
          progress: "bg-green-500",
          icon: CheckCircle,
        };
    }
  };

  const colors = getColors();
  const Icon = colors.icon;

  const formatTime = () => {
    if (absHours < 1) {
      const minutes = Math.round(absHours * 60);
      if (isOverdue) return `متأخر بـ ${minutes} دقيقة`;
      return `متبقي ${minutes} دقيقة`;
    }
    if (absHours >= 24) {
      const days = Math.floor(absHours / 24);
      const remainingHours = Math.round(absHours % 24);
      const timeStr = remainingHours > 0 ? `${days} يوم و ${remainingHours} ساعة` : `${days} يوم`;
      if (isOverdue) return `متأخر بـ ${timeStr}`;
      return `متبقي ${timeStr}`;
    }
    if (isOverdue) return `متأخر بـ ${Math.round(absHours)} ساعة`;
    return `متبقي ${Math.round(absHours)} ساعة`;
  };

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
              colors.bg,
              colors.text
            )}
            data-testid="sla-indicator-compact"
          >
            <Icon className="h-3 w-3" />
            <span>{isOverdue ? "-" : ""}{Math.round(absHours)}س</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{formatTime()}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-2" data-testid="sla-indicator">
      <div className={cn("flex items-center justify-between text-sm", colors.text)}>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="font-medium">{formatTime()}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {Math.round(percentage)}% مستهلك
        </span>
      </div>
      
      {showProgress && (
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "absolute inset-y-0 right-0 rounded-full transition-all",
              colors.progress,
              status === "overdue" && "animate-pulse"
            )}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
      
      {status === "overdue" && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          يجب اتخاذ إجراء فوري
        </p>
      )}
      {status === "warning" && (
        <p className="text-xs text-yellow-500 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          اقتراب الموعد النهائي
        </p>
      )}
    </div>
  );
}
