import { useState } from "react";
import { CaseProgressBar } from "@/components/case-progress-bar";
import { useCases } from "@/lib/cases-context";
import { useAuth } from "@/lib/auth-context";
import { anyIdentity, hasEffectiveRole, isDeptHeadFor } from "@/lib/acting-identities";
import { useDepartments } from "@/lib/departments-context";
import { useHearings } from "@/lib/hearings-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { extractApiError } from "@/lib/utils";
import { caseHasReturnedFromReview } from "@/lib/case-stage-utils";
import { CaseClassification, findLatestJudgmentHearing, judgmentDirectionOf, caseClosureBadgeSuffix, getStageLabel, getStagesForClassification } from "@shared/schema";
import { caseCurrentJudgmentOutcome } from "@/lib/attachment-indicators";
import type { LawCase, CaseClassificationValue } from "@shared/schema";

// SHARED case stage panel. Wraps the existing <CaseProgressBar> (the proven
// stage component) plus the 8 workflow callbacks that used to live inline in
// cases.tsx — moved here VERBATIM so the cases page AND the مهامي hub drive the
// case workflow through the exact same component, the same useCases() mutation
// functions (moveToNextStage / moveToPreviousStage / skipDataCompletion /
// updateCase / approveCase / rejectCase) and the same endpoints. Zero forked
// workflow logic; the stage graph + reviewer-selection live inside
// CaseProgressBar (unchanged).
//
// Two page-only concerns are decoupled via OPTIONAL props so the cases page
// behaves byte-identically while the hub omits them:
//   • onHearingPrompt — cases.tsx prompts to add a hearing after a platform
//     transition; the hub omits it.
//   • onClosed — cases.tsx closes the detail dialog after a committee decision
//     (setSelectedCaseId(null)); the hub omits it.
// onChanged fires after every successful mutation (the hub invalidates its
// queries; cases.tsx omits it → no-op, relying on context state as before).
export function CaseStagePanel({
  caseItem,
  onHearingPrompt,
  onClosed,
  onChanged,
}: {
  caseItem: LawCase;
  onHearingPrompt?: (prompt: { caseId: string; hearingType: "تراضي" | "محكمة"; title: string; description: string }) => void;
  onClosed?: () => void;
  onChanged?: () => void;
}) {
  const { moveToNextStage, moveToPreviousStage, skipDataCompletion, updateCase, approveCase, rejectCase, refreshCases } = useCases();
  const { user, users, actingIdentities } = useAuth();
  const { getDepartmentName } = useDepartments();
  const { getHearingsByCase } = useHearings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stageTransitioning, setStageTransitioning] = useState(false);

  return (
    <CaseProgressBar
      currentStage={caseItem.currentStage}
      userRole={user?.role || "employee"}
      // The bar's authority gates read this; userRole above stays the OWN role
      // for the shared canReviewCases / canMoveToPreviousStage helpers and the
      // four-eyes internal-review gate, which must never be delegation-expanded.
      actingIdentities={actingIdentities}
      caseClassification={caseItem.caseClassification as CaseClassificationValue}
      clientRole={caseItem.clientRole || undefined}
      memoRequired={!!caseItem.memoRequired}
      isSettlementCase={!!caseItem.isSettlementCase}
      // إداري's track. NULL until batch 2's «مسار التظلم» / «مسار الدعوى»
      // buttons set it, which resolves the bar to AdminUnroutedStages.
      adminCaseSubType={caseItem.adminCaseSubType}
      // Pre-fill only, for the two مقفلة-exit dialogs.
      caseGrievanceResult={caseItem.grievanceResult}
      caseGrievanceResultDate={caseItem.grievanceResultDate}
      // 🔴 SAME GATE AS onChooseAdminTrack BELOW — canEditCaseViolationDetails's
      // client mirror. Not a new permission and not a loosened one: choosing what
      // happens after the grievance is the same authority as choosing the track in
      // the first place, exercised later with more information.
      onGrievanceOutcome={
        user && (
          hasEffectiveRole(actingIdentities, "branch_manager", "admin_support") ||
          isDeptHeadFor(actingIdentities, caseItem.departmentId) ||
          anyIdentity(actingIdentities, (_r, id) =>
            caseItem.primaryLawyerId === id ||
            caseItem.responsibleLawyerId === id ||
            (Array.isArray(caseItem.assignedLawyers) && caseItem.assignedLawyers.includes(id)))
        ) ? async (payload) => {
          setStageTransitioning(true);
          try {
            const path = payload.kind === "accepted"
              ? "grievance-accepted"
              : "grievance-continue-as-lawsuit";
            await apiRequest("POST", `/api/cases/${caseItem.id}/${path}`, {
              grievanceResult: payload.grievanceResult,
              grievanceResultDate: payload.grievanceResultDate,
            });
            toast({
              title: payload.kind === "accepted"
                ? "تم تسجيل قبول التظلم"
                : "تم استكمال القضية كدعوى",
              description: payload.kind === "accepted"
                ? "انتقلت القضية إلى التحصيل وأُنشئت مهمة خطاب التحصيل"
                : "بدأت القضية من مرحلة الاستلام على مسار الدعوى",
            });
            await refreshCases();
            onChanged?.();
          } catch (err) {
            toast({ title: "تعذّر تنفيذ الإجراء", description: extractApiError(err), variant: "destructive" });
          } finally {
            setStageTransitioning(false);
          }
        } : undefined
      }
      // Read-only: lets the bar work out how far a TERMINAL case (مقفلة /
      // مشطوبة / محكوم_* …) actually got along its path, since such a case can
      // be closed from any stage and currentStage no longer says where it was.
      stageHistory={caseItem.stageHistory}
      // Which way the ruling went, for the judgment terminal badges. Resolved
      // here (not in the bar) because the bar takes no contexts; uses the SHARED
      // findLatestJudgmentHearing — the display counterpart of
      // findPrimaryJudgmentHearing, which filters !judgmentFinal and so would
      // never match a case sitting on محكوم_حكم_نهائي.
      // 🔴 BATCH 4 — the JUDGMENT RECORD wins when the case has one. The hearing
      // scan cannot see a ruling recorded without a session (POST /appeal-ruling
      // writes no hearing) and cannot tell a standing ruling from a quashed one,
      // so on a case that went to appeal it named the wrong ruling. Falls back to
      // the scan when there is no record or the outcome is null (a quash decides
      // procedure, not merits), which is the pre-batch-4 behaviour unchanged.
      judgmentDirection={
        judgmentDirectionOf({ judgmentSide: caseCurrentJudgmentOutcome(caseItem) })
        ?? judgmentDirectionOf(findLatestJudgmentHearing(getHearingsByCase(caseItem.id)))
      }
      // WHAT the case ended in, for the مقفلة terminal badge — resolved HERE because
      // the composer needs the hearings (for the ruling) as well as the case row,
      // and the bar takes no contexts. One call decides between the substantive
      // outcome and the closure reason; the bar just renders the result.
      // Batch 4 — the third argument makes the closed-case badge name the LATEST
      // ruling rather than whichever judgment hearing is newest by date.
      closureBadge={caseClosureBadgeSuffix(
        caseItem,
        getHearingsByCase(caseItem.id),
        caseCurrentJudgmentOutcome(caseItem),
      )}
      departmentName={getDepartmentName(caseItem.departmentId || "")}
      disabled={
        stageTransitioning
        || caseItem.awaitingCompletion
        || !!caseItem.pausedAt
      }
      currentUserId={user?.id}
      caseInternalReviewerId={caseItem.internalReviewerId || null}
      isAssignedLawyer={
        !!user && (
          caseItem.primaryLawyerId === user.id ||
          (Array.isArray(caseItem.assignedLawyers) && caseItem.assignedLawyers.includes(user.id))
        )
      }
      // 🔴 "IS ANY EFFECTIVE IDENTITY AN ASSIGNED LAWYER OF THIS CASE" — the
      // exact mirror of the server's grantAssignedLawyer, which tests
      // effectiveIdsFor(ctx, caseId) against isAssignedLawyer rather than the
      // caller's own id. Comparing user.id alone was the SECOND delegation-blind
      // term behind the disabled «المرحلة التالية»: a delegate standing in for
      // the case's responsible lawyer is an assignee server-side and was not one
      // here. The three OR-ed fields are unchanged and in the same order; only
      // the id being compared is now per-identity, so a non-delegated user (whose
      // identity set is exactly [self]) gets the identical boolean.
      isCaseAssignee={
        anyIdentity(actingIdentities, (_role, identityId) =>
          caseItem.primaryLawyerId === identityId ||
          caseItem.responsibleLawyerId === identityId ||
          (Array.isArray(caseItem.assignedLawyers) && caseItem.assignedLawyers.includes(identityId))
        )
      }
      hasReturnedFromReview={caseHasReturnedFromReview(caseItem)}
      eligibleInternalReviewers={users
        .filter(u =>
          u.isActive &&
          u.role !== "branch_manager" &&
          u.role !== "admin_support" &&
          u.role !== "hr" &&
          u.role !== "technical_support" &&
          u.departmentId === caseItem.departmentId &&
          u.id !== caseItem.primaryLawyerId &&
          u.id !== caseItem.responsibleLawyerId
        )
        .map(u => ({ id: u.id, name: u.name }))}
      onMoveToNext={async (notes, internalReviewerId, reviewDecision, extraFields, explicitTargetStage) => {
        if (!user) return;
        const stageBefore = caseItem.currentStage;
        setStageTransitioning(true);
        try {
          const success = await moveToNextStage(caseItem.id, user.id, user.name, notes, user.role, internalReviewerId, reviewDecision, extraFields, explicitTargetStage);
          if (success) {
            toast({ title: "تم نقل القضية للمرحلة التالية" });
            const deptName = getDepartmentName(caseItem.departmentId || "");
            const hasSettlementInHistory = Array.isArray(caseItem.stageHistory) &&
              caseItem.stageHistory.some((h: any) => h.stage === "أغلق_طلب_الصلح");
            const laborAlreadySettled = deptName === "عمالي" && hasSettlementInHistory;
            if (stageBefore === "قيد_التدقيق_في_تراضي") {
              onHearingPrompt?.({
                caseId: caseItem.id,
                hearingType: "تراضي",
                title: "هل تريد إضافة موعد جلسة تراضي الآن؟",
                description: "تم قبول الطلب في منصة تراضي. يرجى إضافة موعد جلسة التراضي.",
              });
            } else if (
              (stageBefore === "قيد_التدقيق_في_ناجز" ||
                stageBefore === "قيد_التدقيق_في_معين") &&
              !laborAlreadySettled
            ) {
              onHearingPrompt?.({
                caseId: caseItem.id,
                hearingType: "محكمة",
                title: "هل تريد إضافة موعد جلسة محكمة الآن؟",
                description: "تم قبول القضية في المحكمة. يرجى إضافة موعد الجلسة القادمة.",
              });
            }
            onChanged?.();
          } else {
            // success === false is NEVER a permission denial. moveToNextStage only
            // returns false on CLIENT-SIDE pre-checks that run before any request is
            // sent: the case isn't loaded, or its current stage isn't in the stage
            // array resolved for its classification/department (currentIndex === -1
            // — transitions-engine validateCaseForward + cases-context), or it is
            // already on the last stage of its path. A real permission denial comes
            // back from the SERVER as a 403, which updateCase rethrows → the catch
            // below, where extractApiError surfaces the server's own message.
            // This branch used to claim "ليس لديك صلاحية", which sent us hunting a
            // permissions bug for an off-array stage-resolution failure.
            toast({
              title: "تعذّر تحديد المرحلة التالية",
              description: "المرحلة الحالية لا تنتمي لمسار هذه القضية (حسب تصنيفها وقسمها)، أو أن القضية في آخر مرحلة بمسارها. هذه ليست مشكلة صلاحيات — راجع تصنيف القضية ومرحلتها الحالية.",
              variant: "destructive",
            });
          }
        } catch (err) {
          // Server rejection (403 permission / 400 invalid transition / …) — show
          // the server's OWN message rather than guessing at the cause.
          toast({ title: "فشل نقل القضية", description: extractApiError(err), variant: "destructive" });
        } finally {
          setStageTransitioning(false);
        }
      }}
      onMoveToPrevious={async (notes, internalReviewerId) => {
        if (!user) return;
        setStageTransitioning(true);
        try {
          const success = await moveToPreviousStage(caseItem.id, user.id, user.name, notes, user.role, internalReviewerId);
          if (success) {
            toast({ title: "تم إرجاع القضية للمرحلة السابقة" });
            onChanged?.();
          } else {
            // Same rule as the advance branch above: moveToPreviousStage returns
            // false ONLY on client-side pre-checks (case not loaded; stage not in
            // the resolved path; already at the first stage). A permission denial
            // arrives as a server 403 → the catch below.
            toast({
              title: "تعذّر تحديد المرحلة السابقة",
              description: "لا توجد مرحلة سابقة في مسار هذه القضية، أو أن المرحلة الحالية لا تنتمي لهذا المسار. هذه ليست مشكلة صلاحيات.",
              variant: "destructive",
            });
          }
        } catch (err) {
          toast({ title: "فشل إرجاع القضية", description: extractApiError(err), variant: "destructive" });
        } finally {
          setStageTransitioning(false);
        }
      }}
      hasPlatformNotes={
        !!caseItem.platformReviewNotes &&
        String(caseItem.platformReviewNotes).trim().length > 0
      }
      onPlatformReviewAddNotes={async (platformNotes) => {
        if (!user) return;
        setStageTransitioning(true);
        try {
          await updateCase(caseItem.id, {
            platformReviewNotes: platformNotes,
            platformReviewResubmitted: false,
          });
          toast({ title: "تم حفظ ملاحظات المنصة" });
          onChanged?.();
        } catch (err) {
          toast({ title: "تعذّر حفظ الملاحظات", description: extractApiError(err), variant: "destructive" });
        } finally {
          setStageTransitioning(false);
        }
      }}
      onPlatformReviewResubmit={async () => {
        if (!user) return;
        setStageTransitioning(true);
        try {
          await updateCase(caseItem.id, {
            platformReviewNotes: "",
            platformReviewResubmitted: true,
          });
          toast({
            title: "تم إعادة التقديم بنجاح",
            description: "بانتظار رد المنصة",
          });
          onChanged?.();
        } catch (err) {
          toast({ title: "تعذّر تسجيل إعادة التقديم", description: extractApiError(err), variant: "destructive" });
        } finally {
          setStageTransitioning(false);
        }
      }}
      onInternalReviewSendBack={async (reviewerNotes) => {
        if (!user) return;
        // 🔴 THE DRAFTING STAGE IS NOT THE SAME ON EVERY PATH. This used to
        // hard-code تحرير_صحيفة_الدعوى for everything except the tazallum branch —
        // but that is the PLAINTIFF pleading. An in-court مدعى_عليه case drafts
        // تحرير_مذكرة_جوابية, so an internal reviewer sending a defendant case back
        // landed it on the plaintiff drafting stage: the same class of defect as
        // the committee approve button, one stage earlier. The server accepts
        // either, because ALLOWED_CASE_TRANSITIONS is a flat from→to table and
        // BOTH edges out of مراجعة_داخلية exist in it.
        //
        // Resolved from the case's OWN path instead: the send-back target is
        // whatever sits immediately BEFORE مراجعة_داخلية in it. Measured across all
        // six paths that have an internal-review stage, that predecessor is
        // تحرير_مذكرة_جوابية on the in-court defendant path and تحرير_صحيفة_الدعوى
        // on the other five — exactly the distinction the old ternary missed.
        //
        // The -1 case is SAFE here, unlike the committee target: a missing
        // مراجعة_داخلية makes indexOf return -1 and stages[-2] is undefined, so the
        // fallback genuinely fires rather than silently yielding stages[0].
        //
        // The مراجعة_داخلية_للتظلم branch is untouched — the grievance review has
        // exactly one origin (تحرير_صيغة_التظلم, admin path only) and no
        // path-dependent variant to resolve.
        const resolveSendBackStage = (): string => {
          const stages = getStagesForClassification(
            (caseItem.caseClassification || CaseClassification.UNDER_STUDY) as CaseClassificationValue,
            getDepartmentName(caseItem.departmentId || ""),
            caseItem.clientRole || undefined,
            !!caseItem.memoRequired,
            !!caseItem.isSettlementCase,
            caseItem.adminCaseSubType,
          );
          // With the admin track passed in, this now yields the RIGHT send-back
          // for both admin paths by position alone: تحرير_صيغة_التظلم on the
          // grievance track, دراسة on the lawsuit track. The hard-coded
          // مراجعة_داخلية_للتظلم branch below is unreachable for a new case (no
          // path routes through that stage any more) and is kept only for a case
          // that historically sits on it.
          const reviewIdx = stages.indexOf("مراجعة_داخلية");
          return reviewIdx > 0 ? stages[reviewIdx - 1] : "تحرير_صحيفة_الدعوى";
        };
        const targetStage =
          caseItem.currentStage === "مراجعة_داخلية_للتظلم"
            ? "تحرير_صيغة_التظلم"
            : resolveSendBackStage();
        setStageTransitioning(true);
        try {
          await updateCase(caseItem.id, {
            currentStage: targetStage,
            reviewNotes: reviewerNotes,
            stageChangeNotes: reviewerNotes,
          } as Partial<LawCase> & { stageChangeNotes?: string });
          toast({ title: "تم إرجاع القضية بملاحظات المراجع" });
          onChanged?.();
        } catch (err) {
          toast({ title: "تعذّر إرجاع القضية", description: extractApiError(err), variant: "destructive" });
        } finally {
          setStageTransitioning(false);
        }
      }}
      onReturnToCommittee={async (returnNotes) => {
        if (!user) return;
        setStageTransitioning(true);
        try {
          await apiRequest("POST", `/api/cases/${caseItem.id}/return-to-committee`, {
            notes: returnNotes,
          });
          await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
          toast({ title: "تم إعادة القضية للجنة المراجعة" });
          onChanged?.();
        } catch (err) {
          toast({ title: "تعذّر إعادة القضية للجنة", description: extractApiError(err), variant: "destructive" });
        } finally {
          setStageTransitioning(false);
        }
      }}
      // Committee-review decisions: replicate the cases page's handleApprove /
      // handleReject bodies verbatim (same approveCase / rejectCase context fns,
      // same toasts); the dialog-close is routed through onClosed so the cases
      // page closes its detail dialog exactly as before.
      // Awaited, and the toast names the stage the SERVER landed on — an
      // under-study case goes to جاهزة_للرفع, an in-court one to منظورة, and this
      // announced "جاهزة للرفع" for both. The dialog now closes only on success;
      // a failure keeps it open with the server's own message, matching
      // onReturnToCommittee above.
      onReviewCommitteeApprove={async () => {
        try {
          const updated = await approveCase(caseItem.id);
          toast({ title: `تم اعتماد القضية — ${getStageLabel(updated.currentStage)}` });
          onClosed?.();
          onChanged?.();
        } catch (err) {
          toast({ title: "تعذّر اعتماد القضية", description: extractApiError(err), variant: "destructive" });
        }
      }}
      onReviewCommitteeAddNotes={(committeeNotes) => {
        rejectCase(caseItem.id, committeeNotes || "تم إضافة ملاحظات من لجنة المراجعة", "rejected");
        toast({ title: "تم إرسال القضية للأخذ بالملاحظات" });
        onClosed?.();
        onChanged?.();
      }}
      // Reasoned override — "تجاوز لجنة المراجعة". The callback is passed ONLY
      // when the user satisfies the SERVER's rule for POST /api/cases/:id/
      // skip-committee (branch_manager | department_head of the case's own dept |
      // assigned lawyer = primary | responsible | assignedLawyers) — the same
      // conditional-callback idiom onSkipDataCompletion uses below. Undefined for
      // everyone else, so the button does not render at all and can never 403.
      // NOTE this set is intentionally WIDER than the committee-decision actors
      // (cases_review_head / branch_manager); see the endpoint's comment.
      //
      // UNDER-STUDY ONLY, mirroring the server's guard: the review committee belongs
      // to the قيد_الدراسة workflow. An in-court (منظورة_بالمحكمة) case is already
      // filed — its memo goes to committee, not the case — so it must never show the
      // skip button. Keeps visibility === authorization (an in-court case parked at
      // the committee stage, which only corrupt seed data produced, would otherwise
      // render a button the server now 400s).
      onSkipCommittee={
        user
        && caseItem.caseClassification === CaseClassification.UNDER_STUDY
        && (
          hasEffectiveRole(actingIdentities, "branch_manager") ||
          isDeptHeadFor(actingIdentities, caseItem.departmentId) ||
          caseItem.primaryLawyerId === user.id ||
          caseItem.responsibleLawyerId === user.id ||
          (Array.isArray(caseItem.assignedLawyers) && caseItem.assignedLawyers.includes(user.id))
        ) ? async (reason: string) => {
          setStageTransitioning(true);
          try {
            await apiRequest("POST", `/api/cases/${caseItem.id}/skip-committee`, { reason });
            await queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
            await refreshCases();
            toast({ title: "تم تجاوز لجنة المراجعة — القضية جاهزة للرفع" });
            onChanged?.();
          } catch (err) {
            toast({
              title: "تعذّر تجاوز لجنة المراجعة",
              description: extractApiError(err),
              variant: "destructive",
            });
          } finally {
            setStageTransitioning(false);
          }
        } : undefined
      }
      // 🔴 GATE MIRRORS THE SERVER'S canEditCaseViolationDetails EXACTLY —
      // branch_manager | admin_support | own-dept department_head | assigned
      // lawyer, delegation-aware through actingIdentities. Same shape as the
      // skip mirror directly below, so visibility === authorization and the
      // buttons can never render for someone the endpoint will 403.
      onChooseAdminTrack={
        user && (
          hasEffectiveRole(actingIdentities, "branch_manager", "admin_support") ||
          isDeptHeadFor(actingIdentities, caseItem.departmentId) ||
          anyIdentity(actingIdentities, (_r, id) =>
            caseItem.primaryLawyerId === id ||
            caseItem.responsibleLawyerId === id ||
            (Array.isArray(caseItem.assignedLawyers) && caseItem.assignedLawyers.includes(id)))
        ) ? async (payload) => {
          setStageTransitioning(true);
          try {
            await apiRequest("POST", `/api/cases/${caseItem.id}/admin-track`, payload);
            toast({
              title: "تم تحديد مسار القضية",
              description: "بقيت القضية في مرحلة الاستلام — تابع بالأزرار المعتادة",
            });
            await refreshCases();
            onChanged?.();
          } catch (err) {
            toast({ title: "تعذّر تحديد المسار", description: extractApiError(err), variant: "destructive" });
          } finally {
            setStageTransitioning(false);
          }
        } : undefined
      }
      onSkipDataCompletion={
        // Delegation-aware as of the server batch: POST /api/cases/:id/skip-data-completion
        // now resolves through canActOnCaseWorkflowState(…, req.actingContext),
        // so this mirror is converted to match. Same set, same scope term — the
        // department is compared against the DELEGATOR's on a delegated identity.
        user && (
          hasEffectiveRole(actingIdentities, "branch_manager", "admin_support") ||
          isDeptHeadFor(actingIdentities, caseItem.departmentId) ||
          anyIdentity(actingIdentities, (_r, id) =>
            caseItem.primaryLawyerId === id ||
            caseItem.responsibleLawyerId === id ||
            (Array.isArray(caseItem.assignedLawyers) && caseItem.assignedLawyers.includes(id)))
        ) ? async (notes) => {
          if (!user) return;
          setStageTransitioning(true);
          try {
            const success = await skipDataCompletion(caseItem.id, user.id, user.name, notes);
            if (success) {
              toast({ title: "تم تجاوز استكمال المرفقات والبيانات", description: "انتقلت القضية مباشرةً لمرحلة الدراسة" });
              onChanged?.();
            } else {
              toast({ title: "تعذّر التجاوز", variant: "destructive" });
            }
          } catch (err) {
            toast({ title: "تعذّر التجاوز", description: extractApiError(err), variant: "destructive" });
          } finally {
            setStageTransitioning(false);
          }
        } : undefined
      }
    />
  );
}
