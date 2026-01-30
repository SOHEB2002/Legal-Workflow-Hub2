import { createContext, useContext, useState, useEffect } from "react";
import type { Hearing, HearingStatusValue, HearingResultValue, CourtTypeValue } from "@shared/schema";
import { HearingStatus } from "@shared/schema";

interface HearingsContextType {
  hearings: Hearing[];
  addHearing: (data: Partial<Hearing>) => Hearing;
  updateHearing: (id: string, data: Partial<Hearing>) => void;
  deleteHearing: (id: string) => void;
  markCompleted: (id: string, result: HearingResultValue, details: string) => void;
  markPostponed: (id: string, newDate: string, newTime: string) => void;
  markCancelled: (id: string) => void;
  getHearingById: (id: string) => Hearing | undefined;
  getHearingsByCase: (caseId: string) => Hearing[];
  getUpcomingHearings: () => Hearing[];
  getTodayHearings: () => Hearing[];
  getHearingsInRange: (startDate: string, endDate: string) => Hearing[];
}

const HearingsContext = createContext<HearingsContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substr(2, 9);

const initialHearings: Hearing[] = [
  {
    id: "1",
    caseId: "1",
    hearingDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    hearingTime: "09:00",
    courtName: "المحكمة التجارية",
    courtNameOther: null,
    courtRoom: "قاعة 5",
    status: "قادمة",
    result: null,
    resultDetails: "",
    reminderSent24h: false,
    reminderSent1h: false,
    googleCalendarEventId: null,
    notes: "جلسة استماع للشهود",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    caseId: "1",
    hearingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    hearingTime: "11:00",
    courtName: "المحكمة التجارية",
    courtNameOther: null,
    courtRoom: "قاعة 3",
    status: "قادمة",
    result: null,
    resultDetails: "",
    reminderSent24h: false,
    reminderSent1h: false,
    googleCalendarEventId: null,
    notes: "جلسة المرافعة",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    caseId: "2",
    hearingDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    hearingTime: "10:00",
    courtName: "المحكمة العمالية",
    courtNameOther: null,
    courtRoom: "قاعة 2",
    status: "قادمة",
    result: null,
    resultDetails: "",
    reminderSent24h: false,
    reminderSent1h: false,
    googleCalendarEventId: null,
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function HearingsProvider({ children }: { children: React.ReactNode }) {
  const [hearings, setHearings] = useState<Hearing[]>(() => {
    const stored = localStorage.getItem("lawfirm_hearings");
    return stored ? JSON.parse(stored) : initialHearings;
  });

  useEffect(() => {
    localStorage.setItem("lawfirm_hearings", JSON.stringify(hearings));
  }, [hearings]);

  const addHearing = (data: Partial<Hearing>): Hearing => {
    const newHearing: Hearing = {
      id: generateId(),
      caseId: data.caseId || "",
      hearingDate: data.hearingDate || "",
      hearingTime: data.hearingTime || "",
      courtName: data.courtName || "المحكمة العامة",
      courtNameOther: data.courtNameOther || null,
      courtRoom: data.courtRoom || "",
      status: HearingStatus.UPCOMING,
      result: null,
      resultDetails: "",
      reminderSent24h: false,
      reminderSent1h: false,
      googleCalendarEventId: null,
      notes: data.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setHearings((prev) => [newHearing, ...prev]);
    return newHearing;
  };

  const updateHearing = (id: string, data: Partial<Hearing>) => {
    setHearings((prev) =>
      prev.map((h) =>
        h.id === id
          ? { ...h, ...data, updatedAt: new Date().toISOString() }
          : h
      )
    );
  };

  const deleteHearing = (id: string) => {
    setHearings((prev) => prev.filter((h) => h.id !== id));
  };

  const markCompleted = (id: string, result: HearingResultValue, details: string) => {
    setHearings((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              status: HearingStatus.COMPLETED as HearingStatusValue,
              result,
              resultDetails: details,
              updatedAt: new Date().toISOString(),
            }
          : h
      )
    );
  };

  const markPostponed = (id: string, newDate: string, newTime: string) => {
    setHearings((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              status: HearingStatus.POSTPONED as HearingStatusValue,
              hearingDate: newDate,
              hearingTime: newTime,
              updatedAt: new Date().toISOString(),
            }
          : h
      )
    );
  };

  const markCancelled = (id: string) => {
    setHearings((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              status: HearingStatus.CANCELLED as HearingStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : h
      )
    );
  };

  const getHearingById = (id: string) => hearings.find((h) => h.id === id);

  const getHearingsByCase = (caseId: string) =>
    hearings.filter((h) => h.caseId === caseId);

  const getUpcomingHearings = () => {
    const now = new Date();
    return hearings
      .filter((h) => {
        const hearingDate = new Date(h.hearingDate);
        return h.status === HearingStatus.UPCOMING && hearingDate >= now;
      })
      .sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime());
  };

  const getTodayHearings = () => {
    const today = new Date().toISOString().split('T')[0];
    return hearings.filter((h) => h.hearingDate === today && h.status === HearingStatus.UPCOMING);
  };

  const getHearingsInRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return hearings.filter((h) => {
      const date = new Date(h.hearingDate);
      return date >= start && date <= end;
    });
  };

  return (
    <HearingsContext.Provider
      value={{
        hearings,
        addHearing,
        updateHearing,
        deleteHearing,
        markCompleted,
        markPostponed,
        markCancelled,
        getHearingById,
        getHearingsByCase,
        getUpcomingHearings,
        getTodayHearings,
        getHearingsInRange,
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
