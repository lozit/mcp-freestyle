<!-- generated-by: groundrules v1.10.0 -->
# CLAUDE.md — mcp-freestyle

> This file is **mutable and iterative**. Update it after every Claude mistake or newly discovered convention. Target: < 200 lines.

> **Relationship with the global CLAUDE.md**: this file is loaded **in addition to** the global (`~/.claude/CLAUDE.md` + enterprise policy) — on conflict the global/enterprise rule wins. **Omitted here (your global already covers them):** none.

## Session start — read first, in order

1. `PLAN.md` — where the project stands **now** (if present)
2. `docs/LEARNINGS.md` — rules learned from past corrections (apply them!)
3. `docs/VISION.md` — goal, scope, non-goals (if present)
4. The artifacts of whatever is in progress per `PLAN.md`

<!-- Adjust this list to your project: keep it short, ordered, and current. -->

## Capture at checkpoints (don't wait to be asked)

The agent can't perceive "end of session" — so capture at the **work boundaries it *can* see**, and **propose it proactively** there without waiting for the user:

- **Before a `git push`, a tag, or a release** — the highest-value, most reliable moment: pause and capture *before* shipping.
- **When a `PLAN.md` milestone is completed**, or after a substantial chunk of work.

You can also trigger it yourself any time with **`/groundrules:checkpoint`**.

At that moment, three questions, each routed to where it belongs:

1. **Decided** anything structural? → `/groundrules:add-adr` (`docs/decisions/`)
2. **Learned** something that changes how to work here (incl. a blocker that cost 30+ min, with its fix)? → `/groundrules:learn` (`docs/LEARNINGS.md`)
3. **Caught the agent** repeating a mistake, hallucinating, or drifting? → note it in `docs/AGENT-EVALS.md` (if present) and add the guard here or in `.claude/rules/`

Capture beats memory: if it's not written to the repo, it's gone next session.

## Description

A Model Context Protocol server that reads data from a FreeStyle glucose sensor.

## Setup / Build / Test

> **Critical test**: a new dev (or Claude) should be able to run the project and its tests **first try** using the commands below. If that's not the case, fill this section before anything else.

- Install deps: `npm install`
- Test: `npm test` (Node's built-in runner — no build step, no test dependency)
- Typecheck: `npm run typecheck`
- Build: `npm run build` (emits `dist/`)
- Run dev: `npm run dev` (tsc in watch mode)
- **Credentials**: `npm run login` once (password → OS keychain), then `npm run install:claude`
- **Smoke test against the real account**: `LIBRELINKUP_EMAIL=… npm run smoke` — the one check the suite can't do
- Lint: none — the strict `tsconfig.json` is the only gate. Add one when it earns its keep.

> Coding conventions live in **`.claude/rules/typescript.md`** (auto-loaded when you touch
> `src/` or `scripts/`): strip-only syntax, `.ts` import extensions, domain invariants,
> boundary validation, test conventions.

## Key files and folders

- `README.md` — public presentation
- `CLAUDE.md` — this file
- `PLAN.md` — active todo (if present), maintained during work
- `src/index.ts` — MCP server + tool surface. **stdout is the protocol** — every diagnostic goes to stderr
- `src/cli/` — `login` (password → OS keychain), `install` (writes the MCP client config), `logout`
- `src/credentials.ts` — the keychain. Password only; the token is never persisted
- `src/session.ts` — holds the upstream session across tool calls, carries the rotated token
- `src/domain/` — units, timestamps, the `Reading` type. No upstream shapes leak in here
- `src/upstream/` — the LibreLinkUp client and its errors, **isolated on purpose** (ADR 0002)
- `src/analysis/` — windowing, gaps, time-in-range. Reports covered range, never requested
- `src/**/*.test.ts` — tests live beside the code they cover; **synthetic fixtures only**
- `docs/` — project documentation
  - `docs/decisions/` — ADRs (one file per structural decision)
  - `docs/LEARNINGS.md` — learnings throughout the project (reverse-chronological)
  - `docs/ARCHITECTURE.md` — architecture snapshot (if present)
  - `docs/GLOSSARY.md` — domain vocabulary (if present)
- `intake/` — upstream notes (read this folder for domain context at session start)
- `docs/media/` — visual assets
- `.claude/` — Claude Code config
  - `.claude/settings.json` — team config, checked into git
  - `.claude/rules/*.md` — auto-loaded rules (`paths:` frontmatter for scoping)
  - `.claude/commands/`, `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` — automations

## Conventions

### Commits

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Small and atomic. Don't mix refactor and feature.

### Code

Node.js + TypeScript, `@modelcontextprotocol/sdk` ([ADR 0001](docs/decisions/0001-stack-node-typescript.md)).

Encode the risky domain facts in the **type system**, don't rely on discipline: a glucose value carries its unit, a timestamp carries its zone. A `number` that could be either unit is a bug waiting to happen. Never pass a bare `Date` across a module boundary.

Readability > cleverness. No premature abstractions. No comments paraphrasing code — reserve them for non-obvious "why".

### Health data — this repo is public

<important if="writing code, tests, fixtures, docs, or commits">
Never commit real glucose readings, sensor serials, account emails, passwords, or tokens.
Use synthetic fixtures. Credentials come from env vars / local config only, never from a
file tracked by git.
</important>

- **Read-only by design**: this project never writes to the sensor, never computes a dose, never emits a therapy recommendation. If a request implies any of that, stop and flag it.
- **Never state a range you didn't cover.** Upstream caps at ~12 h and ignores the window asked for; every aggregate reports the range it actually got. This is the defect that makes the two existing LibreLink MCP servers unsafe (ADR 0002 § Notes) — don't reintroduce it.

Unit and timestamp invariants are enforced in code and documented in `.claude/rules/typescript.md`.

### Permissions and settings

- Pre-allow safe permissions via `/permissions` (e.g., `"Bash(npm run *)"`, `"Bash(git status)"`)
- Team config in `.claude/settings.json`, checked into git
- For subfolder-specific rules: `.claude/rules/<topic>.md` with `paths:` frontmatter rather than bloating this file

## Posture

How I want you to work with me — not just *what* to do.

**Push back.** Don't be sycophantic — your job is to help me be *right*, not to agree with me.
- Challenge a plan that looks off-strategy, technically wrong, or inconsistent with a past decision (`docs/decisions/`, `docs/LEARNINGS.md`).
- Surface tradeoffs I may have missed ("this works, but costs you in perf/maintainability").
- If a request is ambiguous, **ask before acting** — don't guess.
- To stress-test a plan, ask for a **premortem** ("assume it failed — why?"), not a thumbs-up: reframing the request as a critique elicits far less sycophancy than asking "is this good?" (`/groundrules:premortem`).

**Stay reversible.** Interrupting with a question is always cheaper than destroying something silently.
- **Confirm before any hard-to-undo action**: deletion, migration, mass rewrite, destructive command. When in doubt, stop and ask.
- Safety nets to lean on: work in git and commit often (the ultimate net); `/rewind` (or `Esc Esc`) restores pre-edit checkpoints. Optionally add a `.claude/settings.json` `deny` list and a `PreToolUse` guard for destructive commands (harness-specific — not generated for you).

**Keep the diff small.** *Would a senior engineer call this overcomplicated?* — if yes, it probably is.
- **Simplicity first** — write the minimum that solves the *stated* problem; no speculative features, no abstraction you don't need yet.
- **Surgical changes** — touch only what the task requires; match the surrounding style; don't refactor unrelated code in passing.
- **Clean up only your own mess** — remove an import or helper only when *your* change is what orphaned it.

## Verifying the work

Before declaring a task done:

- Run the test command above
- For UI: actually use the feature in a browser, not just compile
- For data: check the actual data, not just the absence of error
- Produce a **behavior diff** (before/after) — not just "I ran the tests"

> *"Prove to me this works"* — if you can't prove it, it's not done.

## When to document

### ADR — `docs/decisions/`

When a **structural decision** is made (tech, pattern, tradeoff), propose an ADR. Copy `0000-template.md` → `NNNN-title-kebab.md`. Keep it < 1 page.

### LEARNINGS — `docs/LEARNINGS.md`

When a **non-trivial learning** emerges (pitfall avoided, subtle bug, discovered convention), add a dated entry at the top.

### PLAN.md

Keep current: check off done, add emerging tasks, note blockers.

### The repo is the only memory

All project knowledge lives **in this repo** (`docs/LEARNINGS.md`, `docs/decisions/`, `PLAN.md`, this file) — never in machine-local agent state (`~/.claude/` memories or plans). Something learned in a session gets written into the repo docs, not into agent memory; agent memory is for cross-project/personal facts only. **Never reference `~/.claude/*` paths from repo docs** — they don't survive a clone or a machine change. A plan-mode file worth keeping gets copied into the repo before the session ends.

### Keep generated docs current (living docs)

Every file created at bootstrap/adopt is **living** — keep it in sync **in the same change** that makes it stale; don't let it drift. Updating an affected doc is **part of the task**, not a follow-up. Whenever your work touches one of these areas, update the matching file (if present):

- `README.md` — when a change makes it inaccurate (install, config, tool surface)
- `docs/VISION.md` — goal / users / scope / constraints change
- `docs/ARCHITECTURE.md` — structure, components, or the **verified upstream contract** change
- `docs/DATA_MODEL.md` · `docs/SECURITY.md` · `docs/ROADMAP.md` · `docs/GLOSSARY.md` — their domain changes
- `docs/AGENT-EVALS.md` — when the agent repeats a mistake, hallucinates, or drifts
- `CHANGELOG.md` — an entry under `[Unreleased]` for any notable change
- `PLAN.md` · `docs/LEARNINGS.md` · `docs/decisions/` — as described above

## Updating this file

This file is alive — but keep it a **map, not the territory**. It is loaded into context at *every* session start, so link to docs and let them be read on demand; don't paste doc content here "to be safe". Oversized always-on context dilutes attention (models degrade as input grows) and busts the prompt cache on every edit. A documentation-search / RAG tool is only worth it for large *external* corpora you can't fit — your own repo is read natively (`Read`/`grep`), no plugin needed.

- When Claude makes a mistake: add a rule so it doesn't recur
- When you spot an unwritten convention: codify it here
- For a rule that **must absolutely survive** file growth: `<important if="situation">rule</important>`
- If the file exceeds 200 lines or a section swells: extract to `docs/` or `.claude/rules/`
- For rules applicable to a certain type of file: prefer `.claude/rules/` with `paths:` rather than putting everything here

> *"Anytime we see Claude do something incorrectly we add it to the CLAUDE.md"* — iterate until the error rate is acceptable.

## Claude Code workflow

- **Match the work to the regime** before diving in (reflection before realization — know your phase):
  - a **decision / fork** (an unsettled choice) → capture it as an **ADR** (`/groundrules:add-adr`) *before* acting
  - a **non-trivial feature** → a **PRD** (`/groundrules:prd`) first, then build against it
  - an **interactive, non-trivial** change → **plan mode** (`shift+tab`) before you start
  - an **atomic, testable, isolatable** task → if this repo has `loop/` scaffolding, hand it to **`/groundrules:realize`** → the loop (it gates `[loop]` on a pre-written, red acceptance test); otherwise just build it
- **`/compact [hint]`** mid-task to compress context; **`/clear`** when switching tasks
- **Git worktrees** for parallel sessions: `claude --worktree <name>`
- **Custom skills/commands** in `.claude/` — if you do something more than once a day, automate it
- **Delegation > pair-programming**: with Opus 4.6+, give **goal**, **constraints**, and **acceptance criteria** in the first message, rather than guiding line by line

## Git workflow

- **Branching — trunk-based.** Commit straight to `main`; lean on tags and `/rewind` rather than branches. Revisit if outside contributors arrive.
- Only commit on **explicit request** (never auto-commit at end of task)
- Verify no secrets or debug files are included before committing

## Don't

- Don't add dependencies without confirming
- Don't commit without explicit request
- Don't create new doc files without need (prefer enriching existing)
- Don't do opportunistic refactoring mid-feature
- Don't ignore a rule in this file — if it doesn't fit, **modify it**, don't bypass it
- Don't park project knowledge in agent memory or reference `~/.claude/*` from the docs — the repo is the only memory
- Don't commit real readings or credentials — see "Health data" above

## Tech stack

Node.js + TypeScript, `@modelcontextprotocol/sdk`, distributed to run via `npx` ([ADR 0001](docs/decisions/0001-stack-node-typescript.md)).

Data source: the **unofficial** LibreLinkUp / LibreView cloud API ([ADR 0002](docs/decisions/0002-data-source-librelinkup.md)). Treat it as fragile — keep the upstream client in one isolated module, and **fail loudly** on an unexpected response. A plausible-looking wrong reading is worse than an error.

## Notes

Project bootstrapped with [groundrules](https://github.com/lozit/groundrules) on 2026-08-06.
