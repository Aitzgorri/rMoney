---
id: SPEC-017
name: Currency Conversion
status: done
created: 2026-04-23
---

# Currency Conversion

## Goal
Introduce an app-wide "main currency" setting and a conversion layer so that every total that sums across accounts in different currencies — Dashboard, budget rollups, planning periods, transaction lists, envelope totals, and all Investments views — is expressed in a consistent currency. This closes the "Currency conversion / exchange rates (future)" item deferred in SPEC-002 from day one of the app.

Accounts already carry a currency field today ([SPEC-002](SPEC-002-accounts.md)); what's missing is the layer that converts across them. The same conversion layer is the foundation for all multi-currency behaviour in the Investments module (SPEC-019–SPEC-024).

## User Stories
- As a user, I can pick my main currency in Settings (e.g. CZK, EUR, USD), so the app knows what to sum totals in.
- As a user looking at the Dashboard, I can see "total cash across all accounts" as a single number in my main currency, even if I have an EUR account and a CZK account.
- As a user looking at a specific account, I can toggle between the native currency view and the main-currency-converted view, so I don't lose access to the raw number.
- As a user, I can manually refresh exchange rates from the Dashboard, so if I want "right-now" numbers I don't have to wait for the cache.
- As a user, I can see on the Dashboard when rates were last refreshed, so I know how fresh the converted totals are.

## Acceptance Criteria
- [x] Main-currency setting lives in More → Settings. User picks from a supported list (at minimum: CZK, EUR, USD, GBP + others reachable via the API chain). Default is inferred from browser locale on first run.

### Shared currency dropdown with favorites *(Phase 33)*
- [x] **Every currency input in the app is a dropdown** (not a free-text field). Applies to: Account form (SPEC-002), Buy form, Dividend form, Add manual stock dialog, Resolution dialog "manual entry" row, Cash balance form (SPEC-018), Planning income / expense rows (SPEC-009), Budget form (SPEC-011), Trading fees Settings rows (SPEC-034), Stock profile Edit dialog (SPEC-033). Note: Sell form currency is derived from the selected position (not user-entered); trading scenarios currency display picker is a multi-checkbox filter over account currencies (not an ISO picker) — neither needs CurrencyDropdown.
- [x] **Favorites at the top, others below — visually separated.** The dropdown renders the favorites list first in user-defined order, followed by a non-selectable `────` divider `<option>`, followed by every other currency from `iso4217.js` sorted alphabetically.
- [x] **Favorites managed in Settings → General, directly below the main-currency setting.** Card title: "Favorite currencies". Drag-handle list with ISO code, full name, × remove button. Searchable "Add currency" input with filtered suggestions from `iso4217.js`; already-favorites are greyed out. Reorder via `@dnd-kit/core` (`DndContext` + `useDraggable` + `useDroppable`).
- [x] **Defaults on first run.** `migrateFavoriteCurrencies()` runs at app boot (App.jsx) and seeds `settings.favoriteCurrencies` with `SUPPORTED_CURRENCIES` (14 codes) when the field is absent.
- [x] **Adding a new currency to favorites:** searchable input filters `iso4217.js`; clicking a suggestion adds it to the bottom of favorites. Already-favorite codes are shown greyed out.
- [x] **Removing a favorite:** × button removes from favorites; it stays in the "others" section of every dropdown. Main currency × is disabled with a tooltip.
- [x] **Main currency is always in favorites.** `handleMainCurrencyChange` in Settings auto-adds the new main currency to favorites at the top when absent.
- [x] **Storage.** `settings.favoriteCurrencies: string[]` stored in `rmoney_settings` blob via `getFavoriteCurrencies` / `setFavoriteCurrencies` in `data/settings.js`.
- [x] **Shared component.** `components/CurrencyDropdown.jsx` — props: `value`, `onChange`, `disabled?`, `className?`, `excludeMinorUnits?`. Reads `getFavoriteCurrencies()` and `ISO4217` from `utils/iso4217.js`. Unknown legacy values shown as a fallback option above favorites.

### Reduced default favorite currencies *(Phase 38)*
- [x] **Default favorite-currency seed reduced to GBP / EUR / CAD / USD.** Supersedes the Phase 33 "Defaults on first run" behaviour (which seeded all 14 `SUPPORTED_CURRENCIES`). `migrateFavoriteCurrencies()` and the `migrateSettingsObjectToV2()` pure transform in `data/settings.js` now seed `['GBP', 'EUR', 'CAD', 'USD']`. `SUPPORTED_CURRENCIES` itself is **unchanged** — it stays the broader list offered in the "others" section of every `CurrencyDropdown` and in the main-currency picker; only the favorites **seed** shrinks. The migration remains seed-when-absent, so existing users who already have a `favoriteCurrencies` array keep their full list; the smaller default applies to fresh installs and to backups that predate the favorites field. The "main currency is always in favorites" rule still force-adds the user's main currency at the top, so a user whose main currency is outside the four still sees it pinned.

### Shared country dropdown with favorites *(Phase 38)*

SPEC-017 is the home of the app's shared **reference-data dropdowns and their favorites lists**. Phase 33 added currencies; Phase 38 adds **countries**, reusing the identical pattern so the two behave the same. (HQ country and per-country withholding tax are not currency-conversion concerns, but the favorites + shared-dropdown UX is identical, so they are documented together here rather than split across files — see the note in *Out of Scope* on a future dedicated reference-data spec if a third type appears.)

- [x] **Country reference data + shared `CountryDropdown`.** New `utils/iso3166.js` exports the ISO 3166-1 list as `{ code, name }` rows (alpha-2 code + English short name). New `components/CountryDropdown.jsx` mirrors `CurrencyDropdown` — props `value` (alpha-2 code), `onChange`, `disabled?`, `className?`. Each option label renders as `"DE — Germany"` (`{code} — {name}`). Options are **sorted by country name** (not by code). Favorites render first in user-defined order, then a non-selectable `────` divider `<option>`, then every other country sorted by name. An unknown / legacy stored value (free-text that isn't a valid alpha-2 code, e.g. a previously typed "UK") is shown as a fallback option at the top so existing data still displays and can be re-picked.
- [x] **Favorite countries managed in Settings → General.** A "Favorite countries" card sits directly below the "Favorite currencies" card, with the identical UX: drag-handle reorder (`@dnd-kit/core`), `code — name` rows each with an × remove button, and a searchable "Add country" input filtered from `iso3166.js` (already-favorite codes greyed out). Stored as `settings.favoriteCountries: string[]` (alpha-2 codes, user order) via `getFavoriteCountries` / `setFavoriteCountries` in `data/settings.js`.
- [x] **Default favorite-countries seed.** `migrateFavoriteCountries()` runs at app boot (App.jsx, alongside `migrateFavoriteCurrencies`) and seeds `settings.favoriteCountries` when absent. Default seed: **`['US', 'GB', 'DE', 'CA']`** (United States, United Kingdom, Germany, Canada) — chosen to parallel the reduced default favorite currencies (GBP→GB, EUR→DE, CAD→CA, USD→US). Seeded identically by a `migrateSettingsObjectToV2`-style pure transform for the backup loader. *(Design choice — an empty default is equally acceptable if the user prefers to build the list from scratch; flagged for confirmation.)*
- **Consumers** (ACs live in their owning specs; the shared component is defined once here): the HQ-country field on Edit profile / Add manual stock (**SPEC-029**) and the Per-country dividend-tax picker (**SPEC-020**) both switch from free-text to `CountryDropdown`.

- [x] Every account keeps its native currency (already stored, SPEC-002). No data migration needed.
- [x] A conversion utility `convertToMain(amount, fromCurrency, atDate?)` is available app-wide. With `atDate` it uses the rate snapshotted at that date; without, it uses the current cached rate.
- [x] Conversion layer is consumed by: Dashboard totals ✓, budget/category rollups ✓ (SPEC-011), planning-period sums ✓ (SPEC-009), Transaction list totals ✓ (SPEC-006), Envelope list totals ✓ (SPEC-007), and all Investments views (deferred to Phase 11+).
- [x] Each screen that sums across currencies shows totals in main currency by default. *(Dashboard: full toggle; Planning/Transactions/Envelopes/Budgets: main-currency total shown, individual figures unchanged; native toggle deferred — single-currency users see native directly)*
- [x] Exchange rates are fetched via `open.er-api.com` (free, no key) until SPEC-027 provider chain is built. The fetch uses a plain browser `fetch()` (the API sets CORS headers), so `https://open.er-api.com` **must** be present in the Tauri static CSP `connect-src` (`tauri.conf.json`, SPEC-031) — otherwise the packaged desktop build blocks the request and the Dashboard shows "Rate fetch failed" even though it works in the browser/dev build.
- [x] Current rates are cached with a 1-hour TTL.
- [x] A "Refresh rates" button on the Dashboard triggers an immediate re-fetch; the timestamp of the last successful refresh is displayed ("Rates as of 2026-04-23 08:14").
- [x] Historical-rate snapshot helper: `snapshotFxRates(tradingCurrency, date, mainCurrency)` in `utils/currency.js` fetches the historical rate via SPEC-027 `getHistoricalForex` and returns `{ mainCurrency, rateToMain, capturedAt }` or `null`. Called at buy/sell/exchange write time. Backfill for existing records via `backfillFxSnapshots()` in `data/stockTransactions.js` (runs from Settings → Storage). *(Phase 25a)*
- [x] When a provider returns no rate for a pair (rate unavailable) and no cache entry exists, the UI shows "—" for the converted value and flags it; it does not fall back to last-known-good stale data silently.

## UI / Screens
Settings:

```
More → Settings
  Main currency: [CZK ▼]                       <-- new
  Currency display default: (o) Main  ( ) Native
  ...
```

Dashboard (top of page):

```
+--------------------------------------------------------+
| Dashboard                              [Refresh rates] |
|                                         (as of 08:14)   |
+--------------------------------------------------------+
| Total cash:         142 450 CZK  [Show in native ▼]   |
+--------------------------------------------------------+
| ...widgets...                                          |
```

Toggle in per-account view:

```
Account: Revolut (EUR)
Balance: €1,245.33          (≈ 31 020 CZK)
         [Show native] [Show main]
```

## Data
No new persistent collections. Adds:
- `settings.mainCurrency` (string, ISO 4217 code)
- `settings.currencyDisplay` (enum: `main` | `native`) — default `main`
- `settings.favoriteCurrencies` (string[], ISO 4217 codes in user-defined order) — Phase 33; **Phase 38: default seed reduced from the 14-code `SUPPORTED_CURRENCIES` to `['GBP', 'EUR', 'CAD', 'USD']`**; managed by `getFavoriteCurrencies` / `setFavoriteCurrencies` / `migrateFavoriteCurrencies` in `data/settings.js`
- `settings.favoriteCountries` (string[], ISO 3166-1 alpha-2 codes in user-defined order) — Phase 38; default seed `['US', 'GB', 'DE', 'CA']`; managed by `getFavoriteCountries` / `setFavoriteCountries` / `migrateFavoriteCountries` in `data/settings.js`. Lives inside the existing `rmoney_settings` blob (no new Storage-tab card needed — same as `favoriteCurrencies`). **New settings key → backup-format bump (`rmoney-data-v4`) when shipped (see SPEC-016 / RELEASE.md).**
- `cache.exchangeRates` (in-memory + persisted, keyed by `${from}_${to}`, with `rate`, `fetchedAt`) — 1-hour TTL on reads

Snapshot helper stores rates on investment transactions (see SPEC-019). This spec provides the snapshotting utility; the storage shape lives on each investment record.

## Out of Scope
- Multi-currency transactions inside budgeting (e.g. an account in EUR spending in GBP with FX conversion captured on the transaction) — for Phase 2, budgeting transactions still happen in the account's native currency and the conversion is purely a display-layer concern.
- Historical rate charts or a "rates over time" view.
- User-entered exchange rates as an override. Phase 2 only supports API-provided rates + manual refresh; a manual rate override could be a future enhancement.
- Per-transaction historical rates for **non-investment** transactions. Only investment transactions snapshot rates (for the multi-currency performance metrics).
- A separate "reference data & favorites" spec. For now currencies (Phase 33) and countries (Phase 38) share this spec because the favorites + shared-dropdown UX is identical. If a third reference-data type needs the same treatment (e.g. stock exchanges, sectors), extract the `iso*.js` data + `*Dropdown` component + favorites pattern into their own spec and cross-link back here. Tracked as a possible future refactor, not v1 work.

## Open Questions
None.
