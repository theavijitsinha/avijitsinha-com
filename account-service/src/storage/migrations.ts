import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";

export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

interface AppliedMigration {
  readonly id: number;
  readonly name: string;
  readonly checksum: string;
}

const migrationFiles = [
  { id: 1, name: "account_sessions", file: "001_account_sessions.sql" },
] as const;

export function loadMigrations(): readonly Migration[] {
  const sourceDirectory = new URL("../../migrations/", import.meta.url);
  const directory = existsSync(new URL(migrationFiles[0]!.file, sourceDirectory))
    ? sourceDirectory
    : new URL("../../../migrations/", import.meta.url);
  return migrationFiles.map(migration => ({
    id: migration.id,
    name: migration.name,
    sql: readFileSync(new URL(migration.file, directory), "utf8").replace(/\r\n?/g, "\n"),
  }));
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export async function applyMigrations(pool: Pool, migrations: readonly Migration[] = loadMigrations()): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('avijitsinha-account-migrations'), hashtext(current_database()))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS account_schema_migrations (
        id INTEGER PRIMARY KEY CHECK (id > 0),
        name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
        checksum TEXT NOT NULL CHECK (length(checksum) = 64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const applied = await client.query<AppliedMigration>(
      "SELECT id, name, checksum FROM account_schema_migrations ORDER BY id",
    );
    if (applied.rows.length > migrations.length) throw new Error("Account schema is newer than this service");
    for (const [index, row] of applied.rows.entries()) {
      const expected = migrations[index];
      if (!expected || row.id !== expected.id || row.name !== expected.name || row.checksum !== checksum(expected.sql)) {
        throw new Error(`Account migration history diverges at migration ${row.id}`);
      }
    }
    for (const migration of migrations.slice(applied.rows.length)) {
      await applyMigration(client, migration);
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('avijitsinha-account-migrations'), hashtext(current_database()))");
    } finally {
      client.release();
    }
  }
}

async function applyMigration(client: PoolClient, migration: Migration): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO account_schema_migrations (id, name, checksum) VALUES ($1, $2, $3)",
      [migration.id, migration.name, checksum(migration.sql)],
    );
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the migration error. */ }
    throw new Error(`Failed to apply account migration ${migration.id} (${migration.name})`, { cause: error });
  }
}
