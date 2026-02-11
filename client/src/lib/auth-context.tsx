import { createContext, useContext, useState, useEffect, useCallback } from "react";
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
  canCloseCases,
  canSendNotifications
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

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
    canSendNotifications: boolean;
  };
  users: User[];
  refetchUsers: () => Promise<void>;
  addUser: (userData: Omit<User, "id" | "createdAt" | "updatedAt">) => void;
  updateUser: (id: string, userData: Partial<User>) => void;
  deleteUser: (id: string) => { success: boolean; message: string };
  resetPassword: (id: string, newPassword: string) => void;
  toggleUserStatus: (id: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("lawfirm_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchUsersFromAPI(): Promise<User[]> {
  try {
    const res = await fetch("/api/users", {
      headers: getAuthHeaders(),
      credentials: "include",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("lawfirm_user");
    return stored ? JSON.parse(stored) : null;
  });

  const [users, setUsers] = useState<User[]>([]);

  const refetchUsers = useCallback(async () => {
    const fetched = await fetchUsersFromAPI();
    setUsers(fetched);
  }, []);

  useEffect(() => {
    if (user) {
      localStorage.setItem("lawfirm_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("lawfirm_user");
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      refetchUsers();
    }
  }, [user, refetchUsers]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        if (data.token) {
          localStorage.setItem("lawfirm_token", data.token);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("lawfirm_token");
  };

  const addUser = async (userData: Omit<User, "id" | "createdAt" | "updatedAt">) => {
    try {
      await apiRequest("POST", "/api/users", userData);
      await refetchUsers();
    } catch {
    }
  };

  const updateUser = async (id: string, userData: Partial<User>) => {
    try {
      await apiRequest("PATCH", `/api/users/${id}`, userData);
      await refetchUsers();
    } catch {
    }
  };

  const deleteUser = (id: string): { success: boolean; message: string } => {
    const userToDelete = users.find(u => u.id === id);
    if (!userToDelete) {
      return { success: false, message: "المستخدم غير موجود" };
    }

    if (userToDelete.role === "branch_manager") {
      const branchManagers = users.filter(u => u.role === "branch_manager" && u.id !== id);
      if (branchManagers.length === 0) {
        return { success: false, message: "لا يمكن حذف آخر مدير فرع في النظام" };
      }
    }

    if (user?.id === id) {
      return { success: false, message: "لا يمكنك حذف حسابك الحالي" };
    }

    apiRequest("DELETE", `/api/users/${id}`).then(() => refetchUsers()).catch(() => {});
    return { success: true, message: "تم حذف المستخدم بنجاح" };
  };

  const resetPassword = async (id: string, newPassword: string) => {
    try {
      await apiRequest("PATCH", `/api/users/${id}`, { password: newPassword });
      await refetchUsers();
    } catch {
    }
  };

  const toggleUserStatus = async (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    if (targetUser.role === "branch_manager") {
      const activeBranchManagers = users.filter(u => u.role === "branch_manager" && u.isActive && u.id !== id);
      if (activeBranchManagers.length === 0 && targetUser.isActive) {
        return;
      }
    }

    try {
      await apiRequest("PATCH", `/api/users/${id}`, { isActive: !targetUser.isActive });
      await refetchUsers();
    } catch {
    }
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
    canSendNotifications: user ? canSendNotifications(user.role) : false,
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, permissions, users, refetchUsers, addUser, updateUser, deleteUser, resetPassword, toggleUserStatus }}>
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

export async function getAllUsers(): Promise<User[]> {
  return fetchUsersFromAPI();
}

export async function getUserById(id: string): Promise<User | undefined> {
  const users = await fetchUsersFromAPI();
  return users.find(u => u.id === id);
}

export async function getUsersByDepartment(departmentId: string): Promise<User[]> {
  const users = await fetchUsersFromAPI();
  return users.filter(u => u.departmentId === departmentId);
}

export async function getLawyers(): Promise<User[]> {
  const users = await fetchUsersFromAPI();
  return users.filter(u => u.canBeAssignedCases);
}

export async function getActiveUsers(): Promise<User[]> {
  const users = await fetchUsersFromAPI();
  return users.filter(u => u.isActive);
}
