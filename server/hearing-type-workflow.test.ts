import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  caseWorkflowName, deriveHearingType, hearingTypeSchema, hearingHasRecordedResult,
  hearingProducesNoMinutes, getHearingResultOptions, hearingTypeWorkflowError,
  HearingType, HearingResult, type LawCase,
} from "../shared/schema";
import { hearingCaseStagePatch, HearingTypeError } from "./hearing-type-workflow";

const fixture = (overrides: Partial<LawCase> = {}): LawCase => ({
  id: "case-1", departmentId: "dept-1", currentStage: "مداولة_الصلح",
  caseClassification: "قيد_الدراسة", clientRole: "مدعي", isSettlementCase: false,
  memoRequired: false, isArchived: false, stageHistory: [], ...overrides,
} as LawCase);

test("A/B/C: defaults use canonical stage and resolved department", () => {
  assert.equal(deriveHearingType("مداولة_الصلح", "عام"), HearingType.TARADI);
  assert.equal(deriveHearingType("مداولة_الصلح", "عمالي"), HearingType.SETTLEMENT);
  for (const stage of ["أغلق_طلب_الصلح", "منظورة", "منظورة_استئناف", "قيد_التدقيق_في_معين"]) {
    assert.equal(deriveHearingType(stage, "عمالي"), HearingType.COURT);
  }
});

test("D/E: overrides drive stage and history without duplicate entries", () => {
  const c = fixture({ currentStage: "أغلق_طلب_الصلح" });
  const patch = hearingCaseStagePatch(c, HearingType.TARADI, "عام", { id: "actor" });
  assert.equal(patch.currentStage, "مداولة_الصلح");
  assert.equal(patch.stageHistory?.length, 1);
  assert.equal(patch.stageHistory?.[0].userId, "actor");
  assert.equal(patch.caseClassification, undefined);
  assert.equal(hearingCaseStagePatch({ ...c, ...patch }, HearingType.TARADI, "عام").stageHistory, undefined);
  assert.equal(hearingCaseStagePatch(fixture(), HearingType.COURT, "عام").currentStage, "منظورة");
  assert.equal(c.currentStage, "أغلق_طلب_الصلح");
});

test("court synchronization preserves appeal and final-judgment conventions", () => {
  assert.equal(hearingCaseStagePatch(fixture({ currentStage: "محكوم_حكم_ابتدائي" }), HearingType.COURT, "عام").currentStage, "منظورة_استئناف");
  assert.equal(hearingCaseStagePatch(fixture({ currentStage: "محكوم_حكم_نهائي" }), HearingType.COURT, "عام").currentStage, undefined);
});

test("incompatible overrides fail without changing the workflow", () => {
  const c = fixture({ currentStage: "دراسة", adminCaseSubType: "قضية" });
  for (const type of [HearingType.TARADI, HearingType.SETTLEMENT]) {
    assert.ok(hearingTypeWorkflowError(c, type, "إداري"));
    assert.throws(() => hearingCaseStagePatch(c, type, "إداري"), HearingTypeError);
  }
  assert.equal(c.caseClassification, "قيد_الدراسة");
  assert.equal(c.isSettlementCase, false);
});

test("closed/archived cases cannot be moved by type changes", () => {
  assert.throws(() => hearingCaseStagePatch(fixture({ isArchived: true }), HearingType.TARADI, "عام"));
  assert.throws(() => hearingCaseStagePatch(fixture({ currentStage: "مقفلة" }), HearingType.COURT, "عام"));
});

test("only the three compatible stored values pass input validation", () => {
  for (const type of Object.values(HearingType)) assert.equal(hearingTypeSchema.parse(type), type);
  for (const type of ["صلح", "تسوية ودية", "", "invalid"]) assert.equal(hearingTypeSchema.safeParse(type).success, false);
});

test("results follow stored type with settlement workflow guards", () => {
  const context = { currentStage: "مداولة_الصلح", hasSettlementTrack: true };
  for (const type of [HearingType.TARADI, HearingType.SETTLEMENT]) {
    assert.deepEqual(getHearingResultOptions(type, context), [HearingResult.NEW_SESSION,
      HearingResult.SETTLEMENT_REACHED, HearingResult.SETTLEMENT_FAILED, HearingResult.SETTLEMENT_LINK_MISSING]);
    assert.deepEqual(getHearingResultOptions(type, { ...context, currentStage: "منظورة" }), []);
    assert.deepEqual(getHearingResultOptions(type, { ...context, hasSettlementTrack: false }), []);
  }
  assert.deepEqual(getHearingResultOptions(HearingType.COURT, context), [HearingResult.NEW_SESSION,
    HearingResult.JUDGMENT, HearingResult.DISMISSAL, HearingResult.JURISDICTION_DECLINED]);
});

test("I/J: minutes remain required only for court hearings", () => {
  assert.equal(hearingProducesNoMinutes({ hearingType: HearingType.COURT }), false);
  assert.equal(hearingProducesNoMinutes({ hearingType: HearingType.TARADI }), true);
  assert.equal(hearingProducesNoMinutes({ hearingType: HearingType.SETTLEMENT }), true);
});

// Execute the actual two storage methods against an in-memory transaction double.
// Extracting only these methods avoids importing db.ts/auth.ts or reading secrets.
function storageHarness(result: string | null = null, failInsert = false) {
  const source = ts.createSourceFile("storage.ts", readFileSync(new URL("./storage.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const storageClass = source.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === "DatabaseStorage") as ts.ClassDeclaration;
  const methods = storageClass.members.filter(n => ts.isMethodDeclaration(n) && ["createHearing", "updateHearing"].includes(n.name.getText(source)));
  const tables = {
    lawCases: { id: "id" }, departments: { id: "id" }, hearings: { id: "id" },
  };
  let state = {
    caseRow: fixture(), department: { id: "dept-1", name: "عام" },
    rows: [{ id: "old", caseId: "case-1", hearingType: HearingType.TARADI as string, result }],
  };
  const db = {
    select: () => ({ from: (table: object) => ({ where: (id: string) => {
      const rows = () => table === tables.lawCases ? [state.caseRow] : table === tables.departments ? [state.department] : state.rows.filter(r => r.id === id);
      return { for: async () => rows(), then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(resolve(rows())) };
    } }) }),
    update: (table: object) => ({ set: (patch: object) => ({ where: async (id: string) => {
      if (table === tables.lawCases) Object.assign(state.caseRow, patch);
      else Object.assign(state.rows.find(r => r.id === id)!, patch);
    } }) }),
    insert: () => ({ values: async (row: typeof state.rows[number]) => {
      if (failInsert) throw new Error("simulated insert failure");
      state.rows.push(row);
    } }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(state);
      try { return await fn(db); } catch (error) { state = snapshot; throw error; }
    },
  };
  const js = ts.transpileModule(`class Storage { ${methods.map(m => m.getText(source)).join("\n")} }; new Storage();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const storage = runInNewContext(js, {
    db, ...tables, eq: (_column: unknown, id: string) => id,
    randomUUID: () => "new", caseWorkflowName, deriveHearingType, hearingTypeSchema, hearingHasRecordedResult,
    hearingCaseStagePatch, HearingTypeError, mapDbCase: (r: unknown) => r, mapDbHearing: (r: unknown) => r,
  });
  storage.getHearingById = async (id: string) => state.rows.find(r => r.id === id);
  return { storage, state: () => state };
}

test("storage derives omitted type and keeps the old hearing unchanged", async () => {
  const h = storageHarness();
  const created = await h.storage.createHearing({ caseId: "case-1" });
  assert.equal(created.hearingType, HearingType.TARADI);
  assert.equal(h.state().rows[0].hearingType, HearingType.TARADI);
});

test("F: explicit pre-result edit synchronizes type and stage", async () => {
  const h = storageHarness();
  await h.storage.updateHearing("old", { hearingType: HearingType.COURT }, { id: "editor" });
  assert.equal(h.state().rows[0].hearingType, HearingType.COURT);
  assert.equal(h.state().caseRow.currentStage, "منظورة");
  assert.equal(h.state().caseRow.stageHistory[0].userId, "editor");
});

test("G: stored result blocks a type change even if PATCH clears result", async () => {
  const h = storageHarness(HearingResult.NEW_SESSION);
  await assert.rejects(h.storage.updateHearing("old", { hearingType: HearingType.COURT, result: null }), /بعد تسجيل النتيجة/);
  assert.equal(h.state().rows[0].hearingType, HearingType.TARADI);
  assert.equal(h.state().rows[0].result, HearingResult.NEW_SESSION);
});

test("same-type edits after a result do not recalculate historical type or stage", async () => {
  const h = storageHarness(HearingResult.NEW_SESSION);
  h.state().caseRow.currentStage = "منظورة";
  await h.storage.updateHearing("old", { hearingType: HearingType.TARADI, notes: "edited" });
  assert.equal(h.state().caseRow.currentStage, "منظورة");
  assert.equal(h.state().rows[0].hearingType, HearingType.TARADI);
});

test("failed hearing insert rolls back the case-stage write", async () => {
  const h = storageHarness(null, true);
  await assert.rejects(h.storage.createHearing({ caseId: "case-1", hearingType: HearingType.COURT }));
  assert.equal(h.state().caseRow.currentStage, "مداولة_الصلح");
  assert.equal(h.state().caseRow.stageHistory.length, 0);
});

test("H: both settlement types survive next-hearing creation", async () => {
  for (const hearingType of [HearingType.TARADI, HearingType.SETTLEMENT]) {
    const h = storageHarness();
    const next = await h.storage.createHearing({ caseId: "case-1", hearingType });
    assert.equal(next.hearingType, hearingType);
  }
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /hearingTime: data.nextHearingTime \|\| hearing.hearingTime,\s+hearingType: hearing.hearingType,/);
});
