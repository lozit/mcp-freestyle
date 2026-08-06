<!-- generated-by: groundrules v1.10.0 -->
# Architecture — mcp-freestyle

**Living** snapshot of the current architecture. Updated as the structure evolves.

For the **why** behind choices → see `docs/decisions/`.

## Overview

The server sits between an MCP client and Abbott's cloud. It reads; it never writes.

```
FreeStyle sensor ──▶ LibreLink app (phone) ──▶ LibreView cloud
                                                     │
                                          [unofficial LibreLinkUp API]
                                                     │
                                                     ▼
  Claude ◀──MCP (stdio)──▶  mcp-freestyle  ──▶  upstream client (isolated)
                                  │
                                  └─▶ normalization (units, timezones)
```

The dashed dependency is the fragile one — see ADR 0002. Everything upstream of LibreView is
outside this project's control and is a **prerequisite**, not a component.

## Stack

Node.js + TypeScript, `@modelcontextprotocol/sdk`, run via `npx` ([ADR 0001](decisions/0001-stack-node-typescript.md)).

## Components

> Planned decomposition — update as it is actually built, don't let it describe an intention.

### MCP server / transport — `src/index.ts`

Owns the tool surface exposed to the agent and the stdio transport. Depends on the
normalization layer only — it must never touch the upstream client directly.

**stdout carries the MCP protocol.** Every diagnostic goes to stderr; a stray
`console.log` corrupts the transport.

Two tools: `get_current_glucose` and `get_glucose_history`. Both are read-only
(`readOnlyHint`), both state the instant a reading was actually measured rather than
implying "now", and the history tool reports the range it covered plus a `truncated`
flag — never the range that was requested.

### Upstream client (LibreLinkUp) — `src/upstream/`

Authentication, fetch, retry, regional endpoint selection. **Deliberately isolated in one
module** so that a breaking upstream change has a single blast radius (ADR 0002). Emits raw
upstream shapes; validates them; fails loudly on anything unexpected.

`fetch` is injectable, which is what makes the whole contract testable without touching the
network — the suite drives every branch (region redirect, token rotation, rate limiting,
malformed payloads) against a stub.

#### Verified upstream contract

> Verified against a real account on **2026-08-06**, then exercised end to end the same day
> (`npm run smoke`): login → region redirect (`fr`) → `Account-Id` → connections → graph,
> 48 readings over 11.9 h. Everything here is observed, not documented by Abbott —
> re-verify after any upstream version bump.

**Headers.** `product: llu.android` and `version: 4.16.0` on every request. The version is
pinned and has churned (`4.2.1` → `4.12` → `4.16.0`), each bump breaking clients — so it must
be a **configuration value, never a constant in code**. Authenticated requests additionally
require `authorization: Bearer <token>` and `Account-Id: <sha256_hex(user.id)>` (hash the id
with **no trailing newline**).

**Login.** `POST /llu/auth/login` with `{email, password}` against `https://api.libreview.io`.
Two possible outcomes:

- `{"status":0,"data":{"redirect":true,"region":"fr"}}` → retry everything against
  `https://api-<region>.libreview.io`.
- Success → `data.authTicket.token`, `data.authTicket.expires`, `data.user.id`.

The region is **discovered, not configured** — good for install friction. Observed value `fr`
is absent from the community endpoint list, so the region must be followed as returned and
**never validated against an allowlist**.

**Token.** TTL 180 days (`duration: 15552000000` ms) and **not revocable**. A fresh `ticket`
is returned at the root of *every* authenticated response — capture the rotated one rather
than reusing the login token indefinitely.

**Connections.** `GET /llu/connections` → array of followed patients. Carries `patientId`,
the account's `targetLow`/`targetHigh`, and **the current reading already inlined** in
`glucoseMeasurement`. The "current glucose" tool therefore costs exactly one request.
`glucoseItem` is a byte-for-byte duplicate of `glucoseMeasurement` — ignore it.

**Graph.** `GET /llu/connections/{patientId}/graph?minutes=N` → `graphData`, ~15-minute
samples. **The `minutes` parameter is ignored**: `minutes=1440` returned 47 points spanning
11 h 30, not 24 h. Treat the window as a fixed ~12 h cap.

Two traps in `graphData`: it **lags the current reading** and does not contain it (append
`glucoseMeasurement` to build a complete series), and its points carry **no `TrendArrow`**
(`type: 0`; the current reading is `type: 1`).

The lag is **not fixed** — 19 min and 25 min both observed. Anything that reasons about
sample spacing must therefore ignore the appended current reading, or it will read that
join as a collection gap (`docs/LEARNINGS.md`).

**Logbook.** `GET /llu/connections/{patientId}/logbook` → **discrete events, not a series**.
Observed: 17 entries over 12 days — 14 alarms (`type: 2`) and 3 scans (`type: 1`). Same field
shape as `graph`, so one mapper serves both, but the semantics differ completely. Sorted
**newest-first**, the opposite of `graphData`. Never compute an aggregate from it.

**Rate limits.** Undocumented. `429` and also a non-standard `430` are reported. Community
practice caps polling at ~1 minute — well below the 15-minute data cadence, so there is no
reason to poll faster than the data changes.

**Do not trust `patientDevice.fixedLowThreshold`**: observed as `0` from `/connections` and
`70` from `/graph` for the same account at the same instant.

### Normalization layer — `src/domain/`

The only place where units and timezones are resolved: raw upstream payload → domain
`Reading` (canonical mg/dL + UTC timestamp). See `docs/DATA_MODEL.md`.

`buildSeries` lives here and encodes two upstream traps: it appends the current reading to
the graph samples (which lag it and omit it) and sorts by instant rather than trusting
upstream ordering (the two endpoints order oppositely).

### Analysis — `src/analysis/`

Windowing, gap detection, time-in-range against the account's own band. Excludes scans and
alarms from aggregates — an alarm fires on an excursion by definition, so counting them
skews the result systematically.

### Cache / storage

**Nothing.** V1 is pass-through: no persistence, therefore no retention question and no
at-rest encryption question. Revisit only at Milestone 4 (ADR 0003).

## Main flows

1. **Credential load + authentication** — credentials from env/local config → upstream login
   → session token held in memory. Never logged, never persisted to a tracked file.
2. **Current reading** — fetch latest → validate → normalize → return with its real
   `measured_at`, never labelled "now".
3. **Historical window + aggregates** — fetch range → normalize → compute (time-in-range and
   friends) with gaps acknowledged rather than smoothed over.

## Environments

- **Local**: the only environment. The server runs on the user's machine as an MCP stdio
  process, launched by the MCP client.
- **Staging / Production**: not applicable — nothing is deployed (`docs/VISION.md` non-goals:
  no UI, no multi-user, no hosted service).

## Points of attention

- **The upstream API is unofficial and can break without notice** (ADR 0002). This is the
  single largest structural risk in the project.
- **Session/token expiry** — the auth flow must handle re-login rather than surfacing a
  confusing failure mid-query.
- **Rate limits are unknown** — poll conservatively; do not hammer the upstream on every
  agent call if a short-lived cache would do.
- **Sensor gaps** (warm-up, disconnection, out of range) are data, not zeros. They must reach
  the agent as absence. See `docs/DATA_MODEL.md` § "Gaps are data".
- **Latency** — readings carry cloud round-trip delay and upstream granularity. "Current" is
  always "most recent known", and must be presented as such.
