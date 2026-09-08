// Unified-tasks Increment 4a — delegation "acting context" machinery.
//
// When a delegation is active+approved+in-window, the delegate stands fully in
// the delegator's place — IDENTITY + ROLE + DEPARTMENT — for that window. This
// module resolves that context once per request and exposes the helpers that
// later sub-steps (4b feed visibility, 4c per-resource act-as) will consult.
//
// 4a adds the machinery ONLY — nothing reads req.actingContext or these helpers
// yet, so behavior is byte-identical to today. The helpers are exported so an
// as-yet-unconsumed export is not flagged by noUnusedLocals; the middleware
// calls getActingContext, giving the resolver a caller.
//
// INVARIANT (privilege-bearing): never cache the ActingContext or any derived
// effective-role/id set beyond the single request — it is resolved fresh from
// the live delegation window so an inherited role/identity lapses automatically
// when the window/status ends. (activeUserCache is isActive-only and orthogonal.)

import type { Request, Response, NextFunction } from "express";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "./db";
import { delegationsTable, users, DelegationScope } from "@shared/schema";
import type { DelegationScopeValue } from "@shared/schema";

export type ActingIdentity = {
  userId: string;
  role: string;
  departmentId: string | null;
};

export type ActingDelegator = ActingIdentity & {
  // Delegator's display name — denormalized here (resolved once per request in
  // getActingContext) so audit writes can stamp "نيابةً عن <name>" synchronously.
  name: string;
  scope: DelegationScopeValue;
  specificCaseIds: string[];
};

export type ActingContext = {
  self: ActingIdentity;
  delegators: ActingDelegator[];
};

// Make req.actingContext available (and typed) on every Express Request, so the
// middleware can attach it and downstream gates (4b/4c) can read it without a
// cast. Optional — undefined for unauthenticated / non-/api requests.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actingContext?: ActingContext;
    }
  }
}

// Resolve the delegations the given user is currently the DELEGATE of, fully
// guarded: status="نشط" AND approvedBy IS NOT NULL (mandatory — a freshly
// created delegation is "نشط" but unapproved) AND startDate ≤ today ≤ endDate
// (full window, never raw status) AND the delegator is still active (INNER JOIN
// users.isActive). One indexed query (delegations.to_user_id). No transitivity:
// keyed on toUserId only, never chaining a delegator's own inbound delegations.
export async function getActingContext(
  user: { id: string; role: string; departmentId: string | null },
): Promise<ActingContext> {
  const today = new Date().toISOString().split("T")[0];
  const rows = await db
    .select({
      fromUserId: delegationsTable.fromUserId,
      scope: delegationsTable.scope,
      specificCaseIds: delegationsTable.specificCaseIds,
      role: users.role,
      departmentId: users.departmentId,
      name: users.name,
    })
    .from(delegationsTable)
    .innerJoin(users, eq(delegationsTable.fromUserId, users.id))
    .where(
      and(
        eq(delegationsTable.toUserId, user.id),
        eq(delegationsTable.status, "نشط"),
        isNotNull(delegationsTable.approvedBy),
        lte(delegationsTable.startDate, today),
        gte(delegationsTable.endDate, today),
        eq(users.isActive, true),
      ),
    );

  const delegators: ActingDelegator[] = rows.map((r) => ({
    userId: r.fromUserId,
    role: r.role,
    departmentId: r.departmentId ?? null,
    name: r.name || r.fromUserId,
    // Unknown values still normalise to all_cases — UNCHANGED from before this
    // batch, and deliberately not "fixed" here: that coercion is what every
    // existing row depends on, and inverting it is a behaviour change nobody
    // asked for. consultations_only is added as a RECOGNISED value; it does not
    // touch the fallback. (⚠ The consequence is that a MISTYPED scope is a
    // blanket delegation, not a refused one — see the report; PATCH
    // /api/delegations/:id still accepts a free-string scope.)
    scope: r.scope === DelegationScope.SPECIFIC_CASES
      ? DelegationScope.SPECIFIC_CASES
      : r.scope === DelegationScope.CONSULTATIONS_ONLY
        ? DelegationScope.CONSULTATIONS_ONLY
        : DelegationScope.ALL_CASES,
    specificCaseIds: Array.isArray(r.specificCaseIds) ? (r.specificCaseIds as string[]) : [],
  }));

  return {
    self: { userId: user.id, role: user.role, departmentId: user.departmentId ?? null },
    delegators,
  };
}

// 🔴 THE ONE CASE-SET RULE, extracted so actingIdentitiesFor and
// actorDisplayName cannot drift apart (they carried two copies of it).
//
// specific_cases is the ONLY scope that restricts by CASE SET. Written as a
// skip-if rather than the previous allow-if so that a scope which is neither
// all_cases nor specific_cases still applies here: consultations_only is
// restricted by PATH in attachActingContext, upstream of every call to this
// function, so a delegator carrying it is only ever present on an allowed path
// and must NOT be filtered a second time on a case-set rule that does not
// describe it. Leaving the old allow-if in place would have dropped it here and
// silently granted nothing anywhere.
//
// PARITY: identical truth table to the previous expression for all_cases
// (always applies) and specific_cases (applies iff caseId is in the list).
function delegatorAppliesToEntity(d: ActingDelegator, caseId: string | null): boolean {
  if (d.scope === DelegationScope.SPECIFIC_CASES) {
    return caseId != null && d.specificCaseIds.includes(caseId);
  }
  return true;
}

// The acting identities that apply to a given entity. self always applies; an
// all_cases (or consultations_only — see delegatorAppliesToEntity) delegator
// always applies; a specific_cases delegator applies ONLY when the entity's
// caseId is in its specificCaseIds (so non-case entities, caseId=null, are
// never reached by a specific_cases delegation).
export function actingIdentitiesFor(ctx: ActingContext, caseId: string | null): ActingIdentity[] {
  const out: ActingIdentity[] = [ctx.self];
  for (const d of ctx.delegators) {
    if (delegatorAppliesToEntity(d, caseId)) {
      out.push({ userId: d.userId, role: d.role, departmentId: d.departmentId });
    }
  }
  return out;
}

// Item-5 Phase 1 — the actor's DISPLAY NAME for an audit/activity write. When
// the action falls within one or more active delegations that apply to this
// entity (same all_cases / specific_cases rule as actingIdentitiesFor), returns
// "مها الزهراني (نيابةً عن سارة الدوسري)"; with no applicable delegation returns
// selfName unchanged — byte-identical to a non-delegated write. Over-stamps by
// design: if the delegate ALSO had their own access, we still note the
// delegation (fail-safe for an audit trail). ctx is optional so call sites can
// pass req.actingContext directly (undefined on non-/api or unauth requests).
export function actorDisplayName(ctx: ActingContext | undefined, caseId: string | null, selfName: string): string {
  if (!ctx || ctx.delegators.length === 0) return selfName;
  const applicable = ctx.delegators.filter((d) => delegatorAppliesToEntity(d, caseId));
  if (applicable.length === 0) return selfName;
  return `${selfName} (نيابةً عن ${applicable.map((d) => d.name).join("، ")})`;
}

// Identity expansion: the set of user ids the actor may stand in for on this entity.
export function effectiveIdsFor(ctx: ActingContext, caseId: string | null): Set<string> {
  return new Set(actingIdentitiesFor(ctx, caseId).map((i) => i.userId));
}

// Role expansion for this entity.
export function effectiveRolesFor(ctx: ActingContext, caseId: string | null): Set<string> {
  return new Set(actingIdentitiesFor(ctx, caseId).map((i) => i.role));
}

export function hasEffectiveRole(ctx: ActingContext, caseId: string | null, ...roles: string[]): boolean {
  const eff = effectiveRolesFor(ctx, caseId);
  return roles.some((r) => eff.has(r));
}

// Departments for which the actor holds department_head authority on this entity
// (the delegator's OWN department travels with the inherited dept_head role, so
// M4 dept-scoping resolves against it).
export function effectiveDeptHeadDepts(ctx: ActingContext, caseId: string | null): Set<string> {
  const out = new Set<string>();
  for (const i of actingIdentitiesFor(ctx, caseId)) {
    if (i.role === "department_head" && i.departmentId) out.add(i.departmentId);
  }
  return out;
}

// Entity-agnostic role set for requireRole. Specific_cases delegations confer
// role only inside per-entity gates, NOT here — so a specific_cases delegate
// never widens a global, entity-agnostic requireRole gate.
export function globalActingRoles(ctx: ActingContext): Set<string> {
  const out = new Set<string>([ctx.self.role]);
  for (const d of ctx.delegators) {
    // Same rule as delegatorAppliesToEntity with a null caseId: specific_cases
    // confers role only inside per-entity gates and never here; all_cases and
    // consultations_only both do. consultations_only reaching this point means
    // the request is already on an allowed path, so it is correct for it to
    // satisfy the entity-agnostic requireRole gates that live on those paths
    // (DELETE /api/consultations/:id is one; the delegation approve/reject
    // gates are NOT, because they are not on the allow-list).
    if (delegatorAppliesToEntity(d, null)) out.add(d.role);
  }
  return out;
}

// ==================== consultations_only PATH ALLOW-LIST (batch 28) ====================
// The whole enforcement mechanism for DelegationScope.CONSULTATIONS_ONLY. A
// delegator carrying that scope contributes its identity ONLY on these paths;
// everywhere else it is dropped from ctx.delegators before any handler runs, so
// all ~120 downstream gates see "no delegation" and fall back to the real user.
//
// Same shape and same chain position as viewerWriteGuard (server/index.ts) —
// one place that cannot be forgotten when a route is added — with the opposite
// default: a path not listed here grants NOTHING, so a new consultation route
// fails CLOSED (invisible to the delegate) rather than open. That is the safe
// direction to be wrong in, and the reason this is an allow-list.
const CONSULTATION_SCOPE_PREFIX = "/api/consultations";

// Paths OUTSIDE the consultations prefix that a consultations-scoped delegate
// legitimately needs. Exact matches, never prefixes — /api/delegations is
// deliberately NOT opened wholesale, because POST /api/delegations/:id/approve
// is a requireRole gate that globalActingRoles expands, and a delegate must not
// inherit the authority to approve delegations.
const CONSULTATION_SCOPE_ALLOWED_EXACT: ReadonlySet<string> = new Set([
  // 🔴 MANDATORY. This endpoint reads req.actingContext to tell the CLIENT it is
  // acting for anyone. Drop the delegator here and it returns an empty list, the
  // acting-as banner never renders, and every delegated control disappears —
  // including on the consultation pages this scope exists to enable.
  "/api/delegations/acting-as",
  // The مهامي feed — where the delegate actually works. getMyTasks reads
  // ctx.delegators directly; without this the delegator's consultation rows
  // never surface and the scope is cosmetic.
  "/api/my-tasks",
  // Both accept entityType/relatedType "consultation" and gate on the
  // delegation-aware canReferenceRelatedEntity.
  "/api/reminders",
  "/api/notifications",
]);

// 🔴 EXCLUDED FROM THE PREFIX — owner ruling. POST /api/consultations/:id/
// convert-to-case sits INSIDE /api/consultations, so a prefix match alone
// would allow it, and it CREATES A CASE. Matched as a whole terminal path
// SEGMENT (leading "/"), not a substring and not a regex: an :id cannot contain
// "/", and this is the only one of the 225 routes whose path ends with it.
const CONSULTATION_SCOPE_DENIED_SUFFIXES: readonly string[] = ["/convert-to-case"];

// 🔴 NORMALISED BEFORE MATCHING, and this is load-bearing, not tidiness.
// This app sets neither "strict routing" nor "case sensitive routing", so
// Express's defaults route /API/Consultations/x/Convert-To-Case/ to exactly the
// same handler as the canonical path. A raw startsWith/endsWith comparison would
// miss that and let the denied route through — failing OPEN, the one direction
// this design must never fail in. Lowercase + strip trailing slashes first.
function normalizeRequestPath(path: string): string {
  const lowered = path.toLowerCase();
  const trimmed = lowered.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

// Whether a consultations_only delegation contributes its identity on this path.
// Exported for testability; the middleware below is its only caller today.
export function pathAllowsConsultationScope(path: string): boolean {
  const p = normalizeRequestPath(path);
  if (CONSULTATION_SCOPE_ALLOWED_EXACT.has(p)) return true;
  // Segment-boundary prefix match — `p === prefix || p.startsWith(prefix + "/")`
  // rather than a bare startsWith, so a future "/api/consultations-archive"
  // route is NOT swept in by accident.
  if (p === CONSULTATION_SCOPE_PREFIX || p.startsWith(`${CONSULTATION_SCOPE_PREFIX}/`)) {
    return !CONSULTATION_SCOPE_DENIED_SUFFIXES.some((suffix) => p.endsWith(suffix));
  }
  return false;
}

// Drop every delegator whose scope does not reach this request's path.
//
// 🔴 WHY all_cases AND specific_cases CANNOT BE AFFECTED: the filter's predicate
// is `scope !== CONSULTATIONS_ONLY || pathAllows(...)`. For any other scope the
// first term is already true, so the path is never consulted and the delegator
// is always kept — the returned array is reference-identical in content to the
// input. A delegation that is not consultations_only behaves exactly as it did
// before this batch, on every path, by short-circuit.
function filterDelegatorsForPath(delegators: ActingDelegator[], path: string): ActingDelegator[] {
  if (!delegators.some((d) => d.scope === DelegationScope.CONSULTATIONS_ONLY)) return delegators;
  const allowed = pathAllowsConsultationScope(path);
  return delegators.filter((d) => d.scope !== DelegationScope.CONSULTATIONS_ONLY || allowed);
}

// Express middleware — mounted right after the auth middleware. Resolves the
// acting context once per request and attaches it to req. Fail-safe: if the
// resolve throws, it logs and continues with no context (today's behavior),
// never blocking the request.
export async function attachActingContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string; role: string; departmentId: string | null } }).user;
    if (user?.id) {
      const ctx = await getActingContext(user);
      // Batch 28 — apply the scope's path allow-list HERE, before any handler
      // runs, so no gate has to know the scope exists. A dropped delegator is
      // indistinguishable downstream from having no delegation at all.
      req.actingContext = {
        self: ctx.self,
        delegators: filterDelegatorsForPath(ctx.delegators, req.path),
      };
    }
  } catch (err) {
    console.error("[attachActingContext] failed to resolve delegation context", err);
  }
  next();
}
