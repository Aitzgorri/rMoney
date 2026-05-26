# commit

How Claude proposes and creates git commits in this project. Not an npm script — this file documents the convention so commit messages stay consistent.

## Message format

```
Phase NN[letter]: <brief description> (SPEC-XXX)
```

- `NN` is the phase number from `specs/implementation-plan.md` (e.g. `32`, `33`)
- `[letter]` is the sub-phase if applicable (e.g. `32f`, `33a`)
- `SPEC-XXX` is the primary spec touched; omit the parenthesis when the change spans many specs or is purely tooling/docs
- Description is short, present-tense, no trailing period

## Examples from recent history

```
Phase 33 spec docs, release strategy, and implementation plan overhaul
Phase 32i: Edit/delete control discoverability audit (SPEC cross-spec)
Phase 32g-32k: Buy-Sell Planning screen (SPEC-034)
Phase 32f: Trading fees configuration in Settings → Investments
Phase 32e: Manual stocks with user-entered price history
```

## Release line awareness (Phase 33)

Phase 33 is split per `RELEASE.md` and `specs/implementation-plan.md`:

| Release | Sub-phases |
|---|---|
| **v0.33.0** — Foundation + bug fixes + Android pipeline | 33a, 33b, 33c, 33d, 33i, 33k, 33m, 21a |
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
