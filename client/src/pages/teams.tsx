import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, Plus, MoreHorizontal, Pencil, Trash2, UserPlus, UserMinus, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/departments-context";
import { useUsers } from "@/lib/users-context";
import { useToast } from "@/hooks/use-toast";

export default function TeamsPage() {
  const { users, permissions } = useAuth();
  const { departments, getDepartmentName } = useDepartments();
  const { teams, createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember, changeTeamLead, getTeamWorkload } = useUsers();
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<typeof teams[0] | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    departmentId: "",
    leaderId: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      departmentId: "",
      leaderId: "",
    });
  };

  const handleAddTeam = () => {
    if (!formData.name || !formData.departmentId || !formData.leaderId) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء ملء الحقول المطلوبة",
      });
      return;
    }

    createTeam({
      name: formData.name,
      description: formData.description,
      departmentId: formData.departmentId,
      leaderId: formData.leaderId,
      memberIds: [formData.leaderId],
    });

    toast({ title: "تم إنشاء الفريق بنجاح" });
    setShowAddDialog(false);
    resetForm();
  };

  const handleUpdateTeam = () => {
    if (!selectedTeam) return;

    updateTeam(selectedTeam.id, {
      name: formData.name,
      description: formData.description,
      departmentId: formData.departmentId,
    });

    toast({ title: "تم تحديث الفريق بنجاح" });
    setShowEditDialog(false);
    setSelectedTeam(null);
    resetForm();
  };

  const handleDeleteTeam = () => {
    if (!selectedTeam) return;

    deleteTeam(selectedTeam.id);
    toast({ title: "تم حذف الفريق بنجاح" });
    setShowDeleteDialog(false);
    setSelectedTeam(null);
  };

  const handleOpenEdit = (team: typeof teams[0]) => {
    setSelectedTeam(team);
    setFormData({
      name: team.name,
      description: team.description,
      departmentId: team.departmentId,
      leaderId: team.leaderId,
    });
    setShowEditDialog(true);
  };

  const handleOpenMembers = (team: typeof teams[0]) => {
    setSelectedTeam(team);
    setShowMembersDialog(true);
  };

  const handleAddMember = (userId: string) => {
    if (!selectedTeam) return;
    addTeamMember(selectedTeam.id, userId);
    toast({ title: "تمت إضافة العضو بنجاح" });
  };

  const handleRemoveMember = (userId: string) => {
    if (!selectedTeam) return;
    if (userId === selectedTeam.leaderId) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "لا يمكن إزالة قائد الفريق",
      });
      return;
    }
    removeTeamMember(selectedTeam.id, userId);
    toast({ title: "تمت إزالة العضو بنجاح" });
  };

  const handleChangeLead = (userId: string) => {
    if (!selectedTeam) return;
    changeTeamLead(selectedTeam.id, userId);
    toast({ title: "تم تغيير قائد الفريق بنجاح" });
  };

  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.name || "-";
  };

  const availableUsersForTeam = users.filter(u => 
    u.isActive && 
    (!selectedTeam || !selectedTeam.memberIds.includes(u.id))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة الفرق</h1>
          <p className="text-muted-foreground">إنشاء وإدارة فرق العمل</p>
        </div>
        <Button data-testid="button-add-team" onClick={() => { resetForm(); setShowAddDialog(true); }}>
          <Plus className="w-4 h-4 ml-2" />
          إنشاء فريق جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الفرق</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teams.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الأعضاء</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teams.reduce((sum, t) => sum + t.memberIds.length, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط حجم الفريق</CardTitle>
            <Users className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teams.length > 0 ? Math.round(teams.reduce((sum, t) => sum + t.memberIds.length, 0) / teams.length) : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الفريق</TableHead>
                <TableHead className="text-right">القسم</TableHead>
                <TableHead className="text-right">القائد</TableHead>
                <TableHead className="text-right">الأعضاء</TableHead>
                <TableHead className="text-right">حمل العمل</TableHead>
                <TableHead className="text-center w-16">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => {
                const workload = getTeamWorkload(team.id);
                return (
                  <TableRow key={team.id} data-testid={`row-team-${team.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{team.name}</p>
                          <p className="text-sm text-muted-foreground">{team.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getDepartmentName(team.departmentId)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-accent" />
                        {getUserName(team.leaderId)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{team.memberIds.length} أعضاء</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span>{workload.totalCases} قضية</span>
                        <span className="mx-1">|</span>
                        <span>{workload.totalConsultations} استشارة</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${team.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenMembers(team)}>
                            <Users className="w-4 h-4 ml-2" />
                            إدارة الأعضاء
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenEdit(team)}>
                            <Pencil className="w-4 h-4 ml-2" />
                            تعديل
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setSelectedTeam(team);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 ml-2" />
                            حذف
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    لا توجد فرق
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إنشاء فريق جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الفريق *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم الفريق"
                data-testid="input-team-name"
              />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف الفريق..."
                data-testid="input-team-description"
              />
            </div>
            <div>
              <Label>القسم *</Label>
              <Select value={formData.departmentId} onValueChange={(v) => setFormData({ ...formData, departmentId: v })}>
                <SelectTrigger data-testid="select-team-department">
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>قائد الفريق *</Label>
              <Select value={formData.leaderId} onValueChange={(v) => setFormData({ ...formData, leaderId: v })}>
                <SelectTrigger data-testid="select-team-leader">
                  <SelectValue placeholder="اختر القائد" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.isActive).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddTeam} data-testid="button-submit-team">
              إنشاء الفريق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل الفريق</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الفريق *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم الفريق"
              />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف الفريق..."
              />
            </div>
            <div>
              <Label>القسم *</Label>
              <Select value={formData.departmentId} onValueChange={(v) => setFormData({ ...formData, departmentId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleUpdateTeam}>
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>أعضاء الفريق - {selectedTeam?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>إضافة عضو</Label>
              <Select onValueChange={handleAddMember}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مستخدم للإضافة" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsersForTeam.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>الأعضاء الحاليون</Label>
              {selectedTeam?.memberIds.map((memberId) => {
                const member = users.find(u => u.id === memberId);
                const isLeader = memberId === selectedTeam.leaderId;
                return (
                  <div key={memberId} className="flex items-center justify-between p-3 border rounded-md">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">
                          {member?.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member?.name}</p>
                        {isLeader && (
                          <Badge variant="outline" className="text-xs">
                            <Crown className="w-3 h-3 ml-1" />
                            قائد الفريق
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isLeader && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleChangeLead(memberId)}
                            title="تعيين كقائد"
                          >
                            <Crown className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveMember(memberId)}
                            title="إزالة من الفريق"
                          >
                            <UserMinus className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMembersDialog(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الفريق</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الفريق "{selectedTeam?.name}"؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTeam} className="bg-destructive text-destructive-foreground">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
