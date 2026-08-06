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
- **Status**: In progress

### Milestone 1 — MVP: current reading

- **Goal**: one MCP tool returning the live glucose value
- **Scope**: auth, fetch, unit + timezone normalization, one tool, stdio transport
- **Exit criteria**: Claude answers "what's my glucose right now?" with real sensor data
- **Status**: Upcoming

### Milestone 2 — History and aggregates

- **Goal**: query a time window and the aggregates over it
- **Scope**: history tool (N hours/days), gap handling, time-in-range
- **Exit criteria**: Claude answers "how was my time-in-range last week?" correctly, with
  gaps acknowledged rather than smoothed over
- **Status**: Upcoming

### Milestone 3 — Installable by a third party

- **Goal**: someone else can run it
- **Scope**: packaging, credential setup, `README.md` install path, no secrets in repo
- **Exit criteria**: a third party installs and runs it in under 10 minutes from the
  `README.md` alone
- **Status**: Upcoming

## Out of scope (for now)

Deferred by the V1 non-goals (`docs/VISION.md`): write access / dose calculation, UI or
dashboard, real-time hypo/hyper alerts, multi-user support.
