# Release process

How to cut a new GitHub release of rMoney.

The process is **fully manual** right now: you build the desktop installer locally on your Windows machine and attach it to a GitHub release you create with `gh`. There is no CI build pipeline yet — the "Future: GitHub Actions on tag push" section at the bottom of this document explains how to migrate when you're ready.

---

## Versioning

| | |
|---|---|
| Scheme | SemVer 0.X.Y (pre-1.0 while the app is still evolving) |
| Tag format | `vX.Y.Z` (lowercase `v` prefix, no leading zeros) |
| Minor bump | One per completed implementation-plan phase milestone (e.g. `v0.32.0`, `v0.33.0`) |
| Patch bump | Bug-fix-only releases between phases (`v0.33.1`, `v0.33.2`) |
| Major bump | Reserved for `1.0.0`, when the app is feature-complete enough for general use |
| Pre-release flag | Every release is marked **Pre-release** on GitHub until 1.0 |

Three files must carry the same version string. If they drift, the desktop installer says one thing and `package.json` says another:

| File | Field |
|---|---|
| [`app/package.json`](app/package.json) | `"version": "0.32.0"` |
| [`app/src-tauri/Cargo.toml`](app/src-tauri/Cargo.toml) | `version = "0.32.0"` |
| [`app/src-tauri/tauri.conf.json`](app/src-tauri/tauri.conf.json) | `"version": "0.32.0"` |

## Data compatibility

The `.rmy` backup file (SPEC-016 Data Portability) carries a `version` field. The app's read-side migrations are forward-only — a newer build always loads an older backup; older builds reject newer backups with an "update the app" message.

| Backup format | Written by | Readable by | Notes |
|---|---|---|---|
| `rmoney-data-v1` | up to v0.32.x | every version | the original format |
| `rmoney-data-v2` | v0.33.0 – v0.34.x | v0.33.0+ | adds dividend `status` model, `paysDividends`, `lastKnownPrice`, `favoriteCurrencies`, `apiCacheTtl`, `maximumFee` on trading fees, etc. v1 backups loaded into v0.33.0+ run the boot-time migrations and are upgraded transparently |
| `rmoney-data-v3` | v0.35.0 – v0.35.x | v0.35.0+ | adds the `dismissedSplits` collection (Phase 36d) and the stockTransactions fee-currency model — `feeCurrency`, currency-exchange linkage (`triggeredByStockTransactionId`, `linkedStockTransactionId`), `exchangeRatesSnapshot` (Phase 35a). v1/v2 backups loaded into v0.35.0+ default the new collection and the item-291 boot migration backfills `feeCurrency` — upgraded transparently. **v3 backups are rejected by ≤v0.34.x** ("update the app to load it"). |
| `rmoney-data-v4` | v0.36.0+ | v0.36.0+ | adds the `settings.favoriteCountries` key (Phase 38 item 435), riding inside the existing `rmoney_settings` blob. Purely additive: v1/v2/v3 backups loaded into v0.36.0+ default the key via the boot migration — upgraded transparently. **v4 backups are rejected by ≤v0.35.x** ("update the app to load it"). |
| `rmoney-data-v5` | Phase 20 (crypto) onward, incl. v0.37.0–v0.38.x | Phase 20+ | adds the `rmoney_crypto_profiles` collection (symbol→CoinGecko-coin mappings, SPEC-036) and crypto shapes inside `rmoney_stock_transactions`: `assetClass`/`wallet` on buys/sells, the `swap` and `wallet-transfer` types, and `fee:{coin,quantity}` on swaps. Purely additive: v1–v4 backups loaded into Phase 20+ default the missing collection (`[]`) and treat transactions without `assetClass` as stocks — upgraded transparently. **v5 backups are rejected by ≤v0.36.x** ("update the app to load it"). **v0.37.0–v0.38.x keep writing v5**: Phases 43–55 added only additive fields inside already-exported collections (settings favorites lists; scheduled-transfer `startDate`/`note`; bill-item `generatedFrom`/`overrides`/`countInNextPeriod`; transaction `periodShift`) — loaders of the same or newer version tolerate their absence, so no format bump was needed. Note: loading a v0.38 backup into an *older* v5-capable build works but that build ignores the newer fields. |

| `rmoney-data-v6` | Phase 58 (device-sync groundwork) onward | Phase 58+ | adds the `rmoney_deletions` tombstone log (SPEC-039 — deletions must propagate between devices) and additive `updatedAt` stamps on records across all synced collections. Purely additive: v1–v5 backups loaded into Phase 58+ default the missing collection (`[]`) and treat unstamped records as older than any stamped one. **v6 backups are rejected by ≤v0.38.x** ("update the app to load it"). |
| `rmoney-data-v7` | Phase 65 (multiple envelope plans) onward | Phase 65+ | adds the `rmoney_plans` collection (SPEC-009 — named envelope plans), an additive `planId` on planned incomes/expenses, and the `settings.activePlanId` key (inside the settings blob). Purely additive: v1–v6 backups loaded into Phase 65+ default the collection (`[]`) and `ensureDefaultPlan()` wraps legacy planned items into "Plan 1" after import / on boot. **v7 backups are rejected by older builds** ("update the app to load it"). |

**Release-note checklist for data-shape changes:**
1. Every release that changes a data shape (new field on an existing record, new collection, new settings key) bumps the backup format version per the table above.
2. The release notes include a "Data compatibility" line stating: "Reads `rmoney-data-vN` and earlier; writes `rmoney-data-vN`."
3. The loader must reject backups written by an unknown future version with a clear "Update the app to load this backup" message — never silently drop unknown fields.

When you bump the data version, update the table above too.

### Vault snapshot format (App-password mode)

Independent of the `.rmy` backup format above, App-password mode (SPEC-031 Phase 39e)
stores all `rmoney_*` app data as a single encrypted record inside the Stronghold
vault, versioned by the `appData/snapshotVersion` record so the in-vault shape can
evolve on its own:

| Snapshot version | Written by | Notes |
|---|---|---|
| `1` | Phase 39e onward | flat `{ rmoney_key: stringValue }` map of every app-data collection, mirroring the localStorage keys. Hydrated into memory on unlock; re-encrypted (debounced) on every change. |

A Full backup taken in App-password mode embeds the whole encrypted vault (which
carries this snapshot) under `_strongholdVault`, so restoring reconstructs both keys
and data behind the same passphrase. Bump `SNAPSHOT_VERSION` in `secrets.js` and add a
row here whenever the in-vault shape changes.

---

## Platforms

| Platform | Format | Build host needed | Status |
|---|---|---|---|
| Windows desktop | `.msi` + NSIS `.exe` | Windows | ✓ active — current release surface |
| Linux desktop | `.AppImage` + `.deb` | Linux | future — needs Linux build host or GitHub Actions |
| macOS desktop | `.dmg` | macOS | future — needs Mac (also code-signing for SmartScreen equivalent) |
| Android mobile | `.apk` | Any (via Capacitor + Android SDK) | ✓ active — Phase 21a pipeline shipped |
| iOS mobile | `.ipa` | macOS | out of scope (no Mac) |

**Today Windows and Android ship.** When you add a third platform, that's the right moment to migrate to GitHub Actions — see the bottom of this document.

---

## Manual release checklist (Windows desktop)

Run this sequence from the **project root** unless noted. It assumes you have `gh` (GitHub CLI) installed and authenticated.

### Step 1 — Confirm the branch is ready

```powershell
git status                    # working tree should be clean
git log --oneline -5          # confirm the commits you expect to ship
git pull --ff-only            # make sure you're on the tip of main
npm run plan:validate         # confirm no errors (warnings are OK)
```

### Step 2 — Pick the version number

- Phase milestone? → bump the minor (e.g. `0.32.0 → 0.33.0`).
- Bug-fix only since last tag? → bump the patch (e.g. `0.33.0 → 0.33.1`).
- Write the chosen version somewhere you can copy from (used 4 times below).

### Step 3 — Bump the version in all three files

```powershell
# pick ONE of these — open in editor or use sed equivalent
code app/package.json                # change "version": "..."
code app/src-tauri/Cargo.toml        # change version = "..."
code app/src-tauri/tauri.conf.json   # change "version": "..."
```

Then commit:

```powershell
git add app/package.json app/src-tauri/Cargo.toml app/src-tauri/tauri.conf.json
git commit -m "Release v0.33.0"
git push
```

### Step 4 — Build the Windows installer

```powershell
cd app
npm install                   # only needed if dependencies changed
npm run tauri:build           # produces .msi and .exe in src-tauri/target/release/bundle/
cd ..
```

Build takes ~3–5 minutes the first time, faster on incrementals. Outputs land here:

```
app/src-tauri/target/release/bundle/
├── msi/rMoney_0.33.0_x64_en-US.msi
└── nsis/rMoney_0.33.0_x64-setup.exe
```

> If the `target/` directory is redirected to `D:` per `app/src-tauri/.cargo/config.toml`, look on `D:\cargo-target\release\bundle\` instead.

### Step 5 — Quick smoke test (recommended)

Install the `.msi` you just built into a clean Windows user (or simply over your dev install), launch rMoney, and verify:

- App opens to the expected screen
- Existing localStorage data still loads
- One end-to-end happy path (e.g. add an envelope, record a transaction)
- The Settings → Storage tab opens (catches build-time regressions in code-split chunks)

Five minutes of clicking is worth it; CI doesn't exist yet to catch shipping regressions.

### Step 5b — Security: scrap Device-Sync data from everything you publish (MANDATORY)

Rule (2026-07-10, CLAUDE.md → Security convention): a **public version of the app must carry no Device-Sync data** — the WebDAV folder URL, sync username, sync password, device ids / sync state (`rmoney_sync_meta`, `rmoney_sync_base`), or the sync deletion log. Before tagging/publishing, check every artifact that will leave your machines:

- **Installers / APK** — contain no user data by construction; nothing to do.
- **Screenshots** (release notes, README) — must not show the Settings → Sync tab with a real URL/username.
- **Demo or sample data** attached to the release — export it from a profile with Device Sync unconfigured, or delete the sync fields from `settings` plus `rmoney_deletions` before attaching.
- **Backup files** — ⚠ a **Sharable (redacted) backup still contains the WebDAV URL + username** (the sync payload reuses that redaction — SPEC-039 open question). Never attach a backup made from a sync-configured profile without scrubbing those fields first.

### Step 6 — Tag the commit

```powershell
git tag -a v0.33.0 -m "v0.33.0 — Phase 33 (Dividend-flow overhaul + UX polish)"
git push --tags
```

### Step 7 — Draft the release notes

Build the notes from spec activity since the previous tag. Sections (omit any that are empty):

```markdown
## Phase 33 — Dividend-flow overhaul + UX polish

### Added
- Pending dividend confirmation queue (Dividend page → Pending tab)
- Multi-account dividend entry from the Stock page
- Shared currency dropdown with favorites (managed in Settings → General)
- Per-data-type API cache TTL settings (Settings → Investments → API call frequency)
- "Reset API" button on every screen that reads market data
- Open lots expand on Stock page Positions rows

### Changed
- "Rename ticker" button renamed to "Re-identify ticker"
- Stock inventory table widens to full width with sticky-left ticker column
- Edit profile dialog now opens the resolution flow first
- Dividend page "Last 12-months amount" now reflects shares held on ex-div date
- Trading fees now support an optional maximum-fee cap

### Fixed
- Future-declared dividends no longer appear twice (past + future)
- Today-date dividend now classified as past consistently
- Future-payout row date columns corrected (Ex-div vs Pay)
- Small/grey text contrast pass — WCAG AA compliant

### Known limitations
- Linux/macOS desktop builds still not published
- Mobile (Android) still deferred to Phase 21b

### Data compatibility
Reads `rmoney-data-v2` and earlier; writes `rmoney-data-v2`. v1 backups (saved by v0.32.x and earlier) load cleanly and are upgraded to v2 on save.

### Install
Download `rMoney_0.33.0_x64-setup.exe` (or the `.msi`) below. Windows SmartScreen will warn that the publisher is unknown (the binaries are not code-signed yet) — click "More info" → "Run anyway".
```

### Step 8 — Create the GitHub release

```powershell
gh release create v0.33.0 `
  app/src-tauri/target/release/bundle/msi/rMoney_0.33.0_x64_en-US.msi `
  app/src-tauri/target/release/bundle/nsis/rMoney_0.33.0_x64-setup.exe `
  --title "v0.33.0 — Phase 33 (Dividend-flow overhaul)" `
  --notes-file release-notes.md `
  --prerelease
```

(Write the notes from Step 7 into `release-notes.md` first, or pass `--notes "…"` inline for a short release.)

Drop the `--prerelease` flag only when cutting a stable `1.0.0`+ release.

### Step 9 — Verify

```powershell
gh release view v0.33.0       # confirm title, notes, and attached artifacts
```

Visit https://github.com/<you>/rMoneyClaude/releases — the new release should appear at the top with the Pre-release badge.

Done.

---

## Bug-fix release flow

Same as above with two adjustments:

- Bump only the patch component (`v0.33.0 → v0.33.1`).
- In release notes, replace the "Phase 33" header with `## v0.33.1 — Bug fixes` and list only the fixes shipped since the previous tag.

---

## Mobile (Android) release flow

The Android pipeline reuses the same React build, wrapped with Capacitor. The `android/` project is checked in to the repo (generated once via `npx cap add android`). After that, every release just syncs the latest web build into it.

### Prerequisites (one-time setup)

1. Install [Android Studio](https://developer.android.com/studio). Accept the SDK licenses during setup.
2. Make sure the `JAVA_HOME` and `ANDROID_HOME` environment variables point to your JDK and Android SDK directories. Android Studio sets these automatically on first launch.

### Step-by-step: build a `.apk`

Run these from the **`app/` directory**:

```powershell
npm run android:sync        # vite build + npx cap sync android
```

Then either open Android Studio and build from there:

```powershell
npm run android:open        # opens the android/ project in Android Studio
```

Or build headlessly from the command line (requires Gradle in PATH or using the wrapper):

```powershell
cd android
.\gradlew.bat assembleDebug
cd ..
```

The unsigned debug `.apk` lands at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Attaching to a GitHub release

Attach the `.apk` alongside the Windows installers in Step 8 of the Windows checklist above:

```powershell
gh release create v0.33.0 `
  app/src-tauri/target/release/bundle/msi/rMoney_0.33.0_x64_en-US.msi `
  app/src-tauri/target/release/bundle/nsis/rMoney_0.33.0_x64-setup.exe `
  app/android/app/build/outputs/apk/debug/app-debug.apk `
  --title "v0.33.0 — Phase 33 (Dividend-flow overhaul)" `
  --notes-file release-notes.md `
  --prerelease
```

### Installing on an Android device

Before attaching the `.apk` (or anything else) to a public release, run the **Step 5b Device-Sync scrub check** from the Windows checklist above — it applies to every published artifact regardless of platform.

Side-loading an unsigned `.apk` (no Play Store):
1. On the phone: Settings → Security → "Install unknown apps" → allow for your file manager or browser.
2. Transfer `app-debug.apk` to the phone (USB, email, cloud drive, `adb install app-debug.apk`).
3. Open the file — Android prompts to install.

### Notes

- **Secrets / Stronghold**: Tauri Stronghold doesn't run on Capacitor. The app falls back to `rmoney_dev_secrets` in localStorage and shows the same "dev mode" banner as a browser session. API keys entered in Settings are stored there until a proper Capacitor-specific secret store is wired up in a future phase.
- **CORS**: `CapacitorHttp.enabled = true` (set in `app/capacitor.config.json`) routes cross-origin fetch() calls through Android's native HTTP stack, so Yahoo Finance and Stooq work without the Tauri HTTP plugin.
- **Backup**: Save writes to `Documents` inside the app's scoped external-storage folder (`Android/data/com.rmoney.app/files/Documents/`), accessible via a file manager or USB. Load uses the standard Android file picker via `<input type="file">`.
- **localStorage**: The Android WebView persists localStorage across launches automatically — no extra setup needed.

---

## Multi-platform desktop — future

Tauri can build for Linux and macOS but the build host has to match the target platform (you can't cross-compile a Mac `.dmg` from Windows). Options:

- **Linux**: spin up a Linux VM, install Node + Rust + the Tauri Linux prerequisites, run `npm run tauri:build`. Output is `.AppImage` (universal) and `.deb` (Debian/Ubuntu).
- **macOS**: same on a Mac. Without an Apple Developer ID the `.dmg` will trigger Gatekeeper warnings just like Windows SmartScreen does today.
- **Code signing** (Windows + macOS): you can buy a code-signing certificate to eliminate the warnings; budget ~$70/year (Windows) or $99/year (Apple Developer Program). Optional — the unsigned binaries still install fine with a one-click "Run anyway".

When you add a second platform, the right move is usually to migrate the build to GitHub Actions so you don't have to keep three machines around.

---

## Future: GitHub Actions on tag push

When you're ready to automate, add a workflow that triggers on every `v*` tag push, builds the installer on each platform runner, and attaches all artifacts to the auto-created GitHub release.

Outline of `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write  # needed to create the GitHub release

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            artifact-glob: 'app/src-tauri/target/release/bundle/{msi,nsis}/*.{msi,exe}'
          - os: ubuntu-latest
            artifact-glob: 'app/src-tauri/target/release/bundle/{appimage,deb}/*.{AppImage,deb}'
          - os: macos-latest
            artifact-glob: 'app/src-tauri/target/release/bundle/{dmg,macos}/*.{dmg,app.tar.gz}'

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: app/package-lock.json

      - uses: dtolnay/rust-toolchain@stable

      # Linux Tauri prerequisites
      - if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

      - name: Install deps
        working-directory: app
        run: npm ci

      - name: Tauri build
        working-directory: app
        run: npm run tauri:build

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: rmoney-${{ matrix.os }}
          path: ${{ matrix.artifact-glob }}

  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: ./artifacts

      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          files: ./artifacts/**/*
          prerelease: ${{ !startsWith(github.ref, 'refs/tags/v1.') }}
          generate_release_notes: true
```

Notes for when you migrate:

- The Cargo build cache adds ~5 minutes per platform on a cold runner; add the `Swatinem/rust-cache@v2` action to halve subsequent runs.
- Windows code signing in CI requires the `.pfx` certificate as a base64 GitHub secret and a Tauri config tweak (`tauri.conf.json` → `bundle.windows.certificateThumbprint`). Defer until you actually buy a cert.
- macOS notarisation is a separate flow involving `xcrun notarytool` and Apple Developer credentials. Defer.
- The `prerelease: ${{ ... }}` expression auto-flips to `false` only when tagging `v1.*` — until then every release is marked Pre-release automatically.

Once the workflow is in place, the manual checklist above collapses to: bump versions, commit, tag, push tag, write the release notes in the GitHub UI when the artifacts arrive. The build no longer runs on your laptop.
