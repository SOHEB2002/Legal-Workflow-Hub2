// Authoritative rule for displaying the client's role (صفة العميل):
//   قيد_الدراسة      → "مدعي" (always, no exceptions — firm is always plaintiff)
//   منظورة_بالمحكمة → stored clientRole if set, else "مدعي"
//
// Why default to "مدعي" for empty in-court clientRole: legacy rows created
// before clientRole was a required field have null clientRole. We can't
// recover the true side after the fact, so we default to "مدعي" — the firm
// is the plaintiff in the vast majority of cases, so this is the safer
// default than showing "-" or guessing "مدعى عليه".
//
// The stored value is Arabic-with-underscore ("مدعي" / "مدعى_عليه"); the
// display form replaces the underscore with a space.
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
    return "مدعي";
  }
  return "-";
}
