# spec:list

Lists all specs with their current status.

## Usage
```bash
npm run spec:list
```

## Output example
```
 SPEC LIST
 --------------------------------------------------------------
 Icon  ID          Status        Criteria   Name
 --------------------------------------------------------------
 [>]  SPEC-001    in-progress   2/5        App Structure
 [~]  SPEC-002    ready         0/8        Accounts
 [ ]  SPEC-003    draft         0/0        Categories
 --------------------------------------------------------------
 [ ] draft   [~] ready   [>] in-progress   [x] done
```

## Status meanings
| Icon  | Status      | Meaning                               |
|-------|-------------|---------------------------------------|
| `[ ]` | draft       | Being written, not ready to implement |
| `[~]` | ready       | Agreed on, ready to implement         |
| `[>]` | in-progress | Actively being built                  |
| `[x]` | done        | All acceptance criteria met           |
