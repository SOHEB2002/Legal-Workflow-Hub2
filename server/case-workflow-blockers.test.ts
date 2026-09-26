import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { CommitteeDecision, CaseClassification, ReviewDecision, workflowDecisionSchema, caseWorkflowName, caseWorkflowSelectionPatch, resolveCaseWorkflow, MyTaskKind, NO_CASE_DEPARTMENT } from "../shared/schema";

// Execute the checked-out handlers/predicates without importing server startup or a database.
function source(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function select(file: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  const matches: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); }
  visit(file);
  assert.equal(matches.length, 1, "expected one executable source match");
  return matches[0];
}
function evaluate(node: ts.Node, file: ts.SourceFile, globals: Record<string, unknown>): unknown {
  return runInNewContext(ts.transpileModule(`(${node.getText(file)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, globals);
}
const routes = source("./routes.ts");
test("My Tasks assignment prefills and submits the legacy source default or user override", () => {
  const file = source("../client/src/pages/my-tasks.tsx");
  const open = select(file, n => ts.isFunctionDeclaration(n) && n.name?.text === "openAction");
  const build = select(file, n => ts.isFunctionDeclaration(n) && n.name?.text === "buildActionRequest");
  for (const [departmentId, name, expected] of [["source", "عام", "general"], ["source", "عمالي", "labor"], [null, "", ""], ["source", "أخرى", ""]]) {
    let form: Record<string, unknown> = {};
    const task = { kind: MyTaskKind.CASE_UNASSIGNED, entityId: "case" };
    const globals = {
      MyTaskKind, NO_CASE_DEPARTMENT, resolveCaseWorkflow, caseWorkflowSelectionPatch, EMPTY_FORM: {},
      isUnassignedTypeTask: () => false,
      departments: departmentId ? [{ id: departmentId, name }] : [],
      getCaseById: () => ({ departmentId, caseWorkflow: null, primaryLawyerId: "lawyer" }),
      setForm: (value: Record<string, unknown>) => { form = value; }, setActionTask: () => {},
    };
    (evaluate(open, file, globals) as (task: unknown) => void)(task);
    assert.equal(form.caseWorkflow, expected);
    const request = evaluate(build, file, globals) as (task: unknown, form: unknown) => { body: { caseWorkflow?: string } };
    assert.equal(request(task, { ...form, assignDeptId: "destination" }).body.caseWorkflow, expected || undefined);
    assert.equal(request(task, { ...form, caseWorkflow: "commercial" }).body.caseWorkflow, "commercial");
  }
});
test("existing-case forms prefill the source department default and submit it or the override", async () => {
  const file = source("../client/src/pages/cases.tsx");
  for (const [open, setter, submit, formName] of [
    ["openEditDialog", "setEditFormData", "handleEditCase", "editFormData"],
    ["openReassignCaseDialog", "setReassignOwnership", "handleReassignCase", "reassignOwnership"],
    ["openAssignDialog", "setAssignData", "handleAssign", "assignData"],
  ]) {
    for (const selection of ["general", "labor"]) {
      let form: Record<string, unknown> = {};
      let payload: Record<string, unknown> | undefined;
      const row = { id: "case", departmentId: "dept", primaryLawyerId: "lawyer", caseWorkflow: null, currentStage: "توجيه_العميل_بالتسوية" };
      const globals: Record<string, unknown> = {
        NO_CASE_DEPARTMENT, caseWorkflowSelectionPatch, caseOwnershipError: () => null,
        cases: [row], selectedCase: row, reassignCaseDialog: row, editCaseId: row.id,
        getDepartmentName: () => "عام", resolveCaseWorkflow: () => "general",
        setEditCaseId: () => {}, setSelectedCaseId: () => {}, setReassignCaseDialog: () => {},
        setShowEditDialog: () => {}, setShowAssignDialog: () => {}, toast: () => {},
        [setter]: (value: Record<string, unknown>) => { form = value; },
        updateCase: async (_id: string, value: Record<string, unknown>) => { payload = value; },
        assignCase: async (_id: string, _lawyer: string, _department: string, _reviewer: string, _litigator: string, workflow?: string) => { payload = workflow ? { caseWorkflow: workflow } : {}; },
      };
      const declaration = (name: string) => select(file, n => ts.isVariableDeclaration(n) && n.name.getText(file) === name) as ts.VariableDeclaration;
      (evaluate(declaration(open).initializer!, file, globals) as (row: unknown) => void)(row);
      assert.equal(form.caseWorkflow, "general", `${open}: default comes from current department`);
      form.caseWorkflow = selection;
      globals[formName] = form;
      await (evaluate(declaration(submit).initializer!, file, globals) as () => Promise<void>)();
      assert.ok(payload, `${submit}: sends update`);
      assert.equal(Object.hasOwn(payload, "caseWorkflow"), !!selection, submit);
      if (selection) assert.equal(payload.caseWorkflow, selection);
    }
  }
});
const committeeRoute = select(routes, n => ts.isCallExpression(n) && n.expression.getText(routes) === "app.post" && n.arguments[0]?.getText(routes) === '"/api/cases/:id/committee-decision"') as ts.CallExpression;
type Response = { status: (status: number) => Response; json: (body: unknown) => void };
async function decide(departmentId: string | null, decision: string, role: string, workflow = "labor", notes = "ملاحظات اللجنة") {
  let status = 200;
  let saved: Record<string, unknown> | undefined;
  const row = { id: "case", departmentId, caseWorkflow: workflow, currentStage: "إحالة_للجنة_المراجعة", caseClassification: CaseClassification.UNDER_STUDY };
  const handler = evaluate(committeeRoute.arguments[committeeRoute.arguments.length - 1], routes, {
    CommitteeDecision, CaseClassification, ReviewDecision, workflowDecisionSchema, console,
    caseProcedureName: async () => caseWorkflowName(row),
    actorDisplayName: () => "Chair",
    appendStageHistory: (_row: unknown, target: string, _actor: unknown, notes: string) => [{ stage: target, notes }],
    storage: { getCaseById: async () => row, getUser: async () => ({ name: "Chair" }), recordCaseCommitteeDecision: async (_id: string, update: Record<string, unknown>) => { saved = update; return { ...row, ...update }; } },
  }) as (req: unknown, res: Response) => Promise<void>;
  const res: Response = { status: value => { status = value; return res; }, json: () => {} };
  await handler({ params: { id: "case" }, user: { id: "chair", role, departmentId: "unrelated" }, body: { decision, notes } }, res);
  return { status, saved };
}
test("dedicated committee approval and return work with null or organizational department", async () => {
  for (const department of [null, "department"]) for (const workflow of ["general", "labor"]) {
    const chair = workflow === "labor" ? "labor_review_head" : "cases_review_head";
    for (const decision of [CommitteeDecision.APPROVED, CommitteeDecision.NEEDS_NOTES]) {
      const result = await decide(department, decision, chair, workflow);
      assert.equal(result.status, 200);
      assert.equal(result.saved?.targetStage, decision === CommitteeDecision.APPROVED ? "جاهزة_للرفع" : "الأخذ_بالملاحظات");
      assert.equal(result.saved?.reviewDecision, decision === CommitteeDecision.APPROVED ? ReviewDecision.APPROVED : ReviewDecision.REJECTED);
      assert.equal(result.saved?.reviewNotes, "ملاحظات اللجنة");
    }
  }
});
test("committee authorization stays narrow and a return needs notes", async () => {
  for (const role of ["employee", "admin_support", "department_head", "cases_review_head"]) {
    const result = await decide(null, CommitteeDecision.NEEDS_NOTES, role);
    assert.equal(result.status, 403);
    assert.equal(result.saved, undefined);
  }
  assert.equal((await decide(null, CommitteeDecision.NEEDS_NOTES, "labor_review_head", "labor", "")).status, 400);
});
test("frontend return invokes dedicated decision and never generic PATCH", async () => {
  const file = source("../client/src/lib/cases-context.tsx");
  const declaration = select(file, n => ts.isVariableDeclaration(n) && n.name.getText(file) === "rejectCase") as ts.VariableDeclaration;
  const calls: unknown[][] = [];
  const reject = evaluate(declaration.initializer!, file, {
    CommitteeDecision, apiRequest: async (...args: unknown[]) => { calls.push(args); return { json: async () => ({ id: "case" }) }; },
    setCases: () => {}, scheduleBackgroundRefetch: () => {}, migrateCase: (row: unknown) => row,
    caseNotificationRecipientId: () => "lawyer", notifyCaseReturnedForRevision: async () => {},
  }) as (id: string, notes: string) => Promise<unknown>;
  await reject("case", "notes");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "POST");
  assert.equal(calls[0][1], "/api/cases/case/committee-decision");
  assert.equal((calls[0][2] as { decision: string }).decision, CommitteeDecision.NEEDS_NOTES);
});

const storage = source("./storage.ts");
type Row = Record<string, string | null>;
type Predicate = (row: Row) => boolean;
function taskPredicate(kind: "hearing" | "memo" | "review", departmentHead = true): Predicate {
  const declaration = select(storage, n => ts.isVariableDeclaration(n) && (
    kind === "review" ? n.name.getText(storage) === "memoReviewWhere" : n.name.getText(storage) === "scopeWhere" && !!n.initializer?.getText(storage).includes(kind === "hearing" ? "hActionable" : "mActionable")
  )) as ts.VariableDeclaration;
  const eq = (key: string, value: string) => (row: Row) => row[key] === value;
  const and = (...predicates: Predicate[]) => (row: Row) => predicates.every(p => p(row));
  const or = (...predicates: Predicate[]) => (row: Row) => predicates.some(p => p(row));
  return evaluate(declaration.initializer!, storage, {
    firmWideScoped: false, deptHeadScoped: departmentHead, uid: "me", userDept: "own",
    hearings: { attendingLawyerId: "attendee" }, memos: { assignedTo: "assignee", internalReviewerId: "reviewer", currentStage: "stage", status: "status" }, lawCases: { departmentId: "department" },
    eq, and, or, ne: (key: string, value: string) => (row: Row) => row[key] !== value,
    hActionable: () => true, mActionable: () => true, memoNotPaused: () => true,
    caseDepartmentOrAssigned: or(eq("department", "own"), eq("caseOwner", "me")),
    hasReviewer: (key: string) => (row: Row) => !!row[key], notOwnWork: (key: string) => (row: Row) => row[key] !== "me",
    sql: (_strings: TemplateStringsArray, key: string) => (row: Row) => !!row[key],
  }) as Predicate;
}
test("direct hearing/memo/reviewer tasks survive null and cross-department parents", () => {
  for (const departmentHead of [true, false]) for (const department of [null, "other"]) {
    const row = { department, attendee: "other", assignee: "other", reviewer: "other", stage: "مراجعة_داخلية", status: "نشط" };
    for (const [kind, key] of [["hearing", "attendee"], ["memo", "assignee"], ["review", "reviewer"]] as const) {
      const predicate = taskPredicate(kind, departmentHead);
      assert.equal(predicate({ ...row, [key]: "me" }), true, `${kind}: direct assignment`);
      assert.equal(predicate(row), false, `${kind}: unrelated assignment`);
      assert.equal(predicate({ ...row, department: "own" }), departmentHead, `${kind}: organizational scope`);
    }
  }
  assert.equal(taskPredicate("review")({ department: "other", assignee: "me", reviewer: "me", stage: "مراجعة_داخلية", status: "نشط" }), false, "four-eyes separation");
});

test("lawyer performance population retains active employee/head semantics independently of eligibility", () => {
  const route = select(routes, n => ts.isCallExpression(n) && n.expression.getText(routes) === "app.get" && n.arguments[0]?.getText(routes) === '"/api/stats/lawyer-performance"');
  const declaration = select(route, n => ts.isVariableDeclaration(n) && n.name.getText(routes) === "lawyers") as ts.VariableDeclaration;
  const roster = [
    { id: "employee", role: "employee", isActive: true, canBeAssignedCases: false, departmentId: null },
    { id: "head", role: "department_head", isActive: true, canBeAssignedCases: true, departmentId: "own" },
    { id: "inactive", role: "employee", isActive: false, canBeAssignedCases: true, departmentId: "own" },
    ...["branch_manager", "admin_support", "cases_review_head", "labor_review_head"].map(role => ({ id: role, role, isActive: true, canBeAssignedCases: true, departmentId: null })),
  ];
  for (const departmentFilter of [undefined, "own"]) {
    const result = evaluate(declaration.initializer!, routes, { allUsers: roster, departmentFilter }) as typeof roster;
    assert.deepEqual(Array.from(result, u => u.id), departmentFilter ? ["head"] : ["employee", "head"]);
  }
});
