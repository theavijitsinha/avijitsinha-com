import type { FirebaseBrowserConfig } from "./auth/controller.js";
import { parseFirebaseUidAllowlist } from "./auth/admission.js";

export interface AccountConfiguration {
  readonly port: number;
  readonly databaseUrl: string;
  readonly postgresPoolMaximum: number;
  readonly firebase: FirebaseBrowserConfig;
  readonly allowedFirebaseUids: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly allowedReturnPaths: readonly string[];
  readonly internalAudience: string;
  readonly dashboardServiceAccountEmail: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function commaSeparated(environment: NodeJS.ProcessEnv, name: string): readonly string[] {
  const values = required(environment, name).split(",").map(value => value.trim());
  if (values.some(value => value.length === 0)) throw new Error(`${name} contains an empty entry`);
  return values;
}

function poolMaximum(value: string | undefined): number {
  const parsed = Number(value ?? "4");
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4) {
    throw new Error("ACCOUNT_POSTGRES_POOL_MAX must be an integer from 1 to 4");
  }
  return parsed;
}

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): AccountConfiguration {
  const portText = environment.PORT ?? "8080";
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port");
  return {
    port,
    databaseUrl: required(environment, "ACCOUNT_DATABASE_URL"),
    postgresPoolMaximum: poolMaximum(environment.ACCOUNT_POSTGRES_POOL_MAX),
    firebase: {
      apiKey: required(environment, "ACCOUNT_FIREBASE_API_KEY"),
      authDomain: required(environment, "ACCOUNT_FIREBASE_AUTH_DOMAIN"),
      projectId: required(environment, "ACCOUNT_FIREBASE_PROJECT_ID"),
      appId: required(environment, "ACCOUNT_FIREBASE_APP_ID"),
    },
    allowedFirebaseUids: parseFirebaseUidAllowlist(environment.ACCOUNT_ALLOWED_FIREBASE_UIDS),
    allowedOrigins: commaSeparated(environment, "ACCOUNT_ALLOWED_ORIGINS"),
    allowedReturnPaths: commaSeparated(environment, "ACCOUNT_ALLOWED_RETURN_PATHS"),
    internalAudience: required(environment, "ACCOUNT_INTERNAL_AUDIENCE"),
    dashboardServiceAccountEmail: required(environment, "ACCOUNT_DASHBOARD_SERVICE_ACCOUNT_EMAIL"),
  };
}
