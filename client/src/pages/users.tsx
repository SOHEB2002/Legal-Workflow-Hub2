import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, User, Shield, Building2, Phone, Mail, Plus, MoreHorizontal, Pencil, Trash2, Key, Power, Calendar, Users, FileText, Eye, Briefcase, Palmtree, UserCheck, AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useUsers } from "@/lib/users-context";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { User as UserType, UserRoleType, UserStatusValue } from "@shared/schema";
import { UserRole, UserRoleLabels, UserStatus, UserStatusLabels } from "@shared/schema";
import { VacationDialog } from "@/components/users/vacation-dialog";
import { DelegationDialog } from "@/components/users/delegation-dialog";
import { CustomPermissionsDialog } from "@/components/users/custom-permissions-dialog";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";

function getRoleBadgeColor(role: UserRoleType) {
  switch (role) {
    case UserRole.BRANCH_MANAGER:
      return "bg-primary text-primary-foreground";
    case UserRole.CASES_REVIEW_HEAD:
    case UserRole.CONSULTATIONS_REVIEW_HEAD:
      return "bg-accent text-accent-foreground";
    case UserRole.DEPARTMENT_HEAD:
      return "bg-secondary text-secondary-foreground";
    case UserRole.ADMIN_SUPPORT:
      return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case UserRole.EMPLOYEE:
      return "bg-muted text-muted-foreground";
    case UserRole.HR:
      return "bg-purple-500/20 text-purple-600 border-purple-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getStatusBadgeColor(status: UserStatusValue) {
  switch (status) {
    case UserStatus.ACTIVE:
      return "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30";
    case UserStatus.INACTIVE:
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30";
    case UserStatus.ON_VACATION:
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case UserStatus.SUSPENDED:
      return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getWorkloadBadge(activeCases: number, activeConsultations: number) {
  const total = activeCases + activeConsultations;
  if (total > 15) {
    return { label: "حرج", color: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30" };
  } else if (total > 10) {
    return { label: "مرتفع", color: "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30" };
  }
  return { label: "عادي", color: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30" };
}

export default function UsersPage() {
  const { user, permissions, users, addUser, updateUser, deleteUser, resetPassword, toggleUserStatus, refetchUsers } = useAuth();
  const { departments, getDepartmentName } = useDepartments();
  const { teams, getTeamById, extendedUsers, isUserOnVacation, getActiveDelegations, toggleUserStatus: toggleUserStatusExtended } = useUsers();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const isDepartmentHead = user?.role === "department_head";
  const userDepartmentId = user?.departmentId || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>(isDepartmentHead ? userDepartmentId : "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [showVacationDialog, setShowVacationDialog] = useState(false);
  const [showDelegationDialog, setShowDelegationDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [userToAction, setUserToAction] = useState<UserType | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteDeps, setDeleteDeps] = useState<{
    cases: { id: string; title: string; caseNumber?: string }[];
    consultations: { id: string; title: string }[];
    fieldTasks: { id: string; title: string }[];
    departments: { id: string; name: string }[];
    hasDependencies: boolean;
  } | null>(null);
  const [deleteReassignments, setDeleteReassignments] = useState<Record<string, string>>({});
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    role: "employee" as UserRoleType,
    departmentId: "" as string | null,
    isActive: true,
    canBeAssignedCases: false,
    canBeAssignedConsultations: false,
  });

  const [editFormData, setEditFormData] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    role: "employee" as UserRoleType,
    departmentId: "" as string | null,
    isActive: true,
    canBeAssignedCases: false,
    canBeAssignedConsultations: false,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      username: "",
      password: "",
      email: "",
      phone: "",
      role: "employee",
      departmentId: "",
      isActive: true,
      canBeAssignedCases: false,
      canBeAssignedConsultations: false,
    });
  };

  const handleAddUser = async () => {
    if (!formData.name || !formData.username || !formData.password) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء ملء الحقول المطلوبة",
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      });
      return;
    }

    const existingUser = users.find(u => u.username === formData.username);
    if (existingUser) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "اسم المستخدم موجود مسبقاً",
      });
      return;
    }

    const result = await addUser({
      name: formData.name,
      username: formData.username,
      password: formData.password,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
      departmentId: formData.departmentId || null,
      isActive: formData.isActive,
      canBeAssignedCases: formData.canBeAssignedCases,
      canBeAssignedConsultations: formData.canBeAssignedConsultations,
      mustChangePassword: true,
    });

    if (result.success) {
      toast({ title: "تم إضافة المستخدم بنجاح" });
      setShowAddDialog(false);
      resetForm();
    } else {
      toast({
        variant: "destructive",
        title: "فشل إضافة المستخدم",
        description: result.error,
      });
    }
  };

  const handleOpenEdit = (userToEdit: UserType) => {
    setUserToAction(userToEdit);
    setEditFormData({
      name: userToEdit.name,
      username: userToEdit.username,
      email: userToEdit.email,
      phone: userToEdit.phone,
      role: userToEdit.role,
      departmentId: userToEdit.departmentId,
      isActive: userToEdit.isActive,
      canBeAssignedCases: userToEdit.canBeAssignedCases,
      canBeAssignedConsultations: userToEdit.canBeAssignedConsultations,
    });
    setShowEditDialog(true);
  };

  const handleUpdateUser = async () => {
    if (!userToAction) return;

    if (!editFormData.name || !editFormData.username) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء ملء الحقول المطلوبة",
      });
      return;
    }

    const existingUser = users.find(u => u.username === editFormData.username && u.id !== userToAction.id);
    if (existingUser) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "اسم المستخدم موجود مسبقاً",
      });
      return;
    }

    const result = await updateUser(userToAction.id, {
      name: editFormData.name,
      username: editFormData.username,
      email: editFormData.email,
      phone: editFormData.phone,
      role: editFormData.role,
      departmentId: editFormData.departmentId || null,
      isActive: editFormData.isActive,
      canBeAssignedCases: editFormData.canBeAssignedCases,
      canBeAssignedConsultations: editFormData.canBeAssignedConsultations,
    });

    if (result.success) {
      toast({ title: "تم تحديث بيانات المستخدم بنجاح" });
      setShowEditDialog(false);
      setUserToAction(null);
    } else {
      toast({
        variant: "destructive",
        title: "فشل تحديث المستخدم",
        description: result.error,
      });
    }
  };

  const handleOpenDeleteDialog = async (u: UserType) => {
    setUserToAction(u);
    setDeleteReassignments({});
    setDeleteDeps(null);
    setShowDeleteDialog(true);
    setLoadingDeps(true);
    try {
      const token = localStorage.getItem("lawfirm_token");
      const csrfToken = localStorage.getItem("lawfirm_csrf_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const res = await fetch(`/api/users/${u.id}/dependencies`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDeleteDeps(data);
      }
    } catch {
      setDeleteDeps({ cases: [], consultations: [], fieldTasks: [], departments: [], hasDependencies: false });
    } finally {
      setLoadingDeps(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToAction) return;

    if (userToAction.role === "branch_manager") {
      const branchManagers = users.filter(u => u.role === "branch_manager" && u.id !== userToAction.id);
      if (branchManagers.length === 0) {
        toast({ variant: "destructive", title: "خطأ", description: "لا يمكن حذف آخر مدير فرع في النظام" });
        return;
      }
    }

    if (user?.id === userToAction.id) {
      toast({ variant: "destructive", title: "خطأ", description: "لا يمكنك حذف حسابك الحالي" });
      return;
    }

    setDeletingUser(true);
    try {
      const token = localStorage.getItem("lawfirm_token");
      const csrfToken = localStorage.getItem("lawfirm_csrf_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const res = await fetch(`/api/users/${userToAction.id}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ reassignments: deleteReassignments }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `تم حذف المستخدم "${userToAction.name}" بنجاح` });
        await refetchUsers();
      } else {
        toast({ variant: "destructive", title: "خطأ", description: data.error || "فشل حذف المستخدم" });
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ في حذف المستخدم" });
    } finally {
      setDeletingUser(false);
      setShowDeleteDialog(false);
      setUserToAction(null);
      setDeleteDeps(null);
      setDeleteReassignments({});
    }
  };

  const handleResetPassword = async () => {
    if (!userToAction || !newPassword) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء إدخال كلمة المرور الجديدة",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      });
      return;
    }

    try {
      await resetPassword(userToAction.id, newPassword);
      toast({ title: "تم إعادة تعيين كلمة المرور بنجاح" });
      setShowResetPasswordDialog(false);
      setNewPassword("");
      setUserToAction(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "فشل تغيير كلمة المرور",
        description: error?.message || "حدث خطأ أثناء تغيير كلمة المرور",
      });
    }
  };

  const handleToggleStatus = (userToToggle: UserType) => {
    if (userToToggle.role === "branch_manager") {
      const activeBranchManagers = users.filter(u => u.role === "branch_manager" && u.isActive && u.id !== userToToggle.id);
      if (activeBranchManagers.length === 0 && userToToggle.isActive) {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: "لا يمكن تعطيل آخر مدير فرع نشط في النظام",
        });
        return;
      }
    }

    const newIsActive = !userToToggle.isActive;
    toggleUserStatus(userToToggle.id);
    
    const newStatus = newIsActive ? UserStatus.ACTIVE : UserStatus.INACTIVE;
    toggleUserStatusExtended(userToToggle.id, newStatus);
    
    toast({
      title: userToToggle.isActive ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم",
    });
  };

  const filteredUsers = users.filter((u) => {
    if (isDepartmentHead && u.departmentId !== userDepartmentId) {
      return false;
    }
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesDepartment = departmentFilter === "all" || u.departmentId === departmentFilter;
    
    const extendedUser = extendedUsers.find(eu => eu.id === u.id);
    const userStatus = extendedUser?.status || (u.isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE);
    let matchesStatus = true;
    if (statusFilter === "active") {
      matchesStatus = userStatus === UserStatus.ACTIVE;
    } else if (statusFilter === "inactive") {
      matchesStatus = userStatus === UserStatus.INACTIVE;
    } else if (statusFilter === "on_vacation") {
      matchesStatus = userStatus === UserStatus.ON_VACATION || isUserOnVacation(u.id);
    } else if (statusFilter === "suspended") {
      matchesStatus = userStatus === UserStatus.SUSPENDED;
    }
    
    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  const getUserExtendedInfo = (userId: string) => {
    const extended = extendedUsers.find(eu => eu.id === userId);
    return extended || null;
  };
  
  const getUserStatus = (userId: string): UserStatusValue => {
    const extended = extendedUsers.find(eu => eu.id === userId);
    if (extended?.status) return extended.status;
    if (isUserOnVacation(userId)) return UserStatus.ON_VACATION;
    const user = users.find(u => u.id === userId);
    return user?.isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE;
  };

  if (!permissions.canManageUsers) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">غير مصرح</h2>
            <p className="text-muted-foreground">ليس لديك صلاحية للوصول لهذه الصفحة</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isDepartmentHead ? "موظفو القسم" : "إدارة المستخدمين"}
          </h1>
          <p className="text-muted-foreground">
            {isDepartmentHead
              ? `عرض الموظفين التابعين لقسمك`
              : "إدارة حسابات وصلاحيات المستخدمين"}
          </p>
        </div>
        {!isDepartmentHead && (
          <Button data-testid="button-add-user" onClick={() => { resetForm(); setShowAddDialog(true); }}>
            <Plus className="w-4 h-4 ml-2" />
            إضافة مستخدم
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isDepartmentHead ? "موظفو قسمك" : "إجمالي المستخدمين"}
            </CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredUsers.length}</div>
          </CardContent>
        </Card>
        {!isDepartmentHead && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">رؤساء الأقسام</CardTitle>
              <Building2 className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter((u) => u.role === UserRole.DEPARTMENT_HEAD).length}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الموظفين</CardTitle>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(isDepartmentHead ? filteredUsers : users).filter((u) => u.role === UserRole.EMPLOYEE).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">النشطين</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(isDepartmentHead ? filteredUsers : users).filter((u) => u.isActive).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <SmartInput
                inputType="text"
                data-testid="input-search-users"
                placeholder="بحث بالاسم أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-role-filter">
                <SelectValue placeholder="الدور" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأدوار</SelectItem>
                {Object.entries(UserRoleLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isDepartmentHead && (
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-department-filter">
                  <SelectValue placeholder="القسم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأقسام</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
                <SelectItem value="on_vacation">في إجازة</SelectItem>
                <SelectItem value="suspended">موقوف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المستخدم</TableHead>
                <TableHead className="text-right">الدور</TableHead>
                <TableHead className="text-right">القسم</TableHead>
                <TableHead className="text-right">التواصل</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-center w-16">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow
                  key={u.id}
                  data-testid={`row-user-${u.id}`}
                  className="cursor-pointer"
                  onClick={() => setSelectedUser(u)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium"><BidiText>{u.name}</BidiText></p>
                        <p className="text-sm text-muted-foreground"><LtrInline>@{u.username}</LtrInline></p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getRoleBadgeColor(u.role)}>
                      {UserRoleLabels[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.departmentId ? getDepartmentName(u.departmentId) : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="w-3 h-3" />
                        <LtrInline>{u.phone}</LtrInline>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        <LtrInline>{u.email}</LtrInline>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusBadgeColor(getUserStatus(u.id))}>
                      {UserStatusLabels[getUserStatus(u.id)]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" data-testid={`button-actions-${u.id}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!isDepartmentHead && (
                          <DropdownMenuItem
                            data-testid={`button-edit-${u.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(u);
                            }}
                          >
                            <Pencil className="w-4 h-4 ml-2" />
                            تعديل
                          </DropdownMenuItem>
                        )}
                        {!isDepartmentHead && (
                          <DropdownMenuItem
                            data-testid={`button-reset-password-${u.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserToAction(u);
                              setNewPassword("");
                              setShowResetPasswordDialog(true);
                            }}
                          >
                            <Key className="w-4 h-4 ml-2" />
                            إعادة تعيين كلمة المرور
                          </DropdownMenuItem>
                        )}
                        {!isDepartmentHead && (
                          <DropdownMenuItem
                            data-testid={`button-toggle-status-${u.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleStatus(u);
                            }}
                          >
                            <Power className="w-4 h-4 ml-2" />
                            {u.isActive ? "تعطيل" : "تفعيل"}
                          </DropdownMenuItem>
                        )}
                        {!isDepartmentHead && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          data-testid={`button-view-profile-${u.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/user-profile/${u.id}`);
                          }}
                        >
                          <Eye className="w-4 h-4 ml-2" />
                          عرض الملف الشخصي
                        </DropdownMenuItem>
                        {!isDepartmentHead && (
                          <DropdownMenuItem
                            data-testid={`button-schedule-vacation-${u.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserToAction(u);
                              setShowVacationDialog(true);
                            }}
                          >
                            <Palmtree className="w-4 h-4 ml-2" />
                            جدولة إجازة
                          </DropdownMenuItem>
                        )}
                        {!isDepartmentHead && (
                          <DropdownMenuItem
                            data-testid={`button-create-delegation-${u.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserToAction(u);
                              setShowDelegationDialog(true);
                            }}
                          >
                            <UserCheck className="w-4 h-4 ml-2" />
                            إنشاء تفويض
                          </DropdownMenuItem>
                        )}
                        {!isDepartmentHead && (
                          <DropdownMenuItem
                            data-testid={`button-custom-permissions-${u.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setUserToAction(u);
                              setShowPermissionsDialog(true);
                            }}
                          >
                            <Shield className="w-4 h-4 ml-2" />
                            تخصيص الصلاحيات
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          data-testid={`button-activity-log-${u.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/activity-log?userId=${u.id}`);
                          }}
                        >
                          <FileText className="w-4 h-4 ml-2" />
                          سجل النشاط
                        </DropdownMenuItem>
                        {!isDepartmentHead && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-testid={`button-delete-${u.id}`}
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeleteDialog(u);
                              }}
                            >
                              <Trash2 className="w-4 h-4 ml-2" />
                              حذف
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الاسم الكامل *</Label>
                <SmartInput
                  inputType="text"
                  data-testid="input-user-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="الاسم الكامل"
                />
              </div>
              <div>
                <Label>اسم المستخدم *</Label>
                <SmartInput
                  inputType="code"
                  data-testid="input-username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="اسم الدخول"
                />
              </div>
            </div>
            <div>
              <Label>كلمة المرور *</Label>
              <Input
                data-testid="input-password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="كلمة المرور"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>البريد الإلكتروني</Label>
                <SmartInput
                  inputType="email"
                  data-testid="input-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>الهاتف</Label>
                <SmartInput
                  inputType="phone"
                  data-testid="input-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="05xxxxxxxx"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الدور الوظيفي</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: UserRoleType) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UserRoleLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القسم</Label>
                <Select
                  value={formData.departmentId || "none"}
                  onValueChange={(value) => setFormData({ ...formData, departmentId: value === "none" ? null : value })}
                >
                  <SelectTrigger data-testid="select-department">
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قسم</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>مستخدم نشط</Label>
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>يمكن إسناد قضايا</Label>
                <Switch
                  checked={formData.canBeAssignedCases}
                  onCheckedChange={(checked) => setFormData({ ...formData, canBeAssignedCases: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>يمكن إسناد استشارات</Label>
                <Switch
                  checked={formData.canBeAssignedConsultations}
                  onCheckedChange={(checked) => setFormData({ ...formData, canBeAssignedConsultations: checked })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button 
              data-testid="button-submit-user" 
              onClick={handleAddUser}
              disabled={!formData.name || !formData.username || !formData.password}
            >
              إضافة المستخدم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المستخدم</DialogTitle>
            <DialogDescription>
              تعديل بيانات: {userToAction?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الاسم الكامل *</Label>
                <SmartInput
                  inputType="text"
                  data-testid="input-edit-name"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="الاسم الكامل"
                />
              </div>
              <div>
                <Label>اسم المستخدم *</Label>
                <SmartInput
                  inputType="code"
                  data-testid="input-edit-username"
                  value={editFormData.username}
                  onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                  placeholder="اسم الدخول"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>البريد الإلكتروني</Label>
                <SmartInput
                  inputType="email"
                  data-testid="input-edit-email"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>الهاتف</Label>
                <SmartInput
                  inputType="phone"
                  data-testid="input-edit-phone"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  placeholder="05xxxxxxxx"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>الدور الوظيفي</Label>
                <Select
                  value={editFormData.role}
                  onValueChange={(value: UserRoleType) => setEditFormData({ ...editFormData, role: value })}
                >
                  <SelectTrigger data-testid="select-edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UserRoleLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القسم</Label>
                <Select
                  value={editFormData.departmentId || "none"}
                  onValueChange={(value) => setEditFormData({ ...editFormData, departmentId: value === "none" ? null : value })}
                >
                  <SelectTrigger data-testid="select-edit-department">
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون قسم</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>مستخدم نشط</Label>
                <Switch
                  checked={editFormData.isActive}
                  onCheckedChange={(checked) => setEditFormData({ ...editFormData, isActive: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>يمكن إسناد قضايا</Label>
                <Switch
                  checked={editFormData.canBeAssignedCases}
                  onCheckedChange={(checked) => setEditFormData({ ...editFormData, canBeAssignedCases: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>يمكن إسناد استشارات</Label>
                <Switch
                  checked={editFormData.canBeAssignedConsultations}
                  onCheckedChange={(checked) => setEditFormData({ ...editFormData, canBeAssignedConsultations: checked })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button 
              data-testid="button-update-user" 
              onClick={handleUpdateUser}
              disabled={!editFormData.name || !editFormData.username}
            >
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) { setShowDeleteDialog(false); setUserToAction(null); setDeleteDeps(null); setDeleteReassignments({}); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              حذف المستخدم: {userToAction?.name}
            </DialogTitle>
            <DialogDescription>
              سيتم حذف المستخدم بشكل نهائي. هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>

          {loadingDeps ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="mr-2 text-muted-foreground">جارِ التحقق من البيانات المرتبطة...</span>
            </div>
          ) : deleteDeps?.hasDependencies ? (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  يوجد بيانات مرتبطة بهذا المستخدم
                </div>
                يمكنك اختيار شخص آخر لإسناد المهام إليه، أو الحذف مباشرة وستبقى المهام بدون إسناد (سيتم إرسال تنبيه لمدير الفرع).
              </div>

              {deleteDeps.departments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    رئيس قسم ({deleteDeps.departments.length})
                  </h4>
                  {deleteDeps.departments.map(dept => (
                    <div key={dept.id} className="flex items-center justify-between gap-3 p-2 bg-muted/50 rounded-md">
                      <span className="text-sm font-medium">{dept.name}</span>
                      <Select
                        value={deleteReassignments[`department_${dept.id}`] || ""}
                        onValueChange={(val) => setDeleteReassignments(prev => ({ ...prev, [`department_${dept.id}`]: val === "__none__" ? "" : val }))}
                      >
                        <SelectTrigger className="w-[200px] h-8 text-xs" data-testid={`select-reassign-dept-${dept.id}`}>
                          <SelectValue placeholder="بدون رئيس" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">بدون رئيس</SelectItem>
                          {users.filter(u => u.id !== userToAction?.id && u.isActive).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              {deleteDeps.cases.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" />
                    قضايا مسندة ({deleteDeps.cases.length})
                  </h4>
                  {deleteDeps.cases.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-2 bg-muted/50 rounded-md">
                      <span className="text-sm font-medium truncate max-w-[250px]">{c.title || c.caseNumber}</span>
                      <Select
                        value={deleteReassignments[`case_${c.id}`] || ""}
                        onValueChange={(val) => setDeleteReassignments(prev => ({ ...prev, [`case_${c.id}`]: val === "__none__" ? "" : val }))}
                      >
                        <SelectTrigger className="w-[200px] h-8 text-xs" data-testid={`select-reassign-case-${c.id}`}>
                          <SelectValue placeholder="بدون إسناد" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">بدون إسناد</SelectItem>
                          {users.filter(u => u.id !== userToAction?.id && u.isActive).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              {deleteDeps.consultations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    استشارات مسندة ({deleteDeps.consultations.length})
                  </h4>
                  {deleteDeps.consultations.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-2 bg-muted/50 rounded-md">
                      <span className="text-sm font-medium truncate max-w-[250px]">{c.title}</span>
                      <Select
                        value={deleteReassignments[`consultation_${c.id}`] || ""}
                        onValueChange={(val) => setDeleteReassignments(prev => ({ ...prev, [`consultation_${c.id}`]: val === "__none__" ? "" : val }))}
                      >
                        <SelectTrigger className="w-[200px] h-8 text-xs" data-testid={`select-reassign-consultation-${c.id}`}>
                          <SelectValue placeholder="بدون إسناد" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">بدون إسناد</SelectItem>
                          {users.filter(u => u.id !== userToAction?.id && u.isActive).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              {deleteDeps.fieldTasks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    مهام ميدانية ({deleteDeps.fieldTasks.length})
                  </h4>
                  {deleteDeps.fieldTasks.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-3 p-2 bg-muted/50 rounded-md">
                      <span className="text-sm font-medium truncate max-w-[250px]">{t.title}</span>
                      <Select
                        value={deleteReassignments[`fieldTask_${t.id}`] || ""}
                        onValueChange={(val) => setDeleteReassignments(prev => ({ ...prev, [`fieldTask_${t.id}`]: val === "__none__" ? "" : val }))}
                      >
                        <SelectTrigger className="w-[200px] h-8 text-xs" data-testid={`select-reassign-task-${t.id}`}>
                          <SelectValue placeholder="بدون إسناد" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">بدون إسناد</SelectItem>
                          {users.filter(u => u.id !== userToAction?.id && u.isActive).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-sm text-muted-foreground text-center">
              لا توجد بيانات مرتبطة بهذا المستخدم. يمكنك حذفه بأمان.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setUserToAction(null); setDeleteDeps(null); setDeleteReassignments({}); }}>
              إلغاء
            </Button>
            <Button
              data-testid="button-confirm-delete"
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={loadingDeps || deletingUser}
            >
              {deletingUser ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Trash2 className="w-4 h-4 ml-2" />}
              {deletingUser ? "جارِ الحذف..." : "حذف المستخدم"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription>
              إعادة تعيين كلمة مرور المستخدم: {userToAction?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>كلمة المرور الجديدة *</Label>
              <Input
                data-testid="input-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPasswordDialog(false)}>إلغاء</Button>
            <Button 
              data-testid="button-confirm-reset-password" 
              onClick={handleResetPassword}
              disabled={!newPassword || newPassword.length < 6}
            >
              إعادة تعيين
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل المستخدم</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold"><BidiText>{selectedUser.name}</BidiText></h3>
                  <p className="text-muted-foreground"><LtrInline>@{selectedUser.username}</LtrInline></p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">الدور</Label>
                  <Badge className={getRoleBadgeColor(selectedUser.role)}>
                    {UserRoleLabels[selectedUser.role]}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">القسم</Label>
                  <p>
                    {selectedUser.departmentId
                      ? getDepartmentName(selectedUser.departmentId)
                      : "غير محدد"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">البريد</Label>
                  <p><LtrInline>{selectedUser.email}</LtrInline></p>
                </div>
                <div>
                  <Label className="text-muted-foreground">الجوال</Label>
                  <p><LtrInline>{selectedUser.phone}</LtrInline></p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {selectedUser.canBeAssignedCases && (
                  <Badge variant="outline">يمكن إسناد قضايا</Badge>
                )}
                {selectedUser.canBeAssignedConsultations && (
                  <Badge variant="outline">يمكن إسناد استشارات</Badge>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <VacationDialog
        open={showVacationDialog}
        onOpenChange={setShowVacationDialog}
        user={userToAction}
      />
      <DelegationDialog
        open={showDelegationDialog}
        onOpenChange={setShowDelegationDialog}
        user={userToAction}
      />
      <CustomPermissionsDialog
        open={showPermissionsDialog}
        onOpenChange={setShowPermissionsDialog}
        user={userToAction}
      />
    </div>
  );
}
