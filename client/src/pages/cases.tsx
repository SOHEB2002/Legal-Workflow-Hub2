import { useState, useMemo, useEffect, useCallback } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { CaseActivityTab, CaseNotesTab, CaseDeadlinesTab } from "@/components/case-tabs";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import { formatTimeAmPm } from "@/lib/date-utils";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import {
  Plus,
  Search,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Archive,
  UserPlus,
  ClipboardCheck,
  Bell,
  Paperclip,
  Trash2,
  ExternalLink,
  Shield,
  Swords,
  FileText,
  AlertTriangle,
  ArrowLeftRight,
  Info,
  Pencil,
  Scale,
  Check,
  X,
  MessageSquare,
} from "lucide-react";
import { useFavorites } from "@/lib/favorites-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { 
  CaseStageLabels,
  CaseStagesOrder,
  CaseStage,
  Priority,
  Department,
  CaseClassification,
  CaseClassificationLabels,
  getStageLabel,
} from "@shared/schema";
import type { LawCase, CaseStageValue, CaseTypeValue, PriorityType, Attachment, CaseClassificationValue } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { sendCaseReminder, notifyCaseSentToReview, requestCaseTransfer } from "@/lib/notification-triggers";
import { CaseProgressBar } from "@/components/case-progress-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHearings } from "@/lib/hearings-context";
import { useMemos } from "@/lib/memos-context";
import { useFieldTasks } from "@/lib/field-tasks-context";
import { useStandards } from "@/lib/standards-context";
import { ReviewChecklist } from "@/components/review-checklist";

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

function getPriorityColor(priority: PriorityType) {
  switch (priority) {
    case Priority.URGENT:
      return "bg-destructive text-destructive-foreground";
    case Priority.HIGH:
      return "bg-orange-500 text-white";
    case Priority.MEDIUM:
      return "bg-yellow-500 text-white";
    case Priority.LOW:
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function CasesPage() {
  const {
    cases,
    isLoading: casesLoading,
    comments,
    addCase,
    updateCase,
    assignCase,
    sendToReviewCommittee,
    approveCase,
    rejectCase,
    closeCase,
    deleteCase,
    moveToNextStage,
    moveToPreviousStage,
    skipDataCompletion,
    addComment,
    fetchComments,
    getCommentsByCaseId,
    getCaseById,
    refreshCases,
  } = useCases();
  const { clients, getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions, users } = useAuth();
  const { getHearingsByCase } = useHearings();
  const { getMemosByCase } = useMemos();
  const { getTasksByCase } = useFieldTasks();
  const { addRecentVisit } = useFavorites();
  const { getStandardsByType } = useStandards();
  const lawyers = users.filter(u => u.canBeAssignedCases);
  const contractReviewStandards = getStandardsByType("contract_review");
  
  const getLawyerName = (id: string | null): string => {
    if (!id) return "-";
    const lawyer = lawyers.find(l => l.id === id);
    return lawyer?.name || "-";
  };
  const { toast } = useToast();

  const extractApiError = (err: unknown): string => {
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
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s === "pending_review") setStatusFilter(CaseStage.REVIEW_COMMITTEE);
    else if (s === "ready") setStatusFilter(CaseStage.READY_TO_SUBMIT);
  }, []);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [classificationGroup, setClassificationGroup] = useState<"" | "study" | "registered">("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const selectedCase = selectedCaseId ? getCaseById(selectedCaseId) || null : null;
  const [rejectNotes, setRejectNotes] = useState("");
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState("info");
  const [caseAttachments, setCaseAttachments] = useState<Attachment[]>([]);
  const [attachmentForm, setAttachmentForm] = useState({ fileName: "", fileUrl: "" });
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);

  const fetchAttachments = async (caseId: string) => {
    setIsLoadingAttachments(true);
    try {
      const res = await fetch(`/api/attachments/case/${caseId}`);
      if (res.ok) {
        const data = await res.json();
        setCaseAttachments(data);
      }
    } catch (e) {
      // attachment fetch failed silently
    } finally {
      setIsLoadingAttachments(false);
    }
  };

  const addAttachment = async () => {
    if (!selectedCase || !user || !attachmentForm.fileName.trim() || !attachmentForm.fileUrl.trim()) return;
    try {
      await apiRequest("POST", "/api/attachments", {
        entityType: "case",
        entityId: selectedCase.id,
        fileName: attachmentForm.fileName.trim(),
        fileUrl: attachmentForm.fileUrl.trim(),
        uploadedBy: user.id,
      });
      setAttachmentForm({ fileName: "", fileUrl: "" });
      fetchAttachments(selectedCase.id);
      toast({ title: "تم إضافة المرفق بنجاح" });
    } catch (e) {
      toast({ title: "فشل إضافة المرفق", variant: "destructive" });
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!selectedCase) return;
    try {
      await apiRequest("DELETE", `/api/attachments/${attachmentId}`);
      fetchAttachments(selectedCase.id);
      toast({ title: "تم حذف المرفق" });
    } catch (e) {
      toast({ title: "فشل حذف المرفق", variant: "destructive" });
    }
  };

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
  const [stageTransitioning, setStageTransitioning] = useState(false);
  const [showEarlyCloseDialog, setShowEarlyCloseDialog] = useState(false);
  const [earlyCloseCase, setEarlyCloseCase] = useState<any>(null);
  const [earlyCloseReason, setEarlyCloseReason] = useState("");
  const [earlyCloseReasonOther, setEarlyCloseReasonOther] = useState("");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editCaseId, setEditCaseId] = useState<string | null>(null);
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
    judgeName: "",
    circuitNumber: "",
    opponentName: "",
    opponentLawyer: "",
    opponentPhone: "",
    opponentNotes: "",
    caseClassification: "" as CaseClassificationValue | "",
    previousHearingsCount: 0,
    currentSituation: "",
    responseDeadline: "",
    adminCaseSubType: "" as string,
    prescriptionDate: "",
  });

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
      judgeName: caseItem.judgeName || "",
      circuitNumber: caseItem.circuitNumber || "",
      opponentName: caseItem.opponentName || "",
      opponentLawyer: caseItem.opponentLawyer || "",
      opponentPhone: caseItem.opponentPhone || "",
      opponentNotes: caseItem.opponentNotes || "",
      caseClassification: (caseItem.caseClassification || "") as CaseClassificationValue | "",
      previousHearingsCount: caseItem.previousHearingsCount || 0,
      currentSituation: caseItem.currentSituation || "",
      responseDeadline: caseItem.responseDeadline || "",
      adminCaseSubType: caseItem.adminCaseSubType || "",
      prescriptionDate: caseItem.prescriptionDate || "",
    });
    setShowEditDialog(true);
  };

  const handleEditCase = async () => {
    if (!editCaseId) return;
    try {
      await updateCase(editCaseId, {
        clientId: editFormData.clientId,
        plaintiffName: editFormData.plaintiffName,
        caseType: editFormData.caseType,
        caseTypeOther: editFormData.caseTypeOther,
        departmentId: editFormData.departmentId,
        departmentOther: editFormData.departmentOther,
        priority: editFormData.priority,
        courtName: editFormData.courtName,
        courtCaseNumber: editFormData.courtCaseNumber,
        judgeName: editFormData.judgeName,
        circuitNumber: editFormData.circuitNumber,
        opponentName: editFormData.opponentName,
        opponentLawyer: editFormData.opponentLawyer,
        opponentPhone: editFormData.opponentPhone,
        opponentNotes: editFormData.opponentNotes,
        caseClassification: editFormData.caseClassification as CaseClassificationValue,
        previousHearingsCount: editFormData.previousHearingsCount,
        currentSituation: editFormData.currentSituation,
        responseDeadline: editFormData.responseDeadline || null,
        adminCaseSubType: editFormData.adminCaseSubType || null,
        prescriptionDate: editFormData.prescriptionDate || null,
      } as any);
      toast({ title: "تم تحديث بيانات القضية بنجاح" });
      setShowEditDialog(false);
      setEditCaseId(null);
    } catch (error) {
      toast({ title: "حدث خطأ أثناء تحديث القضية", variant: "destructive" });
    }
  };

  const [classificationFilter, setClassificationFilter] = useState<string>("all");
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
    previousHearingsCount: 0,
    currentSituation: "",
    responseDeadline: "",
    nextHearingDate: "",
    nextHearingTime: "",
    adminCaseSubType: "" as string,
    prescriptionDate: "",
    memoRequired: false,
  });

  const [assignData, setAssignData] = useState({
    lawyerId: "",
    departmentId: "",
  });
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>("");
  const [registrationDialogType, setRegistrationDialogType] = useState<"" | "taradi" | "mohr">("");
  const [registrationNumberInput, setRegistrationNumberInput] = useState("");
  const [showCourtRegistrationDialog, setShowCourtRegistrationDialog] = useState(false);
  const [courtRegistrationCaseId, setCourtRegistrationCaseId] = useState<string | null>(null);
  const [courtCaseNumberInput, setCourtCaseNumberInput] = useState("");

  const resetForm = () => {
    setFormData({
      clientId: "",
      plaintiffName: "",
      caseType: "",
      caseTypeOther: "",
      departmentId: "",
      departmentOther: "",
      priority: "متوسط",
      courtName: "",
      courtCaseNumber: "",
      opponentName: "",
      caseClassification: "",
      previousHearingsCount: 0,
      currentSituation: "",
      responseDeadline: "",
      nextHearingDate: "",
      nextHearingTime: "",
      adminCaseSubType: "",
      prescriptionDate: "",
      memoRequired: false,
    });
  };

  const handleAddCase = async () => {
    if (!user) return;
    if (!formData.caseClassification) {
      toast({ title: "يرجى اختيار تصنيف القضية", variant: "destructive" });
      return;
    }
    
    const isPlaintiffNew = formData.caseClassification === CaseClassification.CASE_NEW;
    if (isPlaintiffNew && formData.caseType === "إداري") {
      if (!formData.adminCaseSubType) {
        toast({ title: "يرجى تحديد نوع القضية الإدارية (تظلم / قضية)", variant: "destructive" });
        return;
      }
      if (!formData.prescriptionDate) {
        toast({ title: "يرجى تحديد تاريخ التقادم", variant: "destructive" });
        return;
      }
    }
    await addCase({
      clientId: formData.clientId || "",
      plaintiffName: formData.plaintiffName || "",
      caseType: formData.caseType,
      caseTypeOther: formData.caseTypeOther,
      departmentId: formData.departmentId,
      departmentOther: formData.departmentOther,
      priority: formData.priority,
      courtName: isPlaintiffNew ? "" : formData.courtName,
      courtCaseNumber: formData.courtCaseNumber,
      opponentName: formData.opponentName,
      caseClassification: formData.caseClassification as CaseClassificationValue,
      previousHearingsCount: formData.previousHearingsCount,
      currentSituation: formData.currentSituation,
      responseDeadline: formData.responseDeadline || null,
      nextHearingDate: isPlaintiffNew ? null : (formData.nextHearingDate || null),
      nextHearingTime: isPlaintiffNew ? null : (formData.nextHearingTime || null),
      adminCaseSubType: formData.adminCaseSubType || null,
      prescriptionDate: formData.prescriptionDate || null,
      memoRequired: formData.memoRequired,
    } as any, user.id, user.name);
    
    const classLabel = CaseClassificationLabels[formData.caseClassification as CaseClassificationValue] || "";
    toast({ title: `تم إضافة القضية بنجاح (${classLabel})` });
    setShowAddDialog(false);
    resetForm();
  };

  const handleAssign = () => {
    if (!selectedCase || !assignData.lawyerId || !assignData.departmentId) return;
    
    const isReassign = !!selectedCase.primaryLawyerId;
    assignCase(selectedCase.id, assignData.lawyerId, assignData.departmentId);
    toast({ title: isReassign ? "تم تعديل الإسناد بنجاح" : "تم إسناد القضية بنجاح" });
    setShowAssignDialog(false);
    setSelectedCaseId(null);
    setAssignData({ lawyerId: "", departmentId: "" });
  };

  const handleSendToReview = (caseItem: LawCase) => {
    sendToReviewCommittee(caseItem.id);
    toast({ title: "تم إرسال القضية للمراجعة" });
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

  const handleClose = (caseItem: LawCase) => {
    closeCase(caseItem.id);
    toast({ title: "تم إغلاق القضية" });
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

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const clientName = c.clientId ? getClientName(c.clientId) : "";
      const matchesSearch =
        c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.courtCaseNumber && c.courtCaseNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (clientName && clientName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "all" || c.currentStage === statusFilter;
      const matchesDept = deptFilter === "all" || c.departmentId === deptFilter;
      const matchesClassification = classificationFilter === "all" ||
        c.caseClassification === classificationFilter;
      return matchesSearch && matchesStatus && matchesDept && matchesClassification;
    });
  }, [cases, searchQuery, statusFilter, deptFilter, classificationFilter, getClientName]);

  const PAGE_SIZE = 15;
  const [casePage, setCasePage] = useState(1);
  useEffect(() => { setCasePage(1); }, [searchQuery, statusFilter, deptFilter, classificationFilter]);
  const casesTotalPages = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE));
  const pagedCases = filteredCases.slice((casePage - 1) * PAGE_SIZE, casePage * PAGE_SIZE);

  const isDeptHead = user?.role === "department_head";

  const openAssignDialog = (caseItem: LawCase) => {
    setSelectedCaseId(caseItem.id);
    setAssignData({ 
      lawyerId: caseItem.primaryLawyerId || "", 
      departmentId: isDeptHead ? (String(user?.departmentId || "")) : (String(caseItem.departmentId || ""))
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
    const fromDeptName = getDepartmentName(caseItem.departmentId || user?.departmentId || "");
    const toDeptName = getDepartmentName(transferData.toDepartmentId);
    try {
      await requestCaseTransfer(
        caseItem.id, caseItem.caseNumber,
        fromDeptName, transferData.toDepartmentId, toDeptName,
        transferData.reason,
      );
      toast({ title: "تم إرسال طلب التحويل بنجاح", description: "سيتم إشعارك عند الموافقة أو الرفض" });
    } catch {
      toast({ title: "فشل إرسال طلب التحويل", variant: "destructive" });
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
    fetchAttachments(caseItem.id);
    fetchComments(caseItem.id);
    addRecentVisit("case", caseItem.id, `${caseItem.caseNumber} - ${getClientName(caseItem.clientId)}`);
  };

  const openReviewDialog = (caseItem: LawCase) => {
    setSelectedCaseId(caseItem.id);
    setShowReviewDialog(true);
  };

  const openReminderDialog = (caseItem: LawCase) => {
    setReminderCaseId(caseItem.id);
    const defaultRecipient = caseItem.responsibleLawyerId || caseItem.primaryLawyerId || "";
    setReminderData({ reminderType: "تذكير بتحديث الحالة", message: "", recipientId: defaultRecipient });
    setShowReminderDialog(true);
  };

  const reminderCase = reminderCaseId ? getCaseById(reminderCaseId) : null;
  const reminderHasDefaultRecipient = !!(reminderCase?.responsibleLawyerId || reminderCase?.primaryLawyerId);
  const reminderDeptLawyers = reminderCase
    ? users.filter(u => u.canBeAssignedCases && u.departmentId === reminderCase.departmentId && u.id !== (reminderCase.responsibleLawyerId || reminderCase.primaryLawyerId))
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
     (permissions.canAssignInDepartment && c.departmentId === user?.departmentId));

  const canSendToReview = (c: LawCase) => 
    permissions.canManageDepartment && 
    (c.currentStage === CaseStage.STUDY || c.currentStage === CaseStage.DRAFTING || c.currentStage === CaseStage.TAKING_NOTES);

  const canReview = (c: LawCase) => 
    permissions.canReviewCases && 
    c.currentStage === CaseStage.REVIEW_COMMITTEE;

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
        {permissions.canAddCasesAndConsultations && (
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المراحل</SelectItem>
                {CaseStagesOrder.map((stage) => (
                  <SelectItem key={stage} value={stage}>{CaseStageLabels[stage]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-classification-filter">
                <SelectValue placeholder="التصنيف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع التصنيفات</SelectItem>
                <SelectItem value="قضية_جديدة">قضية جديدة</SelectItem>
                <SelectItem value="قضية_مقيدة">قضية مقيدة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">رقم القضية</TableHead>
                <TableHead className="text-center">العميل</TableHead>
                <TableHead className="text-center">الخصم</TableHead>
                <TableHead className="text-center">صفة العميل</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">المحامي المسؤول</TableHead>
                <TableHead className="text-center">الأولوية</TableHead>
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
              ) : pagedCases.map((c) => (
                <TableRow key={c.id} data-testid={`row-case-${c.id}`}>
                  <TableCell className="text-center font-medium"><LtrInline>{c.caseNumber}</LtrInline></TableCell>
                  <TableCell className="text-center">
                    <div>
                      <div className="font-medium text-sm leading-snug">{c.plaintiffName || getClientName(c.clientId)}</div>
                      {c.plaintiffName && getClientName(c.clientId) && (
                        <div className="text-xs text-muted-foreground">{getClientName(c.clientId)}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm">{c.opponentName || "-"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={`text-xs inline-flex text-center justify-center ${
                      c.caseClassification === CaseClassification.CASE_EXISTING
                        ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                        : "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
                    }`}>
                      {c.caseClassification === CaseClassification.CASE_EXISTING ? "مدعى عليه" : "مدعي"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="inline-flex justify-center">{c.caseType || "-"}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${getStageColor(c.currentStage)} inline-flex justify-center`}>
                      {getStageLabel(c.currentStage)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{getLawyerName(c.responsibleLawyerId || c.primaryLawyerId)}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={getPriorityColor(c.priority)}>{c.priority}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{c.departmentId === "أخرى" ? (c.departmentOther || "أخرى") : getDepartmentName(c.departmentId)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="ghost" className="text-primary hover:text-primary" title="عرض التفاصيل" data-testid={`button-view-${c.id}`} onClick={() => openDetailsDialog(c)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {(user?.role === "branch_manager" || user?.role === "admin_support") && (
                        <Button size="icon" variant="ghost" title="تعديل البيانات" data-testid={`button-edit-${c.id}`} onClick={() => openEditDialog(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      {user?.role === "branch_manager" && (
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" title="حذف القضية" data-testid={`button-delete-case-${c.id}`} onClick={() => { setCaseToDelete(c); setShowDeleteDialog(true); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          <PaginationControls
            currentPage={casePage}
            totalPages={casesTotalPages}
            onPageChange={setCasePage}
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
                    setFormData({ ...formData, caseClassification: CaseClassification.CASE_NEW, previousHearingsCount: 0, currentSituation: "", responseDeadline: "", clientRole: "" as any });
                  }}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    formData.caseClassification === CaseClassification.CASE_NEW
                      ? "border-[#D4AF37] bg-[#D4AF37]/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <FileText className="h-6 w-6 text-[#345774]" />
                  <span className="text-xs font-medium text-center">قضية جديدة (للرفع)</span>
                </button>
                <button
                  type="button"
                  data-testid="classification-case-existing"
                  onClick={() => {
                    setClassificationGroup("existing");
                    setFormData({ ...formData, caseClassification: CaseClassification.CASE_EXISTING });
                  }}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    formData.caseClassification === CaseClassification.CASE_EXISTING
                      ? "border-[#345774] bg-[#345774]/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <Scale className="h-6 w-6 text-[#345774]" />
                  <span className="text-xs font-medium text-center">قضية مقيدة (منظورة)</span>
                </button>
              </div>
              {formData.caseClassification === CaseClassification.CASE_EXISTING && (
                <div className="space-y-3 mt-3">
                  <div>
                    <Label>صفة العميل <span className="text-red-500">*</span></Label>
                    <Select
                      value={(formData as any).clientRole || ""}
                      onValueChange={(value) => setFormData({ ...formData, clientRole: value } as any)}
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
                  <Label>العميل</Label>
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
                  >
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="اختر القسم" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                      ))}
                      <SelectItem value="أخرى">أخرى</SelectItem>
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

                {formData.caseClassification !== CaseClassification.CASE_NEW && (
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

                {formData.caseClassification !== CaseClassification.CASE_NEW && (
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

                {formData.caseClassification === CaseClassification.CASE_NEW && (
                  <>
                    {formData.caseType === "تجاري" && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <Info className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-xs text-blue-700 dark:text-blue-400">القضايا التجارية تتطلب التقييد في منصة تراضي ومحاولة الصلح قبل رفعها للمحكمة</span>
                      </div>
                    )}
                    {formData.caseType === "عمالي" && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <Info className="h-4 w-4 text-blue-600 shrink-0" />
                        <span className="text-xs text-blue-700 dark:text-blue-400">القضايا العمالية تتطلب التقييد في منصة وزارة الموارد البشرية والتسوية الودية قبل رفعها للمحكمة</span>
                      </div>
                    )}
                    {formData.caseType === "إداري" && (
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

                {formData.caseClassification === CaseClassification.CASE_EXISTING && (
                  <>
                    <div>
                      <Label>عدد الجلسات السابقة</Label>
                      <Input
                        data-testid="input-previous-hearings"
                        type="number"
                        min={0}
                        value={formData.previousHearingsCount}
                        onChange={(e) => setFormData({ ...formData, previousHearingsCount: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label>الوضع الحالي للقضية</Label>
                      <Textarea
                        data-testid="input-current-situation"
                        value={formData.currentSituation}
                        onChange={(e) => setFormData({ ...formData, currentSituation: e.target.value })}
                        placeholder="وصف موجز للوضع الحالي..."
                        rows={2}
                      />
                    </div>
                    {(formData as any).clientRole === "مدعى_عليه" && (
                      <div>
                        <Label>مهلة الرد (تاريخ)</Label>
                        <HijriDatePicker
                          value={formData.responseDeadline}
                          onChange={(v) => setFormData({ ...formData, responseDeadline: v })}
                          data-testid="input-response-deadline"
                        />
                      </div>
                    )}
                  </>
                )}

                {formData.caseClassification !== CaseClassification.CASE_NEW && (
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

            {formData.caseClassification === CaseClassification.CASE_EXISTING && (
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

      <Dialog open={showDetailsDialog} onOpenChange={(open) => { setShowDetailsDialog(open); if (!open) setActiveTab("info"); }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>تفاصيل القضية <LtrInline>{selectedCase?.caseNumber}</LtrInline></DialogTitle>
              {selectedCase && (user?.role === "branch_manager" || user?.role === "admin_support") && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-edit-from-details"
                  onClick={() => { setShowDetailsDialog(false); openEditDialog(selectedCase); }}
                >
                  <Pencil className="w-4 h-4 ml-2" />
                  تعديل البيانات
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedCase && (
            <div className="space-y-6">
              {selectedCase.caseClassification === CaseClassification.CASE_EXISTING &&
               selectedCase.nextHearingDate &&
               new Date(selectedCase.nextHearingDate) > new Date() && (
                <div className="flex items-start gap-3 rounded-lg border border-orange-500/60 bg-orange-500/10 px-4 py-3 text-orange-700 dark:text-orange-400" dir="rtl">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm font-semibold">
                    هذه القضية منظورة وفيها جلسة قادمة بتاريخ{" "}
                    <span className="font-bold">
                      <DualDateDisplay date={selectedCase.nextHearingDate} compact />
                    </span>
                  </p>
                </div>
              )}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-4 text-center">مراحل القضية</h4>
                <CaseProgressBar
                  currentStage={selectedCase.currentStage}
                  userRole={user?.role || "employee"}
                  caseClassification={selectedCase.caseClassification as CaseClassificationValue}
                  caseType={getDepartmentName(selectedCase.departmentId || "") as CaseTypeValue}
                  disabled={stageTransitioning}
                  onMoveToNext={async (notes) => {
                    if (!user) return;
                    setStageTransitioning(true);
                    try {
                      const success = await moveToNextStage(selectedCase.id, user.id, user.name, notes, user.role);
                      if (success) {
                        toast({ title: "تم نقل القضية للمرحلة التالية" });
                      } else {
                        toast({ title: "لا يمكن نقل القضية", description: "ليس لديك صلاحية لهذا الانتقال", variant: "destructive" });
                      }
                    } catch (err) {
                      toast({ title: "فشل نقل القضية", description: extractApiError(err), variant: "destructive" });
                    } finally {
                      setStageTransitioning(false);
                    }
                  }}
                  onMoveToPrevious={async (notes) => {
                    if (!user) return;
                    setStageTransitioning(true);
                    try {
                      const success = await moveToPreviousStage(selectedCase.id, user.id, user.name, notes, user.role);
                      if (success) {
                        toast({ title: "تم إرجاع القضية للمرحلة السابقة" });
                      } else {
                        toast({ title: "لا يمكن إرجاع القضية", description: "ليس لديك صلاحية لهذا الإرجاع", variant: "destructive" });
                      }
                    } catch (err) {
                      toast({ title: "فشل إرجاع القضية", description: extractApiError(err), variant: "destructive" });
                    } finally {
                      setStageTransitioning(false);
                    }
                  }}
                  onSkipDataCompletion={
                    user && (
                      user.role === "branch_manager" ||
                      user.role === "cases_review_head" ||
                      selectedCase.primaryLawyerId === user.id ||
                      (Array.isArray(selectedCase.assignedLawyers) && selectedCase.assignedLawyers.includes(user.id))
                    ) ? async (notes) => {
                      if (!user) return;
                      setStageTransitioning(true);
                      try {
                        const success = await skipDataCompletion(selectedCase.id, user.id, user.name, notes);
                        if (success) {
                          toast({ title: "تم تجاوز استكمال البيانات", description: "انتقلت القضية مباشرةً لمرحلة الدراسة" });
                        } else {
                          toast({ title: "تعذّر التجاوز", variant: "destructive" });
                        }
                      } catch (err) {
                        toast({ title: "تعذّر التجاوز", description: extractApiError(err), variant: "destructive" });
                      } finally {
                        setStageTransitioning(false);
                      }
                    } : undefined
                  }
                />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9">
                  <TabsTrigger value="info" data-testid="tab-info">المعلومات</TabsTrigger>
                  <TabsTrigger value="hearings" data-testid="tab-hearings">الجلسات</TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">سجل المراحل</TabsTrigger>
                  <TabsTrigger value="attachments" data-testid="tab-attachments">المرفقات</TabsTrigger>
                  <TabsTrigger value="comments" data-testid="tab-comments">التعليقات</TabsTrigger>
                  <TabsTrigger value="activity" data-testid="tab-activity">النشاط</TabsTrigger>
                  <TabsTrigger value="notes" data-testid="tab-notes">ملاحظات</TabsTrigger>
                  <TabsTrigger value="deadlines" data-testid="tab-deadlines">مواعيد</TabsTrigger>
                  <TabsTrigger value="actions" data-testid="tab-actions">الإجراءات</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                    <div>
                      <Label className="text-muted-foreground">العميل</Label>
                      <p className="font-medium"><BidiText>{getClientName(selectedCase.clientId)}</BidiText></p>
                    </div>
                    {selectedCase.plaintiffName && (
                      <div>
                        <Label className="text-muted-foreground">اسم المدعي</Label>
                        <p className="font-medium"><BidiText>{selectedCase.plaintiffName}</BidiText></p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">الخصم</Label>
                      <p className="font-medium"><BidiText>{selectedCase.opponentName || "-"}</BidiText></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المحامي المسؤول</Label>
                      <p className="font-medium">{getLawyerName(selectedCase.responsibleLawyerId || selectedCase.primaryLawyerId)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">النوع</Label>
                      <p>{selectedCase.caseType || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الأولوية</Label>
                      <div><Badge className={getPriorityColor(selectedCase.priority)}>{selectedCase.priority}</Badge></div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">القسم</Label>
                      <p>{selectedCase.departmentId === "أخرى" ? (selectedCase.departmentOther || "أخرى") : getDepartmentName(selectedCase.departmentId)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المحكمة</Label>
                      <p>{selectedCase.courtName || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">رقم القضية</Label>
                      <p><LtrInline>{selectedCase.caseNumber || "-"}</LtrInline></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الدائرة</Label>
                      <p><LtrInline>{selectedCase.circuitNumber || "-"}</LtrInline></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">القاضي</Label>
                      <p>{selectedCase.judgeName || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">موعد الجلسة القادمة</Label>
                      <p className="font-medium">
                        {selectedCase.nextHearingDate
                          ? <DualDateDisplay date={selectedCase.nextHearingDate} compact />
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">آخر جلسة</Label>
                      <p className="font-medium">
                        {selectedCase.lastHearingDate
                          ? <DualDateDisplay date={selectedCase.lastHearingDate} compact />
                          : "-"}
                      </p>
                    </div>
                    {selectedCase.responseDeadline && (
                      <div>
                        <Label className="text-muted-foreground">مهلة الرد</Label>
                        <p className="font-medium">
                          <DualDateDisplay date={selectedCase.responseDeadline} compact />
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">بيانات الخصم</h4>
                    <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                      <div>
                        <Label className="text-muted-foreground">اسم الخصم</Label>
                        <p><BidiText>{selectedCase.opponentName || "-"}</BidiText></p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">هاتف الخصم</Label>
                        <p><LtrInline>{selectedCase.opponentPhone || "-"}</LtrInline></p>
                      </div>
                    </div>
                  </div>
                  
                  {selectedCase.reviewNotes && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 text-destructive">ملاحظات المراجعة</h4>
                      <p className="p-3 bg-destructive/10 rounded-md text-destructive">
                        {selectedCase.reviewNotes}
                      </p>
                    </div>
                  )}

                  {(selectedCase as any).clientRole && (
                    <div className="border-t pt-4">
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">صفة العميل</Label>
                          <p className="font-medium">{(selectedCase as any).clientRole === "مدعى_عليه" ? "مدعى عليه" : "مدعي"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.currentStage === "مشطوبة" && (selectedCase as any).struckOffReopenDeadline && (
                    <div className="border-t pt-4">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-red-700 dark:text-red-400">القضية مشطوبة</span>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            الموعد النهائي لإعادة القيد: {(selectedCase as any).struckOffReopenDeadline}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.currentStage === "مقفلة" && (selectedCase as any).closureReason && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سبب الإغلاق</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">السبب</Label>
                          <p className="font-medium">{(selectedCase as any).closureReason === "أخرى" ? (selectedCase as any).closureReasonOther || "أخرى" : (selectedCase as any).closureReason?.replace(/_/g, " ")}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedCase as any).grievanceRequired && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">بيانات التظلم</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">مطلوب تظلم</Label>
                          <p className="font-medium">نعم</p>
                        </div>
                        {(selectedCase as any).grievanceDate && (
                          <div>
                            <Label className="text-muted-foreground">تاريخ التظلم</Label>
                            <p className="font-medium">{(selectedCase as any).grievanceDate}</p>
                          </div>
                        )}
                        {(selectedCase as any).grievanceResult && (
                          <div>
                            <Label className="text-muted-foreground">نتيجة التظلم</Label>
                            <p className="font-medium">{(selectedCase as any).grievanceResult}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.CASE_NEW && selectedCase.caseType === "إداري" && (selectedCase as any).adminCaseSubType && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">تفاصيل القضية الإدارية</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">نوع القضية</Label>
                          <p className="font-medium">{(selectedCase as any).adminCaseSubType === "تظلم" ? "تظلم" : "قضية"}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">تاريخ التقادم</Label>
                          <p className="font-medium">{(selectedCase as any).prescriptionDate ? <DualDateDisplay date={(selectedCase as any).prescriptionDate} compact /> : "-"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.CASE_NEW && selectedCase.caseType === "تجاري" && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سير عمل منصة تراضي</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Badge variant={(selectedCase as any).taradiStatus === "مقيدة_في_تراضي" ? "default" : (selectedCase as any).taradiStatus === "تم_الصلح" ? "default" : (selectedCase as any).taradiStatus === "لم_يتم_صلح" ? "destructive" : "secondary"}>
                            {(selectedCase as any).taradiStatus ? ({
                              "مقيدة_في_تراضي": "مقيدة في تراضي",
                              "تم_الصلح": "تم الصلح",
                              "لم_يتم_صلح": "لم يتم صلح",
                            } as any)[(selectedCase as any).taradiStatus] : "لم تقيد بعد"}
                          </Badge>
                          {(selectedCase as any).taradiNumber && <span className="text-sm text-muted-foreground">رقم: {(selectedCase as any).taradiNumber}</span>}
                        </div>
                        {!(selectedCase as any).taradiStatus && (
                          registrationDialogType === "taradi" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input value={registrationNumberInput} onChange={e => setRegistrationNumberInput(e.target.value)} placeholder="رقم الطلب في تراضي (اختياري)" className="h-8 text-sm" data-testid="input-taradi-registration" autoFocus />
                              <Button size="sm" data-testid="button-confirm-taradi" onClick={async () => {
                                const res = await fetch(`/api/cases/${selectedCase.id}/taradi`, { method: "PATCH", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("lawfirm_token")}`, "X-CSRF-Token": localStorage.getItem("csrf_token") || "" }, body: JSON.stringify({ status: "مقيدة_في_تراضي", taradiNumber: registrationNumberInput }) });
                                if (res.ok) { toast({ title: "تم التقييد في تراضي" }); setRegistrationDialogType(""); setRegistrationNumberInput(""); await updateCase(selectedCase.id, { taradiStatus: "مقيدة_في_تراضي" as any, ...(registrationNumberInput ? { taradiNumber: registrationNumberInput } : {}) }); }
                              }}>تأكيد</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setRegistrationDialogType(""); setRegistrationNumberInput(""); }}>إلغاء</Button>
                            </div>
                          ) : (
                            <Button size="sm" data-testid="button-register-taradi" onClick={() => { setRegistrationDialogType("taradi"); setRegistrationNumberInput(""); }}>
                              تقييد في منصة تراضي
                            </Button>
                          )
                        )}
                        {(selectedCase as any).taradiStatus === "مقيدة_في_تراضي" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              data-testid="button-taradi-reconciled"
                              onClick={async () => {
                                const res = await fetch(`/api/cases/${selectedCase.id}/taradi`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("lawfirm_token")}`, "X-CSRF-Token": localStorage.getItem("csrf_token") || "" },
                                  body: JSON.stringify({ status: "تم_الصلح" }),
                                });
                                if (res.ok) { toast({ title: "تم تسجيل الصلح" }); await updateCase(selectedCase.id, { taradiStatus: "تم_الصلح" as any }); }
                              }}
                            >
                              تم الصلح
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              data-testid="button-taradi-not-reconciled"
                              onClick={async () => {
                                const res = await fetch(`/api/cases/${selectedCase.id}/taradi`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("lawfirm_token")}`, "X-CSRF-Token": localStorage.getItem("csrf_token") || "" },
                                  body: JSON.stringify({ status: "لم_يتم_صلح" }),
                                });
                                if (res.ok) { toast({ title: "تم تسجيل عدم الصلح - سيتم إشعار القسم لتقييد القضية في المحكمة" }); await updateCase(selectedCase.id, { taradiStatus: "لم_يتم_صلح" as any }); }
                              }}
                            >
                              لم يتم صلح
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.CASE_NEW && selectedCase.caseType === "عمالي" && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سير عمل وزارة الموارد البشرية</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Badge variant={(selectedCase as any).mohrStatus === "انتهت_التسوية" ? "destructive" : (selectedCase as any).mohrStatus ? "default" : "secondary"}>
                            {(selectedCase as any).mohrStatus ? ({
                              "مقيدة_في_الموارد": "مقيدة في وزارة الموارد البشرية",
                              "توجيه_تسوية_ودية": "تم توجيه العميل للتسوية الودية",
                              "انتهت_التسوية": "انتهت التسوية - جاهزة للرفع",
                            } as any)[(selectedCase as any).mohrStatus] : "لم تقيد بعد"}
                          </Badge>
                          {(selectedCase as any).mohrNumber && <span className="text-sm text-muted-foreground">رقم: {(selectedCase as any).mohrNumber}</span>}
                        </div>
                        {!(selectedCase as any).mohrStatus && (
                          registrationDialogType === "mohr" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input value={registrationNumberInput} onChange={e => setRegistrationNumberInput(e.target.value)} placeholder="رقم الطلب في الموارد البشرية (اختياري)" className="h-8 text-sm" data-testid="input-mohr-registration" autoFocus />
                              <Button size="sm" data-testid="button-confirm-mohr" onClick={async () => {
                                const res = await fetch(`/api/cases/${selectedCase.id}/mohr`, { method: "PATCH", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("lawfirm_token")}`, "X-CSRF-Token": localStorage.getItem("csrf_token") || "" }, body: JSON.stringify({ status: "مقيدة_في_الموارد", mohrNumber: registrationNumberInput }) });
                                if (res.ok) { toast({ title: "تم التقييد في وزارة الموارد البشرية" }); setRegistrationDialogType(""); setRegistrationNumberInput(""); await updateCase(selectedCase.id, { mohrStatus: "مقيدة_في_الموارد" as any, ...(registrationNumberInput ? { mohrNumber: registrationNumberInput } : {}) }); }
                              }}>تأكيد</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setRegistrationDialogType(""); setRegistrationNumberInput(""); }}>إلغاء</Button>
                            </div>
                          ) : (
                          <Button
                            size="sm"
                            data-testid="button-register-mohr"
                            onClick={() => { setRegistrationDialogType("mohr"); setRegistrationNumberInput(""); }}
                          >
                            تقييد في وزارة الموارد البشرية
                          </Button>
                          )
                        )}
                        {(selectedCase as any).mohrStatus === "مقيدة_في_الموارد" && (
                          <Button
                            size="sm"
                            data-testid="button-direct-settlement"
                            onClick={async () => {
                              const res = await fetch(`/api/cases/${selectedCase.id}/direct-settlement`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("lawfirm_token")}`, "X-CSRF-Token": localStorage.getItem("csrf_token") || "" },
                                body: JSON.stringify({}),
                              });
                              if (res.ok) { toast({ title: "تم توجيه العميل للتسوية الودية - سيتم إشعار الدعم الإداري" }); await updateCase(selectedCase.id, { mohrStatus: "توجيه_تسوية_ودية" as any, amicableSettlementDirected: true as any }); }
                            }}
                          >
                            توجيه العميل لرفعها في التسوية الودية
                          </Button>
                        )}
                        {(selectedCase as any).mohrStatus === "توجيه_تسوية_ودية" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            data-testid="button-settlement-ended"
                            onClick={async () => {
                              const res = await fetch(`/api/cases/${selectedCase.id}/mohr`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("lawfirm_token")}`, "X-CSRF-Token": localStorage.getItem("csrf_token") || "" },
                                body: JSON.stringify({ status: "انتهت_التسوية" }),
                              });
                              if (res.ok) { toast({ title: "تم تسجيل انتهاء التسوية - سيتم إشعار القسم لاستكمال الدراسة والرفع" }); await updateCase(selectedCase.id, { mohrStatus: "انتهت_التسوية" as any }); }
                            }}
                          >
                            انتهاء مرحلة التسوية الودية
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {CaseStagesOrder.indexOf(selectedCase.currentStage) >= CaseStagesOrder.indexOf(CaseStage.READY_TO_SUBMIT) && (
                    selectedCase.caseType === "تجاري" || selectedCase.caseType === "عمالي"
                  ) && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 flex-row-reverse">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        أرقام الطلبات - جاهزة للرفع
                      </h4>
                      <div className="grid grid-cols-2 gap-4" dir="rtl">
                        {selectedCase.caseType === "تجاري" && (
                          <div className="text-right">
                            <Label className="text-muted-foreground block text-right">رقم الطلب في منصة تراضي</Label>
                            {(selectedCase as any).taradiStatus === "تم_الصلح" || (selectedCase as any).taradiStatus === "لم_يتم_صلح" ? (
                              <p className="font-medium mt-1">{(selectedCase as any).taradiNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                            ) : (
                              <div className="flex items-center gap-2 mt-1 justify-end">
                                {inlineEditField === `taradi-${selectedCase.id}` ? (
                                  <>
                                    <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-taradi-number"
                                      onKeyDown={async e => {
                                        if (e.key === "Enter") { await updateCase(selectedCase.id, { taradiNumber: inlineEditValue }); setInlineEditField(null); }
                                        else if (e.key === "Escape") setInlineEditField(null);
                                      }} />
                                    <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { taradiNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-medium">{(selectedCase as any).taradiNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                    <Button variant="ghost" size="sm" data-testid="button-edit-taradi-number" onClick={() => { setInlineEditField(`taradi-${selectedCase.id}`); setInlineEditValue((selectedCase as any).taradiNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {selectedCase.caseType === "عمالي" && (
                          <div className="text-right">
                            <Label className="text-muted-foreground block text-right">رقم الطلب في ناجز / معين</Label>
                            <div className="flex items-center gap-2 mt-1 justify-end">
                              {inlineEditField === `najiz-${selectedCase.id}` ? (
                                <>
                                  <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-najiz-number"
                                    onKeyDown={async e => {
                                      if (e.key === "Enter") { await updateCase(selectedCase.id, { najizNumber: inlineEditValue }); setInlineEditField(null); }
                                      else if (e.key === "Escape") setInlineEditField(null);
                                    }} />
                                  <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { najizNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                                </>
                              ) : (
                                <>
                                  <p className="font-medium">{(selectedCase as any).najizNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                  <Button variant="ghost" size="sm" data-testid="button-edit-najiz-number" onClick={() => { setInlineEditField(`najiz-${selectedCase.id}`); setInlineEditValue((selectedCase as any).najizNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                                </>
                              )}
                            </div>
                            {(selectedCase as any).mohrStatus === "انتهت_التسوية" && (
                              <p className="text-xs text-amber-600 mt-1">انتهت مرحلة التسوية الودية - القضية جاهزة للرفع في المحكمة</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.CASE_NEW &&
                    CaseStagesOrder.indexOf(selectedCase.currentStage) >= CaseStagesOrder.indexOf(CaseStage.READY_TO_SUBMIT) &&
                    (user?.role === "branch_manager" || user?.role === "admin_support") &&
                    (selectedCase.caseType !== "تجاري" || (selectedCase as any).taradiStatus === "لم_يتم_صلح") &&
                    (selectedCase.caseType !== "عمالي" || (selectedCase as any).mohrStatus === "انتهت_التسوية") && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 flex-row-reverse">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                        تحويل القضية إلى منظورة
                      </h4>
                      <p className="text-xs text-muted-foreground mb-3">عند تقييد القضية في المحكمة، يتم تحويل تصنيفها إلى "منظورة" وتنتقل لمرحلة "تحت النظر"</p>
                      {selectedCase.caseType === "تجاري" && !(selectedCase as any).taradiNumber ? (
                        <p className="text-sm text-amber-600 font-medium" data-testid="taradi-number-required-notice">
                          يجب إدخال رقم الطلب في منصة تراضي أولاً قبل تقييد القضية في المحكمة. يرجى إدخاله في قسم "أرقام الطلبات" أعلاه.
                        </p>
                      ) : showCourtRegistrationDialog && courtRegistrationCaseId === selectedCase.id ? (
                        <div className="flex items-center gap-2" dir="rtl">
                          <Input value={courtCaseNumberInput} onChange={e => setCourtCaseNumberInput(e.target.value)} placeholder="رقم القضية في المحكمة" className="h-8 text-sm" autoFocus data-testid="input-court-registration-number" />
                          <Button size="sm" data-testid="button-confirm-court-registration" onClick={async () => {
                            if (!courtCaseNumberInput.trim()) { toast({ title: "يرجى إدخال رقم القضية", variant: "destructive" }); return; }
                            try {
                              const response = await fetch(`/api/cases/${selectedCase.id}/court-register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courtCaseNumber: courtCaseNumberInput.trim() }) });
                              if (!response.ok) { const err = await response.json(); throw new Error(err.error || "حدث خطأ"); }
                              await refreshCases();
                              toast({ title: "تم تقييد القضية في المحكمة بنجاح" });
                              setShowCourtRegistrationDialog(false); setCourtRegistrationCaseId(null); setCourtCaseNumberInput("");
                            } catch (e: any) { toast({ title: e.message || "حدث خطأ", variant: "destructive" }); }
                          }}>تأكيد</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setShowCourtRegistrationDialog(false); setCourtRegistrationCaseId(null); setCourtCaseNumberInput(""); }}>إلغاء</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="border-blue-500 text-blue-600" data-testid="button-register-court" onClick={() => { setShowCourtRegistrationDialog(true); setCourtRegistrationCaseId(selectedCase.id); setCourtCaseNumberInput(""); }}>
                          <Scale className="w-3 h-3 mr-1" /> تقييد القضية في المحكمة
                        </Button>
                      )}
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.CASE_EXISTING && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 flex-row-reverse">
                        <span className="w-2 h-2 rounded-full bg-violet-500 inline-block"></span>
                        بيانات ما بعد التقييد
                      </h4>
                      <div className="grid grid-cols-2 gap-4" dir="rtl">
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">رقم القضية</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `court-${selectedCase.id}` ? (
                              <>
                                <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-court-case-number"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { courtCaseNumber: inlineEditValue }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { courtCaseNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.courtCaseNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-court-case-number" onClick={() => { setInlineEditField(`court-${selectedCase.id}`); setInlineEditValue(selectedCase.courtCaseNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">موعد الجلسة القادمة</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `hearing-${selectedCase.id}` ? (
                              <>
                                <Input type="date" value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-36" autoFocus data-testid="input-next-hearing-date"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { nextHearingDate: inlineEditValue || null }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { nextHearingDate: inlineEditValue || null }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.nextHearingDate ? <DualDateDisplay date={selectedCase.nextHearingDate} compact /> : <span className="text-muted-foreground text-sm italic">غير محدد</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-next-hearing-date" onClick={() => { setInlineEditField(`hearing-${selectedCase.id}`); setInlineEditValue(selectedCase.nextHearingDate || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>تاريخ الإنشاء: <DualDateDisplay date={selectedCase.createdAt} compact /></span>
                      <span>آخر تحديث: <DualDateDisplay date={selectedCase.updatedAt} compact /></span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="hearings" className="mt-4">
                  {(() => {
                    const caseHearings = getHearingsByCase(selectedCase.id);
                    if (caseHearings.length === 0) {
                      return <p className="text-muted-foreground text-center py-8">لا توجد جلسات مسجلة لهذه القضية</p>;
                    }
                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">الوقت</TableHead>
                            <TableHead className="text-right">المحكمة</TableHead>
                            <TableHead className="text-right">الحالة</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {caseHearings.map((hearing) => (
                            <TableRow key={hearing.id}>
                              <TableCell><DualDateDisplay date={hearing.hearingDate} compact /></TableCell>
                              <TableCell><LtrInline>{formatTimeAmPm(hearing.hearingTime)}</LtrInline></TableCell>
                              <TableCell>{hearing.courtName}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{hearing.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {selectedCase.stageHistory && selectedCase.stageHistory.length > 0 ? (
                    <div className="space-y-3">
                      {[...selectedCase.stageHistory].reverse().map((transition, index) => (
                        <div key={index} className="flex items-start gap-4 p-3 border rounded-lg">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {selectedCase.stageHistory.length - index}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{CaseStageLabels[transition.stage] || transition.stage}</p>
                            <div className="text-sm text-muted-foreground">
                              <span>{transition.userName}</span>
                              <span className="mx-2">•</span>
                              <DualDateDisplay date={transition.timestamp} showTime compact />
                            </div>
                            {transition.notes && (
                              <p className="mt-1 text-sm bg-muted p-2 rounded">{transition.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">لا يوجد سجل للمراحل</p>
                  )}
                </TabsContent>

                <TabsContent value="attachments" className="mt-4">
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Paperclip className="w-4 h-4" />
                        إضافة مرفق جديد
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>اسم الملف</Label>
                          <SmartInput
                            inputType="text"
                            data-testid="input-attachment-name"
                            placeholder="مثال: عقد التأسيس"
                            value={attachmentForm.fileName}
                            onChange={(e) => setAttachmentForm({ ...attachmentForm, fileName: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>رابط الملف (URL)</Label>
                          <SmartInput
                            inputType="code"
                            data-testid="input-attachment-url"
                            placeholder="https://drive.google.com/..."
                            value={attachmentForm.fileUrl}
                            onChange={(e) => setAttachmentForm({ ...attachmentForm, fileUrl: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        data-testid="button-add-attachment"
                        onClick={addAttachment}
                        disabled={!attachmentForm.fileName.trim() || !attachmentForm.fileUrl.trim()}
                        size="sm"
                      >
                        <Plus className="w-4 h-4 ml-2" />
                        إضافة مرفق
                      </Button>
                    </div>

                    {isLoadingAttachments ? (
                      <p className="text-center text-muted-foreground py-4">جارٍ تحميل المرفقات...</p>
                    ) : caseAttachments.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">لا توجد مرفقات</p>
                    ) : (
                      <div className="space-y-2">
                        {caseAttachments.map((att) => (
                          <div key={att.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`attachment-item-${att.id}`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{att.fileName}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                  <span>{users.find(u => u.id === att.uploadedBy)?.name || "غير معروف"}</span>
                                  <span>-</span>
                                  <DualDateDisplay date={att.createdAt} showTime compact />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-open-attachment-${att.id}`}
                                onClick={() => window.open(att.fileUrl, "_blank")}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-delete-attachment-${att.id}`}
                                onClick={() => deleteAttachment(att.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="comments" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Textarea
                        data-testid="input-new-comment"
                        placeholder="اكتب تعليقك هنا..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={2}
                        className="flex-1"
                      />
                      <Button
                        data-testid="button-add-comment"
                        onClick={() => {
                          if (user && newComment.trim()) {
                            addComment(selectedCase.id, user.id, user.name, newComment.trim());
                            setNewComment("");
                            toast({ title: "تم إضافة التعليق" });
                          }
                        }}
                        disabled={!newComment.trim()}
                      >
                        إضافة
                      </Button>
                    </div>
                    
                    {(() => {
                      const caseComments = getCommentsByCaseId(selectedCase.id);
                      if (caseComments.length === 0) {
                        return <p className="text-muted-foreground text-center py-4">لا توجد تعليقات</p>;
                      }
                      return (
                        <div className="space-y-3">
                          {caseComments.map((comment) => (
                            <div key={comment.id} className="p-3 border rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-medium">{comment.userName}</span>
                                <span className="text-xs text-muted-foreground">
                                  <DualDateDisplay date={comment.createdAt} showTime compact />
                                </span>
                              </div>
                              <p className="text-sm">{comment.content}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-4">
                  <CaseActivityTab caseId={selectedCase?.id || ""} />
                </TabsContent>

                <TabsContent value="notes" className="mt-4">
                  <CaseNotesTab caseId={selectedCase?.id || ""} />
                </TabsContent>

                <TabsContent value="deadlines" className="mt-4">
                  <CaseDeadlinesTab
                    caseId={selectedCase?.id || ""}
                    hearings={selectedCase ? getHearingsByCase(selectedCase.id) : []}
                    memos={selectedCase ? getMemosByCase(selectedCase.id) : []}
                    fieldTasks={selectedCase ? getTasksByCase(selectedCase.id) : []}
                    responseDeadline={selectedCase?.responseDeadline ?? null}
                  />
                </TabsContent>

                <TabsContent value="actions" className="mt-4">
                  <div className="space-y-3">
                    {canAssign(selectedCase) && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">{selectedCase.primaryLawyerId ? "تعديل الإسناد" : "إسناد القضية"}</p>
                          <p className="text-xs text-muted-foreground">تحديد المحامي المسؤول عن القضية</p>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`button-assign-details-${selectedCase.id}`} onClick={() => { openAssignDialog(selectedCase); }}>
                          <UserPlus className="w-4 h-4 ml-1" />{selectedCase.primaryLawyerId ? "تعديل الإسناد" : "إسناد"}
                        </Button>
                      </div>
                    )}
                    {canSendToReview(selectedCase) && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">إرسال للمراجعة</p>
                          <p className="text-xs text-muted-foreground">إرسال القضية للجنة المراجعة للاعتماد</p>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`button-send-review-details-${selectedCase.id}`} onClick={() => { handleSendToReview(selectedCase); }}>
                          <Send className="w-4 h-4 ml-1" />إرسال للمراجعة
                        </Button>
                      </div>
                    )}
                    {canReview(selectedCase) && (
                      <>
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <p className="font-medium text-sm">قائمة المراجعة</p>
                            <p className="text-xs text-muted-foreground">مراجعة بنود القضية قبل البت فيها</p>
                          </div>
                          <Button size="sm" variant="outline" data-testid={`button-review-checklist-details-${selectedCase.id}`} onClick={() => { openReviewDialog(selectedCase); }}>
                            <ClipboardCheck className="w-4 h-4 ml-1" />قائمة المراجعة
                          </Button>
                        </div>
                        <div className="p-3 rounded-lg border bg-card space-y-3">
                          <div>
                            <p className="font-medium text-sm">قرار لجنة المراجعة</p>
                            <p className="text-xs text-muted-foreground">حدد نتيجة مراجعة اللجنة للقضية</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                              data-testid={`button-reject-details-${selectedCase.id}`}
                              onClick={() => { openRejectDialog(selectedCase); }}
                            >
                              <MessageSquare className="w-4 h-4 ml-1" />تم إضافة ملاحظات
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              data-testid={`button-approve-details-${selectedCase.id}`}
                              onClick={() => { handleApprove(selectedCase); }}
                            >
                              <CheckCircle className="w-4 h-4 ml-1" />لا يوجد ملاحظات
                            </Button>
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span className="flex-1 text-center">→ الأخذ بالملاحظات</span>
                            <span className="flex-1 text-center">→ جاهزة للرفع</span>
                          </div>
                        </div>
                      </>
                    )}
                    {user?.role === "admin_support" && selectedCase.currentStage !== "مقفلة" && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
                        <div>
                          <p className="font-medium text-sm text-red-700 dark:text-red-400">إغلاق مبكر</p>
                          <p className="text-xs text-muted-foreground">إغلاق القضية من أي مرحلة (الدعم الإداري فقط)</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-red-500 text-red-600 hover:bg-red-50" data-testid={`button-early-close-${selectedCase.id}`} onClick={() => { setEarlyCloseCase(selectedCase); setShowEarlyCloseDialog(true); }}>
                          <Archive className="w-4 h-4 ml-1" />إغلاق القضية
                        </Button>
                      </div>
                    )}
                    {canClose(selectedCase) && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">إغلاق القضية</p>
                          <p className="text-xs text-muted-foreground">إغلاق القضية وأرشفتها</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-orange-500 text-orange-600" data-testid={`button-close-details-${selectedCase.id}`} onClick={() => { handleClose(selectedCase); }}>
                          <Archive className="w-4 h-4 ml-1" />إغلاق
                        </Button>
                      </div>
                    )}
                    {isDeptHead && selectedCase.departmentId === user?.departmentId && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">طلب تحويل لقسم آخر</p>
                          <p className="text-xs text-muted-foreground">تقديم طلب تحويل القضية لقسم مختلف</p>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`button-transfer-details-${selectedCase.id}`} onClick={() => { openTransferDialog(selectedCase); }}>
                          <ArrowLeftRight className="w-4 h-4 ml-1" />تحويل
                        </Button>
                      </div>
                    )}
                    {permissions.canSendReminders && (selectedCase.responsibleLawyerId || selectedCase.primaryLawyerId) && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">إرسال تذكير</p>
                          <p className="text-xs text-muted-foreground">إرسال تذكير للمحامي المسؤول</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-amber-500 text-amber-600" data-testid={`button-reminder-details-${selectedCase.id}`} onClick={() => { openReminderDialog(selectedCase); }}>
                          <Bell className="w-4 h-4 ml-1" />تذكير
                        </Button>
                      </div>
                    )}
                    {!canAssign(selectedCase) && !canSendToReview(selectedCase) && !canReview(selectedCase) && !canClose(selectedCase) && !(isDeptHead && selectedCase.departmentId === user?.departmentId) && !(permissions.canSendReminders && (selectedCase.responsibleLawyerId || selectedCase.primaryLawyerId)) && (
                      <div className="text-center text-muted-foreground py-8">
                        <p className="text-sm">لا توجد إجراءات متاحة لهذه القضية حالياً</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                    currentStage: "مقفلة" as any,
                    closureReason: earlyCloseReason,
                    closureReasonOther: earlyCloseReason === "أخرى" ? earlyCloseReasonOther.trim() : "",
                  } as any);
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

      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditCaseId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل بيانات القضية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
            <div>
              <Label>اسم الخصم</Label>
              <SmartInput
                inputType="text"
                data-testid="edit-opponent-name"
                value={editFormData.opponentName}
                onChange={(e) => setEditFormData({ ...editFormData, opponentName: e.target.value })}
              />
            </div>
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
            </div>
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
              <div>
                <Label>الدائرة</Label>
                <SmartInput
                  inputType="code"
                  data-testid="edit-circuit-number"
                  value={editFormData.circuitNumber}
                  onChange={(e) => setEditFormData({ ...editFormData, circuitNumber: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>القاضي</Label>
              <SmartInput
                inputType="text"
                data-testid="edit-judge-name"
                value={editFormData.judgeName}
                onChange={(e) => setEditFormData({ ...editFormData, judgeName: e.target.value })}
              />
            </div>
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">بيانات الخصم</h4>
              <div className="grid grid-cols-2 gap-4">
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
            {editFormData.caseClassification === CaseClassification.CASE_EXISTING && (
              <div>
                <Label>موعد الرد</Label>
                <HijriDatePicker
                  value={editFormData.responseDeadline}
                  onChange={(v) => setEditFormData({ ...editFormData, responseDeadline: v })}
                  data-testid="edit-response-deadline"
                />
              </div>
            )}
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
    </div>
  );
}
