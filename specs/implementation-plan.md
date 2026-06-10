# Implementation Plan

> Remaining feature work, ordered by recommended implementation sequence.
> When an item is fully implemented, **remove it** from this file.
> Items are grouped by spec but ordered by cross-spec dependencies and shared-code opportunities.

**Last shipped: v0.36.0** — bundles Phase 38 (June 2026 adjustments): the 430–439 review batch (SPEC-020 dividend tweaks, SPEC-034 cash-impact header alignment, SPEC-017 currency conversion, SPEC-029 ticker resolution, SPEC-021 responsive polish) plus the same-day Buy-Sell Planning cash-impact follow-up (FX triangulation, two-column overspend, global-pass cascade ordering, held-balance currency display, End sub-cent snap). Backup format advanced to `rmoney-data-v4` (`settings.favoriteCountries`). The earlier v0.35.0 bundled Phase 34a (transaction-edit correctness), Phase 35a (cross-currency fee model), Phase 36a–g (Finnhub/Stooq adapters, API-detected splits, stock-exchange selector, default CSV template, standalone lot picker), and Phase 37a–b — backup `rmoney-data-v3`. Full sub-phase breakdown lives in `RELEASE.md` and the git history; line-by-line acceptance criteria are removed from this plan once a release is closed.

**Next up:** Phase 20 continues with the next asset class — **Crypto is shipped ([SPEC-036](features/SPEC-036-crypto-holdings.md), `done`)**; bonds → metals → options remain sketches in SPEC-035 (each graduates to its own spec before code). (Phase 21b Mobile Investments parity shipped 2026-06-02; deferred mobile items 228a/228b live in SPEC-030.)

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
| 20 — Future asset classes | crypto ✓ done | SPEC-036 Crypto holdings shipped (item 222); bonds/metals/options still placeholders in SPEC-035 |
| 21a — Android build pipeline | ✓ done | Verified on device 2026-05-28 |
| 21b — Mobile Investments parity | ✓ done (SPEC-028) | Audit found news/AI/chart-render/Reports already responsive (JS `useMediaQuery`); only chart mobile polish needed. 228a/228b moved to SPEC-030 |
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
| 38 — June 2026 adjustments | ✓ shipped in v0.36.0 | 430–439 batch + Buy-Sell cash-impact follow-up; backup → rmoney-data-v4 |
| 39 — Access / password modes | planned | SPEC-031 ext: app / keys-only / none modes + Settings → Security tab + `appStorage` wrapper (Strategy B full at-rest encryption) |

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

## Spec-reconciliation backlog (surfaced 2026-06-08)

> A doc-vs-code reconciliation pass (2026-06-08) moved most specs to `done` and ticked every built-but-unchecked criterion. It surfaced a few genuine gaps, all since closed: SPEC-019 #54 (realized P/L) and #77 (buy-triggered FX) were **built**, #27 was an intentional design the spec now matches, and SPEC-021 #35/#36 (AI panel) turned out already built (Phase 37b). The resolved notes below record each. **The only remaining open item is the SPEC-016 manual smoke test.**

### SPEC-016 Data Portability
61. [ ] **Round-trip verification (v0.35.0).** Manual smoke test — export on `rmoney-data-v3` → reload → confirm no data loss; load a v2 backup → confirm `dismissedSplits` defaults and `feeCurrency` backfills. (Verification task only; the code path is built. Likely already exercised when v0.35.0/v0.36.0 were tagged — confirm and tick, or re-run.)

### SPEC-019 Stock Transactions

> #27 (resolution save-gate) resolved 2026-06-08: spec amended to match the shipped, deliberate design — resolution is offered but optional, and unresolved stocks are confirmed later via the Stock inventory **Unconfirmed** filter (the CSV-import / offline path depends on this).
>
> #54 (realized P/L per lot) shipped 2026-06-08: `getRealizedPLByTicker` (reusing a new unfiltered `buildLots`) drives an inline expandable figure on each sell row plus a dedicated "Realized gains" section with per-currency totals on the stock page.
>
> #77 (buy-triggered FX in stock history) shipped 2026-06-08: `getTriggeredExchangesByTicker` merges cross-source-buy currency exchanges into the stock page's transaction history (date-sorted, FX-badged, in the FX filter), and the FX row renderer was fixed to read the real `sourceAmount`/`targetAmount` + cash-balance currencies. SPEC-019 now fully done.

### SPEC-021 Stock Page

> #35/#36 (right-column AI panel) resolved 2026-06-08: reconciliation found the layout slot was already built in Phase 37b (`.rightCol` sticky 400px column holding `<AiChatPanel>` at ≥1024px; widened to ⅓ at ≥1400px in Phase 38) and stacks below the content on mobile (`.body` default `flex-direction: column`). Verified on desktop + phone-width via headless Chrome. SPEC-021 now fully done — the "Deferred to Phase 19b" notes were stale.

> **Not added here (kept as a `plan:validate` warning, not an error):** SPEC-031 has 19 unchecked criteria — the bulk are the Tauri **Stronghold encryption-at-rest** items (Phase 24e), gated before wider distribution and tracked in CLAUDE.md. A focused SPEC-031 audit is a separate security-sensitive pass.


---

## Phase 38 — June 2026 adjustments (shipped in v0.36.0)

> Batch from the **01 June 2026** review notes — **implemented 2026-06-01; app compiles clean**. All ten items (430–439) are built; per-item acceptance criteria now live (checked) in their specs: SPEC-020 (430, 431), SPEC-034 (432, 433), SPEC-017 (434–437), SPEC-029 (438), SPEC-021 (439). The numbered work items were removed from this list per the "remove implemented items" rule; this stub remains only to carry the release obligation below.
>
> **Cash-impact follow-up batch (SPEC-034, 2026-06-01, also Phase 38):** a second same-day round on the Buy-Sell Planning cash-impact table, prompted by user-reported overspend/FX bugs. All built and checked in SPEC-034: (a) FX triangulation through the main currency so a held balance with no direct pair to the trade currency (e.g. GBP vs a USD buy when EUR is main) is reachable by the cascade; (b) two-column overspend — "Overspend (own cash)" (per-currency standalone) kept, plus a new "Overspend (after FX, {main})" residual consolidated into the main currency; (c) the cash cascade now runs as three **global** priority passes (all buys claim own trade-currency cash → main → others) instead of per-buy, so growing a native-currency buy correctly shrinks that currency's borrowed-out leg; (d) held-balance currencies now appear in the currency-display picker and default cash-impact table; (e) sub-cent End values snap to 0 to avoid a spurious red "-0.00"; (f) the dividend-impact aggregate is robust to a missing trade→main FX rate — a dividend-paying row in an unrated currency still contributes its yield % (approximate weighting, "~" marker) instead of being silently dropped to 0.00, with the main-currency amounts flagged partial and a footnote naming the missing pair. **No data-shape change** — all compute/display only; `displayedCurrencies` already existed in the scenario schema, so this adds **no** new backup-format obligation.
>
> **Release obligation (v0.36.0):** item 435 added a new settings key (`settings.favoriteCountries`) — a data-shape change. When v0.36.0 is cut, bump the backup format to **`rmoney-data-v4`** and update the RELEASE.md *Data compatibility* table. The key rides inside the existing `rmoney_settings` blob, so **no new Settings → Storage card** is required (same as `favoriteCurrencies`). The cash-impact follow-up batch above adds nothing further to this obligation.
>
> **Tagging note (v0.36.0):** the version-bump commit (`Release v0.36.0`, `911d63d`) landed **before** the Phase 38 dividend/UI polish commits, and the locally-built v0.36.0 installers were rebuilt to include that polish. So when the `v0.36.0` git tag is cut, **tag the tip of the Phase 38 polish work, not `911d63d`** — otherwise the tag would point at code older than the shipped installers. (User asked to record this; they'll request the tag when ready.)
>
> **Note on item 433:** no code change was needed — the existing sells-before-buys cascade in `simulateCashImpact()` already nets sell proceeds against buy FX legs (verified against the worked example: GBP £0 + EUR €1000, buy £500, sell £400 → GBP £0, EUR out only €117.65).

---

## Phase 20 — Future asset classes (placeholder slots)

> Reserved slots in the investment-type filter so the reports UI is complete from day one. Each asset class gets its own spec round later with type-specific fields and lifecycle.
>
> **Roadmap and design questions:** see [SPEC-035 Asset class roadmap](features/SPEC-035-asset-class-roadmap.md). Suggested build order: crypto → bonds → metals storage → metals lease → options. Each graduates to its own full spec (`SPEC-036+`) before implementation begins.

220. [ ] **Options** — strike, expiry, underlying, exercise/assignment lifecycle, greeks tracking — see SPEC-035 § Options
221. [ ] **Bonds** — coupon, yield, maturity, accrued interest, amortization — see SPEC-035 § Bonds
222. [x] **Crypto** — ✓ DONE: shipped as **[SPEC-036 Crypto holdings](features/SPEC-036-crypto-holdings.md)** (`done`, all 21 criteria met). Spot buy/sell/swap/wallet-transfer + lots reusing the stock model (shared `rmoney_stock_transactions` + `assetClass`; wallet = attribute; dedicated `swap` + `wallet-transfer` types; crypto fee in-coin; CoinGecko adapter + resolution; holdings view; unified Asset-movements ledger with Stocks/Crypto toggles; Investment Reports rollup + By-asset-class; backup `rmoney-data-v5`). Deferred (not v1 criteria): cross-currency sell proceeds, editing crypto buy/sell, per-wallet balances, crypto in the portfolio-history chart, staking + on-chain fee attribution.
223. [ ] **Precious metals (storage)** — quantity, weight unit, purity, storage cost, no yield — see SPEC-035 § Precious metals — storage
224. [ ] **Precious metals (lease)** — counterparty, lease rate, payout cadence, principal return date — see SPEC-035 § Precious metals — lease

### SPEC-036 Crypto holdings — ✓ shipped (2026-06-08)

All 21 acceptance criteria met (`done`). Delivered across Phase 20a–20u: asset-class-tagged lot engine (shared `rmoney_stock_transactions`); crypto buy/sell/swap/wallet-transfer with `wallet` attribute and in-coin swap fees; CoinGecko adapter + symbol→coin resolution + `cryptoProfiles` store (+ Storage card); per-account Crypto holdings view; unified **Asset movements** ledger (cash + swaps/moves, Stocks/Crypto toggles, expandable rows, edit/delete); Investment Reports rollup (total/weights + By-asset-class); backup format **`rmoney-data-v5`**. Per-step detail in the git history + [SPEC-036](features/SPEC-036-crypto-holdings.md). **Deferred (not v1 criteria):** cross-currency sell proceeds, editing crypto buy/sell, per-wallet balances, crypto in the portfolio-history chart, staking + on-chain fee attribution.

---

## Phase 21b — Mobile Investments parity (IN PROGRESS)

> Phase 21a (Android build pipeline) shipped in v0.34.0. Phase 21b closes the Investments-screen mobile gap. **Re-grounded 2026-06-02:** a code-level mobile audit (recorded in SPEC-028) found that the shared responsive components + Phase 37b already satisfy news, AI evaluation, and basic chart rendering. SPEC-028 is now `ready` with criteria rewritten to match reality. Remaining work is below.

### SPEC-028 Mobile Investments Parity — ✓ complete (2026-06-02)
All criteria met. The audit found the shared responsive components already covered news, AI evaluation, chart rendering, **and** the Investment Reports screen (it stacks below 1024px via `useMediaQuery(DESKTOP)` — the responsive work is in JS, not CSS). The only code written for this phase was the **chart mobile polish**: wrap + touch-size the period selector, and a phone-width `380×220` viewBox so axis labels stay legible (`PHONE` breakpoint added to `utils/mediaQuery.js`). See SPEC-028 for the per-criterion record.

### Moved out of Phase 21b → tracked in SPEC-030 § Mobile parity (deferred)
- 228a Watchlists & alerts on mobile, and 228b Tauri local notifications — these belong to the watchlists feature, not the Investments-screen rendering work. Still deferred.

---

## Phase 39 — Access / password modes (planned)

> Lets the user choose how the passphrase protects the app: **`app`** (whole-app, full at-rest encryption), **`keys`** (API keys only, as the vault was originally intended), or **`none`** (no password). Design lives in [SPEC-031 § Access and password modes](features/SPEC-031-security-and-secrets-handling.md). Decisions locked 2026-06-09: app mode = full at-rest encryption; engine = **Strategy B** (in-memory store behind an `appStorage` wrapper).
>
> **Touches secrets / vault — re-read SPEC-031 before each sub-phase.** Existing-vault users default to `app` mode (startup prompt preserved) with a one-time data-into-vault migration on first unlock; never silently downgraded.

Recommended sub-phase order (each is independently shippable / testable):

39a. ✓ **DONE** — **`appStorage` wrapper + migration of the data files.** Introduced `app/src/utils/appStorage.js` (sync `getItem`/`setItem`/`removeItem`/`keys`, `localStorage` pass-through). Migrated every `rmoney_*` `localStorage.*` call site (37 app-data/cache/UI-pref files). **No behaviour change.** Infra keys (`rmoney_vault_created`, `rmoney_dev_secrets`, and the future `securityMode` flag) and `secrets.js` keep raw `localStorage`; `resetData.clearRmoneyLocal` enumerates via `appStorage.keys()`. Build clean; no new lint errors.
39b. ✓ **DONE** — **`securityMode` flag + Settings → Security tab (read-only).** Added `getSecurityMode`/`setSecurityMode`/`isEncryptionAvailable` to `secrets.js` backed by a dedicated top-level `rmoney_security_mode` key (read raw, not via `appStorage` — App.jsx needs it pre-hydration; `app` mode keeps `rmoney_settings` in the vault). Unset defaults to `app` on Tauri, `none` on web/Capacitor. New read-only **Security** tab in Settings: one card per mode with the current one highlighted, a reduced-security warning for `none`, and a "desktop only" note for encrypted modes on web/mobile. Build clean; no new lint errors. (Startup-flow wiring + the one-time existing-user data migration stay in 39e.)
39c. ✓ **DONE** — **First-launch mode-selection screen.** New `SecurityModeSelect.jsx` (+ CSS module) shown only on a brand-new Tauri install (no vault *and* no explicit `securityMode` yet), offering the three modes as selectable cards with the shared `SECURITY_MODE_INFO` copy. Choosing a mode writes it via `setSecurityMode` and routes: `app`/`keys` → `PassphraseSetup` (vault creation), `none` → straight into the app (`ready`). Added `isSecurityModeSet()` to `secrets.js` so App.jsx distinguishes a fresh install from an inferred default; moved `SECURITY_MODE_INFO` into `secrets.js` (exported) so the Security tab and this screen share one source. App.jsx startup gains a `mode-select` state. Existing-vault upgrade users still default to `app` + unlock (unchanged). **Note:** `none`-mode key storage on Tauri (dev-secrets backend) is not wired until 39d — choosing `none` enters the app, but setting a key in that mode is a 39d concern. Build clean; no new lint errors.
39d. **`keys` and `none` modes (no full-data encryption yet).** Lazy vault unlock for `keys`; promote `rmoney_dev_secrets` to a first-class plaintext backend for `none`. Wire mode transitions that don't involve the data snapshot (`none↔keys`, change-passphrase).
39e. **`app` mode in-memory backend + vault data snapshot (Strategy B core).** In-memory `Map` backend for `appStorage`, hydrate-on-unlock / debounced-encrypt-on-change / drop-on-lock; `appData/snapshot` + `appData/snapshotVersion` records; one-time existing-user migration.
39f. **Remaining transitions + backup/restore integration.** `keys↔app`, `app→none`, mode-aware Forgot-passphrase copy, Full-backup vault-embed in `app` mode, Storage-tab informational note, `RELEASE.md` snapshot-version entry.

---

# Release strategy

GitHub releases are tracked separately in [`RELEASE.md`](../RELEASE.md). Summary:

- **Versioning:** SemVer 0.X.Y, marked "Pre-release" on GitHub until the project is feature-complete enough for 1.0.
- **Cadence:** one tag per completed phase milestone (e.g. `v0.32.0` for the Phase 32 milestone, `v0.34.0` bundled all of Phase 33 + Phase 21a). Patch tags (`v0.X.1`, `v0.X.2`) for bug-fix-only releases between phases.
- **Platforms today:** Windows desktop (Tauri `.msi` + NSIS `.exe`) and Android (`.apk`, built via Capacitor). Linux/macOS desktop added when their build pipelines come online.
- **Process today:** fully manual local build + manual `gh release create`. GitHub Actions is documented as the next-step migration path in `RELEASE.md`.
