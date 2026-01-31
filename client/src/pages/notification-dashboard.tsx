import { useState, useMemo } from "react";
import { BarChart3, Bell, Clock, CheckCircle, ArrowUpCircle, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth, getAllUsers } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import {
  NotificationPriority,
  NotificationPriorityLabels,
  NotificationStatus,
  NotificationTypeLabels,
} from "@shared/schema";
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

export default function NotificationDashboardPage() {
  const { user, permissions } = useAuth();
  const { notifications } = useNotifications();
  const { departments } = useDepartments();
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const allUsers = getAllUsers();

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("month");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

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
    let filtered = notifications.filter(n => new Date(n.createdAt) >= dateFilter);
    
    if (departmentFilter !== "all") {
      const deptUserIds = allUsers.filter(u => u.departmentId === departmentFilter).map(u => u.id);
      filtered = filtered.filter(n => deptUserIds.includes(n.recipientId));
    }
    
    return filtered;
  }, [notifications, periodFilter, departmentFilter, allUsers]);

  const stats = useMemo(() => {
    const total = filteredNotifications.length;
    const read = filteredNotifications.filter(n => n.isRead).length;
    const responded = filteredNotifications.filter(n => n.response).length;
    const requiresResponse = filteredNotifications.filter(n => n.requiresResponse).length;
    const escalated = filteredNotifications.filter(n => n.status === NotificationStatus.ESCALATED).length;
    
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
      escalated,
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

  const slowestResponders = useMemo(() => {
    const userResponseTimes: Record<string, { total: number; count: number; name: string }> = {};
    
    filteredNotifications.forEach(n => {
      if (n.requiresResponse) {
        const recipient = allUsers.find(u => u.id === n.recipientId);
        if (!recipient) return;
        
        if (!userResponseTimes[n.recipientId]) {
          userResponseTimes[n.recipientId] = { total: 0, count: 0, name: recipient.name };
        }
        userResponseTimes[n.recipientId].count++;
        
        if (n.response) {
          const responseTime = new Date(n.response.respondedAt).getTime() - new Date(n.createdAt).getTime();
          userResponseTimes[n.recipientId].total += responseTime;
        }
      }
    });
    
    return Object.entries(userResponseTimes)
      .map(([id, data]) => ({
        id,
        name: data.name,
        avgTime: data.count > 0 ? data.total / data.count : 0,
        pending: filteredNotifications.filter(n => n.recipientId === id && n.requiresResponse && !n.response).length,
      }))
      .sort((a, b) => b.pending - a.pending || b.avgTime - a.avgTime)
      .slice(0, 5);
  }, [filteredNotifications, allUsers]);

  const mostAlertedItems = useMemo(() => {
    const itemCounts: Record<string, { type: string; count: number; name: string }> = {};
    
    filteredNotifications.forEach(n => {
      if (n.relatedId && n.relatedType) {
        const key = `${n.relatedType}-${n.relatedId}`;
        if (!itemCounts[key]) {
          let name = "";
          if (n.relatedType === "case") {
            const c = cases.find(c => c.id === n.relatedId);
            name = c?.caseNumber || "غير معروف";
          } else if (n.relatedType === "consultation") {
            const c = consultations.find(c => c.id === n.relatedId);
            name = c?.consultationNumber || "غير معروف";
          }
          itemCounts[key] = { type: n.relatedType, count: 0, name };
        }
        itemCounts[key].count++;
      }
    });
    
    return Object.entries(itemCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([key, data]) => ({ key, ...data }));
  }, [filteredNotifications, cases, consultations]);

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} ساعة ${mins > 0 ? `و ${mins} دقيقة` : ""}`;
  };

  if (!permissions.canSendNotifications) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">ليس لديك صلاحية الوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-accent" />
          <div>
            <h1 className="text-2xl font-bold">لوحة إحصائيات الإشعارات</h1>
            <p className="text-muted-foreground">تحليل شامل لإشعارات النظام</p>
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
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-40" data-testid="select-department">
              <SelectValue placeholder="القسم" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">الإشعارات المصعّدة</CardTitle>
            <ArrowUpCircle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.escalated}</div>
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
                      <span className="text-sm font-medium w-8 text-left">{count}</span>
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
                      <span className="text-sm font-medium w-8 text-left">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              الموظفون الأبطأ في الاستجابة
            </CardTitle>
            <CardDescription>الموظفون الذين لديهم إشعارات معلقة أو بطيئون في الرد</CardDescription>
          </CardHeader>
          <CardContent>
            {slowestResponders.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">لا توجد بيانات</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الموظف</TableHead>
                    <TableHead>معلقة</TableHead>
                    <TableHead>متوسط وقت الرد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowestResponders.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        {item.pending > 0 ? (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                            {item.pending}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatTime(Math.round(item.avgTime / 60000))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              القضايا/الاستشارات الأكثر تنبيهاً
            </CardTitle>
            <CardDescription>العناصر التي تحتاج اهتماماً خاصاً</CardDescription>
          </CardHeader>
          <CardContent>
            {mostAlertedItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">لا توجد بيانات</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النوع</TableHead>
                    <TableHead>الرقم</TableHead>
                    <TableHead>عدد التنبيهات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mostAlertedItems.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>
                        <Badge variant="outline">
                          {item.type === "case" ? "قضية" : "استشارة"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-red-50 text-red-700">
                          {item.count}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
