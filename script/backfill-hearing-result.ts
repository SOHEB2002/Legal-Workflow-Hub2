// One-shot backfill: existing hearing rows with result="تأجيل" predate the
// unification of POSTPONEMENT into NEW_SESSION. Their stored value no
// longer appears in the dropdown or the schema enum, so they look stale
// in the UI. Migrate them to "موعد_جديد" — the unified value.
//
// Run on dev first, verify, then run on prod (per replit.md: "Dev and
// Production databases are SEPARATE — apply SQL changes to both").
//
// Usage (from Replit shell, with DATABASE_URL already set as a secret):
//   npx tsx script/backfill-hearing-result.ts
//
// Idempotent: subsequent runs find no matching rows and report 0.

import { pool } from "../server/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — refusing to run.");
    process.exit(1);
  }

  const sql = `
    UPDATE hearings
       SET result = 'موعد_جديد'
     WHERE result = 'تأجيل'
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
