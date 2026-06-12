// Envelope balance projection (Phase 52). Forecasts the next `months` months of
// an envelope's TOTAL balance (the envelope + its descendants, matching
// getTotalEnvelopeBalance) from every flow that moves it:
//
//   B(N) = B(N-1) + R + A + O(N)
//
//   R  recurring scheduled monthly net — scheduled envelope transfers (in/out)
//      AND recurring Bills & Income planned items tagged to the scope, each as a
//      monthly equivalent.
//   A  average unscheduled monthly net — actual flows over the last 3 complete
//      calendar months that were NOT schedule-generated (isScheduled transfers /
//      isPlanned transactions are excluded), divided by the months of history
//      available (≤3).
//   O(N) one-time future scheduled items dated in month N — future-dated one-time
//      planned items and one-time envelope transfers, placed in their own month.
//
// Returns { series: [{ label, amount }], recurringNet, avgUnscheduledNet,
// monthsUsed }. `series` is empty when there is nothing to project.
import {
  getScheduledTransfers, getEnvelopeTransfers, getEnvelopes, getDescendants,
  getTotalEnvelopeBalance,
} from '../data/envelopes'
import { getPlannedItems } from '../data/bills'
import { getTransactions } from '../data/transactions'
import { monthlyEquivalent } from './frequency'
import { localDateStr } from './dates'

export function buildEnvelopeProjection(envelopeId, months = 6) {
  const all = getEnvelopes()
  const scope = new Set([envelopeId, ...getDescendants(envelopeId, all).map(e => e.id)])
  const scopeEnvelopes = all.filter(e => scope.has(e.id))
  const hasDefaultIncome  = scopeEnvelopes.some(e => e.isDefaultIncome)
  const hasDefaultExpense = scopeEnvelopes.some(e => e.isDefaultExpense)

  const B0 = getTotalEnvelopeBalance(envelopeId)
  const today = new Date()
  const todayStr = localDateStr(today)

  // ── R: recurring scheduled monthly net ──────────────────────────────────────
  let R = 0
  for (const s of getScheduledTransfers()) {
    if (!s.isActive) continue
    const inn = scope.has(s.toEnvelopeId)
    const out = scope.has(s.fromEnvelopeId)
    if (!inn && !out) continue
    const eq = monthlyEquivalent(s.amount, s.frequency || 'monthly')
    R += (inn ? eq : 0) - (out ? eq : 0)
  }
  for (const p of getPlannedItems()) {
    if (!p.isActive || p.frequency === 'one-time' || !scope.has(p.envelopeId)) continue
    const eq = monthlyEquivalent(p.amount, p.frequency)
    R += p.type === 'income' ? eq : -eq
  }

  // ── A: average unscheduled monthly net over the last 3 complete months ───────
  const windowStartStr = localDateStr(new Date(today.getFullYear(), today.getMonth() - 3, 1))
  const windowEndStr   = localDateStr(new Date(today.getFullYear(), today.getMonth(), 0)) // last day of prev month

  // Signed unscheduled contribution of a transaction (0 if scheduled / out of scope).
  function txFlow(t) {
    if (t.type !== 'income' && t.type !== 'expense') return 0
    if (t.isPlanned) return 0
    const inScope = scope.has(t.envelopeId) ||
      (!t.envelopeId && ((t.type === 'income' && hasDefaultIncome) || (t.type === 'expense' && hasDefaultExpense)))
    if (!inScope) return 0
    return t.type === 'income' ? Number(t.amount) : -Number(t.amount)
  }
  // Signed unscheduled contribution of an envelope transfer.
  function transferFlow(tr) {
    if (tr.isScheduled) return 0
    const inn = scope.has(tr.toEnvelopeId)
    const out = scope.has(tr.fromEnvelopeId)
    if (!inn && !out) return 0
    return (inn ? Number(tr.amount) : 0) - (out ? Number(tr.amount) : 0)
  }

  const transfers = getEnvelopeTransfers()
  let windowSum = 0
  let earliest = null
  for (const t of getTransactions()) {
    const f = txFlow(t)
    if (f === 0) continue
    if (!earliest || t.date < earliest) earliest = t.date
    if (t.date >= windowStartStr && t.date <= windowEndStr) windowSum += f
  }
  for (const tr of transfers) {
    const f = transferFlow(tr)
    if (f === 0) continue
    if (!earliest || tr.date < earliest) earliest = tr.date
    if (tr.date >= windowStartStr && tr.date <= windowEndStr) windowSum += f
  }

  // Denominator = complete months of history available, capped to [1, 3].
  let monthsUsed = 0
  if (earliest) {
    const [ey, em] = earliest.split('-').map(Number)
    const elapsed = (today.getFullYear() - ey) * 12 + (today.getMonth() - (em - 1))
    monthsUsed = Math.max(1, Math.min(3, elapsed))
  }
  const A = monthsUsed > 0 ? windowSum / monthsUsed : 0

  // ── O(N): one-time future scheduled items, by month offset (1..months) ───────
  function monthOffset(dateStr) {
    const [y, m] = dateStr.split('-').map(Number)
    return (y - today.getFullYear()) * 12 + ((m - 1) - today.getMonth())
  }
  const oneTime = {}
  function addOneTime(dateStr, amount) {
    if (!dateStr || dateStr <= todayStr) return
    const off = monthOffset(dateStr)
    if (off < 1 || off > months) return
    oneTime[off] = (oneTime[off] || 0) + amount
  }
  for (const p of getPlannedItems()) {
    if (!p.isActive || p.frequency !== 'one-time' || !scope.has(p.envelopeId)) continue
    addOneTime(p.date, p.type === 'income' ? Number(p.amount) : -Number(p.amount))
  }
  for (const tr of transfers) {
    const inn = scope.has(tr.toEnvelopeId)
    const out = scope.has(tr.fromEnvelopeId)
    if (!inn && !out) continue
    addOneTime(tr.date, (inn ? Number(tr.amount) : 0) - (out ? Number(tr.amount) : 0))
  }

  // Nothing to project → empty series (the panel hides itself).
  const noFlows = Math.abs(R) < 0.005 && Math.abs(A) < 0.005 && Object.keys(oneTime).length === 0
  if (noFlows) return { series: [], recurringNet: 0, avgUnscheduledNet: 0, monthsUsed }

  const series = []
  let running = B0
  for (let i = 1; i <= months; i++) {
    running += R + A + (oneTime[i] || 0)
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    series.push({ label: d.toLocaleString('default', { month: 'short', year: 'numeric' }), amount: running })
  }
  return { series, recurringNet: R, avgUnscheduledNet: A, monthsUsed }
}
