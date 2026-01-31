import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Plus,
  Search,
  ExternalLink,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  Archive,
  Pencil,
  UserPlus,
  MessageSquare,
  FolderOpen,
} from "lucide-react";
import { useFavorites } from "@/lib/favorites-context";
import { FavoriteButton } from "@/components/favorite-button";
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
import { useAuth, getLawyers } from "@/lib/auth-context";
import { 
  CaseStatus, 
  CaseStatusLabels, 
  CaseStageLabels,
  CaseType, 
  Priority,
  Department
} from "@shared/schema";
import type { LawCase, CaseStatusValue, CaseTypeValue, PriorityType } from "@shared/schema";
import { CaseProgressBar } from "@/components/case-progress-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHearings } from "@/lib/hearings-context";

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
  } = useCases();
  const { clients, getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions } = useAuth();
  const { getHearingsByCase } = useHearings();
  const { addRecentVisit } = useFavorites();
  const lawyers = getLawyers();
  
  const getLawyerName = (id: string | null): string => {
    if (!id) return "-";
    const lawyer = lawyers.find(l => l.id === id);
    return lawyer?.name || "-";
  };
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedCase, setSelectedCase] = useState<LawCase | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState("info");

  const [formData, setFormData] = useState({
    clientId: "",
    caseType: "عام" as CaseTypeValue,
    departmentId: "",
    priority: "متوسط" as PriorityType,
    courtName: "",
    courtCaseNumber: "",
    najizNumber: "",
    opponentName: "",
    opponentLawyer: "",
    whatsappGroupLink: "",
  });

  const [assignData, setAssignData] = useState({
    lawyerId: "",
    departmentId: "",
  });

  const resetForm = () => {
    setFormData({
      clientId: "",
      caseType: "عام",
      departmentId: "",
      priority: "متوسط",
      courtName: "",
      courtCaseNumber: "",
      najizNumber: "",
      opponentName: "",
      opponentLawyer: "",
      whatsappGroupLink: "",
    });
  };

  const handleAddCase = () => {
    if (!user || !formData.clientId) return;
    
    addCase({
      clientId: formData.clientId,
      caseType: formData.caseType,
      departmentId: formData.departmentId,
      priority: formData.priority,
      courtName: formData.courtName,
      courtCaseNumber: formData.courtCaseNumber,
      najizNumber: formData.najizNumber,
      opponentName: formData.opponentName,
      opponentLawyer: formData.opponentLawyer,
      whatsappGroupLink: formData.whatsappGroupLink,
    }, user.id, user.name);
    
    toast({ title: "تم إضافة القضية بنجاح" });
    setShowAddDialog(false);
    resetForm();
  };

  const handleAssign = () => {
    if (!selectedCase || !assignData.lawyerId || !assignData.departmentId) return;
    
    assignCase(selectedCase.id, assignData.lawyerId, assignData.departmentId);
    toast({ title: "تم إسناد القضية بنجاح" });
    setShowAssignDialog(false);
    setSelectedCase(null);
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
    setSelectedCase(null);
    setRejectNotes("");
  };

  const handleClose = (caseItem: LawCase) => {
    closeCase(caseItem.id);
    toast({ title: "تم إغلاق القضية" });
  };

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const clientName = getClientName(c.clientId);
      const matchesSearch =
        c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.najizNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesType = typeFilter === "all" || c.caseType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [cases, searchQuery, statusFilter, typeFilter, getClientName]);

  const openAssignDialog = (caseItem: LawCase) => {
    setSelectedCase(caseItem);
    setAssignData({ 
      lawyerId: caseItem.primaryLawyerId || "", 
      departmentId: caseItem.departmentId || "" 
    });
    setShowAssignDialog(true);
  };

  const openRejectDialog = (caseItem: LawCase) => {
    setSelectedCase(caseItem);
    setRejectNotes("");
    setShowRejectDialog(true);
  };

  const openDetailsDialog = (caseItem: LawCase) => {
    setSelectedCase(caseItem);
    setShowDetailsDialog(true);
    addRecentVisit("case", caseItem.id, `${caseItem.caseNumber} - ${getClientName(caseItem.clientId)}`);
  };

  const canAssign = (c: LawCase) => 
    permissions.canAddCasesAndConsultations && 
    (c.status === CaseStatus.RECEIVED || c.status === CaseStatus.DATA_COMPLETION);

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
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم القضية</TableHead>
                <TableHead className="text-right">العميل</TableHead>
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
                  <TableCell className="font-medium">{c.caseNumber}</TableCell>
                  <TableCell>{getClientName(c.clientId)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.caseType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-accent/20 text-accent border-accent/30">
                      {c.currentStage ? CaseStageLabels[c.currentStage] || c.currentStage : CaseStatusLabels[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{getLawyerName(c.responsibleLawyerId || c.primaryLawyerId)}</TableCell>
                  <TableCell>
                    <Badge className={getPriorityColor(c.priority)}>{c.priority}</Badge>
                  </TableCell>
                  <TableCell>{getDepartmentName(c.departmentId)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <FavoriteButton
                        entityType="case"
                        entityId={c.id}
                        entityTitle={`${c.caseNumber} - ${getClientName(c.clientId)}`}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-view-${c.id}`}
                            onClick={() => openDetailsDialog(c)}
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>عرض التفاصيل</TooltipContent>
                      </Tooltip>
                      
                      {canAssign(c) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-assign-${c.id}`}
                              onClick={() => openAssignDialog(c)}
                            >
                              <UserPlus className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>إسناد القضية</TooltipContent>
                        </Tooltip>
                      )}
                      
                      {canSendToReview(c) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-send-review-${c.id}`}
                              onClick={() => handleSendToReview(c)}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>إرسال للمراجعة</TooltipContent>
                        </Tooltip>
                      )}
                      
                      {canReview(c) && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-approve-${c.id}`}
                                onClick={() => handleApprove(c)}
                              >
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>اعتماد القضية</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-reject-${c.id}`}
                                onClick={() => openRejectDialog(c)}
                              >
                                <XCircle className="w-4 h-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>إعادة للتعديل</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      
                      {canClose(c) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-close-${c.id}`}
                              onClick={() => handleClose(c)}
                            >
                              <Archive className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>إغلاق القضية</TooltipContent>
                        </Tooltip>
                      )}
                      
                      {c.whatsappGroupLink && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-whatsapp-${c.id}`}
                              onClick={() => window.open(c.whatsappGroupLink, "_blank")}
                            >
                              <MessageSquare className="w-4 h-4 text-green-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>مجموعة واتساب</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة قضية جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>العميل</Label>
              <Select
                value={formData.clientId}
                onValueChange={(value) => setFormData({ ...formData, clientId: value })}
              >
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="اختر العميل" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {getClientName(client.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>نوع القضية</Label>
                <Select
                  value={formData.caseType}
                  onValueChange={(value: CaseTypeValue) => setFormData({ ...formData, caseType: value })}
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
                onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
              >
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>رقم القضية بالمحكمة</Label>
                <Input
                  data-testid="input-court-case-number"
                  value={formData.courtCaseNumber}
                  onChange={(e) => setFormData({ ...formData, courtCaseNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>رقم ناجز</Label>
                <Input
                  data-testid="input-najiz-number"
                  value={formData.najizNumber}
                  onChange={(e) => setFormData({ ...formData, najizNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>اسم الخصم</Label>
                <Input
                  data-testid="input-opponent-name"
                  value={formData.opponentName}
                  onChange={(e) => setFormData({ ...formData, opponentName: e.target.value })}
                />
              </div>
              <div>
                <Label>محامي الخصم</Label>
                <Input
                  data-testid="input-opponent-lawyer"
                  value={formData.opponentLawyer}
                  onChange={(e) => setFormData({ ...formData, opponentLawyer: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>رابط مجموعة واتساب</Label>
              <Input
                data-testid="input-whatsapp"
                value={formData.whatsappGroupLink}
                onChange={(e) => setFormData({ ...formData, whatsappGroupLink: e.target.value })}
                placeholder="https://wa.me/..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button data-testid="button-submit-case" onClick={handleAddCase} disabled={!formData.clientId}>
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
              <Select
                value={assignData.departmentId}
                onValueChange={(value) => setAssignData({ ...assignData, departmentId: value })}
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
                  {lawyers.map((lawyer) => (
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
            <DialogTitle>تفاصيل القضية {selectedCase?.caseNumber}</DialogTitle>
          </DialogHeader>
          {selectedCase && (
            <div className="space-y-6">
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-4 text-center">مراحل القضية</h4>
                <CaseProgressBar
                  currentStage={selectedCase.currentStage}
                  userRole={user?.role || "employee"}
                  onMoveToNext={(notes) => {
                    if (user) {
                      moveToNextStage(selectedCase.id, user.id, user.name, notes);
                      setSelectedCase({ ...selectedCase, currentStage: selectedCase.currentStage });
                      toast({ title: "تم نقل القضية للمرحلة التالية" });
                    }
                  }}
                  onMoveToPrevious={(notes) => {
                    if (user) {
                      moveToPreviousStage(selectedCase.id, user.id, user.name, notes);
                      toast({ title: "تم إرجاع القضية للمرحلة السابقة" });
                    }
                  }}
                />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="info" data-testid="tab-info">المعلومات</TabsTrigger>
                  <TabsTrigger value="hearings" data-testid="tab-hearings">الجلسات</TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">سجل المراحل</TabsTrigger>
                  <TabsTrigger value="comments" data-testid="tab-comments">التعليقات</TabsTrigger>
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
                      <p>{selectedCase.caseType}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الأولوية</Label>
                      <Badge className={getPriorityColor(selectedCase.priority)}>{selectedCase.priority}</Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">القسم</Label>
                      <p>{getDepartmentName(selectedCase.departmentId)}</p>
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
                      <Label className="text-muted-foreground">رقم ناجز</Label>
                      <p>{selectedCase.najizNumber || "-"}</p>
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
                        <Label className="text-muted-foreground">محامي الخصم</Label>
                        <p>{selectedCase.opponentLawyer || "-"}</p>
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
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
