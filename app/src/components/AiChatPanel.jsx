import { useState, useRef, useEffect } from 'react'
import { getAiConnection, getSelectedAiPromptId, setSelectedAiPromptId } from '../data/settings'
import { getSecret } from '../utils/secrets'
import { getAiSystemPrompts, createAiSystemPrompt, updateAiSystemPrompt, getDefaultAiSystemPromptId } from '../data/aiSystemPrompts'
import {
  getChatsForTicker, createChat, addMessage, replaceLastMessage,
  setPinned, deleteChat, deleteUnpinnedChatsForTicker,
  getChatSummaryForTicker,
} from '../data/aiChats'
import { fmtAmt } from '../utils/format'
import { computeDividendDerived } from '../data/dividends'
import styles from './AiChatPanel.module.css'

const TURN_WARN = 20

const DEFAULT_SYSTEM_PROMPT = 'You are a concise financial advisor. Analyse the provided portfolio data and give a brief, honest evaluation of the stock position. Focus on key metrics, risks, and opportunities. 3–5 paragraphs max.'

export default function AiChatPanel({ ticker, currency, positions, dividends, myAssignments, allPortfolios, onNavigate }) {
  const aiConn = getAiConnection()
  const configured = !!(aiConn?.enabled)

  const [chats, setChats]                   = useState(() => getChatsForTicker(ticker))
  const [activeChatId, setActiveChatId]     = useState(() => getChatsForTicker(ticker)[0]?.id ?? null)
  const [inputText, setInputText]           = useState('')
  const [isLoading, setIsLoading]           = useState(false)
  const [historyOpen, setHistoryOpen]       = useState(false)
  const [confirmDel, setConfirmDel]         = useState(null)  // { chatId, pinned }
  const [prompts, setPrompts]               = useState(() => getAiSystemPrompts())
  const [selectedPromptId, setSelectedPromptIdState] = useState(() => getSelectedAiPromptId() ?? getDefaultAiSystemPromptId())
  const [promptEditOpen, setPromptEditOpen] = useState(false)
  const [editingPrompt, setEditingPrompt]   = useState(null)

  const threadRef = useRef(null)

  const activeChat  = chats.find(c => c.id === activeChatId) ?? null
  const messages    = activeChat?.messages ?? []
  const promptLocked = messages.some(m => m.role === 'assistant')
  const userTurns   = messages.filter(m => m.role === 'user').length
  const isNewChat   = activeChatId === null  // pending new chat, not yet persisted

  const storageSummary = getChatSummaryForTicker(ticker)

  // Scroll thread to bottom whenever messages change or loading starts
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages.length, isLoading])

  // ─── Data helpers ────────────────────────────────────────────────────────────

  function refreshChats(keepActiveId) {
    const fresh = getChatsForTicker(ticker)
    setChats(fresh)
    // keep active selection if it still exists, else pick newest
    if (keepActiveId && fresh.some(c => c.id === keepActiveId)) return
    setActiveChatId(fresh[0]?.id ?? null)
  }

  // ─── Prompt helpers ──────────────────────────────────────────────────────────

  function handlePromptChange(id) {
    setSelectedPromptIdState(id)
    setSelectedAiPromptId(id)
  }

  function startEditSelected() {
    const p = prompts.find(p => p.id === selectedPromptId)
    if (!p) return
    setEditingPrompt({ id: p.id, name: p.name, content: p.content })
    setPromptEditOpen(true)
  }

  function startNewPrompt() {
    setEditingPrompt({ id: null, name: '', content: '' })
    setPromptEditOpen(true)
  }

  function savePromptEdit() {
    if (!editingPrompt.name.trim()) return
    let savedId
    if (editingPrompt.id) {
      updateAiSystemPrompt(editingPrompt.id, { name: editingPrompt.name, content: editingPrompt.content })
      savedId = editingPrompt.id
    } else {
      const created = createAiSystemPrompt({ name: editingPrompt.name, content: editingPrompt.content })
      savedId = created.id
    }
    setPrompts(getAiSystemPrompts())
    handlePromptChange(savedId)
    setPromptEditOpen(false)
    setEditingPrompt(null)
  }

  // ─── Chat history actions ────────────────────────────────────────────────────

  function handleNewChat() {
    setActiveChatId(null)
    setInputText('')
    setHistoryOpen(false)
  }

  function handleSelectChat(id) {
    setActiveChatId(id)
    setHistoryOpen(false)
    setInputText('')
  }

  function handlePinToggle(chatId, pinned) {
    setPinned(chatId, !pinned)
    refreshChats(chatId)
  }

  function requestDeleteChat(chatId, isPinned) {
    setConfirmDel({ chatId, isPinned })
    setHistoryOpen(false)
  }

  function confirmDeleteChat() {
    const { chatId } = confirmDel
    const wasActive = chatId === activeChatId
    deleteChat(chatId)
    setConfirmDel(null)
    if (wasActive) setActiveChatId(null)
    refreshChats(null)
  }

  // ─── Send message ─────────────────────────────────────────────────────────────

  async function handleSend() {
    const conn = getAiConnection()
    if (!conn?.enabled || isLoading) return
    if (userTurns >= TURN_WARN && !isFirstTurnOfChat()) return // blocked when extremely long? no — spec says warn not block

    const selected = prompts.find(p => p.id === selectedPromptId)
    const systemPrompt = selected?.content?.trim() || DEFAULT_SYSTEM_PROMPT

    // Build user message content
    let userContent
    if (isFirstTurnOfChat()) {
      const stockCtx = buildStockContext()
      userContent = inputText.trim()
        ? `${stockCtx}\n\nSpecifically: ${inputText.trim()}`
        : stockCtx
    } else {
      if (!inputText.trim()) return
      userContent = inputText.trim()
    }

    const title = isFirstTurnOfChat()
      ? (inputText.trim() ? inputText.trim().slice(0, 30) : `${ticker} evaluation`)
      : undefined

    // Ensure chat exists in storage (create on first send)
    let chatId = activeChatId
    if (chatId === null) {
      const newChat = createChat(ticker, selectedPromptId, title)
      chatId = newChat.id
      setActiveChatId(chatId)
    }

    // Persist the user message immediately so the thread shows it
    addMessage(chatId, { role: 'user', content: userContent })
    setInputText('')
    refreshChats(chatId)
    setIsLoading(true)

    // Build full history for the API request
    const freshChats = getChatsForTicker(ticker)
    const chat = freshChats.find(c => c.id === chatId)
    const history = chat?.messages ?? []

    try {
      const responseText = await sendRequest({ conn, systemPrompt, history })
      addMessage(chatId, { role: 'assistant', content: responseText })
    } catch (err) {
      addMessage(chatId, { role: 'assistant', content: err.message || 'AI evaluation failed', error: true })
    } finally {
      setIsLoading(false)
      refreshChats(chatId)
    }
  }

  async function handleRetry() {
    const conn = getAiConnection()
    if (!conn?.enabled || isLoading || !activeChatId) return
    const selected = prompts.find(p => p.id === selectedPromptId)
    const systemPrompt = selected?.content?.trim() || DEFAULT_SYSTEM_PROMPT
    const history = messages.slice(0, -1)  // exclude the error message
    setIsLoading(true)
    try {
      const responseText = await sendRequest({ conn, systemPrompt, history })
      replaceLastMessage(activeChatId, { role: 'assistant', content: responseText })
    } catch (err) {
      replaceLastMessage(activeChatId, { role: 'assistant', content: err.message || 'AI evaluation failed', error: true })
    } finally {
      setIsLoading(false)
      refreshChats(activeChatId)
    }
  }

  function isFirstTurnOfChat() {
    return messages.length === 0
  }

  function buildStockContext() {
    const posText = positions.length > 0
      ? positions.map(({ account, pos }) =>
          `  - ${account.name}: ${trimDec(pos.shares)} shares, avg cost ${fmtAmt(pos.avgCost)}, total cost ${fmtAmt(pos.shares * pos.avgCost)} ${pos.currency}`
        ).join('\n')
      : '  None'

    const divText = dividends.slice(0, 4).map(d => {
      const { netTotal } = computeDividendDerived(d)
      return `  - ${d.payoutDate}: ${fmtAmt(d.dividendPerShare)}/sh × ${trimDec(d.shareCount)}, net ${fmtAmt(netTotal)} ${d.currency}`
    }).join('\n') || '  None'

    const portfolioText = myAssignments.length > 0
      ? myAssignments.map(a => getPortfolioPath(a.portfolioId, allPortfolios)).join(', ')
      : 'None'

    return `Please evaluate ${ticker} stock based on my portfolio data:\n\nTicker: ${ticker}\nCurrency: ${currency || 'unknown'}\n\nMy positions:\n${posText}\n\nRecent dividends (last 4):\n${divText}\n\nPortfolio memberships: ${portfolioText}\n\nPlease give me a brief investment evaluation of this stock based on my current position.`
  }

  // ─── API request ─────────────────────────────────────────────────────────────

  async function sendRequest({ conn, systemPrompt, history }) {
    const isAnthropic = conn.endpointUrl.includes('anthropic')
    const isOpenAI    = conn.endpointUrl.includes('openai.com')
    const headers     = { 'Content-Type': 'application/json' }
    let body, fetchUrl = conn.endpointUrl

    if (import.meta.env.DEV) {
      if (isAnthropic) fetchUrl = conn.endpointUrl.replace('https://api.anthropic.com', '/ai-proxy/anthropic')
      else if (isOpenAI) fetchUrl = conn.endpointUrl.replace('https://api.openai.com', '/ai-proxy/openai')
    }

    const apiKey = await getSecret('ai/apiKey')

    if (isAnthropic) {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'

      // Attach cache_control to system block and first user message for prompt caching
      const system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
      const messages = history.map((m, i) => {
        if (i === 0 && m.role === 'user') {
          return { role: 'user', content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
        }
        return { role: m.role, content: m.content }
      })
      body = { model: conn.model, max_tokens: 1024, system, messages }
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(m => ({ role: m.role, content: m.content })),
      ]
      body = { model: conn.model, max_tokens: 1024, messages }
    }

    const response = await fetch(fetchUrl, { method: 'POST', headers, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `Request failed (${response.status})`)

    const text = data?.choices?.[0]?.message?.content ?? data?.content?.[0]?.text
    if (!text) throw new Error('AI evaluation failed: unexpected response format')
    return text
  }

  // ─── Derived display ──────────────────────────────────────────────────────────

  const storageLine = storageSummary.count > 0
    ? `${fmtBytes(storageSummary.bytes)} · ${storageSummary.count} chat${storageSummary.count !== 1 ? 's' : ''}${storageSummary.pinned > 0 ? ` (${storageSummary.pinned} 📌)` : ''}`
    : null

  // ─── Not-configured placeholder ──────────────────────────────────────────────

  if (!configured) {
    return (
      <div className={styles.placeholder}>
        <span className={styles.placeholderIcon}>🤖</span>
        <p className={styles.placeholderText}>AI evaluation isn&apos;t set up</p>
        {onNavigate && (
          <button className={styles.placeholderLink} onClick={() => onNavigate('settings', { tab: 'ai' })}>
            Configure in Settings →
          </button>
        )}
      </div>
    )
  }

  // ─── Chat panel ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.panel}>

      {/* Header: storage + prompts + history */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.headerTitle}>AI evaluation</span>
          {storageLine && <span className={styles.storageIndicator}>{storageLine}</span>}
        </div>

        {/* Prompt controls */}
        <div className={styles.promptRow}>
          <select
            className={styles.promptSelect}
            value={selectedPromptId}
            onChange={e => handlePromptChange(e.target.value)}
            disabled={promptLocked}
            title={promptLocked ? 'Start a new chat to use a different prompt' : undefined}
          >
            {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className={styles.iconBtn} onClick={startEditSelected}>Edit</button>
          <button className={styles.iconBtn} onClick={startNewPrompt}>+ New</button>
          {onNavigate && (
            <button className={styles.iconBtn} onClick={() => onNavigate('settings', { tab: 'ai', focusPromptId: selectedPromptId })}>
              Settings ↗
            </button>
          )}
        </div>

        {/* Chat history row */}
        <div className={styles.historyRow}>
          <div className={styles.historyDropdownWrap}>
            <button
              className={styles.historyBtn}
              onClick={() => setHistoryOpen(v => !v)}
              disabled={chats.length === 0}
            >
              {activeChat ? chatTitle(activeChat) : 'New chat'} {chats.length > 0 ? '▾' : ''}
            </button>
            {historyOpen && (
              <div className={styles.historyDropdown}>
                {chats.map(c => (
                  <div key={c.id} className={`${styles.historyItem} ${c.id === activeChatId ? styles.historyItemActive : ''}`}>
                    <button className={styles.historyItemTitle} onClick={() => handleSelectChat(c.id)}>
                      {c.pinned ? '📌 ' : ''}{chatTitle(c)}
                    </button>
                    <button
                      className={styles.historyIconBtn}
                      onClick={() => handlePinToggle(c.id, c.pinned)}
                      title={c.pinned ? 'Unpin' : 'Pin this chat'}
                    >
                      {c.pinned ? '📌' : '☆'}
                    </button>
                    <button
                      className={`${styles.historyIconBtn} ${styles.historyDeleteBtn}`}
                      onClick={() => requestDeleteChat(c.id, c.pinned)}
                      title="Delete chat"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className={styles.newChatBtn} onClick={handleNewChat}>+ New chat</button>
        </div>
      </div>

      {/* Message thread */}
      <div className={styles.thread} ref={threadRef}>
        {messages.length === 0 && !isLoading && (
          <p className={styles.threadEmpty}>
            {isNewChat
              ? 'Type a question below or send empty to evaluate with the default stock context.'
              : 'No messages in this chat.'}
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>
            {m.error ? (
              <>
                <span className={styles.errorText}>{m.content}</span>
                {i === messages.length - 1 && (
                  <button className={styles.retryBtn} onClick={handleRetry} disabled={isLoading}>Retry</button>
                )}
              </>
            ) : m.content}
          </div>
        ))}

        {isLoading && (
          <div className={styles.assistantBubble}>
            <span className={styles.typingIndicator}>
              <span /><span /><span />
            </span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className={styles.inputArea}>
        {userTurns >= TURN_WARN && (
          <p className={styles.turnWarning}>
            Long conversations cost more — consider starting a new chat.
          </p>
        )}
        <div className={styles.inputRow}>
          <textarea
            className={styles.textarea}
            rows={3}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend() }}
            placeholder={isFirstTurnOfChat()
              ? 'Type a question, or leave empty to evaluate with stock context…'
              : 'Follow-up question…'}
            disabled={isLoading}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={isLoading || (!isFirstTurnOfChat() && !inputText.trim())}
          >
            {isLoading ? '…' : 'Send'}
          </button>
        </div>
      </div>

      {/* Inline prompt editor */}
      {promptEditOpen && editingPrompt && (
        <div className={styles.promptEditorOverlay}>
          <div className={styles.promptEditor}>
            <div className={styles.promptEditorHeader}>
              <span className={styles.promptEditorTitle}>{editingPrompt.id ? 'Edit prompt' : 'New prompt'}</span>
              {onNavigate && (
                <button className={styles.linkBtn} onClick={() => { onNavigate('settings', { tab: 'ai', focusPromptId: selectedPromptId }); setPromptEditOpen(false) }}>
                  Bigger editor in Settings ↗
                </button>
              )}
            </div>
            <input
              className={styles.promptNameInput}
              value={editingPrompt.name}
              onChange={e => setEditingPrompt({ ...editingPrompt, name: e.target.value })}
              placeholder="Prompt name"
              autoFocus
            />
            <textarea
              className={styles.promptTextarea}
              rows={6}
              value={editingPrompt.content}
              onChange={e => setEditingPrompt({ ...editingPrompt, content: e.target.value })}
              placeholder="You are a..."
            />
            <div className={styles.promptEditorActions}>
              <button className={styles.cancelBtn} onClick={() => { setPromptEditOpen(false); setEditingPrompt(null) }}>Cancel</button>
              <button className={styles.saveBtn} onClick={savePromptEdit} disabled={!editingPrompt.name.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDel && (
        <div className={styles.promptEditorOverlay}>
          <div className={styles.confirmDialog}>
            <p className={styles.confirmMsg}>
              {confirmDel.isPinned
                ? 'This chat is pinned. Delete it anyway? This cannot be undone.'
                : 'Delete this chat? This cannot be undone.'}
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={confirmDeleteChat}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chatTitle(chat) {
  const firstUserMsg = chat.messages.find(m => m.role === 'user')
  if (!firstUserMsg) return chat.title || 'New chat'
  // Try to extract user-typed portion (after "Specifically: ")
  const match = firstUserMsg.content.match(/\nSpecifically:\s(.+)/)
  const text = match ? match[1] : null
  if (text) return text.slice(0, 30)
  // If this is a pure stock context message, fall back to the stored title
  return chat.title || relativeTime(chat.createdAt)
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function trimDec(n) {
  const num = Number(n)
  return num % 1 === 0 ? String(num) : num.toFixed(6).replace(/\.?0+$/, '')
}

function getPortfolioPath(portfolioId, portfolios) {
  const parts = []
  let current = portfolios.find(p => p.id === portfolioId)
  while (current) {
    parts.unshift(current.name)
    current = portfolios.find(p => p.id === current.parentId)
  }
  return parts.join(' › ')
}
