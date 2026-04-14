import { createContext, useContext, useEffect, useState } from "react";
import type { DepartmentInfo, DepartmentType } from "@shared/schema";
import { Department } from "@shared/schema";

interface DepartmentsContextType {
  departments: DepartmentInfo[];
  getDepartmentById: (id: string) => DepartmentInfo | undefined;
  getDepartmentName: (id: string) => string;
}

const DepartmentsContext = createContext<DepartmentsContextType | undefined>(undefined);

// Canonical department list — shown as the bootstrap state and used as a
// fallback whenever /api/departments is empty or unreachable. These IDs match
// the values the server seeds for a fresh install.
const DEFAULT_DEPARTMENTS: DepartmentInfo[] = [
  { id: "1", name: "تجاري", headId: null, createdAt: new Date().toISOString() },
  { id: "2", name: "عام", headId: null, createdAt: new Date().toISOString() },
  { id: "3", name: "عمالي", headId: null, createdAt: new Date().toISOString() },
  { id: "4", name: "إداري", headId: null, createdAt: new Date().toISOString() },
];

const KNOWN_DEPARTMENT_NAMES = ["عام", "تجاري", "عمالي", "إداري"] as const;

export function DepartmentsProvider({ children }: { children: React.ReactNode }) {
  // Start with defaults so the UI is never empty while /api/departments
  // is in flight or if the server has no seeded rows.
  const [departments, setDepartments] = useState<DepartmentInfo[]>(DEFAULT_DEPARTMENTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/departments", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as DepartmentInfo[];
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        // Merge server departments with defaults: prefer server rows, then
        // append any canonical department whose NAME isn't already covered.
        // This guarantees the dropdown always exposes all four categories
        // even when the server list is incomplete.
        const serverNames = new Set(data.map((d) => d.name));
        const filler = DEFAULT_DEPARTMENTS.filter((d) => !serverNames.has(d.name));
        setDepartments([...data, ...filler]);
      } catch {
        // Keep defaults on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getDepartmentById = (id: string) => departments.find((d) => d.id === id);

  const getDepartmentName = (id: string): string => {
    if (!id) return "غير محدد";
    const dept = departments.find((d) => d.id === id);
    if (dept?.name) return dept.name;
    // Fallback: if the caller passed a department NAME instead of an id
    // (legacy rows, or callers using the label directly), pass it through
    // when it matches one of the four canonical values.
    if ((KNOWN_DEPARTMENT_NAMES as readonly string[]).includes(id)) return id;
    // Last-resort fallback: check the hardcoded defaults by id in case the
    // server list is in flight or mis-seeded.
    const fallback = DEFAULT_DEPARTMENTS.find((d) => d.id === id);
    return fallback?.name || "غير محدد";
  };

  return (
    <DepartmentsContext.Provider
      value={{
        departments,
        getDepartmentById,
        getDepartmentName,
      }}
    >
      {children}
    </DepartmentsContext.Provider>
  );
}

export function useDepartments() {
  const context = useContext(DepartmentsContext);
  if (context === undefined) {
    throw new Error("useDepartments must be used within a DepartmentsProvider");
  }
  return context;
}
