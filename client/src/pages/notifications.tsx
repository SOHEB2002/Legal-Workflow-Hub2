import { useState } from "react";
import { Bell, CheckCheck, Trash2, Archive, Send, Filter, ArrowUpCircle, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { SendNotificationDialog } from "@/components/notifications/send-notification-dialog";
import { RespondDialog } from "@/components/notifications/respond-dialog";
import {
  NotificationPriority,
  NotificationPriorityLabels,
  NotificationStatus,
  NotificationStatusLabels,
  NotificationTypeLabels,
  ResponseTypeLabels,
} from "@shared/schema";
import type { Notification, NotificationTypeValue, NotificationPriorityValue } from "@shared/schema";
import { cn } from "@/lib/utils";
import { formatDateTimeArabic } from "@/lib/date-utils";
import { Link } from "wouter";

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

function formatDate(dateStr: string): string {
  return formatDateTimeArabic(dateStr);
}

export default function NotificationsPage() {
  const { user, permissions, users } = useAuth();
  const {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    archiveOldNotifications,
    getEscalatedNotifications,
  } = useNotifications();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [senderFilter, setSenderFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showRespondDialog, setShowRespondDialog] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  const userId = user?.id || "";
  const allUsers = users;

  const getFilteredNotifications = (): Notification[] => {
    let notifications = getMyNotifications(userId);

    switch (activeTab) {
      case "unread":
        notifications = notifications.filter(n => !n.isRead);
        break;
      case "requires_response":
        notifications = notifications.filter(n => n.requiresResponse && !n.response);
        break;
      case "escalated":
        notifications = getEscalatedNotifications(userId);
        break;
      case "archived":
        notifications = notifications.filter(n => n.status === NotificationStatus.ARCHIVED);
        break;
    }

    if (typeFilter !== "all") {
      notifications = notifications.filter(n => n.type === typeFilter);
    }
    if (priorityFilter !== "all") {
      notifications = notifications.filter(n => n.priority === priorityFilter);
    }
    if (senderFilter !== "all") {
      notifications = notifications.filter(n => n.senderId === senderFilter);
    }

    return notifications;
  };

  const notifications = getFilteredNotifications();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(notifications.map(n => n.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleBulkMarkAsRead = () => {
    selectedIds.forEach(id => markAsRead(id));
    toast({ title: `تم تحديد ${selectedIds.length} إشعار كمقروء` });
    setSelectedIds([]);
  };

  const handleBulkDelete = () => {
    selectedIds.forEach(id => deleteNotification(id));
    toast({ title: `تم حذف ${selectedIds.length} إشعار` });
    setSelectedIds([]);
  };

  const handleRespond = (notification: Notification) => {
    setSelectedNotification(notification);
    setShowRespondDialog(true);
  };

  const getSenderName = (senderId: string): string => {
    const sender = allUsers.find(u => u.id === senderId);
    return sender?.name || "غير معروف";
  };

  const uniqueSenders = Array.from(new Set(notifications.map(n => n.senderId).filter((id): id is string => id !== null)));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Bell className="w-8 h-8 text-accent" />
          <div>
            <h1 className="text-2xl font-bold">الإشعارات</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : "لا توجد إشعارات جديدة"}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {permissions.canSendNotifications && (
            <>
              <Button onClick={() => setShowSendDialog(true)} data-testid="button-send-new-notification">
                <Send className="w-4 h-4 ml-2" />
                إرسال إشعار
              </Button>
              <Button variant="outline" asChild>
                <Link href="/notification-dashboard">
                  لوحة الإحصائيات
                </Link>
              </Button>
            </>
          )}
          <Button variant="outline" asChild>
            <Link href="/notification-preferences">
              تفضيلات الإشعارات
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="border-b px-4 pt-4">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="all" data-testid="tab-all">الكل</TabsTrigger>
                <TabsTrigger value="unread" data-testid="tab-unread">غير مقروءة</TabsTrigger>
                <TabsTrigger value="requires_response" data-testid="tab-requires-response">تحتاج رد</TabsTrigger>
                <TabsTrigger value="escalated" data-testid="tab-escalated">مصعّدة</TabsTrigger>
                <TabsTrigger value="archived" data-testid="tab-archived">مؤرشفة</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-4 border-b flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">فلترة:</span>
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {Object.entries(NotificationTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="الأولوية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأولويات</SelectItem>
                  {Object.entries(NotificationPriorityLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={senderFilter} onValueChange={setSenderFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="المرسل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المرسلين</SelectItem>
                  {uniqueSenders.map(senderId => (
                    <SelectItem key={senderId} value={senderId}>{getSenderName(senderId)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedIds.length > 0 && (
                <div className="flex gap-2 mr-auto">
                  <Button size="sm" variant="outline" onClick={handleBulkMarkAsRead}>
                    <CheckCheck className="w-4 h-4 ml-1" />
                    تحديد كمقروء ({selectedIds.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleBulkDelete}>
                    <Trash2 className="w-4 h-4 ml-1" />
                    حذف ({selectedIds.length})
                  </Button>
                </div>
              )}
            </div>

            <TabsContent value={activeTab} className="m-0">
              {notifications.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">لا توجد إشعارات</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.length === notifications.length && notifications.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>الأولوية</TableHead>
                      <TableHead>النوع</TableHead>
                      <TableHead>العنوان</TableHead>
                      <TableHead>المرسل</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((notification) => (
                      <TableRow
                        key={notification.id}
                        className={cn(!notification.isRead && "bg-accent/10")}
                        data-testid={`notification-row-${notification.id}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(notification.id)}
                            onCheckedChange={(c) => handleSelectOne(notification.id, !!c)}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", getPriorityColor(notification.priority))}>
                            {NotificationPriorityLabels[notification.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{NotificationTypeLabels[notification.type]}</span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{notification.title}</p>
                            <p className="text-sm text-muted-foreground truncate max-w-xs">{notification.message}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{notification.senderName}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{formatDate(notification.createdAt)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {notification.response ? (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                {ResponseTypeLabels[notification.response.type]}
                              </Badge>
                            ) : notification.requiresResponse ? (
                              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                                بانتظار الرد
                              </Badge>
                            ) : null}
                            {notification.escalationLevel > 0 && (
                              <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                <ArrowUpCircle className="w-3 h-3 ml-1" />
                                مصعّد
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {!notification.isRead && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => markAsRead(notification.id)}
                                data-testid={`button-mark-read-${notification.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            {notification.requiresResponse && !notification.response && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRespond(notification)}
                                data-testid={`button-respond-${notification.id}`}
                              >
                                <RefreshCw className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteNotification(notification.id)}
                              data-testid={`button-delete-${notification.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <SendNotificationDialog open={showSendDialog} onOpenChange={setShowSendDialog} />
      <RespondDialog
        open={showRespondDialog}
        onOpenChange={setShowRespondDialog}
        notification={selectedNotification}
      />
    </div>
  );
}
