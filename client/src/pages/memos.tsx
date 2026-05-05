import { useState, useMemo, useEffect } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { getClientRoleLabel } from "@/lib/client-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ScrollText,
  Plus,
  Search,
  Eye,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  Zap,
  Ban,
  Check,
  ChevronsUpDown,
  UserCog,
  Pause,
  Play,
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
import { useCases } from "@/lib/cases-context";
import { useHearings } from "@/lib/hearings-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { useUsers } from "@/lib/users-context";
import { useClients } from "@/lib/clients-context";
import {
  MemoType,
  MemoTypeLabels,
  MemoStatus,
  MemoStatusLabels,
  MemoStage,
  MemoStageLabels,
  InternalReviewDecision,
  CommitteeDecision,
  NoteOutcome,
  Priority,
  canCreateMemos,
  canReviewMemos,
  canChangeMemoStatus,
  canDeleteMemos,
} from "@shared/schema";
import type {
  Memo, MemoTypeValue, MemoStatusValue, MemoStageValue,
  InternalReviewDecisionValue, CommitteeDecisionValue, NoteOutcomeValue,
} from "@shared/schema";
import { MemoStagesBar } from "@/components/memo-stages-bar";
import { ClipboardCheck, FileText } from "lucide-react";
import { differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import {
  MemosAdvancedFilters,
  EMPTY_MEMOS_ADV_FILTERS,
  countActiveMemosAdvFilters,
  NON_FINAL_MEMO_STATUSES,
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

function getDeadlineColor(deadline: string): string {
  const days = differenceInDays(new Date(deadline), new Date());
  if (days < 0) return "text-destructive font-bold";
  if (days < 3) return "text-orange-500 dark:text-orange-400 font-medium";
  return "text-muted-foreground";
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
  memoCase: { departmentId?: string | null } | null,
  userDeptId: string | null,
): boolean {
  if (!memoIsActionable(memo)) return false;
  if (memo.currentStage !== MemoStage.INTERNAL_REVIEW) return false;
  if (
    userRole === "department_head" &&
    memoCase &&
    memoCase.departmentId !== userDeptId
  ) {
    return false;
  }
  const baseRoles = ["employee", "department_head", "cases_review_head", "branch_manager"];
  if (baseRoles.includes(userRole)) return true;
  return !!memo.assignedTo && memo.assignedTo === userId;
}

function canDoMemoCommitteeDecision(
  memo: Memo,
  userRole: string,
): boolean {
  if (!memoIsActionable(memo)) return false;
  if (memo.currentStage !== MemoStage.COMMITTEE) return false;
  return userRole === "cases_review_head" || userRole === "branch_manager";
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
  const { departments } = useDepartments();
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
  const [submitting, setSubmitting] = useState(false);

  // Phase-8 — pause / unpause dialog state. Mirrors the consultations
  // and cases pages.
  const [showPauseMemoDialog, setShowPauseMemoDialog] = useState(false);
  const [pauseMemoTarget, setPauseMemoTarget] = useState<Memo | null>(null);
  const [pauseMemoReason, setPauseMemoReason] = useState("");
  const [showUnpauseMemoDialog, setShowUnpauseMemoDialog] = useState(false);
  const [unpauseMemoTarget, setUnpauseMemoTarget] = useState<Memo | null>(null);
  const [unpauseMemoNotes, setUnpauseMemoNotes] = useState("");
  const [pauseMemoInProgress, setPauseMemoInProgress] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [advFilters, setAdvFilters] = useState<AdvancedMemosFilters>(EMPTY_MEMOS_ADV_FILTERS);

  const [reviewNotes, setReviewNotes] = useState("");
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

  const handleApprove = async () => {
    if (!detailMemo || !user) return;
    await handleStatusChange(detailMemo, MemoStatus.APPROVED, {
      reviewNotes,
      reviewerId: user.id,
      reviewedAt: new Date().toISOString(),
    });
    setReviewNotes("");
  };

  const handleReturn = async () => {
    if (!detailMemo || !user) return;
    await handleStatusChange(detailMemo, MemoStatus.REVISION_REQUIRED, {
      reviewNotes,
      reviewerId: user.id,
      reviewedAt: new Date().toISOString(),
      returnCount: (detailMemo.returnCount || 0) + 1,
    });
    setReviewNotes("");
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

  const handleNoMemoNeeded = async (memo: Memo) => {
    setSubmitting(true);
    try {
      await changeStatus(memo.id, MemoStatus.CANCELLED, {
        reviewNotes: "لا يحتاج مذكرة",
      });
      const relatedCase = cases.find(c => c.id === memo.caseId);
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
      toast({ title: "تم إنهاء المذكرة - لا يحتاج مذكرة" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
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

  // Phase-8 — pause permission gate. Mirrors the server check on
  // /api/memos/:id/pause and /unpause: branch_manager / admin_support /
  // dept_head (own dept, resolved via parent case) / assigned lawyer.
  // Memos don't carry departmentId directly, so dept_head needs the
  // parent case lookup.
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

  const extractApiError = (err: unknown): string => {
    const msg = (err as any)?.message || "";
    // format from throwIfResNotOk: "400: {"error":"..."}"
    // No /s flag: target lib doesn't support it; the body is single-line.
    const match = /^(\d+):\s*([\s\S]+)$/.exec(msg);
    if (match) {
      try {
        const parsed = JSON.parse(match[2]);
        if (parsed?.error) return parsed.error;
      } catch {}
    }
    return msg || "حدث خطأ غير متوقع";
  };

  const openPauseMemoDialog = (memo: Memo) => {
    setPauseMemoTarget(memo);
    setPauseMemoReason("");
    setShowPauseMemoDialog(true);
  };
  const closePauseMemoDialog = () => {
    setShowPauseMemoDialog(false);
    setPauseMemoTarget(null);
    setPauseMemoReason("");
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
    setPauseMemoInProgress(true);
    try {
      await apiRequest("POST", `/api/memos/${pauseMemoTarget.id}/pause`, { reason });
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

  // Resolve a memo's parent case so the role-gate helpers can scope
  // department_head correctly.
  const getMemoCase = (memo: Memo): { departmentId?: string | null } | null => {
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
    console.log("[clientRole][memos:list]", {
      caseNumber: c.caseNumber,
      caseClassification: classification,
      rawClientRole: (c as any).clientRole,
      rendered: clientRoleLabel,
    });
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
    return memos.filter((m) => {
      // Existing single-select filters (unchanged)
      if (filterStatus !== "all" && m.status !== filterStatus) return false;
      const relatedCase = cases.find(c => c.id === m.caseId);
      if (filterDept !== "all" && !(relatedCase && relatedCase.departmentId === filterDept)) return false;
      if (filterPriority !== "all" && m.priority !== filterPriority) return false;
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
      if (advFilters.statuses.length && !advFilters.statuses.includes(m.status)) return false;
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
        if (!NON_FINAL_MEMO_STATUSES.has(m.status)) return false;
      }
      if (advFilters.autoGeneratedOnly && !m.isAutoGenerated) return false;
      return true;
    });
  }, [memos, cases, filterStatus, filterDept, filterPriority, searchQuery, advFilters]);

  const MEMO_PAGE_SIZE = 15;
  const [memoPage, setMemoPage] = useState(1);
  useEffect(() => { setMemoPage(1); }, [filterStatus, filterDept, filterPriority, searchQuery, advFilters]);
  const memoTotalPages = Math.max(1, Math.ceil(filteredMemos.length / MEMO_PAGE_SIZE));
  const pagedMemos = filteredMemos.slice((memoPage - 1) * MEMO_PAGE_SIZE, memoPage * MEMO_PAGE_SIZE);

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
          {user && canCreateMemos(user.role) && (
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
                <SelectItem value="all">جميع الحالات</SelectItem>
                {Object.entries(MemoStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
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
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-priority">
                <SelectValue placeholder="الأولوية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="عاجل">عاجل</SelectItem>
                <SelectItem value="عالي">عالي</SelectItem>
                <SelectItem value="متوسط">متوسط</SelectItem>
                <SelectItem value="منخفض">منخفض</SelectItem>
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
                    <TableHead className="text-center">العنوان</TableHead>
                    <TableHead className="text-center">العميل</TableHead>
                    <TableHead className="text-center">الخصم</TableHead>
                    <TableHead className="text-center">صفة العميل</TableHead>
                    <TableHead className="text-center">المحامي المكلف</TableHead>
                    <TableHead className="text-center">الموعد النهائي</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">الأولوية</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedMemos
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((memo) => {
                      const caseDetails = getCaseDetails(memo.caseId);
                      const relatedCaseForRow = cases.find((c) => c.id === memo.caseId);
                      return (
                      <TableRow key={memo.id} data-testid={`row-memo-${memo.id}`}>
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
                            <Badge className={getStatusBadgeClass(memo.status)}>
                              {MemoStatusLabels[memo.status]}
                            </Badge>
                            {/* Phase-8 — paused indicator. Distinct amber badge
                                so it reads as orthogonal to memo status. */}
                            {isMemoPaused(memo) && (
                              <Badge
                                variant="outline"
                                className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                                data-testid={`badge-memo-paused-${memo.id}`}
                                title={memo.pauseReason || "معلّق"}
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
                                title="بانتظار استكمال البيانات"
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
                          <Badge className={getPriorityBadgeClass(memo.priority)}>
                            {memo.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-view-memo-${memo.id}`}
                              onClick={() => {
                                setDetailMemoId(memo.id);
                                setReviewNotes("");
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {user?.role === "department_head" && !["معتمدة", "مرفوعة", "ملغاة"].includes(memo.status) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="إسناد لمحامي"
                                data-testid={`button-reassign-memo-${memo.id}`}
                                onClick={() => openReassignMemoDialog(memo)}
                              >
                                <UserCog className="w-4 h-4" />
                              </Button>
                            )}
                            {!["معتمدة", "مرفوعة", "ملغاة"].includes(memo.status) && canUserChangeStatus(memo) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-no-memo-needed-${memo.id}`}
                                onClick={() => handleNoMemoNeeded(memo)}
                                title="لا يحتاج مذكرة"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
                            )}
                            {/* Phase-8 — await-completion / resume action.
                                Mirrors the pause/unpause pair. Hidden when
                                paused (server requires unpause first) and
                                when in a terminal status. */}
                            {!isMemoPaused(memo) && memo.awaitingCompletion
                              ? canPauseMemo(memo) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-green-600 hover:text-green-700"
                                    title="تم الاستكمال"
                                    data-testid={`button-resume-memo-${memo.id}`}
                                    onClick={() => openResumeMemoDialog(memo)}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                )
                              : !isMemoPaused(memo)
                                && !TERMINAL_MEMO_STATUSES.has(memo.status)
                                && canPauseMemo(memo) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-amber-600 hover:text-amber-700"
                                    title="بانتظار استكمال البيانات"
                                    data-testid={`button-await-memo-${memo.id}`}
                                    onClick={() => openAwaitMemoDialog(memo)}
                                  >
                                    <AlertTriangle className="w-4 h-4" />
                                  </Button>
                                )}
                            {/* Phase-8 — pause / unpause action. Pause shown
                                when not paused, not in a terminal status, and
                                user has permission. Unpause replaces it
                                (Play icon) when paused. */}
                            {isMemoPaused(memo)
                              ? canPauseMemo(memo) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title="إلغاء التعليق"
                                    data-testid={`button-unpause-memo-${memo.id}`}
                                    onClick={() => openUnpauseMemoDialog(memo)}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )
                              : !TERMINAL_MEMO_STATUSES.has(memo.status) && canPauseMemo(memo) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-amber-600 hover:text-amber-700"
                                    title="تعليق المذكرة"
                                    data-testid={`button-pause-memo-${memo.id}`}
                                    onClick={() => openPauseMemoDialog(memo)}
                                  >
                                    <Pause className="w-4 h-4" />
                                  </Button>
                                )}
                          </div>
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
                        {cases
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
                      هذه المذكرة بانتظار استكمال البيانات
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
                    <p className="text-sm text-muted-foreground">الأولوية</p>
                    <Badge className={`mt-1 ${getPriorityBadgeClass(detailMemo.priority)}`}>
                      {detailMemo.priority}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الحالة</p>
                    <Badge className={`mt-1 ${getStatusBadgeClass(detailMemo.status)}`}>
                      {MemoStatusLabels[detailMemo.status]}
                    </Badge>
                  </div>
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

                {(detailMemo.status === MemoStatus.IN_REVIEW ||
                  detailMemo.status === MemoStatus.APPROVED ||
                  detailMemo.status === MemoStatus.REVISION_REQUIRED ||
                  detailMemo.status === MemoStatus.SUBMITTED) && (
                  <div className="border rounded-md p-4 space-y-3">
                    <p className="font-medium text-sm">المراجعة</p>
                    {detailMemo.reviewNotes && (
                      <div>
                        <p className="text-sm text-muted-foreground">ملاحظات المراجعة</p>
                        <p className="text-sm mt-1">{detailMemo.reviewNotes}</p>
                      </div>
                    )}
                    {detailMemo.reviewerId && (
                      <div>
                        <p className="text-sm text-muted-foreground">المراجع</p>
                        <p className="text-sm">{getUserName(detailMemo.reviewerId)}</p>
                      </div>
                    )}
                    {detailMemo.status === MemoStatus.IN_REVIEW && user && canReviewMemos(user.role) && (
                      <div className="space-y-3 pt-2 border-t">
                        <div>
                          <Label>ملاحظات المراجعة</Label>
                          <Textarea
                            data-testid="input-review-notes"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="أضف ملاحظاتك..."
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            data-testid="button-approve-memo"
                            variant="default"
                            onClick={handleApprove}
                            disabled={submitting}
                            className="bg-green-600 hover:bg-green-700 dark:bg-green-700"
                          >
                            {submitting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <CheckCircle className="w-4 h-4 ml-2" />}
                            اعتماد
                          </Button>
                          <Button
                            data-testid="button-return-memo"
                            variant="default"
                            onClick={handleReturn}
                            disabled={submitting}
                            className="bg-orange-500 hover:bg-orange-600 dark:bg-orange-600"
                          >
                            {submitting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <XCircle className="w-4 h-4 ml-2" />}
                            إعادة للتعديل
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {/* Phase-9 — review-workflow action buttons. Each opens
                      a dedicated dialog. Visibility is gated on the
                      memo's currentStage and the user's role. */}
                  {user && canDoMemoInternalReview(
                    detailMemo,
                    user.role,
                    user.id,
                    getMemoCase(detailMemo),
                    user.departmentId,
                  ) && (
                    <Button
                      data-testid={`button-internal-review-${detailMemo.id}`}
                      onClick={() => openInternalReviewDialog(detailMemo)}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <ClipboardCheck className="w-4 h-4 ml-2" />
                      المراجعة الداخلية
                    </Button>
                  )}
                  {user && canDoMemoCommitteeDecision(detailMemo, user.role) && (
                    <Button
                      data-testid={`button-committee-decision-${detailMemo.id}`}
                      onClick={() => openCommitteeDialog(detailMemo)}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <CheckCircle className="w-4 h-4 ml-2" />
                      قرار اللجنة
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
                  {detailMemo.status === MemoStatus.NOT_STARTED && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-start-drafting"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.DRAFTING, { startedAt: new Date().toISOString() })}
                      disabled={submitting}
                    >
                      <Clock className="w-4 h-4 ml-2" />
                      بدء التحرير
                    </Button>
                  )}
                  {(detailMemo.status === MemoStatus.DRAFTING || detailMemo.status === MemoStatus.REVISION_REQUIRED) && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-send-review"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.IN_REVIEW, { completedAt: new Date().toISOString() })}
                      disabled={submitting}
                    >
                      <AlertTriangle className="w-4 h-4 ml-2" />
                      إرسال للمراجعة
                    </Button>
                  )}
                  {detailMemo.status === MemoStatus.APPROVED && canUserChangeStatus(detailMemo) && (
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
                  {!["معتمدة", "مرفوعة", "ملغاة"].includes(detailMemo.status) && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-no-memo-needed-detail"
                      variant="outline"
                      onClick={() => handleNoMemoNeeded(detailMemo)}
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
              بانتظار استكمال البيانات
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستُحفظ حالة المذكرة الحالية كلقطة، وتُوضع المذكرة بانتظار استكمال البيانات.
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
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closePauseMemoDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-pause-memo"
              onClick={handlePauseMemo}
              disabled={pauseMemoInProgress || !pauseMemoReason.trim()}
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
              اختر نتيجة معالجة ملاحظات اللجنة. جميع النتائج تنقل المذكرة إلى
              "جاهزة للرفع"؛ النتيجة تُسجَّل للأرشيف فقط.
            </p>
            <div>
              <Label>الملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-memo-take-notes-notes"
                value={takeNotesNotes}
                onChange={(e) => setTakeNotesNotes(e.target.value)}
                placeholder="ملاحظات حول معالجة ملاحظات اللجنة..."
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