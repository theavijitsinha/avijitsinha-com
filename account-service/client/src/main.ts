import "./styles.css";
import { BrowserAccountApi } from "./api.js";
import {
  AccountDomView,
  BrowserNavigation,
  csrfFromCookie,
  SessionLoginAttemptStore,
} from "./browser.js";
import { FirebaseRedirectIdentity } from "./firebase-identity.js";
import { AccountFlow } from "./flow.js";

const returnCandidate = new URL(window.location.href).searchParams.get("return") ?? "/";
const flow = new AccountFlow({
  api: new BrowserAccountApi(window.fetch.bind(window)),
  identity: new FirebaseRedirectIdentity(),
  attempts: new SessionLoginAttemptStore(window.sessionStorage),
  view: new AccountDomView(),
  navigation: new BrowserNavigation(),
  csrf: { read: () => csrfFromCookie(document.cookie) },
  returnCandidate,
});

void flow.start();
