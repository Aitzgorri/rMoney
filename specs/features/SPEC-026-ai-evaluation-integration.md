---
id: SPEC-026
name: AI Evaluation Integration
status: done
created: 2026-04-23
---

# AI Evaluation Integration

## Goal
Let the user plug an external AI connection (provider endpoint + API key) into the app so they can hold a **multi-turn conversation** about a stock on its stock page (SPEC-021). One connection per user, configured in More → Settings under the **AI tab** (Settings is grouped into tabs by topic — see UI section). The conversation is optional: the AI chat panel is shown only when a connection is configured; otherwise a placeholder takes the same screen real estate and links to Settings.

The user can manage **named system prompts**: create, rename, edit, delete. One prompt is selected at any time; its text is sent as the `system` message with each request in a conversation. Prompts can be managed from two places:
- **Settings → AI tab**: full prompt list with a large editor (room for long prompts).
- **Stock page**: a quick selector dropdown in the AI panel header, plus a compact inline editor for fast tweaks; an "Open in Settings" shortcut deep-links to the AI tab with the selected prompt focused for full-size editing.

Each stock holds up to **3 unpinned chats** (rolling FIFO eviction) plus an unbounded number of **pinned chats** the user has explicitly chosen to retain. Chats persist in localStorage across sessions and are included in the SPEC-016 export. The user can see how much storage chats occupy from a "Storage usage" card in Settings → General, with per-stock breakdown and bulk cleanup actions.

## User Stories
- As a user, I can add an AI connection in Settings → AI by providing a provider name, endpoint URL, model name, and API key, so the app knows how to call my AI.
- As a user, I can hold a back-and-forth conversation with the AI about a stock from the stock page — the first turn is seeded with the stock context (ticker, latest price, my position, recent returns, dividend history) and I can ask follow-up questions in the same thread.
- As a user, I can type my own question in the textarea before sending the first turn, so my question is appended to the auto-built stock context — the AI always sees the context.
- As a user, I can edit the connection — rotate the API key, change the endpoint or model — without creating a new connection.
- As a user, I can delete the connection, and the AI panel collapses to a placeholder pointing me to Settings.
- As a user without a connection configured, I see a placeholder in the AI panel area inviting me to configure it — no functional buttons are exposed.
- As a user, I can create multiple named system prompts (e.g. "Conservative dividend investor", "Growth-stock contrarian", "Concise analyst") and choose which one a new chat uses.
- As a user, I can manage prompts from Settings → AI (large editor for long prompts) or quickly from the stock page (compact inline editor for fast tweaks).
- As a user, I can click "Open in Settings" on the stock page to jump straight to the AI tab with the current prompt focused for editing in a roomier window.
- As a user, the app retains my **last 3 chats per stock** automatically, plus any chats I explicitly pin, so I can come back to a previous evaluation without paying for it again.
- As a user, I can pin a chat to keep it past the 3-chat rolling window, and I can unpin it later — unpinning makes it eligible for eviction the next time a new chat starts.
- As a user, I can see how much localStorage my AI chats occupy in Settings → General (per-stock breakdown + total), and I can bulk-delete unpinned or all chats from there.
- As a user, I can see at a glance how much storage the current stock's chats use, in the AI panel header on the stock page.

## Acceptance Criteria

### Connection (Phase 19a — built)
- [x] Exactly **one** AI connection per user. There is no list of connections in Phase 2 — it's "zero or one." — `getAiConnection()`/`setAiConnection()` in `data/settings.js`
- [x] More → Settings → AI evaluation: fields for provider name (free text), endpoint URL (required, must be https://), model name (free text — e.g. `claude-opus-4-7`, `gpt-5`, `llama-3.1-70b`), and API key (required, masked input). — AI Evaluation card in `screens/Settings.jsx` with enabled/disabled radio, Show/Hide API key toggle, Save/Delete buttons
- [x] The connection is saved in localStorage as part of app settings (see SPEC-016 for export inclusion). — stored via `setSetting('aiConnection', ...)` inside `rmoney_settings`
- [x] On request error (network, 4xx, 5xx, malformed response), the panel shows the provider's error text (or a generic "AI evaluation failed" message) and a "Retry" button.
- [x] Delete action in Settings clears all connection fields; the AI panel on stock pages collapses to the not-configured placeholder.

### Tabbed Settings layout (Phase 19a — built)
- [x] Settings screen is organised into horizontal tabs at the top: **General** (Planning Period, Currency, Category Budgets), **Investments** (Dividends, Import Templates), **AI** (AI Evaluation, System Prompts, Chat storage). Active tab is preserved while the screen is open.
- [x] Settings can be deep-linked: `navigate('settings', { tab: 'ai', focusPromptId })` opens the AI tab and scrolls/focuses the named prompt for editing.

### System prompts (Phase 19a — built)
- [x] System prompts are stored as a CRUD collection (`{ id, name, content, createdAt, updatedAt }`) in `data/aiSystemPrompts.js`. The collection is seeded with one built-in **Default** prompt (the previously hardcoded text) which cannot be deleted but can be edited.
- [x] Settings → AI shows a list of all prompts with rename, delete, and a full-width multi-line content editor (14-row textarea, ≥240px min-height, vertical-resizable so long prompts are practical to read and edit).
- [x] The currently selected prompt's id is stored in app settings (`selectedAiPromptId`). When unset, the Default prompt is used.
- [x] Stock page provides three inline actions next to the selector: **Edit** (opens an inline editor pre-filled with the selected prompt), **+ New** (opens an empty inline editor), **Open in Settings ↗** (navigates to Settings → AI with the selected prompt focused).
- [x] Inline editor on the stock page shows a small textarea (~6 rows) plus name input and Save/Cancel buttons, with a "Bigger editor in Settings ↗" link. For longer edits the user uses "Open in Settings".
- [x] System prompts are included in the data export/import (SPEC-016) — `aiSystemPrompts` key in portability.

### Conversation mode (Phase 19b — complete)
- [x] The AI panel is rendered on the stock page **always**, in the right column of the page (see SPEC-021 layout). It is never hidden — it shows either the chat UI (when a connection exists and `enabled` is true) or a not-configured placeholder.
- [x] When the panel is in chat mode, it shows: a header (active prompt selector + chat-history dropdown + storage indicator + "+ New chat" + ⚙ "Open in Settings ↗"), a scrollable thread of message bubbles (user right-aligned, assistant left-aligned), and at the bottom a textarea with a Send button.
- [x] Sending a message appends a `user` message to the active chat's `messages[]`, then sends a request to the configured endpoint with the **full message history** (system prompt + every prior turn + the new user message) and appends the `assistant` response when it arrives.
- [x] The very first user turn in a fresh chat always includes the auto-built stock context (ticker, currency, position summary, last 4 dividends, portfolio memberships). If the textarea is non-empty when the user sends the first turn, the user's text is appended to the auto-built block as a "Specifically: …" suffix. If the textarea is empty, only the auto-built block is sent.
- [x] While a request is in flight, the textarea is disabled and a typing indicator is shown in the thread; the Send button shows a spinner.
- [x] The request body matches the existing Anthropic / OpenAI shape detection: Anthropic gets `system` + `messages[]` with `x-api-key` + `anthropic-version`; other endpoints get a `messages[]` (system + turns) with `Authorization: Bearer <apiKey>`. Response parsing reuses the existing `choices[0].message.content` / `content[0].text` logic.
- [x] On request error, the assistant turn shows an inline error bubble with a "Retry" button. Retrying re-sends the same history without appending anything new on success/failure.
- [x] Once a chat has at least one assistant turn, the **prompt selector is locked** for that chat (read-only, with a hint: "Start a new chat to use a different prompt"). Switching prompts mid-conversation is not allowed.
- [x] When a chat reaches **20 user turns**, a soft warning banner appears above the textarea: "Long conversations cost more — consider starting a new chat." This is informational; sending is not blocked.

### Prompt caching (Phase 19b — complete)
- [x] **Anthropic endpoints only:** the `system` block and the first `user` message (the stock-context block) are marked with `cache_control: { type: "ephemeral" }` so the cached prefix is reused across turns within a 5-minute window. This applies to the second and later turns in a chat — there is no cache write benefit on the very first turn.
- [x] OpenAI-compatible endpoints rely on the provider's automatic caching (no `cache_control` field is sent). The cost-saving asymmetry is documented in code comments and surfaced briefly to the user via a tooltip on the storage indicator.
- [x] Switching system prompts on a fresh new chat invalidates any cached prefix from earlier chats — the spec does not require coordinating cache TTLs across chats.

### Chat retention and pinning (Phase 19b — complete)
- [x] Chats persist in localStorage as `aiChats[ticker] = [chat, chat, …]`. Each chat has shape: `{ id, ticker, promptId, pinned: boolean, createdAt, updatedAt, messages: [{ role, content, ts }] }`.
- [x] Eviction rule on **+ New chat**: if the count of *unpinned* chats for the stock is ≥ 3, drop the oldest unpinned (by `createdAt`) before adding the new chat. Pinned chats are skipped during eviction and never auto-deleted.
- [x] A chat is created (and added to the array) only after the user sends its first message; clicking "+ New chat" without sending discards the empty thread.
- [x] Each chat has a pin toggle (📌). Pinning is a flag flip; the chat keeps its position in the array. Unpinning is also a flag flip — the chat is *not* immediately evicted; it becomes eligible for eviction the next time the user creates a new chat that pushes the unpinned count over 3.
- [x] Each chat has a per-row delete (✕) action available from the chat-history dropdown on the stock page; deleting a pinned chat shows an extra confirmation ("This chat is pinned. Delete it?").
- [x] The chat-history dropdown lists pinned chats first (with 📌), then unpinned in `createdAt`-descending order. Each row's title is the first ~30 characters of the chat's first user message (excluding the auto-built stock-context block); falls back to a relative timestamp if no user text was provided.

### Storage usage view (Phase 19b — complete)
- [x] Sizes are computed via `new Blob([JSON.stringify(value)]).size` (UTF-8 bytes) — this method is documented in the spec so future categories use the same definition.
- [x] **Stock page:** the AI panel header shows an inline indicator like `📦 24 KB · 3 chats (1 pinned)` whenever a connection is configured and at least one chat exists for the stock. Recomputed on every render from in-memory data.
- [x] **Settings → Storage tab → "AI chat storage" card:** a table with one row per stock that has at least one chat. Columns: stock ticker, total bytes, chat count (e.g. "3 chats, 1 pinned"). Below the per-stock rows: a subtotal row.
- [x] Each per-stock row has two cleanup buttons: **Delete unpinned** (light confirm) and **Delete all** (strong confirm naming pinned-chat count).
- [x] The AI-chats subtotal row has the same two buttons, applied across all stocks.
- [x] When a future feature adds a new persistent collection, that feature MUST add a new card to Settings → Storage tab. This convention is documented in CLAUDE.md (project-wide "Data persistence convention").
- [x] Empty state: when no stock has any chats, the AI-chats category shows a single muted row "No chats stored." rather than disappearing — keeps the UI predictable.

### Not-configured placeholder (Phase 19b — complete)
- [x] When the AI connection is missing or `enabled` is false, the right-column AI panel shows a centered placeholder: a small icon, a one-line message ("AI evaluation isn't set up"), and a "Configure in Settings →" link that navigates to Settings → AI tab.
- [x] The placeholder occupies the same column width / vertical space as the chat panel so the page layout doesn't shift when the user enables/disables AI.

## UI / Screens
More → Settings → AI tab (connection card unchanged):

```
AI evaluation
  Status: (o) Enabled   ( ) Disabled
  Provider name:   [Anthropic Claude      ]
  Endpoint:        [https://api.anthropic.com/v1/messages]
  Model:           [claude-opus-4-7       ]
  API key:         [••••••••••••••••••]   [Show]
                                                    [Save]   [Delete connection]
```

More → Settings → Storage tab → AI chat storage card:

```
AI chat storage
+----------------------------------------------------------+
|   AAPL  ............... 47 KB   3 chats           [Del unpinned] [Del all] |
|   OWL   ............... 24 KB   2 chats, 1 pinned [Del unpinned] [Del all] |
|   MSFT  ...............  8 KB   1 chat            [Del unpinned] [Del all] |
|   ─────────────────────────────────────────────────────── |
|   Total               79 KB  6 chats              [Del all unpinned] [Del all] |
+----------------------------------------------------------+
```

Stock page right column — chat panel (when AI is configured and enabled; SPEC-021 owns the page layout):

```
+----------------------------------------------------------+
| AI evaluation                  📦 24 KB · 3 chats (1 📌) |
| Prompt: [Default ▾]  [Edit] [+ New] [Open in Settings ↗] |
| Chat:   [💬 Today 14:32 ▾] [+ New chat]                  |
| ──────────────────────────────────────────────────────── |
|                                                          |
|  ┌────────────────────────────────────────────────────┐  |
|  │ AAPL — currency USD                                │  |
|  │ Position: 50 sh @ $165 avg, total cost $8,250.     │  |
|  │ Last 4 dividends: …                                │  |
|  │ Portfolios: Tech, Core.                            │  |
|  │ Specifically: how safe is the dividend?            │  |
|  └────────────────────────────────────────────────────┘  |
|                                                          |
|         ┌────────────────────────────────────────────┐   |
|         │ The dividend looks well-covered: payout    │   |
|         │ ratio is ~16%, FCF growth is positive…     │   |
|         └────────────────────────────────────────────┘   |
|                                                          |
|  ┌────────────────────────────────────────────────────┐  |
|  │ What about a recession scenario?                   │  |
|  └────────────────────────────────────────────────────┘  |
|         ┌────────────────────────────────────────────┐   |
|         │ Apple has historically maintained or       │   |
|         │ raised…                                    │   |
|         └────────────────────────────────────────────┘   |
|                                                          |
| ──────────────────────────────────────────────────────── |
| [ Type a question or send empty for a fresh evaluation ] |
| [_________________________________________]   [ Send ]   |
+----------------------------------------------------------+
```

Stock page right column — placeholder (when AI is not configured or disabled):

```
+----------------------------------------------------------+
|                                                          |
|                          🤖                              |
|              AI evaluation isn't set up                  |
|                                                          |
|              [ Configure in Settings → ]                 |
|                                                          |
+----------------------------------------------------------+
```

## Data

`settings.aiConnection`:

```
{
  providerName: string,
  endpointUrl: string,
  model: string,
  apiKey: string,
  enabled: boolean,
  updatedAt: ISO timestamp
} | null
```

`aiChats` (new collection, keyed by ticker):

```
{
  [ticker: string]: [
    {
      id: string,                     // uuid
      ticker: string,                 // redundant with the key, kept for export integrity
      promptId: string,               // id of the system prompt active when the chat started; locked for the chat's lifetime
      pinned: boolean,                // user-toggled retention flag
      createdAt: ISO timestamp,
      updatedAt: ISO timestamp,
      messages: [
        { role: "user" | "assistant", content: string, ts: ISO timestamp, error?: string }
      ]
    }
  ]
}
```

Stored in localStorage as `rmoney_aiChats`. Included in SPEC-016 exports.

**Storage size methodology:** all sizes shown in the Storage usage view are computed via `new Blob([JSON.stringify(value)]).size` (UTF-8 bytes). This is the canonical definition for the project — any new feature added to the Storage usage card MUST use the same method so values are comparable and the total is meaningful.

**Retention rule:** for each ticker, count `messages.filter(m => !m.pinned).length`. When the user creates a new chat (sends its first message), if that count is already ≥ 3, drop the oldest unpinned chat by `createdAt` before appending the new one. Pinned chats are skipped during eviction and never auto-deleted; they can only be removed via the per-chat ✕ action or the bulk "Delete all" button in Storage usage.

**Caching:** request bodies for Anthropic endpoints attach `cache_control: { type: "ephemeral" }` to the `system` block and the first `user` message (the stock-context block). No client-side response cache — each Send hits the provider; the provider's prompt cache is what saves cost on repeat prefixes.

## Out of Scope
- Per-stock prompt templates. The prompt is built from a fixed template in Phase 2. Per-stock overrides (e.g. "always ask about dividend safety" on a specific stock) are a future enhancement.
- Multi-provider routing / fallback (unlike SPEC-027 for market data). Exactly one AI endpoint is configured.
- Streaming responses. The app waits for the full response before rendering each turn.
- Automatic AI evaluations (e.g. "run weekly evals on all my stocks and email me"). Everything is user-triggered.
- Cost/usage tracking inside the app. The user manages that on the provider side. (Storage size is shown, but token spend is not.)
- Client-side response caching. Each Send hits the provider; we rely only on the provider's prompt-cache (Anthropic) for repeat-prefix savings.
- Cross-stock chats. A chat belongs to exactly one stock (its ticker is part of the key); there is no global "ask the AI about my whole portfolio" surface in this spec.
- Searching across saved chats. With a 3-unpinned + ad-hoc-pinned model, the chat-history dropdown is enough; full-text search is deferred.
- Hard caps on the number of pinned chats per stock or globally. Manual delete is the only bound, by design.

## Open Questions
None.
