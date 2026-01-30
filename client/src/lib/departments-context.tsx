import { createContext, useContext, useState } from "react";
import type { DepartmentInfo, DepartmentType } from "@shared/schema";
import { Department } from "@shared/schema";

interface DepartmentsContextType {
  departments: DepartmentInfo[];
  getDepartmentById: (id: string) => DepartmentInfo | undefined;
  getDepartmentName: (id: string) => string;
}

const DepartmentsContext = createContext<DepartmentsContextType | undefined>(undefined);

const defaultDepartments: DepartmentInfo[] = [
  {
    id: "1",
    name: "عام",
    headId: "4",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    name: "تجاري",
    headId: "5",
    createdAt: new Date().toISOString(),
  },
  {
    id: "3",
    name: "عمالي",
    headId: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "4",
    name: "إداري",
    headId: null,
    createdAt: new Date().toISOString(),
  },
];

export function DepartmentsProvider({ children }: { children: React.ReactNode }) {
  const [departments] = useState<DepartmentInfo[]>(defaultDepartments);

  const getDepartmentById = (id: string) => departments.find((d) => d.id === id);

  const getDepartmentName = (id: string): string => {
    const dept = departments.find((d) => d.id === id);
    return dept?.name || "غير محدد";
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
