import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellRing, Check, CheckCheck, Eye, Clock, MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import { NotificationPriority, NotificationPriorityLabels, NotificationTypeLabels } from "@shared/schema";
import type { Notification } from "@shared/schema";
import { cn } from "@/lib/utils";
import { formatRelativeArabic } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";

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

function getPriorityBorderColor(priority: string): string {
  switch (priority) {
    case NotificationPriority.URGENT:
      return "border-r-destructive";
    case NotificationPriority.HIGH:
      return "border-r-orange-500";
    case NotificationPriority.MEDIUM:
      return "border-r-yellow-500";
    default:
      return "border-r-muted";
  }
}

function getPriorityIcon(priority: string) {
  switch (priority) {
    case NotificationPriority.URGENT:
      return <AlertTriangle className="w-4 h-4 text-destructive" />;
    case NotificationPriority.HIGH:
      return <BellRing className="w-4 h-4 text-orange-500" />;
    case NotificationPriority.MEDIUM:
      return <Bell className="w-4 h-4 text-yellow-500" />;
    default:
      return <MessageSquare className="w-4 h-4 text-muted-foreground" />;
  }
}

function formatTimeAgo(dateStr: string): string {
  return formatRelativeArabic(dateStr);
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
}

function NotificationItem({ notification, onMarkAsRead }: NotificationItemProps) {
  return (
    <div
      className={cn(
        "p-3 border-r-4 hover-elevate cursor-pointer transition-colors",
        getPriorityBorderColor(notification.priority),
        !notification.isRead && "bg-accent/20"
      )}
      onClick={() => !notification.isRead && onMarkAsRead(notification.id)}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="mt-0.5 shrink-0">
            {getPriorityIcon(notification.priority)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className={cn("text-xs", getPriorityColor(notification.priority))}>
                {NotificationPriorityLabels[notification.priority]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {NotificationTypeLabels[notification.type]}
              </span>
            </div>
            <p className="font-medium text-sm truncate">{notification.title}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{notification.message}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {notification.senderName && (
                <span className="text-xs text-muted-foreground">
                  من: {notification.senderName}
                </span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimeAgo(notification.createdAt)}
              </span>
              {notification.isRead && (
                <CheckCheck className="w-3 h-3 text-green-500" />
              )}
            </div>
          </div>
        </div>
        {!notification.isRead && (
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onMarkAsRead(notification.id);
            }}
            data-testid={`button-mark-read-${notification.id}`}
          >
            <Eye className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function NotificationsBell() {
  const { user } = useAuth();
  const { 
    getMyNotifications, 
    getUnreadCount, 
    getUrgentCount, 
    markAsRead, 
    markAllAsRead,
    hasNewNotifications,
    setHasNewNotifications,
    getUserPreferences
  } = useNotifications();
  const { toast } = useToast();
  
  const [isOpen, setIsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastToastNotifRef = useRef<string>("");

  const userId = user?.id || "";
  const notifications = getMyNotifications(userId).slice(0, 5);
  const unreadCount = getUnreadCount(userId);
  const urgentCount = getUrgentCount(userId);
  const preferences = getUserPreferences(userId);

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/notification-chime.wav");
        audioRef.current.volume = 0.6;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {}
  }, []);

  useEffect(() => {
    if (hasNewNotifications && unreadCount > 0) {
      if (preferences.enableSound) {
        playNotificationSound();
      }

      const latestUnread = getMyNotifications(userId).find(n => !n.isRead);
      if (latestUnread && latestUnread.id !== lastToastNotifRef.current) {
        lastToastNotifRef.current = latestUnread.id;
        const priorityLabel = NotificationPriorityLabels[latestUnread.priority] || "";
        const isUrgent = latestUnread.priority === NotificationPriority.URGENT || latestUnread.priority === NotificationPriority.HIGH;
        toast({
          title: `${isUrgent ? "تنبيه! " : ""}إشعار جديد - ${priorityLabel}`,
          description: latestUnread.title || latestUnread.message || "لديك إشعار جديد",
          variant: isUrgent ? "destructive" : "default",
          duration: isUrgent ? 8000 : 5000,
        });
      }
      
      setHasNewNotifications(false);
    }
  }, [hasNewNotifications, preferences.enableSound, unreadCount, setHasNewNotifications, playNotificationSound, userId, getMyNotifications, toast]);

  if (!user) return null;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "relative",
            urgentCount > 0 && "animate-pulse"
          )}
          data-testid="button-notifications-bell"
        >
          {hasNewNotifications || urgentCount > 0 ? (
            <BellRing className={cn(
              "w-5 h-5 transition-all",
              urgentCount > 0 ? "text-destructive" : "text-accent"
            )} />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-[20px] text-[10px] font-bold rounded-full border-2 border-background",
                urgentCount > 0 ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground"
              )}
              data-testid="notification-count-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[28rem] overflow-hidden" data-testid="notifications-dropdown">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-accent" />
            <h3 className="font-semibold">الإشعارات</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} جديد
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => markAllAsRead(userId)}
              data-testid="button-mark-all-read"
            >
              <Check className="w-3 h-3 ml-1" />
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
        
        <div className="max-h-72 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">لا توجد إشعارات</p>
              <p className="text-xs mt-1">ستظهر الإشعارات الجديدة هنا</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                />
              ))}
            </div>
          )}
        </div>
        
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center cursor-pointer">
          <Link href="/notifications" className="w-full text-center py-2 font-medium" data-testid="link-view-all-notifications">
            عرض جميع الإشعارات
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
