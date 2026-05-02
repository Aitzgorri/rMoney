---
id: SPEC-025
name: Investment CSV Import
status: done
created: 2026-04-23
---

# Investment CSV Import

## Goal
Let the user import CSV files of investment transactions into the app, with reusable named templates that map CSV columns to app fields. Each investing account can reference a default template, and the first time the user imports a file without a template, they map columns inline and optionally save the mapping as a template for next time. Templates live as first-class entities in Settings, can be named, edited, and deleted.

## User Stories
- As a user with a CSV export from IBKR, I can pick the file in the Investments section, and the app parses the columns and asks me to map each column to an app field, so I can upload transactions without hand-entering them.
- As a user doing the mapping, I can tick "Save as template" at the end, and the next time I import a file with the same column layout I just pick the template and the mapping is done.
- As a user, I can manage my templates in Settings — rename, edit column mappings, delete — so I'm not locked into the first-import mapping forever.
- As a user, each of my investing accounts can have a default template attached. Then importing from that account is two clicks: pick account + file → preview → commit.
- As a user, the app shows me a preview of the mapped rows before it commits anything, so I can catch bad rows (missing dates, unknown tickers) without creating broken records.

## Acceptance Criteria
- [x] **Template CRUD** lives in Settings → Import Templates. User can rename and delete templates. Deletion is blocked if the template is referenced as the default on any investing account; the app shows which account(s) reference it and asks the user to unlink first. Templates are created from the import wizard (Save as template checkbox). Column-mapping edits require re-importing with the manual mapping path.
- [x] A template has: a name, a file-format flag (CSV), a mapping from column name to app field, a date-format hint, a decimal-separator hint, and a default transaction type (or a column-derived type mapping).
- [x] App fields available for mapping: `date`, `type`, `ticker`, `stockExchange` (optional), `shares`, `price`, `currency`, `transactionExternalId` (optional), `fee` (optional, default 0), `exDividendDate`, `payoutDate`, `dividendPerShare`, `shareCount`, `taxPercent`.
- [x] If the CSV column for type is itself a string like "BUY" / "SELL" / "DIV", the template stores a value-map: `{ "BUY": "buy", "SELL": "sell", ... }`. If the CSV has no type column, the template's `defaultTransactionType` applies to every row.
- [x] **Investing account default template**: each SPEC-018 investing account has an optional `defaultCsvTemplateId`. When set, importing into that account pre-selects the template on the setup step. The user can also set a default from the import wizard ("Set as default template" checkbox).
- [x] **First import flow (no template)**: user taps Import CSV on an investing account → picks a file → app reads header row → shows a mapping form with one row per CSV column and a dropdown per row to assign an app field → user fills in date format + decimal separator → user optionally ticks "Save as template" and gives it a name → preview screen shows all mapped rows with validation flags → user commits.
- [x] **Subsequent import flow (with template)**: user picks template + file on setup step → app applies template mapping → goes straight to preview of all mapped rows → user commits.
- [x] **Preview validation** per row flags: missing required field, unparseable date, negative or zero quantity. Rows with errors are visually flagged and skipped by default; user can toggle skip/include per row.
- [x] **On commit**, imported rows are written as SPEC-019 stock transactions or SPEC-020 dividend records per row type. Existing rows are detected by `transactionExternalId` when present — duplicates are skipped with a notice. Transfer rows are counted as skipped (require a destination account, not yet supported).
- [x] Commit is atomic: if any row fails to write due to a schema-level error, the whole batch rolls back and the user gets a clear error.

## UI / Screens
Settings → Import templates (CRUD):

```
Import templates                            [+ New template]
  · IBKR activity       (CSV)     used by: IBKR Roth   [Edit] [Delete]
  · Revolut trades      (CSV)     (no default)          [Edit] [Delete]
```

First-import mapping form:

```
+-----------------------------------------------------------------+
| Import — new template for "IBKR Roth"                           |
|                                                                 |
| File: IBKR-activity-2026-04.csv                                 |
| Date format: [YYYY-MM-DD ▼]   Decimal: [.]   Currency column: ✓ |
|                                                                 |
| CSV column         →  App field                                 |
| ──────────────────────────────────────────────                  |
| Date                  [ date        ▼ ]                         |
| Symbol                [ ticker      ▼ ]                         |
| Quantity              [ shares      ▼ ]                         |
| Price                 [ price       ▼ ]                         |
| Currency              [ currency    ▼ ]                         |
| Action                [ type        ▼ ]   map: BUY→buy,...      |
| Transaction ID        [ transactionExternalId ▼ ]               |
| Commission            [ fee         ▼ ]                         |
| Account               [ — ignore —  ▼ ]                         |
|                                                                 |
| [x] Save as template:  [ IBKR activity           ]              |
|                                                                 |
|                            [Cancel]   [Preview import]          |
+-----------------------------------------------------------------+
```

Preview screen:

```
Import preview — 42 rows parsed, 40 will be imported, 2 errors

2026-04-20  BUY   AAPL  10 @ $175.20   ✓
2026-04-18  BUY   MSFT   5 @ $410.80   ✓
2026-04-15  SELL  TSLA   3 @ $165.00   ⚠  Unknown ticker — create profile? [Yes]
2026-04-12  —            —  ✗ Missing date                [Skip]
...                                [Cancel]   [Commit 40 rows]
```

## Data

`csvImportTemplates` collection:

```
{
  id: string,
  name: string,
  format: 'csv',
  dateFormat: string,                  // e.g. 'YYYY-MM-DD', 'DD/MM/YYYY'
  decimalSeparator: string,            // '.' or ','
  mapping: {
    [csvColumn: string]: string         // e.g. "Symbol" → "ticker"
  },
  typeValueMap: {                       // when a 'type' column exists
    [csvValue: string]: 'buy' | 'sell' | 'transfer' | 'dividend'
  } | null,
  defaultTransactionType: 'buy' | 'sell' | 'transfer' | 'dividend' | null,
  createdAt: ISO timestamp
}
```

Reference from SPEC-018 investing account: `defaultCsvTemplateId: string | null`.

Writes: SPEC-019 stockTransactions, SPEC-020 dividends.

## Out of Scope
- Formats other than CSV in Phase 2 (no Excel, no OFX, no QIF).
- API-driven auto-import from IBKR without the CSV step. SPEC-027 IBKR Web API support can pull transactions directly — that's a separate flow and lives in SPEC-027, not this spec.
- Pre-built broker templates shipped with the app. All templates are user-created in Phase 2; shipping curated templates for common brokers is future work.
- Editing imported rows differently from user-entered rows. Once imported, a row is a normal SPEC-019 / SPEC-020 record.
- Undoing a committed import as a batch. Individual records are deleted normally.
- Handling of splits or other corporate actions that appear in a CSV as line items. Those rows would be mapped to a "split" transaction type (if the broker reports splits in the CSV); complex corporate actions are out of scope.
- **Importing cash-movement rows from a broker CSV** (deposits, withdrawals, broker-side currency exchanges that aren't tied to a stock buy, interest payments). Phase 2 imports only buy / sell / transfer / split / dividend rows. Cash-movement rows in a broker CSV need a budgeting-side account + envelope that the CSV doesn't know about, so they are entered manually via the SPEC-018 deposit / withdrawal / standalone exchange forms. Future work can add cash-movement import with a per-row budgeting picker.

## Open Questions
None.
