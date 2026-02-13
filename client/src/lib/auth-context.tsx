import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { User, UserRoleType } from "@shared/schema";
import { 
  canManageAllCases, 
  canManageAllConsultations, 
  canManageDepartment,
  canAddCasesAndConsultations,
  canAssignInDepartment,
  canReviewCases,
  canReviewConsultations,
  canManageUsers,
  canAccessHR,
  canCloseCases,
  canSendNotifications,
  canSendReminders
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; mustChangePassword?: boolean }>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  permissions: {
    canManageAllCases: boolean;
    canManageAllConsultations: boolean;
    canManageDepartment: boolean;
    canAddCasesAndConsultations: boolean;
    canAssignInDepartment: boolean;
    canReviewCases: boolean;
    canReviewConsultations: boolean;
    canManageUsers: boolean;
    canAccessHR: boolean;
    canCloseCases: boolean;
    canSendNotifications: boolean;
    canSendReminders: boolean;
  };
  users: User[];
  refetchUsers: () => Promise<void>;
  addUser: (userData: Omit<User, "id" | "createdAt" | "updatedAt">) => void;
  updateUser: (id: string, userData: Partial<User>) => void;
  deleteUser: (id: string) => Promise<{ success: boolean; message: string }>;
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
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("lawfirm_user");
    return stored ? JSON.parse(stored) : null;
  });

  const [mustChangePassword, setMustChangePassword] = useState<boolean>(() => {
    return localStorage.getItem("lawfirm_must_change_password") === "true";
  });

  const [users, setUsers] = useState<User[]>([]);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetchUsers = useCallback(async () => {
    const fetched = await fetchUsersFromAPI();
    setUsers(fetched);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setMustChangePassword(false);
    localStorage.removeItem("lawfirm_token");
    localStorage.removeItem("lawfirm_user");
    localStorage.removeItem("lawfirm_must_change_password");
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        logout();
        return;
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("lawfirm_token", data.token);
        scheduleTokenRefresh();
      }
    } catch (error) {
      console.error("Token refresh failed:", error);
      logout();
    }
  }, [logout]);

  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshToken();
    }, (2 * 60 - 10) * 60 * 1000);
  }, [refreshToken]);

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
      scheduleTokenRefresh();
    }
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [user, refetchUsers, scheduleTokenRefresh]);

  const login = async (username: string, password: string): Promise<{ success: boolean; mustChangePassword?: boolean }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return { success: false };
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        if (data.token) {
          localStorage.setItem("lawfirm_token", data.token);
        }
        if (data.mustChangePassword) {
          setMustChangePassword(true);
          localStorage.setItem("lawfirm_must_change_password", "true");
          return { success: true, mustChangePassword: true };
        }
        setMustChangePassword(false);
        localStorage.removeItem("lawfirm_must_change_password");
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "حدث خطأ" };
      }
      if (data.token) {
        localStorage.setItem("lawfirm_token", data.token);
      }
      setMustChangePassword(false);
      localStorage.removeItem("lawfirm_must_change_password");
      return { success: true };
    } catch (error) {
      console.error("Change password error:", error);
      return { success: false, error: "حدث خطأ في تغيير كلمة المرور" };
    }
  };

  const addUser = async (userData: Omit<User, "id" | "createdAt" | "updatedAt">) => {
    try {
      await apiRequest("POST", "/api/users", userData);
      await refetchUsers();
    } catch (error) {
      console.error("Error adding user:", error);
    }
  };

  const updateUser = async (id: string, userData: Partial<User>) => {
    try {
      await apiRequest("PATCH", `/api/users/${id}`, userData);
      await refetchUsers();
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const deleteUser = async (id: string): Promise<{ success: boolean; message: string }> => {
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

    try {
      await apiRequest("DELETE", `/api/users/${id}`);
      await refetchUsers();
      return { success: true, message: "تم حذف المستخدم بنجاح" };
    } catch (error) {
      console.error("Error deleting user:", error);
      return { success: false, message: "فشل حذف المستخدم" };
    }
  };

  const resetPassword = async (id: string, newPassword: string) => {
    try {
      await apiRequest("PATCH", `/api/users/${id}`, { password: newPassword });
      await refetchUsers();
    } catch (error) {
      console.error("Error resetting password:", error);
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
    } catch (error) {
      console.error("Error toggling user status:", error);
    }
  };

  const permissions = {
    canManageAllCases: user ? canManageAllCases(user.role) : false,
    canManageAllConsultations: user ? canManageAllConsultations(user.role) : false,
    canManageDepartment: user ? canManageDepartment(user.role) : false,
    canAddCasesAndConsultations: user ? canAddCasesAndConsultations(user.role) : false,
    canAssignInDepartment: user ? canAssignInDepartment(user.role) : false,
    canReviewCases: user ? canReviewCases(user.role) : false,
    canReviewConsultations: user ? canReviewConsultations(user.role) : false,
    canManageUsers: user ? canManageUsers(user.role) : false,
    canAccessHR: user ? canAccessHR(user.role) : false,
    canCloseCases: user ? canCloseCases(user.role) : false,
    canSendNotifications: user ? canSendNotifications(user.role) : false,
    canSendReminders: user ? canSendReminders(user.role) : false,
  };

  return (
    <AuthContext.Provider value={{ user, mustChangePassword, login, logout, changePassword, permissions, users, refetchUsers, addUser, updateUser, deleteUser, resetPassword, toggleUserStatus }}>
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
