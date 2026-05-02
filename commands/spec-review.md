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

## Note
The `--` separator is required to pass arguments through npm to the script.
