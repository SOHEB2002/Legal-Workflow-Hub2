import React, { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MemoType,
  MemoStatusLabels,
  FieldTaskStatus,
  HearingStatusLabels,
  HearingStatus,
  HearingResultLabels,
  ObjectionStatusLabels,
  isFirmToday,
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
  Pencil,
  Paperclip,
} from "lucide-react";
import { SingleAttachmentControl } from "@/components/single-attachment-control";

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
  const { user, users } = useAuth();
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

  // CLIENT MIRROR of canEditHearingRecord (server/routes.ts) — the owner's
  // three-tier correction rule:
  //   branch_manager | admin_support            → any time
  //   own-dept department_head of the PARENT CASE → hearing's own day only
  //   assigned lawyer of the PARENT CASE         → hearing's own day only
  // The SERVER decides; this only decides whether the affordance renders, so no
  // button can 403. isFirmToday compares calendar days in the FIRM's timezone —
  // never parse the stored "YYYY-MM-DD" (see FirmTimeZone in shared/schema.ts).
  const canEditHearingRecord = (() => {
    if (!user || !detailHearing) return false;
    if (user.role === "branch_manager" || user.role === "admin_support") return true;
    const parent = detailHearing.caseId ? getCaseById(detailHearing.caseId) : null;
    if (!parent) return false;
    const isOwnDeptHead =
      user.role === "department_head"
      && !!user.departmentId
      && !!parent.departmentId
      && parent.departmentId === user.departmentId;
    const isCaseLawyer =
      parent.primaryLawyerId === user.id
      || parent.responsibleLawyerId === user.id
      || (Array.isArray(parent.assignedLawyers) && parent.assignedLawyers.includes(user.id));
    if (!isOwnDeptHead && !isCaseLawyer) return false;
    return isFirmToday(detailHearing.hearingDate);
  })();

  // CLIENT MIRROR of canActOnHearing (server/routes.ts) — attending lawyer /
  // branch_manager / admin_support. Gates attaching, replacing and deleting the
  // ضبط الجلسة file, the same set the server enforces on those routes.
  //
  // Deliberately NOT department-scoped: hearings carry no departmentId, so a
  // department_head would have to be resolved through the parent case — the
  // known-large open item that kept hearings out of the tiered permissions
  // widening. Out of scope; this matches every other hearing action.
  const canAttachHearingMinutes =
    !!user && !!detailHearing && (
      user.role === "branch_manager"
      || user.role === "admin_support"
      || (!!detailHearing.attendingLawyerId && detailHearing.attendingLawyerId === user.id)
    );

  // Drives the "إرفاق ضبط الجلسة" workflow step's done-state. Fed by the attach
  // control's own fetch (onAttachedChange) so the dialog issues no second read.
  const [minutesAttached, setMinutesAttached] = useState(false);
  // Reset when the dialog switches hearings. The attach control refetches on
  // endpoint change, but until that resolves the PREVIOUS hearing's answer would
  // linger — and now that this value gates the close button, a stale `true` would
  // briefly offer "إغلاق" on a hearing with no ضبط. False is the safe direction:
  // it withholds the button until the real answer arrives.
  useEffect(() => { setMinutesAttached(false); }, [detailHearing?.id]);

  // PHASE 2 — inline correction of the two no-cascade result fields. Self-contained
  // (own state + apiRequest) rather than an injected action, so it works in BOTH
  // hosts: the hearings page and the case-details dialog, which passes no actions.
  const [editingResult, setEditingResult] = useState(false);
  const [editResultDetails, setEditResultDetails] = useState("");
  const [editObjectionDeadline, setEditObjectionDeadline] = useState("");
  const [savingResultEdit, setSavingResultEdit] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const openResultEdit = () => {
    if (!detailHearing) return;
    setEditResultDetails(detailHearing.resultDetails || "");
    setEditObjectionDeadline(detailHearing.objectionDeadline || "");
    setEditingResult(true);
  };

  const saveResultEdit = async () => {
    if (!detailHearing) return;
    setSavingResultEdit(true);
    try {
      const body: Record<string, unknown> = { resultDetails: editResultDetails };
      if (detailHearing.result === "حكم") {
        body.objectionDeadline = editObjectionDeadline || null;
      }
      await apiRequest("PATCH", `/api/hearings/${detailHearing.id}/result-details`, body);
      await queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
      toast({ title: "تم حفظ التعديل" });
      setEditingResult(false);
    } catch (err) {
      toast({ title: "تعذّر حفظ التعديل", description: extractApiError(err), variant: "destructive" });
    } finally {
      setSavingResultEdit(false);
    }
  };

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

                    {/* PHASE 2 — correct the two fields that drive NO cascade.
                        Everything else about a recorded result (the result itself,
                        the judgment direction, the next-hearing date …) is
                        deliberately absent: changing any of them would have to
                        re-run tasks, memos, stage writes and notifications, much of
                        which cannot be undone. The copy says so, so the affordance
                        cannot be mistaken for "edit the result". */}
                    {canEditHearingRecord && !editingResult && (
                      <div className="pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={openResultEdit}
                          data-testid="button-edit-result-details"
                        >
                          <Pencil className="w-3.5 h-3.5 ml-1" />
                          تعديل التفاصيل
                        </Button>
                      </div>
                    )}
                    {editingResult && (
                      <div className="rounded-md border p-3 space-y-3" data-testid="form-edit-result-details">
                        <p className="text-xs text-muted-foreground">
                          يمكن تعديل التفاصيل فقط. لتصحيح نتيجة خاطئة يُلغى موعد الجلسة وتُسجَّل جلسة جديدة.
                        </p>
                        <div>
                          <Label className="text-xs">تفاصيل النتيجة</Label>
                          <Textarea
                            value={editResultDetails}
                            onChange={(e) => setEditResultDetails(e.target.value)}
                            rows={3}
                            data-testid="input-edit-result-details"
                          />
                        </div>
                        {detailHearing.result === "حكم" && (
                          <div>
                            <Label className="text-xs">مهلة الاعتراض (سجل تاريخي)</Label>
                            <Input
                              type="date"
                              value={editObjectionDeadline}
                              onChange={(e) => setEditObjectionDeadline(e.target.value)}
                              data-testid="input-edit-objection-deadline"
                            />
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditingResult(false)} disabled={savingResultEdit}>
                            إلغاء
                          </Button>
                          <Button size="sm" onClick={saveResultEdit} disabled={savingResultEdit} data-testid="button-save-result-details">
                            حفظ
                          </Button>
                        </div>
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
                    // Undefined when the host passes NO actions (the case-details
                    // dialog), so WorkflowStep renders the step READ-ONLY. It used to
                    // be an unconditional arrow, which meant the case dialog showed a
                    // live-looking button whose only effect was to close the dialog.
                    onAction={actions ? () => {
                      actions.onRecordResult(detailHearing);
                      onOpenChange(false);
                    } : undefined}
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
                    // PHASE 1 — the label used to go undefined once the report was
                    // done, so a typo was permanent. It now flips to "تعديل التقرير"
                    // for the actors the SERVER lets correct it (canEditHearingRecord
                    // mirror above), and the dialog opens PRE-FILLED with the
                    // existing text rather than blank.
                    actionLabel={
                      !detailHearing.result ? undefined
                        : !detailHearing.reportCompleted ? "كتابة التقرير"
                        : canEditHearingRecord ? "تعديل التقرير"
                        : undefined
                    }
                    onAction={actions ? () => {
                      actions.onWriteReport(detailHearing);
                      onOpenChange(false);
                    } : undefined}
                  />
                  <WorkflowStep
                    done={detailHearing.contactCompleted}
                    label="التواصل مع العميل"
                    icon={<Phone className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                    actionLabel={detailHearing.result && !detailHearing.contactCompleted ? "تأكيد التواصل" : undefined}
                    onAction={actions ? () => actions.onMarkContactCompleted(detailHearing) : undefined}
                    actionDisabled={submitting}
                  />
                  {/* إرفاق ضبط الجلسة — the court's own minutes document.
                      Positioned after client contact and before the close.

                      NO actionLabel and NO onAction ON PURPOSE. Attaching needs
                      a file picker, not a button, so the affordance lives in the
                      control rendered directly beneath — and this step stays
                      read-only, exactly like "إنشاء المهام التلقائية" above.
                      That also sidesteps the documented WorkflowStep trap: a
                      step's actionLabel must evaluate to undefined once its own
                      `done` holds, or it renders a live-looking button on a
                      finished step. With no actionLabel at all, there is
                      nothing to go stale.

                      ⚠ AS OF BATCH 3 THE CLOSE GATE BELOW DOES DEPEND ON THIS
                      STEP — minutes are now the third condition for closing a
                      hearing, beside the report and the client contact. The
                      earlier note saying they never block a close is superseded. */}
                  <WorkflowStep
                    done={minutesAttached}
                    label="إرفاق ضبط الجلسة"
                    icon={<Paperclip className="w-4 h-4" />}
                    disabled={!detailHearing.result}
                  />
                  {detailHearing.result && (
                    <SingleAttachmentControl
                      endpoint={`/api/hearings/${detailHearing.id}/minutes-attachment`}
                      label="ملف ضبط الجلسة"
                      emptyHint="لم يُرفق الضبط بعد"
                      canEdit={canAttachHearingMinutes}
                      onAttachedChange={setMinutesAttached}
                      // The control re-reads its OWN endpoint after an upload or
                      // delete, which is why this step's done-state flips — but
                      // the badges live on the LIST response's derived
                      // hasMinutesAttachment, and uploadAttachmentRaw is a raw
                      // fetch that touches no cache (apiRequest wouldn't either;
                      // invalidation is always explicit here). Without this the
                      // "مطلوب إرفاق ضبط الجلسة" badge stayed lit on both pages
                      // until something else happened to refetch.
                      //
                      // ONE key clears BOTH surfaces: the hearings-page badge and
                      // the cases-page badge read the same app-wide
                      // ["/api/hearings"] query (hearings-context) — the cases
                      // page via getHearingsByCase. Same idiom as saveResultEdit
                      // above.
                      onChanged={() => { queryClient.invalidateQueries({ queryKey: ["/api/hearings"] }); }}
                    />
                  )}
                  <WorkflowStep
                    done={detailHearing.status === HearingStatus.COMPLETED && detailHearing.reportCompleted}
                    label="إغلاق الجلسة"
                    icon={<Lock className="w-4 h-4" />}
                    // THE THIRD CONDITION, mirroring the server's close gate
                    // (POST /api/hearings/:id/close) in BOTH expressions so no
                    // "إغلاق" button can render only to 400. minutesAttached is
                    // the attach control's own fetch above, reported through
                    // onAttachedChange — the dialog issues no second read for it,
                    // and it flips the instant a file is uploaded or deleted.
                    disabled={!detailHearing.reportCompleted || !detailHearing.contactCompleted || !minutesAttached}
                    actionLabel={detailHearing.reportCompleted && detailHearing.contactCompleted && minutesAttached && detailHearing.status !== HearingStatus.COMPLETED ? "إغلاق" : undefined}
                    onAction={actions ? () => actions.onCloseHearing(detailHearing) : undefined}
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
      {/* 🔴 THE PHASE-1 BUG WAS HERE. The action button used to be gated on
          `!done`, so a COMPLETED step could never carry an action — WorkflowStep
          was written on the assumption that "done" means "nothing left to do".
          That assumption held until report EDITING: the report step passes
          done={reportCompleted}, so the instant a report was written the step went
          done and the correctly-computed "تعديل التقرير" actionLabel was discarded
          without ever rendering. The badge below is what the user saw instead.
          The `!done` condition is dropped; badge and action now COEXIST.
          SAFE FOR EVERY OTHER STEP — each of their actionLabel expressions already
          evaluates to undefined once its own done condition holds (record-result
          checks !result, contact checks !contactCompleted, close checks
          status !== COMPLETED), so none of them gains a button it did not have.
          Only the report step changes, which is the intent.
          Wrapped so `mr-auto` lives on the group: previously the badge and the
          button each carried it and could never appear together. */}
      {(done || (actionLabel && onAction)) && (
        <div className="mr-auto flex items-center gap-2">
          {done && (
            <Badge variant="outline" className="border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
              مكتمل
            </Badge>
          )}
          {actionLabel && onAction && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAction}
              disabled={actionDisabled}
              data-testid={`button-workflow-action-${label}`}
            >
              {actionLabel}
            </Button>
          )}
        </div>
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
