# 0002 — Read glucose data from the LibreLinkUp cloud API

**Date**: 2026-08-06
**Status**: Accepted

## Context

The server needs glucose readings — current value and history. How they are obtained shapes
the whole architecture, the install procedure, and the project's exposure to breakage.

The maintainer's existing data path is: **FreeStyle sensor → LibreLink app on phone →
LibreView cloud**. That fact rules some options in and others out before any tradeoff is
weighed: nothing can be read that does not already flow somewhere reachable.

Abbott publishes no public developer API for consumer glucose data. Every option below is
either community-reverse-engineered or depends on something that is.

## Decision

Fetch readings from the **LibreLinkUp / LibreView cloud API**, using a *follower* account
that the maintainer's LibreLink app shares to. Reuse an existing community TypeScript client
rather than writing the HTTP layer from scratch.

The API is **unofficial and unsupported by Abbott**. This decision accepts that fragility
explicitly and pairs it with the mitigations listed under Consequences — it is not an
oversight to be discovered later.

## Alternatives considered

- **Direct sensor read over BLE/NFC** (the Juggluco / xDrip+ / DiaBLE approach): rejected on
  physical grounds, not on effort. The sensor transmits to whatever is next to the body; a
  server process on a laptop is not. It would also mean carrying reverse-engineered
  decryption that is specific to each sensor generation — a maintenance burden out of all
  proportion to a V1 that only needs to read.
- **Nightscout as an intermediary**: genuinely attractive — a documented, stable REST API
  (`/api/v1/entries`), token auth, and decoupling from Abbott entirely. Rejected because, in
  *this* setup, it does not remove the fragile dependency: the standard bridge feeding
  Nightscout from a LibreLink/LibreView path (`nightscout-librelink-up`) polls the same
  unofficial API. Nightscout would move the fragility behind a stable interface at the cost
  of three more services to deploy and maintain (Nightscout, MongoDB, the bridge) — which
  also breaks the "installs in under 10 minutes" criterion for anyone not already running it.
  Its real payoff is multi-vendor support (Dexcom, Medtronic), which V1 non-goals exclude.
- **Abstracting behind a data-source interface, LibreLinkUp as first adapter**: rejected for
  V1 as speculative abstraction — one implementation does not justify an interface, and
  `CLAUDE.md` says to write the minimum that solves the stated problem. Revisit when a second
  source is actually needed.

## Consequences

### Positive
- Shortest path from the existing setup: one process, no extra infrastructure.
- The "under 10 minutes" install criterion stays reachable — the user supplies LibreLinkUp
  credentials and nothing else.
- A maintained TypeScript client exists, so the upstream layer starts from working code.

### Negative / Tradeoffs
- **The API can break without warning.** It is undocumented by its owner and has historically
  required pinned client-version headers. Mitigations, all mandatory:
  - **Fail loudly.** A malformed or unexpected upstream response must surface as an error to
    the agent, never as a plausible-looking reading. A wrong glucose number is worse than no
    number — see `docs/SECURITY.md` § "Not a medical device".
  - **Isolate the upstream client** in one module, so a breaking change has one blast radius.
  - **Reopen this ADR** rather than patching around a break silently. Nightscout is the
    pre-analysed fallback if the direct route becomes untenable.
- **Prerequisites are inherited, and must be documented in the README**: the user must use
  the LibreLink phone app (a standalone FreeStyle reader uploads nothing continuously, so
  this route is unavailable to them) and must set up LibreLinkUp sharing to a follower
  account.
- **Readings are not real-time.** They arrive with cloud-round-trip latency and at the
  upstream's granularity, not the sensor's. The agent must never present a value as "now"
  without its actual `measured_at`.
- **Third-party terms.** The API is not affiliated with Abbott and the community
  documentation carries no usage grant. This is personal-data self-access by the data
  subject, which is what makes it defensible here — it would not be for a hosted service.

### Neutral
- Regional endpoints exist; which one applies depends on the user's account region. Treat it
  as configuration, not a constant.
- Polling interval and caching are deliberately left open — see `docs/DATA_MODEL.md`.

## Notes

- Community documentation: https://github.com/FokkeZB/libreview-unofficial (unofficial, not
  affiliated with Abbott Diabetes Care, Inc.)
- TypeScript client: https://github.com/DRFR0ST/libre-link-unofficial-api
- Nightscout (fallback route): http://nightscout.github.io/
- Related: ADR 0001 (stack) — decided jointly.
- **Verified 2026-08-06** against a real account: the route works end to end (login → region
  redirect `fr` → `Account-Id` → connections → graph). The observed contract is recorded in
  `docs/ARCHITECTURE.md` § "Verified upstream contract"; the traps it surfaced are in
  `docs/LEARNINGS.md`. The decision stands.
- One finding materially narrows what this route can deliver: the `graph` endpoint caps at
  **~12 hours**, so multi-day history is not available from it. That constrains scope rather
  than the decision — see `docs/VISION.md`.
- **Prior art, reviewed 2026-08-06**: two MCP servers already exist —
  [`amansk/librelink-mcp-server`](https://github.com/amansk/librelink-mcp-server) and its
  derivative [`sedoglia/librelink-mcp-server`](https://github.com/sedoglia/librelink-mcp-server)
  (both MIT, actively maintained, with genuinely good credential security: OS keychain,
  AES-256-GCM fallback, `0600` permissions). Worth reading as reference implementations.

  They do **not** make this project redundant, for a reason that is about contract rather than
  code quality. Verified in their source: `get_glucose_stats(days)` calls
  `getGlucoseHistory(days * 24)`, which fetches the ~12 h `graph` payload and filters it
  client-side against a cutoff — then returns `analysis_period_days: days`, the *requested*
  value. So a 7-day request yields ~12 h of data reported as 7 days, and GMI (an HbA1c proxy
  that clinically requires ≥14 days) is computed on it. `get_glucose_trends('monthly')` does
  the same over a claimed 30 days. There is no gap detection, and timestamps are parsed from
  the local `Timestamp` field via `new Date(str)` rather than from `FactoryTimestamp`.

  The 12 h limit *is* disclosed — in the tool description, which the model reads at call time,
  not in the response, which asserts a period it did not cover. That is precisely the failure
  mode this project's posture forbids (`docs/VISION.md`: not a medical device; `CLAUDE.md`:
  fail loudly; `docs/DATA_MODEL.md`: gaps are data). Fixing it upstream means changing what
  their tools promise, not patching a bug — which is why building rather than adopting is
  justified here, and why the finding is worth reporting to them regardless.
