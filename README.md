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

Run the full pre-publish audit manually before your first push:

```bash
npm run audit:pre-publish
```

### Data files (`.rmy` and `.csv`)

Backup files exported from the app (`.rmy`) and any CSV import files may contain personal financial data. They are listed in `.gitignore` and must never be committed. If you have a file like `Import_test.csv` at the repo root, delete it or move it to an ignored location before pushing.

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
