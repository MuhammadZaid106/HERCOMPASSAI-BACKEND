// Applies every migration in migrations/*.sql to DATABASE_URL, in filename
// order. Migrations are additive/idempotent (IF NOT EXISTS), so this is safe
// to run repeatedly and never deletes user rows.
//
// Usage:
//   node scripts/apply-migration.mjs
//   npm run db:migrate
//
// Reads DATABASE_URL from .env. Uses `pg` directly, so psql is not required.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is empty. Set it in .env before migrating.");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No migrations found in ${migrationsDir}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    await client.query(sql);
    console.log(`Applied migration: ${file}`);
  }
  console.log(`All ${files.length} migrations applied.`);
} catch (err) {
  console.error("Migration failed:", err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client.end();
}