import { createContext, useContext, useState, useEffect } from "react";
import type { User, UserRoleType } from "@shared/schema";
import { 
  canManageAllCases, 
  canManageAllConsultations, 
  canManageDepartment,
  canAddCasesAndConsultations,
  canReviewCases,
  canReviewConsultations,
  canManageUsers,
  canAccessHR,
  canCloseCases
} from "@shared/schema";

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  permissions: {
    canManageAllCases: boolean;
    canManageAllConsultations: boolean;
    canManageDepartment: boolean;
    canAddCasesAndConsultations: boolean;
    canReviewCases: boolean;
    canReviewConsultations: boolean;
    canManageUsers: boolean;
    canAccessHR: boolean;
    canCloseCases: boolean;
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultUsers: User[] = [
  { 
    id: "1", 
    username: "manager", 
    password: "1234", 
    name: "مدير الفرع", 
    email: "manager@lawfirm.com",
    phone: "0501234567",
    role: "branch_manager",
    departmentId: null,
    isActive: true,
    canBeAssignedCases: true,
    canBeAssignedConsultations: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "2", 
    username: "cases_head", 
    password: "1234", 
    name: "رئيس لجنة مراجعة القضايا", 
    email: "cases@lawfirm.com",
    phone: "0502234567",
    role: "cases_review_head",
    departmentId: null,
    isActive: true,
    canBeAssignedCases: false,
    canBeAssignedConsultations: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "3", 
    username: "consult_head", 
    password: "1234", 
    name: "رئيس لجنة مراجعة الاستشارات", 
    email: "consult@lawfirm.com",
    phone: "0503234567",
    role: "consultations_review_head",
    departmentId: null,
    isActive: true,
    canBeAssignedCases: false,
    canBeAssignedConsultations: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "4", 
    username: "omar", 
    password: "1234", 
    name: "المحامي عمر - رئيس القسم العام", 
    email: "omar@lawfirm.com",
    phone: "0504234567",
    role: "department_head",
    departmentId: "1",
    isActive: true,
    canBeAssignedCases: true,
    canBeAssignedConsultations: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "5", 
    username: "muhannad", 
    password: "1234", 
    name: "المحامي مهند - رئيس القسم التجاري", 
    email: "muhannad@lawfirm.com",
    phone: "0505234567",
    role: "department_head",
    departmentId: "2",
    isActive: true,
    canBeAssignedCases: true,
    canBeAssignedConsultations: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "6", 
    username: "support", 
    password: "1234", 
    name: "الدعم الإداري", 
    email: "support@lawfirm.com",
    phone: "0506234567",
    role: "admin_support",
    departmentId: null,
    isActive: true,
    canBeAssignedCases: false,
    canBeAssignedConsultations: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "7", 
    username: "lawyer1", 
    password: "1234", 
    name: "أحمد محمد - محامي", 
    email: "ahmed@lawfirm.com",
    phone: "0507234567",
    role: "employee",
    departmentId: "1",
    isActive: true,
    canBeAssignedCases: true,
    canBeAssignedConsultations: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  { 
    id: "8", 
    username: "hr", 
    password: "1234", 
    name: "الموارد البشرية", 
    email: "hr@lawfirm.com",
    phone: "0508234567",
    role: "hr",
    departmentId: null,
    isActive: true,
    canBeAssignedCases: false,
    canBeAssignedConsultations: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("lawfirm_user");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("lawfirm_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("lawfirm_user");
    }
  }, [user]);

  const login = async (username: string, password: string): Promise<boolean> => {
    const foundUser = defaultUsers.find(
      (u) => u.username === username && u.password === password
    );
    if (foundUser) {
      setUser(foundUser);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
  };

  const permissions = {
    canManageAllCases: user ? canManageAllCases(user.role) : false,
    canManageAllConsultations: user ? canManageAllConsultations(user.role) : false,
    canManageDepartment: user ? canManageDepartment(user.role) : false,
    canAddCasesAndConsultations: user ? canAddCasesAndConsultations(user.role) : false,
    canReviewCases: user ? canReviewCases(user.role) : false,
    canReviewConsultations: user ? canReviewConsultations(user.role) : false,
    canManageUsers: user ? canManageUsers(user.role) : false,
    canAccessHR: user ? canAccessHR(user.role) : false,
    canCloseCases: user ? canCloseCases(user.role) : false,
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, permissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function getAllUsers(): User[] {
  return defaultUsers;
}

export function getUserById(id: string): User | undefined {
  return defaultUsers.find(u => u.id === id);
}

export function getUsersByDepartment(departmentId: string): User[] {
  return defaultUsers.filter(u => u.departmentId === departmentId);
}

export function getLawyers(): User[] {
  return defaultUsers.filter(u => u.canBeAssignedCases);
}
