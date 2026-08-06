<!-- generated-by: groundrules v1.10.0 -->
# Vision — mcp-freestyle

> Synthesis of the project intent. Source: interview. Update when intent evolves (rare; tactical decisions go in `docs/decisions/`).

## Goal

Expose a FreeStyle continuous glucose monitor (CGM) to an AI agent through the Model Context
Protocol, covering **both** altitudes in one server:

- **Real-time read** — the current glucose value and its trend.
- **History** — readings over a window and the aggregates built on them.

Success looks like: asking Claude *"what's my glucose right now?"* or *"how has my
time-in-range been today?"* and getting an answer grounded in real sensor data, with no
manual export step in between.

> **Horizon amended 2026-08-06.** The original goal said "hours, days, weeks". Verification
> against the real upstream (ADR 0002) showed the data is not there to support it: the `graph`
> endpoint caps at ~12 hours, and `logbook` returns discrete events — 14 of 17 being alarms —
> which are systematically skewed toward out-of-range and unusable for any aggregate. Longer
> history would require a separate long-running collector, since an MCP stdio server only
> lives for the duration of a client session. **V1 therefore targets a ~12-hour horizon.**
> Long-term history is deferred to Milestone 4, not abandoned.

## Users / personas

Open source, aimed at **other people living with diabetes** who already use a FreeStyle
sensor and run an MCP-capable agent (Claude Desktop, Claude Code, or any MCP client).

Each installation is self-hosted and bound to a single sensor account — the project is
distributed publicly, but it is not a multi-tenant service (see non-goals). The maintainer
is also user #1.

## Constraints

- **Health data — nothing leaves in clear.** Glucose readings and sensor credentials stay
  local: never committed, never sent to a third party that isn't strictly necessary to
  fetch the data. This constraint outranks convenience.
- **Not a medical device.** The tool is informational. No treatment decision may depend on
  it. This must be stated plainly in the `README.md` and must not be softened.

<!-- Other constraints (delivery deadline, budget, upstream API stability) are not yet defined —
     fill them in as they become known rather than leaving them implicit. -->

## Out of scope for V1 (non-goals)

- **No writing, no dosing.** Read-only. No bolus calculation, no command sent to a pump or
  any other device.
- **No UI / dashboard.** The MCP server is the only interface; no web app.
- **No real-time alerts.** No push notifications for hypo/hyper events.
- **No multi-user support.** One sensor account per installation.
- **No long-term history.** The ~12-hour upstream horizon is accepted as-is; no local
  accumulation, no background collector. Deferred to Milestone 4.

## V1 acceptance criteria

- **MCP tools work end to end** — a "current glucose" tool and a "history over the last N
  hours" tool (N ≤ ~12) both return real sensor data when called from Claude, and
  time-in-range is computed over that window against the account's own target band.
- **The horizon is stated, never implied** — when a requested window exceeds what upstream
  returns, the answer says what range it actually covers rather than silently aggregating
  over less.
- **A third party installs it in under 10 minutes** — another person with a FreeStyle sensor
  clones/installs, supplies their own credentials, and it works following the `README.md`
  alone.
- **No secret and no reading in the repo** — credentials come from environment variables or
  local config; `.gitignore` verified; zero real data committed.
- **Units and timezones are correct** — mg/dL and mmol/L both handled explicitly; timestamps
  render in local time with no silent offset.

---

Further reading:
- `intake/` — raw upstream notes (specs, emails, brainstorms)
- `docs/decisions/` — structural decisions made during the project
- `docs/LEARNINGS.md` — non-trivial learnings
- `docs/ARCHITECTURE.md` — architecture snapshot
