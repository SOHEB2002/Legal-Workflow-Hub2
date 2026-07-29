import { useState } from "react";
import { Bell, CheckCheck, Send, Filter, Eye, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  NotificationTypeLabels,
  ResponseTypeLabels,
} from "@shared/schema";
import type { Notification, ResponseTypeValue } from "@shared/schema";
import { cn, notificationDisplayMessage } from "@/lib/utils";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { BidiText } from "@/components/ui/bidi-text";
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

export default function NotificationsPage() {
  const { user, permissions, users } = useAuth();
  const {
    getMyNotifications,
    markAsRead,
    getEscalatedNotifications,
    hasMoreNotifications,
    isLoadingMore,
    loadMoreNotifications,
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

  const handleRespond = (notification: Notification) => {
    setSelectedNotification(notification);
    setShowRespondDialog(true);
  };

  const getSenderName = (senderId: string): string => {
    const sender = allUsers.find(u => u.id === senderId);
    return sender?.name || "غير معروف";
  };

  const uniqueSenders = Array.from(new Set(notifications.map(n => n.senderId).filter((id): id is string => !!id)));

  // Mirrors senderResolvesToUser in notifications-context and senderIsHuman in
  // RespondDialog — a sender that does not resolve to a real users row is an
  // automated producer (the scheduler writes the literal "system"), and those
  // can only be acknowledged, never replied to.
  const senderIsHuman = (n: Notification): boolean =>
    !!n.senderId && allUsers.some(u => u.id === n.senderId);

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
            <Button onClick={() => setShowSendDialog(true)} data-testid="button-send-new-notification">
              <Send className="w-4 h-4 ml-2" />
              إرسال إشعار
            </Button>
          )}
          {/* The stats page is branch_manager-only (see notification-dashboard.tsx).
              This link used to ride the canSendNotifications block, which admits
              five roles — four of them would now land on the "غير مصرح" card.
              Gated to match the page so visibility == authorization. */}
          {user?.role === "branch_manager" && (
            <Button variant="outline" asChild>
              <Link href="/notification-dashboard">
                لوحة الإحصائيات
              </Link>
            </Button>
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
                      {/* Was "الحالة", which this cell never showed: it does not read
                          notification.status at all, it derives a response-state from
                          `response` / `requiresResponse`. That is why every row read
                          "بانتظار الرد" while the page header said "لا توجد إشعارات
                          جديدة" — two independent axes (isRead vs response) under one
                          heading. Renamed to what it actually displays. */}
                      <TableHead>الرد</TableHead>
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
                            <p className="font-medium bidi-override">{notification.title}</p>
                            {/* title= carries the FULL text on hover — the same idiom the
                                response message on this row already used. Without it the
                                message was clipped to one line with no way to read it:
                                the row has no click handler and there is no detail view,
                                so the only path to the full text was the respond dialog. */}
                            <p
                              className="text-sm text-muted-foreground truncate max-w-xs bidi-override"
                              title={notificationDisplayMessage(notification.message)}
                            >
                              {notificationDisplayMessage(notification.message)}
                            </p>
                            {/* WHICH MATTER is this about — server-stamped, display
                                only. Same idiom as the my-tasks row: a secondary
                                muted line beneath, each piece rendering only when
                                present, separated by "•". A notification with no
                                link — or whose linked row has been deleted — comes
                                back with no linkedContext at all and this block
                                does not render. */}
                            {notification.linkedContext && (
                              <div
                                className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground"
                                data-testid={`notification-context-${notification.id}`}
                              >
                                {[
                                  notification.linkedContext.primary,
                                  notification.linkedContext.clientName && `العميل: ${notification.linkedContext.clientName}`,
                                  notification.linkedContext.opponentName && `ضد: ${notification.linkedContext.opponentName}`,
                                  notification.linkedContext.hearingDate,
                                  notification.linkedContext.courtName,
                                  notification.linkedContext.stageLabel,
                                ]
                                  .filter((part): part is string => !!part)
                                  .map((part, i, all) => (
                                    <span key={part + i} className="flex items-center gap-2">
                                      <BidiText>{part}</BidiText>
                                      {i < all.length - 1 && <span>•</span>}
                                    </span>
                                  ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{notification.senderName}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground"><DualDateDisplay date={notification.createdAt} showTime compact /></span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {notification.response ? (
                              <div className="space-y-1">
                                <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">
                                  {notification.response.type === "text_reply"
                                    ? "رد نصي"
                                    : ResponseTypeLabels[notification.response.type as ResponseTypeValue] || "تم الرد"}
                                </Badge>
                                {notification.response.message && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={notification.response.message}>
                                    {notification.response.message}
                                  </p>
                                )}
                                {notification.response.responderName && (
                                  <p className="text-xs text-muted-foreground">
                                    {notification.response.responderName}
                                  </p>
                                )}
                              </div>
                            ) : notification.requiresResponse ? (
                              /* An automated notification cannot be replied to — only
                                 acknowledged (see respond-dialog). Saying "بانتظار الرد"
                                 on one asks for something the UI will not accept. Same
                                 sender predicate the dialog uses. */
                              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                                {senderIsHuman(notification) ? "بانتظار الرد" : "بانتظار الاطلاع"}
                              </Badge>
                            ) : null}
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
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRespond(notification)}
                              data-testid={`button-respond-${notification.id}`}
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* LOAD MORE + the scope statement.
                  The tabs and the three filters run over the LOADED rows, not
                  the server. Silently omitting an old unread notification from
                  غير مقروءة is the worst failure mode of a capped list, so the
                  scope is stated in the UI instead of being left to be
                  discovered. Hidden entirely once everything is loaded — a user
                  whose whole history fits in one page never sees any of it. */}
              {hasMoreNotifications && (
                <div className="p-4 border-t flex flex-col items-center gap-2">
                  <p className="text-xs text-muted-foreground text-center">
                    التبويبات والفلاتر تعمل على الإشعارات المحمّلة حالياً — حمّل المزيد للبحث في الإشعارات الأقدم.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { void loadMoreNotifications(); }}
                    disabled={isLoadingMore}
                    data-testid="button-load-more-notifications"
                  >
                    {isLoadingMore ? "جارٍ التحميل..." : "تحميل المزيد"}
                  </Button>
                </div>
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
