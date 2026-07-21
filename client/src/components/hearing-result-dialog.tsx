import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, ArrowLeftRight, Scale, AlertTriangle, Loader2 } from "lucide-react";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { useHearings } from "@/lib/hearings-context";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { HearingResult, HearingType, type Hearing } from "@shared/schema";

// SHARED hearing-result dialog. Extracted verbatim from the hearings page so the
// hearings screen AND the unified-tasks hub mount the SAME component → same
// hearingResultSchema workflow, same POST /api/hearings/:id/result, same
// validation/permissions/four-eyes server-side. Zero logic divergence.
//
// Self-contained: owns its form state (reset whenever `hearing` changes) and all
// the data it needs via hooks. The host only supplies the hearing + callbacks.
export function HearingResultDialog({
  hearing,
  onClose,
  onSuccess,
}: {
  hearing: Hearing | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { submitResult } = useHearings();
  const { cases, getCaseById } = useCases();
  const { getClientName } = useClients();
  const { departments } = useDepartments();
  const { user } = useAuth();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [resultForm, setResultForm] = useState({
    result: "" as string,
    resultDetails: "",
    judgmentSide: "",
    judgmentFinal: false,
    objectionFeasible: false,
    objectionDeadline: "",
    nextHearingDate: "",
    nextHearingTime: "",
    responseRequired: false,
    opponentResponseRequired: false,
    caseId: "",
    afterFailedSettlementChoice: "" as "" | "close" | "continue",
    transferToDepartmentId: "",
    transferReason: "",
  });

  // Reset the form each time a new hearing is opened (or the dialog closes).
  useEffect(() => {
    setResultForm({
      result: "", resultDetails: "", judgmentSide: "", judgmentFinal: false,
      objectionFeasible: false, objectionDeadline: "", nextHearingDate: "",
      nextHearingTime: "", responseRequired: false, opponentResponseRequired: false,
      caseId: "", afterFailedSettlementChoice: "", transferToDepartmentId: "", transferReason: "",
    });
  }, [hearing?.id]);

  const handleSubmitResult = async () => {
    if (!hearing || !resultForm.result) return;
    const effectiveCaseId = hearing.caseId || resultForm.caseId;
    if (resultForm.responseRequired && !effectiveCaseId) {
      toast({ title: "يجب اختيار القضية المرتبطة لإنشاء المذكرة", variant: "destructive" });
      return;
    }
    const linkedCaseForSubmit = effectiveCaseId ? getCaseById(effectiveCaseId) : null;
    const isSettlementOnlyFailed =
      resultForm.result === HearingResult.SETTLEMENT_FAILED &&
      !!linkedCaseForSubmit?.isSettlementCase;
    if (isSettlementOnlyFailed && !resultForm.afterFailedSettlementChoice) {
      toast({ title: "اختر إجراء الصلح: إغلاق نهائي أو استكمال الإجراءات", variant: "destructive" });
      return;
    }
    if (resultForm.result === HearingResult.JURISDICTION_DECLINED && !resultForm.transferToDepartmentId) {
      toast({ title: "اختر القسم المحوّل إليه عند تسجيل عدم الاختصاص", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const data: any = {
        result: resultForm.result,
        resultDetails: resultForm.resultDetails,
        userId: user?.id,
        caseId: effectiveCaseId || undefined,
      };
      if (resultForm.result === HearingResult.JUDGMENT) {
        // The dropdown is a single 3-valued outcome (لصالحنا | ضدنا | جزئي), so it
        // must go to judgmentType — the CURRENT field, which enumerates all three
        // (schema.ts:3422). judgmentSide is the LEGACY 2-valued field (:3426) and
        // rejects جزئي, which is what made every partial judgment 400. The server
        // coalesces `data.judgmentType || data.judgmentSide` at routes.ts:7929
        // (persist → the judgment_side column) and :8099 (all downstream routing),
        // so لصالحنا/ضدنا behave identically to before.
        data.judgmentType = resultForm.judgmentSide;
        data.judgmentFinal = resultForm.judgmentFinal;
        data.objectionFeasible = resultForm.objectionFeasible;
        data.objectionDeadline = resultForm.objectionDeadline || undefined;
      }
      if (resultForm.result === HearingResult.NEW_SESSION) {
        data.nextHearingDate = resultForm.nextHearingDate;
        data.nextHearingTime = resultForm.nextHearingTime;
        data.responseRequired = resultForm.responseRequired;
        data.opponentResponseRequired = resultForm.opponentResponseRequired;
      }
      if (resultForm.result === HearingResult.JURISDICTION_DECLINED) {
        data.transferToDepartmentId = resultForm.transferToDepartmentId;
        data.transferReason = resultForm.transferReason || undefined;
      }
      if (isSettlementOnlyFailed) {
        data.afterFailedSettlementChoice = resultForm.afterFailedSettlementChoice;
      }
      const res = await submitResult(hearing.id, data);
      const hasNewHearing = res.createdTasks?.some((t: any) => t.type === "new_hearing");
      const tasksMsg = res.createdTasks?.length ? `\nتم إنشاء ${res.createdTasks.length} مهمة تلقائياً` : "";
      const memosMsg = res.createdMemos?.length ? `\nتم إنشاء ${res.createdMemos.length} مذكرة تلقائياً` : "";
      const opponentMsg = data.opponentResponseRequired && hasNewHearing ? "\nتم تعليم الجلسة القادمة: مطلوب رد من الخصم" : "";
      toast({ title: "تم تسجيل النتيجة بنجاح" + tasksMsg + memosMsg + opponentMsg });
      onSuccess?.();
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!hearing} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="w-5 h-5" />
            تسجيل نتيجة الجلسة
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label>النتيجة</Label>
            <Select value={resultForm.result} onValueChange={(value) => setResultForm({ ...resultForm, result: value })}>
              <SelectTrigger data-testid="select-result">
                <SelectValue placeholder="اختر النتيجة" />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const ht = hearing?.hearingType;
                  const linkedCase = hearing?.caseId ? getCaseById(hearing.caseId) : null;
                  const isAdminCourt = ht === HearingType.COURT && linkedCase?.caseType === "إداري";
                  const isSettlementContext =
                    (!!linkedCase?.isSettlementCase && linkedCase?.currentStage === "مداولة_الصلح")
                    || ht === HearingType.TARADI || ht === HearingType.SETTLEMENT;
                  if (isSettlementContext) {
                    return (
                      <>
                        <SelectItem value="موعد_جديد">موعد جديد</SelectItem>
                        <SelectItem value="تم_الصلح">تم الصلح</SelectItem>
                        <SelectItem value="لم_يتم_الصلح">لم يتم الصلح</SelectItem>
                        <SelectItem value="لم_يصلنا_رابط_الصلح">لم يصلنا رابط الصلح</SelectItem>
                      </>
                    );
                  }
                  if (isAdminCourt) {
                    return (
                      <>
                        <SelectItem value="موعد_جديد">جلسة (موعد جديد)</SelectItem>
                        <SelectItem value="حكم">حكم</SelectItem>
                        <SelectItem value="شطب">شطب</SelectItem>
                        <SelectItem value="عدم_الاختصاص">عدم الاختصاص</SelectItem>
                      </>
                    );
                  }
                  return (
                    <>
                      <SelectItem value="موعد_جديد">جلسة (موعد جديد)</SelectItem>
                      <SelectItem value="حكم">حكم</SelectItem>
                      <SelectItem value="تم_الصلح">تم الصلح</SelectItem>
                      <SelectItem value="شطب">شطب</SelectItem>
                      <SelectItem value="عدم_الاختصاص">عدم الاختصاص</SelectItem>
                    </>
                  );
                })()}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>تفاصيل النتيجة</Label>
            <Textarea
              data-testid="input-result-details"
              value={resultForm.resultDetails}
              onChange={(e) => setResultForm({ ...resultForm, resultDetails: e.target.value })}
              placeholder="وصف تفصيلي لما حدث في الجلسة..."
            />
          </div>

          {!hearing?.caseId && (
            <div>
              <Label>القضية المرتبطة {resultForm.responseRequired && <span className="text-destructive">*</span>}</Label>
              <Select value={resultForm.caseId} onValueChange={(value) => setResultForm({ ...resultForm, caseId: value })}>
                <SelectTrigger data-testid="select-result-case">
                  <SelectValue placeholder="اختر القضية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون قضية</SelectItem>
                  {cases.filter((c) => c.status !== "مغلق").map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.caseNumber} - {getClientName(c.clientId)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {resultForm.result === HearingResult.NEW_SESSION && (
            <Card className="p-4 space-y-3">
              <p className="text-sm font-medium text-primary flex items-center gap-1">
                <ArrowLeftRight className="w-4 h-4" /> تفاصيل الموعد الجديد
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ الجلسة القادمة</Label>
                  <HijriDatePicker value={resultForm.nextHearingDate} onChange={(v) => setResultForm({ ...resultForm, nextHearingDate: v })} data-testid="input-next-date" />
                </div>
                <div>
                  <Label>وقت الجلسة القادمة</Label>
                  <Input data-testid="input-next-time" type="time" value={resultForm.nextHearingTime} onChange={(e) => setResultForm({ ...resultForm, nextHearingTime: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="responseRequired" checked={resultForm.responseRequired} onCheckedChange={(checked) => setResultForm({ ...resultForm, responseRequired: !!checked })} data-testid="checkbox-response-required" />
                <Label htmlFor="responseRequired" className="text-sm cursor-pointer">مطلوب إعداد رد قبل الجلسة القادمة</Label>
              </div>
              {resultForm.responseRequired && (
                <p className="text-xs text-muted-foreground">سيتم إنشاء مذكرة جوابية تلقائياً ومهمة إعداد الرد</p>
              )}
              <div className="flex items-center gap-2">
                <Checkbox id="opponentResponseRequired" checked={resultForm.opponentResponseRequired} onCheckedChange={(checked) => setResultForm({ ...resultForm, opponentResponseRequired: !!checked })} data-testid="checkbox-opponent-response-required" />
                <Label htmlFor="opponentResponseRequired" className="text-sm cursor-pointer">مطلوب رد من الخصم</Label>
              </div>
            </Card>
          )}

          {resultForm.result === HearingResult.JUDGMENT && (
            <Card className="p-4 space-y-3">
              <p className="text-sm font-medium text-primary flex items-center gap-1">
                <Scale className="w-4 h-4" /> تفاصيل الحكم
              </p>
              <div>
                <Label>الحكم لصالح</Label>
                <Select value={resultForm.judgmentSide} onValueChange={(value) => setResultForm({ ...resultForm, judgmentSide: value })}>
                  <SelectTrigger data-testid="select-judgment-side"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="لصالحنا">لصالحنا</SelectItem>
                    <SelectItem value="ضدنا">ضدنا</SelectItem>
                    <SelectItem value="جزئي">جزئي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="judgmentFinal" checked={resultForm.judgmentFinal} onCheckedChange={(checked) => setResultForm({ ...resultForm, judgmentFinal: !!checked })} data-testid="checkbox-judgment-final" />
                <Label htmlFor="judgmentFinal" className="text-sm cursor-pointer">حكم نهائي (غير قابل للاعتراض)</Label>
              </div>
              {/* Objection sub-form. Shown for ضدنا AND جزئي: a partial judgment is
                  partially against us, so it can warrant an objection too. This gate
                  mirrors the SERVER's objection-memo branch verbatim (routes.ts:8203,
                  `judgmentType === "ضدنا" || judgmentType === "جزئي"`), which already
                  accepted جزئي — the form was the only thing blocking it, so a partial
                  judgment could never set objectionFeasible/objectionDeadline and the
                  server branch could never fire. */}
              {!resultForm.judgmentFinal
                && (resultForm.judgmentSide === "ضدنا" || resultForm.judgmentSide === "جزئي") && (
                <>
                  <div className="flex items-center gap-2">
                    <Checkbox id="objectionFeasible" checked={resultForm.objectionFeasible} onCheckedChange={(checked) => setResultForm({ ...resultForm, objectionFeasible: !!checked })} data-testid="checkbox-objection" />
                    <Label htmlFor="objectionFeasible" className="text-sm cursor-pointer">يمكن تقديم اعتراض</Label>
                  </div>
                  {resultForm.objectionFeasible && (
                    <div>
                      <Label>مهلة الاعتراض</Label>
                      <HijriDatePicker value={resultForm.objectionDeadline} onChange={(v) => setResultForm({ ...resultForm, objectionDeadline: v })} data-testid="input-objection-deadline" />
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {resultForm.result === HearingResult.JURISDICTION_DECLINED && (
            <Card className="p-4 space-y-3 border-amber-300">
              <p className="text-sm font-medium text-amber-700 flex items-center gap-1">
                <ArrowLeftRight className="w-4 h-4" /> تحويل القضية لقسم مختص
              </p>
              <p className="text-xs text-muted-foreground">ستُعاد القضية إلى مرحلة "استلام" في القسم المختار، ويُلغى تعيين المحامين الحاليين.</p>
              <div>
                <Label>القسم المحوّل إليه <span className="text-destructive">*</span></Label>
                <Select value={resultForm.transferToDepartmentId} onValueChange={(v) => setResultForm({ ...resultForm, transferToDepartmentId: v })}>
                  <SelectTrigger data-testid="select-jurisdiction-target-dept"><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                  <SelectContent>
                    {departments.filter((d) => {
                      const effId = hearing?.caseId || resultForm.caseId;
                      const linked = effId ? getCaseById(effId) : null;
                      return !linked || String(d.id) !== linked.departmentId;
                    }).map((d) => (
                      <SelectItem key={String(d.id)} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>سبب التحويل (اختياري)</Label>
                <Textarea data-testid="input-jurisdiction-reason" value={resultForm.transferReason} onChange={(e) => setResultForm({ ...resultForm, transferReason: e.target.value })} placeholder="ملاحظات حول قرار المحكمة بعدم الاختصاص..." rows={2} />
              </div>
            </Card>
          )}

          {(() => {
            const effId = hearing?.caseId || resultForm.caseId;
            const linked = effId ? getCaseById(effId) : null;
            const showFailedSettlementChoice = resultForm.result === HearingResult.SETTLEMENT_FAILED && !!linked?.isSettlementCase;
            if (!showFailedSettlementChoice) return null;
            // BOTH choices are offered to BOTH roles — the user still decides
            // between closing permanently and continuing. Only the MEANING of
            // "استكمال إجراءاتها" differs by role (see the server branch): a
            // plaintiff proceeds to draft and file, while for a defendant the
            // opponent is the one who files, so the case closes awaiting their
            // filing and can be reopened later with a court case number.
            const isDefendantCase = linked?.clientRole === "مدعى_عليه";
            return (
              <Card className="p-4 space-y-3 border-orange-300">
                <p className="text-sm font-medium text-orange-700 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> قضية بدأت من مداولة الصلح — اختر الإجراء
                </p>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="afterFailedSettlementChoice" value="close" checked={resultForm.afterFailedSettlementChoice === "close"} onChange={() => setResultForm({ ...resultForm, afterFailedSettlementChoice: "close" })} data-testid="radio-failed-settlement-close" className="mt-1" />
                    <span className="text-sm">
                      <strong>إغلاق القضية نهائياً</strong>
                      <span className="block text-xs text-muted-foreground">تُغلق القضية ولا تستكمل في المحكمة.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="afterFailedSettlementChoice" value="continue" checked={resultForm.afterFailedSettlementChoice === "continue"} onChange={() => setResultForm({ ...resultForm, afterFailedSettlementChoice: "continue" })} data-testid="radio-failed-settlement-continue" className="mt-1" />
                    <span className="text-sm">
                      <strong>استكمال إجراءاتها</strong>
                      <span className="block text-xs text-muted-foreground">
                        {isDefendantCase
                          ? "قضية مدعى عليه: تُغلق بانتظار رفع الخصم للدعوى في المحكمة، مع الاحتفاظ برقم التسوية، ويمكن إعادة فتحها لاحقاً بإدخال رقم الدعوى."
                          : "تُحوَّل إلى مسار التقاضي العادي وتنتقل إلى مرحلة \"أغلق طلب الصلح\"."}
                      </span>
                    </span>
                  </label>
                </div>
              </Card>
            );
          })()}
        </div>
        <DialogFooter>
          <Button data-testid="button-submit-result" onClick={handleSubmitResult} className="w-full" disabled={!resultForm.result || submitting}>
            {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            حفظ النتيجة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
