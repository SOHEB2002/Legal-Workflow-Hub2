import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Save, X, Check, Trash2, Pencil, Bookmark, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { HijriDatePicker } from "@/components/ui/hijri-date-picker";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Priority,
  ConsultationStage,
  ConsultationStageLabels,
  ConsultationStagesAll,
} from "@shared/schema";
import type { ConsultationStageValue, PriorityType } from "@shared/schema";

export type ConsultationStatusFilter = "all" | "active" | "converted" | "closed";

export type AdvancedConsultationsFilters = {
  search: string;
  status: ConsultationStatusFilter;
  departmentId: string; // "" means any
  stages: string[];
  lawyers: string[];
  priorities: string[];
  dateFrom: string; // ISO date string, "" means no lower bound
  dateTo: string;   // ISO date string, "" means no upper bound
};

export const EMPTY_CONSULTATIONS_FILTERS: AdvancedConsultationsFilters = {
  search: "",
  status: "all",
  departmentId: "",
  stages: [],
  lawyers: [],
  priorities: [],
  dateFrom: "",
  dateTo: "",
};

// Active-count for the badge on the trigger button. Search and status='all'
// don't count toward "advanced" — they're the always-visible defaults.
export function countActiveConsultationFilters(f: AdvancedConsultationsFilters): number {
  return (
    (f.status !== "all" ? 1 : 0) +
    (f.departmentId ? 1 : 0) +
    (f.stages.length > 0 ? 1 : 0) +
    (f.lawyers.length > 0 ? 1 : 0) +
    (f.priorities.length > 0 ? 1 : 0) +
    (f.dateFrom || f.dateTo ? 1 : 0)
  );
}

const RECENT_KEY = "consultations.recentFilters.v1";
const RECENT_MAX = 5;
const PAGE_TYPE = "consultations";

const STATUS_LABELS: Record<ConsultationStatusFilter, string> = {
  all: "جميع الحالات",
  active: "نشطة",
  converted: "محولة لقضية",
  closed: "مقفلة",
};

// Stages cascade hook. Consultations share the same 8-stage canonical
// workflow across all departments, so departmentId doesn't actually
// constrain the list right now — every dept gets the full list. The
// function exists to (a) mirror the cases-side cascade contract per the
// spec, and (b) give a single place to add per-dept divergence later
// without rewiring the component.
export function getConsultationFilterStages(_departmentId: string): ConsultationStageValue[] {
  return [...ConsultationStagesAll];
}

type SavedFilterRow = {
  id: string;
  name: string;
  filterConfig: AdvancedConsultationsFilters;
  pageType: string;
  createdAt: string;
};

function loadRecent(): AdvancedConsultationsFilters[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(f: AdvancedConsultationsFilters) {
  // Don't persist a "default" snapshot — it pollutes recents.
  if (countActiveConsultationFilters(f) === 0 && !f.search.trim()) return;
  try {
    const existing = loadRecent();
    const key = JSON.stringify(f);
    const dedup = existing.filter((e) => JSON.stringify(e) !== key);
    const next = [f, ...dedup].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage failures shouldn't break filtering
  }
}

function describeFilters(
  f: AdvancedConsultationsFilters,
  deptName: (id: string) => string,
  lawyerName: (id: string) => string,
): string {
  const parts: string[] = [];
  if (f.search.trim()) parts.push(`بحث: ${f.search.trim()}`);
  if (f.status !== "all") parts.push(`الحالة: ${STATUS_LABELS[f.status]}`);
  if (f.departmentId) parts.push(`القسم: ${deptName(f.departmentId)}`);
  if (f.stages.length)
    parts.push(`المرحلة: ${f.stages.map((s) => ConsultationStageLabels[s as ConsultationStageValue] || s).join("، ")}`);
  if (f.lawyers.length) parts.push(`المحامي: ${f.lawyers.map(lawyerName).join("، ")}`);
  if (f.priorities.length) parts.push(`الأولوية: ${f.priorities.join("، ")}`);
  if (f.dateFrom || f.dateTo) {
    const from = f.dateFrom || "—";
    const to = f.dateTo || "—";
    parts.push(`تاريخ الإنشاء: ${from} → ${to}`);
  }
  return parts.join(" • ") || "—";
}

interface MultiSelectComboProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  searchable?: boolean;
  testIdPrefix?: string;
}

function MultiSelectCombo({
  label,
  values,
  onChange,
  options,
  placeholder,
  searchable = true,
  testIdPrefix,
}: MultiSelectComboProps) {
  const [open, setOpen] = useState(false);
  const toggle = (value: string) => {
    if (values.includes(value)) onChange(values.filter((v) => v !== value));
    else onChange([...values, value]);
  };

  const summary =
    values.length === 0
      ? placeholder || "اختر..."
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label || values[0]
        : `${values.length} محدد`;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between font-normal"
            data-testid={testIdPrefix ? `${testIdPrefix}-trigger` : undefined}
          >
            <span className={values.length === 0 ? "text-muted-foreground" : ""}>{summary}</span>
            {values.length > 0 && (
              <Badge variant="secondary" className="mr-2 h-5">
                {values.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            {searchable && <CommandInput placeholder="بحث..." />}
            <CommandList>
              <CommandEmpty>لا توجد نتائج</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const selected = values.includes(opt.value);
                  return (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => toggle(opt.value)}
                      data-testid={testIdPrefix ? `${testIdPrefix}-option-${opt.value}` : undefined}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div
                          className={
                            "h-4 w-4 rounded border flex items-center justify-center " +
                            (selected ? "bg-primary border-primary text-primary-foreground" : "border-input")
                          }
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </div>
                        <span>{opt.label}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface Props {
  filters: AdvancedConsultationsFilters;
  onChange: (filters: AdvancedConsultationsFilters) => void;
  departments: Array<{ id: string; name: string }>;
  lawyers: Array<{ id: string; name: string }>;
}

export function ConsultationsAdvancedFilters({ filters, onChange, departments, lawyers }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdvancedConsultationsFilters>(filters);
  const [savedName, setSavedName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [recents, setRecents] = useState<AdvancedConsultationsFilters[]>([]);
  const { toast } = useToast();

  // Sync draft with the current applied filters whenever the popover
  // opens — the user can fiddle without committing until Apply.
  useEffect(() => {
    if (open) {
      setDraft(filters);
      setRecents(loadRecent());
    }
  }, [open, filters]);

  const savedQuery = useQuery<SavedFilterRow[]>({
    queryKey: ["/api/saved-filters", `?pageType=${PAGE_TYPE}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/saved-filters?pageType=${PAGE_TYPE}`);
      return res.json();
    },
    enabled: open,
  });

  const priorityOptions = useMemo(
    () => Object.values(Priority).map((p) => ({ value: p, label: p })),
    [],
  );
  const stageOptions = useMemo(() => {
    const allowed = getConsultationFilterStages(draft.departmentId);
    return allowed.map((s) => ({
      value: s,
      label: ConsultationStageLabels[s] || s,
    }));
  }, [draft.departmentId]);

  // When the allowed stages list narrows (e.g. once per-dept divergence
  // is added), prune stale stage selections so the user doesn't end up
  // with hidden filters that still constrain results.
  useEffect(() => {
    const allowed = new Set<string>(stageOptions.map((o) => o.value));
    if (draft.stages.some((s) => !allowed.has(s))) {
      setDraft((prev) => ({
        ...prev,
        stages: prev.stages.filter((s) => allowed.has(s)),
      }));
    }
  }, [stageOptions, draft.stages]);

  const lawyerOptions = useMemo(
    () => lawyers.map((l) => ({ value: l.id, label: l.name })),
    [lawyers],
  );

  const deptNameById = (id: string) => departments.find((d) => String(d.id) === id)?.name || id;
  const lawyerNameById = (id: string) => lawyers.find((l) => l.id === id)?.name || id;

  // Apply: write back to the parent and persist a recent entry. Used by
  // the Apply button, the saved-filter rows, and the recent entries.
  const apply = (next: AdvancedConsultationsFilters) => {
    onChange(next);
    saveRecent(next);
    setRecents(loadRecent());
    setOpen(false);
  };

  // Live update for the search box. Search filtering doesn't go through
  // the draft/Apply cycle — typing should narrow results immediately,
  // matching the UX the simple search box used to provide.
  const updateSearch = (value: string) => {
    onChange({ ...filters, search: value });
  };

  const clearAll = () => {
    setDraft({ ...EMPTY_CONSULTATIONS_FILTERS, search: draft.search });
  };

  const handleApplyDraft = () => {
    apply(draft);
  };

  const handleSaveCurrent = async () => {
    const name = savedName.trim();
    if (!name) {
      toast({ title: "أدخل اسماً للفلتر", variant: "destructive" });
      return;
    }
    if (countActiveConsultationFilters(draft) === 0 && !draft.search.trim()) {
      toast({ title: "لا توجد فلاتر مختارة لحفظها", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/saved-filters", {
        name,
        filterConfig: draft,
        pageType: PAGE_TYPE,
      });
      setSavedName("");
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", `?pageType=${PAGE_TYPE}`] });
      toast({ title: "تم حفظ الفلتر" });
    } catch (e: any) {
      toast({ title: "فشل حفظ الفلتر", description: e?.message, variant: "destructive" });
    }
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/saved-filters/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", `?pageType=${PAGE_TYPE}`] });
      toast({ title: "تم حذف الفلتر" });
    } catch (e: any) {
      toast({ title: "فشل الحذف", description: e?.message, variant: "destructive" });
    }
  };

  const handleRenameSaved = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      await apiRequest("PATCH", `/api/saved-filters/${id}`, { name });
      setRenamingId(null);
      setRenameValue("");
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", `?pageType=${PAGE_TYPE}`] });
      toast({ title: "تم تعديل الاسم" });
    } catch (e: any) {
      toast({ title: "فشل التعديل", description: e?.message, variant: "destructive" });
    }
  };

  const activeCount = countActiveConsultationFilters(filters);

  return (
    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-search-consultations"
          placeholder="بحث برقم الاستشارة، السؤال، العميل، أو النوع..."
          value={filters.search}
          onChange={(e) => updateSearch(e.target.value)}
          className="pr-10"
        />
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="gap-2"
            data-testid="button-advanced-filters"
          >
            <Filter className="h-4 w-4" />
            فلاتر متقدمة
            {activeCount > 0 && (
              <Badge variant="default" className="h-5 px-1.5">
                {activeCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">فلاتر متقدمة</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                data-testid="button-clear-adv-filters"
              >
                <X className="h-4 w-4 ml-1" />
                مسح
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">الحالة</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v as ConsultationStatusFilter })}
                >
                  <SelectTrigger data-testid="adv-status-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{STATUS_LABELS.all}</SelectItem>
                    <SelectItem value="active">{STATUS_LABELS.active}</SelectItem>
                    <SelectItem value="converted">{STATUS_LABELS.converted}</SelectItem>
                    <SelectItem value="closed">{STATUS_LABELS.closed}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">القسم</Label>
                <Select
                  value={draft.departmentId || "all"}
                  onValueChange={(v) =>
                    setDraft({ ...draft, departmentId: v === "all" ? "" : v })
                  }
                >
                  <SelectTrigger data-testid="adv-dept-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الأقسام</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={String(d.id)} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <MultiSelectCombo
                label="المرحلة"
                values={draft.stages}
                onChange={(v) => setDraft({ ...draft, stages: v })}
                options={stageOptions}
                placeholder="كل المراحل"
                testIdPrefix="adv-stage"
              />
              <MultiSelectCombo
                label="الأولوية"
                values={draft.priorities}
                onChange={(v) => setDraft({ ...draft, priorities: v as PriorityType[] })}
                options={priorityOptions}
                placeholder="كل الأولويات"
                searchable={false}
                testIdPrefix="adv-priority"
              />
              <div className="col-span-2">
                <MultiSelectCombo
                  label="المحامي المسؤول"
                  values={draft.lawyers}
                  onChange={(v) => setDraft({ ...draft, lawyers: v })}
                  options={lawyerOptions}
                  placeholder="كل المحامين"
                  testIdPrefix="adv-lawyer"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">من تاريخ</Label>
                <HijriDatePicker
                  value={draft.dateFrom}
                  onChange={(v) => setDraft({ ...draft, dateFrom: v })}
                  placeholder="من"
                  data-testid="adv-date-from"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
                <HijriDatePicker
                  value={draft.dateTo}
                  onChange={(v) => setDraft({ ...draft, dateTo: v })}
                  placeholder="إلى"
                  data-testid="adv-date-to"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleApplyDraft}
                data-testid="button-apply-adv-filters"
              >
                تطبيق
              </Button>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Save className="h-4 w-4" />
                حفظ كفلتر
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="اسم الفلتر"
                  value={savedName}
                  onChange={(e) => setSavedName(e.target.value)}
                  className="flex-1"
                  data-testid="input-saved-filter-name"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleSaveCurrent}
                  data-testid="button-save-filter"
                >
                  حفظ
                </Button>
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Bookmark className="h-4 w-4" />
                الفلاتر المحفوظة
              </div>
              {savedQuery.isLoading ? (
                <div className="text-xs text-muted-foreground">جاري التحميل...</div>
              ) : !savedQuery.data || savedQuery.data.length === 0 ? (
                <div className="text-xs text-muted-foreground">لا توجد فلاتر محفوظة</div>
              ) : (
                <ul className="space-y-1">
                  {savedQuery.data.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 hover-elevate"
                      data-testid={`saved-filter-${row.id}`}
                    >
                      {renamingId === row.id ? (
                        <>
                          <Input
                            className="h-7 flex-1"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameSaved(row.id);
                              if (e.key === "Escape") {
                                setRenamingId(null);
                                setRenameValue("");
                              }
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleRenameSaved(row.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setRenamingId(null);
                              setRenameValue("");
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex-1 text-right truncate"
                            onClick={() => apply(row.filterConfig || EMPTY_CONSULTATIONS_FILTERS)}
                            title={describeFilters(
                              row.filterConfig || EMPTY_CONSULTATIONS_FILTERS,
                              deptNameById,
                              lawyerNameById,
                            )}
                          >
                            <div className="text-sm font-medium truncate">{row.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {describeFilters(
                                row.filterConfig || EMPTY_CONSULTATIONS_FILTERS,
                                deptNameById,
                                lawyerNameById,
                              )}
                            </div>
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setRenamingId(row.id);
                              setRenameValue(row.name);
                            }}
                            data-testid={`button-rename-${row.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteSaved(row.id)}
                            data-testid={`button-delete-${row.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {recents.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  الأخيرة
                </div>
                <ul className="space-y-1">
                  {recents.map((r, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        className="w-full text-right rounded border px-2 py-1.5 hover-elevate"
                        onClick={() => apply(r)}
                        data-testid={`recent-filter-${idx}`}
                      >
                        <div className="text-xs text-muted-foreground truncate">
                          {describeFilters(r, deptNameById, lawyerNameById)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
