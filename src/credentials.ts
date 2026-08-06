import { Entry, findCredentials } from "@napi-rs/keyring";

/**
 * The LibreLinkUp password, held in the OS keychain.
 *
 * Only the password lives here. The **token is deliberately not stored**: it is
 * valid ~180 days and has no revocation path, so a persisted token is a far
 * larger liability than a keychain-held password. We re-authenticate instead
 * (`docs/SECURITY.md`).
 *
 * The e-mail is not a secret and travels in plain configuration — that is what
 * keeps the password out of `claude_desktop_config.json`.
 */
const SERVICE = "mcp-freestyle";

export function storePassword(email: string, password: string): void {
  new Entry(SERVICE, email).setPassword(password);
}

export function readPassword(email: string): string | null {
  try {
    return new Entry(SERVICE, email).getPassword();
  } catch {
    // No entry for this account, or the keychain declined. Either way there is
    // no password to return — the caller decides what to say about it.
    return null;
  }
}

export function deletePassword(email: string): boolean {
  try {
    return new Entry(SERVICE, email).deletePassword();
  } catch {
    return false;
  }
}

/** E-mails with a stored password, for defaulting a prompt or listing choices. */
export function storedAccounts(): string[] {
  try {
    return findCredentials(SERVICE).map((entry) => entry.account);
  } catch {
    return [];
  }
}
