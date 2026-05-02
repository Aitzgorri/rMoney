import { useState, useEffect, useRef } from 'react'
import { getAiConnection } from '../data/settings'
import { getSecret } from '../utils/secrets'
import { upsertStockProfile } from '../data/stockProfiles'
import { searchSymbols, getLatestPrice } from '../data/marketDataClient'
import { fmtAmt } from '../utils/format'
import styles from './StockProfileResolutionDialog.module.css'

const PROMPT_A = (ticker) =>
  `You are a financial-data assistant. The user is identifying the stock with ticker ${ticker}. ` +
  `Reply with strict JSON only — no prose, no markdown, no code fences: ` +
  `{"candidates":[{"name":"...","exchange":"...","currency":"..."},...]}. ` +
  `Up to 3 candidates. If you do not know, return {"candidates":[]}.`

const PROMPT_B = (query) =>
  `You are a financial-data assistant. The user is searching for a stock by the name or description: "${query}". ` +
  `Reply with strict JSON only — no prose, no markdown, no code fences: ` +
  `{"candidates":[{"ticker":"...","name":"...","exchange":"...","currency":"..."},...]}. ` +
  `Up to 3 candidates. If you do not know, return {"candidates":[]}.`

// selected shape:
//   null                           — nothing chosen yet (loading)
//   'manual'                       — manual entry row selected
//   { source: 'market', index: N } — market data candidate N
//   { source: 'ai',     index: N } — AI candidate N

// direction: 'A' (ticker entered, name unknown) | 'B' (name/query entered, ticker unknown)
// ticker: the ticker (direction A) or search query (direction B)
export default function StockProfileResolutionDialog({ ticker, direction = 'A', onConfirm, onCancel, confirmLabel = 'Confirm' }) {
  const [marketCandidates, setMarketCandidates] = useState([])
  const [marketLoading,    setMarketLoading]    = useState(false)
  const [aiCandidates,     setAiCandidates]     = useState([])
  const [aiLoading,        setAiLoading]        = useState(false)
  const [selected,         setSelected]         = useState(null)
  const [prices,           setPrices]           = useState({}) // { [candKey]: { price, currency } | null }
  const fetchedKeys = useRef(new Set())

  const [manualTicker,   setManualTicker]   = useState(direction === 'A' ? ticker : '')
  const [manualName,     setManualName]     = useState('')
  const [manualExchange, setManualExchange] = useState('')
  const [manualCurrency, setManualCurrency] = useState('USD')

  const isB = direction === 'B'

  useEffect(() => {
    let cancelled = false
    const conn = getAiConnection()
    const hasAi = !!(conn?.enabled && conn?.endpointUrl && conn?.apiKeySet)

    // Count sources so we know when all have finished and can fall back to manual.
    let doneCount = 0
    const totalSources = 1 + (hasAi ? 1 : 0)

    function handleSourceDone(newCandidates, source) {
      doneCount++
      if (cancelled) return
      if (newCandidates.length > 0) {
        setSelected(prev => prev !== null ? prev : { source, index: 0 })
      } else if (doneCount === totalSources) {
        // Every source returned empty — fall back to manual entry
        setSelected(prev => prev !== null ? prev : 'manual')
      }
    }

    setMarketLoading(true)
    searchSymbols(ticker)
      .then(candidates => {
        if (cancelled) return
        setMarketCandidates(candidates)
        handleSourceDone(candidates, 'market')
      })
      .catch(() => { if (!cancelled) handleSourceDone([], 'market') })
      .finally(() => { if (!cancelled) setMarketLoading(false) })

    if (hasAi) {
      setAiLoading(true)
      callAi(conn, isB ? PROMPT_B(ticker) : PROMPT_A(ticker))
        .then(candidates => {
          if (cancelled) return
          setAiCandidates(candidates)
          handleSourceDone(candidates, 'ai')
        })
        .catch(() => { if (!cancelled) handleSourceDone([], 'ai') })
        .finally(() => { if (!cancelled) setAiLoading(false) })
    }

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch price per candidate as they arrive, non-blocking
  useEffect(() => {
    const allCandidates = [...marketCandidates, ...aiCandidates]
    allCandidates.forEach(c => {
      const t = c.ticker ?? ticker
      const k = `${t}|${c.exchange ?? ''}`
      if (fetchedKeys.current.has(k)) return
      fetchedKeys.current.add(k)
      getLatestPrice(t, c.exchange ?? null)
        .then(r => setPrices(prev => ({ ...prev, [k]: { price: r.price, currency: r.currency } })))
        .catch(() => setPrices(prev => ({ ...prev, [k]: null })))
    })
  }, [marketCandidates, aiCandidates, ticker])

  function handleConfirm() {
    let resolved
    if (selected === 'manual') {
      resolved = {
        ticker:         isB ? manualTicker.trim().toUpperCase() : ticker,
        name:           manualName.trim() || null,
        stockExchange:  manualExchange.trim() || null,
        currency:       manualCurrency.trim().toUpperCase() || null,
        resolvedSource: 'manual',
      }
    } else {
      const c = selected.source === 'market'
        ? marketCandidates[selected.index]
        : aiCandidates[selected.index]
      resolved = {
        ticker:         isB ? (c.ticker?.trim().toUpperCase() ?? ticker) : ticker,
        name:           c.name ?? null,
        stockExchange:  c.exchange ?? null,
        currency:       c.currency ?? null,
        resolvedSource: selected.source,
      }
    }
    upsertStockProfile(resolved.ticker, {
      name:           resolved.name,
      stockExchange:  resolved.stockExchange,
      currency:       resolved.currency,
      resolvedSource: resolved.resolvedSource,
      resolvedAt:     new Date().toISOString(),
    })
    onConfirm(resolved)
  }

  const canConfirm = selected === 'manual'
    ? (!isB || manualTicker.trim().length > 0)
    : selected !== null

  const isLoading = marketLoading || aiLoading
  const title = isB ? `Find ticker for "${ticker}"` : `Identify ${ticker}`

  function isSel(source, index) {
    return selected?.source === source && selected?.index === index
  }

  return (
    <div className={styles.backdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>{title}</h2>

        {isLoading && (
          <div className={styles.loading}>
            <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
            <span className={styles.loadingText}>
              {marketLoading && aiLoading ? 'Searching…'
                : marketLoading ? 'Searching market data…'
                : 'Asking AI…'}
            </span>
          </div>
        )}

        {/* Scrollable market data + AI candidates */}
        <div className={styles.candidateList}>

          {/* Market data candidates */}
          {marketCandidates.map((c, i) => {
            const k = `${c.ticker ?? ticker}|${c.exchange ?? ''}`
            const p = prices[k]
            return (
              <label key={`m${i}`} className={`${styles.candidateRow} ${isSel('market', i) ? styles.candidateSelected : ''}`}>
                <input type="radio" name="candidate" checked={isSel('market', i)}
                  onChange={() => setSelected({ source: 'market', index: i })} className={styles.radio} />
                <span className={styles.source}>from {c.source}</span>
                {isB && <span className={styles.candidateTicker}>{c.ticker ?? '—'}</span>}
                <span className={styles.candidateName}>{c.name ?? '—'}</span>
                <span className={styles.candidateMeta}>{c.exchange ?? '—'}</span>
                <span className={styles.candidateMeta}>{c.currency ?? '—'}</span>
                <span className={styles.candidatePrice}>
                  {p === undefined ? '…' : p === null ? '—' : `${fmtAmt(p.price)} ${p.currency ?? ''}`}
                </span>
              </label>
            )
          })}

          {/* AI candidates */}
          {aiCandidates.map((c, i) => {
            const k = `${c.ticker ?? ticker}|${c.exchange ?? ''}`
            const p = prices[k]
            return (
              <label key={`a${i}`} className={`${styles.candidateRow} ${isSel('ai', i) ? styles.candidateSelected : ''}`}>
                <input type="radio" name="candidate" checked={isSel('ai', i)}
                  onChange={() => setSelected({ source: 'ai', index: i })} className={styles.radio} />
                <span className={styles.source}>from AI</span>
                {isB && <span className={styles.candidateTicker}>{c.ticker ?? '—'}</span>}
                <span className={styles.candidateName}>{c.name ?? '—'}</span>
                <span className={styles.candidateMeta}>{c.exchange ?? '—'}</span>
                <span className={styles.candidateMeta}>{c.currency ?? '—'}</span>
                <span className={styles.candidatePrice}>
                  {p === undefined ? '…' : p === null ? '—' : `${fmtAmt(p.price)} ${p.currency ?? ''}`}
                </span>
              </label>
            )
          })}

        </div>

        {/* Manual entry — pinned below the scroll, always visible */}
        <div className={styles.manualSection}>
          <label className={`${styles.candidateRow} ${styles.manualRow} ${selected === 'manual' ? styles.candidateSelected : ''}`}>
            <input
              type="radio"
              name="candidate"
              checked={selected === 'manual'}
              onChange={() => setSelected('manual')}
              className={styles.radio}
            />
            <span className={styles.source}>manually</span>
            <div className={styles.manualFields}>
              {isB && (
                <div className={styles.manualField}>
                  <label className={styles.manualLabel}>Ticker</label>
                  <input
                    className={styles.manualInput}
                    value={manualTicker}
                    onChange={e => setManualTicker(e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    disabled={selected !== 'manual'}
                    onClick={() => setSelected('manual')}
                  />
                </div>
              )}
              <div className={styles.manualField}>
                <label className={styles.manualLabel}>Name</label>
                <input
                  className={styles.manualInput}
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Apple Inc."
                  disabled={selected !== 'manual'}
                  onClick={() => setSelected('manual')}
                />
              </div>
              <div className={styles.manualFieldRow}>
                <div className={styles.manualField}>
                  <label className={styles.manualLabel}>Exchange</label>
                  <input
                    className={`${styles.manualInput} ${styles.manualInputShort}`}
                    value={manualExchange}
                    onChange={e => setManualExchange(e.target.value.toUpperCase())}
                    placeholder="NASDAQ"
                    disabled={selected !== 'manual'}
                    onClick={() => setSelected('manual')}
                  />
                </div>
                <div className={styles.manualField}>
                  <label className={styles.manualLabel}>Currency</label>
                  <input
                    className={`${styles.manualInput} ${styles.manualInputShort}`}
                    value={manualCurrency}
                    onChange={e => setManualCurrency(e.target.value.toUpperCase())}
                    placeholder="USD"
                    disabled={selected !== 'manual'}
                    onClick={() => setSelected('manual')}
                  />
                </div>
              </div>
            </div>
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!canConfirm || isLoading}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── One-shot AI call (no chat history) ───────────────────────────────────────

async function callAi(conn, prompt) {
  const isAnthropic = conn.endpointUrl.includes('anthropic')
  const headers = { 'Content-Type': 'application/json' }
  let body, fetchUrl = conn.endpointUrl

  if (import.meta.env.DEV) {
    if (isAnthropic) fetchUrl = conn.endpointUrl.replace('https://api.anthropic.com', '/ai-proxy/anthropic')
    else fetchUrl = conn.endpointUrl.replace('https://api.openai.com', '/ai-proxy/openai')
  }

  const apiKey = await getSecret('ai/apiKey')

  if (isAnthropic) {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
    body = {
      model: conn.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
    body = {
      model: conn.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }
  }

  const response = await fetch(fetchUrl, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || `AI request failed (${response.status})`)

  const text = data?.choices?.[0]?.message?.content ?? data?.content?.[0]?.text
  if (!text) throw new Error('Unexpected response format')

  const json = JSON.parse(text.replace(/```json|```/g, '').trim())
  if (!Array.isArray(json?.candidates)) throw new Error('Invalid shape')
  return json.candidates
}
