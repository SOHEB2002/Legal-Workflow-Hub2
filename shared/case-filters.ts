import { z } from "zod";
import { NO_CASE_DEPARTMENT, caseWorkflowSchema, resolveCaseWorkflow, type LawCase } from "./schema";

// Separate parameters: the department sentinel is presentation/query-only.
export const caseFilterQuerySchema = z.object({
  departmentId: z.string().min(1).optional(),
  caseWorkflow: z.union([caseWorkflowSchema, z.literal("all")]).optional(),
});

export function caseDepartmentFilterKey(departmentId: string | null | undefined): string | undefined {
  return departmentId === null ? NO_CASE_DEPARTMENT : departmentId;
}

export function matchesCaseFilters(
  c: Pick<LawCase, "departmentId" | "caseWorkflow">,
  filters: { departmentId?: string; caseWorkflow?: string },
  legacyDepartmentName?: string,
): boolean {
  const department = filters.departmentId;
  const departmentKey = department === "null" || department === "committees" ? NO_CASE_DEPARTMENT : department;
  return (!departmentKey || departmentKey === "all" || caseDepartmentFilterKey(c.departmentId) === departmentKey)
    && (!filters.caseWorkflow || filters.caseWorkflow === "all"
      || resolveCaseWorkflow(c, legacyDepartmentName) === filters.caseWorkflow);
}
