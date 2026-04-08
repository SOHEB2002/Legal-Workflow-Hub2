import { useState, useEffect } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileText,
  Gavel,
  ArrowLeftRight,
  Eye,
  Loader2,
  Scale,
  Phone,
  ClipboardCheck,
  Lock,
  Trash2,
  Pencil,
} from "lucide-react";
import { useHearings } from "@/lib/hearings-context";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import type { Hearing, HearingStatusValue, HearingResultValue, CourtTypeValue } from "@shared/schema";
import { HearingStatus, HearingResult, CourtType, HearingType } from "@shared/schema";
import { differenceInDays, isToday } from "date-fns";
import { formatTimeAmPm } from "@/lib/date-utils";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { useToast } from "@/hooks/use-toast";

function getUrgencyColor(hearingDate: string) {
  const days = differenceInDays(new Date(hearingDate), new Date());
  if (days < 0) return "bg-muted text-muted-foreground";
  if (days === 0) return "bg-destructive text-destructive-foreground";
  if (days <= 3) return "bg-orange-500 text-white dark:bg-orange-600";
  if (days <= 7) return "bg-yellow-500 text-white dark:bg-yellow-600";
  return "bg-accent text-accent-foreground";
}

function getStatusBadge(status: HearingStatusValue) {
  switch (status) {
    case HearingStatus.UPCOMING:
      return <Badge variant="outline" className="border-primary text-primary"><Calendar className="w-3 h-3 ml-1" />قادمة</Badge>;
    case HearingStatus.COMPLETED:
      return <Badge variant="outline" className="border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"><CheckCircle className="w-3 h-3 ml-1" />تمت</Badge>;
    case HearingStatus.POSTPONED:
      return <Badge variant="outline" className="border-orange-500 text-orange-500"><ArrowLeftRight className="w-3 h-3 ml-1" />مؤجلة</Badge>;
    case HearingStatus.CANCELLED:
      return <Badge variant="outline" className="border-destructive text-destructive"><XCircle className="w-3 h-3 ml-1" />ملغية</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function HearingsPage() {
  const {
    hearings,
    isLoading,
    addHearing,
    updateHearing,
    submitResult,
    submitReport,
    closeHearing,
    cancelHearing,
    deleteHearing,
    getUpcomingHearings,
  } = useHearings();
  const { cases, getCaseById } = useCases();
  const { getClientName } = useClients();
  const { user, users } = useAuth();
  const { departments } = useDepartments();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [detailHearingId, setDetailHearingId] = useState<string | null>(null);
  const detailHearing = detailHearingId ? hearings.find(h => h.id === detailHearingId) || null : null;
  const [resultDialogHearing, setResultDialogHearing] = useState<Hearing | null>(null);
  const [reportDialogHearing, setReportDialogHearing] = useState<Hearing | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterLawyer, setFilterLawyer] = useState<string>("all");
  const [deletingHearingId, setDeletingHearingId] = useState<string | null>(null);
  const [editDialogHearing, setEditDialogHearing] = useState<Hearing | null>(null);
  const [editFormData, setEditFormData] = useState({
    hearingDate: "",
    hearingTime: "",
    courtName: "المحكمة العامة" as CourtTypeValue,
    courtRoom: "",
    notes: "",
    attendingLawyerId: "",
  });

  const [formData, setFormData] = useState({
    caseId: "",
    hearingDate: "",
    hearingTime: "",
    hearingType: HearingType.COURT,
    courtName: "المحكمة العامة" as CourtTypeValue,
    courtRoom: "",
    notes: "",
    responseRequired: false,
    attendingLawyerId: "",
  });

  const [resultForm, setResultForm] = useState({
    result: "" as string,
    resultDetails: "",
    judgmentSide: "",
    judgmentFinal: false,
    objectionFeasible: false,
    objectionDeadline: "",
    nextHearingDate: "",
    nextHearingTime: "",
    responseRequired: false,
    caseId: "",
  });

  const [reportForm, setReportForm] = useState({
    hearingReport: "",
    recommendations: "",
    nextSteps: "",
    contactCompleted: false,
  });

  const resetForm = () => {
    setFormData({
      caseId: "",
      hearingDate: "",
      hearingTime: "",
      hearingType: HearingType.COURT,
      courtName: "المحكمة العامة",
      courtRoom: "",
      notes: "",
      responseRequired: false,
      attendingLawyerId: "",
    });
  };

  const resetResultForm = () => {
    setResultForm({
      result: "",
      resultDetails: "",
      judgmentSide: "",
      judgmentFinal: false,
      objectionFeasible: false,
      objectionDeadline: "",
      nextHearingDate: "",
      nextHearingTime: "",
      responseRequired: false,
      caseId: "",
    });
  };

  const resetReportForm = () => {
    setReportForm({
      hearingReport: "",
      recommendations: "",
      nextSteps: "",
      contactCompleted: false,
    });
  };

  const handleAddHearing = async () => {
    if (!formData.hearingDate || !formData.hearingTime) return;
    if (formData.responseRequired && (!formData.caseId || formData.caseId === "none")) {
      toast({ title: "يجب اختيار القضية المرتبطة لإنشاء المذكرة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await addHearing(formData);
      setIsAddDialogOpen(false);
      resetForm();
      const memoMsg = formData.responseRequired ? "\nتم إنشاء مذكرة جوابية تلقائياً" : "";
      toast({ title: "تم إضافة الجلسة بنجاح" + memoMsg });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitResult = async () => {
    if (!resultDialogHearing || !resultForm.result) return;
    const effectiveCaseId = resultDialogHearing.caseId || resultForm.caseId;
    if (resultForm.responseRequired && !effectiveCaseId) {
      toast({ title: "يجب اختيار القضية المرتبطة لإنشاء المذكرة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const data: any = {
        result: resultForm.result,
        resultDetails: resultForm.resultDetails,
        userId: user?.id,
        caseId: effectiveCaseId || undefined,
      };
      if (resultForm.result === HearingResult.JUDGMENT) {
        data.judgmentSide = resultForm.judgmentSide;
        data.judgmentFinal = resultForm.judgmentFinal;
        data.objectionFeasible = resultForm.objectionFeasible;
        data.objectionDeadline = resultForm.objectionDeadline || undefined;
      }
      if (resultForm.result === HearingResult.POSTPONEMENT) {
        data.nextHearingDate = resultForm.nextHearingDate;
        data.nextHearingTime = resultForm.nextHearingTime;
        data.responseRequired = resultForm.responseRequired;
      }
      const res = await submitResult(resultDialogHearing.id, data);
      const tasksMsg = res.createdTasks?.length
        ? `\nتم إنشاء ${res.createdTasks.length} مهمة تلقائياً`
        : "";
      const memosMsg = res.createdMemos?.length
        ? `\nتم إنشاء ${res.createdMemos.length} مذكرة تلقائياً`
        : "";
      toast({ title: "تم تسجيل النتيجة بنجاح" + tasksMsg + memosMsg });
      setResultDialogHearing(null);
      resetResultForm();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportDialogHearing || !reportForm.hearingReport) return;
    setSubmitting(true);
    try {
      await submitReport(reportDialogHearing.id, reportForm);
      toast({ title: "تم حفظ التقرير بنجاح" });
      setReportDialogHearing(null);
      resetReportForm();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseHearing = async (hearing: Hearing) => {
    setSubmitting(true);
    try {
      await closeHearing(hearing.id);
      toast({ title: "تم إغلاق الجلسة بنجاح" });
      setDetailHearingId(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkContactCompleted = async (hearing: Hearing) => {
    setSubmitting(true);
    try {
      await updateHearing(hearing.id, { contactCompleted: true });
      toast({ title: "تم تأكيد التواصل مع العميل" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelHearing = async (hearing: Hearing) => {
    setSubmitting(true);
    try {
      await cancelHearing(hearing.id);
      toast({ title: "تم إلغاء الجلسة" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (hearing: Hearing) => {
    setEditFormData({
      hearingDate: hearing.hearingDate || "",
      hearingTime: hearing.hearingTime || "",
      courtName: (hearing.courtName as CourtTypeValue) || "المحكمة العامة",
      courtRoom: hearing.courtRoom || "",
      notes: hearing.notes || "",
      attendingLawyerId: hearing.attendingLawyerId || "",
    });
    setEditDialogHearing(hearing);
  };

  const handleEditHearing = async () => {
    if (!editDialogHearing) return;
    setSubmitting(true);
    try {
      await updateHearing(editDialogHearing.id, editFormData);
      toast({ title: "تم تعديل الجلسة بنجاح" });
      setEditDialogHearing(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHearing = async (hearingId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الجلسة؟ سيتم حذفها بشكل نهائي.")) return;
    setDeletingHearingId(hearingId);
    try {
      await deleteHearing(hearingId);
      toast({ title: "تم حذف الجلسة بنجاح" });
    } catch (error) {
      toast({ variant: "destructive", title: "خطأ", description: "فشل حذف الجلسة" });
    }
    setDeletingHearingId(null);
  };

  const upcomingHearings = getUpcomingHearings();
  const todayHearings = hearings.filter(
    (h) => h.status === HearingStatus.UPCOMING && isToday(new Date(h.hearingDate))
  );
  const completedHearings = hearings.filter(
    (h) => h.status === HearingStatus.COMPLETED || h.status === HearingStatus.POSTPONED
  );

  const getLawyerForHearing = (hearing: Hearing) => {
    if (hearing.attendingLawyerId) return hearing.attendingLawyerId;
    const caseData = hearing.caseId ? getCaseById(hearing.caseId) : null;
    return caseData?.primaryLawyerId || caseData?.responsibleLawyerId || null;
  };

  const getDepartmentForHearing = (hearing: Hearing) => {
    const caseData = hearing.caseId ? getCaseById(hearing.caseId) : null;
    return caseData?.departmentId || null;
  };

  const lawyersForFilter = filterDepartment === "all"
    ? users.filter(u => u.canBeAssignedCases)
    : users.filter(u => u.canBeAssignedCases && u.departmentId === filterDepartment);

  const filteredHearings = hearings
    .filter((h) => {
      if (filterStatus === "today") {
        if (!isToday(new Date(h.hearingDate))) return false;
      } else if (filterStatus !== "all") {
        if (h.status !== filterStatus) return false;
      }
      if (filterDepartment !== "all") {
        const deptId = getDepartmentForHearing(h);
        if (deptId !== filterDepartment) return false;
      }
      if (filterLawyer !== "all") {
        const lawyerId = getLawyerForHearing(h);
        if (lawyerId !== filterLawyer) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dateDiff = a.hearingDate.localeCompare(b.hearingDate);
      if (dateDiff !== 0) return dateDiff;
      return (a.hearingTime || "").localeCompare(b.hearingTime || "");
    });

  const HEARING_PAGE_SIZE = 15;
  const [hearingPage, setHearingPage] = useState(1);
  useEffect(() => { setHearingPage(1); }, [filterStatus, filterDepartment, filterLawyer]);
  const hearingTotalPages = Math.max(1, Math.ceil(filteredHearings.length / HEARING_PAGE_SIZE));
  const pagedHearings = filteredHearings.slice((hearingPage - 1) * HEARING_PAGE_SIZE, hearingPage * HEARING_PAGE_SIZE);

  const getCaseInfo = (caseId: string) => {
    const caseData = getCaseById(caseId);
    if (!caseData) return { number: caseId || "بدون قضية", client: "", plaintiff: "", opponent: "", classification: "" };
    return {
      number: caseData.caseNumber,
      client: getClientName(caseData.clientId),
      plaintiff: (caseData as any).plaintiffName || "",
      opponent: caseData.opponentName || "",
      classification: caseData.caseClassification || "",
    };
  };

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
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة الجلسات</h1>
          <p className="text-muted-foreground">جدول الجلسات والمواعيد مع نظام سير العمل المتقدم</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-hearing" onClick={resetForm}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة جلسة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة جلسة جديدة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>القضية (اختياري)</Label>
                <Select
                  value={formData.caseId}
                  onValueChange={(value) => {
                    const selectedCase = getCaseById(value);
                    const autoLawyer = selectedCase?.primaryLawyerId || selectedCase?.responsibleLawyerId || "";
                    setFormData(prev => ({ ...prev, caseId: value, attendingLawyerId: autoLawyer }));
                  }}
                >
                  <SelectTrigger data-testid="select-case">
                    <SelectValue placeholder="اختر القضية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قضية</SelectItem>
                    {cases
                      .filter((c) => c.status !== "مغلق")
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.caseNumber} - {getClientName(c.clientId)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>التاريخ</Label>
                  <HijriDatePicker
                    value={formData.hearingDate}
                    onChange={(v) => setFormData({ ...formData, hearingDate: v })}
                    data-testid="input-hearing-date"
                  />
                </div>
                <div>
                  <Label>الوقت</Label>
                  <Input
                    data-testid="input-hearing-time"
                    type="time"
                    value={formData.hearingTime}
                    onChange={(e) => setFormData({ ...formData, hearingTime: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>نوع الجلسة</Label>
                <Select
                  value={formData.hearingType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, hearingType: value })
                  }
                >
                  <SelectTrigger data-testid="select-hearing-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={HearingType.COURT}>محكمة</SelectItem>
                    <SelectItem value={HearingType.TARADI}>تراضي</SelectItem>
                    <SelectItem value={HearingType.SETTLEMENT}>تسوية ودية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المحكمة</Label>
                <Select
                  value={formData.courtName}
                  onValueChange={(value: CourtTypeValue) =>
                    setFormData({ ...formData, courtName: value })
                  }
                >
                  <SelectTrigger data-testid="select-court">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CourtType).map((court) => (
                      <SelectItem key={court} value={court}>
                        {court}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم الدائرة</Label>
                <SmartInput
                  inputType="code"
                  data-testid="input-court-room"
                  value={formData.courtRoom}
                  onChange={(e) => setFormData({ ...formData, courtRoom: e.target.value })}
                  placeholder="مثال: الدائرة 5"
                />
              </div>
              {formData.caseId && formData.caseId !== "none" && (
                <div>
                  <Label>المحامي المكلف بالحضور</Label>
                  <Select
                    value={formData.attendingLawyerId}
                    onValueChange={(value) => setFormData({ ...formData, attendingLawyerId: value })}
                  >
                    <SelectTrigger data-testid="select-attending-lawyer">
                      <SelectValue placeholder="المحامي المكلف بالقضية (تلقائي)" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.canBeAssignedCases && u.isActive).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">يتم تعيين المحامي المكلف بالقضية تلقائياً</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="addResponseRequired"
                  checked={formData.responseRequired}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, responseRequired: !!checked })
                  }
                  data-testid="checkbox-add-response-required"
                />
                <Label htmlFor="addResponseRequired" className="text-sm cursor-pointer">
                  مطلوب رد قبل الجلسة القادمة
                </Label>
              </div>
              {formData.responseRequired && (
                <p className="text-xs text-muted-foreground">
                  سيتم إنشاء مذكرة جوابية تلقائياً بموعد نهائي قبل 3 أيام من الجلسة
                </p>
              )}
              {formData.responseRequired && (!formData.caseId || formData.caseId === "none") && (
                <p className="text-xs text-destructive">
                  يجب اختيار قضية مرتبطة لإنشاء المذكرة
                </p>
              )}
              <div>
                <Label>ملاحظات</Label>
                <Textarea
                  data-testid="input-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="ملاحظات إضافية..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                data-testid="button-submit-hearing"
                onClick={handleAddHearing}
                className="w-full"
                disabled={!formData.hearingDate || !formData.hearingTime || submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                إضافة الجلسة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">جلسات اليوم</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-today-count">{todayHearings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">القادمة</CardTitle>
            <Calendar className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-upcoming-count">{upcomingHearings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المنجزة</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-count">{completedHearings.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الإجمالي</CardTitle>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">{hearings.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>جدول الجلسات</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36" data-testid="select-filter-status">
                <SelectValue placeholder="تصفية الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="قادمة">قادمة</SelectItem>
                <SelectItem value="تمت">تمت</SelectItem>
                <SelectItem value="مؤجلة">مؤجلة</SelectItem>
                <SelectItem value="ملغية">ملغية</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDepartment} onValueChange={(val) => { setFilterDepartment(val); setFilterLawyer("all"); }}>
              <SelectTrigger className="w-40" data-testid="select-filter-department">
                <SelectValue placeholder="القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterLawyer} onValueChange={setFilterLawyer}>
              <SelectTrigger className="w-44" data-testid="select-filter-lawyer">
                <SelectValue placeholder="المترافع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المترافعين</SelectItem>
                {lawyersForFilter.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredHearings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد جلسات</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '13%' }} />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">التاريخ والوقت</TableHead>
                    <TableHead className="text-center">العميل / صفة العميل</TableHead>
                    <TableHead className="text-center">الخصم</TableHead>
                    <TableHead className="text-center">القضية والمحكمة</TableHead>
                    <TableHead className="text-center">الحالة / النتيجة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedHearings.map((hearing) => {
                      const caseInfo = getCaseInfo(hearing.caseId);
                      const isAttendingLawyer = user?.id === hearing.attendingLawyerId;
                      const canActOnHearing = isAttendingLawyer || user?.role === "branch_manager" || user?.role === "admin_support";
                      return (
                        <TableRow key={hearing.id} data-testid={`row-hearing-${hearing.id}`}>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Badge className={getUrgencyColor(hearing.hearingDate)}>
                                <DualDateDisplay date={hearing.hearingDate} compact />
                              </Badge>
                              <LtrInline className="text-xs text-muted-foreground">{formatTimeAmPm(hearing.hearingTime)}</LtrInline>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <p className="text-sm font-medium">{caseInfo.plaintiff || caseInfo.client || "-"}</p>
                              {caseInfo.classification && (
                                <Badge variant="outline" className={`text-xs ${
                                  caseInfo.classification === "مدعى_عليه"
                                    ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"
                                    : "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
                                }`}>
                                  {caseInfo.classification === "مدعى_عليه" ? "مدعى عليه" : "مدعي"}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-sm">{caseInfo.opponent || "-"}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <LtrInline className="text-sm font-medium">{caseInfo.number}</LtrInline>
                              <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <BidiText>{hearing.courtName}</BidiText>
                                {hearing.courtRoom && (
                                  <span>- <LtrInline>{hearing.courtRoom}</LtrInline></span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              {getStatusBadge(hearing.status)}
                              {hearing.result && (
                                <Badge variant="secondary" className="text-xs">
                                  {hearing.result}
                                  {hearing.result === HearingResult.JUDGMENT && hearing.judgmentSide && (
                                    <span className="mr-1">({hearing.judgmentSide})</span>
                                  )}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`button-view-${hearing.id}`}
                                    onClick={() => setDetailHearingId(hearing.id)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>عرض التفاصيل</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    data-testid={`button-edit-hearing-${hearing.id}`}
                                    onClick={() => openEditDialog(hearing)}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>تعديل الجلسة</TooltipContent>
                              </Tooltip>
                              {hearing.status === HearingStatus.UPCOMING && canActOnHearing && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        data-testid={`button-result-${hearing.id}`}
                                        onClick={() => {
                                          resetResultForm();
                                          setResultDialogHearing(hearing);
                                        }}
                                      >
                                        <Gavel className="w-4 h-4 text-primary" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>تسجيل النتيجة</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        data-testid={`button-cancel-${hearing.id}`}
                                        onClick={() => handleCancelHearing(hearing)}
                                      >
                                        <XCircle className="w-4 h-4 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>إلغاء</TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                              {hearing.result && !hearing.reportCompleted && canActOnHearing && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      data-testid={`button-report-${hearing.id}`}
                                      onClick={() => {
                                        resetReportForm();
                                        setReportDialogHearing(hearing);
                                      }}
                                    >
                                      <FileText className="w-4 h-4 text-orange-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>كتابة التقرير</TooltipContent>
                                </Tooltip>
                              )}
                              {hearing.result && !hearing.contactCompleted && canActOnHearing && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      data-testid={`button-contact-${hearing.id}`}
                                      onClick={() => handleMarkContactCompleted(hearing)}
                                      disabled={submitting}
                                    >
                                      <Phone className="w-4 h-4 text-orange-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>تأكيد التواصل مع العميل</TooltipContent>
                                </Tooltip>
                              )}
                              {(user?.role === "branch_manager" || user?.role === "admin_support") && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      data-testid={`button-delete-hearing-${hearing.id}`}
                                      disabled={deletingHearingId === hearing.id}
                                      onClick={() => handleDeleteHearing(hearing.id)}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>حذف الجلسة</TooltipContent>
                                </Tooltip>
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
            currentPage={hearingPage}
            totalPages={hearingTotalPages}
            onPageChange={setHearingPage}
          />
        </CardContent>
      </Card>

      <Dialog open={!!resultDialogHearing} onOpenChange={(open) => !open && setResultDialogHearing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="w-5 h-5" />
              تسجيل نتيجة الجلسة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label>النتيجة</Label>
              <Select
                value={resultForm.result}
                onValueChange={(value) =>
                  setResultForm({ ...resultForm, result: value })
                }
              >
                <SelectTrigger data-testid="select-result">
                  <SelectValue placeholder="اختر النتيجة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="تأجيل">تأجيل</SelectItem>
                  <SelectItem value="حكم">حكم</SelectItem>
                  <SelectItem value="صلح">صلح</SelectItem>
                  <SelectItem value="شطب">شطب</SelectItem>
                  <SelectItem value="أخرى">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>تفاصيل النتيجة</Label>
              <Textarea
                data-testid="input-result-details"
                value={resultForm.resultDetails}
                onChange={(e) => setResultForm({ ...resultForm, resultDetails: e.target.value })}
                placeholder="وصف تفصيلي لما حدث في الجلسة..."
              />
            </div>

            {!resultDialogHearing?.caseId && (
              <div>
                <Label>القضية المرتبطة {resultForm.responseRequired && <span className="text-destructive">*</span>}</Label>
                <Select
                  value={resultForm.caseId}
                  onValueChange={(value) => setResultForm({ ...resultForm, caseId: value })}
                >
                  <SelectTrigger data-testid="select-result-case">
                    <SelectValue placeholder="اختر القضية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قضية</SelectItem>
                    {cases
                      .filter((c) => c.status !== "مغلق")
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.caseNumber} - {getClientName(c.clientId)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {resultForm.result === HearingResult.POSTPONEMENT && (
              <Card className="p-4 space-y-3">
                <p className="text-sm font-medium text-primary flex items-center gap-1">
                  <ArrowLeftRight className="w-4 h-4" />
                  تفاصيل التأجيل
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>تاريخ الجلسة القادمة</Label>
                    <HijriDatePicker
                      value={resultForm.nextHearingDate}
                      onChange={(v) => setResultForm({ ...resultForm, nextHearingDate: v })}
                      data-testid="input-next-date"
                    />
                  </div>
                  <div>
                    <Label>وقت الجلسة القادمة</Label>
                    <Input
                      data-testid="input-next-time"
                      type="time"
                      value={resultForm.nextHearingTime}
                      onChange={(e) => setResultForm({ ...resultForm, nextHearingTime: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="responseRequired"
                    checked={resultForm.responseRequired}
                    onCheckedChange={(checked) =>
                      setResultForm({ ...resultForm, responseRequired: !!checked })
                    }
                    data-testid="checkbox-response-required"
                  />
                  <Label htmlFor="responseRequired" className="text-sm cursor-pointer">
                    مطلوب إعداد رد قبل الجلسة القادمة
                  </Label>
                </div>
                {resultForm.responseRequired && (
                  <p className="text-xs text-muted-foreground">
                    سيتم إنشاء مذكرة جوابية تلقائياً ومهمة إعداد الرد
                  </p>
                )}
              </Card>
            )}

            {resultForm.result === HearingResult.JUDGMENT && (
              <Card className="p-4 space-y-3">
                <p className="text-sm font-medium text-primary flex items-center gap-1">
                  <Scale className="w-4 h-4" />
                  تفاصيل الحكم
                </p>
                <div>
                  <Label>الحكم لصالح</Label>
                  <Select
                    value={resultForm.judgmentSide}
                    onValueChange={(value) =>
                      setResultForm({ ...resultForm, judgmentSide: value })
                    }
                  >
                    <SelectTrigger data-testid="select-judgment-side">
                      <SelectValue placeholder="اختر" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="لصالحنا">لصالحنا</SelectItem>
                      <SelectItem value="ضدنا">ضدنا</SelectItem>
                      <SelectItem value="جزئي">جزئي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="judgmentFinal"
                    checked={resultForm.judgmentFinal}
                    onCheckedChange={(checked) =>
                      setResultForm({ ...resultForm, judgmentFinal: !!checked })
                    }
                    data-testid="checkbox-judgment-final"
                  />
                  <Label htmlFor="judgmentFinal" className="text-sm cursor-pointer">
                    حكم نهائي (غير قابل للاعتراض)
                  </Label>
                </div>
                {!resultForm.judgmentFinal && resultForm.judgmentSide === "ضدنا" && (
                  <>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="objectionFeasible"
                        checked={resultForm.objectionFeasible}
                        onCheckedChange={(checked) =>
                          setResultForm({ ...resultForm, objectionFeasible: !!checked })
                        }
                        data-testid="checkbox-objection"
                      />
                      <Label htmlFor="objectionFeasible" className="text-sm cursor-pointer">
                        يمكن تقديم اعتراض
                      </Label>
                    </div>
                    {resultForm.objectionFeasible && (
                      <div>
                        <Label>مهلة الاعتراض</Label>
                        <HijriDatePicker
                          value={resultForm.objectionDeadline}
                          onChange={(v) =>
                            setResultForm({ ...resultForm, objectionDeadline: v })
                          }
                          data-testid="input-objection-deadline"
                        />
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-result"
              onClick={handleSubmitResult}
              className="w-full"
              disabled={!resultForm.result || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ النتيجة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reportDialogHearing} onOpenChange={(open) => !open && setReportDialogHearing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              تقرير الجلسة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>تقرير الجلسة *</Label>
              <Textarea
                data-testid="input-hearing-report"
                value={reportForm.hearingReport}
                onChange={(e) => setReportForm({ ...reportForm, hearingReport: e.target.value })}
                placeholder="اكتب تقريراً مفصلاً عن سير الجلسة..."
                className="min-h-[120px]"
              />
            </div>
            <div>
              <Label>التوصيات</Label>
              <Textarea
                data-testid="input-recommendations"
                value={reportForm.recommendations}
                onChange={(e) => setReportForm({ ...reportForm, recommendations: e.target.value })}
                placeholder="توصيات للخطوات القادمة..."
              />
            </div>
            <div>
              <Label>الخطوات التالية</Label>
              <Textarea
                data-testid="input-next-steps"
                value={reportForm.nextSteps}
                onChange={(e) => setReportForm({ ...reportForm, nextSteps: e.target.value })}
                placeholder="ما يجب القيام به..."
              />
            </div>
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
              <Checkbox
                id="contactCompleted"
                checked={reportForm.contactCompleted}
                onCheckedChange={(checked) =>
                  setReportForm({ ...reportForm, contactCompleted: !!checked })
                }
                data-testid="checkbox-contact"
              />
              <Label htmlFor="contactCompleted" className="text-sm cursor-pointer flex items-center gap-1">
                <Phone className="w-4 h-4" />
                تم التواصل مع العميل وإبلاغه بالنتيجة
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-report"
              onClick={handleSubmitReport}
              className="w-full"
              disabled={!reportForm.hearingReport || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ التقرير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editDialogHearing} onOpenChange={(open) => !open && setEditDialogHearing(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              تعديل الجلسة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>التاريخ</Label>
                <HijriDatePicker
                  value={editFormData.hearingDate}
                  onChange={(v) => setEditFormData({ ...editFormData, hearingDate: v })}
                  data-testid="input-edit-hearing-date"
                />
              </div>
              <div>
                <Label>الوقت</Label>
                <Input
                  data-testid="input-edit-hearing-time"
                  type="time"
                  value={editFormData.hearingTime}
                  onChange={(e) => setEditFormData({ ...editFormData, hearingTime: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>المحكمة</Label>
              <Input
                data-testid="input-edit-court-name"
                placeholder=""
                value={editFormData.courtName}
                onChange={(e) => setEditFormData({ ...editFormData, courtName: e.target.value as CourtTypeValue })}
              />
            </div>
            <div>
              <Label>رقم الدائرة</Label>
              <Input
                data-testid="input-edit-court-room"
                value={editFormData.courtRoom}
                onChange={(e) => setEditFormData({ ...editFormData, courtRoom: e.target.value })}
                placeholder="مثال: الدائرة 5"
              />
            </div>
            {editDialogHearing?.caseId && editDialogHearing.caseId !== "none" && (
              <div>
                <Label>المحامي المكلف بالحضور</Label>
                <Select
                  value={editFormData.attendingLawyerId}
                  onValueChange={(value) => setEditFormData({ ...editFormData, attendingLawyerId: value })}
                >
                  <SelectTrigger data-testid="select-edit-attending-lawyer">
                    <SelectValue placeholder="اختر المحامي" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.canBeAssignedCases && u.isActive).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                data-testid="input-edit-notes"
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                placeholder="ملاحظات إضافية..."
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              data-testid="button-cancel-edit-hearing"
              onClick={() => setEditDialogHearing(null)}
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-save-edit-hearing"
              onClick={handleEditHearing}
              disabled={!editFormData.hearingDate || !editFormData.hearingTime || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailHearing} onOpenChange={(open) => !open && setDetailHearingId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              تفاصيل الجلسة
            </DialogTitle>
          </DialogHeader>
          {detailHearing && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="w-full flex">
                <TabsTrigger value="info" className="flex-1" data-testid="tab-info">المعلومات</TabsTrigger>
                <TabsTrigger value="result" className="flex-1" data-testid="tab-result">النتيجة</TabsTrigger>
                <TabsTrigger value="report" className="flex-1" data-testid="tab-report">التقرير</TabsTrigger>
                <TabsTrigger value="workflow" className="flex-1" data-testid="tab-workflow">سير العمل</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">التاريخ</p>
                    <DualDateDisplay date={detailHearing.hearingDate} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الوقت</p>
                    <p className="font-medium"><LtrInline>{formatTimeAmPm(detailHearing.hearingTime)}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المحكمة</p>
                    <p className="font-medium"><BidiText>{detailHearing.courtName}</BidiText></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الدائرة</p>
                    <p className="font-medium"><LtrInline>{detailHearing.courtRoom || "-"}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">القضية</p>
                    <p className="font-medium"><LtrInline>{getCaseInfo(detailHearing.caseId).number}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الحالة</p>
                    {getStatusBadge(detailHearing.status)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المحامي المكلف بالحضور</p>
                    <p className="font-medium">{(() => {
                      const lawyerId = getLawyerForHearing(detailHearing);
                      const lawyer = lawyerId ? users.find(u => u.id === lawyerId) : null;
                      return lawyer?.name || "-";
                    })()}</p>
                  </div>
                </div>
                {detailHearing.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">ملاحظات</p>
                    <p className="text-sm">{detailHearing.notes}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="result" className="space-y-3 mt-4">
                {detailHearing.result ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">النتيجة</p>
                        <Badge variant="secondary">{detailHearing.result}</Badge>
                      </div>
                      {detailHearing.judgmentSide && (
                        <div>
                          <p className="text-xs text-muted-foreground">الحكم لصالح</p>
                          <Badge variant={detailHearing.judgmentSide === "لصالحنا" ? "default" : "destructive"}>
                            {detailHearing.judgmentSide}
                          </Badge>
                        </div>
                      )}
                    </div>
                    {detailHearing.resultDetails && (
                      <div>
                        <p className="text-xs text-muted-foreground">التفاصيل</p>
                        <p className="text-sm">{detailHearing.resultDetails}</p>
                      </div>
                    )}
                    {detailHearing.judgmentFinal !== null && (
                      <div>
                        <p className="text-xs text-muted-foreground">نوع الحكم</p>
                        <p className="text-sm">{detailHearing.judgmentFinal ? "حكم نهائي" : "حكم ابتدائي"}</p>
                      </div>
                    )}
                    {detailHearing.objectionStatus && (
                      <div>
                        <p className="text-xs text-muted-foreground">حالة الاعتراض</p>
                        <Badge variant="outline">{detailHearing.objectionStatus}</Badge>
                      </div>
                    )}
                    {detailHearing.objectionDeadline && (
                      <div>
                        <p className="text-xs text-muted-foreground">مهلة الاعتراض</p>
                        <DualDateDisplay date={detailHearing.objectionDeadline} />
                      </div>
                    )}
                    {detailHearing.nextHearingDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">الجلسة القادمة</p>
                        <div className="text-sm flex items-center gap-2">
                          <DualDateDisplay date={detailHearing.nextHearingDate} compact />
                          {detailHearing.nextHearingTime && <> - <LtrInline>{formatTimeAmPm(detailHearing.nextHearingTime)}</LtrInline></>}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Gavel className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>لم يتم تسجيل نتيجة بعد</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="report" className="space-y-3 mt-4">
                {detailHearing.reportCompleted ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">التقرير</p>
                      <p className="text-sm whitespace-pre-wrap">{detailHearing.hearingReport}</p>
                    </div>
                    {detailHearing.recommendations && (
                      <div>
                        <p className="text-xs text-muted-foreground">التوصيات</p>
                        <p className="text-sm whitespace-pre-wrap">{detailHearing.recommendations}</p>
                      </div>
                    )}
                    {detailHearing.nextSteps && (
                      <div>
                        <p className="text-xs text-muted-foreground">الخطوات التالية</p>
                        <p className="text-sm whitespace-pre-wrap">{detailHearing.nextSteps}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {detailHearing.contactCompleted ? (
                        <Badge variant="outline" className="border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
                          <Phone className="w-3 h-3 ml-1" />
                          تم التواصل مع العميل
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-orange-500 text-orange-500">
                          <Phone className="w-3 h-3 ml-1" />
                          لم يتم التواصل بعد
                        </Badge>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>لم يتم كتابة التقرير بعد</p>
                    {detailHearing.result && (
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          resetReportForm();
                          setReportDialogHearing(detailHearing);
                          setDetailHearingId(null);
                        }}
                        data-testid="button-write-report"
                      >
                        <FileText className="w-4 h-4 ml-1" />
                        كتابة التقرير
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="workflow" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <WorkflowStep
                    done={!!detailHearing.result}
                    label="تسجيل النتيجة"
                    icon={<Gavel className="w-4 h-4" />}
                    actionLabel={!detailHearing.result && detailHearing.status === HearingStatus.UPCOMING ? "تسجيل" : undefined}
                    onAction={() => {
                      resetResultForm();
                      setResultDialogHearing(detailHearing);
                      setDetailHearingId(null);
                    }}
                  />
                  <WorkflowStep
                    done={detailHearing.adminTasksCreated}
                    label="إنشاء المهام التلقائية"
                    icon={<CheckCircle className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                  />
                  <WorkflowStep
                    done={detailHearing.reportCompleted}
                    label="كتابة التقرير"
                    icon={<FileText className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                    actionLabel={detailHearing.result && !detailHearing.reportCompleted ? "كتابة التقرير" : undefined}
                    onAction={() => {
                      resetReportForm();
                      setReportDialogHearing(detailHearing);
                      setDetailHearingId(null);
                    }}
                  />
                  <WorkflowStep
                    done={detailHearing.contactCompleted}
                    label="التواصل مع العميل"
                    icon={<Phone className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                    actionLabel={detailHearing.result && !detailHearing.contactCompleted ? "تأكيد التواصل" : undefined}
                    onAction={() => handleMarkContactCompleted(detailHearing)}
                    actionDisabled={submitting}
                  />
                  <WorkflowStep
                    done={detailHearing.status === HearingStatus.COMPLETED && detailHearing.reportCompleted}
                    label="إغلاق الجلسة"
                    icon={<Lock className="w-4 h-4" />}
                    disabled={!detailHearing.reportCompleted || !detailHearing.contactCompleted}
                    actionLabel={detailHearing.reportCompleted && detailHearing.contactCompleted && detailHearing.status !== HearingStatus.COMPLETED ? "إغلاق" : undefined}
                    onAction={() => handleCloseHearing(detailHearing)}
                    actionDisabled={submitting}
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkflowStep({
  done,
  label,
  icon,
  disabled,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  done: boolean;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
        done
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
          : disabled
          ? "border-muted bg-muted/30 opacity-50"
          : "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30"
      }`}
    >
      <div className={done ? "text-green-600 dark:text-green-400" : disabled ? "text-muted-foreground" : "text-orange-500"}>
        {done ? <CheckCircle className="w-5 h-5" /> : icon}
      </div>
      <span className={`text-sm font-medium ${done ? "text-green-700 dark:text-green-300" : disabled ? "text-muted-foreground" : "text-orange-700 dark:text-orange-300"}`}>
        {label}
      </span>
      {done && (
        <Badge variant="outline" className="mr-auto border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
          مكتمل
        </Badge>
      )}
      {!done && actionLabel && onAction && (
        <Button
          size="sm"
          variant="outline"
          className="mr-auto"
          onClick={onAction}
          disabled={actionDisabled}
          data-testid={`button-workflow-action-${label}`}
        >
          {actionLabel}
        </Button>
      )}

    </div>
  );
}
