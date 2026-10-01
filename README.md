# avijitsinha.com

This repository owns the public website for `avijitsinha.com`. The React/Vite build is served by nginx on Cloud Run behind the site's reverse proxy. Its unauthenticated homepage describes the available Music Training application and limited-beta Routine Dashboard, and links to the live canonical policy at [`/privacy/`](https://avijitsinha.com/privacy/).

The approved direction adds two site-wide responsibilities here:

- a common account experience for services such as Music Training and Routine Dashboard; and
- the canonical public privacy, service-description and data-deletion pages.

Common sign-in provides identity only. Music Training does not require Calendar access. Routine Dashboard requests its separate read-only Calendar authorization only when a signed-in user explicitly connects that feature.

See the [common account and privacy plan](docs/common-account-and-privacy.md) for the architecture and execution order, and the [common account contract](docs/common-account-api.md) for the browser API, internal validation, sessions and persistence boundary. The public policy describes the current site, browser-local Music Training preferences, identity-only sign-in, optional read-only Calendar beta, Google Limited Use commitment, current retention boundaries and a manual deletion-request path. Automated account deletion remains a separate implementation milestone.

The [local account service](account-service/README.md) implements the `/account/` Firebase redirect UI, identity-only exchange, restricted beta admission, opaque host-wide sessions, `/me`, current-session logout, exact-audience internal validation, Dashboard-only provider-subject matching and its PostgreSQL schema. Its sign-in UI links to the same `/privacy/` policy. Music Training now consumes the common browser session locally without handling Firebase credentials or requesting Calendar access. Dedicated beta identities, empty regional secret containers and the Dashboard token-encryption key are provisioned and adopted by the sibling `avijitsinha-infra` Terraform repository. Review-only infrastructure pull request 3 has a validated five-addition plan for one protected beta SQL instance, two empty databases and CI read access; it is unmerged and not authorized for apply. Secret values, service revisions, routes and deployment remain separate reviewed steps.

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
