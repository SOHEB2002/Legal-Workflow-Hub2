import { createContext, useContext, useState, useEffect } from "react";
import type { LawCase, CaseStatusValue, ReviewDecisionType, PriorityType, CaseTypeValue, CaseStageValue, CaseStageTransition, CaseComment } from "@shared/schema";
import { CaseStatus, Priority, CaseStage, CaseStagesOrder } from "@shared/schema";

interface CasesContextType {
  cases: LawCase[];
  comments: CaseComment[];
  addCase: (data: Partial<LawCase>, createdBy: string, createdByName: string) => LawCase;
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
  moveToNextStage: (id: string, userId: string, userName: string, notes?: string) => boolean;
  moveToPreviousStage: (id: string, userId: string, userName: string, notes?: string) => boolean;
  addComment: (caseId: string, userId: string, userName: string, content: string) => void;
  getCommentsByCaseId: (caseId: string) => CaseComment[];
  getCaseById: (id: string) => LawCase | undefined;
  getCasesByDepartment: (departmentId: string) => LawCase[];
  getCasesByLawyer: (lawyerId: string) => LawCase[];
  getCasesByClient: (clientId: string) => LawCase[];
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
    currentStage: "دراسة",
    stageHistory: [
      { stage: "استلام", timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), userId: "6", userName: "الدعم الإداري", notes: "استلام القضية" },
      { stage: "استكمال_البيانات", timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), userId: "6", userName: "الدعم الإداري", notes: "" },
      { stage: "دراسة", timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), userId: "5", userName: "المحامي عمر", notes: "" },
    ],
    departmentId: "2",
    assignedLawyers: ["5"],
    primaryLawyerId: "5",
    responsibleLawyerId: "5",
    courtName: "المحكمة التجارية بالرياض",
    courtCaseNumber: "1234/2026",
    najizNumber: "NAJ-2026-001",
    judgeName: "القاضي عبدالله",
    circuitNumber: "الدائرة الثالثة",
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
    currentStage: "إحالة_للجنة_المراجعة",
    stageHistory: [
      { stage: "استلام", timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), userId: "6", userName: "الدعم الإداري", notes: "" },
      { stage: "استكمال_البيانات", timestamp: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), userId: "6", userName: "الدعم الإداري", notes: "" },
      { stage: "دراسة", timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), userId: "7", userName: "موظف", notes: "" },
      { stage: "تحرير_المذكرة", timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), userId: "7", userName: "موظف", notes: "" },
      { stage: "إحالة_للجنة_المراجعة", timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), userId: "7", userName: "موظف", notes: "" },
    ],
    departmentId: "3",
    assignedLawyers: ["7"],
    primaryLawyerId: "7",
    responsibleLawyerId: "7",
    courtName: "المحكمة العمالية",
    courtCaseNumber: "5678/2026",
    najizNumber: "NAJ-2026-002",
    judgeName: "",
    circuitNumber: "الدائرة الأولى",
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
    currentStage: "استلام",
    stageHistory: [
      { stage: "استلام", timestamp: new Date().toISOString(), userId: "6", userName: "الدعم الإداري", notes: "قضية جديدة" },
    ],
    departmentId: "1",
    assignedLawyers: [],
    primaryLawyerId: null,
    responsibleLawyerId: null,
    courtName: "",
    courtCaseNumber: "",
    najizNumber: "",
    judgeName: "",
    circuitNumber: "",
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

const initialComments: CaseComment[] = [];

// Helper to migrate old cases without new fields
const migrateCase = (c: LawCase): LawCase => {
  if (!c.currentStage) {
    c.currentStage = c.status as CaseStageValue || CaseStage.RECEIVED;
  }
  if (!c.stageHistory) {
    c.stageHistory = [{ stage: c.currentStage, timestamp: c.createdAt, userId: c.createdBy, userName: "النظام", notes: "تهجير البيانات" }];
  }
  if (c.responsibleLawyerId === undefined) {
    c.responsibleLawyerId = c.primaryLawyerId;
  }
  if (!c.circuitNumber) {
    c.circuitNumber = "";
  }
  return c;
};

export function CasesProvider({ children }: { children: React.ReactNode }) {
  const [cases, setCases] = useState<LawCase[]>(() => {
    const stored = localStorage.getItem("lawfirm_cases_v3");
    if (stored) {
      const parsed = JSON.parse(stored) as LawCase[];
      return parsed.map(migrateCase);
    }
    return initialCases;
  });

  const [comments, setComments] = useState<CaseComment[]>(() => {
    const stored = localStorage.getItem("lawfirm_case_comments");
    return stored ? JSON.parse(stored) : initialComments;
  });

  useEffect(() => {
    localStorage.setItem("lawfirm_cases_v3", JSON.stringify(cases));
  }, [cases]);

  useEffect(() => {
    localStorage.setItem("lawfirm_case_comments", JSON.stringify(comments));
  }, [comments]);

  const addCase = (data: Partial<LawCase>, createdBy: string, createdByName: string): LawCase => {
    const now = new Date().toISOString();
    const initialStage: CaseStageValue = CaseStage.RECEIVED;
    const newCase: LawCase = {
      id: generateId(),
      caseNumber: generateCaseNumber(),
      clientId: data.clientId || "",
      caseType: data.caseType || "عام",
      status: CaseStatus.RECEIVED,
      currentStage: initialStage,
      stageHistory: [{ stage: initialStage, timestamp: now, userId: createdBy, userName: createdByName, notes: "استلام القضية" }],
      departmentId: data.departmentId || "",
      assignedLawyers: [],
      primaryLawyerId: null,
      responsibleLawyerId: data.responsibleLawyerId || null,
      courtName: data.courtName || "",
      courtCaseNumber: data.courtCaseNumber || "",
      najizNumber: data.najizNumber || "",
      judgeName: data.judgeName || "",
      circuitNumber: data.circuitNumber || "",
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
      createdAt: now,
      updatedAt: now,
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

  const getCasesByClient = (clientId: string) =>
    cases.filter((c) => c.clientId === clientId);

  const moveToNextStage = (id: string, userId: string, userName: string, notes: string = ""): boolean => {
    const lawCase = cases.find((c) => c.id === id);
    if (!lawCase) return false;

    const currentIndex = CaseStagesOrder.indexOf(lawCase.currentStage);
    if (currentIndex === -1 || currentIndex >= CaseStagesOrder.length - 1) return false;

    const nextStage = CaseStagesOrder[currentIndex + 1];
    const newTransition: CaseStageTransition = {
      stage: nextStage,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      notes,
    };

    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              currentStage: nextStage,
              stageHistory: [...c.stageHistory, newTransition],
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
    return true;
  };

  const moveToPreviousStage = (id: string, userId: string, userName: string, notes: string = ""): boolean => {
    const lawCase = cases.find((c) => c.id === id);
    if (!lawCase) return false;

    const currentIndex = CaseStagesOrder.indexOf(lawCase.currentStage);
    if (currentIndex <= 0) return false;

    const prevStage = CaseStagesOrder[currentIndex - 1];
    const newTransition: CaseStageTransition = {
      stage: prevStage,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      notes: notes || "إرجاع للمرحلة السابقة",
    };

    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              currentStage: prevStage,
              stageHistory: [...c.stageHistory, newTransition],
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
    return true;
  };

  const addComment = (caseId: string, userId: string, userName: string, content: string) => {
    const newComment: CaseComment = {
      id: generateId(),
      caseId,
      userId,
      userName,
      content,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [newComment, ...prev]);
  };

  const getCommentsByCaseId = (caseId: string) =>
    comments.filter((c) => c.caseId === caseId);

  return (
    <CasesContext.Provider
      value={{
        cases,
        comments,
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
        moveToNextStage,
        moveToPreviousStage,
        addComment,
        getCommentsByCaseId,
        getCaseById,
        getCasesByDepartment,
        getCasesByLawyer,
        getCasesByClient,
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
