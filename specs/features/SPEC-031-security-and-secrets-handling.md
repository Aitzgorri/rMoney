---
id: SPEC-031
name: Security and secrets handling
status: ready
created: 2026-04-30
---

# Security and secrets handling

## Goal
Protect the user's secrets — market-data API keys (Massive, Twelve Data, Finnhub, Alpha Vantage), AI provider API key (SPEC-026), and the IBKR OAuth tokens (SPEC-027 deferred slot) — across the lifetime of the app, **including the moment the repository is published publicly on Git**. Establish the rules for storage, transit, logging, export, build, and source-control hygiene so a future contributor or a future Claude session can't unintentionally introduce a leak.

The app is currently localStorage-backed and Tauri-distributed; there is no server. The user is the only person who ever holds their keys. The threats this spec addresses are not "an attacker on the wire" but the realistic ones for a single-user finance app heading toward Git publication: secrets accidentally committed to the repo, secrets bundled into a backup file the user shares, and secrets surfacing in logs or screenshots the user pastes for support.

## User Stories
- As a user about to publish the source publicly, I can be confident that no API key — mine or a placeholder — is committed to the Git repository, and that the `.gitignore` blocks the obvious mistakes (data files, backup exports, editor scratch files).
- As a user, I can paste a screenshot of the Settings or DevTools state for help without my API keys appearing in clear text.
- As a user, I am warned at export time that the backup file contains my keys, so I do not casually share it.
- As a user, when I rotate or revoke a key with the upstream provider, no copy of the old key persists in caches, logs, or DOM state inside the app.
- As a future contributor cloning the repo, I can run the app without needing access to anyone else's keys — the repo runs from a clean state and I configure my own keys in Settings.

## Acceptance Criteria

### At-rest storage
- [ ] All API keys and OAuth tokens live in **Tauri's Stronghold encrypted vault** in production builds (see Encryption at rest section below). In Vite dev mode they fall back to `localStorage` because Stronghold is Tauri-only — dev mode shows a permanent banner warning that the keys are not encrypted there.
- [ ] localStorage is only used for **non-secret** provider configuration: enabled flags, the AI provider URL and model name (but not the key), provider chain ordering, OAuth client IDs (but not tokens or refresh tokens). Anything sensitive lives in Stronghold.
- [ ] Keys are never written to source files, environment files, or any disk path the project tracks.
- [ ] No `.env`, `.env.local`, `.env.production` or similar file is required by the app for normal operation. If one is ever added (e.g. for a CI test fixture), it is added to `.gitignore` in the same commit.
- [ ] The user is informed in the Settings UI of where keys live. Tauri build: "Keys are stored in an encrypted vault on this device, unlocked by your master passphrase." Vite dev: prominent banner that keys are unencrypted in dev.

### In-transit
- [ ] All provider URLs use `https://` scheme. The HTTP transport helper from SPEC-027 (`marketDataFetch`) rejects non-HTTPS URLs with a hard error.
- [ ] API keys are passed in the URL query string for providers that require it (Massive `?apiKey=`, Twelve Data `?apikey=`, Finnhub `?token=`, Alpha Vantage `?apikey=`) — this is the documented auth method for each. The query string is over TLS and is the convention these APIs publish; no further transformation is performed.
- [ ] No request is ever sent to a provider that the user has not explicitly enabled. Disabled providers do not receive even a "test connection" call until the user clicks Test.

### Logging hygiene (no key in logs)
- [x] The market-data call log (`rmoney_market_data_log`) never stores the request URL. The current implementation logs `args` (function arguments — ticker, exchange, period, etc.), `providerName`, and `reason` (error message text). Enforced by `sanitiseReason()` in `marketDataLogger.js` (strips URLs and key query params before storing) plus a DEV-mode `console.error` assertion in `logCall` that fires if the invariant is violated after sanitisation.
- [x] Each provider adapter's error path strips the URL/query string from any error message before it bubbles up. Implemented: Massive adapter catches network errors and throws `new Error('network error')` (no URL); Yahoo throws `new Error('HTTP {status}')`. `testProvider` in `marketDataClient.js` now sanitises the error via `sanitiseReason()` before re-throwing, so callers never receive a message containing URL/key material. The logger applies an additional sanitisation pass at store time.
- [ ] `console.log`, `console.error`, `console.warn` calls in the providers' code paths must not log the URL. Convention enforced in code review: no `console.*` with the variable that holds the constructed URL.
- [ ] The dev-only debug panel (SPEC-027 telemetry section) shows the call log but never reconstructs and displays the URL.

### Settings UI handling
- [ ] API key inputs are `<input type="password">` by default. A "Show" toggle reveals the value temporarily as `type="text"`. Toggling does not persist the visible state — closing and reopening the Settings tab returns the input to masked.
- [ ] After save, the input value is replaced with a fixed-length placeholder (e.g. eight bullets) so the actual length of the key is not visible — neither hint to an over-the-shoulder observer nor a screenshot.
- [ ] The "Test connection" button does not display the URL or the key in any toast or log message regardless of outcome. On success: "Connected." On failure: a short reason ("Invalid key", "Quota exceeded", "Network error") — never "Failed: GET https://api.x.com/...?apiKey=YOUR_KEY".
- [x] When the user deletes a connection (AI tab) or clears a key (Market data tab), the value is cleared from `localStorage` *and* any in-memory cache the running app holds (provider config object, recently-built fetch URLs). Implemented: clearing a market-data key now calls `clearAllMarketCaches()` (prices + news + profiles); deleting the AI connection calls `setAiConnection(null)` which removes the whole object including the key.

### Data portability (extends SPEC-016 export/import)
- [ ] Two export modes are offered: **"Full backup (includes keys)"** and **"Sharable export (keys redacted)"**. Default is the redacted mode.
- [ ] Redacted mode replaces every API key, OAuth token, refresh token with the literal string `"[REDACTED]"` and adds a top-level `"_redacted": true` flag on the export payload. Loading a redacted backup restores everything except the credentials, which the user must re-enter.
- [ ] Full backup mode keeps the explicit warning currently in SPEC-016 ("This file contains your API keys — keep it private") and additionally suggests the redacted mode in the same dialog.

### Public releases — scrap Device-Sync data (rule added 2026-07-10)
- [x] **Any public version of the app must carry no Device-Sync data.** Whenever a public artifact is prepared — release installers, a GitHub release, demo datasets, screenshots, or any backup file leaving the user's own machines — the Device-Sync configuration and state must be scrubbed: the WebDAV folder URL and username (`rmoney_settings`), the sync password (secrets store, never exportable anyway), device ids / sync state (`rmoney_sync_meta`, `rmoney_sync_base`), and the sync deletion log (`rmoney_deletions`). Installers contain no user data by construction; this rule guards every other published artifact. Enforced procedurally as **RELEASE.md → Step 5b** (also referenced from the Android flow). ⚠ Known gap recorded in SPEC-039 (Open Questions): the **Sharable (redacted) export keeps the WebDAV URL + username** because the sync payload reuses `redactExportData` — a Sharable backup from a sync-configured profile is NOT publishable without manual scrubbing until the export paths are differentiated.

### Tauri configuration (CSP)
The Content Security Policy is **single-layer** — a strict static base in `tauri.conf.json` enumerating every host the app may reach. The original design called for a runtime `<meta http-equiv="Content-Security-Policy">` injection to extend `connect-src` with the user-configured AI host, but research (Phase 36e) confirmed that when multiple CSPs are active the effective policy is their **intersection** — a meta CSP can only further restrict, never expand, the static base. Custom AI hosts therefore require either (a) a build with the host baked into the static CSP or (b) routing through the Tauri HTTP plugin (already used for Yahoo/Stooq). Phase 36e settles for (a) by locking the Settings → AI URL to a hostname allowlist; (b) is tracked as a future enhancement if user demand surfaces.

- [x] `app/src-tauri/tauri.conf.json` `app.security.csp` is set to a strict static base whose `connect-src` enumerates every host the app may reach: `'self'`, the forex-rate provider (`open.er-api.com`, SPEC-017), the market-data providers (Yahoo Finance × 2 hostnames, Polygon/Massive, Twelve Data, Alpha Vantage, Finnhub, Stooq, CoinGecko) and the two supported AI providers (`api.anthropic.com`, `api.openai.com`). `'unsafe-inline'` for styles is required by Vite's runtime style injection; everything else is locked down.
- [x] **Runtime CSP injection — abandoned (Phase 36e).** Research confirmed that meta-CSPs can only restrict, never expand, the static base when both are active. The original idea (injecting `<meta http-equiv="Content-Security-Policy">` to add a user-configured AI host) cannot work in Tauri. Instead, Settings → AI validates the endpoint hostname against an `AI_HOST_ALLOWLIST` constant kept in lockstep with the static CSP. Adding a new AI provider therefore requires a coordinated change to both `tauri.conf.json` and the allowlist constant — they are explicitly linked by comment.
- [x] **No reload toast needed.** Because the CSP is fully static, changing the AI URL within the allowlist takes effect immediately on the next AI call — no policy reload required. Adding a new provider host that isn't in the allowlist is rejected at save time with a clear error message listing the supported hosts.
- [x] Non-HTTPS AI hosts are rejected at save time in Settings → AI (existing check, reaffirmed alongside the allowlist check).
- [x] HTTP plugin allowlist (`app/src-tauri/capabilities/http.json`) is restricted to `query1.finance.yahoo.com`, `finance.yahoo.com`, and `stooq.com`. No wildcards.
- [x] **Stooq anti-bot `auth` cookie is non-secret.** Stooq's historical endpoint sits behind a proof-of-work gate (SPEC-027) that issues an `auth` cookie unlocking downloads of **public EOD data**. This cookie is not a user credential: it is cached **in-memory only** (`stooqAuth.js`), re-solved once per session, never written to localStorage, never logged, and never included in any backup or redaction map. No `secrets.js` record and no `…Set: bool` flag apply.
- [x] Existing capability set (`fs:allow-write-text-file`, `fs:allow-read-text-file`, `dialog:allow-save`, `dialog:allow-open`, `core:default`) is reviewed and confirmed minimal — these are necessary for SPEC-016 (data portability) and the dialogs around it; nothing else is added.

### Git publication readiness (the "before first push" checklist)
- [x] A **root-level `.gitignore`** exists and covers, at minimum:
  - User data files at the repo root: `*.csv`, `*.rmy`, `*.json` *(allowlisted exceptions: `package.json`, `package-lock.json`, the project's own `*.json` configs — listed explicitly in `.gitignore` with `!`)*
  - Any `.env*` file
  - `*.log`
  - Editor / OS noise: `.vscode/`, `.idea/`, `.DS_Store`, `Thumbs.db`, `*.swp`
  - Build artifacts: `node_modules/`, `dist/`, `dist-ssr/` (the existing `app/.gitignore` is left as-is and the root one delegates to it)
  - Tauri build outputs: `app/src-tauri/target/`, `app/src-tauri/gen/schemas/` (regenerated locally)
  - Local agent / scratch dirs: `.claude/projects/*/memory/`, `.obsidian/`
- [x] The existing root file `Import_test.csv` is **moved** into a `fixtures/` directory (which is not ignored — small public-safe fixtures are fine), or **deleted** before first push if it contains real personal data. Moved to `fixtures/Import_test.csv`; confirmed it contains sample stock trade data, not personal bank data.
- [x] **Commit-time secret scanning.** Pre-commit hook at `scripts/git-hooks/pre-commit` runs a regex sweep blocking commits matching key-shaped strings (32+ char alphanumeric values assigned to key-sounding names, plus `sk-ant-api03-` and `sk-` prefixes). `core.hooksPath = scripts/git-hooks` is active. Pre-push hook at `scripts/git-hooks/pre-push` runs the full audit script on every push.
- [x] **A README section on cloning and running.** Root `README.md` covers: API key configuration (stored in Settings, never committed), git hook setup (`npm run hooks:install`), the dev CORS proxy for Yahoo/Stooq, and the `.rmy`/`.csv` data-file policy.
- [x] A **one-time pre-publication audit script** at `scripts/pre-publish-audit.sh` (or `.bat`) that:
  - greps the working tree for the regex set above
  - greps `git log --all -p` for the same set
  - lists any `.csv`, `.rmy`, `.env*` files tracked by git
  - lists the contents of any `memory/` directory tracked by git
  - exits non-zero if any check fails, so the user can chain it with `git push`
- [x] Until the first public push, the repository must remain local-only. (Process rule — GitHub remote is now configured; all checklist items above were verified before first push.)

### Caches and DOM
- [x] None of the caches in SPEC-027 (`priceCache`, `forexCache`, `newsCache`, `profileCache`) ever store the API key, the URL, or any provider-specific identifier that would re-derive the key. They store the *response*, keyed by `ticker`/`pair`/etc. Verified: price cache stores `{price, currency, asOf, providerName, fetchedAt}`; news stores `{items, fetchedAt}`; profile stores `{name, exchanges, hqCountry, currency, providerName}`; forex/rates cache stores `{baseCurrency, rates, fetchedAt}`. Invariant comment added to `marketDataCache.js`.
- [ ] The DOM never contains the key as a data-* attribute, in a hidden field, or in a `value` attribute of an unmounted `<input>`. After save, the displayed input value is the placeholder bullets — not the cleared real key with the field merely styled black.

### Encryption at rest (Tauri builds)
The app holds credentials that can move money (IBKR OAuth tokens) and consume paid quotas (provider API keys). Plaintext localStorage means anyone with read access to the device's user-account files — malware running as the user, an unattended unlocked laptop, a forensic disk image, or a cloud-synced AppData folder — gets every credential. Tauri's **`tauri-plugin-stronghold`** provides an AES-256-encrypted vault unlocked by a user-supplied passphrase; this is the standard answer in the Tauri ecosystem for sensitive client-side secrets.

- [x] `tauri-plugin-stronghold` is added as a Tauri plugin and registered in `Cargo.toml` + `lib.rs`. SHA-256 KDF registered in Rust builder. Capability file `capabilities/stronghold.json` created. Vault file at OS app-data path via `appDataDir()` from `@tauri-apps/api/path`.
- [x] **First-launch flow:** `PassphraseSetup.jsx` — modal with passphrase + confirmation fields, minimum 12 characters enforced, "Create vault" calls `openVault(passphrase)` then runs migration. Detected by absence of the `rmoney_vault_created` localStorage flag (not by file-system check, which requires extra capabilities).
- [x] **Existing-user migration:** `migrateKeysToVault()` in `secrets.js` — on first vault creation, reads `rmoney_settings`, moves each raw `apiKey` under `marketData/{id}/apiKey` and `ai/apiKey` into Stronghold, replaces with `apiKeySet: true`, saves cleaned settings back to localStorage.
- [x] **Subsequent-launch flow:** `PassphraseUnlock.jsx` — every app start shows passphrase prompt before main UI renders. 3 incorrect attempts → form is locked with error message directing user to close the app or reset the vault. Successful unlock proceeds to main app; passphrase string is never stored beyond the function call.
- [x] **Vault record naming:** `marketData/<providerId>/apiKey`, `ai/apiKey`. `secrets.js` exposes `getSecret(key)` / `setSecret(key, value)` / `deleteSecret(key)`. The module caches the open `_stronghold` and `_store` at module level for the session lifetime (fetched once per unlock, not once per call).
- [x] **localStorage discipline:** `getMarketDataProviders()` returns `{ ..., massive: { enabled, apiKeySet: bool }, ... }` — no raw key material. `getAiConnection()` returns `{ ..., apiKeySet: bool }`. Both setters strip any residual `apiKey` string via destructuring before persisting. Provider adapters receive the key via `buildProviderCfg(id, cfg)` which fetches from vault per call.
- [x] **Settings UI:** "Show key" fetches from Stronghold on click, displays in a text input while toggled on, clears on "Hide". Market data and AI key sections both use the mask/show/change pattern. Keys in `mdRevealedKey` and `aiRevealedKey` are local state that clears when hidden.
- [x] **Backup export integration with SPEC-016:** *(item 241a, shipped in Sub-phase 33n alongside the rmoney-data-v2 bump)*
  - **Sharable export (default):** unchanged — every key field is replaced with `"[REDACTED]"`, vault contents are not exported. `redactExportData` also defensively `delete`s any `_strongholdVault` field.
  - **Full backup:** clicking Save on the Full Backup option opens `FullBackupPassphrasePrompt`. `verifyPassphrase(passphrase)` in `secrets.js` attempts a fresh `Stronghold.load` against the current vault file and returns true/false without disturbing the open session handle. On success, `readVaultBytes()` flushes any pending writes via `_stronghold.save()` and reads the on-disk snapshot via `@tauri-apps/plugin-fs#readFile`; the bytes are base64-encoded and written to `_strongholdVault` on the payload.
  - **Restore:** `App.handleLoadConfirm` detects `_strongholdVault` (Tauri only), decodes the base64, and calls `writeVaultBytes(bytes)` which writes the snapshot to the destination's appData vault path and sets `rmoney_vault_created`. The subsequent `window.location.reload()` lands on the existing `PassphraseUnlock` screen so the user enters the backup's master passphrase to open the restored vault.
  - **Scope limit:** vault embed is Tauri-only. Capacitor/dev-mode Full Backups carry no vault (keys live in `rmoney_dev_secrets` which is excluded from backups by design — dev mode is untrusted per the general SPEC-031 rule). `_strongholdVault` in a backup loaded on Capacitor is silently ignored.
  - **Tauri capabilities:** binary file ops added to `capabilities/default.json` — `fs:allow-read-file`, `fs:allow-write-file`, `fs:allow-exists`, `fs:allow-mkdir`, scoped to `$APPDATA/vault.hold` and `$APPDATA`.
- [x] **Vite dev fallback:** when the app detects it is running outside Tauri (`!window.__TAURI_INTERNALS__`), `secrets.js` falls back to `rmoney_dev_secrets` in localStorage. App.jsx renders a persistent dark-orange banner: "Dev mode — API keys are stored in plain text (localStorage). Not for real credentials."
- [x] **Forgotten-passphrase recovery:** `PassphraseUnlock.jsx` "Forgot passphrase?" link → confirmation screen explaining all keys will be lost → clears `apiKeySet` flags in localStorage → calls `deleteVaultFile()` → transitions to `PassphraseSetup`.
- [x] **Memory hygiene:** market data keys are fetched inside `buildProviderCfg()` per call and not retained; AI keys are fetched inside `sendRequest()` / `callAi()` per request. The module-level `_store` reference holds the Stronghold session, not the plaintext keys.

### Access and password modes (Phase 39)

Until now the passphrase was **mandatory on every Tauri launch** and protected **only the API keys** (all financial data stayed in plaintext `localStorage`). Phase 39 makes the passphrase a **user choice between three modes**, configured in a new **Settings → Security** tab and chosen at first launch. This section *amends* the "First-launch flow" / "Subsequent-launch flow" criteria above: those describe the behaviour of the `app` mode specifically; they are no longer unconditional.

#### The three modes

- **`app` — password protects the whole app (full at-rest encryption).** A passphrase is required at startup before any screen renders. The Stronghold vault holds **both the API keys and an encrypted snapshot of all app data** (`rmoney_*` collections). While the app is open, the decrypted data lives **in memory only** — never written to disk in plaintext (Strategy B, see below). This is the strongest mode and the only one that protects against a stolen/imaged disk.
- **`keys` — password protects API keys only.** The app opens immediately with **no prompt**. The vault is unlocked **lazily** the first time a key is actually needed (revealing/changing a key in Settings, or the first market-data / AI request). Financial data stays in plaintext `localStorage`, as it is today. This matches the *stated purpose* of the original vault design.
- **`none` — no password anywhere.** No vault, no prompt. API keys are stored unencrypted in `localStorage` (the existing `rmoney_dev_secrets` mechanism, promoted to a first-class storage backend). Clearly flagged in the UI as the lowest-security option. This is also the only mode available on non-Tauri builds (Vite dev, Capacitor Android), because Stronghold is Tauri-only.

#### Storage architecture (Strategy B — in-memory store behind a wrapper)

- [x] A single **`appStorage` module** (`app/src/utils/appStorage.js`) is introduced with a synchronous `getItem` / `setItem` / `removeItem` / `keys` API mirroring `localStorage`. **All 38 files** that currently call `localStorage.*` for `rmoney_*` keys are migrated to import and use `appStorage` instead. (Non-`rmoney_*` infrastructure keys — the vault-created flag, the security-mode flag itself, dev-secrets — keep raw `localStorage` access because they must be readable *before* the store is hydrated.) **Shipped in Phase 39a** as a pass-through to `localStorage` (no behaviour change): all 37 app-data/cache/UI-pref files migrated; `secrets.js` (vault infra) and the `rmoney_vault_created` write in `resetData.js` deliberately keep raw `localStorage`. `resetData.clearRmoneyLocal` now enumerates via `appStorage.keys()`. Build clean; no new lint errors.
- [x] `appStorage` has a **swappable backend** selected by the active `securityMode`:
  - `none` / `keys` modes → backend is plain `localStorage` (today's behaviour; zero functional change).
  - `app` mode → backend is an **in-memory `Map`**, hydrated from the decrypted vault snapshot on unlock and flushed back (encrypted, debounced) on every mutation. The plaintext snapshot is **never** written to `localStorage` or disk. **Shipped in Phase 39e:** `appStorage.js` gains `activateMemoryBackend` / `snapshotMemory` / `dropMemoryBackend` / `isMemoryBackendActive`; orchestration lives in `app/src/utils/appData.js`.
- [x] In `app` mode the full snapshot is persisted as a **single Stronghold record** (`appData/snapshot`, a JSON blob of all `rmoney_*` key/values) alongside the existing per-key secret records, with `appData/snapshotVersion` (= 1). Writes are debounced (500 ms via `appData.scheduleFlush`) and also flushed on `visibilitychange` hidden / `beforeunload` (`installAppStoreLifecycle`) and before reads of the vault for Full backup. (`saveDataSnapshot`/`loadDataSnapshot` in `secrets.js`.)
- [x] On lock or app close in `app` mode, the in-memory map is dropped (`lockAppStore` / `dropMemoryBackend`); nothing decrypted remains. A subsequent launch shows the unlock screen and re-hydrates only after a correct passphrase (`hydrateAppStore` after `openVault`).

#### Mode selection and transitions

- [x] **First launch (new install):** a mode-selection screen offers the three modes with a one-line security summary each. Choosing `app` or `keys` proceeds to passphrase creation (reusing `PassphraseSetup`, min. 12 chars); choosing `none` proceeds straight into the app. The chosen mode is written to `securityMode`. **Shipped in Phase 39c:** new `SecurityModeSelect.jsx` shown only when there is no vault *and* `isSecurityModeSet()` is false (a brand-new Tauri install); App.jsx gains a `mode-select` startup state and a `handleModeChosen` router. The mode cards reuse `SECURITY_MODE_INFO`, now exported from `secrets.js` and shared with the Settings → Security tab. (`none`-mode key storage on Tauri lands with the backend wiring in 39d.)
- [x] **Existing vault users (upgrade):** users who already have a vault (`rmoney_vault_created`) are defaulted to **`app` mode** so their current "passphrase asked at startup" experience is preserved — *and* on the first unlock after upgrade, a one-time migration encrypts all existing `rmoney_*` data into the vault snapshot and clears the plaintext copies. They are never silently downgraded to a mode with no startup prompt. **Shipped in Phase 39e:** `getSecurityMode()` infers `app` for an existing vault; `hydrateAppStore` runs `migrateLocalDataIntoVault` the first time (no snapshot present) and loads the snapshot thereafter.
- [x] **Settings → Security tab** lets the user switch modes at any time. Every transition that changes what the passphrase protects requires confirming the **current passphrase** (to read/decrypt) and, when a vault is being created, setting a **new passphrase**. **Shipped in Phases 39d (`none↔keys`, change-passphrase) and 39f (`keys↔app`, `app→none`):** orchestrated by `app/src/utils/securityTransitions.js` (`performTransition`) and driven by the `SecurityModeChange.jsx` dialog; each transition records the new mode and reloads so App.jsx re-establishes the correct startup state.
  - `none → keys`: create vault, move plaintext keys into it.
  - `none → app`: create vault, encrypt all data + keys into it, enable startup gate.
  - `keys → app`: encrypt all data into the existing vault, enable startup gate.
  - `keys → none`: decrypt keys out to plaintext, delete vault.
  - `app → keys`: decrypt all data back to plaintext `localStorage`, keep keys in vault, disable startup gate (drops the vault snapshot record).
  - `app → none`: decrypt everything to plaintext, delete vault.
  - **Change passphrase** (within `app` or `keys`): re-key the vault via `changePassphrase` (read all records, `unload`, delete file, recreate with the new passphrase, re-insert); old passphrase required.
- [x] The Security tab states the current mode, what it protects, and (for `none`) a prominent reduced-security warning. On non-Tauri builds the tab shows only `none` as available, with a note that encryption requires the desktop build. **Shipped in Phase 39b** as a read-only tab (one card per mode, current highlighted); switching/passphrase actions land in 39d–39f.

#### Backup / restore and other integrations

- [x] **Sharable export** is unchanged in all modes: it reads the current (decrypted, in-memory in `app` mode) data through `appStorage`, redacts keys, writes plaintext JSON. Works because the data is decrypted in memory during the session. (No code change needed — `portability.exportAppData` already reads through `appStorage`.)
- [x] **Full backup** in `app` mode embeds the encrypted vault (existing `_strongholdVault` path) — which now also carries the data snapshot — so a restore reconstructs everything behind the same passphrase. In `keys` mode it behaves as today (vault carries keys only; data rides in the plaintext payload). In `none` mode there is no vault to embed. **Shipped in Phase 39f:** `App.handlePassphraseConfirmed` calls `flushAppStore()` before `readVaultBytes()` so the embedded vault carries the latest snapshot.
- [x] The `securityMode` flag is a **dedicated top-level `rmoney_security_mode`** localStorage key, read raw (never through `appStorage`) because App.jsx must read it *before* the store is hydrated and, in `app` mode, the `rmoney_settings` blob itself lives encrypted in the vault. It is a non-secret infrastructure flag (same class as `rmoney_vault_created`), so **no new Settings → Storage card** is required. (Shipped in Phase 39b: `getSecurityMode` / `setSecurityMode` / `isEncryptionAvailable` in `secrets.js`; unset defaults to `app` on Tauri, `none` on web/Capacitor.) The encrypted vault snapshot is not a `localStorage` collection and is represented in the Storage tab only as an informational note, not a deletable card. **Shipped in Phase 39f:** an "Encrypted at rest" card appears at the top of the Storage tab in `app` mode explaining that on-disk data is a single encrypted snapshot, not the individual collections listed below.
- [x] **Forgot-passphrase** in `app` mode is far more destructive than in `keys` mode (it loses **all data**, not just keys). The reset confirmation copy is mode-aware and spells this out explicitly before proceeding. **Shipped in Phase 39f:** `PassphraseUnlock` takes a `mode` prop; the reset and main-unlock copy switch between "deletes ALL your data" (`app`) and "deletes all stored API keys" (`keys`).

#### Migration / compatibility note

- [x] The full-data snapshot inside the vault is versioned (`appData/snapshotVersion`) so the in-vault format can evolve independently of the on-disk backup format (`rmoney-data-vN`). Document the version alongside the backup-format table in `RELEASE.md` when Phase 39 ships. **Shipped in Phase 39f:** `SNAPSHOT_VERSION = 1` in `secrets.js`; documented in the "Vault snapshot format" subsection of `RELEASE.md`.

### Future-state markers
- [ ] When cloud sync ships (post-Phase 2 in `project goal.md`): the Stronghold vault file itself is what syncs across devices; the cloud backend never sees plaintext keys. **Do not begin cloud sync without revisiting this spec.**
- [ ] When multi-user ships (post-Phase 2): each user has a separate Stronghold vault, separate passphrase, never shared. Same revisit-this-spec rule.

## UI / Screens

The acceptance criteria above are the substantive UI changes (masking, "Show" toggle, length-hiding placeholder, redacted-vs-full export choice, subtitle warnings). No dedicated security screen.

Settings → AI tab and Settings → Market data tab gain a small subtitle paragraph beneath the heading:

```
Market data providers
Keys are stored locally on this device's app storage. They never leave
your device unless you share a backup file or screenshot.
```

Data portability "Save backup" dialog gains the redacted/full radio:

```
Save backup
  [●] Sharable export (recommended) — keys are removed
  [○] Full backup — keys are included; keep this file private
                                                  [Cancel]  [Save]
```

## Data

This spec does not introduce new data shapes. It tightens the rules around existing ones:

- `rmoney_settings.marketDataProviders.<provider>.apiKey` (SPEC-027): plaintext storage; gated by the rules above on display, log, and export.
- `rmoney_settings.aiConnection.apiKey` (SPEC-026): same rules.
- `rmoney_settings.marketDataProviders.ibkr.oauth.{tokens, refreshToken}` (SPEC-027 deferred): same rules. When IBKR is implemented, refresh-token rotation must clear the previous token from memory immediately.
- `rmoney_market_data_log` (SPEC-027): never stores URLs — only function args, provider name, latency, outcome, and a sanitised reason string.

## Out of Scope

- **Server-side secret rotation.** The app cannot revoke keys with the upstream providers; the user does that on the provider's dashboard. The app only deletes its local copy.
- **Audit logging beyond the existing `marketDataLogger`.** No separate "security event log."
- **Hardened sandboxing of the WebView beyond the strict CSP + capability allowlist.** Tauri's defaults plus this spec's hardening are sufficient.
- **Supply-chain pinning beyond `package-lock.json`.** No additional `npm audit` gate or Renovate setup is required by this spec (separate concern, can be added later).
- **CSP for the Vite dev server.** Production-build (Tauri) is what ships; the dev server is local-only and shows the unencrypted-keys banner.
- **Public CORS proxies for Yahoo / Stooq.** Already ruled out in SPEC-027 — restated here because security was the underlying reason.
- **Anti-keylogging protections during passphrase entry.** If the OS account is compromised by malware capable of keylogging, no client-side protection helps; the threat is out of scope for a desktop app's own defences.
- **Hardware-token-backed (TPM / YubiKey / Secure Enclave) vault unlock.** The Stronghold passphrase is software-only. A hardware-backed unlock is a future enhancement.

## Resolved decisions

These were open questions before the security review; they are now decided in line with the user's preference for higher security even at the cost of complexity:

- **Redacted export = default.** Sharable mode is selected by default in the Save Backup dialog. Full Backup is a conscious choice, not the muscle-memory choice. Encoded in §"Data portability" above.
- **Pre-publish audit = pre-push hook on from day one.** The audit script runs automatically on every `git push` via a `pre-push` hook registered through `core.hooksPath`. The same script is also runnable manually as `npm run audit:pre-publish` for inspection. Documentation does not surface the `--no-verify` bypass. Encoded in §"Git publication readiness" above.
- **CSP for AI host = dynamic via runtime meta-tag injection.** Static base CSP in `tauri.conf.json` + runtime `<meta http-equiv="Content-Security-Policy">` injected by `main.jsx` before React mounts. Avoids a permissive `connect-src 'self' https:`. Encoded in §"Tauri configuration" above.
- **Encryption at rest = in scope, via `tauri-plugin-stronghold`.** Originally drafted as out-of-scope; promoted to a full acceptance-criteria section above. Master passphrase, no recovery, dev-mode fallback with banner.

## Open Questions

None. All previously open items are resolved above.
