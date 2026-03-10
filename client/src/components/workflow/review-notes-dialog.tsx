import { useState } from "react";
import { useForm } from "react-hook-form";
import { DualDateDisplay } from "@/components/ui/dual-date-display";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Check, X, RotateCcw, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ReviewNote,
  ReviewNoteActionValue,
  ReviewNoteActionLabels,
} from "@shared/schema";

interface ReviewNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "submit" | "respond";
  entityType: "case" | "consultation";
  entityId: string;
  existingNotes?: ReviewNote[];
  currentNote?: ReviewNote;
  onSubmit: (notes: string, action: ReviewNoteActionValue | null) => void;
  onRespond?: (noteId: string, action: ReviewNoteActionValue, justification: string) => void;
}

export function ReviewNotesDialog({
  open,
  onOpenChange,
  mode,
  entityType,
  entityId,
  existingNotes = [],
  currentNote,
  onSubmit,
  onRespond,
}: ReviewNotesDialogProps) {
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState<ReviewNoteActionValue | null>(null);
  const [justification, setJustification] = useState("");

  const returnCount = existingNotes.filter(n => n.action === "returned").length;
  const isThirdReturn = returnCount >= 2 && action === "returned";

  const handleSubmit = () => {
    if (mode === "submit") {
      onSubmit(notes, action);
    } else if (mode === "respond" && currentNote && onRespond && action) {
      onRespond(currentNote.id, action, justification);
    }
    setNotes("");
    setAction(null);
    setJustification("");
    onOpenChange(false);
  };

  const getActionIcon = (actionValue: ReviewNoteActionValue) => {
    switch (actionValue) {
      case "fully_accepted":
        return <Check className="h-4 w-4 text-green-500" />;
      case "partially_accepted":
        return <Check className="h-4 w-4 text-yellow-500" />;
      case "rejected":
        return <X className="h-4 w-4 text-red-500" />;
      case "returned":
        return <RotateCcw className="h-4 w-4 text-orange-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            {mode === "submit" ? "إضافة ملاحظات المراجعة" : "الرد على ملاحظات المراجعة"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "submit" && (
            <>
              {returnCount > 0 && (
                <div className="flex items-center gap-2 p-2 bg-orange-100 dark:bg-orange-900/30 rounded-md text-orange-700 dark:text-orange-300">
                  <RotateCcw className="h-4 w-4" />
                  <span className="text-sm">عدد مرات الإرجاع السابقة: {returnCount}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>الملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أدخل ملاحظات المراجعة..."
                  rows={4}
                  data-testid="input-review-notes"
                />
              </div>

              <div className="space-y-2">
                <Label>الإجراء</Label>
                <RadioGroup
                  value={action || ""}
                  onValueChange={(v) => setAction(v as ReviewNoteActionValue)}
                  className="grid grid-cols-2 gap-2"
                >
                  {Object.entries(ReviewNoteActionLabels).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <RadioGroupItem value={key} id={key} data-testid={`radio-action-${key}`} />
                      <Label htmlFor={key} className="flex items-center gap-1 cursor-pointer">
                        {getActionIcon(key as ReviewNoteActionValue)}
                        {label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {isThirdReturn && (
                <div className="flex items-center gap-2 p-3 bg-red-100 dark:bg-red-900/30 rounded-md text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">تحذير: هذا هو الإرجاع الثالث أو أكثر</p>
                    <p className="text-sm">سيتم إشعار مدير الفرع بهذا الإرجاع</p>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === "respond" && currentNote && (
            <>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{currentNote.reviewerName}</span>
                  <span className="text-xs text-muted-foreground">
                    <DualDateDisplay date={currentNote.createdAt} compact />
                  </span>
                </div>
                <p className="text-sm">{currentNote.notes}</p>
                {currentNote.action === "returned" && currentNote.returnReason && (
                  <div className="mt-2 p-2 bg-orange-100 dark:bg-orange-900/30 rounded text-orange-700 dark:text-orange-300">
                    <p className="text-xs font-medium">سبب الإرجاع:</p>
                    <p className="text-sm">{currentNote.returnReason}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>الإجراء المتخذ</Label>
                <RadioGroup
                  value={action || ""}
                  onValueChange={(v) => setAction(v as ReviewNoteActionValue)}
                  className="grid grid-cols-2 gap-2"
                >
                  {(["fully_accepted", "partially_accepted", "rejected"] as const).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <RadioGroupItem value={key} id={`respond-${key}`} data-testid={`radio-respond-${key}`} />
                      <Label htmlFor={`respond-${key}`} className="flex items-center gap-1 cursor-pointer">
                        {getActionIcon(key)}
                        {ReviewNoteActionLabels[key]}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>التبرير</Label>
                <Textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="أدخل تبرير الإجراء المتخذ..."
                  rows={3}
                  data-testid="input-justification"
                />
              </div>
            </>
          )}

          {existingNotes.length > 0 && (
            <div className="space-y-2">
              <Label>الملاحظات السابقة</Label>
              <ScrollArea className="h-32 rounded-md border p-2">
                <div className="space-y-2">
                  {existingNotes.map((note) => (
                    <div
                      key={note.id}
                      className={cn(
                        "p-2 rounded-md text-sm",
                        note.action === "returned" ? "bg-orange-50 dark:bg-orange-900/20" : "bg-muted"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-xs">{note.reviewerName}</span>
                        {note.action && (
                          <Badge variant="outline" className="text-[10px] h-5">
                            {getActionIcon(note.action)}
                            <span className="mr-1">{ReviewNoteActionLabels[note.action]}</span>
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{note.notes}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mode === "submit" ? !notes : !action}
            data-testid="button-submit-review"
          >
            {mode === "submit" ? "إرسال الملاحظات" : "حفظ الرد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
