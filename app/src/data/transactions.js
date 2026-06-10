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
  return load(KEY_TRANSACTIONS).sort((a, b) => new Date(b.date) - new Date(a.date))
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
