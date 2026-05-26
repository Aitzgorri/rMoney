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

## When Claude should run this
- The moment the user asks to "implement X" / "start X" / "continue implementing X" AND the spec is in `ready` state — call this BEFORE writing a single line of code
- If the spec is already `in-progress`, skip this command and proceed with the work
- If the spec is `draft`, do NOT run this command — first run `spec:validate` and `spec:ready`
- Use `spec:review -- X` first to confirm current status, then decide whether this command applies

## Note
The `--` separator is required to pass arguments through npm to the script.
