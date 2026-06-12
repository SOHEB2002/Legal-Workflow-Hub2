---
name: build-standards
description: Coding standards for Legal Workflow Hub 2, distilled from the full-codebase audit (520+ casts removed, 11 real bugs found). MUST be used whenever writing or modifying ANY code in this repo — new features, endpoints, components, bug fixes, refactors, or "quick tweaks". Trigger on any request to add, build, implement, change, or fix functionality, even small ones. Not needed for read-only investigation.
---

# Build Standards — Legal Workflow Hub 2

Write code that passes the audit it will eventually get. Every rule below was paid for by a real bug or a real cleanup batch; none are theoretical.

## 1. Type discipline — no new debt
- NEVER write blanket `as any`. The legitimate alternatives:
  - Value/union mismatch → fix the type at the ROOT (e.g. `role: UserRoleType` — the Phase 2 root-fix pattern), not a cast at the use site.
  - Map/index lookups → type the map: `as Record<string, string>`.
  - Transient API fields not on the entity → `as Partial<Entity> & { field?: T }`.
  - Allowed keeps ONLY: `catch (e: any)` error narrowing, multer `req.file`.
- Before accessing a field, VERIFY it exists on the interface in shared/schema.ts. Never assume sibling tables match (memos.assigned_to is NOT NULL while consultations.assigned_to is nullable — that mismatch hid a silent production bug for months).
- If tsc complains, the type is wrong somewhere — find the root; never silence it.

## 2. Schema & data layer
- Schema changes are ADDITIVE ONLY: new nullable columns OK. Anything needing a migration (NOT NULL, drops, renames, type changes) = STOP and ask the user.
- Timestamps: Drizzle columns are date-mode (Date), domain interfaces are ISO strings. The conversion lives in the STORAGE layer via the closedAt idiom: destructure timestamp fields, `field ? new Date(field) : null`; routes pass `.toISOString()`. Never cast a Date into a payload.
- Inserts into tables with notNull-without-default columns: the storage signature must guarantee them — `Partial<X> & Pick<X, "req1" | "req2">` (the createSupportTicket lesson). Never let a spread mask required columns.
- Sentinels: memo unassignment writes `""` (never null); canonical lawyer resolution is `primaryLawyerId || responsibleLawyerId || ""`.

## 3. Server patterns
- New mutating endpoints: validate req.body with a TOLERANT zod schema (reject invalid/missing-required, allow unknown extras), return 400 with an Arabic error matching the existing validated routes' style.
- Never swallow errors: every catch must log, rethrow, or explicitly handle. The memo-transfer bug lived inside a silent catch.
- The per-resource workflow handlers (cases/consultations/contracts/memos) are deliberately NOT DRYed (documented declined decision 2E). When adding workflow behavior, follow the sibling resource's pattern verbatim; do not invent a shared abstraction.
- Permission logic is NEVER changed as part of a feature unless explicitly approved — auth is its own deliberate pass (Phase 5).
- Authenticated routes use AuthRequest; req.user is { id, role: UserRoleType, name, departmentId }.

## 4. Client patterns
- ALL API calls go through apiRequest / established hooks. Token refresh ONLY via queryClient's single-flight refreshAuthToken — NEVER hand-roll fetch+refresh (the multipart race bug). Multipart: raw fetch allowed for the FormData call itself, but its 401/403 retry must use refreshAuthToken.
- New UI must work RTL and stay PWA/Capacitor-compatible.
- BiDi: Arabic string order can RENDER reversed in diffs/editors — verify actual bytes before "fixing" Arabic literals.
- Reuse existing systems: notifications via the notifications context/endpoints, history via the activity log. No parallel mechanisms.

## 5. Pre-commit gates (every commit)
1. `npx tsc --noEmit` → 0
2. `npx tsc --noEmit --noUnusedLocals` → 0 (project is clean; keep it so)
3. `git diff | grep "^+" | grep "as any"` → only the allowed forms above
4. package.json changed → `npm run build` must pass
5. Any behavior change was explicitly approved BEFORE coding; the commit message documents it

## 6. When unsure
Ambiguous, schema-touching, permission-touching, or beyond approved scope → STOP and report (per CLAUDE.md operating mode). A stopped batch costs minutes; a wrong assumption costs a production bug.
