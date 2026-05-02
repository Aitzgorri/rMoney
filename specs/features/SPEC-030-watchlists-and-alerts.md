---
id: SPEC-030
name: Watchlists and Alerts
status: done
created: 2026-04-29
---

# Watchlists and Alerts

## Goal
Let the user track stocks they don't (yet) own. Multiple named watchlists, each holding any number of stocks — independent of whether those stocks appear in any investing account. On each stock-on-a-watchlist the user can attach **price-threshold alerts** ("notify me when AAPL crosses $200 from below") that fire as in-app banners while the app is open. Built so the same data model survives a later upgrade to mobile OS notifications and eventually cloud-side push, without re-shaping the schema.

## User Stories
- As a user, I can create a watchlist (e.g. "Buy candidates", "EU tech"), rename it, reorder it, and delete it.
- As a user, I can add a stock to a watchlist by typing either its ticker or its company name. If the stock isn't already in the app, the SPEC-029 resolution flow runs so I confirm name, exchange, and currency before it lands.
- As a user, I can place the same stock on more than one watchlist; alerts I set on one watchlist are independent of alerts on another for the same stock.
- As a user, I can see the current price of every stock on a watchlist, the day change, and the small-cap summary line of any alerts I have set.
- As a user, I can set a price-threshold alert: "notify me when {ticker} reaches ≥ X" or "≤ X". I can have multiple alerts on the same stock-on-watchlist (e.g. one "≤ $150" buy-it-now level and one "≥ $200" take-profit level).
- As a user, I see a banner inside the app when an alert fires, and a badge on the Investments dropdown until I dismiss it. Once an alert fires, it stays in the **Triggered** state until I either dismiss it (delete) or rearm it.
- As a user, I can open a stock's stock page (SPEC-021) directly by clicking it in any watchlist.

## Acceptance Criteria

### Navigation
- [x] The Investments item in the top/bottom nav becomes a **dropdown** when clicked (or tapped) rather than navigating directly. Menu items: **Investments overview**, **Portfolios**, **Watchlists**. Future investments-related screens (Reports, Benchmarks) will be added to the same dropdown. The dropdown nav pattern itself is documented in **SPEC-018 (Investing Accounts)** — this spec just adds the "Watchlists" entry.
- [x] Selecting "Watchlists" navigates to a new screen at `activeTab === 'watchlists'`.
- [x] If any alert is currently in the **triggered** state, a small badge (count of triggered alerts) appears on the Investments dropdown trigger.

### Watchlist management
- [x] On the Watchlists screen the user can: create a new watchlist (name required, must be non-empty), rename, delete (with confirmation). Drag-to-reorder is deferred (SPEC-014 pattern, post-v1).
- [x] At least one watchlist exists at all times. If the user deletes the last one, the app immediately creates a default "My watchlist" so the screen never shows "no lists" as a permanent state.
- [x] Each watchlist has: `id`, `name`, `order` (integer), `createdAt`. No description, color, or icon in v1.

### Adding stocks to a watchlist
- [x] The watchlist screen has an "+ Add stock" control with a single text input that accepts either a ticker (uppercase letters/digits/dot) or a free-form name.
- [x] On submit, the input is detected as ticker vs name by a simple heuristic: uppercase + ≤ 8 chars + matches `[A-Z0-9.]+` → treat as ticker (SPEC-029 Direction A); otherwise treat as name (SPEC-029 Direction B).
- [x] The SPEC-029 resolution dialog runs, the user confirms a candidate, the resolved ticker is added to the watchlist as a new entry. Duplicate tickers in the same watchlist are rejected with an inline message ("Already on this list").
- [x] A stock can be on multiple watchlists. There is no per-stock ownership concept — adding to a watchlist does not create any transaction or position.
- [x] Removing a stock from a watchlist is a single button on its row, with confirmation only if the stock has any alerts. Removing the stock cascades-deletes its alerts on that watchlist.

### Watchlist row display
- [x] Each row in a watchlist shows: ticker, company name, exchange (small), current price (shows "—" — live prices deferred to SPEC-027), and a one-line summary of alerts on this row (e.g. "≤ $150, ≥ $200" or "no alerts"). Day change deferred with live prices.
- [x] Clicking the ticker or name navigates to the stock's stock page (SPEC-021).
- [x] If price data is unavailable (provider failure / cache miss / no providers configured), the price column shows "—" and the row is not blocked from being interacted with. Alerts continue to evaluate as soon as a price becomes available.

### Alerts: structure
- [x] An alert belongs to a `watchlistEntry` (a specific stock-on-a-specific-watchlist), not to the stock globally. The same stock on two different watchlists has two independent alert sets.
- [x] Each alert has: `id`, `watchlistEntryId`, `direction` (`'above'` or `'below'`), `threshold` (number, > 0), `currency` (string, defaults to the stock profile's `currency`), `status` (`'armed'` | `'triggered'`), `createdAt`, `triggeredAt` (set when transitioning to triggered).
- [x] Multiple alerts per stock-on-watchlist are allowed (e.g. an "above" and a "below"). UI shows them in a small list with edit/delete on each row.
- [x] An alert's `currency` must match the stock's `currency` in v1 — the picker is locked to the resolved currency. Cross-currency alerts (e.g. "alert me when AAPL trading in EUR-equivalent reaches ...") are out of scope.

### Alerts: evaluation (Phase A — on-open)
- [x] `evaluateAlerts(priceMap)` is implemented in `watchlists.js`; called on Watchlists screen open. Evaluation is a no-op until SPEC-027 price cache is available (priceMap will be empty).
- [x] An armed alert with `direction === 'above'` transitions to **triggered** when `currentPrice >= threshold`. An armed alert with `direction === 'below'` transitions to **triggered** when `currentPrice <= threshold`.
- [x] Triggered alerts surface as banners at the top of the WatchlistDetail screen (one per triggered alert, showing ticker, condition). Banner has Rearm / Dismiss buttons.
- [x] The Investments dropdown trigger badges the count of all currently-triggered alerts across all watchlists. The badge clears when the user clears the alerts (dismiss = delete; rearm = back to armed).
- [x] Triggered alerts also show inline on their watchlist row with a coloured pip and a "rearm" / "delete" pair of buttons.

### Alerts: phased upgrade path
- [x] The data model is identical regardless of evaluation strategy. Future phases — Tauri local notifications on mobile, then server-side push — only change *who* runs the evaluation pass and how the user is notified, not what is stored. SPEC-030 v1 ships with **Phase A** (on-open) only.

### Storage usage card
- [x] A "Watchlists" card is added in **Settings → Storage tab**. Shape: `Watchlists  N lists, M stocks, K alerts   X.X KB   [Delete all]`.
- [x] The "Delete all" action wipes all watchlists, all entries, and all alerts after confirmation. Individual watchlists / entries / alerts are managed from the Watchlists screen, not the storage card.

### Data portability
- [x] `watchlists`, `watchlistEntries`, and `watchlistAlerts` are added to the export bundle (SPEC-016) and to import.

## UI / Screens

Investments dropdown (desktop top nav):

```
... Bills  [Investments v]  Settings ...
                +-----------------------+
                | Investments overview  |
                | Portfolios            |
                | Watchlists       (3)  |  <- triggered-alert badge
                +-----------------------+
```

Watchlists screen — list view:

```
Watchlists                                     [+ New list]

 [ Buy candidates    ]                                 *
 [ EU tech           ]
 [ Long-term watch   ]
```

Watchlist detail:

```
< Back   Buy candidates                       [Rename] [Delete]

  + Add stock: [ AAPL or Apple ...                          ]

  AAPL   Apple Inc.       NASDAQ    $182.50    +1.2%   <= $150, >= $200      [x]
  ASML   ASML Holding     AEX       EUR 612    -0.4%   no alerts             [x]
  ...

  TRIGGERED  AAPL crossed >= $200 (now $201.40)        [Rearm] [Dismiss]
```

Add-alert popover (per row):

```
+-----------------------------------+
| AAPL alert                        |
|   Direction: (*) above ( ) below  |
|   Threshold: [ 200      ] USD     |
|              [Cancel]   [Save]    |
+-----------------------------------+
```

In-app banner (any screen):

```
ALERT  AAPL crossed >= $200 (now $201.40)            [Open] [Dismiss]
       ASML crossed <= EUR 600 (now EUR 598.20)      [Open] [Dismiss]
```

## Data

Three new collections in localStorage:

```
rmoney_watchlists          [
  { id, name, order, createdAt }
]

rmoney_watchlist_entries   [
  { id, watchlistId, ticker, addedAt }
]

rmoney_watchlist_alerts    [
  {
    id,
    watchlistEntryId,
    direction: 'above' | 'below',
    threshold: number,
    currency: string,
    status: 'armed' | 'triggered',
    createdAt: ISO timestamp,
    triggeredAt: ISO timestamp | null
  }
]
```

`stockProfiles` is read but not modified by SPEC-030; it's owned by SPEC-029.

## Out of Scope
- **Percentage-move alerts** (e.g. "−5% intraday"). v1 supports price thresholds only.
- **Event alerts** (dividend declared, news, earnings date, corporate actions).
- **Recurring alerts** that re-fire on every threshold crossing. v1 is one-shot — once triggered, the alert stays triggered until the user dismisses or rearms.
- **Cross-currency alerts** — alerts are evaluated in the stock's native trade currency only.
- **Background polling while the app is open** (Phase B). v1 evaluates on screen open only.
- **OS-level notifications** (Tauri local notifications, mobile push, desktop notifications). The data model is forward-compatible; runtime is added in a later phase.
- **Server-side / cloud-side alert evaluation** while the app is closed.
- **Sharing watchlists** between users.
- **Annotations / notes** on individual watchlist entries.
- **Sorting** entries within a watchlist by columns. v1 keeps insertion order, with drag-to-reorder added later if requested.

## Open Questions
None.
