<!-- generated-by: groundrules v1.10.0 -->
# Glossary — mcp-freestyle

Domain vocabulary for the project. One entry per term, alphabetical order.

Keep definitions short and precise. The goal: a new developer (or Claude) quickly understands the domain language.

> Definitions below are **starters** — verify each against a primary source before relying on
> it, and correct it here rather than in a comment somewhere else.

---

## C

**CGM (Continuous Glucose Monitor)** — A wearable sensor that samples interstitial glucose at
a fixed interval instead of requiring a finger-prick per reading.

## F

**FreeStyle** — The Abbott family of glucose-monitoring products this project reads from.

## F

**Follower account** — A LibreLinkUp account the primary user shares their readings *to*.
This project signs in as the follower; it never touches the primary account.

## G

**Glucose reading** — One measurement: a value, a unit, a timestamp, and (usually) a trend
arrow. In this project a reading is never passed around without its unit.

## L

**LibreLink** — Abbott's phone app that reads the sensor and uploads to LibreView. It is
**upstream of this project and a prerequisite**, not a component of it.

**LibreLinkUp** — Abbott's sharing service, letting a follower see another user's readings.
Its API is the project's data source ([ADR 0002](decisions/0002-data-source-librelinkup.md)) —
**unofficial, undocumented by Abbott, and liable to break**.

**LibreView** — Abbott's cloud where the LibreLink app stores readings.

## M

**MCP (Model Context Protocol)** — The protocol this project speaks to expose sensor data to
an AI agent.

**mg/dL** — Milligrams per decilitre. One of the two glucose units in common use.

**mmol/L** — Millimoles per litre. The other common glucose unit. `mmol/L ≈ mg/dL / 18.0182`.
Never assume which unit a source returns.

## N

**Nightscout** — Open-source, self-hosted app ("CGM in the Cloud") that stores and shares CGM
data behind a documented REST API. **Not used** by this project — considered and rejected in
[ADR 0002](decisions/0002-data-source-librelinkup.md), kept as the pre-analysed fallback if
the LibreLinkUp route becomes untenable.

## R

**Resource (MCP)** — Data an MCP server exposes for the agent to read, addressed by URI.

## T

**Time in range (TIR)** — The share of readings falling inside a target glucose band over a
period. The band is user-configurable, not a constant.

**Tool (MCP)** — An action an MCP server exposes that the agent can call with arguments.

**Trend arrow** — The direction/rate-of-change indicator attached to a current reading
(rising, falling, steady).

<!-- Continue alphabetically -->
