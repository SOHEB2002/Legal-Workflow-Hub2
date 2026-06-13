---
name: safe-deploy
description: The complete production deployment procedure for Legal Workflow Hub 2 (Replit Reserved VM, two-database setup). MUST be used whenever preparing, executing, or advising on ANY deploy, merge-to-main, Republish, or production release — including "let's deploy", "merge to main", "publish the changes", or any pre-merge diagnostic request.
---

# Safe Deploy — Legal Workflow Hub 2

Production deploys here have real failure modes: schema drift can generate DESTRUCTIVE migrations, untracked-file merges can delete live contract attachments, and Replit's checkpoint commits confuse git state. Every step below exists because of a real incident or near-miss.

## Phase 1 — Pre-merge diagnostic (read-only, from the Windows machine)
1. `git fetch origin`; report positions: origin/main vs origin/feature vs local HEAD; merge-base.
2. Manifest: list every commit that will land (`git log merge-base..origin/feature --oneline`).
3. Characterize main's divergent commits: expect ONLY prior --no-ff deploy merges + empty Replit "Published your App" checkpoints (verify they're content-empty: `git diff merge-base..origin/main` should be 0 lines). Anything else → STOP and report.
4. Schema check: `git diff origin/main..origin/feature -- shared/schema.ts`. Expect EMPTY unless a schema change was explicitly approved this cycle. Non-empty without approval → STOP.
5. Throwaway verification merge: detached worktree from origin/main, `merge --no-ff --no-commit`, check conflicts, link node_modules, run tsc on the merged tree (must be 0), then remove the worktree completely (Windows: junction first via rmdir, then worktree remove; stubborn dirs need `attrib -R` + `rmdir /S /Q`).
6. Special flags to report: Did this cycle untrack any files (uploads/, attached_assets/)? Did package.json change? Any approved behavior change to highlight for post-deploy testing?
7. Verdict: GO/NO-GO + the exact Replit Shell sequence (Phase 2), customized for the flags found.

## Phase 2 — Replit Shell sequence (user executes; deploys NEVER run from the Windows machine)
Standard sequence:
```
git fetch origin
git checkout main && git pull origin main
git merge --no-ff origin/feature/<branch> -m "merge: <description>"
npm run check        # must be 0
git push origin main
```
Conditional inserts:
- IF files were untracked this cycle: BEFORE the merge → `cp -r uploads /tmp/uploads-backup && cp -r attached_assets /tmp/assets-backup`. AFTER the merge → restore with `cp -r /tmp/...-backup/. <dir>/` and VERIFY with `ls` (the merge physically deletes those files from the workspace working tree; uploads/ holds live contract attachments referenced by DB rows).
- IF package.json changed: `npm install` after the merge, before `npm run check`.

Each step has an expected output; anything unexpected → user stops and reports before continuing.

## Phase 3 — Republish (Replit UI)
- Expect NO migration prompt when the schema diff was empty. ANY migration prompt in that case = pre-existing dev/prod drift, NOT this merge → STOP, photograph, report.
- ANY "DROP" statement, ever → STOP immediately.
- NEVER use "Copy database to production" — it has destroyed data classes before.
- IF package.json changed: watch the build log for missing-module errors (transitive-dependency lesson: @types/pg rode in via a removed package).

## Phase 4 — Post-deploy
- Replit appends an empty "Published your App" checkpoint; feature will show "diverged" from main — benign, ignore.
- Produce a test checklist tailored to WHAT shipped: any behavior change gets a specific manual test (e.g., the 3E memo-transfer fix → transfer a department with active memos, verify unassignment + cascade). File-handling changes → verify attachments open.
- Confirm with the user before marking the deploy complete.
