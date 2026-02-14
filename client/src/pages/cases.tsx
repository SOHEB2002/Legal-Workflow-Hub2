import { useState, useMemo, useEffect } from "react";
import { CaseActivityTab, CaseNotesTab, CaseDeadlinesTab } from "@/components/case-tabs";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Plus,
  Search,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  Archive,
  UserPlus,
  FolderOpen,
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
} from "lucide-react";
import { useFavorites } from "@/lib/favorites-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  CaseStatus, 
  CaseStatusLabels, 
  CaseStageLabels,
  CaseType, 
  Priority,
  Department,
  CaseClassification,
  CaseClassificationLabels,
  getStageLabel,
} from "@shared/schema";
import type { LawCase, CaseStatusValue, CaseTypeValue, PriorityType, Attachment, CaseClassificationValue } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { sendCaseReminder, notifyCaseSentToReview, requestCaseTransfer } from "@/lib/notification-triggers";
import { CaseProgressBar } from "@/components/case-progress-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHearings } from "@/lib/hearings-context";
import { useStandards } from "@/lib/standards-context";
import { ReviewChecklist } from "@/components/review-checklist";

function getStatusColor(status: CaseStatusValue) {
  switch (status) {
    case CaseStatus.RECEIVED:
      return "bg-primary/20 text-primary border-primary/30";
    case CaseStatus.DATA_COMPLETION:
    case CaseStatus.STUDY:
      return "bg-accent/20 text-accent border-accent/30";
    case CaseStatus.DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case CaseStatus.REVIEW_COMMITTEE:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case CaseStatus.AMENDMENTS:
      return "bg-destructive/20 text-destructive border-destructive/30";
    case CaseStatus.READY_TO_SUBMIT:
      return "bg-accent/30 text-accent border-accent/40";
    case CaseStatus.SUBMITTED:
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case CaseStatus.CLOSED:
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
    comments,
    addCase, 
    updateCase, 
    assignCase, 
    sendToReviewCommittee, 
    approveCase, 
    rejectCase, 
    closeCase,
    moveToNextStage,
    moveToPreviousStage,
    addComment,
    getCommentsByCaseId,
    getCaseById,
  } = useCases();
  const { clients, getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions, users } = useAuth();
  const { getHearingsByCase } = useHearings();
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

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s === "pending_review") setStatusFilter(CaseStatus.REVIEW_COMMITTEE);
    else if (s === "ready") setStatusFilter(CaseStatus.READY_TO_SUBMIT);
  }, []);

  const [showAddDialog, setShowAddDialog] = useState(false);
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
      console.error(e);
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

  const [classificationFilter, setClassificationFilter] = useState<string>("all");
  const [formData, setFormData] = useState({
    clientId: "",
    caseType: "عام" as CaseTypeValue,
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
  });

  const [assignData, setAssignData] = useState({
    lawyerId: "",
    departmentId: "",
  });

  const resetForm = () => {
    setFormData({
      clientId: "",
      caseType: "عام",
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
    });
  };

  const handleAddCase = async () => {
    if (!user) return;
    if (!formData.caseClassification) {
      toast({ title: "يرجى اختيار تصنيف القضية", variant: "destructive" });
      return;
    }
    
    await addCase({
      clientId: formData.clientId || "",
      caseType: formData.caseType,
      caseTypeOther: formData.caseTypeOther,
      departmentId: formData.departmentId,
      departmentOther: formData.departmentOther,
      priority: formData.priority,
      courtName: formData.courtName,
      courtCaseNumber: formData.courtCaseNumber,
      opponentName: formData.opponentName,
      caseClassification: formData.caseClassification as CaseClassificationValue,
      previousHearingsCount: formData.previousHearingsCount,
      currentSituation: formData.currentSituation,
      responseDeadline: formData.responseDeadline || null,
      nextHearingDate: formData.nextHearingDate || null,
      nextHearingTime: formData.nextHearingTime || null,
    } as any, user.id, user.name);
    
    const classLabel = CaseClassificationLabels[formData.caseClassification as CaseClassificationValue] || "";
    toast({ title: `تم إضافة القضية بنجاح (${classLabel})` });
    setShowAddDialog(false);
    resetForm();
  };

  const handleAssign = () => {
    if (!selectedCase || !assignData.lawyerId || !assignData.departmentId) return;
    
    assignCase(selectedCase.id, assignData.lawyerId, assignData.departmentId);
    toast({ title: "تم إسناد القضية بنجاح" });
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
    toast({ title: "تم اعتماد القضية" });
  };

  const handleReject = () => {
    if (!selectedCase || !rejectNotes) return;
    rejectCase(selectedCase.id, rejectNotes, "rejected");
    toast({ title: "تم إعادة القضية للتعديل" });
    setShowRejectDialog(false);
    setSelectedCaseId(null);
    setRejectNotes("");
  };

  const handleClose = (caseItem: LawCase) => {
    closeCase(caseItem.id);
    toast({ title: "تم إغلاق القضية" });
  };

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const clientName = c.clientId ? getClientName(c.clientId) : "";
      const matchesSearch =
        c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (clientName && clientName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesType = typeFilter === "all" || c.caseType === typeFilter;
      const matchesClassification = classificationFilter === "all" || c.caseClassification === classificationFilter;
      return matchesSearch && matchesStatus && matchesType && matchesClassification;
    });
  }, [cases, searchQuery, statusFilter, typeFilter, classificationFilter, getClientName]);

  const isDeptHead = user?.role === "department_head";

  const openAssignDialog = (caseItem: LawCase) => {
    setSelectedCaseId(caseItem.id);
    setAssignData({ 
      lawyerId: caseItem.primaryLawyerId || "", 
      departmentId: isDeptHead ? (user?.departmentId || "") : (caseItem.departmentId || "")
    });
    setShowAssignDialog(true);
  };

  const openTransferDialog = (caseItem: LawCase) => {
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
    (c.status === CaseStatus.RECEIVED || c.status === CaseStatus.DATA_COMPLETION) &&
    (user?.role === "branch_manager" || 
     (permissions.canAssignInDepartment && c.departmentId === user?.departmentId));

  const canSendToReview = (c: LawCase) => 
    permissions.canManageDepartment && 
    (c.status === CaseStatus.STUDY || c.status === CaseStatus.DRAFTING || c.status === CaseStatus.AMENDMENTS);

  const canReview = (c: LawCase) => 
    permissions.canReviewCases && 
    c.status === CaseStatus.REVIEW_COMMITTEE;

  const canClose = (c: LawCase) => 
    permissions.canCloseCases && 
    (c.status === CaseStatus.READY_TO_SUBMIT || c.status === CaseStatus.SUBMITTED);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة القضايا</h1>
          <p className="text-muted-foreground">متابعة وإدارة جميع القضايا</p>
        </div>
        {permissions.canAddCasesAndConsultations && (
          <Button data-testid="button-add-case" onClick={() => { resetForm(); setShowAddDialog(true); }}>
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
              <Input
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
                <SelectItem value="all">جميع الحالات</SelectItem>
                {Object.entries(CaseStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {Object.values(CaseType).map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-classification-filter">
                <SelectValue placeholder="التصنيف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع التصنيفات</SelectItem>
                {Object.entries(CaseClassificationLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم القضية</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">التصنيف</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">المرحلة</TableHead>
                <TableHead className="text-right">المحامي المسؤول</TableHead>
                <TableHead className="text-right">الأولوية</TableHead>
                <TableHead className="text-right">القسم</TableHead>
                <TableHead className="text-right">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCases.map((c) => (
                <TableRow key={c.id} data-testid={`row-case-${c.id}`}>
                  <TableCell className="font-medium bidi-override">{c.caseNumber}</TableCell>
                  <TableCell>{getClientName(c.clientId)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      c.caseClassification === CaseClassification.DEFENDANT
                        ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                        : c.caseClassification === CaseClassification.PLAINTIFF_EXISTING
                        ? "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
                        : ""
                    }>
                      {CaseClassificationLabels[c.caseClassification as CaseClassificationValue] || "مدعي - جديدة"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.caseType === "أخرى" ? (c.caseTypeOther || "أخرى") : c.caseType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-accent/20 text-accent border-accent/30">
                      {c.currentStage ? getStageLabel(c.currentStage, c.caseClassification as CaseClassificationValue) : CaseStatusLabels[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{getLawyerName(c.responsibleLawyerId || c.primaryLawyerId)}</TableCell>
                  <TableCell>
                    <Badge className={getPriorityColor(c.priority)}>{c.priority}</Badge>
                  </TableCell>
                  <TableCell>{c.departmentId === "أخرى" ? (c.departmentOther || "أخرى") : getDepartmentName(c.departmentId)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-view-${c.id}`}
                        onClick={() => openDetailsDialog(c)}
                      >
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-actions-${c.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canAssign(c) && (
                            <DropdownMenuItem data-testid={`button-assign-${c.id}`} onClick={() => openAssignDialog(c)}>
                              <UserPlus className="w-4 h-4 ml-2" />
                              إسناد القضية
                            </DropdownMenuItem>
                          )}
                          {canSendToReview(c) && (
                            <DropdownMenuItem data-testid={`button-send-review-${c.id}`} onClick={() => handleSendToReview(c)}>
                              <Send className="w-4 h-4 ml-2" />
                              إرسال للمراجعة
                            </DropdownMenuItem>
                          )}
                          {canReview(c) && (
                            <>
                              <DropdownMenuItem data-testid={`button-review-checklist-${c.id}`} onClick={() => openReviewDialog(c)}>
                                <ClipboardCheck className="w-4 h-4 ml-2" />
                                قائمة المراجعة
                              </DropdownMenuItem>
                              <DropdownMenuItem data-testid={`button-approve-${c.id}`} onClick={() => handleApprove(c)}>
                                <CheckCircle className="w-4 h-4 ml-2 text-green-600" />
                                اعتماد القضية
                              </DropdownMenuItem>
                              <DropdownMenuItem data-testid={`button-reject-${c.id}`} onClick={() => openRejectDialog(c)}>
                                <XCircle className="w-4 h-4 ml-2 text-destructive" />
                                إعادة للتعديل
                              </DropdownMenuItem>
                            </>
                          )}
                          {canClose(c) && (
                            <DropdownMenuItem data-testid={`button-close-${c.id}`} onClick={() => handleClose(c)}>
                              <Archive className="w-4 h-4 ml-2" />
                              إغلاق القضية
                            </DropdownMenuItem>
                          )}
                          {isDeptHead && c.departmentId === user?.departmentId && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem data-testid={`button-transfer-${c.id}`} onClick={() => openTransferDialog(c)}>
                                <ArrowLeftRight className="w-4 h-4 ml-2" />
                                طلب تحويل لقسم آخر
                              </DropdownMenuItem>
                            </>
                          )}
                          {permissions.canSendReminders && (c.responsibleLawyerId || c.primaryLawyerId) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem data-testid={`button-reminder-${c.id}`} onClick={() => openReminderDialog(c)}>
                                <Bell className="w-4 h-4 ml-2 text-accent" />
                                إرسال تذكير
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

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة قضية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">تصنيف القضية</Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  data-testid="classification-plaintiff-new"
                  onClick={() => setFormData({ ...formData, caseClassification: CaseClassification.PLAINTIFF_NEW, previousHearingsCount: 0, currentSituation: "", responseDeadline: "" })}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    formData.caseClassification === CaseClassification.PLAINTIFF_NEW
                      ? "border-[#D4AF37] bg-[#D4AF37]/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <FileText className="h-6 w-6 text-[#345774]" />
                  <span className="text-xs font-medium text-center">مدعي - قضية جديدة</span>
                </button>
                <button
                  type="button"
                  data-testid="classification-plaintiff-existing"
                  onClick={() => setFormData({ ...formData, caseClassification: CaseClassification.PLAINTIFF_EXISTING, responseDeadline: "" })}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    formData.caseClassification === CaseClassification.PLAINTIFF_EXISTING
                      ? "border-[#D4AF37] bg-[#D4AF37]/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <Shield className="h-6 w-6 text-blue-600" />
                  <span className="text-xs font-medium text-center">مدعي - قضية مقيدة</span>
                </button>
                <button
                  type="button"
                  data-testid="classification-defendant"
                  onClick={() => setFormData({ ...formData, caseClassification: CaseClassification.DEFENDANT, previousHearingsCount: 0, currentSituation: "", priority: "عاجل" })}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    formData.caseClassification === CaseClassification.DEFENDANT
                      ? "border-red-500 bg-red-500/10"
                      : "border-border hover-elevate"
                  }`}
                >
                  <Swords className="h-6 w-6 text-red-600" />
                  <span className="text-xs font-medium text-center">مدعى عليه</span>
                </button>
              </div>
            </div>

            {formData.caseClassification === CaseClassification.DEFENDANT && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span className="text-xs text-red-700 dark:text-red-400">سيتم إنشاء مذكرة جوابية عاجلة وإشعار فوري تلقائيًا</span>
              </div>
            )}

            {formData.caseClassification && (
              <>
                <div>
                  <Label>العميل</Label>
                  <ClientAutocomplete
                    value={formData.clientId}
                    onChange={(clientId) => setFormData({ ...formData, clientId })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>نوع القضية</Label>
                    <Select
                      value={formData.caseType}
                      onValueChange={(value: CaseTypeValue) => setFormData({ ...formData, caseType: value, caseTypeOther: "" })}
                    >
                      <SelectTrigger data-testid="select-case-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(CaseType).map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.caseType === "أخرى" && (
                      <Input
                        data-testid="input-case-type-other"
                        value={formData.caseTypeOther}
                        onChange={(e) => setFormData({ ...formData, caseTypeOther: e.target.value })}
                        placeholder="اكتب نوع القضية..."
                        className="mt-2"
                      />
                    )}
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
                    <Input
                      data-testid="input-department-other"
                      value={formData.departmentOther}
                      onChange={(e) => setFormData({ ...formData, departmentOther: e.target.value })}
                      placeholder="اكتب اسم القسم..."
                      className="mt-2"
                    />
                  )}
                </div>
                <div>
                  <Label>اسم المحكمة</Label>
                  <Input
                    data-testid="input-court-name"
                    value={formData.courtName}
                    onChange={(e) => setFormData({ ...formData, courtName: e.target.value })}
                    placeholder="مثال: المحكمة التجارية بالرياض"
                  />
                </div>
                <div>
                  <Label>رقم القضية بالمحكمة</Label>
                  <Input
                    data-testid="input-court-case-number"
                    value={formData.courtCaseNumber}
                    onChange={(e) => setFormData({ ...formData, courtCaseNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>اسم الخصم</Label>
                  <Input
                    data-testid="input-opponent-name"
                    value={formData.opponentName}
                    onChange={(e) => setFormData({ ...formData, opponentName: e.target.value })}
                  />
                </div>

                {formData.caseClassification === CaseClassification.PLAINTIFF_EXISTING && (
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
                  </>
                )}

                {formData.caseClassification === CaseClassification.DEFENDANT && (
                  <>
                    <div>
                      <Label>مهلة الرد (تاريخ)</Label>
                      <Input
                        dir="ltr"
                        data-testid="input-response-deadline"
                        type="date"
                        value={formData.responseDeadline}
                        onChange={(e) => setFormData({ ...formData, responseDeadline: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>تاريخ الجلسة القادمة (اختياري)</Label>
                        <Input
                          dir="ltr"
                          data-testid="input-next-hearing-date"
                          type="date"
                          value={formData.nextHearingDate}
                          onChange={(e) => setFormData({ ...formData, nextHearingDate: e.target.value })}
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
                  </>
                )}
              </>
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
            <DialogTitle>إسناد القضية</DialogTitle>
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
                  {lawyers
                    .filter(l => !assignData.departmentId || l.departmentId === assignData.departmentId)
                    .map((lawyer) => (
                      <SelectItem key={lawyer.id} value={lawyer.id}>{lawyer.name}</SelectItem>
                    ))}
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
              إسناد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة القضية للتعديل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ملاحظات المراجعة</Label>
              <Textarea
                data-testid="input-reject-notes"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="اكتب ملاحظاتك للمحامي..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>إلغاء</Button>
            <Button 
              data-testid="button-confirm-reject" 
              onClick={handleReject}
              disabled={!rejectNotes}
              variant="destructive"
            >
              إعادة للتعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsDialog} onOpenChange={(open) => { setShowDetailsDialog(open); if (!open) setActiveTab("info"); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="bidi-override">تفاصيل القضية {selectedCase?.caseNumber}</DialogTitle>
          </DialogHeader>
          {selectedCase && (
            <div className="space-y-6">
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-4 text-center">مراحل القضية</h4>
                <CaseProgressBar
                  currentStage={selectedCase.currentStage}
                  userRole={user?.role || "employee"}
                  caseClassification={selectedCase.caseClassification as CaseClassificationValue}
                  onMoveToNext={async (notes) => {
                    if (user) {
                      const success = await moveToNextStage(selectedCase.id, user.id, user.name, notes, user.role);
                      if (success) {
                        toast({ title: "تم نقل القضية للمرحلة التالية" });
                      } else {
                        toast({ title: "لا يمكن نقل القضية", description: "ليس لديك صلاحية لهذا الانتقال", variant: "destructive" });
                      }
                    }
                  }}
                  onMoveToPrevious={async (notes) => {
                    if (user) {
                      const success = await moveToPreviousStage(selectedCase.id, user.id, user.name, notes, user.role);
                      if (success) {
                        toast({ title: "تم إرجاع القضية للمرحلة السابقة" });
                      } else {
                        toast({ title: "لا يمكن إرجاع القضية", description: "ليس لديك صلاحية لهذا الإرجاع", variant: "destructive" });
                      }
                    }
                  }}
                />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
                  <TabsTrigger value="info" data-testid="tab-info">المعلومات</TabsTrigger>
                  <TabsTrigger value="hearings" data-testid="tab-hearings">الجلسات</TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">سجل المراحل</TabsTrigger>
                  <TabsTrigger value="attachments" data-testid="tab-attachments">المرفقات</TabsTrigger>
                  <TabsTrigger value="comments" data-testid="tab-comments">التعليقات</TabsTrigger>
                  <TabsTrigger value="activity" data-testid="tab-activity">النشاط</TabsTrigger>
                  <TabsTrigger value="notes" data-testid="tab-notes">ملاحظات</TabsTrigger>
                  <TabsTrigger value="deadlines" data-testid="tab-deadlines">مواعيد</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">العميل</Label>
                      <p className="font-medium">{getClientName(selectedCase.clientId)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المحامي المسؤول</Label>
                      <p className="font-medium">{getLawyerName(selectedCase.responsibleLawyerId || selectedCase.primaryLawyerId)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">النوع</Label>
                      <p>{selectedCase.caseType === "أخرى" ? (selectedCase.caseTypeOther || "أخرى") : selectedCase.caseType}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الأولوية</Label>
                      <Badge className={getPriorityColor(selectedCase.priority)}>{selectedCase.priority}</Badge>
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
                      <Label className="text-muted-foreground">رقم القضية بالمحكمة</Label>
                      <p>{selectedCase.courtCaseNumber || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الدائرة</Label>
                      <p>{selectedCase.circuitNumber || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">القاضي</Label>
                      <p>{selectedCase.judgeName || "-"}</p>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">بيانات الخصم</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">اسم الخصم</Label>
                        <p>{selectedCase.opponentName || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">هاتف الخصم</Label>
                        <p>{selectedCase.opponentPhone || "-"}</p>
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
                  
                  <div className="border-t pt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>تاريخ الإنشاء: {format(new Date(selectedCase.createdAt), "d MMMM yyyy", { locale: ar })}</span>
                      <span>آخر تحديث: {format(new Date(selectedCase.updatedAt), "d MMMM yyyy", { locale: ar })}</span>
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
                              <TableCell>{format(new Date(hearing.hearingDate), "d MMMM yyyy", { locale: ar })}</TableCell>
                              <TableCell>{hearing.hearingTime}</TableCell>
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
                              <span>{format(new Date(transition.timestamp), "d MMMM yyyy - HH:mm", { locale: ar })}</span>
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
                          <Input
                            data-testid="input-attachment-name"
                            placeholder="مثال: عقد التأسيس"
                            value={attachmentForm.fileName}
                            onChange={(e) => setAttachmentForm({ ...attachmentForm, fileName: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>رابط الملف (URL)</Label>
                          <Input
                            data-testid="input-attachment-url"
                            placeholder="https://drive.google.com/..."
                            value={attachmentForm.fileUrl}
                            onChange={(e) => setAttachmentForm({ ...attachmentForm, fileUrl: e.target.value })}
                            dir="ltr"
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
                                  <span>{format(new Date(att.createdAt), "d MMMM yyyy - HH:mm", { locale: ar })}</span>
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
                                  {format(new Date(comment.createdAt), "d MMMM yyyy - HH:mm", { locale: ar })}
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
                  <CaseDeadlinesTab caseId={selectedCase?.id || ""} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              مراجعة القضية: {selectedCase?.caseNumber}
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
        <DialogContent className="max-w-md">
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
                  value={users.find(u => u.id === reminderData.recipientId)?.fullName || "المحامي المسؤول"}
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
                      <SelectItem key={l.id} value={l.id}>{l.fullName}</SelectItem>
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
        <DialogContent className="max-w-md">
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
    </div>
  );
}
