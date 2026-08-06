import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertServerBuilt,
  buildEntry,
  installDesktop,
  pickEmail,
  resolvePaths,
  type ResolvedPaths,
} from "./install.ts";

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

test("resolves to dist/index.js even when running from src/", () => {
  // Regression: this test file lives in src/cli/, which is exactly the case
  // that was broken. Computing `../index.js` from here yields src/index.js —
  // a file that never exists, since the source is .ts. The client then reports
  // only "Server disconnected", with nothing to go on.
  const { server } = resolvePaths();
  assert.ok(
    server.endsWith(join("dist", "index.js")),
    `expected a dist/ path, got ${server}`,
  );
  assert.doesNotMatch(server, /[/\\]src[/\\]/);
});

test("refuses to proceed when the server has not been built", () => {
  assert.throws(
    () => assertServerBuilt({ node: "/bin/node", server: "/nowhere/dist/index.js" }),
    /npm run build/,
  );
});

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

test("re-running with nothing to change writes nothing and makes no backup", async () => {
  // Otherwise every retry litters the user's Claude directory with identical
  // copies — seven of them accumulated while debugging a bad path.
  const configPath = await tempConfig();
  await installDesktop({ email: "a@example.test", paths: PATHS, configPath, now: NOW });
  const first = await readFile(configPath, "utf8");

  const second = await installDesktop({
    email: "a@example.test",
    paths: PATHS,
    configPath,
    now: NOW,
  });

  assert.equal(second.changed, false);
  assert.equal(second.backup, null);
  assert.equal(await readFile(configPath, "utf8"), first);
  const siblings = await readdir(join(configPath, ".."));
  assert.equal(siblings.filter((name) => name.includes(".bak-")).length, 0);
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
  assert.equal(Object.keys(written.mcpServers ?? {}).length, 1, "no duplicate entry");
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
