import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export function formatDateArabic(date: Date | string, formatStr: string = "dd MMMM yyyy"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, formatStr, { locale: ar });
}

export function formatDateTimeArabic(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd MMMM yyyy - HH:mm", { locale: ar });
}

export function formatDateShortArabic(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd/MM/yyyy", { locale: ar });
}

export function formatTimeArabic(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "HH:mm", { locale: ar });
}

export function formatRelativeArabic(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  return formatDateArabic(d, "dd MMMM yyyy");
}

export function formatMonthYearArabic(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MMMM yyyy", { locale: ar });
}

export function formatDayMonthArabic(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd MMMM", { locale: ar });
}

export { ar as arabicLocale };
