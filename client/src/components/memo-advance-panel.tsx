import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, AlertTriangle, CheckCircle, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCases } from "@/lib/cases-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { MemoStage, type Memo, type MemoStageValue } from "@shared/schema";

// SHARED memo lawyer-side advance panel. Extracted VERBATIM from memos.tsx: the
// linear-path advance buttons (RECEIVED→DRAFTING, READY→FILED) and the
// DRAFTING→INTERNAL_REVIEW send-to-review reviewer dialog, all driven through
// the same POST /api/memos/:id/advance-stage. The memos page AND the مهامي hub
// render this same component. The internal-review / committee / take-notes
// decisions are NOT here (already wired elsewhere) — this is only the advance.
//
// busy/onBusyChange let the host (memos.tsx) keep its shared `submitting` flag
// in sync so the sibling action buttons in the memo detail dialog disable during
// an advance exactly as before (byte-identical). The hub omits both and the
// panel uses its own internal busy state.
export function MemoAdvancePanel({
  memo,
  busy,
  onBusyChange,
  onChanged,
}: {
  memo: Memo;
  busy?: boolean;
  onBusyChange?: (b: boolean) => void;
  onChanged?: () => void;
}) {
  const { user, users } = useAuth();
  const { cases } = useCases();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [showSendToReviewDialog, setShowSendToReviewDialog] = useState(false);
  const [sendToReviewReviewerId, setSendToReviewReviewerId] = useState("");

  const disabled = !!busy || submitting;
  const setBusy = (b: boolean) => { setSubmitting(b); onBusyChange?.(b); };

  // getMemoCase, replicated verbatim from memos.tsx.
  const getMemoCase = (m: Memo): { departmentId?: string | null } | null =>
    cases.find((c) => c.id === m.caseId) ?? null;

  const handleAdvanceMemoStage = async (
    m: Memo,
    targetStage: MemoStageValue,
    extraBody: Record<string, unknown> = {},
  ) => {
    setBusy(true);
    try {
      await apiRequest("POST", `/api/memos/${m.id}/advance-stage`, { targetStage, ...extraBody });
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      toast({ title: "تم تحديث المرحلة" });
      onChanged?.();
    } catch (err) {
      toast({ title: "فشل تحديث المرحلة", description: extractApiError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const openSendToReviewDialog = () => {
    // Pre-select the previous reviewer on loop-back rounds.
    setSendToReviewReviewerId(memo.internalReviewerId || "");
    setShowSendToReviewDialog(true);
  };
  const closeSendToReviewDialog = () => {
    setShowSendToReviewDialog(false);
    setSendToReviewReviewerId("");
  };
  const handleSendToReview = async () => {
    if (!sendToReviewReviewerId) {
      toast({ title: "اختر المراجع الداخلي", variant: "destructive" });
      return;
    }
    await handleAdvanceMemoStage(memo, MemoStage.INTERNAL_REVIEW, { internalReviewerId: sendToReviewReviewerId });
    closeSendToReviewDialog();
  };

  // canAdvanceMemoStage, replicated verbatim from memos.tsx.
  const canAdvanceMemoStage = (m: Memo, targetStage: MemoStageValue): boolean => {
    if (!user) return false;
    if (m.awaitingCompletion || m.pausedAt) return false;
    const memoCase = getMemoCase(m);
    if (
      user.role === "department_head" &&
      memoCase &&
      memoCase.departmentId !== user.departmentId
    ) return false;
    const isLawyer = !!m.assignedTo && m.assignedTo === user.id;
    const isHeadOrManager = user.role === "department_head" || user.role === "branch_manager";
    const isAdminSupport = user.role === "admin_support";
    if (m.currentStage === MemoStage.RECEIVED && targetStage === MemoStage.DRAFTING) {
      return isLawyer || isHeadOrManager || isAdminSupport;
    }
    if (m.currentStage === MemoStage.DRAFTING && targetStage === MemoStage.INTERNAL_REVIEW) {
      return isLawyer || isHeadOrManager;
    }
    if (m.currentStage === MemoStage.READY && targetStage === MemoStage.FILED) {
      return isLawyer || isHeadOrManager || isAdminSupport;
    }
    return false;
  };

  const memoCase = getMemoCase(memo);
  const eligibleReviewers = users.filter((u) =>
    u.isActive
    && u.role !== "admin_support"
    && u.role !== "branch_manager"
    && u.role !== "hr"
    && u.role !== "technical_support"
    && u.id !== user?.id
    && (!memoCase?.departmentId || u.departmentId === memoCase.departmentId)
  );

  return (
    <>
      {memo.currentStage === MemoStage.RECEIVED && canAdvanceMemoStage(memo, MemoStage.DRAFTING) && (
        <Button
          data-testid="button-memo-advance-to-drafting"
          onClick={() => handleAdvanceMemoStage(memo, MemoStage.DRAFTING)}
          disabled={disabled}
        >
          <Clock className="w-4 h-4 ml-2" />
          بدء التحرير
        </Button>
      )}
      {memo.currentStage === MemoStage.DRAFTING && canAdvanceMemoStage(memo, MemoStage.INTERNAL_REVIEW) && (
        <Button
          data-testid="button-memo-advance-to-internal-review"
          onClick={openSendToReviewDialog}
          disabled={disabled}
        >
          <AlertTriangle className="w-4 h-4 ml-2" />
          إرسال للمراجعة الداخلية
        </Button>
      )}
      {memo.currentStage === MemoStage.READY && canAdvanceMemoStage(memo, MemoStage.FILED) && (
        <Button
          data-testid="button-memo-advance-to-filed"
          onClick={() => handleAdvanceMemoStage(memo, MemoStage.FILED)}
          disabled={disabled}
          className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700"
        >
          <CheckCircle className="w-4 h-4 ml-2" />
          تم الرفع
        </Button>
      )}

      <Dialog open={showSendToReviewDialog} onOpenChange={(open) => { if (!open) closeSendToReviewDialog(); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              إرسال للمراجعة الداخلية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              اختر المراجع الداخلي. ستُحال المذكرة إليه ليُسجل قراره (اعتماد / يوجد ملاحظات).
            </p>
            <div className="space-y-2">
              <Label>المراجع الداخلي <span className="text-red-500">*</span></Label>
              <select
                value={sendToReviewReviewerId}
                onChange={(e) => setSendToReviewReviewerId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="select-memo-internal-reviewer"
              >
                <option value="">-- اختر مراجعاً --</option>
                {eligibleReviewers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {eligibleReviewers.length === 0 && (
                <p className="text-xs text-red-600">لا يوجد مراجعون مؤهلون في قسم القضية</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={closeSendToReviewDialog} data-testid="button-cancel-memo-send-to-review">
              إلغاء
            </Button>
            <Button
              data-testid="button-confirm-memo-send-to-review"
              onClick={handleSendToReview}
              disabled={disabled || !sendToReviewReviewerId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <ClipboardCheck className="w-4 h-4 ml-2" />
              تأكيد الإرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
