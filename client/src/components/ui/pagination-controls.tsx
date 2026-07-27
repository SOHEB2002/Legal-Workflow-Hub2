import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/hooks/use-page-size";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  // Rows-per-page selector. BOTH must be supplied to render it; passing
  // neither keeps the component byte-identical to its previous behaviour.
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  className,
  pageSize,
  onPageSizeChange,
}: PaginationControlsProps) {
  const showSizeSelector = typeof pageSize === "number" && !!onPageSizeChange;

  // The whole bar used to disappear at a single page. It still does when there
  // is no size selector — but when there IS one, hiding it would trap a user
  // who filtered down to 12 rows at size 15: the control they need to raise the
  // size would be gone. So a single page keeps the selector and drops only the
  // page buttons.
  if (totalPages <= 1 && !showSizeSelector) return null;

  // Build page number list: always show first, last, current ±1, with ellipsis
  const pages: (number | "…")[] = [];
  const delta = 1;
  const left = currentPage - delta;
  const right = currentPage + delta;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i <= right)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-1 py-3 select-none",
        className
      )}
      dir="rtl"
    >
      {totalPages > 1 && (
        <>
          {/* Next → right arrow (RTL: goes to previous page visually on the right) */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === currentPage ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 text-sm"
                onClick={() => onPageChange(p as number)}
                aria-current={p === currentPage ? "page" : undefined}
              >
                {p}
              </Button>
            )
          )}

          {/* Previous ← left arrow (RTL: goes to next page visually on the left) */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="الصفحة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="mr-2 text-sm text-muted-foreground whitespace-nowrap">
            الصفحة {currentPage} من {totalPages}
          </span>
        </>
      )}

      {showSizeSelector && (
        <div className="flex items-center gap-2 mr-4">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            عدد الصفوف
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange!(Number(v))}
          >
            <SelectTrigger className="h-8 w-[76px]" data-testid="select-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} data-testid={`option-page-size-${n}`}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
