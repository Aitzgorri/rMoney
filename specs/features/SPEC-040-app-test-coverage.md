---
id: SPEC-040
name: App Test Coverage
status: draft
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

### Infrastructure (Phase 57 — pulled forward)
- [ ] Vitest wired into `app/` with an `npm test` script (watch + single-run modes).
- [ ] An `appStorage` mock/reset helper so data-layer functions are testable against seeded storage without a browser.
- [ ] Seed suites proving the harness on the highest-risk pure logic: `format.js` (`round2`, `parseAmount`, `fmtAmt`), `frequency.js` (`monthlyEquivalent`, day-picker kinds), and one recurrence engine case (`isScheduledTransferDueToday` / `getDueDates` incl. the 16→15 UTC class and bi-weekly anchoring).
- [ ] Testing conventions documented (file placement `*.test.js` next to source, seeding pattern, what must be tested per change type) — referenced from CLAUDE.md.

### Retroactive coverage sweep (Phase 60 — planned last)
- [ ] Every data-layer module (`data/*.js`) has a test file covering its public functions' happy paths and known edge cases (per-module inventory drawn up when the phase starts).
- [ ] Every util module with logic (`utils/*.js` — hierarchy, favorites, planningPeriod, envelopeProjection, dates, format, frequency, …) is covered, including the documented historical bug classes as regression tests.
- [ ] The recurrence/occurrence engines (bills generation + confirmation, scheduled-transfer engine, projections) are covered against worked examples (reusing the ones recorded in the implementation plan / specs).
- [ ] Every feature area listed in specs SPEC-001…SPEC-039 has at least its core calculation/data behaviour covered (UI-only specs may be satisfied at the data layer; component/E2E tests are optional per area, not mandated).
- [ ] A coverage report runs locally (`npm test -- --coverage`); remaining intentional gaps are listed in this spec rather than left implicit.

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
