import { describe, expect, it } from "vitest";
import { validateFirebaseGoogleClaims } from "../src/auth/firebase.js";
import { parseFirebaseUidAllowlist } from "../src/auth/admission.js";
import { ExactOriginPolicy, ReturnPathPolicy } from "../src/http/policy.js";

const now = Date.parse("2026-09-30T12:00:00Z");

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: "avijitsinha-com",
    iss: "https://securetoken.google.com/avijitsinha-com",
    sub: "firebase-user-1",
    uid: "firebase-user-1",
    exp: (now + 3_600_000) / 1_000,
    auth_time: (now - 30_000) / 1_000,
    email: "person@example.test",
    name: "Example Person",
    picture: "https://example.test/person.jpg",
    firebase: { sign_in_provider: "google.com", identities: { "google.com": ["google-user-1"] } },
    ...overrides,
  };
}

describe("Firebase Google identity validation", () => {
  it("returns the bounded identity for the configured Firebase project", () => {
    expect(validateFirebaseGoogleClaims(claims(), "avijitsinha-com", now)).toEqual({
      firebaseUid: "firebase-user-1",
      googleProviderSubject: "google-user-1",
      email: "person@example.test",
      displayName: "Example Person",
      pictureUrl: "https://example.test/person.jpg",
      authenticatedAt: now - 30_000,
    });
  });

  it("rejects tokens outside the exact project, issuer, provider, expiry and recent-auth boundary", () => {
    expect(() => validateFirebaseGoogleClaims(claims({ aud: "other-project" }), "avijitsinha-com", now)).toThrow(/audience/);
    expect(() => validateFirebaseGoogleClaims(claims({ iss: "https://example.test" }), "avijitsinha-com", now)).toThrow(/issuer/);
    expect(() => validateFirebaseGoogleClaims(claims({ exp: (now - 120_000) / 1_000 }), "avijitsinha-com", now)).toThrow(/expired/);
    expect(() => validateFirebaseGoogleClaims(claims({ auth_time: (now - 11 * 60_000) / 1_000 }), "avijitsinha-com", now)).toThrow(/recent/);
    expect(() => validateFirebaseGoogleClaims(claims({
      firebase: { sign_in_provider: "password", identities: {} },
    }), "avijitsinha-com", now)).toThrow(/Google sign-in/);
  });
});

describe("account input policies", () => {
  it("fails closed on missing, duplicate and malformed admission entries", () => {
    expect(() => parseFirebaseUidAllowlist(undefined)).toThrow(/required/);
    expect(() => parseFirebaseUidAllowlist("")).toThrow(/invalid entry/);
    expect(() => parseFirebaseUidAllowlist("one,one")).toThrow(/duplicate/);
    expect(parseFirebaseUidAllowlist("one, two")).toEqual(["one", "two"]);
  });

  it("accepts only exact origins and allowlisted local return paths", () => {
    const origins = new ExactOriginPolicy(["https://avijitsinha.com"]);
    expect(origins.allows("https://avijitsinha.com")).toBe(true);
    expect(origins.allows("https://avijitsinha.com/path")).toBe(false);
    expect(origins.allows("https://beta.avijitsinha.com")).toBe(false);

    const paths = new ReturnPathPolicy(["/", "/music/training/intervals", "/routine/dashboard/"]);
    expect(paths.resolve("/music/training/intervals")).toBe("/music/training/intervals");
    expect(paths.resolve("https://attacker.example/")).toBe("/");
    expect(paths.resolve("//attacker.example/")).toBe("/");
  });
});
