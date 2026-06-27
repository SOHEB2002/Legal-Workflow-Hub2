import { useState, useRef, useEffect } from "react";
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
  UserPlus, CheckSquare, Phone, FileSignature, Stamp, CalendarClock, FileDown, Flame, Users, Plus,
  ChevronDown, ChevronLeft, ListChecks, Search, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useContracts } from "@/lib/contracts-context";
import { useClients } from "@/lib/clients-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { OnBehalfBadge } from "@/components/acting-for-banner";
import { HearingResultDialog } from "@/components/hearing-result-dialog";
import { CaseStagePanel } from "@/components/case-stage-panel";
import { MemoAdvancePanel } from "@/components/memo-advance-panel";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { BidiText } from "@/components/ui/bidi-text";
import {
  MyTaskKind, TaskSpecialty, TaskSpecialtyLabels, FieldTaskStatus, FieldTaskType, InternalReviewDecision,
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
  general_task: { icon: ListChecks, label: "مهمة عامة" },
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

// ----- General-task optional entity link -----
// A manually-created general (عام) task may optionally be linked to ONE of a
// case / consultation / contract / client (or none = free-standing). The picker
// reuses the existing entity context lists (no new fetchers) and writes the id
// into the matching field (caseId / consultationId / contractId / clientId).
type LinkType = "none" | "case" | "consultation" | "contract" | "client";
const LINK_TYPE_LABELS: Record<LinkType, string> = {
  none: "بدون ربط", case: "قضية", consultation: "استشارة", contract: "عقد", client: "عميل",
};

function EntityLinkPicker({
  linkType, linkId, onChange,
}: {
  linkType: LinkType;
  linkId: string;
  onChange: (linkType: LinkType, linkId: string) => void;
}) {
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { contracts } = useContracts();
  const { clients, getClientName } = useClients();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Candidate {id,label,sublabel} list for the active link type, drawn from the
  // already-loaded context lists (search by number/name + the secondary field).
  const options: { id: string; label: string; sublabel: string }[] =
    linkType === "case"
      ? cases.map((c) => ({ id: c.id, label: c.caseNumber, sublabel: getClientName(c.clientId) }))
      : linkType === "consultation"
      ? consultations.map((c) => ({ id: c.id, label: c.consultationNumber, sublabel: getClientName(c.clientId) }))
      : linkType === "contract"
      ? contracts.map((c) => ({ id: c.id, label: c.contractNumber, sublabel: c.title }))
      : linkType === "client"
      ? clients.map((c) => ({ id: c.id, label: getClientName(c.id), sublabel: c.phone || "" }))
      : [];

  const q = search.trim().toLowerCase();
  const filtered = (q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel.toLowerCase().includes(q))
    : options
  ).slice(0, 50);
  const selectedLabel = linkId ? options.find((o) => o.id === linkId)?.label ?? "" : "";

  return (
    <div className="space-y-2">
      <Label>ربط بكيان (اختياري)</Label>
      <div className="grid grid-cols-2 gap-3">
        <Select
          value={linkType}
          onValueChange={(v) => { onChange(v as LinkType, ""); setSearch(""); }}
        >
          <SelectTrigger data-testid="select-link-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(LINK_TYPE_LABELS) as LinkType[]).map((t) => (
              <SelectItem key={t} value={t}>{LINK_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {linkType !== "none" && (
          <div ref={wrapperRef} className="relative">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                data-testid="input-link-search"
                value={open || !selectedLabel ? search : selectedLabel}
                onChange={(e) => { setSearch(e.target.value); setOpen(true); if (linkId) onChange(linkType, ""); }}
                onFocus={() => setOpen(true)}
                placeholder={`ابحث عن ${LINK_TYPE_LABELS[linkType]}…`}
                className="pr-9 pl-8"
              />
              {linkId && (
                <button
                  type="button"
                  onClick={() => { onChange(linkType, ""); setSearch(""); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  data-testid="button-clear-link"
                ><X className="w-4 h-4" /></button>
              )}
            </div>
            {open && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                {filtered.length > 0 ? filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    data-testid={`option-link-${o.id}`}
                    className="w-full text-right px-3 py-2 text-sm hover-elevate cursor-pointer flex items-center justify-between gap-2"
                    onClick={() => { onChange(linkType, o.id); setSearch(""); setOpen(false); }}
                  >
                    <span>{o.label}</span>
                    {o.sublabel && <span className="text-muted-foreground text-xs">{o.sublabel}</span>}
                  </button>
                )) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Per-kind button-label override (takes precedence over ACTION_LABEL[actionHint]).
// Used where a kind needs a more specific verb than its generic hint and that
// hint is shared by other kinds — e.g. data_completion uses the "complete" hint
// (shared with field_task/collection/legal_deadline) but is really a "تم
// التواصل" acknowledgement, and session_report_export confirms the export.
const KIND_ACTION_LABEL: Partial<Record<MyTaskKindValue, string>> = {
  [MyTaskKind.SESSION_REPORT_EXPORT]: "تأكيد التصدير",
  [MyTaskKind.DATA_COMPLETION]: "تم التواصل",
};

// Pinned to the top under the "المستعجلة" (urgent) heading: hearings (+ their
// actions: report/agency) and unassigned case-assignment tasks. The internal
// "pinned" naming is the pin-to-top mechanism; the user-facing label is urgent.
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
    case MyTaskKind.DATA_COMPLETION: return { mode: "confirm", title: "تأكيد التواصل لاستكمال البيانات" };
    case MyTaskKind.AGENCY_VERIFICATION: return { mode: "confirm", title: "تأكيد التحقق من الوكالة" };
    case MyTaskKind.DELEGATION_APPROVAL: return { mode: "confirm", title: "اعتماد التفويض" };
    case MyTaskKind.CONTACT_FOLLOWUP: return { mode: "confirm", title: "إنهاء متابعة العميل" };
    case MyTaskKind.LEGAL_DEADLINE: return { mode: "confirm", title: "إنجاز الموعد القانوني" };
    case MyTaskKind.FIELD_TASK:
    case MyTaskKind.COLLECTION:
    // General (عام) tasks share the basic complete/assign action for now; the
    // complete-with-result → return-to-requester lifecycle lands in sub-step 3.
    case MyTaskKind.GENERAL_TASK:
      // Unassigned pool item (server sends actionHint:"assign") → assign it;
      // an assigned task → complete it.
      return task.ownerId
        ? { mode: "complete", title: "إكمال المهمة" }
        : { mode: "assign", title: "إسناد المهمة لموظف" };
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
  // case_unassigned can route to a specific lawyer OR a whole department
  // (item 7); field-task assign uses assigneeId only.
  assigneeId: string; assignTarget: "lawyer" | "department"; assignDeptId: string;
  hearingReport: string; recommendations: string; nextSteps: string; contactCompleted: string;
}
const EMPTY_FORM: ActionForm = {
  notes: "", proofDescription: "", proofFileLink: "",
  reason: "", decision: InternalReviewDecision.PASSED,
  assigneeId: "", assignTarget: "lawyer", assignDeptId: "",
  hearingReport: "", recommendations: "", nextSteps: "", contactCompleted: "no",
};

// Build the (method, url, body) for a task action. Reuses existing endpoints.
function buildActionRequest(task: MyTaskItem, form: ActionForm): { method: string; url: string; body?: unknown } {
  const e = task.entityId;
  switch (task.kind) {
    case MyTaskKind.SESSION_REPORT_EXPORT: return { method: "POST", url: `/api/hearings/${e}/mark-report-exported` };
    case MyTaskKind.DATA_COMPLETION: return { method: "POST", url: `/api/cases/${e}/ack-data-completion` };
    case MyTaskKind.AGENCY_VERIFICATION: return { method: "POST", url: `/api/hearings/${e}/ack-agency-verification` };
    case MyTaskKind.DELEGATION_APPROVAL: return { method: "POST", url: `/api/delegations/${e}/approve` };
    case MyTaskKind.CONTACT_FOLLOWUP: return { method: "PATCH", url: `/api/contact-logs/${e}`, body: { followUpCompleted: true } };
    case MyTaskKind.LEGAL_DEADLINE: return { method: "PATCH", url: `/api/legal-deadlines/${e}`, body: { status: "مكتمل" } };
    case MyTaskKind.FIELD_TASK:
    case MyTaskKind.COLLECTION:
    case MyTaskKind.GENERAL_TASK:
      // Unassigned pool → assign (set assignedTo); otherwise complete the task.
      return task.ownerId
        ? { method: "PATCH", url: `/api/field-tasks/${e}`, body: {
            status: FieldTaskStatus.COMPLETED, completionNotes: form.notes,
            proofDescription: form.proofDescription, proofFileLink: form.proofFileLink,
          } }
        : { method: "PATCH", url: `/api/field-tasks/${e}`, body: { assignedTo: form.assigneeId } };
    case MyTaskKind.CONSULTATION_CLOSING: return { method: "POST", url: `/api/consultations/${e}/early-close`, body: { reason: form.reason } };
    case MyTaskKind.HEARING_REPORT:
      return { method: "POST", url: `/api/hearings/${e}/report`, body: {
        hearingReport: form.hearingReport, recommendations: form.recommendations,
        nextSteps: form.nextSteps, contactCompleted: form.contactCompleted === "yes",
      } };
    case MyTaskKind.CASE_UNASSIGNED:
      // Reuse PATCH /api/cases/:id: routing to a department sets departmentId
      // (a case assigned to a dept-but-no-lawyer — the dept_head then picks a
      // lawyer); routing to a lawyer sets primaryLawyerId (item 7).
      return form.assignTarget === "department"
        ? { method: "PATCH", url: `/api/cases/${e}`, body: { departmentId: form.assignDeptId } }
        : { method: "PATCH", url: `/api/cases/${e}`, body: { primaryLawyerId: form.assigneeId } };
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
        {KIND_ACTION_LABEL[task.kind] ?? ACTION_LABEL[task.actionHint] ?? "إجراء"}
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

// Clickable collapse/expand header (chevron + title + optional count badge),
// used for every department / member / pool group in the supervisory views.
// RTL: open → chevron points down; collapsed → points right (ChevronLeft).
function GroupHeader({ open, onToggle, title, count, titleClass, testId }: {
  open: boolean; onToggle: () => void; title: string; count?: number;
  titleClass?: string; testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 text-right"
      data-testid={testId}
    >
      {open
        ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        : <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={`flex-1 min-w-0 ${titleClass ?? ""}`}><BidiText>{title}</BidiText></span>
      {typeof count === "number" && (
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      )}
    </button>
  );
}

export default function MyTasksPage() {
  const { user, users } = useAuth();
  const { departments } = useDepartments();
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
    linkType: "none" as LinkType, linkId: "", assigneeId: "",
  });
  const [creating, setCreating] = useState(false);
  // Collapsed group keys (dept:<id> / member:<id> / pool:<id>). Empty = all
  // expanded by default; a key present means that group is collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const isOpen = (key: string) => !collapsed.has(key);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const { data: tasks = [], isLoading } = useQuery<MyTaskItem[]>({
    queryKey: ["/api/my-tasks"],
    refetchInterval: 30000, // supervisory feed — poll every 30s
    enabled: !!user,
  });

  const userName = (id: string): string =>
    users.find((u) => u.id === id)?.name || (id ? id : "غير مُسند");

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
    if (mode === "assign") {
      const toDept = actionTask.kind === MyTaskKind.CASE_UNASSIGNED && form.assignTarget === "department";
      if (toDept && !form.assignDeptId) { toast({ title: "اختر القسم المسند إليه", variant: "destructive" }); return; }
      if (!toDept && !form.assigneeId) { toast({ title: "اختر المسند إليه", variant: "destructive" }); return; }
    }
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
      // Manually-created tasks are GENERAL (عام) tasks. Reuse the existing
      // field-task create endpoint + its assignment logic (default assignee =
      // self; managers/dept_head may pick someone else). The optional entity
      // link writes into exactly ONE of caseId/consultationId/contractId/
      // clientId per the chosen link type; the rest stay null.
      const { linkType, linkId } = createForm;
      await apiRequest("POST", "/api/field-tasks", {
        title: createForm.title,
        description: createForm.description,
        taskType: FieldTaskType.GENERAL,
        priority: createForm.priority,
        dueDate: createForm.dueDate,
        caseId: linkType === "case" ? linkId || null : null,
        consultationId: linkType === "consultation" ? linkId || null : null,
        contractId: linkType === "contract" ? linkId || null : null,
        clientId: linkType === "client" ? linkId || null : null,
        assignedTo: (canAssignToOthers && createForm.assigneeId) ? createForm.assigneeId : user?.id,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/my-tasks"] });
      toast({ title: "تمت إضافة المهمة" });
      setShowCreate(false);
      setCreateForm({ title: "", description: "", dueDate: "", priority: "متوسط", linkType: "none", linkId: "", assigneeId: "" });
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
  // Count EVERY overdue row the user actually sees (own + team), so the card
  // matches the red rows. The old `own`-only count read 0 for a manager whose
  // overdue rows are all team-scoped (ownerScope:"team").
  const overdueCount = visible.filter((t) => t.isOverdue).length;

  const teamByMember = new Map<string, MyTaskItem[]>();
  for (const t of team) {
    const arr = teamByMember.get(t.ownerId) ?? [];
    arr.push(t);
    teamByMember.set(t.ownerId, arr);
  }

  // ----- Supervisory rosters (dept_head "team" + branch_manager firm view) -----
  // Driven by the USER ROSTER, not just task-owners, so every member shows even
  // with zero tasks ("لا يوجد") and never silently disappears (item 5). Members
  // sorted by Arabic name; their tasks urgent-first via pinAndSort.
  const activeUsers = users.filter((u) => u.isActive);
  const isLawyerRole = (r: string) => r === "employee" || r === "department_head";
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ar");
  const memberTasks = (id: string) => pinAndSort(teamByMember.get(id) ?? []);
  const memberTaskCount = (id: string) => teamByMember.get(id)?.length ?? 0;

  // admin_support has no department, so it gets a dedicated section (item 8).
  const adminSupportMembers = activeUsers.filter((u) => u.role === "admin_support").sort(byName);
  // Each department → its lawyer members (employee + department_head) (item 5).
  const deptRoster = departments
    .map((d) => ({ dept: d, members: activeUsers.filter((u) => isLawyerRole(u.role) && u.departmentId === d.id).sort(byName) }))
    .filter((g) => g.members.length > 0);
  // Owners that appear in team tasks but aren't covered by the rosters above
  // (data drift / a non-lawyer non-admin_support owner) — surfaced under a
  // fallback group so a task is NEVER hidden. "" (unassigned) is the pool below.
  const rosterIds = new Set<string>([
    ...adminSupportMembers.map((u) => u.id),
    ...deptRoster.flatMap((g) => g.members.map((u) => u.id)),
  ]);
  const leftoverOwnerIds = Array.from(teamByMember.keys()).filter((id) => id !== "" && !rosterIds.has(id));
  const unassignedPool = pinAndSort(teamByMember.get("") ?? []);

  // One member row: collapsible header (name + task count), then the member's
  // tasks or "لا يوجد" when they have none.
  const renderMemberRow = (id: string, name: string) => {
    const key = `member:${id}`;
    const open = isOpen(key);
    const items = memberTasks(id);
    return (
      <div key={id} className="space-y-2 ps-2">
        <GroupHeader open={open} onToggle={() => toggle(key)} title={name} count={items.length}
          titleClass="text-xs font-semibold text-muted-foreground" testId={`team-member-${id}`} />
        {open && (items.length === 0
          ? <p className="ps-6 text-xs text-muted-foreground">لا يوجد</p>
          : <div className="space-y-2">{items.map((t) => <TaskRow key={t.id} task={t} onAction={handleAction} />)}</div>)}
      </div>
    );
  };

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
        <SummaryCard label="المستعجلة" value={pinned.length} />
        {(isDeptHead || isBranchManager) && <SummaryCard label="مهام الفريق" value={team.length} />}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="space-y-2" data-testid="section-pinned">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Flame className="h-4 w-4" /> المستعجلة — جلسات وإسناد قضايا
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

          {/* dept_head — every member of THEIR department (item 5), each
              member's list collapsible (item 6). */}
          {isDeptHead && (
            <section className="space-y-3" data-testid="section-team">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users className="h-4 w-4" /> مهام الفريق
              </h2>
              {activeUsers
                .filter((u) => isLawyerRole(u.role) && !!user?.departmentId && u.departmentId === user.departmentId)
                .sort(byName)
                .map((u) => renderMemberRow(u.id, u.name))}
              {leftoverOwnerIds.map((id) => renderMemberRow(id, userName(id)))}
              {unassignedPool.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground">مهام غير مُسندة</h3>
                  <div className="space-y-2 ps-2">{unassignedPool.map((t) => <TaskRow key={t.id} task={t} onAction={handleAction} />)}</div>
                </div>
              )}
            </section>
          )}

          {/* branch_manager — firm-wide: department→member tree (collapsible at
              both levels, item 6), a dedicated admin_support section (item 8,
              also where turki/item 3 lands), every member shown even at zero
              tasks (item 5), and the unassigned pool to assign from (item 2). */}
          {isBranchManager && (
            <section className="space-y-4" data-testid="section-firm">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users className="h-4 w-4" /> مهام الفرع (حسب القسم)
              </h2>
              {deptRoster.map(({ dept, members }) => {
                const key = `dept:${dept.id}`;
                const open = isOpen(key);
                const count = members.reduce((n, u) => n + memberTaskCount(u.id), 0);
                return (
                  <div key={dept.id} className="space-y-2 rounded-md border p-3">
                    <GroupHeader open={open} onToggle={() => toggle(key)} title={dept.name} count={count}
                      titleClass="text-sm font-bold" testId={`team-dept-${dept.id}`} />
                    {open && members.map((u) => renderMemberRow(u.id, u.name))}
                  </div>
                );
              })}

              {adminSupportMembers.length > 0 && (() => {
                const key = "dept:admin_support";
                const open = isOpen(key);
                const count = adminSupportMembers.reduce((n, u) => n + memberTaskCount(u.id), 0);
                return (
                  <div className="space-y-2 rounded-md border p-3">
                    <GroupHeader open={open} onToggle={() => toggle(key)} title="قسم الدعم الإداري" count={count}
                      titleClass="text-sm font-bold" testId="team-dept-admin-support" />
                    {open && adminSupportMembers.map((u) => renderMemberRow(u.id, u.name))}
                  </div>
                );
              })()}

              {leftoverOwnerIds.length > 0 && (() => {
                const key = "dept:other";
                const open = isOpen(key);
                const count = leftoverOwnerIds.reduce((n, id) => n + memberTaskCount(id), 0);
                return (
                  <div className="space-y-2 rounded-md border p-3">
                    <GroupHeader open={open} onToggle={() => toggle(key)} title="أعضاء آخرون" count={count}
                      titleClass="text-sm font-bold" testId="team-dept-other" />
                    {open && leftoverOwnerIds.map((id) => renderMemberRow(id, userName(id)))}
                  </div>
                );
              })()}

              {unassignedPool.length > 0 && (() => {
                const key = "pool:unassigned";
                const open = isOpen(key);
                return (
                  <div className="space-y-2 rounded-md border p-3">
                    <GroupHeader open={open} onToggle={() => toggle(key)} title="مهام غير مُسندة" count={unassignedPool.length}
                      titleClass="text-sm font-bold" testId="team-pool-unassigned" />
                    {open && <div className="space-y-2 ps-2">{unassignedPool.map((t) => <TaskRow key={t.id} task={t} onAction={handleAction} />)}</div>}
                  </div>
                );
              })()}
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
                <div className="space-y-3">
                  {/* case_unassigned can route to a specific lawyer OR a whole
                      department (item 7); field-task assign is lawyer-only. */}
                  {actionTask?.kind === MyTaskKind.CASE_UNASSIGNED && (
                    <div className="space-y-1"><Label>إسناد إلى</Label>
                      <Select value={form.assignTarget} onValueChange={(v) => setForm({ ...form, assignTarget: v as "lawyer" | "department" })}>
                        <SelectTrigger data-testid="select-assign-target"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lawyer">محامٍ محدد</SelectItem>
                          <SelectItem value="department">قسم</SelectItem>
                        </SelectContent>
                      </Select></div>
                  )}
                  {actionTask?.kind === MyTaskKind.CASE_UNASSIGNED && form.assignTarget === "department" ? (
                    <div className="space-y-1"><Label>القسم المسند إليه</Label>
                      <Select value={form.assignDeptId} onValueChange={(v) => setForm({ ...form, assignDeptId: v })}>
                        <SelectTrigger data-testid="select-assign-dept"><SelectValue placeholder="اختر قسماً" /></SelectTrigger>
                        <SelectContent>
                          {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                        </SelectContent>
                      </Select></div>
                  ) : (
                    <div className="space-y-1"><Label>{actionTask?.kind === MyTaskKind.CASE_UNASSIGNED ? "المحامي المسند" : "المسند إليه"}</Label>
                      <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                        <SelectTrigger data-testid="select-assignee"><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
                        <SelectContent>
                          {users.filter((u) => u.isActive).map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select></div>
                  )}
                </div>
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
                <HijriDatePicker value={createForm.dueDate} onChange={(v) => setCreateForm({ ...createForm, dueDate: v })} data-testid="input-create-due" /></div>
              <div className="space-y-1"><Label>الأولوية</Label>
                <Select value={createForm.priority} onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="عاجل">عاجل</SelectItem><SelectItem value="عالي">عالي</SelectItem>
                    <SelectItem value="متوسط">متوسط</SelectItem><SelectItem value="منخفض">منخفض</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            <EntityLinkPicker
              linkType={createForm.linkType}
              linkId={createForm.linkId}
              onChange={(linkType, linkId) => setCreateForm({ ...createForm, linkType, linkId })}
            />
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
