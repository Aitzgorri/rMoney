---
id: SPEC-005
name: Transaction Entry
status: done
created: 2026-04-03
---

# Transaction Entry

## Goal
Allow the user to record income, expenses, and account transfers.
This is the core data entry point — every financial event flows through here.
Transactions can be one-off or recurring (scheduled to repeat automatically).

## User Stories
- As a user, I can record an income or expense so that I can track my finances
- As a user, I can transfer money between accounts so that movements between my bank, card, and cash are tracked
- As a user, I can set up recurring transactions so that regular income and expenses are created automatically
- As a user, I can skip specifying optional fields and sensible defaults are applied

## Acceptance Criteria

### Transaction types
- [x] User can create three types of transaction: Income, Expense, Account Transfer
- [x] The [+] button in the bottom nav opens a type selector (Income / Expense / Transfer)

### Income and Expense fields
- [x] Required fields: type, amount, currency, account, date
- [x] Optional fields: category, envelope, payee, note
- [x] If category is not specified, defaults to built-in "Uncategorized income" or "Uncategorized expense"
- [x] The category dropdown shows **only income categories** when the transaction type is Income, and **only expense categories** when the type is Expense — cross-type categories are never shown
- [x] If envelope is not specified, defaults to built-in "Undistributed income" or "Unassigned expenses"
- [x] If payee is not specified, defaults to "Unspecified payee"
- [x] Date defaults to today

### Account Transfer fields
- [x] Required fields: source account, source amount, destination account, destination amount, date
- [x] Currency is determined by the selected accounts
- [x] If both accounts share the same currency, only one amount field is shown
- [x] If accounts have different currencies, user enters both amounts (sent and received)
- [x] Exchange rate is automatically calculated from the two amounts and saved with the transfer
- [x] Optional field: transfer fee (default 0) — deducted from the source account
- [x] Account transfers do NOT require category, envelope, or payee
- [x] Date defaults to today

### Form layout *(Phase 51a/b/g)*
- [x] On **computer width (≥1024px)** the form lays out in rows; below that it is a single column. Income/Expense: **row 1** = Date (narrow) · Account · Payee, **row 2** = Category · Envelope · Amount (narrow) · Currency (narrow), **row 3** = Note
- [x] Account Transfer: **row 1** = Date · From account · To account, **row 2** = Amount/Received · Fee · Currency, **row 3** = Note (the cross-currency "Sent + source currency" row appears between rows 1 and 2 when the accounts differ)
- [x] The recurring block lays out Name · Frequency · Day on one row at computer width

### Smart dropdowns *(Phase 51c–h)*
- [x] **Favorite accounts** (SPEC-002) appear at the top of every account select (account, transfer From, transfer To) — favorites first, a divider, then the rest — via the shared `splitFavorites` helper *(rendering extracted to shared `components/optionHelpers.jsx` in Phase 53e, reused by the Bills & Income and envelope-transfer forms)*
- [x] **Favorite categories** (type-scoped to the form's income/expense context, SPEC-003) and **favorite envelopes** (SPEC-004) appear as a **Favorites** group at the top of their dropdowns, above the full indented tree (which stays complete)
- [x] **Account prepopulation:** when creating a transaction on the Transactions page, the account defaults to the account filtered in the left column; if none is filtered, the most-recently-used account (`defaultAccountId` prop)
- [x] **Account prepopulation on the standalone add route** *(Phase 53a)*: the mobile ＋-menu "New transaction" screen prefills the same way — the Transactions screen's active account filter first (mirrored via the session-only `utils/uiSession.js` store, deliberately not persisted so it can never disagree with the visible filter after a restart), else the last-used account (shared `getLastUsedAccountId()` in `data/transactions.js`, also used by the desktop inline form). Returning to the Transactions screen restores the filter
- [x] **Inline category creation:** a `＋ New category…` option in the category dropdown opens an inline mini-form (name + optional parent, type from context) that creates the category and selects it without leaving the form
- [x] **Payee → category memory:** selecting a payee with no category chosen prefills the last category used for that payee; the payee's last 3 distinct categories appear in a "Recent for this payee" group at the top of the category dropdown. Derived from transaction history (no new storage)
- [x] The selected envelope's **full ancestor path** (`Household › Food › Groceries`) is shown as a helper line directly under the envelope dropdown

### Built-in categories
- [x] App ships with two built-in categories: "Uncategorized income" (income type) and "Uncategorized expense" (expense type)
- [x] Built-in categories can be renamed but NOT deleted
- [x] Built-in categories can be archived if the user designates another category as the new default for that type

### Payees
- [x] Payees are built up over time — when a user types a payee name, it is saved for future use
- [x] Previously used payees are suggested (autocomplete) when entering a new transaction
- [x] Payees can be used for reporting (total received from / total paid to a payee) — the report UI lives in **SPEC-037 (Payees)**

#### Payee autocomplete behaviour *(Phase 44)*
- [x] The suggestion list shows up to **10** payees (raised from 5), ranked by **most-used** (number of transactions), tie-broken by most-recent use *(Phase 44a — `getPayeesRanked` in `data/transactions.js`)*
- [x] When the payee field is **focused while empty**, the top-10 most-used payees are shown as the baseline list (not only after the user starts typing) *(Phase 44a)*
- [x] The list is keyboard-navigable: **↑ / ↓** move the highlight, **Enter or Tab** selects the highlighted payee, **Esc** dismisses the list; mouse click still selects *(Phase 44a)*
- [x] The field stays **freely editable** — choosing a suggestion only fills the text; the user can keep typing a brand-new payee that isn't in the list (Enter with no highlight keeps the typed text) *(Phase 44a)*
- [x] The autocomplete is implemented as a **shared, reusable component** (`components/PayeeAutocomplete.jsx`), consumed by the transaction form and the SPEC-007 Envelope History payee filter; the SPEC-037 report filter consumes it too when built (44c–f). *(Phase 44b)*

### Recurring transactions
Recurring transactions are **planned items** managed by SPEC-013 (Bills & Income). The transaction form provides a convenient shortcut to create them.
- [x] User can mark a transaction as recurring with: frequency and day of execution. Frequency options come from the shared `utils/frequency.js` module (Phase 47) — the recurring set **weekly, bi-weekly, monthly, quarterly, yearly** — matching Bills & Income (SPEC-013) and scheduled transfers (SPEC-012). The day picker is a **weekday** selector for weekly/bi-weekly and a **day-of-month (1–28)** selector for monthly/quarterly/yearly (`dayPickerKind`), and resets when the picker kind changes
- [x] The recurring section includes a Name field, prepopulated with the payee name, editable by the user
- [x] Saving a recurring transaction creates a planned item (SPEC-013) with auto-apply mode
- [x] The shared recurring engine (SPEC-013) auto-creates transactions on the scheduled day, backfilling any missed occurrences on app open
- [x] Editing and cancelling recurring rules is done from the Bills & Income screen (SPEC-013)
- [x] Examples: salary on the 1st monthly, rent on the 5th monthly, Netflix on the 15th monthly

### Editing and deleting
- [x] User can edit any field of an existing transaction
- [x] User can delete a transaction

## UI / Screens

```
TYPE SELECTOR (after tapping [+])
+----------------------------------+
|  New transaction                 |
|                                  |
|  [  Income  ]                    |
|  [  Expense ]                    |
|  [ Transfer ]                    |
+----------------------------------+

INCOME / EXPENSE FORM
+----------------------------------+
|  <- New Expense                  |
|                                  |
|  Amount:    [____________] EUR v |
|  Account:   [Daily Card      v]  |
|  Date:      [2026-04-03       ]  |
|  Category:  [Car / Gasoline   v]  |
|  Envelope:  [Summer 2026     v]  |
|  Payee:     [Gas Station XYZ  ]  |
|  Note:      [____________     ]  |
|                                  |
|  Recurring: [ ] Set up repeat    |
|  ┌─────────────────────────────┐ |
|  │ Name:      [Gas Station XYZ]│ |  <- prepopulated with payee
|  │ Frequency: [Monthly     v]  │ |
|  │ Day:       [15          v]  │ |
|  └─────────────────────────────┘ |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+

ACCOUNT TRANSFER FORM (same currency)
+----------------------------------+
|  <- Transfer                     |
|                                  |
|  From:      [Savings EUR     v]  |
|  To:        [Daily Card EUR  v]  |
|  Amount:    [____________] EUR   |
|  Fee:       [       0.00] EUR    |
|  Date:      [2026-04-03       ]  |
|  Note:      [____________     ]  |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+

ACCOUNT TRANSFER FORM (different currencies)
+----------------------------------+
|  <- Transfer                     |
|                                  |
|  From:      [EUR Account A   v]  |
|  Sent:      [       10.00] EUR   |
|  Fee:       [        0.00] EUR   |
|  To:        [USD Account B   v]  |
|  Received:  [       11.50] USD   |
|  Rate:      1 EUR = 1.15 USD     |  <- auto-calculated
|  Date:      [2026-04-03       ]  |
|  Note:      [____________     ]  |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+
```

## Data

Transaction record:
- id (unique identifier, generated automatically)
- type: income | expense | transfer
- amount: number
- currency: currency code (e.g. EUR, USD)
- accountId: id of the account (for income/expense)
- sourceAccountId: id of source account (for transfers)
- sourceAmount: number (for transfers — amount leaving source account)
- sourceCurrency: currency code (for transfers)
- destinationAccountId: id of destination account (for transfers)
- destinationAmount: number (for transfers — amount arriving at destination)
- destinationCurrency: currency code (for transfers)
- exchangeRate: number (auto-calculated: destinationAmount / sourceAmount)
- transferFee: number (default 0, deducted from source account)
- categoryId: id of category, or built-in default (income/expense only)
- envelopeId: id of envelope, or built-in default (income/expense only)
- payeeName: free-text payee name string (income/expense only; defaults to "Unspecified payee" when blank). NOTE: payees are stored denormalised as a name string on the transaction, not as an id reference — the `rmoney_payees` registry below is a secondary lookup populated from these names. (Earlier drafts said `payeeId`; corrected to match the implemented string model — see SPEC-037.)
- date: date
- note: text (optional)
- isRecurring: true | false
- plannedItemId: id of the planned item (SPEC-013) that created this (if applicable)
- createdAt: date

Payee record:
- id
- name: text
- createdAt: date

Recurring transaction rule:
See **SPEC-013 Planned account transaction** — recurring transactions use the same data model (planned items with `applicationMode: auto-apply`).

## Out of Scope
- Splitting a transaction across multiple categories or envelopes (future)
- Importing transactions from bank files (future)
- Photo/receipt attachment (future)
- Automatic exchange rate lookup from external API (user enters both amounts manually)

## Open Questions
- None.
