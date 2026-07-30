// Shared client helpers for every file-attachment surface: contract
// attachments, the case judgment deed (صك) and hearing minutes (ضبط الجلسة).
//
// EXTRACTED VERBATIM from contracts.tsx — the only change is that the endpoint
// is a parameter instead of a hardcoded `/api/contracts/${id}/attachments`.
// Nothing about the auth handling, the retry, the blob plumbing or the error
// reporting was redesigned on the way out; those behaviours were each paid for
// by a real bug and the comments explaining why are carried over with them.
//
// DELIBERATELY LEFT BEHIND in contracts.tsx: canDeleteAttachment and
// canUploadToSlot. Both are contract POLICY (the write-once
// contract_under_review slot, the per-slot upload rule), not transport, and
// neither has an analogue on the deed/minutes surfaces.
import { refreshAuthToken } from "@/lib/queryClient";

// Browser-native preview is reliable for PDFs and images. Office formats
// (.doc/.docx/.xls/.xlsx) need an external viewer; callers disable the button
// with a tooltip in those cases rather than shipping a half-broken
// Google-Docs-Viewer fallback that would require public file URLs.
export const PREVIEWABLE_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const canPreview = (mime: string): boolean => PREVIEWABLE_MIMES.has(mime);

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

function buildAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("lawfirm_token");
  const csrfToken = localStorage.getItem("lawfirm_csrf_token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  return headers;
}

// Low-level multipart POST — throws on failure, no UI side effects, so callers
// that batch several uploads can aggregate failures themselves.
//
// Multipart uploads can't go through apiRequest (which sets a JSON
// Content-Type); we hand-roll the fetch but still need the bearer token AND the
// CSRF token — the same protection the shared queryClient.apiRequest applies.
// Letting the browser pick the multipart Content-Type (with its boundary) is
// critical: setting it manually breaks parsing on the server.
//
// 401 + 403 are recovered transparently: a stale JWT (401) or a stale CSRF
// token (403 — 4h TTL while sessions are typically longer) was the silent cause
// of "uploads suddenly stop working until I refresh the page". The refresh goes
// through queryClient's single-flight refreshAuthToken — sharing the in-flight
// promise with apiRequest's 401 path and auth-context's scheduled refresh, so a
// concurrent refresh can't consume the rotation token out from under us — then
// the upload replays once. After that one retry, any non-2xx surfaces with the
// server's error message AND the HTTP status logged to console for triage.
export async function uploadAttachmentRaw(
  endpoint: string,
  file: File,
  extraFields?: Record<string, string | null | undefined>,
): Promise<void> {
  const buildFormData = (): FormData => {
    // Re-created per attempt — a consumed FormData can't be safely re-sent.
    // File objects survive multiple reads, so this is cheap.
    const fd = new FormData();
    fd.append("file", file);
    for (const [key, value] of Object.entries(extraFields || {})) {
      if (value !== null && value !== undefined && value !== "") fd.append(key, value);
    }
    return fd;
  };
  let res = await fetch(endpoint, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: buildFormData(),
    credentials: "same-origin",
  });
  if ((res.status === 401 || res.status === 403) && (await refreshAuthToken()).ok) {
    res = await fetch(endpoint, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: buildFormData(),
      credentials: "same-origin",
    });
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    // Surface to console so the user can hand a real diagnostic to support
    // instead of just "فشل الرفع".
    console.error("[attachment upload] failed", {
      status: res.status, endpoint, fileName: file.name, body: errBody,
    });
    throw new Error((errBody as any)?.error || `فشل رفع الملف (${res.status})`);
  }
}

// Bearer-token fetch + blob download. A plain anchor can't carry the auth
// header, so we fetch, read the filename back out of Content-Disposition
// (RFC-5987 form first, ASCII fallback second — the server sends both) and
// trigger a download from the blob. onError receives the server's real message
// (404 "المرفق غير موجود" vs 410 "الملف مفقود" vs 403) rather than a useless
// generic failure.
export async function downloadAttachment(
  endpoint: string,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const res = await fetch(endpoint, { headers: buildAuthHeaders(), credentials: "same-origin" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("[attachment download] failed", { status: res.status, endpoint, body: errBody });
      throw new Error((errBody as any)?.error || `فشل التحميل (${res.status})`);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
    const fileName = m ? decodeURIComponent(m[1]) : "download";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (err: any) {
    onError(err?.message || String(err));
  }
}

// Fetches the file as a blob (so we can attach the auth + CSRF headers —
// window.open can't), creates a blob URL, and opens it in a new tab. The blob
// URL's lack of Content-Disposition lets the browser inline-render PDFs and
// images even though the download endpoint streams with `attachment`.
//
// A NEW TAB, not an inline viewer, and that is load-bearing: the app's CSP sets
// objectSrc 'none' and leaves frameSrc falling back to defaultSrc 'self', so
// <object>/<embed> and a blob: <iframe> are all blocked. A top-level navigation
// to a blob URL is a new browsing context and is not governed by the opener's
// frame-src, which is why this works under the same policy.
//
// We deliberately don't revoke the URL — there's no reliable "tab closed"
// signal, and the blob is freed when the tab unloads anyway.
export async function previewAttachment(
  endpoint: string,
  mimeType: string,
  onError: (message: string) => void,
): Promise<void> {
  if (!canPreview(mimeType)) return;
  try {
    const res = await fetch(endpoint, { headers: buildAuthHeaders(), credentials: "same-origin" });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("[attachment preview] failed", { status: res.status, endpoint, mimeType, body: errBody });
      throw new Error((errBody as any)?.error || `فشل تحميل المعاينة (${res.status})`);
    }
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  } catch (err: any) {
    onError(err?.message || String(err));
  }
}
