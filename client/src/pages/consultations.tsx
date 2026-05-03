import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MessageSquare, CheckCircle, FileText, ClipboardCheck, Bell, MoreHorizontal, UserPlus, ArrowLeftRight, Trash2, ChevronLeft, ChevronRight, FileSymlink, XCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConsultations } from "@/lib/consultations-context";
import { useFavorites } from "@/lib/favorites-context";
import { useClients } from "@/lib/clients-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import type {
  Consultation,
  ConsultationStageValue,
  CaseTypeValue,
  DeliveryTypeValue,
  InternalReviewDecisionValue,
  CommitteeDecisionValue,
  NoteOutcomeValue,
  ConsultationClosureReasonValue,
} from "@shared/schema";
import {
  ConsultationStage,
  ConsultationStageLabels,
  ConsultationStagesAll,
  ConsultationStagesOrder,
  InternalReviewDecision,
  CommitteeDecision,
  NoteOutcome,
  ConsultationClosureReason,
  CaseStage,
  CaseStageLabels,
  CaseStagesOrder,
  DeliveryType,
  Department,
} from "@shared/schema";
import { ConsultationStagesBar } from "@/components/consultation-stages-bar";
import {
  ConsultationsAdvancedFilters,
  EMPTY_CONSULTATIONS_FILTERS,
  type AdvancedConsultationsFilters,
} from "@/components/consultations-advanced-filters";
import { DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { sendConsultationReminder, requestConsultationTransfer } from "@/lib/notification-triggers";

// Lawyer-filter source: role-based exclusion. Wider than the
// canBeAssignedConsultations gate (used elsewhere on this page) because
// the filter must surface anyone who *has* consultations historically,
// not only those assignable going forward. Mirrors the cases-page
// LAWYER_FILTER_EXCLUDED_ROLES set.
const LAWYER_FILTER_EXCLUDED_ROLES = new Set([
  "branch_manager",
  "admin_support",
  "hr",
  "technical_support",
]);

// Per consultations-rebuild-spec.md §3.2.1 ALLOWED_CONSULTATION_TRANSITIONS.
// Only includes the linear forward steps that the generic /advance-stage
// endpoint serves. INTERNAL_REVIEW / COMMITTEE / TAKING_NOTES outcomes are
// decision-based and routed through the dedicated endpoints, so they're
// intentionally absent here — those dialogs land in subsequent commits.
const LINEAR_ADVANCE: Partial<Record<ConsultationStageValue, { target: ConsultationStageValue; roles: string[] }>> = {
  [ConsultationStage.RECEIVED]: { target: ConsultationStage.STUDY,           roles: ["admin_support", "department_head", "branch_manager"] },
  [ConsultationStage.STUDY]:    { target: ConsultationStage.DRAFTING,        roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ConsultationStage.DRAFTING]: { target: ConsultationStage.INTERNAL_REVIEW, roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ConsultationStage.READY]:    { target: ConsultationStage.COMPLETED,       roles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
};

function getAdvanceTarget(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): ConsultationStageValue | null {
  if (consultation.status !== "active") return null;
  const rule = LINEAR_ADVANCE[consultation.currentStage];
  if (!rule) return null;
  // Department head can only act inside their own department
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return null;
  const isAssignedLawyer = !!consultation.assignedTo && consultation.assignedTo === userId;
  const effectiveRoles = isAssignedLawyer ? [userRole, "assigned_lawyer"] : [userRole];
  if (!effectiveRoles.some(r => rule.roles.includes(r))) return null;
  return rule.target;
}

// Mirrors the consultation-rollback block in server/routes.ts
// validateStageTransition: dept_head / branch_manager → any prior stage,
// assigned_lawyer → one step back. Uses ConsultationStagesAll when the
// consultation is currently in TAKING_NOTES so the conditional stage is
// reachable for rollback; otherwise the linear order is sufficient.
function getReturnTargets(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): ConsultationStageValue[] {
  if (consultation.status !== "active") return [];
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return [];
  const stages = consultation.currentStage === ConsultationStage.TAKING_NOTES
    ? ConsultationStagesAll
    : ConsultationStagesOrder;
  const currentIdx = stages.indexOf(consultation.currentStage);
  if (currentIdx <= 0) return [];
  const isHeadOrManager = userRole === "department_head" || userRole === "branch_manager";
  if (isHeadOrManager) return stages.slice(0, currentIdx);
  const isAssignedLawyer = !!consultation.assignedTo && consultation.assignedTo === userId;
  if (isAssignedLawyer) return [stages[currentIdx - 1]];
  return [];
}

// Mirrors the role gate on POST /api/consultations/:id/internal-review.
// The endpoint accepts assigned_lawyer (synthetic) plus a base set of
// lawyer-class roles. Department head is additionally scoped to their
// own department here, which the endpoint also enforces via
// validateStageTransition.
function canDoInternalReview(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage !== ConsultationStage.INTERNAL_REVIEW) return false;
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return false;
  const baseRoles = ["employee", "department_head", "cases_review_head", "consultations_review_head", "branch_manager"];
  if (baseRoles.includes(userRole)) return true;
  return !!consultation.assignedTo && consultation.assignedTo === userId;
}

// Mirrors the role gate on POST /api/consultations/:id/committee-decision.
// Committee outcomes are restricted to the consultations review head and
// the branch manager — narrower than internal-review by design.
function canDoCommitteeDecision(
  consultation: Consultation,
  userRole: string,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage !== ConsultationStage.COMMITTEE) return false;
  return userRole === "consultations_review_head" || userRole === "branch_manager";
}

// Mirrors the role gate on POST /api/consultations/:id/take-notes-outcome.
// Recording the outcome is the assigned lawyer's job; dept_head and
// branch_manager can also record on their behalf. Dept-scope check
// applied for dept_head.
function canDoTakeNotesOutcome(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage !== ConsultationStage.TAKING_NOTES) return false;
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return false;
  if (userRole === "department_head" || userRole === "branch_manager") return true;
  return !!consultation.assignedTo && consultation.assignedTo === userId;
}

// Mirrors the role gate on POST /api/consultations/:id/convert-to-case.
// Per spec §3.2.3 / §3.2.4: admin_support, department_head, branch_manager.
// Dept_head additionally scoped to their own department here. The endpoint
// also rejects non-active or COMPLETED consultations; we mirror that here
// so the dropdown doesn't show a doomed action.
function canConvertToCase(
  consultation: Consultation,
  userRole: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage === ConsultationStage.COMPLETED) return false;
  if (userRole === "branch_manager" || userRole === "admin_support") return true;
  if (userRole === "department_head" && consultation.departmentId === userDeptId) return true;
  return false;
}

function extractApiError(err: unknown): string {
  const msg = (err as any)?.message || "";
  // format from throwIfResNotOk: "400: {"error":"..."}"
  const match = msg.match(/^\d+: (.+)$/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.error) return parsed.error;
    } catch {}
  }
  return msg || "حدث خطأ غير متوقع";
}

// Arabic display labels for ConsultationClosureReason. Schema keeps the
// enum values in English keys per spec §3.2.4 ("Frontend will localise
// the labels"), so the mapping lives here at the page boundary.
const ConsultationClosureReasonLabels: Record<ConsultationClosureReasonValue, string> = {
  client_cancelled:  "إلغاء العميل",
  answered_verbally: "تم الرد شفهياً",
  duplicate:         "استشارة مكررة",
  no_longer_needed:  "لم تعد مطلوبة",
  other:             "أخرى",
};

// Arabic display labels for the simplified active/converted/closed
// status enum. Schema entries are English keys post-rebuild; we localise
// at the page boundary the same way as ClosureReason.
const ConsultationStatusDisplayLabels: Record<"active" | "converted" | "closed", string> = {
  active:    "نشطة",
  converted: "محولة لقضية",
  closed:    "مقفلة",
};

// Per-stage badge colour palette, aligned with the cases page table:
// study/drafting/review/committee/notes/ready/closed slots match the
// case-side getStageColor so the two tables read consistently.
function getStageBadgeColor(stage: ConsultationStageValue): string {
  switch (stage) {
    case ConsultationStage.RECEIVED:
      return "bg-primary/20 text-primary border-primary/30";
    case ConsultationStage.STUDY:
      return "bg-accent/20 text-accent border-accent/30";
    case ConsultationStage.DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case ConsultationStage.INTERNAL_REVIEW:
      return "bg-indigo-500/20 text-indigo-600 border-indigo-500/30";
    case ConsultationStage.COMMITTEE:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case ConsultationStage.TAKING_NOTES:
      return "bg-destructive/20 text-destructive border-destructive/30";
    case ConsultationStage.READY:
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case ConsultationStage.COMPLETED:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Combined badge: derives label + colour from currentStage + status.
//   active     → live stage label + stage colour (drives the row's eye)
//   converted  → "محولة لقضية" + violet
//   closed     → "مقفلة" + muted
function getConsultationDisplayBadge(c: Consultation): { label: string; className: string } {
  if (c.status === "converted") {
    return {
      label: ConsultationStatusDisplayLabels.converted,
      className: "bg-violet-500/20 text-violet-600 border-violet-500/30",
    };
  }
  if (c.status === "closed") {
    return {
      label: ConsultationStatusDisplayLabels.closed,
      className: "bg-muted text-muted-foreground border-muted",
    };
  }
  return {
    label: ConsultationStageLabels[c.currentStage] || c.currentStage,
    className: getStageBadgeColor(c.currentStage),
  };
}

// Mirrors the role gate on POST /api/consultations/:id/early-close.
// Per spec §3.2.4: assigned_lawyer (synthetic), admin_support,
// department_head, branch_manager. Dept_head dept-scoped.
function canEarlyClose(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return false;
  if (userRole === "branch_manager" || userRole === "admin_support") return true;
  if (userRole === "department_head") return true;
  return !!consultation.assignedTo && consultation.assignedTo === userId;
}

export default function ConsultationsPage() {
  const {
    consultations,
    addConsultation,
    updateConsultation,
    deleteConsultation,
    refreshConsultations,
  } = useConsultations();
  const { clients, getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions, users } = useAuth();
  const { addRecentVisit } = useFavorites();
  const { toast } = useToast();
  const lawyers = users.filter(u => u.canBeAssignedConsultations);

  const [, setLocation] = useLocation();
  const [advFilters, setAdvFilters] = useState<AdvancedConsultationsFilters>(EMPTY_CONSULTATIONS_FILTERS);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Cross-module deep-link: /consultations?openConsultation=<id> opens the
  // detail dialog for that consultation. Used by the "أُنشئت من استشارة"
  // back-link on the cases-page detail dialog. Read once on mount; the
  // second effect below waits for the consultation to land in the loaded
  // list and then opens the dialog. Param is stripped from the URL so a
  // refresh doesn't re-open the same dialog.
  const [pendingOpenConsId, setPendingOpenConsId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("openConsultation");
    if (id) {
      setPendingOpenConsId(id);
      const url = new URL(window.location.href);
      url.searchParams.delete("openConsultation");
      window.history.replaceState({}, "", url);
    }
  }, []);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignConsultationId, setAssignConsultationId] = useState<string | null>(null);
  const [assignData, setAssignData] = useState({ lawyerId: "", departmentId: "" });

  const [actionInProgress, setActionInProgress] = useState(false);

  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [advanceConsultation, setAdvanceConsultation] = useState<Consultation | null>(null);

  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnConsultation, setReturnConsultation] = useState<Consultation | null>(null);
  const [returnTargetStage, setReturnTargetStage] = useState<string>("");

  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderConsultation, setReminderConsultation] = useState<Consultation | null>(null);
  const [reminderData, setReminderData] = useState({
    reminderType: "تذكير بتحديث الحالة",
    message: "",
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [consultationToDelete, setConsultationToDelete] = useState<Consultation | null>(null);

  const [showInternalReviewDialog, setShowInternalReviewDialog] = useState(false);
  const [internalReviewConsultation, setInternalReviewConsultation] = useState<Consultation | null>(null);
  const [internalReviewNotes, setInternalReviewNotes] = useState("");

  const [showCommitteeDialog, setShowCommitteeDialog] = useState(false);
  const [committeeConsultation, setCommitteeConsultation] = useState<Consultation | null>(null);
  const [committeeNotes, setCommitteeNotes] = useState("");

  const [showTakeNotesDialog, setShowTakeNotesDialog] = useState(false);
  const [takeNotesConsultation, setTakeNotesConsultation] = useState<Consultation | null>(null);
  const [takeNotesNotes, setTakeNotesNotes] = useState("");

  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertConsultation, setConvertConsultation] = useState<Consultation | null>(null);
  const [convertData, setConvertData] = useState<{ targetCaseStage: string; caseDepartmentId: string }>({
    targetCaseStage: CaseStage.RECEPTION,
    caseDepartmentId: "",
  });

  const [showEarlyCloseDialog, setShowEarlyCloseDialog] = useState(false);
  const [earlyCloseConsultation, setEarlyCloseConsultation] = useState<Consultation | null>(null);
  const [earlyCloseReason, setEarlyCloseReason] = useState<ConsultationClosureReasonValue | "">("");
  const [earlyCloseOtherText, setEarlyCloseOtherText] = useState("");
  const [earlyCloseNotes, setEarlyCloseNotes] = useState("");

  const openReminderDialog = (c: Consultation) => {
    setReminderConsultation(c);
    setReminderData({ reminderType: "تذكير بتحديث الحالة", message: "" });
    setShowReminderDialog(true);
  };

  const handleSendReminder = async () => {
    if (!reminderConsultation || !reminderConsultation.assignedTo) {
      toast({ title: "لا يوجد محامي مسؤول لهذه الاستشارة", variant: "destructive" });
      return;
    }
    const msg = reminderData.message || `${reminderData.reminderType} للاستشارة رقم ${reminderConsultation.consultationNumber}`;
    try {
      await sendConsultationReminder(reminderConsultation.id, reminderConsultation.consultationNumber, reminderConsultation.assignedTo, reminderData.reminderType, msg);
      toast({ title: "تم إرسال التذكير بنجاح" });
    } catch {
      toast({ title: "فشل إرسال التذكير", variant: "destructive" });
    }
    setShowReminderDialog(false);
    setReminderConsultation(null);
  };

  const openInternalReviewDialog = (c: Consultation) => {
    setInternalReviewConsultation(c);
    setInternalReviewNotes("");
    setShowInternalReviewDialog(true);
  };

  const closeInternalReviewDialog = () => {
    setShowInternalReviewDialog(false);
    setInternalReviewConsultation(null);
    setInternalReviewNotes("");
  };

  const handleInternalReview = async (decision: InternalReviewDecisionValue) => {
    if (!internalReviewConsultation) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${internalReviewConsultation.id}/internal-review`, {
        decision,
        notes: internalReviewNotes,
      });
      await refreshConsultations();
      const msg = decision === InternalReviewDecision.PASSED
        ? "تمت المراجعة الداخلية — أُحيلت للجنة"
        : "تم تسجيل ملاحظات المراجعة الداخلية";
      toast({ title: msg });
      closeInternalReviewDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل المراجعة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openCommitteeDialog = (c: Consultation) => {
    setCommitteeConsultation(c);
    setCommitteeNotes("");
    setShowCommitteeDialog(true);
  };

  const closeCommitteeDialog = () => {
    setShowCommitteeDialog(false);
    setCommitteeConsultation(null);
    setCommitteeNotes("");
  };

  const handleCommitteeDecision = async (decision: CommitteeDecisionValue) => {
    if (!committeeConsultation) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${committeeConsultation.id}/committee-decision`, {
        decision,
        notes: committeeNotes,
      });
      await refreshConsultations();
      const msg = decision === CommitteeDecision.APPROVED
        ? "تم اعتماد الاستشارة — جاهزة للتسليم"
        : "تم إرسال الاستشارة للأخذ بالملاحظات";
      toast({ title: msg });
      closeCommitteeDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل قرار اللجنة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openTakeNotesDialog = (c: Consultation) => {
    setTakeNotesConsultation(c);
    setTakeNotesNotes("");
    setShowTakeNotesDialog(true);
  };

  const closeTakeNotesDialog = () => {
    setShowTakeNotesDialog(false);
    setTakeNotesConsultation(null);
    setTakeNotesNotes("");
  };

  const handleTakeNotesOutcome = async (outcome: NoteOutcomeValue) => {
    if (!takeNotesConsultation) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${takeNotesConsultation.id}/take-notes-outcome`, {
        outcome,
        notes: takeNotesNotes,
      });
      await refreshConsultations();
      // All outcomes advance to READY per spec — outcome distinction
      // is recorded but not reflected in routing.
      toast({ title: "تم تسجيل النتيجة — الاستشارة جاهزة للتسليم" });
      closeTakeNotesDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل النتيجة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openConvertDialog = (c: Consultation) => {
    setConvertConsultation(c);
    setConvertData({
      targetCaseStage: CaseStage.RECEPTION,
      caseDepartmentId: c.departmentId || "",
    });
    setShowConvertDialog(true);
  };

  const closeConvertDialog = () => {
    setShowConvertDialog(false);
    setConvertConsultation(null);
    setConvertData({ targetCaseStage: CaseStage.RECEPTION, caseDepartmentId: "" });
  };

  const handleConvertToCase = async () => {
    if (!convertConsultation) return;
    // Client-side body validation per spec: targetCaseStage and
    // caseDepartmentId are both required by the endpoint.
    if (!convertData.targetCaseStage) {
      toast({ title: "اختر مرحلة بداية القضية", variant: "destructive" });
      return;
    }
    if (!convertData.caseDepartmentId) {
      toast({ title: "اختر قسم القضية", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${convertConsultation.id}/convert-to-case`, {
        targetCaseStage: convertData.targetCaseStage,
        caseDepartmentId: convertData.caseDepartmentId,
      });
      await refreshConsultations();
      toast({
        title: "تم تحويل الاستشارة لقضية",
        description: "تم إنشاء القضية وتحديث حالة الاستشارة إلى \"محولة\".",
      });
      closeConvertDialog();
    } catch (err) {
      toast({ title: "فشل تحويل الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openEarlyCloseDialog = (c: Consultation) => {
    setEarlyCloseConsultation(c);
    setEarlyCloseReason("");
    setEarlyCloseOtherText("");
    setEarlyCloseNotes("");
    setShowEarlyCloseDialog(true);
  };

  const closeEarlyCloseDialog = () => {
    setShowEarlyCloseDialog(false);
    setEarlyCloseConsultation(null);
    setEarlyCloseReason("");
    setEarlyCloseOtherText("");
    setEarlyCloseNotes("");
  };

  const handleEarlyClose = async () => {
    if (!earlyCloseConsultation) return;
    // Client-side body validation. The endpoint also enforces:
    //   - reason ∈ ConsultationClosureReason values
    //   - otherText non-empty when reason === OTHER
    if (!earlyCloseReason) {
      toast({ title: "اختر سبب الإغلاق", variant: "destructive" });
      return;
    }
    if (earlyCloseReason === ConsultationClosureReason.OTHER && !earlyCloseOtherText.trim()) {
      toast({ title: "يجب توضيح سبب الإغلاق عند اختيار 'أخرى'", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      // The endpoint reads { reason, otherText? } only — `notes` is sent
      // for forward compatibility but currently ignored server-side
      // (the consultations table has no closure_notes column yet). A
      // follow-up commit can add the column + read it on the route.
      await apiRequest("POST", `/api/consultations/${earlyCloseConsultation.id}/early-close`, {
        reason: earlyCloseReason,
        otherText: earlyCloseReason === ConsultationClosureReason.OTHER
          ? earlyCloseOtherText.trim()
          : undefined,
        notes: earlyCloseNotes.trim() || undefined,
      });
      await refreshConsultations();
      toast({ title: "تم إغلاق الاستشارة" });
      closeEarlyCloseDialog();
    } catch (err) {
      toast({ title: "فشل إغلاق الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const consultationLawyers = users.filter(u => u.canBeAssignedConsultations);
  const isDeptHead = user?.role === "department_head";

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferConsultationId, setTransferConsultationId] = useState<string | null>(null);
  const [transferData, setTransferData] = useState({ toDepartmentId: "", reason: "" });

  // Aligns with the /api/consultations/:id/assign endpoint role gate
  // (admin_support, department_head, branch_manager) per §3.2.1. Admin
  // support and branch manager are global; dept_head is scoped to their
  // own department.
  const canAssignConsultation = (c: Consultation) => {
    if (c.status !== "active" || c.currentStage !== ConsultationStage.RECEIVED) return false;
    if (user?.role === "branch_manager" || user?.role === "admin_support") return true;
    if (user?.role === "department_head" && c.departmentId === user?.departmentId) return true;
    return false;
  };

  const openAssignDialog = (c: Consultation) => {
    setAssignConsultationId(c.id);
    setAssignData({ lawyerId: "", departmentId: isDeptHead ? (user?.departmentId || "") : (c.departmentId || "") });
    setShowAssignDialog(true);
  };

  const openTransferDialog = (c: Consultation) => {
    setTransferConsultationId(c.id);
    setTransferData({ toDepartmentId: "", reason: "" });
    setShowTransferDialog(true);
  };

  const handleTransferRequest = async () => {
    const consultation = consultations.find(c => c.id === transferConsultationId);
    if (!consultation || !transferData.toDepartmentId || !transferData.reason.trim()) return;
    const fromDeptName = getDepartmentName(consultation.departmentId || user?.departmentId || "");
    const toDeptName = getDepartmentName(transferData.toDepartmentId);
    try {
      await requestConsultationTransfer(
        consultation.id, consultation.consultationNumber,
        fromDeptName, transferData.toDepartmentId, toDeptName,
        transferData.reason,
      );
      toast({ title: "تم إرسال طلب التحويل بنجاح", description: "سيتم إشعارك عند الموافقة أو الرفض" });
    } catch {
      toast({ title: "فشل إرسال طلب التحويل", variant: "destructive" });
    }
    setShowTransferDialog(false);
    setTransferConsultationId(null);
  };

  const handleAssignConsultation = async () => {
    if (!assignConsultationId || !assignData.lawyerId) return;
    setActionInProgress(true);
    try {
      // The /assign endpoint sets assignedTo and, when currentStage is
      // RECEIVED, advances to STUDY in the same write. departmentId is
      // already set on the consultation; the dept dropdown above is only
      // used here to filter the lawyer list.
      await apiRequest("POST", `/api/consultations/${assignConsultationId}/assign`, {
        assignedTo: assignData.lawyerId,
      });
      await refreshConsultations();
      toast({ title: "تم إسناد الاستشارة بنجاح" });
      setShowAssignDialog(false);
      setAssignConsultationId(null);
      setAssignData({ lawyerId: "", departmentId: "" });
    } catch (err) {
      toast({ title: "فشل إسناد الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openAdvanceDialog = (c: Consultation) => {
    setAdvanceConsultation(c);
    setShowAdvanceDialog(true);
  };

  const handleAdvanceStage = async () => {
    if (!advanceConsultation || !user) return;
    const target = getAdvanceTarget(advanceConsultation, user.role, user.id, user.departmentId);
    if (!target) {
      toast({ title: "لا يمكن نقل الاستشارة", description: "ليس لديك صلاحية لهذا الانتقال", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${advanceConsultation.id}/advance-stage`, {
        targetStage: target,
      });
      await refreshConsultations();
      toast({ title: "تم نقل الاستشارة للمرحلة التالية" });
      setShowAdvanceDialog(false);
      setAdvanceConsultation(null);
    } catch (err) {
      toast({ title: "فشل نقل الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openReturnDialog = (c: Consultation) => {
    setReturnConsultation(c);
    const targets = user
      ? getReturnTargets(c, user.role, user.id, user.departmentId)
      : [];
    // Default to the immediately prior stage when available — that's the
    // only choice an assigned_lawyer will see, and a sensible default for
    // dept_head / branch_manager too.
    setReturnTargetStage(targets.length > 0 ? targets[targets.length - 1] : "");
    setShowReturnDialog(true);
  };

  const handleReturnStage = async () => {
    if (!returnConsultation || !returnTargetStage) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${returnConsultation.id}/return-stage`, {
        targetStage: returnTargetStage,
      });
      await refreshConsultations();
      toast({ title: "تم إرجاع الاستشارة للمرحلة السابقة" });
      setShowReturnDialog(false);
      setReturnConsultation(null);
      setReturnTargetStage("");
    } catch (err) {
      toast({ title: "فشل إرجاع الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDeleteConsultation = async () => {
    if (!consultationToDelete) return;
    try {
      await deleteConsultation(consultationToDelete.id);
      toast({ title: "تم حذف الاستشارة بنجاح" });
    } catch (error) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف الاستشارة" });
    }
    setShowDeleteDialog(false);
    setConsultationToDelete(null);
  };

  const [formData, setFormData] = useState({
    clientId: "",
    consultationType: "عام" as CaseTypeValue,
    deliveryType: "مكتوبة" as DeliveryTypeValue,
    departmentId: "",
    questionSummary: "",
  });

  const resetForm = () => {
    setFormData({
      clientId: "",
      consultationType: "عام",
      deliveryType: "مكتوبة",
      departmentId: "",
      questionSummary: "",
    });
  };

  const handleAddConsultation = () => {
    if (!user || !formData.clientId || !formData.questionSummary) return;
    addConsultation(formData, user.id);
    setIsAddDialogOpen(false);
    resetForm();
  };

  // Resolve the pending deep-link open once the consultation arrives in
  // the loaded list. Done in an effect rather than directly so that
  // navigating to /consultations?openConsultation=<id> on a cold tab
  // (consultations not yet fetched) still works.
  useEffect(() => {
    if (!pendingOpenConsId) return;
    const c = consultations.find((x) => x.id === pendingOpenConsId);
    if (c) {
      setSelectedConsultation(c);
      addRecentVisit(
        "consultation",
        c.id,
        `استشارة #${c.id.slice(0, 6)} - ${getClientName(c.clientId)}`,
      );
      setPendingOpenConsId(null);
    }
  }, [pendingOpenConsId, consultations, addRecentVisit, getClientName]);

  const filterLawyers = users.filter(u => !LAWYER_FILTER_EXCLUDED_ROLES.has(u.role));

  const filteredConsultations = consultations.filter((consultation) => {
    const q = advFilters.search.trim().toLowerCase();
    if (q) {
      const clientName = getClientName(consultation.clientId);
      const haystack = [
        consultation.consultationNumber,
        consultation.questionSummary,
        clientName,
        consultation.consultationType,
      ].map((s) => (s || "").toLowerCase());
      if (!haystack.some((h) => h.includes(q))) return false;
    }
    if (advFilters.status !== "all" && consultation.status !== advFilters.status) return false;
    if (advFilters.departmentId && consultation.departmentId !== advFilters.departmentId) return false;
    if (advFilters.stages.length > 0 && !advFilters.stages.includes(consultation.currentStage)) return false;
    if (advFilters.lawyers.length > 0) {
      const assignedTo = consultation.assignedTo;
      if (!assignedTo || !advFilters.lawyers.includes(assignedTo)) return false;
    }
    // Priority is forward-compat: the consultations table doesn't carry
    // a priority column yet (per shared/schema.ts §consultations table).
    // When a priority filter is active and the consultation has no
    // priority field, exclude it — that's the conservative interpretation
    // ("if you ask for high-priority consultations, don't surface ones
    // whose priority is unknown"). This becomes naturally functional once
    // the schema gains the column.
    if (advFilters.priorities.length > 0) {
      const p = (consultation as any).priority as string | undefined;
      if (!p || !advFilters.priorities.includes(p)) return false;
    }
    if (advFilters.dateFrom || advFilters.dateTo) {
      const created = consultation.createdAt ? new Date(consultation.createdAt).getTime() : NaN;
      if (Number.isNaN(created)) return false;
      if (advFilters.dateFrom) {
        const from = new Date(advFilters.dateFrom).getTime();
        if (!Number.isNaN(from) && created < from) return false;
      }
      if (advFilters.dateTo) {
        // Inclusive upper bound: bump to end-of-day so a same-day
        // createdAt timestamp matches.
        const toBase = new Date(advFilters.dateTo).getTime();
        if (!Number.isNaN(toBase)) {
          const toEnd = toBase + 24 * 60 * 60 * 1000 - 1;
          if (created > toEnd) return false;
        }
      }
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة الاستشارات</h1>
          <p className="text-muted-foreground">متابعة الاستشارات القانونية</p>
        </div>
        {permissions.canAddCasesAndConsultations && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-consultation" onClick={resetForm}>
                <Plus className="w-4 h-4 ml-2" />
                استشارة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>إضافة استشارة جديدة</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>العميل</Label>
                  <ClientAutocomplete
                    value={formData.clientId}
                    onChange={(clientId) => setFormData({ ...formData, clientId })}
                  />
                </div>
                <div>
                  <Label>نوع الاستشارة</Label>
                  <Input
                    data-testid="input-consultation-type"
                    value={formData.consultationType}
                    onChange={(e) => setFormData({ ...formData, consultationType: e.target.value as CaseTypeValue })}
                    placeholder="أدخل نوع الاستشارة..."
                  />
                </div>
                <div>
                  <Label>طريقة التسليم</Label>
                  <Select
                    value={formData.deliveryType}
                    onValueChange={(value: DeliveryTypeValue) =>
                      setFormData({ ...formData, deliveryType: value })
                    }
                  >
                    <SelectTrigger data-testid="select-delivery-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="مكتوبة">مكتوبة</SelectItem>
                      <SelectItem value="شفهية">شفهية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>القسم</Label>
                  <Select
                    value={formData.departmentId}
                    onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                  >
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="اختر القسم" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ملخص السؤال</Label>
                  <Textarea
                    data-testid="input-question-summary"
                    value={formData.questionSummary}
                    onChange={(e) => setFormData({ ...formData, questionSummary: e.target.value })}
                    placeholder="اكتب ملخص الاستشارة المطلوبة..."
                    rows={4}
                  />
                </div>
              </div>
              <Button
                data-testid="button-submit-consultation"
                onClick={handleAddConsultation}
                className="w-full"
                disabled={!formData.clientId || !formData.questionSummary}
              >
                إضافة الاستشارة
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <ConsultationsAdvancedFilters
              filters={advFilters}
              onChange={setAdvFilters}
              departments={departments.map((d) => ({ id: String(d.id), name: d.name }))}
              lawyers={filterLawyers.map((l) => ({ id: l.id, name: l.name }))}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم الاستشارة</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">القسم</TableHead>
                <TableHead className="text-right">التسليم</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConsultations.map((consultation) => (
                <TableRow key={consultation.id} data-testid={`row-consultation-${consultation.id}`}>
                  <TableCell className="font-medium">
                    <LtrInline>{consultation.consultationNumber}</LtrInline>
                  </TableCell>
                  <TableCell>
                    <BidiText>{getClientName(consultation.clientId)}</BidiText>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{consultation.consultationType}</Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const b = getConsultationDisplayBadge(consultation);
                      return <Badge className={b.className}>{b.label}</Badge>;
                    })()}
                  </TableCell>
                  <TableCell>{getDepartmentName(consultation.departmentId)}</TableCell>
                  <TableCell>
                    <Badge variant={consultation.deliveryType === "مكتوبة" ? "secondary" : "outline"}>
                      {consultation.deliveryType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-view-consultation-${consultation.id}`}
                        onClick={() => {
                          setSelectedConsultation(consultation);
                          addRecentVisit("consultation", consultation.id, `استشارة #${consultation.id.slice(0, 6)} - ${getClientName(consultation.clientId)}`);
                        }}
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-actions-${consultation.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canAssignConsultation(consultation) && (
                            <DropdownMenuItem data-testid={`button-assign-consultation-${consultation.id}`} onClick={() => openAssignDialog(consultation)}>
                              <UserPlus className="w-4 h-4 ml-2" />
                              إسناد الاستشارة
                            </DropdownMenuItem>
                          )}
                          {user && getAdvanceTarget(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-advance-consultation-${consultation.id}`}
                              onClick={() => openAdvanceDialog(consultation)}
                            >
                              <ChevronLeft className="w-4 h-4 ml-2" />
                              المرحلة التالية
                            </DropdownMenuItem>
                          )}
                          {user && getReturnTargets(consultation, user.role, user.id, user.departmentId).length > 0 && (
                            <DropdownMenuItem
                              data-testid={`button-return-consultation-${consultation.id}`}
                              onClick={() => openReturnDialog(consultation)}
                            >
                              <ChevronRight className="w-4 h-4 ml-2" />
                              المرحلة السابقة
                            </DropdownMenuItem>
                          )}
                          {user && canDoInternalReview(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-internal-review-${consultation.id}`}
                              onClick={() => openInternalReviewDialog(consultation)}
                            >
                              <ClipboardCheck className="w-4 h-4 ml-2" />
                              المراجعة الداخلية
                            </DropdownMenuItem>
                          )}
                          {user && canDoCommitteeDecision(consultation, user.role) && (
                            <DropdownMenuItem
                              data-testid={`button-committee-decision-${consultation.id}`}
                              onClick={() => openCommitteeDialog(consultation)}
                            >
                              <CheckCircle className="w-4 h-4 ml-2" />
                              قرار اللجنة
                            </DropdownMenuItem>
                          )}
                          {user && canDoTakeNotesOutcome(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-take-notes-outcome-${consultation.id}`}
                              onClick={() => openTakeNotesDialog(consultation)}
                            >
                              <FileText className="w-4 h-4 ml-2" />
                              تسجيل نتيجة الأخذ بالملاحظات
                            </DropdownMenuItem>
                          )}
                          {user && canConvertToCase(consultation, user.role, user.departmentId) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`button-convert-to-case-${consultation.id}`}
                                onClick={() => openConvertDialog(consultation)}
                              >
                                <FileSymlink className="w-4 h-4 ml-2" />
                                تحويل لقضية
                              </DropdownMenuItem>
                            </>
                          )}
                          {user && canEarlyClose(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-early-close-${consultation.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={() => openEarlyCloseDialog(consultation)}
                            >
                              <XCircle className="w-4 h-4 ml-2" />
                              إغلاق مبكر
                            </DropdownMenuItem>
                          )}
                          {isDeptHead && consultation.departmentId === user?.departmentId && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem data-testid={`button-transfer-${consultation.id}`} onClick={() => openTransferDialog(consultation)}>
                                <ArrowLeftRight className="w-4 h-4 ml-2" />
                                طلب تحويل لقسم آخر
                              </DropdownMenuItem>
                            </>
                          )}
                          {permissions.canSendReminders && consultation.assignedTo && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem data-testid={`button-reminder-${consultation.id}`} onClick={() => openReminderDialog(consultation)}>
                                <Bell className="w-4 h-4 ml-2 text-accent" />
                                إرسال تذكير
                              </DropdownMenuItem>
                            </>
                          )}
                          {user?.role === "branch_manager" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`button-delete-consultation-${consultation.id}`}
                                className="text-destructive focus:text-destructive"
                                onClick={() => { setConsultationToDelete(consultation); setShowDeleteDialog(true); }}
                              >
                                <Trash2 className="w-4 h-4 ml-2" />
                                حذف الاستشارة
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedConsultation} onOpenChange={(open) => !open && setSelectedConsultation(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>تفاصيل الاستشارة</span>
              <LtrInline>{selectedConsultation?.consultationNumber}</LtrInline>
            </DialogTitle>
          </DialogHeader>
          {selectedConsultation && (
            <div className="space-y-4">
              {selectedConsultation.status === "converted" && selectedConsultation.convertedToCaseId && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary hover-elevate rounded px-2 py-1 -mx-2"
                  onClick={() => setLocation(`/cases?openCase=${selectedConsultation.convertedToCaseId}`)}
                  data-testid="link-go-to-converted-case"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  اذهب للقضية
                </button>
              )}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-4 text-center">مراحل الاستشارة</h4>
                <ConsultationStagesBar currentStage={selectedConsultation.currentStage} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">العميل</Label>
                  <p className="font-medium">
                    <BidiText>{getClientName(selectedConsultation.clientId)}</BidiText>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">النوع</Label>
                  <p>{selectedConsultation.consultationType}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">طريقة التسليم</Label>
                  <p>{selectedConsultation.deliveryType}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">ملخص السؤال</Label>
                <p className="p-3 bg-muted rounded-md">{selectedConsultation.questionSummary}</p>
              </div>
              {selectedConsultation.response && (
                <div>
                  <Label className="text-muted-foreground">الرد</Label>
                  <p className="p-3 bg-muted rounded-md">{selectedConsultation.response}</p>
                </div>
              )}
              {selectedConsultation.reviewNotes && (
                <div>
                  <Label className="text-muted-foreground">ملاحظات المراجعة</Label>
                  <p className="p-3 bg-destructive/10 text-destructive rounded-md">
                    {selectedConsultation.reviewNotes}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showReminderDialog} onOpenChange={setShowReminderDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-accent" />
              إرسال تذكير
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
            <Button onClick={handleSendReminder} data-testid="button-send-reminder">
              <Bell className="w-4 h-4 ml-2" />
              إرسال التذكير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              إسناد الاستشارة
            </DialogTitle>
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
                  onValueChange={(value) => setAssignData({ ...assignData, departmentId: value, lawyerId: "" })}
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
                onValueChange={(value) => setAssignData({ ...assignData, lawyerId: value })}
              >
                <SelectTrigger data-testid="select-assign-lawyer">
                  <SelectValue placeholder="اختر المحامي" />
                </SelectTrigger>
                <SelectContent>
                  {consultationLawyers
                    .filter(l => !assignData.departmentId || l.departmentId === assignData.departmentId)
                    .map((lawyer) => (
                      <SelectItem key={lawyer.id} value={lawyer.id}>{lawyer.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)} data-testid="button-cancel-assign">
              إلغاء
            </Button>
            <Button
              onClick={handleAssignConsultation}
              disabled={!assignData.lawyerId || actionInProgress}
              data-testid="button-confirm-assign"
            >
              <UserPlus className="w-4 h-4 ml-2" />
              إسناد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showAdvanceDialog} onOpenChange={(open) => { if (!open) { setShowAdvanceDialog(false); setAdvanceConsultation(null); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>نقل الاستشارة للمرحلة التالية</AlertDialogTitle>
            <AlertDialogDescription>
              {advanceConsultation && user ? (
                (() => {
                  const target = getAdvanceTarget(advanceConsultation, user.role, user.id, user.departmentId);
                  const fromLabel = ConsultationStageLabels[advanceConsultation.currentStage] || advanceConsultation.currentStage;
                  const toLabel = target ? (ConsultationStageLabels[target] || target) : "";
                  return (
                    <>
                      سيتم نقل الاستشارة من <strong>{fromLabel}</strong> إلى <strong>{toLabel}</strong>.
                    </>
                  );
                })()
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-advance">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAdvanceStage}
              disabled={actionInProgress}
              data-testid="button-confirm-advance"
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReturnDialog} onOpenChange={(open) => { if (!open) { setShowReturnDialog(false); setReturnConsultation(null); setReturnTargetStage(""); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إرجاع الاستشارة لمرحلة سابقة</AlertDialogTitle>
            <AlertDialogDescription>
              {returnConsultation && user ? (() => {
                const targets = getReturnTargets(returnConsultation, user.role, user.id, user.departmentId);
                if (targets.length === 1) {
                  const lbl = ConsultationStageLabels[targets[0]] || targets[0];
                  return (
                    <>
                      يمكنك إرجاع الاستشارة إلى المرحلة السابقة فقط: <strong>{lbl}</strong>.
                    </>
                  );
                }
                return <>اختر المرحلة التي تريد إرجاع الاستشارة إليها.</>;
              })() : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {returnConsultation && user && (() => {
            const targets = getReturnTargets(returnConsultation, user.role, user.id, user.departmentId);
            if (targets.length <= 1) return null;
            return (
              <div className="mt-3 space-y-1" dir="rtl">
                <Label className="text-sm font-semibold">المرحلة المستهدفة <span className="text-red-500">*</span></Label>
                <Select value={returnTargetStage} onValueChange={setReturnTargetStage}>
                  <SelectTrigger data-testid="select-return-target-stage">
                    <SelectValue placeholder="اختر المرحلة" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {ConsultationStageLabels[stage] || stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-return">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReturnStage}
              disabled={actionInProgress || !returnTargetStage}
              data-testid="button-confirm-return"
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" />
              طلب تحويل الاستشارة لقسم آخر
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
              اختر نتيجة المراجعة. <strong>تم</strong> ينقل الاستشارة إلى لجنة المراجعة،
              و<strong>يوجد ملاحظات</strong> أو <strong>تم إعادة التقديم</strong> يعيدانها إلى مرحلة التحرير.
            </p>
            <div>
              <Label>الملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-internal-review-notes"
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
              data-testid="button-cancel-internal-review"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-internal-review-resubmitted"
              onClick={() => handleInternalReview(InternalReviewDecision.RESUBMITTED)}
              disabled={actionInProgress}
              variant="outline"
            >
              تم إعادة التقديم
            </Button>
            <Button
              data-testid="button-internal-review-needs-notes"
              onClick={() => handleInternalReview(InternalReviewDecision.NEEDS_NOTES)}
              disabled={actionInProgress}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              يوجد ملاحظات
            </Button>
            <Button
              data-testid="button-internal-review-passed"
              onClick={() => handleInternalReview(InternalReviewDecision.PASSED)}
              disabled={actionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              تم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <strong>اعتماد</strong> ينقل الاستشارة إلى مرحلة "جاهزة للتسليم"،
              و<strong>يوجد ملاحظات</strong> ينقلها إلى "الأخذ بالملاحظات".
            </p>
            <div>
              <Label>ملاحظات اللجنة (اختياري)</Label>
              <Textarea
                data-testid="input-committee-notes"
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
              data-testid="button-cancel-committee"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-committee-needs-notes"
              onClick={() => handleCommitteeDecision(CommitteeDecision.NEEDS_NOTES)}
              disabled={actionInProgress}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              يوجد ملاحظات
            </Button>
            <Button
              data-testid="button-committee-approved"
              onClick={() => handleCommitteeDecision(CommitteeDecision.APPROVED)}
              disabled={actionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              اختر نتيجة معالجة ملاحظات اللجنة. جميع النتائج تنقل الاستشارة إلى
              "جاهزة للتسليم"؛ النتيجة تُسجَّل للأرشيف فقط.
            </p>
            <div>
              <Label>الملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-take-notes-notes"
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
              data-testid="button-cancel-take-notes"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-take-notes-not-done"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.NOT_DONE)}
              disabled={actionInProgress}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              لم يتم
            </Button>
            <Button
              data-testid="button-take-notes-partial"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.PARTIAL)}
              disabled={actionInProgress}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              جزئياً
            </Button>
            <Button
              data-testid="button-take-notes-done"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.DONE)}
              disabled={actionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              تم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showConvertDialog}
        onOpenChange={(open) => { if (!open) closeConvertDialog(); }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSymlink className="w-5 h-5" />
              تحويل الاستشارة لقضية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم إنشاء قضية جديدة مرتبطة بهذه الاستشارة. حالة الاستشارة ستصبح
              <strong> "محولة" </strong>
              ولن يمكن التراجع. اختر مرحلة بداية القضية والقسم.
            </p>
            <div>
              <Label>مرحلة بداية القضية <span className="text-red-500">*</span></Label>
              <Select
                value={convertData.targetCaseStage}
                onValueChange={(value) => setConvertData({ ...convertData, targetCaseStage: value })}
              >
                <SelectTrigger data-testid="select-target-case-stage">
                  <SelectValue placeholder="اختر المرحلة" />
                </SelectTrigger>
                <SelectContent>
                  {CaseStagesOrder.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {CaseStageLabels[stage] || stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>قسم القضية <span className="text-red-500">*</span></Label>
              <Select
                value={convertData.caseDepartmentId}
                onValueChange={(value) => setConvertData({ ...convertData, caseDepartmentId: value })}
              >
                <SelectTrigger data-testid="select-case-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                      {convertConsultation && dept.id === convertConsultation.departmentId
                        ? " (افتراضي)"
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                الافتراضي هو قسم الاستشارة. يمكنك اختيار قسم مختلف للقضية الجديدة.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeConvertDialog}
              data-testid="button-cancel-convert"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleConvertToCase}
              disabled={
                actionInProgress ||
                !convertData.targetCaseStage ||
                !convertData.caseDepartmentId
              }
              data-testid="button-confirm-convert"
            >
              <FileSymlink className="w-4 h-4 ml-2" />
              تحويل لقضية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEarlyCloseDialog}
        onOpenChange={(open) => { if (!open) closeEarlyCloseDialog(); }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              إغلاق الاستشارة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم إقفال الاستشارة وتعطيل جميع إجراءات سير العمل. هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div>
              <Label>سبب الإغلاق <span className="text-red-500">*</span></Label>
              <Select
                value={earlyCloseReason}
                onValueChange={(v) => setEarlyCloseReason(v as ConsultationClosureReasonValue)}
              >
                <SelectTrigger data-testid="select-closure-reason">
                  <SelectValue placeholder="اختر سبب الإغلاق" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.values(ConsultationClosureReason) as ConsultationClosureReasonValue[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ConsultationClosureReasonLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {earlyCloseReason === ConsultationClosureReason.OTHER && (
              <div>
                <Label>توضيح السبب <span className="text-red-500">*</span></Label>
                <Textarea
                  data-testid="input-closure-reason-other"
                  value={earlyCloseOtherText}
                  onChange={(e) => setEarlyCloseOtherText(e.target.value)}
                  placeholder="اكتب سبب الإغلاق..."
                  rows={3}
                />
              </div>
            )}
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-closure-notes"
                value={earlyCloseNotes}
                onChange={(e) => setEarlyCloseNotes(e.target.value)}
                placeholder="ملاحظات إضافية للأرشيف..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeEarlyCloseDialog}
              data-testid="button-cancel-early-close"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleEarlyClose}
              disabled={
                actionInProgress ||
                !earlyCloseReason ||
                (earlyCloseReason === ConsultationClosureReason.OTHER && !earlyCloseOtherText.trim())
              }
              data-testid="button-confirm-early-close"
            >
              <XCircle className="w-4 h-4 ml-2" />
              تأكيد الإغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذه الاستشارة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الاستشارة بشكل نهائي. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-consultation"
              onClick={handleDeleteConsultation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
