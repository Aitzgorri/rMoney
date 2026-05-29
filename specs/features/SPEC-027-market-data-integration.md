---
id: SPEC-027
name: Market Data Integration
status: in-progress
created: 2026-04-23
---

# Market Data Integration

## Goal
Build the market-data provider layer that every Investments spec (SPEC-017, SPEC-019, SPEC-020, SPEC-021, SPEC-023, SPEC-024) calls into. One unified request interface, **seven providers** wired up as a failure-only fallback chain — **IBKR Web API → Yahoo Finance → Massive → Twelve Data → Finnhub → Alpha Vantage → Stooq** — with per-stock manual price override that wins over all API sources. Each provider is enabled and credentialed independently in More → Settings; the chain naturally skips providers that don't cover a given request (different providers have different regional coverage and asset-class support, so a missing-data response from one provider falls through to the next). The chain is intentionally deep: most providers offer free tiers with rate caps and partial coverage, so depth gives the user fall-throughs when one provider's free quota is hit or doesn't cover a particular exchange.

## User Stories
- As a user, I can configure my IBKR Web API OAuth credentials in Settings so the app can fetch data from my broker. *(Deferred — see note in Provider configuration ACs.)*
- As a user, I can add an API key for each keyed provider (Massive, Twelve Data, Finnhub, Alpha Vantage), and the app uses them as fallbacks in chain order.
- As a user, I benefit from key-less providers (Yahoo Finance, Stooq) being available without configuration so the chain still works on a fresh install.
- As a user, I can disable a provider temporarily (e.g. because I've hit my rate limit) without deleting its credentials.
- As a user, when no API returns a price for a stock, I can type in a manual price override that takes precedence until I clear it.
- As a user, I can refresh rates / prices / news manually from relevant screens without waiting for the cache.
- As a user, when I add a stock by typing only a ticker like "SGRO" or a company name like "Segro", the app shows me the matching candidates with **company name + exchange + currency** and I pick the right one. The triple `(ticker, exchange, currency)` is what's stored on the stock profile, so every later request unambiguously refers to the same listing — including cases where the same exchange trades the same instrument in more than one currency (dual-listings, ETFs quoted in EUR and USD on the same venue, GDRs).

## Acceptance Criteria

### Provider configuration
- [ ] More → Settings → Market data providers: one section per provider (IBKR, Yahoo Finance, Massive, Twelve Data, Finnhub, Alpha Vantage, Stooq) with: enabled toggle, a credentials form where applicable (OAuth flow for IBKR; API key for Massive, Twelve Data, Finnhub, Alpha Vantage; Yahoo Finance and Stooq are key-less so show only the enabled toggle), and a "Test connection" button.
- [ ] The chain order is fixed: IBKR → Yahoo Finance → Massive → Twelve Data → Finnhub → Alpha Vantage → Stooq. Not user-reorderable in Phase 2.
- [ ] IBKR uses the **IBKR Web API** (OAuth, cloud-based) — no local gateway binary. Authentication is an OAuth flow initiated from Settings; the app stores the resulting tokens. **⚠ Deferred:** as of 2026, IBKR's cloud OAuth 2.0 is available for institutional/advisor clients only — retail accounts must use the Client Portal Gateway (a local binary, which we've ruled out). IBKR is considering retail OAuth 2.0 with no published ETA. The IBKR slot stays in the chain as a pass-through stub; implement when retail access ships. Their flow uses `private_key_jwt` (RFC 7521/7523), not standard auth-code + client_secret.
- [ ] **Yahoo Finance** is the public unofficial endpoint at `query1.finance.yahoo.com`. No key, no published quota, but rate-limited per IP. CORS-blocked from a browser → see HTTP transport section below. Most consequential provider for European coverage on a free chain. **`getDividends` is intentionally not implemented for Yahoo** — the chart `events=div` payload returns ex-date + amount only, with no payment date and no declared/future events; returning a partial record would block richer providers in the failure-only chain. The Yahoo adapter throws `'not supported'` for `getDividends` so the chain falls through to Twelve Data / Massive.
- [ ] **Massive** (api.massive.com) — the rebranded Polygon.io. Same REST API surface and account model. Auth via `?apiKey=` query parameter. Endpoints follow the `/v3/reference/...`, `/v2/snapshot/...`, `/v2/aggs/...` shape. Free Stocks Starter tier is US-stocks-only with 5 calls/minute and end-of-day data; international stocks and real-time data require a paid Stocks plan. Sets CORS headers — direct browser fetch works.
- [ ] **Twelve Data** (api.twelvedata.com) — already implemented. Free Basic tier silently gates many international tickers; LSE main-market symbols typically require the paid Grow tier. Sets CORS headers.
- [ ] **Finnhub** (finnhub.io) — auth via `?token=` query param. Free tier: 60 calls/minute. Has a `/news` endpoint useful when other providers don't (Twelve Data has none on free; Alpha Vantage has one but is rate-tight). International coverage is partial on free — some EU symbols are premium-gated. Sets CORS headers (`*`).
- [ ] **Alpha Vantage** — already implemented. Free tier is effectively US-only. Kept for US fallback only.
- [ ] **Stooq** (stooq.com) — key-less CSV endpoint at `/q/l/?s={ticker}.{suffix}&f=sd2t2ohlcv&h&e=csv`. No quota, no auth. EOD prices only — does not implement dividends, profile, news, corporate actions. Used as the final price floor. CORS-blocked → uses the same transport plumbing as Yahoo. Symbol format uses lowercase ticker + a country/exchange suffix (`.uk`, `.de`, `.us`, `.fr`, `.nl`, …) — the adapter maps the canonical MIC to a Stooq suffix.
- [ ] Disabled providers are skipped entirely (the chain acts as if they're not there). Providers without an API key (where one is required) are auto-disabled — the chain skips them with reason `"no api key configured"` rather than attempting the call.
- [ ] All API key storage, display, logging, and export rules are defined in **SPEC-031** (Security and secrets handling). Adding a new provider to this chain implies updating SPEC-031's connect-src host list and redaction map; do not implement a new provider without that paired update.

### Unified request interface
- [ ] A single client module exposes typed calls used by all Investments specs:
  - `getLatestPrice(ticker, exchange?)` → `{ price, currency, asOf }` — `price`/`currency` are always major-unit (see Price-unit normalisation)
  - `getHistoricalSeries(ticker, exchange?, period, resolution)` → array of `{ date, close }` — `close` is always major-unit
  - `getDividends(ticker, fromDate, toDate)` → array of dividend declarations (past + future if available); amounts always major-unit
  - `getCorporateActions(ticker, fromDate)` → array including splits (`{ date, type: 'split', ratio }`), used by SPEC-019 split detection
  - `getNews(ticker, limit = 5)` → array of `{ headline, source, url, publishedAt }`
  - `getForex(fromCurrency, toCurrency)` → current rate + `asOf`
  - `getHistoricalForex(fromCurrency, toCurrency, date)` → snapshot rate at a given date (used by SPEC-017 snapshotting)
  - `getIndexSeries(indexTicker, period, resolution)` → same shape as historical price (used by SPEC-023 benchmarks)
  - `getStockProfile(ticker)` → `{ name, exchanges[], hqCountry, currency }` — used by SPEC-021 header, SPEC-020 country override, SPEC-024 regional breakdown; `currency` is always major-unit and `exchanges` are MIC codes
  - `searchSymbols(query)` → array of `{ ticker, name, exchange, currency, source }` — used by SPEC-029 first-time stock resolution and by the watchlist quick-add. `query` accepts a bare ticker, a ticker with a suffix (`SGRO.L`, `BMW.DE`), or a company name. `exchange` is a canonical MIC and `currency` is the major-unit ISO code. Each candidate is unique by `(ticker, exchange, currency)`; the chain merges results from every enabled provider, recording every provider that returned the same triple in `source` so the dialog can show "from Yahoo + Massive". A query that maps to one and only one triple still returns it as a single-row candidate list — the user always confirms.

### Fallback behaviour
- [x] For any call, the client tries providers in chain order. A provider is skipped if disabled. On failure (timeout, HTTP 4xx/5xx, missing data, unsupported endpoint for that provider, or out-of-coverage region/asset class), the client falls through to the next provider.
- [x] Fallback is failure-only. No "per-data-type routing" logic in Phase 2 (kept deliberately simple per the Q&A decision).
- [x] If every enabled provider fails, the call throws an "unavailable" error that the caller surfaces (chart shows empty state, price shows "—", etc.).
- [x] Each call is logged **immediately** when it completes (success or failure), not batched. This ensures the debug log always shows calls in true chronological order — failures for skipped providers appear before the success entry, not after it.

### Manual price override (wins over all providers)
- [ ] Each stock has an optional `manualPrice` with a currency and a timestamp. When set, `getLatestPrice` for that stock returns the manual value immediately without calling any provider.
- [ ] The stock page (SPEC-021) has a "Set manual price" control that stores this override. A "Clear manual price" action returns the stock to the API chain.
- [ ] Manual override applies only to `getLatestPrice`. Historical series, dividends, news, etc. still come from the API chain.

### Price-unit normalisation (minor-unit currencies)
A handful of exchanges quote in the **minor unit** of their currency rather than the major unit. The most common case is the London Stock Exchange, which quotes most UK equities in **pence (GBp / GBX)** — 1 GBp = 1/100 GBP. Other examples: South African ZAR equities quoted in cents (ZAc / ZAX), Israeli ILS equities quoted in agorot (ILA). If the provider's raw response is passed through unchanged, the app will treat the value as the major-unit currency and inflate the price (and any derived position value, P&L, dividend yield) by a factor of 100.

Normalisation is performed **inside each provider adapter** so nothing downstream needs to know about minor units. By the time the result leaves the provider, `price` is always in the major unit and `currency` is always the major-unit ISO code.

- [ ] Each provider adapter that returns a price (`getLatestPrice`, `getHistoricalSeries`, `getDividends`, `getIndexSeries`) detects when the API has reported the price in a minor-unit currency and converts before returning. Mapping (extend as more cases are encountered):
  - `GBp` / `GBX` → divide by 100, currency becomes `GBP`
  - `ZAc` / `ZAX` → divide by 100, currency becomes `ZAR`
  - `ILA`         → divide by 100, currency becomes `ILS`
- [ ] The conversion is implemented as a single shared helper (`normaliseMinorUnit({ price, currency })`) imported by every provider adapter, so the mapping table lives in one place.
- [ ] `getStockProfile` similarly normalises any minor-unit currency it would otherwise report, so that a stock profile's stored `currency` is always the major-unit ISO code.
- [ ] The cached `priceCache` and `forexCache` entries (see Caching) store the normalised values only — a cache hit must never expose a minor-unit value to callers.
- [ ] Manual price override (above) accepts only major-unit currency codes. The Settings UI / stock-page input for manual price does not expose `GBp` / `GBX` / etc. as currency choices.

### Exchange-code resolution per provider
Different providers accept different formats for the same exchange — e.g. London is `LSE` on Twelve Data, `XLON` (MIC code) on IBKR, `.L` suffix on Yahoo, `.UK` on Stooq. SPEC-029 (Stock profile resolution) stores whatever string came back from the AI lookup or what the user typed (`LSE`, `London Stock Exchange`, `XLON`, `LON`, …) without enforcing a format. The market-data layer is therefore responsible for both **normalising** that string and **translating** it into each provider's format.

- [ ] A shared `resolveExchange(input)` helper maps any common synonym (full name, MIC code, plain code) to a canonical MIC code (ISO 10383). Examples:
  - `LSE`, `London`, `London Stock Exchange`, `XLON`, `LON` → `XLON`
  - `XETR`, `XETRA`, `Xetra`, `Frankfurt`, `Deutsche Börse`, `FRA` → `XETR`
  - `XAMS`, `Amsterdam`, `Euronext Amsterdam`, `AMS` → `XAMS`
  - `XPAR`, `Paris`, `Euronext Paris`, `PAR` → `XPAR`
  - `XMIL`, `Milan`, `Borsa Italiana`, `MIL` → `XMIL`
  - `XSTO`, `Stockholm`, `OMX`, `STO` → `XSTO`
  - Unknown / unmappable inputs return `null` — adapters then either omit the exchange parameter or throw to fall through.
- [ ] Each provider adapter takes the canonical MIC code from the helper and translates it into the format that provider expects (Twelve Data: human code such as `LSE`; Yahoo: `.L` suffix on the ticker; Stooq: `.UK` suffix; etc.). If the MIC code maps to nothing the provider supports, the adapter throws so the chain falls through.
- [ ] The mapping table lives in one place (`src/utils/marketDataExchanges.js` or similar) and covers at least the major European MICs plus `XNAS` / `XNYS` / `ARCX` / `BATS` for completeness.
- [ ] When `resolveExchange` upgrades a profile's stored exchange string to a canonical MIC, the result is **not** written back to the profile — SPEC-029 owns profile shape, this layer only consumes it.

### Symbol search & canonical storage
A bare ticker like `"SGRO"` or a string like `"Segro"` is ambiguous: it can resolve to several listings on different exchanges, and on a single exchange the same instrument is sometimes traded in more than one currency (cross-listings, ETF share classes priced in EUR and USD on the same venue, GDR/ADR pairs, dual-currency UCITS, etc.). The chain solves this once, on first lookup, by asking every enabled provider for candidates and letting the user pick. The picked candidate is then stored as a canonical `(ticker, exchange MIC, currency)` triple and reused unchanged by every subsequent call.

This is what the chain hands back to SPEC-029's resolution dialog (and to the manual-price form's autocomplete). The dialog is the only place the user disambiguates; downstream code should never have to.

- [ ] Each provider adapter implements `searchSymbols(query)` against the underlying API's search endpoint where one exists:
  - **Yahoo Finance** — `query1.finance.yahoo.com/v1/finance/search?q=...`
  - **Massive** — `/v3/reference/tickers?search=...`
  - **Twelve Data** — `/symbol_search?symbol=...`
  - **Finnhub** — `/search?q=...`
  - **Alpha Vantage** — `function=SYMBOL_SEARCH&keywords=...`
  - **Stooq, IBKR (deferred)** — adapter throws `"not supported"` so the chain falls through.
- [ ] Each provider's results are normalised into the chain's candidate shape: `{ ticker, name, exchange, currency, source }` where `exchange` has been put through `resolveExchange()` (returning a canonical MIC) and `currency` has been put through `normaliseMinorUnit()` (any minor-unit code is upgraded to its major-unit ISO). Candidates whose exchange cannot be resolved to a MIC are dropped.
- [ ] The chain's `searchSymbols(query)` calls every enabled provider in chain order (no early-exit on first hit — coverage gaps mean different providers find different listings) and merges results: candidates with the same `(ticker, exchange, currency)` are coalesced into a single row whose `source` is the union of all providers that returned it. Candidates that differ only by currency on the same exchange remain separate rows so the user can pick the currency they want.
- [ ] The dialog UI **always shows currency** alongside ticker, name, and exchange — even when only one candidate is returned. This is non-negotiable: a user picking blindly between two near-identical rows that differ only in currency must see the currency to make the right choice.
- [ ] When the merged list is empty, the dialog falls through to the AI-fallback step described in SPEC-029 (`Direction A — Step 2`); the AI prompt is updated to require `currency` in its candidate JSON. The "manual entry" row in SPEC-029 likewise must collect currency, not only exchange.
- [ ] On confirm, the picked candidate is upserted onto `stockProfile` as the canonical triple — `ticker` (bare, no suffix), `stockExchange` (MIC), `currency` (major-unit ISO). All subsequent provider calls use this triple as input.
- [ ] Provider adapters take `(ticker, exchange)` where `ticker` is **bare** (no embedded `.L` / `.DE` / `:LSE` / etc.) and `exchange` is a canonical MIC. As a defensive guard for legacy data and for any user input path that bypasses the dialog, every adapter's symbol-construction helper (`yfTicker`, `tdSymbol`, `polyTicker`, `finnhubSymbol`, `stooqSymbol`) strips a recognised exchange suffix from `ticker` before applying its own format, and logs the strip at debug level so legacy profiles needing migration can be identified.
- [ ] Changing a stock profile's `stockExchange` or `currency` (via "Refresh profile" on the stock page, or a manual edit) invalidates the price cache entry keyed on the old `(ticker, exchange)`. The next price call refetches against the new exchange.
- [ ] Re-running resolution on an already-resolved stock (the "Refresh profile" path in SPEC-029) shows the existing canonical triple as one of the candidates so the user can keep it without changing anything.

### HTTP transport (CORS handling)
Most providers (Massive, Twelve Data, Finnhub, Alpha Vantage) set `Access-Control-Allow-Origin` and can be called directly with browser `fetch`. Two providers do not — **Yahoo Finance** and **Stooq** — and the chain needs them, so we add a small abstraction that routes only those two through a CORS-bypass path while keeping everything else on plain `fetch`.

- [ ] A `marketDataFetch(url, options)` helper wraps the per-provider HTTP call. It chooses the transport based on a per-provider flag (`requiresProxy: true|false` set in the chain definition):
  - `requiresProxy: false` → plain `fetch` (current behaviour for Massive, Twelve Data, Finnhub, Alpha Vantage)
  - `requiresProxy: true` AND running in Tauri → call through the Tauri HTTP plugin (Rust-side request, no CORS)
  - `requiresProxy: true` AND running in Vite dev → request goes via a Vite dev-server proxy path (`/__yfproxy/...`, `/__stooq/...`) configured in `vite.config.js` to forward to the upstream
- [ ] Tauri integration: the `@tauri-apps/plugin-http` plugin is added to dependencies and registered in `src-tauri/Cargo.toml` + `tauri.conf.json` capabilities so the WebView can make the proxied request. The capability allowlist is restricted to `query1.finance.yahoo.com` and `stooq.com` only.
- [ ] Vite integration: `vite.config.js` declares a `server.proxy` block routing `/__yfproxy` → `https://query1.finance.yahoo.com` and `/__stooq` → `https://stooq.com`. This only affects the dev server; production builds run via Tauri and never hit it.
- [ ] If neither Tauri nor a configured Vite proxy is available (e.g. a static-hosted browser build with no proxy), `marketDataFetch` for `requiresProxy: true` providers throws `"transport unavailable"` — the chain falls through. The keyless providers degrade gracefully rather than silently failing requests.
- [ ] No third-party / public CORS proxies (e.g. `corsproxy.io`, `allorigins.win`) are introduced. They are unreliable, rate-limited, and route the user's request data through arbitrary infrastructure.

### Caching
- [ ] Current prices and forex rates are cached with a 1-hour TTL (SPEC-017 owns the exchange-rate cache; this spec owns the price cache with the same TTL).
- [ ] Historical series are fetched on demand and not cached in Phase 2 (nice-to-have later).
- [ ] Stock profiles (name, exchanges, HQ country) are cached indefinitely per stock, with a "refresh profile" action on the stock page.
- [ ] News is fetched on demand with a 15-minute TTL so rapid re-opens of the same stock page don't thrash the provider.

### HQ country lookup — verification + write-back *(Phase 33)*
- [x] **Verification pass across every adapter.** All four implemented adapters return `hqCountry`: Yahoo Finance (`assetProfile.country`), Massive (`results.locale`), TwelveData (`country`), AlphaVantage (`Country`). Finnhub now also implements `getStockProfile` (Phase 36a — `country` field). IBKR and Stooq remain `notImplemented`.
- [x] **Refresh profile writes `hqCountry`.** When the user re-confirms a candidate via Refresh profile (SPEC-029) or Re-identify ticker, the resolved profile's `hqCountry` is written from whichever adapter returned it first (first-non-null wins). The existing per-stock manual override (`hqCountryOverride`) is preserved — display order is `hqCountryOverride ?? hqCountry ?? 'Global'`.
- [x] **Consumers.** Once populated, `hqCountry` feeds: Reports regional / continent breakdowns (SPEC-024), Dividend page metrics-tab grouping (SPEC-032), and the per-country tax level of the dividend tax hierarchy (SPEC-020 item 178, also Phase 33).

### Configurable cache TTLs *(Phase 33)*
- [ ] **Per-data-type TTL inputs** in Settings → Investments → "API call frequency" card. One row per cache category: Prices (default 60 min), Forex (default 60 min), News (default 15 min), Intraday (default 5 min), plus the failure-cooldown TTL described in the next section. Each row exposes a number input (minutes), valid range 1–1440, with a brief explanation. Settings live under `settings.apiCacheTtl: { pricesMin, forexMin, newsMin, intradayMin, failureCooldownMin }`.
- [ ] **Persisted history (`apiDividendHistory`) and profile cache are not TTL'd** and therefore not exposed in this card — they only refresh on explicit user action (Refresh dividends / Refresh profile / Re-identify ticker).
- [ ] **A cache hit within TTL never calls the network.** Read sites consult the cache first, then the in-flight dedup map, then fall to a fresh fetch. The 10-minute behaviour the user originally described is achievable by lowering Prices / Forex to 10 (or whatever the user prefers) — the default values preserve current behaviour and avoid changing observable cadence on upgrade.
- [ ] **Offline fallback (Phase 33).** When all enabled providers fail (network is offline, every adapter throws), every read function returns the most recent cached value regardless of how stale it is, and the caller surfaces it with a small ⏱ icon + tooltip showing the cache age. This matches the user's expectation: "in case there is no internet connection the user shall see the last retrieved data". The fallback is bypassed only when the cache itself is empty — then "—" is rendered as today. `lastKnownPrice` on the stock profile (SPEC-029 Phase 33) is consulted as a final fallback when even the hot cache is empty.

### Negative cache for failed fetches *(Phase 33)*
The success-side cache only short-circuits the network when a fetch has previously *succeeded*. For tickers that consistently fail across every provider (delisted, region-restricted, free-tier-blocked, rate-limited symbols), the chain is re-run on every page visit, hammering the providers and contributing to 429 storms. A short-TTL **negative cache** complements the success cache: a single failure marker per `(category, ticker, exchange)` suppresses retries until the cooldown elapses or the user explicitly resets.

- [ ] **`settings.apiCacheTtl.failureCooldownMin`** (default 15) controls how long a ticker stays in cooldown after a full-chain failure. Exposed as a row in the "API call frequency" card alongside the other TTLs.
- [ ] **Categories tracked.** Cooldown markers are kept per call category: `prices`, `news`, `intraday`, `historical`. Forex is owned by SPEC-017's cache and not covered here. Dividends and corporate actions are not cooled down — dividend history is the persisted-history cache (rate-limited at its own layer), and corporate actions only fire on explicit user action. Historical series is included even though successes are not cached, because the stock-page chart and reports chart re-fire it on every mount.
- [ ] **Trigger.** When `getLatestPrice` / `getNews` / `getIntradaySeries` / `getHistoricalSeries` exhausts every enabled provider without success, the client writes `cooldowns[<category>][<ticker_exchange>] = { failedAt }` to the same `rmoney_market_data_cache` localStorage entry. The marker is timestamp-only — no error text, no URL, no credential material — so it complies with SPEC-031's logging rules. The historical cooldown is keyed by `(ticker, exchange)` only — not by `(period, resolution)` — because the failures observed in practice (404, 429, region-restricted) are ticker-level, not timeframe-level; one failure suppresses retries for every chart range until the cooldown elapses.
- [ ] **Suppression.** On subsequent reads within `failureCooldownMin`, the client skips the provider chain entirely and returns the same fallback path the post-chain `catch` block uses today: stale-cache → `lastKnownPrice` from the stock profile → reject with `unavailable (cooldown)` (caller renders "—"). No network round-trip occurs.
- [ ] **Clearing.** A successful fetch for that `(category, ticker, exchange)` clears its cooldown marker so the ticker resumes normal cache behaviour. The per-page "Reset API" button clears cooldown markers for the categories the page depends on (e.g. Investments overview clears `prices`). `clearAllMarketCaches` and `clearCacheForTicker(t)` clear the corresponding cooldown entries. `forceRefresh: true` on any client call bypasses the cooldown for that one call without clearing it.
- [ ] **Telemetry.** Cooldown short-circuits produce a single `logCall` entry with `outcome: 'cooldown-skip'` and `providerName: null` so the debug panel makes it visible why a page didn't re-fetch a ticker. `getCacheStats()` includes a `cooldownEntries` count for observability (no separate Storage tab card — the cooldown bucket lives inside the existing `rmoney_market_data_cache` localStorage key and is already covered by its byte total).

### Per-page reset / refresh all *(Phase 33)*
- [ ] **"Reset API" button on every page that displays API data.** Position is the right end of the page's primary action row (Investments overview, Stock page, Stock inventory, Dividend page, Investment reports, Buy-Sell planning). The button triggers an immediate refresh of every cache entry the page reads from: prices, forex, news / intraday / dividend history / profiles as applicable per page. Implemented as a generic `resetPageCaches(pageId)` helper with each page registering its data dependencies.
- [ ] While running the button shows "Refreshing…" with a spinner; on completion shows a brief "Refreshed" toast with the count of successful calls and any failures. Subsequent page reads pick up the fresh data automatically. The button does NOT clear the `apiDividendHistory` collection — that requires explicit "Refresh dividends" (per-stock) or the Storage tab bulk-clear.

### Storage card readability *(Phase 33)*
- [ ] **Settings → Storage → "API dividend history" card** caps the per-ticker breakdown list at 20 rows tall with vertical scroll inside the card. Rows are sorted alphabetically by ticker (ascending) by default. The summary row (total bytes, total rows) stays sticky above the scroll area. Matches the readability standard expected for any per-stock breakdown card.

### Telemetry / errors
- [x] Each call logs which provider served it + latency + outcome (success / failure reason). Exposed in a dev-only debug panel in Settings for troubleshooting rate-limit and coverage issues.
- [x] The debug panel refreshes automatically when the user switches to the Market data tab, and provides a manual **Refresh** button alongside the existing **Clear** button.
- [x] Each log entry includes a timestamp in `yyyy-mm-dd hh:mm:ss` format as the first column of the debug table.
- [x] **In-flight deduplication:** a module-level `_inFlight` Map ensures that if two callers request the same key while a call is already in-flight, they share one promise and one network round-trip. Deduplicated functions: `getLatestPrice`, `getHistoricalSeries`, `getNews`, `getMarketProfile`, `searchSymbols`. Cache and manual-price short-circuits bypass the dedup map (they return synchronously before entering the shared-promise path). The map entry is deleted on promise settlement so a second call after the first resolves always starts a fresh fetch.

## UI / Screens
Settings → Market data providers:

```
Market data providers                     [Test all]
  IBKR Web API         [   Disabled]   (deferred — retail OAuth not yet available)
    OAuth status: Not connected           [Connect]
    [Test]
  Yahoo Finance        [✓ Enabled]    (no key required)
    Transport: Tauri HTTP / Vite proxy
    [Test]
  Massive              [✓ Enabled]
    API key: [••••••••••]  [Show]        [Test]
  Twelve Data          [✓ Enabled]
    API key: [••••••••••]  [Show]        [Test]
  Finnhub              [   Disabled]
    API key: [          ]  [Show]        [Test]
  Alpha Vantage        [   Disabled]
    API key: [          ]  [Show]        [Test]
  Stooq                [✓ Enabled]    (no key required, EOD prices only)
    Transport: Tauri HTTP / Vite proxy
    [Test]

Chain order (fixed):
  IBKR → Yahoo → Massive → Twelve Data → Finnhub → Alpha Vantage → Stooq
```

Debug panel (dev only):

```
Recent API calls                                              [Refresh]  [Clear]
  2026-05-01 14:22:03  getLatestPrice(AAPL)   ibkr      —    ✗  no api key
  2026-05-01 14:22:03  getLatestPrice(AAPL)   yahoo   102ms  ✗  fetch failed
  2026-05-01 14:22:03  getLatestPrice(AAPL)   massive  122ms ✓
  2026-05-01 14:21:55  getDividends(ASML)      massive   —    ✗  no data
  2026-05-01 14:21:55  getDividends(ASML)      twelveData 340ms ✓
  ...

Panel auto-refreshes when the Market data tab becomes active.
```

Manual price override (on SPEC-021 stock page):

```
Price: $182.50  [Set manual price]
     (latest from Massive, cached 00:14 ago)
```

## Data

`settings.marketDataProviders`:

```
{
  ibkr:         { enabled: boolean, oauth: { tokens, refreshToken, userId } | null },
  yahooFinance: { enabled: boolean },                   // no key — keyless provider
  massive:      { enabled: boolean, apiKey: string | null },
  twelveData:   { enabled: boolean, apiKey: string | null },
  finnhub:      { enabled: boolean, apiKey: string | null },
  alphaVantage: { enabled: boolean, apiKey: string | null },
  stooq:        { enabled: boolean }                    // no key — keyless provider
}
```

Defaults on first install: `yahooFinance.enabled = true`, `stooq.enabled = true`, all others `enabled = false`. The user enables Massive / Twelve Data / Finnhub / Alpha Vantage as they paste in keys.

Per-stock data on the stock profile (canonical triple owned by SPEC-029, manual override owned by this spec, HQ override owned by SPEC-020):

```
{
  ticker:        string,    // bare — no suffix
  stockExchange: string,    // canonical MIC, e.g. "XLON"
  currency:      string,    // major-unit ISO, e.g. "GBP"
  manualPrice:   { amount: number, currency: string, setAt: ISO timestamp } | null
}
```

`(ticker, stockExchange, currency)` together form the canonical key. Provider adapters always receive this triple; the bare ticker never carries an embedded suffix. The currency is part of the key — not a derivable field — because the same `(ticker, exchange)` can correspond to listings priced in different currencies.

Caches (in-memory, mirrored to localStorage for persistence across sessions):

```
priceCache:   { [ticker_exchange]: { price, currency, fetchedAt, providerName } }
forexCache:   { [from_to]:         { rate, fetchedAt, providerName } }  // shared with SPEC-017
newsCache:    { [ticker]:          { items, fetchedAt } }                // 15-min TTL
profileCache: { [ticker]:          { profile, fetchedAt } }              // indefinite
cooldowns:    {
  prices:     { [ticker_exchange]: { failedAt } },    // failureCooldownMin TTL
  news:       { [ticker]:          { failedAt } },
  intraday:   { [ticker_exchange]: { failedAt } },
  historical: { [ticker_exchange]: { failedAt } },    // covers every (period, resolution) for that ticker
}
```

## Out of Scope
- Per-data-type routing logic (e.g. "use IBKR for positions but Twelve Data for dividends regardless"). Fallback is strictly failure-only.
- User-reorderable chain order.
- WebSocket streaming prices. All fetches are REST pull.
- Historical-series caching beyond a single session.
- Auto-sync of broker transactions from IBKR Web API on a schedule. Phase 2 keeps the API chain as a data-fetch layer; using IBKR to pull the user's transactions automatically is tracked as a future enhancement (the endpoints exist in the shape of `getMyTransactions` but are not wired to the Investments ingestion flow).
- Additional providers beyond the seven chain members. (EODHD and Marketstack were considered and rejected as quotas were too tight to be useful — easy to revisit later by adding another adapter and a chain slot.)
- Public CORS proxies (e.g. `corsproxy.io`) for the keyless providers. Yahoo / Stooq go through Tauri HTTP or Vite dev proxy only.
- Stooq dividends / profile / news / corporate-actions adapters. The Stooq slot only serves prices.
- Yahoo Finance `getDividends`. Yahoo can only report ex-date + amount, never payment date or declared/future events, so the adapter throws `'not supported'` for dividends and the chain falls through. (Yahoo still serves prices, splits, profile, search, FX, intraday, and index series.)
- Rate-limit management beyond the basic cache TTLs (no adaptive backoff, no quota pooling).
- A shared "provider health" dashboard for end users. The debug panel is for development troubleshooting only.

## Open Questions
None.
