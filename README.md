# avijitsinha.com

This repository owns the public website for `avijitsinha.com`. The current React/Vite build is a minimal under-construction page served by nginx on Cloud Run behind the site's reverse proxy.

The approved direction adds two site-wide responsibilities here:

- a common account experience for services such as Music Training and Routine Dashboard; and
- the canonical public privacy, service-description and data-deletion pages.

Common sign-in provides identity only. Music Training does not require Calendar access. Routine Dashboard requests its separate read-only Calendar authorization only when a signed-in user explicitly connects that feature.

See the [common account and privacy plan](docs/common-account-and-privacy.md) for the architecture and execution order, and the [common account contract](docs/common-account-api.md) for the browser API, internal validation, sessions and persistence boundary. These documents are not deployment authorization, and no provisional policy text should be published as final.

The [local account service](account-service/README.md) now implements the identity-only Firebase exchange, restricted beta admission, opaque host-wide sessions, `/me`, current-session logout and its PostgreSQL schema. Internal service validation, the browser account UI, cloud resources and deployment remain separate steps.

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
