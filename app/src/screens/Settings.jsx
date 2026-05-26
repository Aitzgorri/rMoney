import { useState, useEffect, useRef } from 'react'
import {
  DndContext,
  useDraggable,
  useDroppable,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { getPlanningStartDay, setPlanningStartDay, getMainCurrency, setMainCurrency, getCurrencyDisplay, setCurrencyDisplay, getDividendDefaultTaxPercent, setDividendDefaultTaxPercent, getDividendEstimationRule, setDividendEstimationRule, getAiConnection, setAiConnection, getMarketDataProviders, setMarketDataProviders, getTradingFees, setTradingFees, resolveTradingFee, getFavoriteCurrencies, setFavoriteCurrencies, getApiCacheTtl, setApiCacheTtl } from '../data/settings'
import { ISO4217, ISO4217_MAP } from '../utils/iso4217'
import { CANONICAL_EXCHANGES } from '../utils/marketDataExchanges'
import { getActiveStockProfiles } from '../data/stockProfiles'
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
import { getReportPresets, getReportPresetsStorageBytes, deleteAllReportPresets } from '../data/investmentReports'
import { getPieChartPresets, getPieChartPresetsStorageBytes, deleteAllPieChartPresets } from '../data/pieChartPresets'
import { getDividendChartPresets, getDividendChartPresetsStorageBytes, deleteAllDividendChartPresets } from '../data/dividendChartPresets'
import { backfillFxSnapshots } from '../data/stockTransactions'
import { getApiDividendHistoryStats, clearApiDividendHistory } from '../data/apiDividendHistory'
import { getManualPricesStats, clearAllManualPrices } from '../data/manualPrices'
import { getTradingScenariosStats, deleteAllTradingScenarios } from '../data/tradingScenarios'
import { testProvider } from '../data/marketDataClient'
import { getCacheStats, clearPriceCache, clearAllMarketCaches } from '../utils/marketDataCache'
import { getCallLog, clearCallLog, getLogStorageBytes } from '../utils/marketDataLogger'
import { buildIbkrAuthUrl, getIbkrOAuthStatus } from '../services/providers/ibkr'
import { DATE_FORMATS } from '../utils/csvParse'
import { getCurrentPeriod } from '../utils/planningPeriod'
import { SUPPORTED_CURRENCIES } from '../utils/currency'
import CurrencyDropdown from '../components/CurrencyDropdown'
import styles from './Settings.module.css'

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

function FavCurrencyRow({ code, name, isMain, onRemove }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: code })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: code })

  return (
    <div
      ref={node => { setDragRef(node); setDropRef(node) }}
      className={[
        styles.favRow,
        isDragging ? styles.dragging : '',
        isOver && !isDragging ? styles.dragOver : '',
      ].filter(Boolean).join(' ')}
    >
      <span className={styles.dragHandle} {...listeners} {...attributes}>⠿</span>
      <span className={styles.favCode}>{code}</span>
      <span className={styles.favName}>{name}</span>
      <button
        className={styles.favRemoveBtn}
        disabled={isMain}
        title={isMain ? 'Cannot remove the main currency' : `Remove ${code}`}
        onClick={onRemove}
      >×</button>
    </div>
  )
}

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
  const [favCurrencies, setFavCurrenciesState] = useState(() => getFavoriteCurrencies())
  const [favAddQuery, setFavAddQuery] = useState('')
  const [favAddOpen, setFavAddOpen] = useState(false)
  const [dividendTaxPct,      setDividendTaxPctState]      = useState(() => getDividendDefaultTaxPercent())
  const [dividendEstRule,     setDividendEstRuleState]     = useState(() => getDividendEstimationRule())
  const [cacheTtl,            setCacheTtlState]            = useState(() => getApiCacheTtl())
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
  const [reportPresetCount, setReportPresetCount] = useState(() => getReportPresets().length)
  const [reportPresetBytes, setReportPresetBytes] = useState(() => getReportPresetsStorageBytes())
  const [reportPresetDeleteConfirm, setReportPresetDeleteConfirm] = useState(false)
  const [pieChartPresetCount, setPieChartPresetCount] = useState(() => getPieChartPresets().length)
  const [pieChartPresetBytes, setPieChartPresetBytes] = useState(() => getPieChartPresetsStorageBytes())
  const [pieChartPresetDeleteConfirm, setPieChartPresetDeleteConfirm] = useState(false)
  const [divChartPresetCount, setDivChartPresetCount] = useState(() => getDividendChartPresets().length)
  const [divChartPresetBytes, setDivChartPresetBytes] = useState(() => getDividendChartPresetsStorageBytes())
  const [divChartPresetDeleteConfirm, setDivChartPresetDeleteConfirm] = useState(false)
  const [fxBackfilling,   setFxBackfilling]   = useState(false)
  const [fxBackfillResult, setFxBackfillResult] = useState(null)  // null | { processed, failed }
  const [apiDivHistStats,  setApiDivHistStats]  = useState(() => getApiDividendHistoryStats())
  const [apiDivHistDeleteConfirm, setApiDivHistDeleteConfirm] = useState(false)
  const [manualPricesStats, setManualPricesStats] = useState(() => getManualPricesStats())
  const [manualPricesDeleteConfirm, setManualPricesDeleteConfirm] = useState(false)
  const [tradingScenariosStats, setTradingScenariosStats] = useState(() => getTradingScenariosStats())
  const [tradingScenariosDeleteConfirm, setTradingScenariosDeleteConfirm] = useState(false)
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

  // Trading fees (Sub-phase 32f)
  const [tradingFees,    setTradingFeesState]    = useState(() => getTradingFees())
  const [editingFeeRow,  setEditingFeeRow]       = useState(null)  // { kind: 'exchange'|'stock', index: number, draft: {...} } | null
  const [feeRowError,    setFeeRowError]         = useState('')

  async function handleFxBackfill() {
    setFxBackfilling(true)
    try {
      const result = await backfillFxSnapshots()
      setFxBackfillResult(result)
    } finally {
      setFxBackfilling(false)
    }
  }

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
    // Auto-add new main currency to favorites if absent
    setFavCurrenciesState(prev => {
      if (prev.includes(code)) return prev
      const next = [code, ...prev]
      setFavoriteCurrencies(next)
      return next
    })
  }

  function handleFavReorder({ active, over }) {
    if (!over || active.id === over.id) return
    const from = favCurrencies.indexOf(active.id)
    const to   = favCurrencies.indexOf(over.id)
    if (from === -1 || to === -1) return
    const next = [...favCurrencies]
    next.splice(to, 0, next.splice(from, 1)[0])
    setFavCurrenciesState(next)
    setFavoriteCurrencies(next)
  }

  function handleFavRemove(code) {
    const next = favCurrencies.filter(c => c !== code)
    setFavCurrenciesState(next)
    setFavoriteCurrencies(next)
  }

  function handleFavAdd(code) {
    if (!code || favCurrencies.includes(code)) return
    const next = [...favCurrencies, code]
    setFavCurrenciesState(next)
    setFavoriteCurrencies(next)
    setFavAddQuery('')
    setFavAddOpen(false)
  }

  const favSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  )

  function handleCurrencyDisplayChange(mode) {
    setCurrencyDisplayState(mode)
    setCurrencyDisplay(mode)
  }

  function handleDividendTaxPctChange(value) {
    const n = Math.min(100, Math.max(0, Number(value)))
    setDividendTaxPctState(n)
    setDividendDefaultTaxPercent(n)
  }

  function handleCacheTtlChange(field, value) {
    const n = Math.min(1440, Math.max(1, Number(value) || 1))
    const updated = { ...cacheTtl, [field]: n }
    setCacheTtlState(updated)
    setApiCacheTtl(updated)
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

  // ─── Trading fees helpers (Sub-phase 32f) ──────────────────────────────────

  // Currencies offered in the fee-rule dropdown: SUPPORTED + any canonical-exchange
  // currency (e.g. HKD) so users can express fees in the venue's native currency.
  const feeCurrencyOptions = Array.from(
    new Set([...SUPPORTED_CURRENCIES, ...CANONICAL_EXCHANGES.map(e => e.currency)])
  ).sort()

  const stockProfilesForFee = getActiveStockProfiles().sort((a, b) => a.ticker.localeCompare(b.ticker))

  function startAddExchangeFee() {
    setFeeRowError('')
    setEditingFeeRow({
      kind: 'exchange',
      index: -1,
      draft: { mic: '', currency: mainCurrency, feePercent: '', minimumFee: '' },
    })
  }

  function startEditExchangeFee(index) {
    const rule = tradingFees.exchanges[index]
    setFeeRowError('')
    setEditingFeeRow({
      kind: 'exchange',
      index,
      draft: {
        mic: rule.mic ?? '',
        currency: rule.currency ?? '',
        feePercent: rule.feePercent ?? '',
        minimumFee: rule.minimumFee ?? '',
      },
    })
  }

  function startAddStockFee() {
    setFeeRowError('')
    setEditingFeeRow({
      kind: 'stock',
      index: -1,
      draft: { ticker: '', currency: mainCurrency, feePercent: '', minimumFee: '' },
    })
  }

  function startEditStockFee(index) {
    const rule = tradingFees.stocks[index]
    setFeeRowError('')
    setEditingFeeRow({
      kind: 'stock',
      index,
      draft: {
        ticker: rule.ticker ?? '',
        currency: rule.currency ?? '',
        feePercent: rule.feePercent ?? '',
        minimumFee: rule.minimumFee ?? '',
      },
    })
  }

  function updateFeeDraft(patch) {
    setEditingFeeRow(s => s ? { ...s, draft: { ...s.draft, ...patch } } : s)
  }

  // When the user picks a MIC, auto-fill the currency from the canonical list
  // unless they have already typed something different.
  function pickExchangeMic(mic) {
    const canonical = CANONICAL_EXCHANGES.find(e => e.mic === mic)
    setEditingFeeRow(s => {
      if (!s) return s
      const keepCurrency = s.draft.currency && s.draft.currency !== canonical?.currency
      return {
        ...s,
        draft: {
          ...s.draft,
          mic,
          currency: keepCurrency ? s.draft.currency : (canonical?.currency ?? s.draft.currency),
        },
      }
    })
  }

  // When the user picks a ticker, default the currency to the stock profile's
  // currency if known and the user hasn't already typed one.
  function pickStockTicker(ticker) {
    const profile = stockProfilesForFee.find(p => p.ticker === ticker)
    setEditingFeeRow(s => {
      if (!s) return s
      const haveCurrency = s.draft.currency
      return {
        ...s,
        draft: {
          ...s.draft,
          ticker,
          currency: haveCurrency ? s.draft.currency : (profile?.currency ?? s.draft.currency),
        },
      }
    })
  }

  function cancelFeeEdit() {
    setEditingFeeRow(null)
    setFeeRowError('')
  }

  function saveFeeEdit() {
    if (!editingFeeRow) return
    const { kind, index, draft } = editingFeeRow
    const identifier = kind === 'exchange' ? draft.mic : draft.ticker?.trim().toUpperCase()
    if (!identifier) {
      setFeeRowError(kind === 'exchange' ? 'Pick an exchange' : 'Pick a stock')
      return
    }
    if (!draft.currency) {
      setFeeRowError('Pick a currency')
      return
    }
    const feePercent = Number(draft.feePercent)
    const minimumFee = Number(draft.minimumFee)
    if (!Number.isFinite(feePercent) || feePercent < 0) {
      setFeeRowError('Fee % must be 0 or more')
      return
    }
    if (!Number.isFinite(minimumFee) || minimumFee < 0) {
      setFeeRowError('Minimum fee must be 0 or more')
      return
    }

    const list = kind === 'exchange' ? [...tradingFees.exchanges] : [...tradingFees.stocks]
    const newRule = kind === 'exchange'
      ? { mic: identifier, currency: draft.currency, feePercent, minimumFee }
      : { ticker: identifier, currency: draft.currency, feePercent, minimumFee }

    // Reject duplicates on the identifying field (except when editing the row itself)
    const dupIndex = list.findIndex((r, i) =>
      i !== index &&
      (kind === 'exchange' ? r.mic === identifier : r.ticker?.toUpperCase() === identifier)
    )
    if (dupIndex !== -1) {
      setFeeRowError(kind === 'exchange'
        ? `A rule for ${identifier} already exists`
        : `An override for ${identifier} already exists`)
      return
    }

    if (index === -1) list.push(newRule)
    else list[index] = newRule

    const next = kind === 'exchange'
      ? { ...tradingFees, exchanges: list }
      : { ...tradingFees, stocks: list }
    setTradingFees(next)
    setTradingFeesState(next)
    setEditingFeeRow(null)
    setFeeRowError('')
  }

  function deleteFeeRow(kind, index) {
    const list = kind === 'exchange' ? [...tradingFees.exchanges] : [...tradingFees.stocks]
    list.splice(index, 1)
    const next = kind === 'exchange'
      ? { ...tradingFees, exchanges: list }
      : { ...tradingFees, stocks: list }
    setTradingFees(next)
    setTradingFeesState(next)
    if (editingFeeRow?.kind === kind && editingFeeRow.index === index) cancelFeeEdit()
  }

  function renderFeeEditor() {
    if (!editingFeeRow) return null
    const { kind, draft } = editingFeeRow
    const usedExchangeMics = new Set(tradingFees.exchanges.map(e => e.mic))
    const usedStockTickers = new Set(tradingFees.stocks.map(s => s.ticker?.toUpperCase()))
    return (
      <div className={styles.feeEditor} key="fee-editor">
        <div className={styles.feeEditorGrid}>
          {kind === 'exchange' ? (
            <label className={styles.feeField}>
              <span className={styles.feeFieldLabel}>Exchange</span>
              <select
                className={styles.input}
                value={draft.mic ?? ''}
                onChange={e => pickExchangeMic(e.target.value)}
              >
                <option value="">Select exchange…</option>
                {CANONICAL_EXCHANGES.map(ex => {
                  const taken = usedExchangeMics.has(ex.mic) && ex.mic !== tradingFees.exchanges[editingFeeRow.index]?.mic
                  return (
                    <option key={ex.mic} value={ex.mic} disabled={taken}>
                      {ex.mic} — {ex.name}{taken ? ' (already set)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          ) : (
            <label className={styles.feeField}>
              <span className={styles.feeFieldLabel}>Stock</span>
              <select
                className={styles.input}
                value={draft.ticker ?? ''}
                onChange={e => pickStockTicker(e.target.value)}
              >
                <option value="">Select stock…</option>
                {stockProfilesForFee.map(p => {
                  const taken = usedStockTickers.has(p.ticker) && p.ticker !== tradingFees.stocks[editingFeeRow.index]?.ticker
                  return (
                    <option key={p.ticker} value={p.ticker} disabled={taken}>
                      {p.ticker}{p.name ? ` — ${p.name}` : ''}{taken ? ' (already set)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          )}

          <label className={styles.feeField}>
            <span className={styles.feeFieldLabel}>Currency</span>
            <CurrencyDropdown
              className={styles.input}
              value={draft.currency ?? mainCurrency}
              onChange={v => updateFeeDraft({ currency: v })}
            />
          </label>

          <label className={styles.feeField}>
            <span className={styles.feeFieldLabel}>Fee %</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              step="0.0001"
              value={draft.feePercent ?? ''}
              placeholder="0.10"
              onChange={e => updateFeeDraft({ feePercent: e.target.value })}
            />
          </label>

          <label className={styles.feeField}>
            <span className={styles.feeFieldLabel}>Minimum fee</span>
            <input
              className={styles.input}
              type="number"
              min={0}
              step="0.01"
              value={draft.minimumFee ?? ''}
              placeholder="0.00"
              onChange={e => updateFeeDraft({ minimumFee: e.target.value })}
            />
          </label>
        </div>
        {feeRowError && <div className={styles.fieldError}>{feeRowError}</div>}
        <div className={styles.dialogActionsRow}>
          <button className={styles.btnSmSec} onClick={cancelFeeEdit}>Cancel</button>
          <button className={styles.btnSm} onClick={saveFeeEdit}>Save</button>
        </div>
      </div>
    )
  }

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
              <CurrencyDropdown
                className={styles.input}
                value={mainCurrency}
                onChange={handleMainCurrencyChange}
              />
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
            <div className={styles.cardTitle}>Favorite currencies</div>
            <p className={styles.description}>
              These appear at the top of every currency picker. Drag to reorder. The main currency cannot be removed.
            </p>
            <DndContext sensors={favSensors} onDragEnd={handleFavReorder}>
              <div className={styles.favList}>
                {favCurrencies.map(code => (
                  <FavCurrencyRow
                    key={code}
                    code={code}
                    name={ISO4217_MAP[code] ?? ''}
                    isMain={code === mainCurrency}
                    onRemove={() => handleFavRemove(code)}
                  />
                ))}
              </div>
            </DndContext>
            <div className={styles.addCurrencyRow}>
              <input
                className={styles.addCurrencyInput}
                placeholder="Search currency to add…"
                value={favAddQuery}
                onChange={e => { setFavAddQuery(e.target.value.toUpperCase()); setFavAddOpen(true) }}
                onFocus={() => setFavAddOpen(true)}
                onBlur={() => setTimeout(() => setFavAddOpen(false), 150)}
              />
            </div>
            {favAddOpen && favAddQuery.length > 0 && (() => {
              const q = favAddQuery.toLowerCase()
              const matches = ISO4217.filter(c =>
                c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
              ).slice(0, 12)
              return matches.length > 0 ? (
                <div className={styles.addCurrencySuggestions}>
                  {matches.map(c => (
                    <div
                      key={c.code}
                      className={`${styles.addCurrencySuggestion}${favCurrencies.includes(c.code) ? ` ${styles.alreadyFav}` : ''}`}
                      onMouseDown={() => handleFavAdd(c.code)}
                    >
                      <span className={styles.suggCode}>{c.code}</span>
                      <span className={styles.suggName}>{c.name}</span>
                    </div>
                  ))}
                </div>
              ) : null
            })()}
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
            <div className={styles.field}>
              <label className={styles.label}>Default amount estimation rule</label>
              <select
                className={styles.input}
                value={dividendEstRule}
                onChange={e => {
                  setDividendEstRuleState(e.target.value)
                  setDividendEstimationRule(e.target.value)
                }}
              >
                <option value="last-paid">Last paid amount</option>
                <option value="year-ago">Same period previous year</option>
                <option value="manual">Manual amount (per stock)</option>
              </select>
            </div>
            <div className={styles.preview}>
              Projected payouts use <strong>
                {dividendEstRule === 'last-paid' ? 'last paid amount' :
                 dividendEstRule === 'year-ago'  ? 'same-period previous year' :
                 'a manually set amount per stock'}
              </strong> by default
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>API call frequency</div>
            <p className={styles.description}>
              How long to reuse a cached API response before fetching fresh data.
              Lower values give fresher data but use more API quota. Range: 1–1440 minutes.
            </p>
            {[
              { field: 'pricesMin',   label: 'Prices',   hint: 'Stock price' },
              { field: 'forexMin',    label: 'Forex',    hint: 'Currency exchange rates' },
              { field: 'newsMin',     label: 'News',     hint: 'Company news headlines' },
              { field: 'intradayMin', label: 'Intraday', hint: '1-minute intraday bars' },
            ].map(({ field, label, hint }) => (
              <div key={field} className={styles.field}>
                <label className={styles.label} title={hint}>{label} (min)</label>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={cacheTtl[field]}
                  onChange={e => handleCacheTtlChange(field, e.target.value)}
                  style={{ width: 80 }}
                />
              </div>
            ))}
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

          {/* ── Trading fees (Sub-phase 32f) ───────────────────────────────── */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Trading fees</div>
            <p className={styles.description}>
              Default trading fees pre-fill the Buy-Sell Planning screen and (optionally) new
              Buy / Sell entries. Resolution order: <strong>per-stock override</strong> →
              {' '}<strong>per-exchange default</strong> → no fee.
              Computed as <code>max(minimum fee, gross × fee %)</code>, where the fee % is the
              percent value shown below (0.10 means 0.10 % of the trade).
            </p>

            {/* Per-exchange defaults */}
            <div className={styles.feeSectionHeader}>
              <span className={styles.feeSectionTitle}>Per stock exchange</span>
              {!(editingFeeRow?.kind === 'exchange' && editingFeeRow.index === -1) && (
                <button className={styles.btnSm} onClick={startAddExchangeFee}>+ Add exchange</button>
              )}
            </div>
            {tradingFees.exchanges.length === 0 && !(editingFeeRow?.kind === 'exchange' && editingFeeRow.index === -1) ? (
              <p className={styles.preview}>No exchange defaults yet.</p>
            ) : (
              <div className={styles.feeList}>
                {tradingFees.exchanges.map((rule, i) => {
                  const isEditing = editingFeeRow?.kind === 'exchange' && editingFeeRow.index === i
                  if (isEditing) {
                    return <div key={`ex-edit-${i}`}>{renderFeeEditor()}</div>
                  }
                  const canonical = CANONICAL_EXCHANGES.find(e => e.mic === rule.mic)
                  return (
                    <div key={`ex-${rule.mic}-${i}`} className={styles.feeRow}>
                      <div className={styles.feeRowInfo}>
                        <span className={styles.feeRowMain}>{rule.mic}</span>
                        {canonical && <span className={styles.feeRowSub}>{canonical.name}</span>}
                      </div>
                      <span className={styles.feeBadge}>{rule.currency}</span>
                      <span className={styles.feeRowVal}>{Number(rule.feePercent).toFixed(4)} %</span>
                      <span className={styles.feeRowVal}>min {Number(rule.minimumFee).toFixed(2)}</span>
                      <button className={styles.btnSm} onClick={() => startEditExchangeFee(i)}>Edit</button>
                      <button className={styles.btnSmDanger} onClick={() => deleteFeeRow('exchange', i)}>Delete</button>
                    </div>
                  )
                })}
                {editingFeeRow?.kind === 'exchange' && editingFeeRow.index === -1 && (
                  <div key="ex-edit-new">{renderFeeEditor()}</div>
                )}
              </div>
            )}

            {/* Per-stock overrides */}
            <div className={styles.feeSectionHeader}>
              <span className={styles.feeSectionTitle}>Per stock overrides</span>
              {!(editingFeeRow?.kind === 'stock' && editingFeeRow.index === -1) && (
                <button className={styles.btnSm} onClick={startAddStockFee} disabled={stockProfilesForFee.length === 0}>
                  + Add stock override
                </button>
              )}
            </div>
            {stockProfilesForFee.length === 0 ? (
              <p className={styles.preview}>No stocks in your inventory yet. Add a stock first to set a per-stock fee override.</p>
            ) : tradingFees.stocks.length === 0 && !(editingFeeRow?.kind === 'stock' && editingFeeRow.index === -1) ? (
              <p className={styles.preview}>No per-stock overrides yet. Stocks fall back to the matching exchange default.</p>
            ) : (
              <div className={styles.feeList}>
                {tradingFees.stocks.map((rule, i) => {
                  const isEditing = editingFeeRow?.kind === 'stock' && editingFeeRow.index === i
                  if (isEditing) {
                    return <div key={`st-edit-${i}`}>{renderFeeEditor()}</div>
                  }
                  const profile = stockProfilesForFee.find(p => p.ticker === rule.ticker)
                  return (
                    <div key={`st-${rule.ticker}-${i}`} className={styles.feeRow}>
                      <div className={styles.feeRowInfo}>
                        <span className={styles.feeRowMain}>{rule.ticker}</span>
                        {profile?.name && <span className={styles.feeRowSub}>{profile.name}</span>}
                      </div>
                      <span className={styles.feeBadge}>{rule.currency}</span>
                      <span className={styles.feeRowVal}>{Number(rule.feePercent).toFixed(4)} %</span>
                      <span className={styles.feeRowVal}>min {Number(rule.minimumFee).toFixed(2)}</span>
                      <button className={styles.btnSm} onClick={() => startEditStockFee(i)}>Edit</button>
                      <button className={styles.btnSmDanger} onClick={() => deleteFeeRow('stock', i)}>Delete</button>
                    </div>
                  )
                })}
                {editingFeeRow?.kind === 'stock' && editingFeeRow.index === -1 && (
                  <div key="st-edit-new">{renderFeeEditor()}</div>
                )}
              </div>
            )}

            {/* Resolution preview */}
            {(tradingFees.exchanges.length > 0 || tradingFees.stocks.length > 0) && (
              <div className={styles.preview}>
                Example: a 1,000 trade with the matching rule would charge <strong>
                  {(() => {
                    const sample = tradingFees.stocks[0] ?? tradingFees.exchanges[0]
                    const { feeAmount, source } = resolveTradingFee(
                      sample.ticker ?? null,
                      sample.mic ?? null,
                      1000,
                    )
                    return `${feeAmount.toFixed(2)} ${sample.currency} (${source})`
                  })()}
                </strong>.
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

          {/* FX snapshot backfill */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Historical FX snapshots</div>
            <p className={styles.description}>
              Captures the exchange rate from each stock transaction's trading currency to your main
              currency at the transaction date. These snapshots are used for accurate historical
              performance metrics (XIRR, multi-currency return). New transactions capture the rate
              automatically; use Backfill to populate older records.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>Stock transactions &amp; cash movements</span>
                  <span className={styles.storageCount}>
                    {fxBackfillResult
                      ? `${fxBackfillResult.processed} updated, ${fxBackfillResult.failed} unavailable`
                      : 'Run to populate missing snapshots'}
                  </span>
                  <span className={styles.storageBytes} />
                  <button
                    className={styles.btnSm}
                    onClick={handleFxBackfill}
                    disabled={fxBackfilling}
                  >
                    {fxBackfilling ? 'Running…' : 'Backfill'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* API dividend history (persisted history — included in Full backup) */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>API dividend history</div>
            <p className={styles.description}>
              Per-share dividend records fetched from market data providers — stored permanently, never auto-cleared.
              Used for TTM yield, forward yield, CAGR, and the Dividend page calendar.
              Included in Full backup; excluded from Sharable export.
            </p>
            <div className={styles.storageTable}>
              <div
                className={styles.storageSection}
                style={apiDivHistStats.tickerCount > 20 ? { maxHeight: '20lh', overflowY: 'auto' } : undefined}
              >
                {apiDivHistStats.tickerCount === 0 ? (
                  <div className={styles.storageEmptyRow}>No dividend history stored yet.</div>
                ) : (
                  apiDivHistStats.perTicker.map(row => (
                    <div key={row.ticker} className={styles.storageRow}>
                      <span className={styles.storageTicker}>{row.ticker}</span>
                      <span className={styles.storageCount}>{row.count} record{row.count !== 1 ? 's' : ''}</span>
                      <span className={styles.storageBytes}>{fmtBytes(row.bytes)}</span>
                    </div>
                  ))
                )}
                {apiDivHistStats.tickerCount > 0 && (
                  <div className={`${styles.storageRow} ${styles.storageSubtotal}`}>
                    <span className={styles.storageTicker}>Total</span>
                    <span className={styles.storageCount}>
                      {apiDivHistStats.tickerCount} ticker{apiDivHistStats.tickerCount !== 1 ? 's' : ''},
                      {' '}{apiDivHistStats.recordCount} record{apiDivHistStats.recordCount !== 1 ? 's' : ''}
                    </span>
                    <span className={styles.storageBytes}>{fmtBytes(apiDivHistStats.bytes)}</span>
                    <button
                      className={styles.btnSmDanger}
                      onClick={() => setApiDivHistDeleteConfirm(true)}
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            </div>
            {apiDivHistDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Clear all API dividend history ({apiDivHistStats.recordCount} records across {apiDivHistStats.tickerCount} tickers)?
                  It will be re-fetched from market data providers next time you refresh.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setApiDivHistDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    clearApiDividendHistory()
                    setApiDivHistStats(getApiDividendHistoryStats())
                    setApiDivHistDeleteConfirm(false)
                  }}>Clear</button>
                </div>
              </div>
            )}
          </div>

          {/* Manual stock prices (user-entered — included in all backups) */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Manual stock prices</div>
            <p className={styles.description}>
              User-entered prices for manual stocks (assets the market data providers can't quote).
              You enter these from each stock's page. Included in both Sharable and Full backups.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                {manualPricesStats.tickerCount === 0 ? (
                  <div className={styles.storageEmptyRow}>No manual prices stored yet.</div>
                ) : (
                  manualPricesStats.perTicker.map(row => (
                    <div key={row.ticker} className={styles.storageRow}>
                      <span className={styles.storageTicker}>{row.ticker}</span>
                      <span className={styles.storageCount}>{row.count} price{row.count !== 1 ? 's' : ''}</span>
                      <span className={styles.storageBytes}>{fmtBytes(row.bytes)}</span>
                    </div>
                  ))
                )}
                {manualPricesStats.tickerCount > 0 && (
                  <div className={`${styles.storageRow} ${styles.storageSubtotal}`}>
                    <span className={styles.storageTicker}>Total</span>
                    <span className={styles.storageCount}>
                      {manualPricesStats.tickerCount} ticker{manualPricesStats.tickerCount !== 1 ? 's' : ''},
                      {' '}{manualPricesStats.recordCount} price{manualPricesStats.recordCount !== 1 ? 's' : ''}
                    </span>
                    <span className={styles.storageBytes}>{fmtBytes(manualPricesStats.bytes)}</span>
                    <button
                      className={styles.btnSmDanger}
                      onClick={() => setManualPricesDeleteConfirm(true)}
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            </div>
            {manualPricesDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Clear all manual stock prices ({manualPricesStats.recordCount} records across {manualPricesStats.tickerCount} tickers)?
                  This cannot be undone — these are user-entered prices, not API data, so they will not be re-fetched.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setManualPricesDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    clearAllManualPrices()
                    setManualPricesStats(getManualPricesStats())
                    setManualPricesDeleteConfirm(false)
                  }}>Clear</button>
                </div>
              </div>
            )}
          </div>

          {/* Buy-Sell Planning scenarios (user data — included in all backups) */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Buy-Sell Planning</div>
            <p className={styles.description}>
              Saved planning scenarios from the Buy-Sell Planning screen (planned buys, sells, top-ups,
              FX overrides). User data — included in both Sharable and Full backups.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                {tradingScenariosStats.scenarioCount === 0 ? (
                  <div className={styles.storageEmptyRow}>No scenarios saved yet.</div>
                ) : (
                  tradingScenariosStats.perScenario.map(row => (
                    <div key={row.id} className={styles.storageRow}>
                      <span className={styles.storageTicker}>{row.name}</span>
                      <span className={styles.storageCount}>
                        {row.sellRows} sell{row.sellRows !== 1 ? 's' : ''},
                        {' '}{row.buyRows} buy{row.buyRows !== 1 ? 's' : ''}
                      </span>
                      <span className={styles.storageBytes}>{fmtBytes(row.bytes)}</span>
                    </div>
                  ))
                )}
                {tradingScenariosStats.scenarioCount > 0 && (
                  <div className={`${styles.storageRow} ${styles.storageSubtotal}`}>
                    <span className={styles.storageTicker}>Total</span>
                    <span className={styles.storageCount}>
                      {tradingScenariosStats.scenarioCount} scenario{tradingScenariosStats.scenarioCount !== 1 ? 's' : ''}
                    </span>
                    <span className={styles.storageBytes}>{fmtBytes(tradingScenariosStats.bytes)}</span>
                    <button
                      className={styles.btnSmDanger}
                      onClick={() => setTradingScenariosDeleteConfirm(true)}
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            </div>
            {tradingScenariosDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Clear all Buy-Sell Planning scenarios ({tradingScenariosStats.scenarioCount} total)?
                  This cannot be undone — planned trades that have not been executed will be lost.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setTradingScenariosDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    deleteAllTradingScenarios()
                    setTradingScenariosStats(getTradingScenariosStats())
                    setTradingScenariosDeleteConfirm(false)
                  }}>Clear</button>
                </div>
              </div>
            )}
          </div>

          {/* Market data cache (hot cache — excluded from all backups, rebuilds itself) */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Market data cache</div>
            <p className={styles.description}>
              Short-lived price, news, and profile data. Rebuilds itself automatically — excluded from
              both Sharable and Full backups. Prices expire after 1 hour; news after 15 minutes;
              profiles are kept until refreshed manually.
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

          {/* Investment report presets */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Investment report presets</div>
            <p className={styles.description}>
              Named filter + column presets saved in Investment Reports.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>Presets</span>
                  <span className={styles.storageCount}>
                    {reportPresetCount} preset{reportPresetCount !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.storageBytes}>{fmtBytes(reportPresetBytes)}</span>
                  <button
                    className={styles.btnSmDanger}
                    disabled={reportPresetCount === 0}
                    onClick={() => setReportPresetDeleteConfirm(true)}
                  >
                    Delete all
                  </button>
                </div>
              </div>
            </div>
            {reportPresetDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Delete all {reportPresetCount} report preset{reportPresetCount !== 1 ? 's' : ''}? This cannot be undone.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setReportPresetDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    deleteAllReportPresets()
                    setReportPresetCount(getReportPresets().length)
                    setReportPresetBytes(getReportPresetsStorageBytes())
                    setReportPresetDeleteConfirm(false)
                  }}>Delete</button>
                </div>

          {/* Pie chart presets */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Pie chart presets</div>
            <p className={styles.description}>
              Saved pie chart configurations in the Investment Reports → Pie charts tab.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>Charts</span>
                  <span className={styles.storageCount}>
                    {pieChartPresetCount} chart{pieChartPresetCount !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.storageBytes}>{fmtBytes(pieChartPresetBytes)}</span>
                  <button
                    className={styles.btnSmDanger}
                    disabled={pieChartPresetCount === 0}
                    onClick={() => setPieChartPresetDeleteConfirm(true)}
                  >
                    Delete all
                  </button>
                </div>
              </div>
            </div>
            {pieChartPresetDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Delete all {pieChartPresetCount} pie chart preset{pieChartPresetCount !== 1 ? 's' : ''}? This cannot be undone.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setPieChartPresetDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    deleteAllPieChartPresets()
                    setPieChartPresetCount(0)
                    setPieChartPresetBytes(getPieChartPresetsStorageBytes())
                    setPieChartPresetDeleteConfirm(false)
                  }}>Delete</button>
                </div>
              </div>
            )}
          </div>

          {/* Dividend chart presets */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Dividend chart presets</div>
            <p className={styles.description}>
              Saved payout chart configurations in the Dividends → Metrics tab.
            </p>
            <div className={styles.storageTable}>
              <div className={styles.storageSection}>
                <div className={styles.storageRow}>
                  <span className={styles.storageTicker}>Charts</span>
                  <span className={styles.storageCount}>
                    {divChartPresetCount} chart{divChartPresetCount !== 1 ? 's' : ''}
                  </span>
                  <span className={styles.storageBytes}>{fmtBytes(divChartPresetBytes)}</span>
                  <button
                    className={styles.btnSmDanger}
                    disabled={divChartPresetCount === 0}
                    onClick={() => setDivChartPresetDeleteConfirm(true)}
                  >
                    Delete all
                  </button>
                </div>
              </div>
            </div>
            {divChartPresetDeleteConfirm && (
              <div className={styles.inlineDialog}>
                <p className={styles.dialogMsg}>
                  Delete all {divChartPresetCount} dividend chart preset{divChartPresetCount !== 1 ? 's' : ''}? This cannot be undone.
                </p>
                <div className={styles.dialogActionsRow}>
                  <button className={styles.btnSmSec} onClick={() => setDivChartPresetDeleteConfirm(false)}>Cancel</button>
                  <button className={styles.btnSmDanger} onClick={() => {
                    deleteAllDividendChartPresets()
                    setDivChartPresetCount(0)
                    setDivChartPresetBytes(getDividendChartPresetsStorageBytes())
                    setDivChartPresetDeleteConfirm(false)
                  }}>Delete</button>
                </div>
              </div>
            )}
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
