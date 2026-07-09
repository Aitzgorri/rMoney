---
id: SPEC-008
name: Dashboard
status: done
created: 2026-04-03
---

# Dashboard

## Goal
Give the user an at-a-glance financial overview the moment they open the app.
The Dashboard answers: "How much do I have?", "How much am I spending?", and "What's coming up?"
It is also the home for user-configurable widgets.

## User Stories
- As a user, I can see my total balances per currency so that I know my overall financial position
- As a user, I can see income and expenses for the current planning period so that I know how the current period is going
- As a user, I can see upcoming recurring transactions so that I can anticipate future money flow
- As a user, I can add widgets to track specific things I care about
- As a user, I can reorder widgets to put the most important information first
- As a user, I can set a custom planning period that defines my monthly cycle

## Acceptance Criteria

### Planning period
- [x] User can set a global planning period start day (e.g. 15th)
- [x] If start day is 15th, the period runs from the 15th of this month to the 14th of next month (inclusive)
- [x] If start day is 1st, the period is a standard calendar month
- [x] Planning period is a global app setting — used on the Dashboard and in any future reporting
- [x] The current planning period dates are shown on the Dashboard (e.g. "15 Mar — 14 Apr")

### Account balances
- [x] A card shows total balances grouped by currency (e.g. "2,870 EUR, 80 USD")
- [x] Each total row label shows the currency abbreviation (e.g. "Total EUR")
- [x] A "See all" link navigates to the full Accounts screen
- [x] Individual account balances are shown under the total
- [x] **Favorite accounts (Phase 48) appear first**, in the user's favorite order, separated from the remaining accounts by a divider line. Favorites are configured in Settings → General (SPEC-002); ordering uses the shared `splitFavorites` helper
- [x] Clicking an individual account row navigates to the Transaction list pre-filtered by that account

### Period summary
- [x] A card shows total income and total expenses for the current planning period
- [x] Amounts are grouped by currency
- [x] Net (income minus expenses) is shown per currency

### Upcoming recurring transactions
- [x] A card shows the next upcoming recurring incomes and expenses
- [x] Each entry shows: date, type (income/expense), amount, payee or category
- [x] Shows the next 5 upcoming by default (with option to see all)
- [x] **Due-pending occurrences appear at the top of the card** *(Phase 55c)* — outstanding bills whose due date has arrived were previously invisible here (the upcoming derivation excludes their items entirely). They render with distinct styling (a "due" tag) and an inline **Confirm** button that creates the transaction with the planned amount and due date — same `confirmOccurrence` semantics as the Bills & Income page (which remains the place to adjust the amount/date before confirming). Shared derivation: `getDuePendingOccurrences()` in `data/bills.js`, also consumed by the Bills & Income pending section

### Widgets
- [x] Dashboard supports a widget area where widgets are displayed in a user-defined order
- [x] User can add, remove, and reorder widgets
- [x] Widget framework supports adding new widget types in the future

### Envelope daily spending widget
- [x] User selects an envelope to track
- [x] Widget shows: envelope name, current balance, days remaining in the planning period (including today), and daily spending allowance
- [x] Daily spending allowance = current envelope balance / days remaining (including today)
- [x] Example: balance 120 EUR, 12 days remaining → 10.00 EUR/day
- [x] If balance is negative, show 0.00/day with a warning
- [x] Multiple instances of this widget can be added for different envelopes

## UI / Screens

```
DASHBOARD
+------------------------------------------+
|  rMoney                   15 Mar — 14 Apr |  <- planning period
+------------------------------------------+
|  ACCOUNT BALANCES           [See all >]  |
|  +--------------------------------------+|
|  |  Total: 2,870.00 EUR                 ||
|  |         80.00 USD                    ||
|  |                                      ||
|  |  Main Account (Savings)  2,450 EUR   ||
|  |  Daily Card (Debit)        340 EUR   ||
|  |  Wallet (Cash)              80 USD   ||
|  |  Travel Card (Credit)     -500 EUR   ||  <- negative, red
|  +--------------------------------------+|
|                                          |
|  PERIOD SUMMARY (15 Mar — 14 Apr)        |
|  +--------------------------------------+|
|  |  Income:   +3,000.00 EUR             ||
|  |  Expenses:   -845.00 EUR             ||
|  |  Net:      +2,155.00 EUR             ||
|  +--------------------------------------+|
|                                          |
|  UPCOMING                                |
|  +--------------------------------------+|
|  |  05 Apr  Expense  -750 EUR  Rent     ||
|  |  10 Apr  Expense  -12.99 EUR Netflix ||
|  |  15 Apr  Income  +3,000 EUR Salary   ||
|  |  [See all upcoming]                  ||
|  +--------------------------------------+|
|                                          |
|  WIDGETS                     [Edit]      |  <- reorder / add / remove
|  +--------------------------------------+|
|  |  Groceries envelope                  ||
|  |  Balance: 120.00 EUR                 ||
|  |  12 days remaining                   ||
|  |  10.00 EUR / day                     ||
|  +--------------------------------------+|
|  +--------------------------------------+|
|  |  Summer 2026 vacation                ||
|  |  Balance: 500.00 EUR                 ||
|  |  12 days remaining                   ||
|  |  41.67 EUR / day                     ||
|  +--------------------------------------+|
|  [+ Add widget]                          |
+------------------------------------------+
| Dashboard | Envelopes | [+] | Categories | Transactions |
+------------------------------------------+
```

## Data

App settings (new):
- planningPeriodStartDay: number (1-28, default 1)

Dashboard widget record:
- id
- type: "envelope-daily-spending" (more types in future)
- config: { envelopeId } (config shape depends on widget type)
- order: number (position in widget list)

All other data is read from existing specs:
- Account balances (SPEC-002)
- Transactions for period summary (SPEC-005)
- Recurring transaction rules for upcoming section (SPEC-005)
- Envelope balances for widgets (SPEC-004)

Derived:
- daysRemaining: days from today (inclusive) to the last day of the current planning period
- dailyAllowance: envelopeBalance / daysRemaining (or 0 if balance is negative)

## Out of Scope
- Charts or graphs (future)
- Comparison to previous periods (future)
- Category spending breakdown on dashboard (future)
- Additional widget types beyond envelope daily spending (future, but framework is in place)

## Open Questions
- None.
