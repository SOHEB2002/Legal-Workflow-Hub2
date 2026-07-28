import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Plus,
  Eye,
  CheckCircle,
  Archive,
  UserPlus,
  ClipboardCheck,
  Bell,
  Paperclip,
  Trash2,
  ExternalLink,
  AlertTriangle,
  ArrowLeftRight,
  Pencil,
  Check,
  X,
  MessageSquare,
  Pause,
  RotateCcw,
  FileText,
  Gavel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartInput } from "@/components/ui/smart-input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BidiText, LtrInline } from "@/components/ui/bidi-text";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import { CaseActivityTab, CaseNotesTab, CaseDeadlinesTab } from "@/components/case-tabs";
import { CaseStagePanel } from "@/components/case-stage-panel";
import { HearingDetailsDialog } from "@/components/hearing-details-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCases } from "@/lib/cases-context";
import { useClients } from "@/lib/clients-context";
import { useDepartments } from "@/lib/departments-context";
import { useAuth } from "@/lib/auth-context";
import { useHearings } from "@/lib/hearings-context";
import { useMemos } from "@/lib/memos-context";
import { getClientRoleLabel } from "@/lib/client-role";
import { formatTimeAmPm } from "@/lib/date-utils";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { isCasePaused } from "@/lib/case-stage-utils";
import {
  CaseStageLabels,
  CaseStagesOrder,
  CaseStage,
  CaseClassification,
  Priority,
  getStageLabel,
  findPrimaryJudgmentHearing,
  judgmentDirectionOf,
  weAreTheAppellant,
  ClosureReasonLabels,
} from "@shared/schema";
import type { LawCase, CaseStageValue, PriorityType, Attachment, ClosureReasonValue } from "@shared/schema";

// Stages that mark a REAL trip through internal review. Moved here verbatim with
// the dialog — the actions tab's "إرجاع من المراجعة الداخلية" block is its only
// consumer (a drafting-stage history entry with notes alone is NOT sufficient:
// data migration writes an initial drafting entry with notes "تهجير البيانات").
const REVIEW_LOOP_STAGES = new Set([
  "مراجعة_داخلية",
  "مراجعة_داخلية_للتظلم",
]);

// Moved here verbatim with the dialog — the info tab's priority badge is its
// only consumer.
function getPriorityColor(priority: PriorityType) {
  switch (priority) {
    case Priority.URGENT:
      return "bg-destructive text-destructive-foreground";
    case Priority.HIGH:
      return "bg-orange-500 text-white";
    case Priority.MEDIUM:
      return "bg-yellow-500 text-white";
    case Priority.LOW:
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// The page-level actions the dialog can TRIGGER but does not own: each one opens
// a sibling dialog that lives on the cases page (assign / review / reject /
// reminder / transfer / edit / early-close) or runs a page handler (approve).
//
// This is the CaseStagePanel decoupling precedent (case-stage-panel.tsx:22-29)
// applied to the whole dialog: page-only concerns are OPTIONAL, so the cases page
// passes them and behaves exactly as before, while a host that has no such
// dialogs (the مهامي hub) simply omits the prop — and every action row then does
// not render AT ALL, rather than rendering as a dead button.
//
// The can* booleans are computed BY THE PAGE from its existing permission helpers
// (canAssign / canReview / canClose / canEarlyCloseCase / permissions.*) and passed
// in, so no permission logic moves out of cases.tsx with this refactor.
export interface CaseDetailsActions {
  canEdit: boolean;
  onEdit: () => void;
  canAssign: boolean;
  onAssign: () => void;
  canReview: boolean;
  onReview: () => void;
  onReject: () => void;
  onApprove: () => void;
  canClose: boolean;
  canEarlyClose: boolean;
  onEarlyClose: () => void;
  // "إغلاق لعدم استكمال البيانات" — POST /api/cases/:id/close-no-response. The
  // host gates it on the CLOSE tier (canEarlyCloseCase) plus the endpoint's own
  // state conditions: currentStage === استكمال_البيانات, not closed/archived,
  // not paused. Deliberately NOT keyed on awaitingCompletion — a case reaches
  // that stage by the ordinary advance too (latch false), and that is the more
  // common path; see the server comment for the full chain.
  canCloseNoResponse: boolean;
  onCloseNoResponse: () => void;
  // Reopen a CLOSED case at a chosen stage (POST /api/cases/:id/reopen). The
  // host computes canReopen with the SAME rule the server enforces
  // (branch_manager | dept_head of the case's dept | assigned lawyer — note
  // admin_support is excluded, unlike canEarlyClose), so the button's
  // visibility equals the server's authorization.
  canReopen: boolean;
  onReopen: () => void;
  // "تسجيل استلام الصك" on a case at محكوم_حكم_ابتدائي. Same rule the server
  // enforces on POST /api/cases/:id/judgment-deed (canActOnMohrSettlement),
  // computed by the host so visibility equals authorization.
  canRecordJudgmentDeed: boolean;
  onRecordJudgmentDeed: () => void;
  // The two manual routes out of محكوم_حكم_ابتدائي (appeal path). Same rule the
  // server enforces on POST /api/cases/:id/appeal-outcome.
  canRecordAppealOutcome: boolean;
  onOpponentAppealed: () => void;
  onNoAppeal: () => void;
  // "تم استلام رد الخصم" — clears the مطلوب رد من الخصم indicator. The host gates
  // it on the same rule the server enforces AND on the indicator actually being
  // on, so visibility === authorization on both terms.
  canRecordOpponentResponse: boolean;
  onOpponentResponseReceived: () => void;
  canTransfer: boolean;
  onTransfer: () => void;
  canRemind: boolean;
  onReminder: () => void;
}

// SHARED case-details dialog. The body (banners → CaseStagePanel → the nine tabs)
// was moved VERBATIM out of cases.tsx so the cases page and the مهامي hub can show
// the SAME case view, driven by the same contexts and the same endpoints.
//
// Everything the dialog owns by itself — the active tab, the inline-edit fields,
// the تراضي/الموارد registration inputs, the new-comment box, the attachments list
// and form, the await-completion banner's activity-log lookup, and the
// source-consultation back-link — is INTERNAL state here (it was only ever read by
// this dialog). The read data comes from the app-wide contexts (cases / clients /
// departments / auth / hearings / memos), so no prop threading is needed for it.
// C4 — gate for the MOHR (التسوية الودية) action buttons. Mirrors the SERVER rule
// on PATCH /api/cases/:id/mohr and POST /api/cases/:id/direct-settlement EXACTLY
// (routes.ts canActOnMohrSettlement) so visibility === authorization: no button
// that 403s, no actor who can act but sees nothing.
//   branch_manager | department_head OF THE CASE'S OWN DEPARTMENT | assigned lawyer
// Same idiom as canSkipCommittee (consultations.tsx) and the onSkipCommittee
// conditional callback (case-stage-panel.tsx).
//
// The panel's labor + قيد_الدراسة conditions are applied by the caller and are NOT
// repeated here. Only the three ACTION buttons use this — the read-only status
// badge stays visible to anyone who can open the case, since admin_support still
// moves the case across the settlement stages (routes.ts ALLOWED_CASE_TRANSITIONS)
// and needs to see where the settlement stands even though it can no longer record
// the status itself. See the divergence note on the server helper.
function canActOnMohrSettlement(
  lawCase: LawCase,
  user: { id: string; role: string; departmentId?: string | null } | null,
): boolean {
  if (!user) return false;
  if (user.role === "branch_manager") return true;
  if (user.role === "department_head") return !!user.departmentId && lawCase.departmentId === user.departmentId;
  return lawCase.primaryLawyerId === user.id
    || lawCase.responsibleLawyerId === user.id
    || (Array.isArray(lawCase.assignedLawyers) && lawCase.assignedLawyers.includes(user.id));
}

export function CaseDetailsDialog({
  caseItem,
  open,
  onOpenChange,
  actions,
  onHearingPrompt,
  onClosed,
  initialTab,
}: {
  caseItem: LawCase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: CaseDetailsActions;
  onHearingPrompt?: (prompt: { caseId: string; hearingType: "تراضي" | "محكمة"; title: string; description: string }) => void;
  onClosed?: () => void;
  // Which tab to land on when the dialog opens. Omitted / null keeps the
  // existing default ("info"), so every current caller is unaffected. Used by
  // the مهامي follow-up deep-links whose action is a ROW in the الإجراءات tab
  // rather than a dialog of its own.
  initialTab?: string | null;
}) {
  const { updateCase, moveToNextStage, addComment, fetchComments, getCommentsByCaseId, refreshCases } = useCases();
  const { getClientName } = useClients();
  const { getDepartmentName } = useDepartments();
  const { user, users } = useAuth();
  const { getHearingsByCase } = useHearings();
  const { getMemosByCase } = useMemos();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // ---- Real stage history ----
  // BUGFIX. The LIST endpoint GET /api/cases STRIPS stageHistory (routes.ts:1622,
  // a payload optimisation), and cases-context's migrateCase then FABRICATES a
  // single entry ("تهجير البيانات") for the missing field (cases-context.tsx:48-50).
  // So any host that hands us a case off the list — which is what the cases page
  // does — was rendering ONE synthetic row in "سجل المراحل" instead of the real
  // history, and the actions tab's return-from-review blocks could never match.
  // The DETAIL endpoint GET /api/cases/:id keeps the full history, so we fetch it
  // when the dialog opens and graft ONLY that field onto the live case below.
  // Re-runs on updatedAt (every mutation bumps it) so the history stays current
  // after a stage transition. On failure we simply fall back to whatever the host
  // gave us — no worse than before.
  // Hearing opened from the الجلسات tab, rendered NESTED over this dialog by the
  // shared HearingDetailsDialog. Closing it returns the user to this dialog on the
  // same tab — nothing about this component's state is touched.
  const [hearingDetailId, setHearingDetailId] = useState<string | null>(null);

  const [fetchedHistory, setFetchedHistory] = useState<{ id: string; stageHistory: LawCase["stageHistory"] } | null>(null);
  useEffect(() => {
    if (!open || !caseItem?.id) return;
    const id = caseItem.id;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/cases/${id}`);
        const full: LawCase = await res.json();
        if (!cancelled) setFetchedHistory({ id, stageHistory: full.stageHistory });
      } catch {
        if (!cancelled) setFetchedHistory(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, caseItem?.id, caseItem?.updatedAt]);

  // The case we render: the LIVE row the host passed (so context mutations —
  // inline edits, stage transitions — keep re-rendering it exactly as before),
  // with the real stageHistory grafted on when we have it.
  // Named `selectedCase` so the moved JSX below stays byte-for-byte identical to
  // the version that lived in cases.tsx.
  const selectedCase: LawCase | null = caseItem && fetchedHistory && fetchedHistory.id === caseItem.id
    ? { ...caseItem, stageHistory: fetchedHistory.stageHistory }
    : caseItem;

  const lawyers = users.filter((u) => u.canBeAssignedCases);
  const getLawyerName = (id: string | null): string => {
    if (!id) return "-";
    const lawyer = lawyers.find((l) => l.id === id);
    return lawyer?.name || "-";
  };

  const [activeTab, setActiveTab] = useState("info");
  // Honour a caller-supplied landing tab on each OPEN (not on every render, so
  // the user can still switch tabs freely once inside). Falls back to "info"
  // when no tab was requested, which is what every non-deep-link caller gets.
  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab || "info");
  }, [open, initialTab]);
  const [newComment, setNewComment] = useState("");
  const [stageTransitioning, setStageTransitioning] = useState(false);
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>("");
  const [registrationDialogType, setRegistrationDialogType] = useState<"" | "taradi" | "mohr">("");
  const [registrationNumberInput, setRegistrationNumberInput] = useState("");
  const [caseAttachments, setCaseAttachments] = useState<Attachment[]>([]);
  const [attachmentForm, setAttachmentForm] = useState({ fileName: "", fileUrl: "" });
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);

  const fetchAttachments = async (caseId: string) => {
    setIsLoadingAttachments(true);
    try {
      const res = await apiRequest("GET", `/api/attachments/case/${caseId}`);
      if (res.ok) {
        const data = await res.json();
        setCaseAttachments(data);
      }
    } catch (e) {
      // attachment fetch failed silently
    } finally {
      setIsLoadingAttachments(false);
    }
  };

  const addAttachment = async () => {
    if (!selectedCase || !user || !attachmentForm.fileName.trim() || !attachmentForm.fileUrl.trim()) return;
    try {
      await apiRequest("POST", "/api/attachments", {
        entityType: "case",
        entityId: selectedCase.id,
        fileName: attachmentForm.fileName.trim(),
        fileUrl: attachmentForm.fileUrl.trim(),
        uploadedBy: user.id,
      });
      setAttachmentForm({ fileName: "", fileUrl: "" });
      fetchAttachments(selectedCase.id);
      toast({ title: "تم إضافة المرفق بنجاح" });
    } catch (e) {
      toast({ title: "فشل إضافة المرفق", variant: "destructive" });
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!selectedCase) return;
    try {
      await apiRequest("DELETE", `/api/attachments/${attachmentId}`);
      fetchAttachments(selectedCase.id);
      toast({ title: "تم حذف المرفق" });
    } catch (e) {
      toast({ title: "فشل حذف المرفق", variant: "destructive" });
    }
  };

  // Attachments + comments are loaded when the dialog OPENS for a case. On the
  // cases page these two fetches used to fire inside openDetailsDialog; they move
  // here with the state they feed, so any host (cases page or hub) gets the same
  // loaded dialog without having to remember to prime it.
  const openCaseId = open && selectedCase ? selectedCase.id : null;
  useEffect(() => {
    if (!openCaseId) return;
    fetchAttachments(openCaseId);
    fetchComments(openCaseId);
  }, [openCaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase-8 — surface the await reason / who / when in the awaiting
  // banner. The data lives only in case_activity_log (not on the case
  // row itself, unlike pauseReason), so we fetch the log when the
  // dialog opens for an awaiting case and pick the latest
  // await_completion entry.
  const [awaitInfo, setAwaitInfo] = useState<{ reason: string; userName: string; createdAt: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!open || !selectedCase?.id || !selectedCase.awaitingCompletion) {
      setAwaitInfo(null);
      return;
    }
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/cases/${selectedCase.id}/activity`);
        const json = await res.json();
        const rows: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        const latest = rows
          .filter((r) => r.actionType === "await_completion")
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        if (!cancelled && latest) {
          setAwaitInfo({
            reason: latest.details || "",
            userName: latest.userName || "",
            createdAt: latest.createdAt || "",
          });
        } else if (!cancelled) {
          setAwaitInfo(null);
        }
      } catch {
        if (!cancelled) setAwaitInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedCase?.id, selectedCase?.awaitingCompletion]);

  // Source-consultation lookup for the "أُنشئت من استشارة #X" back-link
  // on the case detail dialog. Fetched on demand by ID via the existing
  // GET /api/consultations/:id endpoint — a small per-open round-trip,
  // chosen over JOINing into /api/cases (would require a server change
  // and would pay the cost on every list response, not just on open).
  const [sourceConsultation, setSourceConsultation] = useState<{ id: string; consultationNumber: string } | null>(null);
  useEffect(() => {
    const sourceId = selectedCase ? (selectedCase.convertedFromConsultationId as string | null) : null;
    if (!sourceId) {
      setSourceConsultation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", `/api/consultations/${sourceId}`);
        const data = await res.json();
        if (!cancelled) {
          setSourceConsultation({ id: data.id, consultationNumber: data.consultationNumber });
        }
      } catch {
        if (!cancelled) setSourceConsultation(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCase?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setActiveTab("info"); setHearingDetailId(null); } }}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>تفاصيل القضية <LtrInline>{selectedCase?.caseNumber}</LtrInline></DialogTitle>
              {selectedCase && actions?.canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-edit-from-details"
                  onClick={() => { onOpenChange(false); actions.onEdit(); }}
                >
                  <Pencil className="w-4 h-4 ml-2" />
                  تعديل البيانات
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedCase && (
            <div className="space-y-6">
              {/* Phase-8 — awaiting-completion banner. Surfaces savedStage
                  so the user knows where they'll return on resume. */}
              {selectedCase.awaitingCompletion && !isCasePaused(selectedCase) && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                  data-testid="banner-case-awaiting"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    هذه القضية بانتظار استكمال البيانات
                  </div>
                  {/* Phase-8 — reason / who / when from case_activity_log
                      (loaded into awaitInfo by the useEffect above). */}
                  {awaitInfo?.reason && (
                    <div className="mt-1">
                      السبب: <BidiText>{awaitInfo.reason}</BidiText>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-amber-700/80">
                    {awaitInfo?.userName && (
                      <>بواسطة <BidiText>{awaitInfo.userName}</BidiText></>
                    )}
                    {awaitInfo?.createdAt && (
                      <>
                        {awaitInfo.userName ? " — " : ""}
                        في <LtrInline>{new Date(awaitInfo.createdAt).toISOString().slice(0, 10)}</LtrInline>
                      </>
                    )}
                  </div>
                  {selectedCase.savedStage && (
                    <div className="mt-1 text-xs">
                      ستعود إلى: <BidiText>{getStageLabel(selectedCase.savedStage as CaseStageValue)}</BidiText>
                    </div>
                  )}
                  {/* The client never responded → close. Lives INSIDE the banner
                      so the escape hatch sits with the state it escapes from,
                      rather than as a third amber box. The Path-A counterpart
                      (case at the stage with the latch off, so this banner does
                      not render) is the standalone strip below. */}
                  {actions?.canCloseNoResponse && (
                    <div className="mt-2 pt-2 border-t border-amber-500/30">
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid="button-close-no-response-banner"
                        onClick={() => { onOpenChange(false); actions.onCloseNoResponse(); }}
                      >
                        <Archive className="w-4 h-4 ml-2" />
                        إغلاق لعدم استكمال البيانات
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {/* PATH A — the case reached استكمال_البيانات by the ordinary
                  استلام advance, so awaitingCompletion is FALSE and the banner
                  above does not render. This is the COMMON path, and the action
                  must be reachable from the dialog there too. Rendered only when
                  that banner is absent, so exactly one box shows either way. */}
              {actions?.canCloseNoResponse && !selectedCase.awaitingCompletion && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 flex items-center justify-between gap-3 flex-wrap"
                  data-testid="banner-case-data-completion"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    القضية في مرحلة استكمال المرفقات والبيانات
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    data-testid="button-close-no-response-strip"
                    onClick={() => { onOpenChange(false); actions.onCloseNoResponse(); }}
                  >
                    <Archive className="w-4 h-4 ml-2" />
                    إغلاق لعدم استكمال البيانات
                  </Button>
                </div>
              )}
              {/* Phase-8 — paused banner. Renders at the top of the details
                  dialog when the case is paused so reason / who / when is
                  visible without scrolling. */}
              {isCasePaused(selectedCase) && (
                <div
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"
                  data-testid="banner-case-paused"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Pause className="w-4 h-4" />
                    هذه القضية معلّقة
                  </div>
                  {selectedCase.pauseReason && (
                    <div className="mt-1">
                      السبب: <BidiText>{selectedCase.pauseReason}</BidiText>
                    </div>
                  )}
                  <div className="mt-1 text-xs text-amber-700/80">
                    {selectedCase.pausedBy && (
                      <>بواسطة <BidiText>{getLawyerName(selectedCase.pausedBy)}</BidiText></>
                    )}
                    {selectedCase.pausedAt && (
                      <>
                        {selectedCase.pausedBy ? " — " : ""}
                        في <LtrInline>{new Date(selectedCase.pausedAt).toISOString().slice(0, 10)}</LtrInline>
                      </>
                    )}
                  </div>
                </div>
              )}
              {sourceConsultation && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary hover-elevate rounded px-2 py-1 -mx-2"
                  onClick={() => setLocation(`/consultations?openConsultation=${sourceConsultation.id}`)}
                  data-testid="link-go-to-source-consultation"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  أُنشئت من استشارة <LtrInline>#{sourceConsultation.consultationNumber}</LtrInline>
                </button>
              )}
              {selectedCase.caseClassification === CaseClassification.IN_COURT &&
               selectedCase.nextHearingDate &&
               new Date(selectedCase.nextHearingDate) > new Date() && (
                <div className="flex items-start gap-3 rounded-lg border border-orange-500/60 bg-orange-500/10 px-4 py-3 text-orange-700 dark:text-orange-400" dir="rtl">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-sm font-semibold">
                    هذه القضية منظورة وفيها جلسة قادمة بتاريخ{" "}
                    <span className="font-bold">
                      <DualDateDisplay date={selectedCase.nextHearingDate} compact />
                    </span>
                  </p>
                </div>
              )}
              {(selectedCase.currentStage === "قيد_التدقيق_في_تراضي" ||
                selectedCase.currentStage === "قيد_التدقيق_في_ناجز" ||
                selectedCase.currentStage === "قيد_التدقيق_في_معين") && (
                <div
                  className="bg-indigo-50 dark:bg-indigo-950/30 border-2 border-indigo-400 dark:border-indigo-800 rounded-lg p-4 mb-4 shadow-sm"
                  dir="rtl"
                  data-testid="banner-platform-review-notes"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-bold text-indigo-900 dark:text-indigo-200 mb-1">
                        {selectedCase.currentStage === "قيد_التدقيق_في_تراضي"
                          ? "ملاحظات منصة تراضي"
                          : selectedCase.currentStage === "قيد_التدقيق_في_ناجز"
                          ? "ملاحظات منصة ناجز"
                          : "ملاحظات منصة معين"}
                      </h4>
                      {(() => {
                        const notes = selectedCase.platformReviewNotes;
                        const resubmitted = !!selectedCase.platformReviewResubmitted;
                        if (notes && String(notes).trim()) {
                          return (
                            <>
                              <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-2 font-semibold">
                                حالة الطلب: يوجد ملاحظات — بحاجة لاستكمال
                              </p>
                              <p className="text-sm text-indigo-900 dark:text-indigo-200 whitespace-pre-wrap">{notes}</p>
                            </>
                          );
                        }
                        if (resubmitted) {
                          return (
                            <p className="text-xs text-indigo-700 dark:text-indigo-300">
                              حالة الطلب: تم إعادة التقديم — بانتظار رد المنصة
                            </p>
                          );
                        }
                        return (
                          <p className="text-xs text-indigo-700 dark:text-indigo-300">
                            حالة الطلب: بانتظار رد المنصة
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold mb-4 text-center">مراحل القضية</h4>
                <CaseStagePanel
                  caseItem={selectedCase}
                  onHearingPrompt={onHearingPrompt}
                  onClosed={onClosed}
                />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9">
                  <TabsTrigger value="info" data-testid="tab-info">المعلومات</TabsTrigger>
                  <TabsTrigger value="hearings" data-testid="tab-hearings">الجلسات</TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">سجل المراحل</TabsTrigger>
                  <TabsTrigger value="attachments" data-testid="tab-attachments">المرفقات</TabsTrigger>
                  <TabsTrigger value="comments" data-testid="tab-comments">التعليقات</TabsTrigger>
                  <TabsTrigger value="activity" data-testid="tab-activity">النشاط</TabsTrigger>
                  <TabsTrigger value="notes" data-testid="tab-notes">ملاحظات</TabsTrigger>
                  <TabsTrigger value="deadlines" data-testid="tab-deadlines">مواعيد</TabsTrigger>
                  <TabsTrigger value="actions" data-testid="tab-actions">الإجراءات</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                    <div>
                      <Label className="text-muted-foreground">العميل</Label>
                      <p className="font-medium"><BidiText>{getClientName(selectedCase.clientId)}</BidiText></p>
                    </div>
                    {selectedCase.plaintiffName && (
                      <div>
                        <Label className="text-muted-foreground">اسم المدعي</Label>
                        <p className="font-medium"><BidiText>{selectedCase.plaintiffName}</BidiText></p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">الخصم</Label>
                      <p className="font-medium"><BidiText>{selectedCase.opponentName || "-"}</BidiText></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المحامي المسؤول</Label>
                      <p className="font-medium">{getLawyerName(selectedCase.responsibleLawyerId || selectedCase.primaryLawyerId)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">النوع</Label>
                      <p>{selectedCase.caseType || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الأولوية</Label>
                      <div><Badge className={getPriorityColor(selectedCase.priority)}>{selectedCase.priority}</Badge></div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">القسم</Label>
                      <p>{selectedCase.departmentId === "أخرى" ? (selectedCase.departmentOther || "أخرى") : getDepartmentName(selectedCase.departmentId)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المحكمة</Label>
                      <p>{selectedCase.courtName || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">رقم القضية</Label>
                      <p><LtrInline>{selectedCase.caseNumber || "-"}</LtrInline></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الدائرة</Label>
                      <p><LtrInline>{selectedCase.circuitNumber || "-"}</LtrInline></p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">القاضي</Label>
                      <p>{selectedCase.judgeName || "-"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">موعد الجلسة القادمة</Label>
                      <p className="font-medium">
                        {(() => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const upcoming = getHearingsByCase(selectedCase.id)
                            .filter((h) => {
                              if (!h.hearingDate) return false;
                              const d = new Date(h.hearingDate);
                              return !isNaN(d.getTime()) && d >= today;
                            })
                            .sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime())[0];
                          return upcoming ? <DualDateDisplay date={upcoming.hearingDate} compact /> : "-";
                        })()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">آخر جلسة</Label>
                      <p className="font-medium">
                        {selectedCase.lastHearingDate
                          ? <DualDateDisplay date={selectedCase.lastHearingDate} compact />
                          : "-"}
                      </p>
                    </div>
                    {selectedCase.responseDeadline && (
                      <div>
                        <Label className="text-muted-foreground">مهلة الرد</Label>
                        <p className="font-medium">
                          <DualDateDisplay date={selectedCase.responseDeadline} compact />
                        </p>
                      </div>
                    )}
                    {getHearingsByCase(selectedCase.id).some(h => h.opponentResponseRequired) && (
                      <div>
                        <Label className="text-muted-foreground">رد الخصم</Label>
                        <Badge variant="outline" className="mt-1 border-orange-500 text-orange-600 dark:text-orange-400">
                          مطلوب رد من الخصم
                        </Badge>
                      </div>
                    )}
                    {selectedCase.taradiNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم الطلب في تراضي</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.taradiNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.najizNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم القيد في ناجز</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.najizNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.moeenNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم القيد في معين</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.moeenNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.mohrNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم التسوية</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.mohrNumber}</LtrInline></p>
                      </div>
                    )}
                    {selectedCase.executionRequestNumber && (
                      <div>
                        <Label className="text-muted-foreground">رقم طلب التنفيذ</Label>
                        <p className="font-medium"><LtrInline>{selectedCase.executionRequestNumber}</LtrInline></p>
                      </div>
                    )}
                    {(selectedCase.currentStage === "قيد_التدقيق_في_تراضي" ||
                      selectedCase.currentStage === "قيد_التدقيق_في_ناجز" ||
                      selectedCase.currentStage === "قيد_التدقيق_في_معين") && (
                      <div>
                        <Label className="text-muted-foreground">حالة الطلب في المنصة</Label>
                        <p className="font-medium">
                          {(() => {
                            const notes = selectedCase.platformReviewNotes;
                            const resubmitted = !!selectedCase.platformReviewResubmitted;
                            if (notes && String(notes).trim()) {
                              return <span className="text-amber-700">يوجد ملاحظات — بحاجة لاستكمال</span>;
                            }
                            if (resubmitted) {
                              return <span className="text-blue-700">تم إعادة التقديم — بانتظار رد المنصة</span>;
                            }
                            return <span className="text-muted-foreground">بانتظار رد المنصة</span>;
                          })()}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">بيانات الخصم</h4>
                    <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                      <div>
                        <Label className="text-muted-foreground">اسم الخصم</Label>
                        <p><BidiText>{selectedCase.opponentName || "-"}</BidiText></p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">هاتف الخصم</Label>
                        <p><LtrInline>{selectedCase.opponentPhone || "-"}</LtrInline></p>
                      </div>
                    </div>
                  </div>
                  
                  {selectedCase.currentStage === "مراجعة_داخلية" && selectedCase.internalReviewerId && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-2">المراجع الداخلي</h4>
                      <p className="p-3 bg-muted rounded-md">
                        {users.find(u => u.id === selectedCase.internalReviewerId)?.name || "غير معروف"}
                      </p>
                    </div>
                  )}

                  {selectedCase.reviewNotes && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 text-destructive">ملاحظات المراجعة</h4>
                      <p className="p-3 bg-destructive/10 rounded-md text-destructive">
                        {selectedCase.reviewNotes}
                      </p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                      <div>
                        <Label className="text-muted-foreground">صفة العميل</Label>
                        <p className="font-medium">{(() => {
                          const label = getClientRoleLabel(selectedCase.caseClassification, selectedCase.clientRole);
                          return label;
                        })()}</p>
                      </div>
                    </div>
                  </div>

                  {selectedCase.currentStage === "مشطوبة" && selectedCase.struckOffReopenDeadline && (
                    <div className="border-t pt-4">
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                        <div>
                          <span className="text-sm font-medium text-red-700 dark:text-red-400">القضية مشطوبة</span>
                          <p className="text-xs text-red-600 dark:text-red-400">
                            الموعد النهائي لإعادة القيد: {selectedCase.struckOffReopenDeadline}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.currentStage === "مقفلة" && selectedCase.closureReason && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سبب الإغلاق</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">السبب</Label>
                          {/* KEPT — this is the DETAIL view; the stage badge is the
                              at-a-glance version and shows a truncated form of the
                              same thing. Label source switched from a naive
                              underscore-replace to the shared ClosureReasonLabels so
                              the two can never drift; an unrecognised value (the
                              scheduler writes a free-text sentence) still falls back
                              to the raw string, untruncated here. */}
                          <p className="font-medium">{selectedCase.closureReason === "أخرى"
                            ? selectedCase.closureReasonOther || ClosureReasonLabels["أخرى"]
                            : (ClosureReasonLabels[selectedCase.closureReason as ClosureReasonValue] ?? selectedCase.closureReason)}</p>
                          {/* closureReasonOther used to render ONLY under أخرى,
                              which would have silently swallowed the missing-data
                              text that close-no-response writes there. Now shown
                              for ANY non-empty value on a non-أخرى reason — أخرى
                              keeps rendering it as the reason ITSELF above, so
                              this must not repeat it. Nothing else writes the
                              column on a non-أخرى closure today, so no existing
                              closed case gains a line. */}
                          {selectedCase.closureReason !== "أخرى"
                            && !!String(selectedCase.closureReasonOther || "").trim() && (
                            <p className="text-sm text-muted-foreground mt-1">
                              <BidiText>{selectedCase.closureReasonOther}</BidiText>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.grievanceRequired && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">بيانات التظلم</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">مطلوب تظلم</Label>
                          <p className="font-medium">نعم</p>
                        </div>
                        {selectedCase.grievanceDate && (
                          <div>
                            <Label className="text-muted-foreground">تاريخ التظلم</Label>
                            <p className="font-medium">{selectedCase.grievanceDate}</p>
                          </div>
                        )}
                        {selectedCase.grievanceResult && (
                          <div>
                            <Label className="text-muted-foreground">نتيجة التظلم</Label>
                            <p className="font-medium">{selectedCase.grievanceResult}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.UNDER_STUDY && selectedCase.caseType === "إداري" && selectedCase.adminCaseSubType && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">تفاصيل القضية الإدارية</h4>
                      <div className="grid grid-cols-2 gap-4 [&>div]:text-right">
                        <div>
                          <Label className="text-muted-foreground">نوع القضية</Label>
                          <p className="font-medium">{selectedCase.adminCaseSubType === "تظلم" ? "تظلم" : "قضية"}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">تاريخ التقادم</Label>
                          <p className="font-medium">{selectedCase.prescriptionDate ? <DualDateDisplay date={selectedCase.prescriptionDate} compact /> : "-"}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.UNDER_STUDY && getDepartmentName(selectedCase.departmentId || "") === "تجاري" && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سير عمل منصة تراضي</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Badge variant={selectedCase.taradiStatus === "مقيدة_في_تراضي" ? "default" : selectedCase.taradiStatus === "تم_الصلح" ? "default" : selectedCase.taradiStatus === "لم_يتم_صلح" ? "destructive" : "secondary"}>
                            {selectedCase.taradiStatus ? ({
                              "مقيدة_في_تراضي": "مقيدة في تراضي",
                              "تم_الصلح": "تم الصلح",
                              "لم_يتم_صلح": "لم يتم صلح",
                            } as Record<string, string>)[selectedCase.taradiStatus] : "لم تقيد بعد"}
                          </Badge>
                          {selectedCase.taradiNumber && <span className="text-sm text-muted-foreground">رقم: {selectedCase.taradiNumber}</span>}
                        </div>
                        {!selectedCase.taradiStatus && (
                          registrationDialogType === "taradi" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input value={registrationNumberInput} onChange={e => setRegistrationNumberInput(e.target.value)} placeholder="رقم الطلب في تراضي (اختياري)" className="h-8 text-sm" data-testid="input-taradi-registration" autoFocus />
                              <Button size="sm" data-testid="button-confirm-taradi" onClick={async () => {
                                try {
                                  const res = await apiRequest("PATCH", `/api/cases/${selectedCase.id}/taradi`, { status: "مقيدة_في_تراضي", taradiNumber: registrationNumberInput });
                                  if (res.ok) { toast({ title: "تم التقييد في تراضي" }); setRegistrationDialogType(""); setRegistrationNumberInput(""); await updateCase(selectedCase.id, { taradiStatus: "مقيدة_في_تراضي", ...(registrationNumberInput ? { taradiNumber: registrationNumberInput } : {}) }); }
                                } catch (e) {
                                  // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                  // would otherwise surface as an unhandled promise rejection in console.
                                  // Future: surface an error toast (beyond Batch 2B scope).
                                }
                              }}>تأكيد</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setRegistrationDialogType(""); setRegistrationNumberInput(""); }}>إلغاء</Button>
                            </div>
                          ) : (
                            <Button size="sm" data-testid="button-register-taradi" onClick={() => { setRegistrationDialogType("taradi"); setRegistrationNumberInput(""); }}>
                              تقييد في منصة تراضي
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.UNDER_STUDY && getDepartmentName(selectedCase.departmentId || "") === "عمالي" && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">سير عمل وزارة الموارد البشرية</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Badge variant={selectedCase.mohrStatus === "انتهت_التسوية" ? "destructive" : selectedCase.mohrStatus ? "default" : "secondary"}>
                            {selectedCase.mohrStatus ? ({
                              "مقيدة_في_الموارد": "مقيدة في وزارة الموارد البشرية",
                              "توجيه_تسوية_ودية": "تم توجيه العميل للتسوية الودية",
                              "انتهت_التسوية": "انتهت التسوية - جاهزة للرفع",
                            } as Record<string, string>)[selectedCase.mohrStatus] : "لم تقيد بعد"}
                          </Badge>
                          {selectedCase.mohrNumber && <span className="text-sm text-muted-foreground">رقم: {selectedCase.mohrNumber}</span>}
                        </div>
                        {canActOnMohrSettlement(selectedCase, user) && !selectedCase.mohrStatus && (
                          registrationDialogType === "mohr" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input value={registrationNumberInput} onChange={e => setRegistrationNumberInput(e.target.value)} placeholder="رقم الطلب في الموارد البشرية (اختياري)" className="h-8 text-sm" data-testid="input-mohr-registration" autoFocus />
                              <Button size="sm" data-testid="button-confirm-mohr" onClick={async () => {
                                try {
                                  const res = await apiRequest("PATCH", `/api/cases/${selectedCase.id}/mohr`, { status: "مقيدة_في_الموارد", mohrNumber: registrationNumberInput });
                                  // The endpoint already persisted mohrStatus + mohrNumber; just
                                  // resync. (The old follow-up updateCase re-sent mohrStatus through
                                  // PATCH /api/cases/:id, which now 400s — see the C3 block there.)
                                  if (res.ok) { toast({ title: "تم التقييد في وزارة الموارد البشرية" }); setRegistrationDialogType(""); setRegistrationNumberInput(""); await refreshCases(); }
                                } catch (e) {
                                  // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                  // would otherwise surface as an unhandled promise rejection in console.
                                  // Future: surface an error toast (beyond Batch 2B scope).
                                }
                              }}>تأكيد</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setRegistrationDialogType(""); setRegistrationNumberInput(""); }}>إلغاء</Button>
                            </div>
                          ) : (
                          <Button
                            size="sm"
                            data-testid="button-register-mohr"
                            onClick={() => { setRegistrationDialogType("mohr"); setRegistrationNumberInput(""); }}
                          >
                            تقييد في وزارة الموارد البشرية
                          </Button>
                          )
                        )}
                        {canActOnMohrSettlement(selectedCase, user) && selectedCase.mohrStatus === "مقيدة_في_الموارد" && (
                          <Button
                            size="sm"
                            data-testid="button-direct-settlement"
                            onClick={async () => {
                              try {
                                const res = await apiRequest("POST", `/api/cases/${selectedCase.id}/direct-settlement`, {});
                                if (res.ok) { toast({ title: "تم توجيه العميل للتسوية الودية - سيتم إشعار الدعم الإداري" }); await refreshCases(); }
                              } catch (e) {
                                // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                // would otherwise surface as an unhandled promise rejection in console.
                                // Future: surface an error toast (beyond Batch 2B scope).
                              }
                            }}
                          >
                            توجيه العميل لرفعها في التسوية الودية
                          </Button>
                        )}
                        {canActOnMohrSettlement(selectedCase, user) && selectedCase.mohrStatus === "توجيه_تسوية_ودية" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            data-testid="button-settlement-ended"
                            onClick={async () => {
                              try {
                                const res = await apiRequest("PATCH", `/api/cases/${selectedCase.id}/mohr`, { status: "انتهت_التسوية" });
                                if (res.ok) { toast({ title: "تم تسجيل انتهاء التسوية - سيتم إشعار القسم لاستكمال الدراسة والرفع" }); await refreshCases(); }
                              } catch (e) {
                                // Preserve current silent-failure behavior — apiRequest's throw on non-2xx
                                // would otherwise surface as an unhandled promise rejection in console.
                                // Future: surface an error toast (beyond Batch 2B scope).
                              }
                            }}
                          >
                            انتهاء مرحلة التسوية الودية
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {CaseStagesOrder.indexOf(selectedCase.currentStage) >= CaseStagesOrder.indexOf(CaseStage.READY_TO_SUBMIT) && (
                    selectedCase.caseType === "تجاري" || selectedCase.caseType === "عمالي"
                  ) && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 flex-row-reverse">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        أرقام الطلبات - جاهزة للرفع
                      </h4>
                      <div className="grid grid-cols-2 gap-4" dir="rtl">
                        {selectedCase.caseType === "تجاري" && (
                          <div className="text-right">
                            <Label className="text-muted-foreground block text-right">رقم الطلب في منصة تراضي</Label>
                            {selectedCase.taradiStatus === "تم_الصلح" || selectedCase.taradiStatus === "لم_يتم_صلح" ? (
                              <p className="font-medium mt-1">{selectedCase.taradiNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                            ) : (
                              <div className="flex items-center gap-2 mt-1 justify-end">
                                {inlineEditField === `taradi-${selectedCase.id}` ? (
                                  <>
                                    <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-taradi-number"
                                      onKeyDown={async e => {
                                        if (e.key === "Enter") { await updateCase(selectedCase.id, { taradiNumber: inlineEditValue }); setInlineEditField(null); }
                                        else if (e.key === "Escape") setInlineEditField(null);
                                      }} />
                                    <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { taradiNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                    <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-medium">{selectedCase.taradiNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                    <Button variant="ghost" size="sm" data-testid="button-edit-taradi-number" onClick={() => { setInlineEditField(`taradi-${selectedCase.id}`); setInlineEditValue(selectedCase.taradiNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {selectedCase.caseType === "عمالي" && (
                          <div className="text-right">
                            <Label className="text-muted-foreground block text-right">رقم الطلب في ناجز / معين</Label>
                            <div className="flex items-center gap-2 mt-1 justify-end">
                              {inlineEditField === `najiz-${selectedCase.id}` ? (
                                <>
                                  <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-najiz-number"
                                    onKeyDown={async e => {
                                      if (e.key === "Enter") { await updateCase(selectedCase.id, { najizNumber: inlineEditValue }); setInlineEditField(null); }
                                      else if (e.key === "Escape") setInlineEditField(null);
                                    }} />
                                  <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { najizNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                                </>
                              ) : (
                                <>
                                  <p className="font-medium">{selectedCase.najizNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                  <Button variant="ghost" size="sm" data-testid="button-edit-najiz-number" onClick={() => { setInlineEditField(`najiz-${selectedCase.id}`); setInlineEditValue(selectedCase.najizNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                                </>
                              )}
                            </div>
                            {selectedCase.mohrStatus === "انتهت_التسوية" && (
                              <p className="text-xs text-amber-600 mt-1">انتهت مرحلة التسوية الودية - القضية جاهزة للرفع في المحكمة</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCase.caseClassification === CaseClassification.IN_COURT && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2 flex-row-reverse">
                        <span className="w-2 h-2 rounded-full bg-violet-500 inline-block"></span>
                        بيانات ما بعد التقييد
                      </h4>
                      <div className="grid grid-cols-2 gap-4" dir="rtl">
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">رقم القضية</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `court-${selectedCase.id}` ? (
                              <>
                                <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-court-case-number"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { courtCaseNumber: inlineEditValue }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { courtCaseNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.courtCaseNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-court-case-number" onClick={() => { setInlineEditField(`court-${selectedCase.id}`); setInlineEditValue(selectedCase.courtCaseNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                        {/* رقم طلب التنفيذ — captured (mandatory) when the EXECUTION
                            post-judgment task is completed, and correctable here
                            afterwards. Mirrors the courtCaseNumber field above
                            field-for-field: same inline-edit idiom, same
                            updateCase path, so the same PATCH /api/cases/:id
                            permission (canModifyCase) gates it. */}
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">رقم طلب التنفيذ</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `execution-${selectedCase.id}` ? (
                              <>
                                <Input value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-32" autoFocus data-testid="input-execution-request-number"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { executionRequestNumber: inlineEditValue }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { executionRequestNumber: inlineEditValue }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.executionRequestNumber || <span className="text-muted-foreground text-sm italic">غير مُضاف</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-execution-request-number" onClick={() => { setInlineEditField(`execution-${selectedCase.id}`); setInlineEditValue(selectedCase.executionRequestNumber || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <Label className="text-muted-foreground block text-right">موعد الجلسة القادمة</Label>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {inlineEditField === `hearing-${selectedCase.id}` ? (
                              <>
                                <Input type="date" value={inlineEditValue} onChange={e => setInlineEditValue(e.target.value)} className="h-7 text-sm w-36" autoFocus data-testid="input-next-hearing-date"
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") { await updateCase(selectedCase.id, { nextHearingDate: inlineEditValue || null }); setInlineEditField(null); }
                                    else if (e.key === "Escape") setInlineEditField(null);
                                  }} />
                                <Button variant="ghost" size="sm" onClick={async () => { await updateCase(selectedCase.id, { nextHearingDate: inlineEditValue || null }); setInlineEditField(null); }}><Check className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => setInlineEditField(null)}><X className="w-3 h-3" /></Button>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{selectedCase.nextHearingDate ? <DualDateDisplay date={selectedCase.nextHearingDate} compact /> : <span className="text-muted-foreground text-sm italic">غير محدد</span>}</p>
                                <Button variant="ghost" size="sm" data-testid="button-edit-next-hearing-date" onClick={() => { setInlineEditField(`hearing-${selectedCase.id}`); setInlineEditValue(selectedCase.nextHearingDate || ""); }}><Pencil className="w-3 h-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>تاريخ الإنشاء: <DualDateDisplay date={selectedCase.createdAt} compact /></span>
                      <span>آخر تحديث: <DualDateDisplay date={selectedCase.updatedAt} compact /></span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="hearings" className="mt-4">
                  {(() => {
                    const caseHearings = getHearingsByCase(selectedCase.id);
                    // Add-hearing is restricted to branch_manager and
                    // admin_support only — dept_heads do not get this
                    // button per product feedback (they coordinate
                    // hearings through the global Hearings page).
                    const canAddHearing =
                      !!user && (user.role === "branch_manager" || user.role === "admin_support");
                    return (
                      <div className="space-y-3">
                        {canAddHearing && (
                          <div className="flex justify-start">
                            <Button
                              size="sm"
                              data-testid="button-add-hearing-from-case"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  action: "create",
                                  caseId: selectedCase.id,
                                });
                                setLocation(`/hearings?${params.toString()}`);
                              }}
                            >
                              <Plus className="w-4 h-4 ml-1" />
                              إضافة جلسة
                            </Button>
                          </div>
                        )}
                        {caseHearings.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">لا توجد جلسات مسجلة لهذه القضية</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-right">التاريخ</TableHead>
                                <TableHead className="text-right">الوقت</TableHead>
                                <TableHead className="text-right">المحكمة</TableHead>
                                <TableHead className="text-right">الحالة</TableHead>
                                <TableHead className="text-center w-[60px]">إجراءات</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {caseHearings.map((hearing) => (
                                <TableRow key={hearing.id}>
                                  <TableCell><DualDateDisplay date={hearing.hearingDate} compact /></TableCell>
                                  <TableCell><LtrInline>{formatTimeAmPm(hearing.hearingTime)}</LtrInline></TableCell>
                                  <TableCell>{hearing.courtName}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{hearing.status}</Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="عرض تفاصيل الجلسة"
                                      data-testid={`button-view-hearing-${hearing.id}`}
                                      // Opens the hearing IN PLACE, over this dialog.
                                      // Was setLocation("/hearings?openHearing=…"),
                                      // a wouter route push that navigated the whole
                                      // app away from the case being read.
                                      onClick={() => setHearingDetailId(hearing.id)}
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {selectedCase.stageHistory && selectedCase.stageHistory.length > 0 ? (
                    <div className="space-y-3">
                      {[...selectedCase.stageHistory].reverse().map((transition, index) => (
                        <div key={index} className="flex items-start gap-4 p-3 border rounded-lg">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {selectedCase.stageHistory.length - index}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{CaseStageLabels[transition.stage] || transition.stage}</p>
                            <div className="text-sm text-muted-foreground">
                              <span>{transition.userName}</span>
                              <span className="mx-2">•</span>
                              <DualDateDisplay date={transition.timestamp} showTime compact />
                            </div>
                            {transition.notes && (
                              <p className="mt-1 text-sm bg-muted p-2 rounded">{transition.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">لا يوجد سجل للمراحل</p>
                  )}
                </TabsContent>

                <TabsContent value="attachments" className="mt-4">
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4 space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Paperclip className="w-4 h-4" />
                        إضافة مرفق جديد
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>اسم الملف</Label>
                          <SmartInput
                            inputType="text"
                            data-testid="input-attachment-name"
                            placeholder="مثال: عقد التأسيس"
                            value={attachmentForm.fileName}
                            onChange={(e) => setAttachmentForm({ ...attachmentForm, fileName: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>رابط الملف (URL)</Label>
                          <SmartInput
                            inputType="code"
                            data-testid="input-attachment-url"
                            placeholder="https://drive.google.com/..."
                            value={attachmentForm.fileUrl}
                            onChange={(e) => setAttachmentForm({ ...attachmentForm, fileUrl: e.target.value })}
                          />
                        </div>
                      </div>
                      <Button
                        data-testid="button-add-attachment"
                        onClick={addAttachment}
                        disabled={!attachmentForm.fileName.trim() || !attachmentForm.fileUrl.trim()}
                        size="sm"
                      >
                        <Plus className="w-4 h-4 ml-2" />
                        إضافة مرفق
                      </Button>
                    </div>

                    {isLoadingAttachments ? (
                      <p className="text-center text-muted-foreground py-4">جارٍ تحميل المرفقات...</p>
                    ) : caseAttachments.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">لا توجد مرفقات</p>
                    ) : (
                      <div className="space-y-2">
                        {caseAttachments.map((att) => (
                          <div key={att.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`attachment-item-${att.id}`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{att.fileName}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                  <span>{users.find(u => u.id === att.uploadedBy)?.name || "غير معروف"}</span>
                                  <span>-</span>
                                  <DualDateDisplay date={att.createdAt} showTime compact />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-open-attachment-${att.id}`}
                                onClick={() => window.open(att.fileUrl, "_blank")}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-delete-attachment-${att.id}`}
                                onClick={() => deleteAttachment(att.id)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="comments" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Textarea
                        data-testid="input-new-comment"
                        placeholder="اكتب تعليقك هنا..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        rows={2}
                        className="flex-1"
                      />
                      <Button
                        data-testid="button-add-comment"
                        onClick={async () => {
                          if (!user || !newComment.trim()) {
                            return;
                          }
                          try {
                            await addComment(selectedCase.id, user.id, user.name, newComment.trim());
                            setNewComment("");
                            toast({ title: "تم إضافة التعليق" });
                          } catch (err) {
                            // eslint-disable-next-line no-console
                            console.error("[add-comment] failed", err);
                            toast({
                              title: "تعذّر إضافة التعليق",
                              description: extractApiError(err),
                              variant: "destructive",
                            });
                          }
                        }}
                        disabled={!newComment.trim()}
                      >
                        إضافة
                      </Button>
                    </div>
                    
                    {(() => {
                      const caseComments = getCommentsByCaseId(selectedCase.id);
                      if (caseComments.length === 0) {
                        return <p className="text-muted-foreground text-center py-4">لا توجد تعليقات</p>;
                      }
                      return (
                        <div className="space-y-3">
                          {caseComments.map((comment) => (
                            <div key={comment.id} className="p-3 border rounded-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-medium">{comment.userName}</span>
                                <span className="text-xs text-muted-foreground">
                                  <DualDateDisplay date={comment.createdAt} showTime compact />
                                </span>
                              </div>
                              <p className="text-sm">{comment.content}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="mt-4">
                  <CaseActivityTab caseId={selectedCase?.id || ""} />
                </TabsContent>

                <TabsContent value="notes" className="mt-4 space-y-4">
                  {selectedCase?.platformReviewNotes &&
                    String(selectedCase.platformReviewNotes).trim() && (
                      <div
                        className="border border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-4"
                        dir="rtl"
                        data-testid="notes-tab-platform-review"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-indigo-700 dark:text-indigo-300 shrink-0" />
                          <h4 className="font-bold text-indigo-900 dark:text-indigo-200">ملاحظات المنصة</h4>
                        </div>
                        <p className="text-sm text-indigo-900 dark:text-indigo-200 whitespace-pre-wrap">
                          {selectedCase.platformReviewNotes}
                        </p>
                      </div>
                    )}
                  {selectedCase?.reviewNotes && selectedCase.reviewNotes.trim() && (() => {
                    const isCommittee = selectedCase.currentStage === "الأخذ_بالملاحظات";
                    const title = isCommittee ? "ملاحظات لجنة المراجعة" : "ملاحظات المراجعة الداخلية";
                    const history = selectedCase.stageHistory || [];
                    let reviewerName: string | undefined;
                    let timestamp: string | undefined;
                    if (isCommittee) {
                      const entry = [...history].reverse().find((h: any) => h.stage === "الأخذ_بالملاحظات");
                      reviewerName = entry?.userName;
                      timestamp = entry?.timestamp;
                    } else {
                      if (selectedCase.internalReviewerId) {
                        reviewerName = users.find(u => u.id === selectedCase.internalReviewerId)?.name;
                      }
                      const entry = [...history].reverse().find((h: any) => h.stage === "تحرير_صحيفة_الدعوى" || h.stage === "تحرير_صيغة_التظلم");
                      timestamp = entry?.timestamp;
                    }
                    return (
                      <div
                        className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4"
                        dir="rtl"
                        data-testid="notes-tab-review"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                          <h4 className="font-bold text-amber-900 dark:text-amber-200">{title}</h4>
                        </div>
                        {(reviewerName || timestamp) && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                            {reviewerName ? `المراجع: ${reviewerName}` : ""}
                            {timestamp ? ` — ${new Date(timestamp).toLocaleString("ar")}` : ""}
                          </p>
                        )}
                        <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{selectedCase.reviewNotes}</p>
                      </div>
                    );
                  })()}
                  <CaseNotesTab caseId={selectedCase?.id || ""} />
                </TabsContent>

                <TabsContent value="deadlines" className="mt-4">
                  <CaseDeadlinesTab
                    caseId={selectedCase?.id || ""}
                    hearings={selectedCase ? getHearingsByCase(selectedCase.id) : []}
                    memos={selectedCase ? getMemosByCase(selectedCase.id) : []}
                    responseDeadline={selectedCase?.responseDeadline ?? null}
                  />
                </TabsContent>

                <TabsContent value="actions" className="mt-4">
                  <div className="space-y-3">
                    {(() => {
                      const history = [...(selectedCase.stageHistory || [])].reverse();
                      // "إرجاع من المراجعة الداخلية" must only show when the case
                      // ACTUALLY went through internal review and came back. A
                      // drafting-stage history entry with notes alone is NOT
                      // sufficient — data migration writes an initial drafting
                      // entry (userName "النظام", notes "تهجير البيانات") that
                      // was being mislabeled as a return-from-review on cases
                      // that never entered review. Require a real internal-review
                      // stage (REVIEW_LOOP_STAGES) somewhere in the history.
                      const wentToInternalReview = (selectedCase.stageHistory || []).some(
                        (h: any) => REVIEW_LOOP_STAGES.has(h?.stage)
                      );
                      const internalEntry = wentToInternalReview
                        ? history.find((h: any) =>
                            (h.stage === "تحرير_صحيفة_الدعوى" || h.stage === "تحرير_صيغة_التظلم") &&
                            h.notes && String(h.notes).trim()
                          )
                        : null;
                      const committeeEntry = history.find((h: any) =>
                        h.stage === "الأخذ_بالملاحظات" && h.notes && String(h.notes).trim()
                      ) || (selectedCase.currentStage === "الأخذ_بالملاحظات" && selectedCase.reviewNotes
                        ? history.find((h: any) => h.stage === "الأخذ_بالملاحظات")
                        : null);
                      const blocks: Array<{ key: string; title: string; name: string; ts?: string; notes: string }> = [];
                      if (committeeEntry) {
                        blocks.push({
                          key: "committee",
                          title: "إرجاع من لجنة المراجعة",
                          name: committeeEntry.userName || "لجنة المراجعة",
                          ts: committeeEntry.timestamp,
                          notes: committeeEntry.notes || selectedCase.reviewNotes || "",
                        });
                      }
                      if (internalEntry) {
                        blocks.push({
                          key: "internal",
                          title: "إرجاع من المراجعة الداخلية",
                          name: internalEntry.userName || "المراجع الداخلي",
                          ts: internalEntry.timestamp,
                          notes: internalEntry.notes,
                        });
                      }
                      if (blocks.length === 0) return null;
                      return blocks.map((b) => (
                        <div
                          key={b.key}
                          className="border-r-4 border-amber-500 bg-amber-50 rounded-lg p-4"
                          dir="rtl"
                          data-testid={`actions-tab-${b.key}-review-timeline`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                            <span className="font-semibold text-amber-900 text-sm">{b.title}</span>
                          </div>
                          <p className="text-xs text-amber-700 mb-2">
                            {b.name}
                            {b.ts ? ` — ${new Date(b.ts).toLocaleString("ar")}` : ""}
                          </p>
                          <p className="text-sm text-amber-900 whitespace-pre-wrap">{b.notes}</p>
                        </div>
                      ));
                    })()}
                    {selectedCase.currentStage === "مداولة_الصلح" &&
                      user &&
                      (user.role === "admin_support" ||
                        user.role === "department_head" ||
                        user.role === "branch_manager" ||
                        selectedCase.primaryLawyerId === user.id ||
                        selectedCase.responsibleLawyerId === user.id) && (
                        <div className="p-3 rounded-lg border bg-card space-y-3">
                          <div>
                            <p className="font-medium text-sm">نتيجة مداولة الصلح</p>
                            <p className="text-xs text-muted-foreground">
                              حدد نتيجة الصلح — "تم الصلح" ينقل القضية إلى التحصيل
                              وينشئ مهمة تلقائية للدعم الإداري، و"لم يتم الصلح" يعيدها
                              إلى مسار المحكمة.
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              disabled={stageTransitioning}
                              data-testid={`button-settlement-reached-actions-${selectedCase.id}`}
                              onClick={async () => {
                                if (!user) return;
                                setStageTransitioning(true);
                                try {
                                  const success = await moveToNextStage(
                                    selectedCase.id,
                                    user.id,
                                    user.name,
                                    "تم الصلح في مداولة الصلح",
                                    user.role,
                                    undefined,
                                    undefined,
                                    undefined,
                                    "تحصيل",
                                  );
                                  if (success) {
                                    toast({ title: "تم نقل القضية إلى مرحلة التحصيل" });
                                  }
                                } finally {
                                  setStageTransitioning(false);
                                }
                              }}
                            >
                              <CheckCircle className="w-4 h-4 ml-1" />
                              تم الصلح — تحصيل
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                                  disabled={stageTransitioning}
                                  data-testid={`button-settlement-failed-actions-${selectedCase.id}`}
                                >
                                  <AlertTriangle className="w-4 h-4 ml-1" />
                                  لم يتم الصلح — إغلاق طلب الصلح
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                {/* DEFENDANT — no choice; mirrors the same branch in
                                    case-progress-bar.tsx. The opponent files in court,
                                    so the case closes and waits. closureReason is
                                    MANDATORY (early-close 400) and is PART B's key. */}
                                {selectedCase.isSettlementCase && selectedCase.clientRole === "مدعى_عليه" ? (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>لم يتم الصلح — قضية مدعى عليه</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        نحن مدعى عليهم: الخصم هو من يرفع الدعوى في المحكمة. ستُغلق القضية
                                        مع الاحتفاظ برقم التسوية وسجل المراحل، ويمكن إعادة فتحها لاحقاً
                                        عند رفع الخصم للدعوى بإدخال رقم الدعوى.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="gap-2">
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction
                                        data-testid={`button-settlement-failed-defendant-close-${selectedCase.id}`}
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح — إغلاق (مدعى عليه) بانتظار رفع الخصم للدعوى",
                                              user.role,
                                              undefined,
                                              undefined,
                                              { closureReason: "لم_يتم_الصلح" },
                                              "مقفلة",
                                            );
                                            if (success) {
                                              toast({ title: "تم إغلاق القضية بانتظار رفع الخصم للدعوى" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        تأكيد الإغلاق
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </>
                                ) : selectedCase.isSettlementCase ? (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>لم يتم الصلح — اختر الإجراء</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        هذه القضية بدأت من مرحلة مداولة الصلح. اختر:
                                        <br />
                                        <strong>إغلاق القضية نهائياً</strong> — تُغلق القضية ولا تستكمل في المحكمة.
                                        <br />
                                        <strong>استكمال إجراءاتها</strong> — تُحوَّل إلى مسار التقاضي العادي وتنتقل إلى مرحلة "أغلق طلب الصلح".
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="gap-2 flex-wrap">
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction
                                        data-testid={`button-settlement-failed-continue-${selectedCase.id}`}
                                        className="bg-blue-600 hover:bg-blue-700"
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح — استكمال الإجراءات",
                                              user.role,
                                              undefined,
                                              undefined,
                                              { isSettlementCase: false },
                                              "أغلق_طلب_الصلح",
                                            );
                                            if (success) {
                                              toast({ title: "تم تحويل القضية لمسار التقاضي العادي" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        استكمال إجراءاتها
                                      </AlertDialogAction>
                                      <AlertDialogAction
                                        data-testid={`button-settlement-failed-close-${selectedCase.id}`}
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح — إغلاق نهائي",
                                              user.role,
                                              undefined,
                                              undefined,
                                              undefined,
                                              "مقفلة",
                                            );
                                            if (success) {
                                              toast({ title: "تم إغلاق القضية" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        إغلاق القضية نهائياً
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </>
                                ) : (
                                  <>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>تأكيد: لم يتم الصلح</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        سيتم نقل القضية إلى مرحلة <strong>أغلق طلب الصلح</strong> لاستئناف مسار التقاضي في المحكمة.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="gap-2">
                                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={async () => {
                                          if (!user) return;
                                          setStageTransitioning(true);
                                          try {
                                            const success = await moveToNextStage(
                                              selectedCase.id,
                                              user.id,
                                              user.name,
                                              "لم يتم الصلح",
                                              user.role,
                                              undefined,
                                              undefined,
                                              undefined,
                                              "أغلق_طلب_الصلح",
                                            );
                                            if (success) {
                                              toast({ title: "تم إغلاق طلب الصلح" });
                                            }
                                          } finally {
                                            setStageTransitioning(false);
                                          }
                                        }}
                                      >
                                        تأكيد
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </>
                                )}
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      )}
                    {actions?.canAssign && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">{selectedCase.primaryLawyerId ? "تعديل الإسناد" : "إسناد القضية"}</p>
                          <p className="text-xs text-muted-foreground">تحديد المحامي المسؤول عن القضية</p>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`button-assign-details-${selectedCase.id}`} onClick={() => { actions.onAssign(); }}>
                          <UserPlus className="w-4 h-4 ml-1" />{selectedCase.primaryLawyerId ? "تعديل الإسناد" : "إسناد"}
                        </Button>
                      </div>
                    )}
                    {actions?.canReview && (
                      <>
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                          <div>
                            <p className="font-medium text-sm">قائمة المراجعة</p>
                            <p className="text-xs text-muted-foreground">مراجعة بنود القضية قبل البت فيها</p>
                          </div>
                          <Button size="sm" variant="outline" data-testid={`button-review-checklist-details-${selectedCase.id}`} onClick={() => { actions.onReview(); }}>
                            <ClipboardCheck className="w-4 h-4 ml-1" />قائمة المراجعة
                          </Button>
                        </div>
                        <div className="p-3 rounded-lg border bg-card space-y-3">
                          <div>
                            <p className="font-medium text-sm">قرار لجنة المراجعة</p>
                            <p className="text-xs text-muted-foreground">حدد نتيجة مراجعة اللجنة للقضية</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                              data-testid={`button-reject-details-${selectedCase.id}`}
                              onClick={() => { actions.onReject(); }}
                            >
                              <MessageSquare className="w-4 h-4 ml-1" />تم إضافة ملاحظات
                            </Button>
                            <Button
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              data-testid={`button-approve-details-${selectedCase.id}`}
                              onClick={() => { actions.onApprove(); }}
                            >
                              <CheckCircle className="w-4 h-4 ml-1" />لا يوجد ملاحظات
                            </Button>
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span className="flex-1 text-center">→ الأخذ بالملاحظات</span>
                            <span className="flex-1 text-center">→ جاهزة للرفع</span>
                          </div>
                        </div>
                      </>
                    )}
                    {actions?.canEarlyClose && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20">
                        <div>
                          <p className="font-medium text-sm text-red-700 dark:text-red-400">إغلاق مبكر</p>
                          <p className="text-xs text-muted-foreground">إغلاق القضية من أي مرحلة مع تحديد السبب</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-red-500 text-red-600 hover:bg-red-50" data-testid={`button-early-close-${selectedCase.id}`} onClick={() => { actions.onEarlyClose(); }}>
                          <Archive className="w-4 h-4 ml-1" />إغلاق القضية
                        </Button>
                      </div>
                    )}
                    {actions?.canRecordJudgmentDeed && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/20">
                        <div>
                          <p className="font-medium text-sm text-purple-700 dark:text-purple-400">تسجيل استلام الصك</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedCase.judgmentDeedReceivedDate
                              ? `مُسجَّل بتاريخ ${selectedCase.judgmentDeedReceivedDate} — يمكن تعديله وستُحدَّث مهلة الاعتراض`
                              : "تبدأ مهلة الاعتراض من تاريخ استلام الصك"}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-purple-500 text-purple-600 hover:bg-purple-50" data-testid={`button-judgment-deed-${selectedCase.id}`} onClick={() => { actions.onRecordJudgmentDeed(); }}>
                          <FileText className="w-4 h-4 ml-1" />
                          {selectedCase.judgmentDeedReceivedDate ? "تعديل" : "تسجيل"}
                        </Button>
                      </div>
                    )}
                    {actions?.canRecordOpponentResponse && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                        <div>
                          <p className="font-medium text-sm text-orange-700 dark:text-orange-400">تم استلام رد الخصم</p>
                          <p className="text-xs text-muted-foreground">
                            يزيل مؤشر "مطلوب رد من الخصم" ويسأل إن كنا بحاجة لتحرير مذكرة جوابية
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" data-testid={`button-opponent-response-${selectedCase.id}`} onClick={() => { actions.onOpponentResponseReceived(); }}>
                          <MessageSquare className="w-4 h-4 ml-1" />تسجيل الاستلام
                        </Button>
                      </div>
                    )}
                    {actions?.canRecordAppealOutcome && (() => {
                      // WHO would appeal depends on the judgment direction, read
                      // from the case's own primary-judgment hearing via the SAME
                      // shared helper the server enforces with — so the UI can
                      // never offer a button the endpoint rejects.
                      //   لصالحنا     → the OPPONENT may appeal → both buttons.
                      //   ضدنا/جزئي  → WE are the appellant, and our appeal IS
                      //                filing the لائحة اعتراضية (which moves the
                      //                case by itself) → "الخصم استأنف" is
                      //                nonsense, so only the final-judgment button.
                      //   unknown    → no primary-judgment hearing found; we can't
                      //                prove either wrong, so BOTH are offered and
                      //                the row says the direction is undetermined
                      //                (the server likewise doesn't reject).
                      const direction = judgmentDirectionOf(
                        findPrimaryJudgmentHearing(getHearingsByCase(selectedCase.id)),
                      );
                      const weAppeal = weAreTheAppellant(direction);
                      return (
                        <div className="flex items-center justify-between p-3 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                          <div>
                            <p className="font-medium text-sm text-orange-700 dark:text-orange-400">نتيجة مهلة الاعتراض</p>
                            <p className="text-xs text-muted-foreground">
                              {weAppeal
                                ? "الحكم ليس لصالحنا — الاستئناف من طرفنا يتم برفع اللائحة الاعتراضية. سجّل هنا إن قررنا عدم الاستئناف."
                                : direction === "لصالحنا"
                                ? "الحكم لصالحنا — سجّل ما إذا كان الخصم قد استأنف أم انتهت المهلة دون استئناف"
                                : "تعذّر تحديد اتجاه الحكم (لا توجد جلسة حكم ابتدائي مسجّلة) — اختر ما ينطبق"}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {!weAppeal && (
                              <Button size="sm" variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" data-testid={`button-opponent-appealed-${selectedCase.id}`} onClick={() => { actions.onOpponentAppealed(); }}>
                                <Gavel className="w-4 h-4 ml-1" />الخصم استأنف
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" data-testid={`button-no-appeal-${selectedCase.id}`} onClick={() => { actions.onNoAppeal(); }}>
                              <CheckCircle className="w-4 h-4 ml-1" />
                              {weAppeal ? "لم نستأنف" : "لم يستأنف"}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                    {actions?.canReopen && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20">
                        <div>
                          <p className="font-medium text-sm text-green-700 dark:text-green-400">إعادة فتح القضية</p>
                          <p className="text-xs text-muted-foreground">إعادة فتح القضية المقفلة عند المرحلة التي تختارها</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" data-testid={`button-reopen-${selectedCase.id}`} onClick={() => { actions.onReopen(); }}>
                          <RotateCcw className="w-4 h-4 ml-1" />إعادة فتح
                        </Button>
                      </div>
                    )}
                    {actions?.canTransfer && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">تحويل لقسم آخر</p>
                          <p className="text-xs text-muted-foreground">تحويل القضية لقسم مختلف — تُعاد للاستلام في القسم الجديد</p>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`button-transfer-details-${selectedCase.id}`} onClick={() => { actions.onTransfer(); }}>
                          <ArrowLeftRight className="w-4 h-4 ml-1" />تحويل
                        </Button>
                      </div>
                    )}
                    {actions?.canRemind && (
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div>
                          <p className="font-medium text-sm">إرسال تذكير</p>
                          <p className="text-xs text-muted-foreground">إرسال تذكير للمحامي المسؤول</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-amber-500 text-amber-600" data-testid={`button-reminder-details-${selectedCase.id}`} onClick={() => { actions.onReminder(); }}>
                          <Bell className="w-4 h-4 ml-1" />تذكير
                        </Button>
                      </div>
                    )}
                    {/* Same condition as before, now expressed over the booleans the
                        page passes in: every page-owned action unavailable → the
                        "no actions" note. A host that passes NO actions at all (the
                        مهامي hub) shows it too — nothing in this tab is actionable
                        there beyond the stage/settlement blocks above. */}
                    {!actions?.canAssign && !actions?.canReview && !actions?.canClose
                      && !actions?.canEarlyClose && !actions?.canReopen && !actions?.canRecordJudgmentDeed
                      && !actions?.canRecordAppealOutcome && !actions?.canRecordOpponentResponse
                      && !actions?.canTransfer && !actions?.canRemind && (
                      <div className="text-center text-muted-foreground py-8">
                        <p className="text-sm">لا توجد إجراءات متاحة لهذه القضية حالياً</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hearing details, NESTED over the case dialog. Rendered as a SIBLING of it
          (inside the same fragment) rather than inside its DialogContent, so its own
          overlay stacks cleanly above — the same shape the AlertDialogs in the
          الإجراءات tab already use. Closing it leaves the user exactly where they
          were: still in the case dialog, still on الجلسات. Cleared when the case
          dialog itself closes, so reopening never shows a stale hearing.
          NO `actions` prop — the workflow steps render READ-ONLY here; recording a
          result or writing a report stays on the hearings page, which owns those
          dialogs. */}
      <HearingDetailsDialog
        hearingId={hearingDetailId}
        onOpenChange={(nextOpen) => !nextOpen && setHearingDetailId(null)}
      />
    </>
  );
}
