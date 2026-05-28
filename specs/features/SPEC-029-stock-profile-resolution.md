---
id: SPEC-029
name: Stock Profile Resolution
status: in-progress
created: 2026-04-29
---

# Stock Profile Resolution

## Goal
Whenever the app first encounters a ticker the user has not yet identified — typed into a buy form (SPEC-019) or added to a watchlist (SPEC-030) — resolve and persist its **company name**, **stock exchange**, and **trade currency** through a three-step waterfall: market-data providers → AI fallback → manual entry. The user always confirms the chosen result. The flow works in **both directions** — ticker→name when the user typed a ticker, and name→ticker when the user typed a company name. The resolved fields land on the existing `stockProfiles` record so every other screen (stock page header, transaction list, reports) can show the human-readable name without re-resolving.

When a company changes its ticker symbol, the user can rename the ticker from the stock page. The rename cascades to all historical records and the profile is refreshed for the new symbol.

## User Stories
- As a user, I can type a ticker into the buy form for a stock the app has never seen, and within a moment I'm shown one or more candidate company names (with exchange + currency) to confirm. I do not have to look the name up myself.
- As a user, I can type a company name (e.g. "Apple") into a search field on the watchlist screen even when I don't remember the ticker, and the app proposes the ticker (with exchange + currency) for me to confirm.
- As a user, when the configured market-data providers can't identify a stock, the app automatically asks my configured AI to look it up — and shows me what the AI returned for confirmation, never silently accepting it.
- As a user, when neither the providers nor the AI can identify the stock (or I'm offline / nothing is configured), I can type the name myself and the form still saves.
- As a user, I can clearly see which step a candidate came from ("from IBKR", "from AI", "manual") so I know how much to trust it.
- As a user, I can re-run resolution later from the stock page if I picked the wrong candidate or want to refresh the profile.
- As a user, I can see the current market price of each candidate in the resolution dialog so I can tell apart listings that share the same name but trade on different exchanges or in different currencies.
- As a user, when a company changes its ticker symbol, I can rename the ticker on the stock page and have all historical transactions, dividends, and watchlist entries updated automatically. Before I commit the rename, the app shows me the new ticker's name, exchange, currency, and current price so I can confirm it is the right company.
- As a user, when I discover a ticker was mapped to the wrong security (e.g. a CSV import auto-mapped it incorrectly), I can remap the slot to a different security: the app's fetched dividend history, profile cache, and price cache for the wrong identity are cleared, but my own records (transactions, manual dividends, watchlist entries, portfolio assignments) are preserved because they're facts about what I did, independent of which security the app thinks the ticker points to.

## Acceptance Criteria

### Trigger points
- [x] Resolution runs whenever the user submits a **ticker that has no `name` on its `stockProfile`** in either of these contexts:
  - Buy form ticker field (SPEC-019), on blur or "Look up" button press.
  - Watchlist "+ Add stock" search field (SPEC-030), on submit / Enter.
- [x] Resolution can also be re-triggered from the stock page (SPEC-021) via a "Refresh profile" action — for stocks already resolved, this re-opens the candidate dialog so the user can pick again.
- [x] Resolution does **not** fire from CSV imports — CSV-imported stocks without names are simply unresolved; user resolves later from the stock page.

### Direction A — ticker entered, name unknown
- [x] Step 1: app calls `searchSymbols(ticker)` on the market-data provider chain (SPEC-027). The chain queries every enabled provider's symbol-search endpoint and returns a merged candidate list of `{ ticker, name, exchange, currency, source }` rows. Candidates are unique by `(ticker, exchange, currency)` — listings that share an exchange but differ in trading currency (cross-listings, dual-currency ETFs, GDR/ADR pairs) appear as separate rows so the user can pick the currency they want to track. **Implemented as part of SPEC-027 sub-phase 11c.**
- [x] Step 2: if step 1 returns zero candidates (or SPEC-027 is not configured / no provider supports search), **and** an AI connection is configured & enabled (SPEC-026), the app sends a built-in lookup prompt asking for up to 3 candidates as strict JSON. Each parsed candidate is added to the list labeled "from AI". The AI prompt requires `currency` in the candidate JSON.
- [x] Step 3: regardless of candidates from steps 1–2, the dialog always offers a final **"Enter manually"** row that collects `name`, `exchange`, and **`currency`**.
- [x] If steps 1–2 both return zero (or neither is configured), the dialog opens directly on the manual entry row.

### Direction B — name entered, ticker unknown
- [x] Step 1: `searchSymbols(name)` on the provider chain (SPEC-027). Same merge-and-disambiguate behaviour as Direction A — currency is part of the candidate key.
- [x] Step 2: AI fallback with prompt variant asking for ticker too: `{ candidates: [{ ticker, name, exchange, currency }] }`.
- [x] Step 3: manual entry — user types ticker + name + exchange + currency.
- [x] In Direction B, the ticker column is shown for each candidate; manual row shows a ticker field.

### Confirmation UI
- [x] Resolution opens a modal dialog titled "Identify {ticker}" (Direction A) or "Find ticker for '{query}'" (Direction B).
- [x] Each candidate row shows: source label (`"from Yahoo"`, `"from Yahoo + Massive"`, `"from AI"`, `"manually"`), name, exchange, **currency**. Currency is always rendered — even when only one candidate exists — because two candidates that differ only in trading currency are otherwise indistinguishable. Unknown fields render as "—".
- [x] Each candidate row also shows the **current price** fetched via `getLatestPrice`. Price calls run in parallel per candidate (keyed by `ticker + exchange`), are non-blocking — the row renders immediately without price and updates when the call resolves — and show "—" if the call fails or the provider returns nothing. The manual entry row never shows a price.
- [x] Exactly one candidate must be selected to confirm (radio-style). Default: first non-manual, falling back to manual if only option.
- [x] On confirm, the selected candidate is upserted onto `stockProfile` as the canonical triple (`ticker` bare with no suffix, `stockExchange` as a canonical MIC, `currency` as a major-unit ISO code), plus `name`, `resolvedSource`, `resolvedAt`. Dialog closes and originating form continues with pre-filled values.
- [x] Cancel behavior: buy form save is not blocked (no lock on unresolved tickers); watchlist entry is not added; stock-page re-resolve writes nothing.

### Ticker rename
- [x] The stock page header shows a **"Rename ticker"** button alongside "Refresh profile". It is always visible (not conditional on the profile being resolved). *(Phase 33: button label is renamed to **"Re-identify ticker"** to match the dialog's mode-choice between rename and remap. Reason: the primary intent for most users hitting this button is to fix a wrong CSV mapping (remap), not to follow a corporate symbol change (rename). The new label reads better alongside the existing "Refresh profile" / "Resolve profile" verbs.)*
- [x] Clicking "Rename ticker" opens a small input dialog: a single field for the new ticker and a "Look up" button (or Enter to submit). The old ticker is shown as context.
- [x] On submit, the app runs `searchSymbols(newTicker)` and `getLatestPrice(newTicker)` in parallel.
  - If the lookup returns **one candidate**: a confirmation card shows the candidate's name, stock exchange, currency, and current price, plus the warning "All historical transactions, dividends, and watchlist entries will be updated. This cannot be undone." Buttons: [Cancel] [Rename].
  - If the lookup returns **multiple candidates**: the full candidate-picker dialog opens (same UI as Direction A, with price column) so the user selects the right listing. Confirm button is labelled "Rename".
  - If the lookup returns **zero candidates**: a confirmation card shows only the new ticker (no name/exchange/currency/price) and the same irreversibility warning. User can still confirm.
- [x] On confirm, `renameTicker(oldTicker, newTicker, profile)` is called. It atomically updates all five collections — `stockProfiles`, `stockTransactions`, `dividends`, `watchlistEntries`, `portfolioAssignments` — replacing `oldTicker` with `newTicker` in every record's `ticker` field. It also upserts the resolved profile fields (name, stockExchange, currency, resolvedSource, resolvedAt) onto the new ticker's profile entry and clears the market-data price cache for the old ticker.
- [x] After rename, the stock page navigates to the new ticker (the old ticker route no longer exists).
- [x] **Candidate picker mobile layout** *(Phase 21a verification, 2026-05-28)*. On viewports `≤ 480px`, each candidate row in the picker wraps to two lines: line 1 shows `[radio] [company name] [exchange] [currency] [price]`; line 2 shows the source label (`from Yahoo` / `from Twelve Data` / etc.) indented to align under the name. The source uses `flex-basis: 100%` to force its own line regardless of label length — without this, short labels like `from Yahoo` would squeeze back onto line 1 and crush the name column to 3 characters wide.

### Rename vs. remap — mode choice *(Phase 32 / item 387)*
- [x] The rename confirmation step (single-candidate card, picker dialog, and zero-candidate card) requires the user to pick one of two **modes** before the confirm button activates. The choice is rendered as a pair of radio buttons above the [Cancel] [Rename] / [Remap] actions:
  - **(*) Same company, symbol changed** — keep all history. This is the existing cascade: every record's `ticker` is rewritten from `oldTicker` to `newTicker`, the resolved profile fields are merged onto the new ticker's entry, and the prior `taxPercentOverride` / `dividendFrequency` / `manualPrice` / `hqCountryOverride` / `amountEstimationRule` carry over. Confirm button label: **"Rename"**.
  - **( ) Different security** — reset the wrong identity but keep the user's own records. The old `stockProfile` row is removed and a fresh one is written under `newTicker` with only the resolved profile fields (no carry-over of `taxPercentOverride` / `dividendFrequency` / `manualPrice` / `hqCountryOverride` / `amountEstimationRule`). `apiDividendHistory` rows and the `apiDividendHistory_meta` entry for `oldTicker` (and `newTicker` if the symbol changed) are deleted. The hot caches (price / news / intraday / profile) are dropped via `clearCacheForTicker(oldTicker)`. **User records — `stockTransactions`, `dividends`, `watchlistEntries`, `portfolioAssignments` — are preserved**: when `oldTicker !== newTicker` they are renamed (ticker rewritten old → new), and when `oldTicker === newTicker` they stay in place. Rationale: the user's records are facts about what they did, separate from whichever company the app mistakenly thought the ticker referenced. Confirm button label: **"Remap"**.
- [x] When **Different security** is selected, the dialog warning text reads: *"Resets the wrong identity: replaces the stock profile and clears the app's fetched dividend history and price cache for {oldTicker}. Your own records — transactions, manual dividends, watchlist, and portfolio assignments — are kept (they're your record of what you did)."* (red-styled, same prominence as the existing rename warning).
- [x] Neither radio is pre-selected; the confirm button is disabled until the user picks one. This forces a deliberate choice rather than letting the user click through on autopilot.
- [x] The dialog title and confirmation card layout stay the same in both modes; only the warning text, confirm button label, and the underlying call path differ.
- [x] **Same-ticker remap is supported.** When the user enters the same ticker symbol back into the rename dialog and picks **Different security**, the remap still runs (profile replaced, all old-ticker rows purged). This covers the common CSV case where the imported ticker symbol is correct but the auto-mapped security is wrong — the user wants to keep the symbol and clear the wrong history. A same-ticker **Same company** rename remains a no-op (no work to do).

### Ticker rename — API dividend history cascade *(latent bug fix — Phase 32 / item 388)*
- [x] In **Same company, symbol changed** mode, `renameTicker` also rewrites the `ticker` field on every row in `apiDividendHistory` and migrates the `apiDividendHistory_meta` entry from `oldTicker` to `newTicker`. Prior to this fix, API-fetched dividend rows were orphaned under the old ticker.
- [x] In **Different security** mode, both `apiDividendHistory` rows and the `apiDividendHistory_meta` entry for `oldTicker` are deleted (covered by the deletion rule above).

### Defensive dividend-currency filter *(Phase 32 / item 391)*
- [x] **Background.** As of 2026-05, the Massive (Polygon), TwelveData, and AlphaVantage adapters all ignore the `exchange` argument on `getDividends`. They query their respective APIs with the bare ticker, which on Polygon/etc. defaults to the US listing. For a ticker like `GOLD` on `XMIL` (Amundi Physical Gold ETC), the chain therefore returns Barrick Gold (NYSE) dividend records — wrong identity. After a successful **Different security** remap, the next Refresh dividends button click would re-pollute the cache with the same wrong-identity records.
- [x] **Filter.** `refreshApiDividendHistory(ticker, exchange)` looks up `getStockProfile(ticker).currency` after the chain returns. If the profile has a known currency, any returned record whose `currency` doesn't match it is dropped before upsert. Records with no currency are kept (we can't tell). When the profile has no currency, all records are kept. The filter is logged via `console.warn` with the drop count for debugging.
- [x] **Why this is a heuristic, not a perfect fix.** ADRs and dual-currency cross-listings can legitimately pay in a currency different from the trading currency. The filter would incorrectly drop those. The cleaner long-term fix is per-adapter exchange-aware dividend queries (each provider has its own quirk). For now the heuristic is an acceptable trade-off — it covers the GOLD-style misidentification, which is by far the more common case in CSV-imported portfolios.

### Pre-filling parent forms
- [x] Buy form: resolved `stockExchange` and `currency` prefill empty fields; existing user values are not overwritten.
- [x] Watchlist add flow: resolved ticker is used for `addStockToWatchlist`; stock profile is now populated for downstream use.

### Re-look-up card on Buy form *(Phase 26a)*
- [x] When the entered ticker matches an existing `stockProfile` with a resolved `name`, the Buy form shows a compact summary card (`Name · Exchange · Currency`) with a "Re-look up" button instead of automatically opening the resolution dialog.
- [x] Clicking "Re-look up" reopens the candidate dialog pre-loaded with the provider search results. Confirming a different candidate upserts the profile in place (same path as "Refresh profile" on the Stock page).

### Manual stocks — custom assets with no ticker the API knows about *(Phase 32 / item 370)*
- [x] **Manual mode flag on `stockProfiles`:** add `isManual: bool` (default `false`) and `manualPriceSource: 'user' | null`. When `isManual === true`, the resolution flow does not run for this profile (no provider search, no AI fallback, no price/dividend refresh attempts), and the SPEC-027 provider chain is bypassed for every read keyed by the profile's ticker. The Stock page hides Refresh profile and Refresh dividends buttons for manual stocks.
- [x] **"Add manual stock" entry point** on Stock inventory (SPEC-033 Phase 30) — opens `AddManualStockDialog` collecting: ticker (free-text, must not collide with an existing profile), name, exchange (free-text — `MANUAL` is offered as a default), currency, optional HQ country. The created profile is `{ ticker, name, stockExchange, currency, hqCountry, isManual: true, manualPriceSource: 'user', resolvedSource: 'manual', resolvedAt: now, confirmed: true }` (helper `createManualStockProfile` in `stockProfiles.js`). Use cases: pre-IPO RSUs, private equity holdings, custom-tracked baskets, stocks delisted from the user's API providers but still held.
- [x] **Manual price entry** for manual stocks: the Stock page header shows a `[Set price]` button (instead of the API-driven live price line) when `isManual === true`. Clicking it opens a form to enter `(date, price, currency)`; entries write to a new `manualPrices` collection (`rmoney_manual_prices`) keyed by `(ticker, date)`. A `[Price history]` toggle expands the full list of dated entries with per-row Edit / Delete actions. The latest manual price is shown wherever live prices are normally read.
- [x] **Provider-chain short-circuit:** every read site that calls `marketDataClient.getLatestPrice` / `getHistoricalSeries` / `getDividends` / `getIntradaySeries` / `getNews` / `getCorporateActions` first checks `isManualStock(ticker)`. When manual, the calls return data drawn exclusively from `manualPrices` and the user `dividends` collection, never invoking any provider adapter. A convenience helper `getQuoteForProfile(profile)` is exported for callers that already have a profile in hand; the standalone `getLatestPrice` etc. functions self-gate so even consumers that haven't been refactored are protected.
- [x] **Buy / sell / dividend forms** still work for manual stocks (they only need the profile + a user-entered price). The negative-balance and lot-tracking machinery is independent of price source. All three forms display a small "Manual stock" badge below the ticker field so the user is reminded that no API data backs this position.
- [x] **Storage:** `manualPrices` registered in Settings → Storage tab as a per-stock-breakdown card with bulk-clear. Included in both Sharable and Full backups (user-entered data, not API-derived).

### AI prompt
- [x] Built-in, non-user-editable prompts in source code (`PROMPT_A`, `PROMPT_B` in `StockProfileResolutionDialog.jsx`).
- [x] Strict JSON validation; failed parse treated as zero candidates.
- [x] AI calls do **not** appear in `aiChats` history — one-shot lookups.
- [x] Same connection/model as SPEC-026; AI disabled → step 2 skipped silently.

### Persistence
- [x] `stockProfiles` extended with `name`, `stockExchange`, `currency`, `resolvedSource`, `resolvedAt`.
- [x] Existing profiles without these fields are treated as unresolved — stock page shows ticker only with "Resolve profile" prompt.

### Last-known price persistence on the profile *(Phase 33)*
- [x] **First-time resolve writes a price snapshot.** When the user confirms a resolution candidate, the price already fetched for that candidate (see "current price" in the dialog) is written onto the profile as `lastKnownPrice: { amount, currency, fetchedAt }`. The user always sees a non-blank price for a freshly-resolved stock even when the next page render is offline.
- [x] **Every successful provider price fetch updates the profile.** `marketDataClient.getLatestPrice(ticker, exchange)` updates `lastKnownPrice` on success. Failure to fetch never clears the field — the stored snapshot remains visible until the next successful refresh. Manual stocks (`isManual: true`) are exempt; their price comes from `manualPrices` directly.
- [x] **Re-resolve (Refresh profile) rewrites identity fields.** When the user re-confirms a candidate via Refresh profile, the profile's `name`, `stockExchange`, and `currency` are rewritten to the picked candidate's values and a fresh `lastKnownPrice` snapshot is taken. This makes Refresh profile authoritative for the identity quartet (name, exchange, currency, latest price). Other fields (HQ country, dividend frequency, tax %, manual price source) are preserved.
- [x] **Offline rendering.** Every screen that calls `getLatestPrice` and gets back nothing (provider chain unavailable, all failed) falls back to `profile.lastKnownPrice` before showing "—". A small clock icon (⏱) next to the price indicates the value is the last-known snapshot with a tooltip showing `fetchedAt`.

## UI / Screens

Resolution dialog — Direction A (ticker entered), with price column:

```
+------------------------------------------------------------------+
| Identify AAPL                                                    |
|                                                                  |
|  ( ) from IBKR                                                   |
|        Apple Inc.       NASDAQ        USD        $213.42         |
|                                                                  |
|  ( ) from Twelve Data                                            |
|        Apple Inc.       NASDAQ        USD        $213.42         |
|                                                                  |
|  ( ) from AI                                                     |
|        Apple Inc.       NASDAQ        USD        —               |
|                                                                  |
|  (*) Enter manually                                              |
|        Name:     [                          ]                    |
|        Exchange: [        ]   Currency: [USD v]                  |
|                                                                  |
|                                  [Cancel]   [Confirm]            |
+------------------------------------------------------------------+
```

Resolution dialog — Direction B (name entered), with price column:

```
+------------------------------------------------------------------+
| Find ticker for 'apple'                                          |
|                                                                  |
|  (*) from IBKR                                                   |
|        AAPL    Apple Inc.        NASDAQ      USD     $213.42     |
|                                                                  |
|  ( ) from AI                                                     |
|        AAPL    Apple Inc.        NASDAQ      USD     —           |
|                                                                  |
|  ( ) Enter manually                                              |
|        Ticker:   [        ]                                      |
|        Name:     [                          ]                    |
|        Exchange: [        ]   Currency: [USD v]                  |
|                                                                  |
|                                  [Cancel]   [Confirm]            |
+------------------------------------------------------------------+
```

Rename ticker — step 1 (input):

```
+------------------------------------------+
| Rename ticker                            |
|                                          |
|  Current:  SGRO.L                        |
|  New ticker:  [SGRO    ]  [Look up]      |
|                                          |
|                         [Cancel]         |
+------------------------------------------+
```

Rename ticker — step 2a (single candidate found, confirmation card with mode choice):

```
+------------------------------------------+
| Rename SGRO.L → SGRO?                   |
|                                          |
|  Company:   Segro PLC                    |
|  Exchange:  XLON                         |
|  Currency:  GBP                          |
|  Price:     £8.47                        |
|                                          |
|  ( ) Same company, symbol changed        |
|      Keep all history. Records are       |
|      moved to the new ticker.            |
|                                          |
|  ( ) Different security                  |
|      Reset the wrong identity. Profile   |
|      replaced, fetched dividend history  |
|      and price cache cleared. Your own   |
|      transactions, dividends, watchlist, |
|      and portfolio links are kept.       |
|                                          |
|          [Cancel]   [Rename / Remap]     |
+------------------------------------------+
```

Rename ticker — step 2b (multiple candidates, picker dialog):
Same layout as Direction A resolution dialog above, with the rename/remap radio choice rendered between the candidate list and the confirm button. Confirm label switches between **Rename** and **Remap** based on the selected mode.

Stock page header (after resolution):

```
<- AAPL  Apple Inc.   NASDAQ . USD     [Refresh profile]  [Rename ticker]
```

Stock page header (unresolved profile, e.g. from CSV import):

```
<- AAPL                                [Resolve profile]  [Rename ticker]
```

## Data

Extended `stockProfiles` record:

```
{
  ticker: string,                                          // existing
  taxPercentOverride: number | null,                       // existing (SPEC-020)
  name: string | null,                                     // new
  stockExchange: string | null,                            // new
  currency: string | null,                                 // new
  resolvedSource: string | null,    // 'ibkr' | 'massive' | 'twelveData' | 'alphaVantage' | 'ai' | 'manual'
  resolvedAt: ISO timestamp | null,

  // Manual-stocks fields (Phase 32e) — only set on user-tracked assets that have no API data
  isManual: bool,                                          // default false
  manualPriceSource: 'user' | null,

  // Last-known price snapshot (Phase 33) — persisted so offline / failed-fetch screens still show a price.
  // Updated on every successful provider price fetch; not cleared on failure.
  lastKnownPrice: { amount: number, currency: string, fetchedAt: ISO timestamp } | null,

  // HQ country (Phase 33) — two fields to distinguish auto-fetched from user-overridden.
  hqCountry: string | null,         // written by Refresh profile / Re-identify ticker (provider first-non-null)
  hqCountryOverride: string | null, // written by user via Edit profile dialog; wins over hqCountry in display
  // Effective value for display: hqCountryOverride ?? hqCountry ?? 'Global'
}
```

`manualPrices` collection (Phase 32e) — new collection for user-entered prices on
`isManual` stocks. Keyed implicitly by `(ticker, date)`; later writes overwrite
earlier ones for the same day. Included in both Sharable and Full backups
(user-entered data, distinct from API-cached `apiDividendHistory`).

```
{
  ticker: string,        // uppercase
  date: ISO yyyy-mm-dd,  // as-of date the user is tagging the price with
  price: number,
  currency: string,      // uppercase ISO
  setAt: ISO timestamp   // when the user saved the entry
}
```

`renameTicker(oldTicker, newTicker, resolvedFields, mode)` takes a `mode: 'rename' | 'remap'` argument and updates all ticker-keyed collections in one synchronous pass through localStorage. Both modes call `clearCacheForTicker(oldTicker)` so stale price / news / intraday / profile entries don't persist.

**Mode `'rename'`** (Same company, symbol changed — default for legacy callers):
```
stockProfiles          — upsert with newTicker (carrying resolved fields + prior overrides), delete oldTicker entry
stockTransactions      — every record where ticker === oldTicker → ticker = newTicker
dividends              — every record where ticker === oldTicker → ticker = newTicker
watchlistEntries       — every record where ticker === oldTicker → ticker = newTicker
portfolioAssignments   — every record where ticker === oldTicker → ticker = newTicker
apiDividendHistory     — every record where ticker === oldTicker → ticker = newTicker         (NEW — fixes orphan bug)
apiDividendHistory_meta— migrate the oldTicker entry to newTicker                              (NEW — fixes orphan bug)
```

**Mode `'remap'`** (Different security — keep user records, drop API caches):
```
stockProfiles          — delete oldTicker row entirely, create a fresh newTicker row from resolvedFields only (no carry-over)
stockTransactions      — rename ticker oldTicker → newTicker (no-op when symbols are equal); rows are NOT deleted
dividends              — rename ticker oldTicker → newTicker (no-op when symbols are equal); rows are NOT deleted
watchlistEntries       — rename ticker oldTicker → newTicker (no-op when symbols are equal); rows are NOT deleted
portfolioAssignments   — rename ticker oldTicker → newTicker (no-op when symbols are equal); rows are NOT deleted
apiDividendHistory     — drop every record where ticker === oldTicker (and === newTicker, when symbol changes)
apiDividendHistory_meta— delete the oldTicker entry (and the newTicker entry, when symbol changes)
```

Built-in AI prompts (in source, not user-editable):

```
Direction A (ticker -> name):
  "You are a financial-data assistant. The user is identifying the stock with ticker
   <TICKER>. Reply with strict JSON: { \"candidates\": [{ \"name\": ..., \"exchange\":
   ..., \"currency\": ... }, ...] }. Up to 3 candidates. No prose, no markdown, no
   code fences. If you do not know, return { \"candidates\": [] }."

Direction B (name -> ticker):
  "You are a financial-data assistant. The user is searching for the stock matching
   the name '<QUERY>'. Reply with strict JSON: { \"candidates\": [{ \"ticker\": ...,
   \"name\": ..., \"exchange\": ..., \"currency\": ... }, ...] }. Up to 3 candidates.
   No prose, no markdown, no code fences. If you do not know, return { \"candidates\": [] }."
```

## Out of Scope
- **Bulk resolution** of many tickers at once (e.g. resolving every CSV-imported stock in one click). Future enhancement; v1 is one-at-a-time on demand.
- **Sector / industry / HQ country** lookup — kept on SPEC-027's `getStockProfile` for other consumers, but not displayed or persisted in this flow.
- **Logo / icon** retrieval. May come later as a presentational extension.
- **Fuzzy matching against already-resolved local profiles** when the user types a name (e.g. "I already have Apple Inc., did you mean AAPL?"). v1 always treats a name lookup as an external query.
- **Conflict resolution** when two providers return different names/exchanges for the same ticker. v1 just lists both as separate candidates; the user picks one.
- **Re-resolution scheduling** (e.g. re-run for all stocks every 6 months). User-driven only.

## Open Questions
None.
