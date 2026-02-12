import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Briefcase, 
  Clock, 
  Calendar, 
  AlertTriangle, 
  MessageSquare,
  UserPlus,
  Phone,
  CheckCircle,
  Plus,
  FileText,
  Users,
  CalendarPlus,
  type LucideIcon
} from "lucide-react";

interface StatCardWidgetProps {
  title: string;
  value: number;
  icon: LucideIcon;
  variant?: "default" | "warning" | "success" | "danger" | "accent";
  alert?: boolean;
  suffix?: string;
  onClick?: () => void;
}

export function StatCardWidget({ 
  title, 
  value, 
  icon: Icon, 
  variant = "default",
  alert = false,
  suffix,
  onClick
}: StatCardWidgetProps) {
  const bgColors = {
    default: "from-primary/20 to-primary/5",
    warning: "from-amber-500/20 to-amber-500/5",
    success: "from-emerald-500/20 to-emerald-500/5",
    danger: "from-red-500/20 to-red-500/5",
    accent: "from-accent/20 to-accent/5",
  };

  const iconColors = {
    default: "text-primary",
    warning: "text-amber-500",
    success: "text-emerald-500",
    danger: "text-red-500",
    accent: "text-accent",
  };

  return (
    <Card 
      className={`relative overflow-visible ${alert && value > 0 ? "ring-2 ring-red-500/50" : ""} ${onClick ? "cursor-pointer hover-elevate transition-shadow" : ""}`}
      onClick={onClick}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${bgColors[variant]} pointer-events-none rounded-[inherit]`} />
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold text-foreground">
              {value}
              {suffix && <span className="text-lg font-normal mr-1">{suffix}</span>}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-full bg-background/80 flex items-center justify-center ${iconColors[variant]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  urgent?: boolean;
}

interface ListWidgetProps {
  title: string;
  icon: LucideIcon;
  items: ListItem[];
  emptyMessage?: string;
  maxItems?: number;
  onViewAll?: () => void;
}

export function ListWidget({ 
  title, 
  icon: Icon, 
  items, 
  emptyMessage = "لا توجد عناصر",
  maxItems = 5,
  onViewAll
}: ListWidgetProps) {
  const displayItems = items.slice(0, maxItems);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-accent" />
            {title}
          </div>
          {items.length > maxItems && onViewAll && (
            <Button variant="ghost" size="sm" onClick={onViewAll}>
              عرض الكل
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  item.urgent ? "bg-destructive/10 border-destructive/30" : "bg-muted/30"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-sm text-muted-foreground truncate">{item.subtitle}</p>
                  )}
                </div>
                {item.badge && (
                  <Badge variant={item.badgeVariant || "outline"} className="mr-2 shrink-0">
                    {item.badge}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface QuickAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary";
}

interface QuickActionsWidgetProps {
  actions: QuickAction[];
}

export function QuickActionsWidget({ actions }: QuickActionsWidgetProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plus className="w-5 h-5 text-accent" />
          إجراءات سريعة
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant || "outline"}
              className="h-auto py-4 flex flex-col gap-2"
              onClick={action.onClick}
              data-testid={`quick-action-${index}`}
            >
              <action.icon className="w-5 h-5" />
              <span className="text-sm">{action.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export const widgetIcons: Record<string, LucideIcon> = {
  active_cases: Briefcase,
  pending_review: Clock,
  today_hearings: Calendar,
  overdue_tasks: AlertTriangle,
  active_consultations: MessageSquare,
  new_clients_month: UserPlus,
  pending_client_contact: Phone,
  ready_cases: CheckCircle,
  recent_cases: FileText,
  upcoming_hearings_list: Calendar,
  pending_field_tasks: AlertTriangle,
  quick_actions: Plus,
};

export const widgetVariants: Record<string, "default" | "warning" | "success" | "danger" | "accent"> = {
  active_cases: "default",
  pending_review: "warning",
  today_hearings: "danger",
  overdue_tasks: "danger",
  active_consultations: "accent",
  new_clients_month: "success",
  pending_client_contact: "warning",
  ready_cases: "success",
};
