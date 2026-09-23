import assert from "node:assert/strict";
import { test } from "node:test";
import { caseDepartmentFilterKey, caseFilterQuerySchema, matchesCaseFilters } from "./case-filters";
import { NO_CASE_DEPARTMENT, type CaseWorkflowValue } from "./schema";

const rows = [
  { id: "committee-labor", departmentId: null, caseWorkflow: "labor" },
  { id: "committee-general", departmentId: null, caseWorkflow: "general" },
  { id: "admin-labor", departmentId: "admin", caseWorkflow: "labor" },
  { id: "admin-general", departmentId: "admin", caseWorkflow: "general" },
  { id: "legacy", departmentId: "labor", caseWorkflow: null },
  { id: "ambiguous", departmentId: null, caseWorkflow: null },
] satisfies { id: string; departmentId: string | null; caseWorkflow: CaseWorkflowValue | null }[];
const name = (id: string | null) => id === "labor" ? "عمالي" : id === "admin" ? "إداري" : undefined;
const find = (filters: { departmentId?: string; caseWorkflow?: string }) => rows.filter(c => matchesCaseFilters(c, filters, name(c.departmentId))).map(c => c.id);

test("null-department and workflow filters intersect independently", () => {
  for (const departmentId of [NO_CASE_DEPARTMENT, "null", "committees"]) {
    assert.deepEqual(find({ departmentId, caseWorkflow: "labor" }), ["committee-labor"]);
    assert.deepEqual(find({ departmentId }), ["committee-labor", "committee-general", "ambiguous"]);
  }
  assert.deepEqual(find({ departmentId: "admin", caseWorkflow: "general" }), ["admin-general"]);
  assert.deepEqual(find({ caseWorkflow: "labor" }), ["committee-labor", "admin-labor", "legacy"]);
});

test("unfiltered totals and organizational partitions retain every case", () => {
  assert.equal(find({}).length, rows.length);
  assert.equal(find({ departmentId: "all", caseWorkflow: "all" }).length, rows.length);
  const groups = new Map<string | undefined, number>();
  for (const row of rows) {
    const key = caseDepartmentFilterKey(row.departmentId);
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  assert.equal(groups.get(NO_CASE_DEPARTMENT), 3);
  assert.equal([...groups.values()].reduce((a, b) => a + b), rows.length);
  assert.equal(caseDepartmentFilterKey(undefined), undefined, "missing parent is not a committee case");
});

test("query validation rejects invalid/repeated workflows and object-valued departments", () => {
  assert.equal(caseFilterQuerySchema.safeParse({ departmentId: "null", caseWorkflow: "labor" }).success, true);
  for (const caseWorkflow of ["اللجان", "unknown", ["labor", "general"]]) {
    assert.equal(caseFilterQuerySchema.safeParse({ caseWorkflow }).success, false);
  }
  assert.equal(caseFilterQuerySchema.safeParse({ departmentId: { null: true } }).success, false);
});
