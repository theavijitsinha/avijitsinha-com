import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithRedirect,
  signOut,
  type Auth,
} from "firebase/auth";
import type { FirebaseBrowserConfiguration, RedirectIdentityPort } from "./flow.js";

const APP_NAME = "avijitsinha-account-ui";

export class FirebaseRedirectIdentity implements RedirectIdentityPort {
  #auth: Auth | null = null;

  async #initialize(configuration: FirebaseBrowserConfiguration): Promise<Auth> {
    const existing = getApps().find(app => app.name === APP_NAME);
    const app: FirebaseApp = existing ?? initializeApp(configuration, APP_NAME);
    const auth = getAuth(app);
    await setPersistence(auth, inMemoryPersistence);
    this.#auth = auth;
    return auth;
  }

  async begin(configuration: FirebaseBrowserConfiguration): Promise<void> {
    const auth = await this.#initialize(configuration);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(auth, provider);
  }

  async finish(configuration: FirebaseBrowserConfiguration): Promise<string | null> {
    const auth = await this.#initialize(configuration);
    const redirect = await getRedirectResult(auth);
    return redirect === null ? null : redirect.user.getIdToken();
  }

  async clear(): Promise<void> {
    if (this.#auth !== null) await signOut(this.#auth);
  }
}
