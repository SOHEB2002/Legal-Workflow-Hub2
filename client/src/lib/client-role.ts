// Authoritative rule for displaying the client's role (صفة العميل):
//   قيد_الدراسة      → "مدعي" (always, no exceptions — firm is always plaintiff)
//   منظورة_بالمحكمة → stored clientRole if set, else "-"
// The stored value is Arabic-with-underscore ("مدعي" / "مدعى_عليه"); the display
// form replaces the underscore with a space.
export type ClientRoleDisplay = "مدعي" | "مدعى عليه" | "-";

export function getClientRoleLabel(
  caseClassification?: string | null,
  clientRole?: string | null,
): ClientRoleDisplay {
  if (caseClassification === "قيد_الدراسة") return "مدعي";
  if (caseClassification === "منظورة_بالمحكمة") {
    const raw = (clientRole || "").trim();
    if (raw === "مدعى_عليه") return "مدعى عليه";
    if (raw === "مدعي") return "مدعي";
    return "-";
  }
  return "-";
}
