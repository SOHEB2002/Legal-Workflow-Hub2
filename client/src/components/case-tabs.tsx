import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, FileText, Pin, AlertTriangle, Calendar, Plus, Trash2, Edit3, Save,
  MessageSquare, Scale, Gavel, BookOpen, UserCheck, ChevronRight, Star, ClipboardList,
} from "lucide-react";
import { CaseActivityActionLabels, CaseNoteCategoryLabels, DeadlineTypeLabels } from "@shared/schema";
import { LtrInline } from "@/components/ui/bidi-text";
import { formatRelativeArabic } from "@/lib/date-utils";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { DualDateDisplay } from "@/components/ui/dual-date-display";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("lawfirm_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const csrfToken = localStorage.getItem("lawfirm_csrf_token");
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  return headers;
}

function getActionIcon(actionType: string) {
  const iconMap: Record<string, any> = {
    case_created: Scale,
    case_updated: Edit3,
    stage_changed: ChevronRight,
    case_assigned: UserCheck,
    hearing_added: Gavel,
    hearing_result_recorded: Gavel,
    memo_created: FileText,
    memo_submitted: FileText,
    memo_approved: FileText,
    note_added: MessageSquare,
    attachment_added: BookOpen,
  };
  const Icon = iconMap[actionType] || Clock;
  return <Icon className="h-4 w-4" />;
}

export function CaseActivityTab({ caseId }: { caseId: string }) {
  const { data: activities = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ['/api/cases', caseId, 'activity'],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${caseId}/activity`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      // Guard: server used to return { data, total, page, limit } — normalise to array
      return Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
    },
    enabled: !!caseId && caseId.length > 0,
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">جاري تحميل سجل النشاط...</div>;
  }

  if (isError) {
    return <div className="text-center py-8 text-destructive">تعذّر تحميل سجل النشاط</div>;
  }

  if (!Array.isArray(activities) || activities.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">لا يوجد نشاط مسجل بعد</div>;
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto" dir="rtl">
      {activities.map((activity: any) => (
        <div key={activity.id} className="flex items-start gap-3 p-3 rounded-md bg-muted/30" data-testid={`activity-${activity.id}`}>
          <div className="mt-1 text-muted-foreground">
            {getActionIcon(activity.actionType)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm">{activity.title}</p>
              <span className="text-xs text-muted-foreground">
                {formatRelativeArabic(activity.createdAt)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activity.userName} - {CaseActivityActionLabels[activity.actionType] || activity.actionType}
            </p>
            {activity.details && (
              <p className="text-xs text-muted-foreground mt-1">{activity.details}</p>
            )}
            {activity.previousValue && activity.newValue && (
              <div className="flex items-center gap-2 mt-1 text-xs">
                <Badge variant="outline" className="text-xs">{activity.previousValue}</Badge>
                <ChevronRight className="h-3 w-3" />
                <Badge variant="secondary" className="text-xs">{activity.newValue}</Badge>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CaseNotesTab({ caseId }: { caseId: string }) {
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [noteCategory, setNoteCategory] = useState("عام");
  const [isImportant, setIsImportant] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: notes = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/cases', caseId, 'notes'],
    queryFn: async () => {
      const res = await fetch(`/api/cases/${caseId}/notes`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!caseId && caseId.length > 0,
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cases/${caseId}/notes`, {
        content: newNote,
        category: noteCategory,
        isImportant,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cases', caseId, 'notes'] });
      setNewNote("");
      setIsImportant(false);
      toast({ title: "تمت إضافة الملاحظة" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/case-notes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cases', caseId, 'notes'] });
      setEditingNote(null);
      toast({ title: "تم تعديل الملاحظة" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/case-notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cases', caseId, 'notes'] });
      toast({ title: "تم حذف الملاحظة" });
    },
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-3 p-3 rounded-md border">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="اكتب ملاحظة داخلية..."
          className="min-h-[80px]"
          data-testid="input-new-note"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={noteCategory} onValueChange={setNoteCategory}>
              <SelectTrigger className="w-40" data-testid="select-note-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CaseNoteCategoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={isImportant ? "default" : "outline"}
              size="sm"
              onClick={() => setIsImportant(!isImportant)}
              data-testid="button-toggle-important"
            >
              <AlertTriangle className="h-4 w-4" />
            </Button>
          </div>
          <Button
            onClick={() => addNoteMutation.mutate()}
            disabled={!newNote.trim() || addNoteMutation.isPending}
            data-testid="button-add-note"
          >
            <Plus className="h-4 w-4 ml-1" />
            إضافة
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">لا توجد ملاحظات</div>
      ) : (
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {notes.map((note: any) => (
            <div key={note.id} className={`p-3 rounded-md border ${note.isImportant ? "border-yellow-500/50 bg-yellow-50/10" : ""} ${note.isPinned ? "bg-muted/50" : ""}`} data-testid={`note-${note.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {note.isPinned && <Pin className="h-3 w-3 text-muted-foreground" />}
                  {note.isImportant && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                  <Badge variant="outline" className="text-xs">{CaseNoteCategoryLabels[note.category] || note.category}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateNoteMutation.mutate({ id: note.id, data: { isPinned: !note.isPinned } })}
                    data-testid={`button-pin-note-${note.id}`}
                  >
                    <Pin className={`h-3 w-3 ${note.isPinned ? "text-primary" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setEditingNote(note.id); setEditContent(note.content); }}
                    data-testid={`button-edit-note-${note.id}`}
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteNoteMutation.mutate(note.id)}
                    data-testid={`button-delete-note-${note.id}`}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
              {editingNote === note.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="min-h-[60px]" />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => updateNoteMutation.mutate({ id: note.id, data: { content: editContent } })} data-testid={`button-save-note-${note.id}`}>
                      <Save className="h-3 w-3 ml-1" /> حفظ
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingNote(null)}>إلغاء</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm mt-2 whitespace-pre-wrap">{note.content}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span>{note.userName}</span>
                <span>{formatRelativeArabic(note.createdAt)}</span>
                {note.editedAt && <span>(معدّلة)</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CaseDeadlinesTabProps {
  caseId: string;
  hearings?: any[];
  memos?: any[];
  fieldTasks?: any[];
  responseDeadline?: string | null;
}

export function CaseDeadlinesTab({ caseId, hearings = [], memos = [], fieldTasks = [], responseDeadline }: CaseDeadlinesTabProps) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    deadlineType: "objection" as string,
    title: "",
    description: "",
    startDate: "",
    durationDays: 30,
    deadlineDate: "",
  });

  const { data: deadlines = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/legal-deadlines', caseId],
    queryFn: async () => {
      const res = await fetch(`/api/legal-deadlines?caseId=${caseId}`, { headers: getAuthHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!caseId && caseId.length > 0,
  });

  // Build unified timeline from all sources
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const timelineItems: { date: string; label: string; subLabel: string; icon: any; urgency: "overdue" | "soon" | "normal" }[] = [];

  const classify = (dateStr: string): "overdue" | "soon" | "normal" => {
    const d = new Date(dateStr);
    const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) return "overdue";
    if (days <= 7) return "soon";
    return "normal";
  };

  // Hearing dates (upcoming only in the timeline)
  for (const h of hearings) {
    if (h.hearingDate && h.status !== "ملغية" && h.status !== "مؤجلة") {
      timelineItems.push({
        date: h.hearingDate,
        label: `جلسة — ${h.courtName || ""}`,
        subLabel: h.status === "تمت" ? "تمت" : "قادمة",
        icon: Gavel,
        urgency: classify(h.hearingDate),
      });
    }
  }

  // Memo deadlines
  for (const m of memos) {
    if (m.deadline && m.status !== "معتمدة" && m.status !== "مرفوعة" && m.status !== "ملغاة") {
      timelineItems.push({
        date: m.deadline,
        label: m.title || "مذكرة",
        subLabel: m.status || "",
        icon: FileText,
        urgency: classify(m.deadline),
      });
    }
  }

  // Response deadline from case
  if (responseDeadline) {
    timelineItems.push({
      date: responseDeadline,
      label: "مهلة الرد",
      subLabel: "موعد نهائي للرد",
      icon: AlertTriangle,
      urgency: classify(responseDeadline),
    });
  }

  // Legal deadlines
  for (const d of deadlines) {
    if (d.deadlineDate && d.status !== "مكتمل" && d.status !== "فائت") {
      timelineItems.push({
        date: d.deadlineDate,
        label: d.title || DeadlineTypeLabels[d.deadlineType] || d.deadlineType,
        subLabel: "موعد نظامي",
        icon: Calendar,
        urgency: classify(d.deadlineDate),
      });
    }
  }

  // Field task due dates
  for (const t of fieldTasks) {
    if (t.dueDate && t.status !== "مكتملة" && t.status !== "ملغاة") {
      timelineItems.push({
        date: t.dueDate,
        label: t.title || "مهمة ميدانية",
        subLabel: t.status || "",
        icon: ClipboardList,
        urgency: classify(t.dueDate),
      });
    }
  }

  // Sort by date, nearest first
  timelineItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const urgencyClass = (u: string) => {
    if (u === "overdue") return "border-destructive/50 bg-destructive/5 text-destructive";
    if (u === "soon") return "border-yellow-500/50 bg-yellow-50/10 text-yellow-700 dark:text-yellow-400";
    return "border-border bg-muted/20";
  };

  const addDeadlineMutation = useMutation({
    mutationFn: async () => {
      const deadlineDate = form.deadlineDate || (() => {
        const start = new Date(form.startDate);
        start.setDate(start.getDate() + form.durationDays);
        return start.toISOString().split("T")[0];
      })();
      const res = await apiRequest("POST", "/api/legal-deadlines", {
        ...form,
        caseId,
        deadlineDate,
        durationDays: Number(form.durationDays),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/legal-deadlines', caseId] });
      setShowAdd(false);
      setForm({ deadlineType: "objection", title: "", description: "", startDate: "", durationDays: 30, deadlineDate: "" });
      toast({ title: "تمت إضافة الموعد النظامي" });
    },
  });

  const deleteDeadlineMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/legal-deadlines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/legal-deadlines', caseId] });
      toast({ title: "تم حذف الموعد" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/legal-deadlines/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/legal-deadlines', caseId] });
    },
  });

  function getDaysLeft(deadlineDate: string) {
    const diff = (new Date(deadlineDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return Math.ceil(diff);
  }

  function getStatusColor(deadline: any) {
    const daysLeft = getDaysLeft(deadline.deadlineDate);
    if (deadline.status === "مكتمل") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (deadline.status === "فائت" || daysLeft < 0) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (daysLeft <= 3) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Unified timeline */}
      <div>
        <h3 className="text-sm font-semibold mb-2">جدول المواعيد الموحد</h3>
        {timelineItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد مواعيد قادمة</p>
        ) : (
          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {timelineItems.map((item, i) => {
              const Icon = item.icon;
              const daysLeft = Math.ceil((new Date(item.date).getTime() - today.getTime()) / 86400000);
              return (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-md border text-sm ${urgencyClass(item.urgency)}`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.label}</p>
                    <p className="text-xs opacity-70">{item.subLabel}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <DualDateDisplay date={item.date} compact />
                    <p className="text-xs text-center mt-0.5">
                      {daysLeft < 0 ? `متأخر ${Math.abs(daysLeft)} يوم` : daysLeft === 0 ? "اليوم" : `بعد ${daysLeft} يوم`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">المواعيد النظامية</h3>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-deadline">
            <Plus className="h-4 w-4 ml-1" />
            إضافة موعد
          </Button>
        </div>
      </div>

      {showAdd && (
        <div className="space-y-3 p-3 rounded-md border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>نوع الموعد</Label>
              <Select value={form.deadlineType} onValueChange={(v) => setForm({ ...form, deadlineType: v, title: DeadlineTypeLabels[v] || "" })}>
                <SelectTrigger data-testid="select-deadline-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DeadlineTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>العنوان</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-deadline-title" />
            </div>
            <div>
              <Label>تاريخ البداية</Label>
              <HijriDatePicker value={form.startDate} onChange={(v) => {
                const start = new Date(v);
                start.setDate(start.getDate() + form.durationDays);
                setForm({ ...form, startDate: v, deadlineDate: start.toISOString().split("T")[0] });
              }} data-testid="input-deadline-start" />
            </div>
            <div>
              <Label>المدة (بالأيام)</Label>
              <Input type="number" value={form.durationDays} onChange={(e) => {
                const days = Number(e.target.value);
                if (form.startDate) {
                  const start = new Date(form.startDate);
                  start.setDate(start.getDate() + days);
                  setForm({ ...form, durationDays: days, deadlineDate: start.toISOString().split("T")[0] });
                } else {
                  setForm({ ...form, durationDays: days });
                }
              }} data-testid="input-deadline-duration" />
            </div>
            <div className="col-span-2">
              <Label>تاريخ الانتهاء</Label>
              <HijriDatePicker value={form.deadlineDate} onChange={(v) => setForm({ ...form, deadlineDate: v })} data-testid="input-deadline-date" />
            </div>
          </div>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="وصف إضافي..."
            className="min-h-[60px]"
            data-testid="input-deadline-description"
          />
          <div className="flex items-center gap-2">
            <Button onClick={() => addDeadlineMutation.mutate()} disabled={!form.title || !form.startDate || !form.deadlineDate || addDeadlineMutation.isPending} data-testid="button-save-deadline">
              حفظ
            </Button>
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
      ) : deadlines.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">لا توجد مواعيد نظامية</div>
      ) : (
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {deadlines.map((deadline: any) => {
            const daysLeft = getDaysLeft(deadline.deadlineDate);
            return (
              <div key={deadline.id} className={`p-3 rounded-md border ${getStatusColor(deadline)}`} data-testid={`deadline-${deadline.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium text-sm">{deadline.title}</span>
                    <Badge variant="outline" className="text-xs">{DeadlineTypeLabels[deadline.deadlineType] || deadline.deadlineType}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {deadline.status === "نشط" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: deadline.id, status: "مكتمل" })}
                        data-testid={`button-complete-deadline-${deadline.id}`}
                      >
                        مكتمل
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDeadlineMutation.mutate(deadline.id)}
                      data-testid={`button-delete-deadline-${deadline.id}`}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span>من: <DualDateDisplay date={deadline.startDate} compact /></span>
                  <span>إلى: <DualDateDisplay date={deadline.deadlineDate} compact /></span>
                  <span>المدة: {deadline.durationDays} يوم</span>
                  {deadline.status === "نشط" && (
                    <span className="font-bold">
                      {daysLeft > 0 ? `باقي ${daysLeft} يوم` : daysLeft === 0 ? "ينتهي اليوم" : `متأخر ${Math.abs(daysLeft)} يوم`}
                    </span>
                  )}
                  {deadline.status !== "نشط" && (
                    <Badge variant="secondary" className="text-xs">{deadline.status}</Badge>
                  )}
                </div>
                {deadline.description && (
                  <p className="text-xs mt-1 opacity-80">{deadline.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
