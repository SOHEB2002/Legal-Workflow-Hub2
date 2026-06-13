---
name: audit-method
description: The controlled-experiment audit methodology for Legal Workflow Hub 2, proven across Phases 0-6 (520+ casts removed, 11 real bugs found, zero regressions). MUST be used whenever auditing, reviewing, or cleaning existing code — cast cleanup, dead-code sweeps, type-debt reduction, "review this file", periodic health checks, or investigating suspicious code. This is the REVIEW lens, separate from writing new code (that's build-standards).
---

# Audit Method — Legal Workflow Hub 2

Review is a distrust exercise: assume nothing, prove everything with the compiler. This methodology found bugs that "looks fine" reviews missed for months. Never mix it with feature-writing in the same pass — the build mindset (make it work) and the audit mindset (prove it's wrong) catch different problems.

## The pipeline (per batch)
1. INVENTORY: grep-count the target pattern; categorize every instance (VESTIGIAL / TYPE_MISMATCH / FIELD_NOT_ON_TYPE / MAP_INDEX / LEGITIMATE). Concentrations tell you where the real story is.
2. CONTROLLED EXPERIMENT: strip the casts (or suspect pattern) → `npx tsc --noEmit` → capture what surfaces → revert. The compiler's silence proves vestigiality; its errors are diagnoses, not annoyances. For large categories, probe a representative sample (~12 across all shape variants) before committing to a full sweep.
3. CLASSIFY outcomes: no error → vestigial, delete. Value mismatch → precise type or root fix. Map-index → `Record<string,string>`. FIELD_NOT_ON_TYPE → DIAGNOSE before touching: it may be a real bug (the assigned_to NOT NULL bug and the createSupportTicket masking bug were both found this way). Legitimate (catch narrowing, multer req.file) → keep, document.
4. APPLY in chunks with a tsc gate after EACH chunk — a surfaced error mid-sweep means that one was load-bearing: diagnose it precisely, never re-add a blanket cast, never relocate a cast to silence an error.
5. GATES before commit: tsc = 0; tsc --noUnusedLocals = 0 (project standard); `git diff | grep "^+" | grep "as any"` → only documented-legitimate forms; grep verification counts match the plan; zero behavior change (unless explicitly approved).
6. DOCUMENT: commit message records counts, categories, and any root fixes so the diff self-explains. Real bugs found → report immediately, stop if fixing them needs a product decision.

## Scope discipline
- Type-only batches NEVER touch: permission logic, schema (beyond approved additive widening), behavior. Anything in those territories → STOP and report (CLAUDE.md operating mode).
- Deliberate duplication (per-resource workflow handlers) is NOT a finding — it's a documented decision (2E). Don't propose DRY-ing it.
- Suspicious-but-working code: investigate and report with evidence; the user decides.
