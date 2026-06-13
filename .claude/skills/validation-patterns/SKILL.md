---
name: validation-patterns
description: The proven request-validation method for Legal Workflow Hub 2, extracted from the shipped 2D' V1 batch (13 Tier-1 routes, commits c9904ed + bf94a75, zero breakage). MUST be used whenever adding zod validation to routes, hardening existing endpoints, executing the 2D' V2/V3 batches, or creating ANY new mutating endpoint — the FE-contract enumeration and tolerant-schema rules here are what keep the live frontend unbroken.
---

# Validation Patterns — Legal Workflow Hub 2

Extracted from the real 2D' V1 work (V1a `c9904ed`, V1b `bf94a75`), not theory. The core promise of this method: **a schema must accept 100% of what the current frontend actually sends** — validation rejects garbage, never legitimate traffic.

## 1. Pattern choice — A (gate) vs B (parse-and-use)

**Pattern B — parse-and-use** (the existing 20-route convention): `const { x, y } = schema.parse(req.body)` inside the try; use the parsed values. For handlers that **destructure a few specific fields** and pass them individually (change-password, reset-password, DELETE users/:id).

**Pattern A — safeParse gate**: validate, 400 on failure, then **keep using `req.body` exactly as before**:
```ts
const bodyCheck = updateXSchema.safeParse(req.body);
if (!bodyCheck.success) {
  return res.status(400).json({ error: bodyCheck.error.errors });
}
// ... handler continues reading/mutating req.body, untouched
```
Use Pattern A when ANY of:
- The handler **passes `req.body` (or a spread of it) wholesale** to storage (the mega-PATCHes: cases/consultations/contracts/hearings/notifications/delegations).
- The handler **mutates `req.body` after validation** (PATCH cases/:id sets primaryLawyerId/stageHistory/etc. downstream).
- **The storage-signature criterion** (what moved POST /api/notifications and POST /api/delegations from B to A in V1): zod's `.passthrough()` output carries an unknown-index signature; passing it into a typed storage signature (`createNotification`, `createDelegation`) forces retyping the storage layer. The gate validates identically while the storage call stays byte-identical. If parse-and-use would make you touch storage types, use the gate.

Never let either pattern change handler logic. Existing manual checks may stay even when redundant with the schema (convert-to-case kept its manual required-field checks).

## 2. Tolerant-schema rules (all of them, every schema)

- **`.passthrough()` always; never `.strict()`** — unknown extras must flow through (FE spreads like `...notificationData` send fields you didn't enumerate). Default zod stripping is also wrong for gate schemas: a future refactor to parsed output would silently start dropping fields.
- **Acceptance over coercion** — the FE sends proper JSON types via apiRequest (verified in V1: booleans are booleans, numbers are numbers). Don't `z.coerce`; if a field could vary, accept with `z.union([z.string(), z.number()])`. Transformation is a behavior change, acceptance isn't.
- **Required only where the handler already breaks without it** — e.g. change-password required both fields because `comparePassword(undefined)` 500'd before; the schema turns that into a clean Arabic 400. Everything else `.optional()`.
- **Nullability mirrored from the entity interface** in shared/schema.ts — `assignedTo: z.string().nullable().optional()` because `Contract.assignedTo: string | null`; `departmentId` not nullable because the interface says `string`. Never guess: read the interface.
- **No enum narrowing on update schemas** — stage/status/priority stay `z.string()`; legacy rows hold values outside today's unions (the consultationType lesson) and stage values are validated by `validateStageTransition` anyway. (Create schemas MAY enum where an existing insert schema already does — insertDelegationSchema's reason enum was kept because the FE Select only emits those 5 values.)
- **Transient request-only fields get typed too** when the handler reads them (updateCaseSchema includes transferReason/stageChangeNotes/judgmentType/judgmentFinal/needsAppeal — none are LawCase columns).
- **Derive, don't duplicate**: if an insert schema exists and the route injects a field server-side, omit it — `insertDelegationBodySchema = insertDelegationSchema.omit({ fromUserId: true }).passthrough()`.
- Arabic messages inside the schema (`z.string().min(1, "كلمة المرور الجديدة مطلوبة")`); error response is the existing convention: `res.status(400).json({ error: <zod errors array> })` (`error.errors` in catch for Pattern B, `parsed.error.errors` for Pattern A).

## 3. FE-contract enumeration (do this BEFORE wiring, per route)

1. Grep client/src for every call site of the route (`"PATCH", \`/api/x/`, `"POST", "/api/x"` — and check context-wrapper functions like updateCase/updateContract, whose callers all funnel through one typed signature).
2. Build the **union of every field each site sends**, with its TS type. Spread sites (`...data`) are typed `Partial<Entity>` — mirror the interface for those.
3. Required-field proof: a field may be schema-required only if EVERY call site provably sends it (POST notifications: type/title/message/recipientId present at all 9 sites).
4. Check the FE's own submit gating (delegations dialog disables submit on empty toUserId/startDate/endDate → `min(1)` is safe).
5. **Routes with zero FE callers exist** (reset-password, emergency-reset) — validate them anyway; note "no FE callers" as the contract.
6. Verify suspicious grep output at byte level before acting (BiDi/display artifacts — the `\api\users\` false alarm).

## 4. Gate placement

Insert the gate **immediately before the handler's first `req.body` read**, after all existing 404/403/role/stage pre-checks — every existing error response keeps its exact order; only type-garbage (which the FE never sends) sees a new 400.

**Security-ordering exception** (the emergency-reset pattern): when a handler has a secret/permission check that must not leak validation detail, that check stays FIRST and the schema only covers the remaining fields (emergencyResetSchema validates `username` only; bad-secret responses stay byte-identical 403s).

## 5. Per-commit gates

1. `npx tsc --noEmit` → 0
2. `npx tsc --noEmit --noUnusedLocals` → 0 (import only the schemas this commit wires — unused imports fail the gate)
3. `git diff | grep "^+" | grep "as any"` → 0
4. Grep-count the gates you added (e.g. `grep -c "bodyCheck" server/routes.ts`) and match against the plan
5. Zero handler-logic changes in Pattern-A routes; commit message lists each route, its schema, and any judgment call

## 6. Scope discipline

Validation batches NEVER fix permission gaps they expose — log them to the phase5-auth-backlog memory and gate types only (the PATCH notifications field-allowlist precedent: found in 2D', deferred to Phase 5 by explicit decision). Anything ambiguous in a route's FE contract → STOP on that route, report, continue with the rest.
