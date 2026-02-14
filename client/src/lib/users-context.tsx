import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  User,
  ExtendedUser,
  UserStatus,
  UserStatusValue,
  UserVacation,
  VacationStatus,
  VacationStatusValue,
  Delegation,
  DelegationType,
  DelegationTypeValue,
  Team,
  UserCustomPermission,
  UserActivityLog,
  UserSession,
  UserStats,
  ActivityLogEntityType,
  ActivityLogEntityTypeValue,
  ActivityActions,
  ActivityActionValue,
  PermissionType,
  RolePermissions,
  UserRoleType,
} from "@shared/schema";

const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface UsersContextType {
  extendedUsers: ExtendedUser[];
  vacations: UserVacation[];
  delegations: Delegation[];
  teams: Team[];
  customPermissions: UserCustomPermission[];
  activityLogs: UserActivityLog[];
  sessions: UserSession[];
  
  addUser: (userData: Partial<ExtendedUser>) => Promise<ExtendedUser>;
  updateUser: (id: string, userData: Partial<ExtendedUser>) => Promise<void>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (id: string, newPassword: string) => Promise<void>;
  toggleUserStatus: (id: string, status: UserStatusValue) => Promise<void>;
  getUserById: (id: string) => ExtendedUser | undefined;
  getUsersByDepartment: (departmentId: string) => ExtendedUser[];
  getUsersByTeam: (teamId: string) => ExtendedUser[];
  
  scheduleVacation: (userId: string, vacationData: Partial<UserVacation>) => UserVacation;
  cancelVacation: (vacationId: string) => void;
  getActiveVacations: () => UserVacation[];
  getUpcomingVacations: () => UserVacation[];
  getUserVacations: (userId: string) => UserVacation[];
  checkVacationConflicts: (userId: string, startDate: string, endDate: string) => UserVacation | null;
  autoReassignOnVacation: (userId: string) => void;
  
  createDelegation: (delegationData: Partial<Delegation>) => Delegation;
  endDelegation: (delegationId: string) => void;
  getActiveDelegations: (userId: string) => Delegation[];
  getDelegatedToMe: (userId: string) => Delegation[];
  canActOnBehalf: (actingUserId: string, originalUserId: string) => boolean;
  
  createTeam: (teamData: Partial<Team>) => Team;
  updateTeam: (id: string, teamData: Partial<Team>) => void;
  deleteTeam: (id: string) => void;
  addTeamMember: (teamId: string, userId: string) => void;
  removeTeamMember: (teamId: string, userId: string) => void;
  changeTeamLead: (teamId: string, newLeaderId: string) => void;
  getTeamWorkload: (teamId: string) => { totalCases: number; totalConsultations: number; avgWorkload: number };
  getTeamById: (id: string) => Team | undefined;
  
  grantCustomPermission: (userId: string, permissions: string[], reason: string, expiresAt: string | null) => void;
  revokeCustomPermission: (userId: string) => void;
  getEffectivePermissions: (userId: string) => PermissionType[];
  
  logActivity: (userId: string, action: ActivityActionValue, entityType: ActivityLogEntityTypeValue, entityId: string | null, details: Record<string, unknown>) => void;
  getUserActivityLog: (userId: string, filters?: { action?: string; entityType?: string; startDate?: string; endDate?: string }) => UserActivityLog[];
  getRecentActivities: (limit: number) => UserActivityLog[];
  getUserSessions: (userId: string) => UserSession[];
  getLoginHistory: (userId: string, startDate?: string, endDate?: string) => UserSession[];
  
  getUserStats: (userId: string) => UserStats;
  refreshUserStats: (userId: string) => void;
  
  isUserOnVacation: (userId: string) => boolean;
  getAvailableUsersForAssignment: (departmentId?: string) => ExtendedUser[];
}

const defaultStats: UserStats = {
  activeCases: 0,
  activeConsultations: 0,
  completedThisMonth: 0,
  avgCompletionDays: 0,
  reviewAcceptanceRate: 0,
  returnCount: 0,
};

const UsersContext = createContext<UsersContextType | null>(null);

export function UsersProvider({ children }: { children: ReactNode }) {
  const { users: authUsers, refetchUsers } = useAuth();
  
  const [localExtensions, setLocalExtensions] = useState<Record<string, { status?: UserStatusValue; hireDate?: string | null; lastLoginAt?: string | null; teamId?: string | null }>>(() => {
    const saved = localStorage.getItem("user_local_extensions");
    return saved ? JSON.parse(saved) : {};
  });

  const extendedUsers = useMemo<ExtendedUser[]>(() => {
    return authUsers.map(authUser => {
      const ext = localExtensions[authUser.id] || {};
      return {
        ...authUser,
        password: "",
        status: ext.status || (authUser.isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE),
        hireDate: ext.hireDate ?? null,
        lastLoginAt: ext.lastLoginAt ?? null,
        teamId: ext.teamId ?? null,
        currentVacation: null,
        activeDelegations: [],
        customPermissions: null,
        stats: defaultStats,
      } as unknown as ExtendedUser;
    });
  }, [authUsers, localExtensions]);
  
  const [vacations, setVacations] = useState<UserVacation[]>(() => {
    const saved = localStorage.getItem("user_vacations");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [delegations, setDelegations] = useState<Delegation[]>(() => {
    const saved = localStorage.getItem("user_delegations");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = localStorage.getItem("user_teams");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [customPermissions, setCustomPermissions] = useState<UserCustomPermission[]>(() => {
    const saved = localStorage.getItem("user_custom_permissions");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>(() => {
    const saved = localStorage.getItem("user_activity_logs");
    return saved ? JSON.parse(saved) : [];
  });
  
  const [sessions, setSessions] = useState<UserSession[]>(() => {
    const saved = localStorage.getItem("user_sessions");
    return saved ? JSON.parse(saved) : [];
  });
  
  useEffect(() => {
    localStorage.setItem("user_local_extensions", JSON.stringify(localExtensions));
  }, [localExtensions]);
  
  useEffect(() => {
    localStorage.setItem("user_vacations", JSON.stringify(vacations));
  }, [vacations]);
  
  useEffect(() => {
    localStorage.setItem("user_delegations", JSON.stringify(delegations));
  }, [delegations]);
  
  useEffect(() => {
    localStorage.setItem("user_teams", JSON.stringify(teams));
  }, [teams]);
  
  useEffect(() => {
    localStorage.setItem("user_custom_permissions", JSON.stringify(customPermissions));
  }, [customPermissions]);
  
  useEffect(() => {
    localStorage.setItem("user_activity_logs", JSON.stringify(activityLogs));
  }, [activityLogs]);
  
  useEffect(() => {
    localStorage.setItem("user_sessions", JSON.stringify(sessions));
  }, [sessions]);

  const addUser = useCallback(async (userData: Partial<ExtendedUser>): Promise<ExtendedUser> => {
    const apiData = {
      username: userData.username || "",
      password: userData.password || "",
      name: userData.name || "",
      email: userData.email || "",
      phone: userData.phone || "",
      role: userData.role || "employee",
      departmentId: userData.departmentId || null,
      isActive: userData.isActive ?? true,
      canBeAssignedCases: userData.canBeAssignedCases ?? false,
      canBeAssignedConsultations: userData.canBeAssignedConsultations ?? false,
      avatar: userData.avatar || null,
      supervisorId: userData.supervisorId || null,
    };

    const res = await apiRequest("POST", "/api/users", apiData);
    const newUser = await res.json();
    await refetchUsers();

    if (userData.status || userData.hireDate || userData.teamId) {
      setLocalExtensions(prev => ({
        ...prev,
        [newUser.id]: {
          status: userData.status || UserStatus.ACTIVE,
          hireDate: userData.hireDate || new Date().toISOString(),
          teamId: userData.teamId || null,
        },
      }));
    }

    return {
      ...newUser,
      password: "",
      status: userData.status || UserStatus.ACTIVE,
      hireDate: userData.hireDate || new Date().toISOString(),
      lastLoginAt: null,
      teamId: userData.teamId || null,
      currentVacation: null,
      activeDelegations: [],
      customPermissions: null,
      stats: defaultStats,
    } as ExtendedUser;
  }, [refetchUsers]);

  const updateUser = useCallback(async (id: string, userData: Partial<ExtendedUser>) => {
    const { status, hireDate, lastLoginAt, teamId, currentVacation, activeDelegations, customPermissions: cp, stats, ...apiFields } = userData as any;

    if (Object.keys(apiFields).length > 0) {
      await apiRequest("PATCH", `/api/users/${id}`, apiFields);
      await refetchUsers();
    }

    if (status !== undefined || hireDate !== undefined || lastLoginAt !== undefined || teamId !== undefined) {
      setLocalExtensions(prev => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          ...(status !== undefined ? { status } : {}),
          ...(hireDate !== undefined ? { hireDate } : {}),
          ...(lastLoginAt !== undefined ? { lastLoginAt } : {}),
          ...(teamId !== undefined ? { teamId } : {}),
        },
      }));
    }
  }, [refetchUsers]);

  const deleteUser = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    const user = extendedUsers.find(u => u.id === id);
    if (!user) return { success: false, error: "المستخدم غير موجود" };
    
    const branchManagers = extendedUsers.filter(u => u.role === "branch_manager" && u.isActive);
    if (user.role === "branch_manager" && branchManagers.length <= 1) {
      return { success: false, error: "لا يمكن حذف آخر مدير فرع" };
    }
    
    if (user.stats.activeCases > 0 || user.stats.activeConsultations > 0) {
      return { success: false, error: "لا يمكن حذف مستخدم لديه قضايا أو استشارات نشطة" };
    }
    
    try {
      await apiRequest("DELETE", `/api/users/${id}`);
      await refetchUsers();
      setLocalExtensions(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return { success: true };
    } catch {
      return { success: false, error: "فشل في حذف المستخدم" };
    }
  }, [extendedUsers, refetchUsers]);

  const resetPassword = useCallback(async (id: string, newPassword: string) => {
    const res = await apiRequest("PATCH", `/api/users/${id}`, { password: newPassword, mustChangePassword: true });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "فشل تغيير كلمة المرور");
    }
    await refetchUsers();
  }, [refetchUsers]);

  const toggleUserStatus = useCallback(async (id: string, status: UserStatusValue) => {
    const isActive = status === UserStatus.ACTIVE;
    await apiRequest("PATCH", `/api/users/${id}`, { isActive });
    await refetchUsers();
    setLocalExtensions(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        status,
      },
    }));
  }, [refetchUsers]);

  const getUserById = useCallback((id: string): ExtendedUser | undefined => {
    return extendedUsers.find(u => u.id === id);
  }, [extendedUsers]);

  const getUsersByDepartment = useCallback((departmentId: string): ExtendedUser[] => {
    return extendedUsers.filter(u => u.departmentId === departmentId);
  }, [extendedUsers]);

  const getUsersByTeam = useCallback((teamId: string): ExtendedUser[] => {
    return extendedUsers.filter(u => u.teamId === teamId);
  }, [extendedUsers]);

  const scheduleVacation = useCallback((userId: string, vacationData: Partial<UserVacation>): UserVacation => {
    const newVacation: UserVacation = {
      id: generateId(),
      userId,
      startDate: vacationData.startDate || "",
      endDate: vacationData.endDate || "",
      reason: vacationData.reason || "",
      delegateTo: vacationData.delegateTo || null,
      delegationType: vacationData.delegationType || DelegationType.FULL,
      autoReassign: vacationData.autoReassign ?? false,
      status: VacationStatus.SCHEDULED,
      createdAt: new Date().toISOString(),
    };
    setVacations(prev => [...prev, newVacation]);
    return newVacation;
  }, []);

  const cancelVacation = useCallback((vacationId: string) => {
    setVacations(prev => prev.map(v => 
      v.id === vacationId ? { ...v, status: VacationStatus.CANCELLED as VacationStatusValue } : v
    ));
  }, []);

  const getActiveVacations = useCallback((): UserVacation[] => {
    return vacations.filter(v => v.status === VacationStatus.ACTIVE);
  }, [vacations]);

  const getUpcomingVacations = useCallback((): UserVacation[] => {
    const now = new Date().toISOString();
    return vacations.filter(v => v.status === VacationStatus.SCHEDULED && v.startDate > now);
  }, [vacations]);

  const getUserVacations = useCallback((userId: string): UserVacation[] => {
    return vacations.filter(v => v.userId === userId);
  }, [vacations]);

  const checkVacationConflicts = useCallback((userId: string, startDate: string, endDate: string): UserVacation | null => {
    return vacations.find(v => 
      v.userId === userId && 
      (v.status === VacationStatus.SCHEDULED || v.status === VacationStatus.ACTIVE) &&
      (
        (startDate >= v.startDate && startDate <= v.endDate) ||
        (endDate >= v.startDate && endDate <= v.endDate) ||
        (startDate <= v.startDate && endDate >= v.endDate)
      )
    ) || null;
  }, [vacations]);

  const autoReassignOnVacation = useCallback((userId: string) => {
    console.log("Auto reassigning cases for user:", userId);
  }, []);

  const createDelegation = useCallback((delegationData: Partial<Delegation>): Delegation => {
    const newDelegation: Delegation = {
      id: generateId(),
      fromUserId: delegationData.fromUserId || "",
      toUserId: delegationData.toUserId || "",
      startDate: delegationData.startDate || "",
      endDate: delegationData.endDate || "",
      type: delegationData.type || DelegationType.FULL,
      permissions: delegationData.permissions || [],
      reason: delegationData.reason || "",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    setDelegations(prev => [...prev, newDelegation]);
    return newDelegation;
  }, []);

  const endDelegation = useCallback((delegationId: string) => {
    setDelegations(prev => prev.map(d => 
      d.id === delegationId ? { ...d, isActive: false } : d
    ));
  }, []);

  const getActiveDelegations = useCallback((userId: string): Delegation[] => {
    return delegations.filter(d => d.fromUserId === userId && d.isActive);
  }, [delegations]);

  const getDelegatedToMe = useCallback((userId: string): Delegation[] => {
    return delegations.filter(d => d.toUserId === userId && d.isActive);
  }, [delegations]);

  const canActOnBehalf = useCallback((actingUserId: string, originalUserId: string): boolean => {
    return delegations.some(d => 
      d.toUserId === actingUserId && 
      d.fromUserId === originalUserId && 
      d.isActive
    );
  }, [delegations]);

  const createTeam = useCallback((teamData: Partial<Team>): Team => {
    const newTeam: Team = {
      id: generateId(),
      name: teamData.name || "",
      description: teamData.description || "",
      departmentId: teamData.departmentId || "",
      leaderId: teamData.leaderId || "",
      memberIds: teamData.memberIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTeams(prev => [...prev, newTeam]);
    return newTeam;
  }, []);

  const updateTeam = useCallback((id: string, teamData: Partial<Team>) => {
    setTeams(prev => prev.map(t => 
      t.id === id ? { ...t, ...teamData, updatedAt: new Date().toISOString() } : t
    ));
  }, []);

  const deleteTeam = useCallback((id: string) => {
    setTeams(prev => prev.filter(t => t.id !== id));
    setLocalExtensions(prev => {
      const next = { ...prev };
      for (const userId of Object.keys(next)) {
        if (next[userId]?.teamId === id) {
          next[userId] = { ...next[userId], teamId: null };
        }
      }
      return next;
    });
  }, []);

  const addTeamMember = useCallback((teamId: string, userId: string) => {
    setTeams(prev => prev.map(t => 
      t.id === teamId ? { ...t, memberIds: [...t.memberIds, userId], updatedAt: new Date().toISOString() } : t
    ));
    setLocalExtensions(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), teamId },
    }));
  }, []);

  const removeTeamMember = useCallback((teamId: string, userId: string) => {
    setTeams(prev => prev.map(t => 
      t.id === teamId ? { ...t, memberIds: t.memberIds.filter(id => id !== userId), updatedAt: new Date().toISOString() } : t
    ));
    setLocalExtensions(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), teamId: null },
    }));
  }, []);

  const changeTeamLead = useCallback((teamId: string, newLeaderId: string) => {
    setTeams(prev => prev.map(t => 
      t.id === teamId ? { ...t, leaderId: newLeaderId, updatedAt: new Date().toISOString() } : t
    ));
  }, []);

  const getTeamWorkload = useCallback((teamId: string): { totalCases: number; totalConsultations: number; avgWorkload: number } => {
    const teamMembers = extendedUsers.filter(u => u.teamId === teamId);
    const totalCases = teamMembers.reduce((sum, u) => sum + u.stats.activeCases, 0);
    const totalConsultations = teamMembers.reduce((sum, u) => sum + u.stats.activeConsultations, 0);
    const avgWorkload = teamMembers.length > 0 ? (totalCases + totalConsultations) / teamMembers.length : 0;
    return { totalCases, totalConsultations, avgWorkload };
  }, [extendedUsers]);

  const getTeamById = useCallback((id: string): Team | undefined => {
    return teams.find(t => t.id === id);
  }, [teams]);

  const grantCustomPermission = useCallback((
    userId: string, 
    permissions: string[], 
    reason: string, 
    expiresAt: string | null
  ) => {
    const existing = customPermissions.find(p => p.userId === userId);
    if (existing) {
      setCustomPermissions(prev => prev.map(p => 
        p.userId === userId ? { ...p, additionalPermissions: permissions, reason, expiresAt } : p
      ));
    } else {
      const newPermission: UserCustomPermission = {
        id: generateId(),
        userId,
        additionalPermissions: permissions,
        restrictedPermissions: [],
        reason,
        grantedBy: "",
        expiresAt,
        createdAt: new Date().toISOString(),
      };
      setCustomPermissions(prev => [...prev, newPermission]);
    }
  }, [customPermissions]);

  const revokeCustomPermission = useCallback((userId: string) => {
    setCustomPermissions(prev => prev.filter(p => p.userId !== userId));
  }, []);

  const getEffectivePermissions = useCallback((userId: string): PermissionType[] => {
    const user = extendedUsers.find(u => u.id === userId);
    if (!user) return [];
    
    const rolePermissions = RolePermissions[user.role as UserRoleType] || [];
    const custom = customPermissions.find(p => p.userId === userId);
    
    if (!custom) return rolePermissions;
    
    const effective = new Set([...rolePermissions, ...custom.additionalPermissions]);
    custom.restrictedPermissions.forEach(p => effective.delete(p as PermissionType));
    
    return Array.from(effective) as PermissionType[];
  }, [extendedUsers, customPermissions]);

  const logActivity = useCallback((
    userId: string, 
    action: ActivityActionValue, 
    entityType: ActivityLogEntityTypeValue, 
    entityId: string | null, 
    details: Record<string, unknown>
  ) => {
    const newLog: UserActivityLog = {
      id: generateId(),
      userId,
      action,
      entityType,
      entityId,
      details,
      ipAddress: "",
      timestamp: new Date().toISOString(),
    };
    setActivityLogs(prev => [newLog, ...prev].slice(0, 1000));
  }, []);

  const getUserActivityLog = useCallback((
    userId: string, 
    filters?: { action?: string; entityType?: string; startDate?: string; endDate?: string }
  ): UserActivityLog[] => {
    let logs = activityLogs.filter(l => l.userId === userId);
    
    if (filters?.action) {
      logs = logs.filter(l => l.action === filters.action);
    }
    if (filters?.entityType) {
      logs = logs.filter(l => l.entityType === filters.entityType);
    }
    if (filters?.startDate) {
      logs = logs.filter(l => l.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      logs = logs.filter(l => l.timestamp <= filters.endDate!);
    }
    
    return logs;
  }, [activityLogs]);

  const getRecentActivities = useCallback((limit: number): UserActivityLog[] => {
    return activityLogs.slice(0, limit);
  }, [activityLogs]);

  const getUserSessions = useCallback((userId: string): UserSession[] => {
    return sessions.filter(s => s.userId === userId);
  }, [sessions]);

  const getLoginHistory = useCallback((userId: string, startDate?: string, endDate?: string): UserSession[] => {
    let userSessions = sessions.filter(s => s.userId === userId);
    
    if (startDate) {
      userSessions = userSessions.filter(s => s.loginAt >= startDate);
    }
    if (endDate) {
      userSessions = userSessions.filter(s => s.loginAt <= endDate);
    }
    
    return userSessions;
  }, [sessions]);

  const getUserStats = useCallback((userId: string): UserStats => {
    const user = extendedUsers.find(u => u.id === userId);
    return user?.stats || defaultStats;
  }, [extendedUsers]);

  const refreshUserStats = useCallback((userId: string) => {
    console.log("Refreshing stats for user:", userId);
  }, []);

  const isUserOnVacation = useCallback((userId: string): boolean => {
    const now = new Date().toISOString();
    return vacations.some(v => 
      v.userId === userId && 
      v.status === VacationStatus.ACTIVE &&
      v.startDate <= now && 
      v.endDate >= now
    );
  }, [vacations]);

  const getAvailableUsersForAssignment = useCallback((departmentId?: string): ExtendedUser[] => {
    let available = extendedUsers.filter(u => 
      u.status === UserStatus.ACTIVE && 
      u.isActive && 
      !isUserOnVacation(u.id)
    );
    
    if (departmentId) {
      available = available.filter(u => u.departmentId === departmentId);
    }
    
    return available;
  }, [extendedUsers, isUserOnVacation]);

  const value: UsersContextType = {
    extendedUsers,
    vacations,
    delegations,
    teams,
    customPermissions,
    activityLogs,
    sessions,
    addUser,
    updateUser,
    deleteUser,
    resetPassword,
    toggleUserStatus,
    getUserById,
    getUsersByDepartment,
    getUsersByTeam,
    scheduleVacation,
    cancelVacation,
    getActiveVacations,
    getUpcomingVacations,
    getUserVacations,
    checkVacationConflicts,
    autoReassignOnVacation,
    createDelegation,
    endDelegation,
    getActiveDelegations,
    getDelegatedToMe,
    canActOnBehalf,
    createTeam,
    updateTeam,
    deleteTeam,
    addTeamMember,
    removeTeamMember,
    changeTeamLead,
    getTeamWorkload,
    getTeamById,
    grantCustomPermission,
    revokeCustomPermission,
    getEffectivePermissions,
    logActivity,
    getUserActivityLog,
    getRecentActivities,
    getUserSessions,
    getLoginHistory,
    getUserStats,
    refreshUserStats,
    isUserOnVacation,
    getAvailableUsersForAssignment,
  };

  return (
    <UsersContext.Provider value={value}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (!context) {
    throw new Error("useUsers must be used within a UsersProvider");
  }
  return context;
}
