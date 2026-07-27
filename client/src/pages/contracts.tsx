import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePageSize } from "@/hooks/use-page-size";
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
  XCircle, Trash2, Pause, Play, ClipboardCheck, AlertTriangle, CheckCircle, 
  Upload, Download, FileIcon, Paperclip, Eye, RotateCw, Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type {
  Contract, ContractStageValue, ContractActivity, ContractAttachment, ContractTypeValue,
  ContractPriorityValue,
} from "@shared/schema";
import {
  ContractStage, ContractStageLabels, ContractStagesAll, ContractStagesOrder,
  ContractType, ContractTypeLabels,
  ContractPriority, ContractPriorityLabels,
  ContractAttachmentSlot, ContractSlotsByType,
  InternalReviewDecision, CommitteeDecision, NoteOutcome,
  ContractActivityType, isContractInFollowUpCycle, getStagesForContractCycle,
} from "@shared/schema";
import { useContracts } from "@/lib/contracts-context";
import { useClients } from "@/lib/clients-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { ContractStagesBar } from "@/components/contract-stages-bar";
import { apiRequest, refreshAuthToken } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";

// FE mirror of ALLOWED_CONTRACT_TRANSITIONS for the linear-forward
// path. INTERNAL_REVIEW / COMMITTEE / TAKING_NOTES exits are handled
// by dedicated dialogs (canDoInternalReview / canDoCommitteeDecision
// / canDoTakeNotes) and intentionally absent from this table — the
// generic "next stage" button doesn't fire on those stages.
const LINEAR_ADVANCE: Partial<Record<ContractStageValue, { target: ContractStageValue; roles: string[] }>> = {
  [ContractStage.RECEIVED]:                    { target: ContractStage.RECEIVED_PENDING_COMPLETION, roles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  [ContractStage.RECEIVED_PENDING_COMPLETION]: { target: ContractStage.DRAFTING,                    roles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  [ContractStage.DRAFTING]:                    { target: ContractStage.INTERNAL_REVIEW,             roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ContractStage.READY]:                       { target: ContractStage.CLOSED,                      roles: ["admin_support", "branch_manager"] },
};

// Cycle linear-advance table — mirrors ALLOWED_CONTRACT_CYCLE_TRANSITIONS on
// the server, exactly as LINEAR_ADVANCE_CYCLE_WRITTEN mirrors its server table
// on the consultations page. 2 forward steps: RECEIVED → READY (answer the
// follow-up question) → CLOSED (re-close). No تحرير / مراجعة / لجنة edges — a
// follow-up must not re-run the full flow.
const LINEAR_ADVANCE_CYCLE: Partial<Record<ContractStageValue, { target: ContractStageValue; roles: string[] }>> = {
  [ContractStage.RECEIVED]: { target: ContractStage.READY,  roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ContractStage.READY]:    { target: ContractStage.CLOSED, roles: ["admin_support", "branch_manager"] },
};

// Mirror of getLinearAdvanceTable on the consultations page. Contracts have a
// single type-agnostic flow, so the only axis is in-cycle vs not.
function getLinearAdvanceTable(
  c: { followUpCount?: number | null; status?: string | null },
): Partial<Record<ContractStageValue, { target: ContractStageValue; roles: string[] }>> {
  return isContractInFollowUpCycle(c) ? LINEAR_ADVANCE_CYCLE : LINEAR_ADVANCE;
}

function getAdvanceTarget(
  c: Contract,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): ContractStageValue | null {
  if (c.status !== "active") return null;
  if (c.awaitingCompletion) return null;
  const rule = getLinearAdvanceTable(c)[c.currentStage];
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
  // Cycle-aware, mirroring getReturnTargets on the consultations page: inside
  // a follow-up cycle the rollback list is the 3-stage cycle, not the full path.
  const stages: readonly ContractStageValue[] = isContractInFollowUpCycle(c)
    ? getStagesForContractCycle(c)
    : c.currentStage === ContractStage.TAKING_NOTES ? ContractStagesAll : ContractStagesOrder;
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

// Per spec: only branch_manager / admin_support / department_head
// can create new contracts. Employees / lawyers / committee chairs
// must NOT see the create button. Server enforces the same gate.
function canCreateContract(userRole: string | null | undefined): boolean {
  if (!userRole) return false;
  return userRole === "branch_manager"
    || userRole === "admin_support"
    || userRole === "department_head";
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

// Reasoned override — "تجاوز لجنة المراجعة". Gate for the button that calls
// POST /api/contracts/:id/skip-committee. Mirrors the SERVER's rule EXACTLY so
// visibility === authorization (no button that 403s):
//   status active, not paused / awaiting-completion, stage === لجنة_مراجعة,
//   AND branch_manager | department_head of the contract's own dept | the
//   assigned lawyer.
// Contracts have a SINGLE stage flow (no phone/procedural analogue), so — unlike
// consultations — there is NO type guard; the currentStage check is sufficient.
// The actor set is intentionally WIDER than canDoCommitteeDecision
// (consultations_review_head / branch_manager) — a skip is an owner-approved
// override, not a committee ruling. Entity 4 of 4; mirrors cases/memos/consultations.
function canSkipCommittee(
  c: Contract,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (c.status !== "active") return false;
  if (c.pausedAt || c.awaitingCompletion) return false;
  if (c.currentStage !== ContractStage.COMMITTEE) return false;
  if (userRole === "branch_manager") return true;
  if (userRole === "department_head") return c.departmentId === userDeptId;
  return !!c.assignedTo && c.assignedTo === userId;
}

function canDoTakeNotes(c: Contract, user: { id: string; role: string; departmentId: string | null } | null): boolean {
  if (!user) return false;
  if (c.status !== "active") return false;
  if (c.currentStage !== ContractStage.TAKING_NOTES) return false;
  if (user.role === "department_head" && c.departmentId !== user.departmentId) return false;
  if (["department_head", "branch_manager"].includes(user.role)) return true;
  return !!c.assignedTo && c.assignedTo === user.id;
}

// Priority-group sort, mirroring the cases / consultations pages so the
// four tables read consistently.
//   1 = unassigned (no assigned lawyer)
//   2 = action required from us (drafting / reviewing / awaiting closure)
//   3 = waiting on external (paused or awaiting-completion)
//   4 = terminated (status === 'closed' or currentStage === CLOSED)
// Within each group: stage-order ASC, then updatedAt DESC.
const ACTION_REQUIRED_CONTRACT_STAGES = new Set<ContractStageValue>([
  ContractStage.RECEIVED,
  ContractStage.RECEIVED_PENDING_COMPLETION,
  ContractStage.DRAFTING,
  ContractStage.INTERNAL_REVIEW,
  ContractStage.COMMITTEE,
  ContractStage.TAKING_NOTES,
  ContractStage.READY,
]);

function getContractPriorityGroup(c: Contract): 1 | 2 | 3 | 4 {
  if (c.status === "closed" || c.currentStage === ContractStage.CLOSED) return 4;
  if (!c.assignedTo) return 1;
  if (c.status === "paused" || c.pausedAt || c.awaitingCompletion) return 3;
  if (ACTION_REQUIRED_CONTRACT_STAGES.has(c.currentStage)) return 2;
  return 3;
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
    submitInternalReview, submitCommitteeDecision, skipCommittee, recordTakeNotesOutcome,
    earlyCloseContract, startContractFollowUp, pauseContract, unpauseContract,
    awaitCompletion, resumeFromCompletion, skipCompletion,
    refreshContracts,
  } = useContracts();
  const { getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, users, isViewer } = useAuth();
  const { toast } = useToast();

  const lawyers = users.filter((u) => u.canBeAssignedConsultations);
  const getLawyerName = (id: string | null | undefined): string => {
    if (!id) return "—";
    return users.find((u) => u.id === id)?.name || "—";
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("");

  // Dashboard "بانتظار المراجعة" deep-link. Pre-selects the COMMITTEE
  // stage and (for non-manager roles) scopes by dept / assignedTo so
  // the page reflects what the popup counted. Single-shot on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const dept = params.get("dept");
    const assignedTo = params.get("assignedTo");
    if (status === "pending_review") setStageFilter(ContractStage.COMMITTEE);
    if (dept) setDeptFilter(dept);
    if (assignedTo) setAssignedToFilter(assignedTo);
  }, []);

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
      if (deptFilter && c.departmentId !== deptFilter) return false;
      if (assignedToFilter && c.assignedTo !== assignedToFilter) return false;
      return true;
    });
  }, [contracts, searchTerm, stageFilter, typeFilter, deptFilter, assignedToFilter, getClientName]);

  // Default ordering: priority group ASC, then workflow-stage order
  // ASC within a group (earlier stages bubble up), then updatedAt DESC
  // within the same stage. Mirrors cases / memos / consultations so the
  // four tables read consistently. ContractStagesAll covers the
  // conditional TAKING_NOTES branch; unknown stages fall to 999.
  const sortedContracts = useMemo(
    () => {
      const updatedAtMs = (c: Contract): number => {
        const t = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
        return Number.isFinite(t) ? t : 0;
      };
      const stageOrderIndex = (c: Contract): number => {
        const i = ContractStagesAll.indexOf(c.currentStage);
        return i === -1 ? 999 : i;
      };
      return [...filteredContracts].sort((a, b) => {
        const ga = getContractPriorityGroup(a);
        const gb = getContractPriorityGroup(b);
        if (ga !== gb) return ga - gb;
        const sa = stageOrderIndex(a);
        const sb = stageOrderIndex(b);
        if (sa !== sb) return sa - sb;
        return updatedAtMs(b) - updatedAtMs(a);
      });
    },
    [filteredContracts],
  );

  // Pagination — added to match cases / hearings / memos, which this page
  // previously lacked entirely (it rendered the whole filtered list).
  const [CONTRACT_PAGE_SIZE, setContractPageSize] = usePageSize("contracts");
  const [contractPage, setContractPage] = useState(1);
  useEffect(() => {
    setContractPage(1);
  }, [searchTerm, stageFilter, typeFilter, deptFilter, assignedToFilter]);
  const contractTotalPages = Math.max(1, Math.ceil(sortedContracts.length / CONTRACT_PAGE_SIZE));
  const pagedContracts = sortedContracts.slice(
    (contractPage - 1) * CONTRACT_PAGE_SIZE,
    contractPage * CONTRACT_PAGE_SIZE,
  );
  const handleContractPageSizeChange = (size: number) => {
    setContractPageSize(size);
    setContractPage(1);
  };

  // ---- Create dialog ----
  const [isAddOpen, setIsAddOpen] = useState(false);
  // Look up the contracts department id by canonical name so the
  // create form pre-selects it. Re-runs when departments load.
  const contractsDeptId = useMemo(
    () => departments.find((d) => d.name === "العقود والمشاريع")?.id || "",
    [departments],
  );

  const [formData, setFormData] = useState({
    title: "",
    clientId: "",
    contractType: ContractType.REVIEW as string,
    departmentId: "",
    description: "",
  });

  // For مراجعة_عقد contracts the "العقد محل المراجعة" file is required
  // at create time — we capture it on the form and upload it
  // immediately after the contract row is created. Other types skip
  // this entirely.
  const [intakeFile, setIntakeFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  // Optional create-time attachments — usable for ALL contract types.
  // Each row carries its own file + free-text description; the user can
  // add up to ADDITIONAL_LIMIT rows and they all upload with
  // slotKey=null after the contract row commits.
  type PendingAdditional = { id: string; file: File | null; description: string };
  const ADDITIONAL_LIMIT = 5;
  const [pendingAdditionals, setPendingAdditionals] = useState<PendingAdditional[]>([]);
  const newPendingAdditional = (): PendingAdditional => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file: null,
    description: "",
  });
  // Drives the "uploading X of N" line shown below the submit button
  // while the attachment uploads run in parallel after the contract is
  // created. Null between flows.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const resetForm = () => {
    setFormData({
      title: "", clientId: "", contractType: ContractType.REVIEW,
      // Default to the contracts dept; user can route elsewhere before save.
      departmentId: contractsDeptId,
      description: "",
    });
    setIntakeFile(null);
    setPendingAdditionals([]);
    setUploadProgress(null);
  };

  // Sync the default into formData once departments load — covers the
  // first render where contractsDeptId resolves later than the initial
  // useState. Doesn't overwrite a user-picked value (only fills "").
  useEffect(() => {
    if (!formData.departmentId && contractsDeptId) {
      setFormData((prev) => prev.departmentId ? prev : { ...prev, departmentId: contractsDeptId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractsDeptId]);

  const requiresIntakeFile = formData.contractType === ContractType.REVIEW;

  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.clientId || !formData.departmentId) return;
    if (requiresIntakeFile && !intakeFile) return;
    setCreating(true);
    let created: Contract | null = null;
    try {
      created = await addContract(formData);
    } catch (err) {
      toast({ title: "فشل إنشاء العقد", description: extractApiError(err), variant: "destructive" });
      setCreating(false);
      return;
    }
    // Contract is now committed. Build the upload queue (required
    // intake slot for مراجعة_عقد + every staged additional) and run them
    // in parallel — keeping the contract create and the uploads as
    // separate writes means a failed upload doesn't lose the contract
    // row, and the user can retry the failed ones from the details
    // dialog without re-typing the form.
    type PendingUpload = {
      file: File;
      slotKey: string | null;
      description: string | null;
      label: string;
    };
    const uploads: PendingUpload[] = [];
    if (requiresIntakeFile && intakeFile) {
      uploads.push({
        file: intakeFile,
        slotKey: ContractAttachmentSlot.CONTRACT_UNDER_REVIEW,
        description: null,
        label: intakeFile.name,
      });
    }
    for (const row of pendingAdditionals) {
      if (row.file) {
        uploads.push({
          file: row.file,
          slotKey: null,
          description: row.description.trim() || null,
          label: row.file.name,
        });
      }
    }

    if (created && uploads.length > 0) {
      setUploadProgress({ done: 0, total: uploads.length });
      let done = 0;
      const results = await Promise.all(uploads.map(async (u) => {
        try {
          await uploadAttachmentRaw(created!.id, u.file, u.slotKey, u.description);
          return { ok: true as const, label: u.label };
        } catch (err: any) {
          return { ok: false as const, label: u.label, error: err?.message || String(err) };
        } finally {
          done++;
          setUploadProgress({ done, total: uploads.length });
        }
      }));
      const failures = results.filter((r) => !r.ok);
      if (failures.length === 0) {
        toast({ title: "تم إنشاء العقد ورفع المرفقات بنجاح" });
      } else if (failures.length === uploads.length) {
        toast({
          title: "تم إنشاء العقد لكن فشل رفع جميع المرفقات",
          description: "افتح تفاصيل العقد لإعادة الرفع من تبويب المرفقات.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `تم إنشاء العقد، فشل رفع ${failures.length} من ${uploads.length} مرفق`,
          description: `الملفات الفاشلة: ${failures.map((f) => f.label).join("، ")}`,
          variant: "destructive",
        });
      }
    } else {
      toast({ title: "تم إنشاء العقد بنجاح" });
    }

    setIsAddOpen(false);
    resetForm();
    setCreating(false);
  };

  // ---- Details dialog state ----
  const [selected, setSelected] = useState<Contract | null>(null);
  useEffect(() => {
    if (!selected) return;
    const fresh = contracts.find((c) => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [contracts, selected]);

  // Activity log — default collapsed so the dialog body stays scannable.
  // Click the header chevron to expand.
  const [activities, setActivities] = useState<ContractActivity[]>([]);
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
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

  // Attachments — split into per-slot map + free additional list. The
  // server groups them on read but we still re-fetch on uploads /
  // deletes so the slot card and the additional list stay in sync.
  const [attachmentsBySlot, setAttachmentsBySlot] = useState<Record<string, ContractAttachment>>({});
  const [additionalAttachments, setAdditionalAttachments] = useState<ContractAttachment[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const fetchAttachments = async (id: string) => {
    try {
      const res = await apiRequest("GET", `/api/contracts/${id}/attachments`);
      const data = await res.json() as { slots: Record<string, ContractAttachment>; additional: ContractAttachment[] };
      setAttachmentsBySlot(data.slots || {});
      setAdditionalAttachments(data.additional || []);
    } catch {
      setAttachmentsBySlot({});
      setAdditionalAttachments([]);
    }
  };
  useEffect(() => {
    if (!selected) {
      setAttachmentsBySlot({});
      setAdditionalAttachments([]);
      return;
    }
    fetchAttachments(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Low-level POST — throws on failure, no UI side effects. Used by the
  // create-dialog flow (which batches multiple uploads in parallel and
  // wants to aggregate failures itself) and wrapped by uploadAttachment
  // below for the details-dialog flow.
  //
  // Multipart uploads can't go through apiRequest (which sets a
  // JSON Content-Type); we hand-roll the fetch but still need the
  // bearer token AND the CSRF token — same protection that the
  // shared queryClient.apiRequest applies. Letting the browser
  // pick the multipart Content-Type (with its boundary) is
  // critical: setting it manually breaks parsing on the server.
  //
  // 401 + 403 are recovered transparently: a stale JWT (401) or a
  // stale CSRF token (403 — 4h TTL while sessions are typically
  // longer) was the silent cause of "uploads suddenly stop working
  // until I refresh the page". The refresh goes through queryClient's
  // single-flight refreshAuthToken — sharing the in-flight promise with
  // apiRequest's 401 path and auth-context's scheduled refresh, so a
  // concurrent refresh can't consume the rotation token out from under
  // us (same race class fixed in Phase 0) — then the upload replays
  // once. After that one retry, any non-2xx surfaces with the server's
  // error message AND the HTTP status logged to console for support
  // triage.
  const uploadAttachmentRaw = async (
    contractId: string,
    file: File,
    slotKey: string | null,
    description: string | null = null,
  ): Promise<void> => {
    const buildHeaders = (): Record<string, string> => {
      const token = localStorage.getItem("lawfirm_token");
      const csrfToken = localStorage.getItem("lawfirm_csrf_token");
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      return headers;
    };
    const buildFormData = (): FormData => {
      // Re-create per attempt — a consumed FormData can't be safely
      // re-sent. File objects survive multiple reads, so this is cheap.
      const fd = new FormData();
      fd.append("file", file);
      if (slotKey) fd.append("slotKey", slotKey);
      if (description) fd.append("description", description);
      return fd;
    };
    let res = await fetch(`/api/contracts/${contractId}/attachments`, {
      method: "POST",
      headers: buildHeaders(),
      body: buildFormData(),
      credentials: "same-origin",
    });
    if ((res.status === 401 || res.status === 403) && (await refreshAuthToken()).ok) {
      res = await fetch(`/api/contracts/${contractId}/attachments`, {
        method: "POST",
        headers: buildHeaders(),
        body: buildFormData(),
        credentials: "same-origin",
      });
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      // Surface to console so the user can hand a real diagnostic to
      // support instead of just "فشل الرفع". Includes the HTTP status,
      // contract id, slot key, and the server's Arabic error message.
      console.error(
        "[contracts upload] failed",
        { status: res.status, contractId, slotKey, fileName: file.name, body: errBody },
      );
      throw new Error(errBody?.error || `فشل رفع الملف (${res.status})`);
    }
  };

  const uploadAttachment = async (
    contractId: string,
    file: File,
    slotKey: string | null,
  ) => {
    setUploadingSlot(slotKey || "additional");
    try {
      await uploadAttachmentRaw(contractId, file, slotKey);
      await fetchAttachments(contractId);
      await fetchActivities(contractId);
      toast({ title: "تم رفع الملف بنجاح" });
    } catch (err: any) {
      toast({ title: "فشل الرفع", description: err.message || String(err), variant: "destructive" });
    } finally {
      setUploadingSlot(null);
    }
  };

  const deleteAttachment = async (contractId: string, attachmentId: string) => {
    try {
      await apiRequest("DELETE", `/api/contracts/${contractId}/attachments/${attachmentId}`);
      await fetchAttachments(contractId);
      await fetchActivities(contractId);
      toast({ title: "تم حذف المرفق" });
    } catch (err) {
      toast({ title: "فشل الحذف", description: extractApiError(err), variant: "destructive" });
    }
  };

  const downloadAttachment = (contractId: string, attachmentId: string) => {
    // Simple anchor-driven download — the server returns
    // Content-Disposition: attachment so the browser saves rather
    // than navigates. Token-bearing fetch isn't an option for the
    // streaming endpoint, so the cookie/jwt-via-bearer fallback on
    // /uploads doesn't apply; we open the URL directly and rely on
    // the requireAuth middleware honoring the session cookie. Most
    // deployments here use bearer tokens, so we open in a new tab
    // and let the user re-auth if needed.
    const token = localStorage.getItem("lawfirm_token");
    const url = `/api/contracts/${contractId}/attachments/${attachmentId}/download`;
    if (token) {
      // Bearer-token fetch + blob download.
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (r) => {
          if (!r.ok) {
            // Surface the actual server error (404 "ملف غير موجود على
            // القرص" vs 404 "المرفق غير موجود" vs 403 "صلاحية" etc.)
            // rather than a useless generic "فشل التحميل".
            const errBody = await r.json().catch(() => ({}));
            console.error(
              "[contracts download] failed",
              { status: r.status, contractId, attachmentId, body: errBody },
            );
            throw new Error(errBody?.error || `فشل التحميل (${r.status})`);
          }
          const blob = await r.blob();
          const cd = r.headers.get("Content-Disposition") || "";
          const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
          const fileName = m ? decodeURIComponent(m[1]) : "download";
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
        })
        .catch((err) => toast({
          title: "فشل التحميل",
          description: err?.message || String(err),
          variant: "destructive",
        }));
    } else {
      window.open(url, "_blank");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Browser-native preview is reliable for PDFs and images. Office
  // formats (.doc/.docx/.xls/.xlsx) need an external viewer; we
  // disable the button with a tooltip in those cases rather than
  // shipping a half-broken Google-Docs-Viewer fallback that would
  // require public file URLs.
  const PREVIEWABLE_MIMES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
  ]);
  const canPreview = (mime: string): boolean => PREVIEWABLE_MIMES.has(mime);

  // Fetches the file as a blob (so we can attach the auth + CSRF
  // headers — window.open can't), creates a blob URL, and opens it
  // in a new tab. The blob URL's lack of Content-Disposition lets
  // the browser inline-render PDFs and images even though the
  // download endpoint streams with `attachment`. We deliberately
  // don't revoke the URL — there's no reliable "tab closed" signal,
  // and the blob is freed when the tab unloads anyway.
  const previewAttachment = async (contractId: string, attachmentId: string, mimeType: string) => {
    if (!canPreview(mimeType)) return;
    try {
      const token = localStorage.getItem("lawfirm_token");
      const csrfToken = localStorage.getItem("lawfirm_csrf_token");
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const res = await fetch(
        `/api/contracts/${contractId}/attachments/${attachmentId}/download`,
        { headers, credentials: "same-origin" },
      );
      if (!res.ok) {
        // The 404s users were hitting after deploy were "ملف غير موجود
        // على القرص" — ephemeral storage drops uploaded files on
        // redeploy. Surface the server's actual message so the user
        // (and support) can tell that from "attachment row missing" or
        // a permission failure.
        const errBody = await res.json().catch(() => ({}));
        console.error(
          "[contracts preview] failed",
          { status: res.status, contractId, attachmentId, mimeType, body: errBody },
        );
        throw new Error(errBody?.error || `فشل تحميل المعاينة (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err: any) {
      toast({
        title: "فشل عرض الملف",
        description: err?.message || String(err),
        variant: "destructive",
      });
    }
  };

  const canDeleteAttachment = (a: ContractAttachment, contract: Contract): boolean => {
    if (!user) return false;
    if (isViewer) return false;
    // contract_under_review is the immutable source document — only
    // branch_manager + admin_support can delete it (mis-upload recovery).
    // Server enforces the same rule; this just hides the button.
    if (a.slotKey === ContractAttachmentSlot.CONTRACT_UNDER_REVIEW) {
      return user.role === "branch_manager" || user.role === "admin_support";
    }
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (user.role === "department_head" && contract.departmentId === user.departmentId) return true;
    return a.uploadedBy === user.id;
  };

  // Whether the upload/replace control should render at all for a slot
  // card. contract_under_review is write-once: once a REAL file lives
  // there, no replace ever — even branch_manager has to delete-then-
  // reupload (which leaves a clear audit trail). Missing legacy stubs
  // (pre-Object-Storage rows whose file vanished on redeploy) are
  // exempt — the user can overwrite them in one step. Every other slot
  // replaces freely. Viewers never see the upload control regardless.
  const canUploadToSlot = (slotKey: string, hasExisting: boolean, isMissing: boolean): boolean => {
    if (isViewer) return false;
    if (slotKey === ContractAttachmentSlot.CONTRACT_UNDER_REVIEW && hasExisting && !isMissing) return false;
    return true;
  };

  // ---- Action dialogs ----
  const [showAssign, setShowAssign] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Contract | null>(null);
  const [assignLawyerId, setAssignLawyerId] = useState("");

  const [showReturn, setShowReturn] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Contract | null>(null);
  const [returnStageValue, setReturnStageValue] = useState<string>("");

  // Stage-aware advance dialog. Only opens when the destination
  // stage requires extra input — RECEIVED_PENDING_COMPLETION (notes
  // required), INTERNAL_REVIEW (reviewer required), COMMITTEE
  // (priority required, reason optional). Other transitions skip
  // the dialog and call advanceStage directly. State is reset on
  // every open so the previous form's values don't leak between
  // contracts.
  const [showAdvance, setShowAdvance] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<Contract | null>(null);
  const [advanceTargetStage, setAdvanceTargetStage] = useState<ContractStageValue | null>(null);
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [advanceReviewerId, setAdvanceReviewerId] = useState<string>("");
  const [advancePriority, setAdvancePriority] = useState<string>("");
  const [advancePriorityReason, setAdvancePriorityReason] = useState<string>("");

  const stageRequiresAdvanceDialog = (target: ContractStageValue): boolean =>
    target === ContractStage.RECEIVED_PENDING_COMPLETION
    || target === ContractStage.INTERNAL_REVIEW
    || target === ContractStage.COMMITTEE;

  const openAdvanceDialog = (contract: Contract, target: ContractStageValue) => {
    setAdvanceTarget(contract);
    setAdvanceTargetStage(target);
    setAdvanceNotes("");
    // Default reviewer to whatever the contract already carries —
    // the advance is usually a no-op on this field, with the picker
    // present only so dept_head can change the assignment when
    // re-routing the file to a different reviewer than last time.
    setAdvanceReviewerId(contract.internalReviewerId || "");
    setAdvancePriority(contract.priority || "");
    setAdvancePriorityReason(contract.priorityReason || "");
    setShowAdvance(true);
  };

  // Pool of users eligible to be picked as internal reviewer for
  // this contract: active, in the contract's department, not the
  // assigned lawyer (a lawyer reviewing their own draft is the bug
  // we're trying to prevent), and not branch_manager / admin_support /
  // hr / technical_support (administrative roles, not reviewers).
  const reviewerExcludedRoles = new Set([
    "branch_manager", "admin_support", "hr", "technical_support",
  ]);
  const eligibleReviewers = (contract: Contract) =>
    users.filter((u) =>
      u.isActive
      && !reviewerExcludedRoles.has(u.role)
      && u.departmentId === contract.departmentId
      && u.id !== contract.assignedTo,
    );

  const [showInternalReview, setShowInternalReview] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Contract | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const [showCommittee, setShowCommittee] = useState(false);
  const [committeeTarget, setCommitteeTarget] = useState<Contract | null>(null);
  const [committeeNotes, setCommitteeNotes] = useState("");

  // Reasoned override — "تجاوز لجنة المراجعة" (skip straight to جاهزة_للإرسال).
  const [showSkipCommittee, setShowSkipCommittee] = useState(false);
  const [skipCommitteeTarget, setSkipCommitteeTarget] = useState<Contract | null>(null);
  const [skipCommitteeReason, setSkipCommitteeReason] = useState("");

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

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Contract | null>(null);
  const [transferDeptId, setTransferDeptId] = useState("");
  const [transferReason, setTransferReason] = useState("");

  // Same gate as the cases-side transfer: branch_manager / admin_support /
  // department_head (own dept). Anyone with admin-level access can move
  // a contract to a different department; assigned lawyers cannot.
  const canTransferContract = (c: Contract): boolean => {
    if (!user) return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (user.role === "department_head" && c.departmentId === user.departmentId) return true;
    return false;
  };

  const canDeleteContract = (): boolean => !!user && user.role === "branch_manager";

  // "تعديل البيانات" — record-level correction, mirroring the cases page.
  //
  // GATE: reuses canTransferContract's exact shape (branch_manager |
  // admin_support | own-dept department_head) — the page's own convention for
  // record administration, and a strict SUBSET of the server's
  // canModifyContract gate on PATCH, so nothing rendered can ever 403.
  const canEditContract = (c: Contract): boolean => canTransferContract(c);

  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [editForm, setEditForm] = useState({
    clientId: "",
    title: "",
    contractType: "",
    description: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const openEditContractDialog = (c: Contract) => {
    setEditForm({
      clientId: c.clientId || "",
      title: c.title || "",
      contractType: c.contractType || ContractType.REVIEW,
      description: c.description || "",
    });
    setEditContract(c);
  };

  const handleEditContract = async () => {
    if (!editContract) return;
    if (!editForm.title.trim() || !editForm.clientId) {
      toast({ title: "خطأ", description: "العميل والعنوان مطلوبان", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      // contractType is sent ONLY when it actually changed. The server's
      // existing type-change branch then runs the full dedicated flow —
      // remapContractStageForType + a TYPE_CHANGED activity entry — exactly as
      // the detail-panel Select does. Sending it unchanged would be harmless but
      // sending it conditionally keeps the DETAILS_EDITED log entry accurate.
      const typeChanged = editForm.contractType !== editContract.contractType;
      await updateContract(editContract.id, {
        clientId: editForm.clientId,
        title: editForm.title.trim(),
        description: editForm.description,
        ...(typeChanged ? { contractType: editForm.contractType as ContractTypeValue } : {}),
      });
      await refreshContracts();
      toast({ title: "تم تحديث بيانات العقد" });
      setEditContract(null);
    } catch (err) {
      toast({ title: "فشل حفظ التعديل", description: extractApiError(err), variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  // Early-close gate. Mirrors canEarlyCloseCase in cases.tsx and the
  // server gate in /api/contracts/:id/early-close: branch_manager /
  // admin_support (global), department_head (own dept), assigned lawyer.
  // Dept-scope check requires both departmentIds non-empty so a null
  // dept_head can't match a legacy/"أخرى" contract that is also null.
  const canEarlyClose = (c: Contract): boolean => {
    if (!user) return false;
    if (c.status !== "active") return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (user.role === "department_head"
      && !!user.departmentId
      && !!c.departmentId
      && user.departmentId === c.departmentId) return true;
    if (!!c.assignedTo && c.assignedTo === user.id) return true;
    return false;
  };

  // FE permission gate mirroring POST /api/contracts/:id/start-follow-up.
  // Restates the SERVER rule verbatim → visibility == authorization. Note it
  // is the same actor set as canEarlyClose above (the contracts convention),
  // NOT the narrower admin-only gate the consultations follow-up uses: on
  // contracts an own-dept head / the assigned lawyer can close, so they must
  // be able to re-open. Only difference from canEarlyClose is the status
  // check — closed instead of active.
  const canStartFollowUp = (c: Contract): boolean => {
    if (!user) return false;
    if (c.status !== "closed") return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (user.role === "department_head"
      && !!user.departmentId
      && !!c.departmentId
      && user.departmentId === c.departmentId) return true;
    if (!!c.assignedTo && c.assignedTo === user.id) return true;
    return false;
  };

  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<Contract | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const openFollowUpDialog = (c: Contract) => {
    setFollowUpTarget(c);
    setFollowUpQuestion("");
    setShowFollowUp(true);
  };
  const closeFollowUpDialog = () => {
    setShowFollowUp(false);
    setFollowUpTarget(null);
    setFollowUpQuestion("");
  };

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

  // Mirrors handleStartFollowUp on the consultations page: the endpoint
  // returns the authoritative updated row, so sync the open details dialog
  // against it directly rather than waiting for the list refetch to
  // re-resolve `selected` (otherwise the dialog briefly renders the stale
  // closed row — no badge, button still showing).
  const handleStartFollowUp = async () => {
    if (!followUpTarget) return;
    const question = followUpQuestion.trim();
    if (!question) {
      toast({ title: "اكتب السؤال أو الاستفسار الجديد", variant: "destructive" });
      return;
    }
    const nextNum = (followUpTarget.followUpCount ?? 0) + 1;
    const targetId = followUpTarget.id;
    setBusy(true);
    try {
      const updated = await startContractFollowUp(targetId, question);
      await refreshContracts();
      // Guard against a stale fire — the user could have switched dialogs
      // mid-flight. Only sync if it's still the same row.
      if (selected?.id === targetId) setSelected(updated);
      toast({ title: `تم بدء التعقيبية #${nextNum}` });
      closeFollowUpDialog();
    } catch (err) {
      toast({ title: "فشل بدء التعقيبية", description: extractApiError(err), variant: "destructive" });
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
        {canCreateContract(user?.role) && (
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
              {/* CLIENT FIRST — matches the consultations dialogs, and the
                  edit dialog below uses the same order. */}
              <div>
                <Label>العميل</Label>
                <ClientAutocomplete
                  value={formData.clientId}
                  onChange={(clientId) => setFormData({ ...formData, clientId })}
                />
              </div>
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
                <Label>نوع العقد</Label>
                <Select
                  value={formData.contractType}
                  onValueChange={(value) => {
                    setFormData({ ...formData, contractType: value });
                    // Clear the staged intake file when switching away
                    // from مراجعة_عقد — the slot only applies to that
                    // type, and re-staging a file for a different type
                    // would silently use the wrong slotKey.
                    if (value !== ContractType.REVIEW) setIntakeFile(null);
                  }}
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
              {/* مراجعة_عقد intake file — required at create time. The
                  picker is hidden for the other two contract types since
                  they have no required intake slot. The file is uploaded
                  in a second request after the contract is committed
                  (see handleAdd) so a failed upload doesn't lose the
                  contract row. */}
              {requiresIntakeFile && (
                <div>
                  <Label>
                    العقد محل المراجعة <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="file"
                    data-testid="input-contract-intake-file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => setIntakeFile(e.target.files?.[0] ?? null)}
                  />
                  {intakeFile && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      <BidiText>{intakeFile.name}</BidiText>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    يلزم رفع نسخة العقد قبل إنشاء طلب المراجعة. يمكن استبداله لاحقاً من تبويب المرفقات.
                  </p>
                </div>
              )}
              {/* Optional additional attachments — available for ALL
                  contract types (including صياغة_عقد / مشروع which have
                  no required intake slot). Each row uploads with
                  slotKey=null after the contract row commits. */}
              <div className="space-y-2 border-t pt-3">
                <Label className="text-sm">مرفقات إضافية (اختياري)</Label>
                {pendingAdditionals.map((row, idx) => (
                  <div
                    key={row.id}
                    className="rounded-md border p-3 bg-muted/30 space-y-2"
                    data-testid={`additional-row-${idx}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          type="file"
                          data-testid={`input-contract-additional-file-${idx}`}
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            setPendingAdditionals((prev) =>
                              prev.map((p) => (p.id === row.id ? { ...p, file: f } : p)),
                            );
                          }}
                        />
                        {row.file && (
                          <p className="text-xs text-muted-foreground truncate">
                            <BidiText>{row.file.name}</BidiText>
                          </p>
                        )}
                        <Textarea
                          data-testid={`input-contract-additional-description-${idx}`}
                          value={row.description}
                          placeholder="وصف اختياري للمرفق..."
                          rows={2}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPendingAdditionals((prev) =>
                              prev.map((p) => (p.id === row.id ? { ...p, description: v } : p)),
                            );
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-testid={`button-remove-additional-${idx}`}
                        aria-label="حذف المرفق"
                        onClick={() =>
                          setPendingAdditionals((prev) => prev.filter((p) => p.id !== row.id))
                        }
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {pendingAdditionals.length < ADDITIONAL_LIMIT ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="button-add-additional"
                    onClick={() =>
                      setPendingAdditionals((prev) => [...prev, newPendingAdditional()])
                    }
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 ml-2" />
                    إضافة مرفق إضافي
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    تم بلوغ الحد الأقصى ({ADDITIONAL_LIMIT}) للمرفقات الإضافية.
                  </p>
                )}
              </div>
            </div>
            <Button
              data-testid="button-submit-contract"
              onClick={handleAdd}
              className="w-full"
              disabled={
                creating
                || !formData.title.trim()
                || !formData.clientId
                || !formData.departmentId
                || (requiresIntakeFile && !intakeFile)
              }
            >
              {creating
                ? uploadProgress
                  ? `جاري رفع المرفقات ${uploadProgress.done} / ${uploadProgress.total}...`
                  : "جاري الإنشاء..."
                : "إضافة العقد"}
            </Button>
          </DialogContent>
        </Dialog>
        )}
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
                <TableHead className="text-center w-[48px]">#</TableHead>
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
              {pagedContracts.map((c, idx) => {
                const priorityGroup = getContractPriorityGroup(c);
                const rowClass =
                  priorityGroup === 1
                    ? "bg-amber-50/60 dark:bg-amber-950/20"
                    : priorityGroup === 4
                      ? "opacity-60"
                      : priorityGroup === 3
                        ? "opacity-80"
                        : "";
                return (
                <TableRow key={c.id} data-testid={`row-contract-${c.id}`} className={rowClass}>
                  {/* Display-only sequential number — index inside the RENDERED
                      page, so any filter/search/sort renumbers from 1.
                      Continues across pages via the page offset, and stays
                      correct at any page size because the offset is computed
                      from the live size. */}
                  <TableCell className="text-center text-xs text-muted-foreground" data-testid={`cell-index-${c.id}`}>
                    {(contractPage - 1) * CONTRACT_PAGE_SIZE + idx + 1}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <LtrInline>{c.contractNumber}</LtrInline>
                      {priorityGroup === 1 && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1 py-0"
                          data-testid={`badge-contract-unassigned-${c.id}`}
                          title="العقد لم يُسنَد لمحامٍ بعد"
                        >
                          <AlertTriangle className="w-2.5 h-2.5 ml-1" />
                          غير مسند
                        </Badge>
                      )}
                    </div>
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
                    {/* Follow-up cycle indicator — DERIVED, exactly like
                        "مذكرة جارية" / "بانتظار استلام الصك" in cases.tsx: no
                        stored flag, no clearing code. isContractInFollowUpCycle
                        is count>0 AND status active, so the badge self-clears
                        the moment the cycle re-closes (the row goes back to a
                        plain closed contract). The DIALOG badge stays
                        count-only/status-agnostic on purpose — see its comment. */}
                    {isContractInFollowUpCycle(c) && (
                      <Badge
                        variant="outline"
                        className="mr-1 border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] px-1 py-0"
                        data-testid={`badge-contract-follow-up-${c.id}`}
                        title="العقد في جولة استشارة تعقيبية"
                      >
                        <RotateCw className="w-2.5 h-2.5 ml-1" />
                        تعقيبية #{c.followUpCount}
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
                          {/* "تعديل البيانات" — mirrors the cases page: first
                              item, Pencil icon, same label. Not status-gated —
                              correcting the title or client on a closed contract
                              is legitimate and touches no workflow field. */}
                          {canEditContract(c) && (
                            <DropdownMenuItem
                              data-testid={`row-action-edit-${c.id}`}
                              onClick={() => openEditContractDialog(c)}
                            >
                              <Pencil className="w-4 h-4 ml-2" />
                              تعديل البيانات
                            </DropdownMenuItem>
                          )}
                          {/* Assign / reassign — available at ANY stage (not
                              just RECEIVED) for branch_manager, admin_support,
                              and own-dept department_head. The button label
                              flips between "إسناد" (no current assignee) and
                              "تعديل الإسناد" (existing assignee). Server
                              accepts reassignment regardless of stage. */}
                          {c.status === "active" && canTransferContract(c) && (
                            <DropdownMenuItem
                              data-testid={`row-action-assign-${c.id}`}
                              onClick={() => { setAssignTarget(c); setAssignLawyerId(c.assignedTo || ""); setShowAssign(true); }}
                            >
                              <UserPlus className="w-4 h-4 ml-2" />
                              {c.assignedTo ? "تعديل الإسناد" : "إسناد"}
                            </DropdownMenuItem>
                          )}
                          {/* Await / resume — same gate as pause, complementary
                              actions. Only one of the two is shown depending
                              on awaitingCompletion. */}
                          {canPause(c, user) && c.status === "active" && c.awaitingCompletion && (
                            <DropdownMenuItem
                              data-testid={`row-action-resume-${c.id}`}
                              className="text-green-600 focus:text-green-700"
                              onClick={() => wrap(() => resumeFromCompletion(c.id), "تم العودة من الاستكمال")}
                            >
                              <CheckCircle className="w-4 h-4 ml-2" />
                              تم الاستكمال
                            </DropdownMenuItem>
                          )}
                          {canPause(c, user) && c.status === "active" && !c.awaitingCompletion && (
                            <DropdownMenuItem
                              data-testid={`row-action-await-${c.id}`}
                              className="text-amber-600 focus:text-amber-700"
                              onClick={() => { setAwaitTarget(c); setAwaitReason(""); setShowAwait(true); }}
                            >
                              <AlertTriangle className="w-4 h-4 ml-2" />
                              بانتظار استكمال البيانات
                            </DropdownMenuItem>
                          )}
                          {canPause(c, user) && c.status === "active"
                            && c.currentStage === ContractStage.RECEIVED_PENDING_COMPLETION
                            && !c.awaitingCompletion && (
                            <DropdownMenuItem
                              data-testid={`row-action-skip-${c.id}`}
                              onClick={() => wrap(() => skipCompletion(c.id), "تم تجاوز مرحلة الاستكمال")}
                            >
                              تجاوز الاستكمال
                            </DropdownMenuItem>
                          )}
                          {canTransferContract(c) && (
                            <DropdownMenuItem
                              data-testid={`row-action-transfer-${c.id}`}
                              onClick={() => {
                                setTransferTarget(c);
                                setTransferDeptId("");
                                setTransferReason("");
                                setShowTransfer(true);
                              }}
                            >
                              <ChevronLeft className="w-4 h-4 ml-2" />
                              تحويل لقسم آخر
                            </DropdownMenuItem>
                          )}
                          {(canPause(c, user)) && <DropdownMenuSeparator />}
                          {canPause(c, user) && c.status === "active" && (
                            <DropdownMenuItem
                              data-testid={`row-action-pause-${c.id}`}
                              className="text-amber-600 focus:text-amber-700"
                              onClick={() => { setPauseTarget(c); setPauseReason(""); setShowPause(true); }}
                            >
                              <Pause className="w-4 h-4 ml-2" />
                              تعليق
                            </DropdownMenuItem>
                          )}
                          {canPause(c, user) && c.status === "paused" && (
                            <DropdownMenuItem
                              data-testid={`row-action-unpause-${c.id}`}
                              onClick={() => wrap(() => unpauseContract(c.id), "تم إلغاء التعليق")}
                            >
                              <Play className="w-4 h-4 ml-2" />
                              إلغاء التعليق
                            </DropdownMenuItem>
                          )}
                          {(canEarlyClose(c) || canDeleteContract()) && <DropdownMenuSeparator />}
                          {canEarlyClose(c) && (
                            <DropdownMenuItem
                              data-testid={`row-action-early-close-${c.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={() => { setEarlyCloseTarget(c); setEarlyCloseReason(""); setShowEarlyClose(true); }}
                            >
                              <XCircle className="w-4 h-4 ml-2" />
                              إغلاق مبكر
                            </DropdownMenuItem>
                          )}
                          {canDeleteContract() && (
                            <DropdownMenuItem
                              data-testid={`row-action-delete-${c.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={() => { setDeleteTarget(c); setShowDelete(true); }}
                            >
                              <Trash2 className="w-4 h-4 ml-2" />
                              حذف العقد
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
              {sortedContracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    لا توجد عقود مطابقة
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls
            currentPage={contractPage}
            totalPages={contractTotalPages}
            onPageChange={setContractPage}
            pageSize={CONTRACT_PAGE_SIZE}
            onPageSizeChange={handleContractPageSizeChange}
          />
        </CardContent>
      </Card>

      {/* ============ Details dialog ============ */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>تفاصيل العقد</span>
              {selected && <LtrInline>{selected.contractNumber}</LtrInline>}
              {/* Follow-up cycle badge — mirrors badge-consultation-follow-up
                  in the consultations detail dialog, including the
                  status-agnostic `followUpCount > 0` condition so a finished
                  cycle still shows which round the contract reached. */}
              {selected && (selected.followUpCount ?? 0) > 0 && (
                <Badge
                  variant="outline"
                  className="border-blue-500 bg-blue-500/10 text-blue-700 text-xs"
                  data-testid="badge-contract-follow-up"
                  title="استشارة تعقيبية"
                >
                  تعقيبية #{selected.followUpCount}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {/* Cycle question card. Visible only on an ACTIVE cycle — reads
                  the freshest FOLLOW_UP_STARTED entry from the activity list
                  (the endpoint returns them DESC by performedAt; .find() picks
                  the newest). metadata.followUpQuestion is written by
                  /start-follow-up. Direct mirror of banner-follow-up-question
                  on the consultations page. */}
              {isContractInFollowUpCycle(selected) && (() => {
                const latest = activities.find(
                  (a) => a.activityType === ContractActivityType.FOLLOW_UP_STARTED,
                );
                const question = latest?.metadata?.followUpQuestion;
                if (!question) return null;
                return (
                  <div
                    className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-900"
                    data-testid="banner-contract-follow-up-question"
                  >
                    <div className="flex items-center gap-2 font-medium text-blue-800">
                      <RotateCw className="w-4 h-4" />
                      السؤال التعقيبي الحالي
                      <span className="text-xs opacity-80">
                        (تعقيبية #{selected.followUpCount})
                      </span>
                    </div>
                    {/* text-foreground, NOT the wrapper's text-blue-900: the
                        inherited blue-900 sits almost invisibly on the
                        blue-500/10 tint in the dark theme. The heading keeps
                        its blue styling; only the question body is promoted
                        to the standard foreground colour so it reads. */}
                    <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                      <BidiText>{String(question)}</BidiText>
                    </p>
                  </div>
                );
              })()}
              {/* followUpCount switches the bar to the 3-stage cycle
                  (استلام → جاهزة للإرسال → مغلقة) — same prop and same
                  status-agnostic semantics as ConsultationStagesBar. */}
              <ContractStagesBar
                currentStage={selected.currentStage}
                followUpCount={selected.followUpCount}
              />

              {/* Action row */}
              <div className="flex flex-wrap gap-2 justify-end">
                {(() => {
                  const target = user ? getAdvanceTarget(selected, user.role, user.id, user.departmentId) : null;
                  if (!target) return null;
                  // Stages that need extra context open a dialog;
                  // everything else advances directly.
                  const needsDialog = stageRequiresAdvanceDialog(target);
                  return (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (needsDialog) {
                          openAdvanceDialog(selected, target);
                        } else {
                          wrap(
                            () => advanceStage(selected.id, target),
                            `انتقل إلى ${ContractStageLabels[target] || target}`,
                          );
                        }
                      }}
                      disabled={busy}
                      data-testid="dialog-advance"
                    >
                      <ChevronLeft className="w-4 h-4 ml-1" />
                      المرحلة التالية
                    </Button>
                  );
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
                {/* Reasoned override — "تجاوز لجنة المراجعة". A SEPARATE,
                    destructive-styled action so it cannot be confused with
                    "قرار اللجنة": its actors are the wider skip set (branch_manager
                    / own-dept head / assigned lawyer), and it skips the committee
                    rather than recording its decision. The gate restates the
                    server's rule verbatim → visibility == authorization. */}
                {user && canSkipCommittee(selected, user.role, user.id, user.departmentId) && (
                  <Button size="sm" variant="outline"
                    data-testid={`dialog-button-skip-committee-${selected.id}`}
                    onClick={() => { setSkipCommitteeTarget(selected); setSkipCommitteeReason(""); setShowSkipCommittee(true); }}
                    className="border-destructive/60 text-destructive hover:bg-destructive/10">
                    <AlertTriangle className="w-4 h-4 ml-1" />
                    تجاوز لجنة المراجعة
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
                {/* Re-open a closed contract for a client follow-up question.
                    Sits directly after إغلاق مبكر — the same relative slot the
                    consultations dialog uses (its follow-up button follows its
                    early-close button). Gate restates the server rule. */}
                {canStartFollowUp(selected) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-500 text-blue-600 hover:bg-blue-50"
                    data-testid={`dialog-button-start-follow-up-${selected.id}`}
                    onClick={() => openFollowUpDialog(selected)}
                  >
                    <RotateCw className="w-4 h-4 ml-1" />
                    استشارة تعقيبية
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
                  {canTransferContract(selected) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 w-full justify-between font-normal"
                      onClick={() => {
                        setTransferTarget(selected);
                        setTransferDeptId("");
                        setTransferReason("");
                        setShowTransfer(true);
                      }}
                      data-testid="dialog-dept-transfer-button"
                    >
                      <span>{getDepartmentName(selected.departmentId)}</span>
                      <ChevronLeft className="w-3.5 h-3.5 mr-1 opacity-50" />
                    </Button>
                  ) : (
                    <p>{getDepartmentName(selected.departmentId)}</p>
                  )}
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

              {/* ============ Attachments ============ */}
              {/* Designated slots come first (per-type rules from
                  ContractSlotsByType), then a free-form "additional"
                  bucket. Re-uploading a designated slot replaces the
                  prior file (server enforces the partial unique index
                  + unlinks the old file from disk). */}
              <div className="text-right border rounded-lg p-4 space-y-4" data-testid="contract-attachments">
                <h4 className="font-semibold flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  المرفقات
                </h4>
                {(() => {
                  const slotRules = (ContractSlotsByType as any)[selected.contractType as ContractTypeValue] || [];
                  if (slotRules.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        لا توجد ملفات مطلوبة لهذا النوع — استخدم "مرفقات إضافية" أدناه.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">ملفات مطلوبة</p>
                      {slotRules.map((rule: any) => {
                        const att = attachmentsBySlot[rule.slotKey];
                        const isUploading = uploadingSlot === rule.slotKey;
                        return (
                          <div
                            key={rule.slotKey}
                            className="border rounded-md p-3 bg-muted/30"
                            data-testid={`slot-card-${rule.slotKey}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{rule.label}</div>
                                {att ? (
                                  att.missing ? (
                                    <div
                                      className="text-xs text-destructive mt-1 flex items-center gap-1"
                                      data-testid={`slot-missing-${rule.slotKey}`}
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      هذا المرفق مفقود — يرجى إعادة الرفع
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      <BidiText>{att.fileName}</BidiText>
                                      {" • "}
                                      {formatFileSize(att.fileSize)}
                                      {" • "}
                                      <BidiText>{getLawyerName(att.uploadedBy)}</BidiText>
                                      {" • "}
                                      <LtrInline>{att.uploadedAt.slice(0, 10)}</LtrInline>
                                    </div>
                                  )
                                ) : (
                                  <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    لم يتم رفع الملف بعد
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {att && !att.missing && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={!canPreview(att.mimeType)}
                                    title={
                                      canPreview(att.mimeType)
                                        ? "معاينة"
                                        : "المعاينة غير متاحة لهذا النوع من الملفات"
                                    }
                                    onClick={() => previewAttachment(selected.id, att.id, att.mimeType)}
                                    data-testid={`preview-slot-${rule.slotKey}`}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                )}
                                {att && !att.missing && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => downloadAttachment(selected.id, att.id)}
                                    data-testid={`download-slot-${rule.slotKey}`}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                )}
                                {canUploadToSlot(rule.slotKey, !!att, !!att?.missing) && (
                                  <label className="cursor-pointer">
                                    <input
                                      type="file"
                                      className="hidden"
                                      disabled={isUploading}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = "";
                                        if (f) uploadAttachment(selected.id, f, rule.slotKey);
                                      }}
                                      data-testid={`upload-slot-${rule.slotKey}`}
                                    />
                                    <span className="inline-flex items-center justify-center h-8 px-3 rounded-md text-xs border bg-background hover:bg-accent">
                                      <Upload className="w-3.5 h-3.5 ml-1" />
                                      {att && !att.missing ? "استبدال" : "رفع"}
                                    </span>
                                  </label>
                                )}
                                {att && canDeleteAttachment(att, selected) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => deleteAttachment(selected.id, att.id)}
                                    data-testid={`delete-slot-${rule.slotKey}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Additional attachments (free, multi). */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">مرفقات إضافية ({additionalAttachments.length})</p>
                    {!isViewer && (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingSlot === "additional"}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) uploadAttachment(selected.id, f, null);
                        }}
                        data-testid="upload-additional"
                      />
                      <span className="inline-flex items-center justify-center h-8 px-3 rounded-md text-xs border bg-background hover:bg-accent">
                        <Upload className="w-3.5 h-3.5 ml-1" />
                        إضافة مرفق
                      </span>
                    </label>
                    )}
                  </div>
                  {additionalAttachments.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">لا توجد مرفقات إضافية بعد</p>
                  )}
                  {additionalAttachments.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 border rounded-md p-2 bg-background"
                      data-testid={`additional-attachment-${a.id}`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate"><BidiText>{a.fileName}</BidiText></div>
                          {a.missing ? (
                            <div
                              className="text-xs text-destructive flex items-center gap-1"
                              data-testid={`additional-missing-${a.id}`}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              هذا المرفق مفقود — يرجى حذفه وإعادة الرفع
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              {formatFileSize(a.fileSize)}
                              {" • "}
                              <BidiText>{getLawyerName(a.uploadedBy)}</BidiText>
                              {" • "}
                              <LtrInline>{a.uploadedAt.slice(0, 10)}</LtrInline>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!a.missing && (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={!canPreview(a.mimeType)}
                            title={
                              canPreview(a.mimeType)
                                ? "معاينة"
                                : "المعاينة غير متاحة لهذا النوع من الملفات"
                            }
                            onClick={() => previewAttachment(selected.id, a.id, a.mimeType)}
                            data-testid={`preview-additional-${a.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {!a.missing && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => downloadAttachment(selected.id, a.id)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        {canDeleteAttachment(a, selected) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteAttachment(selected.id, a.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
                            {eligibleReviewers(selected).map((l) => (
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

              {/* Activity log — collapsed by default, header chevron toggles */}
              <div className="text-right border rounded-lg p-3 bg-muted/20" data-testid="contract-activity-log">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm font-medium w-full text-right"
                  onClick={() => setActivitiesExpanded((v) => !v)}
                  data-testid="button-toggle-contract-activity-log"
                >
                  <span>سجل النشاط ({activities.length})</span>
                  <ChevronLeft
                    className={
                      "w-4 h-4 transition-transform " +
                      (activitiesExpanded ? "-rotate-90" : "")
                    }
                  />
                </button>
                {activitiesExpanded && (
                <ul className="mt-3 space-y-2">
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
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ Assign dialog ============ */}
      {/* "تعديل البيانات" — record-level correction. Controls reused from the
          create dialog. Deliberately NARROW: contractType has its own inline
          editor in the detail panel, departmentId change is a full DEPARTMENT
          TRANSFER server-side (clears assignee + reviewer, resets the stage to
          استلام) and so is not a "correction", assignee has its own action, and
          every workflow field (currentStage, status, closure, followUpCount) is
          excluded outright. */}
      <Dialog
        open={!!editContract}
        onOpenChange={(open) => { if (!open) setEditContract(null); }}
      >
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              تعديل بيانات العقد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Same field order as the ADD dialog: client → title → type →
                department → request text. */}
            <div>
              <Label>العميل</Label>
              <ClientAutocomplete
                value={editForm.clientId}
                onChange={(clientId) => setEditForm({ ...editForm, clientId })}
              />
            </div>
            <div>
              <Label>العنوان</Label>
              <Input
                data-testid="input-edit-contract-title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>نوع العقد</Label>
              <Select
                value={editForm.contractType}
                onValueChange={(value) => setEditForm({ ...editForm, contractType: value })}
              >
                <SelectTrigger data-testid="select-edit-contract-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.values(ContractType) as string[]).map((t) => (
                    <SelectItem key={t} value={t} data-testid={`option-edit-contract-type-${t}`}>
                      {ContractTypeLabels[t as keyof typeof ContractTypeLabels] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editContract && editForm.contractType !== editContract.contractType && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  تغيير النوع قد يُعيد ضبط مرحلة العقد وسيُسجَّل في سجل النشاط.
                </p>
              )}
            </div>
            {/* القسم — READ-ONLY here BY DESIGN. Changing a contract's department
                is a TRANSFER, not a correction: the server resets the stage to
                استلام and clears the assigned lawyer + internal reviewer. That
                belongs in the dedicated "تحويل لقسم آخر" action, which spells
                those consequences out before you confirm. */}
            <div>
              <Label>القسم</Label>
              <Input
                data-testid="input-edit-contract-department"
                value={departments.find((d) => d.id === editContract?.departmentId)?.name || "—"}
                readOnly
                disabled
              />
              <p className="text-xs text-muted-foreground mt-1">
                لتغيير القسم استخدم إجراء "تحويل لقسم آخر" — التحويل يُعيد المرحلة إلى "استلام" ويمسح الإسناد.
              </p>
            </div>
            <div>
              <Label>طلب العميل</Label>
              <Textarea
                data-testid="input-edit-contract-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={4}
              />
            </div>
            {/* Attachments are deliberately NOT duplicated here: an existing
                contract already has a full المرفقات tab that can add, replace
                and delete files against real slot keys. A second uploader in
                this dialog would be a parallel mechanism for the same job. */}
            <p className="text-xs text-muted-foreground border-t pt-3">
              المرفقات تُدار من تبويب "المرفقات" في تفاصيل العقد.
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" data-testid="button-cancel-edit-contract" onClick={() => setEditContract(null)}>
              إلغاء
            </Button>
            <Button
              data-testid="button-save-edit-contract"
              onClick={handleEditContract}
              disabled={editSaving || !editForm.title.trim() || !editForm.clientId}
            >
              حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إسناد العقد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>المحامي</Label>
            <Select value={assignLawyerId} onValueChange={setAssignLawyerId}>
              <SelectTrigger><SelectValue placeholder="اختر المحامي" /></SelectTrigger>
              <SelectContent>
                {(assignTarget?.departmentId
                  ? lawyers.filter((l) => l.departmentId === assignTarget.departmentId)
                  : lawyers
                )
                  .filter((l) => l.id !== assignTarget?.assignedTo)
                  .map((l) => (
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

      {/* ============ Advance dialog (stage-aware) ============ */}
      {/* Shown only when the destination needs extra context. The body
          branches on advanceTargetStage so PENDING_COMPLETION renders
          a required notes field, INTERNAL_REVIEW renders a reviewer
          Select, and COMMITTEE renders priority + reason. */}
      <Dialog open={showAdvance} onOpenChange={setShowAdvance}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {advanceTargetStage
                ? `الانتقال إلى ${ContractStageLabels[advanceTargetStage] || advanceTargetStage}`
                : "الانتقال للمرحلة التالية"}
            </DialogTitle>
          </DialogHeader>
          {advanceTarget && advanceTargetStage && (
            <div className="space-y-4">
              {/* RECEIVED → PENDING_COMPLETION: notes required —
                  describes what data is missing. */}
              {advanceTargetStage === ContractStage.RECEIVED_PENDING_COMPLETION && (
                <div>
                  <Label>
                    الملاحظات / البيانات المطلوبة <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    data-testid="advance-notes-required"
                    value={advanceNotes}
                    onChange={(e) => setAdvanceNotes(e.target.value)}
                    rows={3}
                    placeholder="اشرح ما هي البيانات أو المرفقات المطلوب استكمالها..."
                  />
                </div>
              )}

              {/* DRAFTING → INTERNAL_REVIEW: reviewer required (or
                  inherit from contract.internalReviewerId). The pool
                  excludes the assigned lawyer + admin/branch roles. */}
              {advanceTargetStage === ContractStage.INTERNAL_REVIEW && (
                <div>
                  <Label>
                    المراجع الداخلي <span className="text-destructive">*</span>
                  </Label>
                  <Select value={advanceReviewerId} onValueChange={setAdvanceReviewerId}>
                    <SelectTrigger data-testid="advance-reviewer-select">
                      <SelectValue placeholder="اختر المراجع" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleReviewers(advanceTarget).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                      {eligibleReviewers(advanceTarget).length === 0 && (
                        <div className="text-xs text-muted-foreground p-2">
                          لا يوجد مراجعون متاحون في القسم
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    المحامون النشطون في نفس القسم باستثناء المحامي المسند ورؤساء الإدارة.
                  </p>
                </div>
              )}

              {/* INTERNAL_REVIEW → COMMITTEE: priority required, reason
                  optional. Priority defaults to whatever's already on
                  the contract (set inline on the committee card if it
                  was reached earlier and bounced back). */}
              {advanceTargetStage === ContractStage.COMMITTEE && (
                <>
                  <div>
                    <Label>
                      الأولوية <span className="text-destructive">*</span>
                    </Label>
                    <Select value={advancePriority} onValueChange={setAdvancePriority}>
                      <SelectTrigger data-testid="advance-priority-select">
                        <SelectValue placeholder="اختر الأولوية" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.values(ContractPriority) as ContractPriorityValue[]).map((p) => (
                          <SelectItem key={p} value={p}>
                            {ContractPriorityLabels[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>سبب الأولوية (اختياري)</Label>
                    <Textarea
                      data-testid="advance-priority-reason"
                      value={advancePriorityReason}
                      onChange={(e) => setAdvancePriorityReason(e.target.value)}
                      rows={2}
                      placeholder="اشرح سبب اختيار هذه الأولوية..."
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdvance(false)}>إلغاء</Button>
            <Button
              data-testid="advance-confirm"
              onClick={async () => {
                if (!advanceTarget || !advanceTargetStage) return;
                // Per-stage validation mirrors the server. Bail
                // here so the user gets fast feedback rather than a
                // 400 round-trip.
                if (
                  advanceTargetStage === ContractStage.RECEIVED_PENDING_COMPLETION
                  && !advanceNotes.trim()
                ) return;
                if (
                  advanceTargetStage === ContractStage.INTERNAL_REVIEW
                  && !advanceReviewerId
                ) return;
                if (
                  advanceTargetStage === ContractStage.COMMITTEE
                  && !advancePriority
                ) return;
                const extras: Record<string, string> = {};
                if (advanceNotes.trim()) extras.notes = advanceNotes.trim();
                if (advanceReviewerId) extras.internalReviewerId = advanceReviewerId;
                if (advancePriority) extras.priority = advancePriority;
                if (advancePriorityReason.trim()) extras.priorityReason = advancePriorityReason.trim();
                await wrap(
                  () => advanceStage(advanceTarget.id, advanceTargetStage, extras),
                  `انتقل إلى ${ContractStageLabels[advanceTargetStage] || advanceTargetStage}`,
                );
                setShowAdvance(false);
              }}
              disabled={
                busy
                || !advanceTargetStage
                || (advanceTargetStage === ContractStage.RECEIVED_PENDING_COMPLETION && !advanceNotes.trim())
                || (advanceTargetStage === ContractStage.INTERNAL_REVIEW && !advanceReviewerId)
                || (advanceTargetStage === ContractStage.COMMITTEE && !advancePriority)
              }
            >تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Internal review dialog ============ */}
      <Dialog open={showInternalReview} onOpenChange={setShowInternalReview}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>المراجعة الداخلية</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* Notes are optional for "اعتماد" but REQUIRED for
                "يوجد ملاحظات" — the * + per-button disabled state
                surfaces this without splitting into two textareas. */}
            <Label>
              الملاحظات
              <span className="text-muted-foreground text-xs mr-1">
                (مطلوبة عند اختيار "يوجد ملاحظات")
              </span>
            </Label>
            <Textarea
              data-testid="internal-review-notes"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowInternalReview(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!reviewTarget || !reviewNotes.trim()) return;
                await wrap(() => submitInternalReview(reviewTarget.id, InternalReviewDecision.NEEDS_NOTES, reviewNotes.trim()), "أُعيد للتعديل");
                setShowInternalReview(false);
              }}
              disabled={busy || !reviewNotes.trim()}
            >يوجد ملاحظات</Button>
            <Button
              onClick={async () => {
                if (!reviewTarget) return;
                await wrap(() => submitInternalReview(reviewTarget.id, InternalReviewDecision.PASSED, reviewNotes.trim()), "تم الاعتماد للجنة");
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
            <Label>
              الملاحظات
              <span className="text-muted-foreground text-xs mr-1">
                (مطلوبة عند اختيار "يوجد ملاحظات")
              </span>
            </Label>
            <Textarea
              data-testid="committee-notes"
              value={committeeNotes}
              onChange={(e) => setCommitteeNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCommittee(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!committeeTarget || !committeeNotes.trim()) return;
                await wrap(() => submitCommitteeDecision(committeeTarget.id, CommitteeDecision.NEEDS_NOTES, committeeNotes.trim()), "أُعيد للملاحظات");
                setShowCommittee(false);
              }}
              disabled={busy || !committeeNotes.trim()}
            >يوجد ملاحظات</Button>
            <Button
              onClick={async () => {
                if (!committeeTarget) return;
                await wrap(() => submitCommitteeDecision(committeeTarget.id, CommitteeDecision.APPROVED, committeeNotes.trim()), "اعتماد اللجنة");
                setShowCommittee(false);
              }}
              disabled={busy}
            >اعتماد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Skip-committee dialog (reasoned override) ============
          Moves the contract straight to جاهزة_للإرسال with NO committee decision;
          the reason is MANDATORY and is recorded (with the acting name) in the
          contract activity log, which auto-refreshes on updatedAt. */}
      <Dialog open={showSkipCommittee} onOpenChange={(open) => { if (!open) setShowSkipCommittee(false); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              تجاوز مرحلة لجنة المراجعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم نقل العقد مباشرةً إلى <strong>جاهزة للإرسال</strong> دون قرار من لجنة
              المراجعة. يُسجَّل هذا الإجراء في سجل نشاط العقد مع اسمك والسبب. السبب إلزامي.
            </p>
            <div>
              <Label>سبب التجاوز <span className="text-red-500">*</span></Label>
              <Textarea
                data-testid="input-skip-committee-reason"
                value={skipCommitteeReason}
                onChange={(e) => setSkipCommitteeReason(e.target.value)}
                placeholder="سبب تجاوز لجنة المراجعة (إلزامي)..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSkipCommittee(false)} data-testid="button-cancel-skip-committee">
              إلغاء
            </Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-skip-committee"
              onClick={async () => {
                if (!skipCommitteeTarget || !skipCommitteeReason.trim()) return;
                await wrap(() => skipCommittee(skipCommitteeTarget.id, skipCommitteeReason.trim()), "تم تجاوز لجنة المراجعة — العقد جاهز للإرسال");
                setShowSkipCommittee(false);
              }}
              disabled={busy || !skipCommitteeReason.trim()}
            >
              تأكيد التجاوز
            </Button>
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

      {/* ============ Start-follow-up dialog ("استشارة تعقيبية") ============
          Same content as the consultations dialog — required Textarea for the
          client's new question, count in the title, blue confirm. Built on
          <Dialog> rather than the consultations page's <AlertDialog> to match
          the CONTRACTS convention: every workflow dialog on this page
          (pause / await / early-close / assign / advance) is a Dialog, and
          AlertDialog is reserved here for the delete confirmation. The body
          text is copied verbatim minus the SLA sentence — contracts have no
          expectedDeliveryDate to renew. */}
      <Dialog open={showFollowUp} onOpenChange={(open) => { if (!open) closeFollowUpDialog(); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="w-5 h-5 text-blue-600" />
              بدء استشارة تعقيبية #{(followUpTarget?.followUpCount ?? 0) + 1}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              سيتم فتح العقد من جديد في مرحلة الاستلام.
            </p>
            <Label>السؤال أو الاستفسار الجديد <span className="text-red-500">*</span></Label>
            <Textarea
              data-testid="input-contract-follow-up-question"
              value={followUpQuestion}
              onChange={(e) => setFollowUpQuestion(e.target.value)}
              placeholder="اكتب السؤال الذي طرحه العميل..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeFollowUpDialog}>إلغاء</Button>
            <Button
              data-testid="button-confirm-start-contract-follow-up"
              onClick={handleStartFollowUp}
              disabled={busy || !followUpQuestion.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <RotateCw className="w-4 h-4 ml-1" />
              بدء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Department transfer dialog ============ */}
      {/* Mirror of the cases-side transfer flow: pick the target dept,
          optional reason. Server clears assignedTo + internalReviewerId
          and resets currentStage to RECEIVED so the new dept owns the
          intake fresh. The choice is the dropdown only (so the user
          can't pick the same dept by accident); the active dept is
          excluded from the options list. */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تحويل العقد لقسم آخر</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              عند التحويل سيتم: إعادة المرحلة إلى "استلام" — مسح المحامي المسند —
              مسح المراجع الداخلي. هذا الإجراء غير قابل للتراجع المباشر.
            </div>
            <Label>القسم المستهدف</Label>
            <Select value={transferDeptId} onValueChange={setTransferDeptId}>
              <SelectTrigger data-testid="transfer-dept-select">
                <SelectValue placeholder="اختر القسم" />
              </SelectTrigger>
              <SelectContent>
                {departments
                  .filter((d) => !transferTarget || d.id !== transferTarget.departmentId)
                  .map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Label>سبب التحويل (اختياري)</Label>
            <Textarea
              data-testid="transfer-reason"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              rows={2}
              placeholder="اشرح سبب التحويل..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>إلغاء</Button>
            <Button
              data-testid="transfer-confirm"
              onClick={async () => {
                if (!transferTarget || !transferDeptId) return;
                await wrap(
                  () => updateContract(transferTarget.id, {
                    departmentId: transferDeptId,
                    ...(transferReason.trim() ? { transferReason: transferReason.trim() } : {}),
                  } as any),
                  "تم تحويل العقد للقسم الجديد",
                );
                setShowTransfer(false);
              }}
              disabled={!transferDeptId || busy}
            >تأكيد التحويل</Button>
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
