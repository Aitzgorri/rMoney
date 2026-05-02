import { useState, useEffect, useRef } from 'react'
import { getPlanningStartDay, setPlanningStartDay, getMainCurrency, setMainCurrency, getCurrencyDisplay, setCurrencyDisplay, getDividendDefaultTaxPercent, setDividendDefaultTaxPercent, getAiConnection, setAiConnection, getMarketDataProviders, setMarketDataProviders } from '../data/settings'
import { getSecret, setSecret, deleteSecret } from '../utils/secrets'
import { getBudgetWarningThreshold, setBudgetWarningThreshold } from '../data/budgets'
import { getCsvTemplates, canDeleteCsvTemplate, deleteCsvTemplate, updateCsvTemplate, getTemplateUsers } from '../data/csvTemplates'
import { getDefaultCsvDateFormat, setDefaultCsvDateFormat } from '../data/settings'
import { getAiSystemPrompts, createAiSystemPrompt, updateAiSystemPrompt, deleteAiSystemPrompt, canDeleteAiSystemPrompt } from '../data/aiSystemPrompts'
import {
  getStorageSummaryAllTickers, getTotalChatSizeBytes,
  deleteUnpinnedChatsForTicker, deleteAllChatsForTicker,
  deleteAllUnpinnedChats, deleteAllAiChats,
} from '../data/aiChats'
import { getWatchlistStorageSummary, deleteAllWatchlists } from '../data/watchlists'
import { getUserBenchmarks, deleteAllUserBenchmarks, getBenchmarksStorageBytes } from '../data/benchmarks'
import { testProvider } from '../data/marketDataClient'
import { getCacheStats, clearPriceCache, clearAllMarketCaches } from '../utils/marketDataCache'
import { getCallLog, clearCallLog, getLogStorageBytes } from '../utils/marketDataLogger'
import { buildIbkrAuthUrl, getIbkrOAuthStatus } from '../services/providers/ibkr'
import { DATE_FORMATS } from '../utils/csvParse'
import { getCurrentPeriod } from '../utils/planningPeriod'
import { SUPPORTED_CURRENCIES } from '../utils/currency'
import styles from './Settings.module.css'

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

function fmtLogTime(iso) {
  if (!iso) return ''
  return iso.replace('T', ' ').slice(0, 19)
}

const TABS = [
  { id: 'general',     label: 'General' },
  { id: 'investments', label: 'Investments' },
  { id: 'market-data', label: 'Market data' },
  { id: 'ai',          label: 'AI' },
  { id: 'storage',     label: 'Storage' },
]

export default function Settings({ initialTab, focusPromptId, onNavigate }) {
  const [activeTab, setActiveTab] = useState(initialTab && TABS.some(t => t.id === initialTab) ? initialTab : 'general')

  const [startDay, setStartDay] = useState(() => getPlanningStartDay())
  const [warningThreshold, setWarningThreshold] = useState(() => getBudgetWarningThreshold())
  const [mainCurrency, setMainCurrencyState] = useState(() => getMainCurrency())
  const [currencyDisplay, setCurrencyDisplayState] = useState(() => getCurrencyDisplay())
  const [dividendTaxPct, setDividendTaxPctState] = useState(() => getDividendDefaultTaxPercent())
  const [defaultCsvDateFmt, setDefaultCsvDateFmtState] = useState(() => getDefaultCsvDateFormat())
  const [templates,         setTemplates]              = useState(() => getCsvTemplates())
  const [aiConn,          setAiConnForm]        = useState(() => { const c = getAiConnection() ?? {}; return { providerName: c.providerName ?? '', endpointUrl: c.endpointUrl ?? '', model: c.model ?? '', enabled: c.enabled ?? true } })
  const [savedAiConn,     setSavedAiConn]       = useState(() => getAiConnection())
  const [aiApiKeyDraft,   setAiApiKeyDraft]     = useState('')
  const [aiApiKeyEditing, setAiApiKeyEditing]   = useState(false)
  const [aiKeyShowing,    setAiKeyShowing]      = useState(false)
  const [aiRevealedKey,   setAiRevealedKey]     = useState(null)
  const [aiUrlError,      setAiUrlError]        = useState('')
  const [storageSummary,  setStorageSummary]  = useState(() => getStorageSummaryAllTickers())
  const [storageConfirm,  setStorageConfirm]  = useState(null)  // { type: 'ticker-unpinned'|'ticker-all'|'all-unpinned'|'all', ticker?, pinnedCount }
  const [watchlistSummary, setWatchlistSummary] = useState(() => getWatchlistStorageSummary())
  const [watchlistDeleteConfirm, setWatchlistDeleteConfirm] = useState(false)
  const [benchmarkUserCount, setBenchmarkUserCount] = useState(() => getUserBenchmarks().length)
  const [benchmarkBytes,     setBenchmarkBytes]     = useState(() => getBenchmarksStorageBytes())
  const [benchmarkDeleteConfirm, setBenchmarkDeleteConfirm] = useState(false)
  const [renamingId,      setRenamingId]      = useState(null)
  const [renameValue,     setRenameValue]     = useState('')
  const [deletingTpl,     setDeletingTpl]     = useState(null)
  const [prompts,         setPrompts]         = useState(() => getAiSystemPrompts())
  const [editingPrompt,   setEditingPrompt]   = useState(null)  // { id, name, content } — id=null for new
  const [deletingPrompt,  setDeletingPrompt]  = useState(null)  // { id, name, blocked?, reason? }

  // Market data
  const [mdProviders,   setMdProviders]   = useState(() => getMarketDataProviders())
  const [mdShowKey,     setMdShowKey]     = useState({})            // { [id]: boolean }
  const [mdRevealedKey, setMdRevealedKey] = useState({})            // { [id]: string | null }
  const [mdEditing,     setMdEditing]     = useState({})            // { [id]: boolean } — key change mode
  const [mdKeyDraft,    setMdKeyDraft]    = useState({})            // { [id]: string }
  const [mdTestStatus,  setMdTestStatus]  = useState({})            // { [id]: 'testing' | 'ok' | string }
  const [mdCacheStats, setMdCacheStats] = useState(() => getCacheStats())
  const [debugLog,     setDebugLog]     = useState(() => import.meta.env.DEV ? getCallLog() : [])

  const promptRefs = useRef({})

  useEffect(() => {
    if (activeTab === 'market-data' && import.meta.env.DEV) {
      setDebugLog(getCallLog())
    }
  }, [activeTab])

  useEffect(() => {
    if (focusPromptId && activeTab === 'ai') {
      const p = prompts.find(p => p.id === focusPromptId)
      if (p) {
        setEditingPrompt({ id: p.id, name: p.name, content: p.content })
        // Scroll into view after render
        setTimeout(() => promptRefs.current[p.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPromptId])

  function handleStartDayChange(day) {
    const d = Number(day)
    setStartDay(d)
    setPlanningStartDay(d)
  }

  function handleWarningThresholdChange(value) {
    const n = Math.min(100, Math.max(1, Number(value)))
    setWarningThreshold(n)
    setBudgetWarningThreshold(n)
  }

  function handleMainCurrencyChange(code) {
    setMainCurrencyState(code)
    setMainCurrency(code)
  }

  function handleCurrencyDisplayChange(mode) {
    setCurrencyDisplayState(mode)
    setCurrencyDisplay(mode)
  }

  function handleDividendTaxPctChange(value) {
    const n = Math.min(100, Math.max(0, Number(value)))
    setDividendTaxPctState(n)
    setDividendDefaultTaxPercent(n)
  }

  async function handleSaveAiConn() {
    if (!aiConn.endpointUrl.startsWith('https://')) {
      setAiUrlError('Endpoint URL must start with https://')
      return
    }
    setAiUrlError('')
    const keyTrimmed = aiApiKeyDraft.trim()
    if (keyTrimmed) {
      await setSecret('ai/apiKey', keyTrimmed)
      setAiApiKeyDraft('')
      setAiApiKeyEditing(false)
      setAiKeyShowing(false)
      setAiRevealedKey(null)
    }
    const apiKeySet = !!(savedAiConn?.apiKeySet || keyTrimmed)
    setAiConnection({ ...aiConn, apiKeySet })
    setSavedAiConn(getAiConnection())
  }

  async function handleDeleteAiConn() {
    await deleteSecret('ai/apiKey')
    setAiConnection(null)
    setSavedAiConn(null)
    setAiConnForm({ providerName: '', endpointUrl: '', model: '', enabled: true })
    setAiUrlError('')
    setAiApiKeyDraft('')
    setAiApiKeyEditing(false)
    setAiKeyShowing(false)
    setAiRevealedKey(null)
  }

  function startRename(t) {
    setRenamingId(t.id)
    setRenameValue(t.name)
  }

  function saveRename() {
    if (renameValue.trim()) {
      updateCsvTemplate(renamingId, { name: renameValue.trim() })
      setTemplates(getCsvTemplates())
    }
    setRenamingId(null)
  }

  function requestDeleteTpl(t) {
    const { canDelete, reason } = canDeleteCsvTemplate(t.id)
    setDeletingTpl({ id: t.id, name: t.name, blocked: !canDelete, reason })
  }

  function confirmDeleteTpl() {
    deleteCsvTemplate(deletingTpl.id)
    setTemplates(getCsvTemplates())
    setDeletingTpl(null)
  }

  // ─── System prompts ────────────────────────────────────────────────────────

  function startEditPrompt(p) {
    setEditingPrompt({ id: p.id, name: p.name, content: p.content })
  }

  function startNewPrompt() {
    setEditingPrompt({ id: null, name: '', content: '' })
  }

  function savePromptEdit() {
    if (!editingPrompt.name.trim()) return
    if (editingPrompt.id) {
      updateAiSystemPrompt(editingPrompt.id, { name: editingPrompt.name, content: editingPrompt.content })
    } else {
      createAiSystemPrompt({ name: editingPrompt.name, content: editingPrompt.content })
    }
    setPrompts(getAiSystemPrompts())
    setEditingPrompt(null)
  }

  function requestDeletePrompt(p) {
    const { canDelete, reason } = canDeleteAiSystemPrompt(p.id)
    setDeletingPrompt({ id: p.id, name: p.name, blocked: !canDelete, reason })
  }

  function confirmDeletePrompt() {
    deleteAiSystemPrompt(deletingPrompt.id)
    setPrompts(getAiSystemPrompts())
    setDeletingPrompt(null)
  }

  const period = getCurrentPeriod()

  // ─── Market data helpers ────────────────────────────────────────────────────

  function mdToggle(id, checked) {
    const updated = { ...mdProviders, [id]: { ...mdProviders[id], enabled: checked } }
    setMdProviders(updated)
    setMarketDataProviders(updated)
  }

  function renderKeyField(id) {
    const keySet    = mdProviders[id]?.apiKeySet ?? false
    const isShowing = !!mdShowKey[id]
    const isEditing = !!mdEditing[id]
    const revealed  = mdRevealedKey[id] ?? null

    async function saveKey() {
      const newKey = (mdKeyDraft[id] ?? '').trim() || null
      if (newKey) {
        await setSecret(`marketData/${id}/apiKey`, newKey)
      } else {
        await deleteSecret(`marketData/${id}/apiKey`)
      }
      const updated = { ...mdProviders, [id]: { ...mdProviders[id], apiKeySet: !!newKey } }
      setMdProviders(updated)
      setMarketDataProviders(updated)
      setMdEditing(s => ({ ...s, [id]: false }))
      setMdKeyDraft(s => ({ ...s, [id]: '' }))
      setMdShowKey(s => ({ ...s, [id]: false }))
      setMdRevealedKey(s => ({ ...s, [id]: null }))
      // Key cleared — flush all caches so the next fetch uses fresh credentials
      if (!newKey) { clearAllMarketCaches(); setMdCacheStats(getCacheStats()) }
    }

    async function showKey() {
      const key = await getSecret(`marketData/${id}/apiKey`)
      setMdRevealedKey(s => ({ ...s, [id]: key }))
      setMdShowKey(s => ({ ...s, [id]: true }))
    }

    // Reveal saved key (readOnly)
    if (isShowing && keySet && revealed) {
      return (
        <div className={styles.apiKeyRow}>
          <input className={styles.input} type="text" value={revealed} readOnly />
          <button className={styles.btnSm} onClick={() => {
            setMdShowKey(s => ({ ...s, [id]: false }))
            setMdRevealedKey(s => ({ ...s, [id]: null }))
          }}>Hide</button>
        </div>
      )
    }
    // Saved key masked with fixed-length bullets
    if (!isEditing && keySet) {
      return (
        <div className={styles.apiKeyRow}>
          <input className={styles.input} type="password" value="1234567890123456" readOnly />
          <button className={styles.btnSm} onClick={showKey}>Show</button>
          <button className={styles.btnSmSec} onClick={() => {
            setMdEditing(s => ({ ...s, [id]: true }))
            setMdKeyDraft(s => ({ ...s, [id]: '' }))
          }}>Change</button>
        </div>
      )
    }
    // Edit mode or no key yet
    return (
      <div className={styles.apiKeyRow}>
        <input
          className={styles.input}
          type="password"
          value={mdKeyDraft[id] ?? ''}
          placeholder="Paste your API key"
          onChange={e => setMdKeyDraft(s => ({ ...s, [id]: e.target.value }))}
          autoFocus={isEditing && keySet}
        />
        <button className={styles.btnSm} onClick={saveKey}>Save</button>
        {isEditing && keySet && (
          <button className={styles.btnSmSec} onClick={() => {
            setMdEditing(s => ({ ...s, [id]: false }))
            setMdKeyDraft(s => ({ ...s, [id]: '' }))
          }}>Cancel</button>
        )}
      </div>
    )
  }

  function renderTestRow(id) {
    const status = mdTestStatus[id]
    return (
      <div className={styles.providerTestRow}>
        <button
          className={styles.btnSm}
          disabled={status === 'testing'}
          onClick={async () => {
            setMdTestStatus(s => ({ ...s, [id]: 'testing' }))
            try {
              await testProvider(id)
              mdToggle(id, true)
              setMdTestStatus(s => ({ ...s, [id]: 'ok' }))
            } catch (err) {
              setMdTestStatus(s => ({ ...s, [id]: sanitiseTestError(err.message) }))
            }
          }}
        >
          {status === 'testing' ? 'Testing…' : 'Test'}
        </button>
        {status && status !== 'testing' && (
          <span className={status === 'ok' ? styles.testOk : styles.testError}>
            {status === 'ok' ? '✓ Connected and enabled' : status}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Settings</h1>

      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Planning Period</div>
            <p className={styles.description}>
              Choose which day of the month your planning period starts.
              This affects the period summary on the Dashboard and future budget tracking.
            </p>
            <div className={styles.field}>
              <label className={styles.label}>Start day of month</label>
              <select
                className={styles.input}
                value={startDay}
                onChange={e => handleStartDayChange(e.target.value)}
              >
                {DAYS.map(d => (
                  <option key={d} value={d}>
                    {d}{d === 1 ? ' (standard calendar month)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.preview}>
              Current period: <strong>{period.label}</strong>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Currency</div>
            <p className={styles.description}>
              Choose your main currency. Dashboard and other totals that span multiple accounts
              will be converted to this currency using live exchange rates.
            </p>
            <div className={styles.field}>
              <label className={styles.label}>Main currency</label>
              <select
                className={styles.input}
                value={mainCurrency}
                onChange={e => handleMainCurrencyChange(e.target.value)}
              >
                {SUPPORTED_CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Default display</label>
              <select
                className={styles.input}
                value={currencyDisplay}
                onChange={e => handleCurrencyDisplayChange(e.target.value)}
              >
                <option value="main">Main currency (converted totals)</option>
                <option value="native">Native currency (per-currency breakdown)</option>
              </select>
            </div>
            <div className={styles.preview}>
              Totals will be shown in <strong>{mainCurrency}</strong> by default
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Category Budgets</div>
            <p className={styles.description}>
              How full a budget needs to be before it turns amber — a warning that you're close to the limit.
            </p>
            <div className={styles.field}>
              <label className={styles.label}>Warning threshold (%)</label>
              <input
                className={styles.input}
                type="number"
                min={1}
                max={100}
                value={warningThreshold}
                onChange={e => handleWarningThresholdChange(e.target.value)}
              />
            </div>
            <div className={styles.preview}>
              Budgets turn amber at <strong>{warningThreshold}%</strong> used
            </div>
          </div>

        </>
      )}

      {activeTab === 'investments' && (
        <>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Dividends</div>
            <p className={styles.description}>
              Default withholding tax rate applied when recording a dividend payout.
              Can be overridden per stock.
            </p>
            <div className={styles.field}>
              <label className={styles.label}>Default tax rate (%)</label>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={dividendTaxPct}
                onChange={e => handleDividendTaxPctChange(e.target.value)}
              />
            </div>
            <div className={styles.preview}>
              New dividend payouts will default to <strong>{dividendTaxPct}%</strong> withholding tax
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Import Templates</div>
            <p className={styles.description}>
              Reusable column mappings for importing CSV files from your broker.
              Templates are created from the Import CSV wizard in your investing accounts.
            </p>
            <div className={styles.field}>
              <label className={styles.label}>Default date format</label>
              <select
                className={styles.input}
                value={defaultCsvDateFmt}
                onChange={e => { setDefaultCsvDateFmtState(e.target.value); setDefaultCsvDateFormat(e.target.value) }}
              >
                {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className={styles.preview}>
              Imports will default to <strong>{defaultCsvDateFmt}</strong>. The format is auto-detected per file when possible.
            </div>

            {templates.length === 0 ? (
              <p className={styles.preview}>No templates yet. Use Import CSV on an investing account to create one.</p>
            ) : (
              <div className={styles.templateList}>
                {templates.map(t => {
                  const users = getTemplateUsers(t.id)
                  return (
                    <div key={t.id} className={styles.templateRow}>
                      {renamingId === t.id ? (
                        <>
                          <input
                            className={`${styles.input} ${styles.renameInput}`}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenamingId(null) }}
                            autoFocus
                          />
                          <button className={styles.btnSm} onClick={saveRename}>Save</button>
                          <button className={styles.btnSmSec} onClick={() => setRenamingId(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <div className={styles.templateInfo}>
                            <span className={styles.templateName}>{t.name}</span>
                            {users.length > 0 && (
                              <span className={styles.templateUsers}>default for: {users.map(a => a.name).join(', ')}</span>
                            )}
                          </div>
                          <button className={styles.btnSm} onClick={() => startRename(t)}>Rename</button>
                          <button className={styles.btnSmDanger} onClick={() => requestDeleteTpl(t)}>Delete</button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {deletingTpl && (
              <div className={styles.inlineDialog}>
                {deletingTpl.blocked ? (
                  <>
                    <p className={styles.dialogMsg}>{deletingTpl.reason}</p>
                    <button className={styles.btnSm} onClick={() => setDeletingTpl(null)}>OK</button>
                  </>
                ) : (
                  <>
                    <p className={styles.dialogMsg}>Delete "{deletingTpl.name}"? This cannot be undone.</p>
                    <div className={styles.dialogActionsRow}>
                      <button className={styles.btnSmSec} onClick={() => setDeletingTpl(null)}>Cancel</button>
                      <button className={styles.btnSmDanger} onClick={confirmDeleteTpl}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'market-data' && (
        <>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Market data providers</div>
            <p className={styles.description}>
              The app tries providers in chain order — IBKR → Yahoo Finance → Massive → Twelve Data
              → Finnhub → Alpha Vantage → Stooq — and falls through to the next on any failure.
              Only enabled providers are tried. API keys are stored on this device; avoid sharing
              screenshots of this page.
            </p>

            {/* IBKR */}
            <div className={styles.providerSection}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName}>IBKR Web API</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={mdProviders.ibkr.enabled}
                    onChange={e => mdToggle('ibkr', e.target.checked)}
                  />
                  {mdProviders.ibkr.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Client ID</label>
                <input
                  className={styles.input}
                  value={mdProviders.ibkr.clientId ?? ''}
                  placeholder="Your IBKR OAuth client ID"
                  onChange={e => {
                    const updated = { ...mdProviders, ibkr: { ...mdProviders.ibkr, clientId: e.target.value || null } }
                    setMdProviders(updated)
                    setMarketDataProviders(updated)
                  }}
                />
              </div>
              <div className={styles.providerOAuthRow}>
                <span className={styles.oauthStatus}>
                  {getIbkrOAuthStatus(mdProviders.ibkr) === 'connected'
                    ? `Connected as ${mdProviders.ibkr.oauth.userId}`
                    : getIbkrOAuthStatus(mdProviders.ibkr) === 'expired'
                      ? 'Token expired — reconnect'
                      : 'Not connected'}
                </span>
                <button
                  className={styles.btnSm}
                  disabled={!mdProviders.ibkr.clientId}
                  onClick={() => {
                    if (mdProviders.ibkr.clientId) {
                      window.open(buildIbkrAuthUrl(mdProviders.ibkr.clientId), '_blank')
                    }
                  }}
                >
                  {mdProviders.ibkr.oauth ? 'Reconnect' : 'Connect'}
                </button>
              </div>
              <p className={styles.providerDeferred}>
                Deferred — IBKR cloud OAuth 2.0 is currently available for institutional clients only.
                Retail access has no published ETA. The slot is reserved in the chain for when it ships.
              </p>
            </div>

            {/* Yahoo Finance */}
            <div className={styles.providerSection}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName}>Yahoo Finance</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={mdProviders.yahooFinance.enabled}
                    onChange={e => mdToggle('yahooFinance', e.target.checked)}
                  />
                  {mdProviders.yahooFinance.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <p className={styles.providerDeferred}>
                Free, no API key required. Good European coverage (LSE, Euronext, XETRA).
                Enabled by default.
              </p>
              {renderTestRow('yahooFinance')}
            </div>

            {/* Massive */}
            <div className={styles.providerSection}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName}>Massive</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={mdProviders.massive.enabled}
                    onChange={e => mdToggle('massive', e.target.checked)}
                  />
                  {mdProviders.massive.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>API key</label>
                {renderKeyField('massive')}
              </div>
              {renderTestRow('massive')}
            </div>

            {/* Twelve Data */}
            <div className={styles.providerSection}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName}>Twelve Data</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={mdProviders.twelveData.enabled}
                    onChange={e => mdToggle('twelveData', e.target.checked)}
                  />
                  {mdProviders.twelveData.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>API key</label>
                {renderKeyField('twelveData')}
              </div>
              {renderTestRow('twelveData')}
            </div>

            {/* Finnhub */}
            <div className={styles.providerSection}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName}>Finnhub</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={mdProviders.finnhub.enabled}
                    onChange={e => mdToggle('finnhub', e.target.checked)}
                  />
                  {mdProviders.finnhub.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>API key</label>
                {renderKeyField('finnhub')}
              </div>
              <p className={styles.providerDeferred}>
                Pass 2 — adapter coming soon. Save your key now; it will activate automatically.
              </p>
            </div>

            {/* Alpha Vantage */}
            <div className={styles.providerSection}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName}>Alpha Vantage</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={mdProviders.alphaVantage.enabled}
                    onChange={e => mdToggle('alphaVantage', e.target.checked)}
                  />
                  {mdProviders.alphaVantage.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>API key</label>
                {renderKeyField('alphaVantage')}
              </div>
              {renderTestRow('alphaVantage')}
            </div>

            {/* Stooq */}
            <div className={styles.providerSection}>
              <div className={styles.providerHeader}>
                <span className={styles.providerName}>Stooq</span>
                <label className={styles.enableToggle}>
                  <input
                    type="checkbox"
                    checked={mdProviders.stooq.enabled}
                    onChange={e => mdToggle('stooq', e.target.checked)}
                  />
                  {mdProviders.stooq.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
              <p className={styles.providerDeferred}>
                Free, no API key required. Price data only (no dividends, news, or profiles).
                Pass 2 — coming soon. Enabled by default for when the adapter ships.
              </p>
            </div>
          </div>

          {/* Debug panel — dev only */}
          {import.meta.env.DEV && (
            <div className={styles.card}>
              <div className={styles.cardTitleRow}>
                <span className={styles.cardTitle}>Recent API calls</span>
                <button
                  className={styles.btnSm}
                  onClick={() => setDebugLog(getCallLog())}
                >
                  Refresh
                </button>
                <button
                  className={styles.btnSm}
                  onClick={() => { clearCallLog(); setDebugLog([]) }}
                >
                  Clear
                </button>
              </div>
              <p className={styles.description}>Dev-only. Logs every provider call with latency and outcome.</p>
              <div className={styles.debugLog}>
                {debugLog.length === 0 && <p className={styles.debugEmpty}>No calls yet.</p>}
                {debugLog.map((entry, i) => (
                  <div key={i} className={styles.debugEntry}>
                    <span className={styles.debugTime}>{fmtLogTime(entry.timestamp)}</span>
                    <span className={styles.debugCall}>{entry.callType}({(entry.args ?? []).filter(Boolean).join(', ')})</span>
                    <span className={styles.debugProvider}>{entry.providerName}</span>
                    <span className={styles.debugLatency}>{entry.latencyMs}ms</span>
                    <span className={entry.outcome === 'success' ? styles.debugOk : styles.debugError}>
                      {entry.outcome === 'success' ? '✓' : `✗ ${entry.reason}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'ai' && (
        <>
          <div className={styles.card}>
            <div className={styles.cardTitle}>AI Evaluation</div>
            <p className={styles.description}>
              Connect an external AI to get on-demand stock evaluations from stock pages.
              One connection per user. The API key is stored on this device; avoid sharing screenshots of this page.
            </p>

            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input type="radio" checked={aiConn.enabled} onChange={() => setAiConnForm(c => ({ ...c, enabled: true }))} />
                  Enabled
                </label>
                <label className={styles.radioLabel}>
                  <input type="radio" checked={!aiConn.enabled} onChange={() => setAiConnForm(c => ({ ...c, enabled: false }))} />
                  Disabled
                </label>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Provider name</label>
              <input
                className={styles.input}
                value={aiConn.providerName}
                onChange={e => setAiConnForm(c => ({ ...c, providerName: e.target.value }))}
                placeholder="Anthropic Claude"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Endpoint URL</label>
              <input
                className={styles.input}
                value={aiConn.endpointUrl}
                onChange={e => { setAiConnForm(c => ({ ...c, endpointUrl: e.target.value })); setAiUrlError('') }}
                placeholder="https://api.anthropic.com/v1/messages"
              />
              {aiUrlError && <span className={styles.fieldError}>{aiUrlError}</span>}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Model</label>
              <input
                className={styles.input}
                value={aiConn.model}
                onChange={e => setAiConnForm(c => ({ ...c, model: e.target.value }))}
                placeholder="claude-opus-4-7"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>API key</label>
              {aiKeyShowing && savedAiConn?.apiKeySet && (
                <div className={styles.apiKeyRow}>
                  <input className={styles.input} type="text" value={aiRevealedKey ?? ''} readOnly />
                  <button className={styles.btnSm} onClick={() => { setAiKeyShowing(false); setAiRevealedKey(null) }}>Hide</button>
                </div>
              )}
              {!aiKeyShowing && savedAiConn?.apiKeySet && !aiApiKeyEditing && (
                <div className={styles.apiKeyRow}>
                  <input className={styles.input} type="password" value="1234567890123456" readOnly />
                  <button className={styles.btnSm} onClick={async () => {
                    const key = await getSecret('ai/apiKey')
                    setAiRevealedKey(key)
                    setAiKeyShowing(true)
                  }}>Show</button>
                  <button className={styles.btnSmSec} onClick={() => setAiApiKeyEditing(true)}>Change</button>
                </div>
              )}
              {(!savedAiConn?.apiKeySet || aiApiKeyEditing) && (
                <div className={styles.apiKeyRow}>
                  <input
                    className={styles.input}
                    type="password"
                    value={aiApiKeyDraft}
                    onChange={e => setAiApiKeyDraft(e.target.value)}
                    placeholder="Paste your API key"
                    autoFocus={aiApiKeyEditing}
                  />
                  {aiApiKeyEditing && (
                    <button className={styles.btnSmSec} onClick={() => { setAiApiKeyEditing(false); setAiApiKeyDraft('') }}>Cancel</button>
                  )}
                </div>
              )}
            </div>

            <div className={styles.aiActions}>
              <button className={styles.btnSm} onClick={handleSaveAiConn}>Save</button>
              {savedAiConn && (
                <button className={styles.btnSmDanger} onClick={handleDeleteAiConn}>Delete connection</button>
              )}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitleRow}>
              <span className={styles.cardTitle}>System Prompts</span>
              <button className={styles.btnSm} onClick={startNewPrompt}>+ New prompt</button>
            </div>
            <p className={styles.description}>
              Named system prompts sent with each AI evaluation. Switch among them on the stock page.
              The "Default" prompt cannot be deleted but can be edited.
            </p>

            <div className={styles.promptList}>
              {prompts.map(p => (
                <div key={p.id} ref={el => { promptRefs.current[p.id] = el }} className={styles.promptRow}>
                  {editingPrompt?.id === p.id ? (
                    <PromptEditor
                      value={editingPrompt}
                      onChange={setEditingPrompt}
                      onSave={savePromptEdit}
                      onCancel={() => setEditingPrompt(null)}
                    />
                  ) : (
                    <>
                      <div className={styles.promptInfo}>
                        <div className={styles.promptName}>{p.name}</div>
                        <div className={styles.promptPreview}>{p.content.slice(0, 140)}{p.content.length > 140 ? '…' : ''}</div>
                      </div>
                      <div className={styles.promptActions}>
                        <button className={styles.btnSm} onClick={() => startEditPrompt(p)}>Edit</button>
                        <button
                          className={styles.btnSmDanger}
                          onClick={() => requestDeletePrompt(p)}
                          disabled={!canDeleteAiSystemPrompt(p.id).canDelete}
                          title={canDeleteAiSystemPrompt(p.id).canDelete ? '' : canDeleteAiSystemPrompt(p.id).reason}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {editingPrompt?.id === null && (
              <div className={styles.promptRow}>
                <PromptEditor
                  value={editingPrompt}
                  onChange={setEditingPrompt}
                  onSave={savePromptEdit}
                  onCancel={() => setEditingPrompt(null)}
                />
              </div>
            )}

            {deletingPrompt && (
              <div className={styles.inlineDialog}>
                {deletingPrompt.blocked ? (
                  <>
                    <p className={styles.dialogMsg}>{deletingPrompt.reason}</p>
                    <button className={styles.btnSm} onClick={() => setDeletingPrompt(null)}>OK</button>
                  </>
                ) : (
                  <>
                    <p className={styles.dialogMsg}>Delete prompt "{deletingPrompt.name}"? This cannot be undone.</p>
                    <div className={styles.dialogActionsRow}>
                      <button className={styles.btnSmSec} onClick={() => setDeletingPrompt(null)}>Cancel</button>
                      <button className={styles.btnSmDanger} onClick={confirmDeletePrompt}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

        </>
      )}

      {activeTab === 'storage' && (
        <>
          {/* Watchlists */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Watchlists</div>
            <p className={styles.description}>
              Storage used by watchlists, stock entries, and price alerts.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>Watchlists</span>
                  <span className={styles.storageCount}>
                    {watchlistSummary.listCount} list{watchlistSummary.listCount !== 1 ? 's' : ''},
                    {' '}{watchlistSummary.stockCount} stock{watchlistSummary.stockCount !== 1 ? 's' : ''},
                    {' '}{watchlistSummary.alertCount} alert{watchlistSummary.alertCount !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.storageBytes}>{fmtBytes(watchlistSummary.bytes)}</span>
                  <button
                    className={styles.btnSmDanger}
                    disabled={watchlistSummary.listCount === 0 && watchlistSummary.stockCount === 0 && watchlistSummary.alertCount === 0}
                    onClick={() => setWatchlistDeleteConfirm(true)}
                  >
                    Delete all
                  </button>
                </div>
              </div>
            </div>
            {watchlistDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Delete all {watchlistSummary.listCount} watchlists, {watchlistSummary.stockCount} stocks, and {watchlistSummary.alertCount} alerts? This cannot be undone.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setWatchlistDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    deleteAllWatchlists()
                    setWatchlistSummary(getWatchlistStorageSummary())
                    setWatchlistDeleteConfirm(false)
                  }}>Delete</button>
                </div>
              </div>
            )}
          </div>

          {/* Benchmarks */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Benchmarks</div>
            <p className={styles.description}>
              Storage used by user-added benchmarks. Curated benchmarks are built-in and use no storage.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>User-added</span>
                  <span className={styles.storageCount}>
                    {benchmarkUserCount} benchmark{benchmarkUserCount !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.storageBytes}>{fmtBytes(benchmarkBytes)}</span>
                  <button
                    className={styles.btnSmDanger}
                    disabled={benchmarkUserCount === 0}
                    onClick={() => setBenchmarkDeleteConfirm(true)}
                  >
                    Delete all
                  </button>
                </div>
              </div>
            </div>
            {benchmarkDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Delete all {benchmarkUserCount} user-added benchmark{benchmarkUserCount !== 1 ? 's' : ''}? Curated benchmarks are unaffected.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setBenchmarkDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    deleteAllUserBenchmarks()
                    setBenchmarkUserCount(getUserBenchmarks().length)
                    setBenchmarkBytes(getBenchmarksStorageBytes())
                    setBenchmarkDeleteConfirm(false)
                  }}>Delete</button>
                </div>
              </div>
            )}
          </div>

          {/* Market data cache */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Market data cache</div>
            <p className={styles.description}>
              In-memory price, news, and profile data cached to localStorage.
              Prices expire after 1 hour; news after 15 minutes; profiles are kept until refreshed manually.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>Prices</span>
                  <span className={styles.storageCount}>{mdCacheStats.priceEntries} entr{mdCacheStats.priceEntries !== 1 ? 'ies' : 'y'}</span>
                  <span className={styles.storageBytes} />
                  <button className={styles.btnSmSec} onClick={() => { clearPriceCache(); setMdCacheStats(getCacheStats()) }}>
                    Clear
                  </button>
                </div>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>News</span>
                  <span className={styles.storageCount}>{mdCacheStats.newsEntries} entr{mdCacheStats.newsEntries !== 1 ? 'ies' : 'y'}</span>
                  <span className={styles.storageBytes} />
                </div>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>Profiles</span>
                  <span className={styles.storageCount}>{mdCacheStats.profileEntries} entr{mdCacheStats.profileEntries !== 1 ? 'ies' : 'y'}</span>
                  <span className={styles.storageBytes} />
                </div>
                <div className={`${styles.storageRow} ${styles.storageSubtotal}`}>
                  <span className={styles.storageTicker}>Total</span>
                  <span className={styles.storageCount} />
                  <span className={styles.storageBytes}>{fmtBytes(mdCacheStats.bytes + getLogStorageBytes())}</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI chat storage */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>AI chat storage</div>
            <p className={styles.description}>
              Storage occupied by saved AI chat histories. Sizes are UTF-8 JSON bytes.
            </p>

            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                {storageSummary.length === 0 ? (
                  <div className={styles.storageEmptyRow}>No chats stored.</div>
                ) : (
                  storageSummary.map(row => (
                    <div key={row.ticker} className={styles.storageRow}>
                      <span
                        className={`${styles.storageTicker} ${onNavigate ? styles.storageTickerLink : ''}`}
                        onClick={onNavigate ? () => onNavigate('stock', { ticker: row.ticker }) : undefined}
                        title={onNavigate ? `Open ${row.ticker} stock page` : undefined}
                      >{row.ticker}</span>
                      <span className={styles.storageCount}>
                        {row.count} chat{row.count !== 1 ? 's' : ''}
                        {row.pinned > 0 ? `, ${row.pinned} pinned` : ''}
                      </span>
                      <span className={styles.storageBytes}>{fmtBytes(row.bytes)}</span>
                      <button
                        className={styles.btnSmSec}
                        onClick={() => setStorageConfirm({ type: 'ticker-unpinned', ticker: row.ticker, pinnedCount: row.pinned, unpinnedCount: row.count - row.pinned })}
                        disabled={row.count - row.pinned === 0}
                      >
                        Del unpinned
                      </button>
                      <button
                        className={styles.btnSmDanger}
                        onClick={() => setStorageConfirm({ type: 'ticker-all', ticker: row.ticker, pinnedCount: row.pinned, unpinnedCount: row.count - row.pinned })}
                      >
                        Del all
                      </button>
                    </div>
                  ))
                )}
                {storageSummary.length > 0 && (
                  <div className={`${styles.storageRow} ${styles.storageSubtotal}`}>
                    <span className={styles.storageTicker}>Total</span>
                    <span className={styles.storageCount}>
                      {storageSummary.reduce((s, r) => s + r.count, 0)} chats
                    </span>
                    <span className={styles.storageBytes}>{fmtBytes(getTotalChatSizeBytes())}</span>
                    <button
                      className={styles.btnSmSec}
                      onClick={() => {
                        const totalUnpinned = storageSummary.reduce((s, r) => s + r.count - r.pinned, 0)
                        setStorageConfirm({ type: 'all-unpinned', pinnedCount: 0, unpinnedCount: totalUnpinned })
                      }}
                      disabled={storageSummary.every(r => r.count === r.pinned)}
                    >
                      Del all unpinned
                    </button>
                    <button
                      className={styles.btnSmDanger}
                      onClick={() => {
                        const totalPinned = storageSummary.reduce((s, r) => s + r.pinned, 0)
                        setStorageConfirm({ type: 'all', pinnedCount: totalPinned, unpinnedCount: 0 })
                      }}
                    >
                      Del all
                    </button>
                  </div>
                )}
              </div>
            </div>

            {storageConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>{storageConfirmMsg(storageConfirm)}</p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setStorageConfirm(null)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    const { type, ticker } = storageConfirm
                    if (type === 'ticker-unpinned') deleteUnpinnedChatsForTicker(ticker)
                    else if (type === 'ticker-all')   deleteAllChatsForTicker(ticker)
                    else if (type === 'all-unpinned') deleteAllUnpinnedChats()
                    else if (type === 'all')          deleteAllAiChats()
                    setStorageSummary(getStorageSummaryAllTickers())
                    setStorageConfirm(null)
                  }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function sanitiseTestError(msg) {
  if (!msg) return 'Connection failed'
  // Strip any URL that may contain an API key in a query parameter
  const cleaned = msg.replace(/https?:\/\/\S+/gi, '[url]')
  return cleaned.length > 100 ? cleaned.slice(0, 100) + '…' : cleaned
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function storageConfirmMsg({ type, ticker, pinnedCount, unpinnedCount }) {
  if (type === 'ticker-unpinned') return `Delete ${unpinnedCount} unpinned chat${unpinnedCount !== 1 ? 's' : ''} for ${ticker}? Pinned chats are untouched.`
  if (type === 'ticker-all') return pinnedCount > 0
    ? `Delete all ${unpinnedCount + pinnedCount} chats for ${ticker}, including ${pinnedCount} pinned? This cannot be undone.`
    : `Delete all chats for ${ticker}? This cannot be undone.`
  if (type === 'all-unpinned') return `Delete all unpinned chats across all stocks? Pinned chats are untouched.`
  return pinnedCount > 0
    ? `Delete all AI chats across all stocks, including ${pinnedCount} pinned? This cannot be undone.`
    : 'Delete all AI chats across all stocks? This cannot be undone.'
}

function PromptEditor({ value, onChange, onSave, onCancel }) {
  return (
    <div className={styles.promptEditor}>
      <div className={styles.field}>
        <label className={styles.label}>Name</label>
        <input
          className={styles.input}
          value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Conservative dividend investor"
          autoFocus
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Prompt content</label>
        <textarea
          className={styles.textarea}
          rows={14}
          value={value.content}
          onChange={e => onChange({ ...value, content: e.target.value })}
          placeholder="You are a..."
        />
      </div>
      <div className={styles.dialogActionsRow}>
        <button className={styles.btnSmSec} onClick={onCancel}>Cancel</button>
        <button className={styles.btnSm} onClick={onSave} disabled={!value.name.trim()}>Save</button>
      </div>
    </div>
  )
}
