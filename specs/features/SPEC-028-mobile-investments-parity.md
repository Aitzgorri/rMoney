---
id: SPEC-028
name: Mobile Investments Parity
status: ready
created: 2026-04-23
---

# Mobile Investments Parity

## Goal
Bring the Investments module to full feature parity on mobile (narrow viewports — the Android Capacitor build and any phone-width browser run the *same* React components as desktop; "mobile" means width, not a separate codebase).

**Re-grounded 2026-06-02 (Phase 21b kickoff).** The original draft assumed charts, news, AI evaluation, and reports were all desktop-only. A code-level mobile audit found that the shared responsive components — plus Phase 37b's responsive Stock page (SPEC-021, v0.35.0) — already satisfy most of this. The remaining gap is the **Investment Reports** screen, which has no responsive layout at all, and small polish on the price chart. Criteria below are rewritten to match what was actually measured.

**Scope note:** watchlists/alerts mobile parity and OS-level (Tauri) notifications were originally tracked here as plan items 228a/228b. They belong to the watchlists feature and are now tracked in **[SPEC-030](SPEC-030-watchlists-and-alerts.md) § Mobile parity (deferred)** instead. This spec stays focused on Investments-screen rendering.

## User Stories
- As a mobile user, I can see the price chart for a stock I hold and switch periods (1D / 1W / 1M / 3M / 6M / 1Y / 5Y / All), just like on desktop.
- As a mobile user, I can read the top 5 news items on a stock page without having to open my desktop.
- As a mobile user, I can trigger an AI evaluation on a stock page when I have a SPEC-026 connection configured.
- As a mobile user, I can use the full Investment Reports (all four breakdowns, saved presets, configurable columns) on my phone.

## Acceptance Criteria

### Already met (verified in the 2026-06-02 audit — no work, recorded so the spec mirrors reality)
- [x] **Stock-page price chart renders on mobile without horizontal scrolling.** `.chartWrap` is `width:100%` and `.chartSvg` uses a `viewBox` + `width:100%; height:auto`, so the chart scales to phone width. *(Free-ride on Phase 37b responsive Stock page.)*
- [x] **Top 5 news items render on mobile.** Rendered as a plain vertical list (`.newsList` / `.newsItem`), no fixed widths.
- [x] **AI evaluation button and response panel render on mobile** (when a SPEC-026 connection is configured and enabled). `AiChatPanel` is a column-flow chat layout (`flex-direction: column`, `min-width:0`, `max-width:88%` bubbles) with no fixed-width grid.

### Price-chart mobile polish (Phase 21b)
- [ ] **Touch-friendly period selector.** The period bar (`1D 1W 1M 3M 6M 1Y 5Y All`) wraps instead of overflowing at ~360px, and each button meets a comfortable touch target (~36–44px tall) on narrow viewports while staying compact on desktop.
- [ ] **Readable axis labels on narrow screens.** The chart's fixed `800×220` viewBox currently scales axis text down to ~5px on a phone. Axis/label legibility is restored at phone width (e.g. larger relative font size, fewer ticks, or a width-aware viewBox) without breaking the desktop rendering.

### Investment Reports on mobile (Phase 21b — the main work)
- [ ] **Breakdowns stack vertically on phones.** `InvestmentReports.module.css` currently has **no** media queries and forces `.breakdownSplit` to a fixed `340px 1fr` two-column grid (chart beside table). On narrow viewports each breakdown becomes a vertical stack — **chart above table**, not side-by-side — for all four breakdowns (currency, region country-detail, region continent, Portfolio).
- [ ] **Controls wrap, not overflow.** The saved-preset selector, type filter, and column-picker remain usable on a phone (wrap rather than overflow horizontally), and any hierarchical dropdowns keep the SPEC-009 flat-indent + type-filter conventions.
- [ ] **Tables stay legible.** Wide breakdown tables remain readable on mobile (horizontal scroll is acceptable as a fallback, but the primary columns should be visible without scrolling where the layout allows).

## UI / Screens
Mobile stock page (parity):

```
+--------------------+
| AAPL  Apple Inc.   |
| $182.50  NASDAQ ▼  |
+--------------------+
| 1D 1W 1M 3M 6M 1Y  |
| [chart — compact]  |
+--------------------+
| Metrics            |
|   Total return     |
|   p.a.             |
|   Div yield (TTM)  |
+--------------------+
| Transactions  ▼    |
+--------------------+
| Dividends     ▼    |
+--------------------+
| News (5)      ▼    |
+--------------------+
| [Evaluate with AI] |
+--------------------+
```

Mobile Reports (breakdowns stack vertically):

```
+--------------------+
| Reports            |
| Preset: [— none ▼] |
| Types: [Stocks ▾]  |
+--------------------+
| [Table ▼]          |
| ticker  value  %   |
| AAPL    ...        |
+--------------------+
| [By currency ▼]    |
| [chart]            |
| [table]            |
+--------------------+
| [By region ▼]      |
| ...                |
+--------------------+
```

## Data
No new data; this spec is purely a UI/rendering expansion of existing data.

## Out of Scope
- Any new data models. This spec is purely a UI/rendering expansion of existing data.
- **Watchlists & alerts on mobile, and Tauri/OS notifications** — tracked in [SPEC-030 § Mobile parity (deferred)](SPEC-030-watchlists-and-alerts.md) (formerly plan items 228a/228b).
- Mobile widgets (home-screen shortcuts, push notifications).
- Offline mode.
- Swipe gestures or other touch-native interactions beyond what standard HTML/CSS gives us on a mobile browser.

## Open Questions
- None blocking. The 2026-06-02 audit resolved the original "wait for usage patterns" question by measuring the actual responsive state; remaining work is the Reports layout and chart polish above.
