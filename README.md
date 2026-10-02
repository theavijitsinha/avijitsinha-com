# avijitsinha.com

This repository owns the public website for `avijitsinha.com`. The React/Vite build is served by nginx on Cloud Run behind the site's reverse proxy. Its unauthenticated homepage describes the available Music Training application and limited-access Routine Dashboard, and links to the live canonical policy at [`/privacy/`](https://avijitsinha.com/privacy/).

The approved direction adds two site-wide responsibilities here:

- a common account experience for services such as Music Training and Routine Dashboard; and
- the canonical public privacy, service-description and data-deletion pages.

Common sign-in provides identity only. Music Training does not require Calendar access. Routine Dashboard requests its separate read-only Calendar authorization only when a signed-in user explicitly connects that feature.

See the [common account and privacy plan](docs/common-account-and-privacy.md) for the architecture and execution order, and the [common account contract](docs/common-account-api.md) for the browser API, internal validation, sessions and persistence boundary. The public policy describes the current site, browser-local Music Training preferences, identity-only sign-in, optional read-only Calendar access, Google Limited Use commitment, current retention boundaries and a manual deletion-request path. Automated account deletion remains a separate implementation milestone.

The [local account service](account-service/README.md) implements the `/account/` Firebase redirect UI, identity-only exchange, restricted admission, opaque host-wide sessions, `/me`, current-session logout, exact-audience internal validation, Dashboard-only provider-subject matching and its PostgreSQL schema. Its sign-in UI links to the same `/privacy/` policy. Music Training now consumes the common browser session locally without handling Firebase credentials or requesting Calendar access. A fully verified beta-named database foundation exists on the protected shared Cloud SQL instance, but it is no longer the deployment target. The approved rollout now uses only `avijitsinha.com` and will create production-specific identities, databases, roles, secrets and keys on that same single instance before privately deploying the runtime services. The legacy beta resources remain unchanged until a separately reviewed cleanup.

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
