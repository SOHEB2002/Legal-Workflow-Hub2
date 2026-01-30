import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Search, User, Shield, Building2, Phone, Mail, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useToast } from "@/hooks/use-toast";
import type { User as UserType, UserRoleType } from "@shared/schema";
import { UserRole, UserRoleLabels } from "@shared/schema";

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

export default function UsersPage() {
  const { user, permissions, users, addUser } = useAuth();
  const { departments, getDepartmentName } = useDepartments();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

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

  const handleAddUser = () => {
    if (!formData.name || !formData.username || !formData.password) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء ملء الحقول المطلوبة",
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

    addUser({
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
    });

    toast({ title: "تم إضافة المستخدم بنجاح" });
    setShowAddDialog(false);
    resetForm();
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

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
          <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
          <p className="text-muted-foreground">إدارة حسابات وصلاحيات المستخدمين</p>
        </div>
        <Button data-testid="button-add-user" onClick={() => { resetForm(); setShowAddDialog(true); }}>
          <Plus className="w-4 h-4 ml-2" />
          إضافة مستخدم
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المستخدمين</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">رؤساء الأقسام</CardTitle>
            <Building2 className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === UserRole.DEPARTMENT_HEAD).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الموظفين</CardTitle>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === UserRole.EMPLOYEE).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المستخدمين النشطين</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.isActive).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search-users"
                placeholder="بحث بالاسم أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-role-filter">
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
                        <p className="font-medium">{u.name}</p>
                        <p className="text-sm text-muted-foreground">@{u.username}</p>
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
                        {u.phone}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        {u.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? "default" : "secondary"}>
                      {u.isActive ? "نشط" : "غير نشط"}
                    </Badge>
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
                <Input
                  data-testid="input-user-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="الاسم الكامل"
                />
              </div>
              <div>
                <Label>اسم المستخدم *</Label>
                <Input
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
                <Input
                  data-testid="input-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>الهاتف</Label>
                <Input
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
                  <h3 className="text-lg font-semibold">{selectedUser.name}</h3>
                  <p className="text-muted-foreground">@{selectedUser.username}</p>
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
                  <p>{selectedUser.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">الجوال</Label>
                  <p>{selectedUser.phone}</p>
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
    </div>
  );
}
