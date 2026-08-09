<!-- generated-by: groundrules v1.10.0 -->
# PLAN — mcp-freestyle

**Active** plan/todo for the project. Maintained by Claude during work.

This file differs from the long-term roadmap: it describes what is happening **now**.

## In progress

- [ ] **Collect `TrendArrow` evidence** — run `npm run smoke` across a clear rise and a
      clear fall, and record arrow + slope each time. Two flat/near-flat observations have
      both shown `3`, which is *consistent with* "steady" but maps nothing else. Do not
      write the enum until the extremes have been seen.

## Up next

- [ ] **Map `TrendArrow`** — carried verbatim as `rawTrendArrow` and deliberately
      untranslated. Needs verification against a real account; do not guess the enum
- [ ] Report the requested-period defect upstream to the two existing LibreLink MCP servers
      (evidence and code excerpts are in ADR 0002 § Notes)
- [ ] Exercise the history tool on a day with a real collection gap — the one path the tests
      can only simulate. Everything else is now proven through a client

## Ideas — to triage

Raw ideas, captured before they're lost (e.g. via `/groundrules:idea`). Not yet vetted. Each gets triaged later → a **decision** (ADR), a **build** (PRD), a **milestone** (ROADMAP), or dropped.

- [ ] ...

## Waiting / blocked

- [ ] ...

## Recently done

- [x] Retry on rate-limited and transient upstream failures (2026-08-09) — composed as a
      decorator on the transport, so no call signature changed and no existing test moved

- [x] **Published** (2026-08-06) — `mcp-freestyle@0.1.0` on npm and the repo public at
      github.com/lozit/mcp-freestyle. A clean `npx` install from the registry starts and
      serves both tools, which is the first time the third-party path has been walked at all
- [x] **Working in Claude Desktop** (2026-08-06) — Claude reads the glucose through the
      client, which closes the V1 goal in `docs/VISION.md`. `mcp-freestyle-install` writes a
      working config and the password comes from the OS keychain. Getting there exposed two
      bugs of mine: a server path resolved against the wrong root, and a precondition one
      caller routed around (`docs/AGENT-EVALS.md`)
- [x] **Milestone 1 validated end to end against the real account** (2026-08-06):
      48 readings over 11.9 h, `truncated` correctly true for a 24 h request, 0 real gaps,
      current reading 0 min old and matching the tail of the series. The run also caught a
      false-gap bug at the graph→current join — fixed, with a regression test
- [x] Scaffolded the project: strict TS, `node:test`, MIT licence, trunk-based branching.
      Domain layer done — `Reading` (mg/dL canonical), `FactoryTimestamp` parser (10 tests
      green), `buildSeries` handling the graph lag and the ordering trap (2026-08-06)
- [x] Settled the remaining open decisions: minimal dependencies (2 prod, 2 dev — no date
      lib, no test runner), MIT, trunk-based (2026-08-06)
- [x] ADR 0003 — Nightscout as alternate source at Milestone 4, no collector to build
      (2026-08-06)
- [x] Reviewed prior art: both existing LibreLink MCP servers report the *requested* period
      rather than the covered one, and compute GMI from ~12 h. Recorded in ADR 0002 § Notes
      and `docs/LEARNINGS.md` (2026-08-06)
- [x] History horizon settled: V1 targets ~12 h, long-term deferred to Milestone 4
      (2026-08-06). `logbook` probed and rejected — 14 of 17 entries are alarms
- [x] Verified the LibreLinkUp contract end to end against a real account — login, region
      redirect (`fr`), `Account-Id`, connections, graph (2026-08-06). Recorded in
      `docs/ARCHITECTURE.md`; traps in `docs/LEARNINGS.md`
- [x] LibreLinkUp follower-account sharing already in place (2026-08-06)
- [x] ADR 0002 — data source: LibreLinkUp cloud API (2026-08-06)
- [x] ADR 0001 — stack: Node/TypeScript (2026-08-06)
- [x] Project bootstrapped (2026-08-06)

---

**Convention**: Claude updates this file at the start/end of each session. Completed tasks stay in "Recently done" for ~1 week then are archived (deleted or moved to CHANGELOG).

**Status vocabulary**: `[ ]` to do · `[~]` delivered, in review / awaiting validation · `[x]` done & validated. Annotate reverts and key commits inline (e.g. `reverted (commit abc123)`) — intermediate states are information, don't erase them.
