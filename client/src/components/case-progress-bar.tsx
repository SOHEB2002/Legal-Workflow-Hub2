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
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

interface CaseProgressBarProps {
  currentStage: CaseStageValue;
  onMoveToNext: (notes: string, internalReviewerId?: string) => void;
  onMoveToPrevious: (notes: string) => void;
  onSkipDataCompletion?: (notes: string) => void;
  onInternalReviewSendBack?: (notes: string) => void;
  userRole: UserRoleType;
  disabled?: boolean;
  caseClassification?: CaseClassificationValue;
  caseType?: CaseTypeValue;
  reviewNotes?: string;
  reviewDecision?: string;
  eligibleInternalReviewers?: Array<{ id: string; name: string }>;
  caseInternalReviewerId?: string | null;
  currentUserId?: string;
}

export function CaseProgressBar({
  currentStage,
  onMoveToNext,
  onMoveToPrevious,
  onSkipDataCompletion,
  onInternalReviewSendBack,
  userRole,
  disabled = false,
  caseClassification,
  caseType,
  reviewNotes,
  reviewDecision,
  eligibleInternalReviewers = [],
  caseInternalReviewerId,
  currentUserId,
}: CaseProgressBarProps) {
  const [notes, setNotes] = useState("");
  const [skipNotes, setSkipNotes] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [sendBackNotes, setSendBackNotes] = useState("");
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

  const nextStage = stagesOrder[currentIndex + 1];
  const nextIsInternalReview = nextStage === "مراجعة_داخلية" || nextStage === "مراجعة_داخلية_للتظلم";
  const canConfirmNext = !nextIsInternalReview || !!selectedReviewerId;

  const isAtInternalReview =
    normalizedStage === "مراجعة_داخلية" || normalizedStage === "مراجعة_داخلية_للتظلم";
  const isReviewerActor = !!currentUserId && !!caseInternalReviewerId && currentUserId === caseInternalReviewerId;
  const isHeadOrManager = userRole === "department_head" || userRole === "branch_manager";
  const canActOnInternalReview = isReviewerActor || isHeadOrManager;

  const handleMoveNext = () => {
    if (nextIsInternalReview && !selectedReviewerId) return;
    onMoveToNext(notes, nextIsInternalReview ? selectedReviewerId : undefined);
    setNotes("");
    setSelectedReviewerId("");
  };

  const handleInternalReviewApprove = () => {
    onMoveToNext("", undefined);
  };

  const handleInternalReviewSendBack = () => {
    if (!onInternalReviewSendBack || !sendBackNotes.trim()) return;
    onInternalReviewSendBack(sendBackNotes.trim());
    setSendBackNotes("");
  };

  const handleMovePrev = () => {
    onMoveToPrevious(notes);
    setNotes("");
  };

  const handleSkip = () => {
    onSkipDataCompletion!(skipNotes);
    setSkipNotes("");
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
                  className={`mt-2 text-xs text-center break-words max-w-[72px] leading-tight ${
                    status === "current"
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

      {disabled && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>جاري تحديث المرحلة...</span>
        </div>
      )}

      {isAtInternalReview && !canActOnInternalReview && (
        <div className="flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-md py-2 px-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>بانتظار اعتماد المراجع الداخلي</span>
        </div>
      )}

      {isAtInternalReview && canActOnInternalReview && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-internal-review-approve"
              >
                <Check className="w-4 h-4 ml-1" />
                معتمد
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>اعتماد المراجعة الداخلية</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم اعتماد القضية والانتقال إلى{" "}
                  <strong>{getStageLabel(stagesOrder[currentIndex + 1], effectiveClassification as CaseClassificationValue)}</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleInternalReviewApprove}>تأكيد الاعتماد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                data-testid="button-internal-review-send-back"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                يوجد ملاحظات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>إرجاع القضية بملاحظات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم إرجاع القضية إلى المحامي ليأخذ بالملاحظات ثم يعيدها إليك.
                  الملاحظات مطلوبة.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="اكتب ملاحظات المراجع الداخلي..."
                value={sendBackNotes}
                onChange={(e) => setSendBackNotes(e.target.value)}
                className="mt-2"
                data-testid="input-internal-review-notes"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setSendBackNotes("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleInternalReviewSendBack}
                  disabled={!sendBackNotes.trim()}
                >
                  إرسال الملاحظات
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 flex-wrap">
        {canGoPrev && !isAtInternalReview && (
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

        {canGoNext && !isAtInternalReview && (
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
              {nextIsInternalReview && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">اختر المراجع الداخلي <span className="text-red-500">*</span></label>
                  <select
                    value={selectedReviewerId}
                    onChange={(e) => setSelectedReviewerId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="select-internal-reviewer"
                  >
                    <option value="">-- اختر مراجعاً --</option>
                    {eligibleInternalReviewers.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {eligibleInternalReviewers.length === 0 && (
                    <p className="text-xs text-red-600">لا يوجد مراجعون مؤهلون في هذا القسم</p>
                  )}
                </div>
              )}
              <Textarea
                placeholder="ملاحظات (اختياري)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                data-testid="input-stage-notes-next"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => { setNotes(""); setSelectedReviewerId(""); }}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleMoveNext} disabled={!canConfirmNext}>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
