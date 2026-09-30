export interface FirebaseBrowserConfiguration {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

export interface LoginConfiguration {
  readonly firebase: FirebaseBrowserConfiguration;
  readonly challenge: string;
  readonly returnPath: string;
}

export interface AccountProfile {
  readonly email: string | null;
  readonly displayName: string | null;
}

export interface CurrentAccount {
  readonly profile: AccountProfile;
  readonly returnPath: string;
}

export interface AccountApiPort {
  current(returnCandidate: string): Promise<CurrentAccount | null>;
  loginConfiguration(returnCandidate: string): Promise<LoginConfiguration>;
  exchange(idToken: string, challenge: string): Promise<{ readonly returnPath: string }>;
  logout(csrfToken: string): Promise<void>;
}

export interface RedirectIdentityPort {
  begin(configuration: FirebaseBrowserConfiguration): Promise<void>;
  finish(configuration: FirebaseBrowserConfiguration): Promise<string | null>;
  clear(): Promise<void>;
}

export interface LoginAttemptStore {
  read(): LoginConfiguration | null;
  write(configuration: LoginConfiguration): void;
  clear(): void;
}

export interface AccountViewPort {
  loading(message: string): void;
  signedOut(signIn: () => void, message?: string): void;
  signedIn(account: CurrentAccount, logout: () => void, message?: string): void;
  busy(message: string): void;
  failure(message: string, retry: () => void): void;
}

export interface NavigationPort {
  replace(path: string): void;
}

export interface CsrfPort {
  read(): string | null;
}

async function ignoreFailure(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // Cleanup failure must not expose provider details or replace the primary result.
  }
}

export class AccountFlow {
  readonly #api: AccountApiPort;
  readonly #identity: RedirectIdentityPort;
  readonly #attempts: LoginAttemptStore;
  readonly #view: AccountViewPort;
  readonly #navigation: NavigationPort;
  readonly #csrf: CsrfPort;
  readonly #returnCandidate: string;

  constructor(options: {
    readonly api: AccountApiPort;
    readonly identity: RedirectIdentityPort;
    readonly attempts: LoginAttemptStore;
    readonly view: AccountViewPort;
    readonly navigation: NavigationPort;
    readonly csrf: CsrfPort;
    readonly returnCandidate: string;
  }) {
    this.#api = options.api;
    this.#identity = options.identity;
    this.#attempts = options.attempts;
    this.#view = options.view;
    this.#navigation = options.navigation;
    this.#csrf = options.csrf;
    this.#returnCandidate = options.returnCandidate;
  }

  async start(): Promise<void> {
    this.#view.loading("Checking your session…");
    const attempt = this.#attempts.read();
    if (attempt !== null && await this.#finishRedirect(attempt)) return;

    try {
      const account = await this.#api.current(this.#returnCandidate);
      if (account === null) this.#showSignedOut();
      else this.#showSignedIn(account);
    } catch {
      this.#view.failure("We couldn’t check your account right now.", () => { void this.start(); });
    }
  }

  async #finishRedirect(attempt: LoginConfiguration): Promise<boolean> {
    try {
      const idToken = await this.#identity.finish(attempt.firebase);
      if (idToken === null) {
        this.#attempts.clear();
        await ignoreFailure(() => this.#identity.clear());
        return false;
      }
      this.#view.busy("Finishing secure sign-in…");
      const result = await this.#api.exchange(idToken, attempt.challenge);
      this.#attempts.clear();
      await ignoreFailure(() => this.#identity.clear());
      this.#navigation.replace(result.returnPath);
      return true;
    } catch {
      this.#attempts.clear();
      await ignoreFailure(() => this.#identity.clear());
      this.#showSignedOut("Google sign-in could not be verified. Please try again.");
      return true;
    }
  }

  #showSignedOut(message = ""): void {
    this.#view.signedOut(() => { void this.#beginSignIn(); }, message);
  }

  async #beginSignIn(): Promise<void> {
    this.#view.busy("Opening Google sign-in…");
    try {
      const configuration = await this.#api.loginConfiguration(this.#returnCandidate);
      this.#attempts.write(configuration);
      await this.#identity.begin(configuration.firebase);
    } catch {
      this.#attempts.clear();
      await ignoreFailure(() => this.#identity.clear());
      this.#showSignedOut("Google sign-in could not be opened. Please try again.");
    }
  }

  #showSignedIn(account: CurrentAccount, message = ""): void {
    this.#view.signedIn(account, () => { void this.#logout(account); }, message);
  }

  async #logout(account: CurrentAccount): Promise<void> {
    const csrfToken = this.#csrf.read();
    if (csrfToken === null) {
      this.#showSignedIn(account, "Your session could not be verified. Reload and try again.");
      return;
    }
    this.#view.busy("Signing out…");
    try {
      await this.#api.logout(csrfToken);
      await ignoreFailure(() => this.#identity.clear());
      this.#showSignedOut("You’re signed out.");
    } catch {
      this.#showSignedIn(account, "Sign-out could not be completed. Please try again.");
    }
  }
}
