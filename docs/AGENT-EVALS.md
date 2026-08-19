<!-- generated-by: groundrules v1.10.0 -->
# Agent evals — mcp-freestyle

> A log of the **agent's own** observed failure modes on this project — recurring mistakes,
> hallucinations, drifts — and the guard added for each. Reverse-chronological (newest at
> the top). This is **meta**: it's about how the agent behaves *here*, not about the
> project's domain.

**How this differs from `docs/LEARNINGS.md`**: LEARNINGS captures rules about the *project*
(domain gotchas, stack pitfalls, conventions). AGENT-EVALS captures patterns about the
*agent* (what it gets wrong on this repo, and the rule/guard that should stop it). An eval
entry usually produces a fix in `CLAUDE.md` or `.claude/rules/` — link it.

**When to add an entry**: when the agent repeats a mistake, fabricates a fact/API, drifts
from an instruction, or you catch a hallucination. Capture it at the next checkpoint
(see `CLAUDE.md` → "Capture at checkpoints" — typically before a push/release).

**Watch list for this project** (failure modes worth catching early, given the domain):
inventing endpoints/fields for an undocumented upstream API; assuming a glucose unit instead
of carrying it; dropping or interpolating sensor gaps; putting a plausible-looking real
reading in a fixture; drifting toward advisory phrasing ("you should correct") in tool
descriptions or output.

---

## 2026-08-19 — Third recurrence: a rule in prose does not fire

**Observed**: told the user to cut a release without first moving the CHANGELOG entries out
of `[Unreleased]`. `0.1.4` reached npm and the MCP Registry carrying a changelog that never
mentions the version it ships with — permanently, since npm only refreshes the file on a new
version.

**Trigger**: a release that felt purely mechanical (`npm version patch && git push`), where
the preparation step lived in `docs/RELEASE.md` rather than in the pipeline.

**What makes this the interesting one**: the rule already existed, written by this agent on
2026-08-06 in `docs/LEARNINGS.md` — *"README, CHANGELOG and LICENSE ship inside the tarball —
treat them as release artefacts subject to the same is-this-true-right-now check as the code,
not as things to tidy afterwards."* It was broken thirteen days later by its author.

Compare the README, which had the **same** failure at 0.1.0 and got a **check in the publish
workflow**. It has not recurred once. The CHANGELOG got a line of prose. It recurred.

**Guard added**: `scripts/check-changelog.mjs`, wired into `publish.yml` beside the README
check. The tagged version must have a `## [x.y.z]` section or the release stops before
`npm publish`.

**The generalisation, and it supersedes the advice in the two entries below**: when a failure
mode recurs, the response is not a firmer note — it is moving the rule from prose into a
check that runs. If a guard cannot be executed, assume it will be forgotten. Prose is for
explaining *why* a check exists, not for being the check.

**Status**: the mechanism is now enforced; watching whether the generalisation holds for the
next class of failure.

## 2026-08-06 — Adds a second caller that routes around an existing guard

**Observed**: `install.ts`'s `main()` checked `existsSync(paths.server)` before writing an
MCP client config. A `login.ts` was then added that calls `installDesktop` directly, skipping
that check. It wrote a config pointing at a non-existent file; Claude Desktop reported only
"Server disconnected", which carries no diagnostic information at all. The check had been
written by the same agent, in the same session, about an hour earlier.

**Trigger**: adding a second entry point to an operation that already had one. The guard sat
in the *caller* rather than in the operation, so reaching the operation from elsewhere
bypassed it silently — no type error, no test failure.

**Guard added**: extracted to `assertServerBuilt()` and called from every path. Rule recorded
in `.claude/rules/typescript.md`: before adding a caller to an existing operation, read what
the existing entry point does *before* invoking it — preconditions often live there, not in
the operation. If a precondition matters, it belongs in the operation or in a function both
callers must go through.

**Status**: watching. The general shape — *a check is worth nothing if a second caller can
route around it* — is worth applying beyond this one function.

## 2026-08-06 — Breaks a rule it authored, when writing the adjacent code

**Observed**: test fixtures were populated by copying values straight out of the real API
payloads the user had pasted — a real glucose reading with its real timestamp, and the four
samples from a real smoke run. The comment directly above those fixtures, written by the same
agent, read *"Never paste a real payload into a test"*. On a repo intended to be public this
would have published timestamped health measurements. Caught by the pre-commit sweep, before
any commit.

**Trigger**: needing plausible test data while the real payload was in context. The rule was
about the *repository*; writing a fixture felt like a local decision.

**Guard added**: the pre-commit secret sweep now checks for **value + timestamp pairs**, not
only for identifiers (serials, account ids) — those were clean throughout; the readings were
not. Concretely: grep the observed values from the session's payloads, not just the obvious
secrets.

**Status**: watching.

**Both entries are the same shape**: a constraint authored in one place, not applied when
writing something adjacent. The rationalizations differ but the failure does not.

| Rationalization | Reality |
|---|---|
| "the check already exists, I saw it" | it exists in *a* caller — this new path doesn't reach it |
| "this fixture is just test data" | it is a real measurement, and tests ship in the repo |
| "I wrote that rule, so I know it" | authoring a rule is not applying it; check the code you just wrote against it |

**Red flag — STOP**: adding a second caller to an operation without reading the first caller's
preamble; or writing a literal into a fixture that came from a payload in the conversation.

<!-- Example:

## YYYY-MM-DD — Invents config keys that don't exist

**Observed**: proposed `app.config.ts` keys (`retryBudget`, `edgeRegion`) that aren't in the
schema — twice in one session.
**Trigger**: asked to "tune performance config" without being pointed at the schema file.
**Guard added**: `CLAUDE.md` now says "never propose a config key without first reading
`src/config/schema.ts`; if unsure, say so." (or a `.claude/rules/config.md` with `paths:`)
**Status**: watching — re-evaluate after a few sessions.

-->

<!-- Hardening a *stubborn* guard (one that keeps getting rationalized away): add a
**rationalization table** (the excuse the agent makes under pressure → the rebuttal) and a
**red-flag stop-line**. Example:

| Rationalization | Reality |
|---|---|
| "the schema probably has that key" | you haven't read it — read it |
| "it's obviously a standard key" | obvious-but-unverified = invented |

**Red flag — STOP**: proposing any config key without having read the schema *this turn*.

-->
