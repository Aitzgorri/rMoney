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
- As a user, after a CSV commit finishes, the app tells me which imported tickers still need confirmation and lets me jump straight to the Stock inventory pre-filtered to those tickers, so I can verify each mapping points to the right security.

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

### Deduplication during import *(Phase 33)*
- [x] **Transaction de-dup by external ID OR composite key.** A buy/sell/transfer row is treated as already-imported if either:
  - `transactionExternalId` is present on the CSV row AND a `stockTransactions` row already exists with that `transactionExternalId`; OR
  - `transactionExternalId` is absent AND a `stockTransactions` row already exists with the same `(date, ticker, shares, price, type)` tuple.
- [x] **Dividend de-dup by composite key.** A dividend row is treated as already-imported when a `dividends` row already exists with the same `(payoutDate, ticker, shareCount, dividendPerShare, currency)` tuple. (Dividends typically have no broker-side external id; the composite key is the only way to dedup.)
- [x] **Duplicates are skipped, not flagged as errors.** The commit step does not write a duplicate row but reports it on the post-commit screen (see below). Each skipped row carries a reason (`'duplicate-external-id'` or `'duplicate-composite'`).

### Post-commit import report *(Phase 33)*
- [x] **Done screen lists every row's outcome.** After commit, the report shows a table with one row per parsed CSV line plus columns: line number, description, status (`imported` / `duplicate` / `error` / `skipped`), and a reason cell. Sorted by line number ascending.
- [x] **Filter pill above the report** with options: `All` / `Imported only` / `Not imported only` / `Errors only` (defaults to `All`). Selection is local to the screen (not persisted). A row count summary in each pill.
- [x] **Per-row action affordances.** Skipped rows with a `'validation-error'` reason carry an "Edit row" button that expands an inline form so the user can fix the parse error (e.g. corrupted date) and retry commit for that row. Duplicate rows carry a "View existing" link that navigates to the Stock page (buy/sell) or Dividends page.
- [x] **Existing "needs confirmation" card stays.** The Phase 32 "needs confirmation" card (below) still renders below the summary when any imported ticker lacks confirmation.

### Post-commit confirmation nudge *(Phase 32 / item 390)*
- [x] **Stub `stockProfile` creation.** During commit, after all `createBuy` / `createSell` / `createDividend` calls succeed, the importer collects every unique ticker that appeared in the committed records and calls `upsertStockProfile(ticker, {})` for each. The upsert only creates a row if none exists (existing rows are untouched, so confirmed profiles are not flipped back). New stubs land with `confirmed: false`, `confirmedAt: null` (SPEC-033 default). This guarantees every imported ticker appears in the Stock inventory so the user can review it from one place.
- [x] **"Needs confirmation" card on the Done screen.** After commit, build `needsConfirmation = unique imported tickers where the stockProfile has confirmed !== true`. If the list is non-empty, render a warning-styled card below the existing import-stats block with:
  - Title: *"N ticker(s) need confirmation"* (where N is the list length).
  - Body: comma-separated list of the tickers. If more than 10, show the first 10 plus "and {extra} more".
  - Explanation: *"These tickers were imported without a confirmed mapping to a real security. Confirm each one to be sure it points to the company you intended."*
  - Button: *"Review in Stock inventory"* — navigates to the Stock inventory page (SPEC-033) with the **Unconfirmed** filter pre-applied via the deep-link entry point.
- [x] If every imported ticker is already confirmed, the card is not rendered (silent success).
- [x] The card does not block the existing **Close** button; the user can dismiss the screen without reviewing if they want.

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

Writes: SPEC-019 stockTransactions, SPEC-020 dividends, SPEC-033 `stockProfiles` (stub rows for newly-imported tickers, `confirmed: false`).

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
