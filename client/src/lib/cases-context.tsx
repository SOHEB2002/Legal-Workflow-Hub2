import { createContext, useContext, useState, useEffect } from "react";
import type { LawCase, CaseStatusValue, ReviewDecisionType, PriorityType, CaseTypeValue } from "@shared/schema";
import { CaseStatus, Priority } from "@shared/schema";

interface CasesContextType {
  cases: LawCase[];
  addCase: (data: Partial<LawCase>, createdBy: string) => LawCase;
  updateCase: (id: string, data: Partial<LawCase>) => void;
  deleteCase: (id: string) => void;
  assignCase: (id: string, lawyerId: string, departmentId: string) => void;
  sendToDepartmentHead: (id: string) => void;
  sendToReviewCommittee: (id: string) => void;
  approveCase: (id: string, notes?: string) => void;
  rejectCase: (id: string, notes: string, decision: ReviewDecisionType) => void;
  markReadyToSubmit: (id: string) => void;
  markSubmitted: (id: string) => void;
  closeCase: (id: string) => void;
  getCaseById: (id: string) => LawCase | undefined;
  getCasesByDepartment: (departmentId: string) => LawCase[];
  getCasesByLawyer: (lawyerId: string) => LawCase[];
  getActiveCases: () => LawCase[];
  getReviewCases: () => LawCase[];
  getReadyCases: () => LawCase[];
}

const CasesContext = createContext<CasesContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substr(2, 9);
const generateCaseNumber = () => `C-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

const initialCases: LawCase[] = [
  {
    id: "1",
    caseNumber: "C-2026-0001",
    clientId: "1",
    caseType: "تجاري",
    status: "دراسة",
    departmentId: "2",
    assignedLawyers: ["5"],
    primaryLawyerId: "5",
    courtName: "المحكمة التجارية بالرياض",
    courtCaseNumber: "1234/2026",
    najizNumber: "NAJ-2026-001",
    judgeName: "القاضي عبدالله",
    opponentName: "شركة المنافسة",
    opponentLawyer: "المحامي خالد",
    opponentPhone: "0551234567",
    opponentNotes: "",
    whatsappGroupLink: "https://wa.me/966501234567",
    googleDriveFolderId: "",
    reviewNotes: "",
    reviewDecision: null,
    reviewActionTaken: null,
    priority: "عالي",
    createdBy: "6",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  },
  {
    id: "2",
    caseNumber: "C-2026-0002",
    clientId: "2",
    caseType: "عمالي",
    status: "لجنة_المراجعة",
    departmentId: "3",
    assignedLawyers: ["7"],
    primaryLawyerId: "7",
    courtName: "المحكمة العمالية",
    courtCaseNumber: "5678/2026",
    najizNumber: "NAJ-2026-002",
    judgeName: "",
    opponentName: "شركة التوظيف",
    opponentLawyer: "",
    opponentPhone: "",
    opponentNotes: "قضية فصل تعسفي",
    whatsappGroupLink: "",
    googleDriveFolderId: "",
    reviewNotes: "",
    reviewDecision: null,
    reviewActionTaken: null,
    priority: "متوسط",
    createdBy: "6",
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  },
  {
    id: "3",
    caseNumber: "C-2026-0003",
    clientId: "3",
    caseType: "عام",
    status: "استلام",
    departmentId: "1",
    assignedLawyers: [],
    primaryLawyerId: null,
    courtName: "",
    courtCaseNumber: "",
    najizNumber: "",
    judgeName: "",
    opponentName: "",
    opponentLawyer: "",
    opponentPhone: "",
    opponentNotes: "",
    whatsappGroupLink: "",
    googleDriveFolderId: "",
    reviewNotes: "",
    reviewDecision: null,
    reviewActionTaken: null,
    priority: "منخفض",
    createdBy: "6",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  },
];

export function CasesProvider({ children }: { children: React.ReactNode }) {
  const [cases, setCases] = useState<LawCase[]>(() => {
    const stored = localStorage.getItem("lawfirm_cases_v2");
    return stored ? JSON.parse(stored) : initialCases;
  });

  useEffect(() => {
    localStorage.setItem("lawfirm_cases_v2", JSON.stringify(cases));
  }, [cases]);

  const addCase = (data: Partial<LawCase>, createdBy: string): LawCase => {
    const newCase: LawCase = {
      id: generateId(),
      caseNumber: generateCaseNumber(),
      clientId: data.clientId || "",
      caseType: data.caseType || "عام",
      status: CaseStatus.RECEIVED,
      departmentId: data.departmentId || "",
      assignedLawyers: [],
      primaryLawyerId: null,
      courtName: data.courtName || "",
      courtCaseNumber: data.courtCaseNumber || "",
      najizNumber: data.najizNumber || "",
      judgeName: data.judgeName || "",
      opponentName: data.opponentName || "",
      opponentLawyer: data.opponentLawyer || "",
      opponentPhone: data.opponentPhone || "",
      opponentNotes: data.opponentNotes || "",
      whatsappGroupLink: data.whatsappGroupLink || "",
      googleDriveFolderId: data.googleDriveFolderId || "",
      reviewNotes: "",
      reviewDecision: null,
      reviewActionTaken: null,
      priority: data.priority || Priority.MEDIUM,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
    };
    setCases((prev) => [newCase, ...prev]);
    return newCase;
  };

  const updateCase = (id: string, data: Partial<LawCase>) => {
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

  const assignCase = (id: string, lawyerId: string, departmentId: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              assignedLawyers: [lawyerId],
              primaryLawyerId: lawyerId,
              departmentId,
              status: CaseStatus.STUDY as CaseStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const sendToDepartmentHead = (id: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.DRAFTING as CaseStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const sendToReviewCommittee = (id: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.REVIEW_COMMITTEE as CaseStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const approveCase = (id: string, notes?: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.READY_TO_SUBMIT as CaseStatusValue,
              reviewDecision: "approved" as ReviewDecisionType,
              reviewNotes: notes || "",
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const rejectCase = (id: string, notes: string, decision: ReviewDecisionType) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.AMENDMENTS as CaseStatusValue,
              reviewDecision: decision,
              reviewNotes: notes,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const markReadyToSubmit = (id: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.READY_TO_SUBMIT as CaseStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const markSubmitted = (id: string) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: CaseStatus.SUBMITTED as CaseStatusValue,
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
              closedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const getCaseById = (id: string) => cases.find((c) => c.id === id);

  const getCasesByDepartment = (departmentId: string) =>
    cases.filter((c) => c.departmentId === departmentId);

  const getCasesByLawyer = (lawyerId: string) =>
    cases.filter((c) => c.assignedLawyers.includes(lawyerId) || c.primaryLawyerId === lawyerId);

  const getActiveCases = () =>
    cases.filter((c) => c.status !== CaseStatus.CLOSED);

  const getReviewCases = () =>
    cases.filter((c) => c.status === CaseStatus.REVIEW_COMMITTEE);

  const getReadyCases = () =>
    cases.filter((c) => c.status === CaseStatus.READY_TO_SUBMIT);

  return (
    <CasesContext.Provider
      value={{
        cases,
        addCase,
        updateCase,
        deleteCase,
        assignCase,
        sendToDepartmentHead,
        sendToReviewCommittee,
        approveCase,
        rejectCase,
        markReadyToSubmit,
        markSubmitted,
        closeCase,
        getCaseById,
        getCasesByDepartment,
        getCasesByLawyer,
        getActiveCases,
        getReviewCases,
        getReadyCases,
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
