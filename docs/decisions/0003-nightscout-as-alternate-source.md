# 0003 — Nightscout as an alternate source, not a collector to build

**Date**: 2026-08-06
**Status**: Accepted

## Context

ADR 0002 settled LibreLinkUp as the V1 data source. Verifying it against a real account then
surfaced a hard limit: the `graph` endpoint returns ~12 hours, and `logbook` returns discrete
events (14 of 17 observed entries were alarms), unusable for any aggregate. V1 was narrowed to
a ~12-hour horizon accordingly (`docs/VISION.md`).

That left long-term history as Milestone 4, scoped as *"build a separate long-running
collector"* — necessary because an MCP stdio server is launched by its client and dies with
the session, so it cannot poll on its own.

Building that collector means taking on a daemon lifecycle (launchd/cron), its packaging, its
own install documentation, plus the storage, retention and at-rest-encryption decisions it
drags in. That is a service, not a feature.

Nightscout already is that service: self-hosted, open source, storing CGM data indefinitely
behind a documented REST API. Crucially, `nightscout-connect` supports LibreLinkUp directly —
including regional behaviour, timestamp handling, and uploading `graphData` *plus* the current
glucose item specifically to work around the historical-graph delay. That is the same
workaround this project independently identified (`docs/LEARNINGS.md`), arrived at
independently, which is a good signal about that implementation's quality.

ADR 0002 rejected Nightscout, but on reasoning made *before* the 12-hour cap was known: it
judged Nightscout's payoff to be multi-vendor support, which V1 excludes. That was incomplete.
Nightscout's real payoff here is **history** — which V1 wants and cannot otherwise have.

## Decision

When long-term history is taken up (Milestone 4), **support Nightscout as an alternate data
source** behind a source interface. Do **not** build a collector.

Explicitly **not** now: V1 keeps a single source and no abstraction. The interface gets
written when the second source lands, not before.

## Alternatives considered

- **Build our own collector** (the original Milestone 4): rejected. It would reimplement a
  battle-tested system, and pull in daemon packaging, scheduling, retention and at-rest
  encryption — a disproportionate cost for a project whose V1 is a read-only stdio server.
- **Make Nightscout the *only* source**: rejected. It would impose a Nightscout deployment on
  every user, breaking the "installs in under 10 minutes" criterion for anyone who does not
  already run one. LibreLinkUp-direct must stay the zero-infrastructure path.
- **Introduce the source abstraction now**: rejected, consistent with ADR 0002 and with
  `CLAUDE.md`'s "keep the diff small". One implementation does not justify an interface. The
  difference from ADR 0002 is that the second source is no longer hypothetical — it is named,
  analysed, and scheduled. That justifies the abstraction *when it arrives*, not today.

## Consequences

### Positive
- Milestone 4 shrinks from "ship a service" to "write an adapter".
- Users already running Nightscout get real long-term history at no additional cost to them.
- The fragile upstream stops being our sole problem on that path: the Nightscout project
  absorbs LibreLinkUp breakage for its own bridge.
- Two concrete sources make the source interface an informed design rather than a guess.

### Negative / Tradeoffs
- Two sources mean two normalizations and two sets of semantics to keep honest. Nightscout's
  entries are not shaped like LibreLinkUp's payloads.
- **Nightscout cannot backfill.** It only holds history from the moment it is installed. Any
  user wanting a week of history must run it for a week first — this must be stated plainly
  in the docs rather than discovered.
- It is still fed by the same unofficial API upstream, so it mitigates the *blast radius* of
  a break, not its likelihood.
- Supporting a second source means the "under 10 minutes" claim becomes path-dependent. The
  README must be explicit about which path it describes.

### Neutral
- No code changes in V1. This ADR constrains a future milestone; it is recorded now because
  the analysis is fresh, not because work starts.

## Notes

- Nightscout: http://nightscout.github.io/
- `nightscout-connect` (LibreLinkUp support, incl. the graph-delay workaround):
  https://github.com/nightscout/nightscout-connect
- Retention: nothing is auto-deleted; data accumulates until the database fills. The MongoDB
  Atlas free tier caps at 512 MB, which holds years of CGM entries.
- Supersedes the Nightscout reasoning in ADR 0002 (which stands as the V1 source decision).
- Related: `docs/VISION.md` (horizon amendment), `docs/ROADMAP.md` Milestone 4.
