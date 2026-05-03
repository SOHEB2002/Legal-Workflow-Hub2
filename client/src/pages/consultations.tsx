import { useState } from "react";
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
import { Plus, Search, MessageSquare, Send, CheckCircle, XCircle, FileText, ClipboardCheck, Bell, MoreHorizontal, UserPlus, ArrowLeftRight, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConsultations } from "@/lib/consultations-context";
import { useFavorites } from "@/lib/favorites-context";
import { useClients } from "@/lib/clients-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import type { Consultation, ConsultationStatusValue, CaseTypeValue, DeliveryTypeValue } from "@shared/schema";
import { ConsultationStatus, ConsultationStatusLabels, DeliveryType, Department } from "@shared/schema";
import { useStandards } from "@/lib/standards-context";
import { ReviewChecklist } from "@/components/review-checklist";
import { ConsultationStagesBar } from "@/components/consultation-stages-bar";
import { DialogFooter } from "@/components/ui/dialog";
import { sendConsultationReminder, requestConsultationTransfer } from "@/lib/notification-triggers";

function getStatusColor(status: ConsultationStatusValue) {
  switch (status) {
    case ConsultationStatus.RECEIVED:
      return "bg-primary/20 text-primary border-primary/30";
    case ConsultationStatus.STUDY:
    case ConsultationStatus.PREPARING_RESPONSE:
      return "bg-accent/20 text-accent border-accent/30";
    case ConsultationStatus.REVIEW_COMMITTEE:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case ConsultationStatus.AMENDMENTS:
      return "bg-destructive/20 text-destructive border-destructive/30";
    case ConsultationStatus.READY:
      return "bg-accent/30 text-accent border-accent/40";
    case ConsultationStatus.DELIVERED:
    case ConsultationStatus.CLOSED:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function ConsultationsPage() {
  const {
    consultations,
    addConsultation,
    updateConsultation,
    assignConsultation,
    sendToReviewCommittee,
    approveConsultation,
    rejectConsultation,
    markDelivered,
    closeConsultation,
    deleteConsultation,
  } = useConsultations();
  const { clients, getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions, users } = useAuth();
  const { addRecentVisit } = useFavorites();
  const { getStandardsByType } = useStandards();
  const { toast } = useToast();
  const lawyers = users.filter(u => u.canBeAssignedConsultations);
  const consultationReviewStandards = getStandardsByType("legal_consultation");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [consultationToReview, setConsultationToReview] = useState<Consultation | null>(null);

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignConsultationId, setAssignConsultationId] = useState<string | null>(null);
  const [assignData, setAssignData] = useState({ lawyerId: "", departmentId: "" });

  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderConsultation, setReminderConsultation] = useState<Consultation | null>(null);
  const [reminderData, setReminderData] = useState({
    reminderType: "تذكير بتحديث الحالة",
    message: "",
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [consultationToDelete, setConsultationToDelete] = useState<Consultation | null>(null);
  const [showConsultRejectDialog, setShowConsultRejectDialog] = useState(false);
  const [consultRejectNotes, setConsultRejectNotes] = useState("");
  const [consultationToReject, setConsultationToReject] = useState<Consultation | null>(null);

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

  const handleConsultReject = () => {
    if (!consultationToReject) return;
    rejectConsultation(consultationToReject.id, consultRejectNotes || "تم إضافة ملاحظات من لجنة المراجعة", user?.role);
    toast({ title: "تم إرسال الاستشارة للأخذ بالملاحظات" });
    setShowConsultRejectDialog(false);
    setConsultationToReject(null);
    setConsultRejectNotes("");
  };

  const consultationLawyers = users.filter(u => u.canBeAssignedConsultations);
  const isDeptHead = user?.role === "department_head";

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferConsultationId, setTransferConsultationId] = useState<string | null>(null);
  const [transferData, setTransferData] = useState({ toDepartmentId: "", reason: "" });

  const canAssignConsultation = (c: Consultation) =>
    c.status === ConsultationStatus.RECEIVED &&
    (user?.role === "branch_manager" ||
     (permissions.canAssignInDepartment && c.departmentId === user?.departmentId));

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

  const handleAssignConsultation = () => {
    if (!assignConsultationId || !assignData.lawyerId || !assignData.departmentId) return;
    assignConsultation(assignConsultationId, assignData.lawyerId, assignData.departmentId);
    toast({ title: "تم إسناد الاستشارة بنجاح" });
    setShowAssignDialog(false);
    setAssignConsultationId(null);
    setAssignData({ lawyerId: "", departmentId: "" });
  };

  const handleSendToReview = (consultation: Consultation) => {
    sendToReviewCommittee(consultation.id);
    toast({ title: "تم إرسال الاستشارة للمراجعة" });
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

  const filteredConsultations = consultations.filter((consultation) => {
    const clientName = getClientName(consultation.clientId);
    const matchesSearch =
      consultation.consultationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      consultation.questionSummary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || consultation.status === statusFilter;
    return matchesSearch && matchesStatus;
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
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search-consultations"
                placeholder="بحث برقم الاستشارة أو العميل..."
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
                {Object.entries(ConsultationStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <Badge className={getStatusColor(consultation.status)}>
                      {ConsultationStatusLabels[consultation.status]}
                    </Badge>
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
                          {(consultation.status === ConsultationStatus.STUDY ||
                            consultation.status === ConsultationStatus.PREPARING_RESPONSE ||
                            consultation.status === ConsultationStatus.AMENDMENTS) &&
                            (permissions.canManageDepartment || consultation.assignedTo === user?.id) && (
                            <DropdownMenuItem data-testid={`button-send-review-${consultation.id}`} onClick={() => handleSendToReview(consultation)}>
                              <Send className="w-4 h-4 ml-2" />
                              إرسال للمراجعة
                            </DropdownMenuItem>
                          )}
                          {consultation.status === ConsultationStatus.REVIEW_COMMITTEE &&
                            permissions.canReviewConsultations && (
                              <>
                                <DropdownMenuItem data-testid={`button-review-checklist-${consultation.id}`} onClick={() => { setConsultationToReview(consultation); setShowReviewDialog(true); }}>
                                  <ClipboardCheck className="w-4 h-4 ml-2" />
                                  قائمة المراجعة
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  data-testid={`button-reject-${consultation.id}`}
                                  onClick={() => { setConsultationToReject(consultation); setConsultRejectNotes(""); setShowConsultRejectDialog(true); }}
                                  className="text-amber-700 focus:text-amber-700"
                                >
                                  <MessageSquare className="w-4 h-4 ml-2 text-amber-600" />
                                  تم إضافة ملاحظات
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  data-testid={`button-approve-${consultation.id}`}
                                  onClick={() => { approveConsultation(consultation.id, undefined, user?.role); toast({ title: "تم اعتماد الاستشارة — جاهزة للرفع" }); }}
                                  className="text-green-700 focus:text-green-700"
                                >
                                  <CheckCircle className="w-4 h-4 ml-2 text-green-600" />
                                  لا يوجد ملاحظات
                                </DropdownMenuItem>
                              </>
                            )}
                          {consultation.status === ConsultationStatus.READY && permissions.canCloseCases && (
                            <DropdownMenuItem data-testid={`button-deliver-${consultation.id}`} onClick={() => markDelivered(consultation.id)}>
                              <FileText className="w-4 h-4 ml-2" />
                              تسليم الاستشارة
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

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              <span>مراجعة الاستشارة:</span>
              <LtrInline>{consultationToReview?.consultationNumber}</LtrInline>
            </DialogTitle>
          </DialogHeader>
          {consultationToReview && consultationReviewStandards.length > 0 && (
            <ReviewChecklist
              standardId={consultationReviewStandards[0].id}
              targetId={consultationToReview.id}
              targetType="consultation"
              onSave={() => {
                setShowReviewDialog(false);
                setConsultationToReview(null);
                toast({ title: "تم حفظ نتيجة المراجعة" });
              }}
              onClose={() => {
                setShowReviewDialog(false);
                setConsultationToReview(null);
              }}
            />
          )}
          {consultationReviewStandards.length === 0 && (
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
            <Button onClick={handleAssignConsultation} disabled={!assignData.lawyerId || !assignData.departmentId} data-testid="button-confirm-assign">
              <UserPlus className="w-4 h-4 ml-2" />
              إسناد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={showConsultRejectDialog} onOpenChange={setShowConsultRejectDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تم إضافة ملاحظات — الأخذ بملاحظات اللجنة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">سيتم إرسال الاستشارة لمرحلة الأخذ بالملاحظات. يمكنك إضافة ملاحظات توضيحية اختيارية.</p>
            <div>
              <Label>ملاحظات اللجنة (اختياري)</Label>
              <Textarea
                data-testid="input-consult-reject-notes"
                value={consultRejectNotes}
                onChange={(e) => setConsultRejectNotes(e.target.value)}
                placeholder="ملاحظات اللجنة للمحامي المسؤول..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsultRejectDialog(false)}>إلغاء</Button>
            <Button
              data-testid="button-confirm-consult-reject"
              onClick={handleConsultReject}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              إرسال للأخذ بالملاحظات
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
