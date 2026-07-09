import appStorage from '../utils/appStorage'

const KEY = 'rmoney_accounts'

function load() {
  try {
    return JSON.parse(appStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

function save(accounts) {
  appStorage.setItem(KEY, JSON.stringify(accounts))
}

function sortAlpha(items) {
  return [...items].sort((a, b) => a.accountName.localeCompare(b.accountName))
}

function generateId() {
  return crypto.randomUUID()
}

export function getAccounts() {
  return sortAlpha(load())
}

export function getActiveAccounts() {
  return sortAlpha(load().filter(a => !a.isArchived))
}

// Whether an account's balance counts toward envelope budgeting (SPEC-038).
// The flag is additive: records without it are tracked (legacy behaviour).
export function isAccountTracked(account) {
  return account?.countedInEnvelopes !== false
}

export function createAccount({ type, companyName, accountName, currency, startingBalance, countedInEnvelopes }) {
  const accounts = load()
  const account = {
    id: generateId(),
    type,
    companyName,
    accountName,
    currency,
    startingBalance: Number(startingBalance),
    countedInEnvelopes: countedInEnvelopes !== false,   // default true (SPEC-038, Phase 56a)
    isArchived: false,
    createdAt: new Date().toISOString(),
  }
  save([...accounts, account])
  return account
}

export function updateAccount(id, fields) {
  const accounts = load()
  const updated = accounts.map(a => a.id === id ? { ...a, ...fields } : a)
  save(updated)
}

export function archiveAccount(id) {
  updateAccount(id, { isArchived: true })
}

export function unarchiveAccount(id) {
  updateAccount(id, { isArchived: false })
}

export function deleteAccount(id) {
  const accounts = load()
  save(accounts.filter(a => a.id !== id))
}
