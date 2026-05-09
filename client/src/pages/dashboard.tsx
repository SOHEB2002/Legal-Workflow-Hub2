import { useMemo, useState } from "react";
import { isWithinInterval, addDays, startOfMonth, isToday } from "date-fns";
import { useLocation } from "wouter";
import { formatDayMonthArabic } from "@/lib/date-utils";
import {
  Briefcase,
  FileText,
  AlertTriangle,
  Calendar,
  MessageSquare,
  Settings,
  Users,
  CalendarPlus,
  ScrollText,
  ClipboardCheck,
  FileSignature,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatCardWidget, ListWidget, QuickActionsWidget, widgetIcons, widgetVariants } from "@/components/dashboard-widgets";
import { useCases } from "@/lib/cases-context";
import { CaseClassification, CaseClassificationLabels } from "@shared/schema";
import type { CaseClassificationValue, LawCase, Consultation, Memo, Contract } from "@shared/schema";
import { useConsultations } from "@/lib/consultations-context";
import { useContracts } from "@/lib/contracts-context";
import { useHearings } from "@/lib/hearings-context";
import { useClients } from "@/lib/clients-context";
import { useFieldTasks } from "@/lib/field-tasks-context";
import { useContacts } from "@/lib/contacts-context";
import { useMemos } from "@/lib/memos-context";
import { useAuth } from "@/lib/auth-context";
import { useDashboard, type WidgetSize } from "@/lib/dashboard-context";
import { CaseStatus, CaseStageLabels, CaseStage, ConsultationStage, ContractStage, MemoStage } from "@shared/schema";

const getSizeClass = (size: WidgetSize, type: string): string => {
  if (type === "stat_card") {
    switch (size) {
      case "small": return "col-span-1";
      case "medium": return "col-span-1 sm:col-span-2";
      case "large": return "col-span-1 sm:col-span-2 lg:col-span-3";
      case "full": return "col-span-1 sm:col-span-2 lg:col-span-4";
      default: return "col-span-1";
    }
  } else {
    switch (size) {
      case "small": return "col-span-1";
      case "medium": return "col-span-1";
      case "large": return "col-span-1 lg:col-span-2";
      case "full": return "col-span-1 lg:col-span-2";
      default: return "col-span-1";
    }
  }
};

export default function DashboardPage() {
  const { cases, getActiveCases, getReviewCases, getReadyCases } = useCases();
  const { consultations, getActiveConsultations, getReviewConsultations } = useConsultations();
  const { contracts } = useContracts();
  const { hearings, getUpcomingHearings } = useHearings();
  const { clients, getClientName } = useClients();
  const { fieldTasks } = useFieldTasks();
  const { getPendingFollowUps } = useContacts();
  const { memos } = useMemos();
  const { user } = useAuth();
  const { widgets } = useDashboard();
  const [, setLocation] = useLocation();
  const [pendingReviewPopupOpen, setPendingReviewPopupOpen] = useState(false);

  // Phase-9.3 — role-aware "pending review" computation. Filters at
  // COMMITTEE stage (the chair's queue) per category, then narrows by
  // role:
  //   branch_manager / cases_review_head → see all
  //   department_head                     → own dept only (memos look
  //                                          up parent case for dept)
  //   anyone else (assigned lawyer)       → items the user is assigned
  //                                          to (handles all four
  //                                          assignment fields on cases)
  // Returns the filtered arrays so the popup buttons can show counts
  // AND the navigation can pass the appropriate URL params.
  const pendingReview = useMemo(() => {
    if (!user) return { cases: [], memos: [], consultations: [], contracts: [], total: 0 };
    // Both committee chairs are "see all" across ALL four target
    // sections — the popup is a single cross-entity overview, so a chair
    // that walks past their own section (e.g. consultations chair
    // glancing at cases) shouldn't be silently downgraded to "items
    // assigned to me", which would always be 0 for them. Mirrors the
    // role check in buildPendingReviewQuery so counts and URL params
    // stay aligned.
    const seesAll =
      user.role === "branch_manager"
      || user.role === "cases_review_head"
      || user.role === "consultations_review_head";
    const isDeptHead = user.role === "department_head";

    const filterCases = (rows: LawCase[]) => rows.filter((c) => {
      if (seesAll) return true;
      if (isDeptHead) return c.departmentId === user.departmentId;
      return c.primaryLawyerId === user.id
        || c.responsibleLawyerId === user.id
        || (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(user.id));
    });
    const filterConsultations = (rows: Consultation[]) => rows.filter((c) => {
      if (seesAll) return true;
      if (isDeptHead) return c.departmentId === user.departmentId;
      return c.assignedTo === user.id;
    });
    const filterMemos = (rows: Memo[]) => rows.filter((m) => {
      if (seesAll) return true;
      if (isDeptHead) {
        const parent = cases.find((c) => c.id === m.caseId);
        return !!parent && parent.departmentId === user.departmentId;
      }
      return m.assignedTo === user.id;
    });
    // Contracts use the consultations committee — chair =
    // consultations_review_head, who's already in the seesAll branch
    // above. Everyone else: dept_head sees their own dept's contracts;
    // assigned lawyer + internal reviewer see their own files (the
    // reviewer needs to see the file at لجنة_مراجعة since they may be
    // pulled in for the committee discussion).
    const filterContracts = (rows: Contract[]) => rows.filter((c) => {
      if (seesAll) return true;
      if (isDeptHead) return c.departmentId === user.departmentId;
      return c.assignedTo === user.id || c.internalReviewerId === user.id;
    });

    // Cases: check BOTH currentStage AND the legacy status column.
    // Older flows (and getReviewCases in the cases context) wrote only
    // status="لجنة_المراجعة"; newer ones write currentStage="إحالة_للجنة_المراجعة".
    // The two values aren't equal — they're two different enum spaces.
    // OR-ing the predicate so a case counts under EITHER convention is
    // the safe bet, especially while data may be mid-migration.
    const casesAtCommittee = cases.filter(
      (c) =>
        c.currentStage === CaseStage.REVIEW_COMMITTEE
        || c.status === CaseStatus.REVIEW_COMMITTEE,
    );
    const consAtCommittee = consultations.filter(
      (c) => c.status === "active" && c.currentStage === ConsultationStage.COMMITTEE,
    );
    const memosAtCommittee = memos.filter((m) => m.currentStage === MemoStage.COMMITTEE);
    const contractsAtCommittee = contracts.filter(
      (c) => c.status === "active" && c.currentStage === ContractStage.COMMITTEE,
    );

    const fc = filterCases(casesAtCommittee);
    const fcons = filterConsultations(consAtCommittee);
    const fm = filterMemos(memosAtCommittee);
    const fctr = filterContracts(contractsAtCommittee);
    return {
      cases: fc,
      memos: fm,
      consultations: fcons,
      contracts: fctr,
      total: fc.length + fm.length + fcons.length + fctr.length,
    };
  }, [user, cases, consultations, memos, contracts]);

  const caseStats = useMemo(() => {
    const activeCases = getActiveCases();
    const reviewCases = getReviewCases();
    const readyCases = getReadyCases();
    return {
      active: activeCases.length,
      review: reviewCases.length,
      ready: readyCases.length,
    };
  }, [cases, getActiveCases, getReviewCases, getReadyCases]);

  const consultationStats = useMemo(() => {
    const active = getActiveConsultations();
    const review = getReviewConsultations();
    return { active: active.length, review: review.length };
  }, [getActiveConsultations, getReviewConsultations]);

  const todayHearings = useMemo(() => {
    return hearings.filter(h => isToday(new Date(h.hearingDate)));
  }, [hearings]);

  const newClientsThisMonth = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    return clients.filter(c => new Date(c.createdAt) >= monthStart).length;
  }, [clients]);

  const pendingFieldTasks = useMemo(() => {
    return fieldTasks.filter(t => t.status === "قيد_الانتظار" || t.status === "قيد_التنفيذ");
  }, [fieldTasks]);

  const overdueTasks = useMemo(() => {
    const today = new Date();
    return fieldTasks.filter(t => {
      if (t.status === "مكتمل" || t.status === "ملغي") return false;
      if (t.dueDate && new Date(t.dueDate) < today) return true;
      return false;
    });
  }, [fieldTasks]);

  const upcomingHearings = useMemo(() => {
    return getUpcomingHearings().slice(0, 5);
  }, [getUpcomingHearings]);

  const classificationStats = useMemo(() => {
    const caseNew = cases.filter(c => (c.caseClassification || CaseClassification.UNDER_STUDY) === CaseClassification.UNDER_STUDY).length;
    const caseExisting = cases.filter(c => c.caseClassification === CaseClassification.IN_COURT).length;
    return { caseNew, caseExisting, total: cases.length };
  }, [cases]);

  const recentCases = useMemo(() => {
    return [...cases]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [cases]);

  const isUrgent = (date: string) => {
    const hearingDate = new Date(date);
    const today = new Date();
    return isWithinInterval(hearingDate, { start: today, end: addDays(today, 3) });
  };

  const getWidgetValue = (widgetId: string): number => {
    switch (widgetId) {
      case "active_cases": return caseStats.active;
      // Phase-9.3 — sum of three role-filtered categories.
      case "pending_review": return pendingReview.total;
      case "today_hearings": return todayHearings.length;
      case "overdue_tasks": return overdueTasks.length;
      case "active_consultations": return consultationStats.active;
      case "new_clients_month": return newClientsThisMonth;
      case "pending_client_contact": return getPendingFollowUps().length;
      case "ready_cases": return caseStats.ready;
      default: return 0;
    }
  };

  // Build the URL params that scope a target page to "pending review,
  // for me / my dept / everything" depending on role. Cases /
  // consultations / memos all read these on mount.
  const buildPendingReviewQuery = (): string => {
    if (!user) return "status=pending_review";
    // See-all group covers branch_manager + BOTH review-committee chairs
    // (cases + consultations). Without consultations_review_head here,
    // that role would fall through to the assignedTo fallback — which
    // would scope the consultations list to items the chair is
    // personally "assigned to" (a field reserved for the working
    // lawyer, not the reviewer), reliably yielding zero results and
    // hiding the very items the chair is supposed to review. Same role
    // set is applied to all three popup buttons so counts and
    // navigation agree.
    if (
      user.role === "branch_manager"
      || user.role === "cases_review_head"
      || user.role === "consultations_review_head"
    ) {
      return "status=pending_review";
    }
    if (user.role === "department_head" && user.departmentId) {
      return `status=pending_review&dept=${encodeURIComponent(user.departmentId)}`;
    }
    return `status=pending_review&assignedTo=${encodeURIComponent(user.id)}`;
  };

  // Dedicated handler for the "بانتظار المراجعة" popup trigger. Hoisted
  // out of the switch below so the JSX can wire it directly — the
  // earlier `getWidgetOnClick(widget.id)` indirection was producing a
  // fresh closure per render and (per the bug report) something in the
  // path was reverting to a navigation. Using a named handler removes
  // any ambiguity about which onClick attaches to the card.
  const openPendingReviewPopup = () => setPendingReviewPopupOpen(true);

  const getWidgetOnClick = (widgetId: string): (() => void) | undefined => {
    switch (widgetId) {
      case "active_cases": return () => setLocation("/cases");
      // pending_review is rendered with openPendingReviewPopup directly
      // in the JSX — kept here as a fallback in case anything else
      // routes through this switch.
      case "pending_review": return openPendingReviewPopup;
      case "today_hearings": return () => setLocation("/hearings");
      case "overdue_tasks": return () => setLocation("/field-tasks");
      case "active_consultations": return () => setLocation("/consultations");
      case "ready_cases": return () => setLocation("/cases?status=ready");
      case "new_clients_month": return () => setLocation("/clients");
      default: return undefined;
    }
  };

  const quickActions = [
    { label: "قضية جديدة", icon: Briefcase, onClick: () => setLocation("/cases"), variant: "default" as const },
    { label: "استشارة جديدة", icon: MessageSquare, onClick: () => setLocation("/consultations"), variant: "outline" as const },
    { label: "إضافة عميل", icon: Users, onClick: () => setLocation("/clients"), variant: "outline" as const },
    { label: "إضافة جلسة", icon: CalendarPlus, onClick: () => setLocation("/hearings"), variant: "outline" as const },
  ];

  const visibleWidgets = widgets.filter(w => w.isVisible).sort((a, b) => a.position - b.position);
  const statWidgets = visibleWidgets.filter(w => w.type === "stat_card");
  const listWidgets = visibleWidgets.filter(w => w.type === "list" || w.type === "actions");

  const renderListWidget = (widgetId: string) => {
    switch (widgetId) {
      case "recent_cases":
        return (
          <ListWidget
            title="آخر القضايا"
            icon={FileText}
            items={recentCases.map(c => ({
              id: c.id,
              title: c.caseNumber,
              subtitle: `${getClientName(c.clientId)} - ${c.caseType}`,
              badge: CaseStageLabels[c.currentStage] || c.currentStage,
            }))}
            emptyMessage="لا توجد قضايا"
            onViewAll={() => setLocation("/cases")}
          />
        );
      case "upcoming_hearings_list":
        return (
          <ListWidget
            title="الجلسات القادمة"
            icon={Calendar}
            items={upcomingHearings.map(h => {
              const caseData = cases.find(c => c.id === h.caseId);
              return {
                id: h.id,
                title: getClientName(caseData?.clientId || ""),
                subtitle: `${h.courtName} - ${h.hearingTime}`,
                badge: formatDayMonthArabic(h.hearingDate),
                urgent: isUrgent(h.hearingDate),
              };
            })}
            emptyMessage="لا توجد جلسات قادمة"
            onViewAll={() => setLocation("/hearings")}
          />
        );
      case "pending_field_tasks":
        return (
          <ListWidget
            title="المهام الميدانية المعلقة"
            icon={AlertTriangle}
            items={pendingFieldTasks.slice(0, 5).map(task => ({
              id: task.id,
              title: task.taskType,
              subtitle: task.description?.substring(0, 50) || "",
              badge: task.status,
              badgeVariant: task.status === "قيد_الانتظار" ? "secondary" as const : "default" as const,
            }))}
            emptyMessage="لا توجد مهام معلقة"
            onViewAll={() => setLocation("/field-tasks")}
          />
        );
      case "quick_actions":
        return <QuickActionsWidget actions={quickActions} />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            مرحباً، {user?.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            هذه نظرة عامة على حالة شركة عون
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setLocation("/dashboard-settings")}
          data-testid="button-customize-dashboard"
        >
          <Settings className="w-4 h-4 ml-2" />
          تخصيص
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statWidgets.map(widget => {
          const Icon = widgetIcons[widget.id] || Briefcase;
          const variant = widgetVariants[widget.id] || "default";
          const isAlert = widget.id === "today_hearings" || widget.id === "overdue_tasks";
          const sizeClass = getSizeClass(widget.size, widget.type);
          // Direct attachment for the popup-trigger widget — bypasses
          // the getWidgetOnClick switch so there's no chance of a stale
          // navigation handler leaking through.
          const handleClick =
            widget.id === "pending_review"
              ? openPendingReviewPopup
              : getWidgetOnClick(widget.id);

          return (
            <div key={widget.id} className={sizeClass} data-testid={`widget-${widget.id}`}>
              <StatCardWidget
                title={widget.title}
                value={getWidgetValue(widget.id)}
                icon={Icon}
                variant={variant}
                alert={isAlert}
                onClick={handleClick}
              />
            </div>
          );
        })}
      </div>

      {cases.length > 0 && (
        <Card data-testid="widget-classification-stats">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">القضايا حسب التصنيف</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-[#345774]">{classificationStats.caseNew}</p>
                <p className="text-xs text-muted-foreground">قيد الدراسة</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-blue-600">{classificationStats.caseExisting}</p>
                <p className="text-xs text-muted-foreground">منظورة بالمحكمة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {listWidgets.map(widget => {
          const sizeClass = getSizeClass(widget.size, widget.type);
          return (
            <div key={widget.id} className={sizeClass} data-testid={`widget-${widget.id}`}>
              {renderListWidget(widget.id)}
            </div>
          );
        })}
      </div>

      {/* Phase-9.3 — pending-review popup. Opens when the user clicks
          the "بانتظار المراجعة" stat card. Three buttons (cases /
          memos / consultations) — each shows the role-filtered count
          and routes to the corresponding list page with the stage
          filter (and optionally lawyer/dept filter) pre-selected. */}
      <Dialog open={pendingReviewPopupOpen} onOpenChange={setPendingReviewPopupOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              العناصر بانتظار المراجعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              اختر الفئة لعرض العناصر في مرحلة لجنة المراجعة.
            </p>
            <Button
              variant="outline"
              className="w-full justify-between h-auto py-3"
              data-testid="button-pending-review-cases"
              onClick={() => {
                setPendingReviewPopupOpen(false);
                setLocation(`/cases?${buildPendingReviewQuery()}`);
              }}
            >
              <span className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                <span className="text-right">
                  <div className="font-medium">القضايا</div>
                  <div className="text-xs text-muted-foreground">في مرحلة لجنة المراجعة</div>
                </span>
              </span>
              <span className="font-bold text-lg">{pendingReview.cases.length}</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-auto py-3"
              data-testid="button-pending-review-memos"
              onClick={() => {
                setPendingReviewPopupOpen(false);
                setLocation(`/memos?${buildPendingReviewQuery()}`);
              }}
            >
              <span className="flex items-center gap-2">
                <ScrollText className="w-4 h-4" />
                <span className="text-right">
                  <div className="font-medium">المذكرات</div>
                  <div className="text-xs text-muted-foreground">في مرحلة لجنة المراجعة</div>
                </span>
              </span>
              <span className="font-bold text-lg">{pendingReview.memos.length}</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-auto py-3"
              data-testid="button-pending-review-consultations"
              onClick={() => {
                setPendingReviewPopupOpen(false);
                setLocation(`/consultations?${buildPendingReviewQuery()}`);
              }}
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="text-right">
                  <div className="font-medium">الاستشارات</div>
                  <div className="text-xs text-muted-foreground">في مرحلة لجنة المراجعة</div>
                </span>
              </span>
              <span className="font-bold text-lg">{pendingReview.consultations.length}</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-auto py-3"
              data-testid="button-pending-review-contracts"
              onClick={() => {
                setPendingReviewPopupOpen(false);
                setLocation(`/contracts?${buildPendingReviewQuery()}`);
              }}
            >
              <span className="flex items-center gap-2">
                <FileSignature className="w-4 h-4" />
                <span className="text-right">
                  <div className="font-medium">العقود والمشاريع</div>
                  <div className="text-xs text-muted-foreground">في مرحلة لجنة المراجعة</div>
                </span>
              </span>
              <span className="font-bold text-lg">{pendingReview.contracts.length}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
