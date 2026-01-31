import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardCheck,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Search,
  FileText,
  ListChecks,
  FolderOpen,
} from "lucide-react";
import { useStandards } from "@/lib/standards-context";
import { useToast } from "@/hooks/use-toast";
import type { ReviewStandard, ReviewStandardTypeValue, ReviewCategory, ReviewCheckpoint } from "@shared/schema";
import { ReviewStandardTypeLabels } from "@shared/schema";

function getTypeBadgeColor(type: ReviewStandardTypeValue) {
  switch (type) {
    case "contract_review":
      return "bg-blue-500/20 text-blue-600 border-blue-500/30";
    case "legal_consultation":
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case "session_report":
      return "bg-purple-500/20 text-purple-600 border-purple-500/30";
    case "legal_letter":
      return "bg-orange-500/20 text-orange-600 border-orange-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function StandardsPage() {
  const { standards, reviewResults, addStandard, updateStandard, deleteStandard } = useStandards();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedStandard, setSelectedStandard] = useState<ReviewStandard | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [standardToDelete, setStandardToDelete] = useState<ReviewStandard | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    type: "contract_review" as ReviewStandardTypeValue,
    description: "",
    categories: [] as ReviewCategory[],
  });

  const resetForm = () => {
    setFormData({
      title: "",
      type: "contract_review",
      description: "",
      categories: [],
    });
  };

  const handleAddStandard = () => {
    if (!formData.title) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء إدخال عنوان المعيار",
      });
      return;
    }

    addStandard({
      title: formData.title,
      type: formData.type,
      description: formData.description,
      categories: formData.categories,
    });

    toast({ title: "تم إضافة المعيار بنجاح" });
    setShowAddDialog(false);
    resetForm();
  };

  const handleOpenEdit = (standard: ReviewStandard) => {
    setSelectedStandard(standard);
    setFormData({
      title: standard.title,
      type: standard.type,
      description: standard.description,
      categories: [...standard.categories],
    });
    setShowEditDialog(true);
  };

  const handleUpdateStandard = () => {
    if (!selectedStandard || !formData.title) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء إدخال عنوان المعيار",
      });
      return;
    }

    updateStandard(selectedStandard.id, {
      title: formData.title,
      type: formData.type,
      description: formData.description,
      categories: formData.categories,
    });

    toast({ title: "تم تحديث المعيار بنجاح" });
    setShowEditDialog(false);
    setSelectedStandard(null);
    resetForm();
  };

  const handleDeleteStandard = () => {
    if (!standardToDelete) return;

    deleteStandard(standardToDelete.id);
    toast({ title: "تم حذف المعيار بنجاح" });
    setShowDeleteDialog(false);
    setStandardToDelete(null);
  };

  const addCategory = () => {
    const newCategory: ReviewCategory = {
      id: `cat-${Date.now()}`,
      name: "",
      checkpoints: [],
    };
    setFormData((prev) => ({
      ...prev,
      categories: [...prev.categories, newCategory],
    }));
  };

  const updateCategory = (categoryId: string, name: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === categoryId ? { ...cat, name } : cat
      ),
    }));
  };

  const removeCategory = (categoryId: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.filter((cat) => cat.id !== categoryId),
    }));
  };

  const addCheckpoint = (categoryId: string) => {
    const newCheckpoint: ReviewCheckpoint = {
      id: `cp-${Date.now()}`,
      text: "",
      isRequired: false,
    };
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === categoryId
          ? { ...cat, checkpoints: [...cat.checkpoints, newCheckpoint] }
          : cat
      ),
    }));
  };

  const updateCheckpoint = (categoryId: string, checkpointId: string, data: Partial<ReviewCheckpoint>) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              checkpoints: cat.checkpoints.map((cp) =>
                cp.id === checkpointId ? { ...cp, ...data } : cp
              ),
            }
          : cat
      ),
    }));
  };

  const removeCheckpoint = (categoryId: string, checkpointId: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === categoryId
          ? { ...cat, checkpoints: cat.checkpoints.filter((cp) => cp.id !== checkpointId) }
          : cat
      ),
    }));
  };

  const filteredStandards = standards.filter((s) => {
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const getUsageCount = (standardId: string) => {
    return reviewResults.filter((r) => r.standardId === standardId).length;
  };

  const totalCheckpoints = (standard: ReviewStandard) => {
    return standard.categories.reduce((acc, cat) => acc + cat.checkpoints.length, 0);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" />
            معايير المراجعة
          </h1>
          <p className="text-muted-foreground">إدارة معايير وقوائم فحص المراجعة القانونية</p>
        </div>
        <Button data-testid="button-add-standard" onClick={() => { resetForm(); setShowAddDialog(true); }}>
          <Plus className="w-4 h-4 ml-2" />
          إضافة معيار جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المعايير</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{standards.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي البنود</CardTitle>
            <ListChecks className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {standards.reduce((acc, s) => acc + totalCheckpoints(s), 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المراجعات المكتملة</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reviewResults.filter((r) => r.status === "submitted" || r.status === "approved").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الفئات</CardTitle>
            <FolderOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {standards.reduce((acc, s) => acc + s.categories.length, 0)}
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
                data-testid="input-search-standards"
                placeholder="بحث في المعايير..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-type-filter">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                {Object.entries(ReviewStandardTypeLabels).map(([value, label]) => (
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
                <TableHead className="text-right">المعيار</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-center">الفئات</TableHead>
                <TableHead className="text-center">البنود</TableHead>
                <TableHead className="text-center">الاستخدام</TableHead>
                <TableHead className="text-center w-32">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStandards.map((standard) => (
                <TableRow key={standard.id} data-testid={`row-standard-${standard.id}`}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{standard.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{standard.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getTypeBadgeColor(standard.type)}>
                      {ReviewStandardTypeLabels[standard.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{standard.categories.length}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{totalCheckpoints(standard)}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{getUsageCount(standard.id)} مرة</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-view-${standard.id}`}
                        onClick={() => {
                          setSelectedStandard(standard);
                          setShowViewDialog(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-edit-${standard.id}`}
                        onClick={() => handleOpenEdit(standard)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-delete-${standard.id}`}
                        onClick={() => {
                          setStandardToDelete(standard);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredStandards.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    لا توجد معايير مطابقة للبحث
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة معيار جديد</DialogTitle>
            <DialogDescription>أنشئ معيار مراجعة جديد مع الفئات ونقاط الفحص</DialogDescription>
          </DialogHeader>
          <StandardForm
            formData={formData}
            setFormData={setFormData}
            addCategory={addCategory}
            updateCategory={updateCategory}
            removeCategory={removeCategory}
            addCheckpoint={addCheckpoint}
            updateCheckpoint={updateCheckpoint}
            removeCheckpoint={removeCheckpoint}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button onClick={handleAddStandard} disabled={!formData.title}>
              إضافة المعيار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل المعيار</DialogTitle>
            <DialogDescription>تعديل معيار: {selectedStandard?.title}</DialogDescription>
          </DialogHeader>
          <StandardForm
            formData={formData}
            setFormData={setFormData}
            addCategory={addCategory}
            updateCategory={updateCategory}
            removeCategory={removeCategory}
            addCheckpoint={addCheckpoint}
            updateCheckpoint={updateCheckpoint}
            removeCheckpoint={removeCheckpoint}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button onClick={handleUpdateStandard} disabled={!formData.title}>
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedStandard?.title}</DialogTitle>
            <DialogDescription>{selectedStandard?.description}</DialogDescription>
          </DialogHeader>
          {selectedStandard && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={getTypeBadgeColor(selectedStandard.type)}>
                  {ReviewStandardTypeLabels[selectedStandard.type]}
                </Badge>
                <Badge variant="outline">{selectedStandard.categories.length} فئة</Badge>
                <Badge variant="secondary">{totalCheckpoints(selectedStandard)} بند</Badge>
              </div>

              <Accordion type="multiple" className="space-y-2">
                {selectedStandard.categories.map((category) => (
                  <AccordionItem key={category.id} value={category.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{category.name}</span>
                        <Badge variant="outline">{category.checkpoints.length} بند</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <ul className="space-y-2">
                        {category.checkpoints.map((checkpoint) => (
                          <li key={checkpoint.id} className="flex items-center gap-2 text-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            <span>{checkpoint.text}</span>
                            {checkpoint.isRequired && (
                              <Badge variant="destructive" className="text-xs">إلزامي</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowViewDialog(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذا المعيار؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المعيار "{standardToDelete?.title}" بشكل نهائي. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStandard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface StandardFormProps {
  formData: {
    title: string;
    type: ReviewStandardTypeValue;
    description: string;
    categories: ReviewCategory[];
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    title: string;
    type: ReviewStandardTypeValue;
    description: string;
    categories: ReviewCategory[];
  }>>;
  addCategory: () => void;
  updateCategory: (categoryId: string, name: string) => void;
  removeCategory: (categoryId: string) => void;
  addCheckpoint: (categoryId: string) => void;
  updateCheckpoint: (categoryId: string, checkpointId: string, data: Partial<ReviewCheckpoint>) => void;
  removeCheckpoint: (categoryId: string, checkpointId: string) => void;
}

function StandardForm({
  formData,
  setFormData,
  addCategory,
  updateCategory,
  removeCategory,
  addCheckpoint,
  updateCheckpoint,
  removeCheckpoint,
}: StandardFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>عنوان المعيار *</Label>
          <Input
            data-testid="input-standard-title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="عنوان المعيار"
          />
        </div>
        <div>
          <Label>النوع</Label>
          <Select
            value={formData.type}
            onValueChange={(value: ReviewStandardTypeValue) => setFormData({ ...formData, type: value })}
          >
            <SelectTrigger data-testid="select-standard-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ReviewStandardTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>الوصف</Label>
        <Textarea
          data-testid="input-standard-description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="وصف المعيار"
          rows={2}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>الفئات ونقاط الفحص</Label>
          <Button variant="outline" size="sm" onClick={addCategory}>
            <Plus className="w-4 h-4 ml-1" />
            إضافة فئة
          </Button>
        </div>

        {formData.categories.map((category, catIndex) => (
          <Card key={category.id} className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder={`فئة ${catIndex + 1}`}
                  value={category.name}
                  onChange={(e) => updateCategory(category.id, e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCategory(category.id)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>

              <div className="mr-4 space-y-2">
                {category.checkpoints.map((checkpoint) => (
                  <div key={checkpoint.id} className="flex items-center gap-2">
                    <Input
                      placeholder="نص البند"
                      value={checkpoint.text}
                      onChange={(e) => updateCheckpoint(category.id, checkpoint.id, { text: e.target.value })}
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <Checkbox
                        checked={checkpoint.isRequired}
                        onCheckedChange={(checked) =>
                          updateCheckpoint(category.id, checkpoint.id, { isRequired: checked as boolean })
                        }
                      />
                      <Label className="text-xs text-muted-foreground">إلزامي</Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCheckpoint(category.id, checkpoint.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addCheckpoint(category.id)}
                  className="text-muted-foreground"
                >
                  <Plus className="w-3 h-3 ml-1" />
                  إضافة بند
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {formData.categories.length === 0 && (
          <p className="text-center text-muted-foreground py-4 border rounded-lg">
            لم يتم إضافة فئات بعد. اضغط على "إضافة فئة" للبدء.
          </p>
        )}
      </div>
    </div>
  );
}
