---
id: SPEC-033
name: Stock inventory
status: ready
created: 2026-05-06
---

# Stock inventory

## Goal
Give the user a single page that lists every stock the app currently knows about — with or without transaction history — so they can browse, edit, archive, and (when safe) permanently delete stock profiles. Today, the only way a `stockProfile` enters the app is by recording a Buy transaction; this spec adds an explicit registry, a way to add stocks without buying them, and a soft-delete (archive) lifecycle so mistaken or sold-out positions can be hidden without losing their history.

## User Stories
- As a researcher, I can add a stock to the app *without* recording a buy, so I can browse / link it to a portfolio / put it on a watchlist before committing capital.
- As an investor, I can edit a stock's profile (name, exchange, currency, HQ country, dividend frequency, estimation rule) when broker data was wrong or has changed.
- As an investor, I can archive a sold-out position so it stops cluttering selection lists, but I retain its full historical data for tax and reporting purposes.
- As an investor, I can permanently delete a stock I added by mistake, *only* once I've manually cleared its transactions, dividends, portfolio assignments, and watchlist entries — so accidental data loss is impossible.

## Acceptance Criteria

### Inventory list
- [ ] New page accessible from the **More menu** (alongside `Categories / Settings`); both desktop top-nav second row and mobile More dropdown
- [ ] Lists all `stockProfiles` with a default filter showing **active** profiles; toggle reveals **archived** profiles
- [ ] Columns: ticker, name, exchange, currency, HQ country, dividend frequency, archived flag (timestamp on hover), and four history-presence indicators (transaction count, dividend count, in-portfolio count, in-watchlist count)
- [ ] Each history-presence indicator is a clickable deep link that navigates to the relevant filtered list (Transactions / Dividends / Portfolio editor / Watchlist editor)
- [ ] Per-row actions: Edit profile, Archive (disabled if open lots > 0; Unarchive when already archived), Permanent delete
- [ ] "Add stock" button at top of the page launches the SPEC-029 resolution dialog in standalone mode (no transaction context); on confirm, a new `stockProfile` row is created and appears in the inventory immediately
- [ ] Sort: clicking any column header re-sorts the inventory; choice persisted in localStorage. Default when no choice has been made: ascending alphabetical by ticker
- [ ] Counts performance: history-presence counts are computed once on page mount as four maps (`{ticker → count}`) by single-passing each source collection; every row reads from the maps in O(1). Maps are recomputed when the page is re-mounted or when the active/archived filter changes, not memoised across navigations

### Archive lifecycle
- [ ] Archive **precondition: zero open lots** — the Archive button is disabled when the stock has any open position across investing accounts; tooltip explains "Sell all positions in this stock before archiving." Reason: archived stocks are hidden from selection lists, but a held position must remain visible on Stock page / Dividend page / Reports / Watchlist views, so archiving a held stock would create a contradiction
- [ ] When precondition holds, Archive sets `archived: true` and `archivedAt: <ISO timestamp>` on the `stockProfile`
- [ ] Archived stocks are hidden from: Buy form ticker dropdown, Sell form open-position list (always empty for archived stocks anyway), Stock page nav, Dividend page (held set is empty by precondition), Reports default views, Watchlist add-stock list
- [ ] Archived stocks are still visible in: historical transaction lists, historical dividend lists, the Stock inventory archived view, Reports when explicitly filtered to "include archived"
- [ ] Unarchive clears both flags; stock immediately reappears everywhere

### Permanent delete
- [ ] Permanent-delete button is enabled **only** when all four history-presence counts are zero (no transactions, no dividends, no portfolio assignments, no watchlist entries)
- [ ] When disabled, hovering the button shows a tooltip listing what's blocking, with the deep links from the row itself as the way to clean those up
- [ ] When enabled, clicking the button opens a confirmation dialog asking the user to type the ticker; on confirm, the `stockProfile` row plus any orphan `apiDividendHistory` rows for that ticker are removed
- [ ] No cascade deletion of any other data (the precondition is "no other data exists")

## UI / Screens
- **Stock inventory page:** header with `Add stock` button + active/archived filter toggle. Table with sortable columns. Per-row actions in a kebab menu or as inline buttons.
- **Edit profile dialog (shared with Stock page):** form fields name, exchange (MIC dropdown), currency (ISO list), HQ country, dividend frequency, dividend estimation rule. Ticker is read-only; rename uses the existing Phase 22 rename flow.
- **Permanent-delete dialog:** "Type `TICKER` to confirm" input; cancel button; destructive-styled confirm button.

## Data
- **Reads:** `stockProfiles`, `stockTransactions` (history count), `dividends` (history count), `portfolioAssignments` (history count), `watchlistEntries` (history count).
- **Writes:** extends `stockProfiles` with `archived: bool` (default `false`) and `archivedAt: ISO timestamp | null`. No new collection.
- **Cascade rule on permanent delete:** removes the `stockProfile` row and any `apiDividendHistory` rows for the same ticker. Hot caches keyed by ticker (price / news / latest profile) are dropped from memory but not actively cleared (they'd expire on TTL anyway).
- **Migration:** existing `stockProfiles` rows get `archived: false`, `archivedAt: null` on first load.

## Out of Scope
- Bulk archive / bulk delete operations.
- Restore-from-trash for permanently-deleted stocks (deletion is final once the four-zero precondition is met).
- Editing or merging duplicate profiles (two `stockProfiles` for the same ticker shouldn't exist — Phase 22 ticker rename and SPEC-029 resolution are the right tools for that).
- A "drafts" state distinct from the standalone-resolve mode (a stock added without a Buy is a regular active profile, not a draft).

## Open Questions
- None. Resolved during 2026-05-06 design review:
  - Sort order → **user-selectable per column, persisted in localStorage; default = ascending alphabetical by ticker** (acceptance criterion in Inventory list).
  - Page placement → **More menu** (acceptance criterion in Inventory list). The Investments sub-row stays focused on day-to-day investment views; the inventory is an admin-style page used occasionally.
  - Counts performance → **memoise per page-load** (Option B): compute four `{ticker → count}` maps on mount, read from them in O(1) per row. No cross-feature cache to keep in sync (acceptance criterion in Inventory list).
