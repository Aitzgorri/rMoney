import appStorage from '../utils/appStorage'

const KEY_TRANSACTIONS = 'rmoney_transactions'
const KEY_PAYEES       = 'rmoney_payees'
const KEY_RECURRING    = 'rmoney_recurring'

// ─── Helpers ────────────────────────────────────────────────────────────────

function load(key) {
  try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] }
}

function save(key, data) {
  appStorage.setItem(key, JSON.stringify(data))
}

function generateId() {
  return crypto.randomUUID()
}

// ─── Transactions ────────────────────────────────────────────────────────────

export function getTransactions() {
  // Newest first by date, then by entry time within the same date so the last
  // transaction entered for a given date sits at the top of that date (Phase 49a).
  return load(KEY_TRANSACTIONS).sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date)
    if (dateDiff !== 0) return dateDiff
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
}

// The account of the newest transaction in list order (date desc, then entry
// time desc) — the "last-used" prefill fallback when no account filter is
// active (Phase 51d/53a). Transfers carry source/destination ids instead of
// `accountId` and are skipped.
export function getLastUsedAccountId() {
  return getTransactions().find(t => t.accountId)?.accountId ?? null
}

export function createTransaction(fields) {
  const transactions = load(KEY_TRANSACTIONS)
  const tx = {
    id: generateId(),
    ...fields,
    createdAt: new Date().toISOString(),
  }
  save(KEY_TRANSACTIONS, [...transactions, tx])

  // Save payee if provided and not already known
  if (fields.payeeName?.trim()) {
    savePayee(fields.payeeName.trim())
  }

  return tx
}

export function updateTransaction(id, fields) {
  const transactions = load(KEY_TRANSACTIONS)
  save(KEY_TRANSACTIONS, transactions.map(t => t.id === id ? { ...t, ...fields } : t))
  if (fields.payeeName?.trim()) savePayee(fields.payeeName.trim())
}

export function deleteTransaction(id) {
  const transactions = load(KEY_TRANSACTIONS)
  save(KEY_TRANSACTIONS, transactions.filter(t => t.id !== id))
}

// ─── Payees ──────────────────────────────────────────────────────────────────

export function getPayees() {
  return load(KEY_PAYEES).sort((a, b) => a.name.localeCompare(b.name))
}

// Payees ranked for autocomplete (Phase 44a): by transaction frequency (most
// used first), tie-broken by most-recent use, then alphabetically. Folds in
// registry payees never used in a transaction (count 0). Grouped by normalized
// (trimmed, lower-cased) name so case/whitespace variants count together; the
// most-recently-seen original spelling is the display name.
export function getPayeesRanked() {
  const stats = new Map()  // normKey -> { name, count, lastUsed }
  for (const t of load(KEY_TRANSACTIONS)) {
    const name = t.payeeName?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const cur = stats.get(key) ?? { name, count: 0, lastUsed: '' }
    cur.count += 1
    const d = t.date ?? ''
    if (d >= cur.lastUsed) { cur.lastUsed = d; cur.name = name }
    stats.set(key, cur)
  }
  for (const p of load(KEY_PAYEES)) {
    const key = p.name.trim().toLowerCase()
    if (!stats.has(key)) stats.set(key, { name: p.name, count: 0, lastUsed: '' })
  }
  return [...stats.values()].sort((a, b) =>
    b.count - a.count ||
    (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : 0) ||
    a.name.localeCompare(b.name)
  )
}

// The distinct values of `field` most recently used for a given payee, newest
// first, limited to `limit`. Matches the payee by normalized name and filters
// to a transaction type. Derived from transaction history — no new storage.
function recentFieldValuesForPayee(payeeName, type, field, limit) {
  const key = payeeName?.trim().toLowerCase()
  if (!key) return []
  const rows = load(KEY_TRANSACTIONS)
    .filter(t => t.type === type && t[field] && t.payeeName?.trim().toLowerCase() === key)
    .sort((a, b) => {
      const d = new Date(b.date) - new Date(a.date)
      return d !== 0 ? d : new Date(b.createdAt) - new Date(a.createdAt)
    })
  const seen = []
  for (const t of rows) {
    if (!seen.includes(t[field])) seen.push(t[field])
    if (seen.length >= limit) break
  }
  return seen
}

// Payee → category memory (Phase 51f): so an income form only sees income categories.
export function getRecentCategoriesForPayee(payeeName, type, limit = 3) {
  return recentFieldValuesForPayee(payeeName, type, 'categoryId', limit)
}

// Payee → envelope memory (Phase 53g): mirrors the category memory.
export function getRecentEnvelopesForPayee(payeeName, type, limit = 3) {
  return recentFieldValuesForPayee(payeeName, type, 'envelopeId', limit)
}

function savePayee(name) {
  const payees = load(KEY_PAYEES)
  if (payees.some(p => p.name.toLowerCase() === name.toLowerCase())) return
  save(KEY_PAYEES, [...payees, { id: generateId(), name, createdAt: new Date().toISOString() }])
}

// ─── Recurring rules ─────────────────────────────────────────────────────────

export function getRecurringRules() {
  return load(KEY_RECURRING)
}

export function createRecurringRule(fields) {
  const rules = load(KEY_RECURRING)
  const rule = { id: generateId(), isActive: true, createdAt: new Date().toISOString(), ...fields }
  save(KEY_RECURRING, [...rules, rule])
  return rule
}

export function updateRecurringRule(id, fields) {
  const rules = load(KEY_RECURRING)
  save(KEY_RECURRING, rules.map(r => r.id === id ? { ...r, ...fields } : r))
}

export function deleteRecurringRule(id) {
  const rules = load(KEY_RECURRING)
  save(KEY_RECURRING, rules.filter(r => r.id !== id))
}

// Returns true if any transaction references the given account.
export function hasTransactionsForAccount(accountId) {
  return load(KEY_TRANSACTIONS).some(t => {
    if (t.type === 'transfer') {
      return t.sourceAccountId === accountId || t.destinationAccountId === accountId
    }
    return t.accountId === accountId
  })
}

// ─── Account balance ─────────────────────────────────────────────────────────

export function getAccountBalance(accountId, startingBalance) {
  const txs = load(KEY_TRANSACTIONS).filter(t => {
    if (t.type === 'transfer') {
      return t.sourceAccountId === accountId || t.destinationAccountId === accountId
    }
    return t.accountId === accountId
  })

  const delta = txs.reduce((sum, t) => {
    if (t.type === 'income')   return sum + Number(t.amount)
    if (t.type === 'expense')  return sum - Number(t.amount)
    if (t.type === 'transfer') {
      if (t.sourceAccountId === accountId)      return sum - Number(t.sourceAmount)
      if (t.destinationAccountId === accountId) return sum + Number(t.destinationAmount)
    }
    return sum
  }, 0)

  return Number(startingBalance) + delta
}
