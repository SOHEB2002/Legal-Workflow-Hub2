import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, FileSignature, MoreHorizontal, UserPlus, ChevronLeft, ChevronRight,
  XCircle, Trash2, Pause, Play, ClipboardCheck, AlertTriangle, CheckCircle, MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  Contract, ContractStageValue, ContractActivity,
  InternalReviewDecisionValue, CommitteeDecisionValue, NoteOutcomeValue, ContractPriorityValue,
} from "@shared/schema";
import {
  ContractStage, ContractStageLabels, ContractStagesAll, ContractStagesOrder,
  ContractType, ContractTypeLabels,
  ContractPriority, ContractPriorityLabels,
  InternalReviewDecision, CommitteeDecision, NoteOutcome,
} from "@shared/schema";
import { useContracts } from "@/lib/contracts-context";
import { useClients } from "@/lib/clients-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { ContractStagesBar } from "@/components/contract-stages-bar";
import { apiRequest } from "@/lib/queryClient";

// Mirror of consultations.tsx LINEAR_ADVANCE — single 8-stage flow.
const LINEAR_ADVANCE: Partial<Record<ContractStageValue, { target: ContractStageValue; roles: string[] }>> = {
  [ContractStage.RECEIVED]:                    { target: ContractStage.RECEIVED_PENDING_COMPLETION, roles: ["admin_support", "department_head", "branch_manager"] },
  [ContractStage.RECEIVED_PENDING_COMPLETION]: { target: ContractStage.DRAFTING,                    roles: ["admin_support", "department_head", "branch_manager"] },
  [ContractStage.DRAFTING]:                    { target: ContractStage.INTERNAL_REVIEW,             roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ContractStage.READY]:                       { target: ContractStage.CLOSED,                      roles: ["admin_support", "branch_manager"] },
};

function getAdvanceTarget(
  c: Contract,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): ContractStageValue | null {
  if (c.status !== "active") return null;
  if (c.awaitingCompletion) return null;
  const rule = LINEAR_ADVANCE[c.currentStage];
  if (!rule) return null;
  if (userRole === "department_head" && c.departmentId !== userDeptId) return null;
  const isAssigned = !!c.assignedTo && c.assignedTo === userId;
  const effectiveRoles = isAssigned ? [userRole, "assigned_lawyer"] : [userRole];
  if (!effectiveRoles.some((r) => rule.roles.includes(r))) return null;
  return rule.target;
}

function getReturnTargets(
  c: Contract,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): ContractStageValue[] {
  if (c.status !== "active") return [];
  if (c.awaitingCompletion) return [];
  if (userRole === "department_head" && c.departmentId !== userDeptId) return [];
  const stages =
    c.currentStage === ContractStage.TAKING_NOTES ? ContractStagesAll : ContractStagesOrder;
  const idx = stages.indexOf(c.currentStage);
  if (idx <= 0) return [];
  const isHeadOrManager = userRole === "department_head" || userRole === "branch_manager";
  if (isHeadOrManager) return [...stages.slice(0, idx)];
  const isAssigned = !!c.assignedTo && c.assignedTo === userId;
  if (isAssigned) return [stages[idx - 1]];
  return [];
}

function canChangeContractType(
  c: Contract,
  userRole: string,
  userDeptId: string | null,
): boolean {
  if (userRole === "branch_manager" || userRole === "admin_support") return true;
  if (userRole === "department_head" && c.departmentId === userDeptId) return true;
  return false;
}

function canPause(c: Contract, user: { id: string; role: string; departmentId: string | null } | null): boolean {
  if (!user) return false;
  if (user.role === "branch_manager" || user.role === "admin_support") return true;
  if (user.role === "department_head" && c.departmentId === user.departmentId) return true;
  return c.assignedTo === user.id;
}

function canDoInternalReview(c: Contract, user: { id: string; role: string; departmentId: string | null } | null): boolean {
  if (!user) return false;
  if (c.status !== "active") return false;
  if (c.currentStage !== ContractStage.INTERNAL_REVIEW) return false;
  if (user.role === "department_head" && c.departmentId !== user.departmentId) return false;
  if (["department_head", "branch_manager"].includes(user.role)) return true;
  return c.internalReviewerId === user.id;
}

function canDoCommitteeDecision(c: Contract, userRole: string): boolean {
  if (c.status !== "active") return false;
  if (c.currentStage !== ContractStage.COMMITTEE) return false;
  return userRole === "consultations_review_head" || userRole === "branch_manager";
}

function canDoTakeNotes(c: Contract, user: { id: string; role: string; departmentId: string | null } | null): boolean {
  if (!user) return false;
  if (c.status !== "active") return false;
  if (c.currentStage !== ContractStage.TAKING_NOTES) return false;
  if (user.role === "department_head" && c.departmentId !== user.departmentId) return false;
  if (["department_head", "branch_manager"].includes(user.role)) return true;
  return !!c.assignedTo && c.assignedTo === user.id;
}

function getStageBadgeColor(stage: ContractStageValue): string {
  switch (stage) {
    case ContractStage.RECEIVED:
      return "bg-primary/20 text-primary border-primary/30";
    case ContractStage.DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case ContractStage.INTERNAL_REVIEW:
      return "bg-indigo-500/20 text-indigo-600 border-indigo-500/30";
    case ContractStage.COMMITTEE:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case ContractStage.TAKING_NOTES:
      return "bg-destructive/20 text-destructive border-destructive/30";
    case ContractStage.READY:
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case ContractStage.CLOSED:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function extractApiError(err: unknown): string {
  const msg = (err as any)?.message || "";
  const match = msg.match(/^\d+: (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.error) return parsed.error;
    } catch {}
  }
  return msg || "حدث خطأ غير متوقع";
}

function formatActivityTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `اليوم ${hh}:${mm}`;
  if (isYesterday) return `أمس ${hh}:${mm}`;
  return `${d.toISOString().slice(0, 10)} ${hh}:${mm}`;
}

export default function ContractsPage() {
  const {
    contracts, addContract, updateContract, deleteContract,
    assignContract, advanceStage, returnStage,
    submitInternalReview, submitCommitteeDecision, recordTakeNotesOutcome,
    earlyCloseContract, pauseContract, unpauseContract,
    awaitCompletion, resumeFromCompletion, skipCompletion,
    refreshContracts,
  } = useContracts();
  const { clients, getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, users } = useAuth();
  const { toast } = useToast();

  const lawyers = users.filter((u) => u.canBeAssignedConsultations);
  const getLawyerName = (id: string | null | undefined): string => {
    if (!id) return "—";
    return users.find((u) => u.id === id)?.name || "—";
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredContracts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return contracts.filter((c) => {
      if (q) {
        const hay = [c.contractNumber, c.title, c.description, getClientName(c.clientId)]
          .map((s) => (s || "").toLowerCase());
        if (!hay.some((h) => h.includes(q))) return false;
      }
      if (stageFilter !== "all" && c.currentStage !== stageFilter) return false;
      if (typeFilter !== "all" && c.contractType !== typeFilter) return false;
      return true;
    });
  }, [contracts, searchTerm, stageFilter, typeFilter, getClientName]);

  const sortedContracts = useMemo(
    () => [...filteredContracts].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filteredContracts],
  );

  // ---- Create dialog ----
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    clientId: "",
    contractType: ContractType.REVIEW as string,
    departmentId: "",
    description: "",
  });
  const resetForm = () => setFormData({
    title: "", clientId: "", contractType: ContractType.REVIEW, departmentId: "", description: "",
  });

  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.clientId || !formData.departmentId) return;
    try {
      await addContract(formData);
      toast({ title: "تم إنشاء العقد بنجاح" });
      setIsAddOpen(false);
      resetForm();
    } catch (err) {
      toast({ title: "فشل إنشاء العقد", description: extractApiError(err), variant: "destructive" });
    }
  };

  // ---- Details dialog state ----
  const [selected, setSelected] = useState<Contract | null>(null);
  useEffect(() => {
    if (!selected) return;
    const fresh = contracts.find((c) => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [contracts, selected]);

  // Activity log
  const [activities, setActivities] = useState<ContractActivity[]>([]);
  const fetchActivities = async (id: string) => {
    try {
      const res = await apiRequest("GET", `/api/contracts/${id}/activities`);
      const data = await res.json();
      setActivities(data);
    } catch {
      setActivities([]);
    }
  };
  useEffect(() => {
    if (!selected) { setActivities([]); return; }
    fetchActivities(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updatedAt]);

  // ---- Action dialogs ----
  const [showAssign, setShowAssign] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Contract | null>(null);
  const [assignLawyerId, setAssignLawyerId] = useState("");

  const [showReturn, setShowReturn] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Contract | null>(null);
  const [returnStageValue, setReturnStageValue] = useState<string>("");

  const [showInternalReview, setShowInternalReview] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Contract | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const [showCommittee, setShowCommittee] = useState(false);
  const [committeeTarget, setCommitteeTarget] = useState<Contract | null>(null);
  const [committeeNotes, setCommitteeNotes] = useState("");

  const [showTakeNotes, setShowTakeNotes] = useState(false);
  const [takeNotesTarget, setTakeNotesTarget] = useState<Contract | null>(null);
  const [takeNotesNotes, setTakeNotesNotes] = useState("");

  const [showEarlyClose, setShowEarlyClose] = useState(false);
  const [earlyCloseTarget, setEarlyCloseTarget] = useState<Contract | null>(null);
  const [earlyCloseReason, setEarlyCloseReason] = useState("");

  const [showPause, setShowPause] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<Contract | null>(null);
  const [pauseReason, setPauseReason] = useState("");

  const [showAwait, setShowAwait] = useState(false);
  const [awaitTarget, setAwaitTarget] = useState<Contract | null>(null);
  const [awaitReason, setAwaitReason] = useState("");

  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);

  const [busy, setBusy] = useState(false);
  const wrap = async (fn: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      await refreshContracts();
      toast({ title: successMsg });
    } catch (err) {
      toast({ title: "فشل الإجراء", description: extractApiError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ---- Committee referral inline updaters ----
  const [priorityReasonDraft, setPriorityReasonDraft] = useState("");
  useEffect(() => {
    setPriorityReasonDraft(selected?.priorityReason ?? "");
  }, [selected?.id, selected?.priorityReason]);

  const updateContractField = async (
    contract: Contract,
    patch: Partial<Pick<Contract, "priority" | "priorityReason" | "internalReviewerId" | "contractType">>,
  ) => {
    try {
      await updateContract(contract.id, patch);
      await refreshContracts();
    } catch (err) {
      toast({ title: "فشل حفظ التعديل", description: extractApiError(err), variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">العقود والمشاريع</h1>
          <p className="text-muted-foreground">إدارة عقود المراجعة والصياغة والمشاريع</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-contract" onClick={resetForm}>
              <Plus className="w-4 h-4 ml-2" />
              عقد جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>إضافة عقد جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>العنوان</Label>
                <Input
                  data-testid="input-contract-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="مثال: مراجعة عقد توريد للعميل ..."
                />
              </div>
              <div>
                <Label>العميل</Label>
                <ClientAutocomplete
                  value={formData.clientId}
                  onChange={(clientId) => setFormData({ ...formData, clientId })}
                />
              </div>
              <div>
                <Label>نوع العقد</Label>
                <Select
                  value={formData.contractType}
                  onValueChange={(value) => setFormData({ ...formData, contractType: value })}
                >
                  <SelectTrigger data-testid="select-contract-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.values(ContractType) as string[]).map((t) => (
                      <SelectItem key={t} value={t} data-testid={`option-contract-type-${t}`}>
                        {ContractTypeLabels[t as keyof typeof ContractTypeLabels] || t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القسم</Label>
                <Select
                  value={formData.departmentId}
                  onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                >
                  <SelectTrigger data-testid="select-contract-department">
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>طلب العميل</Label>
                <Textarea
                  data-testid="input-contract-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="اكتب وصف الطلب..."
                  rows={4}
                />
              </div>
            </div>
            <Button
              data-testid="button-submit-contract"
              onClick={handleAdd}
              className="w-full"
              disabled={!formData.title.trim() || !formData.clientId || !formData.departmentId}
            >
              إضافة العقد
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">بحث</Label>
              <Input
                data-testid="input-contracts-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث برقم العقد، العنوان، العميل..."
              />
            </div>
            <div className="min-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">النوع</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="filter-contract-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {(Object.values(ContractType) as string[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ContractTypeLabels[t as keyof typeof ContractTypeLabels] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">المرحلة</Label>
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger data-testid="filter-contract-stage"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المراحل</SelectItem>
                  {ContractStagesAll.map((s) => (
                    <SelectItem key={s} value={s}>{ContractStageLabels[s] || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">رقم العقد</TableHead>
                <TableHead className="text-center">العنوان</TableHead>
                <TableHead className="text-center">العميل</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">المرحلة</TableHead>
                <TableHead className="text-center">القسم</TableHead>
                <TableHead className="text-center">المحامي</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedContracts.map((c) => (
                <TableRow key={c.id} data-testid={`row-contract-${c.id}`}>
                  <TableCell className="text-center font-medium">
                    <LtrInline>{c.contractNumber}</LtrInline>
                  </TableCell>
                  <TableCell className="text-center"><BidiText>{c.title}</BidiText></TableCell>
                  <TableCell className="text-center">
                    <BidiText>{getClientName(c.clientId)}</BidiText>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">
                      {ContractTypeLabels[c.contractType as keyof typeof ContractTypeLabels] || c.contractType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={getStageBadgeColor(c.currentStage)}>
                      {ContractStageLabels[c.currentStage] || c.currentStage}
                    </Badge>
                    {c.status === "paused" && (
                      <Badge variant="outline" className="mr-1 border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0">
                        <Pause className="w-2.5 h-2.5 ml-1" /> معلّق
                      </Badge>
                    )}
                    {c.awaitingCompletion && c.status === "active" && (
                      <Badge variant="outline" className="mr-1 border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0">
                        <AlertTriangle className="w-2.5 h-2.5 ml-1" /> بانتظار
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{getDepartmentName(c.departmentId)}</TableCell>
                  <TableCell className="text-center">
                    <BidiText>{getLawyerName(c.assignedTo)}</BidiText>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-view-contract-${c.id}`}
                        onClick={() => setSelected(c)}
                      >
                        <FileSignature className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-actions-${c.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {c.status === "active" && c.currentStage === ContractStage.RECEIVED && (
                            <DropdownMenuItem onClick={() => { setAssignTarget(c); setAssignLawyerId(c.assignedTo || ""); setShowAssign(true); }}>
                              <UserPlus className="w-4 h-4 ml-2" />
                              إسناد
                            </DropdownMenuItem>
                          )}
                          {canPause(c, user) && c.status === "active" && (
                            <DropdownMenuItem onClick={() => { setPauseTarget(c); setPauseReason(""); setShowPause(true); }}>
                              <Pause className="w-4 h-4 ml-2" />
                              تعليق
                            </DropdownMenuItem>
                          )}
                          {canPause(c, user) && c.status === "paused" && (
                            <DropdownMenuItem onClick={() => wrap(() => unpauseContract(c.id), "تم إلغاء التعليق")}>
                              <Play className="w-4 h-4 ml-2" />
                              إلغاء التعليق
                            </DropdownMenuItem>
                          )}
                          {user && user.role === "branch_manager" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => { setDeleteTarget(c); setShowDelete(true); }}
                              >
                                <Trash2 className="w-4 h-4 ml-2" />
                                حذف
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sortedContracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    لا توجد عقود مطابقة
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ============ Details dialog ============ */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>تفاصيل العقد</span>
              {selected && <LtrInline>{selected.contractNumber}</LtrInline>}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <ContractStagesBar currentStage={selected.currentStage} />

              {/* Action row */}
              <div className="flex flex-wrap gap-2 justify-end">
                {(() => {
                  const target = user ? getAdvanceTarget(selected, user.role, user.id, user.departmentId) : null;
                  return target ? (
                    <Button
                      size="sm"
                      onClick={() => wrap(() => advanceStage(selected.id, target), `انتقل إلى ${ContractStageLabels[target] || target}`)}
                      disabled={busy}
                      data-testid="dialog-advance"
                    >
                      <ChevronLeft className="w-4 h-4 ml-1" />
                      المرحلة التالية
                    </Button>
                  ) : null;
                })()}
                {user && getReturnTargets(selected, user.role, user.id, user.departmentId).length > 0 && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { setReturnTarget(selected); setReturnStageValue(""); setShowReturn(true); }}
                    data-testid="dialog-return"
                  >
                    <ChevronRight className="w-4 h-4 ml-1" />
                    إرجاع
                  </Button>
                )}
                {selected.status === "active"
                  && selected.currentStage === ContractStage.RECEIVED_PENDING_COMPLETION
                  && !selected.awaitingCompletion
                  && canPause(selected, user) && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => wrap(() => skipCompletion(selected.id), "تم تجاوز مرحلة الاستكمال")}
                    disabled={busy}
                  >
                    تجاوز
                  </Button>
                )}
                {canDoInternalReview(selected, user) && (
                  <Button size="sm" variant="outline"
                    onClick={() => { setReviewTarget(selected); setReviewNotes(""); setShowInternalReview(true); }}>
                    <ClipboardCheck className="w-4 h-4 ml-1" />
                    مراجعة داخلية
                  </Button>
                )}
                {user && canDoCommitteeDecision(selected, user.role) && (
                  <Button size="sm" variant="outline"
                    onClick={() => { setCommitteeTarget(selected); setCommitteeNotes(""); setShowCommittee(true); }}>
                    <CheckCircle className="w-4 h-4 ml-1" />
                    قرار اللجنة
                  </Button>
                )}
                {canDoTakeNotes(selected, user) && (
                  <Button size="sm" variant="outline"
                    onClick={() => { setTakeNotesTarget(selected); setTakeNotesNotes(""); setShowTakeNotes(true); }}>
                    نتيجة الأخذ بالملاحظات
                  </Button>
                )}
                {selected.status === "active" && (
                  <Button size="sm" variant="destructive"
                    onClick={() => { setEarlyCloseTarget(selected); setEarlyCloseReason(""); setShowEarlyClose(true); }}>
                    <XCircle className="w-4 h-4 ml-1" />
                    إغلاق مبكر
                  </Button>
                )}
                {selected.status === "active" && !selected.awaitingCompletion && canPause(selected, user) && (
                  <Button size="sm" variant="outline"
                    onClick={() => { setAwaitTarget(selected); setAwaitReason(""); setShowAwait(true); }}>
                    بانتظار استكمال
                  </Button>
                )}
                {selected.awaitingCompletion && canPause(selected, user) && (
                  <Button size="sm" variant="outline"
                    onClick={() => wrap(() => resumeFromCompletion(selected.id), "تم العودة من الاستكمال")}>
                    تم الاستكمال
                  </Button>
                )}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 text-right">
                <div>
                  <Label className="text-muted-foreground">العنوان</Label>
                  <p className="font-medium"><BidiText>{selected.title}</BidiText></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">العميل</Label>
                  <p className="font-medium"><BidiText>{getClientName(selected.clientId)}</BidiText></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">النوع</Label>
                  {user && canChangeContractType(selected, user.role, user.departmentId) ? (
                    <Select
                      value={selected.contractType}
                      onValueChange={(v) => updateContractField(selected, { contractType: v })}
                    >
                      <SelectTrigger className="mt-1" data-testid="dialog-contract-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.values(ContractType) as string[]).map((t) => (
                          <SelectItem key={t} value={t}>
                            {ContractTypeLabels[t as keyof typeof ContractTypeLabels] || t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p>{ContractTypeLabels[selected.contractType as keyof typeof ContractTypeLabels] || selected.contractType}</p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">القسم</Label>
                  <p>{getDepartmentName(selected.departmentId)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">المحامي المسؤول</Label>
                  <p className="font-medium"><BidiText>{getLawyerName(selected.assignedTo)}</BidiText></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">تاريخ الإنشاء</Label>
                  <p><LtrInline>{selected.createdAt.slice(0, 10)}</LtrInline></p>
                </div>
              </div>

              <div className="text-right">
                <Label className="text-muted-foreground">طلب العميل</Label>
                <p className="p-3 bg-muted rounded-md whitespace-pre-wrap">{selected.description || "—"}</p>
              </div>

              {/* Committee referral card — gated on stage = COMMITTEE */}
              {selected.currentStage === ContractStage.COMMITTEE && (
                <div className="text-right border rounded-lg p-4 bg-secondary/10 space-y-3" data-testid="committee-referral-card">
                  <h4 className="font-semibold flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" />
                    نموذج الإحالة للجنة المراجعة
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-muted-foreground text-xs">المحرر</Label>
                      <p className="font-medium"><BidiText>{getLawyerName(selected.assignedTo)}</BidiText></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">المراجع</Label>
                      {user && (
                        user.role === "branch_manager"
                        || user.role === "admin_support"
                        || (user.role === "department_head" && selected.departmentId === user.departmentId)
                      ) ? (
                        <Select
                          value={selected.internalReviewerId || "none"}
                          onValueChange={(v) => updateContractField(selected, { internalReviewerId: v === "none" ? null : v })}
                        >
                          <SelectTrigger className="mt-1" data-testid="committee-reviewer-select">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {lawyers.map((l) => (
                              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="font-medium"><BidiText>{getLawyerName(selected.internalReviewerId)}</BidiText></p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">مركز العميل</Label>
                      <p className="font-medium"><BidiText>{getClientName(selected.clientId)}</BidiText></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">تاريخ دخول للقسم</Label>
                      <p><LtrInline>{selected.createdAt.slice(0, 10)}</LtrInline></p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground text-xs">طلب العميل</Label>
                      <p className="p-2 bg-background/60 rounded whitespace-pre-wrap">{selected.description || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground text-xs">الأولوية</Label>
                      <Select
                        value={selected.priority || "none"}
                        onValueChange={(v) =>
                          updateContractField(selected, {
                            priority: v === "none" ? null : v,
                            ...(v === "none" ? { priorityReason: null } : {}),
                          })
                        }
                      >
                        <SelectTrigger className="mt-1" data-testid="committee-priority-select">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {(Object.values(ContractPriority) as ContractPriorityValue[]).map((p) => (
                            <SelectItem key={p} value={p}>{ContractPriorityLabels[p]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selected.priority && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground text-xs">سبب الأولوية</Label>
                        <Textarea
                          data-testid="committee-priority-reason"
                          value={priorityReasonDraft}
                          onChange={(e) => setPriorityReasonDraft(e.target.value)}
                          onBlur={() => {
                            const next = priorityReasonDraft.trim();
                            const cur = selected.priorityReason ?? "";
                            if (next === cur) return;
                            updateContractField(selected, { priorityReason: next || null });
                          }}
                          placeholder="اختياري — اشرح سبب اختيار هذه الأولوية..."
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Activity log */}
              <div className="text-right border rounded-lg p-3 bg-muted/20">
                <h4 className="text-sm font-medium mb-2">سجل النشاط ({activities.length})</h4>
                <ul className="space-y-2">
                  {activities.length === 0 && (
                    <li className="text-xs text-muted-foreground py-2">لا يوجد نشاط بعد</li>
                  )}
                  {activities.map((a) => (
                    <li key={a.id} className="border-r-2 border-primary/40 pr-3 py-1">
                      <div className="text-sm font-medium break-words">
                        <BidiText>{a.description}</BidiText>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        بواسطة <BidiText>{getLawyerName(a.performedBy)}</BidiText>
                        {" • "}
                        <LtrInline>{formatActivityTime(a.performedAt)}</LtrInline>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ Assign dialog ============ */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إسناد العقد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>المحامي</Label>
            <Select value={assignLawyerId} onValueChange={setAssignLawyerId}>
              <SelectTrigger><SelectValue placeholder="اختر المحامي" /></SelectTrigger>
              <SelectContent>
                {lawyers.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>إلغاء</Button>
            <Button
              onClick={async () => {
                if (!assignTarget || !assignLawyerId) return;
                await wrap(() => assignContract(assignTarget.id, assignLawyerId), "تم إسناد العقد");
                setShowAssign(false);
              }}
              disabled={!assignLawyerId || busy}
            >تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Return dialog ============ */}
      <Dialog open={showReturn} onOpenChange={setShowReturn}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إرجاع العقد لمرحلة سابقة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>المرحلة المستهدفة</Label>
            <Select value={returnStageValue} onValueChange={setReturnStageValue}>
              <SelectTrigger><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
              <SelectContent>
                {returnTarget && user
                  && getReturnTargets(returnTarget, user.role, user.id, user.departmentId).map((s) => (
                    <SelectItem key={s} value={s}>{ContractStageLabels[s] || s}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturn(false)}>إلغاء</Button>
            <Button
              onClick={async () => {
                if (!returnTarget || !returnStageValue) return;
                await wrap(() => returnStage(returnTarget.id, returnStageValue as ContractStageValue), "تم إرجاع العقد");
                setShowReturn(false);
              }}
              disabled={!returnStageValue || busy}
            >تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Internal review dialog ============ */}
      <Dialog open={showInternalReview} onOpenChange={setShowInternalReview}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>المراجعة الداخلية</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>الملاحظات (اختياري)</Label>
            <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowInternalReview(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!reviewTarget) return;
                await wrap(() => submitInternalReview(reviewTarget.id, InternalReviewDecision.NEEDS_NOTES, reviewNotes), "أُعيد للتعديل");
                setShowInternalReview(false);
              }}
              disabled={busy}
            >يوجد ملاحظات</Button>
            <Button
              onClick={async () => {
                if (!reviewTarget) return;
                await wrap(() => submitInternalReview(reviewTarget.id, InternalReviewDecision.PASSED, reviewNotes), "تم الاعتماد للجنة");
                setShowInternalReview(false);
              }}
              disabled={busy}
            >اعتماد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Committee decision dialog ============ */}
      <Dialog open={showCommittee} onOpenChange={setShowCommittee}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>قرار اللجنة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>الملاحظات (اختياري)</Label>
            <Textarea value={committeeNotes} onChange={(e) => setCommitteeNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCommittee(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!committeeTarget) return;
                await wrap(() => submitCommitteeDecision(committeeTarget.id, CommitteeDecision.NEEDS_NOTES, committeeNotes), "أُعيد للملاحظات");
                setShowCommittee(false);
              }}
              disabled={busy}
            >يوجد ملاحظات</Button>
            <Button
              onClick={async () => {
                if (!committeeTarget) return;
                await wrap(() => submitCommitteeDecision(committeeTarget.id, CommitteeDecision.APPROVED, committeeNotes), "اعتماد اللجنة");
                setShowCommittee(false);
              }}
              disabled={busy}
            >اعتماد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Take-notes outcome dialog ============ */}
      <Dialog open={showTakeNotes} onOpenChange={setShowTakeNotes}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>نتيجة الأخذ بالملاحظات</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>الملاحظات</Label>
            <Textarea value={takeNotesNotes} onChange={(e) => setTakeNotesNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowTakeNotes(false)}>إلغاء</Button>
            <Button
              onClick={async () => {
                if (!takeNotesTarget) return;
                await wrap(() => recordTakeNotesOutcome(takeNotesTarget.id, NoteOutcome.PARTIAL, takeNotesNotes), "تم تسجيل النتيجة");
                setShowTakeNotes(false);
              }}
              disabled={busy}
            >جزئياً</Button>
            <Button
              onClick={async () => {
                if (!takeNotesTarget) return;
                await wrap(() => recordTakeNotesOutcome(takeNotesTarget.id, NoteOutcome.NOT_DONE, takeNotesNotes), "تم تسجيل النتيجة");
                setShowTakeNotes(false);
              }}
              disabled={busy}
            >لم يتم</Button>
            <Button
              onClick={async () => {
                if (!takeNotesTarget) return;
                await wrap(() => recordTakeNotesOutcome(takeNotesTarget.id, NoteOutcome.DONE, takeNotesNotes), "تم تسجيل النتيجة");
                setShowTakeNotes(false);
              }}
              disabled={busy}
            >تم</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Pause dialog ============ */}
      <Dialog open={showPause} onOpenChange={setShowPause}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تعليق العقد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>السبب</Label>
            <Textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPause(false)}>إلغاء</Button>
            <Button
              onClick={async () => {
                if (!pauseTarget || !pauseReason.trim()) return;
                await wrap(() => pauseContract(pauseTarget.id, pauseReason.trim()), "تم تعليق العقد");
                setShowPause(false);
              }}
              disabled={!pauseReason.trim() || busy}
            >تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Await-completion dialog ============ */}
      <Dialog open={showAwait} onOpenChange={setShowAwait}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>بانتظار استكمال البيانات والمرفقات</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>السبب</Label>
            <Textarea value={awaitReason} onChange={(e) => setAwaitReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAwait(false)}>إلغاء</Button>
            <Button
              onClick={async () => {
                if (!awaitTarget || !awaitReason.trim()) return;
                await wrap(() => awaitCompletion(awaitTarget.id, awaitReason.trim()), "تم تسجيل الانتظار");
                setShowAwait(false);
              }}
              disabled={!awaitReason.trim() || busy}
            >تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Early-close dialog ============ */}
      <Dialog open={showEarlyClose} onOpenChange={setShowEarlyClose}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إغلاق مبكر</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>سبب الإغلاق</Label>
            <Textarea value={earlyCloseReason} onChange={(e) => setEarlyCloseReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEarlyClose(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!earlyCloseTarget || !earlyCloseReason.trim()) return;
                await wrap(() => earlyCloseContract(earlyCloseTarget.id, earlyCloseReason.trim()), "تم الإغلاق المبكر");
                setShowEarlyClose(false);
              }}
              disabled={!earlyCloseReason.trim() || busy}
            >تأكيد الإغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Delete confirmation ============ */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العقد</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء — سيتم حذف العقد نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                await wrap(() => deleteContract(deleteTarget.id), "تم حذف العقد");
                setShowDelete(false);
              }}
            >حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
