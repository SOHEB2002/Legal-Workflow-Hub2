import { useState, useMemo, useEffect } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePageSize } from "@/hooks/use-page-size";
import { getClientRoleLabel } from "@/lib/client-role";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ScrollText,
  Plus,
  Search,
  Eye,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Zap,
  Ban,
  Check,
  ChevronsUpDown,
  UserCog,
  Pause,
  Play,
  MoreVertical,
} from "lucide-react";
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
import { useMemos } from "@/lib/memos-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { PauseUntilField, pauseUntilError } from "@/components/ui/pause-until-field";
import { pauseBadgeTooltip } from "@/lib/case-stage-utils";
import { useCases } from "@/lib/cases-context";
import { useHearings } from "@/lib/hearings-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { useUsers } from "@/lib/users-context";
import { useClients } from "@/lib/clients-context";
import {
  MemoTypeLabels,
  MemoStatus,
  MemoStatusLabels,
  MemoStage,
  MemoStageLabels,
  MemoStagesAll,
  MemoActivityType,
  InternalReviewDecision,
  CommitteeDecision,
  NoteOutcome,
  Priority,
  canChangeMemoStatus,
  canDeleteMemos,
} from "@shared/schema";
import type {
  Memo, MemoTypeValue, MemoStatusValue, MemoStageValue,
  InternalReviewDecisionValue, CommitteeDecisionValue, NoteOutcomeValue,
  LawCase,
} from "@shared/schema";
import { MemoStagesBar } from "@/components/memo-stages-bar";
import { MemoAdvancePanel } from "@/components/memo-advance-panel";
import { ClipboardCheck, FileText } from "lucide-react";
import { differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import {
  MemosAdvancedFilters,
  EMPTY_MEMOS_ADV_FILTERS,
  isMemoNonFinal,
  type AdvancedMemosFilters,
} from "@/components/memos-advanced-filters";

function getStatusBadgeClass(status: MemoStatusValue): string {
  switch (status) {
    case MemoStatus.NOT_STARTED:
      return "bg-muted text-muted-foreground";
    case MemoStatus.DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30 dark:text-blue-400";
    case MemoStatus.IN_REVIEW:
      return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30 dark:text-yellow-400";
    case MemoStatus.REVISION_REQUIRED:
      return "bg-orange-500/20 text-orange-600 border-orange-500/30 dark:text-orange-400";
    case MemoStatus.APPROVED:
      return "bg-green-500/20 text-green-600 border-green-500/30 dark:text-green-400";
    case MemoStatus.SUBMITTED:
      return "bg-emerald-500/20 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
    case MemoStatus.CANCELLED:
      return "bg-destructive/20 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getPriorityBadgeClass(priority: string): string {
  switch (priority) {
    case Priority.URGENT:
      return "bg-destructive text-destructive-foreground";
    case Priority.HIGH:
      return "bg-orange-500 text-white dark:bg-orange-600";
    case Priority.MEDIUM:
      return "bg-yellow-500 text-white dark:bg-yellow-600";
    case Priority.LOW:
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Phase-9 — badge palette for the new MemoStage axis. Mirrors the
// getStatusBadgeClass color choices but mapped per stage:
//   استلام            → muted (neutral / new)
//   تحرير             → blue (active work)
//   مراجعة_داخلية     → amber (under review)
//   لجنة_مراجعة       → orange (committee)
//   الأخذ_بالملاحظات  → red-amber (action needed)
//   جاهزة_للرفع       → green (ready)
//   مرفوعة            → emerald (terminal success)
function getStageBadgeClass(stage: MemoStageValue): string {
  switch (stage) {
    case MemoStage.RECEIVED:
      return "bg-muted text-muted-foreground";
    case MemoStage.DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30 dark:text-blue-400";
    case MemoStage.INTERNAL_REVIEW:
      return "bg-amber-500/20 text-amber-600 border-amber-500/30 dark:text-amber-400";
    case MemoStage.COMMITTEE:
      return "bg-orange-500/20 text-orange-600 border-orange-500/30 dark:text-orange-400";
    case MemoStage.TAKING_NOTES:
      return "bg-red-500/20 text-red-600 border-red-500/30 dark:text-red-400";
    case MemoStage.READY:
      return "bg-green-500/20 text-green-600 border-green-500/30 dark:text-green-400";
    case MemoStage.FILED:
      return "bg-emerald-500/20 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Virtual stage grouping. Lifecycle states (cancelled / paused) remap
// to specific stages so the stage filter axis stays purely stage-based:
//   status='ملغاة' → مرفوعة (terminal — done)
//   pausedAt set   → تحرير (parked drafting; memos have no "awaiting"
//                            stage like consultations/cases do)
//   otherwise      → currentStage (may be null on legacy pre-backfill rows)
// The details-dialog stages bar still uses the literal currentStage.
function getMemoDisplayStage(m: Memo): MemoStageValue | null {
  if (m.status === MemoStatus.CANCELLED) return MemoStage.FILED;
  if (m.pausedAt) return MemoStage.DRAFTING;
  return (m.currentStage as MemoStageValue | null) ?? null;
}

function getDeadlineColor(deadline: string): string {
  const days = differenceInDays(new Date(deadline), new Date());
  if (days < 0) return "text-destructive font-bold";
  if (days < 3) return "text-orange-500 dark:text-orange-400 font-medium";
  return "text-muted-foreground";
}

// Priority-group sort, mirroring the cases page. Rows that need
// attention surface on top, terminal rows sink to the bottom.
//   1 = unassigned (no assigned lawyer)
//   2 = action required from us (drafting / reviewing / awaiting filing)
//   3 = waiting on external (paused or awaiting-completion)
//   4 = terminated (filed or cancelled)
// Within each group rows order by updatedAt DESC.
const ACTION_REQUIRED_MEMO_STAGES = new Set<MemoStageValue>([
  MemoStage.RECEIVED,
  MemoStage.DRAFTING,
  MemoStage.INTERNAL_REVIEW,
  MemoStage.COMMITTEE,
  MemoStage.TAKING_NOTES,
  MemoStage.READY,
]);

function getMemoPriorityGroup(m: Memo): 1 | 2 | 3 | 4 {
  if (m.status === MemoStatus.CANCELLED) return 4;
  if (m.currentStage === MemoStage.FILED) return 4;
  if (!m.assignedTo) return 1;
  if (m.pausedAt || m.awaitingCompletion) return 3;
  if (m.currentStage && ACTION_REQUIRED_MEMO_STAGES.has(m.currentStage as MemoStageValue)) return 2;
  return 3;
}

// Phase-9 — review-workflow role gates. Mirror the consultations-side
// canDoInternalReview / canDoCommitteeDecision / canDoTakeNotesOutcome
// helpers, narrowed for memos: cases_review_head is the committee chair
// (memos belong to cases). Department head is dept-scoped via the
// case's departmentId; we compute that from the current cases list.
function memoIsActionable(memo: Memo): boolean {
  return !memo.awaitingCompletion && !memo.pausedAt;
}

function canDoMemoInternalReview(
  memo: Memo,
  userRole: string,
  userId: string,
): boolean {
  if (!memoIsActionable(memo)) return false;
  if (memo.currentStage !== MemoStage.INTERNAL_REVIEW) return false;
  // Phase-9.1 — actor lock matches the server gate on
  // POST /api/memos/:id/internal-review: only the designated peer
  // reviewer (memo.internalReviewerId) or the branch_manager can
  // record the decision.
  if (userRole === "branch_manager") return true;
  return !!memo.internalReviewerId && memo.internalReviewerId === userId;
}

function canDoMemoCommitteeDecision(
  memo: Memo,
  userRole: string,
  isLaborEntity: boolean,
): boolean {
  if (!memoIsActionable(memo)) return false;
  if (memo.currentStage !== MemoStage.COMMITTEE) return false;
  return userRole === "branch_manager" ||
    userRole === (isLaborEntity ? "labor_review_head" : "cases_review_head");
}

// Reasoned override — "تجاوز لجنة المراجعة". Gate for the button that calls
// POST /api/memos/:id/skip-committee. Mirrors the SERVER's rule EXACTLY so
// visibility === authorization (no button that 403s):
//   stage === لجنة_مراجعة, memo actionable (not paused / awaiting), not ملغاة,
//   AND branch_manager | department_head of the PARENT CASE's dept | the memo
//   assignee | a lawyer on the parent case.
// NOTE this actor set is intentionally WIDER than canDoMemoCommitteeDecision
// (cases_review_head / branch_manager) — a skip is an owner-approved override,
// not a committee ruling. See the endpoint's comment before "harmonising" them.
// No memo-type/classification guard exists (or is needed): memos have ONE stage
// array, so جاهزة_للرفع is unconditionally the post-committee stage.
function canSkipMemoCommittee(
  memo: Memo,
  userRole: string,
  userId: string,
  memoCase: LawCase | null,
  userDeptId: string | null,
): boolean {
  if (!memoIsActionable(memo)) return false;
  if (memo.currentStage !== MemoStage.COMMITTEE) return false;
  if (memo.status === "ملغاة") return false;
  if (userRole === "branch_manager") return true;
  if (userRole === "department_head") {
    return !!memoCase && !!userDeptId && memoCase.departmentId === userDeptId;
  }
  if (!!memo.assignedTo && memo.assignedTo === userId) return true;
  return !!memoCase && (
    memoCase.primaryLawyerId === userId
    || memoCase.responsibleLawyerId === userId
    || (Array.isArray(memoCase.assignedLawyers) && memoCase.assignedLawyers.includes(userId))
  );
}

function canDoMemoTakeNotesOutcome(
  memo: Memo,
  userRole: string,
  userId: string,
  memoCase: { departmentId?: string | null } | null,
  userDeptId: string | null,
): boolean {
  if (!memoIsActionable(memo)) return false;
  if (memo.currentStage !== MemoStage.TAKING_NOTES) return false;
  if (
    userRole === "department_head" &&
    memoCase &&
    memoCase.departmentId !== userDeptId
  ) {
    return false;
  }
  if (userRole === "department_head" || userRole === "branch_manager") return true;
  return !!memo.assignedTo && memo.assignedTo === userId;
}

export default function MemosPage() {
  const {
    memos,
    isLoading,
    addMemo,
    changeStatus,
    updateMemo,
    deleteMemo,
    getActiveMemos,
    getOverdueMemos,
  } = useMemos();
  const { cases, updateCase } = useCases();
  const { getHearingsByCase, getHearingById } = useHearings();
  const { departments, getDepartmentName } = useDepartments();
  const { user } = useAuth();
  const { extendedUsers: users, getUserById } = useUsers();
  const { clients } = useClients();
  const { toast } = useToast();

  // Invalidate memos on page mount to pick up changes from other tabs/users
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [caseComboOpen, setCaseComboOpen] = useState(false);
  const [detailMemoId, setDetailMemoId] = useState<string | null>(null);
  const detailMemo = detailMemoId ? memos.find(m => m.id === detailMemoId) || null : null;

  // Earliest upcoming hearing for the memo's parent case. Mirrors the
  // filter/sort already used when auto-linking a memo to a hearing
  // (handleAddMemo, ~line 412): exclude completed/cancelled, keep
  // hearings from ~now onward, take the earliest.
  const detailMemoNextHearingDate = (() => {
    if (!detailMemo?.caseId) return null;
    const now = Date.now();
    const next = getHearingsByCase(detailMemo.caseId)
      .filter((h) => {
        if (h.status === "تمت" || h.status === "ملغية") return false;
        const ts = h.hearingDate ? new Date(h.hearingDate).getTime() : NaN;
        return !isNaN(ts) && ts >= now - 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime())[0];
    return next?.hearingDate ?? null;
  })();

  // Phase-9.2 — surface the cancellation reason / who / when in the
  // detail dialog. The reason lives on memos.cancellation_reason but
  // the actor + timestamp live in memo_activity_log; we fetch the log
  // when the dialog opens for a cancelled memo and pick the latest
  // "cancelled" entry for who/when. User-id is resolved to a name in
  // the JSX (getUserName isn't in scope here).
  const [cancelInfo, setCancelInfo] = useState<{ performedBy: string | null; performedAt: string } | null>(null);
  useEffect(() => {
    let aborted = false;
    if (!detailMemo || detailMemo.status !== MemoStatus.CANCELLED) {
      setCancelInfo(null);
      return;
    }
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/memos/${detailMemo.id}/activities`);
        const json = await res.json();
        const rows: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        const latest = rows
          .filter((r) => r.activityType === MemoActivityType.CANCELLED)
          .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime())[0];
        if (!aborted && latest) {
          setCancelInfo({
            performedBy: latest.performedBy ?? null,
            performedAt: latest.performedAt || "",
          });
        } else if (!aborted) {
          setCancelInfo(null);
        }
      } catch {
        if (!aborted) setCancelInfo(null);
      }
    })();
    return () => { aborted = true; };
  }, [detailMemo?.id, detailMemo?.status]);
  const [submitting, setSubmitting] = useState(false);

  // Phase-8 — pause / unpause dialog state. Mirrors the consultations
  // and cases pages.
  const [showPauseMemoDialog, setShowPauseMemoDialog] = useState(false);
  const [pauseMemoTarget, setPauseMemoTarget] = useState<Memo | null>(null);
  const [pauseMemoReason, setPauseMemoReason] = useState("");
  // OPTIONAL auto-lift date. "" = open-ended pause, the default and the
  // pre-feature behaviour.
  const [pauseMemoUntil, setPauseMemoUntil] = useState("");
  const [showUnpauseMemoDialog, setShowUnpauseMemoDialog] = useState(false);
  const [unpauseMemoTarget, setUnpauseMemoTarget] = useState<Memo | null>(null);
  const [unpauseMemoNotes, setUnpauseMemoNotes] = useState("");
  const [pauseMemoInProgress, setPauseMemoInProgress] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  // Phase-9 — quick filter axis switched: was priority, now assigned
  // lawyer. Priority lives on in advFilters for power users.
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [advFilters, setAdvFilters] = useState<AdvancedMemosFilters>(EMPTY_MEMOS_ADV_FILTERS);

  // Phase-9.3 — dashboard "بانتظار المراجعة" deep-link. Pre-selects the
  // COMMITTEE stage on the quick filter and (for non-manager roles)
  // scopes by dept or assigned lawyer so the page contents match the
  // role-filtered count on the dashboard. Single-shot on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "pending_review") setFilterStatus(MemoStage.COMMITTEE);
    const dept = params.get("dept");
    if (dept) setFilterDept(dept);
    const assignedTo = params.get("assignedTo");
    if (assignedTo) setFilterAssignedTo(assignedTo);
  }, []);

  const [reassignMemoDialog, setReassignMemoDialog] = useState<Memo | null>(null);
  const [reassignMemoAssignedTo, setReassignMemoAssignedTo] = useState<string>("");

  const [formData, setFormData] = useState({
    caseId: "",
    memoType: "" as string,
    memoTypeOther: "",
    title: "",
    description: "",
    priority: "عالي" as string,
    assignedTo: "",
    deadline: "",
    content: "",
  });

  const resetForm = () => {
    setFormData({
      caseId: "",
      memoType: "",
      memoTypeOther: "",
      title: "",
      description: "",
      priority: "عالي",
      assignedTo: "",
      deadline: "",
      content: "",
    });
  };

  const handleAddMemo = async () => {
    if (!user || !formData.caseId || !formData.memoType || !formData.title || !formData.deadline) return;
    setSubmitting(true);
    try {
      const now = Date.now();
      const upcomingHearing = getHearingsByCase(formData.caseId)
        .filter((h) => {
          if (h.status === "تمت" || h.status === "ملغية") return false;
          const ts = h.hearingDate ? new Date(h.hearingDate).getTime() : NaN;
          return !isNaN(ts) && ts >= now - 24 * 60 * 60 * 1000;
        })
        .sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime())[0];
      await addMemo({
        caseId: formData.caseId,
        hearingId: upcomingHearing ? upcomingHearing.id : null,
        memoType: formData.memoType as MemoTypeValue,
        memoTypeOther: formData.memoTypeOther,
        title: formData.title,
        description: formData.description,
        priority: formData.priority as "عاجل" | "عالي" | "متوسط" | "منخفض",
        // Don't fall back to user.id — admin_support creating a memo must
        // not be auto-assigned as the memo lawyer. The server resolves this
        // from the case's primary/responsible lawyer, and leaves it empty
        // when the case has no assigned lawyer.
        assignedTo: formData.assignedTo || "",
        deadline: formData.deadline,
        content: formData.content,
        fileLink: "",
        createdBy: user.id,
      });
      toast({ title: "تم إضافة المذكرة بنجاح" });
      setIsAddDialogOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (memo: Memo, newStatus: MemoStatusValue, extra?: Partial<Memo>) => {
    setSubmitting(true);
    try {
      await changeStatus(memo.id, newStatus, extra);
      toast({ title: "تم تحديث حالة المذكرة" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (memo: Memo) => {
    setSubmitting(true);
    try {
      await deleteMemo(memo.id);
      toast({ title: "تم حذف المذكرة" });
      setDetailMemoId(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Phase-9.2 — "لا يحتاج مذكرة" cancellation dialog state. The button
  // opens this dialog (instead of cancelling immediately) so the user
  // captures a required reason, which is persisted on the memo row
  // (cancellationReason) AND in memo_activity_log via the dedicated
  // /api/memos/:id/cancel endpoint.
  const [cancelMemoTarget, setCancelMemoTarget] = useState<Memo | null>(null);
  const [cancelMemoReason, setCancelMemoReason] = useState("");
  const [cancelMemoInProgress, setCancelMemoInProgress] = useState(false);

  const openCancelMemoDialog = (memo: Memo) => {
    setCancelMemoTarget(memo);
    setCancelMemoReason("");
  };
  const closeCancelMemoDialog = () => {
    setCancelMemoTarget(null);
    setCancelMemoReason("");
  };

  const handleConfirmCancelMemo = async () => {
    if (!cancelMemoTarget) return;
    const reason = cancelMemoReason.trim();
    if (!reason) {
      toast({ title: "أدخل سبب عدم الحاجة للمذكرة", variant: "destructive" });
      return;
    }
    setCancelMemoInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${cancelMemoTarget.id}/cancel`, { reason });
      // Mirror the legacy fast-forward of the parent case: if it's a
      // منظورة_بالمحكمة case still at an early drafting stage, flip
      // memoRequired off and jump to منظورة. Server doesn't do this on
      // /cancel since it's a memo-only endpoint; keep it FE-side for
      // parity with the previous behavior.
      const relatedCase = cases.find(c => c.id === cancelMemoTarget.caseId);
      if (relatedCase) {
        const update: any = { memoRequired: false };
        const earlyDraftingStages = new Set([
          "تحرير_مذكرة_جوابية",
          "تحرير_صحيفة_الدعوى",
          "مراجعة_داخلية",
        ]);
        if (
          relatedCase.caseClassification === "منظورة_بالمحكمة" &&
          earlyDraftingStages.has(relatedCase.currentStage)
        ) {
          update.currentStage = "منظورة";
        }
        try { await updateCase(relatedCase.id, update); } catch {}
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم إنهاء المذكرة - لا يحتاج مذكرة" });
      closeCancelMemoDialog();
    } catch (err) {
      toast({ title: "فشل إلغاء المذكرة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setCancelMemoInProgress(false);
    }
  };

  const openReassignMemoDialog = (memo: Memo) => {
    setReassignMemoAssignedTo(memo.assignedTo || "");
    setReassignMemoDialog(memo);
  };

  const handleReassignMemo = async () => {
    if (!reassignMemoDialog || !reassignMemoAssignedTo) return;
    setSubmitting(true);
    try {
      await updateMemo(reassignMemoDialog.id, { assignedTo: reassignMemoAssignedTo } as any);
      toast({ title: "تم إسناد المذكرة لمحامي جديد" });
      setReassignMemoDialog(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message || "فشل إسناد المذكرة", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const canUserChangeStatus = (memo: Memo): boolean => {
    if (!user) return false;
    if (canChangeMemoStatus(user.role)) return true;
    const relatedCase = cases.find(c => c.id === memo.caseId);
    if (relatedCase && (relatedCase.primaryLawyerId === user.id || relatedCase.responsibleLawyerId === user.id)) return true;
    if (memo.assignedTo === user.id) return true;
    return false;
  };

  // Cancel ("لا يحتاج مذكرة") permission gate. Mirrors the SERVER's canActOnMemo
  // for POST /api/memos/:id/cancel (routes.ts:328-349 + the cancel route's admin
  // roles) EXACTLY — visibility must equal authorization in both directions:
  //   • allowed: branch_manager, admin_support, cases_review_head, the memo
  //     ASSIGNEE, and the department_head of the PARENT CASE's department.
  //   • NOT allowed: the case's primaryLawyer / responsibleLawyer when they are
  //     not the memo assignee — the server 403s them.
  // The old gate (canUserChangeStatus, still used by the legacy null-stage status
  // buttons below) got this wrong on BOTH sides: it omitted department_head +
  // admin_support (so a dept head never saw the button the server would have let
  // them use — the reported القسم العام bug), and it included the case lawyers
  // (so it showed a button that 403s). Memos carry no departmentId, so the
  // dept_head check resolves it through the parent case, exactly like canPauseMemo.
  const canCancelMemo = (memo: Memo): boolean => {
    if (!user) return false;
    if (user.role === "branch_manager" || user.role === "admin_support" || user.role === "cases_review_head") return true;
    if (!!memo.assignedTo && memo.assignedTo === user.id) return true;
    if (user.role === "department_head") {
      const parent = cases.find(c => c.id === memo.caseId);
      return !!parent && parent.departmentId === user.departmentId;
    }
    return false;
  };

  // Phase-8 — pause permission gate. Mirrors the server check on
  // /api/memos/:id/pause and /unpause: branch_manager / admin_support /
  // dept_head (own dept, resolved via parent case) / assigned lawyer.
  // Memos don't carry departmentId directly, so dept_head needs the
  // parent case lookup.
  // CREATE-SCOPE — memos carry no departmentId, so "their own department" resolves
  // through the PARENT CASE, exactly as the server does at POST /api/memos:
  //   • branch_manager / cases_review_head / admin_support — every case (global).
  //   • department_head — cases in THEIR OWN department only. canCreateMemos grants
  //     the role firm-wide, which is the gap this closes: a head could previously
  //     raise a memo on another department's case.
  //   • employee — cases ASSIGNED to them.
  // This same list drives the case picker in the add dialog, so the picker can only
  // offer a case the server would accept.
  const memoCreatableCases = useMemo(() => {
    if (!user) return [];
    if (["branch_manager", "cases_review_head", "admin_support"].includes(user.role)) return cases;
    if (user.role === "department_head") {
      return user.departmentId
        ? cases.filter((c) => c.departmentId === user.departmentId)
        : [];
    }
    return cases.filter((c) =>
      c.primaryLawyerId === user.id
      || c.responsibleLawyerId === user.id
      || (Array.isArray(c.assignedLawyers) && c.assignedLawyers.includes(user.id)));
  }, [cases, user]);

  // The button needs at least one case the user could actually raise a memo on —
  // otherwise the dialog opens onto an empty picker.
  const canCreateMemosWidened = memoCreatableCases.length > 0;

  // MISMATCH FIX — memo reassign was department_head ONLY, so a branch_manager
  // could not reassign a memo from the UI at all, and admin_support / the review
  // heads could not either, though every one of them is accepted by the server.
  // Mirrors the server's carve-out-4 gate on PATCH /api/memos/:id assignedTo:
  // department tier (branch_manager | own-dept head, resolved through the parent
  // case) plus the admin roles. The memo ASSIGNEE is deliberately excluded — that
  // is the self-reassignment loop the carve-out exists to close.
  const canReassignMemo = (memo: Memo): boolean => {
    if (!user) return false;
    if (user.role === "branch_manager") return true;
    if (["admin_support", "cases_review_head", "labor_review_head"].includes(user.role)) return true;
    if (user.role === "department_head") {
      const parent = cases.find((c) => c.id === memo.caseId);
      return !!parent && !!user.departmentId && parent.departmentId === user.departmentId;
    }
    return false;
  };

  const canPauseMemo = (memo: Memo): boolean => {
    if (!user) return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (user.role === "department_head") {
      const parent = cases.find(c => c.id === memo.caseId);
      return !!parent && parent.departmentId === user.departmentId;
    }
    return memo.assignedTo === user.id;
  };

  const isMemoPaused = (memo: Memo): boolean => !!memo.pausedAt;

  const TERMINAL_MEMO_STATUSES = new Set(["معتمدة", "مرفوعة", "ملغاة"]);


  const openPauseMemoDialog = (memo: Memo) => {
    setPauseMemoTarget(memo);
    setPauseMemoReason("");
    setPauseMemoUntil("");
    setShowPauseMemoDialog(true);
  };
  const closePauseMemoDialog = () => {
    setShowPauseMemoDialog(false);
    setPauseMemoTarget(null);
    setPauseMemoReason("");
    setPauseMemoUntil("");
  };
  const openUnpauseMemoDialog = (memo: Memo) => {
    setUnpauseMemoTarget(memo);
    setUnpauseMemoNotes("");
    setShowUnpauseMemoDialog(true);
  };
  const closeUnpauseMemoDialog = () => {
    setShowUnpauseMemoDialog(false);
    setUnpauseMemoTarget(null);
    setUnpauseMemoNotes("");
  };

  const handlePauseMemo = async () => {
    if (!pauseMemoTarget) return;
    const reason = pauseMemoReason.trim();
    if (!reason) {
      toast({ title: "أدخل سبب التعليق", variant: "destructive" });
      return;
    }
    // Client half of the past-date rule; the server's validatePauseUntil (the
    // SAME shared function) stays authoritative.
    const untilError = pauseUntilError(pauseMemoUntil);
    if (untilError) {
      toast({ title: untilError, variant: "destructive" });
      return;
    }
    const until = pauseMemoUntil.trim();
    setPauseMemoInProgress(true);
    try {
      // pauseUntil omitted when blank — absent means open-ended, exactly as before.
      await apiRequest("POST", `/api/memos/${pauseMemoTarget.id}/pause`, until ? { reason, pauseUntil: until } : { reason });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم تعليق المذكرة" });
      closePauseMemoDialog();
    } catch (err) {
      toast({ title: "فشل التعليق", description: extractApiError(err), variant: "destructive" });
    } finally {
      setPauseMemoInProgress(false);
    }
  };

  const handleUnpauseMemo = async () => {
    if (!unpauseMemoTarget) return;
    setPauseMemoInProgress(true);
    try {
      const body: Record<string, string> = {};
      const notes = unpauseMemoNotes.trim();
      if (notes) body.notes = notes;
      await apiRequest("POST", `/api/memos/${unpauseMemoTarget.id}/unpause`, body);
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم إلغاء تعليق المذكرة" });
      closeUnpauseMemoDialog();
    } catch (err) {
      toast({ title: "فشل إلغاء التعليق", description: extractApiError(err), variant: "destructive" });
    } finally {
      setPauseMemoInProgress(false);
    }
  };

  // Phase-8 — await-completion / resume on memos. Same permission gate
  // as pause. Memos don't have a stage flow so saved_stage holds the
  // memo status as a snapshot; resume just clears the flag.
  const [showAwaitMemoDialog, setShowAwaitMemoDialog] = useState(false);
  const [awaitMemoTarget, setAwaitMemoTarget] = useState<Memo | null>(null);
  const [awaitMemoReason, setAwaitMemoReason] = useState("");
  const [showResumeMemoDialog, setShowResumeMemoDialog] = useState(false);
  const [resumeMemoTarget, setResumeMemoTarget] = useState<Memo | null>(null);
  const [resumeMemoNotes, setResumeMemoNotes] = useState("");

  const openAwaitMemoDialog = (memo: Memo) => {
    setAwaitMemoTarget(memo);
    setAwaitMemoReason("");
    setShowAwaitMemoDialog(true);
  };
  const closeAwaitMemoDialog = () => {
    setShowAwaitMemoDialog(false);
    setAwaitMemoTarget(null);
    setAwaitMemoReason("");
  };
  const openResumeMemoDialog = (memo: Memo) => {
    setResumeMemoTarget(memo);
    setResumeMemoNotes("");
    setShowResumeMemoDialog(true);
  };
  const closeResumeMemoDialog = () => {
    setShowResumeMemoDialog(false);
    setResumeMemoTarget(null);
    setResumeMemoNotes("");
  };

  const handleAwaitMemo = async () => {
    if (!awaitMemoTarget) return;
    const reason = awaitMemoReason.trim();
    if (!reason) {
      toast({ title: "أدخل السبب", variant: "destructive" });
      return;
    }
    setPauseMemoInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${awaitMemoTarget.id}/await-completion`, { reason });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم تعيين المذكرة بانتظار الاستكمال" });
      closeAwaitMemoDialog();
    } catch (err) {
      toast({ title: "فشل الإجراء", description: extractApiError(err), variant: "destructive" });
    } finally {
      setPauseMemoInProgress(false);
    }
  };

  const handleResumeMemo = async () => {
    if (!resumeMemoTarget) return;
    setPauseMemoInProgress(true);
    try {
      const body: Record<string, string> = {};
      const notes = resumeMemoNotes.trim();
      if (notes) body.notes = notes;
      await apiRequest("POST", `/api/memos/${resumeMemoTarget.id}/resume-from-completion`, body);
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم العودة من الاستكمال" });
      closeResumeMemoDialog();
    } catch (err) {
      toast({ title: "فشل الإجراء", description: extractApiError(err), variant: "destructive" });
    } finally {
      setPauseMemoInProgress(false);
    }
  };

  // Phase-9 — review-workflow dialog state. Three dialogs mirror the
  // consultations side; each has a notes textarea and 2-3 action buttons.
  const [showInternalReviewDialog, setShowInternalReviewDialog] = useState(false);
  const [internalReviewMemo, setInternalReviewMemo] = useState<Memo | null>(null);
  const [internalReviewNotes, setInternalReviewNotes] = useState("");

  const [showCommitteeDialog, setShowCommitteeDialog] = useState(false);
  const [committeeMemo, setCommitteeMemo] = useState<Memo | null>(null);
  const [committeeNotes, setCommitteeNotes] = useState("");

  // Reasoned override — "تجاوز لجنة المراجعة" (skip straight to جاهزة_للرفع).
  // Its own dialog, deliberately NOT folded into the committee-decision dialog:
  // different actors, different meaning, and the reason is MANDATORY here.
  const [showSkipCommitteeDialog, setShowSkipCommitteeDialog] = useState(false);
  const [skipCommitteeMemo, setSkipCommitteeMemo] = useState<Memo | null>(null);
  const [skipCommitteeReason, setSkipCommitteeReason] = useState("");

  const [showTakeNotesDialog, setShowTakeNotesDialog] = useState(false);
  const [takeNotesMemo, setTakeNotesMemo] = useState<Memo | null>(null);
  const [takeNotesNotes, setTakeNotesNotes] = useState("");

  const [reviewActionInProgress, setReviewActionInProgress] = useState(false);

  const openInternalReviewDialog = (m: Memo) => {
    setInternalReviewMemo(m);
    setInternalReviewNotes("");
    setShowInternalReviewDialog(true);
  };
  const closeInternalReviewDialog = () => {
    setShowInternalReviewDialog(false);
    setInternalReviewMemo(null);
    setInternalReviewNotes("");
  };
  const openCommitteeDialog = (m: Memo) => {
    setCommitteeMemo(m);
    setCommitteeNotes("");
    setShowCommitteeDialog(true);
  };
  const closeCommitteeDialog = () => {
    setShowCommitteeDialog(false);
    setCommitteeMemo(null);
    setCommitteeNotes("");
  };
  const openSkipCommitteeDialog = (m: Memo) => {
    setSkipCommitteeMemo(m);
    setSkipCommitteeReason("");
    setShowSkipCommitteeDialog(true);
  };
  const closeSkipCommitteeDialog = () => {
    setShowSkipCommitteeDialog(false);
    setSkipCommitteeMemo(null);
    setSkipCommitteeReason("");
  };
  const openTakeNotesDialog = (m: Memo) => {
    setTakeNotesMemo(m);
    setTakeNotesNotes("");
    setShowTakeNotesDialog(true);
  };
  const closeTakeNotesDialog = () => {
    setShowTakeNotesDialog(false);
    setTakeNotesMemo(null);
    setTakeNotesNotes("");
  };

  const handleInternalReview = async (decision: InternalReviewDecisionValue) => {
    if (!internalReviewMemo) return;
    setReviewActionInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${internalReviewMemo.id}/internal-review`, {
        decision,
        notes: internalReviewNotes,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      const msg = decision === InternalReviewDecision.PASSED
        ? "تمت المراجعة الداخلية — أُحيلت للجنة"
        : "تم تسجيل ملاحظات المراجعة الداخلية";
      toast({ title: msg });
      closeInternalReviewDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل المراجعة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setReviewActionInProgress(false);
    }
  };

  const handleCommitteeDecision = async (decision: CommitteeDecisionValue) => {
    if (!committeeMemo) return;
    setReviewActionInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${committeeMemo.id}/committee-decision`, {
        decision,
        notes: committeeNotes,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      const msg = decision === CommitteeDecision.APPROVED
        ? "تم اعتماد المذكرة — جاهزة للرفع"
        : "تم إرسال المذكرة للأخذ بالملاحظات";
      toast({ title: msg });
      closeCommitteeDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل قرار اللجنة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setReviewActionInProgress(false);
    }
  };

  // Reasoned override — skip the review committee. The reason is MANDATORY (the
  // server 400s without it), so the confirm button stays disabled until one is
  // typed, matching the memo-cancel ("لا يحتاج مذكرة") dialog.
  const handleSkipCommittee = async () => {
    if (!skipCommitteeMemo) return;
    const reason = skipCommitteeReason.trim();
    if (!reason) return;
    setReviewActionInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${skipCommitteeMemo.id}/skip-committee`, { reason });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم تجاوز لجنة المراجعة — المذكرة جاهزة للرفع" });
      closeSkipCommitteeDialog();
    } catch (err) {
      toast({ title: "فشل تجاوز لجنة المراجعة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setReviewActionInProgress(false);
    }
  };

  // Memo lawyer-side advance (linear advances + DRAFTING→INTERNAL_REVIEW
  // send-to-review) now lives in the shared <MemoAdvancePanel> (used by this
  // page and the مهامي hub). The internal-review / committee / take-notes
  // decision dialogs below stay here.

  const handleTakeNotesOutcome = async (outcome: NoteOutcomeValue) => {
    if (!takeNotesMemo) return;
    setReviewActionInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${takeNotesMemo.id}/take-notes-outcome`, {
        outcome,
        notes: takeNotesNotes,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      // All outcomes advance to READY per spec — outcome distinction
      // is recorded but not reflected in routing.
      toast({ title: "تم تسجيل النتيجة — المذكرة جاهزة للرفع" });
      closeTakeNotesDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل النتيجة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setReviewActionInProgress(false);
    }
  };

  const handleReturnMemoToCommittee = async () => {
    if (!takeNotesMemo) return;
    if (!takeNotesNotes.trim()) {
      toast({ title: "الملاحظات مطلوبة", description: "اشرح ما تم تطبيقه أو سبب الإعادة", variant: "destructive" });
      return;
    }
    setReviewActionInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${takeNotesMemo.id}/return-to-committee`, {
        notes: takeNotesNotes.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم إعادة المذكرة للجنة المراجعة" });
      closeTakeNotesDialog();
    } catch (err) {
      toast({ title: "فشل إعادة المذكرة للجنة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setReviewActionInProgress(false);
    }
  };

  // Resolve a memo's parent case so the role-gate helpers can scope
  // department_head correctly.
  // Returns the FULL parent case (was narrowed to { departmentId }): the
  // skip-committee gate also needs its lawyer fields. Existing callers read only
  // departmentId, so widening is behaviour-neutral.
  const getMemoCase = (memo: Memo): LawCase | null => {
    return cases.find(c => c.id === memo.caseId) ?? null;
  };

  const getUserName = (id: string | null): string => {
    if (!id) return "-";
    const u = getUserById(id);
    return u?.name || "-";
  };

  const getCaseNumber = (caseId: string): string => {
    const c = cases.find(cs => cs.id === caseId);
    return c?.caseNumber || caseId;
  };

  const getCaseDetails = (caseId: string) => {
    const c = cases.find(cs => cs.id === caseId);
    if (!c) return { number: caseId, plaintiff: "", client: "", opponent: "", classification: "", clientRoleLabel: "-" };
    const classification = c.caseClassification || "";
    const clientRoleLabel = getClientRoleLabel(classification, (c as any).clientRole);
    return {
      number: c.caseNumber,
      plaintiff: (c as any).plaintiffName || "",
      client: getClientName(c.clientId),
      opponent: c.opponentName || "",
      classification,
      clientRoleLabel,
    };
  };

  const getClientName = (clientId: string): string => {
    if (!clientId) return "";
    const client = clients.find((cl: any) => cl.id === clientId);
    if (!client) return "";
    return client.clientType === "شركة" ? (client.companyName || "") : (client.individualName || "");
  };

  const activeMemos = getActiveMemos();
  const overdueMemos = getOverdueMemos();
  const assignableUsers = users.filter(u => u.canBeAssignedCases && u.isActive);

  const filteredMemos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const filtered = memos.filter((m) => {
      // Quick filter operates on displayStage (virtual grouping):
      // cancelled memos appear under مرفوعة, paused memos under تحرير.
      // The "ملغاة" option remains as a special status-only filter
      // (so users who want ONLY cancelled rows can still narrow down).
      if (filterStatus !== "all") {
        if (filterStatus === MemoStatus.CANCELLED) {
          if (m.status !== MemoStatus.CANCELLED) return false;
        } else {
          if (getMemoDisplayStage(m) !== filterStatus) return false;
        }
      }
      const relatedCase = cases.find(c => c.id === m.caseId);
      if (filterDept !== "all" && !(relatedCase && relatedCase.departmentId === filterDept)) return false;
      if (filterAssignedTo !== "all" && m.assignedTo !== filterAssignedTo) return false;
      if (q) {
        const clientName = relatedCase ? getClientName(relatedCase.clientId) : "";
        const hay = [
          m.title,
          relatedCase?.caseNumber,
          relatedCase?.courtCaseNumber,
          (relatedCase as any)?.plaintiffName,
          relatedCase?.opponentName,
          clientName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      // Advanced filters (empty = no constraint, all AND'd)
      if (advFilters.memoTypes.length && !advFilters.memoTypes.includes(m.memoType)) return false;
      // Same virtual-grouping logic as the quick filter: "ملغاة"
      // matches strictly by status; other values match against
      // displayStage (cancelled→مرفوعة, paused→تحرير, else currentStage).
      if (advFilters.statuses.length) {
        const ds = getMemoDisplayStage(m);
        const matched = advFilters.statuses.some((s) =>
          s === MemoStatus.CANCELLED
            ? m.status === MemoStatus.CANCELLED
            : ds === s,
        );
        if (!matched) return false;
      }
      if (advFilters.priorities.length && !advFilters.priorities.includes(m.priority)) return false;
      if (advFilters.depts.length) {
        if (!relatedCase || !advFilters.depts.includes(relatedCase.departmentId)) return false;
      }
      if (advFilters.lawyers.length && !advFilters.lawyers.includes(m.assignedTo)) return false;
      if (advFilters.classification) {
        if (!relatedCase || relatedCase.caseClassification !== advFilters.classification) return false;
      }
      if (advFilters.deadlineFrom && (!m.deadline || m.deadline < advFilters.deadlineFrom)) return false;
      if (advFilters.deadlineTo && (!m.deadline || m.deadline > advFilters.deadlineTo)) return false;
      if (advFilters.overdueOnly) {
        if (!m.deadline || m.deadline >= today) return false;
        // Phase-9 — three-way "still in motion" check on the new
        // currentStage axis (cancelled / filed → not overdue).
        if (!isMemoNonFinal(m)) return false;
      }
      if (advFilters.autoGeneratedOnly && !m.isAutoGenerated) return false;
      return true;
    });
    // Default ordering: priority group ASC, then workflow-stage order
    // ASC within a group (earlier stages bubble up), then updatedAt
    // DESC within the same stage. Mirrors the cases page sort so the
    // tables read consistently. MemoStagesAll covers the conditional
    // TAKING_NOTES branch; unknown stages fall to 999 so they sink to
    // the bottom of their group.
    const updatedAtMs = (m: Memo): number => {
      const t = m.updatedAt ? new Date(m.updatedAt).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    const stageOrderIndex = (m: Memo): number => {
      if (!m.currentStage) return 999;
      const i = MemoStagesAll.indexOf(m.currentStage as MemoStageValue);
      return i === -1 ? 999 : i;
    };
    return filtered.slice().sort((a, b) => {
      const ga = getMemoPriorityGroup(a);
      const gb = getMemoPriorityGroup(b);
      if (ga !== gb) return ga - gb;
      const sa = stageOrderIndex(a);
      const sb = stageOrderIndex(b);
      if (sa !== sb) return sa - sb;
      return updatedAtMs(b) - updatedAtMs(a);
    });
  }, [memos, cases, filterStatus, filterDept, filterAssignedTo, searchQuery, advFilters]);

  // Rows-per-page is user-configurable and persisted per user + per page.
  const [MEMO_PAGE_SIZE, setMemoPageSize] = usePageSize("memos");
  const [memoPage, setMemoPage] = useState(1);
  useEffect(() => { setMemoPage(1); }, [filterStatus, filterDept, filterAssignedTo, searchQuery, advFilters]);
  const memoTotalPages = Math.max(1, Math.ceil(filteredMemos.length / MEMO_PAGE_SIZE));
  const pagedMemos = filteredMemos.slice((memoPage - 1) * MEMO_PAGE_SIZE, memoPage * MEMO_PAGE_SIZE);
  const handleMemoPageSizeChange = (size: number) => { setMemoPageSize(size); setMemoPage(1); };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ScrollText className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">المذكرات القانونية</h1>
            <p className="text-muted-foreground">إدارة ومتابعة المذكرات القانونية</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" data-testid="badge-total-count">
            الإجمالي: {memos.length}
          </Badge>
          <Badge variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-400" data-testid="badge-active-count">
            نشطة: {activeMemos.length}
          </Badge>
          <Badge variant="outline" className="border-destructive/30 text-destructive" data-testid="badge-overdue-count">
            متأخرة: {overdueMemos.length}
          </Badge>
          {user && canCreateMemosWidened && (
            <Button data-testid="button-add-memo" onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة مذكرة
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                placeholder="بحث بالعنوان أو رقم القضية أو اسم العميل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                {/* Phase-9 — quick filter on the new currentStage axis.
                    "ملغاة" stays here as a special option that filters
                    by legacy status (orthogonal lifecycle, not a stage). */}
                <SelectItem value="all">جميع الحالات</SelectItem>
                {Object.entries(MemoStageLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
                <SelectItem value={MemoStatus.CANCELLED}>{MemoStatusLabels[MemoStatus.CANCELLED]}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-dept">
                <SelectValue placeholder="القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأقسام</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={String(dept.id)} value={String(dept.id)}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Phase-9 — replaces the priority quick filter. Same role
                exclusion as the cases / consultations lawyer pickers.
                Priority is still available in advanced filters. */}
            <Select value={filterAssignedTo} onValueChange={setFilterAssignedTo}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-assigned-to">
                <SelectValue placeholder="المحامي المكلف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المحامين</SelectItem>
                {users
                  .filter(u =>
                    u.isActive
                    && u.role !== "branch_manager"
                    && u.role !== "admin_support"
                    && u.role !== "hr"
                    && u.role !== "technical_support"
                  )
                  .map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <MemosAdvancedFilters
              filters={advFilters}
              onChange={setAdvFilters}
              departments={departments.map((d) => ({ id: String(d.id), name: d.name }))}
              users={users.map((u) => ({
                id: u.id,
                name: u.name,
                role: u.role,
                departmentId: u.departmentId,
              }))}
            />
          </div>
        </CardHeader>
        <CardContent>
          {!isLoading && filteredMemos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد مذكرات مطابقة للبحث</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-[48px]">#</TableHead>
                    <TableHead className="text-center">العنوان</TableHead>
                    <TableHead className="text-center">العميل</TableHead>
                    <TableHead className="text-center">الخصم</TableHead>
                    <TableHead className="text-center">صفة العميل</TableHead>
                    <TableHead className="text-center">المحامي المكلف</TableHead>
                    <TableHead className="text-center">الموعد النهائي</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedMemos.map((memo, idx) => {
                      const caseDetails = getCaseDetails(memo.caseId);
                      const relatedCaseForRow = cases.find((c) => c.id === memo.caseId);
                      const priorityGroup = getMemoPriorityGroup(memo);
                      const rowClass =
                        priorityGroup === 1
                          ? "bg-amber-50/60 dark:bg-amber-950/20"
                          : priorityGroup === 4
                            ? "opacity-60"
                            : priorityGroup === 3
                              ? "opacity-80"
                              : "";
                      return (
                      <TableRow key={memo.id} data-testid={`row-memo-${memo.id}`} className={rowClass}>
                        {/* Display-only sequential number — index inside the
                            RENDERED page, so filters/sorting/search renumber
                            from 1. Continues across pages via the page offset
                            (the pager is a plain slice of one sorted list). */}
                        <TableCell className="text-center text-xs text-muted-foreground" data-testid={`cell-index-${memo.id}`}>
                          {(memoPage - 1) * MEMO_PAGE_SIZE + idx + 1}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center text-center w-full">
                            <p className="font-medium text-sm text-center w-full">{memo.title}</p>
                            {relatedCaseForRow && (
                              <p className="text-xs text-muted-foreground text-center mt-0.5">
                                قضية رقم <LtrInline>{relatedCaseForRow.caseNumber}</LtrInline>
                              </p>
                            )}
                            <Badge variant="outline" className="mt-1">
                              {memo.memoType === "أخرى" ? (memo.memoTypeOther || "أخرى") : MemoTypeLabels[memo.memoType]}
                            </Badge>
                            {priorityGroup === 1 && (
                              <Badge
                                variant="outline"
                                className="mt-1 border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1 py-0"
                                data-testid={`badge-memo-unassigned-${memo.id}`}
                                title="المذكرة لم تُسنَد لمحامٍ بعد"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 ml-1" />
                                غير مسندة
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center text-center w-full">
                            {(caseDetails.plaintiff || caseDetails.client) && (
                              <p className="text-sm font-medium text-center">{caseDetails.plaintiff || caseDetails.client}</p>
                            )}
                            {caseDetails.plaintiff && caseDetails.client && (
                              <p className="text-xs text-muted-foreground text-center">{caseDetails.client}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm block text-center">{caseDetails.opponent || "-"}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {caseDetails.clientRoleLabel && caseDetails.clientRoleLabel !== "-" ? (
                            <Badge variant="outline" className={`text-xs inline-flex justify-center ${
                              caseDetails.clientRoleLabel === "مدعى عليه"
                                ? "border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400"
                                : "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
                            }`}>
                              {caseDetails.clientRoleLabel}
                            </Badge>
                          ) : (
                            <span className="text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm">{getUserName(memo.assignedTo)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm ${getDeadlineColor(memo.deadline)}`}>
                            <DualDateDisplay date={memo.deadline} compact />
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            {/* Stage badge uses displayStage (virtual
                                grouping): cancelled memos show under
                                مرفوعة + ملغاة pill; paused memos show
                                under تحرير + معلّقة pill; legacy memos
                                with currentStage=null still fall back
                                to the legacy status badge. */}
                            {(() => {
                              const ds = getMemoDisplayStage(memo);
                              if (ds) {
                                return (
                                  <Badge className={getStageBadgeClass(ds)}>
                                    {MemoStageLabels[ds] || ds}
                                  </Badge>
                                );
                              }
                              return (
                                <Badge className={getStatusBadgeClass(memo.status)}>
                                  {MemoStatusLabels[memo.status]}
                                </Badge>
                              );
                            })()}
                            {/* "ملغاة" lifecycle pill — surfaces the
                                cancellation while the stage badge
                                shows the displayStage (مرفوعة). */}
                            {memo.status === MemoStatus.CANCELLED && (
                              <Badge
                                variant="outline"
                                className="border-destructive/40 bg-destructive/10 text-destructive text-[10px] px-1 py-0"
                                data-testid={`badge-memo-cancelled-${memo.id}`}
                              >
                                {MemoStatusLabels[MemoStatus.CANCELLED]}
                              </Badge>
                            )}
                            {/* Phase-8 — paused indicator. Distinct amber badge
                                so it reads as orthogonal to memo status. */}
                            {isMemoPaused(memo) && (
                              <Badge
                                variant="outline"
                                className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                                data-testid={`badge-memo-paused-${memo.id}`}
                                title={pauseBadgeTooltip(memo, "معلّق")}
                              >
                                <Pause className="w-2.5 h-2.5 ml-1" />
                                معلّق
                              </Badge>
                            )}
                            {/* Phase-8 — awaiting-completion indicator. */}
                            {memo.awaitingCompletion && !isMemoPaused(memo) && (
                              <Badge
                                variant="outline"
                                className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                                data-testid={`badge-memo-awaiting-${memo.id}`}
                                title="بانتظار استكمال المرفقات والبيانات"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 ml-1" />
                                بانتظار
                              </Badge>
                            )}
                            {memo.hearingId && getHearingById(memo.hearingId)?.opponentResponseRequired && (
                              <Badge variant="outline" className="text-[10px] border-orange-500 text-orange-600 dark:text-orange-400 px-1 py-0">
                                رد خصم
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`button-memo-actions-${memo.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                data-testid={`button-view-memo-${memo.id}`}
                                onClick={() => {
                                  setDetailMemoId(memo.id);
                                }}
                              >
                                <Eye className="w-4 h-4 ml-2" />
                                عرض التفاصيل
                              </DropdownMenuItem>
                              {canReassignMemo(memo) && !["معتمدة", "مرفوعة", "ملغاة"].includes(memo.status) && (
                                <DropdownMenuItem
                                  data-testid={`button-reassign-memo-${memo.id}`}
                                  onClick={() => openReassignMemoDialog(memo)}
                                >
                                  <UserCog className="w-4 h-4 ml-2" />
                                  إسناد لمحامي
                                </DropdownMenuItem>
                              )}
                              {!["معتمدة", "مرفوعة", "ملغاة"].includes(memo.status) && canCancelMemo(memo) && (
                                <DropdownMenuItem
                                  data-testid={`button-no-memo-needed-${memo.id}`}
                                  onClick={() => openCancelMemoDialog(memo)}
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Ban className="w-4 h-4 ml-2" />
                                  لا يحتاج مذكرة
                                </DropdownMenuItem>
                              )}
                              {/* Phase-8 — await-completion / resume action.
                                  Mirrors the pause/unpause pair. Hidden when
                                  paused (server requires unpause first) and
                                  when in a terminal status. */}
                              {!isMemoPaused(memo) && memo.awaitingCompletion
                                ? canPauseMemo(memo) && (
                                    <DropdownMenuItem
                                      className="text-green-600 hover:text-green-700"
                                      data-testid={`button-resume-memo-${memo.id}`}
                                      onClick={() => openResumeMemoDialog(memo)}
                                    >
                                      <CheckCircle className="w-4 h-4 ml-2" />
                                      تم الاستكمال
                                    </DropdownMenuItem>
                                  )
                                : !isMemoPaused(memo)
                                  && !TERMINAL_MEMO_STATUSES.has(memo.status)
                                  && canPauseMemo(memo) && (
                                    <DropdownMenuItem
                                      className="text-amber-600 hover:text-amber-700"
                                      data-testid={`button-await-memo-${memo.id}`}
                                      onClick={() => openAwaitMemoDialog(memo)}
                                    >
                                      <AlertTriangle className="w-4 h-4 ml-2" />
                                      بانتظار البيانات
                                    </DropdownMenuItem>
                                  )}
                              {/* Phase-8 — pause / unpause action. Pause shown
                                  when not paused, not in a terminal status, and
                                  user has permission. Unpause replaces it
                                  (Play icon) when paused. */}
                              {isMemoPaused(memo)
                                ? canPauseMemo(memo) && (
                                    <DropdownMenuItem
                                      data-testid={`button-unpause-memo-${memo.id}`}
                                      onClick={() => openUnpauseMemoDialog(memo)}
                                    >
                                      <Play className="w-4 h-4 ml-2" />
                                      إلغاء التعليق
                                    </DropdownMenuItem>
                                  )
                                : !TERMINAL_MEMO_STATUSES.has(memo.status) && canPauseMemo(memo) && (
                                    <DropdownMenuItem
                                      className="text-amber-600 hover:text-amber-700"
                                      data-testid={`button-pause-memo-${memo.id}`}
                                      onClick={() => openPauseMemoDialog(memo)}
                                    >
                                      <Pause className="w-4 h-4 ml-2" />
                                      تعليق المذكرة
                                    </DropdownMenuItem>
                                  )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          )}
          <PaginationControls
            currentPage={memoPage}
            totalPages={memoTotalPages}
            onPageChange={setMemoPage}
            pageSize={MEMO_PAGE_SIZE}
            onPageSizeChange={handleMemoPageSizeChange}
          />
        </CardContent>
      </Card>

      <Dialog open={!!reassignMemoDialog} onOpenChange={(open) => !open && setReassignMemoDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              إسناد لمحامي
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>المحامي المكلف بالمذكرة</Label>
              <Select value={reassignMemoAssignedTo} onValueChange={setReassignMemoAssignedTo}>
                <SelectTrigger data-testid="select-reassign-memo-lawyer">
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
              data-testid="button-cancel-reassign-memo"
              onClick={() => setReassignMemoDialog(null)}
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-save-reassign-memo"
              onClick={handleReassignMemo}
              disabled={!reassignMemoAssignedTo || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة مذكرة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>القضية *</Label>
              <Popover open={caseComboOpen} onOpenChange={setCaseComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={caseComboOpen}
                    data-testid="select-memo-case"
                    className="w-full justify-between font-normal text-right"
                  >
                    <span className="truncate">
                      {formData.caseId
                        ? (() => {
                            const c = cases.find(x => x.id === formData.caseId);
                            return c ? `${c.caseNumber}${c.opponentName ? ` — ${c.opponentName}` : ""}` : "اختر القضية";
                          })()
                        : "اختر القضية"}
                    </span>
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[420px] p-0" align="start" dir="rtl">
                  <Command
                    filter={(value, search) => {
                      const c = cases.find(x => x.id === value);
                      if (!c) return 0;
                      const haystack = `${c.caseNumber} ${c.opponentName || ""} ${c.plaintiffName || ""}`.toLowerCase();
                      return haystack.includes(search.toLowerCase()) ? 1 : 0;
                    }}
                  >
                    <CommandInput placeholder="ابحث برقم القضية أو اسم الخصم..." />
                    <CommandList>
                      <CommandEmpty>لا توجد نتائج</CommandEmpty>
                      <CommandGroup>
                        {memoCreatableCases
                          .filter(c => c.status !== "مغلق")
                          .map(c => (
                            <CommandItem
                              key={c.id}
                              value={c.id}
                              onSelect={(val) => {
                                const selected = cases.find(x => x.id === val);
                                const autoLawyer = selected?.primaryLawyerId || selected?.responsibleLawyerId || "";
                                setFormData(prev => ({ ...prev, caseId: val, assignedTo: autoLawyer }));
                                setCaseComboOpen(false);
                              }}
                              className="flex items-center justify-between gap-2"
                            >
                              <div className="flex flex-col">
                                <LtrInline className="font-medium">{c.caseNumber}</LtrInline>
                                {c.opponentName && (
                                  <span className="text-xs text-muted-foreground">{c.opponentName}</span>
                                )}
                              </div>
                              {formData.caseId === c.id && (
                                <Check className="h-4 w-4 shrink-0 text-primary" />
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>نوع المذكرة *</Label>
              <Select
                value={formData.memoType}
                onValueChange={(value) => setFormData({ ...formData, memoType: value, memoTypeOther: "" })}
              >
                <SelectTrigger data-testid="select-memo-type">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MemoTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.memoType === "أخرى" && (
                <Input
                  data-testid="input-memo-type-other"
                  value={formData.memoTypeOther}
                  onChange={(e) => setFormData({ ...formData, memoTypeOther: e.target.value })}
                  placeholder="حدد نوع المذكرة"
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <Label>العنوان *</Label>
              <Input
                data-testid="input-memo-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="عنوان المذكرة"
              />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea
                data-testid="input-memo-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف المذكرة..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الأولوية</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger data-testid="select-memo-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="عاجل">عاجل</SelectItem>
                    <SelectItem value="عالي">عالي</SelectItem>
                    <SelectItem value="متوسط">متوسط</SelectItem>
                    <SelectItem value="منخفض">منخفض</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الموعد النهائي *</Label>
                <HijriDatePicker
                  data-testid="input-memo-deadline"
                  value={formData.deadline}
                  onChange={(value) => setFormData({ ...formData, deadline: value })}
                  placeholder="اختر الموعد النهائي"
                />
              </div>
            </div>
            <div>
              <Label>المحامي المكلف</Label>
              <Select
                value={formData.assignedTo}
                onValueChange={(value) => setFormData({ ...formData, assignedTo: value })}
              >
                <SelectTrigger data-testid="select-memo-assigned">
                  <SelectValue placeholder="المحامي المكلف بالقضية (تلقائي)" />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">يتم تعيين المحامي المكلف بالقضية تلقائياً</p>
            </div>
            <div>
              <Label>المحتوى</Label>
              <Textarea
                data-testid="input-memo-content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="محتوى المذكرة..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-memo"
              onClick={handleAddMemo}
              className="w-full"
              disabled={!formData.caseId || !formData.memoType || !formData.title || !formData.deadline || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              إضافة المذكرة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailMemo} onOpenChange={(open) => { if (!open) setDetailMemoId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailMemo && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span>{detailMemo.title}</span>
                  {detailMemo.isAutoGenerated && (
                    <Badge variant="outline" className="border-primary text-primary">
                      <Zap className="w-3 h-3 ml-1" />
                      مذكرة تلقائية
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {/* Phase-8 — awaiting-completion banner. Memos don't have a
                    stage flow; saved_stage holds the memo status as a
                    snapshot. Surfaces the snapshot so the user knows what
                    state will be restored on resume. */}
                {detailMemo.awaitingCompletion && !isMemoPaused(detailMemo) && (
                  <div
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                    data-testid="banner-memo-awaiting"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-4 h-4" />
                      هذه المذكرة بانتظار استكمال المرفقات والبيانات
                    </div>
                    {detailMemo.savedStage && (
                      <div className="mt-1 text-xs">
                        الحالة المحفوظة: <BidiText>{MemoStatusLabels[detailMemo.savedStage as MemoStatusValue] || detailMemo.savedStage}</BidiText>
                      </div>
                    )}
                  </div>
                )}
                {/* Phase-8 — paused banner. Renders at the top of the
                    details dialog so the reason / who / when is visible
                    without scrolling to the activity log. */}
                {isMemoPaused(detailMemo) && (
                  <div
                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                    data-testid="banner-memo-paused"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Pause className="w-4 h-4" />
                      هذه المذكرة معلّقة
                    </div>
                    {detailMemo.pauseReason && (
                      <div className="mt-1">
                        السبب: <BidiText>{detailMemo.pauseReason}</BidiText>
                      </div>
                    )}
                    <div className="mt-1 text-xs text-amber-700/80">
                      {detailMemo.pausedBy && (
                        <>بواسطة <BidiText>{getUserName(detailMemo.pausedBy)}</BidiText></>
                      )}
                      {detailMemo.pausedAt && (
                        <>
                          {detailMemo.pausedBy ? " — " : ""}
                          في <LtrInline>{new Date(detailMemo.pausedAt).toISOString().slice(0, 10)}</LtrInline>
                        </>
                      )}
                    </div>
                    {/* Auto-lift date. Absent = open-ended, stated explicitly so
                        the user never has to guess whether a date was set. */}
                    <div className="mt-1 text-xs font-medium">
                      {detailMemo.pauseUntil
                        ? <>ينتهي التعليق تلقائياً في: <LtrInline>{detailMemo.pauseUntil}</LtrInline></>
                        : <span className="text-amber-700/80">تعليق مفتوح — يستمر حتى يُلغى يدوياً</span>}
                    </div>
                  </div>
                )}
                {/* Phase-9.2 — cancellation banner. Reason is on the
                    memo row (cancellationReason); actor + timestamp
                    come from cancelInfo, populated from the latest
                    "cancelled" memo_activity_log entry. */}
                {detailMemo.status === MemoStatus.CANCELLED && (
                  <div
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    data-testid="banner-memo-cancelled"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Ban className="w-4 h-4" />
                      هذه المذكرة ملغاة
                    </div>
                    {detailMemo.cancellationReason && (
                      <div className="mt-1">
                        سبب الإلغاء: <BidiText>{detailMemo.cancellationReason}</BidiText>
                      </div>
                    )}
                    {(cancelInfo?.performedBy || cancelInfo?.performedAt) && (
                      <div className="mt-1 text-xs text-destructive/80">
                        {cancelInfo.performedBy && (
                          <>بواسطة <BidiText>{getUserName(cancelInfo.performedBy)}</BidiText></>
                        )}
                        {cancelInfo.performedAt && (
                          <>
                            {cancelInfo.performedBy ? " — " : ""}
                            في <LtrInline>{new Date(cancelInfo.performedAt).toISOString().slice(0, 10)}</LtrInline>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">النوع</p>
                    <Badge variant="outline" className="mt-1">
                      {detailMemo.memoType === "أخرى" ? (detailMemo.memoTypeOther || "أخرى") : MemoTypeLabels[detailMemo.memoType]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">القضية</p>
                    <p className="font-medium"><LtrInline>{getCaseNumber(detailMemo.caseId)}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">المحامي المكلف</p>
                    <p className="font-medium">{getUserName(detailMemo.assignedTo)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الموعد النهائي</p>
                    <div className={`font-medium ${getDeadlineColor(detailMemo.deadline)}`}>
                      <DualDateDisplay date={detailMemo.deadline} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">موعد الجلسة القادمة</p>
                    {detailMemoNextHearingDate ? (
                      <div className="font-medium">
                        <DualDateDisplay date={detailMemoNextHearingDate} />
                      </div>
                    ) : (
                      <p className="font-medium text-muted-foreground">لا توجد جلسة قادمة</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الأولوية</p>
                    <Badge className={`mt-1 ${getPriorityBadgeClass(detailMemo.priority)}`}>
                      {detailMemo.priority}
                    </Badge>
                  </div>
                  {/* Phase-9 — legacy status badge. Hidden once the memo
                      is on the new currentStage axis; the stages bar
                      below is the canonical state display. Cancellation
                      ("ملغاة") still surfaces here for cancelled memos
                      because cancellation leaves currentStage unchanged. */}
                  {(!detailMemo.currentStage || detailMemo.status === MemoStatus.CANCELLED) && (
                    <div>
                      <p className="text-sm text-muted-foreground">الحالة</p>
                      <Badge className={`mt-1 ${getStatusBadgeClass(detailMemo.status)}`}>
                        {MemoStatusLabels[detailMemo.status]}
                      </Badge>
                    </div>
                  )}
                  {detailMemo.returnCount > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">عدد الإرجاع</p>
                      <p className="font-medium text-orange-500">{detailMemo.returnCount}</p>
                    </div>
                  )}
                  {detailMemo.hearingId && getHearingById(detailMemo.hearingId)?.opponentResponseRequired && (
                    <div>
                      <p className="text-sm text-muted-foreground">رد الخصم</p>
                      <Badge variant="outline" className="mt-1 border-orange-500 text-orange-600 dark:text-orange-400">
                        مطلوب رد من الخصم
                      </Badge>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">أنشئت بواسطة</p>
                    <p className="font-medium">{getUserName(detailMemo.createdBy)}</p>
                  </div>
                </div>

                {/* Phase-9 — review-workflow stages bar. Hidden for legacy
                    memos that haven't been migrated yet (currentStage is
                    null until the backfill runs). */}
                {detailMemo.currentStage && (
                  <MemoStagesBar
                    currentStage={detailMemo.currentStage as MemoStageValue}
                  />
                )}

                {detailMemo.description && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">الوصف</p>
                    <p className="text-sm">{detailMemo.description}</p>
                  </div>
                )}

                {detailMemo.content && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">المحتوى</p>
                    <div className="border rounded-md p-3 text-sm whitespace-pre-wrap bg-muted/30">
                      {detailMemo.content}
                    </div>
                  </div>
                )}

                {detailMemo.isAutoGenerated && detailMemo.autoGenerateReason && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">سبب الإنشاء التلقائي</p>
                    <p className="text-sm">{detailMemo.autoGenerateReason}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {/* Phase-9 — review-workflow action buttons. Each opens
                      a dedicated dialog. Visibility is gated on the
                      memo's currentStage and the user's role. */}
                  {user && canDoMemoInternalReview(detailMemo, user.role, user.id) && (
                    <Button
                      data-testid={`button-internal-review-${detailMemo.id}`}
                      onClick={() => openInternalReviewDialog(detailMemo)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <ClipboardCheck className="w-4 h-4 ml-2" />
                      المراجعة الداخلية
                    </Button>
                  )}
                  {user && canDoMemoCommitteeDecision(detailMemo, user.role, getDepartmentName(cases.find((c) => c.id === detailMemo.caseId)?.departmentId || "") === "عمالي") && (
                    <Button
                      data-testid={`button-committee-decision-${detailMemo.id}`}
                      onClick={() => openCommitteeDialog(detailMemo)}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <CheckCircle className="w-4 h-4 ml-2" />
                      قرار اللجنة
                    </Button>
                  )}
                  {/* Reasoned override — "تجاوز لجنة المراجعة". A SECONDARY,
                      destructive-outline action so it can never be confused
                      with the purple "قرار اللجنة" button above: its actors are
                      NOT the committee chairs (branch_manager / parent-case
                      dept head / assigned lawyer), and it skips the committee
                      rather than recording its decision. The gate is the
                      server's rule verbatim → visibility == authorization. */}
                  {user && canSkipMemoCommittee(
                    detailMemo,
                    user.role,
                    user.id,
                    getMemoCase(detailMemo),
                    user.departmentId,
                  ) && (
                    <Button
                      variant="outline"
                      data-testid={`button-skip-committee-${detailMemo.id}`}
                      onClick={() => openSkipCommitteeDialog(detailMemo)}
                      disabled={submitting}
                      className="border-destructive/60 text-destructive hover:bg-destructive/10"
                    >
                      <AlertTriangle className="w-4 h-4 ml-2" />
                      تجاوز لجنة المراجعة
                    </Button>
                  )}
                  {user && canDoMemoTakeNotesOutcome(
                    detailMemo,
                    user.role,
                    user.id,
                    getMemoCase(detailMemo),
                    user.departmentId,
                  ) && (
                    <Button
                      data-testid={`button-take-notes-outcome-${detailMemo.id}`}
                      onClick={() => openTakeNotesDialog(detailMemo)}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <FileText className="w-4 h-4 ml-2" />
                      نتيجة الأخذ بالملاحظات
                    </Button>
                  )}
                  {/* Phase-9 — stage-driven linear-path advances + the
                      DRAFTING→INTERNAL_REVIEW send-to-review picker, now in the
                      shared <MemoAdvancePanel>. The branching transitions
                      (internal-review / committee / take-notes) live in the
                      dialog buttons above. busy/onBusyChange keep this page's
                      shared `submitting` in sync so sibling buttons disable
                      during an advance exactly as before. */}
                  <MemoAdvancePanel memo={detailMemo} busy={submitting} onBusyChange={setSubmitting} />

                  {/* Legacy MemoStatus stage-flow buttons. Hidden once
                      the memo is on the new currentStage axis. */}
                  {!detailMemo.currentStage && detailMemo.status === MemoStatus.NOT_STARTED && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-start-drafting"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.DRAFTING, { startedAt: new Date().toISOString() })}
                      disabled={submitting}
                    >
                      <Clock className="w-4 h-4 ml-2" />
                      بدء التحرير
                    </Button>
                  )}
                  {!detailMemo.currentStage && (detailMemo.status === MemoStatus.DRAFTING || detailMemo.status === MemoStatus.REVISION_REQUIRED) && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-send-review"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.IN_REVIEW, { completedAt: new Date().toISOString() })}
                      disabled={submitting}
                    >
                      <AlertTriangle className="w-4 h-4 ml-2" />
                      إرسال للمراجعة
                    </Button>
                  )}
                  {!detailMemo.currentStage && detailMemo.status === MemoStatus.APPROVED && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-submit-final"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.SUBMITTED, { submittedAt: new Date().toISOString() })}
                      disabled={submitting}
                      className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700"
                    >
                      <CheckCircle className="w-4 h-4 ml-2" />
                      رفع المذكرة
                    </Button>
                  )}

                  {/* "لا يحتاج مذكرة" — cancellation is orthogonal and
                      lives on legacy `status`. Available in both flows
                      EXCEPT when the new workflow has reached FILED
                      (terminal) — you can't cancel a filed memo. */}
                  {!["معتمدة", "مرفوعة", "ملغاة"].includes(detailMemo.status)
                    && detailMemo.currentStage !== MemoStage.FILED
                    && canCancelMemo(detailMemo) && (
                    <Button
                      data-testid="button-no-memo-needed-detail"
                      variant="outline"
                      onClick={() => openCancelMemoDialog(detailMemo)}
                      disabled={submitting}
                      className="text-muted-foreground hover:text-destructive hover:border-destructive"
                    >
                      <Ban className="w-4 h-4 ml-2" />
                      لا يحتاج مذكرة
                    </Button>
                  )}
                  {user && canDeleteMemos(user.role) && (
                    <Button
                      data-testid="button-delete-memo"
                      variant="destructive"
                      onClick={() => handleDelete(detailMemo)}
                      disabled={submitting}
                    >
                      <Trash2 className="w-4 h-4 ml-2" />
                      حذف
                    </Button>
                  )}
                </div>

                <div className="border rounded-md p-4 space-y-2">
                  <p className="font-medium text-sm mb-3">الجدول الزمني</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span className="text-muted-foreground">تاريخ الإنشاء:</span>
                      <DualDateDisplay date={detailMemo.createdAt} showTime />
                    </div>
                    {detailMemo.startedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-muted-foreground">بدء التحرير:</span>
                        <DualDateDisplay date={detailMemo.startedAt} showTime />
                      </div>
                    )}
                    {detailMemo.completedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                        <span className="text-muted-foreground">إرسال للمراجعة:</span>
                        <DualDateDisplay date={detailMemo.completedAt} showTime />
                      </div>
                    )}
                    {detailMemo.reviewedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span className="text-muted-foreground">تاريخ المراجعة:</span>
                        <DualDateDisplay date={detailMemo.reviewedAt} showTime />
                      </div>
                    )}
                    {detailMemo.submittedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-muted-foreground">تاريخ الرفع:</span>
                        <DualDateDisplay date={detailMemo.submittedAt} showTime />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Phase-8 — await-completion memo dialog. Reason required. */}
      <AlertDialog open={showAwaitMemoDialog} onOpenChange={(open) => { if (!open) closeAwaitMemoDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              بانتظار استكمال المرفقات والبيانات
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستُحفظ حالة المذكرة الحالية كلقطة، وتُوضع المذكرة بانتظار استكمال المرفقات والبيانات.
              عند اكتمال البيانات استخدم زر "تم الاستكمال" للعودة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>السبب <span className="text-red-500">*</span></Label>
            <Textarea
              data-testid="input-memo-await-reason"
              value={awaitMemoReason}
              onChange={(e) => setAwaitMemoReason(e.target.value)}
              placeholder="ما هي البيانات أو المرفقات الناقصة؟"
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeAwaitMemoDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-await-memo"
              onClick={handleAwaitMemo}
              disabled={pauseMemoInProgress || !awaitMemoReason.trim()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <AlertTriangle className="w-4 h-4 ml-2" />
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — resume memo dialog. Notes optional. */}
      <AlertDialog open={showResumeMemoDialog} onOpenChange={(open) => { if (!open) closeResumeMemoDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              تم الاستكمال
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستعود المذكرة من حالة الانتظار. الحالة الحالية للمذكرة لن تتغير.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              data-testid="input-memo-resume-notes"
              value={resumeMemoNotes}
              onChange={(e) => setResumeMemoNotes(e.target.value)}
              placeholder="اكتب ملاحظات حول ما تم استكماله..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeResumeMemoDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-resume-memo"
              onClick={handleResumeMemo}
              disabled={pauseMemoInProgress}
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              تأكيد العودة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-9.2 — "لا يحتاج مذكرة" cancellation dialog. Required
          reason; persisted on memos.cancellation_reason and emitted to
          memo_activity_log via POST /api/memos/:id/cancel. */}
      <AlertDialog open={!!cancelMemoTarget} onOpenChange={(open) => { if (!open) closeCancelMemoDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              لا يحتاج مذكرة
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستُلغى المذكرة (status=ملغاة) ولا يمكن التراجع عبر هذه الواجهة.
              السبب يُسجّل في سجل النشاط وفي بيانات المذكرة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>سبب عدم الحاجة للمذكرة <span className="text-red-500">*</span></Label>
            <Textarea
              data-testid="input-memo-cancel-reason"
              value={cancelMemoReason}
              onChange={(e) => setCancelMemoReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeCancelMemoDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-cancel-memo"
              onClick={handleConfirmCancelMemo}
              disabled={cancelMemoInProgress || !cancelMemoReason.trim()}
              className="bg-destructive hover:bg-destructive/90"
            >
              <Ban className="w-4 h-4 ml-2" />
              تأكيد الإلغاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — pause memo dialog */}
      <AlertDialog open={showPauseMemoDialog} onOpenChange={(open) => { if (!open) closePauseMemoDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Pause className="w-5 h-5 text-amber-600" />
              تعليق المذكرة
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إيقاف العمل على هذه المذكرة مؤقتاً. حالة المذكرة الحالية تبقى كما هي.
              يمكن استئنافها لاحقاً عبر "إلغاء التعليق".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>سبب التعليق <span className="text-red-500">*</span></Label>
            <Textarea
              data-testid="input-memo-pause-reason"
              value={pauseMemoReason}
              onChange={(e) => setPauseMemoReason(e.target.value)}
              placeholder="اكتب سبب التعليق..."
              rows={3}
            />
          </div>
          <PauseUntilField
            value={pauseMemoUntil}
            onChange={setPauseMemoUntil}
            testId="input-memo-pause-until"
          />
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closePauseMemoDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-pause-memo"
              onClick={handlePauseMemo}
              disabled={pauseMemoInProgress || !pauseMemoReason.trim() || !!pauseUntilError(pauseMemoUntil)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Pause className="w-4 h-4 ml-2" />
              تأكيد التعليق
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — unpause memo dialog */}
      <AlertDialog open={showUnpauseMemoDialog} onOpenChange={(open) => { if (!open) closeUnpauseMemoDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              إلغاء تعليق المذكرة
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستعود المذكرة للعمل عند نفس حالتها قبل التعليق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              data-testid="input-memo-unpause-notes"
              value={unpauseMemoNotes}
              onChange={(e) => setUnpauseMemoNotes(e.target.value)}
              placeholder="اكتب ملاحظات حول إلغاء التعليق..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeUnpauseMemoDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-unpause-memo"
              onClick={handleUnpauseMemo}
              disabled={pauseMemoInProgress}
            >
              <Play className="w-4 h-4 ml-2" />
              تأكيد إلغاء التعليق
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-9.1 send-to-internal-review dialog moved into the shared
          <MemoAdvancePanel> (rendered in the memo detail above). */}

      {/* Phase-9 — internal-review dialog. 2 outcomes: PASSED → COMMITTEE,
          NEEDS_NOTES → DRAFTING. */}
      <Dialog
        open={showInternalReviewDialog}
        onOpenChange={(open) => { if (!open) closeInternalReviewDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              المراجعة الداخلية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Phase-9.1 — show the designated reviewer so the current
                user can see whether they're the right person to act
                (the action buttons below are server-locked to that
                reviewer or branch_manager). */}
            {internalReviewMemo?.internalReviewerId && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm" data-testid="memo-internal-reviewer-name">
                <span className="text-muted-foreground">المراجع الداخلي المعين: </span>
                <strong>{getUserName(internalReviewMemo.internalReviewerId)}</strong>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              اختر نتيجة المراجعة. <strong>اعتماد</strong> ينقل المذكرة إلى لجنة المراجعة،
              و<strong>يوجد ملاحظات</strong> يعيدها إلى مرحلة التحرير.
            </p>
            <div>
              <Label>الملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-memo-internal-review-notes"
                value={internalReviewNotes}
                onChange={(e) => setInternalReviewNotes(e.target.value)}
                placeholder="ملاحظات المراجع الداخلي..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeInternalReviewDialog}
              data-testid="button-cancel-memo-internal-review"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-memo-internal-review-needs-notes"
              onClick={() => handleInternalReview(InternalReviewDecision.NEEDS_NOTES)}
              disabled={reviewActionInProgress}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              يوجد ملاحظات
            </Button>
            <Button
              data-testid="button-memo-internal-review-passed"
              onClick={() => handleInternalReview(InternalReviewDecision.PASSED)}
              disabled={reviewActionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase-9 — committee-decision dialog. 2 outcomes: APPROVED → READY,
          NEEDS_NOTES → TAKING_NOTES. */}
      <Dialog
        open={showCommitteeDialog}
        onOpenChange={(open) => { if (!open) closeCommitteeDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              قرار لجنة المراجعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>اعتماد</strong> ينقل المذكرة إلى مرحلة "جاهزة للرفع"،
              و<strong>يوجد ملاحظات</strong> ينقلها إلى "الأخذ بالملاحظات".
            </p>
            <div>
              <Label>ملاحظات اللجنة (اختياري)</Label>
              <Textarea
                data-testid="input-memo-committee-notes"
                value={committeeNotes}
                onChange={(e) => setCommitteeNotes(e.target.value)}
                placeholder="ملاحظات اللجنة للمحامي المسؤول..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeCommitteeDialog}
              data-testid="button-cancel-memo-committee"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-memo-committee-needs-notes"
              onClick={() => handleCommitteeDecision(CommitteeDecision.NEEDS_NOTES)}
              disabled={reviewActionInProgress}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              يوجد ملاحظات
            </Button>
            <Button
              data-testid="button-memo-committee-approved"
              onClick={() => handleCommitteeDecision(CommitteeDecision.APPROVED)}
              disabled={reviewActionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reasoned override — skip-committee dialog. Moves the memo straight to
          جاهزة_للرفع with NO committee decision; the reason is MANDATORY and is
          recorded (with the acting name) in the memo activity log. */}
      <Dialog
        open={showSkipCommitteeDialog}
        onOpenChange={(open) => { if (!open) closeSkipCommitteeDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              تجاوز مرحلة لجنة المراجعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم نقل المذكرة مباشرةً إلى <strong>جاهزة للرفع</strong> دون قرار من لجنة
              المراجعة. يُسجَّل هذا الإجراء في سجل نشاط المذكرة مع اسمك والسبب. السبب إلزامي.
            </p>
            <div>
              <Label>سبب التجاوز <span className="text-red-500">*</span></Label>
              <Textarea
                data-testid="input-memo-skip-committee-reason"
                value={skipCommitteeReason}
                onChange={(e) => setSkipCommitteeReason(e.target.value)}
                placeholder="سبب تجاوز لجنة المراجعة (إلزامي)..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeSkipCommitteeDialog}
              data-testid="button-cancel-memo-skip-committee"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-confirm-memo-skip-committee"
              onClick={handleSkipCommittee}
              disabled={reviewActionInProgress || !skipCommitteeReason.trim()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              تأكيد التجاوز
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase-9 — take-notes-outcome dialog. 3 outcomes (DONE / NOT_DONE
          / PARTIAL); all advance to READY per spec. The outcome is
          recorded for audit only, not used for routing. */}
      <Dialog
        open={showTakeNotesDialog}
        onOpenChange={(open) => { if (!open) closeTakeNotesDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              نتيجة الأخذ بالملاحظات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              اختر نتيجة معالجة ملاحظات اللجنة. تم/جزئياً/لم يتم تنقل المذكرة إلى
              "جاهزة للرفع". "إعادة للجنة المراجعة" ترجعها للجنة (تتطلب ملاحظات).
            </p>
            <div>
              <Label>الملاحظات (مطلوبة عند الإعادة للجنة)</Label>
              <Textarea
                data-testid="input-memo-take-notes-notes"
                value={takeNotesNotes}
                onChange={(e) => setTakeNotesNotes(e.target.value)}
                placeholder="ملاحظات حول معالجة ملاحظات اللجنة / ما تم تطبيقه أو سبب الإعادة..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeTakeNotesDialog}
              data-testid="button-cancel-memo-take-notes"
            >
              إلغاء
            </Button>
            <Button
              variant="outline"
              data-testid="button-memo-return-to-committee"
              onClick={handleReturnMemoToCommittee}
              disabled={reviewActionInProgress || !takeNotesNotes.trim()}
              className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
            >
              إعادة للجنة المراجعة
            </Button>
            <Button
              data-testid="button-memo-take-notes-not-done"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.NOT_DONE)}
              disabled={reviewActionInProgress}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              لم يتم
            </Button>
            <Button
              data-testid="button-memo-take-notes-partial"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.PARTIAL)}
              disabled={reviewActionInProgress}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              جزئياً
            </Button>
            <Button
              data-testid="button-memo-take-notes-done"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.DONE)}
              disabled={reviewActionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              تم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}