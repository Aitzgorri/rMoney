// Pending-split detection (SPEC-019 item 66).
//
// On each stock-page visit we ask the provider chain for corporate actions
// (Finnhub /stock/split, Twelve Data /splits, etc.). Splits the user already
// recorded as `type: 'split'` stockTransactions are filtered out, as are
// splits the user has explicitly dismissed. Whatever remains is surfaced as
// a "pending" notification with Apply / Dismiss actions.
//
// Persisted state is only the dismissal list — the pending list is derived on
// every visit. Dismissed entries live in appStorage under
// `rmoney_dismissed_splits` (see Settings → Storage tab).

import { getCorporateActions } from './marketDataClient'
import { getStockTransactionsByTicker } from './stockTransactions'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_dismissed_splits'

// How far back to ask the provider for split history. Wide enough to catch
// splits a user may have missed during an old import, narrow enough that we
// don't drag in irrelevant decade-old corporate actions.
const LOOKBACK_YEARS = 5

function load() {
  try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] }
}

function save(data) {
  appStorage.setItem(KEY, JSON.stringify(data))
}

function sameKey(a, b) {
  return a.ticker === b.ticker
      && a.date === b.date
      && Number(a.numerator) === Number(b.numerator)
      && Number(a.denominator) === Number(b.denominator)
}

export function getDismissedSplits() {
  return load()
}

export function isSplitDismissed({ ticker, date, ratio }) {
  const probe = {
    ticker: ticker.trim().toUpperCase(),
    date,
    numerator: Number(ratio.numerator),
    denominator: Number(ratio.denominator),
  }
  return load().some(d => sameKey(d, probe))
}

export function dismissSplit({ ticker, date, ratio }) {
  const entry = {
    ticker: ticker.trim().toUpperCase(),
    date,
    numerator: Number(ratio.numerator),
    denominator: Number(ratio.denominator),
    dismissedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const list = load()
  if (list.some(d => sameKey(d, entry))) return
  save([...list, entry])
}

export function deleteAllDismissedSplits() {
  save([])
}

export function getDismissedSplitsStorageBytes() {
  return new Blob([JSON.stringify(load())]).size
}

function lookbackIso() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - LOOKBACK_YEARS)
  return d.toISOString().slice(0, 10)
}

// Returns an array of { date, ratio: { numerator, denominator } } for the
// given ticker. Quietly returns [] when the provider chain throws or the
// adapter doesn't support corporate actions.
export async function getPendingApiSplits(ticker) {
  const t = ticker.trim().toUpperCase()
  let actions
  try {
    actions = await getCorporateActions(t, lookbackIso())
  } catch {
    return []
  }
  if (!Array.isArray(actions)) return []

  const userSplits = getStockTransactionsByTicker(t).filter(x => x.type === 'split')

  return actions
    .filter(a => a.type === 'split' && a.ratio
      && Number.isFinite(Number(a.ratio.numerator))
      && Number.isFinite(Number(a.ratio.denominator)))
    .filter(a => !userSplits.some(u =>
      u.date === a.date
      && Number(u.ratio?.numerator) === Number(a.ratio.numerator)
      && Number(u.ratio?.denominator) === Number(a.ratio.denominator)))
    .filter(a => !isSplitDismissed({ ticker: t, date: a.date, ratio: a.ratio }))
    .map(a => ({
      date: a.date,
      ratio: {
        numerator: Number(a.ratio.numerator),
        denominator: Number(a.ratio.denominator),
      },
    }))
}
