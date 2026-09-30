# Common account contract

**Status: browser UI, browser-session API, internal service API, Music Training integration and Routine Dashboard integration are implemented and verified locally; deployment is not implemented.** The separately packaged account service implements `/account/`, the first four browser endpoints, Firebase claim validation, restricted admission, opaque sessions, exact-audience service authentication, recent-auth enforcement, match-only provider binding and the PostgreSQL schema. This contract is not authorization to provision infrastructure or change OAuth configuration.

## Route ownership

The account service is separately deployable but owned by this repository. The public reverse proxy exposes its browser routes on both production and beta hosts:

```text
/account/
/api/account/
```

The proxy must reject `/internal/account/` publicly. Service backends call the account service's internal Cloud Run URL directly and authenticate as their dedicated service accounts.

Production and beta use different session stores, secrets, service accounts and host-only cookies. A beta session never authenticates production.

## Browser API

All responses use `Cache-Control: no-store`. Error bodies contain a stable code and generic message, never an identity, token, provider response or database detail.

| Method and path | Authentication | Purpose |
|---|---|---|
| `GET /api/account/config` | Public | Return reviewed Firebase browser configuration and create one ten-minute login challenge |
| `POST /api/account/session` | Firebase ID token + login challenge + exact origin | Verify a recent Google-backed Firebase identity, enforce beta admission, rotate any current session and set site cookies |
| `GET /api/account/me` | Site session | Return the current user's display name, email and picture plus safe session metadata; return no internal/provider identifier |
| `POST /api/account/logout` | Site session + CSRF + exact origin | Revoke the current session and clear its cookies |
| `POST /api/account/logout-all` | Site session + CSRF + recent Firebase authentication | Revoke every site session for the current user |
| `GET /api/account/data` | Site session | Explain common-account data and registered service deletion controls without returning credentials |
| `DELETE /api/account` | Site session + CSRF + recent authentication + explicit confirmation | Start verified deletion across the account and every registered service |

The first four endpoints are implemented locally. Logout-all, data inventory and account deletion remain unavailable until their complete behavior and failure recovery are implemented.

The sign-in page accepts a return destination only from a server-owned allowlist of exact local application paths. The normalized destination is stored with the single-use login challenge; the callback never redirects to a browser-supplied absolute URL.

The implemented page calls `/me` before rendering account state so active sessions receive rotation, uses tab-scoped session storage only for the public Firebase configuration and one-time challenge across redirect, keeps the Firebase ID token in memory, exchanges it once, signs out of Firebase immediately and follows only the server-returned normalized path. Common sign-in requests no Calendar or Tasks scope.

Music Training also calls `/me` at initialization, accepts only the minimal validated browser profile, and uses the exact allowlisted return path `/music/training/intervals`. Its sign-in control navigates to `/account/`; its sign-out control echoes the host CSRF cookie only to the common logout endpoint. The static application contains no Firebase SDK, provider configuration, credential handling or Calendar/Tasks integration.

## Cookies and CSRF

| Cookie | Attributes | Purpose |
|---|---|---|
| `__Host-avijit_session` | `Secure; HttpOnly; SameSite=Lax; Path=/`, no `Domain` | Random opaque site-session token |
| `__Host-avijit_csrf` | `Secure; SameSite=Lax; Path=/`, no `Domain` | Random double-submit value bound by hash to the session; readable only so clients can echo it in a header |
| `__Host-avijit_login` | `Secure; HttpOnly; SameSite=Lax; Path=/`, no `Domain` | One-time pre-session login challenge paired with the response-body value |

Session and CSRF values each contain at least 256 bits of randomness. PostgreSQL stores only SHA-256 hashes. Login consumes its challenge atomically before identity persistence, including on admission denial. Successful login rotates an existing browser session to prevent fixation.

Active sessions rotate after seven days. The prior hash remains valid for at most five minutes for concurrent requests. Last use and the rolling expiry update at most hourly; 30 consecutive inactive days expire a session, with no absolute cutoff while authenticated use continues. Rotation also replaces the CSRF value.

Every mutation requires the session, an exact allowed `Origin`, the CSRF cookie and the identical value in `X-CSRF-Token`. `SameSite` is defense in depth, not the only CSRF control. Login additionally requires a Firebase `auth_time` no more than ten minutes old; sensitive lifecycle operations require a fresh proof rather than trusting an old site session.

The browser sends a `Path=/` cookie on requests throughout the host. The reverse proxy strips `Cookie` entirely before forwarding to static homepage or Music Training upstreams, which read account state from `/api/account/me`. It preserves the cookie only for the account service and dynamic services that validate it. Application logs and nginx access logs never record cookie or CSRF headers.

## Internal service API

**Implemented and consumed locally by Routine Dashboard.** Dashboard has removed its Firebase client/Admin dependencies and app-specific login/session routes. Music Training continues to use only the browser API.

Internal requests use the service's dedicated Google-signed OIDC identity token in `Authorization: Bearer ...`. The account service verifies signature, issuer, expiry, exact configured audience, verified email and an exact allowlist of service accounts. It does not trust `X-Forwarded-*`, caller-supplied service names or public proxy headers as service identity.

The initial contract has two operations:

| Method and path | Caller | Purpose |
|---|---|---|
| `POST /internal/account/sessions:authorize` | Registered dynamic service | Validate the forwarded site-session cookie and, for a mutation, the original method/origin/CSRF tuple |
| `POST /internal/account/google-subjects:matches` | Routine Dashboard only | Compare Google's server-verified Calendar OAuth subject with the signed-in account and return only match/no-match |

`sessions:authorize` receives the original site cookie in `Cookie`. Its JSON body is bounded and contains only:

```json
{
  "method": "GET",
  "origin": null,
  "csrfToken": null,
  "requireRecentAuthentication": false
}
```

For safe methods, `origin` and `csrfToken` are `null` and recent authentication cannot be requested. For mutations, the calling service forwards the browser's exact method, `Origin` and `X-CSRF-Token`; the account service validates all three. A sensitive mutation such as starting a new Calendar grant sets `requireRecentAuthentication` to `true`; the account service enforces the ten-minute window without returning an authentication timestamp. The caller is trusted only for this forwarding after its service identity passes. The response is:

```json
{
  "siteUserId": "00000000-0000-0000-0000-000000000000"
}
```

The opaque internal UUID is never returned by the browser API. Internal validation returns no email, Firebase UID, provider subject, token hash or authorization grant. A caller maps `siteUserId` to its own tenant record and still enforces its own authorization and row isolation.

Internal validation refreshes inactivity but deliberately does not rotate browser cookies, because a backend response cannot replace the browser's host-only cookie safely. Each browser application must call `/api/account/me` during initialization; that browser endpoint performs periodic joint session/CSRF rotation and resets cookie lifetime.

For `google-subjects:matches`, Routine Dashboard first verifies the Calendar ID token's signature, issuer, expiry, nonce and exact client audience. It sends only the resulting `sub` over the authenticated internal channel together with the site session. The account service returns `{ "matches": true }` or `{ "matches": false }`; neither side logs the subject. No other service may call this operation.

Unknown, expired or revoked sessions receive generic `401`. A valid session with invalid origin/CSRF or a caller not permitted for the operation receives generic `403`. The response never distinguishes a missing user, mismatched provider subject or denied beta identity.

## Persistence ownership

Migration `account-service/migrations/001_account_sessions.sql` implements the first three PostgreSQL records below in the private `account_service` schema. `service_deletion_jobs` remains deferred until deletion orchestration is implemented.

| Record | Minimum fields and constraints |
|---|---|
| `site_users` | Internal UUID; unique Firebase UID; unique Google provider subject; mutable email/name/picture; created/updated timestamps |
| `site_sessions` | User ID; current/prior token hashes; CSRF hash; Firebase authentication time; created, rotated, last-used, idle-expiry and revoked timestamps |
| `login_challenges` | Challenge hash; normalized return path; created/expiry/consumed timestamps |
| `service_deletion_jobs` | User ID; registered service; opaque operation ID; state/attempt timestamps, added only with account deletion |

The runtime database role has no migration, role-management or broad administrative privilege. Prefer narrow functions for pre-identity challenge/session lookup and deletion orchestration, with a separate migration identity. No service account or dashboard database role can read account tables directly.

Routine Dashboard stores `site_user_id` as a unique external tenant mapping in its own database boundary. It keeps preferences, Calendar OAuth state/tokens, cache, sync state and jobs there. Music Training initially stores only its existing browser-local training options and has no service database. A Music-only account therefore creates no Dashboard Calendar connection, token, cache or job.

## Logging and data minimization

Safe telemetry is limited to operation name, caller service, coarse result code, duration and aggregate counts. Never log Firebase/provider UIDs, email, name, picture URL, cookies, CSRF values, login challenges, ID/access/refresh tokens, OIDC assertions, Calendar subjects, request bodies or SQL parameters containing those values.

The account service never receives Calendar or Tasks access/refresh tokens. Common sign-in requests basic identity only. Service-specific OAuth clients, secrets, grants and data stay with their owning service.

## Required tests before integration

- [x] login challenge expiry, replay, mismatch and consumption on denial;
- [x] Firebase issuer/audience/provider/expiry and recent-authentication checks; live revocation uses the Admin SDK and remains an integration check;
- [x] beta allowlist denial before user/session persistence;
- [x] session fixation replacement, hash-only storage, rotation grace, idle expiry and logout;
- [x] exact-origin and session-bound CSRF failure for implemented mutations;
- [x] wrong issuer/audience/email, public caller and cross-service internal-operation denial for the internal API;
- [x] no browser-visible internal/provider identifiers in implemented responses and no sensitive application logging;
- [x] Music-only sign-in has no Dashboard call and therefore creates no Calendar grant or Dashboard row; the first authorized Dashboard visit creates only a minimal tenant mapping;
- [x] Calendar subject mismatch fails without revealing either subject;
- [ ] beta and production cookies and data cannot authenticate each other.

Local service integration is complete. Cloud provisioning waits for a separate review of the account-service identity, database role, secrets, internal audience and account/dashboard rollout order.
