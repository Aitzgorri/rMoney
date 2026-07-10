---
id: SPEC-016
name: Data Portability
status: in-progress
created: 2026-04-23
---

# Data Portability

## Goal
Let the user save their full app state to a single file and load it back later, so they can back up their data or keep multiple independent financial setups (e.g. their own finances vs. a family member's) on the same device. This is a backup/restore (export/import) model — not a live multi-profile switcher.

## User Stories
- As a user, I can export my full app state to an `.rmy` file saved on my device, so I have a backup I can keep anywhere (cloud sync, USB, attached to an email).
- As a user, I can load a previously-exported `.rmy` file and have it replace my current app state, so I can restore from a backup or switch between independent financial setups I manage.
- As a user, when I load a file, I see a confirmation dialog that explicitly warns my current data will be replaced, so I don't lose work accidentally.
- As a user, save and load live in the More menu, so they don't clutter the main navigation.

## Acceptance Criteria
- [x] **Save**: a "Save to file" action in the More menu opens a native OS Save As dialog, pre-filled with a default filename that includes an ISO date (e.g. `rmoney-backup-2026-04-23.rmy`), filtered to `.rmy` files. The user chooses the folder and confirms the name before the file is written.
- [x] The exported JSON includes every persistent data collection: accounts, transactions (including recurring rules and payees), envelopes (including scheduled transfers), categories, planning (planned incomes + expense tree), budgets, scheduled transfers, bills & income, investing accounts, **cash balances**, **cash movements**, stock transactions, dividends, portfolios, portfolio assignments, benchmarks, CSV-import templates, AI connection settings, **AI system prompts**, **AI chats** (per-stock conversation history with pinned-chat retention from SPEC-026), **watchlists**, **watchlist entries**, **watchlist alerts** (SPEC-030), market-data provider settings, per-stock profile overrides (manual price, HQ country, tax %, dividend estimation rule, **resolved name / exchange / currency** from SPEC-029), main-currency setting, and any other app-wide user settings. *(Investment collections not yet built are exported as empty arrays; they will be populated when those phases are implemented.)*
- [x] The exported JSON has a top-level `version` string (e.g. `"rmoney-data-v1"`) for forward compatibility, and an `exportedAt` ISO timestamp.
- [x] **Load**: a "Load from file" action in the More menu opens a native OS Open dialog filtered to `.rmy` and `.json` files (`.json` accepted so backups created before the extension change remain loadable); after a file is chosen, a confirmation dialog is shown that explicitly warns "This will replace all current data with the contents of the file. This cannot be undone." The user must confirm before the replacement happens.
- [x] On load, the file is validated: JSON parses, top-level `version` is recognized, required collections are present. Malformed or wrong-version files are rejected with a clear error message; current app state is not touched.
- [x] On a successful load, the app clears current state and hydrates from the file; the UI refreshes to reflect the loaded data.
- [x] **Two export modes** are offered in a dialog before the native Save As: **Sharable export (default)** redacts all API keys, OAuth tokens, and refresh tokens to `"[REDACTED]"` and sets `_redacted: true` on the payload; **Full backup** includes credentials as-is. The save banner message reflects which mode was used.
- [x] When a redacted backup is loaded, credentials are stripped from settings before writing (preventing `[REDACTED]` strings from landing in localStorage). A persistent notice is shown after reload: "Keys were not restored — re-enter them in Settings."
- [x] **Persisted-history collections** (`apiDividendHistory`, and any future `apiPriceHistory`) are included in **Full backup only**; excluded from Sharable export. These collections are expensive to refetch (rate-limited APIs) and have no TTL, so they travel with the full state only.
- [x] **Hot caches** (`rmoney_market_data_cache` — prices, forex, news, profile lookups) are excluded from **both** backup modes. They have short TTLs, rebuild automatically on next load, and contain no user-authored data.

### Reset data (selective wipe) *(Phase 37a)*
Beyond save/load, the user can wipe the app back to a first-install-like state while opting to carry over specific configuration islands. Useful for testing, handing the app to someone else, or starting a new financial setup from scratch on the same device. Reset is destructive and irreversible — the dialog is gated on a typed `RESET` confirmation and offers a one-click backup link before proceeding.

- [x] **"Reset data…" action in the More menu**, placed directly after "Load from file". Wired to a `ResetDataDialog`.
- [x] **The dialog** shows: a red warning header ("This permanently deletes every record in this app. Action cannot be undone."); a "Back up first…" button that opens the existing Save flow in **Full backup** mode (so credentials are preserved in the file); a list of eight preserve toggles — **all default OFF** — for the carry-over islands; a typed-confirmation input that must contain the literal `RESET` (case-sensitive) before the Reset button enables; Cancel / Reset buttons.
- [x] **Eight preserve toggles** (each independently togglable):
  1. **Market Data API keys** — preserves `settings.marketDataProviders` (enabled flags, URLs, `apiKeySet`) and the Stronghold records `marketData/<id>/apiKey` for every keyed provider.
  2. **AI API key** — preserves `settings.aiConnection` (provider name, endpoint URL, model, enabled, `apiKeySet`) and the Stronghold record `ai/apiKey`.
  3. **Envelopes structure** — preserves `rmoney_envelopes` (the tree: names, parent-child links, target balances). Envelope transfers, scheduled transfers, and any transaction-derived balance trail are wiped.
  4. **Categories structure** — preserves `rmoney_categories` (the tree: names, types, hierarchy). Budgets and the category-defaults table are wiped.
  5. **Tax setup** — preserves `settings.dividends` (default tax %, per-country tax map, default estimation rule, confirm-receipt toggle). Per-stock `taxPercentOverride` rides along only if **Stock inventory** is also kept.
  6. **Trading fees** — preserves `settings.tradingFees` (`exchanges[]`, `stocks[]`). Per-stock fee overrides on profiles ride along only if **Stock inventory** is also kept.
  7. **CSV import templates** — preserves `rmoney_csv_templates`.
  8. **Stock inventory** — preserves `rmoney_stock_profiles` (the registry: ticker, name, exchange, currency, HQ country, flags, taxPercentOverride, manualPrice) and `rmoney_manual_prices` (user-entered prices for manual stocks). The API dividend history cache (`rmoney_api_dividend_history`) is **not** preserved — it re-fetches from the provider chain on next visit.
- [x] **Mechanism**: (1) snapshot each enabled preservation bundle (localStorage values + relevant settings sub-fields + Stronghold secrets); (2) clear **every** `rmoney_*` localStorage key; (3) if **no** secrets are preserved, delete the Stronghold vault file via `deleteVaultFile()` (mimics fresh install); otherwise delete only the records for non-preserved secrets; (4) restore the snapshot — merge preserved settings sub-fields into a fresh `rmoney_settings`, restore localStorage keys, restore Stronghold records; (5) `window.location.reload()` so the app re-mounts as if freshly installed.
- [x] **Confirmation flow**: the Reset button is disabled until the user types `RESET` (literal, case-sensitive) into the confirmation field. The Cancel button is always enabled. No additional second confirmation dialog — the typed token is the second gate.
- [x] **Backup hand-off**: the "Back up first…" button closes the Reset dialog and opens the Save flow in **Full backup** mode (passphrase prompt path on Tauri with vault present). Once the file is written, the Save flow returns to the main app — the user re-opens "Reset data…" from the More menu to continue. Toggle state is not persisted across the round-trip; the user re-picks toggles after the backup. (Trade-off: keeps both flows independent and avoids inter-modal state coupling.)
- [x] **Not in scope**: there is no undo. After reset, only the user's saved backup file can restore the wiped data. The dialog text states this plainly.

### Backup format versioning + migration *(Phase 33 / Sub-phase 33n)*
- [x] **Bump format to `rmoney-data-v2`.** Implemented in `portability.js` (`VERSION = 'rmoney-data-v2'`). v2 differs from v1 in: `dividends` rows have `status / source / confirmedAt` fields; `stockProfiles` rows have `paysDividends`, `lastKnownPrice`, plus the Phase 32 fields (`isManual`, `manualPriceSource`, `confirmed`, `confirmedAt`); `settings` has `favoriteCurrencies`, `apiCacheTtl`, and `dividends.confirmReceipt`; `tradingFees.exchanges[]` / `tradingFees.stocks[]` rows have an optional `maximumFee`; new collection `manualPrices` (already shipped in v0.32.0).
- [x] **Backwards-compatible load: v1 backups load cleanly into v0.33.0+.** The loader keeps an `ACCEPTED_VERSIONS = ['rmoney-data-v1', 'rmoney-data-v2']` set; on import, `migrateBackup(parsed)` detects v1 and applies pure `migrateDividendsArrayToV2` / `migrateStockProfilesArrayToV2` / `migrateSettingsObjectToV2` helpers (exported from their respective data modules and shared with the boot-time migrations) to the parsed payload, then writes v2-shape data to localStorage. Other Phase 33 additions (`paysDividends`, `lastKnownPrice`, `apiCacheTtl`, `maximumFee`, `dividends.confirmReceipt`) are handled by the existing read-time defaults across the codebase — they need no active stamping. **Why pure helpers (not the boot wrappers):** boot-time migrations are guarded by per-key localStorage flags (`rmoney_dividends_status_migrated_v1`, etc.) which are already `1` on every existing v0.33.0+ install, so the boot wrappers would NOT re-fire when an imported v1 payload lands in localStorage.
- [x] **Forward incompatibility.** `validateImportData` rejects unknown versions. For `rmoney-data-vN` strings where `N > current`, the error message reads "This backup was saved by a newer version of rMoney. Update the app to load it." For totally unknown version strings, the error reads `Unknown file version "<version>"`. Older builds (v0.32.0) already reject v2 backups via their existing `parsed.version !== VERSION` check — the rejection message is less friendly there, but no data is lost.
- [x] **Round-trip verification.** Export a backup on a v0.33.0+ build (now `rmoney-data-v2`) → load it → confirm no data loss. Export a backup on a v0.32.0 build (`rmoney-data-v1`) → load into v0.33.0+ → confirm dividends gain `status='received'`, stockProfiles gain `confirmed`, settings gain `favoriteCurrencies`. Verified on the real app 2026-05-28 before tagging v0.34.0.
- [x] **Future bumps follow the same shape.** When v3 lands (post-Phase 33), it bumps the version, lists the field deltas in this section, adds the new version to `ACCEPTED_VERSIONS`, extends `migrateBackup` with a v2→v3 branch (and v1 chains through to v2 first), and the same forward-incompatibility message catches v3 backups loaded into v0.33.0–v0.34.x builds. *(Design rule, not implementation work — recorded here so future-you doesn't have to re-derive it.)*

#### v2 → v3 bump *(v0.35.0)*
- [x] **Bump format to `rmoney-data-v3`.** Implemented in `portability.js` (`VERSION = 'rmoney-data-v3'`, `ACCEPTED_VERSIONS = ['rmoney-data-v1', 'rmoney-data-v2', 'rmoney-data-v3']`). v3 differs from v2 in: a new `dismissedSplits` collection (`rmoney_dismissed_splits`, Phase 36d — user-curated list of API-detected splits the user dismissed; included in both backup modes); and the stockTransactions fee-currency model (Phase 35a) — `feeCurrency` on buy/sell rows, currency-exchange linkage fields `triggeredByStockTransactionId` / `linkedStockTransactionId`, and `exchangeRatesSnapshot`.
- [x] **Backwards-compatible load: v1/v2 backups load cleanly into v0.35.0+.** The v2→v3 delta is **purely additive**, so `migrateBackup` only relabels a v2 payload to v3 (no field transforms) — `importAppData` defaults the absent `dismissedSplits` to `[]`, and the existing item-291 boot migration backfills `feeCurrency` on the next load. v1 payloads chain through the v2 transforms and are labelled v3 directly. This deviates from the line-above design rule's anticipation of field transforms in a v2→v3 branch *because the actual delta needed none*.
- [x] **Forward incompatibility unchanged.** A `rmoney-data-v3` backup loaded into v0.33.0–v0.34.x is rejected with "This backup was saved by a newer version of rMoney. Update the app to load it." (those builds' `ACCEPTED_VERSIONS` stop at v2).
- [ ] **Round-trip verification (v0.35.0).** Export on v0.35.0 (`rmoney-data-v3`) → reload → confirm no data loss; export a v2 backup (v0.34.x) → load into v0.35.0 → confirm `dismissedSplits` defaults and `feeCurrency` backfills. *(To verify on the real app during the v0.35.0 smoke test before tagging.)*

#### v5 → v6 bump *(Phase 58, SPEC-039 device-sync groundwork)*
- [x] **Bump format to `rmoney-data-v6`** (`portability.js`). v6 differs from v5 in: a new **`deletions` collection** (`rmoney_deletions` — sync tombstones `{collection, id, deletedAt}`, included in both backup modes so deletions propagate between devices) and additive **`updatedAt` stamps** on records across all synced collections (written by every create/update path since Phase 58a).
- [x] **Backwards-compatible load:** the delta is purely additive — `migrateBackup` relabels v2–v5 payloads (v1 still chains through the v2 transforms); `importAppData` defaults an absent `deletions` to `[]`; records without `updatedAt` are treated as older than any stamped record by the merge engine. Forward incompatibility unchanged: v6 backups are rejected by ≤v0.38.x with the "update the app" message.
- [x] The device-local sync state (`rmoney_sync_meta` — device id, last-sync, dirty flag — and the `rmoney_sync_base` merge base) is deliberately **NOT** in the backup: each device must keep its own.

#### v6 → v7 bump *(Phase 65, SPEC-009 multiple envelope plans)*
- [x] **Bump format to `rmoney-data-v7`** (`portability.js`). v7 differs from v6 in: a new **`plans` collection** (`rmoney_plans` — named envelope plans `{id, name, createdAt, updatedAt}`, both backup modes), an additive **`planId`** on planned incomes/expenses, and the additive **`settings.activePlanId`** key (rides inside the settings blob).
- [x] **Backwards-compatible load:** purely additive — `migrateBackup` relabels v2–v6 payloads; `importAppData` defaults an absent `plans` to `[]` and then runs `ensureDefaultPlan()`, which wraps unstamped planned items into "Plan 1" and heals the active-plan id (the same idempotent migration runs on every boot). Forward incompatibility unchanged: v7 backups are rejected by older builds with the "update the app" message.

## UI / Screens
More menu gains two items:

```
More
├─ Settings
├─ Save to file      <-- new
├─ Load from file    <-- new
└─ About
```

Load confirmation dialog:

```
+----------------------------------------------+
|  Load data from file                          |
|                                               |
|  File: rmoney-backup-2026-04-12.rmy           |
|  Exported: 2026-04-12 18:03                   |
|  Version: rmoney-data-v1                      |
|                                               |
|  This will REPLACE all current app data.      |
|  This cannot be undone.                       |
|                                               |
|              [Cancel]   [Replace all data]    |
+----------------------------------------------+
```

Save confirmation (banner shown once, dismissible):

> "Saved `rmoney-backup-2026-04-23.rmy`. This file contains all your data including stored API keys — keep it private."

## Data
Reads every persistent collection in the app; writes every persistent collection. Does not introduce new data of its own except a transient "last export timestamp" that could be shown in More as "Last backup: 3 days ago" (optional, not required for this spec).

**File format:** `.rmy` — rMoney's own extension (JSON content internally). Not associated with any other known application.

**Native dialogs:** Save and Load both use `tauri-plugin-dialog` (native OS dialogs) and `tauri-plugin-fs` (file read/write). This replaces the earlier browser-download approach and lets the user choose any save location.

**File icon:** `src-tauri/icons/rmy-file.ico` — a green document with folded corner and white "r", generated by `scripts/gen-rmy-icon.py`. The `.rmy` extension is registered with the app via `bundle.fileAssociations` in `tauri.conf.json`; the OS currently shows the app icon for `.rmy` files (Tauri v2.10 does not yet support a per-association custom icon via config).

File structure:

```json
{
  "version": "rmoney-data-v3",
  "exportedAt": "2026-04-23T09:15:00.000Z",
  "accounts": [...],
  "transactions": [...],
  "envelopes": [...],
  "scheduledTransfers": [...],
  "categories": [...],
  "planning": { "incomes": [...], "expenseTree": [...] },
  "budgets": [...],
  "billsAndIncome": [...],
  "investingAccounts": [...],
  "cashBalances": [...],
  "cashMovements": [...],
  "stockTransactions": [...],
  "dividends": [...],
  "stockProfiles": [...],
  "portfolios": [...],
  "portfolioAssignments": [...],
  "benchmarks": [...],
  "csvImportTemplates": [...],
  "investmentReportPresets": [...],
  "aiSystemPrompts": [...],
  "aiChats": { "<ticker>": [...], ... },
  "watchlists": [...],
  "watchlistEntries": [...],
  "watchlistAlerts": [...],
  "settings": {
    "mainCurrency": "CZK",
    "currencyDisplay": "main",
    "aiConnection": { ... },
    "marketDataProviders": { ... },
    "dividends": { "defaultTaxPercent": 15, "perCountryTaxPercent": { ... }, "defaultAmountEstimationRule": "last-paid" }
  },

  // Full backup only — persisted history collections:
  "apiDividendHistory": [...]
}

// Sharable export omits apiDividendHistory (and any future apiPriceHistory).
// Both modes omit rmoney_market_data_cache (hot cache — rebuilds automatically).
```

## Out of Scope
- Multi-profile switching inside one running app (explicitly rejected during design review — "Interpretation A" was chosen, not B).
- Automatic periodic / scheduled backups. The user triggers save manually.
- Partial/selective export or import. Always the full state.
- Merging or diffing two files. Load always replaces.
- Cloud sync. This is local file-based only for Phase 2.
- Encrypted exports. Full backup is plain JSON; the user secures the file themselves. (Stronghold-embedded Full backup is deferred to SPEC-031 sub-phase 24e.)
- ~~Migration of older file versions to a newer format. Rejecting unknown versions is acceptable for Phase 2; migrations become their own future work when format v2 exists.~~ *(Phase 33: v2 lands with backwards-compatible v1 load support. See "Backup format versioning + migration" above.)*

## Open Questions
None.
