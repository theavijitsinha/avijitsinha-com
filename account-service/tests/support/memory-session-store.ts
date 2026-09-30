import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { VerifiedGoogleIdentity } from "../../src/auth/firebase.js";
import type {
  AccountSessionStore,
  CreatedSession,
  ResolvedSession,
} from "../../src/auth/session-store.js";

interface ChallengeRecord {
  readonly hash: string;
  readonly returnPath: string;
  readonly expiresAt: number;
  consumedAt: number | null;
}

interface UserRecord {
  readonly id: string;
  readonly firebaseUid: string;
  readonly googleProviderSubject: string;
  email: string | null;
  displayName: string | null;
  pictureUrl: string | null;
}

interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  tokenHash: string;
  csrfHash: string;
  previousTokenHash: string | null;
  previousTokenValidUntil: number | null;
  readonly createdAt: number;
  lastSeenAt: number;
  readonly lastAuthenticatedAt: number;
  rotatedAt: number;
  idleExpiresAt: number;
  revokedAt: number | null;
}

const DAY = 24 * 60 * 60 * 1_000;

function token(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class MemoryAccountSessionStore implements AccountSessionStore {
  readonly #challenges = new Map<string, ChallengeRecord>();
  readonly #users = new Map<string, UserRecord>();
  readonly #sessions = new Map<string, SessionRecord>();

  get userCount(): number {
    return this.#users.size;
  }

  get sessionCount(): number {
    return this.#sessions.size;
  }

  storedHashes(): readonly string[] {
    return [
      ...[...this.#challenges.values()].map(value => value.hash),
      ...[...this.#sessions.values()].flatMap(value => [
        value.tokenHash,
        value.csrfHash,
        ...(value.previousTokenHash === null ? [] : [value.previousTokenHash]),
      ]),
    ];
  }

  async issueLoginChallenge(returnPath: string, now: number): Promise<string> {
    const value = token();
    const valueHash = hash(value);
    this.#challenges.set(valueHash, {
      hash: valueHash,
      returnPath,
      expiresAt: now + 10 * 60 * 1_000,
      consumedAt: null,
    });
    return value;
  }

  async consumeLoginChallenge(value: string, now: number): Promise<string | null> {
    const challenge = this.#challenges.get(hash(value));
    if (challenge === undefined || challenge.consumedAt !== null || challenge.expiresAt <= now) return null;
    challenge.consumedAt = now;
    return challenge.returnPath;
  }

  async create(
    identity: VerifiedGoogleIdentity,
    previousBrowserToken: string | null,
    now: number,
  ): Promise<CreatedSession> {
    let user = this.#users.get(identity.firebaseUid);
    const providerOwner = [...this.#users.values()].find(
      candidate => candidate.googleProviderSubject === identity.googleProviderSubject,
    );
    if (providerOwner !== undefined && providerOwner.firebaseUid !== identity.firebaseUid) {
      throw new Error("Google provider identity is already bound");
    }
    if (user === undefined) {
      user = {
        id: randomUUID(),
        firebaseUid: identity.firebaseUid,
        googleProviderSubject: identity.googleProviderSubject,
        email: identity.email,
        displayName: identity.displayName,
        pictureUrl: identity.pictureUrl,
      };
      this.#users.set(identity.firebaseUid, user);
    } else {
      if (user.googleProviderSubject !== identity.googleProviderSubject) {
        throw new Error("Firebase identity changed Google provider subject");
      }
      user.email = identity.email;
      user.displayName = identity.displayName;
      user.pictureUrl = identity.pictureUrl;
    }

    if (previousBrowserToken !== null) {
      const previousHash = hash(previousBrowserToken);
      for (const session of this.#sessions.values()) {
        if (
          session.revokedAt === null
          && (session.tokenHash === previousHash
            || (session.previousTokenHash === previousHash
              && (session.previousTokenValidUntil ?? 0) > now))
        ) {
          session.revokedAt = now;
        }
      }
    }

    const sessionToken = token();
    const csrfToken = token();
    const session: SessionRecord = {
      id: randomUUID(),
      userId: user.id,
      tokenHash: hash(sessionToken),
      csrfHash: hash(csrfToken),
      previousTokenHash: null,
      previousTokenValidUntil: null,
      createdAt: now,
      lastSeenAt: now,
      lastAuthenticatedAt: identity.authenticatedAt,
      rotatedAt: now,
      idleExpiresAt: now + 30 * DAY,
      revokedAt: null,
    };
    this.#sessions.set(session.id, session);
    return { token: sessionToken, csrfToken };
  }

  async resolve(
    tokenValue: string,
    csrfToken: string | null,
    requireCsrf: boolean,
    now: number,
    allowRotation = true,
  ): Promise<ResolvedSession | null> {
    const tokenHash = hash(tokenValue);
    const session = [...this.#sessions.values()].find(candidate => (
      candidate.revokedAt === null
      && candidate.idleExpiresAt > now
      && (candidate.tokenHash === tokenHash
        || (candidate.previousTokenHash === tokenHash
          && (candidate.previousTokenValidUntil ?? 0) > now))
      && (!requireCsrf || (csrfToken !== null && candidate.csrfHash === hash(csrfToken)))
    ));
    if (session === undefined) return null;

    const matchedPrevious = session.previousTokenHash === tokenHash;
    if (session.lastSeenAt <= now - 60 * 60 * 1_000) {
      session.lastSeenAt = now;
      session.idleExpiresAt = now + 30 * DAY;
    }

    let replacementToken: string | null = null;
    let replacementCsrfToken: string | null = null;
    if (allowRotation && !matchedPrevious && session.rotatedAt <= now - 7 * DAY) {
      replacementToken = token();
      replacementCsrfToken = token();
      session.previousTokenHash = session.tokenHash;
      session.previousTokenValidUntil = now + 5 * 60 * 1_000;
      session.tokenHash = hash(replacementToken);
      session.csrfHash = hash(replacementCsrfToken);
      session.rotatedAt = now;
    }

    const user = [...this.#users.values()].find(candidate => candidate.id === session.userId)!;
    return {
      id: session.id,
      userId: session.userId,
      email: user.email,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      lastAuthenticatedAt: session.lastAuthenticatedAt,
      idleExpiresAt: session.idleExpiresAt,
      replacementToken,
      replacementCsrfToken,
    };
  }

  async revoke(tokenValue: string, csrfToken: string, now: number): Promise<boolean> {
    const tokenHash = hash(tokenValue);
    const csrfHash = hash(csrfToken);
    const session = [...this.#sessions.values()].find(candidate => (
      candidate.revokedAt === null
      && candidate.csrfHash === csrfHash
      && (candidate.tokenHash === tokenHash
        || (candidate.previousTokenHash === tokenHash
          && (candidate.previousTokenValidUntil ?? 0) > now))
    ));
    if (session === undefined) return false;
    session.revokedAt = now;
    return true;
  }

  async matchesGoogleSubject(userId: string, googleSubject: string): Promise<boolean> {
    return [...this.#users.values()].some(user => (
      user.id === userId && user.googleProviderSubject === googleSubject
    ));
  }
}
