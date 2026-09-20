/**
 * Applies a SQL file to the database over the DIRECT (non-pooled) connection.
 *
 * DDL is unreliable through Supabase's transaction pooler, and this repo must
 * never run `prisma migrate` (it would try to drop the website's tables, which
 * are not in our schema). Usage:
 *
 *   node scripts/apply-sql.mjs prisma/sql/001_checkin_schema.sql
 */
import { readFileSync } from "node:fs";
import "dotenv/config";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DIRECT_URL / DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(readFileSync(file, "utf8"));
  console.log(`applied ${file}`);
} finally {
  await client.end();
}
