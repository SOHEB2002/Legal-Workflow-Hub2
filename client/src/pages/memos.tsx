import { useState, useMemo, useEffect } from "react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ScrollText,
  Plus,
  Search,
  Eye,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  Zap,
  Ban,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { useMemos } from "@/lib/memos-context";
import { useCases } from "@/lib/cases-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { useUsers } from "@/lib/users-context";
import { useClients } from "@/lib/clients-context";
import {
  MemoType,
  MemoTypeLabels,
  MemoStatus,
  MemoStatusLabels,
  Priority,
  canCreateMemos,
  canReviewMemos,
  canChangeMemoStatus,
  canDeleteMemos,
} from "@shared/schema";
import type { Memo, MemoTypeValue, MemoStatusValue } from "@shared/schema";
import { differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { DualDateDisplay } from "@/components/ui/dual-date-display";

function getStatusBadgeClass(status: MemoStatusValue): string {
  switch (status) {
    case MemoStatus.NOT_STARTED:
      return "bg-muted text-muted-foreground";
    case MemoStatus.DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30 dark:text-blue-400";
    case MemoStatus.IN_REVIEW:
      return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30 dark:text-yellow-400";
    case MemoStatus.REVISION_REQUIRED:
      return "bg-orange-500/20 text-orange-600 border-orange-500/30 dark:text-orange-400";
    case MemoStatus.APPROVED:
      return "bg-green-500/20 text-green-600 border-green-500/30 dark:text-green-400";
    case MemoStatus.SUBMITTED:
      return "bg-emerald-500/20 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
    case MemoStatus.CANCELLED:
      return "bg-destructive/20 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getPriorityBadgeClass(priority: string): string {
  switch (priority) {
    case Priority.URGENT:
      return "bg-destructive text-destructive-foreground";
    case Priority.HIGH:
      return "bg-orange-500 text-white dark:bg-orange-600";
    case Priority.MEDIUM:
      return "bg-yellow-500 text-white dark:bg-yellow-600";
    case Priority.LOW:
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getDeadlineColor(deadline: string): string {
  const days = differenceInDays(new Date(deadline), new Date());
  if (days < 0) return "text-destructive font-bold";
  if (days < 3) return "text-orange-500 dark:text-orange-400 font-medium";
  return "text-muted-foreground";
}

export default function MemosPage() {
  const {
    memos,
    isLoading,
    addMemo,
    changeStatus,
    updateMemo,
    deleteMemo,
    getActiveMemos,
    getOverdueMemos,
  } = useMemos();
  const { cases } = useCases();
  const { departments } = useDepartments();
  const { user } = useAuth();
  const { extendedUsers: users, getUserById } = useUsers();
  const { clients } = useClients();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [caseComboOpen, setCaseComboOpen] = useState(false);
  const [detailMemoId, setDetailMemoId] = useState<string | null>(null);
  const detailMemo = detailMemoId ? memos.find(m => m.id === detailMemoId) || null : null;
  const [submitting, setSubmitting] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [reviewNotes, setReviewNotes] = useState("");

  const [formData, setFormData] = useState({
    caseId: "",
    memoType: "" as string,
    memoTypeOther: "",
    title: "",
    description: "",
    priority: "عالي" as string,
    assignedTo: "",
    deadline: "",
    content: "",
  });

  const resetForm = () => {
    setFormData({
      caseId: "",
      memoType: "",
      memoTypeOther: "",
      title: "",
      description: "",
      priority: "عالي",
      assignedTo: "",
      deadline: "",
      content: "",
    });
  };

  const handleAddMemo = async () => {
    if (!user || !formData.caseId || !formData.memoType || !formData.title || !formData.deadline) return;
    setSubmitting(true);
    try {
      await addMemo({
        caseId: formData.caseId,
        memoType: formData.memoType as MemoTypeValue,
        memoTypeOther: formData.memoTypeOther,
        title: formData.title,
        description: formData.description,
        priority: formData.priority as "عاجل" | "عالي" | "متوسط" | "منخفض",
        assignedTo: formData.assignedTo || user.id,
        deadline: formData.deadline,
        content: formData.content,
        fileLink: "",
        createdBy: user.id,
      });
      toast({ title: "تم إضافة المذكرة بنجاح" });
      setIsAddDialogOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (memo: Memo, newStatus: MemoStatusValue, extra?: Partial<Memo>) => {
    setSubmitting(true);
    try {
      await changeStatus(memo.id, newStatus, extra);
      toast({ title: "تم تحديث حالة المذكرة" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!detailMemo || !user) return;
    await handleStatusChange(detailMemo, MemoStatus.APPROVED, {
      reviewNotes,
      reviewerId: user.id,
      reviewedAt: new Date().toISOString(),
    });
    setReviewNotes("");
  };

  const handleReturn = async () => {
    if (!detailMemo || !user) return;
    await handleStatusChange(detailMemo, MemoStatus.REVISION_REQUIRED, {
      reviewNotes,
      reviewerId: user.id,
      reviewedAt: new Date().toISOString(),
      returnCount: (detailMemo.returnCount || 0) + 1,
    });
    setReviewNotes("");
  };

  const handleDelete = async (memo: Memo) => {
    setSubmitting(true);
    try {
      await deleteMemo(memo.id);
      toast({ title: "تم حذف المذكرة" });
      setDetailMemoId(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNoMemoNeeded = async (memo: Memo) => {
    setSubmitting(true);
    try {
      await changeStatus(memo.id, MemoStatus.CANCELLED, {
        reviewNotes: "لا يحتاج مذكرة",
      });
      toast({ title: "تم إنهاء المذكرة - لا يحتاج مذكرة" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const canUserChangeStatus = (memo: Memo): boolean => {
    if (!user) return false;
    if (canChangeMemoStatus(user.role)) return true;
    const relatedCase = cases.find(c => c.id === memo.caseId);
    if (relatedCase && (relatedCase.primaryLawyerId === user.id || relatedCase.responsibleLawyerId === user.id)) return true;
    if (memo.assignedTo === user.id) return true;
    return false;
  };

  const getUserName = (id: string | null): string => {
    if (!id) return "-";
    const u = getUserById(id);
    return u?.name || "-";
  };

  const getCaseNumber = (caseId: string): string => {
    const c = cases.find(cs => cs.id === caseId);
    return c?.caseNumber || caseId;
  };

  const getCaseDetails = (caseId: string) => {
    const c = cases.find(cs => cs.id === caseId);
    if (!c) return { number: caseId, plaintiff: "", client: "", opponent: "", classification: "" };
    return {
      number: c.caseNumber,
      plaintiff: (c as any).plaintiffName || "",
      client: getClientName(c.clientId),
      opponent: c.opponentName || "",
      classification: c.caseClassification || "",
    };
  };

  const getClientName = (clientId: string): string => {
    if (!clientId) return "";
    const client = clients.find((cl: any) => cl.id === clientId);
    if (!client) return "";
    return client.clientType === "شركة" ? (client.companyName || "") : (client.individualName || "");
  };

  const activeMemos = getActiveMemos();
  const overdueMemos = getOverdueMemos();
  const assignableUsers = users.filter(u => u.canBeAssignedCases && u.isActive);

  const filteredMemos = useMemo(() => {
    return memos.filter((m) => {
      const matchesStatus = filterStatus === "all" || m.status === filterStatus;
      const relatedCase = cases.find(c => c.id === m.caseId);
      const matchesDept = filterDept === "all" || (relatedCase && relatedCase.departmentId === filterDept);
      const matchesPriority = filterPriority === "all" || m.priority === filterPriority;
      const matchesSearch = !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesDept && matchesPriority && matchesSearch;
    });
  }, [memos, cases, filterStatus, filterDept, filterPriority, searchQuery]);

  const MEMO_PAGE_SIZE = 15;
  const [memoPage, setMemoPage] = useState(1);
  useEffect(() => { setMemoPage(1); }, [filterStatus, filterDept, filterPriority, searchQuery]);
  const memoTotalPages = Math.max(1, Math.ceil(filteredMemos.length / MEMO_PAGE_SIZE));
  const pagedMemos = filteredMemos.slice((memoPage - 1) * MEMO_PAGE_SIZE, memoPage * MEMO_PAGE_SIZE);

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
        <div className="flex items-center gap-3">
          <ScrollText className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">المذكرات القانونية</h1>
            <p className="text-muted-foreground">إدارة ومتابعة المذكرات القانونية</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" data-testid="badge-total-count">
            الإجمالي: {memos.length}
          </Badge>
          <Badge variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-400" data-testid="badge-active-count">
            نشطة: {activeMemos.length}
          </Badge>
          <Badge variant="outline" className="border-destructive/30 text-destructive" data-testid="badge-overdue-count">
            متأخرة: {overdueMemos.length}
          </Badge>
          {user && canCreateMemos(user.role) && (
            <Button data-testid="button-add-memo" onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة مذكرة
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                placeholder="بحث بالعنوان..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                {Object.entries(MemoStatusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-dept">
                <SelectValue placeholder="القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأقسام</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={String(dept.id)} value={String(dept.id)}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-priority">
                <SelectValue placeholder="الأولوية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="عاجل">عاجل</SelectItem>
                <SelectItem value="عالي">عالي</SelectItem>
                <SelectItem value="متوسط">متوسط</SelectItem>
                <SelectItem value="منخفض">منخفض</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!isLoading && filteredMemos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد مذكرات مطابقة للبحث</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center">العنوان</TableHead>
                    <TableHead className="text-center">العميل</TableHead>
                    <TableHead className="text-center">الخصم</TableHead>
                    <TableHead className="text-center">صفة العميل</TableHead>
                    <TableHead className="text-center">المحامي المكلف</TableHead>
                    <TableHead className="text-center">الموعد النهائي</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">الأولوية</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedMemos
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((memo) => {
                      const caseDetails = getCaseDetails(memo.caseId);
                      return (
                      <TableRow key={memo.id} data-testid={`row-memo-${memo.id}`}>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center text-center w-full">
                            <p className="font-medium text-sm text-center w-full">{memo.title}</p>
                            <Badge variant="outline" className="mt-1">
                              {memo.memoType === "أخرى" ? (memo.memoTypeOther || "أخرى") : MemoTypeLabels[memo.memoType]}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center text-center w-full">
                            {(caseDetails.plaintiff || caseDetails.client) && (
                              <p className="text-sm font-medium text-center">{caseDetails.plaintiff || caseDetails.client}</p>
                            )}
                            {caseDetails.plaintiff && caseDetails.client && (
                              <p className="text-xs text-muted-foreground text-center">{caseDetails.client}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm block text-center">{caseDetails.opponent || "-"}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          {caseDetails.classification && (
                            <Badge variant="outline" className={`text-xs inline-flex justify-center ${
                              caseDetails.classification === "قضية_مقيدة"
                                ? "border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400"
                                : "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400"
                            }`}>
                              {caseDetails.classification === "قضية_مقيدة" ? "قضية مقيدة" : "قضية جديدة"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm">{getUserName(memo.assignedTo)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm ${getDeadlineColor(memo.deadline)}`}>
                            <DualDateDisplay date={memo.deadline} compact />
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={getStatusBadgeClass(memo.status)}>
                            {MemoStatusLabels[memo.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={getPriorityBadgeClass(memo.priority)}>
                            {memo.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-view-memo-${memo.id}`}
                              onClick={() => {
                                setDetailMemoId(memo.id);
                                setReviewNotes("");
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {!["معتمدة", "مرفوعة", "ملغاة"].includes(memo.status) && canUserChangeStatus(memo) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-no-memo-needed-${memo.id}`}
                                onClick={() => handleNoMemoNeeded(memo)}
                                title="لا يحتاج مذكرة"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
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
            currentPage={memoPage}
            totalPages={memoTotalPages}
            onPageChange={setMemoPage}
          />
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة مذكرة جديدة</DialogTitle>
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
                    data-testid="select-memo-case"
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
                          .filter(c => c.status !== "مغلق")
                          .map(c => (
                            <CommandItem
                              key={c.id}
                              value={c.id}
                              onSelect={(val) => {
                                const selected = cases.find(x => x.id === val);
                                const autoLawyer = selected?.primaryLawyerId || selected?.responsibleLawyerId || "";
                                setFormData(prev => ({ ...prev, caseId: val, assignedTo: autoLawyer }));
                                setCaseComboOpen(false);
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
            </div>
            <div>
              <Label>نوع المذكرة *</Label>
              <Select
                value={formData.memoType}
                onValueChange={(value) => setFormData({ ...formData, memoType: value, memoTypeOther: "" })}
              >
                <SelectTrigger data-testid="select-memo-type">
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MemoTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.memoType === "أخرى" && (
                <Input
                  data-testid="input-memo-type-other"
                  value={formData.memoTypeOther}
                  onChange={(e) => setFormData({ ...formData, memoTypeOther: e.target.value })}
                  placeholder="حدد نوع المذكرة"
                  className="mt-2"
                />
              )}
            </div>
            <div>
              <Label>العنوان *</Label>
              <Input
                data-testid="input-memo-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="عنوان المذكرة"
              />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea
                data-testid="input-memo-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف المذكرة..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الأولوية</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger data-testid="select-memo-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="عاجل">عاجل</SelectItem>
                    <SelectItem value="عالي">عالي</SelectItem>
                    <SelectItem value="متوسط">متوسط</SelectItem>
                    <SelectItem value="منخفض">منخفض</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الموعد النهائي *</Label>
                <HijriDatePicker
                  data-testid="input-memo-deadline"
                  value={formData.deadline}
                  onChange={(value) => setFormData({ ...formData, deadline: value })}
                  placeholder="اختر الموعد النهائي"
                />
              </div>
            </div>
            <div>
              <Label>المحامي المكلف</Label>
              <Select
                value={formData.assignedTo}
                onValueChange={(value) => setFormData({ ...formData, assignedTo: value })}
              >
                <SelectTrigger data-testid="select-memo-assigned">
                  <SelectValue placeholder="المحامي المكلف بالقضية (تلقائي)" />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">يتم تعيين المحامي المكلف بالقضية تلقائياً</p>
            </div>
            <div>
              <Label>المحتوى</Label>
              <Textarea
                data-testid="input-memo-content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="محتوى المذكرة..."
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              data-testid="button-submit-memo"
              onClick={handleAddMemo}
              className="w-full"
              disabled={!formData.caseId || !formData.memoType || !formData.title || !formData.deadline || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              إضافة المذكرة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailMemo} onOpenChange={(open) => { if (!open) setDetailMemoId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailMemo && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span>{detailMemo.title}</span>
                  {detailMemo.isAutoGenerated && (
                    <Badge variant="outline" className="border-primary text-primary">
                      <Zap className="w-3 h-3 ml-1" />
                      مذكرة تلقائية
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">النوع</p>
                    <Badge variant="outline" className="mt-1">
                      {detailMemo.memoType === "أخرى" ? (detailMemo.memoTypeOther || "أخرى") : MemoTypeLabels[detailMemo.memoType]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">القضية</p>
                    <p className="font-medium"><LtrInline>{getCaseNumber(detailMemo.caseId)}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">المحامي المكلف</p>
                    <p className="font-medium">{getUserName(detailMemo.assignedTo)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الموعد النهائي</p>
                    <div className={`font-medium ${getDeadlineColor(detailMemo.deadline)}`}>
                      <DualDateDisplay date={detailMemo.deadline} />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الأولوية</p>
                    <Badge className={`mt-1 ${getPriorityBadgeClass(detailMemo.priority)}`}>
                      {detailMemo.priority}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">الحالة</p>
                    <Badge className={`mt-1 ${getStatusBadgeClass(detailMemo.status)}`}>
                      {MemoStatusLabels[detailMemo.status]}
                    </Badge>
                  </div>
                  {detailMemo.returnCount > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">عدد الإرجاع</p>
                      <p className="font-medium text-orange-500">{detailMemo.returnCount}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">أنشئت بواسطة</p>
                    <p className="font-medium">{getUserName(detailMemo.createdBy)}</p>
                  </div>
                </div>

                {detailMemo.description && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">الوصف</p>
                    <p className="text-sm">{detailMemo.description}</p>
                  </div>
                )}

                {detailMemo.content && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">المحتوى</p>
                    <div className="border rounded-md p-3 text-sm whitespace-pre-wrap bg-muted/30">
                      {detailMemo.content}
                    </div>
                  </div>
                )}

                {detailMemo.isAutoGenerated && detailMemo.autoGenerateReason && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">سبب الإنشاء التلقائي</p>
                    <p className="text-sm">{detailMemo.autoGenerateReason}</p>
                  </div>
                )}

                {(detailMemo.status === MemoStatus.IN_REVIEW ||
                  detailMemo.status === MemoStatus.APPROVED ||
                  detailMemo.status === MemoStatus.REVISION_REQUIRED ||
                  detailMemo.status === MemoStatus.SUBMITTED) && (
                  <div className="border rounded-md p-4 space-y-3">
                    <p className="font-medium text-sm">المراجعة</p>
                    {detailMemo.reviewNotes && (
                      <div>
                        <p className="text-sm text-muted-foreground">ملاحظات المراجعة</p>
                        <p className="text-sm mt-1">{detailMemo.reviewNotes}</p>
                      </div>
                    )}
                    {detailMemo.reviewerId && (
                      <div>
                        <p className="text-sm text-muted-foreground">المراجع</p>
                        <p className="text-sm">{getUserName(detailMemo.reviewerId)}</p>
                      </div>
                    )}
                    {detailMemo.status === MemoStatus.IN_REVIEW && user && canReviewMemos(user.role) && (
                      <div className="space-y-3 pt-2 border-t">
                        <div>
                          <Label>ملاحظات المراجعة</Label>
                          <Textarea
                            data-testid="input-review-notes"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="أضف ملاحظاتك..."
                          />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            data-testid="button-approve-memo"
                            variant="default"
                            onClick={handleApprove}
                            disabled={submitting}
                            className="bg-green-600 hover:bg-green-700 dark:bg-green-700"
                          >
                            {submitting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <CheckCircle className="w-4 h-4 ml-2" />}
                            اعتماد
                          </Button>
                          <Button
                            data-testid="button-return-memo"
                            variant="default"
                            onClick={handleReturn}
                            disabled={submitting}
                            className="bg-orange-500 hover:bg-orange-600 dark:bg-orange-600"
                          >
                            {submitting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <XCircle className="w-4 h-4 ml-2" />}
                            إعادة للتعديل
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {detailMemo.status === MemoStatus.NOT_STARTED && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-start-drafting"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.DRAFTING, { startedAt: new Date().toISOString() })}
                      disabled={submitting}
                    >
                      <Clock className="w-4 h-4 ml-2" />
                      بدء التحرير
                    </Button>
                  )}
                  {(detailMemo.status === MemoStatus.DRAFTING || detailMemo.status === MemoStatus.REVISION_REQUIRED) && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-send-review"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.IN_REVIEW, { completedAt: new Date().toISOString() })}
                      disabled={submitting}
                    >
                      <AlertTriangle className="w-4 h-4 ml-2" />
                      إرسال للمراجعة
                    </Button>
                  )}
                  {detailMemo.status === MemoStatus.APPROVED && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-submit-final"
                      onClick={() => handleStatusChange(detailMemo, MemoStatus.SUBMITTED, { submittedAt: new Date().toISOString() })}
                      disabled={submitting}
                      className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700"
                    >
                      <CheckCircle className="w-4 h-4 ml-2" />
                      رفع المذكرة
                    </Button>
                  )}
                  {!["معتمدة", "مرفوعة", "ملغاة"].includes(detailMemo.status) && canUserChangeStatus(detailMemo) && (
                    <Button
                      data-testid="button-no-memo-needed-detail"
                      variant="outline"
                      onClick={() => handleNoMemoNeeded(detailMemo)}
                      disabled={submitting}
                      className="text-muted-foreground hover:text-destructive hover:border-destructive"
                    >
                      <Ban className="w-4 h-4 ml-2" />
                      لا يحتاج مذكرة
                    </Button>
                  )}
                  {user && canDeleteMemos(user.role) && (
                    <Button
                      data-testid="button-delete-memo"
                      variant="destructive"
                      onClick={() => handleDelete(detailMemo)}
                      disabled={submitting}
                    >
                      <Trash2 className="w-4 h-4 ml-2" />
                      حذف
                    </Button>
                  )}
                </div>

                <div className="border rounded-md p-4 space-y-2">
                  <p className="font-medium text-sm mb-3">الجدول الزمني</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      <span className="text-muted-foreground">تاريخ الإنشاء:</span>
                      <DualDateDisplay date={detailMemo.createdAt} showTime />
                    </div>
                    {detailMemo.startedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-muted-foreground">بدء التحرير:</span>
                        <DualDateDisplay date={detailMemo.startedAt} showTime />
                      </div>
                    )}
                    {detailMemo.completedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                        <span className="text-muted-foreground">إرسال للمراجعة:</span>
                        <DualDateDisplay date={detailMemo.completedAt} showTime />
                      </div>
                    )}
                    {detailMemo.reviewedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span className="text-muted-foreground">تاريخ المراجعة:</span>
                        <DualDateDisplay date={detailMemo.reviewedAt} showTime />
                      </div>
                    )}
                    {detailMemo.submittedAt && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-muted-foreground">تاريخ الرفع:</span>
                        <DualDateDisplay date={detailMemo.submittedAt} showTime />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}