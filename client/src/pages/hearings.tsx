import { useState, useEffect } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { getClientRoleLabel } from "@/lib/client-role";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
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
  UserCog,
} from "lucide-react";
import { useHearings } from "@/lib/hearings-context";
import { queryClient } from "@/lib/queryClient";
import { useCases } from "@/lib/cases-context";
import { useMemos } from "@/lib/memos-context";
import { useFieldTasks } from "@/lib/field-tasks-context";
import { MemoStatusLabels, MemoType, FieldTaskStatus } from "@shared/schema";
import { useClients } from "@/lib/clients-context";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import type { Hearing, HearingStatusValue, HearingResultValue, CourtTypeValue } from "@shared/schema";
import { HearingStatus, HearingResult, CourtType, HearingType, type HearingTypeValue } from "@shared/schema";
import { differenceInDays, isToday } from "date-fns";
import { formatTimeAmPm, formatDualDate } from "@/lib/date-utils";
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

function isHearingInFuture(hearingDate: string): boolean {
  if (!hearingDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hd = new Date(hearingDate);
  hd.setHours(0, 0, 0, 0);
  return hd.getTime() > today.getTime();
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
  const { getMemosByCase } = useMemos();
  const { getTasksByCase } = useFieldTasks();
  const { getClientName } = useClients();
  const { user, users } = useAuth();
  const { departments, getDepartmentName } = useDepartments();
  const { toast } = useToast();

  // Invalidate hearings on page mount to pick up changes from other tabs/users
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [caseComboOpen, setCaseComboOpen] = useState(false);
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
  const [reassignDialogHearing, setReassignDialogHearing] = useState<Hearing | null>(null);
  const [reassignLawyerId, setReassignLawyerId] = useState<string>("");
  const [conflictHearing, setConflictHearing] = useState<Hearing | null>(null);
  const [replaceHearingId, setReplaceHearingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    hearingDate: "",
    hearingTime: "",
    courtName: "" as CourtTypeValue,
    courtRoom: "",
    notes: "",
    attendingLawyerId: "",
  });

  const [formData, setFormData] = useState({
    caseId: "",
    hearingDate: "",
    hearingTime: "",
    hearingType: HearingType.COURT,
    courtName: "" as CourtTypeValue,
    courtRoom: "",
    notes: "",
    responseRequired: false,
    attendingLawyerId: "",
  });

  // Open the add-hearing dialog prefilled when navigated here from another
  // page with ?action=create&caseId=...&type=... (e.g. after a platform-review
  // accept in cases.tsx prompts to add a hearing).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") !== "create") return;
    const caseId = params.get("caseId") || "";
    const type = params.get("type") as HearingTypeValue | null;
    if (!caseId && !type) return;
    const c = caseId ? cases.find((x) => x.id === caseId) : undefined;
    setFormData((prev) => ({
      ...prev,
      caseId: caseId || prev.caseId,
      hearingType: type && Object.values(HearingType).includes(type) ? type : prev.hearingType,
      attendingLawyerId: c?.primaryLawyerId || c?.responsibleLawyerId || prev.attendingLawyerId,
      courtName: (c?.courtName as any) || prev.courtName,
    }));
    setIsAddDialogOpen(true);
    // Strip the query so refresh/back doesn't re-open the dialog.
    const cleanUrl = window.location.pathname;
    window.history.replaceState(null, "", cleanUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases.length]);

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
    opponentResponseRequired: false,
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
      courtName: "",
      courtRoom: "",
      notes: "",
      responseRequired: false,
      attendingLawyerId: "",
    });
    setReplaceHearingId(null);
    setConflictHearing(null);
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
      opponentResponseRequired: false,
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
    if (!formData.caseId || formData.caseId === "none") {
      toast({ title: "يجب اختيار القضية المرتبطة بالجلسة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await addHearing(formData);
      if (replaceHearingId) {
        try { await deleteHearing(replaceHearingId); } catch {}
        setReplaceHearingId(null);
      }
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
      if (resultForm.result === HearingResult.NEW_SESSION) {
        data.nextHearingDate = resultForm.nextHearingDate;
        data.nextHearingTime = resultForm.nextHearingTime;
        data.responseRequired = resultForm.responseRequired;
        data.opponentResponseRequired = resultForm.opponentResponseRequired;
      }
      const res = await submitResult(resultDialogHearing.id, data);
      const hasNewHearing = res.createdTasks?.some((t: any) => t.type === "new_hearing");
      const tasksMsg = res.createdTasks?.length
        ? `\nتم إنشاء ${res.createdTasks.length} مهمة تلقائياً`
        : "";
      const memosMsg = res.createdMemos?.length
        ? `\nتم إنشاء ${res.createdMemos.length} مذكرة تلقائياً`
        : "";
      const opponentMsg = data.opponentResponseRequired && hasNewHearing
        ? "\nتم تعليم الجلسة القادمة: مطلوب رد من الخصم"
        : "";
      toast({ title: "تم تسجيل النتيجة بنجاح" + tasksMsg + memosMsg + opponentMsg });
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
      courtName: (hearing.courtName as CourtTypeValue) || ("" as CourtTypeValue),
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

  const openReassignDialog = (hearing: Hearing) => {
    setReassignLawyerId(hearing.attendingLawyerId || "");
    setReassignDialogHearing(hearing);
  };

  const handleReassign = async () => {
    if (!reassignDialogHearing || !reassignLawyerId) return;
    setSubmitting(true);
    try {
      await updateHearing(reassignDialogHearing.id, { attendingLawyerId: reassignLawyerId } as any);
      toast({ title: "تم إسناد الجلسة لمحامي جديد" });
      setReassignDialogHearing(null);
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
    if (!caseData) return { number: caseId || "بدون قضية", client: "", plaintiff: "", opponent: "", classification: "", clientRole: "-" };
    const clientRole = getClientRoleLabel(caseData.caseClassification, (caseData as any).clientRole);
    console.log("[clientRole][hearings:list]", {
      caseNumber: caseData.caseNumber,
      caseClassification: caseData.caseClassification,
      rawClientRole: (caseData as any).clientRole,
      rendered: clientRole,
    });
    const clientName = getClientName(caseData.clientId);
    return {
      number: caseData.caseNumber,
      client: clientName,
      // Fall back to client name when the case has no plaintiffName recorded —
      // that happens for cases where the firm's client IS the plaintiff and
      // the operator never typed the name a second time.
      plaintiff: ((caseData as any).plaintiffName || "").trim() || clientName || "",
      opponent: caseData.opponentName || "",
      classification: caseData.caseClassification || "",
      clientRole,
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
                <Label>القضية *</Label>
                <Popover open={caseComboOpen} onOpenChange={setCaseComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={caseComboOpen}
                      data-testid="select-case"
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
                            .filter(c => c.status !== "مغلق" && c.currentStage !== "مقفلة" && !(c as any).isArchived)
                            .map(c => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={(val) => {
                                  const selected = cases.find(x => x.id === val);
                                  if (!selected) return;
                                  const autoLawyer = selected.primaryLawyerId || selected.responsibleLawyerId || "";
                                  // Auto-derive hearing type: settlement/conciliation stages → TARADI,
                                  // labor case type → SETTLEMENT (tasweya), otherwise COURT.
                                  const stage = selected.currentStage;
                                  const settlementStages = new Set([
                                    "مداولة_الصلح",
                                    "أغلق_طلب_الصلح",
                                    "قيد_التدقيق_في_تراضي",
                                    "رفع_بمنصة_تراضي",
                                  ]);
                                  let autoType: string = HearingType.COURT;
                                  if (settlementStages.has(stage)) {
                                    autoType = HearingType.TARADI;
                                  } else if (selected.caseType === "عمالي") {
                                    autoType = HearingType.SETTLEMENT;
                                  }
                                  setFormData(prev => ({
                                    ...prev,
                                    caseId: val,
                                    attendingLawyerId: autoLawyer,
                                    hearingType: autoType as any,
                                    courtName: (selected.courtName || prev.courtName) as any,
                                  }));
                                  setCaseComboOpen(false);
                                  // If the case already has an upcoming future hearing,
                                  // prompt the user to replace it or keep both.
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const existingFuture = hearings.find(h =>
                                    h.caseId === val &&
                                    h.status === HearingStatus.UPCOMING &&
                                    new Date(h.hearingDate) >= today
                                  );
                                  if (existingFuture) {
                                    setConflictHearing(existingFuture);
                                  }
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
                {formData.caseId && (() => {
                  const c = cases.find(x => x.id === formData.caseId);
                  if (!c) return null;
                  return (
                    <div className="mt-2 rounded-md border bg-muted/40 p-2 text-xs space-y-1" dir="rtl">
                      <div>
                        <span className="text-muted-foreground">المرحلة:</span>{" "}
                        <span className="font-medium">{c.currentStage}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">القسم:</span>{" "}
                        <span className="font-medium">{getDepartmentName(c.departmentId || "")}</span>
                      </div>
                    </div>
                  );
                })()}
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
                <Input
                  data-testid="input-court-name"
                  value={formData.courtName as string}
                  onChange={(e) => setFormData({ ...formData, courtName: e.target.value as any })}
                  placeholder="اسم المحكمة"
                />
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
          {!isLoading && filteredHearings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد جلسات</p>
            </div>
          ) : (
            <div className="w-full overflow-hidden">
              <table className="w-full caption-bottom text-xs" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead className="[&_tr]:border-b">
                  <tr className="border-b">
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">التاريخ</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">المدعي</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">المدعى عليه</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">الصفة</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">القضية / المحكمة</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">النتيجة</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {pagedHearings.map((hearing) => {
                      const caseInfo = getCaseInfo(hearing.caseId);
                      const isAttendingLawyer = user?.id === hearing.attendingLawyerId;
                      const canActOnHearing = isAttendingLawyer || user?.role === "branch_manager" || user?.role === "admin_support";
                      const canEditHearing =
                        user?.role === "branch_manager" ||
                        user?.role === "admin_support";
                      const canDeleteHearing =
                        user?.role === "branch_manager" ||
                        user?.role === "admin_support";
                      const canReassignAttendingLawyer = user?.role === "department_head";
                      const isFutureHearing = isHearingInFuture(hearing.hearingDate);
                      return (
                        <tr key={hearing.id} data-testid={`row-hearing-${hearing.id}`} className="border-b transition-colors hover:bg-muted/50">
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            <div className="flex flex-col items-center gap-1">
                              <Badge className={getUrgencyColor(hearing.hearingDate)}>
                                <DualDateDisplay date={hearing.hearingDate} compact />
                              </Badge>
                              <LtrInline className="text-xs text-muted-foreground">{formatTimeAmPm(hearing.hearingTime)}</LtrInline>
                            </div>
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            <span className="text-sm"><BidiText>{caseInfo.plaintiff || "-"}</BidiText></span>
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            <span className="text-sm"><BidiText>{caseInfo.opponent || "-"}</BidiText></span>
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            {caseInfo.clientRole && caseInfo.clientRole !== "-" ? (
                              <Badge variant="outline" className="text-xs">{caseInfo.clientRole}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
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
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
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
                              {hearing.opponentResponseRequired && (
                                <Badge variant="outline" className="text-xs border-orange-500 text-orange-600 dark:text-orange-400">
                                  مطلوب رد من الخصم
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            <div className="flex items-center justify-center gap-0.5 flex-wrap">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    data-testid={`button-view-${hearing.id}`}
                                    onClick={() => setDetailHearingId(hearing.id)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>عرض التفاصيل</TooltipContent>
                              </Tooltip>
                              {canEditHearing && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      data-testid={`button-edit-hearing-${hearing.id}`}
                                      onClick={() => openEditDialog(hearing)}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>تعديل الجلسة</TooltipContent>
                                </Tooltip>
                              )}
                              {canReassignAttendingLawyer && hearing.status === HearingStatus.UPCOMING && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      data-testid={`button-reassign-${hearing.id}`}
                                      onClick={() => openReassignDialog(hearing)}
                                    >
                                      <UserCog className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>إسناد لمحامي</TooltipContent>
                                </Tooltip>
                              )}
                              {hearing.status === HearingStatus.UPCOMING && canActOnHearing && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className={`h-7 w-7 ${isFutureHearing ? "opacity-50 cursor-not-allowed" : ""}`}
                                        data-testid={`button-result-${hearing.id}`}
                                        aria-disabled={isFutureHearing}
                                        onClick={() => {
                                          if (isFutureHearing) return;
                                          resetResultForm();
                                          setResultDialogHearing(hearing);
                                        }}
                                      >
                                        <Gavel className="w-4 h-4 text-primary" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{isFutureHearing ? "لا يمكن تسجيل النتيجة قبل موعد الجلسة" : "تسجيل النتيجة"}</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
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
                                      className="h-7 w-7"
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
                                      className="h-7 w-7"
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
                              {canDeleteHearing && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
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
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
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
                  {(() => {
                    const ht = resultDialogHearing?.hearingType;
                    const linkedCase = resultDialogHearing?.caseId
                      ? getCaseById(resultDialogHearing.caseId)
                      : null;
                    const isAdminCourt =
                      ht === HearingType.COURT && linkedCase?.caseType === "إداري";

                    // Settlement (تراضي / تسوية_ودية): conciliation outcome only.
                    if (ht === HearingType.TARADI || ht === HearingType.SETTLEMENT) {
                      return (
                        <>
                          <SelectItem value="تم_الصلح">تم الصلح</SelectItem>
                          <SelectItem value="لم_يتم_الصلح">لم يتم الصلح</SelectItem>
                        </>
                      );
                    }
                    // Admin court (إداري): no conciliation in admin courts.
                    if (isAdminCourt) {
                      return (
                        <>
                          <SelectItem value="موعد_جديد">جلسة (موعد جديد)</SelectItem>
                          <SelectItem value="حكم">حكم</SelectItem>
                          <SelectItem value="شطب">شطب</SelectItem>
                        </>
                      );
                    }
                    // Regular court (commercial / general / labor).
                    return (
                      <>
                        <SelectItem value="موعد_جديد">جلسة (موعد جديد)</SelectItem>
                        <SelectItem value="حكم">حكم</SelectItem>
                        <SelectItem value="تم_الصلح">تم الصلح</SelectItem>
                        <SelectItem value="شطب">شطب</SelectItem>
                      </>
                    );
                  })()}
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

            {resultForm.result === HearingResult.NEW_SESSION && (
              <Card className="p-4 space-y-3">
                <p className="text-sm font-medium text-primary flex items-center gap-1">
                  <ArrowLeftRight className="w-4 h-4" />
                  تفاصيل الموعد الجديد
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
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="opponentResponseRequired"
                    checked={resultForm.opponentResponseRequired}
                    onCheckedChange={(checked) =>
                      setResultForm({ ...resultForm, opponentResponseRequired: !!checked })
                    }
                    data-testid="checkbox-opponent-response-required"
                  />
                  <Label htmlFor="opponentResponseRequired" className="text-sm cursor-pointer">
                    مطلوب رد من الخصم
                  </Label>
                </div>
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

      <Dialog open={!!reassignDialogHearing} onOpenChange={(open) => !open && setReassignDialogHearing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              إسناد لمحامي
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>المحامي المكلف بالحضور</Label>
              <Select value={reassignLawyerId} onValueChange={setReassignLawyerId}>
                <SelectTrigger data-testid="select-reassign-lawyer">
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
              data-testid="button-cancel-reassign"
              onClick={() => setReassignDialogHearing(null)}
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-save-reassign"
              onClick={handleReassign}
              disabled={!reassignLawyerId || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ
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
                {(() => {
                  const hearingTs = new Date(detailHearing.hearingDate).getTime();
                  const allCaseMemos = getMemosByCase(detailHearing.caseId);
                  const directLinked = allCaseMemos.filter((m) => (m as any).hearingId === detailHearing.id);
                  const dateLinked = allCaseMemos.filter((m) => {
                    const ts = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
                    return !isNaN(ts) && !isNaN(hearingTs) && ts >= hearingTs;
                  });
                  const linkedMemos = directLinked.length > 0 ? directLinked : dateLinked;
                  const linkedTasks = getTasksByCase(detailHearing.caseId).filter((t) => {
                    const ts = (t as any).createdAt ? new Date((t as any).createdAt).getTime() : NaN;
                    return !isNaN(ts) && !isNaN(hearingTs) && ts >= hearingTs;
                  });
                  const doneMemoStatuses = new Set(["معتمدة", "مرفوعة", "منجزة"]);
                  return (
                    <div className="border border-border rounded-md p-3 space-y-2">
                      <p className="text-xs text-muted-foreground font-semibold">المهام المرتبطة</p>
                      {linkedMemos.length === 0 && linkedTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">لا توجد مهام مرتبطة</p>
                      ) : (
                        <div className="space-y-2">
                          {linkedMemos.map((m) => {
                            const memoTypeLabel = m.memoType === MemoType.RESPONSE ? "جوابية" : "تحرير";
                            const isDone = doneMemoStatuses.has(m.status as any);
                            return (
                              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex flex-col">
                                  <span className="font-medium">{m.title}</span>
                                  <span className="text-xs text-muted-foreground">مذكرة {memoTypeLabel}</span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    isDone
                                      ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"
                                      : "border-orange-500 text-orange-500"
                                  }
                                >
                                  {MemoStatusLabels[m.status] || m.status}
                                </Badge>
                              </div>
                            );
                          })}
                          {linkedTasks.map((t) => {
                            const isDone = t.status === FieldTaskStatus.COMPLETED;
                            return (
                              <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex flex-col">
                                  <span className="font-medium">{t.title}</span>
                                  <span className="text-xs text-muted-foreground">مهمة ميدانية</span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    isDone
                                      ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"
                                      : "border-orange-500 text-orange-500"
                                  }
                                >
                                  {t.status}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                    {detailHearing.result === "موعد_جديد" && (() => {
                      const hearingMemoRequired = !!detailHearing.memoRequired;
                      const opponentResponseRequired = !!detailHearing.opponentResponseRequired;
                      if (!hearingMemoRequired && !opponentResponseRequired) return null;
                      const hearingTs = new Date(detailHearing.hearingDate).getTime();
                      const caseMemos = getMemosByCase(detailHearing.caseId);
                      const directMatches = caseMemos.filter((m) => (m as any).hearingId === detailHearing.id);
                      const relevantMemos = directMatches.length > 0
                        ? directMatches
                        : caseMemos.filter((m) => {
                            const createdTs = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
                            return !isNaN(createdTs) && createdTs >= hearingTs;
                          });
                      const memoDone = relevantMemos.some(
                        (m) => m.status === "معتمدة" || m.status === "مرفوعة" || (m.status as any) === "منجزة",
                      );
                      return (
                        <div className="border border-border rounded-md p-3 space-y-2">
                          <p className="text-xs text-muted-foreground font-semibold">المطلوب بعد الجلسة</p>
                          {hearingMemoRequired && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">مذكرة مطلوبة</span>
                              {memoDone ? (
                                <Badge variant="outline" className="border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
                                  منجزة
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-orange-500 text-orange-500">
                                  قيد العمل
                                </Badge>
                              )}
                            </div>
                          )}
                          {opponentResponseRequired && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">مطلوب رد من الخصم</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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

      <Dialog open={!!conflictHearing} onOpenChange={(open) => { if (!open) setConflictHearing(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>توجد جلسة قادمة لهذه القضية</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>هذه القضية لديها جلسة قادمة بالفعل بتاريخ{" "}
              <span className="font-medium">
                {(() => {
                  const { hijri, gregorian } = formatDualDate(conflictHearing?.hearingDate);
                  return <>{hijri} — <LtrInline>{gregorian}</LtrInline> م</>;
                })()}
              </span>
              {conflictHearing?.hearingTime && <> الساعة <LtrInline>{formatTimeAmPm(conflictHearing.hearingTime)}</LtrInline></>}.
            </p>
            <p>هل تريد استبدال الجلسة القادمة بالجلسة الجديدة، أم الإبقاء على كليهما؟</p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setReplaceHearingId(null); setConflictHearing(null); }}
              data-testid="button-keep-both-hearings"
            >
              الإبقاء على كليهما
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (conflictHearing) setReplaceHearingId(conflictHearing.id);
                setConflictHearing(null);
              }}
              data-testid="button-replace-hearing"
            >
              استبدال الجلسة القادمة
            </Button>
          </DialogFooter>
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
