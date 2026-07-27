import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Plus, MessageSquare, CheckCircle, FileText, ClipboardCheck, Bell, MoreHorizontal, UserPlus, ArrowLeftRight, Trash2, ChevronLeft, ChevronRight, FileSymlink, XCircle, ExternalLink, AlertTriangle, Sparkles, Clock, ListChecks, Pause, Play, RotateCw, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConsultations } from "@/lib/consultations-context";
import { useFavorites } from "@/lib/favorites-context";
import { useClients } from "@/lib/clients-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import type {
  Consultation,
  ConsultationStageValue,
  ConsultationTypeValue,
  InternalReviewDecisionValue,
  CommitteeDecisionValue,
  NoteOutcomeValue,
  ConsultationClosureReasonValue,
  ConsultationCategoryValue,
  ConsultationPriorityValue,
  ConsultationDeliveryExtension,
  ConsultationActivity,
} from "@shared/schema";
import {
  ConsultationStage,
  ConsultationStageLabels,
  ConsultationStagesAll,
  ConsultationStagesOrder,
  ConsultationStagesOrderPhone,
  ConsultationStagesOrderProcedural,
  ConsultationType,
  ConsultationTypeLabels,
  ConsultationPriority,
  ConsultationPriorityLabels,
  resolveConsultationType,
  getConsultationStagesForType,
  isInFollowUpCycle,
  getStagesForConsultationCycle,
  InternalReviewDecision,
  CommitteeDecision,
  NoteOutcome,
  ConsultationClosureReason,
  ConsultationCategory,
  ConsultationCategoryLabels,
  ConsultationSource,
  ConsultationSourceLabels,
  ConsultationSourceValue,
  ConsultationActivityType,
  ConsultationActivityTypeLabels,
  CaseStage,
  CaseStageLabels,
  CaseStagesOrder,
} from "@shared/schema";
import { ConsultationStagesBar } from "@/components/consultation-stages-bar";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import {
  ConsultationsAdvancedFilters,
  EMPTY_CONSULTATIONS_FILTERS,
  type AdvancedConsultationsFilters,
} from "@/components/consultations-advanced-filters";
import { DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { sendConsultationReminder, requestConsultationTransfer } from "@/lib/notification-triggers";

// Lawyer-filter source: role-based exclusion. Wider than the
// canBeAssignedConsultations gate (used elsewhere on this page) because
// the filter must surface anyone who *has* consultations historically,
// not only those assignable going forward. Mirrors the cases-page
// LAWYER_FILTER_EXCLUDED_ROLES set.
const LAWYER_FILTER_EXCLUDED_ROLES = new Set([
  "branch_manager",
  "admin_support",
  "hr",
  "technical_support",
]);

// Per consultations-rebuild-spec.md §3.2.1 ALLOWED_CONSULTATION_TRANSITIONS.
// Only includes the linear forward steps that the generic /advance-stage
// endpoint serves. INTERNAL_REVIEW / COMMITTEE / TAKING_NOTES outcomes are
// decision-based and routed through the dedicated endpoints, so they're
// intentionally absent here — those dialogs land in subsequent commits.
type LinearAdvanceTable = Partial<Record<ConsultationStageValue, { target: ConsultationStageValue; roles: string[] }>>;

const LINEAR_ADVANCE_WRITTEN: LinearAdvanceTable = {
  // Phase-8 — RECEIVED now advances to RECEIVED_PENDING_COMPLETION (the new
  // stage), and RECEIVED_PENDING_COMPLETION advances to STUDY. The "تجاوز"
  // (skip) button on the new stage hits a separate /skip-completion
  // endpoint that lands on STUDY too but logs completion_skipped — same
  // target, different audit entry.
  [ConsultationStage.RECEIVED]:                    { target: ConsultationStage.RECEIVED_PENDING_COMPLETION, roles: ["admin_support", "department_head", "branch_manager"] },
  [ConsultationStage.RECEIVED_PENDING_COMPLETION]: { target: ConsultationStage.STUDY,                       roles: ["admin_support", "department_head", "branch_manager"] },
  [ConsultationStage.STUDY]:    { target: ConsultationStage.DRAFTING,        roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ConsultationStage.DRAFTING]: { target: ConsultationStage.INTERNAL_REVIEW, roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  // WRITTEN closes READY → CLOSED_FINAL directly (COMPLETED removed from
  // the WRITTEN flow). Mirrors ALLOWED_CONSULTATION_TRANSITIONS on the
  // server; admin-gated like the PHONE/PROCEDURAL final-closure step.
  [ConsultationStage.READY]:    { target: ConsultationStage.CLOSED_FINAL,    roles: ["admin_support", "branch_manager"] },
};

// Mirrors ALLOWED_CONSULTATION_TRANSITIONS_PHONE on the server. 1→2 is the
// assign action (rendered as the "إسناد" button, not "المرحلة التالية"),
// so the table starts at PENDING_COMPLETION.
const LINEAR_ADVANCE_PHONE: LinearAdvanceTable = {
  [ConsultationStage.RECEIVED]:                    { target: ConsultationStage.RECEIVED_PENDING_COMPLETION, roles: ["department_head", "branch_manager"] },
  [ConsultationStage.RECEIVED_PENDING_COMPLETION]: { target: ConsultationStage.STUDY,                       roles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  [ConsultationStage.STUDY]:                       { target: ConsultationStage.COMPLETED,                   roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ConsultationStage.COMPLETED]:                   { target: ConsultationStage.CLOSED_FINAL,                roles: ["admin_support", "branch_manager"] },
};

// Procedural — same as PHONE but stage 3 is IN_PROGRESS instead of STUDY.
const LINEAR_ADVANCE_PROCEDURAL: LinearAdvanceTable = {
  [ConsultationStage.RECEIVED]:                    { target: ConsultationStage.RECEIVED_PENDING_COMPLETION, roles: ["department_head", "branch_manager"] },
  [ConsultationStage.RECEIVED_PENDING_COMPLETION]: { target: ConsultationStage.IN_PROGRESS,                 roles: ["assigned_lawyer", "admin_support", "department_head", "branch_manager"] },
  [ConsultationStage.IN_PROGRESS]:                 { target: ConsultationStage.COMPLETED,                   roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ConsultationStage.COMPLETED]:                   { target: ConsultationStage.CLOSED_FINAL,                roles: ["admin_support", "branch_manager"] },
};

// Cycle linear-advance tables — mirror ALLOWED_CONSULTATION_CYCLE_TRANSITIONS*
// on the server. 2 forward steps per cycle (RECEIVED → working → CLOSED_FINAL).
// PHONE and PROCEDURAL share the same shape, so one table covers both.
const LINEAR_ADVANCE_CYCLE_WRITTEN: LinearAdvanceTable = {
  [ConsultationStage.RECEIVED]: { target: ConsultationStage.READY,        roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ConsultationStage.READY]:    { target: ConsultationStage.CLOSED_FINAL, roles: ["admin_support", "branch_manager"] },
};
const LINEAR_ADVANCE_CYCLE_PHONE_PROCEDURAL: LinearAdvanceTable = {
  [ConsultationStage.RECEIVED]:  { target: ConsultationStage.COMPLETED,    roles: ["assigned_lawyer", "department_head", "branch_manager"] },
  [ConsultationStage.COMPLETED]: { target: ConsultationStage.CLOSED_FINAL, roles: ["admin_support", "branch_manager"] },
};

function getLinearAdvanceTable(
  consultation: { consultationType?: string | null; followUpCount?: number | null; status?: string | null },
): LinearAdvanceTable {
  if (isInFollowUpCycle(consultation)) {
    const resolved = resolveConsultationType(consultation.consultationType);
    if (resolved === ConsultationType.PHONE || resolved === ConsultationType.PROCEDURAL) {
      return LINEAR_ADVANCE_CYCLE_PHONE_PROCEDURAL;
    }
    return LINEAR_ADVANCE_CYCLE_WRITTEN;
  }
  const resolved = resolveConsultationType(consultation.consultationType);
  if (resolved === ConsultationType.PHONE) return LINEAR_ADVANCE_PHONE;
  if (resolved === ConsultationType.PROCEDURAL) return LINEAR_ADVANCE_PROCEDURAL;
  return LINEAR_ADVANCE_WRITTEN;
}

function getAdvanceTarget(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): ConsultationStageValue | null {
  if (consultation.status !== "active") return null;
  // Phase-8 — awaiting-completion rows are NEVER advanced via the normal
  // mechanism (the resume action is what restores the saved stage).
  if (consultation.awaitingCompletion) return null;
  const rule = getLinearAdvanceTable(consultation)[consultation.currentStage];
  if (!rule) return null;
  // Department head can only act inside their own department
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return null;
  const isAssignedLawyer = !!consultation.assignedTo && consultation.assignedTo === userId;
  const effectiveRoles = isAssignedLawyer ? [userRole, "assigned_lawyer"] : [userRole];
  if (!effectiveRoles.some(r => rule.roles.includes(r))) return null;
  return rule.target;
}

// Mirrors the consultation-rollback block in server/routes.ts
// validateStageTransition: dept_head / branch_manager → any prior stage,
// assigned_lawyer → one step back. Picks the per-type stages list (phone
// / procedural have their own 5-stage lists); WRITTEN swaps in
// ConsultationStagesAll when currently in TAKING_NOTES so the conditional
// stage is reachable for rollback.
function getReturnTargets(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): ConsultationStageValue[] {
  if (consultation.status !== "active") return [];
  // Phase-8 — awaiting-completion rows are parked: hide return like advance.
  if (consultation.awaitingCompletion) return [];
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return [];
  const resolvedType = resolveConsultationType(consultation.consultationType);
  let stages: readonly ConsultationStageValue[];
  if (isInFollowUpCycle(consultation)) {
    // Cycle uses its own 3-stage list; the same 1-step-back rule applies.
    stages = getStagesForConsultationCycle(consultation);
  } else if (resolvedType === ConsultationType.WRITTEN) {
    stages = consultation.currentStage === ConsultationStage.TAKING_NOTES
      ? ConsultationStagesAll
      : ConsultationStagesOrder;
  } else {
    stages = getConsultationStagesForType(resolvedType);
  }
  const currentIdx = stages.indexOf(consultation.currentStage);
  if (currentIdx <= 0) return [];
  const isHeadOrManager = userRole === "department_head" || userRole === "branch_manager";
  if (isHeadOrManager) return [...stages.slice(0, currentIdx)];
  const isAssignedLawyer = !!consultation.assignedTo && consultation.assignedTo === userId;
  if (isAssignedLawyer) return [stages[currentIdx - 1]];
  return [];
}

// Mirrors the role gate on POST /api/consultations/:id/internal-review.
// The endpoint accepts assigned_lawyer (synthetic) plus a base set of
// lawyer-class roles. Department head is additionally scoped to their
// own department here, which the endpoint also enforces via
// validateStageTransition.
function canDoInternalReview(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage !== ConsultationStage.INTERNAL_REVIEW) return false;
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return false;
  // Phase 5 B/M1 (four-eyes) — the assigned (answering) lawyer cannot clear
  // their own consultation's internal review; a different reviewer must.
  // Mirrors the server gate on POST /api/consultations/:id/internal-review.
  if (consultation.assignedTo && consultation.assignedTo === userId) return false;
  const baseRoles = ["employee", "department_head", "cases_review_head", "consultations_review_head", "branch_manager"];
  return baseRoles.includes(userRole);
}

// Mirrors the role gate on POST /api/consultations/:id/committee-decision.
// Committee outcomes are restricted to the consultations review head and
// the branch manager — narrower than internal-review by design.
function canDoCommitteeDecision(
  consultation: Consultation,
  userRole: string,
  isLaborEntity: boolean,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage !== ConsultationStage.COMMITTEE) return false;
  return userRole === "branch_manager" ||
    userRole === (isLaborEntity ? "labor_review_head" : "consultations_review_head");
}

// Reasoned override — "تجاوز لجنة المراجعة". Gate for the button that calls
// POST /api/consultations/:id/skip-committee. Mirrors the SERVER's rule EXACTLY
// so visibility === authorization (no button that 403s):
//   status active, not paused / awaiting-completion, stage === لجنة_مراجعة,
//   type resolves to WRITTEN, AND branch_manager | department_head of the
//   consultation's own dept | the assigned lawyer.
// The WRITTEN check is REQUIRED (not belt-and-braces cosmetics): جاهزة_للإرسال
// does not exist on the phone/procedural stage arrays, so offering the skip on a
// stranded non-written row would move it off its own path — the cases-side
// in-court bug (193649a). resolveConsultationType matches how the server
// resolves the workflow, so legacy free-text types behave identically here.
// NOTE the actor set is intentionally WIDER than canDoCommitteeDecision
// (consultations_review_head / branch_manager) — a skip is an owner-approved
// override, not a committee ruling. See the endpoint comment before merging them.
function canSkipCommittee(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.pausedAt || consultation.awaitingCompletion) return false;
  if (consultation.currentStage !== ConsultationStage.COMMITTEE) return false;
  if (resolveConsultationType(consultation.consultationType) !== ConsultationType.WRITTEN) return false;
  if (userRole === "branch_manager") return true;
  if (userRole === "department_head") return consultation.departmentId === userDeptId;
  return !!consultation.assignedTo && consultation.assignedTo === userId;
}

// Mirrors the role gate on POST /api/consultations/:id/take-notes-outcome.
// Recording the outcome is the assigned lawyer's job; dept_head and
// branch_manager can also record on their behalf. Dept-scope check
// applied for dept_head.
function canDoTakeNotesOutcome(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage !== ConsultationStage.TAKING_NOTES) return false;
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return false;
  if (userRole === "department_head" || userRole === "branch_manager") return true;
  return !!consultation.assignedTo && consultation.assignedTo === userId;
}

// Mirrors the role gate on POST /api/consultations/:id/convert-to-case.
// Per spec §3.2.3 / §3.2.4: admin_support, department_head, branch_manager.
// Dept_head additionally scoped to their own department here. The endpoint
// also rejects non-active or COMPLETED consultations; we mirror that here
// so the dropdown doesn't show a doomed action.
function canConvertToCase(
  consultation: Consultation,
  userRole: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage === ConsultationStage.COMPLETED) return false;
  // Mirror the server guard: a follow-up cycle isn't convertible (the
  // original consultation is already done; cycles are post-closure
  // follow-ups, not new-case material).
  if ((consultation.followUpCount ?? 0) > 0) return false;
  if (userRole === "branch_manager" || userRole === "admin_support") return true;
  if (userRole === "department_head" && consultation.departmentId === userDeptId) return true;
  return false;
}

// Arabic display labels for ConsultationClosureReason. Schema keeps the
// enum values in English keys per spec §3.2.4 ("Frontend will localise
// the labels"), so the mapping lives here at the page boundary.
const ConsultationClosureReasonLabels: Record<ConsultationClosureReasonValue, string> = {
  client_cancelled:  "إلغاء العميل",
  answered_verbally: "تم الرد شفهياً",
  duplicate:         "استشارة مكررة",
  no_longer_needed:  "لم تعد مطلوبة",
  other:             "أخرى",
};

// Arabic display labels for the simplified active/paused/converted/closed
// status enum. Schema entries are English keys post-rebuild; we localise
// at the page boundary the same way as ClosureReason.
const ConsultationStatusDisplayLabels: Record<"active" | "paused" | "converted" | "closed", string> = {
  active:    "نشطة",
  paused:    "معلّقة",
  converted: "محولة لقضية",
  closed:    "مقفلة",
};

// Per-stage badge colour palette, aligned with the cases page table:
// study/drafting/review/committee/notes/ready/closed slots match the
// case-side getStageColor so the two tables read consistently.
function getStageBadgeColor(stage: ConsultationStageValue): string {
  switch (stage) {
    case ConsultationStage.RECEIVED:
      return "bg-primary/20 text-primary border-primary/30";
    case ConsultationStage.STUDY:
    case ConsultationStage.IN_PROGRESS:
      return "bg-accent/20 text-accent border-accent/30";
    case ConsultationStage.DRAFTING:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case ConsultationStage.INTERNAL_REVIEW:
      return "bg-indigo-500/20 text-indigo-600 border-indigo-500/30";
    case ConsultationStage.COMMITTEE:
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    case ConsultationStage.TAKING_NOTES:
      return "bg-destructive/20 text-destructive border-destructive/30";
    case ConsultationStage.READY:
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case ConsultationStage.COMPLETED:
    case ConsultationStage.CLOSED_FINAL:
      return "bg-muted text-muted-foreground border-muted";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// Virtual stage grouping. Lifecycle states (paused / closed / converted)
// remap to specific stages so the filter axis stays purely stage-based:
//   paused    → استكمال_المرفقات_والبيانات (parked, awaiting data)
//   closed    → منجزة (terminal — done)
//   converted → منجزة (terminal — handed off to a case)
//   active    → currentStage (the consultation's actual position)
// The details-dialog stages bar still uses the literal currentStage
// — virtualization is for filtering and the table badge only.
function getConsultationDisplayStage(c: Consultation): ConsultationStageValue {
  if (c.status === "paused") return ConsultationStage.RECEIVED_PENDING_COMPLETION;
  if (c.status === "closed" || c.status === "converted") return ConsultationStage.COMPLETED;
  return c.currentStage;
}

function getConsultationDisplayBadge(c: Consultation): { label: string; className: string } {
  const stage = getConsultationDisplayStage(c);
  return {
    label: ConsultationStageLabels[stage] || stage,
    className: getStageBadgeColor(stage),
  };
}

// Priority-group sort, mirroring the cases page. Surface rows that need
// attention; sink terminated rows. Type-aware because each workflow
// (WRITTEN / PHONE / PROCEDURAL) has its own action-required stage set.
//   1 = unassigned (no assigned lawyer)
//   2 = action required from us (study / drafting / review / awaiting closure)
//   3 = waiting on external (paused or awaiting-completion)
//   4 = terminated (closed/converted/CLOSED_FINAL/WRITTEN-COMPLETED-via-status)
// Within each group rows order by updatedAt DESC.
const ACTION_REQUIRED_CONSULTATION_STAGES_WRITTEN = new Set<ConsultationStageValue>([
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.STUDY,
  ConsultationStage.DRAFTING,
  ConsultationStage.INTERNAL_REVIEW,
  ConsultationStage.COMMITTEE,
  ConsultationStage.TAKING_NOTES,
  ConsultationStage.READY,
]);
const ACTION_REQUIRED_CONSULTATION_STAGES_PHONE = new Set<ConsultationStageValue>([
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.STUDY,
  ConsultationStage.COMPLETED,
]);
const ACTION_REQUIRED_CONSULTATION_STAGES_PROCEDURAL = new Set<ConsultationStageValue>([
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  ConsultationStage.IN_PROGRESS,
  ConsultationStage.COMPLETED,
]);

function getConsultationPriorityGroup(c: Consultation): 1 | 2 | 3 | 4 {
  const resolvedType = resolveConsultationType(c.consultationType);
  // Terminal first — overrides everything (including unassigned).
  if (c.status === "closed" || c.status === "converted") return 4;
  // CLOSED_FINAL is the terminal stage for ALL types now, including
  // WRITTEN (it goes READY → CLOSED_FINAL directly — COMPLETED was
  // removed from the WRITTEN flow, so the old WRITTEN+COMPLETED terminal
  // branch is gone). COMPLETED is a non-terminal working stage for
  // PHONE/PROCEDURAL only and is handled by the action-required sets.
  if (c.currentStage === ConsultationStage.CLOSED_FINAL) return 4;
  if (!c.assignedTo) return 1;
  if (c.status === "paused" || c.pausedAt || c.awaitingCompletion) return 3;
  const actionSet =
    resolvedType === ConsultationType.PHONE
      ? ACTION_REQUIRED_CONSULTATION_STAGES_PHONE
      : resolvedType === ConsultationType.PROCEDURAL
        ? ACTION_REQUIRED_CONSULTATION_STAGES_PROCEDURAL
        : ACTION_REQUIRED_CONSULTATION_STAGES_WRITTEN;
  if (c.currentStage && actionSet.has(c.currentStage)) return 2;
  return 3;
}

// Phase-8 — pause permission gate. Mirrors the server check in
// /api/consultations/:id/pause and /unpause. Narrower than
// canModifyConsultation: branch_manager / admin_support / dept_head
// (own dept) / assigned lawyer of the specific consultation.
function canPauseConsultation(
  c: Consultation,
  user: { id: string; role: string; departmentId: string | null } | null,
): boolean {
  if (!user) return false;
  if (user.role === "branch_manager" || user.role === "admin_support") return true;
  if (user.role === "department_head" && c.departmentId === user.departmentId) return true;
  return c.assignedTo === user.id;
}

// Phase-4 SLA helpers — overdue is "active consultation whose
// expectedDeliveryDate has already passed". Closed/converted rows never
// count as overdue (the SLA only matters while we're working the file).
function isConsultationOverdue(c: Consultation, now: number = Date.now()): boolean {
  if (c.status !== "active") return false;
  if (!c.expectedDeliveryDate) return false;
  const due = new Date(c.expectedDeliveryDate).getTime();
  if (Number.isNaN(due)) return false;
  return now > due;
}

// Render the expectedDeliveryDate as a short, locale-agnostic ISO date
// (YYYY-MM-DD). The DB stores a timestamp but the SLA precision the user
// cares about is days, and the page already shows other dates this way.
function formatExpectedDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

// Per-category badge palette. Quick = amber (urgent), standard = neutral,
// long = blue (low-pressure). Keeps the table readable at a glance without
// fighting the existing stage badge.
function getCategoryBadgeClassName(category: ConsultationCategoryValue): string {
  switch (category) {
    case ConsultationCategory.QUICK:
      return "bg-amber-500/20 text-amber-700 border-amber-500/30";
    case ConsultationCategory.LONG:
      return "bg-blue-500/15 text-blue-700 border-blue-500/30";
    case ConsultationCategory.STANDARD:
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

// Mirrors the role gate on POST /api/consultations/:id/early-close.
// Per spec §3.2.4: assigned_lawyer (synthetic), admin_support,
// department_head, branch_manager. Dept_head dept-scoped.
function canEarlyClose(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (userRole === "department_head" && consultation.departmentId !== userDeptId) return false;
  if (userRole === "branch_manager" || userRole === "admin_support") return true;
  if (userRole === "department_head") return true;
  return !!consultation.assignedTo && consultation.assignedTo === userId;
}

// FE permission gate mirroring POST /api/consultations/:id/start-follow-up.
// Admin-only by design — opening a new cycle is an administrative action,
// matching the gating on the WRITTEN closure step.
function canStartFollowUp(
  consultation: Consultation,
  userRole: string,
): boolean {
  if (consultation.status !== "closed") return false;
  return userRole === "admin_support" || userRole === "branch_manager";
}

// Mirrors the role gate on PATCH /api/consultations/:id for the
// consultationType field: branch_manager / admin_support /
// department_head (own dept). The PATCH endpoint silently drops the
// field for any other actor, but the UI hides the picker entirely so
// those actors don't see a control they can't actually use.
function canChangeConsultationType(
  consultation: Consultation,
  userRole: string,
  userDeptId: string | null,
): boolean {
  if (userRole === "branch_manager" || userRole === "admin_support") return true;
  if (userRole === "department_head" && consultation.departmentId === userDeptId) return true;
  return false;
}

// Phase-6 — activity-type → icon component map. Kept inline for now
// (consultations-only); promote to a shared helper if cases-side ever
// adopts the same icon set.
function getActivityIcon(activityType: string) {
  switch (activityType) {
    case ConsultationActivityType.CREATED:            return Sparkles;
    case ConsultationActivityType.ASSIGNED:           return UserPlus;
    case ConsultationActivityType.STAGE_ADVANCED:     return ChevronLeft;
    case ConsultationActivityType.STAGE_RETURNED:     return ChevronRight;
    case ConsultationActivityType.INTERNAL_REVIEW:    return ClipboardCheck;
    case ConsultationActivityType.COMMITTEE_DECISION: return CheckCircle;
    case ConsultationActivityType.COMMITTEE_SKIPPED:  return AlertTriangle;
    case ConsultationActivityType.TAKE_NOTES_OUTCOME: return ListChecks;
    case ConsultationActivityType.DELIVERY_EXTENDED:  return AlertTriangle;
    case ConsultationActivityType.CONVERTED_TO_CASE:  return FileSymlink;
    case ConsultationActivityType.EARLY_CLOSED:       return XCircle;
    case ConsultationActivityType.GENERAL_NOTE:       return MessageSquare;
    case ConsultationActivityType.TYPE_CHANGED:       return ArrowLeftRight;
    case ConsultationActivityType.FOLLOW_UP_STARTED:  return RotateCw;
    default: return Clock;
  }
}

// Returns Arabic relative time for the activity-log timestamp. Today
// → "اليوم HH:MM"; yesterday → "أمس HH:MM"; older → ISO date. Times
// are local because the backend serialises with toISOString() but the
// user reads against their wall clock.
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

interface ConsultationActivityTimelineProps {
  activities: ConsultationActivity[];
  expanded: boolean;
  onToggle: () => void;
  getUserName: (id: string | null | undefined) => string;
}

function ConsultationActivityTimeline({
  activities,
  expanded,
  onToggle,
  getUserName,
}: ConsultationActivityTimelineProps) {
  return (
    <div className="text-right border rounded-lg p-3 bg-muted/20" data-testid="consultation-activity-log">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium w-full text-right"
        onClick={onToggle}
        data-testid="button-toggle-activity-log"
      >
        <span>سجل النشاط ({activities.length})</span>
        <ChevronLeft
          className={
            "w-4 h-4 transition-transform " +
            (expanded ? "-rotate-90" : "")
          }
        />
      </button>
      {expanded && (
        <ul className="mt-3 space-y-3" data-testid="list-consultation-activities">
          {activities.length === 0 && (
            <li className="text-xs text-muted-foreground py-2">لا يوجد نشاط بعد</li>
          )}
          {activities.map((a) => {
            const Icon = getActivityIcon(a.activityType);
            const typeLabel = (ConsultationActivityTypeLabels as Record<string, string>)[a.activityType] || a.activityType;
            // Issue-1 — early_closed rows stored the raw English reason
            // token inside `description` (the server never localised it).
            // Rebuild the line from metadata.reason via the FE label map
            // so existing rows render Arabic; fall back to the stored
            // description when metadata is missing/unknown.
            let displayDescription = a.description;
            if (a.activityType === ConsultationActivityType.EARLY_CLOSED) {
              const rawReason = String(a.metadata?.reason ?? "");
              const reasonLabel = (ConsultationClosureReasonLabels as Record<string, string>)[rawReason];
              if (reasonLabel) {
                const otherText = String(a.metadata?.closureReasonOther ?? "").trim();
                displayDescription = otherText
                  ? `إغلاق مبكر: ${reasonLabel} - ${otherText}`
                  : `إغلاق مبكر: ${reasonLabel}`;
              }
            }
            return (
              <li
                key={a.id}
                className="flex items-start gap-3 border-r-2 border-primary/40 pr-3 py-1"
                data-testid={`activity-${a.id}`}
              >
                <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">{typeLabel}</div>
                  <div className="text-sm font-medium break-words">
                    <BidiText>{displayDescription}</BidiText>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    بواسطة <BidiText>{getUserName(a.performedBy)}</BidiText>
                    {" • "}
                    <LtrInline>{formatActivityTime(a.performedAt)}</LtrInline>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ConsultationsPage() {
  const {
    consultations,
    addConsultation,
    updateConsultation,
    deleteConsultation,
    refreshConsultations,
  } = useConsultations();
  const { getClientName } = useClients();
  const { departments, getDepartmentName } = useDepartments();
  const { user, permissions, users } = useAuth();
  const { addRecentVisit } = useFavorites();
  const { toast } = useToast();


  // Resolves an assigned-lawyer id to a display name. Mirrors the
  // memos/teams-page pattern. Returns "—" when null/unknown so callers
  // don't have to repeat the fallback.
  const getLawyerName = (id: string | null | undefined): string => {
    if (!id) return "—";
    return users.find((u) => u.id === id)?.name || "—";
  };

  const [, setLocation] = useLocation();
  const [advFilters, setAdvFilters] = useState<AdvancedConsultationsFilters>(EMPTY_CONSULTATIONS_FILTERS);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Cross-module deep-link: /consultations?openConsultation=<id> opens the
  // detail dialog for that consultation. Used by the "أُنشئت من استشارة"
  // back-link on the cases-page detail dialog. Read once on mount; the
  // second effect below waits for the consultation to land in the loaded
  // list and then opens the dialog. Param is stripped from the URL so a
  // refresh doesn't re-open the same dialog.
  const [pendingOpenConsId, setPendingOpenConsId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("openConsultation");
    if (id) {
      setPendingOpenConsId(id);
      const url = new URL(window.location.href);
      url.searchParams.delete("openConsultation");
      window.history.replaceState({}, "", url);
    }
    // Phase-9.3 — dashboard "بانتظار المراجعة" deep-link. Pre-selects
    // the COMMITTEE stage and (for non-manager roles) scopes by dept
    // or assigned lawyer so the page contents match the dashboard
    // count. Single-shot on mount; the URL is left intact so a refresh
    // re-applies the filter.
    const status = params.get("status");
    const dept = params.get("dept");
    const assignedTo = params.get("assignedTo");
    if (status === "pending_review" || dept || assignedTo) {
      setAdvFilters((prev) => ({
        ...prev,
        stages: status === "pending_review" ? [ConsultationStage.COMMITTEE] : prev.stages,
        departmentId: dept || prev.departmentId,
        lawyers: assignedTo ? [assignedTo] : prev.lawyers,
      }));
    }
  }, []);

  // Quick-bar stale-stage prune. When the type filter narrows the
  // allowed stage set (e.g. switching to هاتفية, which has no
  // لجنة_مراجعة), drop any selected stages that are no longer valid so
  // an invisible filter doesn't keep constraining results. Mirrors the
  // advanced-filter prune effect in consultations-advanced-filters.tsx.
  useEffect(() => {
    const allowed = new Set<string>(
      advFilters.consultationTypes.length === 1
        ? getConsultationStagesForType(advFilters.consultationTypes[0] as ConsultationTypeValue)
        : [
            ...ConsultationStagesAll,
            ConsultationStage.IN_PROGRESS,
            ConsultationStage.CLOSED_FINAL,
          ],
    );
    if (advFilters.stages.some((s) => !allowed.has(s))) {
      setAdvFilters((prev) => ({
        ...prev,
        stages: prev.stages.filter((s) => allowed.has(s)),
      }));
    }
  }, [advFilters.consultationTypes, advFilters.stages]);

  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignConsultationId, setAssignConsultationId] = useState<string | null>(null);
  const [assignData, setAssignData] = useState({ lawyerId: "", departmentId: "" });

  const [actionInProgress, setActionInProgress] = useState(false);

  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [advanceConsultation, setAdvanceConsultation] = useState<Consultation | null>(null);
  // Reviewer chosen when advancing INTO internal review (defaults to the one
  // already designated on the consultation). Mirrors the case progress bar.
  const [advanceReviewerId, setAdvanceReviewerId] = useState("");

  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnConsultation, setReturnConsultation] = useState<Consultation | null>(null);
  const [returnTargetStage, setReturnTargetStage] = useState<string>("");

  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderConsultation, setReminderConsultation] = useState<Consultation | null>(null);
  const [reminderData, setReminderData] = useState({
    reminderType: "تذكير بتحديث الحالة",
    message: "",
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [consultationToDelete, setConsultationToDelete] = useState<Consultation | null>(null);

  const [showInternalReviewDialog, setShowInternalReviewDialog] = useState(false);
  const [internalReviewConsultation, setInternalReviewConsultation] = useState<Consultation | null>(null);
  const [internalReviewNotes, setInternalReviewNotes] = useState("");

  const [showCommitteeDialog, setShowCommitteeDialog] = useState(false);
  const [committeeConsultation, setCommitteeConsultation] = useState<Consultation | null>(null);
  const [committeeNotes, setCommitteeNotes] = useState("");

  // Reasoned override — "تجاوز لجنة المراجعة" (skip straight to جاهزة_للإرسال).
  // Its own dialog, deliberately NOT folded into the committee-decision dialog:
  // different actors, different meaning, and the reason is MANDATORY here.
  const [showSkipCommitteeDialog, setShowSkipCommitteeDialog] = useState(false);
  const [skipCommitteeConsultation, setSkipCommitteeConsultation] = useState<Consultation | null>(null);
  const [skipCommitteeReason, setSkipCommitteeReason] = useState("");

  const [showTakeNotesDialog, setShowTakeNotesDialog] = useState(false);
  const [takeNotesConsultation, setTakeNotesConsultation] = useState<Consultation | null>(null);
  const [takeNotesNotes, setTakeNotesNotes] = useState("");

  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertConsultation, setConvertConsultation] = useState<Consultation | null>(null);
  const [convertData, setConvertData] = useState<{ targetCaseStage: string; caseDepartmentId: string }>({
    targetCaseStage: CaseStage.RECEPTION,
    caseDepartmentId: "",
  });

  const [showEarlyCloseDialog, setShowEarlyCloseDialog] = useState(false);
  const [earlyCloseConsultation, setEarlyCloseConsultation] = useState<Consultation | null>(null);
  const [earlyCloseReason, setEarlyCloseReason] = useState<ConsultationClosureReasonValue | "">("");
  const [earlyCloseOtherText, setEarlyCloseOtherText] = useState("");
  const [earlyCloseNotes, setEarlyCloseNotes] = useState("");

  // Start-follow-up dialog. Mirrors the pause dialog shape: AlertDialog
  // with a required Textarea (the customer's new question). The textarea
  // content is sent to /start-follow-up and stored in the activity-log
  // metadata of the FOLLOW_UP_STARTED entry — no new DB column.
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<Consultation | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState("");

  // Phase-5 — extend-delivery dialog + history list state. extensions are
  // fetched once when the details dialog opens (see useEffect below);
  // refreshed after a successful extension so the list reflects the new
  // entry without a full consultations refresh.
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extendConsultation, setExtendConsultation] = useState<Consultation | null>(null);
  const [extendNewDate, setExtendNewDate] = useState<string>("");
  const [extendReason, setExtendReason] = useState<string>("");
  const [deliveryExtensions, setDeliveryExtensions] = useState<ConsultationDeliveryExtension[]>([]);
  const [extensionsExpanded, setExtensionsExpanded] = useState(false);

  // Phase-6 — consultation activity log. Fetched when the details dialog
  // opens and re-fetched after any workflow mutation that updates the
  // consultation row, so the timeline always reflects the latest state.
  const [activityLog, setActivityLog] = useState<ConsultationActivity[]>([]);
  // Default collapsed — the dialog body grows long once a consultation
  // accumulates activity, and the list isn't usually the user's
  // primary read on dialog open. Click the header chevron to expand.
  const [activityLogExpanded, setActivityLogExpanded] = useState(false);

  // Phase-8 — pause / unpause dialog state. Two separate dialogs because
  // the entry vs exit forms differ (reason required on pause, optional
  // notes on unpause).
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<Consultation | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [showUnpauseDialog, setShowUnpauseDialog] = useState(false);
  const [unpauseTarget, setUnpauseTarget] = useState<Consultation | null>(null);
  const [unpauseNotes, setUnpauseNotes] = useState("");

  const openPauseDialog = (c: Consultation) => {
    setPauseTarget(c);
    setPauseReason("");
    setShowPauseDialog(true);
  };
  const closePauseDialog = () => {
    setShowPauseDialog(false);
    setPauseTarget(null);
    setPauseReason("");
  };
  const openUnpauseDialog = (c: Consultation) => {
    setUnpauseTarget(c);
    setUnpauseNotes("");
    setShowUnpauseDialog(true);
  };
  const closeUnpauseDialog = () => {
    setShowUnpauseDialog(false);
    setUnpauseTarget(null);
    setUnpauseNotes("");
  };

  const handlePause = async () => {
    if (!pauseTarget) return;
    const reason = pauseReason.trim();
    if (!reason) {
      toast({ title: "أدخل سبب التعليق", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${pauseTarget.id}/pause`, { reason });
      await refreshConsultations();
      toast({ title: "تم تعليق الاستشارة" });
      closePauseDialog();
    } catch (err) {
      toast({ title: "فشل التعليق", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleUnpause = async () => {
    if (!unpauseTarget) return;
    setActionInProgress(true);
    try {
      const body: Record<string, string> = {};
      const notes = unpauseNotes.trim();
      if (notes) body.notes = notes;
      await apiRequest("POST", `/api/consultations/${unpauseTarget.id}/unpause`, body);
      await refreshConsultations();
      toast({ title: "تم إلغاء التعليق" });
      closeUnpauseDialog();
    } catch (err) {
      toast({ title: "فشل إلغاء التعليق", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  // Phase-8 — await-completion / resume / skip dialog state. Same
  // permission gate as pause (canPauseConsultation).
  const [showAwaitDialog, setShowAwaitDialog] = useState(false);
  const [awaitTarget, setAwaitTarget] = useState<Consultation | null>(null);
  const [awaitReason, setAwaitReason] = useState("");
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<Consultation | null>(null);
  const [resumeNotes, setResumeNotes] = useState("");
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipTarget, setSkipTarget] = useState<Consultation | null>(null);

  const openAwaitDialog = (c: Consultation) => {
    setAwaitTarget(c);
    setAwaitReason("");
    setShowAwaitDialog(true);
  };
  const closeAwaitDialog = () => {
    setShowAwaitDialog(false);
    setAwaitTarget(null);
    setAwaitReason("");
  };
  const openResumeDialog = (c: Consultation) => {
    setResumeTarget(c);
    setResumeNotes("");
    setShowResumeDialog(true);
  };
  const closeResumeDialog = () => {
    setShowResumeDialog(false);
    setResumeTarget(null);
    setResumeNotes("");
  };
  const openSkipDialog = (c: Consultation) => {
    setSkipTarget(c);
    setShowSkipDialog(true);
  };
  const closeSkipDialog = () => {
    setShowSkipDialog(false);
    setSkipTarget(null);
  };

  const handleAwaitCompletion = async () => {
    if (!awaitTarget) return;
    const reason = awaitReason.trim();
    if (!reason) {
      toast({ title: "أدخل السبب", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${awaitTarget.id}/await-completion`, { reason });
      await refreshConsultations();
      toast({ title: "تم الانتقال إلى مرحلة الاستكمال" });
      closeAwaitDialog();
    } catch (err) {
      toast({ title: "فشل الإجراء", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleResumeFromCompletion = async () => {
    if (!resumeTarget) return;
    setActionInProgress(true);
    try {
      const body: Record<string, string> = {};
      const notes = resumeNotes.trim();
      if (notes) body.notes = notes;
      await apiRequest("POST", `/api/consultations/${resumeTarget.id}/resume-from-completion`, body);
      await refreshConsultations();
      toast({ title: "تم العودة من الاستكمال" });
      closeResumeDialog();
    } catch (err) {
      toast({ title: "فشل الإجراء", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleSkipCompletion = async () => {
    if (!skipTarget) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${skipTarget.id}/skip-completion`, {});
      await refreshConsultations();
      toast({ title: "تم تجاوز مرحلة الاستكمال" });
      closeSkipDialog();
    } catch (err) {
      toast({ title: "فشل الإجراء", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

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

  const openInternalReviewDialog = (c: Consultation) => {
    setInternalReviewConsultation(c);
    setInternalReviewNotes("");
    setShowInternalReviewDialog(true);
  };

  const closeInternalReviewDialog = () => {
    setShowInternalReviewDialog(false);
    setInternalReviewConsultation(null);
    setInternalReviewNotes("");
  };

  const handleInternalReview = async (decision: InternalReviewDecisionValue) => {
    if (!internalReviewConsultation) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${internalReviewConsultation.id}/internal-review`, {
        decision,
        notes: internalReviewNotes,
      });
      await refreshConsultations();
      const msg = decision === InternalReviewDecision.PASSED
        ? "تمت المراجعة الداخلية — أُحيلت للجنة"
        : "تم تسجيل ملاحظات المراجعة الداخلية";
      toast({ title: msg });
      closeInternalReviewDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل المراجعة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openCommitteeDialog = (c: Consultation) => {
    setCommitteeConsultation(c);
    setCommitteeNotes("");
    setShowCommitteeDialog(true);
  };

  const closeCommitteeDialog = () => {
    setShowCommitteeDialog(false);
    setCommitteeConsultation(null);
    setCommitteeNotes("");
  };

  const handleCommitteeDecision = async (decision: CommitteeDecisionValue) => {
    if (!committeeConsultation) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${committeeConsultation.id}/committee-decision`, {
        decision,
        notes: committeeNotes,
      });
      await refreshConsultations();
      const msg = decision === CommitteeDecision.APPROVED
        ? "تم اعتماد الاستشارة — جاهزة للتسليم"
        : "تم إرسال الاستشارة للأخذ بالملاحظات";
      toast({ title: msg });
      closeCommitteeDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل قرار اللجنة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openSkipCommitteeDialog = (c: Consultation) => {
    setSkipCommitteeConsultation(c);
    setSkipCommitteeReason("");
    setShowSkipCommitteeDialog(true);
  };

  const closeSkipCommitteeDialog = () => {
    setShowSkipCommitteeDialog(false);
    setSkipCommitteeConsultation(null);
    setSkipCommitteeReason("");
  };

  // The reason is MANDATORY (the server 400s without it), so the confirm button
  // stays disabled until something is typed.
  const handleSkipCommittee = async () => {
    if (!skipCommitteeConsultation) return;
    const reason = skipCommitteeReason.trim();
    if (!reason) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${skipCommitteeConsultation.id}/skip-committee`, { reason });
      await refreshConsultations();
      toast({ title: "تم تجاوز لجنة المراجعة — الاستشارة جاهزة للإرسال" });
      closeSkipCommitteeDialog();
    } catch (err) {
      toast({ title: "فشل تجاوز لجنة المراجعة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openTakeNotesDialog = (c: Consultation) => {
    setTakeNotesConsultation(c);
    setTakeNotesNotes("");
    setShowTakeNotesDialog(true);
  };

  const closeTakeNotesDialog = () => {
    setShowTakeNotesDialog(false);
    setTakeNotesConsultation(null);
    setTakeNotesNotes("");
  };

  const handleTakeNotesOutcome = async (outcome: NoteOutcomeValue) => {
    if (!takeNotesConsultation) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${takeNotesConsultation.id}/take-notes-outcome`, {
        outcome,
        notes: takeNotesNotes,
      });
      await refreshConsultations();
      // All outcomes advance to READY per spec — outcome distinction
      // is recorded but not reflected in routing.
      toast({ title: "تم تسجيل النتيجة — الاستشارة جاهزة للتسليم" });
      closeTakeNotesDialog();
    } catch (err) {
      toast({ title: "فشل تسجيل النتيجة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReturnConsultationToCommittee = async () => {
    if (!takeNotesConsultation) return;
    if (!takeNotesNotes.trim()) {
      toast({ title: "الملاحظات مطلوبة", description: "اشرح ما تم تطبيقه أو سبب الإعادة", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${takeNotesConsultation.id}/return-to-committee`, {
        notes: takeNotesNotes.trim(),
      });
      await refreshConsultations();
      toast({ title: "تم إعادة الاستشارة للجنة المراجعة" });
      closeTakeNotesDialog();
    } catch (err) {
      toast({ title: "فشل إعادة الاستشارة للجنة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openConvertDialog = (c: Consultation) => {
    setConvertConsultation(c);
    setConvertData({
      targetCaseStage: CaseStage.RECEPTION,
      caseDepartmentId: c.departmentId || "",
    });
    setShowConvertDialog(true);
  };

  const closeConvertDialog = () => {
    setShowConvertDialog(false);
    setConvertConsultation(null);
    setConvertData({ targetCaseStage: CaseStage.RECEPTION, caseDepartmentId: "" });
  };

  const handleConvertToCase = async () => {
    if (!convertConsultation) return;
    // Client-side body validation per spec: targetCaseStage and
    // caseDepartmentId are both required by the endpoint.
    if (!convertData.targetCaseStage) {
      toast({ title: "اختر مرحلة بداية القضية", variant: "destructive" });
      return;
    }
    if (!convertData.caseDepartmentId) {
      toast({ title: "اختر قسم القضية", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${convertConsultation.id}/convert-to-case`, {
        targetCaseStage: convertData.targetCaseStage,
        caseDepartmentId: convertData.caseDepartmentId,
      });
      await refreshConsultations();
      toast({
        title: "تم تحويل الاستشارة لقضية",
        description: "تم إنشاء القضية وتحديث حالة الاستشارة إلى \"محولة\".",
      });
      closeConvertDialog();
    } catch (err) {
      toast({ title: "فشل تحويل الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openEarlyCloseDialog = (c: Consultation) => {
    setEarlyCloseConsultation(c);
    setEarlyCloseReason("");
    setEarlyCloseOtherText("");
    setEarlyCloseNotes("");
    setShowEarlyCloseDialog(true);
  };

  const closeEarlyCloseDialog = () => {
    setShowEarlyCloseDialog(false);
    setEarlyCloseConsultation(null);
    setEarlyCloseReason("");
    setEarlyCloseOtherText("");
    setEarlyCloseNotes("");
  };

  // Phase-5: matches the server gate on POST /extend-delivery —
  // department_head (own dept) and branch_manager only.
  const canExtendDelivery = (c: Consultation): boolean => {
    if (!user) return false;
    if (c.status !== "active") return false;
    if (user.role === "branch_manager") return true;
    if (user.role === "department_head" && c.departmentId === user.departmentId) return true;
    return false;
  };

  const openExtendDialog = (c: Consultation) => {
    setExtendConsultation(c);
    // Pre-fill with the current expected date so the user only needs to push
    // it forward. HijriDatePicker stores YYYY-MM-DD in local time.
    const seed = c.expectedDeliveryDate ? new Date(c.expectedDeliveryDate) : new Date();
    const yyyy = seed.getFullYear();
    const mm = String(seed.getMonth() + 1).padStart(2, "0");
    const dd = String(seed.getDate()).padStart(2, "0");
    setExtendNewDate(`${yyyy}-${mm}-${dd}`);
    setExtendReason("");
    setShowExtendDialog(true);
  };

  const closeExtendDialog = () => {
    setShowExtendDialog(false);
    setExtendConsultation(null);
    setExtendNewDate("");
    setExtendReason("");
  };

  const fetchDeliveryExtensions = async (consultationId: string) => {
    try {
      const res = await apiRequest("GET", `/api/consultations/${consultationId}/delivery-extensions`);
      const rows = (await res.json()) as ConsultationDeliveryExtension[];
      setDeliveryExtensions(Array.isArray(rows) ? rows : []);
    } catch {
      setDeliveryExtensions([]);
    }
  };

  // Phase-6 — fetch the consultation activity log for the open dialog.
  // Called on dialog open and after any workflow mutation that changes
  // the consultation state.
  const fetchActivityLog = async (consultationId: string) => {
    try {
      const res = await apiRequest("GET", `/api/consultations/${consultationId}/activities`);
      const rows = (await res.json()) as ConsultationActivity[];
      setActivityLog(Array.isArray(rows) ? rows : []);
    } catch {
      setActivityLog([]);
    }
  };

  const handleExtendDelivery = async () => {
    if (!extendConsultation) return;
    if (!extendNewDate) {
      toast({ title: "اختر تاريخ التسليم الجديد", variant: "destructive" });
      return;
    }
    if (!extendReason.trim()) {
      toast({ title: "أدخل سبب التمديد", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      // HijriDatePicker emits YYYY-MM-DD. Anchor to local noon so the
      // resulting timestamp is unambiguously "that day" regardless of TZ
      // and is strictly after a same-day current value at any morning hour.
      const [y, m, d] = extendNewDate.split("-").map(Number);
      const iso = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();
      await apiRequest("POST", `/api/consultations/${extendConsultation.id}/extend-delivery`, {
        newExpectedDeliveryDate: iso,
        reason: extendReason.trim(),
      });
      await refreshConsultations();
      await fetchDeliveryExtensions(extendConsultation.id);
      toast({ title: "تم تمديد تاريخ التسليم" });
      closeExtendDialog();
    } catch (err) {
      toast({ title: "فشل تمديد التسليم", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleEarlyClose = async () => {
    if (!earlyCloseConsultation) return;
    // Client-side body validation. The endpoint also enforces:
    //   - reason ∈ ConsultationClosureReason values
    //   - otherText non-empty when reason === OTHER
    if (!earlyCloseReason) {
      toast({ title: "اختر سبب الإغلاق", variant: "destructive" });
      return;
    }
    if (earlyCloseReason === ConsultationClosureReason.OTHER && !earlyCloseOtherText.trim()) {
      toast({ title: "يجب توضيح سبب الإغلاق عند اختيار 'أخرى'", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      // The endpoint reads { reason, otherText? } only — `notes` is sent
      // for forward compatibility but currently ignored server-side
      // (the consultations table has no closure_notes column yet). A
      // follow-up commit can add the column + read it on the route.
      await apiRequest("POST", `/api/consultations/${earlyCloseConsultation.id}/early-close`, {
        reason: earlyCloseReason,
        otherText: earlyCloseReason === ConsultationClosureReason.OTHER
          ? earlyCloseOtherText.trim()
          : undefined,
        notes: earlyCloseNotes.trim() || undefined,
      });
      await refreshConsultations();
      toast({ title: "تم إغلاق الاستشارة" });
      closeEarlyCloseDialog();
    } catch (err) {
      toast({ title: "فشل إغلاق الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  // Start-follow-up dialog open/close + submit. Replaces the previous
  // browser-native window.confirm with a shadcn AlertDialog carrying a
  // required Textarea — the customer's new question. Submit captures the
  // POST response and feeds it back into selectedConsultation directly:
  // the [consultations, selectedConsultation] sync useEffect (≈l1594) is
  // the page-wide safety net, but on this action the user was seeing the
  // dialog body render the stale row (5-stage bar, no cycle badge, button
  // still showing) before the useEffect re-resolved — so we close the
  // gap here with an explicit set against the freshest server payload.
  const openFollowUpDialog = (c: Consultation) => {
    setFollowUpTarget(c);
    setFollowUpQuestion("");
    setShowFollowUpDialog(true);
  };
  const closeFollowUpDialog = () => {
    setShowFollowUpDialog(false);
    setFollowUpTarget(null);
    setFollowUpQuestion("");
  };
  const handleStartFollowUp = async () => {
    if (!followUpTarget) return;
    const question = followUpQuestion.trim();
    if (!question) {
      toast({ title: "اكتب السؤال أو الاستفسار الجديد", variant: "destructive" });
      return;
    }
    const nextNum = (followUpTarget.followUpCount ?? 0) + 1;
    const targetId = followUpTarget.id;
    setActionInProgress(true);
    try {
      const res = await apiRequest("POST", `/api/consultations/${targetId}/start-follow-up`, {
        question,
      });
      // The endpoint returns the authoritative updated row. Parse once
      // and use both as the direct dialog sync (BUG-2 fix) and to keep
      // any other consumer that reads selectedConsultation in step.
      const updated = (await res.json()) as Consultation;
      await refreshConsultations();
      // Guard against a stale fire — the user could have switched
      // dialogs mid-flight. Only sync if it's still the same row.
      if (selectedConsultation?.id === targetId) {
        setSelectedConsultation(updated);
      }
      toast({ title: `تم بدء التعقيبية #${nextNum}` });
      closeFollowUpDialog();
    } catch (err) {
      toast({ title: "فشل بدء التعقيبية", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const consultationLawyers = users.filter(u => u.canBeAssignedConsultations);
  const isDeptHead = user?.role === "department_head";

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferConsultationId, setTransferConsultationId] = useState<string | null>(null);
  const [transferData, setTransferData] = useState({ toDepartmentId: "", reason: "" });

  // Aligns with the /api/consultations/:id/assign endpoint role gate
  // (admin_support, department_head, branch_manager) per §3.2.1. Admin
  // support and branch manager are global; dept_head is scoped to their
  // own department.
  // "تعديل البيانات" — record-level correction, mirroring the cases page's
  // edit action (same ⋯ dropdown, same Pencil + label, same dialog shape).
  //
  // GATE: the page's OWN convention — branch_manager | admin_support |
  // department_head of the consultation's dept. Identical in shape to
  // canAssignConsultation below, and a strict SUBSET of the server's
  // canModifyConsultation gate on PATCH, so nothing rendered can ever 403.
  // (The assigned lawyer / creator can PATCH via the API but do not get this
  // dialog — record administration is the same audience as assign/transfer.)
  // Deliberately NOT stage- or status-gated: correcting a mistyped client on a
  // closed consultation is legitimate, and none of these fields is workflow.
  const canEditConsultation = (c: Consultation) => {
    if (!user) return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    if (user.role === "department_head" && c.departmentId === user.departmentId) return true;
    return false;
  };

  const [editConsultation, setEditConsultation] = useState<Consultation | null>(null);
  const [editForm, setEditForm] = useState({ clientId: "", questionSummary: "", source: "" });
  const [editSaving, setEditSaving] = useState(false);

  const openEditConsultationDialog = (c: Consultation) => {
    setEditForm({
      clientId: c.clientId || "",
      questionSummary: c.questionSummary || "",
      source: c.source || ConsultationSource.GROUP,
    });
    setEditConsultation(c);
  };

  const handleEditConsultation = async () => {
    if (!editConsultation) return;
    if (!editForm.clientId || !editForm.questionSummary.trim()) {
      toast({ title: "خطأ", description: "العميل ونص الاستشارة مطلوبان", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      await updateConsultation(editConsultation.id, {
        clientId: editForm.clientId,
        questionSummary: editForm.questionSummary.trim(),
        source: editForm.source as ConsultationSourceValue,
      });
      await refreshConsultations();
      toast({ title: "تم تحديث بيانات الاستشارة" });
      setEditConsultation(null);
    } catch (err) {
      toast({ title: "فشل حفظ التعديل", description: extractApiError(err), variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const canAssignConsultation = (c: Consultation) => {
    if (c.status !== "active" || c.currentStage !== ConsultationStage.RECEIVED) return false;
    if (user?.role === "branch_manager" || user?.role === "admin_support") return true;
    if (user?.role === "department_head" && c.departmentId === user?.departmentId) return true;
    return false;
  };

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

  const handleAssignConsultation = async () => {
    if (!assignConsultationId || !assignData.lawyerId) return;
    setActionInProgress(true);
    try {
      // The /assign endpoint sets assignedTo and, when currentStage is
      // RECEIVED, advances to STUDY in the same write. departmentId is
      // already set on the consultation; the dept dropdown above is only
      // used here to filter the lawyer list.
      await apiRequest("POST", `/api/consultations/${assignConsultationId}/assign`, {
        assignedTo: assignData.lawyerId,
      });
      await refreshConsultations();
      toast({ title: "تم إسناد الاستشارة بنجاح" });
      setShowAssignDialog(false);
      setAssignConsultationId(null);
      setAssignData({ lawyerId: "", departmentId: "" });
    } catch (err) {
      toast({ title: "فشل إسناد الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openAdvanceDialog = (c: Consultation) => {
    setAdvanceConsultation(c);
    setAdvanceReviewerId(c.internalReviewerId || "");
    setShowAdvanceDialog(true);
  };

  const handleAdvanceStage = async () => {
    if (!advanceConsultation || !user) return;
    const target = getAdvanceTarget(advanceConsultation, user.role, user.id, user.departmentId);
    if (!target) {
      toast({ title: "لا يمكن نقل الاستشارة", description: "ليس لديك صلاحية لهذا الانتقال", variant: "destructive" });
      return;
    }
    // Entering internal review must carry a designated reviewer (mirrors cases).
    const enteringInternalReview = target === ConsultationStage.INTERNAL_REVIEW;
    if (enteringInternalReview && !advanceReviewerId) {
      toast({ title: "اختر المراجع الداخلي", description: "يجب تعيين مراجع داخلي قبل الانتقال للمراجعة", variant: "destructive" });
      return;
    }
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${advanceConsultation.id}/advance-stage`, {
        targetStage: target,
        ...(enteringInternalReview ? { internalReviewerId: advanceReviewerId } : {}),
      });
      await refreshConsultations();
      toast({ title: "تم نقل الاستشارة للمرحلة التالية" });
      setShowAdvanceDialog(false);
      setAdvanceConsultation(null);
    } catch (err) {
      toast({ title: "فشل نقل الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
  };

  const openReturnDialog = (c: Consultation) => {
    setReturnConsultation(c);
    const targets = user
      ? getReturnTargets(c, user.role, user.id, user.departmentId)
      : [];
    // Default to the immediately prior stage when available — that's the
    // only choice an assigned_lawyer will see, and a sensible default for
    // dept_head / branch_manager too.
    setReturnTargetStage(targets.length > 0 ? targets[targets.length - 1] : "");
    setShowReturnDialog(true);
  };

  const handleReturnStage = async () => {
    if (!returnConsultation || !returnTargetStage) return;
    setActionInProgress(true);
    try {
      await apiRequest("POST", `/api/consultations/${returnConsultation.id}/return-stage`, {
        targetStage: returnTargetStage,
      });
      await refreshConsultations();
      toast({ title: "تم إرجاع الاستشارة للمرحلة السابقة" });
      setShowReturnDialog(false);
      setReturnConsultation(null);
      setReturnTargetStage("");
    } catch (err) {
      toast({ title: "فشل إرجاع الاستشارة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setActionInProgress(false);
    }
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

  // Inline editor handler for the consultationType field on the details
  // dialog. Server enforces the role gate + stage remap + activity log,
  // so the client just fires the PATCH and refreshes — refreshConsultations
  // pulls the updated row + (via the activity-log effect on
  // selectedConsultation.updatedAt) the new log entry.
  const [typeChangeInProgress, setTypeChangeInProgress] = useState(false);
  const handleConsultationTypeChange = async (
    consultation: Consultation,
    newType: string,
  ) => {
    if (newType === consultation.consultationType) return;
    setTypeChangeInProgress(true);
    try {
      await updateConsultation(consultation.id, { consultationType: newType });
      await refreshConsultations();
      toast({ title: "تم تحديث نوع الاستشارة" });
    } catch (err) {
      toast({
        title: "فشل تحديث نوع الاستشارة",
        description: extractApiError(err),
        variant: "destructive",
      });
    } finally {
      setTypeChangeInProgress(false);
    }
  };

  // Generic committee-referral field updater. Used for priority,
  // priorityReason, internalReviewerId — server gates per-field, the
  // client just fires the PATCH. Reason-on-blur and reviewer-on-change
  // both go through here.
  const [committeeFieldSaving, setCommitteeFieldSaving] = useState(false);
  const handleCommitteeFieldUpdate = async (
    consultation: Consultation,
    patch: Partial<Pick<Consultation, "priority" | "priorityReason" | "internalReviewerId">>,
  ) => {
    setCommitteeFieldSaving(true);
    try {
      await updateConsultation(consultation.id, patch);
      await refreshConsultations();
    } catch (err) {
      toast({
        title: "فشل حفظ التعديل",
        description: extractApiError(err),
        variant: "destructive",
      });
    } finally {
      setCommitteeFieldSaving(false);
    }
  };

  // Local draft for the priorityReason textarea so typing isn't a
  // PATCH-per-keystroke. Synced to the selected consultation when its
  // id changes (or the row arrives via refresh).
  const [priorityReasonDraft, setPriorityReasonDraft] = useState("");
  useEffect(() => {
    setPriorityReasonDraft(selectedConsultation?.priorityReason ?? "");
  }, [selectedConsultation?.id, selectedConsultation?.priorityReason]);

  const [formData, setFormData] = useState({
    clientId: "",
    // Workflow discriminator — picks the stage flow at creation time.
    // مكتوبة keeps the full 7+1 review/committee path; هاتفية and
    // إجرائية are simple 5-stage flows.
    consultationType: ConsultationType.WRITTEN as string,
    departmentId: "",
    questionSummary: "",
    // Phase-4: SLA category. Defaults to "عادية" (3-day SLA). Set once
    // at creation; not editable afterward per spec.
    category: ConsultationCategory.STANDARD as ConsultationCategoryValue,
    source: ConsultationSource.GROUP as ConsultationSourceValue,
  });

  const resetForm = () => {
    setFormData({
      clientId: "",
      consultationType: ConsultationType.WRITTEN,
      departmentId: "",
      questionSummary: "",
      category: ConsultationCategory.STANDARD,
      source: ConsultationSource.GROUP,
    });
  };

  const handleAddConsultation = async () => {
    if (!user || !formData.clientId || !formData.questionSummary) return;
    try {
      await addConsultation(formData, user.id);
    } catch (err) {
      toast({ title: "فشل إنشاء الاستشارة", description: extractApiError(err), variant: "destructive" });
      return;
    }
    setIsAddDialogOpen(false);
    resetForm();
  };

  // Resolve the pending deep-link open once the consultation arrives in
  // the loaded list. Done in an effect rather than directly so that
  // navigating to /consultations?openConsultation=<id> on a cold tab
  // (consultations not yet fetched) still works.
  useEffect(() => {
    if (!pendingOpenConsId) return;
    const c = consultations.find((x) => x.id === pendingOpenConsId);
    if (c) {
      setSelectedConsultation(c);
      addRecentVisit(
        "consultation",
        c.id,
        `استشارة #${c.id.slice(0, 6)} - ${getClientName(c.clientId)}`,
      );
      setPendingOpenConsId(null);
    }
  }, [pendingOpenConsId, consultations, addRecentVisit, getClientName]);

  // Phase-4: keep the open details dialog in sync with the consultations
  // list. The new in-dialog action buttons run mutations that refresh the
  // list; without this, role-gated buttons (المرحلة التالية / المراجعة
  // الداخلية / …) would compute against a stale snapshot taken at click
  // time. We re-resolve by id on every list change.
  useEffect(() => {
    if (!selectedConsultation) return;
    const fresh = consultations.find((x) => x.id === selectedConsultation.id);
    if (fresh && fresh !== selectedConsultation) {
      setSelectedConsultation(fresh);
    }
  }, [consultations, selectedConsultation]);

  // Phase-5: fetch the delivery-extension history once per dialog open.
  // Triggered on selectedConsultation.id change (not the whole object) so
  // the per-list-refresh sync above doesn't re-fetch on every keystroke.
  // Also collapses the list back when switching consultations.
  useEffect(() => {
    if (!selectedConsultation) {
      setDeliveryExtensions([]);
      setExtensionsExpanded(false);
      setActivityLog([]);
      setActivityLogExpanded(false);
      return;
    }
    setExtensionsExpanded(false);
    // Default collapsed on every dialog open. User can toggle.
    setActivityLogExpanded(false);
    fetchDeliveryExtensions(selectedConsultation.id);
    fetchActivityLog(selectedConsultation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConsultation?.id]);

  // Phase-6 — refresh the activity log whenever the consultation row
  // mutates (the consultations list refreshes after every workflow
  // mutation), so the timeline reflects new entries without manual
  // re-open. The id-stable check above guards against unrelated
  // re-renders, but updatedAt does change on every workflow action.
  useEffect(() => {
    if (!selectedConsultation) return;
    fetchActivityLog(selectedConsultation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConsultation?.updatedAt]);

  const filterLawyers = users.filter(u => !LAWYER_FILTER_EXCLUDED_ROLES.has(u.role));

  const filteredConsultations = consultations.filter((consultation) => {
    const q = advFilters.search.trim().toLowerCase();
    if (q) {
      const clientName = getClientName(consultation.clientId);
      const haystack = [
        consultation.consultationNumber,
        consultation.questionSummary,
        clientName,
        consultation.consultationType,
      ].map((s) => (s || "").toLowerCase());
      if (!haystack.some((h) => h.includes(q))) return false;
    }
    if (advFilters.status !== "all" && consultation.status !== advFilters.status) return false;
    if (advFilters.departmentId && consultation.departmentId !== advFilters.departmentId) return false;
    // Stage filter operates on displayStage (virtual grouping) so a
    // closed/converted consultation appears under منجزة and a paused
    // one under استكمال_المرفقات_والبيانات.
    if (advFilters.stages.length > 0 && !advFilters.stages.includes(getConsultationDisplayStage(consultation))) return false;
    if (advFilters.lawyers.length > 0) {
      const assignedTo = consultation.assignedTo;
      if (!assignedTo || !advFilters.lawyers.includes(assignedTo)) return false;
    }
    // Type filter uses resolveConsultationType so legacy free-text rows
    // ("عام"/"تجاري"/…) collapse to WRITTEN and match "مكتوبة" correctly.
    if (
      advFilters.consultationTypes.length > 0 &&
      !advFilters.consultationTypes.includes(resolveConsultationType(consultation.consultationType))
    ) {
      return false;
    }
    // When a priority filter is active, exclude consultations with no
    // priority set — the conservative interpretation ("if you ask for
    // high-priority consultations, don't surface ones whose priority is
    // unknown"). priority is nullable on Consultation (legacy rows render
    // as "not set").
    if (advFilters.priorities.length > 0) {
      const p = consultation.priority as string | undefined;
      if (!p || !advFilters.priorities.includes(p)) return false;
    }
    if (advFilters.dateFrom || advFilters.dateTo) {
      const created = consultation.createdAt ? new Date(consultation.createdAt).getTime() : NaN;
      if (Number.isNaN(created)) return false;
      if (advFilters.dateFrom) {
        const from = new Date(advFilters.dateFrom).getTime();
        if (!Number.isNaN(from) && created < from) return false;
      }
      if (advFilters.dateTo) {
        // Inclusive upper bound: bump to end-of-day so a same-day
        // createdAt timestamp matches.
        const toBase = new Date(advFilters.dateTo).getTime();
        if (!Number.isNaN(toBase)) {
          const toEnd = toBase + 24 * 60 * 60 * 1000 - 1;
          if (created > toEnd) return false;
        }
      }
    }
    // Phase-4 SLA filter: keep only active rows past their
    // expectedDeliveryDate. Reuses isConsultationOverdue so the
    // table indicator and the filter agree on the threshold.
    if (advFilters.overdue && !isConsultationOverdue(consultation)) return false;
    return true;
  });

  // Default ordering: priority group ASC, then workflow-stage order
  // ASC within a group (earlier stages bubble up), then updatedAt DESC
  // within the same stage. Stage-order array is type-aware — each
  // workflow flavor (WRITTEN / PHONE / PROCEDURAL) has its own canonical
  // order. Unknown stages fall to 999 so they sink within their group.
  const consultationStageOrderIndex = (c: Consultation): number => {
    const resolvedType = resolveConsultationType(c.consultationType);
    const order =
      resolvedType === ConsultationType.PHONE
        ? ConsultationStagesOrderPhone
        : resolvedType === ConsultationType.PROCEDURAL
          ? ConsultationStagesOrderProcedural
          : ConsultationStagesAll;
    const i = order.indexOf(c.currentStage);
    return i === -1 ? 999 : i;
  };
  const sortedConsultations = [...filteredConsultations].sort((a, b) => {
    const ga = getConsultationPriorityGroup(a);
    const gb = getConsultationPriorityGroup(b);
    if (ga !== gb) return ga - gb;
    const sa = consultationStageOrderIndex(a);
    const sb = consultationStageOrderIndex(b);
    if (sa !== sb) return sa - sb;
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
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
                  <Select
                    value={formData.consultationType}
                    onValueChange={(value) => setFormData({ ...formData, consultationType: value })}
                  >
                    <SelectTrigger data-testid="select-consultation-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.values(ConsultationType) as string[]).map((t) => (
                        <SelectItem key={t} value={t} data-testid={`option-consultation-type-${t}`}>
                          {ConsultationTypeLabels[t as keyof typeof ConsultationTypeLabels] || t}
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
                  <Label>تصنيف المدة</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: ConsultationCategoryValue) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger data-testid="select-consultation-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.values(ConsultationCategory) as ConsultationCategoryValue[]).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {ConsultationCategoryLabels[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    يحدّد التصنيف تاريخ التسليم المتوقع تلقائياً (يوم / 3 أيام / 14 يوم).
                  </p>
                </div>
                <div>
                  <Label>وصلتنا عبر</Label>
                  <Select
                    value={formData.source}
                    onValueChange={(value: ConsultationSourceValue) =>
                      setFormData({ ...formData, source: value })
                    }
                  >
                    <SelectTrigger data-testid="select-consultation-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.values(ConsultationSource) as string[]).map((s) => (
                        <SelectItem key={s} value={s} data-testid={`option-consultation-source-${s}`}>
                          {ConsultationSourceLabels[s as keyof typeof ConsultationSourceLabels] || s}
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
                {/* Phase-9.1 — priority + priority_reason removed from
                    the create form. They're set on the committee
                    referral card (نموذج الإحالة للجنة) only, once the
                    consultation actually reaches لجنة_مراجعة. */}
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
            <ConsultationsAdvancedFilters
              filters={advFilters}
              onChange={setAdvFilters}
              departments={departments.map((d) => ({ id: String(d.id), name: d.name }))}
              lawyers={filterLawyers.map((l) => ({ id: l.id, name: l.name }))}
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Phase-7 quick filters: always-visible single-select dropdowns
              for the 3 most-used facets. Drive the same advFilters state as
              the advanced popover (lawyers/stages multi-select arrays are
              collapsed to a single value here — picking one replaces the
              whole array; "all" clears it). When the popover sets length>1,
              the dropdown displays "all" because a single-select control
              can't represent a multi-selection. */}
          <div
            className="flex flex-wrap items-center gap-3 mb-4"
            data-testid="consultations-quick-filters"
          >
            <div className="min-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">القسم</Label>
              <Select
                value={advFilters.departmentId || "all"}
                onValueChange={(v) =>
                  setAdvFilters({ ...advFilters, departmentId: v === "all" ? "" : v })
                }
              >
                <SelectTrigger data-testid="quick-filter-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأقسام</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={String(d.id)} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-1 block">المحامي المسؤول</Label>
              <Select
                value={advFilters.lawyers.length === 1 ? advFilters.lawyers[0] : "all"}
                onValueChange={(v) =>
                  setAdvFilters({ ...advFilters, lawyers: v === "all" ? [] : [v] })
                }
              >
                <SelectTrigger data-testid="quick-filter-lawyer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المحامين</SelectItem>
                  {filterLawyers.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">نوع الاستشارة</Label>
              <Select
                value={advFilters.consultationTypes.length === 1 ? advFilters.consultationTypes[0] : "all"}
                onValueChange={(v) =>
                  setAdvFilters({ ...advFilters, consultationTypes: v === "all" ? [] : [v] })
                }
              >
                <SelectTrigger data-testid="quick-filter-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأنواع</SelectItem>
                  {Object.values(ConsultationType).map((t) => (
                    <SelectItem key={t} value={t}>{ConsultationTypeLabels[t] || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <Label className="text-xs text-muted-foreground mb-1 block">المرحلة</Label>
              <Select
                value={advFilters.stages.length === 1 ? advFilters.stages[0] : "all"}
                onValueChange={(v) =>
                  setAdvFilters({ ...advFilters, stages: v === "all" ? [] : [v] })
                }
              >
                <SelectTrigger data-testid="quick-filter-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المراحل</SelectItem>
                  {/* When exactly one type is selected, scope the stage
                      list to that type's flow. Otherwise show the full
                      cross-type list: ConsultationStagesAll already ends
                      with CLOSED_FINAL (WRITTEN's terminal), so we only
                      append the PHONE/PROCEDURAL-exclusive stages not in
                      it — IN_PROGRESS (procedural) and COMPLETED
                      ("جاهزة للإغلاق", phone/procedural pre-closure).
                      CLOSED_FINAL is NOT re-appended (would duplicate the
                      React key). */}
                  {(advFilters.consultationTypes.length === 1
                    ? getConsultationStagesForType(advFilters.consultationTypes[0] as ConsultationTypeValue)
                    : [
                        ...ConsultationStagesAll,
                        ConsultationStage.IN_PROGRESS,
                        ConsultationStage.COMPLETED,
                      ]
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {ConsultationStageLabels[s] || s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {/* Phase-5: all table cells (header + body) center-aligned. */}
                <TableHead className="text-center w-[48px]">#</TableHead>
                <TableHead className="text-center">رقم الاستشارة</TableHead>
                <TableHead className="text-center">العميل</TableHead>
                <TableHead className="text-center">النوع</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">القسم</TableHead>
                <TableHead className="text-center">المحامي المسؤول</TableHead>
                <TableHead className="text-center">التصنيف</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedConsultations.map((consultation, idx) => {
                const priorityGroup = getConsultationPriorityGroup(consultation);
                const rowClass =
                  priorityGroup === 1
                    ? "bg-amber-50/60 dark:bg-amber-950/20"
                    : priorityGroup === 4
                      ? "opacity-60"
                      : priorityGroup === 3
                        ? "opacity-80"
                        : "";
                return (
                <TableRow key={consultation.id} data-testid={`row-consultation-${consultation.id}`} className={rowClass}>
                  {/* Display-only sequential number — index inside the rendered
                      list (sortedConsultations), so every active filter/search
                      and the priority sort renumber the visible rows from 1.
                      This table is unpaginated, so it is a plain 1..n count. */}
                  <TableCell className="text-center text-xs text-muted-foreground" data-testid={`cell-index-${consultation.id}`}>
                    {idx + 1}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <LtrInline>{consultation.consultationNumber}</LtrInline>
                      {priorityGroup === 1 && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] px-1 py-0"
                          data-testid={`badge-consultation-unassigned-${consultation.id}`}
                          title="الاستشارة لم تُسنَد لمحامٍ بعد"
                        >
                          <AlertTriangle className="w-2.5 h-2.5 ml-1" />
                          غير مسندة
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <BidiText>{getClientName(consultation.clientId)}</BidiText>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{consultation.consultationType}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                      {/* Issue-2 — only active rows show the stage badge.
                          For closed/converted rows the virtual-stage map
                          (closed→COMPLETED→"جاهزة للإغلاق") would otherwise
                          render a second, misleading badge alongside the
                          "مقفلة"/"محولة لقضية" lifecycle pill below.
                          getConsultationDisplayStage is left untouched so
                          the stage filter axis still groups these rows. */}
                      {consultation.status === "active" && (() => {
                        const b = getConsultationDisplayBadge(consultation);
                        return <Badge className={b.className}>{b.label}</Badge>;
                      })()}
                      {/* Status pills — orthogonal to the stage badge so the
                          stage stays visible no matter the lifecycle state.
                          Filter by stage="دراسة" still returns these rows. */}
                      {consultation.status === "paused" && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                          data-testid={`badge-paused-${consultation.id}`}
                          title={consultation.pauseReason || "معلّقة"}
                        >
                          <Pause className="w-2.5 h-2.5 ml-1" />
                          معلّقة
                        </Badge>
                      )}
                      {consultation.status === "converted" && (
                        <Badge
                          variant="outline"
                          className="border-violet-500 bg-violet-500/10 text-violet-700 text-[10px] px-1 py-0"
                          data-testid={`badge-converted-${consultation.id}`}
                          title={ConsultationStatusDisplayLabels.converted}
                        >
                          {ConsultationStatusDisplayLabels.converted}
                        </Badge>
                      )}
                      {consultation.status === "closed" && (
                        <Badge
                          variant="outline"
                          className="border-muted bg-muted/30 text-muted-foreground text-[10px] px-1 py-0"
                          data-testid={`badge-closed-${consultation.id}`}
                          title={ConsultationStatusDisplayLabels.closed}
                        >
                          {ConsultationStatusDisplayLabels.closed}
                        </Badge>
                      )}
                      {/* Phase-8 — awaiting-completion indicator. */}
                      {consultation.awaitingCompletion && consultation.status === "active" && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                          data-testid={`badge-awaiting-${consultation.id}`}
                          title="بانتظار استكمال البيانات"
                        >
                          <AlertTriangle className="w-2.5 h-2.5 ml-1" />
                          بانتظار
                        </Badge>
                      )}
                      {/* Follow-up cycle indicator — DERIVED, exactly like
                          "مذكرة جارية" / "بانتظار استلام الصك" in cases.tsx: no
                          stored flag, no clearing code. isInFollowUpCycle is
                          count>0 AND status active, so it self-clears when the
                          cycle re-closes. Same gate + label + classes as the
                          contracts row badge. The DIALOG badge stays
                          count-only/status-agnostic on purpose. */}
                      {isInFollowUpCycle(consultation) && (
                        <Badge
                          variant="outline"
                          className="border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] px-1 py-0"
                          data-testid={`badge-consultation-follow-up-${consultation.id}`}
                          title="الاستشارة في جولة استشارة تعقيبية"
                        >
                          <RotateCw className="w-2.5 h-2.5 ml-1" />
                          تعقيبية #{consultation.followUpCount}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{getDepartmentName(consultation.departmentId)}</TableCell>
                  <TableCell className="text-center" data-testid={`cell-assigned-lawyer-${consultation.id}`}>
                    <BidiText>{getLawyerName(consultation.assignedTo)}</BidiText>
                  </TableCell>
                  <TableCell className="text-center" data-testid={`cell-category-${consultation.id}`}>
                    <Badge
                      variant="outline"
                      className={getCategoryBadgeClassName(consultation.category)}
                    >
                      {consultation.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
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
                          {/* "تعديل البيانات" — mirrors the cases page: first
                              item, Pencil icon, same label. Sits OUTSIDE the
                              paused / awaiting-completion branch below because
                              it is not a workflow action: a paused
                              consultation's client or question text must still
                              be correctable. */}
                          {canEditConsultation(consultation) && (
                            <DropdownMenuItem
                              data-testid={`button-edit-consultation-${consultation.id}`}
                              onClick={() => openEditConsultationDialog(consultation)}
                            >
                              <Pencil className="w-4 h-4 ml-2" />
                              تعديل البيانات
                            </DropdownMenuItem>
                          )}
                          {/* Phase-8 — when paused, all workflow actions hide.
                              Only "إلغاء التعليق" (and delete for branch_manager)
                              are available. The pause/unpause action itself is
                              rendered below the workflow block.
                              When awaiting completion, similarly hide all workflow
                              actions except the resume action — same permission
                              gate as pause. */}
                          {consultation.status === "paused" ? (
                            <>
                              {canPauseConsultation(consultation, user) && (
                                <DropdownMenuItem
                                  data-testid={`button-unpause-consultation-${consultation.id}`}
                                  onClick={() => openUnpauseDialog(consultation)}
                                >
                                  <Play className="w-4 h-4 ml-2" />
                                  إلغاء التعليق
                                </DropdownMenuItem>
                              )}
                            </>
                          ) : consultation.awaitingCompletion ? (
                            <>
                              {canPauseConsultation(consultation, user) && (
                                <DropdownMenuItem
                                  data-testid={`button-resume-completion-${consultation.id}`}
                                  onClick={() => openResumeDialog(consultation)}
                                >
                                  <CheckCircle className="w-4 h-4 ml-2" />
                                  تم الاستكمال
                                </DropdownMenuItem>
                              )}
                            </>
                          ) : (
                            <>
                          {canAssignConsultation(consultation) && (
                            <DropdownMenuItem data-testid={`button-assign-consultation-${consultation.id}`} onClick={() => openAssignDialog(consultation)}>
                              <UserPlus className="w-4 h-4 ml-2" />
                              إسناد الاستشارة
                            </DropdownMenuItem>
                          )}
                          {user && getAdvanceTarget(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-advance-consultation-${consultation.id}`}
                              onClick={() => openAdvanceDialog(consultation)}
                            >
                              <ChevronLeft className="w-4 h-4 ml-2" />
                              المرحلة التالية
                            </DropdownMenuItem>
                          )}
                          {/* Phase-8 — "تجاوز" (skip) button shown only when
                              currently in PENDING_COMPLETION stage AND not in
                              await mode. Same target as the normal advance to
                              STUDY but logs completion_skipped distinctly. */}
                          {consultation.status === "active"
                            && consultation.currentStage === ConsultationStage.RECEIVED_PENDING_COMPLETION
                            && !consultation.awaitingCompletion
                            && canPauseConsultation(consultation, user) && (
                            <DropdownMenuItem
                              data-testid={`button-skip-completion-${consultation.id}`}
                              onClick={() => openSkipDialog(consultation)}
                            >
                              <FileSymlink className="w-4 h-4 ml-2" />
                              تجاوز مرحلة الاستكمال
                            </DropdownMenuItem>
                          )}
                          {user && getReturnTargets(consultation, user.role, user.id, user.departmentId).length > 0 && (
                            <DropdownMenuItem
                              data-testid={`button-return-consultation-${consultation.id}`}
                              onClick={() => openReturnDialog(consultation)}
                            >
                              <ChevronRight className="w-4 h-4 ml-2" />
                              المرحلة السابقة
                            </DropdownMenuItem>
                          )}
                          {user && canDoInternalReview(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-internal-review-${consultation.id}`}
                              onClick={() => openInternalReviewDialog(consultation)}
                            >
                              <ClipboardCheck className="w-4 h-4 ml-2" />
                              المراجعة الداخلية
                            </DropdownMenuItem>
                          )}
                          {user && canDoCommitteeDecision(consultation, user.role, getDepartmentName(consultation.departmentId) === "عمالي") && (
                            <DropdownMenuItem
                              data-testid={`button-committee-decision-${consultation.id}`}
                              onClick={() => openCommitteeDialog(consultation)}
                            >
                              <CheckCircle className="w-4 h-4 ml-2" />
                              قرار اللجنة
                            </DropdownMenuItem>
                          )}
                          {user && canDoTakeNotesOutcome(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-take-notes-outcome-${consultation.id}`}
                              onClick={() => openTakeNotesDialog(consultation)}
                            >
                              <FileText className="w-4 h-4 ml-2" />
                              تسجيل نتيجة الأخذ بالملاحظات
                            </DropdownMenuItem>
                          )}
                          {user && canConvertToCase(consultation, user.role, user.departmentId) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`button-convert-to-case-${consultation.id}`}
                                onClick={() => openConvertDialog(consultation)}
                              >
                                <FileSymlink className="w-4 h-4 ml-2" />
                                تحويل لقضية
                              </DropdownMenuItem>
                            </>
                          )}
                          {user && canEarlyClose(consultation, user.role, user.id, user.departmentId) && (
                            <DropdownMenuItem
                              data-testid={`button-early-close-${consultation.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={() => openEarlyCloseDialog(consultation)}
                            >
                              <XCircle className="w-4 h-4 ml-2" />
                              إغلاق مبكر
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
                          {/* Phase-8 — pause + await-completion actions. Both
                              sit between workflow actions and the destructive
                              delete. Await-completion is hidden when already in
                              await mode (rendered in the awaiting branch above)
                              and when already in PENDING_COMPLETION stage (the
                              tautology guard the server also enforces). */}
                          {consultation.status === "active" && !consultation.awaitingCompletion
                            && consultation.currentStage !== ConsultationStage.RECEIVED_PENDING_COMPLETION
                            && canPauseConsultation(consultation, user) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`button-await-completion-${consultation.id}`}
                                className="text-amber-600 focus:text-amber-700"
                                onClick={() => openAwaitDialog(consultation)}
                              >
                                <AlertTriangle className="w-4 h-4 ml-2" />
                                بانتظار استكمال البيانات
                              </DropdownMenuItem>
                            </>
                          )}
                          {consultation.status === "active" && canPauseConsultation(consultation, user) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                data-testid={`button-pause-consultation-${consultation.id}`}
                                className="text-amber-600 focus:text-amber-700"
                                onClick={() => openPauseDialog(consultation)}
                              >
                                <Pause className="w-4 h-4 ml-2" />
                                تعليق
                              </DropdownMenuItem>
                            </>
                          )}
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
                );
              })}
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
              {selectedConsultation && (selectedConsultation.followUpCount ?? 0) > 0 && (
                <Badge
                  variant="outline"
                  className="border-blue-500 bg-blue-500/10 text-blue-700 text-xs"
                  data-testid="badge-consultation-follow-up"
                  title="استشارة تعقيبية"
                >
                  تعقيبية #{selectedConsultation.followUpCount}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedConsultation && (
            <div className="space-y-4">
              {/* Phase-8 — awaiting-completion banner. When awaitingCompletion
                  is true, the consultation's stage is RECEIVED_PENDING_COMPLETION
                  (set by the server) — but unlike the normal flow at that stage,
                  the resume action restores savedStage rather than advancing.
                  Show savedStage so the user knows where they'll return. */}
              {selectedConsultation.status === "active" && selectedConsultation.awaitingCompletion && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                  data-testid="banner-consultation-awaiting"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    هذه الاستشارة بانتظار استكمال البيانات
                  </div>
                  {selectedConsultation.savedStage && (
                    <div className="mt-1 text-xs">
                      ستعود إلى: <BidiText>{ConsultationStageLabels[selectedConsultation.savedStage as ConsultationStageValue] || selectedConsultation.savedStage}</BidiText>
                    </div>
                  )}
                </div>
              )}
              {/* Phase-8 — paused banner. Renders at the top of the details
                  dialog whenever status='paused' so the reason / who / when
                  is visible without scrolling to the activity log. */}
              {selectedConsultation.status === "paused" && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                  data-testid="banner-consultation-paused"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Pause className="w-4 h-4" />
                    هذه الاستشارة معلّقة
                  </div>
                  {selectedConsultation.pauseReason && (
                    <div className="mt-1">
                      السبب: <BidiText>{selectedConsultation.pauseReason}</BidiText>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-amber-700/80">
                    {selectedConsultation.pausedBy && (
                      <>بواسطة <BidiText>{getLawyerName(selectedConsultation.pausedBy)}</BidiText></>
                    )}
                    {selectedConsultation.pausedAt && (
                      <>
                        {selectedConsultation.pausedBy ? " — " : ""}
                        في <LtrInline>{formatExpectedDate(selectedConsultation.pausedAt)}</LtrInline>
                      </>
                    )}
                  </div>
                </div>
              )}
              {selectedConsultation.status === "converted" && selectedConsultation.convertedToCaseId && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary hover-elevate rounded px-2 py-1 -mx-2"
                  onClick={() => setLocation(`/cases?openCase=${selectedConsultation.convertedToCaseId}`)}
                  data-testid="link-go-to-converted-case"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  اذهب للقضية
                </button>
              )}
              {/* Cycle question card. Visible only on an active cycle —
                  reads the freshest FOLLOW_UP_STARTED entry from the
                  timeline (the entries are sorted DESC by performedAt
                  server-side; we re-pick here to stay decoupled from
                  ordering). metadata.followUpQuestion is set by the
                  /start-follow-up endpoint. Falls back to the entry's
                  description if for some reason metadata is missing. */}
              {isInFollowUpCycle(selectedConsultation) && (() => {
                const latest = activityLog.find(
                  (a) => a.activityType === ConsultationActivityType.FOLLOW_UP_STARTED,
                );
                const question = latest?.metadata?.followUpQuestion;
                if (!question) return null;
                return (
                  <div
                    className="rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-900"
                    data-testid="banner-follow-up-question"
                  >
                    <div className="flex items-center gap-2 font-medium text-blue-800">
                      <RotateCw className="w-4 h-4" />
                      السؤال التعقيبي الحالي
                      {(selectedConsultation.followUpCount ?? 0) > 0 && (
                        <span className="text-xs opacity-80">
                          (تعقيبية #{selectedConsultation.followUpCount})
                        </span>
                      )}
                    </div>
                    {/* Same legibility fix as the contracts banner: the
                        inherited text-blue-900 is near-invisible on the
                        blue-500/10 tint in the dark theme. Heading keeps its
                        blue styling; the question body reads as foreground. */}
                    <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                      <BidiText>{String(question)}</BidiText>
                    </p>
                  </div>
                );
              })()}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-4 text-center">مراحل الاستشارة</h4>
                <ConsultationStagesBar
                  currentStage={selectedConsultation.currentStage}
                  consultationType={selectedConsultation.consultationType}
                  followUpCount={selectedConsultation.followUpCount}
                />
                {/* Phase-4 dev-feedback: surface the same workflow actions
                    that live in the row's ⋯ dropdown right under the stages
                    bar, so the user doesn't have to close the dialog to
                    advance / return / review / convert / close. Same
                    role-gating, same handlers — just a second entry
                    point. */}
                {user && (
                  <div className="flex flex-wrap gap-2 justify-center mt-4 pt-4 border-t">
                    {canAssignConsultation(selectedConsultation) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-assign-${selectedConsultation.id}`}
                        onClick={() => openAssignDialog(selectedConsultation)}
                      >
                        <UserPlus className="w-4 h-4 ml-1" />
                        إسناد الاستشارة
                      </Button>
                    )}
                    {getAdvanceTarget(selectedConsultation, user.role, user.id, user.departmentId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-advance-${selectedConsultation.id}`}
                        onClick={() => openAdvanceDialog(selectedConsultation)}
                      >
                        <ChevronLeft className="w-4 h-4 ml-1" />
                        المرحلة التالية
                      </Button>
                    )}
                    {getReturnTargets(selectedConsultation, user.role, user.id, user.departmentId).length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-return-${selectedConsultation.id}`}
                        onClick={() => openReturnDialog(selectedConsultation)}
                      >
                        <ChevronRight className="w-4 h-4 ml-1" />
                        المرحلة السابقة
                      </Button>
                    )}
                    {canDoInternalReview(selectedConsultation, user.role, user.id, user.departmentId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-internal-review-${selectedConsultation.id}`}
                        onClick={() => openInternalReviewDialog(selectedConsultation)}
                      >
                        <ClipboardCheck className="w-4 h-4 ml-1" />
                        المراجعة الداخلية
                      </Button>
                    )}
                    {canDoCommitteeDecision(selectedConsultation, user.role, getDepartmentName(selectedConsultation.departmentId) === "عمالي") && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-committee-${selectedConsultation.id}`}
                        onClick={() => openCommitteeDialog(selectedConsultation)}
                      >
                        <CheckCircle className="w-4 h-4 ml-1" />
                        قرار اللجنة
                      </Button>
                    )}
                    {/* Reasoned override — "تجاوز لجنة المراجعة". A SEPARATE,
                        destructive-styled action so it cannot be confused with
                        "قرار اللجنة" above: its actors are NOT the committee
                        chairs (branch_manager / own-dept head / assigned
                        lawyer), it is WRITTEN-only, and it skips the committee
                        rather than recording its decision. The gate restates the
                        server's rule verbatim → visibility == authorization. */}
                    {canSkipCommittee(selectedConsultation, user.role, user.id, user.departmentId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-skip-committee-${selectedConsultation.id}`}
                        onClick={() => openSkipCommitteeDialog(selectedConsultation)}
                        className="border-destructive/60 text-destructive hover:bg-destructive/10"
                      >
                        <AlertTriangle className="w-4 h-4 ml-1" />
                        تجاوز لجنة المراجعة
                      </Button>
                    )}
                    {canDoTakeNotesOutcome(selectedConsultation, user.role, user.id, user.departmentId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-take-notes-${selectedConsultation.id}`}
                        onClick={() => openTakeNotesDialog(selectedConsultation)}
                      >
                        <FileText className="w-4 h-4 ml-1" />
                        نتيجة الأخذ بالملاحظات
                      </Button>
                    )}
                    {canConvertToCase(selectedConsultation, user.role, user.departmentId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-convert-${selectedConsultation.id}`}
                        onClick={() => openConvertDialog(selectedConsultation)}
                      >
                        <FileSymlink className="w-4 h-4 ml-1" />
                        تحويل لقضية
                      </Button>
                    )}
                    {canEarlyClose(selectedConsultation, user.role, user.id, user.departmentId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        data-testid={`dialog-button-early-close-${selectedConsultation.id}`}
                        onClick={() => openEarlyCloseDialog(selectedConsultation)}
                      >
                        <XCircle className="w-4 h-4 ml-1" />
                        إغلاق مبكر
                      </Button>
                    )}
                    {canStartFollowUp(selectedConsultation, user.role) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                        data-testid={`dialog-button-start-follow-up-${selectedConsultation.id}`}
                        onClick={() => openFollowUpDialog(selectedConsultation)}
                      >
                        <RotateCw className="w-4 h-4 ml-1" />
                        استشارة تعقيبية
                      </Button>
                    )}
                    {canExtendDelivery(selectedConsultation) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-extend-delivery-${selectedConsultation.id}`}
                        onClick={() => openExtendDialog(selectedConsultation)}
                      >
                        <AlertTriangle className="w-4 h-4 ml-1" />
                        تمديد التسليم
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {/* Phase-5: dialog body content right-aligned (RTL natural).
                  text-right on the wrapping divs propagates to the Label
                  + p children. */}
              <div className="grid grid-cols-2 gap-4 text-right">
                <div>
                  <Label className="text-muted-foreground">العميل</Label>
                  <p className="font-medium">
                    <BidiText>{getClientName(selectedConsultation.clientId)}</BidiText>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">النوع</Label>
                  {user && canChangeConsultationType(selectedConsultation, user.role, user.departmentId) ? (
                    <Select
                      value={selectedConsultation.consultationType}
                      onValueChange={(value) => handleConsultationTypeChange(selectedConsultation, value)}
                      disabled={typeChangeInProgress}
                    >
                      <SelectTrigger
                        className="mt-1"
                        data-testid="dialog-consultation-type-select"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.values(ConsultationType) as string[]).map((t) => (
                          <SelectItem
                            key={t}
                            value={t}
                            data-testid={`dialog-option-consultation-type-${t}`}
                          >
                            {ConsultationTypeLabels[t as keyof typeof ConsultationTypeLabels] || t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p>
                      {ConsultationTypeLabels[selectedConsultation.consultationType as keyof typeof ConsultationTypeLabels]
                        || selectedConsultation.consultationType}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">المحامي المسؤول</Label>
                  <p className="font-medium" data-testid="dialog-assigned-lawyer">
                    <BidiText>{getLawyerName(selectedConsultation.assignedTo)}</BidiText>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">التصنيف</Label>
                  <p data-testid="dialog-category">
                    <Badge
                      variant="outline"
                      className={getCategoryBadgeClassName(selectedConsultation.category)}
                    >
                      {selectedConsultation.category}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">وصلتنا عبر</Label>
                  <p data-testid="dialog-source">
                    {ConsultationSourceLabels[selectedConsultation.source as keyof typeof ConsultationSourceLabels]
                      || selectedConsultation.source}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">التسليم المتوقع</Label>
                  <p data-testid="dialog-expected-delivery">
                    {(() => {
                      const overdue = isConsultationOverdue(selectedConsultation);
                      const text = formatExpectedDate(selectedConsultation.expectedDeliveryDate);
                      return (
                        <span
                          className={
                            overdue ? "inline-flex items-center gap-1 text-destructive font-medium" : ""
                          }
                        >
                          {overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                          <LtrInline>{text}</LtrInline>
                        </span>
                      );
                    })()}
                  </p>
                </div>
                {/* Phase-9.1 — priority + priority_reason editors moved
                    to the committee referral card below; they're no
                    longer surfaced inline in the dialog grid. */}
              </div>
              <div className="text-right">
                {/* Relabel as "السؤال الأصلي" while inside a follow-up
                    cycle so the user sees the distinction from the
                    cycle-question card above. The stored value is
                    unchanged — it's still consultation.questionSummary. */}
                <Label className="text-muted-foreground">
                  {(selectedConsultation.followUpCount ?? 0) > 0 ? "السؤال الأصلي" : "ملخص السؤال"}
                </Label>
                <p className="p-3 bg-muted rounded-md">{selectedConsultation.questionSummary}</p>
              </div>

              {/* Committee referral form (نموذج الإحالة للجنة المراجعة).
                  Surfaces only once the consultation reaches لجنة_مراجعة —
                  before that the same fields remain editable inline above
                  but aren't formatted as a referral form. The internal
                  reviewer is editable here for branch_manager / admin_support
                  / department_head (own dept); other roles see the value
                  read-only. The remaining fields are read-only displays of
                  data already captured elsewhere on the row (assignedTo,
                  client, intake date, priority + reason). */}
              {selectedConsultation.currentStage === ConsultationStage.COMMITTEE && (
                <div
                  className="text-right border rounded-lg p-4 bg-secondary/10 space-y-3"
                  data-testid="committee-referral-card"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4" />
                      نموذج الإحالة للجنة المراجعة
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-muted-foreground text-xs">المحرر</Label>
                      <p className="font-medium" data-testid="committee-form-editor">
                        <BidiText>{getLawyerName(selectedConsultation.assignedTo)}</BidiText>
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">المراجع</Label>
                      {user
                        && (
                          user.role === "branch_manager"
                          || user.role === "admin_support"
                          || (user.role === "department_head" && selectedConsultation.departmentId === user.departmentId)
                        ) ? (
                        <Select
                          value={selectedConsultation.internalReviewerId || "none"}
                          onValueChange={(value) =>
                            handleCommitteeFieldUpdate(selectedConsultation, {
                              internalReviewerId: value === "none" ? null : value,
                            })
                          }
                          disabled={committeeFieldSaving}
                        >
                          <SelectTrigger
                            className="mt-1"
                            data-testid="committee-form-reviewer-select"
                          >
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {filterLawyers.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="font-medium" data-testid="committee-form-reviewer">
                          <BidiText>{getLawyerName(selectedConsultation.internalReviewerId)}</BidiText>
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">مركز العميل</Label>
                      <p className="font-medium" data-testid="committee-form-client">
                        <BidiText>{getClientName(selectedConsultation.clientId)}</BidiText>
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">تاريخ دخول الاستشارة للقسم</Label>
                      <p data-testid="committee-form-intake-date">
                        <LtrInline>{formatExpectedDate(selectedConsultation.createdAt)}</LtrInline>
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground text-xs">طلب العميل</Label>
                      <p
                        className="p-2 bg-background/60 rounded whitespace-pre-wrap"
                        data-testid="committee-form-request"
                      >
                        {selectedConsultation.questionSummary}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground text-xs">الأولوية</Label>
                      <Select
                        value={selectedConsultation.priority || "none"}
                        onValueChange={(value) =>
                          handleCommitteeFieldUpdate(selectedConsultation, {
                            priority: value === "none" ? null : value,
                            // Drop the reason on clear so a stale
                            // justification doesn't ride along after the
                            // level is removed.
                            ...(value === "none" ? { priorityReason: null } : {}),
                          })
                        }
                        disabled={committeeFieldSaving}
                      >
                        <SelectTrigger
                          className="mt-1"
                          data-testid="committee-form-priority-select"
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {(Object.values(ConsultationPriority) as ConsultationPriorityValue[]).map((p) => (
                            <SelectItem key={p} value={p} data-testid={`committee-form-priority-option-${p}`}>
                              {ConsultationPriorityLabels[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedConsultation.priority && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground text-xs">سبب الأولوية</Label>
                        <Textarea
                          data-testid="committee-form-priority-reason"
                          value={priorityReasonDraft}
                          onChange={(e) => setPriorityReasonDraft(e.target.value)}
                          onBlur={() => {
                            const next = priorityReasonDraft.trim();
                            const current = selectedConsultation.priorityReason ?? "";
                            if (next === current) return;
                            handleCommitteeFieldUpdate(selectedConsultation, {
                              priorityReason: next || null,
                            });
                          }}
                          placeholder="اختياري — اشرح سبب اختيار هذه الأولوية..."
                          rows={2}
                          disabled={committeeFieldSaving}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Phase-6 — consultation activity timeline. Default expanded.
                  Newest first. Re-fetched on dialog open and on every
                  consultation update so it stays in sync with the
                  workflow handlers. */}
              <ConsultationActivityTimeline
                activities={activityLog}
                expanded={activityLogExpanded}
                onToggle={() => setActivityLogExpanded((v) => !v)}
                getUserName={(id) => getLawyerName(id)}
              />

              {selectedConsultation.response && (
                <div className="text-right">
                  <Label className="text-muted-foreground">الرد</Label>
                  <p className="p-3 bg-muted rounded-md">{selectedConsultation.response}</p>
                </div>
              )}
              {selectedConsultation.reviewNotes && (
                <div className="text-right">
                  <Label className="text-muted-foreground">ملاحظات المراجعة</Label>
                  <p className="p-3 bg-destructive/10 text-destructive rounded-md">
                    {selectedConsultation.reviewNotes}
                  </p>
                </div>
              )}

              {/* Phase-5: collapsible delivery-extension history. Fetched
                  on dialog-open (see useEffect below). Hidden when there
                  are no extensions to avoid noise. */}
              {deliveryExtensions.length > 0 && (
                <div className="text-right border rounded-lg p-3 bg-muted/20">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium w-full text-right"
                    onClick={() => setExtensionsExpanded((v) => !v)}
                    data-testid="button-toggle-extensions"
                  >
                    <span>سجل تمديدات التسليم ({deliveryExtensions.length})</span>
                    <ChevronLeft
                      className={
                        "w-4 h-4 transition-transform " +
                        (extensionsExpanded ? "-rotate-90" : "")
                      }
                    />
                  </button>
                  {extensionsExpanded && (
                    <ul className="mt-3 space-y-2" data-testid="list-delivery-extensions">
                      {deliveryExtensions.map((ext) => (
                        <li
                          key={ext.id}
                          className="text-xs border-r-2 border-primary/40 pr-3 py-1"
                          data-testid={`extension-${ext.id}`}
                        >
                          <div className="font-medium">
                            <LtrInline>{formatExpectedDate(ext.oldExpectedDeliveryDate)}</LtrInline>
                            {" ← "}
                            <LtrInline>{formatExpectedDate(ext.newExpectedDeliveryDate)}</LtrInline>
                          </div>
                          {ext.reason && (
                            <div className="text-muted-foreground mt-0.5">
                              <BidiText>{ext.reason}</BidiText>
                            </div>
                          )}
                          <div className="text-muted-foreground mt-0.5">
                            بواسطة <BidiText>{getLawyerName(ext.extendedBy)}</BidiText>
                            {" • "}
                            <LtrInline>{formatExpectedDate(ext.extendedAt)}</LtrInline>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
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

      {/* "تعديل البيانات" — record-level correction. Field controls are reused
          verbatim from the create dialog (ClientAutocomplete, the source
          Select, the question Textarea) so the two forms cannot drift.
          Deliberately NARROW: type / category / department / assignee /
          delivery date / priority / reviewer are all excluded because each has
          its own dedicated action elsewhere, and every workflow field
          (currentStage, status, closure, followUpCount) is excluded outright. */}
      <Dialog
        open={!!editConsultation}
        onOpenChange={(open) => { if (!open) setEditConsultation(null); }}
      >
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              تعديل بيانات الاستشارة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>العميل</Label>
              <ClientAutocomplete
                value={editForm.clientId}
                onChange={(clientId) => setEditForm({ ...editForm, clientId })}
              />
            </div>
            <div>
              <Label>وصلتنا عبر</Label>
              <Select
                value={editForm.source}
                onValueChange={(value) => setEditForm({ ...editForm, source: value })}
              >
                <SelectTrigger data-testid="select-edit-consultation-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.values(ConsultationSource) as string[]).map((s) => (
                    <SelectItem key={s} value={s} data-testid={`option-edit-source-${s}`}>
                      {ConsultationSourceLabels[s as keyof typeof ConsultationSourceLabels] || s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>نص الاستشارة</Label>
              <Textarea
                data-testid="input-edit-question-summary"
                value={editForm.questionSummary}
                onChange={(e) => setEditForm({ ...editForm, questionSummary: e.target.value })}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" data-testid="button-cancel-edit-consultation" onClick={() => setEditConsultation(null)}>
              إلغاء
            </Button>
            <Button
              data-testid="button-save-edit-consultation"
              onClick={handleEditConsultation}
              disabled={editSaving || !editForm.clientId || !editForm.questionSummary.trim()}
            >
              حفظ التعديل
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
            <Button
              onClick={handleAssignConsultation}
              disabled={!assignData.lawyerId || actionInProgress}
              data-testid="button-confirm-assign"
            >
              <UserPlus className="w-4 h-4 ml-2" />
              إسناد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showAdvanceDialog} onOpenChange={(open) => { if (!open) { setShowAdvanceDialog(false); setAdvanceConsultation(null); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>نقل الاستشارة للمرحلة التالية</AlertDialogTitle>
            <AlertDialogDescription>
              {advanceConsultation && user ? (
                (() => {
                  const target = getAdvanceTarget(advanceConsultation, user.role, user.id, user.departmentId);
                  const fromLabel = ConsultationStageLabels[advanceConsultation.currentStage] || advanceConsultation.currentStage;
                  const toLabel = target ? (ConsultationStageLabels[target] || target) : "";
                  return (
                    <>
                      سيتم نقل الاستشارة من <strong>{fromLabel}</strong> إلى <strong>{toLabel}</strong>.
                    </>
                  );
                })()
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {advanceConsultation && user
            && getAdvanceTarget(advanceConsultation, user.role, user.id, user.departmentId) === ConsultationStage.INTERNAL_REVIEW && (
            <div className="space-y-1" dir="rtl">
              <Label className="text-sm font-semibold">
                المراجع الداخلي <span className="text-red-500">*</span>
              </Label>
              <Select
                value={advanceReviewerId || "none"}
                onValueChange={(v) => setAdvanceReviewerId(v === "none" ? "" : v)}
              >
                <SelectTrigger data-testid="select-advance-reviewer">
                  <SelectValue placeholder="اختر مراجعاً" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— اختر مراجعاً —</SelectItem>
                  {users
                    .filter(u =>
                      u.isActive
                      && u.role !== "branch_manager" && u.role !== "admin_support"
                      && u.role !== "hr" && u.role !== "technical_support"
                      && u.departmentId === advanceConsultation.departmentId
                      && u.id !== advanceConsultation.assignedTo
                    )
                    .map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                يُعرض المراجع المعيَّن إن وُجد، أو اختر مراجعاً الآن (لا يكون المحامي المسند إليه).
              </p>
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-advance">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAdvanceStage}
              disabled={
                actionInProgress
                || (!!advanceConsultation && !!user
                  && getAdvanceTarget(advanceConsultation, user.role, user.id, user.departmentId) === ConsultationStage.INTERNAL_REVIEW
                  && !advanceReviewerId)
              }
              data-testid="button-confirm-advance"
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReturnDialog} onOpenChange={(open) => { if (!open) { setShowReturnDialog(false); setReturnConsultation(null); setReturnTargetStage(""); } }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إرجاع الاستشارة لمرحلة سابقة</AlertDialogTitle>
            <AlertDialogDescription>
              {returnConsultation && user ? (() => {
                const targets = getReturnTargets(returnConsultation, user.role, user.id, user.departmentId);
                if (targets.length === 1) {
                  const lbl = ConsultationStageLabels[targets[0]] || targets[0];
                  return (
                    <>
                      يمكنك إرجاع الاستشارة إلى المرحلة السابقة فقط: <strong>{lbl}</strong>.
                    </>
                  );
                }
                return <>اختر المرحلة التي تريد إرجاع الاستشارة إليها.</>;
              })() : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {returnConsultation && user && (() => {
            const targets = getReturnTargets(returnConsultation, user.role, user.id, user.departmentId);
            if (targets.length <= 1) return null;
            return (
              <div className="mt-3 space-y-1" dir="rtl">
                <Label className="text-sm font-semibold">المرحلة المستهدفة <span className="text-red-500">*</span></Label>
                <Select value={returnTargetStage} onValueChange={setReturnTargetStage}>
                  <SelectTrigger data-testid="select-return-target-stage">
                    <SelectValue placeholder="اختر المرحلة" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {ConsultationStageLabels[stage] || stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-cancel-return">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReturnStage}
              disabled={actionInProgress || !returnTargetStage}
              data-testid="button-confirm-return"
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <Dialog
        open={showInternalReviewDialog}
        onOpenChange={(open) => { if (!open) closeInternalReviewDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              المراجعة الداخلية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              اختر نتيجة المراجعة. <strong>اعتماد</strong> ينقل الاستشارة إلى لجنة المراجعة،
              و<strong>يوجد ملاحظات</strong> يعيدها إلى مرحلة التحرير.
            </p>
            <div>
              <Label>الملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-internal-review-notes"
                value={internalReviewNotes}
                onChange={(e) => setInternalReviewNotes(e.target.value)}
                placeholder="ملاحظات المراجع الداخلي..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeInternalReviewDialog}
              data-testid="button-cancel-internal-review"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-internal-review-needs-notes"
              onClick={() => handleInternalReview(InternalReviewDecision.NEEDS_NOTES)}
              disabled={actionInProgress}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              يوجد ملاحظات
            </Button>
            <Button
              data-testid="button-internal-review-passed"
              onClick={() => handleInternalReview(InternalReviewDecision.PASSED)}
              disabled={actionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCommitteeDialog}
        onOpenChange={(open) => { if (!open) closeCommitteeDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              قرار لجنة المراجعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <strong>اعتماد</strong> ينقل الاستشارة إلى مرحلة "جاهزة للتسليم"،
              و<strong>يوجد ملاحظات</strong> ينقلها إلى "الأخذ بالملاحظات".
            </p>
            <div>
              <Label>ملاحظات اللجنة (اختياري)</Label>
              <Textarea
                data-testid="input-committee-notes"
                value={committeeNotes}
                onChange={(e) => setCommitteeNotes(e.target.value)}
                placeholder="ملاحظات اللجنة للمحامي المسؤول..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeCommitteeDialog}
              data-testid="button-cancel-committee"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-committee-needs-notes"
              onClick={() => handleCommitteeDecision(CommitteeDecision.NEEDS_NOTES)}
              disabled={actionInProgress}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              يوجد ملاحظات
            </Button>
            <Button
              data-testid="button-committee-approved"
              onClick={() => handleCommitteeDecision(CommitteeDecision.APPROVED)}
              disabled={actionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reasoned override — skip-committee dialog. Moves the consultation
          straight to جاهزة_للإرسال with NO committee decision; the reason is
          MANDATORY and is recorded (with the acting name) in the activity
          timeline, which auto-refreshes on updatedAt. */}
      <Dialog
        open={showSkipCommitteeDialog}
        onOpenChange={(open) => { if (!open) closeSkipCommitteeDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              تجاوز مرحلة لجنة المراجعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم نقل الاستشارة مباشرةً إلى <strong>جاهزة للإرسال</strong> دون قرار من لجنة
              المراجعة. يُسجَّل هذا الإجراء في سجل نشاط الاستشارة مع اسمك والسبب. السبب إلزامي.
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
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeSkipCommitteeDialog}
              data-testid="button-cancel-skip-committee"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-confirm-skip-committee"
              onClick={handleSkipCommittee}
              disabled={actionInProgress || !skipCommitteeReason.trim()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              تأكيد التجاوز
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showTakeNotesDialog}
        onOpenChange={(open) => { if (!open) closeTakeNotesDialog(); }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              نتيجة الأخذ بالملاحظات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              اختر نتيجة معالجة ملاحظات اللجنة. تم/جزئياً/لم يتم تنقل الاستشارة إلى
              "جاهزة للتسليم". "إعادة للجنة المراجعة" ترجعها للجنة (تتطلب ملاحظات).
            </p>
            <div>
              <Label>الملاحظات (مطلوبة عند الإعادة للجنة)</Label>
              <Textarea
                data-testid="input-take-notes-notes"
                value={takeNotesNotes}
                onChange={(e) => setTakeNotesNotes(e.target.value)}
                placeholder="ملاحظات حول معالجة ملاحظات اللجنة / ما تم تطبيقه أو سبب الإعادة..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={closeTakeNotesDialog}
              data-testid="button-cancel-take-notes"
            >
              إلغاء
            </Button>
            <Button
              variant="outline"
              data-testid="button-return-to-committee"
              onClick={handleReturnConsultationToCommittee}
              disabled={actionInProgress || !takeNotesNotes.trim()}
              className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
            >
              إعادة للجنة المراجعة
            </Button>
            <Button
              data-testid="button-take-notes-not-done"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.NOT_DONE)}
              disabled={actionInProgress}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              لم يتم
            </Button>
            <Button
              data-testid="button-take-notes-partial"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.PARTIAL)}
              disabled={actionInProgress}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              جزئياً
            </Button>
            <Button
              data-testid="button-take-notes-done"
              onClick={() => handleTakeNotesOutcome(NoteOutcome.DONE)}
              disabled={actionInProgress}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              تم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showConvertDialog}
        onOpenChange={(open) => { if (!open) closeConvertDialog(); }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSymlink className="w-5 h-5" />
              تحويل الاستشارة لقضية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم إنشاء قضية جديدة مرتبطة بهذه الاستشارة. حالة الاستشارة ستصبح
              <strong> "محولة" </strong>
              ولن يمكن التراجع. اختر مرحلة بداية القضية والقسم.
            </p>
            <div>
              <Label>مرحلة بداية القضية <span className="text-red-500">*</span></Label>
              <Select
                value={convertData.targetCaseStage}
                onValueChange={(value) => setConvertData({ ...convertData, targetCaseStage: value })}
              >
                <SelectTrigger data-testid="select-target-case-stage">
                  <SelectValue placeholder="اختر المرحلة" />
                </SelectTrigger>
                <SelectContent>
                  {CaseStagesOrder.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {CaseStageLabels[stage] || stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>قسم القضية <span className="text-red-500">*</span></Label>
              <Select
                value={convertData.caseDepartmentId}
                onValueChange={(value) => setConvertData({ ...convertData, caseDepartmentId: value })}
              >
                <SelectTrigger data-testid="select-case-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                      {convertConsultation && dept.id === convertConsultation.departmentId
                        ? " (افتراضي)"
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                الافتراضي هو قسم الاستشارة. يمكنك اختيار قسم مختلف للقضية الجديدة.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeConvertDialog}
              data-testid="button-cancel-convert"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleConvertToCase}
              disabled={
                actionInProgress ||
                !convertData.targetCaseStage ||
                !convertData.caseDepartmentId
              }
              data-testid="button-confirm-convert"
            >
              <FileSymlink className="w-4 h-4 ml-2" />
              تحويل لقضية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEarlyCloseDialog}
        onOpenChange={(open) => { if (!open) closeEarlyCloseDialog(); }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              إغلاق الاستشارة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم إقفال الاستشارة وتعطيل جميع إجراءات سير العمل. هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div>
              <Label>سبب الإغلاق <span className="text-red-500">*</span></Label>
              <Select
                value={earlyCloseReason}
                onValueChange={(v) => setEarlyCloseReason(v as ConsultationClosureReasonValue)}
              >
                <SelectTrigger data-testid="select-closure-reason">
                  <SelectValue placeholder="اختر سبب الإغلاق" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.values(ConsultationClosureReason) as ConsultationClosureReasonValue[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ConsultationClosureReasonLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {earlyCloseReason === ConsultationClosureReason.OTHER && (
              <div>
                <Label>توضيح السبب <span className="text-red-500">*</span></Label>
                <Textarea
                  data-testid="input-closure-reason-other"
                  value={earlyCloseOtherText}
                  onChange={(e) => setEarlyCloseOtherText(e.target.value)}
                  placeholder="اكتب سبب الإغلاق..."
                  rows={3}
                />
              </div>
            )}
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-closure-notes"
                value={earlyCloseNotes}
                onChange={(e) => setEarlyCloseNotes(e.target.value)}
                placeholder="ملاحظات إضافية للأرشيف..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeEarlyCloseDialog}
              data-testid="button-cancel-early-close"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleEarlyClose}
              disabled={
                actionInProgress ||
                !earlyCloseReason ||
                (earlyCloseReason === ConsultationClosureReason.OTHER && !earlyCloseOtherText.trim())
              }
              data-testid="button-confirm-early-close"
            >
              <XCircle className="w-4 h-4 ml-2" />
              تأكيد الإغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showExtendDialog}
        onOpenChange={(open) => { if (!open) closeExtendDialog(); }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              تمديد تاريخ التسليم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-right">
            <p className="text-sm text-muted-foreground">
              التمديد يسجَّل في سجل التمديدات ويصبح هو التاريخ المتوقع الجديد.
              لا يمكن أن يكون قبل التاريخ الحالي أو مساوياً له.
            </p>
            {extendConsultation && (
              <div className="text-xs text-muted-foreground">
                التاريخ الحالي:{" "}
                <LtrInline>{formatExpectedDate(extendConsultation.expectedDeliveryDate)}</LtrInline>
              </div>
            )}
            <div>
              <Label>تاريخ التسليم الجديد <span className="text-red-500">*</span></Label>
              <HijriDatePicker
                value={extendNewDate}
                onChange={setExtendNewDate}
                data-testid="input-extend-new-date"
              />
            </div>
            <div>
              <Label>سبب التمديد <span className="text-red-500">*</span></Label>
              <Textarea
                data-testid="input-extend-reason"
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
                placeholder="اكتب سبب تمديد التسليم..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={closeExtendDialog}
              data-testid="button-cancel-extend"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleExtendDelivery}
              disabled={
                actionInProgress ||
                !extendNewDate ||
                !extendReason.trim()
              }
              data-testid="button-confirm-extend"
            >
              تأكيد التمديد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase-8 — await-completion dialog. Reason required. */}
      <AlertDialog open={showAwaitDialog} onOpenChange={(open) => { if (!open) closeAwaitDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              بانتظار استكمال البيانات
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستُحفظ المرحلة الحالية وتُنقل الاستشارة مؤقتاً إلى مرحلة "استكمال المرفقات والبيانات".
              عند اكتمال البيانات استخدم زر "تم الاستكمال" للعودة إلى المرحلة المحفوظة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>السبب <span className="text-red-500">*</span></Label>
            <Textarea
              data-testid="input-await-reason"
              value={awaitReason}
              onChange={(e) => setAwaitReason(e.target.value)}
              placeholder="ما هي البيانات أو المرفقات الناقصة؟"
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeAwaitDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-await"
              onClick={handleAwaitCompletion}
              disabled={actionInProgress || !awaitReason.trim()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <AlertTriangle className="w-4 h-4 ml-2" />
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — resume from completion dialog. Notes optional. */}
      <AlertDialog open={showResumeDialog} onOpenChange={(open) => { if (!open) closeResumeDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              تم الاستكمال
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستعود الاستشارة إلى المرحلة المحفوظة قبل دخول مرحلة الاستكمال
              {resumeTarget?.savedStage && (
                <>: <strong>{ConsultationStageLabels[resumeTarget.savedStage as ConsultationStageValue] || resumeTarget.savedStage}</strong></>
              )}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              data-testid="input-resume-notes"
              value={resumeNotes}
              onChange={(e) => setResumeNotes(e.target.value)}
              placeholder="اكتب ملاحظات حول ما تم استكماله..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeResumeDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-resume"
              onClick={handleResumeFromCompletion}
              disabled={actionInProgress}
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              تأكيد العودة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — skip-completion dialog. No body; just confirms intent. */}
      <AlertDialog open={showSkipDialog} onOpenChange={(open) => { if (!open) closeSkipDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileSymlink className="w-5 h-5" />
              تجاوز مرحلة الاستكمال
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تجاوز مرحلة "استكمال المرفقات والبيانات" والانتقال مباشرة إلى مرحلة "دراسة".
              استخدم هذا الخيار فقط عندما لا تكون هناك بيانات أو مرفقات ناقصة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeSkipDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-skip"
              onClick={handleSkipCompletion}
              disabled={actionInProgress}
            >
              <FileSymlink className="w-4 h-4 ml-2" />
              تأكيد التجاوز
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — pause dialog. Reason is required; the server also
          enforces the trim/min-1 check. */}
      {/* Start-follow-up dialog. Required Textarea — the customer's new
          follow-up question. The body is sent to /start-follow-up and the
          server stores it in the FOLLOW_UP_STARTED activity metadata; the
          dialog body surfaces it in a highlighted "السؤال التعقيبي الحالي"
          card during an active cycle. */}
      <AlertDialog open={showFollowUpDialog} onOpenChange={(open) => { if (!open) closeFollowUpDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCw className="w-5 h-5 text-blue-600" />
              بدء استشارة تعقيبية #{(followUpTarget?.followUpCount ?? 0) + 1}
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم فتح الاستشارة من جديد في مرحلة الاستلام مع تجديد مهلة التسليم.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>السؤال أو الاستفسار الجديد <span className="text-red-500">*</span></Label>
            <Textarea
              data-testid="input-follow-up-question"
              value={followUpQuestion}
              onChange={(e) => setFollowUpQuestion(e.target.value)}
              placeholder="اكتب السؤال الذي طرحه العميل..."
              rows={4}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeFollowUpDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-start-follow-up"
              onClick={handleStartFollowUp}
              disabled={actionInProgress || !followUpQuestion.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <RotateCw className="w-4 h-4 ml-2" />
              بدء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPauseDialog} onOpenChange={(open) => { if (!open) closePauseDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Pause className="w-5 h-5 text-amber-600" />
              تعليق الاستشارة
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إيقاف العمل على هذه الاستشارة مؤقتاً مع الاحتفاظ بمرحلتها الحالية.
              يمكن استئنافها لاحقاً عبر "إلغاء التعليق".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>سبب التعليق <span className="text-red-500">*</span></Label>
            <Textarea
              data-testid="input-pause-reason"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="اكتب سبب التعليق..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closePauseDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-pause"
              onClick={handlePause}
              disabled={actionInProgress || !pauseReason.trim()}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Pause className="w-4 h-4 ml-2" />
              تأكيد التعليق
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Phase-8 — unpause dialog. Notes optional; passed through to the
          activity-log description when present. */}
      <AlertDialog open={showUnpauseDialog} onOpenChange={(open) => { if (!open) closeUnpauseDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              إلغاء تعليق الاستشارة
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستعود الاستشارة إلى الحالة النشطة عند نفس مرحلتها قبل التعليق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              data-testid="input-unpause-notes"
              value={unpauseNotes}
              onChange={(e) => setUnpauseNotes(e.target.value)}
              placeholder="اكتب ملاحظات حول إلغاء التعليق..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closeUnpauseDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-unpause"
              onClick={handleUnpause}
              disabled={actionInProgress}
            >
              <Play className="w-4 h-4 ml-2" />
              تأكيد إلغاء التعليق
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
