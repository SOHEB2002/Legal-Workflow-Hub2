import { useState, useEffect, useRef } from "react";
import { Bell, BellRing, Check, CheckCheck, Eye, Clock } from "lucide-react";
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
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={cn("text-xs", getPriorityColor(notification.priority))}>
              {NotificationPriorityLabels[notification.priority]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {NotificationTypeLabels[notification.type]}
            </span>
          </div>
          <p className="font-medium text-sm truncate">{notification.title}</p>
          <p className="text-xs text-muted-foreground truncate">{notification.message}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(notification.createdAt)}
            </span>
            {notification.isRead && (
              <CheckCheck className="w-3 h-3 text-green-500" />
            )}
          </div>
        </div>
        {!notification.isRead && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
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
  
  const [isOpen, setIsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const userId = user?.id || "";
  const notifications = getMyNotifications(userId).slice(0, 5);
  const unreadCount = getUnreadCount(userId);
  const urgentCount = getUrgentCount(userId);
  const preferences = getUserPreferences(userId);

  useEffect(() => {
    if (hasNewNotifications && preferences.enableSound && unreadCount > 0) {
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2DhIOLk5KBfIJ8iI6Lf36IjI+Of4OHjI6Rf4aLjJGNfomKkI+Kf4eMjJCKgISLi5CPfoWLi4+RfoOKi5CRfYOJio+RfoOIio+Rf4OGio6Sf4OFiI2TfYWEho2Ue4eCho2WeoeCgYyYe4eAAIuag4d+f4qdiYN7foiei4R3foCcj4NzfIGakYNyfIGZlH9yfIGYln1yfYKXl3pyfYKWmXlyfYOVmnhzfoOUm3ZzfoOUnHVzgIOTnXNzgISTnnJzgIOSnW9zgYSTnW1zgYSSn2tzgYSSoGlzgoOSoWdzg4OQomVzg4OPopx0g4GPoZx1gn+Oopy1goB/jaBMgoB+jaFvg4B9jKJ1g4B8i6J7g4B8iqJ/gn98iaKDgn98iKKGgn98h6GJgn98hqCLgn98hZ+OgX98hZ6QgX99hJyTf35+hJqWfn5/g5iYfn6Ag5WbfH+Bg5Kdfn+Bgo+ffoGCgYyifoGCgIqkgoCCgIimgICCf4eogoF/f4W");
        }
        audioRef.current.play().catch(() => {});
      } catch {}
      setHasNewNotifications(false);
    }
  }, [hasNewNotifications, preferences.enableSound, unreadCount, setHasNewNotifications]);

  if (!user) return null;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="relative"
          data-testid="button-notifications-bell"
        >
          {hasNewNotifications || urgentCount > 0 ? (
            <BellRing className={cn("w-5 h-5", urgentCount > 0 && "text-destructive animate-pulse")} />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full",
                urgentCount > 0 ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-accent text-accent-foreground"
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-hidden" data-testid="notifications-dropdown">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">الإشعارات</h3>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7"
              onClick={() => markAllAsRead(userId)}
              data-testid="button-mark-all-read"
            >
              <Check className="w-3 h-3 ml-1" />
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
        
        <div className="max-h-64 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">لا توجد إشعارات</p>
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
          <Link href="/notifications" className="w-full text-center py-2" data-testid="link-view-all-notifications">
            عرض جميع الإشعارات
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
