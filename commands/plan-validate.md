# plan:validate

Checks that `specs/implementation-plan.md` is in sync with the spec files.

## Usage
```bash
npm run plan:validate
```

## What it checks
1. **Missing from plan** — specs with unchecked criteria but zero items in the implementation plan
2. **Stale in plan** — done specs that still have items in the plan (should have been removed)
3. **Count mismatch** — significant difference between unchecked criteria in a spec vs items in the plan (warns if difference > 2)
4. **Phantom specs** — plan references a SPEC-XXX that has no matching file

## Output
Shows a table of all specs with their unchecked-criteria count (from spec files) and plan-item count (from the implementation plan), then lists errors and warnings.

## When to run
- After marking a spec as done (`spec:done`)
- After adding new acceptance criteria to any spec
- After removing completed items from the implementation plan
- Before starting a new phase, to confirm everything is accounted for
