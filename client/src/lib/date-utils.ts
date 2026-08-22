import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { ar } from "date-fns/locale";

export const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر",
  "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

export interface HijriDate {
  year: number;
  month: number;
  day: number;
}

export function gregorianToHijri(date: Date): HijriDate {
  const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find((p) => p.type === "year")!.value),
    month: parseInt(parts.find((p) => p.type === "month")!.value),
    day: parseInt(parts.find((p) => p.type === "day")!.value),
  };
}

export function findFirstDayOfHijriMonth(hYear: number, hMonth: number): Date {
  const approxYear = hYear + 622 - Math.floor(hYear / 33);
  let date = new Date(approxYear, Math.max(0, hMonth - 2), 1);
  date.setHours(12, 0, 0, 0);
  let h = gregorianToHijri(date);

  while (h.year > hYear || (h.year === hYear && h.month > hMonth)) {
    date = new Date(date.getTime() - 30 * 86400000);
    h = gregorianToHijri(date);
  }
  while (h.year < hYear || (h.year === hYear && h.month < hMonth)) {
    date = new Date(date.getTime() + 25 * 86400000);
    h = gregorianToHijri(date);
  }
  while (h.day > 1) {
    date = new Date(date.getTime() - 86400000);
    h = gregorianToHijri(date);
  }
  return date;
}

export function getHijriMonthDays(hYear: number, hMonth: number): number {
  const firstDay = findFirstDayOfHijriMonth(hYear, hMonth);
  let nextMonth = hMonth + 1;
  let nextYear = hYear;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const nextFirstDay = findFirstDayOfHijriMonth(nextYear, nextMonth);
  return Math.round((nextFirstDay.getTime() - firstDay.getTime()) / 86400000);
}

export function formatHijriDateFull(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!isValid(d)) return "—";
    const h = gregorianToHijri(d);
    return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} هـ`;
  } catch {
    return "—";
  }
}

export function formatDualDate(date: string | Date | null | undefined): { hijri: string; gregorian: string } {
  if (!date) return { hijri: "—", gregorian: "—" };
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!isValid(d)) return { hijri: "—", gregorian: "—" };
    const h = gregorianToHijri(d);
    const hijri = `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} هـ`;
    const gregorian = format(d, "dd/MM/yyyy");
    return { hijri, gregorian };
  } catch {
    return { hijri: "—", gregorian: "—" };
  }
}

export function formatDualDateTime(date: string | Date | null | undefined): { hijri: string; gregorian: string } {
  if (!date) return { hijri: "—", gregorian: "—" };
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!isValid(d)) return { hijri: "—", gregorian: "—" };
    const h = gregorianToHijri(d);
    const time = format(d, "HH:mm");
    const hijri = `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} هـ - ${time}`;
    const gregorian = format(d, "dd/MM/yyyy - HH:mm");
    return { hijri, gregorian };
  } catch {
    return { hijri: "—", gregorian: "—" };
  }
}

export function formatDateArabic(date: Date | string | null | undefined, formatStr: string = "dd MMMM yyyy"): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? parseISO(date) : date;
    if (!isValid(d)) {
      const fallback = typeof date === "string" ? new Date(date) : date;
      if (!isValid(fallback)) return String(date);
      return format(fallback, formatStr, { locale: ar });
    }
    return format(d, formatStr, { locale: ar });
  } catch {
    return String(date);
  }
}

export function formatDateShortArabic(date: Date | string | null | undefined): string {
  return formatDateArabic(date, "dd/MM/yyyy");
}

export function formatTimeAmPm(time: string | null | undefined): string {
  if (!time) return "—";
  try {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "م" : "ص";
    const h = hours % 12 || 12;
    return `${h}:${String(minutes).padStart(2, "0")} ${period}`;
  } catch {
    return time;
  }
}

export function formatRelativeArabic(date: Date | string | null | undefined): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!isValid(d)) return String(date);
    return formatDistanceToNow(d, { locale: ar, addSuffix: true });
  } catch {
    return String(date);
  }
}

export function formatMonthYearArabic(date: Date | string | null | undefined): string {
  return formatDateArabic(date, "MMMM yyyy");
}

export function formatDayMonthArabic(date: Date | string | null | undefined): string {
  return formatDateArabic(date, "dd MMMM");
}


// ==================== Arabic weekday name ====================
// 🔴 HOISTED IN BATCH 14 from its THREE verbatim copies — hearings.tsx, cases.tsx
// and memos.tsx. hearings.tsx declared it first; cases.tsx copied it for its day
// separators and memos.tsx copied it again for the same feature, each carrying a
// note that a third copy was the trigger to hoist. This is that hoist. The three
// were byte-identical when moved (verified by checksum, not by eye), so nothing
// had to be chosen between and no behaviour changed.
//
// Indexed by JS Date.getDay(), Sunday = 0. An unparseable date yields "" rather
// than throwing or printing "Invalid Date", which is what all three copies did.
//
// ⚠ MOVED VERBATIM, INCLUDING ITS ONE WEAKNESS. `new Date("YYYY-MM-DD")` parses as
// UTC midnight and getDay() then reads it in the BROWSER's zone, so west of UTC
// this names the previous weekday. Harmless for this firm (Asia/Riyadh is +3, so
// UTC midnight is 03:00 the same day) and identical in all three originals — it is
// preserved rather than quietly changed, because fixing it here would alter what
// three shipped surfaces render without anyone having asked for it.
const ARABIC_WEEKDAYS = [
  "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت",
] as const;

export function arabicWeekday(date: string): string {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : ARABIC_WEEKDAYS[d.getDay()];
}
