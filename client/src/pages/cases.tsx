import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { getClientRoleLabel } from "@/lib/client-role";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePageSize } from "@/hooks/use-page-size";
import { usePersistedFilter, oneOf, anyString, objectLike } from "@/hooks/use-persisted-state";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { LtrInline } from "@/components/ui/bidi-text";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import {
  Plus,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  ClipboardCheck,
  Bell,
  ArrowLeftRight,
  Trash2,
  FileText,
  AlertTriangle,
  Info,
  Pencil,
  Scale,
  UserCog,
  Pause,
  Play,
  RotateCcw,
  MoreHorizontal,
  Archive,
  Paperclip,
} from "lucide-react";
import { useFavorites } from "@/lib/favorites-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { 
  CaseStageLabels,
  CaseStagesOrder,
  CaseStage,
  CaseStatus,
  Priority,
  CaseClassification,
  CaseClassificationLabels,
  getStageLabel,
  TerminalCaseStages,
  getReopenTargetStages,
  stageNumberRequirement,
  findPrimaryJudgmentHearing,
  judgmentDirectionOf,
  weAreTheAppellant,
  StartingStageOption,
  currentStartingStage,
  startingStageCorrectionBlockedReason,
  isCaseConcluded,
  CONCLUDED_FILTER_VALUE,
  MemoType,
  MemoTypeLabels,
  caseNotificationRecipientId,
} from "@shared/schema";
import type { LawCase, CaseStageValue, CaseTypeValue, PriorityType, CaseClassificationValue } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { extractApiError, cn } from "@/lib/utils";
import { sendCaseReminder, notifyCaseAssigned } from "@/lib/notification-triggers";
import { CaseDetailsDialog } from "@/components/case-details-dialog";
import { OpponentResponseDialog } from "@/components/opponent-response-dialog";
import { SingleAttachmentControl } from "@/components/single-attachment-control";
import {
  isAwaitingJudgmentDeedFile,
  caseHasHearingMissingMinutes,
  caseHasDeedAttachment,
  caseReachedJudgment,
  isPostJudgmentCaseMissingDeed,
  isHearingActor,
} from "@/lib/attachment-indicators";
import { caseHasReturnedFromReview, isCasePaused, pauseBadgeTooltip, STAGE_BADGE_WRAP_CLASS } from "@/lib/case-stage-utils";
import { useCaseLifecycleActions, CaseLifecycleDialog } from "@/components/case-lifecycle-dialog";
import { useHearings } from "@/lib/hearings-context";
import { useMemos } from "@/lib/memos-context";
import { useStandards } from "@/lib/standards-context";
import { ReviewChecklist } from "@/components/review-checklist";
import {
  CasesAdvancedFilters,
  EMPTY_ADV_FILTERS,
  getFilterStages,
  type AdvancedCasesFilters,
} from "@/components/cases-advanced-filters";

function getStageColor(stage: CaseStageValue | string) {
  switch (stage) {
    case CaseStage.RECEPTION:
      return "bg-primary/20 text-primary border-primary/30";
    case CaseStage.PRESCRIPTION_DATE:
    case CaseStage.DATA_COMPLETION:
      return "bg-amber-500/20 text-amber-600 border-amber-500/30";
    case CaseStage.STUDY:
      return "bg-accent/20 text-accent border-accent/30";
    case CaseStage.SETTLEMENT_DIRECTION:
    case CaseStage.AWAITING_SETTLEMENT:
      return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";
    case CaseStage.GRIEVANCE_DRAFTING:
    case CaseStage.GRIEVANCE_INTERNAL_REVIEW:
    case CaseStage.GRIEVANCE_SUBMITTED:
    case CaseStage.GRIEVANCE_AWAITING:
      return "bg-purple-500/20 text-purple-600 border-purple-500/30";
    case CaseStage.DRAFTING:
    case CaseStage.MEMO_DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case CaseStage.INTERNAL_REVIEW:
      return "bg-indigo-500/20 text-indigo-600 border-indigo-500/30";
    case CaseStage.REVIEW_COMMITTEE:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case CaseStage.TAKING_NOTES:
      return "bg-destructive/20 text-destructive border-destructive/30";
    case CaseStage.READY_TO_SUBMIT:
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case CaseStage.TARADI_REGISTRATION:
    case CaseStage.TARADI_REVIEW:
    case CaseStage.NAJIZ_REGISTRATION:
    case CaseStage.NAJIZ_REVIEW:
    case CaseStage.MOEEN_REGISTRATION:
    case CaseStage.MOEEN_REVIEW:
      return "bg-violet-500/20 text-violet-600 border-violet-500/30";
    case CaseStage.CONCILIATION:
      return "bg-cyan-500/20 text-cyan-600 border-cyan-500/30";
    case CaseStage.CONCILIATION_CLOSED:
      return "bg-teal-500/20 text-teal-600 border-teal-500/30";
    case CaseStage.UNDER_REVIEW:
    case CaseStage.APPEAL_PENDING:
      return "bg-orange-500/20 text-orange-600 border-orange-500/30";
    case CaseStage.PRIMARY_JUDGMENT:
      return "bg-red-500/20 text-red-600 border-red-500/30";
    case CaseStage.FINAL_JUDGMENT:
      return "bg-rose-600/20 text-rose-700 border-rose-600/30";
    case CaseStage.STRUCK_OFF:
      return "bg-red-700/20 text-red-800 border-red-700/30";
    case CaseStage.COLLECTION:
      return "bg-emerald-500/20 text-emerald-600 border-emerald-500/30";
    case CaseStage.ARCHIVED:
    case CaseStage.CLOSED:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// getPriorityColor + REVIEW_LOOP_STAGES moved to case-details-dialog.tsx with the
// details dialog — its info tab / actions tab were their only consumers.

// Priority-group sort. The cases table puts urgent rows on top and
// pushes terminal rows to the bottom so lawyers see what needs their
// attention first. See getCasePriorityGroup below for the rules.
//   1 = unassigned (highest)
//   2 = action required from us (drafting / reviewing internally)
//   3 = in court with an active memo (firm still working)
//   4 = waiting on external (court, client, opponent, paused)
//   5 = closed / archived / terminated (lowest)
// Within each group rows order by updatedAt DESC.
//
// "Action required from us" stages — internal workflow steps where
// the firm owes work. Includes the parallel admin/grievance and
// memo-jawabiyya drafting stages so a defendant case at
// تحرير_مذكرة_جوابية surfaces alongside a plaintiff case at
// تحرير_صحيفة_الدعوى.
const ACTION_REQUIRED_FROM_US_STAGES = new Set([
  "استلام",
  "استكمال_البيانات",
  "دراسة",
  "تحرير_صحيفة_الدعوى",
  "تحرير_مذكرة_جوابية",
  "تحرير_صيغة_التظلم",
  "مراجعة_داخلية",
  "مراجعة_داخلية_للتظلم",
  "إحالة_للجنة_المراجعة",
  "الأخذ_بالملاحظات",
  "جاهزة_للرفع",
]);
// Stages where the next move is on someone else.
const WAITING_EXTERNAL_STAGES = new Set([
  "منظورة",
  "منظورة_استئناف",
  "قيد_التدقيق_في_تراضي",
  "قيد_التدقيق_في_ناجز",
  "قيد_التدقيق_في_معين",
  "مداولة_الصلح",
  "أغلق_طلب_الصلح",
  "بانتظار_رفع_العميل_للتسوية",
  "تقديم_التظلم",
  "انتظار_رد_التظلم",
]);
// Terminal stages — final outcomes. The set itself now lives in
// shared/schema.ts (TerminalCaseStages) because the stage progress bar needs
// the same list; this file's semantics are unchanged (same six stages).
// محكوم_حكم_ابتدائي is qualified below: only terminal when no active memo
// (an open objection memo means the case is still alive).
// Stages where the case is sitting in court with the firm's role
// being to push the active memo forward; if the memo is open this
// outranks "waiting on external" / "terminated".
const IN_COURT_STAGES_FOR_MEMO_GROUP = new Set([
  "منظورة",
  "منظورة_استئناف",
  "محكوم_حكم_ابتدائي",
  "محكوم_حكم_نهائي",
]);

function getCasePriorityGroup(
  c: LawCase,
  hasActiveMemo: boolean,
): 1 | 2 | 3 | 4 | 5 {
  // Closed / archived always go last regardless of stage or assignment.
  if (c.status === CaseStatus.CLOSED || c.isArchived) return 5;

  const hasNoLawyer =
    !c.primaryLawyerId &&
    !c.responsibleLawyerId &&
    (!Array.isArray(c.assignedLawyers) || c.assignedLawyers.length === 0);
  if (hasNoLawyer) return 1;

  const stage = c.currentStage;

  // In-court stages with an open memo trump terminal/external —
  // the firm is still actively pushing paperwork.
  if (IN_COURT_STAGES_FOR_MEMO_GROUP.has(stage) && hasActiveMemo) return 3;

  if (TerminalCaseStages.has(stage)) return 5;

  // Paused or awaiting-completion = waiting on external action even
  // if the underlying stage would otherwise put the case in group 2.
  if (c.pausedAt || c.awaitingCompletion) return 4;

  if (ACTION_REQUIRED_FROM_US_STAGES.has(stage)) return 2;
  if (WAITING_EXTERNAL_STAGES.has(stage)) return 4;
  // Anything that doesn't match a known bucket falls into "in
  // progress / waiting" — safer than mis-promoting it.
  return 4;
}

// Judgment-lifecycle step 2 — "بانتظار استلام الصك". DERIVED, never stored: a
// primary judgment has been issued but the written judgment (الصك) hasn't been
// logged as received, so the objection clock hasn't started. Two terms, both on
// the case row, so no cross-entity scan is needed (cheaper than the memo-based
// "مذكرة جارية"). Self-clearing: recording the receipt date makes it false.
export function isAwaitingJudgmentDeed(c: {
  currentStage: string;
  judgmentDeedReceivedDate?: string | null;
}): boolean {
  if (c.currentStage !== "محكوم_حكم_ابتدائي") return false;
  return !String(c.judgmentDeedReceivedDate || "").trim();
}

// What the per-case active-memo scan yields. ONE map, not two: the badge needs
// the TYPE as well as the existence, and a second Map would mean a second pass
// over the same memo list and a second dependency to keep in sync.
// Still fully DERIVED from the memos query — no stored flag anywhere.
type ActiveMemoInfo = {
  // Drives the group-3 sort rule (unchanged semantics).
  hasActive: boolean;
  // Drives the badge LABEL: an active لائحة اعتراضية is the memo a judgment
  // CREATES, not one it ends, so naming it precisely matters next to the
  // "بانتظار استلام الصك" badge it sits beside on محكوم_حكم_ابتدائي.
  hasObjection: boolean;
  // True when something OTHER than the objection is also active. The label
  // shows the objection (see the badge), so this only enriches the tooltip
  // rather than silently hiding the rest.
  hasOther: boolean;
};

// "Active" memo for the group-3 rule: not cancelled, not filed.
function isActiveMemo(m: { status?: string | null; currentStage?: string | null }): boolean {
  if (m.status === "ملغاة") return false;
  if (m.currentStage === "مرفوعة") return false;
  // Legacy memos pre-Phase-9 might still carry status="مرفوعة" without
  // a currentStage — treat that as filed too.
  if (m.status === "مرفوعة") return false;
  return true;
}

export default function CasesPage() {
  const {
    cases,
    isLoading: casesLoading,
    addCase,
    updateCase,
    assignCase,
    approveCase,
    rejectCase,
    deleteCase,
    getCaseById,
    refreshCases,
  } = useCases();
  const { getClientName, isLoading: clientsLoading } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions, users } = useAuth();
  const { getHearingsByCase } = useHearings();
  const { memos } = useMemos();
  const { addRecentVisit } = useFavorites();
  const { getStandardsByType } = useStandards();
  const lawyers = users.filter(u => u.canBeAssignedCases);
  // Lawyer-filter source: role-based exclusion. Wider than `lawyers` because
  // it must surface anyone who *has* cases (e.g. cases_review_head) — not
  // only those assignable going forward.
  const LAWYER_FILTER_EXCLUDED_ROLES = new Set([
    "branch_manager",
    "admin_support",
    "hr",
    "technical_support",
  ]);
  const filterLawyers = users.filter(u => !LAWYER_FILTER_EXCLUDED_ROLES.has(u.role));
  const contractReviewStandards = getStandardsByType("contract_review");
  
  const getLawyerName = (id: string | null): string => {
    if (!id) return "-";
    const lawyer = lawyers.find(l => l.id === id);
    return lawyer?.name || "-";
  };
  const { toast } = useToast();

  // Phase-8 — pause permission gate. Mirrors the server check on
  // /api/cases/:id/pause and /unpause: branch_manager / admin_support /
  // dept_head (own dept) / assigned lawyer (primary | responsible | in
  // assignedLawyers array).
  const canPauseCase = (c: LawCase): boolean => {
    if (!user) return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (user.role === "department_head" && c.departmentId === user.departmentId) return true;
    if (c.primaryLawyerId === user.id || c.responsibleLawyerId === user.id) return true;
    return Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(user.id);
  };

  // Early-close permission gate. Mirrors the cases-side equivalent of the
  // consultations canEarlyClose helper: branch_manager / admin_support
  // (global), department_head (own dept), assigned lawyer (primary |
  // responsible | in assignedLawyers). The case must still be active —
  // currentStage !== "مقفلة" is the cases-side equivalent of the
  // consultation status === "active" check. The dept-scope check requires
  // BOTH sides to have a non-empty departmentId — otherwise a dept_head
  // with a null department would falsely match a case that also has a null
  // departmentId (legacy rows or "أخرى" assignments).
  const canEarlyCloseCase = (c: LawCase): boolean => {
    if (!user) return false;
    if (c.currentStage === "مقفلة") return false;
    // تحصيل SEAL — a case at تحصيل closes AUTOMATICALLY when its collection tasks
    // resolve, and the server refuses a manual close from there for EVERY role
    // (the transition rule is removed and the early-close shortcut excludes it).
    // Hidden for everyone, branch_manager included, so no button can 403.
    if (c.currentStage === "تحصيل") return false;
    // صك SEAL — same shape as the تحصيل seal above, and for the same reason: the
    // server refuses this close for EVERY role while the deed is missing (the
    // محكوم_حكم_ابتدائي guard in PATCH runs before the early-close shortcut, and
    // the judgment-case close guard covers the later stages), so no button here
    // could succeed. Keyed on reachedJudgmentStage, the derived list field that
    // carries the SAME stageHistory test the server applies.
    if (caseReachedJudgment(c) && !caseHasDeedAttachment(c)) return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (
      user.role === "department_head" &&
      !!user.departmentId &&
      !!c.departmentId &&
      c.departmentId === user.departmentId
    ) {
      return true;
    }
    if (c.primaryLawyerId === user.id || c.responsibleLawyerId === user.id) return true;
    return Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(user.id);
  };

  // "إغلاق لعدم استكمال البيانات" gate. Restates the server rule for
  // POST /api/cases/:id/close-no-response so visibility === authorization.
  // The ROLE tier is canEarlyCloseCase verbatim (this IS a close), plus the
  // state conditions the endpoint enforces.
  //
  // ⚠ Gated on the STAGE, not on awaitingCompletion. A case reaches
  // استكمال_البيانات either by the ordinary استلام advance (latch FALSE — the
  // common path, with the missing-data text in the mandatory stage note) or via
  // /await-completion (latch TRUE). Gating on the latch would hide the button
  // from every Path-A case. See the server comment for the full chain.
  const canCloseCaseForNoResponse = (c: LawCase): boolean => {
    if (c.currentStage !== "استكمال_البيانات") return false;
    if (c.status === "مغلق" || c.isArchived) return false;
    // A paused case must be unpaused first — the endpoint 400s otherwise, and
    // a paused case DISPLAYS as استكمال_البيانات (getCaseDisplayStage) without
    // actually being on that stage, so the stage test alone would offer the
    // button on rows that are merely paused.
    if (isCasePaused(c)) return false;
    return canEarlyCloseCase(c);
  };

  // Reopen permission gate — the MIRROR of canEarlyCloseCase above, with two
  // deliberate differences that restate the server rule for
  // POST /api/cases/:id/reopen (canActOnMohrSettlement + the مقفلة guard):
  //   • the stage test is INVERTED — only a CLOSED case can be reopened;
  //   • admin_support is DROPPED (owner decision) — admin support may close a
  //     case but not bring it back, so this set is narrower than early-close.
  // Same both-sides-non-empty departmentId rule as early-close, so a dept_head
  // with a null department can't match a case that also has none.
  // Reopen permission gate — restates the server rule for POST /api/cases/:id/reopen
  // (canActOnMohrSettlement + the مقفلة guard): branch_manager | own-dept
  // department_head | assigned lawyer. admin_support is excluded (owner decision):
  // admin support may CLOSE a case but not bring it back.
  // (a1e3456 briefly dropped the assigned lawyer here; REVERTED alongside the
  // server gate — the narrowing was never requested.)
  const canReopenCase = (c: LawCase): boolean => {
    if (!user) return false;
    if (c.currentStage !== "مقفلة") return false;
    if (user.role === "branch_manager") return true;
    if (
      user.role === "department_head" &&
      !!user.departmentId &&
      !!c.departmentId &&
      c.departmentId === user.departmentId
    ) {
      return true;
    }
    if (c.primaryLawyerId === user.id || c.responsibleLawyerId === user.id) return true;
    return Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(user.id);
  };

  // "تسجيل استلام الصك" permission gate — the SAME rule the server enforces on
  // POST /api/cases/:id/judgment-deed (canActOnMohrSettlement): branch_manager |
  // department_head of the case's own dept | assigned lawyer. admin_support is
  // excluded, consistent with the MOHR and reopen actions. Stage-gated to
  // محكوم_حكم_ابتدائي so visibility === authorization on both terms.
  // The ROLE half of every case-workflow action we've added (صك receipt, appeal
  // outcome, opponent response): a client-side restatement of the server's
  // canActOnMohrSettlement — branch_manager | department_head of the case's own
  // department | assigned lawyer. admin_support is excluded on purpose,
  // consistently with those endpoints. Each caller adds its own state gate.
  const canActOnCaseWorkflow = (c: LawCase): boolean => {
    if (!user) return false;
    if (user.role === "branch_manager") return true;
    if (
      user.role === "department_head" &&
      !!user.departmentId &&
      !!c.departmentId &&
      c.departmentId === user.departmentId
    ) {
      return true;
    }
    if (c.primaryLawyerId === user.id || c.responsibleLawyerId === user.id) return true;
    return Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(user.id);
  };

  const canRecordJudgmentDeed = (c: LawCase): boolean =>
    c.currentStage === "محكوم_حكم_ابتدائي" && canActOnCaseWorkflow(c);

  // Mirror of the server's canAttachCaseJudgmentDeed (routes.ts) — the gate on
  // uploading / replacing / deleting the صك FILE. It is canActOnCaseWorkflow
  // PLUS admin_support, and that one-role difference is deliberate: recording
  // the receipt DATE starts the objection clock and creates the لائحة اعتراضية
  // (a legal act, admin_support excluded), whereas filing the PDF that arrived
  // from the court is clerical and admin_support is who receives it. Kept as a
  // separate function rather than widening canActOnCaseWorkflow, which also
  // gates the appeal-outcome and opponent-response actions.
  const canAttachDeed = (c: LawCase): boolean =>
    (!!user && user.role === "admin_support") || canActOnCaseWorkflow(c);

  // isCasePaused now comes from case-stage-utils — the same helper the extracted
  // details dialog uses for its paused banner (identical `!!c.pausedAt` rule).

  // Virtual stage grouping. Lifecycle states (paused / closed /
  // archived) remap to specific stages so the stage filter stays
  // purely stage-based:
  //   paused              → استكمال_البيانات (parked, awaiting data)
  //   مغلق / isArchived   → مقفلة (canonical terminal)
  //   otherwise           → currentStage
  // The details-dialog progress bar still uses the literal currentStage
  // — virtualization is for filtering and the table badge only.
  const getCaseDisplayStage = (c: LawCase): CaseStageValue => {
    if (c.pausedAt) return CaseStage.DATA_COMPLETION;
    if (c.status === CaseStatus.CLOSED || c.isArchived) return CaseStage.CLOSED;
    return c.currentStage;
  };

  // Phase-8 — pause / unpause / await-completion / resume-from-completion.
  // The four mutually-exclusive lifecycle flows live in one hook +
  // dialog; see case-lifecycle-dialog.tsx. Permission gates stay below
  // at the row level (they decide whether each trigger button renders).
  const lifecycle = useCaseLifecycleActions({ refreshCases, toast });

  // SEARCH IS DELIBERATELY TRANSIENT — see the note on the other pages: a
  // restored search box is the one filter users don't expect to persist, and it
  // is the hardest to notice (an invisible substring silently emptying a list).
  const [searchQuery, setSearchQuery] = useState("");
  // Persisted per user + per page (use-persisted-state). Stage/classification
  // are sanitized against their STATIC option lists; dept/lawyer accept any
  // string here because departments and users load async — their existence is
  // re-checked by the "reset if not in the loaded list" effects below.
  const [statusFilter, setStatusFilter] = usePersistedFilter<string>(
    "cases", "status", "all", oneOf(CaseStagesOrder as readonly string[], "all"),
  );
  // DEFAULT = the user's OWN department when they have one (department_head /
  // employee); "all" for users with none (branch_manager / admin_support).
  // A DEFAULT, not a restriction — every department stays selectable, and the
  // saved value wins whenever one exists, so an explicit choice is never
  // overridden.
  const [deptFilter, setDeptFilter] = usePersistedFilter<string>(
    "cases", "dept", user?.departmentId || "all", anyString,
  );
  const [lawyerFilter, setLawyerFilter] = usePersistedFilter<string>(
    "cases", "lawyer", "all", anyString,
  );
  const [advFilters, setAdvFilters] = usePersistedFilter<AdvancedCasesFilters>(
    "cases", "adv", EMPTY_ADV_FILTERS,
    objectLike(EMPTY_ADV_FILTERS, { stages: CaseStagesOrder as readonly string[] }),
  );

  // Refresh cases on page mount to pick up changes from other tabs/users
  useEffect(() => {
    refreshCases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-module deep-link: /cases?openCase=<id> opens the detail dialog
  // for that case. Used by the "اذهب للقضية" link on the consultations
  // detail dialog after a convert-to-case. Read once on mount; the
  // pending id is resolved by the second effect below once cases load.
  // Param is stripped from the URL so a refresh doesn't re-open the dialog.
  const [pendingOpenCaseId, setPendingOpenCaseId] = useState<string | null>(null);
  const [pendingOpenAction, setPendingOpenAction] = useState<string | null>(null);
  // Which tab the details dialog should open on. Null = its own default
  // (المعلومات). Only an ?action= deep-link whose target is a row in الإجراءات
  // sets it.
  const [detailsInitialTab, setDetailsInitialTab] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s === "pending_review") setStatusFilter(CaseStage.REVIEW_COMMITTEE);
    else if (s === "ready") setStatusFilter(CaseStage.READY_TO_SUBMIT);
    // Phase-9.3 — dashboard pending-review deep-link can also scope by
    // dept (?dept=<id>) or assigned lawyer (?assignedTo=<id>) so the
    // page contents match the role-filtered count on the dashboard.
    const dept = params.get("dept");
    if (dept) setDeptFilter(dept);
    const assignedTo = params.get("assignedTo");
    if (assignedTo) setLawyerFilter(assignedTo);
    const openCaseId = params.get("openCase");
    if (openCaseId) {
      setPendingOpenCaseId(openCaseId);
      // Optional companion param: which ACTION to open once the case resolves.
      // Extends the existing deep-link rather than adding a second mechanism —
      // the مهامي "متابعة" button on the صك follow-up task uses
      // ?openCase=<id>&action=judgment-deed so it lands on the action itself
      // instead of dropping the user in the case file to hunt for it.
      setPendingOpenAction(params.get("action"));
      const url = new URL(window.location.href);
      url.searchParams.delete("openCase");
      url.searchParams.delete("action");
      window.history.replaceState({}, "", url);
    }
  }, []);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [, setClassificationGroup] = useState<"" | "new" | "existing">("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const selectedCase = selectedCaseId ? getCaseById(selectedCaseId) || null : null;
  // awaitInfo + its activity-log fetch, the attachments state/handlers, the
  // new-comment box, the active tab, the inline-edit fields and the تراضي/الموارد
  // registration inputs all moved INTO <CaseDetailsDialog> — that dialog was their
  // only reader, and it now loads its own attachments/comments when it opens.
  const [rejectNotes, setRejectNotes] = useState("");

  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderCaseId, setReminderCaseId] = useState<string | null>(null);
  const [reminderData, setReminderData] = useState({
    reminderType: "تذكير بتحديث الحالة",
    message: "",
    recipientId: "",
  });

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferCaseId, setTransferCaseId] = useState<string | null>(null);
  const [transferData, setTransferData] = useState({ toDepartmentId: "", reason: "" });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [caseToDelete, setCaseToDelete] = useState<any>(null);
  const [, setLocation] = useLocation();
  const [hearingPrompt, setHearingPrompt] = useState<{
    caseId: string;
    hearingType: "تراضي" | "محكمة";
    title: string;
    description: string;
  } | null>(null);
  const [showEarlyCloseDialog, setShowEarlyCloseDialog] = useState(false);
  const [earlyCloseCase, setEarlyCloseCase] = useState<any>(null);
  const [earlyCloseReason, setEarlyCloseReason] = useState("");
  const [earlyCloseReasonOther, setEarlyCloseReasonOther] = useState("");
  // "إغلاق لعدم استكمال البيانات" — the third exit from استكمال_البيانات. No
  // reason picker: the closure reason is fixed (DATA_NOT_COMPLETED) and the
  // "what was missing" text is resolved SERVER-side, so this dialog only
  // confirms and takes optional notes.
  const [closeNoResponseCase, setCloseNoResponseCase] = useState<LawCase | null>(null);
  const [closeNoResponseNotes, setCloseNoResponseNotes] = useState("");
  const [closeNoResponseSaving, setCloseNoResponseSaving] = useState(false);
  // The dialog body (the answer + submitting state and the request) moved into
  // the shared OpponentResponseDialog so the hearing-level toggle can reuse it.
  const [opponentResponseCase, setOpponentResponseCase] = useState<LawCase | null>(null);
  const [appealOutcomeCase, setAppealOutcomeCase] = useState<LawCase | null>(null);
  const [appealOutcomeKind, setAppealOutcomeKind] = useState<"we_appealed" | "opponent_appealed" | "no_appeal">("opponent_appealed");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [showDeedDialog, setShowDeedDialog] = useState(false);
  const [deedCase, setDeedCase] = useState<LawCase | null>(null);
  const [deedDate, setDeedDate] = useState("");
  const [deedWindowDays, setDeedWindowDays] = useState("30");
  const [deedSubmitting, setDeedSubmitting] = useState(false);
  // FILE-ONLY mode for the صك dialog: the case is already PAST محكوم_حكم_ابتدائي,
  // so the receipt date and objection window are neither editable (the server's
  // /judgment-deed endpoint 400s off-stage) nor meaningful (the objection window is
  // long over). Only the attachment control renders — which is what unblocks the
  // close gate.
  const [deedFileOnly, setDeedFileOnly] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);
  const [reopenCase, setReopenCase] = useState<LawCase | null>(null);
  const [reopenTargetStage, setReopenTargetStage] = useState("");
  const [reopenNumber, setReopenNumber] = useState("");
  const [reopenNotes, setReopenNotes] = useState("");
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editCaseId, setEditCaseId] = useState<string | null>(null);
  const [reassignCaseDialog, setReassignCaseDialog] = useState<LawCase | null>(null);
  const [reassignCaseLawyerId, setReassignCaseLawyerId] = useState<string>("");
  const [editFormData, setEditFormData] = useState({
    clientId: "",
    plaintiffName: "",
    caseType: "" as string,
    caseTypeOther: "",
    departmentId: "",
    departmentOther: "",
    priority: "متوسط" as PriorityType,
    courtName: "",
    courtCaseNumber: "",
    opponentName: "",
    opponentLawyer: "",
    opponentPhone: "",
    opponentNotes: "",
    caseClassification: "" as CaseClassificationValue | "",
    clientRole: "" as string,
    previousHearingsCount: 0,
    currentSituation: "",
    responseDeadline: "",
    adminCaseSubType: "" as string,
    prescriptionDate: "",
    grievanceRequired: false,
    memoRequired: false,
    isSettlementCase: false,
    whatsappGroupLink: "",
    googleDriveFolderId: "",
    internalReviewerId: "",
    litigatorId: "",
    primaryLawyerId: "",
    // Present on the ADD dialog; added here so the two forms match.
    nextHearingDate: "",
    nextHearingTime: "",
  });

  // "مرحلة البداية" correction. Applied by its OWN endpoint, not with the rest
  // of the form: it moves isSettlementCase and currentStage together plus
  // stageHistory and an audit row, which the generic updateCase cannot do
  // atomically — and doing it through the form would let a half-saved edit
  // strand the stage off its path.
  const [startingStageTarget, setStartingStageTarget] = useState<{
    caseItem: LawCase;
    toSettlement: boolean;
    liveMemoCount: number;
    hasSettlementNumber: boolean;
  } | null>(null);
  const [startingStageNotes, setStartingStageNotes] = useState("");
  const [startingStageSaving, setStartingStageSaving] = useState(false);

  const openEditDialog = (caseItem: LawCase) => {
    setEditCaseId(caseItem.id);
    setEditFormData({
      clientId: caseItem.clientId || "",
      plaintiffName: caseItem.plaintiffName || "",
      caseType: (caseItem.caseType || "") as string,
      caseTypeOther: caseItem.caseTypeOther || "",
      departmentId: caseItem.departmentId || "",
      departmentOther: caseItem.departmentOther || "",
      priority: (caseItem.priority || "متوسط") as PriorityType,
      courtName: caseItem.courtName || "",
      courtCaseNumber: caseItem.courtCaseNumber || "",
      opponentName: caseItem.opponentName || "",
      opponentLawyer: caseItem.opponentLawyer || "",
      opponentPhone: caseItem.opponentPhone || "",
      opponentNotes: caseItem.opponentNotes || "",
      caseClassification: (caseItem.caseClassification || "") as CaseClassificationValue | "",
      clientRole: (caseItem.clientRole || "") as string,
      previousHearingsCount: caseItem.previousHearingsCount || 0,
      currentSituation: caseItem.currentSituation || "",
      responseDeadline: caseItem.responseDeadline || "",
      adminCaseSubType: caseItem.adminCaseSubType || "",
      prescriptionDate: caseItem.prescriptionDate || "",
      grievanceRequired: !!caseItem.grievanceRequired,
      memoRequired: !!caseItem.memoRequired,
      isSettlementCase: !!caseItem.isSettlementCase,
      whatsappGroupLink: caseItem.whatsappGroupLink || "",
      googleDriveFolderId: caseItem.googleDriveFolderId || "",
      internalReviewerId: caseItem.internalReviewerId || "",
      litigatorId: caseItem.litigatorId || "",
      primaryLawyerId: caseItem.primaryLawyerId || "",
      nextHearingDate: caseItem.nextHearingDate || "",
      nextHearingTime: caseItem.nextHearingTime || "",
    });
    setShowEditDialog(true);
  };

  const handleEditCase = async () => {
    if (!editCaseId) return;
    const original = cases.find(c => c.id === editCaseId);
    const lawyerChanged =
      (original?.primaryLawyerId || "") !== (editFormData.primaryLawyerId || "");
    try {
      await updateCase(editCaseId, {
        clientId: editFormData.clientId,
        plaintiffName: editFormData.plaintiffName,
        caseType: editFormData.caseType as CaseTypeValue,
        caseTypeOther: editFormData.caseTypeOther,
        departmentId: editFormData.departmentId,
        departmentOther: editFormData.departmentOther,
        priority: editFormData.priority,
        courtName: editFormData.courtName,
        courtCaseNumber: editFormData.courtCaseNumber,
        opponentName: editFormData.opponentName,
        opponentLawyer: editFormData.opponentLawyer,
        opponentPhone: editFormData.opponentPhone,
        opponentNotes: editFormData.opponentNotes,
        caseClassification: editFormData.caseClassification as CaseClassificationValue,
        clientRole: editFormData.clientRole || null,
        previousHearingsCount: editFormData.previousHearingsCount,
        currentSituation: editFormData.currentSituation,
        responseDeadline: editFormData.responseDeadline || null,
        adminCaseSubType: editFormData.adminCaseSubType || null,
        prescriptionDate: editFormData.prescriptionDate || null,
        grievanceRequired: editFormData.grievanceRequired,
        memoRequired: editFormData.memoRequired,
        isSettlementCase: editFormData.isSettlementCase,
        whatsappGroupLink: editFormData.whatsappGroupLink || "",
        googleDriveFolderId: editFormData.googleDriveFolderId || "",
        nextHearingDate: editFormData.nextHearingDate || null,
        nextHearingTime: editFormData.nextHearingTime || null,
        internalReviewerId: editFormData.internalReviewerId || null,
        litigatorId: editFormData.litigatorId || null,
        primaryLawyerId: editFormData.primaryLawyerId || null,
        responsibleLawyerId: editFormData.primaryLawyerId || null,
        assignedLawyers: editFormData.primaryLawyerId ? [editFormData.primaryLawyerId] : [],
      });
      // Fire the same notification the assign dialog does, so changing the
      // lawyer here doesn't silently skip the heads-up to the new lawyer.
      if (lawyerChanged && editFormData.primaryLawyerId) {
        notifyCaseAssigned(
          editCaseId,
          original?.caseNumber || "",
          editFormData.primaryLawyerId,
        ).catch(() => {});
      }
      toast({ title: "تم تحديث بيانات القضية بنجاح" });
      setShowEditDialog(false);
      setEditCaseId(null);
    } catch (error) {
      toast({ title: "حدث خطأ أثناء تحديث القضية", variant: "destructive" });
    }
  };

  const openReassignCaseDialog = (caseItem: LawCase) => {
    setReassignCaseLawyerId(caseItem.primaryLawyerId || "");
    setReassignCaseDialog(caseItem);
  };

  const handleReassignCase = async () => {
    if (!reassignCaseDialog || !reassignCaseLawyerId) return;
    try {
      await updateCase(reassignCaseDialog.id, { primaryLawyerId: reassignCaseLawyerId });
      toast({ title: "تم إسناد القضية لمحامي جديد" });
      setReassignCaseDialog(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "فشل إسناد القضية", variant: "destructive" });
    }
  };

  const [classificationFilter, setClassificationFilter] = usePersistedFilter<string>(
    "cases", "classification", "all",
    // CONCLUDED_FILTER_VALUE must be in the allow-list or a persisted "منتهية"
    // would be rejected as unrecognised on the next visit and silently reset to
    // "all" — the stale-value guard turning on a value that is not stale.
    oneOf(
      [...Object.values(CaseClassification), CONCLUDED_FILTER_VALUE] as readonly string[],
      "all",
    ),
  );
  const [formData, setFormData] = useState({
    clientId: "",
    plaintiffName: "",
    caseType: "" as string,
    caseTypeOther: "",
    departmentId: "",
    departmentOther: "",
    priority: "متوسط" as PriorityType,
    courtName: "",
    courtCaseNumber: "",
    opponentName: "",
    caseClassification: "" as CaseClassificationValue | "",
    clientRole: "" as string,
    previousHearingsCount: 0,
    currentSituation: "",
    responseDeadline: "",
    nextHearingDate: "",
    nextHearingTime: "",
    adminCaseSubType: "" as string,
    prescriptionDate: "",
    memoRequired: false,
    startingStage: "استلام" as string,
  });

  const [assignData, setAssignData] = useState({
    lawyerId: "",
    departmentId: "",
    internalReviewerId: "",
    litigatorId: "",
  });

  const resetForm = () => {
    setFormData({
      clientId: "",
      plaintiffName: "",
      caseType: "",
      caseTypeOther: "",
      // CREATE-SCOPE — pre-filled and locked for a department_head / employee.
      departmentId: defaultCreateDepartmentId,
      departmentOther: "",
      priority: "متوسط",
      courtName: "",
      courtCaseNumber: "",
      opponentName: "",
      caseClassification: "",
      clientRole: "",
      previousHearingsCount: 0,
      currentSituation: "",
      responseDeadline: "",
      nextHearingDate: "",
      nextHearingTime: "",
      adminCaseSubType: "",
      prescriptionDate: "",
      memoRequired: false,
      startingStage: "استلام",
    });
  };

  const handleAddCase = async () => {
    if (!user) return;
    if (!formData.caseClassification) {
      toast({ title: "يرجى اختيار تصنيف القضية", variant: "destructive" });
      return;
    }
    if (!formData.clientId) {
      toast({
        title: clientsLoading
          ? "جاري تحميل قائمة العملاء، يرجى الانتظار"
          : "يجب اختيار العميل",
        variant: "destructive",
      });
      return;
    }

    const isPlaintiffNew = formData.caseClassification === CaseClassification.UNDER_STUDY;
    if (isPlaintiffNew && getDepartmentName(formData.departmentId) === "إداري") {
      if (!formData.adminCaseSubType) {
        toast({ title: "يرجى تحديد نوع القضية الإدارية (تظلم / قضية)", variant: "destructive" });
        return;
      }
      if (!formData.prescriptionDate) {
        toast({ title: "يرجى تحديد تاريخ التقادم", variant: "destructive" });
        return;
      }
    }
    try {
      await addCase({
        clientId: formData.clientId || "",
        plaintiffName: formData.plaintiffName || "",
        caseType: formData.caseType as CaseTypeValue,
        caseTypeOther: formData.caseTypeOther,
        departmentId: formData.departmentId,
        departmentOther: formData.departmentOther,
        priority: formData.priority,
        courtName: isPlaintiffNew ? "" : formData.courtName,
        courtCaseNumber: formData.courtCaseNumber,
        opponentName: formData.opponentName,
        caseClassification: formData.caseClassification as CaseClassificationValue,
        clientRole: formData.caseClassification === CaseClassification.IN_COURT
          ? (formData.clientRole || "مدعي")
          : null,
        previousHearingsCount: formData.previousHearingsCount,
        currentSituation: formData.currentSituation,
        responseDeadline: formData.responseDeadline || null,
        nextHearingDate: isPlaintiffNew ? null : (formData.nextHearingDate || null),
        nextHearingTime: isPlaintiffNew ? null : (formData.nextHearingTime || null),
        adminCaseSubType: formData.adminCaseSubType || null,
        prescriptionDate: formData.prescriptionDate || null,
        memoRequired: formData.memoRequired,
        startingStage: formData.caseClassification === CaseClassification.IN_COURT
          ? formData.startingStage
          : undefined,
      } as Partial<LawCase> & { startingStage?: string }, user.id, user.name);
    } catch (err) {
      toast({ title: "فشل إنشاء القضية", description: extractApiError(err), variant: "destructive" });
      return;
    }

    const classLabel = CaseClassificationLabels[formData.caseClassification as CaseClassificationValue] || "";
    toast({ title: `تم إضافة القضية بنجاح (${classLabel})` });
    setShowAddDialog(false);
    resetForm();
  };

  const handleAssign = () => {
    if (!selectedCase || !assignData.lawyerId || !assignData.departmentId) return;

    const isReassign = !!selectedCase.primaryLawyerId;
    assignCase(
      selectedCase.id,
      assignData.lawyerId,
      assignData.departmentId,
      assignData.internalReviewerId || null,
      assignData.litigatorId || null,
    );
    toast({ title: isReassign ? "تم تعديل الإسناد بنجاح" : "تم إسناد القضية بنجاح" });
    setShowAssignDialog(false);
    setSelectedCaseId(null);
    setAssignData({ lawyerId: "", departmentId: "", internalReviewerId: "", litigatorId: "" });
  };

  const handleApprove = (caseItem: LawCase) => {
    approveCase(caseItem.id);
    toast({ title: "تم اعتماد القضية — جاهزة للرفع" });
    setSelectedCaseId(null);
  };

  const handleReject = () => {
    if (!selectedCase) return;
    rejectCase(selectedCase.id, rejectNotes || "تم إضافة ملاحظات من لجنة المراجعة", "rejected");
    toast({ title: "تم إرسال القضية للأخذ بالملاحظات" });
    setShowRejectDialog(false);
    setSelectedCaseId(null);
    setRejectNotes("");
  };

  const handleDeleteCase = async () => {
    if (!caseToDelete) return;
    try {
      await deleteCase(caseToDelete.id);
      toast({ title: "تم حذف القضية بنجاح" });
    } catch (error) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف القضية" });
    }
    setShowDeleteDialog(false);
    setCaseToDelete(null);
  };

  // Per-case active-memo lookup, precomputed once per memos change so the sort
  // comparator stays O(1) per call instead of scanning the memo list for every
  // comparison. Now carries the memo TYPE too (see ActiveMemoInfo) so the row
  // badge can name an objection precisely — the existing map was ENRICHED
  // rather than joined by a second one, keeping a single pass and a single
  // dependency. The early `continue` the boolean version used is gone on
  // purpose: we must keep scanning a case's memos to learn whether an objection
  // is among them.
  const caseHasActiveMemoMap = useMemo(() => {
    const map = new Map<string, ActiveMemoInfo>();
    for (const m of memos) {
      if (!m.caseId) continue;
      if (!isActiveMemo(m)) continue;
      const info = map.get(m.caseId)
        || { hasActive: false, hasObjection: false, hasOther: false };
      info.hasActive = true;
      if (m.memoType === MemoType.OBJECTION) info.hasObjection = true;
      else info.hasOther = true;
      map.set(m.caseId, info);
    }
    return map;
  }, [memos]);

  const filteredCases = useMemo(() => {
    const matched = cases.filter((c) => {
      const clientName = c.clientId ? getClientName(c.clientId) : "";
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        c.caseNumber.toLowerCase().includes(q) ||
        (c.courtCaseNumber && c.courtCaseNumber.toLowerCase().includes(q)) ||
        (clientName && clientName.toLowerCase().includes(q)) ||
        (c.plaintiffName && c.plaintiffName.toLowerCase().includes(q)) ||
        (c.opponentName && c.opponentName.toLowerCase().includes(q));
      // Stage filter operates on displayStage (virtual grouping) so a
      // closed/archived case appears under مقفلة and a paused one
      // under استكمال_البيانات.
      const displayStage = getCaseDisplayStage(c);
      const matchesStatus = statusFilter === "all" || displayStage === statusFilter;
      const matchesDept = deptFilter === "all" || c.departmentId === deptFilter;
      // THREE-WAY PARTITION. "منتهية" is DERIVED from the stage (isCaseConcluded),
      // not stored — but the other two options now also EXCLUDE concluded cases,
      // so the three are mutually exclusive and every case appears under exactly
      // one of them.
      //
      // Without that exclusion a closed case would show under BOTH its stored
      // classification AND منتهية, since closing never clears caseClassification
      // — which makes "منظورة بالمحكمة" mean "in court, ever" rather than "in
      // court now" and quietly inflates every active count.
      //
      // "جميع التصنيفات" is unchanged and still shows everything, so nothing is
      // unreachable: a user who wants finished court cases picks منتهية.
      const concluded = isCaseConcluded(c);
      const matchesClassification =
        classificationFilter === "all"
          ? true
          : classificationFilter === CONCLUDED_FILTER_VALUE
          ? concluded
          : c.caseClassification === classificationFilter && !concluded;
      // BOTH fields — the filter tested primaryLawyerId alone, so picking a lawyer
      // hid every case that carries them only as responsibleLawyerId.
      const matchesLawyer = lawyerFilter === "all"
        || c.primaryLawyerId === lawyerFilter
        || c.responsibleLawyerId === lawyerFilter;
      const matchesAdvPriority =
        advFilters.priorities.length === 0 || advFilters.priorities.includes(c.priority);
      const matchesAdvStage =
        advFilters.stages.length === 0 || advFilters.stages.includes(displayStage as string);
      const matchesAdvDept =
        advFilters.depts.length === 0 || advFilters.depts.includes(c.departmentId);
      const matchesAdvClassification =
        advFilters.classifications.length === 0 ||
        advFilters.classifications.includes(c.caseClassification as string);
      const matchesAdvLawyer =
        advFilters.lawyers.length === 0 ||
        (c.responsibleLawyerId && advFilters.lawyers.includes(c.responsibleLawyerId)) ||
        (c.primaryLawyerId && advFilters.lawyers.includes(c.primaryLawyerId));
      return (
        matchesSearch &&
        matchesStatus &&
        matchesDept &&
        matchesClassification &&
        matchesLawyer &&
        matchesAdvPriority &&
        matchesAdvStage &&
        matchesAdvDept &&
        matchesAdvClassification &&
        matchesAdvLawyer
      );
    });
    // Default ordering: priority group ASC, then workflow-stage order
    // ASC within a group (earlier stages bubble up), then updatedAt
    // DESC within the same stage. The user can layer filters/search
    // on top — those run before this sort. A future column-header
    // sort would replace this default; for now there's no header
    // sort to honor. Unknown stages fall to 999 so they sink to the
    // bottom of their group rather than disrupting known-stage order.
    const updatedAtMs = (c: LawCase): number => {
      const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    const stageOrderIndex = (c: LawCase): number => {
      const i = CaseStagesOrder.indexOf(c.currentStage as CaseStageValue);
      return i === -1 ? 999 : i;
    };
    return matched.slice().sort((a, b) => {
      const ga = getCasePriorityGroup(a, !!caseHasActiveMemoMap.get(a.id)?.hasActive);
      const gb = getCasePriorityGroup(b, !!caseHasActiveMemoMap.get(b.id)?.hasActive);
      if (ga !== gb) return ga - gb;
      const sa = stageOrderIndex(a);
      const sb = stageOrderIndex(b);
      if (sa !== sb) return sa - sb;
      return updatedAtMs(b) - updatedAtMs(a);
    });
  }, [cases, searchQuery, statusFilter, deptFilter, classificationFilter, lawyerFilter, advFilters, getClientName, caseHasActiveMemoMap]);

  const basicAllowedStages = useMemo(() => {
    // "منتهية" is not a CaseClassification, so it must not be fed to
    // getFilterStages — it would match no classification and return an empty
    // stage list, emptying the STAGE dropdown whenever منتهية is selected.
    // Treated as "no classification constraint": the stage dropdown keeps
    // offering every stage, and the concluded filter does its own narrowing.
    const cls = classificationFilter !== "all" && classificationFilter !== CONCLUDED_FILTER_VALUE
      ? [classificationFilter]
      : [];
    const deptName = deptFilter !== "all"
      ? departments.find((d) => String(d.id) === deptFilter)?.name
      : undefined;
    const deptNames = deptName ? [deptName] : [];
    return getFilterStages(cls, deptNames);
  }, [classificationFilter, deptFilter, departments]);

  const departmentFilteredLawyers = useMemo(() => {
    if (deptFilter === "all") return filterLawyers;
    return filterLawyers.filter(u => String(u.departmentId) === deptFilter);
  }, [filterLawyers, deptFilter]);

  useEffect(() => {
    if (statusFilter !== "all" && !basicAllowedStages.includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [basicAllowedStages, statusFilter]);

  // STALE-VALUE GUARD for the async list. `departmentFilteredLawyers.length > 0`
  // is load-bearing now that lawyerFilter can be RESTORED from storage: without
  // it this fires on the first render (before users land) and wipes a perfectly
  // valid saved lawyer. Same reason the department guard below waits.
  useEffect(() => {
    if (departmentFilteredLawyers.length === 0) return;
    if (lawyerFilter !== "all" && !departmentFilteredLawyers.some(u => u.id === lawyerFilter)) {
      setLawyerFilter("all");
    }
  }, [departmentFilteredLawyers, lawyerFilter]);

  // A saved (or defaulted) department that no longer exists — a deleted dept, or
  // a user moved out of one — must not leave the list mysteriously empty.
  useEffect(() => {
    if (departments.length === 0) return;
    if (deptFilter !== "all" && !departments.some(d => String(d.id) === deptFilter)) {
      setDeptFilter("all");
    }
  }, [departments, deptFilter]);

  // Rows-per-page is user-configurable and persisted per user + per page
  // (see use-page-size). Default stays 15.
  const [PAGE_SIZE, setPageSize] = usePageSize("cases");
  const [casePage, setCasePage] = useState(1);
  useEffect(() => { setCasePage(1); }, [searchQuery, statusFilter, deptFilter, classificationFilter, lawyerFilter, advFilters]);
  const casesTotalPages = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE));
  const pagedCases = filteredCases.slice((casePage - 1) * PAGE_SIZE, casePage * PAGE_SIZE);
  // Changing the size resets to page 1 — the old page number is meaningless
  // against a different slice size (page 4 of 15 may not exist at 50).
  const handlePageSizeChange = (size: number) => { setPageSize(size); setCasePage(1); };

  const isDeptHead = user?.role === "department_head";

  const openAssignDialog = (caseItem: LawCase) => {
    setSelectedCaseId(caseItem.id);
    setAssignData({
      lawyerId: caseItem.primaryLawyerId || "",
      departmentId: isDeptHead ? (String(user?.departmentId || "")) : (String(caseItem.departmentId || "")),
      internalReviewerId: caseItem.internalReviewerId || "",
      litigatorId: caseItem.litigatorId || "",
    });
    setShowAssignDialog(true);
  };

  const openTransferDialog = (caseItem: LawCase) => {
    const currentStageIndex = CaseStagesOrder.indexOf(caseItem.currentStage);
    const reviewStageIndex = CaseStagesOrder.indexOf(CaseStage.REVIEW_COMMITTEE);
    if (currentStageIndex >= reviewStageIndex) {
      toast({ title: "لا يمكن تحويل القضية", description: "القضية في مرحلة متقدمة من المراجعة ولا يمكن تحويلها", variant: "destructive" });
      return;
    }
    setTransferCaseId(caseItem.id);
    setTransferData({ toDepartmentId: "", reason: "" });
    setShowTransferDialog(true);
  };

  const handleTransferRequest = async () => {
    const caseItem = transferCaseId ? getCaseById(transferCaseId) : null;
    if (!caseItem || !transferData.toDepartmentId || !transferData.reason.trim()) return;
    try {
      // Direct PATCH triggers the server's isDeptTransfer flow:
      // resets currentStage to استلام, clears lawyers, emits a
      // department_transferred activity log entry with the reason.
      await apiRequest("PATCH", `/api/cases/${caseItem.id}`, {
        departmentId: transferData.toDepartmentId,
        transferReason: transferData.reason,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "تم تحويل القضية", description: "أُعيدت لمرحلة الاستلام في القسم الجديد" });
    } catch (e: any) {
      toast({ title: "فشل تحويل القضية", description: e?.message || "حدث خطأ", variant: "destructive" });
    }
    setShowTransferDialog(false);
    setTransferCaseId(null);
  };

  const openRejectDialog = (caseItem: LawCase) => {
    setSelectedCaseId(caseItem.id);
    setRejectNotes("");
    setShowRejectDialog(true);
  };

  const openDetailsDialog = (caseItem: LawCase) => {
    setSelectedCaseId(caseItem.id);
    setShowDetailsDialog(true);
    // The attachments + comments fetches that used to fire here moved INTO
    // <CaseDetailsDialog> (it loads them when it opens), so every host gets a
    // primed dialog without having to remember to prime it.
    addRecentVisit("case", caseItem.id, `${caseItem.caseNumber} - ${getClientName(caseItem.clientId)}`);
  };

  // Resolve a pending /cases?openCase=<id> deep-link once the case
  // arrives in the loaded list. Runs after refreshCases() resolves on
  // a cold tab and after subsequent updates that might add the case.
  useEffect(() => {
    if (!pendingOpenCaseId) return;
    const c = cases.find((x) => x.id === pendingOpenCaseId);
    if (c) {
      openDetailsDialog(c);
      // ?action=judgment-deed → open the صك receipt dialog straight away, so the
      // مهامي "متابعة" button lands on the ACTION rather than on the case file.
      // GUARDED: only when the case is still at محكوم_حكم_ابتدائي and the user is
      // actually authorized. If the receipt was already recorded (or anyone else
      // moved the case on) the deep-link degrades to "just open the case" instead
      // of popping a dialog whose endpoint would 400.
      if (pendingOpenAction === "judgment-deed" && canRecordJudgmentDeed(c)) {
        setDeedCase(c);
        setDeedDate(c.judgmentDeedReceivedDate || "");
        setDeedWindowDays(String(c.objectionWindowDays ?? 30));
        setShowDeedDialog(true);
      }
      // The other two follow-up tasks land on ROWS inside the الإجراءات tab
      // rather than on a dialog of their own, so the deep-link selects that tab
      // and lets the user press the button that applies. Both are guarded by the
      // SAME predicate the row itself is gated on, so a link whose condition has
      // already cleared just opens the case on its default tab.
      //   appeal-outcome    → نتيجة مهلة الاعتراض (الخصم استأنف / لم يستأنف)
      //   opponent-response → تم استلام رد الخصم
      if (pendingOpenAction === "appeal-outcome" && canRecordJudgmentDeed(c)) {
        setDetailsInitialTab("actions");
      }
      if (
        pendingOpenAction === "opponent-response"
        && canActOnCaseWorkflow(c)
        && getHearingsByCase(c.id).some((h) => h.opponentResponseRequired)
      ) {
        setDetailsInitialTab("actions");
      }
      setPendingOpenCaseId(null);
      setPendingOpenAction(null);
    }
  }, [pendingOpenCaseId, pendingOpenAction, cases]); // eslint-disable-line react-hooks/exhaustive-deps

  // The source-consultation back-link lookup moved into <CaseDetailsDialog> along
  // with the banner that renders it.

  const openReviewDialog = (caseItem: LawCase) => {
    setSelectedCaseId(caseItem.id);
    setShowReviewDialog(true);
  };

  const openReminderDialog = (caseItem: LawCase) => {
    setReminderCaseId(caseItem.id);
    const defaultRecipient = caseNotificationRecipientId(caseItem);
    setReminderData({ reminderType: "تذكير بتحديث الحالة", message: "", recipientId: defaultRecipient });
    setShowReminderDialog(true);
  };

  const reminderCase = reminderCaseId ? getCaseById(reminderCaseId) : null;
  const reminderHasDefaultRecipient = !!caseNotificationRecipientId(reminderCase);
  const reminderDeptLawyers = reminderCase
    ? users.filter(u => u.canBeAssignedCases && u.departmentId === reminderCase.departmentId && u.id !== caseNotificationRecipientId(reminderCase))
    : [];

  const handleSendReminder = async () => {
    if (!reminderCase) return;
    const recipientId = reminderData.recipientId;
    if (!recipientId) {
      toast({ title: "يرجى اختيار المحامي المستلم للتذكير", variant: "destructive" });
      return;
    }
    const msg = reminderData.message || `${reminderData.reminderType} للقضية رقم ${reminderCase.caseNumber}`;
    try {
      await sendCaseReminder(reminderCase.id, reminderCase.caseNumber, recipientId, reminderData.reminderType, msg);
      toast({ title: "تم إرسال التذكير بنجاح" });
    } catch {
      toast({ title: "فشل إرسال التذكير", variant: "destructive" });
    }
    setShowReminderDialog(false);
    setReminderCaseId(null);
  };

  const canAssign = (c: LawCase) =>
    (user?.role === "branch_manager" ||
     user?.role === "admin_support" ||
     (permissions.canAssignInDepartment && c.departmentId === user?.departmentId));

  const canReview = (c: LawCase) =>
    permissions.canReviewCases && 
    c.currentStage === CaseStage.REVIEW_COMMITTEE;

  // WIDENED MODEL — case DATA editing was branch_manager | admin_support only.
  // Own-dept department_head and the assigned lawyer may now correct the record,
  // mirroring the server gate on PATCH /api/cases/:id (canEditCaseData OR the
  // department/assignee tiers).
  const canEditCaseRecord = (c: LawCase): boolean => {
    if (!user) return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    return canActOnCaseWorkflow(c);
  };

  // CREATE-SCOPE — department_head AND employee may open a case, but only in THEIR
  // OWN department. Mirrors POST /api/cases + scopedCreateDepartmentId.
  const canCreateCase =
    !!permissions.canAddCasesAndConsultations
    || (["department_head", "employee"].includes(user?.role ?? "") && !!user?.departmentId);

  // CREATE-SCOPE picker mirror — for the two scoped roles the department list is
  // filtered to their own department AND the control is locked, so the value the
  // server will accept is the only value they can pick. Belt-and-braces on purpose:
  // the server rejects a differing explicit departmentId with a 400, and this makes
  // that 400 unreachable through the UI.
  const isDeptScopedCreator =
    user?.role === "department_head" || user?.role === "employee";
  const creatableDepartments = isDeptScopedCreator
    ? departments.filter((d) => d.id === user?.departmentId)
    : departments;
  const defaultCreateDepartmentId = isDeptScopedCreator ? (user?.departmentId || "") : "";

  const canClose = (c: LawCase) =>
    permissions.canCloseCases &&
    c.currentStage !== CaseStage.CLOSED &&
    (c.currentStage === CaseStage.READY_TO_SUBMIT || c.currentStage === CaseStage.UNDER_REVIEW ||
     c.currentStage === CaseStage.CONCILIATION || c.currentStage === CaseStage.CONCILIATION_CLOSED);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة القضايا</h1>
          <p className="text-muted-foreground">متابعة وإدارة جميع القضايا</p>
        </div>
        {canCreateCase && (
          <Button data-testid="button-add-case" onClick={() => { resetForm(); setClassificationGroup(""); setShowAddDialog(true); }}>
            <Plus className="w-4 h-4 ml-2" />
            قضية جديدة
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <SmartInput
                inputType="text"
                data-testid="input-search"
                placeholder="بحث برقم القضية أو اسم العميل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-dept-filter">
                <SelectValue placeholder="القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأقسام</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={String(dept.id)} value={String(dept.id)}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lawyerFilter} onValueChange={setLawyerFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-lawyer-filter">
                <SelectValue placeholder="المحامي" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المحامين</SelectItem>
                {departmentFilteredLawyers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-classification-filter">
                <SelectValue placeholder="التصنيف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع التصنيفات</SelectItem>
                <SelectItem value="قيد_الدراسة">قضية قيد الدراسة</SelectItem>
                <SelectItem value="منظورة_بالمحكمة">منظورة بالمحكمة</SelectItem>
                {/* DERIVED from currentStage (+ clientRole for أغلق_طلب_الصلح),
                    never stored — see isCaseConcluded. The two options above now
                    exclude concluded cases, so these three partition the list. */}
                <SelectItem value={CONCLUDED_FILTER_VALUE}>منتهية</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المراحل</SelectItem>
                {basicAllowedStages.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {CaseStageLabels[stage as keyof typeof CaseStageLabels] || stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CasesAdvancedFilters
              filters={advFilters}
              onChange={setAdvFilters}
              departments={departments.map((d) => ({ id: String(d.id), name: d.name }))}
              lawyers={departmentFilteredLawyers.map((l) => ({ id: l.id, name: l.name }))}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table className="w-full" style={{ tableLayout: 'fixed' }}>
            {/* Widths sum to EXACTLY 100%, in header order:
                   4  #
                  10  رقم القضية
                  12  العميل                ← free text (+ sub-line)
                  11  الخصم                 ← free text
                   8  صفة العميل            ← ONE short badge (مدعي / مدعى عليه)
                  16  الحالة                ← stage badge + up to 2 status pills
                                              on one line, then derived pills
                  13  المحامي المسؤول       ← long Arabic names
                  10  المراجع الداخلي       ← usually "—"
                   8  القسم
                   8  الإجراءات
                  ---
                 100
                الحالة was 12% and its badge row was a non-wrapping inline-flex,
                so a stage badge + a معلقة/بانتظار pill overflowed the cell and
                painted over المحامي المسؤول. The 4 points come from صفة العميل
                (a single short badge never needed 12) and 2 more for the lawyer
                column from المراجع الداخلي. The row itself now wraps — see the
                badge container below. Labels live here rather than as inline JSX
                comments after each <col />, which would leave whitespace text
                nodes inside <colgroup> and trip React's DOM-nesting validation.
                Same idiom as consultations.tsx / hearings.tsx. */}
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">#</TableHead>
                <TableHead className="text-center">رقم القضية</TableHead>
                <TableHead className="text-center">العميل</TableHead>
                <TableHead className="text-center">الخصم</TableHead>
                <TableHead className="text-center">صفة العميل</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">المحامي المسؤول</TableHead>
                <TableHead className="text-center">المراجع الداخلي</TableHead>
                <TableHead className="text-center">القسم</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {casesLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span>جاري التحميل...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : pagedCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    لا توجد قضايا مطابقة للبحث
                  </TableCell>
                </TableRow>
              ) : pagedCases.map((c, idx) => {
                const activeMemoInfo = caseHasActiveMemoMap.get(c.id);
                const hasActiveMemo = !!activeMemoInfo?.hasActive;
                const priorityGroup = getCasePriorityGroup(c, hasActiveMemo);
                // Row tinting: group 1 picks up an amber background to
                // catch the eye, groups 4 + 5 dim so they read as
                // backlog without dropping off the page.
                const rowClass =
                  priorityGroup === 1
                    ? "bg-amber-50/60 dark:bg-amber-950/20"
                    : priorityGroup === 5
                      ? "opacity-60"
                      : priorityGroup === 4
                        ? "opacity-80"
                        : "";
                return (
                <TableRow key={c.id} data-testid={`row-case-${c.id}`} className={rowClass}>
                  {/* Display-only sequential number. Derived from the index
                      inside the RENDERED page, so any filter/sort/search
                      renumbers from 1. Continues across pages (the page
                      offset is added) because the pager is a plain slice
                      of one already-sorted list. */}
                  <TableCell className="text-center text-xs text-muted-foreground" data-testid={`cell-index-${c.id}`}>
                    {(casePage - 1) * PAGE_SIZE + idx + 1}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <LtrInline>{c.caseNumber}</LtrInline>
                      {priorityGroup === 1 && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1 py-0"
                          data-testid={`badge-unassigned-${c.id}`}
                          title="القضية لم تُسنَد لمحامٍ بعد"
                        >
                          <AlertTriangle className="w-2.5 h-2.5 ml-1" />
                          غير مسندة
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {/* break-words on every free-text cell: table-layout is fixed,
                      so ordinary Arabic names already wrap at their spaces and
                      never widen a column — but a single long unbroken token (a
                      pasted ID, a URL-ish opponent name) would still spill out of
                      its cell. break-words confines it. */}
                  <TableCell className="text-center break-words">
                    <div>
                      <div className="font-medium text-sm leading-snug">{c.plaintiffName || getClientName(c.clientId)}</div>
                      {c.plaintiffName && getClientName(c.clientId) && (
                        <div className="text-xs text-muted-foreground">{getClientName(c.clientId)}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm break-words">{c.opponentName || "-"}</TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const role = getClientRoleLabel(c.caseClassification, c.clientRole);
                      if (role === "-") {
                        return <span className="text-xs text-muted-foreground">-</span>;
                      }
                      return (
                        <Badge variant="outline" className={`text-xs inline-flex text-center justify-center ${
                          role === "مدعى عليه"
                            ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                            : "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
                        }`}>
                          {role}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    {/* Stack the stage badge on top with the inline status
                        indicators (paused / awaiting / platform-notes /
                        رد خصم) and put the post-review "تعديلات" pill on
                        its own row below — keeps the cell from overflowing
                        when both the stage label and the loop marker are
                        present. */}
                    <div className="flex flex-col items-center gap-1 min-w-0">
                      {/* flex-wrap + max-w-full: Badge is whitespace-nowrap by
                          design (ui/badge.tsx), and a flex item's min-width
                          defaults to auto — so the old non-wrapping inline-flex
                          could not shrink and bled sideways over the neighbouring
                          column whenever a status pill joined the stage badge.
                          Wrapping drops the extra pill onto a second line inside
                          the cell instead. Same container shape consultations.tsx
                          already uses (:2376). */}
                      <div className="flex flex-wrap items-center justify-center gap-1 max-w-full">
                        {/* displayStage groups paused → استكمال_البيانات
                            and closed/archived → مقفلة so the badge
                            matches what the stage filter returns. */}
                        {/* STAGE_BADGE_WRAP_CLASS — 7e48109 widened this column
                            to 16% and wrapped the container, which was necessary
                            but NOT sufficient: CaseStageLabels carries two
                            26-char labels ("استكمال المرفقات والبيانات" and
                            "بانتظار رفع العميل للتسوية") and Badge is
                            whitespace-nowrap, so on a narrow viewport the badge
                            still overflows 16%. Letting it wrap closes that. */}
                        <Badge className={cn(getStageColor(getCaseDisplayStage(c)), "inline-flex justify-center", STAGE_BADGE_WRAP_CLASS)}>
                          {getStageLabel(getCaseDisplayStage(c))}
                        </Badge>
                        {/* Phase-8 — paused indicator. */}
                        {isCasePaused(c) && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                            data-testid={`badge-paused-${c.id}`}
                            title={pauseBadgeTooltip(c)}
                          >
                            <Pause className="w-2.5 h-2.5 ml-1" />
                            معلّقة
                          </Badge>
                        )}
                        {/* Phase-8 — awaiting-completion indicator. */}
                        {c.awaitingCompletion && !isCasePaused(c) && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                            data-testid={`badge-awaiting-case-${c.id}`}
                            title="بانتظار استكمال البيانات"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 ml-1" />
                            بانتظار
                          </Badge>
                        )}
                        {(c.currentStage === "قيد_التدقيق_في_تراضي" ||
                          c.currentStage === "قيد_التدقيق_في_ناجز" ||
                          c.currentStage === "قيد_التدقيق_في_معين") &&
                          c.platformReviewNotes &&
                          String(c.platformReviewNotes).trim() && (
                            <span
                              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 border border-amber-400"
                              title="يوجد ملاحظات من المنصة"
                              data-testid={`platform-notes-indicator-${c.id}`}
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                            </span>
                          )}
                        {getHearingsByCase(c.id).some(h => h.opponentResponseRequired) && (
                          <Badge variant="outline" className="text-[10px] border-orange-500 text-orange-600 dark:text-orange-400 px-1 py-0">
                            رد خصم
                          </Badge>
                        )}
                      </div>
                      {caseHasReturnedFromReview(c) && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1 py-0"
                          data-testid={`badge-post-review-${c.id}`}
                          title="عادت من المراجعة الداخلية — تعديلات وليس صياغة أولية"
                        >
                          <RotateCcw className="w-2.5 h-2.5 ml-1" />
                          تعديلات
                        </Badge>
                      )}
                      {/* Same badge, same styling and placement — only the LABEL
                          switches. An active لائحة اعتراضية wins the name over the
                          generic "مذكرة جارية" because it is the memo the judgment
                          CREATES (it is the one type cancellation always spares),
                          and it sits directly beside "بانتظار استلام الصك" on a
                          محكوم_حكم_ابتدائي case — the two describe one situation, so
                          the vaguer word would read as a second, unrelated memo.
                          BOTH present → the objection still wins the label and the
                          tooltip says the others exist, so nothing is hidden. */}
                      {priorityGroup === 3 && (
                        <Badge
                          variant="outline"
                          className="border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] px-1 py-0"
                          data-testid={`badge-active-memo-${c.id}`}
                          title={
                            activeMemoInfo?.hasObjection
                              ? (activeMemoInfo.hasOther
                                ? "القضية منظورة في المحكمة وفيها لائحة اعتراضية جارية — وتوجد مذكرات أخرى جارية أيضاً"
                                : "القضية منظورة في المحكمة وفيها لائحة اعتراضية جارية")
                              : "القضية منظورة في المحكمة وفيها مذكرة جارية"
                          }
                        >
                          <RotateCcw className="w-2.5 h-2.5 ml-1" />
                          {activeMemoInfo?.hasObjection
                            ? MemoTypeLabels[MemoType.OBJECTION]
                            : "مذكرة جارية"}
                        </Badge>
                      )}
                      {/* Judgment-lifecycle step 2 — DERIVED, exactly like
                          "مذكرة جارية" above: no stored flag, no clearing code.
                          Entering the receipt date makes the second term false and
                          the badge disappears on the next render. Coexists with the
                          active-memo badge by design (محكوم_حكم_ابتدائي is in
                          IN_COURT_STAGES_FOR_MEMO_GROUP, so a case with an
                          objection memo shows both — and that neighbour is exactly
                          why the other badge now reads "لائحة اعتراضية"). */}
                      {isAwaitingJudgmentDeed(c) && (
                        <Badge
                          variant="outline"
                          className="border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[10px] px-1 py-0"
                          data-testid={`badge-awaiting-deed-${c.id}`}
                          title="صدر حكم ابتدائي ولم يُسجَّل استلام الصك بعد — مهلة الاعتراض تبدأ من تاريخ الاستلام"
                        >
                          <FileText className="w-2.5 h-2.5 ml-1" />
                          بانتظار استلام الصك
                        </Badge>
                      )}
                      {/* Deed state 2 of 3 — the receipt date IS recorded but the
                          صك file itself hasn't been filed. AMBER, not purple: the
                          purple badge above means "still waiting on the court",
                          which is outside our control, whereas this one is a task
                          sitting on our own desk. Mutually exclusive with it by
                          construction (that one needs the date empty, this one
                          needs it filled), so a case never shows both.
                          Self-clearing: hasDeedAttachment is recomputed from
                          case_attachments on every list read. */}
                      {isAwaitingJudgmentDeedFile(c) && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1 py-0"
                          data-testid={`badge-awaiting-deed-file-${c.id}`}
                          title="سُجّل تاريخ استلام الصك ولم تُرفق نسخة الصك بعد"
                        >
                          <Paperclip className="w-2.5 h-2.5 ml-1" />
                          بانتظار إرفاق الصك
                        </Badge>
                      )}
                      {/* The SAME state one stage later. A case can legitimately
                          reach منظورة_استئناف / محكوم_حكم_نهائي still owing its صك
                          — three automatic cascades are deliberately not blocked —
                          and the close gate then holds it there. Without this the
                          hold would be invisible: the badge above stops at
                          محكوم_حكم_ابتدائي. Same words, same amber, because it is
                          the same task on the same desk. */}
                      {isPostJudgmentCaseMissingDeed(c) && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1 py-0"
                          data-testid={`badge-post-judgment-missing-deed-${c.id}`}
                          title="صدر حكم في القضية ولم تُرفق نسخة الصك — لا يمكن إغلاق القضية قبل إرفاقه"
                        >
                          <Paperclip className="w-2.5 h-2.5 ml-1" />
                          بانتظار إرفاق الصك
                        </Badge>
                      )}
                      {/* A hearing on this case has its result recorded but no
                          ضبط attached. Reads the SAME in-memory hearings list the
                          "رد خصم" badge above uses (getHearingsByCase), so no
                          extra request. Self-clearing for the same reason as the
                          deed badge — hasMinutesAttachment is derived per read. */}
                      {caseHasHearingMissingMinutes(getHearingsByCase(c.id)) && (
                        <Badge
                          variant="outline"
                          className="border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[10px] px-1 py-0"
                          data-testid={`badge-missing-minutes-${c.id}`}
                          title="سُجّلت نتيجة جلسة ولم يُرفق ضبط الجلسة بعد"
                        >
                          <Paperclip className="w-2.5 h-2.5 ml-1" />
                          إرفاق ضبط الجلسة
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm break-words">
                    {getLawyerName(caseNotificationRecipientId(c))}
                    {/* "المترافع" — rendered only when set, so the row is
                        unchanged for the overwhelming majority of cases. Makes
                        it visible from the LIST that someone else appears in
                        court, without opening the case. */}
                    {c.litigatorId && (
                      <span
                        className="block text-[10px] text-amber-700 dark:text-amber-400 mt-0.5"
                        title="المترافع — يحضر الجلسات نيابةً عن المحامي المسؤول"
                      >
                        يترافع: {getLawyerName(c.litigatorId)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm break-words">
                    {c.internalReviewerId
                      ? (users.find(u => u.id === c.internalReviewerId)?.name || "—")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm break-words">{c.departmentId === "أخرى" ? (c.departmentOther || "أخرى") : getDepartmentName(c.departmentId)}</TableCell>
                  <TableCell className="text-center">
                    {/* Row actions — Eye stays inline for the common
                        "open details" path; everything else moves into a
                        3-dot dropdown so the column doesn't grow with the
                        number of permissions a role unlocks. Mirrors the
                        consultations.tsx pattern. Each dropdown item is
                        gated by its own permission check, so dept_heads
                        only ever see the actions they're actually
                        allowed to perform. */}
                    {(() => {
                      const canEdit = canEditCaseRecord(c);
                      const canReassign = user?.role === "department_head" && c.currentStage !== "مقفلة" && !c.isArchived;
                      const canResumeAwait = !isCasePaused(c) && c.awaitingCompletion && canPauseCase(c);
                      const canMarkAwait = !isCasePaused(c)
                        && !c.awaitingCompletion
                        && c.status !== "مغلق"
                        && !c.isArchived
                        && c.currentStage !== "استكمال_البيانات"
                        && canPauseCase(c);
                      const canUnpause = isCasePaused(c) && canPauseCase(c);
                      const canPause = !isCasePaused(c) && c.status !== "مغلق" && !c.isArchived && canPauseCase(c);
                      const canEarlyClose = canEarlyCloseCase(c);
                      const canCloseNoResponse = canCloseCaseForNoResponse(c);
                      const canDelete = user?.role === "branch_manager";
                      const hasAnyAction = canEdit || canReassign || canResumeAwait || canMarkAwait
                        || canUnpause || canPause || canEarlyClose || canCloseNoResponse || canDelete;
                      return (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-primary hover:text-primary"
                            title="عرض التفاصيل"
                            data-testid={`button-view-${c.id}`}
                            onClick={() => openDetailsDialog(c)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {hasAnyAction && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`button-actions-${c.id}`}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEdit && (
                                  <DropdownMenuItem
                                    data-testid={`button-edit-${c.id}`}
                                    onClick={() => openEditDialog(c)}
                                  >
                                    <Pencil className="w-4 h-4 ml-2" />
                                    تعديل البيانات
                                  </DropdownMenuItem>
                                )}
                                {canReassign && (
                                  <DropdownMenuItem
                                    data-testid={`button-reassign-case-${c.id}`}
                                    onClick={() => openReassignCaseDialog(c)}
                                  >
                                    <UserCog className="w-4 h-4 ml-2" />
                                    إسناد لمحامي
                                  </DropdownMenuItem>
                                )}
                                {/* Phase-8 — await-completion / resume actions.
                                    Same permission gate as pause/unpause; one of
                                    the two renders depending on awaitingCompletion. */}
                                {canResumeAwait && (
                                  <DropdownMenuItem
                                    data-testid={`button-resume-case-${c.id}`}
                                    className="text-green-600 focus:text-green-700"
                                    onClick={() => lifecycle.openResume(c)}
                                  >
                                    <CheckCircle className="w-4 h-4 ml-2" />
                                    تم الاستكمال
                                  </DropdownMenuItem>
                                )}
                                {canMarkAwait && (
                                  <DropdownMenuItem
                                    data-testid={`button-await-case-${c.id}`}
                                    className="text-amber-600 focus:text-amber-700"
                                    onClick={() => lifecycle.openAwait(c)}
                                  >
                                    <AlertTriangle className="w-4 h-4 ml-2" />
                                    بانتظار استكمال البيانات
                                  </DropdownMenuItem>
                                )}
                                {(canUnpause || canPause) && <DropdownMenuSeparator />}
                                {canUnpause && (
                                  <DropdownMenuItem
                                    data-testid={`button-unpause-case-${c.id}`}
                                    onClick={() => lifecycle.openUnpause(c)}
                                  >
                                    <Play className="w-4 h-4 ml-2" />
                                    إلغاء التعليق
                                  </DropdownMenuItem>
                                )}
                                {canPause && (
                                  <DropdownMenuItem
                                    data-testid={`button-pause-case-${c.id}`}
                                    className="text-amber-600 focus:text-amber-700"
                                    onClick={() => lifecycle.openPause(c)}
                                  >
                                    <Pause className="w-4 h-4 ml-2" />
                                    تعليق القضية
                                  </DropdownMenuItem>
                                )}
                                {(canEarlyClose || canCloseNoResponse || canDelete) && <DropdownMenuSeparator />}
                                {/* Sits ABOVE the generic إغلاق مبكر so the
                                    specific action is the first close a user
                                    sees on a data-completion case. Both can
                                    render together — إغلاق مبكر stays available
                                    for a genuinely different reason. */}
                                {canCloseNoResponse && (
                                  <DropdownMenuItem
                                    data-testid={`button-close-no-response-${c.id}`}
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => { setCloseNoResponseCase(c); setCloseNoResponseNotes(""); }}
                                  >
                                    <Archive className="w-4 h-4 ml-2" />
                                    إغلاق لعدم استكمال البيانات
                                  </DropdownMenuItem>
                                )}
                                {canEarlyClose && (
                                  <DropdownMenuItem
                                    data-testid={`button-early-close-row-${c.id}`}
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => { setEarlyCloseCase(c); setShowEarlyCloseDialog(true); }}
                                  >
                                    <XCircle className="w-4 h-4 ml-2" />
                                    إغلاق مبكر
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem
                                    data-testid={`button-delete-case-${c.id}`}
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => { setCaseToDelete(c); setShowDeleteDialog(true); }}
                                  >
                                    <Trash2 className="w-4 h-4 ml-2" />
                                    حذف القضية
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <PaginationControls
            currentPage={casePage}
            totalPages={casesTotalPages}
            onPageChange={setCasePage}
            pageSize={PAGE_SIZE}
            onPageSizeChange={handlePageSizeChange}
          />
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة قضية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">تصنيف القضية</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  data-testid="classification-case-new"
                  onClick={() => {
                    setClassificationGroup("new");
                    setFormData({ ...formData, caseClassification: CaseClassification.UNDER_STUDY, previousHearingsCount: 0, currentSituation: "", responseDeadline: "", clientRole: "" as any });
                  }}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    formData.caseClassification === CaseClassification.UNDER_STUDY
                      ? "border-[#D4AF37] bg-[#D4AF37]/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <FileText className="h-6 w-6 text-[#345774]" />
                  <span className="text-xs font-medium text-center">قضية قيد الدراسة</span>
                </button>
                <button
                  type="button"
                  data-testid="classification-case-existing"
                  onClick={() => {
                    setClassificationGroup("existing");
                    setFormData({ ...formData, caseClassification: CaseClassification.IN_COURT });
                  }}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    formData.caseClassification === CaseClassification.IN_COURT
                      ? "border-[#345774] bg-[#345774]/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <Scale className="h-6 w-6 text-[#345774]" />
                  <span className="text-xs font-medium text-center">منظورة بالمحكمة</span>
                </button>
              </div>
              {formData.caseClassification === CaseClassification.IN_COURT && (
                <div className="space-y-3 mt-3">
                  <div>
                    <Label>صفة العميل <span className="text-red-500">*</span></Label>
                    <Select
                      value={formData.clientRole || ""}
                      onValueChange={(value) => setFormData({ ...formData, clientRole: value })}
                    >
                      <SelectTrigger data-testid="select-client-role">
                        <SelectValue placeholder="اختر صفة العميل" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="مدعي">مدعي</SelectItem>
                        <SelectItem value="مدعى_عليه">مدعى عليه</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {formData.caseClassification && (
              <>
                <div>
                  <Label>العميل <span className="text-red-500">*</span></Label>
                  <ClientAutocomplete
                    value={formData.clientId}
                    onChange={(clientId) => setFormData({ ...formData, clientId })}
                  />
                </div>
                <div>
                  <Label>اسم المدعي <span className="text-xs text-muted-foreground">يُسجل اسم المدعي الحقيقي في الدعوى (منشأة تابعة للعميل)</span></Label>
                  <SmartInput
                    inputType="text"
                    data-testid="input-plaintiff-name"
                    value={formData.plaintiffName}
                    onChange={(e) => setFormData({ ...formData, plaintiffName: e.target.value })}
                    placeholder=""
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>نوع القضية</Label>
                    <SmartInput
                      inputType="text"
                      data-testid="input-case-type"
                      value={formData.caseType}
                      onChange={(e) => setFormData({ ...formData, caseType: e.target.value as string })}
                      placeholder="أدخل نوع القضية..."
                    />
                  </div>
                  <div>
                    <Label>الأولوية</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: PriorityType) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger data-testid="select-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(Priority).map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>القسم</Label>
                  <Select
                    value={formData.departmentId}
                    onValueChange={(value) => setFormData({ ...formData, departmentId: value, departmentOther: "" })}
                    disabled={isDeptScopedCreator}
                  >
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="اختر القسم" />
                    </SelectTrigger>
                    <SelectContent>
                      {creatableDepartments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                      ))}
                      {/* "أخرى" would land the case outside any department, which a
                          dept-scoped creator is not allowed to do. */}
                      {!isDeptScopedCreator && <SelectItem value="أخرى">أخرى</SelectItem>}
                    </SelectContent>
                  </Select>
                  {formData.departmentId === "أخرى" && (
                    <SmartInput
                      inputType="text"
                      data-testid="input-department-other"
                      value={formData.departmentOther}
                      onChange={(e) => setFormData({ ...formData, departmentOther: e.target.value })}
                      placeholder="اكتب اسم القسم..."
                      className="mt-2"
                    />
                  )}
                </div>
                <div>
                  <Label>اسم الخصم</Label>
                  <SmartInput
                    inputType="text"
                    data-testid="input-opponent-name"
                    value={formData.opponentName}
                    onChange={(e) => setFormData({ ...formData, opponentName: e.target.value })}
                  />
                </div>

                {formData.caseClassification !== CaseClassification.UNDER_STUDY && (
                  <div>
                    <Label>رقم القضية</Label>
                    <SmartInput
                      inputType="code"
                      data-testid="input-court-case-number"
                      value={formData.courtCaseNumber}
                      onChange={(e) => setFormData({ ...formData, courtCaseNumber: e.target.value })}
                      placeholder="أدخل رقم القضية لدى المحكمة"
                    />
                  </div>
                )}

                {formData.caseClassification !== CaseClassification.UNDER_STUDY && (
                  <div>
                    <Label>اسم المحكمة</Label>
                    <SmartInput
                      inputType="text"
                      data-testid="input-court-name"
                      value={formData.courtName}
                      onChange={(e) => setFormData({ ...formData, courtName: e.target.value })}
                      placeholder="مثال: المحكمة التجارية بالرياض"
                    />
                  </div>
                )}

                {formData.caseClassification === CaseClassification.UNDER_STUDY && (
                  <>
                    {getDepartmentName(formData.departmentId) === "تجاري" && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <Info className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-xs text-blue-700 dark:text-blue-400">القضايا التجارية تتطلب التقييد في منصة تراضي ومحاولة الصلح قبل رفعها للمحكمة</span>
                      </div>
                    )}
                    {getDepartmentName(formData.departmentId) === "عمالي" && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <Info className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-xs text-blue-700 dark:text-blue-400">القضايا العمالية تتطلب التقييد في منصة وزارة الموارد البشرية والتسوية الودية قبل رفعها للمحكمة</span>
                      </div>
                    )}
                    {getDepartmentName(formData.departmentId) === "إداري" && (
                      <>
                        <div>
                          <Label>نوع القضية الإدارية <span className="text-red-500">*</span></Label>
                          <Select
                            value={formData.adminCaseSubType}
                            onValueChange={(value) => setFormData({ ...formData, adminCaseSubType: value })}
                          >
                            <SelectTrigger data-testid="select-admin-case-subtype">
                              <SelectValue placeholder="اختر النوع" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="تظلم">تظلم</SelectItem>
                              <SelectItem value="قضية">قضية</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>تاريخ التقادم <span className="text-red-500">*</span></Label>
                          <HijriDatePicker
                            value={formData.prescriptionDate}
                            onChange={(v) => setFormData({ ...formData, prescriptionDate: v })}
                            data-testid="input-prescription-date"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Checkbox
                            id="grievanceRequired"
                            checked={(formData as any).grievanceRequired || false}
                            onCheckedChange={(checked) => setFormData({ ...formData, grievanceRequired: !!checked } as any)}
                            data-testid="checkbox-grievance-required"
                          />
                          <Label htmlFor="grievanceRequired" className="text-sm cursor-pointer">
                            مطلوب تظلم
                          </Label>
                        </div>
                      </>
                    )}
                  </>
                )}

                {formData.caseClassification === CaseClassification.IN_COURT && (
                  <>
                    <div>
                      <Label>مرحلة البداية</Label>
                      <Select
                        value={formData.startingStage}
                        onValueChange={(value) => setFormData({ ...formData, startingStage: value })}
                      >
                        <SelectTrigger data-testid="select-starting-stage">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="استلام">محكمة</SelectItem>
                          <SelectItem value="مداولة_الصلح">مداولة الصلح</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {formData.caseClassification !== CaseClassification.UNDER_STUDY && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>تاريخ الجلسة القادمة (اختياري)</Label>
                      <HijriDatePicker
                        value={formData.nextHearingDate}
                        onChange={(v) => setFormData({ ...formData, nextHearingDate: v })}
                        data-testid="input-next-hearing-date"
                      />
                    </div>
                    <div>
                      <Label>وقت الجلسة (اختياري)</Label>
                      <Input
                        data-testid="input-next-hearing-time"
                        type="time"
                        value={formData.nextHearingTime}
                        onChange={(e) => setFormData({ ...formData, nextHearingTime: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {formData.caseClassification === CaseClassification.IN_COURT && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="memoRequired"
                    checked={formData.memoRequired}
                    onCheckedChange={(checked) => setFormData({ ...formData, memoRequired: !!checked })}
                    data-testid="checkbox-memo-required"
                  />
                  <Label htmlFor="memoRequired" className="text-sm cursor-pointer">
                    مطلوب مذكرة
                  </Label>
                </div>
                {formData.memoRequired && (
                  <div>
                    <Label>مهلة الرد <span className="text-red-500">*</span></Label>
                    <HijriDatePicker
                      value={formData.responseDeadline}
                      onChange={(v) => setFormData({ ...formData, responseDeadline: v })}
                      data-testid="input-memo-deadline"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button data-testid="button-submit-case" onClick={handleAddCase} disabled={!formData.caseClassification}>
              إضافة القضية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCase?.primaryLawyerId ? "تعديل الإسناد" : "إسناد القضية"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>القسم</Label>
              {isDeptHead ? (
                <Input
                  value={getDepartmentName(user?.departmentId || "")}
                  disabled
                  data-testid="select-assign-department"
                />
              ) : (
                <Select
                  value={assignData.departmentId}
                  onValueChange={(value) => setAssignData({ ...assignData, departmentId: value, lawyerId: "", internalReviewerId: "", litigatorId: "" })}
                >
                  <SelectTrigger data-testid="select-assign-department">
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>المحامي المسؤول</Label>
              <Select
                value={assignData.lawyerId}
                onValueChange={(value) => setAssignData({
                  ...assignData,
                  lawyerId: value,
                  // Drop the reviewer if it now collides with the chosen lawyer.
                  internalReviewerId: assignData.internalReviewerId === value ? "" : assignData.internalReviewerId,
                })}
              >
                <SelectTrigger data-testid="select-assign-lawyer">
                  <SelectValue placeholder="اختر المحامي" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const filtered = lawyers.filter(l =>
                      !assignData.departmentId ||
                      String(l.departmentId) === String(assignData.departmentId)
                    );
                    if (filtered.length === 0) {
                      return (
                        <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                          {assignData.departmentId ? "لا يوجد محامون في هذا القسم" : "اختر القسم أولاً"}
                        </div>
                      );
                    }
                    return filtered.map((lawyer) => (
                      <SelectItem key={lawyer.id} value={lawyer.id}>{lawyer.name}</SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المراجع الداخلي</Label>
              <Select
                value={assignData.internalReviewerId || "__none__"}
                onValueChange={(value) => setAssignData({
                  ...assignData,
                  internalReviewerId: value === "__none__" ? "" : value,
                })}
              >
                <SelectTrigger data-testid="select-assign-internal-reviewer">
                  <SelectValue placeholder="اختر المراجع الداخلي (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    // Same eligibility rules as the memo internal-reviewer
                    // dropdown: same department as the case, exclude management
                    // / support roles, and exclude the assigned lawyer.
                    const filtered = users.filter(u =>
                      u.isActive &&
                      u.role !== "branch_manager" &&
                      u.role !== "admin_support" &&
                      u.role !== "hr" &&
                      u.role !== "technical_support" &&
                      u.id !== assignData.lawyerId &&
                      (!assignData.departmentId || String(u.departmentId) === String(assignData.departmentId))
                    );
                    if (filtered.length === 0) {
                      return (
                        <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                          {assignData.departmentId ? "لا يوجد مراجعون مؤهلون في هذا القسم" : "اختر القسم أولاً"}
                        </div>
                      );
                    }
                    return (
                      <>
                        <SelectItem value="__none__">— بدون —</SelectItem>
                        {filtered.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
            {/* "المترافع" — OPTIONAL court-appearance override, for when the
                responsible lawyer cannot plead (foreign / unlicensed). Same
                shape as المراجع الداخلي above: optional, "— بدون —" default.
                Deliberately NOT filtered to exclude the assigned lawyer — unlike
                the reviewer, naming the responsible lawyer here is meaningless
                but harmless, and the whole point is that this person may be
                someone the reviewer rules would exclude. Department filter kept
                so the picker stays scoped like its siblings. */}
            <div>
              <Label>المترافع</Label>
              <Select
                value={assignData.litigatorId || "__none__"}
                onValueChange={(value) => setAssignData({
                  ...assignData,
                  litigatorId: value === "__none__" ? "" : value,
                })}
              >
                <SelectTrigger data-testid="select-assign-litigator">
                  <SelectValue placeholder="اختر المترافع (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— بدون —</SelectItem>
                  {users
                    .filter((u) =>
                      u.isActive &&
                      u.role !== "branch_manager" &&
                      u.role !== "admin_support" &&
                      u.role !== "hr" &&
                      u.role !== "technical_support" &&
                      (!assignData.departmentId || String(u.departmentId) === String(assignData.departmentId))
                    )
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                اتركه فارغاً ليحضر المحامي المسؤول الجلسات كالمعتاد. عند تحديده، تُسند
                الجلسات <strong>الجديدة</strong> إليه تلقائياً.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>إلغاء</Button>
            <Button 
              data-testid="button-confirm-assign" 
              onClick={handleAssign}
              disabled={!assignData.lawyerId || !assignData.departmentId}
            >
              {selectedCase?.primaryLawyerId ? "حفظ التعديل" : "إسناد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تم إضافة ملاحظات — الأخذ بملاحظات اللجنة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">سيتم إرسال القضية لمرحلة الأخذ بالملاحظات. يمكنك إضافة ملاحظات توضيحية اختيارية.</p>
            <div>
              <Label>ملاحظات اللجنة (اختياري)</Label>
              <Textarea
                data-testid="input-reject-notes"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="ملاحظات اللجنة للمحامي المسؤول..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>إلغاء</Button>
            <Button 
              data-testid="button-confirm-reject" 
              onClick={handleReject}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              إرسال للأخذ بالملاحظات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Case details — the dialog body now lives in the SHARED <CaseDetailsDialog>
          (moved verbatim). This page keeps the open/close state and every sibling
          action dialog; the component only TRIGGERS them through the callbacks
          below, so the cases page behaves exactly as it did inline. */}
      <CaseDetailsDialog
        caseItem={selectedCase}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        onHearingPrompt={setHearingPrompt}
        // Set only by an ?action= deep-link that targets a row in the الإجراءات
        // tab; cleared as soon as the dialog closes so a manual re-open goes
        // back to المعلومات.
        initialTab={detailsInitialTab}
        onClosed={() => { setSelectedCaseId(null); setDetailsInitialTab(null); }}
        actions={selectedCase ? {
          // Each can* is this page's OWN permission helper, unchanged and still
          // defined here — no permission logic moved out with the dialog.
          canEdit: canEditCaseRecord(selectedCase),
          onEdit: () => openEditDialog(selectedCase),
          canAssign: canAssign(selectedCase),
          onAssign: () => openAssignDialog(selectedCase),
          canReview: canReview(selectedCase),
          onReview: () => openReviewDialog(selectedCase),
          onReject: () => openRejectDialog(selectedCase),
          onApprove: () => handleApprove(selectedCase),
          canClose: canClose(selectedCase),
          canEarlyClose: canEarlyCloseCase(selectedCase),
          onEarlyClose: () => { setEarlyCloseCase(selectedCase); setShowEarlyCloseDialog(true); },
          canCloseNoResponse: canCloseCaseForNoResponse(selectedCase),
          onCloseNoResponse: () => { setCloseNoResponseCase(selectedCase); setCloseNoResponseNotes(""); },
          canReopen: canReopenCase(selectedCase),
          onReopen: () => { setReopenCase(selectedCase); setShowReopenDialog(true); },
          // Same gate as the صك action — both live only at محكوم_حكم_ابتدائي and
          // answer to the same role set, so one helper covers both.
          // Gated on the same role rule the server enforces AND on the indicator
          // actually being on — the endpoint 400s if no hearing carries the flag.
          // 🔴 GATE REALIGNED to canActOnHearing (owner decision 2026-08-04),
          // mirroring the server. It was canActOnCaseWorkflow — the
          // canActOnMohrSettlement mirror — which meant SETTING this flag and
          // CLEARING it answered to different role sets, so a user could set a flag
          // they could not clear. Both ends are now the hearing-level gate, checked
          // against the FLAGGED hearings with `.some` exactly as the server does
          // (the clear is blanket, so authority over one carrying hearing is
          // enough).
          canRecordOpponentResponse:
            getHearingsByCase(selectedCase.id)
              .some(h => h.opponentResponseRequired && isHearingActor(user, h, selectedCase)),
          onOpponentResponseReceived: () => {
            setOpponentResponseCase(selectedCase);
          },
          // صك SEAL — mirrors the server's gate on POST /appeal-outcome, which
          // 400s all three outcomes while the deed is missing. Hidden rather than
          // shown-and-rejected: visibility == authorization. The "تسجيل استلام
          // الصك" action right below deliberately stays visible — it is where the
          // user goes to satisfy this, and hiding it would leave a dead end.
          canRecordAppealOutcome:
            canRecordJudgmentDeed(selectedCase) && caseHasDeedAttachment(selectedCase),
          onWeAppealed: () => { setAppealOutcomeKind("we_appealed"); setAppealOutcomeCase(selectedCase); },
          onOpponentAppealed: () => { setAppealOutcomeKind("opponent_appealed"); setAppealOutcomeCase(selectedCase); },
          onNoAppeal: () => { setAppealOutcomeKind("no_appeal"); setAppealOutcomeCase(selectedCase); },
          // Late صك filing on a case already past محكوم_حكم_ابتدائي. Opens the SAME
          // dialog in FILE-ONLY mode (deedFileOnly) rather than a second dialog:
          // one attachment control, one endpoint, one set of permissions. The role
          // half is canAttachDeed — the clerical gate that includes admin_support,
          // since receiving and filing the court's paperwork is exactly their job.
          canAttachDeedLate:
            isPostJudgmentCaseMissingDeed(selectedCase) && canAttachDeed(selectedCase),
          onAttachDeedLate: () => {
            setDeedFileOnly(true);
            setDeedCase(selectedCase);
            setShowDeedDialog(true);
          },
          canRecordJudgmentDeed: canRecordJudgmentDeed(selectedCase),
          onRecordJudgmentDeed: () => {
            setDeedFileOnly(false);
            setDeedCase(selectedCase);
            // Prefill with whatever the case already carries so a correction
            // opens on the current values rather than blank.
            setDeedDate(selectedCase.judgmentDeedReceivedDate || "");
            setDeedWindowDays(String(selectedCase.objectionWindowDays ?? 30));
            setShowDeedDialog(true);
          },
          // Transfer gate, verbatim: assigned lawyer + admin_support +
          // department_head (own dept) + branch_manager. Stage no longer matters —
          // the server lifted that restriction.
          canTransfer: !!user && (
            user.role === "branch_manager" || user.role === "admin_support"
            || (user.role === "department_head" && selectedCase.departmentId === user.departmentId)
            || selectedCase.primaryLawyerId === user.id
            || selectedCase.responsibleLawyerId === user.id
            || (Array.isArray(selectedCase.assignedLawyers) && selectedCase.assignedLawyers.includes(user.id))
          ),
          onTransfer: () => openTransferDialog(selectedCase),
          canRemind: !!permissions.canSendReminders
            && !!caseNotificationRecipientId(selectedCase),
          onReminder: () => openReminderDialog(selectedCase),
        } : undefined}
      />

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              مراجعة القضية: <LtrInline>{selectedCase?.caseNumber}</LtrInline>
            </DialogTitle>
          </DialogHeader>
          {selectedCase && contractReviewStandards.length > 0 && (
            <ReviewChecklist
              standardId={contractReviewStandards[0].id}
              targetId={selectedCase.id}
              targetType="case"
              onSave={() => {
                setShowReviewDialog(false);
                toast({ title: "تم حفظ نتيجة المراجعة" });
              }}
              onClose={() => setShowReviewDialog(false)}
            />
          )}
          {contractReviewStandards.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد معايير مراجعة متاحة. يرجى إضافة معايير من صفحة معايير المراجعة.
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-accent" />
              إرسال تذكير
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {reminderHasDefaultRecipient ? (
              <div>
                <Label>المستلم</Label>
                <Input
                  disabled
                  value={users.find(u => u.id === reminderData.recipientId)?.name || "المحامي المسؤول"}
                  data-testid="input-reminder-recipient-display"
                />
              </div>
            ) : (
              <div>
                <Label>اختر المحامي المستلم</Label>
                <p className="text-sm text-muted-foreground mb-2">لا يوجد محامي مسؤول معيّن لهذه القضية</p>
                <Select
                  value={reminderData.recipientId}
                  onValueChange={(value) => setReminderData({ ...reminderData, recipientId: value })}
                >
                  <SelectTrigger data-testid="select-reminder-recipient">
                    <SelectValue placeholder="اختر محامي من القسم..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reminderDeptLawyers.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>نوع التذكير</Label>
              <Select
                value={reminderData.reminderType}
                onValueChange={(value) => setReminderData({ ...reminderData, reminderType: value })}
              >
                <SelectTrigger data-testid="select-reminder-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="تذكير بتحديث الحالة">تذكير بتحديث الحالة</SelectItem>
                  <SelectItem value="تذكير بالمتابعة">تذكير بالمتابعة</SelectItem>
                  <SelectItem value="إطلاع مدة">إطلاع مدة (Deadline)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>رسالة نصية</Label>
              <Textarea
                data-testid="input-reminder-message"
                placeholder="اكتب رسالة التذكير هنا..."
                value={reminderData.message}
                onChange={(e) => setReminderData({ ...reminderData, message: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReminderDialog(false)} data-testid="button-cancel-reminder">
              إلغاء
            </Button>
            <Button onClick={handleSendReminder} disabled={!reminderData.recipientId} data-testid="button-send-reminder">
              <Bell className="w-4 h-4 ml-2" />
              إرسال التذكير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" />
              طلب تحويل القضية لقسم آخر
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم إرسال طلب التحويل إلى مدير الفرع ورئيس لجنة المراجعة للموافقة عليه.
          </p>
          <div className="space-y-4">
            <div>
              <Label>القسم المراد التحويل إليه</Label>
              <Select
                value={transferData.toDepartmentId}
                onValueChange={(value) => setTransferData({ ...transferData, toDepartmentId: value })}
              >
                <SelectTrigger data-testid="select-transfer-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments
                    .filter(d => d.id !== user?.departmentId)
                    .map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>سبب التحويل</Label>
              <Textarea
                data-testid="input-transfer-reason"
                placeholder="اكتب سبب طلب التحويل..."
                value={transferData.reason}
                onChange={(e) => setTransferData({ ...transferData, reason: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)} data-testid="button-cancel-transfer">
              إلغاء
            </Button>
            <Button
              onClick={handleTransferRequest}
              disabled={!transferData.toDepartmentId || !transferData.reason.trim()}
              data-testid="button-submit-transfer"
            >
              <ArrowLeftRight className="w-4 h-4 ml-2" />
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذه القضية؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف القضية "{caseToDelete?.caseNumber}" بشكل نهائي. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-case"
              onClick={handleDeleteCase}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showEarlyCloseDialog} onOpenChange={(open) => { setShowEarlyCloseDialog(open); if (!open) { setEarlyCloseCase(null); setEarlyCloseReason(""); setEarlyCloseReasonOther(""); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إغلاق القضية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>سبب الإغلاق <span className="text-red-500">*</span></Label>
              <Select value={earlyCloseReason} onValueChange={setEarlyCloseReason}>
                <SelectTrigger data-testid="select-closure-reason">
                  <SelectValue placeholder="اختر سبب الإغلاق" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="عدم_تجديد_العقد">عدم تجديد العقد</SelectItem>
                  <SelectItem value="سداد_الخصم">سداد الخصم</SelectItem>
                  <SelectItem value="تنازل_العميل">تنازل العميل</SelectItem>
                  <SelectItem value="أخرى">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {earlyCloseReason === "أخرى" && (
              <div>
                <Label>توضيح السبب <span className="text-red-500">*</span></Label>
                <Textarea
                  value={earlyCloseReasonOther}
                  onChange={(e) => setEarlyCloseReasonOther(e.target.value)}
                  placeholder="اكتب سبب الإغلاق..."
                  data-testid="input-closure-reason-other"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEarlyCloseDialog(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-early-close"
              disabled={!earlyCloseReason || (earlyCloseReason === "أخرى" && !earlyCloseReasonOther.trim())}
              onClick={async () => {
                if (!earlyCloseCase) return;
                try {
                  await updateCase(earlyCloseCase.id, {
                    currentStage: "مقفلة",
                    closureReason: earlyCloseReason,
                    closureReasonOther: earlyCloseReason === "أخرى" ? earlyCloseReasonOther.trim() : "",
                  });
                  toast({ title: "تم إغلاق القضية بنجاح" });
                  setShowEarlyCloseDialog(false);
                  setEarlyCloseCase(null);
                  setEarlyCloseReason("");
                  setEarlyCloseReasonOther("");
                } catch (err) {
                  toast({ title: "فشل إغلاق القضية", description: extractApiError(err), variant: "destructive" });
                }
              }}
            >
              تأكيد الإغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "مرحلة البداية" correction — confirm + optional note. Applied by its own
          endpoint the moment it is confirmed, independently of the edit form's
          Save, because it is a state MOVE (flag + stage + history + audit row in
          one transaction), not a field edit. */}
      <AlertDialog
        open={!!startingStageTarget}
        onOpenChange={(open) => { if (!open) { setStartingStageTarget(null); setStartingStageNotes(""); } }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              تصحيح مرحلة البداية
            </AlertDialogTitle>
            <AlertDialogDescription>
              {startingStageTarget?.toSettlement
                ? <>ستُسجَّل القضية كقضية <strong>صلح</strong>، وتنتقل إلى مرحلة <strong>مداولة الصلح</strong>، ويصبح مسارها: استلام ← مداولة الصلح ← تحصيل.</>
                : <>ستُسجَّل القضية كقضية <strong>محكمة</strong>، وتعود إلى مرحلة <strong>استلام</strong> على مسار المحكمة المعتاد.</>}
              <br />
              يُسجَّل التصحيح في سجل القضية مع الحالة قبله وبعده.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* SOFT consequences — surfaced, not blocking. Both are fixable by
              hand; the hard blockers (a recorded result, a judgment, closure)
              already prevented this dialog from opening at all. */}
          {!!startingStageTarget && (startingStageTarget.liveMemoCount > 0 || startingStageTarget.hasSettlementNumber) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-amber-800 dark:text-amber-300" data-testid="warning-starting-stage-side-effects">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                {startingStageTarget.liveMemoCount > 0 && (
                  <p>على القضية {startingStageTarget.liveMemoCount} مذكرة غير مكتملة — راجعها بعد التصحيح، فقد لا تعود مناسبة للمسار الجديد.</p>
                )}
                {startingStageTarget.hasSettlementNumber && (
                  <p>القضية تحمل رقم صلح مسجَّلاً — يبقى محفوظاً ولا يُحذف.</p>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2 text-right">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              data-testid="input-starting-stage-notes"
              value={startingStageNotes}
              onChange={(e) => setStartingStageNotes(e.target.value)}
              placeholder="سبب التصحيح..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-starting-stage"
              disabled={startingStageSaving}
              className="bg-amber-600 hover:bg-amber-700"
              onClick={async (e) => {
                e.preventDefault();
                if (!startingStageTarget) return;
                setStartingStageSaving(true);
                try {
                  const notes = startingStageNotes.trim();
                  await apiRequest(
                    "POST",
                    `/api/cases/${startingStageTarget.caseItem.id}/correct-starting-stage`,
                    { toSettlement: startingStageTarget.toSettlement, ...(notes ? { notes } : {}) },
                  );
                  await refreshCases();
                  toast({ title: "تم تصحيح مرحلة البداية" });
                  setStartingStageTarget(null);
                  setStartingStageNotes("");
                } catch (err) {
                  toast({ title: "فشل التصحيح", description: extractApiError(err), variant: "destructive" });
                } finally {
                  setStartingStageSaving(false);
                }
              }}
            >
              تأكيد التصحيح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* "إغلاق لعدم استكمال البيانات". NO reason picker and NO required text:
          the closure reason is fixed (ClosureReason.DATA_NOT_COMPLETED) and the
          "what was missing" text is resolved SERVER-side from the activity log /
          stageHistory — the client must not re-type data the server already
          holds, and must not be able to contradict it. Optional notes only.

          The case is CLOSED, not archived (owner decision): it stays in the list
          as an ordinary closed case and the scheduler archives it after 6 months
          like every other closure. The dialog says so, because the Arabic label
          the owner uses ("أرشفة لعدم التجاوب") would otherwise imply it vanishes. */}
      <AlertDialog
        open={!!closeNoResponseCase}
        onOpenChange={(open) => { if (!open) { setCloseNoResponseCase(null); setCloseNoResponseNotes(""); } }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-destructive" />
              إغلاق لعدم استكمال البيانات
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إغلاق القضية بسبب <strong>عدم استكمال البيانات</strong>، مع تسجيل
              البيانات والمرفقات الناقصة ضمن سبب الإغلاق. سيتم أيضاً إلغاء الجلسات
              القادمة والمذكرات والمهام المفتوحة على القضية.
              <br />
              تبقى القضية ظاهرة في القائمة كقضية مقفلة، وتُؤرشف تلقائياً بعد 6 أشهر
              كبقية القضايا المقفلة. ويمكن إعادة فتحها لاحقاً إذا تجاوب العميل.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              data-testid="input-close-no-response-notes"
              value={closeNoResponseNotes}
              onChange={(e) => setCloseNoResponseNotes(e.target.value)}
              placeholder="اكتب ملاحظات حول الإغلاق..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-close-no-response"
              disabled={closeNoResponseSaving}
              className="bg-destructive hover:bg-destructive/90"
              onClick={async (e) => {
                // The action button closes the dialog by default; prevent that
                // so the dialog stays up until the request settles (same shape
                // as the other async AlertDialog actions on this page).
                e.preventDefault();
                if (!closeNoResponseCase) return;
                setCloseNoResponseSaving(true);
                try {
                  const notes = closeNoResponseNotes.trim();
                  await apiRequest(
                    "POST",
                    `/api/cases/${closeNoResponseCase.id}/close-no-response`,
                    notes ? { notes } : {},
                  );
                  await refreshCases();
                  toast({ title: "تم إغلاق القضية لعدم استكمال البيانات" });
                  setCloseNoResponseCase(null);
                  setCloseNoResponseNotes("");
                } catch (err) {
                  toast({ title: "فشل إغلاق القضية", description: extractApiError(err), variant: "destructive" });
                } finally {
                  setCloseNoResponseSaving(false);
                }
              }}
            >
              <Archive className="w-4 h-4 ml-2" />
              تأكيد الإغلاق
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* "تم استلام رد الخصم" — clears the مطلوب رد من الخصم indicator (which the
          audit found could never clear) and asks whether we must reply. نعم
          creates the SAME auto مذكرة جوابية the موعد_جديد "مطلوب مذكرة" flow
          creates, server-side, via one shared implementation. Required tri-state,
          same discipline as the objectionability question.
          The body now lives in OpponentResponseDialog, shared with the
          hearing-level "مطلوب رد من الخصم" toggle so both ways of turning the
          indicator off ask the same question and produce the same outcome. */}
      <OpponentResponseDialog
        caseId={opponentResponseCase?.id ?? null}
        onOpenChange={(open) => { if (!open) setOpponentResponseCase(null); }}
      />

      {/* Appeal outcome — the two manual routes out of محكوم_حكم_ابتدائي.
          "لم يستأنف" warns (never blocks) when the objection window computed from
          the صك receipt hasn't lapsed yet: only the lawyer knows whether the
          opponent actually filed, so the confirmation is theirs to give. */}
      <AlertDialog open={!!appealOutcomeCase} onOpenChange={(open) => !open && setAppealOutcomeCase(null)}>
        <AlertDialogContent dir="rtl">
          {appealOutcomeCase && (() => {
            const isWeAppeal = appealOutcomeKind === "we_appealed";
            const isOpponentAppeal = appealOutcomeKind === "opponent_appealed";
            // Any appeal record (ours or theirs) moves the case to
            // منظورة_استئناف; only no_appeal ends it at محكوم_حكم_نهائي, and only
            // that branch shows the open-window warning below.
            const isAppealRecord = isWeAppeal || isOpponentAppeal;
            // WARN (never block) when recording OUR appeal with no لائحة اعتراضية
            // on the case. The memo is the artifact an appeal normally produces —
            // and filing it promotes the case by itself — so its absence usually
            // means either the memo hasn't been marked مرفوعة yet or this is a
            // data-entry slip. It is NOT an error: an appeal filed outside the
            // system is legitimate, which is exactly what this button is for.
            const hasObjectionMemo = memos.some(
              (m) => m.caseId === appealOutcomeCase.id
                && m.memoType === MemoType.OBJECTION
                && m.status !== "ملغاة",
            );
            // Same shared helpers the row and the server use, so the wording
            // ("لم نستأنف" vs "لم يستأنف الخصم") matches the button that opened it.
            const weAppeal = weAreTheAppellant(
              judgmentDirectionOf(findPrimaryJudgmentHearing(getHearingsByCase(appealOutcomeCase.id))),
            );
            // Derived from the same inputs the server used: receipt + window.
            const receipt = appealOutcomeCase.judgmentDeedReceivedDate || "";
            const windowDays = appealOutcomeCase.objectionWindowDays ?? 30;
            let deadlineStr = "";
            let deadlinePassed = true;
            if (receipt) {
              const d = new Date(receipt);
              if (!isNaN(d.getTime())) {
                d.setDate(d.getDate() + windowDays);
                deadlineStr = d.toISOString().split("T")[0];
                deadlinePassed = d.getTime() <= Date.now();
              }
            }
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {isWeAppeal
                      ? "تأكيد: تم الاستئناف"
                      : isOpponentAppeal
                      ? "تأكيد: الخصم استأنف"
                      : weAppeal
                      ? "تأكيد: لم نستأنف — الحكم نهائي"
                      : "تأكيد: لم يستأنف الخصم — الحكم نهائي"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {isAppealRecord
                      ? "ستنتقل القضية إلى مرحلة منظورة استئناف، ويُسجَّل الحكم النهائي لاحقاً من نتيجة الجلسة."
                      : "ستنتقل القضية إلى مرحلة محكوم حكم نهائي. تُستكمل بعدها إجراءات ما بعد الحكم (التحصيل/التنفيذ) إن وُجدت."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {isWeAppeal && !hasObjectionMemo && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-amber-800 dark:text-amber-300" data-testid="warning-no-objection-memo">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="text-xs">
                      لا توجد لائحة اعتراضية مسجّلة على هذه القضية. إن كان الاستئناف قد رُفع
                      عبر النظام فستنتقل القضية تلقائياً عند تعليم اللائحة كـ"مرفوعة"، ولا حاجة
                      لهذا الإجراء. استخدمه إذا رُفع الاستئناف خارج النظام.
                    </p>
                  </div>
                )}
                {!isAppealRecord && !deadlinePassed && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-amber-800 dark:text-amber-300" data-testid="warning-appeal-window-open">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="text-xs">
                      {deadlineStr
                        ? <>مهلة الاعتراض لم تنتهِ بعد (تنتهي في <LtrInline>{deadlineStr}</LtrInline>). {weAppeal ? "تأكد من قرار عدم الاستئناف قبل التأكيد." : "تأكد من عدم تقديم الخصم لاعتراض قبل التأكيد."}</>
                        : <>لم يُسجَّل تاريخ استلام الصك، فلا يمكن التحقق من انتهاء مهلة الاعتراض. تأكد قبل التأكيد.</>}
                    </p>
                  </div>
                )}
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={appealSubmitting}
                    data-testid="button-confirm-appeal-outcome"
                    className={isOpponentAppeal ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}
                    onClick={async () => {
                      setAppealSubmitting(true);
                      try {
                        await apiRequest("POST", `/api/cases/${appealOutcomeCase.id}/appeal-outcome`, {
                          outcome: appealOutcomeKind,
                        });
                        await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
                        await refreshCases();
                        toast({ title: isWeAppeal
                          ? "تم تسجيل الاستئناف — القضية منظورة استئناف"
                          : isOpponentAppeal
                          ? "تم تسجيل استئناف الخصم"
                          : "تم تسجيل أن الحكم أصبح نهائياً" });
                        setAppealOutcomeCase(null);
                      } catch (err) {
                        toast({ title: "تعذّر تسجيل النتيجة", description: extractApiError(err), variant: "destructive" });
                      } finally {
                        setAppealSubmitting(false);
                      }
                    }}
                  >
                    تأكيد
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* "تسجيل استلام الصك" — judgment-lifecycle step 2. Capturing the receipt
          date starts the objection clock: the server computes
          deadline = receiptDate + (window ?? 30) and creates/re-dates the
          لائحة اعتراضية when the judgment was objectionable. Saving also clears
          the derived "بانتظار استلام الصك" badge, with no clearing code. */}
      <Dialog
        open={showDeedDialog}
        onOpenChange={(open) => {
          setShowDeedDialog(open);
          if (!open) { setDeedCase(null); setDeedDate(""); setDeedWindowDays("30"); setDeedFileOnly(false); }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{deedFileOnly ? "إرفاق صك الحكم" : "تسجيل استلام الصك"}</DialogTitle>
          </DialogHeader>
          {deedCase && (
            <>
              <div className="space-y-4">
                {deedFileOnly && (
                  <p className="text-xs text-muted-foreground">
                    صدر حكم في هذه القضية ولم تُرفق نسخة الصك. أرفق الصك لإتاحة إغلاق القضية.
                  </p>
                )}
                {!deedFileOnly && (
                <div>
                  <Label>تاريخ استلام الصك <span className="text-red-500">*</span></Label>
                  <HijriDatePicker
                    value={deedDate}
                    onChange={(v) => setDeedDate(v)}
                    data-testid="input-deed-received-date"
                  />
                </div>
                )}
                {!deedFileOnly && (
                <div>
                  <Label>مهلة الاعتراض (بالأيام) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={deedWindowDays}
                    onChange={(e) => setDeedWindowDays(e.target.value)}
                    data-testid="input-objection-window-days"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    الافتراضي 30 يوماً. للقضاء المستعجل استخدم 10 أيام.
                  </p>
                </div>
                )}
                {/* The صك FILE. Independent of the date above: it uploads
                    immediately to its own endpoint rather than riding along
                    with this dialog's save, so a lawyer can file the PDF
                    without re-entering the date and vice-versa. The date is
                    what starts the objection clock; this is the document
                    itself. Nothing here gates saving the dialog — the deed is
                    not mandatory in this batch. */}
                <SingleAttachmentControl
                  endpoint={`/api/cases/${deedCase.id}/deed-attachment`}
                  label="ملف صك الحكم"
                  emptyHint="لم يُرفق الصك بعد — يمكن رفعه الآن أو لاحقاً"
                  canEdit={canAttachDeed(deedCase)}
                  // Same defect the minutes control had: the upload is a raw
                  // fetch that touches no cache, so the derived
                  // hasDeedAttachment on the cases list stayed false and the
                  // "بانتظار إرفاق الصك" badge stayed lit after attaching. The
                  // file uploads independently of this dialog's حفظ, so it needs
                  // its OWN refresh — the save button's refresh below can't
                  // cover it (the user may attach and never press حفظ).
                  // The two-step is the page's idiom: invalidateQueries for any
                  // react-query reader of /api/cases, refreshCases for
                  // cases-context's own useState list, which is what the badge
                  // actually renders from.
                  onChanged={async () => {
                    await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
                    await refreshCases();
                  }}
                />
                {!deedFileOnly && deedDate && Number(deedWindowDays) > 0 && (
                  <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 p-3 text-blue-800 dark:text-blue-300">
                    <p className="text-xs">
                      مهلة الاعتراض تنتهي في:{" "}
                      {/* HIJRI-first, Gregorian secondary — the app-wide date
                          convention, via the SHARED <DualDateDisplay/> (which
                          wraps formatDualDate). It previously printed a bare
                          `toISOString().split("T")[0]`, i.e. Gregorian only, and
                          was the one date on this screen not following the
                          convention. No new conversion written. */}
                      {(() => {
                        const d = new Date(deedDate);
                        if (isNaN(d.getTime())) return <strong>-</strong>;
                        d.setDate(d.getDate() + Number(deedWindowDays));
                        return <DualDateDisplay date={d} className="align-middle" />;
                      })()}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeedDialog(false)}>
                  {/* FILE-ONLY mode uploads immediately through the control above,
                      so there is nothing left to save and the حفظ button below is
                      not rendered — this becomes a plain dismiss. */}
                  {deedFileOnly ? "إغلاق" : "إلغاء"}
                </Button>
                {!deedFileOnly && (
                <Button
                  data-testid="button-confirm-deed"
                  disabled={
                    !deedDate
                    || !Number.isInteger(Number(deedWindowDays))
                    || Number(deedWindowDays) < 1
                    || Number(deedWindowDays) > 365
                    || deedSubmitting
                  }
                  onClick={async () => {
                    setDeedSubmitting(true);
                    try {
                      await apiRequest("POST", `/api/cases/${deedCase.id}/judgment-deed`, {
                        judgmentDeedReceivedDate: deedDate,
                        objectionWindowDays: Number(deedWindowDays),
                      });
                      await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
                      await refreshCases();
                      toast({ title: "تم تسجيل استلام الصك" });
                      setShowDeedDialog(false);
                      setDeedCase(null);
                      setDeedDate("");
                      setDeedWindowDays("30");
                    } catch (err) {
                      toast({ title: "تعذّر تسجيل استلام الصك", description: extractApiError(err), variant: "destructive" });
                    } finally {
                      setDeedSubmitting(false);
                    }
                  }}
                >
                  حفظ
                </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reopen a CLOSED case at a chosen stage. The stage list and the
          conditional number prompt come from the SAME shared helpers the server
          validates with (getReopenTargetStages / stageNumberRequirement), so the
          dialog can never offer a stage the endpoint rejects or omit a number it
          demands. */}
      <Dialog
        open={showReopenDialog}
        onOpenChange={(open) => {
          setShowReopenDialog(open);
          if (!open) { setReopenCase(null); setReopenTargetStage(""); setReopenNumber(""); setReopenNotes(""); }
        }}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة فتح القضية</DialogTitle>
          </DialogHeader>
          {reopenCase && (() => {
            const reopenDeptName = getDepartmentName(reopenCase.departmentId || "");
            const reopenStages = getReopenTargetStages(
              (reopenCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue,
              reopenDeptName,
              reopenCase.clientRole || undefined,
              !!reopenCase.memoRequired,
              !!reopenCase.isSettlementCase,
            );
            const requirement = reopenTargetStage
              ? stageNumberRequirement(reopenTargetStage as CaseStageValue, reopenDeptName)
              : null;
            // Prompt only when the stage requires a number AND the row doesn't
            // already carry it — mirrors the server's supplied-or-stored check.
            const storedNumber = requirement
              ? String((reopenCase as unknown as Record<string, unknown>)[requirement.field] ?? "").trim()
              : "";
            const needsNumber = !!requirement && !storedNumber;
            // Closures the product treats as genuinely final. Allowed (owner
            // decision) but confirmed with an explicit warning.
            const isTerminalClosure =
              reopenCase.closureReason === "حكم_نهائي_ضدنا" ||
              reopenCase.closureReason === "شطب_بدون_إعادة_قيد";
            return (
              <>
                <div className="space-y-4">
                  <div>
                    <Label>المرحلة التي ستُفتح عندها القضية <span className="text-red-500">*</span></Label>
                    <Select
                      value={reopenTargetStage}
                      onValueChange={(v) => { setReopenTargetStage(v); setReopenNumber(""); }}
                    >
                      <SelectTrigger data-testid="select-reopen-stage">
                        <SelectValue placeholder="اختر المرحلة" />
                      </SelectTrigger>
                      <SelectContent>
                        {reopenStages.map((s) => (
                          <SelectItem key={s} value={s}>{getStageLabel(s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {needsNumber && requirement && (
                    <div>
                      <Label>{requirement.label} <span className="text-red-500">*</span></Label>
                      <Input
                        value={reopenNumber}
                        onChange={(e) => setReopenNumber(e.target.value)}
                        placeholder={requirement.placeholder}
                        data-testid="input-reopen-number"
                      />
                    </div>
                  )}
                  <div>
                    <Label>ملاحظات (اختياري)</Label>
                    <Textarea
                      value={reopenNotes}
                      onChange={(e) => setReopenNotes(e.target.value)}
                      placeholder="سبب إعادة الفتح..."
                      data-testid="input-reopen-notes"
                    />
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="text-xs">
                      سيتم إعادة فتح القضية. الجلسات والمذكرات التي أُلغيت عند الإغلاق لن تُستعاد تلقائياً.
                    </p>
                  </div>
                  {isTerminalClosure && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-red-700 dark:text-red-400" data-testid="warning-reopen-terminal-closure">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="text-xs">
                        أُغلقت هذه القضية لسبب نهائي ({reopenCase.closureReason?.replace(/_/g, " ")}). تأكد من صحة إعادة الفتح.
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowReopenDialog(false)}>إلغاء</Button>
                  <Button
                    data-testid="button-confirm-reopen"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={!reopenTargetStage || (needsNumber && !reopenNumber.trim()) || reopenSubmitting}
                    onClick={async () => {
                      setReopenSubmitting(true);
                      try {
                        await apiRequest("POST", `/api/cases/${reopenCase.id}/reopen`, {
                          targetStage: reopenTargetStage,
                          notes: reopenNotes.trim(),
                          ...(needsNumber && requirement ? { [requirement.field]: reopenNumber.trim() } : {}),
                        });
                        await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
                        await refreshCases();
                        toast({ title: "تم إعادة فتح القضية" });
                        setShowReopenDialog(false);
                        setReopenCase(null);
                        setReopenTargetStage("");
                        setReopenNumber("");
                        setReopenNotes("");
                      } catch (err) {
                        toast({ title: "تعذّر إعادة فتح القضية", description: extractApiError(err), variant: "destructive" });
                      } finally {
                        setReopenSubmitting(false);
                      }
                    }}
                  >
                    تأكيد إعادة الفتح
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reassignCaseDialog} onOpenChange={(open) => !open && setReassignCaseDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              إسناد لمحامي
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>المحامي المسؤول عن القضية</Label>
              <Select value={reassignCaseLawyerId} onValueChange={setReassignCaseLawyerId}>
                <SelectTrigger data-testid="select-reassign-case-lawyer">
                  <SelectValue placeholder="اختر المحامي" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.canBeAssignedCases && u.isActive).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              data-testid="button-cancel-reassign-case"
              onClick={() => setReassignCaseDialog(null)}
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-save-reassign-case"
              onClick={handleReassignCase}
              disabled={!reassignCaseLawyerId}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditCaseId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل بيانات القضية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* === Classification === */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>تصنيف القضية</Label>
                <Select
                  value={editFormData.caseClassification || ""}
                  onValueChange={(value) =>
                    setEditFormData({ ...editFormData, caseClassification: value as CaseClassificationValue })
                  }
                >
                  <SelectTrigger data-testid="edit-case-classification">
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CaseClassification).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CaseClassificationLabels[c as CaseClassificationValue] || c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editFormData.caseClassification === CaseClassification.IN_COURT && (
                <div>
                  <Label>صفة العميل</Label>
                  <Select
                    value={editFormData.clientRole || ""}
                    onValueChange={(value) => setEditFormData({ ...editFormData, clientRole: value })}
                  >
                    <SelectTrigger data-testid="edit-client-role">
                      <SelectValue placeholder="اختر صفة العميل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="مدعي">مدعي</SelectItem>
                      <SelectItem value="مدعى_عليه">مدعى عليه</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* === Client + Plaintiff === */}
            <div>
              <Label>العميل</Label>
              <ClientAutocomplete
                value={editFormData.clientId}
                onChange={(clientId) => setEditFormData({ ...editFormData, clientId })}
              />
            </div>
            <div>
              <Label>اسم المدعي <span className="text-xs text-muted-foreground">يُسجل اسم المدعي الحقيقي في الدعوى (منشأة تابعة للعميل)</span></Label>
              <SmartInput
                inputType="text"
                data-testid="edit-plaintiff-name"
                value={editFormData.plaintiffName}
                onChange={(e) => setEditFormData({ ...editFormData, plaintiffName: e.target.value })}
                placeholder=""
              />
            </div>

            {/* === Case type / priority === */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>نوع القضية</Label>
                <SmartInput
                  inputType="text"
                  data-testid="edit-case-type"
                  value={editFormData.caseType}
                  onChange={(e) => setEditFormData({ ...editFormData, caseType: e.target.value as string })}
                  placeholder="أدخل نوع القضية..."
                />
              </div>
              <div>
                <Label>الأولوية</Label>
                <Select
                  value={editFormData.priority}
                  onValueChange={(value: PriorityType) => setEditFormData({ ...editFormData, priority: value })}
                >
                  <SelectTrigger data-testid="edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(Priority).map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* === Department + departmentOther === */}
            <div>
              <Label>القسم</Label>
              <Select
                value={editFormData.departmentId}
                onValueChange={(value) => setEditFormData({ ...editFormData, departmentId: value, departmentOther: "" })}
              >
                <SelectTrigger data-testid="edit-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                  <SelectItem value="أخرى">أخرى</SelectItem>
                </SelectContent>
              </Select>
              {editFormData.departmentId === "أخرى" && (
                <SmartInput
                  inputType="text"
                  data-testid="edit-department-other"
                  value={editFormData.departmentOther}
                  onChange={(e) => setEditFormData({ ...editFormData, departmentOther: e.target.value })}
                  placeholder="اكتب اسم القسم..."
                  className="mt-2"
                />
              )}
            </div>

            {/* === Court details === */}
            <div>
              <Label>رقم القضية لدى المحكمة</Label>
              <SmartInput
                inputType="code"
                data-testid="edit-court-case-number"
                value={editFormData.courtCaseNumber}
                onChange={(e) => setEditFormData({ ...editFormData, courtCaseNumber: e.target.value })}
                placeholder="أدخل رقم القضية لدى المحكمة"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>المحكمة</Label>
                <SmartInput
                  inputType="text"
                  data-testid="edit-court-name"
                  value={editFormData.courtName}
                  onChange={(e) => setEditFormData({ ...editFormData, courtName: e.target.value })}
                />
              </div>
            </div>

            {/* === Opponent === */}
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">بيانات الخصم</h4>
              <div>
                <Label>اسم الخصم</Label>
                <SmartInput
                  inputType="text"
                  data-testid="edit-opponent-name"
                  value={editFormData.opponentName}
                  onChange={(e) => setEditFormData({ ...editFormData, opponentName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <Label>محامي الخصم</Label>
                  <SmartInput
                    inputType="text"
                    data-testid="edit-opponent-lawyer"
                    value={editFormData.opponentLawyer}
                    onChange={(e) => setEditFormData({ ...editFormData, opponentLawyer: e.target.value })}
                  />
                </div>
                <div>
                  <Label>هاتف الخصم</Label>
                  <SmartInput
                    inputType="code"
                    data-testid="edit-opponent-phone"
                    value={editFormData.opponentPhone}
                    onChange={(e) => setEditFormData({ ...editFormData, opponentPhone: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-3">
                <Label>ملاحظات عن الخصم</Label>
                <Textarea
                  data-testid="edit-opponent-notes"
                  value={editFormData.opponentNotes}
                  onChange={(e) => setEditFormData({ ...editFormData, opponentNotes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            {/* === UNDER_STUDY + إداري specific === */}
            {editFormData.caseClassification === CaseClassification.UNDER_STUDY &&
              getDepartmentName(editFormData.departmentId) === "إداري" && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold">بيانات القضية الإدارية</h4>
                  <div>
                    <Label>نوع القضية الإدارية</Label>
                    <Select
                      value={editFormData.adminCaseSubType}
                      onValueChange={(value) => setEditFormData({ ...editFormData, adminCaseSubType: value })}
                    >
                      <SelectTrigger data-testid="edit-admin-case-subtype">
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="تظلم">تظلم</SelectItem>
                        <SelectItem value="قضية">قضية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>تاريخ التقادم</Label>
                    <HijriDatePicker
                      value={editFormData.prescriptionDate}
                      onChange={(v) => setEditFormData({ ...editFormData, prescriptionDate: v })}
                      data-testid="edit-prescription-date"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="edit-grievanceRequired"
                      checked={editFormData.grievanceRequired}
                      onCheckedChange={(checked) =>
                        setEditFormData({ ...editFormData, grievanceRequired: !!checked })
                      }
                      data-testid="edit-checkbox-grievance-required"
                    />
                    <Label htmlFor="edit-grievanceRequired" className="text-sm cursor-pointer">
                      مطلوب تظلم
                    </Label>
                  </div>
                </div>
              )}

            {/* === IN_COURT specific === */}
            {editFormData.caseClassification === CaseClassification.IN_COURT && (
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold">بيانات الجلسات والمذكرات</h4>
                <div>
                  <Label>عدد الجلسات السابقة</Label>
                  <Input
                    type="number"
                    min={0}
                    data-testid="edit-previous-hearings-count"
                    value={editFormData.previousHearingsCount}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        previousHearingsCount: parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="edit-memoRequired"
                    checked={editFormData.memoRequired}
                    onCheckedChange={(checked) =>
                      setEditFormData({ ...editFormData, memoRequired: !!checked })
                    }
                    data-testid="edit-checkbox-memo-required"
                  />
                  <Label htmlFor="edit-memoRequired" className="text-sm cursor-pointer">
                    مطلوب مذكرة
                  </Label>
                </div>
                {editFormData.memoRequired && (
                  <div>
                    <Label>مهلة الرد</Label>
                    <HijriDatePicker
                      value={editFormData.responseDeadline}
                      onChange={(v) => setEditFormData({ ...editFormData, responseDeadline: v })}
                      data-testid="edit-response-deadline"
                    />
                  </div>
                )}
                {/* 🔴 THE BARE "قضية تسوية فقط" CHECKBOX WAS REMOVED HERE and
                    replaced by the مرحلة البداية control, which now lives in its
                    OWN always-rendered section BELOW this block (see the fix
                    note there). It wrote isSettlementCase through the generic
                    updateCase WITHOUT touching currentStage — and since that
                    flag selects the stage array (InCourtSettlementStages wins
                    before memoRequired/clientRole are consulted), ticking it on
                    a case at دراسة / منظورة / تحرير_صحيفة_الدعوى stranded the
                    stage off its own path and collapsed the progress bar to
                    index 0 (the 3fcd4e3 / c24308e class). */}
              </div>
            )}

            {/* === مرحلة البداية — ALWAYS RENDERED === */}
            {/* 🔴 FIX (a4d417c shipped this INSIDE the IN_COURT block above, so
                it did not render at all on any case that is not
                منظورة_بالمحكمة — not even read-only). The guard's own first
                branch returns "مرحلة البداية تخص القضايا المنظورة بالمحكمة فقط",
                i.e. it is DESIGNED to explain that case — but that branch was
                unreachable, because the wrapper removed the field before the
                guard ever ran. Exactly the "removed entirely instead of the
                read-only fallback" failure.
                It now sits OUTSIDE every classification condition: the guard is
                the single decider, and the field is ALWAYS visible — editable
                inside the correction window, read-only with the reason outside
                it. */}
            {(() => {
              // Shared with the server — the FE can never offer an edit the
              // endpoint would reject, and when it IS blocked the user is shown
              // the endpoint's own sentence rather than a silent disabled control.
              const editCase = editCaseId ? getCaseById(editCaseId) : undefined;
              const caseHearings = editCase ? getHearingsByCase(editCase.id) : [];
              // getCaseById reads the LOADED LIST, which carries every field the
              // guard needs (classification, currentStage, status, isArchived,
              // pausedAt, awaitingCompletion, isSettlementCase, the settlement
              // numbers) — only stageHistory is stripped by the list endpoint,
              // and the guard does not read it. Hearings come from their own
              // context; if they have not landed yet the array is empty, which
              // fails OPEN (no recorded result found) rather than hiding the
              // field — the server re-checks with the real data on submit.
              const blocked = editCase
                ? startingStageCorrectionBlockedReason(editCase, caseHearings.some((h) => !!h.result))
                // No case object → read-only, never a silent disappearance. The
                // second "renders nothing" path in a4d417c was `return null` here.
                : "تعذّر تحميل بيانات القضية";
              const current = editCase ? currentStartingStage(editCase) : StartingStageOption.COURT;
              const currentLabel = current === StartingStageOption.SETTLEMENT ? "مداولة الصلح" : "محكمة";
              // SOFT consequences — warned about, never blocked. Both are
              // recoverable by hand; a judgment is not, which is why that one is
              // in the hard guard instead.
              const liveMemoCount = editCase
                ? memos.filter((m) => m.caseId === editCase.id && m.status !== "ملغاة" && m.status !== "مرفوعة").length
                : 0;
              const hasSettlementNumber = !!(editCase?.mohrNumber || editCase?.taradiNumber);
              return (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold">مرحلة البداية</h4>
                  {blocked ? (
                    <div>
                      <Input value={currentLabel} disabled data-testid="edit-starting-stage-readonly" />
                      <p className="text-xs text-muted-foreground mt-1">{blocked}</p>
                    </div>
                  ) : (
                    <div>
                      <Select
                        value={current}
                        onValueChange={(v) => {
                          if (!editCase || v === current) return;
                          setStartingStageTarget({
                            caseItem: editCase,
                            toSettlement: v === StartingStageOption.SETTLEMENT,
                            liveMemoCount,
                            hasSettlementNumber,
                          });
                        }}
                      >
                        <SelectTrigger data-testid="edit-starting-stage">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={StartingStageOption.COURT}>محكمة</SelectItem>
                          <SelectItem value={StartingStageOption.SETTLEMENT}>مداولة الصلح</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        لتصحيح تسجيل خاطئ. يُطبَّق فوراً وبشكل مستقل عن بقية التعديلات، مع نقل
                        القضية إلى المسار الصحيح.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Next-hearing date/time — present on the ADD dialog but missing
                here. Plain case columns, saved with the rest of the form. */}
            {editFormData.caseClassification !== CaseClassification.UNDER_STUDY && (
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold">الجلسة القادمة</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>تاريخ الجلسة القادمة (اختياري)</Label>
                    <HijriDatePicker
                      value={editFormData.nextHearingDate}
                      onChange={(v) => setEditFormData({ ...editFormData, nextHearingDate: v })}
                      data-testid="edit-next-hearing-date"
                    />
                  </div>
                  <div>
                    <Label>وقت الجلسة القادمة (اختياري)</Label>
                    <Input
                      type="time"
                      data-testid="edit-next-hearing-time"
                      value={editFormData.nextHearingTime}
                      onChange={(e) => setEditFormData({ ...editFormData, nextHearingTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* === Description / current situation === */}
            <div>
              <Label>وصف الوضع الحالي</Label>
              <Textarea
                data-testid="edit-current-situation"
                value={editFormData.currentSituation}
                onChange={(e) => setEditFormData({ ...editFormData, currentSituation: e.target.value })}
                rows={3}
              />
            </div>

            {/* === Lawyer assignment === */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-semibold">الإسناد</h4>
              <div>
                <Label>المحامي المسؤول</Label>
                <Select
                  value={editFormData.primaryLawyerId || "__none__"}
                  onValueChange={(value) =>
                    setEditFormData({
                      ...editFormData,
                      primaryLawyerId: value === "__none__" ? "" : value,
                      // Drop the reviewer if it now collides with the chosen lawyer.
                      internalReviewerId:
                        editFormData.internalReviewerId === value ? "" : editFormData.internalReviewerId,
                    })
                  }
                >
                  <SelectTrigger data-testid="edit-primary-lawyer">
                    <SelectValue placeholder="اختر المحامي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون —</SelectItem>
                    {lawyers
                      .filter((l) =>
                        !editFormData.departmentId ||
                        String(l.departmentId) === String(editFormData.departmentId),
                      )
                      .map((lawyer) => (
                        <SelectItem key={lawyer.id} value={lawyer.id}>{lawyer.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المراجع الداخلي</Label>
                <Select
                  value={editFormData.internalReviewerId || "__none__"}
                  onValueChange={(value) =>
                    setEditFormData({
                      ...editFormData,
                      internalReviewerId: value === "__none__" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger data-testid="edit-internal-reviewer">
                    <SelectValue placeholder="اختر المراجع الداخلي (اختياري)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون —</SelectItem>
                    {users
                      .filter((u) =>
                        u.isActive &&
                        u.role !== "branch_manager" &&
                        u.role !== "admin_support" &&
                        u.role !== "hr" &&
                        u.role !== "technical_support" &&
                        u.id !== editFormData.primaryLawyerId &&
                        (!editFormData.departmentId || String(u.departmentId) === String(editFormData.departmentId)),
                      )
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {/* "المترافع" — the SECOND assignment surface. Same optional
                  override as the الإسناد dialog; both must offer it or the field
                  is uneditable from whichever one the user happens to open. */}
              <div>
                <Label>المترافع</Label>
                <Select
                  value={editFormData.litigatorId || "__none__"}
                  onValueChange={(value) =>
                    setEditFormData({
                      ...editFormData,
                      litigatorId: value === "__none__" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger data-testid="edit-litigator">
                    <SelectValue placeholder="اختر المترافع (اختياري)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون —</SelectItem>
                    {users
                      .filter((u) =>
                        u.isActive &&
                        u.role !== "branch_manager" &&
                        u.role !== "admin_support" &&
                        u.role !== "hr" &&
                        u.role !== "technical_support" &&
                        (!editFormData.departmentId || String(u.departmentId) === String(editFormData.departmentId)),
                      )
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  اتركه فارغاً ليحضر المحامي المسؤول الجلسات كالمعتاد.
                </p>
              </div>
            </div>

            {/* === Communication links === */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-semibold">روابط التواصل</h4>
              <div>
                <Label>رابط مجموعة الواتساب</Label>
                <SmartInput
                  inputType="text"
                  data-testid="edit-whatsapp-group-link"
                  value={editFormData.whatsappGroupLink}
                  onChange={(e) => setEditFormData({ ...editFormData, whatsappGroupLink: e.target.value })}
                  placeholder="https://chat.whatsapp.com/..."
                />
              </div>
              <div>
                <Label>معرّف مجلد جوجل درايف</Label>
                <SmartInput
                  inputType="text"
                  data-testid="edit-google-drive-folder-id"
                  value={editFormData.googleDriveFolderId}
                  onChange={(e) => setEditFormData({ ...editFormData, googleDriveFolderId: e.target.value })}
                  placeholder="معرّف المجلد على درايف"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} data-testid="button-cancel-edit">
              إلغاء
            </Button>
            <Button onClick={handleEditCase} data-testid="button-save-edit" className="bg-accent text-accent-foreground hover:bg-accent/90">
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!hearingPrompt} onOpenChange={(open) => { if (!open) setHearingPrompt(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{hearingPrompt?.title}</AlertDialogTitle>
            <AlertDialogDescription>{hearingPrompt?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              onClick={() => {
                const kind = hearingPrompt?.hearingType === "تراضي" ? "تراضي" : "محكمة";
                toast({
                  title: `يرجى إضافة جلسة ${kind} لاحقاً`,
                  description: "يمكنك إضافة الجلسة من صفحة الجلسات في أي وقت.",
                });
                setHearingPrompt(null);
              }}
              data-testid="button-hearing-prompt-later"
            >
              لاحقاً
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!hearingPrompt) return;
                const params = new URLSearchParams({
                  action: "create",
                  caseId: hearingPrompt.caseId,
                  type: hearingPrompt.hearingType,
                });
                setHearingPrompt(null);
                setLocation(`/hearings?${params.toString()}`);
              }}
              data-testid="button-hearing-prompt-add"
            >
              نعم، إضافة جلسة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — pause / unpause / await-completion / resume-from-completion.
          One dialog renders whichever flow is active; see useCaseLifecycleActions. */}
      <CaseLifecycleDialog {...lifecycle.dialogProps} />
    </div>
  );
}
