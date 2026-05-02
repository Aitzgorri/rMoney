# rMoney — Project Instructions for Claude

## Project Overview
rMoney is a personal finance app with envelope-style budgeting.
Built as an educational project. React + Vite web MVP first, cloud and mobile later.
The user has some programming experience and has built small web pages before.

## Teaching Approach
- Explain the *why* before showing code
- Ask the user to write code where possible; offer help when stuck
- Point out when a decision has long-term consequences
- Keep it simple — no over-engineering, no premature abstractions
- Be patient and thorough with explanations
- When clarification is needed, ask one question at a time — never list multiple questions at once

## Spec-Driven Development Workflow
All features are spec'd before implementation. Specs live in `specs/features/`.

### Spec statuses
- `draft` — being written, not ready to implement
- `ready` — agreed on, ready to implement
- `in-progress` — actively being built
- `done` — all acceptance criteria met

### Commands
- `npm run spec:new "Feature Name"` — create a new spec
- `npm run spec:list` — list all specs with status
- `npm run plan:validate` — check implementation plan is in sync with specs

### Before creating any new spec (ALWAYS consider this on every request)
Whenever the user requests a new feature, change, or enhancement, do NOT immediately create a new spec file. First:
1. Review the existing specs in `specs/features/` to check whether the request belongs in — or extends — an already-documented feature.
2. If a related spec exists, propose adding the request to that spec rather than creating a new file.
3. Only create a new spec when the request is genuinely distinct and cannot be cleanly covered by an existing one.
The goal: keep documentation clear and unambiguous, and avoid splitting related requests across multiple files.

### Documentation is mandatory
Every request for a new feature, change, or enhancement MUST be documented before or as part of implementation — either by updating an existing spec or creating a new one. If a request is not yet covered by any spec, document it first. Never implement something undocumented.

### Documentation must mirror the implemented code
After implementing any feature or enhancement — including small UI improvements, detail-panel additions, or behaviour changes requested informally — always evaluate whether the spec files reflect what was actually built. If the implementation differs from or extends what the spec describes, update the spec to match. The specs are the source of truth for *what is built*, not just *what was planned*. A spec that describes unimplemented behaviour or omits implemented behaviour is incorrect and must be fixed.

### Workflow per feature
1. Run `spec:new` to create the spec file (only after the check above)
2. Fill in Goal, User Stories, and Acceptance Criteria together
3. Change status to `ready` before writing any code
4. Implement only what the spec describes — nothing more
5. Mark each acceptance criterion as done as we go
6. Change status to `done` when all criteria are met

### Implementation plan
`specs/implementation-plan.md` tracks all remaining feature work in recommended build order. **Always keep this file in sync:**
- When an item is fully implemented, **remove it** from the plan.
- When a new feature or acceptance criterion is added to any spec, **add it** to the plan in the appropriate phase.
- When starting work on a new phase or item, check the plan to understand dependencies and shared code that should be built or reused.
- The plan also lists **shared code concerns** (reusable utilities, components) — consult this before building anything that might duplicate existing patterns.

## UI Conventions
- **Hierarchical dropdowns (MANDATORY)**: Every `<select>` that lists envelopes or categories MUST render the tree in flat order with visual level indentation — **no exceptions, no matter where the dropdown appears** (forms, modals, dialogs, settings, widget configuration, filters, etc.). Use `getEnvelopesFlat` / `getCategoriesFlat` to obtain the items (each with a `depth` field), and prefix each option label with `INDENT.repeat(item.depth)`. Import `INDENT` (and `indentLabel` if useful) from `src/utils/hierarchy.js` — do NOT redeclare it locally. Never use `getActiveEnvelopes()` or `getCategories()` directly in a `<select>` — always use the `Flat` variant.

- **Category type filtering in dropdowns (MANDATORY)**: Every `<select>` or dropdown that lists categories MUST filter by category type to match the context — **no exceptions**:
  - Income context (income transaction, income planned item) → show **only income categories**
  - Expense context (expense transaction, expense planned item) → show **only expense categories**
  - Both-type context (Category Budgets form, Transaction List filter when no type is selected) → show all categories, with visible **Income** / **Expense** section headers as disabled `<option>` separators
  - Never show income categories alongside expense categories in a type-specific context. Use `getCategoriesFlat({ type: 'income' })` or `getCategoriesFlat({ type: 'expense' })` to obtain the filtered flat list.

## Data persistence convention
Any new feature that stores data in `localStorage` MUST register itself in the **Settings → Storage tab** (defined in SPEC-026) by adding a new card with a meaningful breakdown (per-entity where applicable). The Storage tab is the canonical place for users to see what data the app holds and to bulk-clean it. Sizes are computed via `new Blob([JSON.stringify(value)]).size` (UTF-8 bytes) — use the same method everywhere so totals add up correctly. When adding a new persistent collection, add a card to the Storage tab as part of the same spec; do not defer it.

## Security and secrets convention
**Read SPEC-031 before touching anything that handles a key, token, or backup file.** Any feature that stores, displays, transmits, exports, or logs an API key, OAuth token, or other credential MUST follow the rules in SPEC-031:

- Credentials live in **Tauri Stronghold** (encrypted vault, master passphrase) on production builds — never plaintext localStorage. Vite dev mode falls back to plaintext with a warning banner; treat dev mode as untrusted for real keys.
- localStorage holds only **non-secret** flags (`apiKeySet: bool`, enabled flags, AI provider URL/model name — but never the AI key itself).
- URLs are never logged. Error messages are stripped of query strings before they bubble up. Caches store responses, never URLs or keys.
- Settings UI masks values, hides their length after save with fixed bullets, and "Show" toggles never persist.
- Backup exports default to **Sharable (redacted)**. Full Backup requires re-entering the master passphrase and embeds the encrypted Stronghold vault.
- CSP is two-layer: strict static base in `tauri.conf.json` plus runtime meta-tag injection adding the user-configured AI host.

When adding a new provider or new authenticated integration:
1. Add the new host to the static CSP `connect-src` in `tauri.conf.json`
2. Add the credential field to the redaction map used by SPEC-016 export
3. Add a record name under `marketData/<id>/apiKey` (or similar) in `secrets.js`
4. Refactor any new settings shape to use `<field>Set: bool` rather than the raw value

**Git publication is gated on Phase 24a–24d (SPEC-031 implementation).** Until those sub-phases are complete, do not propose `git push`, do not run `git init` against this repo, and do not suggest setting up a GitHub remote. If the user asks to publish, redirect them to the SPEC-031 pre-publish checklist (root `.gitignore`, pre-commit hook, pre-push hook, audit script, `Import_test.csv` resolution). Phase 24e (Stronghold encryption) does not gate first push but is required before any wider distribution of the app.

## Tech Stack
- React + Vite (web MVP)
- Plain JavaScript — no TypeScript for now
- localStorage for data (MVP); cloud sync later
- No UI library yet — keep dependencies minimal

## Project Structure
```
rMoneyClaude/
├── CLAUDE.md           ← you are here
├── specs/
│   ├── _template.md    ← spec template
│   └── features/       ← one file per feature
├── scripts/            ← dev helper scripts
└── app/                ← the React app (created later)
```
