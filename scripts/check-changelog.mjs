#!/usr/bin/env node
/**
 * Assert the version being released has a section in CHANGELOG.md.
 *
 * CHANGELOG.md ships inside the npm tarball, and npm only refreshes it on a new
 * version — so a release whose notes still sit under `[Unreleased]` publishes a
 * changelog that does not mention the version it accompanies, permanently.
 *
 * This exists because the rule alone did not hold. It was written down on
 * 2026-08-06 and broken on 2026-08-19; the README equivalent has had a check in
 * the pipeline since the first time and has not recurred. A guard that has to be
 * remembered is not a guard.
 */
import { readFileSync } from "node:fs";

const path = (name) => new URL(`../${name}`, import.meta.url);

const version = JSON.parse(readFileSync(path("package.json"), "utf8")).version;
const changelog = readFileSync(path("CHANGELOG.md"), "utf8");

if (!changelog.includes(`## [${version}]`)) {
  console.error(
    `✖ CHANGELOG.md has no "## [${version}]" section.\n` +
      `  Move the [Unreleased] entries under it before tagging — the file ships\n` +
      `  inside the tarball and npm will not refresh it until the next version.`,
  );
  process.exit(1);
}

console.log(`✔ CHANGELOG.md documents ${version}`);
