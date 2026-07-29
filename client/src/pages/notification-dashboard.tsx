import { useState, useMemo, useEffect } from "react";
import { BarChart3, Bell, CheckCircle, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  NotificationPriority,
  NotificationPriorityLabels,
  NotificationTypeLabels,
} from "@shared/schema";
import type { Notification as AppNotification } from "@shared/schema";
import { cn } from "@/lib/utils";

type PeriodFilter = "today" | "week" | "month" | "all";

function getPriorityColor(priority: string): string {
  switch (priority) {
    case NotificationPriority.URGENT:
      return "bg-destructive text-destructive-foreground";
    case NotificationPriority.HIGH:
      return "bg-orange-500 text-white";
    case NotificationPriority.MEDIUM:
      return "bg-yellow-500 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// OWN-ONLY. GET /api/notifications now returns the caller's own notifications
// for every role, so `notifications` here is this user's inbox — not the firm's.
//
// Four sections were removed with that change because each one only meant
// anything ACROSS users and is structurally dead on a single recipient:
//   • "الموظفون الأبطأ في الاستجابة" — grouped by recipientId across users;
//     own-only collapses it to one row, the viewer.
//   • "القضايا/الاستشارات الأكثر تنبيهاً" — counted every recipient's alerts
//     per case; own-only counts only what this user was told about, which is
//     not "most alerted".
//   • the department filter — filtered by the RECIPIENT's department; with one
//     recipient it can only ever match all or nothing.
//   • the escalated statistic — NotificationStatus.ESCALATED has no reachable
//     writer (the only two, escalateNotification and checkAndEscalate in
//     notifications-context, have zero callers), so it was always 0.
//
// What remains are per-notification aggregates with no cross-user term, so each
// still computes correctly on a single recipient's rows.
export default function NotificationDashboardPage() {
  const { user } = useAuth();

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("month");

  // ⚠ This page reads its OWN unbounded copy, not the shared context array.
  //
  // The notifications list is now paged (30 rows, grown by "load more"), and
  // this page aggregates — read rate, response rate, average times, breakdowns.
  // Computing those over a capped window would silently turn "إحصائيات
  // إشعاراتي" into "statistics for the last 30", which is worse than wrong
  // because nothing on screen would say so.
  //
  // GET /api/notifications with NO ?limit still returns everything for the
  // caller, so this needs no new endpoint and no server aggregate — one extra
  // request, on one page, for one role (branch_manager). If the volume ever
  // makes that unreasonable, the honest fix is a server-side aggregate, not a
  // silent cap.
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/notifications");
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setNotifications(data);
      } catch {
        // Leave the previous value; the tiles simply show what they have.
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const getDateFilter = (period: PeriodFilter): Date => {
    const now = new Date();
    switch (period) {
      case "today":
        return new Date(now.setHours(0, 0, 0, 0));
      case "week":
        return new Date(now.setDate(now.getDate() - 7));
      case "month":
        return new Date(now.setMonth(now.getMonth() - 1));
      default:
        return new Date(0);
    }
  };

  const filteredNotifications = useMemo(() => {
    const dateFilter = getDateFilter(periodFilter);
    return notifications.filter(n => new Date(n.createdAt) >= dateFilter);
  }, [notifications, periodFilter]);

  const stats = useMemo(() => {
    const total = filteredNotifications.length;
    const read = filteredNotifications.filter(n => n.isRead).length;
    const responded = filteredNotifications.filter(n => n.response).length;
    const requiresResponse = filteredNotifications.filter(n => n.requiresResponse).length;

    const readTimes = filteredNotifications
      .filter(n => n.isRead && n.readAt)
      .map(n => new Date(n.readAt!).getTime() - new Date(n.createdAt).getTime());
    const avgReadTime = readTimes.length > 0 ? readTimes.reduce((a, b) => a + b, 0) / readTimes.length : 0;

    const responseTimes = filteredNotifications
      .filter(n => n.response)
      .map(n => new Date(n.response!.respondedAt).getTime() - new Date(n.createdAt).getTime());
    const avgResponseTime = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

    return {
      total,
      read,
      readRate: total > 0 ? ((read / total) * 100).toFixed(1) : "0",
      responded,
      responseRate: requiresResponse > 0 ? ((responded / requiresResponse) * 100).toFixed(1) : "0",
      avgReadTimeMinutes: Math.round(avgReadTime / 60000),
      avgResponseTimeMinutes: Math.round(avgResponseTime / 60000),
    };
  }, [filteredNotifications]);

  const byType = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredNotifications.forEach(n => {
      counts[n.type] = (counts[n.type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filteredNotifications]);

  const byPriority = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredNotifications.forEach(n => {
      counts[n.priority] = (counts[n.priority] || 0) + 1;
    });
    return Object.entries(counts);
  }, [filteredNotifications]);

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} ساعة ${mins > 0 ? `و ${mins} دقيقة` : ""}`;
  };

  // Page gate — branch_manager ONLY. Was permissions.canSendNotifications, which
  // admits five roles. Shape copied from the reports page (pages/reports.tsx),
  // this codebase's existing page-level role guard.
  const allowedRoles = ["branch_manager"];
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
            <p className="text-muted-foreground text-center">ليس لديك صلاحية الوصول إلى صفحة إحصائيات الإشعارات</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-accent" />
          <div>
            <h1 className="text-2xl font-bold">إحصائيات إشعاراتي</h1>
            <p className="text-muted-foreground">تحليل الإشعارات الواردة إليك</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
            <SelectTrigger className="w-32" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">الأسبوع</SelectItem>
              <SelectItem value="month">الشهر</SelectItem>
              <SelectItem value="all">الكل</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإشعارات</CardTitle>
            <Bell className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">نسبة القراءة</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.readRate}%</div>
            <p className="text-xs text-muted-foreground">متوسط وقت القراءة: {formatTime(stats.avgReadTimeMinutes)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">نسبة الردود</CardTitle>
            <TrendingUp className="w-4 h-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.responseRate}%</div>
            <p className="text-xs text-muted-foreground">متوسط وقت الرد: {formatTime(stats.avgResponseTimeMinutes)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>الإشعارات حسب النوع</CardTitle>
          </CardHeader>
          <CardContent>
            {byType.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">لا توجد بيانات</p>
            ) : (
              <div className="space-y-3">
                {byType.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm">{NotificationTypeLabels[type as keyof typeof NotificationTypeLabels] || type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${(count / stats.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الإشعارات حسب الأولوية</CardTitle>
          </CardHeader>
          <CardContent>
            {byPriority.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">لا توجد بيانات</p>
            ) : (
              <div className="space-y-3">
                {byPriority.map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <Badge className={cn("text-xs", getPriorityColor(priority))}>
                      {NotificationPriorityLabels[priority as keyof typeof NotificationPriorityLabels] || priority}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{ width: `${(count / stats.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
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
