import { createServer } from "node:http";
import type { Express } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AccountController } from "../src/auth/controller.js";
import type { FirebaseTokenVerifier, VerifiedGoogleIdentity } from "../src/auth/firebase.js";
import { CSRF_COOKIE, LOGIN_COOKIE, SESSION_COOKIE } from "../src/http/cookies.js";
import { ExactOriginPolicy, ReturnPathPolicy } from "../src/http/policy.js";
import { MemoryAccountSessionStore } from "./support/memory-session-store.js";

const now = Date.parse("2026-09-30T12:00:00Z");
const origin = "https://avijitsinha.com";
const resources: Array<() => void> = [];
const identity: VerifiedGoogleIdentity = {
  firebaseUid: "firebase-user-1",
  googleProviderSubject: "google-user-1",
  email: "person@example.test",
  displayName: "Example Person",
  pictureUrl: "https://example.test/person.jpg",
  authenticatedAt: now - 30_000,
};

afterEach(() => {
  vi.restoreAllMocks();
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

function setCookies(response: Response): readonly string[] {
  return response.headers.getSetCookie();
}

function cookiePair(response: Response, name: string): string {
  const cookie = setCookies(response).find(value => value.startsWith(`${name}=`));
  if (cookie === undefined) throw new Error(`Missing ${name} cookie`);
  return cookie.split(";", 1)[0]!;
}

async function fixture(verifierIdentity: VerifiedGoogleIdentity = identity): Promise<{
  readonly baseUrl: string;
  readonly sessions: MemoryAccountSessionStore;
  readonly verifier: FirebaseTokenVerifier & { verify: ReturnType<typeof vi.fn> };
}> {
  const sessions = new MemoryAccountSessionStore();
  const verify = vi.fn(async () => verifierIdentity);
  const verifier = { verify };
  const controller = new AccountController({
    verifier,
    sessions,
    origins: new ExactOriginPolicy([origin]),
    returnPaths: new ReturnPathPolicy(["/", "/music/training/", "/routine/dashboard/"]),
    firebase: {
      apiKey: "public-api-key",
      authDomain: "avijitsinha.com",
      projectId: "avijitsinha-com",
      appId: "public-app-id",
    },
    allowedFirebaseUids: [identity.firebaseUid],
    clock: () => now,
  });
  return { baseUrl: await serve(createApp({ controller })), sessions, verifier };
}

async function challenge(baseUrl: string, returnPath = "/"): Promise<{
  readonly value: string;
  readonly cookie: string;
}> {
  const response = await fetch(`${baseUrl}/api/account/config?return=${encodeURIComponent(returnPath)}`);
  expect(response.status).toBe(200);
  const body = await response.json() as { challenge: string; returnPath: string };
  expect(body.returnPath).toBe(returnPath);
  return { value: body.challenge, cookie: cookiePair(response, LOGIN_COOKIE) };
}

describe("common account browser API", () => {
  it("exchanges a single-use challenge, replaces fixation state and exposes no stable identifier", async () => {
    const value = await fixture();
    const prior = await value.sessions.create(identity, null, now - 1_000);
    const login = await challenge(value.baseUrl, "/music/training/");

    const mismatch = await fetch(`${value.baseUrl}/api/account/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: login.cookie },
      body: JSON.stringify({ idToken: "synthetic-firebase-token", challenge: "different-challenge" }),
    });
    expect(mismatch.status).toBe(403);
    expect(value.verifier.verify).not.toHaveBeenCalled();

    const response = await fetch(`${value.baseUrl}/api/account/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: `${login.cookie}; ${SESSION_COOKIE}=${prior.token}`,
      },
      body: JSON.stringify({ idToken: "synthetic-firebase-token", challenge: login.value }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ returnPath: "/music/training/" });
    expect(value.verifier.verify).toHaveBeenCalledWith("synthetic-firebase-token", now);

    const cookies = setCookies(response);
    const sessionCookie = cookies.find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`)) ?? "";
    const csrfCookie = cookies.find(cookie => cookie.startsWith(`${CSRF_COOKIE}=`)) ?? "";
    expect(sessionCookie).toContain("Path=/");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(csrfCookie).toContain("Path=/");
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(csrfCookie).toContain("Secure");
    expect(csrfCookie).toContain("SameSite=Lax");
    expect(await value.sessions.resolve(prior.token, null, false, now)).toBeNull();

    const me = await fetch(`${value.baseUrl}/api/account/me?userId=attacker-controlled&return=${encodeURIComponent("/music/training/")}`, {
      headers: { Cookie: cookiePair(response, SESSION_COOKIE) },
    });
    expect(me.status).toBe(200);
    const profile = await me.json() as Record<string, unknown>;
    expect(profile).toMatchObject({
      profile: { email: identity.email, displayName: identity.displayName, pictureUrl: identity.pictureUrl },
      returnPath: "/music/training/",
    });
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain(identity.firebaseUid);
    expect(serialized).not.toContain(identity.googleProviderSubject);
    expect(serialized).not.toContain("attacker-controlled");

    const replay = await fetch(`${value.baseUrl}/api/account/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: login.cookie },
      body: JSON.stringify({ idToken: "synthetic-firebase-token", challenge: login.value }),
    });
    expect(replay.status).toBe(403);
    expect(value.verifier.verify).toHaveBeenCalledTimes(1);
  });

  it("consumes a challenge before beta admission denial and persists no denied identity", async () => {
    const denied = {
      ...identity,
      firebaseUid: "firebase-denied-user",
      googleProviderSubject: "google-denied-user",
      email: "denied@example.test",
    };
    const value = await fixture(denied);
    const login = await challenge(value.baseUrl);
    const request = (): Promise<Response> => fetch(`${value.baseUrl}/api/account/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, Cookie: login.cookie },
      body: JSON.stringify({ idToken: "synthetic-firebase-token", challenge: login.value }),
    });

    const deniedResponse = await request();
    expect(deniedResponse.status).toBe(403);
    const deniedBody = await deniedResponse.text();
    expect(deniedBody).not.toContain(denied.firebaseUid);
    expect(deniedBody).not.toContain(denied.googleProviderSubject);
    expect(deniedBody).not.toContain(denied.email);
    expect(value.sessions.userCount).toBe(0);
    expect(value.sessions.sessionCount).toBe(0);

    vi.mocked(value.verifier.verify).mockResolvedValue(identity);
    expect((await request()).status).toBe(403);
    expect(value.verifier.verify).toHaveBeenCalledTimes(1);
  });

  it("requires exact origin and double-submit CSRF for logout", async () => {
    const value = await fixture();
    const session = await value.sessions.create(identity, null, now);
    const cookie = `${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrfToken}`;

    expect((await fetch(`${value.baseUrl}/api/account/logout`, {
      method: "POST",
      headers: { Origin: "https://attacker.example", Cookie: cookie, "X-CSRF-Token": session.csrfToken },
    })).status).toBe(403);
    expect((await fetch(`${value.baseUrl}/api/account/logout`, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": "wrong" },
    })).status).toBe(403);

    const response = await fetch(`${value.baseUrl}/api/account/logout`, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "X-CSRF-Token": session.csrfToken },
    });
    expect(response.status).toBe(204);
    const cleared = setCookies(response);
    expect(cleared.find(value => value.startsWith(`${SESSION_COOKIE}=`))).toContain("Expires=Thu, 01 Jan 1970");
    expect(cleared.find(value => value.startsWith(`${CSRF_COOKIE}=`))).toContain("Expires=Thu, 01 Jan 1970");
    expect(await value.sessions.resolve(session.token, null, false, now)).toBeNull();
  });

  it("rotates both opaque values and returns generic unauthorized responses", async () => {
    const value = await fixture();
    const createdAt = now - 7 * 24 * 60 * 60 * 1_000;
    const oldIdentity = { ...identity, authenticatedAt: createdAt - 30_000 };
    const session = await value.sessions.create(oldIdentity, null, createdAt);
    const response = await fetch(`${value.baseUrl}/api/account/me`, {
      headers: { Cookie: `${SESSION_COOKIE}=${session.token}` },
    });
    expect(response.status).toBe(200);
    expect(cookiePair(response, SESSION_COOKIE)).not.toBe(`${SESSION_COOKIE}=${session.token}`);
    expect(cookiePair(response, CSRF_COOKIE)).not.toBe(`${CSRF_COOKIE}=${session.csrfToken}`);

    const unauthorized = await fetch(`${value.baseUrl}/api/account/me`, {
      headers: { Cookie: `${SESSION_COOKIE}=unknown` },
    });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({
      error: { code: "authentication_required", message: "Sign-in is required." },
    });
  });
});
