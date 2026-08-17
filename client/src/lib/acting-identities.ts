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
// 🔴 all_cases ONLY, AND THAT IS THE SERVER'S OWN RULE, NOT A SHORTCUT.
// globalActingRoles (acting-context.ts) applies exactly this narrowing to the
// server's own entity-agnostic gate, with the reasoning that a specific_cases
// delegation "confers role only inside per-entity gates". A client permission
// boolean IS entity-agnostic, and the record-level helpers below are
// deliberately held to the same line rather than re-implementing case-id
// matching in the browser — so client and server agree by construction and a
// specific_cases delegate can never be shown a control the server refuses.
// Nothing is lost for them: their rows still reach the مهامي feed tagged
// onBehalfOfUserId with ownerScope "self", and those actions already work.
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
  scope: "all_cases" | "specific_cases";
}

export interface ActingAsResponse {
  delegators: ActingDelegatorInfo[];
}

// The single query key for the acting-as read, exported so the banner and the
// auth context share ONE cache entry instead of issuing two identical requests.
export const ACTING_AS_QUERY_KEY = "/api/delegations/acting-as";

// The identity set the client reasons about: SELF first, then every all_cases
// delegator. Mirrors actingIdentitiesFor(ctx, null) on the server — which is
// precisely the caseId-less call the consultation/contract gates already make,
// and which by that function's own rule admits all_cases delegations only.
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
    if (d.scope !== "all_cases") continue;
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
