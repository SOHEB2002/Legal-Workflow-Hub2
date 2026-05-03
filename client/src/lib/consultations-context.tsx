import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type {
  Consultation,
  ConsultationStageValue,
  InternalReviewDecisionValue,
  CommitteeDecisionValue,
  NoteOutcomeValue,
  ConsultationClosureReasonValue,
} from "@shared/schema";
import { ConsultationStage } from "@shared/schema";
import { apiRequest } from "./queryClient";
import { notifyConsultationAdded, notifyConsultationAssigned } from "./notification-triggers";
import { useAuth } from "./auth-context";

interface ConsultationsContextType {
  consultations: Consultation[];
  isLoading: boolean;

  // CRUD
  addConsultation: (data: Partial<Consultation>, createdBy: string) => Promise<Consultation>;
  updateConsultation: (id: string, data: Partial<Consultation>) => Promise<void>;
  deleteConsultation: (id: string) => Promise<void>;

  // Workflow mutators (each calls a dedicated /api/consultations/:id/...
  // endpoint per consultations-rebuild-spec.md §3.2; the context refreshes
  // the list afterward so callers can rely on `consultations` being current).
  assignConsultation: (id: string, assignedTo: string) => Promise<void>;
  advanceStage: (id: string, targetStage: ConsultationStageValue) => Promise<void>;
  returnStage: (id: string, targetStage: ConsultationStageValue) => Promise<void>;
  submitInternalReview: (id: string, decision: InternalReviewDecisionValue, notes?: string) => Promise<void>;
  submitCommitteeDecision: (id: string, decision: CommitteeDecisionValue, notes?: string) => Promise<void>;
  recordTakeNotesOutcome: (id: string, outcome: NoteOutcomeValue, notes?: string) => Promise<void>;
  convertToCase: (id: string, targetCaseStage: string, caseDepartmentId: string) => Promise<void>;
  earlyCloseConsultation: (id: string, reason: ConsultationClosureReasonValue, otherText?: string, notes?: string) => Promise<void>;
  // Backwards-compat alias for earlyCloseConsultation. Same signature, same
  // behaviour — kept so any older import keeps compiling. New code should
  // prefer earlyCloseConsultation for the more explicit name.
  closeConsultation: (id: string, reason: ConsultationClosureReasonValue, otherText?: string, notes?: string) => Promise<void>;

  // Selectors
  getConsultationById: (id: string) => Consultation | undefined;
  getConsultationsByDepartment: (departmentId: string) => Consultation[];
  getActiveConsultations: () => Consultation[];
  getReviewConsultations: () => Consultation[];
  getReadyConsultations: () => Consultation[];
  refreshConsultations: () => Promise<void>;
}

const ConsultationsContext = createContext<ConsultationsContextType | undefined>(undefined);

const generateConsultationNumber = () => `S-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lawfirm_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

export function ConsultationsProvider({ children }: { children: React.ReactNode }) {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchConsultations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/consultations", { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setConsultations(data);
      }
    } catch (error) {
      // fetch consultations failed silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchConsultations();
    } else {
      setConsultations([]);
    }
  }, [user, fetchConsultations]);

  const addConsultation = async (data: Partial<Consultation>, createdBy: string): Promise<Consultation> => {
    const consultationData = {
      consultationNumber: generateConsultationNumber(),
      clientId: data.clientId || "",
      consultationType: data.consultationType || "عام",
      deliveryType: data.deliveryType || "مكتوبة",
      departmentId: data.departmentId || "",
      assignedTo: null,
      questionSummary: data.questionSummary || "",
      response: "",
      convertedToCaseId: null,
      whatsappGroupLink: data.whatsappGroupLink || "",
      googleDriveFolderId: data.googleDriveFolderId || "",
      reviewNotes: "",
      reviewDecision: null,
      createdBy,
    };

    const response = await apiRequest("POST", "/api/consultations", consultationData);
    const newConsultation = await response.json();
    setConsultations((prev) => [newConsultation, ...prev]);
    if (newConsultation.departmentId) {
      notifyConsultationAdded(newConsultation.id, newConsultation.consultationNumber, newConsultation.departmentId).catch(() => {});
    }
    return newConsultation;
  };

  const updateConsultation = async (id: string, data: Partial<Consultation>): Promise<void> => {
    await apiRequest("PATCH", `/api/consultations/${id}`, data);
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...data, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const deleteConsultation = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/consultations/${id}`);
    setConsultations((prev) => prev.filter((c) => c.id !== id));
  };

  // Apply the server's authoritative consultation row to local state.
  // Each workflow endpoint returns the updated consultation (or wraps it
  // alongside a helper-table row); using the response directly keeps us
  // from issuing a second GET just to learn what changed.
  const applyServerConsultation = (updated: Consultation) => {
    setConsultations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const assignConsultation = async (id: string, assignedTo: string): Promise<void> => {
    const consultation = consultations.find((c) => c.id === id);
    const res = await apiRequest("POST", `/api/consultations/${id}/assign`, { assignedTo });
    const updated = (await res.json()) as Consultation;
    applyServerConsultation(updated);
    if (consultation) {
      notifyConsultationAssigned(id, consultation.consultationNumber || "", assignedTo).catch(() => {});
    }
  };

  const advanceStage = async (id: string, targetStage: ConsultationStageValue): Promise<void> => {
    const res = await apiRequest("POST", `/api/consultations/${id}/advance-stage`, { targetStage });
    const updated = (await res.json()) as Consultation;
    applyServerConsultation(updated);
  };

  const returnStage = async (id: string, targetStage: ConsultationStageValue): Promise<void> => {
    const res = await apiRequest("POST", `/api/consultations/${id}/return-stage`, { targetStage });
    const updated = (await res.json()) as Consultation;
    applyServerConsultation(updated);
  };

  const submitInternalReview = async (
    id: string,
    decision: InternalReviewDecisionValue,
    notes: string = "",
  ): Promise<void> => {
    const res = await apiRequest("POST", `/api/consultations/${id}/internal-review`, { decision, notes });
    // Endpoint returns { review, consultation } — pull the consultation half.
    const { consultation: updated } = (await res.json()) as { consultation: Consultation };
    applyServerConsultation(updated);
  };

  const submitCommitteeDecision = async (
    id: string,
    decision: CommitteeDecisionValue,
    notes: string = "",
  ): Promise<void> => {
    const res = await apiRequest("POST", `/api/consultations/${id}/committee-decision`, { decision, notes });
    const { consultation: updated } = (await res.json()) as { consultation: Consultation };
    applyServerConsultation(updated);
  };

  const recordTakeNotesOutcome = async (
    id: string,
    outcome: NoteOutcomeValue,
    notes: string = "",
  ): Promise<void> => {
    const res = await apiRequest("POST", `/api/consultations/${id}/take-notes-outcome`, { outcome, notes });
    const { consultation: updated } = (await res.json()) as { consultation: Consultation };
    applyServerConsultation(updated);
  };

  const convertToCase = async (
    id: string,
    targetCaseStage: string,
    caseDepartmentId: string,
  ): Promise<void> => {
    const res = await apiRequest("POST", `/api/consultations/${id}/convert-to-case`, {
      targetCaseStage,
      caseDepartmentId,
    });
    // Endpoint returns { case, consultation } — apply the consultation
    // (now status='converted', convertedToCaseId set). Callers needing the
    // new case row should still do their own fetch / cache update against
    // the cases context.
    const { consultation: updated } = (await res.json()) as { consultation: Consultation };
    applyServerConsultation(updated);
  };

  const earlyCloseConsultation = async (
    id: string,
    reason: ConsultationClosureReasonValue,
    otherText?: string,
    notes?: string,
  ): Promise<void> => {
    // The endpoint reads { reason, otherText? } only; `notes` is sent for
    // forward compatibility (no closure_notes column on the consultations
    // table yet — see the comment on the page-side handler in
    // consultations.tsx for the matching gap note).
    const body: Record<string, unknown> = { reason };
    if (otherText && otherText.trim()) body.otherText = otherText.trim();
    if (notes && notes.trim()) body.notes = notes.trim();
    const res = await apiRequest("POST", `/api/consultations/${id}/early-close`, body);
    const updated = (await res.json()) as Consultation;
    applyServerConsultation(updated);
  };

  // Backwards-compat alias — same shape as earlyCloseConsultation.
  const closeConsultation = earlyCloseConsultation;

  const getConsultationById = (id: string) => consultations.find((c) => c.id === id);

  const getConsultationsByDepartment = (departmentId: string) =>
    consultations.filter((c) => c.departmentId === departmentId);

  // "Active" in the new schema is a status value, not a derivation. Mirrors
  // what the dashboard expects: rows that aren't converted or closed.
  const getActiveConsultations = () =>
    consultations.filter((c) => c.status === "active");

  // Replaces the old REVIEW_COMMITTEE filter — that status no longer
  // exists. The new equivalent is "currently in the لجنة_مراجعة stage,
  // and still active" (i.e. not converted or closed mid-review).
  const getReviewConsultations = () =>
    consultations.filter(
      (c) => c.status === "active" && c.currentStage === ConsultationStage.COMMITTEE,
    );

  // Replaces the old READY filter for the same reason.
  const getReadyConsultations = () =>
    consultations.filter(
      (c) => c.status === "active" && c.currentStage === ConsultationStage.READY,
    );

  return (
    <ConsultationsContext.Provider
      value={{
        consultations,
        isLoading,
        addConsultation,
        updateConsultation,
        deleteConsultation,
        assignConsultation,
        advanceStage,
        returnStage,
        submitInternalReview,
        submitCommitteeDecision,
        recordTakeNotesOutcome,
        convertToCase,
        earlyCloseConsultation,
        closeConsultation,
        getConsultationById,
        getConsultationsByDepartment,
        getActiveConsultations,
        getReviewConsultations,
        getReadyConsultations,
        refreshConsultations: fetchConsultations,
      }}
    >
      {children}
    </ConsultationsContext.Provider>
  );
}

export function useConsultations() {
  const context = useContext(ConsultationsContext);
  if (context === undefined) {
    throw new Error("useConsultations must be used within a ConsultationsProvider");
  }
  return context;
}
