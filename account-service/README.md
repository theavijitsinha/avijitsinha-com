# Common account service

This separately deployable service owns the common `avijitsinha.com` user and browser-session boundary. The current local slice implements the `/account/` Firebase redirect UI, identity-only token exchange, restricted admission, opaque host-wide sessions, `/me`, logout, authenticated internal session validation, Dashboard-only provider-subject matching and PostgreSQL migrations. It does not request Calendar or Tasks access and is not deployed.

## Verify locally

```sh
npm ci
npm run check
```

The credential-free suite currently passes 38 tests, with eight live-PostgreSQL cases skipped unless their disposable-database credential is supplied. The tests use an in-memory store and synthetic Firebase/OIDC claims. They cover account-page initialization, redirect exchange, server-normalized continuation, logout, generic failures, migration configuration and static security headers without contacting Firebase, Google or PostgreSQL. The production dependency audit reports zero known vulnerabilities; an npm override keeps Firebase's unused bundled Firestore gRPC dependency on its patched compatible 1.x release. Production startup requires explicit Firebase, origin, admission, internal audience, Dashboard service-account and database configuration; it fails closed when any required value is absent.

Internal routes accept only Google-signed OIDC tokens for the exact configured audience and allowlisted service account. Routine Dashboard is currently the only registered caller. Internal validation does not rotate browser cookies; each browser application must call `/api/account/me` during initialization so active sessions receive their periodic cookie rotation.

The UI stores only the public Firebase configuration, server-normalized return path and one-time login challenge in tab-scoped session storage across the redirect. The Firebase ID token remains memory-only, is exchanged once, and Firebase client state is cleared immediately. Profile values are inserted as text rather than HTML. The packaged route sets a restrictive CSP and anti-framing, referrer, MIME-sniffing and permissions headers.

Music Training initializes its common session with `/api/account/me` and uses the exact return path `/music/training/intervals`. Include that path in `ACCOUNT_ALLOWED_RETURN_PATHS` for environments that expose Music Training.

## Runtime configuration

The web process requires `ACCOUNT_DATABASE_URL`, the four `ACCOUNT_FIREBASE_*` browser values, `ACCOUNT_ALLOWED_FIREBASE_UIDS`, `ACCOUNT_ALLOWED_ORIGINS`, `ACCOUNT_ALLOWED_RETURN_PATHS`, `ACCOUNT_INTERNAL_AUDIENCE` and `ACCOUNT_DASHBOARD_SERVICE_ACCOUNT_EMAIL`. Comma-separated values are parsed as exact entries. `ACCOUNT_POSTGRES_POOL_MAX` defaults to and cannot exceed `4`, preserving capacity for Dashboard, migration and administrative connections on the shared Cloud SQL instance. `PORT` defaults to `8080`. The only rollout target is production at `avijitsinha.com`; production must receive its own reviewed values and backing database rather than reusing the beta-named foundation.

Run the PostgreSQL migration/session integration test against a disposable server whose configured login can create and drop databases:

```sh
TEST_ACCOUNT_POSTGRES_URL=postgresql://... npm run test:postgres
```

Apply migrations with the separate database-owner connection and the pre-provisioned runtime login name:

```sh
ACCOUNT_MIGRATION_DATABASE_URL=postgresql://... \
ACCOUNT_POSTGRES_RUNTIME_LOGIN=avijitsinha_account_beta_runtime \
npm run migrate
```

An administrator must create both logins before this command runs. The migration login owns the account database but is `NOINHERIT`, non-superuser, non-`CREATEDB`, non-`CREATEROLE`, non-replicating, non-RLS-bypass and has no parent role. The runtime login has the same restrictions, does not own the database and has no parent role. The command validates those facts before any schema change; it never creates or alters cluster-wide roles.

After checksum-verified migrations succeed, the command removes public access and grants runtime only `USAGE` on the private `account_service` schema plus `EXECUTE` on its seven API functions. Runtime receives no direct table, sequence, public-schema or migration-table access. Eight PostgreSQL 17 integration cases verify the session schema plus fresh/repeated migration, exact function grants, direct-table denial, wrong-owner rejection, migration/runtime elevation rejection and failed-migration behavior.

The keyless beta runtime identity and shared migration identity exist with the shared Cloud SQL instance and `avijitsinha_account_beta` database. Restricted `NOINHERIT` migration/runtime logins and one enabled version of each database URL secret are bootstrapped. A protected Cloud Run job pins the reviewed account image by digest, receives only the migration URL and runtime-login name, and has completed both the initial migration and an idempotent rerun. A separate audit verified exact ownership, the seven function grants, direct-table denial and cross-database denial. This beta-named foundation is retained as verified migration evidence but is no longer the deployment target. Production-specific resources on the same SQL instance are pending. Firebase now contains one real admitted-account candidate, but the two-UID production allowlist is not written until both real identities exist. No account runtime service or route exists yet.
