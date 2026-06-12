---
id: SPEC-012
name: Scheduled Transfers
status: done
created: 2026-04-08
---

# Scheduled Transfers

## Goal
Give the user a single place to see and manage **all scheduled envelope transfers** in the app — regardless of where they were created (the envelope detail screen in SPEC-004, the planning tool in SPEC-009, or this page itself). Without this page, scheduled transfers are scattered across individual envelopes and the planning tool, and there's no way to get an overview.

## User Stories
- As a user, I can see every scheduled envelope transfer the app has, in one list
- As a user, I can tell which transfers came from the planning tool and which were created manually
- As a user, I can tap any scheduled transfer to edit or delete it
- As a user, I can create a new scheduled transfer directly from this page

## Acceptance Criteria
- [x] Page is reachable from the **More menu** as **"Scheduled transfers"**
- [x] The page lists **every** scheduled envelope transfer in the app, regardless of where it was created
- [x] Each row shows: source envelope, destination envelope, amount, frequency, day of execution, and an indicator showing whether it was generated from a planning-tool item or created manually
- [x] Scheduled (regular) transfers support the shared frequency set (Phase 47): **weekly, bi-weekly, monthly, quarterly, yearly** — created via the SPEC-004 transfer form, which reads its options from `utils/frequency.js`. The execution engine (`runDueScheduledTransfers`) fires each frequency on the correct day: weekday for weekly/bi-weekly, day-of-month for monthly/quarterly/yearly. **Bi-weekly, quarterly and yearly anchor on the rule's `createdAt`** (scheduled transfers carry no start date): bi-weekly fires every 14 days from the first matching weekday on/after creation; quarterly/yearly fire on the day-of-month every 3rd / 12th month from the creation month. The due-date check uses the **local** calendar date (no UTC `toISOString` shift)
- [x] If a row was generated from a planning item, the row shows (or links to) the planning item that drives it
- [x] User can sort the list by: **next execution date** (default), amount, or source envelope name
- [x] Tapping a row opens it for editing using the scheduled-transfer form from SPEC-004
- [x] User can create a new scheduled transfer from this page (uses the same transfer form from SPEC-004, with the toggle defaulting to **regular**)
- [x] User can delete a scheduled transfer; if the transfer was generated from a planning item, deleting it from here also detaches/clears that link on the planning item (with a confirmation explaining the consequence)

## UI / Screens

```
SCHEDULED TRANSFERS PAGE
+----------------------------------------------------+
|  <- Scheduled transfers              [+ New]       |
+----------------------------------------------------+
|  Source → Destination     Amount  Freq   Day  Src  |
+----------------------------------------------------+
|  Undist → Vacation        300 EUR  mo    15  plan  |
|  Undist → Groceries       400 EUR  mo    15  plan  |
|  Undist → Car              50 EUR  mo     1  man.  |
|  Salary buf → Holidays    200 EUR  mo    20  plan  |
+----------------------------------------------------+
| Dashboard | Envelopes | [+] | Transactions | More  |
+----------------------------------------------------+
```

## Data
This page reads existing data — it does not introduce new data types.

Sources:
- Scheduled envelope transfer records (SPEC-004)
- Planning items that generated transfers (SPEC-009) — used to display the link/source indicator

Derived:
- nextExecutionDate: computed from frequency + dayOfExecution + today
- source indicator: "plan" if the transfer is linked to a planning item, "manual" otherwise

## Out of Scope
- Creating/editing the scheduled-transfer form itself (covered by SPEC-004)
- Filtering and search beyond simple sort (future)
- History of executed transfers (already covered by envelope transaction history in SPEC-007)

## Open Questions
- None.
