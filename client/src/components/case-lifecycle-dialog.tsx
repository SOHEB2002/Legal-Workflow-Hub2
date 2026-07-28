import { useState, type ReactNode } from "react";
import {
  Pause,
  Play,
  AlertTriangle,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PauseUntilField, pauseUntilError } from "@/components/ui/pause-until-field";
import { apiRequest } from "@/lib/queryClient";
import { cn, extractApiError } from "@/lib/utils";
import { getStageLabel } from "@shared/schema";
import type { LawCase } from "@shared/schema";
import type { useToast } from "@/hooks/use-toast";

// The four case-lifecycle flows are mutually exclusive (only one dialog
// is ever open) and share a single skeleton: target case → reason/notes
// input → POST → refreshCases → toast → close. They differ ONLY in the
// values below, so one config table + one dialog + one hook replaces
// what used to be 4 handlers + 4 open/close helpers + 4 AlertDialog
// blocks + 13 useState hooks in cases.tsx.
export type CaseLifecycleType = "pause" | "unpause" | "await" | "resume";

type ToastFn = ReturnType<typeof useToast>["toast"];

interface LifecycleConfig {
  // Appended to `/api/cases/:id/` for the POST.
  endpoint: string;
  // Body key carrying the textarea value.
  bodyField: "reason" | "notes";
  // When true the text is mandatory (validated before POST) and always
  // sent; when false it is omitted from the body if blank.
  required: boolean;
  icon: LucideIcon;
  iconClass?: string;
  title: string;
  // resume interpolates the saved stage label, so this is a function of
  // the target rather than a static string.
  description: (target: LawCase | null) => ReactNode;
  inputLabel: ReactNode;
  placeholder: string;
  actionClass?: string;
  actionIcon: LucideIcon;
  actionLabel: string;
  successToast: string;
  failToast: string;
  // Only used when required.
  requiredToast?: string;
  inputTestId: string;
  buttonTestId: string;
  // OPTIONAL secondary DATE input, rendered under the textarea as the shared
  // <PauseUntilField/> (which owns the label, hint and past-date message so all
  // four entities' pause dialogs read identically). Only `pause` declares one;
  // unpause / await / resume omit it and are byte-identical to before. Always
  // optional to FILL IN — an empty date is a valid submission and simply omits
  // the key from the body.
  dateInput?: {
    bodyField: string;
    testId: string;
  };
}

const LIFECYCLE_CONFIG: Record<CaseLifecycleType, LifecycleConfig> = {
  pause: {
    endpoint: "pause",
    bodyField: "reason",
    required: true,
    icon: Pause,
    iconClass: "text-amber-600",
    title: "تعليق القضية",
    description: () =>
      "سيتم إيقاف العمل على هذه القضية مؤقتاً مع الاحتفاظ بمرحلتها الحالية. يمكن استئنافها لاحقاً عبر \"إلغاء التعليق\".",
    inputLabel: (
      <>
        سبب التعليق <span className="text-red-500">*</span>
      </>
    ),
    placeholder: "اكتب سبب التعليق...",
    actionClass: "bg-amber-600 hover:bg-amber-700",
    actionIcon: Pause,
    actionLabel: "تأكيد التعليق",
    successToast: "تم تعليق القضية",
    failToast: "فشل التعليق",
    requiredToast: "أدخل سبب التعليق",
    inputTestId: "input-case-pause-reason",
    buttonTestId: "button-confirm-pause-case",
    dateInput: {
      bodyField: "pauseUntil",
      testId: "input-case-pause-until",
    },
  },
  unpause: {
    endpoint: "unpause",
    bodyField: "notes",
    required: false,
    icon: Play,
    title: "إلغاء تعليق القضية",
    description: () => "ستعود القضية للعمل عند نفس مرحلتها قبل التعليق.",
    inputLabel: "ملاحظات (اختياري)",
    placeholder: "اكتب ملاحظات حول إلغاء التعليق...",
    actionIcon: Play,
    actionLabel: "تأكيد إلغاء التعليق",
    successToast: "تم إلغاء تعليق القضية",
    failToast: "فشل إلغاء التعليق",
    inputTestId: "input-case-unpause-notes",
    buttonTestId: "button-confirm-unpause-case",
  },
  await: {
    endpoint: "await-completion",
    bodyField: "reason",
    required: true,
    icon: AlertTriangle,
    iconClass: "text-amber-600",
    title: "بانتظار استكمال البيانات",
    description: () =>
      "ستُحفظ المرحلة الحالية وتُنقل القضية مؤقتاً إلى مرحلة \"استكمال المرفقات والبيانات\". عند اكتمال البيانات استخدم زر \"تم الاستكمال\" للعودة إلى المرحلة المحفوظة.",
    inputLabel: (
      <>
        السبب <span className="text-red-500">*</span>
      </>
    ),
    placeholder: "ما هي البيانات أو المرفقات الناقصة؟",
    actionClass: "bg-amber-600 hover:bg-amber-700",
    actionIcon: AlertTriangle,
    actionLabel: "تأكيد",
    successToast: "تم الانتقال إلى مرحلة الاستكمال",
    failToast: "فشل الإجراء",
    requiredToast: "أدخل السبب",
    inputTestId: "input-case-await-reason",
    buttonTestId: "button-confirm-await-case",
  },
  resume: {
    endpoint: "resume-from-completion",
    bodyField: "notes",
    required: false,
    icon: CheckCircle,
    iconClass: "text-green-600",
    title: "تم الاستكمال",
    description: (target) => (
      <>
        ستعود القضية إلى المرحلة المحفوظة قبل دخول مرحلة الاستكمال
        {target?.savedStage && (
          <>
            : <strong>{getStageLabel(target.savedStage as any)}</strong>
          </>
        )}
        .
      </>
    ),
    inputLabel: "ملاحظات (اختياري)",
    placeholder: "اكتب ملاحظات حول ما تم استكماله...",
    actionIcon: CheckCircle,
    actionLabel: "تأكيد العودة",
    successToast: "تم العودة من الاستكمال",
    failToast: "فشل الإجراء",
    inputTestId: "input-case-resume-notes",
    buttonTestId: "button-confirm-resume-case",
  },
};

interface LifecycleState {
  type: CaseLifecycleType | null;
  target: LawCase | null;
  value: string;
  // Secondary date input's value. Always reset to "" alongside `value`, so a
  // flow with no dateInput simply never reads it.
  dateValue: string;
}

export interface CaseLifecycleDialogProps {
  type: CaseLifecycleType | null;
  target: LawCase | null;
  value: string;
  dateValue: string;
  inProgress: boolean;
  onValueChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function useCaseLifecycleActions({
  refreshCases,
  toast,
}: {
  refreshCases: () => Promise<void> | void;
  toast: ToastFn;
}) {
  const [state, setState] = useState<LifecycleState>({
    type: null,
    target: null,
    value: "",
    dateValue: "",
  });
  const [inProgress, setInProgress] = useState(false);

  const open = (type: CaseLifecycleType) => (c: LawCase) =>
    setState({ type, target: c, value: "", dateValue: "" });

  const onClose = () =>
    setState({ type: null, target: null, value: "", dateValue: "" });

  const onConfirm = async () => {
    if (!state.type || !state.target) return;
    const config = LIFECYCLE_CONFIG[state.type];
    const text = state.value.trim();
    if (config.required && !text) {
      toast({ title: config.requiredToast!, variant: "destructive" });
      return;
    }
    // Mirror of the server's validatePauseUntil so the user gets the same Arabic
    // message without a round-trip. The server stays authoritative — this is the
    // client half of the past-date rule (HijriDatePicker exposes no `min`, so
    // the check is done here rather than by the input).
    const dateText = state.dateValue.trim();
    if (config.dateInput) {
      const dateError = pauseUntilError(dateText);
      if (dateError) {
        toast({ title: dateError, variant: "destructive" });
        return;
      }
    }
    setInProgress(true);
    try {
      const body: Record<string, string> = config.required
        ? { [config.bodyField]: text }
        : text
        ? { [config.bodyField]: text }
        : {};
      // Omitted entirely when blank — the server reads absent as "open-ended",
      // which is the pre-feature behaviour.
      if (config.dateInput && dateText) {
        body[config.dateInput.bodyField] = dateText;
      }
      await apiRequest(
        "POST",
        `/api/cases/${state.target.id}/${config.endpoint}`,
        body,
      );
      await refreshCases();
      toast({ title: config.successToast });
      onClose();
    } catch (err) {
      toast({
        title: config.failToast,
        description: extractApiError(err),
        variant: "destructive",
      });
    } finally {
      setInProgress(false);
    }
  };

  return {
    openPause: open("pause"),
    openUnpause: open("unpause"),
    openAwait: open("await"),
    openResume: open("resume"),
    dialogProps: {
      type: state.type,
      target: state.target,
      value: state.value,
      dateValue: state.dateValue,
      inProgress,
      onValueChange: (value: string) =>
        setState((s) => ({ ...s, value })),
      onDateChange: (dateValue: string) =>
        setState((s) => ({ ...s, dateValue })),
      onConfirm,
      onClose,
    } as CaseLifecycleDialogProps,
  };
}

export function CaseLifecycleDialog({
  type,
  target,
  value,
  dateValue,
  inProgress,
  onValueChange,
  onDateChange,
  onConfirm,
  onClose,
}: CaseLifecycleDialogProps) {
  if (!type) return null;
  const config = LIFECYCLE_CONFIG[type];
  const Icon = config.icon;
  const ActionIcon = config.actionIcon;
  // Client mirror of the server's past-date rule. HijriDatePicker takes no
  // `min`, so instead of a native constraint the confirm button is disabled and
  // the reason is shown inline — same outcome, and it keeps the Hijri/dual-date
  // picker this app uses for every other date rather than a Gregorian-only
  // native input.
  const dateError = config.dateInput ? pauseUntilError(dateValue) : null;
  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon className={cn("w-5 h-5", config.iconClass)} />
            {config.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {config.description(target)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 text-right">
          <Label>{config.inputLabel}</Label>
          <Textarea
            data-testid={config.inputTestId}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={config.placeholder}
            rows={3}
          />
        </div>
        {config.dateInput && (
          <PauseUntilField
            value={dateValue}
            onChange={onDateChange}
            testId={config.dateInput.testId}
          />
        )}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onClose}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            data-testid={config.buttonTestId}
            onClick={onConfirm}
            disabled={inProgress || (config.required && !value.trim()) || !!dateError}
            className={config.actionClass}
          >
            <ActionIcon className="w-4 h-4 ml-2" />
            {config.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
