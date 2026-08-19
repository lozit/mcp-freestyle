# 0004 — Nightscout belongs in its own project, if it is built at all

**Date**: 2026-08-10
**Status**: Accepted — partially supersedes [ADR 0003](0003-nightscout-as-alternate-source.md)

## Context

ADR 0003 settled two things: do **not** build a long-running collector, because Nightscout
already is one; and support Nightscout as an alternate data source *inside this project*, at
Milestone 4, behind a source interface.

The first half still holds. The second half was decided without two facts that have since
surfaced.

**The tool surface cannot honestly serve both sources.** `get_glucose_history` carries
`.max(12)` in its schema and a description that states the ~12 h cap, because that cap is
real for LibreLinkUp. Nightscout has no such limit. Merging the two makes the schema and the
description conditional on configuration — technically easy, but it turns a flat guarantee
("what the tool says is what it delivers") into one that has to hedge. That guarantee is the
reason this project exists rather than adopting the prior art (ADR 0002 § Notes).

**The audience is not the same.** Nightscout aggregates Dexcom, Medtronic, Libre and others.
A package named `mcp-freestyle` reading Dexcom data would be lying in its name, and nobody
searching npm or the MCP Registry for "Nightscout" would find it.

## Decision

If a Nightscout MCP server is built, it is a **separate project** with its own name, package
and registry entry. `mcp-freestyle` stays a FreeStyle/LibreLinkUp server.

**It is not committed to.** A prior-art survey (below) leaves the case materially weaker than
the one that justified this project, so the decision to build is deferred until there is
evidence rather than a hunch.

No shared library is extracted. The domain module would be copied, not factored out — the
same refusal of speculative abstraction as ADR 0002 and ADR 0003. Two real consumers can
inform an interface later; one cannot.

## Alternatives considered

- **Nightscout as a second source inside `mcp-freestyle`** (what ADR 0003 said): rejected for
  the two reasons above. The name would mislead, and the honesty guarantee would have to be
  qualified per source.
- **Extract a shared domain library now**: rejected. It is the right shape *if* both servers
  exist and drift painfully — which is a reason to wait, not a reason to act.
- **Build the Nightscout server immediately**: deferred. See the survey.

## Prior art, surveyed 2026-08-10

At least **ten** Nightscout MCP servers exist on GitHub. None exceeds 4 stars. The most
developed — [b77ai/nightscout](https://github.com/b77ai/nightscout) (MIT, 4★) — exposes
around fifteen tools: glucose, time-in-range with an estimated A1C, treatments,
insulin-on-board, profiles.

Two observations, and one caveat about how much they are worth.

- **They all write.** `log_treatment`, `remove_treatment`, and `update_nightscout_profile` —
  which modifies basal rates, insulin sensitivity factor and carb ratios. Those are the
  inputs to a dose calculation. Read-only by design remains a real differentiator.
- **None documents coverage or gap handling.** As with the LibreLink servers, nothing states
  the period actually covered versus the period requested.

**The caveat matters.** Against the LibreLink servers the case rested on a defect *verified in
their source*: `analysis_period_days: <requested>` returned alongside statistics computed
from ~12 h, with GMI derived from it. Here there is only documentation silence — absence of
evidence, not evidence of absence.

And the differentiator itself is weaker in this domain. The covered-versus-requested
guarantee earns its keep because LibreLinkUp caps at ~12 h and ignores the window asked for.
Nightscout can actually serve what it is asked. The guarantee still matters for sensor gaps;
it is no longer the glaring defect it corrects upstream.

## Consequences

### Positive
- `mcp-freestyle` keeps one source, one honest contract, and an unconditional tool schema.
- Milestone 4 shrinks from "build an adapter" to "decide, with evidence, whether to build
  anything" — the cheapest possible version of that milestone.
- Nothing is foreclosed: a separate project can start whenever the evidence justifies it.

### Negative / Tradeoffs
- Long-term history stays unavailable from `mcp-freestyle`. The ~12 h horizon is now a
  standing property of this project rather than a temporary one — `docs/VISION.md` already
  says so, and this makes it durable.
- If the Nightscout server is eventually built, the domain module is duplicated. Accepted
  knowingly; extraction stays available.

### Neutral
- No code changes. This records a decision about work not to do.

## Notes

**Followed up 2026-08-19**: Nightscout was installed and is accumulating. The evaluation it
unblocks — pointing an existing server at it and asking for time in range over a week
containing a real sensor gap — has moved **out of this repository**, which is the natural
consequence of this ADR: the question belongs wherever the separate project would live, not
here. `docs/ROADMAP.md` Milestone 4 is closed accordingly.

Nothing in `mcp-freestyle` depends on the answer. Its ~12 h horizon stops being provisional
and becomes a standing property of the project.

- ADR 0003 stands on its first decision: no collector is to be written.
- Related: `docs/VISION.md` (V1 non-goals), `docs/ROADMAP.md` Milestone 4.
