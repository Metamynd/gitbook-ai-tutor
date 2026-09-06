import { Pool } from "pg";

// Single pooled connection, reused across requests/hot-reloads. A plain
// `pg` Pool over an ORM per spec §59 — simple, observable, replaceable.
declare global {
  // eslint-disable-next-line no-var
  var __tutorDbPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!global.__tutorDbPool) {
    global.__tutorDbPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  return global.__tutorDbPool;
}
