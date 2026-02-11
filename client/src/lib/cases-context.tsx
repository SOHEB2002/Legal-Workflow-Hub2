import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { LawCase, CaseStatusValue, ReviewDecisionType, PriorityType, CaseTypeValue, CaseStageValue, CaseStageTransition, CaseComment } from "@shared/schema";
import { CaseStatus, Priority, CaseStage, CaseStagesOrder } from "@shared/schema";
import { apiRequest } from "./queryClient";

interface CasesContextType {
  cases: LawCase[];
  comments: CaseComment[];
  isLoading: boolean;
  addCase: (data: Partial<LawCase>, createdBy: string, createdByName: string) => Promise<LawCase>;
  updateCase: (id: string, data: Partial<LawCase>) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  assignCase: (id: string, lawyerId: string, departmentId: string) => void;
  sendToDepartmentHead: (id: string) => void;
  sendToReviewCommittee: (id: string) => void;
  approveCase: (id: string, notes?: string) => void;
  rejectCase: (id: string, notes: string, decision: ReviewDecisionType) => void;
  markReadyToSubmit: (id: string) => void;
  markSubmitted: (id: string) => void;
  closeCase: (id: string) => void;
  moveToNextStage: (id: string, userId: string, userName: string, notes?: string) => Promise<boolean>;
  moveToPreviousStage: (id: string, userId: string, userName: string, notes?: string) => Promise<boolean>;
  addComment: (caseId: string, userId: string, userName: string, content: string) => void;
  getCommentsByCaseId: (caseId: string) => CaseComment[];
  getCaseById: (id: string) => LawCase | undefined;
  getCasesByDepartment: (departmentId: string) => LawCase[];
  getCasesByLawyer: (lawyerId: string) => LawCase[];
  getCasesByClient: (clientId: string) => LawCase[];
  getActiveCases: () => LawCase[];
  getReviewCases: () => LawCase[];
  getReadyCases: () => LawCase[];
  refreshCases: () => Promise<void>;
}

const CasesContext = createContext<CasesContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substr(2, 9);
const generateCaseNumber = () => `C-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

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
  const [cases, setCases] = useState<LawCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [comments, setComments] = useState<CaseComment[]>([]);

  const fetchCases = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("lawfirm_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const response = await fetch("/api/cases", { headers });
      if (response.ok) {
        const data = await response.json();
        setCases(data.map(migrateCase));
      }
    } catch (error) {
      console.error("Error fetching cases:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const addCase = async (data: Partial<LawCase>, createdBy: string, createdByName: string): Promise<LawCase> => {
    const now = new Date().toISOString();
    const initialStage: CaseStageValue = CaseStage.RECEIVED;
    const caseData = {
      caseNumber: generateCaseNumber(),
      clientId: data.clientId || "",
      caseType: data.caseType || "عام",
      caseTypeOther: data.caseTypeOther || "",
      departmentOther: data.departmentOther || "",
      status: CaseStatus.RECEIVED,
      currentStage: initialStage,
      stageHistory: [{ stage: initialStage, timestamp: now, userId: createdBy, userName: createdByName, notes: "استلام القضية" }],
      departmentId: data.departmentId || "",
      assignedLawyers: [],
      primaryLawyerId: null,
      responsibleLawyerId: data.responsibleLawyerId || null,
      courtName: data.courtName || "",
      courtCaseNumber: data.courtCaseNumber || "",
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
    };
    
    const response = await apiRequest("POST", "/api/cases", caseData);
    const newCase = await response.json();
    setCases((prev) => [migrateCase(newCase), ...prev]);
    return newCase;
  };

  const updateCase = async (id: string, data: Partial<LawCase>): Promise<void> => {
    await apiRequest("PATCH", `/api/cases/${id}`, data);
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...data, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const deleteCase = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/cases/${id}`);
    setCases((prev) => prev.filter((c) => c.id !== id));
  };

  const assignCase = (id: string, lawyerId: string, departmentId: string) => {
    updateCase(id, {
      assignedLawyers: [lawyerId],
      primaryLawyerId: lawyerId,
      departmentId,
      status: CaseStatus.STUDY as CaseStatusValue,
    });
  };

  const sendToDepartmentHead = (id: string) => {
    updateCase(id, { status: CaseStatus.DRAFTING as CaseStatusValue });
  };

  const sendToReviewCommittee = (id: string) => {
    updateCase(id, { status: CaseStatus.REVIEW_COMMITTEE as CaseStatusValue });
  };

  const approveCase = (id: string, notes?: string) => {
    updateCase(id, {
      status: CaseStatus.READY_TO_SUBMIT as CaseStatusValue,
      reviewDecision: "approved" as ReviewDecisionType,
      reviewNotes: notes || "",
    });
  };

  const rejectCase = (id: string, notes: string, decision: ReviewDecisionType) => {
    updateCase(id, {
      status: CaseStatus.AMENDMENTS as CaseStatusValue,
      reviewDecision: decision,
      reviewNotes: notes,
    });
  };

  const markReadyToSubmit = (id: string) => {
    updateCase(id, { status: CaseStatus.READY_TO_SUBMIT as CaseStatusValue });
  };

  const markSubmitted = (id: string) => {
    updateCase(id, { status: CaseStatus.SUBMITTED as CaseStatusValue });
  };

  const closeCase = (id: string) => {
    updateCase(id, {
      status: CaseStatus.CLOSED as CaseStatusValue,
      closedAt: new Date().toISOString(),
    });
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

  const moveToNextStage = async (id: string, userId: string, userName: string, notes: string = ""): Promise<boolean> => {
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

    await updateCase(id, {
      currentStage: nextStage,
      stageHistory: [...lawCase.stageHistory, newTransition],
    });
    return true;
  };

  const moveToPreviousStage = async (id: string, userId: string, userName: string, notes: string = ""): Promise<boolean> => {
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

    await updateCase(id, {
      currentStage: prevStage,
      stageHistory: [...lawCase.stageHistory, newTransition],
    });
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
        isLoading,
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
        refreshCases: fetchCases,
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
