import { useState, useEffect } from "react";
import { Send, Calendar, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth, getAllUsers } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useToast } from "@/hooks/use-toast";
import {
  NotificationType,
  NotificationTypeLabels,
  NotificationPriority,
  NotificationPriorityLabels,
} from "@shared/schema";
import type { NotificationTypeValue, NotificationPriorityValue } from "@shared/schema";

interface SendNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefilledRecipientId?: string;
  prefilledRelatedType?: "case" | "consultation" | "task";
  prefilledRelatedId?: string;
  prefilledTitle?: string;
  prefilledMessage?: string;
}

export function SendNotificationDialog({
  open,
  onOpenChange,
  prefilledRecipientId,
  prefilledRelatedType,
  prefilledRelatedId,
  prefilledTitle,
  prefilledMessage,
}: SendNotificationDialogProps) {
  const { user } = useAuth();
  const { sendNotification, sendBulkNotification, getTemplates, scheduleNotification } = useNotifications();
  const { departments } = useDepartments();
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { toast } = useToast();

  const allUsers = getAllUsers().filter(u => u.id !== user?.id && u.isActive);
  const templates = getTemplates();

  const [recipientMode, setRecipientMode] = useState<"single" | "multiple" | "department">("single");
  const [recipientId, setRecipientId] = useState(prefilledRecipientId || "");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [notificationType, setNotificationType] = useState<NotificationTypeValue>(NotificationType.GENERAL_ALERT);
  const [priority, setPriority] = useState<NotificationPriorityValue>(NotificationPriority.MEDIUM);
  const [title, setTitle] = useState(prefilledTitle || "");
  const [message, setMessage] = useState(prefilledMessage || "");
  const [relatedType, setRelatedType] = useState<"case" | "consultation" | "task" | "">(prefilledRelatedType || "");
  const [relatedId, setRelatedId] = useState(prefilledRelatedId || "");
  const [requiresResponse, setRequiresResponse] = useState(false);
  const [enableSchedule, setEnableSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [enableAutoEscalate, setEnableAutoEscalate] = useState(false);
  const [autoEscalateHours, setAutoEscalateHours] = useState("24");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    if (prefilledRecipientId) setRecipientId(prefilledRecipientId);
    if (prefilledRelatedType) setRelatedType(prefilledRelatedType);
    if (prefilledRelatedId) setRelatedId(prefilledRelatedId);
    if (prefilledTitle) setTitle(prefilledTitle);
    if (prefilledMessage) setMessage(prefilledMessage);
  }, [prefilledRecipientId, prefilledRelatedType, prefilledRelatedId, prefilledTitle, prefilledMessage]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setTitle(template.title);
      setMessage(template.message);
      setNotificationType(template.type);
      setPriority(template.priority);
    }
  };

  const resetForm = () => {
    setRecipientMode("single");
    setRecipientId("");
    setSelectedRecipients([]);
    setSelectedDepartment("");
    setNotificationType(NotificationType.GENERAL_ALERT);
    setPriority(NotificationPriority.MEDIUM);
    setTitle("");
    setMessage("");
    setRelatedType("");
    setRelatedId("");
    setRequiresResponse(false);
    setEnableSchedule(false);
    setScheduledAt("");
    setEnableAutoEscalate(false);
    setAutoEscalateHours("24");
    setSelectedTemplate("");
  };

  const handleSend = () => {
    if (!user) return;

    const baseNotification = {
      type: notificationType,
      priority,
      title,
      message,
      senderId: user.id,
      senderName: user.name,
      relatedType: relatedType || null,
      relatedId: relatedId || null,
      requiresResponse,
      scheduledAt: enableSchedule ? scheduledAt : null,
      autoEscalateAfterHours: enableAutoEscalate ? parseInt(autoEscalateHours) : 0,
    };

    try {
      if (recipientMode === "single") {
        if (!recipientId) {
          toast({ title: "يرجى اختيار المستلم", variant: "destructive" });
          return;
        }
        if (enableSchedule && scheduledAt) {
          scheduleNotification({ ...baseNotification, recipientId, status: "pending" }, scheduledAt);
        } else {
          sendNotification({ ...baseNotification, recipientId });
        }
      } else if (recipientMode === "multiple") {
        if (selectedRecipients.length === 0) {
          toast({ title: "يرجى اختيار المستلمين", variant: "destructive" });
          return;
        }
        sendBulkNotification(selectedRecipients, baseNotification);
      } else if (recipientMode === "department") {
        const deptUsers = allUsers.filter(u => u.departmentId === selectedDepartment).map(u => u.id);
        if (deptUsers.length === 0) {
          toast({ title: "لا يوجد موظفين في هذا القسم", variant: "destructive" });
          return;
        }
        sendBulkNotification(deptUsers, baseNotification);
      }

      toast({ title: "تم إرسال الإشعار بنجاح" });
      resetForm();
      onOpenChange(false);
    } catch {
      toast({ title: "حدث خطأ أثناء إرسال الإشعار", variant: "destructive" });
    }
  };

  const toggleRecipient = (userId: string) => {
    setSelectedRecipients(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="send-notification-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            إرسال إشعار جديد
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>نوع الإرسال</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                size="sm"
                variant={recipientMode === "single" ? "default" : "outline"}
                onClick={() => setRecipientMode("single")}
              >
                موظف واحد
              </Button>
              <Button
                type="button"
                size="sm"
                variant={recipientMode === "multiple" ? "default" : "outline"}
                onClick={() => setRecipientMode("multiple")}
              >
                <Users className="w-4 h-4 ml-1" />
                عدة موظفين
              </Button>
              <Button
                type="button"
                size="sm"
                variant={recipientMode === "department" ? "default" : "outline"}
                onClick={() => setRecipientMode("department")}
              >
                قسم كامل
              </Button>
            </div>
          </div>

          {recipientMode === "single" && (
            <div>
              <Label>المستلم</Label>
              <Select value={recipientId} onValueChange={setRecipientId}>
                <SelectTrigger data-testid="select-recipient">
                  <SelectValue placeholder="اختر المستلم" />
                </SelectTrigger>
                <SelectContent>
                  {allUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {recipientMode === "multiple" && (
            <div>
              <Label>المستلمين ({selectedRecipients.length} مختار)</Label>
              <div className="border rounded-md p-2 max-h-32 overflow-y-auto mt-2 space-y-1">
                {allUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`user-${u.id}`}
                      checked={selectedRecipients.includes(u.id)}
                      onCheckedChange={() => toggleRecipient(u.id)}
                    />
                    <label htmlFor={`user-${u.id}`} className="text-sm cursor-pointer">{u.name}</label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recipientMode === "department" && (
            <div>
              <Label>القسم</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>قالب جاهز (اختياري)</Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
              <SelectTrigger>
                <SelectValue placeholder="اختر قالباً" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>نوع الإشعار</Label>
              <Select value={notificationType} onValueChange={(v) => setNotificationType(v as NotificationTypeValue)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NotificationTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as NotificationPriorityValue)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NotificationPriorityLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>العنوان</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان الإشعار"
              data-testid="input-notification-title"
            />
          </div>

          <div>
            <Label>الرسالة</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="نص الرسالة"
              rows={3}
              data-testid="input-notification-message"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>ربط بـ (اختياري)</Label>
              <Select value={relatedType} onValueChange={(v) => { setRelatedType(v as "case" | "consultation" | "task" | ""); setRelatedId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="case">قضية</SelectItem>
                  <SelectItem value="consultation">استشارة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {relatedType && (
              <div>
                <Label>{relatedType === "case" ? "القضية" : "الاستشارة"}</Label>
                <Select value={relatedId} onValueChange={setRelatedId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    {relatedType === "case" && cases.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.caseNumber}</SelectItem>
                    ))}
                    {relatedType === "consultation" && consultations.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.consultationNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Checkbox
                id="requires-response"
                checked={requiresResponse}
                onCheckedChange={(c) => setRequiresResponse(!!c)}
              />
              <label htmlFor="requires-response" className="text-sm cursor-pointer">طلب رد من المستلم</label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-schedule"
                checked={enableSchedule}
                onCheckedChange={(c) => setEnableSchedule(!!c)}
              />
              <label htmlFor="enable-schedule" className="text-sm cursor-pointer flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                جدولة الإرسال
              </label>
            </div>
            {enableSchedule && (
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-2"
              />
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-escalate"
                checked={enableAutoEscalate}
                onCheckedChange={(c) => setEnableAutoEscalate(!!c)}
              />
              <label htmlFor="enable-escalate" className="text-sm cursor-pointer flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                تصعيد تلقائي بعد
              </label>
              {enableAutoEscalate && (
                <Input
                  type="number"
                  value={autoEscalateHours}
                  onChange={(e) => setAutoEscalateHours(e.target.value)}
                  className="w-20 h-8"
                  min="1"
                />
              )}
              {enableAutoEscalate && <span className="text-sm">ساعة</span>}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
            إلغاء
          </Button>
          <Button onClick={handleSend} disabled={!title || !message} data-testid="button-send-notification">
            <Send className="w-4 h-4 ml-2" />
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
