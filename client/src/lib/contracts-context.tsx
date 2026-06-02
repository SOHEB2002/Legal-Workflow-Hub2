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
  recordTakeNotesOutcome: (id: string, outcome: NoteOutcomeValue, notes?: string) => Promise<void>;
  earlyCloseContract: (id: string, reason: string) => Promise<void>;
  pauseContract: (id: string, reason: string) => Promise<void>;
  unpauseContract: (id: string, notes?: string) => Promise<void>;
  awaitCompletion: (id: string, reason: string) => Promise<void>;
  resumeFromCompletion: (id: string, notes?: string) => Promise<void>;
  skipCompletion: (id: string) => Promise<void>;
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
    const body = {
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

  const pauseContract = async (id: string, reason: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/pause`, { reason });
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

  const skipCompletion = async (id: string): Promise<void> => {
    const res = await apiRequest("POST", `/api/contracts/${id}/skip-completion`, {});
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
        recordTakeNotesOutcome,
        earlyCloseContract,
        pauseContract,
        unpauseContract,
        awaitCompletion,
        resumeFromCompletion,
        skipCompletion,
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
