import type {
  AccountApiPort,
  CurrentAccount,
  FirebaseBrowserConfiguration,
  LoginConfiguration,
} from "./flow.js";

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function nullableString(value: unknown, maximum: number): string | null | undefined {
  return value === null ? null : boundedString(value, maximum) ?? undefined;
}

export function safeReturnPath(value: unknown): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 1_024
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("?")
    && !value.includes("#")
    ? value
    : null;
}

function firebaseConfiguration(value: unknown): FirebaseBrowserConfiguration | null {
  const candidate = record(value);
  if (candidate === null) return null;
  const apiKey = boundedString(candidate.apiKey, 512);
  const authDomain = boundedString(candidate.authDomain, 512);
  const projectId = boundedString(candidate.projectId, 255);
  const appId = boundedString(candidate.appId, 512);
  return apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : null;
}

export function parseLoginConfiguration(value: unknown): LoginConfiguration | null {
  const candidate = record(value);
  if (candidate === null) return null;
  const firebase = firebaseConfiguration(candidate.firebase);
  const challenge = boundedString(candidate.challenge, 512);
  const returnPath = safeReturnPath(candidate.returnPath);
  return firebase && challenge && returnPath ? { firebase, challenge, returnPath } : null;
}

function currentAccount(value: unknown): CurrentAccount | null {
  const candidate = record(value);
  const profile = record(candidate?.profile);
  const email = nullableString(profile?.email, 320);
  const displayName = nullableString(profile?.displayName, 200);
  const returnPath = safeReturnPath(candidate?.returnPath);
  if (candidate === null || profile === null || email === undefined || displayName === undefined || returnPath === null) {
    return null;
  }
  return { profile: { email, displayName }, returnPath };
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class BrowserAccountApi implements AccountApiPort {
  readonly #fetch: typeof fetch;

  constructor(fetchImplementation: typeof fetch = fetch) {
    this.#fetch = fetchImplementation;
  }

  async current(returnCandidate: string): Promise<CurrentAccount | null> {
    const response = await this.#fetch(`/api/account/me?return=${encodeURIComponent(returnCandidate)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Account status is unavailable");
    const account = currentAccount(await json(response));
    if (account === null) throw new Error("Account status is invalid");
    return account;
  }

  async loginConfiguration(returnCandidate: string): Promise<LoginConfiguration> {
    const response = await this.#fetch(`/api/account/config?return=${encodeURIComponent(returnCandidate)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Sign-in configuration is unavailable");
    const configuration = parseLoginConfiguration(await json(response));
    if (configuration === null) throw new Error("Sign-in configuration is invalid");
    return configuration;
  }

  async exchange(idToken: string, challenge: string): Promise<{ readonly returnPath: string }> {
    const response = await this.#fetch("/api/account/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, challenge }),
    });
    const body = record(await json(response));
    const returnPath = safeReturnPath(body?.returnPath);
    if (!response.ok || returnPath === null) throw new Error("Sign-in exchange failed");
    return { returnPath };
  }

  async logout(csrfToken: string): Promise<void> {
    const response = await this.#fetch("/api/account/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": csrfToken },
    });
    if (!response.ok) throw new Error("Sign-out failed");
  }
}
