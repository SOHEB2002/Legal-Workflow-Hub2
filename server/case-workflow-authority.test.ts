import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual pure route gates without importing server startup/db.ts.
const source = ts.createSourceFile("routes.ts", readFileSync(new URL("./routes.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const names = ["isAssignedLawyer", "canModifyCaseIdentity", "canViewCaseIdentity", "canAnnotateCase", "caseActorIdentities"];
const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text || ""));
assert.equal(functions.length, names.length);
const compiled = ts.transpileModule(`${functions.map(n => n.getText(source)).join("\n")}\n({ canModifyCaseIdentity, canViewCaseIdentity, canAnnotateCase });`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
type Actor = { id: string; role: string; departmentId: string | null };
type Case = { departmentId: string | null; primaryLawyerId: string; assignedLawyers: string[] };
const gates = runInNewContext(compiled) as {
  canModifyCaseIdentity: (actor: Actor, row: Case) => boolean;
  canViewCaseIdentity: (actor: Actor, row: Case) => boolean;
  canAnnotateCase: (actor: Actor, row: Case) => boolean;
};
const row: Case = { departmentId: null, primaryLawyerId: "assignee", assignedLawyers: ["assignee"] };

test("all company roles can view a case without gaining null-department mutation rights", () => {
  for (const role of ["branch_manager", "admin_support", "employee", "department_head", "cases_review_head", "consultations_review_head", "labor_review_head", "hr", "technical_support", "viewer"]) {
    const actor = { id: "other", role, departmentId: null };
    assert.equal(gates.canViewCaseIdentity(actor, row), true);
    assert.equal(gates.canAnnotateCase(actor, row), ["branch_manager", "admin_support"].includes(role), role);
    assert.equal(gates.canModifyCaseIdentity(actor, row), ["branch_manager", "admin_support"].includes(role), role);
  }
});
test("eligible assigned identities can act independently of department and role", () => {
  for (const role of ["employee", "department_head", "cases_review_head", "labor_review_head"]) {
    const actor = { id: "assignee", role, departmentId: "other-department" };
    assert.equal(gates.canModifyCaseIdentity(actor, row), true);
    assert.equal(gates.canModifyCaseIdentity(actor, { ...row, departmentId: "case-department" }), true);
  }
});
