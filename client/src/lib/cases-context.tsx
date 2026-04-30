import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { LawCase, CaseStatusValue, ReviewDecisionType, PriorityType, CaseTypeValue, CaseStageValue, CaseStageTransition, CaseComment, UserRoleType, CaseClassificationValue } from "@shared/schema";
import { CaseStatus, Priority, CaseStage, CaseStagesOrder, CaseClassification, getStagesForClassification } from "@shared/schema";
import { apiRequest, queryClient } from "./queryClient";
import { validateCaseForward, validateCaseBackward, normalizeCaseStage, createStageTransitionRecord } from "./transitions-engine";
import { notifyCaseAdded, notifyCaseAssigned, notifyCaseSentToReview, notifyCaseReturnedForRevision } from "./notification-triggers";
import { useAuth } from "./auth-context";
import { useDepartments } from "./departments-context";

interface CasesContextType {
  cases: LawCase[];
  comments: CaseComment[];
  isLoading: boolean;
  addCase: (data: Partial<LawCase>, createdBy: string, createdByName: string) => Promise<LawCase>;
  updateCase: (id: string, data: Partial<LawCase>) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  assignCase: (id: string, lawyerId: string, departmentId: string) => void;
  sendToReviewCommittee: (id: string) => void;
  approveCase: (id: string, notes?: string) => void;
  rejectCase: (id: string, notes: string, decision: ReviewDecisionType) => void;
  markReadyToSubmit: (id: string) => void;
  markSubmitted: (id: string) => void;
  closeCase: (id: string) => void;
  moveToNextStage: (id: string, userId: string, userName: string, notes?: string, userRole?: string, internalReviewerId?: string, reviewDecision?: string, extraFields?: Record<string, unknown>, explicitTargetStage?: string) => Promise<boolean>;
  moveToPreviousStage: (id: string, userId: string, userName: string, notes?: string, userRole?: string, internalReviewerId?: string) => Promise<boolean>;
  skipDataCompletion: (id: string, userId: string, userName: string, notes?: string) => Promise<boolean>;
  addComment: (caseId: string, userId: string, userName: string, content: string) => Promise<void>;
  fetchComments: (caseId: string) => Promise<void>;
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

// Helper to migrate old cases without new fields
const migrateCase = (c: LawCase): LawCase => {
  if (!c.currentStage) {
    c.currentStage = normalizeCaseStage(c.status as CaseStageValue) || CaseStage.RECEPTION;
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
  if (!c.caseClassification) {
    c.caseClassification = CaseClassification.UNDER_STUDY;
  }
  if (c.previousHearingsCount === undefined) {
    c.previousHearingsCount = 0;
  }
  if (!c.currentSituation) {
    c.currentSituation = "";
  }
  if (c.responseDeadline === undefined) {
    c.responseDeadline = null;
  }
  return c;
};

export function CasesProvider({ children }: { children: React.ReactNode }) {
  const [cases, setCases] = useState<LawCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [comments, setComments] = useState<CaseComment[]>([]);
  const { user } = useAuth();
  const { getDepartmentName } = useDepartments();
  const backgroundRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve the stage-order array for a case. Department resolution via
  // getDepartmentName is the primary path ("تجاري" / "عام" / "عمالي" /
  // "إداري"), but it returns "غير محدد" for any id that isn't in its
  // hard-coded list — which silently routed commercial cases onto the
  // general path and made moveToNextStage return false with no PATCH when
  // the current stage (e.g. قيد_التدقيق_في_تراضي) didn't exist in that
  // path. To make the client robust against department resolution failures,
  // if the primary lookup doesn't contain the case's current stage we fall
  // back to every known path and pick the first one that does.
  const resolveStagesOrderForCase = (lawCase: LawCase): CaseStageValue[] => {
    const classification = (lawCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue;
    const deptLabel = getDepartmentName(lawCase.departmentId || "");
    const clientRole = (lawCase as any).clientRole as string | undefined;
    const memoRequired = !!(lawCase as any).memoRequired;
    const isSettlementCase = !!(lawCase as any).isSettlementCase;
    const primary = getStagesForClassification(classification, deptLabel as any, clientRole, memoRequired, isSettlementCase);
    if (primary.indexOf(lawCase.currentStage) >= 0) return primary;
    // IN_COURT has multiple variants keyed on clientRole/memoRequired/isSettlementCase,
    // not on caseType. Fall back across all IN_COURT variants if the current stage
    // isn't in the primary choice.
    if (classification === "منظورة_بالمحكمة") {
      const variants = [
        getStagesForClassification(classification, deptLabel as any, undefined, false, true),
        getStagesForClassification(classification, deptLabel as any, "مدعى_عليه", true),
        getStagesForClassification(classification, deptLabel as any, "مدعي", true),
        getStagesForClassification(classification, deptLabel as any, undefined, false),
      ];
      for (const v of variants) {
        if (v.indexOf(lawCase.currentStage) >= 0) return v;
      }
      return primary;
    }
    const candidates = [
      getStagesForClassification(classification, "تجاري" as any, clientRole, memoRequired),
      getStagesForClassification(classification, "عام" as any, clientRole, memoRequired),
      getStagesForClassification(classification, "عمالي" as any, clientRole, memoRequired),
      getStagesForClassification(classification, "إداري" as any, clientRole, memoRequired),
    ];
    for (const c of candidates) {
      if (c.indexOf(lawCase.currentStage) >= 0) return c;
    }
    return primary;
  };

  const fetchCases = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("lawfirm_token");
      if (!token) { setIsLoading(false); return; }
      const headers: Record<string, string> = { "Authorization": `Bearer ${token}` };
      const csrfToken = localStorage.getItem("lawfirm_csrf_token");
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const response = await fetch("/api/cases", { headers, credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setCases(data.map(migrateCase));
      } else if (response.status === 401) {
        try {
          const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.token) {
              localStorage.setItem("lawfirm_token", refreshData.token);
              if (refreshData.csrfToken) localStorage.setItem("lawfirm_csrf_token", refreshData.csrfToken);
              const retryHeaders: Record<string, string> = { "Authorization": `Bearer ${refreshData.token}` };
              if (refreshData.csrfToken) retryHeaders["X-CSRF-Token"] = refreshData.csrfToken;
              const retryResponse = await fetch("/api/cases", { headers: retryHeaders, credentials: "include" });
              if (retryResponse.ok) {
                const data = await retryResponse.json();
                setCases(data.map(migrateCase));
              }
            }
          }
        } catch (_) {}
      }
    } catch (error) {
      console.error("Failed to fetch cases:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchCases();
    } else {
      setCases([]);
    }
  }, [user, fetchCases]);

  // Debounced background refetch: after any targeted local update, schedule a
  // silent re-sync 5s later. Further updates within the window reset the
  // timer, so a burst of edits produces one reconciliation round-trip.
  const scheduleBackgroundRefetch = useCallback(() => {
    if (backgroundRefetchRef.current) {
      clearTimeout(backgroundRefetchRef.current);
    }
    backgroundRefetchRef.current = setTimeout(() => {
      backgroundRefetchRef.current = null;
      fetchCases().catch(() => {});
    }, 5000);
  }, [fetchCases]);

  useEffect(() => {
    return () => {
      if (backgroundRefetchRef.current) {
        clearTimeout(backgroundRefetchRef.current);
      }
    };
  }, []);

  const addCase = async (data: Partial<LawCase>, createdBy: string, createdByName: string): Promise<LawCase> => {
    const now = new Date().toISOString();
    const initialStage: CaseStageValue = CaseStage.RECEPTION;
    const caseData = {
      clientId: data.clientId || "",
      plaintiffName: data.plaintiffName || "",
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
      caseClassification: data.caseClassification || CaseClassification.UNDER_STUDY,
      previousHearingsCount: data.previousHearingsCount || 0,
      currentSituation: data.currentSituation || "",
      responseDeadline: data.responseDeadline || null,
      nextHearingDate: (data as any).nextHearingDate || null,
      nextHearingTime: (data as any).nextHearingTime || null,
      adminCaseSubType: (data as any).adminCaseSubType || null,
      prescriptionDate: (data as any).prescriptionDate || null,
      memoRequired: (data as any).memoRequired || false,
      clientRole: (data as any).clientRole || null,
      grievanceRequired: (data as any).grievanceRequired || false,
      createdBy,
      startingStage: (data as any).startingStage || undefined,
    };
    
    console.log("[BUG2][cases-context] addCase request body:", {
      departmentId: caseData.departmentId,
      departmentIdType: typeof caseData.departmentId,
      caseType: caseData.caseType,
      caseClassification: caseData.caseClassification,
      departmentOther: caseData.departmentOther,
    });
    const response = await apiRequest("POST", "/api/cases", caseData);
    const newCase = await response.json();
    setCases((prev) => [migrateCase(newCase), ...prev]);
    scheduleBackgroundRefetch();
    if (newCase.autoCreated?.some((a: any) => a.type === "hearing")) {
      queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
    }
    if (newCase.departmentId) {
      notifyCaseAdded(newCase.id, newCase.caseNumber, newCase.departmentId).catch(() => {});
    }
    return newCase;
  };

  const updateCase = async (id: string, data: Partial<LawCase>): Promise<void> => {
    // Snapshot for rollback if the request fails.
    const previous = cases.find((c) => c.id === id);
    setCases((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c
      )
    );
    try {
      const response = await apiRequest("PATCH", `/api/cases/${id}`, data);
      try {
        const updatedCase = await response.json();
        setCases((prev) =>
          prev.map((c) => c.id === id ? migrateCase(updatedCase) : c)
        );
      } catch {
        // JSON parse failed — keep optimistic state (server confirmed the update).
      }
      scheduleBackgroundRefetch();
    } catch (err) {
      // Server rejected the update — roll back to the previous state.
      if (previous) {
        setCases((prev) => prev.map((c) => c.id === id ? previous : c));
      }
      throw err;
    }
  };

  const deleteCase = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/cases/${id}`);
    setCases((prev) => prev.filter((c) => c.id !== id));
    setComments((prev) => prev.filter((c) => c.caseId !== id));
  };

  const assignCase = (id: string, lawyerId: string, departmentId: string) => {
    const lawCase = cases.find(c => c.id === id);
    const isReassign = !!(lawCase?.primaryLawyerId);
    const updateData: any = {
      assignedLawyers: [lawyerId],
      primaryLawyerId: lawyerId,
      responsibleLawyerId: lawyerId,
      departmentId,
    };
    if (!isReassign) {
      updateData.status = CaseStatus.STUDY as CaseStatusValue;
    }
    updateCase(id, updateData);
    notifyCaseAssigned(id, lawCase?.caseNumber || "", lawyerId).catch(() => {});
  };

  const sendToReviewCommittee = (id: string) => {
    const lawCase = cases.find(c => c.id === id);
    updateCase(id, { status: CaseStatus.REVIEW_COMMITTEE as CaseStatusValue });
    notifyCaseSentToReview(id, lawCase?.caseNumber || "").catch(() => {});
  };

  const approveCase = (id: string, notes?: string) => {
    const lawCase = cases.find(c => c.id === id);
    if (!lawCase || !user) return;
    const newTransition = createStageTransitionRecord(
      CaseStage.READY_TO_SUBMIT,
      user.id,
      user.name,
      notes ? `اعتماد اللجنة - ${notes}` : "اعتماد اللجنة"
    );
    updateCase(id, {
      status: CaseStatus.READY_TO_SUBMIT as CaseStatusValue,
      currentStage: CaseStage.READY_TO_SUBMIT,
      stageHistory: [...(lawCase.stageHistory || []), newTransition],
      reviewDecision: "approved" as ReviewDecisionType,
      reviewNotes: notes || "",
    });
  };

  const rejectCase = (id: string, notes: string, decision: ReviewDecisionType) => {
    const lawCase = cases.find(c => c.id === id);
    if (!lawCase || !user) return;
    const newTransition = createStageTransitionRecord(
      CaseStage.TAKING_NOTES,
      user.id,
      user.name,
      notes || "إرجاع بملاحظات اللجنة"
    );
    updateCase(id, {
      status: CaseStatus.AMENDMENTS as CaseStatusValue,
      currentStage: CaseStage.TAKING_NOTES,
      stageHistory: [...(lawCase.stageHistory || []), newTransition],
      reviewDecision: decision,
      reviewNotes: notes,
    });
    notifyCaseReturnedForRevision(id, lawCase?.caseNumber || "", lawCase?.responsibleLawyerId || lawCase?.primaryLawyerId || null, notes).catch(() => {});
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

  const moveToNextStage = async (id: string, userId: string, userName: string, notes: string = "", userRole?: string, internalReviewerId?: string, reviewDecision?: string, extraFields?: Record<string, unknown>, explicitTargetStage?: string): Promise<boolean> => {
    const lawCase = cases.find((c) => c.id === id);
    if (!lawCase) return false;

    const normalized = normalizeCaseStage(lawCase.currentStage);

    // If the caller passed an explicit target stage (e.g. CaseProgressBar's
    // accept buttons that know exactly which stage to go to), trust it and
    // skip both validateCaseForward and the stagesOrder lookup. The server
    // is authoritative on which transitions are legal.
    let nextStage: CaseStageValue;
    if (explicitTargetStage) {
      nextStage = explicitTargetStage as CaseStageValue;
    } else {
      if (userRole) {
        const validation = validateCaseForward(lawCase.currentStage, userRole as UserRoleType, userId, lawCase, (lawCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue);
        if (!validation.allowed) {
          console.warn("انتقال مرفوض:", validation.reason);
          return false;
        }
      }
      const stagesOrder = resolveStagesOrderForCase(lawCase);
      const currentIndex = stagesOrder.indexOf(normalized);
      if (currentIndex === -1) {
        console.error("[moveToNextStage] current stage not found in any path", {
          caseId: id,
          currentStage: lawCase.currentStage,
          normalized,
          departmentId: lawCase.departmentId,
        });
        return false;
      }
      if (currentIndex >= stagesOrder.length - 1) {
        console.warn("[moveToNextStage] already at last stage of its path", {
          caseId: id,
          currentStage: lawCase.currentStage,
        });
        return false;
      }
      nextStage = stagesOrder[currentIndex + 1];
    }

    const newTransition = createStageTransitionRecord(nextStage, userId, userName, notes);

    const updateData: Record<string, unknown> = {
      currentStage: nextStage,
      stageHistory: [...lawCase.stageHistory, newTransition],
    };

    if ((nextStage === "مراجعة_داخلية" || nextStage === "مراجعة_داخلية_للتظلم") && internalReviewerId) {
      updateData.internalReviewerId = internalReviewerId;
    }

    if (normalized === "الأخذ_بالملاحظات" && nextStage === "جاهزة_للرفع" && reviewDecision) {
      updateData.reviewDecision = reviewDecision;
    }

    if (extraFields) {
      Object.assign(updateData, extraFields);
    }

    if (nextStage === "مقفلة") {
      updateData.status = CaseStatus.CLOSED as CaseStatusValue;
      updateData.closedAt = new Date().toISOString();
    }

    await updateCase(id, updateData);

    if (nextStage === CaseStage.REVIEW_COMMITTEE) {
      notifyCaseSentToReview(lawCase.id, lawCase.caseNumber).catch(() => {});
    }

    return true;
  };

  const moveToPreviousStage = async (id: string, userId: string, userName: string, notes: string = "", userRole?: string, internalReviewerId?: string): Promise<boolean> => {
    const lawCase = cases.find((c) => c.id === id);
    if (!lawCase) return false;

    if (userRole) {
      const validation = validateCaseBackward(lawCase.currentStage, userRole as UserRoleType, userId, lawCase, (lawCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue);
      if (!validation.allowed) {
        console.warn("إرجاع مرفوض:", validation.reason);
        return false;
      }
    }

    const normalized = normalizeCaseStage(lawCase.currentStage);
    const stagesOrder = resolveStagesOrderForCase(lawCase);
    const currentIndex = stagesOrder.indexOf(normalized);
    if (currentIndex <= 0) return false;

    const prevStage = stagesOrder[currentIndex - 1];
    const newTransition = createStageTransitionRecord(prevStage, userId, userName, notes || "إرجاع للمرحلة السابقة");

    const prevUpdateData: Record<string, unknown> = {
      currentStage: prevStage,
      stageHistory: [...lawCase.stageHistory, newTransition],
    };
    if ((prevStage === "مراجعة_داخلية" || prevStage === "مراجعة_داخلية_للتظلم") && internalReviewerId) {
      prevUpdateData.internalReviewerId = internalReviewerId;
    }
    await updateCase(id, prevUpdateData);

    if (prevStage === CaseStage.TAKING_NOTES) {
      const responsibleId = lawCase.responsibleLawyerId || lawCase.primaryLawyerId;
      if (responsibleId) {
        notifyCaseReturnedForRevision(lawCase.id, lawCase.caseNumber, responsibleId, notes).catch(() => {});
      }
    }

    return true;
  };

  const skipDataCompletion = async (id: string, userId: string, userName: string, notes: string = ""): Promise<boolean> => {
    try {
      const response = await apiRequest("POST", `/api/cases/${id}/skip-data-completion`, { notes });
      console.log("[skipDataCompletion] response status:", response.status);
      try {
        const updatedCase = await response.json();
        console.log("[skipDataCompletion] response body currentStage:", updatedCase?.currentStage);
        if (updatedCase && updatedCase.id) {
          setCases((prev) => prev.map((c) => c.id === id ? migrateCase(updatedCase) : c));
        }
      } catch (parseErr) {
        console.warn("[skipDataCompletion] response parse failed, but server accepted the transition", parseErr);
      }
      scheduleBackgroundRefetch();
      return true;
    } catch (err) {
      console.error("[skipDataCompletion] request failed", err);
      return false;
    }
  };

  const fetchComments = async (caseId: string) => {
    try {
      const response = await apiRequest("GET", `/api/cases/${caseId}/comments`);
      const data: CaseComment[] = await response.json();
      setComments((prev) => [
        ...prev.filter((c) => c.caseId !== caseId),
        ...data,
      ]);
    } catch {
      // fetch comments failed silently
    }
  };

  const addComment = async (caseId: string, userId: string, userName: string, content: string) => {
    const response = await apiRequest("POST", `/api/cases/${caseId}/comments`, { content });
    const saved: CaseComment = await response.json();
    setComments((prev) => [...prev, saved]);
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
        sendToReviewCommittee,
        approveCase,
        rejectCase,
        markReadyToSubmit,
        markSubmitted,
        closeCase,
        moveToNextStage,
        moveToPreviousStage,
        skipDataCompletion,
        addComment,
        fetchComments,
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
