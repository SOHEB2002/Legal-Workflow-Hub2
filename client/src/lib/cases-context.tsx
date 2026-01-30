import { createContext, useContext, useState, useEffect } from "react";
import type { LawCase, InsertCase, UpdateCase, CaseStatusValue } from "@shared/schema";
import { CaseStatus } from "@shared/schema";

interface CasesContextType {
  cases: LawCase[];
  addCase: (data: InsertCase, createdBy: string) => LawCase;
  updateCase: (id: string, data: UpdateCase) => void;
  deleteCase: (id: string) => void;
  assignCase: (id: string, assignedTo: string) => void;
  sendToReview: (id: string) => void;
  approveCase: (id: string) => void;
  rejectCase: (id: string, notes: string) => void;
  closeCase: (id: string) => void;
  getCaseById: (id: string) => LawCase | undefined;
  getActiveCases: () => LawCase[];
  getReviewCases: () => LawCase[];
  getReadyCases: () => LawCase[];
  getUpcomingHearings: () => LawCase[];
}

const CasesContext = createContext<CasesContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substr(2, 9);

const initialCases: LawCase[] = [
  {
    id: "1",
    clientName: "شركة الفلاح للتجارة",
    caseType: "تجاري",
    status: "قيد التنفيذ",
    whatsappLink: "https://wa.me/966501234567",
    driveLink: "https://drive.google.com/folder/abc123",
    nextHearingDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "قضية تجارية تتعلق بنزاع عقد توريد",
    reviewNotes: "",
    assignedTo: "1",
    createdBy: "3",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    clientName: "محمد أحمد العلي",
    caseType: "عمالي",
    status: "مراجعة",
    whatsappLink: "https://wa.me/966509876543",
    driveLink: "https://drive.google.com/folder/def456",
    nextHearingDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "قضية فصل تعسفي - مطالبة بالتعويض",
    reviewNotes: "",
    assignedTo: "2",
    createdBy: "3",
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    clientName: "مؤسسة النور للمقاولات",
    caseType: "إداري",
    status: "جديد",
    whatsappLink: "",
    driveLink: "",
    nextHearingDate: null,
    notes: "استشارة بخصوص تراخيص البناء",
    reviewNotes: "",
    assignedTo: null,
    createdBy: "3",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "4",
    clientName: "فاطمة سعيد الغامدي",
    caseType: "استشارة",
    status: "جاهز للتسليم",
    whatsappLink: "https://wa.me/966505551234",
    driveLink: "https://drive.google.com/folder/ghi789",
    nextHearingDate: null,
    notes: "استشارة قانونية بخصوص الميراث",
    reviewNotes: "",
    assignedTo: "1",
    createdBy: "3",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "5",
    clientName: "شركة التقنية المتقدمة",
    caseType: "عقد",
    status: "قيد التنفيذ",
    whatsappLink: "https://wa.me/966507778899",
    driveLink: "https://drive.google.com/folder/jkl012",
    nextHearingDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    notes: "صياغة عقد شراكة تقنية",
    reviewNotes: "",
    assignedTo: "2",
    createdBy: "3",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function CasesProvider({ children }: { children: React.ReactNode }) {
  const [cases, setCases] = useState<LawCase[]>(() => {
    const stored = localStorage.getItem("lawfirm_cases");
    return stored ? JSON.parse(stored) : initialCases;
  });

  useEffect(() => {
    localStorage.setItem("lawfirm_cases", JSON.stringify(cases));
  }, [cases]);

  const addCase = (data: InsertCase, createdBy: string): LawCase => {
    const newCase: LawCase = {
      id: generateId(),
      clientName: data.clientName,
      caseType: data.caseType,
      status: CaseStatus.NEW,
      whatsappLink: data.whatsappLink || "",
      driveLink: data.driveLink || "",
      nextHearingDate: data.nextHearingDate || null,
      notes: data.notes || "",
      reviewNotes: "",
      assignedTo: null,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCases((prev) => [newCase, ...prev]);
    return newCase;
  };

  const updateCase = (id: string, data: UpdateCase) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...data, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const deleteCase = (id: string) => {
    setCases((prev) => prev.filter((c) => c.id !== id));
  };

  const assignCase = (id: string, assignedTo: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              assignedTo,
              status: CaseStatus.IN_PROGRESS as CaseStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const sendToReview = (id: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.REVIEW as CaseStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const approveCase = (id: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.READY as CaseStatusValue,
              reviewNotes: "",
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const rejectCase = (id: string, notes: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.IN_PROGRESS as CaseStatusValue,
              reviewNotes: notes,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const closeCase = (id: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.CLOSED as CaseStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const getCaseById = (id: string) => cases.find((c) => c.id === id);

  const getActiveCases = () =>
    cases.filter(
      (c) =>
        c.status === CaseStatus.NEW ||
        c.status === CaseStatus.IN_PROGRESS ||
        c.status === CaseStatus.REVIEW ||
        c.status === CaseStatus.READY
    );

  const getReviewCases = () =>
    cases.filter((c) => c.status === CaseStatus.REVIEW);

  const getReadyCases = () =>
    cases.filter((c) => c.status === CaseStatus.READY);

  const getUpcomingHearings = () =>
    cases
      .filter((c) => c.nextHearingDate && c.status !== CaseStatus.CLOSED)
      .sort(
        (a, b) =>
          new Date(a.nextHearingDate!).getTime() -
          new Date(b.nextHearingDate!).getTime()
      );

  return (
    <CasesContext.Provider
      value={{
        cases,
        addCase,
        updateCase,
        deleteCase,
        assignCase,
        sendToReview,
        approveCase,
        rejectCase,
        closeCase,
        getCaseById,
        getActiveCases,
        getReviewCases,
        getReadyCases,
        getUpcomingHearings,
      }}
    >
      {children}
    </CasesContext.Provider>
  );
}

export function useCases() {
  const context = useContext(CasesContext);
  if (context === undefined) {
    throw new Error("useCases must be used within a CasesProvider");
  }
  return context;
}
