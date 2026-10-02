import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { configureRuntimePrivileges, quoteRoleIdentifier, validateDeploymentRoles } from "./storage/deployment.js";
import { applyMigrations, loadMigrations, type Migration } from "./storage/migrations.js";

export interface AccountMigrationConfiguration {
  readonly databaseUrl: string;
  readonly runtimeLogin: string;
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value || !value.trim()) throw new Error(`${name} is required`);
  return value;
}

export function loadAccountMigrationConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): AccountMigrationConfiguration {
  const databaseUrl = requiredEnvironmentValue(environment, "ACCOUNT_MIGRATION_DATABASE_URL");
  const runtimeLogin = requiredEnvironmentValue(environment, "ACCOUNT_POSTGRES_RUNTIME_LOGIN");
  const parsedUrl = new URL(databaseUrl);
  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("The account migration database URL must use PostgreSQL");
  }
  quoteRoleIdentifier(runtimeLogin);
  if (parsedUrl.username && decodeURIComponent(parsedUrl.username) === runtimeLogin) {
    throw new Error("The account migration and runtime logins must be different");
  }
  return { databaseUrl, runtimeLogin };
}

export async function runAccountMigration(
  configuration: AccountMigrationConfiguration,
  migrations: readonly Migration[] = loadMigrations(),
): Promise<void> {
  const pool = new Pool({
    connectionString: configuration.databaseUrl,
    application_name: "avijitsinha_account_migration",
    max: 1,
  });
  try {
    await validateDeploymentRoles(pool, configuration.runtimeLogin);
    await applyMigrations(pool, migrations);
    await configureRuntimePrivileges(pool, configuration.runtimeLogin);
  } finally {
    await pool.end();
  }
}

export async function main(): Promise<void> {
  await runAccountMigration(loadAccountMigrationConfiguration());
  process.stdout.write("Account PostgreSQL migration completed.\n");
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  void main().catch(() => {
    process.stderr.write("Account PostgreSQL migration failed.\n");
    process.exitCode = 1;
  });
}
