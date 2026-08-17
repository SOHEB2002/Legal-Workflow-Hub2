import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePageSize } from "@/hooks/use-page-size";
import { usePersistedFilter, objectLike } from "@/hooks/use-persisted-state";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
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
import { Plus, MessageSquare, CheckCircle, FileText, ClipboardCheck, Bell, MoreHorizontal, UserPlus, ArrowLeftRight, Trash2, ChevronLeft, ChevronRight, FileSymlink, XCircle, ExternalLink, AlertTriangle, Sparkles, Clock, ListChecks, Pause, Play, RotateCw, RotateCcw, Pencil, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConsultations } from "@/lib/consultations-context";
import { useFavorites } from "@/lib/favorites-context";
import { useClients } from "@/lib/clients-context";
import { ClientAutocomplete } from "@/components/client-autocomplete";
import { useAuth } from "@/lib/auth-context";
import { anyIdentity, firstForIdentity, hasEffectiveRole, isDeptHeadFor, unionForIdentity } from "@/lib/acting-identities";
import { useDepartments } from "@/lib/departments-context";
import type {
  Consultation,
  ConsultationStageValue,
  InternalReviewDecisionValue,
  CommitteeDecisionValue,
  NoteOutcomeValue,
  ConsultationClosureReasonValue,
  ConsultationCategoryValue,
  ConsultationPriorityValue,
  ConsultationActivity,
  UserRoleType,
} from "@shared/schema";
import {
  ConsultationStage,
  ConsultationStageLabels,
  consultationSkipDataCompletionTarget,
  getConsultationReopenTargetStages,
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
  consultationStagesForDepartment,
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
import {
  ConsultationsAdvancedFilters,
  EMPTY_CONSULTATIONS_FILTERS,
  type AdvancedConsultationsFilters,
} from "@/components/consultations-advanced-filters";
import { DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError, cn } from "@/lib/utils";
import { PauseUntilField, pauseUntilError } from "@/components/ui/pause-until-field";
import { pauseBadgeTooltip, STAGE_BADGE_WRAP_CLASS } from "@/lib/case-stage-utils";
import { sendConsultationReminder } from "@/lib/notification-triggers";

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
  // Phase-8 — RECEIVED advances to RECEIVED_PENDING_COMPLETION, and
  // RECEIVED_PENDING_COMPLETION advances to STUDY.
  //
  // The "تجاوز استكمال المرفقات والبيانات" button is NOT in this table: it is
  // a PRE-ENTRY skip offered at RECEIVED that jumps straight to STUDY via
  // /skip-data-completion, bypassing the middle stage entirely. It is
  // deliberately absent from the linear-advance table (and from
  // ALLOWED_CONSULTATION_TRANSITIONS) so the override stays unreachable
  // through /advance-stage — the same precedent skip-committee sets.
  [ConsultationStage.RECEIVED]:                    { target: ConsultationStage.RECEIVED_PENDING_COMPLETION, roles: ["admin_support", "department_head", "branch_manager"] },
  [ConsultationStage.RECEIVED_PENDING_COMPLETION]: { target: ConsultationStage.STUDY,                       roles: ["admin_support", "department_head", "branch_manager"] },
  // 🔴 THE MERGE — دراسة and تحرير are one stage «الدراسة والتحرير» (stored as
  // دراسة). The old STUDY→DRAFTING and DRAFTING→INTERNAL_REVIEW pair collapses
  // into this single edge. Mirrors ALLOWED_CONSULTATION_TRANSITIONS exactly.
  [ConsultationStage.STUDY]:    { target: ConsultationStage.INTERNAL_REVIEW, roles: ["assigned_lawyer", "department_head", "branch_manager"] },
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
  // WIDENED MODEL — mirrors the tier bypass in validateStageTransition: own-dept
  // department_head and the assigned lawyer may traverse any edge that is NOT a
  // committee decision. None of the LINEAR_ADVANCE_* tables contains a committee
  // edge (those run through the dedicated committee dialog), so the tier applies to
  // every rule reachable here.
  // ⚠ EXCEPT FINAL CLOSURE (owner-adopted carve-out) — → CLOSED_FINAL is DEPARTMENT
  // tier and above, so the assignee is excluded from that one edge and falls through
  // to the table's own roles (admin_support | branch_manager). Early-close is a
  // separate action (canEarlyClose) and is unaffected.
  const isFinalClosureEdge = rule.target === ConsultationStage.CLOSED_FINAL;
  const isDeptTier =
    userRole === "branch_manager"
    || (userRole === "department_head" && !!userDeptId && !!consultation.departmentId
        && consultation.departmentId === userDeptId);
  if (isDeptTier) return rule.target;
  if (!isFinalClosureEdge && consultationActorTier(consultation, userRole, userId, userDeptId)) {
    return rule.target;
  }
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
  // The consultation's department NAME, for the committee hide — threaded from
  // the call sites (the page has getDepartmentName) so this stays a pure
  // function of its arguments, like its contracts twin.
  departmentName: string | null,
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
  // Committee hide — a labor consultation must not be offered a rollback INTO
  // لجنة_مراجعة. A no-op on the cycle and phone/procedural branches above,
  // which have no committee stage to remove.
  stages = consultationStagesForDepartment(departmentName, stages);
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
// 🔴 HUMAN-ONLY — PERMANENTLY EXCLUDED BY OWNER RULING, NOT PENDING. Its server
// counterpart (POST /api/consultations/:id/internal-review) was classified
// DELIBERATE in the raw-role audit — "HUMAN role only — not delegation-expanded,
// so a delegation can never manufacture the second pair of eyes" — and the owner
// ruled it stays raw-role permanently. Do not convert this in a later sweep.
//
// ITS SIGNATURE IS DIFFERENT FROM ITS SIBLINGS ON PURPOSE. Every other predicate on this page now
// takes an ActingIdentity[] and is evaluated once per identity; this one keeps
// taking the REAL signed-in user so no sweep over the flat-triple call pattern
// can convert it by accident. The four-eyes lock below must compare the actual
// human, exactly as the server does (routes.ts keeps isInternalReviewerHuman
// un-expanded "so a delegation can never manufacture a second pair of eyes").
function canDoInternalReview(
  consultation: Consultation,
  actor: { id: string; role: string; departmentId: string | null },
): boolean {
  const userRole = actor.role;
  const userId = actor.id;
  const userDeptId = actor.departmentId;
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
// FE mirror of the server's entityActorTier (routes.ts, "widened authority model").
// Same three tiers, same non-empty-department guard, and the same decision that
// createdBy is NOT an assignment. Every widened consultation gate routes through
// this so the page cannot drift from the server.
function consultationActorTier(
  c: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (userRole === "branch_manager") return true;
  if (
    userRole === "department_head"
    && !!userDeptId
    && !!c.departmentId
    && c.departmentId === userDeptId
  ) return true;
  return !!c.assignedTo && c.assignedTo === userId;
}

function canConvertToCase(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "active") return false;
  if (consultation.currentStage === ConsultationStage.COMPLETED) return false;
  // Mirror the server guard: a follow-up cycle isn't convertible (the
  // original consultation is already done; cycles are post-closure
  // follow-ups, not new-case material).
  if ((consultation.followUpCount ?? 0) > 0) return false;
  if (userRole === "admin_support") return true;
  // WIDENED MODEL — + the assigned lawyer; branch_manager and own-dept
  // department_head come through the tier helper unchanged.
  return consultationActorTier(consultation, userRole, userId, userDeptId);
}

// Arabic display labels for ConsultationClosureReason. Schema keeps the
// enum values in English keys per spec §3.2.4 ("Frontend will localise
// the labels"), so the mapping lives here at the page boundary.
const ConsultationClosureReasonLabels: Record<ConsultationClosureReasonValue, string> = {
  client_cancelled:  "إلغاء العميل",
  answered_verbally: "تم الرد شفهياً",
  duplicate:         "استشارة مكررة",
  no_longer_needed:  "لم تعد مطلوبة",
  // Written only by /close-no-response, never offered in the early-close
  // picker below (which filters this member out) — but it MUST have a label,
  // because the timeline and the closed-row display resolve every stored value
  // through this map.
  data_not_completed: "عدم استكمال البيانات",
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

// ===== STAGE-FILTER LABELS =====
// 🔴 FILTER-ONLY. This does NOT touch ConsultationStageLabels, which drives the
// per-row badge and is shared across the app — only the wording inside the
// المرحلة dropdown.
//
// WHY IT IS NEEDED: getConsultationDisplayStage (directly above) deliberately
// FOLDS lifecycle state into two stage values, so those two options select more
// than their stage name says:
//   • منجزة  ← every closed and every converted consultation, at ANY real stage,
//              PLUS the ones genuinely sitting at منجزة. So a consultation closed
//              while at جاهزة_للإرسال is selected by an option reading
//              "جاهزة للإغلاق" — which is the opposite of true: it is already shut.
//   • استكمال_المرفقات_والبيانات ← every PAUSED consultation, at any stage.
// Both names described one member of the set and hid the rest. The labels below
// name every member, using ONLY vocabulary the page already uses
// (ConsultationStatusDisplayLabels: مقفلة / محولة لقضية / معلّقة) — nothing is
// invented, and each row already carries the matching lifecycle pill, so the
// dropdown and the table now say the same thing.
const STAGE_FILTER_LABEL: Partial<Record<ConsultationStageValue, string>> = {
  [ConsultationStage.COMPLETED]: "جاهزة للإغلاق أو مقفلة أو محولة",
  [ConsultationStage.RECEIVED_PENDING_COMPLETION]: "استكمال المرفقات والبيانات أو معلّقة",
};

// Canonical ordering for the derived stage options. The workflow order, with the
// two terminal buckets last — the raw ConsultationStagesAll could not be reused
// because it places مغلقة (CLOSED_FINAL) mid-array, which put a terminal state
// mid-list in the dropdown.
const STAGE_FILTER_ORDER: ConsultationStageValue[] = [
  ConsultationStage.RECEIVED,
  ConsultationStage.RECEIVED_PENDING_COMPLETION,
  // STUDY renders as «الدراسة والتحرير» — the merged stage. تحرير is NOT an
  // option any more: no consultation can sit on it, so the filter would always
  // return an empty list.
  ConsultationStage.STUDY,
  ConsultationStage.IN_PROGRESS,
  ConsultationStage.INTERNAL_REVIEW,
  ConsultationStage.COMMITTEE,
  ConsultationStage.TAKING_NOTES,
  ConsultationStage.READY,
  ConsultationStage.COMPLETED,
  ConsultationStage.CLOSED_FINAL,
];

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
  // DRAFTING dropped with the merge. Behaviour is unchanged because STUDY —
  // the surviving value — was already in this set, so every consultation that
  // counted as "action required from us" still does.
  ConsultationStage.STUDY,
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

// Gate for the PRE-ENTRY skip ("تجاوز استكمال المرفقات والبيانات"), mirroring
// POST /api/consultations/:id/skip-data-completion.
//
// ⚠ DELIBERATELY A SEPARATE PREDICATE from canPauseConsultation, even though
// the two role sets read alike today. Same reasoning as the server keeping
// canCheckInHearing apart from canActOnHearing: one gate must not be widened
// by an edit aimed at the other. It also lets this one carry the mandatory
// !!user.departmentId guard — without it a head whose department is null
// matches every record whose department is also null — without touching the
// pause gate, which is shared by several unrelated controls and is not this
// batch's to change.
function canSkipConsultationDataCompletion(
  c: Consultation,
  user: { id: string; role: string; departmentId: string | null } | null,
): boolean {
  if (!user) return false;
  if (user.role === "branch_manager" || user.role === "admin_support") return true;
  if (user.role === "department_head" && !!user.departmentId && c.departmentId === user.departmentId) return true;
  return c.assignedTo === user.id;
}

// 🔴 THE SINGLE SOURCE OF TRUTH for whether the "تجاوز استكمال المرفقات
// والبيانات" control is offered — the FULL visibility gate (record state +
// the permission predicate above), not just the permission half.
//
// Both surfaces call this: the row's ⋯ menu item and the details-dialog
// button. It was previously written out twice, which is a standing invitation
// for the two to disagree about when the control shows.
//
// Placed directly beneath canSkipConsultationDataCompletion because it wraps
// it — the permission tier and the state tier of one decision stay adjacent
// and are read together.
//
// Captures nothing from any component closure: every term resolves to a
// module import (ConsultationStage, consultationSkipDataCompletionTarget) or
// to this file's own module-scope predicate, with the record and user passed
// in. That is what makes hoisting it out of JSX a pure relocation.
function canOfferSkipDataCompletion(
  c: Consultation,
  user: { id: string; role: string; departmentId: string | null } | null,
): boolean {
  return c.status === "active"
    && c.currentStage === ConsultationStage.RECEIVED
    && !c.awaitingCompletion
    && !!consultationSkipDataCompletionTarget(c)
    && canSkipConsultationDataCompletion(c, user);
}

// Render a timestamp as a short, locale-agnostic ISO date (YYYY-MM-DD).
//
// ⚠ The NAME is historical — it was written for the expectedDeliveryDate row,
// which has since been removed. It is now a GENERIC date formatter and is still
// used for pausedAt and createdAt elsewhere on this page, so it must NOT be
// deleted along with the delivery feature. (isConsultationOverdue, its former
// companion, WAS deleted: it read expectedDeliveryDate and had no other use.)
// 🔴 LOCAL, not UTC. This returned d.toISOString().slice(0, 10), which renders
// the UTC calendar day — so between 00:00 and 03:00 Riyadh it showed YESTERDAY
// for both of its callers (the pause banner and تاريخ الاستشارة). Date only, as
// before; only the calendar was wrong.
function formatExpectedDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar");
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

// "إغلاق لعدم استكمال البيانات" gate — restates POST
// /api/consultations/:id/close-no-response so visibility === authorization.
// ROLE tier is canEarlyClose verbatim (this IS a close, and the endpoint copies
// the early-close gate), plus the endpoint's own state conditions.
//
// Keyed on the STAGE, not on awaitingCompletion: a consultation reaches
// RECEIVED_PENDING_COMPLETION both by the ordinary advance (latch false) and via
// /await-completion (latch true), and the button must appear for both.
function canCloseForNoResponse(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.currentStage !== ConsultationStage.RECEIVED_PENDING_COMPLETION) return false;
  // The endpoint 400s on a paused row; canEarlyClose already covers
  // status !== "active", which is what a paused consultation carries.
  if (consultation.pausedAt) return false;
  return canEarlyClose(consultation, userRole, userId, userDeptId);
}

// FE permission gate mirroring POST /api/consultations/:id/start-follow-up.
// WIDENED MODEL — was admin-only. Own-dept department_head and the assigned
// lawyer may now open a cycle, which also aligns this with the CONTRACTS twin
// (contracts.tsx canStartFollowUp), which already used the wider set.
function canStartFollowUp(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "closed") return false;
  if (userRole === "admin_support") return true;
  return consultationActorTier(consultation, userRole, userId, userDeptId);
}

// Restates POST /api/consultations/:id/reopen so visibility == authorization.
// The CLOSE tier with the status check inverted — including its TYPE SPLIT,
// which canStartFollowUp above does NOT have: /early-close narrows PHONE and
// PROCEDURAL to admin_support | branch_manager, and reopen copies that gate, so
// mirroring canStartFollowUp here would show the button to actors the server
// rejects.
function canReopenConsultation(
  consultation: Consultation,
  userRole: string,
  userId: string,
  userDeptId: string | null,
): boolean {
  if (consultation.status !== "closed") return false;
  const resolved = resolveConsultationType(consultation.consultationType);
  if (resolved !== ConsultationType.WRITTEN) {
    return ["admin_support", "branch_manager"].includes(userRole);
  }
  if (["admin_support", "branch_manager"].includes(userRole)) return true;
  if (userRole === "department_head") {
    return !!userDeptId && !!consultation.departmentId && consultation.departmentId === userDeptId;
  }
  return !!consultation.assignedTo && consultation.assignedTo === userId;
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
  // 🔴 THIS LINE WAS SELF-CONTRADICTORY: the time (hh:mm above) comes from
  // getHours/getMinutes — LOCAL — while the date came from toISOString — UTC.
  // One string, two calendars, so between 00:00 and 03:00 Riyadh it read e.g.
  // "2026-08-09 01:30" for an event that happened on the 10th at 01:30 local.
  // Both halves are now local.
  return `${d.toLocaleDateString("ar")} ${hh}:${mm}`;
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
  const { user, permissions, users, actingIdentities } = useAuth();
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
  // CONSULTATIONS KEEP EVERY FILTER IN ONE OBJECT — including the search box and
  // the department, which the other pages hold as separate top-level state. So a
  // single persisted entry covers this page's whole filter bar.
  //
  // DEFAULT DEPARTMENT: departmentId is this page's dept filter ("" = any), so
  // the user's own department seeds it. A DEFAULT, not a restriction — every
  // department stays selectable, and a saved value always wins.
  //
  // SEARCH IS FORCED BACK TO "" ON READ, so it stays transient like the other
  // four pages even though it lives inside the persisted object. Restoring a
  // search string is the one filter users don't expect to come back, and it is
  // the hardest to spot: an invisible substring silently emptying the list.
  const [advFilters, setAdvFilters] = usePersistedFilter<AdvancedConsultationsFilters>(
    "consultations", "adv",
    { ...EMPTY_CONSULTATIONS_FILTERS, departmentId: user?.departmentId || "" },
    (raw) => {
      const shaped = objectLike(EMPTY_CONSULTATIONS_FILTERS, {
        // 🔴 EVERY stage value, not ConsultationStagesAll — the THIRD site with
        // the raw-enum-vs-display-stage mismatch, and it would have quietly
        // undone the fix. ConsultationStagesAll omits منجزة (COMPLETED) and
        // جاري_العمل (IN_PROGRESS), so a saved filter naming either was rejected
        // as out-of-domain on the next load: the user picks منجزة, navigates
        // away, comes back and the selection is gone. Object.values covers the
        // whole enum, which is the honest domain for a persisted stage value.
        stages: Object.values(ConsultationStage) as readonly string[],
        consultationTypes: Object.values(ConsultationType) as readonly string[],
      })(raw);
      return shaped === undefined ? undefined : { ...shaped, search: "" };
    },
  );

  // STALE-VALUE GUARD for the async department list — see the hearings/memos
  // twins. "" is this page's "any department" sentinel. The `length === 0` bail
  // keeps it from wiping a valid saved value before departments have loaded.
  useEffect(() => {
    if (departments.length === 0) return;
    if (advFilters.departmentId && !departments.some((d) => String(d.id) === advFilters.departmentId)) {
      setAdvFilters((prev) => ({ ...prev, departmentId: "" }));
    }
  }, [departments, advFilters.departmentId, setAdvFilters]);
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
  // ===== THE المرحلة OPTIONS, DERIVED FROM THE LOADED CONSULTATIONS =====
  // 🔴 DERIVED FROM THE VERY VALUE THE FILTER COMPARES — getConsultationDisplayStage
  // — so an option that matches nothing is impossible BY CONSTRUCTION rather than
  // by anyone remembering to keep two lists in step.
  //
  // WHAT IT REPLACES, and the bug it kills: the options used to come from the raw
  // stage enum (ConsultationStagesAll + IN_PROGRESS + COMPLETED) while the
  // predicate compared the DISPLAY stage. The two disagreed, and مغلقة was DEAD —
  // reaching that stage flips status to 'closed' in the same operation
  // (routes.ts, the CLOSED_FINAL transition comment), and a closed consultation
  // displays as منجزة, so no row could ever display as مغلقة. Selecting it always
  // returned an empty list.
  //
  // SAFE TO DERIVE: GET /api/consultations returns every row the user may see —
  // getAllConsultations is a bare `db.select().from(consultations)` with no LIMIT
  // or OFFSET, and this page's paging is a client-side `.slice()`. So the options
  // cover the whole visible set, not just the current page. (Checked before
  // writing this — a paginated source would have made derived options silently
  // incomplete, which is worse than the visible defect it replaces.)
  //
  // SCOPED BY THE TYPE FILTER, so the two COMPOSE instead of contradicting.
  // Previously choosing مكتوبة narrowed the list to that path's RAW stages, which
  // ends at مغلقة and excludes منجزة — while every closed written consultation
  // displays as منجزة. The result was a type+stage combination with NO option
  // that could match it. Deriving from the type-scoped rows makes that
  // unreachable. Scoped by type ONLY, deliberately: scoping by department or
  // lawyer as well would let a later change to those controls strand an already
  // chosen stage, and type is the one facet that genuinely determines which
  // stages a consultation can reach.
  const stageFilterOptions = useMemo(() => {
    const scoped = advFilters.consultationTypes.length > 0
      ? consultations.filter((c) =>
          advFilters.consultationTypes.includes(resolveConsultationType(c.consultationType)))
      : consultations;
    const present = new Set<ConsultationStageValue>();
    for (const c of scoped) present.add(getConsultationDisplayStage(c));
    return STAGE_FILTER_ORDER.filter((s) => present.has(s));
  }, [consultations, advFilters.consultationTypes]);

  // 🔴 THE PRUNE NOW SHARES stageFilterOptions — THE SAME LIST THE DROPDOWN
  // RENDERS — and that is required, not tidying. It used to build its own
  // `allowed` set from the RAW stage enum, which after the derivation change
  // would have DEFEATED the fix: منجزة is absent from WRITTEN's raw stage list,
  // so the moment a user picked it (legitimately — every closed written
  // consultation displays as منجزة) this effect would have seen it as invalid and
  // silently wiped the selection. The filter would have looked broken in a new
  // way. One list, one source of truth, no drift possible.
  //   ⚠ The two lists were ALREADY inconsistent before this: the dropdown
  //   appended COMPLETED while this prune appended CLOSED_FINAL.
  //
  // The empty guard matters: `consultations` is [] on first paint, so without it
  // the derived set would be empty and this would clear a stage that a DEEP LINK
  // had just set (?status=pending_review sets COMMITTEE in the effect above)
  // before any data arrived.
  useEffect(() => {
    if (consultations.length === 0) return;
    const allowed = new Set<string>(stageFilterOptions);
    if (advFilters.stages.some((s) => !allowed.has(s))) {
      setAdvFilters((prev) => ({
        ...prev,
        stages: prev.stages.filter((s) => allowed.has(s)),
      }));
    }
  }, [consultations.length, stageFilterOptions, advFilters.stages]);

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
  // OPTIONAL auto-lift date. "" = open-ended pause, the default and the
  // pre-feature behaviour.
  const [pauseUntil, setPauseUntil] = useState("");
  // Reopen — resume the ORIGINAL work at a chosen stage. Distinct from the
  // follow-up cycle, which starts a NEW 3-stage mini-flow on a finished matter.
  const [reopenTarget, setReopenTarget] = useState<Consultation | null>(null);
  const [reopenStage, setReopenStage] = useState("");
  const [reopenNotes, setReopenNotes] = useState("");
  const [reopenSaving, setReopenSaving] = useState(false);
  const [closeNoResponseTarget, setCloseNoResponseTarget] = useState<Consultation | null>(null);
  const [closeNoResponseNotes, setCloseNoResponseNotes] = useState("");
  const [closeNoResponseSaving, setCloseNoResponseSaving] = useState(false);
  const [showUnpauseDialog, setShowUnpauseDialog] = useState(false);
  const [unpauseTarget, setUnpauseTarget] = useState<Consultation | null>(null);
  const [unpauseNotes, setUnpauseNotes] = useState("");

  const openPauseDialog = (c: Consultation) => {
    setPauseTarget(c);
    setPauseReason("");
    setPauseUntil("");
    setShowPauseDialog(true);
  };
  const closePauseDialog = () => {
    setShowPauseDialog(false);
    setPauseTarget(null);
    setPauseReason("");
    setPauseUntil("");
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
    // Client half of the past-date rule; the server's validatePauseUntil (the
    // SAME shared function) stays authoritative.
    const untilError = pauseUntilError(pauseUntil);
    if (untilError) {
      toast({ title: untilError, variant: "destructive" });
      return;
    }
    const until = pauseUntil.trim();
    setActionInProgress(true);
    try {
      // pauseUntil omitted when blank — absent means open-ended, exactly as before.
      await apiRequest("POST", `/api/consultations/${pauseTarget.id}/pause`, until ? { reason, pauseUntil: until } : { reason });
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
  // PRE-ENTRY skip dialog state ("تجاوز استكمال المرفقات والبيانات" at استلام).
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipTarget, setSkipTarget] = useState<Consultation | null>(null);
  const [skipNotes, setSkipNotes] = useState("");

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
    setSkipNotes("");
    setShowSkipDialog(true);
  };
  const closeSkipDialog = () => {
    setShowSkipDialog(false);
    setSkipTarget(null);
    setSkipNotes("");
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
      const notes = skipNotes.trim();
      await apiRequest("POST", `/api/consultations/${skipTarget.id}/skip-data-completion`, notes ? { notes } : {});
      await refreshConsultations();
      toast({ title: "تم تجاوز مرحلة استكمال المرفقات والبيانات" });
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
    // The "no assignee → refuse" guard is GONE, and its removal is what makes
    // "reminders reach the department head too" actually true: an UNASSIGNED
    // consultation is the one most likely to be stalling, and the head is
    // exactly who should hear about it. The server resolves assignee + head,
    // notifies whoever exists, and 400s with its own Arabic message only when
    // NEITHER does — which the catch below surfaces.
    if (!reminderConsultation) return;
    const msg = reminderData.message || `${reminderData.reminderType} للاستشارة رقم ${reminderConsultation.consultationNumber}`;
    try {
      // The assignee is resolved SERVER-side now (along with the department
      // head), so the consultation's assignedTo is no longer passed from here.
      await sendConsultationReminder(reminderConsultation.id, reminderData.reminderType, msg);
      toast({ title: "تم إرسال التذكير بنجاح" });
    } catch (err) {
      // Surfaces the server's own Arabic reason — notably the "no assignee and
      // no active department head" 400, which a bare toast would have hidden.
      toast({ title: "فشل إرسال التذكير", description: extractApiError(err), variant: "destructive" });
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

  // "إغلاق لعدم استكمال البيانات" — no reason picker and no required text: the
  // closure reason is fixed (DATA_NOT_COMPLETED) and the missing-data text is
  // resolved SERVER-side from the activity log. Optional notes only.
  const handleReopen = async () => {
    if (!reopenTarget || !reopenStage) return;
    setReopenSaving(true);
    try {
      const notes = reopenNotes.trim();
      await apiRequest("POST", `/api/consultations/${reopenTarget.id}/reopen`, {
        targetStage: reopenStage,
        ...(notes ? { notes } : {}),
      });
      await refreshConsultations();
      toast({ title: "تم إعادة فتح الاستشارة" });
      setReopenTarget(null);
      setReopenStage("");
      setReopenNotes("");
    } catch (err) {
      toast({ title: "فشل إعادة الفتح", description: extractApiError(err), variant: "destructive" });
    } finally {
      setReopenSaving(false);
    }
  };

  const handleCloseNoResponse = async () => {
    if (!closeNoResponseTarget) return;
    setCloseNoResponseSaving(true);
    try {
      const notes = closeNoResponseNotes.trim();
      await apiRequest(
        "POST",
        `/api/consultations/${closeNoResponseTarget.id}/close-no-response`,
        notes ? { notes } : {},
      );
      await refreshConsultations();
      toast({ title: "تم إغلاق الاستشارة لعدم استكمال البيانات" });
      setCloseNoResponseTarget(null);
      setCloseNoResponseNotes("");
    } catch (err) {
      toast({ title: "فشل الإغلاق", description: extractApiError(err), variant: "destructive" });
    } finally {
      setCloseNoResponseSaving(false);
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

  // CREATE-SCOPE — department_head AND employee may open a consultation, but only in
  // THEIR OWN department. Mirrors POST /api/consultations + scopedCreateDepartmentId:
  // the picker is filtered to their department and locked, so the server's
  // cross-department 400 is unreachable through the UI.
  const canCreateConsultation =
    !!permissions.canAddCasesAndConsultations
    || (["department_head", "employee"].includes(user?.role ?? "") && !!user?.departmentId);
  const isDeptScopedCreator =
    user?.role === "department_head" || user?.role === "employee";
  const creatableDepartments = isDeptScopedCreator
    ? departments.filter((d) => d.id === user?.departmentId)
    : departments;
  const defaultCreateDepartmentId = isDeptScopedCreator ? (user?.departmentId || "") : "";

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
  // FREE WIN (widened model) — the assigned lawyer was excluded here even though
  // the SERVER's canModifyConsultation has always allowed them (and the creator) to
  // PATCH these exact fields. Now mirrors the server.
  // ==================== DELEGATION ADAPTERS ====================
  // The module predicates above are UNCHANGED; these evaluate each one over the
  // acting set (self + all_cases delegators), the same identities.some / first
  // -match shape the server uses. Every endpoint behind them was checked and
  // hands req.actingContext to validateStageTransition:
  //   /api/consultations/:id/advance-stage · /return-to-stage ·
  //   /skip-committee · /take-notes-outcome · /committee-decision
  // With no delegation the identity set is [self], so each adapter makes ONE
  // call with the user's own role/id/department — byte-identical to before.
  const advanceTargetFor = (c: Consultation) =>
    firstForIdentity(actingIdentities, (role, id, dept) => getAdvanceTarget(c, role, id, dept));
  const returnTargetsFor = (c: Consultation) =>
    unionForIdentity(actingIdentities, (role, id, dept) =>
      getReturnTargets(c, role, id, dept, getDepartmentName(c.departmentId)));
  const canSkipCommitteeFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, dept) => canSkipCommittee(c, role, id, dept));
  // Added by the follow-the-comments pass: these five endpoints joined the
  // delegation-aware set in the server batch (canActOnConsultationWorkflowState
  // / canCloseConsultationTier / the convert-to-case scope check), so the
  // mirrors held un-widened for them are converted here. Predicate bodies
  // unchanged; each is evaluated once per acting identity.
  const canEarlyCloseFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, dept) => canEarlyClose(c, role, id, dept));
  const canCloseForNoResponseFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, dept) => canCloseForNoResponse(c, role, id, dept));
  const canReopenConsultationFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, dept) => canReopenConsultation(c, role, id, dept));
  const canStartFollowUpFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, dept) => canStartFollowUp(c, role, id, dept));
  const canConvertToCaseFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, dept) => canConvertToCase(c, role, id, dept));
  // The pause family takes a user OBJECT rather than the flat triple, so the
  // adapter shapes one synthetic actor per identity instead of spreading args.
  const canPauseConsultationFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, departmentId) =>
      canPauseConsultation(c, { id, role, departmentId }));
  const canOfferSkipDataCompletionFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, departmentId) =>
      canOfferSkipDataCompletion(c, { id, role, departmentId }));
  const canDoTakeNotesOutcomeFor = (c: Consultation) =>
    anyIdentity(actingIdentities, (role, id, dept) => canDoTakeNotesOutcome(c, role, id, dept));
  // 🔴 COMMITTEE DECISION CARRIES A DELEGATE-ONLY FOUR-EYES OVERLAY, mirrored
  // here so the button cannot render and then 403. The server allows the
  // decision on the OWN role with no author exclusion, but when the authority is
  // DELEGATION-DERIVED it additionally refuses if the REAL human is the assigned
  // (authoring) lawyer: "لا يمكنك اعتماد قرار اللجنة على عمل أنت محرّره".
  // So: own role decides → unchanged; inherited role decides → only when the
  // real user is not the assignee.
  const canDoCommitteeDecisionFor = (c: Consultation, isLaborEntity: boolean) => {
    if (!user) return false;
    if (canDoCommitteeDecision(c, user.role, isLaborEntity)) return true;
    const viaDelegation = anyIdentity(actingIdentities, (role) =>
      canDoCommitteeDecision(c, role as UserRoleType, isLaborEntity));
    return viaDelegation && !(!!c.assignedTo && c.assignedTo === user.id);
  };

  // Delegation-aware: PATCH /api/consultations/:id is gated by
  // canModifyConsultation, which expands req.actingContext, so the mirror does
  // too. consultationActorTier itself is UNCHANGED and simply evaluated once per
  // acting identity — the same identities.some(predicate) shape the server helper
  // uses over canModifyConsultationIdentity.
  const canEditConsultation = (c: Consultation) => {
    if (!user) return false;
    if (hasEffectiveRole(actingIdentities, "branch_manager", "admin_support")) return true;
    return anyIdentity(actingIdentities, (role, id, dept) => consultationActorTier(c, role, id, dept));
  };

  const [editConsultation, setEditConsultation] = useState<Consultation | null>(null);
  const [editForm, setEditForm] = useState({
    clientId: "",
    title: "",
    consultationType: "",
    category: "",
    source: "",
    questionSummary: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const openEditConsultationDialog = (c: Consultation) => {
    setEditForm({
      clientId: c.clientId || "",
      title: c.title || "",
      consultationType: c.consultationType || ConsultationType.WRITTEN,
      category: c.category || ConsultationCategory.STANDARD,
      source: c.source || ConsultationSource.GROUP,
      questionSummary: c.questionSummary || "",
    });
    setEditConsultation(c);
  };

  const handleEditConsultation = async () => {
    if (!editConsultation) return;
    if (!editForm.clientId || !editForm.questionSummary.trim()) {
      toast({ title: "خطأ", description: "العميل وملخص السؤال مطلوبان", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      // consultationType is sent ONLY when it actually changed, so the server's
      // existing type-change branch runs the full dedicated flow —
      // remapConsultationStageForType + a TYPE_CHANGED activity entry — exactly
      // as the detail-panel Select does. The column is never written bare.
      const typeChanged = editForm.consultationType !== editConsultation.consultationType;
      await updateConsultation(editConsultation.id, {
        clientId: editForm.clientId,
        title: editForm.title.trim() || null,
        category: editForm.category as ConsultationCategoryValue,
        source: editForm.source as ConsultationSourceValue,
        questionSummary: editForm.questionSummary.trim(),
        ...(typeChanged ? { consultationType: editForm.consultationType } : {}),
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

  // Delegation-aware. POST /api/consultations/:id/assign joined the
  // delegation-aware set in the server batch — BOTH of its steps (the role list
  // and the dept-scope check) now resolve over req.actingContext — so this
  // mirror, held un-widened until exactly that happened, is converted.
  //
  // ⚠ The scope term now carries the mandatory !!departmentId guard, matching
  // the server: a null-department head no longer matches a null-department
  // consultation. That is the same one-edge narrowing the server commit reported.
  const canAssignConsultation = (c: Consultation) => {
    if (c.status !== "active" || c.currentStage !== ConsultationStage.RECEIVED) return false;
    if (hasEffectiveRole(actingIdentities, "branch_manager", "admin_support")) return true;
    return isDeptHeadFor(actingIdentities, c.departmentId);
  };

  const openAssignDialog = (c: Consultation) => {
    setAssignConsultationId(c.id);
    setAssignData({ lawyerId: "", departmentId: isDeptHead ? (user?.departmentId || "") : (c.departmentId || "") });
    setShowAssignDialog(true);
  };

  const handleAssignConsultation = async () => {
    if (!assignConsultationId || !assignData.lawyerId) return;
    setActionInProgress(true);
    try {
      // 🔴 departmentId IS NOW SENT. It never used to be — the القسم control
      // filtered the lawyer list and nothing else, so picking another department
      // moved nobody while the assignment still landed, leaving (for example) a
      // Labor consultation assigned to a Commercial lawyer. The server treats a
      // departmentId that differs from the current one as a transfer: it writes
      // the department, clears the source department's internal reviewer, and
      // logs a تحويل لقسم آخر activity row alongside the إسناد one. Sending the
      // UNCHANGED department is a no-op there, so the ordinary same-department
      // assign is unaffected.
      await apiRequest("POST", `/api/consultations/${assignConsultationId}/assign`, {
        assignedTo: assignData.lawyerId,
        departmentId: assignData.departmentId,
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
    const target = advanceTargetFor(advanceConsultation);
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
      ? returnTargetsFor(c)
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
    title: "",
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
      title: "",
      consultationType: ConsultationType.WRITTEN,
      // CREATE-SCOPE — pre-filled and locked for a department_head / employee.
      departmentId: defaultCreateDepartmentId,
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
      setActivityLog([]);
      setActivityLogExpanded(false);
      return;
    }
    // Default collapsed on every dialog open. User can toggle.
    setActivityLogExpanded(false);
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

  // Lawyer options NARROWED BY THE SELECTED DEPARTMENT. Consultations was the only
  // list page with both filters that still offered every lawyer in the firm:
  // cases.tsx (departmentFilteredLawyers), hearings.tsx (lawyersForFilter) and
  // memos-advanced-filters.tsx all already scope theirs. This follows them.
  //
  // 🔴 THE NULL-DEPARTMENT GUARD IS EXPLICIT — `!!u.departmentId &&` — per the
  // documented rule. It cannot bite in this direction (the "all" branch returns
  // early, so advFilters.departmentId is never ""), but writing the bare equality
  // here would leave a trap for whoever later reuses this predicate somewhere the
  // empty case IS reachable. The two precedents omit the guard; this one states it.
  //
  // isActive is applied ONLY in the narrowed branch, matching the brief: picking a
  // department offers its ACTIVE lawyers, while "كل الأقسام" is unchanged and still
  // lists everyone. ⚠ Consequence worth knowing: an INACTIVE lawyer of the selected
  // department drops out of the dropdown, so their historical consultations cannot
  // be filtered by name while that department is selected — clear it to "كل الأقسام"
  // to reach them. cases.tsx does NOT apply isActive, so the two pages now differ
  // slightly on that one point.
  const departmentFilteredLawyers = useMemo(() => {
    if (!advFilters.departmentId) return filterLawyers;
    return filterLawyers.filter(
      u => u.isActive && !!u.departmentId && String(u.departmentId) === advFilters.departmentId,
    );
  }, [filterLawyers, advFilters.departmentId]);

  // STALE-SELECTION GUARD. Without it, changing the department to one the selected
  // lawyer does not belong to leaves an unreachable combination: the list silently
  // returns nothing and the dropdown still shows the lawyer's name, with no hint
  // why. Resetting to "كل المحامين" is the same choice cases.tsx and
  // memos-advanced-filters.tsx make, and it keeps the result set explainable.
  //
  // ⚠ GATED ON filterLawyers (users loaded), NOT on departmentFilteredLawyers —
  // deliberately stronger than the cases.tsx precedent, which returns early when
  // the NARROWED list is empty. That guard protects a restored value while `users`
  // is still in flight, but it also means a department with genuinely NO lawyers
  // never clears a stale selection. Keying on the unnarrowed list separates the two
  // cases: still loading → leave alone; loaded but the department has nobody →
  // clear, so the user sees "كل المحامين" over an empty department rather than a
  // phantom filter.
  //
  // This also covers the PERSISTED case (c): departmentId and lawyers live in the
  // SAME persisted advFilters object, so a saved pair can restore intact with the
  // lawyer belonging to a different department. This effect runs on mount once
  // users land and repairs it.
  useEffect(() => {
    if (filterLawyers.length === 0) return;
    const allowed = new Set(departmentFilteredLawyers.map(u => u.id));
    if (advFilters.lawyers.some(id => !allowed.has(id))) {
      setAdvFilters({ ...advFilters, lawyers: advFilters.lawyers.filter(id => allowed.has(id)) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentFilteredLawyers, advFilters.lawyers]);

  const filteredConsultations = consultations.filter((consultation) => {
    const q = advFilters.search.trim().toLowerCase();
    if (q) {
      const clientName = getClientName(consultation.clientId);
      const haystack = [
        consultation.consultationNumber,
        // Title joins the haystack for parity with the contracts search, which
        // already includes c.title. The `|| ""` below covers the NULL rows.
        consultation.title,
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

  // Pagination — added to match cases / hearings / memos, which this page
  // previously lacked entirely (it rendered the whole filtered list). Same
  // shape as those three: configurable size, page state, reset-to-1 on any
  // filter change, and a slice feeding the table.
  const [CONSULTATION_PAGE_SIZE, setConsultationPageSize] = usePageSize("consultations");
  const [consultationPage, setConsultationPage] = useState(1);
  useEffect(() => { setConsultationPage(1); }, [advFilters]);
  const consultationTotalPages = Math.max(1, Math.ceil(sortedConsultations.length / CONSULTATION_PAGE_SIZE));
  const pagedConsultations = sortedConsultations.slice(
    (consultationPage - 1) * CONSULTATION_PAGE_SIZE,
    consultationPage * CONSULTATION_PAGE_SIZE,
  );
  const handleConsultationPageSizeChange = (size: number) => {
    setConsultationPageSize(size);
    setConsultationPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة الاستشارات</h1>
          <p className="text-muted-foreground">متابعة الاستشارات القانونية</p>
        </div>
        {canCreateConsultation && (
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
                {/* عنوان — placed right after the client, the same slot the
                    contracts dialog uses. OPTIONAL: the column is nullable
                    because existing rows have none, so requiring it here would
                    make the form stricter than the data. */}
                <div>
                  <Label>العنوان</Label>
                  <Input
                    data-testid="input-consultation-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="مثال: استفسار عن فسخ عقد إيجار"
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
                    disabled={isDeptScopedCreator}
                  >
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="اختر القسم" />
                    </SelectTrigger>
                    <SelectContent>
                      {creatableDepartments.map((dept) => (
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
              lawyers={departmentFilteredLawyers.map((l) => ({ id: l.id, name: l.name }))}
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
                  {/* "كل المحامين" is ALWAYS present, independent of the narrowed
                      list — so clearing the lawyer filter stays possible even when
                      the selected department has no lawyers at all. */}
                  <SelectItem value="all">كل المحامين</SelectItem>
                  {departmentFilteredLawyers.map((l) => (
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
                  {/* Options are now DERIVED from the loaded consultations'
                      DISPLAY stage (stageFilterOptions above) — the same value
                      this filter compares against — instead of from the raw
                      stage enum. That removes the dead مغلقة option and the
                      type+stage combination that had no matching option; see the
                      derivation for the full reasoning.
                      STAGE_FILTER_LABEL overrides the wording for the two
                      display stages that bundle lifecycle state, so each option
                      names everything it selects. */}
                  {stageFilterOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_FILTER_LABEL[s] || ConsultationStageLabels[s] || s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* This table had NO colgroup and no fixed layout — the browser sized
              every column by content, which is exactly why العنوان was squeezed
              to ~3 words a line while النوع (a one-word badge) claimed far more
              than it needs. Now uses the SAME idiom as cases.tsx and
              hearings.tsx: overflow wrapper + tableLayout:'fixed' + an explicit
              colgroup. Widths sum to EXACTLY 100%, in header order:
                 4  #
                 9  تاريخ الاستشارة      ← fixed-width date
                17  العنوان              ← widest, free text (wraps fine)
                13  العميل               ← free text
                 6  النوع                ← ONE short badge
                18  الحالة               ← stage badge + up to 2 status pills
                 8  القسم
                11  المحامي المسؤول
                 6  التصنيف              ← ONE short badge, shorter since abb8104
                                            dropped the "(3 أيام)" day-counts
                 8  الإجراءات            ← 2 icon buttons
                ---
               100
              الحالة was 12% and OVERFLOWED: the stage badge alone can be
              "استكمال المرفقات والبيانات" (26 chars) and Badge is
              whitespace-nowrap, so it spilled leftward over النوع while the
              second pill sat below it misaligned. +6 points here, taken from the
              five columns that hold fixed-width or single-short-badge content.
              WIDTH ALONE IS NOT THE FIX — see STAGE_BADGE_WRAP_CLASS on the
              stage badge below, without which a nowrap badge overflows any width.
              (Labels live here rather than as inline JSX comments after each
              <col />, which would leave whitespace text nodes inside <colgroup>
              and trip React's DOM-nesting validation.) */}
          <div className="overflow-x-auto">
          <Table className="w-full" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '4%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                {/* Phase-5: all table cells (header + body) center-aligned. */}
                <TableHead className="text-center">#</TableHead>
                {/* رقم الاستشارة REPLACED by the creation date — the number is
                    still shown in the details dialog title and is still matched
                    by the search box (see the haystack). Same position. */}
                <TableHead className="text-center">تاريخ الاستشارة</TableHead>
                {/* عنوان — same slot the contracts table uses. */}
                <TableHead className="text-center">العنوان</TableHead>
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
              {pagedConsultations.map((consultation, idx) => {
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
                  {/* Display-only sequential number — index inside the RENDERED
                      page, so every active filter/search and the priority sort
                      renumber from 1. Continues across pages via the page
                      offset, and stays correct at any page size because the
                      offset is computed from the live size (the pager is a
                      plain slice of one already-sorted list). */}
                  <TableCell className="text-center text-xs text-muted-foreground" data-testid={`cell-index-${consultation.id}`}>
                    {(consultationPage - 1) * CONSULTATION_PAGE_SIZE + idx + 1}
                  </TableCell>
                  {/* تاريخ الاستشارة — the creation date, replacing رقم الاستشارة.
                      Uses the shared <DualDateDisplay> (Hijri on top, Gregorian
                      below with "م"), the app's simple-date-cell component —
                      already used in a TableCell on the delegations table and in
                      the clients / activity-log views. The "غير مسندة" badge that
                      lived in this cell STAYS: it flags the row, not the number. */}
                  <TableCell className="text-center font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <DualDateDisplay date={consultation.createdAt} />
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
                  {/* عنوان — NULL on every row created before the column
                      existed, so it falls back to an em dash in muted text.
                      Never renders "undefined", and an empty title keeps the
                      row height identical to a filled one. */}
                  <TableCell className="text-center" data-testid={`cell-title-${consultation.id}`}>
                    {consultation.title
                      ? <BidiText>{consultation.title}</BidiText>
                      : <span className="text-muted-foreground">—</span>}
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
                        // STAGE_BADGE_WRAP_CLASS: the 26-char
                        // "استكمال المرفقات والبيانات" cannot fit any column
                        // share while Badge stays whitespace-nowrap. Letting
                        // THIS badge wrap its text is what actually stops the
                        // overflow; the widened column just keeps the common
                        // case on one line.
                        return <Badge className={cn(b.className, STAGE_BADGE_WRAP_CLASS)}>{b.label}</Badge>;
                      })()}
                      {/* Status pills — orthogonal to the stage badge so the
                          stage stays visible no matter the lifecycle state.
                          Filter by stage="دراسة" still returns these rows. */}
                      {consultation.status === "paused" && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 bg-amber-500/10 text-amber-700 text-[10px] px-1 py-0"
                          data-testid={`badge-paused-${consultation.id}`}
                          title={pauseBadgeTooltip(consultation)}
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
                              {canPauseConsultationFor(consultation) && (
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
                              {canPauseConsultationFor(consultation) && (
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
                          {user && advanceTargetFor(consultation) && (
                            <DropdownMenuItem
                              data-testid={`button-advance-consultation-${consultation.id}`}
                              onClick={() => openAdvanceDialog(consultation)}
                            >
                              <ChevronLeft className="w-4 h-4 ml-2" />
                              المرحلة التالية
                            </DropdownMenuItem>
                          )}
                          {/* PRE-ENTRY skip — sits at استلام, right beside the
                              normal "المرحلة التالية", exactly as the cases
                              progress bar renders its own skip. Pressing it
                              jumps PAST the data-completion stage instead of
                              leaving it. Hidden when the shared helper returns
                              null, which is how a تعقيبية cycle (no
                              data-completion stage in its 3-stage list) is
                              excluded — the same rule the server refuses on.
                              Gate: canOfferSkipDataCompletion, shared with the
                              details-dialog button. */}
                          {canOfferSkipDataCompletionFor(consultation) && (
                            <DropdownMenuItem
                              data-testid={`button-skip-data-completion-${consultation.id}`}
                              onClick={() => openSkipDialog(consultation)}
                            >
                              <FileSymlink className="w-4 h-4 ml-2" />
                              تجاوز استكمال المرفقات والبيانات
                            </DropdownMenuItem>
                          )}
                          {user && returnTargetsFor(consultation).length > 0 && (
                            <DropdownMenuItem
                              data-testid={`button-return-consultation-${consultation.id}`}
                              onClick={() => openReturnDialog(consultation)}
                            >
                              <ChevronRight className="w-4 h-4 ml-2" />
                              المرحلة السابقة
                            </DropdownMenuItem>
                          )}
                          {user && canDoInternalReview(consultation, user) && (
                            <DropdownMenuItem
                              data-testid={`button-internal-review-${consultation.id}`}
                              onClick={() => openInternalReviewDialog(consultation)}
                            >
                              <ClipboardCheck className="w-4 h-4 ml-2" />
                              المراجعة الداخلية
                            </DropdownMenuItem>
                          )}
                          {user && canDoCommitteeDecisionFor(consultation, getDepartmentName(consultation.departmentId) === "عمالي") && (
                            <DropdownMenuItem
                              data-testid={`button-committee-decision-${consultation.id}`}
                              onClick={() => openCommitteeDialog(consultation)}
                            >
                              <CheckCircle className="w-4 h-4 ml-2" />
                              قرار اللجنة
                            </DropdownMenuItem>
                          )}
                          {user && canDoTakeNotesOutcomeFor(consultation) && (
                            <DropdownMenuItem
                              data-testid={`button-take-notes-outcome-${consultation.id}`}
                              onClick={() => openTakeNotesDialog(consultation)}
                            >
                              <FileText className="w-4 h-4 ml-2" />
                              تسجيل نتيجة الأخذ بالملاحظات
                            </DropdownMenuItem>
                          )}
                          {user && canConvertToCaseFor(consultation) && (
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
                          {/* Sits ABOVE the generic إغلاق مبكر so the specific
                              action is the first close a user sees on a
                              data-completion consultation. Both can render
                              together — إغلاق مبكر stays available for a
                              genuinely different reason. */}
                          {user && canCloseForNoResponseFor(consultation) && (
                            <DropdownMenuItem
                              data-testid={`button-close-no-response-${consultation.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={() => { setCloseNoResponseTarget(consultation); setCloseNoResponseNotes(""); }}
                            >
                              <Archive className="w-4 h-4 ml-2" />
                              إغلاق لعدم استكمال البيانات
                            </DropdownMenuItem>
                          )}
                          {user && canEarlyCloseFor(consultation) && (
                            <DropdownMenuItem
                              data-testid={`button-early-close-${consultation.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={() => openEarlyCloseDialog(consultation)}
                            >
                              <XCircle className="w-4 h-4 ml-2" />
                              إغلاق مبكر
                            </DropdownMenuItem>
                          )}
                          {/* «طلب تحويل لقسم آخر» REMOVED — it was dead three ways
                              over (see the batch note). Changing a consultation's
                              department is now the إسناد dialog's القسم control,
                              which transfers for real (959f568) and is visible to
                              every role that may assign. */}
                          {/* No longer gated on an assignee: the department head
                              is a recipient now, and an unassigned consultation
                              is exactly the one worth reminding about. */}
                          {permissions.canSendReminders && (
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
                            && canPauseConsultationFor(consultation) && (
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
                          {consultation.status === "active" && canPauseConsultationFor(consultation) && (
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
          </div>
          <PaginationControls
            currentPage={consultationPage}
            totalPages={consultationTotalPages}
            onPageChange={setConsultationPage}
            pageSize={CONSULTATION_PAGE_SIZE}
            onPageSizeChange={handleConsultationPageSizeChange}
          />
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
                  {/* The client never responded → close. Lives INSIDE the banner
                      so the escape hatch sits with the state it escapes from. */}
                  {user && canCloseForNoResponseFor(selectedConsultation) && (
                    <div className="mt-2 pt-2 border-t border-amber-500/30">
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid="button-close-no-response-banner"
                        onClick={() => { setCloseNoResponseTarget(selectedConsultation); setCloseNoResponseNotes(""); }}
                      >
                        <Archive className="w-4 h-4 ml-2" />
                        إغلاق لعدم استكمال البيانات
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {/* PATH A — the consultation reached the data-completion stage by
                  the ordinary advance, so awaitingCompletion is FALSE and the
                  banner above does not render. Rendered only when that banner is
                  absent, so exactly one box shows either way. */}
              {user && !selectedConsultation.awaitingCompletion
                && canCloseForNoResponseFor(selectedConsultation) && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 flex items-center justify-between gap-3 flex-wrap"
                  data-testid="banner-consultation-data-completion"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    الاستشارة في مرحلة استكمال المرفقات والبيانات
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    data-testid="button-close-no-response-strip"
                    onClick={() => { setCloseNoResponseTarget(selectedConsultation); setCloseNoResponseNotes(""); }}
                  >
                    <Archive className="w-4 h-4 ml-2" />
                    إغلاق لعدم استكمال البيانات
                  </Button>
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
                  {/* Auto-lift date. Absent = open-ended, stated explicitly so
                      the user never has to guess whether a date was set. */}
                  <div className="mt-1 text-xs font-medium">
                    {selectedConsultation.pauseUntil
                      ? <>ينتهي التعليق تلقائياً في: <LtrInline>{selectedConsultation.pauseUntil}</LtrInline></>
                      : <span className="text-amber-700/80">تعليق مفتوح — يستمر حتى يُلغى يدوياً</span>}
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
                  departmentName={getDepartmentName(selectedConsultation.departmentId)}
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
                    {advanceTargetFor(selectedConsultation) && (
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
                    {returnTargetsFor(selectedConsultation).length > 0 && (
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
                    {canDoInternalReview(selectedConsultation, user) && (
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
                    {canDoCommitteeDecisionFor(selectedConsultation, getDepartmentName(selectedConsultation.departmentId) === "عمالي") && (
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
                    {canSkipCommitteeFor(selectedConsultation) && (
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
                    {canDoTakeNotesOutcomeFor(selectedConsultation) && (
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
                    {canConvertToCaseFor(selectedConsultation) && (
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
                    {/* PLACEMENT (owner ruling): the pre-entry skip and إغلاق مبكر
                        are BOTH available on BOTH surfaces — visible buttons here
                        in the details strip, menu items in the row's ⋯ menu —
                        which is the arrangement contracts already has. Gates,
                        predicates and dialogs are unchanged for both.

                        Both controls' two surfaces share ONE gate expression, so
                        the row and the dialog cannot drift: the skip goes through
                        canOfferSkipDataCompletion, إغلاق مبكر through
                        canEarlyClose. */}
                    {canOfferSkipDataCompletionFor(selectedConsultation) && (
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`dialog-button-skip-data-completion-${selectedConsultation.id}`}
                        onClick={() => openSkipDialog(selectedConsultation)}
                      >
                        <FileSymlink className="w-4 h-4 ml-1" />
                        تجاوز استكمال المرفقات والبيانات
                      </Button>
                    )}
                    {canEarlyCloseFor(selectedConsultation) && (
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
                    {/* REOPEN sits beside استشارة تعقيبية because both act on a
                        CLOSED consultation — but they are different acts and the
                        labels say so: تعقيبية = a NEW question on a finished
                        matter (3-stage cycle); إعادة فتح = the closure was wrong,
                        resume the ORIGINAL work at a chosen stage. */}
                    {canReopenConsultationFor(selectedConsultation) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-600 text-green-700 hover:bg-green-50"
                        data-testid={`dialog-button-reopen-${selectedConsultation.id}`}
                        onClick={() => {
                          setReopenTarget(selectedConsultation);
                          setReopenStage("");
                          setReopenNotes("");
                        }}
                      >
                        <RotateCcw className="w-4 h-4 ml-1" />
                        إعادة فتح
                      </Button>
                    )}
                    {canStartFollowUpFor(selectedConsultation) && (
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
                          hasEffectiveRole(actingIdentities, "branch_manager", "admin_support")
                          || isDeptHeadFor(actingIdentities, selectedConsultation.departmentId)
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
            {/* Same field order as the ADD dialog. */}
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
                data-testid="input-edit-consultation-title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="مثال: استفسار عن فسخ عقد إيجار"
              />
            </div>
            <div>
              <Label>نوع الاستشارة</Label>
              <Select
                value={editForm.consultationType}
                onValueChange={(value) => setEditForm({ ...editForm, consultationType: value })}
              >
                <SelectTrigger data-testid="select-edit-consultation-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.values(ConsultationType) as string[]).map((t) => (
                    <SelectItem key={t} value={t} data-testid={`option-edit-consultation-type-${t}`}>
                      {ConsultationTypeLabels[t as keyof typeof ConsultationTypeLabels] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editConsultation && editForm.consultationType !== editConsultation.consultationType && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  تغيير النوع قد يُعيد ضبط مرحلة الاستشارة وسيُسجَّل في سجل النشاط.
                </p>
              )}
            </div>
            {/* القسم — READ-ONLY here BY DESIGN. Moving a consultation between
                departments is a TRANSFER with its own required reason and
                activity entry, not a field correction. */}
            <div>
              <Label>القسم</Label>
              <Input
                data-testid="input-edit-consultation-department"
                value={departments.find((d) => d.id === editConsultation?.departmentId)?.name || "—"}
                readOnly
                disabled
              />
              <p className="text-xs text-muted-foreground mt-1">
                لتغيير القسم استخدم إجراء "تحويل لقسم آخر" — يتطلب سبب التحويل ويُسجَّل في سجل النشاط.
              </p>
            </div>
            <div>
              <Label>تصنيف المدة</Label>
              <Select
                value={editForm.category}
                onValueChange={(value) => setEditForm({ ...editForm, category: value })}
              >
                <SelectTrigger data-testid="select-edit-consultation-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.values(ConsultationCategory) as string[]).map((c) => (
                    <SelectItem key={c} value={c} data-testid={`option-edit-category-${c}`}>
                      {ConsultationCategoryLabels[c as keyof typeof ConsultationCategoryLabels] || c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>ملخص السؤال</Label>
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
                  const target = advanceTargetFor(advanceConsultation);
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
            && advanceTargetFor(advanceConsultation) === ConsultationStage.INTERNAL_REVIEW && (
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
                  && advanceTargetFor(advanceConsultation) === ConsultationStage.INTERNAL_REVIEW
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
                const targets = returnTargetsFor(returnConsultation);
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
            const targets = returnTargetsFor(returnConsultation);
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
                  {/* DATA_NOT_COMPLETED is filtered out on purpose: it is written
                      only by /close-no-response, which is offered exclusively on
                      the استكمال_المرفقات_والبيانات stage and fills the missing-data
                      text automatically. Offering it in this stage-agnostic picker
                      would let a user pick it on any stage and store a closure that
                      claims data was missing with nothing to back it. */}
                  {(Object.values(ConsultationClosureReason) as ConsultationClosureReasonValue[])
                    .filter((r) => r !== ConsultationClosureReason.DATA_NOT_COMPLETED)
                    .map((r) => (
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

      {/* PRE-ENTRY skip dialog.
          🔴 The previewed target comes from the SAME shared helper the
          endpoint calls, so it cannot disagree with what the server writes.
          The cases dialog derives its preview independently
          (stagesOrder[currentIndex + 2]) and the old consultations dialog
          hard-coded "دراسة", which was simply WRONG for a procedural
          consultation — the server wrote جاري_العمل. That class of bug is
          unreachable here by construction. */}
      <AlertDialog open={showSkipDialog} onOpenChange={(open) => { if (!open) closeSkipDialog(); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileSymlink className="w-5 h-5" />
              تجاوز استكمال المرفقات والبيانات
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تجاوز مرحلة "استكمال المرفقات والبيانات" والانتقال مباشرةً إلى مرحلة{" "}
              <strong>
                {(() => {
                  const t = consultationSkipDataCompletionTarget(skipTarget);
                  return t ? ConsultationStageLabels[t] : "";
                })()}
              </strong>
              . استخدم هذا الخيار فقط عندما تكون بيانات الاستشارة مكتملة ولا توجد مرفقات ناقصة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="ملاحظات (اختياري)"
            value={skipNotes}
            onChange={(e) => setSkipNotes(e.target.value)}
            className="mt-2"
            data-testid="input-skip-data-completion-notes"
          />
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

      {/* Reopen — stage picker + optional notes. No number prompt (consultations
          carry no platform numbers, unlike the cases version this mirrors) and
          no cancelled-children warning (consultations have no hearings / memos /
          field tasks, and their closes cancel nothing). */}
      <AlertDialog
        open={!!reopenTarget}
        onOpenChange={(open) => { if (!open) { setReopenTarget(null); setReopenStage(""); setReopenNotes(""); } }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-green-700" />
              إعادة فتح الاستشارة
            </AlertDialogTitle>
            <AlertDialogDescription>
              ستعود الاستشارة للعمل عند المرحلة التي تختارها، ويُلغى سبب الإغلاق
              السابق (مع بقائه في سجل النشاط).
              <br />
              إذا كان العميل قد عاد بسؤال <strong>جديد</strong> على استشارة منتهية،
              استخدم "استشارة تعقيبية" بدلاً من ذلك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 text-right">
            <div>
              <Label>المرحلة <span className="text-red-500">*</span></Label>
              <Select value={reopenStage} onValueChange={setReopenStage}>
                <SelectTrigger data-testid="select-reopen-stage">
                  <SelectValue placeholder="اختر المرحلة" />
                </SelectTrigger>
                <SelectContent>
                  {reopenTarget && consultationStagesForDepartment(
                    getDepartmentName(reopenTarget.departmentId),
                    getConsultationReopenTargetStages(reopenTarget),
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {ConsultationStageLabels[s] || s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                data-testid="input-reopen-notes"
                value={reopenNotes}
                onChange={(e) => setReopenNotes(e.target.value)}
                placeholder="سبب إعادة الفتح..."
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-reopen"
              disabled={reopenSaving || !reopenStage}
              onClick={(e) => { e.preventDefault(); handleReopen(); }}
            >
              <RotateCcw className="w-4 h-4 ml-2" />
              تأكيد إعادة الفتح
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* "إغلاق لعدم استكمال البيانات". No reason picker, no required text — the
          reason is fixed and the missing-data text is resolved server-side from
          the activity log's metadata.reason. Optional notes only. */}
      <AlertDialog
        open={!!closeNoResponseTarget}
        onOpenChange={(open) => { if (!open) { setCloseNoResponseTarget(null); setCloseNoResponseNotes(""); } }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-destructive" />
              إغلاق لعدم استكمال البيانات
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إغلاق الاستشارة بسبب <strong>عدم استكمال البيانات</strong>، مع تسجيل
              البيانات والمرفقات الناقصة ضمن سبب الإغلاق.
              <br />
              إذا تجاوب العميل لاحقاً وأرسل الناقص، استخدم "إعادة فتح" للعودة إلى
              المرحلة التي توقف عندها العمل.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-right">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              data-testid="input-consultation-close-no-response-notes"
              value={closeNoResponseNotes}
              onChange={(e) => setCloseNoResponseNotes(e.target.value)}
              placeholder="اكتب ملاحظات حول الإغلاق..."
              rows={3}
            />
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-close-no-response"
              disabled={closeNoResponseSaving}
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleCloseNoResponse(); }}
            >
              <Archive className="w-4 h-4 ml-2" />
              تأكيد الإغلاق
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
          <PauseUntilField
            value={pauseUntil}
            onChange={setPauseUntil}
            testId="input-consultation-pause-until"
          />
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={closePauseDialog}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-pause"
              onClick={handlePause}
              disabled={actionInProgress || !pauseReason.trim() || !!pauseUntilError(pauseUntil)}
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
