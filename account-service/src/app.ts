import express, { type Express } from "express";
import { mountAccountRoutes, type AccountController } from "./auth/controller.js";
import { mountInternalAccountRoutes, type InternalAccountController } from "./internal/controller.js";

export interface AppOptions {
  readonly controller: AccountController;
  readonly internal?: InternalAccountController;
  readonly healthy?: () => Promise<boolean>;
}

export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb", strict: true }));
  app.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    response.set("Pragma", "no-cache");
    next();
  });

  mountAccountRoutes(app, options.controller);
  if (options.internal !== undefined) mountInternalAccountRoutes(app, options.internal);
  app.get("/healthz", (_request, response, next) => {
    void (options.healthy?.() ?? Promise.resolve(true)).then(healthy => {
      response.status(healthy ? 200 : 503).json({ status: healthy ? "healthy" : "unavailable" });
    }).catch(next);
  });
  app.use("/api/account", (_request, response) => {
    response.status(404).json({ error: { code: "not_found", message: "The requested account route does not exist." } });
  });
  app.use((_request, response) => {
    response.status(404).type("text/plain").send("Not found");
  });
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (!response.headersSent) {
      response.status(503).json({ error: { code: "service_unavailable", message: "The account service is temporarily unavailable." } });
    }
  });
  return app;
}
