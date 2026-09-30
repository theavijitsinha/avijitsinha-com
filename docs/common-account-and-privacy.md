# Common account and privacy plan

**Status: local common-account browser/session core implemented; internal service validation is next.** Music Training's credential logging has been removed. This plan covers the shared account for `avijitsinha.com`, service-specific authorization, and the public privacy surface. It does not authorize deployment, OAuth changes, cloud provisioning, or publication of provisional policy text.

## Outcomes

- Signing in on one production service signs the browser into the other services on `avijitsinha.com`.
- Common sign-in requests only basic Google identity through the existing Firebase project.
- Each service separately requests any additional access it needs, at the moment the user enables that feature.
- Music Training never requires or receives Google Calendar access.
- Routine Dashboard requests only read-only Calendar access after an explicit **Connect Google Calendar** action.
- A single public privacy policy covers the site account and contains a clearly labeled section for each service.
- Authentication is shared; authorization, credentials, data, and deletion behavior remain service-specific.

## Target boundary

```mermaid
flowchart LR
    B[Browser on avijitsinha.com] --> A[Site account service]
    A --> F[Firebase Google identity]
    A --> S[Opaque site session store]
    B --> M[Music Training]
    B --> D[Routine Dashboard]
    M --> A
    D --> A
    D --> C[Separate Calendar OAuth client]
    C --> G[Google Calendar read-only]
```

The account service owns identity verification, the site user identifier, session rotation, inactivity expiry, current-session logout and later all-session/account deletion orchestration. It issues a host-only `__Host-` cookie with `Secure`, `HttpOnly`, `SameSite=Lax` and `Path=/`. Production and beta use host-only cookies and separate backing configuration, so a session on `beta.avijitsinha.com` is not a production session.

The session token is random and opaque. Only its hash is stored. It expires after 30 consecutive days without authenticated use and rotates during active use; there is no fixed absolute logout for a regularly used session. Recent Google/Firebase authentication is still required for sensitive actions. State-changing routes require exact-origin and CSRF checks.

Service backends validate the common session through a narrow authenticated account-service contract. They receive only the stable internal site user identifier and minimal profile fields needed for the request. They never accept a browser-supplied user ID, email, Firebase UID, Google subject, or service tenant key as authority. For Calendar account binding, the dashboard submits Google's server-verified OAuth subject to an internal account-service comparison and receives only match/no-match; it does not receive the stored Firebase/provider subject. A service cannot use the common account contract to read another service's data or credentials.

The public reverse proxy must strip the site-session cookie before forwarding requests to a service that does not need it. Static clients read sign-in state through the account API rather than reading the `HttpOnly` cookie. Because all applications share one origin, an XSS flaw in any application is a site-wide risk; each application needs CSP, output safety, dependency review and CSRF defenses.

## Google authorization layout

Use one Google Cloud project and one Google Auth Platform brand/audience/privacy configuration, with distinct OAuth clients beneath it:

| Client | Purpose | Requested access |
|---|---|---|
| Firebase Google provider | Common site sign-in | Basic identity only |
| Routine Dashboard backend client | Optional Calendar connection | `openid` and `calendar.events.readonly` |
| Future Tasks client or reviewed incremental flow | Optional Tasks connection | `tasks.readonly` only when implemented |

The account service never receives Calendar or Tasks refresh tokens. Routine Dashboard owns its Calendar grant, encrypted token, normalized cache and disconnect flow. Disconnecting Calendar leaves the common site session active. Global sign-out invalidates the site session but does not silently revoke a service grant; account deletion must explicitly invoke every registered service's deletion workflow.

Beta and production use distinct OAuth clients, redirect URIs, secrets and data stores even when they remain in the same approved Cloud project. No client secret is placed in browser configuration, source, images, shell history or policy text.

## Public privacy structure

The canonical policy will be served without authentication at:

```text
https://avijitsinha.com/privacy/
```

The homepage footer, account UI and every service that handles signed-in data will link to that exact URL. The policy will have these sections:

1. site owner and contact channel;
2. common account and Google sign-in data;
3. Music Training data and browser-local preferences;
4. Routine Dashboard identity, preferences, Calendar authorization and cached event data;
5. infrastructure processing, security and operational logs;
6. service-specific retention and deletion;
7. sharing, sale, advertising and model-training exclusions;
8. Google API Services User Data Policy and Limited Use disclosure;
9. policy changes and effective date.

Google's [OAuth branding requirements](https://support.google.com/cloud/answer/15549049) require the homepage and consent screen to use the same discoverable privacy URL, while the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) requires accurate disclosure of access, use, storage and sharing. The Routine Dashboard section must say plainly that Calendar access is optional, read-only and not granted by common sign-in. A Music Training user does not grant Calendar access. Future services receive their own section before collecting data.

Do not publish placeholder promises. Final policy wording follows verified account deletion, active-data deletion, backup expiry, operational-log retention and contact decisions. Until those controls exist, the canonical policy URL must not be entered in production OAuth branding as though the policy were complete.

## Incremental execution plan

### A0 — Architecture and immediate safety

- [x] Approve the common-account/service-specific-authorization boundary.
- [x] Choose a site-wide policy with separate service sections.
- [x] Remove credential/token logging and the unused browser bearer-token helper from Music Training; verify its current sign-in build.
- [x] Freeze new app-specific login/session designs while the common contract is implemented.

### A1 — Common account contract

- [x] Specify public account endpoints, internal session validation, generic errors and profile minimization in [the account contract](common-account-api.md).
- [x] Specify the PostgreSQL user/session schema, 30-day inactivity, rotation, revocation and CSRF behavior.
- [x] Define service identity authentication and exact audiences for internal validation.
- [x] Add synthetic tests for fixation, replay, revocation and browser tenant-identifier spoofing.
- [ ] Add exact-audience internal OIDC tests for public callers and cross-service confusion.

### A2 — Local account service

- [x] Add a separately packaged account service owned by this repository.
- [x] Reuse Firebase Google sign-in for identity only and verify ID tokens server-side.
- [x] Issue the opaque host-wide session and implement `/me` and current-session logout.
- [ ] Implement exact-audience service authentication and internal session validation.
- [x] Keep beta admission restricted to the reviewed Firebase UID allowlist.

### A3 — Service integrations

- [ ] Replace Music Training's independent Firebase UI state with the common account API.
- [ ] Migrate Routine Dashboard from its app-specific session to common-session validation.
- [ ] Preserve Routine Dashboard's separate Calendar OAuth state, consent, token and cache boundary.
- [ ] Verify that a Music-only account has no Calendar connection or Calendar data rows.

### A4 — Lifecycle and privacy controls

- [ ] Implement global current-session and all-session logout.
- [ ] Implement service disconnect and global account deletion orchestration.
- [ ] Choose and test active-data, inactive-account, log and backup retention.
- [ ] Add the public service description, `/privacy/` and deletion instructions with matching in-product links.

### A5 — Reviewed beta rollout

- [ ] Reconcile existing Firebase/OAuth/cloud prerequisites with the common account design.
- [ ] Provision least-privilege identities, durable storage and secrets in separate reviewed batches.
- [ ] Deploy without a public route, then test the proxy, session validation and log redaction.
- [ ] Run two-account isolation and Music-only/Calendar-connected acceptance scenarios.

### A6 — Production readiness

- [ ] Complete applicable Google brand and sensitive-scope verification.
- [ ] Review all policy statements against observed production configuration.
- [ ] Deploy only after explicit authorization, monitoring, deletion and rollback checks.

## Migration constraints

The existing Routine Dashboard app-specific session is tested but not yet deployed. Reuse its opaque-token hashing, rotation, inactivity, CSRF, Firebase verification and tenant tests where appropriate; do not deploy it as a second competing login system. Preserve its restricted beta admission until the common account service provides an equivalent gate.

Music Training currently uses persistent client-side Firebase state and has no backend authorization boundary. Its former credential/identity logging and unused bearer helper have been removed, but its client state is not the common session design.

No phase silently broadens Google scopes, makes Calendar mandatory, shares service tokens, weakens tenant scoping, trusts proxy identity headers, or publishes unfinished privacy claims.
