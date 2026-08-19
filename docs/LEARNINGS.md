<!-- generated-by: groundrules v1.10.0 -->
# Learnings — mcp-freestyle

Rules learned from corrections and non-trivial discoveries during the project. Reverse-chronological order (newest at the top). **Re-read at session start.**

One entry = one **actionable rule**, not a journal note. Each entry has:
- a title that states the rule (imperative or "X: do Y");
- **Why** — the story behind it: what happened, what it cost (a revert, a lost CI cycle, a confused user…);
- **When to apply** — the concrete trigger conditions, so the rule fires at the right moment instead of being remembered too late.

Include the minimal code snippet / command when it is the fix.

---

## 2026-08-19 — A Bluetooth outage does not produce a gap: the sensor backfills

**Why**: observed against a real account with a sensor the user reported as faulty, its
Bluetooth not working. Expectation was a visible hole; the 11.7 h window came back with
**46 automatic samples, none spaced more than 15.53 min**, and zero gaps. Abbott's own
support documentation explains it: the Libre 3 app backfills automatically once it is back in
range of the sensor — no scan needed. The sensor buffers, the app fills in on reconnect, and
the uploaded history ends up complete.

**When to apply**: whenever reasoning about, testing, or explaining gap detection. It
measures something **rarer** than day-to-day connectivity trouble. What actually produces a
hole is the sensor not being read at all for long enough: warm-up after a change (~60 min,
`sensor.w`), removal, outright failure, or an app that never reconnects before the buffer
wraps. Transient loss of signal — by far the most common disruption — is invisible by design.

**Side effect worth keeping**: this validates the 31-minute threshold rather than changing
it. Real gaps are ≥60 min, and the largest genuine sample interval observed across three runs
is 15.53 min, so the threshold sits with wide margin on both sides. The 24-minute figure the
smoke test prints is the graph-to-current join, which `findGaps` already excludes (19, 24 and
25 min observed — the lag is variable, hence the exclusion rather than a bigger threshold).

## 2026-08-09 — The MCP Registry needs `mcpName` inside the npm package

**Why**: `server.json` was written and validated against the published schema, the registry
accepted the OIDC login and validated the manifest — then rejected the publish because
`package.json` lacked `"mcpName": "io.github.lozit/mcp-freestyle"`. That field is how the
registry proves you own the npm package it is about to point at: it looks for its own name
*inside* the package. Cost: an npm release that had already gone out and could not be
amended, so the fix needed another version.

**When to apply**: adding or renaming an MCP Registry entry. `server.json` and `package.json`
are a **pair** — `server.json.name` must equal `package.json.mcpName`, and
`server.json.packages[0].identifier` must equal `package.json.name`. `check-versions.mjs`
asserts both, because the failure lands *after* `npm publish` in the pipeline, at the one
point where nothing can be walked back.

## 2026-08-06 — LibreLinkUp: parse `FactoryTimestamp` as UTC, and never `new Date(str)`

**Why**: upstream readings carry two unmarked date strings in US format
(`"5/9/2027 09:26:00 AM"`). `FactoryTimestamp` is UTC; `Timestamp` is already local. Verified
on a real account: the two differed by exactly 2 h in August, which is CEST — so the delta is
just the current DST offset and will be 1 h in winter. Handing either string to `new Date()`
leans on host locale and silently yields a wrong instant, which on a glucose reading is not a
cosmetic bug.

**When to apply**: any time an upstream date string is turned into a domain value. Parse
`FactoryTimestamp` explicitly as UTC with an explicit format. Never infer the timezone from
the gap between the two fields.

## 2026-08-06 — Store `ValueInMgPerDl`; treat the user's unit as display only

**Why**: the payload supplies `ValueInMgPerDl` (unit in the field name) next to
`Value` + `GlucoseUnits`. Persisting `Value` would mean carrying a number whose meaning lives
in a sibling field — the exact shape of bug the project's unit rule exists to prevent.
`alarmRules` confirms the convention by carrying both scales (`th: 250` / `thmm: 13.9`).

**When to apply**: every conversion from an upstream payload to a domain `Reading`. Convert
to the user's preferred unit at the output edge, never in the middle.

## 2026-08-06 — The `graph` endpoint caps at ~12 h and ignores `minutes`

**Why**: `?minutes=1440` returned 47 points spanning 11 h 30, not 24 h. Assuming the
parameter works would produce aggregates silently computed over half the requested window —
a wrong answer that looks right.

**When to apply**: any history or aggregate feature. Never let a caller's requested window
imply the returned window; always compute the aggregate over the timestamps actually
received, and tell the agent what range it really got.

**This is not a hypothetical trap.** Both existing LibreLink MCP servers fall into it
(reviewed 2026-08-06, see ADR 0002 § Notes): they return `analysis_period_days: <requested>`
alongside statistics computed from ~12 h, and derive GMI — an HbA1c proxy needing ≥14 days —
from it. They *document* the 12 h limit, but in the tool description the model reads at call
time, not in the response that asserts the period. **Disclosure in the schema does not
substitute for honesty in the payload.**

## 2026-08-06 — An MCP server must start even when it is misconfigured

**Why**: config was resolved at startup, so a missing keychain entry made the process exit
before connecting. The MCP client shows exactly one thing for that — **"Server
disconnected"** — and the actionable message ("run `mcp-freestyle-login`") went to a stderr
nobody reads. This is the second time that same opaque string cost real debugging time; the
first was a bad server path in the client config.

**When to apply**: resolve credentials and configuration **lazily**, on first tool use, and
surface the failure as a tool error. The user asks a question and reads the answer — that is
where the instruction has to appear. Anything that can make the process exit before the
transport connects is invisible by construction. `npm run check:starts` guards this: it boots
the built server with no credentials and asserts it still serves both tools.

## 2026-08-06 — npm serves the README from the tarball, so finish it before publishing

**Why**: the README was polished right after `npm publish` rather than before. npm renders
the copy baked into the published tarball and only refreshes it on a new version, so the
package page for 0.1.0 greets every visitor with "Not published yet — from a clone". The
fix costs a whole patch release for a docs-only change.

**When to apply**: before any `npm publish`. README, CHANGELOG and LICENSE ship *inside* the
tarball — treat them as release artefacts subject to the same "is this true right now?" check
as the code, not as things to tidy afterwards. The git repository can be corrected in place;
a published tarball cannot.

## 2026-08-06 — Aggregate over automatic samples only, never the whole series

**Why**: the first real-account run showed a 1500-second interval in a series whose cadence
is ~900 s. Arithmetic located it exactly — 46 intervals of ~900 s plus one of 1500 s
accounts for the full 42 903 s span — and it was the join between the last graph point and
the current reading that `buildSeries` appends. The graph lag was 19 min the first time it
was measured and 25 min the second, so a gap threshold of 31 min is only a matter of time
away from reporting a collection gap that never happened.

**When to apply**: any aggregate over a series that mixes reading kinds. Filter to
`kind: Sample` (`type: 0`) first. Scans and alarms are event-triggered — their spacing
describes when *something happened*, not whether the sensor was collecting. This is the
same filter time-in-range already needed, for a different reason.

## 2026-08-06 — `logbook` is events, not a trace — never aggregate over it

**Why**: verified on a real account — 17 entries spanning 12 days, of which **14 are alarms**
(`type: 2`, matching `has_alarms` exactly) and 3 are manual scans (`type: 1`). The community
description "~2 weeks of glucose data" is true only in the sense that the entries span two
weeks; it is not a continuous series. An alarm fires *by definition* on an excursion, so any
time-in-range computed over this set is not merely imprecise — it is skewed hard toward
out-of-range, and would tell the user they live outside their target band.

**When to apply**: any aggregate (TIR, average, HbA1c estimate). Aggregate only over
`type: 0` samples from `graph`. `logbook` is usable for "when did I last alarm?" style
questions and nothing statistical.

**Type enum, as observed**: `0` = automatic sample (graph) · `1` = scan / current reading ·
`2` = alarm.

## 2026-08-06 — `logbook` is newest-first, `graphData` is oldest-first

**Why**: the two endpoints return opposite orderings. Assuming a shared convention silently
reverses a series — and a reversed glucose series still looks entirely plausible, so nothing
fails visibly.

**When to apply**: never rely on upstream ordering. Sort by `FactoryTimestamp` after parsing,
in every path.

## 2026-08-06 — `graphData` lags the current reading and omits it

**Why**: observed a ~19-minute lag (last graph point 11:01:59 UTC vs `glucoseMeasurement` at
11:21:00 UTC), and the current reading is absent from the array. A series built from
`graphData` alone silently ends in the past. Graph points also carry no `TrendArrow`
(`type: 0`) — only the current reading does (`type: 1`).

**When to apply**: whenever building a continuous series. Append `glucoseMeasurement` to
`graphData`, deduplicate on timestamp, and never advertise trend on a historical point.

<!-- Example:

## Palette changes: one mock screen first, then propagate

**Why**: a new primary color was propagated to all 7 prototypes before the user
saw it in context. Verdict: "revert it all" — one full commit/push/deploy cycle lost.

**When to apply**: any *substitutive* visual change (primary color, font, layout
overhaul). Apply on ONE representative screen, get a visual validation, then
propagate. Additive changes (a new utility class) are lower-risk.

-->
