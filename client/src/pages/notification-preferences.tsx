import { useState, useEffect } from "react";
import { Bell, Volume2, VolumeX, Clock, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotifications } from "@/lib/notifications-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  NotificationType,
  NotificationTypeLabels,
  DigestMode,
  DigestModeLabels,
} from "@shared/schema";
import type { NotificationTypeValue, DigestModeValue } from "@shared/schema";

export default function NotificationPreferencesPage() {
  const { user } = useAuth();
  const { getUserPreferences, updateUserPreferences } = useNotifications();
  const { toast } = useToast();

  const userId = user?.id || "";
  const preferences = getUserPreferences(userId);

  const [enableSound, setEnableSound] = useState(preferences.enableSound);
  const [enableDesktop, setEnableDesktop] = useState(preferences.enableDesktop);
  const [digestMode, setDigestMode] = useState<DigestModeValue>(preferences.digestMode);
  const [mutedTypes, setMutedTypes] = useState<NotificationTypeValue[]>(preferences.mutedTypes);
  const [quietHoursStart, setQuietHoursStart] = useState(preferences.quietHoursStart || "");
  const [quietHoursEnd, setQuietHoursEnd] = useState(preferences.quietHoursEnd || "");
  const [enableQuietHours, setEnableQuietHours] = useState(!!preferences.quietHoursStart);
  const [notifyOnAssignment, setNotifyOnAssignment] = useState(preferences.notifyOnAssignment ?? true);
  const [notifyOnStageChange, setNotifyOnStageChange] = useState(preferences.notifyOnStageChange ?? true);
  const [notifyOnReviewNotes, setNotifyOnReviewNotes] = useState(preferences.notifyOnReviewNotes ?? true);
  const [notifyOnReturn, setNotifyOnReturn] = useState(preferences.notifyOnReturn ?? true);
  const [notifyOnSlaWarning, setNotifyOnSlaWarning] = useState(preferences.notifyOnSlaWarning ?? true);

  useEffect(() => {
    const prefs = getUserPreferences(userId);
    setEnableSound(prefs.enableSound);
    setEnableDesktop(prefs.enableDesktop);
    setDigestMode(prefs.digestMode);
    setMutedTypes(prefs.mutedTypes);
    setQuietHoursStart(prefs.quietHoursStart || "");
    setQuietHoursEnd(prefs.quietHoursEnd || "");
    setEnableQuietHours(!!prefs.quietHoursStart);
    setNotifyOnAssignment(prefs.notifyOnAssignment ?? true);
    setNotifyOnStageChange(prefs.notifyOnStageChange ?? true);
    setNotifyOnReviewNotes(prefs.notifyOnReviewNotes ?? true);
    setNotifyOnReturn(prefs.notifyOnReturn ?? true);
    setNotifyOnSlaWarning(prefs.notifyOnSlaWarning ?? true);
  }, [userId, getUserPreferences]);

  const handleSave = () => {
    updateUserPreferences(userId, {
      enableSound,
      enableDesktop,
      digestMode,
      mutedTypes,
      quietHoursStart: enableQuietHours ? quietHoursStart : null,
      quietHoursEnd: enableQuietHours ? quietHoursEnd : null,
      notifyOnAssignment,
      notifyOnStageChange,
      notifyOnReviewNotes,
      notifyOnReturn,
      notifyOnSlaWarning,
    });
    toast({ title: "تم حفظ التفضيلات بنجاح" });
  };

  const toggleMutedType = (type: NotificationTypeValue) => {
    setMutedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Bell className="w-8 h-8 text-accent" />
        <div>
          <h1 className="text-2xl font-bold">تفضيلات الإشعارات</h1>
          <p className="text-muted-foreground">تخصيص إعدادات الإشعارات الخاصة بك</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            الصوت والتنبيهات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {enableSound ? <Volume2 className="w-5 h-5 text-accent" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}
              <div>
                <Label>تنبيه صوتي</Label>
                <p className="text-sm text-muted-foreground">تشغيل صوت عند وصول إشعار جديد</p>
              </div>
            </div>
            <Switch
              checked={enableSound}
              onCheckedChange={setEnableSound}
              data-testid="switch-enable-sound"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-accent" />
              <div>
                <Label>إشعارات سطح المكتب</Label>
                <p className="text-sm text-muted-foreground">عرض إشعارات على سطح المكتب</p>
              </div>
            </div>
            <Switch
              checked={enableDesktop}
              onCheckedChange={setEnableDesktop}
              data-testid="switch-enable-desktop"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            وضع الإشعارات
          </CardTitle>
          <CardDescription>
            اختر كيف تريد استلام الإشعارات
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={digestMode} onValueChange={(v) => setDigestMode(v as DigestModeValue)}>
            <SelectTrigger data-testid="select-digest-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DigestModeLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">
            {digestMode === DigestMode.INSTANT && "ستصلك الإشعارات فور إرسالها"}
            {digestMode === DigestMode.DAILY && "ستصلك ملخص يومي بالإشعارات"}
            {digestMode === DigestMode.WEEKLY && "ستصلك ملخص أسبوعي بالإشعارات"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="w-5 h-5" />
            أوقات الهدوء
          </CardTitle>
          <CardDescription>
            إيقاف الإشعارات خلال فترة معينة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>تفعيل أوقات الهدوء</Label>
            <Switch
              checked={enableQuietHours}
              onCheckedChange={setEnableQuietHours}
              data-testid="switch-quiet-hours"
            />
          </div>
          {enableQuietHours && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>من الساعة</Label>
                <Input
                  type="time"
                  value={quietHoursStart}
                  onChange={(e) => setQuietHoursStart(e.target.value)}
                  data-testid="input-quiet-start"
                />
              </div>
              <div>
                <Label>إلى الساعة</Label>
                <Input
                  type="time"
                  value={quietHoursEnd}
                  onChange={(e) => setQuietHoursEnd(e.target.value)}
                  data-testid="input-quiet-end"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>إشعارات سير العمل</CardTitle>
          <CardDescription>
            التحكم في إشعارات إدارة القضايا والاستشارات
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>الإسناد والتعيين</Label>
              <p className="text-sm text-muted-foreground">إشعار عند إسناد قضية أو استشارة جديدة</p>
            </div>
            <Switch
              checked={notifyOnAssignment}
              onCheckedChange={setNotifyOnAssignment}
              data-testid="switch-notify-assignment"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>تغيير المرحلة</Label>
              <p className="text-sm text-muted-foreground">إشعار عند انتقال القضية لمرحلة جديدة</p>
            </div>
            <Switch
              checked={notifyOnStageChange}
              onCheckedChange={setNotifyOnStageChange}
              data-testid="switch-notify-stage-change"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>ملاحظات المراجعة</Label>
              <p className="text-sm text-muted-foreground">إشعار عند استلام ملاحظات من لجنة المراجعة</p>
            </div>
            <Switch
              checked={notifyOnReviewNotes}
              onCheckedChange={setNotifyOnReviewNotes}
              data-testid="switch-notify-review-notes"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>الإرجاع للتعديل</Label>
              <p className="text-sm text-muted-foreground">إشعار عند إرجاع العمل للتعديل</p>
            </div>
            <Switch
              checked={notifyOnReturn}
              onCheckedChange={setNotifyOnReturn}
              data-testid="switch-notify-return"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>تحذيرات SLA</Label>
              <p className="text-sm text-muted-foreground">إشعار عند اقتراب أو تجاوز المواعيد النهائية</p>
            </div>
            <Switch
              checked={notifyOnSlaWarning}
              onCheckedChange={setNotifyOnSlaWarning}
              data-testid="switch-notify-sla-warning"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أنواع الإشعارات</CardTitle>
          <CardDescription>
            اختر أنواع الإشعارات التي تريد إيقافها (الموتة)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(NotificationTypeLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <Checkbox
                  id={`muted-${key}`}
                  checked={mutedTypes.includes(key as NotificationTypeValue)}
                  onCheckedChange={() => toggleMutedType(key as NotificationTypeValue)}
                  data-testid={`checkbox-mute-${key}`}
                />
                <label htmlFor={`muted-${key}`} className="text-sm cursor-pointer flex-1">
                  {label}
                </label>
                {mutedTypes.includes(key as NotificationTypeValue) && (
                  <span className="text-xs text-muted-foreground">موتة</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} data-testid="button-save-preferences">
          حفظ التفضيلات
        </Button>
      </div>
    </div>
  );
}
