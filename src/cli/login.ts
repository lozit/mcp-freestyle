#!/usr/bin/env node
import { configFromEnv } from "../config.ts";
import { storePassword, storedAccounts } from "../credentials.ts";
import { ask, askSecret, confirm } from "./prompt.ts";
import {
  assertServerBuilt,
  installDesktop,
  printCodeInstructions,
  resolvePaths,
} from "./install.ts";
import { UpstreamContractError } from "../upstream/errors.ts";
import { login } from "../upstream/librelinkup.ts";

/**
 * Store LibreLinkUp credentials in the OS keychain, after proving they work.
 *
 * The password is verified by actually authenticating — storing an unverified
 * password only moves the failure to the first tool call, where the agent has
 * far less context to explain it.
 *
 * Only the password is stored. The token that login returns is discarded: it is
 * valid ~180 days with no revocation path, so persisting it would be the larger
 * risk (`docs/SECURITY.md`).
 */
async function main(): Promise<void> {
  const known = storedAccounts();
  const suggestion = known.length === 1 ? known[0] : undefined;

  const email = await ask(
    suggestion
      ? `LibreLinkUp follower e-mail [${suggestion}]: `
      : "LibreLinkUp follower e-mail: ",
    suggestion ?? "",
  );
  if (!email) {
    process.stderr.write("An e-mail is required.\n");
    process.exit(1);
  }

  const password = await askSecret("Password (not echoed): ");
  if (!password) {
    process.stderr.write("A password is required.\n");
    process.exit(1);
  }

  process.stdout.write("\nVerifying against LibreLinkUp… ");
  const config = configFromEnv(
    { ...process.env, LIBRELINKUP_EMAIL: email, LIBRELINKUP_PASSWORD: password },
    () => password,
  );

  try {
    const session = await login(config);
    const region = new URL(session.baseUrl).hostname;
    process.stdout.write(`ok (${region})\n`);
  } catch (error) {
    process.stdout.write("failed\n\n");
    if (error instanceof UpstreamContractError) {
      process.stderr.write(`${error.message}\n`);
      process.stderr.write(
        `\nCheck that this is the LibreLinkUp *follower* account — not the ` +
          `primary LibreLink one — and that sharing is enabled in the app. ` +
          `If the failure mentions a version, set LIBRELINKUP_VERSION to the ` +
          `current LibreLinkUp app version.\n`,
      );
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.stderr.write("\nNothing was stored.\n");
    process.exit(1);
  }

  storePassword(email, password);
  process.stdout.write(`Password stored in your OS keychain for ${email}.\n\n`);
  if (await confirm("Wire this into Claude Desktop now?")) {
    try {
      const paths = resolvePaths();
      // Never write a config pointing at a file that isn't there: the client
      // reports only "Server disconnected", with nothing to go on.
      assertServerBuilt(paths);
      const { configPath, backup } = await installDesktop({ email, paths });
      process.stdout.write(`\nUpdated ${configPath}\n`);
      if (backup) process.stdout.write(`Previous config backed up to ${backup}\n`);
      process.stdout.write(
        "Quit Claude Desktop fully (⌘Q on macOS) and relaunch to pick up the change.\n",
      );
    } catch (error) {
      process.stderr.write(
        `\nDesktop install failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.stderr.write("Run `mcp-freestyle-install` later to retry.\n");
    }
  } else {
    process.stdout.write("\nWhen you're ready: `mcp-freestyle-install`\n");
    printCodeInstructions(resolvePaths(), email);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
