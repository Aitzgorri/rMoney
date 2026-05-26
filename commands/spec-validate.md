# spec:validate

Checks that a spec is complete and ready to implement.
Run this before marking a spec as ready.

## Usage
```bash
npm run spec:validate -- "name"
```

## Example
```bash
npm run spec:validate -- accounts
```

## What it checks

**Errors** (must fix):
- No unfilled template placeholders (`{{ }}`)
- Goal section is filled in
- User Stories section is filled in
- At least one acceptance criterion exists

**Warnings** (recommended):
- UI / Screens section is filled in
- Data section is filled in
- Open Questions section has a real answer (or "None.")

## Output example
```
  Validating: SPEC-002 — Accounts
  --------------------------------------------------

  ERRORS (must fix before marking ready):
    ✗ Goal section is still the template default — fill it in

  WARNINGS (recommended to fix):
    ! Open Questions section is still the template default
```

## When Claude should run this
- After filling in a freshly-created `draft` spec, before marking it `ready`
- After any substantive edit to an existing spec's Goal / User Stories / Acceptance Criteria sections
- As a precondition for `spec:ready` — never call `spec:ready` without validating first

## Note
The `--` separator is required to pass arguments through npm to the script.
