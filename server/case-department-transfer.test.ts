import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as schema from "../shared/schema";

// Execute the actual UI callbacks and PATCH handler without starting the server or DB.
const read = (path: string) => ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const routes = read("./routes.ts");
const ui = read("../client/src/pages/cases.tsx");
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  const matches: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); }
  visit(root);
  assert.equal(matches.length, 1);
  return matches[0];
}
function compile(text: string, globals: Record<string, unknown>): unknown {
  return runInNewContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, globals);
}
const fixture = () => ({
  id: "case", caseNumber: "CASE", departmentId: "general", caseWorkflow: "labor",
  caseClassification: "منظورة_بالمحكمة", currentStage: "محكوم_حكم_نهائي",
  stageHistory: [{ stage: "محكوم_حكم_نهائي", notes: "existing history" }],
  primaryLawyerId: "old", responsibleLawyerId: null, assignedLawyers: ["old"],
  clientRole: "مدعي", memoRequired: false, isSettlementCase: false, adminCaseSubType: null,
});
const users = [
  { id: "old", departmentId: "general", isActive: true, canBeAssignedCases: true },
  { id: "cross", departmentId: "other", isActive: true, canBeAssignedCases: true },
  { id: "no-department", departmentId: null, isActive: true, canBeAssignedCases: true },
  { id: "inactive", departmentId: null, isActive: false, canBeAssignedCases: true },
  { id: "ineligible", departmentId: null, isActive: true, canBeAssignedCases: false },
];
async function patch(body: Record<string, unknown>, overrides: Record<string, unknown> = {}, role = "branch_manager") {
  let row = { ...fixture(), ...overrides };
  let status = 200;
  let response: unknown;
  const writes: Record<string, unknown>[] = [];
  const errors: unknown[] = [];
  const globals: Record<string, unknown> = {
    ...schema,
    console: { ...console, error: (...args: unknown[]) => errors.push(args) },
    storage: {
      getCaseById: async () => row,
      getDepartmentById: async (id: string) => ["general", "commercial", "labor", "administrative"].includes(id) ? { id, name: schema.CaseWorkflowLabels[id as schema.CaseWorkflowValue] } : undefined,
      getUser: async (id: string) => users.find(u => u.id === id),
      updateCase: async (_id: string, update: Record<string, unknown>) => { writes.push({ ...update }); row = { ...row, ...update }; return row; },
      createNotification: async () => {},
      getAllUsers: async () => [], getHearingsByCase: async () => [], getMemosByCase: async () => [],
      getHearingIdsWithDeliberateAssignment: async () => new Set(),
    },
    stripJudgmentMirrorFields: () => [],
    validateAssignedUsersActive: async () => ({ valid: true }),
    logCaseActivityActing: async () => {},
    departmentHeadsOrBranchManagers: () => ["manager"],
    ENTITY_TIER_RANK: { assignee: 1, department: 2, manager: 3 },
    prescriptionInputsChanged: () => false,
  };
  const helpers = ["caseProcedureName", "validateCaseOwnership", "isAssignedLawyer", "caseActorIdentities", "canModifyCaseIdentity", "canModifyCase", "canEditCaseData", "entityActorTier", "canActOnEntityTiered", "canActAtDepartmentTier"];
  for (const name of helpers) {
    const fn = find(routes, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    globals[name] = compile(`(${fn.getText(routes)})`, globals);
  }
  const route = find(routes, n => ts.isCallExpression(n) && n.expression.getText(routes) === "app.patch" && n.arguments[0]?.getText(routes) === '"/api/cases/:id"') as ts.CallExpression;
  const handler = compile(`(${route.arguments[route.arguments.length - 1].getText(routes)})`, globals) as (req: unknown, res: unknown) => Promise<void>;
  const res = { status: (value: number) => { status = value; return res; }, json: (value: unknown) => { response = value; } };
  await handler({ params: { id: "case" }, body: { ...body }, user: { id: "manager", role, departmentId: "general", name: "Manager" } }, res);
  assert.deepEqual(errors, [], "handler must not swallow errors");
  return { row, status, response, writes };
}
test("backend transfer at advanced stages preserves procedure/history and existing responsibility", async () => {
  for (const currentStage of ["إحالة_للجنة_المراجعة", "منظورة", "محكوم_حكم_نهائي", "مقفلة"]) {
    const result = await patch({ departmentId: "commercial", transferReason: "organizational" }, { currentStage });
    assert.equal(result.status, 200);
    assert.equal(result.row.departmentId, "commercial");
    for (const key of ["caseWorkflow", "caseClassification", "stageHistory", "primaryLawyerId", "clientRole", "memoRequired", "isSettlementCase", "adminCaseSubType"] as const) assert.deepEqual(result.row[key], fixture()[key], key);
    assert.equal(result.row.currentStage, currentStage);
    assert.equal(result.writes.length, 1);
    for (const key of ["currentStage", "stageHistory", "caseWorkflow", "caseClassification", "primaryLawyerId"]) assert.equal(Object.hasOwn(result.writes[0], key), false, key);
  }
});
test("backend null department requires a valid resulting responsible person", async () => {
  assert.equal((await patch({ departmentId: null }, { primaryLawyerId: null, assignedLawyers: [] })).status, 400);
  assert.equal((await patch({ departmentId: null, primaryLawyerId: null })).status, 400);
  for (const primaryLawyerId of ["cross", "no-department"]) {
    const result = await patch({ departmentId: null, primaryLawyerId });
    assert.equal(result.status, 200);
    assert.equal(result.row.primaryLawyerId, primaryLawyerId);
    assert.equal(result.row.departmentId, null);
    assert.equal(result.row.caseWorkflow, "labor");
    assert.deepEqual(result.row.stageHistory, fixture().stageHistory);
  }
  for (const primaryLawyerId of ["inactive", "ineligible", "missing"]) assert.equal((await patch({ departmentId: null, primaryLawyerId })).status, 400);
  assert.equal((await patch({ departmentId: null })).row.primaryLawyerId, "old");
});
test("explicit unassignment is allowed for a real department; authorization and unmapped-legacy safeguards remain", async () => {
  const cleared = await patch({ departmentId: "commercial", primaryLawyerId: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.row.primaryLawyerId, null);
  assert.equal((await patch({ departmentId: "commercial" }, {}, "employee")).status, 403);
  assert.equal((await patch({ departmentId: "missing" })).status, 400);
  const legacy = await patch({ departmentId: "commercial" }, { caseWorkflow: null, departmentId: null });
  assert.equal(legacy.status, 400);
  assert.equal(legacy.writes.length, 0);
});
test("legacy General and Labor transfers save the source default without a legacy-required 400", async () => {
  for (const departmentId of ["general", "labor"]) {
    for (const currentStage of ["منظورة", "محكوم_حكم_نهائي", "مقفلة"]) {
      const result = await patch({ departmentId: "commercial" }, { departmentId, caseWorkflow: null, currentStage });
      assert.equal(result.status, 200, JSON.stringify(result.response));
      assert.equal(result.row.caseWorkflow, departmentId);
      assert.equal(result.row.departmentId, "commercial");
      assert.equal(result.row.currentStage, currentStage);
      assert.deepEqual(result.row.stageHistory, fixture().stageHistory);
      assert.equal(result.row.caseClassification, fixture().caseClassification);
      assert.equal(result.row.primaryLawyerId, "old");
    }
  }
});
test("legacy defaults are saved on edit/reassignment and selected overrides win", async () => {
  for (const body of [{ departmentId: "general" }, { primaryLawyerId: "cross" }]) {
    const result = await patch(body, { caseWorkflow: null });
    assert.equal(result.status, 200, JSON.stringify(result.response));
    assert.equal(result.row.caseWorkflow, "general");
  }
  for (const departmentId of ["general", null, "unknown"]) {
    const result = await patch({ departmentId: "commercial", caseWorkflow: "labor" }, { departmentId, caseWorkflow: null, currentStage: "منظورة" });
    assert.equal(result.status, 200, JSON.stringify(result.response));
    assert.equal(result.row.caseWorkflow, "labor");
    assert.equal(result.row.currentStage, "منظورة");
    assert.deepEqual(result.row.stageHistory, fixture().stageHistory);
  }
  for (const departmentId of [null, "unknown"]) {
    const result = await patch({ departmentId: "commercial" }, { departmentId, caseWorkflow: null });
    assert.equal(result.status, 400);
    assert.equal(result.writes.length, 0);
  }
});
test("legacy transfer UI prefills current department, submits default/override, and requires unmapped selection", async () => {
  for (const [name, expected] of [["عام", "general"], ["عمالي", "labor"], ["أخرى", ""], ["", ""]]) {
    const row = { ...fixture(), caseWorkflow: null };
    let form: Record<string, unknown> = {};
    const payloads: Record<string, unknown>[] = [];
    const globals: Record<string, unknown> = {
      ...schema, users, getDepartmentName: () => name, transferCaseId: row.id, getCaseById: () => row,
      setTransferCaseId: () => {}, setTransferData: (value: Record<string, unknown>) => { form = value; },
      setShowTransferDialog: () => {}, toast: () => {},
      apiRequest: async (_method: string, _url: string, body: Record<string, unknown>) => { payloads.push(body); },
      queryClient: { invalidateQueries: async () => {} },
    };
    const callback = (name: string) => {
      const node = find(ui, n => ts.isVariableDeclaration(n) && n.name.getText(ui) === name) as ts.VariableDeclaration;
      return compile(`(${node.initializer!.getText(ui)})`, globals) as (row?: unknown) => Promise<void>;
    };
    await callback("openTransferDialog")(row);
    assert.equal(form.caseWorkflow, expected);
    globals.transferData = { ...form, toDepartmentId: "commercial", reason: "reason" };
    await callback("handleTransferRequest")();
    assert.equal(payloads.length, expected ? 1 : 0);
    if (expected) assert.equal(payloads[0].caseWorkflow, expected);
    globals.transferData = { ...form, toDepartmentId: "commercial", caseWorkflow: "administrative", reason: "reason" };
    await callback("handleTransferRequest")();
    assert.equal(payloads.at(-1)?.caseWorkflow, "administrative");
    for (const payload of payloads) for (const key of ["currentStage", "stageHistory", "caseClassification", "primaryLawyerId"]) assert.equal(Object.hasOwn(payload, key), false);
  }
});
test("transfer dialog opens at an advanced stage with existing assignee and submits only ownership fields", async () => {
  const row = fixture();
  let form = { toDepartmentId: "", primaryLawyerId: "", caseWorkflow: "", reason: "" };
  let opened = false;
  const payloads: Record<string, unknown>[] = [];
  const globals: Record<string, unknown> = {
    ...schema, users, getDepartmentName: () => "عام", transferCaseId: row.id, getCaseById: () => row,
    setTransferCaseId: () => {}, setTransferData: (value: typeof form) => { form = value; },
    setShowTransferDialog: (value: boolean) => { opened = value; }, toast: () => {},
    apiRequest: async (_method: string, _url: string, body: Record<string, unknown>) => { payloads.push(body); },
    queryClient: { invalidateQueries: async () => {} },
  };
  function callback(name: string) {
    const node = find(ui, n => ts.isVariableDeclaration(n) && n.name.getText(ui) === name) as ts.VariableDeclaration;
    return compile(`(${node.initializer!.getText(ui)})`, globals) as (row?: unknown) => Promise<void>;
  }
  await callback("openTransferDialog")(row);
  assert.equal(opened, true);
  assert.equal(form.primaryLawyerId, "old");
  for (const [department, assignee, count] of [[schema.NO_CASE_DEPARTMENT, "", 0], [schema.NO_CASE_DEPARTMENT, "inactive", 0], [schema.NO_CASE_DEPARTMENT, "no-department", 1], ["commercial", "old", 2], ["commercial", "", 3]] as const) {
    globals.transferData = { ...form, toDepartmentId: department, primaryLawyerId: assignee, reason: "reason" };
    await callback("handleTransferRequest")();
    assert.equal(payloads.length, count);
  }
  assert.equal(payloads[0].primaryLawyerId, "no-department");
  assert.equal(Object.hasOwn(payloads[1], "primaryLawyerId"), false);
  assert.equal(payloads[2].primaryLawyerId, null);
  for (const payload of payloads) for (const key of ["currentStage", "stageHistory", "caseWorkflow", "caseClassification"]) assert.equal(Object.hasOwn(payload, key), false);
});
