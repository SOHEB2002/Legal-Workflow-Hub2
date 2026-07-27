import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type CaseStageValue, type CaseClassificationValue, type CaseStageTransition, canMoveToPreviousStage, canReviewCases, type UserRoleType, getStagesForClassification, getStageLabel, TerminalCaseStages, type CaseOutcomeTone } from "@shared/schema";
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
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

// ==================== TERMINAL / OFF-PATH STAGE DISPLAY ====================
// None of the terminal stages belongs to ANY array returned by
// getStagesForClassification (they are reachable from many stages, so they have
// no fixed position in a linear path). indexOf therefore returns -1 for them,
// and the `rawIndex >= 0 ? rawIndex : 0` fallback below used to collapse the bar
// onto index 0 — a CLOSED case rendered with استلام lit up as its current stage.
//
// The set is the shared TerminalCaseStages (schema.ts) plus منظورة_استئناف:
// an appeal-pending case is still LIVE for the cases-table sort (which is why
// schema.ts excludes it) but it is equally off-path, so for DISPLAY it needs the
// same treatment. Keeping the extension here means the cases-table priority sort
// is untouched.
const TERMINAL_BAR_STAGES: ReadonlySet<CaseStageValue> = new Set<CaseStageValue>([
  ...Array.from(TerminalCaseStages),
  "منظورة_استئناف",
]);

type TerminalTone = "success" | "danger" | "warning" | "neutral";

// Badge copy + colour per terminal stage. Labels come from CaseStageLabels via
// getStageLabel — never hard-coded — so a label rename in schema.ts flows here.
// The "القضية …" prefix is used only where it reads naturally in Arabic and
// mirrors the existing wording in case-details-dialog.tsx ("القضية مشطوبة").
const TERMINAL_BADGES: Partial<Record<CaseStageValue, { text: string; tone: TerminalTone }>> = {
  "مقفلة": { text: `القضية ${getStageLabel("مقفلة")}`, tone: "danger" },
  "مشطوبة": { text: `القضية ${getStageLabel("مشطوبة")}`, tone: "danger" },
  "مؤرشفة": { text: `القضية ${getStageLabel("مؤرشفة")}`, tone: "neutral" },
  "محكوم_حكم_ابتدائي": { text: getStageLabel("محكوم_حكم_ابتدائي"), tone: "warning" },
  "محكوم_حكم_نهائي": { text: getStageLabel("محكوم_حكم_نهائي"), tone: "warning" },
  "منظورة_استئناف": { text: getStageLabel("منظورة_استئناف"), tone: "neutral" },
  // تحصيل reached from مداولة_الصلح gets the dedicated "تم الصلح — تحصيل" badge
  // built in the component (see the PRESERVED branch); this entry is the
  // fallback for تحصيل reached WITHOUT a conciliation stage in the path (e.g.
  // after a final judgment in our favour), where "تم الصلح" would be false.
  "تحصيل": { text: getStageLabel("تحصيل"), tone: "success" },
};

const TERMINAL_TONE_CLASSES: Record<TerminalTone, string> = {
  success: "border-green-600 bg-green-500/10 text-green-700 dark:text-green-300",
  danger: "border-red-600 bg-red-500/10 text-red-700 dark:text-red-300",
  warning: "border-amber-600 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  neutral: "border-muted-foreground/40 bg-muted text-muted-foreground",
};

interface CaseProgressBarProps {
  currentStage: CaseStageValue;
  onMoveToNext: (notes: string, internalReviewerId?: string, reviewDecision?: string, extraFields?: Record<string, unknown>, explicitTargetStage?: string) => void;
  onMoveToPrevious: (notes: string, internalReviewerId?: string) => void;
  onSkipDataCompletion?: (notes: string) => void;
  onInternalReviewSendBack?: (notes: string) => void;
  onReturnToCommittee?: (notes: string) => void;
  // Committee-review (إحالة_للجنة_المراجعة) decisions, surfaced here so the
  // reviewer can act from the progress bar instead of only the إجراءات tab.
  // Mirror of the inside-detail canReview logic: approve → جاهزة للرفع,
  // add-notes → الأخذ بالملاحظات. Gated by canReviewCases(userRole) below.
  onReviewCommitteeApprove?: () => void;
  onReviewCommitteeAddNotes?: (notes: string) => void;
  // Reasoned override — "تجاوز لجنة المراجعة" (skip the committee, straight to
  // جاهزة_للرفع, with a MANDATORY reason). Supplied by the parent ONLY when the
  // current user is authorized by the SAME rule the server enforces
  // (branch_manager | department_head of the case's dept | assigned lawyer), so
  // the button's visibility EQUALS the server's authorization — no button that
  // 403s. Its actor set is deliberately different from the committee-decision
  // one above, so this action is gated on the callback's presence, NOT on
  // canReviewCases.
  onSkipCommittee?: (reason: string) => void;
  onPlatformReviewAddNotes?: (notes: string) => void;
  onPlatformReviewResubmit?: () => void;
  hasPlatformNotes?: boolean;
  userRole: UserRoleType;
  disabled?: boolean;
  caseClassification?: CaseClassificationValue;
  // Resolved canonical department name ("عام" / "تجاري" / "عمالي" / "إداري")
  // used to pick the UnderStudy stage path. Callers should resolve this from
  // the case's departmentId via useDepartments().getDepartmentName — DO NOT
  // pass the case's caseType field, which is free-text user input.
  departmentName?: string;
  clientRole?: string;
  memoRequired?: boolean;
  isSettlementCase?: boolean;
  // The case's stage history, used ONLY to locate how far along the rendered
  // path a TERMINAL case actually got (a closed case can be closed from any
  // stage, so the bar can't infer it from currentStage). Optional: with no
  // history the terminal renderer falls back to marking the whole path done.
  stageHistory?: CaseStageTransition[];
  // The outcome of the ruling the case is sitting on (لصالحنا | ضدنا | جزئي), for
  // the judgment terminal badges — "محكوم حكم ابتدائي" alone never said WHICH WAY
  // it went. Resolved by the caller from the case's judgment hearing via the
  // shared findLatestJudgmentHearing + judgmentDirectionOf; null when no judgment
  // hearing exists (the badge then falls back to the plain stage label).
  judgmentDirection?: string | null;
  // The composed مقفلة badge suffix — what the case ENDED IN, or the closure
  // reason when there is no substantive outcome. Resolved by CaseStagePanel via
  // caseClosureBadgeSuffix (it needs the case row AND the hearings); the bar takes
  // no contexts and just renders what it is handed. null → plain "القضية مقفلة".
  closureBadge?: { text: string; tone: CaseOutcomeTone } | null;
  reviewNotes?: string;
  reviewDecision?: string;
  eligibleInternalReviewers?: Array<{ id: string; name: string }>;
  caseInternalReviewerId?: string | null;
  currentUserId?: string;
  isAssignedLawyer?: boolean;
  // True when the current user is an assignee of THIS case by the same rule
  // the server uses (primaryLawyerId | responsibleLawyerId | assignedLawyers).
  // Broader than isAssignedLawyer (which omits responsibleLawyerId) — used
  // only to decide whether the generic "next stage" button is enabled.
  isCaseAssignee?: boolean;
  // True when the case is on a drafting stage AND has bounced through
  // internal review at least once (derived in the parent from
  // stageHistory). Drives a "تعديلات بعد المراجعة" hint under the
  // current stage label so the lawyer reads "revisions" not "fresh draft".
  hasReturnedFromReview?: boolean;
}

export function CaseProgressBar({
  currentStage,
  onMoveToNext,
  onMoveToPrevious,
  onSkipDataCompletion,
  onInternalReviewSendBack,
  onReturnToCommittee,
  onReviewCommitteeApprove,
  onReviewCommitteeAddNotes,
  onSkipCommittee,
  onPlatformReviewAddNotes,
  onPlatformReviewResubmit,
  hasPlatformNotes = false,
  userRole: userRoleRaw,
  disabled = false,
  caseClassification,
  departmentName,
  clientRole,
  memoRequired,
  isSettlementCase,
  stageHistory,
  judgmentDirection,
  closureBadge,
  reviewNotes,
  reviewDecision,
  eligibleInternalReviewers = [],
  caseInternalReviewerId,
  currentUserId,
  isAssignedLawyer = false,
  isCaseAssignee = false,
  hasReturnedFromReview = false,
}: CaseProgressBarProps) {
  // Normalize the role ONCE at the source so EVERY permission gate below
  // (canActOnInternalReview, canReviewCases for committee review, the
  // next-stage enable check, platform/settlement, rollback) sees a clean
  // value. Defends against any stray whitespace/CRLF on the role string so a
  // global role like branch_manager can never fall through a `===`/`includes`
  // check and get wrongly dimmed. Server role is the authority and is clean;
  // this is belt-and-braces applied in one place rather than per call site.
  const userRole = (typeof userRoleRaw === "string" ? userRoleRaw.trim() : userRoleRaw) as UserRoleType;
  const [notes, setNotes] = useState("");
  const [skipNotes, setSkipNotes] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [sendBackNotes, setSendBackNotes] = useState("");
  const [platformNumber, setPlatformNumber] = useState("");
  // Holds the number captured on a platform-review ACCEPT — a court case number
  // when entering court (منظورة), or a settlement (تراضي) number when General
  // enters the settlement stage (najiz → مداولة_الصلح).
  const [platformAcceptNumber, setPlatformAcceptNumber] = useState("");
  const [platformNotes, setPlatformNotes] = useState("");
  const [returnToCommitteeNotes, setReturnToCommitteeNotes] = useState("");
  const [committeeReviewNotes, setCommitteeReviewNotes] = useState("");
  const [skipCommitteeReason, setSkipCommitteeReason] = useState("");
  const normalizedStage = currentStage;
  const effectiveClassification = caseClassification || "قيد_الدراسة";
  let stagesOrder = getStagesForClassification(
    effectiveClassification as CaseClassificationValue,
    departmentName,
    clientRole,
    memoRequired,
    isSettlementCase,
  );
  // Defensive safety net for cases where departmentName is missing or
  // doesn't match one of the four canonical labels (legacy rows with no
  // departmentId, the special "أخرى" department, or transient mismatches
  // while the departments list is still loading from the server). After
  // the schema switched to departmentName-driven routing this rarely
  // triggers — but when it does, scan every variant for the classification
  // and pick the first one that contains the case's current stage rather
  // than collapsing the bar onto the wrong path with currentIndex=0.
  if (stagesOrder.indexOf(normalizedStage) < 0) {
    if (effectiveClassification === "قيد_الدراسة") {
      const names: string[] = ["تجاري", "عمالي", "إداري", "عام"];
      for (const n of names) {
        const v = getStagesForClassification(effectiveClassification, n);
        if (v.indexOf(normalizedStage) >= 0) {
          stagesOrder = v;
          break;
        }
      }
    } else if (effectiveClassification === "منظورة_بالمحكمة") {
      const variants = [
        getStagesForClassification(effectiveClassification, undefined, undefined, false, true),
        getStagesForClassification(effectiveClassification, undefined, "مدعى_عليه", true),
        getStagesForClassification(effectiveClassification, undefined, "مدعي", true),
        getStagesForClassification(effectiveClassification, undefined, undefined, false),
      ];
      for (const v of variants) {
        if (v.indexOf(normalizedStage) >= 0) {
          stagesOrder = v;
          break;
        }
      }
    }
  }
  // Dynamic bridge for IN_COURT cases: if a memo was added after the case
  // already reached دراسة on the no-memo path, the memo variant returned
  // above doesn't include دراسة. Splice دراسة in just before the drafting
  // stage so the progress bar shows a coherent path and the next-stage
  // button points at drafting (not back at استلام).
  if (
    effectiveClassification === "منظورة_بالمحكمة" &&
    normalizedStage === "دراسة" &&
    stagesOrder.indexOf("دراسة") < 0
  ) {
    const memoDraftIdx = stagesOrder.indexOf("تحرير_مذكرة_جوابية");
    const pleadingDraftIdx = stagesOrder.indexOf("تحرير_صحيفة_الدعوى");
    const draftingIdx = memoDraftIdx >= 0 ? memoDraftIdx : pleadingDraftIdx;
    if (draftingIdx > 0) {
      stagesOrder = [
        ...stagesOrder.slice(0, draftingIdx),
        "دراسة" as CaseStageValue,
        ...stagesOrder.slice(draftingIdx),
      ];
    }
  }
  const rawIndex = stagesOrder.indexOf(normalizedStage);
  const currentIndex = rawIndex >= 0 ? rawIndex : 0;

  // TERMINAL / OFF-PATH stages (مقفلة، مشطوبة، مؤرشفة، محكوم_*، منظورة_استئناف and
  // تحصيل — see TERMINAL_BAR_STAGES above). rawIndex is -1 for all of them, and
  // the `: 0` fallback above would light up استلام as the "current" stage on a
  // closed case. Instead render the path with everything the case actually
  // reached as completed, NOTHING current, and let a badge carry the outcome.
  //
  // Gated on rawIndex < 0 so a stage that IS in the resolved path keeps its
  // normal rendering — notably تحصيل on InCourtSettlementStages, where تحصيل is
  // a real member (index 2) and must stay a plain "current" stage as today.
  //
  // reachedIndex = furthest stage of the rendered path found in the case's
  // stageHistory (a case can be closed from anywhere, so the current stage
  // says nothing about how far it got). Falls back to the whole path when no
  // history is available.
  const furthestReachedIndex = Array.isArray(stageHistory)
    ? stageHistory.reduce(
        (furthest, entry) => Math.max(furthest, stagesOrder.indexOf(entry?.stage)),
        -1,
      )
    : -1;

  let terminalState: { reachedIndex: number; text: string; tone: TerminalTone } | null = null;
  if (rawIndex < 0 && TERMINAL_BAR_STAGES.has(normalizedStage)) {
    // PRESERVED VERBATIM — settlement-success terminal. تحصيل is reached from
    // مداولة_الصلح via the "تم الصلح" action; the prep run up to مداولة_الصلح
    // renders done, the litigation stages after it never ran and stay grey, and
    // the green "تم الصلح — تحصيل" badge carries the outcome. Applies to every
    // department since مداولة_الصلح exists in all of their arrays.
    const conciliationIndex =
      normalizedStage === "تحصيل" ? stagesOrder.indexOf("مداولة_الصلح") : -1;
    if (conciliationIndex >= 0) {
      terminalState = { reachedIndex: conciliationIndex, text: "تم الصلح — تحصيل", tone: "success" };
    } else {
      const badge = TERMINAL_BADGES[normalizedStage];
      let text = badge?.text ?? getStageLabel(normalizedStage);
      let tone = badge?.tone ?? "neutral";
      // JUDGMENT OUTCOME. "محكوم حكم ابتدائي" alone never said WHICH WAY the
      // ruling went, which is the first thing a lawyer needs. Append it and tone
      // the badge to the outcome so a loss can't read as a win:
      //   لصالحنا → green · جزئي → amber (a PARTIAL result, not a defeat —
      //   the app's existing اعتماد جزئي / hearings-detail idiom) · ضدنا → red.
      // Falls back to the plain stage label when no judgment hearing is found.
      if (
        (normalizedStage === "محكوم_حكم_ابتدائي" || normalizedStage === "محكوم_حكم_نهائي")
        && judgmentDirection
      ) {
        text = `${text} — ${judgmentDirection}`;
        tone = judgmentDirection === "لصالحنا" ? "success"
          : judgmentDirection === "جزئي" ? "warning"
          : "danger";
      }
      // WHAT THE CASE ENDED IN. "القضية مقفلة" alone never said why — the same gap
      // the judgment block above closes for a ruling, solved the same way. The
      // suffix comes from ONE composer (caseClosureBadgeSuffix): the substantive
      // outcome — حكم لصالحنا / حكم ضدنا / حكم جزئي / صلح / تعذّر الصلح / شطب — or,
      // when there is none, the closure reason. Never both. Never تم_التحصيل:
      // collection is a procedural step, not a result, so a collected win reads
      // "القضية مقفلة — حكم لصالحنا".
      // A closure with nothing recorded keeps the plain badge and its red, with no
      // dash and no "undefined" — the composer returns null.
      if (normalizedStage === "مقفلة" && closureBadge) {
        text = `${text} — ${closureBadge.text}`;
        tone = closureBadge.tone;
      }
      terminalState = {
        reachedIndex: furthestReachedIndex >= 0 ? furthestReachedIndex : stagesOrder.length - 1,
        text,
        tone,
      };
    }
  }

  // A terminal case has no next stage — suppress the generic advance button so
  // it can't render a dead "المرحلة التالية" pointing at stagesOrder[1].
  // canGoPrev needs no equivalent guard: currentIndex is 0 whenever rawIndex < 0,
  // so `currentIndex > 0` already keeps the rollback button hidden.
  const canGoNext = currentIndex < stagesOrder.length - 1 && !disabled && !terminalState;
  // FREE WIN (widened model) — canMoveToPreviousStage is branch_manager-ONLY, so
  // the rollback button was invisible to everyone else even though the SERVER has
  // always allowed an own-dept department_head to return to ANY prior stage and the
  // assigned lawyer to return ONE step (validateStageTransition's rollback block).
  // The button moves exactly one step (prevStage = stagesOrder[currentIndex - 1]),
  // so the assignee is inside their server allowance and this can never 403.
  // department_head is scoped by VISIBILITY rather than re-checked here — the page
  // only surfaces own-department cases to a head (canViewCase) — which is the same
  // convention isHeadOrManagerRole already uses below for committee-notes,
  // platform-review and settlement actions.
  const canRollBackStage =
    canMoveToPreviousStage(userRole)
    || userRole === "department_head"
    || isCaseAssignee;
  const canGoPrev = currentIndex > 0 && canRollBackStage && !disabled;

  const isAtReception = normalizedStage === "استلام";
  const nextStageIsDataCompletion = stagesOrder[currentIndex + 1] === "استكمال_البيانات";
  const canSkip = isAtReception && nextStageIsDataCompletion && !!onSkipDataCompletion && !disabled;

  const getStageStatus = (stageIndex: number) => {
    if (terminalState) {
      // Everything up to and including the last stage the case reached is done;
      // the stages after it never ran, so leave them upcoming/grey and let the
      // terminal badge carry the outcome. Nothing is "current" — the case is
      // no longer moving along this path.
      return stageIndex <= terminalState.reachedIndex ? "completed" : "upcoming";
    }
    if (stageIndex < currentIndex) return "completed";
    if (stageIndex === currentIndex) return "current";
    return "upcoming";
  };

  const nextStage = stagesOrder[currentIndex + 1];
  const nextIsInternalReview = nextStage === "مراجعة_داخلية" || nextStage === "مراجعة_داخلية_للتظلم";
  const prevStage = stagesOrder[currentIndex - 1];
  const prevIsInternalReview = prevStage === "مراجعة_داخلية" || prevStage === "مراجعة_داخلية_للتظلم";

  // Any forward transition INTO a قيد_التدقيق_* stage requires the matching
  // platform number, regardless of which source stage we're moving from
  // (جاهزة_للرفع for the first review, أغلق_طلب_الصلح for the post-settlement
  // najiz/moeen review, etc.).
  const platformFieldInfo: { field: "taradiNumber" | "najizNumber" | "moeenNumber" | "courtCaseNumber" | "mohrNumber"; label: string; placeholder: string } | null =
    nextStage === "قيد_التدقيق_في_تراضي"
      ? { field: "taradiNumber", label: "رقم الطلب في تراضي", placeholder: "أدخل رقم الطلب في منصة تراضي" }
      // LABOR settlement (عمالي): entering مداولة_الصلح requires the amicable-
      // settlement case number, which becomes the case's displayed number while
      // it sits at that stage (deriveCurrentCaseNumber in storage.ts). Mirrors the
      // تراضي capture above exactly — same mechanism, same mandatory gate.
      // Gated on the RESOLVED department name, not the free-text caseType: مداولة_الصلح
      // is shared by labor / commercial / general / in-court settlement, and only
      // labor captures a MOHR number here. Commercial captures taradiNumber on
      // تراضي-entry (above) — deliberately NOT duplicated.
      : departmentName === "عمالي" && nextStage === "مداولة_الصلح"
      ? { field: "mohrNumber", label: "رقم الدعوى في التسوية الودية", placeholder: "أدخل رقم الدعوى في التسوية الودية" }
      : nextStage === "قيد_التدقيق_في_ناجز"
      ? { field: "najizNumber", label: "رقم القيد في ناجز", placeholder: "أدخل رقم القيد في ناجز" }
      : nextStage === "قيد_التدقيق_في_معين"
      ? { field: "moeenNumber", label: "رقم القيد في معين", placeholder: "أدخل رقم القيد في معين" }
      // General-dept audit (2026-06-14) — General reaches court via
      // أغلق_طلب_الصلح → منظورة (no najiz-accept step that would otherwise
      // capture the court number, since General's najiz precedes conciliation).
      // Capture the court case number on this move, mirroring how Commercial
      // captures it on najiz → منظورة. General-only (this from→to pair).
      : normalizedStage === "أغلق_طلب_الصلح" && nextStage === "منظورة"
      ? { field: "courtCaseNumber", label: "رقم الدعوى في المحكمة", placeholder: "أدخل رقم الدعوى الصادر من المحكمة" }
      : null;

  // Reception → data-completion is the one transition where the notes
  // field carries real meaning (the missing docs/data the lawyer is
  // asking the client for), not optional chatter — block the confirm
  // button until something is typed.
  const isReceptionToDataCompletion =
    normalizedStage === "استلام" && nextStage === "استكمال_البيانات";
  const canConfirmNext =
    (!nextIsInternalReview || !!(selectedReviewerId || caseInternalReviewerId)) &&
    (!platformFieldInfo || !!platformNumber.trim()) &&
    (!isReceptionToDataCompletion || !!notes.trim());
  const canConfirmPrev = !prevIsInternalReview || !!(selectedReviewerId || caseInternalReviewerId);

  const isAtInternalReview =
    normalizedStage === "مراجعة_داخلية" || normalizedStage === "مراجعة_داخلية_للتظلم";
  const isAtCommitteeNotes = normalizedStage === "الأخذ_بالملاحظات";
  const isHeadOrManagerRole = userRole === "department_head" || userRole === "branch_manager";
  const canActOnCommitteeNotes = isAtCommitteeNotes && (isAssignedLawyer || isHeadOrManagerRole);

  // Committee-review stage (إحالة_للجنة_المراجعة). Mirror the inside-detail
  // gate EXACTLY: cases.tsx canReview = permissions.canReviewCases &&
  // currentStage === REVIEW_COMMITTEE. canReviewCases(role) is the same
  // shared helper the actions tab resolves through, so the bar shows the
  // decision buttons to exactly the roles the server lets review (and the
  // PATCH it issues is the same one the inside buttons issue).
  const isAtReviewCommittee = normalizedStage === "إحالة_للجنة_المراجعة";
  const showReviewCommitteeActions =
    isAtReviewCommittee && canReviewCases(userRole) && !!onReviewCommitteeApprove &&
    (userRole === "branch_manager" ||
      userRole === (departmentName === "عمالي" ? "labor_review_head" : "cases_review_head"));

  // General-dept audit (2026-06-14) — the accept dialog captures the number for
  // the stage the case is MOVING INTO (array-driven nextStage): a court case
  // number when entering court (منظورة) — Commercial najiz→منظورة / Admin
  // معين→منظورة — and a settlement (تراضي) number when General enters the
  // settlement stage (najiz→مداولة_الصلح, the تراضي platform). Commercial
  // تراضي→مداولة_الصلح captures nothing (its taradi number was already taken on
  // تراضي-entry, so this stays byte-identical).
  const courtCapture = { field: "courtCaseNumber" as const, label: "رقم الدعوى في المحكمة" };
  const platformReviewInfo: {
    kind: "تراضي" | "ناجز" | "معين";
    acceptCapture: { field: "courtCaseNumber" | "taradiNumber"; label: string } | null;
  } | null =
    normalizedStage === "قيد_التدقيق_في_تراضي"
      ? { kind: "تراضي", acceptCapture: nextStage === "منظورة" ? courtCapture : null }
      : normalizedStage === "قيد_التدقيق_في_ناجز"
      ? { kind: "ناجز", acceptCapture:
            nextStage === "منظورة" ? courtCapture
            : nextStage === "مداولة_الصلح" ? { field: "taradiNumber", label: "رقم الصلح في منصة تراضي" }
            : null }
      : normalizedStage === "قيد_التدقيق_في_معين"
      ? { kind: "معين", acceptCapture: nextStage === "منظورة" ? courtCapture : null }
      : null;
  const isAtPlatformReview = !!platformReviewInfo;
  const canActOnPlatformReview =
    isAtPlatformReview && (isAssignedLawyer || isHeadOrManagerRole || userRole === "admin_support");

  const isAtSettlement = normalizedStage === "مداولة_الصلح";
  const canActOnSettlement =
    isAtSettlement && (isAssignedLawyer || isHeadOrManagerRole || userRole === "admin_support");
  const isReviewerActor = !!currentUserId && !!caseInternalReviewerId && currentUserId === caseInternalReviewerId;
  const canActOnInternalReview = isReviewerActor || userRole === "branch_manager";

  // Permission-aware enable state for the generic "المرحلة التالية" button —
  // the one button that previously always rendered and only failed AFTER a
  // click (server 403 → error toast).
  //
  // This is a DENYLIST, not an allowlist: we only disable the roles that can
  // PROVABLY never advance any case, and enable everyone else. The previous
  // allowlist (branch_manager/department_head/admin_support/…) had a real
  // hazard — any management role NOT listed (or a role-string mismatch) would
  // be wrongly DIMMED even though the server allows it. A global role like
  // branch_manager must NEVER see a disabled stage button. So instead we
  // disable only when the user is a read-only / non-actor role AND is not an
  // assignee/designated reviewer of THIS case. On the server's actor model
  // (validateStageTransition) the real roles employee / hr / technical_support
  // / viewer appear in NO forward case-transition rule — they can only act via
  // the assigned_lawyer / internal_reviewer synthetic roles — so disabling
  // them when neither holds is always correct and never blocks a real actor.
  // Every management role (branch_manager, department_head, admin_support,
  // cases_review_head, consultations_review_head) is enabled by construction.
  const isNonActorRole =
    userRole === "employee" ||
    userRole === "hr" ||
    userRole === "technical_support" ||
    userRole === "viewer";
  const nextStageActionAllowed = !isNonActorRole || isCaseAssignee || isReviewerActor;

  const handleMoveNext = () => {
    // For the internal-review transition the dropdown is pre-filled from the
    // intake-set caseInternalReviewerId, so accept that value (or any
    // override the lawyer picked) — block only if neither is present.
    const reviewerForNext = selectedReviewerId || caseInternalReviewerId || "";
    if (nextIsInternalReview && !reviewerForNext) return;
    if (platformFieldInfo && !platformNumber.trim()) return;
    const extraFields = platformFieldInfo
      ? { [platformFieldInfo.field]: platformNumber.trim() }
      : undefined;
    // Always pass nextStage explicitly so the cases-context never has to
    // recompute the path — that resolver was unreliable for some commercial
    // and post-settlement transitions and silently dropped the PATCH.
    onMoveToNext(
      notes,
      nextIsInternalReview ? reviewerForNext : undefined,
      undefined,
      extraFields,
      nextStage,
    );
    setNotes("");
    setSelectedReviewerId("");
    setPlatformNumber("");
  };

  const handleInternalReviewApprove = () => {
    onMoveToNext("", undefined);
  };

  const handleInternalReviewSendBack = () => {
    if (!onInternalReviewSendBack || !sendBackNotes.trim()) return;
    onInternalReviewSendBack(sendBackNotes.trim());
    setSendBackNotes("");
  };

  const handleCommitteeNotesDecision = (decision: string) => {
    onMoveToNext("", undefined, decision);
  };

  const handleReturnToCommittee = () => {
    if (!onReturnToCommittee || !returnToCommitteeNotes.trim()) return;
    onReturnToCommittee(returnToCommitteeNotes.trim());
    setReturnToCommitteeNotes("");
  };

  // The reason is MANDATORY (the server 400s without it), so the confirm button
  // stays disabled until something is typed — the same rule the memo-cancel
  // ("لا يحتاج مذكرة") dialog applies.
  const handleSkipCommittee = () => {
    if (!onSkipCommittee || !skipCommitteeReason.trim()) return;
    onSkipCommittee(skipCommitteeReason.trim());
    setSkipCommitteeReason("");
  };

  const handleReviewCommitteeAddNotes = () => {
    // Mirror inside-detail handleReject: notes are OPTIONAL here (the parent
    // supplies the same "تم إضافة ملاحظات من لجنة المراجعة" default when blank).
    if (!onReviewCommitteeAddNotes) return;
    onReviewCommitteeAddNotes(committeeReviewNotes.trim());
    setCommitteeReviewNotes("");
  };

  const handlePlatformReviewAccept = () => {
    if (!platformReviewInfo) return;
    const cap = platformReviewInfo.acceptCapture;
    if (cap && !platformAcceptNumber.trim()) return;
    const extraFields = cap ? { [cap.field]: platformAcceptNumber.trim() } : undefined;
    // General-dept audit (2026-06-14) — the accept target is the NEXT stage in
    // the resolved dept stages array (nextStage), passed EXPLICITLY so
    // moveToNextStage never re-guesses the path. Correct for every department
    // by construction: General najiz→مداولة_الصلح, Commercial najiz→منظورة /
    // تراضي→مداولة_الصلح, Admin معين→منظورة. (Was hard-coded to Commercial's
    // najiz→منظورة semantics, which wrongly skipped General's conciliation.)
    const target = nextStage;
    onMoveToNext("", undefined, undefined, extraFields, target);
    setPlatformAcceptNumber("");
  };

  const handleSettlementDecision = (
    target: "تحصيل" | "أغلق_طلب_الصلح" | "مقفلة",
    extraFields?: Record<string, unknown>,
  ) => {
    // Pass the target explicitly so the cases-context doesn't have to guess
    // the next stage from a linear stages array — same approach used for
    // the platform-review accept buttons. extraFields lets the caller flip
    // additional columns in the same PATCH (e.g. clearing isSettlementCase
    // when a settlement-only case chooses to continue litigation after a
    // failed conciliation).
    onMoveToNext("", undefined, undefined, extraFields, target);
  };

  const handlePlatformReviewAddNotes = () => {
    if (!onPlatformReviewAddNotes || !platformNotes.trim()) return;
    onPlatformReviewAddNotes(platformNotes.trim());
    setPlatformNotes("");
  };

  const handleMovePrev = () => {
    if (prevIsInternalReview) {
      const reviewerToUse = selectedReviewerId || caseInternalReviewerId || undefined;
      if (!reviewerToUse) return;
      onMoveToPrevious(notes, reviewerToUse);
    } else {
      onMoveToPrevious(notes);
    }
    setNotes("");
    setSelectedReviewerId("");
  };

  const handleSkip = () => {
    onSkipDataCompletion!(skipNotes);
    setSkipNotes("");
  };

  return (
    <div className="w-full min-w-0 space-y-4" dir="rtl">
      {normalizedStage === "الأخذ_بالملاحظات" && reviewNotes && reviewNotes.trim() && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4" dir="rtl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
            <span className="font-bold text-amber-800">تم إرجاع القضية من لجنة المراجعة</span>
            {reviewDecision === "rejected" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">مرفوض</span>
            )}
            {reviewDecision === "partial" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300">اعتماد جزئي</span>
            )}
          </div>
          <p className="text-amber-700 text-sm">{reviewNotes}</p>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 overflow-x-auto min-w-0 pb-2">
        {stagesOrder.map((stage, index) => {
          const status = getStageStatus(index);
          return (
            <div key={stage} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    status === "completed"
                      ? "bg-green-500 text-white"
                      : status === "current"
                      ? "bg-accent text-accent-foreground ring-4 ring-accent/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`stage-indicator-${index}`}
                >
                  {status === "completed" ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-2 text-xs text-center break-words max-w-[72px] leading-tight ${
                    status === "current"
                      ? "font-bold text-accent"
                      : status === "completed"
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {getStageLabel(stage)}
                </span>
                {status === "current" && hasReturnedFromReview && (
                  <span
                    className="mt-1 inline-block rounded-sm border border-amber-500 bg-amber-500/10 px-1 py-px text-[9px] leading-tight text-amber-700 dark:text-amber-300"
                    data-testid="label-post-review-current"
                    title="عادت من المراجعة الداخلية — تعديلات وليس صياغة أولية"
                  >
                    تعديلات بعد المراجعة
                  </span>
                )}
              </div>
              {index < stagesOrder.length - 1 && (
                <div
                  className={`h-1 flex-1 mx-1 rounded ${
                    (terminalState ? index < terminalState.reachedIndex : index < currentIndex)
                      ? "bg-green-500"
                      : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {terminalState && (
        <div className="flex justify-center pb-1">
          <span
            className={`rounded-md border px-3 py-1 text-sm font-bold ${TERMINAL_TONE_CLASSES[terminalState.tone]}`}
            data-testid="badge-settlement-terminal"
          >
            {terminalState.text}
          </span>
        </div>
      )}

      {disabled && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>جاري تحديث المرحلة...</span>
        </div>
      )}

      {canActOnPlatformReview && platformReviewInfo && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-platform-review-accept"
              >
                <Check className="w-4 h-4 ml-1" />
                تم القبول
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  تأكيد قبول {platformReviewInfo.kind === "تراضي" ? "منصة تراضي" : platformReviewInfo.kind === "ناجز" ? "منصة ناجز" : "منصة معين"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {platformReviewInfo.acceptCapture
                    ? `يرجى إدخال ${platformReviewInfo.acceptCapture.label}. سيتم استبدال رقم القضية بهذا الرقم.`
                    : "سيتم الانتقال إلى المرحلة التالية."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {platformReviewInfo.acceptCapture && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">
                    {platformReviewInfo.acceptCapture.label} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={platformAcceptNumber}
                    onChange={(e) => setPlatformAcceptNumber(e.target.value)}
                    placeholder={platformReviewInfo.acceptCapture.label}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid={`input-${platformReviewInfo.acceptCapture.field}`}
                  />
                </div>
              )}
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setPlatformAcceptNumber("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePlatformReviewAccept}
                  disabled={!!platformReviewInfo.acceptCapture && !platformAcceptNumber.trim()}
                >
                  تأكيد القبول
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {hasPlatformNotes && onPlatformReviewResubmit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  disabled={disabled}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-platform-review-resubmit"
                >
                  <SkipForward className="w-4 h-4 ml-1" />
                  تم إعادة التقديم
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد إعادة التقديم</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم مسح ملاحظات المنصة وتحديث الحالة إلى
                    "تم إعادة التقديم — بانتظار رد المنصة". القضية ستبقى في نفس المرحلة.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={onPlatformReviewResubmit}>تأكيد</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {onPlatformReviewAddNotes && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                  data-testid="button-platform-review-notes"
                >
                  <AlertTriangle className="w-4 h-4 ml-1" />
                  يوجد ملاحظات من المنصة
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>ملاحظات من المنصة</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حفظ الملاحظات وإبقاء القضية في نفس المرحلة لحين المعالجة وإعادة التقديم.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  placeholder="اكتب ملاحظات المنصة..."
                  value={platformNotes}
                  onChange={(e) => setPlatformNotes(e.target.value)}
                  className="mt-2"
                  data-testid="input-platform-notes"
                />
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel onClick={() => setPlatformNotes("")}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handlePlatformReviewAddNotes}
                    disabled={!platformNotes.trim()}
                  >
                    حفظ الملاحظات
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {canActOnSettlement && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-settlement-reached"
              >
                <Check className="w-4 h-4 ml-1" />
                تم الصلح
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: تم الصلح</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم نقل القضية إلى مرحلة <strong>تحصيل</strong> وإنشاء مهمة
                  تلقائية للدعم الإداري بإعداد خطاب التحصيل.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleSettlementDecision("تحصيل")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-orange-500 hover:bg-orange-600 text-white"
                data-testid="button-settlement-failed"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                لم يتم الصلح
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              {/* DEFENDANT — no choice. When our client is the مدعى عليه the
                  OPPONENT is the party who files in court, so there is nothing to
                  "continue" into: the case closes and waits for their filing.
                  closureReason is MANDATORY here, not decorative — closing out of
                  مداولة_الصلح is an "early close" and PATCH /api/cases/:id 400s
                  without it; it is also the discriminator PART B's reopen keys on. */}
              {isSettlementCase && clientRole === "مدعى_عليه" ? (
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
                      onClick={() => handleSettlementDecision("مقفلة", { closureReason: "لم_يتم_الصلح" })}
                      data-testid="button-settlement-failed-defendant-close"
                      className="bg-red-600 hover:bg-red-700"
                    >
                      تأكيد الإغلاق
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              ) : isSettlementCase ? (
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
                      onClick={() => handleSettlementDecision("أغلق_طلب_الصلح", { isSettlementCase: false, caseClassification: "قيد_الدراسة" })}
                      data-testid="button-settlement-failed-continue"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      استكمال إجراءاتها
                    </AlertDialogAction>
                    <AlertDialogAction
                      onClick={() => handleSettlementDecision("مقفلة")}
                      data-testid="button-settlement-failed-close"
                      className="bg-red-600 hover:bg-red-700"
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
                    <AlertDialogAction onClick={() => handleSettlementDecision("أغلق_طلب_الصلح")}>
                      تأكيد
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              )}
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {showReviewCommitteeActions && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-review-committee-approve"
              >
                <Check className="w-4 h-4 ml-1" />
                لا يوجد ملاحظات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>اعتماد قرار لجنة المراجعة</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم اعتماد القضية والانتقال مباشرةً إلى <strong>جاهزة للرفع</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => onReviewCommitteeApprove?.()}>
                  تأكيد الاعتماد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {onReviewCommitteeAddNotes && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  disabled={disabled}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  data-testid="button-review-committee-add-notes"
                >
                  <AlertTriangle className="w-4 h-4 ml-1" />
                  تم إضافة ملاحظات
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تم إضافة ملاحظات — الأخذ بملاحظات اللجنة</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم إرجاع القضية إلى مرحلة <strong>الأخذ بالملاحظات</strong> وإشعار المحامي المسؤول. الملاحظات اختيارية.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  placeholder="ملاحظات اللجنة للمحامي المسؤول..."
                  value={committeeReviewNotes}
                  onChange={(e) => setCommitteeReviewNotes(e.target.value)}
                  className="mt-2"
                  data-testid="input-review-committee-notes"
                />
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel onClick={() => setCommitteeReviewNotes("")}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReviewCommitteeAddNotes}>
                    تأكيد
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* Reasoned override — "تجاوز لجنة المراجعة". A SEPARATE block from the
          committee decisions above: its authorized actors (branch_manager /
          own-dept head / assigned lawyer) are NOT the committee chairs, so it
          must not hang off showReviewCommitteeActions (which gates on
          canReviewCases). The parent supplies onSkipCommittee ONLY when the user
          passes the server's rule → visibility == authorization. Styled as a
          destructive-outline SECONDARY action so it reads as an override and
          cannot be confused with the green "لا يوجد ملاحظات" approve button. */}
      {isAtReviewCommittee && onSkipCommittee && (
        <div className="flex items-center justify-center" data-testid="row-skip-committee">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                className="border-destructive/60 text-destructive hover:bg-destructive/10"
                data-testid="button-skip-committee"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                تجاوز لجنة المراجعة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تجاوز مرحلة لجنة المراجعة</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم نقل القضية مباشرةً إلى <strong>جاهزة للرفع</strong> دون قرار من لجنة
                  المراجعة. يُسجَّل هذا الإجراء في سجل النشاط مع اسمك والسبب. السبب إلزامي.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="سبب تجاوز لجنة المراجعة (إلزامي)..."
                value={skipCommitteeReason}
                onChange={(e) => setSkipCommitteeReason(e.target.value)}
                className="mt-2"
                data-testid="input-skip-committee-reason"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setSkipCommitteeReason("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleSkipCommittee}
                  disabled={!skipCommitteeReason.trim()}
                  data-testid="button-confirm-skip-committee"
                >
                  تأكيد التجاوز
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {canActOnCommitteeNotes && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-committee-notes-applied"
              >
                <Check className="w-4 h-4 ml-1" />
                تم الأخذ بالملاحظات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: تم الأخذ بالملاحظات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم الانتقال مباشرةً إلى <strong>جاهزة للرفع</strong> مع تسجيل قرار "تم الأخذ بالملاحظات".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCommitteeNotesDecision("تم_الأخذ_بالملاحظات")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-orange-500 hover:bg-orange-600 text-white"
                data-testid="button-committee-notes-partial"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                تم الأخذ بالملاحظات جزئياً
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: تم الأخذ بالملاحظات جزئياً</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم الانتقال مباشرةً إلى <strong>جاهزة للرفع</strong> مع تسجيل قرار "تم الأخذ بالملاحظات جزئياً".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCommitteeNotesDecision("تم_الأخذ_جزئياً")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-committee-notes-not-applied"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                لم يتم الأخذ بالملاحظات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: لم يتم الأخذ بالملاحظات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم الانتقال مباشرةً إلى <strong>جاهزة للرفع</strong> مع تسجيل قرار "لم يتم الأخذ بالملاحظات".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCommitteeNotesDecision("لم_يتم_الأخذ")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {onReturnToCommittee && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                  data-testid="button-committee-notes-return"
                >
                  <ChevronRight className="w-4 h-4 ml-1" />
                  إعادة للجنة المراجعة
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>إعادة القضية للجنة المراجعة</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم إرجاع القضية إلى مرحلة <strong>إحالة للجنة المراجعة</strong>.
                    اشرح ما تم تطبيقه أو سبب الإعادة. الملاحظات مطلوبة.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  placeholder="ما تم تطبيقه / سبب الإعادة..."
                  value={returnToCommitteeNotes}
                  onChange={(e) => setReturnToCommitteeNotes(e.target.value)}
                  className="mt-2"
                  data-testid="input-return-to-committee-notes"
                />
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel onClick={() => setReturnToCommitteeNotes("")}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReturnToCommittee}
                    disabled={!returnToCommitteeNotes.trim()}
                  >
                    تأكيد الإعادة
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {isAtInternalReview && !canActOnInternalReview && (
        <div className="flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-md py-2 px-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>بانتظار اعتماد المراجع الداخلي</span>
        </div>
      )}

      {isAtInternalReview && canActOnInternalReview && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-internal-review-approve"
              >
                <Check className="w-4 h-4 ml-1" />
                معتمد
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>اعتماد المراجعة الداخلية</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم اعتماد القضية والانتقال إلى{" "}
                  <strong>{getStageLabel(stagesOrder[currentIndex + 1])}</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleInternalReviewApprove}>تأكيد الاعتماد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                data-testid="button-internal-review-send-back"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                يوجد ملاحظات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>إرجاع القضية بملاحظات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم إرجاع القضية إلى المحامي ليأخذ بالملاحظات ثم يعيدها إليك.
                  الملاحظات مطلوبة.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="اكتب ملاحظات المراجع الداخلي..."
                value={sendBackNotes}
                onChange={(e) => setSendBackNotes(e.target.value)}
                className="mt-2"
                data-testid="input-internal-review-notes"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setSendBackNotes("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleInternalReviewSendBack}
                  disabled={!sendBackNotes.trim()}
                >
                  إرسال الملاحظات
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 flex-wrap">
        {canGoPrev && !isAtInternalReview && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-previous-stage"
              >
                <ChevronRight className="w-4 h-4 ml-1" />
                المرحلة السابقة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>إرجاع للمرحلة السابقة</AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من إرجاع القضية للمرحلة السابقة؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              {prevIsInternalReview && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">المراجع الداخلي <span className="text-red-500">*</span></label>
                  <select
                    value={selectedReviewerId || caseInternalReviewerId || ""}
                    onChange={(e) => setSelectedReviewerId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="select-internal-reviewer-prev"
                  >
                    <option value="">-- اختر مراجعاً --</option>
                    {eligibleInternalReviewers.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {caseInternalReviewerId && !selectedReviewerId && (
                    <p className="text-xs text-muted-foreground">
                      سيُعاد استخدام المراجع السابق ما لم يتم تغييره.
                    </p>
                  )}
                  {eligibleInternalReviewers.length === 0 && !caseInternalReviewerId && (
                    <p className="text-xs text-red-600">لا يوجد مراجعون مؤهلون في هذا القسم</p>
                  )}
                </div>
              )}
              <Textarea
                placeholder="سبب الإرجاع (اختياري)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                data-testid="input-stage-notes"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => { setNotes(""); setSelectedReviewerId(""); }}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleMovePrev} disabled={!canConfirmPrev}>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canSkip && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                data-testid="button-skip-data-completion"
              >
                <SkipForward className="w-4 h-4 ml-1" />
                الدعوى مكتملة - تجاوز استكمال المرفقات والبيانات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تجاوز مرحلة استكمال المرفقات والبيانات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم تجاوز مرحلة "استكمال المرفقات والبيانات" والانتقال مباشرةً إلى مرحلة{" "}
                  <strong>
                    {stagesOrder[currentIndex + 2]
                      ? getStageLabel(stagesOrder[currentIndex + 2])
                      : "دراسة"}
                  </strong>
                  . استخدم هذا الخيار فقط عندما تكون بيانات الدعوى مكتملة ولا توجد نواقص.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={skipNotes}
                onChange={(e) => setSkipNotes(e.target.value)}
                className="mt-2"
                data-testid="input-skip-notes"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setSkipNotes("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleSkip}>تأكيد التجاوز</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canGoNext && !isAtInternalReview && !canActOnCommitteeNotes && !isAtReviewCommittee && !isAtPlatformReview && !isAtSettlement && !nextStageActionAllowed && (
          // Permission-gated: the move would 403 server-side, so instead of the
          // old click-then-error flow show the action disabled with a tooltip
          // explaining who can perform it. The span wrapper is required because
          // disabled buttons don't emit the hover events the tooltip needs.
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex" data-testid="button-next-stage-disabled-wrap">
                <Button
                  variant="default"
                  size="sm"
                  disabled
                  className="opacity-50 cursor-not-allowed"
                  data-testid="button-next-stage-disabled"
                >
                  المرحلة التالية
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[260px] text-center">
              ليس لديك صلاحية لنقل القضية للمرحلة التالية. هذا الإجراء يقوم به المحامي المسؤول عن القضية أو إدارة القسم (رئيس القسم / الدعم الإداري / مدير الفرع).
            </TooltipContent>
          </Tooltip>
        )}

        {canGoNext && !isAtInternalReview && !canActOnCommitteeNotes && !isAtReviewCommittee && !isAtPlatformReview && !isAtSettlement && nextStageActionAllowed && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                data-testid="button-next-stage"
              >
                المرحلة التالية
                <ChevronLeft className="w-4 h-4 mr-1" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>نقل للمرحلة التالية</AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من نقل القضية للمرحلة التالية:{" "}
                  <strong>{getStageLabel(stagesOrder[currentIndex + 1])}</strong>؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              {nextIsInternalReview && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">اختر المراجع الداخلي <span className="text-red-500">*</span></label>
                  <select
                    value={selectedReviewerId || caseInternalReviewerId || ""}
                    onChange={(e) => setSelectedReviewerId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="select-internal-reviewer"
                  >
                    <option value="">-- اختر مراجعاً --</option>
                    {eligibleInternalReviewers.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {caseInternalReviewerId && !selectedReviewerId && (
                    <p className="text-xs text-muted-foreground">
                      المراجع المعيَّن لهذه القضية. يمكنك تغييره لهذه المراجعة فقط دون تعديل الإعداد الدائم.
                    </p>
                  )}
                  {eligibleInternalReviewers.length === 0 && !caseInternalReviewerId && (
                    <p className="text-xs text-red-600">لا يوجد مراجعون مؤهلون في هذا القسم</p>
                  )}
                </div>
              )}
              {platformFieldInfo && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">
                    {platformFieldInfo.label} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={platformNumber}
                    onChange={(e) => setPlatformNumber(e.target.value)}
                    placeholder={platformFieldInfo.placeholder}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid={`input-${platformFieldInfo.field}`}
                  />
                </div>
              )}
              {isReceptionToDataCompletion && (
                <label className="mt-3 block text-sm font-semibold" dir="rtl">
                  البيانات المطلوبة <span className="text-red-500">*</span>
                </label>
              )}
              <Textarea
                placeholder={
                  isReceptionToDataCompletion
                    ? "اذكر المرفقات والبيانات المطلوبة من العميل لاستكمال القضية"
                    : "ملاحظات (اختياري)"
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                data-testid="input-stage-notes-next"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel
                  onClick={() => { setNotes(""); setSelectedReviewerId(""); setPlatformNumber(""); }}
                >
                  إلغاء
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleMoveNext} disabled={!canConfirmNext}>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
