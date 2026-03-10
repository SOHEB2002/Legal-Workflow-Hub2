import { formatDualDate, formatDualDateTime } from "@/lib/date-utils";

interface DualDateDisplayProps {
  date: string | Date | null | undefined;
  showTime?: boolean;
  compact?: boolean;
  className?: string;
}

export function DualDateDisplay({ date, showTime = false, compact = false, className = "" }: DualDateDisplayProps) {
  if (!date) return <span className={className}>—</span>;

  const dual = showTime ? formatDualDateTime(date) : formatDualDate(date);

  if (dual.hijri === "—") return <span className={className}>—</span>;

  if (compact) {
    return (
      <span className={className} title={`${dual.hijri} — ${dual.gregorian}`}>
        {dual.hijri}
      </span>
    );
  }

  return (
    <div className={`inline-flex flex-col ${className}`} dir="rtl">
      <span className="font-medium text-sm">{dual.hijri}</span>
      <span className="text-xs text-muted-foreground">{dual.gregorian} م</span>
    </div>
  );
}
