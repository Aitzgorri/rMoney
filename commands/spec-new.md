# spec:new

Creates a new spec file from the template.

## Usage
```bash
npm run spec:new "Feature Name"
```

## Example
```bash
npm run spec:new "Transaction Entry"
```

## Before running
Check `specs/features/` first. If the request fits an existing spec, extend that one instead of creating a new file. See CLAUDE.md → "Before creating any new spec".

## What it does
- Generates the next SPEC-### ID automatically
- Creates `specs/features/feature-name.md` pre-filled from the template
- Sets status to `draft` and today's date

## Next steps
1. Open the created file and fill in: Goal, User Stories, Acceptance Criteria.
2. Add the new spec's acceptance criteria to `specs/implementation-plan.md` in the appropriate phase, considering dependencies and shared code.

## When Claude should run this
- ONLY after running `spec:list` and confirming no existing spec can absorb the request (per CLAUDE.md "Before creating any new spec")
- Never as the first response to a feature request — always check existing specs first
- After this runs, the next steps are: fill in the spec → `spec:validate` → `spec:ready` (do NOT jump straight to `spec:implement`)
