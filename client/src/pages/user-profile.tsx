import { useState } from "react";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useUsers } from "@/lib/users-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useToast } from "@/hooks/use-toast";
import {
  User as UserIcon,
  Mail,
  Phone,
  Building2,
  Calendar,
  Briefcase,
  Clock,
  TrendingUp,
  BarChart3,
  FileText,
  Users,
  Palmtree,
  UserCheck,
  Shield,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { UserRoleLabels, UserStatusLabels, VacationStatusLabels, DelegationTypeLabels } from "@shared/schema";
import type { UserRoleType, UserStatusValue, VacationStatusValue, DelegationTypeValue } from "@shared/schema";
import { VacationDialog } from "@/components/users/vacation-dialog";
import { DelegationDialog } from "@/components/users/delegation-dialog";

export default function UserProfilePage() {
  const [, params] = useRoute("/user-profile/:id");
  const userId = params?.id;

  const { user: currentUser, users, changePassword } = useAuth();
  const { toast } = useToast();
  const { getDepartmentName } = useDepartments();
  const { 
    extendedUsers, 
    getUserVacations, 
    getActiveDelegations, 
    getDelegatedToMe,
    getUserActivityLog,
    getTeamById,
    getUserStats,
  } = useUsers();
  const { cases } = useCases();
  const { consultations } = useConsultations();

  const [showVacationDialog, setShowVacationDialog] = useState(false);
  const [showDelegationDialog, setShowDelegationDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const isOwnProfile = currentUser?.id === userId;

  const handleChangePassword = async () => {
    if (!newPassword || !currentPassword) {
      toast({ variant: "destructive", title: "يرجى تعبئة جميع الحقول" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: "destructive", title: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "كلمة المرور الجديدة وتأكيدها غير متطابقتين" });
      return;
    }
    setChangingPassword(true);
    const result = await changePassword(currentPassword, newPassword);
    setChangingPassword(false);
    if (result.success) {
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      toast({ variant: "destructive", title: "فشل تغيير كلمة المرور", description: result.error });
    }
  };

  const user = users.find(u => u.id === userId);
  const extendedUser = extendedUsers.find(eu => eu.id === userId);
  const userVacations = userId ? getUserVacations(userId) : [];
  const outgoingDelegations = userId ? getActiveDelegations(userId) : [];
  const incomingDelegations = userId ? getDelegatedToMe(userId) : [];
  const activityLog = userId ? getUserActivityLog(userId).slice(0, 20) : [];
  const team = extendedUser?.teamId ? getTeamById(extendedUser.teamId) : null;
  const stats = userId ? getUserStats(userId) : null;

  const userCases = cases.filter(c => 
    c.primaryLawyerId === userId || 
    c.responsibleLawyerId === userId ||
    c.assignedLawyers.includes(userId || "")
  );

  const userConsultations = consultations.filter(c => c.assignedTo === userId);

  if (!user) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">المستخدم غير موجود</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initials = user.name.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex flex-col items-center">
              <Avatar className="w-24 h-24">
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-xl font-bold mt-3">{user.name}</h2>
              <Badge className="mt-1">{UserRoleLabels[user.role as UserRoleType]}</Badge>
              <Badge 
                variant="outline" 
                className={`mt-2 ${user.isActive ? "border-green-500 text-green-600" : "border-red-500 text-red-600"}`}
              >
                {user.isActive ? "نشط" : "غير نشط"}
              </Badge>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                  <p className="font-medium">{user.email || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">الهاتف</p>
                  <p className="font-medium">{user.phone || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">القسم</p>
                  <p className="font-medium">{user.departmentId ? getDepartmentName(user.departmentId) : "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">الفريق</p>
                  <p className="font-medium">{team?.name || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">تاريخ التعيين</p>
                  <div className="font-medium"><DualDateDisplay date={extendedUser?.hireDate} compact /></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">آخر دخول</p>
                  <div className="font-medium"><DualDateDisplay date={extendedUser?.lastLoginAt} compact /></div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => setShowVacationDialog(true)}>
                <Palmtree className="w-4 h-4 ml-2" />
                جدولة إجازة
              </Button>
              <Button variant="outline" onClick={() => setShowDelegationDialog(true)}>
                <UserCheck className="w-4 h-4 ml-2" />
                إنشاء تفويض
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="stats" className="w-full">
        <TabsList className={`grid w-full ${isOwnProfile ? "grid-cols-7" : "grid-cols-6"}`}>
          <TabsTrigger value="stats" data-testid="tab-stats">الإحصائيات</TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases">القضايا</TabsTrigger>
          <TabsTrigger value="vacations" data-testid="tab-vacations">الإجازات</TabsTrigger>
          <TabsTrigger value="delegations" data-testid="tab-delegations">التفويضات</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">سجل النشاط</TabsTrigger>
          <TabsTrigger value="permissions" data-testid="tab-permissions">الصلاحيات</TabsTrigger>
          {isOwnProfile && <TabsTrigger value="security" data-testid="tab-security">الأمان</TabsTrigger>}
        </TabsList>

        <TabsContent value="stats" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">القضايا النشطة</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.activeCases || userCases.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">الاستشارات النشطة</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.activeConsultations || userConsultations.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">المنجز هذا الشهر</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.completedThisMonth || 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">نسبة قبول المراجعة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Progress value={stats?.reviewAcceptanceRate || 0} className="flex-1" />
                  <span className="text-lg font-bold">{stats?.reviewAcceptanceRate || 0}%</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">متوسط وقت الإنجاز</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-muted-foreground" />
                  <span className="text-lg font-bold">{stats?.avgCompletionDays || 0} يوم</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cases" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم القضية</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المرحلة</TableHead>
                    <TableHead className="text-right">الأولوية</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userCases.slice(0, 10).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.caseNumber}</TableCell>
                      <TableCell>{c.caseType}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.currentStage}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{c.priority}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {userCases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        لا توجد قضايا
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vacations" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">من</TableHead>
                    <TableHead className="text-right">إلى</TableHead>
                    <TableHead className="text-right">السبب</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userVacations.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell><DualDateDisplay date={v.startDate} compact /></TableCell>
                      <TableCell><DualDateDisplay date={v.endDate} compact /></TableCell>
                      <TableCell>{v.reason || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {VacationStatusLabels[v.status as VacationStatusValue]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {userVacations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        لا توجد إجازات
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delegations" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">التفويضات الصادرة</CardTitle>
              </CardHeader>
              <CardContent>
                {outgoingDelegations.length > 0 ? (
                  <div className="space-y-3">
                    {outgoingDelegations.map((d) => {
                      const toUser = users.find(u => u.id === d.toUserId);
                      return (
                        <div key={d.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                            <p className="font-medium">{toUser?.name}</p>
                            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-1">
                              <DualDateDisplay date={d.startDate} compact /> - <DualDateDisplay date={d.endDate} compact />
                            </div>
                          </div>
                          <Badge>{DelegationTypeLabels[d.type as DelegationTypeValue]}</Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">لا توجد تفويضات صادرة</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">التفويضات الواردة</CardTitle>
              </CardHeader>
              <CardContent>
                {incomingDelegations.length > 0 ? (
                  <div className="space-y-3">
                    {incomingDelegations.map((d) => {
                      const fromUser = users.find(u => u.id === d.fromUserId);
                      return (
                        <div key={d.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div>
                            <p className="font-medium">{fromUser?.name}</p>
                            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-1">
                              <DualDateDisplay date={d.startDate} compact /> - <DualDateDisplay date={d.endDate} compact />
                            </div>
                          </div>
                          <Badge>{DelegationTypeLabels[d.type as DelegationTypeValue]}</Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">لا توجد تفويضات واردة</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {activityLog.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 border rounded-md">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="flex-1">
                      <p className="font-medium">{log.action}</p>
                      <p className="text-sm text-muted-foreground">
                        {log.entityType} {log.entityId ? `- ${log.entityId}` : ""}
                      </p>
                      <div className="text-xs text-muted-foreground mt-1">
                        <DualDateDisplay date={log.timestamp} showTime compact />
                      </div>
                    </div>
                  </div>
                ))}
                {activityLog.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">لا توجد أنشطة</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4" />
                صلاحيات الدور: {UserRoleLabels[user.role as UserRoleType]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                يتم تحديد الصلاحيات بناءً على الدور الوظيفي للمستخدم.
                يمكن للمديرين تخصيص صلاحيات إضافية أو تقييد صلاحيات معينة.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {isOwnProfile && (
          <TabsContent value="security" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  تغيير كلمة المرور
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-w-md space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">كلمة المرور الحالية</label>
                    <div className="relative">
                      <Input
                        data-testid="input-current-password"
                        type={showCurrentPw ? "text" : "password"}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="أدخل كلمة المرور الحالية"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute left-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        data-testid="button-toggle-current-pw"
                      >
                        {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">كلمة المرور الجديدة</label>
                    <div className="relative">
                      <Input
                        data-testid="input-new-password"
                        type={showNewPw ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="أدخل كلمة المرور الجديدة"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute left-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowNewPw(!showNewPw)}
                        data-testid="button-toggle-new-pw"
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">6 أحرف على الأقل</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">تأكيد كلمة المرور الجديدة</label>
                    <Input
                      data-testid="input-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="أعد إدخال كلمة المرور الجديدة"
                    />
                  </div>
                  <Button
                    data-testid="button-save-password"
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                    className="w-full"
                  >
                    <Lock className="w-4 h-4 ml-2" />
                    {changingPassword ? "جاري التغيير..." : "حفظ كلمة المرور الجديدة"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <VacationDialog
        open={showVacationDialog}
        onOpenChange={setShowVacationDialog}
        user={user}
      />
      <DelegationDialog
        open={showDelegationDialog}
        onOpenChange={setShowDelegationDialog}
        user={user}
      />
    </div>
  );
}
