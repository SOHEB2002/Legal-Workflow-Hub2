import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Memo, MemoStatusValue, InsertMemo } from "@shared/schema";
import { useAuth } from "./auth-context";

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
  const { data: memos = [], isLoading } = useQuery<Memo[]>({
    queryKey: ["/api/memos"],
    enabled: !!user,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
    // NOTE: Do NOT invalidate /api/cases here — memos never alter case list data
    // and invalidating cases refetches all 254+ cases on every memo mutation.
  };

  const addMemo = async (data: InsertMemo & { createdBy: string }): Promise<Memo> => {
    const res = await apiRequest("POST", "/api/memos", data);
    const memo = await res.json();
    invalidate();
    return memo;
  };

  const updateMemo = async (id: string, data: Partial<Memo>): Promise<Memo> => {
    const res = await apiRequest("PATCH", `/api/memos/${id}`, data);
    const memo = await res.json();
    invalidate();
    return memo;
  };

  const deleteMemo = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/memos/${id}`);
    invalidate();
  };

  const changeStatus = async (id: string, status: MemoStatusValue, extra?: Partial<Memo>): Promise<Memo> => {
    const res = await apiRequest("PATCH", `/api/memos/${id}`, { status, ...extra });
    const memo = await res.json();
    invalidate();
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
