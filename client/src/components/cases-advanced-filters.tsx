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
  Priority,
  CaseStage,
  CaseStageLabels,
  CaseStagesOrder,
  CaseClassification,
  CaseClassificationLabels,
} from "@shared/schema";
import type { PriorityType } from "@shared/schema";

export type AdvancedCasesFilters = {
  priorities: PriorityType[];
  stages: string[];
  depts: string[];
  classifications: string[];
  lawyers: string[];
};

export const EMPTY_ADV_FILTERS: AdvancedCasesFilters = {
  priorities: [],
  stages: [],
  depts: [],
  classifications: [],
  lawyers: [],
};

export function countActiveAdvFilters(f: AdvancedCasesFilters): number {
  return (
    (f.priorities.length > 0 ? 1 : 0) +
    (f.stages.length > 0 ? 1 : 0) +
    (f.depts.length > 0 ? 1 : 0) +
    (f.classifications.length > 0 ? 1 : 0) +
    (f.lawyers.length > 0 ? 1 : 0)
  );
}

const RECENT_KEY = "cases.recentFilters.v1";
const RECENT_MAX = 5;

// Dynamic stage options: filter component-local lookups so we don't disturb
// schema arrays used by the workflow logic. Spec includes جاهزة_للرفع in
// labor/admin paths and merges in-court paths into a single union list.
const UNDER_STUDY_STAGES_BY_DEPT_NAME: Record<string, string[]> = {
  "تجاري": [
    "استلام", "استكمال_البيانات", "دراسة", "تحرير_صحيفة_الدعوى",
    "مراجعة_داخلية", "إحالة_للجنة_المراجعة", "الأخذ_بالملاحظات", "جاهزة_للرفع",
    "قيد_التدقيق_في_تراضي", "مداولة_الصلح", "أغلق_طلب_الصلح",
    "قيد_التدقيق_في_ناجز", "منظورة",
  ],
  "عام": [
    "استلام", "استكمال_البيانات", "دراسة", "تحرير_صحيفة_الدعوى",
    "مراجعة_داخلية", "إحالة_للجنة_المراجعة", "الأخذ_بالملاحظات", "جاهزة_للرفع",
    "قيد_التدقيق_في_ناجز", "مداولة_الصلح", "أغلق_طلب_الصلح", "منظورة",
  ],
  "عمالي": [
    "استلام", "استكمال_البيانات", "دراسة",
    "توجيه_العميل_بالتسوية", "بانتظار_رفع_العميل_للتسوية",
    "مداولة_الصلح", "أغلق_طلب_الصلح",
    "تحرير_صحيفة_الدعوى", "مراجعة_داخلية", "إحالة_للجنة_المراجعة",
    "الأخذ_بالملاحظات", "جاهزة_للرفع", "قيد_التدقيق_في_ناجز", "منظورة",
  ],
  "إداري": [
    "استلام", "تحديد_تاريخ_التقادم", "استكمال_البيانات", "دراسة",
    "تحرير_صيغة_التظلم", "مراجعة_داخلية_للتظلم",
    "تقديم_التظلم", "انتظار_رد_التظلم",
    "تحرير_صحيفة_الدعوى", "مراجعة_داخلية", "إحالة_للجنة_المراجعة",
    "الأخذ_بالملاحظات", "جاهزة_للرفع", "قيد_التدقيق_في_معين", "منظورة",
  ],
};

const IN_COURT_STAGES_UNION: string[] = [
  "استلام", "استكمال_البيانات", "تحرير_مذكرة_جوابية", "تحرير_صحيفة_الدعوى",
  "دراسة", "مراجعة_داخلية", "إحالة_للجنة_المراجعة", "الأخذ_بالملاحظات",
  "مداولة_الصلح", "أغلق_طلب_الصلح", "منظورة",
  "محكوم_حكم_ابتدائي", "منظورة_استئناف", "محكوم_حكم_نهائي",
  "مشطوبة", "تحصيل", "مقفلة",
];

// Returns the stage values to show in the multi-select. Preserves
// CaseStagesOrder ordering. Rule:
//   classifications=[] AND deptNames=[]  → all stages (no signal)
//   if IN_COURT in classifications (or none chosen) → add IN_COURT_STAGES_UNION
//   if UNDER_STUDY in classifications (or none chosen):
//     deptNames=[]  → add union of all dept paths
//     deptNames=[…] → add per-dept lists (by dept NAME)
function getFilterStages(
  classifications: string[],
  deptNames: string[],
): string[] {
  if (classifications.length === 0 && deptNames.length === 0) {
    return CaseStagesOrder as unknown as string[];
  }
  const collected = new Set<string>();
  const noClassification = classifications.length === 0;
  const hasInCourt = noClassification || classifications.includes(CaseClassification.IN_COURT);
  const hasUnderStudy = noClassification || classifications.includes(CaseClassification.UNDER_STUDY);

  if (hasInCourt) {
    for (const s of IN_COURT_STAGES_UNION) collected.add(s);
  }
  if (hasUnderStudy) {
    if (deptNames.length === 0) {
      for (const list of Object.values(UNDER_STUDY_STAGES_BY_DEPT_NAME)) {
        for (const s of list) collected.add(s);
      }
    } else {
      for (const d of deptNames) {
        const list = UNDER_STUDY_STAGES_BY_DEPT_NAME[d];
        if (list) for (const s of list) collected.add(s);
      }
    }
  }
  if (collected.size === 0) return CaseStagesOrder as unknown as string[];
  return (CaseStagesOrder as unknown as string[]).filter((s) => collected.has(s));
}

type SavedFilterRow = {
  id: string;
  name: string;
  filterConfig: AdvancedCasesFilters;
  pageType: string;
  createdAt: string;
};

function loadRecent(): AdvancedCasesFilters[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecent(f: AdvancedCasesFilters) {
  if (countActiveAdvFilters(f) === 0) return;
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
  f: AdvancedCasesFilters,
  deptName: (id: string) => string,
  lawyerName: (id: string) => string,
): string {
  const parts: string[] = [];
  if (f.priorities.length) parts.push(`الأولوية: ${f.priorities.join("، ")}`);
  if (f.stages.length)
    parts.push(`المرحلة: ${f.stages.map((s) => CaseStageLabels[s as keyof typeof CaseStageLabels] || s).join("، ")}`);
  if (f.depts.length) parts.push(`القسم: ${f.depts.map(deptName).join("، ")}`);
  if (f.classifications.length)
    parts.push(
      `التصنيف: ${f.classifications
        .map((c) => CaseClassificationLabels[c as keyof typeof CaseClassificationLabels] || c)
        .join("، ")}`,
    );
  if (f.lawyers.length) parts.push(`المحامي: ${f.lawyers.map(lawyerName).join("، ")}`);
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
  filters: AdvancedCasesFilters;
  onChange: (filters: AdvancedCasesFilters) => void;
  departments: Array<{ id: string; name: string }>;
  lawyers: Array<{ id: string; name: string }>;
}

export function CasesAdvancedFilters({ filters, onChange, departments, lawyers }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdvancedCasesFilters>(filters);
  const [savedName, setSavedName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [recents, setRecents] = useState<AdvancedCasesFilters[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDraft(filters);
      setRecents(loadRecent());
    }
  }, [open, filters]);

  const savedQuery = useQuery<SavedFilterRow[]>({
    queryKey: ["/api/saved-filters", "?pageType=cases"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/saved-filters?pageType=cases");
      return res.json();
    },
    enabled: open,
  });

  const priorityOptions = useMemo(
    () => Object.values(Priority).map((p) => ({ value: p, label: p })),
    [],
  );
  const selectedDeptNames = useMemo(
    () =>
      draft.depts
        .map((id) => departments.find((d) => String(d.id) === id)?.name)
        .filter((n): n is string => !!n),
    [draft.depts, departments],
  );
  const stageOptions = useMemo(() => {
    const allowed = getFilterStages(draft.classifications, selectedDeptNames);
    return allowed.map((s) => ({
      value: s,
      label: CaseStageLabels[s as keyof typeof CaseStageLabels] || s,
    }));
  }, [draft.classifications, selectedDeptNames]);

  // When the allowed stages list narrows, prune stale stage selections so the
  // user doesn't end up with hidden filters that still constrain results.
  useEffect(() => {
    const allowed = new Set(stageOptions.map((o) => o.value));
    if (draft.stages.some((s) => !allowed.has(s))) {
      setDraft((prev) => ({
        ...prev,
        stages: prev.stages.filter((s) => allowed.has(s)),
      }));
    }
  }, [stageOptions, draft.stages]);

  const deptOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: d.name })),
    [departments],
  );
  const classificationOptions = useMemo(
    () =>
      Object.values(CaseClassification).map((c) => ({
        value: c,
        label: CaseClassificationLabels[c as keyof typeof CaseClassificationLabels] || c,
      })),
    [],
  );
  const lawyerOptions = useMemo(
    () => lawyers.map((l) => ({ value: l.id, label: l.name })),
    [lawyers],
  );

  const deptNameById = (id: string) => departments.find((d) => String(d.id) === id)?.name || id;
  const lawyerNameById = (id: string) => lawyers.find((l) => l.id === id)?.name || id;

  const apply = (next: AdvancedCasesFilters) => {
    onChange(next);
    saveRecent(next);
    setRecents(loadRecent());
    setOpen(false);
  };

  const clearAll = () => {
    setDraft(EMPTY_ADV_FILTERS);
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
    if (countActiveAdvFilters(draft) === 0) {
      toast({ title: "لا توجد فلاتر مختارة لحفظها", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/saved-filters", {
        name,
        filterConfig: draft,
        pageType: "cases",
      });
      setSavedName("");
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", "?pageType=cases"] });
      toast({ title: "تم حفظ الفلتر" });
    } catch (e: any) {
      toast({ title: "فشل حفظ الفلتر", description: e?.message, variant: "destructive" });
    }
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/saved-filters/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", "?pageType=cases"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/saved-filters", "?pageType=cases"] });
      toast({ title: "تم تعديل الاسم" });
    } catch (e: any) {
      toast({ title: "فشل التعديل", description: e?.message, variant: "destructive" });
    }
  };

  const activeCount = countActiveAdvFilters(filters);

  return (
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
            <MultiSelectCombo
              label="الأولوية"
              values={draft.priorities}
              onChange={(v) => setDraft({ ...draft, priorities: v as PriorityType[] })}
              options={priorityOptions}
              placeholder="كل الأولويات"
              searchable={false}
              testIdPrefix="adv-priority"
            />
            <MultiSelectCombo
              label="التصنيف"
              values={draft.classifications}
              onChange={(v) => setDraft({ ...draft, classifications: v })}
              options={classificationOptions}
              placeholder="كل التصنيفات"
              searchable={false}
              testIdPrefix="adv-classification"
            />
            <MultiSelectCombo
              label="المرحلة"
              values={draft.stages}
              onChange={(v) => setDraft({ ...draft, stages: v })}
              options={stageOptions}
              placeholder="كل المراحل"
              testIdPrefix="adv-stage"
            />
            <MultiSelectCombo
              label="القسم"
              values={draft.depts}
              onChange={(v) => setDraft({ ...draft, depts: v })}
              options={deptOptions}
              placeholder="كل الأقسام"
              testIdPrefix="adv-dept"
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
                          onClick={() => apply(row.filterConfig || EMPTY_ADV_FILTERS)}
                          title={describeFilters(
                            row.filterConfig || EMPTY_ADV_FILTERS,
                            deptNameById,
                            lawyerNameById,
                          )}
                        >
                          <div className="text-sm font-medium truncate">{row.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {describeFilters(
                              row.filterConfig || EMPTY_ADV_FILTERS,
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
  );
}
