import { Label } from "@/components/ui/label";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { validatePauseUntil, todayDateString } from "@shared/schema";

// The OPTIONAL "pause until" date field, shared by all four pause dialogs
// (cases / consultations / contracts / memos).
//
// This is a PRESENTATIONAL field, not workflow logic — the four pause HANDLERS
// stay separate per the deliberate no-DRY policy on workflow code. What is
// shared here is only the label, the hint wording and the past-date message, so
// the four dialogs can never drift on how the feature is EXPLAINED to the user.
//
// Uses HijriDatePicker like every other date in this app rather than a native
// <input type="date">, which would show a Gregorian-only picker. HijriDatePicker
// exposes no `min`, so the past-date rule is enforced by showing the error and
// letting the caller disable its confirm button on `hasError` — same outcome as
// a native min, and the server's validatePauseUntil stays authoritative either
// way (both call the SAME shared validator, so they cannot disagree).
export function pauseUntilError(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  return validatePauseUntil(text, todayDateString());
}

export function PauseUntilField({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  const error = pauseUntilError(value);
  return (
    <div className="space-y-2 text-right">
      <Label>تاريخ انتهاء التعليق (اختياري)</Label>
      <HijriDatePicker
        value={value}
        onChange={onChange}
        data-testid={testId}
      />
      {error
        ? <p className="text-xs text-destructive">{error}</p>
        : (
          <p className="text-xs text-muted-foreground">
            اتركه فارغاً ليبقى التعليق مفتوحاً حتى يُلغى يدوياً. عند تحديد تاريخ،
            يُلغى التعليق تلقائياً صباح اليوم التالي له.
          </p>
        )}
    </div>
  );
}
