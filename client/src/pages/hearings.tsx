import { useState, useEffect } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePageSize } from "@/hooks/use-page-size";
import { HearingResultDialog } from "@/components/hearing-result-dialog";
import { HearingDetailsDialog, getStatusBadge } from "@/components/hearing-details-dialog";
import { getClientRoleLabel } from "@/lib/client-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import {
  Plus,
  Calendar,
  MapPin,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileText,
  Gavel,
  Eye,
  Loader2,
  Scale,
  Phone,
  Trash2,
  Pencil,
  UserCog,
  Search,
  Flag,
} from "lucide-react";
import { useHearings } from "@/lib/hearings-context";
import { extractApiError } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { useCases } from "@/lib/cases-context";
import { useMemos } from "@/lib/memos-context";
import { CaseStageLabels, HearingResultLabels, isFirmFuture } from "@shared/schema";
import type { CaseStageValue } from "@shared/schema";
import { useClients } from "@/lib/clients-context";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import type { Hearing } from "@shared/schema";
import { HearingStatus, HearingResult, HearingType, type HearingTypeValue } from "@shared/schema";
import { differenceInDays, isToday } from "date-fns";
import { formatTimeAmPm, formatDualDate, formatHijriDateFull } from "@/lib/date-utils";

// Arabic weekday names indexed by JS Date.getDay() (Sunday = 0).
const ARABIC_WEEKDAYS = [
  "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت",
] as const;
const arabicWeekday = (date: string): string => {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : ARABIC_WEEKDAYS[d.getDay()];
};
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { useToast } from "@/hooks/use-toast";
import {
  HearingsAdvancedFilters,
  EMPTY_HEARINGS_ADV_FILTERS,
  PENDING_MEMO_STATUSES,
  type AdvancedHearingsFilters,
} from "@/components/hearings-advanced-filters";

function getUrgencyColor(hearingDate: string) {
  const days = differenceInDays(new Date(hearingDate), new Date());
  if (days < 0) return "bg-muted text-muted-foreground";
  if (days === 0) return "bg-destructive text-destructive-foreground";
  if (days <= 3) return "bg-orange-500 text-white dark:bg-orange-600";
  if (days <= 7) return "bg-yellow-500 text-white dark:bg-yellow-600";
  return "bg-accent text-accent-foreground";
}

// TIMEZONE FIX — same one-line class as the server guard on POST /:id/result:
// parsing "YYYY-MM-DD" as UTC and then reinterpreting it in the HOST's local time
// used two different calendars, so a browser west of the firm dimmed the
// record-result button on the hearing's own day. isFirmFuture compares calendar
// days as strings in the firm's timezone. (The SERVER decides; this only controls
// whether the button looks available.)
function isHearingInFuture(hearingDate: string): boolean {
  return isFirmFuture(hearingDate);
}

// `cancellationReason` is optional and used ONLY by the ملغية branch, where it
// becomes the badge's title — the same badge+title idiom the flag badge uses,
// so a cancelled row explains itself on hover without opening the dialog.
export default function HearingsPage() {
  const {
    hearings,
    isLoading,
    addHearing,
    updateHearing,
    submitReport,
    closeHearing,
    cancelHearing,
    deleteHearing,
    setHearingFlag,
    getUpcomingHearings,
  } = useHearings();
  const { cases, getCaseById } = useCases();
  const { getMemosByHearing } = useMemos();
  const { getClientName } = useClients();
  const { user, users, isViewer } = useAuth();
  const { departments, getDepartmentName } = useDepartments();
  const { toast } = useToast();

  // Invalidate hearings on page mount to pick up changes from other tabs/users
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [caseComboOpen, setCaseComboOpen] = useState(false);
  const [detailHearingId, setDetailHearingId] = useState<string | null>(null);
  const [resultDialogHearing, setResultDialogHearing] = useState<Hearing | null>(null);
  const [reportDialogHearing, setReportDialogHearing] = useState<Hearing | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [basicSearch, setBasicSearch] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterLawyer, setFilterLawyer] = useState<string>("all");
  const [advFilters, setAdvFilters] = useState<AdvancedHearingsFilters>(EMPTY_HEARINGS_ADV_FILTERS);
  const [deletingHearingId, setDeletingHearingId] = useState<string | null>(null);
  // "جلسة مُعلَّمة" — flag dialog. Flagging opens this to capture the mandatory
  // reason; UNflagging is immediate (nothing to ask, and the server clears the
  // reason itself).
  const [flagDialogHearing, setFlagDialogHearing] = useState<Hearing | null>(null);
  const [flagReasonInput, setFlagReasonInput] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  // Unflagging is destructive-ish (it wipes the team's alert + its reason), so
  // it now asks first. No reason needed — just confirm.
  const [unflagConfirmHearing, setUnflagConfirmHearing] = useState<Hearing | null>(null);
  // Cancel-hearing confirmation + its MANDATORY reason.
  const [cancelDialogHearing, setCancelDialogHearing] = useState<Hearing | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [editDialogHearing, setEditDialogHearing] = useState<Hearing | null>(null);
  const [reassignDialogHearing, setReassignDialogHearing] = useState<Hearing | null>(null);
  const [reassignLawyerId, setReassignLawyerId] = useState<string>("");
  const [conflictHearing, setConflictHearing] = useState<Hearing | null>(null);
  const [replaceHearingId, setReplaceHearingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    hearingDate: "",
    hearingTime: "",
    courtName: "",
    courtRoom: "",
    notes: "",
    attendingLawyerId: "",
  });

  const [formData, setFormData] = useState({
    caseId: "",
    hearingDate: "",
    hearingTime: "",
    hearingType: HearingType.COURT as HearingTypeValue,
    courtName: "",
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
      // "المترافع" first when the case designates one — mirrors the server
      // default in POST /api/hearings so the pre-filled value matches what the
      // server would have chosen anyway.
      attendingLawyerId: c?.litigatorId || c?.primaryLawyerId || c?.responsibleLawyerId || prev.attendingLawyerId,
      courtName: c?.courtName || prev.courtName,
    }));
    setIsAddDialogOpen(true);
    // Strip the query so refresh/back doesn't re-open the dialog.
    const cleanUrl = window.location.pathname;
    window.history.replaceState(null, "", cleanUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases.length]);

  // Open the hearing-detail dialog when navigated here from the case
  // dialog's hearings tab with ?openHearing=<id>. Waits until the
  // hearings list has loaded so the lookup actually finds the row.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("openHearing");
    if (!id) return;
    if (!hearings.some((h) => h.id === id)) return;
    setDetailHearingId(id);
    const cleanUrl = window.location.pathname;
    window.history.replaceState(null, "", cleanUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hearings.length]);

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

  // Seeds the report dialog FROM the hearing, so an EDIT opens on the existing
  // text instead of a blank form that would wipe it on save. For a hearing with
  // no report yet every field is empty, i.e. identical to resetReportForm — so
  // this is the single entry point for both writing and correcting.
  const prefillReportForm = (h: Hearing) => {
    setReportForm({
      hearingReport: h.hearingReport || "",
      recommendations: h.recommendations || "",
      nextSteps: h.nextSteps || "",
      contactCompleted: !!h.contactCompleted,
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

  // Cancelling used to fire immediately on click with no confirmation and no
  // reason. Now it opens a dialog that captures the MANDATORY سبب الإلغاء; the
  // server 400s on an empty reason regardless.
  const openCancelDialog = (hearing: Hearing) => {
    setCancelReasonInput("");
    setCancelDialogHearing(hearing);
  };

  const handleConfirmCancelHearing = async () => {
    if (!cancelDialogHearing) return;
    const reason = cancelReasonInput.trim();
    if (!reason) {
      toast({ title: "خطأ", description: "سبب الإلغاء مطلوب", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await cancelHearing(cancelDialogHearing.id, reason);
      toast({ title: "تم إلغاء الجلسة" });
      setCancelDialogHearing(null);
      setCancelReasonInput("");
    } catch (e: any) {
      toast({ title: "خطأ", description: extractApiError(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle entry point. Already flagged → clear immediately (no question to
  // ask). Not flagged → open the dialog, because the reason is MANDATORY and
  // the server 400s without it.
  const handleToggleFlag = (hearing: Hearing) => {
    // Already flagged → confirm before clearing. Unflagging destroys the team's
    // alert AND its reason (the server nulls reason/by/at together), so a
    // mis-click is not silently recoverable.
    if (hearing.isFlagged) {
      setUnflagConfirmHearing(hearing);
      return;
    }
    setFlagReasonInput("");
    setFlagDialogHearing(hearing);
  };

  const handleConfirmUnflag = async () => {
    if (!unflagConfirmHearing) return;
    setFlagSubmitting(true);
    try {
      await setHearingFlag(unflagConfirmHearing.id, false);
      toast({ title: "تم إلغاء تعليم الجلسة" });
      setUnflagConfirmHearing(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: extractApiError(e), variant: "destructive" });
    } finally {
      setFlagSubmitting(false);
    }
  };

  const handleConfirmFlag = async () => {
    if (!flagDialogHearing) return;
    const reason = flagReasonInput.trim();
    // Client pre-check mirrors the server's 400 so the user never round-trips
    // for an empty reason; the server stays the authority.
    if (!reason) {
      toast({ title: "خطأ", description: "سبب التعليم مطلوب", variant: "destructive" });
      return;
    }
    setFlagSubmitting(true);
    try {
      await setHearingFlag(flagDialogHearing.id, true, reason);
      toast({ title: "تم تعليم الجلسة للانتباه" });
      setFlagDialogHearing(null);
      setFlagReasonInput("");
    } catch (e: any) {
      toast({ title: "خطأ", description: extractApiError(e), variant: "destructive" });
    } finally {
      setFlagSubmitting(false);
    }
  };

  const openEditDialog = (hearing: Hearing) => {
    setEditFormData({
      hearingDate: hearing.hearingDate || "",
      hearingTime: hearing.hearingTime || "",
      courtName: hearing.courtName || "",
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
      await updateHearing(reassignDialogHearing.id, { attendingLawyerId: reassignLawyerId });
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
    // Fallback for legacy rows with no attending lawyer stored. Same chain the
    // server uses at creation, so an old hearing on a case that has since
    // designated a المترافع resolves to them rather than to the responsible
    // lawyer — this is DISPLAY only and reassigns nothing.
    const caseData = hearing.caseId ? getCaseById(hearing.caseId) : null;
    return caseData?.litigatorId || caseData?.primaryLawyerId || caseData?.responsibleLawyerId || null;
  };

  const getDepartmentForHearing = (hearing: Hearing) => {
    const caseData = hearing.caseId ? getCaseById(hearing.caseId) : null;
    return caseData?.departmentId || null;
  };

  const lawyersForFilter = filterDepartment === "all"
    ? users.filter(u => u.canBeAssignedCases)
    : users.filter(u => u.canBeAssignedCases && u.departmentId === filterDepartment);

  const basicSearchQ = basicSearch.trim().toLowerCase();
  const filteredHearings = hearings
    .filter((h) => {
      // Existing single-select filters (unchanged)
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

      // Advanced filters (all AND'd; empty arrays / strings = no constraint)
      if (advFilters.hearingTypes.length && !advFilters.hearingTypes.includes(h.hearingType)) return false;
      if (advFilters.results.length && (!h.result || !advFilters.results.includes(h.result))) return false;
      if (advFilters.statuses.length) {
        const matchesAdvStatus = advFilters.statuses.some((s) =>
          s === "today" ? isToday(new Date(h.hearingDate)) : s === h.status,
        );
        if (!matchesAdvStatus) return false;
      }
      if (advFilters.depts.length) {
        const deptId = getDepartmentForHearing(h);
        if (!deptId || !advFilters.depts.includes(deptId)) return false;
      }
      if (advFilters.lawyers.length) {
        const lawyerId = getLawyerForHearing(h);
        if (!lawyerId || !advFilters.lawyers.includes(lawyerId)) return false;
      }
      if (advFilters.classification) {
        const c = h.caseId ? getCaseById(h.caseId) : null;
        if (!c || c.caseClassification !== advFilters.classification) return false;
      }
      if (advFilters.dateFrom && h.hearingDate < advFilters.dateFrom) return false;
      if (advFilters.dateTo && h.hearingDate > advFilters.dateTo) return false;
      if (advFilters.withPendingMemos) {
        const linked = getMemosByHearing(h.id);
        if (!linked.some((m) => PENDING_MEMO_STATUSES.has(m.status))) return false;
      }
      if (basicSearchQ) {
        const c = h.caseId ? getCaseById(h.caseId) : null;
        const clientName = c?.clientId ? getClientName(c.clientId) : "";
        const hay = [
          c?.caseNumber,
          c?.courtCaseNumber,
          c?.plaintiffName,
          c?.opponentName,
          h.courtName,
          h.courtNameOther,
          clientName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(basicSearchQ)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Two-tier sort: upcoming (today + future) first ascending so the
      // closest hearing is at the top, then past hearings descending so
      // the most recently completed sit just below the upcoming block.
      // Today's date is computed from local components — toISOString
      // would shift to UTC and flip "today" backwards by one day for
      // anyone reading the page in the small hours of Riyadh time.
      const now = new Date();
      const todayIso =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const aIsPast = a.hearingDate < todayIso;
      const bIsPast = b.hearingDate < todayIso;
      if (aIsPast !== bIsPast) return aIsPast ? 1 : -1;
      const dir = aIsPast ? -1 : 1;
      const dateDiff = a.hearingDate.localeCompare(b.hearingDate) * dir;
      if (dateDiff !== 0) return dateDiff;
      return (a.hearingTime || "").localeCompare(b.hearingTime || "") * dir;
    });

  // Rows-per-page is user-configurable and persisted per user + per page.
  const [HEARING_PAGE_SIZE, setHearingPageSize] = usePageSize("hearings");
  const [hearingPage, setHearingPage] = useState(1);
  useEffect(() => { setHearingPage(1); }, [basicSearch, filterStatus, filterDepartment, filterLawyer, advFilters]);
  const hearingTotalPages = Math.max(1, Math.ceil(filteredHearings.length / HEARING_PAGE_SIZE));
  const pagedHearings = filteredHearings.slice((hearingPage - 1) * HEARING_PAGE_SIZE, hearingPage * HEARING_PAGE_SIZE);
  const handleHearingPageSizeChange = (size: number) => { setHearingPageSize(size); setHearingPage(1); };

  const getCaseInfo = (caseId: string) => {
    const caseData = getCaseById(caseId);
    if (!caseData) return { number: caseId || "بدون قضية", client: "", plaintiff: "", opponent: "", classification: "", clientRole: "-" };
    const clientRole = getClientRoleLabel(caseData.caseClassification, caseData.clientRole);
    const clientName = getClientName(caseData.clientId);
    return {
      number: caseData.caseNumber,
      client: clientName,
      // Fall back to client name when the case has no plaintiffName recorded —
      // that happens for cases where the firm's client IS the plaintiff and
      // the operator never typed the name a second time.
      plaintiff: (caseData.plaintiffName || "").trim() || clientName || "",
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
          {!isViewer && (
            <DialogTrigger asChild>
              <Button data-testid="button-add-hearing" onClick={resetForm}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة جلسة
              </Button>
            </DialogTrigger>
          )}
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
                            .filter(c => c.status !== "مغلق" && c.currentStage !== "مقفلة" && !c.isArchived)
                            .map(c => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={(val) => {
                                  const selected = cases.find(x => x.id === val);
                                  if (!selected) return;
                                  // "المترافع" first — same chain as the server.
                                  const autoLawyer = selected.litigatorId || selected.primaryLawyerId || selected.responsibleLawyerId || "";
                                  // Auto-derive hearing type: settlement/conciliation stages → TARADI,
                                  // labor case type → SETTLEMENT (tasweya), otherwise COURT.
                                  const stage = selected.currentStage;
                                  const settlementStages = new Set([
                                    "مداولة_الصلح",
                                    "أغلق_طلب_الصلح",
                                    "قيد_التدقيق_في_تراضي",
                                    "رفع_بمنصة_تراضي",
                                  ]);
                                  let autoType: HearingTypeValue = HearingType.COURT;
                                  if (settlementStages.has(stage)) {
                                    autoType = HearingType.TARADI;
                                  } else if (selected.caseType === "عمالي") {
                                    autoType = HearingType.SETTLEMENT;
                                  }
                                  setFormData(prev => ({
                                    ...prev,
                                    caseId: val,
                                    attendingLawyerId: autoLawyer,
                                    hearingType: autoType,
                                    courtName: selected.courtName || prev.courtName,
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
                        <span className="font-medium">{CaseStageLabels[c.currentStage as CaseStageValue] || c.currentStage}</span>
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
                    setFormData({ ...formData, hearingType: value as HearingTypeValue })
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
                  value={formData.courtName}
                  onChange={(e) => setFormData({ ...formData, courtName: e.target.value })}
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
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <SmartInput
                inputType="text"
                data-testid="input-hearings-search"
                placeholder="بحث برقم القضية، اسم المدعي، الخصم، المحكمة، أو العميل..."
                value={basicSearch}
                onChange={(e) => setBasicSearch(e.target.value)}
                className="pr-10"
              />
            </div>
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
            <HearingsAdvancedFilters
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
          {!isLoading && filteredHearings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد جلسات</p>
            </div>
          ) : (
            <div className="w-full overflow-hidden">
              <table className="w-full caption-bottom text-xs" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="[&_tr]:border-b">
                  <tr className="border-b">
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">#</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">التاريخ</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">المدعي</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">المدعى عليه</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">الصفة</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">القضية / المحكمة</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">المحامي المكلف</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">النتيجة</th>
                    <th className="h-10 px-1 text-center align-middle font-medium text-muted-foreground text-xs">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {pagedHearings.map((hearing, idx) => {
                      const caseInfo = getCaseInfo(hearing.caseId);
                      const isAttendingLawyer = user?.id === hearing.attendingLawyerId;
                      const canActOnHearing = isAttendingLawyer || user?.role === "branch_manager" || user?.role === "admin_support";
                      // FREE WIN — PATCH /api/hearings/:id is gated by canModifyCase
                      // on the PARENT CASE, which has always admitted the own-dept
                      // department_head and the case's assigned lawyers; the UI hid
                      // the button from both. The hearings list is already scoped to
                      // cases the user can see, so surfacing it here matches the
                      // server. NOTE: hearing ACTIONS (result / report / close /
                      // cancel) are NOT touched — canActOnHearing has no department
                      // logic at all and is a separate batch.
                      // getCaseInfo returns a display projection with no department or
                      // lawyer fields — read the raw case for the permission check.
                      const parentCaseForHearing = getCaseById(hearing.caseId);
                      const isCaseLawyerForHearing =
                        !!user && !!parentCaseForHearing && (
                          parentCaseForHearing.primaryLawyerId === user.id ||
                          parentCaseForHearing.responsibleLawyerId === user.id ||
                          (Array.isArray(parentCaseForHearing.assignedLawyers)
                            && parentCaseForHearing.assignedLawyers.includes(user.id))
                        );
                      const isOwnDeptHeadForHearing =
                        user?.role === "department_head" &&
                        !!user.departmentId &&
                        !!parentCaseForHearing?.departmentId &&
                        parentCaseForHearing.departmentId === user.departmentId;
                      const canEditHearing =
                        user?.role === "branch_manager" ||
                        user?.role === "admin_support" ||
                        isOwnDeptHeadForHearing ||
                        isCaseLawyerForHearing;
                      const canDeleteHearing =
                        user?.role === "branch_manager" ||
                        user?.role === "admin_support";
                      // MISMATCH FIX — was department_head ONLY, so a branch_manager
                      // could not reassign the attending lawyer from the UI even
                      // though PATCH /api/hearings/:id (canModifyCase) accepts them.
                      // Scoped the head to the parent case's department while here.
                      const canReassignAttendingLawyer =
                        user?.role === "branch_manager" || isOwnDeptHeadForHearing;
                      // "جلسة مُعلَّمة" — the SAME two roles the server's
                      // requireRole gate enforces, so visibility === authorization.
                      // Everyone else still SEES the flag (tint + badge); only
                      // these two can set or clear it.
                      const canFlagHearing =
                        user?.role === "branch_manager" ||
                        user?.role === "admin_support";
                      const isFutureHearing = isHearingInFuture(hearing.hearingDate);
                      // Day-boundary separator: thicken the row's bottom
                      // border when the next row is a different date so
                      // day-grouping reads at a glance. Last row stays
                      // thin (the [&_tr:last-child]:border-0 on tbody
                      // strips it anyway).
                      const nextDate = pagedHearings[idx + 1]?.hearingDate;
                      const isDayBoundary = !!nextDate && nextDate !== hearing.hearingDate;
                      // Look up the attending lawyer's display name.
                      const attendingLawyerName = hearing.attendingLawyerId
                        ? users.find((u: any) => u.id === hearing.attendingLawyerId)?.name || "—"
                        : "—";
                      return (
                        <tr
                          key={hearing.id}
                          data-testid={`row-hearing-${hearing.id}`}
                          className={
                            // Day-boundary separator: thicker AND coloured
                            // so the change is clearly visible at a glance.
                            // Plain border-b-2 wasn't reading distinct from
                            // border-b in some themes — use border-b-4 with
                            // an amber accent so day-grouping pops without
                            // being garish. Same-day rows keep the default.
                            //
                            // The flag tint is COMPOSED onto whichever border
                            // variant applies, never substituted for it —
                            // dropping the day-boundary border on a flagged row
                            // would silently break day-grouping. Mirrors the
                            // cases-page rowClass idiom (bg-amber-50/60
                            // dark:bg-amber-950/20 for group 1) in red.
                            [
                              isDayBoundary
                                ? "border-b-4 border-amber-500/60"
                                : "border-b",
                              "transition-colors hover:bg-muted/50",
                              hearing.isFlagged ? "bg-red-50/60 dark:bg-red-950/20" : "",
                            ].filter(Boolean).join(" ")
                          }
                        >
                          {/* Display-only sequential number — index inside the
                              RENDERED page, so filters/sorting/search renumber
                              from 1. Continues across pages via the page offset
                              (the pager is a plain slice of one sorted list). */}
                          <td
                            className="text-center px-1 py-2 text-xs align-middle overflow-hidden text-muted-foreground"
                            data-testid={`cell-index-${hearing.id}`}
                          >
                            {(hearingPage - 1) * HEARING_PAGE_SIZE + idx + 1}
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            <div className="flex flex-col items-center gap-1">
                              {/* Top: full Hijri date — e.g. "18 ذو القعدة 1447 هـ".
                                  Both lines use text-sm font-semibold for a
                                  single consistent size across the cell. */}
                              <Badge className={`${getUrgencyColor(hearing.hearingDate)} text-sm font-semibold`}>
                                {formatHijriDateFull(hearing.hearingDate)}
                              </Badge>
                              {/* Bottom: weekday + time on one line, same
                                  size and weight as the Hijri Badge above. */}
                              <div className="flex items-center gap-1 text-foreground">
                                <span className="text-sm font-semibold">{arabicWeekday(hearing.hearingDate)}</span>
                                <span className="text-sm font-semibold">-</span>
                                <LtrInline className="text-sm font-semibold">
                                  {formatTimeAmPm(hearing.hearingTime)}
                                </LtrInline>
                              </div>
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
                          {/* المحامي المكلف */}
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            <span className="text-sm" data-testid={`cell-attending-lawyer-${hearing.id}`}>
                              <BidiText>{attendingLawyerName}</BidiText>
                            </span>
                          </td>
                          <td className="text-center px-1 py-2 text-xs align-middle overflow-hidden">
                            <div className="flex flex-col items-center gap-1">
                              {getStatusBadge(hearing.status, hearing.cancellationReason)}
                              {hearing.result && (
                                <Badge variant="secondary" className="text-xs">
                                  {HearingResultLabels[hearing.result] || hearing.result}
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
                              {/* "جلسة مُعلَّمة" — same outline-badge shape as the
                                  sibling above, in red, with the REASON in the
                                  title attribute (the cases-page badge idiom).
                                  Rendered for EVERYONE: the flag is a team
                                  alert, so it is never gated on role. */}
                              {hearing.isFlagged && (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-red-500 text-red-600 dark:text-red-400"
                                  data-testid={`badge-flagged-${hearing.id}`}
                                  title={hearing.flagReason || "جلسة مُعلَّمة للانتباه"}
                                >
                                  <Flag className="w-3 h-3 ml-1" />
                                  مُعلَّمة
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
                              {/* "جلسة مُعلَّمة" toggle. Placed in the existing
                                  الإجراءات cell rather than bound to a row
                                  double-click: the <tr> carries no click handler
                                  at all today, so a dblclick would be an
                                  undiscoverable gesture unique to this page,
                                  unavailable on touch (PWA/Capacitor), and
                                  invisible — which cannot satisfy
                                  visibility === authorization. Same
                                  size/variant/Tooltip shape as its 8 siblings. */}
                              {canFlagHearing && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      data-testid={`button-flag-${hearing.id}`}
                                      disabled={flagSubmitting}
                                      onClick={() => handleToggleFlag(hearing)}
                                    >
                                      <Flag
                                        className={`w-4 h-4 ${hearing.isFlagged ? "text-destructive fill-destructive" : ""}`}
                                      />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {hearing.isFlagged ? "إلغاء تعليم الجلسة" : "تعليم الجلسة للانتباه"}
                                  </TooltipContent>
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
                                        onClick={() => openCancelDialog(hearing)}
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
                                        prefillReportForm(hearing);
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
            pageSize={HEARING_PAGE_SIZE}
            onPageSizeChange={handleHearingPageSizeChange}
          />
        </CardContent>
      </Card>

      <HearingResultDialog
        hearing={resultDialogHearing}
        onClose={() => setResultDialogHearing(null)}
      />

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
                onChange={(e) => setEditFormData({ ...editFormData, courtName: e.target.value })}
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


      {/* Hearing details — now the SHARED component (moved out of this file so the
          CASE-details dialog can render the same view in place instead of routing
          the user away). This page injects the four workflow actions, which open
          its own result / report dialogs; the case dialog passes none. */}
      <HearingDetailsDialog
        hearingId={detailHearingId}
        onOpenChange={(open) => !open && setDetailHearingId(null)}
        actions={{
          onRecordResult: (h) => setResultDialogHearing(h),
          onWriteReport: (h) => { prefillReportForm(h); setReportDialogHearing(h); },
          onMarkContactCompleted: handleMarkContactCompleted,
          onCloseHearing: handleCloseHearing,
          busy: submitting,
        }}
      />

      {/* "جلسة مُعلَّمة" — reason capture. Only opens when FLAGGING; unflagging
          is immediate. Mirrors the memo-cancel dialog shape: required reason in
          a Textarea, confirm disabled until it is non-empty. */}
      <Dialog
        open={!!flagDialogHearing}
        onOpenChange={(open) => { if (!open) { setFlagDialogHearing(null); setFlagReasonInput(""); } }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعليم الجلسة للانتباه</DialogTitle>
            <DialogDescription>
              ستظهر الجلسة باللون الأحمر لجميع المستخدمين مع سبب التعليم.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="flag-reason">سبب التعليم <span className="text-destructive">*</span></Label>
            <Textarea
              id="flag-reason"
              data-testid="input-flag-reason"
              value={flagReasonInput}
              onChange={(e) => setFlagReasonInput(e.target.value)}
              placeholder="مثال: مستندات ناقصة — يجب التأكد قبل الجلسة"
              maxLength={500}
              rows={3}
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              data-testid="button-cancel-flag"
              onClick={() => { setFlagDialogHearing(null); setFlagReasonInput(""); }}
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-confirm-flag"
              onClick={handleConfirmFlag}
              disabled={!flagReasonInput.trim() || flagSubmitting}
            >
              {flagSubmitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              تعليم الجلسة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCEL HEARING — confirmation + MANDATORY سبب الإلغاء. A Dialog rather
          than the page's legacy window.confirm (used by delete): a native
          confirm cannot hold a text field, is not RTL-styled, and CLAUDE.md
          discourages browser modals. Same shape as the flag dialog above. */}
      <Dialog
        open={!!cancelDialogHearing}
        onOpenChange={(open) => { if (!open) { setCancelDialogHearing(null); setCancelReasonInput(""); } }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إلغاء الجلسة</DialogTitle>
            <DialogDescription>
              سيتم تعليم الجلسة كملغاة مع حفظ سبب الإلغاء وعرضه في تفاصيل الجلسة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">سبب الإلغاء <span className="text-destructive">*</span></Label>
            <Textarea
              id="cancel-reason"
              data-testid="input-cancel-reason"
              value={cancelReasonInput}
              onChange={(e) => setCancelReasonInput(e.target.value)}
              placeholder="مثال: تأجيل من المحكمة — لم يتم تحديد موعد بديل"
              maxLength={500}
              rows={3}
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              data-testid="button-abort-cancel-hearing"
              onClick={() => { setCancelDialogHearing(null); setCancelReasonInput(""); }}
            >
              تراجع
            </Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-cancel-hearing"
              onClick={handleConfirmCancelHearing}
              disabled={!cancelReasonInput.trim() || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              تأكيد الإلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UNFLAG — plain confirmation, no reason. AlertDialog (the app-wide
          confirm idiom, as used on the cases page) rather than this page's
          legacy window.confirm. */}
      <AlertDialog
        open={!!unflagConfirmHearing}
        onOpenChange={(open) => { if (!open) setUnflagConfirmHearing(null); }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء تعليم الجلسة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إزالة التعليم وسبَبه، ولن تظهر الجلسة باللون الأحمر لبقية الفريق. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel data-testid="button-abort-unflag">تراجع</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-unflag"
              onClick={handleConfirmUnflag}
              disabled={flagSubmitting}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

