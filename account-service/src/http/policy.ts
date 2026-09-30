export class ExactOriginPolicy {
  readonly #origins: ReadonlySet<string>;

  constructor(origins: readonly string[]) {
    const normalized = origins.map(value => new URL(value).origin);
    if (normalized.length === 0) throw new Error("At least one account origin is required");
    if (new Set(normalized).size !== normalized.length) throw new Error("Account origins must be unique");
    if (origins.some((value, index) => value !== normalized[index])) {
      throw new Error("Account origins must be exact origins without paths");
    }
    this.#origins = new Set(normalized);
  }

  allows(origin: string | undefined): boolean {
    return origin !== undefined && this.#origins.has(origin);
  }
}

export class ReturnPathPolicy {
  readonly #paths: ReadonlySet<string>;
  readonly #fallback: string;

  constructor(paths: readonly string[]) {
    if (paths.length === 0) throw new Error("At least one account return path is required");
    for (const path of paths) {
      if (!path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#")) {
        throw new Error("Account return paths must be exact local paths");
      }
    }
    if (new Set(paths).size !== paths.length) throw new Error("Account return paths must be unique");
    this.#paths = new Set(paths);
    this.#fallback = paths[0]!;
  }

  resolve(candidate: unknown): string {
    return typeof candidate === "string" && this.#paths.has(candidate) ? candidate : this.#fallback;
  }
}
