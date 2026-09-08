// Delegation-aware CLIENT permission primitives — the browser-side mirror of
// server/acting-context.ts.
//
// WHY THIS EXISTS. The server has resolved delegated authority per request
// since I4a: attachActingContext puts req.actingContext on every authed
// request and ~150 gates expand it through actingIdentitiesFor, so a delegate
// really does hold the delegator's role and department server-side. The CLIENT
// never learned any of it — auth-context computed every permission boolean
// from `user.role` off the JWT — so a delegate of a department_head saw no
// department-head control anywhere and reported having "no delegated
// authority at all". The server was granting it; the UI was never offering it.
//
// 🔴 specific_cases IS EXCLUDED, AND THAT IS THE SERVER'S OWN RULE, NOT A
// SHORTCUT. globalActingRoles (acting-context.ts) applies exactly this narrowing
// to the server's own entity-agnostic gate, with the reasoning that a
// specific_cases delegation "confers role only inside per-entity gates". A
// client permission boolean IS entity-agnostic, and the record-level helpers
// below are deliberately held to the same line rather than re-implementing
// case-id matching in the browser — so client and server agree by construction
// and a specific_cases delegate can never be shown a control the server refuses.
// Nothing is lost for them: their rows still reach the مهامي feed tagged
// onBehalfOfUserId with ownerScope "self", and those actions already work.
//
// ⚠️ consultations_only IS ADMITTED, and it BREAKS that agree-by-construction
// property on purpose (owner ruling, follow-up to a00e4ba). Its enforcement is
// per-REQUEST-PATH on the server, and this file has no request path, so the
// delegator is admitted session-wide and controls over-show outside
// consultations. Full rationale and the three concrete costs are at the skip
// line in buildActingIdentities — read that before changing anything here.
//
// ⚠ THESE HELPERS WIDEN NOTHING ON THEIR OWN. They answer "who does this user
// currently stand for"; each call site decides what that permits. Two classes
// are deliberately NOT routed through here and must never be:
//   • FOUR-EYES internal-review locks — HUMAN-ONLY (routes.ts keeps
//     isInternalReviewerHuman comparing the real actor, "so a delegation can
//     never manufacture a second pair of eyes").
//   • requireRealRole operations — user create / delete / password reset.
// See auth-context.tsx for the permission-boolean allowlist and its rationale.

// One acting identity: the user themself, or a delegator they currently stand
// in for. Mirrors ActingIdentity in server/acting-context.ts field-for-field.
export interface ActingIdentity {
  userId: string;
  role: string;
  departmentId: string | null;
}

// The wire shape of one entry in GET /api/delegations/acting-as. `name` feeds
// the amber banner; role / departmentId / scope are the authority terms.
export interface ActingDelegatorInfo extends ActingIdentity {
  name: string;
  // Batch 28 — TYPE-ONLY widening: the wire now also carries
  // "consultations_only". The filter in buildActingIdentities is UNCHANGED and
  // still admits all_cases alone, so a consultations_only delegator is skipped
  // client-side (see the note there). This union is widened only so the
  // interface stops contradicting what the endpoint actually sends.
  scope: "all_cases" | "specific_cases" | "consultations_only";
}

export interface ActingAsResponse {
  delegators: ActingDelegatorInfo[];
}

// The single query key for the acting-as read, exported so the banner and the
// auth context share ONE cache entry instead of issuing two identical requests.
export const ACTING_AS_QUERY_KEY = "/api/delegations/acting-as";

// The identity set the client reasons about: SELF first, then every all_cases
// or consultations_only delegator. Mirrors actingIdentitiesFor(ctx, null) on the
// server — precisely the caseId-less call the consultation/contract gates make,
// and which by that function's own rule admits exactly these two scopes and
// skips specific_cases.
//
// SELF IS ALWAYS PRESENT AND ALWAYS FIRST, which is what makes every helper
// below a strict superset of the pre-delegation behaviour: with no active
// delegation the array is exactly [self], so each helper collapses to the
// original `user.role === …` / `user.departmentId === …` test.
export function buildActingIdentities(
  user: { id: string; role: string; departmentId?: string | null } | null | undefined,
  delegators: ActingDelegatorInfo[] | undefined,
): ActingIdentity[] {
  if (!user) return [];
  const out: ActingIdentity[] = [
    { userId: user.id, role: user.role, departmentId: user.departmentId ?? null },
  ];
  for (const d of delegators ?? []) {
    // 🔴 ADMIT all_cases AND consultations_only — NOT "admit everything".
    // specific_cases is still skipped, for the reason the header gives: it
    // confers role only inside per-entity gates, and re-implementing case-id
    // matching in the browser is what this file exists to avoid.
    //
    // ⚠️ KNOWN, OWNER-ACCEPTED DIVERGENCE FROM "visibility == authorization".
    // consultations_only is enforced SERVER-side by request path
    // (pathAllowsConsultationScope, server/acting-context.ts). This function has
    // no request path — it produces ONE identity set for the whole session — so
    // admitting the delegator here also widens the cases, memos and contracts
    // pages, where the server will refuse. That is deliberate and temporary: the
    // alternative was leaving the scope invisible on the consultation pages it
    // exists to enable. The real fix is per-entity client identities (the
    // 12-destructuring-site job in the full entity-type-scope plan); until then
    // this file intentionally over-shows.
    //
    // WHAT OVER-SHOWING COSTS, precisely — two of the three are benign, one is not:
    //  1. USUALLY a visible Arabic 403 toast (extractApiError). Annoying, not
    //     destructive: no data loss, and the refusal is legible.
    //  2. 🔴 IF THE DELEGATE'S OWN ROLE ALREADY PERMITS THE ACTION, NO 403
    //     FIRES. They act in their OWN name believing they act for the
    //     delegator, while actorDisplayName correctly stamps only their own name
    //     (the server dropped the delegator, so there is no "نيابةً عن" to add).
    //     Low probability, but it is the one case where over-showing MISLEADS
    //     rather than merely annoys — the audit trail stays correct while the
    //     actor's understanding of it does not.
    //  3. 🔴 THE REMINDER BUTTON DOES NOT 403 AT ALL. /api/reminders and
    //     /api/notifications are ON the server allow-list (they carry
    //     entityType "consultation"), but the entity is in the BODY, not the
    //     path — so the delegator survives there for a case/memo/contract body
    //     too, and canReferenceRelatedEntity → canModifyCase admits it. A
    //     consultations_only delegate can therefore send a reminder ABOUT a
    //     non-consultation entity on the delegator's authority. Notification-row
    //     only: no read, no write, no workflow action on that entity. This leak
    //     is server-side and predates this line (shipped in a00e4ba); widening
    //     here only makes it reachable by an ordinary click. Fixing it needs an
    //     entity-aware check, not a path one — see the report for a00e4ba.
    if (d.scope !== "all_cases" && d.scope !== "consultations_only") continue;
    out.push({ userId: d.userId, role: d.role, departmentId: d.departmentId ?? null });
  }
  return out;
}

// Every role the actor effectively holds. Mirrors effectiveRolesFor / the
// role half of globalActingRoles.
export function effectiveRolesOf(identities: ActingIdentity[]): Set<string> {
  return new Set(identities.map((i) => i.role));
}

export function hasEffectiveRole(identities: ActingIdentity[], ...roles: string[]): boolean {
  const eff = effectiveRolesOf(identities);
  return roles.some((r) => eff.has(r));
}

// 🔴 THE RECORD-LEVEL DEPARTMENT TEST — the half that role-awareness alone
// does not fix. The client gates all asked `c.departmentId === user.departmentId`,
// i.e. the DELEGATE's own department; the server compares against the
// DELEGATOR's, which travels on the acting identity. A delegate outside the
// delegator's department would otherwise still see nothing even with the role
// widened. Mirrors effectiveDeptHeadDepts in server/acting-context.ts.
//
// 🔴 `!!i.departmentId` IS MANDATORY — the standing rule in this codebase.
// Without it a head whose department is null matches every record whose
// department is also null. `!!recordDepartmentId` guards the same hazard from
// the record side.
export function isDeptHeadFor(
  identities: ActingIdentity[],
  recordDepartmentId: string | null | undefined,
): boolean {
  if (!recordDepartmentId) return false;
  return identities.some(
    (i) => i.role === "department_head"
      && !!i.departmentId
      && i.departmentId === recordDepartmentId,
  );
}

// 🔴 THE WRAPPER FOR THE EXISTING FLAT-PARAM PREDICATES — and it is the SAME
// shape the server uses, deliberately. canModifyConsultation / canModifyContract
// / canModifyCase all keep a single-identity predicate (…Identity) untouched and
// wrap it as `identities.some((u) => predicate(u, entity))`. The consultations,
// contracts and memos pages carry ~30 module-level predicates of the form
// (record, userRole, userId, userDeptId) => boolean. Re-plumbing every one of
// them to take an identities array would be a very large diff over the app's
// most critical logic for no behavioural gain; evaluating each UNCHANGED
// predicate once per identity is exactly equivalent and far easier to verify.
//
// ⚠ userId IS PASSED PER IDENTITY ON PURPOSE. For a delegator identity the
// assignee arms (`record.assignedTo === userId`) then test the DELEGATOR's id,
// so a delegate inherits the delegator's assignments — which is precisely what
// effectiveIdsFor / isAssignedLawyer({ id }) do on the server.
//
// With no delegation `identities` is [self], so this is one call with the
// user's own role/id/department: byte-identical to the original expression.
export function anyIdentity(
  identities: ActingIdentity[],
  predicate: (role: string, userId: string, departmentId: string | null) => boolean,
): boolean {
  return identities.some((i) => predicate(i.role, i.userId, i.departmentId));
}

// The non-boolean siblings of anyIdentity, for the two workflow resolvers that
// answer "which stage may this actor move the record to" rather than yes/no.
// Same rule in both: the actor may do whatever ANY of their identities may.
//
// firstForIdentity — first identity that resolves a target wins. Self is index
// 0, so the user's own authority is always preferred over an inherited one.
export function firstForIdentity<T>(
  identities: ActingIdentity[],
  resolve: (role: string, userId: string, departmentId: string | null) => T | null | undefined,
): T | null {
  for (const i of identities) {
    const value = resolve(i.role, i.userId, i.departmentId);
    if (value) return value;
  }
  return null;
}

// unionForIdentity — the UNION of every identity's targets, de-duplicated and
// kept in self-first order. A union rather than a first-match because these
// lists are rendered as a menu: an inherited identity may legitimately open a
// rollback target the user's own role cannot reach, and hiding it would be the
// same "server allows, client hides" failure this whole change exists to fix.
export function unionForIdentity<T>(
  identities: ActingIdentity[],
  resolve: (role: string, userId: string, departmentId: string | null) => T[],
): T[] {
  const out: T[] = [];
  for (const i of identities) {
    for (const value of resolve(i.role, i.userId, i.departmentId)) {
      if (!out.includes(value)) out.push(value);
    }
  }
  return out;
}

// Convenience for the very common "branch manager, or a head of THIS record's
// department" opener that nearly every case/consultation/contract gate starts
// with. Callers add their own assignee / admin_support arms.
export function isManagerOrDeptHeadFor(
  identities: ActingIdentity[],
  recordDepartmentId: string | null | undefined,
): boolean {
  return hasEffectiveRole(identities, "branch_manager") || isDeptHeadFor(identities, recordDepartmentId);
}

// ✅ THE CLIENT MIRROR of the server's canActOnCaseWorkflowState (routes.ts):
//   branch_manager | admin_support | department_head of the case's OWN department
//   | assigned lawyer (primary | responsible | in assignedLawyers).
//
// HOISTED, NOT WRITTEN. This is cases.tsx's canPauseCase moved here verbatim —
// same three arms, same order, same delegation shape — because a SECOND surface
// now needs it (the pin/unpin controls in the notes tab) and the alternative was a
// second copy of the app's most-repeated permission expression. cases.tsx now
// calls this; its own body is gone rather than duplicated.
//
// 🔴 THE LAWYER ARM GOES THROUGH anyIdentity, NOT user.id. On a delegated identity
// the assignee test must run against the DELEGATOR's id, exactly as the server's
// isAssignedLawyer does over caseActorIdentities — testing only the signed-in id
// would refuse a delegate a control the endpoint accepts. (The two older mirrors
// in case-details-dialog.tsx still test user.id directly; they are untouched here.)
//
// 🔴 !!departmentId on BOTH sides is mandatory — isDeptHeadFor enforces it. Without
// it a head with a null department matches every case with a null department.
export function canActOnCaseWorkflowState(
  identities: ActingIdentity[],
  lawCase: {
    departmentId?: string | null;
    primaryLawyerId?: string | null;
    responsibleLawyerId?: string | null;
    assignedLawyers?: string[] | null;
  } | null | undefined,
): boolean {
  if (!lawCase) return false;
  if (hasEffectiveRole(identities, "branch_manager", "admin_support")) return true;
  if (isDeptHeadFor(identities, lawCase.departmentId)) return true;
  return anyIdentity(identities, (_r, id) =>
    lawCase.primaryLawyerId === id
    || lawCase.responsibleLawyerId === id
    || (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(id)));
}
