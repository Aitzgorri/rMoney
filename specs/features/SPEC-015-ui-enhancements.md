---
id: SPEC-015
name: UI Enhancements
status: in-progress
created: 2026-04-23
---

# UI Enhancements

## Goal
Make the app usable on desktop by letting content fill the full viewport, giving high-value screens proper multi-column layouts, and letting users enter new records without the form hiding the list they were just looking at. The current app wraps everything in a mobile-column width and uses full-screen forms/modals for all record entry — fine on a phone, wasteful and context-breaking on a desktop.

## User Stories
- As a desktop user, I can see the Dashboard widgets laid out in a grid across the full width of my monitor so I don't have to scroll through a single column.
- As a desktop user, I can see the envelope tree on the left and a selected envelope's details on the right so I can browse without losing my place.
- As a desktop user, I can see transaction filters in a sidebar next to the transaction list so filtering doesn't replace the list with a form.
- As a desktop user entering a new transaction, I see the form appear inline at the top of the list (like a spreadsheet row) rather than covering the list, so I can reference existing rows while filling in the new one.
- As a mobile user, I continue to get the current full-screen form (dedicated route) when adding records — the inline pattern only applies to desktop.

## Acceptance Criteria

### Responsive desktop layout
- [x] On viewports ≥ 1024px, the app removes the mobile-column fixed-width container; content stretches to fill the viewport with a sensible max-width guard (e.g. 1600px) to avoid absurdly wide lines.
- [x] Dashboard: widgets render in a responsive CSS grid on desktop (2–3 columns depending on width). Mobile stays single-column.
- [x] Envelope list: desktop layout = tree pane on the left + detail pane on the right (selected envelope's recent transactions, scheduled transfers, monthly totals). Mobile stays single-column.
- [x] Transaction list: desktop layout = filters sidebar on the left + list on the right. Mobile stays single-column with filters accessed via a "Filter" button.
- [x] Investment reports (SPEC-024): on desktop, charts and table sit side-by-side. Mobile stacks. (`InvestmentReports.jsx` uses `repeat(${isDesktop ? tilesPerRow : 1}, 1fr)` for the pie-charts grid; tiles wrap on narrow viewports.)
- [x] Stock page (SPEC-021): on desktop, price chart + stock metadata row at the top, transactions + dividends below. Mobile stacks. (`StockPage.module.css` `@media (min-width: 768px)` switches `.body` to row layout with sticky right column.)
- [x] All other existing screens (Settings, single forms, Categories, Accounts, Scheduled Transfers, Bills & Income, Planning) simply widen the container on desktop — no multi-column rework in this spec.
- [x] **Desktop top-nav sub-row:** On desktop, the "Investments" and "More" top-nav items no longer open dropdown menus. Instead, a persistent second row (38 px, slightly darker background) appears below the main header bar whenever the active screen belongs to either group. The Investments sub-row shows: Investments overview · Portfolios · Watchlists · Benchmarks. The More sub-row shows: Planning · Category Budgets · Scheduled Transfers · Bills & Income · Categories · Settings (navigation tabs, left-aligned) and Save to file · Load from file (action buttons, right-aligned via flex spacer). Clicking a primary-nav item that has no sub-items (Dashboard, Envelopes, Transactions) hides the sub-row. On mobile the dropdown behaviour in BottomNav is unchanged.

### Forms in separate space (desktop inline expansion)
- [x] A shared `InlineFormRow` component (or similar) is built: renders as an empty "add row" at the top of a list; on click it expands into the record form in place; save commits and collapses back to the empty row; cancel collapses with no commit.
- [x] On desktop, the inline expansion is used for: new transaction, new envelope transfer, new scheduled transfer, new planned income/expense, new category budget. (new investing account, new stock transaction, new dividend — deferred to their respective phases)
- [x] On mobile, the same screens continue to use the current dedicated-route pattern (e.g. `/transactions/new`) — the inline component is bypassed.
- [x] The switch between inline (desktop) and dedicated route (mobile) is driven by viewport width; no separate user setting.

### Small / muted text contrast pass *(Phase 33)* ✓ done
- [x] **Contrast audit on every secondary-text style.** Swept all 39 CSS modules for hard-coded grey `color:` values (`#94a3b8`, `#64748b`, `#475569`).
- [x] **Single shared "muted text" colour token.** `app/src/styles/tokens.css` defines `--text-muted: #94a3b8` (≈6.6:1) and `--text-faint: #7c8da4` (≈5.1:1) — both WCAG AA on `#0f1117`. 624 `color:` usages replaced across 38 CSS modules. `index.css` imports `tokens.css` and aliases `--text-dim` → `var(--text-muted)` for backward compatibility.
- [x] **Small body text minimum size.** 177 sub-12 px font sizes (9 px, 10 px, 11 px) raised to 12 px across 34 CSS modules, plus one 8 px chevron in HybridFilterDropdown.
- [x] **Spot-check pass.** Walk every screen at default zoom and at 125 % zoom; verify the new contrast holds.

## UI / Screens
Desktop Dashboard (text sketch):

```
+----------------------------------------------------------+
| Header / nav                                              |
+------------------+------------------+--------------------+
| Period summary   | Envelope totals  | Upcoming bills     |
|                  |                  |                    |
+------------------+------------------+--------------------+
| Planning period progress (spans 2)  | Recent txns list   |
|                                     |                    |
+-------------------------------------+--------------------+
```

Desktop Envelope list:

```
+--------------------------+------------------------------+
| Envelope tree            | [Selected envelope details]  |
| > Monthly bills          |  Name, balance, recent txns  |
|   > Rent                 |  Scheduled transfers         |
|   > Utilities            |  Monthly history             |
| > Savings                |                              |
+--------------------------+------------------------------+
```

Desktop inline form (transaction list, "add row" expanded):

```
+--------------------------------------------------------+
| [+ Add transaction]  <-- collapsed "add row"            |
| [expanded form inputs: date | amount | account | ...]  |
| ------------------------------------------------------ |
| 2026-04-21  -120.00   Checking   Groceries  ...        |
| 2026-04-20   +500.00  Salary     Income     ...        |
+--------------------------------------------------------+
```

Mobile unchanged: tap "+", navigate to dedicated form route, save returns to list.

## Data
No new persistent data. This spec changes layout and component composition only. Viewport-breakpoint detection is a runtime concern (CSS media queries + a `useMediaQuery` hook), not stored state.

## Out of Scope
- Rework of Settings, single-form screens, Categories page, Accounts page, Scheduled Transfers, Bills & Income, Planning beyond "wider container" — they stay single-column on desktop.
- Theme / dark-mode / color work.
- Any new data or business logic.
- Accessibility audit beyond preserving current a11y in the reworked screens.

## Open Questions
None.
