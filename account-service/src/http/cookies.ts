import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const SESSION_COOKIE = "__Host-avijit_session";
export const CSRF_COOKIE = "__Host-avijit_csrf";
export const LOGIN_COOKIE = "__Host-avijit_login";

export function parseCookies(request: Request): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const pair of (request.header("cookie") ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name && value) result[name] = value;
  }
  return result;
}

export function opaqueValuesEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}
