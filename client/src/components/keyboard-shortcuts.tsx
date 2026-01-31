import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface Shortcut {
  keys: string[];
  description: string;
  action?: () => void;
}

interface KeyboardShortcutsProviderProps {
  children: React.ReactNode;
  onNewCase?: () => void;
  onNewConsultation?: () => void;
  onNewClient?: () => void;
  onNewHearing?: () => void;
}

export function KeyboardShortcutsProvider({ 
  children, 
  onNewCase,
  onNewConsultation,
  onNewClient,
  onNewHearing,
}: KeyboardShortcutsProviderProps) {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [, setLocation] = useLocation();

  const shortcuts: Shortcut[] = [
    { keys: ["Ctrl", "K"], description: "فتح البحث السريع" },
    { keys: ["Ctrl", "/"], description: "عرض الاختصارات" },
    { keys: ["Ctrl", "N"], description: "قضية جديدة", action: onNewCase },
    { keys: ["Ctrl", "Shift", "N"], description: "استشارة جديدة", action: onNewConsultation },
    { keys: ["Alt", "1"], description: "لوحة التحكم", action: () => setLocation("/") },
    { keys: ["Alt", "2"], description: "القضايا", action: () => setLocation("/cases") },
    { keys: ["Alt", "3"], description: "الاستشارات", action: () => setLocation("/consultations") },
    { keys: ["Alt", "4"], description: "العملاء", action: () => setLocation("/clients") },
    { keys: ["Alt", "5"], description: "الجلسات", action: () => setLocation("/hearings") },
    { keys: ["Escape"], description: "إغلاق النوافذ المنبثقة" },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
    const key = e.key.toLowerCase();

    if (e.key === "Escape") {
      setShowShortcuts(false);
      return;
    }

    if (ctrlKey && e.key === "/") {
      e.preventDefault();
      setShowShortcuts(true);
      return;
    }

    if (ctrlKey && key === "n" && !e.shiftKey) {
      e.preventDefault();
      onNewCase?.();
      return;
    }

    if (ctrlKey && e.shiftKey && key === "n") {
      e.preventDefault();
      onNewConsultation?.();
      return;
    }

    if (e.altKey && e.key === "1") {
      e.preventDefault();
      setLocation("/");
      return;
    }

    if (e.altKey && e.key === "2") {
      e.preventDefault();
      setLocation("/cases");
      return;
    }

    if (e.altKey && e.key === "3") {
      e.preventDefault();
      setLocation("/consultations");
      return;
    }

    if (e.altKey && e.key === "4") {
      e.preventDefault();
      setLocation("/clients");
      return;
    }

    if (e.altKey && e.key === "5") {
      e.preventDefault();
      setLocation("/hearings");
      return;
    }
  }, [onNewCase, onNewConsultation, setLocation]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {children}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-md" dir="rtl" data-testid="shortcuts-modal">
          <DialogHeader>
            <DialogTitle className="text-right">اختصارات لوحة المفاتيح</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {shortcuts.map((shortcut, index) => (
              <div 
                key={index} 
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
                data-testid={`shortcut-item-${index}`}
              >
                <span className="text-sm">{shortcut.description}</span>
                <div className="flex gap-1">
                  {shortcut.keys.map((key, i) => (
                    <Badge key={i} variant="secondary" className="font-mono text-xs">
                      {key}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4">
            اضغط Escape للإغلاق
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function useKeyboardShortcuts() {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const openShortcuts = useCallback(() => {
    setShowShortcuts(true);
  }, []);

  return { showShortcuts, setShowShortcuts, openShortcuts };
}
