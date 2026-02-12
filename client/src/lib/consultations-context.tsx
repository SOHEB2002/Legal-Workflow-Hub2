import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Consultation, ConsultationStatusValue, ReviewDecisionType, CaseTypeValue, DeliveryTypeValue } from "@shared/schema";
import { ConsultationStatus } from "@shared/schema";
import { apiRequest } from "./queryClient";
import { notifyConsultationAdded, notifyConsultationAssigned, notifyConsultationSentToReview, notifyConsultationReturnedForRevision } from "./notification-triggers";

interface ConsultationsContextType {
  consultations: Consultation[];
  isLoading: boolean;
  addConsultation: (data: Partial<Consultation>, createdBy: string) => Promise<Consultation>;
  updateConsultation: (id: string, data: Partial<Consultation>) => Promise<void>;
  deleteConsultation: (id: string) => Promise<void>;
  assignConsultation: (id: string, assignedTo: string, departmentId: string) => void;
  sendToReviewCommittee: (id: string) => void;
  approveConsultation: (id: string, notes?: string) => void;
  rejectConsultation: (id: string, notes: string) => void;
  markDelivered: (id: string) => void;
  closeConsultation: (id: string) => void;
  convertToCase: (id: string, caseId: string) => void;
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

  const fetchConsultations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/consultations", { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setConsultations(data);
      }
    } catch (error) {
      console.error("Error fetching consultations:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsultations();
  }, [fetchConsultations]);

  const addConsultation = async (data: Partial<Consultation>, createdBy: string): Promise<Consultation> => {
    const consultationData = {
      consultationNumber: generateConsultationNumber(),
      clientId: data.clientId || "",
      consultationType: data.consultationType || "عام",
      deliveryType: data.deliveryType || "مكتوبة",
      status: ConsultationStatus.RECEIVED,
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
      notifyConsultationAdded(newConsultation.id, newConsultation.consultationNumber, newConsultation.departmentId).catch(console.error);
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

  const assignConsultation = (id: string, assignedTo: string, departmentId: string) => {
    const consultation = consultations.find(c => c.id === id);
    const data = {
      assignedTo,
      departmentId,
      status: ConsultationStatus.STUDY as ConsultationStatusValue,
    };
    updateConsultation(id, data);
    notifyConsultationAssigned(id, consultation?.consultationNumber || "", assignedTo).catch(console.error);
  };

  const sendToReviewCommittee = (id: string) => {
    const consultation = consultations.find(c => c.id === id);
    updateConsultation(id, { status: ConsultationStatus.REVIEW_COMMITTEE as ConsultationStatusValue });
    notifyConsultationSentToReview(id, consultation?.consultationNumber || "").catch(console.error);
  };

  const approveConsultation = (id: string, notes?: string) => {
    updateConsultation(id, {
      status: ConsultationStatus.READY as ConsultationStatusValue,
      reviewDecision: "approved" as ReviewDecisionType,
      reviewNotes: notes || "",
    });
  };

  const rejectConsultation = (id: string, notes: string) => {
    const consultation = consultations.find(c => c.id === id);
    updateConsultation(id, {
      status: ConsultationStatus.AMENDMENTS as ConsultationStatusValue,
      reviewDecision: "rejected" as ReviewDecisionType,
      reviewNotes: notes,
    });
    notifyConsultationReturnedForRevision(id, consultation?.consultationNumber || "", consultation?.assignedTo || null, notes).catch(console.error);
  };

  const markDelivered = (id: string) => {
    updateConsultation(id, { status: ConsultationStatus.DELIVERED as ConsultationStatusValue });
  };

  const closeConsultation = (id: string) => {
    updateConsultation(id, {
      status: ConsultationStatus.CLOSED as ConsultationStatusValue,
      closedAt: new Date().toISOString(),
    });
  };

  const convertToCase = (id: string, caseId: string) => {
    updateConsultation(id, { convertedToCaseId: caseId });
  };

  const getConsultationById = (id: string) => consultations.find((c) => c.id === id);

  const getConsultationsByDepartment = (departmentId: string) =>
    consultations.filter((c) => c.departmentId === departmentId);

  const getActiveConsultations = () =>
    consultations.filter((c) => c.status !== ConsultationStatus.CLOSED);

  const getReviewConsultations = () =>
    consultations.filter((c) => c.status === ConsultationStatus.REVIEW_COMMITTEE);

  const getReadyConsultations = () =>
    consultations.filter((c) => c.status === ConsultationStatus.READY);

  return (
    <ConsultationsContext.Provider
      value={{
        consultations,
        isLoading,
        addConsultation,
        updateConsultation,
        deleteConsultation,
        assignConsultation,
        sendToReviewCommittee,
        approveConsultation,
        rejectConsultation,
        markDelivered,
        closeConsultation,
        convertToCase,
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
