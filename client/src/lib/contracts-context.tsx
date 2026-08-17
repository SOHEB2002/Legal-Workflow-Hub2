import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type {
  Contract,
  ContractStageValue,
  InternalReviewDecisionValue,
  CommitteeDecisionValue,
  NoteOutcomeValue,
} from "@shared/schema";
import { apiRequest } from "./queryClient";
import { useAuth } from "./auth-context";

// Mirror of consultations-context but narrower — contracts skip the
// extend-delivery / convert-to-case / closure-reason-enum surfaces that
// don't apply to the contracts module.
interface ContractsContextType {
  contracts: Contract[];
  isLoading: boolean;
  addContract: (data: Partial<Contract>) => Promise<Contract>;
  updateContract: (id: string, data: Partial<Contract>) => Promise<void>;
  deleteContract: (id: string) => Promise<void>;
  assignContract: (id: string, assignedTo: string) => Promise<void>;
  // Extras carry stage-entry context that the server applies in the
  // same transaction as the stage update (notes are logged to the
  // activity entry; reviewerId persists to internal_reviewer_id;
  // priority + priorityReason persist to the row when entering
  // COMMITTEE so the referral card surfaces them right away).
  advanceStage: (
    id: string,
    targetStage: ContractStageValue,
    extras?: {
      notes?: string;
      internalReviewerId?: string;
      priority?: string;
      priorityReason?: string;
    },
  ) => Promise<void>;
  returnStage: (id: string, targetStage: ContractStageValue) => Promise<void>;
  submitInternalReview: (id: string, decision: InternalReviewDecisionValue, notes?: string) => Promise<void>;
  submitCommitteeDecision: (id: string, decision: CommitteeDecisionValue, notes?: string) => Promise<void>;
  // Reasoned override — skip the review committee straight to جاهزة_للإرسال. reason MANDATORY.
  skipCommittee: (id: string, reason: string) => Promise<void>;
  skipInternalReview: (id: string, reason: string) => Promise<void>;
  recordTakeNotesOutcome: (id: string, outcome: NoteOutcomeValue, notes?: string) => Promise<void>;
  earlyCloseContract: (id: string, reason: string) => Promise<void>;
  // Re-open a CLOSED contract for a client follow-up question
  // ("استشارة تعقيبية"). question MANDATORY — the server 400s on empty.
  // Returns the authoritative updated row so the caller can sync the open
  // details dialog directly (same as the consultations-side handler).
  startContractFollowUp: (id: string, question: string) => Promise<Contract>;
  // pauseUntil is the OPTIONAL "YYYY-MM-DD" auto-lift date; omitted/blank means
  // an open-ended pause, which is the pre-feature behaviour.
  pauseContract: (id: string, reason: string, pauseUntil?: string) => Promise<void>;
  unpauseContract: (id: string, notes?: string) => Promise<void>;
  awaitCompletion: (id: string, reason: string) => Promise<void>;
  resumeFromCompletion: (id: string, notes?: string) => Promise<void>;
  skipDataCompletion: (id: string, notes?: string) => Promise<void>;
  refreshContracts: () => Promise<void>;
}

const ContractsContext = createContext<ContractsContextType | undefined>(undefined);

export function ContractsProvider({ children }: { children: React.ReactNode }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchContracts = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest("GET", "/api/contracts");
      const data = await response.json();
      setContracts(data);
    } catch {
      // best-effort
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchContracts();
    else setContracts([]);
  }, [user, fetchContracts]);

  const apply = (updated: Contract) => {
    setContracts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const addContract = async (data: Partial<Contract>): Promise<Contract> => {
    // SPREAD FIRST, NORMALISATIONS AFTER — same shape and same reason as the
    // clients and consultations twins: a field added to the contract create form
    // now reaches the server automatically instead of needing a second, silent
    // edit here (the defect that cost consultations its title column, 62e0fb9).
    //
    // ⚠ RAW req.body CONTRACT — "insertContractSchema will strip it" is NOT proof
    // a key is inert. POST /api/contracts reads `req.body.assignedTo` and
    // `req.body.departmentId` DIRECTLY, outside the parsed object, so those two
    // are honoured whether or not the schema declares them. Check that list, not
    // just the schema, before assuming a newly-spread key does nothing.
    //
    // Nothing transient can ride along: the create form's File (intakeFile), the
    // `creating` flag and the pendingAdditional[] rows all live in their OWN
    // useState hooks, not in formData.
    const body = {
      ...data,
      title: data.title || "",
      clientId: data.clientId || "",
      contractType: data.contractType || "مراجعة_عقد",
      departmentId: data.departmentId || "",
      description: data.description || "",
    };
    const res = await apiRequest("POST", "/api/contracts", body);
    const created = (await res.json()) as Contract;
    setContracts((prev) => [created, ...prev]);
    return created;
  };

  const updateContract = async (id: string, data: Partial<Contract>): Promise<void> => {
    const res = await apiRequest("PATCH", `/api/contracts/${id}`, data);
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const deleteContract = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/contracts/${id}`);
    setContracts((prev) => prev.filter((c) => c.id !== id));
  };

  const assignContract = async (id: string, assignedTo: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/assign`, { assignedTo });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const advanceStage = async (
    id: string,
    targetStage: ContractStageValue,
    extras?: {
      notes?: string;
      internalReviewerId?: string;
      priority?: string;
      priorityReason?: string;
    },
  ): Promise<void> => {
    const body: Record<string, unknown> = { targetStage };
    if (extras?.notes) body.notes = extras.notes;
    if (extras?.internalReviewerId) body.internalReviewerId = extras.internalReviewerId;
    if (extras?.priority) body.priority = extras.priority;
    if (extras?.priorityReason) body.priorityReason = extras.priorityReason;
    const res = await apiRequest("POST", `/api/contracts/${id}/advance-stage`, body);
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const returnStage = async (id: string, targetStage: ContractStageValue): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/return-stage`, { targetStage });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const submitInternalReview = async (id: string, decision: InternalReviewDecisionValue, notes = ""): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/internal-review`, { decision, notes });
    const { contract } = (await res.json()) as { contract: Contract };
    apply(contract);
  };

  const submitCommitteeDecision = async (id: string, decision: CommitteeDecisionValue, notes = ""): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/committee-decision`, { decision, notes });
    const { contract } = (await res.json()) as { contract: Contract };
    apply(contract);
  };

  // Reasoned override — "تجاوز لجنة المراجعة". Server returns the raw contract
  // (like early-close/pause), not a { contract } envelope.
  const skipCommittee = async (id: string, reason: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/skip-committee`, { reason });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  // Reasoned override — "تجاوز المراجعة الداخلية". Same response shape.
  const skipInternalReview = async (id: string, reason: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/skip-internal-review`, { reason });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const recordTakeNotesOutcome = async (id: string, outcome: NoteOutcomeValue, notes = ""): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/take-notes-outcome`, { outcome, notes });
    const { contract } = (await res.json()) as { contract: Contract };
    apply(contract);
  };

  const earlyCloseContract = async (id: string, reason: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/early-close`, { reason });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  // Server returns the raw contract (like early-close/skip-committee), not a
  // { contract } envelope. Returned to the caller as well as applied to the
  // list, so the details dialog can sync against the freshest payload.
  const startContractFollowUp = async (id: string, question: string): Promise<Contract> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/start-follow-up`, { question });
    const updated = (await res.json()) as Contract;
    apply(updated);
    return updated;
  };

  const pauseContract = async (id: string, reason: string, pauseUntil?: string): Promise<void> => {
    const until = (pauseUntil ?? "").trim();
    // Key omitted entirely when blank — the server reads absent as open-ended.
    const res = await apiRequest("POST", `/api/contracts/${id}/pause`, until ? { reason, pauseUntil: until } : { reason });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const unpauseContract = async (id: string, notes?: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/unpause`, { notes: notes ?? "" });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const awaitCompletion = async (id: string, reason: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/await-completion`, { reason });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  const resumeFromCompletion = async (id: string, notes?: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/resume-from-completion`, { notes: notes ?? "" });
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  // PRE-ENTRY skip: pressed AT استلام to jump PAST the data-completion stage.
  const skipDataCompletion = async (id: string, notes?: string): Promise<void> => {
    const trimmed = (notes ?? "").trim();
    const res = await apiRequest(
      "POST",
      `/api/contracts/${id}/skip-data-completion`,
      trimmed ? { notes: trimmed } : {},
    );
    const updated = (await res.json()) as Contract;
    apply(updated);
  };

  return (
    <ContractsContext.Provider
      value={{
        contracts,
        isLoading,
        addContract,
        updateContract,
        deleteContract,
        assignContract,
        advanceStage,
        returnStage,
        submitInternalReview,
        submitCommitteeDecision,
        skipCommittee,
        skipInternalReview,
        recordTakeNotesOutcome,
        earlyCloseContract,
        startContractFollowUp,
        pauseContract,
        unpauseContract,
        awaitCompletion,
        resumeFromCompletion,
        skipDataCompletion,
        refreshContracts: fetchContracts,
      }}
    >
      {children}
    </ContractsContext.Provider>
  );
}

export function useContracts() {
  const ctx = useContext(ContractsContext);
  if (!ctx) throw new Error("useContracts must be used within a ContractsProvider");
  return ctx;
}
