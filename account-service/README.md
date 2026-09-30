# Common account service

This separately deployable service owns the common `avijitsinha.com` user and browser-session boundary. The current local slice implements identity-only Firebase token exchange, restricted beta admission, opaque host-wide sessions, `/me`, logout and PostgreSQL migrations. It does not request Calendar or Tasks access and is not deployed.

## Verify locally

```sh
npm ci
npm run check
```

The credential-free tests use an in-memory store and synthetic Firebase claims. They do not contact Firebase, Google or PostgreSQL. Production startup requires explicit Firebase, origin, admission and database configuration; it fails closed when any required value is absent.

Run the PostgreSQL migration/session integration test against a disposable server whose configured login can create and drop databases:

```sh
TEST_ACCOUNT_POSTGRES_URL=postgresql://... npm run test:postgres
```

Apply migrations with a separate database owner connection:

```sh
ACCOUNT_MIGRATION_DATABASE_URL=postgresql://... npm run migrate
```

The runtime role must receive only `USAGE` on the `account_service` schema and `EXECUTE` on its six API functions. It must not own or receive direct access to the account tables. Cloud identities, role grants, secrets and deployment are intentionally deferred to a reviewed infrastructure step.
