import { OAuth2Client } from "google-auth-library";

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const SERVICE_ACCOUNT_SUFFIX = ".iam.gserviceaccount.com";

export interface InternalCallerIdentity {
  readonly service: string;
}

export interface InternalCallerVerifier {
  verify(token: string, now: number): Promise<InternalCallerIdentity>;
}

export interface AllowedServiceAccount {
  readonly service: string;
  readonly email: string;
}

function validateService(value: string): string {
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(value)) throw new Error("Internal service name is invalid");
  return value;
}

function validateServiceAccountEmail(value: string): string {
  const email = value.toLowerCase();
  if (
    email !== value
    || email.length > 254
    || !/^[a-z0-9][a-z0-9._-]*@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(email)
    || !email.endsWith(SERVICE_ACCOUNT_SUFFIX)
  ) {
    throw new Error("Internal service-account email is invalid");
  }
  return email;
}

export class GoogleInternalCallerVerifier implements InternalCallerVerifier {
  readonly #audience: string;
  readonly #servicesByEmail: ReadonlyMap<string, string>;
  readonly #client: Pick<OAuth2Client, "verifyIdToken">;

  constructor(
    audience: string,
    serviceAccounts: readonly AllowedServiceAccount[],
    client: Pick<OAuth2Client, "verifyIdToken"> = new OAuth2Client(),
  ) {
    const url = new URL(audience);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.search
      || url.hash
    ) {
      throw new Error("Internal audience must be one exact HTTPS URL without credentials, query or fragment");
    }
    if (serviceAccounts.length === 0) throw new Error("At least one internal service account is required");
    const servicesByEmail = new Map<string, string>();
    const serviceNames = new Set<string>();
    for (const account of serviceAccounts) {
      const service = validateService(account.service);
      const email = validateServiceAccountEmail(account.email);
      if (servicesByEmail.has(email) || serviceNames.has(service)) {
        throw new Error("Internal service accounts and service names must be unique");
      }
      servicesByEmail.set(email, service);
      serviceNames.add(service);
    }
    this.#audience = audience;
    this.#servicesByEmail = servicesByEmail;
    this.#client = client;
  }

  async verify(token: string, now: number): Promise<InternalCallerIdentity> {
    if (!token || token.length > 16_384) throw new Error("Internal caller token is invalid");
    const ticket = await this.#client.verifyIdToken({ idToken: token, audience: this.#audience });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const service = email === undefined ? undefined : this.#servicesByEmail.get(email);
    if (
      payload === undefined
      || !GOOGLE_ISSUERS.has(payload.iss)
      || payload.aud !== this.#audience
      || payload.email !== email
      || payload.email_verified !== true
      || typeof payload.sub !== "string"
      || payload.sub.length < 1
      || payload.sub.length > 255
      || typeof payload.exp !== "number"
      || payload.exp * 1_000 <= now
      || service === undefined
    ) {
      throw new Error("Internal caller identity is invalid");
    }
    return { service };
  }
}

export function bearerToken(value: string | undefined): string | null {
  if (value === undefined || !value.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length);
  return token.length > 0 && token.length <= 16_384 && !/\s/.test(token) ? token : null;
}
