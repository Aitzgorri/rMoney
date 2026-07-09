---
id: SPEC-013
name: Bills & Income
status: done
created: 2026-04-09
---

# Bills & Income

## Goal
Give the user a dedicated place to manage **planned account transactions** — regular or one-time incomes and expenses that are tied to a specific bank account. These represent real money movements: salary arriving, rent going out, phone bills due, etc.

Each planned item can be either **auto-applied** (the app creates the transaction automatically on the defined day) or **outstanding** (the app flags it as pending and the user reviews, adjusts the amount if needed, and manually confirms). This distinction matters because some bills are fixed (rent is always 1,000 EUR) while others vary (phone bill changes monthly).

This is separate from:
- **Envelope planning** (SPEC-009) — which is about distributing money across envelopes, with no account link
- **Transaction entry** (SPEC-005) — which is for recording transactions that already happened or one-off entries

Planned items can also be created from the **transaction entry form** (SPEC-005) via the "Set up recurring" toggle — this is a convenience shortcut that creates a planned item, prepopulating the name from the payee. The user can choose the application mode (auto-apply or outstanding) directly in the toggle section.

Bills & Income answers: "What money do I expect to come in or go out of my accounts, and when?"

## User Stories
- As a user, I can plan regular incomes (e.g. salary on the 1st) so the app knows what I expect to receive
- As a user, I can plan regular expenses (e.g. rent on the 5th) so the app knows what bills are coming
- As a user, I can plan one-time incomes or expenses (e.g. tax refund in May) for things that happen once
- As a user, I can choose whether each item is auto-applied or outstanding, depending on whether the amount is predictable
- As a user, I can see outstanding items as pending and confirm them with the actual amount when they're due
- As a user, I can see a list of all my planned items and upcoming due dates at a glance

## Acceptance Criteria

### Planned item management
- [x] User can create a planned item with: type (income | expense), name, amount, currency, account, category (optional), envelope (optional), payee (optional), frequency (one-time | weekly | **bi-weekly** | monthly | quarterly | yearly), day of execution (for regular), date (for one-time), start date (for regular — when it becomes active), end date (for regular — optional), application mode (auto-apply | outstanding)
- [x] **Frequency options come from the shared `utils/frequency.js` module** (Phase 47) so the same set appears here, in the transaction-recurrence box (SPEC-005) and in regular envelope transfers (SPEC-012). The day-of-execution picker is chosen by `dayPickerKind(frequency)`: a **weekday** picker for weekly/bi-weekly, a **day-of-month (1–28)** picker for monthly/quarterly/yearly. **Bi-weekly = fortnightly** on the chosen weekday: anchored to the first matching weekday on/after the start date, then every 14 days (honouring any end date)
- [x] Account is **required** — each planned item is linked to a specific account
- [x] Category, envelope, and payee follow the same defaults as transaction entry (SPEC-005): built-in defaults when not specified
- [x] The payee field uses the shared **`PayeeAutocomplete`** control (Phase 49c), aligned with the transaction form — ranked suggestions, keyboard nav, freely editable
- [x] The category dropdown shows **only income categories** when the planned item type is Income, and **only expense categories** when the type is Expense — cross-type categories are never shown *(verified built — `typedCats` filters by the form's type; ticked during the Phase 53e review)*
- [x] **Favorites in the form dropdowns** *(Phase 53e)*: the account select shows ★ favorite accounts first with a divider (shared `accountOptions`); the category and envelope selects show a **Favorites** optgroup (type-scoped for categories) above the full indented tree — same Phase 51c conventions as the transaction form, via the shared `components/optionHelpers.jsx`
- [x] **Payee → category memory** *(Phase 53e)*: entering a payee with no category chosen prefills the payee's last-used category (type-matched, exact-name match), and the payee's last 3 distinct categories appear in a "Recent for this payee" optgroup above Favorites — same behaviour as the transaction form (`getRecentCategoriesForPayee`)
- [x] User can edit any field of a planned item
- [x] User can delete a planned item

### Editing semantics *(Phase 55a — decisions D1 locked 2026-07-08)*
- [x] **Edits apply "from now on" by default**: saving an edit re-anchors generation via an additive `generatedFrom` field (= the edit day), which suppresses every due date before it — a schedule-affecting edit can never backfill transactions on save (the pre-55a bug where editing an auto-apply item immediately created a today-dated transaction; regression-tested)
- [x] A due date **on** the edit day still fires — the user chose today's day intentionally (auto-apply → transaction; outstanding → pending). New items are unaffected: creation still backfills from the start date by design
- [x] The form shows a **live "Next occurrence: {date}" line** while editing the schedule, switching to "Due today — will be recorded as a transaction / shown as pending on save" when the chosen schedule hits today
- [x] **Opt-in past rewrite (amount only)**: when an edit changes the amount of a recurring item that has recorded history, a dialog offers **"From now on"** (default) vs **"Also update N past records (since {date})"** — the label states explicitly that only the amounts of the linked transactions change; their dates, accounts, categories, envelopes and payees stay untouched (`applyAmountToPastOccurrences`, which also stamps the occurrences' `actualAmount`). Preview count/date come from `countPastConfirmedOccurrences` (confirmed occurrences holding a `transactionId`)
- [x] No backup-format bump: `generatedFrom` is additive (absent = legacy behaviour)

### Occurrence overrides — one-time edits, skip, early confirm *(Phase 55d/55e — decision D4 locked 2026-07-08)*
- [x] Clicking an **upcoming occurrence** (Dashboard Upcoming card or the Bills & Income Upcoming view; recurring items only) opens a one-time edit dialog: change that occurrence's **date, amount and/or note**, **skip it**, or jump to **editing the series** (55a). The series keeps its original schedule
- [x] Overrides are stored on the item as `overrides: { [seriesDate]: { date?, amount?, note?, skipped? } }` (additive, no backup bump) keyed by the ORIGINAL schedule date; occurrences carry `seriesDate` as their dedupe key so a moved occurrence can never double-fire. The engine **consumes (prunes) an override** once its occurrence is generated or skipped
- [x] **A chosen date that has arrived records the transaction immediately in BOTH application modes** — the user picked the date intentionally, no second confirmation (D4). An override moving an occurrence **later** delays generation past the original due date; a **skipped** occurrence is recorded as skipped (no transaction) and the series continues
- [x] **Early confirmation** *(55e)*: the dialog's **"Record now"** button (and any date ≤ today) confirms the occurrence before its planned date with an editable amount — covering "executed Friday because the due day falls on Sunday" and paid-sooner-than-estimated cases
- [x] Upcoming lists and next-occurrence displays are **override-aware** (`getNextEffectiveOccurrence`): they show the effective date and amount (marked ↻), pass over skipped occurrences, and advance to the next original-schedule occurrence after an override is consumed. **They also pass over series dates that already have an occurrence record** (pending/confirmed/skipped) — without this, a consumed skip or record-now override made the date pop back into the upcoming lists until a second click (bug fixed 2026-07-09, regression-tested); the engine also consumes any override targeting an already-handled occurrence so it can't linger
- [x] **Due (already-generated) occurrences are editable from the Dashboard too**: clicking a due row opens the same dialog in *pending mode* — Skip calls `skipOccurrence`, **Confirm** records via `confirmOccurrence` with the edited date/amount/note (the inline Confirm button remains for the planned values); "Record now" is hidden since Confirm covers it (bug fixed 2026-07-09)
- [x] An amount-only override (no date chosen) keeps the item's application mode — an outstanding item still surfaces as pending with the overridden amount

### Next-period income attribution *(Phase 55f)*
- [x] Income planned items have a **"Count in the next planning period"** flag; transactions generated from them (auto-apply, single/bulk/Dashboard confirm) carry `periodShift: 'next'` (additive field)
- [x] The Dashboard period summary attributes such transactions to the period AFTER the one their date falls in (`selectPeriodTransactions` in `utils/planningPeriod.js` — in-period without shift + previous-period with shift; unit-tested against the "wage on the 7th, period starts the 10th" example) and shows a note when carried-in income contributes
- [x] One-off incomes can set the same flag per transaction in the transaction form (SPEC-005)
- [x] Deleting a regular planned item asks: delete only future occurrences, or also remove already-created transactions? User chooses.

### Application modes
- [x] **Auto-apply**: on the defined day, the app automatically creates a transaction (SPEC-005) with the planned amount and all configured fields (account, category, envelope, payee). If the app was not opened on the defined day, all missed occurrences are backfilled on next app open.
- [x] **Outstanding**: on the defined day (or when the app is opened after that day), the item appears as **pending** in an outstanding items list
- [x] Pending items show the planned amount as a pre-filled suggestion, but the user can adjust the actual amount before confirming
- [x] User confirms a pending item to create the actual transaction — or dismisses it if the payment didn't happen (e.g. bill was waived). The created transaction is tagged `isPlanned: true` (like auto-applied ones, Phase 52a) so schedule-generated actuals can be excluded from the envelope projection's unscheduled average (SPEC-007)
- [x] Dismissed items are marked as skipped for that occurrence, not deleted — the next occurrence still fires on schedule
- [x] User can switch an item between auto-apply and outstanding at any time

### Outstanding items list
- [x] The page shows a **pending section** at the top listing all items that are due but not yet confirmed
- [x] The "due date has arrived" comparison uses the **local** calendar date (`localDateStr()`), so a bill due today is confirmable from local midnight — previously `toISOString()` shifted to UTC and hid it until the UTC day caught up *(Phase 53d)*
- [x] Each pending row shows: name, account, days overdue (if past due), an editable date field (pre-filled with due date), and an editable amount field (pre-filled with planned amount)
- [x] Pending items are sorted by due date (oldest first)
- [x] User can confirm a pending item with adjusted date and/or amount directly from the pending row — no separate dialog required
- [x] User can bulk-confirm all pending items (using each row's current date and amount) in one action
- [x] Confirming or skipping a pending item immediately refreshes the page — the item disappears from the pending section and the list below updates
- [x] Confirming the same occurrence twice (e.g. via double-click) is safe: the data layer ignores any call on an already-confirmed occurrence, and a synchronous guard in the UI prevents duplicate calls before React re-renders

### Planned items list
- [x] Below the pending section, the page shows all planned items grouped by type: **Income** and **Expenses**
- [x] Items currently shown in the pending section are **not duplicated** in the list below
- [x] Each row shows: name, amount, frequency, account, next occurrence date, and a status badge: **upcoming** (the next occurrence is in the future)
- [x] User can filter by: type (income/expense), account, frequency, application mode, **and payee** (Phase 49d — a `PayeeAutocomplete` filter beside the type buttons, case-insensitive substring match, with a clear ×)
- [x] User can sort by: name, amount, next occurrence date

### Upcoming view
- [x] The page has a toggle or tab to switch to an **upcoming view** that shows a chronological timeline of the next N planned occurrences across all items
- [x] Each entry shows: date, name, amount, type (income/expense), account, auto/outstanding indicator
- [x] This view helps the user see what's coming up in the next weeks/months

## UI / Screens

```
BILLS & INCOME PAGE
+----------------------------------------------------+
|  <- Bills & Income                                 |
+----------------------------------------------------+
|  PENDING (2 items)                  [✓ Confirm all] |
|  +----------------------------------------------+  |
|  | Phone bill              Daily Card            |  |
|  | [2026-04-05] [47.32] EUR  [Confirm] [Skip]   |  |
|  +----------------------------------------------+  |
|  +----------------------------------------------+  |
|  | Insurance               Main Account          |  |
|  | [2026-04-08] [62.30] EUR  [Confirm] [Skip]   |  |
|  +----------------------------------------------+  |
|                                                    |
|  [ List view ]  [ Upcoming ]           [+ Add]     |
+----------------------------------------------------+
|  INCOME                                            |
|  +----------------------------------------------+  |
|  | Salary       3,000 EUR/mo  Main Acct          |  |
|  | Next: May 1                        [upcoming] |  |
|  +----------------------------------------------+  |
|                                                    |
|  EXPENSES                                          |
|  +----------------------------------------------+  |
|  | Rent         1,000 EUR/mo  Main Acct          |  |
|  | Next: May 5                        [upcoming] |  |
|  +----------------------------------------------+  |
|  | Netflix        12.99 EUR/mo Daily Card        |  |
|  | Next: Apr 15                       [upcoming] |  |
|  +----------------------------------------------+  |
|  (Phone bill and Insurance are in the pending     |  |
|   section above — not shown here again)           |  |
+----------------------------------------------------+

UPCOMING VIEW
+----------------------------------------------------+
|  <- Bills & Income                                 |
+----------------------------------------------------+
|  PENDING (2 items)                  [✓ Confirm all] |
|  ...same as above...                               |
|                                                    |
|  [ List view ]  [ Upcoming ]           [+ Add]     |
+----------------------------------------------------+
|  Apr 15   Netflix         -12.99 EUR  Daily [auto] |
|  Apr 20   Side hustle    +400.00 EUR  Daily [outst]|
|  May 1    Salary       +3,000.00 EUR  Main  [auto] |
|  May 5    Rent         -1,000.00 EUR  Main  [auto] |
|  May 5    Phone bill      -45.00 EUR  Daily [outst]|
|  May 10   Insurance       -62.30 EUR  Main  [outst]|
|  ...                                               |
+----------------------------------------------------+

PLANNED ITEM FORM
+----------------------------------+
|  New planned expense             |
|                                  |
|  Name:        [____________]     |
|  Amount:      [____________] EUR |
|  Account:     [ Main Account v]  |
|  Category:    [ (optional)   v]  |
|  Envelope:    [ (optional)   v]  |
|  Payee:       [ (optional)    ]  |
|  Frequency:   [ Monthly      v]  |
|  Day:         [ 5            v]  |
|  Start date:  [ 2026-05-01    ]  |
|  End date:    [ (optional)    ]  |
|                                  |
|  Mode: (o) Auto-apply            |
|        ( ) Outstanding           |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+
```

## Data

Planned account transaction:
- id
- type: income | expense
- name: text
- amount: number (the planned/expected amount)
- currency: currency code
- accountId: id of the account (required)
- categoryId: id of category (optional, uses built-in default if not set)
- envelopeId: id of envelope (optional, uses built-in default if not set)
- payeeId: id of payee (optional)
- frequency: one-time | weekly | biweekly | monthly | quarterly | yearly
- dayOfExecution: number — a weekday 0–6 (Sun–Sat) for weekly/biweekly, or a day-of-month 1–28 for monthly/quarterly/yearly
- startDate: date (for regular — when this becomes active)
- endDate: date | null (for regular — when to stop, optional)
- date: date (for one-time)
- applicationMode: auto-apply | outstanding
- isActive: true | false
- createdAt: date

Pending occurrence record:
- id
- plannedItemId: id of the planned account transaction
- dueDate: date (the specific date this occurrence is due)
- plannedAmount: number (snapshot of the planned amount at time of generation)
- actualAmount: number | null (filled in by user when confirming)
- status: pending | confirmed | skipped
- confirmedAt: date | null
- transactionId: id of the created transaction (SPEC-005), or null if not yet confirmed

Derived:
- nextOccurrenceDate: computed from frequency + dayOfExecution + startDate
- daysOverdue: today − dueDate (for pending items past due)
- For auto-apply items, the pending record is created and immediately confirmed (transaction created) without user interaction

Sources / cross-references:
- Account records: SPEC-002
- Category records: SPEC-003
- Envelope records: SPEC-004
- Transactions created from confirmations: SPEC-005

## Out of Scope
- Linking planned account transactions to envelope planning items (SPEC-009) — they are independent systems
- Notifications / push alerts when items are due (future)
- Importing bills from bank statements or external services
- Multi-currency planned items (one item = one currency = one account)
- Splitting a planned item across multiple accounts

## Open Questions
- None.
