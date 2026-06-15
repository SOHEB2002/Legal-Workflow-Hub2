import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Scale, Gavel, FileText, ClipboardList, ClipboardCheck, AlertTriangle,
  UserPlus, CheckSquare, Phone, FileSignature, Stamp, CalendarClock, FileDown, Pin, Users, Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useCases } from "@/lib/cases-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { OnBehalfBadge } from "@/components/acting-for-banner";
import { HearingResultDialog } from "@/components/hearing-result-dialog";
import { CaseStagePanel } from "@/components/case-stage-panel";
import { MemoAdvancePanel } from "@/components/memo-advance-panel";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { BidiText } from "@/components/ui/bidi-text";
import {
  MyTaskKind, TaskSpecialty, TaskSpecialtyLabels, FieldTaskStatus, InternalReviewDecision,
  type MyTaskItem, type MyTaskKindValue, type MyTaskActionHint, type TaskSpecialtyValue, type Hearing, type LawCase, type Memo,
} from "@shared/schema";

// hearing_attend / hearing_unrecorded open the SHARED hearing-result dialog
// (same component the hearings page uses) — not the generic action modal.
const HEARING_RESULT_KINDS = new Set<MyTaskKindValue>([
  MyTaskKind.HEARING_ATTEND, MyTaskKind.HEARING_UNRECORDED,
]);

// case_work + case review_pending open the SHARED CaseStagePanel (the same
// case-progress-bar + workflow callbacks the cases page uses). memo/contract/
// consultation review_pending stay on the generic decision modal.
function isCaseStageKind(task: MyTaskItem): boolean {
  return task.kind === MyTaskKind.CASE_WORK
    || (task.kind === MyTaskKind.REVIEW_PENDING && task.entityType === "case");
}

// Each task kind → an icon and a short Arabic type label (shown under the title).
const KIND_META: Record<MyTaskKindValue, { icon: typeof Scale; label: string }> = {
  case_work: { icon: Scale, label: "عمل على قضية" },
  case_unassigned: { icon: UserPlus, label: "قضية بحاجة لإسناد" },
  hearing_attend: { icon: Gavel, label: "حضور جلسة" },
  hearing_unrecorded: { icon: AlertTriangle, label: "جلسة دون تسجيل نتيجة" },
  hearing_report: { icon: FileText, label: "تقرير جلسة" },
  memo_pending: { icon: FileText, label: "مذكرة" },
  review_pending: { icon: ClipboardCheck, label: "مراجعة" },
  collection: { icon: FileSignature, label: "خطاب تحصيل" },
  legal_deadline: { icon: CalendarClock, label: "موعد قانوني" },
  field_task: { icon: ClipboardList, label: "مهمة ميدانية" },
  contact_followup: { icon: Phone, label: "متابعة عميل" },
  delegation_approval: { icon: Stamp, label: "اعتماد تفويض" },
  consultation_closing: { icon: CheckSquare, label: "إغلاق استشارة" },
  data_completion: { icon: ClipboardList, label: "استكمال بيانات" },
  agency_verification: { icon: ClipboardCheck, label: "التحقق من الوكالة" },
  session_report_export: { icon: FileDown, label: "تصدير تقرير الجلسة" },
};

// actionHint → the Arabic verb shown on the action button.
const ACTION_LABEL: Record<MyTaskActionHint, string> = {
  review: "مراجعة", attend: "حضور", draft: "إنجاز", assign: "إسناد",
  export: "تصدير", approve: "اعتماد", record: "تسجيل", complete: "إكمال",
  follow_up: "متابعة", verify: "تحقق", close: "إغلاق",
};

// Pinned to the top: hearings (+ their actions) and case-assignment tasks.
const PINNED_KINDS = new Set<MyTaskKindValue>([
  MyTaskKind.HEARING_ATTEND, MyTaskKind.HEARING_UNRECORDED, MyTaskKind.HEARING_REPORT,
  MyTaskKind.AGENCY_VERIFICATION, MyTaskKind.CASE_UNASSIGNED,
]);

function byTime(a: MyTaskItem, b: MyTaskItem): number {
  if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
}

// Single ordering used everywhere: pinned first, then the rest — each band
// overdue-first by time.
function pinAndSort(tasks: MyTaskItem[]): MyTaskItem[] {
  return [...tasks].sort((a, b) => {
    const pr = (PINNED_KINDS.has(a.kind) ? 0 : 1) - (PINNED_KINDS.has(b.kind) ? 0 : 1);
    return pr !== 0 ? pr : byTime(a, b);
  });
}

// ===== PART 2 (A): in-page action wiring =====
// Each kind maps to its EXISTING endpoint (permissions + four-eyes + delegation
// are enforced server-side — we never duplicate that here). actionModeFor
// returns the modal shape, or null for kinds PART 2 doesn't wire yet (those keep
// a disabled placeholder; see the report's FLAGS).
type ActionMode = "confirm" | "complete" | "decision" | "assign" | "reason" | "report";

function actionModeFor(task: MyTaskItem): { mode: ActionMode; title: string } | null {
  switch (task.kind) {
    case MyTaskKind.SESSION_REPORT_EXPORT: return { mode: "confirm", title: "تأكيد تصدير تقرير الجلسة" };
    case MyTaskKind.DELEGATION_APPROVAL: return { mode: "confirm", title: "اعتماد التفويض" };
    case MyTaskKind.CONTACT_FOLLOWUP: return { mode: "confirm", title: "إنهاء متابعة العميل" };
    case MyTaskKind.LEGAL_DEADLINE: return { mode: "confirm", title: "إنجاز الموعد القانوني" };
    case MyTaskKind.FIELD_TASK:
    case MyTaskKind.COLLECTION: return { mode: "complete", title: "إكمال المهمة" };
    case MyTaskKind.CONSULTATION_CLOSING: return { mode: "reason", title: "إغلاق الاستشارة" };
    case MyTaskKind.HEARING_REPORT: return { mode: "report", title: "تقرير الجلسة" };
    case MyTaskKind.CASE_UNASSIGNED: return { mode: "assign", title: "إسناد القضية لمحامٍ" };
    case MyTaskKind.REVIEW_PENDING:
      // memo / contract / consultation have dedicated decision endpoints; case
      // review goes through stage transitions (deferred — see report).
      return task.entityType === "case" ? null : { mode: "decision", title: "قرار المراجعة" };
    default:
      // hearing_attend / hearing_unrecorded (result form), memo_pending &
      // case_work (stage advance), data_completion / agency_verification
      // (no backing dismiss field) — deferred. See report FLAGS.
      return null;
  }
}

interface ActionForm {
  notes: string; proofDescription: string; proofFileLink: string;
  reason: string; decision: string;
  assigneeId: string;
  hearingReport: string; recommendations: string; nextSteps: string; contactCompleted: string;
}
const EMPTY_FORM: ActionForm = {
  notes: "", proofDescription: "", proofFileLink: "",
  reason: "", decision: InternalReviewDecision.PASSED,
  assigneeId: "",
  hearingReport: "", recommendations: "", nextSteps: "", contactCompleted: "no",
};

// Build the (method, url, body) for a task action. Reuses existing endpoints.
function buildActionRequest(task: MyTaskItem, form: ActionForm): { method: string; url: string; body?: unknown } {
  const e = task.entityId;
  switch (task.kind) {
    case MyTaskKind.SESSION_REPORT_EXPORT: return { method: "POST", url: `/api/hearings/${e}/mark-report-exported` };
    case MyTaskKind.DELEGATION_APPROVAL: return { method: "POST", url: `/api/delegations/${e}/approve` };
    case MyTaskKind.CONTACT_FOLLOWUP: return { method: "PATCH", url: `/api/contact-logs/${e}`, body: { followUpCompleted: true } };
    case MyTaskKind.LEGAL_DEADLINE: return { method: "PATCH", url: `/api/legal-deadlines/${e}`, body: { status: "مكتمل" } };
    case MyTaskKind.FIELD_TASK:
    case MyTaskKind.COLLECTION:
      return { method: "PATCH", url: `/api/field-tasks/${e}`, body: {
        status: FieldTaskStatus.COMPLETED, completionNotes: form.notes,
        proofDescription: form.proofDescription, proofFileLink: form.proofFileLink,
      } };
    case MyTaskKind.CONSULTATION_CLOSING: return { method: "POST", url: `/api/consultations/${e}/early-close`, body: { reason: form.reason } };
    case MyTaskKind.HEARING_REPORT:
      return { method: "POST", url: `/api/hearings/${e}/report`, body: {
        hearingReport: form.hearingReport, recommendations: form.recommendations,
        nextSteps: form.nextSteps, contactCompleted: form.contactCompleted === "yes",
      } };
    case MyTaskKind.CASE_UNASSIGNED: return { method: "PATCH", url: `/api/cases/${e}`, body: { primaryLawyerId: form.assigneeId } };
    case MyTaskKind.REVIEW_PENDING: {
      const isCommittee = task.id.includes(":committee_");
      const base = task.entityType === "memo" ? "memos" : task.entityType === "contract" ? "contracts" : "consultations";
      return { method: "POST", url: `/api/${base}/${e}/${isCommittee ? "committee-decision" : "internal-review"}`, body: { decision: form.decision, notes: form.notes } };
    }
    default: throw new Error("no action");
  }
}

function TaskRow({ task, onAction }: { task: MyTaskItem; onAction: (t: MyTaskItem) => void }) {
  const meta = KIND_META[task.kind];
  const Icon = meta?.icon ?? ClipboardList;
  const actionable = actionModeFor(task) !== null || HEARING_RESULT_KINDS.has(task.kind)
    || isCaseStageKind(task) || task.kind === MyTaskKind.MEMO_PENDING;
  return (
    <div
      dir="rtl"
      data-testid={`task-row-${task.id}`}
      className={`flex items-center gap-3 rounded-md border p-3 ${task.isOverdue ? "border-red-300 bg-red-50/40 dark:border-red-900 dark:bg-red-950/20" : "bg-card"}`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${task.isOverdue ? "text-red-600" : "text-muted-foreground"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium"><BidiText>{task.title}</BidiText></span>
          {task.specialtyClass && (
            <Badge variant="secondary" className="text-[10px]">{TaskSpecialtyLabels[task.specialtyClass]}</Badge>
          )}
          <OnBehalfBadge userId={task.onBehalfOfUserId} />
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span>{meta?.label ?? task.kind}</span>
          {task.dueDate && (<><span>•</span><DualDateDisplay date={task.dueDate} /></>)}
          {task.isOverdue && <Badge variant="destructive" className="text-[10px]">متأخرة</Badge>}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={!actionable}
        title={actionable ? undefined : "سيتم تفعيل هذا الإجراء قريباً"}
        onClick={() => actionable && onAction(task)}
        data-testid={`task-action-${task.id}`}
      >
        {ACTION_LABEL[task.actionHint] ?? "إجراء"}
      </Button>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${tone === "danger" ? "text-red-600" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default function MyTasksPage() {
  const { user, users } = useAuth();
  const { getDepartmentName } = useDepartments();
  const { cases } = useCases();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [specialtyFilter, setSpecialtyFilter] = useState<"all" | TaskSpecialtyValue>("all");

  // Active action dialog
  const [actionTask, setActionTask] = useState<MyTaskItem | null>(null);
  const [form, setForm] = useState<ActionForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Hearing-result dialog (the shared component) target
  const [resultHearing, setResultHearing] = useState<Hearing | null>(null);
  // Case stage panel (the shared component) target
  const [stageCase, setStageCase] = useState<LawCase | null>(null);
  // Memo advance panel (the shared component) target
  const [advanceMemo, setAdvanceMemo] = useState<Memo | null>(null);

  // Create-task dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "", description: "", dueDate: "", priority: "متوسط",
    caseId: "", assigneeId: "",
  });
  const [creating, setCreating] = useState(false);

  const { data: tasks = [], isLoading } = useQuery<MyTaskItem[]>({
    queryKey: ["/api/my-tasks"],
    refetchInterval: 30000, // supervisory feed — poll every 30s
    enabled: !!user,
  });

  const userName = (id: string): string =>
    users.find((u) => u.id === id)?.name || (id ? id : "غير مُسند");
  const ownerDeptName = (id: string): string => {
    const u = users.find((x) => x.id === id);
    return u?.departmentId ? getDepartmentName(u.departmentId) : "بدون قسم";
  };

  const isAdminSupport = user?.role === "admin_support";
  const isDeptHead = user?.role === "department_head";
  const isBranchManager = user?.role === "branch_manager";
  const canAssignToOthers = isBranchManager || isAdminSupport || isDeptHead;

  // Assignee options for create: dept_head → own dept members; managers → anyone.
  const assignableUsers = users.filter((u) => {
    if (!u.isActive) return false;
    if (isDeptHead && !isBranchManager) return u.departmentId === user?.departmentId;
    return true;
  });

  // ----- actions -----
  function openAction(task: MyTaskItem) {
    setForm({ ...EMPTY_FORM });
    setActionTask(task);
  }

  // Route the row button: hearing-result kinds open the shared result dialog
  // (fetch the full hearing first, since the feed item only carries the id);
  // everything else opens the generic action modal.
  async function handleAction(task: MyTaskItem) {
    if (HEARING_RESULT_KINDS.has(task.kind)) {
      try {
        const res = await apiRequest("GET", `/api/hearings/${task.entityId}`);
        setResultHearing(await res.json());
      } catch (err) {
        toast({ title: "تعذّر فتح الجلسة", description: extractApiError(err), variant: "destructive" });
      }
      return;
    }
    if (isCaseStageKind(task)) {
      // case_work / case review_pending → fetch the full case and open the
      // SHARED CaseStagePanel (the feed item carries only the case id).
      const caseId = task.caseId || task.entityId;
      try {
        const res = await apiRequest("GET", `/api/cases/${caseId}`);
        setStageCase(await res.json());
      } catch (err) {
        toast({ title: "تعذّر فتح القضية", description: extractApiError(err), variant: "destructive" });
      }
      return;
    }
    if (task.kind === MyTaskKind.MEMO_PENDING) {
      // memo_pending → fetch the memo and open the SHARED MemoAdvancePanel.
      try {
        const res = await apiRequest("GET", `/api/memos/${task.entityId}`);
        setAdvanceMemo(await res.json());
      } catch (err) {
        toast({ title: "تعذّر فتح المذكرة", description: extractApiError(err), variant: "destructive" });
      }
      return;
    }
    openAction(task);
  }

  async function refreshAfterAction() {
    // Refetch the feed (the task disappears) + all server-backed react-query
    // views (so the linked entity reflects immediately). Hand-rolled contexts
    // refetch on their own next mount/poll.
    await queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/"),
    });
  }

  async function submitAction() {
    if (!actionTask) return;
    const mode = actionModeFor(actionTask)?.mode;
    if (mode === "reason" && !form.reason.trim()) { toast({ title: "السبب مطلوب", variant: "destructive" }); return; }
    if (mode === "report" && !form.hearingReport.trim()) { toast({ title: "نص التقرير مطلوب", variant: "destructive" }); return; }
    if (mode === "assign" && !form.assigneeId) { toast({ title: "اختر المحامي المسند", variant: "destructive" }); return; }
    if (mode === "decision" && form.decision === InternalReviewDecision.NEEDS_NOTES && !form.notes.trim()) {
      toast({ title: "الملاحظات مطلوبة عند الإرجاع", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const { method, url, body } = buildActionRequest(actionTask, form);
      await apiRequest(method, url, body);
      await refreshAfterAction();
      toast({ title: "تم تنفيذ الإجراء" });
      setActionTask(null);
    } catch (err) {
      toast({ title: "تعذّر تنفيذ الإجراء", description: extractApiError(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCreate() {
    if (!createForm.title.trim() || !createForm.dueDate) {
      toast({ title: "العنوان وتاريخ الاستحقاق مطلوبان", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      // Reuse the existing field-task create endpoint + its assignment logic.
      // Default assignee = self; managers/dept_head may pick someone else.
      await apiRequest("POST", "/api/field-tasks", {
        title: createForm.title,
        description: createForm.description,
        taskType: "أخرى",
        priority: createForm.priority,
        dueDate: createForm.dueDate,
        caseId: createForm.caseId || null,
        assignedTo: (canAssignToOthers && createForm.assigneeId) ? createForm.assigneeId : user?.id,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/my-tasks"] });
      toast({ title: "تمت إضافة المهمة" });
      setShowCreate(false);
      setCreateForm({ title: "", description: "", dueDate: "", priority: "متوسط", caseId: "", assigneeId: "" });
    } catch (err) {
      toast({ title: "تعذّرت إضافة المهمة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  // admin_support specialty filter (ترافع / استشارات).
  const visible = isAdminSupport && specialtyFilter !== "all"
    ? tasks.filter((t) => t.specialtyClass === specialtyFilter)
    : tasks;

  const own = visible.filter((t) => t.ownerScope === "self");
  const team = visible.filter((t) => t.ownerScope === "team");

  const pinned = own.filter((t) => PINNED_KINDS.has(t.kind)).sort(byTime);
  const rest = own.filter((t) => !PINNED_KINDS.has(t.kind)).sort(byTime);
  const overdueCount = own.filter((t) => t.isOverdue).length;

  const teamByMember = new Map<string, MyTaskItem[]>();
  for (const t of team) {
    const arr = teamByMember.get(t.ownerId) ?? [];
    arr.push(t);
    teamByMember.set(t.ownerId, arr);
  }
  const teamByDept = new Map<string, Map<string, MyTaskItem[]>>();
  for (const t of team) {
    const dept = ownerDeptName(t.ownerId);
    const members = teamByDept.get(dept) ?? new Map<string, MyTaskItem[]>();
    const arr = members.get(t.ownerId) ?? [];
    arr.push(t);
    members.set(t.ownerId, arr);
    teamByDept.set(dept, members);
  }

  const currentMode = actionTask ? actionModeFor(actionTask)?.mode : undefined;

  return (
    <div dir="rtl" className="p-4 md:p-6 space-y-6" data-testid="page-my-tasks">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">مهامي</h1>
          <p className="text-sm text-muted-foreground">كل ما يحتاج إلى إجراء منك في مكان واحد</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdminSupport && (
            <Select value={specialtyFilter} onValueChange={(v) => setSpecialtyFilter(v as "all" | TaskSpecialtyValue)}>
              <SelectTrigger className="w-[160px]" data-testid="select-specialty-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التخصصات</SelectItem>
                <SelectItem value={TaskSpecialty.LITIGATION}>{TaskSpecialtyLabels[TaskSpecialty.LITIGATION]}</SelectItem>
                <SelectItem value={TaskSpecialty.CONSULTATIONS}>{TaskSpecialtyLabels[TaskSpecialty.CONSULTATIONS]}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setShowCreate(true)} data-testid="button-add-task">
            <Plus className="h-4 w-4 ms-1" /> إضافة مهمة
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="مهامي" value={own.length} />
        <SummaryCard label="متأخرة" value={overdueCount} tone="danger" />
        <SummaryCard label="مثبتة" value={pinned.length} />
        {(isDeptHead || isBranchManager) && <SummaryCard label="مهام الفريق" value={team.length} />}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="space-y-2" data-testid="section-pinned">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Pin className="h-4 w-4" /> مثبتة — جلسات وإسناد قضايا
              </h2>
              <div className="space-y-2">{pinned.map((t) => <TaskRow key={t.id} task={t} onAction={handleAction} />)}</div>
            </section>
          )}

          <section className="space-y-2" data-testid="section-rest">
            <h2 className="text-sm font-semibold text-muted-foreground">مهامي الأخرى</h2>
            {rest.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">لا توجد مهام أخرى.</p>
            ) : (
              <div className="space-y-2">{rest.map((t) => <TaskRow key={t.id} task={t} onAction={handleAction} />)}</div>
            )}
          </section>

          {isDeptHead && team.length > 0 && (
            <section className="space-y-3" data-testid="section-team">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users className="h-4 w-4" /> مهام الفريق
              </h2>
              {Array.from(teamByMember.entries()).map(([ownerId, items]) => (
                <div key={ownerId} className="space-y-2">
                  <h3 className="text-xs font-semibold"><BidiText>{userName(ownerId)}</BidiText></h3>
                  <div className="space-y-2">{pinAndSort(items).map((t) => <TaskRow key={t.id} task={t} onAction={handleAction} />)}</div>
                </div>
              ))}
            </section>
          )}

          {isBranchManager && team.length > 0 && (
            <section className="space-y-4" data-testid="section-firm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users className="h-4 w-4" /> مهام الفرع (حسب القسم)
              </h2>
              {Array.from(teamByDept.entries()).map(([dept, members]) => (
                <div key={dept} className="space-y-2 rounded-md border p-3">
                  <h3 className="text-sm font-bold">{dept}</h3>
                  {Array.from(members.entries()).map(([ownerId, items]) => (
                    <div key={ownerId} className="space-y-2 ps-2">
                      <h4 className="text-xs font-semibold text-muted-foreground"><BidiText>{userName(ownerId)}</BidiText></h4>
                      <div className="space-y-2">{pinAndSort(items).map((t) => <TaskRow key={t.id} task={t} onAction={handleAction} />)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* ===== Action dialog ===== */}
      <Dialog open={!!actionTask} onOpenChange={(o) => !o && setActionTask(null)}>
        <DialogContent dir="rtl" data-testid="dialog-action">
          <DialogHeader><DialogTitle>{actionTask ? actionModeFor(actionTask)?.title : ""}</DialogTitle></DialogHeader>
          {actionTask && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground"><BidiText>{actionTask.title}</BidiText></p>

              {currentMode === "complete" && (
                <>
                  <div className="space-y-1"><Label>ملاحظات الإنجاز</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-notes" /></div>
                  <div className="space-y-1"><Label>وصف الإثبات (اختياري)</Label>
                    <Input value={form.proofDescription} onChange={(e) => setForm({ ...form, proofDescription: e.target.value })} /></div>
                  <div className="space-y-1"><Label>رابط الإثبات (اختياري)</Label>
                    <Input value={form.proofFileLink} onChange={(e) => setForm({ ...form, proofFileLink: e.target.value })} /></div>
                </>
              )}

              {currentMode === "reason" && (
                <div className="space-y-1"><Label>سبب الإغلاق</Label>
                  <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="input-reason" /></div>
              )}

              {currentMode === "decision" && (
                <>
                  <div className="space-y-1"><Label>القرار</Label>
                    <Select value={form.decision} onValueChange={(v) => setForm({ ...form, decision: v })}>
                      <SelectTrigger data-testid="select-decision"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={InternalReviewDecision.PASSED}>اعتماد</SelectItem>
                        <SelectItem value={InternalReviewDecision.NEEDS_NOTES}>إرجاع مع ملاحظات</SelectItem>
                      </SelectContent>
                    </Select></div>
                  <div className="space-y-1"><Label>ملاحظات {form.decision === InternalReviewDecision.NEEDS_NOTES ? "(مطلوبة)" : "(اختياري)"}</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-decision-notes" /></div>
                </>
              )}

              {currentMode === "assign" && (
                <div className="space-y-1"><Label>المحامي المسند</Label>
                  <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                    <SelectTrigger data-testid="select-assignee"><SelectValue placeholder="اختر محامياً" /></SelectTrigger>
                    <SelectContent>
                      {users.filter((u) => u.isActive).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select></div>
              )}

              {currentMode === "report" && (
                <>
                  <div className="space-y-1"><Label>نص التقرير</Label>
                    <Textarea value={form.hearingReport} onChange={(e) => setForm({ ...form, hearingReport: e.target.value })} data-testid="input-report" /></div>
                  <div className="space-y-1"><Label>التوصيات (اختياري)</Label>
                    <Textarea value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} /></div>
                  <div className="space-y-1"><Label>الخطوات التالية (اختياري)</Label>
                    <Input value={form.nextSteps} onChange={(e) => setForm({ ...form, nextSteps: e.target.value })} /></div>
                  <div className="space-y-1"><Label>تم التواصل مع العميل؟</Label>
                    <Select value={form.contactCompleted} onValueChange={(v) => setForm({ ...form, contactCompleted: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="yes">نعم</SelectItem><SelectItem value="no">لا</SelectItem></SelectContent>
                    </Select></div>
                </>
              )}

              {currentMode === "confirm" && (
                <p className="text-sm">هل تريد تأكيد هذا الإجراء؟</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionTask(null)}>إلغاء</Button>
            <Button onClick={submitAction} disabled={submitting} data-testid="button-confirm-action">
              {submitting ? "جارٍ التنفيذ…" : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Hearing-result dialog (shared with the hearings page) ===== */}
      <HearingResultDialog
        hearing={resultHearing}
        onClose={() => setResultHearing(null)}
        onSuccess={refreshAfterAction}
      />

      {/* ===== Case stage panel (shared with the cases page) ===== */}
      <Dialog open={!!stageCase} onOpenChange={(o) => !o && setStageCase(null)}>
        <DialogContent dir="rtl" className="max-w-2xl" data-testid="dialog-case-stage">
          <DialogHeader><DialogTitle>مسار القضية</DialogTitle></DialogHeader>
          {stageCase && (
            <CaseStagePanel caseItem={stageCase} onChanged={refreshAfterAction} />
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Memo advance panel (shared with the memos page) ===== */}
      <Dialog open={!!advanceMemo} onOpenChange={(o) => !o && setAdvanceMemo(null)}>
        <DialogContent dir="rtl" data-testid="dialog-memo-advance">
          <DialogHeader><DialogTitle>تقدّم المذكرة</DialogTitle></DialogHeader>
          {advanceMemo && (
            <div className="flex flex-wrap gap-2">
              <MemoAdvancePanel memo={advanceMemo} onChanged={refreshAfterAction} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Create dialog ===== */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" data-testid="dialog-create-task">
          <DialogHeader><DialogTitle>إضافة مهمة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>العنوان</Label>
              <Input value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} data-testid="input-create-title" /></div>
            <div className="space-y-1"><Label>الوصف (اختياري)</Label>
              <Textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>تاريخ الاستحقاق</Label>
                <Input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} data-testid="input-create-due" /></div>
              <div className="space-y-1"><Label>الأولوية</Label>
                <Select value={createForm.priority} onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="عاجل">عاجل</SelectItem><SelectItem value="عالي">عالي</SelectItem>
                    <SelectItem value="متوسط">متوسط</SelectItem><SelectItem value="منخفض">منخفض</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            <div className="space-y-1"><Label>ربط بقضية (اختياري)</Label>
              <Select value={createForm.caseId || "none"} onValueChange={(v) => setCreateForm({ ...createForm, caseId: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-create-case"><SelectValue placeholder="بدون قضية" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون قضية</SelectItem>
                  {cases.slice(0, 200).map((c) => (<SelectItem key={c.id} value={c.id}>{c.caseNumber}</SelectItem>))}
                </SelectContent>
              </Select></div>
            {canAssignToOthers && (
              <div className="space-y-1"><Label>إسناد إلى (افتراضياً أنت)</Label>
                <Select value={createForm.assigneeId || "self"} onValueChange={(v) => setCreateForm({ ...createForm, assigneeId: v === "self" ? "" : v })}>
                  <SelectTrigger data-testid="select-create-assignee"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">أنا</SelectItem>
                    {assignableUsers.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                  </SelectContent>
                </Select></div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button onClick={submitCreate} disabled={creating} data-testid="button-submit-create">
              {creating ? "جارٍ الإضافة…" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
