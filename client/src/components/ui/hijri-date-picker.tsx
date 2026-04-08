import { useState, useMemo, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  gregorianToHijri,
  findFirstDayOfHijriMonth,
  getHijriMonthDays,
  HIJRI_MONTHS,
  formatDualDate,
} from "@/lib/date-utils";

interface HijriDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function HijriDatePicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  className,
  "data-testid": testId,
}: HijriDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hijri" | "gregorian">("hijri");

  const selectedDate = useMemo(() => {
    if (!value) return undefined;
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  const displayText = useMemo(() => {
    if (!selectedDate) return "";
    const dual = formatDualDate(selectedDate);
    return `${dual.hijri} — ${dual.gregorian} م`;
  }, [selectedDate]);

  const handleSelectGregorian = useCallback(
    (date: Date | undefined) => {
      if (date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        onChange(`${yyyy}-${mm}-${dd}`);
        setOpen(false);
      }
    },
    [onChange]
  );

  const handleSelectHijri = useCallback(
    (gDate: Date) => {
      const yyyy = gDate.getFullYear();
      const mm = String(gDate.getMonth() + 1).padStart(2, "0");
      const dd = String(gDate.getDate()).padStart(2, "0");
      onChange(`${yyyy}-${mm}-${dd}`);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-testid={testId}
          className={cn(
            "w-full justify-start text-right font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0" />
          <span className="truncate">{displayText || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" dir="rtl">
        <div className="flex border-b">
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-sm font-medium text-center transition-colors",
              mode === "hijri"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
            onClick={() => setMode("hijri")}
          >
            هجري
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-sm font-medium text-center transition-colors",
              mode === "gregorian"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
            onClick={() => setMode("gregorian")}
          >
            ميلادي
          </button>
        </div>

        {mode === "gregorian" ? (
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelectGregorian}
            initialFocus
          />
        ) : (
          <HijriCalendarGrid
            selectedDate={selectedDate}
            onSelect={handleSelectHijri}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface HijriCalendarGridProps {
  selectedDate?: Date;
  onSelect: (date: Date) => void;
}

function HijriCalendarGrid({ selectedDate, onSelect }: HijriCalendarGridProps) {
  const today = new Date();
  const todayHijri = gregorianToHijri(today);

  const initialHijri = selectedDate
    ? gregorianToHijri(selectedDate)
    : todayHijri;

  const [viewYear, setViewYear] = useState(initialHijri.year);
  const [viewMonth, setViewMonth] = useState(initialHijri.month);

  const selectedHijri = selectedDate ? gregorianToHijri(selectedDate) : null;

  const calendarData = useMemo(() => {
    const firstDay = findFirstDayOfHijriMonth(viewYear, viewMonth);
    const daysInMonth = getHijriMonthDays(viewYear, viewMonth);
    const startDow = firstDay.getDay();

    const days: Array<{ hijriDay: number; gregorianDate: Date } | null> = [];

    for (let i = 0; i < startDow; i++) {
      days.push(null);
    }

    for (let d = 0; d < daysInMonth; d++) {
      const gDate = new Date(firstDay.getTime() + d * 86400000);
      gDate.setHours(12, 0, 0, 0);
      days.push({ hijriDay: d + 1, gregorianDate: gDate });
    }

    return days;
  }, [viewYear, viewMonth]);

  const goToPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const weekDays = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

  return (
    <div className="p-3" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={goToPrevMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="text-sm font-medium">
          {HIJRI_MONTHS[viewMonth - 1]} {viewYear} هـ
        </div>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={goToNextMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0">
        {weekDays.map((day) => (
          <div
            key={day}
            className="h-9 w-9 flex items-center justify-center text-xs text-muted-foreground font-normal"
          >
            {day}
          </div>
        ))}
        {calendarData.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="h-9 w-9" />;
          }

          const isSelected =
            selectedHijri &&
            selectedHijri.year === viewYear &&
            selectedHijri.month === viewMonth &&
            selectedHijri.day === cell.hijriDay;

          const isToday =
            todayHijri.year === viewYear &&
            todayHijri.month === viewMonth &&
            todayHijri.day === cell.hijriDay;

          const gDay = cell.gregorianDate.getDate();

          return (
            <button
              type="button"
              key={`day-${cell.hijriDay}`}
              onClick={() => onSelect(cell.gregorianDate)}
              className={cn(
                "h-9 w-9 rounded-md text-sm flex flex-col items-center justify-center transition-colors relative",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
            >
              <span className="text-xs leading-none">{cell.hijriDay}</span>
              <span
                className={cn(
                  "text-[9px] leading-none mt-0.5",
                  isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                )}
              >
                {gDay}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t text-center">
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => {
            setViewYear(todayHijri.year);
            setViewMonth(todayHijri.month);
          }}
        >
          اليوم: {todayHijri.day} {HIJRI_MONTHS[todayHijri.month - 1]} {todayHijri.year} هـ
        </button>
      </div>
    </div>
  );
}
