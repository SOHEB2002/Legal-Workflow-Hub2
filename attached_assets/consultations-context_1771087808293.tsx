import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Consultation, ConsultationStatusValue, ReviewDecisionType, CaseTypeValue, DeliveryTypeValue } from "@shared/schema";
import { ConsultationStatus } from "@shared/schema";
import type { UserRoleType } from "@shared/schema";
import { apiRequest } from "./queryClient";
import { validateConsultationTransition } from "./transitions-engine";
import { notifyConsultationAdded, notifyConsultationAssigned, notifyConsultationSentToReview, notifyConsultationReturnedForRevision } from "./notification-triggers";
import { useAuth } from "./auth-context";

interface ConsultationsContextType {
  consultations: Consultation[];
  isLoading: boolean;
  addConsultation: (data: Partial<Consultation>, createdBy: string) => Promise<Consultation>;
  updateConsultation: (id: string, data: Partial<Consultation>) => Promise<void>;
  deleteConsultation: (id: string) => Promise<void>;
  assignConsultation: (id: string, assignedTo: string, departmentId: string) => void;
  sendToReviewCommittee: (id: string, userRole?: string) => void;
  approveConsultation: (id: string, notes?: string, userRole?: string) => void;
  rejectConsultation: (id: string, notes: string, userRole?: string) => void;
  markDelivered: (id: string, userRole?: string) => void;
  closeConsultation: (id: string, userRole?: string) => void;
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

  const assignConsultation = (id: string, assignedTo: string, departmentId: string) => {
    const consultation = consultations.find(c => c.id === id);
    const data = {
      assignedTo,
      departmentId,
      status: ConsultationStatus.STUDY as ConsultationStatusValue,
    };
    updateConsultation(id, data);
    notifyConsultationAssigned(id, consultation?.consultationNumber || "", assignedTo).catch(() => {});
  };

  const sendToReviewCommittee = (id: string, userRole?: string) => {
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;
    if (userRole) {
      const validation = validateConsultationTransition(consultation.status, ConsultationStatus.REVIEW_COMMITTEE, userRole as UserRoleType);
      if (!validation.allowed) {
        console.warn("انتقال استشارة مرفوض:", validation.reason);
        return;
      }
    }
    updateConsultation(id, { status: ConsultationStatus.REVIEW_COMMITTEE as ConsultationStatusValue });
    notifyConsultationSentToReview(id, consultation.consultationNumber || "").catch(() => {});
  };

  const approveConsultation = (id: string, notes?: string, userRole?: string) => {
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;
    if (userRole) {
      const validation = validateConsultationTransition(consultation.status, ConsultationStatus.READY, userRole as UserRoleType);
      if (!validation.allowed) {
        console.warn("اعتماد استشارة مرفوض:", validation.reason);
        return;
      }
    }
    updateConsultation(id, {
      status: ConsultationStatus.READY as ConsultationStatusValue,
      reviewDecision: "approved" as ReviewDecisionType,
      reviewNotes: notes || "",
    });
  };

  const rejectConsultation = (id: string, notes: string, userRole?: string) => {
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;
    if (userRole) {
      const validation = validateConsultationTransition(consultation.status, ConsultationStatus.AMENDMENTS, userRole as UserRoleType);
      if (!validation.allowed) {
        console.warn("رفض استشارة مرفوض:", validation.reason);
        return;
      }
    }
    updateConsultation(id, {
      status: ConsultationStatus.AMENDMENTS as ConsultationStatusValue,
      reviewDecision: "rejected" as ReviewDecisionType,
      reviewNotes: notes,
    });
    notifyConsultationReturnedForRevision(id, consultation.consultationNumber || "", consultation.assignedTo || null, notes).catch(() => {});
  };

  const markDelivered = (id: string, userRole?: string) => {
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;
    if (userRole) {
      const validation = validateConsultationTransition(consultation.status, ConsultationStatus.DELIVERED, userRole as UserRoleType);
      if (!validation.allowed) {
        console.warn("تسليم استشارة مرفوض:", validation.reason);
        return;
      }
    }
    updateConsultation(id, { status: ConsultationStatus.DELIVERED as ConsultationStatusValue });
  };

  const closeConsultation = (id: string, userRole?: string) => {
    const consultation = consultations.find(c => c.id === id);
    if (!consultation) return;
    if (userRole) {
      const validation = validateConsultationTransition(consultation.status, ConsultationStatus.CLOSED, userRole as UserRoleType);
      if (!validation.allowed) {
        console.warn("إقفال استشارة مرفوض:", validation.reason);
        return;
      }
    }
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
