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

### Tauri configuration (CSP)
The Content Security Policy is **two-layer**: a strict static base in `tauri.conf.json` covering all hosts known at build time, plus a runtime `<meta http-equiv="Content-Security-Policy">` injected at app boot adding the user-configured AI host (which is only known at runtime). Tauri 2 honours both — effective policy is the intersection.

- [ ] `app/src-tauri/tauri.conf.json` `app.security.csp` is set to a strict static base: `default-src 'self'; connect-src 'self' https://api.twelvedata.com https://www.alphavantage.co https://api.massive.com https://finnhub.io https://query1.finance.yahoo.com https://stooq.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. Replaces the current `"csp": null`. `'unsafe-inline'` for styles is required by Vite's runtime style injection; everything else is locked down.
- [ ] **Runtime CSP injection** — `app/src/main.jsx` reads `getAiConnection()` *before* `ReactDOM.render` is called and, if an AI host is configured, prepends a `<meta http-equiv="Content-Security-Policy">` tag to `<head>` whose `connect-src` adds the AI host (https-only, parsed and validated). The static base CSP is already restrictive; the meta tag tightens further by enumerating the AI host explicitly rather than allowing the wildcard `https:`.
- [ ] When the user changes the AI provider host in Settings → AI, a one-time toast prompts a reload so the new CSP takes effect: "Reload to apply security policy." The Settings UI does not silently start using the new host without the reload.
- [ ] Non-HTTPS AI hosts are rejected at save time in Settings → AI. SPEC-026 already enforces this; reaffirmed here.
- [ ] HTTP plugin allowlist (when `@tauri-apps/plugin-http` is added per SPEC-027) is restricted to `query1.finance.yahoo.com` and `stooq.com`. No wildcards.
- [ ] Existing capability set (`fs:allow-write-text-file`, `fs:allow-read-text-file`, `dialog:allow-save`, `dialog:allow-open`, `core:default`) is reviewed and confirmed minimal — these are necessary for SPEC-016 (data portability) and the dialogs around it; nothing else is added.

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
- [ ] **Backup export integration with SPEC-016:**
  - **Sharable export (default):** unchanged — every key field is replaced with `"[REDACTED]"`, vault contents are not exported.
  - **Full backup:** prompts the user to **re-enter the master passphrase**. If correct, the export embeds the Stronghold vault file's bytes (already encrypted with the same passphrase) base64-encoded under `_strongholdVault`. To restore, the receiving install asks for the same passphrase to unlock.
- [x] **Vite dev fallback:** when the app detects it is running outside Tauri (`!window.__TAURI_INTERNALS__`), `secrets.js` falls back to `rmoney_dev_secrets` in localStorage. App.jsx renders a persistent dark-orange banner: "Dev mode — API keys are stored in plain text (localStorage). Not for real credentials."
- [x] **Forgotten-passphrase recovery:** `PassphraseUnlock.jsx` "Forgot passphrase?" link → confirmation screen explaining all keys will be lost → clears `apiKeySet` flags in localStorage → calls `deleteVaultFile()` → transitions to `PassphraseSetup`.
- [x] **Memory hygiene:** market data keys are fetched inside `buildProviderCfg()` per call and not retained; AI keys are fetched inside `sendRequest()` / `callAi()` per request. The module-level `_store` reference holds the Stronghold session, not the plaintext keys.

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
