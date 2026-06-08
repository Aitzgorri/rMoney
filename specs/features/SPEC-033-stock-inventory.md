---
id: SPEC-033
name: Stock inventory
status: done
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
- As an investor, I can see at a glance which tickers in my inventory have been **confirmed** (I personally verified the mapping points to the right company) and which are still **unconfirmed** (likely from a CSV import or an auto-created stub), so I can work through the unconfirmed pile until everything I hold is verified.
- As an investor, I can flip a confirmed ticker back to unconfirmed when I want to revisit a mapping later, so the inventory doubles as a review queue I can curate.

## Acceptance Criteria

### Inventory list
- [x] New page accessible from the **More menu** (alongside `Categories / Settings`); both desktop top-nav second row and mobile More dropdown
- [x] Lists all `stockProfiles` with a default filter showing **active** profiles; toggle reveals **archived** profiles
- [x] Columns: ticker, name, exchange, currency, HQ country, dividend frequency, archived flag (timestamp on hover), and four history-presence indicators (transaction count, dividend count, in-portfolio count, in-watchlist count)
- [x] Each history-presence indicator is a clickable deep link that navigates to the relevant filtered list (Transactions / Dividends / Portfolio editor / Watchlist editor)
- [x] Per-row actions: Edit profile, Archive (disabled if open lots > 0; Unarchive when already archived), Permanent delete
- [x] "Add stock" button at top of the page launches the SPEC-029 resolution dialog in standalone mode (no transaction context); on confirm, a new `stockProfile` row is created and appears in the inventory immediately
- [x] Sort: clicking any column header re-sorts the inventory; choice persisted in localStorage. Default when no choice has been made: ascending alphabetical by ticker
- [x] Counts performance: history-presence counts are computed once on page mount as four maps (`{ticker → count}`) by single-passing each source collection; every row reads from the maps in O(1). Maps are recomputed when the page is re-mounted or when the active/archived filter changes, not memoised across navigations

### Archive lifecycle
- [x] Archive **precondition: zero open lots** — the Archive button is disabled when the stock has any open position across investing accounts; tooltip explains "Sell all positions in this stock before archiving." Reason: archived stocks are hidden from selection lists, but a held position must remain visible on Stock page / Dividend page / Reports / Watchlist views, so archiving a held stock would create a contradiction
- [x] When precondition holds, Archive sets `archived: true` and `archivedAt: <ISO timestamp>` on the `stockProfile`
- [x] Archived stocks are hidden from: Buy form ticker dropdown, Sell form open-position list (always empty for archived stocks anyway), Stock page nav, Dividend page (held set is empty by precondition), Reports default views, Watchlist add-stock list
- [x] Archived stocks are still visible in: historical transaction lists, historical dividend lists, the Stock inventory archived view, Reports when explicitly filtered to "include archived"
- [x] Unarchive clears both flags; stock immediately reappears everywhere

### Permanent delete
- [x] Permanent-delete button is enabled **only** when all four history-presence counts are zero (no transactions, no dividends, no portfolio assignments, no watchlist entries)
- [x] When disabled, hovering the button shows a tooltip listing what's blocking, with the deep links from the row itself as the way to clean those up
- [x] When enabled, clicking the button opens a confirmation dialog asking the user to type the ticker; on confirm, the `stockProfile` row plus any orphan `apiDividendHistory` rows for that ticker are removed
- [x] No cascade deletion of any other data (the precondition is "no other data exists")

### Confirmation review view *(Phase 32 / item 389)*
- [x] Each `stockProfile` carries a `confirmed: bool` (default `false`) and `confirmedAt: ISO timestamp | null`. A profile is "confirmed" when the user has actively endorsed its mapping to a real security; otherwise it is "unconfirmed" and should be reviewed.
- [x] **Auto-confirm on user-driven endorsement.** Confirming a profile in any of these UIs sets `confirmed: true` + `confirmedAt: now`:
  - StockProfileResolutionDialog confirm (SPEC-029) — both Direction A and B.
  - TickerRenameDialog confirm (SPEC-029) — both `'rename'` and `'remap'` modes, since both involve the user actively selecting/confirming a security.
  - EditProfileDialog save (this page + Stock page) — saving any edit counts as endorsement.
  - StockInventory "Add stock" flow — the standalone resolution dialog confirm already triggers the rule above.
- [x] **No automatic un-confirm.** The flag flips to `false` only when the user explicitly clicks the toggle in the inventory.
- [x] **Migration on first load.** Existing `stockProfiles` rows are stamped at app boot: rows with a non-null `name` → `confirmed: true`, `confirmedAt: <migration timestamp>`. Rows without a `name` → `confirmed: false`, `confirmedAt: null`. Migration runs once per device and is idempotent (skips rows that already have a `confirmed` field).
- [x] **New column: Price.** Each row shows the current price from the market-data client (same source as the Stock page header), falling back to manual price (`getManualPrice`), then "—". Price is loaded lazily per row using a `{ticker → priceState}` map; rows render without price first and update when calls resolve. Failed calls render "—" with no retry on the same page load. Price column is sortable (numeric, with "—" sorted last in both directions).
- [x] **New column: Confirmed.** A clickable cell showing a checkbox-like indicator (✓ for confirmed, ○ for unconfirmed) plus the label "Confirmed" / "Needs review". Clicking the cell flips `confirmed` on the profile, writes `confirmedAt: now` (when flipping to true) or `confirmedAt: null` (when flipping to false), and re-renders the row. Tooltip explains the action. Column is sortable.
- [x] **New filter pill: All / Confirmed / Unconfirmed.** Rendered next to the existing Active/Archived toggle. Default selection is **All**. The selection is persisted in localStorage under `rmoney_stock_inventory_confirm_filter`. The pill interacts independently of the Active/Archived toggle — e.g. "Archived + Unconfirmed" is a valid combined view.
- [x] **Deep-link support.** The inventory page accepts an optional initial-filter prop / query parameter so other screens (e.g. CSV import post-commit nudge — SPEC-025) can navigate here with **Unconfirmed** pre-selected. On arrival the pill matches the deep-link value, which then becomes the new persisted preference.
- [x] **Empty-state copy** for each filter: All → "No stocks in inventory yet"; Confirmed → "No confirmed stocks. Visit a stock's profile and confirm the mapping to add it here."; Unconfirmed → "All stocks are confirmed — nothing to review.".

## UI / Screens
- **Stock inventory page:** header with `Add stock` button + active/archived filter toggle. Table with sortable columns. Per-row actions in a kebab menu or as inline buttons.
- **Edit profile dialog (shared with Stock page):** form fields name, exchange (MIC dropdown), currency (ISO list), HQ country, dividend frequency, dividend estimation rule. Ticker is read-only; rename uses the existing Phase 22 rename flow. *(Phase 33: the dialog opens directly into the resolution flow — provider search results pre-loaded for the current ticker — so the primary action is "re-identify the stock". A "Switch to manual fields" button at the bottom collapses the candidate list into the free-form fields above for the cases where no provider returns the right candidate. Fields the resolution flow doesn't own — HQ country, dividend frequency, estimation rule, tax % override, paysDividends — remain editable in a "Settings" section below the resolution UI in the same dialog.)*
- **Permanent-delete dialog:** "Type `TICKER` to confirm" input; cancel button; destructive-styled confirm button.

### Inventory table layout (desktop) *(Phase 33)*
- [x] **Wider table on desktop.** The inventory table expands to the full available width inside the page container (currently capped narrower than the page chrome). Column widths flex to fill the row; numeric columns right-align; text columns left-align.
- [x] **First column (ticker) is sticky.** When horizontal scroll is still needed at small desktop widths, the ticker column stays pinned to the left so the user always knows which row's actions they're seeing.
- [x] **Resolve action button per row.** Every row gains an inline "🔍 Resolve" button (next to Edit / Archive / Delete) that opens the SPEC-029 resolution dialog pre-loaded with the ticker. The same dialog the Stock page's "Re-identify ticker" button uses. Replaces the need to navigate to the Stock page just to fix a mapping.

## Data
- **Reads:** `stockProfiles`, `stockTransactions` (history count), `dividends` (history count), `portfolioAssignments` (history count), `watchlistEntries` (history count), market-data client (current price per row, lazy).
- **Writes:** extends `stockProfiles` with `archived: bool` (default `false`), `archivedAt: ISO timestamp | null`, `confirmed: bool` (default `false`), and `confirmedAt: ISO timestamp | null`. No new collection.
- **Cascade rule on permanent delete:** removes the `stockProfile` row and any `apiDividendHistory` rows for the same ticker. Hot caches keyed by ticker (price / news / latest profile) are dropped from memory but not actively cleared (they'd expire on TTL anyway).
- **Migration:** existing `stockProfiles` rows get `archived: false`, `archivedAt: null` on first load. They also get `confirmed: true` / `confirmedAt: <migration timestamp>` if `name` is non-null, otherwise `confirmed: false` / `confirmedAt: null` (one-shot, idempotent — skip rows where `confirmed` is already defined).

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
