---
id: SPEC-002
name: Accounts
status: done
created: 2026-04-03
---

# Accounts

## Goal
Allow the user to manage the financial accounts where money is held or tracked.
Every transaction is linked to an account, so accounts must exist before any recording can happen.

## User Stories
- As a user, I can create an account so that I can record transactions against it
- As a user, I can edit an account so that I can correct mistakes or update details
- As a user, I can archive an account so that it is hidden but its transaction history is preserved
- As a user, I can delete an account so that I can remove one that was created by mistake (only if it has no transactions)
- As a user, I can see all my accounts and their current balances at a glance

## Acceptance Criteria
- [x] User can create an account with: type, company name, account name, starting balance, currency
- [x] Account types: Cash, Savings, Debit, Credit Card
- [x] Each account displays its current balance (starting balance +/- transactions)
- [x] User can edit any field of an existing account
- [x] User can archive an account — it disappears from normal views but data is kept
- [x] User can delete an account only if it has no transactions linked to it
- [x] Archived accounts are viewable in a separate "Archived" section
- [x] Accounts screen accessible from Dashboard via "See all" link
- [x] Each account shows its currency alongside the balance
- [x] Credit card balances are shown as negative numbers (money owed is a liability)
- [x] **Favorite accounts (Phase 48):** the user can mark accounts as favorites and order them in **Settings → General → Favorite accounts** (drag-to-reorder + search-to-add + remove). The ordered list is stored as account IDs in `rmoney_settings.favoriteAccounts` and surfaces favorites at the top of the Dashboard balances list (SPEC-008) and every account picker (SPEC-005, Phase 51)

## UI / Screens

```
ACCOUNTS SCREEN
+----------------------------------+
|  Accounts              [+ New]   |
+----------------------------------+
|  ACTIVE                          |
|  +----------------------------+  |
|  | My Bank — Savings     EUR  |  |
|  | 2,450.00                   |  |
|  +----------------------------+  |
|  +----------------------------+  |
|  | Wallet — Cash         USD  |  |
|  | 80.00                      |  |
|  +----------------------------+  |
|                                  |
|  [Show archived]                 |
+----------------------------------+

ADD / EDIT ACCOUNT FORM
+----------------------------------+
|  New Account                     |
|  Type:         [Cash v]          |
|  Company name: [____________]    |
|  Account name: [____________]    |
|  Currency:     [EUR v]           |
|  Starting bal: [____________]    |
|  [Cancel]           [Save]       |
+----------------------------------+
```

## Data

Account record:
- id (unique identifier, generated automatically)
- type: cash | savings | debit | credit
- companyName: text
- accountName: text
- currency: currency code (e.g. EUR, USD, GBP)
- startingBalance: number
- isArchived: true | false
- createdAt: date

Derived (not stored):
- currentBalance = startingBalance + sum of linked transactions

## Out of Scope
- Currency conversion / exchange rates (future)
- Shared accounts between users (future)
- Importing transactions from bank (future)

## Open Questions
- None.
