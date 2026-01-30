import { useMemo } from "react";
import { format, isWithinInterval, addDays } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Briefcase,
  Clock,
  CheckCircle,
  FileText,
  AlertTriangle,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCases } from "@/lib/cases-context";
import { useAuth } from "@/lib/auth-context";
import { CaseStatus } from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success" | "accent";
}) {
  const bgColors = {
    default: "from-primary/20 to-primary/5",
    warning: "from-accent/20 to-accent/5",
    success: "from-accent/30 to-accent/10",
    accent: "from-accent/20 to-accent/5",
  };

  const iconColors = {
    default: "text-primary",
    warning: "text-accent",
    success: "text-accent",
    accent: "text-accent",
  };

  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${bgColors[variant]} pointer-events-none`} />
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
          </div>
          <div className={`w-12 h-12 rounded-full bg-background/80 flex items-center justify-center ${iconColors[variant]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case CaseStatus.NEW:
      return "bg-primary/20 text-primary border-primary/30";
    case CaseStatus.IN_PROGRESS:
      return "bg-accent/20 text-accent border-accent/30";
    case CaseStatus.REVIEW:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case CaseStatus.READY:
      return "bg-accent/30 text-accent border-accent/40";
    case CaseStatus.CLOSED:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function DashboardPage() {
  const { cases, getActiveCases, getReviewCases, getReadyCases, getUpcomingHearings } = useCases();
  const { user } = useAuth();

  const stats = useMemo(() => {
    const activeCases = getActiveCases();
    const reviewCases = getReviewCases();
    const readyCases = getReadyCases();
    const closedCases = cases.filter((c) => c.status === CaseStatus.CLOSED);

    return {
      active: activeCases.length,
      review: reviewCases.length,
      ready: readyCases.length,
      closed: closedCases.length,
    };
  }, [cases, getActiveCases, getReviewCases, getReadyCases]);

  const upcomingHearings = useMemo(() => {
    return getUpcomingHearings().slice(0, 5);
  }, [getUpcomingHearings]);

  const isUrgent = (date: string) => {
    const hearingDate = new Date(date);
    const today = new Date();
    return isWithinInterval(hearingDate, {
      start: today,
      end: addDays(today, 3),
    });
  };

  const recentCases = useMemo(() => {
    return [...cases]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [cases]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            مرحباً، {user?.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            هذه نظرة عامة على حالة مكتب المحاماة
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="القضايا الجارية"
          value={stats.active}
          icon={Briefcase}
          variant="default"
        />
        <StatCard
          title="بانتظار المراجعة"
          value={stats.review}
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="جاهزة للتسليم"
          value={stats.ready}
          icon={CheckCircle}
          variant="success"
        />
        <StatCard
          title="القضايا المغلقة"
          value={stats.closed}
          icon={FileText}
          variant="accent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5 text-accent" />
              الجلسات القادمة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingHearings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد جلسات قادمة
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingHearings.map((c) => (
                  <div
                    key={c.id}
                    data-testid={`hearing-item-${c.id}`}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isUrgent(c.nextHearingDate!)
                        ? "bg-destructive/10 border-destructive/30"
                        : "bg-muted/50 border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isUrgent(c.nextHearingDate!) && (
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      )}
                      <div>
                        <p className="font-medium text-foreground">{c.clientName}</p>
                        <p className="text-sm text-muted-foreground">{c.caseType}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-medium ${isUrgent(c.nextHearingDate!) ? "text-destructive" : "text-foreground"}`}>
                        {format(new Date(c.nextHearingDate!), "d MMMM yyyy", { locale: ar })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(c.nextHearingDate!), "EEEE", { locale: ar })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5 text-accent" />
              آخر التحديثات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد قضايا
              </div>
            ) : (
              <div className="space-y-3">
                {recentCases.map((c) => (
                  <div
                    key={c.id}
                    data-testid={`recent-case-${c.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{c.clientName}</p>
                        <Badge variant="outline" className={`text-xs ${getStatusColor(c.status)}`}>
                          {c.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{c.caseType}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.whatsappLink && (
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid={`button-whatsapp-${c.id}`}
                          onClick={() => window.open(c.whatsappLink, "_blank")}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
