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

// ==================== YEAR RANGE ====================
// Centred on the date in view (or today when the field is empty).
//
// -50 / +10 chosen for THIS APP'S REAL DATA, not as a round number: the backward
// span has to reach historic administrative documents — تاريخ العلم بالمخالفة,
// تاريخ القرار الإداري and تاريخ إيفاء can all be years old, and a prescription
// rule computed from one of them is only as good as the date the lawyer can pick.
// Forward, the app's dates are scheduling ones — hearings, deadlines, pause-until
// — which in practice never run beyond a couple of years; 10 is generous and
// keeps the list short enough to scan.
const YEARS_BACK = 50;
const YEARS_FORWARD = 10;

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

  // GREGORIAN years, for the Gregorian tab's dropdown only. The Hijri grid
  // computes its own range in Hijri years — the two must never share a number.
  const gregorianYearRange = useMemo(() => {
    const centre = (selectedDate ?? new Date()).getFullYear();
    return { from: centre - YEARS_BACK, to: centre + YEARS_FORWARD };
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
          // 🔴 GREGORIAN YEAR/MONTH NAVIGATION comes from react-day-picker's own
          // dropdown caption. Using its built-in is deliberate: the dropdowns are
          // generated FROM THE GREGORIAN CALENDAR by construction, so this tab can
          // never offer a Hijri year or month name — the mixing failure the Hijri
          // grid below has to guard against by hand.
          //
          // 🔴 NAVIGATION EMITS NOTHING. `onSelect` is the ONLY path to onChange
          // and rdp fires it exclusively on a DAY click; the caption dropdowns
          // fire onMonthChange, which is not wired to anything. Changing year or
          // month therefore cannot write a value.
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelectGregorian}
            captionLayout="dropdown-buttons"
            fromYear={gregorianYearRange.from}
            toYear={gregorianYearRange.to}
            defaultMonth={selectedDate}
            classNames={{
              caption_dropdowns: "flex gap-1 justify-center",
              dropdown: "rdp-dropdown bg-background border rounded-md text-sm px-1 py-0.5",
              caption_label: "hidden",
              vhidden: "hidden",
            }}
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
  // Which pane the Hijri tab is showing. "days" is the grid; the other two are
  // navigation-only and CANNOT write a value — see the note on the header.
  const [pane, setPane] = useState<"days" | "years" | "months">("days");

  // 🔴 HIJRI YEARS, built from the HIJRI year in view. Never a Gregorian year
  // offset by 579 or anything similar: a Hijri year is ~354 days, so any fixed
  // arithmetic between the two calendars drifts, and a wrong-but-plausible year
  // is the worst failure this component can produce.
  const hijriYears = useMemo(() => {
    const out: number[] = [];
    for (let y = viewYear - YEARS_BACK; y <= viewYear + YEARS_FORWARD; y++) out.push(y);
    return out;
  }, [viewYear]);

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

  // 🔴 NEITHER PANE CAN WRITE A VALUE. `onSelect` — the component's only route to
  // the parent's onChange — is called from exactly ONE place in this file: the day
  // button in the grid below. Everything here mutates viewYear / viewMonth / pane
  // and returns to the grid, so navigating years or months leaves the stored value
  // untouched and the popover open, exactly as the month arrows already did.
  if (pane === "years") {
    return (
      <div className="p-3 w-[17rem]" dir="rtl">
        <div className="text-sm font-medium text-center mb-3">اختر السنة الهجرية</div>
        <div className="grid grid-cols-4 gap-1 max-h-64 overflow-y-auto">
          {hijriYears.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { setViewYear(y); setPane("days"); }}
              className={cn(
                "h-9 rounded-md text-sm hover:bg-accent",
                y === viewYear && "bg-primary text-primary-foreground hover:bg-primary",
              )}
              data-testid={`hijri-year-${y}`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (pane === "months") {
    return (
      <div className="p-3 w-[17rem]" dir="rtl">
        <div className="text-sm font-medium text-center mb-3">اختر الشهر الهجري — {viewYear} هـ</div>
        <div className="grid grid-cols-3 gap-1">
          {HIJRI_MONTHS.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => { setViewMonth(i + 1); setPane("days"); }}
              className={cn(
                "h-9 rounded-md text-xs px-1 hover:bg-accent",
                i + 1 === viewMonth && "bg-primary text-primary-foreground hover:bg-primary",
              )}
              data-testid={`hijri-month-${i + 1}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={goToPrevMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {/* The month and the year are now SEPARATE buttons, so each opens its own
            pane. They were one static label. */}
        <div className="flex items-center gap-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setPane("months")}
            className="px-2 py-1 rounded-md hover:bg-accent"
            data-testid="hijri-open-month-picker"
          >
            {HIJRI_MONTHS[viewMonth - 1]}
          </button>
          <button
            type="button"
            onClick={() => setPane("years")}
            className="px-2 py-1 rounded-md hover:bg-accent"
            data-testid="hijri-open-year-picker"
          >
            {viewYear} هـ
          </button>
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
