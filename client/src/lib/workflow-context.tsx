import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  WorkflowCaseStageValue,
  ConsultationStageValue,
  WorkflowCaseStage,
  ConsultationStage,
  WorkflowCaseStagesOrder,
  ConsultationStagesOrder,
  CasePriorityValue,
  CasePriority,
  StageTransition,
  ReviewNote,
  ReviewNoteActionValue,
  EmployeeWorkload,
  DefaultSLASettings,
  StageSLA,
  LawCase,
  Consultation,
  NotificationType,
} from "@shared/schema";
import { useCases } from "./cases-context";
import { useConsultations } from "./consultations-context";
import { useAuth } from "./auth-context";
import { useNotifications } from "./notifications-context";

const generateId = () => Math.random().toString(36).substring(2, 11);

interface WorkflowContextType {
  stageTransitions: StageTransition[];
  reviewNotes: ReviewNote[];
  slaSettings: StageSLA[];
  
  receiveCaseFromClient: (caseData: Partial<LawCase>, priority: CasePriorityValue) => Promise<void>;
  assignCaseToDepartment: (caseId: string, departmentId: string, assignedTo: string) => void;
  updateCaseWorkflowStage: (caseId: string, newStage: WorkflowCaseStageValue, notes: string) => void;
  sendCaseToReview: (caseId: string) => void;
  submitReviewNotes: (entityType: "case" | "consultation", entityId: string, notes: string, action: ReviewNoteActionValue | null) => void;
  respondToReviewNotes: (entityType: "case" | "consultation", entityId: string, noteId: string, action: ReviewNoteActionValue, justification: string) => void;
  returnCase: (caseId: string, reason: string) => void;
  submitToCourtSystem: (caseId: string) => void;
  
  assignConsultationToDepartment: (consultationId: string, departmentId: string, assignedTo: string) => void;
  updateConsultationWorkflowStage: (consultationId: string, newStage: ConsultationStageValue, notes: string) => void;
  sendConsultationToReview: (consultationId: string) => void;
  returnConsultation: (consultationId: string, reason: string) => void;
  sendConsultationToClient: (consultationId: string) => void;
  
  checkOverdueItems: () => { cases: LawCase[]; consultations: Consultation[] };
  getStageDeadline: (stage: WorkflowCaseStageValue | ConsultationStageValue, priority: CasePriorityValue, startTime: string) => Date;
  getTimeRemaining: (entityId: string, entityType: "case" | "consultation") => { hours: number; isOverdue: boolean; percentage: number };
  getSLAReport: (startDate: string, endDate: string) => { onTime: number; late: number; total: number; percentage: number };
  
  getEmployeeWorkload: (employeeId: string) => EmployeeWorkload | null;
  getDepartmentWorkload: (departmentId: string) => EmployeeWorkload[];
  getWorkloadOverview: () => EmployeeWorkload[];
  suggestReassignment: (caseId: string) => { employeeId: string; name: string; reason: string } | null;
  
  getReviewAcceptanceRate: (id: string, type: "employee" | "department") => { accepted: number; rejected: number; partial: number; returned: number; total: number };
  getAvgCompletionTime: (entityType: "case" | "consultation", stage: WorkflowCaseStageValue | ConsultationStageValue) => number;
  getReturnRate: (id: string, type: "employee" | "department") => { returnCount: number; total: number; rate: number };
  getBottleneckReport: () => { stage: string; avgDuration: number; overdueCount: number }[];
  
  getStageHistory: (entityId: string) => StageTransition[];
  getReviewNotesForEntity: (entityId: string) => ReviewNote[];
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

const STORAGE_KEYS = {
  TRANSITIONS: "workflow_transitions",
  REVIEW_NOTES: "workflow_review_notes",
};

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { cases, updateCase, addCase } = useCases();
  const { consultations, updateConsultation } = useConsultations();
  const { user } = useAuth();
  const { triggerWorkflowNotification } = useNotifications();
  
  const [stageTransitions, setStageTransitions] = useState<StageTransition[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TRANSITIONS);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [reviewNotes, setReviewNotes] = useState<ReviewNote[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REVIEW_NOTES);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [slaSettings] = useState<StageSLA[]>(DefaultSLASettings);
  
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TRANSITIONS, JSON.stringify(stageTransitions));
  }, [stageTransitions]);
  
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REVIEW_NOTES, JSON.stringify(reviewNotes));
  }, [reviewNotes]);
  
  const getSLAForStage = (stage: WorkflowCaseStageValue | ConsultationStageValue): StageSLA | undefined => {
    return slaSettings.find(s => s.stage === stage);
  };
  
  const calculateDuration = (startTime: string): number => {
    const start = new Date(startTime).getTime();
    const now = new Date().getTime();
    return Math.round((now - start) / (1000 * 60 * 60));
  };
  
  const addTransition = (
    entityType: "case" | "consultation",
    entityId: string,
    fromStage: WorkflowCaseStageValue | ConsultationStageValue | null,
    toStage: WorkflowCaseStageValue | ConsultationStageValue,
    notes: string,
    duration: number,
    isOverdue: boolean
  ) => {
    const transition: StageTransition = {
      id: generateId(),
      entityType,
      entityId,
      fromStage,
      toStage,
      performedBy: user?.id || "",
      performedByRole: user?.role || "",
      notes,
      duration,
      isOverdue,
      createdAt: new Date().toISOString(),
    };
    setStageTransitions(prev => [...prev, transition]);
  };
  
  const receiveCaseFromClient = async (caseData: Partial<LawCase>, priority: CasePriorityValue) => {
    const now = new Date().toISOString();
    const sla = getSLAForStage(WorkflowCaseStage.RECEIVED);
    const deadline = sla 
      ? new Date(Date.now() + sla.maxDurationHours * 60 * 60 * 1000).toISOString()
      : null;
    
    const newCase: Partial<LawCase> = {
      ...caseData,
      currentStage: "استلام",
      status: "استلام",
      stageHistory: [{
        stage: "استلام",
        timestamp: now,
        userId: user?.id || "",
        userName: user?.name || "",
        notes: "استلام القضية من العميل",
      }],
    };
    
    await addCase(newCase as Omit<LawCase, "id" | "createdAt" | "updatedAt">, user?.id || "", user?.name || "");
  };
  
  const assignCaseToDepartment = (caseId: string, departmentId: string, assignedTo: string) => {
    const lawCase = cases.find(c => c.id === caseId);
    if (!lawCase) return;
    
    const duration = calculateDuration(lawCase.createdAt);
    const sla = getSLAForStage(WorkflowCaseStage.RECEIVED);
    const isOverdue = sla ? duration > sla.maxDurationHours : false;
    
    addTransition("case", caseId, "received", "assigned_to_department", "تم إحالة القضية للقسم", duration, isOverdue);
    
    updateCase(caseId, {
      departmentId,
      primaryLawyerId: assignedTo,
      currentStage: "استكمال_البيانات",
      status: "استكمال_البيانات",
    });
    
    triggerWorkflowNotification({
      type: NotificationType.CASE_ASSIGNED,
      entityType: "case",
      entityId: caseId,
      entityName: lawCase.caseNumber,
      stage: "استكمال_البيانات",
    }, [assignedTo]);
  };
  
  const updateCaseWorkflowStage = (caseId: string, newStage: WorkflowCaseStageValue, notes: string) => {
    const lawCase = cases.find(c => c.id === caseId);
    if (!lawCase) return;
    
    const lastTransition = stageTransitions
      .filter(t => t.entityId === caseId && t.entityType === "case")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    const fromStage = lastTransition?.toStage || "received";
    const stageStartTime = lastTransition?.createdAt || lawCase.createdAt;
    const duration = calculateDuration(stageStartTime);
    const sla = getSLAForStage(fromStage as WorkflowCaseStageValue);
    const isOverdue = sla ? duration > sla.maxDurationHours : false;
    
    addTransition("case", caseId, fromStage, newStage, notes, duration, isOverdue);
    
    const stageMapping: Record<WorkflowCaseStageValue, string> = {
      received: "استلام",
      assigned_to_department: "استكمال_البيانات",
      collecting_documents: "استكمال_البيانات",
      under_study: "دراسة",
      drafting_lawsuit: "تحرير_المذكرة",
      drafting_response: "تحرير_المذكرة",
      in_review: "لجنة_المراجعة",
      review_notes_received: "تعديلات",
      processing_notes: "تعديلات",
      returned_for_revision: "تعديلات",
      ready_to_submit: "جاهز_للرفع",
      submitted_to_court: "مرفوع",
    };
    
    updateCase(caseId, {
      currentStage: stageMapping[newStage] as any,
      status: stageMapping[newStage] as any,
    });
    
    if (lawCase.primaryLawyerId) {
      triggerWorkflowNotification({
        type: NotificationType.STAGE_CHANGED,
        entityType: "case",
        entityId: caseId,
        entityName: lawCase.caseNumber,
        stage: stageMapping[newStage],
        previousStage: fromStage as string,
      }, [lawCase.primaryLawyerId]);
    }
  };
  
  const sendCaseToReview = (caseId: string) => {
    updateCaseWorkflowStage(caseId, WorkflowCaseStage.IN_REVIEW, "تم إرسال القضية للجنة المراجعة");
  };
  
  const submitReviewNotes = (
    entityType: "case" | "consultation",
    entityId: string,
    notes: string,
    action: ReviewNoteActionValue | null
  ) => {
    const existingNotes = reviewNotes.filter(n => n.entityId === entityId);
    const returnCount = existingNotes.filter(n => n.action === "returned").length;
    
    const note: ReviewNote = {
      id: generateId(),
      entityType,
      entityId,
      reviewerId: user?.id || "",
      reviewerName: user?.name || "",
      notes,
      action,
      actionJustification: "",
      acceptedItems: [],
      rejectedItems: [],
      returnCount: action === "returned" ? returnCount + 1 : returnCount,
      returnReason: action === "returned" ? notes : "",
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    
    setReviewNotes(prev => [...prev, note]);
    
    if (entityType === "case") {
      if (action === "returned") {
        updateCaseWorkflowStage(entityId, WorkflowCaseStage.RETURNED_FOR_REVISION, "تم إرجاع القضية للتعديل");
      } else {
        updateCaseWorkflowStage(entityId, WorkflowCaseStage.REVIEW_NOTES_RECEIVED, "تم استلام ملاحظات المراجعة");
      }
    } else {
      if (action === "returned") {
        updateConsultationWorkflowStage(entityId, ConsultationStage.RETURNED_FOR_REVISION, "تم إرجاع الاستشارة للتعديل");
      } else {
        updateConsultationWorkflowStage(entityId, ConsultationStage.REVIEW_NOTES_RECEIVED, "تم استلام ملاحظات المراجعة");
      }
    }
  };
  
  const respondToReviewNotes = (
    entityType: "case" | "consultation",
    entityId: string,
    noteId: string,
    action: ReviewNoteActionValue,
    justification: string
  ) => {
    setReviewNotes(prev => prev.map(n => 
      n.id === noteId
        ? { ...n, action, actionJustification: justification, respondedAt: new Date().toISOString() }
        : n
    ));
    
    if (entityType === "case") {
      updateCaseWorkflowStage(entityId, WorkflowCaseStage.PROCESSING_NOTES, "جاري معالجة الملاحظات");
    } else {
      updateConsultationWorkflowStage(entityId, ConsultationStage.PROCESSING_NOTES, "جاري معالجة الملاحظات");
    }
  };
  
  const returnCase = (caseId: string, reason: string) => {
    const lawCase = cases.find(c => c.id === caseId);
    updateCaseWorkflowStage(caseId, WorkflowCaseStage.RETURNED_FOR_REVISION, reason);
    
    const existingNotes = reviewNotes.filter(n => n.entityId === caseId);
    const returnCount = existingNotes.filter(n => n.action === "returned").length + 1;
    
    const note: ReviewNote = {
      id: generateId(),
      entityType: "case",
      entityId: caseId,
      reviewerId: user?.id || "",
      reviewerName: user?.name || "",
      notes: reason,
      action: "returned",
      actionJustification: "",
      acceptedItems: [],
      rejectedItems: [],
      returnCount,
      returnReason: reason,
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    
    setReviewNotes(prev => [...prev, note]);
    
    if (lawCase?.primaryLawyerId) {
      triggerWorkflowNotification({
        type: NotificationType.RETURNED_FOR_REVISION,
        entityType: "case",
        entityId: caseId,
        entityName: lawCase.caseNumber,
        returnReason: reason,
        returnCount,
      }, [lawCase.primaryLawyerId]);
      
      if (returnCount >= 3) {
        triggerWorkflowNotification({
          type: NotificationType.THIRD_RETURN_WARNING,
          entityType: "case",
          entityId: caseId,
          entityName: lawCase.caseNumber,
          count: returnCount,
          employeeName: lawCase.primaryLawyerId,
        }, [lawCase.departmentId]);
      }
    }
  };
  
  const submitToCourtSystem = (caseId: string) => {
    updateCaseWorkflowStage(caseId, WorkflowCaseStage.SUBMITTED_TO_COURT, "تم رفع القضية في المحكمة");
  };
  
  const assignConsultationToDepartment = (consultationId: string, departmentId: string, assignedTo: string) => {
    const consultation = consultations.find(c => c.id === consultationId);
    if (!consultation) return;
    
    const duration = calculateDuration(consultation.createdAt);
    const sla = getSLAForStage(ConsultationStage.RECEIVED);
    const isOverdue = sla ? duration > sla.maxDurationHours : false;
    
    addTransition("consultation", consultationId, "received", "assigned_to_department", "تم إحالة الاستشارة للقسم", duration, isOverdue);
    
    updateConsultation(consultationId, {
      departmentId,
      assignedTo,
      status: "دراسة",
    });
    
    triggerWorkflowNotification({
      type: NotificationType.CONSULTATION_ASSIGNED,
      entityType: "consultation",
      entityId: consultationId,
      entityName: consultation.consultationNumber,
      stage: "دراسة",
    }, [assignedTo]);
  };
  
  const updateConsultationWorkflowStage = (consultationId: string, newStage: ConsultationStageValue, notes: string) => {
    const consultation = consultations.find(c => c.id === consultationId);
    if (!consultation) return;
    
    const lastTransition = stageTransitions
      .filter(t => t.entityId === consultationId && t.entityType === "consultation")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    const fromStage = lastTransition?.toStage || "received";
    const stageStartTime = lastTransition?.createdAt || consultation.createdAt;
    const duration = calculateDuration(stageStartTime);
    const sla = getSLAForStage(fromStage as ConsultationStageValue);
    const isOverdue = sla ? duration > sla.maxDurationHours : false;
    
    addTransition("consultation", consultationId, fromStage, newStage, notes, duration, isOverdue);
    
    const stageMapping: Record<ConsultationStageValue, string> = {
      received: "استلام",
      assigned_to_department: "دراسة",
      drafting: "إعداد_الرد",
      in_review: "لجنة_المراجعة",
      review_notes_received: "تعديلات",
      processing_notes: "تعديلات",
      returned_for_revision: "تعديلات",
      ready_to_send: "جاهز",
      sent_to_client: "مسلّم",
    };
    
    updateConsultation(consultationId, {
      status: stageMapping[newStage] as any,
    });
  };
  
  const sendConsultationToReview = (consultationId: string) => {
    updateConsultationWorkflowStage(consultationId, ConsultationStage.IN_REVIEW, "تم إرسال الاستشارة للجنة المراجعة");
  };
  
  const returnConsultation = (consultationId: string, reason: string) => {
    updateConsultationWorkflowStage(consultationId, ConsultationStage.RETURNED_FOR_REVISION, reason);
    
    const existingNotes = reviewNotes.filter(n => n.entityId === consultationId);
    const returnCount = existingNotes.filter(n => n.action === "returned").length + 1;
    
    const note: ReviewNote = {
      id: generateId(),
      entityType: "consultation",
      entityId: consultationId,
      reviewerId: user?.id || "",
      reviewerName: user?.name || "",
      notes: reason,
      action: "returned",
      actionJustification: "",
      acceptedItems: [],
      rejectedItems: [],
      returnCount,
      returnReason: reason,
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };
    
    setReviewNotes(prev => [...prev, note]);
  };
  
  const sendConsultationToClient = (consultationId: string) => {
    updateConsultationWorkflowStage(consultationId, ConsultationStage.SENT_TO_CLIENT, "تم إرسال الاستشارة للعميل");
  };
  
  const checkOverdueItems = () => {
    const overdueCases = cases.filter(c => {
      const lastTransition = stageTransitions
        .filter(t => t.entityId === c.id && t.entityType === "case")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      if (!lastTransition) return false;
      
      const sla = getSLAForStage(lastTransition.toStage as WorkflowCaseStageValue);
      if (!sla) return false;
      
      const duration = calculateDuration(lastTransition.createdAt);
      return duration > sla.maxDurationHours;
    });
    
    const overdueConsultations = consultations.filter(c => {
      const lastTransition = stageTransitions
        .filter(t => t.entityId === c.id && t.entityType === "consultation")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      if (!lastTransition) return false;
      
      const sla = getSLAForStage(lastTransition.toStage as ConsultationStageValue);
      if (!sla) return false;
      
      const duration = calculateDuration(lastTransition.createdAt);
      return duration > sla.maxDurationHours;
    });
    
    return { cases: overdueCases, consultations: overdueConsultations };
  };
  
  const getStageDeadline = (
    stage: WorkflowCaseStageValue | ConsultationStageValue,
    priority: CasePriorityValue,
    startTime: string
  ): Date => {
    const sla = getSLAForStage(stage);
    let hours = sla?.maxDurationHours || 24;
    
    if (priority === CasePriority.URGENT) hours = Math.ceil(hours * 0.5);
    else if (priority === CasePriority.LOW) hours = Math.ceil(hours * 1.5);
    
    return new Date(new Date(startTime).getTime() + hours * 60 * 60 * 1000);
  };
  
  const getTimeRemaining = (entityId: string, entityType: "case" | "consultation") => {
    const entity = entityType === "case" 
      ? cases.find(c => c.id === entityId)
      : consultations.find(c => c.id === entityId);
    
    if (!entity) return { hours: 0, isOverdue: false, percentage: 0 };
    
    const lastTransition = stageTransitions
      .filter(t => t.entityId === entityId && t.entityType === entityType)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    const currentStage = lastTransition?.toStage || "received";
    const sla = getSLAForStage(currentStage);
    
    if (!sla) return { hours: 0, isOverdue: false, percentage: 0 };
    
    const startTime = lastTransition?.createdAt || entity.createdAt;
    const elapsed = calculateDuration(startTime);
    const remaining = sla.maxDurationHours - elapsed;
    const percentage = Math.min((elapsed / sla.maxDurationHours) * 100, 100);
    
    return {
      hours: remaining,
      isOverdue: remaining < 0,
      percentage,
    };
  };
  
  const getSLAReport = (startDate: string, endDate: string) => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    
    const relevantTransitions = stageTransitions.filter(t => {
      const time = new Date(t.createdAt).getTime();
      return time >= start && time <= end;
    });
    
    const onTime = relevantTransitions.filter(t => !t.isOverdue).length;
    const late = relevantTransitions.filter(t => t.isOverdue).length;
    const total = relevantTransitions.length;
    
    return {
      onTime,
      late,
      total,
      percentage: total > 0 ? Math.round((onTime / total) * 100) : 100,
    };
  };
  
  const getEmployeeWorkload = (employeeId: string): EmployeeWorkload | null => {
    const activeCases = cases.filter(c => 
      c.primaryLawyerId === employeeId && c.status !== "مغلق"
    ).length;
    
    const activeConsultations = consultations.filter(c => 
      c.assignedTo === employeeId && c.status !== "مغلق"
    ).length;
    
    const inReviewItems = cases.filter(c => 
      c.primaryLawyerId === employeeId && c.status === "لجنة_المراجعة"
    ).length + consultations.filter(c => 
      c.assignedTo === employeeId && c.status === "لجنة_المراجعة"
    ).length;
    
    const { cases: overdueCases, consultations: overdueConsultations } = checkOverdueItems();
    const overdueItems = overdueCases.filter(c => c.primaryLawyerId === employeeId).length +
      overdueConsultations.filter(c => c.assignedTo === employeeId).length;
    
    return {
      id: employeeId,
      name: "",
      department: "",
      activeCases,
      activeConsultations,
      inReviewItems,
      overdueItems,
      avgCompletionDays: 0,
    };
  };
  
  const getDepartmentWorkload = (departmentId: string): EmployeeWorkload[] => {
    const deptCases = cases.filter(c => c.departmentId === departmentId);
    const employeeIds = Array.from(new Set(deptCases.map(c => c.primaryLawyerId).filter((id): id is string => Boolean(id))));
    
    return employeeIds.map(id => getEmployeeWorkload(id)).filter(Boolean) as EmployeeWorkload[];
  };
  
  const getWorkloadOverview = (): EmployeeWorkload[] => {
    const allIds = [
      ...cases.map(c => c.primaryLawyerId),
      ...consultations.map(c => c.assignedTo),
    ].filter((id): id is string => Boolean(id));
    const employeeIds = Array.from(new Set(allIds));
    
    return employeeIds.map(id => getEmployeeWorkload(id)).filter(Boolean) as EmployeeWorkload[];
  };
  
  const suggestReassignment = (caseId: string) => {
    const workloads = getWorkloadOverview();
    const leastLoaded = workloads.sort((a, b) => 
      (a.activeCases + a.activeConsultations) - (b.activeCases + b.activeConsultations)
    )[0];
    
    if (!leastLoaded) return null;
    
    return {
      employeeId: leastLoaded.id,
      name: leastLoaded.name,
      reason: `أقل حمل عمل (${leastLoaded.activeCases} قضايا، ${leastLoaded.activeConsultations} استشارات)`,
    };
  };
  
  const getReviewAcceptanceRate = (id: string, type: "employee" | "department") => {
    const entityNotes = type === "employee"
      ? reviewNotes.filter(n => {
          const entity = n.entityType === "case"
            ? cases.find(c => c.id === n.entityId)
            : consultations.find(c => c.id === n.entityId);
          return entity && (
            (n.entityType === "case" && (entity as LawCase).primaryLawyerId === id) ||
            (n.entityType === "consultation" && (entity as Consultation).assignedTo === id)
          );
        })
      : reviewNotes.filter(n => {
          const entity = n.entityType === "case"
            ? cases.find(c => c.id === n.entityId)
            : consultations.find(c => c.id === n.entityId);
          return entity && entity.departmentId === id;
        });
    
    const accepted = entityNotes.filter(n => n.action === "fully_accepted").length;
    const rejected = entityNotes.filter(n => n.action === "rejected").length;
    const partial = entityNotes.filter(n => n.action === "partially_accepted").length;
    const returned = entityNotes.filter(n => n.action === "returned").length;
    
    return { accepted, rejected, partial, returned, total: entityNotes.length };
  };
  
  const getAvgCompletionTime = (entityType: "case" | "consultation", stage: WorkflowCaseStageValue | ConsultationStageValue): number => {
    const stageTransitionsForStage = stageTransitions.filter(t => 
      t.entityType === entityType && t.toStage === stage
    );
    
    if (stageTransitionsForStage.length === 0) return 0;
    
    const totalDuration = stageTransitionsForStage.reduce((sum, t) => sum + t.duration, 0);
    return Math.round(totalDuration / stageTransitionsForStage.length);
  };
  
  const getReturnRate = (id: string, type: "employee" | "department") => {
    const entityNotes = type === "employee"
      ? reviewNotes.filter(n => {
          const entity = n.entityType === "case"
            ? cases.find(c => c.id === n.entityId)
            : consultations.find(c => c.id === n.entityId);
          return entity && (
            (n.entityType === "case" && (entity as LawCase).primaryLawyerId === id) ||
            (n.entityType === "consultation" && (entity as Consultation).assignedTo === id)
          );
        })
      : reviewNotes.filter(n => {
          const entity = n.entityType === "case"
            ? cases.find(c => c.id === n.entityId)
            : consultations.find(c => c.id === n.entityId);
          return entity && entity.departmentId === id;
        });
    
    const returnCount = entityNotes.filter(n => n.action === "returned").length;
    const total = entityNotes.length;
    
    return {
      returnCount,
      total,
      rate: total > 0 ? Math.round((returnCount / total) * 100) : 0,
    };
  };
  
  const getBottleneckReport = () => {
    const stages = [...WorkflowCaseStagesOrder, ...ConsultationStagesOrder];
    const uniqueStages = Array.from(new Set(stages));
    
    return uniqueStages.map(stage => {
      const stageTransitionsForStage = stageTransitions.filter(t => t.toStage === stage);
      const avgDuration = stageTransitionsForStage.length > 0
        ? Math.round(stageTransitionsForStage.reduce((sum, t) => sum + t.duration, 0) / stageTransitionsForStage.length)
        : 0;
      const overdueCount = stageTransitionsForStage.filter(t => t.isOverdue).length;
      
      return { stage, avgDuration, overdueCount };
    }).sort((a, b) => b.overdueCount - a.overdueCount);
  };
  
  const getStageHistory = (entityId: string): StageTransition[] => {
    return stageTransitions
      .filter(t => t.entityId === entityId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };
  
  const getReviewNotesForEntity = (entityId: string): ReviewNote[] => {
    return reviewNotes
      .filter(n => n.entityId === entityId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };
  
  return (
    <WorkflowContext.Provider value={{
      stageTransitions,
      reviewNotes,
      slaSettings,
      receiveCaseFromClient,
      assignCaseToDepartment,
      updateCaseWorkflowStage,
      sendCaseToReview,
      submitReviewNotes,
      respondToReviewNotes,
      returnCase,
      submitToCourtSystem,
      assignConsultationToDepartment,
      updateConsultationWorkflowStage,
      sendConsultationToReview,
      returnConsultation,
      sendConsultationToClient,
      checkOverdueItems,
      getStageDeadline,
      getTimeRemaining,
      getSLAReport,
      getEmployeeWorkload,
      getDepartmentWorkload,
      getWorkloadOverview,
      suggestReassignment,
      getReviewAcceptanceRate,
      getAvgCompletionTime,
      getReturnRate,
      getBottleneckReport,
      getStageHistory,
      getReviewNotesForEntity,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflow must be used within a WorkflowProvider");
  }
  return context;
}
