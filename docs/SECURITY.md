<!-- generated-by: groundrules v1.10.0 -->
# Security & Compliance — mcp-freestyle

**Living** document of security and compliance (GDPR / privacy) choices.

For the **why** behind structural decisions → see `docs/decisions/`.

> **Why this file matters here**: glucose readings are health data — a special category
> under GDPR Art. 9. The repo is also intended to be public. Both facts constrain every
> choice below.

## Authentication

- Method: `<fill in>` (depends on the data source — decide as an ADR)
- Session / token handling: `<fill in>`
- Reset, MFA: `<fill in>`

## Authorization / access control

- Model: single-user, local process. No in-app authorization layer in V1 — access control is
  whoever can run the process and read its config files.
- Role × resource matrix: not applicable in V1 (see `docs/VISION.md` non-goals).

## Personal data (GDPR / privacy)

- Personal data collected: glucose readings (health data, GDPR Art. 9), sensor serial,
  account identifier for the data source.
- Legal basis for processing: self-processing by the data subject on their own device.
  Revisit if the project ever processes someone else's data.
- Retention period: `<fill in>` — depends on whether anything is cached locally.
- User rights (access, deletion, export): the user holds the data on their own machine;
  document how to wipe the local cache once one exists.
- Processors / transfers outside the EU: `<fill in>` — whatever upstream service the data
  is fetched from is a processor. Name it here once decided.

## Secrets and configuration

- Where secrets live: environment variables or a local config file that is **git-ignored**.
  Never a tracked file, never a default in code.
- NEVER commit a secret. See `.gitignore` (`.env`).
- **Never log** credentials, tokens, or the sensor serial — not even at debug level.

## Attack surface and controls

- Untrusted inputs (forms, API, uploads) and validation: tool arguments arriving from the
  MCP client, and the upstream response payload. Validate both — a malformed upstream
  response must fail loudly, not silently produce a plausible-looking reading.
- Encryption in transit / at rest: transport to the upstream service must be TLS. At-rest
  encryption of any local cache: `<fill in>`.
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
