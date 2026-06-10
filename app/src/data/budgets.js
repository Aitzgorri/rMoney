import { getActiveCategories, getDescendants } from './categories'
import { getTransactions } from './transactions'
import { getPlanningStartDay, getSetting, setSetting } from './settings'
import { getCurrentPeriod } from '../utils/planningPeriod'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_budgets'

function load() {
  try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] }
}
function save(data) { appStorage.setItem(KEY, JSON.stringify(data)) }

// ─── Settings ────────────────────────────────────────────────────────────────

export function getBudgetWarningThreshold() {
  return getSetting('budgetWarningThresholdPercent', 80)
}

export function setBudgetWarningThreshold(value) {
  setSetting('budgetWarningThresholdPercent', Number(value))
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function getBudgets() {
  return load()
}

export function getBudgetForCategory(categoryId) {
  return load().find(b => b.categoryId === categoryId) ?? null
}

export function createBudget({ categoryId, amount, currency, period }) {
  const budget = {
    id: crypto.randomUUID(),
    categoryId,
    amount: Number(amount),
    currency,
    period,
    createdAt: new Date().toISOString(),
  }
  save([...load(), budget])
  return budget
}

export function updateBudget(id, fields) {
  save(load().map(b => b.id === id ? { ...b, ...fields } : b))
}

export function deleteBudget(id) {
  save(load().filter(b => b.id !== id))
}

// ─── Period computation ───────────────────────────────────────────────────────

// Returns { start: Date, end: Date } for the current window of the given period type.
// Monthly: aligns with the global planning period start day (SPEC-008).
// Quarterly: 3-month windows aligned to Jan/Apr/Jul/Oct with the same start day.
// Yearly: Jan startDay → Jan (startDay-1) next year.
export function computeBudgetPeriod(period, today = new Date()) {
  const startDay = getPlanningStartDay()
  const year = today.getFullYear()
  const month = today.getMonth()   // 0-based
  const day = today.getDate()

  if (period === 'monthly') {
    const { start, end } = getCurrentPeriod(today)
    return { start, end }
  }

  if (period === 'quarterly') {
    // Find the month in which the current monthly period started.
    let effMonth, effYear
    if (day >= startDay) {
      effMonth = month
      effYear = year
    } else {
      effMonth = month === 0 ? 11 : month - 1
      effYear = month === 0 ? year - 1 : year
    }
    // Floor down to nearest quarter boundary (every 3 months from Jan)
    const qStartMonth = effMonth - (effMonth % 3)
    const qStartYear = effYear

    const start = new Date(qStartYear, qStartMonth, startDay)
    const end = new Date(qStartYear, qStartMonth + 3, startDay - 1)
    return { start, end }
  }

  if (period === 'yearly') {
    // Yearly period: Jan startDay of year N to Jan (startDay-1) of year N+1
    const thisYearStart = new Date(year, 0, startDay)
    const startYear = today >= thisYearStart ? year : year - 1
    const start = new Date(startYear, 0, startDay)
    const end = new Date(startYear + 1, 0, startDay - 1)
    return { start, end }
  }

  return getCurrentPeriod(today)
}

function daysRemainingInPeriod(end, today = new Date()) {
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const diff = Math.floor((endMidnight - todayMidnight) / (1000 * 60 * 60 * 24)) + 1
  return Math.max(diff, 0)
}

// ─── Monthly actual (for parent nodes and un-budgeted leaves) ─────────────────

// Returns the sum of transactions for a category + all descendants
// within the current monthly period. Used in the tree view for nodes
// that have no budget of their own.
export function computeMonthlyActual(categoryId, today = new Date()) {
  const allCats = getActiveCategories()
  const cat = allCats.find(c => c.id === categoryId)
  if (!cat) return 0

  const { start, end } = getCurrentPeriod(today)
  const descendants = getDescendants(categoryId, allCats)
  const relevantIds = new Set([categoryId, ...descendants.map(d => d.id)])

  const txType = cat.type
  let actual = 0
  for (const tx of getTransactions()) {
    if (tx.type !== txType) continue
    if (!relevantIds.has(tx.categoryId)) continue
    const d = new Date(tx.date + 'T00:00:00')
    if (d >= start && d <= end) actual += Number(tx.amount)
  }
  return actual
}

// ─── Progress ─────────────────────────────────────────────────────────────────

// Returns { actual, remaining, percentUsed, status, periodStart, periodEnd, daysLeft }
// or null if the budget's category no longer exists.
export function computeBudgetProgress(budget, today = new Date()) {
  const allCats = getActiveCategories()
  const cat = allCats.find(c => c.id === budget.categoryId)
  if (!cat) return null

  const { start, end } = computeBudgetPeriod(budget.period, today)

  // Category + all descendants
  const descendants = getDescendants(budget.categoryId, allCats)
  const relevantIds = new Set([budget.categoryId, ...descendants.map(d => d.id)])

  // Sum transactions of the right type within the period
  const txType = cat.type  // 'income' | 'expense'
  let actual = 0
  for (const tx of getTransactions()) {
    if (tx.type !== txType) continue
    if (!relevantIds.has(tx.categoryId)) continue
    const d = new Date(tx.date + 'T00:00:00')
    if (d >= start && d <= end) actual += Number(tx.amount)
  }

  const threshold = getBudgetWarningThreshold()
  const percentUsed = budget.amount > 0 ? actual / budget.amount : 0
  const remaining = budget.amount - actual

  let status
  if (percentUsed >= 1) status = 'over'
  else if (percentUsed * 100 >= threshold) status = 'near-limit'
  else status = 'ok'

  return {
    actual,
    remaining,
    percentUsed,
    status,
    periodStart: start,
    periodEnd: end,
    daysLeft: daysRemainingInPeriod(end, today),
  }
}
