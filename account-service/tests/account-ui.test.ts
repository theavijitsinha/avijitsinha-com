import { describe, expect, it, vi } from "vitest";
import { parseLoginConfiguration, safeReturnPath } from "../client/src/api.js";
import { csrfFromCookie } from "../client/src/browser.js";
import {
  AccountFlow,
  type AccountApiPort,
  type AccountViewPort,
  type CurrentAccount,
  type LoginAttemptStore,
  type LoginConfiguration,
  type RedirectIdentityPort,
} from "../client/src/flow.js";

const firebase = {
  apiKey: "public-key",
  authDomain: "avijitsinha.com",
  projectId: "avijitsinha-com",
  appId: "public-app",
};
const configuration: LoginConfiguration = {
  firebase,
  challenge: "login-challenge",
  returnPath: "/routine/dashboard/",
};
const account: CurrentAccount = {
  profile: { email: "person@example.test", displayName: "Example Person" },
  returnPath: "/routine/dashboard/",
};

function fixture(options: {
  readonly pending?: LoginConfiguration | null;
  readonly current?: CurrentAccount | null;
  readonly redirectToken?: string | null;
} = {}) {
  let signIn: (() => void) | null = null;
  let logout: (() => void) | null = null;
  let retry: (() => void) | null = null;
  let pending = options.pending ?? null;
  const api: AccountApiPort = {
    current: vi.fn(async () => options.current ?? null),
    loginConfiguration: vi.fn(async () => configuration),
    exchange: vi.fn(async () => ({ returnPath: configuration.returnPath })),
    logout: vi.fn(async () => undefined),
  };
  const identity: RedirectIdentityPort = {
    begin: vi.fn(async () => undefined),
    finish: vi.fn(async () => options.redirectToken ?? null),
    clear: vi.fn(async () => undefined),
  };
  const attempts: LoginAttemptStore = {
    read: vi.fn(() => pending),
    write: vi.fn(value => { pending = value; }),
    clear: vi.fn(() => { pending = null; }),
  };
  const view: AccountViewPort = {
    loading: vi.fn(),
    signedOut: vi.fn(action => { signIn = action; }),
    signedIn: vi.fn((_value, action) => { logout = action; }),
    busy: vi.fn(),
    failure: vi.fn((_message, action) => { retry = action; }),
  };
  const navigation = { replace: vi.fn() };
  const csrf = { read: vi.fn(() => "session-csrf") };
  const flow = new AccountFlow({
    api,
    identity,
    attempts,
    view,
    navigation,
    csrf,
    returnCandidate: "https://attacker.example/",
  });
  return {
    flow,
    api,
    identity,
    attempts,
    view,
    navigation,
    csrf,
    signIn: () => signIn,
    logout: () => logout,
    retry: () => retry,
  };
}

describe("account browser flow", () => {
  it("calls /me on initialization and renders only the server-normalized continuation", async () => {
    const value = fixture({ current: account });
    await value.flow.start();

    expect(value.api.current).toHaveBeenCalledWith("https://attacker.example/");
    expect(value.view.signedIn).toHaveBeenCalledWith(account, expect.any(Function), "");
    expect(value.navigation.replace).not.toHaveBeenCalled();
  });

  it("starts Firebase redirect only after persisting the server-issued challenge", async () => {
    const value = fixture();
    await value.flow.start();
    value.signIn()?.();
    await vi.waitFor(() => expect(value.identity.begin).toHaveBeenCalledWith(firebase));

    expect(value.api.loginConfiguration).toHaveBeenCalledWith("https://attacker.example/");
    expect(value.attempts.write).toHaveBeenCalledWith(configuration);
    expect(value.attempts.write).toHaveBeenCalledBefore(vi.mocked(value.identity.begin));
  });

  it("exchanges a redirect ID token, clears Firebase state and follows only the exchange response", async () => {
    const value = fixture({ pending: configuration, redirectToken: "short-lived-firebase-token" });
    await value.flow.start();

    expect(value.api.exchange).toHaveBeenCalledWith("short-lived-firebase-token", "login-challenge");
    expect(value.identity.clear).toHaveBeenCalled();
    expect(value.attempts.clear).toHaveBeenCalled();
    expect(value.navigation.replace).toHaveBeenCalledWith("/routine/dashboard/");
    expect(value.api.current).not.toHaveBeenCalled();
  });

  it("uses the rotated CSRF cookie for logout and returns to signed-out state", async () => {
    const value = fixture({ current: account });
    await value.flow.start();
    value.logout()?.();
    await vi.waitFor(() => expect(value.api.logout).toHaveBeenCalledWith("session-csrf"));
    await vi.waitFor(() => expect(value.view.signedOut).toHaveBeenLastCalledWith(
      expect.any(Function),
      "You’re signed out.",
    ));

    expect(value.identity.clear).toHaveBeenCalled();
  });

  it("clears failed redirect state without exposing provider errors", async () => {
    const value = fixture({ pending: configuration, redirectToken: "token" });
    vi.mocked(value.api.exchange).mockRejectedValue(new Error("private provider response"));
    await value.flow.start();

    expect(value.attempts.clear).toHaveBeenCalled();
    expect(value.navigation.replace).not.toHaveBeenCalled();
    expect(value.view.signedOut).toHaveBeenCalledWith(
      expect.any(Function),
      "Google sign-in could not be verified. Please try again.",
    );
    expect(JSON.stringify(vi.mocked(value.view.signedOut).mock.calls)).not.toContain("private provider response");
  });
});

describe("account browser input validation", () => {
  it("accepts only bounded local return paths and complete public Firebase configuration", () => {
    expect(safeReturnPath("/music/training/")).toBe("/music/training/");
    expect(safeReturnPath("https://attacker.example/")).toBeNull();
    expect(safeReturnPath("//attacker.example/")).toBeNull();
    expect(parseLoginConfiguration(configuration)).toEqual(configuration);
    expect(parseLoginConfiguration({ ...configuration, firebase: { apiKey: "public-key" } })).toBeNull();
  });

  it("reads only the host CSRF cookie without decoding or accepting an empty value", () => {
    expect(csrfFromCookie("other=value; __Host-avijit_csrf=csrf-value; another=value")).toBe("csrf-value");
    expect(csrfFromCookie("__Host-avijit_csrf=")).toBeNull();
    expect(csrfFromCookie("other=value")).toBeNull();
  });
});
