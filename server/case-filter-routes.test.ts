import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { caseFilterQuerySchema, matchesCaseFilters } from "../shared/case-filters";
import { caseReachedJudgmentStage, resolveCaseWorkflow } from "../shared/schema";

// Execute the real handlers with in-memory storage; never import DB initialization.
const source = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const rows = [
  { id: "committee", caseNumber: "CASE-1", departmentId: null, caseWorkflow: "labor" },
  { id: "owned", caseNumber: "CASE-2", departmentId: "admin", caseWorkflow: "labor" },
  { id: "general", caseNumber: "CASE-3", departmentId: null, caseWorkflow: "general" },
];
const storage = {
  getAllCases: async () => rows,
  getAllDepartments: async () => [{ id: "admin", name: "إداري" }],
  getAllUsers: async () => [],
  getCaseIdsWithDeedAttachment: async () => new Set(),
  getCaseIdsWithJudgment: async () => new Set(),
  getCurrentJudgmentSummaries: async () => new Map(),
  getPinnedCaseNotesByCase: async () => new Map(),
};
type Response = { status: (code: number) => Response; json: (value: unknown) => void; send: (value: string) => void; setHeader: () => void };
type Handler = (req: { query: Record<string, unknown>; user: { role: string; id: string; departmentId: string } }, res: Response) => Promise<void>;
function handler(path: string): Handler {
  let selected: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "app.get"
      && node.arguments[0]?.getText(source) === JSON.stringify(path)) selected = node.arguments[node.arguments.length - 1];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(selected, path);
  const js = ts.transpileModule(`(${selected.getText(source)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(js, { storage, caseFilterQuerySchema, matchesCaseFilters, resolveCaseWorkflow, caseReachedJudgmentStage, console,
    generateCSV: (data: Record<string, unknown>[], headers: string[], keys: string[]) => JSON.stringify({ headers, keys, data }),
  }) as Handler;
}
async function call(path: string, query: Record<string, unknown>, role = "employee") {
  let status = 200;
  let body: unknown;
  const res: Response = { status: code => { status = code; return res; }, json: value => { body = value; }, send: value => { body = value; }, setHeader: () => {} };
  await handler(path)({ query, user: { role, id: "unrelated", departmentId: "other" } }, res);
  return { status, body };
}

test("case listing supports combined filters and retains all rows without filters", async () => {
  const all = await call("/api/cases", {});
  assert.equal(all.status, 200);
  assert.equal((all.body as { id: string }[]).length, 3);
  const filtered = await call("/api/cases", { departmentId: "null", caseWorkflow: "labor" });
  assert.deepEqual(Array.from(filtered.body as { id: string }[], c => c.id), ["committee"]);
});
test("global case search lets unrelated employees and heads discover committee cases", async () => {
  for (const role of ["employee", "department_head"]) {
    const result = await call("/api/search", { q: "CASE", type: "cases", departmentId: "committees", caseWorkflow: "labor" }, role);
    assert.deepEqual(Array.from((result.body as { results: { id: string }[] }).results, c => c.id), ["committee"]);
  }
});
test("export applies the same intersection and includes separate department/workflow columns", async () => {
  const result = await call("/api/export/cases", { departmentId: "null", caseWorkflow: "labor" }, "branch_manager");
  const csvInput = JSON.parse((result.body as string).replace(/^\uFEFF/, ""));
  assert.equal(csvInput.data.length, 1);
  assert.equal(csvInput.data[0].department, "اللجان");
  assert.equal(csvInput.data[0].caseWorkflow, "labor");
  assert.ok(csvInput.keys.includes("caseWorkflow"));
  assert.ok(csvInput.keys.includes("department"));
});
test("list, search and export reject malformed workflow filters", async () => {
  for (const path of ["/api/cases", "/api/search", "/api/export/cases"]) {
    const result = await call(path, { q: "CASE", type: "cases", caseWorkflow: "invalid" }, "branch_manager");
    assert.equal(result.status, 400, path);
  }
});
