# Implementation Plan

> Remaining feature work, ordered by recommended implementation sequence.
> When an item is fully implemented, **remove it** from this file.
> Items are grouped by spec but ordered by cross-spec dependencies and shared-code opportunities.

**Last shipped: v0.35.0** — bundles Phase 34a (transaction-edit correctness), Phase 35a (cross-currency fee model), Phase 36a–g (Finnhub/Stooq adapters, API-detected splits, stock-exchange selector, default CSV template, standalone lot picker), and Phase 37a–b (selective Reset data action + responsive stock-page header). Backup format advanced to `rmoney-data-v3`. The earlier v0.34.0 (2026-05-28) bundled Phase 33 (a–o) + Phase 21a (Android pipeline). Full sub-phase breakdown lives in `RELEASE.md` and the git history; line-by-line acceptance criteria are removed from this plan once a release is closed.

**Next up:** **Phase 38 — June 2026 adjustments** (the section below), targeting **v0.36.0**. Mobile Investments parity (Phase 21b) and future asset classes (Phase 20, sketched in SPEC-035) remain the larger phases beyond it.

---

## Phase summary

| Phase | Status | Notes |
|---|---|---|
| 1 — MVP core data entry | ✓ done | |
| 7 — Desktop deployment (Tauri) | ✓ done | |
| 8 — Desktop UI enhancements | ✓ done | |
| 9 — Data portability | ✓ done | Reset-data action added in Phase 37a |
| 10 — App-wide currency conversion | ✓ done | |
| 11 — Investments foundation | ✓ done | Finnhub/Stooq adapters (36a/36b) and default CSV template (36f) all shipped |
| 12 — Stock transactions | ✓ done | Cross-currency model shipped (35a); split notification shipped (36d) |
| 13 — Dividends MVP | ✓ done | Per-country tax landed in 33e |
| 14 — Stock page | ✓ done | Exchange selector shipped in Phase 36c |
| 15 — Portfolios | ✓ done | |
| 16 — Benchmarks | ✓ done | |
| 17 — Investment reports | ✓ done | |
| 18 — CSV import | ✓ done | |
| 19 — AI integration | ✓ done | |
| 20 — Future asset classes | placeholders | See SPEC-035 roadmap |
| 21a — Android build pipeline | ✓ done | Verified on device 2026-05-28 |
| 21b — Mobile Investments parity | deferred (after backlog) | Six SPEC-028 items |
| 22 — Stock profile resolution | ✓ done | |
| 23 — Watchlists & alerts | ✓ done | |
| 24 — Security & secrets handling | mostly done | 237a closed in Phase 36e; 255 still gated on IBKR adapter |
| 25 — Investment data foundation | ✓ done | |
| 26 — Stock lifecycle UX + transaction edits | mostly done | 4 items in backlog |
| 27 — Investing account detail overhaul | ✓ done | |
| 28 — Stock page enhancements | ✓ done | |
| 30 — Stock inventory page | ✓ done | |
| 31 — Dividend page | ✓ done | |
| 32 — Buy-Sell planning + UX gap closure | ✓ done | Standalone lot picker shipped in Phase 36g |
| 33 — Foundation + dividend overhaul + Android | ✓ shipped in v0.34.0 | 33a–o + 21a + production-build hotfix |
| 34 — Tier 1 transaction-edit correctness | ✓ shipped in v0.35.0 | items 291, 165, 286 (34a) |
| 35 — Tier 2 cross-currency fee model | ✓ shipped in v0.35.0 | 35a; backup format → rmoney-data-v3 |
| 36 — Tier 3/4/6 adapters + splits + exchange + polish | ✓ shipped in v0.35.0 | Finnhub/Stooq, API splits (36d), exchange selector (36c), CSV template (36f), lot picker (36g) |
| 37 — Selective reset + responsive header | ✓ shipped in v0.35.0 | 37a Reset data (SPEC-016), 37b responsive Stock page (SPEC-021) |
| 38 — June 2026 adjustments | in progress | this batch — targets v0.36.0 |

---

## Shared code — utilities pending extraction

> All other shared utilities (currency conversion cache, market data client, inline form expansion, AI connection, `cashMovements` ledger, HybridFilterDropdown, CurrencyToggle, CurrencyDropdown, ConfigurableTable, soft-delete lifecycle, XIRR, persisted-history-vs-hot-cache split, drag-and-drop tree, planning-period calculation, frequency math, one-time/regular toggle) are extracted as shared modules. See `app/src/components/` and `app/src/utils/` for paths. Two remain inline:

| Utility | Status | Location | Notes |
|---|---|---|---|
| Hierarchical tree component | inline | Used in Categories + Envelopes screens | Review for SPEC-009 (planned expenses) generalisation if/when that phase resumes |
| Cascade-delete confirmation dialog | inline | Used in Categories + Envelopes | Extract before SPEC-009 needs it |

---

## Pending items from earlier phases

### Recommended order (logical / technical dependencies)

Reordered after v0.34.0 to put small correctness fixes first, then the cohesive cross-currency overhaul, then capability expansion (adapters → features that need them), then security follow-ups, then polish. Items keep their original numbers + spec grouping so `plan:validate` stays in sync.

1. **Tier 1 — Transaction-edit correctness + safety** ✓ done (291, 165, 286 all shipped in Phase 34a).
2. **Tier 2 — Cross-currency model overhaul** ✓ done (152j-full, 152m-full, 159b, 164, 288 all shipped in Phase 35a).
3. **Tier 3 — Market data adapters** ✓ done (157f Finnhub + 157g Stooq both shipped in Phase 36). Unblocks the splits notification in Tier 4. (Note: 255 IBKR OAuth in Tier 5 depends on a separate IBKR adapter that is currently a stub, not on Finnhub/Stooq.)
4. **Tier 4 — Splits + exchange UX** ✓ done (170 API-detected splits shipped in Phase 36d; 185 stock-exchange selector in Phase 36c).
5. **Tier 5 — Security follow-ups** — 237a closed in Phase 36e (Settings → AI hostname allowlist; meta-CSP approach abandoned after research, see SPEC-031). 255 stays gated on the IBKR adapter being built (currently a stub) and IBKR retail OAuth shipping.
6. **Tier 6 — Small UX polish** ✓ done (152 default CSV template selector shipped in Phase 36f; 382 standalone lot-picker shipped in Phase 36g).

Every Tier (1–6) of the post-v0.34.0 backlog is now closed. The only items remaining below are the long-deferred IBKR OAuth slot (gated on third-party availability) and the placeholder phases (20 future asset classes, 21b mobile parity).

### SPEC-031 Security and secrets handling (Phase 24 leftovers)
255. [ ] When IBKR retail OAuth ships, tokens go straight to Stronghold under `marketData/ibkr/oauth/{accessToken,refreshToken}` — gated on the IBKR adapter actually being built (currently a stub).


---

## Phase 38 — June 2026 adjustments (cross-spec)

> Batch from the **01 June 2026** review notes. Small, mostly independent adjustments across dividends, buy-sell planning, settings, and the stock page, plus one CSS bug fix. Targets the **v0.36.0** milestone.
>
> **Suggested build order:** 434 → 435 → 436 (the shared `CountryDropdown` + favorites must exist before its consumers) → 438 → 431; then the independent items 430, 432, 433, 437, 439 in any order. 432 (CSS one-liner) and 437 (seed change) are the cheapest.
>
> **Versioning note:** item 435 adds a new settings key (`settings.favoriteCountries`) — a data-shape change. Bump the backup format to **`rmoney-data-v4`** and update the RELEASE.md *Data compatibility* table when v0.36.0 is cut. The new key lives inside the existing `rmoney_settings` blob, so **no new Settings → Storage card** is required (same as `favoriteCurrencies`).

### SPEC-020 Dividends
430. [ ] Auto-tag `paysDividends: true` when the API confirms a non-`unknown` `dividendFrequency` (≥2 regular payouts); only from `null`, never overrides a user `false`, no-op when already `true`.
431. [ ] Per-country dividend-tax picker (Settings) uses the shared `CountryDropdown` — stored map key stays the alpha-2 code.

### SPEC-034 Buy-Sell Planning
432. [ ] Cash-impact / dividend-impact header alignment **CSS bug fix** — `.impactTable th.tdRight { text-align: right }` (or drop the blanket `th { text-align: left }`) so numeric headers right-align over their values. The Phase 33l criterion already requires this; CSS specificity defeated it.
433. [ ] `simulateCashImpact()` — sells unwind buy-driven FX legs first (repay the borrowed currency, largest leg first), remainder to the sell's trade currency, so the cascade minimises **net** FX legs across the scenario.

### SPEC-017 Currency Conversion
434. [ ] `utils/iso3166.js` + shared `components/CountryDropdown.jsx` (`DE — Germany` labels, sorted by name, favorites-on-top + divider, legacy-value fallback option).
435. [ ] Favorite countries managed in Settings → General (card below favorite currencies); `settings.favoriteCountries: string[]` + `getFavoriteCountries` / `setFavoriteCountries`.
436. [ ] `migrateFavoriteCountries()` boot seed — default `['US','GB','DE','CA']`.
437. [ ] Reduce default favorite-currency seed to `['GBP','EUR','CAD','USD']` (supersedes the 14-code Phase 33 seed; `SUPPORTED_CURRENCIES` unchanged).

### SPEC-029 Stock Profile Resolution
438. [ ] HQ-country field (Edit profile + Add manual stock) uses the shared `CountryDropdown` instead of free text; stored value stays the alpha-2 code.

### SPEC-021 Stock Page
439. [ ] AI right-column widens to ⅓ of the page width at `≥ 1400px` (min 400px); fixed 400px at 1024–1399px; single-column below 1024px unchanged. *(SPEC-021's other 4 unchecked items are deferred elsewhere — news/stale-price to SPEC-027, AI-panel desktop/mobile to Phase 19b/21b.)*

---

## Phase 20 — Future asset classes (placeholder slots)

> Reserved slots in the investment-type filter so the reports UI is complete from day one. Each asset class gets its own spec round later with type-specific fields and lifecycle.
>
> **Roadmap and design questions:** see [SPEC-035 Asset class roadmap](features/SPEC-035-asset-class-roadmap.md). Suggested build order: crypto → bonds → metals storage → metals lease → options. Each graduates to its own full spec (`SPEC-036+`) before implementation begins.

220. [ ] **Options** — strike, expiry, underlying, exercise/assignment lifecycle, greeks tracking — see SPEC-035 § Options
221. [ ] **Bonds** — coupon, yield, maturity, accrued interest, amortization — see SPEC-035 § Bonds
222. [ ] **Crypto** — wallets, network transfers, cost basis (may reuse stock model) — see SPEC-035 § Crypto
223. [ ] **Precious metals (storage)** — quantity, weight unit, purity, storage cost, no yield — see SPEC-035 § Precious metals — storage
224. [ ] **Precious metals (lease)** — counterparty, lease rate, payout cadence, principal return date — see SPEC-035 § Precious metals — lease

---

## Phase 21b — Mobile Investments parity (deferred until backlog ships)

> Phase 21a (Android build pipeline) shipped in v0.34.0; the user can install rMoney on Android via a `.apk`. Phase 21b is the full mobile rewrite of the Investments-side screens. Deferred until the Tier 1–6 backlog above is shipped and the user has used the Android app long enough to confirm what's actually missing.

### SPEC-028 Mobile Investments Parity
225. [ ] Stock price chart on mobile
226. [ ] Top 5 news on mobile
227. [ ] AI evaluation on mobile
228. [ ] Full Investment reports on mobile
228a. [ ] Watchlists & alerts on mobile (SPEC-030 parity, including the Investments dropdown menu)
228b. [ ] Tauri local notifications for watchlist alerts on mobile (SPEC-030 Phase B — runtime upgrade only, data model unchanged)

---

# Release strategy

GitHub releases are tracked separately in [`RELEASE.md`](../RELEASE.md). Summary:

- **Versioning:** SemVer 0.X.Y, marked "Pre-release" on GitHub until the project is feature-complete enough for 1.0.
- **Cadence:** one tag per completed phase milestone (e.g. `v0.32.0` for the Phase 32 milestone, `v0.34.0` bundled all of Phase 33 + Phase 21a). Patch tags (`v0.X.1`, `v0.X.2`) for bug-fix-only releases between phases.
- **Platforms today:** Windows desktop (Tauri `.msi` + NSIS `.exe`) and Android (`.apk`, built via Capacitor). Linux/macOS desktop added when their build pipelines come online.
- **Process today:** fully manual local build + manual `gh release create`. GitHub Actions is documented as the next-step migration path in `RELEASE.md`.
