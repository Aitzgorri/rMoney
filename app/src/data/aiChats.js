// Per-stock AI chat history. Each ticker holds up to 3 unpinned chats (rolling
// eviction on new-chat creation) plus unbounded pinned chats.

import appStorage from '../utils/appStorage'

const KEY = 'rmoney_ai_chats'
const MAX_UNPINNED = 3

function load() {
  try { return JSON.parse(appStorage.getItem(KEY)) ?? {} } catch { return {} }
}
function save(data) { appStorage.setItem(KEY, JSON.stringify(data)) }

// ─── Read ─────────────────────────────────────────────────────────────────────

export function getChatsForTicker(ticker) {
  const all = load()[ticker] ?? []
  return [...all].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
}

export function getAllAiChats() {
  return load()
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function createChat(ticker, promptId, title) {
  const all = load()
  const existing = all[ticker] ?? []

  // Eviction: drop oldest unpinned if already at MAX_UNPINNED
  const unpinned = existing
    .filter(c => !c.pinned)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const kept = unpinned.length >= MAX_UNPINNED
    ? existing.filter(c => c.id !== unpinned[0].id)
    : existing

  const chat = {
    id: crypto.randomUUID(),
    ticker,
    promptId,
    pinned: false,
    title: title?.trim() || `${ticker} evaluation`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  }

  save({ ...all, [ticker]: [...kept, chat] })
  return chat
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function addMessage(chatId, { role, content, error }) {
  const all = load()
  for (const ticker of Object.keys(all)) {
    const idx = all[ticker].findIndex(c => c.id === chatId)
    if (idx < 0) continue
    const msg = { role, content, ts: new Date().toISOString() }
    if (error) msg.error = error
    const updated = {
      ...all[ticker][idx],
      messages: [...all[ticker][idx].messages, msg],
      updatedAt: new Date().toISOString(),
    }
    const next = all[ticker].slice()
    next[idx] = updated
    save({ ...all, [ticker]: next })
    return updated
  }
  return null
}

// Replace the last message (used to turn a loading placeholder into an error bubble)
export function replaceLastMessage(chatId, { role, content, error }) {
  const all = load()
  for (const ticker of Object.keys(all)) {
    const idx = all[ticker].findIndex(c => c.id === chatId)
    if (idx < 0) continue
    const msgs = all[ticker][idx].messages
    if (!msgs.length) return null
    const msg = { role, content, ts: new Date().toISOString() }
    if (error) msg.error = error
    const updated = {
      ...all[ticker][idx],
      messages: [...msgs.slice(0, -1), msg],
      updatedAt: new Date().toISOString(),
    }
    const next = all[ticker].slice()
    next[idx] = updated
    save({ ...all, [ticker]: next })
    return updated
  }
  return null
}

// ─── Pinning ──────────────────────────────────────────────────────────────────

export function setPinned(chatId, pinned) {
  const all = load()
  for (const ticker of Object.keys(all)) {
    const idx = all[ticker].findIndex(c => c.id === chatId)
    if (idx < 0) continue
    const next = all[ticker].slice()
    next[idx] = { ...next[idx], pinned, updatedAt: new Date().toISOString() }
    save({ ...all, [ticker]: next })
    return
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteChat(chatId) {
  const all = load()
  for (const ticker of Object.keys(all)) {
    const filtered = all[ticker].filter(c => c.id !== chatId)
    if (filtered.length !== all[ticker].length) {
      save({ ...all, [ticker]: filtered })
      return
    }
  }
}

export function deleteUnpinnedChatsForTicker(ticker) {
  const all = load()
  save({ ...all, [ticker]: (all[ticker] ?? []).filter(c => c.pinned) })
}

export function deleteAllChatsForTicker(ticker) {
  const all = load()
  const next = { ...all }
  delete next[ticker]
  save(next)
}

export function deleteAllUnpinnedChats() {
  const all = load()
  const next = {}
  for (const ticker of Object.keys(all)) {
    const remaining = all[ticker].filter(c => c.pinned)
    if (remaining.length) next[ticker] = remaining
  }
  save(next)
}

export function deleteAllAiChats() {
  save({})
}

// ─── Storage size ─────────────────────────────────────────────────────────────

export function getChatSizeBytes(ticker) {
  const chats = ticker ? (load()[ticker] ?? []) : load()
  return new Blob([JSON.stringify(chats)]).size
}

export function getChatSummaryForTicker(ticker) {
  const chats = load()[ticker] ?? []
  return {
    count: chats.length,
    pinned: chats.filter(c => c.pinned).length,
    bytes: new Blob([JSON.stringify(chats)]).size,
  }
}

export function getStorageSummaryAllTickers() {
  const all = load()
  return Object.entries(all)
    .filter(([, chats]) => chats.length > 0)
    .map(([ticker, chats]) => ({
      ticker,
      count: chats.length,
      pinned: chats.filter(c => c.pinned).length,
      bytes: new Blob([JSON.stringify(chats)]).size,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
}

export function getTotalChatSizeBytes() {
  return new Blob([JSON.stringify(load())]).size
}
