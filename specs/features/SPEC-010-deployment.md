---
id: SPEC-010
name: Deployment
status: in-progress
created: 2026-04-08
---

# Deployment

## Goal
Make rMoney trivially installable for a non-technical user. The user should be able to grab **one file** and install the app on either their computer or their mobile device — no terminals, no toolchains, no app-store hoops if avoidable.

## Packaging stack decisions

| Platform | Tool | Output |
|---|---|---|
| Desktop (Windows) | Tauri + tauri-build | `.msi` / `.exe` NSIS installer |
| Desktop (macOS) | Tauri + tauri-build | `.dmg` |
| Desktop (Linux) | Tauri + tauri-build | `.AppImage` |
| Mobile (Android) | Capacitor | `.apk` |
| Mobile (iOS) | Out of scope (requires Mac) | — |

**Why Tauri:** small installers (~5–10 MB vs ~150 MB for Electron), uses the OS's built-in browser engine (WebView2 on Windows), pure Rust backend with no extra runtime to ship.

**Why Capacitor:** wraps the existing React web build with zero code changes, works with Vite out of the box.

## User Stories
- As a user, I can download a single installer file for my computer and run it to install rMoney
- As a user, I can download a single installer file for my Android phone and install rMoney
- As a user, I do not need to install Node, a build tool, or a code editor to use the app

## Acceptance Criteria

### Desktop (Tauri)
- [x] `npm run tauri:dev` launches the app in a Tauri window (development mode)
- [x] `npm run tauri:build` produces a platform-native installer in `src-tauri/target/release/bundle/`
- [x] Windows: produces a `.msi` or `.exe` installer
- [x] App data (localStorage) persists across app launches
- [x] App window title is "rMoney"
- [x] App has a placeholder icon (green circle with white "r")
- [x] Closing the window quits the app
- [x] `.rmy` backup files are associated with the app: Windows Explorer shows "rMoney Data" in the Type column and opens the file with rMoney. File icon uses the app icon (green "r" circle). A dedicated document-style icon (`icons/rmy-file.ico`) has been designed and is ready for use once Tauri adds per-file-type icon support to its config schema.

### Mobile (Capacitor) — Phase 21a
- [x] `npx cap add android` + `npx cap open android` opens Android Studio with the project ready to build
- [x] App data persists locally on the device (localStorage in WebView is automatically persistent; verified on device 2026-05-28)
- [x] Production `.apk` built via `cd app && npm run android:sync && cd android && gradlew.bat assembleDebug`; output attached to GitHub release alongside the Windows `.msi` per RELEASE.md mobile flow
- [x] Re-verified on Android: dev-mode banner shows; Stronghold fallback uses `rmoney_dev_secrets` localStorage; market-data CORS works via CapacitorHttp native transport; backup save/load works via `@capacitor/filesystem` + `<input type="file">`

**Verification fixes (2026-05-28):**
- Removed `/* @vite-ignore */` from `@capacitor/filesystem` dynamic import so Vite bundles the module (it was failing to resolve at runtime).
- Added the Web Share API as the primary Android save path so the user can pick the destination (Drive, Files, email, etc.); falls back to `Directory.Documents` if `canShare({ files })` is unsupported.
- Added try/catch in `App.jsx#handleSave` so save errors surface as a banner instead of silently failing.
- Changed `pickFileViaInput` to use `accept="*/*"` on Capacitor — Android's SAF picker was greying out `.rmy` files because the extension has no registered MIME type; validation after read still enforces the backup format.

**Code shipped (Phase 21a):**
- `app/capacitor.config.json` — Capacitor project config; `CapacitorHttp.enabled: true` routes cross-origin `fetch()` natively, bypassing WebView CORS for Yahoo Finance and Stooq
- `@capacitor/core`, `@capacitor/android`, `@capacitor/filesystem` added to dependencies; `@capacitor/cli` to devDependencies
- `src/utils/marketDataFetch.js` — `isCapacitor()` branch uses direct `fetch()` (CapacitorHttp intercepts it natively)
- `src/data/portability.js` — Tauri imports made dynamic (`@vite-ignore`); Capacitor path uses `@capacitor/filesystem` for save, `<input type="file">` for load; browser blob-download fallback added
- `app/package.json` — `android:sync` and `android:open` convenience scripts added
- `RELEASE.md` — full Android release checklist added

### Auto-update — deferred
- Auto-update will be addressed when a release distribution channel is chosen.

### GitHub release process
- [x] `RELEASE.md` at the repo root documents the manual release process — versioning scheme (SemVer 0.X.Y pre-1.0, one tag per phase milestone), Windows step-by-step checklist (version bump → build → smoke test → tag → notes → `gh release create --prerelease`), and an outline for the future GitHub Actions `release.yml` workflow.
- [x] All three version files (`app/package.json`, `app/src-tauri/Cargo.toml`, `app/src-tauri/tauri.conf.json`) carry the same version string. Current: `0.32.0` (Phase 32 milestone).
- [ ] Cut the first GitHub release `v0.32.0` against the current `main` (Phase 32 milestone). Subsequent releases follow the per-phase cadence documented in `RELEASE.md`.

## UI / Screens
N/A — this spec is about packaging and distribution, not in-app screens.

## Data
No new app data. Configuration files added:
- `src-tauri/Cargo.toml` — Rust crate manifest; dependencies: `tauri`, `tauri-plugin-dialog`, `tauri-plugin-fs`, `serde`, `serde_json`
- `src-tauri/src/main.rs` + `src-tauri/src/lib.rs` — Tauri entry points; plugins registered: `tauri_plugin_dialog`, `tauri_plugin_fs`
- `src-tauri/tauri.conf.json` — app name, window size, icon, build config, `.rmy` file association
- `src-tauri/capabilities/default.json` — security permissions: `core:default`, `dialog:allow-save`, `dialog:allow-open`, `fs:allow-write-text-file`, `fs:allow-read-text-file`
- `src-tauri/.cargo/config.toml` — redirects build output to D: (avoids filling C:)
- `src-tauri/icons/` — all icon sizes generated from placeholder PNG, plus `rmy-file.ico` (custom file-type icon, generated by `scripts/gen-rmy-icon.py`)

## Out of Scope
- App-store listings, store review process, store metadata
- Code signing, notarisation, and certificate management
- CI/CD pipeline design
- Auto-update (deferred)
- iOS (requires Mac)

## Open Questions
- None.
