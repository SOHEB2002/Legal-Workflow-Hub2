import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/lib/auth-context";
import { useUsers } from "@/lib/users-context";
import { FileText, Search, Download, Filter, Clock, User } from "lucide-react";
import { ActivityActionLabels, ActivityLogEntityType } from "@shared/schema";
import type { ActivityActionValue, ActivityLogEntityTypeValue } from "@shared/schema";

const entityTypeLabels: Record<ActivityLogEntityTypeValue, string> = {
  case: "قضية",
  consultation: "استشارة",
  user: "مستخدم",
  notification: "إشعار",
  system: "نظام",
  team: "فريق",
  delegation: "تفويض",
  vacation: "إجازة",
};

export default function ActivityLogPage() {
  const { users, permissions } = useAuth();
  const { activityLogs, getRecentActivities } = useUsers();

  const [searchQuery, setSearchQuery] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      const matchesSearch = 
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.entityId && log.entityId.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesUser = userFilter === "all" || log.userId === userFilter;
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesEntityType = entityTypeFilter === "all" || log.entityType === entityTypeFilter;
      const matchesStartDate = !startDate || log.timestamp >= startDate;
      const matchesEndDate = !endDate || log.timestamp <= endDate;

      return matchesSearch && matchesUser && matchesAction && matchesEntityType && matchesStartDate && matchesEndDate;
    });
  }, [activityLogs, searchQuery, userFilter, actionFilter, entityTypeFilter, startDate, endDate]);

  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.name || userId;
  };

  const handleExport = () => {
    const csvContent = [
      ["الوقت", "المستخدم", "الإجراء", "نوع العنصر", "معرف العنصر"],
      ...filteredLogs.map(log => [
        new Date(log.timestamp).toLocaleString("ar-SA"),
        getUserName(log.userId),
        ActivityActionLabels[log.action as ActivityActionValue] || log.action,
        entityTypeLabels[log.entityType] || log.entityType,
        log.entityId || "-",
      ]),
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `activity_log_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const uniqueActions = Array.from(new Set(activityLogs.map(l => l.action)));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">سجل النشاط</h1>
          <p className="text-muted-foreground">متابعة جميع الأنشطة والإجراءات في النظام</p>
        </div>
        <Button variant="outline" onClick={handleExport} data-testid="button-export">
          <Download className="w-4 h-4 ml-2" />
          تصدير CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الأنشطة</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activityLogs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">اليوم</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activityLogs.filter(l => {
                const today = new Date().toISOString().split("T")[0];
                return l.timestamp.startsWith(today);
              }).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المستخدمين النشطين</CardTitle>
            <User className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(activityLogs.map(l => l.userId)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">النتائج</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredLogs.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="input-search-activity"
              />
            </div>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-user-filter">
                <SelectValue placeholder="المستخدم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المستخدمين</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-action-filter">
                <SelectValue placeholder="الإجراء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الإجراءات</SelectItem>
                {uniqueActions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {ActivityActionLabels[action as ActivityActionValue] || action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-entity-filter">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                {Object.entries(entityTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">من:</span>
              <Input
                dir="ltr"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
                data-testid="input-start-date"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">إلى:</span>
              <Input
                dir="ltr"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
                data-testid="input-end-date"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الوقت</TableHead>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">الإجراء</TableHead>
                <TableHead className="text-right">نوع العنصر</TableHead>
                <TableHead className="text-right">معرف العنصر</TableHead>
                <TableHead className="text-right">التفاصيل</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.slice(0, 100).map((log) => (
                <TableRow key={log.id} data-testid={`row-activity-${log.id}`}>
                  <TableCell className="text-sm">
                    {new Date(log.timestamp).toLocaleString("ar-SA")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      {getUserName(log.userId)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {ActivityActionLabels[log.action as ActivityActionValue] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {entityTypeLabels[log.entityType] || log.entityType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {log.entityId || "-"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {Object.keys(log.details).length > 0 
                      ? JSON.stringify(log.details).slice(0, 50) + "..."
                      : "-"
                    }
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    لا توجد أنشطة
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {filteredLogs.length > 100 && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              عرض أول 100 نتيجة من {filteredLogs.length}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
