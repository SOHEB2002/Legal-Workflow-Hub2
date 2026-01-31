import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowUp, ArrowDown, RotateCcw, Save, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useDashboard, type WidgetSize, type WidgetConfig } from "@/lib/dashboard-context";
import { widgetIcons } from "@/components/dashboard-widgets";

const sizeLabels: Record<WidgetSize, string> = {
  small: "صغير",
  medium: "متوسط",
  large: "كبير",
  full: "عرض كامل",
};

export default function DashboardSettingsPage() {
  const { widgets, updateWidget, moveWidget, resetToDefault } = useDashboard();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const sortedWidgets = [...widgets].sort((a, b) => a.position - b.position);

  const handleVisibilityChange = (id: string, checked: boolean) => {
    updateWidget(id, { isVisible: checked });
  };

  const handleSizeChange = (id: string, size: WidgetSize) => {
    updateWidget(id, { size });
  };

  const handleReset = () => {
    resetToDefault();
    toast({ title: "تم استعادة الإعدادات الافتراضية" });
  };

  const handleSave = () => {
    toast({ title: "تم حفظ التغييرات" });
    setLocation("/");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تخصيص لوحة التحكم</h1>
            <p className="text-muted-foreground">اختر العناصر المعروضة وترتيبها</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset} data-testid="button-reset-defaults">
            <RotateCcw className="w-4 h-4 ml-2" />
            استعادة الافتراضي
          </Button>
          <Button onClick={handleSave} data-testid="button-save-settings">
            <Save className="w-4 h-4 ml-2" />
            حفظ والعودة
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>عناصر لوحة التحكم</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="grid grid-cols-[auto_1fr_120px_80px] gap-4 px-4 py-2 font-medium text-muted-foreground border-b">
              <span>إظهار</span>
              <span>العنصر</span>
              <span>الحجم</span>
              <span>الترتيب</span>
            </div>
            {sortedWidgets.map((widget, index) => {
              const Icon = widgetIcons[widget.id];
              return (
                <div 
                  key={widget.id}
                  className="grid grid-cols-[auto_1fr_120px_80px] gap-4 items-center px-4 py-3 rounded-lg border bg-muted/30"
                  data-testid={`widget-row-${widget.id}`}
                >
                  <Checkbox
                    id={`visible-${widget.id}`}
                    checked={widget.isVisible}
                    onCheckedChange={(checked) => handleVisibilityChange(widget.id, !!checked)}
                    data-testid={`checkbox-${widget.id}`}
                  />
                  <div className="flex items-center gap-3">
                    {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
                    <Label htmlFor={`visible-${widget.id}`} className="cursor-pointer">
                      {widget.title}
                    </Label>
                  </div>
                  <Select
                    value={widget.size}
                    onValueChange={(value: WidgetSize) => handleSizeChange(widget.id, value)}
                  >
                    <SelectTrigger data-testid={`select-size-${widget.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">{sizeLabels.small}</SelectItem>
                      <SelectItem value="medium">{sizeLabels.medium}</SelectItem>
                      <SelectItem value="large">{sizeLabels.large}</SelectItem>
                      <SelectItem value="full">{sizeLabels.full}</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveWidget(widget.id, "up")}
                      disabled={index === 0}
                      data-testid={`button-move-up-${widget.id}`}
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveWidget(widget.id, "down")}
                      disabled={index === sortedWidgets.length - 1}
                      data-testid={`button-move-down-${widget.id}`}
                    >
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
