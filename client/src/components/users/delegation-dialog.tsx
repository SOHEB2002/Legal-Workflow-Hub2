import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DelegationType, DelegationTypeLabels, PermissionsList, PermissionLabels } from "@shared/schema";
import type { User, DelegationTypeValue, PermissionType } from "@shared/schema";
import { UserCheck, AlertTriangle } from "lucide-react";

interface DelegationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function DelegationDialog({ open, onOpenChange, user }: DelegationDialogProps) {
  const { users } = useAuth();
  const { createDelegation, getEffectivePermissions } = useUsers();
  const { toast } = useToast();

  const [toUserId, setToUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [delegationType, setDelegationType] = useState<DelegationTypeValue>(DelegationType.FULL);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  const availableUsers = users.filter(u => u.id !== user?.id && u.isActive);
  const userPermissions = user ? getEffectivePermissions(user.id) : [];

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permission) 
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const handleSubmit = () => {
    if (!user || !toUserId || !startDate || !endDate) {
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

    if (delegationType === DelegationType.PARTIAL && selectedPermissions.length === 0) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء اختيار الصلاحيات المفوضة",
      });
      return;
    }

    createDelegation({
      fromUserId: user.id,
      toUserId,
      startDate,
      endDate,
      type: delegationType,
      permissions: delegationType === DelegationType.PARTIAL ? selectedPermissions : [],
      reason,
    });

    toast({ title: "تم إنشاء التفويض بنجاح" });
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setToUserId("");
    setStartDate("");
    setEndDate("");
    setDelegationType(DelegationType.FULL);
    setSelectedPermissions([]);
    setReason("");
  };

  const selectedUserName = availableUsers.find(u => u.id === toUserId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" />
            إنشاء تفويض - {user?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>المفوض إليه *</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger data-testid="select-delegate-user">
                <SelectValue placeholder="اختر المستخدم" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>تاريخ البداية *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-delegation-start"
              />
            </div>
            <div>
              <Label>تاريخ النهاية *</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-delegation-end"
              />
            </div>
          </div>

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

          {delegationType === DelegationType.PARTIAL && (
            <div>
              <Label className="mb-2 block">الصلاحيات المفوضة</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {PermissionsList.map((permission) => (
                  <div key={permission} className="flex items-center gap-2">
                    <Checkbox
                      id={permission}
                      checked={selectedPermissions.includes(permission)}
                      onCheckedChange={() => handlePermissionToggle(permission)}
                      disabled={!userPermissions.includes(permission as PermissionType)}
                    />
                    <Label htmlFor={permission} className="text-sm cursor-pointer">
                      {PermissionLabels[permission as PermissionType]}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>السبب</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب التفويض..."
              data-testid="input-delegation-reason"
            />
          </div>

          {toUserId && delegationType === DelegationType.FULL && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                سيحصل {selectedUserName} على جميع صلاحياتك خلال فترة التفويض
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} data-testid="button-submit-delegation">
            إنشاء التفويض
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
