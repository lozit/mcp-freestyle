<!-- generated-by: groundrules v1.10.0 -->
# mcp-freestyle

A Model Context Protocol server that reads data from a FreeStyle glucose sensor.

## Requirements

This server reads your data from Abbott's cloud, so it only works if your data already gets
there. You need **all** of the following:

- **A FreeStyle sensor read by the LibreLink app on a phone.** If you use a standalone
  FreeStyle reader instead, nothing is uploaded continuously and this server cannot help you.
- **LibreLinkUp sharing set up** from that LibreLink app to a follower account. The server
  signs in as the follower.
- **Node.js ≥ 20**, and a working OS keychain (macOS Keychain, Windows Credential Manager,
  or libsecret on Linux).

> The server talks to the **unofficial** LibreLinkUp / LibreView API, which is not affiliated
> with or supported by Abbott. It can stop working without notice. See
> [`docs/decisions/0002-data-source-librelinkup.md`](docs/decisions/0002-data-source-librelinkup.md).

## Quickstart

### 1. Install

Not published yet — from a clone:

```bash
git clone <this repo> && cd mcp-freestyle
npm install && npm run build
```

Once published: `npm install -g mcp-freestyle`.

### 2. Log in once

```bash
npm run login          # from a clone
mcp-freestyle-login    # if installed globally
```

You're prompted for your **LibreLinkUp follower** e-mail and password. The password is
verified by actually authenticating — if it's wrong, or sharing isn't set up, you find out
now rather than at the first question you ask Claude. It is then stored in your **OS
keychain**, never in a config file.

The token upstream issues is *not* stored. It lives ~180 days with no revocation path, so
keeping it around would be the bigger risk; the server re-authenticates instead.

At the end, `login` offers to wire the server into Claude Desktop in one step.

### 3. Hook it up to Claude

**Claude Desktop** — one command:

```bash
mcp-freestyle-install
```

It merges an entry into `~/Library/Application Support/Claude/claude_desktop_config.json`
(`%APPDATA%\Claude\…` on Windows) using absolute paths, backing up any existing config
first and leaving your other servers untouched. It refuses to overwrite a config it can't
parse. Quit Claude Desktop fully (⌘Q) and relaunch.

**Claude Code**:

```bash
mcp-freestyle-install code   # prints the exact `claude mcp add` command
```

**The written entry contains only your e-mail** — an identifier, not a secret. That is the
point of the keychain step: a config file that gets synced, backed up, or pasted into a bug
report never holds a credential.

To remove the stored password: `mcp-freestyle-logout`.

## Configuration

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LIBRELINKUP_EMAIL` | yes | — | Your **LibreLinkUp follower** account, not the primary LibreLink one |
| `LIBRELINKUP_PASSWORD` | no | keychain | Overrides the keychain. For CI or a one-off run — not the expected path |
| `LIBRELINKUP_VERSION` | no | `4.16.0` | Pinned client version. Upstream rejects stale values — if requests start failing, set this to the current LibreLinkUp app version |
| `LIBRELINKUP_PRODUCT` | no | `llu.android` | |
| `LIBRELINKUP_BASE_URL` | no | `https://api.libreview.io` | Entry point only; the regional host is discovered at login |

## Tools

| Tool | What it returns |
|---|---|
| `get_current_glucose` | The most recent measurement with the instant it was actually taken, plus the account's own target band. Never presented as a live "now" reading. |
| `get_glucose_history` | Readings over the last N hours (max 12) with time-in-range. Always states the range it **actually** covered and flags `truncated` when upstream returned less than asked. Collection gaps are listed, never interpolated across. |

Upstream holds only ~12 hours of detailed data. Longer horizons are a
[deferred milestone](docs/ROADMAP.md), not a limitation of these tools.

## Development

```bash
npm test          # Node's built-in test runner — no build step needed
npm run typecheck # strict TypeScript, the project's only lint gate
npm run build     # emits dist/
```

## Usage

To be completed.

## Project structure

- `README.md` — this file
- `CLAUDE.md` — instructions for Claude Code
- `docs/` — project documentation (architecture, decisions, learnings)
- `intake/` — upstream notes and raw specs
- `docs/media/` — visual assets

## Documentation

- Vision: [`docs/VISION.md`](docs/VISION.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Learnings: [`docs/LEARNINGS.md`](docs/LEARNINGS.md)
- Glossary: [`docs/GLOSSARY.md`](docs/GLOSSARY.md)
- Data model: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)
- Security & privacy: [`docs/SECURITY.md`](docs/SECURITY.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Disclaimer

**Not a medical device.** This project is informational only. Do not use its output to
make any treatment decision (dosing, correction, therapy adjustment). Always rely on your
official reader/app and your care team.

## Contributing

To be completed.

**One rule that is not negotiable**: never commit a real glucose reading, sensor
serial, account identifier, or credential. Tests use synthetic fixtures only.

## License

[MIT](LICENSE) © Guillaume Ferrari
