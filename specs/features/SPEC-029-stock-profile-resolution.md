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

## Acceptance Criteria

### Trigger points
- [x] Resolution runs whenever the user submits a **ticker that has no `name` on its `stockProfile`** in either of these contexts:
  - Buy form ticker field (SPEC-019), on blur or "Look up" button press.
  - Watchlist "+ Add stock" search field (SPEC-030), on submit / Enter.
- [x] Resolution can also be re-triggered from the stock page (SPEC-021) via a "Refresh profile" action — for stocks already resolved, this re-opens the candidate dialog so the user can pick again.
- [x] Resolution does **not** fire from CSV imports — CSV-imported stocks without names are simply unresolved; user resolves later from the stock page.

### Direction A — ticker entered, name unknown
- [ ] Step 1: app calls `searchSymbols(ticker)` on the market-data provider chain (SPEC-027). The chain queries every enabled provider's symbol-search endpoint and returns a merged candidate list of `{ ticker, name, exchange, currency, source }` rows. Candidates are unique by `(ticker, exchange, currency)` — listings that share an exchange but differ in trading currency (cross-listings, dual-currency ETFs, GDR/ADR pairs) appear as separate rows so the user can pick the currency they want to track. **Implemented as part of SPEC-027 sub-phase 11c.**
- [x] Step 2: if step 1 returns zero candidates (or SPEC-027 is not configured / no provider supports search), **and** an AI connection is configured & enabled (SPEC-026), the app sends a built-in lookup prompt asking for up to 3 candidates as strict JSON. Each parsed candidate is added to the list labeled "from AI". The AI prompt requires `currency` in the candidate JSON.
- [x] Step 3: regardless of candidates from steps 1–2, the dialog always offers a final **"Enter manually"** row that collects `name`, `exchange`, and **`currency`**.
- [x] If steps 1–2 both return zero (or neither is configured), the dialog opens directly on the manual entry row.

### Direction B — name entered, ticker unknown
- [ ] Step 1: `searchSymbols(name)` on the provider chain (SPEC-027). Same merge-and-disambiguate behaviour as Direction A — currency is part of the candidate key.
- [x] Step 2: AI fallback with prompt variant asking for ticker too: `{ candidates: [{ ticker, name, exchange, currency }] }`.
- [x] Step 3: manual entry — user types ticker + name + exchange + currency.
- [x] In Direction B, the ticker column is shown for each candidate; manual row shows a ticker field.

### Confirmation UI
- [x] Resolution opens a modal dialog titled "Identify {ticker}" (Direction A) or "Find ticker for '{query}'" (Direction B).
- [x] Each candidate row shows: source label (`"from Yahoo"`, `"from Yahoo + Massive"`, `"from AI"`, `"manually"`), name, exchange, **currency**. Currency is always rendered — even when only one candidate exists — because two candidates that differ only in trading currency are otherwise indistinguishable. Unknown fields render as "—".
- [ ] Each candidate row also shows the **current price** fetched via `getLatestPrice`. Price calls run in parallel per candidate (keyed by `ticker + exchange`), are non-blocking — the row renders immediately without price and updates when the call resolves — and show "—" if the call fails or the provider returns nothing. The manual entry row never shows a price.
- [x] Exactly one candidate must be selected to confirm (radio-style). Default: first non-manual, falling back to manual if only option.
- [x] On confirm, the selected candidate is upserted onto `stockProfile` as the canonical triple (`ticker` bare with no suffix, `stockExchange` as a canonical MIC, `currency` as a major-unit ISO code), plus `name`, `resolvedSource`, `resolvedAt`. Dialog closes and originating form continues with pre-filled values.
- [x] Cancel behavior: buy form save is not blocked (no lock on unresolved tickers); watchlist entry is not added; stock-page re-resolve writes nothing.

### Ticker rename
- [ ] The stock page header shows a **"Rename ticker"** button alongside "Refresh profile". It is always visible (not conditional on the profile being resolved).
- [ ] Clicking "Rename ticker" opens a small input dialog: a single field for the new ticker and a "Look up" button (or Enter to submit). The old ticker is shown as context.
- [ ] On submit, the app runs `searchSymbols(newTicker)` and `getLatestPrice(newTicker)` in parallel.
  - If the lookup returns **one candidate**: a confirmation card shows the candidate's name, stock exchange, currency, and current price, plus the warning "All historical transactions, dividends, and watchlist entries will be updated. This cannot be undone." Buttons: [Cancel] [Rename].
  - If the lookup returns **multiple candidates**: the full candidate-picker dialog opens (same UI as Direction A, with price column) so the user selects the right listing. Confirm button is labelled "Rename".
  - If the lookup returns **zero candidates**: a confirmation card shows only the new ticker (no name/exchange/currency/price) and the same irreversibility warning. User can still confirm.
- [ ] On confirm, `renameTicker(oldTicker, newTicker, profile)` is called. It atomically updates all five collections — `stockProfiles`, `stockTransactions`, `dividends`, `watchlistEntries`, `portfolioAssignments` — replacing `oldTicker` with `newTicker` in every record's `ticker` field. It also upserts the resolved profile fields (name, stockExchange, currency, resolvedSource, resolvedAt) onto the new ticker's profile entry and clears the market-data price cache for the old ticker.
- [ ] After rename, the stock page navigates to the new ticker (the old ticker route no longer exists).

### Pre-filling parent forms
- [x] Buy form: resolved `stockExchange` and `currency` prefill empty fields; existing user values are not overwritten.
- [x] Watchlist add flow: resolved ticker is used for `addStockToWatchlist`; stock profile is now populated for downstream use.

### AI prompt
- [x] Built-in, non-user-editable prompts in source code (`PROMPT_A`, `PROMPT_B` in `StockProfileResolutionDialog.jsx`).
- [x] Strict JSON validation; failed parse treated as zero candidates.
- [x] AI calls do **not** appear in `aiChats` history — one-shot lookups.
- [x] Same connection/model as SPEC-026; AI disabled → step 2 skipped silently.

### Persistence
- [x] `stockProfiles` extended with `name`, `stockExchange`, `currency`, `resolvedSource`, `resolvedAt`.
- [x] Existing profiles without these fields are treated as unresolved — stock page shows ticker only with "Resolve profile" prompt.

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

Rename ticker — step 2a (single candidate found, confirmation card):

```
+------------------------------------------+
| Rename SGRO.L → SGRO?                   |
|                                          |
|  Company:   Segro PLC                    |
|  Exchange:  XLON                         |
|  Currency:  GBP                          |
|  Price:     £8.47                        |
|                                          |
|  All historical transactions, dividends, |
|  and watchlist entries will be updated.  |
|  This cannot be undone.                  |
|                                          |
|          [Cancel]   [Rename]             |
+------------------------------------------+
```

Rename ticker — step 2b (multiple candidates, picker dialog):
Same layout as Direction A resolution dialog above, with "Rename" as the confirm button label.

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
  resolvedAt: ISO timestamp | null
}
```

No new collections. The flow is stateless beyond the upsert into `stockProfiles`.

`renameTicker(oldTicker, newTicker, profile)` updates all five ticker-keyed collections in one synchronous pass through localStorage:

```
stockProfiles       — upsert with newTicker (carrying resolved fields), delete oldTicker entry
stockTransactions   — every record where ticker === oldTicker → ticker = newTicker
dividends           — every record where ticker === oldTicker → ticker = newTicker
watchlistEntries    — every record where ticker === oldTicker → ticker = newTicker
portfolioAssignments— every record where ticker === oldTicker → ticker = newTicker
```

Also calls `clearPriceCache()` for the old ticker so stale entries don't persist.

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
