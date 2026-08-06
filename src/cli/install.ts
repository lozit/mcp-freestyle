#!/usr/bin/env node
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { storedAccounts } from "../credentials.ts";

/**
 * Wire the server into an MCP client.
 *
 * The written entry carries **only the e-mail**. The password stays in the OS
 * keychain, so a config file that is world-readable, synced, or pasted into a
 * bug report never contains a credential.
 */

export interface ResolvedPaths {
  /** The Node binary currently running — not `node` off `PATH`, which an MCP
   *  client launched from the GUI may not resolve the same way. */
  readonly node: string;
  /** Absolute path to `dist/index.js`. */
  readonly server: string;
}

/**
 * Locate the built server entry.
 *
 * This module runs from two places — `dist/cli/` when installed, and `src/cli/`
 * when driven by `npm run login` / `npm run install:claude` from a clone. A path
 * computed as `../index.js` is only correct in the first case; in the second it
 * yields `src/index.js`, which never exists (the source is `.ts`). So we find
 * the package root and go to `dist/` from there, which is right either way.
 */
export function resolvePaths(): ResolvedPaths {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate the package root above ${import.meta.url}`);
    }
    dir = parent;
  }
  return { node: process.execPath, server: join(dir, "dist", "index.js") };
}

/**
 * Fail before writing a config that points at a file which isn't there.
 *
 * Every caller must run this. A bad path produces "Server disconnected" in the
 * MCP client with no further detail, which is a miserable thing to debug.
 */
export function assertServerBuilt(paths: ResolvedPaths): void {
  if (!existsSync(paths.server)) {
    throw new Error(
      `The server has not been built: ${paths.server} does not exist.\n` +
        `Run \`npm run build\` from the clone, then retry.`,
    );
  }
}

export function desktopConfigPath(): string {
  const os = platform();
  if (os === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (os === "win32") {
    const appData = process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "Claude", "claude_desktop_config.json");
  }
  throw new Error(
    `Claude Desktop is not available on ${os}. Use \`mcp-freestyle-install code\` instead.`,
  );
}

export function buildEntry(paths: ResolvedPaths, email: string) {
  return {
    command: paths.node,
    args: [paths.server],
    // No password here, by design.
    env: { LIBRELINKUP_EMAIL: email },
  };
}

async function readJsonOrEmpty(path: string): Promise<Record<string, unknown>> {
  if (!existsSync(path)) return {};
  const raw = await readFile(path, "utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    // Refuse rather than overwrite: this file may hold the user's other servers.
    throw new Error(
      `Existing config at ${path} is not valid JSON — refusing to overwrite it. ` +
        `Fix or move it, then retry. (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

async function backupOnce(path: string, now: Date): Promise<string | null> {
  if (!existsSync(path)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const backup = `${path}.bak-${stamp}`;
  await copyFile(path, backup);
  return backup;
}

/** Merge our entry into the Claude Desktop config, preserving everything else. */
export async function installDesktop(opts: {
  email: string;
  paths: ResolvedPaths;
  configPath?: string;
  now?: Date;
}): Promise<{ configPath: string; backup: string | null; changed: boolean }> {
  const configPath = opts.configPath ?? desktopConfigPath();
  await mkdir(dirname(configPath), { recursive: true });

  const before = existsSync(configPath) ? await readFile(configPath, "utf8") : null;
  const config = await readJsonOrEmpty(configPath);
  const servers = (config["mcpServers"] as Record<string, unknown> | undefined) ?? {};
  servers["mcp-freestyle"] = buildEntry(opts.paths, opts.email);
  config["mcpServers"] = servers;
  const after = `${JSON.stringify(config, null, 2)}\n`;

  // Re-running with nothing to change should be a no-op. Backing up regardless
  // just litters the user's Claude directory with identical copies.
  if (before === after) return { configPath, backup: null, changed: false };

  const backup = await backupOnce(configPath, opts.now ?? new Date());
  await writeFile(configPath, after, "utf8");
  return { configPath, backup, changed: true };
}

export function printCodeInstructions(paths: ResolvedPaths, email: string): void {
  process.stdout.write("\nFor Claude Code, run:\n\n");
  process.stdout.write(
    `  claude mcp add mcp-freestyle "${paths.node}" "${paths.server}" --env LIBRELINKUP_EMAIL=${email}\n\n`,
  );
  process.stdout.write(
    "Without the `claude` CLI, add the same entry by hand to ~/.claude.json under `mcpServers`.\n",
  );
}

function parseTargets(argv: readonly string[]): Array<"desktop" | "code"> {
  const targets: Array<"desktop" | "code"> = [];
  for (const arg of argv) {
    if (arg !== "desktop" && arg !== "code") {
      throw new Error(`Unknown argument: "${arg}". Usage: mcp-freestyle-install [desktop] [code]`);
    }
    if (!targets.includes(arg)) targets.push(arg);
  }
  return targets.length > 0 ? targets : ["desktop"];
}

/** Which account to wire in — explicit env wins, else the only stored one. */
export function pickEmail(
  env: Record<string, string | undefined>,
  accounts: readonly string[],
): string {
  const fromEnv = env["LIBRELINKUP_EMAIL"];
  if (fromEnv) return fromEnv;
  if (accounts.length === 1 && accounts[0]) return accounts[0];
  if (accounts.length === 0) {
    throw new Error("No stored credentials. Run `mcp-freestyle-login` first.");
  }
  throw new Error(
    `Several accounts are stored (${accounts.join(", ")}). ` +
      `Pick one with LIBRELINKUP_EMAIL=… mcp-freestyle-install`,
  );
}

async function main(): Promise<void> {
  const targets = parseTargets(process.argv.slice(2));
  const paths = resolvePaths();
  assertServerBuilt(paths);

  const email = pickEmail(process.env, storedAccounts());

  for (const target of targets) {
    if (target === "desktop") {
      const { configPath, backup, changed } = await installDesktop({ email, paths });
      if (!changed) {
        process.stdout.write(`Already up to date: ${configPath}\n`);
      } else {
        process.stdout.write(`Updated ${configPath}\n`);
        if (backup) process.stdout.write(`Previous config backed up to ${backup}\n`);
        process.stdout.write(
          "Quit Claude Desktop fully (⌘Q on macOS) and relaunch to pick up the change.\n",
        );
      }
    } else {
      printCodeInstructions(paths, email);
    }
  }
}

// Importable from login.ts and the tests without running the CLI.
const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "");
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
