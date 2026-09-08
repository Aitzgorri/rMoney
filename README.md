# rMoney

Personal finance app with envelope-style budgeting.

## Commands

See the [`commands/`](commands/) folder for details on each command.

| Command | Usage | Description |
|---|---|---|
| [spec:new](commands/spec-new.md) | `npm run spec:new "Name"` | Create a new spec |
| [spec:list](commands/spec-list.md) | `npm run spec:list` | List all specs with status |
| [spec:review](commands/spec-review.md) | `npm run spec:review -- "name"` | Print summary of one spec |
| [spec:validate](commands/spec-validate.md) | `npm run spec:validate -- "name"` | Check spec is complete |
| [spec:ready](commands/spec-ready.md) | `npm run spec:ready -- "name"` | Mark spec as ready |
| [spec:implement](commands/spec-implement.md) | `npm run spec:implement -- "name"` | Mark spec as in-progress |
| [spec:done](commands/spec-done.md) | `npm run spec:done -- "name"` | Mark spec as done |

> **Note:** The `--` separator is needed to pass arguments through npm to the script.

## Prerequisites

A clone is not enough to build — none of the toolchain lives in git. On a fresh machine:

| Tool | Needed for | Install |
|---|---|---|
| **Node.js** LTS | everything | `winget install OpenJS.NodeJS.LTS` |
| **Rust** + **MSVC C++ Build Tools** | desktop (Tauri) | `winget install Rustlang.Rustup`, then see below |
| **WebView2 runtime** | desktop (Tauri) | preinstalled on Windows 11 |
| **JDK 21** | Android | `winget install EclipseAdoptium.Temurin.21.JDK` |
| **Android Studio** | Android | `winget install Google.AndroidStudio` — launch once to install the SDK and accept the licences |

Two traps worth calling out, both of which produce confusing failures:

- **Rust on its own is not enough.** Without the MSVC C++ toolset it compiles but cannot *link*.
  Install the C++ workload explicitly:
  ```powershell
  winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  ```
- **Do not build Android with Android Studio's bundled JDK.** It ships JBR **25**, which Gradle
  8.14.3 + AGP 8.13.0 reject outright with `Unsupported class file major version 69`. Use JDK 17
  or 21 and point `JAVA_HOME` at it — including the IDE's own Settings → Build Tools → Gradle →
  Gradle JDK, which does not follow `JAVA_HOME`.

No `.env` file is required: the app reads no `VITE_*` variables. After installing the toolchain,
do the [First-time git setup](#first-time-git-setup) below — it is not optional.

## Getting started (dev)

```bash
cd app
npm install
npm run dev          # Vite dev server at http://localhost:5173
```

The dev server proxies CORS-blocked market data providers automatically:

| Proxy path | Upstream |
|---|---|
| `/__yfproxy/…` | `https://query1.finance.yahoo.com` |
| `/__stooq/…` | `https://stooq.com` |

**No API keys are required to run the app**, but price and chart data will only load for providers you enable under More → Settings → Market data.

### API key configuration

Keys are entered in More → Settings → Market data. They are stored in plain `localStorage` during development (a red banner appears as a reminder). Keys are never written to source files — the `.gitignore` blocks `.env*` files and the pre-commit hook scans for key-shaped strings.

### First-time git setup

After cloning, register the project's git hooks so the pre-commit and pre-push guards are active:

```bash
npm run hooks:install
```

⚠ **Do not skip this.** `core.hooksPath` is *local git config, not a file*, so it is not carried by
the repo — **every fresh clone starts with the SPEC-031 guards silently disabled**. Nothing warns
you; the pre-commit secret scanner and the pre-push audit simply never run. Verify with:

```bash
git config core.hooksPath        # must print: scripts/git-hooks
```

Run the full pre-publish audit manually before your first push:

```bash
npm run audit:pre-publish
```

### Data files (`.rmy` and `.csv`)

Backup files exported from the app (`.rmy`) and any CSV import files may contain personal financial data. They are listed in `.gitignore` and must never be committed. If you have a file like `Import_test.csv` at the repo root, delete it or move it to an ignored location before pushing.

The app writes two kinds of `.rmy`, and the difference matters:

| Mode | Contains | Use for |
|---|---|---|
| **Sharable export** (default) | no API keys or tokens, no Device-Sync config (WebDAV URL / username), no deletion log | handing a file to someone else, attaching to an issue |
| **Full backup** | everything, plus the encrypted Stronghold vault on desktop | rebuilding **your own** device — never share it |

Rebuild your own machine from a **Full** backup. A Sharable export carries no deletion tombstones, so restoring one and then enabling Device Sync can let records you deleted on another device reappear on the first merge.

## Device sync (Synology NAS / WebDAV)

rMoney can sync its data between the desktop and Android builds through any WebDAV folder — no cloud service involved (SPEC-039). Setup on a Synology NAS:

1. **Create a dedicated NAS user** (e.g. `rmoney-sync`) with access to **one shared folder only** (e.g. `rmoney-sync`) — deny everything else. The app's credential grants nothing beyond that folder.
2. **Install the WebDAV Server package** in DSM Package Center and enable **HTTPS** (default port 5006).
3. **Use a proper certificate**: DSM → Control Panel → Security → Certificate → Let's Encrypt with a DDNS hostname. WebViews are hostile to self-signed certificates — get this right on day one.
4. In rMoney: **Settings → General → Device sync** — folder URL (`https://your-nas:5006/rmoney-sync`), the dedicated username, and its password (stored in the encrypted secrets store, per device). Test connection, then enable.
5. **Away from home?** Don't expose the NAS to the internet for this. Install [Tailscale](https://tailscale.com) on the NAS, desktop and phone, and use the tailnet address as the folder URL — zero open ports.

How it behaves: changes push automatically a few seconds after every edit; if the NAS is unreachable the change is kept and retried on the next edit, app focus, or a manual "Sync now" (the corner indicator shows the state). Devices that were offline merge record-by-record on reconnect — additions from both sides survive, the newest edit wins per record, and deletions propagate via a tombstone log instead of resurrecting. API keys are never part of the sync payload. A plain browser (`npm run dev`) can't sync — WebDAV servers don't send CORS headers; use the desktop or Android build.

## Releases

See [`RELEASE.md`](RELEASE.md) for the full release process. In short:

- SemVer 0.X.Y while pre-1.0, one tag per phase milestone (`v0.32.0`, `v0.33.0`, …), marked Pre-release on GitHub.
- Windows desktop (`.msi` / `.exe`) is the only published platform today; Linux / macOS / Android are future.
- Build process is fully manual right now (`npm run tauri:build` locally + `gh release create`); a GitHub Actions migration path is documented for when a second platform is added.

## Project Structure

```
rMoneyClaude/
├── commands/           — command reference docs
├── specs/
│   ├── _template.md    — blank spec template
│   └── features/       — one file per feature
├── wireframes/         — HTML wireframes
├── scripts/            — command scripts
└── app/                — the React app (coming soon)
```
