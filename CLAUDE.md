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

## Resolved bug (history — see Phase-3 3E)
- **memo `assigned_to` NOT NULL silent failure — FIXED (commit fa45c6f):** dept-transfer used to write `assignedTo: null` to the NOT NULL column; Postgres threw, the try/catch swallowed it, memos silently stayed with the old lawyer. Now writes `""` (the unassigned sentinel); the primaryLawyerId-change cascade re-points memos when the new dept assigns a lawyer. (Note: *consultations*.assigned_to IS nullable — source of the original mis-read.)

## Current state (update this section as work progresses)
- **Phase 0 + 1 (frontend):** complete, deployed. Frontend casts → 0: cases 107→7 (7 intentional/tracked), consultations→0, hearings→0, notifications→0 (root-fixed via `NotificationResponse` widening in schema.ts). Batch 3 cleared all 17 TS errors → **tsc-0 baseline (regression check: must stay 0)**.
- **Phase 2 (routes.ts):** complete, deployed (2A-2C merged to main via `--no-ff`). 282→~17 casts = permanent (`catch`/`error as any` + multer `req.file`); the 2 deferred Date casts resolved in 3C.
- **Phase 3 (storage.ts):** IN PROGRESS, branch only (NOT deployed). 122→107 casts so far.
  - **3A probe** ✅ — verdict: the ~95 Drizzle write-payload casts (`.set/.values({…}) as any`) are VESTIGIAL/cargo-culted, not load-bearing. 3D is a mechanical sweep, not an architectural project. (Root: bare `timestamp()` = Drizzle date-mode vs string interfaces; values actually match `$inferInsert`.)
  - **3B** ✅ commit 57da4b0 — 15 vestigial field-access casts stripped (122→107).
  - **3C** ✅ commit 5eab4e3 — resolved the 2 deferred Date casts; extended the closedAt string→Date idiom to `followUpStartedAt`/`expectedDeliveryDate` in `updateConsultation`+`updateConsultationAndLog`; routes passes `.toISOString()`.
  - **3D** ✅ commit dad874a — swept 105 write-payload casts per-section with tsc gates. 104 vestigial; 1 load-bearing (`createSupportTicket` spread `Partial<SupportTicket>` into `.values()`, masking 4 notNull-no-default columns) → root-fixed by tightening the signature with `Pick<…>`, no cast. **storage.ts: 2 casts left, both legitimate** (`err as any` :43, `(e as any)?.message` init).
  - **3E** ✅ commit fa45c6f (approved behavior change) — dept-transfer memo unassign now writes `""` (the system's unassigned sentinel: auto-memos use `primaryLawyerId || responsibleLawyerId || ""`; server guards `!!memo.assignedTo`; UI sorts unassigned first) instead of the null that violated NOT NULL and was silently swallowed. The existing primaryLawyerId-change cascade (routes ~2449) completes "memo follows its case" when the new dept assigns a lawyer. No migration. Known low-priority gap (backlog): cascade doesn't fire on responsibleLawyerId-only assignment.
- **Phase 6 (dead code):** 6A-6D applied & pushed (commits df62c9e/e47fc9f/1442e2c/2fe6d86): dead deleteUser methods, 9 date-utils exports, 86 wrongly-tracked binaries+FETCH_HEAD untracked (cached-only; .gitignore extended), and **all 134 unused imports/locals** — `tsc --noUnusedLocals` is now ZERO project-wide (use as regression gate for future sweeps).
- **Deferred / pending:**
  - 2D' validation hardening (big), 2E workflow dedup (likely decline).
  - Cascade gap (low): lawyer assignment setting only `responsibleLawyerId` doesn't re-point memos (cascade keys off `primaryLawyerId`).
  - 16 npm dep removals PROPOSED (12 deps incl. legacy passport/session stack + 4 @types) — zero imports verified; awaiting user go; gate = `npm run build`.
  - ~68 attached_assets text/code paste-artifacts still tracked — untracking is a user decision.
  - Behavior items (report-only, scoped in phase6 memory): `contracts.tsx` multipart `tryRefreshTokens` not single-flight (fix: reuse queryClient's `refreshAuthToken`); `auth-context.tsx` `fetchUsersFromAPI` raw-fetch bootstrap (defer to auth pass).
- **Explicitly DECLINED (not deferred):** `useCasesFilter` hook extraction — revisit only if a test suite is adopted. cases.tsx structural-extraction work ended at Batch 4B.
