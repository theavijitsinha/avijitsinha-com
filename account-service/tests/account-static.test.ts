import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Express } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AccountController } from "../src/auth/controller.js";
import type { AccountSessionStore } from "../src/auth/session-store.js";
import { ExactOriginPolicy, ReturnPathPolicy } from "../src/http/policy.js";

const resources: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const close of resources.splice(0).reverse()) await close();
});

async function serve(app: Express): Promise<string> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  resources.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing test address");
  return `http://127.0.0.1:${address.port}`;
}

describe("account static UI", () => {
  it("serves only the reviewed account path with restrictive browser headers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "account-static-"));
    resources.push(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, "index.html"), "<!doctype html><title>Account test</title>");
    await writeFile(join(directory, "app.js"), "export const account = true;");
    const sessions = {
      issueLoginChallenge: async () => "challenge",
      consumeLoginChallenge: async () => "/",
      create: async () => ({ token: "token", csrfToken: "csrf" }),
      resolve: async () => null,
      revoke: async () => true,
      matchesGoogleSubject: async () => false,
    } satisfies AccountSessionStore;
    const controller = new AccountController({
      verifier: { verify: async () => { throw new Error("unused"); } },
      sessions,
      origins: new ExactOriginPolicy(["https://avijitsinha.com"]),
      returnPaths: new ReturnPathPolicy(["/"]),
      firebase: { apiKey: "key", authDomain: "example.test", projectId: "project", appId: "app" },
      allowedFirebaseUids: ["allowed-user"],
    });
    const baseUrl = await serve(createApp({ controller, staticDirectory: directory }));

    const redirect = await fetch(`${baseUrl}/account`, { redirect: "manual" });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/account/");

    const page = await fetch(`${baseUrl}/account/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Account test");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("x-frame-options")).toBe("DENY");

    const asset = await fetch(`${baseUrl}/account/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("account = true");
    expect((await fetch(`${baseUrl}/account-private`)).status).toBe(404);
  });
});
