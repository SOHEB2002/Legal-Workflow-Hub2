import { createContext, useContext, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Memo, MemoStatusValue, InsertMemo } from "@shared/schema";
import { useAuth } from "./auth-context";
import { useCases } from "./cases-context";

interface MemosContextType {
  memos: Memo[];
  isLoading: boolean;
  addMemo: (data: InsertMemo & { createdBy: string }) => Promise<Memo>;
  updateMemo: (id: string, data: Partial<Memo>) => Promise<Memo>;
  deleteMemo: (id: string) => Promise<void>;
  changeStatus: (id: string, status: MemoStatusValue, extra?: Partial<Memo>) => Promise<Memo>;
  getMemoById: (id: string) => Memo | undefined;
  getMemosByCase: (caseId: string) => Memo[];
  getMemosByHearing: (hearingId: string) => Memo[];
  getActiveMemos: () => Memo[];
  getOverdueMemos: () => Memo[];
  getMemosNeedingReview: () => Memo[];
}

const MemosContext = createContext<MemosContextType | undefined>(undefined);

export function MemosProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { refreshCases } = useCases();
  const { data: memos = [], isLoading } = useQuery<Memo[]>({
    queryKey: ["/api/memos"],
    enabled: !!user,
  });

  const MEMOS_KEY = ["/api/memos"] as const;
  const bgRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleBackgroundRefetch = () => {
    if (bgRefetchRef.current) clearTimeout(bgRefetchRef.current);
    bgRefetchRef.current = setTimeout(() => {
      bgRefetchRef.current = null;
      queryClient.invalidateQueries({ queryKey: MEMOS_KEY });
      // Memo create/delete/update can mutate the related case's memoRequired
      // and clientRole (dynamic IN_COURT path adjustment). Keep cases in sync
      // via the debounced background refetch rather than on every mutation.
      refreshCases().catch(() => {});
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (bgRefetchRef.current) clearTimeout(bgRefetchRef.current);
    };
  }, []);

  const upsertLocal = (memo: Memo) => {
    queryClient.setQueryData<Memo[]>(MEMOS_KEY, (prev) => {
      if (!prev) return [memo];
      const idx = prev.findIndex((m) => m.id === memo.id);
      if (idx === -1) return [memo, ...prev];
      const next = prev.slice();
      next[idx] = memo;
      return next;
    });
  };

  const removeLocal = (id: string) => {
    queryClient.setQueryData<Memo[]>(MEMOS_KEY, (prev) =>
      prev ? prev.filter((m) => m.id !== id) : prev,
    );
  };

  const addMemo = async (data: InsertMemo & { createdBy: string }): Promise<Memo> => {
    const res = await apiRequest("POST", "/api/memos", data);
    const memo = await res.json();
    upsertLocal(memo);
    scheduleBackgroundRefetch();
    return memo;
  };

  const updateMemo = async (id: string, data: Partial<Memo>): Promise<Memo> => {
    const res = await apiRequest("PATCH", `/api/memos/${id}`, data);
    const memo = await res.json();
    upsertLocal(memo);
    scheduleBackgroundRefetch();
    return memo;
  };

  const deleteMemo = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/memos/${id}`);
    removeLocal(id);
    scheduleBackgroundRefetch();
  };

  const changeStatus = async (id: string, status: MemoStatusValue, extra?: Partial<Memo>): Promise<Memo> => {
    const res = await apiRequest("PATCH", `/api/memos/${id}`, { status, ...extra });
    const memo = await res.json();
    upsertLocal(memo);
    scheduleBackgroundRefetch();
    return memo;
  };

  const getMemoById = (id: string) => memos.find(m => m.id === id);

  const getMemosByCase = (caseId: string) => memos.filter(m => m.caseId === caseId);

  const getMemosByHearing = (hearingId: string) => memos.filter(m => m.hearingId === hearingId);

  const getActiveMemos = () => memos.filter(m => !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status));

  const getOverdueMemos = () => {
    const today = new Date().toISOString().split("T")[0];
    return memos.filter(m => 
      !["معتمدة", "مرفوعة", "ملغاة"].includes(m.status) && 
      m.deadline < today
    );
  };

  const getMemosNeedingReview = () => memos.filter(m => m.status === "قيد_المراجعة");

  return (
    <MemosContext.Provider value={{
      memos,
      isLoading,
      addMemo,
      updateMemo,
      deleteMemo,
      changeStatus,
      getMemoById,
      getMemosByCase,
      getMemosByHearing,
      getActiveMemos,
      getOverdueMemos,
      getMemosNeedingReview,
    }}>
      {children}
    </MemosContext.Provider>
  );
}

export function useMemos() {
  const context = useContext(MemosContext);
  if (!context) {
    throw new Error("useMemos must be used within MemosProvider");
  }
  return context;
}
