import { parseLoginConfiguration } from "./api.js";
import type {
  AccountViewPort,
  CurrentAccount,
  LoginAttemptStore,
  LoginConfiguration,
  NavigationPort,
} from "./flow.js";

const ATTEMPT_KEY = "avijitsinha.account.login-attempt";

export class SessionLoginAttemptStore implements LoginAttemptStore {
  readonly #storage: Storage;

  constructor(storage: Storage) {
    this.#storage = storage;
  }

  read(): LoginConfiguration | null {
    try {
      const value = this.#storage.getItem(ATTEMPT_KEY);
      if (value === null) return null;
      const parsed = parseLoginConfiguration(JSON.parse(value));
      if (parsed === null) this.clear();
      return parsed;
    } catch {
      this.clear();
      return null;
    }
  }

  write(configuration: LoginConfiguration): void {
    this.#storage.setItem(ATTEMPT_KEY, JSON.stringify(configuration));
  }

  clear(): void {
    try {
      this.#storage.removeItem(ATTEMPT_KEY);
    } catch {
      // A blocked store is equivalent to no pending login attempt.
    }
  }
}

export class BrowserNavigation implements NavigationPort {
  replace(path: string): void {
    window.location.replace(path);
  }
}

export function csrfFromCookie(cookie: string): string | null {
  for (const pair of cookie.split(";")) {
    const [name, ...parts] = pair.trim().split("=");
    if (name === "__Host-avijit_csrf") {
      const value = parts.join("=");
      return value.length > 0 && value.length <= 256 ? value : null;
    }
  }
  return null;
}

function element<T extends HTMLElement>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (value === null) throw new Error("Account page is incomplete");
  return value;
}

export class AccountDomView implements AccountViewPort {
  readonly #loading = element<HTMLElement>("[data-loading]");
  readonly #loadingStatus = element<HTMLElement>("[data-loading-status]");
  readonly #signedOut = element<HTMLElement>("[data-signed-out]");
  readonly #signIn = element<HTMLButtonElement>("[data-sign-in]");
  readonly #signedOutStatus = element<HTMLElement>("[data-signed-out-status]");
  readonly #signedIn = element<HTMLElement>("[data-signed-in]");
  readonly #profileName = element<HTMLElement>("[data-profile-name]");
  readonly #profileEmail = element<HTMLElement>("[data-profile-email]");
  readonly #continue = element<HTMLAnchorElement>("[data-continue]");
  readonly #logout = element<HTMLButtonElement>("[data-logout]");
  readonly #signedInStatus = element<HTMLElement>("[data-signed-in-status]");
  readonly #failure = element<HTMLElement>("[data-failure]");
  readonly #failureMessage = element<HTMLElement>("[data-failure-message]");
  readonly #retry = element<HTMLButtonElement>("[data-retry]");
  #active: HTMLElement = this.#loading;

  #show(section: HTMLElement): void {
    for (const candidate of [this.#loading, this.#signedOut, this.#signedIn, this.#failure]) {
      candidate.hidden = candidate !== section;
    }
    this.#active = section;
  }

  loading(message: string): void {
    this.#loadingStatus.textContent = message;
    this.#show(this.#loading);
  }

  signedOut(signIn: () => void, message = ""): void {
    this.#signIn.disabled = false;
    this.#signIn.onclick = signIn;
    this.#signedOutStatus.textContent = message;
    this.#show(this.#signedOut);
    this.#signIn.focus();
  }

  signedIn(account: CurrentAccount, logout: () => void, message = ""): void {
    this.#profileName.textContent = account.profile.displayName ?? "Google account";
    this.#profileEmail.textContent = account.profile.email ?? "";
    this.#continue.href = account.returnPath;
    this.#logout.disabled = false;
    this.#logout.onclick = logout;
    this.#signedInStatus.textContent = message;
    this.#show(this.#signedIn);
  }

  busy(message: string): void {
    this.#signIn.disabled = true;
    this.#logout.disabled = true;
    if (this.#active === this.#signedIn) this.#signedInStatus.textContent = message;
    else this.#signedOutStatus.textContent = message;
  }

  failure(message: string, retry: () => void): void {
    this.#failureMessage.textContent = message;
    this.#retry.onclick = retry;
    this.#show(this.#failure);
  }
}
