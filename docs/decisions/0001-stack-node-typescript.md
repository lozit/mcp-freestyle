# 0001 — Node/TypeScript as the implementation stack

**Date**: 2026-08-06
**Status**: Accepted

## Context

`mcp-freestyle` is an MCP server exposing FreeStyle CGM data to an AI agent. No line of
implementation code exists yet, and the stack gates everything downstream: SDK, packaging,
distribution, and which upstream client library can be reused.

Two acceptance criteria from `docs/VISION.md` bear directly on this choice:

- *"A third party installs it in under 10 minutes following the README alone."* — distribution
  friction is a first-class requirement, not an afterthought.
- *"Units and timezones are correct."* — needs a language with sane date/time and decimal
  handling, or at least well-known libraries for both.

The project is also open source and aimed at other people with diabetes, so the stack should
be one that a typical contributor in this community can read and patch.

## Decision

Implement the server in **Node.js with TypeScript**, using the official
`@modelcontextprotocol/sdk` package, and distribute it so it can be run with `npx` without a
prior global install.

## Alternatives considered

- **Python (official MCP SDK / FastMCP)**: mature SDK, `uvx` gives comparable
  zero-install execution, and `libre-linkup-py` exists. Rejected as the *default* — not on
  capability, but because the analytics ambition that would justify pandas/numpy is
  explicitly deferred (V1 aggregates are time-in-range over a window, which is trivial in
  any language). Should V2 grow serious statistical analysis, this decision is worth
  revisiting rather than fighting.
- **Rust**: produces a single self-contained binary, which is attractive for distribution.
  Rejected: the MCP ecosystem and the LibreLinkUp client landscape are both markedly thinner,
  so we would write and maintain the upstream HTTP client ourselves — cost paid up front,
  for a benefit (binary distribution) that `npx` already approximates.

## Consequences

### Positive
- `@modelcontextprotocol/sdk` is the reference implementation: most examples, most
  first-party documentation, fewest unknowns when something behaves oddly.
- `npx mcp-freestyle` is a one-line install path for anyone who already has Node — the
  cheapest route to the "under 10 minutes" criterion.
- A maintained TypeScript LibreLinkUp client exists (see ADR 0002), so the fragile upstream
  layer starts from someone else's working code rather than from scratch.
- Static types are a real safety net for the unit/timezone criterion: `mg/dL` vs `mmol/L`
  and `UTC` vs local can be encoded in the type system so a mix-up fails at compile time
  rather than silently producing a wrong reading.

### Negative / Tradeoffs
- Node must be present on the user's machine. Acceptable, but it is a prerequisite the
  README must state plainly rather than assume.
- If long-horizon statistical analysis becomes a goal, we will either reimplement what
  pandas gives for free or bridge to Python. Accepted knowingly — see the Python entry above.
- JavaScript's `Date` is a poor fit for the timezone requirement. Mitigation: never pass a
  bare `Date` across a module boundary, and parse timestamps explicitly rather than via
  `new Date(str)`.

  **Amended 2026-08-06 — no date library.** This originally said to pick one (Temporal or
  equivalent) early. Two findings changed that: `Temporal` does not exist in Node 24, and
  upstream sends exactly one fixed, known format (`M/D/YYYY h:mm:ss AM/PM`, UTC) — verified
  against a real account. A ~40-line explicit parser with a round-trip validity check is
  more legible than any library call and adds no dependency. See `src/domain/timestamp.ts`.

### Neutral
- Packaging format (npm publish vs git install) is deliberately left open; it is a
  release-time concern, not a stack concern. The `mcp-freestyle` name was confirmed
  available on npm 2026-08-06, so the `npx` path stays open either way.

### Scaffolding consequences (2026-08-06)
Two toolchain constraints follow from choosing Node's native type stripping over a build
step for tests, both recorded in `CLAUDE.md` → Setup:

- Relative imports must use the real `.ts` extension (`rewriteRelativeImportExtensions`
  rewrites them on emit) — a `.js` specifier pointing at a `.ts` file fails at runtime.
- Only strip-only TypeScript is usable: no `enum`, no `namespace`, no constructor
  parameter properties. Node erases types; it does not transform syntax. This fails the
  test run rather than the typecheck, so it is easy to trip over.

Accepted in exchange for a zero-dependency test path (`node --test`, no runner, no build).

## Notes

- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Related: ADR 0002 (data source) — decided jointly with this one; the TypeScript client
  availability was an input to both.
- `docs/VISION.md` — acceptance criteria this decision is answerable to.
