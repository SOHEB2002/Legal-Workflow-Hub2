import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

// Configurable rows-per-page for the six main list pages.
//
// PERSISTENCE — localStorage, mirroring the `*.recentFilters.v1` idiom the four
// advanced-filter components already use for lightweight per-page UI state
// (same versioned-key shape, same swallow-everything try/catch: a storage
// failure must never break a list page).
//
// The two server-side stores were both considered and neither fits:
//   • user_section_views is (userId, section, lastViewedAt) with a composite PK
//     — it exists solely to drive the "new since last visit" sidebar badges.
//     A page size is not a visit timestamp; storing one needs a new column on a
//     table whose entire semantic is "when did this user last look at X".
//   • saved_filters is for NAMED, user-created filter presets that appear in a
//     dropdown the user saves / renames / deletes. Writing a magic row for an
//     implicit UI preference would surface a bogus preset in that list.
//
// KEYED BY USER **AND** PAGE: two people sharing one browser profile keep
// separate sizes, and the size chosen on القضايا does not move الجلسات.
// Known tradeoff (localStorage is per-browser, not per-account): the same user
// on a second device starts again at the default. That matches how recent
// filters already behave; a truly cross-device preference would need a server
// column, which is a bigger change than this feature warrants.
export const PAGE_SIZE_OPTIONS: number[] = [15, 30, 40, 50];
export const DEFAULT_PAGE_SIZE = 15;

function storageKey(userId: string | undefined, pageKey: string): string {
  return `lwh.pageSize.${userId || "anon"}.${pageKey}.v1`;
}

function readSize(userId: string | undefined, pageKey: string): number {
  try {
    const raw = localStorage.getItem(storageKey(userId, pageKey));
    if (!raw) return DEFAULT_PAGE_SIZE;
    const n = Number(raw);
    // Ignore anything not on the menu — a hand-edited or stale value must not
    // produce an un-selectable size.
    return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

/**
 * @param pageKey stable per-page id ("cases", "hearings", …)
 * @returns [pageSize, setPageSize]
 */
export function usePageSize(pageKey: string): [number, (size: number) => void] {
  const { user } = useAuth();
  const userId = user?.id;
  const [pageSize, setPageSizeState] = useState<number>(() => readSize(userId, pageKey));

  // The auth provider mounts above the login screen, so the very first render
  // can run with no user. Re-read once the id resolves, otherwise a session that
  // started on the login page would run on the anonymous key all the way.
  useEffect(() => {
    setPageSizeState(readSize(userId, pageKey));
  }, [userId, pageKey]);

  const setPageSize = useCallback(
    (size: number) => {
      setPageSizeState(size);
      try {
        localStorage.setItem(storageKey(userId, pageKey), String(size));
      } catch {
        // localStorage failures shouldn't break the list
      }
    },
    [userId, pageKey],
  );

  return [pageSize, setPageSize];
}
