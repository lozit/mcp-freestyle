import { readPassword as keychainPassword } from "./credentials.ts";

/**
 * Configuration. Nothing here is ever written to a tracked file, and no value
 * from it may appear in a log line or an error message (`docs/SECURITY.md`).
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

/**
 * Resolve configuration.
 *
 * The password is looked up in the OS keychain, keyed by e-mail, so it never
 * has to appear in `claude_desktop_config.json` or a `.env`. `LIBRELINKUP_PASSWORD`
 * still wins when set — useful for CI and one-off runs — but it is the fallback,
 * not the expected path.
 *
 * `readPassword` is injectable so the resolution logic is testable without
 * touching a real keychain.
 */
export function configFromEnv(
  env: Record<string, string | undefined> = process.env,
  readPassword: (email: string) => string | null = keychainPassword,
): LibreLinkUpConfig {
  const email = env["LIBRELINKUP_EMAIL"];
  if (!email) {
    throw new ConfigError(
      `LIBRELINKUP_EMAIL is not set. Run \`mcp-freestyle-login\` once, then ` +
        `\`mcp-freestyle-install\` to wire it into your MCP client.`,
    );
  }

  const password = env["LIBRELINKUP_PASSWORD"] ?? readPassword(email);
  if (!password) {
    // Names only — never echo a value, not even a truncated one.
    throw new ConfigError(
      `No password found for ${email}. Run \`mcp-freestyle-login\` to store it ` +
        `in your OS keychain, or set LIBRELINKUP_PASSWORD for a one-off run.`,
    );
  }

  return {
    email,
    password,
    version: env["LIBRELINKUP_VERSION"] ?? DEFAULT_VERSION,
    product: env["LIBRELINKUP_PRODUCT"] ?? DEFAULT_PRODUCT,
    baseUrl: env["LIBRELINKUP_BASE_URL"] ?? DEFAULT_BASE_URL,
  };
}
