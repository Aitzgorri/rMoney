# spec:done

Marks a spec as done (in-progress → done).
Will refuse if any acceptance criteria are still unchecked.

## Usage
```bash
npm run spec:done -- "name"
```

## Example
```bash
npm run spec:done -- accounts
```

## Safety check
If unchecked criteria remain, the command will list them and stop:
```
  Warning: 3 acceptance criteria are still unchecked:
    - [ ] User can archive an account
    - [ ] Archived accounts viewable in separate section
    - [ ] Credit card balances shown as negative

  Mark them as done in the spec file first (change [ ] to [x]).
```

Open the spec file and change `- [ ]` to `- [x]` for each completed item, then re-run.

## After running
Verify that all items for this spec have been removed from `specs/implementation-plan.md`. They should have been removed one-by-one during implementation, but double-check that none were missed.

**Always run `npm run plan:validate` immediately after `spec:done`** — it catches stale plan entries that should have been removed, count mismatches, and phantom spec references. Treat this as part of the same step, not optional.

## When Claude should run this
- When every acceptance criterion in the spec is checked `[x]`
- Never call this with unchecked items remaining — the command will refuse, but the assistant should also refuse to call it
- After this completes, immediately propose a commit to the user using the format documented in `commit.md`

## Note
The `--` separator is required to pass arguments through npm to the script.
