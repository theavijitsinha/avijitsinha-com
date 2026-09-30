import { describe, expect, it } from "vitest";
import { bearerToken, GoogleInternalCallerVerifier } from "../src/internal/caller.js";

const now = Date.parse("2026-09-30T12:00:00Z");
const audience = "https://account-service.example/internal";
const dashboardEmail = "routine-dashboard@avijitsinha-com.iam.gserviceaccount.com";

function client(payload: Readonly<Record<string, unknown>>, calls: unknown[] = []) {
  return {
    verifyIdToken: async (options: unknown) => {
      calls.push(options);
      return { getPayload: () => payload };
    },
  };
}

function claims(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return {
    iss: "https://accounts.google.com",
    aud: audience,
    sub: "service-account-subject",
    email: dashboardEmail,
    email_verified: true,
    exp: (now + 60 * 60 * 1_000) / 1_000,
    ...overrides,
  };
}

describe("Google internal caller verification", () => {
  it("verifies the signature boundary with one exact audience and maps the allowlisted email", async () => {
    const calls: unknown[] = [];
    const verifier = new GoogleInternalCallerVerifier(audience, [{
      service: "routine-dashboard",
      email: dashboardEmail,
    }], client(claims(), calls) as never);

    await expect(verifier.verify("signed-oidc-token", now)).resolves.toEqual({ service: "routine-dashboard" });
    expect(calls).toEqual([{ idToken: "signed-oidc-token", audience }]);
  });

  it("rejects wrong audience, issuer, expiry, verification, subject and service account", async () => {
    const invalidClaims = [
      claims({ aud: "https://other.example/" }),
      claims({ iss: "https://issuer.example" }),
      claims({ exp: now / 1_000 }),
      claims({ email_verified: false }),
      claims({ sub: "" }),
      claims({ email: "other@avijitsinha-com.iam.gserviceaccount.com" }),
    ];
    for (const payload of invalidClaims) {
      const verifier = new GoogleInternalCallerVerifier(audience, [{
        service: "routine-dashboard",
        email: dashboardEmail,
      }], client(payload) as never);
      await expect(verifier.verify("signed-oidc-token", now)).rejects.toThrow(/identity/);
    }
  });

  it("fails closed on malformed configuration and bearer headers", () => {
    expect(() => new GoogleInternalCallerVerifier("http://account.example/", [{
      service: "routine-dashboard",
      email: dashboardEmail,
    }])).toThrow(/HTTPS/);
    expect(() => new GoogleInternalCallerVerifier(audience, [{
      service: "routine-dashboard",
      email: "person@example.test",
    }])).toThrow(/service-account/);
    expect(() => new GoogleInternalCallerVerifier(audience, [])).toThrow(/At least one/);

    expect(bearerToken("Bearer signed.token-value")).toBe("signed.token-value");
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("Basic value")).toBeNull();
    expect(bearerToken("Bearer two values")).toBeNull();
  });
});
