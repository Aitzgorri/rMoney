---
id: SPEC-028
name: Mobile Investments Parity
status: draft
created: 2026-04-23
---

# Mobile Investments Parity

## Goal
Bring the Investments module to full feature parity on mobile. Phase 2 ships mobile Investments as entry + summary only (users can add buys/sells/dividends on the go and see a basic summary), but charts, top-5 news, AI evaluation, and the full reports are desktop-only. This spec closes that gap after Phase 2 is deployed and we know what users actually reach for on mobile.

**Status: deferred.** This spec exists so the deferred work is tracked and visible; it is not scheduled for implementation as part of Project Phase 2.

## User Stories
- As a mobile user, I can see the price chart for a stock I hold and switch periods (1D / 1W / 1M / 3M / 6M / 1Y / 5Y / All), just like on desktop.
- As a mobile user, I can read the top 5 news items on a stock page without having to open my desktop.
- As a mobile user, I can trigger an AI evaluation on a stock page when I have a SPEC-026 connection configured.
- As a mobile user, I can use the full Investment Reports (all four breakdowns, saved presets, configurable columns) on my phone.

## Acceptance Criteria
- [ ] Stock-page price chart renders on mobile with a touch-friendly period selector. The chart adapts to narrow widths (no horizontal scrolling, readable axis labels).
- [ ] Top 5 news items render on mobile.
- [ ] AI evaluation button and response panel render on mobile (when SPEC-026 connection is configured and enabled).
- [ ] Investment Reports render on mobile with all four breakdowns (currency, region country-detail, region continent, Portfolio) available as a vertical stack (chart above table, not side-by-side). Saved-preset selector, type filter, and column-picker all work.

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
- Any new data models.
- Mobile widgets (home-screen shortcuts, push notifications).
- Offline mode.
- Swipe gestures or other touch-native interactions beyond what standard HTML/CSS gives us on a mobile browser.

## Open Questions
Deferred until Phase 2 ships and actual mobile usage patterns are known.
