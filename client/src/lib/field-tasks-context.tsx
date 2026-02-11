import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { FieldTask } from "@shared/schema";
import { FieldTaskStatus } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lawfirm_token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

interface FieldTasksContextType {
  fieldTasks: FieldTask[];
  isLoading: boolean;
  addFieldTask: (data: Partial<FieldTask>) => Promise<FieldTask>;
  updateFieldTask: (id: string, data: Partial<FieldTask>) => Promise<void>;
  deleteFieldTask: (id: string) => Promise<void>;
  startTask: (id: string) => Promise<void>;
  completeTask: (id: string, notes: string, proofDescription: string, proofFileLink: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  getTaskById: (id: string) => FieldTask | undefined;
  getTasksByAssignee: (userId: string) => FieldTask[];
  getTasksByCase: (caseId: string) => FieldTask[];
  getTasksByConsultation: (consultationId: string) => FieldTask[];
  getPendingTasks: () => FieldTask[];
  getOverdueTasks: () => FieldTask[];
}

const FieldTasksContext = createContext<FieldTasksContextType | undefined>(undefined);

export function FieldTasksProvider({ children }: { children: React.ReactNode }) {
  const [fieldTasks, setFieldTasks] = useState<FieldTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFieldTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/field-tasks", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setFieldTasks(data);
      }
    } catch (err) {
      console.error("Failed to fetch field tasks:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFieldTasks();
  }, [fetchFieldTasks]);

  const addFieldTask = async (data: Partial<FieldTask>): Promise<FieldTask> => {
    const res = await apiRequest("POST", "/api/field-tasks", {
      ...data,
      assignedBy: data.assignedBy || "",
    });
    const newTask = await res.json();
    await fetchFieldTasks();
    return newTask;
  };

  const updateFieldTask = async (id: string, data: Partial<FieldTask>): Promise<void> => {
    await apiRequest("PATCH", `/api/field-tasks/${id}`, data);
    await fetchFieldTasks();
  };

  const deleteFieldTask = async (id: string): Promise<void> => {
    await apiRequest("DELETE", `/api/field-tasks/${id}`);
    await fetchFieldTasks();
  };

  const startTask = async (id: string): Promise<void> => {
    await apiRequest("PATCH", `/api/field-tasks/${id}`, {
      status: FieldTaskStatus.IN_PROGRESS,
    });
    await fetchFieldTasks();
  };

  const completeTask = async (
    id: string,
    notes: string,
    proofDescription: string,
    proofFileLink: string
  ): Promise<void> => {
    await apiRequest("PATCH", `/api/field-tasks/${id}`, {
      status: FieldTaskStatus.COMPLETED,
      completedAt: new Date().toISOString(),
      completionNotes: notes,
      proofDescription,
      proofFileLink,
    });
    await fetchFieldTasks();
  };

  const cancelTask = async (id: string): Promise<void> => {
    await apiRequest("PATCH", `/api/field-tasks/${id}`, {
      status: FieldTaskStatus.CANCELLED,
    });
    await fetchFieldTasks();
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
        isLoading,
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
