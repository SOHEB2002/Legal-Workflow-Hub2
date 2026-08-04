import { hearingProducesNoMinutes } from "@shared/schema";

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

// "This case reached A JUDGMENT STAGE" — any of محكوم_حكم_ابتدائي /
// منظورة_استئناف / محكوم_حكم_نهائي. The CLIENT half of the server's
// caseReachedJudgmentStage (shared/schema.ts); see the long note there for why it
// covers all three rather than first-instance alone.
//
// ⚠ IT READS A DERIVED LIST FIELD RATHER THAN CALLING THE SHARED HELPER, and it
// has to: GET /api/cases STRIPS stageHistory from every row, so the client
// physically cannot run the shared stageHistory test. The server therefore stamps
// `reachedJudgmentStage` on the list response — computed with the shared helper,
// from the history, immediately BEFORE it is stripped — so the two sides still
// share one rule even though only one of them can evaluate it. Same derived-field
// idiom as hasDeedAttachment, and it costs no extra query.
//
// `id` is an ANCHOR, not a value this reads: an all-optional parameter type has
// NO property in common with LawCase and TypeScript rejects the call outright
// (TS2559). One required field that LawCase really has makes the structural match
// legal while still keeping the derived field off the interface — the same reason
// isAwaitingJudgmentDeedFile above carries `currentStage`.
export function caseReachedJudgment(c: { id: string; reachedJudgmentStage?: boolean }): boolean {
  return !!c.reachedJudgmentStage;
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

// The case is at a judgment stage OTHER than محكوم_حكم_ابتدائي — i.e.
// منظورة_استئناف or محكوم_حكم_نهائي — and still owes its صك.
//
// WHY THIS EXISTS: a case can reach those stages with no deed on file by several
// routes — three automatic cascades are deliberately not blocked (objection
// filing, a court hearing listed at the judgment stage, a hearing result), and
// 🔴 THE COMMONEST ROUTE OF ALL is a first-instance ruling marked NOT objectionable,
// which goes STRAIGHT to محكوم_حكم_نهائي without ever visiting محكوم_حكم_ابتدائي.
// Production confirmed that is 8 of 8 final-judgment cases, not an edge case.
// Without this badge those cases are INVISIBLE: isAwaitingJudgmentDeedFile only
// fires at محكوم_حكم_ابتدائي, so a case that skipped or left that stage shows
// nothing while the close gate silently holds it — the "wedged with no actor"
// failure the whole design exists to avoid.
//
// This is ALSO the case's only route to the late-attach affordance
// (canAttachDeedLate), which is what makes the gate satisfiable at all. Widening
// the gate without widening THIS would have re-created the batch-3 bug: a
// requirement with no way to meet it.
//
// Same wording as isAwaitingJudgmentDeedFile ("بانتظار إرفاق الصك") — it is the
// same state, so it gets the same words rather than a new vocabulary.
//
// MUTUALLY EXCLUSIVE with both deed badges by construction: those two require
// currentStage === محكوم_حكم_ابتدائي, this one excludes it.
export function isPostJudgmentCaseMissingDeed(c: {
  currentStage: string;
  reachedJudgmentStage?: boolean;
  hasDeedAttachment?: boolean;
}): boolean {
  // Never reached judgment → the deed was never recordable → silent. This is the
  // same positive test the server gates on, so badge and gate agree exactly.
  if (!c.reachedJudgmentStage) return false;
  // Still AT the judgment stage → owned by the two existing badges.
  if (c.currentStage === "محكوم_حكم_ابتدائي") return false;
  // Already closed or archived → the gate no longer applies, and nagging about a
  // document on a finished file is noise. (A case can only BE closed with the
  // deed attached, so in practice this arm only catches pre-gate history.)
  if (c.currentStage === "مقفلة" || c.currentStage === "مؤرشفة") return false;
  return !c.hasDeedAttachment;
}

// 🔴 THE ضبط GATE IS NOW TWO GATES, because the server's is (owner decision
// 2026-08-04). The single canActOnHearingMinutes stopped meaning one thing the
// moment reading widened, so it was RENAMED rather than left as a name that
// silently covers two different audiences:
//
//   READ  (preview / download)  → canViewHearingMinutes  → parent case's viewers
//          GET .../minutes-attachment and .../download are canModifyCase on the
//          PARENT CASE (routes.ts), matching the صك, which was already read-wide.
//   WRITE (attach / replace / delete) → isHearingActor → canActOnHearing
//          POST and DELETE .../minutes-attachment are UNCHANGED and stay narrow.
//          isHearingActor also gates the "مطلوب رد من الخصم" toggle, which is why
//          its name is no longer minutes-specific.
//
// Keeping one predicate would have meant either hiding the preview from users the
// server now serves, or offering upload to users it still 403s. Both are the
// visibility != authorization failure this codebase keeps paying for.

// READ half. Any authenticated user, and that is now EXACT rather than a
// convenient approximation: as of the 2026-08-04 owner decision the four
// attachment read routes carry `requireAuth` and nothing else, matching
// GET /api/cases and GET /api/hearings, which have never had any scoping —
// getAllCases() / getAllHearings() with no role or department term. So a user
// holding the row in hand is authorised for its files, server-side, always.
// The server remains the authority; this only decides what renders.
export function canViewHearingMinutes(
  user: { id: string; role: string } | null | undefined,
): boolean {
  return !!user;
}

// THE CLIENT MIRROR of the server's canActOnHearing: attending lawyer /
// branch_manager / admin_support.
//
// ⚠ RENAMED from canWriteHearingMinutes (2026-08-04) because it is no longer
// minutes-specific: it now also gates the "مطلوب رد من الخصم" toggle, and the
// server aligned that flag's CLEAR side onto canActOnHearing too. A name that
// says "minutes" while gating opponent-response actions is the kind of lie this
// codebase has been bitten by. It is deliberately NOT called canActOnHearing:
// hearings.tsx already has a local const by that name (:1093), and shadowing it
// with an import would be needlessly confusing.
//
// Deliberately NOT department-scoped: hearings carry no departmentId, so a
// department_head would have to be resolved through the parent case — the known
// open item that kept hearings out of the tiered permissions widening. (The READ
// half above does resolve the parent case, server-side, which is exactly why it
// can be wider.)
//
// EXPORTED so the hearing-details dialog and the case-details dialog share ONE
// implementation. Two inline copies of the same four-line rule is exactly the
// drift this codebase has been bitten by before.
// 🔴 department_head IS INCLUDED as of 2026-08-05 (owner reversal of Phase 5
// B/M4) — scoped to the PARENT CASE's department. Hearings carry no departmentId,
// so the caller passes the parent case; where it cannot be resolved the grant
// simply does not apply, which is the safe direction.
// The !!user.departmentId guard is mandatory — without it a head with a null
// department would match every case with a null department.
export function isHearingActor(
  user: { id: string; role: string; departmentId?: string | null } | null | undefined,
  hearing: { attendingLawyerId?: string | null } | null | undefined,
  parentCase?: { departmentId?: string | null } | null,
): boolean {
  if (!user || !hearing) return false;
  if (user.role === "branch_manager" || user.role === "admin_support") return true;
  if (!!hearing.attendingLawyerId && hearing.attendingLawyerId === user.id) return true;
  return user.role === "department_head"
    && !!user.departmentId
    && !!parentCase?.departmentId
    && user.departmentId === parentCase.departmentId;
}

// Structural accessor for the ضبط presence flag — the hearing-side twin of
// caseHasDeedAttachment, reading the derived hasMinutesAttachment stamped on
// GET /api/hearings. Used to decide whether a VIEW-ONLY user is shown anything at
// all: a viewer must see a preview when a file exists and NOTHING when it does
// not, and this is the only way to know which without issuing a fetch first.
// `id` is the same TS2559 anchor the accessors above use.
export function hearingHasMinutes(c: { id: string; hasMinutesAttachment?: boolean }): boolean {
  return !!c.hasMinutesAttachment;
}

// A single hearing whose result is recorded but whose ضبط is not attached.
// Shared by the case-level badge and the hearings-page filter so the two can
// never drift apart.
export function isHearingMissingMinutes(h: {
  result?: string | null;
  hearingType?: string | null;
  hasMinutesAttachment?: boolean;
}): boolean {
  // جلسات الصلح والتسوية issue no ضبط at all, so they can never be "missing" one.
  // FIRST, before the result test: a settlement hearing must stay silent on every
  // surface regardless of what its result says. Shared with the server halves via
  // schema.ts — see the note there for why hearing_type is the authoritative term.
  if (hearingProducesNoMinutes(h)) return false;
  if (!String(h.result || "").trim()) return false;
  return !h.hasMinutesAttachment;
}

// "إرفاق ضبط الجلسة" — ANY hearing on the case has a result but no minutes.
// Reads the app-wide hearings list that the page already holds (the same list
// the "رد خصم" badge reads via getHearingsByCase), so this costs no request.
export function caseHasHearingMissingMinutes(
  hearings: Array<{ result?: string | null; hearingType?: string | null; hasMinutesAttachment?: boolean }>,
): boolean {
  return hearings.some(isHearingMissingMinutes);
}
