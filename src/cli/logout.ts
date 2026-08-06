#!/usr/bin/env node
import { deletePassword, storedAccounts } from "../credentials.ts";
import { pickEmail } from "./install.ts";

/**
 * Remove the stored password.
 *
 * This does not — and cannot — invalidate any LibreLinkUp token already issued:
 * upstream provides no revocation path and tokens live ~180 days. Changing the
 * Abbott account password is the only recourse there (`docs/SECURITY.md`).
 * Nothing is persisted by this project beyond the password, so removing it is
 * the whole of what we control.
 */
function main(): void {
  const email = pickEmail(process.env, storedAccounts());
  const removed = deletePassword(email);
  if (removed) {
    process.stdout.write(`Removed the stored password for ${email}.\n`);
    process.stdout.write(
      "Note: any LibreLinkUp token already issued stays valid — upstream has no " +
        "revocation. Change your Abbott password if you need it dead.\n",
    );
  } else {
    process.stdout.write(`No stored password found for ${email}.\n`);
  }
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
