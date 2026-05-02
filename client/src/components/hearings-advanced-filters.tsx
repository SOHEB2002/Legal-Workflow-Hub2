import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Save, X, Check, Trash2, Pencil, Bookmark, Clock } from "lucide-react";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  HearingStatus,
  HearingStatusLabels,
  HearingResult,
  HearingResultLabels,
  HearingType,
  CourtType,
  CaseClassification,
  CaseClassificationLabels,
} from "@shared/schema";

export type AdvancedHearingsFilters = {
  search: string;
  hearingTypes: string[];
  courtTypes: string[];
  results: string[];
  statuses: string[];
  depts: string[];
  lawyers: string[];
  classification: string; // "" | "قيد_الدراسة" | "منظورة_بالمحكمة"
  dateFrom: string;       // "" or YYYY-MM-DD (Gregorian, matches hearing.hearingDate)
  dateTo: string;
};

export const EMPTY_HEARINGS_ADV_FILTERS: AdvancedHearingsFilters = {
  search: "",
  hearingTypes: [],
  courtTypes: [],
  results: [],
  statuses: [],
  depts: [],
  lawyers: [],
  classification: "",
  dateFrom: "",
  dateTo: "",
};

export function countActiveHearingsAdvFilters(f: AdvancedHearingsFilters): number {
  return (
    (f.search.trim() ? 1 : 0) +
    (f.hearingTypes.length > 0 ? 1 : 0) +
    (f.courtTypes.length > 0 ? 1 : 0) +
    (f.results.length > 0 ? 1 : 0) +
    (f.statuses.length > 0 ? 1 : 0) +
    (f.depts.length > 0 ? 1 : 0) +
    (f.lawyers.length > 0 ? 1 : 0) +
    (f.classification ? 1 : 0) +
    (f.dateFrom ? 1 : 0) +
    (f.dateTo ? 1 : 0)
  );
}

const RECENT_KEY = "hearings.recentFilters.v1";
const RECENT_MAX = 5;

const LAWYER_FILTER_EXCLUDED_ROLES = new Set([
  "branch_manager",
  "admin_support",
  "hr",
  "technical_support",
]);

type SavedFilterRow = {
  id: string;
  name: string;
  filterConfig: AdvancedHearingsFilters;
  pageType: string;
  createdAt: string;
};

function loadRecent(): AdvancedHearingsFilters[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(f: AdvancedHearingsFilters) {
  if (countActiveHearingsAdvFilters(f) === 0) return;
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
              <Badge variant="secondary" className="mr-2 h-5">{values.length}</Badge>
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

interface UserLite {
  id: string;
  name: string;
  role: string;
  departmentId: string | null;
}

interface Props {
  filters: AdvancedHearingsFilters;
  onChange: (filters: AdvancedHearingsFilters) => void;
  departments: Array<{ id: string; name: string }>;
  users: UserLite[];
}

export function HearingsAdvancedFilters({ filters, onChange, departments, users }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdvancedHearingsFilters>(filters);
  const [savedName, setSavedName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [recents, setRecents] = useState<AdvancedHearingsFilters[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDraft(filters);
      setRecents(loadRecent());
    }
  }, [open, filters]);

  const savedQuery = useQuery<SavedFilterRow[]>({
    queryKey: ["/api/saved-filters", "?pageType=hearings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/saved-filters?pageType=hearings");
      return res.json();
    },
    enabled: open,
  });

  const hearingTypeOptions = useMemo(
    () => Object.values(HearingType).map((v) => ({ value: v, label: v.replace(/_/g, " ") })),
    [],
  );
  const courtTypeOptions = useMemo(
    () => Object.values(CourtType).map((v) => ({ value: v, label: v })),
    [],
  );
  const resultOptions = useMemo(
    () => Object.values(HearingResult).map((v) => ({
      value: v,
      label: HearingResultLabels[v as keyof typeof HearingResultLabels] || v,
    })),
    [],
  );
  const statusOptions = useMemo(
    () => Object.values(HearingStatus).map((v) => ({
      value: v,
      label: HearingStatusLabels[v as keyof typeof HearingStatusLabels] || v,
    })),
    [],
  );
  const deptOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: d.name })),
    [departments],
  );

  // Lawyer list narrows to selected departments. Excludes the four
  // non-attending roles regardless of canBeAssignedCases (so historical
  // assignees like cases_review_head still show up).
  const lawyerOptions = useMemo(() => {
    const eligible = users.filter((u) => !LAWYER_FILTER_EXCLUDED_ROLES.has(u.role));
    const scoped =
      draft.depts.length === 0
        ? eligible
        : eligible.filter((u) => u.departmentId && draft.depts.includes(u.departmentId));
    return scoped.map((u) => ({ value: u.id, label: u.name }));
  }, [users, draft.depts]);

  // When dept selection narrows, prune lawyers no longer in scope.
  useEffect(() => {
    const allowed = new Set(lawyerOptions.map((o) => o.value));
    if (draft.lawyers.some((id) => !allowed.has(id))) {
      setDraft((prev) => ({
        ...prev,
        lawyers: prev.lawyers.filter((id) => allowed.has(id)),
      }));
    }
  }, [lawyerOptions, draft.lawyers]);

  const deptNameById = (id: string) => departments.find((d) => String(d.id) === id)?.name || id;
  const userNameById = (id: string) => users.find((u) => u.id === id)?.name || id;

  const apply = (next: AdvancedHearingsFilters) => {
    onChange(next);
    saveRecent(next);
    setRecents(loadRecent());
    setOpen(false);
  };

  const clearAll = () => setDraft(EMPTY_HEARINGS_ADV_FILTERS);
  const handleApplyDraft = () => apply(draft);

  const handleSaveCurrent = async () => {
    const name = savedName.trim();
    if (!name) {
      toast({ title: "أدخل اسماً للفلتر", variant: "destructive" });
      return;
    }
    if (countActiveHearingsAdvFilters(draft) === 0) {
      toast({ title: "لا توجد فلاتر مختارة لحفظها", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/saved-filters", {
        name,
        filterConfig: draft,
        pageType: "hearings",
      });
      setSavedName("");
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", "?pageType=hearings"] });
      toast({ title: "تم حفظ الفلتر" });
    } catch (e: any) {
      toast({ title: "فشل حفظ الفلتر", description: e?.message, variant: "destructive" });
    }
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/saved-filters/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", "?pageType=hearings"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", "?pageType=hearings"] });
      toast({ title: "تم تعديل الاسم" });
    } catch (e: any) {
      toast({ title: "فشل التعديل", description: e?.message, variant: "destructive" });
    }
  };

  const describeFilters = (f: AdvancedHearingsFilters): string => {
    const parts: string[] = [];
    if (f.search) parts.push(`بحث: ${f.search}`);
    if (f.hearingTypes.length) parts.push(`النوع: ${f.hearingTypes.join("، ")}`);
    if (f.courtTypes.length) parts.push(`المحكمة: ${f.courtTypes.join("، ")}`);
    if (f.results.length)
      parts.push(`النتيجة: ${f.results.map((r) => HearingResultLabels[r as keyof typeof HearingResultLabels] || r).join("، ")}`);
    if (f.statuses.length) parts.push(`الحالة: ${f.statuses.join("، ")}`);
    if (f.depts.length) parts.push(`القسم: ${f.depts.map(deptNameById).join("، ")}`);
    if (f.lawyers.length) parts.push(`المترافع: ${f.lawyers.map(userNameById).join("، ")}`);
    if (f.classification)
      parts.push(`التصنيف: ${CaseClassificationLabels[f.classification as keyof typeof CaseClassificationLabels] || f.classification}`);
    if (f.dateFrom || f.dateTo) parts.push(`من ${f.dateFrom || "؟"} إلى ${f.dateTo || "؟"}`);
    return parts.join(" • ") || "—";
  };

  const activeCount = countActiveHearingsAdvFilters(filters);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          data-testid="button-hearings-advanced-filters"
        >
          <Filter className="h-4 w-4" />
          فلاتر متقدمة
          {activeCount > 0 && (
            <Badge variant="default" className="h-5 px-1.5">{activeCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">فلاتر متقدمة</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              data-testid="button-clear-hearings-adv-filters"
            >
              <X className="h-4 w-4 ml-1" />
              مسح
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">بحث (رقم القضية / المدعي / الخصم / المحكمة)</Label>
            <Input
              value={draft.search}
              onChange={(e) => setDraft({ ...draft, search: e.target.value })}
              placeholder="ابحث..."
              data-testid="input-hearings-adv-search"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MultiSelectCombo
              label="نوع الجلسة"
              values={draft.hearingTypes}
              onChange={(v) => setDraft({ ...draft, hearingTypes: v })}
              options={hearingTypeOptions}
              placeholder="كل الأنواع"
              searchable={false}
              testIdPrefix="adv-hearing-type"
            />
            <MultiSelectCombo
              label="نوع المحكمة"
              values={draft.courtTypes}
              onChange={(v) => setDraft({ ...draft, courtTypes: v })}
              options={courtTypeOptions}
              placeholder="كل المحاكم"
              testIdPrefix="adv-court-type"
            />
            <MultiSelectCombo
              label="النتيجة"
              values={draft.results}
              onChange={(v) => setDraft({ ...draft, results: v })}
              options={resultOptions}
              placeholder="كل النتائج"
              testIdPrefix="adv-result"
            />
            <MultiSelectCombo
              label="الحالة"
              values={draft.statuses}
              onChange={(v) => setDraft({ ...draft, statuses: v })}
              options={statusOptions}
              placeholder="كل الحالات"
              searchable={false}
              testIdPrefix="adv-status"
            />
            <MultiSelectCombo
              label="القسم"
              values={draft.depts}
              onChange={(v) => setDraft({ ...draft, depts: v })}
              options={deptOptions}
              placeholder="كل الأقسام"
              testIdPrefix="adv-dept"
            />
            <MultiSelectCombo
              label="المترافع"
              values={draft.lawyers}
              onChange={(v) => setDraft({ ...draft, lawyers: v })}
              options={lawyerOptions}
              placeholder={draft.depts.length ? "ضمن الأقسام المختارة" : "كل المترافعين"}
              testIdPrefix="adv-lawyer"
            />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">التصنيف</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={draft.classification}
                onChange={(e) => setDraft({ ...draft, classification: e.target.value })}
                data-testid="select-adv-hearings-classification"
              >
                <option value="">كل التصنيفات</option>
                <option value={CaseClassification.UNDER_STUDY}>قضية قيد الدراسة</option>
                <option value={CaseClassification.IN_COURT}>منظورة بالمحكمة</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">من تاريخ</Label>
              <Input
                type="date"
                value={draft.dateFrom}
                onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
                data-testid="input-adv-date-from"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
              <Input
                type="date"
                value={draft.dateTo}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
                data-testid="input-adv-date-to"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleApplyDraft} data-testid="button-apply-hearings-adv-filters">
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
                data-testid="input-hearings-saved-filter-name"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSaveCurrent}
                data-testid="button-save-hearings-filter"
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
                    data-testid={`hearings-saved-filter-${row.id}`}
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
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRenameSaved(row.id)}>
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
                          onClick={() => apply(row.filterConfig || EMPTY_HEARINGS_ADV_FILTERS)}
                          title={describeFilters(row.filterConfig || EMPTY_HEARINGS_ADV_FILTERS)}
                        >
                          <div className="text-sm font-medium truncate">{row.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {describeFilters(row.filterConfig || EMPTY_HEARINGS_ADV_FILTERS)}
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
                          data-testid={`button-rename-hearings-${row.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteSaved(row.id)}
                          data-testid={`button-delete-hearings-${row.id}`}
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
                      data-testid={`hearings-recent-filter-${idx}`}
                    >
                      <div className="text-xs text-muted-foreground truncate">
                        {describeFilters(r)}
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
  );
}
