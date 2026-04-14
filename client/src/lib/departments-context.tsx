import { createContext, useContext, useEffect, useState } from "react";
import type { DepartmentInfo, DepartmentType } from "@shared/schema";
import { Department } from "@shared/schema";

interface DepartmentsContextType {
  departments: DepartmentInfo[];
  getDepartmentById: (id: string) => DepartmentInfo | undefined;
  getDepartmentName: (id: string) => string;
}

const DepartmentsContext = createContext<DepartmentsContextType | undefined>(undefined);

// The canonical department labels. Used both as a bootstrap fallback before
// /api/departments returns and as a name-based fallback for any departmentId
// that doesn't match a server row (legacy data, etc.).
const KNOWN_DEPARTMENT_NAMES = ["عام", "تجاري", "عمالي", "إداري"] as const;

export function DepartmentsProvider({ children }: { children: React.ReactNode }) {
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/departments", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as DepartmentInfo[];
        if (!cancelled && Array.isArray(data)) {
          setDepartments(data);
        }
      } catch {
        // Leave departments empty — getDepartmentName falls back below.
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
    // Fallback: if the caller accidentally passed a department NAME instead
    // of an id (e.g. legacy rows that stored the label in departmentId), and
    // that name is one of the four canonical values, return it as-is. This
    // keeps stage-path resolution working even when the server-side list is
    // out of sync with the stored id.
    if ((KNOWN_DEPARTMENT_NAMES as readonly string[]).includes(id)) return id;
    return "غير محدد";
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
