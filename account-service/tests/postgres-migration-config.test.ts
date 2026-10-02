import { describe, expect, it } from "vitest";
import { loadAccountMigrationConfiguration } from "../src/migrate.js";

const validEnvironment = {
  ACCOUNT_MIGRATION_DATABASE_URL: "postgresql://account_migrator:secret@database.invalid/account",
  ACCOUNT_POSTGRES_RUNTIME_LOGIN: "account_runtime",
};

describe("account migration configuration", () => {
  it("requires a dedicated PostgreSQL migration URL and safe runtime login", () => {
    expect(loadAccountMigrationConfiguration(validEnvironment)).toEqual({
      databaseUrl: validEnvironment.ACCOUNT_MIGRATION_DATABASE_URL,
      runtimeLogin: validEnvironment.ACCOUNT_POSTGRES_RUNTIME_LOGIN,
    });
    expect(() => loadAccountMigrationConfiguration({
      ACCOUNT_POSTGRES_RUNTIME_LOGIN: validEnvironment.ACCOUNT_POSTGRES_RUNTIME_LOGIN,
    })).toThrow(/ACCOUNT_MIGRATION_DATABASE_URL/);
    expect(() => loadAccountMigrationConfiguration({
      ACCOUNT_MIGRATION_DATABASE_URL: validEnvironment.ACCOUNT_MIGRATION_DATABASE_URL,
    })).toThrow(/ACCOUNT_POSTGRES_RUNTIME_LOGIN/);
  });

  it("accepts a Cloud SQL Unix-socket connection URL with no network host", () => {
    const databaseUrl = "postgresql://account_migrator:secret@/account?host=%2Fcloudsql%2Fproject%3Aregion%3Ainstance&sslmode=disable";
    expect(loadAccountMigrationConfiguration({
      ...validEnvironment,
      ACCOUNT_MIGRATION_DATABASE_URL: databaseUrl,
    })).toEqual({
      databaseUrl,
      runtimeLogin: validEnvironment.ACCOUNT_POSTGRES_RUNTIME_LOGIN,
    });
  });

  it("rejects non-PostgreSQL, unsafe and shared runtime configuration", () => {
    expect(() => loadAccountMigrationConfiguration({
      ...validEnvironment,
      ACCOUNT_MIGRATION_DATABASE_URL: "https://database.invalid/account",
    })).toThrow(/must use PostgreSQL/);
    expect(() => loadAccountMigrationConfiguration({
      ...validEnvironment,
      ACCOUNT_POSTGRES_RUNTIME_LOGIN: "account-runtime",
    })).toThrow(/safe unquoted identifiers/);
    expect(() => loadAccountMigrationConfiguration({
      ...validEnvironment,
      ACCOUNT_MIGRATION_DATABASE_URL: "postgresql://account_runtime:secret@database.invalid/account",
    })).toThrow(/must be different/);
  });
});
