# Implementation Plan

> Remaining feature work, ordered by recommended implementation sequence.
> When an item is fully implemented, **remove it** from this file.
> Items are grouped by spec but ordered by cross-spec dependencies and shared-code opportunities.

**Last shipped: v0.37.0** (tagged, on origin) — bundles Phases 43–46 (envelope-transfer correctness + comma format, Payees, tree-collapse UX + AmountInput, Categories-page merge). **v0.38.0 is version-bumped (Phases 47–52 + the mobile-nav fix) but the git tag is not cut yet** — cut it per the RELEASE.md process when ready. The earlier v0.36.0 bundled Phase 38 (June 2026 adjustments): the 430–439 review batch (SPEC-020 dividend tweaks, SPEC-034 cash-impact header alignment, SPEC-017 currency conversion, SPEC-029 ticker resolution, SPEC-021 responsive polish) plus the same-day Buy-Sell Planning cash-impact follow-up (FX triangulation, two-column overspend, global-pass cascade ordering, held-balance currency display, End sub-cent snap). Backup format advanced to `rmoney-data-v4` (`settings.favoriteCountries`). The earlier v0.35.0 bundled Phase 34a (transaction-edit correctness), Phase 35a (cross-currency fee model), Phase 36a–g (Finnhub/Stooq adapters, API-detected splits, stock-exchange selector, default CSV template, standalone lot picker), and Phase 37a–b — backup `rmoney-data-v3`. Full sub-phase breakdown lives in `RELEASE.md` and the git history; line-by-line acceptance criteria are removed from this plan once a release is closed.

**Status:** **Phases 47–52 — the 12 June 2026 scratch-notes batch — are all ✓ done and version-bumped into v0.38.0 (tag pending)** (budgeting-side UX: frequency unification, favorites, transaction-form overhaul, scheduled-transfer display + fixes, envelope projection overhaul). A **Phase 53** gap-closure batch (from the 2026-07-08 reconciliation review of those notes) is now planned — see below. **Build order across the open phases (agreed 2026-07-09): Phase 57 (test infrastructure) ✓ done and Phase 53 (gap closure) ✓ done — next 54 → 55 → 56 (UX + bug fixes take priority over sync while the app is single-user), then 58–59 (device sync, SPEC-039), and Phase 60 (retroactive test coverage, SPEC-040) deliberately last.** Build order was foundational-first: **47 (frequency) ✓ done → 48 (favorites) ✓ done → 49 (small wins) ✓ done → 50 (envelopes scheduled list) ✓ done → 51 (transaction form) ✓ done**. The 12 June 2026 batch is complete; see the Phase 47–51 sections below. On the investing track, Phase 20 continues with the next asset class — **Crypto is shipped ([SPEC-036](features/SPEC-036-crypto-holdings.md), `done`)**; bonds → metals → options remain sketches in SPEC-035 (each graduates to its own spec before code). (Phase 21b Mobile Investments parity shipped 2026-06-02; deferred mobile items 228a/228b live in SPEC-030.)

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
| 43 — Envelope transfer correctness + comma number format + UI polish | ✓ done (unreleased) | From the 10 Jun 2026 notes — all of 43a–43m shipped; see Phase 43 section below |
| 44 — Payees: report + management + autocomplete upgrade | ✓ done (unreleased) | From the 10 Jun 2026 notes (Payees chapter) — SPEC-037 (new) + SPEC-005 ext; see Phase 44 section below |
| 45 — Tree collapse UX + investing-table polish + comma amount input | ✓ done (unreleased) | From the 11 Jun 2026 notes — all 45a–45h shipped; SPEC-007/009/018/015 all done |
| 46 — Merge Categories into "Categories & budgets" | ✓ done (unreleased) | Removed the duplicate Categories page (lossless); category management moved onto SPEC-011; SPEC-003 now data-only |
| 47 — Frequency unification (+ quarterly & bi-weekly everywhere) | ✓ done (unreleased) | From the 12 Jun 2026 notes — one shared frequency module; all 3 recurrence engines + all 3 forms aligned on weekly/bi-weekly/monthly/quarterly/yearly; SPEC-005/012/013 |
| 48 — Favorites for accounts / categories / envelopes | ✓ done (unreleased) | From the 12 Jun 2026 notes — mirrors `favoriteCurrencies`; reusable `FavoriteManager` + `splitFavorites`; feeds Dashboard list (dropdowns land in Phase 51); no backup bump (already v5); SPEC-002/003/004/008 |
| 49 — Small correctness wins (tx ordering, day-bug, Bills payee, envelope path) | ✓ done (unreleased) | From the 12 Jun 2026 notes — tx date+time order, frequency-aware scheduled next-date (fixes 16→15), Bills payee autocomplete + filter, envelope full-path in tx list (A5); SPEC-006/012/013 |
| 50 — Envelopes scheduled-transfers display + Scheduled filters | ✓ done (unreleased) | From the 12 Jun 2026 notes — collapse (default-collapsed)/day-order/one-row/projections-one-row + From/To filters; SPEC-007/012 |
| 51 — Transaction form overhaul | ✓ done (unreleased) | From the 12 Jun 2026 notes — responsive layout, favorites-in-dropdowns, account prefill, inline category create, payee→category memory, envelope full-path under dropdown (A5); 2 commits; SPEC-005/003 |
| 52 — Envelope projection overhaul | ✓ done (unreleased) | From a 12 Jun 2026 follow-up — forecast from recurring scheduled (transfers + planned items) + 3-month unscheduled average + one-time future items, over envelope + descendants; verified vs the worked example; SPEC-007/013 |
| 53 — Phase 47–52 gap closure + follow-up enhancements | ✓ done (unreleased) | All of 53a–53g shipped 2026-07-09 (each with tests per the new rule): mobile account prefill, Planning frequencies from the shared module (+ latent sync-status fix), readable Freq/Day labels, the 7-site UTC "today" sweep (incl. the Bills due-filter), shared `optionHelpers` + favorites/payee-memory in all forms, scheduled-transfer start date (+ note-drop fix), payee→envelope memory; SPEC-004/005/009/012/013 |
| 54 — notes_8 correctness + small UX wins | ✓ done (unreleased) | All of 54a–54e shipped 2026-07-09: rounding fix + repair migration, transfer From prefill, envelope-pane polish, and the full app-wide tooltip audit (~593 titles, 685/685 buttons covered); SPEC-004/005/007/009/015 |
| 55 — Bills & Income editing + confirmation overhaul | planned | From the 08 Jul 2026 notes — edit scope "from now on" default with opt-in past rewrite (+preview), no transaction-on-save bug fix, occurrence overrides (one-time vs lasting edits from Dashboard), due-pending + confirm on Dashboard, early confirm, next-period income attribution; SPEC-008/009/013 |
| 56 — Untracked accounts (envelope scope) | planned | From the 08 Jul 2026 notes — per-account "counted in envelopes" flag; boundary-crossing transfers post as envelope expense/income with auto-note; unallocated reconciliation figure; SPEC-038 (`draft`) |
| 57 — Test infrastructure (build FIRST) | ✓ done (unreleased) | Vitest 4.1.10 + `src/test/storage.js` (real in-memory backend) + 6 seed suites / 57 tests on the highest-risk engines; the 2026-07-09 CLAUDE.md testing rule is now actionable; SPEC-040 § Infrastructure |
| 58 — Device sync: groundwork + merge engine | planned | `updatedAt` stamping, tombstones, base snapshot, backup v6; pure three-way merge engine, test-first; SPEC-039 (`draft`) |
| 59 — Device sync: WebDAV transport + UX | planned | Settings Sync card (Stronghold credential + CSP host), ETag-safe sync cycle, opportunistic push + status indicator, Synology/Tailscale setup docs; SPEC-039 |
| 60 — Retroactive test coverage (planned LAST) | planned | Sweep: tests for all pre-rule features (data layer, utils, engines, historical bug classes); scope only shrinks as the testing rule covers new work; SPEC-040 § Retroactive sweep |

> Phases 40–42 (forex CSP host + Stooq historical, planned-expense value-column format, planned-expense row hover) shipped between v0.36.0 and this plan; their per-item criteria live (checked) in SPEC cross-spec / SPEC-009 and are not re-listed here per the "remove implemented items" rule.

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
39d. ✓ **DONE** — **`keys` and `none` modes (no full-data encryption yet).** `secrets.js` secret accessors now branch on `usesPlaintextSecrets()` (= `!IS_TAURI || mode==='none'`) so `none` mode stores keys in `rmoney_dev_secrets` as a first-class backend. Lazy `keys`-mode unlock via `ensureVaultOpen()` + a registered `setVaultUnlockHandler` (App.jsx shows an on-demand `PassphraseUnlock`); concurrent secret reads share one in-flight unlock prompt. Startup is mode-aware: `keys`/`none` open with **no** prompt, only `app` gates at launch. `none↔keys` transitions + change-passphrase wired via `securityTransitions.js` / `SecurityModeChange.jsx`. Build clean; no new lint errors.
39e. ✓ **DONE** — **`app` mode in-memory backend + vault data snapshot (Strategy B core).** `appStorage` swappable backend (`activateMemoryBackend`/`snapshotMemory`/`dropMemoryBackend`); `app/src/utils/appData.js` orchestrates hydrate-on-unlock (`hydrateAppStore` after `openVault`), debounced (500 ms) encrypt-on-change, flush on `visibilitychange`/`beforeunload`, and drop-on-lock. `appData/snapshot` + `appData/snapshotVersion` (= 1) records in `secrets.js`. One-time existing-user migration (`migrateLocalDataIntoVault`) clears plaintext only after a successful encrypted write; reset re-flushes the snapshot so wiped data cannot resurrect. Build clean.
39f. ✓ **DONE** — **Remaining transitions + backup/restore integration.** `keys↔app`, `app→none` in `performTransition`; mode-aware Forgot-passphrase + unlock copy (`PassphraseUnlock` `mode` prop); Full-backup vault-embed flushes the snapshot first (`flushAppStore` before `readVaultBytes`); "Encrypted at rest" Storage-tab note in `app` mode; `RELEASE.md` vault-snapshot-format subsection. Build clean; no new lint errors.

> **⚠ Verification gap:** the encrypted-mode paths (Stronghold vault, in-memory backend, all six transitions, change-passphrase) only execute in the **Tauri desktop build** and were **not runtime-tested** in this environment — only the web (`none`) build + `vite build` + ESLint were exercised. Before relying on App/Keys mode, smoke-test on a real desktop build: first-launch each mode, lock/unlock round-trip, every transition, change-passphrase (Windows file-handle behaviour for the vault re-key especially), and Full-backup → restore.

---

## Phase 43 — Envelope transfer correctness + comma number format + UI polish (planned)

> From the **10 June 2026** scratch notes. Root causes traced in code; scope agreed with the user 2026-06-10 (number format = **Tier 2: app-controlled comma**). Specs touched: SPEC-004, SPEC-007, SPEC-009, SPEC-015 (each moved to `in-progress` with the new criteria unchecked); SPEC-025 stays `done` (its `parseNumber` already handles comma — only a default flips, specced under SPEC-015 here). Items are grouped by spec below; suggested build order is 43a→43c (data correctness) first, then the format + UI polish.
>
> **Shared-code note:** all the formatting work funnels into one module — `src/utils/format.js` grows from a single `fmtAmt` into the central amount-formatter family (`fmtAmt` comma output + `round2` + signed helper). Consolidate the per-screen duplicates (`BuySellPlanning` `fmtNum`/`fmtSigned`, `DividendPage` `fmtMC`/`fmtCompact`, `InvestmentReports` `fmtMC`, `StockPage` inline `en-US`) into/through it; do not add new local money formatters. `round2` is also the fix vehicle for the `−0.00` bug — build it once (43b) and reuse it in the formatter (43h).
>
> **Release/backup note:** Phase 43 is compute/display + a data *repair* migration only — it adds **no new persisted field** and **no backup-format bump**. The migration coerces existing values in place (string → number) within the existing `rmoney_envelope_transfers` / `rmoney_envelope_scheduled` blobs.

### SPEC-004 Envelopes — transfer amount integrity ✓ done (SPEC-004 back to `done`)
43a. ✓ **DONE** — **Coerce on write.** `Number(form.amount)` in the one-time branch of `EnvelopeTransferForm`, plus a `coerceAmount` helper applied inside `updateEnvelopeTransfer` / `updateScheduledTransfer`, so no edit path can persist a string. Fixes the `NaN` *and* the silently-wrong concatenated sums (`200 + "150"` → `"200150"`) after editing a transfer.
43b. ✓ **DONE** — **Coerce on read.** `s + Number(t.amount)` for transfers-in and transfers-out in `getEnvelopeBalance`, so even a legacy string amount can never corrupt a sum — correct results before the migration runs.
43c. ✓ **DONE** — **Startup migration.** `migrateTransferAmounts()` rewrites any stored string transfer/scheduled amounts to numbers (finite-only), wired into `main.jsx` alongside `cleanupSelfScheduledTransfers`. Build + lint clean; runtime verification in the app still recommended.

### SPEC-007 Envelope List ✓ done (SPEC-007 back to `done`)
43d. ✓ **DONE** — **No `−0.00`.** Added `round2` to `format.js`; applied to envelope balances **before** the `< 0` sign check in `Envelopes.jsx` (`EnvelopeRow`, `EnvelopeNode` own + total, `EnvelopesGrandTotal`) so near-zero renders `0.00` and the spurious own-balance chip is hidden, plus the `EnvelopeHistory` balance card and running balance.
43e. ✓ **DONE** — **Desktop left-column live refresh.** `EnvelopeHistory` gained an `onDataChange` prop; its `refresh()` now also calls it; `Envelopes` passes `onDataChange={refresh}` to both `EnvelopeHistory` instances, so detail-pane edits recompute the left-hand tree balances immediately.

### SPEC-009 Planning
43f. ✓ **DONE** — **Row hover parity.** `.incomeRow:hover` / `.transferRow:hover` added and `.expenseRow:hover` contrast raised to a solid `#2a3450` in `Planning.module.css`.
43g. ✓ **DONE** — **Value-column comma format.** Landed automatically once 43h switched `fmtAmt` to comma (the columns already called `fmtAmt`). Verified in the running app.

### SPEC-015 UI Enhancements
43h. ✓ **DONE** — **Central comma formatter** (pulled forward to unblock 43g). `fmtAmt` now outputs comma decimal + narrow no-break space (U+202F) thousands always; `round2(n)` added (snap to 2dp, collapse `−0`/sub-cent to `+0`); `fmtAmt` guards against `−0.00` (rounds + `Number.isFinite` fallback). Also fixed the long-standing `no-irregular-whitespace` lint error in `format.js`. **Deferred to 43i:** the `fmtSigned` helper (lands when the per-screen formatters are consolidated and can consume it).
43i. ✓ **DONE** — **Consolidate duplicate formatters.** Added shared `fmtSigned` + `fmtPriceAmt` (and an internal `fmtFixed` core) to `format.js`. `BuySellPlanning.fmtNum`→`fmtAmt`; its local `fmtSigned` deleted in favour of the shared one; `StockPage.fmt4`→`fmtPriceAmt(n,4)`. `DividendPage.fmtMC` and `InvestmentReports.fmtMC` were already delegating to `fmtAmt`. No component reimplements the comma logic now. Build + lint clean (0 new errors vs HEAD). **Remaining (43k):** `DividendPage.fmtCompact`/`fmtTick`, `StockPage.fmtPrice` chart formatters still produce dot.
43j. ✓ **DONE** — **Ratios stay dot.** No code change needed: `fmtPct*`/`fmtRate` were never routed through `fmtAmt`. Verified `0.00%` renders with a dot next to comma amounts on Buy-Sell Planning.
43k. ✓ **DONE** — **Chart money ticks + lingering bare-`toFixed` money cells.** `DividendPage` `fmtTick`/`fmtCompact` and `StockPage` `fmtPrice` now emit comma decimals (+ narrow-space thousands for `fmtPrice` ≥1000). Benchmarks ticks are `%` and stay dot. **Verification (seeded DividendPage) surfaced extra dot-decimal money cells that were also fixed:** the dividend records table (`dividendPerShare`/`netTotal`), the Calendar→Table per-share, the day-popup per-share/net, and the Settings → Investments trading-fee min/max/sample amounts — all routed through `fmtPriceAmt`/`fmtAmt` (the percent/`feePercent` cells stay dot).
43l. ✓ **DONE** — **Envelope tree pane 40%.** `.treePane`: `width: 40%; min-width: 320px; max-width: 560px`; detail pane keeps `flex: 1`.
43m. ✓ **DONE** — **CSV import default separator.** `CsvImport` `decimalSep` now defaults to `','`; template selection still applies the template's own separator.

---

## Phase 44 — Payees: report + management + autocomplete upgrade (planned)

> From the **10 June 2026** scratch notes (Payees chapter). Scope confirmed with the user 2026-06-10: rename/merge/delete apply to **both transactions and Bills & Income planned items**; all four enhancements (per-payee summary, click-txn-to-edit, shared autocomplete component, sort/search) are in. New spec **[SPEC-037 Payees](features/SPEC-037-payees.md)** (`ready`) for the report + management screen; **SPEC-005** extended (`in-progress`) for the autocomplete upgrade and the `payeeId`→`payeeName` data-model correction.
>
> **Data-model note:** payees are free-text `payeeName` strings on transactions (not id references), plus a secondary `rmoney_payees` registry; planned items (SPEC-013) carry their own `payee` string. Management operates by **normalized name** (`trim().toLowerCase()`) and rewrites transactions + planned items + the registry together. **No id migration, no new collection, no backup-format bump** (`rmoney_payees` is already exported).
>
> **Shared-code note:** extract the payee autocomplete (currently inline in `TransactionForm`) into one reusable component and reuse it in the SPEC-037 report filter and the SPEC-007 Envelope History payee filter. Reuse the existing EnvelopeHistory filter-panel pattern for the report's date/amount/currency/envelope/account/category filters. (SPEC-037 lists ~19 acceptance criteria; the sub-phases below consolidate them — `plan:validate` will show a benign count-difference warning, as with SPEC-031.)
>
> **Suggested order:** 44a–44b (autocomplete, smallest + independent) → 44c–44f (report) → 44g (management, the riskiest) → 44h (storage card).

### SPEC-005 Transaction Entry — payee autocomplete upgrade ✓ done (SPEC-005 back to `done`)
44a. ✓ **DONE** — Payee autocomplete upgraded: `getPayeesRanked()` (most-used, tie-break recent); top-10 shown on empty focus; full keyboard nav (↑/↓, Enter/Tab select highlighted, Esc close, click); stays freely editable (Enter with no highlight keeps the typed text). Verified end-to-end.
44b. ✓ **DONE** — Extracted to shared `components/PayeeAutocomplete.jsx`, used by the transaction form and the Envelope History payee filter (and the SPEC-037 report filter when built). SPEC-005 data-model doc already corrected to `payeeName` in the Phase 44 planning commit.

### SPEC-037 Payees — report + management
44c. ✓ **DONE** — New **Payees** screen + `payees` route in `App.jsx`; entries in `BottomNav` more-menu and `TopNav` More sub-row; desktop-wide / mobile single-column.
44d. ✓ **DONE** — Report **filters**: last-12-months default + date from/until, amount range, currency, envelope, account, category — hierarchical envelope/category dropdowns with Income/Expense headers; combine + clear-filters.
44e. ✓ **DONE** — Payee **list**: derived from transaction payee strings, normalized grouping (trim + case-fold), income/expense only, `"(no payee)"` and `"Unspecified payee"` buckets, expandable/collapsible per-payee transaction lists.
44f. ✓ **DONE** — Per-payee **summary** (total paid/received, count, last-used, per currency) + **sort/search** + **click a transaction to edit** it (reuses SPEC-005 edit form).
44g. ✓ **DONE** — Payee **management**: rename (rewrites transactions + planned items + registry); rename-collision → **merge** with confirmation; **delete** → payee-less transactions + planned items (records kept) with confirmation; `"Unspecified payee"` not renamable/deletable.
44h. ✓ **DONE** — Add a **Payees card** to Settings → Storage (SPEC-026) for the existing `rmoney_payees` collection.

---

## Phase 45 — Tree collapse UX + investing-table polish + comma amount input (planned)

> From the **11 June 2026** scratch notes. Decisions locked 2026-06-11: **Envelopes** list = single-click row opens detail, double-click + left chevron toggle collapse; **Planning** expense tree = whole parent row toggles collapse; comma amount input = **full rollout** (shared component everywhere). Specs touched (each moved to `in-progress`): SPEC-007, SPEC-009, SPEC-018, SPEC-015.
>
> **Shared code — build once, reuse:**
> - **`useCollapseState(storageKey)`** hook — collapse/expand set + persistence + expand-all/collapse-all; powers both the Envelopes tree (45a/45b) and the Planning expense tree (45c/45d).
> - **`AmountInput` + `parseAmount`** (`src/components` / `src/utils/format.js`) — `type="text"` + `inputmode="decimal"`, accepts comma or dot; the single money-entry control for the whole app (45g/45h). `parseAmount` replaces ad-hoc `Number(form.amount)` for amount fields.
> - **`ConfigurableTable` `title` support** — `<th title={col.title}>`; benefits every table that uses it (45e).
>
> **Release/backup note:** display/UX + input only. The new persisted UI-pref keys (`rmoney_envelopes_collapsed`, `rmoney_planning_expanded`) are tiny prefs (like the existing per-table column configs) — **no backup-format bump**, and Storage-tab cards are optional (decide during 45b/45d).
>
> **Suggested order:** 45e/45f (investing polish — small, isolated) → 45a–45d (collapse hook + both trees) → 45g then 45h (AmountInput foundation, then the app-wide rollout — the largest, do last).

### SPEC-007 Envelope List ✓ done (SPEC-007 back to `done`)
45a. ✓ **DONE** — **Envelopes click model.** Single-click anywhere on a row (except action buttons) opens detail/history (extended from name-only, with a click-delay so a double-click can cancel it); double-click a parent row **or** the left chevron toggles collapse.
45b. ✓ **DONE** — **Persist + expand/collapse-all.** Collapsed set persisted to `localStorage` (`rmoney_envelopes_collapsed`) via the shared `useCollapseState` hook; header Expand-all / Collapse-all control.

### SPEC-009 Planning ✓ done (SPEC-009 back to `done`)
45c. ✓ **DONE** — **Whole-row toggle.** Clicking anywhere on a parent expense row (except action buttons) toggles its collapse/expand.
45d. ✓ **DONE** — **Persist + expand/collapse-all.** Expanded set persisted (`rmoney_planning_expanded`) via `useCollapseState`; Expand-all / Collapse-all control.

### SPEC-018 Investing Accounts ✓ done (SPEC-018 back to `done`)
45e. ✓ **DONE** — **Positions labels + header tooltips.** `Latest price`→`Latest Pr`, `Shares`→`Sh#`; `title` per column rendered on the `<th>` in shared `ConfigurableTable` (tooltips now available to all tables).
45f. ✓ **DONE** — **Asset-movements hover overflow.** Removed the `.movementRowClickable:hover` negative-margin bleed; verified the movements container overflow stays 0 on hover.

### SPEC-015 UI Enhancements
45g. ✓ **DONE** — **AmountInput + parseAmount.** Built `src/components/AmountInput.jsx` (`type="text"`, `inputmode="decimal"`, accepts comma or dot, sanitises input) and `parseAmount` in `format.js`. Verified end-to-end (typed `1234,56` → stored `1234.56`).
45h. ✓ **DONE** — **Roll out app-wide.** `AmountInput` replaces `<input type="number">` for every monetary field; forms parse with `parseAmount`. Non-amount inputs (shares, coin qty, %, FX rates, day-of-month) stay `type="number"`. **Part 1 (budgeting):** EnvelopeTransferForm, TransactionForm, Planning (income + expense cross-calc), Budgets, BillsAndIncome, AccountForm, EnvelopeHistory amount filter. **Part 2 (investing):** StockTxEditForms, MultiAccountDividendForm, EditProfileDialog, DividendPage, WatchlistDetail, Settings fee min/max, BuySellPlanning (cash top-up, manual adjusted price, fee cell, execute modal), InvestingAccountDetail (deposit/withdraw/exchange/buy/sell/dividend/crypto forms). Verified: comma entry stores as a Number on the transfer form and renders on the investing Buy form; build + lint clean (0 new errors across all files).

---

## Phase 46 — Merge Categories into "Categories & budgets" (done, unreleased)

> From the **12 June 2026** request: the Categories page and Category Budgets page showed the same tree. Review confirmed the only things unique to the Categories page were category **management** (create/rename/delete/add-subcategory/**drag-reparent**/**archive-built-in**). Decision (user, 2026-06-12): **move all of it** into Category Budgets so removal is lossless, then delete the Categories page.
>
> - **Category Budgets → "Categories & budgets"** (renamed everywhere): the budget tree gained per-row action buttons (✎ rename inline, ＋ add subcategory, ✕ delete / ⊘ archive built-in with successor), drag-to-reparent (+ root drop-zone), and an "+ Add {type} category" control. **Row click** = collapse/expand for parents, open the budget form for leaves. `archiveBuiltInCategory` is now reachable again from this screen.
> - **Removed** `screens/Categories.jsx` + `.module.css` and the standalone "Categories" entry from `BottomNav` / `TopNav` / `App.jsx`. The `categories.js` **data layer is untouched** (still powers every category dropdown).
> - The tree's collapse state is now **persisted** via the shared `useCollapseState` hook (`rmoney_budgets_collapsed`) — the enhancement suggested in the review.
> - Specs: SPEC-011 renamed + absorbed the management criteria; SPEC-003 keeps the data model / defaults / dropdown conventions and notes the page move. No backup-format change.
>
> Verified end-to-end (Playwright): standalone Categories tab gone; rename via ✎ updates the category; parent row-click collapses; leaf row-click opens the budget form; built-in rows show ⊘ archive; "+ Add expense category" present. Build + lint clean.

---

# Phases 47–51 — the 12 June 2026 scratch-notes batch (planned)

> Source: `scratch_notes/notes 12June2026.md`. Dependencies traced in code, scope analysed 2026-06-12. **One decision locked with the user (2026-06-12):** bi-weekly = **fortnightly on a chosen weekday, anchored to the start date** (every 14 days — *not* "Nth weekday of month").
>
> **Build order is foundational-first** so shared code is built once and reused: **47 (frequency) → 48 (favorites)** are the two foundations; **49** is independent cheap wins; **50** is self-contained; **51** is the largest and consumes both foundations. Per the project workflow, each phase's specs flip `done`→`in-progress` (and its criteria get ticked) **when that phase starts** — they are kept accurate (not pre-flipped) while these phases are still `planned`.
>
> **Open assumptions still to confirm during build (flagged, not blocking):**
> - **A1 — Favorites in hierarchical/type-filtered category & envelope `<select>`s:** render favorites as a **flat block at the top** (full name, type-matched, disabled `<option>` divider), then the normal indented type-filtered tree below — same "favorites + separator line" shape as `CurrencyDropdown`. Honours both MANDATORY conventions (hierarchy + type filter).
> - **A2 — Scheduled-transfer ordering (#5):** primary sort = day-of-month ascending for monthly/quarterly/yearly (so "1st" floats to top regardless of frequency); weekly/bi-weekly (which carry a weekday, not a day-of-month) sort among themselves by weekday and sit after the day-of-month group.
> - **A3 — Inline category creation (#14):** a "+ New category…" sentinel `<option>` that expands a tiny inline row (name + parent, type pre-set from context) and auto-selects the result — a form cannot live inside a native `<select>`.
> - **A4 — Scheduled-transfers filters (#34):** add **both** From- and To-envelope filters (no source filter exists today to sit "next to").
> - **A5 — Envelope full-path display (12 Jun 2026 follow-up request, decisions confirmed 2026-06-12):** show the selected/related envelope's full ancestor path ("Household › Food › Groceries") in the **transaction list** and as a helper line **below the envelope dropdown** in the transaction form. **Separator `›` (confirmed).** Note the transaction list does **not** show the envelope at all today (only account · category · note), so this is additive. Build one shared helper — `getEnvelopePath(id)` (root→leaf name array) + `envelopePathLabel(id, sep='›')` in `utils/hierarchy.js` (or `data/envelopes.js`, reusing `parentId`) — used by both surfaces. **Scope confirmed: envelopes only for now** — categories keep their current single-name display (the same helper could extend to them later if wanted).

---

## Phase 47 — Frequency unification (+ quarterly & bi-weekly everywhere) (planned)

> **Why first:** #20 (quarterly), #32 (bi-weekly), #36 (align options), #37 (weekday-based weekly/bi-weekly) all collapse into one job. Today there are **four divergent frequency lists** (TransactionForm `[monthly,weekly,yearly]`, EnvelopeTransferForm `[monthly,weekly]`, BillsAndIncome `[one-time,weekly,monthly,quarterly,yearly]`, `utils/frequency.js` `[monthly,quarterly,yearly]`). Everything downstream (#20 recurrence row, #32 bills bi-weekly) depends on this landing first.
>
> **Shared-code note:** grow `src/utils/frequency.js` into the single source of truth — export one ordered `FREQUENCIES` list (value + label + which day-picker it uses) and the recurrence helpers. **Three engines** must consume it, not just the dropdowns:
> 1. `data/bills.js` `getDueDates` / `getNextOccurrenceDate` (has quarterly; **add bi-weekly**),
> 2. `data/envelopes.js` `runDueScheduledTransfers` (today only understands monthly/weekly — **add quarterly + bi-weekly**, else those scheduled transfers silently never fire),
> 3. the transaction-recurrence path that seeds planned items from `TransactionForm`.
>
> **Bi-weekly model (locked):** `frequency:'biweekly'`, `dayOfExecution:0–6` (weekday) + an anchor = the item's `startDate` (first matching weekday on/after start, then +14 days). No new persisted field beyond reusing `dayOfExecution` for the weekday.
>
> **Release/backup note:** no new persisted field, no backup bump. Existing records keep their current `frequency`/`dayOfExecution` shape.

47a. ✓ **DONE** — **Shared frequency module.** `utils/frequency.js` now exports `FREQUENCIES` (ordered: one-time, weekly, bi-weekly, monthly, quarterly, yearly — each with a `dayPicker` field), `RECURRING_FREQUENCIES` (the recurring subset offered by the recurring forms), derived `FREQUENCY_LABELS`, `WEEKDAYS`/`WEEKDAYS_SHORT`/`MONTH_DAYS`, `dayPickerKind(freq)` → `'weekday' | 'month-day' | 'none'`, and a `dayLabel(freq, day)` helper. `convertAmount` + `PERIOD_LABELS` (planning period basis — intentionally still monthly/quarterly/yearly only) kept untouched. The dead, UTC-buggy `getNextOccurrenceDate(dayOfExecution)` was deleted. Also extracted `localDateStr` to `utils/dates.js` (shared by both recurrence engines). (SPEC-005/012/013)
47b. ✓ **DONE** — **Bi-weekly recurrence math.** `data/bills.js` `getDueDates` (weekly branch generalised to step 7 or 14) + `getNextOccurrenceDate` gained the `biweekly` case: anchor on the first matching weekday ≥ `startDate`, step +14 days, honour `endDate`. Verified with a standalone replication (anchor Jun 23 → Jul 7 → Jul 21 → Aug 4; next-after picks the strictly-future date; parity correct). (SPEC-013)
47c. ✓ **DONE** — **Scheduled-transfer engine.** `data/envelopes.js` `runDueScheduledTransfers` rewritten around a new `isScheduledTransferDueToday(s, today)` helper covering weekly / **bi-weekly** / monthly / **quarterly** / **yearly** (bi-weekly/quarterly/yearly anchor on the rule's `createdAt`, since scheduled transfers have no `startDate`). Its `today` key now uses `localDateStr` (no more UTC `toISOString` shift). (SPEC-012)
47d. ✓ **DONE** — **Shared options rolled into every frequency dropdown.** `TransactionForm` recurrence + `EnvelopeTransferForm` regular mode both use `RECURRING_FREQUENCIES` (so both gain bi-weekly, quarterly **and** yearly — full alignment per #36, a small superset of the originally-planned "+quarterly +bi-weekly"); `BillsAndIncome` `PlannedItemForm` uses the full `FREQUENCIES` (gains bi-weekly). Every form switches its day-picker by `dayPickerKind` and resets `dayOfExecution` when the picker kind changes (fixes a latent bug where TransactionForm's weekly recurrence used a day-of-month picker). The Envelopes-page scheduled-transfer row label (`EnvelopeHistory`) now uses the shared `dayLabel` so quarterly/yearly render correctly instead of falling through to a weekday lookup. (SPEC-005/012/013)

---

## Phase 48 — Favorites for accounts / categories / envelopes (planned)

> **Why second:** #10 (Dashboard favorite accounts), #12 (favorite accounts atop the transaction account dropdown), #21 (favorite categories + envelopes atop their dropdowns) are one mechanism. Built once, it feeds the Dashboard **and** every Phase-51 dropdown. Mirrors the shipped `favoriteCurrencies` pattern exactly ([settings.js:64](../app/src/data/settings.js), Settings drag-reorder card, backup inclusion).
>
> **Data-model note:** three ordered **ID** lists in `rmoney_settings` — `favoriteAccounts`, `favoriteCategories`, `favoriteEnvelopes`. Unlike currencies/countries they seed **empty** (`[]`) — favorites are user-specific entities, no sensible default. Getters/setters + a boot migration that defaults missing keys to `[]`; the backup loader tolerates absence. **Likely `rmoney-data-v5`** (settings gains three fields) — confirm + bump when built. No new Storage-tab collection (they live inside the already-carded `rmoney_settings`).
>
> **Shared-code note:** build one helper — `splitFavorites(items, favIds)` → `{ favorites, rest }` preserving favorite order — and one dropdown-rendering convention so accounts (flat) and categories/envelopes (per assumption A1) render consistently.

48a. ✓ **DONE** — **Settings data layer.** Getters/setters added to `data/settings.js`: `favoriteAccounts`, `favoriteEnvelopes`, and — because categories split by type — **`favoriteIncomeCategories` + `favoriteExpenseCategories`** (two lists, not one). **Deviations from the original sketch (both simplifications):** (1) **No `rmoney-data-v5` bump** — the backup format was *already* at v5 (crypto, SPEC-036); the three lists ride inside the existing `rmoney_settings` blob, which SPEC-016 already exports/imports wholesale, so the delta is additive with zero portability change. (2) **No boot migration** — unlike favorite currencies/countries (which seed real defaults) these seed **empty**, and the getters default to `[]` when the key is absent, so seeding `[]` into storage on boot would be a pointless write. (SPEC-002/003/004/016)
48b. ✓ **DONE** — **Settings management cards.** Built **one** reusable `FavoriteManager` component (drag-to-reorder + search-to-add from the app's own entities + remove, reusing the proven currency-card DnD pattern and the `favRow`/`addCurrency*` styles) instead of triplicating the card — plus a generic `FavEntityRow`. **Four** cards in the General tab: Favorite accounts (currency code tag), **Favorite income categories** + **Favorite expense categories** (split per the strict income/expense category separation — two independent lists, each scoped to its type's tree), and Favorite envelopes. Stale (archived/deleted) favorite IDs are hidden but kept in storage. (SPEC-002/003/004)
48c. ✓ **DONE** — **Dashboard account list (#10).** Account Balances now renders favorites first (favorite order) via `splitFavorites`, a subtle `favDivider` line, then the rest. (SPEC-008)
48d. ✓ **DONE** — **Shared favorites-at-top helper.** `splitFavorites(items, favoriteIds, getId?)` → `{ favorites, rest }` in `utils/favorites.js` (favorites in user order, stale IDs skipped, rest preserved). Unit-tested; consumed by the Dashboard now and ready for the Phase-51 dropdowns (which will add the disabled-`<option>` divider on top of it). (SPEC-002/003/004)

---

## Phase 49 — Small correctness wins (planned)

> Independent, cheap, low-risk — bundled so they ship without waiting on the bigger phases.

49a. ✓ **DONE** — **Transaction date+time ordering (#1).** `data/transactions.js` `getTransactions` sorts by `date` desc **then `createdAt` desc**, so the last transaction entered for a date sits at the top of that date. The existing `sortAsc` reverse in `Transactions.jsx` flips both keys. (SPEC-006)
49b. ✓ **DONE** — **Scheduled-transfer "16→15" day bug (#28) — and frequency-aware next-date.** The old `ScheduledTransfers.jsx` `nextExecutionDate` used `new Date(y,m,day).toISOString()` (UTC shift → "the 15th") **and** only understood monthly. Replaced with a new exported `nextScheduledOccurrence(s)` in `data/envelopes.js` that scans forward day-by-day **reusing the engine's own `isScheduledTransferDueToday`** — so it's correct (and local-calendar, no UTC shift) for **all** frequencies that Phase 47 added (weekly/bi-weekly/quarterly/yearly), and what the list shows as "next" always matches what actually fires. Verified `day 16 → 2026-06-16`. (SPEC-012)
49c. ✓ **DONE** — **Bills payee → autocomplete (#30).** The plain `<input>` in `BillsAndIncome.jsx` `PlannedItemForm` is now the shared `PayeeAutocomplete` (Phase 44). (SPEC-013)
49d. ✓ **DONE** — **Bills payee filter (#31).** A `PayeeAutocomplete`-based payee filter (with a clear ×) sits between the All / Income / Expense buttons and the sort select; case-insensitive substring match on the item payee. (SPEC-013)
49e. ✓ **DONE** — **Envelope full-path in the transaction list (A5).** Added shared `getEnvelopePath` / `envelopePathLabel(id, '›')` to `data/envelopes.js`; the tx list renders each non-transfer transaction's envelope as `◇ Household › Food › Groceries` in the row meta (built once from all envelopes incl. archived, so historical rows resolve). The envelope was not shown in the list before, so this is additive. (SPEC-006)

---

## Phase 50 — Envelopes scheduled-transfers display + Scheduled-transfers filters (planned)

> Self-contained UI work on the envelope detail pane ([EnvelopeHistory.jsx:260](../app/src/screens/EnvelopeHistory.jsx)) and the Scheduled-transfers screen.

50a. ✓ **DONE** — **Collapse/expand the scheduled list (#4).** The "Scheduled transfers" header is now a toggle (chevron + count badge); the list is **collapsed by default** and the state persists globally via the shared `useCollapseState` hook (`rmoney_envelopes_scheduled_expanded`, storing the *expanded* set so empty = collapsed). Hook moved above the component's early returns (rules-of-hooks). (SPEC-007/012)
50b. ✓ **DONE** — **Order by scheduled day (#5).** `schedSortKey` orders the per-envelope rows per A2: day-of-month rules (monthly/quarterly/yearly) first by day 1–28 (so the 1st floats to the top regardless of frequency), then weekday rules (weekly/bi-weekly) by weekday. (SPEC-007/012)
50c. ✓ **DONE** — **Day before frequency + desktop one-row layout (#6, #7).** Each row is now **Day · Frequency · Amount · Envelope · ›** as a single flex row on desktop (wraps on narrow screens), replacing the stacked amount/meta column. (SPEC-007/012)
50d. ✓ **DONE** — **Desktop projections on one row (#8).** `projectionGrid` switched to `repeat(auto-fit, minmax(72px, 1fr))` so all six months sit on one row on desktop and wrap on mobile; values now route through `round2` + `fmtAmt` (was bare `.toFixed(0)` — fixes a format-convention violation). (SPEC-007)
50e. ✓ **DONE** — **Scheduled-transfers From/To filters (#34).** Two hierarchical envelope dropdowns (From source / To destination, `getEnvelopesFlat` + `INDENT`) added to the Scheduled-transfers page, with a Clear button and a filter-aware empty state. (SPEC-012)

---

## Phase 51 — Transaction form overhaul (planned)

> **Largest; consumes both foundations.** #11–26 from the notes. Depends on Phase 47 (recurrence frequencies) + Phase 48 (favorites helper).

51a. ✓ **DONE** (commit 1) — **Responsive multi-row layout (#15–20).** Desktop (≥1024px): row 1 = Date (narrow) · Account · Payee; row 2 = Category · Envelope · Amount (narrow) · Currency (narrow); row 3 = Note. The shared `.row` class is now column below 1024px (single-column mobile) and flex-row above; field width ratios via inline `flex`. (SPEC-005)
51b. ✓ **DONE** (commit 1) — **Transfer form layout (#22–25).** Desktop: row 1 = Date · From · To; row 2 = Amount/Received · Fee · Currency; row 3 = Note; the cross-currency "Sent + source currency" row stays between rows 1 and 2. (SPEC-005)
51c. ✓ **DONE** (commit 2) — **Favorites in the account / category / envelope dropdowns (#12, #21).** Accounts (all three selects — account/from/to) use `splitFavorites`: favorites ★ first, divider, rest. Categories (type-scoped favorites) and envelopes show a **Favorites** `<optgroup>` then the full indented tree (A1 — favorites are a shortcut, the tree stays complete). (SPEC-005)
51d. ✓ **DONE** (commit 2) — **Account prepopulation (#13).** `TransactionForm` gained a `defaultAccountId` prop; the desktop inline new-transaction form on `Transactions.jsx` passes `filters.accountId` when an account is filtered in the left column, else the most-recent transaction's account (`txs.find(t => t.accountId)` — derived, no new storage). (SPEC-005)
51e. ✓ **DONE** (commit 2) — **Inline category creation (#14).** A `＋ New category…` sentinel option opens an inline mini-form (name + optional parent select, type from context) that creates the category via `createCategory` and selects it without leaving the form. (SPEC-005/003)
51f. ✓ **DONE** (commit 2) — **Payee → category memory (#26).** New `getRecentCategoriesForPayee` (derived from transaction history, no new storage): on payee entry with no category chosen, prefill the **last** category used for that payee (exact-name match only, so partial typing never prefills); the payee's **last 3 distinct** categories show in a "Recent for this payee" `<optgroup>` above the Favorites group. (SPEC-005)
51g. ✓ **DONE** (commit 1) — **Recurrence row + quarterly (#20).** The recurrence block already uses the Phase-47 shared options (quarterly + bi-weekly); now Name · Frequency · Day lay out on one desktop row. (SPEC-005)
51h. ✓ **DONE** (commit 2) — **Envelope full-path below the dropdown (A5).** A helper line under the envelope `<select>` shows the selected envelope's full ancestor path via `envelopePathLabel(id, '›', allEnvelopes)` — restoring the parent context a collapsed native `<select>` hides. (SPEC-005)

---

## Phase 52 — Envelope projection overhaul (planned)

> From a **12 June 2026** follow-up request. Scope confirmed with the user 2026-06-12: the envelope detail-pane **Projection** should forecast each month from **all** flows that move the envelope balance, not just scheduled transfers. **Decision (user):** "scheduled" income/expense includes **both** scheduled envelope transfers (in/out) **and** recurring Bills & Income planned items tagged to the envelope. Specs touched: **SPEC-007** (projection calculation), **SPEC-013** (tag confirmed occurrences). When this phase starts, those specs flip `done`→`in-progress`.
>
> **Today's behaviour (the bug/limitation):** `EnvelopeHistory.buildProjection` nets only **scheduled envelope transfers** (and with a latent bug — `s.amount * 52/12` treats every non-monthly frequency as weekly), ignores planned Bills & Income items + all past actuals, and looks only at the envelope itself even though the projected `balance` is `getTotalEnvelopeBalance` (envelope **+ descendants**).
>
> **Target model** (per projected month *N*, B₀ = current total balance):
> ```
> B(N) = B(N-1) + R + A + O(N)
> ```
> - **R — recurring scheduled monthly net** (applied every month): Σ over active *recurring* scheduled transfers touching the scope (+in / −out) **and** active *recurring* planned Bills & Income items tagged to the scope (+income / −expense), each converted to a **monthly equivalent** (`weekly ×52/12`, `bi-weekly ×26/12`, `monthly ×1`, `quarterly ÷3`, `yearly ÷12`).
> - **A — average unscheduled monthly net** (applied every month): over the **3 most recent complete calendar months**, sum the *actual* flows touching the scope that were **not** schedule-generated (excludes `isScheduled` transfers, `isPlanned` auto-applied tx, and confirmed-occurrence tx once tagged — see 52a), as (Σ unscheduled inflow − Σ unscheduled outflow) ÷ months-available (≤3, noted in the UI).
> - **O(N) — one-time scheduled items dated in month N** (that month only): future-dated *one-time* planned items tagged to the scope (+in / −out) and future-dated *one-time* envelope transfers (+in / −out).
> - **Scope** = envelope **+ all descendants**, matching `getTotalEnvelopeBalance`.
>
> Worked example (start 40; recurring sched +100/−50; avg unscheduled +10/−30; one-time −15 in month 2): May 40+100−50+10−30 = **70**; June 70+…−15 = **85**; July 85+… = **115**. ✓
>
> **Release/backup note:** compute/display only, **except 52a** which adds `isPlanned: true` to transactions created on confirm — additive, no backup-format bump.

52a. ✓ **DONE** — **Tag confirmed occurrences.** `confirmOccurrence` (which both the single- and bulk-confirm paths in Bills & Income call) now sets `isPlanned: true` on the transaction it creates, so manually-confirmed recurring bills are excluded from the unscheduled average (applies to occurrences confirmed from now on). (SPEC-013)
52b. ✓ **DONE** — **Monthly-equivalent helper.** `monthlyEquivalent(amount, frequency)` added to `utils/frequency.js` (weekly ×52/12, bi-weekly ×26/12, monthly ×1, quarterly ÷3, yearly ÷12; one-time/unknown → 0), replacing the `52/12`-for-everything bug. (SPEC cross-spec)
52c. ✓ **DONE** — **Projection engine.** New `utils/envelopeProjection.js` `buildEnvelopeProjection(envelopeId, months=6)` implements the R + A + O(N) model over the envelope **+ descendants**, pulling scheduled transfers + planned items (`data/bills.js`) for R/O, and past actuals (`data/transactions.js`) + one-time envelope transfers for A/O. Returns `{ series, recurringNet, avgUnscheduledNet, monthsUsed }`; empty series when there is nothing to project. `EnvelopeHistory` consumes it (replacing `netMonthlyAmount`/`buildProjection`). **Verified against the user's worked example: 70 / 85 / 115.** (SPEC-007)
52d. ✓ **DONE** — **Explainable UI.** Caption under the projection grid: "scheduled net ±X/mo · avg unscheduled ±Y/mo · based on N mo" (N = months of history actually used). (SPEC-007)

---

## Phase 53 — Phase 47–52 gap closure + follow-up enhancements (planned)

> From the **2026-07-08 reconciliation review** of `scratch_notes/notes 12June2026.md` against the shipped Phases 47–52: the batch was faithful to the notes, but five residual gaps and two enhancement opportunities surfaced. Specs flip `done`→`in-progress` per item when this phase starts, per the standard workflow.
>
> **Suggested order:** 53d (correctness, tiny) → 53c (display, tiny) → 53a (small) → 53e (medium, reuses Phase 48/51 pieces) → 53b (needs one scope decision) → 53f/53g (enhancements).

53a. ✓ **DONE** (2026-07-09) — **Account prefill on the mobile add-transaction route.** "Selected account" = the Transactions-screen account filter (clarified 2026-07-08). Implemented via a **session-only** store `utils/uiSession.js` (`get/setTxAccountFilter` — deliberately not persisted so a stale value can never disagree with the visible filter after a restart): `Transactions.jsx` mirrors its account filter into it (and seeds its filter back from it, so the filter survives the round-trip to the add screen), and `AddTransaction.jsx` passes `getTxAccountFilter() || getLastUsedAccountId()` as `defaultAccountId`. The last-used fallback was extracted to a shared `getLastUsedAccountId()` in `data/transactions.js` (newest by list order, skips transfers) and the desktop inline form now uses it too. Unit tests per the testing rule (uiSession round-trip; last-used incl. transfer-skip + empty cases); 68 tests green, build clean, 0 new lint errors (the 1 pre-existing `Transactions.jsx` hook warning predates this change — verified against HEAD). Visual once-over on a phone build still recommended. (SPEC-005/006)
53b. ✓ **DONE** (2026-07-09) — **Planning-screen frequency list → shared module.** **Scope decision: full shared set** (the cheap-by-now option — `monthlyEquivalent` and `dayPickerKind` already existed): the planned-income form consumes `FREQUENCIES` (gains weekly + bi-weekly), switches its day picker by `dayPickerKind` (weekday vs month-day, resetting on kind change per the Phase 47d pattern), and income rows use the shared `dayLabel`. `convertAmount` accepts weekly/bi-weekly as a *from* basis via `monthlyEquivalent` so summary totals count them correctly — **which also fixed a latent bug**: `expenseSyncStatus` ran a linked scheduled transfer's amount through `convertAmount(t.amount, t.frequency, 'monthly')`, so weekly/bi-weekly transfers (possible since Phase 47) were compared as if monthly, mis-reporting in-sync/out-of-sync. Tests first per the rule (weekly/bi-weekly from-basis cases + unknown-basis passthrough; red → green); 70 tests, lint + build clean. (SPEC-009)
53c. ✓ **DONE** (2026-07-09) — **Scheduled-transfers page: human-readable Freq/Day columns.** The Freq column renders `FREQUENCY_LABELS[t.frequency]` ("Bi-weekly") and the Day column `dayLabel(t.frequency, t.dayOfExecution)` ("Tuesday" / "16th", "—" when absent) instead of the raw stored values. The edit row-button also gained its `title` tooltip while being touched (tooltip rule). Display-only routing through already-tested helpers — no new tests per the SPEC-040 conventions; 70 tests, lint + build clean. (SPEC-012)
53d. ✓ **DONE** (2026-07-09) — **Residual UTC "today" defaults — swept app-wide.** A grep for the `toISOString().split('T')[0]` class found **seven** survivors, not just the two planned: the two named spots (`EnvelopeTransferForm` date default, `createEnvelopeTransfer` fallback date) **plus** `TransactionForm` TODAY, `Planning` TODAY, `InvestingAccountDetail` `today()`, and — behaviorally the most important — `BillsAndIncome` TODAY + the **due-filter `todayStr`** (near local midnight in a UTC+ zone, a bill due today was hidden from the pending/confirm list until UTC caught up). All seven now use `localDateStr()`; zero occurrences remain outside the `dates.js` doc comment. Regression test first per the rule (fake clock at 00:30 local → `createEnvelopeTransfer` default date must be the local day; red on this UTC+2 machine → green). 71 tests, build clean, 0 new lint errors (InvestingAccountDetail's 10 pre-existing problems verified identical on HEAD). (SPEC-004/013 + touches SPEC-005/009 files)
53e. ✓ **DONE** (2026-07-09) — **Favorites + payee→category memory beyond the transaction form.** The Phase 51c rendering was **extracted to a shared `components/optionHelpers.jsx`** (`accountOptions` ★+divider, `favoritesOptgroup` above-the-tree, `treeOptions` indented tree) and `TransactionForm` refactored onto it — one source of truth instead of three copies. Bills & Income `PlannedItemForm`: account select gains ★ favorites (+ currency tag, aligning with the transaction form), category select gains "Recent for this payee" + type-scoped Favorites optgroups above the tree, envelope select gains Favorites, and payee entry prefills the payee's last-used category (`getRecentCategoriesForPayee`). `EnvelopeTransferForm`: From/To selects gain the Favorites optgroup. Also ticked the SPEC-013 category-type-filter criterion that was built but never checked. Tests per the rule: `splitFavorites` (order/stale-id/custom-getter — the Phase 48d "unit-tested" claim predated any test infra) and `getRecentCategoriesForPayee` (normalized payee match, type filter, distinct newest-first, limit) — 78 tests, lint + build clean. (SPEC-004/005/013)
53f. ✓ **DONE** (2026-07-09) — **Optional start date on scheduled transfers.** `createScheduledTransfer` stores `startDate` (null = legacy); a shared `scheduleAnchor(s)` (startDate parsed with the LOCAL Date constructor, else `createdAt`) drives the bi-weekly/quarterly/yearly cadence in `isScheduledTransferDueToday`, and an explicit start date **gates every frequency** (nothing fires before it) — `nextScheduledOccurrence` and the engine inherit both automatically since they share the due-check. Regular-mode transfer form gained a "Start date (optional)" field (with `title` explainer) prefilled on edit. **Bonus fix:** the form's note was silently dropped by `createScheduledTransfer` (edits kept it) — now persisted. Tests: startDate gating (monthly + weekly), bi-weekly parity anchored on startDate *vs* createdAt (discriminating case), quarterly anchor-month override, legacy no-startDate behaviour, and the startDate/note round-trip — 83 tests, lint + build clean. Additive field, no backup bump. (SPEC-012/004)
53g. ✓ **DONE** (2026-07-09) — **Payee→envelope memory in the transaction form.** `getRecentCategoriesForPayee` was generalised into one internal `recentFieldValuesForPayee(payee, type, field, limit)` with two thin exports — categories (51f, unchanged behaviour) and the new `getRecentEnvelopesForPayee` (53g). On payee entry with no envelope chosen the last-used envelope prefills; the last 3 distinct envelopes render as a "Recent for this payee" optgroup above Favorites (de-duplicated) in the envelope dropdown. Tests: envelope-memory distinct/skip-empty/type-filter case + the category suite (now exercising the shared core) — 84 tests, lint + build clean. (SPEC-005)

---

# Phases 54–56 — the 08 July 2026 notes batch (planned)

> Source: `scratch_notes/notes_8.md` (+ the screenshot `Cestovne rodinne.png`). Code-level analysis done 2026-07-08; decisions locked with the user the same day:
> - **D1 — Edit scope:** edits to recurring planned items apply **"from now on" by default**; the user may opt in, per edit, to also rewrite past records — with a preview ("N records will be changed, since {first occurrence date}") before applying. **Past rewrite = amount only** (locked 2026-07-08); the option UI must state explicitly that only amounts change and dates/accounts/categories/envelopes/payees stay untouched.
> - **D2 — Tooltips:** every button must have a `title` tooltip — now a MANDATORY CLAUDE.md UI convention; one-time audit in 54d.
> - **D3 — "Selected account" on mobile** = the account filtered via the Transactions-screen account buttons (folded into 53a).
> - **D4 — Dashboard upcoming rows are editable:** clicking a future occurrence offers **one-time** (that occurrence only — date, amount and/or note; the series continues on its original schedule) vs **lasting** (edits the item, per D1) change, plus **skip this occurrence**. If a one-time edit sets the date to **today**, the transaction is recorded immediately — in both auto-apply and outstanding modes, since the user chose the date intentionally (no second confirmation) — and the Upcoming list moves straight to the next original-schedule occurrence (monthly → next month).
> - **D5 — Rounding** = round-to-nearest-cent (`round2`) on write, everywhere a computed amount is persisted.
> - Items #8–10 of the notes were reconciled: the "immediately recorded transaction" complaint is the Bills & Income save-path bug (55a) plus the Planning Apply-next today-dated transfer (55b); envelope renames already propagate everywhere by ID (no action — awaiting a concrete repro if the user sees a stale name).

## Phase 54 — notes_8 correctness + small UX wins (planned)

54a. ✓ **DONE** (2026-07-09) — **Planning-apply rounding (+ repair migration).** `applyExpense` rounds the computed monthly figure (`round2(convertAmount(...))`) before persisting; the data layer rounds **every** amount on write (`createEnvelopeTransfer`, `createScheduledTransfer`, `coerceAmount` for both update paths) so no path can persist >2dp; `expenseSyncStatus` compares at cent precision on both sides (else an unrounded 4.305 would read out-of-sync against its stored 4.31); and `migrateTransferAmounts` (Phase 43c) extended to repair stored sub-cent amounts as well as legacy strings — fixes the screenshot's "Balance 0,01 vs running 0,00" without re-saving records. Tests: round-on-write across all three paths + migration matrix (sub-cent / string / clean / malformed). (SPEC-009/004)
54b. ✓ **DONE** (2026-07-09) — **Transfer From-account prefill.** The transfer branch's From account uses the Phase 51d `defaultAccount` (filter → last-used); the To account now defaults to the first *different* account so the form never opens with source = destination. (SPEC-005)
54c. ✓ **DONE** (2026-07-09) — **Envelope detail-pane polish.** ⚙ filter + ↓/↑ sort buttons got `title` tooltips; detail-header ⇄ now reads "⇄ Transfer"; the left tree-pane "⇄ Transfer" passes the selected envelope as `defaultFromEnvelopeId` (was always Undistributed income); new **÷ toggle** between Transfer and filter shows "X,XX / day · N days left in period" in the Balance row (Dashboard widget formula on the total balance). Left-pane Expand/Collapse-all + Transfer buttons also got titles while touched. (SPEC-007)
54d. ✓ **DONE** (2026-07-09) — **Tooltip audit — budgeting side.** 16 files swept (incl. the **whole** Settings screen — 84 buttons — not just its General tab), **~223 tooltips added** via 4 parallel subagents with disjoint file sets, then centrally verified: brace-aware scan = **0 buttons without a tooltip** across the swept set; 86/86 tests; build clean; only the 2 known pre-existing lint errors. Convention refinement codified in CLAUDE.md + SPEC-015: an existing custom CSS tooltip (`data-tooltip`/`data-tip`) satisfies the rule and is used **instead of** `title`, never both — the three Transactions header buttons keep their styled tooltip (upgraded to state-aware wording). Known non-button gap recorded: Payees' expandable rows are clickable `<div>`s. (SPEC-015)
54e. ✓ **DONE** (2026-07-09) — **Tooltip audit — investing side.** 31 files swept via 4 parallel subagents (disjoint sets: InvestingAccountDetail+dialog cluster / StockPage+AiChatPanel+Benchmarks / dividends+reports+portfolios+inventory / BuySellPlanning+CSV+watchlists+accounts+security dialogs) — **~362 titles added**, each agent HEAD-baselined its lint. Central close-out caught **App.jsx** (8 banner/dialog buttons — in neither sweep's list) and fixed it directly. **Final: 685 buttons app-wide, 0 without a tooltip** (brace-aware scan over every .jsx); 86/86 tests; build clean; whole-app lint total 526 = the pre-sweep 527 minus the regionMap fix → zero new problems across both audits (~593 tooltips total). (SPEC-015)

## Phase 55 — Bills & Income editing + confirmation overhaul (planned)

55a. ✓ **DONE** (2026-07-09) — **Edit scope: "from now on" default + opt-in past rewrite (fixes the edit→transaction bug).** Engine: `checkAndGeneratePending` filters due dates by a new additive `generatedFrom` item field (≥, so a today-due schedule the user chose intentionally still fires); the edit save path stamps `generatedFrom = today` — schedule edits can never backfill. New `countPastConfirmedOccurrences(itemId)` → `{count, since}` and `applyAmountToPastOccurrences(itemId, amount)` (rewrites ONLY the linked transactions' amounts + the occurrences' `actualAmount`). UI: amount-changing edits of recurring items with history get the scope dialog ("From now on" primary / "Also update N past records since {date}" with the explicit amounts-only wording / Cancel); the form shows a live "Next occurrence: {date}" / "Due today — will be recorded…" line. Tests FIRST (5 red → green): backfill baseline, generatedFrom suppression, on-anchor fire, outstanding parity, count/rewrite matrix incl. fields-untouched + other-item isolation — 92 tests, lint + build clean. `generatedFrom` is additive, no backup bump. (SPEC-013)
55b. ✓ **DONE** (2026-07-09) — **Planning apply never records today.** `applyExpense` now only creates/updates the scheduled rule (the today-dated `createEnvelopeTransfer` in the `next` branch is gone); the **scope radio was removed entirely** — inspection showed its two options had converged to identical rule-updates (the spec's "override one occurrence" wording was never implemented), differing only by the buggy immediate transfer. The ApplyDialog now shows per item **when the change takes effect** ("takes effect today / {date}" via `nextScheduledOccurrence` with the item's day) and states that nothing is recorded until each rule's day. SPEC-009 apply criteria rewritten to match reality. (SPEC-009)
55c. ✓ **DONE** (2026-07-09) — **Dashboard upcoming: due-pending + inline confirm.** New shared `getDuePendingOccurrences()` in `data/bills.js` (pending + due-date-arrived + active-item join, oldest first; unit-tested incl. future/confirmed/inactive/orphan exclusions); Bills & Income's pending section refactored onto it. The Dashboard Upcoming card renders due-pending rows on top (amber "due" tag) with an inline **Confirm** (planned amount + due date, `confirmOccurrence` — its status guard makes double-clicks safe; amount/date adjustments stay on the Bills & Income page). 93 tests, lint + build clean. (SPEC-008/013)
55d. [ ] **Occurrence overrides — one-time vs lasting edits + skip (D4).** Clicking an upcoming occurrence (Dashboard card + Bills & Income Upcoming view) opens an edit offering: **one-time** — change that occurrence's **date, amount and/or note** only, stored as a per-occurrence override on the planned item (e.g. `overrides: { [originalDueDate]: { date?, amount?, note?, skipped? } }`), honoured by `getDueDates` / `getNextOccurrenceDate` / `getUpcomingOccurrences`, series unchanged — **if the overridden date is today, the transaction is recorded immediately in both modes (auto-apply AND outstanding)**: the user chose today's date intentionally, so no second confirmation step is required (locked 2026-07-08); the Upcoming list then advances to the next original-schedule occurrence; **skip this occurrence** — the occurrence is dropped without a transaction, series continues; or **lasting** — open the item edit (55a). Additive field, no backup bump. (SPEC-008/013)
55e. [ ] **Early confirmation.** Allow confirming the **next** occurrence before its due date (e.g. Sunday's payment executed Friday; estimated dates paid early): generate + confirm in one step with editable actual date/amount, from the Upcoming views. Today impossible — occurrences aren't generated until due (`getDueDates` caps at today, `bills.js:87-88`) and pending is filtered to `dueDate <= today`. (SPEC-013)
55f. [ ] **Next-period income attribution.** A flag on planned income items ("count in the **next** planning period" — e.g. wage received the 7th, period starts the 10th); generated transactions inherit it (additive tx field), the Dashboard period summary attributes accordingly and labels such income; optional per-transaction override for one-offs. Today attribution is strictly by transaction date (`Dashboard.jsx:112-123`). (SPEC-008/013)

## Phase 56 — Untracked accounts (envelope scope) (planned)

> New feature — spec created 2026-07-09: **[SPEC-038 Untracked accounts](features/SPEC-038-untracked-accounts.md)** (`draft`; review + flip to `ready` before this phase starts; the criteria below live there too). The classic off-budget concept: today no tracked/untracked flag exists (`accounts.js:33-47`) and account-to-account transfers never touch envelopes (filtered out of `getEnvelopeBalance`).

### SPEC-038 Untracked accounts — items

56a. [ ] **Account flag.** `countedInEnvelopes: bool` (default **true**; absent = true, so existing data is untouched — additive, no backup bump) on the account form + account settings. (SPEC-002 + SPEC-038)
56b. [ ] **Boundary-crossing transfers post to envelopes.** Transfer tracked→untracked: the transfer form asks which envelope takes it as an **expense**, with an auto-generated note "Transfer from {source account} to {destination account}"; untracked→tracked: recorded as envelope **income** into a user-chosen envelope; untracked↔untracked or tracked↔tracked: no envelope effect (envelope picker hidden). Engine: these postings count in `getEnvelopeBalance`. (SPEC-038)
56c. [ ] **Starting-balance seed respects the flag.** The Undistributed-income seed (`envelopes.js:215`, sum of ALL accounts' starting balances) excludes untracked accounts — otherwise envelope totals stay wrong. (SPEC-038/004)
56d. [ ] **Existing history: leave alone (proposed default).** The feature applies from when the flag is set; historical boundary-crossing transfers are not retro-posted. (Optional later enhancement: a review screen to backfill selected past transfers.) (SPEC-038)
56e. [ ] **Unallocated reconciliation figure.** A small health-check figure — tracked-accounts total minus total envelope balances — showing how much money sits outside envelopes ("unallocated"), 0 when every tracked unit is enveloped. Placement to decide during build (Envelopes page header and/or Dashboard); per-currency like the existing totals. (SPEC-038/007)

---

# Phases 57–60 — test foundation + device sync (planned 2026-07-09)

> From the device-sync design discussion (2026-07-09). Two specs created as `draft` — **[SPEC-039 Device Sync](features/SPEC-039-device-sync.md)** and **[SPEC-040 App Test Coverage](features/SPEC-040-app-test-coverage.md)** — review + flip to `ready` before their phases start. Decisions locked with the user:
> - **Priority:** sync comes **after** the Phase 53–56 UX/bug batch (app is single-user today), BUT **Phase 57 (test infrastructure) is pulled forward and built FIRST** — the new CLAUDE.md **Testing convention** (tests with every feature/fix, regression test before every bug fix, added 2026-07-09) needs a runner to exist before Phases 53–56 write any code.
> - **Sync design (SPEC-039):** WebDAV file on the user's Synology NAS (dedicated single-folder NAS user), payload = SPEC-016 backup format, client-side **three-way record-level merge** (`updatedAt` + tombstones + base snapshot; additions union; newest-wins on same-record edits, logged, no prompts) — snapshot last-writer-wins was rejected because the travel case (phone + laptop both diverging while the NAS stays home) would lose one side. Push is opportunistic and failure-tolerant ("try after each mutation"), since either device may be offline at any time. CouchDB/PouchDB and folder-sync services (Syncthing/Drive) evaluated and rejected — see the spec.
> - **Retroactive coverage (SPEC-040 § sweep) is deliberately planned LAST** (Phase 60): the going-forward rule keeps it from growing; it mops up only what predates the rule.

## Phase 57 — Test infrastructure ✓ done (2026-07-09)

57a. ✓ **DONE** — **Vitest wiring.** Vitest 4.1.10 dev-dependency in `app/`; `npm test` (watch) + `npm run test:run`; standalone `vitest.config.js` (node environment, `src/**/*.test.js`, independent of the React vite config); conventions documented in SPEC-040 § Testing conventions. (SPEC-040)
57b. ✓ **DONE** — **`appStorage` test helper.** `src/test/storage.js` (`seedStorage`/`resetStorage`/`readStorage`) activates the real Phase-39e in-memory backend — production read/write paths run against seeded storage, no localStorage mock, no browser. (SPEC-040)
57c. ✓ **DONE** — **Seed suites on the highest-risk pure logic.** 6 suites / 57 tests, all green in <1s: `format` (round2 −0-guard, fmtAmt/fmtSigned/fmtPriceAmt comma+narrow-space output, parseAmount round-trip), `frequency` (unified option set, monthlyEquivalent incl. bi-weekly ×26/12, dayPickerKind), `dates` (localDateStr local-midnight UTC class), `bills` (`getDueDates` — exported for testability — one-time/monthly-clamp/weekly/bi-weekly-anchor (Phase 47b worked example)/quarterly/yearly/endDate; `getNextOccurrenceDate` under fake timers incl. bi-weekly parity), `envelopes.scheduled` (`nextScheduledOccurrence` — exercises `isScheduledTransferDueToday` — incl. the 16→15 regression, createdAt anchoring, + storage-backed `createScheduledTransfer` round-trip proving the helper), `transactions` (Phase-49a date+entry-time ordering). Build + lint clean on all new/changed files. (SPEC-040)

## Phase 58 — Device sync: groundwork + merge engine (planned)

### SPEC-039 Device Sync — groundwork + merge

58a. [ ] **`updatedAt` stamping.** Every create/update in the data layer stamps `updatedAt`; absent = oldest. Centralized in `data/*.js` write paths. (SPEC-039)
58b. [ ] **Tombstone log.** `rmoney_deletions` (`{collection, id, deletedAt}`) written by all delete paths in synced collections; Storage-tab card; backup format → **`rmoney-data-v6`**; retention pruning once synced. (SPEC-039/016/026)
58c. [ ] **Base snapshot + sync metadata.** Last-synced snapshot stored locally as merge base; device id + last-sync + dirty flag. (SPEC-039)
58d. [ ] **Merge engine, test-first.** Pure `mergeSnapshots(base, local, remote)` → merged + change log; union adds, newest-`updatedAt` wins, tombstones beat resurrection, edit-vs-delete by timestamp; exhaustive unit suite written before any transport exists. (SPEC-039)

## Phase 59 — Device sync: WebDAV transport + UX (planned)

### SPEC-039 Device Sync — transport + UX

59a. [ ] **Settings → Sync card.** URL/user/password (password → Stronghold per SPEC-031, `webdavSet` flag, masked UI); NAS host added to CSP via the existing user-configured-host pattern; Test connection. (SPEC-039/031)
59b. [ ] **Sync cycle.** Pull → merge → ETag/`If-Match`-guarded write-back (retry on precondition failure) → base update; first-sync upload when no remote file. (SPEC-039)
59c. [ ] **Opportunistic push + status.** Debounced try-push after each mutation; silent tolerance of unreachability (persistent dirty flag; retry on mutation/app-focus/manual); status indicator (synced / pending / unreachable) + Sync now. (SPEC-039)
59d. [ ] **Cross-platform verification + setup docs.** Verified from Tauri desktop AND Android against a Synology WebDAV share over HTTPS; docs for the dedicated single-folder NAS user, WebDAV package, Let's Encrypt cert, optional Tailscale for away-from-home. (SPEC-039)

## Phase 60 — Retroactive test coverage (planned LAST)

### SPEC-040 App Test Coverage — retroactive sweep

60a. [ ] **Module inventory + sweep.** Per-module test files for all `data/*.js` and logic-bearing `utils/*.js` predating the testing rule; historical bug classes as regression tests; engines covered against the worked examples recorded in this plan/specs; coverage report + intentional gaps listed in SPEC-040. (SPEC-040)

---

# Release strategy

GitHub releases are tracked separately in [`RELEASE.md`](../RELEASE.md). Summary:

- **Versioning:** SemVer 0.X.Y, marked "Pre-release" on GitHub until the project is feature-complete enough for 1.0.
- **Cadence:** one tag per completed phase milestone (e.g. `v0.32.0` for the Phase 32 milestone, `v0.34.0` bundled all of Phase 33 + Phase 21a). Patch tags (`v0.X.1`, `v0.X.2`) for bug-fix-only releases between phases.
- **Platforms today:** Windows desktop (Tauri `.msi` + NSIS `.exe`) and Android (`.apk`, built via Capacitor). Linux/macOS desktop added when their build pipelines come online.
- **Process today:** fully manual local build + manual `gh release create`. GitHub Actions is documented as the next-step migration path in `RELEASE.md`.
