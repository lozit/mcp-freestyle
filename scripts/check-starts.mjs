#!/usr/bin/env node
/**
 * Assert that the *built* server starts and speaks MCP.
 *
 * The test suite runs the TypeScript sources; this checks the artifact users
 * actually receive, on the Node versions `engines` claims to support. It is
 * plain `.mjs` rather than `.ts` on purpose — Node 20 cannot strip types, and
 * verifying the Node 20 claim is half the point.
 *
 * No credentials involved: `initialize` and `tools/list` are answered before
 * any upstream call, so this touches neither the keychain nor the network.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const SERVER = new URL("../dist/index.js", import.meta.url).pathname;
const TIMEOUT_MS = 15_000;

if (!existsSync(SERVER)) {
  console.error(`✖ ${SERVER} is missing — run \`npm run build\` first.`);
  process.exit(1);
}

const child = spawn(process.execPath, [SERVER], {
  stdio: ["pipe", "pipe", "pipe"],
  // An e-mail with no keychain entry: enough to get past config resolution,
  // and the tools are listed without ever authenticating upstream.
  env: { ...process.env, LIBRELINKUP_EMAIL: "ci@example.invalid" },
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => (stdout += chunk));
child.stderr.on("data", (chunk) => (stderr += chunk));

const fail = (message) => {
  console.error(`✖ ${message}`);
  if (stderr.trim()) console.error(`stderr: ${stderr.trim()}`);
  child.kill();
  process.exit(1);
};

const timer = setTimeout(() => fail(`no response within ${TIMEOUT_MS} ms`), TIMEOUT_MS);

child.on("error", (error) => fail(`could not spawn the server: ${error.message}`));
child.on("exit", (code) => {
  if (code !== 0 && code !== null) fail(`server exited with code ${code}`);
});

const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ci-check", version: "1" },
  },
});

child.stdout.on("data", () => {
  for (const line of stdout.split("\n").filter(Boolean)) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue; // a partial line; wait for the rest
    }

    if (message.id === 1) {
      const name = message.result?.serverInfo?.name;
      if (name !== "mcp-freestyle") fail(`unexpected serverInfo: ${JSON.stringify(message.result)}`);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    }

    if (message.id === 2) {
      const tools = (message.result?.tools ?? []).map((tool) => tool.name).sort();
      const expected = ["get_current_glucose", "get_glucose_history"];
      if (JSON.stringify(tools) !== JSON.stringify(expected)) {
        fail(`expected tools ${expected.join(", ")} — got ${tools.join(", ") || "(none)"}`);
      }
      clearTimeout(timer);
      console.log(`✔ built server starts on Node ${process.version} and serves: ${tools.join(", ")}`);
      child.kill();
      process.exit(0);
    }
  }
});
