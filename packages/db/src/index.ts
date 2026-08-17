import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// A conservative default pool size — important on serverless platforms
// (e.g. Vercel functions), where each warm instance keeps its own pool and
// a large default (node-postgres defaults to 10) can exhaust the
// database's connection limit under concurrent invocations. Override via
// DATABASE_POOL_MAX for traditional long-running deployments if needed.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
