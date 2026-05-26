import { useState, useEffect, useRef } from 'react'
import { getStockProfile, upsertStockProfile } from '../data/stockProfiles'
import { getAiConnection } from '../data/settings'
import { getSecret } from '../utils/secrets'
import { searchSymbols, getLatestPrice, getMarketProfile } from '../data/marketDataClient'
import { fmtAmt } from '../utils/format'
import CurrencyDropdown from './CurrencyDropdown'
import styles from './EditProfileDialog.module.css'

const PROMPT_A = (ticker) =>
  `You are a financial-data assistant. The user is identifying the stock with ticker ${ticker}. ` +
  `Reply with strict JSON only — no prose, no markdown, no code fences: ` +
  `{"candidates":[{"name":"...","exchange":"...","currency":"..."},...]}. ` +
  `Up to 3 candidates. If you do not know, return {"candidates":[]}.`

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
    body = { model: conn.model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] }
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
    body = { model: conn.model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] }
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

export default function EditProfileDialog({ ticker, profile: profileProp, onSave, onCancel }) {
  const profile = getStockProfile(ticker) ?? profileProp

  // ── Identity section mode ────────────────────────────────────────────────
  const [identityMode, setIdentityMode] = useState('resolution') // 'resolution' | 'manual'

  // Resolution state
  const [marketCandidates, setMarketCandidates] = useState([])
  const [marketLoading,    setMarketLoading]    = useState(false)
  const [aiCandidates,     setAiCandidates]     = useState([])
  const [aiLoading,        setAiLoading]        = useState(false)
  const [selected,         setSelected]         = useState(null)
  const [prices,           setPrices]           = useState({})
  const fetchedKeys = useRef(new Set())

  // Manual identity fields (shown in manual mode)
  const [manualName,     setManualName]     = useState(profile?.name ?? '')
  const [manualExchange, setManualExchange] = useState(profile?.stockExchange ?? '')
  const [manualCurrency, setManualCurrency] = useState(profile?.currency ?? '')

  // ── Settings section ─────────────────────────────────────────────────────
  const [hqCountryOverride, setHqCountryOverride] = useState(
    profile?.hqCountryOverride ?? profile?.hqCountry ?? ''
  )
  const [fetchedHqCountry, setFetchedHqCountry] = useState(profile?.hqCountry ?? null)
  const [frequency, setFrequency] = useState(profile?.dividendFrequency ?? 'unknown')
  const [estRule,   setEstRule]   = useState(profile?.amountEstimationRule ?? 'last-paid')
  const [manualAmt, setManualAmt] = useState(String(profile?.manualEstimatedAmount ?? ''))

  // Fetch candidates on mount
  useEffect(() => {
    let cancelled = false
    const conn = getAiConnection()
    const hasAi = !!(conn?.enabled && conn?.endpointUrl && conn?.apiKeySet)
    let doneCount = 0
    const totalSources = 1 + (hasAi ? 1 : 0)

    function handleSourceDone(newCandidates, source) {
      doneCount++
      if (cancelled) return
      if (newCandidates.length > 0) {
        setSelected(prev => prev !== null ? prev : { source, index: 0 })
      } else if (doneCount === totalSources) {
        setSelected(prev => prev !== null ? prev : 'manual')
        setIdentityMode('manual')
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
      callAi(conn, PROMPT_A(ticker))
        .then(candidates => {
          if (cancelled) return
          setAiCandidates(candidates)
          handleSourceDone(candidates, 'ai')
        })
        .catch(() => { if (!cancelled) handleSourceDone([], 'ai') })
        .finally(() => { if (!cancelled) setAiLoading(false) })
    }

    // Background hqCountry fetch
    getMarketProfile(ticker, profile?.stockExchange ?? null, { forceRefresh: true })
      .then(mp => {
        if (cancelled || !mp.hqCountry) return
        upsertStockProfile(ticker, { hqCountry: mp.hqCountry })
        setFetchedHqCountry(mp.hqCountry)
        setHqCountryOverride(prev => prev === '' ? mp.hqCountry : prev)
      })
      .catch(() => {})

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch price per candidate as they arrive
  useEffect(() => {
    const allCandidates = [...marketCandidates, ...aiCandidates]
    allCandidates.forEach(c => {
      const k = `${ticker}|${c.exchange ?? ''}`
      if (fetchedKeys.current.has(k)) return
      fetchedKeys.current.add(k)
      getLatestPrice(ticker, c.exchange ?? null)
        .then(r => setPrices(prev => ({ ...prev, [k]: { price: r.price, currency: r.currency } })))
        .catch(() => setPrices(prev => ({ ...prev, [k]: null })))
    })
  }, [marketCandidates, aiCandidates, ticker])

  function getIdentityFields() {
    if (identityMode === 'manual') {
      return {
        name:           manualName.trim() || null,
        stockExchange:  manualExchange.trim().toUpperCase() || null,
        currency:       manualCurrency || null,
        resolvedSource: 'manual',
      }
    }
    if (selected === null || selected === 'manual') {
      return { name: null, stockExchange: null, currency: null, resolvedSource: 'manual' }
    }
    const c = selected.source === 'market'
      ? marketCandidates[selected.index]
      : aiCandidates[selected.index]
    const k = `${ticker}|${c.exchange ?? ''}`
    const p = prices[k]
    const now = new Date().toISOString()
    return {
      name:           c.name ?? null,
      stockExchange:  c.exchange ?? null,
      currency:       c.currency ?? null,
      resolvedSource: selected.source,
      resolvedAt:     now,
      ...(p ? { lastKnownPrice: { amount: p.price, currency: p.currency, fetchedAt: now } } : {}),
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...getIdentityFields(),
      hqCountryOverride:    hqCountryOverride.trim() || null,
      dividendFrequency:    frequency,
      amountEstimationRule: estRule,
      manualEstimatedAmount: estRule === 'manual' && manualAmt !== '' ? Number(manualAmt) : null,
    })
  }

  const isLoading = marketLoading || aiLoading

  function isSel(source, index) {
    return selected?.source === source && selected?.index === index
  }

  return (
    <div className={styles.dialogBackdrop} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.dialogBox}>
        <h2 className={styles.dialogTitle}>Edit profile — {ticker}</h2>

        <form onSubmit={handleSubmit}>
          {/* ── Identity section ─────────────────────────────────────────── */}
          <div className={styles.sectionTitle}>Identity</div>

          {identityMode === 'resolution' ? (
            <div className={styles.resolutionSection}>
              {isLoading && (
                <div className={styles.loadingRow}>
                  <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                  <span className={styles.loadingText}>Searching…</span>
                </div>
              )}

              <div className={styles.candidateList}>
                {[...marketCandidates.map((c, i) => ({ c, source: 'market', i })),
                   ...aiCandidates.map((c, i) => ({ c, source: 'ai', i }))].map(({ c, source, i }) => {
                  const k = `${ticker}|${c.exchange ?? ''}`
                  const p = prices[k]
                  return (
                    <label
                      key={`${source}${i}`}
                      className={`${styles.candidateRow} ${isSel(source, i) ? styles.candidateSelected : ''}`}
                    >
                      <input
                        type="radio"
                        name="candidate"
                        checked={isSel(source, i)}
                        onChange={() => setSelected({ source, index: i })}
                        className={styles.radio}
                      />
                      <span className={styles.candidateSource}>from {source === 'market' ? c.source : 'AI'}</span>
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

              {!isLoading && (
                <button
                  type="button"
                  className={styles.switchModeBtn}
                  onClick={() => setIdentityMode('manual')}
                >
                  Switch to manual fields
                </button>
              )}
            </div>
          ) : (
            <div className={styles.manualSection}>
              <div className={styles.dialogField}>
                <label className={styles.dialogLabel}>Company name</label>
                <input
                  className={styles.dialogInput}
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Apple Inc."
                  autoFocus
                />
              </div>
              <div className={styles.dialogRow}>
                <div className={styles.dialogField}>
                  <label className={styles.dialogLabel}>Exchange (MIC)</label>
                  <input
                    className={styles.dialogInput}
                    value={manualExchange}
                    onChange={e => setManualExchange(e.target.value.toUpperCase())}
                    placeholder="XNAS"
                    maxLength={8}
                  />
                </div>
                <div className={styles.dialogField}>
                  <label className={styles.dialogLabel}>Currency (ISO)</label>
                  <CurrencyDropdown className={styles.dialogInput} value={manualCurrency} onChange={setManualCurrency} />
                </div>
              </div>
              {marketCandidates.length > 0 || aiCandidates.length > 0 ? (
                <button
                  type="button"
                  className={styles.switchModeBtn}
                  onClick={() => setIdentityMode('resolution')}
                >
                  Back to resolution
                </button>
              ) : null}
            </div>
          )}

          {/* ── Settings section ─────────────────────────────────────────── */}
          <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Settings</div>

          <div className={styles.dialogField}>
            <label className={styles.dialogLabel}>HQ country</label>
            <input
              className={styles.dialogInput}
              value={hqCountryOverride}
              onChange={e => setHqCountryOverride(e.target.value)}
              placeholder="US"
            />
            {fetchedHqCountry && profile?.hqCountryOverride && fetchedHqCountry !== profile.hqCountryOverride && (
              <p className={styles.dialogHint}>Provider-fetched: <strong>{fetchedHqCountry}</strong></p>
            )}
          </div>
          <div className={styles.dialogRow}>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Dividend frequency</label>
              <select className={styles.dialogSelect} value={frequency} onChange={e => setFrequency(e.target.value)}>
                <option value="unknown">Unknown</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi-annual">Semi-annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Dividend estimation</label>
              <select className={styles.dialogSelect} value={estRule} onChange={e => setEstRule(e.target.value)}>
                <option value="last-paid">Last paid</option>
                <option value="year-ago">Year ago</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
          {estRule === 'manual' && (
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel}>Manual estimate (per share)</label>
              <input
                className={styles.dialogInput}
                type="number"
                min="0"
                step="any"
                value={manualAmt}
                onChange={e => setManualAmt(e.target.value)}
                placeholder="0.25"
              />
            </div>
          )}

          <div className={styles.dialogActions}>
            <button type="button" className={styles.dialogCancelBtn} onClick={onCancel}>Cancel</button>
            <button type="submit" className={styles.dialogSaveBtn}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
