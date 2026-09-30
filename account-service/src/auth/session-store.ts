import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { VerifiedGoogleIdentity } from "./firebase.js";

export interface CreatedSession {
  readonly token: string;
  readonly csrfToken: string;
}

export interface ResolvedSession {
  readonly id: string;
  readonly userId: string;
  readonly email: string | null;
  readonly displayName: string | null;
  readonly pictureUrl: string | null;
  readonly lastAuthenticatedAt: number;
  readonly idleExpiresAt: number;
  readonly replacementToken: string | null;
  readonly replacementCsrfToken: string | null;
}

export interface AccountSessionStore {
  issueLoginChallenge(returnPath: string, now: number): Promise<string>;
  consumeLoginChallenge(token: string, now: number): Promise<string | null>;
  create(identity: VerifiedGoogleIdentity, previousBrowserToken: string | null, now: number): Promise<CreatedSession>;
  resolve(
    token: string,
    csrfToken: string | null,
    requireCsrf: boolean,
    now: number,
    allowRotation?: boolean,
  ): Promise<ResolvedSession | null>;
  revoke(token: string, csrfToken: string, now: number): Promise<boolean>;
  matchesGoogleSubject(userId: string, googleSubject: string): Promise<boolean>;
}

interface SessionRow {
  readonly session_id: string;
  readonly user_id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly picture_url: string | null;
  readonly rotated_at: Date;
  readonly last_authenticated_at: Date;
  readonly idle_expires_at: Date;
  readonly matched_previous_token: boolean;
}

const ROTATION_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function token(): string {
  return randomBytes(32).toString("base64url");
}

function hash(value: string | null): Buffer | null {
  return value === null ? null : createHash("sha256").update(value).digest();
}

export class PostgresAccountSessionStore implements AccountSessionStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async #transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    let discard = false;
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  async issueLoginChallenge(returnPath: string, now: number): Promise<string> {
    const challenge = token();
    await this.#transaction(client => client.query(
      "SELECT account_service.issue_login_challenge($1, $2, $3)",
      [hash(challenge), returnPath, new Date(now)],
    ));
    return challenge;
  }

  async consumeLoginChallenge(challenge: string, now: number): Promise<string | null> {
    return this.#transaction(async client => {
      const result = await client.query<{ return_path: string }>(
        "SELECT return_path FROM account_service.consume_login_challenge($1, $2)",
        [hash(challenge), new Date(now)],
      );
      return result.rows[0]?.return_path ?? null;
    });
  }

  async create(identity: VerifiedGoogleIdentity, previousBrowserToken: string | null, now: number): Promise<CreatedSession> {
    const sessionToken = token();
    const csrfToken = token();
    await this.#transaction(client => client.query(`
      SELECT user_id FROM account_service.create_session(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
    `, [
      identity.firebaseUid,
      identity.googleProviderSubject,
      identity.email,
      identity.displayName,
      identity.pictureUrl,
      randomUUID(),
      hash(sessionToken),
      hash(csrfToken),
      new Date(identity.authenticatedAt),
      new Date(now),
      hash(previousBrowserToken),
    ]));
    return { token: sessionToken, csrfToken };
  }

  async resolve(
    tokenValue: string,
    csrfToken: string | null,
    requireCsrf: boolean,
    now: number,
    allowRotation = true,
  ): Promise<ResolvedSession | null> {
    const currentHash = hash(tokenValue)!;
    return this.#transaction(async client => {
      const result = await client.query<SessionRow>(`
        SELECT * FROM account_service.resolve_session($1, $2, $3, $4)
      `, [currentHash, hash(csrfToken), new Date(now), requireCsrf]);
      const row = result.rows[0];
      if (row === undefined) return null;

      let replacementToken: string | null = null;
      let replacementCsrfToken: string | null = null;
      if (allowRotation && !row.matched_previous_token && row.rotated_at.getTime() <= now - ROTATION_AGE_MS) {
        const candidateToken = token();
        const candidateCsrf = token();
        const rotated = await client.query<{ rotated: boolean }>(`
          SELECT account_service.rotate_session($1, $2, $3, $4, $5) AS rotated
        `, [row.session_id, currentHash, hash(candidateToken), hash(candidateCsrf), new Date(now)]);
        if (rotated.rows[0]?.rotated === true) {
          replacementToken = candidateToken;
          replacementCsrfToken = candidateCsrf;
        }
      }

      return {
        id: row.session_id,
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        pictureUrl: row.picture_url,
        lastAuthenticatedAt: row.last_authenticated_at.getTime(),
        idleExpiresAt: row.idle_expires_at.getTime(),
        replacementToken,
        replacementCsrfToken,
      };
    });
  }

  async revoke(tokenValue: string, csrfToken: string, now: number): Promise<boolean> {
    return this.#transaction(async client => {
      const result = await client.query<{ revoked: boolean }>(`
        SELECT account_service.revoke_session($1, $2, $3) AS revoked
      `, [hash(tokenValue), hash(csrfToken), new Date(now)]);
      return result.rows[0]?.revoked === true;
    });
  }

  async matchesGoogleSubject(userId: string, googleSubject: string): Promise<boolean> {
    return this.#transaction(async client => {
      const result = await client.query<{ matches: boolean }>(`
        SELECT account_service.google_subject_matches($1, $2) AS matches
      `, [userId, googleSubject]);
      return result.rows[0]?.matches === true;
    });
  }
}
