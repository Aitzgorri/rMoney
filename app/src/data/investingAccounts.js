import { createTransaction, deleteTransaction } from './transactions'
import { getAccounts } from './accounts'

const KEY_ACCOUNTS  = 'rmoney_investing_accounts'
const KEY_BALANCES  = 'rmoney_cash_balances'
const KEY_MOVEMENTS = 'rmoney_cash_movements'

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? [] } catch { return [] }
}
function save(key, data) { localStorage.setItem(key, JSON.stringify(data)) }

// ─── Investing accounts ───────────────────────────────────────────────────────

export function getInvestingAccounts() {
  return load(KEY_ACCOUNTS).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

export function getInvestingAccount(id) {
  return load(KEY_ACCOUNTS).find(a => a.id === id) ?? null
}

export function createInvestingAccount({ institution, name, note = null, defaultCsvTemplateId = null }) {
  const account = {
    id: crypto.randomUUID(),
    institution: institution.trim(),
    name: name.trim(),
    note: note?.trim() || null,
    defaultCsvTemplateId,
    createdAt: new Date().toISOString(),
  }
  save(KEY_ACCOUNTS, [...load(KEY_ACCOUNTS), account])
  return account
}

export function updateInvestingAccount(id, fields) {
  save(KEY_ACCOUNTS, load(KEY_ACCOUNTS).map(a =>
    a.id === id ? { ...a, ...fields } : a
  ))
}

// Returns { canDelete: true } or { canDelete: false, reason: string }
export function canDeleteInvestingAccount(id) {
  const balances = load(KEY_BALANCES).filter(b => b.investingAccountId === id)
  const movements = load(KEY_MOVEMENTS)
  for (const bal of balances) {
    const activity = movements.filter(m => m.cashBalanceId === bal.id && m.type !== 'opening')
    if (activity.length > 0) {
      return { canDelete: false, reason: 'This account has cash activity. Remove all movements first.' }
    }
    const opening = movements.find(m => m.cashBalanceId === bal.id && m.type === 'opening')
    if (opening && opening.amount !== 0) {
      return { canDelete: false, reason: 'All cash balances must be at zero before deleting.' }
    }
  }
  // Check stock transactions (read directly to avoid circular import)
  const stockTxns = (() => { try { return JSON.parse(localStorage.getItem('rmoney_stock_transactions')) ?? [] } catch { return [] } })()
  if (stockTxns.some(t => t.investingAccountId === id)) {
    return { canDelete: false, reason: 'This account has stock transactions. Remove all stock transactions first.' }
  }
  // Check dividends (read directly to avoid circular import)
  const dividends = (() => { try { return JSON.parse(localStorage.getItem('rmoney_dividends')) ?? [] } catch { return [] } })()
  if (dividends.some(d => d.investingAccountId === id)) {
    return { canDelete: false, reason: 'This account has dividend records. Remove all dividends first.' }
  }
  return { canDelete: true }
}

export function deleteInvestingAccount(id) {
  const { canDelete } = canDeleteInvestingAccount(id)
  if (!canDelete) throw new Error('Cannot delete account with activity.')
  const balances = load(KEY_BALANCES).filter(b => b.investingAccountId === id)
  const movements = load(KEY_MOVEMENTS)
  const balanceIds = new Set(balances.map(b => b.id))
  save(KEY_MOVEMENTS, movements.filter(m => !balanceIds.has(m.cashBalanceId)))
  save(KEY_BALANCES, load(KEY_BALANCES).filter(b => b.investingAccountId !== id))
  save(KEY_ACCOUNTS, load(KEY_ACCOUNTS).filter(a => a.id !== id))
}

// ─── Cash balances ────────────────────────────────────────────────────────────

export function getCashBalances(investingAccountId) {
  return load(KEY_BALANCES)
    .filter(b => b.investingAccountId === investingAccountId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

export function getCashBalance(id) {
  return load(KEY_BALANCES).find(b => b.id === id) ?? null
}

export function getCashBalanceByCurrency(investingAccountId, currency) {
  return load(KEY_BALANCES).find(
    b => b.investingAccountId === investingAccountId && b.currency === currency
  ) ?? null
}

export function getCurrentBalance(cashBalanceId) {
  const movements = load(KEY_MOVEMENTS).filter(m => m.cashBalanceId === cashBalanceId)
  return movements.reduce((sum, m) => sum + m.amount, 0)
}

export function createCashBalance({ investingAccountId, currency, openingBalance = 0 }) {
  const existing = getCashBalanceByCurrency(investingAccountId, currency)
  if (existing) return existing  // idempotent auto-create

  const balance = {
    id: crypto.randomUUID(),
    investingAccountId,
    currency,
    openingBalance: Number(openingBalance),
    createdAt: new Date().toISOString(),
  }
  save(KEY_BALANCES, [...load(KEY_BALANCES), balance])

  // Record the opening movement
  addCashMovement({
    type: 'opening',
    date: balance.createdAt.split('T')[0],
    cashBalanceId: balance.id,
    amount: Number(openingBalance),
    linkedBudgetingTransactionId: null,
    linkedStockTransactionId: null,
    linkedDividendId: null,
    exchangeRatesSnapshot: null,
  })
  return balance
}

export function updateCashBalanceOpening(id, newOpeningBalance) {
  const bal = getCashBalance(id)
  if (!bal) return
  const delta = Number(newOpeningBalance) - bal.openingBalance
  save(KEY_BALANCES, load(KEY_BALANCES).map(b =>
    b.id === id ? { ...b, openingBalance: Number(newOpeningBalance) } : b
  ))
  // Update the opening movement amount
  save(KEY_MOVEMENTS, load(KEY_MOVEMENTS).map(m =>
    m.cashBalanceId === id && m.type === 'opening'
      ? { ...m, amount: Number(newOpeningBalance) }
      : m
  ))
}

// Returns { canDelete: true } or { canDelete: false, reason: string }
export function canDeleteCashBalance(id) {
  const movements = load(KEY_MOVEMENTS).filter(m => m.cashBalanceId === id)
  const nonOpening = movements.filter(m => m.type !== 'opening')
  if (nonOpening.length > 0) {
    return { canDelete: false, reason: 'This cash balance has activity. Remove all movements first.' }
  }
  const opening = movements.find(m => m.type === 'opening')
  if (opening && opening.amount !== 0) {
    return { canDelete: false, reason: 'Opening balance must be zero to delete.' }
  }
  return { canDelete: true }
}

export function deleteCashBalance(id) {
  const { canDelete } = canDeleteCashBalance(id)
  if (!canDelete) throw new Error('Cannot delete cash balance with activity.')
  save(KEY_MOVEMENTS, load(KEY_MOVEMENTS).filter(m => m.cashBalanceId !== id))
  save(KEY_BALANCES, load(KEY_BALANCES).filter(b => b.id !== id))
}

// ─── Cash movements ───────────────────────────────────────────────────────────

export function getCashMovements(cashBalanceId) {
  return load(KEY_MOVEMENTS)
    .filter(m => m.cashBalanceId === cashBalanceId)
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
}

export function getAccountCashMovements(investingAccountId) {
  const balanceIds = new Set(
    load(KEY_BALANCES).filter(b => b.investingAccountId === investingAccountId).map(b => b.id)
  )
  return load(KEY_MOVEMENTS)
    .filter(m => balanceIds.has(m.cashBalanceId))
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
}

// Deletes a non-opening cash movement. If it has a linked budgeting transaction,
// that transaction is also deleted so the two sides stay in sync.
export function deleteCashMovement(id) {
  const movement = load(KEY_MOVEMENTS).find(m => m.id === id)
  if (!movement || movement.type === 'opening') return
  if (movement.linkedBudgetingTransactionId) {
    deleteTransaction(movement.linkedBudgetingTransactionId)
  }
  save(KEY_MOVEMENTS, load(KEY_MOVEMENTS).filter(m => m.id !== id))
}

export function addCashMovement(fields) {
  const movement = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    linkedBudgetingTransactionId: null,
    linkedStockTransactionId: null,
    linkedDividendId: null,
    exchangeRatesSnapshot: null,
    ...fields,
  }
  save(KEY_MOVEMENTS, [...load(KEY_MOVEMENTS), movement])
  return movement
}

// ─── Deposit (budgeting account → cash balance) ───────────────────────────────

// Returns { cashMovement, budgetingTransaction } or throws.
// Caller must have already confirmed any negative balance.
// budgetingAmount = amount in the budgeting account's currency (expense tx)
// amount          = amount credited to the cash balance (may differ when cross-currency)
export function depositToCashBalance({ date, cashBalanceId, amount, budgetingAmount, budgetingAccountId, budgetingEnvelopeId }) {
  const account = getAccounts().find(a => a.id === budgetingAccountId)
  const budgetingTx = createTransaction({
    type: 'expense',
    date,
    accountId: budgetingAccountId,
    envelopeId: budgetingEnvelopeId,
    currency: account?.currency,
    amount: Number(budgetingAmount ?? amount),
    note: 'Investment deposit',
    linkedFromInvestments: true,
  })
  const movement = addCashMovement({
    type: 'deposit',
    date,
    cashBalanceId,
    amount: Number(amount),
    linkedBudgetingTransactionId: budgetingTx.id,
  })
  return { cashMovement: movement, budgetingTransaction: budgetingTx }
}

// ─── Withdrawal (cash balance → budgeting account) ────────────────────────────

// amount          = amount deducted from the cash balance (cash balance's currency)
// budgetingAmount = amount credited to the budgeting account (may differ when cross-currency)
export function withdrawFromCashBalance({ date, cashBalanceId, amount, budgetingAmount, budgetingAccountId, budgetingEnvelopeId }) {
  const account = getAccounts().find(a => a.id === budgetingAccountId)
  const budgetingTx = createTransaction({
    type: 'income',
    date,
    accountId: budgetingAccountId,
    envelopeId: budgetingEnvelopeId,
    currency: account?.currency,
    amount: Number(budgetingAmount ?? amount),
    note: 'Investment withdrawal',
    linkedFromInvestments: true,
  })
  const movement = addCashMovement({
    type: 'withdrawal',
    date,
    cashBalanceId,
    amount: -Number(amount),
    linkedBudgetingTransactionId: budgetingTx.id,
  })
  return { cashMovement: movement, budgetingTransaction: budgetingTx }
}

// ─── Standalone currency exchange ─────────────────────────────────────────────

// Exchanges sourceAmount from sourceCashBalanceId → targetCashBalanceId at rate.
// targetAmount = sourceAmount * rate. Optional fee in feeCurrency.
// Returns { debitMovement, creditMovement, feeMovement? }
export function exchangeCashBalances({ date, sourceCashBalanceId, sourceAmount, targetCashBalanceId, exchangeRate, feeAmount = 0, feeCashBalanceId = null }) {
  const exchangeId = crypto.randomUUID()
  const targetAmount = Number(sourceAmount) * Number(exchangeRate)

  const debit = addCashMovement({
    type: 'currency-exchange',
    date,
    cashBalanceId: sourceCashBalanceId,
    amount: -Number(sourceAmount),
    linkedExchangeId: exchangeId,
  })
  const credit = addCashMovement({
    type: 'currency-exchange',
    date,
    cashBalanceId: targetCashBalanceId,
    amount: targetAmount,
    linkedExchangeId: exchangeId,
  })
  let feeMovement = null
  if (feeAmount && feeAmount > 0 && feeCashBalanceId) {
    feeMovement = addCashMovement({
      type: 'exchange-fee',
      date,
      cashBalanceId: feeCashBalanceId,
      amount: -Number(feeAmount),
      linkedExchangeId: exchangeId,
    })
  }
  return { debitMovement: debit, creditMovement: credit, feeMovement }
}

// ─── Portability helpers ──────────────────────────────────────────────────────

export function exportInvestingData() {
  return {
    investingAccounts: load(KEY_ACCOUNTS),
    cashBalances: load(KEY_BALANCES),
    cashMovements: load(KEY_MOVEMENTS),
  }
}

export function importInvestingData({ investingAccounts = [], cashBalances = [], cashMovements = [] }) {
  save(KEY_ACCOUNTS, investingAccounts)
  save(KEY_BALANCES, cashBalances)
  save(KEY_MOVEMENTS, cashMovements)
}
