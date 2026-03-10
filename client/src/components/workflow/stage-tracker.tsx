import { Check, Clock, AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import {
  WorkflowCaseStageValue,
  ConsultationStageValue,
  WorkflowCaseStageLabels,
  ConsultationStageLabels,
  WorkflowCaseStagesOrder,
  ConsultationStagesOrder,
  CasePriorityValue,
  CasePriorityLabels,
} from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PriorityBadge } from "./priority-badge";

interface StageTrackerProps {
  entityType: "case" | "consultation";
  currentStage: WorkflowCaseStageValue | ConsultationStageValue;
  stageHistory?: { stage: string; timestamp: string; userName?: string; notes?: string }[];
  priority?: CasePriorityValue;
  returnCount?: number;
  timeRemaining?: { hours: number; isOverdue: boolean; percentage: number };
  compact?: boolean;
}

export function StageTracker({
  entityType,
  currentStage,
  stageHistory = [],
  priority,
  returnCount = 0,
  timeRemaining,
  compact = false,
}: StageTrackerProps) {
  const stages = entityType === "case" ? WorkflowCaseStagesOrder : ConsultationStagesOrder;
  const labels = entityType === "case" ? WorkflowCaseStageLabels : ConsultationStageLabels;
  
  const currentIndex = stages.indexOf(currentStage as any);
  
  const getStageStatus = (index: number) => {
    if (index < currentIndex) return "completed";
    if (index === currentIndex) return "current";
    return "pending";
  };
  
  const getTimeColor = () => {
    if (!timeRemaining) return "text-muted-foreground";
    if (timeRemaining.isOverdue) return "text-red-500";
    if (timeRemaining.percentage > 80) return "text-yellow-500";
    return "text-green-500";
  };
  
  const formatTimeRemaining = () => {
    if (!timeRemaining) return "";
    const absHours = Math.abs(timeRemaining.hours);
    if (timeRemaining.isOverdue) {
      return `متأخر بـ ${absHours} ساعة`;
    }
    return `متبقي ${absHours} ساعة`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {priority && <PriorityBadge priority={priority} size="sm" />}
        <div className="flex items-center gap-1">
          <span className={cn("text-sm font-medium", getTimeColor())}>
            {labels[currentStage as keyof typeof labels]}
          </span>
          {timeRemaining && (
            <span className={cn("text-xs", getTimeColor())}>
              ({formatTimeRemaining()})
            </span>
          )}
        </div>
        {returnCount > 0 && (
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-1 text-orange-500">
                <RotateCcw className="h-3 w-3" />
                <span className="text-xs">{returnCount}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>عدد مرات الإرجاع: {returnCount}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {priority && <PriorityBadge priority={priority} />}
          {returnCount > 0 && (
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-md">
                  <RotateCcw className="h-4 w-4" />
                  <span className="text-sm font-medium">{returnCount} إرجاع</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>تم إرجاع هذا العنصر {returnCount} مرة للتعديل</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {timeRemaining && (
          <div className={cn("flex items-center gap-2 text-sm", getTimeColor())}>
            {timeRemaining.isOverdue ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            <span>{formatTimeRemaining()}</span>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="flex items-center justify-between">
          {stages.slice(0, 7).map((stage, index) => {
            const status = getStageStatus(index);
            const stageInfo = stageHistory.find(h => h.stage === stage);
            
            return (
              <Tooltip key={stage}>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center cursor-pointer">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                        status === "completed" && "bg-green-500 border-green-500 text-white",
                        status === "current" && "bg-primary border-primary text-primary-foreground",
                        status === "pending" && "bg-muted border-muted-foreground/30 text-muted-foreground"
                      )}
                    >
                      {status === "completed" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] mt-1 text-center max-w-[60px] leading-tight",
                        status === "current" && "font-medium text-primary",
                        status === "pending" && "text-muted-foreground"
                      )}
                    >
                      {labels[stage as keyof typeof labels]?.replace(/\s+/g, "\n") || stage}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <div className="space-y-1">
                    <p className="font-medium">{labels[stage as keyof typeof labels]}</p>
                    {stageInfo && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          <DualDateDisplay date={stageInfo.timestamp} compact />
                        </p>
                        {stageInfo.userName && (
                          <p className="text-xs">بواسطة: {stageInfo.userName}</p>
                        )}
                        {stageInfo.notes && (
                          <p className="text-xs text-muted-foreground">{stageInfo.notes}</p>
                        )}
                      </>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted -z-10">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${(currentIndex / (stages.length - 1)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
