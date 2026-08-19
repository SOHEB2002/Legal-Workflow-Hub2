import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Plus,
  Eye,
  Paperclip,
  CheckCircle,
  Archive,
  UserPlus,
  ClipboardCheck,
  Bell,
  ExternalLink,
  AlertTriangle,
  ArrowLeftRight,
  Pencil,
  Check,
  X,
  MessageSquare,
  Pause,
  RotateCcw,
  FileText,
  Gavel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { CaseActivityTab, CaseNotesTab, CaseDeadlinesTab } from "@/components/case-tabs";
import { CaseStagePanel } from "@/components/case-stage-panel";
import { HearingDetailsDialog } from "@/components/hearing-details-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { anyIdentity, hasEffectiveRole, isDeptHeadFor, type ActingIdentity } from "@/lib/acting-identities";
import { useHearings } from "@/lib/hearings-context";
import { useMemos } from "@/lib/memos-context";
import { getClientRoleLabel } from "@/lib/client-role";
import { formatTimeAmPm } from "@/lib/date-utils";
import { extractApiError, formatAmount } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SingleAttachmentControl } from "@/components/single-attachment-control";
import { isHearingActor, canViewHearingMinutes, hearingHasMinutes, caseReachedJudgment, caseCurrentJudgmentHearingId } from "@/lib/attachment-indicators";
import { isCasePaused } from "@/lib/case-stage-utils";
import {
  CaseStageLabels,
  CaseStagesOrder,
  CaseStage,
  CaseClassification,
  Priority,
  getStageLabel,
  findPrimaryJudgmentHearing,
  judgmentDirectionOf,
  weAreTheAppellant,
  ClosureReasonLabels,
  hearingProducesNoMinutes,
  caseNotificationRecipientId,
  // ONE rule for the amount, shared with the endpoint that enforces it — the
  // same precedent as weAreTheAppellant / caseIsAtOrPastCourt above: the UI can
  // never accept a value the server would reject, and the user is told at the
  // keystroke rather than by a 400.
  ViolationAmountPattern,
  GrievanceResultValues,
  GrievanceResultLabels,
} from "@shared/schema";
import type { LawCase, CaseStageValue, PriorityType, ClosureReasonValue, CaseJudgment, GrievanceResultValue } from "@shared/schema";

// Stages that mark a REAL trip through internal review. Moved here verbatim with
// the dialog — the actions tab's "إرجاع من المراجعة الداخلية" block is its only
// consumer (a drafting-stage history entry with notes alone is NOT sufficient:
// data migration writes an initial drafting entry with notes "تهجير البيانات").
const REVIEW_LOOP_STAGES = new Set([
  "مراجعة_داخلية",
  "مراجعة_داخلية_للتظلم",
]);

// Moved here verbatim with the dialog — the info tab's priority badge is its
// only consumer.
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

// The page-level actions the dialog can TRIGGER but does not own: each one opens
// a sibling dialog that lives on the cases page (assign / review / reject /
// reminder / transfer / edit / early-close) or runs a page handler (approve).
//
// This is the CaseStagePanel decoupling precedent (case-stage-panel.tsx:22-29)
// applied to the whole dialog: page-only concerns are OPTIONAL, so the cases page
// passes them and behaves exactly as before, while a host that has no such
// dialogs (the مهامي hub) simply omits the prop — and every action row then does
// not render AT ALL, rather than rendering as a dead button.
//
// The can* booleans are computed BY THE PAGE from its existing permission helpers
// (canAssign / canReview / canClose / canEarlyCloseCase / permissions.*) and passed
// in, so no permission logic moves out of cases.tsx with this refactor.
export interface CaseDetailsActions {
  canEdit: boolean;
  onEdit: () => void;
  canAssign: boolean;
  onAssign: () => void;
  canReview: boolean;
  onReview: () => void;
  onReject: () => void;
  onApprove: () => void;
  canClose: boolean;
  canEarlyClose: boolean;
  onEarlyClose: () => void;
  // "إغلاق لعدم استكمال البيانات" — POST /api/cases/:id/close-no-response. The
  // host gates it on the CLOSE tier (canEarlyCloseCase) plus the endpoint's own
  // state conditions: currentStage === استكمال_البيانات, not closed/archived,
  // not paused. Deliberately NOT keyed on awaitingCompletion — a case reaches
  // that stage by the ordinary advance too (latch false), and that is the more
  // common path; see the server comment for the full chain.
  canCloseNoResponse: boolean;
  onCloseNoResponse: () => void;
  // Reopen a CLOSED case at a chosen stage (POST /api/cases/:id/reopen). The
  // host computes canReopen with the SAME rule the server enforces
  // (branch_manager | dept_head of the case's dept | assigned lawyer — note
  // admin_support is excluded, unlike canEarlyClose), so the button's
  // visibility equals the server's authorization.
  canReopen: boolean;
  onReopen: () => void;
  // "تسجيل استلام الصك" on a case at محكوم_حكم_ابتدائي. Same rule the server
  // enforces on POST /api/cases/:id/judgment-deed (canActOnMohrSettlement),
  // computed by the host so visibility equals authorization.
  canRecordJudgmentDeed: boolean;
  onRecordJudgmentDeed: () => void;
  // LATE صك FILING — the case has already moved past محكوم_حكم_ابتدائي (via one of
  // the three automatic cascades that are deliberately not blocked, or it predates
  // the gate) and still owes its صك, which now BLOCKS its closure.
  //
  // 🔴 THIS IS WHAT KEEPS THE CLOSE GATE SATISFIABLE. The صك control otherwise
  // lives only inside the "تسجيل استلام الصك" dialog, which is gated on
  // محكوم_حكم_ابتدائي — so without this affordance a case past that stage would be
  // held closed by a requirement the UI gave nobody any way to meet. FILE ONLY: the
  // receipt DATE and the objection window are not offered, because the server's
  // /judgment-deed endpoint still 400s off-stage and the objection window is long
  // over by the time a case is here.
  canAttachDeedLate: boolean;
  onAttachDeedLate: () => void;
  // The two manual routes out of محكوم_حكم_ابتدائي (appeal path). Same rule the
  // server enforces on POST /api/cases/:id/appeal-outcome.
  canRecordAppealOutcome: boolean;
  // "تم الاستئناف" — the manual counterpart to the objection-memo hook. Both
  // land on منظورة_استئناف; see the endpoint comment for why they cannot
  // double-fire.
  onWeAppealed: () => void;
  onOpponentAppealed: () => void;
  onNoAppeal: () => void;
  // "تم استلام رد الخصم" — clears the مطلوب رد من الخصم indicator. The host gates
  // it on the same rule the server enforces AND on the indicator actually being
  // on, so visibility === authorization on both terms.
  canRecordOpponentResponse: boolean;
  onOpponentResponseReceived: () => void;
  canTransfer: boolean;
  onTransfer: () => void;
  canRemind: boolean;
  onReminder: () => void;
}

// SHARED case-details dialog. The body (banners → CaseStagePanel → the nine tabs)
// was moved VERBATIM out of cases.tsx so the cases page and the مهامي hub can show
// the SAME case view, driven by the same contexts and the same endpoints.
//
// Everything the dialog owns by itself — the active tab, the inline-edit fields,
// the تراضي/الموارد registration inputs, the new-comment box, the attachments list
// and form, the await-completion banner's activity-log lookup, and the
// source-consultation back-link — is INTERNAL state here (it was only ever read by
// this dialog). The read data comes from the app-wide contexts (cases / clients /
// departments / auth / hearings / memos), so no prop threading is needed for it.
// C4 — gate for the MOHR (التسوية الودية) action buttons. Mirrors the SERVER rule
// on PATCH /api/cases/:id/mohr and POST /api/cases/:id/direct-settlement EXACTLY
// (routes.ts canActOnMohrSettlement) so visibility === authorization: no button
// that 403s, no actor who can act but sees nothing.
//   branch_manager | department_head OF THE CASE'S OWN DEPARTMENT | assigned lawyer
// Same idiom as canSkipCommittee (consultations.tsx) and the onSkipCommittee
// conditional callback (case-stage-panel.tsx).
//
// The panel's labor + قيد_الدراسة conditions are applied by the caller and are NOT
// repeated here. Only the three ACTION buttons use this — the read-only status
// badge stays visible to anyone who can open the case, since admin_support still
// moves the case across the settlement stages (routes.ts ALLOWED_CASE_TRANSITIONS)
// and needs to see where the settlement stands even though it can no longer record
// the status itself. See the divergence note on the server helper.
// DELEGATION: `identities` is the acting set from useAuth (self + every
// all_cases delegator), mirroring the server helper's caseActorIdentities →
// actingIdentitiesFor expansion. With no delegation it is exactly [self], so
// the two role tests below collapse to the original user.role checks.
function canActOnMohrSettlement(
  lawCase: LawCase,
  user: { id: string; role: string; departmentId?: string | null } | null,
  identities: ActingIdentity[],
): boolean {
  if (!user) return false;
  if (hasEffectiveRole(identities, "branch_manager")) return true;
  if (isDeptHeadFor(identities, lawCase.departmentId)) return true;
  return lawCase.primaryLawyerId === user.id
    || lawCase.responsibleLawyerId === user.id
    || (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(user.id));
}

// CLIENT MIRROR of the server's canEditCaseViolationDetails (routes.ts).
// branch_manager | admin_support | department_head of the case's OWN department
// | assigned lawyer. Visibility == authorization: this decides whether the
// «تعديل» button on لوحة تفاصيل المخالفة renders, and the server decides whether
// the PATCH succeeds — they must name the same set or the panel offers a button
// that 403s.
//
// ⚠ NOT the canActOnMohrSettlement mirror directly above, which is the same set
// MINUS admin_support. Filing the paperwork of an administrative violation is
// clerical work admin_support does; driving a labor settlement is not. Two
// predicates, kept separate for the same reason the server keeps two helpers —
// so widening one cannot silently widen the other.
function canEditCaseViolationDetails(
  lawCase: LawCase,
  user: { id: string; role: string; departmentId?: string | null } | null,
  identities: ActingIdentity[],
): boolean {
  if (!user) return false;
  if (hasEffectiveRole(identities, "branch_manager", "admin_support")) return true;
  if (isDeptHeadFor(identities, lawCase.departmentId)) return true;
  return lawCase.primaryLawyerId === user.id
    || lawCase.responsibleLawyerId === user.id
    || (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(user.id));
}

// The panel's eleven fields, in the ORDER THE OWNER SPECIFIED. Declared once and
// used by both the read view and the edit form, so the two cannot drift and a
// twelfth field is one entry rather than two blocks.
//   kind "date"   → HijriDatePicker to input, DualDateDisplay to show
//   kind "amount" → the numeric(12,2) column, which arrives as a STRING
//   kind "text"   → a plain identifier, rendered LTR like its siblings
//   kind "select" → a fixed value set (نتيجة الاعتراض)
//
// 🔴 THE readMostly FLAG IS GONE, and so is the «للتصحيح فقط» warning it drove.
// Both existed because «رقم طلب التنفيذ» used to reuse executionRequestNumber,
// which HAS a real filing path (the مهامي execution task). It no longer does:
// the panel now owns adminExecutionRequestNumber, a distinct column with no
// task, no activity row and no auto-close behind it — an ordinary editable
// field, warned about no more than رقم الفاتورة is.
const VIOLATION_PANEL_FIELDS: ReadonlyArray<{
  key: string;
  label: string;
  kind: "text" | "date" | "amount" | "select";
  options?: readonly string[];
}> = [
  { key: "administrativeDecisionNumber", label: "رقم القرار الإداري", kind: "text" },
  { key: "administrativeDecisionDate", label: "تاريخ القرار الإداري", kind: "date" },
  { key: "violationKnowledgeDate", label: "تاريخ العلم بالمخالفة", kind: "date" },
  { key: "violationAmount", label: "مبلغ المخالفة", kind: "amount" },
  { key: "ifaaNumber", label: "رقم إيفاء", kind: "text" },
  { key: "ifaaDate", label: "تاريخ إيفاء", kind: "date" },
  { key: "grievanceNumber", label: "رقم الاعتراض", kind: "text" },
  { key: "grievanceDate", label: "تاريخ الاعتراض", kind: "date" },
  { key: "grievanceResult", label: "نتيجة الاعتراض", kind: "select", options: GrievanceResultValues },
  // Sits immediately after the result it dates. NOT required when the result is
  // مقبول/مرفوض and NOT cleared when it changes to لم_يُردّ_عليه — see the report;
  // both are deliberate non-decisions pending the owner's ruling.
  { key: "grievanceResultDate", label: "تاريخ نتيجة الاعتراض", kind: "date" },
  // 🔴 adminExecutionRequestNumber — NOT executionRequestNumber, which belongs to
  // the مهامي execution task and is displayed separately in the numbers grid.
  // Labelled «رقم طلب التنفيذ الإداري» — the owner's own wording. TWO other rows
  // in this same dialog render the bare «رقم طلب التنفيذ» for the DIFFERENT
  // executionRequestNumber column (the numbers grid and the inline-edit row), and
  // on an admin case all three can be on screen at once. One name for two columns
  // is the reverse of the two-names-for-one-thing trap and just as costly, so the
  // panel's field carries the qualifier. The other two rows are untouched.
  { key: "adminExecutionRequestNumber", label: "رقم طلب التنفيذ الإداري", kind: "text" },
  { key: "invoiceNumber", label: "رقم الفاتورة", kind: "text" },
];

export function CaseDetailsDialog({
  caseItem,
  open,
  onOpenChange,
  actions,
  onHearingPrompt,
  onClosed,
  initialTab,
  highlightHearingId,
}: {
  caseItem: LawCase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: CaseDetailsActions;
  onHearingPrompt?: (prompt: { caseId: string; hearingType: "تراضي" | "محكمة"; title: string; description: string }) => void;
  onClosed?: () => void;
  // Which tab to land on when the dialog opens. Omitted / null keeps the
  // existing default ("info"), so every current caller is unaffected. Used by
  // the مهامي follow-up deep-links whose action is a ROW in the الإجراءات tab
  // rather than a dialog of its own.
  initialTab?: string | null;
  // Scroll to and highlight ONE hearing row in the الجلسات tab. Added for the
  // مهامي "إرفاق ضبط الجلسة" row, whose task names a specific hearing — landing
  // on the tab alone left the user to find it among all of the case's hearings,
  // which on a long-running case is the whole difficulty.
  // Optional and null-by-default, so every existing caller is unaffected.
  highlightHearingId?: string | null;
}) {
  const { updateCase, moveToNextStage, refreshCases } = useCases();
  const { getClientName } = useClients();
  const { getDepartmentName } = useDepartments();
  const { user, users, actingIdentities } = useAuth();
  const { getHearingsByCase } = useHearings();
  const { getMemosByCase } = useMemos();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // ---- Real stage history ----
  // BUGFIX. The LIST endpoint GET /api/cases STRIPS stageHistory (routes.ts:1622,
  // a payload optimisation), and cases-context's migrateCase then FABRICATES a
  // single entry ("تهجير البيانات") for the missing field (cases-context.tsx:48-50).
  // So any host that hands us a case off the list — which is what the cases page
  // does — was rendering ONE synthetic row in "سجل المراحل" instead of the real
  // history, and the actions tab's return-from-review blocks could never match.
  // The DETAIL endpoint GET /api/cases/:id keeps the full history, so we fetch it
  // when the dialog opens and graft ONLY that field onto the live case below.
  // Re-runs on updatedAt (every mutation bumps it) so the history stays current
  // after a stage transition. On failure we simply fall back to whatever the host
  // gave us — no worse than before.
  // Hearing opened from the الجلسات tab, rendered NESTED over this dialog by the
  // shared HearingDetailsDialog. Closing it returns the user to this dialog on the
  // same tab — nothing about this component's state is touched.
  const [hearingDetailId, setHearingDetailId] = useState<string | null>(null);

  const [fetchedHistory, setFetchedHistory] = useState<{ id: string; stageHistory: LawCase["stageHistory"] } | null>(null);
  useEffect(() => {
    if (!open || !caseItem?.id) return;
    const id = caseItem.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/cases/${id}`);
        const full: LawCase = await res.json();
        if (!cancelled) setFetchedHistory({ id, stageHistory: full.stageHistory });
      } catch {
        if (!cancelled) setFetchedHistory(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, caseItem?.id, caseItem?.updatedAt]);

  // ---- سجل الأحكام — the case's ruling chain (batch 5) ----
  // Fetched, not derived: the list response carries only the CURRENT ruling's
  // three summary fields, and this panel is about the CHAIN. Mirrors the
  // stageHistory graft above field-for-field — same effect shape, same
  // updatedAt re-run, same silent fallback — because both answer "the list gave
  // me a summary, fetch the full thing when the dialog opens".
  //
  // A FAILURE RENDERS NOTHING, deliberately. The endpoint is new and reads tables
  // applied by hand; an error must not blank the سجل المراحل list it sits above,
  // which is existing, working, and unrelated.
  const [judgments, setJudgments] = useState<(CaseJudgment & { hasDeed?: boolean })[]>([]);
  useEffect(() => {
    if (!open || !caseItem?.id) { setJudgments([]); return; }
    const id = caseItem.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/cases/${id}/judgments`);
        const body = await res.json();
        if (!cancelled) setJudgments(Array.isArray(body?.judgments) ? body.judgments : []);
      } catch {
        if (!cancelled) setJudgments([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, caseItem?.id, caseItem?.updatedAt]);

  // recorded_by is a bare varchar with NO FK (matching attending_lawyer_id /
  // flagged_by / checked_in_by), and the backfill wrote the established "system"
  // sentinel, which names no user. Resolve against the full roster rather than
  // `lawyers` — a صك receipt can be recorded by a branch_manager, who is not in
  // the assignable-lawyer list.
  const getJudgmentActorName = (id: string | null): string => {
    if (!id) return "-";
    if (id === "system") return "النظام";
    return users.find((u) => u.id === id)?.name || id;
  };

  // The case we render: the LIVE row the host passed (so context mutations —
  // inline edits, stage transitions — keep re-rendering it exactly as before),
  // with the real stageHistory grafted on when we have it.
  // Named `selectedCase` so the moved JSX below stays byte-for-byte identical to
  // the version that lived in cases.tsx.
  const selectedCase: LawCase | null = caseItem && fetchedHistory && fetchedHistory.id === caseItem.id
    ? { ...caseItem, stageHistory: fetchedHistory.stageHistory }
    : caseItem;

  const lawyers = users.filter((u) => u.canBeAssignedCases);
  const getLawyerName = (id: string | null): string => {
    if (!id) return "-";
    const lawyer = lawyers.find((l) => l.id === id);
    return lawyer?.name || "-";
  };

  const [activeTab, setActiveTab] = useState("info");
  // Honour a caller-supplied landing tab on each OPEN (not on every render, so
  // the user can still switch tabs freely once inside). Falls back to "info"
  // when no tab was requested, which is what every non-deep-link caller gets.
  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab || "info");
  }, [open, initialTab]);

  // ---- Hearing highlight (مهامي "إرفاق ضبط الجلسة") ----
  // A CALLBACK REF rather than an effect keyed on the hearings array, and the
  // difference matters: the الجلسات tab's content is unmounted while another tab
  // is active, and the hearings themselves arrive from a context that may still
  // be loading when the dialog opens. A callback ref fires exactly when the row
  // node first attaches — whichever of those two happens last — so it needs no
  // dependency list and cannot race the data.
  //
  // The flag makes it fire ONCE per (open, target): without it, every re-render
  // that re-attaches the node would yank the user's scroll position back while
  // they were reading something else.
  const scrolledToHearingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) scrolledToHearingRef.current = null;
  }, [open]);
  const highlightRowRef = (el: HTMLTableRowElement | null) => {
    if (!el || !highlightHearingId) return;
    if (scrolledToHearingRef.current === highlightHearingId) return;
    scrolledToHearingRef.current = highlightHearingId;
    // block:"center" rather than the default "start": the row's ACTIONS cell —
    // which holds the ضبط paperclip — is what the user came for, and centring
    // keeps it clear of the dialog's sticky header.
    el.scrollIntoView({ block: "center" });
  };

  const [stageTransitioning, setStageTransitioning] = useState(false);
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>("");
  // لوحة تفاصيل المخالفة — one form for all eleven fields rather than eleven
  // independent inline edits. The endpoint writes partially, so an untouched
  // field is still sent unchanged and diffed away server-side; what this buys is
  // ONE save for a panel a user fills in a sitting, instead of eleven round
  // trips each with its own failure mode.
  const [violationEditing, setViolationEditing] = useState(false);
  const [violationSaving, setViolationSaving] = useState(false);
  const [violationForm, setViolationForm] = useState<Record<string, string>>({});
  const [registrationDialogType, setRegistrationDialogType] = useState<"" | "taradi" | "mohr">("");
  const [registrationNumberInput, setRegistrationNumberInput] = useState("");
  // Phase-8 — surface the await reason / who / when in the awaiting
  // banner. The data lives only in case_activity_log (not on the case
  // row itself, unlike pauseReason), so we fetch the log when the
  // dialog opens for an awaiting case and pick the latest
  // await_completion entry.
  const [awaitInfo, setAwaitInfo] = useState<{ reason: string; userName: string; createdAt: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!open || !selectedCase?.id || !selectedCase.awaitingCompletion) {
      setAwaitInfo(null);
      return;
    }
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/cases/${selectedCase.id}/activity`);
        const json = await res.json();
        const rows: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        const latest = rows
          .filter((r) => r.actionType === "await_completion")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!cancelled && latest) {
          setAwaitInfo({
            reason: latest.details || "",
            userName: latest.userName || "",
            createdAt: latest.createdAt || "",
          });
        } else if (!cancelled) {
          setAwaitInfo(null);
        }
      } catch {
        if (!cancelled) setAwaitInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedCase?.id, selectedCase?.awaitingCompletion]);

  // Source-consultation lookup for the "أُنشئت من استشارة #X" back-link
  // on the case detail dialog. Fetched on demand by ID via the existing
  // GET /api/consultations/:id endpoint — a small per-open round-trip,
  // chosen over JOINing into /api/cases (would require a server change
  // and would pay the cost on every list response, not just on open).
  const [sourceConsultation, setSourceConsultation] = useState<{ id: string; consultationNumber: string } | null>(null);
  useEffect(() => {
    const sourceId = selectedCase ? (selectedCase.convertedFromConsultationId as string | null) : null;
    if (!sourceId) {
      setSourceConsultation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/consultations/${sourceId}`);
        const data = await res.json();
        if (!cancelled) {
          setSourceConsultation({ id: data.id, consultationNumber: data.consultationNumber });
        }
      } catch {
        if (!cancelled) setSourceConsultation(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCase?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setActiveTab("info"); setHearingDetailId(null); } }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>تفاصيل القضية <LtrInline>{selectedCase?.caseNumber}</LtrInline></DialogTitle>
              {selectedCase && actions?.canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-edit-from-details"
                  onClick={() => { onOpenChange(false); actions.onEdit(); }}
                >
                  <Pencil className="w-4 h-4 ml-2" />
                  تعديل البيانات
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedCase && (
            <div className="space-y-6">
              {/* Phase-8 — awaiting-completion banner. Surfaces savedStage
                  so the user knows where they'll return on resume. */}
              {selectedCase.awaitingCompletion && !isCasePaused(selectedCase) && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                  data-testid="banner-case-awaiting"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    هذه القضية بانتظار استكمال البيانات
                  </div>
                  {/* Phase-8 — reason / who / when from case_activity_log
                      (loaded into awaitInfo by the useEffect above). */}
                  {awaitInfo?.reason && (
                    <div className="mt-1">
                      السبب: <BidiText>{awaitInfo.reason}</BidiText>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-amber-700/80">
                    {awaitInfo?.userName && (
                      <>بواسطة <BidiText>{awaitInfo.userName}</BidiText></>
                    )}
                    {awaitInfo?.createdAt && (
                      <>
                        {awaitInfo.userName ? " — " : ""}
                        {/* DATE ONLY in LOCAL time — .toISOString() rendered
                            UTC and showed YESTERDAY between 00:00 and 03:00
                            Riyadh. No time added: this line never had one. */}
                        في {new Date(awaitInfo.createdAt).toLocaleDateString("ar")}
                      </>
                    )}
                  </div>
                  {selectedCase.savedStage && (
                    <div className="mt-1 text-xs">
                      ستعود إلى: <BidiText>{getStageLabel(selectedCase.savedStage as CaseStageValue)}</BidiText>
                    </div>
                  )}
                  {/* The client never responded → close. Lives INSIDE the banner
                      so the escape hatch sits with the state it escapes from,
                      rather than as a third amber box. The Path-A counterpart
                      (case at the stage with the latch off, so this banner does
                      not render) is the standalone strip below. */}
                  {actions?.canCloseNoResponse && (
                    <div className="mt-2 pt-2 border-t border-amber-500/30">
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid="button-close-no-response-banner"
                        onClick={() => { onOpenChange(false); actions.onCloseNoResponse(); }}
                      >
                        <Archive className="w-4 h-4 ml-2" />
                        إغلاق لعدم استكمال البيانات
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {/* PATH A — the case reached استكمال_البيانات by the ordinary
                  استلام advance, so awaitingCompletion is FALSE and the banner
                  above does not render. This is the COMMON path, and the action
                  must be reachable from the dialog there too. Rendered only when
                  that banner is absent, so exactly one box shows either way. */}
              {actions?.canCloseNoResponse && !selectedCase.awaitingCompletion && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 flex items-center justify-between gap-3 flex-wrap"
                  data-testid="banner-case-data-completion"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    القضية في مرحلة استكمال المرفقات والبيانات
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    data-testid="button-close-no-response-strip"
                    onClick={() => { onOpenChange(false); actions.onCloseNoResponse(); }}
                  >
                    <Archive className="w-4 h-4 ml-2" />
                    إغلاق لعدم استكمال البيانات
                  </Button>
                </div>
              )}
              {/* Phase-8 — paused banner. Renders at the top of the details
                  dialog when the case is paused so reason / who / when is
                  visible without scrolling. */}
              {isCasePaused(selectedCase) && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                  data-testid="banner-case-paused"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Pause className="w-4 h-4" />
                    هذه القضية معلّقة
                  </div>
                  {selectedCase.pauseReason && (
                    <div className="mt-1">
                      السبب: <BidiText>{selectedCase.pauseReason}</BidiText>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-amber-700/80">
                    {selectedCase.pausedBy && (
                      <>بواسطة <BidiText>{getLawyerName(selectedCase.pausedBy)}</BidiText></>
                    )}
                    {selectedCase.pausedAt && (
                      <>
                        {selectedCase.pausedBy ? " — " : ""}
                        {/* Same defect, same fix — found by the sweep, not
                            reported. Date only, local. */}
                        في {new Date(selectedCase.pausedAt).toLocaleDateString("ar")}
                      </>
                    )}
                  </div>
                  {/* Auto-lift date. Absent = open-ended pause (the default),
                      in which case we say so explicitly rather than leaving the
                      user to guess whether a date was set. */}
                  <div className="mt-1 text-xs font-medium">
                    {selectedCase.pauseUntil
                      ? <>ينتهي التعليق تلقائياً في: <LtrInline>{selectedCase.pauseUntil}</LtrInline></>
                      : <span className="text-amber-700/80">تعليق مفتوح — يستمر حتى يُلغى يدوياً</span>}
                  </div>
                </div>
              )}
              {sourceConsultation && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary hover-elevate rounded px-2 py-1 -mx-2"
                  onClick={() => setLocation(`/consultations?openConsultation=${sourceConsultation.id}`)}
                  data-testid="link-go-to-source-consultation"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  أُنشئت من استشارة <LtrInline>#{sourceConsultation.consultationNumber}</LtrInline>
                </button>
              )}
              {selectedCase.caseClassification === CaseClassification.IN_COURT &&
               selectedCase.nextHearingDate &&
               new Date(selectedCase.nextHearingDate) > new Date() && (
                <div className="flex items-start gap-3 rounded-lg border border-orange-500/60 bg-orange-500/10 px-4 py-3 text-orange-700 dark:text-orange-400" dir="rtl">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm font-semibold">
                    هذه القضية منظورة وفيها جلسة قادمة بتاريخ{" "}
                    <span className="font-bold">
                      <DualDateDisplay date={selectedCase.nextHearingDate} compact />
                    </span>
                  </p>
                </div>
              )}
              {(selectedCase.currentStage === "قيد_التدقيق_في_تراضي" ||
                selectedCase.currentStage === "قيد_التدقيق_في_ناجز" ||
                selectedCase.currentStage === "قيد_التدقيق_في_معين") && (
                <div
                  className="bg-indigo-50 dark:bg-indigo-950/30 border-2 border-indigo-400 dark:border-indigo-800 rounded-lg p-4 mb-4 shadow-sm"
                  dir="rtl"
                  data-testid="banner-platform-review-notes"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-bold text-indigo-900 dark:text-indigo-200 mb-1">
                        {selectedCase.currentStage === "قيد_التدقيق_في_تراضي"
                          ? "ملاحظات منصة تراضي"
                          : selectedCase.currentStage === "قيد_التدقيق_في_ناجز"
                          ? "ملاحظات منصة ناجز"
                          : "ملاحظات منصة معين"}
                      </h4>
                      {(() => {
                        const notes = selectedCase.platformReviewNotes;
                        const resubmitted = !!selectedCase.platformReviewResubmitted;
                        if (notes && String(notes).trim()) {
                          return (
                            <>
                              <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-2 font-semibold">
                                حالة الطلب: يوجد ملاحظات — بحاجة لاستكمال
                              </p>
                              <p className="text-sm text-indigo-900 dark:text-indigo-200 whitespace-pre-wrap">{notes}</p>
                            </>
                          );
                        }
                        if (resubmitted) {
                          return (
                            <p className="text-xs text-indigo-700 dark:text-indigo-300">
                              حالة الطلب: تم إعادة التقديم — بانتظار رد المنصة
                            </p>
                          );
                        }
                        return (
                          <p className="text-xs text-indigo-700 dark:text-indigo-300">
                            حالة الطلب: بانتظار رد المنصة
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-4 text-center">مراحل القضية</h4>
                <CaseStagePanel
                  caseItem={selectedCase}
                  onHearingPrompt={onHearingPrompt}
                  onClosed={onClosed}
                />
              </div>

              {/* 🔴 dir="rtl" IS LOAD-BEARING, NOT DECORATION. Radix Tabs.Root
                  resolves its direction as `localDir || globalDir || "ltr"`
                  (@radix-ui/react-direction) and then STAMPS a literal dir
                  attribute onto its own div. With no dir prop here and no
                  DirectionProvider anywhere in this app, that resolved to "ltr" —
                  so an explicit dir="ltr" sat BETWEEN the DialogContent's
                  dir="rtl" and everything in the tabs, flipping the whole panel
                  to LTR. The visible symptom was the الجلسات table reading
                  الإجراءات-first from the right edge; the cause was never the
                  column order, which is why reordering would have been the wrong
                  fix (it would have left header text and cell alignment mirrored).
                  The list pages get this right for free by not being inside Tabs.
                  reports.tsx:1024 and support.tsx:256 already pass dir="rtl" for
                  exactly this reason — this follows that precedent. */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
                {/* 🔴 THE COLUMN COUNT IS COUPLED TO THE TRIGGER LIST BELOW —
                    grid-cols-* must equal the number of TabsTrigger elements, or
                    the row wraps ragged (the grid does not count them for you).
                    EIGHT triggers today: 4 x 2 on small, one row of 8 on lg.
                    ⚠ ADD OR REMOVE A TRIGGER AND YOU MUST EDIT THIS LINE TOO.
                    It went 8 -> 9 when الأحكام was added and back to 8 when
                    التعليقات was removed; the المهام tab that replaces التعليقات
                    returns it to 9. Count the triggers, never assume. */}
                <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
                  <TabsTrigger value="info" data-testid="tab-info">المعلومات</TabsTrigger>
                  <TabsTrigger value="hearings" data-testid="tab-hearings">الجلسات</TabsTrigger>
                  {/* Placed between الجلسات and سجل المراحل on purpose: the court
                      record reads sessions -> rulings -> stage history, and it
                      leaves سجل الأحكام adjacent to the tab it used to live
                      inside, so anyone who knew the old location finds it one tab
                      over rather than at the far end of the row. */}
                  <TabsTrigger value="judgments" data-testid="tab-judgments">الأحكام</TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">سجل المراحل</TabsTrigger>
                  <TabsTrigger value="activity" data-testid="tab-activity">النشاط</TabsTrigger>
                  <TabsTrigger value="notes" data-testid="tab-notes">ملاحظات</TabsTrigger>
                  <TabsTrigger value="deadlines" data-testid="tab-deadlines">مواعيد</TabsTrigger>
                  <TabsTrigger value="actions" data-testid="tab-actions">الإجراءات</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                    <div>
                      <Label className="text-muted-foreground">العميل</Label>
                      <p className="font-medium"><BidiText>{getClientName(selectedCase.clientId)}</BidiText></p>
                    </div>
                    {selectedCase.plaintiffName && (
                      <div>
                        <Label className="text-muted-foreground">اسم المدعي</Label>
                        <p className="font-medium"><BidiText>{selectedCase.plaintiffName}</BidiText></p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">الخصم</Label>
                      <p className="font-medium"><BidiText>{selectedCase.opponentName || "-"}</BidiText></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المحامي المسؤول</Label>
                      <p className="font-medium">{getLawyerName(caseNotificationRecipientId(selectedCase))}</p>
                      {/* "المترافع" — shown ONLY when the case designates one, and
                          directly under the responsible lawyer, so it is obvious
                          at a glance that someone ELSE appears in court. Absent
                          on the overwhelming majority of cases, which is why it
                          renders nothing rather than an em-dash row. */}
                      {selectedCase.litigatorId && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                          <Gavel className="w-3 h-3" />
                          يترافع عنه: <BidiText>{getLawyerName(selectedCase.litigatorId)}</BidiText>
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground">النوع</Label>
                      <p>{selectedCase.caseType || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الأولوية</Label>
                      <div><Badge className={getPriorityColor(selectedCase.priority)}>{selectedCase.priority}</Badge></div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">القسم</Label>
                      <p>{selectedCase.departmentId === "أخرى" ? (selectedCase.departmentOther || "أخرى") : getDepartmentName(selectedCase.departmentId)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المحكمة</Label>
                      <p>{selectedCase.courtName || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">رقم القضية</Label>
                      <p><LtrInline>{selectedCase.caseNumber || "-"}</LtrInline></p>
                    </div>
                    {/* صك الحكم — THE READ SURFACE. Until now the deed was
                        reachable ONLY through the "تسجيل استلام الصك" / late-attach
                        dialogs, both gated on the WRITE roles, so a user who could
                        read the case but not attach could not see it at all — even
                        though the server's DOWNLOAD route is gated on canModifyCase,
                        the view-level rule. This closes that gap on the read side,
                        matching the download gate rather than the attach gate.
                        canEdit={false}: SingleAttachmentControl renders preview and
                        download whenever a file exists and hides upload/replace/
                        delete without it, which is exactly the read-only split.
                        Writing still happens only through the existing dialogs, so
                        there is no second write path.
                        Placed in the المعلومات grid beside المحكمة / رقم القضية —
                        the case's existing court-information section — rather than
                        in a new panel, and shown only for a case that actually
                        reached a judgment stage so it never appears on files that
                        can have no صك. */}
                    {caseReachedJudgment(selectedCase) && (
                      <div className="sm:col-span-2">
                        <Label className="text-muted-foreground">صك الحكم</Label>
                        <SingleAttachmentControl
                          endpoint={`/api/cases/${selectedCase.id}/deed-attachment`}
                          label="ملف صك الحكم"
                          emptyHint="لم يُرفق الصك بعد"
                          canEdit={false}
                        />
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">موعد الجلسة القادمة</Label>
                      <p className="font-medium">
                        {(() => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const upcoming = getHearingsByCase(selectedCase.id)
                            .filter((h) => {
                              if (!h.hearingDate) return false;
                              const d = new Date(h.hearingDate);
                              return !isNaN(d.getTime()) && d >= today;
                            })
                            .sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime())[0];
                          return upcoming ? <DualDateDisplay date={upcoming.hearingDate} compact /> : "-";
                        })()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">آخر جلسة</Label>
                      <p className="font-medium">
                        {selectedCase.lastHearingDate
                          ? <DualDateDisplay date={selectedCase.lastHearingDate} compact />
                          : "-"}
                      </p>
                    </div>
                    {selectedCase.responseDeadline && (
                      <div>
                        <Label className="text-muted-foreground">مهلة الرد</Label>
                        <p className="font-medium">
                          {/* NO `compact` — a DEADLINE must show both calendars.
                              compact renders Hijri only and hides the Gregorian in a
                              hover title, which on a date the firm is measured against
                              is not a display at all. Timestamps and table cells keep
                              compact deliberately; deadlines do not. */}
                          <DualDateDisplay date={selectedCase.responseDeadline} />
                        </p>
                      </div>
                    )}
                    {getHearingsByCase(selectedCase.id).some(h => h.opponentResponseRequired) && (
                      <div>
                        <Label className="text-muted-foreground">رد الخصم</Label>
                        <Badge variant="outline" className="mt-1 border-orange-500 text-orange-600 dark:text-orange-400">
                          مطلوب رد من الخصم
                        </Badge>
                      </div>
                    )}
                    {selectedCase.taradiNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم الطلب في تراضي</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.taradiNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.najizNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم القيد في ناجز</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.najizNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.moeenNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم القيد في معين</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.moeenNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.mohrNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم التسوية</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.mohrNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.executionRequestNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم طلب التنفيذ</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.executionRequestNumber}</LtrInline></p>
                      </div>
                    )}
                    {(selectedCase.currentStage === "قيد_التدقيق_في_تراضي" ||
                      selectedCase.currentStage === "قيد_التدقيق_في_ناجز" ||
                      selectedCase.currentStage === "قيد_التدقيق_في_معين") && (
                      <div>
                        <Label className="text-muted-foreground">حالة الطلب في المنصة</Label>
                        <p className="font-medium">
                          {(() => {
                            const notes = selectedCase.platformReviewNotes;
                            const resubmitted = !!selectedCase.platformReviewResubmitted;
                            if (notes && String(notes).trim()) {
                              return <span className="text-amber-700">يوجد ملاحظات — بحاجة لاستكمال</span>;
                            }
                            if (resubmitted) {
                              return <span className="text-blue-700">تم إعادة التقديم — بانتظار رد المنصة</span>;
                            }
                            return <span className="text-muted-foreground">بانتظار رد المنصة</span>;
                          })()}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">بيانات الخصم</h4>
                    <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                      <div>
                        <Label className="text-muted-foreground">اسم الخصم</Label>
                        <p><BidiText>{selectedCase.opponentName || "-"}</BidiText></p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">هاتف الخصم</Label>
                        <p><LtrInline>{selectedCase.opponentPhone || "-"}</LtrInline></p>
                      </div>
                    </div>
                  </div>
                  
                  {selectedCase.currentStage === "مراجعة_داخلية" && selectedCase.internalReviewerId && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-2">المراجع الداخلي</h4>
                      <p className="p-3 bg-muted rounded-md">
                        {users.find(u => u.id === selectedCase.internalReviewerId)?.name || "غير معروف"}
                      </p>
                    </div>
                  )}

                  {selectedCase.reviewNotes && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 text-destructive">ملاحظات المراجعة</h4>
                      <p className="p-3 bg-destructive/10 rounded-md text-destructive">
                        {selectedCase.reviewNotes}
                      </p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                      <div>
                        <Label className="text-muted-foreground">صفة العميل</Label>
                        <p className="font-medium">{(() => {
                          const label = getClientRoleLabel(selectedCase.caseClassification, selectedCase.clientRole);
                          return label;
                        })()}</p>
                      </div>
                    </div>
                  </div>

                  {selectedCase.currentStage === "مشطوبة" && selectedCase.struckOffReopenDeadline && (
                    <div className="border-t pt-4">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-red-700 dark:text-red-400">القضية مشطوبة</span>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            الموعد النهائي لإعادة القيد: {selectedCase.struckOffReopenDeadline}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.currentStage === "مقفلة" && selectedCase.closureReason && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سبب الإغلاق</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">السبب</Label>
                          {/* KEPT — this is the DETAIL view; the stage badge is the
                              at-a-glance version and shows a truncated form of the
                              same thing. Label source switched from a naive
                              underscore-replace to the shared ClosureReasonLabels so
                              the two can never drift; an unrecognised value (the
                              scheduler writes a free-text sentence) still falls back
                              to the raw string, untruncated here. */}
                          <p className="font-medium">{selectedCase.closureReason === "أخرى"
                            ? selectedCase.closureReasonOther || ClosureReasonLabels["أخرى"]
                            : (ClosureReasonLabels[selectedCase.closureReason as ClosureReasonValue] ?? selectedCase.closureReason)}</p>
                          {/* closureReasonOther used to render ONLY under أخرى,
                              which would have silently swallowed the missing-data
                              text that close-no-response writes there. Now shown
                              for ANY non-empty value on a non-أخرى reason — أخرى
                              keeps rendering it as the reason ITSELF above, so
                              this must not repeat it. Nothing else writes the
                              column on a non-أخرى closure today, so no existing
                              closed case gains a line. */}
                          {selectedCase.closureReason !== "أخرى"
                            && !!String(selectedCase.closureReasonOther || "").trim() && (
                            <p className="text-sm text-muted-foreground mt-1">
                              <BidiText>{selectedCase.closureReasonOther}</BidiText>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.grievanceRequired && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">بيانات التظلم</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">مطلوب تظلم</Label>
                          <p className="font-medium">نعم</p>
                        </div>
                        {selectedCase.grievanceDate && (
                          <div>
                            <Label className="text-muted-foreground">تاريخ التظلم</Label>
                            <p className="font-medium">{selectedCase.grievanceDate}</p>
                          </div>
                        )}
                        {selectedCase.grievanceResult && (
                          <div>
                            <Label className="text-muted-foreground">نتيجة التظلم</Label>
                            <p className="font-medium">{selectedCase.grievanceResult}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 🔴 GATED ON THE RESOLVED DEPARTMENT, NEVER ON caseType — the
                      documented L5 precedent (hearings.tsx, the labor settlement
                      panels, case-progress-bar). caseType is free-text user input
                      and "إداري" is a value in BOTH CaseType and the departments
                      table, so the two readings silently disagree: the create and
                      edit forms that CAPTURE these fields gate on
                      getDepartmentName(departmentId) === "إداري" (cases.tsx), while
                      this panel gated on the type — so an إداري-DEPARTMENT case
                      typed anything else collected نوع القضية الإدارية + تاريخ
                      التقادم as mandatory fields and then never displayed either.
                      Now keyed exactly like the تجاري and عمالي workflow panels
                      immediately below, so capture and display cannot drift. */}
                  {/* 🔴 THIS PANEL NEVER RENDERS TODAY. IT IS NOT WORKING CODE.
                      Read the gate below: it requires a TRUTHY adminCaseSubType, and
                      that column is NULL on EVERY case — ef4d221 removed نوع القضية
                      الإدارية from the create dialog (owner ruling: the تظلم/دعوى
                      choice is made at استلام, by two buttons, not at creation), and
                      nothing has written it since. It stays NULL until the استلام flow
                      ships and starts setting it; only then does this panel come back.

                      DELIBERATELY LEFT IN PLACE, not deleted:
                        • تاريخ التقادم appears here AND in لوحة تفاصيل المخالفة below.
                          That duplication is UNREACHABLE while this gate is false, so
                          removing the row would be a no-op today that silently deletes
                          a display if this panel is ever revived. If you fix this gate,
                          drop the تاريخ التقادم row here at the same time — the
                          violation panel is now its prominent home (7254d54).
                        • Its caseClassification === UNDER_STUDY term is ALSO wrong, for
                          the same reason it was dropped from the violation panel and
                          the edit dialog: نوع القضية الإدارية is a routing fact that
                          survives a case going in-court. Left as-is pending a ruling,
                          because fixing that term alone still would not make the panel
                          render — the adminCaseSubType term is what kills it. */}
                  {selectedCase.caseClassification === CaseClassification.UNDER_STUDY && getDepartmentName(selectedCase.departmentId || "") === "إداري" && selectedCase.adminCaseSubType && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">تفاصيل القضية الإدارية</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">نوع القضية</Label>
                          <p className="font-medium">{selectedCase.adminCaseSubType === "تظلم" ? "تظلم" : "قضية"}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">تاريخ التقادم</Label>
                          <p className="font-medium">{selectedCase.prescriptionDate ? <DualDateDisplay date={selectedCase.prescriptionDate} compact /> : "-"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ==================== لوحة تفاصيل المخالفة ====================
                      A SIBLING of the «تفاصيل القضية الإدارية» panel above, not an
                      extension of it — that one is untouched by this batch.

                      🔴 GATED ON CLASSIFICATION + DEPARTMENT ONLY (owner ruling).
                      Deliberately NOT on a truthy adminCaseSubType the way the
                      panel above is: the facts of the violation exist before any
                      تظلم/دعوى routing decision is made at استلام, so gating on
                      that would hide the panel exactly when it is first needed.
                      Department name, never caseType — the L5 precedent.

                      🔴 AND NOT ON CLASSIFICATION EITHER (owner correction). The
                      UNDER_STUDY term that stood here was wrong for the same
                      reason: the decision number, the fine amount, إيفاء and the
                      اعتراض are FACTS ABOUT THE VIOLATION, true whether the case
                      is قيد_الدراسة or منظورة_بالمحكمة. An in-court admin case had
                      no panel at all — the owner hit exactly that. Department is
                      the only thing that decides whether these fields apply. */}
                  {getDepartmentName(selectedCase.departmentId || "") === "إداري" && (
                    <div className="border-t pt-4" data-testid="panel-violation-details">
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <h4 className="font-semibold">تفاصيل المخالفة</h4>
                        {canEditCaseViolationDetails(selectedCase, user, actingIdentities) && !violationEditing && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid="button-edit-violation-details"
                            onClick={() => {
                              // Seed the form from the CASE, so an untouched field
                              // round-trips its current value and the server diffs
                              // it away rather than logging a phantom change.
                              const seed: Record<string, string> = {};
                              for (const f of VIOLATION_PANEL_FIELDS) {
                                seed[f.key] = String((selectedCase as unknown as Record<string, unknown>)[f.key] ?? "");
                              }
                              setViolationForm(seed);
                              setViolationEditing(true);
                            }}
                          >
                            <Pencil className="w-3 h-3 ml-1" />
                            تعديل
                          </Button>
                        )}
                      </div>

                      {/* ==================== تاريخ التقادم ====================
                          🔴 MOVED HERE because it was UNREACHABLE. It displayed only
                          inside the d821c67 «تفاصيل القضية الإدارية» panel, whose gate
                          requires a truthy adminCaseSubType — and that column has been
                          NULL on every case since ef4d221 took the field off the create
                          form. So the panel never rendered and the prescription date
                          could be written (edit form) but never seen.

                          PROMINENT BY DESIGN, not one of the twelve grid cells below.
                          It is the only field here that is a DEADLINE: miss it and the
                          case dies, whereas every other field is a reference number or
                          a record of something that already happened. So it gets its
                          own full-width bordered block above the grid, an amber tone,
                          text-2xl and an icon — the same visual weight the dialog gives
                          its other "this will hurt you" banners. Empty reads «لم يُحدَّد
                          بعد» in the same tone rather than the neutral «غير مُضاف»,
                          because an unset prescription date is not merely missing data.

                          🔴 READ-ONLY. No edit control here, deliberately: this panel
                          must NOT become a second writer. The استلام batch will COMPUTE
                          this date, and a hand-typed value contradicting a computed one
                          is precisely the two-writers trap. Today's single writer stays
                          the edit dialog. ⚠ See the report — that writer is itself
                          gated on UNDER_STUDY, so on an IN-COURT admin case this value
                          is currently visible-but-unsettable; that is a one-term fix in
                          cases.tsx awaiting the owner's word, not something to paper
                          over by adding an input here. */}
                      <div
                        className="mb-4 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 px-4 py-3"
                        dir="rtl"
                        data-testid="violation-prescription-date"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
                          <Label className="text-amber-800 dark:text-amber-300 font-semibold">تاريخ التقادم</Label>
                        </div>
                        <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">
                          {selectedCase.prescriptionDate
                            ? <DualDateDisplay date={selectedCase.prescriptionDate} />
                            : <span className="text-base font-medium text-amber-700 dark:text-amber-400">لم يُحدَّد بعد</span>}
                        </div>
                      </div>

                      {!violationEditing ? (
                        <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                          {VIOLATION_PANEL_FIELDS.map((f) => {
                            const raw = String((selectedCase as unknown as Record<string, unknown>)[f.key] ?? "");
                            return (
                              <div key={f.key}>
                                <Label className="text-muted-foreground">{f.label}</Label>
                                <p className="font-medium" data-testid={`violation-value-${f.key}`}>
                                  {!raw ? (
                                    // EVERY field is null on every case today. The
                                    // placeholder is the same «غير مُضاف» the
                                    // execution-number row beside it already uses,
                                    // so an empty panel reads as "not recorded yet"
                                    // rather than as a broken one.
                                    <span className="text-muted-foreground text-sm italic">غير مُضاف</span>
                                  ) : f.kind === "date" ? (
                                    // 🔴 NO `compact` — that flag is what was hiding the
                                    // Gregorian half. DualDateDisplay's compact branch
                                    // renders ONLY dual.hijri and buries the Gregorian
                                    // in a title tooltip; the default branch stacks both
                                    // (Hijri bold on top, Gregorian + «م» beneath).
                                    // Matches hearing-details-dialog.tsx:612
                                    // (<DualDateDisplay date={...objectionDeadline} />) —
                                    // a deadline in a details dialog, the same shape.
                                    <DualDateDisplay date={raw} />
                                  ) : f.kind === "select" ? (
                                    // 🔴 TOLERANT READ. grievance_result is
                                    // varchar(50) free text and may hold a legacy
                                    // value outside the set. `?? raw` shows
                                    // whatever is stored rather than blanking it
                                    // or throwing on a missing map key — the map
                                    // is a lookup, never assumed total.
                                    <>{GrievanceResultLabels[raw as GrievanceResultValue] ?? raw}</>
                                  ) : f.kind === "amount" ? (
                                    // 🔴 COPIED VERBATIM FROM A SITE THAT DEMONSTRABLY
                                    // RENDERS CORRECTLY — case-tabs.tsx:604,
                                    //     <span>المدة: {deadline.durationDays} يوم</span>
                                    // — rather than derived again from bidi reasoning.
                                    //
                                    // 2a91ead removed LtrInline and was still wrong,
                                    // which means the inline-block was not the whole
                                    // story. The remaining difference from the six
                                    // working sites was structural and is the one thing
                                    // left to remove: the UNIT WAS ITS OWN ELEMENT
                                    // (<span className="text-muted-foreground text-sm">
                                    // ريال</span>) instead of plain text in the SAME run
                                    // as the number. Every working site — case-tabs 604
                                    // /484/607, reports 203/359/888 — puts the number
                                    // and its Arabic unit in ONE text node inside ONE
                                    // element, with nothing between them but a space.
                                    // This line now does exactly that; the muted styling
                                    // is dropped because it is what required the extra
                                    // element, and no working site styles its unit
                                    // separately either.
                                    <span>{formatAmount(raw)} ريال</span>
                                  ) : (
                                    <LtrInline>{raw}</LtrInline>
                                  )}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            {VIOLATION_PANEL_FIELDS.map((f) => (
                              <div key={f.key}>
                                <Label className="text-muted-foreground">{f.label}</Label>
                                {f.kind === "date" ? (
                                  <HijriDatePicker
                                    value={violationForm[f.key] || ""}
                                    onChange={(v) => setViolationForm((prev) => ({ ...prev, [f.key]: v }))}
                                    data-testid={`violation-input-${f.key}`}
                                  />
                                ) : f.kind === "select" ? (
                                  <Select
                                    value={violationForm[f.key] || ""}
                                    onValueChange={(v) => setViolationForm((prev) => ({ ...prev, [f.key]: v }))}
                                  >
                                    <SelectTrigger data-testid={`violation-input-${f.key}`}>
                                      <SelectValue placeholder="اختر النتيجة" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(f.options ?? []).map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                          {GrievanceResultLabels[opt as GrievanceResultValue] ?? opt}
                                        </SelectItem>
                                      ))}
                                      {/* 🔴 THE OUT-OF-SET ESCAPE HATCH. The column
                                          is free text, so a stored value may not be
                                          one of the three. Without this option the
                                          Select would render EMPTY over a non-empty
                                          column and the next save would silently
                                          clear it — data loss by dropdown. Appended
                                          only when it is genuinely unknown, so the
                                          normal case shows exactly three options. */}
                                      {(() => {
                                        const cur = violationForm[f.key] || "";
                                        return cur && !(f.options ?? []).includes(cur) ? (
                                          <SelectItem key={cur} value={cur}>{cur} (قيمة قديمة)</SelectItem>
                                        ) : null;
                                      })()}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={violationForm[f.key] || ""}
                                    onChange={(e) => setViolationForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                    // A decimal keypad on mobile for the amount; the
                                    // VALUE stays a string end to end, matching the
                                    // column's inferred type. type="number" was
                                    // rejected: it silently drops what it considers
                                    // invalid and localises the separator.
                                    inputMode={f.kind === "amount" ? "decimal" : undefined}
                                    placeholder={f.kind === "amount" ? "مثال: 1500.00" : undefined}
                                    data-testid={`violation-input-${f.key}`}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={violationSaving}
                              data-testid="button-cancel-violation-details"
                              onClick={() => { setViolationEditing(false); setViolationForm({}); }}
                            >
                              <X className="w-3 h-3 ml-1" />
                              إلغاء
                            </Button>
                            <Button
                              size="sm"
                              disabled={violationSaving}
                              data-testid="button-save-violation-details"
                              onClick={async () => {
                                // Client-side amount check using the SHARED pattern,
                                // so the message arrives before the request rather
                                // than as a 400. The server re-checks regardless —
                                // this is convenience, never the enforcement.
                                const amount = (violationForm.violationAmount || "").trim();
                                if (amount && !ViolationAmountPattern.test(amount)) {
                                  toast({
                                    title: "مبلغ المخالفة غير صالح",
                                    description: "أدخل رقماً بحد أقصى منزلتين عشريتين",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                setViolationSaving(true);
                                try {
                                  const body: Record<string, string> = {};
                                  for (const f of VIOLATION_PANEL_FIELDS) {
                                    body[f.key] = (violationForm[f.key] || "").trim();
                                  }
                                  await apiRequest("PATCH", `/api/cases/${selectedCase.id}/violation-details`, body);
                                  // refreshCases repopulates the dialog's own case
                                  // from the server; the activity tab is invalidated
                                  // because the save writes an audit row it renders.
                                  await refreshCases();
                                  queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
                                  setViolationEditing(false);
                                  setViolationForm({});
                                  toast({ title: "تم حفظ تفاصيل المخالفة" });
                                } catch (err) {
                                  toast({
                                    title: "تعذّر حفظ تفاصيل المخالفة",
                                    description: extractApiError(err),
                                    variant: "destructive",
                                  });
                                } finally {
                                  setViolationSaving(false);
                                }
                              }}
                            >
                              <Check className="w-3 h-3 ml-1" />
                              حفظ
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.UNDER_STUDY && getDepartmentName(selectedCase.departmentId || "") === "تجاري" && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سير عمل منصة تراضي</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Badge variant={selectedCase.taradiStatus === "مقيدة_في_تراضي" ? "default" : selectedCase.taradiStatus === "تم_الصلح" ? "default" : selectedCase.taradiStatus === "لم_يتم_صلح" ? "destructive" : "secondary"}>
                            {selectedCase.taradiStatus ? ({
                              "مقيدة_في_تراضي": "مقيدة في تراضي",
                              "تم_الصلح": "تم الصلح",
                              "لم_يتم_صلح": "لم يتم صلح",
                            } as Record<string, string>)[selectedCase.taradiStatus] : "لم تقيد بعد"}
                          </Badge>
                          {selectedCase.taradiNumber && <span className="text-sm text-muted-foreground">رقم: {selectedCase.taradiNumber}</span>}
                        </div>
                        {!selectedCase.taradiStatus && (
                          registrationDialogType === "taradi" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input value={registrationNumberInput} onChange={e => setRegistrationNumberInput(e.target.value)} placeholder="رقم الطلب في تراضي (اختياري)" className="h-8 text-sm" data-testid="input-taradi-registration" autoFocus />
                              <Button size="sm" data-testid="button-confirm-taradi" onClick={async () => {
                                try {
                                  const res = await apiRequest("PATCH", `/api/cases/${selectedCase.id}/taradi`, { status: "مقيدة_في_تراضي", taradiNumber: registrationNumberInput });
                                  if (res.ok) { toast({ title: "تم التقييد في تراضي" }); setRegistrationDialogType(""); setRegistrationNumberInput(""); await updateCase(selectedCase.id, { taradiStatus: "مقيدة_في_تراضي", ...(registrationNumberInput ? { taradiNumber: registrationNumberInput } : {}) }); }
                                } catch (e) {
                                  // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                  // would otherwise surface as an unhandled promise rejection in console.
                                  // Future: surface an error toast (beyond Batch 2B scope).
                                }
                              }}>تأكيد</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setRegistrationDialogType(""); setRegistrationNumberInput(""); }}>إلغاء</Button>
                            </div>
                          ) : (
                            <Button size="sm" data-testid="button-register-taradi" onClick={() => { setRegistrationDialogType("taradi"); setRegistrationNumberInput(""); }}>
                              تقييد في منصة تراضي
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.UNDER_STUDY && getDepartmentName(selectedCase.departmentId || "") === "عمالي" && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سير عمل وزارة الموارد البشرية</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Badge variant={selectedCase.mohrStatus === "انتهت_التسوية" ? "destructive" : selectedCase.mohrStatus ? "default" : "secondary"}>
                            {selectedCase.mohrStatus ? ({
                              "مقيدة_في_الموارد": "مقيدة في وزارة الموارد البشرية",
                              "توجيه_تسوية_ودية": "تم توجيه العميل للتسوية الودية",
                              "انتهت_التسوية": "انتهت التسوية - جاهزة للرفع",
                            } as Record<string, string>)[selectedCase.mohrStatus] : "لم تقيد بعد"}
                          </Badge>
                          {selectedCase.mohrNumber && <span className="text-sm text-muted-foreground">رقم: {selectedCase.mohrNumber}</span>}
                        </div>
                        {canActOnMohrSettlement(selectedCase, user, actingIdentities) && !selectedCase.mohrStatus && (
                          registrationDialogType === "mohr" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input value={registrationNumberInput} onChange={e => setRegistrationNumberInput(e.target.value)} placeholder="رقم الطلب في الموارد البشرية (اختياري)" className="h-8 text-sm" data-testid="input-mohr-registration" autoFocus />
                              <Button size="sm" data-testid="button-confirm-mohr" onClick={async () => {
                                try {
                                  const res = await apiRequest("PATCH", `/api/cases/${selectedCase.id}/mohr`, { status: "مقيدة_في_الموارد", mohrNumber: registrationNumberInput });
                                  // The endpoint already persisted mohrStatus + mohrNumber; just
                                  // resync. (The old follow-up updateCase re-sent mohrStatus through
                                  // PATCH /api/cases/:id, which now 400s — see the C3 block there.)
                                  if (res.ok) { toast({ title: "تم التقييد في وزارة الموارد البشرية" }); setRegistrationDialogType(""); setRegistrationNumberInput(""); await refreshCases(); }
                                } catch (e) {
                                  // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                  // would otherwise surface as an unhandled promise rejection in console.
                                  // Future: surface an error toast (beyond Batch 2B scope).
                                }
                              }}>تأكيد</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setRegistrationDialogType(""); setRegistrationNumberInput(""); }}>إلغاء</Button>
                            </div>
                          ) : (
                          <Button
                            size="sm"
                            data-testid="button-register-mohr"
                            onClick={() => { setRegistrationDialogType("mohr"); setRegistrationNumberInput(""); }}
                          >
                            تقييد في وزارة الموارد البشرية
                          </Button>
                          )
                        )}
                        {canActOnMohrSettlement(selectedCase, user, actingIdentities) && selectedCase.mohrStatus === "مقيدة_في_الموارد" && (
                          <Button
                            size="sm"
                            data-testid="button-direct-settlement"
                            onClick={async () => {
                              try {
                                const res = await apiRequest("POST", `/api/cases/${selectedCase.id}/direct-settlement`, {});
                                if (res.ok) { toast({ title: "تم توجيه العميل للتسوية الودية - سيتم إشعار الدعم الإداري" }); await refreshCases(); }
                              } catch (e) {
                                // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                // would otherwise surface as an unhandled promise rejection in console.
                                // Future: surface an error toast (beyond Batch 2B scope).
                              }
                            }}
                          >
                            توجيه العميل لرفعها في التسوية الودية
                          </Button>
                        )}
                        {canActOnMohrSettlement(selectedCase, user, actingIdentities) && selectedCase.mohrStatus === "توجيه_تسوية_ودية" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            data-testid="button-settlement-ended"
                            onClick={async () => {
                              try {
                                const res = await apiRequest("PATCH", `/api/cases/${selectedCase.id}/mohr`, { status: "انتهت_التسوية" });
                                if (res.ok) { toast({ title: "تم تسجيل انتهاء التسوية - سيتم إشعار القسم لاستكمال الدراسة والرفع" }); await refreshCases(); }
                              } catch (e) {
                                // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                // would otherwise surface as an unhandled promise rejection in console.
                                // Future: surface an error toast (beyond Batch 2B scope).
                              }
                            }}
                          >
                            انتهاء مرحلة التسوية الودية
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {CaseStagesOrder.indexOf(selectedCase.currentStage) >= CaseStagesOrder.indexOf(CaseStage.READY_TO_SUBMIT) && (
                    selectedCase.caseType === "تجاري" || selectedCase.caseType === "عمالي"
                  ) && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 flex-row-reverse">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        أرقام الطلبات - جاهزة للرفع
                      </h4>
                      <div className="grid grid-cols-2 gap-4" dir="rtl">
                        {selectedCase.caseType === "تجاري" && (
                          <div className="text-right">
                            <Label className="text-muted-foreground block text-right">رقم الطلب في منصة تراضي</Label>
                            {selectedCase.taradiStatus === "تم_الصلح" || selectedCase.taradiStatus === "لم_يتم_صلح" ? (
                              <p className="font-medium mt-1">{selectedCase.taradiNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                            ) : (
                              <div className="flex items-center gap-2 mt-1 justify-end">
                                {inlineEditField === `taradi-${selectedCase.id}` ? (
                                  <>
                                    <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-taradi-number"
                                      onKeyDown={async e => {
                                        if (e.key === "Enter") { await updateCase(selectedCase.id, { taradiNumber: inlineEditValue }); setInlineEditField(null); }
                                        else if (e.key === "Escape") setInlineEditField(null);
                                      }} />
                                    <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { taradiNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-medium">{selectedCase.taradiNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                    <Button variant="ghost" size="sm" data-testid="button-edit-taradi-number" onClick={() => { setInlineEditField(`taradi-${selectedCase.id}`); setInlineEditValue(selectedCase.taradiNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {selectedCase.caseType === "عمالي" && (
                          <div className="text-right">
                            <Label className="text-muted-foreground block text-right">رقم الطلب في ناجز / معين</Label>
                            <div className="flex items-center gap-2 mt-1 justify-end">
                              {inlineEditField === `najiz-${selectedCase.id}` ? (
                                <>
                                  <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-najiz-number"
                                    onKeyDown={async e => {
                                      if (e.key === "Enter") { await updateCase(selectedCase.id, { najizNumber: inlineEditValue }); setInlineEditField(null); }
                                      else if (e.key === "Escape") setInlineEditField(null);
                                    }} />
                                  <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { najizNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                                </>
                              ) : (
                                <>
                                  <p className="font-medium">{selectedCase.najizNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                  <Button variant="ghost" size="sm" data-testid="button-edit-najiz-number" onClick={() => { setInlineEditField(`najiz-${selectedCase.id}`); setInlineEditValue(selectedCase.najizNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                                </>
                              )}
                            </div>
                            {selectedCase.mohrStatus === "انتهت_التسوية" && (
                              <p className="text-xs text-amber-600 mt-1">انتهت مرحلة التسوية الودية - القضية جاهزة للرفع في المحكمة</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.IN_COURT && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 flex-row-reverse">
                        <span className="w-2 h-2 rounded-full bg-violet-500 inline-block"></span>
                        بيانات ما بعد التقييد
                      </h4>
                      <div className="grid grid-cols-2 gap-4" dir="rtl">
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">رقم القضية</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `court-${selectedCase.id}` ? (
                              <>
                                <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-court-case-number"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { courtCaseNumber: inlineEditValue }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { courtCaseNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.courtCaseNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-court-case-number" onClick={() => { setInlineEditField(`court-${selectedCase.id}`); setInlineEditValue(selectedCase.courtCaseNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                        {/* رقم طلب التنفيذ — captured (mandatory) when the EXECUTION
                            post-judgment task is completed, and correctable here
                            afterwards. Mirrors the courtCaseNumber field above
                            field-for-field: same inline-edit idiom, same
                            updateCase path, so the same PATCH /api/cases/:id
                            permission (canModifyCase) gates it. */}
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">رقم طلب التنفيذ</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `execution-${selectedCase.id}` ? (
                              <>
                                <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-execution-request-number"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { executionRequestNumber: inlineEditValue }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { executionRequestNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.executionRequestNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-execution-request-number" onClick={() => { setInlineEditField(`execution-${selectedCase.id}`); setInlineEditValue(selectedCase.executionRequestNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">موعد الجلسة القادمة</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `hearing-${selectedCase.id}` ? (
                              <>
                                <Input type="date" value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-36" autoFocus data-testid="input-next-hearing-date"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { nextHearingDate: inlineEditValue || null }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { nextHearingDate: inlineEditValue || null }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.nextHearingDate ? <DualDateDisplay date={selectedCase.nextHearingDate} compact /> : <span className="text-muted-foreground text-sm italic">غير محدد</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-next-hearing-date" onClick={() => { setInlineEditField(`hearing-${selectedCase.id}`); setInlineEditValue(selectedCase.nextHearingDate || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>تاريخ الإنشاء: <DualDateDisplay date={selectedCase.createdAt} compact /></span>
                      <span>آخر تحديث: <DualDateDisplay date={selectedCase.updatedAt} compact /></span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="hearings" className="mt-4">
                  {(() => {
                    const caseHearings = getHearingsByCase(selectedCase.id);
                    // Add-hearing is restricted to branch_manager and
                    // admin_support only — dept_heads do not get this
                    // button per product feedback (they coordinate
                    // hearings through the global Hearings page).
                    const canAddHearing =
                      !!user && (user.role === "branch_manager" || user.role === "admin_support");
                    return (
                      <div className="space-y-3">
                        {canAddHearing && (
                          <div className="flex justify-start">
                            <Button
                              size="sm"
                              data-testid="button-add-hearing-from-case"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  action: "create",
                                  caseId: selectedCase.id,
                                });
                                setLocation(`/hearings?${params.toString()}`);
                              }}
                            >
                              <Plus className="w-4 h-4 ml-1" />
                              إضافة جلسة
                            </Button>
                          </div>
                        )}
                        {caseHearings.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">لا توجد جلسات مسجلة لهذه القضية</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-right">التاريخ</TableHead>
                                <TableHead className="text-right">الوقت</TableHead>
                                <TableHead className="text-right">المحكمة</TableHead>
                                <TableHead className="text-right">الحالة</TableHead>
                                {/* LAST in DOM = far LEFT, matching the app-wide
                                    convention for the actions column (cases,
                                    contracts, memos, consultations and the hearings
                                    page all place it last, labelled "الإجراءات").
                                    ⚠ This only became TRUE ON SCREEN once the Tabs
                                    root was given dir="rtl" — see the note there.
                                    Before that the whole panel rendered LTR and this
                                    column painted at the far RIGHT, which is what the
                                    owner reported. The DOM order was always right;
                                    the direction was not. */}
                                {/* 60px → 96px: the cell now holds TWO 32px icon
                                    buttons (view + ضبط) and would have squeezed or
                                    wrapped at the old width. Still the narrowest
                                    column, so the four data columns keep their space. */}
                                <TableHead className="text-center w-[96px]">الإجراءات</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {caseHearings.map((hearing) => (
                                <TableRow
                                  key={hearing.id}
                                  // The targeted row (مهامي's ضبط task names ONE
                                  // hearing). Ring + tint rather than a timed flash:
                                  // the user arrives to attach a file, which takes
                                  // longer than any fade, and a marker that vanishes
                                  // mid-task is worse than none. It clears when the
                                  // dialog closes, because the prop goes with it.
                                  ref={hearing.id === highlightHearingId ? highlightRowRef : undefined}
                                  className={hearing.id === highlightHearingId
                                    ? "ring-2 ring-primary ring-inset bg-primary/5"
                                    : undefined}
                                  data-testid={hearing.id === highlightHearingId
                                    ? `hearing-row-highlighted-${hearing.id}`
                                    : undefined}
                                >
                                  <TableCell><DualDateDisplay date={hearing.hearingDate} compact /></TableCell>
                                  <TableCell><LtrInline>{formatTimeAmPm(hearing.hearingTime)}</LtrInline></TableCell>
                                  <TableCell>{hearing.courtName}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{hearing.status}</Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-0.5">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        title="عرض تفاصيل الجلسة"
                                        data-testid={`button-view-hearing-${hearing.id}`}
                                        // Opens the hearing IN PLACE, over this dialog.
                                        // Was setLocation("/hearings?openHearing=…"),
                                        // a wouter route push that navigated the whole
                                        // app away from the case being read.
                                        onClick={() => setHearingDetailId(hearing.id)}
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                      {/* ضبط الجلسة, without leaving the case.
                                          FITTING IT IN A NARROW ROW: the control is
                                          a bordered panel (file name, size, preview,
                                          download, replace, delete) and would wreck
                                          a table row, so it lives inside a POPOVER
                                          behind ONE icon button — the row gains a
                                          single 32px trigger beside the existing eye,
                                          following the same icon-button-with-title
                                          idiom already used here and in the hearings
                                          page's actions cell.

                                          🔴 HIDDEN ENTIRELY for جلسات الصلح والتسوية
                                          via hearingProducesNoMinutes — the SEVENTH
                                          consumer of that shared predicate, not a new
                                          implementation. Those hearings issue no ضبط,
                                          so offering an attach control would be
                                          offering something that can never apply.

                                          🔴 THE GATE IS NOW SPLIT, because the server's
                                          is. READ (preview/download) went wide — the
                                          minutes GET + download routes now resolve the
                                          PARENT CASE and use canModifyCase, matching
                                          the صك. WRITE (attach/replace/delete) is
                                          UNCHANGED at canActOnHearing.
                                          So the trigger renders for a writer ALWAYS,
                                          and for a view-only user ONLY when a file
                                          actually exists (hearingHasMinutes, off the
                                          list's derived flag) — a viewer with no ضبط
                                          on file sees nothing at all rather than an
                                          empty upload box or a dead button. canEdit
                                          then hides upload/replace/delete inside. */}
                                      {!hearingProducesNoMinutes(hearing)
                                        && (isHearingActor(actingIdentities, hearing, selectedCase)
                                            || (canViewHearingMinutes(user) && hearingHasMinutes(hearing))) && (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              title="ضبط الجلسة"
                                              data-testid={`button-hearing-minutes-${hearing.id}`}
                                            >
                                              <Paperclip className="w-4 h-4" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-80 p-2" align="center" dir="rtl">
                                            {/* THE SAME COMPONENT the hearing
                                                workflow step renders — same endpoint,
                                                same upload path, same permission prop.
                                                No second upload implementation. */}
                                            <SingleAttachmentControl
                                              endpoint={`/api/hearings/${hearing.id}/minutes-attachment`}
                                              label="ملف ضبط الجلسة"
                                              emptyHint="لم يُرفق الضبط بعد"
                                              canEdit={isHearingActor(actingIdentities, hearing, selectedCase)}
                                              // THE SYNC GUARANTEE. Byte-identical to
                                              // the hearing dialog's own onChanged
                                              // (the ffadb50 fix): uploadAttachmentRaw
                                              // is a raw fetch that touches no cache,
                                              // so without this the badges would stay
                                              // lit. Invalidating ["/api/hearings"]
                                              // refetches the ONE app-wide list that
                                              // feeds the cases-page badge, the
                                              // hearings-page badge and row, and the
                                              // filter — and the my-tasks feed polls
                                              // itself every 30s. Attaching here is
                                              // therefore indistinguishable from
                                              // attaching in the hearing dialog.
                                              onChanged={() => { queryClient.invalidateQueries({ queryKey: ["/api/hearings"] }); }}
                                            />
                                          </PopoverContent>
                                        </Popover>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* ==================== سجل الأحكام ====================
                    ITS OWN TAB, like الجلسات (owner ruling). Batch 5 folded this
                    panel into سجل المراحل specifically to avoid editing the
                    hard-coded TabsList column count; the owner has since ruled the
                    ruling chain is a first-class record, not a preamble to the
                    stage list, so the count was edited instead — see the note on
                    the TabsList above, which now says the coupling out loud.
                    سجل المراحل is back to stage history alone, exactly as it was
                    before batch 5.

                    Unlike the folded version, this one DOES render an empty state:
                    a tab the user chose must answer, and a blank pane is
                    indistinguishable from a failed load. The folded version could
                    render nothing because the stage list was there to fill it. */}
                <TabsContent value="judgments" className="mt-4">
                  {judgments.length > 0 ? (
                    <div className="space-y-3">
                      {judgments.map((j) => {
                        // The three deed states, the SAME partition
                        // lib/attachment-indicators.ts draws for the badges:
                        //   no receipt date        → بانتظار استلام الصك
                        //   date but no file       → بانتظار إرفاق الصك
                        //   file on record         → الصك مرفق
                        // hasDeed asks judgment_attachments — THIS ruling's own صك.
                        const hasDate = !!String(j.deedReceivedDate || "").trim();
                        const deed = !hasDate
                          ? { text: "بانتظار استلام الصك", tone: "text-amber-700 dark:text-amber-400" }
                          : !j.hasDeed
                          ? { text: "بانتظار إرفاق الصك", tone: "text-amber-700 dark:text-amber-400" }
                          : { text: "الصك مرفق", tone: "text-green-700 dark:text-green-400" };
                        const outcomeTone = j.outcome === "لصالحنا"
                          ? "text-green-700 dark:text-green-400"
                          : j.outcome === "ضدنا"
                          ? "text-red-700 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400";
                        return (
                          <div
                            key={j.id}
                            className={`flex items-start gap-4 p-3 border rounded-lg ${j.supersededAt ? "opacity-70 border-dashed" : ""}`}
                            data-testid={`judgment-row-${j.sequence}`}
                          >
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                              {j.sequence}
                            </div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">حكم {j.degree}</span>
                                {j.outcome
                                  ? <span className={`text-sm font-medium ${outcomeTone}`}>{j.outcome}</span>
                                  : <span className="text-sm text-muted-foreground">دون تحديد جهة</span>}
                                {j.isFinal && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">نهائي</span>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                                <span>{getJudgmentActorName(j.recordedBy)}</span>
                                <span>•</span>
                                <DualDateDisplay date={j.createdAt} showTime compact />
                              </div>
                              <div className="text-sm flex items-center gap-2 flex-wrap">
                                <span className={deed.tone}>{deed.text}</span>
                                {hasDate && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-muted-foreground">
                                      تاريخ الاستلام: <DualDateDisplay date={j.deedReceivedDate} compact />
                                    </span>
                                  </>
                                )}
                              </div>
                              {/* THE FILE ITSELF, per ruling. Until now this row
                                  said "الصك مرفق" and stopped there — there was
                                  no endpoint that could serve ONE ruling's deed,
                                  so a superseded ruling's صك was unreachable.

                                  SingleAttachmentControl with canEdit={false} is
                                  the SAME control the case-level صك uses in the
                                  المعلومات tab and the ضبط uses on a hearing —
                                  reused, not re-implemented, so preview, download,
                                  the missing-file warning and the transport all
                                  behave identically here. canEdit={false} renders
                                  preview + download whenever a file exists and
                                  hides upload/replace/delete, which is exactly the
                                  read-only split this surface needs: writing the
                                  deed still happens ONLY through the existing
                                  "تسجيل استلام الصك" / late-attach dialogs, whose
                                  POST owns the dual-write and the reference-counted
                                  blob delete. No second write path.

                                  RENDERED ONLY WHEN hasDeed. A ruling with no file
                                  keeps exactly the line it has today — the control's
                                  own empty state would otherwise repeat, in a box,
                                  what the amber "بانتظار إرفاق الصك" text above
                                  already says. */}
                              {j.hasDeed && (
                                <div className="pt-1">
                                  <SingleAttachmentControl
                                    endpoint={`/api/judgments/${j.id}/deed-attachment`}
                                    label="ملف صك الحكم"
                                    canEdit={false}
                                  />
                                </div>
                              )}
                              {/* 🔴 THE DEADLINE IS SHOWN ONLY WHEN THE RULING
                                  ACTUALLY OPENED A WINDOW. objection_deadline is
                                  populated by the shared receipt writer whenever a
                                  date is supplied — including for an appeal ruling,
                                  which opens no window by owner decision — so the
                                  column alone is not evidence a deadline exists.
                                  opens_window is the STORED INTENT, decided once
                                  when the ruling was recorded, and it is the only
                                  honest term here. Printing the bare column would
                                  put a deadline on screen that nobody is owed. */}
                              {j.opensWindow && !!String(j.objectionDeadline || "").trim() && (
                                <div className="text-sm text-muted-foreground">
                                  {/* NO `compact` — same rule as مهلة الرد above: a
                                      deadline shows both calendars. j.supersededAt
                                      below stays compact; it is a timestamp. */}
                                  مهلة الاعتراض حتى <DualDateDisplay date={j.objectionDeadline} />
                                </div>
                              )}
                              {j.supersededAt && (
                                <p className="mt-1 text-sm bg-muted p-2 rounded">
                                  لم يعد هذا الحكم قائماً — أُعيدت الدعوى للدرجة الأولى بموجب حكم لاحق
                                  <span className="mx-1">•</span>
                                  <DualDateDisplay date={j.supersededAt} showTime compact />
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">لا توجد أحكام مسجَّلة على هذه القضية</p>
                  )}
                </TabsContent>

                {/* سجل المراحل — stage history ONLY, exactly as it was before
                    batch 5 folded the ruling chain in above it. */}
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
                              <DualDateDisplay date={transition.timestamp} showTime compact />
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

                <TabsContent value="activity" className="mt-4">
                  <CaseActivityTab caseId={selectedCase?.id || ""} />
                </TabsContent>

                <TabsContent value="notes" className="mt-4 space-y-4">
                  {selectedCase?.platformReviewNotes &&
                    String(selectedCase.platformReviewNotes).trim() && (
                      <div
                        className="border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-4"
                        dir="rtl"
                        data-testid="notes-tab-platform-review"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-indigo-700 dark:text-indigo-300 shrink-0" />
                          <h4 className="font-bold text-indigo-900 dark:text-indigo-200">ملاحظات المنصة</h4>
                        </div>
                        <p className="text-sm text-indigo-900 dark:text-indigo-200 whitespace-pre-wrap">
                          {selectedCase.platformReviewNotes}
                        </p>
                      </div>
                    )}
                  {selectedCase?.reviewNotes && selectedCase.reviewNotes.trim() && (() => {
                    const isCommittee = selectedCase.currentStage === "الأخذ_بالملاحظات";
                    const title = isCommittee ? "ملاحظات لجنة المراجعة" : "ملاحظات المراجعة الداخلية";
                    const history = selectedCase.stageHistory || [];
                    let reviewerName: string | undefined;
                    let timestamp: string | undefined;
                    if (isCommittee) {
                      const entry = [...history].reverse().find((h: any) => h.stage === "الأخذ_بالملاحظات");
                      reviewerName = entry?.userName;
                      timestamp = entry?.timestamp;
                    } else {
                      if (selectedCase.internalReviewerId) {
                        reviewerName = users.find(u => u.id === selectedCase.internalReviewerId)?.name;
                      }
                      const entry = [...history].reverse().find((h: any) => h.stage === "تحرير_صحيفة_الدعوى" || h.stage === "تحرير_صيغة_التظلم");
                      timestamp = entry?.timestamp;
                    }
                    return (
                      <div
                        className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4"
                        dir="rtl"
                        data-testid="notes-tab-review"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                          <h4 className="font-bold text-amber-900 dark:text-amber-200">{title}</h4>
                        </div>
                        {(reviewerName || timestamp) && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                            {reviewerName ? `المراجع: ${reviewerName}` : ""}
                            {timestamp ? ` — ${new Date(timestamp).toLocaleString("ar")}` : ""}
                          </p>
                        )}
                        <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{selectedCase.reviewNotes}</p>
                      </div>
                    );
                  })()}
                  <CaseNotesTab caseId={selectedCase?.id || ""} />
                </TabsContent>

                <TabsContent value="deadlines" className="mt-4">
                  <CaseDeadlinesTab
                    caseId={selectedCase?.id || ""}
                    hearings={selectedCase ? getHearingsByCase(selectedCase.id) : []}
                    memos={selectedCase ? getMemosByCase(selectedCase.id) : []}
                    responseDeadline={selectedCase?.responseDeadline ?? null}
                  />
                </TabsContent>

                <TabsContent value="actions" className="mt-4">
                  <div className="space-y-3">
                    {(() => {
                      const history = [...(selectedCase.stageHistory || [])].reverse();
                      // "إرجاع من المراجعة الداخلية" must only show when the case
                      // ACTUALLY went through internal review and came back. A
                      // drafting-stage history entry with notes alone is NOT
                      // sufficient — data migration writes an initial drafting
                      // entry (userName "النظام", notes "تهجير البيانات") that
                      // was being mislabeled as a return-from-review on cases
                      // that never entered review. Require a real internal-review
                      // stage (REVIEW_LOOP_STAGES) somewhere in the history.
                      const wentToInternalReview = (selectedCase.stageHistory || []).some(
                        (h: any) => REVIEW_LOOP_STAGES.has(h?.stage)
                      );
                      const internalEntry = wentToInternalReview
                        ? history.find((h: any) =>
                            (h.stage === "تحرير_صحيفة_الدعوى" || h.stage === "تحرير_صيغة_التظلم") &&
                            h.notes && String(h.notes).trim()
                          )
                        : null;
                      const committeeEntry = history.find((h: any) =>
                        h.stage === "الأخذ_بالملاحظات" && h.notes && String(h.notes).trim()
                      ) || (selectedCase.currentStage === "الأخذ_بالملاحظات" && selectedCase.reviewNotes
                        ? history.find((h: any) => h.stage === "الأخذ_بالملاحظات")
                        : null);
                      const blocks: Array<{ key: string; title: string; name: string; ts?: string; notes: string }> = [];
                      if (committeeEntry) {
                        blocks.push({
                          key: "committee",
                          title: "إرجاع من لجنة المراجعة",
                          name: committeeEntry.userName || "لجنة المراجعة",
                          ts: committeeEntry.timestamp,
                          notes: committeeEntry.notes || selectedCase.reviewNotes || "",
                        });
                      }
                      if (internalEntry) {
                        blocks.push({
                          key: "internal",
                          title: "إرجاع من المراجعة الداخلية",
                          name: internalEntry.userName || "المراجع الداخلي",
                          ts: internalEntry.timestamp,
                          notes: internalEntry.notes,
                        });
                      }
                      if (blocks.length === 0) return null;
                      return blocks.map((b) => (
                        <div
                          key={b.key}
                          className="border-r-4 border-amber-500 bg-amber-50 rounded-lg p-4"
                          dir="rtl"
                          data-testid={`actions-tab-${b.key}-review-timeline`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                            <span className="font-semibold text-amber-900 text-sm">{b.title}</span>
                          </div>
                          <p className="text-xs text-amber-700 mb-2">
                            {b.name}
                            {b.ts ? ` — ${new Date(b.ts).toLocaleString("ar")}` : ""}
                          </p>
                          <p className="text-sm text-amber-900 whitespace-pre-wrap">{b.notes}</p>
                        </div>
                      ));
                    })()}
                    {/* Delegation-aware: these buttons call moveToNextStage →
                        PATCH /api/cases/:id, whose validateStageTransition
                        expands req.actingContext. The role set and the two
                        lawyer fields are unchanged; only the identity they are
                        evaluated against is now the acting set. */}
                    {selectedCase.currentStage === "مداولة_الصلح" &&
                      user &&
                      (hasEffectiveRole(actingIdentities, "admin_support", "department_head", "branch_manager") ||
                        anyIdentity(actingIdentities, (_r, id) =>
                          selectedCase.primaryLawyerId === id ||
                          selectedCase.responsibleLawyerId === id)) && (
                        <div className="p-3 rounded-lg border bg-card space-y-3">
                          <div>
                            <p className="font-medium text-sm">نتيجة مداولة الصلح</p>
                            <p className="text-xs text-muted-foreground">
                              حدد نتيجة الصلح — "تم الصلح" ينقل القضية إلى التحصيل
                              وينشئ مهمة تلقائية للدعم الإداري، و"لم يتم الصلح" يعيدها
                              إلى مسار المحكمة.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              disabled={stageTransitioning}
                              data-testid={`button-settlement-reached-actions-${selectedCase.id}`}
                              onClick={async () => {
                                if (!user) return;
                                setStageTransitioning(true);
                                try {
                                  const success = await moveToNextStage(
                                    selectedCase.id,
                                    user.id,
                                    user.name,
                                    "تم الصلح في مداولة الصلح",
                                    user.role,
                                    undefined,
                                    undefined,
                                    undefined,
                                    "تحصيل",
                                  );
                                  if (success) {
                                    toast({ title: "تم نقل القضية إلى مرحلة التحصيل" });
                                  }
                                } finally {
                                  setStageTransitioning(false);
                                }
                              }}
                            >
                              <CheckCircle className="w-4 h-4 ml-1" />
                              تم الصلح — تحصيل
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                                  disabled={stageTransitioning}
                                  data-testid={`button-settlement-failed-actions-${selectedCase.id}`}
                                >
                                  <AlertTriangle className="w-4 h-4 ml-1" />
                                  لم يتم الصلح — إغلاق طلب الصلح
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                {/* DEFENDANT — no choice; mirrors the same branch in
                                    case-progress-bar.tsx. The opponent files in court,
                                    so the case closes and waits. closureReason is
                                    MANDATORY (early-close 400) and is PART B's key. */}
                                {selectedCase.isSettlementCase && selectedCase.clientRole === "مدعى_عليه" ? (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>لم يتم الصلح — قضية مدعى عليه</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        نحن مدعى عليهم: الخصم هو من يرفع الدعوى في المحكمة. ستُغلق القضية
                                        مع الاحتفاظ برقم التسوية وسجل المراحل، ويمكن إعادة فتحها لاحقاً
                                        عند رفع الخصم للدعوى بإدخال رقم الدعوى.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="gap-2">
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction
                                        data-testid={`button-settlement-failed-defendant-close-${selectedCase.id}`}
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح — إغلاق (مدعى عليه) بانتظار رفع الخصم للدعوى",
                                              user.role,
                                              undefined,
                                              undefined,
                                              { closureReason: "لم_يتم_الصلح" },
                                              "مقفلة",
                                            );
                                            if (success) {
                                              toast({ title: "تم إغلاق القضية بانتظار رفع الخصم للدعوى" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        تأكيد الإغلاق
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </>
                                ) : selectedCase.isSettlementCase ? (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>لم يتم الصلح — اختر الإجراء</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        هذه القضية بدأت من مرحلة مداولة الصلح. اختر:
                                        <br />
                                        <strong>إغلاق القضية نهائياً</strong> — تُغلق القضية ولا تستكمل في المحكمة.
                                        <br />
                                        <strong>استكمال إجراءاتها</strong> — تُحوَّل إلى مسار التقاضي العادي وتنتقل إلى مرحلة "أغلق طلب الصلح".
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="gap-2 flex-wrap">
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction
                                        data-testid={`button-settlement-failed-continue-${selectedCase.id}`}
                                        className="bg-blue-600 hover:bg-blue-700"
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح — استكمال الإجراءات",
                                              user.role,
                                              undefined,
                                              undefined,
                                              { isSettlementCase: false },
                                              "أغلق_طلب_الصلح",
                                            );
                                            if (success) {
                                              toast({ title: "تم تحويل القضية لمسار التقاضي العادي" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        استكمال إجراءاتها
                                      </AlertDialogAction>
                                      <AlertDialogAction
                                        data-testid={`button-settlement-failed-close-${selectedCase.id}`}
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح — إغلاق نهائي",
                                              user.role,
                                              undefined,
                                              undefined,
                                              undefined,
                                              "مقفلة",
                                            );
                                            if (success) {
                                              toast({ title: "تم إغلاق القضية" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        إغلاق القضية نهائياً
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </>
                                ) : (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>تأكيد: لم يتم الصلح</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        سيتم نقل القضية إلى مرحلة <strong>أغلق طلب الصلح</strong> لاستئناف مسار التقاضي في المحكمة.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="gap-2">
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح",
                                              user.role,
                                              undefined,
                                              undefined,
                                              undefined,
                                              "أغلق_طلب_الصلح",
                                            );
                                            if (success) {
                                              toast({ title: "تم إغلاق طلب الصلح" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        تأكيد
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </>
                                )}
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      )}
                    {actions?.canAssign && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">{selectedCase.primaryLawyerId ? "تعديل الإسناد" : "إسناد القضية"}</p>
                          <p className="text-xs text-muted-foreground">تحديد المحامي المسؤول عن القضية</p>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`button-assign-details-${selectedCase.id}`} onClick={() => { actions.onAssign(); }}>
                          <UserPlus className="w-4 h-4 ml-1" />{selectedCase.primaryLawyerId ? "تعديل الإسناد" : "إسناد"}
                        </Button>
                      </div>
                    )}
                    {actions?.canReview && (
                      <>
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <p className="font-medium text-sm">قائمة المراجعة</p>
                            <p className="text-xs text-muted-foreground">مراجعة بنود القضية قبل البت فيها</p>
                          </div>
                          <Button size="sm" variant="outline" data-testid={`button-review-checklist-details-${selectedCase.id}`} onClick={() => { actions.onReview(); }}>
                            <ClipboardCheck className="w-4 h-4 ml-1" />قائمة المراجعة
                          </Button>
                        </div>
                        <div className="p-3 rounded-lg border bg-card space-y-3">
                          <div>
                            <p className="font-medium text-sm">قرار لجنة المراجعة</p>
                            <p className="text-xs text-muted-foreground">حدد نتيجة مراجعة اللجنة للقضية</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                              data-testid={`button-reject-details-${selectedCase.id}`}
                              onClick={() => { actions.onReject(); }}
                            >
                              <MessageSquare className="w-4 h-4 ml-1" />تم إضافة ملاحظات
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              data-testid={`button-approve-details-${selectedCase.id}`}
                              onClick={() => { actions.onApprove(); }}
                            >
                              <CheckCircle className="w-4 h-4 ml-1" />لا يوجد ملاحظات
                            </Button>
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span className="flex-1 text-center">→ الأخذ بالملاحظات</span>
                            <span className="flex-1 text-center">→ جاهزة للرفع</span>
                          </div>
                        </div>
                      </>
                    )}
                    {actions?.canEarlyClose && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
                        <div>
                          <p className="font-medium text-sm text-red-700 dark:text-red-400">إغلاق مبكر</p>
                          <p className="text-xs text-muted-foreground">إغلاق القضية من أي مرحلة مع تحديد السبب</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-red-500 text-red-600 hover:bg-red-50" data-testid={`button-early-close-${selectedCase.id}`} onClick={() => { actions.onEarlyClose(); }}>
                          <Archive className="w-4 h-4 ml-1" />إغلاق القضية
                        </Button>
                      </div>
                    )}
                    {actions?.canRecordJudgmentDeed && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/20">
                        <div>
                          <p className="font-medium text-sm text-purple-700 dark:text-purple-400">تسجيل استلام الصك</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedCase.judgmentDeedReceivedDate
                              ? `مُسجَّل بتاريخ ${selectedCase.judgmentDeedReceivedDate} — يمكن تعديله وستُحدَّث مهلة الاعتراض`
                              : "تبدأ مهلة الاعتراض من تاريخ استلام الصك"}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-purple-500 text-purple-600 hover:bg-purple-50" data-testid={`button-judgment-deed-${selectedCase.id}`} onClick={() => { actions.onRecordJudgmentDeed(); }}>
                          <FileText className="w-4 h-4 ml-1" />
                          {selectedCase.judgmentDeedReceivedDate ? "تعديل" : "تسجيل"}
                        </Button>
                      </div>
                    )}
                    {actions?.canAttachDeedLate && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                        <div>
                          <p className="font-medium text-sm text-amber-700 dark:text-amber-400">إرفاق صك الحكم</p>
                          <p className="text-xs text-muted-foreground">
                            صدر حكم في القضية ولم تُرفق نسخة الصك — لا يمكن إغلاق القضية قبل إرفاقه
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-amber-500 text-amber-600 hover:bg-amber-50" data-testid={`button-attach-deed-late-${selectedCase.id}`} onClick={() => { actions.onAttachDeedLate(); }}>
                          <FileText className="w-4 h-4 ml-1" />إرفاق
                        </Button>
                      </div>
                    )}
                    {actions?.canRecordOpponentResponse && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                        <div>
                          <p className="font-medium text-sm text-orange-700 dark:text-orange-400">تم استلام رد الخصم</p>
                          <p className="text-xs text-muted-foreground">
                            يزيل مؤشر "مطلوب رد من الخصم" ويسأل إن كنا بحاجة لتحرير مذكرة جوابية
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" data-testid={`button-opponent-response-${selectedCase.id}`} onClick={() => { actions.onOpponentResponseReceived(); }}>
                          <MessageSquare className="w-4 h-4 ml-1" />تسجيل الاستلام
                        </Button>
                      </div>
                    )}
                    {actions?.canRecordAppealOutcome && (() => {
                      // WHO would appeal depends on the judgment direction, read
                      // from the case's own primary-judgment hearing via the SAME
                      // shared helper the server enforces with — so the UI can
                      // never offer a button the endpoint rejects.
                      //   لصالحنا     → the OPPONENT may appeal → both buttons.
                      //   ضدنا/جزئي  → WE are the appellant, and our appeal IS
                      //                filing the لائحة اعتراضية (which moves the
                      //                case by itself) → "الخصم استأنف" is
                      //                nonsense, so only the final-judgment button.
                      //   unknown    → no primary-judgment hearing found; we can't
                      //                prove either wrong, so BOTH are offered and
                      //                the row says the direction is undetermined
                      //                (the server likewise doesn't reject).
                      // Batch 4 — re-keyed to the CURRENT ruling's hearing. The
                      // date scan alone returns the latest non-final حكم hearing,
                      // which after a remand is the QUASHED ruling's session, so
                      // the button set was chosen from a judgment that no longer
                      // stands. Null hearing id → the scan, exactly as before.
                      const direction = judgmentDirectionOf(
                        findPrimaryJudgmentHearing(
                          getHearingsByCase(selectedCase.id),
                          caseCurrentJudgmentHearingId(selectedCase),
                        ),
                      );
                      const weAppeal = weAreTheAppellant(direction);
                      // BUTTON SET PER DIRECTION (2026-07-28):
                      //   ضدنا / جزئي → THREE: تم الاستئناف · الخصم استأنف ·
                      //                 لم نستأنف — الحكم نهائي.
                      //   لصالحنا     → TWO (unchanged): الخصم استأنف · لم يستأنف.
                      //                 We would not appeal a ruling in our own
                      //                 favour, so "تم الاستئناف" is not offered.
                      //   unknown     → all THREE. No primary-judgment hearing is
                      //                 recorded, so nothing can be proven wrong
                      //                 and nothing is hidden — the same stance
                      //                 the row already took for the pair.
                      // "الخصم استأنف" is now offered in EVERY direction: the
                      // aa1e5c3 restriction that hid it for ضدنا/جزئي is removed,
                      // and so is the matching server rejection. The opponent can
                      // appeal a partial win, and the owner confirms it happens
                      // on a straight ضدنا too.
                      const showWeAppealed = weAppeal || direction === null;
                      return (
                        <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                          <div>
                            <p className="font-medium text-sm text-orange-700 dark:text-orange-400">نتيجة مهلة الاعتراض</p>
                            <p className="text-xs text-muted-foreground">
                              {weAppeal
                                ? "الحكم ليس لصالحنا — سجّل ما إذا استأنفنا، أو استأنف الخصم، أو انتهت المهلة دون استئناف."
                                : direction === "لصالحنا"
                                ? "الحكم لصالحنا — سجّل ما إذا كان الخصم قد استأنف أم انتهت المهلة دون استئناف"
                                : "تعذّر تحديد اتجاه الحكم (لا توجد جلسة حكم ابتدائي مسجّلة) — اختر ما ينطبق"}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                            {showWeAppealed && (
                              <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" data-testid={`button-we-appealed-${selectedCase.id}`} onClick={() => { actions.onWeAppealed(); }}>
                                <Gavel className="w-4 h-4 ml-1" />تم الاستئناف
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" data-testid={`button-opponent-appealed-${selectedCase.id}`} onClick={() => { actions.onOpponentAppealed(); }}>
                              <Gavel className="w-4 h-4 ml-1" />الخصم استأنف
                            </Button>
                            <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" data-testid={`button-no-appeal-${selectedCase.id}`} onClick={() => { actions.onNoAppeal(); }}>
                              <CheckCircle className="w-4 h-4 ml-1" />
                              {weAppeal ? "لم نستأنف" : "لم يستأنف"}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                    {actions?.canReopen && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20">
                        <div>
                          <p className="font-medium text-sm text-green-700 dark:text-green-400">إعادة فتح القضية</p>
                          <p className="text-xs text-muted-foreground">إعادة فتح القضية المقفلة عند المرحلة التي تختارها</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" data-testid={`button-reopen-${selectedCase.id}`} onClick={() => { actions.onReopen(); }}>
                          <RotateCcw className="w-4 h-4 ml-1" />إعادة فتح
                        </Button>
                      </div>
                    )}
                    {actions?.canTransfer && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">تحويل لقسم آخر</p>
                          <p className="text-xs text-muted-foreground">تحويل القضية لقسم مختلف — تُعاد للاستلام في القسم الجديد</p>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`button-transfer-details-${selectedCase.id}`} onClick={() => { actions.onTransfer(); }}>
                          <ArrowLeftRight className="w-4 h-4 ml-1" />تحويل
                        </Button>
                      </div>
                    )}
                    {actions?.canRemind && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">إرسال تذكير</p>
                          <p className="text-xs text-muted-foreground">إرسال تذكير للمحامي المسؤول</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-amber-500 text-amber-600" data-testid={`button-reminder-details-${selectedCase.id}`} onClick={() => { actions.onReminder(); }}>
                          <Bell className="w-4 h-4 ml-1" />تذكير
                        </Button>
                      </div>
                    )}
                    {/* Same condition as before, now expressed over the booleans the
                        page passes in: every page-owned action unavailable → the
                        "no actions" note. A host that passes NO actions at all (the
                        مهامي hub) shows it too — nothing in this tab is actionable
                        there beyond the stage/settlement blocks above. */}
                    {!actions?.canAssign && !actions?.canReview && !actions?.canClose
                      && !actions?.canEarlyClose && !actions?.canReopen && !actions?.canRecordJudgmentDeed
                      && !actions?.canRecordAppealOutcome && !actions?.canRecordOpponentResponse
                      && !actions?.canTransfer && !actions?.canRemind && (
                      <div className="text-center text-muted-foreground py-8">
                        <p className="text-sm">لا توجد إجراءات متاحة لهذه القضية حالياً</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hearing details, NESTED over the case dialog. Rendered as a SIBLING of it
          (inside the same fragment) rather than inside its DialogContent, so its own
          overlay stacks cleanly above — the same shape the AlertDialogs in the
          الإجراءات tab already use. Closing it leaves the user exactly where they
          were: still in the case dialog, still on الجلسات. Cleared when the case
          dialog itself closes, so reopening never shows a stale hearing.
          NO `actions` prop — the workflow steps render READ-ONLY here; recording a
          result or writing a report stays on the hearings page, which owns those
          dialogs. */}
      <HearingDetailsDialog
        hearingId={hearingDetailId}
        onOpenChange={(nextOpen) => !nextOpen && setHearingDetailId(null)}
      />
    </>
  );
}
