import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract a human-readable error message from a caught error.
 *
 * apiRequest (via throwIfResNotOk in queryClient.ts) throws
 * `new Error(\`${res.status}: ${body}\`)` — e.g. `400: {"error":"..."}`.
 * This parses that format and returns the server's `error` field when the
 * body is JSON carrying one; otherwise it falls back to the raw message, and
 * finally to a generic Arabic message. Safe to call on any thrown value,
 * not just apiRequest errors.
 */
/**
 * A notification message as it should be shown to a human.
 *
 * 🔴 THIS SANITIZER OUTLIVES THE FEATURE THAT CREATED THE MARKER, DELIBERATELY.
 *
 * The old department-transfer REQUEST embedded a machine-readable marker in the
 * message body — `[DEPT_ID:<id>]` — because the notifications table has no field
 * for it. Both writers (requestCaseTransfer / requestConsultationTransfer) and
 * the reader that parsed it back out (the "طلب تحويل" arm of
 * respondToNotification) are now DELETED: the whole flow was dead — its approval
 * branch tested for a `responseType` value that ResponseType never contained.
 *
 * 🔴 DO NOT DELETE THIS FUNCTION WITH THEM. The marker is not gone from the
 * DATA: ~12 production notifications still carry it in their message text, and
 * three surfaces render that text raw — the bell, the notifications page and the
 * respond dialog (8 call sites). Removing the strip would start showing
 * `[DEPT_ID:abc123]` to real readers on rows that already exist. It is control
 * data, never content, and must not reach the reader — which stays true for
 * exactly as long as those rows do.
 *
 * Nothing writes the marker any more, so this is now a pure legacy-data reader.
 */
export function notificationDisplayMessage(message: string | null | undefined): string {
  return String(message ?? "").replace(/\[DEPT_ID:[^\]]*\]/g, "").trim();
}

export function extractApiError(err: unknown): string {
  const msg = (err as any)?.message || "";
  // format from throwIfResNotOk: "400: {"error":"..."}"
  // [\s\S] is a dotall equivalent — the `/s` flag isn't available under this
  // project's TS target (es2017), and the body may span multiple lines.
  const match = msg.match(/^\d+: ([\s\S]+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.error) return parsed.error;
    } catch {}
  }
  return msg || "حدث خطأ غير متوقع";
}

// ==================== AMOUNT DISPLAY ====================
// 🔴 THE FIRST AND ONLY MONEY FORMATTER IN THIS CODEBASE. There was none before
// — no Intl.NumberFormat, no currency helper anywhere — because law_cases
// .violation_amount (مبلغ المخالفة) is the schema's only monetary column. It
// lives here rather than inline in case-details-dialog because a formatting rule
// with an opinion about digits and grouping is a shared decision, not a detail of
// one panel; a second amount must reuse this, never re-derive it.
//
// THE DECISIONS, all deliberate:
//   • LATIN DIGITS (0-9), grouping comma, decimal period → "250,000.00".
//     NOT toLocaleString("ar-SA"), which renders Arabic-Indic digits in some
//     engines — the exact trap recorded for activity-log.tsx's CSV export. The
//     raw value is Latin and every other number in the app is Latin.
//   • PURE STRING MANIPULATION — Number() is never called, so a money value is
//     never parsed into a float and no rounding can occur. The stored value's
//     own digits are what get displayed.
//   • FRACTION PRESERVED VERBATIM, not padded or truncated. numeric(12,2) always
//     returns two decimals, so "250000.00" → "250,000.00"; anything else is
//     shown as stored rather than silently reshaped.
//   • FAIL-OPEN: a value that is not a plain decimal is returned UNCHANGED, never
//     blanked. Same tolerance rule as the grievance-result label lookup — a
//     display helper must not hide data it does not recognise.
//
// DISPLAY ONLY. The edit input binds the RAW string, so a user typing 250000.00
// is never fighting comma insertion, and what is written back is what was typed.
export function formatAmount(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return s;
  const [, sign, intPart, frac] = m;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${frac}`;
}
