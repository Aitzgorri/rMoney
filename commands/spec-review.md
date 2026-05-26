# spec:review

Prints a readable summary of one spec — status, progress, and remaining work.

## Usage
```bash
npm run spec:review -- "name"
```

## Example
```bash
npm run spec:review -- accounts
```

## Output example
```
==============================================================
  [~]  SPEC-002 — Accounts
==============================================================
  Status:   ready
  Created:  2026-04-03
  Progress: 0/9 acceptance criteria done

  Remaining:
    - [ ] User can create an account with: type, company name...
    - [ ] Account types: Cash, Savings, Debit, Credit Card
    ...

  File: specs/features/accounts.md
==============================================================
```

## When Claude should run this
- Before touching any spec — to see what is already checked vs. unchecked
- Before deciding whether to run `spec:implement` (the status field tells you whether code can start)
- When the user says "continue implementing X" so the remaining acceptance criteria are visible up-front

## Note
The `--` separator is required to pass arguments through npm to the script.
