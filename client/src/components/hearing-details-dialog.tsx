import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { formatTimeAmPm } from "@/lib/date-utils";
import { useHearings } from "@/lib/hearings-context";
import { useCases } from "@/lib/cases-context";
import { useMemos } from "@/lib/memos-context";
import { useAuth } from "@/lib/auth-context";
import { useCaseFieldTasks } from "@/hooks/use-case-field-tasks";
import {
  MemoType,
  MemoStatusLabels,
  FieldTaskStatus,
  HearingStatusLabels,
  HearingStatus,
  HearingResultLabels,
  ObjectionStatusLabels,
} from "@shared/schema";
import type { Hearing, ObjectionStatusValue, HearingStatusValue } from "@shared/schema";
import {
  Scale,
  FileText,
  Gavel,
  Phone,
  Lock,
  Flag,
  CheckCircle,
  XCircle,
  Calendar,
  ArrowLeftRight,
} from "lucide-react";

// SHARED hearing-details dialog. The body was moved VERBATIM out of
// hearings.tsx (its detail Dialog + the WorkflowStep helper it is the only
// consumer of) so the hearings page and the CASE-details dialog can show the
// SAME hearing view, driven by the same contexts.
//
// WHY: the الجلسات tab inside the case dialog used to open a hearing with
// setLocation("/hearings?openHearing=<id>") — a wouter route push that tore the
// user out of the case they were reading. Rendering this component in place lets
// them close it and still be in the case dialog, on the same tab. Building a
// second, smaller hearing view would have been the other option and was rejected:
// one rendering, two hosts.
//
// The read data comes from the app-wide contexts (hearings / cases / auth /
// field-tasks), so no prop threading is needed for it — the same pattern
// CaseDetailsDialog uses.
//
// ACTIONS ARE INJECTED, not owned. The hearings page passes the four workflow
// callbacks (they open ITS result / report dialogs and mutate ITS state); the case
// dialog passes none, so WorkflowStep renders its steps read-only — it already
// treats an undefined actionLabel as "no button", so nothing extra was needed.
export interface HearingDetailsActions {
  onRecordResult: (hearing: Hearing) => void;
  onWriteReport: (hearing: Hearing) => void;
  onMarkContactCompleted: (hearing: Hearing) => void;
  onCloseHearing: (hearing: Hearing) => void;
  busy?: boolean;
}

export function HearingDetailsDialog({
  hearingId,
  onOpenChange,
  actions,
}: {
  hearingId: string | null;
  onOpenChange: (open: boolean) => void;
  actions?: HearingDetailsActions;
}) {
  const { hearings } = useHearings();
  const { getCaseById } = useCases();
  const { users } = useAuth();
  const { getMemosByCase } = useMemos();
  // Same resolution the hearings page uses for its filters: the explicitly
  // assigned attending lawyer, else the parent case's primary/responsible.
  const getLawyerForHearing = (h: Hearing) =>
    h.attendingLawyerId
    || (h.caseId ? (getCaseById(h.caseId)?.primaryLawyerId || getCaseById(h.caseId)?.responsibleLawyerId) : null)
    || null;
  const detailHearing = hearingId ? hearings.find((h) => h.id === hearingId) || null : null;
  // Case-scoped field tasks for the open hearing's case (case-access gated), so
  // the hearing detail shows every linked task on the case.
  const { data: detailHearingTasks = [] } = useCaseFieldTasks(detailHearing?.caseId);
  const submitting = !!actions?.busy;

  return (
      <Dialog open={!!detailHearing} onOpenChange={(open) => !open && onOpenChange(false)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              تفاصيل الجلسة
            </DialogTitle>
          </DialogHeader>
          {detailHearing && (
            <>
            {/* "جلسة مُعلَّمة" — the FULL reason, above the tabs so it is visible
                whichever tab is open (the flag is an alert, not a detail of one
                section). Mirrors the memo cancellation-banner idiom in
                memos.tsx: destructive-tinted rounded box, icon + heading, then
                the reason, then who/when in smaller muted text. */}
            {/* سبب الإلغاء — shown wherever the cancellation is. Same banner
                shape as the flag banner below, above the tabs so it is visible
                whichever tab is open. */}
            {detailHearing.status === HearingStatus.CANCELLED && detailHearing.cancellationReason && (
              <div
                className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="banner-hearing-cancelled"
              >
                <div className="flex items-center gap-2 font-medium">
                  <XCircle className="w-4 h-4" />
                  جلسة ملغاة
                </div>
                <div className="mt-1">
                  سبب الإلغاء: <BidiText>{detailHearing.cancellationReason}</BidiText>
                </div>
              </div>
            )}
            {detailHearing.isFlagged && (
              <div
                className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="banner-hearing-flagged"
              >
                <div className="flex items-center gap-2 font-medium">
                  <Flag className="w-4 h-4" />
                  جلسة مُعلَّمة للانتباه
                </div>
                {detailHearing.flagReason && (
                  <div className="mt-1">
                    السبب: <BidiText>{detailHearing.flagReason}</BidiText>
                  </div>
                )}
                {(detailHearing.flaggedBy || detailHearing.flaggedAt) && (
                  <div className="mt-1 text-xs text-destructive/80">
                    {detailHearing.flaggedBy && (
                      <>بواسطة <BidiText>{users.find((u: any) => u.id === detailHearing.flaggedBy)?.name || detailHearing.flaggedBy}</BidiText></>
                    )}
                    {detailHearing.flaggedBy && detailHearing.flaggedAt ? " — " : ""}
                    {detailHearing.flaggedAt && (
                      <>في <LtrInline>{new Date(detailHearing.flaggedAt).toISOString().slice(0, 10)}</LtrInline></>
                    )}
                  </div>
                )}
              </div>
            )}
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="w-full flex">
                <TabsTrigger value="info" className="flex-1" data-testid="tab-info">المعلومات</TabsTrigger>
                <TabsTrigger value="result" className="flex-1" data-testid="tab-result">النتيجة</TabsTrigger>
                <TabsTrigger value="report" className="flex-1" data-testid="tab-report">التقرير</TabsTrigger>
                <TabsTrigger value="workflow" className="flex-1" data-testid="tab-workflow">سير العمل</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">التاريخ</p>
                    <DualDateDisplay date={detailHearing.hearingDate} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الوقت</p>
                    <p className="font-medium"><LtrInline>{formatTimeAmPm(detailHearing.hearingTime)}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المحكمة</p>
                    <p className="font-medium"><BidiText>{detailHearing.courtName}</BidiText></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الدائرة</p>
                    <p className="font-medium"><LtrInline>{detailHearing.courtRoom || "-"}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">القضية</p>
                    <p className="font-medium"><LtrInline>{getCaseById(detailHearing.caseId)?.caseNumber || detailHearing.caseId}</LtrInline></p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الحالة</p>
                    {getStatusBadge(detailHearing.status)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">المحامي المكلف بالحضور</p>
                    <p className="font-medium">{(() => {
                      const lawyerId = getLawyerForHearing(detailHearing);
                      const lawyer = lawyerId ? users.find(u => u.id === lawyerId) : null;
                      return lawyer?.name || "-";
                    })()}</p>
                  </div>
                </div>
                {detailHearing.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">ملاحظات</p>
                    <p className="text-sm">{detailHearing.notes}</p>
                  </div>
                )}
                {(() => {
                  const hearingTs = new Date(detailHearing.hearingDate).getTime();
                  const allCaseMemos = getMemosByCase(detailHearing.caseId);
                  const directLinked = allCaseMemos.filter((m) => m.hearingId === detailHearing.id);
                  const dateLinked = allCaseMemos.filter((m) => {
                    const ts = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
                    return !isNaN(ts) && !isNaN(hearingTs) && ts >= hearingTs;
                  });
                  const linkedMemos = directLinked.length > 0 ? directLinked : dateLinked;
                  const linkedTasks = detailHearingTasks.filter((t) => {
                    const ts = t.createdAt ? new Date(t.createdAt).getTime() : NaN;
                    return !isNaN(ts) && !isNaN(hearingTs) && ts >= hearingTs;
                  });
                  // "منجزة" is a consultation stage (COMPLETED), not a memo status — do not re-add.
                  const doneMemoStatuses = new Set(["معتمدة", "مرفوعة"]);
                  return (
                    <div className="border border-border rounded-md p-3 space-y-2">
                      <p className="text-xs text-muted-foreground font-semibold">المهام المرتبطة</p>
                      {linkedMemos.length === 0 && linkedTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">لا توجد مهام مرتبطة</p>
                      ) : (
                        <div className="space-y-2">
                          {linkedMemos.map((m) => {
                            const memoTypeLabel = m.memoType === MemoType.RESPONSE ? "جوابية" : "تحرير";
                            const isDone = doneMemoStatuses.has(m.status);
                            return (
                              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex flex-col">
                                  <span className="font-medium">{m.title}</span>
                                  <span className="text-xs text-muted-foreground">مذكرة {memoTypeLabel}</span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    isDone
                                      ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"
                                      : "border-orange-500 text-orange-500"
                                  }
                                >
                                  {MemoStatusLabels[m.status] || m.status}
                                </Badge>
                              </div>
                            );
                          })}
                          {linkedTasks.map((t) => {
                            const isDone = t.status === FieldTaskStatus.COMPLETED;
                            return (
                              <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex flex-col">
                                  <span className="font-medium">{t.title}</span>
                                  <span className="text-xs text-muted-foreground">مهمة ميدانية</span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={
                                    isDone
                                      ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"
                                      : "border-orange-500 text-orange-500"
                                  }
                                >
                                  {t.status}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="result" className="space-y-3 mt-4">
                {detailHearing.result ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">النتيجة</p>
                        <Badge variant="secondary">{HearingResultLabels[detailHearing.result] || detailHearing.result}</Badge>
                      </div>
                      {detailHearing.judgmentSide && (
                        <div>
                          <p className="text-xs text-muted-foreground">الحكم لصالح</p>
                          {/* Three-way outcome, so three styles: جزئي is a PARTIAL
                              result, not a loss — rendering it destructive-red made it
                              read as a total defeat. Orange mirrors the app's existing
                              "partial" idiom (case-progress-bar.tsx:451 اعتماد جزئي). */}
                          <Badge
                            variant={
                              detailHearing.judgmentSide === "لصالحنا" ? "default"
                              : detailHearing.judgmentSide === "جزئي" ? "outline"
                              : "destructive"
                            }
                            className={
                              detailHearing.judgmentSide === "جزئي"
                                ? "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800"
                                : undefined
                            }
                          >
                            {detailHearing.judgmentSide}
                          </Badge>
                        </div>
                      )}
                    </div>
                    {detailHearing.resultDetails && (
                      <div>
                        <p className="text-xs text-muted-foreground">التفاصيل</p>
                        <p className="text-sm">{detailHearing.resultDetails}</p>
                      </div>
                    )}
                    {detailHearing.judgmentFinal !== null && (
                      <div>
                        {/* judgment_final is FINALITY — "can this still be objected
                            to?" — NOT the degree. Labelling it "نوع الحكم" and
                            printing "حكم ابتدائي" for a non-final ruling was the
                            SAME false opposition a3f7897 removed from the recording
                            form ("درجة الحكم: ابتدائي أم نهائي") but which survived
                            here in the display: the opposite of ابتدائي is استئنافي,
                            while نهائي is a separate property. It read as the degree
                            and so contradicted the النتيجة line, which states the
                            real degree. Now names the property it actually holds. */}
                        <p className="text-xs text-muted-foreground">نهائية الحكم</p>
                        <p className="text-sm">
                          {detailHearing.judgmentFinal ? "نهائي (غير قابل للاعتراض)" : "غير نهائي (قابل للاعتراض)"}
                        </p>
                      </div>
                    )}
                    {detailHearing.objectionStatus && (
                      <div>
                        <p className="text-xs text-muted-foreground">حالة الاعتراض</p>
                        <Badge variant="outline">{ObjectionStatusLabels[detailHearing.objectionStatus as ObjectionStatusValue] || detailHearing.objectionStatus}</Badge>
                      </div>
                    )}
                    {detailHearing.objectionDeadline && (
                      <div>
                        <p className="text-xs text-muted-foreground">مهلة الاعتراض</p>
                        <DualDateDisplay date={detailHearing.objectionDeadline} />
                      </div>
                    )}
                    {detailHearing.nextHearingDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">الجلسة القادمة</p>
                        <div className="text-sm flex items-center gap-2">
                          <DualDateDisplay date={detailHearing.nextHearingDate} compact />
                          {detailHearing.nextHearingTime && <> - <LtrInline>{formatTimeAmPm(detailHearing.nextHearingTime)}</LtrInline></>}
                        </div>
                      </div>
                    )}
                    {detailHearing.result === "موعد_جديد" && (() => {
                      const hearingMemoRequired = !!detailHearing.memoRequired;
                      const opponentResponseRequired = !!detailHearing.opponentResponseRequired;
                      if (!hearingMemoRequired && !opponentResponseRequired) return null;
                      const hearingTs = new Date(detailHearing.hearingDate).getTime();
                      const caseMemos = getMemosByCase(detailHearing.caseId);
                      const directMatches = caseMemos.filter((m) => m.hearingId === detailHearing.id);
                      const relevantMemos = directMatches.length > 0
                        ? directMatches
                        : caseMemos.filter((m) => {
                            const createdTs = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
                            return !isNaN(createdTs) && createdTs >= hearingTs;
                          });
                      const memoDone = relevantMemos.some(
                        (m) => m.status === "معتمدة" || m.status === "مرفوعة",
                      );
                      return (
                        <div className="border border-border rounded-md p-3 space-y-2">
                          <p className="text-xs text-muted-foreground font-semibold">المطلوب بعد الجلسة</p>
                          {hearingMemoRequired && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">مذكرة مطلوبة</span>
                              {memoDone ? (
                                <Badge variant="outline" className="border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
                                  منجزة
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-orange-500 text-orange-500">
                                  قيد العمل
                                </Badge>
                              )}
                            </div>
                          )}
                          {opponentResponseRequired && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">مطلوب رد من الخصم</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Gavel className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>لم يتم تسجيل نتيجة بعد</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="report" className="space-y-3 mt-4">
                {detailHearing.reportCompleted ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground">التقرير</p>
                      <p className="text-sm whitespace-pre-wrap">{detailHearing.hearingReport}</p>
                    </div>
                    {detailHearing.recommendations && (
                      <div>
                        <p className="text-xs text-muted-foreground">التوصيات</p>
                        <p className="text-sm whitespace-pre-wrap">{detailHearing.recommendations}</p>
                      </div>
                    )}
                    {detailHearing.nextSteps && (
                      <div>
                        <p className="text-xs text-muted-foreground">الخطوات التالية</p>
                        <p className="text-sm whitespace-pre-wrap">{detailHearing.nextSteps}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {detailHearing.contactCompleted ? (
                        <Badge variant="outline" className="border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
                          <Phone className="w-3 h-3 ml-1" />
                          تم التواصل مع العميل
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-orange-500 text-orange-500">
                          <Phone className="w-3 h-3 ml-1" />
                          لم يتم التواصل بعد
                        </Badge>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>لم يتم كتابة التقرير بعد</p>
                    {detailHearing.result && (
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          actions?.onWriteReport(detailHearing);
                          onOpenChange(false);
                        }}
                        data-testid="button-write-report"
                      >
                        <FileText className="w-4 h-4 ml-1" />
                        كتابة التقرير
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="workflow" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <WorkflowStep
                    done={!!detailHearing.result}
                    label="تسجيل النتيجة"
                    icon={<Gavel className="w-4 h-4" />}
                    actionLabel={!detailHearing.result && detailHearing.status === HearingStatus.UPCOMING ? "تسجيل" : undefined}
                    onAction={() => {
                      actions?.onRecordResult(detailHearing);
                      onOpenChange(false);
                    }}
                  />
                  <WorkflowStep
                    done={detailHearing.adminTasksCreated}
                    label="إنشاء المهام التلقائية"
                    icon={<CheckCircle className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                  />
                  <WorkflowStep
                    done={detailHearing.reportCompleted}
                    label="كتابة التقرير"
                    icon={<FileText className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                    actionLabel={detailHearing.result && !detailHearing.reportCompleted ? "كتابة التقرير" : undefined}
                    onAction={() => {
                      actions?.onWriteReport(detailHearing);
                      onOpenChange(false);
                    }}
                  />
                  <WorkflowStep
                    done={detailHearing.contactCompleted}
                    label="التواصل مع العميل"
                    icon={<Phone className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                    actionLabel={detailHearing.result && !detailHearing.contactCompleted ? "تأكيد التواصل" : undefined}
                    onAction={() => actions?.onMarkContactCompleted(detailHearing)}
                    actionDisabled={submitting}
                  />
                  <WorkflowStep
                    done={detailHearing.status === HearingStatus.COMPLETED && detailHearing.reportCompleted}
                    label="إغلاق الجلسة"
                    icon={<Lock className="w-4 h-4" />}
                    disabled={!detailHearing.reportCompleted || !detailHearing.contactCompleted}
                    actionLabel={detailHearing.reportCompleted && detailHearing.contactCompleted && detailHearing.status !== HearingStatus.COMPLETED ? "إغلاق" : undefined}
                    onAction={() => actions?.onCloseHearing(detailHearing)}
                    actionDisabled={submitting}
                  />
                </div>
              </TabsContent>
            </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
  );
}

function WorkflowStep({
  done,
  label,
  icon,
  disabled,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  done: boolean;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border transition-colors ${
        done
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
          : disabled
          ? "border-muted bg-muted/30 opacity-50"
          : "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30"
      }`}
    >
      <div className={done ? "text-green-600 dark:text-green-400" : disabled ? "text-muted-foreground" : "text-orange-500"}>
        {done ? <CheckCircle className="w-5 h-5" /> : icon}
      </div>
      <span className={`text-sm font-medium ${done ? "text-green-700 dark:text-green-300" : disabled ? "text-muted-foreground" : "text-orange-700 dark:text-orange-300"}`}>
        {label}
      </span>
      {done && (
        <Badge variant="outline" className="mr-auto border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
          مكتمل
        </Badge>
      )}
      {!done && actionLabel && onAction && (
        <Button
          size="sm"
          variant="outline"
          className="mr-auto"
          onClick={onAction}
          disabled={actionDisabled}
          data-testid={`button-workflow-action-${label}`}
        >
          {actionLabel}
        </Button>
      )}

    </div>
  );
}

// Shared with the hearings PAGE, which renders the same badge in its list.
// Lives here rather than in hearings.tsx so the detail dialog is self-contained
// and there is exactly one definition.
export function getStatusBadge(status: HearingStatusValue, cancellationReason?: string | null) {
  const label = HearingStatusLabels[status] || status;
  switch (status) {
    case HearingStatus.UPCOMING:
      return <Badge variant="outline" className="border-primary text-primary"><Calendar className="w-3 h-3 ml-1" />{label}</Badge>;
    case HearingStatus.COMPLETED:
      return <Badge variant="outline" className="border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"><CheckCircle className="w-3 h-3 ml-1" />{label}</Badge>;
    case HearingStatus.POSTPONED:
      return <Badge variant="outline" className="border-orange-500 text-orange-500"><ArrowLeftRight className="w-3 h-3 ml-1" />{label}</Badge>;
    case HearingStatus.CANCELLED:
      return (
        <Badge
          variant="outline"
          className="border-destructive text-destructive"
          title={cancellationReason ? `سبب الإلغاء: ${cancellationReason}` : undefined}
        >
          <XCircle className="w-3 h-3 ml-1" />{label}
        </Badge>
      );
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}
