---
id: SPEC-017
name: Currency Conversion
status: in-progress
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
- [x] Every account keeps its native currency (already stored, SPEC-002). No data migration needed.
- [x] A conversion utility `convertToMain(amount, fromCurrency, atDate?)` is available app-wide. With `atDate` it uses the rate snapshotted at that date; without, it uses the current cached rate.
- [x] Conversion layer is consumed by: Dashboard totals ✓, budget/category rollups ✓ (SPEC-011), planning-period sums ✓ (SPEC-009), Transaction list totals ✓ (SPEC-006), Envelope list totals ✓ (SPEC-007), and all Investments views (deferred to Phase 11+).
- [x] Each screen that sums across currencies shows totals in main currency by default. *(Dashboard: full toggle; Planning/Transactions/Envelopes/Budgets: main-currency total shown, individual figures unchanged; native toggle deferred — single-currency users see native directly)*
- [x] Exchange rates are fetched via `open.er-api.com` (free, no key) until SPEC-027 provider chain is built.
- [x] Current rates are cached with a 1-hour TTL.
- [x] A "Refresh rates" button on the Dashboard triggers an immediate re-fetch; the timestamp of the last successful refresh is displayed ("Rates as of 2026-04-23 08:14").
- [ ] Historical-rate snapshot helper: when Investments records a buy / sell / dividend, it calls into this layer to capture the rates at that date and stores them on the transaction (rates for main, USD, EUR, GBP, CZK). The snapshot uses an end-of-day rate for the transaction date. *(deferred to Phase 12/13)*
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
- `cache.exchangeRates` (in-memory + persisted, keyed by `${from}_${to}`, with `rate`, `fetchedAt`) — 1-hour TTL on reads

Snapshot helper stores rates on investment transactions (see SPEC-019). This spec provides the snapshotting utility; the storage shape lives on each investment record.

## Out of Scope
- Multi-currency transactions inside budgeting (e.g. an account in EUR spending in GBP with FX conversion captured on the transaction) — for Phase 2, budgeting transactions still happen in the account's native currency and the conversion is purely a display-layer concern.
- Historical rate charts or a "rates over time" view.
- User-entered exchange rates as an override. Phase 2 only supports API-provided rates + manual refresh; a manual rate override could be a future enhancement.
- Per-transaction historical rates for **non-investment** transactions. Only investment transactions snapshot rates (for the multi-currency performance metrics).

## Open Questions
None.
