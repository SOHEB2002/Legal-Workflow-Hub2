import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, Circle, AlertCircle, Save, FileText } from "lucide-react";
import { useStandards } from "@/lib/standards-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { ReviewResultStatusValue } from "@shared/schema";

interface ReviewChecklistProps {
  standardId: string;
  targetId: string;
  targetType: "case" | "consultation";
  onSave?: (resultId: string) => void;
  onClose?: () => void;
  existingResultId?: string;
}

export function ReviewChecklist({
  standardId,
  targetId,
  targetType,
  onSave,
  onClose,
  existingResultId,
}: ReviewChecklistProps) {
  const { getStandardById, saveReviewResult, updateReviewResult, getReviewResultById } = useStandards();
  const { user } = useAuth();
  const { toast } = useToast();

  const standard = getStandardById(standardId);
  const existingResult = existingResultId ? getReviewResultById(existingResultId) : undefined;

  const [checkedItems, setCheckedItems] = useState<string[]>(existingResult?.checkedItems || []);
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>(existingResult?.categoryNotes || {});
  const [overallNotes, setOverallNotes] = useState(existingResult?.overallNotes || "");

  useEffect(() => {
    if (existingResult) {
      setCheckedItems(existingResult.checkedItems);
      setCategoryNotes(existingResult.categoryNotes);
      setOverallNotes(existingResult.overallNotes);
    }
  }, [existingResult]);

  if (!standard) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          المعيار المحدد غير موجود
        </CardContent>
      </Card>
    );
  }

  const totalCheckpoints = standard.categories.reduce((acc, cat) => acc + cat.checkpoints.length, 0);
  const requiredCheckpoints = standard.categories.reduce(
    (acc, cat) => acc + cat.checkpoints.filter((cp) => cp.isRequired).length,
    0
  );
  const checkedRequired = standard.categories.reduce(
    (acc, cat) => acc + cat.checkpoints.filter((cp) => cp.isRequired && checkedItems.includes(cp.id)).length,
    0
  );
  const progress = totalCheckpoints > 0 ? Math.round((checkedItems.length / totalCheckpoints) * 100) : 0;
  const isComplete = checkedRequired === requiredCheckpoints;

  const handleCheckboxChange = (checkpointId: string, checked: boolean) => {
    if (checked) {
      setCheckedItems((prev) => [...prev, checkpointId]);
    } else {
      setCheckedItems((prev) => prev.filter((id) => id !== checkpointId));
    }
  };

  const handleCategoryNoteChange = (categoryId: string, note: string) => {
    setCategoryNotes((prev) => ({ ...prev, [categoryId]: note }));
  };

  const handleSave = (status: ReviewResultStatusValue) => {
    if (!user) return;

    const resultData = {
      standardId,
      caseId: targetType === "case" ? targetId : null,
      consultationId: targetType === "consultation" ? targetId : null,
      checkedItems,
      categoryNotes,
      overallNotes,
      reviewerId: user.id,
      status,
    };

    if (existingResultId) {
      updateReviewResult(existingResultId, resultData);
      toast({ title: "تم تحديث نتيجة المراجعة" });
      onSave?.(existingResultId);
    } else {
      saveReviewResult(resultData);
      toast({ title: "تم حفظ نتيجة المراجعة" });
      onSave?.(`result-${Date.now()}`);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold">{standard.title}</h3>
          <p className="text-sm text-muted-foreground">{standard.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isComplete ? "default" : "secondary"}>
            {isComplete ? "مكتمل" : "غير مكتمل"}
          </Badge>
          <Badge variant="outline">
            {checkedItems.length} / {totalCheckpoints}
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>نسبة الإنجاز</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground">
          البنود الإلزامية: {checkedRequired} / {requiredCheckpoints}
        </p>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {standard.categories.map((category) => {
          const categoryChecked = category.checkpoints.filter((cp) => checkedItems.includes(cp.id)).length;
          const categoryTotal = category.checkpoints.length;
          const categoryComplete = categoryChecked === categoryTotal;

          return (
            <AccordionItem key={category.id} value={category.id} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  {categoryComplete ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="font-medium">{category.name}</span>
                  <Badge variant="outline" className="mr-auto">
                    {categoryChecked} / {categoryTotal}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 space-y-4">
                <div className="space-y-3">
                  {category.checkpoints.map((checkpoint) => (
                    <div key={checkpoint.id} className="flex items-start gap-3">
                      <Checkbox
                        id={checkpoint.id}
                        checked={checkedItems.includes(checkpoint.id)}
                        onCheckedChange={(checked) => handleCheckboxChange(checkpoint.id, checked as boolean)}
                        data-testid={`checkbox-${checkpoint.id}`}
                      />
                      <div className="flex-1">
                        <label
                          htmlFor={checkpoint.id}
                          className="text-sm cursor-pointer leading-relaxed"
                        >
                          {checkpoint.text}
                        </label>
                        {checkpoint.isRequired && (
                          <Badge variant="destructive" className="mr-2 text-xs">
                            إلزامي
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t">
                  <Label className="text-sm text-muted-foreground">ملاحظات على هذا القسم</Label>
                  <Textarea
                    placeholder="أضف ملاحظاتك هنا..."
                    value={categoryNotes[category.id] || ""}
                    onChange={(e) => handleCategoryNoteChange(category.id, e.target.value)}
                    className="mt-2"
                    data-testid={`notes-${category.id}`}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            ملاحظات عامة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="ملاحظات عامة على المراجعة..."
            value={overallNotes}
            onChange={(e) => setOverallNotes(e.target.value)}
            rows={4}
            data-testid="input-overall-notes"
          />
        </CardContent>
      </Card>

      {!isComplete && (
        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            يجب إكمال جميع البنود الإلزامية قبل اعتماد المراجعة
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        )}
        <Button variant="outline" onClick={() => handleSave("draft")}>
          <Save className="w-4 h-4 ml-2" />
          حفظ كمسودة
        </Button>
        <Button onClick={() => handleSave("submitted")} disabled={!isComplete}>
          <CheckCircle2 className="w-4 h-4 ml-2" />
          إرسال المراجعة
        </Button>
      </div>
    </div>
  );
}
