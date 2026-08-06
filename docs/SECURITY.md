<!-- generated-by: groundrules v1.10.0 -->
# Security & Compliance — mcp-freestyle

**Living** document of security and compliance (GDPR / privacy) choices.

For the **why** behind structural decisions → see `docs/decisions/`.

> **Why this file matters here**: glucose readings are health data — a special category
> under GDPR Art. 9. The repo is also intended to be public. Both facts constrain every
> choice below.

## Authentication

- Method: sign-in to the **LibreLinkUp** service with a *follower* account owned by the user
  ([ADR 0002](decisions/0002-data-source-librelinkup.md)). We authenticate *to* an upstream
  service; we do not authenticate anyone *to* us.
- Session / token handling: the upstream session token is held **in memory only** — never
  written to a tracked file, never logged. Expiry must trigger a clean re-login rather than a
  confusing mid-query failure.
- **The token is valid ~180 days and cannot be revoked** (verified 2026-08-06:
  `duration: 15552000000` ms). There is no logout, no revocation endpoint, no way to kill a
  leaked token — changing the Abbott account password is the only recourse, and even that is
  unverified. This makes token leakage a *six-month* exposure, and is why it must never touch
  a log, a fixture, an error message, or a bug report.
- A **rotated ticket** is returned at the root of every authenticated response. Capture it;
  do not reuse the login token indefinitely.
- Reset, MFA: owned entirely by Abbott's account system. Out of this project's scope.
- Exact auth flow and required headers: **to verify against a real account before coding** —
  ADR 0002 records which route, not a validated contract.

## Authorization / access control

- Model: single-user, local process. No in-app authorization layer in V1 — access control is
  whoever can run the process and read its config files.
- Role × resource matrix: not applicable in V1 (see `docs/VISION.md` non-goals).

## Personal data (GDPR / privacy)

- Personal data collected: glucose readings (health data, GDPR Art. 9), sensor serial,
  account identifier for the data source.
- Legal basis for processing: self-processing by the data subject on their own device.
  Revisit if the project ever processes someone else's data.
- Retention period: **none — nothing is stored.** V1 is pass-through: readings are fetched,
  normalized, returned, and forgotten. No cache, no database, no files. This is the cheapest
  possible answer to retention and it is the one V1 gives.
- User rights (access, deletion, export): the user holds the data on their own machine;
  document how to wipe the local cache once one exists. Rights against the *upstream* copy
  are exercised with Abbott, not with us.
- Processors / transfers: **Abbott (LibreView / LibreLinkUp)** already holds this data before
  we read it — the user put it there via the LibreLink app, independently of this project.
  We add no new processor and no new transfer. Verify the account's regional endpoint, since
  it determines where the data is already stored.
- **Scope boundary that makes this defensible**: self-access by the data subject to their own
  data, on their own machine. Turning this into a hosted or multi-user service would change
  the legal analysis entirely — which is one more reason multi-user is a V1 non-goal.

## Secrets and configuration

- Where secrets live: environment variables or a local config file that is **git-ignored**.
  Never a tracked file, never a default in code.
- NEVER commit a secret. See `.gitignore` (`.env`).
- **Never log** credentials, tokens, or the sensor serial — not even at debug level.

## Attack surface and controls

- Untrusted inputs (forms, API, uploads) and validation: tool arguments arriving from the
  MCP client, and the upstream response payload. Validate both — a malformed upstream
  response must fail loudly, not silently produce a plausible-looking reading.
- Encryption in transit / at rest: transport to the upstream service is TLS (HTTPS only).
  At-rest encryption is **not applicable** — nothing is written to disk.
- Logging and audit: logs must be safe to paste into a bug report — that means no readings
  and no identifiers.

## Publishing safety (public repo)

Before any push or release, verify:

- no real readings in tests, fixtures, examples, or `docs/media/`
- no account email, sensor serial, token, or password anywhere in the tree or in git history
- `.env` and local config are ignored and were never committed

## Not a medical device

The project must not present output as clinical guidance, and must not compute doses or
therapy recommendations. This is a safety property, not a disclaimer to be softened — see
`README.md` and `docs/VISION.md`.

## Incident / disclosure

Procedure in case of a breach or leak: `<fill in>` — at minimum, a security contact in the
`README.md` and a rule that a leaked credential is rotated before anything else.
