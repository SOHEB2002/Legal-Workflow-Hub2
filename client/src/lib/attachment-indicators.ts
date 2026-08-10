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

// ==================== THE TWO صك BADGES — RE-KEYED TO THE JUDGMENT (batch 3) ====================
// 🔴 THEY USED TO BE GATED ON `currentStage === "محكوم_حكم_ابتدائي"`, WHICH WAS
// WRONG IN BOTH DIRECTIONS:
//   • TOO NARROW — a صك is issued for EVERY ruling. A منظورة ruling the lawyer
//     marks NOT objectionable goes straight to محكوم_حكم_نهائي in ONE stage write
//     and never visits the first-instance stage at all (production: 8 of 8 final
//     -judgment cases), and an APPEAL ruling has a صك too, by which time the case
//     is at محكوم_حكم_نهائي. Neither could ever show a صك badge.
//   • TOO WIDE — a case parked on that stage with no ruling on record was badged
//     for a document that nothing had made recordable.
// Both now key on THE CURRENT JUDGMENT: hasJudgmentRecord (stamped on the list
// response from case_judgments) says a ruling exists, and the deed date says
// whether its صك has arrived. Exactly the question the server's own deed gate
// asks since batch 2, so badge and endpoint agree by construction.
//
// THE DATE TERM STILL READS law_cases.judgmentDeedReceivedDate, and that is not a
// second source of truth: since batch 2 those two scalars are a MIRROR of the
// CURRENT judgment's deed fields, refreshed inside the same transaction that
// writes the judgment row and RECOMPUTED from the record rather than tracked. A
// case with no judgment row mirrors NULL, so both terms fall to "no badge"
// together. See server/judgment-record.ts.

// Closed and archived files are silent. A finished case must not be nagged about
// paperwork, and both badges need the rule, so it lives in one place.
// (Before batch 3 the stage term excluded these implicitly — مقفلة is not
// محكوم_حكم_ابتدائي — so dropping that term without this would have started
// badging every closed case that predates the deed gate.)
function isFinishedFile(currentStage: string): boolean {
  return currentStage === "مقفلة" || currentStage === "مؤرشفة";
}

// "بانتظار استلام الصك" — a ruling exists but its صك has not been logged as
// received, so the objection clock has not started.
//
// MOVED HERE FROM cases.tsx in batch 3. It had no external importer and only one
// call site, and its sibling below now shares the same two terms and the same
// finished-file rule — keeping them in two files was how they would drift.
export function isAwaitingJudgmentDeed(c: {
  currentStage: string;
  hasJudgmentRecord?: boolean;
  judgmentDeedReceivedDate?: string | null;
}): boolean {
  if (!c.hasJudgmentRecord) return false;
  if (isFinishedFile(c.currentStage)) return false;
  return !String(c.judgmentDeedReceivedDate || "").trim();
}

// "بانتظار إرفاق الصك" — the receipt DATE is recorded but the صك FILE is not on
// file yet.
//
// The three deed states on a case that HAS a ruling:
//   no receipt date              -> isAwaitingJudgmentDeed  (بانتظار استلام الصك)
//   date recorded, no file       -> THIS                    (بانتظار إرفاق الصك)
//   file attached                -> no badge
// The two are mutually exclusive by construction — one requires the date empty,
// the other requires it non-empty — so a case never shows both. Together they now
// PARTITION every case that has a ruling, at any stage, which is what made the
// third badge (isPostJudgmentCaseMissingDeed) redundant; see below.
//
// ⚠ NO COMPARISON BETWEEN THE RECEIPT DATE AND TODAY, deliberately. A future
// date is legitimate and the date entry is unchanged, so there is no
// past/future split to make. This also keeps the predicate clear of the
// date-boundary bug class: with no "is this date in the past" test there is no
// timezone to get wrong.
export function isAwaitingJudgmentDeedFile(c: {
  currentStage: string;
  hasJudgmentRecord?: boolean;
  judgmentDeedReceivedDate?: string | null;
  currentJudgmentHasDeed?: boolean;
}): boolean {
  if (!c.hasJudgmentRecord) return false;
  if (isFinishedFile(c.currentStage)) return false;
  // Date must be RECORDED — otherwise the "بانتظار استلام الصك" badge owns this
  // case and this one stays silent.
  if (!String(c.judgmentDeedReceivedDate || "").trim()) return false;
  // 🔴 BATCH 4 — the CURRENT ruling's OWN صك, not the case's. hasDeedAttachment
  // would report cycle 1's file as satisfying a cycle-2 ruling, so this badge
  // went quiet while the server's close gate still refused — an invisible hold.
  return !c.currentJudgmentHasDeed;
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
// ⚠ AS OF BATCH 4 THIS HAS NO CALLERS. Every gate and badge that used it now
// reads caseCurrentJudgmentHasDeed instead — the CASE-level answer is wrong once a
// case can hold more than one ruling. It is deliberately KEPT, not deleted,
// because retiring the case_attachments surface is its own change with its own
// rollback: the deed GET / download / DELETE routes still read that table, and the
// upload still dual-writes it. When those move, this and the hasDeedAttachment
// list stamp go with them. Do NOT read this as "the case has its deed".
export function caseHasDeedAttachment(c: { id: string; hasDeedAttachment?: boolean }): boolean {
  return !!c.hasDeedAttachment;
}

// "Does this case have a ruling on record?" — the batch-3 replacement for the
// `currentStage === محكوم_حكم_ابتدائي` term the صك surfaces used to key on.
// hasJudgmentRecord is stamped on GET /api/cases from case_judgments, exactly like
// hasDeedAttachment and reachedJudgmentStage: DERIVED on every list read, never
// stored, and never declared on LawCase so it cannot reach an insert or update.
//
// A list response that predates the field reads as "no ruling", which is the SAFE
// direction on both sides: badges stay silent and the deed affordance stays
// hidden, rather than a button appearing whose endpoint would 400.
// `id` is the same TS2559 anchor as caseReachedJudgment above.
export function caseHasJudgmentRecord(c: { id: string; hasJudgmentRecord?: boolean }): boolean {
  return !!c.hasJudgmentRecord;
}

// 🔴 BATCH 4 — "does the case's CURRENT ruling have ITS OWN صك on file?", the
// client half of the re-keyed server gate (isJudgmentDeedMissing).
//
// THIS REPLACES caseHasDeedAttachment EVERYWHERE THE DEED IS A REQUIREMENT.
// hasDeedAttachment answers a CASE-level question — "is there a deed row for this
// case" — which was the same question until a case could hold more than one
// ruling. On a second cycle it reports true from cycle 1's file, so a badge would
// go quiet and the close button would look available while the server refuses:
// exactly the invisible hold the badges exist to prevent.
// Safe direction on an older list response: absent → false → the badge shows and
// the gate mirror refuses, rather than promising a close the server will reject.
export function caseCurrentJudgmentHasDeed(c: { id: string; currentJudgmentHasDeed?: boolean }): boolean {
  return !!c.currentJudgmentHasDeed;
}

// The hearing that produced the case's current ruling, for re-keying
// findPrimaryJudgmentHearing. NULL is normal and means "recorded without a session
// in our system" (POST /appeal-ruling) — that helper falls back to its date scan.
export function caseCurrentJudgmentHearingId(
  c: { id: string; currentJudgmentHearingId?: string | null },
): string | null {
  return c.currentJudgmentHearingId ?? null;
}

// The direction of the case's current ruling (لصالحنا | ضدنا | جزئي), for the
// closed-case outcome badge. NULL for a quash — it decides procedure, not merits —
// and null on a case with no ruling.
export function caseCurrentJudgmentOutcome(
  c: { id: string; currentJudgmentOutcome?: string | null },
): string | null {
  return c.currentJudgmentOutcome ?? null;
}

// 🔴 THIS WAS isPostJudgmentCaseMissingDeed, AND ITS BADGE JOB IS GONE — but its
// GATE job is not, which is why it is re-keyed and renamed rather than deleted.
//
// WHAT IT USED TO BE: "the case is at a judgment stage OTHER than
// محكوم_حكم_ابتدائي and still owes its صك". It existed because the two badges
// above only fired AT that one stage, so every case that skipped it (a ruling
// marked not objectionable goes straight to محكوم_حكم_نهائي — 8 of 8 in
// production) or left it was INVISIBLE while the close gate silently held it.
//
// WHY THE BADGE HALF IS NOW REDUNDANT: with both badges re-keyed to the current
// judgment they no longer care about the stage at all, so they already cover
// every case this used to catch — and they say the more useful of the two things,
// because a case with no receipt date needs the DATE first ("بانتظار استلام
// الصك"), which this one could not distinguish. Its badge render was removed from
// the cases table; keeping it would have double-badged the same case.
//
// WHAT SURVIVES: the LATE-ATTACH gate (canAttachDeedLate). That affordance opens
// the صك dialog in FILE-ONLY mode for the CLERICAL role — admin_support receives
// the court's paperwork and files it, but may not record the receipt date, which
// starts the objection clock and is a legal act. It deliberately does NOT require
// a receipt date, so admin_support can file the PDF the day it arrives and the
// lawyer records the date afterwards; that ordering is why this cannot simply be
// isAwaitingJudgmentDeedFile.
//
// RENAMED because "postJudgment" described the stage test it no longer performs,
// and a name that lies about its own predicate is how the next reader gets it
// wrong.
export function isJudgmentMissingDeedFile(c: {
  currentStage: string;
  hasJudgmentRecord?: boolean;
  currentJudgmentHasDeed?: boolean;
}): boolean {
  // No ruling → the deed was never recordable → silent. Same positive test the
  // server's deed gate uses since batch 2, so gate and affordance agree exactly.
  if (!c.hasJudgmentRecord) return false;
  // Already closed or archived → the gate no longer applies, and nagging about a
  // document on a finished file is noise. (A case can only BE closed with the
  // deed attached, so in practice this arm only catches pre-gate history.)
  if (isFinishedFile(c.currentStage)) return false;
  // Batch 4 — the CURRENT ruling's own صك; see isAwaitingJudgmentDeedFile.
  return !c.currentJudgmentHasDeed;
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

// ✅ THE CLIENT MIRROR of the server's canCheckInHearing — "تحضير الجلسة".
//
// 🔴 NARROWER THAN isHearingActor ABOVE, and the one difference is the whole
// point: admin_support is EXCLUDED. In the later ringing batches they are an
// escalation AUDIENCE who may acknowledge but may not declare a session
// prepared. Mirroring isHearingActor here would render a تحضير button that the
// server 403s — the visibility != authorization failure this codebase keeps
// paying for. `viewer` is excluded for the same reason (and would be inert
// anyway: viewerWriteGuard blocks every viewer write server-side).
//
// Kept as its OWN function rather than a flag on isHearingActor so that neither
// predicate can be widened by accident while "fixing" the other — the server
// keeps them as two helpers for exactly that reason.
export function canCheckInHearing(
  user: { id: string; role: string; departmentId?: string | null } | null | undefined,
  hearing: { attendingLawyerId?: string | null } | null | undefined,
  parentCase?: { departmentId?: string | null } | null,
): boolean {
  if (!user || !hearing) return false;
  if (user.role === "branch_manager") return true;
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
