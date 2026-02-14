import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { ar } from "date-fns/locale";

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
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
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
