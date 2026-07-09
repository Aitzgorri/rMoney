---
id: SPEC-040
name: App Test Coverage
status: in-progress
created: 2026-07-09
---

# App Test Coverage

## Goal
Bring the whole app to the test coverage it *would* have if tests had been written alongside every feature from the start. Today the app has **zero automated tests**; every past regression (string-amount corruption, UTC date shifts, the 16→15 day bug, the edit→immediate-transaction bug) was found by the user in production data. This spec is the retroactive backstop; the going-forward rule (CLAUDE.md → Testing convention, added 2026-07-09) ensures new work ships with tests so this spec's remaining scope only shrinks.

Two parts: the **infrastructure** (Phase 57 — needed early, before any further feature work, so the going-forward rule is actionable) and the **retroactive coverage sweep** (Phase 60 — deliberately planned last).

## User Stories
- As the user/developer, I can run `npm test` and know within seconds whether a change broke money math, recurrence dates, envelope balances, or bill generation.
- As the user/developer, every bug I report gets a regression test with its fix, so it can never silently return.

## Acceptance Criteria

### Infrastructure (Phase 57 — pulled forward) ✓ done 2026-07-09
- [x] Vitest wired into `app/` with an `npm test` script (watch + single-run modes). *(Vitest 4.1.10 devDependency; `npm test` = watch, `npm run test:run` = single run; standalone `vitest.config.js` — node environment, `src/**/*.test.js`, deliberately not extending the React vite config.)*
- [x] An `appStorage` mock/reset helper so data-layer functions are testable against seeded storage without a browser. *(`src/test/storage.js` — `seedStorage`/`resetStorage`/`readStorage`, reusing the real Phase-39e in-memory backend rather than mocking localStorage.)*
- [x] Seed suites proving the harness on the highest-risk pure logic: `format.js` (`round2`, `parseAmount`, `fmtAmt`), `frequency.js` (`monthlyEquivalent`, day-picker kinds), and one recurrence engine case (`isScheduledTransferDueToday` / `getDueDates` incl. the 16→15 UTC class and bi-weekly anchoring). *(6 suites, 57 tests: format / frequency / dates / bills (`getDueDates` exported for testability + `getNextOccurrenceDate` under fake timers) / envelopes-scheduled (`nextScheduledOccurrence`, which exercises `isScheduledTransferDueToday`, + a storage-backed `createScheduledTransfer` round-trip) / transactions (Phase-49a ordering). All green in <1s; build + lint clean on new/changed files.)*
- [x] Testing conventions documented (file placement `*.test.js` next to source, seeding pattern, what must be tested per change type) — referenced from CLAUDE.md. *(§ Testing conventions below.)*

### Retroactive coverage sweep (Phase 60 — planned last)
- [ ] Every data-layer module (`data/*.js`) has a test file covering its public functions' happy paths and known edge cases (per-module inventory drawn up when the phase starts).
- [ ] Every util module with logic (`utils/*.js` — hierarchy, favorites, planningPeriod, envelopeProjection, dates, format, frequency, …) is covered, including the documented historical bug classes as regression tests.
- [ ] The recurrence/occurrence engines (bills generation + confirmation, scheduled-transfer engine, projections) are covered against worked examples (reusing the ones recorded in the implementation plan / specs).
- [ ] Every feature area listed in specs SPEC-001…SPEC-039 has at least its core calculation/data behaviour covered (UI-only specs may be satisfied at the data layer; component/E2E tests are optional per area, not mandated).
- [ ] A coverage report runs locally (`npm test -- --coverage`); remaining intentional gaps are listed in this spec rather than left implicit.

## Testing conventions (Phase 57)
- **Runner:** Vitest, node environment, config in `app/vitest.config.js`. `npm test` (watch) / `npm run test:run` (single run) from `app/`.
- **Placement:** `*.test.js` next to the module under test (`src/utils/format.js` → `src/utils/format.test.js`). Multiple focused files per module are fine (`envelopes.scheduled.test.js`).
- **Imports:** always `import { describe, it, expect, vi } from 'vitest'` explicitly — no test globals, so ESLint needs no special config.
- **Storage:** never mock `localStorage`. Use `src/test/storage.js`: `seedStorage({ rmoney_x: [...] })` in `beforeEach`, `resetStorage()` in `afterEach`, `readStorage(key)` for asserts. It activates the real appStorage in-memory backend, so the production read/write paths are what runs.
- **Clock:** functions that read the real clock (`new Date()` internally) are tested with `vi.useFakeTimers()` + `vi.setSystemTime(new Date(y, m, d, hh))`; prefer functions with an injectable date parameter where the API offers one. Always construct dates with the **local** `Date(y, m, d)` constructor, never ISO strings, so tests pass in any timezone.
- **What to test per change type** (the CLAUDE.md rule): bug fix → a regression test reproducing the bug first, then the fix; new feature → its data-layer/util logic covered in the same phase; pure display/CSS tweaks → no test required. Exporting a private pure function for testability is acceptable and preferred over testing through storage-coupled wrappers.
- **Determinism:** no assertions on float half-way artifacts (e.g. `x.xx5` rounding) or real "today" — pick unambiguous fixtures (weekday reference used in suites: 1 Jun 2026 = Monday).

## UI / Screens
None — developer-facing. (Optional: a README badge/section documenting how to run tests.)

## Data
No app data changes. Dev dependencies only (vitest + supporting packages).

## Out of Scope
- CI pipeline (GitHub Actions) — documented as a next step in RELEASE.md when it comes; tests run locally first.
- Full E2E browser-automation suite (Playwright stays a manual verification tool for now).
- Component/visual snapshot testing of every screen.

## Open Questions
- Coverage threshold worth enforcing at the end of Phase 60 (proposal: line coverage on `data/` + `utils/` only, not components).
- Whether the pre-commit hook should run the fast test suite (decide once suite runtime is known).
