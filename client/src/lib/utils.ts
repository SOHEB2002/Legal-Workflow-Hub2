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
