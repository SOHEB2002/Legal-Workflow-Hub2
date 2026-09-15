# Legal Workflow Hub 2 — Repository Instructions

These instructions apply to the entire repository. Treat the checked-out code and current Git state as the source of truth. Historical notes and SQL filenames may be stale; verify behavior in the implementation before describing or changing it.

## Project and architecture

- This is an Arabic RTL Saudi law-firm workflow platform. Keep UI text and layout RTL-aware, responsive, touch-friendly, and compatible with a future PWA/Capacitor wrapper.
- Frontend: TypeScript, React, Vite, Tailwind, shadcn/Radix, TanStack Query, Wouter, and React contexts under `client/src/`.
- Backend: Node/Express under `server/`; `server/routes.ts` contains API and workflow enforcement, `server/storage.ts` contains database operations, and `server/auth.ts` contains JWT/CSRF authentication.
- Database: PostgreSQL through Drizzle. Tables, Zod schemas, shared types, stage/status definitions, and cross-layer helpers live in `shared/schema.ts`.
- Background work is in `server/scheduler.ts`; realtime delivery is in `server/websocket.ts`.

## Start every task by inspecting

1. Confirm the repository path, current branch, `git status`, and relevant diffs. Preserve unrelated or pre-existing user changes.
2. Read the relevant implementation and search all call sites before editing. Use `rg`; for UI defects, search the user-visible Arabic string as well as internal identifiers because similar dialogs and panels can exist in several places.
3. Check `shared/schema.ts` before assuming a field, nullability rule, enum, stage, or relation. Check the server handler before inferring behavior from a client component or documentation.
4. Keep changes minimal and targeted. Do not combine cleanup, permission changes, schema changes, and behavior changes in one batch.
5. For scripted or multi-file edits, verify every intended file and match after the edit. A successful command or passing compiler does not prove that the intended text changed.

## Git and branch discipline

- The long-running work branch is `feature/consultations-audit`. Confirm the actual branch before every important edit or commit. Do not commit directly to `main` from this checkout.
- Commit, push, merge to `main`, or deploy only when the user has authorized that action. Always present the diff and validation results before a push.
- Install or remove dependencies only when the user has authorized it.
- Never assume a local or remote branch contains a commit: verify the working tree, `git log`, and the actual remote SHA. After a push, verify from the Replit side with `git fetch origin` and `git log origin/feature/consultations-audit --oneline -3`; when needed also compare `git ls-remote origin feature/consultations-audit` with local `HEAD`.
- Main can contain Replit-side work absent from the feature branch. Before merge/deploy conclusions, fetch and compare `origin/main`, the feature branch, and their merge base.
- Replit's empty “Published your App” checkpoint commits can make the feature branch appear diverged from `main`; inspect content rather than assuming divergence is meaningful.
- On PowerShell 5.1, create commit messages in a temporary file under `.git/` and use `git commit -F <file>`; embedded quotes/backticks are unreliable in here-strings. Remove only the exact temporary file afterward.
- Files commonly use CRLF. Any script that reads or rewrites source must tolerate trailing `\r`.

## Required quality gates

Run checks appropriate to the change and report exact results:

1. `npm run check` (TypeScript must exit 0).
2. `npx tsc --noEmit --noUnusedLocals` (must exit 0).
3. Inspect `git diff --check`, `git diff --stat`, and the complete relevant diff.
4. Search added lines for `as any`. Do not introduce blanket `as any`.
5. If `package.json` or build configuration changed, run `npm run build`.
6. Re-run focused grep/count checks that prove the requested sites changed and no duplicate implementation was missed.

Existing narrowly legitimate `any` uses include error narrowing, Multer's `req.file`, and genuinely untyped raw JSON boundaries. Do not move or recreate a blanket cast to silence an error. Prefer root type fixes, a precise union, a typed map such as `Record<string, string>`, or an explicit intersection for request-only fields.

## Audit and cleanup method

For audits, cast cleanup, dead-code work, or type-debt reduction:

1. Inventory every occurrence and classify it before editing.
2. Use a controlled experiment: remove or narrow a representative set, run TypeScript, and inspect the errors.
3. Classify results as vestigial, real type mismatch, missing field/type, map-index issue, or legitimate boundary use.
4. Apply in small chunks with a TypeScript gate after each chunk.
5. If investigation reveals a real behavior, permission, or data bug outside the authorized scope, report it separately instead of hiding it in cleanup.

Type-only cleanup must not change behavior, permissions, workflow stages, or schema. Deliberate per-entity workflow duplication is not automatically a refactoring target.

## Data and database safety

- Preserve all stored data. Never delete, reset, overwrite, reseed, or transform existing production or development data unless the user explicitly authorizes the exact operation.
- The workspace `DATABASE_URL` is development (`heliumdb`). Production uses a separate database (`neondb`). Never access or change production without explicit user approval.
- Never read, print, log, or edit `.env` files or database connection strings.
- Direct database changes, when explicitly authorized, must be applied consistently to both development and production and verified on both. Never assume one environment updates the other.
- Schema work is additive only. New nullable columns/tables may be proposed. Do not drop, rename, narrow, or destructively alter existing columns or constraints. Any non-additive migration requires the owner to decide first.
- Do not use `npm run db:push` / `drizzle-kit push` as a schema delivery mechanism. Do not run migrations, reset scripts, seed scripts, or database pushes without explicit instruction.
- For an approved additive column, update `shared/schema.ts` and prepare an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` script. Deployment order is: apply to development, verify the application reads the table, apply to production, then deploy code. Drizzle selects declared columns explicitly, so serving code before the column exists can break every read of that table.
- Verify schema state with `information_schema`; do not infer that a SQL file is pending merely because it exists. Existing scripts are also historical records.
- Development and production must stay schema-aligned. Replit Republish compares their live schemas and can propose destructive drift repairs.
- `script/apply-fk-constraints.sql` must be orphan-scanned and applied to both databases when its constraints are deployed. After a development reset that uses schema push, reapply it to development before Republish. The safe result is zero unexpected constraint additions or drops.
- Never use Replit's “Copy database to production”. Stop on every proposed `DROP`, destructive migration, or unexplained schema prompt.

## Replit runtime and production deployment

- Never run `npm run dev` from this workstation or as a restart instruction; it consumes Replit resources. TypeScript checks and builds are allowed.
- The established Replit restart is to stop stray server processes in the Replit Shell, then hard-refresh the browser; Replit restarts the configured workflow itself:

  ```bash
  pkill -f tsx; pkill -f 'node.*server'; pkill -f 'npm run dev'
  ```

- Production merges and deploys happen from the Replit Shell, not this workstation. The Replit development checkout normally sits on `main`, so preview testing before the feature merge exercises old code.
- Before a deployment, fetch both branches; list every feature commit; inspect main-only commits; compare the schema diff; and perform a throwaway merge check from `origin/main`. The merged tree must pass TypeScript before proceeding.
- Merge the remote feature ref, not a potentially stale local branch: `git merge --no-ff origin/feature/consultations-audit`.
- If a change untracks runtime files such as `uploads/` or `attached_assets/`, back them up before the merge and restore and verify them afterward. Database rows may point to those files.
- If `package.json` changed, install dependencies on Replit before the build/check step.
- During Republish, preview migration SQL. Any unexpected migration prompt or any `DROP` is a stop condition. A generic “built successfully but failed to start” banner is not a diagnosis; inspect detailed logs because registry/image-push failures can occur before application startup.
- After deployment, hard-refresh and run targeted smoke tests for each shipped behavior. Verify deploy state with Git ancestry/remote checks instead of relying on dated documentation claims.

## Permissions and security invariants

- The general authority model is tiered: `branch_manager` has firm-wide authority; `department_head` has comparable authority in their own department; `employee` acts on records assigned to them. Use the existing shared helpers and route-specific gates rather than recreating this model.
- Always guard department equality: `!!user.departmentId && user.departmentId === entity.departmentId`. Bare equality can grant a null-department user access to null-department records.
- Do not widen `canModifyCase` casually; it includes roles whose scope differs from the tiered model.
- Keep these actions outside generic tier widening: delete, internal-review decisions, committee decisions, assignment/reassignment, and department transfer. Delete remains `branch_manager` only. Internal review must preserve four-eyes separation between author and reviewer.
- Permission changes require deliberate review across frontend visibility and server authorization. Never change permission logic incidentally during cleanup or an unrelated feature.
- Authenticated handlers use `AuthRequest`; `req.user` contains `id`, `role: UserRoleType`, `name`, and `departmentId`.

## Workflow and entity invariants

- `shared/schema.ts` defines the stage/status vocabulary and path helpers; `server/routes.ts` is the authority for permitted transitions. Stage/status columns are generally varchar values validated in application code, so do not assume a database enum protects them.
- Cases, consultations, contracts, and memos intentionally have separate workflow handlers. Follow the closest sibling implementation carefully, but do not consolidate them during feature work.
- Respect entity-specific states: active/closed/cancelled status, `pausedAt`, `awaitingCompletion`, type-specific paths, internal reviewer, assignment, and parent-case department. A stage transition must not bypass the dedicated pause, review, close, return, or completion rules.
- Consultations have written, phone, and procedural paths. Memos have full and short paths. Reopen and follow-up cycles are distinct operations and must use their existing path helpers.
- Memos have no closed lifecycle equivalent; cancellation is their terminal alternative. Memo unassignment uses the empty-string sentinel `""`, not `null`, because `memos.assigned_to` is not nullable.
- `primaryLawyerId` is the canonical current case lawyer. For notification/task ownership, use `caseNotificationRecipientId(lawCase)` (`primaryLawyerId || responsibleLawyerId`) rather than reimplementing the chain. `responsibleLawyerId` is legacy and is no longer assigned a lawyer, but the column must remain under the additive-only rule.
- Hearing attendance is a distinct concept: the sanctioned resolution starts with `litigatorId`, and hearing-specific reminders/actions may start with `hearing.attendingLawyerId`. Do not replace those with the general case-notification helper.
- `canActOnHearing` includes an own-department `department_head` and is the shared authority for the full hearing action set. Do not re-narrow one hearing action independently of the others.
- Closing an individual court hearing requires its minutes attachment except for types covered by `hearingProducesNoMinutes`. The separate aggregate case-close minutes gate is intentionally disabled until the historical backlog is cleared; do not recreate its predicate from memory. Re-measure current data and inspect the original implementation at commit `e52e4ad` before proposing to restore it.
- A pause suppresses the paused record's internal workflow task, not externally imposed hearing, court, memo-deadline, or legal-deadline work. Pausing a case does not cascade pause state to child records.
- Server-side notification fan-out must use `resolveNotificationRecipients` in `server/notification-recipients.ts` to de-duplicate IDs and filter to real active users. Do not recreate client-side department-head lookup logic.
- Files stored in Replit Object Storage use shared object-key builders and `isAttachmentObjectKey`. An unrecognized prefix is treated as a legacy disk path and can make a successful upload unreadable; extend the shared helper for every new entity prefix.

## Server request validation

- Every new mutating endpoint must validate `req.body` with a tolerant Zod schema and return the repository's established Arabic 400 response for invalid input.
- Enumerate every frontend caller and form the union of fields it sends before writing or tightening a schema. Mirror nullability from the shared entity/interface and include request-only fields explicitly.
- Use `.passthrough()` and avoid coercion. Do not narrow update fields to current enums when legacy rows may contain older string values.
- Use parse-and-use when a handler consumes a few explicit fields. Use `safeParse` as a gate while continuing to use the original `req.body` when the handler spreads or mutates it, or when parsed output would force storage-layer type changes.
- Put validation immediately before the first body read while preserving existing authentication, permission, and resource-existence error ordering. Secret/permission checks that prevent information leaks remain first.
- Do not let validation work change handler logic or permissions.

## Date, routing, and storage hazards

- Calendar-day decisions must use the firm's `Asia/Riyadh` day through the existing shared date helpers/`Intl`. Never parse a `YYYY-MM-DD` as UTC and reinterpret it as a local calendar day.
- Elapsed-duration rules should compare instants rather than calendar strings when the rule is genuinely duration-based.
- Drizzle timestamp columns use JavaScript `Date` values while API/domain interfaces often expose ISO strings. Convert in the storage layer using existing patterns; never pass an ISO string directly to a date-mode `.set()` payload.
- Express matches routes in registration order. Register a literal route such as `/api/hearings/ring-state` before a same-shape `/api/hearings/:id` route, and check new literal routes for shadowing.
- Arabic text can appear reversed in BiDi-aware diff viewers. Verify actual source bytes before changing string order.
- Use styled application dialogs instead of native browser prompts when an action requires text input, validation, or RTL layout.

## Operational memory

- Keep `.agents/` intact. Read `.agents/memory/MEMORY.md` when relevant.
- For Replit development boot failures involving the tracked logo or development CSP, consult `.agents/memory/boot-failures.md` before changing application behavior.
