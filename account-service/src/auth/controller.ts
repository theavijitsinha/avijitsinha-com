import type { Express, Request, Response } from "express";
import type { FirebaseTokenVerifier } from "./firebase.js";
import type { AccountSessionStore, ResolvedSession } from "./session-store.js";
import { validateFirebaseUidAllowlist } from "./admission.js";
import {
  CSRF_COOKIE,
  LOGIN_COOKIE,
  opaqueValuesEqual,
  parseCookies,
  SESSION_COOKIE,
} from "../http/cookies.js";
import { ExactOriginPolicy, ReturnPathPolicy } from "../http/policy.js";

export interface FirebaseBrowserConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

export interface AccountControllerOptions {
  readonly verifier: FirebaseTokenVerifier;
  readonly sessions: AccountSessionStore;
  readonly origins: ExactOriginPolicy;
  readonly returnPaths: ReturnPathPolicy;
  readonly firebase: FirebaseBrowserConfig;
  readonly allowedFirebaseUids: readonly string[];
  readonly clock?: () => number;
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const LOGIN_MAX_AGE_MS = 10 * 60 * 1_000;

function bodyRecord(request: Request): Readonly<Record<string, unknown>> {
  return typeof request.body === "object" && request.body !== null
    ? request.body as Readonly<Record<string, unknown>>
    : {};
}

function error(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } });
}

export class AccountController {
  readonly #verifier: FirebaseTokenVerifier;
  readonly #sessions: AccountSessionStore;
  readonly #origins: ExactOriginPolicy;
  readonly #returnPaths: ReturnPathPolicy;
  readonly #firebase: FirebaseBrowserConfig;
  readonly #allowedFirebaseUids: ReadonlySet<string>;
  readonly #clock: () => number;

  constructor(options: AccountControllerOptions) {
    this.#verifier = options.verifier;
    this.#sessions = options.sessions;
    this.#origins = options.origins;
    this.#returnPaths = options.returnPaths;
    this.#firebase = Object.freeze({ ...options.firebase });
    this.#allowedFirebaseUids = new Set(validateFirebaseUidAllowlist(options.allowedFirebaseUids));
    this.#clock = options.clock ?? Date.now;
  }

  #setSessionCookies(response: Response, token: string, csrfToken: string): void {
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS,
    });
    response.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS,
    });
  }

  #clearSessionCookies(response: Response): void {
    const shared = { secure: true, sameSite: "lax" as const, path: "/" };
    response.clearCookie(SESSION_COOKIE, { ...shared, httpOnly: true });
    response.clearCookie(CSRF_COOKIE, { ...shared, httpOnly: false });
  }

  async #authenticate(request: Request, response: Response): Promise<ResolvedSession | null> {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token === undefined) return null;
    const session = await this.#sessions.resolve(token, null, false, this.#clock());
    if (session === null) {
      this.#clearSessionCookies(response);
      return null;
    }
    if (session.replacementToken !== null || session.replacementCsrfToken !== null) {
      if (session.replacementToken === null || session.replacementCsrfToken === null) {
        throw new Error("Session rotation returned an incomplete replacement");
      }
      this.#setSessionCookies(response, session.replacementToken, session.replacementCsrfToken);
    }
    return session;
  }

  async config(request: Request, response: Response): Promise<void> {
    const returnPath = this.#returnPaths.resolve(request.query.return);
    const challenge = await this.#sessions.issueLoginChallenge(returnPath, this.#clock());
    response.cookie(LOGIN_COOKIE, challenge, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: LOGIN_MAX_AGE_MS,
    });
    response.json({ firebase: this.#firebase, challenge, returnPath });
  }

  async createSession(request: Request, response: Response): Promise<void> {
    if (!this.#origins.allows(request.header("origin"))) {
      error(response, 403, "origin_denied", "Request origin is not allowed.");
      return;
    }
    const body = bodyRecord(request);
    const challenge = typeof body.challenge === "string" ? body.challenge : "";
    const cookieChallenge = parseCookies(request)[LOGIN_COOKIE] ?? "";
    if (!challenge || !cookieChallenge || !opaqueValuesEqual(challenge, cookieChallenge)) {
      error(response, 403, "request_denied", "Sign-in request could not be verified.");
      return;
    }

    const returnPath = await this.#sessions.consumeLoginChallenge(challenge, this.#clock());
    if (returnPath === null) {
      error(response, 403, "request_denied", "Sign-in request could not be verified.");
      return;
    }

    if (typeof body.idToken !== "string" || body.idToken.length < 1 || body.idToken.length > 8_192) {
      error(response, 401, "sign_in_denied", "Google sign-in could not be verified.");
      return;
    }

    let identity;
    try {
      identity = await this.#verifier.verify(body.idToken, this.#clock());
    } catch {
      error(response, 401, "sign_in_denied", "Google sign-in could not be verified.");
      return;
    }
    if (!this.#allowedFirebaseUids.has(identity.firebaseUid)) {
      error(response, 403, "access_denied", "This account is not permitted to sign in.");
      return;
    }

    const existingToken = parseCookies(request)[SESSION_COOKIE] ?? null;
    const session = await this.#sessions.create(identity, existingToken, this.#clock());
    this.#setSessionCookies(response, session.token, session.csrfToken);
    response.clearCookie(LOGIN_COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    response.status(201).json({ returnPath });
  }

  async me(request: Request, response: Response): Promise<void> {
    const session = await this.#authenticate(request, response);
    if (session === null) {
      error(response, 401, "authentication_required", "Sign-in is required.");
      return;
    }
    response.json({
      profile: {
        email: session.email,
        displayName: session.displayName,
        pictureUrl: session.pictureUrl,
      },
      session: {
        lastAuthenticatedAt: new Date(session.lastAuthenticatedAt).toISOString(),
        idleExpiresAt: new Date(session.idleExpiresAt).toISOString(),
      },
      returnPath: this.#returnPaths.resolve(request.query.return),
    });
  }

  async logout(request: Request, response: Response): Promise<void> {
    if (!this.#origins.allows(request.header("origin"))) {
      error(response, 403, "origin_denied", "Request origin is not allowed.");
      return;
    }
    const requestCookies = parseCookies(request);
    const sessionToken = requestCookies[SESSION_COOKIE];
    const cookieCsrf = requestCookies[CSRF_COOKIE];
    const headerCsrf = request.header("x-csrf-token");
    if (!sessionToken || !cookieCsrf || !headerCsrf || !opaqueValuesEqual(cookieCsrf, headerCsrf)) {
      error(response, 403, "request_denied", "Logout request could not be verified.");
      return;
    }
    await this.#sessions.revoke(sessionToken, headerCsrf, this.#clock());
    this.#clearSessionCookies(response);
    response.status(204).end();
  }
}

export function mountAccountRoutes(app: Express, controller: AccountController): void {
  app.get("/api/account/config", (request, response, next) => {
    void controller.config(request, response).catch(next);
  });
  app.post("/api/account/session", (request, response, next) => {
    void controller.createSession(request, response).catch(next);
  });
  app.get("/api/account/me", (request, response, next) => {
    void controller.me(request, response).catch(next);
  });
  app.post("/api/account/logout", (request, response, next) => {
    void controller.logout(request, response).catch(next);
  });
}
