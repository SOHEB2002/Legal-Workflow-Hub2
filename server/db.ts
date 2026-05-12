import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // Postgres-level timeouts: kill runaway queries and idle transactions so they don't pin a pool slot.
  statement_timeout: 30000,
  idle_in_transaction_session_timeout: 60000,
});

export const db = drizzle(pool, { schema });
