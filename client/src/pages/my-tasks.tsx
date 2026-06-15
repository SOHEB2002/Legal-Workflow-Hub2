import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Scale, Gavel, FileText, ClipboardList, ClipboardCheck, AlertTriangle,
  UserPlus, CheckSquare, Phone, FileSignature, Stamp, CalendarClock, FileDown, Pin, Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { OnBehalfBadge } from "@/components/acting-for-banner";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { BidiText } from "@/components/ui/bidi-text";
import {
  MyTaskKind, TaskSpecialty, TaskSpecialtyLabels,
  type MyTaskItem, type MyTaskKindValue, type MyTaskActionHint, type TaskSpecialtyValue,
} from "@shared/schema";

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

// actionHint → the Arabic verb shown on the (PART-1 placeholder) action button.
const ACTION_LABEL: Record<MyTaskActionHint, string> = {
  review: "مراجعة", attend: "حضور", draft: "إنجاز", assign: "إسناد",
  export: "تصدير", approve: "اعتماد", record: "تسجيل", complete: "إكمال",
  follow_up: "متابعة", verify: "تحقق", close: "إغلاق",
};

// Pinned to the top of the personal feed: hearings (+ their actions) and
// case-assignment tasks — the time-critical / must-not-miss kinds.
const PINNED_KINDS = new Set<MyTaskKindValue>([
  MyTaskKind.HEARING_ATTEND, MyTaskKind.HEARING_UNRECORDED, MyTaskKind.HEARING_REPORT,
  MyTaskKind.AGENCY_VERIFICATION, MyTaskKind.CASE_UNASSIGNED,
]);

// Overdue first, then by due date ascending (undated last). Stable enough for display.
function byTime(a: MyTaskItem, b: MyTaskItem): number {
  if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
}

// The single ordering used EVERYWHERE (own feed, every team member group, every
// firm department→member group): pinned kinds first, then the rest — each band
// internally overdue-first by time. So a member's group reads the same way the
// employee's own list does.
function pinAndSort(tasks: MyTaskItem[]): MyTaskItem[] {
  return [...tasks].sort((a, b) => {
    const pr = (PINNED_KINDS.has(a.kind) ? 0 : 1) - (PINNED_KINDS.has(b.kind) ? 0 : 1);
    return pr !== 0 ? pr : byTime(a, b);
  });
}

// One task row. PART 1 is read-only: the action button is a disabled placeholder
// (real in-page actions land in PART 2). No navigation links — this is an
// action hub, not a directory.
function TaskRow({ task }: { task: MyTaskItem }) {
  const meta = KIND_META[task.kind];
  const Icon = meta?.icon ?? ClipboardList;
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
      <Button size="sm" variant="outline" disabled title="سيتم تفعيل الإجراء قريباً" data-testid={`task-action-${task.id}`}>
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
  const [specialtyFilter, setSpecialtyFilter] = useState<"all" | TaskSpecialtyValue>("all");

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

  // admin_support specialty filter (ترافع / استشارات) by each item's specialtyClass.
  const visible = isAdminSupport && specialtyFilter !== "all"
    ? tasks.filter((t) => t.specialtyClass === specialtyFilter)
    : tasks;

  // own = the user's own + delegated-to-them (ownerScope "self"); team = others'
  // tasks surfaced supervisorily (dept_head → their dept; branch_manager → firm).
  const own = visible.filter((t) => t.ownerScope === "self");
  const team = visible.filter((t) => t.ownerScope === "team");

  const pinned = own.filter((t) => PINNED_KINDS.has(t.kind)).sort(byTime);
  const rest = own.filter((t) => !PINNED_KINDS.has(t.kind)).sort(byTime);
  const overdueCount = own.filter((t) => t.isOverdue).length;

  // dept_head team view: group by member (ownerId).
  const teamByMember = new Map<string, MyTaskItem[]>();
  for (const t of team) {
    const arr = teamByMember.get(t.ownerId) ?? [];
    arr.push(t);
    teamByMember.set(t.ownerId, arr);
  }

  // branch_manager firm view: group by department → member.
  const teamByDept = new Map<string, Map<string, MyTaskItem[]>>();
  for (const t of team) {
    const dept = ownerDeptName(t.ownerId);
    const members = teamByDept.get(dept) ?? new Map<string, MyTaskItem[]>();
    const arr = members.get(t.ownerId) ?? [];
    arr.push(t);
    members.set(t.ownerId, arr);
    teamByDept.set(dept, members);
  }

  return (
    <div dir="rtl" className="p-4 md:p-6 space-y-6" data-testid="page-my-tasks">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">مهامي</h1>
          <p className="text-sm text-muted-foreground">كل ما يحتاج إلى إجراء منك في مكان واحد</p>
        </div>
        {isAdminSupport && (
          <Select value={specialtyFilter} onValueChange={(v) => setSpecialtyFilter(v as "all" | TaskSpecialtyValue)}>
            <SelectTrigger className="w-[180px]" data-testid="select-specialty-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التخصصات</SelectItem>
              <SelectItem value={TaskSpecialty.LITIGATION}>{TaskSpecialtyLabels[TaskSpecialty.LITIGATION]}</SelectItem>
              <SelectItem value={TaskSpecialty.CONSULTATIONS}>{TaskSpecialtyLabels[TaskSpecialty.CONSULTATIONS]}</SelectItem>
            </SelectContent>
          </Select>
        )}
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
              <div className="space-y-2">{pinned.map((t) => <TaskRow key={t.id} task={t} />)}</div>
            </section>
          )}

          <section className="space-y-2" data-testid="section-rest">
            <h2 className="text-sm font-semibold text-muted-foreground">مهامي الأخرى</h2>
            {rest.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">لا توجد مهام أخرى.</p>
            ) : (
              <div className="space-y-2">{rest.map((t) => <TaskRow key={t.id} task={t} />)}</div>
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
                  <div className="space-y-2">{pinAndSort(items).map((t) => <TaskRow key={t.id} task={t} />)}</div>
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
                      <div className="space-y-2">{pinAndSort(items).map((t) => <TaskRow key={t.id} task={t} />)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
