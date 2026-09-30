import type { FirebaseBrowserConfig } from "./auth/controller.js";
import { parseFirebaseUidAllowlist } from "./auth/admission.js";

export interface AccountConfiguration {
  readonly port: number;
  readonly databaseUrl: string;
  readonly firebase: FirebaseBrowserConfig;
  readonly allowedFirebaseUids: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly allowedReturnPaths: readonly string[];
  readonly internalAudience: string;
  readonly dashboardServiceAccountEmail: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function commaSeparated(name: string): readonly string[] {
  const values = required(name).split(",").map(value => value.trim());
  if (values.some(value => value.length === 0)) throw new Error(`${name} contains an empty entry`);
  return values;
}

export function loadConfiguration(): AccountConfiguration {
  const portText = process.env.PORT ?? "8080";
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port");
  return {
    port,
    databaseUrl: required("ACCOUNT_DATABASE_URL"),
    firebase: {
      apiKey: required("ACCOUNT_FIREBASE_API_KEY"),
      authDomain: required("ACCOUNT_FIREBASE_AUTH_DOMAIN"),
      projectId: required("ACCOUNT_FIREBASE_PROJECT_ID"),
      appId: required("ACCOUNT_FIREBASE_APP_ID"),
    },
    allowedFirebaseUids: parseFirebaseUidAllowlist(process.env.ACCOUNT_ALLOWED_FIREBASE_UIDS),
    allowedOrigins: commaSeparated("ACCOUNT_ALLOWED_ORIGINS"),
    allowedReturnPaths: commaSeparated("ACCOUNT_ALLOWED_RETURN_PATHS"),
    internalAudience: required("ACCOUNT_INTERNAL_AUDIENCE"),
    dashboardServiceAccountEmail: required("ACCOUNT_DASHBOARD_SERVICE_ACCOUNT_EMAIL"),
  };
}
