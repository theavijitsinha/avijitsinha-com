# avijitsinha.com

This repository owns the public website for `avijitsinha.com`. The React/Vite build is served by nginx on Cloud Run behind the site's reverse proxy. Its unauthenticated homepage describes the available Music Training application and limited-access Routine Dashboard, and links to the live canonical policy at [`/privacy/`](https://avijitsinha.com/privacy/).

The approved direction adds two site-wide responsibilities here:

- a common account experience for services such as Music Training and Routine Dashboard; and
- the canonical public privacy, service-description and data-deletion pages.

Common sign-in provides identity only. Music Training does not require Calendar access. Routine Dashboard requests its separate read-only Calendar authorization only when a signed-in user explicitly connects that feature.

See the [common account and privacy plan](docs/common-account-and-privacy.md) for the architecture and execution order, and the [common account contract](docs/common-account-api.md) for the browser API, internal validation, sessions and persistence boundary. The public policy describes the current site, browser-local Music Training preferences, identity-only sign-in, optional read-only Calendar access, Google Limited Use commitment, current retention boundaries and a manual deletion-request path. Automated account deletion remains a separate implementation milestone.

The [account service](account-service/README.md) implements the `/account/` Firebase redirect UI, identity-only exchange, restricted admission, opaque host-wide sessions, `/me`, current-session logout, exact-audience internal validation, Dashboard-only provider-subject matching and its PostgreSQL schema. Its sign-in UI links to the same `/privacy/` policy. Music Training consumes the common browser session without handling Firebase credentials or requesting Calendar access. The production account and Dashboard services now run behind the `avijitsinha.com` reverse proxy with separate least-privilege identities, databases, roles, secrets and keys on the single shared Cloud SQL instance. The legacy beta resources remain unchanged until a separately reviewed cleanup. Routine Dashboard's Calendar connection remains unavailable until its dedicated OAuth client secret is installed and the reviewed sync scheduler is enabled.

## Local development

```sh
npm ci
npm run dev
```

Verify changes with:

```sh
npm run lint
npm run build
```
