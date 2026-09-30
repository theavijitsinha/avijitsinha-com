import { createServer } from "node:http";
import type { Express } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AccountController } from "../src/auth/controller.js";
import type { VerifiedGoogleIdentity } from "../src/auth/firebase.js";
import { CSRF_COOKIE, SESSION_COOKIE } from "../src/http/cookies.js";
import { ExactOriginPolicy, ReturnPathPolicy } from "../src/http/policy.js";
import type { InternalCallerVerifier } from "../src/internal/caller.js";
import { InternalAccountController } from "../src/internal/controller.js";
import { MemoryAccountSessionStore } from "./support/memory-session-store.js";

const now = Date.parse("2026-09-30T12:00:00Z");
const browserOrigin = "https://avijitsinha.com";
const resources: Array<() => void> = [];
const identity: VerifiedGoogleIdentity = {
  firebaseUid: "firebase-user-1",
  googleProviderSubject: "google-user-1",
  email: "person@example.test",
  displayName: "Example Person",
  pictureUrl: null,
  authenticatedAt: now - 30_000,
};

afterEach(() => {
  for (const close of resources.splice(0).reverse()) close();
});

async function serve(app: Express): Promise<string> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  resources.push(() => server.close());
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing test address");
  return `http://127.0.0.1:${address.port}`;
}

async function fixture(createdAt = now): Promise<{
  readonly baseUrl: string;
  readonly sessions: MemoryAccountSessionStore;
  readonly session: { readonly token: string; readonly csrfToken: string };
  readonly siteUserId: string;
}> {
  const sessions = new MemoryAccountSessionStore();
  const session = await sessions.create({
    ...identity,
    authenticatedAt: createdAt - 30_000,
  }, null, createdAt);
  const resolved = await sessions.resolve(session.token, null, false, createdAt, false);
  if (resolved === null) throw new Error("Missing test session");
  const callers: InternalCallerVerifier = {
    verify: async token => {
      if (token === "dashboard-token") return { service: "routine-dashboard" };
      if (token === "music-token") return { service: "music-training" };
      throw new Error("invalid caller");
    },
  };
  const origins = new ExactOriginPolicy([browserOrigin]);
  const account = new AccountController({
    verifier: { verify: async () => identity },
    sessions,
    origins,
    returnPaths: new ReturnPathPolicy(["/"]),
    firebase: { apiKey: "key", authDomain: "example.test", projectId: "project", appId: "app" },
    allowedFirebaseUids: [identity.firebaseUid],
    clock: () => now,
  });
  const internal = new InternalAccountController({ callers, sessions, origins, clock: () => now });
  return {
    baseUrl: await serve(createApp({ controller: account, internal })),
    sessions,
    session,
    siteUserId: resolved.userId,
  };
}

function post(
  baseUrl: string,
  path: string,
  token: string | null,
  cookie: string | null,
  body: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (cookie !== null) headers.Cookie = cookie;
  return fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("internal account API", () => {
  it("denies public, invalid and cross-service callers before session authorization", async () => {
    const value = await fixture();
    const cookie = `${SESSION_COOKIE}=${value.session.token}`;
    const body = { method: "GET", origin: null, csrfToken: null };

    expect((await post(value.baseUrl, "/internal/account/sessions:authorize", null, cookie, body)).status).toBe(401);
    expect((await post(value.baseUrl, "/internal/account/sessions:authorize", "invalid", cookie, body)).status).toBe(403);
    expect((await post(value.baseUrl, "/internal/account/sessions:authorize", "music-token", cookie, body)).status).toBe(403);
  });

  it("returns only the session-derived site user for safe requests and rejects tenant selectors", async () => {
    const value = await fixture();
    const cookie = `${SESSION_COOKIE}=${value.session.token}`;
    const response = await post(value.baseUrl, "/internal/account/sessions:authorize", "dashboard-token", cookie, {
      method: "GET",
      origin: null,
      csrfToken: null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ siteUserId: value.siteUserId });

    const spoof = await post(value.baseUrl, "/internal/account/sessions:authorize", "dashboard-token", cookie, {
      method: "GET",
      origin: null,
      csrfToken: null,
      siteUserId: "attacker-selected",
    });
    expect(spoof.status).toBe(400);
    expect(await spoof.text()).not.toContain(value.siteUserId);

    const missing = await post(value.baseUrl, "/internal/account/sessions:authorize", "dashboard-token", null, {
      method: "GET",
      origin: null,
      csrfToken: null,
    });
    expect(missing.status).toBe(401);
  });

  it("validates the original mutation method, exact origin and session-bound CSRF", async () => {
    const createdAt = now - 7 * 24 * 60 * 60 * 1_000;
    const value = await fixture(createdAt);
    const cookie = `${SESSION_COOKIE}=${value.session.token}; ${CSRF_COOKIE}=${value.session.csrfToken}`;
    const validBody = { method: "POST", origin: browserOrigin, csrfToken: value.session.csrfToken };

    const safe = await post(value.baseUrl, "/internal/account/sessions:authorize", "dashboard-token", cookie, {
      method: "GET",
      origin: null,
      csrfToken: null,
    });
    expect(safe.status).toBe(200);
    expect(safe.headers.get("set-cookie")).toBeNull();

    const mutation = await post(
      value.baseUrl,
      "/internal/account/sessions:authorize",
      "dashboard-token",
      cookie,
      validBody,
    );
    expect(mutation.status).toBe(200);
    expect(await mutation.json()).toEqual({ siteUserId: value.siteUserId });

    expect((await post(value.baseUrl, "/internal/account/sessions:authorize", "dashboard-token", cookie, {
      ...validBody,
      origin: "https://attacker.example",
    })).status).toBe(403);
    expect((await post(value.baseUrl, "/internal/account/sessions:authorize", "dashboard-token", cookie, {
      ...validBody,
      csrfToken: "wrong",
    })).status).toBe(403);
    expect((await post(value.baseUrl, "/internal/account/sessions:authorize", "dashboard-token", cookie, {
      method: "GET",
      origin: browserOrigin,
      csrfToken: value.session.csrfToken,
    })).status).toBe(400);
  });

  it("allows only Dashboard to compare its session user with a bounded provider subject", async () => {
    const value = await fixture();
    const cookie = `${SESSION_COOKIE}=${value.session.token}`;
    const match = await post(
      value.baseUrl,
      "/internal/account/google-subjects:matches",
      "dashboard-token",
      cookie,
      { googleSubject: identity.googleProviderSubject },
    );
    expect(match.status).toBe(200);
    expect(await match.json()).toEqual({ matches: true });

    const mismatch = await post(
      value.baseUrl,
      "/internal/account/google-subjects:matches",
      "dashboard-token",
      cookie,
      { googleSubject: "different-google-user" },
    );
    expect(mismatch.status).toBe(200);
    const mismatchText = await mismatch.text();
    expect(JSON.parse(mismatchText)).toEqual({ matches: false });
    expect(mismatchText).not.toContain(identity.googleProviderSubject);
    expect(mismatchText).not.toContain("different-google-user");

    expect((await post(
      value.baseUrl,
      "/internal/account/google-subjects:matches",
      "music-token",
      cookie,
      { googleSubject: identity.googleProviderSubject },
    )).status).toBe(403);
  });
});
