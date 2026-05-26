# commit

How Claude proposes and creates git commits in this project. Not an npm script — this file documents the convention so commit messages stay consistent.

## Message format

Pick the variant that matches the change:

### A) Phase / sub-phase feature work (most common)
```
Phase NN[letter]: <brief description> (SPEC-XXX)
```
- `NN` is the phase number from `specs/implementation-plan.md` (e.g. `32`, `33`)
- `[letter]` is the sub-phase if applicable (e.g. `32f`, `33a`)
- `SPEC-XXX` is the primary spec touched. Omit the parenthesis when the change spans many specs (use `(SPEC cross-spec)`) or is purely phase-level docs.

### B) Phase-aligned planning / docs (no single spec)
```
Phase NN <topic>: <brief description>
```
Use this when the change is *about* a phase (release planning, plan reorg, phase-wide spec docs) but doesn't implement a specific acceptance criterion. No `(SPEC-XXX)` parens.

### C) Non-phase tooling / meta / scripts
```
<Topic>: <brief description>
```
Where `<Topic>` is one of: `Tooling`, `Docs`, `Scripts`, `Meta`, `Build`, `Deps`. Use this **only** when the change is not tied to a phase or spec — e.g. Claude command files, agent skills, build pipeline, dev scripts, repository housekeeping. **No phase prefix, no SPEC parens.**

### Decision rule
1. Does the change tick a specific acceptance criterion in a spec? → **A**
2. Does it organise / document an active phase or release without touching code? → **B**
3. Is it pure repo / assistant / tooling plumbing with no phase relationship? → **C**

If you're hesitating between A and B, prefer A — it's the documented default. If you're hesitating between B and C, prefer B if there's any active phase relationship.

### Common to all variants
- Description is short, present-tense, no trailing period
- Subject line ≤ 72 chars where possible

## Examples from recent history

```
Phase 33 spec docs, release strategy, and implementation plan overhaul     ← B
Phase 32i: Edit/delete control discoverability audit (SPEC cross-spec)     ← A
Phase 32g-32k: Buy-Sell Planning screen (SPEC-034)                         ← A
Phase 32f: Trading fees configuration in Settings → Investments            ← A
Phase 32e: Manual stocks with user-entered price history                   ← A
Tooling: document Claude's spec workflow + commit convention in commands/  ← C
```

## Release line awareness (Phase 33)

Phase 33 is split per `RELEASE.md` and `specs/implementation-plan.md`:

| Release | Sub-phases |
|---|---|
| **v0.33.0** — Foundation + bug fixes + Android pipeline | 33a, 33b, 33c, 33d, 33i, 33k, 33m, 33o, 21a |
| **v0.34.0** — Dividend overhaul | 33e, 33f, 33g, 33h, 33j, 33l, 33n |

If a single change crosses the boundary, flag it to the user before suggesting a commit — that is a sign the change should be split.

## Claude's commit workflow

1. **Always propose, never auto-commit.** After finishing any meaningful change — spec edit, code change, plan edit — proactively ask:
   > "Want me to commit this? Suggested message: `Phase XXa: <description> (SPEC-XXX)`"
2. **Wait for explicit confirmation** (yes / commit it / go ahead). A neutral acknowledgement is not consent.
3. **Run `git status` + `git diff` first**, then `git add <specific files>` (never `-A` or `.`), then `git commit` with the agreed message via HEREDOC.
4. **Never push.** Pushing requires a separate, explicit user instruction. Per CLAUDE.md, publication is also gated on SPEC-031 Phase 24a–24d completion.
5. **Hooks must pass.** Never use `--no-verify`. If a hook fails, fix the underlying issue and create a NEW commit (don't `--amend`).

## When Claude should follow this convention
- After every successful `spec:done` — pair the commit prompt with the spec completion
- After any standalone fix or refactor that touches the repo
- After non-trivial edits to `specs/implementation-plan.md` or any spec file
- NEVER when only ephemeral scratch / debug output was produced and nothing is staged
