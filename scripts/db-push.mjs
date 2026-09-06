// Applies db/schema/schema.sql to DATABASE_URL. The schema uses
// `create table/index if not exists`, so this is safe to re-run — no
// migration framework needed for v1 (spec §59: favor simple over clever).
//
// Usage: npm run db:push

import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const root = path.resolve(import.meta.dirname, "..");
const sql = await readFile(path.join(root, "db/schema/schema.sql"), "utf8");

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  console.log("Schema applied.");
} finally {
  await client.end();
}
