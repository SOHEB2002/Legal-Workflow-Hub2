import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUsers } from "@/lib/users-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { DelegationType, DelegationTypeLabels } from "@shared/schema";
import type { User, DelegationTypeValue } from "@shared/schema";
import { AlertTriangle, Calendar } from "lucide-react";

interface VacationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function VacationDialog({ open, onOpenChange, user }: VacationDialogProps) {
  const { users } = useAuth();
  const { scheduleVacation, checkVacationConflicts } = useUsers();
  const { toast } = useToast();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [delegateTo, setDelegateTo] = useState<string>("");
  const [delegationType, setDelegationType] = useState<DelegationTypeValue>(DelegationType.FULL);
  const [autoReassign, setAutoReassign] = useState(false);

  const availableUsers = users.filter(u => u.id !== user?.id && u.isActive);

  const conflict = user && startDate && endDate 
    ? checkVacationConflicts(user.id, startDate, endDate) 
    : null;

  const handleSubmit = () => {
    if (!user || !startDate || !endDate) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء ملء جميع الحقول المطلوبة",
      });
      return;
    }

    if (new Date(startDate) >= new Date(endDate)) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية",
      });
      return;
    }

    if (conflict) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "يوجد تعارض مع إجازة مجدولة. الرجاء اختيار تواريخ أخرى.",
      });
      return;
    }

    scheduleVacation(user.id, {
      startDate,
      endDate,
      reason,
      delegateTo: delegateTo === "none" ? null : delegateTo || null,
      delegationType,
      autoReassign,
    });

    toast({ title: "تم جدولة الإجازة بنجاح" });
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setStartDate("");
    setEndDate("");
    setReason("");
    setDelegateTo("");
    setDelegationType(DelegationType.FULL);
    setAutoReassign(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            جدولة إجازة - {user?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {conflict && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                يوجد تعارض مع إجازة مجدولة من {conflict.startDate} إلى {conflict.endDate}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>تاريخ البداية *</Label>
              <HijriDatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="اختر تاريخ البداية"
                data-testid="input-vacation-start"
              />
            </div>
            <div>
              <Label>تاريخ النهاية *</Label>
              <HijriDatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="اختر تاريخ النهاية"
                data-testid="input-vacation-end"
              />
            </div>
          </div>

          <div>
            <Label>السبب</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب الإجازة..."
              data-testid="input-vacation-reason"
            />
          </div>

          <div>
            <Label>المفوض إليه</Label>
            <Select value={delegateTo} onValueChange={setDelegateTo}>
              <SelectTrigger data-testid="select-delegate-to">
                <SelectValue placeholder="اختر المفوض" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون تفويض</SelectItem>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {delegateTo && delegateTo !== "none" && (
            <div>
              <Label>نوع التفويض</Label>
              <Select value={delegationType} onValueChange={(v) => setDelegationType(v as DelegationTypeValue)}>
                <SelectTrigger data-testid="select-delegation-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DelegationTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>إعادة توزيع القضايا تلقائياً</Label>
            <Switch
              checked={autoReassign}
              onCheckedChange={setAutoReassign}
              data-testid="switch-auto-reassign"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={!!conflict} data-testid="button-submit-vacation">
            جدولة الإجازة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
