import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { UserRoleType } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface WidgetConfig {
  id: string;
  title: string;
  type: "stat_card" | "list" | "actions" | "pie_chart" | "bar_chart";
  isVisible: boolean;
  position: number;
  size: WidgetSize;
}

const allWidgets: Record<string, Omit<WidgetConfig, "position" | "isVisible">> = {
  active_cases: { id: "active_cases", title: "القضايا النشطة", type: "stat_card", size: "small" },
  pending_review: { id: "pending_review", title: "بانتظار المراجعة", type: "stat_card", size: "small" },
  today_hearings: { id: "today_hearings", title: "جلسات اليوم", type: "stat_card", size: "small" },
  overdue_tasks: { id: "overdue_tasks", title: "مهام متأخرة", type: "stat_card", size: "small" },
  active_consultations: { id: "active_consultations", title: "الاستشارات النشطة", type: "stat_card", size: "small" },
  new_clients_month: { id: "new_clients_month", title: "عملاء جدد هذا الشهر", type: "stat_card", size: "small" },
  pending_client_contact: { id: "pending_client_contact", title: "بانتظار التواصل", type: "stat_card", size: "small" },
  ready_cases: { id: "ready_cases", title: "جاهزة للرفع", type: "stat_card", size: "small" },
  recent_cases: { id: "recent_cases", title: "آخر القضايا", type: "list", size: "medium" },
  upcoming_hearings_list: { id: "upcoming_hearings_list", title: "الجلسات القادمة", type: "list", size: "medium" },
  pending_field_tasks: { id: "pending_field_tasks", title: "المهام الميدانية المعلقة", type: "list", size: "medium" },
  quick_actions: { id: "quick_actions", title: "إجراءات سريعة", type: "actions", size: "medium" },
};

function buildWidgets(ids: string[]): WidgetConfig[] {
  return ids
    .map((id, index) => {
      const w = allWidgets[id];
      if (!w) return null;
      return { ...w, position: index, isVisible: true };
    })
    .filter((w): w is WidgetConfig => w !== null);
}

export function getDefaultWidgetsByRole(role?: UserRoleType): WidgetConfig[] {
  switch (role) {
    case "branch_manager":
      return buildWidgets([
        "active_cases", "pending_review", "today_hearings", "overdue_tasks",
        "active_consultations", "new_clients_month", "pending_client_contact", "ready_cases",
        "recent_cases", "upcoming_hearings_list", "pending_field_tasks", "quick_actions",
      ]);

    case "cases_review_head":
      return buildWidgets([
        "pending_review", "active_cases", "ready_cases", "overdue_tasks",
        "recent_cases",
      ]);

    case "consultations_review_head":
      return buildWidgets([
        "pending_review", "active_consultations", "overdue_tasks",
        "recent_cases",
      ]);

    case "department_head":
      return buildWidgets([
        "active_cases", "active_consultations", "pending_review", "today_hearings",
        "overdue_tasks", "pending_client_contact",
        "recent_cases", "upcoming_hearings_list", "pending_field_tasks", "quick_actions",
      ]);

    case "admin_support":
      return buildWidgets([
        "active_cases", "active_consultations", "pending_client_contact",
        "new_clients_month",
        "quick_actions",
      ]);

    case "employee":
      return buildWidgets([
        "active_cases", "overdue_tasks",
        "pending_field_tasks", "upcoming_hearings_list", "recent_cases",
      ]);

    case "hr":
      return buildWidgets([
        "new_clients_month", "pending_client_contact",
      ]);

    default:
      return buildWidgets([
        "active_cases", "pending_review", "today_hearings", "overdue_tasks",
        "active_consultations", "new_clients_month", "pending_client_contact", "ready_cases",
        "recent_cases", "upcoming_hearings_list", "pending_field_tasks", "quick_actions",
      ]);
  }
}

interface DashboardContextType {
  widgets: WidgetConfig[];
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
  reorderWidgets: (newOrder: WidgetConfig[]) => void;
  resetToDefault: () => void;
  moveWidget: (id: string, direction: "up" | "down") => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

const STORAGE_KEY = "awn_dashboard_settings_v2";

function getStorageKey(role?: string): string {
  return role ? `${STORAGE_KEY}_${role}` : STORAGE_KEY;
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.role as UserRoleType | undefined;
  const storageKey = getStorageKey(role);
  const roleDefaults = getDefaultWidgetsByRole(role);

  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedIds = new Set(parsed.map((w: WidgetConfig) => w.id));
        const missingWidgets = roleDefaults.filter(w => !storedIds.has(w.id));
        return [...parsed, ...missingWidgets].sort((a: WidgetConfig, b: WidgetConfig) => a.position - b.position);
      }
    } catch (e) {
      // dashboard settings load failed, using defaults
    }
    return roleDefaults;
  });

  useEffect(() => {
    if (!role) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedIds = new Set(parsed.map((w: WidgetConfig) => w.id));
        const missingWidgets = roleDefaults.filter(w => !storedIds.has(w.id));
        setWidgets([...parsed, ...missingWidgets].sort((a: WidgetConfig, b: WidgetConfig) => a.position - b.position));
      } else {
        setWidgets(roleDefaults);
      }
    } catch {
      setWidgets(roleDefaults);
    }
  }, [role]);

  useEffect(() => {
    if (role) {
      localStorage.setItem(storageKey, JSON.stringify(widgets));
    }
  }, [widgets, storageKey, role]);

  const updateWidget = (id: string, updates: Partial<WidgetConfig>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const reorderWidgets = (newOrder: WidgetConfig[]) => {
    setWidgets(newOrder.map((w, i) => ({ ...w, position: i })));
  };

  const resetToDefault = () => {
    setWidgets(roleDefaults);
  };

  const moveWidget = (id: string, direction: "up" | "down") => {
    setWidgets(prev => {
      const sorted = [...prev].sort((a, b) => a.position - b.position);
      const index = sorted.findIndex(w => w.id === id);
      if (index === -1) return prev;
      
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sorted.length) return prev;
      
      [sorted[index], sorted[newIndex]] = [sorted[newIndex], sorted[index]];
      return sorted.map((w, i) => ({ ...w, position: i }));
    });
  };

  return (
    <DashboardContext.Provider value={{ widgets, updateWidget, reorderWidgets, resetToDefault, moveWidget }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
