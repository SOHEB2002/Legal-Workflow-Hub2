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
import { delegationsTable, users } from "@shared/schema";

export type ActingIdentity = {
  userId: string;
  role: string;
  departmentId: string | null;
};

export type ActingDelegator = ActingIdentity & {
  // Delegator's display name — denormalized here (resolved once per request in
  // getActingContext) so audit writes can stamp "نيابةً عن <name>" synchronously.
  name: string;
  scope: "all_cases" | "specific_cases";
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
    scope: r.scope === "specific_cases" ? "specific_cases" : "all_cases",
    specificCaseIds: Array.isArray(r.specificCaseIds) ? (r.specificCaseIds as string[]) : [],
  }));

  return {
    self: { userId: user.id, role: user.role, departmentId: user.departmentId ?? null },
    delegators,
  };
}

// The acting identities that apply to a given entity. self always applies;
// an all_cases delegator always applies; a specific_cases delegator applies
// ONLY when the entity's caseId is in its specificCaseIds (so non-case entities,
// caseId=null, are reached only by all_cases delegations).
export function actingIdentitiesFor(ctx: ActingContext, caseId: string | null): ActingIdentity[] {
  const out: ActingIdentity[] = [ctx.self];
  for (const d of ctx.delegators) {
    if (
      d.scope === "all_cases" ||
      (d.scope === "specific_cases" && caseId != null && d.specificCaseIds.includes(caseId))
    ) {
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
  const applicable = ctx.delegators.filter(
    (d) => d.scope === "all_cases" || (caseId != null && d.specificCaseIds.includes(caseId)),
  );
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
    if (d.scope === "all_cases") out.add(d.role);
  }
  return out;
}

// Express middleware — mounted right after the auth middleware. Resolves the
// acting context once per request and attaches it to req. Fail-safe: if the
// resolve throws, it logs and continues with no context (today's behavior),
// never blocking the request.
export async function attachActingContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string; role: string; departmentId: string | null } }).user;
    if (user?.id) {
      req.actingContext = await getActingContext(user);
    }
  } catch (err) {
    console.error("[attachActingContext] failed to resolve delegation context", err);
  }
  next();
}
