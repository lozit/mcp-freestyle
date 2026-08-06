---
paths:
  - "src/**/*.ts"
  - "scripts/**/*.ts"
---

# TypeScript rules for this project

## The toolchain constrains the syntax — this is deliberate

Tests run straight off the sources with Node's native type stripping
(`node --test src/**/*.test.ts`), with no build step and no test-runner
dependency. Two constraints follow, and breaking either fails the **test run**
rather than the typecheck, which makes them easy to trip over:

- **Relative imports carry the real `.ts` extension**, not `.js`. Node resolves
  specifiers literally; `rewriteRelativeImportExtensions` turns them into `.js`
  on emit.
- **Stay inside strip-only TypeScript.** Node erases types, it does not
  transform syntax. No `enum`, no `namespace`, no constructor parameter
  properties. Use an `as const` object plus a derived type for enum-likes, and
  assign fields in the constructor body.

## Encode the domain risks in types, not in discipline

- **A glucose value never travels without its unit being unambiguous.** The
  canonical field is `mgPerDl` — the name is the contract. There is deliberately
  no `value` + `unit` pair. Convert at the output edge only.
- **Never pass a bare `Date` across a module boundary**, and never parse an
  upstream timestamp with `new Date(str)`. Use `parseFactoryTimestamp`.
- **Don't invent an enum mapping.** `rawTrendArrow` is carried verbatim because
  the integer→direction mapping is unverified. A confidently wrong arrow is
  worse than no arrow.

## Fail loudly at the boundary

Every upstream field we depend on is validated in `src/upstream/`. Throw
`UpstreamContractError` rather than coercing — a malformed payload must never
flow onward as a plausible number. Error messages go into logs and bug reports,
so run untrusted values through `redact()` first.

## Tests

- Beside the code they cover, `*.test.ts`, `node:test` + `node:assert/strict`.
- **Synthetic fixtures only.** Never paste a real payload: they carry sensor
  serials, account identifiers, and glucose values, and this repo is public.
- Inject `fetch` rather than reaching for the network. The whole upstream
  contract is exercised against a stub.
