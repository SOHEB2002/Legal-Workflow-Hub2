import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Search, MessageSquare, Send, CheckCircle, XCircle, FileText } from "lucide-react";
import { useConsultations } from "@/lib/consultations-context";
import { useClients } from "@/lib/clients-context";
import { useAuth, getLawyers } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import type { Consultation, ConsultationStatusValue, CaseTypeValue, DeliveryTypeValue } from "@shared/schema";
import { ConsultationStatus, ConsultationStatusLabels, CaseType, DeliveryType, Department } from "@shared/schema";

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
  } = useConsultations();
  const { clients, getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions } = useAuth();
  const lawyers = getLawyers();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  const [formData, setFormData] = useState({
    clientId: "",
    consultationType: "عام" as CaseTypeValue,
    deliveryType: "مكتوبة" as DeliveryTypeValue,
    departmentId: "",
    questionSummary: "",
    whatsappGroupLink: "",
  });

  const resetForm = () => {
    setFormData({
      clientId: "",
      consultationType: "عام",
      deliveryType: "مكتوبة",
      departmentId: "",
      questionSummary: "",
      whatsappGroupLink: "",
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
                <div>
                  <Label>نوع الاستشارة</Label>
                  <Select
                    value={formData.consultationType}
                    onValueChange={(value: CaseTypeValue) =>
                      setFormData({ ...formData, consultationType: value })
                    }
                  >
                    <SelectTrigger data-testid="select-consultation-type">
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
                <div>
                  <Label>رابط واتساب (اختياري)</Label>
                  <Input
                    data-testid="input-whatsapp"
                    value={formData.whatsappGroupLink}
                    onChange={(e) => setFormData({ ...formData, whatsappGroupLink: e.target.value })}
                    placeholder="https://wa.me/..."
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
                  <TableCell className="font-medium">{consultation.consultationNumber}</TableCell>
                  <TableCell>{getClientName(consultation.clientId)}</TableCell>
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-view-consultation-${consultation.id}`}
                            onClick={() => setSelectedConsultation(consultation)}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>عرض التفاصيل</TooltipContent>
                      </Tooltip>
                      {consultation.status === ConsultationStatus.STUDY && permissions.canManageDepartment && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-send-review-${consultation.id}`}
                              onClick={() => sendToReviewCommittee(consultation.id)}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>إرسال للمراجعة</TooltipContent>
                        </Tooltip>
                      )}
                      {consultation.status === ConsultationStatus.REVIEW_COMMITTEE &&
                        permissions.canReviewConsultations && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  data-testid={`button-approve-${consultation.id}`}
                                  onClick={() => approveConsultation(consultation.id)}
                                >
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>اعتماد الاستشارة</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  data-testid={`button-reject-${consultation.id}`}
                                  onClick={() => rejectConsultation(consultation.id, "يرجى المراجعة")}
                                >
                                  <XCircle className="w-4 h-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>إعادة للتعديل</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      {consultation.status === ConsultationStatus.READY && permissions.canCloseCases && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-deliver-${consultation.id}`}
                              onClick={() => markDelivered(consultation.id)}
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>تسليم الاستشارة</TooltipContent>
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

      <Dialog open={!!selectedConsultation} onOpenChange={(open) => !open && setSelectedConsultation(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل الاستشارة {selectedConsultation?.consultationNumber}</DialogTitle>
          </DialogHeader>
          {selectedConsultation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">العميل</Label>
                  <p className="font-medium">{getClientName(selectedConsultation.clientId)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">الحالة</Label>
                  <Badge className={getStatusColor(selectedConsultation.status)}>
                    {ConsultationStatusLabels[selectedConsultation.status]}
                  </Badge>
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
    </div>
  );
}
