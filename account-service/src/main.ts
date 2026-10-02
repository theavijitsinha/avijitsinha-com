import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";
import { createApp } from "./app.js";
import { AccountController } from "./auth/controller.js";
import { FirebaseAdminTokenVerifier } from "./auth/firebase.js";
import { PostgresAccountSessionStore } from "./auth/session-store.js";
import { loadConfiguration } from "./config.js";
import { ExactOriginPolicy, ReturnPathPolicy } from "./http/policy.js";
import { GoogleInternalCallerVerifier } from "./internal/caller.js";
import { InternalAccountController } from "./internal/controller.js";

export async function main(): Promise<void> {
  const configuration = loadConfiguration();
  const pool = new Pool({
    connectionString: configuration.databaseUrl,
    max: configuration.postgresPoolMaximum,
  });
  const sessions = new PostgresAccountSessionStore(pool);
  const origins = new ExactOriginPolicy(configuration.allowedOrigins);
  const controller = new AccountController({
    verifier: new FirebaseAdminTokenVerifier(configuration.firebase.projectId),
    sessions,
    origins,
    returnPaths: new ReturnPathPolicy(configuration.allowedReturnPaths),
    firebase: configuration.firebase,
    allowedFirebaseUids: configuration.allowedFirebaseUids,
  });
  const internal = new InternalAccountController({
    callers: new GoogleInternalCallerVerifier(configuration.internalAudience, [{
      service: "routine-dashboard",
      email: configuration.dashboardServiceAccountEmail,
    }]),
    sessions,
    origins,
  });
  const app = createApp({
    controller,
    internal,
    staticDirectory: fileURLToPath(new URL("../client-dist/", import.meta.url)),
    healthy: async () => {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
  });
  const server = app.listen(configuration.port, "0.0.0.0", () => {
    process.stdout.write("Account service started.\n");
  });
  const shutdown = (): void => {
    server.close(() => { void pool.end(); });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  void main().catch(() => {
    process.stderr.write("Account service failed to start.\n");
    process.exitCode = 1;
  });
}
