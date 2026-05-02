# spec:implement

Marks a spec as in-progress (ready → in-progress).
Use this when you start writing code for a feature.

## Usage
```bash
npm run spec:implement -- "name"
```

## Example
```bash
npm run spec:implement -- accounts
```

## After running
Update the **Current phase** marker at the top of `specs/implementation-plan.md` if this spec starts a new phase.

## Note
The `--` separator is required to pass arguments through npm to the script.
