# spec:ready

Marks a spec as ready to implement (draft → ready).
Use this when the spec is agreed on and implementation can begin.

## Usage
```bash
npm run spec:ready -- "name"
```

## Example
```bash
npm run spec:ready -- accounts
```

## Recommended workflow
Run validate first to catch any gaps:
```bash
npm run spec:validate -- accounts
npm run spec:ready -- accounts
```

## When Claude should run this
- Only after `spec:validate` passes with zero errors
- After the user explicitly confirms the spec contents (Goal, User Stories, Acceptance Criteria) — never auto-promote a spec to `ready` without that confirmation
- This is the gate before `spec:implement` — no code may be written for a spec until this command has run

## Note
The `--` separator is required to pass arguments through npm to the script.
