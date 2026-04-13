import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaseStageLabels, type CaseStageValue, type CaseClassificationValue, type CaseTypeValue, canMoveToPreviousStage, type UserRoleType, getStagesForClassification, getStageLabel } from "@shared/schema";
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
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface CaseProgressBarProps {
  currentStage: CaseStageValue;
  onMoveToNext: (notes: string) => void;
  onMoveToPrevious: (notes: string) => void;
  onSkipDataCompletion?: (notes: string) => void;
  userRole: UserRoleType;
  disabled?: boolean;
  caseClassification?: CaseClassificationValue;
  caseType?: CaseTypeValue;
  reviewNotes?: string;
  reviewDecision?: string;
}

export function CaseProgressBar({
  currentStage,
  onMoveToNext,
  onMoveToPrevious,
  onSkipDataCompletion,
  userRole,
  disabled = false,
  caseClassification,
  caseType,
  reviewNotes,
  reviewDecision,
}: CaseProgressBarProps) {
  const [notes, setNotes] = useState("");
  const [skipNotes, setSkipNotes] = useState("");
  const normalizedStage = currentStage;
  const effectiveClassification = caseClassification || "قضية_جديدة";
  const stagesOrder = getStagesForClassification(effectiveClassification as CaseClassificationValue, caseType);
  const rawIndex = stagesOrder.indexOf(normalizedStage);
  const currentIndex = rawIndex >= 0 ? rawIndex : 0;
  const canGoNext = currentIndex < stagesOrder.length - 1 && !disabled;
  const canGoPrev = currentIndex > 0 && canMoveToPreviousStage(userRole) && !disabled;

  const isAtReception = normalizedStage === "استلام";
  const nextStageIsDataCompletion = stagesOrder[currentIndex + 1] === "استكمال_البيانات";
  const canSkip = isAtReception && nextStageIsDataCompletion && !!onSkipDataCompletion && !disabled;

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

  const handleSkip = () => {
    onSkipDataCompletion!(skipNotes);
    setSkipNotes("");
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentStageRef = useRef<HTMLDivElement>(null);
  const showScrollArrows = stagesOrder.length > 10;

  useEffect(() => {
    if (currentStageRef.current && scrollContainerRef.current) {
      currentStageRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentIndex, stagesOrder.length]);

  const scrollByAmount = (delta: number) => {
    scrollContainerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  return (
    <div className="w-full space-y-4" dir="rtl">
      {normalizedStage === "الأخذ_بالملاحظات" && reviewNotes && reviewNotes.trim() && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4" dir="rtl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
            <span className="font-bold text-amber-800">تم إرجاع القضية من لجنة المراجعة</span>
            {reviewDecision === "rejected" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-300">مرفوض</span>
            )}
            {reviewDecision === "partial" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300">اعتماد جزئي</span>
            )}
          </div>
          <p className="text-amber-700 text-sm">{reviewNotes}</p>
        </div>
      )}
      <div className="relative flex items-center">
        {showScrollArrows && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full shadow-sm"
            onClick={() => scrollByAmount(150)}
            data-testid="button-scroll-stages-right"
            aria-label="تمرير لليمين"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex items-center gap-0.5 overflow-x-auto scroll-smooth pb-1 px-1 scrollbar-hide"
        >
          {stagesOrder.map((stage, index) => {
            const status = getStageStatus(index);
            const isCurrent = status === "current";
            return (
              <div key={stage} className="flex items-center shrink-0">
                <div
                  ref={isCurrent ? currentStageRef : undefined}
                  className="flex flex-col items-center shrink-0"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      status === "completed"
                        ? "bg-green-500 text-white"
                        : isCurrent
                        ? "bg-accent text-accent-foreground ring-4 ring-accent/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`stage-indicator-${index}`}
                  >
                    {status === "completed" ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={`mt-1 text-[10px] text-center break-words max-w-[60px] leading-tight ${
                      isCurrent
                        ? "font-bold text-accent"
                        : status === "completed"
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {getStageLabel(stage)}
                  </span>
                </div>
                {index < stagesOrder.length - 1 && (
                  <div
                    className={`h-1 w-4 mx-0.5 rounded shrink-0 ${
                      index < currentIndex ? "bg-green-500" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        {showScrollArrows && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full shadow-sm"
            onClick={() => scrollByAmount(-150)}
            data-testid="button-scroll-stages-left"
            aria-label="تمرير لليسار"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}
      </div>

      {disabled && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>جاري تحديث المرحلة...</span>
        </div>
      )}
      <div className="flex items-center justify-center gap-3 flex-wrap">
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

        {canSkip && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                data-testid="button-skip-data-completion"
              >
                <SkipForward className="w-4 h-4 ml-1" />
                الدعوى مكتملة - تجاوز للدراسة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تجاوز مرحلة استكمال البيانات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم تجاوز مرحلة "استكمال البيانات" والانتقال مباشرةً إلى مرحلة <strong>دراسة</strong>.
                  استخدم هذا الخيار فقط عندما تكون بيانات الدعوى مكتملة ولا توجد نواقص.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={skipNotes}
                onChange={(e) => setSkipNotes(e.target.value)}
                className="mt-2"
                data-testid="input-skip-notes"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setSkipNotes("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleSkip}>تأكيد التجاوز</AlertDialogAction>
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
