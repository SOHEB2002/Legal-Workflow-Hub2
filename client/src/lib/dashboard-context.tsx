import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface WidgetConfig {
  id: string;
  title: string;
  type: "stat_card" | "list" | "actions" | "pie_chart" | "bar_chart";
  isVisible: boolean;
  position: number;
  size: WidgetSize;
}

const defaultWidgets: WidgetConfig[] = [
  { id: "active_cases", title: "القضايا النشطة", type: "stat_card", isVisible: true, position: 0, size: "small" },
  { id: "pending_review", title: "بانتظار المراجعة", type: "stat_card", isVisible: true, position: 1, size: "small" },
  { id: "today_hearings", title: "جلسات اليوم", type: "stat_card", isVisible: true, position: 2, size: "small" },
  { id: "overdue_tasks", title: "مهام متأخرة", type: "stat_card", isVisible: true, position: 3, size: "small" },
  { id: "active_consultations", title: "الاستشارات النشطة", type: "stat_card", isVisible: true, position: 4, size: "small" },
  { id: "new_clients_month", title: "عملاء جدد هذا الشهر", type: "stat_card", isVisible: true, position: 5, size: "small" },
  { id: "pending_client_contact", title: "بانتظار التواصل", type: "stat_card", isVisible: true, position: 6, size: "small" },
  { id: "ready_cases", title: "جاهزة للرفع", type: "stat_card", isVisible: true, position: 7, size: "small" },
  { id: "recent_cases", title: "آخر القضايا", type: "list", isVisible: true, position: 8, size: "medium" },
  { id: "upcoming_hearings_list", title: "الجلسات القادمة", type: "list", isVisible: true, position: 9, size: "medium" },
  { id: "pending_field_tasks", title: "المهام الميدانية المعلقة", type: "list", isVisible: true, position: 10, size: "medium" },
  { id: "quick_actions", title: "إجراءات سريعة", type: "actions", isVisible: true, position: 11, size: "medium" },
];

interface DashboardContextType {
  widgets: WidgetConfig[];
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
  reorderWidgets: (newOrder: WidgetConfig[]) => void;
  resetToDefault: () => void;
  moveWidget: (id: string, direction: "up" | "down") => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

const STORAGE_KEY = "awn_dashboard_settings_v1";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const storedIds = new Set(parsed.map((w: WidgetConfig) => w.id));
        const missingWidgets = defaultWidgets.filter(w => !storedIds.has(w.id));
        return [...parsed, ...missingWidgets].sort((a: WidgetConfig, b: WidgetConfig) => a.position - b.position);
      }
    } catch (e) {
      console.error("Error loading dashboard settings:", e);
    }
    return defaultWidgets;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const updateWidget = (id: string, updates: Partial<WidgetConfig>) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const reorderWidgets = (newOrder: WidgetConfig[]) => {
    setWidgets(newOrder.map((w, i) => ({ ...w, position: i })));
  };

  const resetToDefault = () => {
    setWidgets(defaultWidgets);
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
