---
id: SPEC-011
name: Category Budgets
status: done
created: 2026-04-08
---

# Category Budgets

## Goal
Let the user set a spending or income target on a category and compare that target to actual transactions over a chosen period. Category budgets answer "Am I staying within what I planned to spend on this kind of thing?" — a *compare-to-target* mental model that is distinct from the *forecast cashflow* mental model in SPEC-009 (Planning).

A category budget says: "I want to spend at most 300 EUR/month on Groceries." The app then shows progress against that target as real transactions come in, and resets cleanly each new period.

**Why only categories, not envelopes:** envelopes already work as rolling balances. If 1,000 EUR flows into an envelope each month and the user spends 1,200 in March, the envelope balance simply becomes -200 and the next month's inflow brings it back up. The envelope balance itself *is* the running budget — there's no need for a separate target on top. Categories, in contrast, are just labels on transactions and have no balance, so a compare-to-target view only makes sense there.

## User Stories
- As a user, I can set a spending target on an expense category for a given period
- As a user, I can set an inflow target on an income category to track expected receipts
- As a user, I can choose the period for each budget independently (monthly, quarterly, yearly)
- As a user, I can see how much of each budget I've used so far in the current period
- As a user, I am visually warned when a budget is close to or over its limit
- As a user, I can edit or remove a budget without losing my historical data

## Acceptance Criteria

### Category budgets
- [x] User can attach a budget to any category (income or expense)
- [x] A category budget specifies: amount, currency, period (monthly | quarterly | yearly)
- [ ] The category dropdown in the budget form shows **all categories** (both income and expense are valid budget targets), but they are clearly grouped with a visible **Income** and **Expense** section header so the user can tell them apart
- [x] A budget on a parent category aggregates actuals from the parent and **all descendants**
- [x] A category may have at most one active budget at a time
- [x] Editing a budget's amount does not retroactively change historical periods — only the current and future periods reflect the new amount
- [x] Deleting a budget keeps historical transactions intact; only the target is removed

### Progress display
- [x] Each budget shows: target amount, actual so far this period, remaining (or over), and a progress bar
- [x] Progress bar uses color: green when comfortably within budget, amber near the limit, red when over
- [x] "Near the limit" threshold is configurable in settings (default 80%)
- [x] Progress is visible in two places: on the Budgets screen (this spec) and inline on the Categories screen (SPEC-003) where applicable

### Periods
- [x] Each budget's period is independent (one budget can be monthly, another yearly)
- [x] The current period for a monthly budget aligns with the global planning period start day from SPEC-008
- [x] Each new period starts fresh from the target amount — leftover or overspend from the previous period does **not** carry over

### Budgets screen
- [x] A dedicated Budgets screen lists all active category budgets
- [x] User can add, edit, and delete budgets from this screen
- [x] Reachable from the **More menu** as **"Category budgets"** (the name explicitly contains "Category" so it cannot be confused with envelope-level concepts or other future planning features)

## UI / Screens

```
BUDGETS SCREEN
+----------------------------------------------+
|  Category budgets                 [+ New]    |
+----------------------------------------------+
|  +-----------------------------------------+ |
|  | Groceries                Monthly        | |
|  | 245 / 300 EUR     [████████░░] 82%      | |  <- amber
|  | 5 days left in period                   | |
|  +-----------------------------------------+ |
|  +-----------------------------------------+ |
|  | Eating out               Monthly        | |
|  | 180 / 150 EUR     [██████████] 120%     | |  <- red, over
|  +-----------------------------------------+ |
|  +-----------------------------------------+ |
|  | Employment / Salary      Monthly        | |
|  | 3,000 / 3,000 EUR [██████████] 100%     | |  <- green (income target met)
|  +-----------------------------------------+ |
+----------------------------------------------+

BUDGET FORM
+----------------------------------+
|  New category budget             |
|                                  |
|  Category:  [ Groceries      v]  |
|  Amount:    [____________] EUR   |
|  Period:    [ Monthly        v]  |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+
```

## Data

Category budget record:
- id
- categoryId: id of the category the budget applies to
- amount: number
- currency: currency code
- period: monthly | quarterly | yearly
- createdAt: date

Derived (per current period):
- actual: sum of transactions in this category (recursive across descendants for parent categories) within the current period
- remaining: amount − actual
- percentUsed: actual / amount
- status: ok | near-limit | over (based on threshold)

App settings (new):
- budgetWarningThresholdPercent: number (default 80)

Sources:
- Categories: SPEC-003
- Transactions: SPEC-005
- Planning period start day (for monthly alignment): SPEC-008

## Out of Scope
- **Envelope budgets** — envelopes already work as rolling balances driven by scheduled transfers from the planning tool (SPEC-009); a separate compare-to-target layer on top would be redundant
- Rollover of leftover/overspend between periods (envelopes already provide this naturally; categories intentionally do not)
- Forecasting future budgets (covered by Planning, SPEC-009)
- Automatic budget suggestions based on history
- Multi-currency budget aggregation
- Charts of budget trends over multiple periods (future Reports spec)
- Notifications / push alerts when nearing a limit (future)

## Open Questions
- **Resolved:** Budgets and planning-tool entries are fully **independent**. Different mental models (compare-to-target vs. forecast cashflow); forcing a link would add complexity. The user is responsible for keeping numbers in sync manually if they want.
- **Resolved:** No envelope budgets — envelope balances already serve that purpose.
- **Resolved:** No rollover — each new period starts fresh.
- **Resolved:** Reachable from the More menu as **"Category budgets"** — name explicitly includes "Category" to avoid confusion with envelope-level concepts.
