// One-file-per-parent attachment control. Used by the judgment deed (صك) on a
// case and the minutes (ضبط الجلسة) on a hearing — both of which allow exactly
// ONE file, enforced by a unique index in the DB, so re-uploading REPLACES
// rather than adding to a list.
//
// Contracts deliberately do NOT use this: they have designated slots plus a
// free "additional" list, per-slot policy (the write-once contract_under_review
// rule) and slot-aware upload gating. Those stay in contracts.tsx. What the
// three surfaces DO share is the transport, and that lives in
// lib/attachment-client.
//
// The endpoint contract this expects, matching both server route families:
//   GET    <endpoint>            -> { attachment: {...} | null }
//   POST   <endpoint>            (multipart, field "file")
//   GET    <endpoint>/download
//   DELETE <endpoint>
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Download, Eye, Trash2, Paperclip, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/lib/utils";
import {
  uploadAttachmentRaw,
  downloadAttachment,
  previewAttachment,
  formatFileSize,
  canPreview,
} from "@/lib/attachment-client";

// Mirrors CaseAttachment / HearingAttachment minus the parent-id field, which
// this component never needs (the endpoint already identifies the parent).
type SingleAttachment = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  missing?: boolean;
};

export function SingleAttachmentControl({
  endpoint,
  label,
  emptyHint,
  canEdit,
  onChanged,
  onAttachedChange,
}: {
  endpoint: string;
  label: string;
  emptyHint?: string;
  // Whether THIS user may upload / replace / delete. The server enforces the
  // same rule on every route; this only decides what renders, keeping the
  // codebase's visibility == authorization invariant.
  canEdit: boolean;
  onChanged?: () => void;
  // Reports "is a file attached" after EVERY read — the initial load as well as
  // each upload/delete — so a host can drive its own UI (e.g. the hearing
  // workflow's done-state) off this control's single fetch instead of issuing a
  // second one.
  onAttachedChange?: (attached: boolean) => void;
}) {
  const { toast } = useToast();
  const [attachment, setAttachment] = useState<SingleAttachment | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachment = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", endpoint);
      const data = await res.json() as { attachment: SingleAttachment | null };
      setAttachment(data.attachment ?? null);
      onAttachedChange?.(!!data.attachment);
    } catch {
      // A failed read leaves the control in its empty state rather than
      // throwing into the host dialog — the upload affordance still works.
      setAttachment(null);
      onAttachedChange?.(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const handleUpload = async (file: File) => {
    setBusy(true);
    try {
      await uploadAttachmentRaw(endpoint, file);
      await fetchAttachment();
      onChanged?.();
      toast({ title: attachment ? "تم استبدال الملف بنجاح" : "تم رفع الملف بنجاح" });
    } catch (err: any) {
      toast({ title: "فشل الرفع", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setBusy(false);
      // Clear the input so re-picking the SAME file fires onChange again.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await apiRequest("DELETE", endpoint);
      await fetchAttachment();
      onChanged?.();
      toast({ title: "تم حذف الملف" });
    } catch (err) {
      toast({ title: "فشل الحذف", description: extractApiError(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-3 text-right space-y-2" dir="rtl">
      <div className="flex items-center gap-2">
        <Paperclip className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">جارٍ التحميل...</p>
      ) : attachment ? (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm truncate" title={attachment.fileName}>{attachment.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(attachment.fileSize)}
            </p>
            {attachment.missing && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                الملف مفقود — يرجى إعادة الرفع
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!attachment.missing && canPreview(attachment.mimeType) && (
              <Button
                size="icon"
                variant="ghost"
                title="معاينة"
                data-testid="button-preview-single-attachment"
                onClick={() => previewAttachment(
                  `${endpoint}/download`,
                  attachment.mimeType,
                  (description) => toast({ title: "فشل عرض الملف", description, variant: "destructive" }),
                )}
              >
                <Eye className="w-4 h-4" />
              </Button>
            )}
            {!attachment.missing && (
              <Button
                size="icon"
                variant="ghost"
                title="تحميل"
                data-testid="button-download-single-attachment"
                onClick={() => downloadAttachment(
                  `${endpoint}/download`,
                  (description) => toast({ title: "فشل التحميل", description, variant: "destructive" }),
                )}
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {canEdit && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  title="استبدال"
                  disabled={busy}
                  data-testid="button-replace-single-attachment"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="حذف"
                  disabled={busy}
                  data-testid="button-delete-single-attachment"
                  onClick={handleDelete}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">{emptyHint || "لم يتم إرفاق ملف بعد"}</p>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              data-testid="button-upload-single-attachment"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 ml-1" />
              {busy ? "جارٍ الرفع..." : "رفع ملف"}
            </Button>
          )}
        </div>
      )}

      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          data-testid="input-single-attachment-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      )}
    </div>
  );
}
