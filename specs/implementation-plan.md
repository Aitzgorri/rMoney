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
| 43 — Envelope transfer correctness + comma number format + UI polish | ✓ done (unreleased) | From the 10 Jun 2026 notes — all of 43a–43m shipped; see Phase 43 section below |
| 44 — Payees: report + management + autocomplete upgrade | ✓ done (unreleased) | From the 10 Jun 2026 notes (Payees chapter) — SPEC-037 (new) + SPEC-005 ext; see Phase 44 section below |
| 45 — Tree collapse UX + investing-table polish + comma amount input | ✓ done (unreleased) | From the 11 Jun 2026 notes — all 45a–45h shipped; SPEC-007/009/018/015 all done |

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

# Release strategy

GitHub releases are tracked separately in [`RELEASE.md`](../RELEASE.md). Summary:

- **Versioning:** SemVer 0.X.Y, marked "Pre-release" on GitHub until the project is feature-complete enough for 1.0.
- **Cadence:** one tag per completed phase milestone (e.g. `v0.32.0` for the Phase 32 milestone, `v0.34.0` bundled all of Phase 33 + Phase 21a). Patch tags (`v0.X.1`, `v0.X.2`) for bug-fix-only releases between phases.
- **Platforms today:** Windows desktop (Tauri `.msi` + NSIS `.exe`) and Android (`.apk`, built via Capacitor). Linux/macOS desktop added when their build pipelines come online.
- **Process today:** fully manual local build + manual `gh release create`. GitHub Actions is documented as the next-step migration path in `RELEASE.md`.
