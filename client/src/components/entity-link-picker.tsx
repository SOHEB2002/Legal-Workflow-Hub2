import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCases } from "@/lib/cases-context";
import { useConsultations } from "@/lib/consultations-context";
import { useContracts } from "@/lib/contracts-context";
import { useClients } from "@/lib/clients-context";

// SHARED entity-link picker. EXTRACTED VERBATIM from pages/my-tasks.tsx, where
// it was defined inline for the general (عام) task create form. Moved here
// unchanged so the notifications send dialog uses the SAME control rather than
// a second, differently-behaving one — the send dialog previously had two plain
// Selects (a type select plus an unsearchable entity select limited to cases
// and consultations).
//
// The component was already generic by construction: its only props are
// (linkType, linkId, onChange) and it reads its own option lists from the
// app-wide entity contexts, so extraction needed no signature change and the
// my-tasks caller is byte-identical.
//
// A caller maps linkType/linkId onto whatever field names it stores:
//   • my-tasks       → caseId / consultationId / contractId / clientId
//   • notifications  → relatedType / relatedId
export type LinkType = "none" | "case" | "consultation" | "contract" | "client";

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  none: "بدون ربط", case: "قضية", consultation: "استشارة", contract: "عقد", client: "عميل",
};

export function EntityLinkPicker({
  linkType, linkId, onChange, label = "ربط بكيان (اختياري)", types,
}: {
  linkType: LinkType;
  linkId: string;
  onChange: (linkType: LinkType, linkId: string) => void;
  /** Overridable so a host can title the field in its own words; defaults to
   *  the my-tasks wording so that caller is unchanged. */
  label?: string;
  /** Which link types this host supports. Defaults to ALL of them, so the
   *  my-tasks caller is unchanged. Notifications pass a narrower set: their
   *  relatedType is typed to case/consultation/task/field_task/hearing/memo and
   *  the cascade cleanup in storage only handles case/consultation/hearing/memo,
   *  so a contract- or client-linked notification would be both untyped and
   *  never cleaned up. */
  types?: LinkType[];
}) {
  const { cases } = useCases();
  const { consultations } = useConsultations();
  const { contracts } = useContracts();
  const { clients, getClientName } = useClients();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Candidate {id,label,sublabel} list for the active link type, drawn from the
  // already-loaded context lists (search by number/name + the secondary field).
  const options: { id: string; label: string; sublabel: string }[] =
    linkType === "case"
      ? cases.map((c) => ({ id: c.id, label: c.caseNumber, sublabel: getClientName(c.clientId) }))
      : linkType === "consultation"
      // TITLE first — a consultation number identifies nothing to a reader,
      // which is why the consultations list itself leads with the title. The
      // NUMBER moves into the sublabel rather than being dropped: the filter
      // below matches label OR sublabel, so someone who knows the number can
      // still find it, and it stays visible for cross-referencing.
      //
      // title is NULLABLE (schema.ts: rows created before the column existed
      // have none), so a title-less consultation falls back to the number as
      // its label — i.e. exactly the previous behaviour — and never renders a
      // blank row. The number is then left out of the sublabel so it is not
      // shown twice.
      ? consultations.map((c) => {
          const title = (c.title || "").trim();
          const client = getClientName(c.clientId);
          return {
            id: c.id,
            label: title || c.consultationNumber,
            sublabel: title
              ? [c.consultationNumber, client].filter(Boolean).join(" — ")
              : client,
          };
        })
      : linkType === "contract"
      ? contracts.map((c) => ({ id: c.id, label: c.contractNumber, sublabel: c.title }))
      : linkType === "client"
      ? clients.map((c) => ({ id: c.id, label: getClientName(c.id), sublabel: c.phone || "" }))
      : [];

  const q = search.trim().toLowerCase();
  const filtered = (q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel.toLowerCase().includes(q))
    : options
  ).slice(0, 50);
  const selectedLabel = linkId ? options.find((o) => o.id === linkId)?.label ?? "" : "";

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-3">
        <Select
          value={linkType}
          onValueChange={(v) => { onChange(v as LinkType, ""); setSearch(""); }}
        >
          <SelectTrigger data-testid="select-link-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(types ?? (Object.keys(LINK_TYPE_LABELS) as LinkType[])).map((t) => (
              <SelectItem key={t} value={t}>{LINK_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {linkType !== "none" && (
          <div ref={wrapperRef} className="relative">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                data-testid="input-link-search"
                value={open || !selectedLabel ? search : selectedLabel}
                onChange={(e) => { setSearch(e.target.value); setOpen(true); if (linkId) onChange(linkType, ""); }}
                onFocus={() => setOpen(true)}
                placeholder={`ابحث عن ${LINK_TYPE_LABELS[linkType]}…`}
                className="pr-9 pl-8"
              />
              {linkId && (
                <button
                  type="button"
                  onClick={() => { onChange(linkType, ""); setSearch(""); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  data-testid="button-clear-link"
                ><X className="w-4 h-4" /></button>
              )}
            </div>
            {open && (
              <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-[200px] overflow-y-auto">
                {filtered.length > 0 ? filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    data-testid={`option-link-${o.id}`}
                    className="w-full text-right px-3 py-2 text-sm hover-elevate cursor-pointer flex items-center justify-between gap-2"
                    onClick={() => { onChange(linkType, o.id); setSearch(""); setOpen(false); }}
                  >
                    <span>{o.label}</span>
                    {o.sublabel && <span className="text-muted-foreground text-xs">{o.sublabel}</span>}
                  </button>
                )) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
