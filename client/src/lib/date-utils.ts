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

export function hijriToGregorian(hYear: number, hMonth: number, hDay: number): Date | null {
  const approxYear = hYear + 622 - Math.floor(hYear / 33);
  let low = new Date(approxYear - 2, 0, 1);
  let high = new Date(approxYear + 1, 11, 31);
  const target = hYear * 10000 + hMonth * 100 + hDay;

  for (let i = 0; i < 20; i++) {
    const mid = new Date(Math.floor((low.getTime() + high.getTime()) / 2));
    mid.setHours(12, 0, 0, 0);
    const h = gregorianToHijri(mid);
    const current = h.year * 10000 + h.month * 100 + h.day;

    if (current === target) return mid;
    if (current < target) {
      low = new Date(mid.getTime() + 86400000);
    } else {
      high = new Date(mid.getTime() - 86400000);
    }
  }

  const finalH = gregorianToHijri(low);
  if (finalH.year === hYear && finalH.month === hMonth && finalH.day === hDay) return low;
  return null;
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

export function toDateInputValue(date: string | Date | null | undefined): string {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!isValid(d)) return "";
    return format(d, "yyyy-MM-dd");
  } catch {
    return "";
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

export function formatDateTimeArabic(date: Date | string | null | undefined): string {
  return formatDateArabic(date, "dd MMMM yyyy - HH:mm");
}

export function formatDateShortArabic(date: Date | string | null | undefined): string {
  return formatDateArabic(date, "dd/MM/yyyy");
}

export function formatTimeArabic(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return formatDateArabic(date, "HH:mm");
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

export function formatHijriDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return formatDateArabic(date);
  }
}

export function formatNumberAr(num: number | string | null | undefined, useArabicDigits = false): string {
  if (num === null || num === undefined) return "—";
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return String(num);
  if (useArabicDigits) {
    return new Intl.NumberFormat("ar-SA").format(n);
  }
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatCurrency(amount: number | string | null | undefined, currency = "SAR"): string {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return String(amount);
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}٪`;
}

export { ar as arabicLocale };
