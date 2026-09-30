import type { Express, Request, Response } from "express";
import type { AccountSessionStore, ResolvedSession } from "../auth/session-store.js";
import {
  CSRF_COOKIE,
  opaqueValuesEqual,
  parseCookies,
  SESSION_COOKIE,
} from "../http/cookies.js";
import { ExactOriginPolicy } from "../http/policy.js";
import { bearerToken, type InternalCallerVerifier } from "./caller.js";

export interface InternalControllerOptions {
  readonly callers: InternalCallerVerifier;
  readonly sessions: AccountSessionStore;
  readonly origins: ExactOriginPolicy;
  readonly clock?: () => number;
}

const DASHBOARD_SERVICE = "routine-dashboard";
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const RECENT_AUTHENTICATION_MS = 10 * 60_000;
const FUTURE_CLOCK_SKEW_MS = 60_000;

function error(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}

function bodyRecord(request: Request): Readonly<Record<string, unknown>> | null {
  return typeof request.body === "object" && request.body !== null && !Array.isArray(request.body)
    ? request.body as Readonly<Record<string, unknown>>
    : null;
}

function hasExactKeys(body: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(body).sort();
  return actual.length === expected.length && expected.every((key, index) => key === actual[index]);
}

export class InternalAccountController {
  readonly #callers: InternalCallerVerifier;
  readonly #sessions: AccountSessionStore;
  readonly #origins: ExactOriginPolicy;
  readonly #clock: () => number;

  constructor(options: InternalControllerOptions) {
    this.#callers = options.callers;
    this.#sessions = options.sessions;
    this.#origins = options.origins;
    this.#clock = options.clock ?? Date.now;
  }

  async #caller(request: Request, response: Response): Promise<string | null> {
    const token = bearerToken(request.header("authorization"));
    if (token === null) {
      error(response, 401, "caller_authentication_required", "Service authentication is required.");
      return null;
    }
    try {
      return (await this.#callers.verify(token, this.#clock())).service;
    } catch {
      error(response, 403, "caller_denied", "Service caller is not permitted.");
      return null;
    }
  }

  async #session(request: Request): Promise<ResolvedSession | null> {
    const token = parseCookies(request)[SESSION_COOKIE];
    return token === undefined
      ? null
      : this.#sessions.resolve(token, null, false, this.#clock(), false);
  }

  async authorizeSession(request: Request, response: Response): Promise<void> {
    const caller = await this.#caller(request, response);
    if (caller === null) return;
    if (caller !== DASHBOARD_SERVICE) {
      error(response, 403, "caller_denied", "Service caller is not permitted.");
      return;
    }

    const body = bodyRecord(request);
    if (body === null || !hasExactKeys(body, ["csrfToken", "method", "origin", "requireRecentAuthentication"])) {
      error(response, 400, "request_denied", "Session authorization request is invalid.");
      return;
    }
    const method = body.method;
    if (
      typeof method !== "string"
      || (!SAFE_METHODS.has(method) && !MUTATION_METHODS.has(method))
      || typeof body.requireRecentAuthentication !== "boolean"
      || (SAFE_METHODS.has(method) && body.requireRecentAuthentication)
    ) {
      error(response, 400, "request_denied", "Session authorization request is invalid.");
      return;
    }

    if (SAFE_METHODS.has(method)) {
      if (body.origin !== null || body.csrfToken !== null) {
        error(response, 400, "request_denied", "Session authorization request is invalid.");
        return;
      }
      const session = await this.#session(request);
      if (session === null) {
        error(response, 401, "authentication_required", "A valid site session is required.");
        return;
      }
      response.json({ siteUserId: session.userId });
      return;
    }

    const csrfToken = body.csrfToken;
    const csrfCookie = parseCookies(request)[CSRF_COOKIE];
    if (
      typeof body.origin !== "string"
      || !this.#origins.allows(body.origin)
      || typeof csrfToken !== "string"
      || csrfToken.length < 1
      || csrfToken.length > 256
      || csrfCookie === undefined
      || !opaqueValuesEqual(csrfCookie, csrfToken)
    ) {
      error(response, 403, "request_denied", "Session authorization request could not be verified.");
      return;
    }
    const token = parseCookies(request)[SESSION_COOKIE]!;
    const session = await this.#session(request);
    if (session === null) {
      error(response, 401, "authentication_required", "A valid site session is required.");
      return;
    }
    const mutationSession = await this.#sessions.resolve(token, csrfToken, true, this.#clock(), false);
    if (mutationSession === null || mutationSession.userId !== session.userId) {
      error(response, 403, "request_denied", "Session authorization request could not be verified.");
      return;
    }
    const now = this.#clock();
    if (
      body.requireRecentAuthentication
      && (
        mutationSession.lastAuthenticatedAt > now + FUTURE_CLOCK_SKEW_MS
        || now - mutationSession.lastAuthenticatedAt > RECENT_AUTHENTICATION_MS
      )
    ) {
      error(response, 403, "request_denied", "Session authorization request could not be verified.");
      return;
    }
    response.json({ siteUserId: session.userId });
  }

  async matchGoogleSubject(request: Request, response: Response): Promise<void> {
    const caller = await this.#caller(request, response);
    if (caller === null) return;
    if (caller !== DASHBOARD_SERVICE) {
      error(response, 403, "caller_denied", "Service caller is not permitted.");
      return;
    }
    const body = bodyRecord(request);
    const subject = body?.googleSubject;
    if (
      body === null
      || !hasExactKeys(body, ["googleSubject"])
      || typeof subject !== "string"
      || subject.length < 1
      || subject.length > 255
      || CONTROL_CHARACTER.test(subject)
    ) {
      error(response, 400, "request_denied", "Provider comparison request is invalid.");
      return;
    }
    const session = await this.#session(request);
    if (session === null) {
      error(response, 401, "authentication_required", "A valid site session is required.");
      return;
    }
    const matches = await this.#sessions.matchesGoogleSubject(session.userId, subject);
    response.json({ matches });
  }
}

export function mountInternalAccountRoutes(app: Express, controller: InternalAccountController): void {
  app.post("/internal/account/sessions:authorize", (request, response, next) => {
    void controller.authorizeSession(request, response).catch(next);
  });
  app.post("/internal/account/google-subjects:matches", (request, response, next) => {
    void controller.matchGoogleSubject(request, response).catch(next);
  });
}
