import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { createApp } from "./app.js";
import { AccountController } from "./auth/controller.js";
import { FirebaseAdminTokenVerifier } from "./auth/firebase.js";
import { PostgresAccountSessionStore } from "./auth/session-store.js";
import { loadConfiguration } from "./config.js";
import { ExactOriginPolicy, ReturnPathPolicy } from "./http/policy.js";

export async function main(): Promise<void> {
  const configuration = loadConfiguration();
  const pool = new Pool({ connectionString: configuration.databaseUrl, max: 10 });
  const controller = new AccountController({
    verifier: new FirebaseAdminTokenVerifier(configuration.firebase.projectId),
    sessions: new PostgresAccountSessionStore(pool),
    origins: new ExactOriginPolicy(configuration.allowedOrigins),
    returnPaths: new ReturnPathPolicy(configuration.allowedReturnPaths),
    firebase: configuration.firebase,
    allowedFirebaseUids: configuration.allowedFirebaseUids,
  });
  const app = createApp({
    controller,
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
