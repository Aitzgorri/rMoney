---
id: SPEC-009
name: Planning
status: done
created: 2026-04-08
---

# Planning

## Goal
Give the user a single page where they can plan their future cashflow: what regular and one-time income they expect, where that income should end up (which envelope), and what they intend to spend it on (a structured tree of planned expenses tied to envelopes). The page makes it obvious whether the plan balances — whether planned expenses fit within planned income — and turns the plan into the concrete scheduled transfers that drive day-to-day envelope movements.

Planning answers: "What does my month look like on paper?" and "Am I planning to spend more than I earn?".

## User Stories
- As a user, I can plan my regular monthly incomes so that I know what I expect to receive
- As a user, I can plan one-time incomes so that I capture irregular money I'm expecting
- As a user, I can choose, per income, which envelope it should land in (default: Undistributed income)
- As a user, I understand that planned incomes are scratchpad-only — they are *not* synced to scheduled transfers, because incoming money does not come from another envelope (real income tracking lives in Bills & Income, SPEC-013)
- As a user, I can build a tree of planned expenses and tie each leaf to an envelope so that I know where my money is supposed to go
- As a user, I can enter a planned expense as a yearly, quarterly, or monthly amount and have the other two computed for me
- As a user, I can plan one-time envelope-to-envelope transfers so that occasional reallocations are part of the plan
- As a user, I can see at a glance whether my planned income covers my planned expenses for the period
- As a user, I can keep the income/expense/difference totals visible while scrolling through the plan
- As a user, I can change the time period the plan is displayed in (default monthly)
- As a user, I can see which of my planned items already have active scheduled transfers and which are still pending, so I know what's live vs. what's still a draft
- As a user, I can freely edit planned amounts without affecting active transfers, and only commit changes when I explicitly apply them
- As a user, I can create a parent expense item directly (as a grouping container) without needing to first create a leaf and then add children
- As a user, I can set a day-of-month on each planned expense leaf so the scheduled transfer fires on the day I choose
- As a user, I can hover/tap the sync indicator icons to see a tooltip explaining what they mean
- As a user, I can see each planned expense's share as a percentage of total expenses, so I know my spending priorities at a glance

## Acceptance Criteria

### Multiple plans *(Phase 65 — from the 10 Jul 2026 notes; decision P1 locked 2026-07-10)*
- [x] The user can keep **multiple named plans** and switch between them via **visual plan boxes on the left side** of the page (a left column on desktop, a wrapped row on mobile), with **+ New plan**, inline **rename** (✎), **duplicate** (⧉) and **delete** (×) actions — every action button carries a tooltip
- [x] **Exactly one plan is ACTIVE** (green badge): only it shows sync indicators and offers Reset/Apply. All other plans are **drafts** (freely editable — no sync icons, no Apply); making a draft active is an explicit **★ Make active** action with a confirmation dialog. The active-plan id lives in the settings blob (`settings.activePlanId`) so it **syncs between devices** — unlike Buy-Sell Planning's per-device active scenario
- [x] **Switching the active plan changes no scheduled transfer by itself**: the newly active plan's rows show their real sync state (`linkedScheduledTransferId` is a plain pointer — several plans may reference the same live rule); live transfers not covered by the new plan keep firing and remain visible on the Scheduled-transfers page (the confirmation dialog says all of this)
- [x] **Drafts never touch live rules**: deleting a draft plan (or rows/conversions inside a draft) never deletes a scheduled transfer; the **active plan cannot be deleted** (switch first — this also guarantees ≥1 plan always exists)
- [x] **Duplicate** deep-copies the plan (fresh ids, expense-tree parentIds remapped) and **keeps** the transfer-link pointers, so a duplicated-then-activated plan adopts the same live rules seamlessly
- [x] Viewing a draft shows a **banner** naming the active plan with a shortcut to make the viewed draft active; new rows created while viewing a plan land in that plan
- [x] **Migration**: `ensureDefaultPlan()` (boot + after backup import, idempotent) creates "Plan 1" when no plans exist, stamps `planId` on legacy items, and heals a missing/stale active-plan id. Backup format bumped to **`rmoney-data-v7`** (SPEC-016); the `rmoney_plans` collection syncs (id-list merge, `updatedAt` stamps, tombstones on delete) and appears in a new **Settings → Storage "Envelope planning" card** (plans + incomes + expenses breakdown, bulk delete recreates the default plan)
- [x] The plans data layer is unit-tested (migration idempotence + healing, scoping, duplicate tree-remap + kept links, active-plan delete guard + tombstones + transfers untouched, cross-plan link clearing)

### Page and overall layout
- [x] Planning is a separate page, reachable from the **More menu** as **"Envelope planning"** (the name explicitly contains "Envelope" so it cannot be confused with budget targets or other future planning features)
- [x] The page has two main sections: **Planned incomes** and **Planned expenses** (the list of all scheduled transfers lives on its own page — see SPEC-012)
- [x] A **summary header** is always visible (sticky) while scrolling and shows: total planned income, total planned expenses, and the difference, all for the currently selected period
- [x] The summary header is **visually highlighted in red/warning style** when planned expenses exceed planned income
- [x] A **time-period selector** in the header lets the user view totals as monthly (default), quarterly, or yearly
- [x] Changing the period recalculates all displayed amounts in both sections, not just the summary

### Planned incomes
- [x] User can add a planned income with: name, amount, currency, frequency, target envelope, start date (and end date for regular incomes, optional)
- [x] **Frequency options come from the shared `utils/frequency.js` module** *(Phase 53b)*: the full set **one-time, weekly, bi-weekly, monthly, quarterly, yearly** — closing the last dropdown left outside the Phase 47 unification. The day picker is a **weekday** selector for weekly/bi-weekly and a **day-of-month (1–28)** selector for monthly/quarterly/yearly (`dayPickerKind`), resetting when the picker kind changes; income rows label the day via the shared `dayLabel` ("Tuesday · Bi-weekly", "15th · Monthly")
- [x] Weekly/bi-weekly planned incomes are counted in the summary totals through their monthly equivalent (×52/12, ×26/12): `convertAmount` accepts them as a *from* basis *(Phase 53b — this also fixed a latent bug where `expenseSyncStatus` treated a weekly/bi-weekly linked scheduled transfer's amount as if it were monthly)*. The display-period basis itself stays monthly/quarterly/yearly
- [x] Target envelope defaults to the built-in **Undistributed income** envelope but the user may pick any envelope
- [x] User can have multiple regular incomes (e.g. salary + side hustle) and multiple one-time incomes
- [x] User can edit or delete any planned income freely (scratchpad — no popups, no automatic transfer/transaction changes)
- [x] **Planned incomes are scratchpad-only.** They do *not* have a "from" envelope and are never converted into scheduled envelope transfers or recurring transactions. They exist purely to feed the income total in the summary header so the user can see whether the plan balances. Real account-level income tracking is done in Bills & Income (SPEC-013).
- [x] Planned incomes therefore have **no sync indicator, no reset button, and no "apply" action** on their rows. The "Apply all transfers" action bar button only operates on planned expenses.

### Planned expenses (tree)
- [x] Planned expenses live in their **own tree** — independent from the Categories tree (SPEC-003)
- [x] User can create planned expense items at the root or nested under any existing item
- [x] Nesting is unlimited in depth
- [x] **Leaf** items can be linked to **exactly one** envelope
- [x] **Parent** items cannot be linked to an envelope
- [x] A leaf item carries: name, envelope, source envelope (default: Undistributed income), currency, amount, an "amount basis" (which of the three frequency columns the user typed in), day of execution, and a **transfer occurrence** (`transferFrequency` — see the *Transfer occurrence* section below; before Phase 61f the occurrence did not exist as its own field and every applied transfer was monthly). `dayOfExecution` is **persisted on create** since Phase 61f — previously `createPlannedExpense` silently dropped it and the chosen day only survived edits
- [x] When the user enters or edits the amount on one frequency field, the other two are auto-calculated (yearly = monthly × 12 = quarterly × 4) — auto-calculation triggers on blur, not on every keystroke
- [x] A parent item displays the **sum of all its descendants' amounts** in each column (read-only)
- [x] User can expand/collapse parent items
- [x] User can edit, move, or delete any item
- [x] Deleting a parent prompts a confirmation listing all descendants that will also be deleted (same pattern as SPEC-003 / SPEC-004)

### Converting a leaf into a parent
- [x] When the user adds a child under what was previously a leaf, the leaf's planned amount and any scheduled transfers it generated are deleted
- [x] Before the conversion proceeds, the user is shown exactly what will be deleted (the planned amount, any related scheduled transfers and recurring transactions) and must explicitly confirm
- [x] After confirmation, the item becomes a parent (no envelope link, amount becomes the sum of children) and the conversion proceeds

### Editing amounts (no automatic prompts)
- [x] The planning tool is a **scratchpad**: the user can freely edit any planned income or planned expense amount without triggering popups or modals — changes are reflected immediately in the summary totals so the user can see the income/expense impact
- [x] Edits do **not** automatically create or update scheduled transfers or recurring transactions

### Amount precision (Phase 54a)
- [x] **"Apply" never persists sub-cent amounts**: the computed monthly figure (`convertAmount` of a yearly/quarterly target — e.g. 51.66/yr → 4.305) is rounded to 2 decimals via `round2` before it is written to the scheduled/one-time transfer, and the data layer (`createEnvelopeTransfer` / `createScheduledTransfer` / `coerceAmount` on updates) rounds every amount on write as a guard — no write path can store more than 2 decimals (SPEC-004)
- [x] The sync-status comparison rounds both sides to cent precision first, so an unrounded planned figure can never read as out-of-sync against its correctly-rounded stored transfer
- [x] The Phase 43c startup migration (`migrateTransferAmounts`) now also **repairs already-stored sub-cent amounts** (rounding them to 2 decimals), fixing the "Balance 0,01 vs running balance 0,00" disagreement from the 08 Jul 2026 screenshot without the user re-saving records

### Sync indicators (expenses only)
- [x] Each planned **expense leaf** shows a **sync indicator** when **any prescribed field** differs from the corresponding scheduled envelope transfer (or when no transfer exists yet): the amount (monthly-equivalent, cent precision), the **target or source envelope** *(Phase 61g — envelope edits were previously never detected, leaving no way to apply them)*, the **occurrence/frequency** *(Phase 61f)*, or the **day of execution** *(Phase 61g)*
- [x] Each out-of-sync expense row also shows a small **reset icon** that reverts that individual item back to the current transfer amount (or clears the amount if no transfer exists yet)
- [x] Planned incomes do **not** show a sync indicator or reset icon — see "Planned incomes" above

### Applying changes to transfers (expenses only)
- [x] An **action bar** at the bottom of the planning page (below the expense tree) contains two buttons: **"Reset all"** and **"Apply all transfers"**
- [x] **"Apply all transfers"** processes every out-of-sync planned **expense** in one click: creates new scheduled envelope transfers where none exist, and updates existing ones with **every prescribed field — envelopes, frequency, amount, and day** *(Phase 61g; previously only amount/day were written, so an edited target envelope could never propagate)*. Planned incomes are skipped entirely.
- [x] **"Reset all"** clears the amount on any unapplied expense and reverts any out-of-sync expense to the current transfer amount. Planned incomes are skipped entirely.
- [x] **Applying never records a transfer immediately** *(Phase 55b — same rule as SPEC-013 editing)*: apply creates/updates the scheduled **rule** only; the transfer fires when the rule's day is due (which may be today, if today IS the chosen day). Previously the "next occurrence only" scope created an envelope transfer dated **today** regardless of the recurrence day — that scope choice is **removed** (its two options had converged to the same rule-update anyway, differing only by the buggy immediate transfer; the old spec text describing a one-occurrence override was never what the code did)
- [x] The apply dialog lists each affected item with **when the change takes effect** — "takes effect today" / "takes effect {date}" (the rule's next occurrence with the item's chosen day) — and states "Nothing is recorded now — each transfer fires on its scheduled day"
- [x] The user can also trigger create/update on a **single expense row** by clicking its sync indicator — same dialog, same semantics
- [x] After applying, all sync indicators clear

### Creating parent expense items directly
- [x] The "New planned expense" form includes a checkbox or toggle: **"Group only (no envelope/amount)"**
- [x] When toggled on, the envelope, source envelope, currency, and amount fields are hidden — the user only fills in name and optional parent
- [x] The created item is saved as a parent (envelopeId, sourceEnvelopeId, currency, amount all null)
- [x] A group-only item **never shows the sync indicator or reset icon**, even before it has any children — it cannot have a scheduled transfer
- [x] Children can then be added under it normally

### Transfer occurrence *(Phase 61f — from the 10 Jul 2026 feedback: "every transfer was considered monthly")*
- [x] Each planned expense leaf has an **Occurrence** select — **monthly (default) | quarterly | yearly** — that sets how often the applied scheduled transfer fires. A hint under the select names which amount column (MON/QTR/YR) the transfer will move
- [x] **"Apply" creates/updates the scheduled transfer at that frequency with the amount in that same basis** (rounded to cents, Phase 54a): a 600/yr insurance with a yearly occurrence produces ONE 600 transfer per year — not twelve 50 slices. Quarterly/yearly rules anchor their months on the rule's creation (the existing SPEC-012 engine semantics; a start-date control on the expense may extend this later)
- [x] The **sync indicator also flags a frequency mismatch**: a leaf prescribing quarterly against a linked transfer still firing monthly reads out-of-sync even when the monthly equivalents match; applying rewrites the transfer's frequency along with amount and day
- [x] The **reset action adopts the transfer's frequency** as both occurrence and amount basis; a weekly/bi-weekly linked transfer (possible by editing the rule on the Scheduled-transfers page) falls back to its monthly equivalent, since the planning columns are yearly/quarterly/monthly only
- [x] Expense rows with a **non-monthly occurrence carry a small "QTR"/"YR" tag** next to the name, with an explanatory tooltip
- [x] The apply dialog's "takes effect {date}" line is **occurrence-aware** (next occurrence at the chosen frequency + day; updates keep the linked rule's anchor)
- [x] **Weekly / bi-weekly are deliberately not offered** as expense occurrences — the planning amount model is yearly/quarterly/monthly; a weekly envelope rule can still be created manually via the transfer form (SPEC-004). Revisit only if a real need appears
- [x] The apply/sync/reset logic lives as **pure, unit-tested functions in `data/planning.js`** (`plannedTransferFields`, `expenseSyncStatus`, `resetFieldsFromTransfer`), moved out of the component
- [x] `plannedTransferFields` prescribes the **complete** transfer — source/target envelope, frequency, amount, day — and both the sync check and the apply-update write all of it *(Phase 61g: fixes "changing the target envelope cannot be applied")*

### Day of execution on planned expenses
- [x] Each planned expense leaf carries a **dayOfExecution** field (1–28, default 1)
- [x] The expense form shows a "Day of month" picker for leaf items (same as the income form)
- [x] When "Apply" creates a scheduled transfer for an expense, it uses the expense's dayOfExecution (not hard-coded 1)
- [x] When "Apply" updates an existing scheduled transfer, dayOfExecution changes are also synced

### Sync indicator tooltips
- [x] The ● (sync) icon shows a tooltip on hover: **"Out of sync — click to apply"** when the amount differs from the transfer, or **"Not yet applied — click to create transfer"** when no transfer exists
- [x] The ↺ (reset) icon shows a tooltip on hover: **"Reset to current transfer amount"** (or **"Clear amount"** if no transfer exists)
- [x] On mobile (touch devices), a long-press triggers the tooltip

### Expense percentage column and compact headings
- [x] A new **%** column is added, showing each item's share of total planned expenses for that currency
- [x] Column order in the expense table: **%, YR, QTR, MON** (short headings with tooltips showing full names: "Percentage", "Yearly", "Quarterly", "Monthly")
- [x] For leaf items: percentage = (item monthly amount / total monthly expenses for same currency) × 100
- [x] For parent items: percentage = (parent monthly sum / total monthly expenses for same currency) × 100
- [x] Percentages are displayed to one decimal place (e.g. "14.3%")
- [x] The YR / QTR / MON value columns are formatted to two decimal places with a **comma decimal separator** and a narrow-space thousands separator (e.g. "1 234,00"), via `fmtAmt` from `src/utils/format.js` *(Phase 43g — landed automatically when 43h switched `fmtAmt` to comma; the columns already called `fmtAmt`)*
- [x] On desktop, the value columns and actions column are wide enough that the out-of-sync indicator dot (`●`) never overlaps the MON value
- [x] Each planned-expense row is **highlighted on mouse hover** (subtle full-row background) so that, on a wide desktop screen, the name on the left can be matched to its action buttons on the right. The hover highlight is overridden by the drag-and-drop drop-target backgrounds while dragging.
- [x] The same full-row hover highlight is applied to **planned-income rows** and the **one-time transfer row**, not only expense rows, so all planning rows behave consistently on a wide desktop screen *(Phase 43f)*
- [x] The hover highlight is **clearly visible** against the row background (the Phase 42 expense-row tint was too subtle) *(Phase 43f — solid `#2a3450`, replacing the faint `rgba(148,163,184,0.1)`)*
- [x] The expense form shows Yearly, Quarterly, and Monthly amount fields in a compact row with currency dropdown at the end

### Expense tree collapse / expand *(Phase 45)*
- [x] Clicking anywhere on a parent expense row (except the action buttons) toggles its collapse/expand — the whole row is the toggle target, not only the chevron. *(Phase 45c)*
- [x] The collapsed/expanded state is **persisted** (localStorage `rmoney_planning_expanded`) so returning to the page restores the prior state instead of fully expanding. *(Phase 45d — shared `useCollapseState` hook)*
- [x] A header **Expand all / Collapse all** control toggles every parent expense at once. *(Phase 45d)*

### Amount input behaviour fix
- [x] Typing a number in an amount field must not auto-format with decimals while the user is still typing
- [x] Auto-calculation of the other frequency fields only triggers on blur (when the user leaves the field) — not on every keystroke
- [x] The field the user is actively typing in must never be overwritten by formatting

### One-time income allocations *(Phase 66 — from the 10 Jul 2026 notes; decision P2 locked 2026-07-10)*
- [x] An expense leaf row carries a **⤵ action button** that creates a **one-time allocation row** beside it (same parent, never auto-created): a planned-expense record with `allocationIncomeId` (the ONE one-time planned income it distributes — **picked per row**, auto-selected when only one exists — P2), a **date** (defaults to the income's date, editable), an amount, and the income's currency. The button appears only when the viewed plan has at least one one-time income
- [x] The allocation's **source envelope is always the income's landing envelope** (not user-pickable). The **target envelope is a hierarchical dropdown** (indented tree per the mandatory convention) **defaulting to the clicked row's envelope but freely changeable** *(Phase 66e — originally fixed to the row's envelope, which made deep envelopes without an expense row of their own unreachable: the allocation silently went to whichever envelope the nearest ⤵ row was bound to)*. The form shows the source and a live "already allocated elsewhere · left" hint for the picked income
- [x] The allocation's **default name is "{target envelope} — from {income name}"** (shown as the placeholder, used when the name is left empty, and live-updating as the envelope/income selection changes) *(Phase 66e — user feedback: the envelope name leads so rows are identifiable in the tree)*
- [x] Each **one-time income row shows a distribution indicator** — "distributed X of Y · Z left" — turning into a red **"overspent by N"** warning when the allocation rows exceed the income *(Phase 66b; computed by the pure, unit-tested `incomeAllocationSummary`)*
- [x] **Apply records a ONE-TIME envelope transfer** (existing SPEC-004 record type) dated as planned — never a recurring rule; the apply dialog labels allocation items and notes they are recorded immediately as dated transfers. Allocation rows have the same ●/↺ **sync/reset** indicators, compared against their linked one-time transfer (`allocationSyncStatus` — amount, date, and both envelopes; reset re-adopts the transfer's amount + date)
- [x] Allocation rows render with a **⤵ date tag**, show their amount in the **MON column only**, and are **excluded from parent sums and the % base** (they are not recurring flows) while still counting **flat** in the plan-balance totals — mirroring how one-time incomes count
- [x] **One-time income lifecycle** *(Phase 66d — user feedback 2026-07-10: applied transfers were destroyed on delete, leaving no cleanup path)*: deleting a one-time income with allocation rows opens a **two-option dialog** — **"Remove from plan"** (default: the income and ALL its allocation rows go; **transfers already created stay recorded** — plan cleanup never rewrites envelope history) vs **"Also delete N transfers"** (explicit full undo; offered only on the active plan, since a draft's links may be shared copies). Deleting a **single allocation row** likewise always keeps its created transfer (remove it from the envelope history if truly unwanted)
- [x] **Auto-fade** *(Phase 66d)*: the one-time income form offers **"Keep it — I delete it manually"** (default) vs **"Fade automatically"** — a fading income self-deletes together with its allocation rows (transfers always kept) once **every** allocation row is applied and in sync (checked on Planning load and right after Apply, active plan only; an income with no allocation rows never fades). The distribution indicator shows a "fades when applied" hint. `autoFade` is an additive field — no backup bump. Unit-tested: cascade keep-vs-delete, autoFade persistence, fade only-when-all-applied, manual/rowless never fade
- [x] All allocation logic lives as pure, unit-tested functions in `data/planning.js` (`incomeAllocationSummary`, `plannedAllocationTransferFields`, `allocationSyncStatus`, `isAllocationRow`); the new `allocationIncomeId`/`date`/`linkedEnvelopeTransferId` fields are additive on planned-expense records — **no backup-format bump** (v7 stays current)

### One-time envelope transfers
- [x] User can add a **one-time** envelope-to-envelope transfer from the planning page (in addition to the regular ones generated by planned incomes/expenses)
- [x] The transfer form here defaults to **regular** (not one-time) — see SPEC-004 — because most planning-tool transfers are regular, but the user can switch it to one-time
- [x] One-time envelope transfers do not require any account

## UI / Screens

```
PLANNING PAGE
+----------------------------------------------------+
|  <- Planning              Period: [Monthly v]      |
+----------------------------------------------------+
|  Income: 3,000 EUR   Expenses: 2,840 EUR           |  <- sticky summary
|  Difference:  +160 EUR                             |     turns red if negative
+----------------------------------------------------+
|                                                    |
|  PLANNED INCOMES                       [+ Add]     |
|  +----------------------------------------------+  |
|  | Salary               3,000 EUR/mo            |  |
|  | Side hustle            400 EUR/mo            |  |  <- no sync icons: incomes are scratchpad only
|  | Tax refund             800 EUR               |  |
|  +----------------------------------------------+  |
|                                                    |
|  PLANNED EXPENSES                      [+ Add]     |
|  +----------------------------------------------+  |
|  |                          %    Year   Month   |  |
|  |  > Housing             55.8  14,400  1,200   |  |  <- parent (sums)
|  |     Rent               46.5  12,000  1,000   |  |
|  |     Utilities           9.3   2,400    200 ● |  |  <- out of sync (tooltip on hover)
|  |  > Car                 11.6   3,000    250   |  |
|  |     Gasoline            9.3   2,400    200   |  |
|  |     Insurance           2.3     600     50   |  |
|  |  Groceries             18.6   4,800    400 ● |  |  <- not yet applied
|  |  Vacation              14.0   3,600    300   |  |
|  |                                              |  |
|  |  TOTAL               100.0  25,800  2,150    |  |
|  +----------------------------------------------+  |
|                                                    |
|  [↺ Reset all]            [✓ Apply all transfers]  |  <- action bar
+----------------------------------------------------+

Sync indicator key:
  ●   = out of sync (amount differs from transfer, or no transfer exists yet)
  ↺   = reset icon (revert this row to current transfer amount)
  no icon = in sync with existing transfer

PLANNED INCOME FORM
+----------------------------------+
|  New planned income              |
|                                  |
|  Name:        [____________]     |
|  Amount:      [____________] EUR |
|  Frequency:   [ Monthly      v]  |
|  Day:         [ 1            v]  |
|  Lands in:    [ Undistributed v] |  <- envelope, default Undistributed
|  Start date:  [ 2026-05-01    ]  |
|  End date:    [ (optional)    ]  |
|                                  |
|  [Cancel]            [Save]      |
+----------------------------------+

PLANNED EXPENSE FORM (leaf)
+--------------------------------------+
|  New planned expense                 |
|                                      |
|  Name:        [____________]         |
|  Parent:      [ (root)       v]      |
|  [ ] Group only (no amount)          |  <- when checked, hides fields below
|  From:        [ Undistributed v]     |  <- source envelope
|  To:          [ Groceries    v]      |  <- destination envelope
|  Day of month:[ 1            v]      |  <- day the scheduled transfer fires
|                                      |
|  YR         QTR        MON          |
|  [______]   [______]   [______] EUR v|  <- compact row, currency dropdown at end
|                                      |  <- editing one auto-fills the others on blur
|  [Cancel]            [Save]          |
+--------------------------------------+

APPLY TRANSFERS — PROMPT (shown when clicking "Apply all" or a single row's sync indicator)
+----------------------------------+
|  Apply changes to transfers      |
|                                  |
|  3 items will be updated:        |
|    • Side hustle (income)        |
|    • Utilities (expense)         |
|  1 item will be created:         |
|    • Groceries (expense)         |
|                                  |
|  For existing transfers:         |
|  ( ) Next occurrence only        |
|  (o) The whole series            |
|                                  |
|  [Cancel]          [Apply]       |
+----------------------------------+

LEAF → PARENT CONVERSION WARNING
+----------------------------------+
|  Convert "Car" to a parent?      |
|                                  |
|  This will delete:               |
|    • Planned amount: 250 EUR/mo  |
|    • Scheduled transfer:         |
|      Undist → Car 250/mo (1st)   |
|                                  |
|  This cannot be undone.          |
|                                  |
|  [Cancel]      [Convert]         |
+----------------------------------+
```

## Data

Plan record *(Phase 65)*:
- id
- name: text
- createdAt / updatedAt: dates

*The active plan is `settings.activePlanId` (synced via the settings blob — decision P1). Both planned incomes and planned expenses carry a `planId` (absent on legacy records until `ensureDefaultPlan` stamps them).*

Planned income record:
- id
- planId: id of the plan this row belongs to (Phase 65)
- name: text
- amount: number
- currency: currency code
- frequency: one-time | weekly | monthly | quarterly | yearly | ...
- dayOfExecution: number (for regular — e.g. 20 means the 20th of each month)
- startDate: date (for regular — when this recurring income starts being active; can be a future date)
- endDate: date | null (for regular — when to stop, optional)
- date: date (for one-time — the single date this income occurs)
- autoFade: bool (one-time only, Phase 66d — self-delete with its allocation rows once all are applied; transfers kept; null on recurring incomes; absent = manual)
- envelopeId: id of the envelope the income lands in (default: built-in Undistributed income)
- createdAt: date

*Note: planned incomes have no `linkedScheduledTransferId`. They are scratchpad-only and do not generate scheduled transfers.*

Planned expense item:
- id
- planId: id of the plan this row belongs to (Phase 65)
- name: text
- parentId: id of parent item, or null if root
- envelopeId: id of destination envelope (required for leaves, must be null for parents)
- sourceEnvelopeId: id of source envelope (default: built-in Undistributed income; required for leaves, must be null for parents)
- currency: currency code (required for leaves, null for parents)
- amountBasis: yearly | quarterly | monthly (which one the user typed in)
- amount: number (in the unit of amountBasis)
- transferFrequency: monthly | quarterly | yearly | null (the occurrence of the scheduled transfer "Apply" generates; null/absent = monthly — legacy records and parents; Phase 61f, additive — no backup bump)
- dayOfExecution: number 1–28 (day of month for the scheduled transfer; required for leaves, null for parents; default 1; persisted on create since Phase 61f)
- allocationIncomeId: id of the one-time planned income a **one-time allocation row** distributes, or null on regular rows (Phase 66)
- date: date of the one-time transfer an allocation row plans (defaults to the income's date); null on regular rows (Phase 66)
- linkedEnvelopeTransferId: id of the ONE-TIME envelope transfer created by applying an allocation row, or null (Phase 66)
- linkedScheduledTransferId: id of the scheduled envelope transfer (SPEC-004) generated by "Apply", or null if not yet applied
- createdAt: date

Derived for planned expense items:
- yearlyAmount, quarterlyAmount, monthlyAmount — computed from `amount` + `amountBasis` for leaves; sum of descendants for parents
- percentOfTotal — item's monthly amount / total monthly expenses for same currency × 100
- isLeaf: true if no children exist
- syncStatus (expense leaves only): "in-sync" if `linkedScheduledTransferId` exists and the transfer amount matches the planned amount; "out-of-sync" if amounts differ; "not-applied" if no linked transfer exists yet

One-time envelope transfer (planning-tool entry point):
- Same shape as the existing envelope transfer record in SPEC-004 — no new data type. The planning tool just calls the same form.

Period summary (derived per displayed period):
- totalPlannedIncome: sum of all planned incomes normalized to the selected period
- totalPlannedExpenses: sum of all planned expense leaves normalized to the selected period
- difference: totalPlannedIncome − totalPlannedExpenses

Sources / cross-references:
- Envelope records and scheduled envelope transfers: SPEC-004

## Out of Scope
- Budget targets per category or per envelope (covered separately in the upcoming `budgets` spec)
- Comparing plan vs. actuals (future — likely a Reports spec)
- Multi-currency planning math (planning is done per currency; cross-currency conversion is a future concern)
- Charts and visualisations of the plan
- Importing a plan from a spreadsheet

## Open Questions
- None.
