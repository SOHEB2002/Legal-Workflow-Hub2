import { useState } from "react";
import { CheckCircle, Clock, RefreshCw, Eye, Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  ResponseType,
  ResponseTypeLabels,
  NotificationPriorityLabels,
  NotificationTypeLabels,
  NotificationPriority,
} from "@shared/schema";
import type { Notification, ResponseTypeValue } from "@shared/schema";
import { cn, notificationDisplayMessage, extractApiError } from "@/lib/utils";
import { DualDateDisplay } from "@/components/ui/dual-date-display";

interface RespondDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification: Notification | null;
}

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

const responseOptions: { type: ResponseTypeValue; icon: typeof CheckCircle; label: string }[] = [
  { type: ResponseType.COMPLETED, icon: CheckCircle, label: "تم الإنجاز" },
  { type: ResponseType.IN_PROGRESS, icon: RefreshCw, label: "جاري العمل" },
  { type: ResponseType.NEED_MORE_TIME, icon: Clock, label: "أحتاج وقت إضافي" },
  { type: ResponseType.NOTED, icon: Eye, label: "تم الاطلاع" },
];

export function RespondDialog({ open, onOpenChange, notification }: RespondDialogProps) {
  const { respondToNotification, markAsRead } = useNotifications();
  const { users } = useAuth();
  const { toast } = useToast();

  const [selectedResponse, setSelectedResponse] = useState<ResponseTypeValue | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // AUTOMATED SENDER → acknowledgement only. Mirrors senderResolvesToUser in
  // notifications-context: a sender that does not resolve to a real users row
  // cannot receive a reply, because notifications_recipient_id_fkey rejects it.
  // Every scheduler notification is in this class (senderId "system", and there
  // is no such user), so replying to one used to fail silently.
  const senderIsHuman = !!notification?.senderId && users.some(u => u.id === notification.senderId);

  const handleRespond = async () => {
    if (!notification) return;
    const responseType = senderIsHuman ? (selectedResponse || "text_reply") : ResponseType.NOTED;
    if (senderIsHuman && !selectedResponse && !responseMessage.trim()) return;

    setSubmitting(true);
    try {
      // The message is deliberately dropped on the acknowledgement path — that
      // path renders no free-text box, so there is nothing to send.
      await respondToNotification(notification.id, responseType, senderIsHuman ? responseMessage : "");
      markAsRead(notification.id);
      toast({ title: senderIsHuman ? "تم إرسال الرد بنجاح" : "تم تسجيل الاطلاع" });
      setSelectedResponse(null);
      setResponseMessage("");
      onOpenChange(false);
    } catch (err) {
      // Was fire-and-forget with an unconditional success toast, so a failed
      // response was indistinguishable from a successful one. Same toast idiom
      // the rest of the app uses for a failed action.
      toast({
        title: senderIsHuman ? "تعذّر إرسال الرد" : "تعذّر تسجيل الاطلاع",
        description: extractApiError(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!notification) return null;

  const existingResponse = notification.response as { type?: string; message?: string; respondedAt?: string; responderName?: string } | null;
  const hasRequiresResponse = notification.requiresResponse;
  const canSubmit = senderIsHuman ? !!(selectedResponse || responseMessage.trim()) : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="respond-notification-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            {/* A header promising a reply on a dialog that states you cannot reply
                is the same mismatch this commit exists to remove. */}
            {senderIsHuman ? "الرد على الإشعار" : "الاطلاع على الإشعار"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn("text-xs", getPriorityColor(notification.priority))}>
                {NotificationPriorityLabels[notification.priority]}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {NotificationTypeLabels[notification.type]}
              </Badge>
            </div>
            <h4 className="font-semibold">{notification.title}</h4>
            <p className="text-sm text-muted-foreground">{notificationDisplayMessage(notification.message)}</p>
            <p className="text-xs text-muted-foreground">
              من: {notification.senderName} • <DualDateDisplay date={notification.createdAt} compact />
            </p>
          </div>

          {existingResponse && (
            <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">رد سابق</span>
                {existingResponse.type && existingResponse.type !== "text_reply" && (
                  <Badge variant="outline" className="text-xs">
                    {ResponseTypeLabels[existingResponse.type as ResponseTypeValue] || existingResponse.type}
                  </Badge>
                )}
              </div>
              {existingResponse.message && (
                <p className="text-sm text-green-700 dark:text-green-300">{existingResponse.message}</p>
              )}
              {existingResponse.respondedAt && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  {existingResponse.responderName ? `${existingResponse.responderName} • ` : ""}
                  <DualDateDisplay date={existingResponse.respondedAt} showTime compact />
                </p>
              )}
            </div>
          )}

          {senderIsHuman ? (
            <>
              {hasRequiresResponse && (
                <div>
                  <Label className="mb-3 block">رد سريع</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {responseOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <Button
                          key={option.type}
                          variant={selectedResponse === option.type ? "default" : "outline"}
                          className="justify-start"
                          onClick={() => setSelectedResponse(prev => prev === option.type ? null : option.type)}
                          data-testid={`button-response-${option.type}`}
                        >
                          <Icon className="w-4 h-4 ml-2" />
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <Label className="mb-2 block">
                  {hasRequiresResponse ? "رد نصي (اختياري)" : "اكتب ردك"}
                </Label>
                <Textarea
                  value={responseMessage}
                  onChange={(e) => setResponseMessage(e.target.value)}
                  placeholder="اكتب ردك هنا..."
                  rows={3}
                  className="mt-1"
                  data-testid="input-response-message"
                />
              </div>
            </>
          ) : (
            /* AUTOMATED SENDER — acknowledgement only. The four quick-replies and
               the free-text box are both gone: there is no human on the other end
               to receive either, and nothing in the system reads a response and
               acts on it. Recording the acknowledgement on the row is the whole
               action, so the confirm button below IS the acknowledgement. */
            <p className="text-sm text-muted-foreground" data-testid="text-ack-only-hint">
              هذا إشعار تلقائي من النظام ولا يمكن الرد عليه. يمكنك تسجيل اطلاعك عليه فقط.
            </p>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-response">
            إلغاء
          </Button>
          <Button onClick={handleRespond} disabled={!canSubmit || submitting} data-testid="button-submit-response">
            <Send className="w-4 h-4 ml-2" />
            {senderIsHuman ? "إرسال الرد" : "تم الاطلاع"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
