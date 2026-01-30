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
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useHearings } from "@/lib/hearings-context";
import { useClients } from "@/lib/clients-context";
import { useAuth } from "@/lib/auth-context";
import { CaseStatus, CaseStatusLabels, ConsultationStatus } from "@shared/schema";

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
    case CaseStatus.RECEIVED:
      return "bg-primary/20 text-primary border-primary/30";
    case CaseStatus.DATA_COMPLETION:
    case CaseStatus.STUDY:
    case CaseStatus.DRAFTING:
      return "bg-accent/20 text-accent border-accent/30";
    case CaseStatus.REVIEW_COMMITTEE:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case CaseStatus.AMENDMENTS:
      return "bg-destructive/20 text-destructive border-destructive/30";
    case CaseStatus.READY_TO_SUBMIT:
      return "bg-accent/30 text-accent border-accent/40";
    case CaseStatus.SUBMITTED:
    case CaseStatus.CLOSED:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function DashboardPage() {
  const { cases, getActiveCases, getReviewCases, getReadyCases } = useCases();
  const { consultations, getActiveConsultations, getReviewConsultations } = useConsultations();
  const { getUpcomingHearings } = useHearings();
  const { getClientName } = useClients();
  const { user } = useAuth();

  const caseStats = useMemo(() => {
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

  const consultationStats = useMemo(() => {
    const active = getActiveConsultations();
    const review = getReviewConsultations();
    return {
      active: active.length,
      review: review.length,
    };
  }, [getActiveConsultations, getReviewConsultations]);

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
          value={caseStats.active}
          icon={Briefcase}
          variant="default"
        />
        <StatCard
          title="بانتظار المراجعة"
          value={caseStats.review + consultationStats.review}
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="جاهزة للتسليم"
          value={caseStats.ready}
          icon={CheckCircle}
          variant="success"
        />
        <StatCard
          title="الاستشارات النشطة"
          value={consultationStats.active}
          icon={MessageSquare}
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
                {upcomingHearings.map((hearing) => {
                  const caseData = cases.find(c => c.id === hearing.caseId);
                  const clientName = caseData ? getClientName(caseData.clientId) : "غير معروف";
                  return (
                    <div
                      key={hearing.id}
                      data-testid={`hearing-item-${hearing.id}`}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isUrgent(hearing.hearingDate)
                          ? "bg-destructive/10 border-destructive/30"
                          : "bg-muted/50 border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isUrgent(hearing.hearingDate) && (
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{clientName}</p>
                          <p className="text-sm text-muted-foreground">{hearing.courtName}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-medium ${isUrgent(hearing.hearingDate) ? "text-destructive" : "text-foreground"}`}>
                          {format(new Date(hearing.hearingDate), "d MMMM yyyy", { locale: ar })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {hearing.hearingTime}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5 text-accent" />
              آخر القضايا
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground">{c.caseNumber}</p>
                        <Badge variant="outline" className={`text-xs ${getStatusColor(c.status)}`}>
                          {CaseStatusLabels[c.status] || c.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getClientName(c.clientId)} - {c.caseType}
                      </p>
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
