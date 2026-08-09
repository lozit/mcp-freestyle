<!-- generated-by: groundrules v1.10.0 -->
# Changelog

All notable changes to this project are documented in this file.

Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] - 2026-08-09

### Fixed
- `package.json` now carries `mcpName`, without which the MCP Registry refuses the package —
  it proves ownership by finding its own name inside it. 0.1.2 reached npm but never got
  listed; `check:versions` now asserts the pairing so it cannot recur

## [0.1.2] - 2026-08-09

Lists the server on the MCP Registry, so it can be found from MCP clients rather than only
from npm.

### Added
- `server.json` and a release step that lists the server on the
  [MCP Registry](https://registry.modelcontextprotocol.io), making it discoverable from MCP
  clients rather than only from npm
- `npm run check:versions` — the version lives in three places plus the git tag; CI checks
  they agree on every push, not only at release time. `npm version` syncs `server.json`
  automatically, so releasing stays two commands

## [0.1.1] - 2026-08-09

Fixes a startup failure that an MCP client could only report as "Server disconnected", and
refreshes the package page — 0.1.0 shipped a README describing the project as unpublished.

### Added
- CI on push and pull request: typecheck and tests across Linux, macOS and Windows, plus a
  job that boots the built server on every Node version `engines` claims to support
- `npm run check:starts` — asserts the built server starts and serves both tools
- Tag-triggered npm publishing via Trusted Publishing (no token, no interactive 2FA), with
  guards on tag/version agreement and on a README that still says "not published"
- `docs/RELEASE.md` — the release procedure and its one manual prerequisite

### Fixed
- **The server no longer exits at startup when credentials are missing.** It started before
  the transport connected, so an MCP client could only report "Server disconnected". Config
  now resolves on first tool use and the failure arrives as a tool error the user can read
- `npm test` used single quotes around its glob, which are not shell syntax on Windows
- The npm package page now shows the real README; 0.1.0's tarball carried the pre-release
  copy, and npm only refreshes it on a new version

## [0.1.0] - 2026-08-06

First published release. Reads a FreeStyle sensor from an MCP client; validated end to end
against a real account and through Claude Desktop.

Two known gaps, both stated in the README: `TrendArrow` is passed through untranslated
because its mapping is unverified, and history caps at ~12 h because upstream ignores any
longer request.

### Added
- Project bootstrapped with groundrules on 2026-08-06
- ADR 0001 — stack: Node.js + TypeScript with `@modelcontextprotocol/sdk`
- ADR 0002 — data source: the unofficial LibreLinkUp / LibreView cloud API
- Verified LibreLinkUp contract (auth, region redirect, connections, graph) documented in
  `docs/ARCHITECTURE.md`, with six learnings captured in `docs/LEARNINGS.md`
- ADR 0003 — Nightscout as an alternate source at Milestone 4, replacing the plan to build a
  long-running collector
- Prior-art review of the two existing LibreLink MCP servers, recorded in ADR 0002 § Notes
- Project scaffolding: strict TypeScript, `node:test`, MIT licence, `npx` bin entry
- Domain layer: `Reading` (mg/dL canonical), `FactoryTimestamp` UTC parser, `buildSeries`
- LibreLinkUp client with injectable `fetch`: region discovery, `Account-Id`, token
  rotation, loud failure on malformed payloads
- Analysis layer: windowing, gap detection, time-in-range against the account's own band
- MCP stdio server exposing `get_current_glucose` and `get_glucose_history`
- `npm run smoke` — redacted end-to-end check against a real account
- `mcp-freestyle-login` / `-install` / `-logout`: the password goes to the OS keychain and
  the MCP client config carries only the e-mail
- `.claude/rules/typescript.md` — coding conventions scoped to `src/` and `scripts/`

### Changed
- V1 history horizon narrowed to ~12 h after upstream verification; long-term history moved
  to Milestone 4 (`docs/VISION.md`, `docs/ROADMAP.md`)
- **The password no longer belongs in the MCP client config.** It lives in the OS keychain;
  `LIBRELINKUP_PASSWORD` remains as a CI/one-off override

### Fixed
- The install wrote a server path resolved against the wrong root, producing a config that
  Claude Desktop could only report as "Server disconnected"

### Security
- Credentials are kept out of `claude_desktop_config.json`, which is world-readable, often
  synced, and routinely pasted into bug reports

[Unreleased]: https://github.com/lozit/mcp-freestyle/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/lozit/mcp-freestyle/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/lozit/mcp-freestyle/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/lozit/mcp-freestyle/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/lozit/mcp-freestyle/releases/tag/v0.1.0
