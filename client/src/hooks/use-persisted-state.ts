import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

// ONE persistence mechanism for lightweight per-user, per-page UI state.
//
// This is the GENERALISED core of use-page-size (a8ae718): same localStorage
// idiom, same versioned key shape, same swallow-everything try/catch (a storage
// failure must never break a list page). usePageSize now delegates to it, so
// there is exactly one implementation rather than two parallel ones.
//
// The two server-side stores were both considered and neither fits — the same
// reasoning use-page-size already recorded:
//   • user_section_views is (userId, section, lastViewedAt) with a composite PK,
//     existing solely to drive the "new since last visit" sidebar badges.
//   • saved_filters is for NAMED, user-created presets that appear in a dropdown
//     the user saves / renames / deletes. Writing implicit per-page UI state
//     there would surface a BOGUS PRESET in that list. ⚠ saved_filters is NOT
//     touched by anything in this file, deliberately.
//
// KEYED BY USER **AND** PAGE **AND** FILTER: two people sharing one browser
// profile keep separate state, and the stage filter on القضايا does not move the
// one on الجلسات. Known tradeoff (localStorage is per-browser, not per-account):
// the same user on a second device starts from the defaults. That matches how
// page size and recent filters already behave.

function readRaw<T>(key: string, fallback: T, sanitize?: (raw: unknown) => T | undefined): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!sanitize) return parsed as T;
    // A sanitizer returning undefined means "unrecognised" — fall back rather
    // than restore a value that would silently produce an empty list.
    const clean = sanitize(parsed);
    return clean === undefined ? fallback : clean;
  } catch {
    return fallback;
  }
}

function writeRaw(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage failures (private mode, quota) must never break the list
  }
}

/**
 * useState with localStorage persistence, keyed by the CURRENT USER.
 *
 * @param keyFor    builds the FULL storage key from the user segment. A builder
 *                  rather than a prefix so callers control where the user
 *                  segment sits — usePageSize keeps its historical
 *                  `lwh.pageSize.{userId}.{pageKey}.v1` shape exactly, so every
 *                  size a user has already saved still loads.
 * @param fallback  value used when nothing is stored, or when the stored value
 *                  fails `sanitize`. Recomputed on every render, so a fallback
 *                  derived from the user (e.g. their own department) lands
 *                  correctly once auth resolves.
 * @param sanitize  validates/normalises the parsed value; return `undefined` to
 *                  reject it. REQUIRED for anything with a closed value set —
 *                  see the stale-value note on usePersistedFilter.
 */
export function usePersistedUserState<T>(
  keyFor: (userSegment: string) => string,
  fallback: T,
  sanitize?: (raw: unknown) => T | undefined,
): [T, (value: T | ((prev: T) => T)) => void] {
  const { user } = useAuth();
  const userId = user?.id;
  const fullKey = keyFor(userId || "anon");

  const [value, setValueState] = useState<T>(() => readRaw(fullKey, fallback, sanitize));

  // Once the user has changed this themselves — or a deep-link has set it — the
  // stored value must never be re-applied over the top. Without this, the
  // auth-resolution re-read below would clobber a ?dept=… deep-link that ran in
  // an effect on the same mount.
  const touchedRef = useRef(false);
  // Re-read when the user id resolves. The auth provider mounts above the login
  // screen, so the very first render can run with no user; without this a
  // session that began on the login page would run on the anonymous key for its
  // whole lifetime (the bug use-page-size documents).
  const lastKeyRef = useRef(fullKey);
  useEffect(() => {
    if (touchedRef.current) return;
    if (lastKeyRef.current === fullKey) return;
    lastKeyRef.current = fullKey;
    setValueState(readRaw(fullKey, fallback, sanitize));
    // `fallback` and `sanitize` are intentionally out of the dep list: both are
    // recreated every render, and this effect must fire only on a real key
    // change. The values read inside are always the current ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  // Accepts the functional-updater form too, so this is a true drop-in for
  // useState — several pages call setAdvFilters(prev => …) and rewriting those
  // call sites would have been a much larger, riskier diff than supporting it.
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      touchedRef.current = true;
      setValueState((prev) => {
        const resolved = typeof next === "function"
          ? (next as (p: T) => T)(prev)
          : next;
        writeRaw(fullKey, resolved);
        return resolved;
      });
    },
    [fullKey],
  );

  return [value, setValue];
}

/**
 * Per-page list-filter persistence. Thin wrapper that owns the key shape.
 *
 * ⚠ STALE VALUES — pass a `sanitize` for anything with a closed value set. A
 * saved stage that no longer exists, or a lawyer who has left, must NOT restore:
 * it would render an empty list with no visible cause. Sanitizers here cover
 * STATIC sets (enums, known option lists) only — they run at mount, when
 * async-loaded departments/users are still empty, so validating against those
 * would reject everything. Dynamic lists are handled by the pages' existing
 * "reset if not in the loaded list" effects, which are guarded on the list
 * having actually loaded.
 */
export function usePersistedFilter<T>(
  pageKey: string,
  filterKey: string,
  fallback: T,
  sanitize?: (raw: unknown) => T | undefined,
): [T, (value: T | ((prev: T) => T)) => void] {
  // User segment in the MIDDLE, matching the pageSize key shape.
  return usePersistedUserState(
    (uid) => `lwh.filter.${uid}.${pageKey}.${filterKey}.v1`,
    fallback,
    sanitize,
  );
}

// ---- Sanitizer builders -------------------------------------------------

/** Accepts a string that is either one of `allowed` or the page's "any" sentinel. */
export function oneOf(allowed: readonly string[], anySentinel: string) {
  return (raw: unknown): string | undefined => {
    if (typeof raw !== "string") return undefined;
    if (raw === anySentinel) return raw;
    return allowed.includes(raw) ? raw : undefined;
  };
}

/**
 * Accepts any string, including the "any" sentinel — for values whose valid set
 * is only known once async data lands (department ids, user ids). Structure is
 * checked here; existence is checked by the page once its list has loaded.
 */
export function anyString(raw: unknown): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Shape-checks a saved advanced-filter object against a reference default:
 * every key present in the default is taken from the saved value when its type
 * matches (array / boolean / string), otherwise the default's own value is
 * used. Unknown keys in the saved object are dropped.
 *
 * This is what makes an advanced-filter object survive a SHAPE CHANGE — e.g.
 * when the consultations `overdue` toggle was removed, a saved object still
 * carrying it restores cleanly with that key ignored, instead of reviving a
 * filter the UI no longer exposes.
 *
 * `stringArrayMembers` optionally restricts named string-array fields to a known
 * set, dropping unrecognised members (a deleted stage, a removed memo type)
 * while keeping the rest of the selection.
 */
export function objectLike<T extends Record<string, unknown>>(
  defaults: T,
  stringArrayMembers?: Partial<Record<keyof T, readonly string[]>>,
) {
  return (raw: unknown): T | undefined => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const saved = raw as Record<string, unknown>;
    const out = { ...defaults } as Record<string, unknown>;
    for (const key of Object.keys(defaults)) {
      const def = defaults[key];
      const val = saved[key];
      if (val === undefined) continue;
      if (Array.isArray(def)) {
        if (!Array.isArray(val)) continue;
        let members = val.filter((m): m is string => typeof m === "string");
        const allowed = stringArrayMembers?.[key as keyof T];
        if (allowed) members = members.filter((m) => allowed.includes(m));
        out[key] = members;
      } else if (typeof def === "boolean") {
        if (typeof val === "boolean") out[key] = val;
      } else if (typeof def === "string") {
        if (typeof val === "string") out[key] = val;
      }
    }
    return out as T;
  };
}
