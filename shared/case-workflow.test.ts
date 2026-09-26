import assert from "node:assert/strict";
import { test } from "node:test";
import {
  caseWorkflowSelectionPatch, suggestedCaseWorkflow, resolveCaseWorkflow, caseWorkflowName, getCaseStages,
  caseOwnershipError, eligibleCaseAssignee, planCaseOwnershipUpdate, caseDepartmentLabel,
  insertCaseSchema, UnderStudyGeneralStages, UnderStudyLaborStages,
  AdminGrievanceStages, AdminLawsuitStages, InCourtSettlementStages,
  deriveHearingType, stageNumberRequirement, hearingTypeWorkflowError,
  type LawCase,
} from "./schema";

const fixture = (patch: Partial<LawCase> = {}): LawCase => ({
  departmentId: "administrative-dept", caseWorkflow: "general", primaryLawyerId: "lawyer",
  caseClassification: "قيد_الدراسة", currentStage: "دراسة", clientRole: "مدعي",
  memoRequired: false, isSettlementCase: false, adminCaseSubType: null, ...patch,
} as LawCase);

test("department defaults General workflow, but intentional override survives department changes", () => {
  assert.equal(suggestedCaseWorkflow("", false, "عام"), "general");
  assert.equal(suggestedCaseWorkflow("", false, "إداري"), "administrative");
  assert.equal(suggestedCaseWorkflow("general", true, "إداري"), "general");
  assert.equal(suggestedCaseWorkflow("general", false, null), "");
});
test("no department requires a responsible person and explicit workflow", () => {
  assert.match(caseOwnershipError({ departmentId: null, caseWorkflow: "labor" })!, /المسؤول/);
  assert.match(caseOwnershipError({ departmentId: null, primaryLawyerId: "u" })!, /مسار/);
  assert.equal(caseOwnershipError({ departmentId: null, primaryLawyerId: "u", caseWorkflow: "labor" }), null);
  assert.equal(insertCaseSchema.safeParse({ caseType: "وصف", departmentId: null, caseWorkflow: "labor" }).success, false);
  assert.equal(insertCaseSchema.safeParse({ caseType: "وصف", departmentId: null, caseWorkflow: "labor", primaryLawyerId: "u" }).success, true);
});
test("department-owned cases allow no responsible person; choosing department is required", () => {
  assert.equal(caseOwnershipError({ departmentId: "1", caseWorkflow: "general" }), null);
  assert.ok(caseOwnershipError({ caseWorkflow: "general" }));
  assert.ok(caseOwnershipError({ departmentId: "", caseWorkflow: "general" }));
});
test("eligible users from another department or no department may be assigned", () => {
  for (const departmentId of ["other-dept", null]) {
    const user = { departmentId, isActive: true, canBeAssignedCases: true };
    assert.equal(eligibleCaseAssignee(user), true);
    assert.equal(eligibleCaseAssignee({ ...user, isActive: false }), false);
    assert.equal(eligibleCaseAssignee({ ...user, canBeAssignedCases: false }), false);
  }
});
test("assignee-only change preserves department, workflow and stage", () => {
  const c = fixture();
  const next = { ...c, ...planCaseOwnershipUpdate(c, { primaryLawyerId: "other" }) };
  assert.equal(next.primaryLawyerId, "other");
  assert.equal(next.departmentId, c.departmentId);
  assert.equal(next.caseWorkflow, c.caseWorkflow);
  assert.equal(next.currentStage, c.currentStage);
});
test("legacy ownership edits materialize current department default without changing procedure", () => {
  for (const [name, workflow] of [["عام", "general"], ["تجاري", "commercial"], ["عمالي", "labor"], ["إداري", "administrative"]] as const) {
    const legacy = fixture({ caseWorkflow: null, currentStage: "محكوم_حكم_نهائي" });
    for (const patch of [{ departmentId: "new" }, { primaryLawyerId: "new" }, { departmentId: legacy.departmentId }]) {
      const next = { ...legacy, ...planCaseOwnershipUpdate(legacy, patch, name) };
      assert.equal(next.caseWorkflow, workflow);
      assert.equal(next.currentStage, legacy.currentStage);
      assert.equal(next.caseClassification, legacy.caseClassification);
    }
  }
});
test("unmapped legacy departments require a selected workflow; overrides remain supported", () => {
  const legacy = fixture({ caseWorkflow: null });
  for (const name of [null, "أخرى", "unknown"]) {
    assert.throws(() => planCaseOwnershipUpdate(legacy, { departmentId: "new" }, name), /اختر مسار/);
    assert.deepEqual(planCaseOwnershipUpdate(legacy, caseWorkflowSelectionPatch("labor"), name), { caseWorkflow: "labor" });
  }
  assert.deepEqual(planCaseOwnershipUpdate(legacy, caseWorkflowSelectionPatch("labor"), "عام"), { caseWorkflow: "labor" });
  assert.deepEqual(planCaseOwnershipUpdate(fixture(), { departmentId: "new" }, "إداري"), { departmentId: "new" });
});
test("General path ignores Administrative organizational ownership", () => {
  assert.deepEqual(getCaseStages(fixture(), "إداري"), UnderStudyGeneralStages);
});
test("Labor procedure ignores organizational department", () => {
  const c = fixture({ caseWorkflow: "labor" });
  assert.deepEqual(getCaseStages(c, "إداري"), UnderStudyLaborStages);
  assert.equal(deriveHearingType("مداولة_الصلح", caseWorkflowName(c, "إداري")), "تسوية_ودية");
  assert.equal(stageNumberRequirement("مداولة_الصلح", caseWorkflowName(c))?.field, "mohrNumber");
});
test("Administrative workflow preserves both subpaths and settlement incompatibility", () => {
  const c = fixture({ caseWorkflow: "administrative", adminCaseSubType: "تظلم" });
  assert.deepEqual(getCaseStages(c, "عام"), AdminGrievanceStages);
  assert.deepEqual(getCaseStages({ ...c, adminCaseSubType: "قضية" }, "عام"), AdminLawsuitStages);
  assert.ok(hearingTypeWorkflowError(c, "تراضي", "عام"));
});
test("centralized legacy fallback accepts known departments only, never an invalid explicit workflow", () => {
  assert.equal(resolveCaseWorkflow({ caseWorkflow: null }, "عمالي"), "labor");
  assert.equal(resolveCaseWorkflow({ caseWorkflow: null }, "أخرى"), null);
  assert.equal(resolveCaseWorkflow({ caseWorkflow: null }, null), null);
  assert.equal(resolveCaseWorkflow({ caseWorkflow: "invalid" }, "عام"), null);
  assert.deepEqual(getCaseStages(fixture({ caseWorkflow: null }), "أخرى"), []);
});
test("new cases cannot validate a null or omitted workflow", () => {
  const base = { caseType: "وصف", departmentId: "1" };
  assert.equal(insertCaseSchema.safeParse(base).success, false);
  assert.equal(insertCaseSchema.safeParse({ ...base, caseWorkflow: null }).success, false);
  assert.equal(insertCaseSchema.safeParse({ ...base, caseWorkflow: "general" }).success, true);
});
test("null department is presentation-only اللجان, never an inferred workflow", () => {
  assert.equal(caseDepartmentLabel(null), "اللجان");
  assert.equal(resolveCaseWorkflow({ caseWorkflow: null }, "اللجان"), null);
});
test("settlement-only flag remains independent of workflow", () => {
  assert.deepEqual(getCaseStages(fixture({ caseClassification: "منظورة_بالمحكمة", isSettlementCase: true })), InCourtSettlementStages);
});
test("explicit procedural changes cannot silently reroute an active case", () => {
  assert.throws(() => planCaseOwnershipUpdate(fixture(), { caseWorkflow: "administrative" }));
  assert.deepEqual(planCaseOwnershipUpdate(fixture(), { caseWorkflow: "labor" }), { caseWorkflow: "labor" });
  assert.deepEqual(planCaseOwnershipUpdate(fixture({ caseClassification: "منظورة_بالمحكمة", currentStage: "منظورة" }), { caseWorkflow: "labor" }), { caseWorkflow: "labor" });
  assert.deepEqual(planCaseOwnershipUpdate(fixture({ currentStage: "استلام" }), { caseWorkflow: "labor" }), { caseWorkflow: "labor" });
});
