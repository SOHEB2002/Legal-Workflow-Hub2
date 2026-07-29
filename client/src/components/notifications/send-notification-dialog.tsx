import { useState, useEffect } from "react";
import { Send, Users, Search, Check, ChevronsUpDown } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useToast } from "@/hooks/use-toast";
import {
  NotificationType,
  NotificationTypeLabels,
  NotificationPriority,
  NotificationPriorityLabels,
  UserRoleLabels,
} from "@shared/schema";
import type { NotificationTypeValue, NotificationPriorityValue, User } from "@shared/schema";

// The نوع الإشعار options a HUMAN picks when sending by hand.
//
// The dropdown used to list all 58 NotificationType members. A census of every
// producer (server routes + scheduler + client triggers) shows only 21 are ever
// emitted, and most of those 21 are machine provenance — delegation_*,
// weekly_report / monthly_report, legal_deadline_*, hearing_update_overdue,
// contact_followup_overdue. Offering those to a person invites mislabelling a
// hand-written message as a system event.
//
// These five are the distinct INTENTS someone actually has when messaging a
// colleague. Nothing in the codebase branches on `type` — it drives a display
// label and a filter option — so this list is cosmetic and reversible, and the
// enum and label map are untouched (historical rows and other code depend on
// them).
// ⚠ Must remain a SUPERSET of every type used by the قالب جاهز templates
// (defaultTemplates in notifications-context): handleTemplateSelect calls
// setNotificationType(template.type), and a value with no matching SelectItem
// renders the trigger blank. CASE_DELAY and ASSIGNMENT are here for that reason
// as much as their own — both are legitimate things a person sends about.
const MANUAL_SEND_TYPES: NotificationTypeValue[] = [
  NotificationType.GENERAL_ALERT,     // تنبيه عام — the default catch-all
  NotificationType.TASK_REMINDER,     // تذكير بمهمة
  NotificationType.ASSIGNMENT,        // إسناد مهمة        (template "إسناد مهمة جديدة")
  NotificationType.RESPONSE_REQUEST,  // طلب رد            (template "مطلوب تحديث حالة")
  NotificationType.DEADLINE_WARNING,  // تحذير موعد نهائي  (templates "تذكير موعد جلسة" / "مراجعة عاجلة")
  NotificationType.CASE_DELAY,        // تأخر قضية         (template "تنبيه تأخر")
  NotificationType.ESCALATION,        // تصعيد
];

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
  const { user, users } = useAuth();
  const { sendNotification, sendBulkNotification, getTemplates } = useNotifications();
  const { departments } = useDepartments();
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { toast } = useToast();

  const allUsers = users.filter(u => u.id !== user?.id && u.isActive);
  const templates = getTemplates();

  // Recipient search shared by both pickers. Matches the memo case-picker
  // precedent, which likewise searches more than the primary label (it matches
  // caseNumber + opponentName + plaintiffName) — here name + role + department,
  // because in a 10-role firm "who is the labour dept head again?" is the
  // commonest way a sender actually looks someone up.
  const selectableUsers = allUsers.filter(u => u.id);

  const userSubtitle = (u: User): string => {
    const roleLabel = UserRoleLabels[u.role] || u.role;
    const deptName = departments.find(d => d.id === u.departmentId)?.name;
    return deptName ? `${roleLabel} — ${deptName}` : roleLabel;
  };

  const userHaystack = (u: User): string =>
    `${u.name} ${UserRoleLabels[u.role] || u.role} ${departments.find(d => d.id === u.departmentId)?.name || ""}`.toLowerCase();

  // cmdk passes the CommandItem's `value` (the user id) — resolve then match.
  const userMatchesSearch = (value: string, search: string): number => {
    const u = selectableUsers.find(x => x.id === value);
    if (!u) return 0;
    return userHaystack(u).includes(search.toLowerCase()) ? 1 : 0;
  };

  const [recipientMode, setRecipientMode] = useState<"single" | "multiple" | "department">("single");
  const [recipientId, setRecipientId] = useState(prefilledRecipientId || "");
  const [recipientComboOpen, setRecipientComboOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [notificationType, setNotificationType] = useState<NotificationTypeValue>(NotificationType.GENERAL_ALERT);
  const [priority, setPriority] = useState<NotificationPriorityValue>(NotificationPriority.MEDIUM);
  const [title, setTitle] = useState(prefilledTitle || "");
  const [message, setMessage] = useState(prefilledMessage || "");
  const [relatedType, setRelatedType] = useState<"case" | "consultation" | "task" | "">(prefilledRelatedType || "");
  const [relatedId, setRelatedId] = useState(prefilledRelatedId || "");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const filteredMultiUsers = recipientSearch.trim()
    ? allUsers.filter(u => userHaystack(u).includes(recipientSearch.trim().toLowerCase()))
    : allUsers;

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
    setRecipientSearch("");
    setSelectedRecipients([]);
    setSelectedDepartment("");
    setNotificationType(NotificationType.GENERAL_ALERT);
    setPriority(NotificationPriority.MEDIUM);
    setTitle("");
    setMessage("");
    setRelatedType("");
    setRelatedId("");
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
      // requiresResponse / scheduledAt / autoEscalateAfterHours are no longer
      // sent from this dialog — their controls are gone (see the commit
      // message). The COLUMNS are untouched and server-side producers still set
      // requiresResponse: true; only the manual-send path stops offering them.
      relatedId: relatedId || null,
      isAutomatic: false,
      relatedStage: null,
      workflowTriggerId: null,
    };

    try {
      if (recipientMode === "single") {
        if (!recipientId) {
          toast({ title: "يرجى اختيار المستلم", variant: "destructive" });
          return;
        }
        sendNotification({ ...baseNotification, recipientId });
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
              {/* Searchable combobox — the Popover + Command pattern already used
                  for the القضية picker in the memo create dialog (pages/memos.tsx).
                  Was a plain Select, which is unusable against the full roster.
                  Like that precedent, the filter matches SEVERAL fields, not just
                  the primary one: name, role label and department name. */}
              <Popover open={recipientComboOpen} onOpenChange={setRecipientComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={recipientComboOpen}
                    data-testid="select-recipient"
                    className="w-full justify-between font-normal text-right"
                  >
                    <span className="truncate">
                      {recipientId
                        ? (allUsers.find(u => u.id === recipientId)?.name || "اختر المستلم")
                        : "اختر المستلم"}
                    </span>
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start" dir="rtl">
                  <Command filter={(value, search) => userMatchesSearch(value, search)}>
                    <CommandInput placeholder="ابحث بالاسم أو الدور أو القسم..." />
                    <CommandList>
                      <CommandEmpty>لا توجد نتائج</CommandEmpty>
                      <CommandGroup>
                        {selectableUsers.map(u => (
                          <CommandItem
                            key={u.id}
                            value={u.id}
                            onSelect={(val) => { setRecipientId(val); setRecipientComboOpen(false); }}
                            className="flex items-center justify-between gap-2"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{u.name}</span>
                              <span className="text-xs text-muted-foreground">{userSubtitle(u)}</span>
                            </div>
                            {recipientId === u.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {recipientMode === "multiple" && (
            <div>
              <Label>المستلمين ({selectedRecipients.length} مختار)</Label>
              {/* Multi-select gets the SAME search, but keeps its checkbox list —
                  Command/CommandItem is a single-select idiom and the user must be
                  able to see and keep several ticks at once. A plain filter box above
                  the existing list gives the same "type to narrow" behaviour without
                  changing the selection model. */}
              <div className="relative mt-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الدور أو القسم..."
                  className="pr-9"
                  data-testid="input-recipient-search"
                />
              </div>
              <div className="border rounded-md p-2 max-h-40 overflow-y-auto mt-2 space-y-1">
                {filteredMultiUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">لا توجد نتائج</p>
                ) : filteredMultiUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`user-${u.id}`}
                      checked={selectedRecipients.includes(u.id)}
                      onCheckedChange={() => toggleRecipient(u.id)}
                    />
                    <label htmlFor={`user-${u.id}`} className="text-sm cursor-pointer flex-1">
                      {u.name}
                      <span className="text-xs text-muted-foreground mr-2">{userSubtitle(u)}</span>
                    </label>
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
                    <SelectItem key={d.id} value={d.id || `dept-${d.name}`}>{d.name}</SelectItem>
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
                  {MANUAL_SEND_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{NotificationTypeLabels[t]}</SelectItem>
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
