import { createContext, useContext, useState, useEffect } from "react";
import type { FieldTask, FieldTaskStatusValue, FieldTaskTypeValue, PriorityType } from "@shared/schema";
import { FieldTaskStatus } from "@shared/schema";

interface FieldTasksContextType {
  fieldTasks: FieldTask[];
  addFieldTask: (data: Partial<FieldTask>) => FieldTask;
  updateFieldTask: (id: string, data: Partial<FieldTask>) => void;
  deleteFieldTask: (id: string) => void;
  startTask: (id: string) => void;
  completeTask: (id: string, notes: string, proofDescription: string, proofFileLink: string) => void;
  cancelTask: (id: string) => void;
  getTaskById: (id: string) => FieldTask | undefined;
  getTasksByAssignee: (userId: string) => FieldTask[];
  getTasksByCase: (caseId: string) => FieldTask[];
  getTasksByConsultation: (consultationId: string) => FieldTask[];
  getPendingTasks: () => FieldTask[];
  getOverdueTasks: () => FieldTask[];
}

const FieldTasksContext = createContext<FieldTasksContextType | undefined>(undefined);

const generateId = () => Math.random().toString(36).substr(2, 9);

const initialFieldTasks: FieldTask[] = [
  {
    id: "1",
    title: "مراجعة ملف العقد في الجهة الحكومية",
    description: "مراجعة ملف العقد رقم 2024/156 في وزارة التجارة",
    taskType: "مراجعة_ميدانية",
    caseId: "1",
    consultationId: null,
    assignedTo: "3",
    assignedBy: "1",
    status: "قيد_الانتظار",
    priority: "عالي",
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    completedAt: null,
    completionNotes: "",
    proofDescription: "",
    proofFileLink: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    title: "تسليم المذكرة للمحكمة",
    description: "تسليم المذكرة الختامية للقضية رقم 2024/001 للمحكمة التجارية",
    taskType: "تسليم_مستندات",
    caseId: "1",
    consultationId: null,
    assignedTo: "4",
    assignedBy: "2",
    status: "قيد_التنفيذ",
    priority: "عاجل",
    dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    completedAt: null,
    completionNotes: "",
    proofDescription: "",
    proofFileLink: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function FieldTasksProvider({ children }: { children: React.ReactNode }) {
  const [fieldTasks, setFieldTasks] = useState<FieldTask[]>(() => {
    const stored = localStorage.getItem("lawfirm_field_tasks");
    return stored ? JSON.parse(stored) : initialFieldTasks;
  });

  useEffect(() => {
    localStorage.setItem("lawfirm_field_tasks", JSON.stringify(fieldTasks));
  }, [fieldTasks]);

  const addFieldTask = (data: Partial<FieldTask>): FieldTask => {
    const newTask: FieldTask = {
      id: generateId(),
      title: data.title || "",
      description: data.description || "",
      taskType: data.taskType || "أخرى",
      caseId: data.caseId || null,
      consultationId: data.consultationId || null,
      assignedTo: data.assignedTo || "",
      assignedBy: data.assignedBy || "",
      status: FieldTaskStatus.PENDING,
      priority: data.priority || "متوسط",
      dueDate: data.dueDate || "",
      completedAt: null,
      completionNotes: "",
      proofDescription: "",
      proofFileLink: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setFieldTasks((prev) => [...prev, newTask]);
    return newTask;
  };

  const updateFieldTask = (id: string, data: Partial<FieldTask>) => {
    setFieldTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, ...data, updatedAt: new Date().toISOString() }
          : task
      )
    );
  };

  const deleteFieldTask = (id: string) => {
    setFieldTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const startTask = (id: string) => {
    updateFieldTask(id, { status: FieldTaskStatus.IN_PROGRESS });
  };

  const completeTask = (
    id: string,
    notes: string,
    proofDescription: string,
    proofFileLink: string
  ) => {
    updateFieldTask(id, {
      status: FieldTaskStatus.COMPLETED,
      completedAt: new Date().toISOString(),
      completionNotes: notes,
      proofDescription,
      proofFileLink,
    });
  };

  const cancelTask = (id: string) => {
    updateFieldTask(id, { status: FieldTaskStatus.CANCELLED });
  };

  const getTaskById = (id: string) => {
    return fieldTasks.find((task) => task.id === id);
  };

  const getTasksByAssignee = (userId: string) => {
    return fieldTasks.filter((task) => task.assignedTo === userId);
  };

  const getTasksByCase = (caseId: string) => {
    return fieldTasks.filter((task) => task.caseId === caseId);
  };

  const getTasksByConsultation = (consultationId: string) => {
    return fieldTasks.filter((task) => task.consultationId === consultationId);
  };

  const getPendingTasks = () => {
    return fieldTasks.filter(
      (task) =>
        task.status === FieldTaskStatus.PENDING ||
        task.status === FieldTaskStatus.IN_PROGRESS
    );
  };

  const getOverdueTasks = () => {
    const today = new Date().toISOString().split("T")[0];
    return fieldTasks.filter(
      (task) =>
        (task.status === FieldTaskStatus.PENDING ||
          task.status === FieldTaskStatus.IN_PROGRESS) &&
        task.dueDate < today
    );
  };

  return (
    <FieldTasksContext.Provider
      value={{
        fieldTasks,
        addFieldTask,
        updateFieldTask,
        deleteFieldTask,
        startTask,
        completeTask,
        cancelTask,
        getTaskById,
        getTasksByAssignee,
        getTasksByCase,
        getTasksByConsultation,
        getPendingTasks,
        getOverdueTasks,
      }}
    >
      {children}
    </FieldTasksContext.Provider>
  );
}

export function useFieldTasks() {
  const context = useContext(FieldTasksContext);
  if (!context) {
    throw new Error("useFieldTasks must be used within a FieldTasksProvider");
  }
  return context;
}
