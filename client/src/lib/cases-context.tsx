import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { LawCase, CaseStatusValue, ReviewDecisionType, CaseStageValue, CaseComment, UserRoleType, CaseClassificationValue } from "@shared/schema";
import { CaseStatus, Priority, CaseStage, CaseClassification, getStagesForClassification, caseNotificationRecipientId } from "@shared/schema";
import { apiRequest, queryClient } from "./queryClient";
import { validateCaseForward, validateCaseBackward, normalizeCaseStage, createStageTransitionRecord } from "./transitions-engine";
import { notifyCaseAssigned, notifyCaseReturnedForRevision } from "./notification-triggers";
import { useAuth } from "./auth-context";
import { useDepartments } from "./departments-context";

interface CasesContextType {
  cases: LawCase[];
  comments: CaseComment[];
  isLoading: boolean;
  addCase: (data: Partial<LawCase>, createdBy: string, createdByName: string) => Promise<LawCase>;
  updateCase: (id: string, data: Partial<LawCase>) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  assignCase: (id: string, lawyerId: string, departmentId: string, internalReviewerId?: string | null, litigatorId?: string | null) => void;
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



// Helper to migrate old cases without new fields
const migrateCase = (c: LawCase): LawCase => {
  if (!c.currentStage) {
    c.currentStage = normalizeCaseStage(c.status as CaseStageValue) || CaseStage.RECEPTION;
  }
  if (!c.stageHistory) {
    c.stageHistory = [{ stage: c.currentStage, timestamp: c.createdAt, userId: c.createdBy, userName: "النظام", notes: "تهجير البيانات" }];
  }
  // Keep the in-memory responsibleLawyerId populated from primaryLawyerId, the
  // field the UI actually sets. The guard was `=== undefined`, which the server
  // never produces (mapDbCase always returns the column), so it was effectively
  // dead; a falsy check also covers the NULL and "" rows that primary-only
  // assignment produces today and that batch 3 will produce for every case.
  //
  // ⚠ DELIBERATELY ONE-DIRECTIONAL — primary → responsible, never the reverse.
  // Filling primaryLawyerId from responsibleLawyerId here would change what the
  // edit dialog pre-selects (cases.tsx reads caseItem.primaryLawyerId into the
  // form), so the next save would persist a value the user never chose. That is
  // a write consequence, and this batch is reads-only. The primary-only READS
  // are fixed directly instead.
  if (!c.responsibleLawyerId && c.primaryLawyerId) {
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

  // Resolve the stage-order array for a case. The case's departmentId (a
  // stable FK to the departments table) is the routing key — getDepartmentName
  // returns one of "عام" / "تجاري" / "عمالي" / "إداري" for the four canonical
  // departments. Defensive fallback retained because getDepartmentName can
  // still yield "غير محدد" (legacy rows with no departmentId, the special
  // "أخرى" department, or transient mismatches while /api/departments is in
  // flight): if the primary lookup doesn't contain the case's current stage
  // we scan every variant and pick the first that does, which keeps
  // moveToNextStage from returning false with no PATCH on edge-case data.
  const resolveStagesOrderForCase = (lawCase: LawCase): CaseStageValue[] => {
    const classification = (lawCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue;
    const departmentName = getDepartmentName(lawCase.departmentId || "");
    const clientRole = (lawCase as any).clientRole as string | undefined;
    const memoRequired = !!(lawCase as any).memoRequired;
    const isSettlementCase = !!(lawCase as any).isSettlementCase;
    const primary = getStagesForClassification(classification, departmentName, clientRole, memoRequired, isSettlementCase);
    if (primary.indexOf(lawCase.currentStage) >= 0) return primary;
    // IN_COURT has multiple variants keyed on clientRole/memoRequired/isSettlementCase,
    // not on department. Fall back across all IN_COURT variants if the current stage
    // isn't in the primary choice.
    if (classification === "منظورة_بالمحكمة") {
      const variants = [
        getStagesForClassification(classification, departmentName, undefined, false, true),
        getStagesForClassification(classification, departmentName, "مدعى_عليه", true),
        getStagesForClassification(classification, departmentName, "مدعي", true),
        getStagesForClassification(classification, departmentName, undefined, false),
      ];
      for (const v of variants) {
        if (v.indexOf(lawCase.currentStage) >= 0) return v;
      }
      return primary;
    }
    const candidates = [
      getStagesForClassification(classification, "تجاري", clientRole, memoRequired),
      getStagesForClassification(classification, "عام", clientRole, memoRequired),
      getStagesForClassification(classification, "عمالي", clientRole, memoRequired),
      getStagesForClassification(classification, "إداري", clientRole, memoRequired),
    ];
    for (const c of candidates) {
      if (c.indexOf(lawCase.currentStage) >= 0) return c;
    }
    return primary;
  };

  const fetchCases = useCallback(async () => {
    const token = localStorage.getItem("lawfirm_token");
    if (!token) { setIsLoading(false); return; }
    try {
      setIsLoading(true);
      // apiRequest carries the shared single-flight refresh + 401 retry from
      // queryClient. The hand-rolled inline retry that used to live here raced
      // the scheduled refresh and could leave the list empty until reload.
      const response = await apiRequest("GET", "/api/cases");
      const data = await response.json();
      setCases(data.map(migrateCase));
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
      // responsibleLawyerId is no longer sent — primaryLawyerId is the single
      // canonical field (batch 3). The server hard-nulls the legacy column on
      // insert anyway, so the row is identical either way.
      primaryLawyerId: null,
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
    
    const response = await apiRequest("POST", "/api/cases", caseData);
    const newCase = await response.json();
    setCases((prev) => [migrateCase(newCase), ...prev]);
    scheduleBackgroundRefetch();
    if (newCase.autoCreated?.some((a: any) => a.type === "hearing")) {
      queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
    }
    // The department-head notice now fires from POST /api/cases itself. It used
    // to be posted from here with a `.catch(() => {})` that discarded the only
    // evidence it had failed.
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

  const assignCase = (id: string, lawyerId: string, departmentId: string, internalReviewerId?: string | null, litigatorId?: string | null) => {
    const lawCase = cases.find(c => c.id === id);
    const isReassign = !!(lawCase?.primaryLawyerId);
    const updateData: any = {
      assignedLawyers: [lawyerId],
      // ONE canonical field. responsibleLawyerId used to be written here with the
      // SAME lawyerId — the assign dialog has always had one control, labelled
      // "المحامي المسؤول". The server clears the legacy column when the primary
      // changes, so it cannot be left naming a superseded lawyer.
      primaryLawyerId: lawyerId,
      departmentId,
    };
    // The internal reviewer slot is the persistent intake-time choice. Pass
    // through `null` so the dept head can clear it; only `undefined` skips
    // the field (preserving the existing value).
    if (internalReviewerId !== undefined) {
      updateData.internalReviewerId = internalReviewerId || null;
    }
    // "المترافع" — same pass-through-null contract as the reviewer above, so the
    // dept head can CLEAR the override; `undefined` skips the field entirely and
    // preserves whatever is stored.
    if (litigatorId !== undefined) {
      updateData.litigatorId = litigatorId || null;
    }
    if (!isReassign) {
      updateData.status = CaseStatus.STUDY as CaseStatusValue;
    }
    updateCase(id, updateData);
    notifyCaseAssigned(id, lawCase?.caseNumber || "", lawyerId).catch(() => {});
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
    // SECOND caller of notifyCaseReturnedForRevision — it had its own inline copy
    // of the chain, in the OLD responsible-first order, so the two callers could
    // notify different people about the same event. Both now use the helper.
    notifyCaseReturnedForRevision(id, lawCase?.caseNumber || "", caseNotificationRecipientId(lawCase) || null, notes).catch(() => {});
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
    cases.filter((c) =>
      c.assignedLawyers.includes(lawyerId)
      || c.primaryLawyerId === lawyerId
      // responsibleLawyerId was missing entirely, so a responsible-only case did
      // not count as one of that lawyer's cases.
      || c.responsibleLawyerId === lawyerId);

  const getActiveCases = () =>
    cases.filter((c) => c.status !== CaseStatus.CLOSED);

  // Count cases at the review committee by the CURRENT-STAGE convention
  // (إحالة_للجنة_المراجعة) — the real workflow signal — OR'd with the legacy
  // status="لجنة_المراجعة" for backward-compat with older rows. The redundant
  // "إرسال للمراجعة" button that used to write only the legacy status was
  // removed; advancing the stage is now the single path into committee review.
  // Mirrors the dashboard's own committee predicate (dashboard.tsx).
  const getReviewCases = () =>
    cases.filter(
      (c) =>
        c.currentStage === CaseStage.REVIEW_COMMITTEE ||
        c.status === CaseStatus.REVIEW_COMMITTEE,
    );

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
        const validation = validateCaseForward(
          lawCase.currentStage,
          userRole as UserRoleType,
          userId,
          lawCase,
          (lawCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue,
          getDepartmentName(lawCase.departmentId || ""),
        );
        if (!validation.allowed) {
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

    // The committee-referral notice now fires from PATCH /api/cases/:id itself,
    // which is where the committee authority gate lives — so the chair who is
    // told is the chair who may decide, labor included.
    return true;
  };

  const moveToPreviousStage = async (id: string, userId: string, userName: string, notes: string = "", userRole?: string, internalReviewerId?: string): Promise<boolean> => {
    const lawCase = cases.find((c) => c.id === id);
    if (!lawCase) return false;

    if (userRole) {
      const validation = validateCaseBackward(
        lawCase.currentStage,
        userRole as UserRoleType,
        userId,
        lawCase,
        (lawCase.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue,
        getDepartmentName(lawCase.departmentId || ""),
      );
      if (!validation.allowed) {
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
      const responsibleId = caseNotificationRecipientId(lawCase);
      if (responsibleId) {
        notifyCaseReturnedForRevision(lawCase.id, lawCase.caseNumber, responsibleId, notes).catch(() => {});
      }
    }

    return true;
  };

  const skipDataCompletion = async (id: string, userId: string, userName: string, notes: string = ""): Promise<boolean> => {
    try {
      const response = await apiRequest("POST", `/api/cases/${id}/skip-data-completion`, { notes });
      try {
        const updatedCase = await response.json();
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
