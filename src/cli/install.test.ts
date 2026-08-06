import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildEntry, installDesktop, pickEmail, type ResolvedPaths } from "./install.ts";

const PATHS: ResolvedPaths = {
  node: "/opt/node/bin/node",
  server: "/opt/mcp-freestyle/dist/index.js",
};

const NOW = new Date("2027-05-09T09:26:00Z");

interface DesktopConfig {
  mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
  [key: string]: unknown;
}

async function tempConfig(contents?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mcp-freestyle-install-"));
  const path = join(dir, "claude_desktop_config.json");
  if (contents !== undefined) await writeFile(path, contents, "utf8");
  return path;
}

async function readConfig(path: string): Promise<DesktopConfig> {
  return JSON.parse(await readFile(path, "utf8")) as DesktopConfig;
}

test("the written entry never contains the password", () => {
  const entry = buildEntry(PATHS, "follower@example.test");
  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /password/i);
  assert.deepEqual(entry.env, { LIBRELINKUP_EMAIL: "follower@example.test" });
});

test("uses absolute paths, not bare `node` off PATH", () => {
  // An MCP client launched from the GUI does not necessarily resolve `node`
  // the same way a login shell does.
  const entry = buildEntry(PATHS, "follower@example.test");
  assert.equal(entry.command, "/opt/node/bin/node");
  assert.deepEqual(entry.args, ["/opt/mcp-freestyle/dist/index.js"]);
});

test("creates the config when none exists", async () => {
  const configPath = await tempConfig();
  await installDesktop({ email: "a@example.test", paths: PATHS, configPath, now: NOW });

  const written = await readConfig(configPath);
  assert.ok(written.mcpServers?.["mcp-freestyle"]);
});

test("preserves other servers and unrelated top-level keys", async () => {
  const configPath = await tempConfig(
    JSON.stringify({
      globalShortcut: "Cmd+Shift+Space",
      mcpServers: { "some-other-server": { command: "other", args: [] } },
    }),
  );
  await installDesktop({ email: "a@example.test", paths: PATHS, configPath, now: NOW });

  const written = await readConfig(configPath);
  assert.equal(written["globalShortcut"], "Cmd+Shift+Space");
  assert.ok(written.mcpServers?.["some-other-server"], "other server must survive");
  assert.ok(written.mcpServers?.["mcp-freestyle"]);
});

test("backs up an existing config before rewriting it", async () => {
  const configPath = await tempConfig(JSON.stringify({ mcpServers: {} }));
  const { backup } = await installDesktop({
    email: "a@example.test",
    paths: PATHS,
    configPath,
    now: NOW,
  });

  assert.ok(backup, "a backup path must be returned");
  const siblings = await readdir(join(configPath, ".."));
  assert.ok(siblings.some((name) => name.includes(".bak-")));
});

test("does not create a backup when there was no config", async () => {
  const configPath = await tempConfig();
  const { backup } = await installDesktop({
    email: "a@example.test",
    paths: PATHS,
    configPath,
    now: NOW,
  });
  assert.equal(backup, null);
});

test("refuses to overwrite a config it cannot parse", async () => {
  // That file may hold every other MCP server the user has configured.
  const configPath = await tempConfig("{ this is not json");
  await assert.rejects(
    () => installDesktop({ email: "a@example.test", paths: PATHS, configPath, now: NOW }),
    /refusing to overwrite/,
  );
  assert.equal(await readFile(configPath, "utf8"), "{ this is not json");
});

test("re-running replaces our entry rather than duplicating it", async () => {
  const configPath = await tempConfig();
  await installDesktop({ email: "a@example.test", paths: PATHS, configPath, now: NOW });
  await installDesktop({ email: "b@example.test", paths: PATHS, configPath, now: NOW });

  const written = await readConfig(configPath);
  assert.equal(Object.keys(written.mcpServers ?? {}).length, 1);
  assert.equal(
    written.mcpServers?.["mcp-freestyle"]?.env?.["LIBRELINKUP_EMAIL"],
    "b@example.test",
  );
});

test("picks the only stored account, and lets the environment override", () => {
  assert.equal(pickEmail({}, ["only@example.test"]), "only@example.test");
  assert.equal(
    pickEmail({ LIBRELINKUP_EMAIL: "chosen@example.test" }, ["other@example.test"]),
    "chosen@example.test",
  );
});

test("refuses to guess between several stored accounts", () => {
  assert.throws(
    () => pickEmail({}, ["a@example.test", "b@example.test"]),
    /Several accounts/,
  );
});

test("says what to do when nothing is stored", () => {
  assert.throws(() => pickEmail({}, []), /mcp-freestyle-login/);
});
