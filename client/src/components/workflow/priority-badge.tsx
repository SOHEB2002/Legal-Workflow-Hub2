import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Clock, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CasePriorityValue, CasePriorityLabels } from "@shared/schema";

interface PriorityBadgeProps {
  priority: CasePriorityValue;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  reason?: string;
}

export function PriorityBadge({
  priority,
  size = "md",
  showTooltip = true,
  reason,
}: PriorityBadgeProps) {
  const getConfig = () => {
    switch (priority) {
      case "urgent":
        return {
          icon: AlertCircle,
          label: CasePriorityLabels.urgent,
          className: "bg-red-500 text-white hover:bg-red-600 animate-pulse",
          iconColor: "text-white",
        };
      case "normal":
        return {
          icon: Clock,
          label: CasePriorityLabels.normal,
          className: "bg-blue-500 text-white hover:bg-blue-600",
          iconColor: "text-white",
        };
      case "low":
        return {
          icon: MinusCircle,
          label: CasePriorityLabels.low,
          className: "bg-gray-400 text-white hover:bg-gray-500",
          iconColor: "text-white",
        };
      default:
        return {
          icon: Clock,
          label: "عادي",
          className: "bg-gray-400 text-white hover:bg-gray-500",
          iconColor: "text-white",
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: "h-5 text-[10px] px-1.5",
    md: "h-6 text-xs px-2",
    lg: "h-7 text-sm px-3",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  const badge = (
    <Badge
      className={cn(
        "flex items-center gap-1 font-medium border-0",
        config.className,
        sizeClasses[size],
        priority === "urgent" && "shadow-lg shadow-red-500/30"
      )}
      data-testid={`badge-priority-${priority}`}
    >
      <Icon className={cn(iconSizes[size], config.iconColor)} />
      <span>{config.label}</span>
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          <p className="font-medium">الأولوية: {config.label}</p>
          {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
          {priority === "urgent" && (
            <p className="text-xs text-red-300">يتم تقليل مدة SLA بنسبة 50%</p>
          )}
          {priority === "low" && (
            <p className="text-xs text-muted-foreground">يتم زيادة مدة SLA بنسبة 50%</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
