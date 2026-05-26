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

## When Claude should run this
- At the start of any "what's next?" / "continue" question, to see the current status of every spec
- Before deciding whether `spec:new` is needed (to confirm no existing spec covers the request)
- Whenever the user references a spec by name and the status is unknown
