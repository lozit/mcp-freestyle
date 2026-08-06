<!-- generated-by: groundrules v1.10.0 -->
# Vision — mcp-freestyle

> Synthesis of the project intent. Source: interview. Update when intent evolves (rare; tactical decisions go in `docs/decisions/`).

## Goal

Expose a FreeStyle continuous glucose monitor (CGM) to an AI agent through the Model Context
Protocol, covering **both** altitudes in one server:

- **Real-time read** — the current glucose value and its trend.
- **History** — readings over a window (hours, days, weeks) and the aggregates built on them.

Success looks like: asking Claude *"what's my glucose right now?"* or *"how was my
time-in-range last week?"* and getting an answer grounded in real sensor data, with no
manual export step in between.

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

## V1 acceptance criteria

- **MCP tools work end to end** — a "current glucose" tool and a "history over N hours/days"
  tool both return real sensor data when called from Claude.
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
