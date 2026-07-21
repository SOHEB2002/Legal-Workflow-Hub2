import { createContext, useContext, useEffect, useState } from "react";
import type { DepartmentInfo } from "@shared/schema";
import { apiRequest } from "./queryClient";
import { useAuth } from "./auth-context";

interface DepartmentsContextType {
  departments: DepartmentInfo[];
  getDepartmentById: (id: string) => DepartmentInfo | undefined;
  getDepartmentName: (id: string) => string;
}

const DepartmentsContext = createContext<DepartmentsContextType | undefined>(undefined);

// Canonical department list — shown as the bootstrap state and used as a
// fallback whenever /api/departments is empty or unreachable. IDs MUST match
// the server's initializeDefaultData seed in storage.ts — department_head
// users are assigned to these ids and the routing / notifications filter
// on an exact id match.
//
// "العقود والمشاريع" (id "5") MUST stay in this list — it's the contracts
// module owner and disappears from every dept dropdown if the fetch races
// or fails and we fall back to defaults without it.
const DEFAULT_DEPARTMENTS: DepartmentInfo[] = [
  { id: "1", name: "عام", headId: null, createdAt: new Date().toISOString() },
  { id: "2", name: "تجاري", headId: null, createdAt: new Date().toISOString() },
  { id: "3", name: "عمالي", headId: null, createdAt: new Date().toISOString() },
  { id: "4", name: "إداري", headId: null, createdAt: new Date().toISOString() },
  { id: "5", name: "العقود والمشاريع", headId: null, createdAt: new Date().toISOString() },
];

const KNOWN_DEPARTMENT_NAMES = ["عام", "تجاري", "عمالي", "إداري", "العقود والمشاريع"] as const;

export function DepartmentsProvider({ children }: { children: React.ReactNode }) {
  // Start with defaults so the UI is never empty while /api/departments
  // is in flight or if the server has no seeded rows.
  const [departments, setDepartments] = useState<DepartmentInfo[]>(DEFAULT_DEPARTMENTS);
  const { user } = useAuth();

  useEffect(() => {
    // Auth gate — mirrors every sibling data context (clients/cases/
    // consultations/…): this provider is mounted ABOVE the login screen
    // (App.tsx), so an ungated fetch fired on the login page with no token
    // and logged a 401 in the console. Keying the effect on `user` also
    // means the list is (re)fetched right after login — previously the
    // effect had `[]` deps and the provider never remounts on login, so a
    // session that STARTED at the login page ran entirely on the hardcoded
    // DEFAULT_DEPARTMENTS fallback and never saw the server rows.
    if (!user) return;
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        // Use apiRequest so the Bearer token is attached — a plain fetch
        // with just credentials:"include" returns 401 for authenticated
        // endpoints and leaves the UI stuck on the hardcoded defaults.
        const res = await apiRequest("GET", "/api/departments");
        const data = (await res.json()) as DepartmentInfo[];
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        const serverNames = new Set(data.map((d) => d.name));
        const filler = DEFAULT_DEPARTMENTS.filter((d) => !serverNames.has(d.name));
        setDepartments([...data, ...filler]);
      } catch (err: any) {
        // Retained for transient failures (network blip, or a token rotation
        // landing mid-flight): retry once so the dropdown still picks up the
        // real server ids without waiting for a reload.
        if (attempt === 0 && !cancelled) {
          setTimeout(() => { if (!cancelled) load(1); }, 1500);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
