import { describe, expect, it } from "vitest";
import type { VerifiedGoogleIdentity } from "../src/auth/firebase.js";
import { MemoryAccountSessionStore } from "./support/memory-session-store.js";

const DAY = 24 * 60 * 60 * 1_000;
const now = Date.parse("2026-09-30T12:00:00Z");
const identity: VerifiedGoogleIdentity = {
  firebaseUid: "firebase-user-1",
  googleProviderSubject: "google-user-1",
  email: null,
  displayName: null,
  pictureUrl: null,
  authenticatedAt: now - 30_000,
};

describe("account session lifecycle", () => {
  it("stores only hashes and consumes login challenges once before expiry", async () => {
    const store = new MemoryAccountSessionStore();
    const challenge = await store.issueLoginChallenge("/routine/dashboard/", now);
    expect(store.storedHashes()).not.toContain(challenge);
    expect(await store.consumeLoginChallenge(challenge, now + 1_000)).toBe("/routine/dashboard/");
    expect(await store.consumeLoginChallenge(challenge, now + 2_000)).toBeNull();

    const expired = await store.issueLoginChallenge("/", now);
    expect(await store.consumeLoginChallenge(expired, now + 10 * 60 * 1_000)).toBeNull();
  });

  it("expires after 30 inactive days and extends only on bounded authenticated use", async () => {
    const inactive = new MemoryAccountSessionStore();
    const inactiveSession = await inactive.create(identity, null, now);
    expect(await inactive.resolve(inactiveSession.token, null, false, now + 30 * DAY)).toBeNull();

    const active = new MemoryAccountSessionStore();
    const activeSession = await active.create(identity, null, now);
    const used = await active.resolve(activeSession.token, null, false, now + DAY);
    expect(used?.idleExpiresAt).toBe(now + 31 * DAY);
    expect(await active.resolve(activeSession.token, null, false, now + 30 * DAY)).not.toBeNull();
  });

  it("rotates session and CSRF values with a five-minute safe-request grace", async () => {
    const store = new MemoryAccountSessionStore();
    const createdAt = now - 7 * DAY;
    const session = await store.create({ ...identity, authenticatedAt: createdAt - 30_000 }, null, createdAt);
    const rotated = await store.resolve(session.token, session.csrfToken, true, now);
    expect(rotated?.replacementToken).toBeTruthy();
    expect(rotated?.replacementCsrfToken).toBeTruthy();
    expect(rotated?.replacementToken).not.toBe(session.token);
    expect(rotated?.replacementCsrfToken).not.toBe(session.csrfToken);
    expect(store.storedHashes()).not.toContain(rotated!.replacementToken!);
    expect(store.storedHashes()).not.toContain(rotated!.replacementCsrfToken!);

    expect(await store.resolve(session.token, null, false, now + 4 * 60 * 1_000)).not.toBeNull();
    expect(await store.resolve(session.token, session.csrfToken, true, now + 4 * 60 * 1_000)).toBeNull();
    expect(await store.resolve(session.token, null, false, now + 5 * 60 * 1_000)).toBeNull();
    expect(await store.resolve(
      rotated!.replacementToken!,
      rotated!.replacementCsrfToken!,
      true,
      now + 5 * 60 * 1_000,
    )).not.toBeNull();
  });

  it("revokes only the session matching both opaque values", async () => {
    const store = new MemoryAccountSessionStore();
    const session = await store.create(identity, null, now);
    expect(await store.revoke(session.token, "wrong", now + 1_000)).toBe(false);
    expect(await store.resolve(session.token, null, false, now + 2_000)).not.toBeNull();
    expect(await store.revoke(session.token, session.csrfToken, now + 3_000)).toBe(true);
    expect(await store.resolve(session.token, null, false, now + 4_000)).toBeNull();
  });
});
