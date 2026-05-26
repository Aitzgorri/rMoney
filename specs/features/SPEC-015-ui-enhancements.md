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
- [ ] Investment reports (SPEC-024): on desktop, charts and table sit side-by-side. Mobile stacks.
- [ ] Stock page (SPEC-021): on desktop, price chart + stock metadata row at the top, transactions + dividends below. Mobile stacks.
- [x] All other existing screens (Settings, single forms, Categories, Accounts, Scheduled Transfers, Bills & Income, Planning) simply widen the container on desktop — no multi-column rework in this spec.
- [x] **Desktop top-nav sub-row:** On desktop, the "Investments" and "More" top-nav items no longer open dropdown menus. Instead, a persistent second row (38 px, slightly darker background) appears below the main header bar whenever the active screen belongs to either group. The Investments sub-row shows: Investments overview · Portfolios · Watchlists · Benchmarks. The More sub-row shows: Planning · Category Budgets · Scheduled Transfers · Bills & Income · Categories · Settings (navigation tabs, left-aligned) and Save to file · Load from file (action buttons, right-aligned via flex spacer). Clicking a primary-nav item that has no sub-items (Dashboard, Envelopes, Transactions) hides the sub-row. On mobile the dropdown behaviour in BottomNav is unchanged.

### Forms in separate space (desktop inline expansion)
- [x] A shared `InlineFormRow` component (or similar) is built: renders as an empty "add row" at the top of a list; on click it expands into the record form in place; save commits and collapses back to the empty row; cancel collapses with no commit.
- [x] On desktop, the inline expansion is used for: new transaction, new envelope transfer, new scheduled transfer, new planned income/expense, new category budget. (new investing account, new stock transaction, new dividend — deferred to their respective phases)
- [x] On mobile, the same screens continue to use the current dedicated-route pattern (e.g. `/transactions/new`) — the inline component is bypassed.
- [x] The switch between inline (desktop) and dedicated route (mobile) is driven by viewport width; no separate user setting.

### Small / muted text contrast pass *(Phase 33)*
- [ ] **Contrast audit on every secondary-text style.** Sweep the app's CSS modules for muted colours (typical pattern: `color: #94a3b8 / #64748b / similar greys on dark backgrounds`) used in small text (≤ 13 px) — table sublines, hint text, "(N held > 365 days)" affixes, tooltip captions, source labels in the dividend list, currency-rate suffixes, "Refreshing…" status, etc. Raise contrast so every small muted text passes WCAG AA against its background (4.5:1 for ≤ 14 px regular weight, 3:1 for ≤ 14 px bold or ≥ 18 px regular).
- [ ] **Single shared "muted text" colour token.** Introduce two CSS custom properties: `--text-muted` (medium-contrast — for sublines and hints) and `--text-faint` (lower-contrast — for purely decorative captions). Both pass AA. Every CSS module replaces hard-coded greys with the appropriate token; no inline `color` overrides.
- [ ] **Small body text minimum size.** Raise any text smaller than 12 px to at least 12 px. Sub-12 px is unreadable on high-DPI displays and is a habitual source of "I can't see this" complaints.
- [ ] **Spot-check pass.** Walk every screen at default zoom and at 125 % zoom; verify the new contrast holds. Document the chosen `--text-muted` / `--text-faint` values in `app/src/styles/tokens.css` (create the file if it doesn't exist) so any future spec can refer back.

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
