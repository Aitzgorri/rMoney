---
id: SPEC-004
name: Envelopes
status: done
created: 2026-04-03
---

# Envelopes

## Goal
Allow the user to track savings goals by allocating money into envelopes.
Envelopes answer "what is this money for?" — separate from categories which answer "what kind of transaction is this?".
Envelopes are primarily a savings-tracking tool: the user distributes income into envelopes and watches progress toward goals.

## User Stories
- As a user, I can create envelopes to track how much I've saved toward specific goals
- As a user, I can nest envelopes hierarchically to group related savings goals
- As a user, I can transfer money between envelopes to reallocate my savings
- As a user, I can set up scheduled transfers so that regular savings happen automatically
- As a user, I can see a savings projection showing how much I'll have by a given date
- As a user, I can edit, archive, or delete envelopes
- As a user, I don't have to assign an envelope to every transaction — unassigned ones go to a default envelope automatically

## Acceptance Criteria

### Envelope management
- [x] User can create an envelope at root level or nested under any existing envelope
- [x] Nesting is unlimited in depth
- [x] User can edit the name of any envelope
- [x] User can archive an envelope — it disappears from normal views but data is kept
- [x] User can delete an envelope; if it has sub-envelopes, a warning lists all affected sub-envelopes and user must confirm
- [x] Deleting an envelope removes it and all its sub-envelopes
- [x] Archived envelopes are viewable in a separate "Archived" section
- [x] Envelopes screen shows an expandable/collapsible tree
- [x] **Favorite envelopes (Phase 48):** the user can mark envelopes as favorites and order them in **Settings → General → Favorite envelopes** (drag-to-reorder + search-to-add + remove). Stored as envelope IDs in `rmoney_settings.favoriteEnvelopes`; favorites surface at the top of every envelope picker in Phase 51

### Built-in default envelopes
- [x] App ships with two built-in envelopes: "Undistributed income" and "Unassigned expenses"
- [x] Built-in envelopes can be renamed but NOT deleted
- [x] Built-in envelopes can be archived, but the user must first designate another envelope as the new default for that type (income or expense)
- [x] When a transaction has no envelope assigned, it is automatically placed in the current default income or expense envelope

### Envelope transfers
- [x] User can transfer money between any two envelopes (source and destination)
- [x] Transfers are reallocations only — no real bank transaction is created
- [x] An envelope may have a negative balance
- [x] Transfer history is visible (who, when, how much, from where, to where)
- [x] When creating a new transfer, the "From" field defaults to the "Undistributed income" envelope
- [x] The transfer form has a **one-time / regular** toggle so the user can decide, at creation time, whether the transfer happens once or repeats on a schedule
- [x] When the form is opened from the **envelope detail screen**, the toggle defaults to **one-time**
- [x] When the form is opened from the **planning tool** (SPEC-009), the toggle defaults to **regular** *(prop ready, planning tool not yet built)*
- [x] Switching the toggle to "regular" reveals the frequency / day-of-execution fields

### Transfer amount integrity & balance calculation *(Phase 43)*
- [x] Transfer amounts are always stored as **numbers**, never strings — every write path coerces with `Number(...)` before persisting: one-time **create** and **edit** (`createEnvelopeTransfer` / `updateEnvelopeTransfer`) and scheduled **create** and **edit** (`createScheduledTransfer` / `updateScheduledTransfer`). (Previously the one-time *edit* path stored the raw string from the form, corrupting later sums.) *(Phase 43a: `Number(form.amount)` in `EnvelopeTransferForm`; `coerceAmount` helper applied in `updateEnvelopeTransfer` / `updateScheduledTransfer`.)*
- [x] Envelope balance derivation coerces amounts on **read** (`s + Number(t.amount)` for both transfers-in and transfers-out in `getEnvelopeBalance`), so even a legacy string amount can never corrupt a sum. This makes calculations correct immediately, before the migration below runs. *(Phase 43b.)*
- [x] Editing a transfer's amount immediately yields a correct parent / total balance — no `NaN`, and no string-concatenated value (e.g. `200 + "150"` must give `350`, not `"200150"`). *(Phase 43a+43b.)*
- [x] A one-time startup migration repairs any already-stored **string** transfer and scheduled-transfer amounts by coercing them to numbers, so previously-corrupted data is cleaned up without the user re-saving each record. *(Phase 43c: `migrateTransferAmounts` wired into `main.jsx`; only finite values are rewritten.)*
- [x] **"Today" defaults use the local calendar** *(Phase 53d)*: the transfer form's date default and `createEnvelopeTransfer`'s fallback date go through `localDateStr()` — never `toISOString().split('T')[0]`, which rolls back a day near midnight in UTC+ timezones (the 16→15 bug family). The same sweep converted every remaining date-only `toISOString` derivation app-wide (TransactionForm, Planning, Bills & Income incl. its due-filter, InvestingAccountDetail); regression-tested at the data layer

### Scheduled transfers
- [x] User can create a scheduled transfer with: source envelope, destination envelope, amount, frequency, day of execution
- [x] An envelope can have multiple scheduled transfers (both incoming and outgoing)
- [x] Scheduled transfers execute automatically on the specified day
- [x] User can edit or delete a scheduled transfer

### Savings projection
- [x] User can see a projection: "If I transfer X per month, I'll have Y by date Z"
- [x] Projection accounts for existing balance plus all active scheduled transfers into the envelope

## UI / Screens

```
ENVELOPES SCREEN
+----------------------------------+
|  Envelopes             [+ New]   |
+----------------------------------+
|  Undistributed income    1,200   |  <- default income envelope
|  Unassigned expenses      -340   |  <- default expense envelope
|                                  |
|  > Vacation                 800  |  <- expandable
|      Summer 2026            500  |
|      Winter ski trip        300  |
|  > Home                     450  |
|      Electricity            150  |
|      Repairs                300  |
|  New bicycle                120  |
|                                  |
|  [Show archived]                 |
+----------------------------------+

ENVELOPE DETAIL
+----------------------------------+
|  <- Summer 2026                  |
|                                  |
|  Balance:          500.00 EUR    |
|                                  |
|  Scheduled transfers:            |
|  +----------------------------+  |
|  | From: Undistributed income |  |
|  | 200.00 EUR / monthly (15th)|  |
|  | [Edit] [Delete]            |  |
|  +----------------------------+  |
|  [+ Add scheduled transfer]     |
|                                  |
|  Projection:                     |
|  At current rate:                |
|  Jul 2026: 900 | Aug: 1,100     |
|  Sep: 1,300 | ... | Dec: 1,900  |
|                                  |
|  Transfer history:               |
|  15 Mar — +200 from Undistrib.   |
|  15 Feb — +200 from Undistrib.   |
|  01 Feb — +100 from Side hustle  |
+----------------------------------+

TRANSFER FORM
+----------------------------------+
|  Transfer between envelopes      |
|                                  |
|  From:    [Undistributed inc. v] |
|  To:      [Summer 2026       v]  |
|  Amount:  [____________]         |
|  Type:    (o) One-time  ( ) Regular  <- default depends on entry point
|  ┌─ when Regular ──────────────┐ |
|  │ Frequency: [Monthly      v] │ |
|  │ Day:       [15           v] │ |
|  └─────────────────────────────┘ |
|                                  |
|  [Cancel]          [Transfer]    |
+----------------------------------+

SCHEDULED TRANSFER FORM
+----------------------------------+
|  Scheduled transfer              |
|                                  |
|  From:      [Undistributed   v]  |
|  To:        [Summer 2026     v]  |
|  Amount:    [____________]       |
|  Frequency: [Monthly         v]  |
|  Day:       [15              v]  |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+

DELETE WARNING DIALOG
+----------------------------------+
|  Delete "Vacation"?              |
|                                  |
|  This will also delete:          |
|    • Summer 2026                 |
|    • Winter ski trip             |
|                                  |
|  This cannot be undone.          |
|                                  |
|  [Cancel]          [Delete all]  |
+----------------------------------+
```

## Data

Envelope record:
- id (unique identifier, generated automatically)
- name: text
- parentId: id of parent envelope, or null if root
- isBuiltIn: true | false
- isDefault: true | false (only one default per type: income, expense)
- isArchived: true | false
- createdAt: date

Envelope transfer record:
- id
- fromEnvelopeId
- toEnvelopeId
- amount: number
- date: date
- isScheduled: true | false (was this created by a scheduled transfer?)

Scheduled transfer record:
- id
- fromEnvelopeId
- toEnvelopeId
- amount: number
- frequency: monthly | weekly | etc.
- dayOfExecution: number (e.g. 15 for the 15th of the month)
- isActive: true | false
- createdAt: date

Derived:
- balance: sum of all transfers into the envelope minus all transfers out
- children: all envelopes where parentId = this id (recursive)
- projection: balance + (scheduled incoming - scheduled outgoing) * future periods

## Out of Scope
- Linking envelopes to specific accounts (envelopes are account-agnostic)
- Sharing envelopes between users (future)
- Envelope colours or icons (future)
- Category targets/budgets (covered in a separate spec)

## Open Questions
- None.
