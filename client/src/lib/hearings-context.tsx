import { createContext, useContext } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  closeHearing: (id: string) => Promise<void>;
  cancelHearing: (id: string) => Promise<void>;
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
    // NOTE: Do NOT cross-invalidate /api/field-tasks — hearing changes don't
    // affect field tasks and this causes an unnecessary full refetch.
  };

  const addHearing = async (data: Partial<Hearing>): Promise<Hearing> => {
    const res = await apiRequest("POST", "/api/hearings", data);
    const hearing = await res.json();
    invalidate();
    return hearing;
  };

  const updateHearing = async (id: string, data: Partial<Hearing>): Promise<void> => {
    await apiRequest("PATCH", `/api/hearings/${id}`, data);
    invalidate();
  };

  const deleteHearing = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/hearings/${id}`);
    invalidate();
  };

  const submitResult = async (id: string, data: HearingResultData): Promise<any> => {
    const res = await apiRequest("POST", `/api/hearings/${id}/result`, data);
    const result = await res.json();
    invalidate();
    return result;
  };

  const submitReport = async (id: string, data: HearingReportData): Promise<void> => {
    await apiRequest("POST", `/api/hearings/${id}/report`, data);
    invalidate();
  };

  const closeHearing = async (id: string): Promise<void> => {
    await apiRequest("POST", `/api/hearings/${id}/close`);
    invalidate();
  };

  const cancelHearing = async (id: string): Promise<void> => {
    await apiRequest("PATCH", `/api/hearings/${id}`, { status: HearingStatus.CANCELLED });
    invalidate();
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
        closeHearing,
        cancelHearing,
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
