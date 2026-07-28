import { usePersistedUserState } from "@/hooks/use-persisted-state";

// Configurable rows-per-page for the six main list pages.
//
// PERSISTENCE now DELEGATES to usePersistedUserState (use-persisted-state.ts),
// which is this hook's own logic generalised so the filter-persistence feature
// could reuse it instead of standing up a second, parallel mechanism. The key
// shape, the swallow-everything try/catch and the re-read-once-auth-resolves
// behaviour are all preserved exactly; the rationale for rejecting
// user_section_views and saved_filters moved there with it.
//
// ⚠ KEY SHAPE IS UNCHANGED — `lwh.pageSize.{userId}.{pageKey}.v1`, so every
// size a user has already saved still loads. The generic core JSON-parses,
// which is backward-compatible here because the old writer stored a bare number
// ("30"), and a bare number is valid JSON.
export const PAGE_SIZE_OPTIONS: number[] = [15, 30, 40, 50];
export const DEFAULT_PAGE_SIZE = 15;

/**
 * @param pageKey stable per-page id ("cases", "hearings", …)
 * @returns [pageSize, setPageSize]
 */
export function usePageSize(pageKey: string): [number, (size: number) => void] {
  return usePersistedUserState<number>(
    (uid) => `lwh.pageSize.${uid}.${pageKey}.v1`,
    DEFAULT_PAGE_SIZE,
    // Ignore anything not on the menu — a hand-edited or stale value must not
    // produce an un-selectable size.
    (raw) => (typeof raw === "number" && PAGE_SIZE_OPTIONS.includes(raw) ? raw : undefined),
  );
}
