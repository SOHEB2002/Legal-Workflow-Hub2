import { createContext, useContext, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Hearing, HearingResultValue } from "@shared/schema";
import { HearingStatus } from "@shared/schema";
import { useAuth } from "./auth-context";

interface HearingResultData {
  result: HearingResultValue;
  resultDetails?: string;
  judgmentSide?: string;
  judgmentFinal?: boolean;
  objectionFeasible?: boolean;
  objectionDeadline?: string;
  nextHearingDate?: string;
  nextHearingTime?: string;
  responseRequired?: boolean;
  userId?: string;
}

interface HearingReportData {
  hearingReport: string;
  recommendations?: string;
  nextSteps?: string;
  contactCompleted: boolean;
}

interface HearingsContextType {
  hearings: Hearing[];
  isLoading: boolean;
  addHearing: (data: Partial<Hearing>) => Promise<Hearing>;
  updateHearing: (id: string, data: Partial<Hearing>) => Promise<void>;
  deleteHearing: (id: string) => Promise<void>;
  submitResult: (id: string, data: HearingResultData) => Promise<any>;
  submitReport: (id: string, data: HearingReportData) => Promise<void>;
  cancelHearing: (id: string, reason: string) => Promise<void>;
  setHearingFlag: (id: string, flagged: boolean, reason?: string) => Promise<void>;
  getHearingById: (id: string) => Hearing | undefined;
  getHearingsByCase: (caseId: string) => Hearing[];
  getUpcomingHearings: () => Hearing[];
  getTodayHearings: () => Hearing[];
}

const HearingsContext = createContext<HearingsContextType | undefined>(undefined);

export function HearingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: hearings = [], isLoading } = useQuery<Hearing[]>({
    queryKey: ["/api/hearings"],
    enabled: !!user,
  });

  const HEARINGS_KEY = ["/api/hearings"] as const;
  const bgRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleBackgroundRefetch = () => {
    if (bgRefetchRef.current) clearTimeout(bgRefetchRef.current);
    bgRefetchRef.current = setTimeout(() => {
      bgRefetchRef.current = null;
      queryClient.invalidateQueries({ queryKey: HEARINGS_KEY });
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (bgRefetchRef.current) clearTimeout(bgRefetchRef.current);
    };
  }, []);

  const upsertLocal = (hearing: Hearing) => {
    queryClient.setQueryData<Hearing[]>(HEARINGS_KEY, (prev) => {
      if (!prev) return [hearing];
      const idx = prev.findIndex((h) => h.id === hearing.id);
      if (idx === -1) return [hearing, ...prev];
      const next = prev.slice();
      next[idx] = hearing;
      return next;
    });
  };

  const patchLocal = (id: string, patch: Partial<Hearing>) => {
    queryClient.setQueryData<Hearing[]>(HEARINGS_KEY, (prev) =>
      prev ? prev.map((h) => (h.id === id ? { ...h, ...patch } : h)) : prev,
    );
  };

  const removeLocal = (id: string) => {
    queryClient.setQueryData<Hearing[]>(HEARINGS_KEY, (prev) =>
      prev ? prev.filter((h) => h.id !== id) : prev,
    );
  };

  const addHearing = async (data: Partial<Hearing>): Promise<Hearing> => {
    const res = await apiRequest("POST", "/api/hearings", data);
    const hearing = await res.json();
    upsertLocal(hearing);
    scheduleBackgroundRefetch();
    // The server may have auto-created memos (the explicit responseRequired
    // path, or the deferred-memo pickup from prior hearings on the same
    // case). Invalidate memos immediately so memos.tsx shows them without
    // waiting for the 5s background refetch.
    if (Array.isArray(hearing?.createdMemos) && hearing.createdMemos.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
    }
    return hearing;
  };

  const updateHearing = async (id: string, data: Partial<Hearing>): Promise<void> => {
    const res = await apiRequest("PATCH", `/api/hearings/${id}`, data);
    try {
      const updated = await res.json();
      if (updated && updated.id) upsertLocal(updated);
      else patchLocal(id, data);
    } catch {
      patchLocal(id, data);
    }
    scheduleBackgroundRefetch();
  };

  const deleteHearing = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/hearings/${id}`);
    removeLocal(id);
    scheduleBackgroundRefetch();
  };

  const submitResult = async (id: string, data: HearingResultData): Promise<any> => {
    const res = await apiRequest("POST", `/api/hearings/${id}/result`, data);
    const result = await res.json();
    if (result && result.hearing && result.hearing.id) {
      upsertLocal(result.hearing);
    } else if (result && result.id) {
      upsertLocal(result);
    }
    scheduleBackgroundRefetch();
    // Invalidate memos immediately if the result handler auto-created any
    // (NEW_SESSION + memoRequired path), so memos.tsx reflects them now
    // instead of after the 5s background refetch.
    // ...or if it CANCELLED any. Recording any result cancels the case's prior
    // active memos (the session happened, so they're spent — the objection is
    // excluded server-side). Those rows aren't in this response either, and the
    // cases-list "مذكرة جارية" / "لائحة اعتراضية" badge derives from the memos
    // cache, so it would stay lit until the background refetch.
    const createdAnyMemo = Array.isArray(result?.createdMemos) && result.createdMemos.length > 0;
    const cancelledAnyMemo = typeof result?.cancelledMemos === "number" && result.cancelledMemos > 0;
    if (createdAnyMemo || cancelledAnyMemo) {
      queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
    }
    // Recording a result clears "مطلوب رد من الخصم" on the case's OTHER hearings
    // too (the session happened). Those rows aren't in this response, and the
    // badge is `.some(h => h.opponentResponseRequired)` across all of a case's
    // hearings — so refetch immediately instead of waiting for the background
    // pass, otherwise the indicator lingers for a few seconds after it's gone.
    if (typeof result?.clearedOpponentResponse === "number" && result.clearedOpponentResponse > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
    }
    return result;
  };

  const submitReport = async (id: string, data: HearingReportData): Promise<void> => {
    const res = await apiRequest("POST", `/api/hearings/${id}/report`, data);
    try {
      const updated = await res.json();
      if (updated && updated.id) upsertLocal(updated);
      else patchLocal(id, { reportCompleted: true, ...data } as any);
    } catch {
      patchLocal(id, { reportCompleted: true, ...data } as any);
    }
    scheduleBackgroundRefetch();
  };

  // (closeHearing lived here and was removed with the "إغلاق الجلسة" step — owner
  // decision 2026-08-04. The SERVER route POST /api/hearings/:id/close survives
  // deliberately and carries the explanation; there is simply no caller now.)

  // Cancellation now goes through the dedicated endpoint so the mandatory
  // reason is captured (the old PATCH-status call recorded nothing). The server
  // returns the updated row, so upsert it verbatim rather than patching status
  // alone — that keeps cancellationReason in the cache for the detail banner.
  const cancelHearing = async (id: string, reason: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/hearings/${id}/cancel`, { reason });
    const updated = await res.json();
    if (updated && updated.id) upsertLocal(updated);
    // No cast: patchLocal takes Partial<Hearing> and status is HearingStatusValue.
    // (The pre-existing `as any` here was vestigial — removed rather than moved.)
    else patchLocal(id, { status: HearingStatus.CANCELLED });
    scheduleBackgroundRefetch();
  };

  // "جلسة مُعلَّمة" — team attention flag. Server clears reason/by/at on unflag,
  // so the response is upserted verbatim rather than patched field-by-field.
  const setHearingFlag = async (id: string, flagged: boolean, reason?: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/hearings/${id}/flag`, { flagged, reason });
    const updated = await res.json();
    if (updated && updated.id) upsertLocal(updated);
    scheduleBackgroundRefetch();
  };

  const getHearingById = (id: string) => hearings.find((h) => h.id === id);

  const getHearingsByCase = (caseId: string) =>
    hearings.filter((h) => h.caseId === caseId);

  const getUpcomingHearings = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return hearings
      .filter((h) => {
        const hearingDate = new Date(h.hearingDate);
        return h.status === HearingStatus.UPCOMING && hearingDate >= now;
      })
      .sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime());
  };

  const getTodayHearings = () => {
    const today = new Date().toISOString().split("T")[0];
    return hearings.filter((h) => h.hearingDate === today && h.status === HearingStatus.UPCOMING);
  };

  return (
    <HearingsContext.Provider
      value={{
        hearings,
        isLoading,
        addHearing,
        updateHearing,
        deleteHearing,
        submitResult,
        submitReport,
        cancelHearing,
        setHearingFlag,
        getHearingById,
        getHearingsByCase,
        getUpcomingHearings,
        getTodayHearings,
      }}
    >
      {children}
    </HearingsContext.Provider>
  );
}

export function useHearings() {
  const context = useContext(HearingsContext);
  if (context === undefined) {
    throw new Error("useHearings must be used within a HearingsProvider");
  }
  return context;
}
