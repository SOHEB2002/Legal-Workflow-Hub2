import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCases } from "@/lib/cases-context";
import { useHearings } from "@/lib/hearings-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";

// "تسجيل استلام رد الخصم" — the ONE dialog behind the "مطلوب رد من الخصم"
// indicator being turned off, in BOTH places that can turn it off:
//   • the case-level "تم استلام رد الخصم" action (cases.tsx / case-details-dialog)
//   • the hearing-level toggle in the النتيجة tab (hearing-details-dialog)
//
// EXTRACTED VERBATIM out of cases.tsx, where it was inline JSX bound to page
// state. It was reusable as-is: nothing in it was coupled to the cases page —
// the case came in as a row, refreshCases/toast/queryClient are app-wide, and
// the only host-specific bit was closing the page's own state, which is now the
// onOpenChange prop. So the second caller reuses the dialog rather than growing
// a near-duplicate (the three-copies-of-one-dialog trap this codebase already
// paid for once with the لم يتم الصلح dialog).
//
// 🔴 IT POSTS TO POST /api/cases/:id/opponent-response — the pre-existing
// endpoint — and nothing else. That is what guarantees the two entry points
// produce the identical outcome: the same clearing sweep, the same
// createResponseMemoForCase مذكرة جوابية (same type/title/priority/assignee/
// deadline/autoGenerateReason), and the same opponent_response_received activity
// row. There is no second memo-creation path on the client or the server.
//
// ⚠ THE CLEAR IS BLANKET, BY DESIGN — the endpoint unsets the flag on EVERY
// hearing of the case that carries it, because the indicator itself is
// `.some(h => h.opponentResponseRequired)` across the case. When more than one
// hearing is flagged the dialog says so explicitly, so a user turning off ONE
// hearing's switch is told the indicator leaves the whole case.
export function OpponentResponseDialog({
  caseId,
  onOpenChange,
}: {
  caseId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { refreshCases } = useCases();
  const { getHearingsByCase } = useHearings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState<"" | "نعم" | "لا">("");
  const [submitting, setSubmitting] = useState(false);

  // Every open starts unanswered — the question is REQUIRED (same tri-state
  // discipline as the objectionability question: "unanswered" must never be
  // indistinguishable from "no").
  useEffect(() => {
    if (caseId) setAnswer("");
  }, [caseId]);

  const flaggedCount = caseId
    ? getHearingsByCase(caseId).filter((h) => h.opponentResponseRequired).length
    : 0;

  const submit = async () => {
    if (!caseId || !answer) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", `/api/cases/${caseId}/opponent-response`, {
        needsOurResponse: answer === "نعم",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/hearings"] });
      // The نعم branch creates a مذكرة جوابية; without this it stays invisible on
      // the memos page and in the case's memos tab until the next natural refetch.
      await queryClient.invalidateQueries({ queryKey: ["/api/memos"] });
      await refreshCases();
      toast({
        title: answer === "نعم"
          ? "تم تسجيل استلام رد الخصم وإنشاء مذكرة جوابية"
          : "تم تسجيل استلام رد الخصم",
      });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "تعذّر تسجيل الاستلام", description: extractApiError(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!caseId} onOpenChange={(open) => { if (!open) onOpenChange(false); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>تسجيل استلام رد الخصم</DialogTitle>
        </DialogHeader>
        {caseId && (
          <>
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                سيتم إزالة مؤشر "مطلوب رد من الخصم" عن هذه القضية.
              </p>
              {flaggedCount > 1 && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  ملاحظة: المؤشر مُفعّل على {flaggedCount} جلسات في هذه القضية، وسيُزال عنها جميعاً.
                </p>
              )}
              <div>
                <Label>هل نحتاج للرد على مذكرة الخصم؟ <span className="text-red-500">*</span></Label>
                <Select
                  value={answer}
                  onValueChange={(v) => setAnswer(v as "نعم" | "لا")}
                >
                  <SelectTrigger data-testid="select-needs-our-response"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="نعم">نعم — نحتاج للرد</SelectItem>
                    <SelectItem value="لا">لا — لا نحتاج للرد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {answer === "نعم" && (
                <p className="text-xs text-muted-foreground">
                  ستُنشأ مذكرة جوابية تلقائياً وتُسند للمحامي المسؤول، بنفس آلية "مطلوب مذكرة" عند تحديد موعد جديد.
                </p>
              )}
              {answer === "لا" && (
                <p className="text-xs text-muted-foreground">
                  لن تُنشأ مذكرة — سيُزال المؤشر فقط.
                </p>
              )}
            </div>
            <DialogFooter>
              {/* CANCEL CHANGES NOTHING — no request has been sent at this point, so
                  the flag stays exactly as it was on every hearing that carries it. */}
              <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button
                data-testid="button-confirm-opponent-response"
                disabled={!answer || submitting}
                onClick={submit}
              >
                حفظ
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
