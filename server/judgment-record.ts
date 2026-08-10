// ==================== سجل الأحكام — THE JUDGMENT-RECORD SERVICE ====================
//
// 🔴 THE SINGLE WRITER. Everything that creates a judgment row, edits a judgment's
// صك fields, or touches law_cases.judgment_deed_received_date /
// objection_window_days goes through this module. Nothing else may write those
// two columns.
//
// WHY THAT MATTERS. The two law_cases scalars are a MIRROR of the CURRENT
// judgment's deed fields, kept so that every existing badge, gate and task keeps
// reading exactly what it reads today (batch 3 re-keys them; batch 2 does not).
// A mirror with two writers is not a cache — it is a second source of truth that
// silently disagrees with the first. So:
//   • the row write and the mirror refresh happen in ONE transaction
//     (storage.createCaseJudgment / storage.updateJudgmentDeedFields), and
//   • the mirror is RECOMPUTED from the case's current judgment rather than
//     tracked incrementally, so it cannot drift and self-heals if it ever did.
//
// THE TWO PRE-EXISTING WRITERS, both closed in batch 2:
//   1. POST /api/cases/:id/judgment-deed — wrote the scalars via
//      storage.updateCase. Now calls recordDeedReceipt() below.
//   2. PATCH /api/cases/:id — updateCaseSchema ADMITTED both fields and the
//      handler spreads the whole body into storage.updateCase, so any caller
//      could set them. No client ever did (the only client sender posts to
//      /judgment-deed), so stripping them is a no-op in practice — but it is the
//      difference between "nothing writes this today" and "nothing CAN".
//      See stripJudgmentMirrorFields.
//
// NOT A NOTIFICATION-STYLE BEST-EFFORT MODULE. Unlike notification-recipients.ts,
// these functions DO throw: a judgment row that fails to write must fail the
// request loudly. A swallowed failure here would leave the case's stage saying one
// thing and its judgment record another.

import { storage } from "./storage";
import {
  JudgmentDegree,
  DefaultObjectionWindowDays,
  CaseStage,
  type CaseStageValue,
  type CaseJudgment,
  type LawCase,
} from "@shared/schema";

// The two mirrored columns, named once. Used by the PATCH guard below.
export const JUDGMENT_MIRROR_FIELDS = [
  "judgmentDeedReceivedDate",
  "objectionWindowDays",
] as const;

// Removes the mirrored scalars from a request body IN PLACE and reports whether
// anything was dropped. Called by PATCH /api/cases/:id.
//
// DROP RATHER THAN 400, deliberately. A 400 would be the stricter choice, but the
// generic PATCH is the app's busiest write path and it re-sends whole case objects
// from several dialogs; rejecting a body merely because it CARRIED an unchanged
// mirror value would break edits that have nothing to do with judgments. Dropping
// keeps every existing caller working while making the columns unwritable from
// here. The caller logs when something was actually dropped, so a genuine attempt
// is visible rather than silent.
export function stripJudgmentMirrorFields(body: Record<string, unknown>): string[] {
  const dropped: string[] = [];
  for (const field of JUDGMENT_MIRROR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      dropped.push(field);
      delete body[field];
    }
  }
  return dropped;
}

// THE DEGREE IS DERIVED FROM THE CASE PATH, NEVER ASKED — the 2026-07-27 model
// correction. منظورة_استئناف → the ruling is استئنافي; anything else → ابتدائي.
// One implementation so the hearing hook and the appeal-ruling endpoint cannot
// disagree about what degree a ruling has.
export function judgmentDegreeForStage(currentStage: string | null | undefined): string {
  return String(currentStage || "") === "منظورة_استئناف"
    ? JudgmentDegree.APPEAL
    : JudgmentDegree.FIRST_INSTANCE;
}

// deadline = receipt date + window. Pure date arithmetic on a YYYY-MM-DD string.
//
// ⚠ NO "IS THIS TODAY / IN THE PAST" TEST ANYWHERE HERE, so this is outside the
// date-boundary bug class: nothing is compared against the firm's calendar day, so
// there is no Asia/Riyadh boundary to get wrong. It is the same computation the
// deed route already performed inline, moved here unchanged so the endpoint and
// any future caller share one rule.
export function computeObjectionDeadline(receivedDate: string, windowDays: number | null): string {
  const receivedAt = new Date(receivedDate);
  const deadline = new Date(receivedAt.getTime());
  deadline.setDate(deadline.getDate() + (windowDays ?? DefaultObjectionWindowDays));
  return deadline.toISOString().split("T")[0];
}

// THE CURRENT JUDGMENT of a case — the highest sequence. It is never a superseded
// one: a quash marks an EARLIER ruling superseded and inserts itself on top, so
// the newest row is always the live one. Returns undefined for a case that has
// never had a ruling recorded.
export async function currentJudgmentFor(caseId: string): Promise<CaseJudgment | undefined> {
  return await storage.getLatestJudgmentForCase(caseId);
}

// ==================== CREATE ====================
// Records a ruling. Fires from exactly two places:
//   • the hearing-result handler, when a result of حكم is recorded (PATH B), and
//   • POST /api/cases/:id/appeal-ruling, for an appeal ruling reached without a
//     session being recorded in the system.
//
// IDEMPOTENT ON THE HEARING. When hearingId is given and a judgment already
// references that hearing, the existing row is returned and NOTHING is written —
// so re-saving a hearing whose result is already حكم cannot mint a second ruling.
// A judgment recorded WITHOUT a hearing (the appeal-ruling endpoint) has no such
// key and is guarded by its endpoint's stage check instead.
export async function recordJudgment(input: {
  caseId: string;
  hearingId?: string | null;
  degree: string;
  outcome?: string | null;
  isFinal: boolean;
  opensWindow: boolean;
  recordedBy: string;
  supersedesJudgmentId?: string | null;
}): Promise<{ judgment: CaseJudgment; created: boolean }> {
  if (input.hearingId) {
    const existing = await storage.getJudgmentByHearingId(input.hearingId);
    if (existing) return { judgment: existing, created: false };
  }
  const judgment = await storage.createCaseJudgment({
    caseId: input.caseId,
    hearingId: input.hearingId ?? null,
    degree: input.degree,
    outcome: input.outcome ?? null,
    isFinal: input.isFinal,
    opensWindow: input.opensWindow,
    // A new ruling starts with NO صك — its own deed has not arrived yet. The
    // mirror refresh inside the transaction therefore CLEARS the case scalars,
    // which is the point: they described the PREVIOUS ruling's deed, and leaving
    // them would credit the new ruling with a document nobody has received.
    deedReceivedDate: null,
    objectionWindowDays: null,
    objectionDeadline: null,
    recordedBy: input.recordedBy,
  }, { supersedesJudgmentId: input.supersedesJudgmentId ?? null });
  return { judgment, created: true };
}

// ==================== THE صك RECEIPT ====================
// Records (or corrects) the date a ruling's صك was received, and derives the
// objection deadline from it. Writes the judgment row and refreshes the mirror in
// one transaction.
//
// Returns the deadline so the caller can drive the لائحة اعتراضية memo with it —
// the memo itself is deliberately NOT created here. ensureObjectionMemoForCase
// lives in routes.ts and depends on request-scoped helpers; moving it would be a
// reader change, and batch 2 re-keys no readers.
export async function recordDeedReceipt(input: {
  judgmentId: string;
  receivedDate: string;
  objectionWindowDays: number | null;
}): Promise<{ judgment: CaseJudgment; deadline: string; effectiveWindow: number }> {
  const effectiveWindow = input.objectionWindowDays ?? DefaultObjectionWindowDays;
  const deadline = computeObjectionDeadline(input.receivedDate, input.objectionWindowDays);
  const judgment = await storage.updateJudgmentDeedFields(input.judgmentId, {
    deedReceivedDate: input.receivedDate,
    objectionWindowDays: input.objectionWindowDays,
    objectionDeadline: deadline,
  });
  if (!judgment) throw new Error(`judgment ${input.judgmentId} not found`);
  return { judgment, deadline, effectiveWindow };
}

// ==================== THE APPEAL RULING ====================
// The two shapes an appeal ruling can take, and what each means for the case.
export const AppealRulingOutcome = {
  // The appeal court UPHELD the ruling below. The case is finished on the merits.
  AFFIRMED: "affirmed",
  // The appeal court QUASHED the ruling and REMANDED the case. The ruling below
  // ceases to stand and the case returns to first instance for a NEW ruling.
  QUASHED_REMANDED: "quashed_remanded",
} as const;

export type AppealRulingOutcomeValue =
  typeof AppealRulingOutcome[keyof typeof AppealRulingOutcome];

// Builds the judgment payload for an appeal ruling. Split out from the endpoint so
// the three properties that are NOT free choices are stated in one place:
//
//   degree      — always استئنافي. The endpoint only runs on a case at
//                 منظورة_استئناف, so the ruling is by definition an appeal ruling.
//   isFinal     — always true. An appeal ruling is final BY NATURE; that is what
//                 distinguishes it from a first-instance one, and it is why the
//                 objectionability question is never asked for it.
//   opensWindow — always false, for BOTH outcomes. Owner-settled: the quash's own
//                 صك is not objectionable, and an affirmation is final. Cassation
//                 (نقض) is out of scope, so nothing downstream of an appeal ruling
//                 opens another objection window.
//
// OUTCOME CARRIES FORWARD ON AN AFFIRMATION and is NULL on a quash. Affirming a
// ruling means its merits stand, so the appeal row inherits لصالحنا / ضدنا / جزئي
// from the ruling it upheld. A quash decides PROCEDURE, not the merits — there is
// no side to record, and inventing one would misreport the case's outcome.
export function appealRulingPayload(
  outcome: AppealRulingOutcomeValue,
  priorJudgment: CaseJudgment | undefined,
): { degree: string; outcome: string | null; isFinal: boolean; opensWindow: boolean } {
  return {
    degree: JudgmentDegree.APPEAL,
    outcome: outcome === AppealRulingOutcome.AFFIRMED ? (priorJudgment?.outcome ?? null) : null,
    isFinal: true,
    opensWindow: false,
  };
}

// The stage a case moves to after an appeal ruling.
//   affirmed          → محكوم_حكم_نهائي (the existing منظورة_استئناف edge)
//   quashed_remanded  → منظورة, back to first instance for a NEW ruling
//                       (the edge added in batch 2)
// Owner-settled: the remanded case returns to منظورة DIRECTLY, and it keeps the
// same court_case_number — a remand is not a new case.
export function appealRulingTargetStage(outcome: AppealRulingOutcomeValue): CaseStageValue {
  return outcome === AppealRulingOutcome.AFFIRMED
    ? CaseStage.FINAL_JUDGMENT
    : CaseStage.UNDER_REVIEW;
}

// Appends a stage-history entry without disturbing the existing ones. Mirrors
// moveCaseFromPrimaryJudgment's shape exactly (that helper is hard-coded to the
// محكوم_حكم_ابتدائي origin, so it cannot serve this transition).
export function appendStageHistory(
  lawCase: LawCase,
  stage: CaseStageValue,
  actor: { id: string; name: string },
  notes: string,
): LawCase["stageHistory"] {
  const history = Array.isArray(lawCase.stageHistory) ? lawCase.stageHistory : [];
  return [
    ...history,
    {
      stage,
      timestamp: new Date().toISOString(),
      userId: actor.id,
      userName: actor.name,
      notes,
    },
  ];
}
