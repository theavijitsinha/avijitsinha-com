import { describe, expect, it } from "vitest";
import { loadConfiguration } from "../src/config.js";

const environment: NodeJS.ProcessEnv = {
  ACCOUNT_DATABASE_URL: "postgresql://runtime:secret@database.invalid/account",
  ACCOUNT_FIREBASE_API_KEY: "browser-key",
  ACCOUNT_FIREBASE_AUTH_DOMAIN: "avijitsinha-com.firebaseapp.com",
  ACCOUNT_FIREBASE_PROJECT_ID: "avijitsinha-com",
  ACCOUNT_FIREBASE_APP_ID: "app-id",
  ACCOUNT_ALLOWED_FIREBASE_UIDS: "firebase-uid",
  ACCOUNT_ALLOWED_ORIGINS: "https://avijitsinha.com",
  ACCOUNT_ALLOWED_RETURN_PATHS: "/,/routine/dashboard/",
  ACCOUNT_INTERNAL_AUDIENCE: "https://account.internal.example",
  ACCOUNT_DASHBOARD_SERVICE_ACCOUNT_EMAIL: "dashboard@example.iam.gserviceaccount.com",
};

describe("account service configuration", () => {
  it("defaults to a four-connection database pool", () => {
    expect(loadConfiguration(environment).postgresPoolMaximum).toBe(4);
  });

  it("accepts a smaller database connection budget", () => {
    expect(loadConfiguration({ ...environment, ACCOUNT_POSTGRES_POOL_MAX: "2" }).postgresPoolMaximum).toBe(2);
  });

  it.each(["0", "5", "1.5", "not-a-number", ""])("rejects pool maximum %j", value => {
    expect(() => loadConfiguration({ ...environment, ACCOUNT_POSTGRES_POOL_MAX: value })).toThrow(
      /ACCOUNT_POSTGRES_POOL_MAX must be an integer from 1 to 4/,
    );
  });
});
