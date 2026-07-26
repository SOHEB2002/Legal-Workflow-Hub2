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
    // TRI-STATE, not checkboxes. A checkbox has no way to say "the lawyer
    // answered NO" as distinct from "the lawyer didn't answer", and that
    // ambiguity is exactly what let a judgment be saved with both boxes blank —
    // parking the case at محكوم_حكم_ابتدائي with no deadline, no objection memo
    // and no forward path. Both are now explicit and required (the server
    // enforces the same rule and 400s).
    judgmentDegree: "" as "" | "ابتدائي" | "نهائي",
    objectionAnswer: "" as "" | "نعم" | "لا",
    // objectionDeadline removed with step 2 — the deadline is derived from the
    // صك receipt date, not entered at the session.
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
      result: "", resultDetails: "", judgmentSide: "",
      judgmentDegree: "", objectionAnswer: "", nextHearingDate: "",
      nextHearingTime: "", responseRequired: false, opponentResponseRequired: false,
      caseId: "", afterFailedSettlementChoice: "", transferToDepartmentId: "", transferReason: "",
    });
  }, [hearing?.id]);

  // The objection question applies ONLY to a primary judgment that went against
  // us wholly or partly — it decides whether the لائحة اعتراضية is created at صك
  // receipt. Mirrors the server rule verbatim.
  const judgmentNeedsObjectionAnswer =
    resultForm.result === HearingResult.JUDGMENT
    && resultForm.judgmentDegree === "ابتدائي"
    && (resultForm.judgmentSide === "ضدنا" || resultForm.judgmentSide === "جزئي");

  // Submit gate for a judgment: outcome + degree always, plus the objection
  // answer when it applies. Keeps the button in step with the server's 400s
  // instead of letting the request fail after the fact.
  const judgmentInputsComplete =
    resultForm.result !== HearingResult.JUDGMENT
    || (!!resultForm.judgmentSide
        && !!resultForm.judgmentDegree
        && (!judgmentNeedsObjectionAnswer || !!resultForm.objectionAnswer));

  const handleSubmitResult = async () => {
    if (!hearing || !resultForm.result) return;
    const effectiveCaseId = hearing.caseId || resultForm.caseId;
    if (resultForm.responseRequired && !effectiveCaseId) {
      toast({ title: "يجب اختيار القضية المرتبطة لإنشاء المذكرة", variant: "destructive" });
      return;
    }
    const linkedCaseForSubmit = effectiveCaseId ? getCaseById(effectiveCaseId) : null;
    // Defendants are excluded: no choice card is rendered for them (the server
    // closes the case automatically), so requiring one would block submit on a
    // radio that does not exist.
    const isSettlementOnlyFailed =
      resultForm.result === HearingResult.SETTLEMENT_FAILED &&
      !!linkedCaseForSubmit?.isSettlementCase &&
      linkedCaseForSubmit?.clientRole !== "مدعى_عليه";
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
        // Both sent as explicit booleans — the tri-states above guarantee the
        // lawyer chose, and the submit button stays disabled until they have.
        data.judgmentFinal = resultForm.judgmentDegree === "نهائي";
        // objectionFeasible stays — it is the lawyer's legal ASSESSMENT, made at
        // the session and read back later by the صك-receipt handler. Sent only
        // when the question actually applies (primary + ضدنا/جزئي); the server
        // requires it in exactly that case and ignores it otherwise.
        if (judgmentNeedsObjectionAnswer) {
          data.objectionFeasible = resultForm.objectionAnswer === "نعم";
        }
        // objectionDeadline is NO LONGER sent (step 2): the objection window runs
        // from the day the صك is RECEIVED, days after this session, so it cannot
        // be known here. It is captured by "تسجيل استلام الصك" instead.
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
              <div>
                <Label>درجة الحكم <span className="text-red-500">*</span></Label>
                <Select
                  value={resultForm.judgmentDegree}
                  onValueChange={(value) => setResultForm({
                    ...resultForm,
                    judgmentDegree: value as "ابتدائي" | "نهائي",
                    // Leaving ابتدائي retires the objection question — drop a
                    // stale answer so it can't be sent for a final judgment.
                    objectionAnswer: value === "ابتدائي" ? resultForm.objectionAnswer : "",
                  })}
                >
                  <SelectTrigger data-testid="select-judgment-degree"><SelectValue placeholder="اختر درجة الحكم" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ابتدائي">حكم ابتدائي (قابل للاعتراض)</SelectItem>
                    <SelectItem value="نهائي">حكم نهائي (غير قابل للاعتراض)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Objection sub-form. Shown for ضدنا AND جزئي: a partial judgment is
                  partially against us, so it can warrant an objection too. This gate
                  mirrors the SERVER's objection-memo branch verbatim (routes.ts:8203,
                  `judgmentType === "ضدنا" || judgmentType === "جزئي"`), which already
                  accepted جزئي — the form was the only thing blocking it, so a partial
                  judgment could never set objectionFeasible/objectionDeadline and the
                  server branch could never fire. */}
              {judgmentNeedsObjectionAnswer && (
                <>
                  <div>
                    <Label>هل يمكن تقديم اعتراض؟ <span className="text-red-500">*</span></Label>
                    <Select
                      value={resultForm.objectionAnswer}
                      onValueChange={(value) => setResultForm({ ...resultForm, objectionAnswer: value as "نعم" | "لا" })}
                    >
                      <SelectTrigger data-testid="select-objection-feasible"><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="نعم">نعم — سنقدم اعتراضاً</SelectItem>
                        <SelectItem value="لا">لا — لن نعترض</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* The objection DEADLINE input was removed here (step 2). The
                      window runs from the day the صك is RECEIVED — days after this
                      session — so it can't be entered now. It is captured by
                      "تسجيل استلام الصك" on the case, which computes
                      receiptDate + window and creates the لائحة اعتراضية then. */}
                  {resultForm.objectionAnswer === "نعم" && (
                    <p className="text-xs text-muted-foreground">
                      ستُحدَّد مهلة الاعتراض عند تسجيل استلام الصك، وتُنشأ اللائحة الاعتراضية حينها.
                    </p>
                  )}
                  {resultForm.objectionAnswer === "لا" && (
                    <p className="text-xs text-muted-foreground">
                      لن تُنشأ لائحة اعتراضية. سجّل لاحقاً "لم نستأنف — الحكم نهائي" من إجراءات القضية.
                    </p>
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
            // DEFENDANT — no choice to offer. The opponent is the party who files in
            // court, so there is nothing to "continue" into: the server closes the
            // case automatically. Mirrors the isDefendantSettlement branch in the
            // hearing-result handler exactly, so the UI never shows an option the
            // server would not honour. The note is informational only (not a choice)
            // so saving the result is not silently surprising.
            if (linked?.clientRole === "مدعى_عليه") {
              return (
                <Card className="p-4 border-orange-300" data-testid="card-failed-settlement-defendant">
                  <p className="text-sm font-medium text-orange-700 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> قضية مدعى عليه — لم يتم الصلح
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ستُغلق القضية تلقائياً مع الاحتفاظ برقم التسوية وسجل المراحل. إذا رفع الخصم الدعوى في المحكمة يمكن إعادة فتحها لاحقاً بإدخال رقم الدعوى.
                  </p>
                </Card>
              );
            }
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
                      <span className="block text-xs text-muted-foreground">تُحوَّل إلى مسار التقاضي العادي وتنتقل إلى مرحلة "أغلق طلب الصلح".</span>
                    </span>
                  </label>
                </div>
              </Card>
            );
          })()}
        </div>
        <DialogFooter>
          <Button data-testid="button-submit-result" onClick={handleSubmitResult} className="w-full" disabled={!resultForm.result || !judgmentInputsComplete || submitting}>
            {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            حفظ النتيجة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
