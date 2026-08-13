import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  UserPlus, CheckSquare, Phone, FileSignature, Stamp, CalendarClock, FileDown, Users, Plus,
  ChevronDown, ChevronLeft, ListChecks, Clock, Archive, Send, Eye, Briefcase, Paperclip, PauseCircle,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useFieldTasks } from "@/lib/field-tasks-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useContracts } from "@/lib/contracts-context";
import { useClients } from "@/lib/clients-context";
import { EntityLinkPicker, type LinkType } from "@/components/entity-link-picker";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { OnBehalfBadge } from "@/components/acting-for-banner";
import { HearingResultDialog } from "@/components/hearing-result-dialog";
import { CaseStagePanel } from "@/components/case-stage-panel";
import { CaseDetailsDialog } from "@/components/case-details-dialog";
import { MemoAdvancePanel } from "@/components/memo-advance-panel";
import { MemoStagesBar } from "@/components/memo-stages-bar";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { BidiText } from "@/components/ui/bidi-text";
import {
  MyTaskKind, TaskSpecialty, TaskSpecialtyLabels, FieldTaskStatus, FieldTaskType, InternalReviewDecision,
  AssignableAdminSupportTaskKind, FollowUpStatus,
  GeneralTaskEventType, GeneralTaskEventTypeLabels, DelegationReasonLabels,
  type MyTaskItem, type MyTaskKindValue, type MyTaskActionHint, type MyTaskEntityType, type TaskSpecialtyValue, type Hearing, type LawCase, type Memo, type MemoStageValue,
  type GeneralTaskEventTypeValue, type FieldTask, type DelegationRecord,
} from "@shared/schema";

// hearing_attend / hearing_unrecorded open the SHARED hearing-result dialog
// (same component the hearings page uses) — not the generic action modal.
const HEARING_RESULT_KINDS = new Set<MyTaskKindValue>([
  MyTaskKind.HEARING_ATTEND, MyTaskKind.HEARING_UNRECORDED,
]);

// The general (عام) task kinds — every lifecycle state of a manually-created
// task. Their requester + free-text details live on the FULL field task (via
// getTaskById), not the feed item, so we surface them on the card + in the modal.
const GENERAL_KINDS = new Set<MyTaskKindValue>([
  MyTaskKind.GENERAL_TASK, MyTaskKind.GENERAL_TASK_REVIEW, MyTaskKind.GENERAL_TASK_DISTRIBUTE,
  MyTaskKind.GENERAL_TASK_APPROVE, MyTaskKind.GENERAL_TASK_AWAITING_DISTRIBUTION,
]);

// The assignable admin_support task types (collection / execution /
// consultation_closing / session_report_export / the 4 data_completion work-types).
// When one is UNASSIGNED (ownerId="") it only ever
// surfaces to the branch_manager's pool, and the manager's "إسناد" SETS THE TYPE
// OWNER via the mapping (uniform sub-step-4 path) — not a per-instance assign.
const ASSIGNABLE_TYPE_KINDS = new Set<string>(Object.values(AssignableAdminSupportTaskKind));
function isUnassignedTypeTask(task: MyTaskItem): boolean {
  return !task.ownerId && ASSIGNABLE_TYPE_KINDS.has(task.kind);
}

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
  // The consultation twin of case_work. Its own icon rather than case_work's
  // Scale or memo_pending's FileText, because those two already carry meanings
  // in this list and a third row wearing either would read as one of them.
  consultation_work: { icon: MessageSquare, label: "عمل على استشارة" },
  // The صك arrived; its FILE is still not on the case. Paperclip matches
  // hearing_minutes, the app's other "a document is missing" item, so the two
  // attachment chores read as the same kind of work at a glance.
  judgment_deed_attach: { icon: Paperclip, label: "إرفاق صك الحكم" },
  case_unassigned: { icon: UserPlus, label: "قضية بحاجة لإسناد" },
  consultation_unassigned: { icon: UserPlus, label: "استشارة بحاجة لإسناد" },
  contract_unassigned: { icon: UserPlus, label: "عقد بحاجة لإسناد" },
  hearing_attend: { icon: Gavel, label: "حضور جلسة" },
  hearing_unrecorded: { icon: AlertTriangle, label: "جلسة دون تسجيل نتيجة" },
  hearing_report: { icon: FileText, label: "تقرير جلسة" },
  // Deliberately NOT in PINNED_KINDS, unlike its three hearing siblings. The
  // ضبط is issued by the court on its own schedule, so this task can sit open
  // legitimately for a while; pinning it would park a permanent row in the
  // urgent section. It also has no getActionConfig case on purpose — attaching
  // needs a file picker, which the inline action dialog has no mode for, so it
  // falls to the `default: return null` arm (same as hearing_attend and
  // hearing_unrecorded) and the user opens the hearing, where the control lives.
  // Masdar form, matching the server-generated item title
  // ("إرفاق ضبط الجلسة — قضية X") and the sibling action chips
  // ("إسناد مهمة", "اعتماد نتيجة مهمة").
  hearing_minutes: { icon: Paperclip, label: "إرفاق ضبط الجلسة" },
  memo_pending: { icon: FileText, label: "مذكرة" },
  review_pending: { icon: ClipboardCheck, label: "مراجعة" },
  collection: { icon: FileSignature, label: "خطاب تحصيل" },
  execution: { icon: Gavel, label: "طلب تنفيذ" },
  legal_deadline: { icon: CalendarClock, label: "موعد قانوني" },
  field_task: { icon: ClipboardList, label: "مهمة ميدانية" },
  general_task: { icon: ListChecks, label: "مهمة عامة" },
  general_task_review: { icon: ClipboardCheck, label: "مراجعة نتيجة مهمة" },
  general_task_distribute: { icon: UserPlus, label: "إسناد مهمة" },
  general_task_awaiting_distribution: { icon: Clock, label: "بانتظار إسناد القسم" },
  general_task_approve: { icon: Stamp, label: "اعتماد نتيجة مهمة" },
  contact_followup: { icon: Phone, label: "متابعة عميل" },
  delegation_approval: { icon: Stamp, label: "اعتماد تفويض" },
  consultation_closing: { icon: CheckSquare, label: "إغلاق استشارة" },
  data_completion_case: { icon: ClipboardList, label: "استكمال المرفقات والبيانات" },
  data_completion_consultation: { icon: ClipboardList, label: "استكمال المرفقات والبيانات" },
  data_completion_contract: { icon: ClipboardList, label: "استكمال المرفقات والبيانات" },
  data_completion_memo: { icon: ClipboardList, label: "استكمال المرفقات والبيانات" },
  agency_verification: { icon: ClipboardCheck, label: "التحقق من الوكالة" },
  agency_issuance: { icon: Stamp, label: "إصدار وكالة" },
  contract_send: { icon: Send, label: "إرسال العقد" },
  session_report_export: { icon: FileDown, label: "تصدير تقرير الجلسة" },
  // The record is PAUSED and has been for a while. Not an instruction to work
  // on it — the pause still stands — so it carries no inline action; see the
  // isInfoOnly handling in TaskRow for why its disabled button must not promise
  // a "coming soon" activation.
  paused_aging: { icon: PauseCircle, label: "تعليق مستمر" },
  // The ESCALATION row, not admin_support's day-0 task. Info-only on purpose:
  // its action is chasing the client or deciding the record can't proceed, both
  // of which happen on the record — and it must NOT inherit the day-0 kind's
  // "تأكيد التواصل" ack, which would suppress admin_support's own task.
  data_completion_escalated: { icon: AlertTriangle, label: "تأخر استكمال البيانات" },
};

// actionHint → the Arabic verb shown on the action button.
const ACTION_LABEL: Record<MyTaskActionHint, string> = {
  review: "مراجعة", attend: "حضور", draft: "إنجاز", assign: "إسناد",
  export: "تصدير", approve: "اعتماد", record: "تسجيل", complete: "إكمال",
  follow_up: "متابعة", verify: "تحقق", close: "إغلاق",
};

// Per-kind button-label override (takes precedence over ACTION_LABEL[actionHint]).
// Used where a kind needs a more specific verb than its generic hint and that
// hint is shared by other kinds — e.g. data_completion uses the "complete" hint
// (shared with field_task/collection/legal_deadline) but is really a "تم
// التواصل" acknowledgement, and session_report_export confirms the export.
const KIND_ACTION_LABEL: Partial<Record<MyTaskKindValue, string>> = {
  // The task is to ATTACH A FILE, not to record anything. Without this override
  // the row inherited ACTION_LABEL.record ("تسجيل") from its generic actionHint —
  // the same hint hearing_report and hearing_unrecorded carry, where "record" IS
  // the verb. This is the fifth kind to need exactly this treatment.
  [MyTaskKind.HEARING_MINUTES]: "إرفاق",
  [MyTaskKind.SESSION_REPORT_EXPORT]: "تأكيد التصدير",
  [MyTaskKind.CONTRACT_SEND]: "تم الإرسال",
  [MyTaskKind.DATA_COMPLETION_CASE]: "تم الطلب من العميل",
  [MyTaskKind.DATA_COMPLETION_CONSULTATION]: "تم الطلب من العميل",
  [MyTaskKind.DATA_COMPLETION_CONTRACT]: "تم الطلب من العميل",
  [MyTaskKind.DATA_COMPLETION_MEMO]: "تم الطلب من العميل",
  // Requester's informational view of a routed task awaiting distribution — no
  // action for them; the (disabled) button just restates the state.
  [MyTaskKind.GENERAL_TASK_AWAITING_DISTRIBUTION]: "بانتظار الإسناد",
  // Dept-routed task awaiting the head's assignment — the verb is "إسناد",
  // more specific than the generic "assign" hint it shares.
  [MyTaskKind.GENERAL_TASK_DISTRIBUTE]: "إسناد",
};

// Pinned to the top under the "المستعجلة" (urgent) heading: hearings (+ their
// actions: report/agency) and unassigned case-assignment tasks. The internal
// "pinned" naming is the pin-to-top mechanism; the user-facing label is urgent.
const PINNED_KINDS = new Set<MyTaskKindValue>([
  MyTaskKind.HEARING_ATTEND, MyTaskKind.HEARING_UNRECORDED, MyTaskKind.HEARING_REPORT,
  MyTaskKind.AGENCY_VERIFICATION, MyTaskKind.CASE_UNASSIGNED,
  // Pinned with their case sibling — an unassigned record is nobody's work
  // until a head acts, so it must not sink below assigned items.
  MyTaskKind.CONSULTATION_UNASSIGNED, MyTaskKind.CONTRACT_UNASSIGNED,
]);

// ===== THE SIX CARDS =====
// Stacked cards on one page, in the owner's order. A card renders ONLY when it
// holds at least one item for the viewer, and THAT is what makes the page
// role-specific — a lawyer sees قضايا + جلسات, admin_support sees their own set,
// the branch_manager sees all six. No per-role rules, no configuration.
const TASK_CARDS = [
  { key: "cases",         label: "قضايا",     icon: Scale },
  { key: "memos",         label: "مذكرات",    icon: FileText },
  { key: "consultations", label: "استشارات",  icon: MessageSquare },
  { key: "contracts",     label: "عقود",      icon: FileSignature },
  { key: "hearings",      label: "جلسات",     icon: Gavel },
  { key: "other",         label: "مهام أخرى", icon: ClipboardList },
] as const;

type TaskCardKey = typeof TASK_CARDS[number]["key"];

// The department filter's sentinel for "this record belongs to no department".
// A literal rather than "" because Radix SelectItem rejects an empty value, and
// distinct from "all" so the two cannot be confused. Prefixed so it can never
// collide with a real departmentId.
const NO_DEPARTMENT = "__none__";

// The card grid. ONE constant so every place cards are laid out stays in step.
//
// TWO COLUMNS FROM lg (1024px), one below it. Not md (768px): a half-width card
// there is ~360px, and a TaskRow has to fit an Arabic title, a type label, the
// matter identity line, up to three badges and up to three buttons on one row.
// At lg a column is ~500px, which it does fit.
//
// 🔴 RTL — the first card sits on the RIGHT, and that is the grid's own
// behaviour, not something to add. CSS Grid places items along the INLINE axis,
// which `direction: rtl` reverses; the page root carries dir="rtl". Verified
// against the precedent in this same app rather than assumed: the case-details
// TabsList is `grid grid-cols-4 lg:grid-cols-8` under a dir="rtl" DialogContent,
// and its first DOM child (المعلومات) is the RIGHTMOST tab on screen — the owner
// has been reading and requesting edits to that tab strip in that order. No
// physical-direction utilities (ml-/mr-/left-/right-) are used here, so nothing
// can override the logical flow.
//
// items-start, NOT the default stretch. Cards differ wildly in height (twelve
// rows beside two), and stretching turns the short one into a tall mostly-empty
// bordered box, which reads as broken. Sizing each to its content leaves a
// ragged bottom edge inside a row — the honest trade, and the lesser of the two:
// a ragged edge looks like a list, an empty box looks like a bug.
const CARD_GRID = "grid grid-cols-1 lg:grid-cols-2 gap-3 items-start";

// 🔴 KEYED ON entityType, NOT kind, and that is forced by the data rather than
// chosen: review_pending is ONE kind emitted for FOUR entity types (case, memo,
// consultation, contract). A kind→card map would have to force all four into one
// arbitrary card; entityType puts a memo review in مذكرات and a contract review
// in عقود automatically, with no special case.
//
// EXHAUSTIVE Record<MyTaskEntityType, …> on purpose: adding a new entityType to
// the feed fails the build here rather than silently dropping its tasks off the
// page. Every one of the nine values has exactly one home.
//
// legal_deadline → قضايا by owner ruling. Its case_id is notNull, so a legal
// deadline always belongs to a case; it is the only entityType with no card of
// its own name.
const CARD_BY_ENTITY_TYPE: Record<MyTaskEntityType, TaskCardKey> = {
  case:           "cases",
  legal_deadline: "cases",
  memo:           "memos",
  consultation:   "consultations",
  contract:       "contracts",
  hearing:        "hearings",
  field_task:     "other",
  contact_log:    "other",
  delegation:     "other",
};

// Bucket a task list into the six cards, each bucket sorted by the SHARED
// pinAndSort — urgent kinds float to the top, then overdue-first, then dueDate
// ascending with nulls last. Cards the viewer has nothing for come back empty
// and are not rendered.
function groupIntoCards(items: MyTaskItem[]): Map<TaskCardKey, MyTaskItem[]> {
  const byCard = new Map<TaskCardKey, MyTaskItem[]>();
  for (const t of items) {
    const card = CARD_BY_ENTITY_TYPE[t.entityType];
    const arr = byCard.get(card) ?? [];
    arr.push(t);
    byCard.set(card, arr);
  }
  for (const [k, v] of Array.from(byCard.entries())) byCard.set(k, pinAndSort(v));
  return byCard;
}

// ===== TYPE FILTER =====
// 🔴 THE case_work COLLISION. Five feed items share kind CASE_WORK and differ
// only by the id PREFIX the server stamps — filtering on `kind` alone would
// collapse "chase the صك", "record the objection outcome" and "chase the
// opponent's reply" into one option called "عمل على قضية", which is exactly the
// distinction a user reaching for a type filter is trying to make.
//
// SPLIT ON THE PREFIX, and it is FOUR options rather than five: blocks 1 and 1b
// (stage work / labor settlement direction) BOTH emit `case_work:<id>` and are
// mutually exclusive by stage, so they are one thing to the user anyway.
//
// ⚠ THIS IS STRING PARSING, AND I AM SHIPPING IT WITH A CAVEAT RATHER THAN
// SILENTLY. It is not a NEW fragility — handleAction already routes on these
// same three prefixes, so the coupling to the server's id format exists today
// and is load-bearing. What is new is that a prefix change would break the
// filter SILENTLY (an option that matches nothing) where it breaks handleAction
// loudly (a row that falls through to "no action"). The durable fix is a
// server-side `subKind` on MyTaskItem; until then the prefixes live in ONE
// place here, and handleAction's copies must stay in step.
const CASE_WORK_PREFIXES = [
  { prefix: "judgment_deed:",     key: "judgment_deed",     label: "متابعة استلام الصك" },
  { prefix: "appeal_window:",     key: "appeal_window",     label: "نتيجة مهلة الاعتراض" },
  { prefix: "opponent_response:", key: "opponent_response", label: "متابعة رد الخصم" },
] as const;

// The filter key for one task: its kind, except that CASE_WORK splits four ways.
function taskTypeKey(task: MyTaskItem): string {
  if (task.kind !== MyTaskKind.CASE_WORK) return task.kind;
  const hit = CASE_WORK_PREFIXES.find((p) => task.id.startsWith(p.prefix));
  return hit ? hit.key : MyTaskKind.CASE_WORK;
}

function taskTypeLabel(key: string): string {
  const split = CASE_WORK_PREFIXES.find((p) => p.key === key);
  if (split) return split.label;
  return KIND_META[key as MyTaskKindValue]?.label ?? key;
}

// ===== SEARCH =====
// Everything the ITEM already carries that a user might type, plus the owner's
// NAME — which is not on the item but is resolvable from the loaded user list.
// `title` is the richest field: the server composes it with the case/memo/
// consultation number already inside, so a plain substring match over it covers
// most of what anyone types.
//
// ⚠ clientName IS ABSENT ON CONSULTATION AND CONTRACT TASKS. The feed's identity
// enrichment (getCaseIdentitiesForFeed) is keyed on caseId, so consultations and
// contracts — which have clients of their own in the DB — carry no clientName.
// Searching a client's name therefore finds their CASE and MEMO and HEARING
// tasks and silently misses their consultations and contracts. Closing it means
// enriching those two entity types server-side; see the batch report.
function taskMatchesSearch(task: MyTaskItem, needle: string, ownerName: string): boolean {
  if (!needle) return true;
  const haystack = [
    task.title,
    task.caseNumber ?? "",
    task.clientName ?? "",
    task.opponentName ?? "",
    ownerName,
    KIND_META[task.kind]?.label ?? "",
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

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
type ActionMode = "confirm" | "complete" | "decision" | "assign" | "reason" | "report" | "review" | "distribute" | "approve" | "delegationDecision" | "executionRequest" | "agencyAnswer";

function actionModeFor(task: MyTaskItem): { mode: ActionMode; title: string } | null {
  // Unassigned admin_support task (only ever surfaced to the branch_manager's
  // pool) → the action is "إسناد" which SETS THE TYPE OWNER (uniform across all 3
  // assignable kinds), not a per-instance assignment. Assigned ones fall through
  // to their normal do-the-work action below.
  if (isUnassignedTypeTask(task)) return { mode: "assign", title: "إسناد نوع المهمة لموظف الدعم" };
  switch (task.kind) {
    case MyTaskKind.SESSION_REPORT_EXPORT: return { mode: "confirm", title: "تأكيد تصدير تقرير الجلسة" };
    // Assigned admin_support send task → simple confirm (تم الإرسال → contract goes
    // to مغلقة); unassigned is handled by the isUnassignedTypeTask branch above.
    case MyTaskKind.CONTRACT_SEND: return { mode: "confirm", title: "تأكيد إرسال العقد" };
    case MyTaskKind.DATA_COMPLETION_CASE:
    case MyTaskKind.DATA_COMPLETION_CONSULTATION:
    case MyTaskKind.DATA_COMPLETION_CONTRACT:
    case MyTaskKind.DATA_COMPLETION_MEMO:
      return { mode: "confirm", title: "تأكيد التواصل لاستكمال البيانات" };
    case MyTaskKind.AGENCY_VERIFICATION: return { mode: "agencyAnswer", title: "التحقق من الوكالة" };
    // Assigned admin_support issuance task → simple confirm (تم إصدار الوكالة);
    // unassigned is handled by the isUnassignedTypeTask branch above (→ "إسناد").
    case MyTaskKind.AGENCY_ISSUANCE: return { mode: "confirm", title: "تأكيد إصدار الوكالة" };
    case MyTaskKind.DELEGATION_APPROVAL: return { mode: "delegationDecision", title: "قرار التفويض" };
    case MyTaskKind.CONTACT_FOLLOWUP: return { mode: "confirm", title: "إنهاء متابعة العميل" };
    case MyTaskKind.LEGAL_DEADLINE: return { mode: "confirm", title: "إنجاز الموعد القانوني" };
    case MyTaskKind.FIELD_TASK:
    case MyTaskKind.COLLECTION:
    // General (عام) tasks share the basic complete/assign action for now; the
    // complete-with-result → return-to-requester lifecycle lands in sub-step 3.
    case MyTaskKind.GENERAL_TASK:
      // Unassigned pool item (server sends actionHint:"assign") → assign it;
      // an assigned task → complete it (write the result note on completion).
      return task.ownerId
        ? { mode: "complete", title: "إكمال المهمة" }
        : { mode: "assign", title: "إسناد المهمة لموظف" };
    case MyTaskKind.EXECUTION:
      // Assigned → record رقم طلب التنفيذ (input modal); unassigned is handled by
      // the isUnassignedTypeTask branch above (→ "إسناد" sets the mapping).
      return { mode: "executionRequest", title: "رفع طلب تنفيذ" };
    case MyTaskKind.GENERAL_TASK_REVIEW:
      // The original requester reviews the returned result: تم الاطلاع (close) or
      // ملاحظة (send back to the worker). The modal also shows the worker's result.
      return { mode: "review", title: "مراجعة نتيجة المهمة" };
    case MyTaskKind.GENERAL_TASK_DISTRIBUTE:
      // The dept_head (or a delegate / branch_manager) hands a dept-routed task
      // sitting in بانتظار_التوزيع to a member of the routed department (or
      // himself) — sub-step 6. The member then does the work as a normal task.
      return { mode: "distribute", title: "إسناد المهمة" };
    case MyTaskKind.GENERAL_TASK_APPROVE:
      // The dept_head (or delegate / branch_manager) approves or returns the
      // member's result on a بانتظار_الاعتماد task — sub-step 8. Approve → on to
      // the requester; ملاحظة → back to the member. Shows the result + thread.
      return { mode: "approve", title: "اعتماد نتيجة المهمة" };
    case MyTaskKind.CONSULTATION_CLOSING: return { mode: "reason", title: "إغلاق الاستشارة" };
    case MyTaskKind.HEARING_REPORT: return { mode: "report", title: "تقرير الجلسة" };
    case MyTaskKind.CASE_UNASSIGNED: return { mode: "assign", title: "إسناد القضية لمحامٍ" };
    // Person-only assign (no department toggle — that is a case-specific route).
    // The shared modal already renders the plain "المسند إليه" dropdown for any
    // assign kind that is not CASE_UNASSIGNED, so no new modal branch is needed.
    case MyTaskKind.CONSULTATION_UNASSIGNED: return { mode: "assign", title: "إسناد الاستشارة" };
    case MyTaskKind.CONTRACT_UNASSIGNED: return { mode: "assign", title: "إسناد العقد" };
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
  executionRequestNumber: string;
}
const EMPTY_FORM: ActionForm = {
  notes: "", proofDescription: "", proofFileLink: "",
  reason: "", decision: InternalReviewDecision.PASSED,
  assigneeId: "", assignTarget: "lawyer", assignDeptId: "",
  hearingReport: "", recommendations: "", nextSteps: "", contactCompleted: "no",
  executionRequestNumber: "",
};

// Build the (method, url, body) for a task action. Reuses existing endpoints.
function buildActionRequest(task: MyTaskItem, form: ActionForm): { method: string; url: string; body?: unknown } {
  const e = task.entityId;
  // Unassigned admin_support task → "إسناد" SETS THE TYPE MAPPING: the chosen
  // admin_support becomes this task type's owner going forward (uniform across all
  // 3 assignable kinds; the feed re-resolves live so the task leaves the pool).
  // task.kind is the task_type key; the server gates this (canManageUsers).
  if (isUnassignedTypeTask(task)) {
    return { method: "PUT", url: `/api/admin-support-task-assignments/${task.kind}`, body: { assigneeUserId: form.assigneeId } };
  }
  switch (task.kind) {
    case MyTaskKind.SESSION_REPORT_EXPORT: return { method: "POST", url: `/api/hearings/${e}/mark-report-exported` };
    // "تم الإرسال" → contract auto-advances جاهزة_للإرسال → مغلقة + activity log.
    case MyTaskKind.CONTRACT_SEND: return { method: "POST", url: `/api/contracts/${e}/mark-sent` };
    // Each data-completion work-type acks its own entity (mirrors the case route).
    case MyTaskKind.DATA_COMPLETION_CASE: return { method: "POST", url: `/api/cases/${e}/ack-data-completion` };
    case MyTaskKind.DATA_COMPLETION_CONSULTATION: return { method: "POST", url: `/api/consultations/${e}/ack-data-completion` };
    case MyTaskKind.DATA_COMPLETION_CONTRACT: return { method: "POST", url: `/api/contracts/${e}/ack-data-completion` };
    case MyTaskKind.DATA_COMPLETION_MEMO: return { method: "POST", url: `/api/memos/${e}/ack-data-completion` };
    case MyTaskKind.AGENCY_VERIFICATION:
      // Two-option answer: يوجد (task ends) / لا يوجد (task ends + flags the case
      // for the sub-step-2 admin_support issuance). Defaults to يوجد if untouched.
      // Grouped (sub-step 3): one answer applies to ALL hearings of the same موكّل
      // under this lawyer in the window. groupMemberIds carries them (≥1; a group
      // of 1 falls back to the single entityId).
      return { method: "POST", url: `/api/hearings/agency-verify-group`, body: {
        hearingIds: task.groupMemberIds ?? [e],
        answer: form.decision === "لا يوجد" ? "لا يوجد" : "يوجد",
      } };
    case MyTaskKind.AGENCY_ISSUANCE:
      // Simple confirm (تم إصدار الوكالة → per-case activity log + complete + clear
      // the latch). Grouped (sub-step 3): one confirm satisfies EVERY case of the
      // same موكّل (groupMemberIds; ≥1, a group of 1 falls back to entityId).
      // Unassigned is handled above by isUnassignedTypeTask (→ sets the mapping).
      return { method: "POST", url: `/api/field-tasks/agency-issuance-group`, body: {
        fieldTaskIds: task.groupMemberIds ?? [e],
      } };
    case MyTaskKind.DELEGATION_APPROVAL:
      // اعتماد (default) → /approve; رفض → /reject with the required reason.
      return form.decision === "رفض"
        ? { method: "POST", url: `/api/delegations/${e}/reject`, body: { reason: form.notes } }
        : { method: "POST", url: `/api/delegations/${e}/approve` };
    case MyTaskKind.CONTACT_FOLLOWUP:
      // 🔴 WRITES BOTH COLUMNS. It used to write followUpCompleted alone, which
      // the feed read and NOTHING ELSE did — so completing a follow-up here left
      // the clients-page badge still reading "بانتظار المتابعة", left it in the
      // dashboard's pending count, and left the scheduler still sending its
      // reminders (scheduler.ts skips on followUpStatus, never on this flag).
      // followUpStatus is the canonical column (NOT NULL, typed vocabulary, five
      // readers incl. the scheduler); followUpCompleted is kept in the payload so
      // the feed's other term and any row already carrying it stay consistent.
      return { method: "PATCH", url: `/api/contact-logs/${e}`, body: {
        followUpCompleted: true,
        followUpStatus: FollowUpStatus.COMPLETED,
      } };
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
    case MyTaskKind.EXECUTION:
      // Assigned → record رقم طلب التنفيذ (→ case activity log + complete the task).
      // Unassigned is handled above by isUnassignedTypeTask (→ sets the mapping).
      return { method: "POST", url: `/api/field-tasks/${e}/execution-request`, body: { executionRequestNumber: form.executionRequestNumber } };
    case MyTaskKind.GENERAL_TASK_REVIEW:
      // تم الاطلاع (close) is the default; ملاحظة (send back) requires a note.
      // form.decision carries "ملاحظة" only when the user picks it (leftover
      // decision values from other modes coerce to close).
      return { method: "POST", url: `/api/field-tasks/${e}/review`, body: {
        decision: form.decision === "ملاحظة" ? "ملاحظة" : "تم_الاطلاع",
        reviewNote: form.notes,
      } };
    case MyTaskKind.GENERAL_TASK_DISTRIBUTE:
      // Dedicated endpoint — the server resolves the gate (routed-dept head /
      // delegate / manager) + validates the assignee is a routed-dept member or
      // the head himself, sets قيد_الانتظار, keeps routedDepartmentId.
      return { method: "POST", url: `/api/field-tasks/${e}/distribute`, body: { assignedTo: form.assigneeId } };
    case MyTaskKind.GENERAL_TASK_APPROVE:
      // اعتماد (approve) is the default; ملاحظة (return to the member) requires a
      // note. Mirrors the /review body shape — the server enforces the note.
      return { method: "POST", url: `/api/field-tasks/${e}/approve`, body: {
        decision: form.decision === "ملاحظة" ? "ملاحظة" : "اعتماد",
        reviewNote: form.notes,
      } };
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
    // The DEDICATED assign endpoints, not a bare PATCH: both already exist, are
    // department-scoped for a head, and carry their own validation + activity
    // log. Using PATCH here would bypass that.
    case MyTaskKind.CONSULTATION_UNASSIGNED:
      return { method: "POST", url: `/api/consultations/${e}/assign`, body: { assignedTo: form.assigneeId } };
    case MyTaskKind.CONTRACT_UNASSIGNED:
      return { method: "POST", url: `/api/contracts/${e}/assign`, body: { assignedTo: form.assigneeId } };
    case MyTaskKind.REVIEW_PENDING: {
      const isCommittee = task.id.includes(":committee_");
      const base = task.entityType === "memo" ? "memos" : task.entityType === "contract" ? "contracts" : "consultations";
      return { method: "POST", url: `/api/${base}/${e}/${isCommittee ? "committee-decision" : "internal-review"}`, body: { decision: form.decision, notes: form.notes } };
    }
    default: throw new Error("no action");
  }
}

// Colour-coded badge per event type (extensible — path-2 توزيع/اعتماد slot in
// here later with no other change).
const EVENT_BADGE_CLASS: Record<string, string> = {
  [GeneralTaskEventType.DISTRIBUTED]:        "border-blue-400 text-blue-700 dark:text-blue-400",
  [GeneralTaskEventType.RESULT_SUBMITTED]:   "border-green-400 text-green-700 dark:text-green-400",
  [GeneralTaskEventType.RETURNED_WITH_NOTE]: "border-amber-400 text-amber-700 dark:text-amber-400",
  [GeneralTaskEventType.REVIEWED_CLOSED]:    "border-muted-foreground/40 text-muted-foreground",
  [GeneralTaskEventType.APPROVED]:           "border-emerald-500 text-emerald-700 dark:text-emerald-400",
};

interface ThreadEvent { id: string; actorName: string | null; eventType: string; body: string | null; createdAt: string; }

// The general (عام) task الأخذ والعطا thread — a chronological (oldest→newest)
// conversation of lifecycle events. Fetched per task (key ['field-task-events',
// id]); shown in the worker complete + requester review modals. Renders nothing
// for a task that has no events yet (a fresh task).
function GeneralTaskThread({ taskId }: { taskId: string }) {
  const { data: events, isLoading } = useQuery<ThreadEvent[]>({
    queryKey: ["field-task-events", taskId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/field-tasks/${taskId}/events`);
      return res.json();
    },
  });
  if (isLoading) return <p className="text-xs text-muted-foreground">جارٍ تحميل النشاط…</p>;
  if (!events || events.length === 0) return null;
  return (
    <div className="space-y-2 max-h-44 overflow-y-auto rounded-md border p-2 bg-muted/20" data-testid="general-task-thread">
      <p className="text-xs font-semibold text-muted-foreground">سجل الأخذ والعطا</p>
      {events.map((e) => (
        <div key={e.id} className="text-sm border-t pt-1 first:border-t-0 first:pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{e.actorName || "—"}</span>
            <Badge variant="outline" className={`text-[10px] ${EVENT_BADGE_CLASS[e.eventType] ?? ""}`}>
              {GeneralTaskEventTypeLabels[e.eventType as GeneralTaskEventTypeValue] ?? e.eventType}
            </Badge>
            <DualDateDisplay date={e.createdAt} showTime compact className="text-xs text-muted-foreground" />
          </div>
          {e.body?.trim() && <p className="mt-0.5 text-muted-foreground"><BidiText>{e.body}</BidiText></p>}
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task, onAction, onDetails, onOpenCase }: {
  task: MyTaskItem;
  onAction: (t: MyTaskItem) => void;
  onDetails: (t: MyTaskItem) => void;
  onOpenCase: (t: MyTaskItem) => void;
}) {
  const meta = KIND_META[task.kind];
  const Icon = meta?.icon ?? ClipboardList;
  const { getTaskById } = useFieldTasks();
  const { departments } = useDepartments();
  const { users } = useAuth();
  // General (عام) task context lives on the full field task, not the feed item:
  // WHO requested it (originalRequesterId, written once at creation; assignedBy as
  // a fallback) and its free-text details (description). Surface both so the actor
  // knows what the task is and who asked for it. Non-general kinds skip the lookup.
  const generalFt = GENERAL_KINDS.has(task.kind) ? getTaskById(task.entityId) : undefined;
  const requesterId = generalFt?.originalRequesterId || generalFt?.assignedBy || "";
  const requesterName = requesterId ? (users.find((u) => u.id === requesterId)?.name || requesterId) : "";
  const generalDetails = generalFt?.description?.trim() || "";
  // Dept-routed (path-2) context: show which department the task is flowing
  // through so the head and the requester have it at a glance. Only path-2
  // general tasks carry routedDepartmentId; every other kind leaves it null.
  const routedDeptName = task.routedDepartmentId
    ? (departments.find((d) => d.id === task.routedDepartmentId)?.name || task.routedDepartmentId)
    : "";
  // The awaiting-distribution row is INFORMATIONAL for the requester (no action
  // — it waits on the dept_head), so its disabled button must not promise a
  // "coming soon" activation like the genuinely-unwired kinds do.
  // paused_aging joins it for the same reason: the pause is still in force, so
  // there is nothing to do FROM THIS ROW — resuming or re-dating the pause
  // happens on the record itself (the Briefcase button opens a case-linked one
  // in place). Without this it would fall to the generic disabled-button
  // tooltip and wrongly promise the action is "coming soon".
  const isInfoOnly = task.kind === MyTaskKind.GENERAL_TASK_AWAITING_DISTRIBUTION
    || task.kind === MyTaskKind.PAUSED_AGING
    || task.kind === MyTaskKind.DATA_COMPLETION_ESCALATED;
  const infoOnlyHint = task.kind === MyTaskKind.PAUSED_AGING
    ? "السجل معلّق — افتح السجل لإلغاء التعليق أو تعديل مدته"
    : task.kind === MyTaskKind.DATA_COMPLETION_ESCALATED
    ? "تواصل مع العميل لاستكمال البيانات، أو افتح السجل لاتخاذ قرار بشأنه"
    : "بانتظار قيام رئيس القسم بإسناد المهمة";
  // A general (عام) task back in the worker's list WITH a reviewNote was returned
  // for edits (ملاحظة) — flag it so the worker sees it's a returned task, not a
  // fresh one. Short-circuited for every non-general kind (no lookup cost).
  const wasReturned = task.kind === MyTaskKind.GENERAL_TASK
    && !!getTaskById(task.entityId)?.reviewNote?.trim();
  const actionable = actionModeFor(task) !== null || HEARING_RESULT_KINDS.has(task.kind)
    || isCaseStageKind(task) || task.kind === MyTaskKind.MEMO_PENDING
    // consultation_work has no modal and no endpoint of its own — its action is
    // to OPEN the consultation, handled by a deep-link in handleAction. Listed
    // here so the button enables; see there for why no workflow action was
    // invented for it.
    || task.kind === MyTaskKind.CONSULTATION_WORK
    // Deep-links to the صك dialog (see handleAction) — no modal of its own.
    || task.kind === MyTaskKind.JUDGMENT_DEED_ATTACH
    // Opens the case dialog ON the الجلسات tab, scrolled to THIS hearing, where
    // the ضبط upload control lives. It has no inline modal — attaching needs a
    // file picker the generic action dialog has no mode for — but "no modal" is
    // not "no action", which is what leaving it disabled had been saying.
    || task.kind === MyTaskKind.HEARING_MINUTES;
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
          {wasReturned && (
            <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400" data-testid="badge-returned">أُعيدت للتعديل</Badge>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          <span>{meta?.label ?? task.kind}</span>
          {requesterName && (<><span>•</span><span data-testid={`task-requester-${task.id}`}>من: <BidiText>{requesterName}</BidiText></span></>)}
          {routedDeptName && (<><span>•</span><span data-testid={`task-routed-dept-${task.id}`}>القسم: <BidiText>{routedDeptName}</BidiText></span></>)}
          {task.dueDate && (<><span>•</span><DualDateDisplay date={task.dueDate} /></>)}
          {task.isOverdue && <Badge variant="destructive" className="text-[10px]">متأخرة</Badge>}
        </div>
        {/* Matter identity — WHICH case/client this task is about. The titles carry
            only the case NUMBER, which users could not map to a matter without
            searching the cases page. Server-stamped optional fields (feed
            enrichment): each piece renders only when present, so tasks with no
            case/client link (contracts, delegations, free-standing general tasks)
            keep the exact row they have today. */}
        {(task.clientName || task.opponentName) && (
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground" data-testid={`task-matter-${task.id}`}>
            {task.clientName && <span>العميل: <BidiText>{task.clientName}</BidiText></span>}
            {task.clientName && task.opponentName && <span>•</span>}
            {task.opponentName && <span>ضد: <BidiText>{task.opponentName}</BidiText></span>}
          </div>
        )}
        {generalDetails && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2" data-testid={`task-details-${task.id}`}>
            <BidiText>{generalDetails}</BidiText>
          </p>
        )}
      </div>
      {/* "تفاصيل القضية" — opens the FULL case-details dialog as a modal OVER this
          page (the shared <CaseDetailsDialog>), so the user never leaves مهامي.
          Replaces the earlier navigation link to /cases?openCase=<id>.
          Rendered only for case-linked tasks (task.caseId); a memo-only task has
          no case to show, so it gets no button, as before.
          Icon is Briefcase, NOT Eye: Eye is already this row's general-task
          "تفاصيل المهمة" button, and a general task can carry a caseId — both
          buttons can appear on ONE row, so they must be tellable apart. Ghost +
          secondary, left of the primary action, which stays the dominant control. */}
      {task.caseId && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onOpenCase(task)}
          title="تفاصيل القضية"
          aria-label="تفاصيل القضية"
          data-testid={`task-open-case-${task.id}`}
        >
          <Briefcase className="h-4 w-4" />
        </Button>
      )}
      {/* General (عام) tasks: a "تفاصيل" eye button → full requester + description +
          linked entity (the card can't fit a long description or the entity link). */}
      {GENERAL_KINDS.has(task.kind) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDetails(task)}
          title="تفاصيل المهمة"
          data-testid={`task-details-btn-${task.id}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!actionable}
        title={actionable ? undefined : isInfoOnly ? infoOnlyHint : "سيتم تفعيل هذا الإجراء قريباً"}
        onClick={() => actionable && onAction(task)}
        data-testid={`task-action-${task.id}`}
      >
        {isUnassignedTypeTask(task) ? ACTION_LABEL.assign : (KIND_ACTION_LABEL[task.kind] ?? ACTION_LABEL[task.actionHint] ?? "إجراء")}
      </Button>
    </div>
  );
}

// SummaryCard (the four counter tiles) was removed with the person-grouped
// layout — each of the six cards carries its own count in its header now, and
// tsc --noUnusedLocals is held at 0, so an unreferenced component cannot stay.
// It is in git at 7f5d036 if the redesign wants counters back.

// Clickable collapse/expand header (chevron + optional icon + title + optional
// count badge), used by the six task cards and by the منجزة archive groups.
// RTL: open → chevron points down; collapsed → points right (ChevronLeft).
function GroupHeader({ open, onToggle, title, count, titleClass, testId, icon: Icon }: {
  open: boolean; onToggle: () => void; title: string; count?: number;
  titleClass?: string; testId?: string;
  // Optional so the archive's own headers are untouched; the six cards pass one.
  icon?: typeof Scale;
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
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={`flex-1 min-w-0 ${titleClass ?? ""}`}><BidiText>{title}</BidiText></span>
      {typeof count === "number" && (
        <Badge variant="secondary" className="text-[10px]">{count}</Badge>
      )}
    </button>
  );
}

// One archived (closed) general-task row in the "منجزة" section. Shows the
// title + result + any last review note + when it closed; expanding it reveals
// the full activity thread (read-only — the same GeneralTaskThread the modals
// use). Self-contained expand state so many rows can open independently.
function ArchiveRow({ task, workerName }: { task: FieldTask; workerName: string }) {
  const [open, setOpen] = useState(false);
  const cancelled = task.status === FieldTaskStatus.CANCELLED;
  return (
    <div className="rounded-md border bg-muted/20 p-3" data-testid={`archive-row-${task.id}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-right">
        {open
          ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          : <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="flex-1 min-w-0 text-sm font-medium"><BidiText>{task.title}</BidiText></span>
        <Badge variant={cancelled ? "destructive" : "secondary"} className="text-[10px]">
          {cancelled ? "ملغي" : "مكتمل"}
        </Badge>
      </button>
      <div className="mt-1 ps-6 space-y-0.5 text-xs text-muted-foreground">
        {task.completionNotes?.trim() && (
          <p>النتيجة: <BidiText>{task.completionNotes}</BidiText></p>
        )}
        {task.workerId && <p>النتيجة من: <BidiText>{workerName}</BidiText></p>}
        {task.reviewNote?.trim() && (
          <p>آخر ملاحظة: <BidiText>{task.reviewNote}</BidiText></p>
        )}
        {task.completedAt && (
          <p>أُغلقت: <DualDateDisplay date={task.completedAt} compact /></p>
        )}
      </div>
      {open && <div className="mt-2 ps-6"><GeneralTaskThread taskId={task.id} /></div>}
    </div>
  );
}

export default function MyTasksPage() {
  const { user, users } = useAuth();
  const { departments } = useDepartments();
  // For the GENERAL_TASK_REVIEW modal — the worker's result (completionNotes) +
  // workerId live on the full field task, not the feed item; the field-tasks
  // context already has it loaded app-wide (the requester is assignedTo/assignedBy).
  const { getTaskById } = useFieldTasks();
  // Entity lists for resolving a general task's linked entity in the تفاصيل view;
  // getCaseById also backs the case-details modal opened from a task row.
  const { cases, getCaseById } = useCases();
  const { consultations } = useConsultations();
  const { contracts } = useContracts();
  const { getClientName } = useClients();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [specialtyFilter, setSpecialtyFilter] = useState<"all" | TaskSpecialtyValue>("all");
  // Search + the two zero-cost filters. All three are CLIENT-SIDE over the
  // already-loaded feed — no new request, no server field.
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // 🔴 SPLIT (owner ruling) — القضية and العميل are now TWO independent controls,
  // where they used to be one "القضية أو العميل" select holding both option sets
  // behind "case:" / "client:" value prefixes. They COMPOSE: choosing a case and
  // a client narrows to tasks matching both, which the single control could not
  // express at all — its value was one string, so picking a client REPLACED the
  // chosen case. The prefix parsing (split(":") + rejoin) is gone with it; each
  // select now holds raw values.
  const [caseFilter, setCaseFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  // The overdue toggle — a boolean, not a select, because it has exactly two
  // meaningful states ("everything" / "only the late ones") and a third
  // "not-overdue-only" option is not something anyone asks for.
  //
  // It matters more since bd4a636 than it would have before: isOverdue is no
  // longer only about dated tasks. The age arm (AgeOverdueDays) now marks case
  // work, internal reviews, data completion and deed attachment overdue once
  // they have sat unmoved, so this toggle reaches most of the feed rather than
  // the dated slice of it.
  const [overdueOnly, setOverdueOnly] = useState(false);
  // The department filter. "all" | a departmentId | NO_DEPARTMENT.
  // Keyed on the RECORD's department, stamped server-side (MyTaskItem.departmentId)
  // — deriving it from the owner client-side was rejected: admin_support has no
  // department and the unassigned pool has no owner, so both would have dropped
  // out of the filter entirely.
  const [deptFilter, setDeptFilter] = useState<string>("all");

  // Active action dialog
  const [actionTask, setActionTask] = useState<MyTaskItem | null>(null);
  const [form, setForm] = useState<ActionForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // The full delegation record behind a DELEGATION_APPROVAL task — fetched on
  // open so the decision modal can show from/to/reason/dates/scope (the feed
  // item carries only the enriched title).
  const [delegationRecord, setDelegationRecord] = useState<DelegationRecord | null>(null);
  // Hearing-result dialog (the shared component) target
  const [resultHearing, setResultHearing] = useState<Hearing | null>(null);
  // Case stage panel (the shared component) target
  const [stageCase, setStageCase] = useState<LawCase | null>(null);
  // Full case-details modal (the shared <CaseDetailsDialog>) target — the whole
  // case view, opened OVER this page so the user never leaves مهامي.
  const [detailsCase, setDetailsCase] = useState<LawCase | null>(null);
  // Where that modal should LAND. The Briefcase button leaves both null and gets
  // the المعلومات tab exactly as before; the ضبط task sets them so the user
  // arrives on الجلسات with their own hearing scrolled to and ringed.
  const [detailsTab, setDetailsTab] = useState<string | null>(null);
  const [detailsHearingId, setDetailsHearingId] = useState<string | null>(null);
  // Memo advance panel (the shared component) target
  const [advanceMemo, setAdvanceMemo] = useState<Memo | null>(null);
  // General (عام) task details ("تفاصيل") target — requester + full description +
  // linked entity, read from the full field task (the feed item can't carry them).
  const [detailsTask, setDetailsTask] = useState<MyTaskItem | null>(null);

  // Create-task dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "", description: "", dueDate: "", priority: "متوسط",
    linkType: "none" as LinkType, linkId: "",
    // Two-dropdown assignment (final design): two INDEPENDENT fields, no mode
    // toggle. deptId = the القسم dropdown, assigneeId = the الشخص dropdown.
    // A chosen person → path-1 person-direct; a dept alone → path-2 dept-routed.
    // Open to every role.
    deptId: "", assigneeId: "",
  });
  const [creating, setCreating] = useState(false);
  // ONE Set for every collapsible group on the page. It holds the keys whose
  // state DIFFERS FROM THEIR DEFAULT — not the collapsed ones.
  //
  // 🔴 THE INVERSION IS THE WHOLE REASON FOR THE RENAME. Groups no longer share
  // one default: the six own cards, and the entity cards nested inside a member,
  // open by default — while a MEMBER card starts COLLAPSED (a branch_manager can
  // have ten). A Set meaning "collapsed" cannot express both unless it is SEEDED
  // with every member id, which needs an effect, has to re-run whenever the user
  // list loads, and would then fight the user's own toggles. Storing the
  // DEVIATION instead needs no seeding and no effect: absent = whatever that
  // group's default is. Existing callers pass no default and behave exactly as
  // before.
  //
  // KEYS — distinct literal prefixes, compared by EXACT equality and never
  // parsed, so a userId containing a colon is harmless:
  //   card:<cardKey>                  own entity card              (open)
  //   team-member:<userId>            a team member's card         (COLLAPSED)
  //   member-card:<userId>:<cardKey>  entity card inside a member  (open)
  //   team-pool                       the unassigned pool card     (open)
  //   pool-card:<cardKey>             entity card inside the pool  (open)
  //   archive-member:<userId>         منجزة archive group          (open)
  // `team-card:<cardKey>` is RETIRED — the team region is grouped by member now,
  // so it emits no flat team cards and nothing writes that prefix any more.
  const [toggledGroups, setToggledGroups] = useState<Set<string>>(new Set());
  const isOpen = (key: string, defaultOpen = true) =>
    toggledGroups.has(key) ? !defaultOpen : defaultOpen;
  const toggle = (key: string) =>
    setToggledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const { data: tasks = [], isLoading } = useQuery<MyTaskItem[]>({
    queryKey: ["/api/my-tasks"],
    refetchInterval: 30000, // supervisory feed — poll every 30s
    enabled: !!user,
  });

  // "منجزة" archive — closed general tasks, fetched LAZILY only when the section
  // is expanded (never rides the 30s poll). Server scopes it to feed visibility.
  // Collapsed by default. Invalidated by refreshAfterAction's "/api/" sweep, so
  // closing a task refreshes it while open.
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { data: archivedTasks = [], isLoading: archiveLoading } = useQuery<FieldTask[]>({
    queryKey: ["/api/field-tasks/archive"],
    enabled: !!user && archiveOpen,
  });

  const userName = (id: string): string =>
    users.find((u) => u.id === id)?.name || (id ? id : "غير مُسند");

  const isAdminSupport = user?.role === "admin_support";
  const isDeptHead = user?.role === "department_head";
  const isBranchManager = user?.role === "branch_manager";
  // Person dropdown (الشخص) options for the create modal — open to EVERY role.
  // Filtered by the chosen department: a selected القسم narrows the list to that
  // department's active members; with NO department chosen the FULL active-user
  // list is offered (any department, incl. admin_support members + future
  // committee members — admin_support is not a department row so it is only
  // reachable through this no-department path).
  const personOptions = users.filter((u) => {
    if (!u.isActive) return false;
    if (createForm.deptId) return u.departmentId === createForm.deptId;
    return true;
  });

  // Open the full case-details modal for a case-linked task. The case object comes
  // from the cases context (already loaded app-wide; GET /api/cases is unscoped),
  // with a by-id fetch as the cold-context fallback. Either way the dialog itself
  // hydrates the real stageHistory from GET /api/cases/:id — the list response
  // strips it — so "سجل المراحل" shows the true history here.
  //
  // `landing` is how a TASK opens this dialog somewhere other than المعلومات.
  // Set BEFORE the case itself in both branches, so the dialog never renders one
  // frame on the default tab and then jumps — and cleared when absent, so the
  // Briefcase button (which passes nothing) can never inherit the previous
  // task's landing.
  async function openCaseDetails(
    task: MyTaskItem,
    landing?: { tab?: string; hearingId?: string },
  ) {
    const caseId = task.caseId;
    if (!caseId) return;
    setDetailsTab(landing?.tab ?? null);
    setDetailsHearingId(landing?.hearingId ?? null);
    const known = getCaseById(caseId);
    if (known) { setDetailsCase(known); return; }
    try {
      const res = await apiRequest("GET", `/api/cases/${caseId}`);
      setDetailsCase(await res.json());
    } catch (err) {
      toast({ title: "تعذّر فتح القضية", description: extractApiError(err), variant: "destructive" });
    }
  }

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
    // The judgment-deed follow-up shares kind case_work but NOT its destination:
    // its action is "تسجيل استلام الصك", which lives in the case-details
    // الإجراءات tab. The stage panel would be a dead end — محكوم_حكم_ابتدائي is a
    // terminal stage, so the progress bar shows a badge and no advance button.
    // Deep-link to the case instead (/cases?openCase=<id>, cases.tsx:451-473).
    // إرفاق ضبط الجلسة → the case dialog, ON the الجلسات tab, scrolled to and
    // ringed on THIS hearing — where the ضبط upload control already lives.
    //
    // NO NEW UPLOAD PATH, deliberately. The per-hearing paperclip popover there
    // renders SingleAttachmentControl against /api/hearings/:id/minutes-attachment,
    // the same component and endpoint the hearing dialog uses; a second file
    // picker on this page would be a second implementation of the one thing that
    // must never diverge. This row's job is to get the user to it.
    //
    // Targets the SPECIFIC hearing because the task names one: entityType is
    // "hearing" and entityId IS the hearing id, while caseId is its parent. The
    // tab alone would still have left the user hunting the right row, which on a
    // long-running case is the actual difficulty.
    if (task.kind === MyTaskKind.HEARING_MINUTES) {
      await openCaseDetails(task, { tab: "hearings", hearingId: task.entityId });
      return;
    }
    // The صك ATTACH task shares the receipt task's destination. The same
    // "تسجيل استلام الصك" dialog carries the file control and opens wherever a
    // ruling exists (canRecordJudgmentDeed = caseHasJudgmentRecord &&
    // canActOnCaseWorkflow — a ruling test, not a stage one), and this task's
    // population has a ruling by construction. So no second deep-link action and
    // no new dialog is needed; the lawyer lands on the control they need.
    //
    // ⚠ MATCHED ON THE KIND, NOT THE ID PREFIX. `judgment_deed_attach:…` does NOT
    // satisfy startsWith("judgment_deed:") — the colon differs at index 13 — so
    // the branch below would silently miss it, and the row would fall through to
    // the generic modal and throw "no action".
    if (task.kind === MyTaskKind.JUDGMENT_DEED_ATTACH) {
      setLocation(`/cases?openCase=${task.caseId || task.entityId}&action=judgment-deed`);
      return;
    }
    if (task.id.startsWith("judgment_deed:")) {
      // &action=judgment-deed auto-opens the صك receipt dialog on arrival, so the
      // button performs the ACTION instead of dropping the user in the case file
      // to hunt for it in the الإجراءات tab. cases.tsx re-checks the stage and the
      // permission before opening, and falls back to just showing the case.
      setLocation(`/cases?openCase=${task.caseId || task.entityId}&action=judgment-deed`);
      return;
    }
    // Same reasoning as the صك task above, same mechanism, different action:
    // both of these live at terminal / non-advancing states where the stage
    // panel has nothing to offer, so they deep-link to the case with the ACTION
    // named. cases.tsx re-checks stage + permission on arrival and degrades to
    // "just open the case" if the condition has since cleared.
    //   appeal_window:      → the نتيجة مهلة الاعتراض row (الخصم استأنف / لم يستأنف)
    //   opponent_response:  → the تم استلام رد الخصم row
    // Both rows live in the الإجراءات tab, so the deep-link also selects it.
    if (task.id.startsWith("appeal_window:")) {
      setLocation(`/cases?openCase=${task.caseId || task.entityId}&action=appeal-outcome`);
      return;
    }
    if (task.id.startsWith("opponent_response:")) {
      setLocation(`/cases?openCase=${task.caseId || task.entityId}&action=opponent-response`);
      return;
    }
    // consultation_work → OPEN THE CONSULTATION. Deliberately not a workflow
    // action: advancing a consultation is stage-, type- and cycle-dependent
    // (written / phone / procedural / تعقيبية each resolve a different stage
    // list), the controls live in the consultation's own stage bar, and there is
    // no shared panel this page could mount the way CaseStagePanel and
    // MemoAdvancePanel are mounted above. Inventing a generic "advance" modal
    // here would be a second, thinner implementation of that logic — exactly the
    // divergence the no-DRY workflow rule exists to prevent. So the button does
    // the honest thing and takes the user to where the real controls are.
    // Same mechanism as the judgment_deed / appeal_window / opponent_response
    // deep-links above; the target route already supports ?openConsultation=<id>
    // and opens the details dialog once the row lands in the loaded list.
    if (task.kind === MyTaskKind.CONSULTATION_WORK) {
      setLocation(`/consultations?openConsultation=${task.entityId}`);
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
    if (task.kind === MyTaskKind.DELEGATION_APPROVAL) {
      // Fetch the full delegation so the decision modal can show its details
      // (from/to/reason/dates/scope), then open the generic modal.
      try {
        const res = await apiRequest("GET", `/api/delegations/${task.entityId}`);
        setDelegationRecord(await res.json());
        openAction(task);
      } catch (err) {
        toast({ title: "تعذّر فتح التفويض", description: extractApiError(err), variant: "destructive" });
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
    // The general-task thread query key (['field-task-events', id]) isn't under
    // "/api/", so invalidate it explicitly — keeps the thread current after a
    // worker-complete / requester send-back / close.
    await queryClient.invalidateQueries({ queryKey: ["field-task-events"] });
  }

  async function submitAction() {
    if (!actionTask) return;
    const mode = actionModeFor(actionTask)?.mode;
    if (mode === "reason" && !form.reason.trim()) { toast({ title: "السبب مطلوب", variant: "destructive" }); return; }
    if (mode === "report" && !form.hearingReport.trim()) { toast({ title: "نص التقرير مطلوب", variant: "destructive" }); return; }
    if (mode === "executionRequest" && !form.executionRequestNumber.trim()) { toast({ title: "رقم طلب التنفيذ مطلوب", variant: "destructive" }); return; }
    if (mode === "assign") {
      const toDept = actionTask.kind === MyTaskKind.CASE_UNASSIGNED && form.assignTarget === "department";
      if (toDept && !form.assignDeptId) { toast({ title: "اختر القسم المسند إليه", variant: "destructive" }); return; }
      if (!toDept && !form.assigneeId) { toast({ title: "اختر المسند إليه", variant: "destructive" }); return; }
    }
    if (mode === "decision" && form.decision === InternalReviewDecision.NEEDS_NOTES && !form.notes.trim()) {
      toast({ title: "الملاحظات مطلوبة عند الإرجاع", variant: "destructive" }); return;
    }
    if (mode === "review" && form.decision === "ملاحظة" && !form.notes.trim()) {
      toast({ title: "الملاحظة مطلوبة عند الإعادة", variant: "destructive" }); return;
    }
    if (mode === "distribute" && !form.assigneeId) {
      toast({ title: "اختر المسند إليه", variant: "destructive" }); return;
    }
    if (mode === "delegationDecision" && form.decision === "رفض" && !form.notes.trim()) {
      toast({ title: "سبب الرفض مطلوب", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const { method, url, body } = buildActionRequest(actionTask, form);
      await apiRequest(method, url, body);
      await refreshAfterAction();
      toast({ title: "تم تنفيذ الإجراء" });
      setActionTask(null);
      setDelegationRecord(null);
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
    // Two-dropdown assignment (final design). The body is decided purely by
    // WHICH field(s) are filled:
    //   • person filled  → PATH-1 person-direct (assignedTo = that person). The
    //     department, if also chosen, only filtered the person list — it is NOT
    //     sent. Covers: dept+person, no-dept+person, and self-assign (pick self
    //     → straight to مكتمل, the existing path-1 edge).
    //   • dept only      → PATH-2 dept-routed (routedDepartmentId = dept). The
    //     server resolves the head → assign; >1 → block; head-less → routed +
    //     unassigned, waits for a head. (admin_support is not a dept row, so it
    //     never reaches this path — its members are picked as persons instead.)
    //   • neither        → validation error.
    const dept = createForm.deptId;
    const person = createForm.assigneeId;
    if (!dept && !person) {
      toast({ title: "اختر قسماً أو شخصاً", variant: "destructive" }); return;
    }
    setCreating(true);
    try {
      // Manually-created tasks are GENERAL (عام) tasks. Reuse the existing
      // field-task create endpoint + its assignment logic (default assignee =
      // self; managers/dept_head may pick someone else). The optional entity
      // link writes into exactly ONE of caseId/consultationId/contractId/
      // clientId per the chosen link type; the rest stay null.
      const { linkType, linkId } = createForm;
      const baseBody = {
        title: createForm.title,
        description: createForm.description,
        taskType: FieldTaskType.GENERAL,
        priority: createForm.priority,
        dueDate: createForm.dueDate,
        caseId: linkType === "case" ? linkId || null : null,
        consultationId: linkType === "consultation" ? linkId || null : null,
        contractId: linkType === "contract" ? linkId || null : null,
        clientId: linkType === "client" ? linkId || null : null,
      };
      // Person wins → person-direct body (byte-identical to the working path-1).
      // Dept only → dept-route body (server resolves the head + sets status).
      const body = person
        ? { ...baseBody, assignedTo: person }
        : { ...baseBody, routedDepartmentId: dept };
      await apiRequest("POST", "/api/field-tasks", body);
      await queryClient.invalidateQueries({ queryKey: ["/api/my-tasks"] });
      toast({ title: "تمت إضافة المهمة" });
      setShowCreate(false);
      setCreateForm({ title: "", description: "", dueDate: "", priority: "متوسط", linkType: "none", linkId: "", deptId: "", assigneeId: "" });
    } catch (err) {
      toast({ title: "تعذّرت إضافة المهمة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  // admin_support specialty filter (ترافع / استشارات).
  const specialtyScoped = isAdminSupport && specialtyFilter !== "all"
    ? tasks.filter((t) => t.specialtyClass === specialtyFilter)
    : tasks;

  // ----- Filter option lists, derived from what is actually on the page -----
  // Both dropdowns are built from the LOADED tasks rather than from a roster or
  // the cases list: the options are then guaranteed to match something, the
  // lists stay short, and neither needs a extra fetch. Derived from
  // specialtyScoped (not the filtered result) so choosing one option does not
  // erase the others from the dropdown.
  const typeOptions = Array.from(new Set(specialtyScoped.map(taskTypeKey)))
    .map((key) => ({ key, label: taskTypeLabel(key) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
  // Two lists now, one per control, each derived exactly as the combined one was
  // — from specialtyScoped, so choosing a case does not shorten the client list
  // (and vice versa) and neither can strand the other on an option that no
  // longer matches anything.
  const caseOptions = Array.from(new Set(specialtyScoped.map((t) => t.caseNumber).filter((n): n is string => !!n)))
    .sort((a, b) => a.localeCompare(b, "ar"));
  const clientOptions = Array.from(new Set(specialtyScoped.map((t) => t.clientName).filter((n): n is string => !!n)))
    .sort((a, b) => a.localeCompare(b, "ar"));
  // 🔴 DERIVED FROM THE LOADED TASKS, NOT FROM THE DEPARTMENTS LIST — the same
  // rule as every other filter here, and for the same reason: every option is
  // then guaranteed to match something. Offering all five departments would let
  // a user pick one that empties the page, which is exactly the dead end the
  // "لا توجد نتائج مطابقة" state had to be invented for.
  // The departments CONTEXT is still used, but only to resolve id → NAME; it
  // never contributes options of its own. An id with no matching department row
  // falls back to the raw id rather than disappearing.
  const deptOptions = Array.from(new Set(
    specialtyScoped.map((t) => t.departmentId).filter((id): id is string => !!id)))
    .map((id) => ({ id, name: departments.find((d) => d.id === id)?.name || id }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  // Shown ONLY when something actually has no department — same
  // every-option-matches rule. Delegations and case-less general tasks live
  // here; without it they would be unreachable once the filter is used.
  const hasNoDeptTasks = specialtyScoped.some((t) => !t.departmentId);

  // ----- Apply search + filters, GLOBALLY, before the cards are built -----
  // Not per-card: one predicate over the whole feed, and a card that ends up
  // empty simply does not render — which is already the card rule, so filtering
  // needs no extra hiding logic. The consequence is that filtering can empty the
  // page entirely, which the empty state below distinguishes from "no tasks".
  const needle = search.trim().toLowerCase();
  const visible = specialtyScoped.filter((t) => {
    if (!taskMatchesSearch(t, needle, userName(t.ownerId))) return false;
    if (typeFilter !== "all" && taskTypeKey(t) !== typeFilter) return false;
    // AND, not OR — the two compose, which is the point of splitting them.
    if (caseFilter !== "all" && t.caseNumber !== caseFilter) return false;
    if (clientFilter !== "all" && t.clientName !== clientFilter) return false;
    if (deptFilter === NO_DEPARTMENT) {
      if (t.departmentId) return false;
    } else if (deptFilter !== "all" && t.departmentId !== deptFilter) {
      return false;
    }
    if (overdueOnly && !t.isOverdue) return false;
    return true;
  });
  const isFiltering = !!needle || typeFilter !== "all"
    || caseFilter !== "all" || clientFilter !== "all"
    || deptFilter !== "all" || overdueOnly;

  // OWN AND TEAM DO NOT MIX (owner ruling): the six own cards render first, then
  // a separated team region with its own six. ownerScope is server-computed —
  // scopeOf() returns "team" only for a supervisor looking at someone else's row,
  // so for a plain employee `team` is empty and the region never renders.
  //
  // The unassigned pool (ownerId "") lands in the TEAM region by that same rule,
  // so those rows are still on the page for the people who can assign them —
  // inside their entity card rather than under a heading of their own.
  const own = visible.filter((t) => t.ownerScope === "self");
  const team = visible.filter((t) => t.ownerScope === "team");

  const ownCards = groupIntoCards(own);

  // ===== THE TEAM ROSTER — grouped BY MEMBER (owner ruling) =====
  // This RESTORES the roster 17a786b lost. The team region is no longer six flat
  // entity cards; it is one card per team member, each holding that member's own
  // six entity cards.
  //
  // 🔴 DRIVEN BY THE USER LIST, NOT BY THE TASK LIST — that is the entire point.
  // A member with nothing to do emits no task, so no amount of grouping over the
  // feed can place them; only a roster can. Source is useAuth().users, which is
  // already loaded app-wide (no new request), filtered to ACTIVE users.
  //
  // SCOPE MIRRORS WHAT THE SERVER ALREADY DECIDED, rather than inventing a
  // second rule: scopeOf() tags a row "team" for a department_head only within
  // their OWN department and for a branch_manager firm-wide, so the roster is
  // built to the same shape — department_head → their own department's lawyers;
  // branch_manager → every department's lawyers plus every admin_support member.
  // Any other role gets an EMPTY roster, so a plain employee never sees this.
  //
  // 🔴 `!!user?.departmentId &&` is the standing rule, not decoration: without it
  // a head whose own department is null matches every user with a null
  // department, i.e. the whole firm.
  //
  // ⚠ THE VIEWER IS EXCLUDED FROM THEIR OWN ROSTER, which the old one did NOT do
  // — the single deliberate departure from it. scopeOf() tags the viewer's own
  // rows "self", never "team", so their member card can only ever read
  // "0 — لا يوجد" while their own cards sit directly above holding real work. The
  // old layout rendered a department_head inside their own department list and
  // showed exactly that contradiction. It bites the head only; a branch_manager
  // is in neither role set below and was never in their own roster.
  const rosterCandidates = users.filter((u) => u.isActive && u.id !== user?.id);
  const isLawyerRole = (r: string) => r === "employee" || r === "department_head";
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ar");

  // The old layout carried قسم الدعم الإداري and أعضاء آخرون as DEPARTMENT-LEVEL
  // GROUPS wrapping the member rows. They do NOT come back as groups: the ruling
  // is one card per member, and a department level around them would be a third
  // nesting level (department → member → entity → row) inside a two-column grid.
  // What they carried is preserved as INFORMATION instead — the department name
  // rides in the member's own header, and members stay clustered by department in
  // the sort order, so the firm still reads department by department.
  // WHAT IS GENUINELY LOST, stated plainly rather than approximated: the
  // department-level COLLAPSE and the department-level AGGREGATE COUNT. There is
  // no member card to hang either on.
  // 🔴 admin_support TAKES THE BRANCH_MANAGER ROSTER, and this branch is REQUIRED
  // rather than cosmetic. The server now tags admin_support's feed with
  // ownerScope:"team", so the team region renders for them — but this derivation
  // only had branches for branch_manager and department_head, and admin_support
  // is neither. They would have fallen through to `[]`, i.e. an EMPTY roster
  // while team tasks exist, and every one of those tasks would then have been
  // swept into leftoverMembers — the أعضاء آخرون fallback — appearing as a flat
  // list of unlabelled member cards with no department names and no zero-task
  // members. The tasks would still be reachable, so nothing would break loudly;
  // the roster would simply be silently wrong for the one role that just gained
  // it. Sharing the firm-wide branch keeps the client scoped exactly as the
  // server is, which is the property the whole roster is built on.
  const isFirmWideViewer = isBranchManager || isAdminSupport;
  const rosterMembers: { id: string; name: string; deptLabel: string }[] = isFirmWideViewer
    ? [
        ...departments.flatMap((d) =>
          rosterCandidates
            .filter((u) => isLawyerRole(u.role) && !!u.departmentId && u.departmentId === d.id)
            .sort(byName)
            .map((u) => ({ id: u.id, name: u.name, deptLabel: d.name }))),
        // admin_support has NO department row, so it is reachable by role only —
        // this is where the old قسم الدعم الإداري group's members land.
        ...rosterCandidates
          .filter((u) => u.role === "admin_support")
          .sort(byName)
          .map((u) => ({ id: u.id, name: u.name, deptLabel: "الدعم الإداري" })),
      ]
    : isDeptHead
      ? rosterCandidates
          .filter((u) => isLawyerRole(u.role) && !!user?.departmentId && u.departmentId === user.departmentId)
          .sort(byName)
          .map((u) => ({ id: u.id, name: u.name, deptLabel: "" }))
      : [];

  const teamByMember = new Map<string, MyTaskItem[]>();
  for (const t of team) {
    const arr = teamByMember.get(t.ownerId) ?? [];
    arr.push(t);
    teamByMember.set(t.ownerId, arr);
  }

  // Owners holding a team task who are in no roster above — a deactivated user
  // still owning work, or a role that is neither lawyer nor admin_support. The
  // old "أعضاء آخرون" fallback existed so a task could NEVER be hidden, and that
  // guarantee is kept: they become ordinary member cards, appended last.
  const rosterIds = new Set(rosterMembers.map((m) => m.id));
  const leftoverMembers = Array.from(teamByMember.keys())
    .filter((id) => id !== "" && !rosterIds.has(id))
    .map((id) => ({ id, name: userName(id), deptLabel: "" }))
    .sort(byName);
  const teamMembers = [...rosterMembers, ...leftoverMembers];

  // The unassigned pool ("" owner) belongs to NO member, so it cannot be a
  // member card. It gets its own card at the TOP of the region — see
  // renderPoolCard for why it is the one card here that opens by default.
  const unassignedPool = teamByMember.get("") ?? [];

  // 🔴 WHEN A FILTER IS ACTIVE, A MEMBER WITH NO MATCHES IS HIDDEN, NOT SHOWN
  // EMPTY — and the reason is that "لا يوجد" would be a different claim in each
  // case while reading identically. Unfiltered it means "this person has nothing
  // to do", which is true and is the roster's whole value. Under a filter it
  // would mean "nothing here matched", on a person who may well be the busiest
  // on the team — the same words asserting the opposite of the truth. Ten cards
  // of that also bury the one member who did match. Hiding is also already the
  // page's rule for entity cards, so this needs no new mechanism.
  const visibleMembers = teamMembers.filter(
    (m) => !isFiltering || (teamByMember.get(m.id)?.length ?? 0) > 0);

  // ----- "منجزة" archive derivation -----
  // Newest-closed first (completedAt, falling back to updatedAt/createdAt so a
  // cancelled task with no completedAt still sorts sanely). Supervisors additionally
  // see it grouped by the WORKER who produced the result (workerId — reliably set
  // on every completed general task; falls back to the creator for a task
  // cancelled before anyone worked it).
  const closedTs = (t: FieldTask) => t.completedAt || t.updatedAt || t.createdAt || "";
  const archivedSorted = [...archivedTasks].sort((a, b) => closedTs(b).localeCompare(closedTs(a)));
  const archiveByMember = new Map<string, FieldTask[]>();
  for (const t of archivedSorted) {
    const memberId = t.workerId || t.assignedBy || "";
    const arr = archiveByMember.get(memberId) ?? [];
    arr.push(t);
    archiveByMember.set(memberId, arr);
  }

  // ONE card. Renders nothing when it holds nothing — that emptiness IS the
  // role-specificity, so there is no "لا توجد مهام" state inside a card. The
  // SAME function serves the own region, a member card and the unassigned pool,
  // so all three keep the same six cards, the same order, the same empty-card
  // rule and the same pinAndSort by construction rather than by three copies.
  //
  // keyPrefix is the collapse-key namespace (see the key table above);
  // testIdPrefix defaults to it and exists only so a member's colon-bearing key
  // does not leak into data-testid.
  const renderTaskCard = (
    card: typeof TASK_CARDS[number],
    byCard: Map<TaskCardKey, MyTaskItem[]>,
    keyPrefix: string,
    testIdPrefix: string = keyPrefix,
  ) => {
    const items = byCard.get(card.key) ?? [];
    if (items.length === 0) return null;
    const key = `${keyPrefix}:${card.key}`;
    const open = isOpen(key);
    return (
      <div key={key} className="rounded-lg border p-3 space-y-2" data-testid={`task-card-${testIdPrefix}-${card.key}`}>
        <GroupHeader
          open={open}
          onToggle={() => toggle(key)}
          title={card.label}
          count={items.length}
          icon={card.icon}
          titleClass="text-sm font-bold"
          testId={`task-card-header-${testIdPrefix}-${card.key}`}
        />
        {open && (
          <div className="space-y-2">
            {items.map((t) => (
              <TaskRow key={t.id} task={t} onAction={handleAction} onDetails={setDetailsTask} onOpenCase={openCaseDetails} />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ONE team member: a card holding that member's own six entity cards.
  //
  // 🔴 THE MEMBER CARD IS FULL-WIDTH AND THE ENTITY CARDS INSIDE IT GO TWO-UP —
  // deliberately the opposite nesting to the obvious one. What has to stay
  // readable is the TaskRow, and its width is set by the INNERMOST container, so
  // the right question is which arrangement gives the row the width 7.3 already
  // proved fits. Member cards in the two-column grid would put an entity card
  // inside a ~500px column, leaving the row ~450px after two levels of padding —
  // narrower than anything on the page today. Full-width member cards give the
  // nested entity grid the SAME ~500px column as the own region, i.e. the width
  // that was measured rather than a new one. It also reads better collapsed: ten
  // full-width name+count rows stack into a scannable roster, where ten
  // half-width ones make a ragged 5×2 block that has to be read in two
  // directions — and the roster is the point of this layout.
  //
  // CARD_GRID is reused verbatim, which is what that constant exists for: the
  // breakpoint, the RTL flow and items-start stay in step with the own region.
  const renderMemberCard = (member: { id: string; name: string; deptLabel: string }) => {
    const items = teamByMember.get(member.id) ?? [];
    const key = `team-member:${member.id}`;
    // COLLAPSED BY DEFAULT (owner ruling) — a branch_manager may have ten.
    const open = isOpen(key, false);
    const byCard = groupIntoCards(items);
    return (
      <div key={member.id} className="rounded-lg border p-3 space-y-2" data-testid={`team-member-${member.id}`}>
        <GroupHeader
          open={open}
          onToggle={() => toggle(key)}
          // The department rides in the title rather than in a group wrapping
          // the card — see the roster note above.
          title={member.deptLabel ? `${member.name} — ${member.deptLabel}` : member.name}
          count={items.length}
          icon={Users}
          titleClass="text-sm font-bold"
          testId={`team-member-header-${member.id}`}
        />
        {open && (items.length === 0
          // The roster restoration itself: a member with nothing to do still
          // occupies a card and says so, instead of vanishing off the page.
          ? <p className="ps-6 text-xs text-muted-foreground">لا يوجد</p>
          : (
            <div className={CARD_GRID}>
              {TASK_CARDS.map((card) =>
                renderTaskCard(card, byCard, `member-card:${member.id}`, `member-${member.id}`))}
            </div>
          ))}
      </div>
    );
  };

  // The unassigned pool — tasks with ownerId "" — has no member to sit under, so
  // it gets a card of its own at the TOP of the team region, above the roster.
  //
  // 🔴 IT OPENS BY DEFAULT, the one card here that does, and that is a judgment
  // call rather than an oversight. The collapse-by-default ruling is a VOLUME
  // argument ("a branch_manager may have ten") and the pool is always exactly
  // one card, so the argument does not reach it. Against that, this is the only
  // group on the page that is a call to action — it is how work gets assigned —
  // and it is also the one group whose contents nobody owns, so a collapsed pool
  // is work that no one is looking for. UserPlus is the icon the feed already
  // uses for every *_unassigned kind, so the card reads as "needs assigning"
  // before its title is read.
  const renderPoolCard = () => {
    if (unassignedPool.length === 0) return null;
    const key = "team-pool";
    const open = isOpen(key);
    const byCard = groupIntoCards(unassignedPool);
    return (
      <div className="rounded-lg border border-dashed p-3 space-y-2" data-testid="team-pool">
        <GroupHeader
          open={open}
          onToggle={() => toggle(key)}
          title="مهام غير مُسندة"
          count={unassignedPool.length}
          icon={UserPlus}
          titleClass="text-sm font-bold"
          testId="team-pool-header"
        />
        {open && (
          <div className={CARD_GRID}>
            {TASK_CARDS.map((card) => renderTaskCard(card, byCard, "pool-card"))}
          </div>
        )}
      </div>
    );
  };

  const currentMode = actionTask ? actionModeFor(actionTask)?.mode : undefined;
  // The full field task behind a GENERAL_TASK_REVIEW (requester) or
  // GENERAL_TASK_APPROVE (dept_head) item — both show the worker's result +
  // workerId + proof, which the feed item does not carry.
  const reviewTask = actionTask && (currentMode === "review" || currentMode === "approve")
    ? getTaskById(actionTask.entityId) : undefined;
  // When a GENERAL_TASK (do-the-work) was sent back by the requester via ملاحظة,
  // its reviewNote carries what to fix. Surface it in the worker's complete modal
  // so they can correct before re-completing. Only general (عام) tasks set
  // reviewNote — collection/field/auto never do.
  const returnedNote = actionTask && currentMode === "complete" && actionTask.kind === MyTaskKind.GENERAL_TASK
    ? (getTaskById(actionTask.entityId)?.reviewNote || "").trim()
    : "";
  // Distribute modal (sub-step 6) — the routed department to list members from.
  // A department_head can ONLY distribute a task routed to their OWN department
  // (the server gate enforces exactly this: effectiveDeptHeadDepts → the head's
  // own dept), so for a head the routed dept IS user.departmentId — authoritative
  // and robust even if the feed item's optional routedDepartmentId didn't
  // propagate. A branch_manager (or a delegate acting for a head, whose own role
  // isn't department_head) can distribute another department's task, so they read
  // it from the feed item (with the full field task as a fallback).
  const distributeDeptId = currentMode !== "distribute" ? "" :
    (isDeptHead
      ? (user?.departmentId || "")
      : (actionTask?.routedDepartmentId || getTaskById(actionTask?.entityId ?? "")?.routedDepartmentId || ""));
  // Options = active members of the routed department PLUS the actor himself (the
  // "distribute to myself" edge — a head whose own dept is the routed dept is
  // already in the first set; the id clause also lets a branch_manager pick
  // himself). dedup is natural (one row per user). The server re-validates this.
  const distributeOptions = currentMode === "distribute"
    ? users.filter((u) => u.isActive && (u.departmentId === distributeDeptId || u.id === user?.id))
    : [];

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

      {/* The four counter tiles (مهامي / متأخرة / المستعجلة / مهام الفريق) went
          with the person-grouped layout. Each card now carries its own count in
          its header, and "المستعجلة" no longer exists as a bucket to count. */}

      {/* ===== Search + filters — all client-side over the loaded feed ===== */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في المهام…"
          className="w-full sm:w-[260px]"
          data-testid="input-task-search"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {typeOptions.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={caseFilter} onValueChange={setCaseFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-case-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل القضايا</SelectItem>
            {caseOptions.map((n) => <SelectItem key={n} value={n}>{`قضية ${n}`}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-client-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العملاء</SelectItem>
            {clientOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* القسم — the RECORD's department, from the server-stamped
            MyTaskItem.departmentId. Rendered only when the loaded feed actually
            spans something to choose between: with one department and no
            department-less tasks the control could only ever be a no-op. */}
        {(deptOptions.length > 1 || (deptOptions.length === 1 && hasNoDeptTasks)) && (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-dept-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {deptOptions.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              {hasNoDeptTasks && <SelectItem value={NO_DEPARTMENT}>بدون قسم</SelectItem>}
            </SelectContent>
          </Select>
        )}
        {/* The overdue toggle. A Button whose variant flips, NOT a new Toggle /
            Switch / Checkbox: this row is built from Input + Select + Button and
            Button is already imported, so a variant swap adds no visual language.
            ACTIVE = `destructive`, which is the SAME token the متأخرة badge on
            each overdue row already uses — so the control and the rows it selects
            wear one red rather than two. Inactive = `outline`, which reads as a
            control at rest beside the bordered selects. Default size (min-h-9)
            matches SelectTrigger's h-9.
            No separate × to clear: the button IS its own clear affordance
            (press again), and مسح clears it with everything else. */}
        <Button
          variant={overdueOnly ? "destructive" : "outline"}
          onClick={() => setOverdueOnly((v) => !v)}
          aria-pressed={overdueOnly}
          data-testid="button-overdue-filter"
        >
          <AlertTriangle className="h-4 w-4 ms-1" />
          المتأخرة فقط
        </Button>
        {isFiltering && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Resets every control in THIS row. specialtyFilter is deliberately
              // NOT reset — it lives in the page header, is admin_support-only,
              // and was never cleared by مسح before this batch either.
              setSearch(""); setTypeFilter("all");
              setCaseFilter("all"); setClientFilter("all");
              setDeptFilter("all"); setOverdueOnly(false);
            }}
            data-testid="button-clear-filters"
          >
            مسح
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <>
          {/* ===== THE SIX CARDS — the viewer's OWN tasks ===== */}
          {/* No urgent section: PINNED_KINDS float to the top INSIDE each card
              via pinAndSort, so a hearing still leads جلسات without a band of its
              own above everything. */}
          <section data-testid="section-own-cards">
            {own.length === 0 && team.length === 0 ? (
              // Distinguishes "you have nothing to do" from "your filters
              // matched nothing" — the same blank page otherwise, and the second
              // one is a dead end the user has to guess their way out of.
              <p className="text-sm text-muted-foreground py-4">
                {isFiltering ? "لا توجد نتائج مطابقة." : "لا توجد مهام."}
              </p>
            ) : (
              // renderTaskCard returns null for an empty card, and a null child
              // occupies no grid cell — so hidden cards leave no gap and the
              // remaining ones close up.
              <div className={CARD_GRID}>
                {TASK_CARDS.map((card) => renderTaskCard(card, ownCards, "card"))}
              </div>
            )}
          </section>

          {/* ===== THE TEAM REGION — GROUPED BY MEMBER (owner ruling) =====
              The unassigned pool first (it is the actionable one), then one
              full-width card per team member, each holding that member's own six
              entity cards. Reached only by a supervisor: the roster is empty for
              every other role and scopeOf() tags no row "team" for them either,
              so both terms of the condition are false and the region never
              renders for a plain employee.

              Members are STACKED, not gridded — the nesting rationale is on
              renderMemberCard. The section also renders when there are zero team
              TASKS but a non-empty roster: that is the case the roster exists
              for. */}
          {(visibleMembers.length > 0 || unassignedPool.length > 0) && (
            <section className="space-y-3 border-t pt-5" data-testid="section-team-cards">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users className="h-4 w-4" /> مهام الفريق
              </h2>
              {renderPoolCard()}
              <div className="space-y-3">{visibleMembers.map(renderMemberCard)}</div>
            </section>
          )}

          {/* ===== "منجزة" archive — collapsed by default, at the bottom.
              Closed general tasks move here out of the active feed. Lazy-loaded
              on expand; grouped by worker for supervisors, flat for a user. ===== */}
          <section className="space-y-2" data-testid="section-archive">
            <button
              type="button"
              onClick={() => setArchiveOpen((o) => !o)}
              className="flex w-full items-center gap-2 text-sm font-semibold text-muted-foreground"
              data-testid="archive-header"
            >
              {archiveOpen
                ? <ChevronDown className="h-4 w-4 shrink-0" />
                : <ChevronLeft className="h-4 w-4 shrink-0" />}
              <Archive className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-right">منجزة</span>
              {archiveOpen && <Badge variant="secondary" className="text-[10px]">{archivedSorted.length}</Badge>}
            </button>
            {archiveOpen && (
              archiveLoading ? (
                <p className="ps-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
              ) : archivedSorted.length === 0 ? (
                <p className="ps-6 text-sm text-muted-foreground">لا توجد مهام منجزة.</p>
              ) : (isDeptHead || isBranchManager) ? (
                <div className="space-y-3">
                  {Array.from(archiveByMember.entries()).map(([memberId, items]) => {
                    const key = `archive-member:${memberId}`;
                    const open = isOpen(key);
                    return (
                      <div key={memberId || "unknown"} className="space-y-2 ps-2">
                        <GroupHeader open={open} onToggle={() => toggle(key)}
                          title={memberId ? userName(memberId) : "غير محدد"} count={items.length}
                          titleClass="text-xs font-semibold text-muted-foreground" testId={`archive-member-${memberId}`} />
                        {open && <div className="space-y-2">{items.map((t) => <ArchiveRow key={t.id} task={t} workerName={userName(t.workerId || "")} />)}</div>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {archivedSorted.map((t) => <ArchiveRow key={t.id} task={t} workerName={userName(t.workerId || "")} />)}
                </div>
              )
            )}
          </section>
        </>
      )}

      {/* ===== Action dialog ===== */}
      <Dialog open={!!actionTask} onOpenChange={(o) => { if (!o) { setActionTask(null); setDelegationRecord(null); } }}>
        <DialogContent dir="rtl" data-testid="dialog-action">
          <DialogHeader><DialogTitle>{actionTask ? actionModeFor(actionTask)?.title : ""}</DialogTitle></DialogHeader>
          {actionTask && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground"><BidiText>{actionTask.title}</BidiText></p>

              {/* General (عام) task context: WHO requested it + the details, both
                  read from the full field task (not carried on the feed item). */}
              {GENERAL_KINDS.has(actionTask.kind) && (() => {
                const ft = getTaskById(actionTask.entityId);
                const rid = ft?.originalRequesterId || ft?.assignedBy || "";
                const rname = rid ? userName(rid) : "";
                const details = ft?.description?.trim() || "";
                if (!rname && !details) return null;
                return (
                  <div className="rounded-md border p-2 text-sm space-y-1" data-testid="general-task-context">
                    {rname && <div><span className="text-muted-foreground">من: </span><BidiText>{rname}</BidiText></div>}
                    {details && <div><span className="text-muted-foreground">التفاصيل: </span><BidiText>{details}</BidiText></div>}
                  </div>
                );
              })()}

              {currentMode === "complete" && (
                <>
                  {actionTask.kind === MyTaskKind.GENERAL_TASK && <GeneralTaskThread taskId={actionTask.entityId} />}
                  {returnedNote && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-2 text-sm" data-testid="text-returned-note">
                      <span className="font-semibold">ملاحظة المُراجِع: </span><BidiText>{returnedNote}</BidiText>
                    </div>
                  )}
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

              {currentMode === "executionRequest" && (
                <div className="space-y-1"><Label>رقم طلب التنفيذ</Label>
                  <Input value={form.executionRequestNumber} onChange={(e) => setForm({ ...form, executionRequestNumber: e.target.value })} data-testid="input-execution-request-number" /></div>
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
                          {/* Type-mapping assign (the 3 admin_support kinds) → pick from
                              ACTIVE admin_support only; every other assign keeps all users. */}
                          {users
                            .filter((u) => u.isActive && (!actionTask || !isUnassignedTypeTask(actionTask) || u.role === "admin_support"))
                            .map((u) => (
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

              {currentMode === "review" && (
                <>
                  <GeneralTaskThread taskId={actionTask.entityId} />
                  <div className="space-y-1"><Label>نتيجة المنفّذ</Label>
                    <div className="rounded-md border p-2 text-sm bg-muted/30 whitespace-pre-wrap" data-testid="text-worker-result">
                      <BidiText>{reviewTask?.completionNotes?.trim() || "—"}</BidiText></div>
                    {reviewTask?.workerId && (
                      <p className="text-xs text-muted-foreground">النتيجة من: {users.find((u) => u.id === reviewTask.workerId)?.name || reviewTask.workerId}</p>
                    )}
                    {reviewTask?.routedDepartmentId && (
                      <p className="text-xs text-muted-foreground">القسم: <BidiText>{departments.find((d) => d.id === reviewTask.routedDepartmentId)?.name || reviewTask.routedDepartmentId}</BidiText></p>
                    )}
                    {reviewTask?.proofFileLink?.trim() && (
                      <p className="text-xs text-muted-foreground">رابط الإثبات: <BidiText>{reviewTask.proofFileLink}</BidiText></p>
                    )}
                  </div>
                  <div className="space-y-1"><Label>القرار</Label>
                    <Select value={form.decision === "ملاحظة" ? "ملاحظة" : "تم_الاطلاع"} onValueChange={(v) => setForm({ ...form, decision: v })}>
                      <SelectTrigger data-testid="select-review-decision"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="تم_الاطلاع">تم الاطلاع (إغلاق)</SelectItem>
                        <SelectItem value="ملاحظة">ملاحظة (إعادة للمنفّذ)</SelectItem>
                      </SelectContent>
                    </Select></div>
                  {form.decision === "ملاحظة" && (
                    <div className="space-y-1"><Label>الملاحظة (مطلوبة)</Label>
                      <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-review-note" /></div>
                  )}
                </>
              )}

              {currentMode === "approve" && (
                <>
                  <GeneralTaskThread taskId={actionTask.entityId} />
                  <div className="space-y-1"><Label>نتيجة المنفّذ</Label>
                    <div className="rounded-md border p-2 text-sm bg-muted/30 whitespace-pre-wrap" data-testid="text-approve-result">
                      <BidiText>{reviewTask?.completionNotes?.trim() || "—"}</BidiText></div>
                    {reviewTask?.workerId && (
                      <p className="text-xs text-muted-foreground">النتيجة من: {users.find((u) => u.id === reviewTask.workerId)?.name || reviewTask.workerId}</p>
                    )}
                    {reviewTask?.routedDepartmentId && (
                      <p className="text-xs text-muted-foreground">القسم: <BidiText>{departments.find((d) => d.id === reviewTask.routedDepartmentId)?.name || reviewTask.routedDepartmentId}</BidiText></p>
                    )}
                    {reviewTask?.proofFileLink?.trim() && (
                      <p className="text-xs text-muted-foreground">رابط الإثبات: <BidiText>{reviewTask.proofFileLink}</BidiText></p>
                    )}
                  </div>
                  <div className="space-y-1"><Label>القرار</Label>
                    <Select value={form.decision === "ملاحظة" ? "ملاحظة" : "اعتماد"} onValueChange={(v) => setForm({ ...form, decision: v })}>
                      <SelectTrigger data-testid="select-approve-decision"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="اعتماد">اعتماد</SelectItem>
                        <SelectItem value="ملاحظة">إرجاع بملاحظة (للمنفّذ)</SelectItem>
                      </SelectContent>
                    </Select></div>
                  {form.decision === "ملاحظة" && (
                    <div className="space-y-1"><Label>الملاحظة (مطلوبة)</Label>
                      <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-approve-note" /></div>
                  )}
                </>
              )}

              {currentMode === "distribute" && (
                <div className="space-y-1"><Label>إسناد إلى (عضو من القسم أو أنت)</Label>
                  <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                    <SelectTrigger data-testid="select-distribute-assignee"><SelectValue placeholder="اختر المسند إليه" /></SelectTrigger>
                    <SelectContent>
                      {distributeOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.id === user?.id ? `${u.name} (أنا)` : u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select></div>
              )}

              {currentMode === "delegationDecision" && (
                <>
                  {/* Details block (item 2): who ← whom, reason, window, scope. */}
                  <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30" data-testid="delegation-details">
                    <p>المفوِّض: <span className="font-medium"><BidiText>{userName(delegationRecord?.fromUserId ?? "")}</BidiText></span></p>
                    <p>المفوَّض إليه: <span className="font-medium"><BidiText>{userName(delegationRecord?.toUserId ?? "")}</BidiText></span></p>
                    <p>السبب: {delegationRecord ? (DelegationReasonLabels[delegationRecord.reason] || delegationRecord.reason) : "—"}
                      {delegationRecord?.reasonDetails?.trim() ? <> — <BidiText>{delegationRecord.reasonDetails}</BidiText></> : null}</p>
                    <p>المدة: {delegationRecord ? <>من <DualDateDisplay date={delegationRecord.startDate} /> إلى <DualDateDisplay date={delegationRecord.endDate} /></> : "—"}</p>
                    <p>النطاق: {delegationRecord?.scope === "specific_cases" ? "قضايا محددة" : "جميع القضايا"}</p>
                  </div>
                  <div className="space-y-1"><Label>القرار</Label>
                    <Select value={form.decision === "رفض" ? "رفض" : "اعتماد"} onValueChange={(v) => setForm({ ...form, decision: v })}>
                      <SelectTrigger data-testid="select-delegation-decision"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="اعتماد">اعتماد</SelectItem>
                        <SelectItem value="رفض">رفض</SelectItem>
                      </SelectContent>
                    </Select></div>
                  {form.decision === "رفض" && (
                    <div className="space-y-1"><Label>سبب الرفض (مطلوب)</Label>
                      <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-delegation-reject-reason" /></div>
                  )}
                </>
              )}

              {currentMode === "agencyAnswer" && (
                <div className="space-y-1"><Label>هل توجد وكالة لهذه القضية؟</Label>
                  <Select value={form.decision === "لا يوجد" ? "لا يوجد" : "يوجد"} onValueChange={(v) => setForm({ ...form, decision: v })}>
                    <SelectTrigger data-testid="select-agency-answer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="يوجد">يوجد وكالة</SelectItem>
                      <SelectItem value="لا يوجد">لا يوجد وكالة</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">عند اختيار "لا يوجد وكالة" سيتم تسجيل الحاجة إلى إصدار وكالة لهذه القضية.</p>
                </div>
              )}

              {currentMode === "confirm" && (
                <p className="text-sm">هل تريد تأكيد هذا الإجراء؟</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setActionTask(null); setDelegationRecord(null); }}>إلغاء</Button>
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

      {/* ===== Full case details (the SAME dialog the cases page renders) =====
          Opened as a modal OVER مهامي from a task row's Briefcase button — no
          navigation. `actions` is deliberately OMITTED: the assign / review /
          reject / approve / transfer / reminder / early-close rows and the
          "تعديل البيانات" button belong to case MANAGEMENT on the cases page, and
          this hub owns no such dialogs — so those rows do not render at all here
          (they are not shown as dead buttons). Everything read-only renders, and
          the stage panel still drives the workflow, exactly as the "مسار القضية"
          dialog below already does. */}
      <CaseDetailsDialog
        caseItem={detailsCase}
        open={!!detailsCase}
        initialTab={detailsTab}
        highlightHearingId={detailsHearingId}
        onOpenChange={(o) => {
          if (!o) {
            setDetailsCase(null);
            // Clear the landing with the dialog. Leaving it set would make the
            // NEXT Briefcase click reopen on الجلسات with a stale hearing ringed.
            setDetailsTab(null);
            setDetailsHearingId(null);
          }
        }}
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

      {/* ===== Memo stage timeline + advance (MemoStagesBar shared with the memos page) ===== */}
      <Dialog open={!!advanceMemo} onOpenChange={(o) => !o && setAdvanceMemo(null)}>
        <DialogContent dir="rtl" className="max-w-2xl" data-testid="dialog-memo-advance">
          <DialogHeader><DialogTitle>مسار المذكرة</DialogTitle></DialogHeader>
          {advanceMemo && (
            <div className="space-y-4 min-w-0">
              <div className="text-sm font-medium"><BidiText>{advanceMemo.title}</BidiText></div>
              {/* The memo STAGE BAR — the same numbered-circle timeline the memos
                  page renders and the parallel of the case "مسار القضية" bar; it is
                  contained/scrollable via the component's own min-w-0 overflow-x-auto
                  (the earlier layout fix). Hidden for legacy null-stage memos. */}
              {advanceMemo.currentStage && (
                <MemoStagesBar currentStage={advanceMemo.currentStage as MemoStageValue} />
              )}
              {advanceMemo.awaitingCompletion && (
                <div className="text-sm text-amber-600" data-testid="memo-awaiting-completion">
                  بانتظار استكمال البيانات والمرفقات
                </div>
              )}
              {/* The stage-transition ACTION for the current stage (بدء التحرير /
                  إرسال للمراجعة الداخلية / تم الرفع) — shown alongside the timeline so
                  the modal both DISPLAYS the stage and lets the assignee act, exactly
                  like the case modal. */}
              <div className="flex flex-wrap gap-2">
                <MemoAdvancePanel memo={advanceMemo} onChanged={refreshAfterAction} />
              </div>
              {/* Internal-review / committee / take-notes decisions are taken by the
                  reviewer/committee via their own review tasks, not from here. */}
              <p className="text-xs text-muted-foreground">
                إجراءات المراجعة الداخلية وقرار اللجنة والأخذ بالملاحظات تتم عبر مسار مراجعة المذكرة.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== General (عام) task details ("تفاصيل") ===== */}
      <Dialog open={!!detailsTask} onOpenChange={(o) => !o && setDetailsTask(null)}>
        <DialogContent dir="rtl" data-testid="dialog-general-details">
          <DialogHeader><DialogTitle>تفاصيل المهمة</DialogTitle></DialogHeader>
          {detailsTask && (() => {
            // Requester + full description + linked entity live on the FULL field
            // task (loaded app-wide), not the feed item. A general task links to at
            // most ONE of case / consultation / contract / client (no memo link in
            // the model); resolve whichever is set to its number/title.
            const ft = getTaskById(detailsTask.entityId);
            const requester = ft ? userName(ft.originalRequesterId || ft.assignedBy) : "";
            const holder = ft?.assignedTo ? userName(ft.assignedTo) : "";
            const deptName = ft?.routedDepartmentId
              ? (departments.find((d) => d.id === ft.routedDepartmentId)?.name || ft.routedDepartmentId)
              : "";
            const linked = !ft ? ""
              : ft.caseId ? `قضية ${cases.find((c) => c.id === ft.caseId)?.caseNumber ?? ft.caseId}`
              : ft.consultationId ? `استشارة ${consultations.find((c) => c.id === ft.consultationId)?.consultationNumber ?? ft.consultationId}`
              : ft.contractId ? `عقد ${contracts.find((c) => c.id === ft.contractId)?.contractNumber || contracts.find((c) => c.id === ft.contractId)?.title || ft.contractId}`
              : ft.clientId ? `عميل ${getClientName(ft.clientId)}`
              : "";
            const desc = ft?.description?.trim() || "";
            const note = ft?.reviewNote?.trim() || "";
            return (
              <div className="space-y-3 text-sm">
                <div className="font-medium"><BidiText>{detailsTask.title}</BidiText></div>
                <div className="space-y-1">
                  <div><span className="text-muted-foreground">من: </span><BidiText>{requester || "—"}</BidiText></div>
                  {linked && <div><span className="text-muted-foreground">مرتبطة بـ: </span><BidiText>{linked}</BidiText></div>}
                  {holder && <div><span className="text-muted-foreground">لدى: </span><BidiText>{holder}</BidiText></div>}
                  {deptName && <div><span className="text-muted-foreground">القسم: </span><BidiText>{deptName}</BidiText></div>}
                  {ft?.status && <div><span className="text-muted-foreground">الحالة: </span>{ft.status}</div>}
                  {ft?.dueDate && <div className="flex items-center gap-1"><span className="text-muted-foreground">الاستحقاق: </span><DualDateDisplay date={ft.dueDate} /></div>}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">التفاصيل</p>
                  <div className="max-h-60 overflow-y-auto rounded-md border p-2 whitespace-pre-wrap break-words" data-testid="general-details-description">
                    {desc ? <BidiText>{desc}</BidiText> : <span className="text-muted-foreground">لا يوجد وصف</span>}
                  </div>
                </div>
                {note && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-2">
                    <span className="font-semibold">ملاحظة الإعادة: </span><BidiText>{note}</BidiText>
                  </div>
                )}
              </div>
            );
          })()}
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
            {/* Two-dropdown assignment (final design) — open to EVERY role. No
                mode toggle: fill the القسم dropdown, the الشخص dropdown, or both.
                A chosen person → assigned directly to them; the القسم only
                filters the person list (selecting it clears any prior person).
                Dept alone → routed to the dept head for distribution. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>القسم</Label>
                <Select value={createForm.deptId || "none"} onValueChange={(v) => setCreateForm({ ...createForm, deptId: v === "none" ? "" : v, assigneeId: "" })}>
                  <SelectTrigger data-testid="select-create-dept"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قسم</SelectItem>
                    {departments.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                  </SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>الشخص</Label>
                <Select value={createForm.assigneeId || "none"} onValueChange={(v) => setCreateForm({ ...createForm, assigneeId: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-create-assignee"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون شخص</SelectItem>
                    {personOptions.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                  </SelectContent>
                </Select></div>
            </div>
            <p className="text-xs text-muted-foreground">اختر شخصاً لإسناد المهمة إليه مباشرة، أو اختر قسماً فقط لإحالتها إلى رئيس القسم ليُسندها لعضو (وإن لم يوجد رئيس، تنتظر الإسناد حتى تعيينه). اختيار قسم يصفّي قائمة الأشخاص؛ بدون قسم تظهر كل الأسماء.</p>
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
