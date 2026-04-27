// One-shot backfill: legacy منظورة_بالمحكمة rows that were promoted from
// قيد_الدراسة before the promotion path persisted clientRole have a null
// (or empty) clientRole. Default them to "مدعي" — the firm is plaintiff in
// the vast majority of cases, and we can't recover the true side after the
// fact.
//
// Run on dev first, verify, then run on prod (per replit.md: "Dev and
// Production databases are SEPARATE — apply SQL changes to both").
//
// Usage (from Replit shell, with DATABASE_URL already set as a secret):
//   npx tsx script/backfill-client-role.ts
//
// Idempotent: subsequent runs find no matching rows and report 0.

import { pool } from "../server/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — refusing to run.");
    process.exit(1);
  }

  const sql = `
    UPDATE law_cases
       SET client_role = 'مدعي'
     WHERE case_classification = 'منظورة_بالمحكمة'
       AND (client_role IS NULL OR client_role = '')
  `;

  console.log("[backfill] running UPDATE …");
  const result = await pool.query(sql);
  console.log(`[backfill] affected rows: ${result.rowCount}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
