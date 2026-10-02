import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAccountSessionStore } from "../src/auth/session-store.js";
import { runAccountMigration, type AccountMigrationConfiguration } from "../src/migrate.js";
import type { Migration } from "../src/storage/migrations.js";

const rootUrl = process.env.TEST_ACCOUNT_POSTGRES_URL;
const postgresDescribe = rootUrl ? describe : describe.skip;
const testPassword = "account-migration-test-password";

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error("Unsafe test identifier");
  return `"${value}"`;
}

interface MigrationFixture {
  readonly databaseName: string;
  readonly runtimeLogin: string;
  readonly migrationLogin: string;
  readonly databaseUrl: string;
  readonly runtimeUrl: string;
  readonly extraRoles: string[];
}

postgresDescribe("PostgreSQL account migration job", () => {
  let rootPool: Pool;

  beforeAll(() => {
    rootPool = new Pool({ connectionString: rootUrl, max: 1 });
  });

  afterAll(async () => {
    await rootPool?.end();
  });

  async function createFixture(): Promise<MigrationFixture> {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const databaseName = `account_migration_${suffix}`;
    const runtimeLogin = `account_runtime_${suffix}`;
    const migrationLogin = `account_migrator_${suffix}`;
    await rootPool.query(`CREATE DATABASE ${identifier(databaseName)}`);
    await rootPool.query(`CREATE ROLE ${identifier(runtimeLogin)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${testPassword}'`);
    await rootPool.query(`CREATE ROLE ${identifier(migrationLogin)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${testPassword}'`);
    await rootPool.query(`ALTER DATABASE ${identifier(databaseName)} OWNER TO ${identifier(migrationLogin)}`);

    const databaseUrl = new URL(rootUrl!);
    databaseUrl.pathname = `/${databaseName}`;
    databaseUrl.username = migrationLogin;
    databaseUrl.password = testPassword;
    const runtimeUrl = new URL(databaseUrl);
    runtimeUrl.username = runtimeLogin;
    return {
      databaseName,
      runtimeLogin,
      migrationLogin,
      databaseUrl: databaseUrl.toString(),
      runtimeUrl: runtimeUrl.toString(),
      extraRoles: [],
    };
  }

  function configuration(fixture: MigrationFixture): AccountMigrationConfiguration {
    return { databaseUrl: fixture.databaseUrl, runtimeLogin: fixture.runtimeLogin };
  }

  async function cleanup(fixture: MigrationFixture): Promise<void> {
    await rootPool.query(`DROP DATABASE IF EXISTS ${identifier(fixture.databaseName)}`);
    for (const role of [fixture.runtimeLogin, ...fixture.extraRoles, fixture.migrationLogin]) {
      await rootPool.query(`DROP ROLE IF EXISTS ${identifier(role)}`);
    }
  }

  it("migrates repeatably and grants only the seven account API functions", async () => {
    const fixture = await createFixture();
    try {
      await runAccountMigration(configuration(fixture));
      await runAccountMigration(configuration(fixture));

      const runtimePool = new Pool({ connectionString: fixture.runtimeUrl, max: 1 });
      const privileges = await runtimePool.query<{
        schema_usage: boolean;
        table_select: boolean;
        function_execute: boolean;
      }>(`
        SELECT
          has_schema_privilege(current_user, 'account_service', 'USAGE') AS schema_usage,
          has_table_privilege(current_user, 'account_service.site_users', 'SELECT') AS table_select,
          has_function_privilege(
            current_user,
            'account_service.google_subject_matches(UUID, TEXT)',
            'EXECUTE'
          ) AS function_execute
      `);
      await expect(runtimePool.query("SELECT id FROM account_service.site_users")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(runtimePool.query("SELECT id FROM public.account_schema_migrations")).rejects.toMatchObject({
        code: "42501",
      });
      const runtimeStore = new PostgresAccountSessionStore(runtimePool);
      const challenge = await runtimeStore.issueLoginChallenge("/account/", Date.parse("2026-10-02T12:00:00Z"));
      await expect(runtimeStore.consumeLoginChallenge(
        challenge,
        Date.parse("2026-10-02T12:00:01Z"),
      )).resolves.toBe("/account/");
      await runtimePool.end();
      expect(privileges.rows).toEqual([{
        schema_usage: true,
        table_select: false,
        function_execute: true,
      }]);

      const migrationPool = new Pool({ connectionString: fixture.databaseUrl, max: 1 });
      const history = await migrationPool.query<{ count: number }>(
        "SELECT count(*)::INTEGER AS count FROM account_schema_migrations",
      );
      const functionGrants = await migrationPool.query<{ routine_name: string }>(`
        SELECT routine_name
        FROM information_schema.routine_privileges
        WHERE specific_schema = 'account_service'
          AND grantee = $1
          AND privilege_type = 'EXECUTE'
        ORDER BY routine_name
      `, [fixture.runtimeLogin]);
      await migrationPool.end();
      expect(history.rows).toEqual([{ count: 2 }]);
      expect(functionGrants.rows.map(row => row.routine_name)).toEqual([
        "consume_login_challenge",
        "create_session",
        "google_subject_matches",
        "issue_login_challenge",
        "resolve_session",
        "revoke_session",
        "rotate_session",
      ]);
    } finally {
      await cleanup(fixture);
    }
  }, 30_000);

  it("rejects a migration login that is not the database owner before schema changes", async () => {
    const fixture = await createFixture();
    const wrongOwner = `account_wrong_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    fixture.extraRoles.push(wrongOwner);
    try {
      await rootPool.query(`CREATE ROLE ${identifier(wrongOwner)} LOGIN NOINHERIT PASSWORD '${testPassword}'`);
      const wrongUrl = new URL(fixture.databaseUrl);
      wrongUrl.username = wrongOwner;
      await expect(runAccountMigration({
        ...configuration(fixture),
        databaseUrl: wrongUrl.toString(),
      })).rejects.toThrow(/database-owner login/);

      const ownerPool = new Pool({ connectionString: fixture.databaseUrl, max: 1 });
      const history = await ownerPool.query<{ name: string | null }>(
        "SELECT to_regclass('public.account_schema_migrations')::TEXT AS name",
      );
      await ownerPool.end();
      expect(history.rows[0]?.name).toBeNull();
    } finally {
      await cleanup(fixture);
    }
  }, 30_000);

  it("rejects elevated or inherited migration privilege before schema changes", async () => {
    const fixture = await createFixture();
    const parentRole = `account_parent_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    fixture.extraRoles.push(parentRole);
    try {
      await rootPool.query(`ALTER ROLE ${identifier(fixture.migrationLogin)} CREATEROLE`);
      await expect(runAccountMigration(configuration(fixture))).rejects.toThrow(/not least privilege/);
      await rootPool.query(`ALTER ROLE ${identifier(fixture.migrationLogin)} NOCREATEROLE`);

      await rootPool.query(`CREATE ROLE ${identifier(parentRole)} NOLOGIN`);
      await rootPool.query(`GRANT ${identifier(parentRole)} TO ${identifier(fixture.migrationLogin)}`);
      await expect(runAccountMigration(configuration(fixture))).rejects.toThrow(/unexpected parent role/);
    } finally {
      await cleanup(fixture);
    }
  }, 30_000);

  it("rejects elevated or inherited runtime privilege before schema changes", async () => {
    const fixture = await createFixture();
    const parentRole = `runtime_parent_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    fixture.extraRoles.push(parentRole);
    try {
      await rootPool.query(`ALTER ROLE ${identifier(fixture.runtimeLogin)} CREATEDB`);
      await expect(runAccountMigration(configuration(fixture))).rejects.toThrow(/not least privilege/);
      await rootPool.query(`ALTER ROLE ${identifier(fixture.runtimeLogin)} NOCREATEDB`);

      await rootPool.query(`CREATE ROLE ${identifier(parentRole)} NOLOGIN`);
      await rootPool.query(`GRANT ${identifier(parentRole)} TO ${identifier(fixture.runtimeLogin)}`);
      await expect(runAccountMigration(configuration(fixture))).rejects.toThrow(/unexpected parent role/);
    } finally {
      await cleanup(fixture);
    }
  }, 30_000);

  it("preserves an earlier migration and withholds runtime grants after later SQL failure", async () => {
    const fixture = await createFixture();
    const migrations: readonly Migration[] = [
      {
        id: 1,
        name: "probe",
        sql: "CREATE SCHEMA account_service; CREATE TABLE account_service.migration_probe (id INTEGER PRIMARY KEY)",
      },
      { id: 2, name: "broken", sql: "CREATE TABLE broken migration syntax" },
    ];
    try {
      await expect(runAccountMigration(configuration(fixture), migrations)).rejects.toThrow(
        /Failed to apply account migration 2/,
      );
      const ownerPool = new Pool({ connectionString: fixture.databaseUrl, max: 1 });
      const history = await ownerPool.query("SELECT id, name FROM account_schema_migrations ORDER BY id");
      await ownerPool.end();
      expect(history.rows).toEqual([{ id: 1, name: "probe" }]);

      const runtimePool = new Pool({ connectionString: fixture.runtimeUrl, max: 1 });
      const schemaUsage = await runtimePool.query<{ allowed: boolean }>(
        "SELECT has_schema_privilege(current_user, 'account_service', 'USAGE') AS allowed",
      );
      await runtimePool.end();
      expect(schemaUsage.rows[0]?.allowed).toBe(false);
    } finally {
      await cleanup(fixture);
    }
  }, 30_000);
});
