import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { User, UserRoleType } from "@shared/schema";
import { startApiCallCounter } from "@/lib/queryClient";
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
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
  addUser: (userData: Omit<User, "id" | "createdAt" | "updatedAt">) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, userData: Partial<User>) => Promise<{ success: boolean; error?: string }>;
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
  const csrfToken = localStorage.getItem("lawfirm_csrf_token");
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
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

  const [users, setUsers] = useState<User[]>([]);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetchUsers = useCallback(async () => {
    const fetched = await fetchUsersFromAPI();
    setUsers(fetched);
    setUser(prev => {
      if (!prev) return prev;
      const fresh = fetched.find(u => u.id === prev.id);
      if (!fresh) return prev;
      // IMPORTANT: Only compare auth-relevant fields, NOT timestamps like updatedAt/createdAt.
      // Comparing all fields caused a cascade where all 9 data contexts re-fetched on every
      // page reload (because updatedAt always differs between localStorage and server).
      const authFields = [
        "role", "isActive", "departmentId", "name", "username", "email",
        "phone", "canBeAssignedCases", "canBeAssignedConsultations",
        "avatar", "mustChangePassword", "supervisorId",
      ] as const;
      const changed = authFields.some(
        key => (fresh as any)[key] !== (prev as any)[key]
      );
      if (!changed) return prev;
      const merged = { ...prev, ...fresh };
      localStorage.setItem("lawfirm_user", JSON.stringify(merged));
      return merged;
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch {} // Ignore errors - we're logging out anyway
    setUser(null);
    localStorage.removeItem("lawfirm_token");
    localStorage.removeItem("lawfirm_csrf_token");
    localStorage.removeItem("lawfirm_user");
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const refreshToken = useCallback(async (retryCount = 0) => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        if (retryCount < 2) {
          setTimeout(() => refreshToken(retryCount + 1), 30 * 1000);
          return;
        }
        logout();
        return;
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("lawfirm_token", data.token);
        if (data.csrfToken) {
          localStorage.setItem("lawfirm_csrf_token", data.csrfToken);
        }
        scheduleTokenRefresh();
      }
    } catch (error) {
      console.error("Token refresh failed:", error);
      if (retryCount < 2) {
        setTimeout(() => refreshToken(retryCount + 1), 30 * 1000);
        return;
      }
      logout();
    }
  }, [logout]);

  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    // Refresh 5 minutes before token expires (token lasts 2h = 120min)
    refreshTimerRef.current = setTimeout(() => {
      refreshToken();
    }, 115 * 60 * 1000);
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

  // Handle tab visibility changes (device sleep/wake)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        // Check if token might be expired (tab was sleeping)
        const token = localStorage.getItem("lawfirm_token");
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiresIn = payload.exp * 1000 - Date.now();
            if (expiresIn < 5 * 60 * 1000) { // Less than 5 minutes left
              refreshToken();
            }
          } catch {
            refreshToken();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, refreshToken]);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return { success: false, error: errorData.error || "اسم المستخدم أو كلمة المرور غير صحيحة" };
      }
      const data = await res.json();
      if (data.user) {
        startApiCallCounter(); // measure all /api/* calls in the next 30 seconds
        setUser(data.user);
        if (data.token) {
          localStorage.setItem("lawfirm_token", data.token);
        }
        if (data.csrfToken) {
          localStorage.setItem("lawfirm_csrf_token", data.csrfToken);
        }
        return { success: true };
      }
      return { success: false, error: "حدث خطأ غير متوقع" };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, error: "حدث خطأ في الاتصال بالخادم" };
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
      if (data.csrfToken) {
        localStorage.setItem("lawfirm_csrf_token", data.csrfToken);
      }
      return { success: true };
    } catch (error) {
      console.error("Change password error:", error);
      return { success: false, error: "حدث خطأ في تغيير كلمة المرور" };
    }
  };

  const addUser = async (userData: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<{ success: boolean; error?: string }> => {
    try {
      await apiRequest("POST", "/api/users", userData);
      await refetchUsers();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || "فشل إضافة المستخدم" };
    }
  };

  const updateUser = async (id: string, userData: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    try {
      await apiRequest("PATCH", `/api/users/${id}`, userData);
      await refetchUsers();
      if (user && user.id === id) {
        const updatedUser = { ...user, ...userData };
        setUser(updatedUser);
        localStorage.setItem("lawfirm_user", JSON.stringify(updatedUser));
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || "فشل تحديث المستخدم" };
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
      const token = localStorage.getItem("lawfirm_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/users/${id}`, { method: "DELETE", headers });
      const data = await res.json();
      if (!res.ok) {
        if (data.dependencies) {
          return { success: false, message: `لا يمكن حذف المستخدم لوجود بيانات مرتبطة:\n${data.dependencies.join("\n")}` };
        }
        return { success: false, message: data.error || "فشل حذف المستخدم" };
      }
      await refetchUsers();
      return { success: true, message: data.message || "تم حذف المستخدم بنجاح" };
    } catch (error: any) {
      console.error("Error deleting user:", error);
      return { success: false, message: "فشل حذف المستخدم" };
    }
  };

  const resetPassword = async (id: string, newPassword: string) => {
    const res = await apiRequest("PATCH", `/api/users/${id}`, { password: newPassword, mustChangePassword: true });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "فشل تغيير كلمة المرور");
    }
    await refetchUsers();
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
    <AuthContext.Provider value={{ user, login, logout, changePassword, permissions, users, refetchUsers, addUser, updateUser, deleteUser, resetPassword, toggleUserStatus }}>
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
