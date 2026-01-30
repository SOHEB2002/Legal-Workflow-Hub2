import { createContext, useContext, useState, useEffect } from "react";
import type { Consultation, ConsultationStatusValue, ReviewDecisionType, CaseTypeValue, DeliveryTypeValue } from "@shared/schema";
import { ConsultationStatus } from "@shared/schema";

interface ConsultationsContextType {
  consultations: Consultation[];
  addConsultation: (data: Partial<Consultation>, createdBy: string) => Consultation;
  updateConsultation: (id: string, data: Partial<Consultation>) => void;
  deleteConsultation: (id: string) => void;
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
}

const ConsultationsContext = createContext<ConsultationsContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substr(2, 9);
const generateConsultationNumber = () => `S-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

const initialConsultations: Consultation[] = [
  {
    id: "1",
    consultationNumber: "S-2026-0001",
    clientId: "2",
    consultationType: "عام",
    deliveryType: "مكتوبة",
    status: "دراسة",
    departmentId: "1",
    assignedTo: "7",
    questionSummary: "استشارة بخصوص إجراءات الميراث وتقسيم التركة",
    response: "",
    convertedToCaseId: null,
    whatsappGroupLink: "",
    googleDriveFolderId: "",
    reviewNotes: "",
    reviewDecision: null,
    createdBy: "6",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  },
  {
    id: "2",
    consultationNumber: "S-2026-0002",
    clientId: "1",
    consultationType: "تجاري",
    deliveryType: "شفهية",
    status: "جاهز",
    departmentId: "2",
    assignedTo: "5",
    questionSummary: "استشارة حول عقد توريد دولي",
    response: "تم إعداد الرد بخصوص بنود العقد والمخاطر المحتملة",
    convertedToCaseId: null,
    whatsappGroupLink: "",
    googleDriveFolderId: "",
    reviewNotes: "",
    reviewDecision: "approved",
    createdBy: "6",
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  },
];

export function ConsultationsProvider({ children }: { children: React.ReactNode }) {
  const [consultations, setConsultations] = useState<Consultation[]>(() => {
    const stored = localStorage.getItem("lawfirm_consultations");
    return stored ? JSON.parse(stored) : initialConsultations;
  });

  useEffect(() => {
    localStorage.setItem("lawfirm_consultations", JSON.stringify(consultations));
  }, [consultations]);

  const addConsultation = (data: Partial<Consultation>, createdBy: string): Consultation => {
    const newConsultation: Consultation = {
      id: generateId(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
    };
    setConsultations((prev) => [newConsultation, ...prev]);
    return newConsultation;
  };

  const updateConsultation = (id: string, data: Partial<Consultation>) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...data, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const deleteConsultation = (id: string) => {
    setConsultations((prev) => prev.filter((c) => c.id !== id));
  };

  const assignConsultation = (id: string, assignedTo: string, departmentId: string) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              assignedTo,
              departmentId,
              status: ConsultationStatus.STUDY as ConsultationStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const sendToReviewCommittee = (id: string) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: ConsultationStatus.REVIEW_COMMITTEE as ConsultationStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const approveConsultation = (id: string, notes?: string) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: ConsultationStatus.READY as ConsultationStatusValue,
              reviewDecision: "approved" as ReviewDecisionType,
              reviewNotes: notes || "",
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const rejectConsultation = (id: string, notes: string) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: ConsultationStatus.AMENDMENTS as ConsultationStatusValue,
              reviewDecision: "rejected" as ReviewDecisionType,
              reviewNotes: notes,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const markDelivered = (id: string) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: ConsultationStatus.DELIVERED as ConsultationStatusValue,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const closeConsultation = (id: string) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status: ConsultationStatus.CLOSED as ConsultationStatusValue,
              closedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
  };

  const convertToCase = (id: string, caseId: string) => {
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              convertedToCaseId: caseId,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
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
