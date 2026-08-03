// DERIVED attachment indicators. Same house pattern as isAwaitingJudgmentDeed
// (cases.tsx) and caseHasReturnedFromReview (case-stage-utils.ts): computed
// from data the page already holds, never stored, and self-clearing because
// there is no stored term to clear.
//
// Both predicates take a STRUCTURAL parameter type rather than LawCase /
// Hearing. That is deliberate and load-bearing: hasDeedAttachment and
// hasMinutesAttachment are stamped onto the LIST RESPONSES only
// (GET /api/cases, GET /api/hearings) and are NOT on the entity interfaces, so
// they can never be spread into an insert or update. Typing them structurally
// here is what lets a caller pass a LawCase or a Hearing without the field ever
// being declared on those types — the same trick caseHasReturnedFromReview uses.

// "بانتظار إرفاق الصك" — the receipt DATE is recorded but the صك FILE is not on
// file yet.
//
// The three deed states on a case at محكوم_حكم_ابتدائي:
//   no receipt date              -> isAwaitingJudgmentDeed  (بانتظار استلام الصك)
//   date recorded, no file       -> THIS                    (بانتظار إرفاق الصك)
//   file attached                -> no badge
// The two are mutually exclusive by construction — one requires the date empty,
// the other requires it non-empty — so a case never shows both.
//
// ⚠ NO COMPARISON BETWEEN THE RECEIPT DATE AND TODAY, deliberately. A future
// date is legitimate and the date entry is unchanged, so there is no
// past/future split to make. This also keeps the predicate clear of the
// date-boundary bug class: with no "is this date in the past" test there is no
// timezone to get wrong.
export function isAwaitingJudgmentDeedFile(c: {
  currentStage: string;
  judgmentDeedReceivedDate?: string | null;
  hasDeedAttachment?: boolean;
}): boolean {
  if (c.currentStage !== "محكوم_حكم_ابتدائي") return false;
  // Date must be RECORDED — otherwise the existing "بانتظار استلام الصك" badge
  // owns this case and this one stays silent.
  if (!String(c.judgmentDeedReceivedDate || "").trim()) return false;
  return !c.hasDeedAttachment;
}

// "This case reached the first-instance judgment stage" — the CLIENT half of the
// server's caseReachedPrimaryJudgment (shared/schema.ts).
//
// ⚠ IT READS A DERIVED LIST FIELD RATHER THAN CALLING THE SHARED HELPER, and it
// has to: GET /api/cases STRIPS stageHistory from every row, so the client
// physically cannot run the shared stageHistory test. The server therefore stamps
// `reachedPrimaryJudgment` on the list response — computed with the shared helper,
// from the history, immediately BEFORE it is stripped — so the two sides still
// share one rule even though only one of them can evaluate it. Same derived-field
// idiom as hasDeedAttachment, and it costs no extra query.
//
// `id` is an ANCHOR, not a value this reads: an all-optional parameter type has
// NO property in common with LawCase and TypeScript rejects the call outright
// (TS2559). One required field that LawCase really has makes the structural match
// legal while still keeping the derived field off the interface — the same reason
// isAwaitingJudgmentDeedFile above carries `currentStage`.
export function caseReachedJudgment(c: { id: string; reachedPrimaryJudgment?: boolean }): boolean {
  return !!c.reachedPrimaryJudgment;
}

// Structural accessor for the صك presence flag, for the GATES rather than the
// badges. Exists so callers can read hasDeedAttachment without it ever being
// declared on LawCase — see the module header for why that matters. A case whose
// list response predates the field reads as "no deed", which is the SAFE
// direction for a gate: it refuses rather than lets something through.
// `id` is the same TS2559 anchor as caseReachedJudgment above.
export function caseHasDeedAttachment(c: { id: string; hasDeedAttachment?: boolean }): boolean {
  return !!c.hasDeedAttachment;
}

// The case has MOVED PAST محكوم_حكم_ابتدائي and still owes its صك.
//
// WHY THIS EXISTS: three automatic cascades are deliberately NOT blocked (the
// objection filing, a court hearing listed at the judgment stage, and a hearing
// result), so a case can legitimately reach منظورة_استئناف or محكوم_حكم_نهائي
// with no deed on file — and legacy cases predating the gate are already there.
// Without this badge those cases would be INVISIBLE: isAwaitingJudgmentDeedFile
// only fires at محكوم_حكم_ابتدائي, so the moment a case moves on its indicator
// disappeared while the close gate silently held it. That is the "wedged with no
// actor" failure the whole design is trying to avoid.
//
// Same wording as isAwaitingJudgmentDeedFile ("بانتظار إرفاق الصك") — it is the
// same state, so it gets the same words rather than a new vocabulary.
//
// MUTUALLY EXCLUSIVE with both deed badges by construction: those two require
// currentStage === محكوم_حكم_ابتدائي, this one excludes it.
export function isPostJudgmentCaseMissingDeed(c: {
  currentStage: string;
  reachedPrimaryJudgment?: boolean;
  hasDeedAttachment?: boolean;
}): boolean {
  // Never reached judgment → the deed was never recordable → silent. This is the
  // same positive test the server gates on, so badge and gate agree exactly.
  if (!c.reachedPrimaryJudgment) return false;
  // Still AT the judgment stage → owned by the two existing badges.
  if (c.currentStage === "محكوم_حكم_ابتدائي") return false;
  // Already closed or archived → the gate no longer applies, and nagging about a
  // document on a finished file is noise. (A case can only BE closed with the
  // deed attached, so in practice this arm only catches pre-gate history.)
  if (c.currentStage === "مقفلة" || c.currentStage === "مؤرشفة") return false;
  return !c.hasDeedAttachment;
}

// A single hearing whose result is recorded but whose ضبط is not attached.
// Shared by the case-level badge and the hearings-page filter so the two can
// never drift apart.
export function isHearingMissingMinutes(h: {
  result?: string | null;
  hasMinutesAttachment?: boolean;
}): boolean {
  if (!String(h.result || "").trim()) return false;
  return !h.hasMinutesAttachment;
}

// "إرفاق ضبط الجلسة" — ANY hearing on the case has a result but no minutes.
// Reads the app-wide hearings list that the page already holds (the same list
// the "رد خصم" badge reads via getHearingsByCase), so this costs no request.
export function caseHasHearingMissingMinutes(
  hearings: Array<{ result?: string | null; hasMinutesAttachment?: boolean }>,
): boolean {
  return hearings.some(isHearingMissingMinutes);
}
