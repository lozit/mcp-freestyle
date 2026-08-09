#!/usr/bin/env node
/**
 * `package.json` and `server.json` both carry the version, in three places, and
 * the MCP registry entry points at a specific npm version. A mismatch lists a
 * server against a package that does not contain it — so this runs in CI on
 * every push, not only at release time.
 *
 * No dependency: a JSON compare needs none, and the schema itself is validated
 * by `mcp-publisher validate` in the publish workflow.
 */
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

const pkg = read("../package.json");
const server = read("../server.json");

const found = {
  "package.json version": pkg.version,
  "server.json version": server.version,
  "server.json packages[0].version": server.packages?.[0]?.version,
};

// Only when run from a tag: the tag is the fourth place the version lives.
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null;
if (tag) found["git tag"] = tag.replace(/^v/, "");

const distinct = [...new Set(Object.values(found))];

if (distinct.length !== 1 || distinct[0] === undefined) {
  console.error("✖ version mismatch:");
  for (const [where, value] of Object.entries(found)) {
    console.error(`    ${where.padEnd(32)} ${value ?? "(missing)"}`);
  }
  process.exit(1);
}

if (server.packages?.[0]?.identifier !== pkg.name) {
  console.error(
    `✖ server.json names the npm package "${server.packages?.[0]?.identifier}", ` +
      `but package.json is "${pkg.name}"`,
  );
  process.exit(1);
}

console.log(`✔ ${distinct[0]} agrees across ${Object.keys(found).length} places`);
