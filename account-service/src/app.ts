import { resolve } from "node:path";
import express, { type Express } from "express";
import { mountAccountRoutes, type AccountController } from "./auth/controller.js";
import { mountInternalAccountRoutes, type InternalAccountController } from "./internal/controller.js";

export interface AppOptions {
  readonly controller: AccountController;
  readonly internal?: InternalAccountController;
  readonly healthy?: () => Promise<boolean>;
  readonly staticDirectory?: string | null;
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

  if (options.staticDirectory !== undefined && options.staticDirectory !== null) {
    const staticDirectory = resolve(options.staticDirectory);
    const index = resolve(staticDirectory, "index.html");
    app.use("/account", (_request, response, next) => {
      response.set("Content-Security-Policy", [
        "default-src 'self'",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data: https://lh3.googleusercontent.com",
        "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
        "frame-src 'self' https://accounts.google.com",
      ].join("; "));
      response.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
      response.set("Referrer-Policy", "no-referrer");
      response.set("X-Content-Type-Options", "nosniff");
      response.set("X-Frame-Options", "DENY");
      response.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      next();
    });
    app.use((request, response, next) => {
      if (request.method === "GET" && request.path === "/account") response.redirect(308, "/account/");
      else next();
    });
    app.get("/account/", (_request, response) => response.sendFile(index));
    app.use("/account", express.static(staticDirectory, { index: false }));
  }

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
