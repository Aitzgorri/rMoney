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

## Note
The `--` separator is required to pass arguments through npm to the script.
