import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VerifiedGoogleIdentity } from "../src/auth/firebase.js";
import { PostgresAccountSessionStore } from "../src/auth/session-store.js";
import { applyMigrations } from "../src/storage/migrations.js";

const rootUrl = process.env.TEST_ACCOUNT_POSTGRES_URL;
const postgresDescribe = rootUrl ? describe : describe.skip;
const DAY = 24 * 60 * 60 * 1_000;

function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error("Unsafe test identifier");
  return `"${value}"`;
}

postgresDescribe("PostgreSQL account persistence", () => {
  const databaseName = `account_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let rootPool: Pool;
  let pool: Pool;
  let store: PostgresAccountSessionStore;

  beforeAll(async () => {
    rootPool = new Pool({ connectionString: rootUrl, max: 1 });
    await rootPool.query(`CREATE DATABASE ${identifier(databaseName)}`);
    const databaseUrl = new URL(rootUrl!);
    databaseUrl.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: databaseUrl.toString(), max: 2 });
    await applyMigrations(pool);
    store = new PostgresAccountSessionStore(pool);
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    if (rootPool) {
      await rootPool.query(`DROP DATABASE IF EXISTS ${identifier(databaseName)}`);
      await rootPool.end();
    }
  });

  it("applies a repeatable schema with account-owned tables", async () => {
    await applyMigrations(pool);
    const migrations = await pool.query<{ count: number }>(
      "SELECT count(*)::INTEGER AS count FROM account_schema_migrations",
    );
    expect(migrations.rows).toEqual([{ count: 2 }]);
    const tables = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'account_service'
      ORDER BY table_name
    `);
    expect(tables.rows.map(row => row.table_name)).toEqual([
      "login_challenges",
      "site_sessions",
      "site_users",
    ]);
  });

  it("persists single-use challenges and opaque session hashes", async () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    const challenge = await store.issueLoginChallenge("/routine/dashboard/", now);
    expect(await store.consumeLoginChallenge(challenge, now + 1_000)).toBe("/routine/dashboard/");
    expect(await store.consumeLoginChallenge(challenge, now + 2_000)).toBeNull();
    const persistedChallenge = await pool.query<{ token_hash: Buffer }>(
      "SELECT token_hash FROM account_service.login_challenges",
    );
    expect(persistedChallenge.rows[0]?.token_hash).toHaveLength(32);
    expect(persistedChallenge.rows[0]?.token_hash.toString("utf8")).not.toContain(challenge);

    const createdAt = now - 7 * DAY;
    const identity: VerifiedGoogleIdentity = {
      firebaseUid: "firebase-postgres-user",
      googleProviderSubject: "google-postgres-user",
      email: "postgres@example.test",
      displayName: "Postgres Test",
      pictureUrl: null,
      authenticatedAt: createdAt - 30_000,
    };
    const created = await store.create(identity, null, createdAt);
    const persistedSession = await pool.query<{ token_hash: Buffer; csrf_token_hash: Buffer }>(
      "SELECT token_hash, csrf_token_hash FROM account_service.site_sessions",
    );
    expect(persistedSession.rows[0]?.token_hash).toHaveLength(32);
    expect(persistedSession.rows[0]?.csrf_token_hash).toHaveLength(32);
    expect(persistedSession.rows[0]?.token_hash.toString("utf8")).not.toContain(created.token);
    expect(persistedSession.rows[0]?.csrf_token_hash.toString("utf8")).not.toContain(created.csrfToken);

    const rotated = await store.resolve(created.token, created.csrfToken, true, now);
    expect(rotated?.replacementToken).toBeTruthy();
    expect(rotated?.replacementCsrfToken).toBeTruthy();
    expect(await store.matchesGoogleSubject(rotated!.userId, identity.googleProviderSubject)).toBe(true);
    expect(await store.matchesGoogleSubject(rotated!.userId, "different-google-user")).toBe(false);
    expect(await store.resolve(created.token, null, false, now + 4 * 60 * 1_000)).not.toBeNull();
    expect(await store.resolve(created.token, created.csrfToken, true, now + 4 * 60 * 1_000)).toBeNull();
    expect(await store.resolve(created.token, null, false, now + 5 * 60 * 1_000)).toBeNull();
    expect(await store.revoke(
      rotated!.replacementToken!,
      rotated!.replacementCsrfToken!,
      now + 5 * 60 * 1_000,
    )).toBe(true);
    expect(await store.resolve(rotated!.replacementToken!, null, false, now + 5 * 60 * 1_000 + 1)).toBeNull();
  });

  it("expires inactive sessions and prevents provider-subject reassignment", async () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    const identity: VerifiedGoogleIdentity = {
      firebaseUid: "firebase-expiring-user",
      googleProviderSubject: "google-expiring-user",
      email: null,
      displayName: null,
      pictureUrl: null,
      authenticatedAt: now,
    };
    const session = await store.create(identity, null, now);
    expect(await store.resolve(session.token, null, false, now + 30 * DAY)).toBeNull();
    await expect(store.create({
      ...identity,
      firebaseUid: "different-firebase-user",
    }, null, now + 1_000)).rejects.toMatchObject({ code: "23505" });
    await expect(store.create({
      ...identity,
      googleProviderSubject: "different-google-user",
    }, null, now + 2_000)).rejects.toMatchObject({ code: "23000" });
  });
});
