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
