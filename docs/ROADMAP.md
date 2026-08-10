<!-- generated-by: groundrules v1.10.0 -->
# Roadmap — mcp-freestyle

**Long-term** breakdown into deliverable milestones / increments.

> Distinct from `PLAN.md` (the **active** todo right now): the roadmap describes the trajectory, not the current task. Structural decisions go in `docs/decisions/`.

## Condensed vision

Read a FreeStyle sensor from an AI agent — current value and history — without any manual
export step, and without health data leaving the user's machine.

## Milestones

### Milestone 0 — Decisions

- **Goal**: settle the two forks that block everything else
- **Scope**: stack (Node/TS vs Python); data source (cloud API vs local/NFC read)
- **Exit criteria**: two ADRs in `docs/decisions/`, both `Accepted`
- **Status**: **Shipped** (2026-08-06) — ADR 0001 Node/TypeScript, ADR 0002 LibreLinkUp

### Milestone 1 — MVP: current reading

- **Goal**: one MCP tool returning the live glucose value
- **Scope**: auth, fetch, unit + timezone normalization, one tool, stdio transport
- **Exit criteria**: Claude answers "what's my glucose right now?" with real sensor data
- **Status**: **Shipped** (2026-08-06) — validated end to end against a real account:
  48 readings over 11.9 h, current reading 0 min old

### Milestone 2 — History and aggregates (~12 h horizon)

- **Goal**: query a time window and the aggregates over it, within what upstream actually
  provides
- **Scope**: history tool (N hours, N ≤ ~12), gap handling, time-in-range against the
  account's own `targetLow`/`targetHigh`
- **Exit criteria**: Claude answers "how has my time-in-range been today?" correctly, with
  gaps acknowledged rather than smoothed over, and states the range actually covered when the
  request exceeds the upstream cap
- **Status**: **Shipped** (2026-08-06) — windowing, gap detection and time-in-range ship
  with the tools, exercised through Claude Desktop. Not yet seen on a day with a real
  collection gap, which is the one path the tests can only simulate

### Milestone 3 — Installable by a third party

- **Goal**: someone else can run it
- **Scope**: packaging, credential setup, `README.md` install path, no secrets in repo
- **Exit criteria**: a third party installs and runs it in under 10 minutes from the
  `README.md` alone
- **Status**: **Shipped** (2026-08-06) — published to npm as `mcp-freestyle@0.1.0`, and a
  clean `npx mcp-freestyle` install from the registry starts and serves both tools. Password
  in the OS keychain, no credential in the client config. The exit criterion is only half
  proven: the path works, but no third party has walked it yet

### Milestone 4 — Decide whether long-term history is this project's problem

- **Goal**: settle where long-term history lives, with evidence rather than a hunch
- **Scope**: **not** an adapter inside this project
  ([ADR 0004](decisions/0004-nightscout-belongs-in-its-own-project.md)) — the tool surface
  cannot state one honest horizon for two sources with different limits, and a package named
  `mcp-freestyle` has no business reading Dexcom data. If a Nightscout server is built, it is
  a separate project. Ten already exist, none above 4 stars
- **Exit criteria**: an existing Nightscout MCP server has been pointed at a real instance and
  asked for time in range over a week containing a sensor gap. Either the answer is honest —
  and the best outcome is a project not written — or the measurement justifies writing one
- **Status**: Deferred, and possibly never. The ~12 h horizon is a standing property of this
  project, not a temporary one
- **Time-sensitive, whatever the outcome**: Nightscout cannot backfill. It only holds history
  from its install date, so every day of delay is a day permanently lost — and it is the
  prerequisite for the evaluation above

## Out of scope (for now)

Deferred by the V1 non-goals (`docs/VISION.md`): write access / dose calculation, UI or
dashboard, real-time hypo/hyper alerts, multi-user support, long-term history (see Milestone 4).
