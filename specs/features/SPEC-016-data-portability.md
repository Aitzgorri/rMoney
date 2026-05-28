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

### Backup format versioning + migration *(Phase 33 / Sub-phase 33n)*
- [x] **Bump format to `rmoney-data-v2`.** Implemented in `portability.js` (`VERSION = 'rmoney-data-v2'`). v2 differs from v1 in: `dividends` rows have `status / source / confirmedAt` fields; `stockProfiles` rows have `paysDividends`, `lastKnownPrice`, plus the Phase 32 fields (`isManual`, `manualPriceSource`, `confirmed`, `confirmedAt`); `settings` has `favoriteCurrencies`, `apiCacheTtl`, and `dividends.confirmReceipt`; `tradingFees.exchanges[]` / `tradingFees.stocks[]` rows have an optional `maximumFee`; new collection `manualPrices` (already shipped in v0.32.0).
- [x] **Backwards-compatible load: v1 backups load cleanly into v0.33.0+.** The loader keeps an `ACCEPTED_VERSIONS = ['rmoney-data-v1', 'rmoney-data-v2']` set; on import, `migrateBackup(parsed)` detects v1 and applies pure `migrateDividendsArrayToV2` / `migrateStockProfilesArrayToV2` / `migrateSettingsObjectToV2` helpers (exported from their respective data modules and shared with the boot-time migrations) to the parsed payload, then writes v2-shape data to localStorage. Other Phase 33 additions (`paysDividends`, `lastKnownPrice`, `apiCacheTtl`, `maximumFee`, `dividends.confirmReceipt`) are handled by the existing read-time defaults across the codebase — they need no active stamping. **Why pure helpers (not the boot wrappers):** boot-time migrations are guarded by per-key localStorage flags (`rmoney_dividends_status_migrated_v1`, etc.) which are already `1` on every existing v0.33.0+ install, so the boot wrappers would NOT re-fire when an imported v1 payload lands in localStorage.
- [x] **Forward incompatibility.** `validateImportData` rejects unknown versions. For `rmoney-data-vN` strings where `N > current`, the error message reads "This backup was saved by a newer version of rMoney. Update the app to load it." For totally unknown version strings, the error reads `Unknown file version "<version>"`. Older builds (v0.32.0) already reject v2 backups via their existing `parsed.version !== VERSION` check — the rejection message is less friendly there, but no data is lost.
- [x] **Round-trip verification.** Export a backup on a v0.33.0+ build (now `rmoney-data-v2`) → load it → confirm no data loss. Export a backup on a v0.32.0 build (`rmoney-data-v1`) → load into v0.33.0+ → confirm dividends gain `status='received'`, stockProfiles gain `confirmed`, settings gain `favoriteCurrencies`. Verified on the real app 2026-05-28 before tagging v0.34.0.
- [x] **Future bumps follow the same shape.** When v3 lands (post-Phase 33), it bumps the version, lists the field deltas in this section, adds the new version to `ACCEPTED_VERSIONS`, extends `migrateBackup` with a v2→v3 branch (and v1 chains through to v2 first), and the same forward-incompatibility message catches v3 backups loaded into v0.33.0–v0.34.x builds. *(Design rule, not implementation work — recorded here so future-you doesn't have to re-derive it.)*

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
  "version": "rmoney-data-v2",
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
