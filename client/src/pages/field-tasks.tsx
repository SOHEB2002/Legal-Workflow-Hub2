import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Play,
  Eye,
  ClipboardList,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { useFieldTasks } from "@/lib/field-tasks-context";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  FieldTaskStatus,
  FieldTaskStatusLabels,
  FieldTaskType,
  FieldTaskTypeLabels,
  Priority,
  canAssignFieldTasks,
  type FieldTask,
  type FieldTaskStatusValue,
  type FieldTaskTypeValue,
} from "@shared/schema";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import { formatDateShortArabic, formatDateTimeArabic } from "@/lib/date-utils";

export default function FieldTasksPage() {
  const { user, permissions, users } = useAuth();
  const { fieldTasks, addFieldTask, startTask, completeTask, cancelTask } = useFieldTasks();
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const activeUsers = users.filter(u => u.isActive);
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<FieldTask | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    taskType: "مراجعة_ميدانية" as FieldTaskTypeValue,
    caseId: "",
    consultationId: "",
    assignedTo: "",
    priority: "متوسط" as "عاجل" | "عالي" | "متوسط" | "منخفض",
    dueDate: "",
  });

  const [completionData, setCompletionData] = useState({
    notes: "",
    proofDescription: "",
    proofFileLink: "",
  });

  const canManageFieldTasks = user && canAssignFieldTasks(user.role);

  const filteredTasks = fieldTasks.filter((task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const canView =
      canManageFieldTasks || task.assignedTo === user?.id || task.assignedBy === user?.id;
    return matchesSearch && matchesStatus && canView;
  });

  const handleAddTask = () => {
    if (!newTask.title || !newTask.assignedTo || !newTask.dueDate) {
      toast({
        title: "خطأ",
        description: "يرجى تعبئة الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    addFieldTask({
      ...newTask,
      caseId: newTask.caseId || null,
      consultationId: newTask.consultationId || null,
      assignedBy: user?.id || "",
    });

    toast({ title: "تمت إضافة المهمة بنجاح" });
    setShowAddDialog(false);
    setNewTask({
      title: "",
      description: "",
      taskType: "مراجعة_ميدانية",
      caseId: "",
      consultationId: "",
      assignedTo: "",
      priority: "متوسط",
      dueDate: "",
    });
  };

  const handleStartTask = (task: FieldTask) => {
    startTask(task.id);
    toast({ title: "تم بدء تنفيذ المهمة" });
  };

  const handleCompleteTask = () => {
    if (!selectedTask) return;
    completeTask(
      selectedTask.id,
      completionData.notes,
      completionData.proofDescription,
      completionData.proofFileLink
    );
    toast({ title: "تم تأكيد إنجاز المهمة" });
    setShowCompleteDialog(false);
    setSelectedTask(null);
    setCompletionData({ notes: "", proofDescription: "", proofFileLink: "" });
  };

  const handleCancelTask = (task: FieldTask) => {
    cancelTask(task.id);
    toast({ title: "تم إلغاء المهمة" });
  };

  const openCompleteDialog = (task: FieldTask) => {
    setSelectedTask(task);
    setShowCompleteDialog(true);
  };

  const openDetailsDialog = (task: FieldTask) => {
    setSelectedTask(task);
    setShowDetailsDialog(true);
  };

  const getStatusColor = (status: FieldTaskStatusValue) => {
    switch (status) {
      case FieldTaskStatus.PENDING:
        return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
      case FieldTaskStatus.IN_PROGRESS:
        return "bg-blue-500/20 text-blue-700 dark:text-blue-400";
      case FieldTaskStatus.COMPLETED:
        return "bg-green-500/20 text-green-700 dark:text-green-400";
      case FieldTaskStatus.CANCELLED:
        return "bg-gray-500/20 text-gray-700 dark:text-gray-400";
      default:
        return "";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case Priority.URGENT:
        return "bg-red-500/20 text-red-700 dark:text-red-400";
      case Priority.HIGH:
        return "bg-orange-500/20 text-orange-700 dark:text-orange-400";
      case Priority.MEDIUM:
        return "bg-blue-500/20 text-blue-700 dark:text-blue-400";
      case Priority.LOW:
        return "bg-gray-500/20 text-gray-700 dark:text-gray-400";
      default:
        return "";
    }
  };

  const getUserName = (userId: string) => {
    const foundUser = activeUsers.find((u) => u.id === userId);
    return foundUser?.name || "غير معروف";
  };

  const getCaseName = (caseId: string | null) => {
    if (!caseId) return "-";
    const foundCase = cases.find((c) => c.id === caseId);
    return foundCase ? `قضية ${foundCase.caseNumber}` : "-";
  };

  const getConsultationName = (consultationId: string | null) => {
    if (!consultationId) return "-";
    const foundConsultation = consultations.find((c) => c.id === consultationId);
    return foundConsultation ? `استشارة ${foundConsultation.consultationNumber}` : "-";
  };

  const isOverdue = (task: FieldTask) => {
    if (
      task.status === FieldTaskStatus.COMPLETED ||
      task.status === FieldTaskStatus.CANCELLED
    )
      return false;
    const today = new Date().toISOString().split("T")[0];
    return task.dueDate < today;
  };

  const canStartOrComplete = (task: FieldTask) => {
    return task.assignedTo === user?.id;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المهام الميدانية والمراجعات</h1>
          <p className="text-muted-foreground">إدارة المهام الميدانية والمراجعات الخارجية</p>
        </div>
        {canManageFieldTasks && (
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-task">
                <Plus className="w-4 h-4 ml-2" />
                إضافة مهمة
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>إضافة مهمة جديدة</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>عنوان المهمة *</Label>
                  <Input
                    data-testid="input-task-title"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="أدخل عنوان المهمة"
                  />
                </div>
                <div>
                  <Label>الوصف</Label>
                  <Textarea
                    data-testid="input-task-description"
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder="وصف تفصيلي للمهمة"
                    rows={3}
                  />
                </div>
                <div>
                  <Label>نوع المهمة</Label>
                  <Select
                    value={newTask.taskType}
                    onValueChange={(value: FieldTaskTypeValue) =>
                      setNewTask({ ...newTask, taskType: value })
                    }
                  >
                    <SelectTrigger data-testid="select-task-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FieldTaskTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الموظف المكلف *</Label>
                  <Select
                    value={newTask.assignedTo}
                    onValueChange={(value) => setNewTask({ ...newTask, assignedTo: value })}
                  >
                    <SelectTrigger data-testid="select-assigned-to">
                      <SelectValue placeholder="اختر الموظف" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeUsers.map((u: { id: string; name: string }) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الأولوية</Label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(value: "عاجل" | "عالي" | "متوسط" | "منخفض") =>
                      setNewTask({ ...newTask, priority: value })
                    }
                  >
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="عاجل">عاجل</SelectItem>
                      <SelectItem value="عالي">عالي</SelectItem>
                      <SelectItem value="متوسط">متوسط</SelectItem>
                      <SelectItem value="منخفض">منخفض</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>تاريخ الاستحقاق *</Label>
                  <Input
                    dir="ltr"
                    type="date"
                    data-testid="input-due-date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>ربط بقضية (اختياري)</Label>
                  <Select
                    value={newTask.caseId || "_none"}
                    onValueChange={(value) =>
                      setNewTask({ ...newTask, caseId: value === "_none" ? "" : value, consultationId: "" })
                    }
                  >
                    <SelectTrigger data-testid="select-case">
                      <SelectValue placeholder="اختر قضية" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">بدون قضية</SelectItem>
                      {cases.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          قضية <LtrInline>{c.caseNumber}</LtrInline>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ربط باستشارة (اختياري)</Label>
                  <Select
                    value={newTask.consultationId || "_none"}
                    onValueChange={(value) =>
                      setNewTask({ ...newTask, consultationId: value === "_none" ? "" : value, caseId: "" })
                    }
                  >
                    <SelectTrigger data-testid="select-consultation">
                      <SelectValue placeholder="اختر استشارة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">بدون استشارة</SelectItem>
                      {consultations.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          استشارة <LtrInline>{c.consultationNumber}</LtrInline>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  data-testid="button-submit-task"
                  onClick={handleAddTask}
                >
                  إضافة المهمة
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search-tasks"
                placeholder="بحث في المهام..."
                className="pr-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-status-filter">
                <SelectValue placeholder="فلترة بالحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                {Object.entries(FieldTaskStatusLabels).map(([value, label]) => (
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
                <TableHead>العنوان</TableHead>
                <TableHead>نوع المهمة</TableHead>
                <TableHead>المكلف</TableHead>
                <TableHead>تاريخ الاستحقاق</TableHead>
                <TableHead>الأولوية</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>مرتبطة بـ</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    لا توجد مهام
                  </TableCell>
                </TableRow>
              ) : (
                filteredTasks.map((task) => (
                  <TableRow key={task.id} className={isOverdue(task) ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isOverdue(task) && (
                          <Tooltip>
                            <TooltipTrigger>
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                            </TooltipTrigger>
                            <TooltipContent>مهمة متأخرة</TooltipContent>
                          </Tooltip>
                        )}
                        <span className="font-medium">{task.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {FieldTaskTypeLabels[task.taskType as FieldTaskTypeValue] || task.taskType}
                      </Badge>
                    </TableCell>
                    <TableCell><BidiText>{getUserName(task.assignedTo)}</BidiText></TableCell>
                    <TableCell>
                      <LtrInline>{formatDateShortArabic(task.dueDate)}</LtrInline>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(task.status)}>
                        {FieldTaskStatusLabels[task.status as FieldTaskStatusValue] || task.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {task.caseId
                        ? getCaseName(task.caseId)
                        : task.consultationId
                        ? getConsultationName(task.consultationId)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-view-${task.id}`}
                              onClick={() => openDetailsDialog(task)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>عرض التفاصيل</TooltipContent>
                        </Tooltip>

                        {canStartOrComplete(task) && task.status === FieldTaskStatus.PENDING && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-start-${task.id}`}
                                onClick={() => handleStartTask(task)}
                              >
                                <Play className="w-4 h-4 text-blue-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>بدء التنفيذ</TooltipContent>
                          </Tooltip>
                        )}

                        {canStartOrComplete(task) && task.status === FieldTaskStatus.IN_PROGRESS && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-complete-${task.id}`}
                                onClick={() => openCompleteDialog(task)}
                              >
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>تأكيد الإنجاز</TooltipContent>
                          </Tooltip>
                        )}

                        {canManageFieldTasks &&
                          task.status !== FieldTaskStatus.COMPLETED &&
                          task.status !== FieldTaskStatus.CANCELLED && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  data-testid={`button-cancel-${task.id}`}
                                  onClick={() => handleCancelTask(task)}
                                >
                                  <XCircle className="w-4 h-4 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>إلغاء المهمة</TooltipContent>
                            </Tooltip>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تأكيد إنجاز المهمة</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedTask.title}</p>
                <p className="text-sm text-muted-foreground">{selectedTask.description}</p>
              </div>
              <div>
                <Label>ملاحظات الإنجاز</Label>
                <Textarea
                  data-testid="input-completion-notes"
                  value={completionData.notes}
                  onChange={(e) =>
                    setCompletionData({ ...completionData, notes: e.target.value })
                  }
                  placeholder="أضف ملاحظات حول إنجاز المهمة"
                  rows={3}
                />
              </div>
              <div>
                <Label>وصف الإثبات</Label>
                <Textarea
                  data-testid="input-proof-description"
                  value={completionData.proofDescription}
                  onChange={(e) =>
                    setCompletionData({ ...completionData, proofDescription: e.target.value })
                  }
                  placeholder="صف المستندات أو الإثباتات المرفقة"
                  rows={2}
                />
              </div>
              <div>
                <Label>رابط الملف (Google Drive أو غيره)</Label>
                <Input
                  data-testid="input-proof-link"
                  value={completionData.proofFileLink}
                  onChange={(e) =>
                    setCompletionData({ ...completionData, proofFileLink: e.target.value })
                  }
                  placeholder="https://drive.google.com/..."
                />
              </div>
              <Button
                className="w-full"
                data-testid="button-confirm-complete"
                onClick={handleCompleteTask}
              >
                <Upload className="w-4 h-4 ml-2" />
                تأكيد الإنجاز
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل المهمة</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">العنوان</Label>
                  <p className="font-medium">{selectedTask.title}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">الحالة</Label>
                  <Badge className={getStatusColor(selectedTask.status)}>
                    {FieldTaskStatusLabels[selectedTask.status as FieldTaskStatusValue]}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">نوع المهمة</Label>
                  <p>{FieldTaskTypeLabels[selectedTask.taskType as FieldTaskTypeValue]}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">الأولوية</Label>
                  <Badge className={getPriorityColor(selectedTask.priority)}>
                    {selectedTask.priority}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">المكلف</Label>
                  <p><BidiText>{getUserName(selectedTask.assignedTo)}</BidiText></p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">المُسند</Label>
                  <p><BidiText>{getUserName(selectedTask.assignedBy)}</BidiText></p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">تاريخ الاستحقاق</Label>
                  <p>
                    <LtrInline>{formatDateShortArabic(selectedTask.dueDate)}</LtrInline>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">تاريخ الإنشاء</Label>
                  <p>
                    <LtrInline>{formatDateShortArabic(selectedTask.createdAt)}</LtrInline>
                  </p>
                </div>
              </div>
              {selectedTask.description && (
                <div>
                  <Label className="text-muted-foreground text-sm">الوصف</Label>
                  <p className="bg-muted p-3 rounded-md">{selectedTask.description}</p>
                </div>
              )}
              {selectedTask.caseId && (
                <div>
                  <Label className="text-muted-foreground text-sm">مرتبطة بقضية</Label>
                  <p>{getCaseName(selectedTask.caseId)}</p>
                </div>
              )}
              {selectedTask.consultationId && (
                <div>
                  <Label className="text-muted-foreground text-sm">مرتبطة باستشارة</Label>
                  <p>{getConsultationName(selectedTask.consultationId)}</p>
                </div>
              )}
              {selectedTask.status === FieldTaskStatus.COMPLETED && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-sm">تاريخ الإنجاز</Label>
                    <p>
                      <LtrInline>{formatDateTimeArabic(selectedTask.completedAt)}</LtrInline>
                    </p>
                  </div>
                  {selectedTask.completionNotes && (
                    <div>
                      <Label className="text-muted-foreground text-sm">ملاحظات الإنجاز</Label>
                      <p className="bg-muted p-3 rounded-md">{selectedTask.completionNotes}</p>
                    </div>
                  )}
                  {selectedTask.proofDescription && (
                    <div>
                      <Label className="text-muted-foreground text-sm">وصف الإثبات</Label>
                      <p className="bg-muted p-3 rounded-md">{selectedTask.proofDescription}</p>
                    </div>
                  )}
                  {selectedTask.proofFileLink && (
                    <div>
                      <Label className="text-muted-foreground text-sm">رابط الإثبات</Label>
                      <a
                        href={selectedTask.proofFileLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline block"
                      >
                        <LtrInline>{selectedTask.proofFileLink}</LtrInline>
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
