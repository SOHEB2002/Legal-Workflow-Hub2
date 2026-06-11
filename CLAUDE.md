# Project: Legal Workflow Hub 2 (oun-law.com)

## What this is
Saudi law firm workflow platform (Arabic RTL UI). Production on a Replit Reserved VM at oun-law.com.
Stack: TypeScript + React + Tailwind + Shadcn/UI (frontend), Node/Express (backend), PostgreSQL (Neon) + Drizzle ORM, JWT + CSRF auth. GitHub: SOHEB2002/Legal-Workflow-Hub2.
10 roles across 4 departments. All future changes must stay mobile-app-compatible (PWA + Capacitor).

## CRITICAL — Two databases
- Workspace `$DATABASE_URL` = DEVELOPMENT (heliumdb).
- PRODUCTION is separate (neondb) — NEVER touch without explicit user approval.
- Replit Republish diffs dev-DB vs prod-DB schemas and can generate DESTRUCTIVE migrations if they drift. Dev/prod schema drift caused a near-miss `DROP COLUMN follow_up_count` incident.
- NEVER suggest "Copy database to production".
- Schema changes: **ADDITIVE ONLY** — new nullable columns OK; widening a TS type to match an already-nullable column OK; anything needing a migration = STOP and ask. (Schema-rule reflex from replit.md: never delete/reset/modify existing data.)

## CRITICAL — Operational rules
- **NEVER run `npm run dev`** — burns Replit credits (caused a real $72 overage). `npx tsc --noEmit` / `npm run check` are fine and are the standard gate.
- PowerShell 5.1: single-quoted here-strings break on embedded quotes/backticks → **ALWAYS `git commit -F <msgfile>`** (write temp file under `.git/`, commit, delete).
- Files have CRLF line endings — scripts must tolerate trailing `\r`.
- BiDi rendering reverses Arabic char order in diff viewers — verify actual bytes before "fixing" Arabic string order.
- Always show diff + verification before pushing.
- Deploys happen from the **Replit Shell** (merge feature → main, `--no-ff`), NOT from this machine. Replit appends empty "Published your App" checkpoints to main after each publish — feature will show "diverged" from main; this is benign, ignore it.

## Workflow & division of labor
- The user (Soheb) is non-technical, Arabic-speaking. He relays prompts from a planning Claude session; reports go back to that session for review.
- Branch: **`feature/consultations-audit`** (long-running audit branch). Never commit to main from here.
- **Operating mode — "investigate-and-apply-if-routine" (since Phase 2):**
  - For batches on the PROVEN pipeline (cast cleanup, type-only, mechanical): investigate → if all findings are within the proven pattern (vestigial drops, precise narrowings, tsc stays 0, zero behavior change, zero schema change) → APPLY, COMMIT, PUSH directly, then report.
  - **MUST STOP and report WITHOUT applying** if ANY of: a new bug discovered; anything touching `shared/schema.ts` beyond additive type-widening of already-nullable columns; any behavior change; any permission-logic change; anything needing a DB migration; any ambiguous judgment call.
  - Deploys to production are ALWAYS user-driven — never merge to main or advise Republish without explicit instruction.

## The proven cast-cleanup pipeline
1. **Inventory:** grep counts + categorize (VESTIGIAL / TYPE_MISMATCH / FIELD_NOT_ON_TYPE / MAP_INDEX / LEGITIMATE).
2. **Controlled experiment:** strip casts → `npx tsc --noEmit` → capture surfaced errors → revert.
3. Vestigial (no error) → delete. Value mismatch → precise type (`as ProperUnion`). Map-index → `as Record<string,string>`. Field-not-on-type → **DIAGNOSE** (could be a bug — e.g. the `assigned_to` NOT NULL finding). Legitimate (`catch (e: any)`, multer `req.file`, raw JSON `any[]`) → keep.
4. NEVER re-add blanket `as any`. NEVER relocate a cast to silence an error.
5. **Gates before commit:** tsc = 0; grep verification counts; `git diff | grep "^+" | grep "as any"` shows only precise casts; behavior unchanged.
6. Commit messages document findings (root fixes like `role: UserRoleType`, `PriorityType`) so diffs self-explain.
- **Vestigial-cast philosophy:** ~90% of `as any` is stale residue from the additive-only schema — `LawCase` (and sibling interfaces) already have the fields the casts strip (`isArchived`, `clientRole`, `grievanceRequired`, najiz/mohr/taradi fields, etc.). Removing them INCREASES safety by re-enabling typo detection. Verify each field against the relevant `shared/schema.ts` interface before removing.
- **Transient-API-field pattern:** request-body fields that are NOT entity columns (e.g. `startingStage`, `stageChangeNotes`) use `as Partial<LawCase> & { field?: T }`, NOT `as any`.

## Type & permission rules
- Permission logic must NEVER change in cleanup batches (type-only). Phase 5 handles auth/permissions deliberately.
- `AuthRequest.user = { id, role: UserRoleType, name, departmentId }` — populated by authMiddleware/requireAuth.
- Known deferred items live in the memory files (assigned_to NOT NULL bug, Date-mode timestamp casts, etc.) — check memories before re-investigating.

## Key files
- `server/routes.ts` — all API endpoints (~3200+ lines).
- `server/storage.ts` — `DatabaseStorage` class, all DB ops (~4,489 LOC, ~122 `as any` — next major target).
- `shared/schema.ts` — Drizzle tables, Zod schemas, TS interfaces (`LawCase` ~2017-2096).
- `server/auth.ts` — JWT + CSRF. `server/scheduler.ts` — background jobs.
- `queryClient.ts` — `getAuthHeaders`, single-flight `refreshAuthToken`, `apiRequest` (the unified read path). `lib/utils.ts` — `extractApiError`.

## Known open bug (needs product decision — NOT a mechanical fix)
- **memo `assigned_to` NOT NULL silent failure:** on department-transfer, the handler unassigns active memos via `updateMemo(id, { assignedTo: null })`, but `memos.assigned_to` is `.notNull()` → Postgres throws → surrounding `try/catch` swallows it → memos silently stay assigned to the old lawyer. Flagged inline `FIXME(2D-defer)` at `routes.ts` ~2174; cast KEPT (widening the type would misrepresent the column and still throw). Fix = migrate column to nullable (dev+prod) OR reassign to a sentinel/dept-head. (Note: *consultations*.assigned_to IS nullable — source of the original mis-read.) Resolve in the storage.ts audit.

## Current state (update this section as work progresses)
- **Phase 0 + 1 (frontend):** complete, deployed. Frontend casts → 0: cases 107→7 (7 intentional/tracked), consultations→0, hearings→0, notifications→0 (root-fixed via `NotificationResponse` widening in schema.ts). Batch 3 cleared all 17 TS errors → **tsc-0 baseline (regression check: must stay 0)**.
- **Phase 2 (routes.ts):** complete, deployed (2A-2C merged to main via `--no-ff`). 282→20 casts = 17 permanent (15 `catch`/`error as any` + 2 multer `req.file`) + 3 documented deferred.
- **Deferred / pending:**
  - assigned_to NOT NULL bug (above) — product decision needed.
  - 2 Date-mode timestamp casts: `followUpStartedAt` / `expectedDeliveryDate` (routes.ts ~3292/~3299) — Date passed to Drizzle Date-mode column; real fix is storage-layer `toISOString` conversion (mirror closedAt). Flagged inline `// Date-mode cast:`.
  - 2D' validation hardening (big), 2E workflow dedup (likely decline).
  - **storage.ts audit** — next major target; owns the real fix for all 3 deferred items.
  - Phase 6 dead-code sweep: dead `deleteUser` methods, unused `CourtType` import (`hearings.tsx:86`), `contracts.tsx:551` multipart refresh race, `auth-context.tsx:57` fetchUsersFromAPI migration.
- **Explicitly DECLINED (not deferred):** `useCasesFilter` hook extraction — revisit only if a test suite is adopted. cases.tsx structural-extraction work ended at Batch 4B.
