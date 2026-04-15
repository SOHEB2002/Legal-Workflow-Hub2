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
  onMoveToNext: (notes: string, internalReviewerId?: string, reviewDecision?: string, extraFields?: Record<string, unknown>, explicitTargetStage?: string) => void;
  onMoveToPrevious: (notes: string, internalReviewerId?: string) => void;
  onSkipDataCompletion?: (notes: string) => void;
  onInternalReviewSendBack?: (notes: string) => void;
  onPlatformReviewAddNotes?: (notes: string) => void;
  onPlatformReviewResubmit?: () => void;
  hasPlatformNotes?: boolean;
  userRole: UserRoleType;
  disabled?: boolean;
  caseClassification?: CaseClassificationValue;
  caseType?: CaseTypeValue;
  clientRole?: string;
  memoRequired?: boolean;
  isSettlementCase?: boolean;
  reviewNotes?: string;
  reviewDecision?: string;
  eligibleInternalReviewers?: Array<{ id: string; name: string }>;
  caseInternalReviewerId?: string | null;
  currentUserId?: string;
  isAssignedLawyer?: boolean;
}

export function CaseProgressBar({
  currentStage,
  onMoveToNext,
  onMoveToPrevious,
  onSkipDataCompletion,
  onInternalReviewSendBack,
  onPlatformReviewAddNotes,
  onPlatformReviewResubmit,
  hasPlatformNotes = false,
  userRole,
  disabled = false,
  caseClassification,
  caseType,
  clientRole,
  memoRequired,
  isSettlementCase,
  reviewNotes,
  reviewDecision,
  eligibleInternalReviewers = [],
  caseInternalReviewerId,
  currentUserId,
  isAssignedLawyer = false,
}: CaseProgressBarProps) {
  const [notes, setNotes] = useState("");
  const [skipNotes, setSkipNotes] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [sendBackNotes, setSendBackNotes] = useState("");
  const [platformNumber, setPlatformNumber] = useState("");
  const [courtCaseNumber, setCourtCaseNumber] = useState("");
  const [platformNotes, setPlatformNotes] = useState("");
  const normalizedStage = currentStage;
  const effectiveClassification = caseClassification || "قيد_الدراسة";
  let stagesOrder = getStagesForClassification(
    effectiveClassification as CaseClassificationValue,
    caseType,
    clientRole,
    memoRequired,
    isSettlementCase,
  );
  // Dynamic bridge for IN_COURT cases: if a memo was added after the case
  // already reached دراسة on the no-memo path, the memo variant returned
  // above doesn't include دراسة. Splice دراسة in just before the drafting
  // stage so the progress bar shows a coherent path and the next-stage
  // button points at drafting (not back at استلام).
  if (
    effectiveClassification === "منظورة_بالمحكمة" &&
    normalizedStage === "دراسة" &&
    stagesOrder.indexOf("دراسة") < 0
  ) {
    const memoDraftIdx = stagesOrder.indexOf("تحرير_مذكرة_جوابية");
    const pleadingDraftIdx = stagesOrder.indexOf("تحرير_صحيفة_الدعوى");
    const draftingIdx = memoDraftIdx >= 0 ? memoDraftIdx : pleadingDraftIdx;
    if (draftingIdx > 0) {
      stagesOrder = [
        ...stagesOrder.slice(0, draftingIdx),
        "دراسة" as CaseStageValue,
        ...stagesOrder.slice(draftingIdx),
      ];
    }
  }
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
  const prevStage = stagesOrder[currentIndex - 1];
  const prevIsInternalReview = prevStage === "مراجعة_داخلية" || prevStage === "مراجعة_داخلية_للتظلم";

  // Any forward transition INTO a قيد_التدقيق_* stage requires the matching
  // platform number, regardless of which source stage we're moving from
  // (جاهزة_للرفع for the first review, أغلق_طلب_الصلح for the post-settlement
  // najiz/moeen review, etc.).
  const platformFieldInfo: { field: "taradiNumber" | "najizNumber" | "moeenNumber"; label: string; placeholder: string } | null =
    nextStage === "قيد_التدقيق_في_تراضي"
      ? { field: "taradiNumber", label: "رقم الطلب في تراضي", placeholder: "أدخل رقم الطلب في منصة تراضي" }
      : nextStage === "قيد_التدقيق_في_ناجز"
      ? { field: "najizNumber", label: "رقم القيد في ناجز", placeholder: "أدخل رقم القيد في ناجز" }
      : nextStage === "قيد_التدقيق_في_معين"
      ? { field: "moeenNumber", label: "رقم القيد في معين", placeholder: "أدخل رقم القيد في معين" }
      : null;

  const canConfirmNext =
    (!nextIsInternalReview || !!selectedReviewerId) &&
    (!platformFieldInfo || !!platformNumber.trim());
  const canConfirmPrev = !prevIsInternalReview || !!(selectedReviewerId || caseInternalReviewerId);

  const isAtInternalReview =
    normalizedStage === "مراجعة_داخلية" || normalizedStage === "مراجعة_داخلية_للتظلم";
  const isAtCommitteeNotes = normalizedStage === "الأخذ_بالملاحظات";
  const isHeadOrManagerRole = userRole === "department_head" || userRole === "branch_manager";
  const canActOnCommitteeNotes = isAtCommitteeNotes && (isAssignedLawyer || isHeadOrManagerRole);

  const platformReviewInfo: { kind: "تراضي" | "ناجز" | "معين"; requireCourtNumber: boolean } | null =
    normalizedStage === "قيد_التدقيق_في_تراضي"
      ? { kind: "تراضي", requireCourtNumber: false }
      : normalizedStage === "قيد_التدقيق_في_ناجز"
      ? { kind: "ناجز", requireCourtNumber: true }
      : normalizedStage === "قيد_التدقيق_في_معين"
      ? { kind: "معين", requireCourtNumber: true }
      : null;
  const isAtPlatformReview = !!platformReviewInfo;
  const canActOnPlatformReview =
    isAtPlatformReview && (isAssignedLawyer || isHeadOrManagerRole || userRole === "admin_support");

  const isAtSettlement = normalizedStage === "مداولة_الصلح";
  const canActOnSettlement =
    isAtSettlement && (isAssignedLawyer || isHeadOrManagerRole || userRole === "admin_support");
  const isReviewerActor = !!currentUserId && !!caseInternalReviewerId && currentUserId === caseInternalReviewerId;
  const isHeadOrManager = userRole === "department_head" || userRole === "branch_manager";
  const canActOnInternalReview = isReviewerActor || isHeadOrManager;

  const handleMoveNext = () => {
    if (nextIsInternalReview && !selectedReviewerId) return;
    if (platformFieldInfo && !platformNumber.trim()) return;
    const extraFields = platformFieldInfo
      ? { [platformFieldInfo.field]: platformNumber.trim() }
      : undefined;
    // Always pass nextStage explicitly so the cases-context never has to
    // recompute the path — that resolver was unreliable for some commercial
    // and post-settlement transitions and silently dropped the PATCH.
    onMoveToNext(
      notes,
      nextIsInternalReview ? selectedReviewerId : undefined,
      undefined,
      extraFields,
      nextStage,
    );
    setNotes("");
    setSelectedReviewerId("");
    setPlatformNumber("");
  };

  const handleInternalReviewApprove = () => {
    onMoveToNext("", undefined);
  };

  const handleInternalReviewSendBack = () => {
    if (!onInternalReviewSendBack || !sendBackNotes.trim()) return;
    onInternalReviewSendBack(sendBackNotes.trim());
    setSendBackNotes("");
  };

  const handleCommitteeNotesDecision = (decision: string) => {
    onMoveToNext("", undefined, decision);
  };

  const handlePlatformReviewAccept = () => {
    if (!platformReviewInfo) return;
    if (platformReviewInfo.requireCourtNumber && !courtCaseNumber.trim()) return;
    const extraFields = platformReviewInfo.requireCourtNumber
      ? { courtCaseNumber: courtCaseNumber.trim() }
      : undefined;
    // Explicit target per platform — don't let moveToNextStage guess from
    // the stages array, because the client-side stage resolver has been
    // unreliable for commercial paths.
    const target =
      normalizedStage === "قيد_التدقيق_في_تراضي"
        ? "مداولة_الصلح"
        : normalizedStage === "قيد_التدقيق_في_ناجز"
        ? "منظورة"
        : normalizedStage === "قيد_التدقيق_في_معين"
        ? "منظورة"
        : undefined;
    onMoveToNext("", undefined, undefined, extraFields, target);
    setCourtCaseNumber("");
  };

  const handleSettlementDecision = (target: "تحصيل" | "أغلق_طلب_الصلح" | "مقفلة") => {
    // Pass the target explicitly so the cases-context doesn't have to guess
    // the next stage from a linear stages array — same approach used for
    // the platform-review accept buttons.
    onMoveToNext("", undefined, undefined, undefined, target);
  };

  const handlePlatformReviewAddNotes = () => {
    if (!onPlatformReviewAddNotes || !platformNotes.trim()) return;
    onPlatformReviewAddNotes(platformNotes.trim());
    setPlatformNotes("");
  };

  const handleMovePrev = () => {
    if (prevIsInternalReview) {
      const reviewerToUse = selectedReviewerId || caseInternalReviewerId || undefined;
      if (!reviewerToUse) return;
      onMoveToPrevious(notes, reviewerToUse);
    } else {
      onMoveToPrevious(notes);
    }
    setNotes("");
    setSelectedReviewerId("");
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

      {canActOnPlatformReview && platformReviewInfo && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-platform-review-accept"
              >
                <Check className="w-4 h-4 ml-1" />
                تم القبول
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  تأكيد قبول {platformReviewInfo.kind === "تراضي" ? "منصة تراضي" : platformReviewInfo.kind === "ناجز" ? "منصة ناجز" : "منصة معين"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {platformReviewInfo.requireCourtNumber
                    ? "يرجى إدخال رقم الدعوى في المحكمة. سيتم استبدال رقم القضية بهذا الرقم."
                    : "سيتم الانتقال إلى المرحلة التالية."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {platformReviewInfo.requireCourtNumber && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">
                    رقم الدعوى في المحكمة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={courtCaseNumber}
                    onChange={(e) => setCourtCaseNumber(e.target.value)}
                    placeholder="أدخل رقم الدعوى الصادر من المحكمة"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="input-court-case-number"
                  />
                </div>
              )}
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => setCourtCaseNumber("")}>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePlatformReviewAccept}
                  disabled={platformReviewInfo.requireCourtNumber && !courtCaseNumber.trim()}
                >
                  تأكيد القبول
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {hasPlatformNotes && onPlatformReviewResubmit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  disabled={disabled}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  data-testid="button-platform-review-resubmit"
                >
                  <SkipForward className="w-4 h-4 ml-1" />
                  تم إعادة التقديم
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد إعادة التقديم</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم مسح ملاحظات المنصة وتحديث الحالة إلى
                    "تم إعادة التقديم — بانتظار رد المنصة". القضية ستبقى في نفس المرحلة.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={onPlatformReviewResubmit}>تأكيد</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {onPlatformReviewAddNotes && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950"
                  data-testid="button-platform-review-notes"
                >
                  <AlertTriangle className="w-4 h-4 ml-1" />
                  يوجد ملاحظات من المنصة
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>ملاحظات من المنصة</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حفظ الملاحظات وإبقاء القضية في نفس المرحلة لحين المعالجة وإعادة التقديم.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  placeholder="اكتب ملاحظات المنصة..."
                  value={platformNotes}
                  onChange={(e) => setPlatformNotes(e.target.value)}
                  className="mt-2"
                  data-testid="input-platform-notes"
                />
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel onClick={() => setPlatformNotes("")}>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handlePlatformReviewAddNotes}
                    disabled={!platformNotes.trim()}
                  >
                    حفظ الملاحظات
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {canActOnSettlement && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-settlement-reached"
              >
                <Check className="w-4 h-4 ml-1" />
                تم الصلح
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: تم الصلح</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم نقل القضية إلى مرحلة <strong>تحصيل</strong> وإنشاء مهمة
                  تلقائية للدعم الإداري بإعداد خطاب التحصيل.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleSettlementDecision("تحصيل")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-orange-500 hover:bg-orange-600 text-white"
                data-testid="button-settlement-failed"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                لم يتم الصلح
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: لم يتم الصلح</AlertDialogTitle>
                <AlertDialogDescription>
                  {isSettlementCase
                    ? <>سيتم إغلاق القضية حيث إن القضية بدأت من مرحلة مداولة الصلح.</>
                    : <>سيتم نقل القضية إلى مرحلة <strong>أغلق طلب الصلح</strong> لاستئناف مسار التقاضي في المحكمة.</>}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleSettlementDecision(isSettlementCase ? "مقفلة" : "أغلق_طلب_الصلح")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {canActOnCommitteeNotes && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-committee-notes-applied"
              >
                <Check className="w-4 h-4 ml-1" />
                تم الأخذ بالملاحظات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: تم الأخذ بالملاحظات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم الانتقال مباشرةً إلى <strong>جاهزة للرفع</strong> مع تسجيل قرار "تم الأخذ بالملاحظات".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCommitteeNotesDecision("تم_الأخذ_بالملاحظات")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-orange-500 hover:bg-orange-600 text-white"
                data-testid="button-committee-notes-partial"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                تم الأخذ بالملاحظات جزئياً
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: تم الأخذ بالملاحظات جزئياً</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم الانتقال مباشرةً إلى <strong>جاهزة للرفع</strong> مع تسجيل قرار "تم الأخذ بالملاحظات جزئياً".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCommitteeNotesDecision("تم_الأخذ_جزئياً")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={disabled}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-committee-notes-not-applied"
              >
                <AlertTriangle className="w-4 h-4 ml-1" />
                لم يتم الأخذ بالملاحظات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد: لم يتم الأخذ بالملاحظات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم الانتقال مباشرةً إلى <strong>جاهزة للرفع</strong> مع تسجيل قرار "لم يتم الأخذ بالملاحظات".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCommitteeNotesDecision("لم_يتم_الأخذ")}>
                  تأكيد
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
              {prevIsInternalReview && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">المراجع الداخلي <span className="text-red-500">*</span></label>
                  <select
                    value={selectedReviewerId || caseInternalReviewerId || ""}
                    onChange={(e) => setSelectedReviewerId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="select-internal-reviewer-prev"
                  >
                    <option value="">-- اختر مراجعاً --</option>
                    {eligibleInternalReviewers.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {caseInternalReviewerId && !selectedReviewerId && (
                    <p className="text-xs text-muted-foreground">
                      سيُعاد استخدام المراجع السابق ما لم يتم تغييره.
                    </p>
                  )}
                  {eligibleInternalReviewers.length === 0 && !caseInternalReviewerId && (
                    <p className="text-xs text-red-600">لا يوجد مراجعون مؤهلون في هذا القسم</p>
                  )}
                </div>
              )}
              <Textarea
                placeholder="سبب الإرجاع (اختياري)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                data-testid="input-stage-notes"
              />
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel onClick={() => { setNotes(""); setSelectedReviewerId(""); }}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleMovePrev} disabled={!canConfirmPrev}>تأكيد</AlertDialogAction>
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
                الدعوى مكتملة - تجاوز استكمال البيانات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تجاوز مرحلة استكمال البيانات</AlertDialogTitle>
                <AlertDialogDescription>
                  سيتم تجاوز مرحلة "استكمال البيانات" والانتقال مباشرةً إلى مرحلة{" "}
                  <strong>
                    {stagesOrder[currentIndex + 2]
                      ? getStageLabel(stagesOrder[currentIndex + 2])
                      : "دراسة"}
                  </strong>
                  . استخدم هذا الخيار فقط عندما تكون بيانات الدعوى مكتملة ولا توجد نواقص.
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

        {canGoNext && !isAtInternalReview && !canActOnCommitteeNotes && !isAtPlatformReview && !isAtSettlement && (
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
              {platformFieldInfo && (
                <div className="mt-3 space-y-1" dir="rtl">
                  <label className="text-sm font-semibold">
                    {platformFieldInfo.label} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={platformNumber}
                    onChange={(e) => setPlatformNumber(e.target.value)}
                    placeholder={platformFieldInfo.placeholder}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid={`input-${platformFieldInfo.field}`}
                  />
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
                <AlertDialogCancel
                  onClick={() => { setNotes(""); setSelectedReviewerId(""); setPlatformNumber(""); }}
                >
                  إلغاء
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleMoveNext} disabled={!canConfirmNext}>تأكيد</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
