---
id: SPEC-001
name: App Structure
status: done
created: 2026-04-03
---

# App Structure

## Goal
Define the screens the app contains and how the user navigates between them.
This is the skeleton everything else is built on.

## User Stories
- As a user, I can open the app and immediately see my financial summary on a dashboard
- As a user, I can navigate to any main section from anywhere in the app

## Acceptance Criteria
- [x] App has a persistent bottom navigation bar with 5 items: Dashboard, Envelopes, **[+]**, Investments, More. (The **Investments** group occupies the slot the standalone Transactions tab once held; the desktop top-nav still shows Transactions as a primary tab, and on mobile it is reached through the [+] menu — see below.)
- [x] Dashboard screen shows: account balances, expense summary, upcoming expenses
- [x] Dashboard has a link/button to the full Accounts screen
- [x] Envelopes screen shows envelope balances; plans and budgets live here too
- [x] Transactions screen shows history of past transactions
- [x] The center **[+]** button opens a small menu with two items — **New transaction** (the Add Transaction form) and **Transactions list** (the full ledger) — so the transactions list stays reachable on mobile despite having no dedicated bottom-nav tab. The menu closes on backdrop tap or when any other nav button is pressed
- [x] "More" button opens a popup menu containing secondary destinations
- [x] More menu closes when tapping the backdrop, any other nav button, or [+]
- [x] More menu contains: Categories, Settings
- [x] More menu also contains: **Envelope planning** (opens the planning page from SPEC-009 — name explicitly includes "Envelope" to distinguish it from category-level features)
- [x] More menu also contains: **Category budgets** (opens the budgets page from SPEC-011 — name explicitly includes "Category" to distinguish it from envelope-level features)
- [x] More menu also contains: **Scheduled transfers** (opens the scheduled-transfers list page from SPEC-012)
- [x] More menu also contains: **Bills & Income** (opens the planned account transactions page from SPEC-013)
- [x] Categories screen shows income and expense categories (reached via More)
- [x] Settings screen exists as a placeholder, reached via More (to be expanded later)
- [x] App launches directly to the Dashboard

## UI / Screens

```
+----------------------------------+
|           Dashboard              |  <- default screen on launch
|  Account balances  [See all >]   |  <- links to full Accounts screen
|  Spending summary                |
|  Upcoming expenses               |
+----------------------------------+
| Dashboard | Envelopes | [+] | Transactions | More |
+----------------------------------+
                 (bottom nav)

   Tapping "More" opens a popup with:
     • Categories
     • Settings
```

## Data
No new data defined here — this spec is about structure and navigation only.

## Out of Scope
- Actual data display (covered in individual feature specs)
- Authentication / login (future)
- Settings screen contents (placeholder only — to be filled in a future spec)

## Open Questions
- Visual style: dark-themed, card-based layout inspired by Snowball Analytics. Green for income/positive, red for expenses/negative.
