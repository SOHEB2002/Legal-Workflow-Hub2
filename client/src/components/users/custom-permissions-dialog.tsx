import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUsers } from "@/lib/users-context";
import { useToast } from "@/hooks/use-toast";
import { 
  PermissionsList, 
  PermissionLabels, 
  RolePermissions,
  UserRoleLabels,
} from "@shared/schema";
import type { User, PermissionType, UserRoleType } from "@shared/schema";
import { Shield, AlertTriangle, Plus, Minus } from "lucide-react";

interface CustomPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function CustomPermissionsDialog({ open, onOpenChange, user }: CustomPermissionsDialogProps) {
  const { grantCustomPermission, revokeCustomPermission, customPermissions, getEffectivePermissions } = useUsers();
  const { toast } = useToast();

  const [additionalPermissions, setAdditionalPermissions] = useState<string[]>([]);
  const [restrictedPermissions, setRestrictedPermissions] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const userCustom = user ? customPermissions.find(p => p.userId === user.id) : null;
  const rolePermissions = user ? RolePermissions[user.role as UserRoleType] || [] : [];

  useEffect(() => {
    if (userCustom) {
      setAdditionalPermissions(userCustom.additionalPermissions);
      setRestrictedPermissions(userCustom.restrictedPermissions);
      setReason(userCustom.reason);
      setExpiresAt(userCustom.expiresAt || "");
    } else {
      setAdditionalPermissions([]);
      setRestrictedPermissions([]);
      setReason("");
      setExpiresAt("");
    }
  }, [userCustom, open]);

  const handleAddPermission = (permission: string) => {
    if (!additionalPermissions.includes(permission)) {
      setAdditionalPermissions(prev => [...prev, permission]);
    }
    setRestrictedPermissions(prev => prev.filter(p => p !== permission));
  };

  const handleRestrictPermission = (permission: string) => {
    if (!restrictedPermissions.includes(permission)) {
      setRestrictedPermissions(prev => [...prev, permission]);
    }
    setAdditionalPermissions(prev => prev.filter(p => p !== permission));
  };

  const handleRemoveFromBoth = (permission: string) => {
    setAdditionalPermissions(prev => prev.filter(p => p !== permission));
    setRestrictedPermissions(prev => prev.filter(p => p !== permission));
  };

  const handleSubmit = () => {
    if (!user) return;

    if ((additionalPermissions.length > 0 || restrictedPermissions.length > 0) && !reason) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "الرجاء إدخال سبب التخصيص",
      });
      return;
    }

    grantCustomPermission(
      user.id, 
      additionalPermissions, 
      reason, 
      expiresAt || null
    );

    toast({ title: "تم تحديث الصلاحيات المخصصة" });
    onOpenChange(false);
  };

  const handleRevoke = () => {
    if (!user) return;
    revokeCustomPermission(user.id);
    toast({ title: "تم إلغاء الصلاحيات المخصصة" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            تخصيص الصلاحيات - {user?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              الدور الحالي: <Badge variant="outline">{user ? UserRoleLabels[user.role as UserRoleType] : ""}</Badge>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              صلاحيات الدور الأساسية: {rolePermissions.length} صلاحية
            </p>
          </div>

          <Tabs defaultValue="role" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="role">صلاحيات الدور</TabsTrigger>
              <TabsTrigger value="additional">إضافية ({additionalPermissions.length})</TabsTrigger>
              <TabsTrigger value="restricted">مقيدة ({restrictedPermissions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="role" className="mt-4">
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {rolePermissions.map((permission) => (
                  <div key={permission} className="flex items-center justify-between gap-2 p-1">
                    <span className="text-sm">{PermissionLabels[permission as PermissionType]}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleRestrictPermission(permission)}
                    >
                      <Minus className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="additional" className="mt-4">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {additionalPermissions.map((permission) => (
                    <Badge key={permission} variant="default" className="gap-1">
                      {PermissionLabels[permission as PermissionType]}
                      <button onClick={() => handleRemoveFromBoth(permission)} className="ml-1">
                        x
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-md p-3">
                  {PermissionsList.filter(p => !rolePermissions.includes(p as PermissionType) && !additionalPermissions.includes(p)).map((permission) => (
                    <div key={permission} className="flex items-center justify-between gap-2 p-1">
                      <span className="text-sm text-muted-foreground">{PermissionLabels[permission as PermissionType]}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleAddPermission(permission)}
                      >
                        <Plus className="w-3 h-3 text-green-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="restricted" className="mt-4">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {restrictedPermissions.map((permission) => (
                    <Badge key={permission} variant="destructive" className="gap-1">
                      {PermissionLabels[permission as PermissionType]}
                      <button onClick={() => handleRemoveFromBoth(permission)} className="ml-1">
                        x
                      </button>
                    </Badge>
                  ))}
                </div>
                {restrictedPermissions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    لا توجد صلاحيات مقيدة
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div>
            <Label>السبب *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب تخصيص الصلاحيات..."
              data-testid="input-permissions-reason"
            />
          </div>

          <div>
            <Label>تاريخ الانتهاء (اختياري)</Label>
            <HijriDatePicker
              value={expiresAt}
              onChange={setExpiresAt}
              placeholder="اختر تاريخ الانتهاء"
              data-testid="input-permissions-expires"
            />
          </div>

          {(additionalPermissions.length > 0 || restrictedPermissions.length > 0) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                سيتم تطبيق التغييرات فوراً على صلاحيات المستخدم
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          {userCustom && (
            <Button variant="destructive" onClick={handleRevoke}>
              إلغاء التخصيص
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} data-testid="button-submit-permissions">
            حفظ التغييرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
