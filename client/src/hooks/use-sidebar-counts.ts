import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import type { SidebarCounts, SidebarSectionValue } from "@shared/schema";

const EMPTY: SidebarCounts = { cases: 0, consultations: 0, hearings: 0, memos: 0 };

const POLL_MS = 30_000;

export function useSidebarCounts() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<SidebarCounts>(EMPTY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest("GET", "/api/sidebar-counts");
      const data = (await res.json()) as Partial<SidebarCounts>;
      setCounts({
        cases: data.cases ?? 0,
        consultations: data.consultations ?? 0,
        hearings: data.hearings ?? 0,
        memos: data.memos ?? 0,
      });
    } catch {
      // Sidebar badges are best-effort — never surface an error toast.
    }
  }, [user]);

  const markViewed = useCallback(
    async (section: SidebarSectionValue) => {
      if (!user) return;
      // Optimistic clear so the badge disappears the moment the user clicks.
      setCounts((prev) => ({ ...prev, [section]: 0 }));
      try {
        await apiRequest("POST", "/api/sidebar-counts/mark-viewed", { section });
      } catch {
        // Swallow — next poll will reconcile the real state.
      }
      fetchCounts();
    },
    [user, fetchCounts],
  );

  useEffect(() => {
    if (!user) {
      setCounts(EMPTY);
      return;
    }
    fetchCounts();
    timerRef.current = setInterval(fetchCounts, POLL_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [user, fetchCounts]);

  return { counts, markViewed, refetch: fetchCounts };
}
