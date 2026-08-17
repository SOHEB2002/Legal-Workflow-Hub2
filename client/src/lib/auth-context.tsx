import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User, UserRoleType } from "@shared/schema";
import {
  ACTING_AS_QUERY_KEY,
  buildActingIdentities,
  effectiveRolesOf,
  type ActingAsResponse,
  type ActingIdentity,
} from "@/lib/acting-identities";
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
import { apiRequest, refreshAuthToken, getAuthHeaders, queryClient } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  // Single derived flag every page reads to hide write affordances —
  // "+ إضافة" buttons, edit/delete dropdowns, stage transitions,
  // upload zones, comment forms, etc. The server-side viewer guard
  // in server/index.ts is the real enforcement; this flag just keeps
  // the UI honest so viewers don't see buttons that would 403.
  isViewer: boolean;
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
  // The identity set this user currently acts as: THEMSELF, plus every
  // all_cases delegator they stand in for. Always non-empty for a signed-in
  // user and always self-first, so a non-delegated session is exactly [self]
  // and every consumer collapses to its pre-delegation behaviour. Consumers
  // pass this to the helpers in lib/acting-identities (isDeptHeadFor,
  // hasEffectiveRole) instead of testing user.role / user.departmentId
  // directly. See that module's header for what must NOT be routed through it.
  actingIdentities: ActingIdentity[];
  users: User[];
  refetchUsers: () => Promise<void>;
  addUser: (userData: Omit<User, "id" | "createdAt" | "updatedAt">) => Promise<{ success: boolean; error?: string }>;
  updateUser: (id: string, userData: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (id: string, newPassword: string) => void;
  toggleUserStatus: (id: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUsersFromAPI(): Promise<User[]> {
  try {
    // Phase 5 A2/L5 — route through apiRequest so this read shares the
    // single-flight refreshAuthToken / 401-retry path instead of a raw fetch
    // that silently returned [] on an expired token. No data/authz change
    // (the server already sanitizes /api/users via sanitizeUser).
    const res = await apiRequest("GET", "/api/users");
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
    // Wipe ALL cached react-query data so the NEXT user who logs in on this same
    // tab never renders this user's cached responses. Query keys are
    // user-agnostic (e.g. ["/api/my-tasks"]) and the client defaults favor the
    // cache (refetchOnMount:false, staleTime 60s, gcTime 5min), so without this
    // the new session showed the previous user's tasks/notifications until the
    // 30s poll or a hard refresh. clear() only touches the in-memory cache — it
    // does NOT remove localStorage prefs (theme, favorites, filters).
    queryClient.clear();
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const refreshToken = useCallback(async (retryCount = 0) => {
    // Shared single-flight with apiRequest's 401-retry path — prevents the
    // scheduled refresh and an in-flight 401-retry refresh from each
    // calling /api/auth/refresh in parallel and racing the rotation token.
    const result = await refreshAuthToken();
    if (result.ok) {
      scheduleTokenRefresh();
      return;
    }
    if (result.reason === "no-token") {
      logout();
      return;
    }
    if (retryCount < 2) {
      setTimeout(() => refreshToken(retryCount + 1), 30 * 1000);
      return;
    }
    logout();
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
        // Belt-and-suspenders: clear any residual cache from a PRIOR session
        // before the new user's components mount, covering paths that reach
        // login WITHOUT a preceding logout() (session-expiry re-login, or
        // switching account directly). After a normal logout the cache is
        // already empty, so this is a no-op there.
        queryClient.clear();
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

  // The server-resolved set of delegations where THIS user is the delegate —
  // already filtered to نشط + approved + in-window + delegator-still-active by
  // getActingContext, so nothing here re-derives that. Same query key as the
  // amber banner, so the two share ONE cache entry and one request.
  const { data: actingAs } = useQuery<ActingAsResponse>({
    queryKey: [ACTING_AS_QUERY_KEY],
    enabled: !!user,
  });

  const actingIdentities = useMemo(
    () => buildActingIdentities(user, actingAs?.delegators),
    [user, actingAs],
  );

  // 🔴 DELEGATION-WIDENED PERMISSIONS — AN EXPLICIT ALLOWLIST, NEVER A DENYLIST.
  //
  // Only the two booleans below are derived from the EFFECTIVE roles; the other
  // ten keep reading the user's OWN role. That asymmetry is deliberate and is
  // the whole safety property of this change: a denylist would fail OPEN — any
  // permission helper added to this object later would silently become
  // delegation-widened without anyone checking whether its server gate honours
  // delegation at all. Each entry below was traced to its endpoint first.
  //
  // ✅ canAssignInDepartment — server PATCH /api/cases/:id and PATCH
  //    /api/memos/:id gate assignment on canActAtDepartmentTier →
  //    entityActorTier, which expands req.actingContext and returns
  //    "department" for a delegate of a department_head. Already granted
  //    server-side; this is the button that was missing.
  // ✅ canSendReminders — POST /api/reminders gates on
  //    `canSendNotifications(role) || canReferenceRelatedEntity(user, …, ctx)`,
  //    and the second arm IS delegation-aware. Every client reminder control is
  //    per-record, so it always takes that arm.
  //
  // 🔴 canManageUsers — NOT widened. POST /api/users, DELETE /api/users/:id and
  //    POST /api/users/:id/reset-password are all requireRealRole, which never
  //    accepts an inherited role; PATCH /api/users/:id does not admit
  //    department_head at all. Widening it would render the users page and its
  //    create/delete/reset controls for a delegate who is refused by all four.
  // 🔴 canSendNotifications — NOT widened, and NOT pending. The compose dialog
  //    defaults relatedType to "none" (free composition), whose server arm reads
  //    the RAW role via canSendNotifications(user.role), so the "إرسال إشعار"
  //    button would 403. That arm was NOT part of the 26 gates the server batch
  //    converted — it is a permission-helper CALL, a form neither raw-role
  //    inventory covered — and the owner has ruled this boolean excluded. Do not
  //    widen it without a separate ruling on the notification send gate itself.
  //
  // The remaining eight do not list department_head, so they cannot change for
  // this delegation shape; they are left on the own-role path rather than
  // widened speculatively for delegation shapes nobody has verified.
  const effectiveRoles = effectiveRolesOf(actingIdentities);
  const anyEffectiveRole = (allows: (role: UserRoleType) => boolean): boolean =>
    Array.from(effectiveRoles).some((r) => allows(r as UserRoleType));

  const permissions = {
    canManageAllCases: user ? canManageAllCases(user.role) : false,
    canManageAllConsultations: user ? canManageAllConsultations(user.role) : false,
    canManageDepartment: user ? canManageDepartment(user.role) : false,
    canAddCasesAndConsultations: user ? canAddCasesAndConsultations(user.role) : false,
    canAssignInDepartment: anyEffectiveRole(canAssignInDepartment),
    canReviewCases: user ? canReviewCases(user.role) : false,
    canReviewConsultations: user ? canReviewConsultations(user.role) : false,
    canManageUsers: user ? canManageUsers(user.role) : false,
    canAccessHR: user ? canAccessHR(user.role) : false,
    canCloseCases: user ? canCloseCases(user.role) : false,
    canSendNotifications: user ? canSendNotifications(user.role) : false,
    canSendReminders: anyEffectiveRole(canSendReminders),
  };

  const isViewer = user?.role === "viewer";

  return (
    <AuthContext.Provider value={{ user, isViewer, login, logout, changePassword, permissions, actingIdentities, users, refetchUsers, addUser, updateUser, resetPassword, toggleUserStatus }}>
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
