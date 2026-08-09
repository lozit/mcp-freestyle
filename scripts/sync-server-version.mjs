#!/usr/bin/env node
/**
 * Copy the version from package.json into server.json.
 *
 * Run by npm's `version` lifecycle hook: npm bumps package.json, then runs this
 * before creating the commit, so `git add` here lands server.json in the same
 * commit and the tag points at a consistent tree.
 *
 * Without it, `npm version patch` leaves server.json a version behind and
 * `check-versions.mjs` fails the very push that was meant to release — a
 * manual step documented in RELEASE.md would be a step to forget.
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = (name) => new URL(`../${name}`, import.meta.url);

const version = JSON.parse(readFileSync(path("package.json"), "utf8")).version;
const server = JSON.parse(readFileSync(path("server.json"), "utf8"));

server.version = version;
if (server.packages?.[0]) server.packages[0].version = version;

// Trailing newline: the file is committed, and a missing one makes every diff
// touch the last line.
writeFileSync(path("server.json"), `${JSON.stringify(server, null, 2)}\n`);
console.log(`server.json synced to ${version}`);
