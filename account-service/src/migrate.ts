import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { applyMigrations } from "./storage/migrations.js";

export async function main(): Promise<void> {
  const connectionString = process.env.ACCOUNT_MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("ACCOUNT_MIGRATION_DATABASE_URL is required");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await applyMigrations(pool);
  } finally {
    await pool.end();
  }
  process.stdout.write("Account PostgreSQL migration completed.\n");
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  void main().catch(() => {
    process.stderr.write("Account PostgreSQL migration failed.\n");
    process.exitCode = 1;
  });
}
