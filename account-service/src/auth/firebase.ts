import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export interface VerifiedGoogleIdentity {
  readonly firebaseUid: string;
  readonly googleProviderSubject: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly pictureUrl: string | null;
  readonly authenticatedAt: number;
}

export interface FirebaseTokenVerifier {
  verify(idToken: string, now: number): Promise<VerifiedGoogleIdentity>;
}

export interface FirebaseClaims {
  readonly aud?: unknown;
  readonly iss?: unknown;
  readonly sub?: unknown;
  readonly uid?: unknown;
  readonly exp?: unknown;
  readonly auth_time?: unknown;
  readonly email?: unknown;
  readonly name?: unknown;
  readonly picture?: unknown;
  readonly firebase?: unknown;
}

const MAX_RECENT_AUTH_AGE_MS = 10 * 60 * 1_000;
const CLOCK_SKEW_MS = 60 * 1_000;

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function requiredString(value: unknown, maximum: number, claim: string): string {
  const resolved = boundedString(value, maximum);
  if (resolved === null) throw new Error(`Firebase token has an invalid ${claim} claim`);
  return resolved;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null ? value as Readonly<Record<string, unknown>> : null;
}

export function validateFirebaseGoogleClaims(
  claims: FirebaseClaims,
  projectId: string,
  now: number,
): VerifiedGoogleIdentity {
  if (claims.aud !== projectId) throw new Error("Firebase token audience does not match this application");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Firebase token issuer does not match this application");
  }
  const uid = requiredString(claims.uid ?? claims.sub, 128, "subject");
  if (claims.sub !== undefined && claims.sub !== uid) throw new Error("Firebase token subject and UID do not match");
  if (typeof claims.exp !== "number" || claims.exp * 1_000 <= now - CLOCK_SKEW_MS) {
    throw new Error("Firebase token has expired");
  }
  if (typeof claims.auth_time !== "number") throw new Error("Firebase token has no authentication time");
  const authenticatedAt = claims.auth_time * 1_000;
  if (authenticatedAt > now + CLOCK_SKEW_MS || authenticatedAt < now - MAX_RECENT_AUTH_AGE_MS) {
    throw new Error("Firebase authentication is not recent");
  }

  const firebase = record(claims.firebase);
  if (firebase?.sign_in_provider !== "google.com") throw new Error("Firebase token was not issued from Google sign-in");
  const identities = record(firebase.identities);
  const googleIds = identities?.["google.com"];
  const googleProviderSubject = Array.isArray(googleIds)
    ? requiredString(googleIds[0], 255, "Google provider identity")
    : requiredString(googleIds, 255, "Google provider identity");

  return {
    firebaseUid: uid,
    googleProviderSubject,
    email: boundedString(claims.email, 320),
    displayName: boundedString(claims.name, 200),
    pictureUrl: boundedString(claims.picture, 2_048),
    authenticatedAt,
  };
}

export class FirebaseAdminTokenVerifier implements FirebaseTokenVerifier {
  readonly #projectId: string;
  readonly #app: App;

  constructor(projectId: string, app?: App) {
    this.#projectId = projectId;
    this.#app = app ?? getApps().find(candidate => candidate.name === "avijitsinha-account")
      ?? initializeApp({ credential: applicationDefault(), projectId }, "avijitsinha-account");
  }

  async verify(idToken: string, now: number): Promise<VerifiedGoogleIdentity> {
    const claims = await getAuth(this.#app).verifyIdToken(idToken, true);
    return validateFirebaseGoogleClaims(claims, this.#projectId, now);
  }
}
