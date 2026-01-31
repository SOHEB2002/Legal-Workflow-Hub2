import { useState } from "react";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useNotifications } from "@/lib/notifications-context";
import { useToast } from "@/hooks/use-toast";
import {
  NotificationType,
  NotificationTypeLabels,
  NotificationPriority,
  NotificationPriorityLabels,
} from "@shared/schema";
import type { NotificationTemplate, NotificationTypeValue, NotificationPriorityValue } from "@shared/schema";
import { cn } from "@/lib/utils";

function getPriorityColor(priority: string): string {
  switch (priority) {
    case NotificationPriority.URGENT:
      return "bg-destructive text-destructive-foreground";
    case NotificationPriority.HIGH:
      return "bg-orange-500 text-white";
    case NotificationPriority.MEDIUM:
      return "bg-yellow-500 text-white";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function NotificationTemplates() {
  const { getTemplates, addTemplate, updateTemplate, deleteTemplate } = useNotifications();
  const { toast } = useToast();

  const templates = getTemplates();

  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    title: "",
    message: "",
    type: NotificationType.GENERAL_ALERT as NotificationTypeValue,
    priority: NotificationPriority.MEDIUM as NotificationPriorityValue,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      title: "",
      message: "",
      type: NotificationType.GENERAL_ALERT,
      priority: NotificationPriority.MEDIUM,
    });
    setEditingTemplate(null);
  };

  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      title: template.title,
      message: template.message,
      type: template.type,
      priority: template.priority,
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.title || !formData.message) {
      toast({ title: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }

    if (editingTemplate) {
      updateTemplate(editingTemplate.id, formData);
      toast({ title: "تم تحديث القالب بنجاح" });
    } else {
      addTemplate(formData);
      toast({ title: "تم إضافة القالب بنجاح" });
    }

    resetForm();
    setShowDialog(false);
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    toast({ title: "تم حذف القالب" });
  };

  const variables = [
    { name: "{caseName}", desc: "اسم القضية" },
    { name: "{consultationNumber}", desc: "رقم الاستشارة" },
    { name: "{deadline}", desc: "الموعد النهائي" },
    { name: "{employeeName}", desc: "اسم الموظف" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                قوالب الإشعارات
              </CardTitle>
              <CardDescription>إدارة القوالب الجاهزة للإشعارات</CardDescription>
            </div>
            <Button onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-template">
              <Plus className="w-4 h-4 ml-2" />
              إضافة قالب
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">المتغيرات المتاحة:</p>
            <div className="flex flex-wrap gap-2">
              {variables.map(v => (
                <Badge key={v.name} variant="outline" className="font-mono text-xs">
                  {v.name} - {v.desc}
                </Badge>
              ))}
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>لا توجد قوالب. أضف قالباً جديداً للبدء.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>العنوان</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} data-testid={`template-row-${template.id}`}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>{template.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {NotificationTypeLabels[template.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", getPriorityColor(template.priority))}>
                        {NotificationPriorityLabels[template.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(template)}
                          data-testid={`button-edit-template-${template.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(template.id)}
                          data-testid={`button-delete-template-${template.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={(o) => { if (!o) resetForm(); setShowDialog(o); }}>
        <DialogContent data-testid="template-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "تعديل القالب" : "إضافة قالب جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم القالب</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: تنبيه تأخر"
                data-testid="input-template-name"
              />
            </div>
            <div>
              <Label>عنوان الإشعار</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="مثال: تنبيه تأخر في الإنجاز"
                data-testid="input-template-title"
              />
            </div>
            <div>
              <Label>نص الرسالة</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="يرجى الإسراع في إنجاز {caseName}"
                rows={3}
                data-testid="input-template-message"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>نوع الإشعار</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, type: v as NotificationTypeValue }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NotificationTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الأولوية</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, priority: v as NotificationPriorityValue }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(NotificationPriorityLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { resetForm(); setShowDialog(false); }}>
              إلغاء
            </Button>
            <Button onClick={handleSave} data-testid="button-save-template">
              {editingTemplate ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
