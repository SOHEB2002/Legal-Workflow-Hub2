import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaseStagesOrder, CaseStageLabels, type CaseStageValue, type CaseClassificationValue, canMoveToPreviousStage, type UserRoleType, getStagesForClassification, getStageLabel } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface CaseProgressBarProps {
  currentStage: CaseStageValue;
  onMoveToNext: (notes: string) => void;
  onMoveToPrevious: (notes: string) => void;
  userRole: UserRoleType;
  disabled?: boolean;
  caseClassification?: CaseClassificationValue;
}

export function CaseProgressBar({
  currentStage,
  onMoveToNext,
  onMoveToPrevious,
  userRole,
  disabled = false,
  caseClassification,
}: CaseProgressBarProps) {
  const [notes, setNotes] = useState("");
  const legacyStageMap: Record<string, CaseStageValue> = {
    "رفع_للدائرة": "تم_الرفع_للدائرة" as CaseStageValue,
  };
  const normalizedStage = legacyStageMap[currentStage] || currentStage;
  const effectiveClassification = caseClassification || "مدعي_قضية_جديدة";
  const stagesOrder = getStagesForClassification(effectiveClassification as CaseClassificationValue);
  const rawIndex = stagesOrder.indexOf(normalizedStage);
  const currentIndex = rawIndex >= 0 ? rawIndex : 0;
  const canGoNext = currentIndex < stagesOrder.length - 1 && !disabled;
  const canGoPrev = currentIndex > 0 && canMoveToPreviousStage(userRole) && !disabled;

  const getStageStatus = (stageIndex: number) => {
    if (stageIndex < currentIndex) return "completed";
    if (stageIndex === currentIndex) return "current";
    return "upcoming";
  };

  const handleMoveNext = () => {
    onMoveToNext(notes);
    setNotes("");
  };

  const handleMovePrev = () => {
    onMoveToPrevious(notes);
    setNotes("");
  };

  return (
    <div className="w-full space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
        {stagesOrder.map((stage, index) => {
          const status = getStageStatus(index);
          return (
            <div key={stage} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    status === "completed"
                      ? "bg-green-500 text-white"
                      : status === "current"
                      ? "bg-accent text-accent-foreground ring-4 ring-accent/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`stage-indicator-${index}`}
                >
                  {status === "completed" ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`mt-2 text-xs text-center whitespace-nowrap ${
                    status === "current"
                      ? "font-bold text-accent"
                      : status === "completed"
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {getStageLabel(stage, effectiveClassification as CaseClassificationValue)}
                </span>
              </div>
              {index < stagesOrder.length - 1 && (
                <div
                  className={`h-1 flex-1 mx-1 rounded ${
                    index < currentIndex
                      ? "bg-green-500"
                      : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4">
        {canGoPrev && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-previous-stage"
              >
                <ChevronRight className="w-4 h-4 ml-1" />
                المرحلة السابقة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>إرجاع للمرحلة السابقة</AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من إرجاع القضية للمرحلة السابقة؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="سبب الإرجاع (اختياري)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                data-testid="input-stage-notes"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setNotes("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleMovePrev}>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canGoNext && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                data-testid="button-next-stage"
              >
                المرحلة التالية
                <ChevronLeft className="w-4 h-4 mr-1" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>نقل للمرحلة التالية</AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من نقل القضية للمرحلة التالية:{" "}
                  <strong>{getStageLabel(stagesOrder[currentIndex + 1], effectiveClassification as CaseClassificationValue)}</strong>؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                data-testid="input-stage-notes-next"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setNotes("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleMoveNext}>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
