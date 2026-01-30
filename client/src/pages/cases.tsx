import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Plus,
  Search,
  Filter,
  ExternalLink,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  Archive,
  Pencil,
  Trash2,
  UserPlus,
  MessageSquare,
  FolderOpen,
  AlertTriangle,
} from "lucide-react";
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
  DialogDescription,
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
import { useToast } from "@/hooks/use-toast";
import { useCases } from "@/lib/cases-context";
import { useAuth } from "@/lib/auth-context";
import { CaseStatus, CaseType } from "@shared/schema";
import type { LawCase, InsertCase, CaseStatusValue, CaseTypeValue } from "@shared/schema";

function getStatusColor(status: string) {
  switch (status) {
    case CaseStatus.NEW:
      return "bg-primary/20 text-primary border-primary/30";
    case CaseStatus.IN_PROGRESS:
      return "bg-accent/20 text-accent border-accent/30";
    case CaseStatus.REVIEW:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case CaseStatus.READY:
      return "bg-accent/30 text-accent border-accent/40";
    case CaseStatus.CLOSED:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const lawyers = [
  { id: "1", name: "المحامي عمر" },
  { id: "2", name: "المحامي مهند" },
];

export default function CasesPage() {
  const { cases, addCase, updateCase, deleteCase, assignCase, sendToReview, approveCase, rejectCase, closeCase } = useCases();
  const { user, isAdmin, isSecretary } = useAuth();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedCase, setSelectedCase] = useState<LawCase | null>(null);

  const [formData, setFormData] = useState<Partial<InsertCase>>({
    clientName: "",
    caseType: "استشارة",
    whatsappLink: "",
    driveLink: "",
    nextHearingDate: "",
    notes: "",
  });

  const [assignTo, setAssignTo] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchesSearch =
        c.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.notes.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesType = typeFilter === "all" || c.caseType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [cases, searchQuery, statusFilter, typeFilter]);

  const resetForm = () => {
    setFormData({
      clientName: "",
      caseType: "استشارة",
      whatsappLink: "",
      driveLink: "",
      nextHearingDate: "",
      notes: "",
    });
  };

  const handleAddCase = () => {
    if (!formData.clientName) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "اسم العميل مطلوب",
      });
      return;
    }

    addCase(
      {
        clientName: formData.clientName,
        caseType: formData.caseType as CaseTypeValue,
        whatsappLink: formData.whatsappLink || "",
        driveLink: formData.driveLink || "",
        nextHearingDate: formData.nextHearingDate || null,
        notes: formData.notes || "",
      },
      user?.id || ""
    );

    toast({
      title: "تم إضافة الطلب",
      description: "تم إضافة الطلب الجديد بنجاح",
    });

    setShowAddDialog(false);
    resetForm();
  };

  const handleEditCase = () => {
    if (!selectedCase || !formData.clientName) return;

    updateCase(selectedCase.id, {
      clientName: formData.clientName,
      caseType: formData.caseType as CaseTypeValue,
      whatsappLink: formData.whatsappLink,
      driveLink: formData.driveLink,
      nextHearingDate: formData.nextHearingDate || null,
      notes: formData.notes,
    });

    toast({
      title: "تم التحديث",
      description: "تم تحديث بيانات الملف بنجاح",
    });

    setShowEditDialog(false);
    setSelectedCase(null);
    resetForm();
  };

  const handleAssign = () => {
    if (!selectedCase || !assignTo) return;

    assignCase(selectedCase.id, assignTo);

    toast({
      title: "تم التوزيع",
      description: "تم توزيع الملف على المحامي المختص",
    });

    setShowAssignDialog(false);
    setSelectedCase(null);
    setAssignTo("");
  };

  const handleSendToReview = (c: LawCase) => {
    sendToReview(c.id);
    toast({
      title: "تم الإرسال للمراجعة",
      description: "تم إرسال الملف للمراجعة",
    });
  };

  const handleApprove = () => {
    if (!selectedCase) return;
    approveCase(selectedCase.id);
    toast({
      title: "تم الاعتماد",
      description: "تم اعتماد الملف وهو جاهز للتسليم",
    });
    setShowReviewDialog(false);
    setSelectedCase(null);
  };

  const handleReject = () => {
    if (!selectedCase) return;
    rejectCase(selectedCase.id, rejectNotes);
    toast({
      title: "تم الإعادة",
      description: "تم إعادة الملف للتنفيذ مع الملاحظات",
    });
    setShowRejectDialog(false);
    setSelectedCase(null);
    setRejectNotes("");
  };

  const handleClose = (c: LawCase) => {
    closeCase(c.id);
    toast({
      title: "تم الإغلاق",
      description: "تم إغلاق الملف وأرشفته",
    });
  };

  const handleDelete = () => {
    if (!selectedCase) return;
    deleteCase(selectedCase.id);
    toast({
      title: "تم الحذف",
      description: "تم حذف الملف بنجاح",
    });
    setShowDeleteDialog(false);
    setSelectedCase(null);
  };

  const openEditDialog = (c: LawCase) => {
    setSelectedCase(c);
    setFormData({
      clientName: c.clientName,
      caseType: c.caseType,
      whatsappLink: c.whatsappLink,
      driveLink: c.driveLink,
      nextHearingDate: c.nextHearingDate || "",
      notes: c.notes,
    });
    setShowEditDialog(true);
  };

  const openAssignDialog = (c: LawCase) => {
    setSelectedCase(c);
    setAssignTo("");
    setShowAssignDialog(true);
  };

  const openReviewDialog = (c: LawCase) => {
    setSelectedCase(c);
    setShowReviewDialog(true);
  };

  const openRejectDialog = () => {
    setShowReviewDialog(false);
    setRejectNotes("");
    setShowRejectDialog(true);
  };

  const getLawyerName = (id: string | null) => {
    if (!id) return "غير محدد";
    return lawyers.find((l) => l.id === id)?.name || "غير محدد";
  };

  const isHearingClose = (date: string | null) => {
    if (!date) return false;
    const hearingDate = new Date(date);
    const today = new Date();
    const diffDays = Math.ceil((hearingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة القضايا</h1>
          <p className="text-muted-foreground mt-1">عرض وإدارة جميع الملفات والقضايا</p>
        </div>
        {isSecretary && (
          <Button
            data-testid="button-add-case"
            onClick={() => {
              resetForm();
              setShowAddDialog(true);
            }}
            className="bg-accent text-accent-foreground"
          >
            <Plus className="w-4 h-4 ml-2" />
            إضافة طلب جديد
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                placeholder="البحث في القضايا..."
                className="pr-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter" className="w-40">
                  <Filter className="w-4 h-4 ml-2" />
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  {Object.values(CaseStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-type-filter" className="w-40">
                  <SelectValue placeholder="النوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأنواع</SelectItem>
                  {Object.values(CaseType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد قضايا مطابقة للبحث</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCases.map((c) => (
                <div
                  key={c.id}
                  data-testid={`case-item-${c.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg bg-muted/30 border border-border gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-semibold text-foreground">{c.clientName}</h3>
                      <Badge variant="outline" className={getStatusColor(c.status)}>
                        {c.status}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {c.caseType}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span>المحامي: {getLawyerName(c.assignedTo)}</span>
                      {c.nextHearingDate && (
                        <span className={`flex items-center gap-1 ${isHearingClose(c.nextHearingDate) ? "text-destructive font-medium" : ""}`}>
                          {isHearingClose(c.nextHearingDate) && <AlertTriangle className="w-3 h-3" />}
                          الجلسة: {format(new Date(c.nextHearingDate), "d MMM yyyy", { locale: ar })}
                        </span>
                      )}
                    </div>
                    {c.reviewNotes && (
                      <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                        ملاحظات المراجعة: {c.reviewNotes}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.whatsappLink && (
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-whatsapp-${c.id}`}
                        onClick={() => window.open(c.whatsappLink, "_blank")}
                        title="مجموعة الواتساب"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                    )}
                    {c.driveLink && (
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-drive-${c.id}`}
                        onClick={() => window.open(c.driveLink, "_blank")}
                        title="ملف Google Drive"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" data-testid={`button-actions-${c.id}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          data-testid={`menu-edit-${c.id}`}
                          onClick={() => openEditDialog(c)}
                        >
                          <Pencil className="w-4 h-4 ml-2" />
                          تعديل
                        </DropdownMenuItem>
                        
                        {isSecretary && c.status === CaseStatus.NEW && (
                          <DropdownMenuItem
                            data-testid={`menu-assign-${c.id}`}
                            onClick={() => openAssignDialog(c)}
                          >
                            <UserPlus className="w-4 h-4 ml-2" />
                            توزيع على محامي
                          </DropdownMenuItem>
                        )}

                        {isAdmin && c.status === CaseStatus.IN_PROGRESS && (
                          <DropdownMenuItem
                            data-testid={`menu-send-review-${c.id}`}
                            onClick={() => handleSendToReview(c)}
                          >
                            <Send className="w-4 h-4 ml-2" />
                            إرسال للمراجعة
                          </DropdownMenuItem>
                        )}

                        {isAdmin && c.status === CaseStatus.REVIEW && (
                          <DropdownMenuItem
                            data-testid={`menu-review-${c.id}`}
                            onClick={() => openReviewDialog(c)}
                          >
                            <CheckCircle className="w-4 h-4 ml-2" />
                            مراجعة واعتماد
                          </DropdownMenuItem>
                        )}

                        {isSecretary && c.status === CaseStatus.READY && (
                          <DropdownMenuItem
                            data-testid={`menu-close-${c.id}`}
                            onClick={() => handleClose(c)}
                          >
                            <Archive className="w-4 h-4 ml-2" />
                            إغلاق وأرشفة
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          data-testid={`menu-delete-${c.id}`}
                          className="text-destructive"
                          onClick={() => {
                            setSelectedCase(c);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 ml-2" />
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة طلب جديد</DialogTitle>
            <DialogDescription>أدخل بيانات الطلب الجديد</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم العميل *</Label>
              <Input
                data-testid="input-client-name"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                placeholder="أدخل اسم العميل"
              />
            </div>
            <div>
              <Label>نوع الطلب</Label>
              <Select
                value={formData.caseType}
                onValueChange={(v) => setFormData({ ...formData, caseType: v as CaseTypeValue })}
              >
                <SelectTrigger data-testid="select-case-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CaseType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>رابط مجموعة الواتساب</Label>
              <Input
                data-testid="input-whatsapp"
                value={formData.whatsappLink}
                onChange={(e) => setFormData({ ...formData, whatsappLink: e.target.value })}
                placeholder="https://wa.me/..."
              />
            </div>
            <div>
              <Label>رابط ملف Google Drive</Label>
              <Input
                data-testid="input-drive"
                value={formData.driveLink}
                onChange={(e) => setFormData({ ...formData, driveLink: e.target.value })}
                placeholder="https://drive.google.com/..."
              />
            </div>
            <div>
              <Label>موعد الجلسة القادمة</Label>
              <Input
                data-testid="input-hearing-date"
                type="date"
                value={formData.nextHearingDate}
                onChange={(e) => setFormData({ ...formData, nextHearingDate: e.target.value })}
              />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                data-testid="input-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="أدخل أي ملاحظات إضافية"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              إلغاء
            </Button>
            <Button
              data-testid="button-submit-add"
              onClick={handleAddCase}
              className="bg-accent text-accent-foreground"
            >
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل الملف</DialogTitle>
            <DialogDescription>تعديل بيانات الملف</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم العميل *</Label>
              <Input
                data-testid="input-edit-client-name"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
              />
            </div>
            <div>
              <Label>نوع الطلب</Label>
              <Select
                value={formData.caseType}
                onValueChange={(v) => setFormData({ ...formData, caseType: v as CaseTypeValue })}
              >
                <SelectTrigger data-testid="select-edit-case-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CaseType).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>رابط مجموعة الواتساب</Label>
              <Input
                data-testid="input-edit-whatsapp"
                value={formData.whatsappLink}
                onChange={(e) => setFormData({ ...formData, whatsappLink: e.target.value })}
              />
            </div>
            <div>
              <Label>رابط ملف Google Drive</Label>
              <Input
                data-testid="input-edit-drive"
                value={formData.driveLink}
                onChange={(e) => setFormData({ ...formData, driveLink: e.target.value })}
              />
            </div>
            <div>
              <Label>موعد الجلسة القادمة</Label>
              <Input
                data-testid="input-edit-hearing-date"
                type="date"
                value={formData.nextHearingDate || ""}
                onChange={(e) => setFormData({ ...formData, nextHearingDate: e.target.value })}
              />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                data-testid="input-edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              إلغاء
            </Button>
            <Button
              data-testid="button-submit-edit"
              onClick={handleEditCase}
              className="bg-accent text-accent-foreground"
            >
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>توزيع الملف</DialogTitle>
            <DialogDescription>اختر المحامي المختص لهذا الملف</DialogDescription>
          </DialogHeader>
          <div>
            <Label>المحامي المختص</Label>
            <Select value={assignTo} onValueChange={setAssignTo}>
              <SelectTrigger data-testid="select-assign-lawyer">
                <SelectValue placeholder="اختر المحامي" />
              </SelectTrigger>
              <SelectContent>
                {lawyers.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              إلغاء
            </Button>
            <Button
              data-testid="button-submit-assign"
              onClick={handleAssign}
              disabled={!assignTo}
              className="bg-accent text-accent-foreground"
            >
              توزيع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مراجعة الملف</DialogTitle>
            <DialogDescription>
              {selectedCase?.clientName} - {selectedCase?.caseType}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">الملاحظات:</p>
            <p className="text-foreground">{selectedCase?.notes || "لا توجد ملاحظات"}</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
              إلغاء
            </Button>
            <Button
              data-testid="button-reject"
              variant="destructive"
              onClick={openRejectDialog}
            >
              <XCircle className="w-4 h-4 ml-2" />
              إعادة
            </Button>
            <Button
              data-testid="button-approve"
              onClick={handleApprove}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة الملف للتنفيذ</DialogTitle>
            <DialogDescription>أدخل ملاحظات الإعادة</DialogDescription>
          </DialogHeader>
          <div>
            <Label>ملاحظات الإعادة</Label>
            <Textarea
              data-testid="input-reject-notes"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="أدخل سبب الإعادة والتعديلات المطلوبة"
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              إلغاء
            </Button>
            <Button
              data-testid="button-submit-reject"
              variant="destructive"
              onClick={handleReject}
            >
              إعادة للتنفيذ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الملف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف ملف "{selectedCase?.clientName}"؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground"
              onClick={handleDelete}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
