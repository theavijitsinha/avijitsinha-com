# Common account service

This separately deployable service owns the common `avijitsinha.com` user and browser-session boundary. The current local slice implements identity-only Firebase token exchange, restricted beta admission, opaque host-wide sessions, `/me`, logout, authenticated internal session validation, Dashboard-only provider-subject matching and PostgreSQL migrations. It does not request Calendar or Tasks access and is not deployed.

## Verify locally

```sh
npm ci
npm run check
```

The credential-free tests use an in-memory store and synthetic Firebase/OIDC claims. They do not contact Firebase, Google or PostgreSQL. Production startup requires explicit Firebase, origin, admission, internal audience, Dashboard service-account and database configuration; it fails closed when any required value is absent.

Internal routes accept only Google-signed OIDC tokens for the exact configured audience and allowlisted service account. Routine Dashboard is currently the only registered caller. Internal validation does not rotate browser cookies; each browser application must call `/api/account/me` during initialization so active sessions receive their periodic cookie rotation.

## Runtime configuration

The web process requires `ACCOUNT_DATABASE_URL`, the four `ACCOUNT_FIREBASE_*` browser values, `ACCOUNT_ALLOWED_FIREBASE_UIDS`, `ACCOUNT_ALLOWED_ORIGINS`, `ACCOUNT_ALLOWED_RETURN_PATHS`, `ACCOUNT_INTERNAL_AUDIENCE` and `ACCOUNT_DASHBOARD_SERVICE_ACCOUNT_EMAIL`. Comma-separated values are parsed as exact entries. `PORT` defaults to `8080`. Production and beta must supply separate reviewed values and backing databases.

Run the PostgreSQL migration/session integration test against a disposable server whose configured login can create and drop databases:

```sh
TEST_ACCOUNT_POSTGRES_URL=postgresql://... npm run test:postgres
```

Apply migrations with a separate database owner connection:

```sh
ACCOUNT_MIGRATION_DATABASE_URL=postgresql://... npm run migrate
```

The runtime role must receive only `USAGE` on the `account_service` schema and `EXECUTE` on its seven API functions. It must not own or receive direct access to the account tables. Cloud identities, role grants, secrets and deployment are intentionally deferred to a reviewed infrastructure step.
