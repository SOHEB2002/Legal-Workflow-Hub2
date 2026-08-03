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
