---
name: Recurring dev workflow boot failures
description: Two recurring causes of the "Start application" workflow failing / white screen after env resets, rollbacks, or deploys, and how to fix each.
---

# Recurring boot failures (dev workflow)

Both fixes below have been reverted MULTIPLE times by rollbacks/deploy checkpoints. When the dev app breaks, check BOTH together.

## 1. Missing company logo asset
The company logo JPEG under `attached_assets/` (a WhatsApp_Image_2026-02-13 filename) is imported by `client/src/components/app-sidebar.tsx` and `client/src/pages/login.tsx`. `attached_assets/` is gitignored, so the file disappears after resets and Vite crashes with `Failed to resolve import "@assets/..."`.

**Durable fix:** copy it to the tracked path `client/src/assets/company-logo.jpeg` and import via `@/assets/company-logo.jpeg` in both files. If the source file is gone, recover the blob from old commits (it was tracked before an "untrack attached_assets" cleanup):
```
git --no-optional-locks log --all --oneline --name-only | grep -i whatsapp
git --no-optional-locks show <commit>:"attached_assets/<name>.jpeg" > <dest>
```
**Why:** user-pasted binaries are deliberately untracked; hardcoded import paths need the file on disk.

## 2. CSP white screen in development
`server/index.ts` helmet CSP sets `script-src 'self'`, which blocks Vite's injected inline preamble/HMR scripts in dev → white screen, console errors "Refused to execute inline script" or "@vitejs/plugin-react can't detect preamble".

**Fix:** make script-src dev-aware:
```
scriptSrc: process.env.NODE_ENV !== "production" ? ["'self'", "'unsafe-inline'"] : ["'self'"],
```
**How to check:** `curl -s -D - localhost:5000/ -o /dev/null | grep -io "script-src [^;]*"` — if it shows only `'self'` in dev, re-apply. Production (`npm start` sets NODE_ENV=production) must stay strict.

## Harmless startup errors (ignore — do NOT block boot)
- `Failed to apply DB indexes: __dirname is not defined` (ESM context).
- `relation "cases" does not exist` classification/backfill errors on fresh DBs.
Server still serves on port 5000 despite these.
