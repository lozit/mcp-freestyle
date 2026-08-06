/**
 * Configuration is read from the environment. Nothing here is ever written to
 * a tracked file, and no value from it may appear in a log line or an error
 * message (`docs/SECURITY.md`).
 */
export interface LibreLinkUpConfig {
  /** LibreLinkUp *follower* account e-mail — not the primary LibreLink account. */
  readonly email: string;
  readonly password: string;
  /**
   * Pinned client version sent as the `version` header.
   *
   * Deliberately configuration and not a constant: this value has churned
   * (4.2.1 → 4.12 → 4.16.0) and every bump broke community clients. When
   * upstream rejects the pinned version the fix must be an env change, not a
   * release (ADR 0002).
   */
  readonly version: string;
  readonly product: string;
  /** Entry point. The regional host is discovered at login, never configured. */
  readonly baseUrl: string;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const DEFAULT_VERSION = "4.16.0";
const DEFAULT_PRODUCT = "llu.android";
const DEFAULT_BASE_URL = "https://api.libreview.io";

export function configFromEnv(
  env: Record<string, string | undefined> = process.env,
): LibreLinkUpConfig {
  const missing: string[] = [];

  const email = env["LIBRELINKUP_EMAIL"];
  if (!email) missing.push("LIBRELINKUP_EMAIL");

  const password = env["LIBRELINKUP_PASSWORD"];
  if (!password) missing.push("LIBRELINKUP_PASSWORD");

  if (missing.length > 0) {
    // Names only — never echo a value, not even a truncated one.
    throw new ConfigError(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `See the README for how to obtain LibreLinkUp follower credentials.`,
    );
  }

  return {
    email: email as string,
    password: password as string,
    version: env["LIBRELINKUP_VERSION"] ?? DEFAULT_VERSION,
    product: env["LIBRELINKUP_PRODUCT"] ?? DEFAULT_PRODUCT,
    baseUrl: env["LIBRELINKUP_BASE_URL"] ?? DEFAULT_BASE_URL,
  };
}
