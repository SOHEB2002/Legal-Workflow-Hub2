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
import { notifyConsultationAssigned } from "./notification-triggers";
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

export function ConsultationsProvider({ children }: { children: React.ReactNode }) {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchConsultations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest("GET", "/api/consultations");
      const data = await response.json();
      setConsultations(data);
    } catch (error) {
      // fetch consultations failed silently
    } finally {
      setIsLoading(false);
    }
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (userId) {
      fetchConsultations();
    } else {
      setConsultations([]);
    }
  }, [userId, fetchConsultations]);

  const addConsultation = async (data: Partial<Consultation>, createdBy: string): Promise<Consultation> => {
    // Phase-5: deliveryType is no longer sent from the UI (the field was
    // retired from the create dialog). Server falls back to "مكتوبة" via
    // the column default + storage layer fallback.
    // consultationNumber is DELIBERATELY NOT SENT. The server owns it:
    // storage.createConsultation generates it inside the insert transaction and
    // retries up to 3 times on a unique-constraint collision, which is the only
    // thing making the constraint safe. insertConsultationSchema does not declare
    // the key, so a client-supplied value was stripped by .parse() and never
    // reached the insert — the call here was dead, and worse than dead: it
    // implied the client owned numbering and hid the retry mechanism. The two
    // generators did not even agree on a format (client "S-2026-0042" vs server
    // "CON-2026-A1B2C3"), so the discarded value was never a real number.
    // 🔴 SPREAD FIRST, OVERRIDES AFTER — and this entity is why the pattern
    // exists. `title` was added to the create form, the schema, the route and
    // storage by a7e03f9, which never touched this file; the explicit pick had no
    // `title` key, so the value was dropped one line before the fetch and create
    // NEVER ONCE saved a title (fixed in 62e0fb9). The spread makes that class of
    // failure impossible here: a field added to the form now reaches the server
    // automatically, and the schema decides whether to keep it.
    //
    // ⚠ RAW req.body CONTRACT — "insertConsultationSchema will strip it" is NOT
    // proof a key is inert. POST /api/consultations reads `req.body.createdBy`
    // and `req.body.departmentId` DIRECTLY, outside the parsed object. Check that
    // list too before assuming a newly-spread key does nothing.
    //
    // The five nulls/empties below are overrides on purpose: they pin columns the
    // create form does not own (assignment, response, review state) to their
    // initial values regardless of what any caller sends.
    const consultationData = {
      ...data,
      clientId: data.clientId || "",
      // 🔴 عنوان الاستشارة — THE FIX. This key was absent, so `data.title`
      // arrived from the create form and was dropped one line before the fetch:
      // the input was bound, insertConsultationSchema declared the field, the
      // route forwarded it and storage wrote it — but nothing ever put it in the
      // body. a7e03f9 added the column, the schema, the storage write, the form
      // input and the edit dialog, and never touched this file, so create had
      // never once saved a title. Forwarded exactly as the contracts twin does
      // (contracts-context.tsx `title: data.title || ""`).
      //
      // ⚠ SEND "" FOR A BLANK TITLE, NEVER null. insertConsultationSchema types
      // this `z.string().optional()` — NOT .nullable() — so an explicit null is
      // a ZodError and would 400 the whole create. The empty string validates,
      // and storage normalises it: `data.title?.trim() ? data.title.trim() : null`
      // stores NULL for "" and for a whitespace-only title, so the nullable
      // column still never holds "". Trimming is the server's job, not ours.
      title: data.title || "",

      consultationType: data.consultationType || "مكتوبة",
      departmentId: data.departmentId || "",
      assignedTo: null,
      questionSummary: data.questionSummary || "",
      response: "",
      convertedToCaseId: null,
      whatsappGroupLink: data.whatsappGroupLink || "",
      googleDriveFolderId: data.googleDriveFolderId || "",
      reviewNotes: "",
      reviewDecision: null,
      // Phase-4: pass through SLA category. Server falls back to "عادية"
      // when omitted, but forwarding it explicitly keeps the create dialog
      // and the inserted row in lockstep.
      category: data.category || "عادية",
      // Intake channel — defaulted here so the create dialog and the
      // inserted row stay in lockstep (same as category).
      source: data.source || "عبر_المجموعة",
      // Committee-referral fields (priority / priorityReason /
      // internalReviewerId) are intentionally NOT forwarded at create —
      // they're committee-form-only per Phase-9.1. New rows start with
      // null on all three; the details dialog's committee card sets them
      // via PATCH once the consultation reaches لجنة_مراجعة.
      createdBy,
    };

    const response = await apiRequest("POST", "/api/consultations", consultationData);
    const newConsultation = await response.json();
    setConsultations((prev) => [newConsultation, ...prev]);
    // The department-head notice now fires from POST /api/consultations itself
    // — see the cases-context twin for why the client copy was removed.
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
